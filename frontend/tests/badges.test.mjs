// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('el badge base no permite saltos ni compresión', () => {
  const estilos = leer('../src/styles.css');

  assert.match(
    estilos,
    /\.badge\s*\{[^}]*white-space:\s*nowrap[^}]*flex-shrink:\s*0[^}]*width:\s*fit-content/s,
  );
});

test('las tarjetas de contenido conservan el ajuste de texto', () => {
  const estilos = leer('../src/styles.css');

  assert.match(
    estilos,
    /\.content-card-badge \.badge\s*\{[^}]*max-width:\s*100%[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/s,
  );
});
