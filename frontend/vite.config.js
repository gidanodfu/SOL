// SPDX-License-Identifier: MIT
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// El .env privado vive en la raíz del repositorio. En Docker se desactiva
// esta lectura (SOL_VITE_ENV_DIR=false) y Compose inyecta solo las VITE_* públicas.
const envDir = process.env.SOL_VITE_ENV_DIR === 'false' ? false : '..'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir,
  envPrefix: 'VITE_',
  // Puerto fijo del frontend en desarrollo; el backend permite este origen por CORS.
  // strictPort evita que Vite use otro puerto si el 5173 está ocupado.
  server: {
    port: 5173,
    strictPort: true,
  },
})
