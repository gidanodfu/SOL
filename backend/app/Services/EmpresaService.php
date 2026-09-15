<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\EmpresaModel;
use App\Models\UserModel;
use App\Repositories\EmpresaRepository;
use App\Validation\Validador;

/**
 * Registro y administración municipal de empresas (RF-08..RF-17, RN-01..RN-06).
 * Las empresas solo las registra la Municipalidad tras la evaluación presencial;
 * el RUC es el usuario por defecto y la contraseña inicial la crea el admin.
 */
class EmpresaService
{
    private EmpresaRepository $repository;

    private EmpresaModel $empresas;

    private UserModel $users;

    private AuditoriaService $auditoria;

    public function __construct(
        ?EmpresaRepository $repository = null,
        ?EmpresaModel $empresas = null,
        ?UserModel $users = null,
        ?AuditoriaService $auditoria = null,
    ) {
        $this->repository = $repository ?? new EmpresaRepository();
        $this->empresas   = $empresas ?? model(EmpresaModel::class);
        $this->users      = $users ?? model(UserModel::class);
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
        $empresa = $this->repository->obtenerConUsuario($id);
        if ($empresa === null) {
            throw ApiException::noEncontrado('La empresa no existe.');
        }

        $empresa['cantidad_ofertas'] = $this->repository->contarOfertas($id);

        return $empresa;
    }

