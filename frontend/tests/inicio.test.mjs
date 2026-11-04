// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('la landing /inicio existe y es pública, sin RutaPublica ni layouts por rol', () => {
  const rutas = leer('../src/routes/index.jsx');

  assert.match(rutas, /import InicioLanding from '\.\.\/pages\/inicio\/Inicio'/);
  assert.match(rutas, /<Route path="\/inicio" element=\{<InicioLanding \/>\} \/>/);
  assert.doesNotMatch(rutas, /<Route path="\/inicio" element=\{<RutaPublica/);
});

test('la raíz redirige a /inicio para visitantes y conserva los paneles por rol', () => {
  const rutas = leer('../src/routes/index.jsx');
  const constantes = leer('../src/constants.js');
  const login = leer('../src/pages/auth/Login.jsx');

  assert.match(rutas, /function Raiz\(\)/);
  assert.match(rutas, /if \(!usuario\) return <Navigate to=\{RUTA_BIENVENIDA_PUBLICA\} replace \/>/);
  assert.match(rutas, /return <Navigate to=\{rutaPanel\(usuario\.rol\)\} replace \/>/);

  assert.match(constantes, /export const RUTA_BIENVENIDA_PUBLICA = '\/inicio'/);
  assert.match(constantes, /export const RUTA_BUSQUEDA_EMPLEO = '\/postulante\/buscar'/);
  assert.match(constantes, /\[ROLES\.ADMIN\]: '\/admin\/dashboard'/);
  assert.match(constantes, /\[ROLES\.EMPRESA\]: '\/empresa\/dashboard'/);
  assert.match(constantes, /\[ROLES\.POSTULANTE\]: '\/postulante\/dashboard'/);

  // El postulante conserva el destino previo y, si no existe, la búsqueda.
  assert.match(login, /const desde = location\.state\?\.from/);
  assert.match(login, /desde \|\| RUTA_BUSQUEDA_EMPLEO/);
  assert.doesNotMatch(login, /desde \|\| RUTA_BIENVENIDA_PUBLICA/);
});

test('la navbar es mínima: marca, buscar empleo y tema', () => {
  const pagina = leer('../src/pages/inicio/Inicio.jsx');
  const navbar = pagina.slice(
    pagina.indexOf('<header className="inicio-nav">'),
    pagina.indexOf('</header>'),
  );

  assert.match(pagina, /import BotonTema/);
  assert.match(pagina, /import LogoMunicipal/);
  assert.match(navbar, /<LogoMunicipal decorative \/>/);
  assert.match(navbar, /to="\/inicio"/);
  assert.match(navbar, /Empleo MDJLO/);
  assert.match(navbar, /Sistema de intermediación laboral/);
  assert.match(navbar, /to="\/postulante\/buscar"/);
  assert.match(navbar, /Buscar empleo/);
  assert.match(navbar, /<BotonTema \/>/);
  assert.doesNotMatch(navbar, /to="\/login"|to="\/registro"|Mi panel/);
  assert.doesNotMatch(pagina, /<img[^>]+sol-logo\.png/);
});

test('el hero conserva el mensaje institucional sin tarjetas de funcionalidades', () => {
  const pagina = leer('../src/pages/inicio/Inicio.jsx');

  assert.match(pagina, /Municipalidad Distrital de José Leonardo Ortiz/);
  assert.match(pagina, /Conectamos talento con oportunidades laborales\./);
  assert.match(
    pagina,
    /Empleo MDJLO es el sistema de intermediación laboral de la Municipalidad\s+Distrital de José Leonardo Ortiz, que facilita el encuentro entre personas\s+que buscan empleo y empresas que necesitan incorporar talento\./,
  );
  assert.match(pagina, /Consulta ofertas · Gestiona tu perfil · Realiza postulaciones/);

  // Se eliminó la grilla de cinco capacidades y la sección informativa inferior.
  assert.doesNotMatch(pagina, /Búsqueda de empleo/);
  assert.doesNotMatch(pagina, /Perfil profesional/);
  assert.doesNotMatch(pagina, /Una plataforma para conectar oportunidades/);
  assert.doesNotMatch(pagina, /inicio-capacidades/);
  assert.doesNotMatch(pagina, /inicio-como/);
});

test('el panel de acceso mantiene CTA y enlaces diferenciados', () => {
  const pagina = leer('../src/pages/inicio/Inicio.jsx');

  assert.match(pagina, /Accede al sistema/);
  assert.match(pagina, /¿Eres trabajador o empleador\?/);
  assert.match(pagina, /Explorar ofertas laborales/);
  assert.match(pagina, /to="\/postulante\/buscar"/);
  assert.match(pagina, /Trabajadores/);
  assert.match(pagina, /to="\/registro">Crear cuenta/);
  assert.match(pagina, /to="\/login">Iniciar sesión/);
  assert.match(pagina, /Empleadores/);
  assert.match(pagina, /to="\/registro-empresa">Registrar empresa/);
  assert.match(pagina, /Para trabajadores|Trabajadores/);
});

