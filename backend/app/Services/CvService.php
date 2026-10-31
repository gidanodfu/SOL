<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Entities\Cv;
use App\Exceptions\ApiException;
use App\Libraries\Descarga;
use App\Models\CvModel;
use CodeIgniter\HTTP\Files\UploadedFile;

/**
 * Gestión del CV de un postulante (RF-21, RT-CV-01..RT-CV-08).
 * MySQL guarda metadatos; el archivo vive en Supabase Storage; los nombres de
 * objeto los genera el sistema; se validan extensión/MIME/tamaño y se conservan
 * versiones anteriores.
 */
class CvService
{
    private const TAMANO_MAXIMO = DocumentoService::TAMANO_MAXIMO;

    /** Máximo de CV que un postulante puede subir por mes calendario. */
    public const LIMITE_MENSUAL = 4;

    private CvModel $cvs;

    private StorageService $storage;

    private DocumentoService $documentos;

    public function __construct(
        ?CvModel $cvs = null,
        ?StorageService $storage = null,
        ?DocumentoService $documentos = null,
    ) {
        $this->cvs        = $cvs ?? model(CvModel::class);
        $this->storage    = $storage ?? new StorageService();
        $this->documentos = $documentos ?? new DocumentoService();
    }

    /**
     * @return list<Cv> historial de versiones
     */
    public function historial(int $postulanteId): array
    {
        return $this->cvs->historialDePostulante($postulanteId);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function activo(int $postulanteId): ?array
    {
        $cv = $this->cvs->activoDePostulante($postulanteId);

        return $cv ? $this->publico($cv) : null;
    }

    /**
     * Consumo del límite mensual de CV (RT: máximo 4 por mes calendario).
     *
     * @return array{limite: int, usados: int, restantes: int}
     */
    public function consumoMensual(int $postulanteId): array
    {
        $usados = $this->cvs->contarDelMes($postulanteId);

        return [
            'limite'    => self::LIMITE_MENSUAL,
            'usados'    => $usados,
            'restantes' => max(0, self::LIMITE_MENSUAL - $usados),
        ];
    }

    public function subir(int $postulanteId, UploadedFile $archivo): Cv
    {
        $formato = $this->validarArchivo($archivo);

        // El backend es la autoridad: el límite mensual no se puede evadir desde
        // el frontend (se cuenta en MySQL sobre created_at).
        if ($this->cvs->contarDelMes($postulanteId) >= self::LIMITE_MENSUAL) {
            throw ApiException::conflicto(
                'Ha alcanzado el límite de ' . self::LIMITE_MENSUAL . ' CV este mes. Podrá actualizar su CV el próximo mes.',
            );
        }

        // Nombre de objeto generado por el servidor. La extensión proviene del
        // formato detectado por contenido, nunca del nombre del cliente.
        $objectKey = 'postulante-' . $postulanteId . '/' . bin2hex(random_bytes(8)) . '.' . $formato['extension'];

        // Almacena primero el archivo (RT-CV-03); luego actualiza metadatos en MySQL.
        $this->storage->almacenar($objectKey, $archivo, $formato['mime']);

        $version = $this->cvs->siguienteVersion($postulanteId);

        $this->cvs->db->transStart();
        $this->cvs->where('postulante_id', $postulanteId)->set('activo', 0)->update();
        $this->cvs->insert([
            'postulante_id'   => $postulanteId,
            'object_key'      => $objectKey,
            // Nombre visible saneado (sin rutas ni controles); conserva tildes
            // y apóstrofes. No se usa nunca como ruta física.
            'nombre_original' => Descarga::nombreSeguro($archivo->getClientName(), 'cv.' . $formato['extension']),
            'mime'            => $formato['mime'],
            'tamano'          => (int) $archivo->getSize(),
            'version'         => $version,
            'activo'          => 1,
        ]);
        $this->cvs->db->transComplete();

        if (! $this->cvs->db->transStatus()) {
            throw ApiException::conflicto('No se pudo actualizar el CV. Intente nuevamente.');
        }

        return $this->cvs->find($this->cvs->getInsertID());
    }

    /**
     * URL temporal firmada del CV vigente del postulante (RT-CV-05). El acceso se
     * controla en el backend: aquí el propio dueño de la cuenta.
     */
    public function urlDescarga(int $postulanteId): string
    {
        $cv = $this->cvs->activoDePostulante($postulanteId);
        if ($cv === null) {
            throw ApiException::noEncontrado('Aún no ha cargado un CV.');
        }

        return $this->storage->urlTemporal($cv->object_key);
    }

    /**
     * Ruta local para streaming (solo driver local y tras autorización del dueño).
     */
    public function archivoLocalDelDuenno(int $postulanteId, string $claveCodificada): ?array
    {
        $objectKey = self::decodificarClave($claveCodificada);
        if ($objectKey === null) {
            return null;
        }

        $cv = $this->cvs->where('postulante_id', $postulanteId)->where('object_key', $objectKey)->first();
        if ($cv === null) {
            return null;
        }

        $ruta = $this->storage->rutaLocal($objectKey);

        return $ruta === null ? null : [
            'ruta'   => $ruta,
            'nombre' => $cv->nombre_original,
            'mime'   => self::mimeDeDocumento($objectKey),
        ];
    }

    /**
     * Decodifica una clave URL-safe (Base64 sin padding). Devuelve null si el
     * formato no es el generado por el servidor o si la clave no es segura.
     */
    public static function decodificarClave(string $claveCodificada): ?string
    {
        if ($claveCodificada === '' || strlen($claveCodificada) > 512) {
            return null;
        }
        if (preg_match('/^[A-Za-z0-9_-]+$/', $claveCodificada) !== 1) {
            return null;
        }

        $objectKey = base64_decode(strtr($claveCodificada, '-_', '+/'), true);
        if ($objectKey === false || ! StorageService::claveValida($objectKey)) {
            return null;
        }

        return $objectKey;
    }

    /**
     * MIME canónico derivado de la extensión del objeto almacenado.
     */
    public static function mimeDeDocumento(string $objectKey): string
    {
        return match (strtolower(pathinfo($objectKey, PATHINFO_EXTENSION))) {
            'pdf'   => 'application/pdf',
            'doc'   => 'application/msword',
            'docx'  => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            default => 'application/octet-stream',
        };
    }

    /**
     * @return array{extension: string, mime: string}
     */
    private function validarArchivo(UploadedFile $archivo): array
    {
        if (! $archivo->isValid()) {
            throw ApiException::badRequest('El archivo no se recibió correctamente.');
        }

        $tamano = (int) $archivo->getSize();
        if ($tamano <= 0) {
            throw ApiException::validacion('El archivo está vacío.', ['El archivo está vacío.']);
        }
        if ($tamano > self::TAMANO_MAXIMO) {
            throw ApiException::validacion('El CV supera el tamaño máximo de 5 MB.', ['El CV supera el tamaño máximo de 5 MB.']);
        }

        return $this->documentos->inspeccionar($archivo->getTempName(), $archivo->getClientName());
    }

    /**
     * @return array<string, mixed>
     */
    private function publico(Cv $cv): array
    {
        return [
            'id'              => $cv->id,
            'nombre_original' => $cv->nombre_original,
            'mime'            => $cv->mime,
            'tamano'          => $cv->tamano,
            'version'         => $cv->version,
            'actualizado'     => $cv->updated_at ? $cv->updated_at->format('Y-m-d H:i:s') : null,
        ];
    }
}
