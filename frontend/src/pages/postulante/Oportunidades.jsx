// SPDX-License-Identifier: MIT
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ExternalLink, Link2, MapPin, Monitor, Tag } from 'lucide-react';
import { listarActividadesPublicas, listarOportunidadesPublicas } from '../../services/divulgacion';
import { EstadoCarga, Mensaje } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import ActivityImage from '../../components/ActivityImage';
import ContenidoEnriquecido from '../../components/ContenidoEnriquecido';
import {
  ETIQUETA_ESTADO_ACTIVIDAD, ETIQUETA_FUENTE_OPORTUNIDAD, ETIQUETA_TIPO_ACTIVIDAD,
  MODALIDADES_ACTIVIDAD,
} from '../../constants';
import {
  errorApi, esEnlaceSeguro, esOportunidadVisible, fechaHora, fechaHoraLima, textoVisible, urlArchivo,
} from '../../utils';

const CLASE_ESTADO_ACTIVIDAD = {
  programado: 'badge-programado',
  en_curso: 'badge-en_curso',
  finalizado: 'badge-finalizado',
  cancelado: 'badge-cancelado',
};

const CLASE_FUENTE = {
  empleos_peru: 'badge-green',
  mype_local: 'badge-blue',
  otro: 'badge-gray',
};

const ETIQUETA_MODALIDAD = Object.fromEntries(MODALIDADES_ACTIVIDAD.map((m) => [m.v, m.l]));

/**
 * Tarjeta editorial local (solo esta página): media opcional, cabecera con
 * título + badge, metadata con iconos, descripción con límite visual y acción.
 * Reutiliza tokens y componentes del Design System; no introduce estados.
 */
function TarjetaContenido({
  media = null, badge = null, titulo, meta = [], descripcion = null,
  descripcionHtml = null, accion = null, lineas = 3,
}) {
  const filas = meta.filter((f) => f && f.texto);

  return (
    <article className="content-card">
      {media}

      <div className="content-card-cab">
        <h3>{titulo}</h3>
        {badge && <span className="content-card-badge">{badge}</span>}
      </div>

      {filas.length > 0 && (
        <ul className="content-card-meta">
          {filas.map(({ icono: Icono, texto, href }, i) => (
            <li key={i}>
              <Icono size={15} aria-hidden="true" />
              {href ? (
                <a className="enlace" href={href} target="_blank" rel="noopener noreferrer">{texto}</a>
              ) : (
                <span>{texto}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {descripcionHtml ? (
        <ContenidoEnriquecido className="content-card-rico">{descripcionHtml}</ContenidoEnriquecido>
      ) : descripcion ? (
        <p className="content-card-desc" style={{ WebkitLineClamp: lineas, lineClamp: lineas }}>
          {descripcion}
        </p>
      ) : null}

      {accion && <div className="content-card-accion">{accion}</div>}
    </article>
  );
}

export default function Oportunidades() {
  const actividades = useQuery({ queryKey: ['actividades-publicas'], queryFn: listarActividadesPublicas });
  const oportunidades = useQuery({ queryKey: ['oportunidades-publicas'], queryFn: listarOportunidadesPublicas });

  // Defensa adicional: el backend ya excluye finalizadas y canceladas, pero un
  // cliente no debe pintarlas si llegaran por una respuesta antigua o directa.
  // `programado` se conserva: una oportunidad con inicio futuro es visible.
  const oportunidadesVisibles = (oportunidades.data || []).filter(esOportunidadVisible);

  return (
    <div>
      <PageHeader
        titulo="Ferias y oportunidades"
        descripcion="Actividades municipales de intermediación y oportunidades de empleo difundidas."
      />

      <div className="list-card">
        <div className="list-card-head">
          <h2>Ferias, talleres y capacitaciones programadas</h2>
        </div>
        {actividades.isLoading && <EstadoCarga />}
        {actividades.error && <Mensaje>{errorApi(actividades.error)}</Mensaje>}
        {actividades.data && actividades.data.length === 0 && (
          <p className="empty-note">No hay actividades programadas por ahora. Vuelve pronto.</p>
        )}
        {actividades.data?.length > 0 && (
          <div className="malla">
            {actividades.data.map((a) => (
              <TarjetaContenido
                key={a.id}
                media={<ActivityImage src={urlArchivo(a.imagen_url)} alt={`Imagen de la actividad ${a.nombre}`} expandible />}
                badge={(
                  <span className={`badge ${CLASE_ESTADO_ACTIVIDAD[a.estado_efectivo || a.estado] || 'badge-gray'}`}>
                    {ETIQUETA_ESTADO_ACTIVIDAD[a.estado_efectivo || a.estado] || a.estado}
                  </span>
                )}
                titulo={a.nombre}
                meta={[
                  { icono: Tag, texto: ETIQUETA_TIPO_ACTIVIDAD[a.tipo] || a.tipo },
                  { icono: CalendarDays, texto: fechaHora(a.fecha_inicio) },
                  a.lugar ? { icono: MapPin, texto: `Lugar: ${a.lugar}` } : null,
                  a.modalidad ? { icono: Monitor, texto: `Modalidad: ${ETIQUETA_MODALIDAD[a.modalidad] || a.modalidad}` } : null,
                  a.enlace && esEnlaceSeguro(a.enlace) ? { icono: Link2, texto: a.enlace, href: a.enlace } : null,
                ]}
                descripcion={a.descripcion ? textoVisible(a.descripcion) : null}
                lineas={3}
              />
            ))}
          </div>
        )}
      </div>

      <div className="list-card">
        <div className="list-card-head">
          <h2>Oportunidades de empleo y convocatorias</h2>
        </div>
        {oportunidades.isLoading && <EstadoCarga />}
        {oportunidades.error && <Mensaje>{errorApi(oportunidades.error)}</Mensaje>}
        {oportunidades.data && oportunidadesVisibles.length === 0 && (
          <p className="empty-note">No hay oportunidades difundidas en este momento.</p>
        )}
        {oportunidadesVisibles.length > 0 && (
          <div className="malla">
            {oportunidadesVisibles.map((o) => (
              <TarjetaContenido
                key={o.id}
                badge={(
                  <span className="badge-grupo">
                    <span className={`badge ${CLASE_FUENTE[o.fuente] || 'badge-gray'}`}>
                      {ETIQUETA_FUENTE_OPORTUNIDAD[o.fuente] || o.fuente}
                    </span>
                    <span className={`badge ${CLASE_ESTADO_ACTIVIDAD[o.estado_efectivo || o.estado] || 'badge-gray'}`}>
                      {ETIQUETA_ESTADO_ACTIVIDAD[o.estado_efectivo || o.estado] || o.estado}
                    </span>
                  </span>
                )}
                titulo={o.titulo}
                meta={[
                  o.fecha_inicio ? { icono: CalendarDays, texto: `Inicio: ${fechaHoraLima(o.fecha_inicio)}` } : null,
                  o.fecha_fin ? { icono: CalendarDays, texto: `Fin: ${fechaHoraLima(o.fecha_fin)}` } : null,
                  o.modalidad
                    ? { icono: Monitor, texto: `Modalidad: ${ETIQUETA_MODALIDAD[o.modalidad] || o.modalidad}` }
                    : null,
                ]}
                descripcionHtml={o.descripcion || null}
                accion={o.enlace && esEnlaceSeguro(o.enlace) ? (
                  <a className="btn btn-gris" href={o.enlace} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={15} aria-hidden="true" /> Ver convocatoria
                  </a>
                ) : null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
