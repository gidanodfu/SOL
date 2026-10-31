// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatSystemVersion, parseSystemVersion } from '../src/config/versionFormat.js';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('formatea los canales oficiales de versión', () => {
  const casos = [
    ['0.9.2-beta', '0.9.2 BETA'],
    ['0.9.2-beta.1', '0.9.2 BETA 1'],
    ['0.9.2-alpha.1', '0.9.2 ALPHA 1'],
    ['0.9.2-rc.1', '0.9.2 RC 1'],
    ['0.9.2', '0.9.2'],
    ['1.0.0', '1.0.0'],
  ];

  for (const [entrada, esperado] of casos) {
    assert.equal(formatSystemVersion(entrada), esperado);
  }
});

test('tolera espacios y saltos de línea alrededor del identificador', () => {
  assert.equal(formatSystemVersion(' 0.9.2-beta \n'), '0.9.2 BETA');
  assert.equal(parseSystemVersion('\t0.9.2-rc.2\r\n').raw, '0.9.2-rc.2');
});

test('rechaza versiones ausentes o con formato inválido', () => {
  for (const invalida of [undefined, null, '', '   ', 'v0.9.2', '0.9', '0.9.2.1', '0.9.2-beta.', '0.9.2-beta.01', '0.9.2-preview']) {
    assert.throws(() => formatSystemVersion(invalida), /versión del sistema/i, String(invalida));
  }
});

test('el archivo VERSION es la fuente única y contiene la entrega inicial', () => {
  assert.equal(leer('../../VERSION').trim(), '0.9.2-beta');
});

test('Vite incorpora la versión al bundle y no queda en package.json', () => {
  const vite = leer('../vite.config.js');
  const paquete = JSON.parse(leer('../package.json'));

  assert.match(vite, /VITE_SOL_VERSION/);
  assert.match(vite, /resolve\(frontendDir, '\.\.\/VERSION'\)/);
  assert.match(vite, /JSON\.stringify\(VERSION_SOL\)/);
  assert.equal(paquete.version, '0.0.0');
  assert.doesNotMatch(JSON.stringify(paquete), /0\.9\.2-beta/);
});
