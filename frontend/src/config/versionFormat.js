// SPDX-License-Identifier: MIT

/**
 * Formato oficial de versión de SOL: X.Y.Z o X.Y.Z-(alpha|beta|rc)[.N].
 * Se comparte entre Vite (validación del archivo VERSION) y el bundle.
 */
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)(?:\.(0|[1-9]\d*))?)?$/i;

/**
 * @param {unknown} valor
 * @returns {{ raw: string, base: string, canal: string|null, numeroCanal: string|null }}
 */
export function parseSystemVersion(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new Error('La versión del sistema no está definida. Revise el archivo VERSION de la raíz.');
  }

  const raw = valor.trim();
  const coincidencia = VERSION_RE.exec(raw);
  if (!coincidencia) {
    throw new Error(
      `Versión del sistema inválida: "${raw}". Use el formato X.Y.Z, X.Y.Z-alpha.N, X.Y.Z-beta.N o X.Y.Z-rc.N.`,
    );
  }

  const [, mayor, menor, parche, canal, numeroCanal] = coincidencia;

  return {
    raw,
    base: `${mayor}.${menor}.${parche}`,
    canal: canal ? canal.toUpperCase() : null,
    numeroCanal: numeroCanal ?? null,
  };
}

/**
 * Convierte el identificador técnico en la etiqueta visible.
 * Ej.: 0.9.2-beta.1 → 0.9.2 BETA 1.
 */
export function formatSystemVersion(valor) {
  const { base, canal, numeroCanal } = parseSystemVersion(valor);
  if (!canal) return base;

  return `${base} ${canal}${numeroCanal ? ` ${numeroCanal}` : ''}`;
}
