<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\ActivacionModel;
use App\Models\EmpresaModel;
use App\Models\SolicitudEmpresaModel;
use App\Models\UserModel;
use App\Repositories\SolicitudEmpresaRepository;
use App\Validation\Validador;

/**
 * Solicitudes de registro de empresa: envío público, resolución del admin
 * (aprobar/rechazar) y activación de cuenta con contraseña propia mediante
 * enlace de un solo uso (RF-08..RF-17 adaptados a auto-registro).
 */
class SolicitudEmpresaService
{
    private SolicitudEmpresaRepository $repository;

    private SolicitudEmpresaModel $solicitudes;

    private ActivacionModel $activaciones;

    private UserModel $users;

    private EmpresaModel $empresas;

    private AuditoriaService $auditoria;

    private EmailService $correo;

    private RucService $ruc;

    public function __construct(
        ?SolicitudEmpresaRepository $repository = null,
        ?SolicitudEmpresaModel $solicitudes = null,
        ?ActivacionModel $activaciones = null,
        ?UserModel $users = null,
        ?EmpresaModel $empresas = null,
        ?AuditoriaService $auditoria = null,
        ?EmailService $correo = null,
        ?RucService $ruc = null,
    ) {
        $this->repository   = $repository ?? new SolicitudEmpresaRepository();
        $this->solicitudes  = $solicitudes ?? model(SolicitudEmpresaModel::class);
        $this->activaciones = $activaciones ?? model(ActivacionModel::class);
        $this->users        = $users ?? model(UserModel::class);
        $this->empresas     = $empresas ?? model(EmpresaModel::class);
        $this->auditoria    = $auditoria ?? new AuditoriaService();
        $this->correo       = $correo ?? new EmailService();
        $this->ruc          = $ruc ?? new RucService();
    }

    /**
     * Registro público: verifica el RUC en SUNAT (autocompleta razón social) y
     * deja la solicitud en estado pendiente para su revisión por la Municipalidad.
     *
     * @param array<string, mixed> $datos
     */
    public function solicitar(array $datos): int
    {
        Validador::validar($datos, [
            'ruc'           => ['required', 'ruc'],
            'email'         => ['required', 'email', 'max:150'],
            'telefono'      => ['required', 'telefono'],
            'representante' => ['required', 'max:150'],
        ]);

        $ruc = $datos['ruc'];

        if ($this->empresas->where('ruc', $ruc)->first() !== null) {
            throw ApiException::conflicto('Ya existe una empresa registrada con este RUC.');
        }
        $activa = $this->solicitudes
            ->where('ruc', $ruc)
            ->whereIn('estado', ['pendiente', 'aprobada'])
            ->first();
        if ($activa !== null) {
            throw ApiException::conflicto('Ya existe una solicitud con este RUC. Espere la respuesta de la Municipalidad.');
        }

        // Verificación del RUC (autocompleta razón social y dirección).
        $info = $this->ruc->consultar($ruc);

        $this->solicitudes->insert([
            'ruc'              => $ruc,
            'razon_social'     => $info['razon_social'],
            'nombre_comercial' => $info['nombre_comercial'],
            'direccion'        => $info['direccion'],
            'email'            => $datos['email'],
            'telefono'         => $datos['telefono'],
            'representante'    => $datos['representante'],
            'estado'           => 'pendiente',
        ]);
        $id = (int) $this->solicitudes->getInsertID();

        $this->auditoria->registrar(null, 'solicitud_empresa', 'solicitud_empresa', $id, ['ruc' => $ruc]);

        return $id;
    }

    /**
     * @param array{estado?: string, q?: string} $filtros
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
        $solicitud = $this->repository->obtener($id);
        if ($solicitud === null) {
            throw ApiException::noEncontrado('La solicitud no existe.');
        }

        return $solicitud;
    }

    /**
     * Aprobación: crea el usuario y la empresa (sin contraseña válida, cuenta
     * inactiva), genera el enlace de activación y notifica por correo. Devuelve
     * el enlace para que el admin pueda reenviarlo (canal interno).
     *
     * @return array{link: string}
     */
    public function aprobar(int $adminId, int $solicitudId): array
    {
        $solicitud = $this->exigirResoluble($solicitudId);

        $this->solicitudes->db->transStart();

        // Contraseña no utilizable hasta que el representante la defina al activar.
        $hashTemporal = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);

