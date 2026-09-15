import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BotonSalir from '../components/BotonSalir';
import { ETIQUETA_ROL, ROLES } from '../constants';
import { LayoutAdmin } from './LayoutAdmin';
import { LayoutEmpresa } from './LayoutEmpresa';
import { LayoutPostulante } from './LayoutPostulante';

const enlaces = {
  [ROLES.ADMIN]: [
    { a: 'dashboard', texto: 'Dashboard' },
    { a: 'ofertas', texto: 'Ofertas' },
    { a: 'actividades', texto: 'Actividades' },
    { a: 'oportunidades', texto: 'Difusión' },
    { a: 'contrataciones', texto: 'Contratos' },
    { a: 'usuarios', texto: 'Usuarios' },
    { a: 'empresas', texto: 'Empresas' },
    { a: 'solicitudes-empresa', texto: 'Solicitudes' },
  ],
  [ROLES.EMPRESA]: [
    { a: 'dashboard', texto: 'Dashboard' },
    { a: 'ofertas', texto: 'Ofertas' },
    { a: 'postulaciones', texto: 'Postulaciones' },
    { a: 'contrataciones', texto: 'Contrataciones' },
    { a: 'perfil', texto: 'Mi empresa' },
  ],
  [ROLES.POSTULANTE]: [
    { a: 'dashboard', texto: 'Dashboard' },
    { a: 'buscar', texto: 'Buscar empleo' },
    { a: 'oportunidades', texto: 'Ferias y oportunidades' },
    { a: 'postulaciones', texto: 'Mis postulaciones' },
    { a: 'perfil', texto: 'Mi perfil y CV' },
  ],
};

const base = { admin: '/admin', empresa: '/empresa', postulante: '/postulante' };

export function LayoutApp() {
  const { usuario } = useAuth();
  const items = enlaces[usuario?.rol] || [];

  if (usuario?.rol === ROLES.ADMIN) return <LayoutAdmin />;
  if (usuario?.rol === ROLES.EMPRESA) return <LayoutEmpresa />;
  if (usuario?.rol === ROLES.POSTULANTE) return <LayoutPostulante />;

  return (
    <div className="app">
      <header className="cabecera">
        <NavLink to="/" className="marca">
          <strong>Empleo MDJLO</strong>
          <span>Sistema de intermediación laboral</span>
        </NavLink>
        <nav className="nav">
          {items.map((i) => (
            <NavLink key={i.a} to={`${base[usuario.rol]}/${i.a}`} className={({ isActive }) => (isActive ? 'activo' : '')}>
              {i.texto}
            </NavLink>
          ))}
          <NavLink to="/cuenta">Mi cuenta</NavLink>
        </nav>
        <div className="usuario">
          <div>
            <strong>{usuario?.nombres}</strong>
            <small>{ETIQUETA_ROL[usuario?.rol]}</small>
          </div>
          <BotonSalir className="btn btn-gris" />
        </div>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
