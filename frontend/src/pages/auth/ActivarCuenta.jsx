// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Mensaje } from '../../components/UI';
import { activarCuenta, verActivacion } from '../../services/solicitudes';
import { errorApi } from '../../utils';

const LOGO_URL = 'https://www.image2url.com/r2/default/images/1788530622409-c587704d-1068-43f2-b9e1-9b8ab867e021.jpeg';

export default function ActivarCuenta() {
  const { token } = useParams();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [form, setForm] = useState({ password: '', password2: '' });
  const [enviando, setEnviando] = useState(false);
  const [verPass, setVerPass] = useState(false);
  const [activada, setActivada] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const datos = await verActivacion(token);
        setEmpresa(datos);
      } catch (err) {
        setError(errorApi(err));
      } finally {
        setCargando(false);
      }
    })();
  }, [token]);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await activarCuenta(token, form);
      setActivada(true);
    } catch (err) {
      const det = err?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login-institucional">
      <main className="login-main">
        <div className="login-marca">
          <img src={LOGO_URL} alt="Escudo de la Municipalidad Distrital de José Leonardo Ortiz" className="login-logo" />
          <h1 className="login-municipio-nombre">MUNICIPALIDAD DISTRITAL DE JOSÉ LEONARDO ORTIZ</h1>
          <p className="login-sistema">Unidad Funcional del Empleo (UFE) · Sistema de Ofertas Laborales (JLO)</p>
        </div>

        <div className="login-formulario login-formulario-registro">
          {cargando ? (
            <p style={{ textAlign: 'center', color: '#64748b' }}>Validando el enlace…</p>
          ) : activada ? (
            <>
              <h2 className="login-formulario-titulo">¡CUENTA ACTIVADA!</h2>
              <p style={{ fontSize: '0.88rem', color: '#334155', lineHeight: 1.5 }}>
                Su cuenta ha sido activada. Ahora puede iniciar sesión con su correo corporativo y la contraseña que acaba de definir.
              </p>
              <Link to="/login" className="login-btn-submit" style={{ textDecoration: 'none', display: 'flex', marginTop: '1rem' }}>
                IR A INICIAR SESIÓN
              </Link>
            </>
          ) : error && !empresa ? (
            <>
              <h2 className="login-formulario-titulo">ENLACE INVÁLIDO</h2>
              <Mensaje>{error}</Mensaje>
              <div className="login-registro-link">
                <Link to="/registro-empresa">Volver al inicio</Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="login-formulario-titulo">ACTIVA TU CUENTA</h2>
              <p className="login-formulario-sub">
                <strong>{empresa?.razon_social}</strong><br />
                Su cuenta ha sido aprobada por la Municipalidad. Defina su contraseña para activarla.
              </p>

              <Mensaje>{error}</Mensaje>

              <form onSubmit={enviar}>
                <div className="login-campo">
                  <label className="login-campo-label" htmlFor="password">CONTRASEÑA</label>
                  <div className="login-campo-input-wrapper">
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
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="login-campo">
                  <label className="login-campo-label" htmlFor="password2">CONFIRMAR CONTRASEÑA</label>
                  <div className="login-campo-input-wrapper">
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

                <button type="submit" className={`login-btn-submit ${enviando ? 'login-btn-loading' : ''}`} disabled={enviando}>
                  {enviando ? <span className="login-btn-spinner" /> : null}
                  {enviando ? 'ACTIVANDO...' : 'ACTIVAR CUENTA'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      <footer className="login-footer">
        <svg className="login-footer-candado" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1C8.676 1 6 3.676 6 7v2H4v14h16V9h-2V7c0-3.324-2.676-6-6-6zm0 2c2.276 0 4 1.724 4 4v2H8V7c0-2.276 1.724-4 4-4zm0 10c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z" />
        </svg>
        Conexión Segura - Portal Interno © 2026 MDJLO
      </footer>
    </div>
  );
}
