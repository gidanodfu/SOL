// SPDX-License-Identifier: MIT

/**
 * Logo institucional único de SOL.
 *
 * La imagen maestra vive en `frontend/public/sol-logo.png` y se sirve desde el
 * mismo origen. El tamaño se controla por contexto mediante `className` o la
 * prop `size`; nunca se fijan dimensiones que deformen o recorten el escudo.
 */
const LOGO_SRC = '/sol-logo.png';

export const LOGO_MUNICIPAL_ALT = 'Escudo de la Municipalidad Distrital de José Leonardo Ortiz';

export default function LogoMunicipal({
  className = '',
  size,
  alt = LOGO_MUNICIPAL_ALT,
  decorative = false,
  style,
  ...props
}) {
  const dimensiones = size == null
    ? undefined
    : { width: typeof size === 'number' ? `${size}px` : size, height: 'auto' };

  return (
    <img
      src={LOGO_SRC}
      alt={decorative ? '' : alt}
      className={`logo-municipal${className ? ` ${className}` : ''}`}
      style={{ ...dimensiones, ...style }}
      {...props}
    />
  );
}
