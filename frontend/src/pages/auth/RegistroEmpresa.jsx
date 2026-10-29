// SPDX-License-Identifier: MIT
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import Modal from '../../components/Modal';
import { Boton, Mensaje } from '../../components/UI';
import Turnstile from '../../components/Turnstile';
import TermsCheckbox from '../../components/TermsCheckbox';
import ErrorCampo from '../../components/ErrorCampo';
import AuthFooter from '../../components/AuthFooter';
import LogoMunicipal from '../../components/LogoMunicipal';
import { useTema } from '../../context/ThemeContext';
import { enviarSolicitudEmpresa, verificarRuc } from '../../services/solicitudes';
import { errorApi, soloDigitos } from '../../utils';
import { validarSolicitudEmpresa } from '../../utils/validacionAuth';

export default function RegistroEmpresa() {
  const { modoEfectivo } = useTema();
  const [form, setForm] = useState({
    ruc: '', email: '', telefono: '', representante: '',
    razon_social: '', direccion: '', ruc_verificado: false,
  });
  const [verificando, setVerificando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const tituloRef = useRef(null);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [intento, setIntento] = useState(false);
  const [erroresCampo, setErroresCampo] = useState({});
  const [turnstileToken, setTurnstileToken] = useState(null);
  const turnstileRef = useRef(null);
  const turnstileRequerido = Boolean((import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim());
  const errores = {
    ...(intento ? validarSolicitudEmpresa({ ...form, termsAccepted: aceptaTerminos }) : {}),
    ...erroresCampo,
  };

  const limpiarErrorCampo = (campo) => {
    setErroresCampo((previos) => {
      if (!previos[campo]) return previos;
      const siguientes = { ...previos };
      delete siguientes[campo];
      return siguientes;
    });
  };

  const cambiar = (e) => {
    const { name, value } = e.target;
    setForm((previo) => ({ ...previo, [name]: value }));
    setError(null);
    limpiarErrorCampo(name);
  };

  const consultarRuc = async (e) => {
    e.preventDefault();
    if (!/^\d{11}$/.test(form.ruc)) {
      setErroresCampo((previos) => ({ ...previos, ruc: 'Ingrese un RUC válido de 11 dígitos.' }));
      return;
    }
    setVerificando(true);
    setError(null);
    limpiarErrorCampo('ruc');
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
      const data = err?.response?.data;
      const campos = data?.campos && typeof data.campos === 'object' ? data.campos : {};
      setErroresCampo(campos);
      const det = data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(err));
    } finally {
      setVerificando(false);
    }
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (ok) return;
    setIntento(true);
    setErroresCampo({});
    const erroresValidacion = validarSolicitudEmpresa({ ...form, termsAccepted: aceptaTerminos });
    if (Object.keys(erroresValidacion).length > 0) {
      setError(null);
      return;
    }
    if (!form.ruc_verificado) {
      setErroresCampo({ ruc: 'Verifique el RUC antes de enviar la solicitud.' });
      return;
    }
    if (turnstileRequerido && !turnstileToken) {
      setError('Completa la verificación de seguridad e inténtalo de nuevo.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await enviarSolicitudEmpresa({
        ruc: form.ruc,
        email: form.email,
        telefono: form.telefono,
        representante: form.representante,
        terms_accepted: true,
        turnstile_token: turnstileToken,
      });
      setOk(true);
      setModalAbierto(true);
      setIntento(false);
      setErroresCampo({});
      setForm((f) => ({ ...f, email: '', telefono: '', representante: '' }));
    } catch (err) {
      const data = err?.response?.data;
      const campos = data?.campos && typeof data.campos === 'object' ? data.campos : {};
      setErroresCampo(campos);
      const det = data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : errorApi(err));
    } finally {
      setEnviando(false);
      setTurnstileToken(null);
      turnstileRef.current?.reset();
    }
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    window.setTimeout(() => tituloRef.current?.focus(), 0);
  };

  return (
    <div className="login-institucional login-institucional--registro login-institucional--footer-rounded">
      <main className="login-main">
        <div className="login-marca">
          <LogoMunicipal className="login-logo" />
          <h1 className="login-municipio-nombre">MUNICIPALIDAD DISTRITAL DE JOSÉ LEONARDO ORTIZ</h1>
          <p className="login-sistema">Unidad Funcional del Empleo (UFE) · Sistema de Ofertas Laborales (JLO)</p>
        </div>

        <div className="login-formulario login-formulario-registro">
          <h2 ref={tituloRef} className="login-formulario-titulo" tabIndex={-1}>AFILIACIÓN DE EMPRESA</h2>
          <p className="login-formulario-sub">
            Complete la solicitud; la Municipalidad la revisará y le enviará un correo con el resultado.
          </p>

          <Mensaje>{error}</Mensaje>

          <form onSubmit={enviar} noValidate>
            <div className={`login-campo${errores.ruc ? ' login-campo-error' : ''}`}>
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
                  onChange={(e) => cambiar({ target: { name: 'ruc', value: soloDigitos(e.target.value) } })}
                  disabled={form.ruc_verificado}
                  required
                  aria-invalid={errores.ruc ? true : undefined}
                  aria-describedby={errores.ruc ? 'ruc-error' : undefined}
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
              <ErrorCampo id="ruc-error">{errores.ruc}</ErrorCampo>
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

            <div className={`login-campo${errores.email ? ' login-campo-error' : ''}`}>
              <label className="login-campo-label" htmlFor="email">CORREO CORPORATIVO</label>
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
                  placeholder="ejemplo@empresa.com"
                  value={form.email}
                  onChange={cambiar}
                  maxLength={150}
                  required
                  aria-invalid={errores.email ? true : undefined}
                  aria-describedby={errores.email ? 'email-error' : undefined}
                />
              </div>
              <ErrorCampo id="email-error">{errores.email}</ErrorCampo>
            </div>

            <div className={`login-campo${errores.telefono ? ' login-campo-error' : ''}`}>
              <label className="login-campo-label" htmlFor="telefono">TELÉFONO</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <input
                  id="telefono"
                  className="login-campo-input"
                  type="text"
                  name="telefono"
                  placeholder="Teléfono de contacto (9 u 11 dígitos)"
                  value={form.telefono}
                  onChange={(e) => cambiar({ target: { name: 'telefono', value: soloDigitos(e.target.value) } })}
                  inputMode="numeric"
                  required
                  maxLength={11}
                  aria-invalid={errores.telefono ? true : undefined}
                  aria-describedby={errores.telefono ? 'telefono-error' : undefined}
                />
              </div>
              <ErrorCampo id="telefono-error">{errores.telefono}</ErrorCampo>
            </div>

            <div className={`login-campo${errores.representante ? ' login-campo-error' : ''}`}>
              <label className="login-campo-label" htmlFor="representante">REPRESENTANTE LEGAL</label>
              <div className="login-campo-input-wrapper">
                <svg className="login-campo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="representante"
                  className="login-campo-input"
                  type="text"
                  name="representante"
                  placeholder="Nombre del representante"
                  value={form.representante}
                  onChange={cambiar}
                  maxLength={150}
                  required
                  aria-invalid={errores.representante ? true : undefined}
                  aria-describedby={errores.representante ? 'representante-error' : undefined}
                />
              </div>
              <ErrorCampo id="representante-error">{errores.representante}</ErrorCampo>
            </div>

            <TermsCheckbox
              id="acepta-terminos-empresa"
              checked={aceptaTerminos}
              onChange={(e) => { setAceptaTerminos(e.target.checked); limpiarErrorCampo('terms_accepted'); }}
              error={errores.terms_accepted}
              required
            >
              Al enviar mi solicitud de afiliación, acepto los{' '}
              <a
                href="/terminos-condiciones"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                Términos y Condiciones
              </a>.
            </TermsCheckbox>

            <button type="submit" className={`login-btn-submit ${enviando ? 'login-btn-loading' : ''}`} disabled={enviando || ok}>
              {enviando ? <span className="login-btn-spinner" /> : null}
              {enviando ? 'ENVIANDO SOLICITUD...' : ok ? 'SOLICITUD ENVIADA' : 'ENVIAR SOLICITUD'}
            </button>
          </form>

          <Turnstile
            ref={turnstileRef}
            accion="registro_empresa"
            tema={modoEfectivo}
            onToken={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
          />

          <div className="login-registro-link">
            ¿Ya está afiliado? <Link to="/login">Iniciar sesión</Link>
          </div>
        </div>
      </main>

      <Modal
        abierto={modalAbierto}
        titulo="Solicitud enviada correctamente"
        icono={<CheckCircle2 size={42} strokeWidth={1.8} aria-hidden="true" />}
        alCerrar={cerrarModal}
        tamano="exito"
        etiquetaCerrar="Cerrar"
        acciones={<Boton variante="primario" onClick={cerrarModal}>Cerrar</Boton>}
      >
        <p>Hemos recibido tu solicitud de afiliación al Sistema de Empleo MDJLO. La Municipalidad revisará la información y te notificará el resultado por correo electrónico.</p>
        <p>Revisa tu bandeja de entrada y, si no encuentras nuestro mensaje, comprueba también las carpetas de spam o correo no deseado.</p>
        <p>Si la solicitud ya fue enviada, no necesitas registrarte nuevamente.</p>
      </Modal>

      <AuthFooter rounded />
    </div>
  );
}
