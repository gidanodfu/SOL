<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Libraries\Descarga;
use PHPUnit\Framework\TestCase;

/**
 * Saneamiento único de nombres de descarga: sin inyección de cabeceras, sin
 * rutas y conservando nombres legítimos (tildes, apóstrofes, paréntesis).
 */
final class ContentDispositionTest extends TestCase
{
    public function testNombreSimple(): void
    {
        self::assertSame(
            'attachment; filename="cv.pdf"; filename*=UTF-8\'\'cv.pdf',
            Descarga::contentDisposition('cv.pdf'),
        );
    }

    public function testConservaAcentosYApellidosLegitimos(): void
    {
        $cabecera = Descarga::contentDisposition("José O'Connor (CV).pdf");

        self::assertStringContainsString('filename="Jose_O_Connor_CV_.pdf"', $cabecera);
        self::assertStringContainsString("filename*=UTF-8''Jos%C3%A9%20O%27Connor%20%28CV%29.pdf", $cabecera);
    }

    public function testEliminaInyeccionCrLf(): void
    {
        $cabecera = Descarga::contentDisposition("cv.pdf\r\nX-Injected: 1");

        self::assertStringNotContainsString("\r", $cabecera);
        self::assertStringNotContainsString("\n", $cabecera);
        self::assertStringContainsString('filename="cv.pdfX-Injected_1"', $cabecera);
    }

    public function testEliminaComillasYControles(): void
    {
        $cabecera = Descarga::contentDisposition("cv\"name\0.pdf");

        self::assertStringNotContainsString('"name', $cabecera);
        self::assertStringNotContainsString("\0", $cabecera);
        self::assertStringContainsString('filename="cvname.pdf"', $cabecera);
    }

    public function testReduceARutasALNombreFinal(): void
    {
        self::assertSame('passwd', Descarga::nombreSeguro('../../etc/passwd'));
        self::assertSame('x.pdf', Descarga::nombreSeguro('..\\..\\windows\\x.pdf'));
        self::assertSame('cv.pdf', Descarga::nombreSeguro('/tmp/../tmp/cv.pdf'));
    }

    public function testRecortaPuntosYEspaciosFinales(): void
    {
        self::assertSame('cv.pdf', Descarga::nombreSeguro('cv.pdf... '));
        self::assertSame('cv.pdf', Descarga::nombreSeguro('  cv.pdf  '));
    }

    public function testNombreVacioUsaElValorPorDefecto(): void
    {
        self::assertSame('cv', Descarga::nombreSeguro('', 'cv'));
        self::assertSame('cv', Descarga::nombreSeguro('   ', 'cv'));
        self::assertSame('cv.pdf', Descarga::nombreSeguro('...', 'cv.pdf'));
    }

    public function testNombreLargoSeRecortaConservandoLaExtension(): void
    {
        $nombre = str_repeat('a', 300) . '.pdf';

        $seguro = Descarga::nombreSeguro($nombre);

        self::assertLessThanOrEqual(120, mb_strlen($seguro));
        self::assertStringEndsWith('.pdf', $seguro);
    }

    public function testFallbackAsciiNuncaContieneCaracteresPeligrosos(): void
    {
        $cabecera = Descarga::contentDisposition("测试<script>.pdf");

        self::assertMatchesRegularExpression('/filename="[A-Za-z0-9._-]+"/', $cabecera);
        self::assertStringNotContainsString('<', $cabecera);
    }
}
