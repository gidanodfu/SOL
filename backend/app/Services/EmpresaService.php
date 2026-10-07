<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\EmpresaModel;
use App\Models\UserModel;
use App\Repositories\EmpresaRepository;
use App\Validation\Validador;
use CodeIgniter\HTTP\Files\UploadedFile;

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

    private StorageService $storage;

    private ImageService $images;

    public function __construct(
        ?EmpresaRepository $repository = null,
        ?EmpresaModel $empresas = null,
        ?UserModel $users = null,
        ?AuditoriaService $auditoria = null,
        ?StorageService $storage = null,
        ?ImageService $images = null,
    ) {
        $this->repository = $repository ?? new EmpresaRepository();
        $this->empresas   = $empresas ?? model(EmpresaModel::class);
        $this->users      = $users ?? model(UserModel::class);
        $this->auditoria  = $auditoria ?? new AuditoriaService();
        $this->storage    = $storage ?? new StorageService();
        $this->images     = $images ?? new ImageService();
    }

    /**
     * @param array<string, mixed> $filtros
     *
     * @return array{data: list<array<string, mixed>>, total: int}
     */
    public function listar(array $filtros, int $limite, int $offset): array
    {
        return [
            'data'  => array_map([$this, 'conImagenPublica'], $this->repository->listar($filtros, $limite, $offset)),
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

        return $this->conImagenPublica($empresa);
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
        // Parseo estricto: el texto "false" no debe habilitar la empresa.
        $evaluada = filter_var($datos['evaluacion_presencial'] ?? false, FILTER_VALIDATE_BOOLEAN);

        $this->users->db->transStart();

        $this->users->insert([
            'username'      => $ruc,
            'password_hash' => password_hash($datos['password'], PASSWORD_DEFAULT),
            'rol'           => 'empresa',
            'nombres'       => $datos['razon_social'],
            // Los datos de la empresa tienen su propia fuente de verdad (tabla empresas);
            // no se replica la razón social en apellidos para evitar duplicados.
            'apellidos'     => $datos['representante'] ?? '',
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

        // Empresa y usuario asociado se actualizan juntos (RF-16/RN-11).
        $this->empresas->db->transStart();
        $this->empresas->update($id, ['estado' => $estado]);
        $this->users->update((int) $empresa['user_id'], ['estado' => $estado]);
        $this->empresas->db->transComplete();

        if (! $this->empresas->db->transStatus()) {
            throw ApiException::conflicto('No se pudo actualizar el estado de la empresa.');
        }

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

        return $this->conImagenPublica($empresa);
    }

    /**
     * Sustituye el logo de la empresa (solo la propia; la autorización viene de la
     * sesión). Reutiliza StorageService; la imagen previa se elimina.
     */
    public function subirLogo(int $userId, UploadedFile $archivo): void
    {
        $empresa = $this->exigirPropia($userId);
        $this->guardarLogo((int) $empresa['id'], $archivo);
    }

    public function eliminarLogo(int $userId): void
    {
        $empresa = $this->exigirPropia($userId);
        $this->quitarLogo((int) $empresa['id']);
    }

    /**
     * Contenido binario del logo (foto de perfil) de una empresa para el proxy de
     * lectura pública. Null si no existe.
     *
     * @return array{mime: string, contenido: string}|null
     */
    public function logoContenido(int $empresaId): ?array
    {
        $key = $this->claveImagen($empresaId, 'logo_key');
        if (empty($key)) {
            return null;
        }

        $contenido = $this->storage->obtenerContenido($key);
        if ($contenido === null) {
            return null;
        }

        return ['mime' => $this->mimeDeImagen($key), 'contenido' => $contenido];
    }

    /**
     * Guarda la foto de perfil (logo) normalizada a 800x800: se conserva el logo
     * completo (contain) sobre fondo blanco, sin recortar texto ni deformar.
     */
    private function guardarLogo(int $empresaId, UploadedFile $archivo): void
    {
        $contenido   = $this->images->leerSubida($archivo);
        $normalizada = $this->images->normalizar($contenido, 'contain', 'png');

        $objectKey = 'empresas/logo/' . $empresaId . '/' . bin2hex(random_bytes(8)) . '.' . $normalizada['extension'];
        $this->storage->almacenarContenido($objectKey, $normalizada['bytes'], $normalizada['mime']);

        $anterior = $this->claveImagen($empresaId, 'logo_key');
        $this->empresas->update($empresaId, ['logo_key' => $objectKey]);

        if ($anterior && $anterior !== $objectKey) {
            $this->storage->eliminar($anterior);
        }
    }

    private function quitarLogo(int $empresaId): void
    {
        $key = $this->claveImagen($empresaId, 'logo_key');
        if ($key) {
            $this->storage->eliminar($key);
        }
        $this->empresas->update($empresaId, ['logo_key' => null]);
    }

    private function claveImagen(int $empresaId, string $columna): ?string
    {
        $fila = $this->empresas->db->table('empresas')
            ->select($columna)
            ->where('id', $empresaId)
            ->get()
            ->getRowArray();

        return $fila[$columna] ?? null;
    }

    /**
     * @param array<string, mixed> $empresa
     *
     * @return array<string, mixed>
     */
    private function conImagenPublica(array $empresa): array
    {
        $empresa['logo_url']  = ! empty($empresa['logo_key']) ? '/api/empresas/' . $empresa['id'] . '/logo' : null;
        $empresa['fecha_alta'] = $empresa['created_at'] ?? null;
        $empresa['antiguedad'] = AntiguedadService::texto($empresa['created_at'] ?? null);
        unset($empresa['logo_key']);

        return $empresa;
    }

    private function mimeDeImagen(string $key): string
    {
        return match (strtolower(pathinfo($key, PATHINFO_EXTENSION))) {
            'png'         => 'image/png',
            'webp'        => 'image/webp',
            default       => 'image/jpeg',
        };
    }

    /**
     * @return array<string, mixed>
     */
    private function exigirPropia(int $userId): array
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
