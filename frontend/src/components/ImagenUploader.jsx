// SPDX-License-Identifier: MIT
import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Mensaje, Tarjeta } from './UI';

const FORMATOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 2;

/**
 * Cargador de imágenes reutilizable (patrón visual del Design System). No acopla
 * la lógica de subida: el padre decide cómo subir/eliminar y el estado de carga.
 */
export default function ImagenUploader({
  titulo = 'Imagen',
  descripcion,
  url,
  onSubir,
  onEliminar,
  cargando = false,
  container = 'tarjeta',
}) {
  const inputRef = useRef(null);
  const [error, setError] = useState(null);

  const elegir = (e) => {
    const archivo = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!archivo) return;
    if (!FORMATOS.includes(archivo.type)) {
      setError('Formato no permitido. Usa JPG, PNG o WEBP.');
      return;
    }
    if (archivo.size > MAX_MB * 1024 * 1024) {
      setError(`La imagen supera el tamaño máximo de ${MAX_MB} MB.`);
      return;
    }
    setError(null);
    onSubir(archivo);
  };

  const cuerpo = (
    <>
      {descripcion && <p className="tarjeta-sub">{descripcion}</p>}
      <Mensaje>{error}</Mensaje>

      <div className="imagen-cargador">
        {url ? (
          <img className="imagen-preview" src={url} alt="Vista previa de la actividad" />
        ) : (
          <div className="imagen-vacia">
            <ImagePlus size={22} aria-hidden="true" />
            <span>Sin imagen</span>
          </div>
        )}

        <div className="imagen-acciones">
          <label className={`btn btn-gris${cargando ? ' deshabilitado' : ''}`} title={cargando ? 'Procesando…' : undefined}>
            {cargando ? (
              <><span className="spinner" aria-hidden="true" /> Procesando…</>
            ) : (
              <><ImagePlus size={16} aria-hidden="true" /> {url ? 'Reemplazar' : 'Subir imagen'}</>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={FORMATOS.join(',')}
              onChange={elegir}
              disabled={cargando}
              hidden
            />
          </label>

          {url && (
            <button type="button" className="btn btn-peligro" onClick={onEliminar} disabled={cargando}>
              <Trash2 size={16} aria-hidden="true" /> Eliminar
            </button>
          )}
        </div>
      </div>
    </>
  );

  // "plano" integra el uploader dentro de otro formulario/tarjeta (sin Tarjeta propia).
  if (container === 'plano') {
    return (
      <div className="form-seccion">
        {titulo && <span className="form-seccion-titulo">{titulo}</span>}
        {cuerpo}
      </div>
    );
  }

  return <Tarjeta titulo={titulo}>{cuerpo}</Tarjeta>;
}
