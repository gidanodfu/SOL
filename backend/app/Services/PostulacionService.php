<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\CvModel;
use App\Models\PostulacionModel;
use App\Repositories\OfertaRepository;
use App\Repositories\PostulacionRepository;
use App\Repositories\PostulanteRepository;

/**
 * Postulaciones del ciudadano (RF-30..RF-32, RN-13..RN-17).
 * - Registro individual por postulación (RN-13).
 * - Máximo una postulación ACTIVA por postulante-oferta (RN-14; reforzado por
 *   columna generada única en BD).
 * - La postulación se registra en la bandeja de la empresa (RF-32).
 * - Retirar = desactivar; nunca se elimina físicamente (RF-38/RN-17).
 */
class PostulacionService
{
    private PostulacionModel $postulaciones;

    private PostulacionRepository $repository;

    private OfertaRepository $ofertas;

    private PostulanteRepository $perfiles;

    private CvModel $cvs;

    private StorageService $storage;

    /**
     * Transiciones de estado permitidas por la empresa (RF-36). La selección final
     * la decide la empresa (RN-18). "no_seleccionado" puede reabrirse a revisión;
     * "seleccionado" es terminal.
     */
    private const TRANSICIONES = [
        'pendiente'         => ['en_revision', 'no_seleccionado'],
        'en_revision'       => ['preseleccionado', 'contactado', 'no_seleccionado'],
        'preseleccionado'   => ['contactado', 'seleccionado', 'no_seleccionado'],
        'contactado'        => ['seleccionado', 'no_seleccionado'],
        'no_seleccionado'   => ['en_revision'],
    ];

    public function __construct(
        ?PostulacionModel $postulaciones = null,
        ?PostulacionRepository $repository = null,
        ?OfertaRepository $ofertas = null,
        ?PostulanteRepository $perfiles = null,
        ?CvModel $cvs = null,
        ?StorageService $storage = null,
    ) {
        $this->postulaciones = $postulaciones ?? model(PostulacionModel::class);
        $this->repository    = $repository ?? new PostulacionRepository();
        $this->ofertas       = $ofertas ?? new OfertaRepository();
        $this->perfiles      = $perfiles ?? new PostulanteRepository();
        $this->cvs           = $cvs ?? model(CvModel::class);
        $this->storage       = $storage ?? new StorageService();
    }

    public function listar(int $postulanteId): array
    {
        return $this->repository->dePostulante($postulanteId);
    }

    public function postular(int $postulanteId, int $ofertaId): int
    {
        // RF-19 ajustado: para postular solo se exige datos personales/contacto
        // completos y un CV vigente. Formación, experiencia, habilidades y
        // cursos son opcionales y se pueden llenar después.
        $completitud = $this->perfiles->completitud($postulanteId);
        if (! $completitud['completo']) {
            throw ApiException::conflicto(
                'Para postularte completa tus datos personales y carga tu CV: ' . implode(', ', $completitud['faltantes']) . '.',
            );
        }

        $oferta = $this->ofertas->detalle($ofertaId);
        if ($oferta === null || $oferta['estado'] !== 'publicada') {
            throw ApiException::noEncontrado('La oferta no está disponible para postular.');
        }
        if ($oferta['fecha_cierre'] !== null && strtotime($oferta['fecha_cierre']) < strtotime(date('Y-m-d'))) {
            throw ApiException::conflicto('La oferta ya cerró sus postulaciones.');
        }

        // RN-14: evita doble postulación activa a la misma oferta.
        $yaPostulada = $this->postulaciones->db->table('postulaciones')
            ->where('postulante_id', $postulanteId)
            ->where('oferta_id', $ofertaId)
            ->where('activo', 1)
            ->countAllResults();
        if ($yaPostulada) {
            throw ApiException::conflicto('Ya se registró su postulación a esta oferta.');
        }

        $ahora = date('Y-m-d H:i:s');

        $this->postulaciones->db->transStart();
        $this->postulaciones->insert([
            'postulante_id'     => $postulanteId,
            'oferta_id'         => $ofertaId,
            'empresa_id'        => (int) $oferta['empresa_id'],
            'fecha_postulacion' => $ahora,
            'estado'            => 'pendiente',
            'activo'            => 1,
        ]);
        $id = $this->postulaciones->getInsertID();

        $this->postulaciones->db->table('postulacion_historial')->insert([
            'postulacion_id'  => $id,
            'estado_anterior' => null,
            'estado_nuevo'    => 'pendiente',
            'usuario_id'      => $postulanteId,
            'created_at'      => $ahora,
        ]);
        $this->postulaciones->db->transComplete();

        if (! $this->postulaciones->db->transStatus()) {
            throw ApiException::conflicto('No se pudo registrar la postulación. Ya existe una postulación activa a esta oferta.');
        }

        return $id;
    }

    public function retirar(int $postulanteId, int $postulacionId): void
    {
        $postulacion = $this->repository->delPostulante($postulanteId, $postulacionId);
        if ($postulacion === null) {
            throw ApiException::noEncontrado('La postulación no existe.');
        }
        if ((int) $postulacion['activo'] !== 1) {
            throw ApiException::conflicto('La postulación ya se encuentra retirada.');
        }

        // Desactivación, no eliminación (RF-38/RN-17).
        $this->postulaciones->update((int) $postulacion['id'], ['activo' => 0]);
    }

    /* ---------------------- Bandeja de la empresa (RF-33..RF-40) ---------------------- */

