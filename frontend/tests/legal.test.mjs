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
  for (const archivo of ['PoliticaPrivacidad.jsx', 'TerminosCondiciones.jsx', 'AvisoLegal.jsx', 'PoliticaCookies.jsx']) {
    assert.match(leer(`../src/pages/legal/${archivo}`), /LegalPage/);
  }
});
