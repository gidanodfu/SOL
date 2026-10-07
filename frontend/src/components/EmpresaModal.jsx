// SPDX-License-Identifier: MIT
import Modal from './Modal';
import FichaDatos from './FichaDatos';
import ProfileImage from './ProfileImage';
import { urlArchivo } from '../utils';

/**
 * Modal único de información de empresa (reutilizado en "Buscar empleo" y en
 * "Mis postulaciones"). Muestra solo información empresarial pública:
 * foto, nombre comercial, razón social, RUC, ubicación, contacto y antigüedad.
 * No navega a otra página.
 */
export default function EmpresaModal({ empresa, onCerrar }) {
  const telefono = empresa?.telefono ?? empresa?.empresa_telefono;
  const correo = empresa?.email ?? empresa?.empresa_email;

  return (
    <Modal
      abierto={Boolean(empresa)}
      titulo={empresa?.razon_social || 'Empresa'}
      subtitulo={empresa?.nombre_comercial || undefined}
      alCerrar={onCerrar}
      tamano="normal"
    >
      {empresa && (
        <>
          <div className="emp-modal-cabecera">
            <ProfileImage
              src={urlArchivo(empresa.logo_url)}
              alt={`Foto de ${empresa.razon_social}`}
              nombre={empresa.razon_social}
              variant="company"
              size={88}
            />
          </div>
          <FichaDatos
            items={[
              { etiqueta: 'Nombre comercial', valor: empresa.nombre_comercial },
              { etiqueta: 'Razón social', valor: empresa.razon_social },
              { etiqueta: 'RUC', valor: empresa.ruc },
              { etiqueta: 'Ubicación', valor: empresa.direccion },
              { etiqueta: 'Teléfono', valor: telefono },
              { etiqueta: 'Correo', valor: correo },
              { etiqueta: 'Antigüedad en la plataforma', valor: empresa.antiguedad },
            ]}
          />
          {empresa.info_adicional && (
            <div className="modal-seccion">
              <h3>Información adicional</h3>
              <p className="modal-texto">{empresa.info_adicional}</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
