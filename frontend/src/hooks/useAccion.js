import { useState } from 'react';
import { errorApi } from '../utils';

/**
 * Envuelve una llamada a la API para manejar estado de envío y errores mostrables.
 */
export function useAccion(ejecutor) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const ejecutar = async (...args) => {
    setEnviando(true);
    setError(null);
    try {
      const resultado = await ejecutor(...args);
      return resultado;
    } catch (e) {
      setError(errorApi(e));
      throw e;
    } finally {
      setEnviando(false);
    }
  };

  return { ejecutar, enviando, error, setError };
}