        $this->users->insert([
            'username'      => $solicitud['ruc'],
            'password_hash' => $hashTemporal,
            'rol'           => 'empresa',
            'nombres'       => $solicitud['razon_social'],
            'apellidos'     => $solicitud['representante'],
            'email'         => $solicitud['email'],
            'telefono'      => $solicitud['telefono'],
            'estado'        => 'inactivo',
        ]);
        $userId = (int) $this->users->getInsertID();

        $this->empresas->insert([
            'user_id'               => $userId,
            'ruc'                   => $solicitud['ruc'],
            'razon_social'          => $solicitud['razon_social'],
            'nombre_comercial'      => $solicitud['nombre_comercial'],
            'direccion'             => $solicitud['direccion'],
            'telefono'              => $solicitud['telefono'],
            'email'                 => $solicitud['email'],
            'representante'         => $solicitud['representante'],
            'evaluacion_presencial' => 1,
            'estado'                => 'inactivo',
        ]);

        $this->solicitudes->update($solicitudId, [
            'estado'       => 'aprobada',
            'motivo_rechazo' => null,
            'resuelto_por' => $adminId,
            'resuelto_en'  => date('Y-m-d H:i:s'),
        ]);

        $this->solicitudes->db->transComplete();

        if (! $this->solicitudes->db->transStatus()) {
            throw ApiException::conflicto('No se pudo aprobar la solicitud.');
        }

        $link = $this->nuevoEnlace($userId);
        $this->auditoria->registrar($adminId, 'aprobar_solicitud_empresa', 'solicitud_empresa', $solicitudId, ['ruc' => $solicitud['ruc']]);

        // Notificación por correo (best-effort); el enlace queda para el admin.
        $this->correo->enviarPlantilla(
            (string) $solicitud['email'],
            'Tu cuenta ha sido aprobada',
            $this->plantillaAprobacion(),
            [
                'razon_social' => $solicitud['razon_social'],
                'ruc'          => $solicitud['ruc'],
                'link'         => $link,
            ],
        );

        return ['link' => $link];
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function rechazar(int $adminId, int $solicitudId, array $datos): void
    {
        Validador::validar($datos, [
            'motivo' => ['required', 'max:255'],
        ]);
        $solicitud = $this->exigirResoluble($solicitudId);

        $this->solicitudes->update($solicitudId, [
            'estado'         => 'rechazada',
            'motivo_rechazo' => mb_substr((string) $datos['motivo'], 0, 255),
            'resuelto_por'   => $adminId,
            'resuelto_en'    => date('Y-m-d H:i:s'),
        ]);

        $this->auditoria->registrar($adminId, 'rechazar_solicitud_empresa', 'solicitud_empresa', $solicitudId, ['ruc' => $solicitud['ruc']]);

        $this->correo->enviarPlantilla(
            (string) $solicitud['email'],
            'Solicitud no aprobada',
            $this->plantillaRechazo(),
            [
                'razon_social' => $solicitud['razon_social'],
                'motivo'       => (string) $datos['motivo'],
            ],
        );
    }

    /**
     * Regenera el enlace de activación de una solicitud aprobada (el anterior
     * queda invalidado). Permite al admin copiarlo y entregarlo por otro canal.
     */
    public function obtenerEnlace(int $solicitudId): string
    {
        $solicitud = $this->obtener($solicitudId);
        if ($solicitud['estado'] !== 'aprobada') {
            throw ApiException::conflicto('La solicitud no está aprobada.');
        }

        $empresa = $this->empresas->asArray()->where('ruc', $solicitud['ruc'])->first();
        if ($empresa === null) {
            throw ApiException::conflicto('La cuenta de la empresa no existe.');
        }

        $link = $this->nuevoEnlace((int) $empresa['user_id']);

        return $link;
    }

    /**
     * Valida el enlace antes de mostrar el formulario de contraseña.
     *
     * @return array<string, mixed>
     */
    public function verActivacion(string $token): array
    {
        $activacion = $this->activacionVigente($token);

        $empresa = $this->empresas->asArray()->where('user_id', $activacion['user_id'])->first();
        if ($empresa === null) {
            throw ApiException::noAutorizado('El enlace es inválido.');
        }

        return [
            'razon_social' => $empresa['razon_social'],
            'email'        => $empresa['email'],
        ];
    }

