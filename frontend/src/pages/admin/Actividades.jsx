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
import { useToast } from '../../components/Feedbacks';
import { CalendarDays, ExternalLink, Pencil } from 'lucide-react';
import {
  ESTADOS_ACTIVIDAD, ETIQUETA_ESTADO_ACTIVIDAD, ETIQUETA_TIPO_ACTIVIDAD,
  MODALIDADES_ACTIVIDAD, TIPOS_ACTIVIDAD,
} from '../../constants';
import { TEXTO_MAX, errorApi, esEnlaceSeguro, excedeLimiteTexto, fechaHora, urlArchivo } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

// El editor (TiPTap) se carga solo cuando se abre el formulario de actividad.
const EditorTextoEnriquecido = lazy(() => import('../../components/EditorTextoEnriquecido'));

const aLocal = (v) => (v ? String(v).slice(0, 16).replace(' ', 'T') : '');
const VACIO = { tipo: 'taller', nombre: '', descripcion: '', fecha_inicio: '', fecha_fin: '', lugar: '', modalidad: 'presencial', organizador: '', enlace: '' };

export default function Actividades() {
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
  useEffect(() => { import('../../components/EditorTextoEnriquecido'); }, []);

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['actividades-admin'] });

  return (
    <div>
      <Tarjeta
        titulo="Ferias, eventos, talleres y capacitaciones"
        acciones={
          <Boton variante="acento" onClick={() => setEditor(editor ? null : {})}>
            {editor ? 'Cancelar' : 'Nueva actividad'}
          </Boton>
        }
      >
        <div className="form-fila">
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

      {editor && (!editor.id || editor.fila) && (
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
              icono={CalendarDays}
              titulo={a.nombre}
              badge={<Estado valor={a.estado} diccionario={ETIQUETA_ESTADO_ACTIVIDAD} />}
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
              {a.imagen_url && <img className="imagen-mini" src={urlArchivo(a.imagen_url)} alt="" />}
              {a.descripcion && (
                <ContenidoEnriquecido className="contenido-resumen">{a.descripcion}</ContenidoEnriquecido>
              )}
            </TarjetaRegistro>
          ))}
        </div>
      )}

      <DetalleActividad
        actividad={seleccionada}
        alCerrar={() => setSeleccionada(null)}
        alCambio={(mensaje) => { toast.success(mensaje); refrescar(); }}
        alEditar={(actividad) => { setSeleccionada(null); setEditor({ id: actividad.id, fila: actividad }); }}
      />
    </div>
  );
}

