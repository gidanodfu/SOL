<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use CodeIgniter\HTTP\Files\UploadedFile;

/**
 * Almacenamiento de CV en Supabase Storage mediante su API compatible con S3
 * (RT-CV-01/03/05). Firma SigV4 de AWS sin dependencias externas (curl + hash_hmac).
 *
 * - Subida: PUT firmado del objeto en el bucket.
 * - Descarga: URL firmada (presigned GET) generada por el backend (RT-CV-05);
 *   el bucket permanece privado.
 *
 * Driver de respaldo "local" (writable/uploads) para desarrollo sin credenciales.
 * Las claves viven solo en el backend (.env) y nunca llegan a React.
 */
class StorageService
{
    /**
     * Patrón de claves generadas por el servidor. Cada recurso tiene su
     * prefijo y un nombre de archivo sin rutas, sin puntos iniciales y sin
     * punto final. Las claves nunca se construyen con datos del cliente.
     */
    private const PATRON_CLAVE = '#^(?:postulante-[1-9]\d*|postulantes/foto/[1-9]\d*|empresas/logo/[1-9]\d*|actividades/[1-9]\d*)/[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9_-]$#';

    private string $driver;

    private string $bucket;

    private string $endpoint = '';

    private string $accessKey = '';

    private string $secretKey = '';

    private string $region = '';

    public function __construct()
    {
        $this->driver = (string) (env('storage.driver') ?: 'local');

        // El bucket y el endpoint son configuración del backend: se validan
        // para que una clave de objeto nunca pueda alterarlos.
        $bucket = (string) (env('storage.bucket') ?: 'cvs');
        if (preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/', $bucket) !== 1) {
            log_message('error', 'storage.bucket inválido; se usa "cvs".');
            $bucket = 'cvs';
        }
        $this->bucket = $bucket;

        $endpoint = rtrim((string) env('s3.endpoint'), '/');
        if ($endpoint !== '' && ! $this->endpointValido($endpoint)) {
            log_message('error', 's3.endpoint inválido; se desactiva el driver externo.');
            $endpoint = '';
        }
        $this->endpoint = $endpoint;

        $this->accessKey = (string) env('s3.accessKey');
        $this->secretKey = (string) env('s3.secretKey');
        $this->region    = (string) (env('s3.region') ?: 'us-west-2');

        if ($this->driver === 'supabase' && ($this->endpoint === '' || $this->accessKey === '' || $this->secretKey === '')) {
            $this->driver = 'local';
        }
    }

    /**
     * Valida una clave de objeto antes de cualquier operación de almacenamiento.
     * Rechaza rutas absolutas, traversal, separadores de Windows, controles,
     * segmentos vacíos, puntos iniciales/finales y prefijos desconocidos.
     */
    public static function claveValida(string $objectKey): bool
    {
        if ($objectKey === '' || strlen($objectKey) > 255) {
            return false;
        }
        if (preg_match('/[^A-Za-z0-9._\/-]/', $objectKey) === 1) {
            return false;
        }
        if (str_starts_with($objectKey, '/') || str_contains($objectKey, '\\') || str_contains($objectKey, '//')) {
            return false;
        }

        foreach (explode('/', $objectKey) as $segmento) {
            if ($segmento === '' || $segmento === '.' || $segmento === '..') {
                return false;
            }
            if (str_starts_with($segmento, '.')) {
                return false;
            }
        }

        return preg_match(self::PATRON_CLAVE, $objectKey) === 1;
    }

    public function esSupabase(): bool
    {
        return $this->driver === 'supabase';
    }

    /**
     * @throws ApiException si no se puede almacenar
     */
    public function almacenar(string $objectKey, UploadedFile $archivo, ?string $mime = null): void
    {
        $objectKey = $this->exigirClave($objectKey);

        if (! $this->esSupabase()) {
            $this->almacenarLocal($objectKey, $archivo);

            return;
        }

        $ruta   = $this->rutaObjeto($objectKey);
        $cuerpo = file_get_contents($archivo->getTempName());
        // MIME detectado por el servidor cuando el llamador no fija uno canónico.
        $mime ??= $archivo->getMimeType();
        $resultado = $this->solicitudFirmada('PUT', $ruta, $cuerpo, $mime);

        if ($resultado === null) {
            throw ApiException::badRequest('No se pudo almacenar el CV en el almacenamiento externo.');
        }
    }