    /**
     * Registro exclusivo municipal: crea el perfil de empresa y su usuario con
     * RUC como username y contraseña inicial generada/entregada por el admin
     * (RF-08..RF-15).
     *
     * @param array<string, mixed> $datos
     */
    public function crear(int $adminId, array $datos): int
    {
        Validador::validar($datos, [
            'ruc'            => ['required', 'ruc'],
            'razon_social'   => ['required', 'max:200'],
            'nombre_comercial' => ['max:150'],
            'direccion'      => ['max:255'],
            'telefono'       => ['telefono'],
            'email'          => ['email', 'max:150'],
            'representante'  => ['max:150'],
            // Contraseña inicial creada por el administrador (RF-13/RN-05).
            'password'       => ['required', 'min:8'],
        ]);

        $ruc = $datos['ruc'];
        if ($this->empresas->where('ruc', $ruc)->first() !== null) {
            throw ApiException::conflicto('Ya existe una empresa registrada con este RUC.');
        }
        if ($this->users->buscarPorUsername($ruc) !== null) {
            throw ApiException::conflicto('El RUC ya está en uso como nombre de usuario.');
        }

        // La evaluación presencial (RF-09/RN-02) debe constar antes de habilitar.
        $evaluada = ! empty($datos['evaluacion_presencial']);

        $this->users->db->transStart();

        $this->users->insert([
            'username'      => $ruc,
            'password_hash' => password_hash($datos['password'], PASSWORD_DEFAULT),
            'rol'           => 'empresa',
            'nombres'       => $datos['razon_social'],
            'apellidos'     => $datos['representante'] ?? $datos['razon_social'],
            'email'         => $datos['email'] ?? null,
            'telefono'      => $datos['telefono'] ?? null,
            // La cuenta se habilita junto con la empresa (RF-16). Inicia inactiva
            // hasta que la Municipalidad la active.
            'estado'        => $evaluada ? 'activo' : 'inactivo',
        ]);
        $userId = $this->users->getInsertID();

        $this->empresas->insert([
            'user_id'               => $userId,
            'ruc'                   => $ruc,
            'razon_social'          => $datos['razon_social'],
            'nombre_comercial'      => $datos['nombre_comercial'] ?? null,
            'direccion'             => $datos['direccion'] ?? null,
            'telefono'              => $datos['telefono'] ?? null,
            'email'                 => $datos['email'] ?? null,
            'representante'         => $datos['representante'] ?? null,
            'info_adicional'        => $datos['info_adicional'] ?? null,
            'evaluacion_presencial' => (int) $evaluada,
            'estado'                => $evaluada ? 'activo' : 'inactivo',
        ]);
        $empresaId = $this->empresas->getInsertID();

        $this->users->db->transComplete();

        if (! $this->users->db->transStatus()) {
            throw ApiException::conflicto('No se pudo registrar la empresa.');
        }

        $this->auditoria->registrar($adminId, 'crear_empresa', 'empresa', $empresaId, ['ruc' => $ruc]);

        return $empresaId;
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function actualizar(int $adminId, int $id, array $datos): void
    {
        $this->exigirExistente($id);

        Validador::validar($datos, [
            'razon_social'   => ['required', 'max:200'],
            'nombre_comercial' => ['max:150'],
            'direccion'      => ['max:255'],
            'telefono'       => ['telefono'],
            'email'          => ['email', 'max:150'],
            'representante'  => ['max:150'],
        ]);

        $this->empresas->update($id, [
            'razon_social'     => $datos['razon_social'],
            'nombre_comercial' => $datos['nombre_comercial'] ?? null,
            'direccion'        => $datos['direccion'] ?? null,
            'telefono'         => $datos['telefono'] ?? null,
            'email'            => $datos['email'] ?? null,
            'representante'    => $datos['representante'] ?? null,
            'info_adicional'   => $datos['info_adicional'] ?? null,
        ]);
        $this->auditoria->registrar($adminId, 'editar_empresa', 'empresa', $id);
    }

    /**
     * Activar/desactivar empresa; sincroniza el estado de su usuario para que una
     * empresa inactiva no pueda acceder ni operar (RF-16/RF-17, RN-11/RN-12).
     */
    public function cambiarEstado(int $adminId, int $id, string $estado): void
    {
        $empresa = $this->exigirExistente($id);

        Validador::validar(['estado' => $estado], [
            'estado' => ['required', 'enum:activo,inactivo'],
        ]);

        if ($empresa['estado'] === $estado) {
            return;
        }

        $this->empresas->update($id, ['estado' => $estado]);
        $this->users->update((int) $empresa['user_id'], ['estado' => $estado]);

        $this->auditoria->registrar($adminId, $estado === 'activo' ? 'activar_empresa' : 'desactivar_empresa', 'empresa', $id);
    }

    public function resetearContrasena(int $adminId, int $id, string $password): void
    {
        $empresa = $this->exigirExistente($id);

        Validador::validar(['password' => $password], [
            'password' => ['required', 'min:8'],
        ]);

        $this->users->update((int) $empresa['user_id'], ['password_hash' => password_hash($password, PASSWORD_DEFAULT)]);
        $this->auditoria->registrar($adminId, 'resetear_contrasena', 'empresa', $id);
    }

    /**
     * @return array<string, mixed>
     */
    public function deUsuario(int $userId): array
    {
        $empresa = $this->repository->porUserId($userId);
        if ($empresa === null) {
            throw ApiException::noEncontrado('No se encontró la empresa asociada a su cuenta.');
        }

        return $empresa;
    }

    /**
     * @return array<string, mixed>
     */
    public function actualizarPropia(int $userId, array $datos): void
    {
        $empresa = $this->repository->porUserId($userId);
        if ($empresa === null) {
            throw ApiException::noEncontrado('No se encontró la empresa asociada a su cuenta.');
        }

        Validador::validar($datos, [
            'nombre_comercial' => ['max:150'],
            'direccion'        => ['max:255'],
            'telefono'         => ['telefono'],
            'email'            => ['email', 'max:150'],
            'representante'    => ['max:150'],
        ]);

        $this->empresas->update((int) $empresa['id'], [
            'nombre_comercial' => $datos['nombre_comercial'] ?? null,
            'direccion'        => $datos['direccion'] ?? null,
            'telefono'         => $datos['telefono'] ?? null,
            'email'            => $datos['email'] ?? null,
            'representante'    => $datos['representante'] ?? null,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function exigirExistente(int $id): array
    {
        $empresa = $this->repository->obtenerConUsuario($id);
        if ($empresa === null) {
            throw ApiException::noEncontrado('La empresa no existe.');
        }

        return $empresa;
    }
}
