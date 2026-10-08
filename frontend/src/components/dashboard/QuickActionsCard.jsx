// SPDX-License-Identifier: MIT
import { Link } from 'react-router-dom';

/**
 * QuickActionsCard — acciones frecuentes. Mismo componente para los tres roles;
 * cambian título, descripción y acciones. Cada acción: { to? , onClick?, texto,
 * icono?, variante? (primario|gris|acento|exito|peligro) }.
 */
export default function QuickActionsCard({ titulo = 'Acciones rápidas', descripcion, acciones = [] }) {
  return (
    <div className="chart-card">
      <div className="chart-card-head">
        <h2>{titulo}</h2>
        {descripcion && <p>{descripcion}</p>}
      </div>
      <div className="dash-actions">
        {acciones.map((a, i) => {
          const clase = `btn btn-${a.variante || 'gris'}`;
          return a.onClick ? (
            <button key={i} type="button" className={clase} onClick={a.onClick}>
              {a.icono}{a.texto}
            </button>
          ) : (
            <Link key={i} to={a.to} className={clase}>
              {a.icono}{a.texto}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
