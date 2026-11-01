// SPDX-License-Identifier: MIT
import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  actualizarOportunidad, cambiarActivacionOportunidad, cambiarEstadoOportunidad,
  crearOportunidad, listarOportunidadesAdmin,
} from '../../services/divulgacion';
import { Boton, Campo, Estado, EstadoCarga, ListaVacia, Mensaje, Selecto, Tarjeta } from '../../components/UI';
import TarjetaRegistro from '../../components/TarjetaRegistro';
import Modal from '../../components/Modal';
import FichaDatos from '../../components/FichaDatos';
import ContenidoEnriquecido from '../../components/ContenidoEnriquecido';
import { useToast } from '../../components/Feedbacks';
import { ExternalLink, EyeOff, Megaphone, Pencil, Upload } from 'lucide-react';
import {
  ESTADOS_ACTIVIDAD, ETIQUETA_ESTADO_ACTIVIDAD, ETIQUETA_FUENTE_OPORTUNIDAD,
  FUENTES_OPORTUNIDAD, MODALIDADES_ACTIVIDAD,
} from '../../constants';
import {
  TEXTO_MAX, errorApi, esEnlaceSeguro, esFechaCalendario, excedeLimiteTexto,
  fechaCalendario, fechaHoraLima, textoEnriquecidoVacio,
} from '../../utils';
import { useAccion } from '../../hooks/useAccion';
import { usePermisosMunicipales } from '../../hooks/usePermisosMunicipales';

// El editor (TiPTap) se carga solo cuando se abre el formulario de oportunidad.
const EditorTextoEnriquecido = lazy(() => import('../../components/EditorTextoEnriquecido'));

const ETIQUETA_MODALIDAD = Object.fromEntries(MODALIDADES_ACTIVIDAD.map((m) => [m.v, m.l]));

const VACIO = {
  fuente: '', titulo: '', descripcion: '', enlace: '', fecha_publicacion: '',
  fecha_inicio: '', fecha_fin: '', modalidad: '',
};

const ORDEN_CAMPOS = [
  'fuente', 'titulo', 'enlace', 'fecha_publicacion',
  'fecha_inicio', 'fecha_fin', 'modalidad', 'descripcion',
];

const TRANSICIONES = {
  programado: ['en_curso', 'finalizado', 'cancelado'],
  en_curso: ['finalizado', 'cancelado'],
  cancelado: ['programado'],
  finalizado: [],
};

const normalizarTexto = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim();

// `YYYY-MM-DD HH:mm:ss` (MySQL) → `YYYY-MM-DDTHH:mm` (datetime-local), sin
// desplazar la hora: el valor persistido ya está en America/Lima.
const aLocal = (valor) => (valor ? String(valor).slice(0, 16).replace(' ', 'T') : '');

// `YYYY-MM-DDTHH:mm` (datetime-local) → `YYYY-MM-DD HH:mm:ss` (contrato API).
const aServidor = (valor) => {
  const texto = String(valor ?? '').trim().replace('T', ' ');
  if (texto === '') return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(texto)) return `${texto}:00`;
  return texto;
};

// Estado de publicación derivado del backend (oculta / programada / visible).
function BadgePublicacion({ estado }) {
  const mapa = {
    visible: ['badge-green', 'Visible'],
    programada: ['badge-amber', 'Programada'],
    oculta: ['badge-gray', 'Oculta'],
  };
  const [clase, texto] = mapa[estado] || ['badge-gray', estado || '—'];
  return <span className={`badge ${clase}`}>{texto}</span>;
}

function BadgesOportunidad({ oportunidad }) {
  return (
    <span className="badge-grupo">
      <Estado
        valor={oportunidad.estado_efectivo || oportunidad.estado}
        diccionario={ETIQUETA_ESTADO_ACTIVIDAD}
      />
      <BadgePublicacion estado={oportunidad.estado_publicacion} />
    </span>
  );
}