test('la sección ¿Cómo funciona? aparece antes de la presentación institucional', () => {
  const pagina = leer('../src/pages/inicio/Inicio.jsx');

  assert.ok(
    pagina.indexOf('<section className="inicio-pasos"') < pagina.indexOf('<main className="inicio-main">'),
    '¿Cómo funciona? debe ir inmediatamente después de la navbar',
  );
  assert.ok(
    pagina.indexOf('<main className="inicio-main">') < pagina.indexOf('<footer className="inicio-footer">'),
    'el footer debe quedar después de ambas secciones',
  );
});

test('la sección ¿Cómo funciona? presenta tres pasos y el acceso para empresas', () => {
  const pagina = leer('../src/pages/inicio/Inicio.jsx');

  assert.match(pagina, /¿Cómo funciona\?/);
  assert.match(pagina, /Encuentra oportunidades y participa en tres sencillos pasos\./);
  assert.match(pagina, /01/);
  assert.match(pagina, /02/);
  assert.match(pagina, /03/);
  assert.match(pagina, /Explora ofertas/);
  assert.match(pagina, /Consulta las oportunidades laborales disponibles y conoce sus requisitos\./);
  assert.match(pagina, /Crea tu perfil/);
  assert.match(pagina, /Registra tus datos personales y experiencia profesional/);
  assert.match(pagina, /Postula/);
  assert.match(pagina, /Envía tu candidatura y consulta el estado de tus postulaciones\./);
  assert.match(pagina, /¿Representas a una empresa\?/);
  assert.match(pagina, /Incorpora oportunidades laborales y encuentra talento\./);
  assert.match(pagina, /to="\/registro-empresa">Acceso para empresas/);
  assert.match(pagina, /PASOS\.map/);
  assert.doesNotMatch(pagina, /lucide-react/);
});

test('el pie enlaza los documentos legales existentes', () => {
  const pagina = leer('../src/pages/inicio/Inicio.jsx');
  const legales = leer('../src/legal/documentos.js');

  assert.match(pagina, /Unidad Funcional del Empleo/);
  assert.match(pagina, /LEGAL_LINKS/);
  assert.match(legales, /\/politica-privacidad/);
  assert.match(legales, /\/terminos-condiciones/);
  assert.match(legales, /\/aviso-legal/);
  assert.match(legales, /\/politica-cookies/);
});

test('los metadatos SEO de /inicio están registrados', () => {
  const seo = leer('../src/components/SeoMeta.jsx');

  assert.match(seo, /'\/inicio': \{/);
  assert.match(seo, /titulo: 'Inicio'/);
  assert.match(seo, /Conoce Empleo MDJLO, el sistema de intermediación laboral/);
});

test('los estilos usan tokens del sistema y definen adaptación responsive', () => {
  const estilos = leer('../src/pages/inicio/inicio.css');

  for (const token of [
    '--navy',
    '--white',
    '--fondo',
    '--line',
    '--text-1',
    '--text-2',
    '--text-3',
    '--accion-primario',
    '--accion-primario-hover',
    '--accion-primario-texto',
    '--radius-md',
    '--radius-xl',
    '--radius-2xl',
    '--radius-pill',
    '--sombra-tarjeta',
  ]) {
    assert.match(estilos, new RegExp(token));
  }

  assert.match(estilos, /\.inicio-main\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.35fr\) minmax\(300px, 0\.8fr\)/s);
  assert.match(estilos, /\.inicio-pasos\s*\{[^}]*background:\s*var\(--white\)/s);
  assert.match(estilos, /\.inicio-pasos\s*\{[^}]*border-radius:\s*var\(--radius-2xl\)/s);
  assert.match(estilos, /\.inicio-paso\s*\{[^}]*background:\s*var\(--fondo\)/s);
  assert.match(estilos, /\.inicio-paso\s*\{[^}]*border-radius:\s*var\(--radius-xl\)/s);
  assert.match(estilos, /\.inicio-pasos-lista\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(
    estilos,
    /\.inicio-nav,\s*\.inicio-main,\s*\.inicio-pasos,\s*\.inicio-footer\s*\{[^}]*width:\s*var\(--inicio-w\)/s,
  );
  assert.match(
    estilos,
    /\.inicio-footer\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*justify-content:\s*space-between/s,
  );
  assert.match(estilos, /\.inicio-footer\s*\{[^}]*border-radius:\s*var\(--radius-pill\)/s);
  assert.match(estilos, /\.inicio-footer\s*\{[^}]*background:\s*var\(--white\)/s);
  assert.match(estilos, /\.inicio-footer\s*\{[^}]*border:\s*1px solid var\(--line\)/s);
  assert.doesNotMatch(estilos, /\.inicio-footer\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(estilos, /@media \(max-width: 900px\)[\s\S]*?\.inicio-main\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(estilos, /@media \(max-width: 900px\)[\s\S]*?\.inicio-pasos-lista\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(estilos, /@media \(max-width: 560px\)/);
  assert.match(estilos, /\.inicio-acceso\s*\{[^}]*order:\s*2/s);
  assert.doesNotMatch(estilos, /inicio-capacidades|inicio-como/);
  assert.doesNotMatch(estilos, /--navy:\s*#/);
});
