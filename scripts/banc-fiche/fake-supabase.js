// Banc de mesure (31/10) — faux client Supabase : lit /donnees.json (export du compte de Nico), démultiplie le stock
// (?n=2900), n'écrit RIEN et n'appelle aucun serveur. Les filtres usuels de PostgREST sont rejoués en mémoire.
export const supabaseUrl = 'https://banc.invalid';
export const supabaseAnonKey = 'banc';

const xhr = new XMLHttpRequest();
xhr.open('GET', '/donnees.json', false);
xhr.send(null);
const D = JSON.parse(xhr.responseText);
const UID = D.profiles[0].id;
const N = Number(new URLSearchParams(location.search).get('n') || sessionStorage.getItem('banc_n') || 0);
if (N) sessionStorage.setItem('banc_n', String(N));

// Démultiplication : chaque fiche en stock est copiée (nouvel id), ses jobs aussi (nouvel id, même forme).
(function multiplier() {
  const base = D.inventaire.filter((i) => i.statut === 'stock' && i.fusionne_dans == null);
  if (!N || !base.length) return;
  const jobsPar = new Map();
  for (const j of D.cross_post_jobs) { const k = String(j.inventaire_id); if (!jobsPar.has(k)) jobsPar.set(k, []); jobsPar.get(k).push(j); }
  let k = 0;
  while (D.inventaire.filter((i) => i.statut === 'stock').length < N) {
    k++;
    for (const i of base) {
      const id = Number(i.id) + k * 1_000_000_000;
      const t = new Date(Date.parse(i.created_at || i.date || '2026-10-01') - k * 3600_000).toISOString();
      D.inventaire.push({ ...i, id, created_at: t, titre: `${i.titre} #${k}` });
      for (const j of jobsPar.get(String(i.id)) ?? []) {
        D.cross_post_jobs.push({ ...j, id: crypto.randomUUID(), inventaire_id: id });
      }
      if (D.inventaire.filter((x) => x.statut === 'stock').length >= N) break;
    }
  }
})();
window.__banc = { stock: D.inventaire.filter((i) => i.statut === 'stock').length, jobs: D.cross_post_jobs.length };

