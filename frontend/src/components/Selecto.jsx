// SPDX-License-Identifier: MIT
import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import DropdownPanel from './Dropdown/DropdownPanel';
import './Selecto.css';

function textoNodo(nodo) {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return '';
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoNodo).join('');
  if (isValidElement(nodo)) return textoNodo(nodo.props.children);
  return '';
}

function extraerOpciones(children) {
  const opciones = [];

  const recorrer = (nodos) => {
    Children.forEach(nodos, (nodo) => {
      if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return;
      if (Array.isArray(nodo)) {
        recorrer(nodo);
        return;
      }
      if (isValidElement(nodo) && nodo.type === Fragment) {
        recorrer(nodo.props.children);
        return;
      }
      if (isValidElement(nodo) && nodo.type === 'option') {
        const etiqueta = textoNodo(nodo.props.children);
        const valor = nodo.props.value !== undefined ? nodo.props.value : etiqueta;
        opciones.push({
          valor: String(valor),
          etiqueta,
          disabled: Boolean(nodo.props.disabled),
        });
      }
    });
  };

  recorrer(children);

  return opciones;
}

/**
 * Selector de una sola opción con panel HTML personalizado. Mantiene la API
 * declarativa de `<option>` para no duplicar catálogos, pero entrega el valor
 * seleccionado directamente a `onChange`.
 */
export default function Selecto({
  etiqueta,
  error,
  id,
  children,
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
  ...props
}) {
  const generado = useId();
  const selectId = id || `${generado}-select`;
  const listId = `${selectId}-listbox`;
  const labelId = `${selectId}-label`;
  const errorId = `${selectId}-error`;
  const opciones = extraerOpciones(children);
  const valorActual = String(value ?? '');
  const indiceSeleccionado = opciones.findIndex((o) => o.valor === valorActual);
  const opcionSeleccionada = indiceSeleccionado >= 0 ? opciones[indiceSeleccionado] : null;
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const bufferRef = useRef('');
  const bufferTimerRef = useRef(null);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);

  const primerHabilitado = () => opciones.findIndex((o) => !o.disabled);
  const ultimoHabilitado = () => {
    for (let i = opciones.length - 1; i >= 0; i--) {
      if (!opciones[i].disabled) return i;
    }
    return -1;
  };

  const abrir = () => {
    if (disabled) return;
    const inicial = indiceSeleccionado >= 0 && !opciones[indiceSeleccionado]?.disabled
      ? indiceSeleccionado
      : primerHabilitado();
    setActivo(inicial);
    setAbierto(true);
  };

  const cerrar = ({ enfocar = true } = {}) => {
    setAbierto(false);
    setActivo(-1);
    if (enfocar) triggerRef.current?.focus();
  };

  const seleccionar = (indice) => {
    const opcion = opciones[indice];
    if (!opcion || opcion.disabled) return;
    onChange?.(opcion.valor);
    cerrar();
  };

  const mover = (paso) => {
    if (opciones.length === 0) return;
    let siguiente = activo;
    for (let i = 0; i < opciones.length; i++) {
      siguiente = (siguiente + paso + opciones.length) % opciones.length;
      if (!opciones[siguiente].disabled) {
        setActivo(siguiente);
        return;
      }
    }
  };

  const buscarPorLetra = (letra) => {
    clearTimeout(bufferTimerRef.current);
    bufferRef.current += letra.toLowerCase();
    bufferTimerRef.current = setTimeout(() => { bufferRef.current = ''; }, 500);
    const termino = bufferRef.current;
    const encontrada = opciones.findIndex((o) => !o.disabled && o.etiqueta.toLowerCase().startsWith(termino));
    if (encontrada >= 0) {
      if (abierto) setActivo(encontrada);
      else onChange?.(opciones[encontrada].valor);
    }
  };

  const alTeclear = (e) => {
    if (disabled) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierto) abrir();
      else mover(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      if (!abierto) return;
      e.preventDefault();
      setActivo(e.key === 'Home' ? primerHabilitado() : ultimoHabilitado());
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!abierto) abrir();
      else seleccionar(activo);
      return;
    }
    if (e.key === 'Escape' && abierto) {
      e.preventDefault();
      e.stopPropagation();
      cerrar();
      return;
    }
    if (e.key === 'Tab' && abierto) cerrar({ enfocar: false });
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) buscarPorLetra(e.key);
  };

  useEffect(() => {
    if (!abierto || activo < 0) return;
    const opcion = document.getElementById(`${selectId}-option-${activo}`);
    opcion?.scrollIntoView({ block: 'nearest' });
  }, [abierto, activo, selectId]);

  useEffect(() => () => clearTimeout(bufferTimerRef.current), []);

  const descritoPor = [error ? errorId : null, props['aria-describedby']].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`campo selecto${error ? ' campo-error' : ''}${className ? ` ${className}` : ''}`}>
      {etiqueta ? <span id={labelId}>{etiqueta}</span> : null}
      {props.name ? <input type="hidden" name={props.name} value={valorActual} /> : null}
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        className="selecto-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={listId}
        aria-activedescendant={abierto && activo >= 0 ? `${selectId}-option-${activo}` : undefined}
        aria-labelledby={etiqueta ? labelId : undefined}
        aria-label={!etiqueta ? (props['aria-label'] || 'Seleccionar opción') : undefined}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={descritoPor}
        disabled={disabled}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={alTeclear}
      >
        <span className="selecto-valor">{opcionSeleccionada?.etiqueta || ''}</span>
        <ChevronDown size={16} className="selecto-chevron" aria-hidden="true" />
      </button>
      <DropdownPanel
        abierto={abierto}
        triggerRef={triggerRef}
        panelRef={panelRef}
        onCerrar={() => cerrar({ enfocar: false })}
        role="listbox"
        id={listId}
        etiqueta={etiqueta || props['aria-label'] || 'Opciones'}
        width="trigger"
        minWidth={200}
      >
        {opciones.map((opcion, indice) => (
          <div
            key={`${opcion.valor}-${indice}`}
            id={`${selectId}-option-${indice}`}
            role="option"
            aria-selected={indice === indiceSeleccionado}
            aria-disabled={opcion.disabled || undefined}
            className="dropdown-panel__option"
            data-active={indice === activo ? 'true' : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => seleccionar(indice)}
          >
            <span>{opcion.etiqueta}</span>
            {indice === indiceSeleccionado ? <Check size={15} className="dropdown-panel__check" aria-hidden="true" /> : null}
          </div>
        ))}
      </DropdownPanel>
      {error && <span id={errorId} className="campo-mensaje" role="alert">{error}</span>}
    </div>
  );
}
