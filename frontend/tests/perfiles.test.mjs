// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const leer = (ruta) => readFileSync(`${raiz}${ruta}`, 'utf8');

test('el selector de perfil usa la definición central y las tres descripciones', () => {
  const constantes = leer('src/constants.js');
  const usuarios = leer('src/pages/admin/Usuarios.jsx');

  for (const clave of ['admin', 'moderador', 'solo_lectura']) {
    assert.match(constantes, new RegExp(`${clave}:`));
  }
  assert.match(constantes, /Administración completa del sistema/);
  assert.match(constantes, /Gestión operativa sin administración de usuarios/);
  assert.match(constantes, /Consulta sin modificaciones ni exportaciones masivas/);
  assert.match(usuarios, /SelectorPerfil/);
  assert.match(usuarios, /perfil_municipal/);
  assert.match(usuarios, /Seleccione un perfil municipal/);
  assert.match(usuarios, /crearUsuario\(form\)/);
  assert.match(usuarios, /Perfil municipal/);
  assert.match(usuarios, /cambiarPerfilUsuario/);
  assert.match(usuarios, /Guardar cambio/);
  assert.match(usuarios, /Perfil actual:/);
});

test('la autorización de UI consume los permisos efectivos del backend', () => {
  const hook = leer('src/hooks/usePermisosMunicipales.js');
  const auth = leer('src/context/AuthContext.jsx');

  assert.match(hook, /usuario\?\.permisos_municipales/);
  assert.match(hook, /permisos\.has\(permiso\)/);
  assert.doesNotMatch(hook, /PERMISOS_MUNICIPALES|const permisos = \[/);
  assert.match(auth, /setUsuario\(await sesion\(\)\)/);
});

test('la navegación y las rutas ocultan usuarios fuera de ADMIN', () => {
  const layout = leer('src/layouts/LayoutAdmin.jsx');
  const rutas = leer('src/routes/index.jsx');
  const guardas = leer('src/routes/Guardas.jsx');

  assert.match(layout, /puede\('usuarios'\)/);
  assert.match(layout, /ETIQUETA_PERFIL_MUNICIPAL/);
  assert.match(rutas, /perfil="admin"/);
  assert.match(guardas, /usuario\.perfil_municipal !== perfil/);
});

test('las pantallas aplican los permisos operativos reales', () => {
  const expectativas = [
    ['src/pages/admin/Empresas.jsx', "puede('empresas')"],
    ['src/pages/admin/SolicitudesEmpresa.jsx', "puede('solicitudes')"],
    ['src/pages/admin/Ofertas.jsx', "puede('ofertas')"],
    ['src/pages/admin/Actividades.jsx', "puede('actividades')"],
    ['src/pages/admin/Oportunidades.jsx', "puede('oportunidades')"],
    ['src/pages/admin/Dashboard.jsx', "puede('reportes')"],
  ];

  for (const [archivo, permiso] of expectativas) {
    assert.match(leer(archivo), new RegExp(permiso.replace(/[()]/g, '\\$&')));
  }

  const filtro = leer('src/components/FiltroPeriodo.jsx');
  assert.match(filtro, /mostrarExportaciones/);
  assert.match(filtro, /exportandoPdf/);
  assert.match(filtro, /disabled=\{exportandoPdf\}/);
});

test('el servicio de cambio de perfil usa el endpoint explícito', () => {
  const servicio = leer('src/services/usuarios.js');
  assert.match(servicio, /\/admin\/usuarios\/\$\{id\}\/perfil/);
  assert.match(servicio, /perfil_municipal/);
});

test('el alta municipal exige correo y muestra errores por campo', () => {
  const usuarios = leer('src/pages/admin/Usuarios.jsx');
  const utils = leer('src/utils.js');
  const campos = leer('src/utils/validacionCampos.js');

  assert.match(utils, /validacionCampos/);
  assert.match(campos, /export const esEmailValido/);
  assert.match(usuarios, /El correo electrónico es obligatorio/);
  assert.match(usuarios, /El usuario es obligatorio/);
  assert.match(usuarios, /error=\{erroresCampo\.email\}/);
  assert.match(usuarios, /error=\{erroresCampo\.telefono\}/);
  assert.match(usuarios, /data\?\.campos/);
  assert.match(usuarios, /enCurso\.current/);
});

test('el formulario municipal alinea Teléfono con Usuario y los requisitos con Contraseña', () => {
  const usuarios = leer('src/pages/admin/Usuarios.jsx');
  const estilos = leer('src/styles.css');

  assert.match(usuarios, /form-malla form-malla-usuario/);
  assert.match(usuarios, /form-usuario-inferior/);
  assert.match(usuarios, /form-usuario-telefono[\s\S]*etiqueta="Teléfono"[\s\S]*form-usuario-requisitos[\s\S]*PasswordRequirements/);
  assert.match(estilos, /\.form-malla\.form-malla-usuario\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(estilos, /\.form-usuario-inferior\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)[^}]*gap:\s*0\s+1rem/s);
  assert.match(estilos, /\.form-usuario-telefono\s*\{[^}]*grid-column:\s*1;[^}]*width:\s*100%/s);
  assert.match(estilos, /\.form-usuario-requisitos\s*\{[^}]*grid-column:\s*2\s*\/\s*4/s);
});
