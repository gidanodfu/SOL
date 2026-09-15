import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Metadescripciones y título por ruta. El frontend es una SPA sin SSR, así que
 * el <head> se actualiza en el cliente al navegar (sin dependencias nuevas).
 */
const BASE = 'Empleo MDJLO';

const PAGINAS = {
  '/login': {
    titulo: 'Iniciar sesión',
    descripcion: 'Accede al Sistema de Ofertas Laborales de la Municipalidad Distrital de José Leonardo Ortiz.',
  },
  '/registro': {
    titulo: 'Registro de postulante',
    descripcion: 'Regístrate como postulante y postula a las ofertas de empleo de José Leonardo Ortiz con tu CV.',
  },
  '/registro-empresa': {
    titulo: 'Afiliación de empresa',
    descripcion: 'Solicita la afiliación de tu empresa a la bolsa de empleo municipal de José Leonardo Ortiz.',
  },
  '/postulante/buscar': {
    titulo: 'Buscar empleo',
    descripcion: 'Explora ofertas laborales vigentes en José Leonardo Ortiz y postula con tu currículum.',
  },
  '/postulante/oportunidades': {
    titulo: 'Oportunidades laborales',
    descripcion: 'Convocatorias y oportunidades de empleo difundidas por la Municipalidad de José Leonardo Ortiz.',
  },
  '/postulante/dashboard': {
    titulo: 'Panel del postulante',
    descripcion: 'Revisa el estado de tus postulaciones y la completitud de tu perfil laboral.',
  },
  '/postulante/postulaciones': {
    titulo: 'Mis postulaciones',
    descripcion: 'Consulta el estado y el historial de tus postulaciones a ofertas de empleo.',
  },
  '/postulante/perfil': {
    titulo: 'Mi perfil y CV',
    descripcion: 'Completa tus datos de contacto y sube tu CV para postular a ofertas de empleo.',
  },
  '/postulante/cuenta': {
    titulo: 'Mi cuenta',
    descripcion: 'Administra la seguridad y la contraseña de tu cuenta de postulante.',
  },
  '/empresa/dashboard': {
    titulo: 'Panel de empresa',
    descripcion: 'Gestiona tus ofertas laborales, postulaciones y contrataciones desde un solo panel.',
  },
  '/empresa/perfil': {
    titulo: 'Perfil de empresa',
    descripcion: 'Consulta y actualiza la información y los datos de contacto de tu empresa.',
  },
  '/empresa/ofertas': {
    titulo: 'Ofertas de empleo',
    descripcion: 'Crea, publica y administra las ofertas laborales de tu empresa.',
  },
  '/empresa/postulaciones': {
    titulo: 'Postulaciones recibidas',
    descripcion: 'Revisa los postulantes y sus currículums para tus ofertas de empleo.',
  },
  '/empresa/contrataciones': {
    titulo: 'Contrataciones',
    descripcion: 'Registra y consulta las contrataciones derivadas de tus procesos de selección.',
  },
  '/empresa/cuenta': {
    titulo: 'Mi cuenta',
    descripcion: 'Administra la seguridad y la contraseña de la cuenta de tu empresa.',
  },
  '/admin/dashboard': {
    titulo: 'Panel municipal',
    descripcion: 'Indicadores de gestión de la bolsa de empleo de la Municipalidad de José Leonardo Ortiz.',
  },
  '/admin/usuarios': {
    titulo: 'Usuarios',
    descripcion: 'Administración de usuarios y roles del sistema de empleo municipal.',
  },
  '/admin/empresas': {
    titulo: 'Empresas',
    descripcion: 'Administración de las empresas afiliadas a la bolsa de empleo municipal.',
  },
  '/admin/solicitudes-empresa': {
    titulo: 'Solicitudes de empresa',
    descripcion: 'Revisión y aprobación de solicitudes de afiliación de empresas.',
  },
  '/admin/ofertas': {
    titulo: 'Ofertas laborales',
    descripcion: 'Supervisión de las ofertas laborales publicadas en la bolsa de empleo.',
  },
  '/admin/actividades': {
    titulo: 'Actividades de empleo',
    descripcion: 'Gestión de ferias, talleres y capacitaciones de la Unidad Funcional del Empleo.',
  },
  '/admin/oportunidades': {
    titulo: 'Difusión de oportunidades',
    descripcion: 'Publicación de convocatorias y oportunidades laborales para los postulantes.',
  },
  '/admin/contrataciones': {
    titulo: 'Contrataciones',
    descripcion: 'Reporte de las contrataciones registradas por las empresas afiliadas.',
  },
};

const DEFECTO = {
  titulo: 'Sistema de Ofertas Laborales',
  descripcion: 'Sistema de intermediación laboral de la Municipalidad Distrital de José Leonardo Ortiz.',
};

export default function SeoMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const pagina = PAGINAS[pathname] || DEFECTO;
    document.title = `${pagina.titulo} · ${BASE}`;

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', pagina.descripcion);
  }, [pathname]);

  return null;
}
