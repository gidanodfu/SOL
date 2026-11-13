// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = (process.env.E2E_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const API = (process.env.E2E_API_URL || BASE).replace(/\/+$/, '');
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


async function verificarShell(page, etiqueta) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const contenido = document.querySelector('.content');
    const relleno = document.createElement('div');
    relleno.id = 'e2e-shell-spacer';
    relleno.style.height = '1400px';
    contenido.append(relleno);
  });
  const antes = await page.evaluate(() => {
    const contenido = document.querySelector('.content');
    const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
    const workspace = document.querySelector('.app-workspace').getBoundingClientRect();
    return {
      winY: window.scrollY,
      sidebar: { top: Math.round(sidebar.top), bottom: Math.round(sidebar.bottom) },
      workspace: { top: Math.round(workspace.top), bottom: Math.round(workspace.bottom) },
      content: {
        client: contenido.clientHeight,
        scroll: contenido.scrollHeight,
        overflow: getComputedStyle(contenido).overflowY,
      },
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
    };
  });

  assert.ok(
    Math.abs(antes.sidebar.top - antes.workspace.top) <= 1
      && Math.abs(antes.sidebar.bottom - antes.workspace.bottom) <= 1,
    `${etiqueta}: sidebar y workspace desalineados`,
  );
  assert.equal(antes.content.overflow, 'auto', `${etiqueta}: el contenido no tiene scroll propio`);
  assert.ok(antes.content.scroll > antes.content.client, `${etiqueta}: el contenido de prueba no desborda`);
  assert.ok(antes.docW <= antes.winW + 1, `${etiqueta}: desbordamiento horizontal del documento`);

  await page.evaluate(() => {
    const contenido = document.querySelector('.content');
    contenido.scrollTop = contenido.scrollHeight;
  });
  await page.waitForTimeout(200);
  const despues = await page.evaluate(() => {
    const contenido = document.querySelector('.content');
    const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
    return {
      winY: window.scrollY,
      contentTop: contenido.scrollTop,
      sidebarTop: Math.round(sidebar.top),
      sidebarBottom: Math.round(sidebar.bottom),
    };
  });

  assert.equal(despues.winY, 0, `${etiqueta}: el documento se desplazó en vez del contenido`);
  assert.ok(despues.contentTop > 0, `${etiqueta}: el contenido no se desplazó`);
  assert.equal(despues.sidebarTop, antes.sidebar.top, `${etiqueta}: la sidebar se movió al hacer scroll`);
  assert.equal(despues.sidebarBottom, antes.sidebar.bottom, `${etiqueta}: la sidebar cambió de altura`);

  const anchoExpandido = await page.locator('.app-workspace').evaluate((el) => el.getBoundingClientRect().width);
  await page.locator('.side-colapsar').click();
  await page.waitForTimeout(250);
  const anchoColapsado = await page.locator('.app-workspace').evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(anchoColapsado > anchoExpandido + 100, `${etiqueta}: el workspace no recupera ancho al colapsar`);
  await page.locator('.side-colapsar').click();
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    document.getElementById('e2e-shell-spacer')?.remove();
    const contenido = document.querySelector('.content');
    contenido.scrollTop = 0;
  });
}

async function esperarPanel(page, selector = '.dropdown-panel') {
  const panel = page.locator(selector);
  await panel.waitFor({ state: 'visible' });
  await panel.evaluate((el) => Promise.all(el.getAnimations().map((animacion) => animacion.finished)));
  return panel;
}

async function medirScroll(panel) {
  return panel.evaluate((el) => {
    const estilo = getComputedStyle(el);
    const bordes = parseFloat(estilo.borderLeftWidth) + parseFloat(estilo.borderRightWidth);
    return {
      overflowY: estilo.overflowY,
      scrollbarWidth: estilo.scrollbarWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollTop: el.scrollTop,
      barraAncho: el.offsetWidth - el.clientWidth - bordes,
    };
  });
}

function assertSinBarraVisible(medida, etiqueta) {
  assert.equal(medida.overflowY, 'auto', `${etiqueta}: se perdió overflow-y: auto`);
  assert.equal(medida.scrollbarWidth, 'none', `${etiqueta}: scrollbar-width no es none`);
  assert.equal(medida.barraAncho, 0, `${etiqueta}: hay una barra de scroll visible`);
}

