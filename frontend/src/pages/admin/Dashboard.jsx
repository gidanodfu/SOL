// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  Briefcase,
  Building2,
  Clock3,
  Percent,
  Timer,
  UserCheck,
  Users,
} from 'lucide-react';
import { dashboardAdmin, exportarReporteAdmin } from '../../services/dashboard';
import { Mensaje, EstadoCarga } from '../../components/UI';
import FiltroPeriodo from '../../components/FiltroPeriodo';
import StatCard from '../../components/StatCard';
import { ETIQUETA_ESTADO_OFERTA, ETIQUETA_ESTADO_POSTULACION } from '../../constants';
import { errorApi } from '../../utils';

const ORDEN_POSTULACIONES = ['pendiente', 'en_revision', 'preseleccionado', 'contactado', 'seleccionado', 'no_seleccionado'];
const ORDEN_OFERTAS = ['publicada', 'borrador', 'cerrada'];

export default function Dashboard() {
  const [form, setForm] = useState({ desde: '', hasta: '' });
  const [filtro, setFiltro] = useState({ desde: '', hasta: '' });
  const [descargando, setDescargando] = useState(false);
  const [errorExportar, setErrorExportar] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-admin', filtro.desde, filtro.hasta],
    queryFn: () => dashboardAdmin({ desde: filtro.desde || undefined, hasta: filtro.hasta || undefined }),
  });

  const aplicar = () => setFiltro({ ...form });

  const limpiar = () => {
    setForm({ desde: '', hasta: '' });
    setFiltro({ desde: '', hasta: '' });
  };

  const exportar = async () => {
    setDescargando(true);
    setErrorExportar(null);
    try {
      const blob = await exportarReporteAdmin({ desde: filtro.desde || undefined, hasta: filtro.hasta || undefined });
      const sufijo = [filtro.desde, filtro.hasta].filter(Boolean).join('_');
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      enlace.download = sufijo ? `reporte-empleo-${sufijo}.xlsx` : 'SOL-reporte-empleo.xlsx';
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(enlace.href);
    } catch {
      setErrorExportar('No se pudo generar el reporte Excel. Intente nuevamente.');
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div>
      <FiltroPeriodo
        form={form}
        onCambiar={setForm}
        onAplicar={aplicar}
        onLimpiar={limpiar}
        onExportar={exportar}
        exportando={descargando}
        errorExportar={errorExportar}
      />

      {isLoading && <EstadoCarga texto="Cargando indicadores…" />}
      {error && <Mensaje>{errorApi(error)}</Mensaje>}

      {data && (
        <>
          <GrillaKpis d={data} />

          <div className="analytics">
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>Actividad de postulaciones</h3>
                  <p>Postulaciones recibidas por mes</p>
                </div>
              </div>
              <GraficoMensual serie={data.actividad_mensual} />
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <h3>Postulaciones por estado</h3>
                  <p>Distribución actual del periodo</p>
                </div>
              </div>
              <FilasProgreso datos={data.postulaciones} orden={ORDEN_POSTULACIONES} diccionario={ETIQUETA_ESTADO_POSTULACION} />
            </div>
          </div>

          <div className="bottom-grid">
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>Ofertas por estado</h3>
                  <p>Situación de las ofertas</p>
                </div>
              </div>
              <FilasProgreso datos={data.ofertas} orden={ORDEN_OFERTAS} diccionario={ETIQUETA_ESTADO_OFERTA} />
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <h3>Indicadores de efectividad</h3>
                  <p>Tasas y tiempos de los procesos</p>
                </div>
              </div>
              <ListaIndicadores d={data} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function GrillaKpis({ d }) {
  const totalPost = Object.values(d.postulaciones || {}).reduce((a, b) => a + b, 0);

  const kpis = [
    {
      nombre: 'Empresas', valor: d.empresas?.total, descripcion: 'empresas registradas', color: 'blue',
      icono: Building2, tendencia: `${d.empresas?.activas || 0} activa(s)`,
    },
    {
      nombre: 'Postulantes activos', valor: d.postulantes_activos, descripcion: 'ciudadanos con cuenta', color: 'green',
      icono: Users, tendencia: 'Usuarios activos',
    },
    {
      nombre: 'Empresas con procesos', valor: d.empresas_con_procesos, descripcion: 'selección en curso', color: 'amber',
      icono: Briefcase, tendencia: 'Con postulaciones activas',
    },
    {
      nombre: 'Contrataciones', valor: d.contrataciones, descripcion: 'colocaciones logradas', color: 'purple',
      icono: UserCheck, tendencia: 'Contratos registrados',
    },
    {
      nombre: 'Tiempo a contacto', valor: d.tiempo_promedio_contacto_dias ?? '—', descripcion: 'días promedio', color: 'amber',
      icono: Clock3, tendencia: 'postulación → contacto',
    },
    {
      nombre: 'Tasa de selección', valor: `${d.tasa_seleccion}%`, descripcion: 'seleccionados ÷ postulaciones', color: 'green',
      icono: Percent, tendencia: `${d.seleccionados} de ${totalPost} postulaciones`,
    },
    {
      nombre: 'Tasa de contratación', valor: `${d.tasa_contratacion}%`, descripcion: 'contratados ÷ seleccionados', color: 'purple',
      icono: BadgeCheck, tendencia: `${d.contrataciones} de ${d.seleccionados} seleccionados`,
    },
  ];

  return (
    <div className="kpi-grid">
      {kpis.map((k) => (
        <StatCard
          key={k.nombre}
          variante="panel"
          color={k.color}
          icono={<k.icono size={21} />}
          etiqueta={k.nombre}
          valor={k.valor}
          descripcion={k.descripcion}
          tendencia={k.tendencia}
        />
      ))}
    </div>
  );
}

function GraficoMensual({ serie }) {
  if (!serie || serie.length === 0) {
    return <p className="vacio">Sin postulaciones en el periodo.</p>;
  }
  const max = Math.max(1, ...serie.map((s) => s.total));

  return (
    <div>
      <div className="bars">
        {serie.map((s) => (
          <div className="bar-col" key={s.mes}>
            <div className="bar-cap">
              <div className={`bar${s.total ? '' : ' empty'}`} style={{ height: `${Math.max(3, (s.total / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="months">
        {serie.map((s) => <span key={s.mes}>{s.etiqueta}</span>)}
      </div>
    </div>
  );
}

function FilasProgreso({ datos, orden, diccionario }) {
  const filas = orden.filter((k) => (Number(datos?.[k]) || 0) > 0);
  if (filas.length === 0) {
    return <p className="vacio">Sin registros en el periodo.</p>;
  }
  const total = filas.reduce((a, k) => a + (Number(datos[k]) || 0), 0);

  return (
    <div className="status-list">
      {filas.map((k) => {
        const n = Number(datos[k]) || 0;
        return (
          <div className="status-row" key={k}>
            <span className="status-label">{diccionario[k] || k}</span>
            <div className="progress"><span style={{ width: `${(n / total) * 100}%` }} /></div>
            <span className="status-number">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

function ListaIndicadores({ d }) {
  const filas = [
    {
      icono: Percent, etiqueta: 'Tasa de selección',
      sub: `${d.seleccionados} de ${Object.values(d.postulaciones || {}).reduce((a, b) => a + b, 0)} postulaciones`,
      valor: `${d.tasa_seleccion}%`, clase: 'success',
    },
    {
      icono: BadgeCheck, etiqueta: 'Tasa de contratación',
      sub: `${d.contrataciones} de ${d.seleccionados} seleccionados`,
      valor: `${d.tasa_contratacion}%`, clase: 'process',
    },
    {
      icono: Clock3, etiqueta: 'Tiempo a contacto',
      sub: 'días promedio postulación → contacto',
      valor: d.tiempo_promedio_contacto_dias === null ? '—' : `${d.tiempo_promedio_contacto_dias} d`, clase: 'pending',
    },
    {
      icono: Timer, etiqueta: 'Tiempo a selección',
      sub: 'días promedio postulación → selección',
      valor: d.tiempo_promedio_seleccion_dias === null ? '—' : `${d.tiempo_promedio_seleccion_dias} d`, clase: 'pending',
    },
  ];

  return filas.map((f) => (
    <div className="attention" key={f.etiqueta}>
      <div className="attention-info">
        <div className="attention-icon"><f.icono size={17} /></div>
        <div>
          <strong>{f.etiqueta}</strong>
          <small>{f.sub}</small>
        </div>
      </div>
      <span className={`badge ${f.clase}`}>{f.valor}</span>
    </div>
  ));
}
