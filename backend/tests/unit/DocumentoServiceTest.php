<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Services\DocumentoService;
use PHPUnit\Framework\TestCase;
use ZipArchive;

/**
 * Validación de CV por contenido real: PDF, DOC y DOCX se comprueban por
 * separado. El nombre y el Content-Type declarados no determinan el formato;
 * la extensión de almacenamiento se deriva del contenido detectado.
 */
final class DocumentoServiceTest extends TestCase
{
    private string $directorio;

    private DocumentoService $servicio;

    protected function setUp(): void
    {
        parent::setUp();

        $this->directorio = sys_get_temp_dir() . '/sol-documentos-' . bin2hex(random_bytes(6));
        self::assertTrue(mkdir($this->directorio, 0775, true));
        $this->servicio = new DocumentoService();
    }

    protected function tearDown(): void
    {
        foreach (glob($this->directorio . '/*') ?: [] as $archivo) {
            @unlink($archivo);
        }
        @rmdir($this->directorio);

        parent::tearDown();
    }

    private function archivo(string $contenido): string
    {
        $ruta = $this->directorio . '/' . bin2hex(random_bytes(6));
        self::assertNotFalse(file_put_contents($ruta, $contenido));

        return $ruta;
    }

    private function pdf(): string
    {
        return "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n"
            . "startxref\n0\n%%EOF\n";
    }

    private function oleConWordDocument(): string
    {
        return "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1" . str_repeat("\0", 480)
            . "W\0o\0r\0d\0D\0o\0c\0u\0m\0e\0n\0t\0";
    }

    private function docx(bool $conWord = true): string
    {
        $ruta = $this->directorio . '/docx-' . bin2hex(random_bytes(6));
        $zip  = new ZipArchive();
        self::assertTrue($zip->open($ruta, ZipArchive::CREATE) === true);

        $tipos = $conWord
            ? '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                . '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
            : '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';

        $zip->addFromString('[Content_Types].xml', $tipos);
        $zip->addFromString('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
        $zip->close();

        return $ruta;
    }

    public function testDetectaPdfPorContenido(): void
    {
        $formato = $this->servicio->inspeccionar($this->archivo($this->pdf()), 'cualquier-nombre.pdf');

        self::assertSame(['extension' => 'pdf', 'mime' => 'application/pdf'], $formato);
    }

    public function testDetectaDocPorContenedorOleConWordDocument(): void
    {
        $formato = $this->servicio->inspeccionar($this->archivo($this->oleConWordDocument()), 'curriculum.doc');

        self::assertSame(['extension' => 'doc', 'mime' => 'application/msword'], $formato);
    }

    public function testDetectaDocxPorEstructuraOoxml(): void
    {
        $formato = $this->servicio->inspeccionar($this->docx(), 'curriculum.docx');

        self::assertSame(
            'docx',
            $formato['extension'],
        );
        self::assertSame(
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            $formato['mime'],
        );
    }

    public function testLaExtensionAlmacenadaSeDerivaDelContenidoYNoDelNombre(): void
    {
        // Un DOCX real subido con nombre .pdf se almacena como .docx.
        $formato = $this->servicio->inspeccionar($this->docx(), 'cv.pdf');

        self::assertSame('docx', $formato['extension']);
    }

    public function testRechazaPdfSinFirma(): void
    {
        $this->expectException(ApiException::class);
        $this->servicio->inspeccionar($this->archivo('no es un PDF'), 'cv.pdf');
    }

    public function testRechazaPdfSinMarcaEof(): void
    {
        $this->expectException(ApiException::class);
        $this->servicio->inspeccionar($this->archivo("%PDF-1.4\n1 0 obj\n"), 'cv.pdf');
    }

    public function testRechazaOleQueNoEsWord(): void
    {
        $generico = "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1" . str_repeat("\0", 1024);

        $this->expectException(ApiException::class);
        $this->servicio->inspeccionar($this->archivo($generico), 'cv.doc');
    }

    public function testRechazaZipSinEstructuraWord(): void
    {
        $this->expectException(ApiException::class);
        $this->servicio->inspeccionar($this->docx(false), 'cv.docx');
    }

    public function testRechazaCodigoPhpRenombradoComoPdf(): void
    {
        $this->expectException(ApiException::class);
        $this->servicio->inspeccionar($this->archivo('<?php system($_GET["cmd"]);'), 'cv.pdf');
    }

    public function testRechazaExtensionDeclaradaNoPermitida(): void
    {
        $this->expectException(ApiException::class);
        $this->servicio->inspeccionar($this->archivo($this->pdf()), 'cv.pdf.php');
    }

    public function testRechazaNombreTerminadoEnPunto(): void
    {
        $this->expectException(ApiException::class);
        $this->servicio->inspeccionar($this->archivo($this->pdf()), 'cv.pdf.');
    }

    public function testRechazaArchivoVacio(): void
    {
        $this->expectException(ApiException::class);
        $this->servicio->inspeccionar($this->archivo(''), 'cv.pdf');
    }

    public function testRechazaArchivoQueSuperaElTamanoMaximo(): void
    {
        $ruta = $this->archivo(str_repeat('a', DocumentoService::TAMANO_MAXIMO + 1));

        $this->expectException(ApiException::class);
        $this->servicio->inspeccionar($ruta, 'cv.pdf');
    }
}
