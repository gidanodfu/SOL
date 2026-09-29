// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cambiarEstadoEmpresa, crearEmpresa, listarEmpresas, resetPasswordEmpresa } from '../../services/empresas';
import { EstadoCarga, Boton, Campo, Estado, ListaVacia, Mensaje, Selecto, Tarjeta } from '../../components/UI';
import Modal from '../../components/Modal';
import FichaDatos from '../../components/FichaDatos';
import { Check, Eye, KeyRound, Power } from 'lucide-react';
import { errorApi, fecha, fechaCalendario, soloDigitos } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

const estadosEmpresa = { activo: 'activo', inactivo: 'inactivo' };

export default function Empresas() {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState({ estado: '', q: '' });
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nota, setNota] = useState(null);
  const [seleccionada, setSeleccionada] = useState(null);
  const { ejecutar, enviando, error, setError } = useAccion(async (fn) => fn());

  const { data, isLoading } = useQuery({
    queryKey: ['empresas', filtros],
    queryFn: () => listarEmpresas(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v))),
  });

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['empresas'] });
    queryClient.invalidateQueries({ queryKey: ['empresa-admin-detalle'] });
  };

  const alternar = async (e) => {
    await ejecutar(() => cambiarEstadoEmpresa(e.id, e.estado === 'activo' ? 'inactivo' : 'activo'));
    setError(null);
    refrescar();
  };

  const resetPassword = async (e) => {
    const password = window.prompt(`Nueva contraseña para la empresa ${e.ruc} (mínimo 8 caracteres):`);
    if (!password) return;
    await ejecutar(() => resetPasswordEmpresa(e.id, password));
    setError(null);
    window.alert('Contraseña restablecida. Entréguela de forma segura a la empresa.');
    refrescar();
  };

  return (
    <Tarjeta
      titulo="Empresas afiliadas"
      acciones={
        <Boton variante="acento" onClick={() => setMostrarNuevo((v) => !v)}>
          {mostrarNuevo ? 'Cancelar' : 'Registrar empresa'}
        </Boton>
      }
    >
      {nota && <Mensaje tipo="exito">{nota}</Mensaje>}

      {mostrarNuevo && (
        <NuevaEmpresa
          alCrear={(datos) => {
            setMostrarNuevo(false);
            setNota(`Empresa registrada. Credenciales de acceso — Usuario (RUC): ${datos.ruc}; la contraseña la entrega la Municipalidad.`);
            refrescar();
          }}
        />
      )}

      <div className="form-fila">
        <input placeholder="Buscar por RUC, razón social o nombre comercial…" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} />
        <Selecto etiqueta="" value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="activo">Activas</option>
          <option value="inactivo">Inactivas</option>
        </Selecto>
      </div>

      {error && <Mensaje>{error}</Mensaje>}
      {isLoading && <EstadoCarga />}
      {data && data.data.length === 0 && <ListaVacia />}

      {data && data.data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>RUC</th>
              <th>Razón social</th>
              <th>Representante</th>
              <th>Correo</th>
              <th>Estado</th>
              <th>Registro</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((e) => (
              <tr key={e.id}>
                <td><strong>{e.ruc}</strong></td>
                <td>{e.razon_social}<br /><small style={{ color: 'var(--gris)' }}>{e.nombre_comercial}</small></td>
                <td>{e.representante}</td>
                <td>{e.email}</td>
                <td>
                  <Estado valor={e.estado} diccionario={estadosEmpresa} />
                  {e.evaluacion_presencial ? <div><small style={{ color: 'var(--verde)' }}>Evaluada presencialmente</small></div> : null}
                </td>
                <td>{fecha(e.created_at)}</td>
                <td>
                  <div className="acciones">
                    <Boton variante="gris" onClick={() => setSeleccionada(e)}>
                      <Eye size={16} aria-hidden="true" />Ver
                    </Boton>
                    <Boton variante={e.estado === 'activo' ? 'peligro' : 'exito'} onClick={() => alternar(e)} disabled={enviando}>
                      {e.estado === 'activo' ? 'Desactivar' : 'Activar'}
                    </Boton>
                    <Boton variante="gris" onClick={() => resetPassword(e)} disabled={enviando}>Cambiar clave</Boton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ color: 'var(--gris)', fontSize: '0.85rem' }}>
        {data?.total ?? 0} empresa(s). La Municipalidad puede registrar empresas tras la evaluación presencial; las
        empresas también pueden solicitar su afiliación desde el portal (ver la pestaña "Solicitudes").
      </p>

      <DetalleEmpresa
        empresa={seleccionada}
        alCerrar={() => setSeleccionada(null)}
        alCambio={(mensaje) => { setNota(mensaje); refrescar(); }}
      />
    </Tarjeta>
  );
}

