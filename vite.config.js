import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import zipExtension from './scripts/vite-plugin-zip-extension.mjs'
import prerenderBlog from './scripts/vite-plugin-prerender-blog.mjs'
import { computeBuildId, EXTENSION_MIN_BUILD, EXTENSION_MIN_VERSION, assertExtensionMinBuildCurrent, assertArbrePropre } from './scripts/build-id.mjs'
import { readFileSync } from 'node:fs'

// BUILD_ID calculé UNE fois par build et partagé entre le zip public de
// l'extension et l'app web (__FILLSELL_APP_BUILD__). La bannière « extension
// obsolète » ne compare PLUS à cet id (chaque déploiement web re-flaggait
// toutes les extensions, cf. build-id.mjs) mais à EXTENSION_MIN_BUILD, qui
// désigne depuis le 29/07 le dernier build PUBLIÉ (installable), et non le
// dernier commit — ce rôle est tenu par EXTENSION_LAST_COMMIT. Le garde-fou
// ci-dessous fait échouer le build si LAST_COMMIT est en retard sur un commit
// touchant chrome-extension/, ou si MIN_BUILD lui est postérieur.
assertExtensionMinBuildCurrent()
const FILLSELL_BUILD_ID = computeBuildId()
// Version de l'app (package.json) : la réponse « Pourquoi tu pars ? » la garde (06/10).
const FILLSELL_APP_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

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
// (01/10) Fonction de config : la garde d'arbre propre ne vaut que pour
// `vite build` — ce qui est SERVI (Vercel, OTA Capgo). Le serveur de dev et
// les aperçus de scripts/apercu n'y passent pas. Cf. assertArbrePropre.
export default defineConfig(({ command }) => {
  if (command === 'build') assertArbrePropre()
  return {
    // prerenderBlog : HTML statique des articles + sitemap.xml, écrits APRÈS le
    // bundle (closeBundle) — cf. scripts/vite-plugin-prerender-blog.mjs.
    plugins: [react(), zipExtension({ buildId: FILLSELL_BUILD_ID }), emitBuildJson(), prerenderBlog()],
    define: {
      __FILLSELL_APP_BUILD__: JSON.stringify(FILLSELL_BUILD_ID),
      __FILLSELL_EXT_MIN_BUILD__: JSON.stringify(EXTENSION_MIN_BUILD),
      __FILLSELL_APP_VERSION__: JSON.stringify(FILLSELL_APP_VERSION),
      // Version du paquet désigné par EXTENSION_MIN_BUILD (dérivée du registre
      // PUBLISHED_BUILD_IDS, jamais saisie). Sert à éteindre la bannière sur le
      // signal de présence du content script, qui annonce sa VERSION dans la page
      // instantanément — sans attendre les 2 min du poll qui stampe la base.
      __FILLSELL_EXT_MIN_VERSION__: JSON.stringify(EXTENSION_MIN_VERSION),
    },
  }
})
