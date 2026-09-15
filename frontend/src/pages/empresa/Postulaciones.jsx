import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cambiarActivacionPostulacion, cambiarEstadoPostulacion, detallePostulacionEmpresa,
  listarPostulacionesEmpresa, urlCvPostulacion,
} from '../../services/empresas';
import { EstadoCarga, Boton, Estado, Mensaje, Selecto } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import { ETIQUETA_ESTADO_POSTULACION, TRANSICIONES_POSTULACION } from '../../constants';
import { listarOfertasEmpresa } from '../../services/ofertas';
import { descargarUrl, errorApi, fecha, fechaHora } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

const FILTROS = [
  ['', 'Todas'],
  ['pendiente', 'Pendientes'],
  ['en_revision', 'En revisión'],
  ['preseleccionado', 'Preseleccionados'],
  ['contactado', 'Contactados'],
  ['seleccionado', 'Seleccionados'],
  ['no_seleccionado', 'No seleccionados'],
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

export default function Postulaciones() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState('');
  const [ofertaId, setOfertaId] = useState('');
  const [abiertaId, setAbiertaId] = useState(null);
  const [nota, setNota] = useState(null);

  const { data: ofertas } = useQuery({ queryKey: ['ofertas-empresa'], queryFn: listarOfertasEmpresa });

  const { data, isLoading, error } = useQuery({
    queryKey: ['postulaciones-empresa', filtro, ofertaId],
    queryFn: () => listarPostulacionesEmpresa({ estado: filtro || undefined, oferta_id: ofertaId || undefined }),
  });

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['postulaciones-empresa'] });
    queryClient.invalidateQueries({ queryKey: ['postulacion-detalle'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-empresa'] });
  };

  const pendientes = (data || []).filter((p) => p.estado === 'pendiente' && p.activo === 1).length;

  return (
    <div>
      <PageHeader
        titulo="Postulaciones"
        descripcion="Postulaciones recibidas a tus ofertas y su estado de avance."
        accion={data && pendientes > 0 && (
          <span className="badge badge-amber" style={{ padding: '8px 13px' }}>
            <i className="ti ti-bell" style={{ marginRight: 6 }} />
            {pendientes} pendiente(s) por revisar
          </span>
        )}
      />

      <div style={{ maxWidth: 380, marginBottom: '1.1rem' }}>
        <Selecto etiqueta="Filtrar por oferta" value={ofertaId} onChange={(e) => setOfertaId(e.target.value)}>
          <option value="">Todas las ofertas</option>
          {ofertas?.map((o) => <option key={o.id} value={String(o.id)}>{o.puesto}</option>)}
        </Selecto>
      </div>

      <div className="chips">
        {FILTROS.map(([v, l]) => (
          <button key={v || 'todas'} type="button" className={`chip${filtro === v ? ' activo' : ''}`} onClick={() => setFiltro(v)}>
            {l}
          </button>
        ))}
      </div>

      <Mensaje tipo="exito">{nota}</Mensaje>
      <Mensaje>{error ? errorApi(error) : null}</Mensaje>
      {isLoading && <EstadoCarga />}
      {data && data.length === 0 && (
        <div className="list-card">
          <div className="empty-card">
            <i className="ti ti-users" />
            <p>No hay postulaciones para los filtros seleccionados.</p>
          </div>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="list-card">
          <div className="list-card-head">
            <h2>Postulaciones recibidas</h2>
          </div>
          {data.map((p) => (
            <div className="post-item" key={p.id}>
              <PostFila
                postulacion={p}
                abierta={abiertaId === p.id}
                onToggle={() => setAbiertaId(abiertaId === p.id ? null : p.id)}
                alCambio={() => { setNota(null); refrescar(); }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PostFila({ postulacion, abierta, onToggle, alCambio }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());
  const { data: detalle } = useQuery({
    queryKey: ['postulacion-detalle', postulacion.id],
    queryFn: () => detallePostulacionEmpresa(postulacion.id),
    enabled: abierta,
  });

  const guardar = async (fn, mensaje) => {
    try {
      await ejecutar(fn);
      setError(null);
      if (mensaje) window.alert(mensaje);
      alCambio();
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const verCv = async () => {
    try {
      const { url } = await urlCvPostulacion(postulacion.id);
      const nombre = detalle?.postulante?.cv?.nombre_original || 'cv.pdf';
      await descargarUrl(url, nombre);
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const opciones = TRANSICIONES_POSTULACION[postulacion.estado] || [];
  const estadoDetallado = ETIQUETA_ESTADO_POSTULACION[postulacion.estado] || postulacion.estado;

  return (
    <>
      <div className="post-fila">
        <div className="app-avatar">{iniciales(`${postulacion.nombres} ${postulacion.apellidos}`)}</div>
        <div className="app-main">
          <div className="job">{postulacion.nombres} {postulacion.apellidos}</div>
          <div className="who">
            <b>{postulacion.puesto}</b>
            {postulacion.ubicacion && <> · {postulacion.ubicacion}</>}
            {' · '}DNI {postulacion.dni}
          </div>
        </div>
        <div className="app-meta">
          <div className="date">{fechaHora(postulacion.fecha_postulacion)}</div>
          <Estado valor={postulacion.estado} diccionario={ETIQUETA_ESTADO_POSTULACION} />
          {postulacion.activo !== 1 && (
            <div className="badge badge-gray" style={{ marginTop: 5 }}>Desactivada</div>
          )}
        </div>
        <button className="btn-ver" type="button" onClick={onToggle}>
          <i className={abierta ? 'ti ti-chevron-up' : 'ti ti-chevron-down'} />
          {abierta ? 'Cerrar' : 'Ver'}
        </button>
      </div>

      {abierta && (
        <div className="post-detalle">
          <Mensaje>{error}</Mensaje>
          <DetallePostulante detalle={detalle} />

          <div className="post-acciones">
            {postulacion.activo === 1 && opciones.length > 0 && (
              <>
                <span className="avanzar">Avanzar estado:</span>
                {opciones.map((s) => (
                  <Boton
                    key={s}
                    variante={s === 'seleccionado' ? 'exito' : s === 'no_seleccionado' ? 'peligro' : 'primario'}
                    cargando={enviando}
                    onClick={() => guardar(() => cambiarEstadoPostulacion(postulacion.id, s), s === 'seleccionado' ? 'Candidato seleccionado. Registre luego la contratación si corresponde.' : null)}
                  >
                    {ETIQUETA_ESTADO_POSTULACION[s]}
                  </Boton>
                ))}
              </>
            )}
            <Boton variante="gris" onClick={verCv}>Ver CV</Boton>
            <Boton
              variante="gris"
              onClick={() => guardar(() => cambiarActivacionPostulacion(postulacion.id, postulacion.activo !== 1))}
            >
              {postulacion.activo ? 'Desactivar' : 'Reactivar'}
            </Boton>
          </div>
          {postulacion.activo !== 1 && (
            <p style={{ color: 'var(--text-2)', fontSize: '0.85rem', marginBottom: 0 }}>
              Postulación desactivada: no aparece como activa, pero su historial se conserva (RF-38/RN-17).
            </p>
          )}
          {postulacion.activo === 1 && opciones.length === 0 && (
            <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginBottom: 0 }}>
              Estado final: {estadoDetallado.toLowerCase()}. No hay transiciones disponibles.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function DetallePostulante({ detalle }) {
  if (!detalle) return <p className="vacio">Cargando detalle…</p>;
  const p = detalle.postulante;

  return (
    <div>
      <h3>
        {p.nombres} {p.apellidos} <span style={{ color: 'var(--text-2)', fontWeight: 400, fontSize: '0.85rem' }}>· DNI {p.dni} · {fecha(p.fecha_nacimiento)}</span>
      </h3>
      <div className="descripcion">
        <div><b>Distrito</b>{p.distrito || '—'}</div>
        <div><b>Teléfono</b>{p.telefono || '—'}</div>
        <div><b>Correo</b>{p.email || '—'}</div>
        <div><b>Oferta</b>{detalle.oferta.puesto}</div>
      </div>
      <p style={{ color: 'var(--text-2)', fontSize: '0.88rem', marginBottom: 0 }}>
        CV: {p.cv ? `${p.cv.nombre_original} (v${p.cv.version})` : 'El postulante aún no ha cargado su CV.'}
      </p>
    </div>
  );
}
