// SPDX-License-Identifier: MIT
import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { actualizarActividad, cambiarEstadoActividad, crearActividad, eliminarImagenActividad, listarActividadesAdmin, subirImagenActividad } from '../../services/divulgacion';
import { EstadoCarga, Boton, Campo, Estado, ListaVacia, Mensaje, Selecto, Tarjeta } from '../../components/UI';
import TarjetaRegistro from '../../components/TarjetaRegistro';
import Modal from '../../components/Modal';
import FichaDatos from '../../components/FichaDatos';
import ContenidoEnriquecido from '../../components/ContenidoEnriquecido';
import ImagenUploader from '../../components/ImagenUploader';
import ActivityImage from '../../components/ActivityImage';
import { useToast } from '../../components/Feedbacks';
import { CalendarDays, ExternalLink, Pencil } from 'lucide-react';
import {
  ESTADOS_ACTIVIDAD, ETIQUETA_ESTADO_ACTIVIDAD, ETIQUETA_TIPO_ACTIVIDAD,
  MODALIDADES_ACTIVIDAD, TIPOS_ACTIVIDAD,
} from '../../constants';
import { TEXTO_MAX, errorApi, esEnlaceSeguro, excedeLimiteTexto, fechaHora, textoEnriquecidoVacio, urlArchivo } from '../../utils';
import { useAccion } from '../../hooks/useAccion';
import { usePermisosMunicipales } from '../../hooks/usePermisosMunicipales';

// El editor (TiPTap) se carga solo cuando se abre el formulario de actividad.
const EditorTextoEnriquecido = lazy(() => import('../../components/EditorTextoEnriquecido'));

const aLocal = (v) => (v ? String(v).slice(0, 16).replace(' ', 'T') : '');
const VACIO = { tipo: '', nombre: '', descripcion: '', fecha_inicio: '', fecha_fin: '', lugar: '', modalidad: '', organizador: '', enlace: '' };

const normalizarTexto = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim();

const ORDEN_CAMPOS = ['tipo', 'nombre', 'fecha_inicio', 'fecha_fin', 'modalidad', 'lugar', 'organizador', 'imagen', 'descripcion'];

export default function Actividades() {
  const { puede } = usePermisosMunicipales();
  const puedeGestionar = puede('actividades');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filtros, setFiltros] = useState({ tipo: '', estado: '' });
  const [editor, setEditor] = useState(null);
  const [seleccionada, setSeleccionada] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['actividades-admin', filtros],
    queryFn: () => listarActividadesAdmin(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v))),
  });

  // Precarga el chunk del editor al entrar a la página (no engorda el bundle inicial).
  useEffect(() => { if (puedeGestionar) import('../../components/EditorTextoEnriquecido'); }, [puedeGestionar]);

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['actividades-admin'] });

  return (
    <div>
      <Tarjeta
        titulo="Ferias, eventos, talleres y capacitaciones"
        acciones={puedeGestionar ? (
          <Boton variante="acento" onClick={() => setEditor(editor ? null : {})}>
            {editor ? 'Cancelar' : 'Nueva actividad'}
          </Boton>
        ) : null}
      >
        <div className="form-fila filtros">
          <Selecto etiqueta="" value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}>
            <option value="">Todos los tipos</option>
            {TIPOS_ACTIVIDAD.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_ACTIVIDAD[t]}</option>)}
          </Selecto>
          <Selecto etiqueta="" value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
            <option value="">Todos los estados</option>
            {ESTADOS_ACTIVIDAD.map((s) => <option key={s} value={s}>{ETIQUETA_ESTADO_ACTIVIDAD[s]}</option>)}
          </Selecto>
        </div>
        {isLoading && <EstadoCarga />}
        {data && data.length === 0 && <ListaVacia />}
      </Tarjeta>

      {puedeGestionar && editor && (!editor.id || editor.fila) && (
        <EditorActividad
          key={editor.id ?? 'nueva'}
          inicial={editor.id ? editor.fila : null}
          alGuardar={({ cerrar }) => { refrescar(); if (cerrar) setEditor(null); }}
          alCerrar={() => { setEditor(null); refrescar(); }}
        />
      )}

      {data && data.length > 0 && (
        <div className="list-card">
          <div className="list-card-head">
            <h2>Actividades registradas</h2>
          </div>
          {data.map((a) => (
            <TarjetaRegistro
              key={a.id}
              lateral={<ActivityImage variante="tarjeta" src={urlArchivo(a.imagen_url)} alt={`Imagen de la actividad ${a.nombre}`} />}
              icono={CalendarDays}
              titulo={a.nombre}
              badge={<Estado valor={a.estado_efectivo || a.estado} diccionario={ETIQUETA_ESTADO_ACTIVIDAD} />}
              onClick={() => setSeleccionada(a)}
              meta={(
                <>
                  <span>{ETIQUETA_TIPO_ACTIVIDAD[a.tipo]}</span>
                  <span>{fechaHora(a.fecha_inicio)}</span>
                  {a.lugar && <span>{a.lugar}</span>}
                  <span>{a.organizador || 'MDJLO'}</span>
                </>
              )}
            >
              {a.descripcion && (
                <ContenidoEnriquecido className="contenido-resumen">{a.descripcion}</ContenidoEnriquecido>
              )}
            </TarjetaRegistro>
          ))}
        </div>
      )}

      <DetalleActividad
        actividad={seleccionada}
        puedeGestionar={puedeGestionar}
        alCerrar={() => setSeleccionada(null)}
        alCambio={(mensaje) => { toast.success(mensaje); refrescar(); }}
        alEditar={(actividad) => { setSeleccionada(null); setEditor({ id: actividad.id, fila: actividad }); }}
      />
    </div>
  );
}

