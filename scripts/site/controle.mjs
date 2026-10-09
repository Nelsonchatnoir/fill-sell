import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { genererSite } from './build-site.mjs';
import { HTML_PUBLIC_PERMIS } from './routes-app.mjs';

// Contrôle du site vitrine dans les builds qui ne le génèrent pas (09/10/2026,
// plugin controleSite de scripts/vite-plugin-site.mjs).
//
// Rejoue le générateur en mode « controle », dans un dossier jetable du
// système (jamais dans l'arbre : règle de l'arbre propre), et refuse :
//   · un verrou des dates périmé (contenu du site ou du blog changé sans
//     `npm run site:dater`) — sur Vercel, un avertissement seulement ;
//   · ce que le build Vercel lit PAR MOTIF dans les fichiers de l'app :
//     supabaseUrl / supabaseAnonKey de src/lib/supabase.js, marqueurs
//     site:balises:* et JSON-LD d'index.html — tout changement de forme fait
//     échouer CE build, en local, au lieu du déploiement ;
//   · le contenu de démonstration sur la branche main (la production le refuse) ;
//   · une page HTML de public/ que la liste HTML_PUBLIC_PERMIS ne nomme pas.

/** Les fichiers .html de public/ (chemins relatifs, en « / »). */
export function htmlDePublic(racine) {
  const base = path.join(racine, 'public');
  const sortie = [];
  const parcourir = (d) => {
    for (const nom of existsSync(d) ? readdirSync(d) : []) {
      const p = path.join(d, nom);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (nom.endsWith('.html')) sortie.push(path.relative(base, p).split(path.sep).join('/'));
    }
  };
  parcourir(base);
  return sortie;
}

export async function controlerSite({ racine, journal = console, env = process.env }) {
  const t0 = performance.now();
  const permis = new Set(HTML_PUBLIC_PERMIS.map((h) => h.fichier));
  const intrus = htmlDePublic(racine).filter((f) => !permis.has(f));
  if (intrus.length) {
    throw new Error(
      `\n⛔ [site] page(s) HTML dans public/ : ${intrus.join(', ')}\n` +
      '   site:verifier les refuserait sur Vercel (aucun marqueur fillsell-page) : nomme-les, avec leur raison,\n' +
      '   dans HTML_PUBLIC_PERMIS (scripts/site/routes-app.mjs) — ou retire-les.\n',
    );
  }
  const temp = mkdtempSync(path.join(os.tmpdir(), 'fillsell-site-controle-'));
  let resultat;
  try {
    resultat = await genererSite({ dossier: temp, racine, mode: 'controle', journal, env });
  } catch (e) {
    throw new Error(`\n⛔ [site] contrôle du site vitrine (ce build ne le génère pas, mais Vercel le fera) :\n${e.message}\n`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  const duree = Math.round(performance.now() - t0);
  journal.log(`[site] contrôle du site vitrine : ${resultat.pages.length} pages rendues, verrou des dates ${resultat.perimees.length ? 'PÉRIMÉ (avertissement Vercel)' : 'à jour'}, ${duree} ms`);
  return resultat;
}
