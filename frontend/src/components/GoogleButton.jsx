import { useEffect, useRef } from 'react';

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

/**
 * Botón "Continuar con Google" (Google Identity Services). Carga la librería de
 * Google al montar, inicializa con el client id y renderiza el botón oficial.
 * El ancho se adapta al contenedor (200–400 px) para no desbordar en móviles.
 * Entrega el id_token al backend (POST /api/auth/google).
 */
export default function GoogleButton({ modo = 'login', onCredencial, etiqueta = 'Continuar con Google' }) {
  const contenedor = useRef(null);
  const callbackRef = useRef(onCredencial);
  const ultimoAncho = useRef(0);

  useEffect(() => {
    callbackRef.current = onCredencial;
  }, [onCredencial]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !contenedor.current) return undefined;
    let activo = true;

    const dibujar = () => {
      if (!activo || !window.google?.accounts?.id || !contenedor.current) return;
      const ancho = Math.round(
        Math.max(200, Math.min(400, contenedor.current.parentElement?.clientWidth || 300)),
      );
      if (ancho === ultimoAncho.current) return;
      ultimoAncho.current = ancho;
      contenedor.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => {
          if (resp?.credential) callbackRef.current?.(resp.credential);
        },
      });
      window.google.accounts.id.renderButton(contenedor.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: modo === 'registro' ? 'signup_with' : 'continue_with',
        width: ancho,
      });
    };

    const iniciar = () => {
      if (!activo || !window.google?.accounts?.id || !contenedor.current) return;
      dibujar();
    };

    if (window.google?.accounts?.id) {
      iniciar();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = iniciar;
      document.head.appendChild(script);
    }

    const padre = contenedor.current.parentElement;
    const observador = new ResizeObserver(dibujar);
    if (padre) observador.observe(padre);

    return () => {
      activo = false;
      observador.disconnect();
    };
  }, [modo]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <p style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
        {etiqueta} (requiere configurar Google en el servidor)
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '0 0 0.2rem' }}>
      <div ref={contenedor} />
    </div>
  );
}
