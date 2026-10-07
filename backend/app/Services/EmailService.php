<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use CodeIgniter\Email\Email;
use Resend;

/**
 * Punto único de envío de correo del sistema. Todo el correo pasa por aquí.
 *
 * Proveedor principal: Resend (SDK oficial PHP, `Resend::client()->emails->send()`).
 * La API key vive SOLO en el backend y nunca se registra ni se expone. Se acepta
 * `RESEND_API_KEY` (preferido) o `resend.apiKey` (compatibilidad).
 *
 * Si no hay clave de Resend configurada, se conserva el envío SMTP (email.*)
 * como respaldo; si tampoco hay SMTP, la operación no falla: se registra y el
 * enlace de activación queda disponible al admin.
 *
 * El correo es una notificación secundaria: un fallo de envío NUNCA revierte la
 * operación de negocio que lo originó (best-effort).
 */
class EmailService
{
    private ?string $ultimoId = null;

    private ?string $ultimoError = null;

    /** Id devuelto por Resend en el último envío aceptado (null si no aplica). */
    public function ultimoId(): ?string
    {
        return $this->ultimoId;
    }

    /**
     * Motivo técnico del último fallo de envío (sin credenciales). Permite
     * diagnosticar sin exponer la API key ni stack traces al usuario.
     */
    public function ultimoError(): ?string
    {
        return $this->ultimoError;
    }