export default function Oportunidades() {
  const { puede } = usePermisosMunicipales();
  const puedeGestionar = puede('oportunidades');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filtros, setFiltros] = useState({ fuente: '', estado: '' });
  const [editor, setEditor] = useState(null);
  const [seleccionada, setSeleccionada] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['oportunidades-admin', filtros],
    queryFn: () => listarOportunidadesAdmin(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v))),
  });

  // Precarga el chunk del editor al entrar a la página (no engorda el bundle inicial).
  useEffect(() => { if (puedeGestionar) import('../../components/EditorTextoEnriquecido'); }, [puedeGestionar]);

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['oportunidades-admin'] });

  return (
    <div>
      <Tarjeta
        titulo="Difusión de oportunidades (Empleos Perú / MYPE)"
        acciones={puedeGestionar ? (
          <Boton variante="acento" onClick={() => setEditor(editor ? null : {})}>
            {editor ? 'Cancelar' : 'Nueva oportunidad'}
          </Boton>
        ) : null}
      >
        <div className="form-fila filtros">
          <Selecto etiqueta="" value={filtros.fuente} onChange={(e) => setFiltros({ ...filtros, fuente: e.target.value })}>
            <option value="">Todas las fuentes</option>
            {FUENTES_OPORTUNIDAD.map((f) => <option key={f} value={f}>{ETIQUETA_FUENTE_OPORTUNIDAD[f]}</option>)}
          </Selecto>
          <Selecto etiqueta="" value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
            <option value="">Todos los estados</option>
            {ESTADOS_ACTIVIDAD.map((s) => <option key={s} value={s}>{ETIQUETA_ESTADO_ACTIVIDAD[s]}</option>)}
          </Selecto>
        </div>
        {isLoading && <EstadoCarga />}
        {data && data.length === 0 && <ListaVacia />}
      </Tarjeta>

      {puedeGestionar && editor && (
        <EditorOportunidad
          key={editor.id ?? 'nueva'}
          inicial={editor.id ? editor.fila : null}
          alGuardar={() => { setEditor(null); toast.success('Oportunidad guardada.'); refrescar(); }}
          alCerrar={() => { setEditor(null); refrescar(); }}
        />
      )}

      {data && data.length > 0 && (
        <div className="list-card">
          <div className="list-card-head">
            <h2>Oportunidades difundidas</h2>
          </div>
          {data.map((o) => (
            <TarjetaRegistro
              key={o.id}
              icono={Megaphone}
              titulo={o.titulo}
              badge={<BadgesOportunidad oportunidad={o} />}
              onClick={() => setSeleccionada(o)}
              meta={(
                <>
                  <span>{ETIQUETA_FUENTE_OPORTUNIDAD[o.fuente]}</span>
                  {o.razon_social && <span>{o.razon_social}</span>}
                  <span>Publicación: {fechaCalendario(o.fecha_publicacion)}</span>
                  {o.fecha_inicio && <span>Inicio: {fechaHoraLima(o.fecha_inicio)}</span>}
                  {o.fecha_fin && <span>Fin: {fechaHoraLima(o.fecha_fin)}</span>}
                  {o.modalidad && <span>{ETIQUETA_MODALIDAD[o.modalidad] || o.modalidad}</span>}
                </>
              )}
            >
              {o.descripcion && (
                <ContenidoEnriquecido className="contenido-resumen">{o.descripcion}</ContenidoEnriquecido>
              )}
            </TarjetaRegistro>
          ))}
        </div>
      )}

      <DetalleOportunidad
        oportunidad={seleccionada}
        puedeGestionar={puedeGestionar}
        alCerrar={() => setSeleccionada(null)}
        alCambio={(mensaje) => { toast.success(mensaje); refrescar(); }}
        alEditar={(o) => {
          if (o.puede_modificarse === false || (o.estado_efectivo || o.estado) === 'finalizado') {
            toast.error('Esta oportunidad ha finalizado y ya no puede modificarse.');
            return;
          }
          setSeleccionada(null);
          setEditor({ id: o.id, fila: o });
        }}
      />
    </div>
  );
}

