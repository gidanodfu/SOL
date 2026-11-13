// SPDX-License-Identifier: MIT
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useClickFuera } from '../../hooks/useClickFuera';
import { useDropdownPosition } from './useDropdownPosition';
import './Dropdown.css';

/**
 * Superficie flotante compartida. No impone semántica: el consumidor decide
 * listbox/menu y su contenido. Se monta en body para escapar de contenedores
 * con overflow y conserva los tokens del documento.
 */
export default function DropdownPanel({
  abierto,
  triggerRef,
  panelRef,
  onCerrar,
  align = 'center',
  gap = 10,
  width = 'content',
  minWidth = 0,
  maxHeight = 320,
  margin = 12,
  role,
  id,
  etiqueta,
  className = '',
  children,
}) {
  const refInterna = useRef(null);
  const ref = panelRef || refInterna;
  const posicion = useDropdownPosition({
    open: abierto,
    triggerRef,
    panelRef: ref,
    align,
    gap,
    width,
    minWidth,
    maxHeight,
    margin,
  });

  useClickFuera(triggerRef, abierto, onCerrar, [ref]);

  useEffect(() => {
    if (!abierto) return undefined;
    const alTeclear = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCerrar();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return createPortal(
    <div
      ref={ref}
      id={id}
      className={`dropdown-panel ${className}`.trim()}
      role={role}
      aria-label={etiqueta}
      data-placement={posicion?.placement || 'bottom'}
      style={{
        left: posicion?.left ?? 0,
        top: posicion?.top ?? 0,
        width: posicion?.width,
        maxHeight: posicion?.maxHeight,
        visibility: posicion ? 'visible' : 'hidden',
        '--dropdown-notch-left': `${posicion?.notchLeft ?? 24}px`,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