    /**
     * Renderiza el correo (HTML con layout institucional y variables escapadas)
     * sin enviarlo. Separado de enviar() para poder probarlo sin red.
     *
     * @param array<string, string> $variables valores {{clave}} del contenido
     */
    public function preparar(string $contenidoHtml, array $variables = []): string
    {
        foreach ($variables as $clave => $valor) {
            $seguro = htmlspecialchars((string) $valor, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $contenidoHtml = str_replace('{{' . $clave . '}}', $seguro, $contenidoHtml);
        }

        return $this->layout($contenidoHtml);
    }

    /**
     * Layout HTML común (tabla + estilos inline + tarjeta rounded), compatible
     * con clientes de correo. Sin JavaScript, sin CSS externo, ancho máximo 600.
     */
    public function layout(string $contenidoHtml): string
    {
        $anio = date('Y');

        return '<!doctype html><html lang="es"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>Empleo MDJLO</title></head>'
            . '<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:24px 12px;">'
            . '<tr><td align="center">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">'
            . '<tr><td style="background:#0b2a4a;padding:22px 28px;">'
            . '<div style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.3px;">Empleo MDJLO</div>'
            . '<div style="color:#9fb6cf;font-size:12px;margin-top:2px;">Sistema de intermediación laboral</div>'
            . '</td></tr>'
            . '<tr><td style="padding:28px;color:#1f2937;font-size:15px;line-height:1.6;">'
            . $contenidoHtml
            . '</td></tr>'
            . '<tr><td style="padding:18px 28px;background:#f6f8fb;border-top:1px solid #e2e8f0;color:#8895a7;font-size:12px;text-align:center;">'
            . '© ' . $anio . ' Municipalidad Distrital de José Leonardo Ortiz — Empleo MDJLO'
            . '</td></tr>'
            . '</table></td></tr></table></body></html>';
    }

    /**
     * Correo transaccional de activación de empresa. Método especializado que
     * reutiliza el layout institucional y escapa todos los datos dinámicos.
     * No usa Resend directamente (pasa por enviar()).
     *
     * @param array<string, mixed> $datos razon_social, ruc, expira_dias
     */
    public function enviarActivacionEmpresa(string $para, string $link, array $datos): bool
    {
        return $this->enviar(
            $para,
            'Tu empresa ha sido habilitada — Empleo MDJLO',
            $this->layout($this->contenidoActivacion($link, $datos)),
        );
    }

    /**
     * Contenido HTML del correo de activación (sin el layout exterior), con todos
     * los valores dinámicos escapados. Público para poder probarse sin red.
     *
     * @param array<string, mixed> $datos
     */
    public function contenidoActivacion(string $link, array $datos): string
    {
        $e = static fn ($v): string => htmlspecialchars((string) ($v ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $razon      = $e($datos['razon_social'] ?? '');
        $ruc        = $e($datos['ruc'] ?? '');
        $linkSeguro = $e($link);
        $dias       = $e($datos['expira_dias'] ?? '7');

        return '<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#0b2a4a;text-align:center;">Tu empresa ha sido habilitada</h1>'
            . '<p style="margin:0 0 14px;">Estimado(a) representante:</p>'
            . '<p style="margin:0 0 18px;">La Municipalidad Distrital de José Leonardo Ortiz ha <strong>aprobado</strong> '
            . 'la afiliación de su empresa al Sistema de Empleo. Su cuenta de empresa ya fue creada.</p>'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:#f6f8fb;border:1px solid #e2e8f0;border-radius:12px;">'
            . '<tr><td style="padding:18px 20px;font-size:14px;color:#1f2937;line-height:1.9;">'
            . '<div><strong>Empresa:</strong> ' . $razon . '</div>'
            . '<div><strong>RUC:</strong> ' . $ruc . '</div>'
            . '<div><strong>Estado:</strong> Afiliación aprobada</div>'
            . '</td></tr></table>'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 20px;">'
            . '<a href="' . $linkSeguro . '" style="display:inline-block;padding:14px 30px;background:#1857a8;color:#ffffff;'
            . 'font-size:15px;font-weight:bold;text-decoration:none;border-radius:12px;">Activar mi cuenta</a>'
            . '</td></tr></table>'
            . '<p style="margin:0 0 16px;color:#6b7280;font-size:13px;text-align:center;">Este enlace es personal y de un solo uso. Caduca en ' . $dias . ' días.</p>'
            . '<p style="margin:0 0 6px;color:#6b7280;font-size:13px;">Si el botón no funciona, copie y pegue este enlace en su navegador:</p>'
            . '<p style="margin:0 0 16px;word-break:break-all;color:#1857a8;font-size:13px;">' . $linkSeguro . '</p>'
            . '<p style="margin:0;color:#6b7280;font-size:13px;">Por seguridad, no comparta este enlace. Si no solicitó esta afiliación, ignore este correo.</p>';
    }

    /**
     * Envía una plantilla: escapa las variables en el cuerpo, las sustituye en
     * el asunto (texto plano) y el cuerpo, y aplica el layout institucional.
     *
     * @param array<string, string> $variables variables {{clave}} del asunto/cuerpo
     */
    public function enviarPlantilla(string $para, string $asunto, string $contenidoHtml, array $variables = []): bool
    {
        $cuerpo = $this->preparar($contenidoHtml, $variables);

        // El asunto es texto plano: se sustituye con el valor sin escapar HTML.
        foreach ($variables as $clave => $valor) {
            $asunto = str_replace('{{' . $clave . '}}', (string) $valor, $asunto);
        }

        return $this->enviar($para, $asunto, $cuerpo);
    }

    public function enviar(string $para, string $asunto, string $cuerpoHtml): bool
    {
        if ($this->usarResend()) {
            return $this->enviarResend($para, $asunto, $cuerpoHtml);
        }

        return $this->enviarSmtp($para, $asunto, $cuerpoHtml);
    }

    protected function usarResend(): bool
    {
        return $this->apiKey() !== '';
    }

    protected function apiKey(): string
    {
        // Nombres admitidos: RESEND_API_KEY (preferido) y resend.apiKey (compat.).
        return (string) (env('RESEND_API_KEY') ?: env('resend.apiKey'));
    }

    /**
     * Remitente configurable (nunca hardcodeado para producción):
     * - RESEND_FROM_EMAIL puede ser "no-reply@dominio" (se combina con
     *   RESEND_FROM_NAME) o el remitente completo "Nombre <no-reply@dominio>".
     * - Compatibilidad: resend.from. Fallback dev: sandbox de Resend.
     */
    protected function remitente(): string
    {
        $from = trim((string) (env('RESEND_FROM_EMAIL') ?: ''));

        if ($from !== '') {
            if (str_contains($from, '<') && str_contains($from, '>')) {
                return $from;
            }
            $nombre = (string) (env('RESEND_FROM_NAME') ?: 'Empleo MDJLO');

            return $nombre . ' <' . $from . '>';
        }

        return (string) (env('resend.from') ?: 'Empleo MDJLO <onboarding@resend.dev>');
    }

    /**
     * Crea el cliente de Resend. Punto de inyección sobreescribible en tests
     * para no depender de la red.
     */
    protected function crearCliente(string $apiKey)
    {
        return Resend::client($apiKey);
    }

    private function enviarResend(string $para, string $asunto, string $cuerpoHtml): bool
    {
        $this->ultimoError = null;

        try {
            $resend = $this->crearCliente($this->apiKey());
            $resultado = $resend->emails->send([
                'from'    => $this->remitente(),
                'to'      => [$para],
                'subject' => $asunto,
                'html'    => $cuerpoHtml,
            ]);

            // El Resource de Resend implementa __get (no __isset): se accede
            // directamente al atributo, no con isset()/??.
            $id = $resultado->id;
            $this->ultimoId = is_string($id) && $id !== '' ? $id : null;

            // Registro seguro: solo id/destinatario/asunto (sin credenciales).
            log_message('info', 'Correo enviado vía Resend (id={id}) a {para}: {asunto}', [
                'id' => $this->ultimoId ?? '(sin id)', 'para' => $para, 'asunto' => $asunto,
            ]);

            return true;
        } catch (\Throwable $e) {
            // Motivo técnico real (sin credenciales): sender, destinatario y causa.
            $this->ultimoError = preg_replace('/re_[A-Za-z0-9]+/', '[REDACTED]', $e->getMessage());

            log_message('error', 'Correo a {para} no enviado vía Resend (from={from}, {asunto}): {error}', [
                'para'   => $para,
                'from'   => $this->remitente(),
                'asunto' => $asunto,
                'error'  => $this->ultimoError,
            ]);

            return false;
        }
    }

    private function enviarSmtp(string $para, string $asunto, string $cuerpoHtml): bool
    {
        $host = (string) env('email.host');
        if ($host === '' || (string) env('email.fromEmail') === '') {
            log_message('error', 'Correo no enviado a {para} ({asunto}): ni Resend ni SMTP están configurados.', [
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
