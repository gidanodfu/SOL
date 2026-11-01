// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('el detalle finalizado oculta las acciones administrativas', () => {
  const pagina = leer('../src/pages/admin/Actividades.jsx');

  assert.match(pagina, /const finalizada = actividad\.puede_modificarse === false \|\| estadoEfectivo === 'finalizado'/);
  assert.match(pagina, /acciones=\{puedeGestionar && !finalizada \?/);
  assert.match(pagina, /Esta actividad ha finalizado y ya no puede modificarse\./);
  assert.match(pagina, /Finalizada manualmente\./);
  assert.match(pagina, /Finalizada por fecha de fin\./);
  assert.doesNotMatch(
    pagina,
    /acciones=\{puedeGestionar \?[\s\S]{0,600}<Pencil/,
    'las acciones no deben mostrarse sin comprobar la finalización',
  );
});

test('el acceso a edición vuelve a comprobar la inmutabilidad', () => {
  const pagina = leer('../src/pages/admin/Actividades.jsx');

  assert.match(pagina, /alEditar=\{\(actividad\) => \{/);
  assert.match(pagina, /actividad\.puede_modificarse === false \|\| \(actividad\.estado_efectivo \|\| actividad\.estado\) === 'finalizado'/);
  assert.match(pagina, /setEditor\(\{ id: actividad\.id, fila: actividad \}\)/);
  assert.match(pagina, /if \(finalizada\) \{/);
  assert.match(pagina, /Actividad finalizada/);
});

test('la consulta del detalle y el cierre se conservan', () => {
  const pagina = leer('../src/pages/admin/Actividades.jsx');

  assert.match(pagina, /<Modal[\s\S]*?alCerrar=\{alCerrar\}/);
  assert.match(pagina, /className="actividad-datos" role="group"/);
  assert.match(pagina, /<ActivityImage/);
  assert.match(pagina, /etiqueta: 'Inicio'/);
  assert.match(pagina, /etiqueta: 'Fin'/);
  assert.match(pagina, /etiqueta: 'Lugar'/);
});

test('el listado público se invalida al cambiar una actividad en administración', () => {
  const pagina = leer('../src/pages/admin/Actividades.jsx');
  assert.match(pagina, /queryKey: \['actividades-publicas'\]/);
});
