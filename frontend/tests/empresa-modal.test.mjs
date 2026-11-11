// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('el modal público usa la variante detallada aislada por contenedor', () => {
  const modal = leer('../src/components/EmpresaModal.jsx');
  const redes = leer('../src/components/RedesSociales.jsx');

  assert.match(modal, /<div className="empresa-modal-presencia">/);
  assert.match(modal, /<PresenciaDigital datos=\{empresa\} variante="detallada" \/>/);
  assert.match(redes, /variante = 'compacta'/);
  assert.match(redes, /const detallada = variante === 'detallada'/);
});

test('el modal administrativo conserva la variante compacta', () => {
  const admin = leer('../src/pages/admin/Empresas.jsx');

  assert.match(admin, /<PresenciaDigital datos=\{empresa\} \/>/);
  assert.doesNotMatch(admin, /variante="detallada"/);
});

test('la presencia detallada conserva sitio web, redes y enlaces externos', () => {
  const redes = leer('../src/components/RedesSociales.jsx');

  assert.match(redes, /<Globe /);
  assert.match(redes, /<ExternalLink /);
  assert.match(redes, /Sitio web oficial/);
  assert.match(redes, /Canales oficiales de la empresa/);
  assert.match(redes, /Ver perfil/);
  assert.match(redes, /target="_blank"/);
  assert.match(redes, /rel="noopener noreferrer"/);
  assert.match(redes, /aria-label=\{r\.nombre\}/);
  assert.match(redes, /etiquetaWeb\(web\)/);
  assert.match(redes, /esEnlaceSeguro/);
  assert.match(redes, /clave: 'instagram_url'/);
  assert.match(redes, /clave: 'facebook_url'/);
  assert.match(redes, /clave: 'tiktok_url'/);
  assert.match(redes, /clave: 'x_url'/);
  assert.match(redes, /if \(!web && redes\.length === 0\) return null/);
});

test('los estilos públicos son responsivos y están acotados', () => {
  const estilos = leer('../src/styles.css');

  assert.match(estilos, /\.empresa-modal-presencia\s*\{[^}]*margin-top:\s*20px/s);
  assert.match(
    estilos,
    /\.empresa-modal-presencia \.presencia-digital\s*\{[^}]*align-items:\s*stretch[^}]*text-align:\s*left/s,
  );
  assert.match(
    estilos,
    /\.empresa-modal-presencia \.presencia-web\s*\{[^}]*width:\s*100%[^}]*min-height:\s*56px/s,
  );
  assert.match(
    estilos,
    /\.empresa-modal-presencia \.presencia-redes\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
  );
  assert.match(
    estilos,
    /\.empresa-modal-presencia \.presencia-red--detallada\s*\{[^}]*min-height:\s*52px/s,
  );
  assert.match(
    estilos,
    /\.empresa-modal-presencia \.presencia-web:focus-visible,[\s\S]*?outline:\s*2px solid var\(--accion-foco\)/s,
  );
  assert.match(estilos, /\.presencia-red:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accion-foco\)/s);
});
