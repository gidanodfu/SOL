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

test('React Query usa ventanas específicas por tipo de dato', () => {
  const app = leer('../src/App.jsx');
  const config = leer('../src/queryConfig.js');
  const auth = leer('../src/context/AuthContext.jsx');

  assert.match(app, /staleTime: STALE\.operativo/);
  assert.match(app, /refetchOnWindowFocus: false/);
  assert.match(config, /operativo: 15_000/);
  assert.match(config, /dashboard: 30_000/);
  assert.match(config, /perfil: 60_000/);
  assert.match(config, /catalogo: 30 \* 60_000/);
  assert.match(auth, /queryClient\.clear\(\)/);
});
