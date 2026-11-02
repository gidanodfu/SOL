// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('useAccion conserva los errores por campo del backend', () => {
  const hook = leer('../src/hooks/useAccion.js');

  assert.match(hook, /setCampos\(\{\}\)/);
  assert.match(hook, /data\?\.campos/);
  assert.match(hook, /return \{ ejecutar, enviando, error, setError, campos \}/);
});

test('el perfil de postulante muestra errores de contacto y fecha', () => {
  const pagina = leer('../src/pages/postulante/Perfil.jsx');

  assert.match(pagina, /error=\{campos\.telefono\}/);
  assert.match(pagina, /error=\{campos\.fecha_nacimiento\}/);
});

test('el perfil de empresa muestra errores de contacto', () => {
  const pagina = leer('../src/pages/empresa/Perfil.jsx');

  assert.match(pagina, /error=\{campos\.telefono\}/);
  assert.match(pagina, /error=\{campos\.email\}/);
});

test('contrataciones muestra los errores de fecha y motivo por campo', () => {
  const pagina = leer('../src/pages/empresa/Contrataciones.jsx');

  assert.match(pagina, /error=\{errores\.fecha_situacion\}/);
  assert.match(pagina, /id="contratacion-motivo_situacion"/);
  assert.match(pagina, /errores\.motivo_situacion/);
  assert.match(pagina, /contratacion-motivo_situacion-error/);
});
