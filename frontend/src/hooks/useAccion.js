// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { errorApi } from '../utils';

/**
 * Envuelve una llamada a la API para manejar estado de envío y errores mostrables.
 */
export function useAccion(ejecutor) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [campos, setCampos] = useState({});

  const ejecutar = async (...args) => {
    setEnviando(true);
    setError(null);
    setCampos({});
    try {
      const resultado = await ejecutor(...args);
      return resultado;
    } catch (e) {
      const delBackend = e?.response?.data?.campos;
      setCampos(delBackend && typeof delBackend === 'object' && !Array.isArray(delBackend) ? delBackend : {});
      setError(errorApi(e));
      throw e;
    } finally {
      setEnviando(false);
    }
  };

  return { ejecutar, enviando, error, setError, campos };
}
