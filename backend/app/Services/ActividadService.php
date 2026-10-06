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
            $builder->whereIn('estado', ['programado', 'en_curso']);
        } elseif (! empty($filtros['tipo'])) {
            $builder->where('tipo', $filtros['tipo']);
        }
        if (! empty($filtros['estado'])) {
            $builder->where('estado', $filtros['estado']);
        }

        $filas = $builder->orderBy('fecha_inicio', 'DESC')->limit(200)->get()->getResultArray();

        return array_map([$this, 'conImagenPublica'], $filas);
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
        unset($fila['imagen_key']);

        return $fila;
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
        $actividad = $this->exigir($id);
        $permitidos = self::TRANSICIONES[$actividad['estado']] ?? [];
        if (! in_array($estado, $permitidos, true)) {
            throw ApiException::conflicto("No puede pasar de \"{$actividad['estado']}\" a \"{$estado}\".");
        }

        $this->actividades->update($id, ['estado' => $estado]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validar(array $datos): array
    {
        // Descripción con editor enriquecido: HTML saneado y límite sobre el
        // texto visible (10.000), no sobre las etiquetas.
        $datos['descripcion'] = $this->html->limpiar($datos['descripcion'] ?? null);

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
}
