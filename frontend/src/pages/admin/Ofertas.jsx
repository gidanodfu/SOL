// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cerrarOfertaAdmin, listarOfertasAdmin } from '../../services/ofertas';
import { EstadoCarga, Boton, Estado, ListaVacia, Mensaje, Tarjeta } from '../../components/UI';
import { ETIQUETA_ESTADO_OFERTA, ETIQUETA_TIPO_EMPLEO } from '../../constants';
import { errorApi, fechaCalendario, fechaHora } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

export default function Ofertas() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState('');
  const [nota, setNota] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ofertas-admin', filtro],
    queryFn: () => listarOfertasAdmin({ estado: filtro || undefined }),
  });

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['ofertas-admin'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-admin'] });
  };

  return (    <Tarjeta titulo="Supervisión de ofertas laborales">
      <p style={{ color: 'var(--gris)', fontSize: '0.85rem', marginBottom: '0.6rem' }}>
        Las empresas publican sus ofertas directamente. Aquí puede supervisarlas y cerrar ofertas publicadas cuando corresponda.
      </p>
      <div className="form-fila" style={{ marginBottom: '0.8rem' }}>
        <Boton variante={filtro === '' ? 'primario' : 'gris'} onClick={() => setFiltro('')}>Todas</Boton>
        <Boton variante={filtro === 'publicada' ? 'primario' : 'gris'} onClick={() => setFiltro('publicada')}>Publicadas</Boton>
        <Boton variante={filtro === 'cerrada' ? 'primario' : 'gris'} onClick={() => setFiltro('cerrada')}>Cerradas</Boton>
      </div>

      <Mensaje tipo="exito">{nota}</Mensaje>
      {isLoading && <EstadoCarga />}
      {data && data.length === 0 && <ListaVacia texto="No hay ofertas en este estado." />}

      {data && data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Estado</th>
              <th>Puesto</th>
              <th>Empresa</th>
              <th>RUC</th>
              <th>Vac.</th>
              <th>Cierre</th>
              <th>Enviada</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((o) => (
              <Fila key={o.id} oferta={o} alCambio={() => { setNota(null); refrescar(); }} />
            ))}
          </tbody>
        </table>
      )}
    </Tarjeta>
  );
}

function Fila({ oferta, alCambio }) {
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  const cerrar = async () => {
    try {
      await ejecutar(() => cerrarOfertaAdmin(oferta.id));
      setError(null);
      alCambio();
    } catch (e) {
      setError(errorApi(e));
    }
  };

  return (
    <>
      <tr>
        <td><Estado valor={oferta.estado} diccionario={ETIQUETA_ESTADO_OFERTA} /></td>
        <td><strong>{oferta.puesto}</strong></td>
        <td>{oferta.razon_social}</td>
        <td>{oferta.ruc}</td>
        <td>{oferta.vacantes}</td>
        <td>{oferta.fecha_cierre ? fechaCalendario(oferta.fecha_cierre) : '—'}</td>
        <td>{fechaHora(oferta.created_at)}</td>
        <td>
          <div className="acciones">
            <Boton variante="gris" onClick={() => setAbierta(!abierta)}>{abierta ? 'Ocultar' : 'Ver'}</Boton>
            {oferta.estado === 'publicada' && (
              <Boton variante="peligro" cargando={enviando} onClick={cerrar}>Cerrar</Boton>
            )}
          </div>
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan="8">
            <Mensaje>{error}</Mensaje>
            <div className="descripcion">
              <div><b>Categoría</b>{oferta.categoria_nombre || '—'}</div>
              <div><b>Tipo</b>{oferta.tipo_empleo ? ETIQUETA_TIPO_EMPLEO[oferta.tipo_empleo] : '—'}</div>
              <div><b>Ubicación</b>{oferta.ubicacion || '—'}</div>
              <div><b>Remuneración</b>{oferta.remuneracion ? `S/ ${oferta.remuneracion}` : 'No indicada'}</div>
              <div><b>Formación</b>{oferta.formacion_requerida || '—'}</div>
              <div><b>Experiencia</b>{oferta.experiencia_requerida || '—'}</div>
              <div><b>Habilidades</b>{oferta.habilidades?.length ? oferta.habilidades.join(', ') : '—'}</div>
              <div><b>Postulaciones</b>{oferta.cantidad_postulaciones}</div>
            </div>
            <p className='pdefin'><strong>Descripción:</strong>{'\n'} {oferta.descripcion || '—'}</p>
            <p className='pdefin'><strong>Funciones:</strong>{'\n'} {oferta.funciones || '—'}</p>
            <p className='pdefin'><strong>Requisitos:</strong>{'\n'} {oferta.requisitos || '—'}</p>
            {oferta.motivo_rechazo && <p><strong style={{ color: 'var(--rojo)' }}>Motivo de rechazo:</strong> {oferta.motivo_rechazo}</p>}
            {oferta.validado_por && <p style={{ color: 'var(--gris)', fontSize: '0.85rem' }}>Validada el {fechaHora(oferta.fecha_validacion)}</p>}
          </td>
        </tr>
      )}
    </>
  );
}
