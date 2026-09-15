import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { actualizarOportunidad, cambiarActivacionOportunidad, crearOportunidad, listarOportunidadesAdmin } from '../../services/divulgacion';
import { EstadoCarga, Boton, Campo, Estado, ListaVacia, Mensaje, Selecto, Tarjeta } from '../../components/UI';
import { ETIQUETA_FUENTE_OPORTUNIDAD, FUENTES_OPORTUNIDAD } from '../../constants';
import { errorApi, fecha } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

const VACIO = { fuente: 'empleos_peru', titulo: '', descripcion: '', enlace: '', fecha_publicacion: '' };

export default function Oportunidades() {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState({ fuente: '' });
  const [editor, setEditor] = useState(null);
  const [nota, setNota] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['oportunidades-admin', filtros],
    queryFn: () => listarOportunidadesAdmin(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v))),
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['oportunidades-admin'] });

  return (
    <div>
      <Tarjeta
        titulo="Difusión de oportunidades (Empleos Perú / MYPE)"
        acciones={
          <Boton variante="acento" onClick={() => setEditor(editor ? null : {})}>
            {editor ? 'Cancelar' : 'Nueva oportunidad'}
          </Boton>
        }
      >
        <Mensaje tipo="exito">{nota}</Mensaje>
        <Selecto etiqueta="" value={filtros.fuente} onChange={(e) => setFiltros({ ...filtros, fuente: e.target.value })}>
          <option value="">Todas las fuentes</option>
          {FUENTES_OPORTUNIDAD.map((f) => <option key={f} value={f}>{ETIQUETA_FUENTE_OPORTUNIDAD[f]}</option>)}
        </Selecto>
        {isLoading && <EstadoCarga />}
        {data && data.length === 0 && <ListaVacia />}
      </Tarjeta>

      {editor && (
        <EditorOportunidad
          inicial={editor.id ? editor.fila : null}
          alGuardar={() => { setEditor(null); setNota('Oportunidad guardada.'); refrescar(); }}
        />
      )}

      {data && data.length > 0 && (
        <Tarjeta>
          {data.map((o) => (
            <FilaOportunidad key={o.id} o={o} alCambio={refrescar} alEditar={() => setEditor({ id: o.id, fila: o })} />
          ))}
        </Tarjeta>
      )}
    </div>
  );
}

function FilaOportunidad({ o, alCambio, alEditar }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  const alternar = async () => {
    try {
      await ejecutar(() => cambiarActivacionOportunidad(o.id, !o.activo));
      setError(null);
      alCambio();
    } catch (e) {
      setError(errorApi(e));
    }
  };

  return (
    <div style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: '0.8rem 1rem', marginBottom: '0.7rem' }}>
      <div className="form-fila" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{o.titulo}</strong>
          <div style={{ color: 'var(--gris)', fontSize: '0.85rem' }}>
            {ETIQUETA_FUENTE_OPORTUNIDAD[o.fuente]}{o.razon_social ? ` · ${o.razon_social}` : ''} · publicada el {fecha(o.fecha_publicacion)}
          </div>
          {o.enlace && <a className="enlace" href={o.enlace} target="_blank" rel="noreferrer">Ver convocatoria original →</a>}
        </div>
        <Estado valor={o.activo ? 'activo1' : 'inactivo'} diccionario={{ activo1: 'Visible', inactivo: 'Oculta' }} />
      </div>
      <Mensaje>{error}</Mensaje>
      <div className="acciones">
        <Boton variante="gris" onClick={alEditar}>Editar</Boton>
        <Boton variante={o.activo ? 'peligro' : 'exito'} cargando={enviando} onClick={alternar}>
          {o.activo ? 'Ocultar' : 'Publicar'}
        </Boton>
      </div>
    </div>
  );
}

function EditorOportunidad({ inicial, alGuardar }) {
  const [form, setForm] = useState(() =>
    inicial
      ? { fuente: inicial.fuente, titulo: inicial.titulo, descripcion: inicial.descripcion || '', enlace: inicial.enlace || '', fecha_publicacion: inicial.fecha_publicacion || '' }
      : VACIO,
  );
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(() => (inicial ? actualizarOportunidad(inicial.id, form) : crearOportunidad(form)));

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
    <Tarjeta titulo={inicial ? 'Editar oportunidad' : 'Nueva oportunidad'}>
      <Mensaje>{error}</Mensaje>
      <div className="form-malla">
        <Selecto etiqueta="Fuente *" value={form.fuente} onChange={set('fuente')}>
          {FUENTES_OPORTUNIDAD.map((f) => <option key={f} value={f}>{ETIQUETA_FUENTE_OPORTUNIDAD[f]}</option>)}
        </Selecto>
        <Campo etiqueta="Título *" value={form.titulo} onChange={set('titulo')} />
        <Campo etiqueta="Enlace (URL de la convocatoria)" value={form.enlace} onChange={set('enlace')} />
        <Campo etiqueta="Fecha de publicación" type="date" value={form.fecha_publicacion} onChange={set('fecha_publicacion')} />
      </div>
      <label className="campo"><span>Descripción</span><textarea rows="3" value={form.descripcion} onChange={set('descripcion')} /></label>
      <Boton variante="primario" cargando={enviando} onClick={guardar}>Guardar</Boton>
    </Tarjeta>
  );
}
