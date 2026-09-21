// SPDX-License-Identifier: MIT
/**
 * Encabezado de página interno: título + descripción + acción opcional.
 * Patrón único para todos los paneles (estilos en styles.css → .page-head).
 */
export default function PageHeader({ titulo, descripcion, accion }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <h1>{titulo}</h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      {accion}
    </header>
  );
}
