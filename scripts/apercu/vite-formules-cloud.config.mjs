// Configuration Vite de la capture des formules avec Cloud (11/11/2026), sur le modèle de vite-revue-cloud.config.mjs : la config du projet, PLUS une
// substitution : src/lib/supabase.js → scripts/apercu/faux-supabase.js (aucun réseau, écritures refusées).
// Le drapeau du Cloud n'est PAS substitué : l'aperçu tourne sous un compte témoin.
// ⛔ Outil de relecture : jamais utilisé pour un build.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import base from '../../vite.config.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VRAI = path.join(RACINE, 'src', 'lib', 'supabase.js');
const FAUX = path.join(RACINE, 'scripts', 'apercu', 'faux-supabase.js');

function substitution() {
  return {
    name: 'apercu-formules-cloud-substitution',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !/lib\/supabase(\.js)?$/.test(source)) return null;
      const r = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (r && path.normalize(r.id.split('?')[0]) === path.normalize(VRAI)) return FAUX;
      return null;
    },
  };
}

export default defineConfig((env) => {
  const c = typeof base === 'function' ? base(env) : base;
  // Le cache de Vite dans build/ de la copie (ignoré par git) : jamais dans node_modules, partagé par jonction.
  return mergeConfig(c, { plugins: [substitution()], cacheDir: path.join(RACINE, 'build', '.vite-apercu-formules') });
});
