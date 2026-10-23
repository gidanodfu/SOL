<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Libraries\Terminos;
use PHPUnit\Framework\TestCase;

final class TerminosTest extends TestCase
{
    public function testVersionVigenteYDocumento(): void
    {
        $this->assertSame('1.0', Terminos::VERSION);
        $this->assertSame('terminos-condiciones', Terminos::DOCUMENTO);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', Terminos::ACTUALIZADO_EN);
    }
}
