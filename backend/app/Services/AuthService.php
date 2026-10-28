<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Entities\Usuario;
use App\Exceptions\ApiException;
use App\Libraries\Identidad;
use App\Libraries\Terminos;
use App\Models\PostulanteModel;
use App\Models\RefreshTokenModel;
use App\Models\UserModel;
use App\Repositories\PostulanteRepository;
use App\Validation\Validador;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Throwable;

/**
 * Autenticación: login, refresh, logout, registro de postulantes y cambio de
 * contraseña (RF-01..RF-06, RF-18). Las contraseñas se guardan con hash seguro
 * (RN-06/RT-20) y el rol siempre proviene de la base de datos (RF-04/RN-07).
 */
class AuthService
{
    private UserModel $users;

    private PostulanteModel $postulantes;

    private RefreshTokenModel $refreshTokens;

    private JwtService $jwt;

    private AuditoriaService $auditoria;

    private PostulanteRepository $perfiles;

    private TurnstileService $turnstile;

    private IdentidadService $identidad;

    public function __construct(
        ?UserModel $users = null,
        ?PostulanteModel $postulantes = null,
        ?RefreshTokenModel $refreshTokens = null,
        ?JwtService $jwt = null,
        ?AuditoriaService $auditoria = null,
        ?PostulanteRepository $perfiles = null,
        ?TurnstileService $turnstile = null,
        ?IdentidadService $identidad = null,
    ) {
        $this->users         = $users ?? model(UserModel::class);
        $this->postulantes   = $postulantes ?? model(PostulanteModel::class);
        $this->refreshTokens = $refreshTokens ?? model(RefreshTokenModel::class);
        $this->jwt           = $jwt ?? new JwtService();
        $this->auditoria     = $auditoria ?? new AuditoriaService();
        $this->perfiles      = $perfiles ?? new PostulanteRepository();
        $this->turnstile     = $turnstile ?? new TurnstileService();
        $this->identidad     = $identidad ?? new IdentidadService();
    }

    /**
     * @return array<string, mixed>
     */
    public function login(string $username, string $password, ?string $turnstileToken = null): array
    {
        $tipo          = Identidad::tipoLogin($username);
        $identificador = Identidad::normalizarLogin($username);

        // Máximo 5 intentos por IP+identificador normalizado cada 5 minutos. Solo
        // cuentan los fallos: el contador se elimina al iniciar sesión correctamente.
        $claveThrottle = $this->claveLogin($tipo . '|' . $identificador);
        $throttler     = service('throttler');
        if (! $throttler->check($claveThrottle, 5, 300)) {
            $espera = max(1, $throttler->getTokenTime());

            throw ApiException::demasiadasSolicitudes(
                'Demasiados intentos de inicio de sesión. Intente nuevamente en ' . $espera . ' segundos.',
                $espera,
            );
        }

        // Verificación anti-bot (Cloudflare Turnstile) antes de tocar credenciales.
        if ($this->turnstile->habilitado()) {
            $this->turnstile->verificar($turnstileToken, $this->ipCliente());
        }

        // El identificador de acceso depende del rol:
        // - empresa: RUC (11 dígitos)
        // - postulante: DNI (8 dígitos)
        // - admin: usuario o su correo
        // El correo no es un identificador alternativo para empresas/postulantes.
        $usuario = $this->buscarUsuarioLogin($tipo, $identificador);

        // Preserva usuarios administrativos con nombres numéricos que contengan
        // separadores: se intenta el valor original solo como usuario admin.
        if ($usuario === null && $tipo !== 'email' && trim($username) !== $identificador) {
            $candidato = $this->users->where('username', trim($username))->first();
            if ($candidato !== null && $candidato->rol === 'admin') {
                $usuario = $candidato;
            }
        }

        if ($tipo === 'email' && ($usuario === null || $usuario->rol !== 'admin')) {
            throw ApiException::noAutorizado(
                'El correo electrónico no se usa para iniciar sesión. Empresas: RUC. Postulantes: DNI. Cuentas Google: use "Continuar con Google".',
            );
        }

        if ($usuario !== null && ! $this->identificadorPermitido($tipo, $usuario->rol)) {
            throw ApiException::noAutorizado('Credenciales inválidas.');
        }

        // Las cuentas creadas exclusivamente con Google no tienen contraseña
        // local utilizable; se evita evaluar el hash temporal.
        if ($usuario !== null && ($usuario->proveedor ?? 'local') === 'google') {
            throw ApiException::noAutorizado('Esta cuenta se autentica con Google. Use "Continuar con Google".');
        }

        // Mensaje único evita enumeración de cuentas (RNF-05).
        if ($usuario === null || ! password_verify($password, $usuario->password_hash)) {
            throw ApiException::noAutorizado('Credenciales inválidas.');
        }
        if ($usuario->estado !== 'activo') {
            throw ApiException::prohibido('Su cuenta está inactiva. Contacte a la Municipalidad.');
        }

        // Una empresa solo accede con su cuenta autorizada (empresa activa), no
        // basta con que el usuario exista.
        if ($usuario->rol === 'empresa' && ! $this->empresaActiva((int) $usuario->id)) {
            throw ApiException::prohibido('La cuenta de empresa no está habilitada para acceder. Contacte a la Municipalidad.');
        }

        $throttler->remove($claveThrottle);

        $this->users->update($usuario->id, ['ultimo_acceso' => date('Y-m-d H:i:s')]);
        $this->auditoria->registrar($usuario->id, 'login', 'user', $usuario->id, [
            'perfil_municipal' => $usuario->perfil_municipal ?? null,
        ]);

        return $this->sesionIniciada($usuario);
    }

