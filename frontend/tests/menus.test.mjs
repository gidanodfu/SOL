// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('FiltroPill y menú de usuario reutilizan la superficie común sin cambiar semántica', () => {
  const buscar = leer('../src/pages/postulante/BuscarEmpleo.jsx');
  const layout = leer('../src/layouts/LayoutPostulante.jsx');

  assert.match(buscar, /import DropdownPanel from '\.\.\/\.\.\/components\/Dropdown\/DropdownPanel'/);
  assert.match(buscar, /<DropdownPanel[\s\S]*role="listbox"/);
  assert.doesNotMatch(buscar, /createPortal/);
  assert.match(layout, /import DropdownPanel from '\.\.\/components\/Dropdown\/DropdownPanel'/);
  assert.match(layout, /<DropdownPanel[\s\S]*role="menu"/);
  assert.match(layout, /aria-haspopup="menu"/);
});
