// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enlacesEnTexto, esEnlaceSeguro } from '../src/utils/enlacesTexto.js';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('la creación de oportunidades exige datos básicos y programación completa', () => {
  const pagina = leer('../src/pages/admin/Oportunidades.jsx');

  assert.match(pagina, /fecha_inicio: '', fecha_fin: '', modalidad: ''/);
  assert.match(pagina, /<option value="">Seleccionar fuente<\/option>/);
  assert.match(pagina, /<option value="">Seleccionar modalidad<\/option>/);
  assert.match(pagina, /MODALIDADES_ACTIVIDAD\.map/);
  assert.match(pagina, /type="datetime-local"/);

  for (const mensaje of [
    'Selecciona una fuente válida.',
    'El título de la oportunidad es obligatorio.',
    'Introduce una URL válida.',
    'Indica la fecha y hora de inicio.',
    'Indica una fecha y hora de inicio válidas.',
    'Indica la fecha y hora de finalización.',
    'Indica una fecha y hora de finalización válidas.',
    'La fecha de finalización no puede ser anterior a la fecha de inicio.',
    'Selecciona una modalidad.',
    'La descripción de la oportunidad es obligatoria.',
  ]) {
    assert.ok(pagina.includes(mensaje), `Falta el mensaje: ${mensaje}`);
  }

  assert.match(pagina, /error=\{errores\.fuente\}/);
  assert.match(pagina, /error=\{errores\.titulo\}/);
  assert.match(pagina, /error=\{errores\.enlace\}/);
  assert.match(pagina, /error=\{errores\.fecha_inicio\}/);
  assert.match(pagina, /error=\{errores\.fecha_fin\}/);
  assert.match(pagina, /error=\{errores\.modalidad\}/);
  assert.match(pagina, /error=\{errores\.descripcion\}/);

  assert.match(pagina, /<EditorTextoEnriquecido/);
  assert.match(pagina, /excedeLimiteTexto\(form\.descripcion\)/);
  assert.match(pagina, /id="oportunidad-descripcion"/);
  assert.match(pagina, /errorId="oportunidad-descripcion-error"/);
  assert.match(pagina, /<ContenidoEnriquecido>\{oportunidad\.descripcion\}<\/ContenidoEnriquecido>/);
  assert.doesNotMatch(pagina, /fecha_publicacion|Fecha de publicación|Empresa/);
  assert.doesNotMatch(pagina, /<textarea/);
});

test('la validación enfoca el primer error y conserva los datos', () => {
  const pagina = leer('../src/pages/admin/Oportunidades.jsx');

  assert.match(pagina, /const encontrados = validar\(\)/);
  assert.match(pagina, /if \(Object\.keys\(encontrados\)\.length > 0\)/);
  assert.match(pagina, /ORDEN_CAMPOS\.find/);
  assert.match(pagina, /enfocarCampo\(primero\)/);
  assert.match(pagina, /querySelector\('\[contenteditable="true"\]'\)\?\.focus\(\)/);
  assert.match(pagina, /return;/);
  assert.match(pagina, /await crearOportunidad\(datos\)/);
  assert.match(pagina, /await actualizarOportunidad\(inicial\.id, datos\)/);
  assert.match(pagina, /setForm\(\(previo\) => \(\{ \.\.\.previo, \[k\]: valor \}\)\)/);
  assert.match(pagina, /e\?\.response\?\.data\?\.campos/);
  assert.match(pagina, /setErrores\(campos\)/);
});

test('datetime-local se convierte de ida y vuelta sin cambiar la hora', () => {
  const pagina = leer('../src/pages/admin/Oportunidades.jsx');

  assert.match(pagina, /const aLocal = \(valor\) => \(valor \? String\(valor\)\.slice\(0, 16\)\.replace\(' ', 'T'\) : ''\)/);
  assert.match(pagina, /const aServidor = \(valor\) =>/);
  assert.match(pagina, /\\d\{4\}-\\d\{2\}-\\d\{2\} \\d\{2\}:\\d\{2\}/);
  assert.match(pagina, /return `\$\{texto\}:00`/);
  assert.match(pagina, /fecha_inicio: aLocal\(inicial\.fecha_inicio\)/);
  assert.match(pagina, /fecha_fin: aLocal\(inicial\.fecha_fin\)/);
  assert.match(pagina, /fecha_inicio: aServidor\(form\.fecha_inicio\)/);
  assert.match(pagina, /fecha_fin: aServidor\(form\.fecha_fin\)/);
  assert.doesNotMatch(pagina, /toISOString|toUTCString/);
});

