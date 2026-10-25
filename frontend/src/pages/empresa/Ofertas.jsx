// SPDX-License-Identifier: MIT
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  actualizarOferta, cerrarOferta, crearOferta, detalleOfertaEmpresa, enviarOfertaARevision, listarOfertasEmpresa,
} from '../../services/ofertas';
import { listarCategorias } from '../../services/categorias';
import { EstadoCarga, Boton, Campo, Estado, Mensaje, Selecto } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import TarjetaRegistro from '../../components/TarjetaRegistro';
import Modal from '../../components/Modal';
import FichaDatos from '../../components/FichaDatos';
import ContenidoEnriquecido from '../../components/ContenidoEnriquecido';
import { useToast } from '../../components/Feedbacks';
import { Briefcase, Lock, Pencil, Plus, Send, X } from 'lucide-react';
import { ETIQUETA_ESTADO_OFERTA, ETIQUETA_TIPO_EMPLEO, OPCIONES_EXPERIENCIA_REQUERIDA, OPCIONES_FORMACION_REQUERIDA, TIPOS_EMPLEO } from '../../constants';
import { UBICACIONES_OFERTA } from '../../data/ubicaciones';
import {
  TEXTO_MAX, errorApi, esFechaCalendario, excedeLimiteTexto, fechaCalendario, fechaHoyLima, textoEnriquecidoVacio,
} from '../../utils';
import { useAccion } from '../../hooks/useAccion';

// El editor (TiPTap) se carga solo cuando se abre el formulario de oferta.
const EditorTextoEnriquecido = lazy(() => import('../../components/EditorTextoEnriquecido'));

const FORM_VACIO = {
  puesto: '', categoria_id: '', tipo_empleo: '', descripcion: '', funciones: '',
  requisitos: '', formacion_requerida: '', experiencia_requerida: '', ubicacion: '',
  remuneracion: '', vacantes: '', fecha_cierre: '', habilidades: '',
};

