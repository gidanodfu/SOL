<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Services\EmailService;
use PHPUnit\Framework\TestCase;

/**
 * Pruebas del envío vía Resend SIN red (cliente mockeado). Verifican que un
 * envío aceptado devuelve el id y que un fallo del proveedor se maneja sin
 * romper ni exponer secretos.
 */
final class EmailServiceResendTest extends TestCase
{
    public function testEnvioAceptadoDevuelveId(): void
    {
        $svc = new class extends EmailService {
            protected function apiKey(): string
            {
                return 're_test_key';
            }

            protected function crearCliente(string $apiKey)
            {
                return new class {
                    public object $emails;

                    public function __construct()
                    {
                        $this->emails = new class {
                            public function send(array $p): object
                            {
                                return new class {
                                    public string $id = 'fake-id-123';
                                };
                            }
                        };
                    }
                };
            }
        };

        $this->assertTrue($svc->enviar('destino@test.dev', 'Asunto', '<p>Hola</p>'));
        $this->assertSame('fake-id-123', $svc->ultimoId());
        $this->assertNull($svc->ultimoError());
    }

    public function testFalloDeResendSeManejaSinRomper(): void
    {
        $svc = new class extends EmailService {
            protected function apiKey(): string
            {
                return 're_test_key';
            }

            protected function crearCliente(string $apiKey)
            {
                throw new \RuntimeException('Resend no disponible');
            }
        };

        $this->assertFalse($svc->enviar('destino@test.dev', 'Asunto', '<p>Hola</p>'));
        $this->assertNull($svc->ultimoId());
        $this->assertSame('Resend no disponible', $svc->ultimoError());
    }

    public function testRemitenteCompletoNoSeDuplica(): void
    {
        // "Nombre <correo>" en RESEND_FROM_EMAIL debe usarse tal cual.
        $svc = new class extends EmailService {
            public function remitenteExpuesto(): string
            {
                return $this->remitente();
            }
        };
        putenv('RESEND_FROM_EMAIL=Empleo MDJLO <no-reply@dominio-verificado.test>');
        $_ENV['RESEND_FROM_EMAIL'] = 'Empleo MDJLO <no-reply@dominio-verificado.test>';

        $this->assertSame('Empleo MDJLO <no-reply@dominio-verificado.test>', $svc->remitenteExpuesto());

        putenv('RESEND_FROM_EMAIL');
        unset($_ENV['RESEND_FROM_EMAIL']);
    }
}
