import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the same build works from a web server and from
  // the Electron app's file:// URL.
  base: './',
  plugins: [react()],
})
