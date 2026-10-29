// SPDX-License-Identifier: MIT
import { Code2, ExternalLink, GitBranch, Info, UserRound } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { ROLES, VERSION_SISTEMA } from '../../constants';

const PERFIL_GITHUB = 'https://github.com/gidanodfu';
const PERFIL_COLABORADOR_GITHUB = 'https://github.com/jhonalo9';
const PERFIL_JESUS_GITHUB = 'https://github.com/JesusAndreBS';
const REPOSITORIO_GITHUB = 'https://github.com/gidanodfu/SOL';

const INTRO = 'Conoce el sistema Empleo MDJLO y el desarrollo de la plataforma.';
const DESCRIPCION_SOL =
  'SOL es el Sistema de Ofertas Laborales de la Municipalidad Distrital de José Leonardo Ortiz. ' +
  'Facilita la intermediación laboral mediante la publicación y consulta de ofertas, la gestión ' +
  'de postulaciones y los procesos de revisión correspondientes.';

/**
 * Página institucional compartida por Administración, Empresa y Postulante.
 * Se renderiza dentro del layout de cada perfil. Administración ya muestra el
 * título en su topbar; en los demás paneles la página aporta el encabezado
 * visible.
 */
export default function AcercaDe() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === ROLES.ADMIN;

  return (
    <div className="about-page">
      {!esAdmin && <PageHeader titulo="Acerca de" descripcion={INTRO} />}

      <div className="about-grid">
        <TarjetaInfo id="about-sistema" Icono={Info} titulo="Sistema Empleo MDJLO">
          <dl className="about-datos">
            <div className="about-dato">
              <dt>Nombre</dt>
              <dd>Empleo MDJLO</dd>
            </div>
            <div className="about-dato">
              <dt>Versión</dt>
              <dd>{VERSION_SISTEMA}</dd>
            </div>
          </dl>
          <p className="about-texto">{DESCRIPCION_SOL}</p>
        </TarjetaInfo>

        <TarjetaInfo id="about-desarrollo" Icono={Code2} titulo="Desarrollo del sistema">
          <PerfilDesarrollo
            nombre="Josue David"
            rol="Desarrollador principal"
             usuario="gidanodfu"
            url={PERFIL_GITHUB}
            etiqueta="Perfil de GitHub de Josue David"
          />

          <div className="about-separador" role="presentation" />

          <PerfilDesarrollo
            nombre="Jhonatan Lopez"
            usuario="jhonalo9"
            rol="Colaborador"
            url={PERFIL_COLABORADOR_GITHUB}
            etiqueta="Perfil de GitHub de jhonalo9, colaborador"
          />

          <div className="about-separador" role="presentation" />

          <PerfilDesarrollo
            nombre="Jesus Andre"
            usuario="JesusAndreBS"
            rol="Colaborador"
            url={PERFIL_JESUS_GITHUB}
            etiqueta="Perfil de GitHub de JesusAndreBS, colaborador"
          />

          <div className="about-separador" role="presentation" />

          <h3>Repositorio del proyecto</h3>
          <a
            className="about-link"
            href={REPOSITORIO_GITHUB}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ver repositorio del proyecto SOL en GitHub"
          >
            <GitBranch size={17} aria-hidden="true" />
            <span>Ver repositorio en GitHub</span>
            <ExternalLink className="about-link-ext" size={14} aria-hidden="true" />
          </a>
        </TarjetaInfo>
      </div>
    </div>
  );
}

function PerfilDesarrollo({ nombre, usuario, rol, url, etiqueta }) {
  return (
    <div className="about-perfil">
      <div className="about-dev">
        <span className="about-dev-avatar" aria-hidden="true">
          <UserRound size={20} />
        </span>
        <span className="about-dev-info">
          <strong>{nombre}</strong>
          <small>
            {rol}
            {usuario ? ` · ${usuario}` : ''}
          </small>
        </span>
      </div>

      <a
        className="about-link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={etiqueta}
      >
        <UserRound size={17} aria-hidden="true" />
        <span>Perfil de GitHub</span>
        <ExternalLink className="about-link-ext" size={14} aria-hidden="true" />
      </a>
    </div>
  );
}

function TarjetaInfo({ id, Icono, titulo, children }) {
  return (
    <section className="tarjeta about-card" aria-labelledby={id}>
      <header className="about-card-head">
        <span className="about-card-icon" aria-hidden="true">
          <Icono size={20} strokeWidth={2} />
        </span>
        <h2 id={id}>{titulo}</h2>
      </header>
      {children}
    </section>
  );
}
