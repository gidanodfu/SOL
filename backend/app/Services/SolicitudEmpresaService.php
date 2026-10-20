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

        // Correo transaccional de activación (best-effort). Un fallo del envío NO
        // revierte la aprobación: la cuenta ya está creada y el enlace disponible.
        $enviado = $this->enviarCorreoActivacion($solicitud, $link);

        return [
            'link'           => $link,
            'correo_enviado' => $enviado,
            'correo_destino' => (string) $solicitud['email'],
        ];
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
        $this->exigirNoActivada($empresa);

        $link = $this->nuevoEnlace((int) $empresa['user_id']);

        return $link;
    }

    /**
     * Reenvía el correo de activación de una solicitud aprobada. Regenera el
     * enlace (el anterior queda invalidado por seguridad) y devuelve el
     * resultado del envío para que el administrador lo vea.
     *
     * @return array{link: string, correo_enviado: bool, correo_destino: string}
     */
    public function reenviarActivacion(int $adminId, int $solicitudId): array
    {
        $solicitud = $this->obtener($solicitudId);
        if ($solicitud['estado'] !== 'aprobada') {
            throw ApiException::conflicto('La solicitud no está aprobada.');
        }

        $empresa = $this->empresas->asArray()->where('ruc', $solicitud['ruc'])->first();
        if ($empresa === null) {
            throw ApiException::conflicto('La cuenta de la empresa no existe.');
        }
        $this->exigirNoActivada($empresa);

        $link    = $this->nuevoEnlace((int) $empresa['user_id']);
        $enviado = $this->enviarCorreoActivacion($solicitud, $link);

        $this->auditoria->registrar($adminId, 'reenviar_activacion_empresa', 'solicitud_empresa', $solicitudId, ['ruc' => $solicitud['ruc']]);

        return [
            'link'           => $link,
            'correo_enviado' => $enviado,
            'correo_destino' => (string) $solicitud['email'],
        ];
    }

    /**
     * Envía (best-effort) el correo de activación de empresa. Nunca propaga el
     * error del proveedor: la operación de negocio ya está confirmada.
     *
     * @param array<string, mixed> $solicitud
     */
    private function enviarCorreoActivacion(array $solicitud, string $link): bool
    {
        return $this->correo->enviarActivacionEmpresa(
            (string) $solicitud['email'],
            $link,
            [
                'razon_social' => (string) ($solicitud['razon_social'] ?? ''),
                'ruc'          => (string) ($solicitud['ruc'] ?? ''),
                'expira_dias'  => (int) (env('activacion.expiraDias') ?: 7),
            ],
        );
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
        $this->exigirCuentaLocal((int) $empresa['user_id']);
        $this->exigirNoActivada($empresa);

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
        $this->exigirCuentaLocal($userId);
        $this->exigirNoActivada($empresa);

        $this->solicitudes->db->transStart();

        // Consumo atómico del token: dos solicitudes simultáneas no pueden
        // activar la misma cuenta con el mismo enlace.
        $this->activaciones
            ->where('id', (int) $activacion['id'])
            ->where('usado', 0)
            ->set('usado', 1)
            ->set('usado_en', date('Y-m-d H:i:s'))
            ->update();

        if ($this->activaciones->db->affectedRows() !== 1) {
            $this->solicitudes->db->transRollback();
            throw ApiException::conflicto('El enlace ya fue utilizado. Solicite uno nuevo.');
        }

        $this->users->update($userId, [
            'password_hash' => password_hash((string) $datos['password'], PASSWORD_DEFAULT),
            'estado'        => 'activo',
        ]);
        $this->empresas->update((int) $empresa['id'], ['estado' => 'activo']);

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

    private function exigirCuentaLocal(int $userId): void
    {
        $usuario = $this->users->find($userId);
        if ($usuario !== null && ($usuario->proveedor ?? 'local') === 'google') {
            throw ApiException::prohibido('Esta cuenta se autentica con Google y no admite contraseña local.');
        }
    }

    /**
     * Una cuenta está activada si su empresa está activa o si algún enlace fue
     * realmente consumido. `usado=1` sin `usado_en` es solo una revocación.
     *
     * @param array<string, mixed> $empresa
     */
    private function empresaActivada(array $empresa): bool
    {
        if (($empresa['estado'] ?? '') === 'activo') {
            return true;
        }

        $usuario = $this->users->find((int) $empresa['user_id']);
        if ($usuario !== null && $usuario->estado === 'activo') {
            return true;
        }

        return $this->activaciones
            ->where('user_id', (int) $empresa['user_id'])
            ->where('usado', 1)
            ->where('usado_en IS NOT NULL', null, false)
            ->countAllResults() > 0;
    }

    /**
     * @param array<string, mixed> $empresa
     */
    private function exigirNoActivada(array $empresa): void
    {
        if ($this->empresaActivada($empresa)) {
            throw ApiException::conflicto('La cuenta ya está activada.');
        }
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

        return self::enlaceActivacion($this->baseUrlFrontend(), $token);
    }

    /**
     * Base pública del frontend, configurable por entorno. Reutiliza APP_URL y,
     * si no existe, la variable equivalente app.frontendUrl. Nunca asume
     * localhost ni usa la URL de una petición concreta.
     */
    private function baseUrlFrontend(): string
    {
        $base = rtrim((string) (env('APP_URL') ?: env('app.frontendUrl')), '/');
        if ($base === '') {
            throw ApiException::badRequest('Falta configurar APP_URL (o app.frontendUrl) para generar el enlace de activación.');
        }

        return $base;
    }

    /**
     * Construye la URL de activación normalizando la barra final (evita "//").
     */
    public static function enlaceActivacion(string $base, string $token): string
    {
        return rtrim($base, '/') . '/activar-cuenta/' . $token;
    }

    private function plantillaRechazo(): string
    {
        return '<h2 style="margin:0 0 12px;font-size:18px;color:#0b2a4a;">Solicitud no aprobada</h2>'
            . '<p style="margin:0 0 12px;">Estimado(a) representante de <strong>{{razon_social}}</strong>:</p>'
            . '<p style="margin:0 0 12px;">Lamentablemente su solicitud de afiliación no ha sido aprobada por la '
            . 'Municipalidad Distrital de José Leonardo Ortiz.</p>'
            . '<p style="margin:0 0 12px;"><strong>Motivo:</strong> {{motivo}}</p>'
            . '<p style="margin:0;color:#6b7280;font-size:13px;">Puede volver a enviar su solicitud cuando lo considere.</p>';
    }
}
