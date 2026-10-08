// SPDX-License-Identifier: MIT

/**
 * DashboardGrid — distribución común de dashboards.
 * Por defecto: columna principal (más ancha) + columna lateral.
 * `equal` → dos columnas equivalentes (50/50). Colapsa a una columna en tablet/móvil.
 */
export default function DashboardGrid({ children, equal = false, className = '' }) {
  return (
    <div className={`dash-layout${equal ? ' dash-layout--50' : ''}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