    /**
     * Busca el usuario según el formato del identificador. Para correo exige
     * coincidencia única; si hay duplicados históricos no se elige una cuenta al
     * azar.
     */
    private function buscarUsuarioLogin(string $tipo, string $identificador): ?Usuario
    {
        if ($tipo === 'email') {
            $usuarios = $this->users->where('email', $identificador)->findAll();

            return count($usuarios) === 1 ? $usuarios[0] : null;
        }

        return $this->users->where('username', $identificador)->first();
    }

    private function identificadorPermitido(string $tipo, string $rol): bool
    {
        return match ($tipo) {
            'email'   => $rol === 'admin',
            'ruc'     => in_array($rol, ['empresa', 'admin'], true),
            'dni'     => in_array($rol, ['postulante', 'admin'], true),
            'usuario' => $rol === 'admin',
            default   => false,
        };
    }

    private function empresaActiva(int $userId): bool
    {
        return $this->users->db->table('empresas')
            ->where('user_id', $userId)
            ->where('estado', 'activo')
            ->countAllResults() > 0;
    }

    /**
     * Clave de throttling del login (IP + identificador normalizado), segura para el cache.
     */
    private function claveLogin(string $username): string
    {
        return sha1('login|' . ($this->ipCliente() ?? 'cli') . '|' . mb_strtolower($username));
    }

