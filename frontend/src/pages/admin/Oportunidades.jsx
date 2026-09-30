// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { actualizarOportunidad, cambiarActivacionOportunidad, crearOportunidad, listarOportunidadesAdmin } from '../../services/divulgacion';
import { EstadoCarga, Boton, Campo, ListaVacia, Mensaje, Selecto, Tarjeta } from '../../components/UI';
import TarjetaRegistro from '../../components/TarjetaRegistro';
import Modal from '../../components/Modal';
import FichaDatos from '../../components/FichaDatos';
import { useToast } from '../../components/Feedbacks';
import { ExternalLink, EyeOff, Megaphone, Pencil, Upload } from 'lucide-react';
import { ETIQUETA_FUENTE_OPORTUNIDAD, FUENTES_OPORTUNIDAD } from '../../constants';
import { errorApi, esEnlaceSeguro, fechaCalendario } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

const VACIO = { fuente: 'empleos_peru', titulo: '', descripcion: '', enlace: '', fecha_publicacion: '' };

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

export default function Oportunidades() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filtros, setFiltros] = useState({ fuente: '' });
  const [editor, setEditor] = useState(null);
  const [seleccionada, setSeleccionada] = useState(null);

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
          alGuardar={() => { setEditor(null); toast.success('Oportunidad guardada.'); refrescar(); }}
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
              badge={<BadgePublicacion estado={o.estado_publicacion} />}
              onClick={() => setSeleccionada(o)}
              meta={(
                <>
                  <span>{ETIQUETA_FUENTE_OPORTUNIDAD[o.fuente]}</span>
                  {o.razon_social && <span>{o.razon_social}</span>}
                  <span>Publicación: {fechaCalendario(o.fecha_publicacion)}</span>
                </>
              )}
            >
              {o.descripcion && (
                <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '0.88rem' }}>{o.descripcion}</p>
              )}
            </TarjetaRegistro>
          ))}
        </div>
      )}

      <DetalleOportunidad
        oportunidad={seleccionada}
        alCerrar={() => setSeleccionada(null)}
        alCambio={(mensaje) => { toast.success(mensaje); refrescar(); }}
        alEditar={(o) => { setSeleccionada(null); setEditor({ id: o.id, fila: o }); }}
      />
    </div>
  );
}

function DetalleOportunidad({ oportunidad, alCerrar, alCambio, alEditar }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  if (!oportunidad) return null;

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

  return (
    <Modal
      abierto
      titulo={oportunidad.titulo}
      subtitulo={ETIQUETA_FUENTE_OPORTUNIDAD[oportunidad.fuente]}
      alCerrar={alCerrar}
      tamano="ancho"
      acciones={(
        <>
          <Boton variante="gris" onClick={() => alEditar(oportunidad)}>
            <Pencil size={16} aria-hidden="true" />Editar
          </Boton>
          <Boton variante={oportunidad.activo ? 'peligro' : 'exito'} cargando={enviando} onClick={alternar}>
            {oportunidad.activo
              ? <><EyeOff size={16} aria-hidden="true" />Ocultar</>
              : <><Upload size={16} aria-hidden="true" />Publicar</>}
          </Boton>
        </>
      )}
    >
      <div className="form-fila" style={{ marginBottom: '0.8rem' }}>
        <BadgePublicacion estado={oportunidad.estado_publicacion} />
      </div>

      <Mensaje>{error}</Mensaje>

      <FichaDatos
        items={[
          { etiqueta: 'Fuente', valor: ETIQUETA_FUENTE_OPORTUNIDAD[oportunidad.fuente] },
          { etiqueta: 'Empresa', valor: oportunidad.razon_social },
          { etiqueta: 'Fecha de publicación', valor: fechaCalendario(oportunidad.fecha_publicacion) },
          {
            etiqueta: 'Enlace',
            valor: oportunidad.enlace && esEnlaceSeguro(oportunidad.enlace) ? (
              <a className="enlace" href={oportunidad.enlace} target="_blank" rel="noopener noreferrer">
                Ver convocatoria original <ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : null,
          },
        ]}
      />

      {oportunidad.descripcion && (
        <div className="modal-seccion">
          <h3>Descripción</h3>
          <p className="modal-texto">{oportunidad.descripcion}</p>
        </div>
      )}
    </Modal>
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