export default function Ofertas() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const toast = useToast();
  const { data: ofertas, isLoading } = useQuery({ queryKey: ['ofertas-empresa'], queryFn: listarOfertasEmpresa });
  const { data: categorias } = useQuery({ queryKey: ['categorias'], queryFn: listarCategorias });
  const [editor, setEditor] = useState(() => (location.state?.nueva ? {} : null));
  const [seleccionada, setSeleccionada] = useState(null);

  // Precarga el chunk del editor al entrar a la página: cuando el usuario pulsa
  // "Nueva oferta"/"Editar", TipTap ya está descargado (no engorda el bundle inicial).
  useEffect(() => { import('../../components/EditorTextoEnriquecido'); }, []);

  // La oferta a editar se resuelve antes de montar el editor, para que el RTE
  // reciba el contenido en su creación (nunca se queda sin cargar).
  const inicialEdicion = editor?.id
    ? editor.fila || ofertas?.find((o) => o.id === editor.id) || null
    : null;

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['ofertas-empresa'] });
    queryClient.invalidateQueries({ queryKey: ['oferta-empresa-detalle'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-empresa'] });
  };

  return (
    <div>
      <PageHeader
        titulo="Ofertas laborales"
        descripcion="Registra tus ofertas; la Municipalidad las revisa antes de publicarlas en la bolsa de empleo."
        accion={editor ? (
          <Boton variante="gris" onClick={() => setEditor(null)}>
            <X size={16} aria-hidden="true" />Cancelar
          </Boton>
        ) : (
          <button className="btn btn-primario" type="button" onClick={() => setEditor({})}>
            <Plus size={16} aria-hidden="true" /><span>Nueva oferta</span>
          </button>
        )}
      />

      {isLoading && <EstadoCarga />}

      {editor && (!editor.id || inicialEdicion) && (
        <EditorOferta
          key={editor.id ?? 'nueva'}
          categorias={categorias || []}
          inicial={editor.id ? inicialEdicion : null}
          alGuardar={(mensaje) => {
            setEditor(null);
            toast.success(mensaje);
            refrescar();
          }}
        />
      )}

      {ofertas && ofertas.length > 0 && (
        <div className="list-card">
          <div className="list-card-head">
            <h2>Mis ofertas laborales</h2>
          </div>
          {ofertas.map((o) => (
            <TarjetaRegistro
              key={o.id}
              icono={Briefcase}
              titulo={o.puesto}
              badge={<Estado valor={o.estado_efectivo || o.estado} diccionario={ETIQUETA_ESTADO_OFERTA} />}
              onClick={() => setSeleccionada(o)}
              meta={(
                <>
                  {o.categoria_nombre && <span>{o.categoria_nombre}</span>}
                  {o.tipo_empleo && <span>{ETIQUETA_TIPO_EMPLEO[o.tipo_empleo]}</span>}
                  <span>{o.ubicacion || 'Ubicación no indicada'}</span>
                  <span><b>{o.vacantes}</b> vacante(s)</span>
                  <span>Cierre: {o.fecha_cierre ? fechaCalendario(o.fecha_cierre) : 'sin fecha'}</span>
                </>
              )}
            >
              {o.motivo_rechazo && <div className="oferta-motivo">Motivo de rechazo: {o.motivo_rechazo}</div>}
            </TarjetaRegistro>
          ))}
        </div>
      )}

      {ofertas && ofertas.length === 0 && !editor && (
        <div className="list-card">
          <div className="empty-card">
            <i className="ti ti-briefcase" />
            <p>Aún no registra ofertas. Cree una y envíela a revisión municipal.</p>
          </div>
        </div>
      )}

      <DetalleOferta
        oferta={seleccionada}
        alCerrar={() => setSeleccionada(null)}
        alCambio={(mensaje) => { toast.success(mensaje); setSeleccionada(null); refrescar(); }}
        alEditar={(oferta) => { setSeleccionada(null); setEditor({ id: oferta.id, fila: oferta }); }}
      />
    </div>
  );
}

function DetalleOferta({ oferta, alCerrar, alCambio, alEditar }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());
  const { data: detalle, isLoading } = useQuery({
    queryKey: ['oferta-empresa-detalle', oferta?.id],
    queryFn: () => detalleOfertaEmpresa(oferta.id),
    enabled: Boolean(oferta?.id),
  });

  if (!oferta) return null;
  const o = detalle || oferta;
  const estado = o.estado_efectivo || o.estado;

  const actuar = async (fn, mensaje) => {
    try {
      await ejecutar(fn);
      setError(null);
      alCambio(mensaje);
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const acciones = {
    borrador: (
      <>
        <Boton variante="primario" cargando={enviando} onClick={() => actuar(() => enviarOfertaARevision(oferta.id), 'Oferta enviada a revisión municipal.')}>
          <Send size={16} aria-hidden="true" />Enviar a revisión
        </Boton>
        <Boton variante="gris" onClick={() => alEditar(oferta)}><Pencil size={16} aria-hidden="true" />Editar</Boton>
      </>
    ),
    pendiente: (
      <Boton variante="gris" onClick={() => alEditar(oferta)}><Pencil size={16} aria-hidden="true" />Editar</Boton>
    ),
    observada: (
      <Boton variante="primario" onClick={() => alEditar(oferta)}>
        <Pencil size={16} aria-hidden="true" />Corregir oferta
      </Boton>
    ),
    publicada: (
      <>
        <Boton variante="gris" onClick={() => alEditar(oferta)}><Pencil size={16} aria-hidden="true" />Editar</Boton>
        <Boton variante="peligro" cargando={enviando} onClick={() => actuar(() => cerrarOferta(oferta.id), 'Oferta cerrada.')}>
          <Lock size={16} aria-hidden="true" />Cerrar oferta
        </Boton>
      </>
    ),
    // `rechazada` es terminal: sin acciones de edición ni publicación.
    rechazada: null,
    cerrada: null,
  }[estado] || null;

  return (
    <Modal
      abierto={Boolean(oferta)}
      titulo={o.puesto}
      subtitulo="Detalle de tu oferta laboral"
      alCerrar={alCerrar}
      acciones={acciones}
      tamano="ancho"
    >
      <div className="form-fila" style={{ marginBottom: '0.8rem' }}>
        <Estado valor={estado} diccionario={ETIQUETA_ESTADO_OFERTA} />
        {estado === 'pendiente' && <span style={{ color: 'var(--amber-tx)', fontSize: '0.85rem' }}>En revisión municipal: aún no es visible para los postulantes.</span>}
        {estado === 'publicada' && <span style={{ color: 'var(--green-tx)', fontSize: '0.85rem' }}>Publicada: visible para los postulantes.</span>}
        {estado === 'vencida' && <span style={{ color: 'var(--amber-tx)', fontSize: '0.85rem' }}>Vencida: el plazo de postulación terminó. Se conserva el historial y ya no admite nuevas postulaciones.</span>}
        {estado === 'observada' && <span style={{ color: 'var(--blue-tx)', fontSize: '0.85rem' }}>Observada: la Municipalidad solicitó correcciones. Corrige y guarda; la oferta volverá a revisión y NO se publica automáticamente.</span>}
        {estado === 'rechazada' && <span style={{ color: 'var(--red-tx)', fontSize: '0.85rem' }}>Rechazada: la oferta está bloqueada para edición y publicación.</span>}
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
        ]}
      />

      {o.observacion && (
        <div className="modal-seccion">
          <h3>Observaciones de la Municipalidad</h3>
          <p className="modal-texto" style={{ color: 'var(--blue-tx)' }}>{o.observacion}</p>
        </div>
      )}
      {o.motivo_rechazo && (
        <div className="modal-seccion">
          <h3>Motivo de rechazo</h3>
          <p className="modal-texto" style={{ color: 'var(--red-tx)' }}>{o.motivo_rechazo}</p>
        </div>
      )}
      {o.descripcion && (
        <div className="modal-seccion">
          <h3>Descripción del puesto</h3>
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

function EditorOferta({ categorias, inicial, alGuardar }) {
  const esNueva = !inicial;
  const [form, setForm] = useState(() =>
    esNueva
      ? FORM_VACIO
      : {
          puesto: inicial.puesto, categoria_id: inicial.categoria_id || '', tipo_empleo: inicial.tipo_empleo || '',
          descripcion: inicial.descripcion || '', funciones: inicial.funciones || '', requisitos: inicial.requisitos || '',
          formacion_requerida: inicial.formacion_requerida || '', experiencia_requerida: inicial.experiencia_requerida || '',
          ubicacion: inicial.ubicacion || '', remuneracion: inicial.remuneracion || '', vacantes: inicial.vacantes ?? '',
          fecha_cierre: inicial.fecha_cierre || '', habilidades: (inicial.habilidades || []).join(', '),
        },
  );
  const [error, setError] = useState(null);
  const [errores, setErrores] = useState({});
  const guardando = useRef(false);
  const { ejecutar, enviando } = useAccion(() => (esNueva ? crearOferta(convertir(form)) : actualizarOferta(inicial.id, convertir(form))));

  const set = (k) => (e) => {
    const { value } = e.target;
    setForm((previo) => ({ ...previo, [k]: value }));
    setErrores((previo) => (previo[k] ? { ...previo, [k]: '' } : previo));
    setError(null);
  };

  // Si una oferta anterior guarda un valor fuera de las opciones actuales, se
  // agrega como opción para no perder el dato al editarla.
  const lista = (opciones, actual) => (actual && !opciones.includes(actual) ? [...opciones, actual] : opciones);
  const ubicaciones = lista(UBICACIONES_OFERTA, form.ubicacion);
  const formaciones = lista(OPCIONES_FORMACION_REQUERIDA, form.formacion_requerida);
  const experiencias = lista(OPCIONES_EXPERIENCIA_REQUERIDA, form.experiencia_requerida);

  // En creación todos los campos de negocio son obligatorios. En edición se
  // exige el contenido que ya existía, pero se permite conservar campos
  // históricos vacíos (p. ej. fecha_cierre NULL) sin inventar datos.
  const obligatorio = (campo) => esNueva || Boolean(inicial?.[campo]);

  const guardar = async () => {
    const nuevos = {};
    const marcar = (campo, mensaje) => { nuevos[campo] = nuevos[campo] || mensaje; };
    const vacio = (valor) => String(valor ?? '').trim() === '';
    const habilidades = form.habilidades.split(',').map((h) => h.trim()).filter(Boolean);
    const ubicacionPermitida = UBICACIONES_OFERTA.includes(form.ubicacion)
      || (!esNueva && form.ubicacion === (inicial?.ubicacion || ''));
    const formacionPermitida = OPCIONES_FORMACION_REQUERIDA.includes(form.formacion_requerida)
      || (!esNueva && form.formacion_requerida === (inicial?.formacion_requerida || ''));
    const experienciaPermitida = OPCIONES_EXPERIENCIA_REQUERIDA.includes(form.experiencia_requerida)
      || (!esNueva && form.experiencia_requerida === (inicial?.experiencia_requerida || ''));

    if (obligatorio('puesto') && vacio(form.puesto)) marcar('puesto', 'Ingresa el puesto de trabajo.');
    if (obligatorio('categoria_id') && vacio(form.categoria_id)) {
      marcar('categoria_id', 'Selecciona una categoría.');
    } else if (form.categoria_id && !categorias.some((c) => String(c.id) === String(form.categoria_id))) {
      marcar('categoria_id', 'Selecciona una categoría válida.');
    }
    if ((obligatorio('tipo_empleo') || form.tipo_empleo) && !TIPOS_EMPLEO.includes(form.tipo_empleo)) {
      marcar('tipo_empleo', 'Selecciona el tipo de empleo.');
    }
    if ((obligatorio('ubicacion') || form.ubicacion) && !ubicacionPermitida) {
      marcar('ubicacion', 'Selecciona una ubicación válida.');
    }
    if (obligatorio('vacantes') || form.vacantes !== '') {
      const vacantes = Number(form.vacantes);
      if (!Number.isInteger(vacantes) || vacantes < 1) {
        marcar('vacantes', vacio(form.vacantes) ? 'Indica el número de vacantes.' : 'Ingresa un número entero de vacantes mayor o igual a 1.');
      }
    }
    if (obligatorio('remuneracion') || form.remuneracion !== '') {
      if (vacio(form.remuneracion)) {
        marcar('remuneracion', 'Ingresa el salario.');
      } else if (!/^\d{1,10}(\.\d{1,2})?$/.test(String(form.remuneracion))) {
        marcar('remuneracion', 'Ingresa un salario válido, sin negativos y con hasta dos decimales.');
      }
    }
    if ((obligatorio('formacion_requerida') || form.formacion_requerida) && !formacionPermitida) {
      marcar('formacion_requerida', 'Selecciona la formación requerida.');
    }
    if ((obligatorio('experiencia_requerida') || form.experiencia_requerida) && !experienciaPermitida) {
      marcar('experiencia_requerida', 'Selecciona la experiencia requerida.');
    }
    if (obligatorio('fecha_cierre') || form.fecha_cierre) {
      if (vacio(form.fecha_cierre)) {
        marcar('fecha_cierre', 'Selecciona la fecha de cierre.');
      } else if (!esFechaCalendario(form.fecha_cierre)) {
        marcar('fecha_cierre', 'Ingresa una fecha de cierre válida.');
      } else if (form.fecha_cierre < fechaHoyLima()) {
        marcar('fecha_cierre', 'La fecha de cierre no puede ser anterior a hoy.');
      }
    }
    if ((obligatorio('habilidades') || !vacio(form.habilidades)) && habilidades.length === 0) {
      marcar('habilidades', 'Agrega al menos una habilidad.');
    }
    if (obligatorio('descripcion') && textoEnriquecidoVacio(form.descripcion)) {
      marcar('descripcion', 'Escribe la descripción del puesto.');
    }
    if (obligatorio('funciones') && textoEnriquecidoVacio(form.funciones)) {
      marcar('funciones', 'Describe las funciones del puesto.');
    }
    if (obligatorio('requisitos') && textoEnriquecidoVacio(form.requisitos)) {
      marcar('requisitos', 'Escribe los requisitos del puesto.');
    }

    // Mismo límite que el backend: 10.000 caracteres de TEXTO visible.
    const excedidos = [
      ['Descripción', 'descripcion', form.descripcion],
      ['Funciones', 'funciones', form.funciones],
      ['Requisitos', 'requisitos', form.requisitos],
    ].filter(([, , texto]) => excedeLimiteTexto(texto));
    for (const [nombre, campo] of excedidos) {
      marcar(campo, `El texto de ${nombre} supera el límite de ${TEXTO_MAX} caracteres.`);
    }

    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      setError('Revisa los campos marcados en el formulario.');
      // Lleva el foco al primer campo inválido (incluye el editor enriquecido).
      requestAnimationFrame(() => {
        const primero = document.querySelector('.campo-error input, .campo-error select, .rte-error [contenteditable="true"]');
        primero?.focus?.();
        primero?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      });
      return;
    }

    setErrores({});
    setError(null);
    if (guardando.current) return; // evita envíos duplicados por doble clic
    guardando.current = true;
    try {
      await ejecutar();
      alGuardar(esNueva ? 'Oferta guardada y enviada a revisión municipal.' : 'Cambios guardados.');
    } catch (e) {
      const det = e?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(e));
    } finally {
      guardando.current = false;
    }
  };

  const setRte = (campo) => (html) => {
    setForm((previo) => ({ ...previo, [campo]: html }));
    setErrores((previo) => (previo[campo] ? { ...previo, [campo]: '' } : previo));
    setError(null);
  };

  return (
    <div className="list-card">
      <div className="list-card-head">
        <h2>{esNueva ? 'Nueva oferta (se envía a revisión municipal)' : `Editar oferta: ${inicial.puesto}`}</h2>
      </div>
      <Mensaje>{error}</Mensaje>
      <div className="form-malla">
        <Campo etiqueta="Puesto *" required value={form.puesto} onChange={set('puesto')} error={errores.puesto} />
        <Selecto etiqueta="Categoría *" required value={form.categoria_id} onChange={set('categoria_id')} error={errores.categoria_id}>
          <option value="">Selecciona una categoría</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Selecto>
        <Selecto etiqueta="Tipo de empleo *" required value={form.tipo_empleo} onChange={set('tipo_empleo')} error={errores.tipo_empleo}>
          <option value="">Selecciona…</option>
          {TIPOS_EMPLEO.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_EMPLEO[t]}</option>)}
        </Selecto>
        <Selecto etiqueta="Ubicación / lugar de trabajo *" required value={form.ubicacion} onChange={set('ubicacion')} error={errores.ubicacion}>
          <option value="">Selecciona una ubicación</option>
          {ubicaciones.map((v) => <option key={v} value={v}>{v}</option>)}
        </Selecto>
        <Campo etiqueta="Número de vacantes *" required type="number" min="1" step="1" value={form.vacantes} onChange={set('vacantes')} error={errores.vacantes} />
        <Campo etiqueta="Salario (S/) *" required type="number" min="0" step="0.01" inputMode="decimal" value={form.remuneracion} onChange={set('remuneracion')} error={errores.remuneracion} />
        <Selecto etiqueta="Formación requerida *" required value={form.formacion_requerida} onChange={set('formacion_requerida')} error={errores.formacion_requerida}>
          <option value="">Selecciona…</option>
          {formaciones.map((v) => <option key={v} value={v}>{v}</option>)}
        </Selecto>
        <Selecto etiqueta="Experiencia requerida *" required value={form.experiencia_requerida} onChange={set('experiencia_requerida')} error={errores.experiencia_requerida}>
          <option value="">Selecciona…</option>
          {experiencias.map((v) => <option key={v} value={v}>{v}</option>)}
        </Selecto>
        <Campo etiqueta="Fecha de cierre *" required type="date" min={fechaHoyLima()} value={form.fecha_cierre} onChange={set('fecha_cierre')} error={errores.fecha_cierre} />
        <Campo etiqueta="Habilidades (separadas por coma) *" required value={form.habilidades} onChange={set('habilidades')} error={errores.habilidades} />
      </div>
      <Suspense fallback={<p className="vacio">Cargando editor…</p>}>
        <EditorTextoEnriquecido
          etiqueta="Descripción del puesto *"
          valor={form.descripcion}
          onChange={setRte('descripcion')}
          error={errores.descripcion}
          placeholder="Describe el puesto, el equipo y el contexto del trabajo…"
        />
        <EditorTextoEnriquecido
          etiqueta="Funciones *"
          valor={form.funciones}
          onChange={setRte('funciones')}
          error={errores.funciones}
          placeholder="Enumera las funciones del puesto (puedes usar viñetas)…"
        />
        <EditorTextoEnriquecido
          etiqueta="Requisitos *"
          valor={form.requisitos}
          onChange={setRte('requisitos')}
          error={errores.requisitos}
          placeholder="Enumera los requisitos (puedes usar viñetas)…"
        />
      </Suspense>
      <div className="form-fila">
        <Boton variante="primario" cargando={enviando} onClick={guardar}>{esNueva ? 'Enviar a revisión' : 'Guardar cambios'}</Boton>
        {!esNueva && (inicial.estado_efectivo || inicial.estado) === 'publicada' && <span style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>Al guardar, la oferta volverá a revisión municipal.</span>}
      </div>
    </div>
  );
}

function convertir(form) {
  return {
    ...form,
    categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
    vacantes: Number(form.vacantes),
    remuneracion: form.remuneracion || null,
    fecha_cierre: form.fecha_cierre || null,
    habilidades: form.habilidades.split(',').map((h) => h.trim()).filter(Boolean),
  };
}
