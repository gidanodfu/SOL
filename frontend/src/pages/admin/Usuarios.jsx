import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cambiarEstadoUsuario, crearUsuario, listarUsuarios, resetPasswordUsuario,
} from '../../services/usuarios';
import { EstadoCarga, Boton, Campo, Estado, ListaVacia, Mensaje, Selecto, Tarjeta } from '../../components/UI';
import { ETIQUETA_ROL } from '../../constants';
import { errorApi, fechaHora, soloDigitos } from '../../utils';
import { useAccion } from '../../hooks/useAccion';

const estadosUsuarios = { activo: 'activo', inactivo: 'inactivo' };

export default function Usuarios() {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState({ rol: '', estado: '', q: '' });
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const { ejecutar, enviando, error, setError } = useAccion(async (fn) => fn());

  const { data, isLoading } = useQuery({
    queryKey: ['usuarios', filtros],
    queryFn: () => listarUsuarios(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v))),
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['usuarios'] });

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
                    <Boton variante={u.estado === 'activo' ? 'peligro' : 'exito'} onClick={() => accionEstado(u)} disabled={enviando}>
                      {u.estado === 'activo' ? 'Desactivar' : 'Activar'}
                    </Boton>
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
    </Tarjeta>
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
