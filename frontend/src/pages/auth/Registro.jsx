import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mensaje } from '../../components/UI';
import GoogleButton from '../../components/GoogleButton';
import { useAuth } from '../../context/AuthContext';
import { errorApi, esTelefonoValido, soloDigitos } from '../../utils';

const LOGO_URL = 'https://www.image2url.com/r2/default/images/1788530622409-c587704d-1068-43f2-b9e1-9b8ab867e021.jpeg';

export default function Registro() {
  const { loginGoogle, registrarPostulante } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ dni: '', nombres: '', apellidos: '', email: '', telefono: '', password: '', password2: '' });
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [verPass, setVerPass] = useState(false);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // Registro/ingreso con Google: si la cuenta recién creada (o existente) tiene
  // el perfil incompleto se lleva al postulante a completar los datos que
  // Google no aporta; si ya está completo, directo a la bolsa de empleo.
  const conGoogle = async (idToken) => {
    setEnviando(true);
    setError(null);
    try {
      const datos = await loginGoogle(idToken);
      const destino = datos.usuario?.rol === 'postulante' && datos.perfil_completo === false
        ? '/postulante/perfil'
        : '/postulante/buscar';
      navigate(destino, { replace: true });
    } catch (err) {
      setError(errorApi(err));
    } finally {
      setEnviando(false);
    }
  };

  // Registro manual: la cuenta se crea y queda con sesión iniciada (login
  // automático), por lo que se redirige a la bolsa de empleo.
  const enviar = async (e) => {
    e.preventDefault();
    if (!esTelefonoValido(form.telefono)) {
      setError('El teléfono debe tener 9 u 11 dígitos.');
      return;
    }
    setEnviando(true);
    setError(null);
    setOk(null);
    try {
      await registrarPostulante(form);
      setOk('Cuenta creada correctamente. ¡Bienvenido!');
      navigate('/postulante/buscar', { replace: true });
    } catch (err) {
      const detalles = err?.response?.data?.errors;
      setError(Array.isArray(detalles) && detalles.length ? detalles.join('. ') : errorApi(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login-institucional">
      {/* Contenido central */}
      <main className="login-main">
        <div className="login-marca">
          <img src={LOGO_URL} alt="Escudo de la Municipalidad Distrital de José Leonardo Ortiz" className="login-logo" />
          <h1 className="login-municipio-nombre">MUNICIPALIDAD DISTRITAL DE JOSÉ LEONARDO ORTIZ</h1>
          <p className="login-sistema">Unidad Funcional del Empleo (UFE) · Sistema de Ofertas Laborales (JLO)</p>
        </div>

        {/* Formulario de registro */}
        <div className="login-formulario login-formulario-registro">
          <h2 className="login-formulario-titulo">REGISTRO DE POSTULANTE</h2>
          <p className="login-formulario-sub">
            Regístrate con Google o crea tu cuenta con tu DNI (será tu usuario). Con Google entrarás y completarás los datos que falten en tu perfil.
          </p>

          <GoogleButton modo="registro" onCredencial={conGoogle} />
          <div className="login-divisor">o regístrate manualmente</div>

          <Mensaje>{error}</Mensaje>
          <Mensaje tipo="exito">{ok}</Mensaje>

          <form onSubmit={enviar}>
            <div className="login-campo">
              <label className="login-campo-label" htmlFor="dni">DNI</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                <input
                  id="dni"
                  className="login-campo-input"
                  type="text"
                  name="dni"
                  placeholder="Ingrese su DNI"
                  maxLength={8}
                  value={form.dni}
                  onChange={cambiar}
                  required
                />
              </div>
            </div>

            <div className="login-campo">
              <label className="login-campo-label" htmlFor="nombres">NOMBRES</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="nombres"
                  className="login-campo-input"
                  type="text"
                  name="nombres"
                  placeholder="Ingrese sus nombres"
                  value={form.nombres}
                  onChange={cambiar}
                  required

                  maxLength={50}
                />
              </div>
            </div>

            <div className="login-campo">
              <label className="login-campo-label" htmlFor="apellidos">APELLIDOS</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="apellidos"
                  className="login-campo-input"
                  type="text"
                  name="apellidos"
                  placeholder="Ingrese sus apellidos"
                  value={form.apellidos}
                  onChange={cambiar}
                  required
                  maxLength={100}
                />
              </div>
            </div>

            <div className="login-campo">
              <label className="login-campo-label" htmlFor="email">CORREO ELECTRÓNICO</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M22 4L12 13 2 4" />
                </svg>
                <input
                  id="email"
                  className="login-campo-input"
                  type="email"
                  name="email"
                  placeholder="Ingrese su correo"
                  value={form.email}
                  onChange={cambiar}
                  maxLength={50}
                />
              </div>
            </div>

            <div className="login-campo">
              <label className="login-campo-label" htmlFor="telefono">TELÉFONO</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <input
                  id="telefono"
                  className="login-campo-input"
                  type="text"
                  name="telefono"
                  placeholder="Ingrese su teléfono"
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: soloDigitos(e.target.value) })}
                  inputMode="numeric"
                  maxLength={11}
                />
              </div>
            </div>

            <div className="login-campo">
              <label className="login-campo-label" htmlFor="password">CONTRASEÑA</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="password"
                  className="login-campo-input"
                  type={verPass ? 'text' : 'password'}
                  name="password"
                  placeholder="Mínimo 8 caracteres"
                  value={form.password}
                  onChange={cambiar}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className="login-campo-ojo"
                  onClick={() => setVerPass(!verPass)}
                  tabIndex={-1}
                  aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {verPass ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="login-campo">
              <label className="login-campo-label" htmlFor="password2">CONFIRMAR CONTRASEÑA</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="password2"
                  className="login-campo-input"
                  type={verPass ? 'text' : 'password'}
                  name="password2"
                  placeholder="Repita su contraseña"
                  value={form.password2}
                  onChange={cambiar}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className={`login-btn-submit ${enviando ? 'login-btn-loading' : ''}`}
              disabled={enviando}
            >
              {enviando ? (
                <span className="login-btn-spinner" />
              ) : null}
              {enviando ? 'CREANDO CUENTA...' : 'CREAR CUENTA'}
            </button>
          </form>

          <div className="login-registro-link">
            ¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link>
          </div>
        </div>
      </main>

      {/* Pie de página */}
      <footer className="login-footer">
        <svg className="login-footer-candado" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1C8.676 1 6 3.676 6 7v2H4v14h16V9h-2V7c0-3.324-2.676-6-6-6zm0 2c2.276 0 4 1.724 4 4v2H8V7c0-2.276 1.724-4 4-4zm0 10c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z"/>
        </svg>
        Conexión Segura - Portal Interno © 2026 MDJLO
      </footer>
    </div>
  );
}
