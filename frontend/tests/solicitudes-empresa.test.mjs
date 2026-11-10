// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('el rechazo de solicitudes usa un textarea multilínea con etiqueta y placeholder', () => {
  const pagina = leer('../src/pages/admin/SolicitudesEmpresa.jsx');

  assert.match(pagina, /titulo: 'Rechazar solicitud'/);
  assert.match(pagina, /etiqueta: 'Motivo del rechazo'/);
  assert.match(pagina, /multilinea: true/);
  assert.match(pagina, /placeholder: 'Describe detalladamente el motivo del rechazo\.\.\.'/);
  assert.match(pagina, /rechazarSolicitudEmpresa\(solicitud\.id, motivo\)/);
});

test('el diálogo compartido renderiza textarea solo cuando se solicita', () => {
  const feedback = leer('../src/components/Feedbacks.jsx');

  assert.match(feedback, /multilinea = false/);
  assert.match(feedback, /const campoId = useId\(\)/);
  assert.match(feedback, /htmlFor=\{campoId\}/);
  assert.match(feedback, /\{multilinea \? \(\s*<textarea/s);
  assert.match(feedback, /className="dialogo-textarea"/);
  assert.match(feedback, /rows=\{5\}/);
  assert.match(feedback, /id=\{campoId\}/);

  // Los diálogos de una línea conservan el input y el envío con Enter.
  assert.match(feedback, /onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter'\) aceptar\(\); \}\}/);
  assert.match(feedback, /type=\{dialogo\.secreto \? 'password' : 'text'\}/);
});

test('el textarea tiene altura amplia y desplazamiento interno sin romper el modal', () => {
  const estilos = leer('../src/styles.css');

  assert.match(estilos, /\.dialogo-textarea\s*\{[^}]*min-height:\s*130px[^}]*resize:\s*vertical[^}]*line-height:\s*1\.5/s);
  assert.match(estilos, /\.modal\s*\{[^}]*max-height:\s*min\(90vh,\s*900px\)/s);
  assert.match(estilos, /\.modal-cuerpo\s*\{[^}]*overflow-y:\s*auto/s);
});
