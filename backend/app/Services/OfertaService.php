<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\OfertaHabilidadModel;
use App\Models\OfertaModel;
use App\Repositories\OfertaRepository;
use App\Validation\Validador;

/**
 * Reglas de negocio de ofertas laborales (RF-22..RF-26, RN-19).
 * La empresa gestiona SOLO sus propias ofertas (RT-05) y las publica
 * directamente sin validación municipal; el admin solo supervisa.
 * Transiciones:
 *   borrador → publicada ; publicada → cerrada.
 * Una oferta publicada sigue siendo editable (se mantiene publicada).
 */
class OfertaService
{
    public const TIPOS_EMPLEO = ['tiempo_completo', 'medio_tiempo', 'por_horas', 'practicas', 'freelance', 'remoto'];

    private const EDITABLE = ['borrador', 'publicada'];

    private OfertaModel $ofertas;

    private OfertaHabilidadModel $habilidades;

    private OfertaRepository $repository;

    private AuditoriaService $auditoria;

    public function __construct(
        ?OfertaModel $ofertas = null,
        ?OfertaHabilidadModel $habilidades = null,
        ?OfertaRepository $repository = null,
        ?AuditoriaService $auditoria = null,
    ) {
        $this->ofertas     = $ofertas ?? model(OfertaModel::class);
        $this->habilidades = $habilidades ?? model(OfertaHabilidadModel::class);
        $this->repository  = $repository ?? new OfertaRepository();
        $this->auditoria   = $auditoria ?? new AuditoriaService();
    }

    /* ----------------------- Búsqueda de postulantes ---------------------- */

    /**
     * Ofertas publicadas vigentes con filtros (RF-27/RF-28).
     *
     * @param array<string, mixed> $filtros
     *
     * @return list<array<string, mixed>>
     */
    public function listarPublicadas(array $filtros): array
    {
        return $this->repository->publicadas(array_filter($filtros, static fn ($v) => $v !== null && $v !== ''));
    }

    /**
     * Detalle público de una oferta publicada (RF-29) + si el postulante ya postuló.
     *
     * @return array<string, mixed>
     */
    public function detallePublica(int $id, ?int $postulanteId = null): array
    {
        $oferta = $this->repository->detalle($id);
        if ($oferta === null || $oferta['estado'] !== 'publicada') {
            throw ApiException::noEncontrado('La oferta no está disponible.');
        }

        if ($postulanteId !== null) {
            $oferta['ya_postule'] = (bool) $this->ofertas->db->table('postulaciones')
                ->where('postulante_id', $postulanteId)
                ->where('oferta_id', $id)
                ->where('activo', 1)
                ->countAllResults();
        }

        return $oferta;
    }

    /* ------------------------- Contexto empresa ------------------------- */

    public function listarMias(int $empresaId): array
    {
        $filas = $this->repository->porEmpresa($empresaId);

        return array_map(fn ($f) => $f + ['habilidades' => $this->habilidades->deOferta((int) $f['id'])], $filas);
    }

