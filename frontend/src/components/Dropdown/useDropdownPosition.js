// SPDX-License-Identifier: MIT
import { useLayoutEffect, useState } from 'react';

const clamp = (valor, minimo, maximo) => Math.max(minimo, Math.min(valor, maximo));

/**
 * Calcula la posición de un panel flotante respecto a su disparador.
 *
 * `align`: center (por defecto), start o end.
 * `width`: 'trigger' | 'content' | número.
 * `minWidth`: ancho mínimo en px.
 * `maxHeight`: altura máxima en px.
 *
 * Usa el viewport visual cuando existe (zoom/teclado móvil) y se recalcula
 * ante resize, scroll de cualquier contenedor y cambios de tamaño.
 */
export function useDropdownPosition({
  open,
  triggerRef,
  panelRef,
  align = 'center',
  gap = 10,
  width = 'content',
  minWidth = 0,
  maxHeight = 320,
  margin = 12,
}) {
  const [posicion, setPosicion] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosicion(null);
      return undefined;
    }

    let frame = null;

    const calcular = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;

      const vv = window.visualViewport;
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;
      const offsetLeft = vv?.offsetLeft ?? 0;
      const offsetTop = vv?.offsetTop ?? 0;
      const rect = trigger.getBoundingClientRect();

      const ancho = clamp(
        width === 'trigger' ? rect.width : width === 'content' ? panel.getBoundingClientRect().width : Number(width) || rect.width,
        Math.max(0, minWidth),
        Math.max(0, vw - margin * 2),
      );

      // Fijar el ancho antes de medir la altura: permite que el texto largo
      // haga wrap dentro del panel y que el cálculo vertical sea correcto.
      panel.style.width = `${Math.round(ancho)}px`;
      panel.style.maxHeight = `${maxHeight}px`;

      const espacioAbajo = Math.max(0, offsetTop + vh - rect.bottom - gap - margin);
      const espacioArriba = Math.max(0, rect.top - offsetTop - gap - margin);
      const altoPanel = panel.getBoundingClientRect().height;
      const abrirArriba = espacioAbajo < Math.min(altoPanel, maxHeight) && espacioArriba > espacioAbajo;
      const disponible = abrirArriba ? espacioArriba : espacioAbajo;
      const limite = Math.max(48, Math.min(maxHeight, disponible));

      panel.style.maxHeight = `${Math.round(limite)}px`;
      const alto = Math.min(panel.getBoundingClientRect().height, limite);

      const centro = rect.left + rect.width / 2;
      const izquierdaBase = align === 'start'
        ? rect.left
        : align === 'end'
          ? rect.right - ancho
          : centro - ancho / 2;
      const izquierda = clamp(izquierdaBase, offsetLeft + margin, offsetLeft + vw - ancho - margin);

      const top = abrirArriba
        ? rect.top - gap - alto
        : rect.bottom + gap;
      const topLimitado = clamp(top, offsetTop + margin, offsetTop + vh - alto - margin);

      const notchLeft = clamp(centro - izquierda, 14, Math.max(14, ancho - 14));

      setPosicion({
        left: Math.round(izquierda),
        top: Math.round(topLimitado),
        width: Math.round(ancho),
        maxHeight: Math.round(limite),
        notchLeft: Math.round(notchLeft),
        placement: abrirArriba ? 'top' : 'bottom',
      });
    };

    const programar = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        calcular();
      });
    };

    calcular();
    const vv = window.visualViewport;
    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(programar) : null;
    if (observador) {
      observador.observe(triggerRef.current);
      observador.observe(panelRef.current);
    }
    window.addEventListener('resize', programar);
    window.addEventListener('scroll', programar, true);
    vv?.addEventListener('resize', programar);
    vv?.addEventListener('scroll', programar);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observador?.disconnect();
      window.removeEventListener('resize', programar);
      window.removeEventListener('scroll', programar, true);
      vv?.removeEventListener('resize', programar);
      vv?.removeEventListener('scroll', programar);
    };
  }, [open, triggerRef, panelRef, align, gap, width, minWidth, maxHeight, margin]);

  return posicion;
}
