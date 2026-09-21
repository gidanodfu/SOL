// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listarContratacionesAdmin } from '../../services/contrataciones';
import { EstadoCarga, Campo, ListaVacia, Mensaje, Tarjeta } from '../../components/UI';
import { errorApi, fecha } from '../../utils';

export default function Contrataciones() {
  const [rango, setRango] = useState({ desde: '', hasta: '' });

  const { data, isLoading, error } = useQuery({
    queryKey: ['contrataciones-admin', rango],
    queryFn: () => listarContratacionesAdmin({ desde: rango.desde || undefined, hasta: rango.hasta || undefined }),
  });

  return (
    <Tarjeta
      titulo="Contrataciones registradas (RF-58)"
      acciones={
        <div className="form-fila">
          <Campo etiqueta="Desde" type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
          <Campo etiqueta="Hasta" type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
        </div>
      }
    >
      {error && <Mensaje>{errorApi(error)}</Mensaje>}
      {isLoading && <EstadoCarga />}
      {data && data.length === 0 && <ListaVacia texto="Sin contrataciones registradas en el periodo." />}
      {data && data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Empresa</th>
              <th>Contratado</th>
              <th>Oferta / cargo</th>
              <th>Modalidad</th>
              <th>Remuneración</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td>{fecha(c.fecha_contratacion)}</td>
                <td>{c.razon_social}<br /><small style={{ color: 'var(--gris)' }}>RUC {c.ruc}</small></td>
                <td>{c.nombres} {c.apellidos}<br /><small style={{ color: 'var(--gris)' }}>DNI {c.dni}</small></td>
                <td>{c.puesto}<br /><small style={{ color: 'var(--gris)' }}>{c.cargo}</small></td>
                <td>{c.modalidad || '—'}</td>
                <td>{c.remuneracion ? `S/ ${c.remuneracion}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Tarjeta>
  );
}
