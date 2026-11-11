// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('la modal pública es una fachada con campos explícitamente permitidos', () => {
  const modal = leer('../src/components/EmpresaModal.jsx');

  assert.match(modal, /import EmpresaDetalleModal from '\.\/EmpresaDetalleModal'/);
  assert.match(modal, /<EmpresaDetalleModal/);
  assert.match(modal, /secciones=\{secciones\}/);
  assert.match(modal, /etiqueta: 'RUC'/);
  assert.match(modal, /etiqueta: 'Nombre comercial'/);
  assert.match(modal, /etiqueta: 'Ubicación'/);
  assert.match(modal, /etiqueta: 'Antigüedad en la plataforma'/);

  for (const privado of ['email', 'telefono', 'representante', 'username', 'user_estado']) {
    assert.doesNotMatch(modal, new RegExp(`etiqueta: '[^']*${privado}`, 'i'));
    assert.doesNotMatch(modal, new RegExp(`empresa\\.${privado}`, 'i'));
  }
});

test('el modal compartido compone Modal y el contenido visual reutilizable', () => {
  const modal = leer('../src/components/EmpresaDetalleModal.jsx');
  const contenido = leer('../src/components/EmpresaDetalleContenido.jsx');

  assert.match(modal, /from '\.\/Modal'/);
  assert.match(modal, /from '\.\/EmpresaDetalleContenido'/);
  assert.match(modal, /tamano = 'ancho'/);
  assert.match(modal, /secciones = \[\]/);
  assert.match(modal, /mostrarPresencia = true/);
  assert.match(modal, /mostrarInfoAdicional = true/);
  assert.match(modal, /<EmpresaDetalleContenido/);
  assert.match(contenido, /ProfileImage/);
  assert.match(contenido, /FichaDatos/);
  assert.match(contenido, /PresenciaDigital datos=\{empresa\} variante="detallada"/);
  assert.match(contenido, /info_adicional/);
});

test('administración conserva acciones y usa la misma presentación', () => {
  const admin = leer('../src/pages/admin/Empresas.jsx');

  assert.match(admin, /import EmpresaDetalleModal from '\.\.\/\.\.\/components\/EmpresaDetalleModal'/);
  assert.match(admin, /<EmpresaDetalleModal/);
  assert.match(admin, /Identificación empresarial/);
  assert.match(admin, /Contacto y ubicación/);
  assert.match(admin, /Cuenta y registro/);
  assert.match(admin, /Cambiar clave/);
  assert.match(admin, /cambiarEstadoEmpresa/);
  assert.match(admin, /resetPasswordEmpresa/);
  assert.match(admin, /puedeGestionar/);
  assert.match(admin, /Evaluada presencialmente/);
  assert.doesNotMatch(admin, /PresenciaDigital/);
  assert.doesNotMatch(admin, /<Modal\b/);
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
  assert.match(redes, /variante = 'compacta'/);
});

test('los estilos detallados se reutilizan por modificador y son responsive', () => {
  const estilos = leer('../src/styles.css');

  assert.match(estilos, /\.empresa-detalle\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  assert.match(estilos, /\.empresa-detalle-identidad\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/s);
  assert.match(estilos, /\.empresa-detalle \.descripcion\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(estilos, /@media \(max-width: 560px\)[\s\S]*?\.empresa-detalle \.descripcion\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(estilos, /\.presencia-digital--detallada\s*\{[^}]*margin-top:\s*20px[^}]*text-align:\s*left/s);
  assert.match(
    estilos,
    /\.presencia-digital--detallada \.presencia-web\s*\{[^}]*width:\s*100%[^}]*min-height:\s*56px/s,
  );
  assert.match(
    estilos,
    /\.presencia-digital--detallada \.presencia-redes\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
  );
  assert.match(
    estilos,
    /\.presencia-digital--detallada \.presencia-red--detallada\s*\{[^}]*min-height:\s*52px/s,
  );
  assert.match(estilos, /@media \(max-width: 420px\)[\s\S]*?\.presencia-digital--detallada \.presencia-redes\s*\{[^}]*1fr/s);
  assert.doesNotMatch(estilos, /empresa-modal-presencia/);
});