async function verificarCatalogoCategorias(page) {
  const respuesta = await page.request.get(`${API}/api/categorias`);
  const texto = await respuesta.text();
  writeFileSync(join(ART, 'categorias.json'), texto + '\n');
  assert.equal(respuesta.status(), 200, `GET /api/categorias respondió ${respuesta.status()}; evidencia en categorias.json`);

  let cuerpo;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    throw new Error('GET /api/categorias no devolvió JSON válido; evidencia en categorias.json');
  }

  assert.equal(cuerpo.success, true, 'GET /api/categorias no devolvió success=true');
  assert.ok(Array.isArray(cuerpo.data), 'GET /api/categorias no devolvió el arreglo data');

  const categoria = cuerpo.data.find((item) => item.nombre === 'Construcción');
  assert.ok(
    categoria,
    'Fixture incompleta: /api/categorias no incluye "Construcción". Ejecute bootstrap.sh (SystemSeeder) antes de DatosPruebaSeeder.',
  );
  assert.ok(
    ['1', 'true', 1, true].includes(categoria.activo),
    'Fixture inválida: la categoría "Construcción" no está activa.',
  );
}


function fechaHoyLima() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const valor = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return `${valor.year}-${valor.month}-${valor.day}`;
}

function fechaDMA(iso) {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

async function abrirCalendario(page, input) {
  await input.click();
  return esperarPanel(page, '.fecha-hora__calendario');
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
    const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE', timezoneId: 'America/Lima' });
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
    const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE', timezoneId: 'America/Lima' });
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
      await ejecutar('admin: shell estable con scroll interno', async () => {
        await visitar(page, '/admin/usuarios', 'Usuarios');
        await verificarShell(page, 'admin');
      });


      await ejecutar('admin: selector personalizado con panel centrado', async () => {
        await visitar(page, '/admin/usuarios', 'Usuarios');
        const combo = page.getByRole('combobox').first();
        await combo.click();
        await esperarPanel(page);
        const m = await page.evaluate(() => {
          const t = document.querySelector('[role="combobox"]').getBoundingClientRect();
          const p = document.querySelector('.dropdown-panel').getBoundingClientRect();
          return {
            centroTrigger: t.left + t.width / 2,
            centroPanel: p.left + p.width / 2,
            gap: p.top - t.bottom,
            rol: document.querySelector('.dropdown-panel')?.getAttribute('role'),
          };
        });
        assert.equal(m.rol, 'listbox');
        assert.ok(Math.abs(m.centroTrigger - m.centroPanel) <= 2, 'panel no centrado');
        assert.ok(m.gap >= 8 && m.gap <= 12, `separación inesperada: ${m.gap}`);
        await page.locator('.dropdown-panel [role="option"]').filter({ hasText: 'Empresa' }).first().click();
        assert.equal(await combo.innerText(), 'Empresa');
        await combo.click();
        await page.locator('.dropdown-panel [role="option"]').filter({ hasText: 'Todos los roles' }).click();
        await combo.focus();
        await page.keyboard.press('ArrowDown');
        assert.equal(await combo.getAttribute('aria-expanded'), 'true');
        await page.keyboard.press('Escape');
        assert.equal(await combo.getAttribute('aria-expanded'), 'false');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'combobox');
      });

      await ejecutar('admin: panel se abre hacia arriba en viewport bajo', async () => {
        await page.setViewportSize({ width: 1280, height: 400 });
        await visitar(page, '/admin/usuarios', 'Usuarios');
        await page.getByRole('combobox').first().click();
        await esperarPanel(page);
        const m = await page.evaluate(() => {
          const p = document.querySelector('.dropdown-panel');
          const r = p.getBoundingClientRect();
          return { placement: p.dataset.placement, top: r.top, bottom: r.bottom, vh: innerHeight };
        });
        assert.equal(m.placement, 'top');
        assert.ok(m.top >= 0 && m.bottom <= m.vh, 'panel fuera del viewport');
        await page.setViewportSize({ width: 1440, height: 900 });
      });

      await ejecutar('admin: Selecto sin barra de scroll visible', async () => {
        await visitar(page, '/admin/usuarios', 'Usuarios');
        await page.getByRole('combobox').first().click();
        const panel = await esperarPanel(page);
        const medida = await medirScroll(panel);
        assertSinBarraVisible(medida, 'Selecto admin');
        await page.keyboard.press('Escape');
      });

      await ejecutar('admin: dashboard usa el calendario compartido del periodo', async () => {
        await visitar(page, '/admin/dashboard', 'Dashboard');
        assert.equal(await page.locator('.fecha-hora-campo.date-field').count(), 2);
        const desde = page.locator('input.fecha-hora__input').first();
        const panel = await abrirCalendario(page, desde);
        assert.ok(await panel.evaluate((el) => el.closest('.content') === null));
        await page.getByRole('button', { name: 'Hoy' }).click();
        assert.equal(await desde.inputValue(), fechaDMA(fechaHoyLima()));
      });

      await ejecutar('admin: calendario de fecha filtra el periodo y limpia', async () => {
        await visitar(page, '/admin/contrataciones', 'Contrataciones registradas');
        const hoy = fechaHoyLima();
        const desde = page.locator('input.fecha-hora__input').nth(0);
        const hasta = page.locator('input.fecha-hora__input').nth(1);

        const panel = await abrirCalendario(page, desde);
        assert.ok(await panel.evaluate((el) => el.closest('.content') === null), 'el calendario quedó dentro del workspace');
        const geometria = await page.evaluate(() => {
          const input = document.querySelector('input.fecha-hora__input').getBoundingClientRect();
          const calendario = document.querySelector('.fecha-hora__calendario').getBoundingClientRect();
          return {
            gap: calendario.top - input.bottom,
            top: calendario.top,
            bottom: calendario.bottom,
            vh: innerHeight,
            desborde: document.documentElement.scrollWidth - innerWidth,
          };
        });
        assert.ok(geometria.gap >= 8 && geometria.gap <= 12, `separación inesperada: ${geometria.gap}`);
        assert.ok(geometria.top >= 0 && geometria.bottom <= geometria.vh, 'calendario fuera del viewport');
        assert.ok(geometria.desborde <= 1, `desbordamiento horizontal: ${geometria.desborde}`);

        const esperaDesde = page.waitForResponse((r) => {
          if (r.request().method() !== 'GET' || !r.url().includes('/api/admin/contrataciones')) return false;
          return new URL(r.url()).searchParams.get('desde') === hoy;
        });
        await page.getByRole('button', { name: 'Hoy' }).click();
        assert.equal((await esperaDesde).status(), 200);
        assert.equal(await desde.inputValue(), fechaDMA(hoy));

        const esperaHasta = page.waitForResponse((r) => {
          if (r.request().method() !== 'GET' || !r.url().includes('/api/admin/contrataciones')) return false;
          const params = new URL(r.url()).searchParams;
          return params.get('desde') === hoy && params.get('hasta') === hoy;
        });
        await hasta.click();
        await esperarPanel(page, '.fecha-hora__calendario');
        await page.getByRole('button', { name: 'Hoy' }).click();
        assert.equal((await esperaHasta).status(), 200);
        assert.equal(await hasta.inputValue(), fechaDMA(hoy));

        const esperaLimpiar = page.waitForResponse((r) => {
          if (r.request().method() !== 'GET' || !r.url().includes('/api/admin/contrataciones')) return false;
          return !new URL(r.url()).searchParams.has('desde');
        });
        await page.locator('.fecha-hora__wrapper').nth(0).locator('.react-datepicker__close-icon').click();
        await esperaLimpiar;
        assert.equal(await desde.inputValue(), '');
      });

      await ejecutar('admin: calendario se abre arriba y sigue al hacer scroll', async () => {
        await visitar(page, '/admin/contrataciones', 'Contrataciones registradas');
        await page.evaluate(() => {
          const input = document.querySelector('input.fecha-hora__input');
          const tarjeta = input.closest('.tarjeta') || input.closest('.content');
          const relleno = document.createElement('div');
          relleno.id = 'e2e-calendario-spacer';
          relleno.style.height = '520px';
          tarjeta.parentElement.insertBefore(relleno, tarjeta);
          input.scrollIntoView({ block: 'end' });
        });
        const input = page.locator('input.fecha-hora__input').first();
        const panel = await abrirCalendario(page, input);
        const placement = await page.locator('.fecha-hora__popper').getAttribute('data-placement');
        assert.ok(placement.startsWith('top'), `placement inesperado: ${placement}`);
        const limites = await panel.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, vh: innerHeight };
        });
        assert.ok(limites.top >= 0 && limites.bottom <= limites.vh, 'calendario fuera del viewport');

        const topAntes = await panel.evaluate((el) => el.getBoundingClientRect().top);
        await page.evaluate(() => { const contenido = document.querySelector('.content'); contenido.scrollTop = contenido.scrollHeight; });
        await page.waitForFunction((anterior) => {
          const actual = document.querySelector('.fecha-hora__calendario');
          return actual && Math.abs(actual.getBoundingClientRect().top - anterior) > 20;
        }, topAntes);
        const gap = await page.evaluate(() => {
          const i = document.querySelector('input.fecha-hora__input').getBoundingClientRect();
          const p = document.querySelector('.fecha-hora__calendario').getBoundingClientRect();
          return p.bottom <= i.top ? i.top - p.bottom : p.top - i.bottom;
        });
        assert.ok(gap >= 8 && gap <= 16, `separación tras scroll inesperada: ${gap}`);

        await page.evaluate(() => document.getElementById('e2e-calendario-spacer')?.remove());
        await page.keyboard.press('Escape');
      });

      await ejecutar('admin: calendario de fecha-hora conserva minutos y teclado', async () => {
        await visitar(page, '/admin/actividades', 'Actividades');
        await page.getByRole('button', { name: /Nueva actividad/ }).click();
        await page.getByRole('heading', { name: 'Nueva actividad' }).first().waitFor();

        await page.getByRole('button', { name: /Guardar$/ }).last().click();
        const error = page.locator('#actividad-fecha_inicio-error');
        await error.waitFor();
        assert.match(await error.innerText(), /fecha y hora de inicio/i);
        const inicio = page.locator('input.fecha-hora__input').first();
        assert.equal(await inicio.getAttribute('aria-invalid'), 'true');
        assert.match(await inicio.getAttribute('aria-describedby'), /actividad-fecha_inicio-error/);

        await inicio.focus();
        await page.keyboard.press('Enter');
        await esperarPanel(page, '.fecha-hora__calendario');
        await page.getByRole('button', { name: 'Hoy' }).click();
        assert.equal(await page.locator('.fecha-hora__calendario').count(), 1, 'el panel cerró antes de elegir la hora');
        const hora = page.locator('.fecha-hora__hora input').nth(0);
        const minuto = page.locator('.fecha-hora__hora input').nth(1);
        assert.equal(await hora.isDisabled(), false);
        await hora.fill('15');
        await minuto.fill('07');
        assert.equal(await inicio.inputValue(), `${fechaDMA(fechaHoyLima())} 15:07`);

        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.fecha-hora__calendario'));
        assert.ok((await page.evaluate(() => document.activeElement?.className || '')).includes('fecha-hora__input'));
      });

      await ejecutar('admin: calendario respeta las cinco paletas y modos', async () => {
        await visitar(page, '/admin/contrataciones', 'Contrataciones registradas');
        const anterior = await page.evaluate(() => ({
          tema: document.documentElement.dataset.tema,
          theme: document.documentElement.dataset.theme,
        }));
        try {
          const input = page.locator('input.fecha-hora__input').first();
          await abrirCalendario(page, input);
          await page.getByRole('button', { name: 'Hoy' }).click();
          await page.waitForFunction(() => !document.querySelector('.fecha-hora__calendario'));
          const panel = await abrirCalendario(page, input);
          const seleccion = panel.locator('.react-datepicker__day--selected').first();
          assert.ok(await seleccion.count(), 'no se marcó el día seleccionado');
          const fondos = new Set();

          for (const tema of ['blue', 'olive', 'amber', 'obsidian', 'red']) {
            for (const modo of ['light', 'dark']) {
              await page.evaluate(([t, m]) => {
                document.documentElement.dataset.tema = t;
                document.documentElement.dataset.theme = m;
              }, [tema, modo]);
              const medida = await panel.evaluate((el) => {
                const sonda = document.createElement('div');
                sonda.style.cssText = 'position:absolute;visibility:hidden;background:var(--white);color:var(--text-1);';
                document.body.append(sonda);
                const estilo = getComputedStyle(el);
                const esperado = getComputedStyle(sonda);
                const resultado = {
                  fondo: estilo.backgroundColor,
                  texto: estilo.color,
                  esperadoFondo: esperado.backgroundColor,
                  esperadoTexto: esperado.color,
                };
                sonda.remove();
                return resultado;
              });
              assert.equal(medida.fondo, medida.esperadoFondo, `${tema}-${modo}: fondo fuera de tokens`);
              assert.equal(medida.texto, medida.esperadoTexto, `${tema}-${modo}: texto fuera de tokens`);
              const seleccionada = await seleccion.evaluate((el) => {
                const sonda = document.createElement('div');
                sonda.style.cssText = 'position:absolute;visibility:hidden;background:var(--primario);';
                document.body.append(sonda);
                const esperado = getComputedStyle(sonda).backgroundColor;
                sonda.remove();
                return { actual: getComputedStyle(el).backgroundColor, esperado };
              });
              assert.equal(seleccionada.actual, seleccionada.esperado, `${tema}-${modo}: selección fuera de tokens`);
              fondos.add(medida.fondo);
            }
          }
          assert.equal(fondos.size, 2, 'los modos claro y oscuro no se distinguen');

          await page.evaluate(() => {
            document.documentElement.dataset.tema = 'blue';
            document.documentElement.dataset.theme = 'light';
          });
          const claro = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
          await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
          const oscuro = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
          assert.notEqual(claro, oscuro, 'el calendario no reaccionó al cambio de tema abierto');

          await page.evaluate(() => { document.documentElement.dataset.contrast = 'high'; });
          assert.ok(parseFloat(await panel.evaluate((el) => getComputedStyle(el).borderTopWidth)) >= 2);
          assert.ok(parseFloat(await input.evaluate((el) => getComputedStyle(el).borderTopWidth)) >= 2);

          await page.evaluate(() => { document.documentElement.dataset.motion = 'reduced'; });
          assert.equal(await panel.evaluate((el) => getComputedStyle(el).animationName), 'none');
        } finally {
          await page.evaluate((estado) => {
            const raiz = document.documentElement;
            if (estado.tema) raiz.dataset.tema = estado.tema;
            else delete raiz.dataset.tema;
            if (estado.theme) raiz.dataset.theme = estado.theme;
            else delete raiz.dataset.theme;
            delete raiz.dataset.contrast;
            delete raiz.dataset.motion;
          }, anterior);
        }
        await page.keyboard.press('Escape');
      });

      await ejecutar('admin: oportunidad conserva fecha y hora en el payload', async () => {
        await visitar(page, '/admin/oportunidades', 'Difusión');
        await page.getByRole('button', { name: /Nueva oportunidad/ }).click();
        await page.getByRole('heading', { name: 'Nueva oportunidad' }).first().waitFor();
        const hoy = fechaHoyLima();

        await page.locator('#oportunidad-fuente').click();
        await page.getByRole('option', { name: 'Empleos Perú', exact: true }).click();
        await page.locator('#oportunidad-titulo').fill('Convocatoria E2E');
        await page.locator('#oportunidad-enlace').fill('https://example.com/convocatoria');

        const inicio = page.locator('input.fecha-hora__input').nth(0);
        const fin = page.locator('input.fecha-hora__input').nth(1);
        await abrirCalendario(page, inicio);
        await page.getByRole('button', { name: 'Hoy' }).click();
        await page.locator('.fecha-hora__hora input').nth(0).fill('15');
        await page.locator('.fecha-hora__hora input').nth(1).fill('07');
        await page.keyboard.press('Escape');
        await abrirCalendario(page, fin);
        await page.getByRole('button', { name: 'Hoy' }).click();
        await page.locator('.fecha-hora__hora input').nth(0).fill('16');
        await page.locator('.fecha-hora__hora input').nth(1).fill('07');
        await page.keyboard.press('Escape');
        assert.equal(await inicio.inputValue(), `${fechaDMA(hoy)} 15:07`);
        assert.equal(await fin.inputValue(), `${fechaDMA(hoy)} 16:07`);

        await page.locator('#oportunidad-modalidad').click();
        await page.getByRole('option', { name: 'Virtual', exact: true }).click();
        const editor = page.locator('[contenteditable="true"]').first();
        await editor.waitFor();
        await editor.fill('Descripción de la convocatoria E2E.');

        let resolver;
        const capturado = new Promise((resolverPromesa) => { resolver = resolverPromesa; });
        await page.route('**/api/admin/oportunidades', async (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          resolver(route.request().postDataJSON());
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, message: 'ok', data: { id: 999999 } }),
          });
        });
        await page.getByRole('button', { name: 'Guardar', exact: true }).click();
        const datos = await Promise.race([
          capturado,
          new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('La oportunidad no envió el POST esperado.')), 10000)),
        ]);
        await page.unroute('**/api/admin/oportunidades');
        assert.equal(datos.fecha_inicio, `${hoy} 15:07:00`);
        assert.equal(datos.fecha_fin, `${hoy} 16:07:00`);
      });

      await ejecutar('admin: badges en una línea y sin compresión', async () => {
        await visitar(page, '/admin/ofertas', 'Ofertas');
        const m = await page.evaluate(() => {
          const flex = document.createElement('div');
          flex.style.cssText = 'display:flex;width:120px;gap:4px';
          const badge = document.createElement('span');
          badge.className = 'badge badge-amber';
          badge.textContent = 'Pendiente de revisión';
          const otro = document.createElement('span');
          otro.textContent = 'otro';
          otro.style.cssText = 'flex:1 1 auto;min-width:0';
          flex.append(badge, otro);
          document.body.append(flex);

          const card = document.createElement('div');
          card.className = 'content-card-badge';
          card.style.cssText = 'width:100px';
          const cardBadge = document.createElement('span');
          cardBadge.className = 'badge badge-green';
          cardBadge.textContent = 'Pendiente de aprobación y publicación extraordinaria';
          card.append(cardBadge);
          document.body.append(card);

          const rects = (el) => {
            const r = document.createRange();
            r.selectNodeContents(el);
            return r.getClientRects().length;
          };
          const natural = document.createElement('span');
          natural.className = 'badge badge-blue';
          natural.textContent = 'Pendiente de aprobación';
          document.body.append(natural);

          const br = badge.getBoundingClientRect();
          const cbr = cardBadge.getBoundingClientRect();
          const nr = natural.getBoundingClientRect();
          const salida = {
            flex: {
              width: br.width,
              whiteSpace: getComputedStyle(badge).whiteSpace,
              flexShrink: getComputedStyle(badge).flexShrink,
              rects: rects(badge),
            },
            natural: {
              width: nr.width,
              whiteSpace: getComputedStyle(natural).whiteSpace,
              rects: rects(natural),
            },
            card: {
              width: cbr.width,
              whiteSpace: getComputedStyle(cardBadge).whiteSpace,
              rects: rects(cardBadge),
            },
            colores: {
              amber: getComputedStyle(badge).backgroundColor,
              green: getComputedStyle(cardBadge).backgroundColor,
            },
          };
          flex.remove();
          natural.remove();
          card.remove();
          return salida;
        });

        assert.equal(m.flex.whiteSpace, 'nowrap');
        assert.equal(m.flex.flexShrink, '0');
        assert.equal(m.flex.rects, 1, 'el badge no debe partir el texto en varias líneas');
        assert.ok(m.flex.width > 120, 'el badge no debe comprimirse dentro del flex');
        assert.equal(m.natural.whiteSpace, 'nowrap');
        assert.equal(m.natural.rects, 1);
        assert.ok(m.natural.width > 120, 'el badge debe conservar su ancho natural');
        assert.equal(m.card.whiteSpace, 'normal');
        assert.ok(m.card.width <= 100, 'la tarjeta no debe desbordarse');
        assert.ok(m.card.rects > 1, 'las tarjetas deben conservar el ajuste de texto');
        assert.notEqual(m.colores.amber, m.colores.green, 'las variantes deben conservar colores distintos');
      });

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
    const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE', timezoneId: 'America/Lima' });
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
      await ejecutar('empresa: shell estable con scroll interno', async () => {
        await visitar(page, '/empresa/contrataciones', 'Contrataciones');
        await verificarShell(page, 'empresa');
      });

      await ejecutar('empresa: formulario de oferta abre y cierra', async () => {
        await visitar(page, '/empresa/ofertas', 'Ofertas laborales');
        await page.getByRole('button', { name: /Nueva oferta/ }).click();
        await page.getByRole('heading', { name: /Nueva oferta/ }).first().waitFor();
        await page.getByRole('button', { name: 'Cancelar' }).first().click();
      });

      await ejecutar('empresa: Selecto con scroll real y sin barra visible', async () => {
        await visitar(page, '/empresa/ofertas', 'Ofertas laborales');
        await page.getByRole('button', { name: /Nueva oferta/ }).click();
        const combo = page.getByRole('combobox').first();
        await combo.click();
        const panel = await esperarPanel(page);
        const medida = await medirScroll(panel);
        assertSinBarraVisible(medida, 'Selecto empresa');
        assert.ok(medida.scrollHeight > medida.clientHeight, 'el Selecto no tiene contenido desplazable');

        await panel.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
        await page.waitForFunction(() => document.querySelector('.dropdown-panel')?.scrollTop > 0);
        assert.ok((await medirScroll(panel)).scrollTop > 0, 'scrollTo no desplazó el panel');

        await panel.evaluate((el) => el.scrollTo({ top: 0 }));
        const caja = await panel.boundingBox();
        await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
        await page.mouse.wheel(0, 400);
        await page.waitForFunction(() => document.querySelector('.dropdown-panel')?.scrollTop > 0);
        assert.ok((await medirScroll(panel)).scrollTop > 0, 'la rueda no desplazó el panel');

        await panel.evaluate((el) => el.scrollTo({ top: 0 }));
        await combo.focus();
        await page.keyboard.press('End');
        await page.waitForFunction(() => document.querySelector('.dropdown-panel')?.scrollTop > 0);
        await page.keyboard.press('Escape');
      });

      await ejecutar('empresa: dashboard comparte el calendario de periodo', async () => {
        await visitar(page, '/empresa/dashboard', 'Panel de empresa');
        assert.equal(await page.locator('.fecha-hora-campo.date-field').count(), 2);
        const desde = page.locator('input.fecha-hora__input').first();
        await abrirCalendario(page, desde);
        await page.getByRole('button', { name: 'Hoy' }).click();
        assert.equal(await desde.inputValue(), fechaDMA(fechaHoyLima()));
      });

      await ejecutar('empresa: calendario de oferta usa el mismo panel', async () => {
        await visitar(page, '/empresa/ofertas', 'Ofertas laborales');
        await page.getByRole('button', { name: /Nueva oferta/ }).click();
        await page.getByRole('heading', { name: /Nueva oferta/ }).first().waitFor();
        const cierre = page.locator('input.fecha-hora__input').first();
        const panel = await abrirCalendario(page, cierre);
        assert.ok(await panel.evaluate((el) => el.closest('.content') === null), 'el calendario quedó recortado en el workspace');
        await page.getByRole('button', { name: 'Hoy' }).click();
        assert.equal(await cierre.inputValue(), fechaDMA(fechaHoyLima()));
      });

      if (process.env.E2E_WRITES === '1') {
        await ejecutar('empresa: edición de perfil persiste en MariaDB', async () => {
          paginaActiva = page;
          await visitar(page, '/empresa/perfil', 'Mi empresa');
          const campo = page.getByLabel('Nombre comercial');
          const original = await campo.inputValue();
          const nuevo = `${original} E2E`;

          const guardar = async (valor) => {
            await campo.fill(valor);
            const respuesta = page.waitForResponse(
              (r) => r.url().includes('/api/empresa/perfil') && r.request().method() === 'PUT',
              { timeout: 10000 },
            );
            await page.getByRole('button', { name: 'Guardar cambios' }).click();
            assert.equal((await respuesta).status(), 200);
          };

          try {
            await guardar(nuevo);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.getByLabel('Nombre comercial').waitFor();
            assert.equal(await page.getByLabel('Nombre comercial').inputValue(), nuevo);
          } finally {
            await guardar(original);
          }
        });
      } else {
        resultados.push({
          estado: 'NOT RUN',
          nombre: 'empresa: edición de perfil (requiere E2E_WRITES=1)',
        });
      }
    }

    await guardarErrores('empresa', errores);
    await contexto.close();
  }

  // Postulante
  {
    const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE', timezoneId: 'America/Lima' });
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


    await ejecutar('postulante: fecha de nacimiento usa el calendario global', async () => {
      await page.goto(`${BASE}/postulante/perfil`, { waitUntil: 'domcontentloaded' });
      const fecha = page.locator('input.fecha-hora__input').first();
      await fecha.waitFor({ state: 'visible' });
      const panel = await abrirCalendario(page, fecha);
      assert.ok(await panel.evaluate((el) => el.closest('.content') === null), 'el calendario quedó recortado');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.fecha-hora__calendario'));
    });

    await ejecutar('postulante: filtro con panel compartido', async () => {
      const esperaCategorias = page.waitForResponse(
        (respuesta) => respuesta.url().includes('/api/categorias') && respuesta.request().method() === 'GET',
      );
      await page.goto(`${BASE}/postulante/buscar`, { waitUntil: 'domcontentloaded' });
      const respuestaCategorias = await esperaCategorias.catch(() => null);
      assert.ok(respuestaCategorias, 'La vista no solicitó /api/categorias al cargar los filtros.');
      assert.equal(respuestaCategorias.status(), 200, `La vista recibió ${respuestaCategorias.status()} de /api/categorias.`);
      await verificarCatalogoCategorias(page);

      const pill = page.locator('.pill-btn').nth(1);
      await pill.waitFor({ state: 'visible' });
      await pill.click();
      const panel = await esperarPanel(page);
      const m = await page.evaluate(() => {
        const t = document.querySelectorAll('.pill-btn')[1].getBoundingClientRect();
        const p = document.querySelector('.dropdown-panel').getBoundingClientRect();
        return {
          centroTrigger: t.left + t.width / 2,
          centroPanel: p.left + p.width / 2,
          gap: p.top - t.bottom,
          rol: document.querySelector('.dropdown-panel')?.getAttribute('role'),
        };
      });
      assert.equal(m.rol, 'listbox');
      assert.ok(Math.abs(m.centroTrigger - m.centroPanel) <= 2, 'panel de filtro no centrado');
      assert.ok(m.gap >= 8 && m.gap <= 12, `separación de filtro inesperada: ${m.gap}`);

      const medida = await medirScroll(panel);
      assertSinBarraVisible(medida, 'FiltroPill');
      assert.ok(medida.scrollHeight > medida.clientHeight, 'el filtro no tiene contenido desplazable');
      await panel.evaluate((el) => el.scrollTo({ top: 120 }));
      await page.waitForFunction(() => document.querySelector('.dropdown-panel')?.scrollTop > 0);
      assert.ok((await medirScroll(panel)).scrollTop > 0, 'scrollTo no desplazó el filtro');

      const opcion = page.getByRole('option', { name: 'Construcción', exact: true });
      await opcion.waitFor({ state: 'visible' });
      await opcion.click();
      assert.match(await pill.innerText(), /Construcción/);

      const limpiar = pill.locator('.clear-btn');
      await limpiar.waitFor({ state: 'visible' });
      await limpiar.click();
      await page.waitForFunction(
        () => !document.querySelectorAll('.pill-btn')[1]?.innerText.includes('Construcción'),
      );
      assert.doesNotMatch(await pill.innerText(), /Construcción/);

      await pill.focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await pill.getAttribute('aria-expanded'), 'true');
      await esperarPanel(page);
      await page.keyboard.press('Escape');
      assert.equal(await pill.getAttribute('aria-expanded'), 'false');
      assert.ok((await page.evaluate(() => document.activeElement?.className || '')).includes('pill-btn'));
    });

    await ejecutar('postulante: menú de usuario conserva semántica de menú', async () => {
      await page.locator('.user-block').click();
      const panel = await esperarPanel(page, '.dropdown-panel--menu');
      const m = await panel.evaluate((p) => {
        const t = document.querySelector('.user-block').getBoundingClientRect();
        const r = p.getBoundingClientRect();
        return {
          rol: p.getAttribute('role'),
          rightTrigger: Math.round(t.right),
          rightPanel: Math.round(r.right),
          items: p.querySelectorAll('[role="menuitem"]').length,
        };
      });
      assert.equal(m.rol, 'menu');
      assert.equal(m.rightTrigger, m.rightPanel);
      assert.ok(m.items >= 4);
      assertSinBarraVisible(await medirScroll(panel), 'menú de usuario');
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'detached' });
    });

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
