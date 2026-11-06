// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('login envía Turnstile en contraseña y Google con acción auth', () => {
  const pagina = leer('../src/pages/auth/Login.jsx');
  const servicios = leer('../src/services/auth.js');

  assert.match(pagina, /accion="auth"/);
  assert.match(pagina, /login\(form\.username\.trim\(\), form\.password, turnstileToken\)/);
  assert.match(pagina, /loginGoogle\(idToken, turnstileToken\)/);
  assert.match(pagina, /turnstileRequerido && !turnstileToken/);
  assert.match(servicios, /loginGoogle = \(idToken, turnstileToken\)/);
  assert.match(servicios, /cuerpo\.turnstile_token = turnstileToken/);
});

test('registro envía Turnstile en alta manual y Google con acción auth', () => {
  const pagina = leer('../src/pages/auth/Registro.jsx');

  assert.match(pagina, /accion="auth"/);
  assert.match(pagina, /turnstile_token: turnstileToken/);
  assert.match(pagina, /loginGoogle\(idToken, turnstileToken\)/);
  assert.match(pagina, /turnstileRequerido && !turnstileToken/);
});

test('afiliación empresarial conserva acción y token de Turnstile', () => {
  const pagina = leer('../src/pages/auth/RegistroEmpresa.jsx');

  assert.match(pagina, /accion="registro_empresa"/);
  assert.match(pagina, /turnstile_token: turnstileToken/);
  assert.match(pagina, /turnstileRequerido && !turnstileToken/);
});

test('el servicio de Turnstile no expone secretos y controla carga y error', () => {
  const componente = leer('../src/components/Turnstile.jsx');

  assert.match(componente, /VITE_TURNSTILE_SITE_KEY/);
  assert.doesNotMatch(componente, /secretKey|TURNSTILE_SECRET/);
  assert.match(componente, /SCRIPT_ID/);
  assert.match(componente, /CARGA_TIMEOUT_MS/);
  assert.match(componente, /onError/);
  assert.match(componente, /expired-callback/);
  assert.match(componente, /error-callback/);
  assert.match(componente, /window\.turnstile\.remove/);
});
