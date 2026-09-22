// SPDX-License-Identifier: MIT
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Briefcase, Clock3, FileCheck2, IdCard, Search } from 'lucide-react';
import { dashboardPostulante } from '../../services/postulante';
import { Mensaje, EstadoCarga } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import DonutCard from '../../components/DonutCard';
import { DONA_ESTADO_POSTULACION } from '../../constants';
import { errorApi } from '../../utils';

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard-postulante'], queryFn: dashboardPostulante });

  const postulaciones = data?.postulaciones || {};
  const total = data?.total_postulaciones ?? 0;

  return (
    <div>
      <PageHeader
        titulo="Mi actividad laboral"
        descripcion="Resumen de tus postulaciones y del estado de tu perfil."
      />

      {error && <Mensaje>{errorApi(error)}</Mensaje>}
      {isLoading && !data && <EstadoCarga />}

      {data && (
        <>
          <div className="stat-row">
            <StatCard variante="row" color="blue" icono={<Briefcase size={20} aria-hidden="true" />} valor={total} etiqueta="Postulaciones realizadas" />
            <StatCard variante="row" color="amber" icono={<Clock3 size={20} aria-hidden="true" />} valor={postulaciones.pendiente || 0} etiqueta="Pendientes por revisar" />
            <StatCard
              variante="row"
              color="green"
              icono={<FileCheck2 size={20} aria-hidden="true" />}
              valor={data.con_cv ? 'Sí' : '—'}
              etiqueta={data.con_cv ? 'CV cargado' : 'Sin CV cargado'}
            />
          </div>

          {total > 0 ? (
            <DonutCard
              titulo="Estado de mis postulaciones"
              descripcion="Distribución de tus postulaciones por etapa"
              datos={postulaciones}
              items={DONA_ESTADO_POSTULACION}
              etiquetaTotal="Postulaciones"
            />
          ) : (
            <div className="list-card">
              <div className="list-card-head">
                <h2>Estado de mis postulaciones</h2>
              </div>
              <div className="empty-card">
                <FileCheck2 size={28} aria-hidden="true" />
                <p>No tienes postulaciones todavía. Explora las ofertas publicadas y postúlate.</p>
              </div>
            </div>
          )}

          <div className="form-fila" style={{ marginTop: 18 }}>
            <Link className="btn btn-primario" to="/postulante/buscar">
              <Search size={17} aria-hidden="true" />Buscar empleo
            </Link>
            <Link className="btn btn-gris" to="/postulante/perfil">
              <IdCard size={17} aria-hidden="true" />Gestionar perfil y CV
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
