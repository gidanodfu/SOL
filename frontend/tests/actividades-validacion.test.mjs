// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('el formulario de actividades exige todos los campos de creación', () => {
  const pagina = leer('../src/pages/admin/Actividades.jsx');

  // Selectores sin valor preseleccionado.
  assert.match(pagina, /tipo: '', nombre: '',[\s\S]*?modalidad: ''/);
  assert.match(pagina, /<option value="">Seleccionar tipo<\/option>/);
  assert.match(pagina, /<option value="">Seleccionar modalidad<\/option>/);

  // Mensajes específicos por campo.
  for (const mensaje of [
    'Selecciona el tipo de actividad.',
    'El nombre de la actividad es obligatorio.',
    'Indica la fecha y hora de inicio.',
    'Indica la fecha y hora de finalización.',
    'Selecciona una modalidad.',
    'El lugar de realización es obligatorio.',
    'Indica quién organiza la actividad.',
    'Debes subir una imagen para la actividad.',
    'La descripción de la actividad es obligatoria.',
  ]) {
    assert.ok(pagina.includes(mensaje), `Falta el mensaje: ${mensaje}`);
  }

  assert.match(pagina, /textoEnriquecidoVacio\(form\.descripcion\)/);
  assert.match(pagina, /Date\.parse\(fin\) < Date\.parse\(inicio\)/);
  assert.match(pagina, /error=\{errores\.tipo\}/);
  assert.match(pagina, /error=\{errores\.nombre\}/);
  assert.match(pagina, /error=\{errores\.fecha_inicio\}/);
  assert.match(pagina, /error=\{errores\.fecha_fin\}/);
  assert.match(pagina, /error=\{errores\.modalidad\}/);
  assert.match(pagina, /error=\{errores\.lugar\}/);
  assert.match(pagina, /error=\{errores\.organizador\}/);
  assert.match(pagina, /error=\{errores\.descripcion\}/);
  assert.match(pagina, /error=\{errores\.imagen\}/);
  assert.match(pagina, /id="actividad-imagen"/);
  assert.match(pagina, /id="actividad-descripcion"/);
  assert.match(pagina, /Imagen de la actividad \*/);
  assert.match(pagina, /Descripción \*/);
  assert.match(pagina, /crearActividad\(datos, archivoImagen\)/);
  assert.match(pagina, /subirImagenActividad\(idActividad, archivoImagen\)/);
  assert.match(pagina, /actualizarActividad\(idActividad, datos\)/);
  assert.match(pagina, /ORDEN_CAMPOS\.find/);
  assert.match(pagina, /enfocarCampo\(primero\)/);
});

test('los controles compartidos exponen aria-invalid y aria-describedby', () => {
  const ui = leer('../src/components/UI.jsx');

  assert.match(ui, /aria-invalid=\{error \? true : undefined\}/);
  assert.match(ui, /aria-describedby=\{error \? errorId : props\['aria-describedby'\]\}/);
  assert.match(ui, /role="alert"/);
});

test('el cargador de imagen valida dimensiones y muestra el error del campo', () => {
  const uploader = leer('../src/components/ImagenUploader.jsx');
  const pagina = leer('../src/pages/admin/Actividades.jsx');

  assert.match(uploader, /anchoMaximo = null/);
  assert.match(uploader, /altoMaximo = null/);
  assert.match(uploader, /La imagen supera la resolución máxima de \$\{anchoMaximo\} × \$\{altoMaximo\} px\./);
  assert.match(uploader, /errorMostrado/);
  assert.match(uploader, /aria-describedby=\{errorMostrado \? mensajeId : undefined\}/);
  assert.match(pagina, /anchoMaximo=\{1920\}/);
  assert.match(pagina, /altoMaximo=\{1080\}/);
});

test('el editor enriquecido marca el contenido inválido para accesibilidad', () => {
  const editor = leer('../src/components/EditorTextoEnriquecido.jsx');

  assert.match(editor, /setAttribute\('aria-invalid', 'true'\)/);
  assert.match(editor, /setAttribute\('aria-describedby', errorId\)/);
  assert.match(editor, /id=\{errorId\}/);
});

test('el servicio envía la imagen en la misma operación de creación', () => {
  const servicio = leer('../src/services/divulgacion.js');

  assert.match(servicio, /form\.append\('imagen', archivo\)/);
  assert.match(servicio, /crearActividad = \(datos, archivo = null\)/);
  assert.match(servicio, /actualizarActividad = \(id, datos\)/);
  assert.doesNotMatch(servicio, /'Content-Type': 'multipart\/form-data'/);
});
