// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const src = join(raiz, 'src');
const publicDir = join(raiz, 'public');
const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

function archivosTexto(directorio) {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = join(directorio, nombre);
    if (statSync(ruta).isDirectory()) return archivosTexto(ruta);
    return ['.js', '.jsx', '.css'].includes(extname(ruta)) ? [ruta] : [];
  });
}

test('el logo maestro existe, conserva transparencia y no fue redimensionado', () => {
  const ruta = join(publicDir, 'sol-logo.png');
  assert.equal(existsSync(ruta), true);

  const png = readFileSync(ruta);
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), 1069);
  assert.equal(png.readUInt32BE(20), 1471);
  // Color type 6 = RGBA; conserva el canal alfa original.
  assert.equal(png[25], 6);
});

test('el maestro conserva el hash institucional compartido con el PDF', () => {
  const png = readFileSync(join(publicDir, 'sol-logo.png'));
  assert.equal(
    createHash('sha256').update(png).digest('hex'),
    'db7638707560fbc046f397e33cfd90cb8790506b802504c3f537081c48f3cd76',
  );
});

test('el componente centraliza la ruta y el texto alternativo accesible', () => {
  const fuente = leer('../src/components/LogoMunicipal.jsx');

  assert.match(fuente, /\/sol-logo\.png/);
  assert.match(fuente, /Escudo de la Municipalidad Distrital de José Leonardo Ortiz/);
  assert.match(fuente, /className=\{`logo-municipal/);
  assert.doesNotMatch(fuente, /https?:\/\//);
});

test('no quedan URLs externas ni referencias a los favicons antiguos', () => {
  for (const archivo of archivosTexto(src)) {
    const fuente = readFileSync(archivo, 'utf8');
    assert.doesNotMatch(fuente, /image2url\.com/i, `URL externa en ${archivo}`);
    assert.doesNotMatch(fuente, /LOGO_URL/, `constante LOGO_URL en ${archivo}`);
    assert.doesNotMatch(fuente, /favicon\.(png|jpe?g)/i, `favicon antiguo en ${archivo}`);
  }

  const index = leer('../index.html');
  assert.match(index, /RECURSO = '\/sol-logo\.png\?v=20261025-1'/);
  assert.doesNotMatch(index, /<link[^>]+href="\/sol-logo\.png/i);
  assert.doesNotMatch(index, /favicon\.(png|jpe?g)/i);
  assert.doesNotMatch(index, /image2url\.com|1788530622409/i);
});

test('el favicon compone un cuadrado transparente desde el maestro', () => {
  assert.equal(existsSync(join(publicDir, 'favicon.png')), false);
  assert.equal(existsSync(join(publicDir, 'favicon.jpeg')), false);
  assert.deepEqual(
    readdirSync(publicDir).filter((nombre) => /\.(png|jpe?g|webp|ico|svg)$/i.test(nombre)),
    ['sol-logo.png'],
  );

  const index = leer('../index.html');
  assert.match(index, /const TAMANO = 180/);
  assert.match(index, /Math\.min\(TAMANO \/ imagen\.naturalWidth/);
  assert.match(index, /drawImage\(imagen/);
  assert.match(index, /toDataURL\('image\/png'\)/);
  assert.match(index, /nuevo\.sizes = `\$\{TAMANO\}x\$\{TAMANO\}`/);
  assert.match(index, /enlace\.replaceWith\(nuevo\)/);
  assert.match(index, /data:image\/png;base64,/);
});

test('los scripts inline de index.html compilan sin errores', () => {
  const index = leer('../index.html');
  const scripts = [...index.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  assert.ok(scripts.length >= 2);
  for (const codigo of scripts) {
    assert.doesNotThrow(() => new Function(codigo));
  }
});

test('todas las pantallas con escudo usan el componente compartido', () => {
  const archivos = [
    '../src/pages/auth/Login.jsx',
    '../src/pages/auth/Registro.jsx',
    '../src/pages/auth/RegistroEmpresa.jsx',
    '../src/pages/auth/ActivarCuenta.jsx',
    '../src/pages/legal/LegalPage.jsx',
    '../src/layouts/NavbarPostulante.jsx',
    '../src/components/Sidebar.jsx',
    '../src/components/AuthFooter.jsx',
  ];

  for (const archivo of archivos) {
    const fuente = leer(archivo);
    assert.match(fuente, /<LogoMunicipal\b/, `sin LogoMunicipal en ${archivo}`);
    assert.doesNotMatch(fuente, /<img[^>]+sol-logo\.png/, `img directa en ${archivo}`);
  }
});

test('el estilo del logo conserva proporción y no agrega fondos artificiales', () => {
  const estilos = leer('../src/styles.css');

  assert.match(estilos, /\.logo-municipal\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(estilos, /\.login-logo\s*\{[^}]*height:\s*auto/s);
  assert.doesNotMatch(estilos, /\.login-logo\s*\{[^}]*background:\s*#ffffff/s);
});
