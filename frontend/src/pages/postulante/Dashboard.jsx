// SPDX-License-Identifier: MIT
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dashboardPostulante } from '../../services/postulante';
import { Estado, Mensaje, EstadoCarga } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { ETIQUETA_ESTADO_POSTULACION } from '../../constants';
import { errorApi } from '../../utils';

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard-postulante'], queryFn: dashboardPostulante });

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
            <StatCard variante="row" color="blue" icono={<i className="ti ti-briefcase" />} valor={data.total_postulaciones} etiqueta="Postulaciones realizadas" />
            <StatCard variante="row" color="amber" icono={<i className="ti ti-clock" />} valor={data.postulaciones?.pendiente || 0} etiqueta="Pendientes por revisar" />
            <StatCard variante="row" color="green" icono={<i className="ti ti-file-check" />} valor={data.con_cv ? '' : '—'} etiqueta={data.con_cv ? 'CV cargado' : 'Sin CV cargado'} />
          </div>

          <div className="list-card">
            <div className="list-card-head">
              <h2>Estado de mis postulaciones</h2>
            </div>
            {Object.entries(data.postulaciones || {}).map(([clave, n]) => (
              <div className="estado-fila" key={clave}>
                <Estado valor={clave} diccionario={ETIQUETA_ESTADO_POSTULACION} />
                <strong>{n}</strong>
              </div>
            ))}
            <div className="form-fila" style={{ marginTop: 18 }}>
              <Link className="btn btn-primario" to="/postulante/buscar"><i className="ti ti-search" />Buscar empleo</Link>
              <Link className="btn btn-gris" to="/postulante/perfil"><i className="ti ti-id" />Gestionar perfil y CV</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
