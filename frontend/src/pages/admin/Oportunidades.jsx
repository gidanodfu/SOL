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
import { errorApi, esEnlaceSeguro, esFechaCalendario, fechaCalendario, textoEnriquecidoVacio } from '../../utils';
import { usePermisosMunicipales } from '../../hooks/usePermisosMunicipales';

const VACIO = { fuente: '', titulo: '', descripcion: '', enlace: '', fecha_publicacion: '' };

const ORDEN_CAMPOS = ['fuente', 'titulo', 'enlace', 'fecha_publicacion', 'descripcion'];

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
  const { puede } = usePermisosMunicipales();
  const puedeGestionar = puede('oportunidades');
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
        acciones={puedeGestionar ? (
          <Boton variante="acento" onClick={() => setEditor(editor ? null : {})}>
            {editor ? 'Cancelar' : 'Nueva oportunidad'}
          </Boton>
        ) : null}
      >
        <Selecto etiqueta="" value={filtros.fuente} onChange={(e) => setFiltros({ ...filtros, fuente: e.target.value })}>
          <option value="">Todas las fuentes</option>
          {FUENTES_OPORTUNIDAD.map((f) => <option key={f} value={f}>{ETIQUETA_FUENTE_OPORTUNIDAD[f]}</option>)}
        </Selecto>
        {isLoading && <EstadoCarga />}
        {data && data.length === 0 && <ListaVacia />}
      </Tarjeta>

      {puedeGestionar && editor && (
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
        puedeGestionar={puedeGestionar}
        alCerrar={() => setSeleccionada(null)}
        alCambio={(mensaje) => { toast.success(mensaje); refrescar(); }}
        alEditar={(o) => { setSeleccionada(null); setEditor({ id: o.id, fila: o }); }}
      />
    </div>
  );
}

function DetalleOportunidad({ oportunidad, puedeGestionar, alCerrar, alCambio, alEditar }) {
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
      acciones={puedeGestionar ? (
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
      ) : null}
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
  const esNueva = !inicial;
  const [form, setForm] = useState(() =>
    inicial
      ? { fuente: inicial.fuente, titulo: inicial.titulo, descripcion: inicial.descripcion || '', enlace: inicial.enlace || '', fecha_publicacion: inicial.fecha_publicacion || '' }
      : VACIO,
  );
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setErrores((prev) => {
      if (!prev[k]) return prev;
      const siguiente = { ...prev };
      delete siguiente[k];
      return siguiente;
    });
    setError(null);
  };

  const enfocarCampo = (campo) => {
    document.getElementById(`oportunidad-${campo}`)?.focus();
  };

  const validar = () => {
    const encontrados = {};

    if (!FUENTES_OPORTUNIDAD.includes(String(form.fuente || '').trim())) {
      encontrados.fuente = 'Selecciona una fuente válida.';
    }

    if (String(form.titulo || '').trim() === '') {
      encontrados.titulo = 'El título de la oportunidad es obligatorio.';
    }

    const enlace = String(form.enlace || '').trim();
    if (enlace === '' || !esEnlaceSeguro(enlace)) {
      encontrados.enlace = 'Introduce una URL válida.';
    }

    const fecha = String(form.fecha_publicacion || '').trim();
    if (fecha === '') {
      encontrados.fecha_publicacion = 'La fecha de publicación es obligatoria.';
    } else if (!esFechaCalendario(fecha)) {
      encontrados.fecha_publicacion = 'La fecha de publicación no es válida.';
    }

    if (textoEnriquecidoVacio(form.descripcion)) {
      encontrados.descripcion = 'La descripción de la oportunidad es obligatoria.';
    }

    return encontrados;
  };

  const guardar = async () => {
    // La validación local de obligatoriedad aplica solo a la creación. La
    // edición conserva el comportamiento existente.
    const encontrados = esNueva ? validar() : {};
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
      if (inicial) {
        await actualizarOportunidad(inicial.id, form);
      } else {
        await crearOportunidad(form);
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
      <Mensaje>{error}</Mensaje>
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
      <label className={`campo${errores.descripcion ? ' campo-error' : ''}`} htmlFor="oportunidad-descripcion">
        <span>Descripción *</span>
        <textarea
          id="oportunidad-descripcion"
          rows="3"
          value={form.descripcion}
          onChange={set('descripcion')}
          aria-invalid={errores.descripcion ? true : undefined}
          aria-describedby={errores.descripcion ? 'oportunidad-descripcion-error' : undefined}
          required
        />
        {errores.descripcion && (
          <span id="oportunidad-descripcion-error" className="campo-mensaje" role="alert">{errores.descripcion}</span>
        )}
      </label>
      <Boton variante="primario" cargando={enviando} onClick={guardar}>Guardar</Boton>
    </Tarjeta>
  );
}
