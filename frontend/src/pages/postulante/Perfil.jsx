// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Briefcase, Clock3, FileCheck2, Search, Trash2 } from 'lucide-react';
import {
  actualizarPerfilPostulante, eliminarFotoPostulante, perfilPostulante, subirFotoPostulante,
} from '../../services/postulante';
import ProfileImage from '../../components/ProfileImage';
import { Boton, Campo, Mensaje, Tarjeta, EstadoCarga } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import CvUploader from '../../components/CvUploader';
import StatCard from '../../components/StatCard';
import DashboardGrid from '../../components/dashboard/DashboardGrid';
import BarChartCard from '../../components/dashboard/BarChartCard';
import QuickActionsCard from '../../components/dashboard/QuickActionsCard';
import { useToast } from '../../components/Feedbacks';
import { useAccion } from '../../hooks/useAccion';
import { DONA_ESTADO_POSTULACION } from '../../constants';
import { esTelefonoValido, errorApi, soloDigitos, urlArchivo } from '../../utils';

/**
 * "Mi perfil y CV" es el centro de gestión del postulante: reúne los datos
 * personales/laborales, el CV y la actividad (antes en /postulante/dashboard).
 * Todo proviene de una única petición GET /postulante/perfil (data.actividad).
 */
export default function Perfil() {
  const { data, isLoading, error } = useQuery({ queryKey: ['perfil-postulante'], queryFn: perfilPostulante });

  return (
    <div>
      <PageHeader
        titulo="Mi perfil y CV"
        descripcion="Completa tu perfil laboral para que las empresas te conozcan mejor al postular."
      />

      {error && <Mensaje>{errorApi(error)}</Mensaje>}
      {data?.completitud && !data.completitud.completo && <ResumenCompletitud c={data.completitud} />}

      {isLoading && !data && <EstadoCarga />}

      {data && (
        <>
          <div className="perfil-grid">
            <div>
              <Tarjeta titulo="Mi perfil laboral">
                <div className="perfil-identidad">
                  <FotoPerfil fotoUrl={data.foto_url} inicial={(data.nombres || 'P').trim().charAt(0).toUpperCase()} />
                  <div className="descripcion perfil-datos">
                    <div><b>DNI</b>{data.dni || '—'}</div>
                    <div><b>Nombres</b>{data.nombres} {data.apellidos}</div>
                    <div><b>Distrito</b>{data.distrito || '—'}</div>
                    <div><b>Teléfono</b>{data.telefono || '—'}</div>
                    <div><b>Correo</b>{data.email || '—'}</div>
                    <div><b>Ocupación</b>{data.ocupacion || '—'}</div>
                    <div><b>Experiencia</b>{data.experiencia || '—'}</div>
                    <div><b>Estudios / formación</b>{data.estudios || '—'}</div>
                  </div>
                </div>
              </Tarjeta>

              <CvUploader />
            </div>

            <div>
              <EdicionBasica perfil={data} />
            </div>
          </div>

          <ActividadLaboral actividad={data.actividad} />
        </>
      )}
    </div>
  );
}

/**
 * Foto de perfil. El binario se solicita autenticado (blob) para no exponerlo en
 * una URL pública; el backend la entrega normalizada a 800x800 (cover, sin
 * deformar). Placeholder con la inicial si no hay foto.
 */
