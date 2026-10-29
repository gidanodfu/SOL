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
 * login. `legal` aplica la superficie de las páginas legales, alineada con su
 * encabezado y su tarjeta documental. En ambas variantes el escudo ya está en
 * la cabecera, por lo que se omite en el pie para evitar duplicarlo.
 */
export default function AuthFooter({ rounded = false, legal = false }) {
  const superficie = rounded || legal;
  const clases = ['login-footer'];
  if (rounded) clases.push('login-footer--rounded');
  if (legal) clases.push('login-footer--legal');

  return (
    <footer className={clases.join(' ')}>
      <div className="login-footer-inner">
        {!superficie && <LogoMunicipal className="login-footer-logo" />}
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
