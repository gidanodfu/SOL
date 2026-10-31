// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('existe una única ruta /about protegida para los tres perfiles', () => {
  const rutas = leer('../src/routes/index.jsx');

  assert.match(rutas, /import AcercaDe from '\.\.\/pages\/acerca\/AcercaDe'/);
  assert.equal((rutas.match(/path="about"/g) || []).length, 1);
  assert.doesNotMatch(rutas, /admin\/about|empresa\/about|postulante\/about/);

  assert.match(
    rutas,
    /<RutaProtegida roles=\{\[ROLES\.ADMIN, ROLES\.EMPRESA, ROLES\.POSTULANTE\]\}><Outlet \/><\/RutaProtegida>\}>\s*<Route path="configuracion\/temas" element=\{<Temas \/>\} \/>\s*<Route path="about" element=\{<AcercaDe \/>\} \/>/,
  );
});

test('la página comparte una sola implementación y contiene dos tarjetas', () => {
  const pagina = leer('../src/pages/acerca/AcercaDe.jsx');

  assert.match(pagina, /Sistema Empleo MDJLO/);
  assert.match(pagina, /Desarrollo del sistema/);
  assert.equal((pagina.match(/<TarjetaInfo\b/g) || []).length, 2);
  assert.match(pagina, /className="tarjeta about-card"/);

  // El título visible solo se renderiza en los paneles que no lo aportan desde
  // su topbar; Administración lo muestra en LayoutAdmin.
  assert.match(pagina, /<PageHeader titulo="Acerca de"/);
  assert.match(pagina, /usuario\?\.rol === ROLES\.ADMIN/);
});

test('la versión mostrada proviene del archivo VERSION y de Vite', () => {
  const pagina = leer('../src/pages/acerca/AcercaDe.jsx');
  const constantes = leer('../src/constants.js');
  const modulo = leer('../src/config/version.js');
  const formato = leer('../src/config/versionFormat.js');
  const vite = leer('../vite.config.js');
  const docker = leer('../Dockerfile');
  const version = leer('../../VERSION').trim();

  assert.equal(version, '0.9.2-beta');
  assert.doesNotMatch(constantes, /VERSION_SISTEMA/);
  assert.match(pagina, /from '\.\.\/\.\.\/config\/version'/);
  assert.match(pagina, /<dd>\{VERSION_SISTEMA\}<\/dd>/);
  assert.match(modulo, /import\.meta\.env\.VITE_SOL_VERSION/);
  assert.match(modulo, /formatSystemVersion/);
  assert.match(formato, /alpha\|beta\|rc/);
  assert.match(vite, /VITE_SOL_VERSION/);
  assert.match(vite, /resolve\(frontendDir, '\.\.\/VERSION'\)/);
  assert.match(docker, /COPY VERSION \/VERSION/);
  assert.doesNotMatch(pagina, /\b\d+\.\d+\.\d+\b/);
});

test('la tarjeta de desarrollo enlaza al perfil principal, a los colaboradores y al repositorio', () => {
  const pagina = leer('../src/pages/acerca/AcercaDe.jsx');

  assert.match(pagina, /Josue David/);
  assert.match(pagina, /Desarrollador principal/);
  assert.match(pagina, /usuario="jhonalo9"/);
  assert.match(pagina, /rol="Colaborador"/);
  assert.match(pagina, /Colaborador/);
  assert.match(pagina, /const PERFIL_GITHUB = 'https:\/\/github\.com\/gidanodfu'/);
  assert.match(pagina, /const PERFIL_COLABORADOR_GITHUB = 'https:\/\/github\.com\/jhonalo9'/);
  assert.match(pagina, /const PERFIL_JESUS_GITHUB = 'https:\/\/github\.com\/JesusAndreBS'/);
  assert.match(pagina, /const REPOSITORIO_GITHUB = 'https:\/\/github\.com\/gidanodfu\/SOL'/);
  assert.match(pagina, /Perfil de GitHub/);
  assert.match(pagina, /Repositorio del proyecto/);
  assert.match(pagina, /Ver repositorio en GitHub/);
  assert.match(pagina, /etiqueta="Perfil de GitHub de Josue David"/);
  assert.match(pagina, /etiqueta="Perfil de GitHub de jhonalo9, colaborador"/);
  assert.match(pagina, /nombre="JesusAndreBS"/);
  assert.match(pagina, /usuario="JesusAndreBS"/);
  assert.match(pagina, /etiqueta="Perfil de GitHub de JesusAndreBS, colaborador"/);
  assert.match(pagina, /aria-label=\{etiqueta\}/);
  assert.equal((pagina.match(/<PerfilDesarrollo\b/g) || []).length, 3);
  assert.equal((pagina.match(/target="_blank"/g) || []).length, 2);
  assert.equal((pagina.match(/rel="noopener noreferrer"/g) || []).length, 2);

  // Orden visual: desarrollador principal → colaboradores → repositorio.
  const principal = pagina.indexOf('nombre="Josue David"');
  const colaborador = pagina.indexOf('usuario="jhonalo9"');
  const segundoColaborador = pagina.indexOf('nombre="JesusAndreBS"');
  const repositorio = pagina.indexOf('<h3>Repositorio del proyecto</h3>');
  assert.ok(
    principal >= 0
      && colaborador > principal
      && segundoColaborador > colaborador
      && repositorio > segundoColaborador,
    'orden de los bloques',
  );
});

