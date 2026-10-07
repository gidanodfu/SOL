// SPDX-License-Identifier: MIT
// Base de la API configurable por entorno (VITE_API_URL). Sin valor, se usa el
// mismo origen del frontend (válido detrás de un reverse proxy o subdominio);
// no se fija localhost para no romper despliegues.
const apiConfigurada = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const API_URL = apiConfigurada || (typeof window !== 'undefined' ? window.location.origin : '');

export const ROLES = {
  ADMIN: 'admin',
  EMPRESA: 'empresa',
  POSTULANTE: 'postulante',
};

export const ESTADOS_OFERTA = ['borrador', 'pendiente', 'publicada', 'rechazada', 'cerrada'];
export const ESTADOS_POSTULACION = ['pendiente', 'en_revision', 'seleccionado', 'no_seleccionado'];

/** Situación laboral posterior de una contratación (RF-58). Máximo 4 estados. */
export const SITUACIONES_CONTRATACION = ['contratado', 'finalizado', 'despedido', 'renuncio'];

export const TIPOS_EMPLEO = [
  'tiempo_completo',
  'medio_tiempo',
  'por_horas',
  'practicas',
  'freelance',
  'remoto',
];

export const OPCIONES_FORMACION_REQUERIDA = ['Primaria completa', 'Secundaria completa', 'Técnico', 'Universitario'];
export const OPCIONES_EXPERIENCIA_REQUERIDA = ['Sin experiencia', '6 meses', '1 año', '2 años', '3 años o más'];

export const ETIQUETA_TIPO_EMPLEO = {
  tiempo_completo: 'Tiempo completo',
  medio_tiempo: 'Medio tiempo',
  por_horas: 'Por horas',
  practicas: 'Prácticas',
  freelance: 'Freelance',
  remoto: 'Remoto',
};

export const ETIQUETA_ESTADO_OFERTA = {
  borrador: 'Borrador',
  pendiente: 'Pendiente de revisión',
  publicada: 'Publicada',
  rechazada: 'Rechazada',
  cerrada: 'Cerrada',
};

export const ETIQUETA_ESTADO_POSTULACION = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  seleccionado: 'Seleccionado',
  no_seleccionado: 'No seleccionado',
};

/** Situación laboral de una contratación (etiquetas de UI). */
export const ETIQUETA_SITUACION_CONTRATACION = {
  contratado: 'Contratado',
  finalizado: 'Finalizó contrato',
  despedido: 'Despedido',
  renuncio: 'Renunció',
};

/** Estados de postulación con su color para el gráfico de dona (fuente única). */
export const DONA_ESTADO_POSTULACION = [
  { estado: 'pendiente', color: 'var(--amber)' },
  { estado: 'en_revision', color: 'var(--blue-c)' },
  { estado: 'seleccionado', color: 'var(--green)' },
  { estado: 'no_seleccionado', color: 'var(--gray-c)' },
].map((item) => ({ ...item, etiqueta: ETIQUETA_ESTADO_POSTULACION[item.estado] }));

export const ETIQUETA_ROL = {
  admin: 'Municipalidad',
  empresa: 'Empresa',
  postulante: 'Postulante',
};

/**
 * Transiciones de estado que la empresa puede aplicar (espejo del backend, RF-36).
 * El backend es la autoridad final; aquí solo se usan para mostrar las opciones.
 */
export const TRANSICIONES_POSTULACION = {
  pendiente: ['en_revision', 'no_seleccionado'],
  en_revision: ['seleccionado', 'no_seleccionado'],
  no_seleccionado: ['en_revision'],
  seleccionado: [],
};

/* Fase 5 — actividades y difusión */

export const TIPOS_ACTIVIDAD = ['feria_empleo', 'evento', 'taller', 'capacitacion'];
export const ETIQUETA_TIPO_ACTIVIDAD = {
  feria_empleo: 'Feria de empleo',
  evento: 'Evento',
  taller: 'Taller',
  capacitacion: 'Capacitación',
};
export const ESTADOS_ACTIVIDAD = ['programado', 'en_curso', 'finalizado', 'cancelado'];
export const ETIQUETA_ESTADO_ACTIVIDAD = {
  programado: 'Programado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};
export const MODALIDADES_ACTIVIDAD = [
  { v: 'presencial', l: 'Presencial' },
  { v: 'virtual', l: 'Virtual' },
  { v: 'mixta', l: 'Mixta' },
];

export const FUENTES_OPORTUNIDAD = ['empleos_peru', 'mype_local', 'otro'];
export const ETIQUETA_FUENTE_OPORTUNIDAD = {
  empleos_peru: 'Empleos Perú',
  mype_local: 'MYPE local',
  otro: 'Otra fuente',
};
