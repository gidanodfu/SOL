// SPDX-License-Identifier: MIT

/**
 * Imagen de perfil/avatar compartida por Empresa y Postulante (una sola lógica
 * de render y placeholder). La fuente almacenada es 800x800 normalizada, por lo
 * que el recorte cuadrado ya viene garantizado; aquí solo se escala.
 *
 * Props:
 * - src: URL ya resuelta (usar urlArchivo para rutas relativas de la API)
 * - alt / nombre: texto alternativo y base para la inicial del placeholder
 * - variant: 'company' (icono de edificio) | 'person' (inicial)
 * - size: lado en px
 */
export default function ProfileImage({ src, alt, nombre, variant = 'person', size = 44, className = '' }) {
  const inicial = (nombre || '').trim().charAt(0).toUpperCase() || '?';

  return (
    <span
      className={`profile-image profile-image-${variant}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {src ? (
        <img src={src} alt={alt || nombre || 'Foto de perfil'} loading="lazy" />
      ) : variant === 'company' ? (
        <i className="ti ti-building" aria-hidden="true" />
      ) : (
        <span className="profile-image-inicial" aria-hidden="true">{inicial}</span>
      )}
    </span>
  );
}
