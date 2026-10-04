// Configuration Vite du harnais « Sans ordinateur » (04/10/2026) : la config
// du projet, PLUS deux substitutions, et rien d'autre :
//   · src/lib/supabase.js     → scripts/apercu/faux-supabase.js (aucun réseau,
//                                écritures refusées) ;
//   · src/config/cloudOffer.js → scripts/apercu/cloud-offre-ouverte.js (le
//                                drapeau ouvert POUR L'APERÇU ; le vrai reste
//                                à false).
//
//   npx vite --config scripts/apercu/vite-cloud.config.mjs --port 5237
//
// ⛔ Outil de relecture : jamais utilisé pour un build.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import base from '../../vite.config.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUBSTITUTIONS = [
  { motif: /lib\/supabase(\.js)?$/, vrai: path.join(RACINE, 'src', 'lib', 'supabase.js'), faux: path.join(RACINE, 'scripts', 'apercu', 'faux-supabase.js') },
  { motif: /config\/cloudOffer(\.js)?$/, vrai: path.join(RACINE, 'src', 'config', 'cloudOffer.js'), faux: path.join(RACINE, 'scripts', 'apercu', 'cloud-offre-ouverte.js') },
];

function substitutions() {
  return {
    name: 'apercu-cloud-substitutions',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer) return null;
      const s = SUBSTITUTIONS.find((x) => x.motif.test(source));
      if (!s) return null;
      const r = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (r && path.normalize(r.id.split('?')[0]) === path.normalize(s.vrai)) return s.faux;
      return null;
    },
  };
}

export default defineConfig((env) => {
  const c = typeof base === 'function' ? base(env) : base;
  return mergeConfig(c, { plugins: [substitutions()] });
});
