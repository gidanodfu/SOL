// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const recorrer = (dir) => readdirSync(dir).flatMap((nombre) => {
  const ruta = join(dir, nombre);
  return statSync(ruta).isDirectory() ? recorrer(ruta) : [ruta];
});
const paginas = recorrer(new URL('../src/pages', import.meta.url).pathname)
  .filter((ruta) => ruta.endsWith('.jsx'));

test('los 12 campos temporales migraron y no quedan inputs date nativos', () => {
  const fuentes = paginas.map((ruta) => leer(`../src/pages/${ruta.split('/src/pages/')[1]}`));
  const filtro = leer('../src/components/FiltroPeriodo.jsx');
  const todos = [...fuentes, filtro];

  assert.equal(fuentes.reduce((total, fuente) => total + (fuente.match(/<FechaHoraCampo\b/g) || []).length, 0), 10);
  assert.equal((filtro.match(/<FechaHoraCampo\b/g) || []).length, 2);
  for (const fuente of todos) {
    assert.doesNotMatch(fuente, /type="date(?:time-local)?"/);
  }
});
