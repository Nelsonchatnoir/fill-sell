#!/usr/bin/env node
// Étape « Ignored Build Step » de Vercel (vercel.json → ignoreCommand).
//
// ⛔ Incident du 15/10 13:50 : un push de NOTES SEULES (docs/) a reconstruit le
// site. Tout build renomme l'entrée (BUILD_ID dans le bundle) ; à la bascule,
// une requête a pris un 404 sur la nouvelle entrée et Cloudflare l'a gardé →
// page blanche web pour tout le monde (réparé 13:55 par un commit vide).
// Un push qui ne touche que des fichiers sans effet sur le site ne doit donc
// JAMAIS reconstruire : rien ne change pour les clients, l'entrée garde son nom.
//
// Contrat Vercel : sortie 0 = build IGNORÉ, sortie 1 = build lancé.
// Dans le doute (pas de commit précédent, clone superficiel, git en échec,
// fichier inconnu) : ON CONSTRUIT. Ignorer à tort laisserait du code non servi.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Préfixes et fichiers qu'aucun build (web, site, OTA) ne lit.
// ⛔ Ne JAMAIS y mettre src/, site/, public/, scripts/ (sauf réparations,
// preuves et les vérifications Playwright de scripts/refonte/, qu'aucun build
// ne lit), supabase/functions/ (l'app importe `_shared/palier.js`…),
// chrome-extension/ (le build vérifie EXTENSION_LAST_COMMIT) ni package*.json.
export const PREFIXES_SANS_EFFET = [
  'docs/',
  'supabase/migrations/',
  'supabase/rollbacks/',
  'scripts/reparations/',
  'scripts/preuves/',
  'scripts/refonte/',
];
export const FICHIERS_SANS_EFFET = new Set([
  'CLAUDE.md',
  'AGENTS.md',
  'supabase/AGENTS.md',
  'src/AGENTS.md',
  // Ce fichier-ci n'est lu que par Vercel à cette étape, jamais par un build.
  'scripts/vercel-ignorer-build.mjs',
  'scripts/vercel-ignorer-build-selftest.mjs',
]);

export function sansEffetSurLeSite(fichier) {
  const f = String(fichier || '').replace(/\\/g, '/').trim();
  if (!f) return true;
  if (FICHIERS_SANS_EFFET.has(f)) return true;
  return PREFIXES_SANS_EFFET.some((p) => f.startsWith(p));
}

// Rend { ignorer: bool, raison: string }.
export function decider(fichiers) {
  if (!Array.isArray(fichiers)) return { ignorer: false, raison: 'liste des fichiers illisible' };
  const utiles = fichiers.filter((f) => String(f || '').trim()).filter((f) => !sansEffetSurLeSite(f));
  if (fichiers.filter((f) => String(f || '').trim()).length === 0) {
    // Commit vide : c'est LE geste de secours documenté (« un build neuf = une
    // entrée neuve », CLAUDE.md § écran blanc). Il doit construire.
    return { ignorer: false, raison: 'aucun fichier changé (commit vide = renommer l\'entrée, voulu)' };
  }
  if (utiles.length === 0) return { ignorer: true, raison: `${fichiers.length} fichier(s), tous sans effet sur le site` };
  return { ignorer: false, raison: `${utiles.length} fichier(s) servent au site (ex. ${utiles.slice(0, 3).join(', ')})` };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function main() {
  const avant = process.env.VERCEL_GIT_PREVIOUS_SHA;
  const apres = process.env.VERCEL_GIT_COMMIT_SHA || 'HEAD';
  if (!avant) {
    console.log('[ignorer-build] pas de déploiement précédent connu → build');
    process.exit(1);
  }
  let fichiers;
  try {
    fichiers = git(['diff', '--name-only', avant, apres]).split('\n');
  } catch (e) {
    console.log(`[ignorer-build] diff ${avant.slice(0, 8)}..${String(apres).slice(0, 8)} illisible (clone superficiel ?) → build`);
    process.exit(1);
  }
  const { ignorer, raison } = decider(fichiers);
  console.log(`[ignorer-build] ${ignorer ? 'IGNORÉ' : 'build'} — ${raison}`);
  process.exit(ignorer ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
