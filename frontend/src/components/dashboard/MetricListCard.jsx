// SPDX-License-Identifier: MIT

/**
 * MetricListCard — tarjeta de indicadores sin gráfico (lista de métricas).
 * Cada item: { icono?, etiqueta, sub?, valor, badge?: bool, tono?: string }.
 * Si `badge` es true, el valor se muestra como etiqueta semántica.
 */
export default function MetricListCard({ titulo, descripcion, items = [], vacio = 'Sin datos para mostrar.' }) {
  const visibles = items.filter(Boolean);

  return (
    <div className="chart-card">
      <div className="chart-card-head">
        <h2>{titulo}</h2>
        {descripcion && <p>{descripcion}</p>}
      </div>

      {visibles.length === 0 ? (
        <p className="vacio">{vacio}</p>
      ) : (
        <div className="dash-metrics">
          {visibles.map((it, i) => (
            <div className="dash-metric" key={it.etiqueta ?? i}>
              <div className="dash-metric-info">
                {it.icono && <span className="dash-metric-icon">{it.icono}</span>}
                <div>
                  <strong>{it.etiqueta}</strong>
                  {it.sub && <small>{it.sub}</small>}
                </div>
              </div>
              {it.badge
                ? <span className={`badge ${it.tono || 'badge-gray'}`}>{it.valor}</span>
                : <span className="dash-metric-value">{it.valor}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
