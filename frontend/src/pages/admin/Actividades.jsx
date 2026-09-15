import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { actualizarActividad, cambiarEstadoActividad, crearActividad, listarActividadesAdmin } from '../../services/divulgacion';
import { EstadoCarga, Boton, Campo, Estado, ListaVacia, Mensaje, Selecto, Tarjeta } from '../../components/UI';
import {
  ESTADOS_ACTIVIDAD, ETIQUETA_ESTADO_ACTIVIDAD, ETIQUETA_TIPO_ACTIVIDAD,
  MODALIDADES_ACTIVIDAD, TIPOS_ACTIVIDAD,
} from '../../constants';
import { errorApi, fechaHora } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

const aLocal = (v) => (v ? String(v).slice(0, 16).replace(' ', 'T') : '');
const VACIO = { tipo: 'taller', nombre: '', descripcion: '', fecha_inicio: '', fecha_fin: '', lugar: '', modalidad: 'presencial', organizador: '' };

export default function Actividades() {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState({ tipo: '', estado: '' });
  const [editor, setEditor] = useState(null);
  const [nota, setNota] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['actividades-admin', filtros],
    queryFn: () => listarActividadesAdmin(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v))),
  });

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
        <Mensaje tipo="exito">{nota}</Mensaje>
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

      {editor && (
        <EditorActividad
          inicial={editor.id ? editor.fila : null}
          alGuardar={() => { setEditor(null); setNota('Actividad guardada.'); refrescar(); }}
        />
      )}

      {data && data.length > 0 && (
        <Tarjeta>
          {data.map((a) => (
            <FilaActividad key={a.id} actividad={a} alCambio={refrescar} alEditar={() => setEditor({ id: a.id, fila: a })} />
          ))}
        </Tarjeta>
      )}
    </div>
  );
}

function FilaActividad({ actividad, alCambio, alEditar }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  const cambiar = async (estado) => {
    try {
      await ejecutar(() => cambiarEstadoActividad(actividad.id, estado));
      setError(null);
      alCambio();
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
    <div style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: '0.8rem 1rem', marginBottom: '0.7rem' }}>
      <div className="form-fila" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{actividad.nombre}</strong>
          <div style={{ color: 'var(--gris)', fontSize: '0.85rem' }}>
            {ETIQUETA_TIPO_ACTIVIDAD[actividad.tipo]} · {fechaHora(actividad.fecha_inicio)}
            {actividad.lugar ? ` · ${actividad.lugar}` : ''} · {actividad.organizador || 'MDJLO'}
          </div>
        </div>
        <Estado valor={actividad.estado} diccionario={ETIQUETA_ESTADO_ACTIVIDAD} />
      </div>
      <Mensaje>{error}</Mensaje>
      <div className="acciones">
        <Boton variante="gris" onClick={alEditar}>Editar</Boton>
        {proximos.map((s) => (
          <Boton key={s} variante={s === 'cancelado' ? 'peligro' : s === 'finalizado' ? 'gris' : 'primario'} cargando={enviando} onClick={() => cambiar(s)}>
            {s === 'finalizado' ? 'Finalizar' : s === 'cancelado' ? 'Cancelar' : ETIQUETA_ESTADO_ACTIVIDAD[s]}
          </Boton>
        ))}
      </div>
    </div>
  );
}

function EditorActividad({ inicial, alGuardar }) {
  const [form, setForm] = useState(() =>
    inicial
      ? {
          tipo: inicial.tipo, nombre: inicial.nombre, descripcion: inicial.descripcion || '',
          fecha_inicio: aLocal(inicial.fecha_inicio), fecha_fin: aLocal(inicial.fecha_fin),
          lugar: inicial.lugar || '', modalidad: inicial.modalidad || 'presencial', organizador: inicial.organizador || '',
        }
      : VACIO,
  );
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(() => (inicial ? actualizarActividad(inicial.id, convertir(form)) : crearActividad(convertir(form))));

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const guardar = async () => {
    try {
      await ejecutar();
      alGuardar();
    } catch (e) {
      const det = e?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(e));
    }
  };

  return (
    <Tarjeta titulo={inicial ? 'Editar actividad' : 'Nueva actividad'}>
      <Mensaje>{error}</Mensaje>
      <div className="form-malla">
        <Selecto etiqueta="Tipo *" value={form.tipo} onChange={set('tipo')}>
          {TIPOS_ACTIVIDAD.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_ACTIVIDAD[t]}</option>)}
        </Selecto>
        <Campo etiqueta="Nombre *" value={form.nombre} onChange={set('nombre')} />
        <Campo etiqueta="Inicio *" type="datetime-local" value={form.fecha_inicio} onChange={set('fecha_inicio')} />
        <Campo etiqueta="Fin" type="datetime-local" value={form.fecha_fin} onChange={set('fecha_fin')} />
        <Campo etiqueta="Lugar" value={form.lugar} onChange={set('lugar')} />
        <Selecto etiqueta="Modalidad" value={form.modalidad} onChange={set('modalidad')}>
          {MODALIDADES_ACTIVIDAD.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
        </Selecto>
        <Campo etiqueta="Organizador" value={form.organizador} onChange={set('organizador')} />
      </div>
      <label className="campo"><span>Descripción</span><textarea rows="2" value={form.descripcion} onChange={set('descripcion')} /></label>
      <Boton variante="primario" cargando={enviando} onClick={guardar}>Guardar</Boton>
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
