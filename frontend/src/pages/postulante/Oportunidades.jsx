// SPDX-License-Identifier: MIT
import { useQuery } from '@tanstack/react-query';
import { listarActividadesPublicas, listarOportunidadesPublicas } from '../../services/divulgacion';
import { EstadoCarga, Mensaje } from '../../components/UI';
import { ETIQUETA_ESTADO_ACTIVIDAD, ETIQUETA_FUENTE_OPORTUNIDAD, ETIQUETA_TIPO_ACTIVIDAD } from '../../constants';
import { errorApi, fechaCalendario, fechaHora } from '../../utils';

const CLASE_ESTADO_ACTIVIDAD = {
  programado: 'badge-amber',
  en_curso: 'badge-blue',
  finalizado: 'badge-green',
  cancelado: 'badge-gray',
};

const CLASE_FUENTE = {
  empleos_peru: 'badge-green',
  mype_local: 'badge-blue',
  otro: 'badge-gray',
};

export default function Oportunidades() {
  const actividades = useQuery({ queryKey: ['actividades-publicas'], queryFn: listarActividadesPublicas });
  const oportunidades = useQuery({ queryKey: ['oportunidades-publicas'], queryFn: listarOportunidadesPublicas });

  return (
    <div>
      <div className="page-head">
        <h1>Ferias y oportunidades</h1>
        <p>Actividades municipales de intermediación y oportunidades de empleo difundidas.</p>
      </div>

      <div className="list-card">
        <div className="list-card-head">
          <h2>Ferias, talleres y capacitaciones programadas</h2>
        </div>
        {actividades.isLoading && <EstadoCarga />}
        {actividades.error && <Mensaje>{errorApi(actividades.error)}</Mensaje>}
        {actividades.data && actividades.data.length === 0 && (
          <p className="empty-note">No hay actividades programadas por ahora. Vuelve pronto.</p>
        )}
        {actividades.data?.length > 0 && (
          <div className="malla">
            {actividades.data.map((a) => (
              <div className="tarjeta" key={a.id} style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--ink)' }}>{a.nombre}</h3>
                  <span className={`badge ${CLASE_ESTADO_ACTIVIDAD[a.estado] || 'badge-gray'}`}>{ETIQUETA_ESTADO_ACTIVIDAD[a.estado] || a.estado}</span>
                </div>
                <p style={{ color: 'var(--text-2)', margin: '10px 0 8px', fontSize: '0.88rem' }}>
                  <i className="ti ti-calendar-event" style={{ marginRight: 5, color: 'var(--blue)' }} />
                  {ETIQUETA_TIPO_ACTIVIDAD[a.tipo]} · {fechaHora(a.fecha_inicio)}
                  {a.lugar ? <><br />Lugar: {a.lugar}</> : null}
                  {a.modalidad ? <><br />Modalidad: {a.modalidad}</> : null}
                </p>
                {a.descripcion && <p style={{ fontSize: '0.9rem', margin: '0 0 8px' }}>{a.descripcion}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="list-card">
        <div className="list-card-head">
          <h2>Oportunidades de empleo y convocatorias</h2>
        </div>
        {oportunidades.isLoading && <EstadoCarga />}
        {oportunidades.error && <Mensaje>{errorApi(oportunidades.error)}</Mensaje>}
        {oportunidades.data && oportunidades.data.length === 0 && (
          <p className="empty-note">No hay oportunidades difundidas en este momento.</p>
        )}
        {oportunidades.data?.length > 0 && (
          <div className="malla">
            {oportunidades.data.map((o) => (
              <div className="tarjeta" key={o.id} style={{ margin: 0 }}>
                <span className={`badge ${CLASE_FUENTE[o.fuente] || 'badge-gray'}`}>{ETIQUETA_FUENTE_OPORTUNIDAD[o.fuente] || o.fuente}</span>
                <h3 style={{ margin: '8px 0 6px', fontSize: '15px', color: 'var(--ink)' }}>{o.titulo}</h3>
                {o.descripcion && <p style={{ fontSize: '0.9rem', margin: '0 0 8px' }}>{o.descripcion}</p>}
                <p style={{ color: 'var(--text-2)', fontSize: '0.85rem', margin: 0 }}>
                  {o.razon_social ? `${o.razon_social} · ` : ''}Difundida el {fechaCalendario(o.fecha_publicacion)}
                </p>
                {o.enlace && (
                  <a className="btn btn-gris" style={{ marginTop: '0.7rem' }} href={o.enlace} target="_blank" rel="noreferrer">
                    <i className="ti ti-external-link" />Ver convocatoria
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
