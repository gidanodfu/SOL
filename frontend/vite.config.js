// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { parseSystemVersion } from './src/config/versionFormat.js'

// El .env privado vive en la raíz del repositorio. En Docker se desactiva
// esta lectura (SOL_VITE_ENV_DIR=false) y Compose inyecta solo las VITE_* públicas.
const envDir = process.env.SOL_VITE_ENV_DIR === 'false' ? false : '..'

const frontendDir = dirname(fileURLToPath(import.meta.url))
const versionPath = resolve(frontendDir, '../VERSION')

let VERSION_SOL
try {
  VERSION_SOL = readFileSync(versionPath, 'utf8').trim()
  parseSystemVersion(VERSION_SOL)
} catch (error) {
  throw new Error(`[SOL] No se pudo leer una versión válida desde ${versionPath}: ${error.message}`)
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir,
  envPrefix: 'VITE_',
  define: {
    'import.meta.env.VITE_SOL_VERSION': JSON.stringify(VERSION_SOL),
  },
  // Puerto fijo del frontend en desarrollo; el backend permite este origen por CORS.
  // strictPort evita que Vite use otro puerto si el 5173 está ocupado.
  server: {
    port: 5173,
    strictPort: true,
  },
})
