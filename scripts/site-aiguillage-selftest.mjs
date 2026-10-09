// selftest:site-aiguillage — l'aiguillage EN LIGNE de l'accueil statique (09/10/2026).
//
// Joue la fonction source (site/js/aiguillage.js) avec un faux `window`, puis
// le bundle IIFE réellement injecté dans les pages (vm), sur les cas de la
// matrice de la revue A (§ 3) : 1-4, 18, 19, 21, le stockage qui lève, le
// garde anti-boucle, le retour par le cache avant/arrière.
//
// Cas OBLIGATOIRE (revue A I1, bug du 16/09) : /?code=x AVEC un jeton de
// session présent arrive sur /auth/confirm?code=x — jamais sur /app.
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aiguiller, aiguillerJeton, lireJeton, CLE_DEPARTS, CLASSE_DEPART, SECOURS_MS, FENETRE_DEPARTS_MS,
} from '../site/js/aiguillage.js';
import { bundler } from './site/lib/bundles.mjs';
import { constantesSupabase } from './site/lib/constantes-app.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { cleJeton } = constantesSupabase(racine);
let echecs = 0;
let passes = 0;
function ok(cond, message) {
  if (cond) { passes++; return; }
  echecs++;
  console.error(`  ✗ ${message}`);
}

const SESSION = JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1 });

function stockage(init = {}, leve = false) {
  const m = new Map(Object.entries(init));
  if (leve) {
    const boum = () => { throw new Error('SecurityError: stockage interdit'); };
    return { getItem: boum, setItem: boum, removeItem: boum, key: boum, get length() { return boum(); } };
  }
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _m: m,
  };
}

function faux({ search = '', hash = '', local = {}, session = {}, localLeve = false, sessionLeve = false, accesLocalLeve = false } = {}) {
  const remplacements = [];
  const minuteries = [];
  const ecouteurs = {};
  const classes = new Set();
  const ls = stockage(local, localLeve);
  const ss = stockage(session, sessionLeve);
  const w = {
    location: { pathname: '/', search, hash, replace: (u) => remplacements.push(u) },
    get localStorage() { if (accesLocalLeve) throw new Error('SecurityError'); return ls; },
    sessionStorage: ss,
    document: { documentElement: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } } },
    setTimeout: (fn, ms) => minuteries.push({ fn, ms }),
    addEventListener: (type, fn) => { (ecouteurs[type] ??= []).push(fn); },
  };
  return { w, remplacements, minuteries, ecouteurs, classes, ls, ss };
}

const T0 = 1_760_000_000_000;

