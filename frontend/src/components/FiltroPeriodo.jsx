// SPDX-License-Identifier: MIT
import { Download, FileText, Filter } from 'lucide-react';
import { FechaHoraCampo, Mensaje } from './UI';

/**
 * Barra de filtros por periodo compartida por los dashboards admin y empresa.
 * Misma semántica para el listado/indicadores y para las exportaciones Excel y
 * PDF. Cada formato conserva su propio estado de generación y sus mensajes.
 */
export default function FiltroPeriodo({
  form,
  onCambiar,
  onAplicar,
  onLimpiar,
  onExportar,
  onExportarPdf,
  mostrarExportaciones = true,
  exportando = false,
  exportandoPdf = false,
  errorExportar = null,
  errorExportarPdf = null,
  mensajeExito = null,
  mensajeExitoPdf = null,
}) {
  return (
    <>
      <div className="filters">
        <div className="filters-left">
          <span className="filter-title">
            <Filter size={15} aria-hidden="true" />
            Periodo
          </span>
          <FechaHoraCampo
            id="periodo-desde"
            etiqueta="Desde"
            modo="fecha"
            value={form.desde}
            onChange={(valor) => onCambiar({ ...form, desde: valor })}
            className="date-field"
          />
          <FechaHoraCampo
            id="periodo-hasta"
            etiqueta="Hasta"
            modo="fecha"
            value={form.hasta}
            onChange={(valor) => onCambiar({ ...form, hasta: valor })}
            className="date-field"
          />
        </div>

        <div className="filters-acciones">
          <button className="filter-button" type="button" onClick={onAplicar}>Aplicar filtros</button>
          <button className="filter-button limpiar" type="button" onClick={onLimpiar}>Limpiar filtros</button>
          {mostrarExportaciones && (
            <>
              <button
                className="filter-button exportar"
                type="button"
                onClick={onExportar}
                disabled={exportando}
                aria-busy={exportando}
              >
                <Download size={16} aria-hidden="true" />
                {exportando ? 'Generando…' : 'Exportar Excel'}
              </button>
              <button
                className="filter-button exportar pdf"
                type="button"
                onClick={onExportarPdf}
                disabled={exportandoPdf}
                aria-busy={exportandoPdf}
              >
                <FileText size={16} aria-hidden="true" />
                {exportandoPdf ? 'Generando…' : 'Exportar PDF'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="filtros-mensajes" aria-live="polite">
        <Mensaje tipo="exito">{mensajeExito}</Mensaje>
        <Mensaje>{errorExportar}</Mensaje>
        <Mensaje tipo="exito">{mensajeExitoPdf}</Mensaje>
        <Mensaje>{errorExportarPdf}</Mensaje>
      </div>
    </>
  );
}
