<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use CodeIgniter\Email\Email;

/**
 * Envío de correos (SMTP) best-effort. La configuración vive en .env (email.*).
 * Si no hay servidor configurado no se rompe la operación: se registra en el
 * log y el enlace de activación queda disponible al admin como respaldo.
 */
class EmailService
{
    /**
     * @param array<string, string> $variables variables {{clave}} del asunto/cuerpo
     */
    public function enviarPlantilla(string $para, string $asunto, string $plantilla, array $variables): bool
    {
        foreach ($variables as $clave => $valor) {
            $asunto   = str_replace('{{' . $clave . '}}', (string) $valor, $asunto);
            $plantilla = str_replace('{{' . $clave . '}}', (string) $valor, $plantilla);
        }

        return $this->enviar($para, $asunto, $plantilla);
    }

    public function enviar(string $para, string $asunto, string $cuerpoHtml): bool
    {
        $host = (string) env('email.host');
        if ($host === '' || (string) env('email.fromEmail') === '') {
            log_message('error', 'Correo no enviado a {para} ({asunto}): SMTP no configurado.', [
                'para' => $para, 'asunto' => $asunto,
            ]);

            return false;
        }

        $config = [
            'protocol'    => (string) (env('email.protocol') ?: 'smtp'),
            'mailType'    => 'html',
            'charset'     => 'UTF-8',
            'wordWrap'    => false,
            'SMTPHost'    => $host,
            'SMTPUser'    => (string) (env('email.user') ?: ''),
            'SMTPPass'    => (string) (env('email.pass') ?: ''),
            'SMTPPort'    => (int) (env('email.port') ?: 587),
            'SMTPTimeout' => 10,
            'SMTPCrypto'  => (string) (env('email.crypto') ?: 'tls'),
            'fromEmail'   => (string) env('email.fromEmail'),
            'fromName'    => (string) (env('email.fromName') ?: 'Empleo MDJLO'),
        ];

        $email = new Email($config);
        $email->setFrom($config['fromEmail'], $config['fromName']);
        $email->setTo($para);
        $email->setSubject($asunto);
        $email->setMessage($cuerpoHtml);

        if ($email->send()) {
            return true;
        }

        log_message('error', 'Correo a {para} no enviado ({asunto}): {error}', [
            'para' => $para, 'asunto' => $asunto,
            'error' => $email->printDebugger(['headers', 'subject', 'body']),
        ]);

        return false;
    }
}
