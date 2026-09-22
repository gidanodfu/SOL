// SPDX-License-Identifier: MIT
import { Download, Filter } from 'lucide-react';
import { Mensaje } from './UI';

/**
 * Barra de filtros por periodo compartida por los dashboards admin y empresa.
 * Misma semántica para el listado/indicadores y para la exportación a Excel.
 */
export default function FiltroPeriodo({
  form,
  onCambiar,
  onAplicar,
  onLimpiar,
  onExportar,
  exportando = false,
  errorExportar = null,
  mensajeExito = null,
}) {
  return (
    <>
      <div className="filters">
        <div className="filters-left">
          <span className="filter-title">
            <Filter size={15} aria-hidden="true" />
            Periodo
          </span>
          <div className="date-field">
            <label htmlFor="periodo-desde">Desde</label>
            <input
              id="periodo-desde"
              type="date"
              value={form.desde}
              onChange={(e) => onCambiar({ ...form, desde: e.target.value })}
            />
          </div>
          <div className="date-field">
            <label htmlFor="periodo-hasta">Hasta</label>
            <input
              id="periodo-hasta"
              type="date"
              value={form.hasta}
              onChange={(e) => onCambiar({ ...form, hasta: e.target.value })}
            />
          </div>
        </div>

        <div className="filters-acciones">
          <button className="filter-button" type="button" onClick={onAplicar}>Aplicar filtros</button>
          <button className="filter-button limpiar" type="button" onClick={onLimpiar}>Limpiar filtros</button>
          <button className="filter-button exportar" type="button" onClick={onExportar} disabled={exportando}>
            <Download size={16} aria-hidden="true" />
            {exportando ? 'Generando…' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      <Mensaje tipo="exito">{mensajeExito}</Mensaje>
      <Mensaje>{errorExportar}</Mensaje>
    </>
  );
}
