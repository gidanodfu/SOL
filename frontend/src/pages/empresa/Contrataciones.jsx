// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { actualizarContratacion, listarContratacionesEmpresa, opcionesContratacionEmpresa, registrarContratacion } from '../../services/contrataciones';
import { EstadoCarga, Boton, Campo, Estado, Mensaje, Selecto } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import { useToast } from '../../components/Feedbacks';
import { ETIQUETA_ESTADO_POSTULACION, ETIQUETA_SITUACION_CONTRATACION, SITUACIONES_CONTRATACION } from '../../constants';
import { errorApi, fechaCalendario } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

const VACIO = {
  postulacion_id: '', fecha_contratacion: '', cargo: '', modalidad: '', remuneracion: '',
  observaciones: '', situacion_laboral: 'contratado', motivo_situacion: '', fecha_situacion: '',
};

const SITUACIONES_CON_MOTIVO = ['despedido', 'renuncio'];

const DESCRIPCION_SITUACION = {
  contratado: 'La persona continúa trabajando en la empresa.',
  finalizado: 'El contrato terminó por plazo o mutuo acuerdo.',
  despedido: 'La empresa terminó la relación laboral.',
  renuncio: 'La persona decidió dejar el puesto.',
};

const CAMPOS_ORDEN = [
  'postulacion_id', 'fecha_contratacion', 'cargo', 'modalidad', 'remuneracion',
  'situacion_laboral', 'fecha_situacion', 'motivo_situacion', 'observaciones',
];

const iniciales = (nombres, apellidos) => `${(nombres || '').trim().charAt(0)}${(apellidos || '').trim().charAt(0)}`.toUpperCase() || '?';

const fechaEditable = (valor) => (!valor || String(valor).startsWith('0000-00-00') ? '' : valor);

