// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

const RUTA_BUSQUEDA = '/postulante/buscar';

/**
 * Buscador de ofertas integrado en la navbar del portal (público y postulante).
 * Fuente de verdad: el parámetro de URL `q` de /postulante/buscar, el mismo que
 * consume la página de resultados (sin estado global ni copia en la página).
 *
 * - En /postulante/buscar busca en vivo (con un pequeño retardo), conservando el
 *   comportamiento previo y sin recargar.
 * - Desde cualquier otra ruta de la navbar, al enviar (Enter) navega a los
 *   resultados con el término introducido.
 */
export default function BuscadorNavbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qUrl = searchParams.get('q') || '';
  const [texto, setTexto] = useState(qUrl);
  const enResultados = location.pathname === RUTA_BUSQUEDA;

  // Refleja cambios externos del término (navegación, atrás/adelante, enlaces).
  useEffect(() => {
    setTexto((previo) => (previo === qUrl ? previo : qUrl));
  }, [qUrl]);

  // Búsqueda en vivo solo en la página de resultados.
  useEffect(() => {
    if (!enResultados) return undefined;
    const termino = texto.trim();
    if (termino === qUrl) return undefined;
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (termino) params.set('q', termino); else params.delete('q');
      setSearchParams(params, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [texto, qUrl, enResultados, searchParams, setSearchParams]);

  const aplicar = (termino) => {
    const params = new URLSearchParams(searchParams);
    if (termino) params.set('q', termino); else params.delete('q');
    setSearchParams(params, { replace: true });
  };

  const enviar = (e) => {
    e.preventDefault();
    const termino = texto.trim();
    if (enResultados) {
      aplicar(termino);
      return;
    }
    navigate(termino ? `${RUTA_BUSQUEDA}?q=${encodeURIComponent(termino)}` : RUTA_BUSQUEDA);
  };

  return (
    <form className="post-buscador" role="search" onSubmit={enviar}>
      <i className="ti ti-search" aria-hidden="true" />
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar por puesto, empresa o palabra clave…"
        aria-label="Buscar ofertas por puesto, empresa o palabra clave"
      />
    </form>
  );
}