function DetalleEmpresa({ empresa, alCerrar, alCambio }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  if (!empresa) return null;

  const alternar = async () => {
    try {
      await ejecutar(() => cambiarEstadoEmpresa(empresa.id, empresa.estado === 'activo' ? 'inactivo' : 'activo'));
      setError(null);
      alCambio(empresa.estado === 'activo' ? 'Empresa desactivada.' : 'Empresa activada.');
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const resetPassword = async () => {
    const password = window.prompt(`Nueva contraseña para la empresa ${empresa.ruc} (mínimo 8 caracteres):`);
    if (!password) return;
    try {
      await ejecutar(() => resetPasswordEmpresa(empresa.id, password));
      setError(null);
      window.alert('Contraseña restablecida. Entréguela de forma segura a la empresa.');
    } catch (e) {
      setError(errorApi(e));
    }
  };

  return (
    <Modal
      abierto
      titulo={empresa.razon_social}
      subtitulo={`${empresa.nombre_comercial || 'Empresa afiliada'} · RUC ${empresa.ruc}`}
      alCerrar={alCerrar}
      tamano="ancho"
      acciones={(
        <>
          <Boton variante={empresa.estado === 'activo' ? 'peligro' : 'exito'} cargando={enviando} onClick={alternar}>
            <Power size={16} aria-hidden="true" />{empresa.estado === 'activo' ? 'Desactivar' : 'Activar'}
          </Boton>
          <Boton variante="gris" cargando={enviando} onClick={resetPassword}>
            <KeyRound size={16} aria-hidden="true" />Cambiar clave
          </Boton>
        </>
      )}
    >
      <div className="form-fila" style={{ marginBottom: '0.8rem' }}>
        <Estado valor={empresa.estado} diccionario={estadosEmpresa} />
        {empresa.evaluacion_presencial ? (
          <span className="badge badge-green"><Check size={13} aria-hidden="true" style={{ marginRight: 4 }} />Evaluada presencialmente</span>
        ) : null}
      </div>

      <Mensaje>{error}</Mensaje>

      <FichaDatos
        items={[
          { etiqueta: 'RUC', valor: empresa.ruc },
          { etiqueta: 'Razón social', valor: empresa.razon_social },
          { etiqueta: 'Nombre comercial', valor: empresa.nombre_comercial },
          { etiqueta: 'Representante', valor: empresa.representante },
          { etiqueta: 'Correo', valor: empresa.email },
          { etiqueta: 'Teléfono', valor: empresa.telefono },
          { etiqueta: 'Dirección', valor: empresa.direccion },
          { etiqueta: 'Usuario', valor: empresa.username },
          { etiqueta: 'Estado del usuario', valor: empresa.user_estado },
          { etiqueta: 'Registro', valor: fechaCalendario(empresa.created_at) },
        ]}
      />

      {empresa.info_adicional && (
        <div className="modal-seccion">
          <h3>Información adicional</h3>
          <p className="modal-texto">{empresa.info_adicional}</p>
        </div>
      )}
    </Modal>
  );
}

const VACIO = { ruc: '', razon_social: '', nombre_comercial: '', direccion: '', telefono: '', email: '', representante: '', evaluacion_presencial: true, password: '', info_adicional: '' };

function NuevaEmpresa({ alCrear }) {
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(() => crearEmpresa(form));

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const enviar = async () => {
    try {
      const creada = await ejecutar();
      alCrear({ ruc: form.ruc, id: creada?.id });
    } catch (e) {
      const det = e?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(e));
    }
  };

  return (
    <section style={{ border: '1px solid var(--borde)', borderRadius: 'var(--radius-lg)', padding: '1rem', margin: '1rem 0' }}>
      <h3>Registro municipal de empresa (post evaluación presencial)</h3>
      <Mensaje>{error}</Mensaje>
      <div className="form-malla">
        <Campo etiqueta="RUC (será el usuario)" maxLength={11} value={form.ruc} onChange={set('ruc')} />
        <Campo etiqueta="Razón social" value={form.razon_social} onChange={set('razon_social')} />
        <Campo etiqueta="Nombre comercial" value={form.nombre_comercial} onChange={set('nombre_comercial')} />
        <Campo etiqueta="Representante" value={form.representante} onChange={set('representante')} />
        <Campo etiqueta="Correo" type="email" value={form.email} onChange={set('email')} />
        <Campo etiqueta="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: soloDigitos(e.target.value) })} inputMode="numeric" maxLength={11} />
        <Campo etiqueta="Dirección" value={form.direccion} onChange={set('direccion')} />
        <Campo etiqueta="Contraseña inicial" type="password" value={form.password} onChange={set('password')} />
      </div>
      <label className="form-fila" style={{ margin: '0.4rem 0' }}>
        <input type="checkbox" checked={form.evaluacion_presencial} onChange={set('evaluacion_presencial')} style={{ width: 'auto' }} />
        <span>Empresa evaluada presencialmente y habilitada para operar</span>
      </label>
      <Boton variante="primario" cargando={enviando} onClick={enviar}>Registrar empresa</Boton>
    </section>
  );
}
