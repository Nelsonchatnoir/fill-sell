// (20/11/2026, cause commune prouvée — linda : Firebase 200 mais api.beebs.app/users/v3/me 404) BEEBS N'EST « CONNECTÉ » SUR
// LE CLOUD QUE SI BEEBS RECONNAÎT LE COMPTE. La lecture du compte (plateformes.js, « Me connecter ») ne regardait que la
// session Firebase (Google : accounts:lookup) : une identité Google SANS boutique Beebs passait pour connectée, puis chaque
// dépôt finissait « Vous devez être connecté pour ajouter un produit ». On exécute ici l'expression RÉELLE, avec un faux
// navigateur (IndexedDB, cookie, fetch).
import fs from 'node:fs';
import { expressionLectureCompte, verdictLectureCompte } from '../serveur-cloud/src/plateformes.js';

let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`); } };

const expr = expressionLectureCompte('beebs');
async function lire({ beebs = 200, lookup = 200, utilisateur = true } = {}) {
  const appels = [];
  const authUser = utilisateur ? { uid: 'u1', isAnonymous: false, apiKey: 'CLE', stsTokenManager: { accessToken: 'JETON' } } : null;
  const fauxIdb = {
    open: () => { const q = {}; setTimeout(() => {
      q.result = { objectStoreNames: { contains: () => true }, close() {},
        transaction: () => ({ objectStore: () => ({ getAll: () => { const g = {}; setTimeout(() => { g.result = authUser ? [{ fbase_key: 'firebase:authUser:CLE:[DEFAULT]', value: authUser }] : []; g.onsuccess?.(); }); return g; } }) }) };
      q.onsuccess?.(); }); return q; },
  };
  const g = {
    location: { protocol: 'https:', hostname: 'www.beebs.app', pathname: '/fr' },
    indexedDB: fauxIdb,
    document: { cookie: 'axeptio_cookies=1; datadome=DDID; access_token=X' },
    AbortSignal: { timeout: () => undefined },
    fetch: async (url, o = {}) => {
      appels.push({ url: String(url), entetes: Object.keys(o.headers ?? {}) });
      if (String(url).startsWith('https://identitytoolkit.googleapis.com/')) return { status: lookup, ok: lookup === 200, json: async () => ({ users: [{ localId: 'u1' }] }) };
      if (String(url) === 'https://api.beebs.app/users/v3/me') return { status: beebs, ok: beebs === 200, json: async () => ({}) };
      return { status: 404, ok: false, json: async () => ({}) };
    },
  };
  const f = new Function(...Object.keys(g), `return ${expr};`);
  const lu = await f(...Object.values(g));
  return { lu, v: verdictLectureCompte(lu), appels };
}

console.log('1. La lecture du compte Beebs');
let r = await lire({ beebs: 200 });
ok(r.v.ok === true, 'session Google ET compte Beebs (users/v3/me 200) : connecté', JSON.stringify(r.lu));
const me = r.appels.find((a) => a.url === 'https://api.beebs.app/users/v3/me');
ok(me && me.entetes.includes('authorization') && me.entetes.includes('x-datadome-clientid'), 'Beebs est interrogé comme la page le fait (authorization + x-datadome-clientid)', JSON.stringify(me));
r = await lire({ beebs: 404 });
ok(r.v.ok === false && r.v.motif === 'sans_compte_plateforme', 'le cas de linda : Google 200, Beebs 404 → JAMAIS connecté, motif « sans boutique »', JSON.stringify(r.lu));
r = await lire({ beebs: 403 });
ok(r.v.ok === true, 'Beebs refuse pour une autre raison (DataDome 403) : la règle d\'avant (la session Google), jamais un faux « déconnecté »', JSON.stringify(r.lu));
r = await lire({ beebs: 200, utilisateur: false });
ok(r.v.ok === false && r.v.motif === 'sans_session' && !r.appels.some((a) => a.url.includes('api.beebs.app')), 'sans session Firebase : rien n\'est demandé à Beebs');
r = await lire({ lookup: 400 });
ok(r.v.ok === false && !r.appels.some((a) => a.url.includes('api.beebs.app')), 'session Google refusée par Google : non connecté (inchangé)');

console.log('2. Ce que lit la personne');
const cx = fs.readFileSync('serveur-cloud/src/connexion.js', 'utf8').replace(/\r\n/g, '\n');
ok(/sansComptePlateforme: \(nom\) => `Ce compte n'a pas de boutique \$\{nom\} : connecte-toi avec le compte \(e-mail, Google, Apple…\) de ta boutique \$\{nom\}\.`/.test(cx)
  && /v\.motif === 'sans_compte_plateforme' && txt\.sansComptePlateforme \? txt\.sansComptePlateforme\(def\.nom\) : txt\.etapes\(def\.nom\)/.test(cx),
  '« Ce compte n\'a pas de boutique Beebs : connecte-toi avec le compte de ta boutique » (FR et EN), jamais « termine les étapes »');

console.log(ko ? `✗ ${ko} échec(s) sur ${n}` : `✓ beebs-compte-cloud : ${n}/${n}`);
process.exit(ko ? 1 : 0);
