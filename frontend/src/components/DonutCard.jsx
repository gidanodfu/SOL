// SPDX-License-Identifier: MIT
/**
 * DonutCard — tarjeta con gráfico de dona y leyenda, compartida por los
 * dashboards de empresa y postulante. El gráfico es CSS puro (conic-gradient),
 * sin librerías; la leyenda aporta la representación textual accesible.
 */
function donutGradiente(datos, items) {
  const total = items.reduce((suma, it) => suma + (datos[it.estado] || 0), 0);
  if (total === 0) return 'conic-gradient(#E9EEF5 0% 100%)';

  let acumulado = 0;
  const partes = items
    .map((it) => {
      const n = datos[it.estado] || 0;
      if (n === 0) return null;
      const desde = acumulado;
      acumulado += (n / total) * 100;
      return `${it.color} ${desde}% ${acumulado}%`;
    })
    .filter(Boolean);

  return `conic-gradient(${partes.join(', ')})`;
}

export default function DonutCard({ titulo, descripcion, datos, items, etiquetaTotal = 'total' }) {
  const total = items.reduce((suma, it) => suma + (datos[it.estado] || 0), 0);
  const resumen = items.map((it) => `${it.etiqueta}: ${datos[it.estado] || 0}`).join(', ');

  return (
    <div className="chart-card">
      <div className="chart-card-head">
        <h2>{titulo}</h2>
        {descripcion && <p>{descripcion}</p>}
      </div>
      <div className="chart-body">
        <div
          className="donut"
          style={{ background: donutGradiente(datos, items) }}
          role="img"
          aria-label={`${titulo}. ${resumen}.`}
        >
          <div className="donut-hole" aria-hidden="true">
            <b>{total}</b>
            <span>{etiquetaTotal}</span>
          </div>
        </div>
        <div className="legend">
          {items.map((it) => (
            <div key={it.estado} className={`legend-row${(datos[it.estado] || 0) === 0 ? ' zero' : ''}`}>
              <div className="legend-left">
                <span className="legend-dot" style={{ background: it.color }} aria-hidden="true" />
                <span className="legend-name">{it.etiqueta}</span>
              </div>
              <span className="legend-count">{datos[it.estado] || 0}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
