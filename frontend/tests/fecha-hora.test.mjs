// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  esFechaHoraValida,
  formatearFechaHora,
  limitesFechaHora,
  parseFechaHora,
} from '../src/components/FechaHora/fechaHora.utils.js';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('fecha simple: lee y emite YYYY-MM-DD sin desplazar el día', () => {
  const fecha = parseFechaHora('2026-11-13', 'fecha');

  assert.equal(fecha.getFullYear(), 2026);
  assert.equal(fecha.getMonth(), 10);
  assert.equal(fecha.getDate(), 13);
  assert.equal(formatearFechaHora(fecha, 'fecha'), '2026-11-13');
});

test('fecha y hora: conserva la hora local y la precisión de minutos', () => {
  const fecha = parseFechaHora('2026-11-13T15:07', 'fecha-hora');

  assert.equal(fecha.getHours(), 15);
  assert.equal(fecha.getMinutes(), 7);
  assert.equal(formatearFechaHora(fecha, 'fecha-hora'), '2026-11-13T15:07');
});

test('valores vacíos e inválidos no producen fechas ficticias', () => {
  assert.equal(parseFechaHora('', 'fecha'), null);
  assert.equal(parseFechaHora(null, 'fecha'), null);
  assert.equal(parseFechaHora('2026-02-31', 'fecha'), null);
  assert.equal(parseFechaHora('2026-11-13T24:00', 'fecha-hora'), null);
  assert.equal(parseFechaHora('13/11/2026', 'fecha'), null);
  assert.equal(formatearFechaHora(null, 'fecha'), '');
  assert.equal(esFechaHoraValida('2026-11-13', 'fecha'), true);
  assert.equal(esFechaHoraValida('2026-13-01', 'fecha'), false);
});

test('año bisiesto y cambios de mes y año', () => {
  assert.equal(formatearFechaHora(parseFechaHora('2024-02-29', 'fecha'), 'fecha'), '2024-02-29');
  assert.equal(formatearFechaHora(parseFechaHora('2026-01-01', 'fecha'), 'fecha'), '2026-01-01');
  assert.equal(formatearFechaHora(parseFechaHora('2026-12-31', 'fecha'), 'fecha'), '2026-12-31');
});

test('fechas próximas a medianoche no cambian de día', () => {
  assert.equal(formatearFechaHora(parseFechaHora('2026-11-13T00:00', 'fecha-hora'), 'fecha-hora'), '2026-11-13T00:00');
  assert.equal(formatearFechaHora(parseFechaHora('2026-11-13T23:59', 'fecha-hora'), 'fecha-hora'), '2026-11-13T23:59');
});

test('America/Lima: el mismo valor de calendario vuelve intacto', () => {
  const valores = ['2026-03-31', '2026-09-30', '2026-12-31'];
  for (const valor of valores) {
    assert.equal(formatearFechaHora(parseFechaHora(valor, 'fecha'), 'fecha'), valor);
  }
  assert.equal(
    formatearFechaHora(parseFechaHora('2026-07-28T19:45', 'fecha-hora'), 'fecha-hora'),
    '2026-07-28T19:45',
  );
});

test('min y max: en fecha el máximo incluye el día completo', () => {
  const { minDate, maxDate } = limitesFechaHora('2026-11-13', '2026-11-15', 'fecha');

  assert.equal(formatearFechaHora(minDate, 'fecha'), '2026-11-13');
  assert.equal(formatearFechaHora(maxDate, 'fecha'), '2026-11-15');
  assert.equal(maxDate.getHours(), 23);
  assert.equal(maxDate.getMinutes(), 59);
  assert.equal(maxDate.getSeconds(), 59);
});

test('min y max: en fecha-hora se respeta la hora exacta', () => {
  const { minDate, maxDate } = limitesFechaHora('2026-11-13T08:15', '2026-11-13T18:45', 'fecha-hora');

  assert.equal(formatearFechaHora(minDate, 'fecha-hora'), '2026-11-13T08:15');
  assert.equal(formatearFechaHora(maxDate, 'fecha-hora'), '2026-11-13T18:45');
});

test('el componente global usa react-datepicker, español, portal y formatos SOL', () => {
  const calendario = leer('../src/components/FechaHora/FechaHoraCalendario.jsx');
  const campo = leer('../src/components/FechaHora/FechaHoraCampo.jsx');

  assert.match(calendario, /import DatePicker from 'react-datepicker'/);
  assert.match(calendario, /from 'date-fns\/locale\/es'/);
  assert.match(calendario, /calendarStartDay=\{1\}/);
  assert.match(calendario, /dateFormat=\{esFechaHora \? 'dd\/MM\/yyyy HH:mm' : 'dd\/MM\/yyyy'\}/);
  assert.match(calendario, /showTimeInput=\{esFechaHora\}/);
  assert.match(calendario, /timeFormat="HH:mm"/);
  assert.match(calendario, /portalId="sol-fecha-hora-portal"/);
  assert.match(calendario, /popperPlacement="bottom-start"/);
  assert.match(calendario, /shift\(\{ padding: 12 \}\)/);
  assert.match(calendario, /onChange=\{\(fecha\) => onChange\(formatearFechaHora\(fecha, modo\)\)\}/);
  assert.doesNotMatch(calendario, /toISOString/);
  assert.doesNotMatch(calendario, /target:\s*\{\s*value/);
  assert.doesNotMatch(calendario, /localStorage|matchMedia|dataset\.theme/);
  assert.match(campo, /role="alert"/);
  assert.match(campo, /ariaDescribedBy=\{descritoPor\}/);
  assert.match(campo, /fecha-hora-campo/);
});

test('los estilos del calendario consumen tokens, temas y accesibilidad', () => {
  const css = leer('../src/components/FechaHora/FechaHora.css');

  for (const token of ['--white', '--line', '--text-1', '--text-2', '--text-3', '--primario', '--enlace', '--radius-lg']) {
    assert.ok(css.includes(`var(${token})`), `Falta el token ${token}`);
  }
  assert.doesNotMatch(css, /background(?:-color)?:\s*(?:#fff|#ffffff|white)\b/i);
  assert.match(css, /\[data-contrast='high'\]/);
  assert.match(css, /\[data-motion='reduced'\]/);
  assert.match(css, /width: min\(320px, calc\(100vw - 24px\)\)/);
  assert.match(css, /react-datepicker__day--selected/);
  assert.match(css, /react-datepicker__day--today/);
});
