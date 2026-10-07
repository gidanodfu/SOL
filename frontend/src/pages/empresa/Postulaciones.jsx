// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cambiarActivacionPostulacion, cambiarEstadoPostulacion, detallePostulacionEmpresa,
  listarPostulacionesEmpresa, urlCvPostulacion,
} from '../../services/empresas';
import { EstadoCarga, Boton, Campo, Estado, Mensaje, Selecto } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import TarjetaRegistro from '../../components/TarjetaRegistro';
import Modal from '../../components/Modal';
import FichaDatos from '../../components/FichaDatos';
import { Download, UserCheck, UserX } from 'lucide-react';
import { ETIQUETA_ESTADO_POSTULACION, TRANSICIONES_POSTULACION } from '../../constants';
import ProfileImage from '../../components/ProfileImage';
import { listarOfertasEmpresa } from '../../services/ofertas';
import { descargarUrl, errorApi, fechaCalendario, fechaHora, urlArchivo } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

const FILTROS = [
  ['', 'Todas'],
  ['pendiente', 'Pendientes'],
  ['en_revision', 'En revisión'],
  ['seleccionado', 'Seleccionados'],
  ['no_seleccionado', 'No seleccionados'],
];

export default function Postulaciones() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState('');
  const [ofertaId, setOfertaId] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [seleccionada, setSeleccionada] = useState(null);

  // Debounce: solo se consulta al backend tras 350 ms sin escribir. Evita una
  // petición por cada carácter; se combina con los demás filtros.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const { data: ofertas } = useQuery({ queryKey: ['ofertas-empresa'], queryFn: listarOfertasEmpresa });

  const { data, isLoading, error } = useQuery({
    queryKey: ['postulaciones-empresa', filtro, ofertaId, q],
    queryFn: () => listarPostulacionesEmpresa({
      estado: filtro || undefined,
      oferta_id: ofertaId || undefined,
      q: q || undefined,
    }),
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
          <span className="badge badge-amber">
            <i className="ti ti-bell" style={{ marginRight: 6 }} />
            {pendientes} pendiente(s) por revisar
          </span>
        )}
      />

      <div className="post-filtros">
        <Campo
          etiqueta="Buscar candidato o puesto"
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Nombre, apellido, DNI o puesto"
        />
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
            <TarjetaRegistro
              key={p.id}
              media={(
                <ProfileImage
                  src={urlArchivo(p.foto_url)}
                  nombre={`${p.nombres} ${p.apellidos}`}
                  alt={`Foto de ${p.nombres} ${p.apellidos}`}
                  variant="person"
                  size={38}
                />
              )}
              titulo={`${p.nombres} ${p.apellidos}`}
              badge={(
                <>
                  <Estado valor={p.estado} diccionario={ETIQUETA_ESTADO_POSTULACION} />
                  {p.activo !== 1 && <span className="badge badge-gray" style={{ marginLeft: 6 }}>Desactivada</span>}
                </>
              )}
              onClick={() => setSeleccionada(p)}
              meta={(
                <>
                  <span><b>{p.puesto}</b>{p.ubicacion ? ` · ${p.ubicacion}` : ''}</span>
                  <span>DNI {p.dni}</span>
                  <span>{fechaHora(p.fecha_postulacion)}</span>
                </>
              )}
            />
          ))}
        </div>
      )}

      <DetalleCandidato
        postulacion={seleccionada}
        alCerrar={() => setSeleccionada(null)}
        alCambio={refrescar}
      />
    </div>
  );
}

