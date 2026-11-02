<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Entities\Cv;
use App\Exceptions\ApiException;
use App\Libraries\Descarga;
use App\Models\CvModel;
use CodeIgniter\HTTP\Files\UploadedFile;

/**
 * Gestión del CV de un postulante (RF-21, RT-CV-01..RT-CV-09).
 * MySQL guarda metadatos; el archivo vive en Supabase Storage; los nombres de
 * objeto los genera el sistema; se validan extensión/MIME/tamaño y se conservan
 * versiones anteriores.
 *
 * No existe cuota mensual: cada carga se protege con rate limiting configurable
 * y con un bloqueo de aplicación que impide dos cargas simultáneas del mismo
 * postulante. La integridad sigue garantizada por la transacción y por las
 * restricciones de MySQL (cv_activos).
 */
class CvService
{
    private const TAMANO_MAXIMO = DocumentoService::TAMANO_MAXIMO;

    private CvModel $cvs;

    private StorageService $storage;

    private DocumentoService $documentos;

    private CvRateLimiter $limiter;

    public function __construct(
        ?CvModel $cvs = null,
        ?StorageService $storage = null,
        ?DocumentoService $documentos = null,
        ?CvRateLimiter $limiter = null,
    ) {
        $this->cvs        = $cvs ?? model(CvModel::class);
        $this->storage    = $storage ?? new StorageService();
        $this->documentos = $documentos ?? new DocumentoService();
        $this->limiter    = $limiter ?? new CvRateLimiter($this->cvs->db);
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
     * Sube una nueva versión del CV.
     *
     * El bloqueo por postulante impide dos cargas simultáneas. Después de
     * validar el archivo se consume el rate limiting (usuario + IP). Si algún
     * límite está agotado se lanza 429 antes de abrir la transacción, por lo que
     * el CV vigente y su historial permanecen intactos.
     */
    public function subir(int $postulanteId, UploadedFile $archivo, int $usuarioId, string $ip): Cv
    {
        $bloqueo = $this->adquirirBloqueo($postulanteId);

        try {
            $formato = $this->validarArchivo($archivo);

            // Los archivos inválidos no consumen cupo. Las cargas válidas sí,
            // incluso si luego falla el almacenamiento: el límite protege el
            // recurso, no solo los registros creados.
            $this->limiter->consumir($usuarioId, $ip);

            $db        = $this->cvs->db;
            $objectKey = null;

            if (! $db->transBegin()) {
                throw ApiException::conflicto('No se pudo actualizar el CV. Intente nuevamente.');
            }

            $cvId = 0;

            try {
                // Serializa versiones y el cambio de CV activo del mismo
                // postulante. El bloqueo de aplicación ya evita la carrera,
                // pero el FOR UPDATE mantiene la garantía en la base.
                $db->query('SELECT id FROM postulantes WHERE id = ? FOR UPDATE', [$postulanteId]);

                // Nombre de objeto generado por el servidor. La extensión proviene
                // del formato detectado por contenido, nunca del nombre del cliente.
                $objectKey = 'postulante-' . $postulanteId . '/' . bin2hex(random_bytes(8)) . '.' . $formato['extension'];
                $this->storage->almacenar($objectKey, $archivo, $formato['mime']);

                $version = $this->cvs->siguienteVersion($postulanteId);

                if ($this->cvs->where('postulante_id', $postulanteId)->set('activo', 0)->update() === false) {
                    throw new \RuntimeException('No se pudo desactivar el CV anterior.');
                }

                $insertado = $this->cvs->insert([
                    'postulante_id'   => $postulanteId,
                    'object_key'      => $objectKey,
                    // Nombre visible saneado (sin rutas ni controles); conserva
                    // tildes y apóstrofes. No se usa nunca como ruta física.
                    'nombre_original' => Descarga::nombreSeguro($archivo->getClientName(), 'cv.' . $formato['extension']),
                    'mime'            => $formato['mime'],
                    'tamano'          => (int) $archivo->getSize(),
                    'version'         => $version,
                    'activo'          => 1,
                ]);

                if ($insertado === false) {
                    throw new \RuntimeException('No se pudo registrar la versión del CV.');
                }

                $cvId = (int) $this->cvs->getInsertID();

                // Restricción única de CV activo por postulante. La fila se
                // actualiza al nuevo CV dentro de la misma transacción.
                $db->query(
                    'INSERT INTO cv_activos (postulante_id, cv_id, created_at) '
                    . 'VALUES (?, ?, NOW()) '
                    . 'ON DUPLICATE KEY UPDATE cv_id = VALUES(cv_id), created_at = NOW()',
                    [$postulanteId, $cvId],
                );

                if (! $db->transStatus()) {
                    throw ApiException::conflicto('No se pudo actualizar el CV. Intente nuevamente.');
                }

                $db->transCommit();
            } catch (\Throwable $e) {
                $db->transRollback();

                if ($objectKey !== null) {
                    try {
                        $this->storage->eliminar($objectKey);
                    } catch (\Throwable) {
                        // Compensación best-effort: el error original manda.
                    }
                }

                throw $e;
            }

            // La lectura se hace después del commit: si fallara, no se debe
            // compensar un archivo cuya transacción ya quedó confirmada.
            return $this->cvs->find($cvId);
        } finally {
            $this->liberarBloqueo($bloqueo);
        }
    }

    /**
     * Bloqueo de aplicación por postulante. GET_LOCK(name, 0) no espera: si
     * otra carga está en curso se rechaza de inmediato con 429.
     */
    private function adquirirBloqueo(int $postulanteId): string
    {
        $clave = 'sol_cv_' . $postulanteId;
        $fila  = $this->cvs->db->query('SELECT GET_LOCK(?, 0) AS adquirido', [$clave])->getRowArray();

        if ((int) ($fila['adquirido'] ?? 0) !== 1) {
            throw ApiException::demasiadasSolicitudes(
                'Ya hay una carga de CV en curso para este postulante. Intente nuevamente en unos segundos.',
                1,
            );
        }

        return $clave;
    }

    private function liberarBloqueo(string $clave): void
    {
        try {
            $this->cvs->db->query('SELECT RELEASE_LOCK(?)', [$clave]);
        } catch (\Throwable) {
            // La conexión libera sus bloqueos al cerrarse; se conserva el
            // error original si algo falló antes.
        }
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
