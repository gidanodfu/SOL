// SPDX-License-Identifier: MIT
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { shift } from '@floating-ui/react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import 'react-datepicker/dist/react-datepicker.css';
import './FechaHora.css';
import { formatearFechaHora, limitesFechaHora, parseFechaHora } from './fechaHora.utils';

const MODIFICADORES = [shift({ padding: 12, crossAxis: true })];
const PLACEHOLDER = { fecha: 'dd/mm/aaaa', 'fecha-hora': 'dd/mm/aaaa hh:mm' };

function HoraUnica({ date, value = '00:00', onChange, disabled = false }) {
  return (
    <input
      type="time"
      step="60"
      className="fecha-hora__hora-input"
      value={value || '00:00'}
      disabled={disabled || !date}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Hora"
    />
  );
}

const tituloMes = (fecha) => {
  const texto = format(fecha, "MMMM 'de' yyyy", { locale: es });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

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
      formatWeekDay={(nombre) => nombre.charAt(0).toUpperCase() + nombre.slice(1, 2)}
      renderCustomHeader={({ monthDate, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled }) => (
        <div className="fecha-hora__cabecera">
          <span className="fecha-hora__mes">{tituloMes(monthDate)}</span>
          <div className="fecha-hora__navegacion">
            <button
              type="button"
              className="fecha-hora__nav"
              onClick={decreaseMonth}
              disabled={prevMonthButtonDisabled}
              aria-label="Mes anterior"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="fecha-hora__nav"
              onClick={increaseMonth}
              disabled={nextMonthButtonDisabled}
              aria-label="Mes siguiente"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
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
      customTimeInput={<HoraUnica disabled={disabled} />}
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
      popperPlacement="bottom"
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
      chooseDayAriaLabelPrefix="Elegir"
      disabledDayAriaLabelPrefix="No disponible"
    />
  );
}
