// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('la carga de CV ya no muestra ni bloquea por cuota mensual', () => {
  const componente = leer('../src/components/CvUploader.jsx');

  assert.doesNotMatch(componente, /limite_mensual/);
  assert.doesNotMatch(componente, /Límite mensual de CV alcanzado/);
  assert.doesNotMatch(componente, /restantes/);
});

test('la carga de CV informa el Retry-After del rate limiting', () => {
  const componente = leer('../src/components/CvUploader.jsx');

  assert.match(componente, /retry-after/);
  assert.match(componente, /reintente en/);
});
