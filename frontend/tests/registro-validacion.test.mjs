// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validarRegistroPostulante,
  validarSolicitudEmpresa,
} from '../src/utils/validacionAuth.js';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

const postulanteValido = {
  dni: '12345678',
  nombres: 'Ana María',
  apellidos: 'Torres Ñúñez',
  email: 'ana.torres@example.pe',
  telefono: '987654321',
  password: 'Clave123!',
  password2: 'Clave123!',
  termsAccepted: true,
};

const empresaValida = {
  ruc: '20601234567',
  email: 'contacto@empresa.pe',
  telefono: '987654321',
  representante: 'José Pérez',
  termsAccepted: true,
};

test('el registro de postulante exige todos los campos manuales', () => {
  const errores = validarRegistroPostulante({});
  for (const campo of ['dni', 'nombres', 'apellidos', 'email', 'telefono', 'password', 'password2', 'terms_accepted']) {
    assert.ok(errores[campo], `Falta el error de ${campo}`);
  }
  assert.deepEqual(validarRegistroPostulante(postulanteValido), {});
});

test('el registro de postulante rechaza espacios, formatos y contraseñas inválidas', () => {
  const errores = validarRegistroPostulante({
    ...postulanteValido,
    dni: '123',
    nombres: '   ',
    apellidos: '\t',
    email: 'no-es-correo',
    telefono: '12345678',
    password: 'corta',
    password2: 'Otra123!',
    termsAccepted: false,
  });

  for (const campo of ['dni', 'nombres', 'apellidos', 'email', 'telefono', 'password', 'password2', 'terms_accepted']) {
    assert.ok(errores[campo], `Falta el error de ${campo}`);
  }
  assert.equal(errores.password, 'La contraseña no cumple los requisitos indicados.');
  assert.equal(errores.password2, 'Las contraseñas no coinciden.');
});

test('el registro de postulante acepta nombres compuestos, tildes y ñ', () => {
  assert.deepEqual(validarRegistroPostulante(postulanteValido), {});
});

test('la solicitud de empresa exige RUC, correo, teléfono, representante y términos', () => {
  const errores = validarSolicitudEmpresa({});
  for (const campo of ['ruc', 'email', 'telefono', 'representante', 'terms_accepted']) {
    assert.ok(errores[campo], `Falta el error de ${campo}`);
  }
  assert.deepEqual(validarSolicitudEmpresa(empresaValida), {});
});

test('la solicitud de empresa rechaza formatos inválidos y representante vacío', () => {
  const errores = validarSolicitudEmpresa({
    ...empresaValida,
    ruc: '2060',
    email: 'sin-arroba',
    telefono: '123',
    representante: '   ',
    termsAccepted: false,
  });

  for (const campo of ['ruc', 'email', 'telefono', 'representante', 'terms_accepted']) {
    assert.ok(errores[campo], `Falta el error de ${campo}`);
  }
});

test('los formularios conectan la validación por campo y conservan Google', () => {
  const registro = leer('../src/pages/auth/Registro.jsx');
  const empresa = leer('../src/pages/auth/RegistroEmpresa.jsx');
  const terms = leer('../src/components/TermsCheckbox.jsx');
  const estilos = leer('../src/styles.css');

  assert.match(registro, /validarRegistroPostulante/);
  assert.match(registro, /<form onSubmit=\{enviar\} noValidate>/);
  assert.match(registro, /<ErrorCampo id="email-error">/);
  assert.match(registro, /<ErrorCampo id="telefono-error">/);
  assert.match(registro, /<ErrorCampo id="password2-error">/);
  assert.match(registro, /<TermsCheckbox[\s\S]*?required[\s\S]*?<\/TermsCheckbox>/);
  assert.match(registro, /loginGoogle/);
  assert.match(registro, /noValidate/);

  assert.match(empresa, /validarSolicitudEmpresa/);
  assert.match(empresa, /<form onSubmit=\{enviar\} noValidate>/);
  assert.match(empresa, /<ErrorCampo id="ruc-error">/);
  assert.match(empresa, /<ErrorCampo id="representante-error">/);
  assert.match(empresa, /<TermsCheckbox[\s\S]*?required[\s\S]*?<\/TermsCheckbox>/);

  assert.match(terms, /required=\{required\}/);
  assert.match(terms, /aria-required/);
  assert.match(estilos, /\.login-campo-error \.login-campo-input/);
  assert.match(estilos, /\.login-campo-mensaje/);
});
