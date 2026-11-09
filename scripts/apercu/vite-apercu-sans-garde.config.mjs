// Configuration Vite des HARNAIS D'APERÇU quand la garde de scripts/build-id.mjs bloque le chargement de vite.config.js
// (ex. 09/11 : un commit touchant chrome-extension/ avant que sa livraison ne pose EXTENSION_LAST_COMMIT).
// ⛔ Outil de relecture seulement : jamais un build livré (ni Vercel, ni OTA, ni natif) — la garde, elle, reste entière
//    pour tout ce qui part. Mêmes éléments que vite-bandeau-cloud.config.mjs : React + le faux client Supabase
//    (scripts/apercu/faux-supabase.js, aucun réseau) ; les constantes de build valent des marqueurs d'aperçu.
//   APERCU_VITE_CONFIG=scripts/apercu/vite-apercu-sans-garde.config.mjs node scripts/apercu/capture-offres-cloud.mjs …
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VRAI = path.join(RACINE, 'src', 'lib', 'supabase.js');
const FAUX = path.join(RACINE, 'scripts', 'apercu', 'faux-supabase.js');

function substitution() {
  return {
    name: 'apercu-sans-garde-substitution',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !/lib\/supabase(\.js)?$/.test(source)) return null;
      const r = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (r && path.normalize(r.id.split('?')[0]) === path.normalize(VRAI)) return FAUX;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), substitution()],
  define: {
    __FILLSELL_SITE__: 'false',
    __FILLSELL_APP_BUILD__: JSON.stringify('apercu'),
    __FILLSELL_EXT_MIN_BUILD__: JSON.stringify('apercu'),
    __FILLSELL_APP_VERSION__: JSON.stringify('apercu'),
    __FILLSELL_EXT_MIN_VERSION__: JSON.stringify('0.0.0'),
  },
});
