// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  aprobarSolicitudEmpresa,
  generarEnlaceSolicitud,
  listarSolicitudesEmpresa,
  rechazarSolicitudEmpresa,
} from '../../services/solicitudes';
import { EstadoCarga, Boton, Estado, ListaVacia, Mensaje, Tarjeta } from '../../components/UI';
import Modal from '../../components/Modal';
import FichaDatos from '../../components/FichaDatos';
import { Check, Eye, Link2, XCircle } from 'lucide-react';
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
  const [nota, setNota] = useState(null);
  const [seleccionada, setSeleccionada] = useState(null);

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

      <div className="form-fila" style={{ marginBottom: '0.8rem' }}>
        <Boton variante={filtro === '' ? 'primario' : 'gris'} onClick={() => setFiltro('')}>Todas</Boton>
        <Boton variante={filtro === 'pendiente' ? 'primario' : 'gris'} onClick={() => setFiltro('pendiente')}>Pendientes</Boton>
        <Boton variante={filtro === 'aprobada' ? 'primario' : 'gris'} onClick={() => setFiltro('aprobada')}>Aprobadas</Boton>
        <Boton variante={filtro === 'rechazada' ? 'primario' : 'gris'} onClick={() => setFiltro('rechazada')}>Rechazadas</Boton>
        <input placeholder="Buscar por RUC, razón social, representante o correo…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Mensaje tipo="exito">{nota}</Mensaje>
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
                  <td className="col-identificador"><strong>{s.ruc}</strong></td>
                  <td>
                    {s.razon_social}
                    {s.nombre_comercial ? <><br /><small style={{ color: 'var(--gris)' }}>{s.nombre_comercial}</small></> : null}
                  </td>
                  <td>{s.representante}</td>
                  <td>
                    {s.email}<br />
                    <small style={{ color: 'var(--gris)' }}>{s.telefono}</small>
                  </td>
                  <td><Estado valor={s.estado} diccionario={estadosSolicitud} /></td>
                  <td className="col-fecha">{fechaHora(s.created_at)}</td>
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
        alCambio={(mensaje) => { setNota(mensaje); refrescar(); }}
      />
    </Tarjeta>
  );
}

function DetalleSolicitud({ solicitud, alCerrar, alCambio }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  if (!solicitud) return null;

  const aprobar = async () => {
    try {
      const resultado = await ejecutar(() => aprobarSolicitudEmpresa(solicitud.id));
      setError(null);
      const enlace = resultado?.link;
      alCambio(enlace
        ? 'Solicitud aprobada. Se notificó a la empresa por correo. El enlace de activación quedó disponible para copiar.'
        : 'Solicitud aprobada y notificada a la empresa.');
      if (enlace && !(await copiarTexto(enlace))) window.alert(enlace);
      alCerrar();
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const rechazar = async () => {
    const motivo = window.prompt('Motivo del rechazo (se notificará a la empresa):');
    if (!motivo) return;
    try {
      await ejecutar(() => rechazarSolicitudEmpresa(solicitud.id, motivo));
      setError(null);
      alCambio('Solicitud rechazada. Se notificó a la empresa.');
      alCerrar();
    } catch (e) {
      const det = e?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(e));
    }
  };

  const copiarEnlace = async () => {
    try {
      const resultado = await ejecutar(() => generarEnlaceSolicitud(solicitud.id));
      setError(null);
      const ok = resultado?.link && (await copiarTexto(resultado.link));
      alCambio(ok
        ? 'Nuevo enlace generado y copiado al portapapeles (el anterior quedó invalidado).'
        : 'Nuevo enlace generado: ' + (resultado?.link || ''));
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
        <Boton variante="acento" cargando={enviando} onClick={copiarEnlace}>
          <Link2 size={16} aria-hidden="true" />Copiar enlace
        </Boton>
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
