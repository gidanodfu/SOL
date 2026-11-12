<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Libraries\PerfDiagnostics;
use PHPUnit\Framework\TestCase;

final class PerfDiagnosticsTest extends TestCase
{
    public function testNormalizaConsultasSinValoresSensibles(): void
    {
        $sql = "SELECT * FROM users WHERE id = 42 AND email = 'persona@example.test' AND estado = \"activo\"";
        $normalizada = PerfDiagnostics::normalizar($sql);

        $this->assertStringNotContainsString('42', $normalizada);
        $this->assertStringNotContainsString('persona@example.test', $normalizada);
        $this->assertStringNotContainsString('activo', $normalizada);
        $this->assertStringContainsString('SELECT * FROM users WHERE id = ?', $normalizada);
        $this->assertStringContainsString('email = ?', $normalizada);
    }

    public function testConservaLaFormaDeLaConsultaParaElFingerprint(): void
    {
        $a = PerfDiagnostics::normalizar('SELECT id FROM ofertas WHERE empresa_id IN (1, 2, 3)');
        $b = PerfDiagnostics::normalizar('SELECT id FROM ofertas WHERE empresa_id IN (8, 9)');

        $this->assertSame($a, $b);
        $this->assertStringContainsString('IN (', $b);
        $this->assertDoesNotMatchRegularExpression('/\d/', $b);
    }
}
