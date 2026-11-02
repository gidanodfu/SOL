<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api;

use App\Exceptions\ApiException;
use App\Services\AuthService;
use App\Services\DniService;
use App\Services\JwtGuard;

/**
 * Autenticación y sesión (RF-01..RF-06). El rol del usuario se lee de MySQL y
 * nunca se recibe desde el frontend (RF-04/RN-08).
 */
class AuthController extends BaseApiController
{
    private AuthService $auth;

    private JwtGuard $guard;

    public function __construct()
    {
        $this->auth  = new AuthService();
        $this->guard = service('guard');
    }

    public function login()
    {
        $datos = $this->cuerpo();

        $username = $datos['username'] ?? null;
        $password = $datos['password'] ?? null;
        if (! is_string($username) || trim($username) === '' || ! is_string($password) || $password === '') {
            throw ApiException::validacion(
                'Ingrese su usuario, RUC o DNI y su contraseña.',
                ['Ingrese su usuario, RUC o DNI y su contraseña.'],
                [
                    'username' => 'Ingrese su usuario, RUC o DNI.',
                    'password' => 'Ingrese su contraseña.',
                ],
            );
        }

        $turnstileToken = $datos['turnstile_token'] ?? $datos['cf-turnstile-response'] ?? null;
        if ($turnstileToken !== null && ! is_string($turnstileToken)) {
            throw ApiException::validacion('La credencial anti-bot no es válida.', ['La credencial anti-bot no es válida.']);
        }

        return $this->ok(
            $this->auth->login(
                (string) $datos['username'],
                (string) $datos['password'],
                $turnstileToken !== null ? (string) $turnstileToken : null,
            ),
            'Bienvenido.',
        );
    }

    public function renovar()
    {
        $datos = $this->cuerpo();

        $refresh = $datos['refresh_token'] ?? null;
        if (! is_string($refresh) || trim($refresh) === '') {
            throw ApiException::noAutorizado('No se recibió el token de renovación.');
        }

        return $this->ok($this->auth->renovar($refresh), 'Sesión renovada.');
    }

    /**
     * Ingreso o registro de postulante con Google (RF-18 ampliado).
     */
    public function google()
    {
        $datos = $this->cuerpo();

        $idToken = $datos['id_token'] ?? null;
        if (! is_string($idToken) || trim($idToken) === '') {
            throw ApiException::validacion('No se recibió la credencial de Google.', ['No se recibió la credencial de Google.']);
        }

        return $this->ok($this->auth->autenticarConGoogle($idToken), 'Bienvenido.');
    }

    /**
     * Verificación pública de DNI (RENIEC) para autocompletar el registro del
     * postulante. El proveedor y su token viven solo en el backend.
     */
    public function verificarDni()
    {
        $dni = $this->cuerpo()['dni'] ?? null;

        if (! is_string($dni) || ! preg_match('/^\d{8}$/', $dni)) {
            return $this->response
                ->setStatusCode(422)
                ->setContentType('application/json', 'UTF-8')
                ->setBody(json_encode([
                    'success' => false,
                    'message' => 'Ingrese un DNI válido (8 dígitos).',
                    'errors'  => [],
                ], JSON_UNESCAPED_UNICODE));
        }

        $datos = (new DniService())->consultar($dni);
        $datos['dni_token'] = service('jwtService')->crearTokenVerificacionDni($dni);

        return $this->ok($datos, 'DNI verificado.');
    }

    public function logout()
    {
        $this->auth->logout($this->guard->id());

        return $this->sinContenido('Sesión cerrada correctamente.');
    }

    public function me()
    {
        return $this->ok($this->auth->publico($this->guard->usuario()), 'Datos de la cuenta.');
    }

    /**
     * Registro público de postulante (RF-18). Solo crea cuentas con rol postulante.
     * La cuenta queda creada y con sesión iniciada automáticamente; el frontend
     * redirige a la bolsa de empleo.
     */
    public function registroPostulante()
    {
        return $this->creado(
            $this->auth->registrarPostulante($this->cuerpo()),
            'Cuenta creada correctamente. Bienvenido.',
        );
    }
}
