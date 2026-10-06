// SPDX-License-Identifier: MIT
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Site Key pública (Cloudflare). La Secret Key NUNCA llega al frontend.
const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Carga el API oficial de Turnstile una sola vez (render explícito para SPA). */
function cargarApi() {
  return new Promise((resolve) => {
    if (window.turnstile) return resolve(true);
    const existente = document.getElementById(SCRIPT_ID);
    if (existente) {
      existente.addEventListener('load', () => resolve(Boolean(window.turnstile)), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(Boolean(window.turnstile));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/**
 * Widget compartido de Cloudflare Turnstile (login, registro y afiliación de
 * empresa). Render explícito (SPA), `size: flexible` para adaptarse al ancho del
 * formulario, en español y con el tema de la aplicación. La presentación usa el
 * contenedor Rounded del Design System; el contenido interno del iframe no se
 * modifica (no soportado por Cloudflare).
 *
 * Entrega el token por `onToken`; expone `reset()` (los tokens son de un solo uso).
 * El backend es la única autoridad de validación (Siteverify).
 */
const Turnstile = forwardRef(function Turnstile(
  { onToken, onExpire, accion = 'login', tema = 'auto', idioma = 'es', tamano = 'flexible' },
  ref,
) {
  const contenedor = useRef(null);
  const widgetId = useRef(null);
  const callbacks = useRef({ onToken, onExpire });
  callbacks.current = { onToken, onExpire };

  useImperativeHandle(ref, () => ({
    reset() {
      callbacks.current.onToken?.(null);
      if (window.turnstile && widgetId.current !== null) {
        try { window.turnstile.reset(widgetId.current); } catch { /* widget ya no existe */ }
      }
    },
  }), []);

  useEffect(() => {
    if (!SITE_KEY || !contenedor.current) return undefined;
    let activo = true;

    cargarApi().then((listo) => {
      if (!activo || !listo || !window.turnstile || !contenedor.current || widgetId.current !== null) return;
      widgetId.current = window.turnstile.render(contenedor.current, {
        sitekey: SITE_KEY,
        action: accion,
        theme: tema,
        language: idioma,
        size: tamano,
        callback: (token) => callbacks.current.onToken?.(token),
        'expired-callback': () => { callbacks.current.onToken?.(null); callbacks.current.onExpire?.(); },
        'error-callback': () => { callbacks.current.onToken?.(null); },
      });
    });

    return () => {
      activo = false;
      if (window.turnstile && widgetId.current !== null) {
        try { window.turnstile.remove(widgetId.current); } catch { /* ya removido */ }
      }
      widgetId.current = null;
    };
  }, [accion, tema, idioma, tamano]);

  if (!SITE_KEY) return null;
  return (
    <div className="auth-turnstile">
      <div className="auth-turnstile-box" ref={contenedor} />
    </div>
  );
});

export default Turnstile;
