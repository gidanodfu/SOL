<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\ActividadModel;
use App\Validation\Validador;
use CodeIgniter\HTTP\Files\UploadedFile;

/**
 * Ferias, eventos, talleres y capacitaciones (RF-44..RF-47). Una sola entidad
 * "actividades" diferenciada por tipo. Estados: programado → en_curso →
 * finalizado; cancelado es reabrible.
 */
class ActividadService
{
    public const TIPOS = ['feria_empleo', 'evento', 'taller', 'capacitacion'];

    public const MODALIDADES = ['presencial', 'virtual', 'mixta'];

    private const IMAGEN_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

    private const IMAGEN_EXTENSIONES = ['jpg', 'jpeg', 'png', 'webp'];

    private const IMAGEN_TAMANO_MAXIMO = 2 * 1024 * 1024;

    private const TRANSICIONES = [
        'programado' => ['en_curso', 'finalizado', 'cancelado'],
        'en_curso'   => ['finalizado', 'cancelado'],
        'cancelado'  => ['programado'],
        'finalizado' => [],
    ];

    private ActividadModel $actividades;

    private HtmlSanitizer $html;

    private StorageService $storage;

    public function __construct(?ActividadModel $actividades = null, ?HtmlSanitizer $html = null, ?StorageService $storage = null)
    {
        $this->actividades = $actividades ?? model(ActividadModel::class);
        $this->html        = $html ?? new HtmlSanitizer();
        $this->storage     = $storage ?? new StorageService();
    }

    /**
     * @param array<string, mixed> $filtros
     *
     * @return list<array<string, mixed>>
     */
    public function listar(array $filtros = [], bool $soloPublicas = false): array
    {
        $builder = $this->actividades->db->table('actividades');

        if ($soloPublicas) {
            // Una actividad vencida no se publica aunque su estado persistido
            // siga siendo programado o en_curso. El límite es inclusivo hasta
            // el instante anterior a fecha_fin (a igualdad ya está vencida).
            $builder->whereIn('estado', ['programado', 'en_curso'])
                ->groupStart()
                    ->where('fecha_fin IS NULL')
                    ->orWhere('fecha_fin >', self::ahora())
                ->groupEnd();
        } elseif (! empty($filtros['tipo'])) {
            $builder->where('tipo', $filtros['tipo']);
        }

        $filas = $builder->orderBy('fecha_inicio', 'DESC')->limit(200)->get()->getResultArray();
        $filas = array_map([$this, 'conImagenPublica'], $filas);

        if (! $soloPublicas && ! empty($filtros['estado'])) {
            // El filtro administrativo usa el estado efectivo. Así una
            // actividad en_curso vencida aparece en Finalizadas, no en En curso.
            $filas = array_values(array_filter(
                $filas,
                static fn (array $fila): bool => $fila['estado_efectivo'] === $filtros['estado'],
            ));
        }

        return $filas;
    }

    /**
     * Expone una URL pública de la imagen (si existe) y oculta la key interna.
     *
     * @param array<string, mixed> $fila
     *
     * @return array<string, mixed>
     */
    private function conImagenPublica(array $fila): array
    {
        $tiene = ! empty($fila['imagen_key']);
        $fila['imagen_url'] = $tiene ? '/api/actividades/' . $fila['id'] . '/imagen' : null;
        $fila['estado_efectivo'] = self::estadoEfectivo($fila);
        unset($fila['imagen_key']);

        return $fila;
    }

    /**
     * Una actividad está vencida cuando existe una fecha de fin y el instante
     * actual ya la alcanzó. Sin fecha de fin no se inventa un vencimiento: la
     * actividad depende exclusivamente de su estado manual.
     *
     * Se usa la zona horaria de la aplicación, no la del sistema operativo ni
     * una función de fecha de MySQL. Esto evita que una consulta SQL y una
     * validación PHP difieran alrededor de medianoche.
     */
    public static function vencida(?string $fechaFin, ?string $ahora = null): bool
    {
        return self::fechaAlcanzada($fechaFin, $ahora);
    }

    /**
     * `estado_efectivo` deriva el estado mostrado sin reescribir el ENUM:
     * una actividad programada cuyo inicio ya llegó se muestra en curso, y una
     * actividad en curso/programada con fecha de fin alcanzada se muestra
     * finalizada. Los estados manuales terminales/cancelados no se alteran.
     *
     * @param array<string, mixed> $fila
     */
    public static function estadoEfectivo(array $fila, ?string $ahora = null): string
    {
        $estado = (string) ($fila['estado'] ?? '');

        if (! in_array($estado, ['programado', 'en_curso'], true)) {
            return $estado;
        }

        if (self::vencida($fila['fecha_fin'] ?? null, $ahora)) {
            return 'finalizado';
        }

        if (self::fechaAlcanzada($fila['fecha_inicio'] ?? null, $ahora)) {
            return 'en_curso';
        }

        return 'programado';
    }

