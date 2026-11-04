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

test('la landing reutiliza logo, tema y enlaces correctos', () => {
  const pagina = leer('../src/pages/inicio/Inicio.jsx');

  assert.match(pagina, /import BotonTema from '\.\.\/\.\.\/components\/BotonTema'/);
  assert.match(pagina, /import LogoMunicipal from '\.\.\/\.\.\/components\/LogoMunicipal'/);
  assert.match(pagina, /<LogoMunicipal decorative \/>/);
  assert.match(pagina, /<BotonTema \/>/);
  assert.doesNotMatch(pagina, /<img[^>]+sol-logo\.png/);

  assert.match(pagina, /to="\/inicio"/);
  assert.match(pagina, /to="\/postulante\/buscar"/);
  assert.match(pagina, /to="\/registro"/);
  assert.match(pagina, /to="\/login"/);
  assert.match(pagina, /to="\/registro-empresa"/);

  // El CTA principal y los accesos no apuntan todos al mismo destino.
  assert.match(pagina, /className="inicio-cta"/);
  assert.match(pagina, /Busca empleo, crea tu cuenta y descubre nuevas oportunidades\./);
  assert.match(pagina, /Para trabajadores/);
  assert.match(pagina, /Para empleadores/);
});

test('la landing muestra la información institucional y los cinco bloques del sistema', () => {
  const pagina = leer('../src/pages/inicio/Inicio.jsx');

  assert.match(pagina, /Empleo MDJLO/);
  assert.match(pagina, /Sistema de intermediación laboral/);
  assert.match(pagina, /Municipalidad Distrital de José Leonardo Ortiz/);
  assert.match(pagina, /Unidad Funcional del Empleo/);
  assert.match(pagina, /Conectamos talento local con oportunidades laborales\./);
  assert.match(pagina, /Búsqueda de empleo/);
  assert.match(pagina, /Perfil profesional/);
  assert.match(pagina, /Postulaciones/);
  assert.match(pagina, /Empresas/);
  assert.match(pagina, /Oportunidades/);
});

test('la landing incluye el cómo funciona y los documentos legales existentes', () => {
  const pagina = leer('../src/pages/inicio/Inicio.jsx');
  const legales = leer('../src/legal/documentos.js');

  assert.match(pagina, /Una plataforma para conectar oportunidades\./);
  assert.match(pagina, /Para quienes buscan empleo/);
  assert.match(pagina, /Para las empresas/);
  assert.match(pagina, /Para la municipalidad/);
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

  assert.match(estilos, /\.inicio-main\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.45fr\) minmax\(300px, 0\.85fr\)/s);
  assert.match(estilos, /@media \(max-width: 1100px\)[\s\S]*?\.inicio-main\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(estilos, /@media \(max-width: 700px\)/);
  assert.match(estilos, /@media \(max-width: 560px\)/);
  assert.match(estilos, /\.inicio-acceso\s*\{[^}]*order:\s*2/s);
  assert.doesNotMatch(estilos, /--navy:\s*#/);
});
