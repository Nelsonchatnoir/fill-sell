// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — un FAUX client Supabase, sans réseau (03/10/2026, refonte du Stock)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Le harnais du Stock (stock-refonte.jsx) le
// substitue à src/lib/supabase.js (vite-stock-refonte.config.mjs) :
//   · les LECTURES servent window.__FIXTURE.tables — les données réelles d'un
//     compte, relues en lecture seule et posées dans build/ (ignoré par git) ;
//   · les ÉCRITURES (insert, update, upsert, delete) sont JOURNALISÉES et
//     REFUSÉES : rien ne part, rien ne s'écrit, nulle part ;
//   · les RPC rendent window.__FIXTURE.rpc[nom] (une valeur ou une fonction),
//     les fonctions Edge une erreur — aucune n'est appelée ;
//   · l'URL est une adresse morte : un fetch direct échoue au lieu de toucher
//     la prod.
// Les filtres PostgREST que l'app emploie sont rejoués (eq, neq, in, is, not,
// gt/gte/lt/lte, like/ilike, contains, or, ->> ), avec order, range et limit.
export const supabaseUrl = 'http://127.0.0.1:9/faux-supabase';
export const supabaseAnonKey = 'faux';

const journal = () => (window.__supabaseJournal ||= []);
const fixture = () => window.__FIXTURE || { tables: {}, rpc: {} };

