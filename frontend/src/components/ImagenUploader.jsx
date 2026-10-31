// SPDX-License-Identifier: MIT
import { useId, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Tarjeta } from './UI';
import ProfileImage from './ProfileImage';

const FORMATOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 2;

const dimensiones = (archivo) => new Promise((resolver) => {
  const url = URL.createObjectURL(archivo);
  const imagen = new Image();
  imagen.onload = () => {
    URL.revokeObjectURL(url);
    resolver({ ancho: imagen.naturalWidth, alto: imagen.naturalHeight });
  };
  imagen.onerror = () => {
    URL.revokeObjectURL(url);
    resolver(null);
  };
  imagen.src = url;
});

/**
 * Cargador de imágenes reutilizable (patrón visual del Design System). No acopla
 * la lógica de subida: el padre decide cómo subir/eliminar y el estado de carga.
 *
 * Variantes:
 * - `completa` (por defecto): previsualización amplia dentro de una `Tarjeta`
 *   (o `container="plano"` para incrustarlo en otro formulario).
 * - `compacta`: bloque reducido con el avatar compartido `ProfileImage` y los
 *   botones debajo; pensado para acompañar otros datos en la misma tarjeta.
 */
export default function ImagenUploader({
  titulo = 'Imagen',
  descripcion,
  url,
  onSubir,
  onEliminar,
  cargando = false,
  error = null,
  errorId = null,
  anchoMaximo = null,
  altoMaximo = null,
  container = 'tarjeta',
  variante = 'completa',
  variant = 'person',
  nombre,
  alt,
}) {
  const inputRef = useRef(null);
  const generado = useId();
  const mensajeId = errorId || `${generado}-imagen-error`;
  const [errorLocal, setErrorLocal] = useState(null);
  const errorMostrado = errorLocal || error;

  const elegir = async (e) => {
    const archivo = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!archivo) return;
    if (!FORMATOS.includes(archivo.type)) {
      setErrorLocal('Formato no permitido. Usa JPG, PNG o WEBP.');
      return;
    }
    if (archivo.size > MAX_MB * 1024 * 1024) {
      setErrorLocal(`La imagen supera el tamaño máximo de ${MAX_MB} MB.`);
      return;
    }

    const medidas = anchoMaximo && altoMaximo ? await dimensiones(archivo) : null;
    if (anchoMaximo && altoMaximo) {
      if (!medidas) {
        setErrorLocal('No se pudo leer la imagen. Selecciona otro archivo.');
        return;
      }
      if (medidas.ancho > anchoMaximo || medidas.alto > altoMaximo) {
        setErrorLocal(`La imagen supera la resolución máxima de ${anchoMaximo} × ${altoMaximo} px.`);
        return;
      }
    }

    setErrorLocal(null);
    onSubir(archivo);
  };

  // Botones de acción (Reemplazar/Subir + Eliminar), reutilizados por ambas variantes.
  const etiquetaArchivo = url ? 'Reemplazar' : (variante === 'compacta' ? 'Subir foto' : 'Subir imagen');
  const acciones = (
    <>
      <label className={`btn btn-gris${cargando ? ' deshabilitado' : ''}`} title={cargando ? 'Procesando…' : undefined}>
        {cargando ? (
          <><span className="spinner" aria-hidden="true" /> Procesando…</>
        ) : (
          <><ImagePlus size={16} aria-hidden="true" /> {etiquetaArchivo}</>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={FORMATOS.join(',')}
          onChange={elegir}
          disabled={cargando}
          aria-invalid={errorMostrado ? true : undefined}
          aria-describedby={errorMostrado ? mensajeId : undefined}
          hidden
        />
      </label>

      {url && (
        <button type="button" className="btn btn-peligro" onClick={onEliminar} disabled={cargando}>
          <Trash2 size={16} aria-hidden="true" /> Eliminar
        </button>
      )}
    </>
  );

  if (variante === 'compacta') {
    return (
      <div className={`imagen-compacta${errorMostrado ? ' imagen-campo-error' : ''}`}>
        <ProfileImage
          className="imagen-compacta-media"
          src={url}
          nombre={nombre}
          variant={variant}
          alt={alt || (nombre ? `Imagen de ${nombre}` : 'Imagen')}
          size={120}
        />
        {errorMostrado && <span id={mensajeId} className="campo-mensaje" role="alert">{errorMostrado}</span>}
        <div className="imagen-compacta-acciones">{acciones}</div>
      </div>
    );
  }

  const cuerpo = (
    <>
      {descripcion && <p className="tarjeta-sub">{descripcion}</p>}
      {errorMostrado && <span id={mensajeId} className="campo-mensaje" role="alert">{errorMostrado}</span>}

      <div className="imagen-cargador">
        {url ? (
          <img className="imagen-preview" src={url} alt="Vista previa de la actividad" />
        ) : (
          <div className="imagen-vacia">
            <ImagePlus size={22} aria-hidden="true" />
            <span>Sin imagen</span>
          </div>
        )}

        <div className="imagen-acciones">{acciones}</div>
      </div>
    </>
  );

  // "plano" integra el uploader dentro de otro formulario/tarjeta (sin Tarjeta propia).
  if (container === 'plano') {
    return (
      <div className={`form-seccion${errorMostrado ? ' imagen-campo-error' : ''}`}>
        {titulo && <span className="form-seccion-titulo">{titulo}</span>}
        {cuerpo}
      </div>
    );
  }

  return <Tarjeta titulo={titulo}>{cuerpo}</Tarjeta>;
}
