// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const leer = (ruta) => readFileSync(`${raiz}${ruta}`, 'utf8');

test('FiltroPeriodo expone Excel y PDF con estados independientes', () => {
  const fuente = leer('src/components/FiltroPeriodo.jsx');

  assert.match(fuente, /onExportarPdf/);
  assert.match(fuente, /exportandoPdf/);
  assert.match(fuente, /errorExportarPdf/);
  assert.match(fuente, /mensajeExitoPdf/);
  assert.match(fuente, /FileText/);
  assert.match(fuente, /Exportar PDF/);
  assert.match(fuente, /Exportar Excel/);
  assert.match(fuente, /filter-button exportar pdf/);
  assert.match(leer('src/styles.css'), /\.filter-button\.pdf/);
  assert.ok(
    fuente.indexOf('Exportar Excel') < fuente.indexOf('Exportar PDF'),
    'El botón PDF debe ir inmediatamente después del botón Excel.',
  );
  assert.match(fuente, /disabled=\{exportandoPdf\}/);
  assert.match(fuente, /aria-busy=\{exportandoPdf\}/);
});

test('los dashboards usan las fechas aplicadas para Excel y PDF', () => {
  for (const archivo of ['src/pages/admin/Dashboard.jsx', 'src/pages/empresa/Dashboard.jsx']) {
    const fuente = leer(archivo);
    const bloqueExcel = /const exportarExcel = async \(\) => \{([\s\S]*?)\n  \};/.exec(fuente);
    const bloquePdf = /const exportarPdf = async \(\) => \{([\s\S]*?)\n  \};/.exec(fuente);

    assert.ok(bloqueExcel, `sin exportarExcel en ${archivo}`);
    assert.ok(bloquePdf, `sin exportarPdf en ${archivo}`);
    assert.match(bloqueExcel[1], /filtro\.desde/);
    assert.match(bloquePdf[1], /filtro\.desde/);
    assert.doesNotMatch(bloquePdf[1], /form\.desde/);
    assert.match(fuente, /descargandoPdf/);
    assert.match(fuente, /exportacionEnCurso\.current\.pdf/);
    assert.match(fuente, /descargarBlob/);
    assert.match(fuente, /errorApiDescarga/);
    assert.match(fuente, /mensajeExitoPdf/);
    assert.match(fuente, /errorExportarPdf/);
  }
});

test('los servicios apuntan a los endpoints PDF con respuesta binaria', () => {
  const admin = leer('src/services/dashboard.js');
  const empresa = leer('src/services/empresas.js');

  assert.match(admin, /\/admin\/reportes\/pdf/);
  assert.match(admin, /responseType: 'blob'/);
  assert.match(empresa, /\/empresa\/reportes\/pdf/);
  assert.match(empresa, /responseType: 'blob'/);
  assert.doesNotMatch(empresa, /reportes\/pdf[^\n]*empresa_id/);
});
