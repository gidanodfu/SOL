import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listarMisPostulaciones, retirarPostulacion } from '../../services/postulante';
import { EstadoCarga, Boton, Estado, Mensaje } from '../../components/UI';
import { ETIQUETA_ESTADO_POSTULACION } from '../../constants';
import { errorApi, fechaHora } from '../../utils';

export default function MisPostulaciones() {
  const queryClient = useQueryClient();
  const [nota, setNota] = useState(null);
  const [error, setError] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['mis-postulaciones'], queryFn: listarMisPostulaciones });

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['mis-postulaciones'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-postulante'] });
  };

  const retirar = async (id) => {
    if (!window.confirm('¿Retirar esta postulación? Quedará registrada como inactiva (no se elimina).')) return;
    setError(null);
    try {
      await retirarPostulacion(id);
      setNota('Postulación retirada.');
      refrescar();
    } catch (e) {
      setError(errorApi(e));
    }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Mis postulaciones</h1>
        <p>Seguimiento de las postulaciones que realizaste a las ofertas de empleo.</p>
      </div>

      <Mensaje tipo="exito">{nota}</Mensaje>
      <Mensaje>{error}</Mensaje>
      {isLoading && <EstadoCarga />}
      {data && data.length === 0 && (
        <div className="list-card">
          <p className="empty-note">Aún no realizas postulaciones. Busca ofertas de empleo y postula en pocos pasos.</p>
          <p style={{ textAlign: 'center', marginBottom: 0 }}>
            <Link className="btn btn-primario" to="/postulante/buscar"><i className="ti ti-search" />Buscar empleo</Link>
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="list-card">
          <div className="list-card-head">
            <h2>Postulaciones registradas</h2>
          </div>
          {data.map((p) => (
            <div className="fila" key={p.id}>
              <div className="fila-main">
                <div className="fila-titulo">{p.puesto}</div>
                <div className="fila-sub">
                  {p.razon_social}{p.ruc ? ` (RUC ${p.ruc})` : ''}
                  {p.categoria_nombre || p.ubicacion ? ` · ${[p.categoria_nombre, p.ubicacion].filter(Boolean).join(' · ')}` : ''}
                </div>
              </div>
              <div className="fila-derecha">
                <div className="fecha">{fechaHora(p.fecha_postulacion)}</div>
                <Estado valor={p.estado} diccionario={ETIQUETA_ESTADO_POSTULACION} />
              </div>
              <div>
                {p.activo === 1 ? (
                  <Boton variante="peligro" onClick={() => retirar(p.id)}>Retirar</Boton>
                ) : (
                  <span className="badge badge-gray">Retirada</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
