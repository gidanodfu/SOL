// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('el detalle de actividad usa el modal amplio y una ficha compacta', () => {
  const pagina = leer('../src/pages/admin/Actividades.jsx');
  const estilos = leer('../src/styles.css');

  assert.match(pagina, /tamano="detalle"/);
  assert.match(pagina, /className="actividad-datos" role="group"/);
  assert.match(pagina, /actividad-dato__etiqueta/);
  assert.match(pagina, /actividad-dato__valor/);
  assert.match(pagina, /actividad-detalle-estado/);
  assert.match(pagina, /actividad-detalle-media/);
  assert.match(pagina, /actividad-detalle-imagen/);
  assert.match(estilos, /\.modal-detalle \{ max-width: 900px; \}/);
  assert.match(estilos, /\.actividad-datos \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(estilos, /@media \(max-width: 900px\)[\s\S]*?\.actividad-datos \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(estilos, /@media \(max-width: 560px\)[\s\S]*?\.actividad-datos \{ grid-template-columns: 1fr;/);
});

test('los campos opcionales no dejan etiquetas vacías y el enlace es independiente', () => {
  const pagina = leer('../src/pages/admin/Actividades.jsx');

  assert.match(pagina, /\.filter\(\(dato\) => dato\.valor !== null && dato\.valor !== undefined && String\(dato\.valor\)\.trim\(\) !== ''\)/);
  assert.match(pagina, /actividad\.fecha_fin \? fechaHoraLima\(actividad\.fecha_fin\) : null/);
  assert.match(pagina, /actividad\.lugar/);
  assert.match(pagina, /ETIQUETA_MODALIDAD\[actividad\.modalidad\]/);
  assert.match(pagina, /actividad\.organizador \|\| 'MDJLO'/);
  assert.match(pagina, /const enlaceSeguro = actividad\.enlace && esEnlaceSeguro\(actividad\.enlace\)/);
  assert.match(pagina, /target="_blank" rel="noopener noreferrer"/);
  assert.match(pagina, /actividad-detalle-enlace/);
  assert.match(pagina, /actividad-detalle-descripcion/);
});

test('las fechas del detalle se interpretan en America/Lima', () => {
  const utilidades = leer('../src/utils.js');
  const pagina = leer('../src/pages/admin/Actividades.jsx');

  assert.match(utilidades, /export const fechaHoraLima/);
  assert.match(utilidades, /timeZone: 'America\/Lima'/);
  assert.match(pagina, /fechaHoraLima\(actividad\.fecha_inicio\)/);
  assert.match(pagina, /fechaHoraLima\(actividad\.fecha_fin\)/);
});

test('la finalización conserva el modo lectura sin acciones', () => {
  const pagina = leer('../src/pages/admin/Actividades.jsx');

  assert.match(pagina, /const finalizada = actividad\.puede_modificarse === false \|\| estadoEfectivo === 'finalizado'/);
  assert.match(pagina, /acciones=\{puedeGestionar && !finalizada \?/);
  assert.match(pagina, /Esta actividad ha finalizado y ya no puede modificarse\./);
  assert.match(pagina, /Finalizada manualmente\./);
  assert.match(pagina, /Finalizada por fecha de fin\./);
});
