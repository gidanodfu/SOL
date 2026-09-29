// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  aprobarOfertaAdmin,
  cerrarOfertaAdmin,
  detalleOfertaAdmin,
  listarOfertasAdmin,
  rechazarOfertaAdmin,
} from '../../services/ofertas';
import { EstadoCarga, Boton, Estado, ListaVacia, Mensaje, Tarjeta } from '../../components/UI';
import { ETIQUETA_ESTADO_OFERTA, ETIQUETA_TIPO_EMPLEO } from '../../constants';
import { errorApi, fechaCalendario, fechaHora } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

const FILTROS = [
  ['', 'Todas'],
  ['pendiente', 'Pendientes'],
  ['publicada', 'Publicadas'],
  ['rechazada', 'Rechazadas'],
  ['cerrada', 'Cerradas'],
];

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
    queryClient.invalidateQueries({ queryKey: ['oferta-admin-detalle'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-admin'] });
  };

  return (
    <Tarjeta titulo="Revisión de ofertas laborales">
      <p style={{ color: 'var(--gris)', fontSize: '0.85rem', marginBottom: '0.6rem' }}>
        Las empresas envían sus ofertas a revisión municipal. Apruébalas para publicarlas
        en la bolsa de empleo o recházalas indicando el motivo. También puedes cerrar una
        oferta publicada.
      </p>
      <div className="form-fila" style={{ marginBottom: '0.8rem' }}>
        {FILTROS.map(([valor, etiqueta]) => (
          <Boton
            key={valor || 'todas'}
            variante={filtro === valor ? 'primario' : 'gris'}
            onClick={() => setFiltro(valor)}
          >
            {etiqueta}
          </Boton>
        ))}
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
              <Fila key={o.id} oferta={o} alCambio={setNota} alRefrescar={refrescar} />
            ))}
          </tbody>
        </table>
      )}
    </Tarjeta>
  );
}

function Fila({ oferta, alCambio, alRefrescar }) {
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());
  const { data: detalle, isLoading: cargandoDetalle } = useQuery({
    queryKey: ['oferta-admin-detalle', oferta.id],
    queryFn: () => detalleOfertaAdmin(oferta.id),
    enabled: abierta,
  });
  const o = detalle || oferta;

  const accion = async (fn, mensaje) => {
    try {
      await ejecutar(fn);
      setError(null);
      alCambio(mensaje);
      alRefrescar();
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const aprobar = () => {
    if (!window.confirm(`¿Aprobar y publicar la oferta "${oferta.puesto}"?`)) return;
    accion(() => aprobarOfertaAdmin(oferta.id), 'Oferta aprobada y publicada.');
  };

  const rechazar = () => {
    const motivo = window.prompt('Motivo del rechazo (se muestra a la empresa):');
    if (!motivo || !motivo.trim()) return;
    accion(() => rechazarOfertaAdmin(oferta.id, motivo.trim()), 'Oferta rechazada.');
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
            {oferta.estado === 'pendiente' && (
              <>
                <Boton variante="exito" cargando={enviando} onClick={aprobar}>Aprobar</Boton>
                <Boton variante="peligro" cargando={enviando} onClick={rechazar}>Rechazar</Boton>
              </>
            )}
            {oferta.estado === 'publicada' && (
              <Boton variante="peligro" cargando={enviando} onClick={() => accion(() => cerrarOfertaAdmin(oferta.id), 'Oferta cerrada.')}>Cerrar</Boton>
            )}
          </div>
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan="8">
            <Mensaje>{error}</Mensaje>
            {cargandoDetalle && !detalle && <p className="vacio">Cargando detalle…</p>}
            <div className="descripcion">
              <div><b>Categoría</b>{o.categoria_nombre || '—'}</div>
              <div><b>Tipo</b>{o.tipo_empleo ? ETIQUETA_TIPO_EMPLEO[o.tipo_empleo] : '—'}</div>
              <div><b>Ubicación</b>{o.ubicacion || '—'}</div>
              <div><b>Remuneración</b>{o.remuneracion ? `S/ ${o.remuneracion}` : 'No indicada'}</div>
              <div><b>Formación</b>{o.formacion_requerida || '—'}</div>
              <div><b>Experiencia</b>{o.experiencia_requerida || '—'}</div>
              <div><b>Habilidades</b>{o.habilidades?.length ? o.habilidades.join(', ') : '—'}</div>
              <div><b>Postulaciones</b>{o.cantidad_postulaciones ?? '—'}</div>
              {o.fecha_validacion && (
                <div><b>Revisada</b>{fechaHora(o.fecha_validacion)}</div>
              )}
            </div>
            <p className='pdefin'><strong>Descripción:</strong>{'\n'} {o.descripcion || '—'}</p>
            <p className='pdefin'><strong>Funciones:</strong>{'\n'} {o.funciones || '—'}</p>
            <p className='pdefin'><strong>Requisitos:</strong>{'\n'} {o.requisitos || '—'}</p>
            {o.motivo_rechazo && <p><strong style={{ color: 'var(--rojo)' }}>Motivo de rechazo:</strong> {o.motivo_rechazo}</p>}
          </td>
        </tr>
      )}
    </>
  );
}
