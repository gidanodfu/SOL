// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('ActivityImage reinicia el estado de error cuando cambia la imagen', () => {
  const componente = leer('../src/components/ActivityImage.jsx');

  assert.match(componente, /import \{ useState \} from 'react'/);
  assert.match(componente, /const \[errorSrc, setErrorSrc\] = useState\(null\)/);
  assert.match(componente, /const hayImagen = Boolean\(src\) && errorSrc !== src/);
  assert.match(componente, /onError=\{\(\) => setErrorSrc\(src\)\}/);
  assert.match(componente, /loading="lazy"/);
});

test('las imágenes de perfil conservan el reset y la carga diferida', () => {
  const componente = leer('../src/components/ProfileImage.jsx');

  assert.match(componente, /useEffect\(\(\) => \{ setFallo\(false\); \}, \[src\]\)/);
  assert.match(componente, /loading="lazy"/);
});
