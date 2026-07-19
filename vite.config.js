import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import zipExtension from './scripts/vite-plugin-zip-extension.mjs'
import { computeBuildId } from './scripts/build-id.mjs'

// BUILD_ID calculé UNE fois par build et partagé entre le zip public de
// l'extension et l'app web (__FILLSELL_APP_BUILD__) : la bannière « extension
// obsolète » compare profiles.extension_build à ce même id — les deux doivent
// sortir du même calcul, au même instant, sinon la comparaison ment.
const FILLSELL_BUILD_ID = computeBuildId()

// build.json (2026-07-19, classe de bug c5fe1414 « bundle périmé ») : le même
// BUILD_ID, émis à la racine du dist. L'app le poll (App.jsx) et le compare à
// __FILLSELL_APP_BUILD__ embarqué dans le bundle qui tourne : mismatch = un
// onglet SPA vit sur un ancien bundle → reload auto ou bandeau « Recharger ».
// Servi frais : vercel.json pose no-store dessus (les .js hashés restent
// immutable, c'est précisément pour ça qu'il faut un fichier NON hashé).
const emitBuildJson = () => ({
  name: 'fillsell-emit-build-json',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'build.json',
      source: JSON.stringify({ build: FILLSELL_BUILD_ID }),
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), zipExtension({ buildId: FILLSELL_BUILD_ID }), emitBuildJson()],
  define: {
    __FILLSELL_APP_BUILD__: JSON.stringify(FILLSELL_BUILD_ID),
  },
})
