<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Services\CvService;
use PHPUnit\Framework\TestCase;

/**
 * Decodificación de las claves URL-safe de descarga de CV. Una clave solo es
 * aceptable si corresponde a un objeto generado por el servidor.
 */
final class CvServiceClaveTest extends TestCase
{
    private static function codificar(string $objectKey): string
    {
        return rtrim(strtr(base64_encode($objectKey), '+/', '-_'), '=');
    }

    public function testClaveValidaSeDecodifica(): void
    {
        $objectKey = 'postulante-1/5714477fc1d9643f.pdf';

        self::assertSame($objectKey, CvService::decodificarClave(self::codificar($objectKey)));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function clavesInvalidas(): array
    {
        return [
            'vacía'           => [''],
            'base64 inválido' => ['%%%'],
            'traversal'       => [self::codificar('postulante-1/../../etc/passwd')],
            'absoluta'        => [self::codificar('/etc/passwd')],
            'clave ajena'     => [self::codificar('otros/1/x.pdf')],
            'con espacios'    => [self::codificar('postulante-1/x .pdf')],
            'padding'         => [self::codificar('postulante-1/x.pdf') . '='],
            'larga'           => [str_repeat('A', 600)],
        ];
    }

    /**
     * @dataProvider clavesInvalidas
     */
    public function testClaveInvalidaSeRechaza(string $clave): void
    {
        self::assertNull(CvService::decodificarClave($clave));
    }

    public function testMimeCanonicoPorExtension(): void
    {
        self::assertSame('application/pdf', CvService::mimeDeDocumento('postulante-1/x.pdf'));
        self::assertSame('application/msword', CvService::mimeDeDocumento('postulante-1/x.doc'));
        self::assertSame(
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            CvService::mimeDeDocumento('postulante-1/x.docx'),
        );
        self::assertSame('application/octet-stream', CvService::mimeDeDocumento('postulante-1/x.bin'));
    }
}
