<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use ZipArchive;

/**
 * Inspección del contenido real de un CV. No confía en el nombre, en la
 * extensión declarada ni en el Content-Type enviados por el navegador:
 * la firma binaria, la estructura del documento y el MIME detectado por
 * Fileinfo son la autoridad. La extensión con la que se almacena se deriva
 * del formato realmente detectado.
 *
 * Formatos admitidos:
 *  - PDF  : cabecera %PDF- y marca %%EOF final.
 *  - DOC  : contenedor OLE con el stream WordDocument (Word 97-2003).
 *  - DOCX : ZIP OOXML con [Content_Types].xml y word/document.xml.
 */
final class DocumentoService
{
    public const EXTENSIONES = ['pdf', 'doc', 'docx'];

    public const TAMANO_MAXIMO = 5 * 1024 * 1024;

    private const FIRMA_OLE = "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1";

    private const MIMES_PDF = ['application/pdf', 'application/x-pdf'];

    private const MIMES_DOC = [
        'application/msword',
        'application/vnd.ms-office',
        'application/x-ole-storage',
    ];

    private const MIMES_DOCX = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/zip',
        'application/x-zip-compressed',
    ];

    /** Bytes que se inspeccionan para localizar estructuras internas. */
    private const BYTES_INSPECCION = 1024 * 1024;

    /**
     * @return array{extension: string, mime: string}
     *
     * @throws ApiException cuando el archivo no es un PDF/DOC/DOCX válido
     */
    public function inspeccionar(string $ruta, string $nombreOriginal): array
    {
        $tamano = @filesize($ruta);
        if ($tamano === false || $tamano <= 0) {
            throw ApiException::validacion('El archivo está vacío.', ['El archivo está vacío.']);
        }
        if ($tamano > self::TAMANO_MAXIMO) {
            throw ApiException::validacion(
                'El CV supera el tamaño máximo de 5 MB.',
                ['El CV supera el tamaño máximo de 5 MB.'],
            );
        }

        // La extensión declarada solo filtra la intención del usuario; no se
        // usa para decidir el tipo ni para nombrar el objeto almacenado.
        $declarada = strtolower(pathinfo($nombreOriginal, PATHINFO_EXTENSION));
        if (! in_array($declarada, self::EXTENSIONES, true)) {
            throw ApiException::validacion(
                'Solo se permiten archivos PDF, DOC o DOCX.',
                ['Solo se permiten archivos PDF, DOC o DOCX.'],
            );
        }

        $mime  = $this->mimeArchivo($ruta);
        $inicio = (string) @file_get_contents($ruta, false, null, 0, 8);

        if ($this->esPdf($ruta, $inicio, $mime)) {
            return ['extension' => 'pdf', 'mime' => 'application/pdf'];
        }

        if ($this->esWordLegado($ruta, $inicio, $mime)) {
            return ['extension' => 'doc', 'mime' => 'application/msword'];
        }

        if ($this->esDocx($ruta, $inicio, $mime)) {
            return [
                'extension' => 'docx',
                'mime'      => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ];
        }

        throw ApiException::validacion(
            'El archivo no es un documento PDF, DOC o DOCX válido.',
            ['El archivo no es un documento PDF, DOC o DOCX válido.'],
        );
    }

    private function mimeArchivo(string $ruta): string
    {
        try {
            $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($ruta);
        } catch (\Throwable) {
            $mime = false;
        }

        return is_string($mime) ? strtolower(trim($mime)) : '';
    }

    private function esPdf(string $ruta, string $inicio, string $mime): bool
    {
        if (! str_starts_with($inicio, '%PDF-') || ! in_array($mime, self::MIMES_PDF, true)) {
            return false;
        }

        // Un PDF real termina con %%EOF (puede haber espacios, firmas o
        // revisiones finales). Se busca en la cola del archivo.
        $tamano = (int) @filesize($ruta);
        $desde  = max(0, $tamano - 65536);
        $cola   = (string) @file_get_contents($ruta, false, null, $desde);

        return str_contains($cola, '%%EOF');
    }

    private function esWordLegado(string $ruta, string $inicio, string $mime): bool
    {
        if (! str_starts_with($inicio, self::FIRMA_OLE) || ! in_array($mime, self::MIMES_DOC, true)) {
            return false;
        }

        // El contenedor OLE debe incluir el stream WordDocument en su
        // directorio; así se descarta cualquier OLE que no sea de Word.
        $trozos = (string) @file_get_contents($ruta, false, null, 0, self::BYTES_INSPECCION);

        return str_contains($trozos, "W\0o\0r\0d\0D\0o\0c\0u\0m\0e\0n\0t\0");
    }

    private function esDocx(string $ruta, string $inicio, string $mime): bool
    {
        if (! str_starts_with($inicio, "PK\x03\x04") || ! in_array($mime, self::MIMES_DOCX, true)) {
            return false;
        }

        $zip = new ZipArchive();
        if (@$zip->open($ruta, ZipArchive::RDONLY) !== true) {
            return false;
        }

        try {
            $tipos = $zip->statName('[Content_Types].xml');
            $doc   = $zip->statName('word/document.xml');
            if ($tipos === false || $doc === false) {
                return false;
            }

            // No se descomprimen entradas enormes (protección ante zip bombs).
            if ((int) ($tipos['size'] ?? 0) > self::BYTES_INSPECCION) {
                return false;
            }

            $contenido = $zip->getFromName('[Content_Types].xml', self::BYTES_INSPECCION);

            return is_string($contenido) && str_contains($contenido, 'wordprocessingml');
        } finally {
            $zip->close();
        }
    }
}
