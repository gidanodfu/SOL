import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Boton, Campo, Mensaje } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import { ROLES } from '../../constants';
import { errorApi } from '../../utils';

export default function Cuenta() {
  const { usuario, cambiarContrasena } = useAuth();
  const [form, setForm] = useState({ password_actual: '', password: '', password2: '' });
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setOk(null);
    try {
      await cambiarContrasena(form);
      setForm({ password_actual: '', password: '', password2: '' });
      setOk('Contraseña actualizada correctamente.');
    } catch (err) {
      const det = err?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(err));
    } finally {
      setEnviando(false);
    }
  };

  const esAdmin = usuario?.rol === ROLES.ADMIN;

  return (
    <div>
      {!esAdmin && (
        <PageHeader
          titulo="Mi cuenta"
          descripcion="Datos de acceso y seguridad de tu cuenta en Empleo MDJLO."
        />
      )}

      <div className="cuenta-grid">
        <section className="tarjeta">
          <div className="tarjeta-titulo">
            <h2>Información de la cuenta</h2>
          </div>
          <div className="descripcion">
            <div><b>Usuario</b>{usuario?.username || '—'}</div>
            <div><b>Nombre</b>{usuario?.nombres} {usuario?.apellidos}</div>
            <div><b>Correo</b>{usuario?.email || '—'}</div>
          </div>
        </section>

        <section className="tarjeta">
          <div className="tarjeta-titulo">
            <h2>Seguridad</h2>
          </div>
          <p className="tarjeta-sub">Actualiza la contraseña de acceso al sistema.</p>

          <form onSubmit={guardar}>
            <Mensaje>{error}</Mensaje>
            <Mensaje tipo="exito">{ok}</Mensaje>
            <div className="form-malla">
              <Campo etiqueta="Contraseña actual" type="password" value={form.password_actual} onChange={set('password_actual')} required autoComplete="current-password" />
              <Campo etiqueta="Nueva contraseña" type="password" value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />
              <Campo etiqueta="Confirmar nueva contraseña" type="password" value={form.password2} onChange={set('password2')} required autoComplete="new-password" />
            </div>
            <Boton variante="primario" cargando={enviando} type="submit">Actualizar contraseña</Boton>
          </form>
        </section>
      </div>
    </div>
  );
}