function DetalleOportunidad({ oportunidad, puedeGestionar, alCerrar, alCambio, alEditar }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  if (!oportunidad) return null;

  const estadoEfectivo = oportunidad.estado_efectivo || oportunidad.estado;
  const finalizada = estadoEfectivo === 'finalizado';
  // Una cancelada con fecha de fin alcanzada también es inmutable, pero no
  // debe mostrar el motivo "finalizada": su ciclo de vida sigue cancelado.
  const bloqueada = oportunidad.puede_modificarse === false || finalizada;

  const cambiar = async (estado) => {
    try {
      await ejecutar(() => cambiarEstadoOportunidad(oportunidad.id, estado));
      setError(null);
      alCambio(`Oportunidad marcada como "${ETIQUETA_ESTADO_ACTIVIDAD[estado]}".`);
      alCerrar();
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const alternar = async () => {
    try {
      await ejecutar(() => cambiarActivacionOportunidad(oportunidad.id, !oportunidad.activo));
      setError(null);
      alCambio(oportunidad.activo ? 'Oportunidad ocultada.' : 'Oportunidad publicada.');
      alCerrar();
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const proximos = TRANSICIONES[oportunidad.estado] || [];
  const enlaceSeguro = oportunidad.enlace && esEnlaceSeguro(oportunidad.enlace) ? oportunidad.enlace : null;

  return (
    <Modal
      abierto
      titulo={oportunidad.titulo}
      subtitulo={ETIQUETA_FUENTE_OPORTUNIDAD[oportunidad.fuente]}
      alCerrar={alCerrar}
      tamano="detalle"
      acciones={puedeGestionar && !bloqueada ? (
        <>
          <Boton variante="gris" onClick={() => alEditar(oportunidad)}>
            <Pencil size={16} aria-hidden="true" />Editar
          </Boton>
          {proximos.map((estado) => (
            <Boton
              key={estado}
              variante={estado === 'cancelado' ? 'peligro' : estado === 'finalizado' ? 'gris' : 'primario'}
              cargando={enviando}
              onClick={() => cambiar(estado)}
            >
              {estado === 'finalizado'
                ? 'Finalizar'
                : estado === 'cancelado'
                  ? 'Cancelar'
                  : ETIQUETA_ESTADO_ACTIVIDAD[estado]}
            </Boton>
          ))}
          <Boton variante={oportunidad.activo ? 'peligro' : 'exito'} cargando={enviando} onClick={alternar}>
            {oportunidad.activo
              ? <><EyeOff size={16} aria-hidden="true" />Ocultar</>
              : <><Upload size={16} aria-hidden="true" />Publicar</>}
          </Boton>
        </>
      ) : null}
    >
      <div className="actividad-detalle-estado">
        <BadgesOportunidad oportunidad={oportunidad} />
        {finalizada && (
          <span className="actividad-detalle-motivo">
            {oportunidad.estado === 'finalizado' ? 'Finalizada manualmente.' : 'Finalizada por fecha de fin.'}
          </span>
        )}
      </div>

      {finalizada && (
        <p className="actividad-detalle-aviso" role="status">
          Esta oportunidad ha finalizado y ya no puede modificarse.
        </p>
      )}

      <Mensaje>{error}</Mensaje>

      <FichaDatos
        items={[
          { etiqueta: 'Fuente', valor: ETIQUETA_FUENTE_OPORTUNIDAD[oportunidad.fuente] },
          { etiqueta: 'Empresa', valor: oportunidad.razon_social },
          { etiqueta: 'Fecha de publicación', valor: fechaCalendario(oportunidad.fecha_publicacion) },
          { etiqueta: 'Inicio', valor: fechaHoraLima(oportunidad.fecha_inicio) },
          { etiqueta: 'Fin', valor: fechaHoraLima(oportunidad.fecha_fin) },
          {
            etiqueta: 'Modalidad',
            valor: oportunidad.modalidad
              ? (ETIQUETA_MODALIDAD[oportunidad.modalidad] || oportunidad.modalidad)
              : null,
          },
          {
            etiqueta: 'Enlace',
            valor: enlaceSeguro ? (
              <a className="enlace" href={enlaceSeguro} target="_blank" rel="noopener noreferrer">
                Ver convocatoria original <ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : null,
          },
        ]}
      />

      {oportunidad.descripcion && (
        <div className="modal-seccion actividad-detalle-descripcion">
          <h3>Descripción</h3>
          <ContenidoEnriquecido>{oportunidad.descripcion}</ContenidoEnriquecido>
        </div>
      )}
    </Modal>
  );
}

function EditorOportunidad({ inicial, alGuardar, alCerrar }) {
  const esNueva = !inicial;
  const [form, setForm] = useState(() =>
    inicial
      ? {
          fuente: inicial.fuente || '',
          titulo: inicial.titulo || '',
          descripcion: inicial.descripcion || '',
          enlace: inicial.enlace || '',
          fecha_publicacion: inicial.fecha_publicacion || '',
          fecha_inicio: aLocal(inicial.fecha_inicio),
          fecha_fin: aLocal(inicial.fecha_fin),
          modalidad: inicial.modalidad || '',
        }
      : VACIO,
  );
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const finalizada = Boolean(inicial)
    && (inicial.estado_efectivo || inicial.estado) === 'finalizado';
  const bloqueada = Boolean(inicial)
    && (inicial.puede_modificarse === false || finalizada);
  const hayProgramacion = Boolean(inicial?.fecha_inicio || inicial?.fecha_fin || inicial?.modalidad);

  if (bloqueada) {
    return (
      <Tarjeta titulo={finalizada ? 'Oportunidad finalizada' : 'Oportunidad de solo lectura'}>
        <p className="vacio" role="status">
          {finalizada
            ? 'Esta oportunidad ha finalizado y ya no puede modificarse.'
            : 'Esta oportunidad ya no puede modificarse.'}
        </p>
        <div className="form-acciones">
          <Boton variante="gris" onClick={alCerrar}>Cerrar</Boton>
        </div>
      </Tarjeta>
    );
  }

  const set = (k) => (e) => {
    const valor = e.target.value;
    setForm((previo) => ({ ...previo, [k]: valor }));
    setErrores((previo) => {
      if (!previo[k]) return previo;
      const siguiente = { ...previo };
      delete siguiente[k];
      return siguiente;
    });
    setError(null);
  };

  const enfocarCampo = (campo) => {
    const elemento = document.getElementById(`oportunidad-${campo}`);
    if (!elemento) return;
    if (campo === 'descripcion') {
      elemento.querySelector('[contenteditable="true"]')?.focus();
      return;
    }
    elemento.focus();
  };

  const validar = () => {
    const encontrados = {};

    if (!FUENTES_OPORTUNIDAD.includes(normalizarTexto(form.fuente))) {
      encontrados.fuente = 'Selecciona una fuente válida.';
    }

    if (normalizarTexto(form.titulo) === '') {
      encontrados.titulo = 'El título de la oportunidad es obligatorio.';
    }

    const enlace = normalizarTexto(form.enlace);
    if (enlace === '' || !esEnlaceSeguro(enlace)) {
      encontrados.enlace = 'Introduce una URL válida.';
    }

    const fecha = normalizarTexto(form.fecha_publicacion);
    if (fecha === '') {
      encontrados.fecha_publicacion = 'La fecha de publicación es obligatoria.';
    } else if (!esFechaCalendario(fecha)) {
      encontrados.fecha_publicacion = 'La fecha de publicación no es válida.';
    }

    // Los campos de programación son obligatorios al crear. En un registro
    // histórico incompleto se permiten vacíos para no inventar fechas; si se
    // empieza a completar cualquiera, los tres pasan a ser obligatorios.
    const requiereProgramacion = esNueva || hayProgramacion
      || [form.fecha_inicio, form.fecha_fin, form.modalidad].some((valor) => String(valor).trim() !== '');

    if (requiereProgramacion) {
      const inicio = form.fecha_inicio;
      const fin = form.fecha_fin;
      const inicioValido = Boolean(inicio) && !Number.isNaN(Date.parse(inicio));
      const finValido = Boolean(fin) && !Number.isNaN(Date.parse(fin));

      if (!inicio) {
        encontrados.fecha_inicio = 'Indica la fecha y hora de inicio.';
      } else if (!inicioValido) {
        encontrados.fecha_inicio = 'Indica una fecha y hora de inicio válidas.';
      }

      if (!fin) {
        encontrados.fecha_fin = 'Indica la fecha y hora de finalización.';
      } else if (!finValido) {
        encontrados.fecha_fin = 'Indica una fecha y hora de finalización válidas.';
      } else if (inicioValido && Date.parse(fin) < Date.parse(inicio)) {
        encontrados.fecha_fin = 'La fecha de finalización no puede ser anterior a la fecha de inicio.';
      }

      const modalidad = normalizarTexto(form.modalidad);
      if (!modalidad) {
        encontrados.modalidad = 'Selecciona una modalidad.';
      } else if (!MODALIDADES_ACTIVIDAD.some((m) => m.v === modalidad)) {
        encontrados.modalidad = 'Selecciona una modalidad válida.';
      }
    }

    if (textoEnriquecidoVacio(form.descripcion)) {
      encontrados.descripcion = 'La descripción de la oportunidad es obligatoria.';
    } else if (excedeLimiteTexto(form.descripcion)) {
      encontrados.descripcion = `La descripción supera el límite de ${TEXTO_MAX} caracteres.`;
    }

    return encontrados;
  };

  const guardar = async () => {
    const encontrados = validar();
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      setError(null);
      const primero = ORDEN_CAMPOS.find((campo) => encontrados[campo]);
      if (primero) enfocarCampo(primero);
      return;
    }

    setEnviando(true);
    setError(null);

    try {
      const datos = convertir(form);
      if (inicial) {
        await actualizarOportunidad(inicial.id, datos);
      } else {
        await crearOportunidad(datos);
      }
      alGuardar();
    } catch (e) {
      const campos = e?.response?.data?.campos;
      if (campos && typeof campos === 'object' && !Array.isArray(campos)) {
        setErrores(campos);
        setError(null);
        const primero = ORDEN_CAMPOS.find((campo) => campos[campo]);
        if (primero) enfocarCampo(primero);
      } else {
        const det = e?.response?.data?.errors;
        setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(e));
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta titulo={inicial ? 'Editar oportunidad' : 'Nueva oportunidad'}>
      <p className="tarjeta-sub">
        {esNueva
          ? 'Difunde una convocatoria externa con su programación y vigencia.'
          : 'Actualiza los datos de la oportunidad.'}
      </p>
      <Mensaje>{error}</Mensaje>

      <div className="form-seccion">
        <span className="form-seccion-titulo">Información básica</span>
        <div className="form-malla">
          <Selecto
            etiqueta="Fuente *"
            id="oportunidad-fuente"
            value={form.fuente}
            onChange={set('fuente')}
            error={errores.fuente}
            required
          >
            <option value="">Seleccionar fuente</option>
            {FUENTES_OPORTUNIDAD.map((f) => <option key={f} value={f}>{ETIQUETA_FUENTE_OPORTUNIDAD[f]}</option>)}
          </Selecto>
          <Campo
            etiqueta="Título *"
            id="oportunidad-titulo"
            value={form.titulo}
            onChange={set('titulo')}
            error={errores.titulo}
            maxLength={200}
            required
          />
          <Campo
            etiqueta="Enlace (URL de la convocatoria) *"
            id="oportunidad-enlace"
            type="url"
            value={form.enlace}
            onChange={set('enlace')}
            error={errores.enlace}
            placeholder="https://…"
            required
          />
          <Campo
            etiqueta="Fecha de publicación *"
            id="oportunidad-fecha_publicacion"
            type="date"
            value={form.fecha_publicacion}
            onChange={set('fecha_publicacion')}
            error={errores.fecha_publicacion}
            required
          />
        </div>
      </div>

      <div className="form-seccion">
        <span className="form-seccion-titulo">Programación y ubicación</span>
        {!esNueva && !hayProgramacion && (
          <p className="form-seccion-nota">
            Este registro histórico no tiene programación. Si completas Inicio, Fin o Modalidad,
            los tres serán obligatorios.
          </p>
        )}
        <div className="form-actividad-programacion">
          <div className="form-actividad-fila form-actividad-fila-3">
            <Campo
              etiqueta="Inicio *"
              id="oportunidad-fecha_inicio"
              type="datetime-local"
              value={form.fecha_inicio}
              onChange={set('fecha_inicio')}
              error={errores.fecha_inicio}
              required={esNueva || hayProgramacion}
            />
            <Campo
              etiqueta="Fin *"
              id="oportunidad-fecha_fin"
              type="datetime-local"
              value={form.fecha_fin}
              onChange={set('fecha_fin')}
              error={errores.fecha_fin}
              required={esNueva || hayProgramacion}
            />
            <Selecto
              etiqueta="Modalidad *"
              id="oportunidad-modalidad"
              value={form.modalidad}
              onChange={set('modalidad')}
              error={errores.modalidad}
              required={esNueva || hayProgramacion}
            >
              <option value="">Seleccionar modalidad</option>
              {MODALIDADES_ACTIVIDAD.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
            </Selecto>
          </div>
        </div>
      </div>

      <div id="oportunidad-descripcion" className="form-seccion" tabIndex={-1}>
        <span className="form-seccion-titulo">Descripción *</span>
        <p className="form-seccion-nota">
          Puedes incluir enlaces http(s) en la descripción; se conservarán y serán clicables.
        </p>
        <Suspense fallback={<p className="vacio">Cargando editor…</p>}>
          <EditorTextoEnriquecido
            etiqueta=""
            valor={form.descripcion}
            onChange={(html) => {
              setForm((previo) => ({ ...previo, descripcion: html }));
              setErrores((previo) => (previo.descripcion ? { ...previo, descripcion: undefined } : previo));
              setError(null);
            }}
            error={errores.descripcion}
            errorId="oportunidad-descripcion-error"
            placeholder="Detalla la convocatoria: requisitos, puestos, cómo postular…"
          />
        </Suspense>
      </div>

      <div className="form-acciones">
        <Boton variante="primario" cargando={enviando} onClick={guardar}>Guardar</Boton>
      </div>
    </Tarjeta>
  );
}

function convertir(form) {
  return {
    ...form,
    fuente: normalizarTexto(form.fuente),
    titulo: normalizarTexto(form.titulo),
    enlace: normalizarTexto(form.enlace),
    fecha_publicacion: normalizarTexto(form.fecha_publicacion),
    modalidad: normalizarTexto(form.modalidad),
    fecha_inicio: aServidor(form.fecha_inicio),
    fecha_fin: aServidor(form.fecha_fin),
  };
}
