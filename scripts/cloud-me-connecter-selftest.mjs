// Autotest du bouton « Connecter mes plateformes » (01/11/2026, iPhone de Nico : le bouton ne faisait RIEN, sans trace).
// Cause : l'écran « Me connecter » était rendu dans `.app-root`, sous la page Réglages (portail sur document.body,
// z-index 400) ; sous iOS, WKWebView peint les couches fixes de `.app-root` dans sa couche, z-index ou pas.
//   1. Les couches Cloud qu'on ouvre depuis Réglages vivent sur document.body (portail), comme les réglages eux-mêmes ;
//   2. « Me connecter » ne s'ouvre QUE par ouvrirMeConnecter (App) : le clic est tracé, un écran non monté aussi ;
//   3. l'écran trace son ouverture, s'il est vraiment devant, ses erreurs et la fin de chaque connexion (usage_logs) ;
//   4. auPremierPlan (traceCloud.js) reconnaît un écran caché par une autre couche.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

console.log('1. Les couches Cloud ouvertes depuis Réglages : un portail sur document.body');
const reglages = lire('src/reglages/ReglagesUI.jsx');
ok(/return createPortal\(/.test(reglages) && /zIndex: 400/.test(reglages), 'la page Réglages est un portail sur body, au plan 400 (la cause)');
for (const f of ['src/cloud/MeConnecterCloud.jsx', 'src/cloud/ConditionsCloudModale.jsx', 'src/cloud/FinEssaiCloud.jsx']) {
  const t = lire(f);
  const portail = (/return createPortal\(/.test(t) && /\n\s*document\.body,?\n\s*\);/.test(t))
    || /return typeof document === 'undefined' \? couche : createPortal\(couche, document\.body\);/.test(t);
  ok(/import \{ createPortal \} from 'react-dom';/.test(t) && portail, `${f} : rendu par createPortal(…, document.body)`);
}

console.log('\n2. « Me connecter » ne s\'ouvre que par ouvrirMeConnecter, qui trace le clic');
const app = lire('src/App.jsx');
ok((app.match(/setMeConnecterOuvert\(true\)/g) ?? []).length === 1, 'un seul setMeConnecterOuvert(true) dans App : celui de ouvrirMeConnecter');
const fn = app.slice(app.indexOf('function ouvrirMeConnecter(origine){'), app.indexOf('function ouvrirMeConnecter(origine){') + 400);
ok(/logTunnel\('cloud_me_connecter_clic',\{origine\}\);\s*setMeConnecterOuvert\(true\);/.test(fn), 'le clic est tracé AVANT l\'ouverture (usage_logs « cloud_me_connecter_clic »)');
ok(/document\.querySelector\('\[data-cloud-me-connecter\]'\)\)logTunnel\('cloud_me_connecter_muet'/.test(fn), 'écran non monté 1,5 s après : « cloud_me_connecter_muet »');
ok(/meConnecter:\(\)=>ouvrirMeConnecter\('reglages'\)/.test(app) && /onReconnecter=\{\(\)=>ouvrirMeConnecter\('bandeau'\)\}/.test(app) && /ouvrirMeConnecter\('achat'\)/.test(app),
  'Réglages, bandeau et achat passent tous par ouvrirMeConnecter (avec leur origine)');

console.log('\n3. L\'écran trace son ouverture, sa visibilité, ses erreurs, la fin de chaque connexion');
const me = lire('src/cloud/MeConnecterCloud.jsx');
ok(/data-cloud-me-connecter=""/.test(me), 'l\'écran se reconnaît (data-cloud-me-connecter)');
for (const trace of ['cloud_me_connecter_ouvert', 'cloud_me_connecter_cache', 'cloud_me_connecter_erreur', 'cloud_connexion_ouverte', 'cloud_connexion_fin']) {
  ok(me.includes(`'${trace}'`), `trace « ${trace} »`);
}

console.log('\n4. auPremierPlan : un écran caché par une autre couche est reconnu');
const { auPremierPlan } = await import('../src/cloud/traceCloud.js').catch(async () => {
  // traceCloud importe le client Supabase de l'app : on relit la fonction pure seule.
  const src = lire('src/cloud/traceCloud.js');
  const corps = src.slice(src.indexOf('export function auPremierPlan'));
  return { auPremierPlan: new Function(`${corps.replace('export function', 'function')}; return auPremierPlan;`)() };
});
const noeud = (tag, parent = null, attrs = {}) => {
  const e = { tagName: tag.toUpperCase(), parentElement: parent, className: attrs.className ?? '', getAttribute: (k) => attrs[k] ?? null, enfants: [] };
  e.contains = (x) => { for (let y = x; y; y = y.parentElement) if (y === e) return true; return false; };
  return e;
};
const body = noeud('body');
const ecran = noeud('div', body, { role: 'dialog', 'aria-label': 'Me connecter' });
const bouton = noeud('button', ecran);
const reglagesCouche = noeud('div', body, { role: 'dialog', className: 'rg-ecran', 'aria-label': 'Abonnement' });
const carte = noeud('div', reglagesCouche);
const docAvec = (el) => ({ body, defaultView: { innerWidth: 390, innerHeight: 844 }, elementFromPoint: () => el });
ok(auPremierPlan(ecran, docAvec(bouton)).visible === true, 'au centre, un élément de l\'écran : visible');
const cache = auPremierPlan(ecran, docAvec(carte));
ok(cache.visible === false && /rg-ecran/.test(cache.devant), `au centre, la page Réglages : caché, et ce qui est devant est dit (${cache.devant})`);
ok(auPremierPlan(null, docAvec(bouton)).visible === false, 'écran absent : jamais « visible »');

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
