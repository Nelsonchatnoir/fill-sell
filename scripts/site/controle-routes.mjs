import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROUTES_APP, COQUILLE, routeAppPour, sourceVersRegex } from './routes-app.mjs';
import { lirePagesSite, lireArticlesBlog } from './lib/contenu.mjs';
import { CODES_LANGUES, cheminDans } from '../../site/langues.mjs';

// LA LISTE FERMÉE DES ROUTES, CONTRÔLÉE DANS TOUS LES BUILDS (09/10/2026,
// revue de la fondation, app § 2).
//
// Avant le site statique, vercel.json réécrivait TOUT vers la coquille : une
// route ajoutée à AppRouter.jsx marchait d'office. Désormais, un chemin absent
// de vercel.json répond 404. Quatre routes ajoutées en cinq semaines
// (/ebay/retour 05/09, /desinscription 13/09, /auth/confirm 16/09, /demo 01/10),
// toutes ouvertes par un lien PROFOND (mail, eBay, Supabase) — la navigation
// interne de la SPA, elle, continuerait de marcher : aucun test à la main ne
// le verrait. D'où ce contrôle, joué par le plugin appShell au DÉBUT de chaque
// build (natif, OTA, Vercel) et par selftest:site-routes-app :
//   1. chaque <Route path> d'AppRouter.jsx est servie (route de l'app ou page
//      du site) ;
//   2. chaque URL du site écrite dans src/, supabase/functions/ et
//      chrome-extension/ (lecture seule) est servie (route de l'app, page du
//      site, fichier ou dossier de public/, fichier généré) ;
//   3. les rewrites de vercel.json sont EXACTEMENT ROUTES_APP, toutes vers la
//      coquille, sans attrape-tout.
// Lecture de ~1 000 fichiers sources, ~0,2 s. Aucun réseau.

const GENERES = new Set(['/sitemap.xml', '/robots.txt', '/llms.txt', '/llms-full.txt', '/apple-touch-icon-precomposed.png', '/build.json', '/fillsell-extension.zip', '/404.html', '/app-shell.html']);

function fichiers(dossier, extensions, sortie = []) {
  if (!existsSync(dossier)) return sortie;
  for (const nom of readdirSync(dossier)) {
    if (nom === 'node_modules' || nom.startsWith('.')) continue;
    const p = path.join(dossier, nom);
    if (statSync(p).isDirectory()) fichiers(p, extensions, sortie);
    else if (extensions.some((e) => nom.endsWith(e))) sortie.push(p);
  }
  return sortie;
}

