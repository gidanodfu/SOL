// SPDX-License-Identifier: MIT
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Puerto fijo del frontend en desarrollo; el backend permite este origen por CORS.
  // strictPort evita que Vite use otro puerto si el 5173 está ocupado.
  server: {
    port: 5173,
    strictPort: true,
  },
})
