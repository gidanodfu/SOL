// SPDX-License-Identifier: MIT
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Mensaje } from '../../components/UI';
import GoogleButton from '../../components/GoogleButton';
import { ROLES } from '../../constants';
import { errorApi } from '../../utils';

const LOGO_URL = 'https://www.image2url.com/r2/default/images/1788530622409-c587704d-1068-43f2-b9e1-9b8ab867e021.jpeg';
const destinoPorRol = { admin: '/admin/dashboard', empresa: '/empresa/dashboard', postulante: '/postulante/buscar' };

export default function Login() {
  const { login, loginGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [verPass, setVerPass] = useState(false);
  const enProceso = useRef(false);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const destinoPostLogin = (usuario) => {
    const desde = location.state?.from;
    return usuario.rol === 'postulante' && desde ? desde : destinoPorRol[usuario.rol] || '/';
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (enProceso.current) return;
    enProceso.current = true;
    setEnviando(true);
    setError(null);
    try {
      const datos = await login(form.username.trim(), form.password);
      navigate(destinoPostLogin(datos.usuario), { replace: true });
    } catch (err) {
      setError(errorApi(err));
    } finally {
      enProceso.current = false;
      setEnviando(false);
    }
  };

  // Google solo opera para postulantes. Si la cuenta (nueva o existente) tiene
  // el perfil incompleto, se lleva al postulante a completar los datos que
  // Google no aporta; ya completado, ingresa directo a la bolsa de empleo.
  const conGoogle = async (idToken) => {
    if (enProceso.current) return;
    enProceso.current = true;
    setEnviando(true);
    setError(null);
    try {
      const datos = await loginGoogle(idToken);
      const destino = datos.usuario?.rol === ROLES.POSTULANTE && datos.perfil_completo === false
        ? '/postulante/perfil'
        : destinoPostLogin(datos.usuario);
      navigate(destino, { replace: true });
    } catch (err) {
      setError(errorApi(err));
    } finally {
      enProceso.current = false;
      setEnviando(false);
    }
  };

  return (
    <div className="login-institucional">
      <main className="login-main">
        {/* Bloque de marca */}
        <div className="login-marca">
          <img src={LOGO_URL} alt="Escudo de la Municipalidad Distrital de José Leonardo Ortiz" className="login-logo" />
          <h1 className="login-municipio-nombre">MUNICIPALIDAD DISTRITAL DE JOSÉ LEONARDO ORTIZ</h1>
          <p className="login-sistema">Unidad Funcional del Empleo (UFE) · Sistema de Ofertas Laborales (JLO)</p>
        </div>

        {/* Formulario de acceso */}
        <div className="login-formulario">
          <h2 className="login-formulario-titulo">Inicio de sesión</h2>

          <Mensaje>{error}</Mensaje>

          <form onSubmit={enviar}>
            <div className="login-campo">
              <label className="login-campo-label" htmlFor="username">Usuario</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="username"
                  className="login-campo-input"
                  type="text"
                  name="username"
                  placeholder="Ingrese su usuario"
                  value={form.username}
                  onChange={cambiar}
                  autoComplete="username"
                  required

                  maxLength={50}
                />
              </div>
            </div>

            <div className="login-campo">
              <label className="login-campo-label" htmlFor="password">Contraseña</label>
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
                  placeholder="Ingrese su contraseña"
                  value={form.password}
                  onChange={cambiar}
                  autoComplete="current-password"
                  required
                  maxLength={50}
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

            <button
              type="submit"
              className={`login-btn-submit ${enviando ? 'login-btn-loading' : ''}`}
              disabled={enviando}
            >
              {enviando ? (
                <span className="login-btn-spinner" />
              ) : null}
              {enviando ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="login-divisor">O</div>

          <GoogleButton modo="login" onCredencial={conGoogle} />

          <div className="login-registro-link">
            ¿Eres ciudadano? <Link to="/registro">Regístrate aquí</Link>
          </div>
          <div className="login-registro-link">
            ¿Representas a una empresa? <Link to="/registro-empresa">Solicita su afiliación</Link>
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
