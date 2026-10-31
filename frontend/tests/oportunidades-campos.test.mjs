// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('la creación de oportunidades exige los cinco campos existentes', () => {
  const pagina = leer('../src/pages/admin/Oportunidades.jsx');

  assert.match(pagina, /fuente: '', titulo: '', descripcion: '', enlace: '', fecha_publicacion: ''/);
  assert.match(pagina, /<option value="">Seleccionar fuente<\/option>/);
  assert.match(pagina, /Selecciona una fuente válida\./);
  assert.match(pagina, /El título de la oportunidad es obligatorio\./);
  assert.match(pagina, /Introduce una URL válida\./);
  assert.match(pagina, /La fecha de publicación es obligatoria\./);
  assert.match(pagina, /La fecha de publicación no es válida\./);
  assert.match(pagina, /La descripción de la oportunidad es obligatoria\./);

  assert.match(pagina, /esEnlaceSeguro\(enlace\)/);
  assert.match(pagina, /esFechaCalendario\(fecha\)/);
  assert.match(pagina, /textoEnriquecidoVacio\(form\.descripcion\)/);
  assert.match(pagina, /error=\{errores\.fuente\}/);
  assert.match(pagina, /error=\{errores\.titulo\}/);
  assert.match(pagina, /error=\{errores\.enlace\}/);
  assert.match(pagina, /error=\{errores\.fecha_publicacion\}/);
  assert.match(pagina, /aria-invalid=\{errores\.descripcion \? true : undefined\}/);
  assert.match(pagina, /aria-describedby=\{errores\.descripcion \? 'oportunidad-descripcion-error' : undefined\}/);
  assert.match(pagina, /oportunidad-descripcion-error/);
});

test('la validación impide el envío, enfoca el primer error y conserva los datos', () => {
  const pagina = leer('../src/pages/admin/Oportunidades.jsx');

  assert.match(pagina, /const encontrados = esNueva \? validar\(\) : \{\}/);
  assert.match(pagina, /if \(Object\.keys\(encontrados\)\.length > 0\)/);
  assert.match(pagina, /setError\(null\)/);
  assert.match(pagina, /ORDEN_CAMPOS\.find/);
  assert.match(pagina, /enfocarCampo\(primero\)/);
  assert.match(pagina, /return;/);
  assert.match(pagina, /await crearOportunidad\(form\)/);
  assert.match(pagina, /setForm\(\{ \.\.\.form, \[k\]: e\.target\.value \}\)/);
});

test('los errores del backend se muestran por campo sin alerta general', () => {
  const pagina = leer('../src/pages/admin/Oportunidades.jsx');

  assert.match(pagina, /e\?\.response\?\.data\?\.campos/);
  assert.match(pagina, /setErrores\(campos\)/);
  assert.match(pagina, /setError\(null\)/);
});

test('los controles existentes muestran el error debajo del campo', () => {
  const ui = leer('../src/components/UI.jsx');

  assert.match(ui, /export function Campo/);
  assert.match(ui, /export function Selecto/);
  assert.match(ui, /aria-invalid=\{error \? true : undefined\}/);
  assert.match(ui, /aria-describedby=\{error \? errorId : props\['aria-describedby'\]\}/);
  assert.match(ui, /className="campo-mensaje" role="alert"/);
});
