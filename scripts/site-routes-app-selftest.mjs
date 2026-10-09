// selftest:site-routes-app — la liste FERMÉE des routes de l'app (09/10/2026).
//
// Depuis le site statique, vercel.json ne réécrit plus TOUT vers la coquille :
// seules les routes de scripts/site/routes-app.mjs y vont, le reste tombe en
// 404. Une route oubliée = un lien de mail, un retour Stripe ou eBay, un
// bouton de l'extension qui répond 404. Ce test prouve, sans réseau :
//   1. chaque <Route path> d'AppRouter.jsx est servie (route de l'app ou page
//      du site) ;
//   2. chaque URL du site écrite dans supabase/functions/, chrome-extension/
//      (lecture) et src/ est servie (route de l'app, page du site ou fichier
//      de public/) ;
//   3. vercel.json réécrit EXACTEMENT ces routes vers /app-shell.html, aucun
//      attrape-tout, et pose X-Robots-Tag sur les routes privées seulement ;
//   4. aucune page vitrine ne tombe sur un chemin réservé.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES_APP, COQUILLE, cheminReserve, sourceVersRegex } from './site/routes-app.mjs';
import { lirePagesSite } from './site/lib/contenu.mjs';
import { controlerRoutesApp } from './site/controle-routes.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
let passes = 0;
function ok(cond, message) {
  if (cond) { passes++; return; }
  echecs++;
  console.error(`  ✗ ${message}`);
}

// 1-2. AppRouter.jsx et URL écrites dans le code : le MÊME contrôle que celui
// que le plugin appShell joue au début de chaque build (09/10,
// scripts/site/controle-routes.mjs) — le selftest le rejoue et le met à l'épreuve.
const pagesSite = (await lirePagesSite(racine)).filter((p) => !p.brouillon);
const { erreurs: erreursRoutes, trouvees, routes: routesReactLues } = await controlerRoutesApp(racine);
for (const e of erreursRoutes) ok(false, e);
ok(routesReactLues.length >= 10, `AppRouter.jsx lu (${routesReactLues.length} routes)`);
ok(trouvees.size >= 8, `URL du site relevées dans le code (${trouvees.size})`);
if (process.argv.includes('--liste')) {
  for (const [chemin, fichier] of [...trouvees].sort()) console.log(`  ${chemin.padEnd(28)} ${fichier}`);
}
for (const attendu of ['/extension', '/legal', '/success', '/cancel', '/reset-password', '/auth', '/app', '/auth/confirm', '/desinscription', '/auth/callback', '/ebay/retour']) {
  ok(trouvees.has(attendu), `URL attendue non relevée dans le code : ${attendu} (le relevé a-t-il régressé ?)`);
}
// Le contrôle des builds REFUSE bien un oubli (vercel.json et AppRouter.jsx
// remplacés en mémoire, rien n'est écrit) : une rewrite retirée, une route
// React ajoutée sans rewrite, un attrape-tout.
{
  const v = JSON.parse(readFileSync(path.join(racine, 'vercel.json'), 'utf8'));
  const sansEbay = { ...v, rewrites: v.rewrites.filter((r) => r.source !== '/ebay/(.*)') };
  const r1 = await controlerRoutesApp(racine, { vercel: sansEbay });
  ok(r1.erreurs.some((e) => e.includes('/ebay/(.*)')), `rewrite /ebay/(.*) retirée de vercel.json : le contrôle des builds la nomme (${r1.erreurs.join(' | ')})`);
  const routeur = readFileSync(path.join(racine, 'src', 'router', 'AppRouter.jsx'), 'utf8')
    .replace('<Route path="/success"', '<Route path="/parrainage/:code" element={null} />\n        <Route path="/success"');
  const r2 = await controlerRoutesApp(racine, { routeur });
  ok(r2.erreurs.some((e) => e.includes('/parrainage/:code')), `route React /parrainage/:code sans rewrite : le contrôle des builds la nomme (${r2.erreurs.join(' | ')})`);
  const attrapeTout = { ...v, rewrites: [...v.rewrites, { source: '/((?!api/|assets/).*)', destination: '/app-shell.html' }] };
  const r3 = await controlerRoutesApp(racine, { vercel: attrapeTout });
  ok(r3.erreurs.some((e) => e.includes('attrape-tout')), 'attrape-tout ajouté à vercel.json : refusé');
}

