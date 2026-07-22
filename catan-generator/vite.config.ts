import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: https://<user>.github.io/grouper/
const base = process.env.GITHUB_PAGES === 'true' ? '/grouper/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
})
