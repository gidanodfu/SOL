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

    public function testExtraeUrlDeHrefYDeTextoLano(): void
    {
        $html = '<p>Más info en <a href="https://ejemplo.com/info">ver aquí</a> o escribe https://ejemplo.com/inscripcion</p>';

        $this->assertSame(
            ['https://ejemplo.com/info', 'https://ejemplo.com/inscripcion'],
            $this->sanitizer->extraerUrls($html),
        );
    }

    public function testExtraeYNormalizaUrlConPuntuacionFinal(): void
    {
        $this->assertSame(['https://ejemplo.com/x'], $this->sanitizer->extraerUrls('<p>Visita https://ejemplo.com/x.</p>'));
        $this->assertSame(['http://ejemplo.com'], $this->sanitizer->extraerUrls('<p>http://ejemplo.com</p>'));
    }

    public function testExtraeSinDuplicadosYSinEsquemasPeligrosos(): void
    {
        $html = '<p><a href="javascript:alert(1)">malo</a> https://ok.test/a https://ok.test/a data:text/html,x</p>';

        $this->assertSame(['https://ok.test/a'], $this->sanitizer->extraerUrls($html));
    }

    public function testExtraeVacioSinUrls(): void
    {
        $this->assertSame([], $this->sanitizer->extraerUrls('<p>Sin enlaces aquí</p>'));
        $this->assertSame([], $this->sanitizer->extraerUrls(null));
    }

    public function testRespetaElOrdenDelDocumento(): void
    {
        $html = '<p>A https://uno.test/a y <a href="https://dos.test/b">dos</a></p>';

        $this->assertSame(['https://uno.test/a', 'https://dos.test/b'], $this->sanitizer->extraerUrls($html));
    }

    public function testRemoverUrlEliminaSoloLaPromovida(): void
    {
        // TEST 1/2: se elimina solo esa URL, el resto del texto se conserva.
        $this->assertSame('<p>Evento</p>', $this->sanitizer->removerUrl('<p>Evento https://ejemplo.com</p>', 'https://ejemplo.com'));
        $this->assertSame('<p>Evento más información</p>', $this->sanitizer->removerUrl('<p>Evento https://ejemplo.com más información</p>', 'https://ejemplo.com'));

        // TEST 3: la segunda URL permanece.
        $resto = $this->sanitizer->removerUrl('<p>https://ejemplo.com/info y https://ejemplo.com/registro</p>', 'https://ejemplo.com/info');
        $this->assertStringContainsString('https://ejemplo.com/registro', (string) $resto);
        $this->assertStringNotContainsString('https://ejemplo.com/info', (string) $resto);
    }

    public function testRemoverUrlConAnclaYEsIdempotente(): void
    {
        $html = '<p>Para inscribirte <a href="https://x.test/reg" target="_blank" rel="noopener noreferrer">haz clic aquí</a></p>';
        $limpio = $this->sanitizer->removerUrl($html, 'https://x.test/reg');

        $this->assertStringNotContainsString('x.test', (string) $limpio);
        $this->assertStringContainsString('haz clic aquí', (string) $limpio);

        // Ancla cuyo texto ES la URL: se elimina por completo.
        $this->assertNull($this->sanitizer->removerUrl('<p><a href="https://x.test">https://x.test</a></p>', 'https://x.test'));

        // Idempotente: aplicar de nuevo no cambia el resultado.
        $this->assertSame($limpio, $this->sanitizer->removerUrl($limpio, 'https://x.test/reg'));

        // Sin coincidencia: no toca el contenido.
        $this->assertSame('<p>Sin enlaces</p>', $this->sanitizer->removerUrl('<p>Sin enlaces</p>', 'https://nope.test'));
    }
}