function DetalleActividad({ actividad, puedeGestionar, alCerrar, alCambio, alEditar }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  if (!actividad) return null;

  const estadoEfectivo = actividad.estado_efectivo || actividad.estado;
  const cambiar = async (estado) => {
    try {
      await ejecutar(() => cambiarEstadoActividad(actividad.id, estado));
      setError(null);
      alCambio(`Actividad marcada como "${ETIQUETA_ESTADO_ACTIVIDAD[estado]}".`);
      alCerrar();
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const transiciones = {
    programado: ['en_curso', 'finalizado', 'cancelado'],
    en_curso: ['finalizado', 'cancelado'],
    cancelado: ['programado'],
    finalizado: [],
  }[actividad.estado] || [];
  // Una actividad vencida ya no debe ofrecer "En curso"; sí permite finalizar
  // manualmente el estado persistido para reconciliar el historial.
  const proximos = estadoEfectivo === 'finalizado' && actividad.estado !== 'finalizado'
    ? transiciones.filter((estado) => estado !== 'en_curso')
    : transiciones;

  return (
    <Modal
      abierto
      titulo={actividad.nombre}
      subtitulo={ETIQUETA_TIPO_ACTIVIDAD[actividad.tipo]}
      alCerrar={alCerrar}
      tamano="ancho"
      acciones={puedeGestionar ? (
        <>
          <Boton variante="gris" onClick={() => alEditar(actividad)}>
            <Pencil size={16} aria-hidden="true" />Editar
          </Boton>
          {proximos.map((s) => (
            <Boton
              key={s}
              variante={s === 'cancelado' ? 'peligro' : s === 'finalizado' ? 'gris' : 'primario'}
              cargando={enviando}
              onClick={() => cambiar(s)}
            >
              {s === 'finalizado' ? 'Finalizar' : s === 'cancelado' ? 'Cancelar' : ETIQUETA_ESTADO_ACTIVIDAD[s]}
            </Boton>
          ))}
        </>
      ) : null}
    >
      <div className="form-fila" style={{ marginBottom: '0.8rem' }}>
        <Estado valor={estadoEfectivo} diccionario={ETIQUETA_ESTADO_ACTIVIDAD} />
        {estadoEfectivo !== actividad.estado && (
          <span style={{ color: 'var(--amber-tx)', fontSize: '0.85rem' }}>
            Finalizada por fecha de fin; se conserva el estado administrativo persistido.
          </span>
        )}
      </div>

      <Mensaje>{error}</Mensaje>

      <ActivityImage src={urlArchivo(actividad.imagen_url)} alt={`Imagen de la actividad ${actividad.nombre}`} expandible />

      <FichaDatos
        items={[
          { etiqueta: 'Tipo', valor: ETIQUETA_TIPO_ACTIVIDAD[actividad.tipo] },
          { etiqueta: 'Inicio', valor: fechaHora(actividad.fecha_inicio) },
          { etiqueta: 'Fin', valor: actividad.fecha_fin ? fechaHora(actividad.fecha_fin) : null },
          { etiqueta: 'Lugar', valor: actividad.lugar },
          { etiqueta: 'Modalidad', valor: actividad.modalidad },
          { etiqueta: 'Organizador', valor: actividad.organizador || 'MDJLO' },
          {
            etiqueta: 'Enlace',
            valor: actividad.enlace && esEnlaceSeguro(actividad.enlace) ? (
              <a className="enlace" href={actividad.enlace} target="_blank" rel="noopener noreferrer">
                Ver convocatoria <ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : null,
          },
        ]}
      />

      {actividad.descripcion && (
        <div className="modal-seccion">
          <h3>Descripción</h3>
          <ContenidoEnriquecido>{actividad.descripcion}</ContenidoEnriquecido>
        </div>
      )}
    </Modal>
  );
}

function EditorActividad({ inicial, alGuardar, alCerrar }) {
  const toast = useToast();
  const esNueva = !inicial;
  const [form, setForm] = useState(() =>
    inicial
      ? {
          tipo: inicial.tipo || '', nombre: inicial.nombre || '', descripcion: inicial.descripcion || '',
          fecha_inicio: aLocal(inicial.fecha_inicio), fecha_fin: aLocal(inicial.fecha_fin),
          lugar: inicial.lugar || '', modalidad: inicial.modalidad || '', organizador: inicial.organizador || '',
          enlace: inicial.enlace || '',
        }
      : VACIO,
  );
  const [idActividad, setIdActividad] = useState(inicial?.id ?? null);
  const [error, setError] = useState(null);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [archivoImagen, setArchivoImagen] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imagenUrl, setImagenUrl] = useState(() => (inicial?.imagen_url ? urlArchivo(inicial.imagen_url) : null));

  // Libera el object URL de la selección previa al guardar.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const limpiarPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const limpiarError = (campo) => {
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
    setError(null);
  };

  const set = (k) => (e) => {
    const valor = e.target.value;
    setForm((prev) => ({ ...prev, [k]: valor }));
    limpiarError(k);
  };

  const manejarSubir = (archivo) => {
    // No se sube nada hasta guardar: así cancelar no deja archivos huérfanos.
    limpiarPreview();
    setArchivoImagen(archivo);
    setPreviewUrl(URL.createObjectURL(archivo));
    limpiarError('imagen');
  };

  const manejarEliminar = async () => {
    limpiarPreview();
    setArchivoImagen(null);
    if (!idActividad) {
      setImagenUrl(null);
      return;
    }

    setEnviando(true);
    try {
      await eliminarImagenActividad(idActividad);
      setImagenUrl(null);
      toast.success('Imagen eliminada correctamente.');
      alGuardar({ cerrar: false });
    } catch (e) {
      toast.error(errorApi(e));
    } finally {
      setEnviando(false);
    }
  };

  const validar = () => {
    const encontrados = {};

    const tipo = normalizarTexto(form.tipo);
    if (!tipo) encontrados.tipo = 'Selecciona el tipo de actividad.';
    else if (!TIPOS_ACTIVIDAD.includes(tipo)) encontrados.tipo = 'Selecciona un tipo de actividad válido.';

    const nombre = normalizarTexto(form.nombre);
    if (!nombre) encontrados.nombre = 'El nombre de la actividad es obligatorio.';
    else if (nombre.length > 200) encontrados.nombre = 'El nombre de la actividad no debe superar 200 caracteres.';

    const inicio = form.fecha_inicio;
    const fin = form.fecha_fin;
    const inicioValido = Boolean(inicio) && !Number.isNaN(Date.parse(inicio));
    const finValido = Boolean(fin) && !Number.isNaN(Date.parse(fin));

    if (!inicio) encontrados.fecha_inicio = 'Indica la fecha y hora de inicio.';
    else if (!inicioValido) encontrados.fecha_inicio = 'Indica una fecha y hora de inicio válidas.';

    if (!fin) encontrados.fecha_fin = 'Indica la fecha y hora de finalización.';
    else if (!finValido) encontrados.fecha_fin = 'Indica una fecha y hora de finalización válidas.';
    else if (inicioValido && Date.parse(fin) < Date.parse(inicio)) {
      encontrados.fecha_fin = 'La fecha de finalización no puede ser anterior a la fecha de inicio.';
    }

    const modalidad = normalizarTexto(form.modalidad);
    if (!modalidad) encontrados.modalidad = 'Selecciona una modalidad.';
    else if (!MODALIDADES_ACTIVIDAD.some((m) => m.v === modalidad)) encontrados.modalidad = 'Selecciona una modalidad válida.';

    const lugar = normalizarTexto(form.lugar);
    if (!lugar) encontrados.lugar = 'El lugar de realización es obligatorio.';
    else if (lugar.length > 150) encontrados.lugar = 'El lugar de realización no debe superar 150 caracteres.';

    const organizador = normalizarTexto(form.organizador);
    if (!organizador) encontrados.organizador = 'Indica quién organiza la actividad.';
    else if (organizador.length > 150) encontrados.organizador = 'El organizador no debe superar 150 caracteres.';

    // La imagen es obligatoria al crear y también si la actividad editada no
    // tiene una imagen válida. Si ya existe, no se obliga a volver a subirla.
    if (!archivoImagen && !imagenUrl) encontrados.imagen = 'Debes subir una imagen para la actividad.';

    if (textoEnriquecidoVacio(form.descripcion)) {
      encontrados.descripcion = 'La descripción de la actividad es obligatoria.';
    } else if (excedeLimiteTexto(form.descripcion)) {
      encontrados.descripcion = `La descripción supera el límite de ${TEXTO_MAX} caracteres.`;
    }

    return encontrados;
  };

  const enfocarCampo = (campo) => {
    const elemento = document.getElementById(`actividad-${campo}`);
    if (!elemento) return;
    if (campo === 'descripcion') {
      elemento.querySelector('[contenteditable="true"]')?.focus();
      return;
    }
    elemento.focus();
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

      // Edición: si hay una imagen nueva, se sube primero por el endpoint
      // dedicado (que la valida) y luego se actualizan los campos. Si no, solo
      // se actualizan los datos y la imagen existente se conserva.
      if (idActividad) {
        if (archivoImagen) {
          await subirImagenActividad(idActividad, archivoImagen);
          limpiarPreview();
          setArchivoImagen(null);
          setImagenUrl(`${urlArchivo(`/api/actividades/${idActividad}/imagen`)}?v=${Date.now()}`);
        }

        await actualizarActividad(idActividad, datos);
        toast.success('Cambios guardados.');
        alGuardar({ cerrar: !esNueva });
        return;
      }

      // Creación: la actividad y la imagen viajan en una sola solicitud. El
      // backend no guarda nada si falta la imagen o algún campo.
      const creada = await crearActividad(datos, archivoImagen);
      const nuevoId = creada?.id;
      if (!nuevoId) throw new Error('No se recibió el identificador de la actividad creada.');

      setIdActividad(nuevoId);
      limpiarPreview();
      setArchivoImagen(null);
      setImagenUrl(`${urlArchivo(`/api/actividades/${nuevoId}/imagen`)}?v=${Date.now()}`);
      toast.success('Actividad creada correctamente.');
      alGuardar({ cerrar: false });
    } catch (e) {
      const campos = e?.response?.data?.campos;
      if (campos && typeof campos === 'object' && !Array.isArray(campos)) {
        setErrores(campos);
        const primero = ORDEN_CAMPOS.find((campo) => campos[campo]);
        if (primero) enfocarCampo(primero);
      }

      const det = e?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta titulo={esNueva ? 'Nueva actividad' : 'Editar actividad'}>
      <p className="tarjeta-sub">
        {esNueva
          ? 'Registra una feria, taller, capacitación o evento; se publicará en el portal.'
          : 'Actualiza los datos de la actividad.'}
      </p>
      <Mensaje>{error}</Mensaje>

      <div className="form-seccion">
        <span className="form-seccion-titulo">Información básica</span>
        <div className="form-actividad-basica">
          <Selecto etiqueta="Tipo *" id="actividad-tipo" value={form.tipo} onChange={set('tipo')} error={errores.tipo} required>
            <option value="">Seleccionar tipo</option>
            {TIPOS_ACTIVIDAD.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_ACTIVIDAD[t]}</option>)}
          </Selecto>
          <Campo etiqueta="Nombre *" id="actividad-nombre" value={form.nombre} onChange={set('nombre')} error={errores.nombre} maxLength={200} required />
        </div>
      </div>

      <div className="form-seccion">
        <span className="form-seccion-titulo">Programación y ubicación</span>
        <div className="form-actividad-programacion">
          <div className="form-actividad-fila form-actividad-fila-3">
            <Campo etiqueta="Inicio *" id="actividad-fecha_inicio" type="datetime-local" value={form.fecha_inicio} onChange={set('fecha_inicio')} error={errores.fecha_inicio} required />
            <Campo etiqueta="Fin *" id="actividad-fecha_fin" type="datetime-local" value={form.fecha_fin} onChange={set('fecha_fin')} error={errores.fecha_fin} required />
            <Selecto etiqueta="Modalidad *" id="actividad-modalidad" value={form.modalidad} onChange={set('modalidad')} error={errores.modalidad} required>
              <option value="">Seleccionar modalidad</option>
              {MODALIDADES_ACTIVIDAD.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
            </Selecto>
          </div>
          <div className="form-actividad-fila form-actividad-fila-2">
            <Campo etiqueta="Lugar *" id="actividad-lugar" value={form.lugar} onChange={set('lugar')} error={errores.lugar} maxLength={150} required />
            <Campo etiqueta="Organizador *" id="actividad-organizador" value={form.organizador} onChange={set('organizador')} error={errores.organizador} maxLength={150} required />
          </div>
        </div>
      </div>

      <div
        id="actividad-imagen"
        tabIndex={-1}
        aria-invalid={errores.imagen ? true : undefined}
        aria-describedby={errores.imagen ? 'actividad-imagen-error' : undefined}
      >
        <ImagenUploader
          container="plano"
          titulo="Imagen de la actividad *"
          descripcion="Obligatoria · JPG, PNG o WEBP · máximo 2 MB · resolución recomendada 1280 × 720 px (16:9), máxima 1920 × 1080 px. Se muestra en el portal público."
          url={previewUrl || imagenUrl}
          onSubir={manejarSubir}
          onEliminar={manejarEliminar}
          cargando={enviando}
          error={errores.imagen}
          errorId="actividad-imagen-error"
          anchoMaximo={1920}
          altoMaximo={1080}
        />
      </div>

      <div id="actividad-descripcion" className="form-seccion" tabIndex={-1}>
        <span className="form-seccion-titulo">Descripción *</span>
        <p className="form-seccion-nota">
          Enlace de convocatoria: si incluyes una URL en la descripción, el sistema la
          detectará automáticamente y la utilizará como enlace de la actividad.
        </p>
        <Suspense fallback={<p className="vacio">Cargando editor…</p>}>
          <EditorTextoEnriquecido
            etiqueta=""
            valor={form.descripcion}
            onChange={(html) => {
              setForm((previo) => ({ ...previo, descripcion: html }));
              limpiarError('descripcion');
            }}
            error={errores.descripcion}
            errorId="actividad-descripcion-error"
            placeholder="Detalla la actividad: agenda, público objetivo, requisitos…"
          />
        </Suspense>
      </div>

      <div className="form-acciones">
        <Boton variante="primario" cargando={enviando} onClick={guardar}>
          {esNueva && idActividad ? 'Guardar cambios' : 'Guardar'}
        </Boton>
        {esNueva && idActividad && (
          <Boton variante="gris" onClick={alCerrar}>Finalizar</Boton>
        )}
      </div>
    </Tarjeta>
  );
}

function convertir(form) {
  return {
    ...form,
    tipo: normalizarTexto(form.tipo),
    nombre: normalizarTexto(form.nombre),
    lugar: normalizarTexto(form.lugar),
    organizador: normalizarTexto(form.organizador),
    modalidad: normalizarTexto(form.modalidad),
    enlace: normalizarTexto(form.enlace),
    fecha_inicio: form.fecha_inicio.replace('T', ' '),
    fecha_fin: form.fecha_fin ? form.fecha_fin.replace('T', ' ') : null,
  };
}