    /**
     * Almacena contenido binario ya leído (p. ej. una imagen validada por magic
     * bytes). Reutiliza el mismo bucket y firma que los CV.
     */
    public function almacenarContenido(string $objectKey, string $cuerpo, string $mime): void
    {
        $objectKey = $this->exigirClave($objectKey);

        if (! $this->esSupabase()) {
            $ruta = $this->rutaLocalDestino($objectKey, true);
            if ($ruta === null) {
                throw ApiException::badRequest('No se pudo guardar el archivo.');
            }
            if (file_put_contents($ruta, $cuerpo) === false) {
                throw ApiException::badRequest('No se pudo guardar el archivo.');
            }

            return;
        }

        if ($this->solicitudFirmada('PUT', $this->rutaObjeto($objectKey), $cuerpo, $mime) === null) {
            throw ApiException::badRequest('No se pudo almacenar el archivo en el almacenamiento externo.');
        }
    }

    /**
     * Elimina un objeto del almacenamiento (best-effort). Sirve para reemplazar
     * o quitar imágenes de actividades.
     */
    public function eliminar(string $objectKey): void
    {
        $objectKey = $this->exigirClave($objectKey);

        if (! $this->esSupabase()) {
            $ruta = $this->rutaLocalDestino($objectKey);
            if ($ruta !== null && is_file($ruta)) {
                @unlink($ruta);
            }

            return;
        }

        // DELETE firmado sin cuerpo (sin cabecera content-type).
        $this->solicitudFirmada('DELETE', $this->rutaObjeto($objectKey), '');
    }

    /**
     * Devuelve el contenido binario del objeto (para el proxy público de
     * imágenes). Null si no existe, la clave no es válida o no se puede leer.
     */
    public function obtenerContenido(string $objectKey): ?string
    {
        if (! self::claveValida($objectKey)) {
            return null;
        }

        if (! $this->esSupabase()) {
            $ruta = $this->rutaLocal($objectKey);

            return $ruta === null ? null : (file_get_contents($ruta) ?: null);
        }

        $url = $this->urlPresignada('GET', $this->rutaObjeto($objectKey), 120);
        $ctx = stream_context_create(['http' => ['timeout' => 15]]);
        $contenido = @file_get_contents($url, false, $ctx);

        return $contenido === false ? null : $contenido;
    }

    /**
     * URL firmada temporal de descarga (RT-CV-05). En local devuelve la ruta
     * interna de descarga que exige autorización del propietario.
     */
    public function urlTemporal(string $objectKey, int $segundos = 1800): string
    {
        if (! self::claveValida($objectKey)) {
            throw ApiException::noEncontrado('El archivo no existe.');
        }

        if ($this->esSupabase()) {
            return $this->urlPresignada('GET', $this->rutaObjeto($objectKey), $segundos);
        }

        $clave = rtrim(strtr(base64_encode($objectKey), '+/', '-_'), '=');

        return rtrim((string) config('App')->baseURL, '/') . '/api/postulante/cv/archivo/' . $clave;
    }

    /**
     * Ruta absoluta del archivo cuando el driver es local (null si es Supabase
     * o si la clave no apunta a un archivo autorizado dentro de uploads).
     */
    public function rutaLocal(string $objectKey): ?string
    {
        if ($this->esSupabase() || ! self::claveValida($objectKey)) {
            return null;
        }

        $ruta = $this->rutaLocalDestino($objectKey);

        return $ruta !== null && is_file($ruta) ? $ruta : null;
    }

    private function almacenarLocal(string $objectKey, UploadedFile $archivo): void
    {
        $ruta = $this->rutaLocalDestino($objectKey, true);
        if ($ruta === null) {
            throw ApiException::badRequest('No se pudo guardar el archivo.');
        }
        if (! move_uploaded_file($archivo->getTempName(), $ruta)) {
            throw ApiException::badRequest('No se pudo guardar el archivo.');
        }
    }

    /**
     * Directorio raíz del almacenamiento local (aislado para pruebas).
     */
    protected function raizLocal(): string
    {
        return WRITEPATH . 'uploads';
    }

