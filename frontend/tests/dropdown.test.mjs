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

test('los 19 Selecto usan el componente compartido y no quedan selects nativos', () => {
  const fuentes = paginas.map((ruta) => leer(`../src/pages/${ruta.split('/src/pages/')[1]}`));
  const usos = fuentes.reduce((total, fuente) => total + (fuente.match(/<Selecto\b/g) || []).length, 0);

  assert.equal(usos, 19);
  assert.equal(fuentes.reduce((total, fuente) => total + (fuente.match(/<select\b/g) || []).length, 0), 0);
  for (const fuente of fuentes) {
    assert.doesNotMatch(fuente, /<Selecto[^>]*onChange=\{\(e\)\s*=>/s);
  }
});

test('Selecto entrega el valor y conserva accesibilidad y opciones declarativas', () => {
  const fuente = leer('../src/components/Selecto.jsx');

  assert.match(fuente, /onChange\?\.\(opcion\.valor\)/);
  assert.match(fuente, /Children\.forEach/);
  assert.match(fuente, /nodo\.type === 'option'/);
  assert.match(fuente, /role="combobox"/);
  assert.match(fuente, /aria-haspopup="listbox"/);
  assert.match(fuente, /aria-expanded=\{abierto\}/);
  assert.match(fuente, /aria-activedescendant/);
  assert.match(fuente, /role="option"/);
  assert.match(fuente, /ArrowDown/);
  assert.match(fuente, /Home/);
  assert.match(fuente, /Escape/);
  assert.doesNotMatch(fuente, /target:\s*\{\s*value/);
});

test('el panel flotante usa portal, alineación central y separación de 10 px', () => {
  const panel = leer('../src/components/Dropdown/DropdownPanel.jsx');
  const posicion = leer('../src/components/Dropdown/useDropdownPosition.js');

  assert.match(panel, /createPortal/);
  assert.match(panel, /align = 'center'/);
  assert.match(panel, /gap = 10/);
  assert.match(panel, /data-placement/);
  assert.match(panel, /--dropdown-notch-left/);
  assert.match(posicion, /centro - ancho \/ 2/);
  assert.match(posicion, /offsetLeft \+ margin/);
  assert.match(posicion, /visualViewport/);
  assert.match(posicion, /ResizeObserver/);
  assert.match(posicion, /scroll', programar, true/);
});
