<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Services\HtmlSanitizer;
use App\Validation\Validador;
use PHPUnit\Framework\TestCase;

/**
 * Pruebas del HTML enriquecido: sanitización backend (autoridad) y medición
 * canónica del texto visible (misma regla que el contador del frontend).
 */
final class HtmlSanitizerTest extends TestCase
{
    private HtmlSanitizer $sanitizer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->sanitizer = new HtmlSanitizer();
    }

    public function testConservaFormatoPermitido(): void
    {
        $html = '<p>Hola <strong>mundo</strong> <em>curso</em> <u>sub</u></p><ul><li>uno</li></ul>';

        $this->assertSame($html, $this->sanitizer->limpiar($html));
    }

    public function testEliminaScriptEIframeConSuContenido(): void
    {
        $limpio = $this->sanitizer->limpiar('<p>Ok</p><script>alert(1)</script><iframe src="x"></iframe><svg onload=alert(1)></svg>');

        $this->assertSame('<p>Ok</p>', $limpio);
    }

    public function testEliminaEventosYEstilos(): void
    {
        $limpio = $this->sanitizer->limpiar('<p onclick="x()" style="color:red" class="c"><img src=x onerror=alert(1)>Texto</p>');

        $this->assertSame('<p>Texto</p>', $limpio);
    }

    public function testEnlacesSoloHttpYRelForzado(): void
    {
        $javascript = $this->sanitizer->limpiar('<p><a href="javascript:alert(1)">malo</a></p>');
        $this->assertStringNotContainsString('javascript', (string) $javascript);
        $this->assertStringNotContainsString('href', (string) $javascript);

        $data = $this->sanitizer->limpiar('<p><a href="data:text/html;base64,PHNjcmlwdD4=">malo</a></p>');
        $this->assertStringNotContainsString('data:', (string) $data);

        $https = $this->sanitizer->limpiar('<p><a href="https://example.com" target="_blank">ok</a></p>');
        $this->assertStringContainsString('href="https://example.com"', (string) $https);
        $this->assertStringContainsString('rel="noopener noreferrer"', (string) $https);
    }

    public function testContenidoVacioEsNull(): void
    {
        $this->assertNull($this->sanitizer->limpiar('<p><br></p>'));
        $this->assertNull($this->sanitizer->limpiar(''));
        $this->assertNull($this->sanitizer->limpiar(null));
    }

    public function testLongitudCuentaSoloElTextoVisible(): void
    {
        $this->assertSame(10, Validador::longitudTexto('<p>Hola <strong>mundo</strong></p>'));
        $this->assertSame(11, Validador::longitudTexto('<p>Hola <strong>mundo</strong>!</p>'));
        // Las etiquetas no inflan el conteo; las entidades cuentan como su carácter.
        $this->assertSame(5, Validador::longitudTexto('<p>a &amp; b</p>'));
    }

    public function testReglaTextoMaxIgnoraEtiquetas(): void
    {
        $ok = '<p>' . str_repeat('a', 10000) . '</p>';
        Validador::validar(['descripcion' => $ok], ['descripcion' => ['texto_max:10000']]);

        $this->expectException(ApiException::class);
        Validador::validar(['descripcion' => '<p>' . str_repeat('a', 10001) . '</p>'], ['descripcion' => ['texto_max:10000']]);
    }
}
