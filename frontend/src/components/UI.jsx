export function Campo({ etiqueta, ...props }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      <input {...props} />
    </label>
  );
}

export function Selecto({ etiqueta, children, ...props }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      <select {...props}>{children}</select>
    </label>
  );
}

export function Boton({ variante = 'primario', cargando = false, children, ...props }) {
  return (
    <button type="button" className={`btn btn-${variante}`} disabled={cargando || props.disabled} {...props}>
      {cargando ? 'Procesando…' : children}
    </button>
  );
}

export function Tarjeta({ titulo, children, acciones }) {
  return (
    <section className="tarjeta">
      {(titulo || acciones) && (
        <header className="tarjeta-titulo">
          <h2>{titulo}</h2>
          {acciones}
        </header>
      )}
      {children}
    </section>
  );
}

export function Estado({ valor, diccionario = {} }) {
  const etiqueta = diccionario[valor] || valor;
  return <span className={`badge badge-${valor || ''}`}>{etiqueta}</span>;
}

export function Mensaje({ tipo = 'error', children }) {
  if (!children) return null;
  return <div className={`alerta alerta-${tipo}`}>{children}</div>;
}

export function EstadoCarga({ texto = 'Cargando…' }) {
  return (
    <div className="estado-carga">
      <span className="spinner" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

export function EstadoVacio({ icono = null, texto = 'Sin registros para mostrar.' }) {
  return (
    <div className="empty-card">
      {icono && <i className={icono} aria-hidden="true" />}
      <p>{texto}</p>
    </div>
  );
}

export function ListaVacia({ texto = 'Sin registros para mostrar.' }) {
  return <EstadoVacio texto={texto} />;
}
