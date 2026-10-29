// SPDX-License-Identifier: MIT
import { Link } from 'react-router-dom';
import { LEGAL_LINKS } from '../legal/documentos';
import LogoMunicipal from './LogoMunicipal';

/**
 * Pie de página legal compartido por las pantallas públicas de autenticación.
 * Sustituye el antiguo mensaje de conexión segura en Login, Registro,
 * RegistroEmpresa y ActivarCuenta.
 *
 * `rounded` aplica la variante de superficie redondeada solo a la pantalla de
 * login; el resto de pantallas conserva el pie de página actual.
 */
export default function AuthFooter({ rounded = false }) {
  return (
    <footer className={`login-footer${rounded ? ' login-footer--rounded' : ''}`}>
      <div className="login-footer-inner">
        {/* En login el escudo ya está en la cabecera; evitar duplicarlo. */}
        {!rounded && <LogoMunicipal className="login-footer-logo" />}
        <nav className="login-footer-links" aria-label="Documentos legales">
          {LEGAL_LINKS.map((enlace) => (
            <Link key={enlace.to} to={enlace.to}>
              {enlace.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
