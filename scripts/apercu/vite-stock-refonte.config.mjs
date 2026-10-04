// Configuration Vite du harnais du Stock (03/10/2026) : la config du projet,
// PLUS un greffon qui remplace src/lib/supabase.js par le faux client
// (scripts/apercu/faux-supabase.js). Le reste de l'app est servi tel quel.
//
//   npx vite --config scripts/apercu/vite-stock-refonte.config.mjs --port 5212
//
// ⛔ Outil de relecture : jamais utilisé pour un build.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import base from '../../vite.config.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VRAI = path.join(RACINE, 'src', 'lib', 'supabase.js');
const FAUX = path.join(RACINE, 'scripts', 'apercu', 'faux-supabase.js');

function fauxSupabase() {
  return {
    name: 'apercu-faux-supabase',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!/lib\/supabase(\.js)?$/.test(source) || !importer) return null;
      const r = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (r && path.normalize(r.id.split('?')[0]) === path.normalize(VRAI)) return FAUX;
      return null;
    },
  };
}

export default defineConfig((env) => {
  const c = typeof base === 'function' ? base(env) : base;
  return mergeConfig(c, { plugins: [fauxSupabase()] });
});
