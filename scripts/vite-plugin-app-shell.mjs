import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// La coquille de l'app, copiée dans TOUS les builds (09/10/2026, revue A B1).
//
// Depuis le site vitrine statique, vercel.json réécrit les routes de l'app
// (/app, /login, /auth/*, /success…) vers /app-shell.html, et non plus vers
// /index.html : dans un build du site, index.html EST l'accueil statique.
// Le piège relevé par la revue A : si ce fichier n'était écrit que par le
// générateur du site, un build où le générateur saute (variable absente,
// `vercel deploy --prebuilt`, commande de build changée) passerait READY et
// TOUS les liens profonds de l'app répondraient 404 — /auth/callback (Google,
// Apple), /success (Stripe), /desinscription (obligation légale), /extension…
// Seul « / » marcherait encore.
//
// D'où ce plugin, SÉPARÉ du générateur et toujours actif :
//   1. copie OCTET POUR OCTET dist/index.html → dist/app-shell.html. Aucune
//      retouche : useSeo (src/lib/seo.js) mute les balises existantes de la
//      coquille, un « nettoyage » ici casserait l'app (revue A § 5) ;
//   2. échec BRUYANT si la coquille n'en est pas une (<div id="root"></div> ou
//      l'entrée /assets/index-*.js absents) : jamais un rewrite vers du vide ;
//   3. échec si une destination de rewrite de vercel.json n'existe pas dans le
//      dossier de sortie — la même vérification protège tout rewrite futur ;
//   4. (09/10) AU DÉBUT du build, échec si la liste fermée des routes ne
//      couvre pas AppRouter.jsx et les URL écrites dans le code, ou diffère
//      des rewrites de vercel.json (verifierRoutesApp ci-dessous).
// Si le générateur saute, la sortie reste exactement celle d'aujourd'hui :
// index.html = coquille, app-shell.html = la même coquille, tout marche.
//
// Ordre : `writeBundle` + `order: 'post'` (jamais closeBundle, appelé aussi sur
// le chemin d'erreur — cf. vite-plugin-prerender-blog.mjs, 18/09), et placé
// AVANT le générateur dans la liste des plugins de vite.config.js : il copie la
// coquille Vite avant que l'accueil statique ne prenne sa place. Rolldown
// enchaîne les writeBundle l'un après l'autre (`sequential` est implicite chez
// lui, explicite ici pour Rollup).

export const MARQUEUR_RACINE = '<div id="root"></div>';
export const MOTIF_ENTREE = /\/assets\/index-[^"'\s]+\.js/;

/** Lève si `html` n'est pas la coquille Vite de l'app. */
export function verifierCoquille(html, nom) {
  if (!html.includes(MARQUEUR_RACINE)) {
    throw new Error(`[app-shell] ${nom} n'est pas la coquille de l'app : « ${MARQUEUR_RACINE} » introuvable`);
  }
  if (!MOTIF_ENTREE.test(html)) {
    throw new Error(`[app-shell] ${nom} n'est pas la coquille de l'app : aucune entrée /assets/index-*.js`);
  }
}

/** Lève si une destination de rewrite (locale) de vercel.json manque dans `dossier`. */
export function verifierDestinationsRewrites(dossier, racine = process.cwd()) {
  const vercel = JSON.parse(readFileSync(path.join(racine, 'vercel.json'), 'utf8'));
  for (const r of vercel.rewrites ?? []) {
    const dest = String(r.destination ?? '');
    if (!dest.startsWith('/')) continue; // destination externe : rien à trouver sur le disque
    const fichier = path.join(dossier, ...dest.split('?')[0].split('/').filter(Boolean));
    if (!existsSync(fichier)) {
      throw new Error(
        `[app-shell] vercel.json réécrit ${r.source} vers ${dest}, absent du dossier de sortie (${fichier}). ` +
        'Déployé tel quel, chaque URL concernée répondrait 404.',
      );
    }
  }
}

/**
 * La liste FERMÉE des routes couvre-t-elle l'app, le code et vercel.json ?
 * Joué au DÉBUT de chaque build (09/10, revue de la fondation, app § 2) : une
 * route ajoutée à AppRouter.jsx, ou une URL écrite dans un mail, une fonction
 * ou l'extension, sans son rewrite répondrait 404 en prod — refusé ici, en
 * local, en nommant la route, avant même le bundle.
 */
export async function verifierRoutesApp(racine) {
  const { controlerRoutesApp } = await import('./site/controle-routes.mjs');
  const { erreurs, trouvees } = await controlerRoutesApp(racine);
  if (erreurs.length) {
    throw new Error(
      `\n⛔ [app-shell] ROUTES DE L'APP non couvertes par vercel.json (${erreurs.length}) :\n` +
      erreurs.map((e) => `   · ${e}`).join('\n') +
      '\n   Depuis le site vitrine statique, vercel.json ne réécrit plus TOUT vers la coquille : une route absente répond 404.\n' +
      '   → scripts/site/routes-app.mjs ET les rewrites de vercel.json, même commit (docs/agents/site-vitrine.md).\n',
    );
  }
  return trouvees.size;
}

export default function appShell() {
  let dossier = 'dist';
  let racine = process.cwd();
  return {
    name: 'fillsell-app-shell',
    apply: 'build',
    configResolved(config) {
      racine = config.root;
      dossier = path.resolve(config.root, config.build.outDir);
    },
    async buildStart() {
      if (process.env.FILLSELL_SITE_CONTROLE === '0') {
        console.warn('⚠️ [app-shell] FILLSELL_SITE_CONTROLE=0 : contrôle des routes de l\'app SAUTÉ — une route sans rewrite répondrait 404 en prod.');
        return;
      }
      const n = await verifierRoutesApp(racine);
      console.log(`[app-shell] routes de l'app : liste fermée = rewrites de vercel.json, ${n} URL du code couvertes`);
    },
    writeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        const entree = path.join(dossier, 'index.html');
        if (!existsSync(entree)) {
          throw new Error(`[app-shell] ${entree} absent après l'écriture du bundle : la coquille de l'app ne peut pas être copiée`);
        }
        const octets = await readFile(entree);
        verifierCoquille(octets.toString('utf8'), 'index.html');
        await writeFile(path.join(dossier, 'app-shell.html'), octets);
        verifierDestinationsRewrites(dossier, racine);
        console.log(`[app-shell] app-shell.html écrit (${octets.length} o, copie de la coquille Vite)`);
      },
    },
  };
}
