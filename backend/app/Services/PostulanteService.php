<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\PostulanteModel;
use App\Models\UserModel;
use App\Repositories\PostulanteRepository;
use App\Validation\Validador;

/**
 * Perfil laboral del postulante (RF-19/RF-20): datos básicos y de contacto.
 * El requisito para postular es tener contacto completo y CV vigente.
 */
class PostulanteService
{
    private PostulanteRepository $repository;

    private PostulanteModel $postulantes;

    private UserModel $users;

    public function __construct(
        ?PostulanteRepository $repository = null,
        ?PostulanteModel $postulantes = null,
        ?UserModel $users = null,
    ) {
        $this->repository  = $repository ?? new PostulanteRepository();
        $this->postulantes = $postulantes ?? model(PostulanteModel::class);
        $this->users       = $users ?? model(UserModel::class);
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

        $perfil = $this->repository->perfilCompleto((int) $postulante->id);

        // Completitud para postular (RF-19 ajustado): se expone para guiar al usuario.
        $perfil['completitud'] = $this->repository->completitud((int) $postulante->id);

        return $perfil;
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
            'fecha_nacimiento' => ['regex:/^\d{4}-\d{2}-\d{2}$/'],
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