test('las sidebars no crean scroll interno en escritorio', () => {
  const estilos = leer('../src/styles.css');
  const sidebar = leer('../src/components/Sidebar.jsx');

  assert.match(sidebar, /<nav className="side-nav">/);
  assert.match(estilos, /\.sidebar\s*\{[^}]*height:\s*auto/s);
  assert.match(estilos, /\.sidebar\s*\{[^}]*min-height:\s*calc\(100vh - 2 \* var\(--sidebar-gap\)\)/s);
  assert.match(estilos, /\.sidebar\s*\{[^}]*align-self:\s*flex-start/s);
  assert.match(estilos, /\.side-nav\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(estilos, /\.side-nav\s*\{[^}]*overflow:\s*visible/s);
  assert.doesNotMatch(estilos, /\.side-nav\s*\{[^}]*overflow-y:\s*(auto|scroll)/s);
  assert.match(
    estilos,
    /@media \(max-width: 860px\)[\s\S]*?\.sidebar,[\s\S]*?overflow-y:\s*auto/,
  );
});

test('Administración y Empresa añaden ACERCA DE después de Configuración', () => {
  for (const archivo of ['../src/layouts/LayoutAdmin.jsx', '../src/layouts/LayoutEmpresa.jsx']) {
    const layout = leer(archivo);
    assert.match(layout, /import \{[^}]*\bInfo\b[^}]*\} from 'lucide-react'/s);
    assert.match(layout, /titulo: 'Configuración'/);
    assert.match(layout, /titulo: 'Acerca de'/);
    assert.match(layout, /to: '\/about', icono: Info, texto: 'Acerca de'/);
    assert.ok(
      layout.indexOf("titulo: 'Configuración'") < layout.indexOf("titulo: 'Acerca de'"),
      `ACERCA DE debe ir después de Configuración en ${archivo}`,
    );
  }

  const admin = leer('../src/layouts/LayoutAdmin.jsx');
  assert.match(admin, /'\/about': \['Acerca de', 'Información del sistema y de su desarrollo'\]/);
});

test('el menú del postulante coloca Acerca de después de Mi cuenta y antes de Salir', () => {
  const layout = leer('../src/layouts/LayoutPostulante.jsx');

  assert.match(layout, /import \{[^}]*\bInfo\b[^}]*\} from 'lucide-react'/s);
  assert.match(layout, /NavLink/);
  assert.match(layout, /to="\/about"/);
  assert.match(layout, /<Info size=\{17\} aria-hidden="true" \/>/);
  assert.match(layout, /className=\{\(\{ isActive \}\) => \(isActive \? 'active' : ''\)\}/);

  const miCuenta = layout.indexOf("texto: 'Mi cuenta'");
  const about = layout.indexOf('to="/about"');
  const salir = layout.indexOf('<BotonSalir className="logout-item" />');
  assert.ok(miCuenta >= 0 && about > miCuenta && salir > about, 'orden del menú del postulante');
  assert.equal((layout.match(/className="divider"/g) || []).length, 2);
});

test('la página se registra en los metadatos y los estilos usan tokens del sistema', () => {
  const seo = leer('../src/components/SeoMeta.jsx');
  const estilos = leer('../src/styles.css');

  assert.match(seo, /'\/about': \{[\s\S]*?titulo: 'Acerca de'/);
  assert.match(estilos, /\.about-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(estilos, /@media \(max-width: 900px\)[\s\S]*?\.about-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(estilos, /\.about-link:focus-visible\s*\{[^}]*outline:/s);
});
