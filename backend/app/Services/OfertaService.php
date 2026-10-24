<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\OfertaHabilidadModel;
use App\Models\OfertaModel;
use App\Repositories\OfertaRepository;
use App\Repositories\PostulacionRepository;
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
 *   publicada → cerrada (cierre manual).
 * Además, `publicada` con `fecha_cierre` ya transcurrida se expone como
 * `estado_efectivo = vencida`: es un estado derivado, no un valor del ENUM.
 */
class OfertaService
{
    public const TIPOS_EMPLEO = ['tiempo_completo', 'medio_tiempo', 'por_horas', 'practicas', 'freelance', 'remoto'];

    /**
     * `vencida` no existe en el ENUM porque es un estado efectivo derivado de
     * `publicada` + `fecha_cierre`; se admite como filtro de la bandeja.
     */
    private const ESTADOS_ADMIN = ['borrador', 'pendiente', 'publicada', 'vencida', 'cerrada', 'rechazada', 'observada'];

    /**
     * Estados editables por la empresa. `rechazada` NO es editable (decisión
     * terminal) y `cerrada` tampoco. `observada` sí: la empresa corrige y la
     * oferta vuelve a revisión al guardar.
     */
    private const EDITABLE = ['borrador', 'pendiente', 'publicada', 'observada'];

    private OfertaModel $ofertas;

    private OfertaHabilidadModel $habilidades;

    private OfertaRepository $repository;

    private PostulacionRepository $postulaciones;

    private AuditoriaService $auditoria;

    private HtmlSanitizer $html;

    public function __construct(
        ?OfertaModel $ofertas = null,
        ?OfertaHabilidadModel $habilidades = null,
        ?OfertaRepository $repository = null,
        ?AuditoriaService $auditoria = null,
        ?HtmlSanitizer $html = null,
        ?PostulacionRepository $postulaciones = null,
    ) {
        $this->ofertas       = $ofertas ?? model(OfertaModel::class);
        $this->habilidades   = $habilidades ?? model(OfertaHabilidadModel::class);
        $this->repository    = $repository ?? new OfertaRepository();
        $this->auditoria     = $auditoria ?? new AuditoriaService();
        $this->html          = $html ?? new HtmlSanitizer();
        $this->postulaciones = $postulaciones ?? new PostulacionRepository();
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
        $filas = $this->repository->publicadas(array_filter($filtros, static fn ($v) => $v !== null && $v !== ''));

        return array_map(fn ($fila) => $this->conEstadoEfectivo($this->conEmpresa($fila)), $filas);
    }

    /**
     * Añade un bloque `empresa` con solo información pública (identidad y
     * antigüedad) y oculta la clave interna del logo. Sin consultas extra: los
     * datos vienen del JOIN de la propia consulta de ofertas (sin N+1).
     *
     * @param array<string, mixed> $fila
     *
     * @return array<string, mixed>
     */
    private function conEmpresa(array $fila): array
    {
        $empresaId = (int) ($fila['empresa_id'] ?? 0);
        $fila['empresa'] = [
            'id'               => $empresaId,
            'razon_social'     => $fila['razon_social'] ?? null,
            'nombre_comercial' => $fila['empresa_nombre_comercial'] ?? null,
            'ruc'              => $fila['ruc'] ?? null,
            'direccion'        => $fila['empresa_direccion'] ?? null,
            'logo_url'         => ! empty($fila['empresa_logo_key']) ? '/api/empresas/' . $empresaId . '/logo' : null,
            'fecha_alta'       => $fila['empresa_created_at'] ?? null,
            'antiguedad'       => AntiguedadService::texto($fila['empresa_created_at'] ?? null),
            // Presencia digital pública (el contacto privado no se incluye).
            'website_url'      => $fila['empresa_website_url'] ?? null,
            'instagram_url'    => $fila['empresa_instagram_url'] ?? null,
            'facebook_url'     => $fila['empresa_facebook_url'] ?? null,
            'tiktok_url'       => $fila['empresa_tiktok_url'] ?? null,
            'x_url'            => $fila['empresa_x_url'] ?? null,
        ];
        unset(
            $fila['empresa_nombre_comercial'],
            $fila['empresa_direccion'],
            $fila['empresa_created_at'],
            $fila['empresa_logo_key'],
            $fila['empresa_website_url'],
            $fila['empresa_instagram_url'],
            $fila['empresa_facebook_url'],
            $fila['empresa_tiktok_url'],
            $fila['empresa_x_url'],
        );

        return $fila;
    }

    /**
     * Detalle público de una oferta publicada (RF-29) + si el postulante ya postuló.
     *
     * @return array<string, mixed>
     */
    public function detallePublica(int $id, ?int $postulanteId = null): array
    {
        $oferta = $this->repository->detalle($id);
        if ($oferta === null || $oferta['estado'] !== 'publicada' || self::vencida($oferta['fecha_cierre'] ?? null)) {
            throw ApiException::noEncontrado('La oferta no está disponible.');
        }
        $oferta = $this->conEstadoEfectivo($this->conEmpresa($oferta));

        if ($postulanteId !== null) {
            $oferta['ya_postule'] = $this->postulaciones->tienePostulacionActiva($postulanteId, $id);
            $oferta['ya_seleccionado_empresa'] = $this->postulaciones->seleccionadoEnEmpresa(
                $postulanteId,
                (int) $oferta['empresa_id'],
            );
        }

        return $oferta;
    }

