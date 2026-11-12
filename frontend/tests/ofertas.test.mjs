// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UBICACIONES_OFERTA } from '../src/data/ubicaciones.js';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('el catálogo de ubicaciones es el acordado y no tiene duplicados', () => {
  assert.deepEqual([...UBICACIONES_OFERTA], [
    'Chiclayo',
    'José Leonardo Ortiz',
    'La Victoria',
    'Pimentel',
    'Lambayeque',
  ]);
  assert.equal(new Set(UBICACIONES_OFERTA).size, UBICACIONES_OFERTA.length);
});

test('búsqueda y formulario de ofertas usan la misma fuente de ubicaciones', () => {
  const buscar = leer('../src/pages/postulante/BuscarEmpleo.jsx');
  const ofertas = leer('../src/pages/empresa/Ofertas.jsx');

  assert.match(buscar, /UBICACIONES_OFERTA/);
  assert.match(ofertas, /UBICACIONES_OFERTA/);
  assert.doesNotMatch(buscar, /const OPCIONES_UBICACION\s*=/);
  assert.doesNotMatch(ofertas, /const OPCIONES_UBICACION\s*=/);
});

test('el formulario de oferta exige los campos de negocio y usa selector de ubicación', () => {
  const fuente = leer('../src/pages/empresa/Ofertas.jsx');

  for (const etiqueta of [
    'Puesto *',
    'Categoría *',
    'Tipo de empleo *',
    'Ubicación / lugar de trabajo *',
    'Número de vacantes *',
    'Salario (S/) *',
    'Formación requerida *',
    'Experiencia requerida *',
    'Fecha de cierre *',
    'Habilidades (separadas por coma) *',
    'Descripción del puesto *',
    'Funciones *',
    'Requisitos *',
  ]) {
    assert.ok(fuente.includes(etiqueta), `falta la etiqueta obligatoria: ${etiqueta}`);
  }

  assert.match(fuente, /Selecciona una ubicación/);
  assert.match(fuente, /fechaHoyLima/);
  assert.match(fuente, /Selecciona una categoría/);
  assert.doesNotMatch(fuente, /Sin categoría/);
});

test('la empresa solo ofrece activación para postulaciones seleccionadas', () => {
  const fuente = leer('../src/pages/empresa/Postulaciones.jsx');

  assert.match(fuente, /retirada_postulante/);
  assert.match(fuente, /Retirada por el postulante/);
  assert.match(fuente, /estado === 'seleccionado' && !retirada && activo === 1/);
  assert.match(fuente, /estado === 'seleccionado' && !retirada && activo !== 1/);
  assert.match(fuente, /La activación estará disponible cuando el candidato sea seleccionado\./);
  assert.doesNotMatch(fuente, /No se puede reactivar/);
});

test('observar una oferta usa un textarea multilínea para las observaciones', () => {
  const fuente = leer('../src/pages/admin/Ofertas.jsx');

  assert.match(fuente, /titulo: 'Observar oferta'/);
  assert.match(fuente, /etiqueta: 'Observaciones para la empresa'/);
  assert.match(fuente, /multilinea: true/);
  assert.match(fuente, /placeholder: 'Describe qué debe corregir la empresa\.\.\.'/);
  assert.match(fuente, /observarOfertaAdmin\(oferta\.id, observacion\)/);
});
