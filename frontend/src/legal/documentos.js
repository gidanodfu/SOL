// SPDX-License-Identifier: MIT

/**
 * Versión editorial de los Términos y Condiciones.
 * Debe coincidir con App\Libraries\Terminos::VERSION en el backend.
 */
export const TERMS_VERSION = '1.0';
export const TERMS_UPDATED_AT = '23 de octubre de 2026';
export const LEGAL_UPDATED_AT = '23 de octubre de 2026';

export const LEGAL_LINKS = [
  { to: '/politica-privacidad', label: 'Política de Privacidad' },
  { to: '/terminos-condiciones', label: 'Términos y Condiciones' },
  { to: '/aviso-legal', label: 'Aviso Legal' },
  { to: '/politica-cookies', label: 'Política de Cookies' },
];

export const LEGAL_DOCUMENTS = {
  privacidad: {
    title: 'Política de Privacidad',
    path: '/politica-privacidad',
    version: '1.0',
    updated: LEGAL_UPDATED_AT,
  },
  terminos: {
    title: 'Términos y Condiciones',
    path: '/terminos-condiciones',
    version: TERMS_VERSION,
    updated: TERMS_UPDATED_AT,
  },
  aviso: {
    title: 'Aviso Legal',
    path: '/aviso-legal',
    version: '1.0',
    updated: LEGAL_UPDATED_AT,
  },
  cookies: {
    title: 'Política de Cookies',
    path: '/politica-cookies',
    version: '1.0',
    updated: LEGAL_UPDATED_AT,
  },
};
