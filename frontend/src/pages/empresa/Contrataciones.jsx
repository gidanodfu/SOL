import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { actualizarContratacion, listarContratacionesEmpresa, opcionesContratacionEmpresa, registrarContratacion } from '../../services/contrataciones';
import { EstadoCarga, Boton, Campo, Mensaje, Selecto } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import { errorApi, fecha } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

const VACIO = { postulacion_id: '', fecha_contratacion: '', cargo: '', modalidad: '', remuneracion: '', observaciones: '' };

export default function Contrataciones() {
  const queryClient = useQueryClient();
  const { data: contratos, isLoading } = useQuery({ queryKey: ['contrataciones-empresa'], queryFn: listarContratacionesEmpresa });
  const { data: opciones } = useQuery({ queryKey: ['opciones-contratacion'], queryFn: opcionesContratacionEmpresa });
  const [editor, setEditor] = useState(null);
  const [nota, setNota] = useState(null);

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

      <Mensaje tipo="exito">{nota}</Mensaje>
      {isLoading && <EstadoCarga />}

      {editor && (
        <EditorContratacion
          opciones={opciones || []}
          inicial={editor.id ? contratos?.find((c) => c.id === editor.id) : null}
          alGuardar={() => { setEditor(null); setNota('Contratación guardada.'); refrescar(); }}
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
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Contratado</th>
                <th>Puesto</th>
                <th>Cargo</th>
                <th>Modalidad</th>
                <th>Remuneración</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contratos.map((c) => (
                <tr key={c.id}>
                  <td>{fecha(c.fecha_contratacion)}</td>
                  <td>{c.nombres} {c.apellidos}</td>
                  <td>{c.puesto}</td>
                  <td>{c.cargo}</td>
                  <td>{c.modalidad || '—'}</td>
                  <td>{c.remuneracion ? `S/ ${c.remuneracion}` : '—'}</td>
                  <td><Boton variante="gris" onClick={() => setEditor({ id: c.id })}>Editar</Boton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EditorContratacion({ opciones, inicial, alGuardar }) {
  const [form, setForm] = useState(() =>
    inicial
      ? {
          postulacion_id: inicial.postulacion_id, fecha_contratacion: inicial.fecha_contratacion,
          cargo: inicial.cargo, modalidad: inicial.modalidad || '', remuneracion: inicial.remuneracion || '', observaciones: inicial.observaciones || '',
        }
      : VACIO,
  );
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(() => (inicial ? actualizarContratacion(inicial.id, form) : registrarContratacion(form)));

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
    <div className="list-card">
      <div className="list-card-head">
        <h2>{inicial ? 'Editar contratación' : 'Registrar contratación'}</h2>
      </div>
      <Mensaje>{error}</Mensaje>
      <div className="form-malla">
        {!inicial && (
          <Selecto etiqueta="Candidato seleccionado *" value={form.postulacion_id} onChange={set('postulacion_id')}>
            <option value="">Seleccione…</option>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>{o.nombres} {o.apellidos} — {o.puesto}</option>
            ))}
          </Selecto>
        )}
        <Campo etiqueta="Fecha de contratación *" type="date" value={form.fecha_contratacion} onChange={set('fecha_contratacion')} />
        <Campo etiqueta="Cargo contratado *" value={form.cargo} onChange={set('cargo')} />
        <Campo etiqueta="Modalidad" value={form.modalidad} onChange={set('modalidad')} />
        <Campo etiqueta="Remuneración (S/)" value={form.remuneracion} onChange={set('remuneracion')} />
      </div>
      <label className="campo"><span>Observaciones</span><textarea rows="2" value={form.observaciones} onChange={set('observaciones')} /></label>
      <Boton variante="primario" cargando={enviando} onClick={guardar}>Guardar contratación</Boton>
    </div>
  );
}
