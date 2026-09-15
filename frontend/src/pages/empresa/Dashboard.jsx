import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardEmpresa } from '../../services/empresas';
import { listarContratacionesEmpresa } from '../../services/contrataciones';
import { Mensaje, EstadoCarga } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { errorApi, fechaHora } from '../../utils';

const OFERTAS_DONA = [
  { estado: 'publicada', etiqueta: 'Publicada', color: 'var(--green)' },
  { estado: 'borrador', etiqueta: 'Borrador', color: 'var(--blue-c)' },
  { estado: 'cerrada', etiqueta: 'Cerrada', color: 'var(--gray-c)' },
];

const POSTULACIONES_DONA = [
  { estado: 'pendiente', etiqueta: 'Pendiente', color: 'var(--amber)' },
  { estado: 'en_revision', etiqueta: 'En revisión', color: 'var(--blue-c)' },
  { estado: 'preseleccionado', etiqueta: 'Preseleccionado', color: 'var(--blue-tx)' },
  { estado: 'contactado', etiqueta: 'Contactado', color: 'var(--blue-dark)' },
  { estado: 'seleccionado', etiqueta: 'Seleccionado', color: 'var(--green)' },
  { estado: 'no_seleccionado', etiqueta: 'No seleccionado', color: 'var(--gray-c)' },
];

function iniciales(nombre = '') {
  const siglas = (nombre || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0] || '')
    .join('');
  return (siglas || '—').toUpperCase();
}

function esEsteMes(fecha) {
  if (!fecha) return false;
  const ahora = new Date();
  const mes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
  return String(fecha).slice(0, 7) === mes;
}

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

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard-empresa'], queryFn: dashboardEmpresa });
  const { data: contratos } = useQuery({ queryKey: ['contrataciones-empresa'], queryFn: listarContratacionesEmpresa });

  const postulaciones = data?.postulaciones || {};
  const totalPostulaciones = Object.values(postulaciones).reduce((suma, n) => suma + n, 0);
  const contratosMes = (contratos || []).filter((c) => esEsteMes(c.fecha_contratacion)).length;
  const pendientes = data?.pendientes_recientes || [];

  return (
    <div>
      <PageHeader
        titulo="Panel de empresa"
        descripcion="Resumen de tu actividad como empleador en Empleo MDJLO."
        accion={(
          <button className="btn btn-primario" type="button" onClick={() => navigate('/empresa/ofertas', { state: { nueva: true } })}>
            <i className="ti ti-plus" />
            <span>Publicar oferta</span>
          </button>
        )}
      />

      {error && <Mensaje>{errorApi(error)}</Mensaje>}
      {isLoading && !data && <EstadoCarga />}

      {data && (
        <>
          <div className="kpi-row">
            <StatCard color="blue" icono={<i className="ti ti-briefcase" />} valor={data.ofertas.publicada} etiqueta="Ofertas publicadas" />
            <StatCard color="blue" icono={<i className="ti ti-users" />} valor={totalPostulaciones} etiqueta="Postulaciones recibidas" />
            <StatCard color="amber" icono={<i className="ti ti-clock" />} valor={postulaciones.pendiente} etiqueta="Pendientes por revisar" />
            <StatCard color="green" icono={<i className="ti ti-check" />} valor={contratosMes} etiqueta="Contrataciones este mes" />
          </div>

          <div className="dash-grid">
            <section className="list-card">
              <div className="list-card-head">
                <h2>Actividad reciente</h2>
                <Link to="/empresa/postulaciones" className="see-all">
                  Ver todas<i className="ti ti-arrow-right" />
                </Link>
              </div>

              {pendientes.length === 0 && (
                <div className="empty-card">
                  <i className="ti ti-circle-check" />
                  <p>No hay postulaciones pendientes por revisar.</p>
                </div>
              )}

              {pendientes.length > 0 && (
                <div>
                  {pendientes.slice(0, 5).map((p) => (
                    <div className="app-row" key={p.id}>
                      <div className="app-avatar">{iniciales(`${p.nombres} ${p.apellidos}`)}</div>
                      <div className="app-main">
                        <div className="job">{p.puesto}</div>
                        <div className="who">{p.nombres} {p.apellidos}</div>
                      </div>
                      <div className="app-meta">
                        <div className="date">{fechaHora(p.fecha_postulacion)}</div>
                        <span className="badge badge-amber">Pendiente</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <aside className="dash-aside">
              <DonutCard titulo="Mis ofertas" descripcion="Estado actual de tus ofertas" datos={data.ofertas} items={OFERTAS_DONA} />
              <DonutCard titulo="Postulaciones" descripcion="En qué etapa están tus candidatos" datos={postulaciones} items={POSTULACIONES_DONA} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function DonutCard({ titulo, descripcion, datos, items }) {
  const total = items.reduce((suma, it) => suma + (datos[it.estado] || 0), 0);

  return (
    <div className="chart-card">
      <div className="chart-card-head">
        <h2>{titulo}</h2>
        <p>{descripcion}</p>
      </div>
      <div className="chart-body">
        <div className="donut" style={{ background: donutGradiente(datos, items) }}>
          <div className="donut-hole">
            <b>{total}</b>
            <span>total</span>
          </div>
        </div>
        <div className="legend">
          {items.map((it) => (
            <div key={it.estado} className={`legend-row${(datos[it.estado] || 0) === 0 ? ' zero' : ''}`}>
              <div className="legend-left">
                <span className="legend-dot" style={{ background: it.color }} />
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
