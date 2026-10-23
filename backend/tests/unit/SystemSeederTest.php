<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Database\Seeds\SystemSeeder;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * Validación del bootstrap del administrador inicial (SOL-BOOTSTRAP-001).
 * No toca la base de datos ni imprime credenciales.
 */
final class SystemSeederTest extends TestCase
{
    public function testUsernameAusenteFalla(): void
    {
        foreach ([null, '', '   '] as $username) {
            try {
                SystemSeeder::validarCredenciales($username, 'ClaveSegura1!');
                $this->fail('Un username ausente debió detener el bootstrap.');
            } catch (RuntimeException $e) {
                $this->assertStringContainsString('INITIAL_ADMIN_USERNAME', $e->getMessage());
            }
        }
    }

    public function testUsernameInvalidoFalla(): void
    {
        foreach ([str_repeat('a', 61), "admin\ninyectado"] as $username) {
            try {
                SystemSeeder::validarCredenciales($username, 'ClaveSegura1!');
                $this->fail('Un username inválido debió detener el bootstrap.');
            } catch (RuntimeException $e) {
                $this->assertStringContainsString('INITIAL_ADMIN_USERNAME', $e->getMessage());
            }
        }
    }

    public function testPasswordAusenteFalla(): void
    {
        foreach ([null, ''] as $password) {
            try {
                SystemSeeder::validarCredenciales('MDJLO-SOL', $password);
                $this->fail('Un password ausente debió detener el bootstrap.');
            } catch (RuntimeException $e) {
                $this->assertStringContainsString('INITIAL_ADMIN_PASSWORD', $e->getMessage());
            }
        }
    }

    public function testPasswordDebilFalla(): void
    {
        foreach (['Corta1!', '12345678!', 'SinNumero!', 'SinSimbolo1'] as $password) {
            try {
                SystemSeeder::validarCredenciales('MDJLO-SOL', $password);
                $this->fail('Una contraseña débil debió detener el bootstrap.');
            } catch (RuntimeException $e) {
                $this->assertStringContainsString('INITIAL_ADMIN_PASSWORD', $e->getMessage());
                $this->assertStringNotContainsString($password, $e->getMessage());
            }
        }
    }

    public function testCredencialesValidasSeNormalizan(): void
    {
        [$username, $password] = SystemSeeder::validarCredenciales('  MDJLO-SOL  ', 'ClaveSegura1!');

        $this->assertSame('MDJLO-SOL', $username);
        $this->assertSame('ClaveSegura1!', $password);
    }
}
