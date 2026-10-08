// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  aprobarSolicitudEmpresa,
  generarEnlaceSolicitud,
  listarSolicitudesEmpresa,
  rechazarSolicitudEmpresa,
  reenviarActivacionSolicitud,
} from '../../services/solicitudes';
import { EstadoCarga, Boton, Estado, ListaVacia, Mensaje, Tarjeta } from '../../components/UI';
import Modal from '../../components/Modal';
import FichaDatos from '../../components/FichaDatos';
import { useToast, useDialogo } from '../../components/Feedbacks';
import { Check, Eye, Link2, Send, XCircle } from 'lucide-react';
import { errorApi, fechaHora } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

const estadosSolicitud = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export default function SolicitudesEmpresa() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState('');
  const [q, setQ] = useState('');
  const [seleccionada, setSeleccionada] = useState(null);
  const [enlaceActivacion, setEnlaceActivacion] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['solicitudes-empresa', filtro, q],
    queryFn: () =>
      listarSolicitudesEmpresa({
        estado: filtro || undefined,
        q: q || undefined,
      }),
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['solicitudes-empresa'] });

  return (
    <Tarjeta titulo="Solicitudes de afiliación de empresas">
      <p style={{ color: 'var(--gris)', fontSize: '0.85rem', marginBottom: '0.6rem' }}>
        Las empresas solicitan su afiliación desde el portal. Al aprobar se crea su cuenta y se les envía un enlace para definir su contraseña.
      </p>

      <div className="form-fila filtros" style={{ marginBottom: '0.8rem' }}>
        <Boton variante={filtro === '' ? 'primario' : 'gris'} onClick={() => setFiltro('')}>Todas</Boton>
        <Boton variante={filtro === 'pendiente' ? 'primario' : 'gris'} onClick={() => setFiltro('pendiente')}>Pendientes</Boton>
        <Boton variante={filtro === 'aprobada' ? 'primario' : 'gris'} onClick={() => setFiltro('aprobada')}>Aprobadas</Boton>
        <Boton variante={filtro === 'rechazada' ? 'primario' : 'gris'} onClick={() => setFiltro('rechazada')}>Rechazadas</Boton>
        <input placeholder="Buscar por RUC, razón social, representante o correo…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {isLoading && <EstadoCarga />}
      {data && data.data.length === 0 && <ListaVacia texto="No hay solicitudes en este estado." />}

      {data && data.data.length > 0 && (
        <div className="tabla-scroll">
  <table className="tabla-solicitudes">
            <thead>
              <tr>
                <th className="col-identificador">RUC</th>
                <th>Empresa</th>
                <th>Representante</th>
                <th>Correo / Teléfono</th>
                <th>Estado</th>
                <th className="col-fecha">Recibida</th>
                <th className="col-acciones">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((s) => (
                <tr key={s.id}>
                  <td className="col-identificador" data-label="RUC"><strong>{s.ruc}</strong></td>
                  <td data-label="Empresa">
                    {s.razon_social}
                    {s.nombre_comercial ? <><br /><small style={{ color: 'var(--gris)' }}>{s.nombre_comercial}</small></> : null}
                  </td>
                  <td data-label="Representante">{s.representante}</td>
                  <td data-label="Correo / Teléfono">
                    {s.email}<br />
                    <small style={{ color: 'var(--gris)' }}>{s.telefono}</small>
                  </td>
                  <td data-label="Estado"><Estado valor={s.estado} diccionario={estadosSolicitud} /></td>
                  <td className="col-fecha" data-label="Recibida">{fechaHora(s.created_at)}</td>
                  <td className="col-acciones">
                    <div className="acciones">
                      <Boton variante="gris" onClick={() => setSeleccionada(s)}>
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

      <DetalleSolicitud
        solicitud={seleccionada}
        alCerrar={() => setSeleccionada(null)}
        alCambio={refrescar}
        alGenerarEnlace={setEnlaceActivacion}
      />

      <ModalEnlace enlace={enlaceActivacion} alCerrar={() => setEnlaceActivacion(null)} />
    </Tarjeta>
  );
}

function ModalEnlace({ enlace, alCerrar }) {
  const toast = useToast();
  const [copiado, setCopiado] = useState(false);
  if (!enlace) return null;

  const copiar = async () => {
    if (await copiarTexto(enlace)) {
      setCopiado(true);
      toast.success('Enlace copiado al portapapeles.');
    } else {
      toast.warning('No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.');
    }
  };

  return (
    <Modal
      abierto
      titulo="Enlace de activación"
      subtitulo="Compártelo con la empresa por un canal seguro; es de un solo uso."
      alCerrar={alCerrar}
      acciones={(
        <>
          <Boton variante="gris" onClick={alCerrar}>Cerrar</Boton>
          <Boton variante="primario" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar enlace'}</Boton>
        </>
      )}
    >
      <p className="modal-texto">Dato sensible: no lo publiques en canales abiertos. Al regenerar un enlace, el anterior queda invalidado.</p>
      <input className="enlace-copia" readOnly value={enlace} onFocus={(e) => e.target.select()} aria-label="Enlace de activación" />
    </Modal>
  );
}

function DetalleSolicitud({ solicitud, alCerrar, alCambio, alGenerarEnlace }) {
  const toast = useToast();
  const [error, setError] = useState(null);
  const { pedirTexto } = useDialogo();
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  if (!solicitud) return null;

  const aprobar = async () => {
    try {
      const resultado = await ejecutar(() => aprobarSolicitudEmpresa(solicitud.id));
      setError(null);
      if (resultado?.correo_enviado) {
        toast.success(`Empresa aprobada. Correo de activación enviado a ${resultado.correo_destino}.`);
      } else {
        toast.warning('La empresa fue aprobada, pero el correo no pudo enviarse. Puede reenviar el enlace.');
      }
      if (resultado?.link) alGenerarEnlace(resultado.link);
      alCambio();
      alCerrar();
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const rechazar = async () => {
    const motivo = await pedirTexto({
      titulo: 'Rechazar solicitud',
      mensaje: 'El motivo se notificará a la empresa.',
      etiqueta: 'Motivo del rechazo',
      min: 1,
      textoConfirmar: 'Rechazar',
      variante: 'peligro',
    });
    if (!motivo) return;
    try {
      await ejecutar(() => rechazarSolicitudEmpresa(solicitud.id, motivo));
      setError(null);
      toast.success('Solicitud rechazada. Se notificó a la empresa.');
      alCambio();
      alCerrar();
    } catch (e) {
      const det = e?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(e));
    }
  };

  // Reenvío del correo de activación (regenera el enlace por seguridad).
  const reenviar = async () => {
    try {
      const resultado = await ejecutar(() => reenviarActivacionSolicitud(solicitud.id));
      setError(null);
      if (resultado?.correo_enviado) {
        toast.success(`Correo de activación reenviado a ${resultado.correo_destino}.`);
      } else {
        toast.error('No se pudo enviar el correo. Inténtalo nuevamente.');
      }
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const copiarEnlace = async () => {
    try {
      const resultado = await ejecutar(() => generarEnlaceSolicitud(solicitud.id));
      setError(null);
      if (resultado?.link) alGenerarEnlace(resultado.link);
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const resueltoPor = solicitud.resuelto_por_nombre
    ? `${solicitud.resuelto_por_nombre} ${solicitud.resuelto_por_apellido || ''}`.trim()
    : null;

  const acciones = (
    <>
      {solicitud.estado === 'pendiente' && (
        <>
          <Boton variante="exito" cargando={enviando} onClick={aprobar}>
            <Check size={16} aria-hidden="true" />Aprobar
          </Boton>
          <Boton variante="peligro" cargando={enviando} onClick={rechazar}>
            <XCircle size={16} aria-hidden="true" />Rechazar
          </Boton>
        </>
      )}
      {solicitud.estado === 'aprobada' && (
        <>
          <Boton variante="exito" cargando={enviando} onClick={reenviar}>
            <Send size={16} aria-hidden="true" />Reenviar correo
          </Boton>
          <Boton variante="gris" cargando={enviando} onClick={copiarEnlace}>
            <Link2 size={16} aria-hidden="true" />Ver enlace
          </Boton>
        </>
      )}
    </>
  );

  return (
    <Modal
      abierto
      titulo={solicitud.razon_social}
      subtitulo={`Solicitud de afiliación · RUC ${solicitud.ruc}`}
      alCerrar={alCerrar}
      acciones={acciones}
    >
      <div className="form-fila" style={{ marginBottom: '0.8rem' }}>
        <Estado valor={solicitud.estado} diccionario={estadosSolicitud} />
      </div>

      <Mensaje>{error}</Mensaje>

      <FichaDatos
        items={[
          { etiqueta: 'RUC', valor: solicitud.ruc },
          { etiqueta: 'Razón social', valor: solicitud.razon_social },
          { etiqueta: 'Nombre comercial', valor: solicitud.nombre_comercial },
          { etiqueta: 'Representante', valor: solicitud.representante },
          { etiqueta: 'Correo', valor: solicitud.email },
          { etiqueta: 'Teléfono', valor: solicitud.telefono },
          { etiqueta: 'Dirección', valor: solicitud.direccion },
          { etiqueta: 'Recibida', valor: fechaHora(solicitud.created_at) },
          { etiqueta: 'Resuelta por', valor: resueltoPor ? `${resueltoPor} · ${fechaHora(solicitud.resuelto_en)}` : null },
        ]}
      />

      {solicitud.motivo_rechazo && (
        <div className="modal-seccion">
          <h3>Motivo de rechazo</h3>
          <p className="modal-texto" style={{ color: 'var(--red-tx)' }}>{solicitud.motivo_rechazo}</p>
        </div>
      )}
    </Modal>
  );
}