const lire = (row, chemin) => {
  // "a->b->>c" : JSON pointé
  const m = chemin.split(/->>?/);
  let v = row?.[m[0]];
  for (const p of m.slice(1)) v = v == null ? null : v[p.replace(/'/g, '')];
  return v;
};
const projeter = (row, select) => {
  if (!select || select.trim() === '*' || /\(/.test(select)) return row;
  const out = {};
  for (const brut of select.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (brut === '*') { Object.assign(out, row); continue; }
    const [alias, chemin] = brut.includes(':') ? brut.split(':') : [brut.split(/->>?/).pop(), brut];
    out[alias.trim()] = lire(row, chemin.trim());
  }
  return out;
};
const egal = (a, b) => String(a) === String(b);

function requete(table) {
  const etat = { filtres: [], ordres: [], select: '*', limite: null, unique: null, tete: false, compte: false, ecriture: null, ou: false, plage: null };
  const lignes = () => {
    if (etat.ecriture) return [];
    let r = (D[table] ?? []).slice();
    for (const f of etat.filtres) r = r.filter(f);
    for (const o of etat.ordres.slice().reverse()) {
      r.sort((a, b) => { const x = a[o.col], y = b[o.col]; if (x == y) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : 1) * (o.asc ? 1 : -1); });
    }
    if (etat.limite != null) r = r.slice(0, etat.limite);
    if (etat.plage) r = r.slice(etat.plage[0], etat.plage[1] + 1);
    return r.map((x) => projeter(x, etat.select));
  };
  const resultat = () => {
    const r = lignes();
    if (etat.tete) return { data: null, error: null, count: r.length };
    if (etat.unique === 'single') return r.length ? { data: r[0], error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } };
    if (etat.unique === 'maybe') return { data: r[0] ?? null, error: null };
    return { data: r, error: null, count: etat.compte ? r.length : null };
  };
  const q = new Proxy({}, {
    get(_, nom) {
      if (nom === 'then') return (ok, ko) => Promise.resolve(resultat()).then(ok, ko);
      if (nom === 'catch') return (ko) => Promise.resolve(resultat()).catch(ko);
      if (nom === 'finally') return (f) => Promise.resolve(resultat()).finally(f);
      return (...a) => {
        switch (nom) {
          case 'select': etat.select = a[0] ?? '*'; if (a[1]?.head) etat.tete = true; if (a[1]?.count) etat.compte = true; break;
          case 'insert': case 'update': case 'upsert': case 'delete': etat.ecriture = nom; break;
          case 'eq': etat.filtres.push((r) => egal(lire(r, a[0]), a[1])); break;
          case 'neq': etat.filtres.push((r) => !egal(lire(r, a[0]), a[1])); break;
          case 'in': etat.filtres.push((r) => (a[1] ?? []).some((v) => egal(lire(r, a[0]), v))); break;
          case 'is': etat.filtres.push((r) => (a[1] === null ? lire(r, a[0]) == null : lire(r, a[0]) === a[1])); break;
          case 'gt': etat.filtres.push((r) => lire(r, a[0]) != null && lire(r, a[0]) > a[1]); break;
          case 'gte': etat.filtres.push((r) => lire(r, a[0]) != null && lire(r, a[0]) >= a[1]); break;
          case 'lt': etat.filtres.push((r) => lire(r, a[0]) != null && lire(r, a[0]) < a[1]); break;
          case 'lte': etat.filtres.push((r) => lire(r, a[0]) != null && lire(r, a[0]) <= a[1]); break;
          case 'not': if (a[1] === 'is' && a[2] === null) etat.filtres.push((r) => lire(r, a[0]) != null); break;
          case 'or': {
            // Clé de page de lireToutesPagesRecentsDabord (filtreApresCle) ; tout autre .or() : sans effet.
            const m = /created_at\.lt\."([^"]+)",and\(created_at\.eq\."[^"]+",id\.lt\.([^)]+)\)/.exec(a[0] ?? '');
            const n = /and\(created_at\.is\.null,id\.lt\.([^)]+)\),created_at\.not\.is\.null/.exec(a[0] ?? '');
            if (m) etat.filtres.push((r) => r.created_at != null && (Date.parse(r.created_at) < Date.parse(m[1]) || (Date.parse(r.created_at) === Date.parse(m[1]) && Number(r.id) < Number(m[2]))));
            else if (n) etat.filtres.push((r) => r.created_at != null || Number(r.id) < Number(n[1]));
            break;
          }
          case 'order': etat.ordres.push({ col: a[0], asc: a[1]?.ascending !== false }); break;
          case 'limit': etat.limite = a[0]; break;
          case 'range': etat.plage = [a[0], a[1]]; break;
          case 'single': etat.unique = 'single'; break;
          case 'maybeSingle': etat.unique = 'maybe'; break;
          default: break; // contains, ilike, filter, abortSignal… : sans effet
        }
        return q;
      };
    },
  });
  return q;
}

const session = { access_token: 'banc', refresh_token: 'banc', expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: UID, email: 'banc@banc.invalid', created_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {} } };
const canal = () => { const c = { on: () => c, subscribe: (cb) => { try { cb?.('SUBSCRIBED'); } catch { /* */ } return c; }, unsubscribe: () => Promise.resolve('ok'), send: () => Promise.resolve('ok') }; return c; };

export const supabase = {
  from: requete,
  rpc: () => { const p = Promise.resolve({ data: null, error: null }); return Object.assign(p, { maybeSingle: () => p, single: () => p, select: () => p, abortSignal: () => p }); },
  channel: canal,
  removeChannel: () => Promise.resolve('ok'),
  removeAllChannels: () => Promise.resolve([]),
  functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: p } }), createSignedUrl: (p) => Promise.resolve({ data: { signedUrl: p }, error: null }), createSignedUrls: (ps) => Promise.resolve({ data: ps.map((p) => ({ path: p, signedUrl: p })), error: null }), upload: () => Promise.resolve({ data: null, error: { message: 'banc' } }) }) },
  auth: {
    getSession: () => Promise.resolve({ data: { session }, error: null }),
    getUser: () => Promise.resolve({ data: { user: session.user }, error: null }),
    refreshSession: () => Promise.resolve({ data: { session }, error: null }),
    onAuthStateChange: (cb) => { setTimeout(() => cb('INITIAL_SESSION', session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: () => Promise.resolve({ error: null }),
    setSession: () => Promise.resolve({ data: { session }, error: null }),
    exchangeCodeForSession: () => Promise.resolve({ data: { session }, error: null }),
    startAutoRefresh: () => {}, stopAutoRefresh: () => {},
  },
};
export default supabase;
