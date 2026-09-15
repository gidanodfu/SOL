import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cvActual, subirCv, urlCv } from '../services/postulante';
import { descargarUrl, fecha } from '../utils';
import { Mensaje, Tarjeta } from './UI';

const FORMATOS = '.pdf,.doc,.docx,application/pdf';
const MAX_MB = 5;

function formatoBytes(tamano) {
  if (!tamano && tamano !== 0) return '';
  if (tamano < 1024) return `${tamano} B`;
  if (tamano < 1024 * 1024) return `${(tamano / 1024).toFixed(1)} KB`;
  return `${(tamano / (1024 * 1024)).toFixed(2)} MB`;
}

function nombreExtension(nombre) {
  const partes = String(nombre || '').split('.');
  return partes.length > 1 ? partes.pop().toUpperCase() : '';
}

/**
 * Carga de Curriculum Vitae (postulante).
 * Usa los endpoints existentes: GET /postulante/cv, POST /postulante/cv
 * (multipart, campo "cv") y GET /postulante/cv/descargar.
 */
export default function CvUploader() {
  const inputRef = useRef(null);
  const queryClient = useQueryClient();
  const [elegido, setElegido] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [error, setError] = useState(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const { data: cv, isLoading } = useQuery({ queryKey: ['cv'], queryFn: cvActual });

  const vigente = cv?.vigente;
  const limite = cv?.limite_mensual;
  const agotado = limite?.restantes === 0;

  const validar = (archivo) => {
    if (!archivo) return 'Selecciona un archivo.';
    const extension = nombreExtension(archivo.name);
    const permitidos = ['PDF', 'DOC', 'DOCX'];
    if (!permitidos.includes(extension)) return 'Formato no permitido. Usa PDF, DOC o DOCX.';
    if (archivo.size > MAX_MB * 1024 * 1024) return `El archivo supera el tamaño máximo de ${MAX_MB} MB.`;
    return null;
  };

  const alElegir = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const invalido = validar(archivo);
    setElegido({ nombre: archivo.name, formato: nombreExtension(archivo.name), tamano: archivo.size, invalido });
    setMensaje(null);
    setError(null);
    if (invalido) return;
    try {
      setEnviando(true);
      await subirCv(archivo);
      setMensaje('CV cargado correctamente.');
      setElegido(null);
      queryClient.invalidateQueries({ queryKey: ['cv'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-postulante'] });
      queryClient.invalidateQueries({ queryKey: ['perfil-postulante'] });
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      const det = err?.response?.data?.errors;
      setError(Array.isArray(det) && det.length ? det.join('. ') : (err?.response?.data?.message || 'No se pudo subir el CV. Intente nuevamente.'));
      setElegido(null);
    } finally {
      setEnviando(false);
    }
  };

  const descargar = async () => {
    try {
      const { url } = await urlCv();
      await descargarUrl(url, vigente?.nombre_original || 'cv.pdf');
    } catch {
      setError('No se pudo descargar el CV. Intente nuevamente.');
    }
  };

  return (
    <Tarjeta titulo="Curriculum Vitae (CV)">
      <p className="tarjeta-sub" style={{ marginTop: '-0.4rem' }}>
        El CV es obligatorio para postularte. Formatos permitidos: PDF, DOC, DOCX. Tamaño máximo: {MAX_MB} MB. Cada carga crea una nueva versión.
      </p>

      {limite && (
        <p className="tarjeta-sub" style={{ marginTop: '-0.6rem' }}>
          {agotado
            ? `Ha alcanzado el límite de ${limite.limite} CV este mes. Podrá actualizar su CV el próximo mes.`
            : `Ha usado ${limite.usados} de ${limite.limite} CV este mes. Le quedan ${limite.restantes}.`}
        </p>
      )}

      <Mensaje tipo="exito">{mensaje}</Mensaje>
      <Mensaje>{error}</Mensaje>

      <div className="cv-zona">
        <label
          className="btn btn-gris"
          style={agotado ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
          title={agotado ? 'Límite mensual de CV alcanzado' : undefined}
        >
          {enviando ? (
            <>
              <span className="spinner" aria-hidden="true" /> Subiendo CV…
            </>
          ) : (
            <>
              <i className="ti ti-upload" aria-hidden="true" /> {vigente ? 'Actualizar CV' : 'Subir CV'}
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={FORMATOS}
            onChange={alElegir}
            disabled={enviando || agotado}
            aria-label={vigente ? 'Actualizar CV' : 'Subir CV'}
          />
        </label>

        {!enviando && elegido && (
          <span className="cv-chip">
            <i className={elegido.invalido ? 'ti ti-circle-x' : 'ti ti-file-check'} aria-hidden="true" />
            <span className="cv-chip-datos">
              <b>{elegido.nombre}</b>
              <small>
                {elegido.formato}
                {elegido.tamano ? ` · ${formatoBytes(elegido.tamano)}` : ''}
                {elegido.invalido ? ' — no cumple los requisitos' : ' — listo para subir'}
              </small>
            </span>
          </span>
        )}
      </div>

      {isLoading && <p className="vacio">Cargando CV…</p>}

      {!isLoading && vigente && (
        <div className="cv-actual">
          <div className="cv-actual-det">
            <i className="ti ti-file-check" aria-hidden="true" />
            <div>
              <div><b>{vigente.nombre_original}</b></div>
              <span>v{vigente.version} · actualizado el {fecha(vigente.actualizado)}</span>
            </div>
          </div>
          <button type="button" className="btn btn-gris" onClick={descargar}>
            <i className="ti ti-download" aria-hidden="true" /> Descargar CV vigente
          </button>
        </div>
      )}

      {!isLoading && !vigente && (
        <div className="empty-card">
          <i className="ti ti-file-check" aria-hidden="true" />
          <p>Aún no tienes un CV cargado.</p>
        </div>
      )}

      {!isLoading && cv?.historial?.length > 1 && (
        <div className="cv-historial">
          <button type="button" className="btn btn-enlace" onClick={() => setVerHistorial(!verHistorial)}>
            <i className={verHistorial ? 'ti ti-chevron-up' : 'ti ti-chevron-down'} aria-hidden="true" />
            Historial de versiones ({cv.historial.length})
          </button>
          {verHistorial && (
            <table>
              <thead><tr><th>Versión</th><th>Archivo</th><th>Estado</th></tr></thead>
              <tbody>
                {cv.historial.map((v) => (
                  <tr key={v.id}>
                    <td>v{v.version}</td>
                    <td>{v.nombre_original}</td>
                    <td>{v.activo ? 'Vigente' : 'Anterior'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Tarjeta>
  );
}
