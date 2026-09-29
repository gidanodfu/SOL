// SPDX-License-Identifier: MIT
import { lazy, Suspense, useState } from 'react';
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
import { Briefcase, Lock, Pencil, Plus, Send, X } from 'lucide-react';
import { ETIQUETA_ESTADO_OFERTA, ETIQUETA_TIPO_EMPLEO, OPCIONES_EXPERIENCIA_REQUERIDA, OPCIONES_FORMACION_REQUERIDA, TIPOS_EMPLEO } from '../../constants';
import { TEXTO_MAX, errorApi, excedeLimiteTexto, fechaCalendario } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

// El editor (TiPTap) se carga solo cuando se abre el formulario de oferta.
const EditorTextoEnriquecido = lazy(() => import('../../components/EditorTextoEnriquecido'));

const FORM_VACIO = {
  puesto: '', categoria_id: '', tipo_empleo: 'tiempo_completo', descripcion: '', funciones: '',
  requisitos: '', formacion_requerida: '', experiencia_requerida: '', ubicacion: '',
  remuneracion: '', vacantes: 1, fecha_cierre: '', habilidades: '',
};

export default function Ofertas() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { data: ofertas, isLoading } = useQuery({ queryKey: ['ofertas-empresa'], queryFn: listarOfertasEmpresa });
  const { data: categorias } = useQuery({ queryKey: ['categorias'], queryFn: listarCategorias });
  const [editor, setEditor] = useState(() => (location.state?.nueva ? {} : null));
  const [seleccionada, setSeleccionada] = useState(null);
  const [nota, setNota] = useState(null);

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

      <Mensaje tipo="exito">{nota}</Mensaje>
      {isLoading && <EstadoCarga />}

      {editor && (
        <EditorOferta
          categorias={categorias || []}
          inicial={editor.id ? ofertas?.find((o) => o.id === editor.id) : null}
          alGuardar={(mensaje) => {
            setEditor(null);
            setNota(mensaje);
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
              badge={<Estado valor={o.estado} diccionario={ETIQUETA_ESTADO_OFERTA} />}
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
        alCambio={(mensaje) => { setNota(mensaje); setSeleccionada(null); refrescar(); }}
        alEditar={(oferta) => { setSeleccionada(null); setEditor({ id: oferta.id }); }}
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
    rechazada: (
      <>
        <Boton variante="gris" onClick={() => alEditar(oferta)}><Pencil size={16} aria-hidden="true" />Editar</Boton>
        <Boton variante="primario" cargando={enviando} onClick={() => actuar(() => enviarOfertaARevision(oferta.id), 'Oferta reenviada a revisión municipal.')}>
          <Send size={16} aria-hidden="true" />Reenviar a revisión
        </Boton>
      </>
    ),
    publicada: (
      <>
        <Boton variante="gris" onClick={() => alEditar(oferta)}><Pencil size={16} aria-hidden="true" />Editar</Boton>
        <Boton variante="peligro" cargando={enviando} onClick={() => actuar(() => cerrarOferta(oferta.id), 'Oferta cerrada.')}>
          <Lock size={16} aria-hidden="true" />Cerrar oferta
        </Boton>
      </>
    ),
    cerrada: null,
  }[o.estado] || null;

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
        <Estado valor={o.estado} diccionario={ETIQUETA_ESTADO_OFERTA} />
        {o.estado === 'pendiente' && <span style={{ color: 'var(--amber-tx)', fontSize: '0.85rem' }}>En revisión municipal: aún no es visible para los postulantes.</span>}
        {o.estado === 'publicada' && <span style={{ color: 'var(--green-tx)', fontSize: '0.85rem' }}>Publicada: visible para los postulantes.</span>}
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
          puesto: inicial.puesto, categoria_id: inicial.categoria_id || '', tipo_empleo: inicial.tipo_empleo || 'tiempo_completo',
          descripcion: inicial.descripcion || '', funciones: inicial.funciones || '', requisitos: inicial.requisitos || '',
          formacion_requerida: inicial.formacion_requerida || '', experiencia_requerida: inicial.experiencia_requerida || '',
          ubicacion: inicial.ubicacion || '', remuneracion: inicial.remuneracion || '', vacantes: inicial.vacantes,
          fecha_cierre: inicial.fecha_cierre || '', habilidades: (inicial.habilidades || []).join(', '),
        },
  );
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(() => (esNueva ? crearOferta(convertir(form)) : actualizarOferta(inicial.id, convertir(form))));

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Si una oferta anterior guarda un texto fuera de las opciones actuales, se
  // agrega como opción para no perder el valor al editarla.
  const lista = (opciones, actual) => (actual && !opciones.includes(actual) ? [...opciones, actual] : opciones);
  const formaciones = lista(OPCIONES_FORMACION_REQUERIDA, form.formacion_requerida);
  const experiencias = lista(OPCIONES_EXPERIENCIA_REQUERIDA, form.experiencia_requerida);

  const guardar = async () => {
    // Mismo límite que el backend: 10.000 caracteres de TEXTO visible.
    const excedidos = [
      ['Descripción', form.descripcion],
      ['Funciones', form.funciones],
      ['Requisitos', form.requisitos],
    ].filter(([, texto]) => excedeLimiteTexto(texto));

    if (excedidos.length > 0) {
      setError(`El texto de ${excedidos.map(([nombre]) => nombre).join(', ')} supera el límite de ${TEXTO_MAX} caracteres.`);
      return;
    }

    try {
      await ejecutar();
      alGuardar(esNueva ? 'Oferta guardada y enviada a revisión municipal.' : 'Cambios guardados.');
    } catch (e) {
      const det = e?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(e));
    }
  };

  const setRte = (campo) => (html) => setForm((previo) => ({ ...previo, [campo]: html }));

  return (
    <div className="list-card">
      <div className="list-card-head">
        <h2>{esNueva ? 'Nueva oferta (se envía a revisión municipal)' : `Editar oferta: ${inicial.puesto}`}</h2>
      </div>
      <Mensaje>{error}</Mensaje>
      <div className="form-malla">
        <Campo etiqueta="Puesto *" value={form.puesto} onChange={set('puesto')} />
        <Selecto etiqueta="Categoría" value={form.categoria_id} onChange={set('categoria_id')}>
          <option value="">Sin categoría</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Selecto>
        <Selecto etiqueta="Tipo de empleo" value={form.tipo_empleo} onChange={set('tipo_empleo')}>
          {TIPOS_EMPLEO.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_EMPLEO[t]}</option>)}
        </Selecto>
        <Campo etiqueta="Ubicación / lugar de trabajo" value={form.ubicacion} onChange={set('ubicacion')} />
        <Campo etiqueta="Número de vacantes *" type="number" min="1" value={form.vacantes} onChange={set('vacantes')} />
        <Campo etiqueta="Salario (S/, opcional)" type="number" value={form.remuneracion} onChange={set('remuneracion')} />
        <Selecto etiqueta="Formación requerida" value={form.formacion_requerida} onChange={set('formacion_requerida')}>
          <option value="">Seleccione…</option>
          {formaciones.map((v) => <option key={v} value={v}>{v}</option>)}
        </Selecto>
        <Selecto etiqueta="Experiencia requerida" value={form.experiencia_requerida} onChange={set('experiencia_requerida')}>
          <option value="">Seleccione…</option>
          {experiencias.map((v) => <option key={v} value={v}>{v}</option>)}
        </Selecto>
        <Campo etiqueta="Fecha de cierre" type="date" value={form.fecha_cierre} onChange={set('fecha_cierre')} />
        <Campo etiqueta="Habilidades (separadas por coma)" value={form.habilidades} onChange={set('habilidades')} />
      </div>
      <Suspense fallback={<p className="vacio">Cargando editor…</p>}>
        <EditorTextoEnriquecido
          etiqueta="Descripción del puesto"
          valor={form.descripcion}
          onChange={setRte('descripcion')}
          placeholder="Describe el puesto, el equipo y el contexto del trabajo…"
        />
        <EditorTextoEnriquecido
          etiqueta="Funciones"
          valor={form.funciones}
          onChange={setRte('funciones')}
          placeholder="Enumera las funciones del puesto (puedes usar viñetas)…"
        />
        <EditorTextoEnriquecido
          etiqueta="Requisitos"
          valor={form.requisitos}
          onChange={setRte('requisitos')}
          placeholder="Enumera los requisitos (puedes usar viñetas)…"
        />
      </Suspense>
      <div className="form-fila">
        <Boton variante="primario" cargando={enviando} onClick={guardar}>{esNueva ? 'Enviar a revisión' : 'Guardar cambios'}</Boton>
        {!esNueva && inicial.estado === 'publicada' && <span style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>Al guardar, la oferta volverá a revisión municipal.</span>}
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
