// SPDX-License-Identifier: MIT
import { CalendarDays } from 'lucide-react';

/**
 * ActivityImagePlaceholder — representación visual única para una actividad sin
 * imagen mostrable (src ausente/vacío, URL inválida o error de carga). No conoce
 * el rol: lo usan Admin, Postulante y cualquier vista que reutilice ActivityImage.
 *
 * Ocupa EXACTAMENTE el mismo frame que la imagen real (no cambia tamaño ni
 * layout). En 'thumb' (miniatura compacta) muestra solo el icono; en 'media'
 * añade el texto contextual.
 */
export default function ActivityImagePlaceholder({ variante = 'media', etiqueta = 'Actividad municipal' }) {
  if (variante === 'thumb') {
    return (
      <span className="activity-ph activity-ph--thumb" role="img" aria-label="Actividad municipal sin imagen">
        <CalendarDays size={22} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className="activity-ph" role="img" aria-label="Actividad municipal sin imagen">
      <span className="activity-ph-icon"><CalendarDays size={26} aria-hidden="true" /></span>
      <span className="activity-ph-text">{etiqueta}</span>
    </span>
  );
}