    /**
     * IP del cliente para el `remoteip` de Turnstile. Null si no está disponible.
     */
    private function ipCliente(): ?string
    {
        try {
            $ip = trim((string) service('request')->getIPAddress());

            return $ip === '' ? null : $ip;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function renovar(string $refreshToken): array
    {
        $hash = $this->jwt->hashRefreshToken($refreshToken);
        $fila = $this->refreshTokens->vigente($hash);

        if ($fila === null) {
            throw ApiException::noAutorizado('La sesión expiró. Inicie sesión nuevamente.');
        }

        $usuario = $this->users->find($fila['user_id']);
        if ($usuario === null || $usuario->estado !== 'activo') {
            $this->refreshTokens->revocar($hash);
            throw ApiException::noAutorizado('Su cuenta no se encuentra activa.');
        }

        // Rotación del refresh token.
        $this->refreshTokens->revocar($hash);

        return $this->sesionIniciada($usuario);
    }

    /**
     * @return array<string, mixed>
     */
    private function sesionIniciada($usuario): array
    {
        $token      = $this->jwt->generarRefreshToken();
        $expiraDias = (int) (env('jwt.refreshExpiresDays') ?: 15);

        $this->refreshTokens->insert([
            'user_id'    => $usuario->id,
            'token_hash' => $this->jwt->hashRefreshToken($token),
            'expires_at' => date('Y-m-d H:i:s', strtotime("+{$expiraDias} days")),
            'revocado'   => 0,
        ]);

        return [
            'access_token'  => $this->jwt->crearAccessToken($usuario),
            'refresh_token' => $token,
            'token_type'    => 'Bearer',
            'expira_en'     => (int) (env('jwt.accessExpiresMinutes') ?: 120) * 60,
            'usuario'       => $this->publico($usuario),
        ];
    }

    public function logout(int $usuarioId): void
    {
        $this->refreshTokens->revocarTodos($usuarioId);
    }

    /**
     * Registro de postulante (RF-18). Crea la cuenta con rol postulante y, como
     * el flujo es "registro → cuenta creada → login automático", devuelve una
     * sesión iniciada para que el ciudadano llegue directo a la bolsa de empleo.
     *
     * @param array<string, mixed> $datos
     *
     * @return array<string, mixed>
     */
    public function registrarPostulante(array $datos): array
    {
        $datos['dni']      = Identidad::dni($datos['dni'] ?? '');
        $datos['email']    = Identidad::email($datos['email'] ?? null);
        $datos['telefono'] = Identidad::telefono($datos['telefono'] ?? null);

        Validador::validar($datos, [
            'dni'            => ['required', 'dni'],
            'nombres'        => ['required', 'max:100'],
            'apellidos'      => ['required', 'max:100'],
            'email'          => ['email'],
            'telefono'       => ['telefono'],
            'password'       => ['required', 'password'],
            'password2'      => ['required', 'igual:password'],
            'terms_accepted' => ['required', 'aceptacion'],
        ]);

        $dni = $datos['dni'];
        if ($this->users->buscarPorUsername($dni) !== null) {
            throw ApiException::conflicto('Este DNI ya está asociado a una cuenta. Verifica tus datos o utiliza el acceso de la cuenta existente.');
        }

        $this->identidad->exigirLibre('dni', $dni);
        $this->identidad->exigirLibre('email', $datos['email']);
        $this->identidad->exigirLibre('telefono', $datos['telefono']);

        try {
            $this->users->db->transStart();

            $this->users->insert([
                'username'          => $dni,
                'password_hash'     => password_hash($datos['password'], PASSWORD_DEFAULT),
                'rol'               => 'postulante',
                'nombres'           => $datos['nombres'],
                'apellidos'         => $datos['apellidos'],
                'email'             => $datos['email'],
                'telefono'          => $datos['telefono'],
                'estado'            => 'activo',
                'terms_accepted_at' => date('Y-m-d H:i:s'),
                'terms_version'     => Terminos::VERSION,
            ]);
            $userId = (int) $this->users->getInsertID();

            $this->postulantes->insert([
                'user_id'        => $userId,
                'tipo_documento' => 'DNI',
                'dni'            => $dni,
                'nombres'        => $datos['nombres'],
                'apellidos'      => $datos['apellidos'],
            ]);

            $this->identidad->reservar('dni', $dni, $userId);
            $this->identidad->reservar('email', $datos['email'], $userId);
            $this->identidad->reservar('telefono', $datos['telefono'], $userId);

            $this->users->db->transComplete();

            if ($this->users->db->transStatus() === false) {
                throw ApiException::conflicto('No se pudo crear la cuenta. Verifique los datos.');
            }
        } catch (ApiException $e) {
            $this->users->db->transRollback();
            throw $e;
        } catch (Throwable $e) {
            $this->users->db->transRollback();
            if (IdentidadService::esDuplicado($e)) {
                throw ApiException::conflicto('Ya existe una cuenta con estos datos. Verifica tu DNI, correo o teléfono.');
            }
            throw $e;
        }

        $usuario = $this->users->find($userId);
        $this->auditoria->registrar($userId, 'registro', 'user', $userId, ['username' => $dni]);

        return $this->sesionIniciada($usuario);
    }

    /**
     * Ingreso/registro con Google (RF-18 ampliado). Verifica el id_token contra
     * los certificados de Google; si el correo ya existe se inicia sesión y si no
     * se crea una cuenta de postulante sin contraseña (proveedor google).
     *
     * @return array<string, mixed>
     */
    public function autenticarConGoogle(string $idToken): array
    {
        $clientId = (string) env('google.clientId');
        if ($clientId === '') {
            throw ApiException::badRequest('El ingreso con Google no está habilitado en este momento.');
        }

        $payload = $this->verificarIdTokenGoogle($idToken, $clientId);
        $email   = mb_strtolower((string) $payload['email']);

        // Ya existe la cuenta: se inicia sesión si es postulante activo.
        $usuario = null;
        if (! empty($payload['sub'])) {
            $usuario = $this->users->where('proveedor_id', (string) $payload['sub'])->first();
        }
        if ($usuario === null) {
            $usuarios = $this->users->where('email', $email)->findAll();
            if (count($usuarios) > 1) {
                throw ApiException::noAutorizado(
                    'Este correo está asociado a más de una cuenta. Contacte a la Municipalidad para regularizar el acceso.',
                );
            }
            $usuario = $usuarios[0] ?? null;
        }

        if ($usuario !== null) {
            if ($usuario->estado !== 'activo') {
                throw ApiException::prohibido('Su cuenta está inactiva. Contacte a la Municipalidad.');
            }
            if ($usuario->rol !== 'postulante') {
                throw ApiException::noAutorizado('Ese correo pertenece a una cuenta de empresa o de la Municipalidad. Inicie sesión con su usuario y contraseña.');
            }

            $this->auditoria->registrar($usuario->id, 'login_google', 'user', $usuario->id);

            return $this->sesionGoogle($usuario);
        }

        // Cuenta nueva: postulante creado por Google (sin contraseña; el acceso
        // siempre será con Google). El perfil se completa antes de postular.
        $username = mb_substr($email, 0, 60);
        if ($this->users->buscarPorUsername($username) !== null) {
            throw ApiException::conflicto('No se pudo crear la cuenta con este correo. Intente con otra cuenta de Google.');
        }

        $this->identidad->exigirLibre('email', $email);

        try {
            $this->users->db->transStart();

            $this->users->insert([
                'username'      => $username,
                'password_hash' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
                'rol'           => 'postulante',
                'proveedor'     => 'google',
                'proveedor_id'  => (string) ($payload['sub'] ?? null),
                'nombres'       => $payload['given_name'] ?? '',
                'apellidos'     => $payload['family_name'] ?? '',
                'email'         => $email,
                'estado'        => 'activo',
            ]);
            $userId = (int) $this->users->getInsertID();

            $this->postulantes->insert([
                'user_id'        => $userId,
                'tipo_documento' => null,
                'dni'            => null,
                'nombres'        => $payload['given_name'] ?? '',
                'apellidos'      => $payload['family_name'] ?? '',
            ]);

            $this->identidad->reservar('email', $email, $userId);

            $this->users->db->transComplete();

            if (! $this->users->db->transStatus()) {
                throw ApiException::conflicto('No se pudo crear la cuenta con Google.');
            }
        } catch (ApiException $e) {
            $this->users->db->transRollback();
            throw $e;
        } catch (Throwable $e) {
            $this->users->db->transRollback();
            if (IdentidadService::esDuplicado($e)) {
                throw ApiException::conflicto('Este correo electrónico ya está asociado a una cuenta o solicitud. Inicia sesión o utiliza la opción de recuperación correspondiente.');
            }
            throw $e;
        }

        $nuevo = $this->users->find($userId);
        $this->auditoria->registrar($userId, 'registro_google', 'user', $userId, ['email' => $email]);

        return $this->sesionGoogle($nuevo, true);
    }

    /**
     * Sesión tras ingresar con Google. Para postulantes se informa si la cuenta
     * acaba de crearse y si el perfil permite postular (datos de contacto
     * completos + CV vigente): Google no aporta DNI, teléfono, fecha de
     * nacimiento ni dirección, así que el ciudadano debe completarlos antes de
     * usar la bolsa (RF-18 ampliado). Solo aplica a postulantes; empresa y
     * Municipalidad no ingresan por Google.
     *
     * @return array<string, mixed>
     */
    private function sesionGoogle($usuario, bool $esNuevo = false): array
    {
        $sesion = $this->sesionIniciada($usuario);

        if ($usuario->rol === 'postulante') {
            $postulante = $this->postulantes->porUserId((int) $usuario->id);
            $sesion['es_nuevo']         = $esNuevo;
            $sesion['perfil_completo']  = $postulante !== null
                && $this->perfiles->completitud((int) $postulante->id)['completo'];
        }

        return $sesion;
    }

    /**
     * Verifica el id_token de Google (firma RS256 con sus certificados públicos)
     * y las reclamaciones aud/iss/email.
     *
     * @return array<string, mixed>
     */
    private function verificarIdTokenGoogle(string $idToken, string $clientId): array
    {
        $partes = explode('.', $idToken);
        if (count($partes) !== 3) {
            throw ApiException::noAutorizado('El inicio de sesión con Google no es válido.');
        }

        $cabecera = json_decode(JWT::urlsafeB64Decode($partes[0]), true);
        $kid      = $cabecera['kid'] ?? '';

        $certs = $this->clavesGoogle();
        if ($kid === '' || ! isset($certs[$kid])) {
            throw ApiException::noAutorizado('No se pudo verificar la identidad de Google.');
        }

        try {
            $payload = (array) JWT::decode($idToken, new Key((string) $certs[$kid], 'RS256'));
        } catch (\Throwable) {
            throw ApiException::noAutorizado('El inicio de sesión con Google no es válido o expiró.');
        }

        if (($payload['aud'] ?? null) !== $clientId) {
            throw ApiException::noAutorizado('La aplicación no está autorizada por Google.');
        }
        if (! in_array($payload['iss'] ?? null, ['accounts.google.com', 'https://accounts.google.com'], true)) {
            throw ApiException::noAutorizado('El emisor del token no es Google.');
        }
        if (empty($payload['email']) || empty($payload['email_verified'])) {
            throw ApiException::noAutorizado('La cuenta de Google no tiene un correo verificado.');
        }

        return $payload;
    }

    /**
     * @return array<string, string> mapa kid => certificado PEM
     */
    private function clavesGoogle(): array
    {
        $ctx = stream_context_create(['http' => ['timeout' => 10]]);
        $contenido = @file_get_contents('https://www.googleapis.com/oauth2/v1/certs', false, $ctx);
        if ($contenido === false) {
            throw ApiException::badRequest('No se pudo conectar con Google. Intente nuevamente.');
        }

        $certs = json_decode($contenido, true);

        return is_array($certs) ? $certs : [];
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function cambiarContrasena(int $usuarioId, array $datos): void
    {
        Validador::validar($datos, [
            'password_actual' => ['required'],
            'password'        => ['required', 'password'],
            'password2'       => ['required', 'igual:password'],
        ]);

        $usuario = $this->users->find($usuarioId);
        if ($usuario === null) {
            throw ApiException::noEncontrado('El usuario no existe.');
        }
        if (($usuario->proveedor ?? 'local') === 'google') {
            throw ApiException::prohibido('Esta cuenta se autentica con Google y no tiene contraseña local.');
        }
        if (! password_verify($datos['password_actual'], $usuario->password_hash)) {
            throw ApiException::badRequest('La contraseña actual es incorrecta.');
        }

        $this->users->update($usuarioId, ['password_hash' => password_hash($datos['password'], PASSWORD_DEFAULT)]);
        $this->auditoria->registrar($usuarioId, 'cambio_contrasena', 'user', $usuarioId);
    }

    /**
     * @return array<string, mixed>
     */
    public function publico($usuario): array
    {
        return [
            'id'        => $usuario->id,
            'username'  => $usuario->username,
            'rol'       => $usuario->rol,
            'perfil_municipal' => $usuario->perfil_municipal ?? null,
            'permisos_municipales' => AutorizacionMunicipalService::permisosDe($usuario->perfil_municipal ?? null),
            'proveedor' => $usuario->proveedor ?? 'local',
            'nombres'   => $usuario->nombres,
            'apellidos' => $usuario->apellidos,
            'email'     => $usuario->email,
        ];
    }
}
