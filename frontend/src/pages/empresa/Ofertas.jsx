// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  actualizarOferta, cerrarOferta, crearOferta, listarOfertasEmpresa, publicarOferta,
} from '../../services/ofertas';
import { listarCategorias } from '../../services/categorias';
import { EstadoCarga, Boton, Campo, Estado, Mensaje, Selecto } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import { ETIQUETA_ESTADO_OFERTA, ETIQUETA_TIPO_EMPLEO, OPCIONES_EXPERIENCIA_REQUERIDA, OPCIONES_FORMACION_REQUERIDA, TIPOS_EMPLEO } from '../../constants';
import { errorApi, fechaCalendario } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

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
  const [nota, setNota] = useState(null);

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['ofertas-empresa'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-empresa'] });
  };

  return (
    <div>
      <PageHeader
        titulo="Ofertas laborales"
        descripcion="Registra tus ofertas y publícalas directamente; no requieren revisión municipal."
        accion={editor ? (
          <Boton variante="gris" onClick={() => setEditor(null)}>
            <i className="ti ti-x" />Cancelar
          </Boton>
        ) : (
          <button className="btn btn-primario" type="button" onClick={() => setEditor({})}>
            <i className="ti ti-plus" /><span>Nueva oferta</span>
          </button>
        )}
      />

      <Mensaje tipo="exito">{nota}</Mensaje>
      {isLoading && <EstadoCarga />}

      {editor && (
        <EditorOferta
          categorias={categorias || []}
          inicial={editor.id ? ofertas?.find((o) => o.id === editor.id) : null}
          alGuardar={() => {
            setEditor(null);
            setNota('Oferta guardada. Cuando esté lista, publíquela desde la lista de ofertas.');
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
            <OfertaFila
              key={o.id}
              oferta={o}
              alAccion={() => { setNota(null); refrescar(); }}
              alEditar={() => setEditor({ id: o.id })}
            />
          ))}
        </div>
      )}

      {ofertas && ofertas.length === 0 && !editor && (
        <div className="list-card">
          <div className="empty-card">
            <i className="ti ti-briefcase" />
            <p>Aún no registra ofertas. Cree una y publíquela para que los postulantes puedan verla.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function OfertaFila({ oferta, alAccion, alEditar }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  const actuar = async (fn, okMsg) => {
    try {
      await ejecutar(fn);
      alAccion();
      if (okMsg) window.alert(okMsg);
    } catch (e) {
      setError(errorApi(e));
    }
  };

  return (
    <div className="oferta-item">
      <div className="oferta-cabeza">
        <div className="oferta-titulo">
          <h3>{oferta.puesto}</h3>
          <Estado valor={oferta.estado} diccionario={ETIQUETA_ESTADO_OFERTA} />
        </div>
      </div>
      <div className="oferta-meta">
        {oferta.categoria_nombre && <span>{oferta.categoria_nombre}</span>}
        {oferta.tipo_empleo && <span>{ETIQUETA_TIPO_EMPLEO[oferta.tipo_empleo]}</span>}
        <span>{oferta.ubicacion || 'Ubicación no indicada'}</span>
        <span><b>{oferta.vacantes}</b> vacante(s)</span>
      </div>
      <div className="oferta-cierre" style={{ marginTop: '4px' }}>
        Cierre: {oferta.fecha_cierre ? fechaCalendario(oferta.fecha_cierre) : 'sin fecha'}
      </div>
      {oferta.motivo_rechazo && <div className="oferta-motivo">Motivo de rechazo: {oferta.motivo_rechazo}</div>}
      <Mensaje>{error}</Mensaje>
      <div className="oferta-acciones" style={{ marginTop: '12px' }}>
        {oferta.estado === 'borrador' && (
          <>
            <Boton variante="primario" cargando={enviando} onClick={() => actuar(() => publicarOferta(oferta.id), 'Oferta publicada. Ya está disponible para los postulantes.')}>Publicar</Boton>
            <Boton variante="gris" onClick={alEditar}>Editar</Boton>
          </>
        )}
        {oferta.estado === 'publicada' && (
          <>
            <Boton variante="gris" onClick={alEditar}>Editar</Boton>
            <Boton variante="peligro" cargando={enviando} onClick={() => actuar(() => cerrarOferta(oferta.id), 'Oferta cerrada.')}>Cerrar oferta</Boton>
          </>
        )}
        {oferta.estado === 'cerrada' && (
          <span style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Oferta finalizada.</span>
        )}
      </div>
    </div>
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
    try {
      await ejecutar();
      alGuardar();
    } catch (e) {
      const det = e?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(e));
    }
  };


  const autoResize = (e) => {
  e.target.style.height = 'auto';
  e.target.style.height = `${e.target.scrollHeight}px`;
};

  return (
    <div className="list-card">
      <div className="list-card-head">
        <h2>{esNueva ? 'Nueva oferta (se guarda en borrador)' : `Editar oferta: ${inicial.puesto}`}</h2>
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
      <label className="campo"><span>Descripción del puesto</span><textarea rows="3" value={form.descripcion} onChange={(e) => {
      set('descripcion')(e);
      autoResize(e);
    }} /></label>
      <label className="campo"><span>Funciones</span><textarea rows="3" value={form.funciones} onChange={(e) => {
      set('funciones')(e);
      autoResize(e);
    }} /></label>
      <label className="campo"><span>Requisitos</span><textarea rows="3" value={form.requisitos} onChange={(e) => {
      set('requisitos')(e);
      autoResize(e);
    }} /></label>
      <div className="form-fila">
        <Boton variante="primario" cargando={enviando} onClick={guardar}>{esNueva ? 'Guardar borrador' : 'Guardar cambios'}</Boton>
        {!esNueva && inicial.estado === 'publicada' && <span style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>Al guardar la oferta se mantendrá publicada.</span>}
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
