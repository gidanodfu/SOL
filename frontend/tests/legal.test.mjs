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

test('las pantallas de acceso y registro usan la variante rounded del footer', () => {
  const footer = leer('../src/components/AuthFooter.jsx');
  const estilos = leer('../src/styles.css');

  for (const archivo of ['Login.jsx', 'Registro.jsx', 'RegistroEmpresa.jsx']) {
    assert.match(leer(`../src/pages/auth/${archivo}`), /<AuthFooter rounded \/>/);
  }
  assert.match(leer('../src/pages/auth/ActivarCuenta.jsx'), /<AuthFooter \/>/);

  for (const archivo of ['Registro.jsx', 'RegistroEmpresa.jsx']) {
    assert.match(
      leer(`../src/pages/auth/${archivo}`),
      /className="login-institucional login-institucional--registro login-institucional--footer-rounded"/,
    );
  }

  assert.match(footer, /rounded = false/);
  assert.match(footer, /!superficie && <LogoMunicipal/);
  assert.match(footer, /login-footer--rounded/);
  assert.match(estilos, /--login-panel-width:\s*440px/);
  assert.match(
    estilos,
    /\.login-institucional--footer-rounded\.login-institucional--registro\s*\{[^}]*--login-panel-width:\s*500px/s,
  );
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

test('las páginas legales comparten ancho y superficies redondeadas', () => {
  const layout = leer('../src/pages/legal/LegalPage.jsx');
  const footer = leer('../src/components/AuthFooter.jsx');
  const estilos = leer('../src/styles.css');

  // Las tres superficies viven dentro del mismo shell legal.
  assert.match(layout, /className="legal-shell"/);
  assert.match(layout, /className="legal-topbar"/);
  assert.match(layout, /className="legal-main"/);
  assert.match(layout, /<AuthFooter legal \/>/);
  assert.match(footer, /legal = false/);
  assert.match(footer, /login-footer--legal/);

  // Una sola fuente de ancho para encabezado, documento y footer.
  assert.match(estilos, /\.legal-shell\s*\{[^}]*max-width:\s*900px/s);
  assert.match(estilos, /\.legal-topbar\s*\{[^}]*width:\s*100%/s);
  assert.match(estilos, /\.legal-topbar\s*\{[^}]*border-radius:\s*var\(--radius-2xl\)/s);
  assert.match(estilos, /\.legal-doc\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/s);
  assert.match(
    estilos,
    /\.login-footer\.login-footer--legal\s*\{[^}]*width:\s*100%/s,
  );
  assert.match(
    estilos,
    /\.login-footer\.login-footer--legal\s*\{[^}]*border-radius:\s*var\(--radius-2xl\)/s,
  );
  assert.match(
    estilos,
    /\.login-footer\.login-footer--legal\s*\{[^}]*background:\s*var\(--panel-bg\)/s,
  );
  assert.match(
    estilos,
    /\.login-footer\.login-footer--legal\s*\{[^}]*border:\s*1px solid var\(--line\)/s,
  );
});