function FotoPerfil({ fotoUrl, inicial }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const inputRef = useRef(null);
  const [cargando, setCargando] = useState(false);

  const elegir = async (e) => {
    const archivo = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!archivo) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
      toast.error('Formato no permitido. Usa JPG, PNG o WEBP.');
      return;
    }
    if (archivo.size > 8 * 1024 * 1024) {
      toast.error('La imagen supera el tamaño máximo permitido.');
      return;
    }
    setCargando(true);
    try {
      await subirFotoPostulante(archivo);
      queryClient.invalidateQueries({ queryKey: ['perfil-postulante'] });
      toast.success('Foto de perfil actualizada.');
    } catch (err) {
      toast.error(errorApi(err));
    } finally {
      setCargando(false);
    }
  };

  const quitar = async () => {
    setCargando(true);
    try {
      await eliminarFotoPostulante();
      queryClient.invalidateQueries({ queryKey: ['perfil-postulante'] });
      toast.success('Foto de perfil eliminada.');
    } catch (err) {
      toast.error(errorApi(err));
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="perfil-foto">
      <ProfileImage
        src={urlArchivo(fotoUrl)}
        nombre={inicial}
        alt="Foto de perfil"
        variant="person"
        size={112}
      />
      <div className="perfil-foto-acciones">
        <label className={`btn btn-gris${cargando ? ' deshabilitado' : ''}`}>
          <Camera size={15} aria-hidden="true" />{fotoUrl ? 'Cambiar' : 'Subir foto'}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={elegir} disabled={cargando} hidden />
        </label>
        {fotoUrl && (
          <button type="button" className="btn btn-peligro" onClick={quitar} disabled={cargando}>
            <Trash2 size={15} aria-hidden="true" />Quitar
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Edición de datos personales. El DNI NO se incluye en el formulario ni en el
 * payload: es inmutable (el backend también lo ignora si se enviara).
 */
function EdicionBasica({ perfil }) {
  const queryClient = useQueryClient();
  const { ejecutar, enviando, error, setError } = useAccion(actualizarPerfilPostulante);
  const [form, setForm] = useState(null);

  useEffect(() => {
    setForm({
      nombres: perfil.nombres,
      apellidos: perfil.apellidos,
      email: perfil.email || '',
      telefono: perfil.telefono || '',
      direccion: perfil.direccion || '',
      distrito: perfil.distrito || '',
      fecha_nacimiento: perfil.fecha_nacimiento || '',
      ocupacion: perfil.ocupacion || '',
      experiencia: perfil.experiencia || '',
      estudios: perfil.estudios || '',
    });
  }, [perfil]);

  if (!form) return null;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const guardar = async () => {
    if (!esTelefonoValido(form.telefono)) {
      setError('El teléfono debe tener 9 u 11 dígitos.');
      return;
    }
    try {
      await ejecutar(form);
      queryClient.invalidateQueries({ queryKey: ['perfil-postulante'] });
      setError(null);
    } catch { /* el error se muestra a través de useAccion */ }
  };

  return (
    <Tarjeta titulo="Editar datos personales">
      <Mensaje>{error}</Mensaje>
      <div className="form-malla">
        <Campo etiqueta="Nombres" value={form.nombres} onChange={set('nombres')} />
        <Campo etiqueta="Apellidos" value={form.apellidos} onChange={set('apellidos')} />
        <Campo etiqueta="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: soloDigitos(e.target.value) })} inputMode="numeric" maxLength={11} />
        <Campo etiqueta="Dirección" value={form.direccion} onChange={set('direccion')} />
        <Campo etiqueta="Distrito" value={form.distrito} onChange={set('distrito')} />
        <Campo etiqueta="Fecha de nacimiento" type="date" value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')} />
        <Campo etiqueta="Ocupación" value={form.ocupacion} onChange={set('ocupacion')} maxLength={150} />
        <Campo etiqueta="" style={{ display: 'none' }} type="email" value={form.email} onChange={set('email')} />
      </div>
      <label className="campo">
        <span>Experiencia laboral</span>
        <textarea value={form.experiencia} onChange={set('experiencia')} rows={3} maxLength={5000} />
      </label>
      <label className="campo">
        <span>Estudios / formación</span>
        <textarea value={form.estudios} onChange={set('estudios')} rows={3} maxLength={5000} />
      </label>
      <Boton variante="primario" cargando={enviando} onClick={guardar}>Guardar cambios</Boton>
    </Tarjeta>
  );
}

/**
 * Actividad laboral del postulante (migrada desde /postulante/dashboard).
 * Null-safe: funciona sin postulaciones, sin CV y con datos incompletos.
 */
function ActividadLaboral({ actividad }) {
  const postulaciones = actividad?.postulaciones || {};
  const total = actividad?.total_postulaciones ?? 0;
  const conCv = Boolean(actividad?.con_cv);
  const estadoItems = DONA_ESTADO_POSTULACION.map((o) => ({ etiqueta: o.etiqueta, valor: postulaciones[o.estado] || 0, color: o.color }));

  return (
    <section className="perfil-actividad">
      <h2>Mi actividad laboral</h2>
      <p className="perfil-actividad-sub">Resumen de tus postulaciones y del estado de tu perfil.</p>

      <div className="stat-row">
        <StatCard variante="row" color="blue" icono={<Briefcase size={20} aria-hidden="true" />} valor={total} etiqueta="Postulaciones realizadas" />
        <StatCard variante="row" color="amber" icono={<Clock3 size={20} aria-hidden="true" />} valor={postulaciones.pendiente || 0} etiqueta="Pendientes por revisar" />
        <StatCard
          variante="row"
          color="green"
          icono={<FileCheck2 size={20} aria-hidden="true" />}
          valor={conCv ? 'Sí' : '—'}
          etiqueta={conCv ? 'CV cargado' : 'Sin CV cargado'}
        />
      </div>

      <DashboardGrid equal>
        <BarChartCard
          titulo="Estado de mis postulaciones"
          descripcion="Distribución de tus postulaciones por etapa"
          items={estadoItems}
          vacio="No tienes postulaciones todavía. Explora las ofertas publicadas y postúlate."
        />

        <QuickActionsCard
          descripcion="Accesos frecuentes para gestionar tu búsqueda de empleo."
          acciones={[
            { to: '/postulante/buscar', texto: 'Buscar empleo', icono: <Search size={17} aria-hidden="true" />, variante: 'primario' },
            { to: '/postulante/postulaciones', texto: 'Mis postulaciones', icono: <FileCheck2 size={17} aria-hidden="true" />, variante: 'gris' },
          ]}
        />
      </DashboardGrid>
    </section>
  );
}

function ResumenCompletitud({ c }) {
  const items = [
    { ok: c.datos_basicos, texto: 'Datos personales y de contacto completos' },
    { ok: c.tiene_cv, texto: 'CV cargado' },
  ];

  return (
    <div className="completitud">
      <div className="completitud-titulo">
        <i className="ti ti-alert-triangle" />
        <strong>Para postularte solo necesitas tus datos personales y un CV cargado.</strong>
      </div>
      <ul>
        {items.map((it) => (
          <li key={it.texto} className={it.ok ? 'ok' : 'falta'}>
            {it.ok ? <i className="ti ti-circle-check" /> : <i className="ti ti-circle-x" />}
            {it.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
