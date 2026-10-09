#!/usr/bin/env node
// `npm run site:dater` — met à jour site/dates.lock.json (09/10/2026).
//
// Le SEUL geste qui écrit une date de mise à jour (revue B I3). Il rend le site
// dans un dossier jetable (build/site-dater, ignoré par git), calcule
// l'empreinte du contenu principal de chaque page, et :
//   · page inchangée      → sa date reste ;
//   · contenu changé      → la date du jour (Paris) ;
//   · page nouvelle       → sa date déclarée (publication ; `updated`/`date`
//                           pour un article), sinon le jour ;
//   · page disparue       → retirée du verrou.
// À commiter AVEC le contenu : tout build local (natif et OTA compris) refuse
// un verrou périmé, le build de Vercel l'avertit, et aucun n'écrit jamais de
// date lui-même (règle de l'arbre propre). ⛔ Toucher src/blog/*.md ou
// site/contenu = lancer ce geste dans le même commit (CLAUDE.md, AGENTS.md).
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { genererSite } from './build-site.mjs';
import { FICHIER_VERROU, lireVerrou } from './lib/dates.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const jetable = path.join(racine, 'build', 'site-dater');
await rm(jetable, { recursive: true, force: true });
const avant = lireVerrou(racine);
const { verrou, perimees } = await genererSite({ dossier: jetable, racine, mode: 'dater' });
await rm(jetable, { recursive: true, force: true });

const trie = { pages: Object.fromEntries(Object.entries(verrou.pages).sort(([a], [b]) => a.localeCompare(b))) };
await writeFile(path.join(racine, FICHIER_VERROU), JSON.stringify(trie, null, 2) + '\n');
const retirees = Object.keys(avant.pages).filter((c) => !verrou.pages[c]);
if (!perimees.length && !retirees.length) {
  console.log(`[site:dater] verrou à jour : ${Object.keys(trie.pages).length} pages, aucune date changée`);
} else {
  for (const l of perimees.filter((x) => verrou.pages[x.split(' ')[0]])) console.log(`[site:dater] daté : ${l} → ${verrou.pages[l.split(' ')[0]].maj}`);
  for (const c of retirees) console.log(`[site:dater] retiré du verrou : ${c}`);
  console.log(`[site:dater] ${FICHIER_VERROU} écrit — à commiter avec le contenu`);
}
