// SPDX-License-Identifier: MIT
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Modal de detalle compartido (admin y empresa). Estructura consistente:
 * cabecera con título/subtítulo y cierre, cuerpo con scroll interno y pie de
 * acciones. Accesible: `role="dialog"`, cierre con Escape y overlay, bloqueo
 * del scroll de fondo y retorno del foco al cerrar. Sin colores fijos, para
 * funcionar igual en modo claro y oscuro.
 */
export default function Modal({
  abierto,
  titulo,
  subtitulo = null,
  icono = null,
  alCerrar,
  acciones = null,
  tamano = 'normal',
  etiquetaCerrar = 'Cerrar detalle',
  children,
}) {
  const cajaRef = useRef(null);
  const cerrarRef = useRef(alCerrar);
  const tituloId = useId();

  // El cierre se lee desde un ref para que el efecto solo dependa de `abierto`
  // y no se re-ejecute (ni re-enfoque) en cada render del padre.
  useEffect(() => {
    cerrarRef.current = alCerrar;
  }, [alCerrar]);

  useEffect(() => {
    if (!abierto) return undefined;

    const focoAnterior = document.activeElement;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cajaRef.current?.focus();

    const alTeclear = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cerrarRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const caja = cajaRef.current;
      if (!caja) return;

      const focusables = Array.from(caja.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((el) => el.getClientRects().length > 0);

      if (focusables.length === 0) {
        e.preventDefault();
        caja.focus();
        return;
      }

      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];
      const activo = document.activeElement;

      if (!caja.contains(activo)) {
        e.preventDefault();
        primero.focus();
        return;
      }
      if (e.shiftKey && (activo === primero || activo === caja)) {
        e.preventDefault();
        ultimo.focus();
        return;
      }
      if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', alTeclear);

    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = overflowAnterior;
      if (focoAnterior instanceof HTMLElement) focoAnterior.focus();
    };
  }, [abierto]);

  if (!abierto) return null;

  return (
    <div
      className={`modal-overlay${tamano === 'exito' ? ' modal-overlay-exito' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <section
        ref={cajaRef}
        className={`modal modal-${tamano}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
      >
        <header className="modal-cabecera">
          <div className="modal-titulo">
            {icono && <div className="modal-icono">{icono}</div>}
            <h2 id={tituloId}>{titulo}</h2>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button type="button" className="modal-cerrar" onClick={alCerrar} title="Cerrar" aria-label={etiquetaCerrar}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="modal-cuerpo">{children}</div>

        {acciones && <footer className="modal-pie">{acciones}</footer>}
      </section>
    </div>
  );
}