    private static function fechaAlcanzada(?string $fecha, ?string $ahora = null): bool
    {
        $fecha = $fecha !== null ? trim($fecha) : '';
        if ($fecha === '') {
            return false;
        }

        $zona = self::zonaHoraria();
        try {
            $objetivo = new \DateTimeImmutable($fecha, $zona);
            $referencia = $ahora !== null
                ? new \DateTimeImmutable($ahora, $zona)
                : new \DateTimeImmutable('now', $zona);
        } catch (\Throwable) {
            // Una fecha corrupta no debe seguir publicando la actividad.
            return true;
        }

        return $referencia >= $objetivo;
    }

    private static function ahora(): string
    {
        return (new \DateTimeImmutable('now', self::zonaHoraria()))->format('Y-m-d H:i:s');
    }

    private static function zonaHoraria(): \DateTimeZone
    {
        $configurada = config('App')->appTimezone ?? date_default_timezone_get();

        try {
            return new \DateTimeZone($configurada);
        } catch (\Throwable) {
            return new \DateTimeZone(date_default_timezone_get());
        }
    }

    /**
     * Sube (o reemplaza) la imagen de una actividad. Valida tipo real, extensión
     * y tamaño; el nombre de objeto lo genera el servidor.
     */
    public function subirImagen(int $id, UploadedFile $archivo): string
    {
        $actividad = $this->exigir($id);
        $this->validarImagen($archivo);

        $extension = strtolower((string) $archivo->getClientExtension());
        $objectKey = 'actividades/' . $id . '/' . bin2hex(random_bytes(8)) . '.' . $extension;

        $contenido = (string) file_get_contents($archivo->getTempName());
        $this->storage->almacenarContenido($objectKey, $contenido, (string) $archivo->getMimeType());

        $anterior = $actividad['imagen_key'] ?? null;
        $this->actividades->update($id, ['imagen_key' => $objectKey]);

        if ($anterior && $anterior !== $objectKey) {
            $this->storage->eliminar($anterior);
        }

        return $objectKey;
    }

    public function eliminarImagen(int $id): void
    {
        $actividad = $this->exigir($id);
        $key = $actividad['imagen_key'] ?? null;
        if ($key) {
            $this->storage->eliminar($key);
        }
        $this->actividades->update($id, ['imagen_key' => null]);
    }

    /**
     * Contenido de la imagen para el proxy público. Null si la actividad no
     * tiene imagen o el objeto ya no existe.
     *
     * @return array{mime: string, contenido: string}|null
     */
    public function imagenContenido(int $id): ?array
    {
        $actividad = $this->exigir($id);
        $key = $actividad['imagen_key'] ?? null;
        if (! $key) {
            return null;
        }

        $contenido = $this->storage->obtenerContenido($key);
        if ($contenido === null) {
            return null;
        }

        return ['mime' => $this->mimeDeImagen($key), 'contenido' => $contenido];
    }