export default function Contrataciones() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: contratos, isLoading } = useQuery({ queryKey: ['contrataciones-empresa'], queryFn: listarContratacionesEmpresa });
  const { data: opciones } = useQuery({ queryKey: ['opciones-contratacion'], queryFn: opcionesContratacionEmpresa });
  const [editor, setEditor] = useState(null);

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['contrataciones-empresa'] });
    queryClient.invalidateQueries({ queryKey: ['opciones-contratacion'] });
  };

  const puedeRegistrar = (opciones && opciones.length > 0) || editor;

  return (
    <div>
      <PageHeader
        titulo="Contrataciones"
        descripcion="Registra la colocación de tus candidatos seleccionados (RF-58). Alimenta los reportes municipales de efectividad."
        accion={puedeRegistrar && (
          editor ? (
            <Boton variante="gris" onClick={() => setEditor(null)}>
              <i className="ti ti-x" />Cancelar
            </Boton>
          ) : (
            <button className="btn btn-primario" type="button" onClick={() => setEditor({})}>
              <i className="ti ti-plus" /><span>Registrar contratación</span>
            </button>
          )
        )}
      />

      {isLoading && <EstadoCarga />}

      {editor && (
        <EditorContratacion
          opciones={opciones || []}
          inicial={editor.id ? contratos?.find((c) => c.id === editor.id) : null}
          alGuardar={() => { setEditor(null); toast.success('Contratación guardada.'); refrescar(); }}
        />
      )}

      {opciones && opciones.length === 0 && !editor && contratos && contratos.length === 0 && (
        <div className="list-card">
          <div className="empty-card">
            <i className="ti ti-check" />
            <p>No tiene candidatos seleccionados pendientes de registrar como contratados.</p>
          </div>
        </div>
      )}

      {contratos && contratos.length > 0 && (
        <div className="list-card">
          <div className="list-card-head">
            <h2>{contratos.length} contratación(es) registrada(s)</h2>
          </div>
          <div className="tabla-scroll">
  <table className="tabla-contrataciones-empresa">
              <thead>
                <tr>
                  <th className="col-fecha">Fecha</th>
                  <th>Contratado</th>
                  <th>Puesto</th>
                  <th>Cargo</th>
                  <th>Modalidad</th>
                  <th>Situación</th>
                  <th className="col-monto">Remuneración</th>
                  <th className="col-acciones">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {contratos.map((c) => (
                  <tr key={c.id}>
                    <td className="col-fecha" data-label="Fecha">{fechaCalendario(c.fecha_contratacion)}</td>
                    <td data-label="Contratado">{c.nombres} {c.apellidos}</td>
                    <td data-label="Puesto">{c.puesto}</td>
                    <td data-label="Cargo">{c.cargo}</td>
                    <td data-label="Modalidad">{c.modalidad || '—'}</td>
                    <td data-label="Situación"><Estado valor={c.situacion_laboral} diccionario={ETIQUETA_SITUACION_CONTRATACION} /></td>
                    <td className="col-monto" data-label="Remuneración">{c.remuneracion ? `S/ ${c.remuneracion}` : '—'}</td>
                    <td className="col-acciones"><Boton variante="gris" onClick={() => setEditor({ id: c.id })}>Editar</Boton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EditorContratacion({ opciones, inicial, alGuardar }) {
  const esEdicion = Boolean(inicial);
  const [form, setForm] = useState(() =>
    inicial
      ? {
          postulacion_id: inicial.postulacion_id, fecha_contratacion: inicial.fecha_contratacion,
          cargo: inicial.cargo, modalidad: inicial.modalidad || '', remuneracion: inicial.remuneracion || '', observaciones: inicial.observaciones || '',
          situacion_laboral: inicial.situacion_laboral || 'contratado', motivo_situacion: inicial.motivo_situacion || '', fecha_situacion: fechaEditable(inicial.fecha_situacion),
        }
      : VACIO,
  );
  const [error, setError] = useState(null);
  const [errores, setErrores] = useState({});
  const { ejecutar, enviando } = useAccion(() => (inicial ? actualizarContratacion(inicial.id, form) : registrarContratacion(form)));

  const candidato = esEdicion
    ? inicial
    : opciones.find((o) => String(o.id) === String(form.postulacion_id)) || null;
  const motivoObligatorio = SITUACIONES_CON_MOTIVO.includes(form.situacion_laboral);
  const notaFechaSituacion = esEdicion
    ? 'Si cambias la situación y no especificas una fecha, se utilizará la fecha actual.'
    : 'Si no indicas una fecha, se utilizará la fecha de contratación.';

  const set = (k) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((previo) => ({ ...previo, [k]: valor }));
    setErrores((previo) => (previo[k] ? { ...previo, [k]: undefined } : previo));
    setError(null);
  };

  const seleccionarSituacion = (valor) => {
    setForm((previo) => ({ ...previo, situacion_laboral: valor }));
    setErrores((previo) => {
      const siguiente = { ...previo };
      delete siguiente.situacion_laboral;
      if (!SITUACIONES_CON_MOTIVO.includes(valor)) delete siguiente.motivo_situacion;
      return siguiente;
    });
    setError(null);
  };

  const enfocarCampo = (campo) => {
    if (campo === 'situacion_laboral') {
      document.querySelector('input[name="contratacion-situacion_laboral"]')?.focus();
      return;
    }
    document.getElementById(`contratacion-${campo}`)?.focus();
  };

  const guardar = async () => {
    const faltantes = {};
    if (!esEdicion && !form.postulacion_id) {
      faltantes.postulacion_id = 'Seleccione una postulación.';
    }
    if (motivoObligatorio && !form.motivo_situacion.trim()) {
      faltantes.motivo_situacion = 'Indique el motivo de la situación laboral.';
    }
    if (Object.keys(faltantes).length > 0) {
      setErrores((previo) => ({ ...previo, ...faltantes }));
      setError(null);
      enfocarCampo(Object.keys(faltantes)[0]);
      return;
    }

    setErrores({});
    setError(null);
    try {
      await ejecutar();
      alGuardar();
    } catch (e) {
      const campos = e?.response?.data?.campos;
      if (campos && typeof campos === 'object' && !Array.isArray(campos)) {
        setErrores(campos);
        setError(null);
        const primero = CAMPOS_ORDEN.find((campo) => campos[campo]);
        if (primero) enfocarCampo(primero);
        return;
      }

      const det = e?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(e));
    }
  };

  const nombreCandidato = candidato
    ? `${candidato.nombres || ''} ${candidato.apellidos || ''}`.trim() || 'Candidato'
    : null;

  return (
    <div className="list-card">
      <div className="list-card-head">
        <h2>{esEdicion ? 'Editar contratación' : 'Registrar contratación'}</h2>
      </div>
      <Mensaje>{error}</Mensaje>

      <div className="contratacion-form">
        <section className="form-seccion">
          <h3 className="form-seccion-titulo">01 · Candidato seleccionado</h3>
          {!esEdicion && (
            <Selecto
              etiqueta="Candidato seleccionado *"
              id="contratacion-postulacion_id"
              value={form.postulacion_id}
              onChange={set('postulacion_id')}
              error={errores.postulacion_id}
              disabled={enviando}
            >
              <option value="">Seleccione…</option>
              {opciones.map((o) => (
                <option key={o.id} value={o.id}>{o.nombres} {o.apellidos} — {o.puesto}</option>
              ))}
            </Selecto>
          )}

          {candidato ? (
            <div className="contratacion-candidato">
              <span className="contratacion-candidato-avatar" aria-hidden="true">
                {iniciales(candidato.nombres, candidato.apellidos)}
              </span>
              <div className="contratacion-candidato-datos">
                <strong>{nombreCandidato}</strong>
                <span>{candidato.puesto || 'Puesto no disponible'}</span>
              </div>
              <Estado valor="seleccionado" diccionario={ETIQUETA_ESTADO_POSTULACION} />
            </div>
          ) : (
            <p className="form-seccion-nota">Selecciona una postulación para ver los datos del candidato.</p>
          )}

          {esEdicion && (
            <p className="form-seccion-nota">La postulación vinculada a esta contratación no se puede cambiar.</p>
          )}
        </section>

        <section className="form-seccion">
          <h3 className="form-seccion-titulo">02 · Condiciones de contratación</h3>
          <div className="contratacion-grid">
            <Campo etiqueta="Fecha de contratación *" id="contratacion-fecha_contratacion" type="date" value={form.fecha_contratacion} onChange={set('fecha_contratacion')} error={errores.fecha_contratacion} disabled={enviando} />
            <Campo etiqueta="Cargo contratado *" id="contratacion-cargo" value={form.cargo} onChange={set('cargo')} error={errores.cargo} disabled={enviando} />
            <Campo etiqueta="Modalidad" id="contratacion-modalidad" value={form.modalidad} onChange={set('modalidad')} error={errores.modalidad} disabled={enviando} />
            <Campo etiqueta="Remuneración (S/)" id="contratacion-remuneracion" value={form.remuneracion} onChange={set('remuneracion')} error={errores.remuneracion} disabled={enviando} />
          </div>
        </section>

        <fieldset className={`form-seccion contratacion-situaciones${errores.situacion_laboral ? ' campo-error' : ''}`}>
          <legend className="form-seccion-titulo">03 · Situación laboral</legend>
          <p className="form-seccion-nota">Selecciona la situación actual de la relación laboral.</p>
          <div className="contratacion-situaciones-grid">
            {SITUACIONES_CONTRATACION.map((s) => (
              <label
                key={s}
                className={`contratacion-situacion${form.situacion_laboral === s ? ' is-seleccionada' : ''}`}
              >
                <input
                  type="radio"
                  name="contratacion-situacion_laboral"
                  value={s}
                  checked={form.situacion_laboral === s}
                  onChange={() => seleccionarSituacion(s)}
                  disabled={enviando}
                  aria-describedby={errores.situacion_laboral ? 'contratacion-situacion_laboral-error' : undefined}
                />
                <span className="contratacion-situacion-texto">
                  <strong>{ETIQUETA_SITUACION_CONTRATACION[s]}</strong>
                  <small>{DESCRIPCION_SITUACION[s]}</small>
                </span>
              </label>
            ))}
          </div>
          {errores.situacion_laboral && (
            <span id="contratacion-situacion_laboral-error" className="campo-mensaje" role="alert">
              {errores.situacion_laboral}
            </span>
          )}

          <div className="contratacion-grid contratacion-grid--dos contratacion-situacion-detalle">
            <label className={`campo${errores.fecha_situacion ? ' campo-error' : ''}`} htmlFor="contratacion-fecha_situacion">
              <span>Fecha efectiva de la situación</span>
              <input
                id="contratacion-fecha_situacion"
                type="date"
                value={form.fecha_situacion}
                onChange={set('fecha_situacion')}
                disabled={enviando}
                aria-invalid={errores.fecha_situacion ? true : undefined}
                aria-describedby={`contratacion-fecha_situacion-ayuda${errores.fecha_situacion ? ' contratacion-fecha_situacion-error' : ''}`}
              />
              <span id="contratacion-fecha_situacion-ayuda" className="campo-ayuda">{notaFechaSituacion}</span>
              {errores.fecha_situacion && (
                <span id="contratacion-fecha_situacion-error" className="campo-mensaje" role="alert">
                  {errores.fecha_situacion}
                </span>
              )}
            </label>

            <label className={`campo${errores.motivo_situacion ? ' campo-error' : ''}`} htmlFor="contratacion-motivo_situacion">
              <span>Motivo / razón{motivoObligatorio ? ' *' : ' (opcional)'}</span>
              <textarea
                id="contratacion-motivo_situacion"
                rows="3"
                value={form.motivo_situacion}
                onChange={set('motivo_situacion')}
                maxLength={255}
                disabled={enviando}
                aria-invalid={errores.motivo_situacion ? true : undefined}
                aria-describedby={`contratacion-motivo_situacion-ayuda${errores.motivo_situacion ? ' contratacion-motivo_situacion-error' : ''}`}
              />
              <span id="contratacion-motivo_situacion-ayuda" className="campo-ayuda">Obligatorio para Despedido y Renunció.</span>
              {errores.motivo_situacion && (
                <span id="contratacion-motivo_situacion-error" className="campo-mensaje" role="alert">
                  {errores.motivo_situacion}
                </span>
              )}
            </label>
          </div>
        </fieldset>

        <section className="form-seccion contratacion-observaciones-seccion">
          <h3 id="contratacion-observaciones-titulo" className="form-seccion-titulo">04 · Observaciones adicionales</h3>
          <div className={`campo${errores.observaciones ? ' campo-error' : ''}`}>
            <textarea
              id="contratacion-observaciones"
              aria-labelledby="contratacion-observaciones-titulo"
              rows="4"
              value={form.observaciones}
              onChange={set('observaciones')}
              maxLength={10000}
              disabled={enviando}
              aria-invalid={errores.observaciones ? true : undefined}
              aria-describedby={`contratacion-observaciones-ayuda${errores.observaciones ? ' contratacion-observaciones-error' : ''}`}
            />
            <span id="contratacion-observaciones-ayuda" className="campo-ayuda">Máximo 10.000 caracteres.</span>
            {errores.observaciones && (
              <span id="contratacion-observaciones-error" className="campo-mensaje" role="alert">
                {errores.observaciones}
              </span>
            )}
          </div>
        </section>

        <div className="contratacion-acciones">
          <Boton variante="primario" cargando={enviando} onClick={guardar}>Guardar contratación</Boton>
        </div>
      </div>
    </div>
  );
}
