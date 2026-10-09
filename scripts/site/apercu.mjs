#!/usr/bin/env node
// `npm run site:apercu` — le site tel que Vercel le servira, en local (09/10/2026).
//
//   1. build complet (app + site) avec FILLSELL_SITE=1 et FILLSELL_BUILD_ESSAI=1
//      (pas d'exigence d'arbre propre : on vérifie, on ne sert pas), sortie
//      build/site-apercu/ — JAMAIS dist/, le dossier du natif et de l'OTA ;
//   2. le serveur d'aperçu qui rejoue vercel.json (scripts/site/serveur-apercu.mjs).
//
//   --sans-serveur : le build seul (preuves, vérifications automatiques).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerServeur } from './serveur-apercu.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sortie = path.join('build', 'site-apercu');
const env = { ...process.env, FILLSELL_SITE: '1', FILLSELL_BUILD_ESSAI: '1' };
const r = spawnSync('npx', ['vite', 'build', '--outDir', sortie], {
  cwd: racine, stdio: 'inherit', env, shell: process.platform === 'win32',
});
if (r.status !== 0) {
  console.error(`[site:apercu] build en échec (code ${r.status ?? r.error?.message})`);
  process.exit(r.status || 1);
}
if (process.argv.includes('--sans-serveur')) process.exit(0);
const port = Number(process.env.PORT ?? 4319);
creerServeur(path.join(racine, sortie), { racine }).listen(port, '127.0.0.1', () => {
  console.log(`[site:apercu] ${sortie} servi comme sur Vercel : http://127.0.0.1:${port}/  (Ctrl+C pour arrêter)`);
});
