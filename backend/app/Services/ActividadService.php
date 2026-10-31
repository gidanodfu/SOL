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

    /** Resolución máxima admitida para la imagen de una actividad. */
    private const IMAGEN_ANCHO_MAXIMO = 1920;

    private const IMAGEN_ALTO_MAXIMO = 1080;

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
        $imagen    = $this->validarImagen($archivo);

        $objectKey = 'actividades/' . $id . '/' . bin2hex(random_bytes(8)) . '.' . $imagen['extension'];

        $this->storage->almacenarContenido($objectKey, $imagen['contenido'], $imagen['mime']);

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

    /**
     * @return array{extension: string, mime: string, contenido: string}
     */
    protected function validarImagen(UploadedFile $archivo): array
    {
        if (! $archivo->isValid()) {
            $mensaje = $archivo->getError() === UPLOAD_ERR_NO_FILE
                ? 'Debes subir una imagen para la actividad.'
                : 'La imagen no se recibió correctamente.';

            throw $this->errorImagen($mensaje);
        }

        $tamano = (int) $archivo->getSize();
        if ($tamano <= 0) {
            throw $this->errorImagen('La imagen está vacía.');
        }
        if ($tamano > self::IMAGEN_TAMANO_MAXIMO) {
            throw $this->errorImagen('La imagen supera el tamaño máximo de 2 MB.');
        }

        // La extensión declarada solo filtra la intención del usuario; la
        // autoridad es el contenido real (finfo, bytes mágicos y GD).
        $extension = strtolower((string) $archivo->getClientExtension());
        if (! in_array($extension, self::IMAGEN_EXTENSIONES, true)) {
            throw $this->errorImagen('Solo se permiten imágenes JPG, PNG o WEBP.');
        }
        // MIME real (finfo) + verificación de bytes mágicos: no se confía en el
        // nombre ni en el content-type enviados por el cliente.
        if (! in_array((string) $archivo->getMimeType(), self::IMAGEN_MIMES, true)) {
            throw $this->errorImagen('El tipo de la imagen no es válido.');
        }
        $inicio = (string) @file_get_contents($archivo->getTempName(), false, null, 0, 12);
        if (! $this->esImagenReal($inicio)) {
            throw $this->errorImagen('El archivo no es una imagen válida.');
        }

        // Los bytes mágicos no bastan: con GD se comprueba que el contenido
        // completo sea decodificable y corresponda a un formato raster admitido.
        $contenido = (string) file_get_contents($archivo->getTempName());
        $info = @getimagesizefromstring($contenido);
        if ($info === false || ! in_array($info[2] ?? null, [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
            throw $this->errorImagen('El archivo no es una imagen válida.');
        }

        [$ancho, $alto] = $info;
        if ($ancho <= 0 || $alto <= 0) {
            throw $this->errorImagen('Las dimensiones de la imagen no son válidas.');
        }
        if ($ancho > self::IMAGEN_ANCHO_MAXIMO || $alto > self::IMAGEN_ALTO_MAXIMO) {
            throw $this->errorImagen('La imagen supera la resolución máxima de 1920 × 1080 px.');
        }

        $imagen = @imagecreatefromstring($contenido);
        if ($imagen === false) {
            throw $this->errorImagen('El archivo no es una imagen válida.');
        }
        imagedestroy($imagen);

        // Extensión y MIME canónicos derivados del tipo real, no del nombre.
        [$extensionCanonica, $mime] = match ($info[2]) {
            IMAGETYPE_JPEG => ['jpg', 'image/jpeg'],
            IMAGETYPE_PNG  => ['png', 'image/png'],
            IMAGETYPE_WEBP => ['webp', 'image/webp'],
        };

        return ['extension' => $extensionCanonica, 'mime' => $mime, 'contenido' => $contenido];
    }

    private function errorImagen(string $mensaje): ApiException
    {
        return ApiException::validacion($mensaje, [$mensaje], ['imagen' => $mensaje]);
    }

    /**
     * Exige una imagen válida para crear una actividad.
     *
     * @return array{extension: string, mime: string, contenido: string}
     */
    protected function exigirImagen(?UploadedFile $archivo): array
    {
        if ($archivo === null) {
            throw $this->errorImagen('Debes subir una imagen para la actividad.');
        }

        return $this->validarImagen($archivo);
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
     * Crea una actividad completa. La imagen es obligatoria y se valida antes
     * de cualquier escritura. La actividad y su imagen se confirman en una sola
     * transacción; si algo falla, no queda registro ni archivo huérfano.
     *
     * @param array<string, mixed> $datos
     */
    public function crear(array $datos, ?UploadedFile $imagen = null): int
    {
        $datos = $this->validar($datos, 'No se pudo registrar la actividad.');
        $archivo = $this->exigirImagen($imagen);

        $db = $this->actividades->db;
        $db->transBegin();
        $objectKey = null;

        try {
            $this->actividades->insert($datos);
            $id = (int) $this->actividades->getInsertID();
            if ($id <= 0 || ! $db->transStatus()) {
                throw ApiException::conflicto('No se pudo registrar la actividad.');
            }

            $objectKey = 'actividades/' . $id . '/' . bin2hex(random_bytes(8)) . '.' . $archivo['extension'];
            $this->storage->almacenarContenido($objectKey, $archivo['contenido'], $archivo['mime']);

            $this->actividades->update($id, ['imagen_key' => $objectKey]);
            if (! $db->transStatus()) {
                throw ApiException::conflicto('No se pudo registrar la actividad.');
            }

            if (! $db->transCommit()) {
                throw ApiException::conflicto('No se pudo registrar la actividad.');
            }

            return $id;
        } catch (\Throwable $e) {
            $db->transRollback();

            if ($objectKey !== null) {
                try {
                    $this->storage->eliminar($objectKey);
                } catch (\Throwable) {
                    // La compensación es best-effort: el error original manda.
                }
            }

            throw $e;
        }
    }

    /**
     * Actualiza una actividad. La imagen se conserva; si se reemplaza, se usa
     * el endpoint dedicado `POST /admin/actividades/{id}/imagen`, que valida el
     * archivo nuevo antes de sustituirlo.
     *
     * @param array<string, mixed> $datos
     */
    public function actualizar(int $id, array $datos): void
    {
        $this->exigir($id);
        $limpio = $this->validar($datos, 'No se pudo actualizar la actividad.');

        if (! $this->actividades->update($id, $limpio)) {
            throw ApiException::conflicto('No se pudo actualizar la actividad.');
        }
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
     * Valida y normaliza todos los campos de una actividad. Devuelve un mapa
     * campo => mensaje (422) para que el frontend pueda señalar cada control.
     *
     * @param array<string, mixed> $datos
     *
     * @return array<string, mixed>
     */
    protected function validar(array $datos, string $mensaje = 'No se pudo guardar la actividad.'): array
    {
        $errores = [];

        // Descripción con editor enriquecido: HTML saneado y límite sobre el
        // texto visible (10.000), no sobre las etiquetas.
        $descripcion        = null;
        $descripcionError   = null;
        $descripcionEntrada = $datos['descripcion'] ?? null;
        if (! is_string($descripcionEntrada)) {
            $descripcionEntrada = null;
        }
        try {
            $descripcion = $this->html->limpiar($descripcionEntrada);
        } catch (\Throwable) {
            // Entrada desproporcionada: se rechaza como validación, no como 500.
            $descripcionError = 'La descripción de la actividad es demasiado larga.';
        }

        // Si el contenido del editor incluye una URL y el campo "enlace" viene
        // vacío, se promueve la primera URL válida al campo y se ELIMINA solo esa
        // URL del contenido (el resto se conserva). Un valor manual introducido
        // por el administrador SIEMPRE tiene prioridad (no se toca el contenido).
        $enlace = $this->texto($datos['enlace'] ?? null);
        if ($enlace === '') {
            $urls = $this->html->extraerUrls($descripcion);
            if (! empty($urls[0])) {
                $enlace      = $urls[0];
                $descripcion = $this->html->limpiar($this->html->removerUrl($descripcion, $urls[0]));
            }
        }

        $tipo = $this->texto($datos['tipo'] ?? null);
        if ($tipo === '') {
            $errores['tipo'] = 'Selecciona el tipo de actividad.';
        } elseif (! in_array($tipo, self::TIPOS, true)) {
            $errores['tipo'] = 'Selecciona un tipo de actividad válido.';
        }

        $nombre = $this->textoNormalizado($datos['nombre'] ?? null);
        if ($nombre === '') {
            $errores['nombre'] = 'El nombre de la actividad es obligatorio.';
        } elseif (mb_strlen($nombre) > 200) {
            $errores['nombre'] = 'El nombre de la actividad no debe superar 200 caracteres.';
        }

        $inicio = $this->texto($datos['fecha_inicio'] ?? null);
        $inicioValido = $inicio !== '' && Validador::esFechaHora($inicio);
        if ($inicio === '') {
            $errores['fecha_inicio'] = 'Indica la fecha y hora de inicio.';
        } elseif (! $inicioValido) {
            $errores['fecha_inicio'] = 'Indica una fecha y hora de inicio válidas.';
        }

        $fin = $this->texto($datos['fecha_fin'] ?? null);
        $finValido = $fin !== '' && Validador::esFechaHora($fin);
        if ($fin === '') {
            $errores['fecha_fin'] = 'Indica la fecha y hora de finalización.';
        } elseif (! $finValido) {
            $errores['fecha_fin'] = 'Indica una fecha y hora de finalización válidas.';
        } elseif ($inicioValido && strtotime($fin) < strtotime($inicio)) {
            $errores['fecha_fin'] = 'La fecha de finalización no puede ser anterior a la fecha de inicio.';
        }

        $modalidad = $this->texto($datos['modalidad'] ?? null);
        if ($modalidad === '') {
            $errores['modalidad'] = 'Selecciona una modalidad.';
        } elseif (! in_array($modalidad, self::MODALIDADES, true)) {
            $errores['modalidad'] = 'Selecciona una modalidad válida.';
        }

        $lugar = $this->textoNormalizado($datos['lugar'] ?? null);
        if ($lugar === '') {
            $errores['lugar'] = 'El lugar de realización es obligatorio.';
        } elseif (mb_strlen($lugar) > 150) {
            $errores['lugar'] = 'El lugar de realización no debe superar 150 caracteres.';
        }

        $organizador = $this->textoNormalizado($datos['organizador'] ?? null);
        if ($organizador === '') {
            $errores['organizador'] = 'Indica quién organiza la actividad.';
        } elseif (mb_strlen($organizador) > 150) {
            $errores['organizador'] = 'El organizador no debe superar 150 caracteres.';
        }

        if ($descripcionError !== null) {
            $errores['descripcion'] = $descripcionError;
        } elseif ($descripcion === null) {
            $errores['descripcion'] = 'La descripción de la actividad es obligatoria.';
        } elseif (Validador::longitudTexto($descripcion) > 10000) {
            $errores['descripcion'] = 'La descripción de la actividad no debe superar 10.000 caracteres de texto.';
        }

        // El enlace se muestra como href en el panel municipal: solo http(s).
        // FILTER_VALIDATE_URL por sí solo acepta esquemas peligrosos (javascript:).
        if ($enlace !== '') {
            $esquema = strtolower((string) parse_url($enlace, PHP_URL_SCHEME));
            if (! in_array($esquema, ['http', 'https'], true) || ! filter_var($enlace, FILTER_VALIDATE_URL)) {
                $errores['enlace'] = 'El enlace debe ser una URL http(s) válida.';
            } elseif (mb_strlen($enlace) > 300) {
                $errores['enlace'] = 'El enlace no debe superar 300 caracteres.';
            }
        }

        if ($errores !== []) {
            throw ApiException::validacion($mensaje, array_values($errores), $errores);
        }

        return [
            'tipo'         => $tipo,
            'nombre'       => $nombre,
            'descripcion'  => $descripcion,
            'fecha_inicio' => $this->normalizar($inicio),
            'fecha_fin'    => $this->normalizar($fin),
            'lugar'        => $lugar,
            'modalidad'    => $modalidad,
            'organizador'  => $organizador,
            'enlace'       => $enlace !== '' ? $enlace : null,
        ];
    }

    private function texto($valor): string
    {
        return is_scalar($valor) ? trim((string) $valor) : '';
    }

    private function textoNormalizado($valor): string
    {
        $texto = $this->texto($valor);

        return $texto === '' ? '' : (string) preg_replace('/\s+/u', ' ', $texto);
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
