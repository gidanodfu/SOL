<?php

namespace App\Controllers\Api;

use App\Services\AuthService;
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

        if (empty($datos['username']) || empty($datos['password'])) {
            return $this->response
                ->setStatusCode(422)
                ->setContentType('application/json', 'UTF-8')
                ->setBody(json_encode([
                    'success' => false,
                    'message' => 'Ingrese su usuario y contraseña.',
                    'errors'  => [],
                ], JSON_UNESCAPED_UNICODE));
        }

        return $this->ok(
            $this->auth->login((string) $datos['username'], (string) $datos['password']),
            'Bienvenido.',
        );
    }

    public function renovar()
    {
        $datos = $this->cuerpo();

        if (empty($datos['refresh_token'])) {
            return $this->response
                ->setStatusCode(401)
                ->setContentType('application/json', 'UTF-8')
                ->setBody(json_encode([
                    'success' => false,
                    'message' => 'No se recibió el token de renovación.',
                    'errors'  => [],
                ], JSON_UNESCAPED_UNICODE));
        }

        return $this->ok($this->auth->renovar((string) $datos['refresh_token']), 'Sesión renovada.');
    }

    /**
     * Ingreso o registro de postulante con Google (RF-18 ampliado).
     */
    public function google()
    {
        $datos = $this->cuerpo();

        if (empty($datos['id_token'])) {
            return $this->response
                ->setStatusCode(422)
                ->setContentType('application/json', 'UTF-8')
                ->setBody(json_encode([
                    'success' => false,
                    'message' => 'No se recibió la credencial de Google.',
                    'errors'  => [],
                ], JSON_UNESCAPED_UNICODE));
        }

        return $this->ok(
            $this->auth->autenticarConGoogle((string) $datos['id_token']),
            'Bienvenido.',
        );
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
