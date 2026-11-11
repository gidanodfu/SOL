// SPDX-License-Identifier: MIT

import EmpresaDetalleModal from './EmpresaDetalleModal';

/**
 * Fachada pública del detalle de empresa para Buscar empleo y Mis
 * postulaciones. Solo declara los campos que el backend entrega al rol
 * postulante: nunca correo, teléfono, representante, usuario ni estado interno.
 */
export default function EmpresaModal({ empresa, onCerrar }) {
  const secciones = empresa
    ? [
        {
          titulo: 'Información de la empresa',
          items: [
            { etiqueta: 'RUC', valor: empresa.ruc },
            { etiqueta: 'Nombre comercial', valor: empresa.nombre_comercial },
            { etiqueta: 'Ubicación', valor: empresa.direccion },
            { etiqueta: 'Antigüedad en la plataforma', valor: empresa.antiguedad },
          ],
        },
      ]
    : [];

  return (
    <EmpresaDetalleModal
      empresa={empresa}
      abierto={Boolean(empresa)}
      alCerrar={onCerrar}
      secciones={secciones}
    />
  );
}
