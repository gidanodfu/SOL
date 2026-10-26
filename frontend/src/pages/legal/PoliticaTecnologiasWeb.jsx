// SPDX-License-Identifier: MIT
// Nombre neutral: evita el falso positivo /politicacookies.js de EasyList Cookie
// List que usa Brave Shields. La ruta pública sigue siendo /politica-cookies.
import { Link } from 'react-router-dom';
import LegalPage from './LegalPage';

export default function PoliticaTecnologiasWeb() {
  return (
    <LegalPage documentKey="cookies">
      <section>
        <h2>1. Alcance y verificación</h2>
        <p>
          Esta política describe los mecanismos de almacenamiento que utiliza SOL en el
          navegador del usuario. Se basa en la revisión del código del frontend, la
          configuración de autenticación y las integraciones cargadas por el portal a la
          fecha de actualización. No se realizó una captura instrumental de cookies en un
          navegador real; por ello, este documento distingue entre lo verificado en el código
          y lo que depende de servicios externos.
        </p>
        <p>
          SOL no utiliza cookies propias de sesión para autenticar la API. La sesión se
          implementa con tokens JWT enviados en la cabecera <code>Authorization</code> y
          almacenados por el frontend en <code>localStorage</code>.
        </p>
      </section>

      <section>
        <h2>2. Diferencia entre cookies y almacenamiento web</h2>
        <p>
          Las cookies son pequeños archivos que el navegador envía con las solicitudes al
          dominio que las creó. <code>localStorage</code> y <code>sessionStorage</code> son
          almacenes del navegador que no se envían automáticamente al servidor; el código de
          la aplicación debe leerlos y utilizarlos. Bloquear cookies y borrar el
          almacenamiento local pueden tener efectos distintos. En la revisión actual no se
          identificó uso de <code>sessionStorage</code> por parte de SOL.
        </p>
      </section>

      <section>
        <h2>3. Almacenamiento propio utilizado por SOL</h2>
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre / identificador</th>
                <th>Tipo</th>
                <th>Finalidad</th>
                <th>Duración / criterio</th>
                <th>Categoría</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>empleo_access_token</code></td>
                <td><code>localStorage</code></td>
                <td>Token de acceso JWT para autenticar las solicitudes a la API.</td>
                <td>Hasta el cierre de sesión o la expiración configurada del token; por defecto 120 minutos.</td>
                <td>Estrictamente necesaria para una sesión autenticada.</td>
              </tr>
              <tr>
                <td><code>empleo_refresh_token</code></td>
                <td><code>localStorage</code></td>
                <td>Renovar la sesión sin solicitar nuevamente la contraseña.</td>
                <td>Hasta el cierre de sesión o la expiración configurada; por defecto 15 días.</td>
                <td>Estrictamente necesaria para conservar la sesión.</td>
              </tr>
              <tr>
                <td><code>sol-sidebar-colapsado</code></td>
                <td><code>localStorage</code></td>
                <td>Recordar si el menú lateral de los paneles está contraído.</td>
                <td>Persiste hasta que el usuario borre los datos del sitio o cambie la preferencia.</td>
                <td>Preferencia funcional, no publicitaria.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Los tokens se eliminan al cerrar sesión en el flujo normal. Si el usuario borra el
          almacenamiento del navegador, deberá iniciar sesión nuevamente. El bloqueo de
          <code>localStorage</code> puede impedir el funcionamiento de la sesión autenticada.
        </p>
      </section>

      <section>
        <h2>4. Cookies y almacenamiento de terceros</h2>
        <p>
          Los siguientes servicios pueden cargar recursos, cookies o almacenamiento propio en
          sus respectivos dominios cuando están habilitados. Su funcionamiento exacto y sus
          plazos son determinados por cada proveedor y no se pueden confirmar únicamente desde
          este repositorio:
        </p>
        <ul>
          <li>
            <strong>Google Identity Services</strong> (<code>accounts.google.com</code>):
            botón de ingreso o registro con Google, solo si el client ID está configurado.
            Puede utilizar cookies y almacenamiento para gestionar la autenticación y la
            sesión de Google. Véase la política de privacidad de Google.
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong> (<code>challenges.cloudflare.com</code>):
            verificación antiautomatización cuando el sitio y el backend lo habilitan. Puede
            utilizar cookies o almacenamiento técnico para distinguir solicitudes legítimas.
            Véase la política de Cloudflare.
          </li>
          <li>
            <strong>Google Fonts</strong> (<code>fonts.googleapis.com</code> y
            <code>fonts.gstatic.com</code>): carga de la tipografía Inter. El navegador
            solicita recursos a Google y puede almacenar en caché la fuente. No se utiliza
            para publicidad ni analítica en SOL.
          </li>
          <li>
            <strong>Recursos propios del sitio:</strong> el escudo municipal se sirve desde el
            mismo dominio de SOL (`/sol-logo.png`); no se realizan solicitudes a terceros para
            cargar el logo.
          </li>
          <li>
            <strong>Supabase Storage:</strong> cuando el CV se descarga mediante una URL
            firmada, el navegador puede conectarse directamente al dominio de almacenamiento.
            Esa conexión puede exponer datos técnicos al proveedor; el archivo no se publica.
          </li>
        </ul>
        <p>
          No se identificaron en el código scripts de analítica, publicidad, píxeles de
          seguimiento ni herramientas equivalentes. Si en el futuro se incorporan, deberán
          documentarse y, cuando corresponda, activarse solo después del consentimiento
          previo.
        </p>
      </section>

      <section>
        <h2>5. Consentimiento y tecnologías no esenciales</h2>
        <p>
          A la fecha de esta versión no se ha identificado un tratamiento de seguimiento
          opcional que requiera un banner de consentimiento. Los tokens de sesión y la
          preferencia del menú son funcionales. Los servicios externos indicados se activan
          solo cuando el usuario utiliza la función correspondiente o cuando el portal está
          configurado para cargarlos.
        </p>
        <p>
          Si se añaden analítica, publicidad o tecnologías no esenciales, SOL deberá
          implementar un mecanismo de consentimiento separado que impida su activación antes
          de la autorización y permita rechazarlas o retirar el consentimiento.
        </p>
      </section>

      <section>
        <h2>6. Cómo administrar las preferencias</h2>
        <p>
          El usuario puede eliminar o bloquear cookies y datos de sitio desde la configuración
          de su navegador. También puede borrar el almacenamiento local utilizado por SOL.
          Debe tenerse en cuenta que:
        </p>
        <ul>
          <li>Bloquear el almacenamiento local puede cerrar la sesión y afectar preferencias de interfaz.</li>
          <li>Bloquear scripts o cookies de terceros puede impedir el ingreso con Google o la verificación Turnstile.</li>
          <li>Borrar los datos del sitio no elimina la cuenta ni los registros almacenados en el servidor.</li>
        </ul>
      </section>

      <section>
        <h2>7. Actualizaciones y contacto</h2>
        <p>
          Esta política puede actualizarse cuando cambien las tecnologías utilizadas. La
          versión y la fecha se muestran al inicio. Para consultas sobre privacidad puede
          revisarse la <Link to="/politica-privacidad">Política de Privacidad</Link> o
          utilizarse la mesa de partes institucional de la MDJLO.
        </p>
      </section>
    </LegalPage>
  );
}