    private function validarImagen(UploadedFile $archivo): void
    {
        if (! $archivo->isValid()) {
            throw ApiException::badRequest('La imagen no se recibió correctamente.');
        }
        if ((int) $archivo->getSize() > self::IMAGEN_TAMANO_MAXIMO) {
            throw ApiException::validacion('La imagen supera el tamaño máximo de 2 MB.', ['La imagen supera el tamaño máximo de 2 MB.']);
        }

        $extension = strtolower((string) $archivo->getClientExtension());
        if (! in_array($extension, self::IMAGEN_EXTENSIONES, true)) {
            throw ApiException::validacion('Solo se permiten imágenes JPG, PNG o WEBP.', ['Solo se permiten imágenes JPG, PNG o WEBP.']);
        }
        // MIME real (finfo) + verificación de bytes mágicos: no se confía en el
        // nombre ni en el content-type enviados por el cliente.
        if (! in_array((string) $archivo->getMimeType(), self::IMAGEN_MIMES, true)) {
            throw ApiException::validacion('El tipo de la imagen no es válido.', ['El tipo de la imagen no es válido.']);
        }
        $inicio = (string) @file_get_contents($archivo->getTempName(), false, null, 0, 12);
        if (! $this->esImagenReal($inicio)) {
            throw ApiException::validacion('El archivo no es una imagen válida.', ['El archivo no es una imagen válida.']);
        }

        // Los bytes mágicos no bastan: con GD se comprueba que el contenido
        // completo sea decodificable y corresponda a un formato raster admitido.
        $contenido = (string) file_get_contents($archivo->getTempName());
        $info = @getimagesizefromstring($contenido);
        if ($info === false || ! in_array($info[2] ?? null, [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
            throw ApiException::validacion('El archivo no es una imagen válida.', ['El archivo no es una imagen válida.']);
        }
        $imagen = @imagecreatefromstring($contenido);
        if ($imagen === false) {
            throw ApiException::validacion('El archivo no es una imagen válida.', ['El archivo no es una imagen válida.']);
        }
        imagedestroy($imagen);
    }

    private function esImagenReal(string $bytes): bool
    {
        return substr($bytes, 0, 3) === "\xFF\xD8\xFF"
            || substr($bytes, 0, 8) === "\x89PNG\r\n\x1a\n"
            || (substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP');
    }

    private function mimeDeImagen(string $key): string
    {
        return match (strtolower(pathinfo($key, PATHINFO_EXTENSION))) {
            'png'  => 'image/png',
            'webp' => 'image/webp',
            default => 'image/jpeg',
        };
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function crear(array $datos): int
    {
        $datos = $this->validar($datos);
        $this->actividades->insert($datos);

        return (int) $this->actividades->getInsertID();
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function actualizar(int $id, array $datos): void
    {
        $this->exigir($id);
        $this->actividades->update($id, $this->validar($datos));
    }

    public function cambiarEstado(int $id, string $estado): void
    {
        // Serializa transiciones concurrentes de la misma actividad: dos
        // peticiones no deben leer el mismo estado y aplicar transiciones
        // incompatibles (por ejemplo finalizar y cancelar a la vez).
        $db = $this->actividades->db;
        $db->transBegin();

        try {
            $actividad = $this->exigirBloqueada($id);
            $permitidos = self::TRANSICIONES[$actividad['estado']] ?? [];
            if (! in_array($estado, $permitidos, true)) {
                throw ApiException::conflicto("No puede pasar de \"{$actividad['estado']}\" a \"{$estado}\".");
            }

            $this->actividades->update($id, ['estado' => $estado]);

            if (! $db->transStatus()) {
                throw ApiException::conflicto('No se pudo actualizar el estado de la actividad.');
            }

            $db->transCommit();
        } catch (\Throwable $e) {
            $db->transRollback();

            throw $e;
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function validar(array $datos): array
    {
        // Descripción con editor enriquecido: HTML saneado y límite sobre el
        // texto visible (10.000), no sobre las etiquetas.
        $datos['descripcion'] = $this->html->limpiar($datos['descripcion'] ?? null);

        // Si el contenido del editor incluye una URL y el campo "enlace" viene
        // vacío, se promueve la primera URL válida al campo y se ELIMINA solo esa
        // URL del contenido (el resto se conserva). Un valor manual introducido
        // por el administrador SIEMPRE tiene prioridad (no se toca el contenido).
        if (empty($datos['enlace'])) {
            $urls = $this->html->extraerUrls($datos['descripcion'] ?? null);
            if (! empty($urls[0])) {
                $datos['enlace'] = $urls[0];
                $datos['descripcion'] = $this->html->limpiar($this->html->removerUrl($datos['descripcion'], $urls[0]));
            }
        }

        Validador::validar($datos, [
            'tipo'         => ['required', 'enum:' . implode(',', self::TIPOS)],
            'nombre'       => ['required', 'max:200'],
            'descripcion'  => ['texto_max:10000'],
            'lugar'        => ['max:150'],
            'organizador'  => ['max:150'],
            'enlace'       => ['max:300'],
            'modalidad'    => ['enum:' . implode(',', self::MODALIDADES)],
            'fecha_inicio' => ['required', 'fecha_hora'],
            'fecha_fin'    => ['fecha_hora'],
        ]);

        $inicio = $datos['fecha_inicio'];
        $fin    = $datos['fecha_fin'] ?? null;
        if ($fin && strtotime($fin) < strtotime($inicio)) {
            throw ApiException::validacion('La fecha de fin no puede ser anterior al inicio.', ['La fecha de fin no puede ser anterior al inicio.']);
        }

        // El enlace se muestra como href en el panel municipal: solo http(s).
        // FILTER_VALIDATE_URL por sí solo acepta esquemas peligrosos (javascript:).
        $enlace = $datos['enlace'] ?? null;
        if ($enlace !== null && $enlace !== '') {
            $esquema = strtolower((string) parse_url((string) $enlace, PHP_URL_SCHEME));
            if (! in_array($esquema, ['http', 'https'], true) || ! filter_var($enlace, FILTER_VALIDATE_URL)) {
                throw ApiException::validacion('El enlace debe ser una URL http(s) válida.', ['El enlace debe ser una URL http(s) válida.']);
            }
        }

        return [
            'tipo'        => $datos['tipo'],
            'nombre'      => $datos['nombre'],
            'descripcion' => $datos['descripcion'] ?? null,
            'fecha_inicio' => $this->normalizar($inicio),
            'fecha_fin'   => $fin ? $this->normalizar($fin) : null,
            'lugar'       => $datos['lugar'] ?? null,
            'modalidad'   => $datos['modalidad'] ?? null,
            'organizador' => $datos['organizador'] ?? null,
            'enlace'      => $enlace ?: null,
        ];
    }

    private function normalizar(string $fecha): string
    {
        return strlen($fecha) === 10 ? $fecha . ' 08:00:00' : $fecha;
    }

    /**
     * @return array<string, mixed>
     */
    private function exigir(int $id): array
    {
        $fila = $this->actividades->find($id);
        if ($fila === null) {
            throw ApiException::noEncontrado('La actividad no existe.');
        }

        return $fila;
    }

    /**
     * @return array<string, mixed>
     */
    private function exigirBloqueada(int $id): array
    {
        $fila = $this->actividades->db
            ->query('SELECT * FROM actividades WHERE id = ? FOR UPDATE', [$id])
            ->getRowArray();

        if ($fila === null) {
            throw ApiException::noEncontrado('La actividad no existe.');
        }

        return $fila;
    }
}
