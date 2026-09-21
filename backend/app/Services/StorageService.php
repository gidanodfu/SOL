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
    private string $driver;

    private string $bucket;

    private string $endpoint = '';

    private string $accessKey = '';

    private string $secretKey = '';

    private string $region = '';

    public function __construct()
    {
        $this->driver    = (string) (env('storage.driver') ?: 'local');
        $this->bucket    = (string) (env('storage.bucket') ?: 'cvs');
        $this->endpoint  = rtrim((string) env('s3.endpoint'), '/');
        $this->accessKey = (string) env('s3.accessKey');
        $this->secretKey = (string) env('s3.secretKey');
        $this->region    = (string) (env('s3.region') ?: 'us-west-2');

        if ($this->driver === 'supabase' && ($this->endpoint === '' || $this->accessKey === '' || $this->secretKey === '')) {
            $this->driver = 'local';
        }
    }

    public function esSupabase(): bool
    {
        return $this->driver === 'supabase';
    }

    /**
     * @throws ApiException si no se puede almacenar
     */
    public function almacenar(string $objectKey, UploadedFile $archivo): void
    {
        if (! $this->esSupabase()) {
            $this->almacenarLocal($objectKey, $archivo);

            return;
        }

        $ruta  = $this->rutaObjeto($objectKey);
        $cuerpo = file_get_contents($archivo->getTempName());
        $resultado = $this->solicitudFirmada('PUT', $ruta, $cuerpo, $archivo->getClientMimeType());

        if ($resultado === null) {
            throw ApiException::badRequest('No se pudo almacenar el CV en el almacenamiento externo.');
        }
    }

    /**
     * URL firmada temporal de descarga (RT-CV-05). En local devuelve la ruta
     * interna de descarga que exige autorización del propietario.
     */
    public function urlTemporal(string $objectKey, int $segundos = 1800): string
    {
        if ($this->esSupabase()) {
            return $this->urlPresignada('GET', $this->rutaObjeto($objectKey), $segundos);
        }

        $clave = rtrim(strtr(base64_encode($objectKey), '+/', '-_'), '=');

        return rtrim((string) config('App')->baseURL, '/') . '/api/postulante/cv/archivo/' . $clave;
    }

    /**
     * Ruta absoluta del archivo cuando el driver es local (null si es Supabase).
     */
    public function rutaLocal(string $objectKey): ?string
    {
        if ($this->esSupabase()) {
            return null;
        }
        $ruta = WRITEPATH . 'uploads/' . $objectKey;

        return is_file($ruta) ? $ruta : null;
    }

    private function almacenarLocal(string $objectKey, UploadedFile $archivo): void
    {
        $ruta = WRITEPATH . 'uploads/' . $objectKey;
        if (! is_dir(dirname($ruta))) {
            mkdir(dirname($ruta), 0775, true);
        }
        if (! move_uploaded_file($archivo->getTempName(), $ruta)) {
            throw ApiException::badRequest('No se pudo guardar el archivo.');
        }
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

    private function rutaObjeto(string $objectKey): string
    {
        $segmentos = array_map(static fn ($s) => rawurlencode($s), explode('/', $objectKey));

        return $this->rutaBase() . '/' . $this->bucket . '/' . implode('/', $segmentos);
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
    private function solicitudFirmada(string $metodo, string $ruta, string $cuerpo, string $mime): ?string
    {
        $fecha = gmdate('Ymd\THis\Z');
        $payloadHash = hash('sha256', $cuerpo);

        $cabeceras = [
            'content-type'         => $mime,
            'host'                 => $this->host(),
            'x-amz-content-sha256' => $payloadHash,
            'x-amz-date'           => $fecha,
        ];
        $cabecerasFirmadas = ['content-type', 'host', 'x-amz-content-sha256', 'x-amz-date'];

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
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CUSTOMREQUEST  => $metodo,
            CURLOPT_POSTFIELDS     => $cuerpo,
            CURLOPT_HTTPHEADER     => [
                'Authorization: ' . $autorizacion,
                'Content-Type: ' . $mime,
                'x-amz-content-sha256: ' . $payloadHash,
                'x-amz-date: ' . $fecha,
            ],
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
