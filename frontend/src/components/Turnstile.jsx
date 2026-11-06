// SPDX-License-Identifier: MIT
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const CARGA_TIMEOUT_MS = 10000;

let promesaCarga = null;

/** Carga el API oficial una sola vez y permite reintentar si falla. */
function cargarApi() {
  if (window.turnstile) return Promise.resolve(true);
  if (promesaCarga) return promesaCarga;

  promesaCarga = new Promise((resolve) => {
    let terminado = false;
    let script = document.getElementById(SCRIPT_ID);

    const finalizar = (ok) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(temporizador);
      promesaCarga = null;
      resolve(ok);
    };

    const fallar = () => {
      script?.remove();
      finalizar(false);
    };

    const temporizador = setTimeout(() => {
      if (!window.turnstile) script?.remove();
      finalizar(false);
    }, CARGA_TIMEOUT_MS);

    if (script) {
      script.addEventListener('load', () => finalizar(Boolean(window.turnstile)), { once: true });
      script.addEventListener('error', fallar, { once: true });
      return;
    }

    script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => finalizar(Boolean(window.turnstile));
    script.onerror = fallar;
    document.head.appendChild(script);
  });

  return promesaCarga;
}

/**
 * Widget compartido de Cloudflare Turnstile. Solo presenta el widget y entrega
 * el token; el backend valida siempre mediante Siteverify.
 */
const Turnstile = forwardRef(function Turnstile(
  { onToken, onExpire, onError, accion = 'auth', tema = 'auto', idioma = 'es', tamano = 'flexible' },
  ref,
) {
  const contenedor = useRef(null);
  const widgetId = useRef(null);
  const callbacks = useRef({ onToken, onExpire, onError });
  const [error, setError] = useState(false);
  callbacks.current = { onToken, onExpire, onError };

  useImperativeHandle(ref, () => ({
    reset() {
      setError(false);
      callbacks.current.onToken?.(null);
      if (window.turnstile && widgetId.current !== null) {
        try { window.turnstile.reset(widgetId.current); } catch { /* widget ya no existe */ }
      }
    },
  }), []);

  useEffect(() => {
    if (!SITE_KEY || !contenedor.current) return undefined;
    let activo = true;

    setError(false);
    cargarApi().then((listo) => {
      if (!activo) return;
      if (!listo) {
        setError(true);
        callbacks.current.onToken?.(null);
        callbacks.current.onError?.();
        return;
      }
      if (!contenedor.current || widgetId.current !== null) return;

      try {
        widgetId.current = window.turnstile.render(contenedor.current, {
          sitekey: SITE_KEY,
          action: accion,
          theme: tema,
          language: idioma,
          size: tamano,
          callback: (token) => {
            setError(false);
            callbacks.current.onToken?.(token);
          },
          'expired-callback': () => {
            setError(false);
            callbacks.current.onToken?.(null);
            callbacks.current.onExpire?.();
          },
          'error-callback': () => {
            setError(true);
            callbacks.current.onToken?.(null);
            callbacks.current.onError?.();
          },
        });
      } catch {
        setError(true);
        callbacks.current.onToken?.(null);
        callbacks.current.onError?.();
      }
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
      {error && (
        <p className="auth-turnstile-error" role="status" aria-live="polite">
          No se pudo cargar la verificación de seguridad. Recarga la página o inténtalo nuevamente.
        </p>
      )}
    </div>
  );
});

export default Turnstile;
