// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mensaje } from '../../components/UI';
import { enviarSolicitudEmpresa, verificarRuc } from '../../services/solicitudes';
import { errorApi, esTelefonoValido, soloDigitos } from '../../utils';

const LOGO_URL = 'https://www.image2url.com/r2/default/images/1788530622409-c587704d-1068-43f2-b9e1-9b8ab867e021.jpeg';

export default function RegistroEmpresa() {
  const [form, setForm] = useState({
    ruc: '', email: '', telefono: '', representante: '',
    razon_social: '', direccion: '', ruc_verificado: false,
  });
  const [verificando, setVerificando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const consultarRuc = async (e) => {
    e.preventDefault();
    if (!/^\d{11}$/.test(form.ruc)) {
      setError('Ingrese un RUC válido (11 dígitos) para verificar.');
      return;
    }
    setVerificando(true);
    setError(null);
    try {
      const info = await verificarRuc(form.ruc);
      setForm((f) => ({
        ...f,
        razon_social: info.razon_social || '',
        nombre_comercial: info.nombre_comercial || '',
        direccion: info.direccion || '',
        ruc_verificado: true,
      }));
    } catch (err) {
      const det = err?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(err));
    } finally {
      setVerificando(false);
    }
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (!form.ruc_verificado) {
      setError('Verifique primero el RUC antes de enviar la solicitud.');
      return;
    }
    if (!esTelefonoValido(form.telefono)) {
      setError('El teléfono debe tener 9 u 11 dígitos.');
      return;
    }
    setEnviando(true);
    setError(null);
    setOk(null);
    try {
      await enviarSolicitudEmpresa({
        ruc: form.ruc,
        email: form.email,
        telefono: form.telefono,
        representante: form.representante,
      });
      setOk('Solicitud enviada. La Municipalidad revisará sus datos y le notificará el resultado al correo indicado.');
      setForm((f) => ({ ...f, email: '', telefono: '', representante: '' }));
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
          <h2 className="login-formulario-titulo">AFILIACIÓN DE EMPRESA</h2>
          <p className="login-formulario-sub">
            Complete la solicitud; la Municipalidad la revisará y le enviará un correo con el resultado.
          </p>

          <Mensaje>{error}</Mensaje>
          <Mensaje tipo="exito">{ok}</Mensaje>

          <form onSubmit={enviar}>
            <div className="login-campo">
              <label className="login-campo-label" htmlFor="ruc">RUC</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <path d="M9 22V12h6v10" />
                </svg>
                <input
                  id="ruc"
                  className="login-campo-input login-campo-input-con-boton"
                  type="text"
                  name="ruc"
                  placeholder="Ingrese los 11 dígitos del RUC"
                  maxLength={11}
                  value={form.ruc}
                  onChange={cambiar}
                  disabled={form.ruc_verificado}
                  required
                />
                <button
                  type="button"
                  className="login-btn-verificar"
                  onClick={consultarRuc}
                  disabled={verificando || !/^\d{11}$/.test(form.ruc)}
                >
                  {verificando ? 'Verificando…' : 'Verificar'}
                </button>
              </div>
            </div>

            {form.ruc_verificado && (
              <div className="ruc-resultado">
                <p><strong>{form.razon_social}</strong></p>
                <p>{form.direccion || 'Dirección no disponible'}</p>
                <button type="button" className="login-campo-enlace" onClick={() => setForm((f) => ({ ...f, ruc_verificado: false, razon_social: '', direccion: '' }))}>
                  Cambiar RUC
                </button>
              </div>
            )}

            <div className="login-campo">
              <label className="login-campo-label" htmlFor="email">CORREO CORPORATIVO</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M22 4L12 13 2 4" />
                </svg>
                <input id="email" className="login-campo-input" type="email" name="email" placeholder="ejemplo@empresa.com" value={form.email} onChange={cambiar} required  />
              </div>
            </div>

            <div className="login-campo">
              <label className="login-campo-label" htmlFor="telefono">TELÉFONO</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <input id="telefono" className="login-campo-input" type="text" name="telefono" placeholder="Teléfono de contacto" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: soloDigitos(e.target.value) })} inputMode="numeric" required maxLength={11}/>
              </div>
            </div>

            <div className="login-campo">
              <label className="login-campo-label" htmlFor="representante">REPRESENTANTE LEGAL</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input id="representante" className="login-campo-input" type="text" name="representante" placeholder="Nombre del representante" value={form.representante} onChange={cambiar} required />
              </div>
            </div>

            <button type="submit" className={`login-btn-submit ${enviando ? 'login-btn-loading' : ''}`} disabled={enviando || !form.ruc_verificado}>
              {enviando ? <span className="login-btn-spinner" /> : null}
              {enviando ? 'ENVIANDO SOLICITUD...' : 'ENVIAR SOLICITUD'}
            </button>
          </form>

          <div className="login-registro-link">
            ¿Ya está afiliado? <Link to="/login">Iniciar sesión</Link>
          </div>
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
