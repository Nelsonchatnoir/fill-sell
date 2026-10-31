// ═══════════════════════════════════════════════════════════════════════════
// BANC « OUVERTURE DE LA FICHE » (31/10) — 1. construire
// ═══════════════════════════════════════════════════════════════════════════
// Build de PRODUCTION de la vraie app (racine donnée : le dépôt, ou une copie à un autre commit pour l'« avant »), avec
// un faux client Supabase (fake-supabase.js) : aucun réseau, aucune écriture, aucune session — jamais de connexion à
// fillsell.app en automatisation. Les données : un export JSON d'un compte de TEST (celui de Nico), jamais d'un client,
// démultiplié au chargement (?n=2900 : la taille du plus gros stock du parc le 31/10).
//   node scripts/banc-fiche/construire.mjs <racine du code> <dossier de sortie> <export.json>
// Export (lecture seule, compte de Nico) : voir docs/enquetes/cloture-fh-3110/RAPPORT.md § Point 4.
// Puis : node scripts/banc-fiche/mesurer.mjs <dossier de sortie> chromium|webkit <ralenti CPU> <n articles> [profil.json]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const BANC = path.dirname(fileURLToPath(import.meta.url));
const DEPOT = path.resolve(BANC, '..', '..');
const racine = path.resolve(process.argv[2] || DEPOT);
const sortie = path.resolve(process.argv[3]);
const donnees = path.resolve(process.argv[4]);
const { build } = await import(pathToFileURL(path.join(DEPOT, 'node_modules/vite/dist/node/index.js')).href);
const react = (await import(pathToFileURL(path.join(DEPOT, 'node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
// BANC_DIAG=1 : note quelles props du Stock changent d'identité à chaque rendu d'App (mesurer.mjs, BANC_DIFF=1).
const diag = process.env.BANC_DIAG ? (await import('./diag-plugin.mjs')).default : null;
const FAUX = path.join(BANC, 'fake-supabase.js').replace(/\\/g, '/');
await build({
  root: racine,
  configFile: false,
  logLevel: 'warn',
  cacheDir: path.join(sortie, '..', '.vite-cache-banc'),
  plugins: [react(), ...(diag ? [diag] : []), {
    name: 'banc-faux-supabase',
    enforce: 'pre',
    resolveId(src, importer) {
      if (/(^|\/)lib\/supabase(\.js)?$/.test(src) && importer && !importer.includes('fake-supabase')) return FAUX;
      return null;
    },
  }],
  define: {
    __FILLSELL_SITE__: 'false',
    __FILLSELL_APP_BUILD__: JSON.stringify('banc'),
    __FILLSELL_EXT_MIN_BUILD__: JSON.stringify('2026-01-01T00:00:00Z'),
    __FILLSELL_APP_VERSION__: JSON.stringify('banc'),
    __FILLSELL_EXT_MIN_VERSION__: JSON.stringify('0.0.0'),
  },
  build: { outDir: sortie, emptyOutDir: true, minify: process.env.BANC_MINIFY === '1', sourcemap: false, reportCompressedSize: false },
});
fs.copyFileSync(donnees, path.join(sortie, 'donnees.json'));
console.log('ok', sortie);
