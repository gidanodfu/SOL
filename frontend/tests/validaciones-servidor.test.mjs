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

  assert.match(pagina, /errores\.fecha_situacion/);
  assert.match(pagina, /aria-invalid=\{errores\.fecha_situacion/);
  assert.match(pagina, /id="contratacion-motivo_situacion"/);
  assert.match(pagina, /errores\.motivo_situacion/);
  assert.match(pagina, /contratacion-motivo_situacion-error/);
});

test('contrataciones comparte las mismas cuatro secciones en alta y edición', () => {
  const pagina = leer('../src/pages/empresa/Contrataciones.jsx');

  for (const titulo of [
    '01 · Candidato seleccionado',
    '02 · Condiciones de contratación',
    '03 · Situación laboral',
    '04 · Observaciones adicionales',
  ]) {
    assert.ok(pagina.includes(titulo), `falta la sección: ${titulo}`);
  }

  assert.match(pagina, /!esEdicion && \(\s*<Selecto/);
  assert.match(pagina, /La postulación vinculada a esta contratación no se puede cambiar/);
  assert.match(pagina, /contratacion-candidato/);
  assert.match(pagina, /<Estado valor="seleccionado"/);
});

test('la situación laboral es un selector visual de cuatro radios nativos', () => {
  const pagina = leer('../src/pages/empresa/Contrataciones.jsx');

  assert.match(pagina, /SITUACIONES_CONTRATACION\.map/);
  assert.match(pagina, /type="radio"/);
  assert.match(pagina, /name="contratacion-situacion_laboral"/);
  assert.match(pagina, /contratacion-situacion-texto/);
  assert.match(pagina, /<fieldset className=/);
  assert.match(pagina, /<legend className="form-seccion-titulo">03 · Situación laboral<\/legend>/);
  assert.doesNotMatch(pagina, /<Selecto etiqueta="Situación laboral"/);
});

test('el motivo es obligatorio solo para despedido y renuncio', () => {
  const pagina = leer('../src/pages/empresa/Contrataciones.jsx');

  assert.match(pagina, /const SITUACIONES_CON_MOTIVO = \['despedido', 'renuncio'\]/);
  assert.match(pagina, /const motivoObligatorio = SITUACIONES_CON_MOTIVO\.includes/);
  assert.match(pagina, /if \(motivoObligatorio && !form\.motivo_situacion\.trim\(\)\)/);
  assert.match(pagina, /motivo_situacion = 'Indique el motivo de la situación laboral\.'/);
  assert.match(pagina, /Obligatorio para Despedido y Renunció\./);
  assert.match(pagina, /Motivo \/ razón\{motivoObligatorio \? ' \*' : ' \(opcional\)'\}/);
});

test('fecha efectiva y observaciones conservan sus ayudas y límites', () => {
  const pagina = leer('../src/pages/empresa/Contrataciones.jsx');

  assert.match(pagina, /Fecha efectiva de la situación/);
  assert.match(pagina, /Si no indicas una fecha, se utilizará la fecha de contratación\./);
  assert.match(pagina, /Si cambias la situación y no especificas una fecha, se utilizará la fecha actual\./);
  assert.match(pagina, /maxLength=\{255\}/);
  assert.match(pagina, /maxLength=\{10000\}/);
  assert.match(pagina, /Máximo 10\.000 caracteres\./);
  assert.match(pagina, /04 · Observaciones adicionales/);
  assert.match(pagina, /fechaEditable/);
  assert.match(pagina, /0000-00-00/);
});

test('el formulario conserva el objeto plano y los errores por campo', () => {
  const pagina = leer('../src/pages/empresa/Contrataciones.jsx');

  for (const campo of [
    'postulacion_id', 'fecha_contratacion', 'cargo', 'modalidad', 'remuneracion',
    'situacion_laboral', 'fecha_situacion', 'motivo_situacion', 'observaciones',
  ]) {
    assert.ok(pagina.includes(`${campo}:`), `falta el campo ${campo}`);
  }

  assert.match(pagina, /setForm\(\(previo\) => \(\{ \.\.\.previo, \[k\]: valor \}\)\)/);
  assert.match(pagina, /setForm\(\(previo\) => \(\{ \.\.\.previo, situacion_laboral: valor \}\)\)/);
  assert.match(pagina, /errores\.fecha_situacion/);
  assert.match(pagina, /errores\.motivo_situacion/);
  assert.match(pagina, /errores\.observaciones/);
  assert.match(pagina, /document\.getElementById\(`contratacion-\$\{campo\}`\)\?\.focus\(\)/);
});

test('el formulario de contratación tiene rejillas responsive y foco visible', () => {
  const estilos = leer('../src/empresa.css');

  assert.match(estilos, /\.contratacion-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
  assert.match(estilos, /\.contratacion-situaciones-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(estilos, /@media \(max-width: 1100px\)[\s\S]*?\.contratacion-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(estilos, /@media \(max-width: 640px\)[\s\S]*?\.contratacion-grid,[\s\S]*?grid-template-columns:\s*1fr/s);
  assert.match(estilos, /\.contratacion-situacion:focus-within\s*\{[^}]*outline:\s*2px solid var\(--accion-foco\)/s);
  assert.match(estilos, /\.contratacion-situacion\.is-seleccionada\s*\{[^}]*var\(--sky\)/s);
});
