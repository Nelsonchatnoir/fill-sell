import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import zipExtension from './scripts/vite-plugin-zip-extension.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), zipExtension()],
})