    /**
     * Resuelve la ruta local canónica de una clave ya validada, comprobando
     * que el archivo y su directorio permanecen dentro de uploads. Rechaza
     * enlaces simbólicos que escapen del directorio autorizado.
     */
    private function rutaLocalDestino(string $objectKey, bool $crearDirectorio = false): ?string
    {
        if (! self::claveValida($objectKey)) {
            return null;
        }

        $raiz = realpath($this->raizLocal());
        if ($raiz === false) {
            if (! $crearDirectorio) {
                return null;
            }
            if (! @mkdir($this->raizLocal(), 0775, true) && ! is_dir($this->raizLocal())) {
                return null;
            }
            $raiz = realpath($this->raizLocal());
            if ($raiz === false) {
                return null;
            }
        }

        $destino = $raiz . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $objectKey);
        if (is_link($destino)) {
            return null;
        }

        $directorio = dirname($destino);
        if (! is_dir($directorio)) {
            if (! $crearDirectorio) {
                return null;
            }
            if (! @mkdir($directorio, 0775, true) && ! is_dir($directorio)) {
                return null;
            }
        }

        $directorioReal = realpath($directorio);
        if ($directorioReal === false || ! $this->dentroDe($directorioReal, $raiz)) {
            return null;
        }

        if (is_file($destino)) {
            $destinoReal = realpath($destino);
            if ($destinoReal === false || ! $this->dentroDe($destinoReal, $raiz)) {
                return null;
            }

            return $destinoReal;
        }

