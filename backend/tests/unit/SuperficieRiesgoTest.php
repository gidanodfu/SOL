<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

/**
 * Comprobaciones estáticas de las superficies señaladas por los avisos de
 * CodeIgniter 4.7.5: ejecución de comandos, CURLRequest compartido y View
 * Parser con contenido de usuario. Si en el futuro se introduce alguna de
 * estas construcciones, esta prueba falla y obliga a revisar el riesgo.
 */
final class SuperficieRiesgoTest extends TestCase
{
    /**
     * @return list<string>
     */
    private function fuentesPhp(): array
    {
        $archivos = [];
        $iterador = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator(rtrim(APPPATH, '/'), RecursiveDirectoryIterator::SKIP_DOTS),
        );

        /** @var SplFileInfo $archivo */
        foreach ($iterador as $archivo) {
            if ($archivo->isFile() && $archivo->getExtension() === 'php') {
                $archivos[] = $archivo->getPathname();
            }
        }

        return $archivos;
    }

    public function testNoHayEjecucionDeComandosDelSistema(): void
    {
        $patron = '/\b(exec|shell_exec|system|passthru|proc_open|popen|pcntl_exec)\s*\(/i';

        foreach ($this->fuentesPhp() as $archivo) {
            $contenido = (string) file_get_contents($archivo);
            self::assertSame(
                0,
                preg_match_all($patron, $contenido),
                'Uso de ejecución de comandos en ' . $archivo,
            );
        }
    }

    public function testNoSeUsaCURLRequestDeCodeIgniter(): void
    {
        $patron = '/CodeIgniter\\\\HTTP\\\\CURLRequest|new\s+CURLRequest|service\(\s*[\'"]curlrequest[\'"]\s*\)/i';

        foreach ($this->fuentesPhp() as $archivo) {
            $contenido = (string) file_get_contents($archivo);
            self::assertSame(
                0,
                preg_match_all($patron, $contenido),
                'Uso de CURLRequest en ' . $archivo,
            );
        }
    }

    public function testNoSeUsaViewParserNiRenderStringConContenidoExterno(): void
    {
        $patron = '/renderString\s*\(|new\s+\\\\?CodeIgniter\\\\View\\\\Parser|service\(\s*[\'"]parser[\'"]\s*\)/i';

        foreach ($this->fuentesPhp() as $archivo) {
            $contenido = (string) file_get_contents($archivo);
            self::assertSame(
                0,
                preg_match_all($patron, $contenido),
                'Uso de View Parser en ' . $archivo,
            );
        }
    }

    public function testAutoRoutingPermaneceDesactivado(): void
    {
        self::assertFalse(config('Routing')->autoRoute);
    }
}
