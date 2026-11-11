// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = (process.env.E2E_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const ART = process.env.E2E_ARTIFACTS || '/tmp/sol-e2e';
mkdirSync(ART, { recursive: true });

const CREDENCIALES = {
  admin: {
    usuario: process.env.E2E_ADMIN_USER || 'admin',
    clave: process.env.E2E_ADMIN_PASS || 'Admin123!',
  },
  empresa: {
    usuario: process.env.E2E_EMPRESA_USER || '20601234567',
    clave: process.env.E2E_EMPRESA_PASS || 'Empresa123!',
  },
  postulante: {
    usuario: process.env.E2E_POSTULANTE_USER || '12345678',
    clave: process.env.E2E_POSTULANTE_PASS || 'Postu123!',
  },
};

function rutaChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(base)) return undefined;
  const carpeta = readdirSync(base)
    .filter((nombre) => nombre.startsWith('chromium_headless_shell-'))
    .sort()
    .at(-1);
  if (!carpeta) return undefined;
  const bin = join(base, carpeta, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
  return existsSync(bin) ? bin : undefined;
}

const resultados = [];
let fallos = 0;
let bloqueados = 0;
let paginaActiva = null;

function slug(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function ejecutar(nombre, accion) {
  try {
    await accion();
    resultados.push({ estado: 'OK', nombre });
    return true;
  } catch (error) {
    fallos++;
    resultados.push({ estado: 'FAIL', nombre, error: error.message });
    if (paginaActiva) {
      try {
        await paginaActiva.screenshot({
          path: join(ART, `fail-${resultados.length}-${slug(nombre)}.png`),
          fullPage: true,
        });
      } catch {
        // La captura es evidencia best-effort; no debe ocultar el fallo original.
      }
    }
    return false;
  }
}

function bloqueado(nombre, motivo) {
  bloqueados++;
  resultados.push({ estado: 'BLOCKED', nombre, motivo });
}

function vigilarErrores(page) {
  const errores = [];
  page.on('pageerror', (error) => errores.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const texto = msg.text();
    if (/favicon|Download the React DevTools/i.test(texto)) return;
    // Eventos transitorios del stack de red de Chromium (cambio de interfaz),
    // no del backend: las respuestas 5xx y los fallos de ruta se siguen validando.
    if (/ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED/i.test(texto)) return;
    // Ruido de widgets externos (Google Identity/Cloudflare Turnstile) que no
    // forma parte de la aplicación y no afecta a las aserciones de ruta/API.
    if (/GSI_LOGGER|accounts\.google\.com|challenges\.cloudflare\.com|Connecting to 'data:,|Fetch API cannot load data:,|font-size:0;color:transparent|Failed to load resource: the server responded with a status of 403 \(\)/i.test(texto)) return;
    errores.push(`console: ${texto}`);
  });
  page.on('response', (respuesta) => {
    const url = respuesta.url();
    if (url.includes('/api/') && respuesta.status() >= 500) {
      errores.push(`api ${respuesta.status()} ${url}`);
    }
  });
  return errores;
}

async function sinDesbordamiento(page, etiqueta) {
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(desborde <= 1, `${etiqueta}: desbordamiento horizontal de ${desborde}px`);
}

async function visitar(page, ruta, textoEsperado) {
  paginaActiva = page;
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  if (textoEsperado) {
    await page.getByRole('heading', { name: new RegExp(textoEsperado, 'i') }).first().waitFor({ timeout: 10000 });
  }
  await sinDesbordamiento(page, ruta);
}

async function iniciarSesion(page, rol) {
  paginaActiva = page;
  const { usuario, clave } = CREDENCIALES[rol];
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(usuario);
  await page.locator('#password').fill(clave);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 });
}

async function guardarErrores(nombre, errores) {
  if (errores.length > 0) {
    writeFileSync(join(ART, `${nombre}.errores.txt`), errores.join('\n'));
  }
  await ejecutar(`${nombre}: sin errores de consola/API`, async () => {
    assert.deepEqual(errores, []);
  });
}