// ── 1. Confirmation AVANT toute lecture de session ─────────────────────────
{
  const f = faux({ search: '?code=x', local: { [cleJeton]: SESSION } });
  const d = aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(d === 'confirmation' && f.remplacements.join() === '/auth/confirm?code=x', `?code= + jeton → /auth/confirm (reçu ${d}, ${f.remplacements})`);
  ok(!f.classes.has(CLASSE_DEPART), '?code= : la page n\'est pas masquée');
}
{
  const f = faux({ search: '?token_hash=abc&type=signup' });
  aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(f.remplacements.join() === '/auth/confirm?token_hash=abc&type=signup', `?token_hash= → /auth/confirm (reçu ${f.remplacements})`);
}
// ── 2. Fragment ou erreur d'auth → /login, fragment GARDÉ ──────────────────
{
  const f = faux({ hash: '#access_token=t&refresh_token=r&type=magiclink', local: { [cleJeton]: SESSION } });
  aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(f.remplacements.join() === '/login#access_token=t&refresh_token=r&type=magiclink', `#access_token= → /login + fragment (reçu ${f.remplacements})`);
}
{
  const f = faux({ search: '?error=access_denied&error_description=Email+link+is+invalid', hash: '#error=access_denied&error_description=x' });
  aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(f.remplacements.join() === '/login?error=access_denied&error_description=Email+link+is+invalid#error=access_denied&error_description=x',
    `lien expiré → /login + search + hash (reçu ${f.remplacements})`);
}
{
  const f = faux({ hash: '#error_description=expired' });
  aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(f.remplacements.join() === '/login#error_description=expired', '#error_description= seul → /login');
}
{
  const f = faux({ hash: '#comment-ca-marche' });
  aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(f.remplacements.length === 0, 'une ancre ordinaire ne déclenche rien');
}
// ── 3. Jeton de session → /app + search, page masquée, minuterie de secours ─
{
  const f = faux({ search: '?utm_source=tiktok', local: { [cleJeton]: SESSION } });
  const d = aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(d === 'app' && f.remplacements.join() === '/app?utm_source=tiktok', `jeton → /app + search (reçu ${f.remplacements})`);
  ok(f.classes.has(CLASSE_DEPART), 'départ : page masquée');
  const secours = f.minuteries.find((m) => m.ms === SECOURS_MS);
  ok(!!secours, `minuterie de secours de ${SECOURS_MS} ms posée`);
  secours?.fn();
  ok(!f.classes.has(CLASSE_DEPART), 'la minuterie de secours démasque la page');
  ok(JSON.parse(f.ss.getItem(CLE_DEPARTS)).length === 1, 'le départ est compté en sessionStorage');
}
{
  const f = faux({ local: { [cleJeton]: JSON.stringify({ access_token: 'a' }) } });
  aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(f.remplacements.length === 0, 'jeton SANS refresh_token : on reste');
}
{
  const f = faux({ local: { [`${cleJeton}-code-verifier`]: '"v"' } });
  aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(f.remplacements.length === 0, 'seul -code-verifier (PKCE en cours) : on reste');
}
{
  const f = faux({ local: { 'sb-autreprojet-auth-token': SESSION } });
  aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(f.remplacements.length === 0, 'jeton d\'un autre projet Supabase : ignoré (clé exacte)');
}
{
  const f = faux({ local: { [cleJeton]: '{pas du json' } });
  aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(f.remplacements.length === 0, 'jeton illisible : on reste, sans lever');
}
// ── Anti-boucle : au plus 2 départs en 20 s ─────────────────────────────────
{
  const f = faux({ local: { [cleJeton]: SESSION }, session: { [CLE_DEPARTS]: JSON.stringify([T0 - 5000, T0 - 1000]) } });
  const d = aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(d === null && f.remplacements.length === 0, 'troisième départ en 20 s : on reste');
  ok(!f.classes.has(CLASSE_DEPART), 'garde déclenché : page visible');
}
{
  const f = faux({ local: { [cleJeton]: SESSION }, session: { [CLE_DEPARTS]: JSON.stringify([T0 - FENETRE_DEPARTS_MS - 1, T0 - 1000]) } });
  aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(f.remplacements.join() === '/app', 'un départ vieux de plus de 20 s ne compte plus');
}
{
  const f = faux({ local: { [cleJeton]: SESSION }, sessionLeve: true });
  aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(f.remplacements.join() === '/app', 'sessionStorage qui LÈVE : on part quand même');
}
{
  const f = faux({ local: { [cleJeton]: SESSION }, localLeve: true });
  const d = aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(d === null && f.remplacements.length === 0 && !f.classes.has(CLASSE_DEPART), 'localStorage qui lève (cas 21) : page affichée, rien ne casse');
}
{
  const f = faux({ local: { [cleJeton]: SESSION }, accesLocalLeve: true });
  let leve = false;
  try { aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 }); } catch { leve = true; }
  ok(!leve && f.remplacements.length === 0, 'accès à window.localStorage interdit (cookies bloqués) : rien ne lève');
}
// ── Étapes 1-3 sur « / » seulement ─────────────────────────────────────────
{
  const f = faux({ search: '?code=x', hash: '#access_token=t', local: { [cleJeton]: SESSION } });
  const d = aiguiller(f.w, { racine: false, cleJeton, maintenant: T0 });
  ok(d === null && f.remplacements.length === 0, 'page vitrine hors « / » : aucun aiguillage');
}
// ── Retour par le cache avant/arrière (pageshow persisté) ──────────────────
{
  const f = faux();
  aiguiller(f.w, { racine: true, cleJeton, maintenant: T0 });
  ok(f.remplacements.length === 0 && (f.ecouteurs.pageshow?.length ?? 0) === 1, 'déconnecté : on reste, pageshow écouté');
  f.ls.setItem(cleJeton, SESSION); // connexion faite sur /login, puis retour arrière
  f.ecouteurs.pageshow[0]({ persisted: false });
  ok(f.remplacements.length === 0, 'pageshow NON persisté : rien (le script s\'est rejoué normalement)');
  f.ecouteurs.pageshow[0]({ persisted: true });
  ok(f.remplacements.join() === '/app', 'pageshow persisté avec jeton : départ vers /app');
}
// ── lireJeton / aiguillerJeton isolés ───────────────────────────────────────
ok(lireJeton(null, cleJeton) === false, 'lireJeton sans stockage : faux');
ok(lireJeton(stockage({ [cleJeton]: SESSION }), cleJeton) === true, 'lireJeton avec refresh_token : vrai');
{
  const f = faux({ local: { [cleJeton]: SESSION } });
  ok(aiguillerJeton(f.w, { cleJeton, maintenant: T0 }) === 'app', 'aiguillerJeton seul : départ');
}

