// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGAL_LINKS, TERMS_VERSION } from '../src/legal/documentos.js';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('el footer legal contiene exactamente las cuatro rutas públicas', () => {
  assert.deepEqual(
    LEGAL_LINKS.map((enlace) => enlace.to),
    ['/politica-privacidad', '/terminos-condiciones', '/aviso-legal', '/politica-cookies'],
  );
  assert.equal(TERMS_VERSION, '1.0');
});

test('la versión del frontend coincide con la versión que persiste el backend', () => {
  const backend = leer('../../backend/app/Libraries/Terminos.php');
  assert.match(backend, /VERSION\s*=\s*'1\.0'/);
});

test('las pantallas de autenticación usan el footer compartido y ya no el mensaje antiguo', () => {
  for (const archivo of ['Login.jsx', 'Registro.jsx', 'RegistroEmpresa.jsx', 'ActivarCuenta.jsx']) {
    const fuente = leer(`../src/pages/auth/${archivo}`);
    assert.match(fuente, /AuthFooter/);
    assert.doesNotMatch(fuente, /Conexión Segura|Portal Interno ©/);
  }
});

test('solo el login usa la variante rounded del footer compartido', () => {
  const login = leer('../src/pages/auth/Login.jsx');
  const footer = leer('../src/components/AuthFooter.jsx');
  const estilos = leer('../src/styles.css');

  assert.match(login, /<AuthFooter rounded \/>/);
  for (const archivo of ['Registro.jsx', 'RegistroEmpresa.jsx', 'ActivarCuenta.jsx']) {
    assert.match(leer(`../src/pages/auth/${archivo}`), /<AuthFooter \/>/);
  }
  assert.match(footer, /rounded = false/);
  assert.match(footer, /!rounded && <LogoMunicipal/);
  assert.match(footer, /login-footer--rounded/);
  assert.match(estilos, /--login-panel-width:\s*440px/);
  assert.match(
    estilos,
    /\.login-institucional--footer-rounded \.login-formulario\s*\{[^}]*max-width:\s*var\(--login-panel-width\)/s,
  );
  assert.match(
    estilos,
    /\.login-footer\.login-footer--rounded\s*\{[^}]*width:\s*calc\(100% - var\(--login-panel-gutter\) - var\(--login-panel-gutter\)\)/s,
  );
  assert.match(
    estilos,
    /\.login-footer\.login-footer--rounded\s*\{[^}]*max-width:\s*var\(--login-panel-width\)/s,
  );
  assert.match(
    estilos,
    /\.login-footer\.login-footer--rounded\s*\{[^}]*border-radius:\s*var\(--radius-xl\)/s,
  );
  assert.match(
    estilos,
    /\.login-footer\.login-footer--rounded\s*\{[^}]*background:\s*var\(--panel-bg\)/s,
  );
});

test('las cuatro rutas legales están declaradas como públicas', () => {
  const rutas = leer('../src/routes/index.jsx');
  for (const ruta of ['/politica-privacidad', '/terminos-condiciones', '/aviso-legal', '/politica-cookies']) {
    assert.match(rutas, new RegExp(`path="${ruta}"`));
  }
});

test('ambos formularios incluyen la casilla y envían la aceptación explícita', () => {
  const registro = leer('../src/pages/auth/Registro.jsx');
  const empresa = leer('../src/pages/auth/RegistroEmpresa.jsx');

  assert.match(registro, /TermsCheckbox/);
  assert.match(registro, /terms_accepted: true/);
  assert.match(registro, /Debes aceptar los Términos y Condiciones/);

  assert.match(empresa, /TermsCheckbox/);
  assert.match(empresa, /terms_accepted: true/);
  assert.match(empresa, /Debes aceptar los Términos y Condiciones/);
});

test('cada documento legal reutiliza el layout común', () => {
  for (const archivo of ['PoliticaPrivacidad.jsx', 'TerminosCondiciones.jsx', 'AvisoLegal.jsx', 'PoliticaTecnologiasWeb.jsx']) {
    assert.match(leer(`../src/pages/legal/${archivo}`), /LegalPage/);
  }
});