        return $directorioReal . DIRECTORY_SEPARATOR . basename($destino);
    }

    private function dentroDe(string $ruta, string $raiz): bool
    {
        $raiz = rtrim($raiz, DIRECTORY_SEPARATOR);

        return $ruta === $raiz || str_starts_with($ruta, $raiz . DIRECTORY_SEPARATOR);
    }

    private function exigirClave(string $objectKey): string
    {
        if (! self::claveValida($objectKey)) {
            log_message('error', 'StorageService: clave de objeto rechazada.');

            throw ApiException::badRequest('La referencia del archivo no es válida.');
        }

        return $objectKey;
    }

    private function endpointValido(string $endpoint): bool
    {
        if (filter_var($endpoint, FILTER_VALIDATE_URL) === false) {
            return false;
        }

        return in_array(strtolower((string) parse_url($endpoint, PHP_URL_SCHEME)), ['http', 'https'], true);
    }

    /* ------------------------- Firma SigV4 (S3) ------------------------- */

    private function host(): string
    {
        $host = (string) parse_url($this->endpoint, PHP_URL_HOST);

        return $host !== '' ? $host : 'storage.supabase.co';
    }

    private function origen(): string
    {
        $esquema = (string) parse_url($this->endpoint, PHP_URL_SCHEME);

        return ($esquema !== '' ? $esquema : 'https') . '://' . $this->host();
    }

    private function rutaBase(): string
    {
        $path = (string) parse_url($this->endpoint, PHP_URL_PATH);

        return $path !== '' ? $path : '/storage/v1/s3';
    }

    /**
     * Ruta del objeto dentro del endpoint S3. La clave se valida y cada
     * segmento se codifica una sola vez; el bucket y la base del endpoint
     * provienen exclusivamente de la configuración del backend.
     */
    protected function rutaObjeto(string $objectKey): string
    {
        $objectKey = $this->exigirClave($objectKey);
        $segmentos = array_map(static fn ($s) => rawurlencode($s), explode('/', $objectKey));

        return $this->rutaBase() . '/' . rawurlencode($this->bucket) . '/' . implode('/', $segmentos);
    }

    private function rfc3986(string $valor): string
    {
        return rawurlencode($valor);
    }

    private function fechaCorta(string $fecha): string
    {
        return substr($fecha, 0, 8);
    }

    private function claveFirma(string $fechaCorta): string
    {
        $fecha    = hash_hmac('sha256', $fechaCorta, 'AWS4' . $this->secretKey, true);
        $region   = hash_hmac('sha256', $this->region, $fecha, true);
        $servicio = hash_hmac('sha256', 's3', $region, true);

        return hash_hmac('sha256', 'aws4_request', $servicio, true);
    }

    /**
     * Firma un PUT y devuelve la respuesta, o null ante error HTTP.
     */
    private function solicitudFirmada(string $metodo, string $ruta, string $cuerpo, ?string $mime = null): ?string
    {
        $fecha = gmdate('Ymd\THis\Z');
        $payloadHash = hash('sha256', $cuerpo);

        $cabeceras = [
            'host'                 => $this->host(),
            'x-amz-content-sha256' => $payloadHash,
            'x-amz-date'           => $fecha,
        ];
        $cabecerasFirmadas = ['host', 'x-amz-content-sha256', 'x-amz-date'];
        if ($mime !== null) {
            $cabeceras['content-type'] = $mime;
            $cabecerasFirmadas = ['content-type', 'host', 'x-amz-content-sha256', 'x-amz-date'];
        }

        $cabeceraCadena = '';
        foreach ($cabecerasFirmadas as $h) {
            $cabeceraCadena .= $h . ':' . trim((string) $cabeceras[$h]) . "\n";
        }

        $canonica  = $metodo . "\n" . $ruta . "\n\n";
        $canonica .= $cabeceraCadena . "\n";
        $canonica .= implode(';', $cabecerasFirmadas) . "\n" . $payloadHash;

        $fechaCorta = $this->fechaCorta($fecha);
        $scope      = $fechaCorta . '/' . $this->region . '/s3/aws4_request';
        $paraFirmar = "AWS4-HMAC-SHA256\n{$fecha}\n{$scope}\n" . hash('sha256', $canonica);

        $firma = hash_hmac('sha256', $paraFirmar, $this->claveFirma($fechaCorta));
        $autorizacion = 'AWS4-HMAC-SHA256 Credential=' . $this->accessKey . '/' . $scope
            . ', SignedHeaders=' . implode(';', $cabecerasFirmadas)
            . ', Signature=' . $firma;

        $ch = curl_init($this->origen() . $ruta);
        $cabecerasHttp = [
            'Authorization: ' . $autorizacion,
            'x-amz-content-sha256: ' . $payloadHash,
            'x-amz-date: ' . $fecha,
        ];
        if ($mime !== null) {
            $cabecerasHttp[] = 'Content-Type: ' . $mime;
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CUSTOMREQUEST  => $metodo,
            CURLOPT_POSTFIELDS     => $cuerpo,
            CURLOPT_HTTPHEADER     => $cabecerasHttp,
        ]);

        $respuesta = curl_exec($ch);
        $codigo    = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error     = curl_error($ch);
        curl_close($ch);

        if ($codigo >= 200 && $codigo < 300) {
            return $respuesta === false ? '' : $respuesta;
        }

        log_message('error', 'S3 {metodo} {ruta}: HTTP {codigo} {error} {cuerpo}', [
            'metodo' => $metodo, 'ruta' => $ruta, 'codigo' => $codigo, 'error' => $error,
            'cuerpo' => is_string($respuesta) ? substr($respuesta, 0, 300) : '',
        ]);

        return null;
    }

    /**
     * Presigned URL GET (RT-CV-05): permite descargar el objeto por tiempo
     * limitado sin exponer credenciales.
     */
    private function urlPresignada(string $metodo, string $ruta, int $segundos): string
    {
        $fecha      = gmdate('Ymd\THis\Z');
        $fechaCorta = $this->fechaCorta($fecha);
        $scope      = $fechaCorta . '/' . $this->region . '/s3/aws4_request';

        $consulta = [
            'X-Amz-Algorithm'     => 'AWS4-HMAC-SHA256',
            'X-Amz-Credential'    => $this->accessKey . '/' . $scope,
            'X-Amz-Date'          => $fecha,
            'X-Amz-Expires'       => (string) $segundos,
            'X-Amz-SignedHeaders' => 'host',
        ];

        // Canonical query: claves y valores ordenados y codificados RFC3986.
        ksort($consulta);
        $canonicaConsulta = [];
        foreach ($consulta as $clave => $valor) {
            $canonicaConsulta[] = $this->rfc3986($clave) . '=' . $this->rfc3986($valor);
        }
        $consultaCadena = implode('&', $canonicaConsulta);

        $canonica  = $metodo . "\n" . $ruta . "\n" . $consultaCadena . "\n";
        $canonica .= 'host:' . $this->host() . "\n\n";
        $canonica .= "host\nUNSIGNED-PAYLOAD";

        $paraFirmar = "AWS4-HMAC-SHA256\n{$fecha}\n{$scope}\n" . hash('sha256', $canonica);
        $firma = hash_hmac('sha256', $paraFirmar, $this->claveFirma($fechaCorta));

        return $this->origen() . $ruta . '?' . $consultaCadena . '&X-Amz-Signature=' . $firma;
    }
}
