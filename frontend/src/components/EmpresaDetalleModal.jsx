// SPDX-License-Identifier: MIT

import Modal from './Modal';
import { Mensaje } from './UI';
import EmpresaDetalleContenido from './EmpresaDetalleContenido';

/**
 * Modal empresarial reutilizable. Compone el Modal genérico y la presentación
 * común; las acciones, permisos y llamadas a la API permanecen en el
 * consumidor (administración o postulante).
 */
export default function EmpresaDetalleModal({
  empresa,
  abierto = Boolean(empresa),
  alCerrar,
  titulo,
  subtitulo,
  tamano = 'ancho',
  insignias = null,
  error = null,
  acciones = null,
  secciones = [],
  mostrarPresencia = true,
  mostrarInfoAdicional = true,
}) {
  const tituloFinal = titulo || empresa?.razon_social || 'Empresa';
  const subtituloFinal = subtitulo || null;

  return (
    <Modal
      abierto={abierto && Boolean(empresa)}
      titulo={tituloFinal}
      subtitulo={subtituloFinal || null}
      alCerrar={alCerrar}
      tamano={tamano}
      acciones={acciones}
    >
      {empresa && (
        <>
          <Mensaje>{error}</Mensaje>
          <EmpresaDetalleContenido
            empresa={empresa}
            secciones={secciones}
            insignias={insignias}
            mostrarPresencia={mostrarPresencia}
            mostrarInfoAdicional={mostrarInfoAdicional}
          />
        </>
      )}
    </Modal>
  );
}
