// SPDX-License-Identifier: MIT
import { Link } from 'react-router-dom';
import LegalPage from './LegalPage';

export default function PoliticaPrivacidad() {
  return (
    <LegalPage documentKey="privacidad">
      <section>
        <h2>1. Responsable del tratamiento y ámbito de aplicación</h2>
        <p>
          La <strong>Municipalidad Distrital de José Leonardo Ortiz (MDJLO)</strong> es la
          entidad pública responsable de la administración del Sistema de Ofertas Laborales
          SOL, servicio de intermediación laboral operado funcionalmente por la Unidad
          Funcional del Empleo (UFE), conforme a la denominación utilizada en la
          documentación del sistema. La adscripción orgánica y la designación oficial de la
          unidad deben ser confirmadas por la Municipalidad antes de la publicación
          definitiva de este documento.
        </p>
        <p>
          Domicilio institucional verificado: Av. Sáenz Peña N.º 2151, Urbanización Latina,
          distrito de José Leonardo Ortiz, provincia de Chiclayo, departamento de Lambayeque,
          Perú. Correo institucional de mesa de partes:{' '}
          <a href="mailto:mesadepartes.jlo@munijlo.gob.pe">mesadepartes.jlo@munijlo.gob.pe</a>.
          Mesa de partes virtual:{' '}
          <a href="https://sisgedo3.munijlo.gob.pe/mpartes_virtual/" target="_blank" rel="noopener noreferrer">
            sisgedo3.munijlo.gob.pe/mpartes_virtual
          </a>.
        </p>
        <p>
          Esta política se aplica a postulantes, empresas que solicitan afiliación y usuarios
          autorizados de la Municipalidad que utilizan SOL. No regula necesariamente los
          tratamientos realizados por otros portales o servicios municipales.
        </p>
      </section>

      <section>
        <h2>2. Datos personales que trata SOL</h2>
        <p>De acuerdo con los formularios y el código actual del sistema, SOL puede tratar:</p>
        <ul>
          <li><strong>Postulantes:</strong> DNI u otro documento de identidad admitido, nombres, apellidos, correo electrónico, teléfono, fecha de nacimiento, dirección, distrito, ocupación, estudios, experiencia, fotografía y currículum vitae.</li>
          <li><strong>Credenciales y seguridad:</strong> identificador de acceso, contraseña almacenada únicamente como hash, proveedor de autenticación, estado de la cuenta, último acceso, tokens de sesión y registros técnicos de seguridad.</li>
          <li><strong>Empresas:</strong> RUC, razón social, nombre comercial, dirección, teléfono, correo, representante, información adicional, evaluación de afiliación, estado, logotipo y enlaces de presencia digital.</li>
          <li><strong>Ofertas y postulaciones:</strong> contenido de la oferta, requisitos, ubicación, remuneración, postulaciones, estados, historial de cambios, retiros, contrataciones y datos de contacto necesarios para la intermediación.</li>
          <li><strong>Solicitudes y activaciones:</strong> datos de la solicitud de afiliación, motivo de rechazo, resolución administrativa y evidencia de aceptación de los Términos y Condiciones.</li>
          <li><strong>Actividades y difusión:</strong> información y enlaces de ferias, talleres, capacitaciones y oportunidades externas.</li>
          <li><strong>Auditoría:</strong> usuario, acción, entidad afectada, detalle, fecha e IP cuando el sistema registra la operación.</li>
          <li><strong>Preferencias de interfaz:</strong> tema, modo, tipografía y opciones de accesibilidad asociadas a la cuenta.</li>
        </ul>
        <p>
          El currículum vitae puede contener información que el propio titular decida incluir.
          Se recomienda no incorporar datos sensibles innecesarios para la postulación. SOL no
          solicita datos de salud, biométricos o categorías especiales como requisito general
          del servicio.
        </p>
      </section>

      <section>
        <h2>3. Finalidades y bases jurídicas</h2>
        <p>Los datos se utilizan para:</p>
        <ul>
          <li>Crear, autenticar y administrar cuentas de postulantes, empresas y personal municipal.</li>
          <li>Gestionar solicitudes de afiliación, verificar el RUC y tramitar la activación de cuentas empresariales.</li>
          <li>Permitir la publicación, revisión municipal, aprobación, observación, rechazo y cierre de ofertas.</li>
          <li>Registrar postulaciones, poner al postulante en contacto con la empresa y realizar el seguimiento del proceso de selección y contratación.</li>
          <li>Gestionar el currículum vitae y permitir su consulta únicamente por el titular o por la empresa autorizada respecto de una postulación concreta.</li>
          <li>Enviar comunicaciones operativas relacionadas con el servicio, la activación de cuentas y el resultado de solicitudes.</li>
          <li>Prevenir fraudes, abusos, accesos indebidos y proteger la disponibilidad e integridad de la plataforma.</li>
          <li>Generar indicadores, reportes y estadísticas de gestión de la intermediación laboral.</li>
        </ul>
        <p>
          Según la finalidad concreta, el tratamiento puede sustentarse en el ejercicio de
          competencias públicas de la Municipalidad, en el cumplimiento de obligaciones
          legales, en la ejecución de la relación administrativa o de servicio, o en el
          consentimiento del titular cuando resulte exigible. La aceptación de los Términos y
          Condiciones no equivale a una autorización ilimitada para cualquier tratamiento de
          datos personales.
        </p>
        <p>
          Los datos obligatorios son los necesarios para crear la cuenta, tramitar la
          afiliación, postular o gestionar la oferta. Si no se proporcionan, la operación
          correspondiente puede no completarse. Los campos opcionales se identifican como
          tales en los formularios.
        </p>
      </section>

      <section>
        <h2>4. Destinatarios y proveedores</h2>
        <p>
          Los datos pueden ser tratados por las unidades municipales competentes y por
          personal autorizado. La empresa que recibe una postulación accede a los datos del
          postulante necesarios para evaluarla, incluido el CV, únicamente a través de las
          autorizaciones del sistema. El CV no se publica en la bolsa de empleo ni se entrega
          a empresas sin una postulación asociada.
        </p>
        <p>
          El sistema integra o puede integrar, según la configuración efectiva del entorno,
          los siguientes proveedores:
        </p>
        <ul>
          <li><strong>Google Identity Services:</strong> para el ingreso o registro de postulantes cuando el client ID está configurado.</li>
          <li><strong>Cloudflare Turnstile:</strong> para la verificación antiautomatización cuando está habilitado.</li>
          <li><strong>Supabase Storage u otro almacenamiento compatible con S3:</strong> para alojar CV, logotipos e imágenes cuando el driver de almacenamiento externo está activo.</li>
          <li><strong>Resend o servidor SMTP:</strong> para el envío de correos operativos y enlaces de activación.</li>
          <li><strong>Servicios de verificación SUNAT y RENIEC:</strong> para validar RUC o DNI cuando el flujo y la configuración lo permiten.</li>
          <li><strong>Infraestructura de alojamiento, base de datos, respaldo y monitoreo</strong> contratada o administrada por la Municipalidad.</li>
        </ul>
        <p>
          Algunos proveedores tecnológicos pueden procesar información fuera del Perú. La
          Municipalidad debe verificar la región de almacenamiento, los contratos de encargo
          de tratamiento y las garantías aplicables antes de declarar una transferencia
          internacional concreta. Este documento no afirma que un proveedor reciba datos si
          la integración no está activa.
        </p>
      </section>

      <section>
        <h2>5. Conservación de la información</h2>
        <p>
          Los datos se conservan mientras la cuenta o la solicitud se encuentren vigentes y
          durante el tiempo necesario para cumplir las finalidades descritas, atender
          requerimientos, preservar el historial de intermediación y cumplir obligaciones
          legales o de archivo público. El sistema conserva historiales y estados; la
          desactivación de una cuenta no implica necesariamente la eliminación inmediata de
          todos sus registros.
        </p>
        <p>
          Actualmente el proyecto no define plazos automáticos de conservación para todas las
          categorías. La Municipalidad debe aprobar una tabla de plazos y criterios de
          eliminación o archivo, considerando la normativa de protección de datos, las reglas
          de archivo público y las necesidades de defensa institucional.
        </p>
      </section>

      <section>
        <h2>6. Seguridad de la información</h2>
        <p>
          SOL aplica medidas como almacenamiento de contraseñas mediante hash, autenticación
          por tokens con renovación, verificación del rol y estado de la cuenta en cada
          solicitud, control de acceso por rol, límites de intentos, validación de archivos,
          almacenamiento privado del CV y entrega mediante autorizaciones o enlaces
          temporales. La Municipalidad debe mantener HTTPS, control de accesos, respaldos,
          registro de incidentes y revisión periódica de configuraciones.
        </p>
        <p>
          Ninguna medida técnica elimina por completo el riesgo. Si se produce un incidente
          que afecte datos personales, se activará el procedimiento institucional
          correspondiente y se evaluarán las comunicaciones exigidas por la normativa.
        </p>
      </section>

      <section>
        <h2>7. Derechos de los titulares</h2>
        <p>
          El titular puede ejercer los derechos de acceso, rectificación, cancelación y
          oposición (ARCO), así como revocar el consentimiento cuando sea la base jurídica
          aplicable. Para ello puede presentar una solicitud por la mesa de partes virtual o
          el correo institucional indicado, precisando el derecho que ejerce y acreditando su
          identidad cuando corresponda. La Municipalidad deberá derivar la solicitud a la
          unidad responsable de protección de datos personales.
        </p>
        <p>
          La atención se sujetará a los plazos y al procedimiento establecidos en la Ley
          N.º 29733, su Reglamento aprobado por Decreto Supremo N.º 016-2024-JUS y las
          disposiciones de la Autoridad Nacional de Protección de Datos Personales (ANPD).
          Si el titular no está conforme con la respuesta, puede acudir a los mecanismos
          previstos ante la ANPD. Información oficial:{' '}
          <a href="https://www.gob.pe/9270-que-son-los-derechos-arco" target="_blank" rel="noopener noreferrer">
            Derechos ARCO — ANPD
          </a>.
        </p>
        <p>
          La cancelación o desactivación de una cuenta no impide conservar información cuando
          exista una obligación legal, un deber de archivo o una necesidad legítima de
          defensa. El titular también puede solicitar la actualización de sus datos desde su
          perfil cuando la funcionalidad lo permita.
        </p>
      </section>

      <section>
        <h2>8. Cookies y almacenamiento del navegador</h2>
        <p>
          El detalle de cookies, tokens en <code>localStorage</code> y servicios de terceros
          se encuentra en la{' '}
          <Link to="/politica-cookies">Política de Cookies</Link>. SOL no utiliza cookies
          propias de sesión para autenticar la API: la sesión se transporta mediante tokens
          JWT almacenados localmente por el frontend.
        </p>
      </section>

      <section>
        <h2>9. Inscripción de bancos de datos</h2>
        <p>
          No se ha verificado en el repositorio ni en las fuentes consultadas el estado de
          inscripción de los bancos de datos personales de SOL ante el Registro Nacional de
          Protección de Datos Personales. La Municipalidad debe confirmar la inscripción, la
          denominación registral y el código correspondiente antes de afirmar su cumplimiento.
          No se consigna en este documento un número de inscripción no verificado.
        </p>
      </section>

      <section>
        <h2>10. Actualización, contacto y normativa</h2>
        <p>
          Esta política puede actualizarse por cambios normativos, técnicos o de
          funcionamiento. La versión y la fecha de actualización se muestran al inicio del
          documento. Las consultas pueden dirigirse a la mesa de partes institucional.
        </p>
        <p>
          Marco principal: Ley N.º 29733, Ley de Protección de Datos Personales; Decreto
          Supremo N.º 016-2024-JUS, Reglamento de la Ley N.º 29733; disposiciones de la ANPD;
          y normativa peruana aplicable a la función pública y al servicio.
        </p>
        <p>Fuentes oficiales de consulta:</p>
        <ul>
          <li>
            <a href="https://www.gob.pe/institucion/congreso-de-la-republica/normas-legales/243470-29733" target="_blank" rel="noopener noreferrer">
              Ley N.º 29733 — Congreso de la República
            </a>
          </li>
          <li>
            <a href="https://www.gob.pe/institucion/anpd/normas-legales/6554453-n-016-2024-jus" target="_blank" rel="noopener noreferrer">
              Decreto Supremo N.º 016-2024-JUS — ANPD
            </a>
          </li>
          <li>
            <a href="https://www.gob.pe/9270-que-son-los-derechos-arco" target="_blank" rel="noopener noreferrer">
              Derechos ARCO — ANPD
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2>11. Limitación de validación institucional</h2>
        <p>
          La denominación oficial de la unidad responsable, el canal específico de protección
          de datos, los plazos internos de conservación y el estado registral de los bancos de
          datos requieren confirmación de la Municipalidad y revisión de la Asesoría Jurídica.
        </p>
      </section>
    </LegalPage>
  );
}
