// Configuration Vite du harnais de l'encart « Bientôt : FillSell Cloud » (06/10/2026) :
// la config du projet, PLUS une substitution, et rien d'autre :
//   · src/lib/supabase.js → scripts/apercu/faux-supabase.js (aucun réseau,
//                           écritures refusées).
// Le VRAI drapeau Cloud (config/cloudOffer.js, baissé) est gardé : le compte
// d'aperçu est un compte ordinaire.
//
//   npx vite --config scripts/apercu/vite-encart-cloud.config.mjs --port 5211
//
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
    name: 'apercu-encart-cloud-substitution',
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
  return mergeConfig(c, { plugins: [substitution()] });
});
