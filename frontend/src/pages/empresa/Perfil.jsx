// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { actualizarPerfilEmpresa, perfilEmpresa } from '../../services/empresas';
import { EstadoCarga, Boton, Campo, Mensaje } from '../../components/UI';
import PageHeader from '../../components/PageHeader';
import { useAccion } from '../../hooks/useAccion';
import { esTelefonoValido, soloDigitos } from '../../utils';

export default function Perfil() {
  const { data, isLoading } = useQuery({ queryKey: ['perfil-empresa'], queryFn: perfilEmpresa });
  const [form, setForm] = useState(null);
  const queryClient = useQueryClient();
  const { ejecutar, enviando, error, setError } = useAccion(() => actualizarPerfilEmpresa(form));

  useEffect(() => {
    if (data) setForm({
      nombre_comercial: data.nombre_comercial || '',
      direccion: data.direccion || '',
      telefono: data.telefono || '',
      email: data.email || '',
      representante: data.representante || '',
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
    </div>
  );
}
