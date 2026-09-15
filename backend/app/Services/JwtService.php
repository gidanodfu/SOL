<?php

namespace App\Services;

use App\Entities\Usuario;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

/**
 * Emisión y verificación de tokens de acceso JWT (RF-01/RF-02, RT-18).
 * El payload solo identifica al usuario; rol y estado se recargan de MySQL.
 */
class JwtService
{
    private string $secreto;

    private int $expiraMinutos;

    public function __construct()
    {
        $this->secreto = (string) env('jwt.secret');
        $this->expiraMinutos = (int) (env('jwt.accessExpiresMinutes') ?: 120);
    }

    public function crearAccessToken(Usuario $usuario): string
    {
        $ahora = time();

        return JWT::encode(
            [
                'sub'  => $usuario->id,
                'rol'  => $usuario->rol,
                'username' => $usuario->username,
                'iat'  => $ahora,
                'exp'  => $ahora + $this->expiraMinutos * 60,
            ],
            $this->secreto,
            'HS256',
        );
    }

    /**
     * @return array<string, mixed>|null payload si el token es válido
     */
    public function verificar(string $token): ?array
    {
        try {
            return (array) JWT::decode($token, new Key($this->secreto, 'HS256'));
        } catch (\Throwable) {
            return null;
        }
    }

    public function generarRefreshToken(): string
    {
        return bin2hex(random_bytes(32));
    }

    public function hashRefreshToken(string $token): string
    {
        return hash('sha256', $token);
    }
}