    public function listarDeEmpresa(int $empresaId, ?string $estado = null, ?int $ofertaId = null): array
    {
        return $this->repository->deEmpresa($empresaId, $estado, $ofertaId);
    }

    /**
     * @return array<string, mixed>
     */
    public function detalleDeEmpresa(int $empresaId, int $id): array
    {
        $postulacion = $this->exigirEmpresa($empresaId, $id);

        return [
            'id'              => (int) $postulacion['id'],
            'fecha_postulacion' => $postulacion['fecha_postulacion'],
            'estado'          => $postulacion['estado'],
            'activo'          => (int) $postulacion['activo'],
            'oferta'          => [
                'id' => (int) $postulacion['oferta_id'],
                'puesto' => $postulacion['puesto'],
                'ubicacion' => $postulacion['ubicacion'],
                'remuneracion' => $postulacion['remuneracion'],
                'fecha_cierre' => $postulacion['fecha_cierre'],
            ],
            'postulante' => $this->perfiles->perfilCompleto((int) $postulacion['postulante_id']),
        ];
    }

    /**
     * Cambio de estado con validación de transición e historial (RF-36/39/63).
     */
    public function cambiarEstadoDeEmpresa(int $empresaId, int $id, string $nuevoEstado): void
    {
        $postulacion = $this->exigirEmpresa($empresaId, $id);

        if ((int) $postulacion['activo'] !== 1) {
            throw ApiException::conflicto('Debe activar la postulación antes de cambiar su estado.');
        }
        $permitidos = self::TRANSICIONES[$postulacion['estado']] ?? [];
        if (! in_array($nuevoEstado, $permitidos, true)) {
            throw ApiException::conflicto(
                "No puede pasar de \"{$postulacion['estado']}\" a \"{$nuevoEstado}\".",
            );
        }

        $ahora = date('Y-m-d H:i:s');

        $this->postulaciones->db->transStart();
        $this->postulaciones->update($id, ['estado' => $nuevoEstado]);
        // Historial del cambio (RF-39); el estado "contactado" alimenta el tiempo de
        // atención (RF-59).
        $this->postulaciones->db->table('postulacion_historial')->insert([
            'postulacion_id'  => $id,
            'estado_anterior' => $postulacion['estado'],
            'estado_nuevo'    => $nuevoEstado,
            'usuario_id'      => $this->usuarioEmpresa($empresaId),
            'created_at'      => $ahora,
        ]);
        $this->postulaciones->db->transComplete();

        if (! $this->postulaciones->db->transStatus()) {
            throw ApiException::conflicto('No se pudo actualizar el estado.');
        }
    }

    /**
     * Activar/desactivar postulación sin eliminarla (RF-37/38, RN-17).
     */
    public function cambiarActivacionDeEmpresa(int $empresaId, int $id, bool $activo): void
    {
        $postulacion = $this->exigirEmpresa($empresaId, $id);

        if ((int) $postulacion['activo'] === (int) $activo) {
            return;
        }

        $this->postulaciones->update($id, ['activo' => (int) $activo]);
    }

    /**
     * URL firmada del CV del postulante, solo si la empresa posee la postulación
     * (RT-CV-04/05).
     */
    public function urlCvAutorizada(int $empresaId, int $id): string
    {
        $postulacion = $this->exigirEmpresa($empresaId, $id);
        $cv = $this->cvs->activoDePostulante((int) $postulacion['postulante_id']);

        if ($cv === null) {
            throw ApiException::noEncontrado('El postulante aún no ha cargado un CV.');
        }

        if ($this->storage->esSupabase()) {
            return $this->storage->urlTemporal($cv->object_key);
        }

        // Driver local: ruta interna protegida que vuelve a validar la autorización.
        $clave = rtrim(strtr(base64_encode($cv->object_key), '+/', '-_'), '=');

        return rtrim((string) config('App')->baseURL, '/')
            . "/api/empresa/postulaciones/{$id}/cv/archivo/{$clave}";
    }

    /**
     * Stream del CV con driver local tras validar la autorización (RT-CV-04).
     *
     * @return array{ruta: string, nombre: string, mime: string}|null
     */
    public function archivoCvAutorizado(int $empresaId, int $id, string $claveCodificada): ?array
    {
        $postulacion = $this->exigirEmpresa($empresaId, $id);

        $objectKey = base64_decode(strtr($claveCodificada, '-_', '+/'), true);
        if ($objectKey === false) {
            return null;
        }

        $cv = $this->cvs->where('postulante_id', (int) $postulacion['postulante_id'])
            ->where('object_key', $objectKey)
            ->first();
        if ($cv === null) {
            return null;
        }

        $ruta = $this->storage->rutaLocal($objectKey);

        return $ruta === null ? null : ['ruta' => $ruta, 'nombre' => $cv->nombre_original, 'mime' => $cv->mime];
    }

    /**
     * RT-05: la postulación debe pertenecer a la empresa de la sesión.
     *
     * @return array<string, mixed>
     */
    private function exigirEmpresa(int $empresaId, int $id): array
    {
        $fila = $this->repository->deEmpresaPorId($empresaId, $id);
        if ($fila === null) {
            throw ApiException::noEncontrado('La postulación no existe.');
        }

        return $fila;
    }

    private function usuarioEmpresa(int $empresaId): ?int
    {
        $empresa = $this->postulaciones->db->table('empresas')
            ->select('user_id')
            ->where('id', $empresaId)
            ->get()
            ->getRowArray();

        return $empresa ? (int) $empresa['user_id'] : null;
    }
}
