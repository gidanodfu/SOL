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
          <p className="inicio-eyebrow">
            Municipalidad Distrital de José Leonardo Ortiz · Unidad Funcional del Empleo
          </p>

          <h1 id="inicio-titulo">
            Consulta ofertas laborales y encuentra oportunidades en todo Chiclayo.
          </h1>

          <p className="inicio-intro">
            El Portal de Empleo MDJLO permite consultar ofertas laborales publicadas,
            revisar sus requisitos y fechas de cierre, crear un perfil profesional y
            registrar postulaciones en línea.
          </p>

          <p className="inicio-linea">
            Ofertas laborales · Perfil profesional · Seguimiento de postulaciones
          </p>
        </section>

        <aside className="inicio-acceso" aria-labelledby="inicio-acceso-titulo">
          <h2 id="inicio-acceso-titulo">Accede al Portal laboral</h2>
          <p className="inicio-acceso-sub">Selecciona cómo deseas participar en el portal</p>

          <section className="inicio-acceso-grupo" aria-labelledby="acceso-trabajadores">
            <h3 id="acceso-trabajadores">Trabajadores</h3>
            <p className="inicio-acceso-descripcion">
              Encuentra oportunidades laborales y gestiona tus postulaciones
            </p>
            <Link to="/postulante/buscar" className="inicio-cta">
              Explorar ofertas laborales
            </Link>
            <div className="inicio-acceso-enlaces inicio-acceso-enlaces--trabajadores">
              <Link to="/registro">Crear cuenta</Link>
              <Link to="/login" aria-label="Iniciar sesión como trabajador">Iniciar sesión</Link>
            </div>
          </section>

          <div className="inicio-acceso-divisor" role="separator" />

          <section className="inicio-acceso-grupo" aria-labelledby="acceso-empleadores">
            <h3 id="acceso-empleadores">Empleadores</h3>
            <p className="inicio-acceso-descripcion">
              Publica oportunidades laborales y encuentra talento para tu empresa
            </p>
            <div className="inicio-acceso-enlaces inicio-acceso-enlaces--empleadores">
              <Link to="/registro-empresa">Registrar empresa</Link>
              <Link to="/login" aria-label="Iniciar sesión como empleador">Iniciar sesión</Link>
            </div>
          </section>
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
