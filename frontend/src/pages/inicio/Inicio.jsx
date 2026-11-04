// SPDX-License-Identifier: MIT
import { Link } from 'react-router-dom';
import BotonTema from '../../components/BotonTema';
import LogoMunicipal from '../../components/LogoMunicipal';
import { LEGAL_LINKS } from '../../legal/documentos';

const PASOS = [
  {
    numero: '01',
    titulo: 'Explora ofertas',
    texto: 'Consulta las oportunidades laborales disponibles y conoce sus requisitos.',
  },
  {
    numero: '02',
    titulo: 'Crea tu perfil',
    texto: 'Registra tus datos personales y experiencia profesional para participar en los procesos de selección.',
  },
  {
    numero: '03',
    titulo: 'Postula',
    texto: 'Envía tu candidatura y consulta el estado de tus postulaciones.',
  },
];

export default function Inicio() {
  return (
    <div className="inicio-page">
      <header className="inicio-nav">
        <Link to="/inicio" className="inicio-brand" aria-label="Empleo MDJLO — inicio">
          <span className="inicio-brand-mark">
            <LogoMunicipal decorative />
          </span>
          <span className="inicio-brand-text">
            <strong>Empleo MDJLO</strong>
            <span>Sistema de intermediación laboral</span>
          </span>
        </Link>

        <nav className="inicio-nav-acciones" aria-label="Accesos principales">
          <Link to="/postulante/buscar" className="inicio-nav-link">
            Buscar empleo
          </Link>
          <BotonTema />
        </nav>
      </header>

      <section className="inicio-pasos" aria-labelledby="inicio-pasos-titulo">
        <div className="inicio-pasos-head">
          <h2 id="inicio-pasos-titulo">¿Cómo funciona?</h2>
          <p>Encuentra oportunidades y participa en tres sencillos pasos.</p>
        </div>

        <ol className="inicio-pasos-lista">
          {PASOS.map(({ numero, titulo, texto }) => (
            <li key={numero} className="inicio-paso">
              <span className="inicio-paso-numero" aria-hidden="true">{numero}</span>
              <div className="inicio-paso-texto">
                <h3>{titulo}</h3>
                <p>{texto}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="inicio-empresas">
          ¿Representas a una empresa? Incorpora oportunidades laborales y encuentra talento.{' '}
          <Link to="/registro-empresa">Acceso para empresas</Link>
        </p>
      </section>

      <main className="inicio-main">
        <section className="inicio-info" aria-labelledby="inicio-titulo">
          <p className="inicio-eyebrow">Municipalidad Distrital de José Leonardo Ortiz</p>

          <h1 id="inicio-titulo">Conectamos talento con oportunidades laborales.</h1>

          <p className="inicio-intro">
            Empleo MDJLO es el sistema de intermediación laboral de la Municipalidad
            Distrital de José Leonardo Ortiz, que facilita el encuentro entre personas
            que buscan empleo y empresas que necesitan incorporar talento.
          </p>

          <p className="inicio-linea">
            Consulta ofertas · Gestiona tu perfil · Realiza postulaciones
          </p>
        </section>

        <aside className="inicio-acceso" aria-labelledby="inicio-acceso-titulo">
          <h2 id="inicio-acceso-titulo">Accede al sistema</h2>
          <p className="inicio-acceso-sub">¿Eres trabajador o empleador?</p>

          <Link to="/postulante/buscar" className="inicio-cta">
            Explorar ofertas laborales
          </Link>

          <div className="inicio-grupo">
            <h3>Trabajadores</h3>
            <Link to="/registro">Crear cuenta</Link>
            <Link to="/login">Iniciar sesión</Link>
          </div>

          <div className="inicio-grupo">
            <h3>Empleadores</h3>
            <Link to="/registro-empresa">Registrar empresa</Link>
            <Link to="/login">Iniciar sesión</Link>
          </div>
        </aside>
      </main>

      <footer className="inicio-footer">
        <p>Municipalidad Distrital de José Leonardo Ortiz · Unidad Funcional del Empleo</p>
        <nav className="inicio-footer-links" aria-label="Documentos legales">
          {LEGAL_LINKS.map((enlace) => (
            <Link key={enlace.to} to={enlace.to}>
              {enlace.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
