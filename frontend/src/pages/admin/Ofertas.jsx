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
import Modal from '../../components/Modal';
import FichaDatos from '../../components/FichaDatos';
import ContenidoEnriquecido from '../../components/ContenidoEnriquecido';
import { useDialogo, useToast } from '../../components/Feedbacks';
import { Check, Eye, Lock, XCircle } from 'lucide-react';
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
  const toast = useToast();
  const [filtro, setFiltro] = useState('');
  const [seleccionada, setSeleccionada] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ofertas-admin', filtro],
    queryFn: () => listarOfertasAdmin({ estado: filtro || undefined }),
  });

  const refrescar = ({ cerrar = false } = {}) => {
    queryClient.invalidateQueries({ queryKey: ['ofertas-admin'] });
    queryClient.invalidateQueries({ queryKey: ['oferta-admin-detalle'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-admin'] });
    if (cerrar) setSeleccionada(null);
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

      {isLoading && <EstadoCarga />}
      {data && data.length === 0 && <ListaVacia texto="No hay ofertas en este estado." />}

      {data && data.length > 0 && (
        <div className="tabla-scroll">
  <table className="tabla-ofertas">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Puesto</th>
                <th>Empresa</th>
                <th className="col-identificador">RUC</th>
                <th className="col-monto">Vac.</th>
                <th className="col-fecha">Cierre</th>
                <th className="col-fecha">Enviada</th>
                <th className="col-acciones">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id}>
                  <td><Estado valor={o.estado} diccionario={ETIQUETA_ESTADO_OFERTA} /></td>
                  <td><strong>{o.puesto}</strong></td>
                  <td>{o.razon_social}</td>
                  <td className="col-identificador">{o.ruc}</td>
                  <td className="col-monto">{o.vacantes}</td>
                  <td className="col-fecha">{o.fecha_cierre ? fechaCalendario(o.fecha_cierre) : '—'}</td>
                  <td className="col-fecha">{fechaHora(o.created_at)}</td>
                  <td className="col-acciones">
                    <div className="acciones">
                      <Boton variante="gris" onClick={() => setSeleccionada(o)}>
                        <Eye size={16} aria-hidden="true" />Ver
                      </Boton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetalleOferta
        oferta={seleccionada}
        alCerrar={() => setSeleccionada(null)}
        alCambio={(mensaje) => { toast.success(mensaje); refrescar({ cerrar: true }); }}
      />
    </Tarjeta>
  );
}

function DetalleOferta({ oferta, alCerrar, alCambio }) {
  const [error, setError] = useState(null);
  const { confirmar, pedirTexto } = useDialogo();
  const { ejecutar, enviando } = useAccion(async (fn) => fn());
  const { data: detalle, isLoading } = useQuery({
    queryKey: ['oferta-admin-detalle', oferta?.id],
    queryFn: () => detalleOfertaAdmin(oferta.id),
    enabled: Boolean(oferta?.id),
  });

  if (!oferta) return null;
  const o = detalle || oferta;

  const aprobar = async () => {
    const ok = await confirmar({
      titulo: 'Aprobar oferta',
      mensaje: `¿Aprobar y publicar la oferta "${oferta.puesto}"?`,
      textoConfirmar: 'Aprobar y publicar',
      variante: 'exito',
    });
    if (!ok) return;
    accion(() => aprobarOfertaAdmin(oferta.id), 'Oferta aprobada y publicada.');
  };

  const rechazar = async () => {
    const motivo = await pedirTexto({
      titulo: 'Rechazar oferta',
      mensaje: 'El motivo se muestra a la empresa.',
      etiqueta: 'Motivo del rechazo',
      min: 1,
      textoConfirmar: 'Rechazar',
      variante: 'peligro',
    });
    if (!motivo) return;
    accion(() => rechazarOfertaAdmin(oferta.id, motivo), 'Oferta rechazada.');
  };

  const accion = async (fn, mensaje) => {
    try {
      await ejecutar(fn);
      setError(null);
      alCambio(mensaje);
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const acciones = {
    pendiente: (
      <>
        <Boton variante="exito" cargando={enviando} onClick={aprobar}>
          <Check size={16} aria-hidden="true" />Aprobar
        </Boton>
        <Boton variante="peligro" cargando={enviando} onClick={rechazar}>
          <XCircle size={16} aria-hidden="true" />Rechazar
        </Boton>
      </>
    ),
    publicada: (
      <Boton variante="peligro" cargando={enviando} onClick={() => accion(() => cerrarOfertaAdmin(oferta.id), 'Oferta cerrada.')}>
        <Lock size={16} aria-hidden="true" />Cerrar
      </Boton>
    ),
  }[o.estado] || null;

  return (
    <Modal
      abierto={Boolean(oferta)}
      titulo={o.puesto}
      subtitulo={`${o.razon_social || 'Empresa'} · RUC ${o.ruc || '—'}`}
      alCerrar={alCerrar}
      acciones={acciones}
      tamano="ancho"
    >
      <div className="form-fila" style={{ marginBottom: '0.8rem' }}>
        <Estado valor={o.estado} diccionario={ETIQUETA_ESTADO_OFERTA} />
        {o.fecha_validacion && <span style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>Revisada el {fechaHora(o.fecha_validacion)}</span>}
      </div>

      <Mensaje>{error}</Mensaje>
      {isLoading && !detalle && <p className="vacio">Cargando detalle…</p>}

      <FichaDatos
        items={[
          { etiqueta: 'Categoría', valor: o.categoria_nombre },
          { etiqueta: 'Tipo de empleo', valor: o.tipo_empleo ? ETIQUETA_TIPO_EMPLEO[o.tipo_empleo] : null },
          { etiqueta: 'Ubicación', valor: o.ubicacion },
          { etiqueta: 'Vacantes', valor: o.vacantes },
          { etiqueta: 'Remuneración', valor: o.remuneracion ? `S/ ${o.remuneracion}` : null },
          { etiqueta: 'Fecha de cierre', valor: o.fecha_cierre ? fechaCalendario(o.fecha_cierre) : null },
          { etiqueta: 'Formación requerida', valor: o.formacion_requerida },
          { etiqueta: 'Experiencia requerida', valor: o.experiencia_requerida },
          { etiqueta: 'Habilidades', valor: o.habilidades?.length ? o.habilidades.join(', ') : null },
          { etiqueta: 'Postulaciones', valor: o.cantidad_postulaciones },
          { etiqueta: 'Enviada', valor: fechaHora(o.created_at) },
        ]}
      />

      {o.motivo_rechazo && (
        <div className="modal-seccion">
          <h3>Motivo de rechazo</h3>
          <p className="modal-texto" style={{ color: 'var(--red-tx)' }}>{o.motivo_rechazo}</p>
        </div>
      )}
      {o.descripcion && (
        <div className="modal-seccion">
          <h3>Descripción</h3>
          <ContenidoEnriquecido>{o.descripcion}</ContenidoEnriquecido>
        </div>
      )}
      {o.funciones && (
        <div className="modal-seccion">
          <h3>Funciones</h3>
          <ContenidoEnriquecido>{o.funciones}</ContenidoEnriquecido>
        </div>
      )}
      {o.requisitos && (
        <div className="modal-seccion">
          <h3>Requisitos</h3>
          <ContenidoEnriquecido>{o.requisitos}</ContenidoEnriquecido>
        </div>
      )}
    </Modal>
  );
}
