// SPDX-License-Identifier: MIT
import { Link } from 'react-router-dom';
import LegalPage from './LegalPage';

export default function TerminosCondiciones() {
  return (
    <LegalPage documentKey="terminos">
      <section>
        <h2>1. Identificación del servicio</h2>
        <p>
          SOL es el Sistema de Ofertas Laborales de la{' '}
          <strong>Municipalidad Distrital de José Leonardo Ortiz (MDJLO)</strong>, portal de
          intermediación laboral operado funcionalmente por la Unidad Funcional del Empleo
          (UFE). Su finalidad es facilitar el encuentro entre postulantes y empresas,
          registrar postulaciones, permitir la revisión municipal de ofertas y generar
          información de gestión sobre el empleo local.
        </p>
        <p>
          El servicio no es una agencia de colocación privada ni sustituye los procesos de
          selección de cada empresa. La Municipalidad no garantiza la contratación de ningún
          postulante.
        </p>
      </section>

      <section>
        <h2>2. Ámbito de aplicación y tipos de usuarios</h2>
        <p>Estos términos se aplican a:</p>
        <ul>
          <li><strong>Postulantes:</strong> personas que crean una cuenta para consultar ofertas, registrar su perfil y CV y postular.</li>
          <li><strong>Empresas:</strong> personas jurídicas o entidades que solicitan afiliación y publican ofertas, previa revisión municipal.</li>
          <li><strong>Personal municipal:</strong> usuarios autorizados para administrar cuentas, revisar ofertas, atender solicitudes y consultar reportes.</li>
          <li><strong>Visitantes:</strong> personas que consultan la bolsa pública sin iniciar sesión.</li>
        </ul>
      </section>

      <section>
        <h2>3. Registro y veracidad de la información</h2>
        <p>
          El usuario debe proporcionar información veraz, actual y completa, mantenerla
          actualizada y utilizar una cuenta propia. El registro de postulante se realiza con
          DNI y contraseña, o mediante Google cuando esté habilitado. La empresa se identifica
          con RUC y su solicitud queda sujeta a verificación y aprobación municipal.
        </p>
        <p>
          La creación de cuentas y el envío de solicitudes requieren la aceptación de estos
          Términos y Condiciones. La aceptación se registra con la versión vigente y la fecha
          generada por el servidor. La cuenta es personal y no debe compartirse.
        </p>
      </section>

      <section>
        <h2>4. Responsabilidades de los postulantes</h2>
        <p>
          El postulante es responsable de la exactitud de sus datos personales, de contacto,
          formación, experiencia y de su currículum vitae. Debe mantener actualizado su
          perfil y cargar un CV propio y legible. No debe suplantar a otra persona, publicar
          datos de terceros sin autorización ni incluir contenido ilícito, discriminatorio o
          engañoso.
        </p>
        <p>
          Para postular se exigen los datos de contacto y el CV que el sistema considere
          necesarios. La empresa destinataria podrá consultar el perfil y el CV respecto de
          las postulaciones recibidas, dentro de las autorizaciones del sistema.
        </p>
      </section>

      <section>
        <h2>5. Responsabilidades de las empresas</h2>
        <p>
          La empresa debe proporcionar datos correctos de RUC, razón social, representante y
          contacto, y actuar mediante una persona facultada. Es responsable de la veracidad,
          legalidad y actualidad de las ofertas que registra, de las condiciones laborales
          ofrecidas y del uso de la información de los postulantes exclusivamente para el
          proceso de selección correspondiente.
        </p>
        <p>
          La empresa no debe publicar ofertas discriminatorias, engañosas, ilegales ni
          duplicadas, ni usar los datos de los postulantes para fines distintos. La
          Municipalidad puede solicitar información adicional para verificar la afiliación o
          la oferta.
        </p>
      </section>

      <section>
        <h2>6. Revisión, aprobación y rechazo</h2>
        <p>
          Las solicitudes de afiliación y las ofertas están sujetas a revisión municipal.
          Toda oferta nueva queda en estado pendiente; la Municipalidad puede aprobarla y
          publicarla, observarla para corrección o rechazarla. La empresa puede corregir una
          oferta observada y reenviarla a revisión. Una oferta rechazada o cerrada no puede
          editarse ni publicarse en los términos que establece el sistema.
        </p>
        <p>
          La aprobación de una solicitud de empresa no implica la aprobación automática de
          todas sus ofertas futuras. La revisión municipal se orienta a verificar el
          cumplimiento de las reglas del servicio y no constituye una garantía sobre la
          solvencia, conducta o resultados de la empresa.
        </p>
      </section>

      <section>
        <h2>7. Uso aceptable y seguridad de la cuenta</h2>
        <p>
          Queda prohibido intentar acceder a cuentas ajenas, eludir controles de seguridad,
          automatizar masivamente el servicio sin autorización, introducir código malicioso,
          alterar la disponibilidad del portal, suplantar identidades o utilizar SOL para
          fraude, acoso, discriminación o cualquier actividad ilícita.
        </p>
        <p>
          El usuario debe proteger su contraseña, cerrar sesión en equipos compartidos y
          comunicar cualquier uso no autorizado por los canales institucionales. La
          Municipalidad puede aplicar medidas de seguridad, limitar intentos y suspender
          cuentas cuando exista un fundamento legítimo.
        </p>
      </section>

      <section>
        <h2>8. Postulaciones y acceso a la información</h2>
        <p>
          El postulante puede seguir el estado de sus postulaciones y retirarlas cuando la
          funcionalidad lo permita. La empresa accede únicamente a las postulaciones recibidas
          en sus propias ofertas y a la información necesaria para evaluarlas. El CV no se
          publica en la bolsa pública y no se entrega a empresas sin una postulación asociada.
        </p>
        <p>
          El tratamiento de datos personales se rige por la{' '}
          <Link to="/politica-privacidad">Política de Privacidad</Link>. La aceptación de
          estos términos no habilita usos distintos de los descritos en el servicio.
        </p>
      </section>

      <section>
        <h2>9. Alcances y límites de la intermediación</h2>
        <p>
          SOL acerca la información, pero la decisión de selección y contratación corresponde
          a la empresa. La Municipalidad no garantiza entrevistas, selección, contratación,
          permanencia ni condiciones laborales. La empresa es responsable de cumplir la
          normativa laboral, de seguridad y salud en el trabajo y de protección de datos.
        </p>
        <p>
          La Municipalidad no verifica necesariamente toda la información declarada por las
          empresas o postulantes. Los usuarios deben adoptar las precauciones razonables y
          comunicar inconsistencias o usos indebidos.
        </p>
      </section>

      <section>
        <h2>10. Disponibilidad, mantenimiento y actualizaciones</h2>
        <p>
          El servicio puede interrumpirse por mantenimiento, actualizaciones, fallas técnicas,
          incidencias de proveedores o causas de fuerza mayor. La Municipalidad procurará
          restablecer la disponibilidad en condiciones razonables, sin que ello elimine sus
          deberes legales ni los derechos de los usuarios.
        </p>
        <p>
          Algunas funciones dependen de Google, Cloudflare Turnstile, servicios de correo,
          almacenamiento externo, SUNAT o RENIEC. Una interrupción de esos servicios puede
          afectar el registro, la verificación o la activación de cuentas.
        </p>
      </section>

      <section>
        <h2>11. Suspensión o restricción de cuentas</h2>
        <p>
          La Municipalidad puede suspender, desactivar o restringir una cuenta cuando exista
          incumplimiento de estos términos, información falsa, uso fraudulento, riesgo para
          terceros o para la seguridad del sistema, o cuando sea necesario para cumplir una
          obligación legal. Cuando corresponda, se informará el canal para solicitar la
          revisión de la medida.
        </p>
      </section>

      <section>
        <h2>12. Propiedad intelectual y contenido</h2>
        <p>
          La identidad gráfica, el software, los textos institucionales y los elementos de
          SOL pertenecen a la Municipalidad o se utilizan con autorización. El usuario
          conserva la titularidad de sus datos y del contenido que proporciona, y autoriza su
          uso dentro de las finalidades del servicio. No se permite reproducir, modificar o
          distribuir el portal o sus elementos sin autorización, salvo los usos permitidos
          por ley.
        </p>
      </section>

      <section>
        <h2>13. Canales de contacto y atención</h2>
        <p>
          Consultas institucionales: mesa de partes virtual{' '}
          <a href="https://sisgedo3.munijlo.gob.pe/mpartes_virtual/" target="_blank" rel="noopener noreferrer">
            sisgedo3.munijlo.gob.pe/mpartes_virtual
          </a>{' '}
          y correo{' '}
          <a href="mailto:mesadepartes.jlo@munijlo.gob.pe">mesadepartes.jlo@munijlo.gob.pe</a>.
          Reclamos: libro de reclamaciones oficial de la MDJLO{' '}
          <a href="https://www.gob.pe/66853-municipalidad-distrital-de-jose-leonardo-ortiz-presentar-un-reclamo-ante-una-entidad-publica" target="_blank" rel="noopener noreferrer">
            Presentar un reclamo ante una entidad pública
          </a>.
        </p>
      </section>

      <section>
        <h2>14. Modificaciones y vigencia</h2>
        <p>
          Estos términos pueden actualizarse por cambios normativos, técnicos o del servicio.
          La versión y la fecha de actualización se muestran al inicio. Las modificaciones se
          comunicarán por los canales institucionales o dentro del portal, y la aceptación de
          una nueva versión podrá solicitarse cuando corresponda.
        </p>
      </section>

      <section>
        <h2>15. Normativa aplicable y reclamaciones</h2>
        <p>
          Estos términos se interpretan conforme a la legislación peruana, en particular la
          normativa de protección de datos personales, la Ley N.º 27444, Ley del Procedimiento
          Administrativo General, y las normas aplicables a la Municipalidad. Los derechos
          reconocidos por ley no quedan limitados por este documento.
        </p>
        <p>
          Para consultas sobre datos personales puede revisarse la{' '}
          <Link to="/politica-privacidad">Política de Privacidad</Link> y el{' '}
          <Link to="/aviso-legal">Aviso Legal</Link>. Para reclamaciones administrativas se
          utilizará el canal oficial del Libro de Reclamaciones de la MDJLO.
        </p>
      </section>
    </LegalPage>
  );
}
