// SPDX-License-Identifier: MIT

/**
 * Ficha de datos etiqueta/valor reutilizando la rejilla `.descripcion` ya
 * existente. Cada item: `{ etiqueta, valor }`; los valores vacíos se muestran
 * como "—". Acepta nodos (badges, enlaces) como valor.
 */
export default function FichaDatos({ items = [] }) {
  const visibles = items.filter(Boolean);
  if (visibles.length === 0) return null;

  return (
    <div className="descripcion">
      {visibles.map((item) => (
        <div key={item.etiqueta}>
          <b>{item.etiqueta}</b>
          {item.valor === null || item.valor === undefined || item.valor === '' ? '—' : item.valor}
        </div>
      ))}
    </div>
  );
}
