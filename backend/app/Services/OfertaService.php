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
 * La empresa gestiona SOLO sus propias ofertas (RT-05). Toda oferta nueva queda
 * pendiente de revisión municipal; la Municipalidad aprueba (publicada) o
 * rechaza (rechazada), y solo la aprobación la hace visible a los postulantes.
 * Transiciones:
 *   pendiente → publicada (aprobar) ; pendiente → rechazada (rechazar)
 *   borrador/rechazada → pendiente (enviar a revisión)
 *   publicada → pendiente (al editarla, vuelve a revisión)
 *   publicada → cerrada.
 */
class OfertaService
{
    public const TIPOS_EMPLEO = ['tiempo_completo', 'medio_tiempo', 'por_horas', 'practicas', 'freelance', 'remoto'];

    private const ESTADOS_ADMIN = ['borrador', 'pendiente', 'publicada', 'cerrada', 'rechazada'];

    /** Estados editables por la empresa: cualquiera que no esté cerrado. */
    private const EDITABLE = ['borrador', 'pendiente', 'publicada', 'rechazada'];

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
            // Toda oferta nueva queda pendiente de revisión municipal; no es
            // visible para los postulantes hasta que la Municipalidad la apruebe.
            'estado'                => 'pendiente',
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

        // Control del flujo: editar una oferta ya aprobada la devuelve a revisión
        // municipal, para que el contenido publicado no pueda alterarse sin
        // una nueva aprobación.
        $vuelveARevision = $oferta['estado'] === 'publicada';

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
            'estado'                => $vuelveARevision ? 'pendiente' : $oferta['estado'],
            'fecha_publicacion'     => $vuelveARevision ? null : $oferta['fecha_publicacion'],
            'motivo_rechazo'        => $vuelveARevision ? null : $oferta['motivo_rechazo'],
            'validado_por'          => $vuelveARevision ? null : $oferta['validado_por'],
            'fecha_validacion'      => $vuelveARevision ? null : $oferta['fecha_validacion'],
        ]);
        $this->habilidades->reemplazar($id, $datos['habilidades'] ?? []);
    }

    /**
     * Envío a revisión municipal de un borrador o de una oferta rechazada
     * (RN-19). No publica: solo la aprobación municipal hace visible la oferta.
     */
    public function enviarARevision(int $empresaId, int $id): void
    {
        $oferta = $this->exigirPropia($empresaId, $id);

        if (! in_array($oferta['estado'], ['borrador', 'rechazada'], true)) {
            throw ApiException::conflicto('La oferta ya está en revisión o publicada.');
        }

        $this->ofertas->update($id, [
            'estado'           => 'pendiente',
            'motivo_rechazo'   => null,
            'validado_por'     => null,
            'fecha_validacion' => null,
        ]);
        $this->auditoria->registrar(
            $this->usuarioDeEmpresa($empresaId),
            'enviar_revision_oferta',
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
        if ($estado !== null && ! in_array($estado, self::ESTADOS_ADMIN, true)) {
            throw ApiException::validacion('Estado de oferta no válido.');
        }

        return $this->repository->paraAdmin($estado);
    }

    /**
     * Aprobación municipal (RF-24/RN-19): pendiente → publicada. Revalida la
     * vigencia para no publicar ofertas con fecha de cierre vencida.
     */
    public function aprobar(int $adminId, int $id): void
    {
        $oferta = $this->repository->detalle($id);
        if ($oferta === null) {
            throw ApiException::noEncontrado('La oferta no existe.');
        }
        if ($oferta['estado'] !== 'pendiente') {
            throw ApiException::conflicto('Solo puede aprobar ofertas pendientes de revisión.');
        }
        if ($oferta['fecha_cierre'] !== null && strtotime((string) $oferta['fecha_cierre']) < strtotime(date('Y-m-d'))) {
            throw ApiException::conflicto('La oferta tiene fecha de cierre vencida; la empresa debe actualizarla antes de aprobarla.');
        }

        $this->ofertas->update($id, [
            'estado'            => 'publicada',
            'fecha_publicacion' => date('Y-m-d'),
            'motivo_rechazo'    => null,
            'validado_por'      => $adminId,
            'fecha_validacion'  => date('Y-m-d H:i:s'),
        ]);
        $this->auditoria->registrar($adminId, 'aprobar_oferta', 'oferta', $id, ['puesto' => $oferta['puesto']]);
    }

    /**
     * Rechazo municipal (pendiente → rechazada). El motivo queda visible para la
     * empresa, que puede corregir y reenviar a revisión.
     *
     * @param array<string, mixed> $datos
     */
    public function rechazar(int $adminId, int $id, array $datos): void
    {
        Validador::validar($datos, [
            'motivo' => ['required', 'max:255'],
        ]);

        $oferta = $this->repository->detalle($id);
        if ($oferta === null) {
            throw ApiException::noEncontrado('La oferta no existe.');
        }
        if ($oferta['estado'] !== 'pendiente') {
            throw ApiException::conflicto('Solo puede rechazar ofertas pendientes de revisión.');
        }

        $this->ofertas->update($id, [
            'estado'           => 'rechazada',
            'motivo_rechazo'   => mb_substr((string) $datos['motivo'], 0, 255),
            'validado_por'     => $adminId,
            'fecha_validacion' => date('Y-m-d H:i:s'),
        ]);
        $this->auditoria->registrar($adminId, 'rechazar_oferta', 'oferta', $id, ['puesto' => $oferta['puesto']]);
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
            'fecha_cierre'           => ['fecha'],
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
