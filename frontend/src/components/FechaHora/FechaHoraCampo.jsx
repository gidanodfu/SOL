// SPDX-License-Identifier: MIT
import { useId } from 'react';
import FechaHoraCalendario from './FechaHoraCalendario';

/**
 * Campo global de fecha y fecha-hora. Mantiene la jerarquía visual de `Campo`
 * (etiqueta, control, ayuda y error) y entrega a `onChange` una cadena lista
 * para la API: `YYYY-MM-DD` o `YYYY-MM-DDTHH:mm`.
 */
export default function FechaHoraCampo({
  id,
  name,
  etiqueta,
  modo = 'fecha',
  value = '',
  onChange,
  error,
  ayuda,
  required = false,
  disabled = false,
  min,
  max,
  placeholder,
  clearable = true,
  className = '',
}) {
  const generado = useId();
  const campoId = id || `${generado}-fecha`;
  const etiquetaId = `${campoId}-label`;
  const ayudaId = `${campoId}-ayuda`;
  const errorId = `${campoId}-error`;
  const descritoPor = [ayuda ? ayudaId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <label
      className={`campo fecha-hora-campo${error ? ' campo-error' : ''}${className ? ` ${className}` : ''}`}
      htmlFor={campoId}
    >
      {etiqueta ? <span id={etiquetaId} className="fecha-hora__etiqueta">{etiqueta}</span> : null}
      <FechaHoraCalendario
        id={campoId}
        name={name}
        modo={modo}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        disabled={disabled}
        required={required}
        clearable={clearable}
        placeholder={placeholder}
        error={Boolean(error)}
        ariaLabelledBy={etiqueta ? etiquetaId : undefined}
        ariaDescribedBy={descritoPor}
      />
      {ayuda && <span id={ayudaId} className="campo-ayuda fecha-hora__ayuda">{ayuda}</span>}
      {error && <span id={errorId} className="campo-mensaje" role="alert">{error}</span>}
    </label>
  );
}
