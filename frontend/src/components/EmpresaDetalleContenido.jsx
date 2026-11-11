// SPDX-License-Identifier: MIT

import ProfileImage from './ProfileImage';
import FichaDatos from './FichaDatos';
import PresenciaDigital from './RedesSociales';
import { urlArchivo } from '../utils';

/** Un valor tiene contenido visible (admite nodos React). */
function tieneValor(valor) {
  if (valor === null || valor === undefined) return false;
  return typeof valor !== 'string' || valor.trim() !== '';
}

/**
 * Presentación visual común de la información empresarial. No contiene lógica
 * de negocio ni accede a la API: recibe la empresa y las secciones ya
 * autorizadas por cada consumidor.
 */
export default function EmpresaDetalleContenido({
  empresa,
  secciones = [],
  insignias = null,
  mostrarPresencia = true,
  mostrarInfoAdicional = true,
}) {
  if (!empresa) return null;

  const nombre = empresa.nombre_comercial || empresa.razon_social;
  const grupos = secciones
    .map((seccion) => ({
      ...seccion,
      items: (seccion.items || []).filter((item) => item && tieneValor(item.valor)),
    }))
    .filter((seccion) => seccion.items.length > 0);

  return (
    <div className="empresa-detalle">
      <div className="empresa-detalle-identidad">
        <ProfileImage
          src={urlArchivo(empresa.logo_url)}
          alt={`Foto de ${empresa.razon_social || 'la empresa'}`}
          nombre={empresa.razon_social}
          variant="company"
          size={72}
        />
        <div className="empresa-detalle-identidad-texto">
          <strong>{nombre}</strong>
          {tieneValor(empresa.ruc) && <span>RUC {empresa.ruc}</span>}
        </div>
        {insignias && <div className="empresa-detalle-insignias">{insignias}</div>}
      </div>

      {grupos.map((seccion) => (
        <section className="empresa-detalle-grupo" key={seccion.titulo}>
          <h3>{seccion.titulo}</h3>
          <FichaDatos items={seccion.items} />
        </section>
      ))}

      {mostrarPresencia && <PresenciaDigital datos={empresa} variante="detallada" />}

      {mostrarInfoAdicional && empresa.info_adicional && (
        <div className="modal-seccion">
          <h3>Información adicional</h3>
          <p className="modal-texto">{empresa.info_adicional}</p>
        </div>
      )}
    </div>
  );
}
