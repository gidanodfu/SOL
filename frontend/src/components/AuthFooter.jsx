// SPDX-License-Identifier: MIT
import { Link } from 'react-router-dom';
import { LEGAL_LINKS } from '../legal/documentos';

/**
 * Pie de página legal compartido por las pantallas públicas de autenticación.
 * Sustituye el antiguo mensaje de conexión segura en Login, Registro,
 * RegistroEmpresa y ActivarCuenta.
 */
export default function AuthFooter() {
  return (
    <footer className="login-footer">
      <nav className="login-footer-links" aria-label="Documentos legales">
        {LEGAL_LINKS.map((enlace) => (
          <Link key={enlace.to} to={enlace.to}>
            {enlace.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
