// SPDX-License-Identifier: MIT

/**
 * Shell de tarjeta de registro seleccionable, inspirado en las tarjetas de
 * ofertas del postulante. Solo estructura visual (cabecera con icono, título y
 * badge; meta; cuerpo). Cada pantalla pone su contenido y acciones; no impone
 * datos ni comportamientos de negocio.
 *
 * `icono` es un componente de Lucide (no un string). Si se pasa `onClick`, la
 * tarjeta es seleccionable por clic, Enter y Espacio.
 */
export default function TarjetaRegistro({
  icono: Icono = null,
  media = null,
  titulo,
  badge = null,
  meta = null,
  seleccionada = false,
  onClick,
  children,
}) {
  const accionable = typeof onClick === 'function';

  const alTeclear = (e) => {
    if (!accionable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <article
      className={`record-card${seleccionada ? ' seleccionada' : ''}${accionable ? ' accionable' : ''}`}
      onClick={accionable ? onClick : undefined}
      onKeyDown={accionable ? alTeclear : undefined}
      role={accionable ? 'button' : undefined}
      tabIndex={accionable ? 0 : undefined}
      aria-label={accionable ? `Ver detalle: ${titulo}` : undefined}
    >
      <header className="record-card-cabecera">
        {media ? (
          <span className="record-card-icono">{media}</span>
        ) : Icono ? (
          <span className="record-card-icono">
            <Icono size={18} aria-hidden="true" />
          </span>
        ) : null}
        <h3>{titulo}</h3>
        {badge && <span className="record-card-badge">{badge}</span>}
      </header>
      {meta && <div className="record-card-meta">{meta}</div>}
      {children && <div className="record-card-cuerpo">{children}</div>}
    </article>
  );
}