function DetalleActividad({ actividad, alCerrar, alCambio, alEditar }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  if (!actividad) return null;

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

  const proximos = {
    programado: ['en_curso', 'finalizado', 'cancelado'],
    en_curso: ['finalizado', 'cancelado'],
    cancelado: ['programado'],
    finalizado: [],
  }[actividad.estado] || [];

  return (
    <Modal
      abierto
      titulo={actividad.nombre}
      subtitulo={ETIQUETA_TIPO_ACTIVIDAD[actividad.tipo]}
      alCerrar={alCerrar}
      tamano="ancho"
      acciones={(
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
      )}
    >
      <div className="form-fila" style={{ marginBottom: '0.8rem' }}>
        <Estado valor={actividad.estado} diccionario={ETIQUETA_ESTADO_ACTIVIDAD} />
      </div>

      <Mensaje>{error}</Mensaje>

      {actividad.imagen_url && (
        <img className="imagen-actividad" src={urlArchivo(actividad.imagen_url)} alt={actividad.nombre} />
      )}

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
          tipo: inicial.tipo, nombre: inicial.nombre, descripcion: inicial.descripcion || '',
          fecha_inicio: aLocal(inicial.fecha_inicio), fecha_fin: aLocal(inicial.fecha_fin),
          lugar: inicial.lugar || '', modalidad: inicial.modalidad || 'presencial', organizador: inicial.organizador || '',
          enlace: inicial.enlace || '',
        }
      : VACIO,
  );
  // idActividad arranca con el de la edición; en creación se fija al guardar,
  // sin re-montar el formulario (así no se pierde lo escrito ni la imagen elegida).
  const [idActividad, setIdActividad] = useState(inicial?.id ?? null);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [archivoImagen, setArchivoImagen] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imagenUrl, setImagenUrl] = useState(() => (inicial?.imagen_url ? urlArchivo(inicial.imagen_url) : null));

  // Libera el object URL de la selección previa al guardar.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const limpiarPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const subirImagen = async (id, archivo, trasCrear) => {
    setSubiendoImagen(true);
    try {
      await subirImagenActividad(id, archivo);
      limpiarPreview();
      setArchivoImagen(null);
      setImagenUrl(`${urlArchivo(`/api/actividades/${id}/imagen`)}?v=${Date.now()}`);
      toast.success('Imagen cargada correctamente.');
      return true;
    } catch (e) {
      toast.error(trasCrear
        ? 'Actividad creada, pero la imagen no pudo cargarse. Puedes intentarlo de nuevo.'
        : `Error al cargar la imagen. ${errorApi(e)}`);
      return false;
    } finally {
      setSubiendoImagen(false);
    }
  };

  const manejarSubir = async (archivo) => {
    if (idActividad) {
      await subirImagen(idActividad, archivo, false);
      return;
    }
    // Creación sin ID todavía: solo preview local (no se sube nada huérfano).
    limpiarPreview();
    setError(null);
    setArchivoImagen(archivo);
    setPreviewUrl(URL.createObjectURL(archivo));
  };

  const manejarEliminar = async () => {
    // Limpia siempre la selección local (preview/pendiente), exista o no la actividad.
    limpiarPreview();
    setArchivoImagen(null);
    if (!idActividad) return;

    setSubiendoImagen(true);
    try {
      await eliminarImagenActividad(idActividad);
      setImagenUrl(null);
      toast.success('Imagen eliminada correctamente.');
      alGuardar({ cerrar: false });
    } catch (e) {
      toast.error(errorApi(e));
    } finally {
      setSubiendoImagen(false);
    }
  };

  const guardar = async () => {
    // Mismo límite que el backend: 10.000 caracteres de TEXTO visible.
    if (excedeLimiteTexto(form.descripcion)) {
      setError(`La descripción supera el límite de ${TEXTO_MAX} caracteres.`);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      // Edición de una actividad existente: conserva el comportamiento actual.
      if (idActividad) {
        await actualizarActividad(idActividad, convertir(form));
        toast.success('Cambios guardados.');
        alGuardar({ cerrar: !esNueva });
        return;
      }

      // Creación: primero la actividad, luego (si había imagen elegida) la imagen.
      const creada = await crearActividad(convertir(form));
      const nuevoId = creada?.id;
      if (!nuevoId) throw new Error('No se recibió el identificador de la actividad creada.');

      setIdActividad(nuevoId);
      alGuardar({ cerrar: false });

      if (archivoImagen) {
        await subirImagen(nuevoId, archivoImagen, true);
      } else {
        toast.success('Actividad creada correctamente.');
      }
    } catch (e) {
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
          <Selecto etiqueta="Tipo *" value={form.tipo} onChange={set('tipo')}>
            {TIPOS_ACTIVIDAD.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_ACTIVIDAD[t]}</option>)}
          </Selecto>
          <Campo etiqueta="Nombre *" value={form.nombre} onChange={set('nombre')} />
        </div>
      </div>

      <div className="form-seccion">
        <span className="form-seccion-titulo">Programación y ubicación</span>
        <div className="form-actividad-programacion">
          <div className="form-actividad-fila form-actividad-fila-3">
            <Campo etiqueta="Inicio *" type="datetime-local" value={form.fecha_inicio} onChange={set('fecha_inicio')} />
            <Campo etiqueta="Fin" type="datetime-local" value={form.fecha_fin} onChange={set('fecha_fin')} />
            <Selecto etiqueta="Modalidad" value={form.modalidad} onChange={set('modalidad')}>
              {MODALIDADES_ACTIVIDAD.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
            </Selecto>
          </div>
          <div className="form-actividad-fila form-actividad-fila-2">
            <Campo etiqueta="Lugar" value={form.lugar} onChange={set('lugar')} />
            <Campo etiqueta="Organizador" value={form.organizador} onChange={set('organizador')} />
          </div>
          <div className="form-actividad-fila">
            <Campo etiqueta="Enlace (URL de la convocatoria)" value={form.enlace} onChange={set('enlace')} />
          </div>
        </div>
      </div>

      <ImagenUploader
        container="plano"
        titulo="Imagen de la actividad"
        descripcion="Opcional · JPG, PNG o WEBP · máximo 2 MB · resolución recomendada 1280 × 720 px (16:9), máxima 1920 × 1080 px. Se muestra en el portal público."
        url={previewUrl || imagenUrl}
        onSubir={manejarSubir}
        onEliminar={manejarEliminar}
        cargando={subiendoImagen}
      />

      <div className="form-seccion">
        <span className="form-seccion-titulo">Descripción</span>
        <Suspense fallback={<p className="vacio">Cargando editor…</p>}>
          <EditorTextoEnriquecido
            etiqueta=""
            valor={form.descripcion}
            onChange={(html) => setForm((previo) => ({ ...previo, descripcion: html }))}
            placeholder="Detalla la actividad: agenda, público objetivo, requisitos…"
          />
        </Suspense>
      </div>

      <div className="form-acciones">
        <Boton variante="primario" cargando={enviando || subiendoImagen} onClick={guardar}>
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
    fecha_inicio: form.fecha_inicio.replace('T', ' '),
    fecha_fin: form.fecha_fin ? form.fecha_fin.replace('T', ' ') : null,
  };
}
