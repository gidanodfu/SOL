<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Entities\Usuario;
use App\Exceptions\ApiException;
use App\Libraries\Identidad;
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

    private IdentidadService $identidad;

    public function __construct(
        ?UsuarioRepository $repository = null,
        ?UserModel $users = null,
        ?EmpresaModel $empresas = null,
        ?AuditoriaService $auditoria = null,
        ?IdentidadService $identidad = null,
    ) {
        $this->repository = $repository ?? new UsuarioRepository();
        $this->users      = $users ?? model(UserModel::class);
        $this->empresas   = $empresas ?? model(EmpresaModel::class);
        $this->auditoria  = $auditoria ?? new AuditoriaService();
        $this->identidad  = $identidad ?? new IdentidadService();
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
        $datos['email']    = Identidad::email($datos['email'] ?? null);
        $datos['telefono'] = Identidad::telefono($datos['telefono'] ?? null);

        Validador::validar($datos, [
            'username'  => ['required', 'max:60', 'regex:/^[a-zA-Z0-9._-]+$/'],
            'nombres'   => ['required', 'max:100'],
            'apellidos' => ['required', 'max:100'],
            'email'     => ['required', 'email', 'max:150'],
            'telefono'  => ['telefono'],
            'password'  => ['required', 'password'],
            'perfil_municipal' => ['required', 'enum:admin,moderador,solo_lectura'],
        ]);

        if ($this->users->buscarPorUsername($datos['username']) !== null) {
            throw ApiException::conflicto('El nombre de usuario ya está en uso.', [
                'username' => 'El nombre de usuario ya está en uso.',
            ]);
        }

        $this->identidad->exigirLibre('email', $datos['email']);
        $this->identidad->exigirLibre('telefono', $datos['telefono']);

        try {
            $this->users->db->transStart();

            $this->users->insert([
                'username'      => $datos['username'],
                'password_hash' => password_hash($datos['password'], PASSWORD_DEFAULT),
                'rol'           => 'admin',
                'perfil_municipal' => $datos['perfil_municipal'],
                'nombres'       => $datos['nombres'],
                'apellidos'     => $datos['apellidos'],
                'email'         => $datos['email'],
                'telefono'      => $datos['telefono'],
                'estado'        => 'activo',
            ]);
            $id = (int) $this->users->getInsertID();

            $this->identidad->reservar('email', $datos['email'], $id);
            $this->identidad->reservar('telefono', $datos['telefono'], $id);

            $this->users->db->transComplete();

            if (! $this->users->db->transStatus()) {
                throw ApiException::conflicto('No se pudo crear el usuario.');
            }
        } catch (ApiException $e) {
            $this->users->db->transRollback();
            throw $e;
        } catch (\Throwable $e) {
            $this->users->db->transRollback();
            if (IdentidadService::esDuplicado($e)) {
                throw ApiException::conflicto('El correo o teléfono ya está asociado a otra cuenta.');
            }
            throw $e;
        }

        $this->auditoria->registrar($adminId, 'crear_usuario', 'user', $id, [
            'username' => $datos['username'],
            'perfil_municipal' => $datos['perfil_municipal'],
        ]);

        return $id;
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function actualizar(int $adminId, int $id, array $datos): void
    {
        $usuario = $this->exigirExistente($id);
        $datos['email']    = Identidad::email($datos['email'] ?? null);
        $datos['telefono'] = Identidad::telefono($datos['telefono'] ?? null);

        Validador::validar($datos, [
            'nombres'   => ['required', 'max:100'],
            'apellidos' => ['required', 'max:100'],
            'email'     => ['email', 'max:150'],
            'telefono'  => ['telefono'],
        ]);

        if (Identidad::email($usuario->email) !== $datos['email']) {
            $this->identidad->exigirLibre('email', $datos['email'], $id);
        }
        if (Identidad::telefono($usuario->telefono) !== $datos['telefono']) {
            $this->identidad->exigirLibre('telefono', $datos['telefono'], $id);
        }

        try {
            $this->users->db->transStart();
            $this->identidad->actualizarContacto($id, $datos['email'], $datos['telefono']);
            $this->users->update($id, [
                'nombres'   => $datos['nombres'],
                'apellidos' => $datos['apellidos'],
                'email'     => $datos['email'],
                'telefono'  => $datos['telefono'],
            ]);
            $this->users->db->transComplete();

            if (! $this->users->db->transStatus()) {
                throw ApiException::conflicto('No se pudo actualizar el usuario.');
            }
        } catch (ApiException $e) {
            $this->users->db->transRollback();
            throw $e;
        } catch (\Throwable $e) {
            $this->users->db->transRollback();
            if (IdentidadService::esDuplicado($e)) {
                throw ApiException::conflicto('El correo o teléfono ya está asociado a otra cuenta. No se aplicó el cambio.');
            }
            throw $e;
        }

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

        $protegeUltimoAdmin = $usuario->rol === 'admin'
            && $usuario->perfil_municipal === AutorizacionMunicipalService::ADMIN
            && $usuario->estado === 'activo'
            && $estado === 'inactivo';

        // Usuario y empresa asociada se actualizan juntos: un fallo parcial dejaría
        // el estado de bloqueo desincronizado (RF-16/RN-11).
        $this->users->db->transStart();
        if ($protegeUltimoAdmin) {
            if ($this->bloquearAdministradoresActivos() <= 1) {
                $this->users->db->transRollback();
                throw ApiException::conflicto('No se puede desactivar al último administrador activo.');
            }
        }

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

        $this->auditoria->registrar(
            $adminId,
            $estado === 'activo' ? 'activar_usuario' : 'desactivar_usuario',
            'user',
            $id,
            ['estado' => $estado],
        );
    }

    public function cambiarPerfil(int $adminId, int $id, string $perfil): void
    {
        $usuario = $this->exigirExistente($id);
        if ($usuario->rol !== 'admin') {
            throw ApiException::validacion('Solo las cuentas municipales tienen perfil municipal.');
        }

        Validador::validar(['perfil_municipal' => $perfil], [
            'perfil_municipal' => ['required', 'enum:admin,moderador,solo_lectura'],
        ]);

        if ($usuario->perfil_municipal === $perfil) {
            return;
        }

        $this->users->db->transStart();
        if ($usuario->perfil_municipal === AutorizacionMunicipalService::ADMIN
            && $usuario->estado === 'activo'
            && $perfil !== AutorizacionMunicipalService::ADMIN) {
            if ($this->bloquearAdministradoresActivos() <= 1) {
                $this->users->db->transRollback();
                throw ApiException::conflicto('No se puede degradar al último administrador activo.');
            }
        }

        $this->users->update($id, ['perfil_municipal' => $perfil]);
        $this->users->db->transComplete();
        if (! $this->users->db->transStatus()) {
            $this->users->db->transRollback();
            throw ApiException::conflicto('No se pudo actualizar el perfil municipal.');
        }

        $this->auditoria->registrar($adminId, 'cambiar_perfil_municipal', 'user', $id, [
            'anterior' => $usuario->perfil_municipal,
            'nuevo'    => $perfil,
        ]);
    }

    public function resetearContrasena(int $adminId, int $id, string $password): void
    {
        $usuario = $this->exigirExistente($id);
        if (($usuario->proveedor ?? 'local') === 'google') {
            throw ApiException::prohibido('Esta cuenta se autentica con Google y no admite contraseña local.');
        }

        Validador::validar(['password' => $password], [
            'password' => ['required', 'password'],
        ]);

        $this->users->update($id, ['password_hash' => password_hash($password, PASSWORD_DEFAULT)]);
        $this->auditoria->registrar($adminId, 'resetear_contrasena', 'user', $id);
    }

    private function bloquearAdministradoresActivos(): int
    {
        $tabla = $this->users->db->prefixTable('users');

        return count($this->users->db
            ->query("SELECT id FROM {$tabla} WHERE rol = 'admin' AND perfil_municipal = 'admin' AND estado = 'activo' FOR UPDATE")
            ->getResultArray());
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
            'perfil_municipal' => $usuario->perfil_municipal,
            'nombres'       => $usuario->nombres,
            'apellidos'     => $usuario->apellidos,
            'email'         => $usuario->email,
            'telefono'      => $usuario->telefono,
            'estado'        => $usuario->estado,
            'ultimo_acceso' => $usuario->ultimo_acceso ? $usuario->ultimo_acceso->format('Y-m-d H:i:s') : null,
            'terms_accepted_at' => $usuario->terms_accepted_at
                ? $usuario->terms_accepted_at->format('Y-m-d H:i:s')
                : null,
            'terms_version' => $usuario->terms_version,
        ];
    }
}
