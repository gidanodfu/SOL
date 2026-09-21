// SPDX-License-Identifier: MIT
/**
 * StatCard — tarjeta de estadística única del Design System.
 * variante: 'col' (icono arriba, empresa) | 'row' (icono izquierda, postulante) | 'panel' (admin)
 * color: 'blue' | 'green' | 'amber' | 'red' | 'purple'
 */
export default function StatCard({
  variante = 'col',
  color = 'blue',
  icono,
  valor,
  etiqueta,
  descripcion,
  tendencia,
  tendenciaArriba = false,
}) {
  if (variante === 'row') {
    return (
      <div className={`stat-card stat-row-card stat-${color}`}>
        <div className="stat-icon">{icono}</div>
        <div>
          <div className="stat-num">{valor}</div>
          <div className="stat-lab">{etiqueta}</div>
        </div>
      </div>
    );
  }

  if (variante === 'panel') {
    return (
      <div className={`stat-card stat-panel stat-${color}`}>
        <div className="stat-top">
          <div>
            {etiqueta && <div className="stat-name">{etiqueta}</div>}
            <div className="stat-num">{valor}</div>
            {descripcion && <div className="stat-desc">{descripcion}</div>}
          </div>
          <div className="stat-icon">{icono}</div>
        </div>
        {tendencia && <div className={`stat-trend${tendenciaArriba ? ' up' : ''}`}>{tendencia}</div>}
      </div>
    );
  }

  return (
    <div className={`stat-card stat-col stat-${color}`}>
      <div className="stat-icon">{icono}</div>
      <div className="stat-num">{valor}</div>
      <div className="stat-lab">{etiqueta}</div>
    </div>
  );
}