test('la lista conserva finalizadas, filtra por estado y separa publicación de ciclo de vida', () => {
  const pagina = leer('../src/pages/admin/Oportunidades.jsx');

  assert.match(pagina, /const \[filtros, setFiltros\] = useState\(\{ fuente: '', estado: '' \}\)/);
  assert.match(pagina, /<option value="">Todos los estados<\/option>/);
  assert.match(pagina, /ESTADOS_ACTIVIDAD\.map/);
  assert.match(pagina, /<BadgesOportunidad oportunidad=\{o\}/);
  assert.match(pagina, /estado_efectivo \|\| oportunidad\.estado/);
  assert.match(pagina, /estado_publicacion/);
  assert.match(pagina, /no_visible: \['badge-gray', 'No visible'\]/);
  assert.match(pagina, /incompleta: \['badge-amber', 'No publicable'\]/);
  assert.match(pagina, /<ContenidoEnriquecido className="contenido-resumen">/);
});

test('el detalle finalizado oculta acciones y muestra el motivo y el aviso', () => {
  const pagina = leer('../src/pages/admin/Oportunidades.jsx');

  assert.match(pagina, /const finalizada = estadoEfectivo === 'finalizado'/);
  assert.match(pagina, /const bloqueada = oportunidad\.puede_modificarse === false \|\| finalizada/);
  assert.match(pagina, /acciones=\{puedeGestionar && !bloqueada \?/);
  assert.match(pagina, /Esta oportunidad ha finalizado y ya no puede modificarse\./);
  assert.match(pagina, /Finalizada manualmente\./);
  assert.match(pagina, /Finalizada por fecha de fin\./);
  assert.match(pagina, /alEditar=\{\(o\) => \{/);
  assert.match(pagina, /o\.puede_modificarse === false \|\| \(o\.estado_efectivo \|\| o\.estado\) === 'finalizado'/);
  assert.match(pagina, /Oportunidad finalizada/);
  assert.match(pagina, /if \(bloqueada\) \{/);
  assert.match(pagina, /etiqueta: 'Inicio'/);
  assert.match(pagina, /etiqueta: 'Fin'/);
  assert.match(pagina, /etiqueta: 'Modalidad'/);
  assert.match(pagina, /etiqueta: 'Enlace'/);
});

test('el portal público filtra finalizadas y usa estado, fechas y descripción enriquecida', () => {
  const pagina = leer('../src/pages/postulante/Oportunidades.jsx');

  assert.match(pagina, /filter\(\(o\) => o\.es_visible_publicamente !== false\)/);
  assert.match(pagina, /filter\(\(o\) => !\['finalizado', 'cancelado'\]\.includes\(o\.estado_efectivo \|\| o\.estado\)\)/);
  assert.match(pagina, /ESTADO_ACTIVIDAD/);
  assert.match(pagina, /fechaHoraLima\(o\.fecha_inicio\)/);
  assert.match(pagina, /fechaHoraLima\(o\.fecha_fin\)/);
  assert.match(pagina, /Modalidad: \$\{ETIQUETA_MODALIDAD/);
  assert.match(pagina, /<ContenidoEnriquecido className="content-card-rico">\{descripcionHtml\}<\/ContenidoEnriquecido>/);
  assert.match(pagina, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(pagina, /fecha_publicacion|razon_social|Difundida el/);
});

test('las URLs de texto se detectan sin protocolos peligrosos', () => {
  assert.equal(esEnlaceSeguro('https://example.com'), true);
  assert.equal(esEnlaceSeguro('http://example.com'), true);
  assert.equal(esEnlaceSeguro('javascript:alert(1)'), false);
  assert.equal(esEnlaceSeguro('data:text/html;base64,abc'), false);
  assert.equal(esEnlaceSeguro('file:///tmp/x'), false);

  const encontradas = enlacesEnTexto(
    'Ver https://example.com/a, luego https://example.com/b. y otra vez https://example.com/a',
  );
  assert.equal(encontradas.length, 3);
  assert.deepEqual(encontradas.map((e) => e.url), [
    'https://example.com/a',
    'https://example.com/b',
    'https://example.com/a',
  ]);

  assert.deepEqual(enlacesEnTexto('javascript:alert(1) data:text/html file:///tmp/x'), []);
  assert.deepEqual(
    enlacesEnTexto('(https://example.com/x).').map((e) => e.url),
    ['https://example.com/x'],
  );
});

test('el servicio expone el cambio de estado de oportunidad', () => {
  const servicio = leer('../src/services/divulgacion.js');

  assert.match(servicio, /cambiarEstadoOportunidad = \(id, estado\) => api\.put\(`\/admin\/oportunidades\/\$\{id\}\/estado`, \{ estado \}\)/);
});

test('las mutaciones administrativas invalidan la consulta pública', () => {
  const oportunidades = leer('../src/pages/admin/Oportunidades.jsx');
  const actividades = leer('../src/pages/admin/Actividades.jsx');

  assert.match(oportunidades, /queryKey: \['oportunidades-publicas'\]/);
  assert.match(actividades, /queryKey: \['actividades-publicas'\]/);
});
