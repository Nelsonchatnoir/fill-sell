// Harnais de la modale Free (06/10 soir) : la config du projet + le FAUX client
// Supabase (aucun réseau, écritures refusées). ⛔ Jamais utilisé pour un build.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import base from '../../vite.config.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VRAI = path.join(RACINE, 'src', 'lib', 'supabase.js');
const FAUX = path.join(RACINE, 'scripts', 'apercu', 'faux-supabase.js');
function substitution() {
  return {
    name: 'apercu-modale-free-supabase', enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !/lib\/supabase(\.js)?$/.test(source)) return null;
      const r = await this.resolve(source, importer, { ...options, skipSelf: true });
      return r && path.normalize(r.id.split('?')[0]) === path.normalize(VRAI) ? FAUX : null;
    },
  };
}
export default defineConfig((env) => {
  const c = typeof base === 'function' ? base(env) : base;
  return mergeConfig(c, { plugins: [substitution()] });
});
