// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardEmpresa, exportarReporteEmpresa } from '../../services/empresas';
import { listarContratacionesEmpresa } from '../../services/contrataciones';
import { Mensaje, EstadoCarga } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import FiltroPeriodo from '../../components/FiltroPeriodo';
import DashboardGrid from '../../components/dashboard/DashboardGrid';
import ActivityCard from '../../components/dashboard/ActivityCard';
import BarChartCard from '../../components/dashboard/BarChartCard';
import { DONA_ESTADO_POSTULACION } from '../../constants';
import { errorApi, fechaHora } from '../../utils';

const OFERTAS_DONA = [
  { estado: 'publicada', etiqueta: 'Publicada', color: 'var(--green)' },
  { estado: 'pendiente', etiqueta: 'Pendiente de revisión', color: 'var(--amber)' },
  { estado: 'rechazada', etiqueta: 'Rechazada', color: 'var(--red-c)' },
  { estado: 'borrador', etiqueta: 'Borrador', color: 'var(--blue-c)' },
  { estado: 'cerrada', etiqueta: 'Cerrada', color: 'var(--gray-c)' },
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

export default function Dashboard() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ desde: '', hasta: '' });
  const [filtro, setFiltro] = useState({ desde: '', hasta: '' });
  const [descargando, setDescargando] = useState(false);
  const [errorExportar, setErrorExportar] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-empresa', filtro.desde, filtro.hasta],
    queryFn: () => dashboardEmpresa({
      desde: filtro.desde || undefined,
      hasta: filtro.hasta || undefined,
    }),
  });
  const { data: contratos } = useQuery({
    queryKey: ['contrataciones-empresa', filtro.desde, filtro.hasta],
    queryFn: () => listarContratacionesEmpresa({
      desde: filtro.desde || undefined,
      hasta: filtro.hasta || undefined,
    }),
  });

  const postulaciones = data?.postulaciones || {};
  const totalPostulaciones = Object.values(postulaciones).reduce((suma, n) => suma + n, 0);
  const contratosPeriodo = (contratos || []).length;
  const pendientes = data?.pendientes_recientes || [];

  const ofertasItems = OFERTAS_DONA.map((o) => ({ etiqueta: o.etiqueta, valor: data?.ofertas?.[o.estado] || 0, color: o.color }));
  const postulacionesItems = DONA_ESTADO_POSTULACION.map((o) => ({ etiqueta: o.etiqueta, valor: postulaciones[o.estado] || 0, color: o.color }));

  const aplicar = () => {
    setMensajeExito(null);
    setFiltro({ ...form });
  };

  const limpiar = () => {
    setForm({ desde: '', hasta: '' });
    setFiltro({ desde: '', hasta: '' });
    setMensajeExito(null);
    setErrorExportar(null);
  };

  const exportar = async () => {
    setDescargando(true);
    setErrorExportar(null);
    setMensajeExito(null);
    try {
      const blob = await exportarReporteEmpresa({
        desde: filtro.desde || undefined,
        hasta: filtro.hasta || undefined,
      });
      const sufijo = [filtro.desde, filtro.hasta].filter(Boolean).join('_');
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      enlace.download = `reporte-empresa-${sufijo || new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(enlace.href);
      setMensajeExito('Reporte generado. Revise su descarga.');
    } catch {
      setErrorExportar('No se pudo generar el reporte Excel. Intente nuevamente.');
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div>
      <PageHeader
        titulo="Panel de empresa"
        descripcion="Resumen de tu actividad como empleador en Empleo MDJLO."
        accion={(
          <button className="btn btn-primario" type="button" onClick={() => navigate('/empresa/ofertas', { state: { nueva: true } })}>
            <i className="ti ti-plus" />
            <span>Nueva oferta</span>
          </button>
        )}
      />

      <FiltroPeriodo
        form={form}
        onCambiar={setForm}
        onAplicar={aplicar}
        onLimpiar={limpiar}
        onExportar={exportar}
        exportando={descargando}
        errorExportar={errorExportar}
        mensajeExito={mensajeExito}
      />

      {error && <Mensaje>{errorApi(error)}</Mensaje>}
      {isLoading && !data && <EstadoCarga />}

      {data && (
        <>
          <div className="kpi-row">
            <StatCard color="blue" icono={<i className="ti ti-briefcase" />} valor={data.ofertas.publicada} etiqueta="Ofertas publicadas" />
            <StatCard color="amber" icono={<i className="ti ti-clock" />} valor={data.ofertas.pendiente} etiqueta="Ofertas en revisión" />
            <StatCard color="blue" icono={<i className="ti ti-users" />} valor={totalPostulaciones} etiqueta="Postulaciones recibidas" />
            <StatCard color="amber" icono={<i className="ti ti-clock" />} valor={postulaciones.pendiente} etiqueta="Pendientes por revisar" />
            <StatCard color="green" icono={<i className="ti ti-check" />} valor={contratosPeriodo} etiqueta="Contrataciones del periodo" />
          </div>

          {totalPostulaciones === 0 && contratosPeriodo === 0 && (filtro.desde || filtro.hasta) && (
            <p className="vacio">Sin actividad registrada en el periodo seleccionado.</p>
          )}

          {/* Sistema de dashboard compartido: actividad (principal) + charts. */}
          <DashboardGrid>
            <ActivityCard
              titulo="Actividad reciente"
              verTodas={{ to: '/empresa/postulaciones' }}
              items={pendientes.slice(0, 5).map((p) => ({
                key: p.id,
                avatar: iniciales(`${p.nombres} ${p.apellidos}`),
                titulo: p.puesto,
                sub: `${p.nombres} ${p.apellidos}`,
                fecha: fechaHora(p.fecha_postulacion),
                badge: 'Pendiente',
                badgeClase: 'badge-amber',
              }))}
              vacioTexto="No hay postulaciones pendientes por revisar."
            />

            <div className="dash-col">
              <BarChartCard titulo="Mis ofertas" descripcion="Estado actual de tus ofertas" items={ofertasItems} />
              <BarChartCard titulo="Postulaciones" descripcion="En qué etapa están tus candidatos" items={postulacionesItems} />
            </div>
          </DashboardGrid>
        </>
      )}
    </div>
  );
}
