// SPDX-License-Identifier: MIT
import { Link } from 'react-router-dom';
import AuthFooter from '../../components/AuthFooter';
import LogoMunicipal from '../../components/LogoMunicipal';
import { LEGAL_DOCUMENTS, LEGAL_LINKS } from '../../legal/documentos';

/**
 * Layout común de los documentos legales públicos. Las tres superficies
 * (encabezado, documento y footer) comparten el ancho del shell legal.
 */
export default function LegalPage({ documentKey, children }) {
  const documento = LEGAL_DOCUMENTS[documentKey];
  const otros = LEGAL_LINKS.filter((enlace) => enlace.to !== documento.path);

  return (
    <div className="legal-page">
      <div className="legal-shell">
        <header className="legal-topbar">
          <Link to="/" className="legal-brand" aria-label="Empleo MDJLO — ir al portal">
            <LogoMunicipal decorative />
            <span>
              <strong>Empleo MDJLO</strong>
              <small>Municipalidad Distrital de José Leonardo Ortiz</small>
            </span>
          </Link>
          <Link to="/login" className="legal-access">Ir al inicio</Link>
        </header>

        <main className="legal-main">
          <article className="legal-doc">
            <header className="legal-doc-head">
              <p className="legal-kicker">Documento institucional</p>
              <h1>{documento.title}</h1>
              <p className="legal-meta">
                Versión {documento.version} · Última actualización: {documento.updated}
              </p>
              <p className="legal-notice">
                Documento preparado para revisión de la Asesoría Jurídica y de la unidad
                responsable de protección de datos de la Municipalidad Distrital de José
                Leonardo Ortiz. No constituye por sí solo una aprobación oficial.
              </p>
            </header>

            <div className="legal-content">{children}</div>

            <nav className="legal-related" aria-label="Otros documentos legales">
              <span>También puede consultar:</span>
              {otros.map((enlace) => (
                <Link key={enlace.to} to={enlace.to}>{enlace.label}</Link>
              ))}
            </nav>
          </article>
        </main>

        <AuthFooter legal />
      </div>
    </div>
  );
}