    /**
     * @return array<string, mixed>
     */
    public function detallePropia(int $empresaId, int $id): array
    {
        return $this->exigirPropia($empresaId, $id);
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function crear(int $empresaId, array $datos): int
    {
        $datos = $this->validar($datos);

        $this->ofertas->insert([
            'empresa_id'            => $empresaId,
            'categoria_id'          => $datos['categoria_id'] ?? null,
            'puesto'                => $datos['puesto'],
            'descripcion'           => $datos['descripcion'] ?? null,
            'funciones'             => $datos['funciones'] ?? null,
            'requisitos'            => $datos['requisitos'] ?? null,
            'formacion_requerida'   => $datos['formacion_requerida'] ?? null,
            'experiencia_requerida' => $datos['experiencia_requerida'] ?? null,
            'tipo_empleo'           => $datos['tipo_empleo'] ?? null,
            'ubicacion'             => $datos['ubicacion'] ?? null,
            'remuneracion'          => $datos['remuneracion'] ?? null,
            'vacantes'              => $datos['vacantes'],
            'fecha_cierre'          => $datos['fecha_cierre'] ?? null,
            // Las ofertas nacen en borrador y la empresa las publica con el
            // botón "Publicar" (sin pasar por revisión municipal).
            'estado'                => 'borrador',
        ]);
        $id = $this->ofertas->getInsertID();
        $this->habilidades->reemplazar($id, $datos['habilidades'] ?? []);

        return $id;
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function actualizar(int $empresaId, int $id, array $datos): void
    {
        $oferta = $this->exigirPropia($empresaId, $id);

        if (! in_array($oferta['estado'], self::EDITABLE, true)) {
            throw ApiException::conflicto('Solo puede editar ofertas en borrador o publicadas.');
        }

        $datos = $this->validar($datos);
        $this->ofertas->update($id, [
            'categoria_id'          => $datos['categoria_id'] ?? null,
            'puesto'                => $datos['puesto'],
            'descripcion'           => $datos['descripcion'] ?? null,
            'funciones'             => $datos['funciones'] ?? null,
            'requisitos'            => $datos['requisitos'] ?? null,
            'formacion_requerida'   => $datos['formacion_requerida'] ?? null,
            'experiencia_requerida' => $datos['experiencia_requerida'] ?? null,
            'tipo_empleo'           => $datos['tipo_empleo'] ?? null,
            'ubicacion'             => $datos['ubicacion'] ?? null,
            'remuneracion'          => $datos['remuneracion'] ?? null,
            'vacantes'              => $datos['vacantes'],
            'fecha_cierre'          => $datos['fecha_cierre'] ?? null,
            'estado'                => $oferta['estado'],
            'motivo_rechazo'        => null,
        ]);
        $this->habilidades->reemplazar($id, $datos['habilidades'] ?? []);
    }

    /**
     * Publicación directa por la empresa: borrador → publicada (RN-19 ajustado:
     * la oferta no requiere validación municipal previa).
     */
    public function publicar(int $empresaId, int $id): void
    {
        $oferta = $this->exigirPropia($empresaId, $id);

        if ($oferta['estado'] !== 'borrador') {
            throw ApiException::conflicto('Solo puede publicar ofertas en borrador.');
        }

        $this->ofertas->update($id, [
            'estado'            => 'publicada',
            'motivo_rechazo'    => null,
            'fecha_publicacion' => $oferta['fecha_publicacion'] ?? date('Y-m-d'),
        ]);
        $this->auditoria->registrar(
            $this->usuarioDeEmpresa($empresaId),
            'publicar_oferta',
            'oferta',
            $id,
            ['puesto' => $oferta['puesto']],
        );
    }

    public function cerrar(int $empresaId, int $id): void
    {
        $oferta = $this->exigirPropia($empresaId, $id);

        if ($oferta['estado'] !== 'publicada') {
            throw ApiException::conflicto('Solo puede cerrar una oferta publicada.');
        }

        $this->ofertas->update($id, ['estado' => 'cerrada']);
    }

    /**
     * Cierre de una oferta por parte del admin (supervisión sin bloqueo de la
     * publicación; la empresa sigue siendo quien publica).
     */
    public function cerrarComoAdmin(int $adminId, int $id): void
    {
        $oferta = $this->repository->detalle($id);
        if ($oferta === null) {
            throw ApiException::noEncontrado('La oferta no existe.');
        }
        if ($oferta['estado'] !== 'publicada') {
            throw ApiException::conflicto('Solo puede cerrar una oferta publicada.');
        }

        $this->ofertas->update($id, ['estado' => 'cerrada']);
        $this->auditoria->registrar($adminId, 'cerrar_oferta_admin', 'oferta', $id, ['puesto' => $oferta['puesto']]);
    }

    /* ------------------------ Contexto municipal ------------------------ */

    public function listarAdmin(?string $estado = null): array
    {
        $estados = ['borrador', 'publicada', 'cerrada'];
        if ($estado !== null && ! in_array($estado, $estados, true)) {
            throw ApiException::validacion('Estado de oferta no válido.');
        }

        return $this->repository->paraAdmin($estado);
    }

    /**
     * @return array<string, mixed>
     */
    public function detalleAdmin(int $id): array
    {
        $oferta = $this->repository->detalle($id);
        if ($oferta === null) {
            throw ApiException::noEncontrado('La oferta no existe.');
        }

        return $oferta;
    }

    /* ----------------------------- Internos ----------------------------- */

    /**
     * RT-05: la empresa solo accede a sus propias ofertas.
     *
     * @return array<string, mixed>
     */
    private function exigirPropia(int $empresaId, int $id): array
    {
        $fila = $this->repository->detalle($id);
        if ($fila === null || (int) $fila['empresa_id'] !== $empresaId) {
            throw ApiException::noEncontrado('La oferta no existe.');
        }

        return $fila;
    }

    private function usuarioDeEmpresa(int $empresaId): ?int
    {
        $empresa = $this->ofertas->db->table('empresas')
            ->select('user_id')
            ->where('id', $empresaId)
            ->get()
            ->getRow();

        return $empresa ? (int) $empresa->user_id : null;
    }

    /**
     * @param array<string, mixed> $datos
     *
     * @return array<string, mixed>
     */
    private function validar(array $datos): array
    {
        Validador::validar($datos, [
            'puesto'                 => ['required', 'max:150'],
            'descripcion'            => ['max:10000'],
            'funciones'              => ['max:10000'],
            'requisitos'             => ['max:10000'],
            'formacion_requerida'    => ['max:200'],
            'experiencia_requerida'  => ['max:200'],
            'ubicacion'              => ['max:150'],
            'tipo_empleo'            => ['enum:' . implode(',', self::TIPOS_EMPLEO)],
            'remuneracion'           => ['regex:/^\d{1,10}(\.\d{1,2})?$/'],
            'fecha_cierre'           => ['regex:/^\d{4}-\d{2}-\d{2}$/'],
            'categoria_id'           => ['regex:/^\d+$/'],
        ]);

        if (empty($datos['vacantes']) || (int) $datos['vacantes'] < 1) {
            throw ApiException::validacion('Indique al menos una vacante.', ['Indique al menos una vacante.']);
        }
        if (! empty($datos['fecha_cierre'])) {
            $cierre = strtotime($datos['fecha_cierre']);
            if ($cierre === false) {
                throw ApiException::validacion('La fecha de cierre no es válida.', ['La fecha de cierre no es válida.']);
            }
            if ($cierre < strtotime(date('Y-m-d'))) {
                throw ApiException::validacion('La fecha de cierre no puede ser anterior a hoy.', ['La fecha de cierre no puede ser anterior a hoy.']);
            }
        }
        if (! empty($datos['categoria_id']) && ! $this->ofertas->db->table('categorias')->where('id', $datos['categoria_id'])->countAllResults()) {
            throw ApiException::validacion('La categoría seleccionada no existe.', ['La categoría seleccionada no existe.']);
        }

        $habilidades = $datos['habilidades'] ?? [];
        if (is_string($habilidades)) {
            $habilidades = array_filter(array_map('trim', explode(',', $habilidades)));
        }
        $datos['habilidades'] = array_values(array_filter(array_map('trim', (array) $habilidades)));

        return $datos;
    }
}
