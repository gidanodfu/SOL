// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cambiarEstadoUsuario, crearUsuario, listarUsuarios, resetPasswordUsuario,
} from '../../services/usuarios';
import { EstadoCarga, Boton, Campo, Estado, ListaVacia, Mensaje, Selecto, Tarjeta } from '../../components/UI';
import Modal from '../../components/Modal';
import FichaDatos from '../../components/FichaDatos';
import { Eye, KeyRound, Power } from 'lucide-react';
import { ETIQUETA_ROL } from '../../constants';
import { errorApi, fechaHora, soloDigitos } from '../../utils';
import { useAccion } from '../../hooks/useAccion';
import { useAuth } from '../../context/AuthContext';

const estadosUsuarios = { activo: 'activo', inactivo: 'inactivo' };

export default function Usuarios() {
  const queryClient = useQueryClient();
  const { usuario: usuarioActual } = useAuth();
  const [filtros, setFiltros] = useState({ rol: '', estado: '', q: '' });
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const { ejecutar, enviando, error, setError } = useAccion(async (fn) => fn());

  const { data, isLoading } = useQuery({
    queryKey: ['usuarios', filtros],
    queryFn: () => listarUsuarios(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v))),
  });

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    queryClient.invalidateQueries({ queryKey: ['usuario-admin-detalle'] });
  };

  const accionEstado = async (u) => {
    await ejecutar(() => cambiarEstadoUsuario(u.id, u.estado === 'activo' ? 'inactivo' : 'activo'));
    setError(null);
    refrescar();
  };

  const resetPassword = async (u) => {
    const password = window.prompt(`Nueva contraseña para ${u.username} (mínimo 8 caracteres):`);
    if (!password) return;
    await ejecutar(() => resetPasswordUsuario(u.id, password));
    setError(null);
    window.alert('Contraseña restablecida. Entréguela de forma segura al usuario.');
    refrescar();
  };

  return (
    <Tarjeta
      titulo="Usuarios del sistema"
      acciones={
        <Boton variante="acento" onClick={() => setMostrarNuevo((v) => !v)}>
          {mostrarNuevo ? 'Cancelar' : 'Nuevo usuario municipal'}
        </Boton>
      }
    >
      {mostrarNuevo && <NuevoUsuario alCrear={() => { setMostrarNuevo(false); refrescar(); }} />}

      <div className="form-fila">
        <input placeholder="Buscar por usuario, nombre o empresa…" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} />
        <Selecto etiqueta="" value={filtros.rol} onChange={(e) => setFiltros({ ...filtros, rol: e.target.value })}>
          <option value="">Todos los roles</option>
          {Object.entries(ETIQUETA_ROL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Selecto>
        <Selecto etiqueta="" value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </Selecto>
      </div>

      {error && <Mensaje>{error}</Mensaje>}
      {isLoading && <EstadoCarga />}
      {data && data.data.length === 0 && <ListaVacia />}

      {data && data.data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Último acceso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.username}</strong></td>
                <td>{u.nombres} {u.apellidos}</td>
                <td><Estado valor={u.rol} diccionario={ETIQUETA_ROL} /></td>
                <td><Estado valor={u.estado} diccionario={estadosUsuarios} /></td>
                <td>{fechaHora(u.ultimo_acceso)}</td>
                <td>
                  <div className="acciones">
                    <Boton variante="gris" onClick={() => setSeleccionado(u)}>
                      <Eye size={16} aria-hidden="true" />Ver
                    </Boton>
                    {/* Un administrador no puede desactivar su propia cuenta (el backend también lo impide). */}
                    {u.id !== usuarioActual?.id && (
                      <Boton variante={u.estado === 'activo' ? 'peligro' : 'exito'} onClick={() => accionEstado(u)} disabled={enviando}>
                        {u.estado === 'activo' ? 'Desactivar' : 'Activar'}
                      </Boton>
                    )}
                    <Boton variante="gris" onClick={() => resetPassword(u)} disabled={enviando}>Cambiar clave</Boton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ color: 'var(--gris)', fontSize: '0.85rem' }}>
        {data?.total ?? 0} usuario(s). Las cuentas desactivadas se conservan y no pueden iniciar sesión (RF-06).
      </p>

      <DetalleUsuario
        usuario={seleccionado}
        propio={seleccionado?.id === usuarioActual?.id}
        alCerrar={() => setSeleccionado(null)}
        alCambio={(mensaje) => { setError(null); if (mensaje) window.alert(mensaje); refrescar(); }}
      />
    </Tarjeta>
  );
}

