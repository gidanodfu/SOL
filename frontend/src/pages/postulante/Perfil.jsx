import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { actualizarPerfilPostulante, perfilPostulante } from '../../services/postulante';
import { Boton, Campo, Mensaje, Tarjeta, EstadoCarga } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import CvUploader from '../../components/CvUploader';
import { useAccion } from '../../hooks/useAccion';
import { esTelefonoValido, soloDigitos } from '../../utils';

export default function Perfil() {
  const { data, isLoading } = useQuery({ queryKey: ['perfil-postulante'], queryFn: perfilPostulante });

  return (
    <div>
      <PageHeader
        titulo="Mi perfil y CV"
        descripcion="Completa tu perfil laboral para que las empresas te conozcan mejor al postular."
      />
      {data?.completitud && !data.completitud.completo && <ResumenCompletitud c={data.completitud} />}
      <Tarjeta titulo="Mi perfil laboral">
        {isLoading && <EstadoCarga />}
        {data && (
          <div className="descripcion">
            <div style={{display:'none'}}><b>DNI</b>{data.dni}</div>
            <div><b>Nombres</b>{data.nombres} {data.apellidos}</div>
            <div><b>Distrito</b>{data.distrito || '—'}</div>
            <div><b>Teléfono</b>{data.telefono || '—'}</div>
            <div><b>Correo</b>{data.email || '—'}</div>
          </div>
        )}
      </Tarjeta>

      {data && <EdicionBasica perfil={data} />}
      {data && <CvUploader />}
    </div>
  );
}

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
    } catch { /* error visible */ }
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
        <Campo etiqueta="Fecha de nacimiento" type="date" value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')}
         />
         <Campo etiqueta="" style={{display:'none'}} type="email" value={form.email} onChange={set('email')}  />
      </div>
      <Boton variante="primario" cargando={enviando} onClick={guardar}>Guardar cambios</Boton>
    </Tarjeta>
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
