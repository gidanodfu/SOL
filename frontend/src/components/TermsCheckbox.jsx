// SPDX-License-Identifier: MIT
import { Check } from 'lucide-react';

/**
 * Casilla accesible de aceptación de Términos y Condiciones.
 *
 * Mantiene el input nativo (teclado, lector de pantalla y validación) y usa un
 * indicador visual con Lucide. El texto y el enlace se pasan como children para
 * que cada formulario conserve su redacción.
 */
export default function TermsCheckbox({
  id,
  checked,
  onChange,
  error,
  children,
}) {
  const errorId = `${id}-error`;

  return (
    <div className={`terms-field${error ? ' terms-field-error' : ''}`}>
      <div className="terms-row">
        <input
          id={id}
          className="terms-input"
          type="checkbox"
          checked={checked}
          onChange={onChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <label className="terms-label" htmlFor={id}>
          <span className={`terms-box${checked ? ' checked' : ''}`} aria-hidden="true">
            {checked && <Check size={14} strokeWidth={3} />}
          </span>
          <span className="terms-text">{children}</span>
        </label>
      </div>
      {error && (
        <p id={errorId} className="terms-error" role="alert">{error}</p>
      )}
    </div>
  );
}
