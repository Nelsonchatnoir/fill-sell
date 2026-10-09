import path from 'node:path';

// Branchement Vite du site vitrine statique (09/10/2026).
//
// Actif SEULEMENT si siteActif() (scripts/site/actif.mjs) — vite.config.js
// choisit ce plugin OU prerenderBlog, jamais les deux. Le générateur et ses
// dépendances (react-dom/server, react-markdown, rolldown, lightningcss) sont
// importés DANS le hook : un build natif, OTA ou le serveur de dev n'en
// chargent rien (revue A M5).
//
// Ordre : writeBundle `post`, placé APRÈS appShell dans la liste des plugins :
// la coquille Vite est déjà copiée en app-shell.html quand l'accueil statique
// prend la place d'index.html.
//
// ⛔ Jamais dans dist/ hors de Vercel (revue A M4, revue C I5) : dist/ est le
// dossier du natif (Capacitor webDir) et de l'OTA Capgo. Un build du site
// laissé là, puis une OTA envoyée, et l'app native démarrerait sur la page
// marketing (pas de notifyAppReady → retour arrière Capgo à chaque lancement).
// En local : `npm run site:apercu` (build/site-apercu). Pour forcer dist/ en
// connaissance de cause (déploiement --prebuilt) : FILLSELL_SITE_DIST=1.
export default function siteStatique() {
  let dossier = 'dist';
  let racine = process.cwd();
  return {
    name: 'fillsell-site-statique',
    apply: 'build',
    configResolved(config) {
      racine = config.root;
      dossier = path.resolve(config.root, config.build.outDir);
      const dansDist = dossier === path.resolve(config.root, 'dist');
      if (dansDist && !process.env.VERCEL && process.env.FILLSELL_SITE_DIST !== '1') {
        throw new Error(
          '\n⛔ [site] FILLSELL_SITE=1 vers dist/ hors de Vercel : REFUSÉ.\n' +
          '   dist/ est le dossier du natif et de l\'OTA — l\'app démarrerait sur la page marketing.\n' +
          '   → npm run site:apercu (sortie build/site-apercu), ou FILLSELL_SITE_DIST=1 en connaissance de cause.\n',
        );
      }
    },
    writeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        const { genererSite } = await import('./site/build-site.mjs');
        await genererSite({ dossier, racine });
      },
    },
  };
}

// CONTRÔLE DU SITE DANS LES BUILDS QUI NE LE GÉNÈRENT PAS (09/10/2026, revue
// de la fondation I-3 et app § 1 et 5) — natif, OTA, `npm run build`,
// `build:essai`. Le générateur ne tourne que dans le build Vercel : sans ce
// contrôle, un article de src/blog retouché sans `npm run site:dater`,
// une constante de src/lib/supabase.js changée de forme ou un marqueur
// site:balises retiré d'index.html laissaient le build local VERT et faisaient
// tomber le déploiement Vercel — et la prod restait sur l'ancien déploiement,
// correctif urgent compris. Le même rendu, dans un dossier jetable, en début
// de build (~1 s) : l'échec arrive ici, avant le push (scripts/site/controle.mjs).
// FILLSELL_SITE_CONTROLE=0 le saute, bruyamment (OTA d'urgence seulement).
export function controleSite() {
  let racine = process.cwd();
  return {
    name: 'fillsell-controle-site',
    apply: 'build',
    configResolved(config) {
      racine = config.root;
    },
    async buildStart() {
      if (process.env.FILLSELL_SITE_CONTROLE === '0') {
        console.warn('⚠️ [site] FILLSELL_SITE_CONTROLE=0 : contrôle du site vitrine SAUTÉ — le prochain déploiement Vercel peut le refuser.');
        return;
      }
      const { controlerSite } = await import('./site/controle.mjs');
      await controlerSite({ racine });
    },
  };
}