function DetalleCandidato({ postulacion, alCerrar, alCambio }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());
  const { data: detalle, isLoading } = useQuery({
    queryKey: ['postulacion-detalle', postulacion?.id],
    queryFn: () => detallePostulacionEmpresa(postulacion.id),
    enabled: Boolean(postulacion?.id),
  });

  if (!postulacion) return null;
  const p = detalle?.postulante || null;
  const estado = detalle?.estado || postulacion.estado;
  const activo = detalle ? detalle.activo : postulacion.activo;

  const guardar = async (fn) => {
    try {
      await ejecutar(fn);
      setError(null);
      alCambio();
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const verCv = async () => {
    try {
      const { url } = await urlCvPostulacion(postulacion.id);
      await descargarUrl(url, p?.cv?.nombre_original || 'cv.pdf');
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const opciones = activo === 1 ? (TRANSICIONES_POSTULACION[estado] || []) : [];

  return (
    <Modal
      abierto={Boolean(postulacion)}
      titulo={`${postulacion.nombres} ${postulacion.apellidos}`}
      subtitulo={`Postulación a ${detalle?.oferta?.puesto || postulacion.puesto}`}
      alCerrar={alCerrar}
      tamano="ancho"
      acciones={(
        <>
          <Boton variante="gris" onClick={verCv}><Download size={16} aria-hidden="true" />Ver CV</Boton>
          {activo === 1 ? (
            <Boton variante="gris" cargando={enviando} onClick={() => guardar(() => cambiarActivacionPostulacion(postulacion.id, false))}>
              <UserX size={16} aria-hidden="true" />Desactivar
            </Boton>
          ) : (
            <Boton variante="exito" cargando={enviando} onClick={() => guardar(() => cambiarActivacionPostulacion(postulacion.id, true))}>
              <UserCheck size={16} aria-hidden="true" />Reactivar
            </Boton>
          )}
        </>
      )}
    >
      <div className="form-fila" style={{ marginBottom: '0.8rem', alignItems: 'center' }}>
        <ProfileImage
          src={urlArchivo(p?.foto_url || postulacion.foto_url)}
          nombre={`${postulacion.nombres} ${postulacion.apellidos}`}
          alt={`Foto de ${postulacion.nombres} ${postulacion.apellidos}`}
          variant="person"
          size={48}
        />
        <Estado valor={estado} diccionario={ETIQUETA_ESTADO_POSTULACION} />
        {activo !== 1 && <span className="badge badge-gray">Postulación desactivada</span>}
      </div>

      <Mensaje>{error}</Mensaje>
      {isLoading && !detalle && <p className="vacio">Cargando detalle…</p>}

      <FichaDatos
        items={[
          { etiqueta: 'DNI', valor: p?.dni || postulacion.dni },
          { etiqueta: 'Fecha de nacimiento', valor: p?.fecha_nacimiento ? fechaCalendario(p.fecha_nacimiento) : null },
          { etiqueta: 'Distrito', valor: p?.distrito },
          { etiqueta: 'Teléfono', valor: p?.telefono || postulacion.telefono },
          { etiqueta: 'Correo', valor: p?.email },
          { etiqueta: 'Oferta', valor: detalle?.oferta?.puesto || postulacion.puesto },
          { etiqueta: 'Ubicación', valor: detalle?.oferta?.ubicacion || postulacion.ubicacion },
          { etiqueta: 'Fecha de postulación', valor: fechaHora(detalle?.fecha_postulacion || postulacion.fecha_postulacion) },
        ]}
      />

      <div className="modal-seccion">
        <h3>Perfil laboral</h3>
        <FichaDatos
          items={[
            { etiqueta: 'Ocupación', valor: p?.ocupacion },
            { etiqueta: 'Experiencia', valor: p?.experiencia },
            { etiqueta: 'Estudios / formación', valor: p?.estudios },
          ]}
        />
      </div>

      <div className="modal-seccion">
        <h3>Curriculum vitae</h3>
        <p className="modal-texto" style={{ color: 'var(--text-2)' }}>
          {p?.cv ? `${p.cv.nombre_original} (v${p.cv.version})` : 'El postulante aún no ha cargado su CV.'}
        </p>
      </div>

      {opciones.length > 0 && (
        <div className="modal-seccion">
          <h3>Avanzar estado</h3>
          <div className="form-fila">
            {opciones.map((s) => (
              <Boton
                key={s}
                variante={s === 'seleccionado' ? 'exito' : s === 'no_seleccionado' ? 'peligro' : 'primario'}
                cargando={enviando}
                onClick={() => guardar(() => cambiarEstadoPostulacion(postulacion.id, s))}
              >
                {ETIQUETA_ESTADO_POSTULACION[s]}
              </Boton>
            ))}
          </div>
        </div>
      )}
      {activo === 1 && opciones.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginBottom: 0 }}>
          Estado final: {ETIQUETA_ESTADO_POSTULACION[estado]?.toLowerCase()}. No hay transiciones disponibles.
        </p>
      )}
    </Modal>
  );
}
