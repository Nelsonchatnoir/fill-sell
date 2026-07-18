import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import zipExtension from './scripts/vite-plugin-zip-extension.mjs'
import { computeBuildId } from './scripts/build-id.mjs'

// BUILD_ID calculé UNE fois par build et partagé entre le zip public de
// l'extension et l'app web (__FILLSELL_APP_BUILD__) : la bannière « extension
// obsolète » compare profiles.extension_build à ce même id — les deux doivent
// sortir du même calcul, au même instant, sinon la comparaison ment.
const FILLSELL_BUILD_ID = computeBuildId()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), zipExtension({ buildId: FILLSELL_BUILD_ID })],
  define: {
    __FILLSELL_APP_BUILD__: JSON.stringify(FILLSELL_BUILD_ID),
  },
})
