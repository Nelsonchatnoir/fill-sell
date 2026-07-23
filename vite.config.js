import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import zipExtension from './scripts/vite-plugin-zip-extension.mjs'
import { computeBuildId, EXTENSION_MIN_BUILD, assertExtensionMinBuildCurrent } from './scripts/build-id.mjs'

// BUILD_ID calculé UNE fois par build et partagé entre le zip public de
// l'extension et l'app web (__FILLSELL_APP_BUILD__). La bannière « extension
// obsolète » ne compare PLUS à cet id (chaque déploiement web re-flaggait
// toutes les extensions, cf. build-id.mjs) mais à EXTENSION_MIN_BUILD —
// le garde-fou ci-dessous fait échouer le build si la constante est en retard
// sur un commit touchant chrome-extension/.
assertExtensionMinBuildCurrent()
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
    __FILLSELL_EXT_MIN_BUILD__: JSON.stringify(EXTENSION_MIN_BUILD),
  },
})
