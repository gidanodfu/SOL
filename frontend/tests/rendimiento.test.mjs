// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('el contenido enriquecido solo se sanea cuando cambia', () => {
  const componente = leer('../src/components/ContenidoEnriquecido.jsx');

  assert.match(componente, /import \{ useMemo \} from 'react'/);
  assert.match(componente, /const \{ esHtml, html \} = useMemo\(/);
  assert.match(componente, /\}, \[contenido\]\);/);
  assert.match(componente, /dangerouslySetInnerHTML=\{\{ __html: html \}\}/);
});

test('React Query reutiliza datos recientes sin perder invalidaciones', () => {
  const app = leer('../src/App.jsx');

  assert.match(app, /staleTime: 30_000/);
  assert.match(app, /refetchOnWindowFocus: false/);
});
