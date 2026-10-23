// SPDX-License-Identifier: MIT
import { Link } from 'react-router-dom';
import LegalPage from './LegalPage';

export default function AvisoLegal() {
  return (
    <LegalPage documentKey="aviso">
      <section>
        <h2>1. Titularidad y finalidad institucional</h2>
        <p>
          El Sistema de Ofertas Laborales SOL es un servicio público digital de la{' '}
          <strong>Municipalidad Distrital de José Leonardo Ortiz (MDJLO)</strong>, entidad
          pública local identificada en el Portal del Estado Peruano. Su finalidad es apoyar
          la intermediación laboral en el distrito mediante la publicación de ofertas, la
          recepción de postulaciones, la afiliación de empresas y la generación de información
          para la gestión municipal del empleo.
        </p>
        <p>
          La unidad funcional identificada en la documentación del sistema es la Unidad
          Funcional del Empleo (UFE). Su denominación y adscripción orgánica oficial deben ser
          confirmadas por la Municipalidad antes de la publicación definitiva de este aviso.
        </p>
      </section>

      <section>
        <h2>2. Identificación y contacto institucional</h2>
        <p>
          Sede institucional verificada: Av. Sáenz Peña N.º 2151, Urbanización Latina, distrito
          de José Leonardo Ortiz, provincia de Chiclayo, departamento de Lambayeque, Perú.
          Correo de mesa de partes:{' '}
          <a href="mailto:mesadepartes.jlo@munijlo.gob.pe">mesadepartes.jlo@munijlo.gob.pe</a>.
          Mesa de partes virtual:{' '}
          <a href="https://sisgedo3.munijlo.gob.pe/mpartes_virtual/" target="_blank" rel="noopener noreferrer">
            sisgedo3.munijlo.gob.pe/mpartes_virtual
          </a>.
        </p>
        <p>
          No se consigna en este documento un número de RUC, código de inscripción de banco de
          datos ni un correo específico de protección de datos que no haya podido verificarse
          en una fuente oficial.
        </p>
      </section>

      <section>
        <h2>3. Condiciones de acceso y utilización</h2>
        <p>
          El acceso a la información pública de la bolsa de empleo no requiere cuenta. El
          registro, la afiliación, la postulación y las funciones de administración requieren
          autenticación y están sujetos a los{' '}
          <Link to="/terminos-condiciones">Términos y Condiciones</Link>. El usuario debe
          utilizar el portal de buena fe, respetar la seguridad del sistema y no interferir
          con su funcionamiento.
        </p>
      </section>

      <section>
        <h2>4. Autoría, identidad gráfica y uso autorizado</h2>
        <p>
          Los contenidos institucionales, la identidad gráfica, el software y los elementos
          propios de SOL pertenecen a la Municipalidad o se utilizan con autorización. Se
          permite la consulta y el uso personal de la información publicada. No se autoriza
          su reproducción masiva, alteración, suplantación de identidad institucional ni uso
          comercial que pueda inducir a confusión.
        </p>
        <p>
          Las marcas, logotipos y contenidos de empresas u otros terceros pertenecen a sus
          respectivos titulares y se muestran en el marco de la información del servicio.
        </p>
      </section>

      <section>
        <h2>5. Publicaciones y contenidos de terceros</h2>
        <p>
          Las empresas son responsables de las ofertas, condiciones y manifestaciones que
          publican. Los postulantes son responsables de la información de sus perfiles y
          currículums. La Municipalidad revisa las ofertas conforme al procedimiento del
          sistema, pero no garantiza la veracidad absoluta de toda declaración de terceros ni
          la conclusión de un proceso de selección.
        </p>
        <p>
          La Municipalidad puede retirar, observar o rechazar contenidos cuando incumplan la
          normativa, estos avisos o las reglas del servicio, sin perjuicio de las
          responsabilidades legales que correspondan.
        </p>
      </section>

      <section>
        <h2>6. Enlaces a sitios externos</h2>
        <p>
          El portal puede incluir enlaces a sedes institucionales, servicios de verificación,
          redes sociales de empresas, oportunidades externas o plataformas de terceros. Esos
          sitios tienen sus propias políticas y condiciones. La Municipalidad no controla su
          disponibilidad ni el tratamiento de datos que realicen, por lo que se recomienda
          revisar sus políticas antes de utilizarlos.
        </p>
      </section>

      <section>
        <h2>7. Disponibilidad técnica e interrupciones</h2>
        <p>
          La Municipalidad procura mantener el servicio disponible, pero pueden producirse
          interrupciones por mantenimiento, actualizaciones, fallas de infraestructura o
          incidencias de proveedores. Estas circunstancias no eliminan los deberes legales de
          la entidad ni los derechos de los usuarios. La información crítica debe conservarse
          por los canales institucionales correspondientes.
        </p>
      </section>

      <section>
        <h2>8. Protección de datos y documentos relacionados</h2>
        <p>
          El tratamiento de datos personales se describe en la{' '}
          <Link to="/politica-privacidad">Política de Privacidad</Link>. El uso de cookies y
          almacenamiento del navegador se detalla en la{' '}
          <Link to="/politica-cookies">Política de Cookies</Link>. Las reglas de uso del
          servicio están en los{' '}
          <Link to="/terminos-condiciones">Términos y Condiciones</Link>.
        </p>
      </section>

      <section>
        <h2>9. Normativa y canales institucionales</h2>
        <p>
          Este aviso se interpreta conforme a la legislación peruana aplicable a la
          Municipalidad y al servicio. Para consultas o reclamos pueden utilizarse la mesa de
          partes virtual, el correo institucional y el Libro de Reclamaciones oficial de la
          MDJLO:{' '}
          <a href="https://www.gob.pe/66853-municipalidad-distrital-de-jose-leonardo-ortiz-presentar-un-reclamo-ante-una-entidad-publica" target="_blank" rel="noopener noreferrer">
            Presentar un reclamo ante una entidad pública
          </a>.
        </p>
      </section>
    </LegalPage>
  );
}
