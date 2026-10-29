// SPDX-License-Identifier: MIT
import { esEmailValido, esTelefonoValido } from './validacionCampos.js';
import { passwordCumple } from './password.js';

const texto = (valor) => String(valor ?? '').trim();

/**
 * La verificación del DNI está vinculada al documento exacto y a la credencial
 * emitida por el backend. Cambiar el documento invalida automáticamente el
 * resultado anterior.
 */
export const esDniVerificadoPara = (verificacion, dni) => Boolean(
  verificacion
  && verificacion.token
  && texto(verificacion.dni) !== ''
  && texto(verificacion.dni) === texto(dni),
);

/**
 * Validación inmediata de los formularios públicos de registro. El backend
 * conserva la autoridad final; estas reglas replican los mismos límites para
 * mostrar errores por campo antes de enviar la petición.
 */
export function validarRegistroPostulante({
  dni = '',
  nombres = '',
  apellidos = '',
  email = '',
  telefono = '',
  password = '',
  password2 = '',
  termsAccepted = false,
} = {}) {
  const errores = {};

  if (texto(dni) === '') errores.dni = 'El DNI es obligatorio.';
  else if (!/^\d{8}$/.test(texto(dni))) errores.dni = 'El DNI debe tener 8 dígitos.';

  if (texto(nombres) === '') errores.nombres = 'Los nombres son obligatorios.';
  else if (texto(nombres).length > 100) errores.nombres = 'Los nombres no deben superar 100 caracteres.';

  if (texto(apellidos) === '') errores.apellidos = 'Los apellidos son obligatorios.';
  else if (texto(apellidos).length > 100) errores.apellidos = 'Los apellidos no deben superar 100 caracteres.';

  if (texto(email) === '') errores.email = 'El correo electrónico es obligatorio.';
  else if (!esEmailValido(texto(email))) errores.email = 'Ingrese un correo electrónico válido.';
  else if (texto(email).length > 150) errores.email = 'El correo no debe superar 150 caracteres.';

  if (texto(telefono) === '') errores.telefono = 'El teléfono es obligatorio.';
  else if (!esTelefonoValido(texto(telefono))) errores.telefono = 'El teléfono debe tener 9 u 11 dígitos.';

  if (password === '') errores.password = 'La contraseña es obligatoria.';
  else if (!passwordCumple(password)) errores.password = 'La contraseña no cumple los requisitos indicados.';

  if (password2 === '') errores.password2 = 'Confirma tu contraseña.';
  else if (password !== password2) errores.password2 = 'Las contraseñas no coinciden.';

  if (!termsAccepted) {
    errores.terms_accepted = 'Debes aceptar los Términos y Condiciones para continuar.';
  }

  return errores;
}

export function validarSolicitudEmpresa({
  ruc = '',
  email = '',
  telefono = '',
  representante = '',
  termsAccepted = false,
} = {}) {
  const errores = {};

  if (texto(ruc) === '') errores.ruc = 'El RUC es obligatorio.';
  else if (!/^\d{11}$/.test(texto(ruc))) errores.ruc = 'Ingrese un RUC válido de 11 dígitos.';

  if (texto(email) === '') errores.email = 'El correo corporativo es obligatorio.';
  else if (!esEmailValido(texto(email))) errores.email = 'Ingrese un correo electrónico válido.';
  else if (texto(email).length > 150) errores.email = 'El correo no debe superar 150 caracteres.';

  if (texto(telefono) === '') errores.telefono = 'El teléfono es obligatorio.';
  else if (!esTelefonoValido(texto(telefono))) errores.telefono = 'El teléfono debe tener 9 u 11 dígitos.';

  if (texto(representante) === '') errores.representante = 'Ingrese el nombre del representante legal.';
  else if (texto(representante).length > 150) {
    errores.representante = 'El representante no debe superar 150 caracteres.';
  }

  if (!termsAccepted) {
    errores.terms_accepted = 'Debes aceptar los Términos y Condiciones para continuar.';
  }

  return errores;
}
