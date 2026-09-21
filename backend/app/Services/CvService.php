<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Entities\Cv;
use App\Exceptions\ApiException;
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
    private const MIME_PERMITIDOS = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    private const EXTENSIONES_PERMITIDAS = ['pdf', 'doc', 'docx'];

    private const TAMANO_MAXIMO = 5 * 1024 * 1024;

    /** Máximo de CV que un postulante puede subir por mes calendario. */
    public const LIMITE_MENSUAL = 4;

    private CvModel $cvs;

    private StorageService $storage;

    public function __construct(?CvModel $cvs = null, ?StorageService $storage = null)
    {
        $this->cvs     = $cvs ?? model(CvModel::class);
        $this->storage = $storage ?? new StorageService();
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
        $this->validarArchivo($archivo);

        // El backend es la autoridad: el límite mensual no se puede evadir desde
        // el frontend (se cuenta en MySQL sobre created_at).
        if ($this->cvs->contarDelMes($postulanteId) >= self::LIMITE_MENSUAL) {
            throw ApiException::conflicto(
                'Ha alcanzado el límite de ' . self::LIMITE_MENSUAL . ' CV este mes. Podrá actualizar su CV el próximo mes.',
            );
        }

        $extension = strtolower((string) $archivo->getClientExtension());
        // El objeto se guarda dentro del bucket; la key no repite el nombre del bucket.
        $objectKey = 'postulante-' . $postulanteId . '/' . bin2hex(random_bytes(8)) . '.' . $extension;

        // Almacena primero el archivo (RT-CV-03); luego actualiza metadatos en MySQL.
        $this->storage->almacenar($objectKey, $archivo);

        $version = $this->cvs->siguienteVersion($postulanteId);

        $this->cvs->db->transStart();
        $this->cvs->where('postulante_id', $postulanteId)->set('activo', 0)->update();
        $this->cvs->insert([
            'postulante_id'   => $postulanteId,
            'object_key'      => $objectKey,
            'nombre_original' => $archivo->getClientName(),
            'mime'            => (string) $archivo->getClientMimeType(),
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
        $objectKey = base64_decode(strtr($claveCodificada, '-_', '+/'), true);
        if ($objectKey === false) {
            return null;
        }

        $cv = $this->cvs->where('postulante_id', $postulanteId)->where('object_key', $objectKey)->first();
        if ($cv === null) {
            return null;
        }

        $ruta = $this->storage->rutaLocal($objectKey);

        return $ruta === null ? null : ['ruta' => $ruta, 'nombre' => $cv->nombre_original, 'mime' => $cv->mime];
    }

    private function validarArchivo(UploadedFile $archivo): void
    {
        if (! $archivo->isValid()) {
            throw ApiException::badRequest('El archivo no se recibió correctamente.');
        }

        $extension = strtolower((string) $archivo->getClientExtension());
        $mime      = (string) $archivo->getClientMimeType();

        if (! in_array($extension, self::EXTENSIONES_PERMITIDAS, true)) {
            throw ApiException::validacion('Solo se permiten archivos PDF, DOC o DOCX.', ['Solo se permiten archivos PDF, DOC o DOCX.']);
        }
        if (! in_array($mime, self::MIME_PERMITIDOS, true)) {
            throw ApiException::validacion('El tipo del archivo no es válido.', ['El tipo del archivo no es válido.']);
        }
        if ((int) $archivo->getSize() > self::TAMANO_MAXIMO) {
            throw ApiException::validacion('El CV supera el tamaño máximo de 5 MB.', ['El CV supera el tamaño máximo de 5 MB.']);
        }
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