function escribirInformes() {
  const resumen = {
    base: BASE,
    fecha: new Date().toISOString(),
    total: resultados.length,
    ok: resultados.filter((r) => r.estado === 'OK').length,
    fallos,
    bloqueados,
    resultados,
  };
  writeFileSync(
    join(ART, 'resultado.txt'),
    resultados.map((r) => `${r.estado.padEnd(7)} ${r.nombre}${r.error ? ': ' + r.error : ''}`).join('\n') + '\n',
  );
  writeFileSync(join(ART, 'resultado.json'), JSON.stringify(resumen, null, 2) + '\n');
}

let navegador = null;
try {
  navegador = await chromium.launch({ headless: true, executablePath: rutaChromium() });

  // Público
  {
    const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE' });
    const page = await contexto.newPage();
    const errores = vigilarErrores(page);
    paginaActiva = page;

    await ejecutar('público: /inicio carga y no duplica el acceso a ofertas', async () => {
      await visitar(page, '/inicio', 'Accede al Portal laboral');
      assert.equal(await page.locator('.inicio-nav').getByText('Buscar empleo').count(), 0);
      await page.getByText('Explorar ofertas laborales', { exact: true }).waitFor();
      assert.ok(await page.locator('.inicio-pasos').isVisible());
      assert.ok(await page.locator('.inicio-footer-links').isVisible());
    });

    await ejecutar('público: login, registro y afiliación cargan', async () => {
      await visitar(page, '/login', 'Inicio de sesión');
      await visitar(page, '/registro', 'REGISTRO DE POSTULANTE');
      await visitar(page, '/registro-empresa', 'AFILIACIÓN DE EMPRESA');
    });

    await ejecutar('público: responsive sin desbordamiento', async () => {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 768, height: 1024 },
        { width: 390, height: 844 },
        { width: 360, height: 800 },
      ]) {
        await page.setViewportSize(viewport);
        await visitar(page, '/inicio', 'Accede al Portal laboral');
      }
    });

    await guardarErrores('publico', errores);
    await contexto.close();
  }

  // Administración
  {
    const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE' });
    const page = await contexto.newPage();
    const errores = vigilarErrores(page);
    paginaActiva = page;
    const sesion = await ejecutar('admin: inicio de sesión', () => iniciarSesion(page, 'admin'));

    const rutas = [
      ['/admin/dashboard', 'Dashboard'],
      ['/admin/usuarios', 'Usuarios'],
      ['/admin/empresas', 'Empresas'],
      ['/admin/solicitudes-empresa', 'Solicitudes'],
      ['/admin/ofertas', 'Ofertas'],
      ['/admin/actividades', 'Actividades'],
      ['/admin/oportunidades', 'Difusión'],
      ['/admin/contrataciones', 'Contratos'],
    ];
    for (const [ruta, texto] of rutas) {
      if (!sesion) {
        bloqueado(`admin: ${ruta}`, 'sesión de administración no iniciada');
        continue;
      }
      await ejecutar(`admin: ${ruta}`, () => visitar(page, ruta, texto));
    }

    if (!sesion) {
      bloqueado('admin: interacciones', 'sesión de administración no iniciada');
    } else {
      await ejecutar('admin: alta de usuario abre y cierra el formulario', async () => {
        await visitar(page, '/admin/usuarios', 'Usuarios');
        await page.getByRole('button', { name: /Nuevo usuario municipal/ }).click();
        await page.getByText('Nuevo personal municipal', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Cancelar' }).first().click();
      });

      await ejecutar('admin: editor de actividad abre y cierra', async () => {
        await visitar(page, '/admin/actividades', 'Actividades');
        await page.getByRole('button', { name: /Nueva actividad/ }).click();
        await page.getByRole('heading', { name: 'Nueva actividad' }).first().waitFor();
        await page.getByRole('button', { name: 'Cancelar' }).first().click();
      });

      await ejecutar('admin: editor de oportunidad abre y cierra', async () => {
        await visitar(page, '/admin/oportunidades', 'Difusión');
        await page.getByRole('button', { name: /Nueva oportunidad/ }).click();
        await page.getByRole('heading', { name: 'Nueva oportunidad' }).first().waitFor();
        await page.getByRole('button', { name: 'Cancelar' }).first().click();
      });

      await ejecutar('admin: drawer móvil abre y cierra', async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await visitar(page, '/admin/dashboard', 'Dashboard');
        await page.locator('.side-movil-burger').click();
        await page.waitForFunction(() => document.querySelector('.sidebar')?.classList.contains('abierto'));
        await page.locator('.side-cerrar-movil').click();
        await page.waitForFunction(() => !document.querySelector('.sidebar')?.classList.contains('abierto'));
        await sinDesbordamiento(page, 'admin móvil');
      });
    }

    await guardarErrores('admin', errores);
    await contexto.close();
  }

  // Empresa
  {
    const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE' });
    const page = await contexto.newPage();
    const errores = vigilarErrores(page);
    paginaActiva = page;
    const sesion = await ejecutar('empresa: inicio de sesión', () => iniciarSesion(page, 'empresa'));

    const rutas = [
      ['/empresa/dashboard', 'Panel de empresa'],
      ['/empresa/perfil', 'Mi empresa'],
      ['/empresa/ofertas', 'Ofertas laborales'],
      ['/empresa/postulaciones', 'Postulaciones'],
      ['/empresa/contrataciones', 'Contrataciones'],
      ['/empresa/cuenta', 'Mi cuenta'],
    ];
    for (const [ruta, texto] of rutas) {
      if (!sesion) {
        bloqueado(`empresa: ${ruta}`, 'sesión de empresa no iniciada');
        continue;
      }
      await ejecutar(`empresa: ${ruta}`, () => visitar(page, ruta, texto));
    }

    if (!sesion) {
      bloqueado('empresa: formulario de oferta', 'sesión de empresa no iniciada');
    } else {
      await ejecutar('empresa: formulario de oferta abre y cierra', async () => {
        await visitar(page, '/empresa/ofertas', 'Ofertas laborales');
        await page.getByRole('button', { name: /Nueva oferta/ }).click();
        await page.getByRole('heading', { name: /Nueva oferta/ }).first().waitFor();
        await page.getByRole('button', { name: 'Cancelar' }).first().click();
      });
    }

    await guardarErrores('empresa', errores);
    await contexto.close();
  }

  // Postulante
  {
    const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE' });
    const page = await contexto.newPage();
    const errores = vigilarErrores(page);
    paginaActiva = page;
    const sesion = await ejecutar('postulante: inicio de sesión', () => iniciarSesion(page, 'postulante'));

    const rutas = [
      ['/postulante/perfil', 'Mi perfil y CV'],
      ['/postulante/postulaciones', 'Mis postulaciones'],
      ['/postulante/cuenta', 'Mi cuenta'],
      ['/postulante/buscar', null],
      ['/postulante/oportunidades', 'Ferias y oportunidades'],
    ];
    for (const [ruta, texto] of rutas) {
      if (!sesion) {
        bloqueado(`postulante: ${ruta}`, 'sesión de postulante no iniciada');
        continue;
      }
      await ejecutar(`postulante: ${ruta}`, async () => {
        paginaActiva = page;
        await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        if (ruta === '/postulante/buscar') {
          const hayOfertas = await page.getByText('Ofertas Disponibles', { exact: false }).count();
          const vacio = await page.getByText('No hay ofertas publicadas', { exact: false }).count();
          assert.ok(hayOfertas > 0 || vacio > 0, 'sin resultados ni estado vacío');
        } else {
          await page.getByRole('heading', { name: new RegExp(texto, 'i') }).first().waitFor({ timeout: 10000 });
        }
        await sinDesbordamiento(page, ruta);
      });
    }

    await guardarErrores('postulante', errores);
    await contexto.close();
  }
} catch (error) {
  fallos++;
  resultados.push({ estado: 'FAIL', nombre: 'ejecución E2E', error: error.message });
} finally {
  if (navegador) {
    await navegador.close().catch(() => {});
  }
  escribirInformes();
}

console.log(resultados.map((r) => `${r.estado.padEnd(7)} ${r.nombre}${r.error ? ': ' + r.error : ''}`).join('\n'));
console.log(`E2E: ${resultados.filter((r) => r.estado === 'OK').length} OK, ${fallos} fallo(s), ${bloqueados} bloqueado(s). Evidencias en ${ART}`);

if (fallos > 0 || bloqueados > 0) {
  process.exitCode = 1;
}