    /* ------------------------- Contexto empresa ------------------------- */

    public function listarMias(int $empresaId): array
    {
        $filas = $this->repository->porEmpresa($empresaId);

        return array_map(
            fn ($f) => $this->conEstadoEfectivo($f) + ['habilidades' => $this->habilidades->deOferta((int) $f['id'])],
            $filas,
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function detallePropia(int $empresaId, int $id): array
    {
        return $this->conEstadoEfectivo($this->exigirPropia($empresaId, $id));
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

        // `rechazada` (terminal) y `cerrada` no son editables por la empresa;
        // tampoco por una petición directa a la API. Una oferta publicada que
        // ya venció tampoco se reabre: el cierre temporal es definitivo.
        if (! in_array($oferta['estado'], self::EDITABLE, true)) {
            throw ApiException::conflicto('La oferta no se puede editar en su estado actual.');
        }
        if ($oferta['estado'] === 'publicada' && self::vencida($oferta['fecha_cierre'] ?? null)) {
            throw ApiException::conflicto('La oferta ya venció; no puede volver a publicación ni editarse.');
        }

        $datos = $this->validar($datos);

        // Control del flujo: editar una oferta publicada o corregir una oferta
        // observada la devuelve a revisión municipal. Corregir una observación
        // NO es aprobarla: solo la aprobación municipal la publica.
        $vuelveARevision = in_array($oferta['estado'], ['publicada', 'observada'], true);

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
            // La observación NO se borra al guardar el formulario: el admin la
            // conserva al re-revisar. Solo se limpian las marcas de aprobación.
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

        // `rechazada` es terminal: no se reenvía a revisión.
        if ($oferta['estado'] !== 'borrador') {
            throw ApiException::conflicto('Solo puede enviar a revisión una oferta en borrador.');
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
        if (self::vencida($oferta['fecha_cierre'] ?? null)) {
            throw ApiException::conflicto('La oferta ya venció; el cierre es automático y no se puede convertir en cierre manual.');
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
        if (self::vencida($oferta['fecha_cierre'] ?? null)) {
            throw ApiException::conflicto('La oferta ya venció; el cierre es automático y no se puede convertir en cierre manual.');
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

        return array_map([$this, 'conEstadoEfectivo'], $this->repository->paraAdmin($estado));
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
        if (self::vencida($oferta['fecha_cierre'] ?? null)) {
            throw ApiException::conflicto('La oferta tiene fecha de cierre vencida; la empresa debe actualizarla antes de aprobarla.');
        }

        $this->ofertas->update($id, [
            'estado'            => 'publicada',
            'fecha_publicacion' => date('Y-m-d'),
            'motivo_rechazo'    => null,
            'validado_por'      => $adminId,
            'fecha_validacion'  => date('Y-m-d H:i:s'),
            // La observación queda resuelta al aprobarse.
            'observacion'       => null,
            'observado_por'     => null,
            'fecha_observacion' => null,
        ]);
        $this->auditoria->registrar($adminId, 'aprobar_oferta', 'oferta', $id, ['puesto' => $oferta['puesto']]);
    }

    /**
     * Rechazo municipal DEFINITIVO (pendiente/observada/publicada → rechazada).
     * El motivo queda visible para la empresa; la oferta queda bloqueada para
     * edición y publicación (decisión terminal).
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
        if (! in_array($oferta['estado'], ['pendiente', 'observada', 'publicada'], true)) {
            throw ApiException::conflicto('No se puede rechazar una oferta en su estado actual.');
        }
        if ($oferta['estado'] === 'publicada' && self::vencida($oferta['fecha_cierre'] ?? null)) {
            throw ApiException::conflicto('La oferta ya venció; su cierre temporal es definitivo.');
        }

        $this->ofertas->update($id, [
            'estado'            => 'rechazada',
            'motivo_rechazo'    => mb_substr((string) $datos['motivo'], 0, 255),
            'fecha_publicacion' => null,
            'validado_por'      => $adminId,
            'fecha_validacion'  => date('Y-m-d H:i:s'),
        ]);
        $this->auditoria->registrar($adminId, 'rechazar_oferta', 'oferta', $id, ['puesto' => $oferta['puesto']]);
    }

    /**
     * Observación municipal (RN-19): registra las correcciones que la empresa
     * debe aplicar y deja la oferta NO publicada (`observada`). Desde ese estado
     * la empresa puede corregir; al guardar, la oferta vuelve a revisión. No es
     * aprobación ni rechazo.
     *
     * @param array<string, mixed> $datos
     */
    public function observar(int $adminId, int $id, array $datos): void
    {
        Validador::validar($datos, [
            'observacion' => ['required', 'max:1000'],
        ]);

        $oferta = $this->repository->detalle($id);
        if ($oferta === null) {
            throw ApiException::noEncontrado('La oferta no existe.');
        }
        if (! in_array($oferta['estado'], ['pendiente', 'observada', 'publicada'], true)) {
            throw ApiException::conflicto('No se puede observar una oferta en su estado actual.');
        }
        if ($oferta['estado'] === 'publicada' && self::vencida($oferta['fecha_cierre'] ?? null)) {
            throw ApiException::conflicto('La oferta ya venció; su cierre temporal es definitivo.');
        }

        // Estado + observación se guardan de forma consistente.
        $this->ofertas->db->transStart();
        $this->ofertas->update($id, [
            'estado'            => 'observada',
            'observacion'       => trim((string) $datos['observacion']),
            'observado_por'     => $adminId,
            'fecha_observacion' => date('Y-m-d H:i:s'),
            // Deja de estar publicada y limpia marcas de aprobación/rechazo.
            'fecha_publicacion' => null,
            'motivo_rechazo'    => null,
            'validado_por'      => null,
            'fecha_validacion'  => null,
        ]);
        $this->auditoria->registrar($adminId, 'observar_oferta', 'oferta', $id, [
            'puesto'      => $oferta['puesto'],
            'observacion' => mb_substr(trim((string) $datos['observacion']), 0, 255),
        ]);
        $this->ofertas->db->transComplete();

        if (! $this->ofertas->db->transStatus()) {
            throw ApiException::conflicto('No se pudo registrar la observación.');
        }
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

        return $this->conEstadoEfectivo($oferta);
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

    /**
     * Vigencia por día en la zona horaria de la aplicación.
     *
     * `ofertas.fecha_cierre` es DATE, no DATETIME: la fecha de cierre es el
     * último día completo de postulación. Por eso el límite es inclusivo
     * durante ese día y se cruza al comenzar el día siguiente en America/Lima
     * (configurable con app.appTimezone). PHP y la consulta pública usan la
     * misma fecha local; no se compara contra UTC ni contra CURDATE() de MySQL.
     */
    public static function vencida(?string $fechaCierre, ?string $hoy = null): bool
    {
        $fechaCierre = $fechaCierre !== null ? trim($fechaCierre) : '';
        if ($fechaCierre === '') {
            return false;
        }

        $zona = self::zonaHoraria();
        $cierre = \DateTimeImmutable::createFromFormat('!Y-m-d', substr($fechaCierre, 0, 10), $zona);
        if ($cierre === false) {
            // Una fecha corrupta no debe habilitar una oferta por accidente.
            return true;
        }

        try {
            $referencia = $hoy !== null
                ? new \DateTimeImmutable($hoy, $zona)
                : new \DateTimeImmutable('now', $zona);
        } catch (\Throwable) {
            $referencia = new \DateTimeImmutable('now', $zona);
        }

        return $referencia->format('Y-m-d') > $cierre->format('Y-m-d');
    }

    /**
     * Estado que debe mostrar el panel: conserva `estado` persistido y expone
     * `vencida` cuando una oferta publicada ya alcanzó su cierre. `cerrada`
     * sigue siendo el cierre manual y no se confunde con el temporal.
     *
     * @param array<string, mixed> $fila
     */
    public static function estadoEfectivo(array $fila, ?string $hoy = null): string
    {
        $estado = (string) ($fila['estado'] ?? '');

        if ($estado === 'publicada' && self::vencida($fila['fecha_cierre'] ?? null, $hoy)) {
            return 'vencida';
        }

        return $estado;
    }

    /**
     * @param array<string, mixed> $fila
     *
     * @return array<string, mixed>
     */
    private function conEstadoEfectivo(array $fila): array
    {
        $fila['estado_efectivo'] = self::estadoEfectivo($fila);

        return $fila;
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
        // Campos con editor enriquecido: se sanea el HTML antes de validar y su
        // límite de 10.000 se aplica al TEXTO VISIBLE, no a las etiquetas.
        $datos['descripcion'] = $this->html->limpiar($datos['descripcion'] ?? null);
        $datos['funciones']   = $this->html->limpiar($datos['funciones'] ?? null);
        $datos['requisitos']  = $this->html->limpiar($datos['requisitos'] ?? null);

        Validador::validar($datos, [
            'puesto'                 => ['required', 'max:150'],
            'descripcion'            => ['required', 'texto_max:10000'],
            'funciones'              => ['required', 'texto_max:10000'],
            'requisitos'             => ['texto_max:10000'],
            'formacion_requerida'    => ['max:200'],
            'experiencia_requerida'  => ['max:200'],
            'ubicacion'              => ['max:150'],
            'tipo_empleo'            => ['enum:' . implode(',', self::TIPOS_EMPLEO)],
            'remuneracion'           => ['regex:/^\d{1,10}(\.\d{1,2})?$/'],
            'fecha_cierre'           => ['fecha'],
            'categoria_id'           => ['regex:/^\d+$/'],
        ]);

        // Entero puro, no solo "(int) >= 1": "3abc" no es una cantidad válida.
        if (! isset($datos['vacantes']) || ! preg_match('/^\d+$/', (string) $datos['vacantes']) || (int) $datos['vacantes'] < 1) {
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
