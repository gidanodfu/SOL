<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Services\EmailService;
use PHPUnit\Framework\TestCase;

/**
 * Pruebas unitarias del render de correo (EmailService::preparar). No envían
 * correo ni dependen de la red: verifican el escape de variables y el layout.
 */
final class EmailServiceTest extends TestCase
{
    public function testEscapaContenidoDinamicoEnElCuerpo(): void
    {
        $html = (new EmailService())->preparar('<p>Hola {{nombre}}</p>', [
            'nombre' => '<script>alert(1)</script>',
        ]);

        $this->assertStringNotContainsString('<script>', $html);
        $this->assertStringContainsString('&lt;script&gt;alert(1)&lt;/script&gt;', $html);
    }

    public function testAplicaLayoutInstitucionalRounded(): void
    {
        $html = (new EmailService())->preparar('<p>Contenido</p>', []);

        $this->assertStringContainsString('Empleo MDJLO', $html);
        $this->assertStringContainsString('Contenido', $html);
        $this->assertStringContainsString('border-radius:16px', $html);
        $this->assertStringContainsString('©', $html);
    }

    public function testEscapaUrlEnAtributoHref(): void
    {
        $html = (new EmailService())->preparar('<a href="{{link}}">Ir</a>', [
            'link' => 'https://ejemplo.test/activar?x=1&y=2',
        ]);

        $this->assertStringContainsString('href="https://ejemplo.test/activar?x=1&amp;y=2"', $html);
    }

    public function testContenidoActivacionIncluyeCtaYEscapaDatos(): void
    {
        $html = (new EmailService())->contenidoActivacion(
            'https://x.test/activar-cuenta/abc?y=1&z=2',
            ['razon_social' => '<b>ACME</b>', 'ruc' => '20123456789', 'expira_dias' => 7],
        );

        // CTA presente y datos dinámicos escapados (sin HTML inyectable).
        $this->assertStringContainsString('Activar mi cuenta', $html);
        $this->assertStringNotContainsString('<b>ACME</b>', $html);
        $this->assertStringContainsString('&lt;b&gt;ACME&lt;/b&gt;', $html);
        $this->assertStringContainsString('20123456789', $html);
        // El enlace se escapa correctamente en el atributo href.
        $this->assertStringContainsString('href="https://x.test/activar-cuenta/abc?y=1&amp;z=2"', $html);
        // No filtra credenciales.
        $this->assertStringNotContainsString('re_', $html);
    }
}