// ── Lire une colonne, y compris « platform_fields->>republish_step » ───────
function lireCol(row, col) {
  const m = String(col).match(/^([\w]+)((?:->>?[\w]+)+)$/);
  if (!m) return row?.[col];
  let v = row?.[m[1]];
  const pas = m[2].match(/->>?[\w]+/g) || [];
  pas.forEach((p, i) => {
    const cle = p.replace(/^->>?/, '');
    v = v == null ? undefined : (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return undefined; } })() : v)?.[cle];
    if (i === pas.length - 1 && p.startsWith('->>') && v != null && typeof v !== 'string') v = typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
  return v;
}
// == null : null ET undefined comptent pour « pas de valeur », comme en SQL.
const egalLache = (a, b) => (a == null || b == null ? a == b : String(a) === String(b));
const nombre = (v) => (v == null || v === '' ? NaN : (typeof v === 'number' ? v : (Number.isFinite(Number(v)) ? Number(v) : Date.parse(v))));
const comparer = (a, b) => {
  const na = nombre(a); const nb = nombre(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b));
};
const motif = (p, i) => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*') + '$', i ? 'i' : '');
const listePg = (v) => (Array.isArray(v) ? v : String(v).replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')));

function tester(row, op, col, val) {
  const v = lireCol(row, col);
  switch (op) {
    case 'eq': return egalLache(v, val);
    case 'neq': return !egalLache(v, val);
    case 'in': return listePg(val).some((x) => egalLache(v, x));
    case 'is': return val === null || val === 'null' ? v == null : (val === true || val === 'true' ? v === true : (val === false || val === 'false' ? v === false : v == null));
    case 'gt': return v != null && comparer(v, val) > 0;
    case 'gte': return v != null && comparer(v, val) >= 0;
    case 'lt': return v != null && comparer(v, val) < 0;
    case 'lte': return v != null && comparer(v, val) <= 0;
    case 'like': return v != null && motif(val, false).test(String(v));
    case 'ilike': return v != null && motif(val, true).test(String(v));
    case 'contains': {
      if (Array.isArray(v)) return listePg(val).every((x) => v.some((y) => egalLache(y, x)));
      if (v && typeof v === 'object' && val && typeof val === 'object') return Object.entries(val).every(([k, x]) => egalLache(v[k], x));
      return false;
    }
    default: return true;
  }
}

// « a.is.null,b.eq.x,c.not.in.(h,d) » → une liste de [négation, op, col, val]
function lireOu(expr) {
  const parts = [];
  let prof = 0; let cur = '';
  for (const ch of String(expr)) {
    if (ch === '(') prof++;
    if (ch === ')') prof--;
    if (ch === ',' && prof === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts.map((p) => {
    const m = p.match(/^([\w>-]+?)\.(not\.)?(eq|neq|in|is|gt|gte|lt|lte|like|ilike)\.(.*)$/);
    if (!m) return null;
    const val = m[4] === 'null' ? null : m[4];
    return [!!m[2], m[3], m[1], val];
  }).filter(Boolean);
}

class Requete {
  constructor(table) {
    this.table = table; this.op = 'select'; this.filtres = []; this.ou = []; this.ordres = [];
    this.borne = null; this.unique = null; this.tete = false;
  }
  select(_cols, opts) { if (opts?.head) this.tete = true; return this; }
  insert(v) { this.op = 'insert'; this.valeurs = v; return this; }
  upsert(v) { this.op = 'upsert'; this.valeurs = v; return this; }
  update(v) { this.op = 'update'; this.valeurs = v; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filtres.push([false, 'eq', c, v]); return this; }
  neq(c, v) { this.filtres.push([false, 'neq', c, v]); return this; }
  in(c, v) { this.filtres.push([false, 'in', c, v]); return this; }
  is(c, v) { this.filtres.push([false, 'is', c, v]); return this; }
  gt(c, v) { this.filtres.push([false, 'gt', c, v]); return this; }
  gte(c, v) { this.filtres.push([false, 'gte', c, v]); return this; }
  lt(c, v) { this.filtres.push([false, 'lt', c, v]); return this; }
  lte(c, v) { this.filtres.push([false, 'lte', c, v]); return this; }
  like(c, v) { this.filtres.push([false, 'like', c, v]); return this; }
  ilike(c, v) { this.filtres.push([false, 'ilike', c, v]); return this; }
  contains(c, v) { this.filtres.push([false, 'contains', c, v]); return this; }
  not(c, op, v) { this.filtres.push([true, op, c, v === 'null' ? null : v]); return this; }
  filter(c, op, v) { const neg = String(op).startsWith('not.'); this.filtres.push([neg, String(op).replace(/^not\./, ''), c, v]); return this; }
  match(obj) { for (const [c, v] of Object.entries(obj || {})) this.eq(c, v); return this; }
  or(expr) { this.ou.push(lireOu(expr)); return this; }
  order(c, o = {}) { this.ordres.push([c, o.ascending !== false, o.nullsFirst]); return this; }
  range(a, b) { this.borne = [a, b]; return this; }
  limit(n) { this.borne = [0, n - 1]; return this; }
  single() { this.unique = 'single'; return this; }
  maybeSingle() { this.unique = 'maybe'; return this; }
  abortSignal() { return this; }
  returns() { return this; }
  throwOnError() { return this; }
  then(ok, ko) { return this.executer().then(ok, ko); }
  catch(ko) { return this.executer().catch(ko); }
  finally(f) { return this.executer().finally(f); }
  async executer() {
    journal().push({ table: this.table, op: this.op, filtres: this.filtres.map((f) => f.join(' ')) });
    if (this.op !== 'select') {
      (window.__ecrituresRefusees ||= []).push({ table: this.table, op: this.op, valeurs: this.valeurs ?? null, filtres: this.filtres.map((f) => f.join(' ')) });
      return { data: null, error: { message: 'aperçu : écriture refusée (aucune base)', code: 'APERCU' }, count: null, status: 403, statusText: 'aperçu' };
    }
    let rows = (fixture().tables?.[this.table] ?? []).slice();
    rows = rows.filter((r) => this.filtres.every(([neg, op, c, v]) => (neg ? !tester(r, op, c, v) : tester(r, op, c, v))));
    for (const groupe of this.ou) rows = rows.filter((r) => groupe.some(([neg, op, c, v]) => (neg ? !tester(r, op, c, v) : tester(r, op, c, v))));
    const indexes = new Map(rows.map((r, i) => [r, i]));
    rows.sort((a, b) => {
      for (const [c, asc, nullsFirst] of this.ordres) {
        const va = lireCol(a, c); const vb = lireCol(b, c);
        if (va == null && vb == null) continue;
        if (va == null) return (nullsFirst ?? !asc) ? -1 : 1;
        if (vb == null) return (nullsFirst ?? !asc) ? 1 : -1;
        const d = comparer(va, vb);
        if (d) return asc ? d : -d;
      }
      return indexes.get(a) - indexes.get(b);
    });
    const count = rows.length;
    if (this.borne) rows = rows.slice(this.borne[0], this.borne[1] + 1);
    if (this.tete) return { data: null, error: null, count };
    if (this.unique) {
      if (!rows.length) return this.unique === 'single' ? { data: null, error: { code: 'PGRST116', message: '0 rows' } } : { data: null, error: null };
      return { data: structuredClone(rows[0]), error: null };
    }
    return { data: structuredClone(rows), error: null, count };
  }
}

const canal = () => {
  const c = { on: () => c, subscribe: (cb) => { try { cb?.('SUBSCRIBED'); } catch { /* rien */ } return c; }, unsubscribe: async () => 'ok', send: async () => 'ok' };
  return c;
};

const utilisateur = () => fixture().utilisateur ?? { id: '00000000-0000-0000-0000-000000000000', email: 'apercu@fillsell.app' };
const session = () => ({ access_token: 'faux', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: utilisateur() });

export const supabase = {
  from: (table) => new Requete(table),
  rpc: async (nom, args) => {
    journal().push({ rpc: nom, args: args ?? null });
    const r = fixture().rpc?.[nom];
    if (typeof r === 'function') return r(args);
    if (r === undefined) return { data: null, error: { message: `aperçu : RPC ${nom} non servie`, code: 'APERCU' } };
    return { data: structuredClone(r), error: null };
  },
  functions: {
    invoke: async (nom) => { journal().push({ fonction: nom }); return { data: null, error: { message: `aperçu : fonction ${nom} non appelée` } }; },
  },
  channel: () => canal(),
  removeChannel: async () => 'ok',
  removeAllChannels: async () => [],
  getChannels: () => [],
  auth: {
    getSession: async () => ({ data: { session: session() }, error: null }),
    getUser: async () => ({ data: { user: utilisateur() }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    refreshSession: async () => ({ data: { session: session() }, error: null }),
    signOut: async () => ({ error: null }),
  },
  storage: {
    from: () => ({
      getPublicUrl: (p) => ({ data: { publicUrl: String(p ?? '') } }),
      upload: async () => ({ data: null, error: { message: 'aperçu' } }),
      remove: async () => ({ data: null, error: { message: 'aperçu' } }),
      list: async () => ({ data: [], error: null }),
      createSignedUrl: async () => ({ data: null, error: { message: 'aperçu' } }),
    }),
  },
};
