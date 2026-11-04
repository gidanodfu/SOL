// SPDX-License-Identifier: MIT
import { Link } from 'react-router-dom';
import {
  Briefcase,
  CalendarDays,
  Check,
  FileCheck2,
  KeyRound,
  Megaphone,
  Search,
  UserRound,
} from 'lucide-react';
import BotonTema from '../../components/BotonTema';
import LogoMunicipal from '../../components/LogoMunicipal';
import { useAuth } from '../../context/AuthContext';
import { LEGAL_LINKS } from '../../legal/documentos';
import { rutaPanel } from '../../constants';

const CAPACIDADES = [
  {
    Icono: Search,
    titulo: 'Búsqueda de empleo',
    texto: 'Consulta las ofertas laborales disponibles y utiliza los filtros para encontrar oportunidades.',
  },
  {
    Icono: UserRound,
    titulo: 'Perfil profesional',
    texto: 'Registra tus datos y administra tu currículum vitae.',
  },
  {
    Icono: FileCheck2,
    titulo: 'Postulaciones',
    texto: 'Presenta tu candidatura y consulta el estado de tus procesos.',
  },
  {
    Icono: Briefcase,
    titulo: 'Empresas',
    texto: 'Solicita afiliación, publica ofertas y gestiona las candidaturas recibidas.',
  },
  {
    Icono: Megaphone,
    titulo: 'Oportunidades',
    texto: 'Consulta actividades, ferias, talleres y convocatorias difundidas.',
  },
];

const COMO_FUNCIONA = [
  {
    Icono: UserRound,
    titulo: 'Para quienes buscan empleo',
    texto: 'Consulta ofertas, crea tu perfil y presenta postulaciones.',
  },
  {
    Icono: Briefcase,
    titulo: 'Para las empresas',
    texto: 'Incorpora oportunidades laborales y administra sus procesos de selección.',
  },
  {
    Icono: CalendarDays,
    titulo: 'Para la municipalidad',
    texto: 'Facilita la gestión y difusión de oportunidades, actividades y servicios de intermediación laboral.',
  },
];

export default function Inicio() {
  const { usuario } = useAuth();

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
          {usuario ? (
            <Link to={rutaPanel(usuario.rol)} className="inicio-nav-link solid">
              Mi panel
            </Link>
          ) : (
            <>
              <Link to="/login" className="inicio-nav-link">
                Iniciar sesión
              </Link>
              <Link to="/registro" className="inicio-nav-link solid">
                Registrarme
              </Link>
            </>
          )}
          <BotonTema />
        </nav>
      </header>

      <main className="inicio-main">
        <section className="inicio-info" aria-labelledby="inicio-titulo">
          <p className="inicio-eyebrow">
            <span>Municipalidad Distrital de José Leonardo Ortiz</span>
            <span>Unidad Funcional del Empleo</span>
          </p>

          <h1 id="inicio-titulo">Conectamos talento local con oportunidades laborales.</h1>

          <p className="inicio-intro">
            Empleo MDJLO es el sistema de intermediación laboral de la Municipalidad
            Distrital de José Leonardo Ortiz, creado para facilitar el encuentro entre
            personas que buscan empleo y empresas que necesitan incorporar talento.
          </p>
          <p className="inicio-intro">
            A través de esta plataforma puedes consultar ofertas laborales, conocer
            oportunidades y actividades de empleo, gestionar tu perfil profesional y
            realizar tus postulaciones en línea.
          </p>

          <ul className="inicio-capacidades" aria-label="Capacidades del sistema">
            {CAPACIDADES.map(({ Icono, titulo, texto }) => (
              <li key={titulo} className="inicio-capacidad">
                <span className="inicio-capacidad-icono" aria-hidden="true">
                  <Icono size={18} />
                </span>
                <span className="inicio-capacidad-texto">
                  <strong>{titulo}</strong>
                  <span>{texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="inicio-acceso" aria-labelledby="inicio-acceso-titulo">
          <span className="inicio-acceso-etiqueta">Acceso rápido</span>
          <h2 id="inicio-acceso-titulo">¿Eres trabajador o empleador?</h2>
          <p className="inicio-acceso-sub">Regístrate o inicia sesión aquí.</p>

          <Link to="/postulante/buscar" className="inicio-cta">
            <Search size={19} aria-hidden="true" />
            <span>Busca empleo, crea tu cuenta y descubre nuevas oportunidades.</span>
          </Link>

          <div className="inicio-grupo">
            <h3>Para trabajadores</h3>
            <Link to="/postulante/buscar">
              <span>Buscar empleo</span>
              <Check size={16} aria-hidden="true" />
            </Link>
            <Link to="/registro">
              <span>Crear cuenta</span>
              <Check size={16} aria-hidden="true" />
            </Link>
            <Link to="/login">
              <span>Iniciar sesión</span>
              <KeyRound size={16} aria-hidden="true" />
            </Link>
          </div>

          <div className="inicio-grupo">
            <h3>Para empleadores</h3>
            <Link to="/registro-empresa">
              <span>Registro de empresa</span>
              <Briefcase size={16} aria-hidden="true" />
            </Link>
            <Link to="/login">
              <span>Iniciar sesión</span>
              <KeyRound size={16} aria-hidden="true" />
            </Link>
          </div>
        </aside>
      </main>

      <section className="inicio-como" aria-labelledby="inicio-como-titulo">
        <h2 id="inicio-como-titulo">Una plataforma para conectar oportunidades.</h2>
        <div className="inicio-como-grid">
          {COMO_FUNCIONA.map(({ Icono, titulo, texto }) => (
            <article key={titulo} className="inicio-como-bloque">
              <span className="inicio-como-icono" aria-hidden="true">
                <Icono size={20} />
              </span>
              <div>
                <h3>{titulo}</h3>
                <p>{texto}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

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