    /**
     * El representante define su contraseña; se activa la cuenta y la empresa.
     *
     * @param array<string, mixed> $datos
     */
    public function activar(string $token, array $datos): void
    {
        Validador::validar($datos, [
            'password'  => ['required', 'min:8'],
            'password2' => ['required', 'igual:password'],
        ]);

        $activacion = $this->activacionVigente($token);
        $userId     = (int) $activacion['user_id'];

        $empresa = $this->empresas->asArray()->where('user_id', $userId)->first();
        if ($empresa === null) {
            throw ApiException::noAutorizado('El enlace es inválido.');
        }

        $this->solicitudes->db->transStart();

        $this->users->update($userId, [
            'password_hash' => password_hash((string) $datos['password'], PASSWORD_DEFAULT),
            'estado'        => 'activo',
        ]);
        $this->empresas->update((int) $empresa['id'], ['estado' => 'activo']);
        $this->activaciones->update((int) $activacion['id'], ['usado' => 1]);

        $this->solicitudes->db->transComplete();

        if (! $this->solicitudes->db->transStatus()) {
            throw ApiException::conflicto('No se pudo activar la cuenta.');
        }

        $this->auditoria->registrar($userId, 'activar_cuenta', 'empresa', (int) $empresa['id']);
    }

    /**
     * @return array<string, mixed>
     */
    private function exigirResoluble(int $solicitudId): array
    {
        $solicitud = $this->obtener($solicitudId);
        if ($solicitud['estado'] !== 'pendiente') {
            throw ApiException::conflicto('La solicitud ya fue resuelta.');
        }

        return $solicitud;
    }

    /**
     * @return array<string, mixed>
     */
    private function activacionVigente(string $token): array
    {
        $hash = hash('sha256', $token);
        $fila = $this->activaciones->vigente($hash, 'empresa');
        if ($fila === null) {
            throw ApiException::noAutorizado('El enlace es inválido, ya fue utilizado o está vencido.');
        }

        return $fila;
    }

    /**
     * Crea un token de un solo uso (invalida los anteriores) y devuelve el
     * enlace completo apuntando al frontend.
     */
    private function nuevoEnlace(int $userId): string
    {
        $token = bin2hex(random_bytes(32));
        $dias  = (int) (env('activacion.expiraDias') ?: 7);

        $this->activaciones->revocarDeUsuario($userId);
        $this->activaciones->insert([
            'user_id'    => $userId,
            'token_hash' => hash('sha256', $token),
            'tipo'       => 'empresa',
            'usado'      => 0,
            'expira_en'  => date('Y-m-d H:i:s', strtotime("+{$dias} days")),
        ]);

        $base = rtrim((string) (env('app.frontendUrl') ?: 'http://localhost:5173'), '/');

        return $base . '/activar-cuenta/' . $token;
    }

    private function plantillaAprobacion(): string
    {
        return '<p>Estimado(a) representante de <strong>{{razon_social}}</strong> (RUC {{ruc}}):</p>'
            . '<p>Su solicitud de afiliación al Sistema de Empleo de la Municipalidad de José Leonardo Ortiz ha sido '
            . '<strong>aprobada</strong>.</p>'
            . '<p>Para activar su cuenta y definir su contraseña, ingrese al siguiente enlace:</p>'
            . '<p><a href="{{link}}">Activar cuenta</a></p>'
            . '<p>Después de activarla podrá iniciar sesión con su correo corporativo y la contraseña que defina.</p>'
            . '<p>Si el enlace no funciona, cópielo y péguelo en su navegador: {{link}}</p>';
    }

    private function plantillaRechazo(): string
    {
        return '<p>Estimado(a) representante de <strong>{{razon_social}}</strong>:</p>'
            . '<p>Lamentablemente su solicitud de afiliación no ha sido aprobada por la Municipalidad de José '
            . 'Leonardo Ortiz.</p>'
            . '<p><strong>Motivo:</strong> {{motivo}}</p>'
            . '<p>Puede volver a enviar su solicitud cuando lo considere.</p>';
    }
}
