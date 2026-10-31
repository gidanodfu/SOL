<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\OportunidadModel;
use App\Validation\Validador;

/**
 * Oportunidades de difusión externa (RF-48..RF-51): Empleos Perú, MYPE locales y
 * otras fuentes. Cada oportunidad identifica su fuente. La desactivación conserva
 * el registro (RN-12).
 */
class OportunidadService
{
    public const FUENTES = ['empleos_peru', 'mype_local', 'otro'];

    private OportunidadModel $oportunidades;

    public function __construct(?OportunidadModel $oportunidades = null)
    {
        $this->oportunidades = $oportunidades ?? model(OportunidadModel::class);
    }

    /**
     * @param array<string, mixed> $filtros
     *
     * @return list<array<string, mixed>>
     */
    public function listar(array $filtros): array
    {
        $builder = $this->oportunidades->db->table('oportunidades o')
            ->select('o.*, e.razon_social, e.ruc')
            ->join('empresas e', 'e.id = o.empresa_id', 'LEFT');

        if (! empty($filtros['fuente'])) {
            $builder->where('o.fuente', $filtros['fuente']);
        }
        if (isset($filtros['activo']) && $filtros['activo'] !== '') {
            $builder->where('o.activo', (int) $filtros['activo']);
        }

        $filas = $builder->orderBy('o.created_at', 'DESC')->limit(300)->get()->getResultArray();

        return array_map([$this, 'conEstadoPublicacion'], $filas);
    }

    /**
     * Oportunidades activas y ya alcanzadas por su fecha para difusión a los
     * ciudadanos (RF-48). La publicación es programada por día (fecha_publicacion);
     * no hay cron: la visibilidad se calcula al leer.
     *
     * @return list<array<string, mixed>>
     */
    public function publicas(): array
    {
        $filas = $this->oportunidades->db->table('oportunidades o')
            ->select('o.*, e.razon_social')
            ->join('empresas e', 'e.id = o.empresa_id', 'LEFT')
            ->where('o.activo', 1)
            ->where('o.fecha_publicacion <=', date('Y-m-d'))
            ->orderBy('o.created_at', 'DESC')
            ->limit(200)
            ->get()
            ->getResultArray();

        return array_map([$this, 'conEstadoPublicacion'], $filas);
    }

