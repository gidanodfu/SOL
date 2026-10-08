// SPDX-License-Identifier: MIT

/**
 * BarChartCard — tarjeta de gráfico estándar del sistema (Admin/Empresa/Postulante).
 * No conoce el rol: recibe título, descripción y datos.
 *
 * items: [{ etiqueta: string, valor: number, color?: string }]
 * orientation: 'horizontal' (distribuciones) | 'vertical' (series por periodo)
 *
 * Usa la primitive visual `.chart-card` (tokens globales) → mismo borde, radio,
 * padding y tipografía en los tres roles.
 */
export default function BarChartCard({
  titulo,
  descripcion,
  items = [],
  orientation = 'horizontal',
  vacio = 'Sin datos para mostrar.',
}) {
  const valores = items.map((it) => Number(it.valor) || 0);
  const total = valores.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...valores);

  return (
    <div className="chart-card">
      <div className="chart-card-head">
        <h2>{titulo}</h2>
        {descripcion && <p>{descripcion}</p>}
      </div>

      {items.length === 0 || total === 0 ? (
        <p className="vacio">{vacio}</p>
      ) : orientation === 'vertical' ? (
        <div>
          <div className="dash-bars">
            {items.map((it) => {
              const v = Number(it.valor) || 0;
              return (
                <div className="dash-bar-col" key={it.etiqueta} title={`${it.etiqueta}: ${v}`}>
                  <div className={`dash-bar${v ? '' : ' is-empty'}`} style={{ height: `${Math.max(3, (v / max) * 100)}%` }} />
                </div>
              );
            })}
          </div>
          <div className="dash-months">
            {items.map((it) => <span key={it.etiqueta}>{it.etiqueta}</span>)}
          </div>
        </div>
      ) : (
        <div className="dash-rows">
          {items.map((it) => {
            const v = Number(it.valor) || 0;
            return (
              <div className="dash-row" key={it.etiqueta}>
                <span className="dash-row-label" title={it.etiqueta}>{it.etiqueta}</span>
                <div className="dash-track">
                  <span className="dash-fill" style={{ width: `${(v / max) * 100}%`, ...(it.color ? { background: it.color } : {}) }} />
                </div>
                <span className="dash-row-value">{v}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
