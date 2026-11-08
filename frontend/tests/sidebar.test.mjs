// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('Administración y Empresa comparten el mismo componente de sidebar', () => {
  for (const archivo of ['LayoutAdmin.jsx', 'LayoutEmpresa.jsx']) {
    const layout = leer(`../src/layouts/${archivo}`);

    assert.match(layout, /import Sidebar from '\.\.\/components\/Sidebar'/);
    assert.match(layout, /<Sidebar\b/);
    assert.match(layout, /onToggle=\{alternar\}/);
  }
});

test('la sidebar es una tarjeta clara sin divisores entre categorías', () => {
  const estilos = leer('../src/styles.css');

  assert.match(estilos, /\.sidebar\s*\{[^}]*background:\s*var\(--white\)/s);
  assert.match(estilos, /\.sidebar\s*\{[^}]*border:\s*1px solid var\(--line\)/s);
  assert.match(estilos, /\.sidebar\s*\{[^}]*border-radius:\s*var\(--sidebar-radius\)/s);
  assert.match(estilos, /\.sidebar\s*\{[^}]*box-shadow:\s*var\(--sombra-tarjeta\)/s);
  assert.doesNotMatch(estilos, /\.side-group \+ \.side-group\s*\{[^}]*border-top/s);
  assert.match(estilos, /\.side-group-title\s*\{[^}]*color:\s*var\(--text-3\)/s);
});

test('el estado activo conserva la paleta institucional de SOL', () => {
  const estilos = leer('../src/styles.css');

  assert.match(
    estilos,
    /\.side-link\.active\s*\{[^}]*background:\s*var\(--sky-2\)[^}]*color:\s*var\(--enlace\)[^}]*font-weight:\s*600/s,
  );
  assert.match(estilos, /\.side-link:hover\s*\{[^}]*background:\s*var\(--sky\)/s);
  assert.match(estilos, /\.side-link:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accion-foco\)/s);
});

test('el pie de usuario mantiene la tarjeta, el avatar y el cierre de sesión', () => {
  const estilos = leer('../src/styles.css');
  const sidebar = leer('../src/components/Sidebar.jsx');

  assert.match(sidebar, /className="side-user"/);
  assert.match(sidebar, /className="side-avatar"/);
  assert.match(sidebar, /<BotonSalir \/>/);
  assert.match(estilos, /\.side-user\s*\{[^}]*background:\s*var\(--fondo\)/s);
  assert.match(estilos, /\.sidebar \.logout\s*\{[^}]*border:\s*1px solid var\(--line\)/s);
});

test('el drawer móvil conserva desplazamiento y radios', () => {
  const estilos = leer('../src/styles.css');

  assert.match(
    estilos,
    /@media \(max-width: 860px\)[\s\S]*?\.sidebar,[\s\S]*?border-radius:\s*0 var\(--radius-xl\) var\(--radius-xl\) 0[^}]*overflow-y:\s*auto/s,
  );
  assert.match(estilos, /\.sidebar\.abierto\s*\{[^}]*transform:\s*translateX\(0\)/s);
});
