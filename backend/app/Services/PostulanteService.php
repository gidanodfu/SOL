<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\PostulanteModel;
use App\Models\UserModel;
use App\Repositories\PostulanteRepository;
use App\Validation\Validador;
use CodeIgniter\HTTP\Files\UploadedFile;

/**
 * Perfil laboral del postulante (RF-19/RF-20): datos básicos y de contacto.
 * El requisito para postular es tener contacto completo y CV vigente.
 */
class PostulanteService
{
    private PostulanteRepository $repository;

    private PostulanteModel $postulantes;

    private UserModel $users;

    private StorageService $storage;

    private ImageService $images;

    public function __construct(
        ?PostulanteRepository $repository = null,
        ?PostulanteModel $postulantes = null,
        ?UserModel $users = null,
        ?StorageService $storage = null,
        ?ImageService $images = null,
    ) {
        $this->repository  = $repository ?? new PostulanteRepository();
        $this->postulantes = $postulantes ?? model(PostulanteModel::class);
        $this->users       = $users ?? model(UserModel::class);
        $this->storage     = $storage ?? new StorageService();
        $this->images      = $images ?? new ImageService();
    }

    /**
     * @return array<string, mixed>
     */
    public function perfil(int $usuarioId): array
    {
        $postulante = $this->postulantes->porUserId($usuarioId);
        if ($postulante === null) {
            throw ApiException::noEncontrado('No se encontró el perfil de postulante.');
        }

        // perfilCompleto ya incluye foto_url (proxy público); aquí solo se añade
        // la completitud para postular (RF-19 ajustado).
        $perfil = $this->repository->perfilCompleto((int) $postulante->id);

        // Completitud para postular (RF-19 ajustado): se expone para guiar al usuario.
        $perfil['completitud'] = $this->repository->completitud((int) $postulante->id);

        // Actividad laboral (antes en /postulante/dashboard): se consolida aquí para
        // que "Mi perfil y CV" sea el centro único. Reutiliza DashboardService, sin
        // duplicar consultas ni forzar una segunda petición desde el frontend.
        $perfil['actividad'] = (new DashboardService())->postulante($usuarioId);

        return $perfil;
    }

    /**
     * Sube o reemplaza la foto de perfil del postulante autenticado. La imagen se
     * normaliza a 800x800 con recorte centrado (cover), sin deformar.
     */
    public function subirFoto(int $usuarioId, UploadedFile $foto): void
    {
        $postulante = $this->postulantes->porUserId($usuarioId);
        if ($postulante === null) {
            throw ApiException::noEncontrado('No se encontró el perfil de postulante.');
        }

        $contenido   = $this->images->leerSubida($foto);
        $normalizada = $this->images->normalizar($contenido, 'cover', 'jpeg');

        $objectKey = 'postulantes/foto/' . $postulante->id . '/' . bin2hex(random_bytes(8)) . '.' . $normalizada['extension'];
        $this->storage->almacenarContenido($objectKey, $normalizada['bytes'], $normalizada['mime']);

        $anterior = $postulante->foto_key;
        $this->postulantes->update((int) $postulante->id, ['foto_key' => $objectKey]);

        if ($anterior && $anterior !== $objectKey) {
            $this->storage->eliminar($anterior);
        }
    }

    public function eliminarFoto(int $usuarioId): void
    {
        $postulante = $this->postulantes->porUserId($usuarioId);
        if ($postulante === null) {
            throw ApiException::noEncontrado('No se encontró el perfil de postulante.');
        }

        if (! empty($postulante->foto_key)) {
            $this->storage->eliminar($postulante->foto_key);
        }
        $this->postulantes->update((int) $postulante->id, ['foto_key' => null]);
    }

    /**
     * Contenido binario de la foto de un postulante por su id (proxy de lectura).
     * Nunca expone la clave de almacenamiento ni otros datos.
     *
     * @return array{mime: string, contenido: string}|null
     */
    public function fotoContenido(int $postulanteId): ?array
    {
        $postulante = $this->postulantes->find($postulanteId);
        if ($postulante === null || empty($postulante->foto_key)) {
            return null;
        }

        $contenido = $this->storage->obtenerContenido($postulante->foto_key);
        if ($contenido === null) {
            return null;
        }

        $mime = match (strtolower(pathinfo($postulante->foto_key, PATHINFO_EXTENSION))) {
            'png'   => 'image/png',
            'webp'  => 'image/webp',
            default => 'image/jpeg',
        };

        return ['mime' => $mime, 'contenido' => $contenido];
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function actualizarBasico(int $usuarioId, array $datos): void
    {
        $postulante = $this->postulantes->porUserId($usuarioId);
        if ($postulante === null) {
            throw ApiException::noEncontrado('No se encontró el perfil de postulante.');
        }

        Validador::validar($datos, [
            'nombres'    => ['required', 'max:100'],
            'apellidos'  => ['required', 'max:100'],
            'email'      => ['email', 'max:150'],
            'telefono'   => ['telefono'],
            'direccion'  => ['max:255'],
            'distrito'   => ['max:100'],
            'fecha_nacimiento' => ['fecha'],
            // Información laboral del perfil/CV (RF-19). El DNI no se edita aquí.
            'ocupacion'   => ['max:150'],
            'experiencia' => ['max:5000'],
            'estudios'    => ['max:5000'],
        ]);

        // Perfil y cuenta se actualizan juntos: un fallo parcial dejaría datos
        // de contacto divergentes entre `postulantes` y `users`.
        $this->postulantes->db->transStart();
        $this->postulantes->update((int) $postulante->id, [
            'nombres'          => $datos['nombres'],
            'apellidos'        => $datos['apellidos'],
            'direccion'        => $datos['direccion'] ?? null,
            'distrito'         => $datos['distrito'] ?? null,
            'telefono'         => $datos['telefono'] ?? null,
            'fecha_nacimiento' => $datos['fecha_nacimiento'] ?? null,
            'ocupacion'        => $datos['ocupacion'] ?? null,
            'experiencia'      => $datos['experiencia'] ?? null,
            'estudios'         => $datos['estudios'] ?? null,
        ]);
        $this->users->update($usuarioId, [
            'nombres'   => $datos['nombres'],
            'apellidos' => $datos['apellidos'],
            'email'     => $datos['email'] ?? null,
            'telefono'  => $datos['telefono'] ?? null,
        ]);
        $this->postulantes->db->transComplete();

        if (! $this->postulantes->db->transStatus()) {
            throw ApiException::conflicto('No se pudo actualizar el perfil. Intente nuevamente.');
        }
    }
}