// ── 3. vercel.json ──────────────────────────────────────────────────────────
const vercel = JSON.parse(readFileSync(path.join(racine, 'vercel.json'), 'utf8'));
ok(vercel.buildCommand === 'npm run build:vercel', `buildCommand = « npm run build:vercel » (reçu ${vercel.buildCommand})`);
ok(vercel.trailingSlash === false, 'trailingSlash: false (une seule forme d\'URL)');
ok(!('cleanUrls' in vercel), 'cleanUrls absent (la destination /app-shell.html deviendrait fausse, revue A M8)');
const rewrites = vercel.rewrites ?? [];
const sourcesRewrites = rewrites.map((r) => r.source).sort();
const sourcesListe = ROUTES_APP.map((r) => r.source).sort();
ok(JSON.stringify(sourcesRewrites) === JSON.stringify(sourcesListe), `rewrites de vercel.json ≠ routes-app.mjs\n      vercel.json : ${sourcesRewrites.join(' ')}\n      liste       : ${sourcesListe.join(' ')}`);
ok(rewrites.every((r) => r.destination === COQUILLE), `toutes les rewrites visent ${COQUILLE}`);
for (const inconnu of ['/nimporte-quoi', '/pricing', '/tarifs-inexistants', '/fr', '/assets/site/absent.js']) {
  ok(!rewrites.some((r) => sourceVersRegex(r.source).test(inconnu)), `${inconnu} ne doit pas tomber sur la coquille (attrape-tout ?)`);
}
const robotsPour = (chemin) => {
  let valeur = null;
  for (const h of vercel.headers ?? []) {
    if (!sourceVersRegex(h.source).test(chemin)) continue;
    for (const e of h.headers) if (e.key.toLowerCase() === 'x-robots-tag') valeur = e.value;
  }
  return valeur;
};
const EXEMPLES = { '/auth/(.*)': '/auth/confirm', '/ebay/(.*)': '/ebay/retour', '/demo/(.*)': '/demo/barre-progression', '/app/(.*)': '/app/x', '/blog/(.*)': '/blog/x' };
for (const r of ROUTES_APP) {
  const exemple = EXEMPLES[r.source] ?? r.source;
  const tag = robotsPour(exemple);
  if (r.noindex) ok(tag?.startsWith('noindex'), `${exemple} : route privée sans en-tête X-Robots-Tag noindex`);
  else ok(!tag?.includes('noindex'), `${exemple} : noindex posé sur une route INDEXABLE (${tag})`);
}
ok(robotsPour('/auth/callback')?.startsWith('noindex'), '/auth/callback garde son noindex (règle existante)');
for (const vitrine of ['/', '/faq', '/en', '/blog/cross-listing-vinted-leboncoin']) ok(robotsPour(vitrine) === null, `${vitrine} : aucun X-Robots-Tag`);
const reglesLlms = (vercel.headers ?? []).filter((h) => sourceVersRegex(h.source).test('/llms-full.txt')).flatMap((h) => h.headers);
ok(reglesLlms.some((e) => e.key === 'Content-Type' && e.value.startsWith('text/plain')), '/llms-full.txt servi en text/plain');
ok(robotsPour('/llms.txt') === 'noindex', '/llms.txt : X-Robots-Tag noindex');
ok(sourceVersRegex('/(llms|llms-full)\\.txt').test('/llms.txt') && !sourceVersRegex('/(llms|llms-full)\\.txt').test('/llmsXtxt'), 'motif \\. : point littéral');
const cache = (chemin) => {
  let v = null;
  for (const h of vercel.headers ?? []) {
    if (!sourceVersRegex(h.source).test(chemin)) continue;
    for (const e of h.headers) if (e.key === 'Cache-Control') v = e.value;
  }
  return v;
};
// /assets/site/* : une heure, comme l'app, tant que la prévisualisation n'a pas
// prouvé qu'un 404 n'emporte pas l'en-tête (revue de la fondation I-8).
ok(cache('/assets/site/site.0123456789.js') === 'public, max-age=3600, must-revalidate', `/assets/site/* : public, max-age=3600, must-revalidate (reçu ${cache('/assets/site/site.0123456789.js')})`);
ok(robotsPour('/app-shell.html') === 'noindex', '/app-shell.html servi en direct : X-Robots-Tag noindex');
for (const r of ['/legal', '/extension', '/app']) ok(robotsPour(r) === null, `${r} (réécrit vers /app-shell.html) : aucun X-Robots-Tag — l'en-tête suit le chemin DEMANDÉ`);
ok(cache('/assets/index-abc.js') === 'public, max-age=3600, must-revalidate', '/assets/* de l\'app : règle inchangée (3600, must-revalidate)');
for (const r of [{ source: '/terms', destination: '/legal' }, { source: '/privacy', destination: '/legal' }]) {
  ok((vercel.redirects ?? []).some((x) => x.source === r.source && x.destination === r.destination), `redirection ${r.source} → ${r.destination} gardée`);
}

// ── 4. Chemins réservés ─────────────────────────────────────────────────────
for (const p of pagesSite) ok(!cheminReserve(p.chemin), `${p.fichier} : ${p.chemin} recoupe l'app (${cheminReserve(p.chemin)})`);
for (const [chemin, reserve] of [
  ['/extension', true], ['/legal', true], ['/login', true], ['/auth/confirm', true], ['/ebay/x', true], ['/demo/y', true],
  ['/app-shell.html', true], ['/build.json', true], ['/assets/x', true], ['/app', true],
  ['/blog/x', false], ['/faq', false], ['/crosslisting/vinted-vers-leboncoin', false], ['/en/faq', false], ['/applications', false],
]) {
  ok(!!cheminReserve(chemin) === reserve, `cheminReserve(${chemin}) devrait être ${reserve ? 'réservé' : 'libre'}`);
}

console.log(`selftest:site-routes-app — ${passes} vérifications passées, ${echecs} échec(s) ; ${trouvees.size} URL relevées dans le code`);
process.exit(echecs ? 1 : 0);
