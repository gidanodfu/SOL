// SPDX-License-Identifier: MIT
import { formatSystemVersion } from './versionFormat.js';

/**
 * Versión inyectada por Vite desde el archivo VERSION de la raíz. No se debe
 * editar ninguna constante del frontend al publicar una versión nueva.
 */
export const VERSION_RAW = String(import.meta.env.VITE_SOL_VERSION ?? '').trim();

export const VERSION_SISTEMA = formatSystemVersion(VERSION_RAW);
