<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Entities\Usuario;
use App\Exceptions\ApiException;
use App\Models\EmpresaModel;
use App\Models\UserModel;
use App\Repositories\UsuarioRepository;
use App\Validation\Validador;

/**
 * Administración de usuarios por el rol municipal (RF-07). El registro de usuarios
 * de empresa y postulante se hace por sus respectivos flujos (RF-11/RF-18), no aquí,
 * para preservar las invariantes de negocio.
 */
class UsuarioService
{
    private UsuarioRepository $repository;

    private UserModel $users;

    private EmpresaModel $empresas;

    private AuditoriaService $auditoria;

    public function __construct(
        ?UsuarioRepository $repository = null,
        ?UserModel $users = null,
        ?EmpresaModel $empresas = null,
        ?AuditoriaService $auditoria = null,
    ) {
        $this->repository = $repository ?? new UsuarioRepository();
        $this->users      = $users ?? model(UserModel::class);
        $this->empresas   = $empresas ?? model(EmpresaModel::class);
        $this->auditoria  = $auditoria ?? new AuditoriaService();
    }

    /**
     * @param array<string, mixed> $filtros
     *
     * @return array{data: list<array<string, mixed>>, total: int}
     */
    public function listar(array $filtros, int $limite, int $offset): array
    {
        return [
            'data'  => $this->repository->listar($filtros, $limite, $offset),
            'total' => $this->repository->contar($filtros),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function obtener(int $id): array
    {
        $usuario = $this->users->find($id);
        if ($usuario === null) {
            throw ApiException::noEncontrado('El usuario no existe.');
        }

        return $this->detallado($usuario);
    }

    /**
     * Crea personal municipal (rol admin). Otros roles se crean en sus módulos.
     *
     * @param array<string, mixed> $datos
     */
    public function crear(int $adminId, array $datos): int
    {
        Validador::validar($datos, [
            'username'  => ['required', 'max:60', 'regex:/^[a-zA-Z0-9._-]+$/'],
            'nombres'   => ['required', 'max:100'],
            'apellidos' => ['required', 'max:100'],
            'email'     => ['email', 'max:150'],
            'telefono'  => ['telefono'],
            'password'  => ['required', 'min:8'],
        ]);

        if ($this->users->buscarPorUsername($datos['username']) !== null) {
            throw ApiException::conflicto('El nombre de usuario ya está en uso.');
        }

        $this->users->insert([
            'username'      => $datos['username'],
            'password_hash' => password_hash($datos['password'], PASSWORD_DEFAULT),
            'rol'           => 'admin',
            'nombres'       => $datos['nombres'],
            'apellidos'     => $datos['apellidos'],
            'email'         => $datos['email'] ?? null,
            'telefono'      => $datos['telefono'] ?? null,
            'estado'        => 'activo',
        ]);

        $id = $this->users->getInsertID();
        $this->auditoria->registrar($adminId, 'crear_usuario', 'user', $id, ['username' => $datos['username']]);

        return $id;
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function actualizar(int $adminId, int $id, array $datos): void
    {
        $this->exigirExistente($id);

        Validador::validar($datos, [
            'nombres'   => ['required', 'max:100'],
            'apellidos' => ['required', 'max:100'],
            'email'     => ['email', 'max:150'],
            'telefono'  => ['telefono'],
        ]);

        $this->users->update($id, [
            'nombres'   => $datos['nombres'],
            'apellidos' => $datos['apellidos'],
            'email'     => $datos['email'] ?? null,
            'telefono'  => $datos['telefono'] ?? null,
        ]);
        $this->auditoria->registrar($adminId, 'editar_usuario', 'user', $id);
    }

    public function cambiarEstado(int $adminId, int $id, string $estado): void
    {
        // Un administrador no puede desactivar su propia cuenta: evita dejar el
        // sistema sin acceso administrativo (autoridad en backend, RF-06/RN-09).
        if ($adminId === $id && $estado === 'inactivo') {
            throw ApiException::prohibido('No puede desactivar su propia cuenta.');
        }

        $usuario = $this->exigirExistente($id);

        Validador::validar(['estado' => $estado], [
            'estado' => ['required', 'enum:activo,inactivo'],
        ]);

        if ($usuario->estado === $estado) {
            return;
        }

        // Usuario y empresa asociada se actualizan juntos: un fallo parcial dejaría
        // el estado de bloqueo desincronizado (RF-16/RN-11).
        $this->users->db->transStart();
        $this->users->update($id, ['estado' => $estado]);

        // Sincroniza el estado de la empresa asociada: una empresa inactiva tampoco
        // puede operar.
        if ($usuario->rol === 'empresa') {
            $this->empresas->where('user_id', $id)->set('estado', $estado)->update();
        }
        $this->users->db->transComplete();

        if (! $this->users->db->transStatus()) {
            throw ApiException::conflicto('No se pudo actualizar el estado del usuario.');
        }

        $this->auditoria->registrar($adminId, $estado === 'activo' ? 'activar_usuario' : 'desactivar_usuario', 'user', $id);
    }

    public function resetearContrasena(int $adminId, int $id, string $password): void
    {
        $this->exigirExistente($id);

        Validador::validar(['password' => $password], [
            'password' => ['required', 'min:8'],
        ]);

        $this->users->update($id, ['password_hash' => password_hash($password, PASSWORD_DEFAULT)]);
        $this->auditoria->registrar($adminId, 'resetear_contrasena', 'user', $id);
    }

    private function exigirExistente(int $id): Usuario
    {
        $usuario = $this->users->find($id);
        if ($usuario === null) {
            throw ApiException::noEncontrado('El usuario no existe.');
        }

        return $usuario;
    }

    /**
     * @return array<string, mixed>
     */
    private function detallado(Usuario $usuario): array
    {
        return [
            'id'            => $usuario->id,
            'username'      => $usuario->username,
            'rol'           => $usuario->rol,
            'nombres'       => $usuario->nombres,
            'apellidos'     => $usuario->apellidos,
            'email'         => $usuario->email,
            'telefono'      => $usuario->telefono,
            'estado'        => $usuario->estado,
            'ultimo_acceso' => $usuario->ultimo_acceso ? $usuario->ultimo_acceso->format('Y-m-d H:i:s') : null,
        ];
    }
}