// ── Captures sur toutes les pages (mêmes modules que l'app) ────────────────
{
  const f = faux({ search: '?offre=fillsell50&utm_source=google&utm_campaign=seo' });
  f.w.location.hostname = 'fillsell.app';
  const avant = Object.getOwnPropertyDescriptors(globalThis);
  const poser = (nom, valeur) => Object.defineProperty(globalThis, nom, { value: valeur, configurable: true, writable: true });
  poser('window', f.w);
  poser('localStorage', f.ls);
  poser('document', { referrer: 'https://www.google.com/search?q=x' });
  try {
    aiguiller(f.w, { racine: false, cleJeton, maintenant: T0 });
  } finally {
    for (const nom of ['window', 'localStorage', 'document']) {
      if (avant[nom]) Object.defineProperty(globalThis, nom, avant[nom]); else delete globalThis[nom];
    }
  }
  const offre = JSON.parse(f.ls.getItem('fs_offre_mail') ?? 'null');
  const acq = JSON.parse(f.ls.getItem('fs_acq') ?? 'null');
  ok(offre?.code === 'FILLSELL50', `capterOffre a tourné (fs_offre_mail = ${JSON.stringify(offre)})`);
  ok(acq?.source === 'google' && acq?.campaign === 'seo' && acq?.referrer === 'https://www.google.com', `capterSource a tourné (fs_acq = ${JSON.stringify(acq)})`);
}

// ── Le bundle IIFE réellement injecté dans les pages ───────────────────────
const code = await bundler(path.join(racine, 'site', 'js', 'aiguillage-lancement.js'), { racine, define: { __FS_CLE_JETON__: cleJeton } });
ok(code.includes(cleJeton) && !code.includes(`${cleJeton}-code-verifier`), 'le bundle porte la clé EXACTE du jeton');
ok(!code.includes('</script'), 'le bundle peut être mis en ligne (aucun « </script »)');
ok(code.length < 4000, `bundle en ligne compact (${code.length} caractères)`);
function jouerBundle({ search = '', hash = '', local = {}, racinePage = true }) {
  const f = faux({ search, hash, local });
  const contexte = {
    ...f.w,
    location: f.w.location,
    localStorage: f.ls,
    sessionStorage: f.ss,
    document: { ...f.w.document, referrer: '', currentScript: { getAttribute: (n) => (n === 'data-racine' && racinePage ? '1' : null) } },
    URLSearchParams, JSON, Date, URL, console,
  };
  contexte.window = contexte;
  vm.runInNewContext(code, contexte);
  return f;
}
{
  const f = jouerBundle({ search: '?code=x', local: { [cleJeton]: SESSION } });
  ok(f.remplacements.join() === '/auth/confirm?code=x', `bundle : ?code= + jeton → /auth/confirm (reçu ${f.remplacements})`);
}
{
  // Classe « js » posée par le script EN LIGNE, avant la première peinture :
  // la CSS ne replie le menu mobile qu'avec elle (revue de la fondation I-8).
  const f = jouerBundle({ racinePage: false });
  ok(f.classes.has('js'), 'bundle : classe « js » posée sur <html> (menu mobile replié seulement avec JS)');
}
{
  const f = jouerBundle({ local: { [cleJeton]: SESSION } });
  ok(f.remplacements.join() === '/app', `bundle : jeton → /app (reçu ${f.remplacements})`);
}
{
  const f = jouerBundle({ local: { [cleJeton]: SESSION }, racinePage: false });
  ok(f.remplacements.length === 0, 'bundle hors « / » (pas de data-racine) : aucun aiguillage');
}
{
  const f = jouerBundle({ search: '?offre=FILLSELL50' });
  ok(JSON.parse(f.ls.getItem('fs_offre_mail') ?? 'null')?.code === 'FILLSELL50', 'bundle : capture de l\'offre');
  ok(!!f.ls.getItem('fs_acq'), 'bundle : capture de la source');
}

console.log(`selftest:site-aiguillage — ${passes} vérifications passées, ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
