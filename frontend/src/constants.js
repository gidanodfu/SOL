// SPDX-License-Identifier: MIT
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '');

export const ROLES = {
  ADMIN: 'admin',
  EMPRESA: 'empresa',
  POSTULANTE: 'postulante',
};

export const ESTADOS_OFERTA = ['borrador', 'publicada', 'cerrada'];
export const ESTADOS_POSTULACION = ['pendiente', 'en_revision', 'preseleccionado', 'contactado', 'seleccionado', 'no_seleccionado'];

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
  publicada: 'Publicada',
  cerrada: 'Cerrada',
};

export const ETIQUETA_ESTADO_POSTULACION = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  preseleccionado: 'Preseleccionado',
  contactado: 'Contactado',
  seleccionado: 'Seleccionado',
  no_seleccionado: 'No seleccionado',
};

/** Estados de postulación con su color para el gráfico de dona (fuente única). */
export const DONA_ESTADO_POSTULACION = [
  { estado: 'pendiente', color: 'var(--amber)' },
  { estado: 'en_revision', color: 'var(--blue-c)' },
  { estado: 'preseleccionado', color: 'var(--blue-tx)' },
  { estado: 'contactado', color: 'var(--blue-dark)' },
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
  en_revision: ['preseleccionado', 'contactado', 'no_seleccionado'],
  preseleccionado: ['contactado', 'seleccionado', 'no_seleccionado'],
  contactado: ['seleccionado', 'no_seleccionado'],
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
