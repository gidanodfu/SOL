// SPDX-License-Identifier: MIT
import { useState } from 'react';
import Modal from './Modal';
import ActivityImagePlaceholder from './ActivityImagePlaceholder';

/**
 * ActivityImage — primitive global para las imágenes de actividades (Admin y
 * Postulante). Muestra la imagen COMPLETA, sin recortar ni deformar
 * (`object-fit: contain`) dentro de un frame de proporción fija que reserva el
 * espacio (`aspect-ratio`), por lo que no hay saltos de layout.
 *
 * Props:
 * - src: URL ya resuelta (usar urlArchivo para rutas relativas de la API)
 * - alt: texto alternativo descriptivo
 * - variante: 'media' (frame 16/9, ancho completo) | 'thumb' (miniatura compacta)
 * - expandible: si es true, al pulsar abre un lightbox (Modal existente)
 * - className: clases extra opcionales
 *
 * Si no hay imagen o la carga falla, muestra un fallback (icono) y evita bucles
 * de error (el estado de error desactiva el `<img>`).
 */
export default function ActivityImage({ src, alt = '', variante = 'media', expandible = false, className = '' }) {
  const [error, setError] = useState(false);
  const [ampliada, setAmpliada] = useState(false);

  const hayImagen = Boolean(src) && !error;
  const clickable = expandible && hayImagen;
  const frameClase = [
    'activity-image',
    `activity-image--${variante}`,
    clickable ? 'is-clickable' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <>
      <div
        className={frameClase}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-label={clickable ? `Ampliar ${alt || 'imagen de la actividad'}` : undefined}
        onClick={clickable ? () => setAmpliada(true) : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAmpliada(true); } } : undefined}
      >
        {hayImagen ? (
          <img src={src} alt={alt || 'Imagen de la actividad'} loading="lazy" onError={() => setError(true)} />
        ) : (
          <ActivityImagePlaceholder variante={variante} />
        )}
      </div>

      {expandible && (
        <Modal
          abierto={ampliada}
          titulo={alt || 'Imagen de la actividad'}
          alCerrar={() => setAmpliada(false)}
          tamano="ancho"
        >
          {hayImagen && <img className="activity-image-full" src={src} alt={alt || 'Imagen de la actividad'} />}
        </Modal>
      )}
    </>
  );
}