    /**
     * Estado de publicación derivado (no se persiste): oculta si está desactivada;
     * programada si su fecha aún no llega; visible si ya puede mostrarse.
     *
     * @param array<string, mixed> $fila
     *
     * @return array<string, mixed>
     */
    private function conEstadoPublicacion(array $fila): array
    {
        $fecha  = $fila['fecha_publicacion'] ?? null;
        $futura = $fecha !== null && $fecha !== '' && $fecha > date('Y-m-d');
        $fila['estado_publicacion'] = ((int) ($fila['activo'] ?? 0)) === 0
            ? 'oculta'
            : ($futura ? 'programada' : 'visible');

        return $fila;
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function crear(array $datos): int
    {
        $datos = $this->validar($datos, true);
        // Una oportunidad nueva nace activa; la activación se gestiona aparte.
        $datos['activo'] = 1;
        $this->oportunidades->insert($datos);

        return (int) $this->oportunidades->getInsertID();
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function actualizar(int $id, array $datos): void
    {
        // Editar no cambia la activación: una oportunidad desactivada sigue
        // desactivada hasta que se active explícitamente (no se republica sola).
        $this->exigir($id);
        $this->oportunidades->update($id, $this->validar($datos));
    }

    public function cambiarActivacion(int $id, bool $activo): void
    {
        $this->exigir($id);
        $this->oportunidades->update($id, ['activo' => (int) $activo]);
    }

    /**
     * @param array<string, mixed> $datos
     *
     * @return array<string, mixed>
     */
    protected function validar(array $datos, bool $esCreacion = false): array
    {
        if ($esCreacion) {
            $this->validarCreacion($datos);

            // Normaliza solo la creación; la edición conserva su contrato.
            $datos['fuente']            = trim((string) $datos['fuente']);
            $datos['titulo']            = trim((string) $datos['titulo']);
            $datos['enlace']            = trim((string) $datos['enlace']);
            $datos['fecha_publicacion'] = trim((string) $datos['fecha_publicacion']);
            $datos['descripcion']       = trim((string) $datos['descripcion']);
        } else {
            Validador::validar($datos, [
                'fuente'     => ['required', 'enum:' . implode(',', self::FUENTES)],
                'titulo'     => ['required', 'max:200'],
                'descripcion' => ['max:10000'],
                'enlace'     => ['max:300'],
                'fecha_publicacion' => ['fecha'],
                'empresa_id' => ['regex:/^\d+$/'],
            ]);
        }

        // El enlace se renderiza como href en el portal público: solo http(s).
        // FILTER_VALIDATE_URL por sí solo acepta esquemas peligrosos (javascript:).
        $enlace = $datos['enlace'] ?? null;
        if ($enlace !== null && $enlace !== '') {
            $esquema = strtolower((string) parse_url((string) $enlace, PHP_URL_SCHEME));
            if (! in_array($esquema, ['http', 'https'], true) || ! filter_var($enlace, FILTER_VALIDATE_URL)) {
                throw ApiException::validacion(
                    'El enlace debe ser una URL http(s) válida.',
                    ['El enlace debe ser una URL http(s) válida.'],
                    ['enlace' => 'Introduce una URL válida.'],
                );
            }
        }

        $empresaId = $datos['empresa_id'] ?? null;
        if ($empresaId !== null && $empresaId !== '') {
            $existe = $this->oportunidades->db->table('empresas')->where('id', (int) $empresaId)->countAllResults();
            if (! $existe) {
                throw ApiException::validacion('La empresa indicada no existe.', ['La empresa indicada no existe.']);
            }
        }

        return [
            'fuente'            => $datos['fuente'],
            'empresa_id'        => $empresaId ? (int) $empresaId : null,
            'titulo'            => $datos['titulo'],
            'descripcion'       => $datos['descripcion'] ?? null,
            'enlace'            => $enlace ?: null,
            // La fecha vacía no debe guardarse: usa la fecha de hoy.
            'fecha_publicacion' => ($datos['fecha_publicacion'] ?? '') !== '' ? $datos['fecha_publicacion'] : date('Y-m-d'),
        ];
    }

    /**
     * Reglas de obligatoriedad exclusivas de la creación de oportunidades.
     * Los mensajes se devuelven en `campos` para que el formulario los muestre
     * bajo cada control.
     *
     * @param array<string, mixed> $datos
     */
    protected function validarCreacion(array $datos): void
    {
        $errores = [];

        $fuente = is_scalar($datos['fuente'] ?? null) ? trim((string) $datos['fuente']) : '';
        if (! in_array($fuente, self::FUENTES, true)) {
            $errores['fuente'] = 'Selecciona una fuente válida.';
        }

        $titulo = is_scalar($datos['titulo'] ?? null) ? trim((string) $datos['titulo']) : '';
        if ($titulo === '') {
            $errores['titulo'] = 'El título de la oportunidad es obligatorio.';
        } elseif (mb_strlen($titulo) > 200) {
            $errores['titulo'] = 'El título no debe superar 200 caracteres.';
        }

        $enlace = is_scalar($datos['enlace'] ?? null) ? trim((string) $datos['enlace']) : '';
        if ($enlace === '' || mb_strlen($enlace) > 300 || ! $this->esUrlSegura($enlace)) {
            $errores['enlace'] = 'Introduce una URL válida.';
        }

        $fecha = is_scalar($datos['fecha_publicacion'] ?? null) ? trim((string) $datos['fecha_publicacion']) : '';
        if ($fecha === '') {
            $errores['fecha_publicacion'] = 'La fecha de publicación es obligatoria.';
        } elseif (! Validador::esFecha($fecha)) {
            $errores['fecha_publicacion'] = 'La fecha de publicación no es válida.';
        }

        $descripcion = is_scalar($datos['descripcion'] ?? null) ? trim((string) $datos['descripcion']) : '';
        if (trim(Validador::textoVisible($descripcion)) === '') {
            $errores['descripcion'] = 'La descripción de la oportunidad es obligatoria.';
        } elseif (Validador::longitudTexto($descripcion) > 10000) {
            $errores['descripcion'] = 'La descripción no debe superar 10.000 caracteres.';
        }

        if ($errores !== []) {
            throw ApiException::validacion('Existen campos que requieren atención.', array_values($errores), $errores);
        }
    }

    private function esUrlSegura(string $url): bool
    {
        $esquema = strtolower((string) parse_url($url, PHP_URL_SCHEME));

        return in_array($esquema, ['http', 'https'], true)
            && filter_var($url, FILTER_VALIDATE_URL) !== false;
    }

    /**
     * @return array<string, mixed>
     */
    private function exigir(int $id): array
    {
        $fila = $this->oportunidades->find($id);
        if ($fila === null) {
            throw ApiException::noEncontrado('La oportunidad no existe.');
        }

        return $fila;
    }
}
