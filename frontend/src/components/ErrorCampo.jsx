// SPDX-License-Identifier: MIT

/**
 * Mensaje de error asociado a un campo del formulario. El control debe apuntar
 * a este id mediante `aria-describedby` para que el lector de pantalla lo anuncie.
 */
export default function ErrorCampo({ id, children }) {
  if (!children) return null;

  return (
    <p id={id} className="login-campo-mensaje" role="alert">
      {children}
    </p>
  );
}
