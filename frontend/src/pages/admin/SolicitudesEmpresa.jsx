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
        <table>
          <thead>
            <tr>
              <th>RUC</th>
              <th>Empresa</th>
              <th>Representante</th>
              <th>Correo / Teléfono</th>
              <th>Estado</th>
              <th>Recibida</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((s) => (
              <Fila
                key={s.id}
                solicitud={s}
                alCambio={(mensaje) => {
                  setNota(mensaje);
                  refrescar();
                }}
              />
            ))}
          </tbody>
        </table>
      )}
    </Tarjeta>
  );
}

function Fila({ solicitud: s, alCambio }) {
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  const aprobar = async () => {
    try {
      const resultado = await ejecutar(() => aprobarSolicitudEmpresa(s.id));
      setError(null);
      const enlace = resultado?.link;
      const mensaje = enlace
        ? 'Solicitud aprobada. Se notificó a la empresa por correo. El enlace de activación quedó disponible para copiar.'
        : 'Solicitud aprobada y notificada a la empresa.';
      alCambio(mensaje);
      if (enlace && !(await copiarTexto(enlace))) window.alert(enlace);
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const rechazar = async () => {
    const motivo = window.prompt('Motivo del rechazo (se notificará a la empresa):');
    if (!motivo) return;
    try {
      await ejecutar(() => rechazarSolicitudEmpresa(s.id, motivo));
      setError(null);
      alCambio('Solicitud rechazada. Se notificó a la empresa.');
    } catch (e) {
      const det = e?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(e));
    }
  };

  const copiarEnlace = async () => {
    try {
      const resultado = await ejecutar(() => generarEnlaceSolicitud(s.id));
      setError(null);
      const ok = resultado?.link && (await copiarTexto(resultado.link));
      alCambio(
        ok
          ? 'Nuevo enlace generado y copiado al portapapeles (el anterior quedó invalidado).'
          : 'Nuevo enlace generado: ' + (resultado?.link || ''),
      );
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const resueltoPor = s.resuelto_por_nombre
    ? `${s.resuelto_por_nombre} ${s.resuelto_por_apellido || ''}`.trim()
    : null;

  return (
    <>
      <tr>
        <td><strong>{s.ruc}</strong></td>
        <td>
          {s.razon_social}
          {s.nombre_comercial ? <br /> : null}
          {s.nombre_comercial ? <small style={{ color: 'var(--gris)' }}>{s.nombre_comercial}</small> : null}
        </td>
        <td>{s.representante}</td>
        <td>
          {s.email}<br />
          <small style={{ color: 'var(--gris)' }}>{s.telefono}</small>
        </td>
        <td><Estado valor={s.estado} diccionario={estadosSolicitud} /></td>
        <td>{fechaHora(s.created_at)}</td>
        <td>
          <div className="acciones">
            <Boton variante="gris" onClick={() => setAbierta(!abierta)}>{abierta ? 'Ocultar' : 'Ver'}</Boton>
            {s.estado === 'pendiente' && (
              <>
                <Boton variante="exito" cargando={enviando} onClick={aprobar}>Aprobar</Boton>
                <Boton variante="peligro" cargando={enviando} onClick={rechazar}>Rechazar</Boton>
              </>
            )}
            {s.estado === 'aprobada' && (
              <Boton variante="acento" cargando={enviando} onClick={copiarEnlace}>Copiar enlace</Boton>
            )}
          </div>
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan="7">
            <Mensaje>{error}</Mensaje>
            <div className="descripcion">
              <div><b>Dirección</b>{s.direccion || '—'}</div>
              <div><b>Resuelta por</b>{resueltoPor ? `${resueltoPor} · ${fechaHora(s.resuelto_en)}` : '—'}</div>
            </div>
            {s.motivo_rechazo && <p><strong style={{ color: 'var(--rojo)' }}>Motivo de rechazo:</strong> {s.motivo_rechazo}</p>}
          </td>
        </tr>
      )}
    </>
  );
}