function DetalleUsuario({ usuario, propio, alCerrar, alCambio }) {
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(async (fn) => fn());

  if (!usuario) return null;

  const alternar = async () => {
    try {
      await ejecutar(() => cambiarEstadoUsuario(usuario.id, usuario.estado === 'activo' ? 'inactivo' : 'activo'));
      setError(null);
      alCambio(usuario.estado === 'activo' ? 'Usuario desactivado.' : 'Usuario activado.');
    } catch (e) {
      setError(errorApi(e));
    }
  };

  const resetPassword = async () => {
    const password = window.prompt(`Nueva contraseña para ${usuario.username} (mínimo 8 caracteres):`);
    if (!password) return;
    try {
      await ejecutar(() => resetPasswordUsuario(usuario.id, password));
      setError(null);
      window.alert('Contraseña restablecida. Entréguela de forma segura al usuario.');
    } catch (e) {
      setError(errorApi(e));
    }
  };

  return (
    <Modal
      abierto
      titulo={`${usuario.nombres} ${usuario.apellidos}`}
      subtitulo={`Usuario ${usuario.username} · ${ETIQUETA_ROL[usuario.rol] || usuario.rol}`}
      alCerrar={alCerrar}
      tamano="ancho"
      acciones={(
        <>
          {!propio && (
            <Boton variante={usuario.estado === 'activo' ? 'peligro' : 'exito'} cargando={enviando} onClick={alternar}>
              <Power size={16} aria-hidden="true" />{usuario.estado === 'activo' ? 'Desactivar' : 'Activar'}
            </Boton>
          )}
          <Boton variante="gris" cargando={enviando} onClick={resetPassword}>
            <KeyRound size={16} aria-hidden="true" />Cambiar clave
          </Boton>
        </>
      )}
    >
      <div className="form-fila" style={{ marginBottom: '0.8rem' }}>
        <Estado valor={usuario.rol} diccionario={ETIQUETA_ROL} />
        <Estado valor={usuario.estado} diccionario={estadosUsuarios} />
        {propio && <span style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>Es tu propia cuenta: no puede desactivarse.</span>}
      </div>

      <Mensaje>{error}</Mensaje>

      <FichaDatos
        items={[
          { etiqueta: 'Usuario', valor: usuario.username },
          { etiqueta: 'Correo', valor: usuario.email },
          { etiqueta: 'Teléfono', valor: usuario.telefono },
          { etiqueta: 'Proveedor de acceso', valor: usuario.proveedor === 'google' ? 'Google' : 'Local' },
          { etiqueta: 'Empresa vinculada', valor: usuario.razon_social },
          { etiqueta: 'Último acceso', valor: fechaHora(usuario.ultimo_acceso) },
          { etiqueta: 'Registro', valor: fechaHora(usuario.created_at) },
        ]}
      />
    </Modal>
  );
}

function NuevoUsuario({ alCrear }) {
  const [form, setForm] = useState({ username: '', nombres: '', apellidos: '', email: '', telefono: '', password: '' });
  const [error, setError] = useState(null);
  const { ejecutar, enviando } = useAccion(() => crearUsuario(form));

  const enviar = async () => {
    try {
      await ejecutar();
      alCrear();
    } catch (e) {
      setError(errorApi(e));
    }
  };

  return (
    <section style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: '1rem', margin: '1rem 0' }}>
      <h3>Nuevo personal municipal (acceso administrador)</h3>
      <Mensaje>{error}</Mensaje>
      <div className="form-malla">
        <Campo etiqueta="Usuario" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <Campo etiqueta="Contraseña inicial" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Campo etiqueta="Nombres" value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} />
        <Campo etiqueta="Apellidos" value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
        <Campo etiqueta="Correo" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Campo etiqueta="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: soloDigitos(e.target.value) })} inputMode="numeric" maxLength={11} />
      </div>
      <Boton variante="primario" cargando={enviando} onClick={enviar}>Crear usuario</Boton>
    </section>
  );
}
