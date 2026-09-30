// SPDX-License-Identifier: MIT
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import Modal from './Modal';

/**
 * Sistema global de feedbacks de UI (sin librerías nuevas):
 * - Toast: mensajes temporales no bloqueantes (success/error/warning/info).
 * - Diálogos: confirmaciones y entrada de datos con `Modal` y el design system.
 *
 * Los datos sensibles (contraseñas, enlaces de activación) nunca se envían a
 * Toast: se muestran en un Modal donde el usuario puede copiarlos.
 */
const FeedbacksContext = createContext(null);

const ICONOS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };

function nuevoId() {
  return Math.random().toString(36).slice(2, 9);
}

const normalizar = (opciones) => (typeof opciones === 'string' ? { mensaje: opciones } : opciones || {});

export function FeedbacksProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialogo, setDialogo] = useState(null);
  const resolverRef = useRef(null);

  const cerrarToast = useCallback((id) => {
    setToasts((previos) => previos.filter((t) => t.id !== id));
  }, []);

  const mostrar = useCallback((tipo, mensaje, duracion) => {
    if (!mensaje) return;
    const id = nuevoId();
    setToasts((previos) => [...previos, { id, tipo, mensaje }]);
    const ms = duracion ?? (tipo === 'error' ? 6500 : 4000);
    if (ms > 0) setTimeout(() => cerrarToast(id), ms);
    return id;
  }, [cerrarToast]);

  const toast = useMemo(() => ({
    success: (mensaje, duracion) => mostrar('success', mensaje, duracion),
    error: (mensaje, duracion) => mostrar('error', mensaje, duracion),
    warning: (mensaje, duracion) => mostrar('warning', mensaje, duracion),
    info: (mensaje, duracion) => mostrar('info', mensaje, duracion),
    cerrar: cerrarToast,
  }), [mostrar, cerrarToast]);

  const abrir = useCallback((config) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setDialogo({ id: nuevoId(), ...config });
  }), []);

  const resolver = useCallback((valor) => {
    resolverRef.current?.(valor);
    resolverRef.current = null;
    setDialogo(null);
  }, []);

  const confirmar = useCallback((opciones) => abrir({ tipo: 'confirm', ...normalizar(opciones) }), [abrir]);
  const pedirTexto = useCallback((opciones) => abrir({ tipo: 'prompt', ...normalizar(opciones) }), [abrir]);

  const valor = useMemo(
    () => ({ toast, confirmar, pedirTexto }),
    [toast, confirmar, pedirTexto],
  );

  return (
    <FeedbacksContext.Provider value={valor}>
      {children}
      <Toaster toasts={toasts} onCerrar={cerrarToast} />
      {dialogo && (
        <DialogoFeedback
          key={dialogo.id}
          dialogo={dialogo}
          onResolver={resolver}
        />
      )}
    </FeedbacksContext.Provider>
  );
}

function useFeedbacks() {
  const ctx = useContext(FeedbacksContext);
  if (!ctx) throw new Error('useToast/useDialogo deben usarse dentro de FeedbacksProvider.');
  return ctx;
}

export function useToast() {
  return useFeedbacks().toast;
}

export function useDialogo() {
  const { confirmar, pedirTexto } = useFeedbacks();
  return { confirmar, pedirTexto };
}

function Toaster({ toasts, onCerrar }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-region" role="region" aria-label="Notificaciones">
      {toasts.map((t) => {
        const Icono = ICONOS[t.tipo] || Info;
        return (
          <div
            key={t.id}
            className={`toast toast-${t.tipo}`}
            role={t.tipo === 'error' ? 'alert' : 'status'}
            aria-live={t.tipo === 'error' ? 'assertive' : 'polite'}
          >
            <Icono size={18} aria-hidden="true" className="toast-icono" />
            <span className="toast-texto">{t.mensaje}</span>
            <button type="button" className="toast-cerrar" onClick={() => onCerrar(t.id)} aria-label="Cerrar notificación">
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function DialogoFeedback({ dialogo, onResolver }) {
  const {
    tipo, titulo, mensaje, etiqueta = 'Valor', textoConfirmar = 'Confirmar',
    textoCancelar = 'Cancelar', variante = 'primario', valorInicial = '', min = 0,
    placeholder = '',
  } = dialogo;
  const [texto, setTexto] = useState(valorInicial);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const cancelar = () => onResolver(tipo === 'prompt' ? null : false);

  const aceptar = () => {
    if (tipo !== 'prompt') {
      onResolver(true);
      return;
    }
    if (texto === '') {
      setError('Ingresa un valor.');
      return;
    }
    if (min && texto.length < min) {
      setError(`Mínimo ${min} caracteres.`);
      return;
    }
    onResolver(texto);
  };

  return (
    <Modal
      abierto
      titulo={titulo || (tipo === 'prompt' ? 'Ingresar dato' : 'Confirmar acción')}
      alCerrar={cancelar}
      acciones={(
        <>
          <button type="button" className="btn btn-gris" onClick={cancelar}>{textoCancelar}</button>
          <button type="button" className={`btn btn-${variante}`} onClick={aceptar}>{textoConfirmar}</button>
        </>
      )}
    >
      {mensaje && <p className="modal-texto">{mensaje}</p>}
      {tipo === 'prompt' && (
        <label className="campo">
          <span>{etiqueta}</span>
          <input
            ref={inputRef}
            type={dialogo.secreto ? 'password' : 'text'}
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') aceptar(); }}
            placeholder={placeholder}
            autoComplete="off"
          />
        </label>
      )}
      {error && <p className="rte-mensaje excedido">{error}</p>}
    </Modal>
  );
}
