// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  actualizarPerfilEmpresa, actualizarPresenciaEmpresa, eliminarLogoEmpresa, perfilEmpresa, subirLogoEmpresa,
} from '../../services/empresas';
import { EstadoCarga, Boton, Campo, Mensaje } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import ImagenUploader from '../../components/ImagenUploader';
import { CAMPOS_PRESENCIA } from '../../components/RedesSociales';
import { useToast } from '../../components/Feedbacks';
import { useAccion } from '../../hooks/useAccion';
import { dominioPermitido, errorApi, esEnlaceSeguro, esTelefonoValido, soloDigitos, urlArchivo } from '../../utils';

export default function Perfil() {
  const { data, isLoading } = useQuery({ queryKey: ['perfil-empresa'], queryFn: perfilEmpresa });
  const [form, setForm] = useState(null);
  const [presencia, setPresencia] = useState(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { ejecutar, enviando, error, setError } = useAccion(() => actualizarPerfilEmpresa(form));
  const {
    ejecutar: guardarPresencia, enviando: guardandoPresencia, error: errorPresencia, setError: setErrorPresencia,
  } = useAccion(() => actualizarPresenciaEmpresa(presencia));

  useEffect(() => {
    if (data) setForm({
      nombre_comercial: data.nombre_comercial || '',
      direccion: data.direccion || '',
      telefono: data.telefono || '',
      email: data.email || '',
      representante: data.representante || '',
    });
  }, [data]);

  // Presencia digital (sitio web y redes) en su propio estado: su guardado no
  // comparte payload con los datos de contacto.
  useEffect(() => {
    if (data) setPresencia({
      website_url: data.website_url || '',
      instagram_url: data.instagram_url || '',
      facebook_url: data.facebook_url || '',
      tiktok_url: data.tiktok_url || '',
      x_url: data.x_url || '',
    });
  }, [data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const guardar = async () => {
    if (!esTelefonoValido(form.telefono)) {
      setError('El teléfono debe tener 9 u 11 dígitos.');
      return;
    }
    try {
      await ejecutar();
      queryClient.invalidateQueries({ queryKey: ['perfil-empresa'] });
      setError(null);
    } catch {
      // El error se muestra a través de useAccion.
    }
  };

  const guardarPresenciaDigital = async () => {
    const dominiosPorCampo = {
      website_url: null,
      instagram_url: ['instagram.com'],
      facebook_url: ['facebook.com', 'fb.com'],
      tiktok_url: ['tiktok.com'],
      x_url: ['x.com', 'twitter.com'],
    };

    for (const { clave, etiqueta } of CAMPOS_PRESENCIA) {
      const valor = (presencia[clave] || '').trim();
      if (valor === '') continue;
      if (!esEnlaceSeguro(valor)) {
        setErrorPresencia(`${etiqueta}: usa una URL completa que empiece por https://`);
        return;
      }
      const dominios = dominiosPorCampo[clave];
      if (dominios && !dominioPermitido(valor, dominios)) {
        setErrorPresencia(`${etiqueta}: el enlace no corresponde a un dominio válido de esa red.`);
        return;
      }
    }

    try {
      await guardarPresencia();
      queryClient.invalidateQueries({ queryKey: ['perfil-empresa'] });
      setErrorPresencia(null);
      toast.success('Presencia digital actualizada.');
    } catch {
      // El error se muestra a través de useAccion.
    }
  };

  return (
    <div>
      <PageHeader
        titulo="Mi empresa"
        descripcion="Información registrada de tu empresa en Empleo MDJLO."
      />

      {isLoading && <EstadoCarga />}

      {data && (
        <div className="list-card">
          <div className="list-card-head">
            <h2>Datos de la empresa</h2>
          </div>
          {/* Foto de identidad (compacta) + datos en rejilla, patrón de la
              tarjeta «Mi perfil laboral» del postulante. */}
          <div className="empresa-perfil">
            <FotoEmpresa data={data} />
            <div className="descripcion">
              <div><b>RUC</b>{data.ruc}</div>
              <div><b>Razón social</b>{data.razon_social}</div>
              <div><b>Nombre comercial</b>{data.nombre_comercial || '—'}</div>
              <div><b>Dirección</b>{data.direccion || '—'}</div>
              <div><b>Representante</b>{data.representante || '—'}</div>
              <div><b>Usuario</b>{data.username}</div>
              <div><b>Estado</b>{data.estado === 'activo' ? 'Activa' : 'Inactiva'}</div>
            </div>
          </div>
        </div>
      )}

      {form && (
        <div className="list-card">
          <div className="list-card-head">
            <h2>Actualizar datos de contacto</h2>
          </div>
          <Mensaje>{error}</Mensaje>
          <div className="form-malla">
            <Campo etiqueta="Nombre comercial" value={form.nombre_comercial} onChange={set('nombre_comercial')} />
            <Campo etiqueta="Representante" value={form.representante} onChange={set('representante')} />
            <Campo etiqueta="Dirección" value={form.direccion} onChange={set('direccion')} />
            <Campo etiqueta="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: soloDigitos(e.target.value) })} inputMode="numeric" maxLength={11} />
            <Campo etiqueta="Correo electrónico" type="email" value={form.email} onChange={set('email')} />
          </div>
          <Boton variante="primario" cargando={enviando} onClick={guardar}>Guardar cambios</Boton>
        </div>
      )}

      {presencia && (
        <div className="list-card">
          <div className="list-card-head">
            <h2>Presencia digital</h2>
          </div>
          <p className="tarjeta-sub">
            Agrega el sitio web y las redes sociales de tu empresa para que los postulantes conozcan mejor tu organización.
          </p>
          <Mensaje>{errorPresencia}</Mensaje>
          <div className="form-malla">
            {CAMPOS_PRESENCIA.map(({ clave, etiqueta, placeholder }) => (
              <Campo
                key={clave}
                etiqueta={etiqueta}
                type="url"
                placeholder={placeholder}
                value={presencia[clave]}
                onChange={(e) => setPresencia({ ...presencia, [clave]: e.target.value })}
              />
            ))}
          </div>
          <Boton variante="primario" cargando={guardandoPresencia} onClick={guardarPresenciaDigital}>
            Guardar presencia digital
          </Boton>
        </div>
      )}
    </div>
  );
}

/**
 * Foto de identidad de la empresa (única imagen). Bloque compacto que acompaña a
 * los datos en la misma tarjeta; reutiliza ImagenUploader (variante compacta).
 * El binario vive en Storage normalizado a 800x800.
 */
function FotoEmpresa({ data }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [cargando, setCargando] = useState(false);

  const hacer = async (fn) => {
    setCargando(true);
    try {
      await fn();
      queryClient.invalidateQueries({ queryKey: ['perfil-empresa'] });
      toast.success('Foto de perfil actualizada.');
    } catch (e) {
      toast.error(errorApi(e));
    } finally {
      setCargando(false);
    }
  };

  return (
    <ImagenUploader
      variante="compacta"
      variant="company"
      nombre={data.razon_social}
      alt={`Logotipo de ${data.razon_social || 'la empresa'}`}
      url={urlArchivo(data.logo_url)}
      cargando={cargando}
      onSubir={(f) => hacer(() => subirLogoEmpresa(f))}
      onEliminar={() => hacer(() => eliminarLogoEmpresa())}
    />
  );
}
