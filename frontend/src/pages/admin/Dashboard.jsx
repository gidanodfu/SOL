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
import { dashboardAdmin, exportarReporteAdmin, empleabilidadAdmin } from '../../services/dashboard';
import { Mensaje, EstadoCarga } from '../../components/UI';
import FiltroPeriodo from '../../components/FiltroPeriodo';
import StatCard from '../../components/StatCard';
import DashboardGrid from '../../components/dashboard/DashboardGrid';
import BarChartCard from '../../components/dashboard/BarChartCard';
import MetricListCard from '../../components/dashboard/MetricListCard';
import { ETIQUETA_ESTADO_OFERTA, ETIQUETA_ESTADO_POSTULACION, ETIQUETA_SITUACION_CONTRATACION } from '../../constants';
import { errorApi } from '../../utils';

const ORDEN_POSTULACIONES = ['pendiente', 'en_revision', 'seleccionado', 'no_seleccionado'];
const ORDEN_OFERTAS = ['pendiente', 'publicada', 'rechazada', 'borrador', 'cerrada'];

/** Adapta un conteo por estado a los items del gráfico (solo > 0). */
function filas(datos, orden, diccionario) {
  return orden
    .filter((k) => (Number(datos?.[k]) || 0) > 0)
    .map((k) => ({ etiqueta: diccionario[k] || k, valor: Number(datos[k]) || 0 }));
}

/** Indicadores de efectividad (sin gráfico) → items de MetricListCard. */
function indicadores(d) {
  const totalPost = Object.values(d.postulaciones || {}).reduce((a, b) => a + b, 0);
  return [
    { icono: <Percent size={17} />, etiqueta: 'Tasa de selección', sub: `${d.seleccionados} de ${totalPost} postulaciones`, valor: `${d.tasa_seleccion}%`, badge: true, tono: 'badge-green' },
    { icono: <BadgeCheck size={17} />, etiqueta: 'Tasa de contratación', sub: `${d.contrataciones} de ${d.seleccionados} seleccionados`, valor: `${d.tasa_contratacion}%`, badge: true, tono: 'badge-blue' },
    { icono: <Clock3 size={17} />, etiqueta: 'Tiempo a revisión', sub: 'días promedio postulación → revisión', valor: d.tiempo_promedio_revision_dias === null ? '—' : `${d.tiempo_promedio_revision_dias} d`, badge: true, tono: 'badge-amber' },
    { icono: <Timer size={17} />, etiqueta: 'Tiempo a selección', sub: 'días promedio postulación → selección', valor: d.tiempo_promedio_seleccion_dias === null ? '—' : `${d.tiempo_promedio_seleccion_dias} d`, badge: true, tono: 'badge-amber' },
  ];
}

export default function Dashboard() {
  const [form, setForm] = useState({ desde: '', hasta: '' });
  const [filtro, setFiltro] = useState({ desde: '', hasta: '' });
  const [descargando, setDescargando] = useState(false);
  const [errorExportar, setErrorExportar] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-admin', filtro.desde, filtro.hasta],
    queryFn: () => dashboardAdmin({ desde: filtro.desde || undefined, hasta: filtro.hasta || undefined }),
  });

  const { data: empleabilidad } = useQuery({
    queryKey: ['empleabilidad-admin'],
    queryFn: empleabilidadAdmin,
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

          {/* Fila principal: tendencia mensual + distribución de postulaciones. */}
          <DashboardGrid>
            <BarChartCard
              titulo="Actividad de postulaciones"
              descripcion="Postulaciones recibidas por mes"
              orientation="vertical"
              items={(data.actividad_mensual || []).map((s) => ({ etiqueta: s.etiqueta, valor: s.total }))}
              vacio="Sin postulaciones en el periodo."
            />
            <BarChartCard
              titulo="Postulaciones por estado"
              descripcion="Distribución actual del periodo"
              items={filas(data.postulaciones, ORDEN_POSTULACIONES, ETIQUETA_ESTADO_POSTULACION)}
            />
          </DashboardGrid>

          {empleabilidad && <Empleabilidad datos={empleabilidad} />}

          <DashboardGrid equal>
            <BarChartCard
              titulo="Ofertas por estado"
              descripcion="Situación de las ofertas"
              items={filas(data.ofertas, ORDEN_OFERTAS, ETIQUETA_ESTADO_OFERTA)}
            />
            <MetricListCard
              titulo="Indicadores de efectividad"
              descripcion="Tasas y tiempos de los procesos"
              items={indicadores(data)}
            />
          </DashboardGrid>
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
      nombre: 'Ofertas por revisar', valor: d.ofertas?.pendiente, descripcion: 'pendientes de revisión', color: 'amber',
      icono: Briefcase, tendencia: 'esperando aprobación municipal',
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
      nombre: 'Tiempo a revisión', valor: d.tiempo_promedio_revision_dias ?? '—', descripcion: 'días promedio', color: 'amber',
      icono: Clock3, tendencia: 'postulación → revisión',
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

/**
 * Estadísticas de empleabilidad (RF-58/RF-60): empleos generados y situación de
 * las contrataciones. Datos del backend, misma primitive de gráfico compartida.
 */
function Empleabilidad({ datos }) {
  const situaciones = datos.situaciones || {};
  const empresasItems = (datos.empresas || []).map((e) => ({ etiqueta: e.razon_social, valor: e.total_ofertas }));
  const situacionItems = ['contratado', 'finalizado', 'despedido', 'renuncio']
    .filter((k) => (Number(situaciones[k]) || 0) > 0)
    .map((k) => ({ etiqueta: ETIQUETA_SITUACION_CONTRATACION[k] || k, valor: Number(situaciones[k]) || 0 }));

  return (
    <DashboardGrid equal>
      <BarChartCard titulo="Empleos generados" descripcion="Ofertas publicadas por empresa" items={empresasItems} vacio="Sin ofertas registradas." />
      <BarChartCard titulo="Situación de contrataciones" descripcion={`Total: ${datos.contrataciones}`} items={situacionItems} vacio="Sin contrataciones registradas." />
    </DashboardGrid>
  );
}