/** Les URL du site écrites dans le code : Map chemin → premier fichier qui l'écrit. */
export function urlsEcritesDansLeCode(racine) {
  const sources = [
    ...fichiers(path.join(racine, 'supabase', 'functions'), ['.ts', '.js']),
    ...fichiers(path.join(racine, 'chrome-extension'), ['.js']),
    ...fichiers(path.join(racine, 'src'), ['.js', '.jsx']),
  ];
  const trouvees = new Map();
  const noter = (chemin, fichier) => {
    const propre = chemin.replace(/[?#].*$/, '').replace(/\.$/, '') || '/';
    if (!trouvees.has(propre)) trouvees.set(propre, path.relative(racine, fichier).split(path.sep).join('/'));
  };
  for (const f of sources) {
    const texte = readFileSync(f, 'utf8');
    // URL absolues du site (mails, Stripe, extension…).
    for (const m of texte.matchAll(/https:\/\/fillsell\.app(\/[A-Za-z0-9_./-]*)?/g)) {
      if (/\$\{/.test(texte.slice(m.index + m[0].length, m.index + m[0].length + 2))) continue; // gabarit : …/email/${fichier}
      noter(m[1] ?? '/', f);
    }
    // URL composées sur NOTRE origine (OAuth web, eBay, logos) — pas dans
    // l'extension, où `location.origin` est celle de Vinted ou de Leboncoin.
    if (!f.includes(`${path.sep}chrome-extension${path.sep}`)) {
      for (const m of texte.matchAll(/(?:origin|ORIGIN)\}(\/[a-z][a-z0-9/_.-]*)/g)) noter(m[1], f);
    }
    // Navigations de la SPA (un rechargement les redemande au serveur).
    if (f.includes(`${path.sep}src${path.sep}`)) {
      for (const m of texte.matchAll(/(?:navigate|nav)\(\s*["'`](\/[a-z][a-z0-9/_-]*)/g)) noter(m[1], f);
      for (const m of texte.matchAll(/<Navigate\s+to=["'](\/[a-z][a-z0-9/_-]*)/g)) noter(m[1], f);
      for (const m of texte.matchAll(/window\.location\.(?:href|assign|replace)\s*(?:=|\()\s*["'`](\/[a-z][a-z0-9/_-]*)/g)) noter(m[1], f);
    }
  }
  return trouvees;
}

/** Les <Route path> d'AppRouter.jsx (hors « * »). */
export function routesReact(racine, source = null) {
  const routeur = source ?? readFileSync(path.join(racine, 'src', 'router', 'AppRouter.jsx'), 'utf8');
  return [...routeur.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*');
}

/**
 * Rend { erreurs, trouvees, routes } ; `erreurs` vide = la liste fermée couvre
 * l'app, le code et vercel.json. `essai` (selftest seulement) : { vercel,
 * routeur } remplacent vercel.json et le source d'AppRouter.jsx, pour prouver
 * qu'un oubli est bien refusé.
 */
export async function controlerRoutesApp(racine, essai = {}) {
  const erreurs = [];
  const pagesSite = (await lirePagesSite(racine)).filter((p) => !p.brouillon);
  const articles = await lireArticlesBlog(racine);
  const cheminsSite = new Set([...pagesSite.map((p) => p.chemin), ...CODES_LANGUES.map((c) => cheminDans(c, 'blog')), ...articles.map((a) => `/blog/${a.slug}`)]);
  const dansPublic = (chemin, dossier) => {
    const f = path.join(racine, 'public', ...chemin.split('/').filter(Boolean));
    return chemin !== '/' && existsSync(f) && (dossier ? statSync(f).isDirectory() : statSync(f).isFile());
  };
  // Un DOSSIER de public/ compte aussi : « https://fillsell.app/email » est la
  // base des logos des mails (`${BASE_LOGOS}/${fichier}`), servis un par un.
  const servi = (chemin) => cheminsSite.has(chemin) || !!routeAppPour(chemin) || dansPublic(chemin, false) || dansPublic(chemin, true) || GENERES.has(chemin);

  const routes = routesReact(racine, essai.routeur);
  if (routes.length < 10) erreurs.push(`AppRouter.jsx : ${routes.length} routes lues, au moins 10 attendues (le relevé a-t-il régressé ?)`);
  for (const r of routes) {
    const exemple = r.replace(/:[A-Za-z_]+/g, 'exemple');
    if (r !== '/' && !servi(exemple)) erreurs.push(`route React ${r} : aucune route de l'app ni page du site ne la sert — ajoute-la à scripts/site/routes-app.mjs ET aux rewrites de vercel.json`);
    else if (r !== '/' && !r.startsWith('/blog') && !(routeAppPour(exemple) && !routeAppPour(exemple).partagee)) {
      erreurs.push(`route React ${r} absente de la liste fermée (scripts/site/routes-app.mjs + rewrites de vercel.json)`);
    }
  }

  const trouvees = urlsEcritesDansLeCode(racine);
  for (const [chemin, fichier] of trouvees) {
    if (!servi(chemin)) erreurs.push(`${chemin} (écrite dans ${fichier}) répondrait 404 : ni route de l'app, ni page du site, ni fichier public — ajoute-la à routes-app.mjs ET à vercel.json`);
  }

  const vercel = essai.vercel ?? JSON.parse(readFileSync(path.join(racine, 'vercel.json'), 'utf8'));
  const rewrites = vercel.rewrites ?? [];
  const sourcesRewrites = rewrites.map((r) => r.source).sort();
  const sourcesListe = ROUTES_APP.map((r) => r.source).sort();
  for (const s of sourcesListe.filter((x) => !sourcesRewrites.includes(x))) erreurs.push(`vercel.json : rewrite manquante pour ${s} (routes-app.mjs la déclare) — elle répondrait 404`);
  for (const s of sourcesRewrites.filter((x) => !sourcesListe.includes(x))) erreurs.push(`vercel.json : rewrite ${s} absente de routes-app.mjs (la liste fermée doit la nommer, avec qui l'ouvre)`);
  for (const r of rewrites.filter((x) => x.destination !== COQUILLE)) erreurs.push(`vercel.json : rewrite ${r.source} → ${r.destination}, ${COQUILLE} attendu`);
  for (const inconnu of ['/nimporte-quoi', '/pricing', '/fr', '/assets/site/absent.js']) {
    if (rewrites.some((r) => sourceVersRegex(r.source).test(inconnu))) erreurs.push(`vercel.json : ${inconnu} tomberait sur la coquille (attrape-tout ?) — une adresse inconnue doit répondre 404`);
  }
  return { erreurs, trouvees, routes };
}
