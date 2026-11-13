// SPDX-License-Identifier: MIT
import DatePicker from 'react-datepicker';
import { es } from 'date-fns/locale/es';
import { shift } from '@floating-ui/react';
import { CalendarDays } from 'lucide-react';
import 'react-datepicker/dist/react-datepicker.css';
import './FechaHora.css';
import { formatearFechaHora, limitesFechaHora, parseFechaHora } from './fechaHora.utils';

const MODIFICADORES = [shift({ padding: 12 })];
const PLACEHOLDER = { fecha: 'dd/mm/aaaa', 'fecha-hora': 'dd/mm/aaaa hh:mm' };

function HoraMinuto({ date, value = '00:00', onChange, disabled = false }) {
  const [hora = '00', minuto = '00'] = String(value || '00:00').split(':');
  const emitir = (nuevaHora, nuevoMinuto) => {
    const h = Math.min(23, Math.max(0, Number(nuevaHora) || 0));
    const m = Math.min(59, Math.max(0, Number(nuevoMinuto) || 0));
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  return (
    <div className="fecha-hora__hora">
      <label className="fecha-hora__hora-campo">
        <span>Hora</span>
        <input
          type="number"
          min="0"
          max="23"
          step="1"
          inputMode="numeric"
          value={hora}
          disabled={disabled || !date}
          onChange={(e) => emitir(e.target.value, minuto)}
          aria-label="Hora"
        />
      </label>
      <span className="fecha-hora__hora-separador" aria-hidden="true">:</span>
      <label className="fecha-hora__hora-campo">
        <span>Minutos</span>
        <input
          type="number"
          min="0"
          max="59"
          step="1"
          inputMode="numeric"
          value={minuto}
          disabled={disabled || !date}
          onChange={(e) => emitir(hora, e.target.value)}
          aria-label="Minutos"
        />
      </label>
    </div>
  );
}

/**
 * Adaptador de react-datepicker al contrato de fecha/hora de SOL. La librería
 * aporta el motor del calendario; SOL controla formatos, tokens, portal y la
 * cadena que recibe `onChange`.
 */
export default function FechaHoraCalendario({
  id,
  name,
  modo = 'fecha',
  value = '',
  onChange,
  min,
  max,
  disabled = false,
  required = false,
  clearable = true,
  placeholder,
  error = false,
  ariaLabelledBy,
  ariaDescribedBy,
}) {
  const esFechaHora = modo === 'fecha-hora';
  const { minDate, maxDate } = limitesFechaHora(min, max, modo);

  return (
    <DatePicker
      id={id}
      name={name}
      selected={parseFechaHora(value, modo)}
      onChange={(fecha) => onChange(formatearFechaHora(fecha, modo))}
      locale={es}
      dateFormat={esFechaHora ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy'}
      calendarStartDay={1}
      showYearDropdown
      showMonthDropdown
      scrollableYearDropdown
      yearDropdownItemNumber={16}
      todayButton={(
        <span
          className="fecha-hora__hoy"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.currentTarget.click();
            }
          }}
        >
          Hoy
        </span>
      )}
      showTimeInput={esFechaHora}
      shouldCloseOnSelect={!esFechaHora}
      timeFormat="HH:mm"
      timeInputLabel="Hora"
      customTimeInput={<HoraMinuto disabled={disabled} />}
      minDate={minDate}
      maxDate={maxDate}
      placeholderText={placeholder || PLACEHOLDER[modo]}
      disabled={disabled}
      required={required}
      isClearable={clearable && !disabled}
      clearButtonTitle="Limpiar fecha"
      ariaLabelClose="Limpiar fecha"
      showIcon
      icon={<CalendarDays size={16} aria-hidden="true" />}
      toggleCalendarOnIconClick
      portalId="sol-fecha-hora-portal"
      popperPlacement="bottom-start"
      popperModifiers={MODIFICADORES}
      popperClassName="fecha-hora__popper"
      calendarClassName="fecha-hora__calendario"
      wrapperClassName="fecha-hora__wrapper"
      className="fecha-hora__input"
      showPopperArrow={false}
      autoComplete="off"
      ariaLabelledBy={ariaLabelledBy}
      ariaDescribedBy={ariaDescribedBy}
      ariaInvalid={error ? 'true' : undefined}
      ariaRequired={required ? 'true' : undefined}
      previousMonthAriaLabel="Mes anterior"
      nextMonthAriaLabel="Mes siguiente"
      previousYearAriaLabel="Año anterior"
      nextYearAriaLabel="Año siguiente"
      monthAriaLabel="Mes"
      yearAriaLabel="Año"
      chooseDayAriaLabelPrefix="Elegir"
      disabledDayAriaLabelPrefix="No disponible"
    />
  );
}
