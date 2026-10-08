// SPDX-License-Identifier: MIT
import { Link } from 'react-router-dom';

/**
 * ActivityCard — tarjeta de actividad reciente (misma estructura para los tres
 * roles; el contenido cambia). Cada item: { avatar, titulo, sub, fecha, badge,
 * badgeClase, onClick }.
 */
export default function ActivityCard({
  titulo = 'Actividad reciente',
  descripcion,
  items = [],
  verTodas,
  vacioTitulo = 'Sin actividad por mostrar.',
  vacioTexto,
}) {
  return (
    <div className="chart-card">
      <div className="chart-card-head dash-head-accion">
        <div>
          <h2>{titulo}</h2>
          {descripcion && <p>{descripcion}</p>}
        </div>
        {verTodas && (
          <Link to={verTodas.to} className="see-all">
            {verTodas.texto || 'Ver todas'}<i className="ti ti-arrow-right" />
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty-card">
          <i className="ti ti-circle-check" />
          <p>{vacioTexto || vacioTitulo}</p>
        </div>
      ) : (
        <div className="dash-activity">
          {items.map((it, i) => {
            const accionable = typeof it.onClick === 'function';
            return (
              <div
                className={`dash-activity-row${accionable ? ' accionable' : ''}`}
                key={it.key ?? i}
                onClick={accionable ? it.onClick : undefined}
                role={accionable ? 'button' : undefined}
                tabIndex={accionable ? 0 : undefined}
                onKeyDown={accionable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); it.onClick(); } } : undefined}
              >
                <div className="dash-activity-avatar">{it.avatar}</div>
                <div className="dash-activity-main">
                  <strong>{it.titulo}</strong>
                  {it.sub && <small>{it.sub}</small>}
                </div>
                <div className="dash-activity-meta">
                  {it.fecha && <div className="fecha">{it.fecha}</div>}
                  {it.badge && <span className={`badge ${it.badgeClase || 'badge-gray'}`}>{it.badge}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
