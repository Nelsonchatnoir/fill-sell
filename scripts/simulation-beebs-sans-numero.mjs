// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION EN LECTURE SEULE — ce que le juge « dépôt Beebs sans numéro » FERMERAIT aujourd'hui (05/11, point 6 a)
// ═══════════════════════════════════════════════════════════════════════════
// La règle (handler-watch, jugerBeebsDepotsSansNumero ; _shared/beebs-depot-sans-numero.js) est COUPÉE
// (JUGER_BEEBS_SANS_NUMERO = false) : Nico l'allume après avoir vu cette simulation. Ce script rejoue le VRAI code du
// juge — la fonction extraite de handler-watch/index.ts et transpilée, avec les vrais modules partagés — sur les
// VRAIES données de la prod, page par page (comme le cron), sans rien écrire :
//  · chaque lecture du juge (même table, mêmes filtres, même ordre, mêmes pages, plafond PostgREST de 1 000 lignes)
//    est traduite en un SELECT envoyé par `npx supabase db query --linked --read-only` (transaction en lecture seule) ;
//  · chaque écriture (fermeture, remboursement) est seulement NOTÉE, jamais envoyée.
// Sortie : compte, fiche, titre, dépôt, relevés, puis les attentes par motif, et le total.
//
//   node scripts/simulation-beebs-sans-numero.mjs [--json <fichier>]
// Les dates affichées sont à l'heure de Paris.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as moduleSansNumero from '../supabase/functions/_shared/beebs-depot-sans-numero.js';
import { archiverErreur } from '../supabase/functions/_shared/erreurs-archivees.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HANDLER_WATCH = path.join(RACINE, 'supabase/functions/handler-watch/index.ts');
const MAX_ROWS = 1000; // PostgREST coupe à 1 000 lignes sans erreur

// ── Lecture de la prod : SELECT seulement, transaction en lecture seule ─────────────────────────────────────────────
let numero = 0;
async function lireProd(sql) {
  if (!/^\s*SELECT\s/i.test(sql) || /;\s*\S/.test(sql.trim().replace(/;\s*$/, ''))) throw new Error('lecture seule : un seul SELECT part');
  const f = path.join(os.tmpdir(), `simulation-beebs-sans-numero-${process.pid}-${numero++}.sql`);
  try {
    fs.writeFileSync(f, sql);
    for (let essai = 1; ; essai++) {
      try {
        const sortie = await new Promise((res, rej) => {
          const p = spawn(`npx supabase db query --linked --read-only -f "${f}" -o json`, { cwd: RACINE, shell: true });
          const out = []; const err = [];
          p.stdout.on('data', (d) => out.push(d)); p.stderr.on('data', (d) => err.push(d));
          p.on('close', (code) => (code === 0 ? res(Buffer.concat(out).toString('utf8'))
            : rej(new Error(`lecture refusée (code ${code}) : ${Buffer.concat(err).toString('utf8').slice(-600)}`))));
        });
        return JSON.parse(sortie.slice(sortie.indexOf('{'))).rows?.[0]?.r ?? [];
      } catch (e) { if (essai >= 3) throw e; }
    }
  } finally { fs.rmSync(f, { force: true }); }
}

// ── Le client du juge : les appels PostgREST traduits en SELECT ; les écritures notées, jamais envoyées ─────────────
const nomSql = (c) => { if (!/^\w+$/.test(String(c))) throw new Error(`nom refusé : ${c}`); return `"${c}"`; };
const litteral = (v) => (v === null || v === undefined ? 'NULL'
  : typeof v === 'number' && Number.isFinite(v) ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

class Requete {
  constructor(table, ctx) { this.table = table; this.ctx = ctx; this.cols = '*'; this.opts = {}; this.ou = []; this.egal = {}; this.tri = []; this.lim = null; this.plage = null; this.maj = null; }
  select(c = '*', opts = {}) { if (!this.maj) { this.cols = c; this.opts = opts ?? {}; } return this; }
  update(p) { this.maj = p; return this; }
  eq(c, v) { this.ou.push(`${nomSql(c)} = ${litteral(v)}`); this.egal[c] = v; return this; }
  in(c, l) { this.ou.push(l.length ? `${nomSql(c)} IN (${l.map(litteral).join(', ')})` : 'FALSE'); return this; }
  is(c, v) { if (v !== null) throw new Error(`is(${c}, ${v}) non géré`); this.ou.push(`${nomSql(c)} IS NULL`); this.egal[c] = null; return this; }
  lt(c, v) { this.ou.push(`${nomSql(c)} < ${litteral(v)}`); return this; }
  gte(c, v) { this.ou.push(`${nomSql(c)} >= ${litteral(v)}`); return this; }
  order(c, o = {}) { this.tri.push(`${nomSql(c)} ${o.ascending === false ? 'DESC' : 'ASC'}`); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.plage = [a, b]; return this; }
  then(ok, ko) { return this.executer().then(ok, ko); }
  where() { return this.ou.length ? ` WHERE ${this.ou.join(' AND ')}` : ''; }
  sql() {
    const cols = String(this.cols).trim() === '*' ? '*' : String(this.cols).split(',').map((c) => nomSql(c.trim())).join(', ');
    const n = Math.min(this.plage ? this.plage[1] - this.plage[0] + 1 : this.lim ?? MAX_ROWS, MAX_ROWS);
    return `SELECT coalesce(jsonb_agg(x ORDER BY n), '[]'::jsonb) AS r FROM (SELECT to_jsonb(t) AS x, row_number() OVER () AS n FROM (`
      + `SELECT ${cols} FROM public.${nomSql(this.table)}${this.where()}`
      + `${this.tri.length ? ` ORDER BY ${this.tri.join(', ')}` : ''} LIMIT ${n} OFFSET ${this.plage ? this.plage[0] : 0}) t) s;`;
  }
  async executer() {
    if (this.maj) { // JAMAIS envoyée : notée, et « réussie » pour que le juge compte comme en prod (compare-and-set)
      this.ctx.ecritures.push({ table: this.table, filtres: { ...this.egal }, patch: this.maj });
      return { data: this.egal.id != null ? [{ id: this.egal.id }] : [], error: null };
    }
    try {
      if (this.opts.head && this.opts.count) {
        const r = await lireProd(`SELECT jsonb_build_array(jsonb_build_object('n', count(*))) AS r FROM public.${nomSql(this.table)}${this.where()};`);
        return { data: null, count: Number(r?.[0]?.n ?? 0), error: null };
      }
      return { data: await lireProd(this.sql()), error: null };
    } catch (e) { return { data: null, error: { message: String(e?.message ?? e) } }; }
  }
}
export function clientLectureSeule(ctx) {
  return {
    from: (table) => new Requete(table, ctx),
    rpc: async (nom, args) => { ctx.ecritures.push({ rpc: nom, args }); return { data: null, error: null }; }, // jamais envoyé
  };
}

// ── Le VRAI juge : extrait de handler-watch/index.ts (lirePagesDisparues, parLots, jugerBeebsDepotsSansNumero) ─────
function morceau(src, debut, finMarque = '\n}\n') {
  const i = src.indexOf(debut);
  if (i < 0) throw new Error(`« ${debut} » introuvable dans handler-watch`);
  const f = src.indexOf(finMarque, i);
  return src.slice(i, f < 0 ? undefined : f + finMarque.length);
}
export function chargerJuge({ handlerTs = HANDLER_WATCH, journal = null } = {}) {
  const src = fs.readFileSync(handlerTs, 'utf8').replace(/\r\n/g, '\n');
  const consts = ['BEEBS_SANS_NUMERO_PAGE', 'BEEBS_SANS_NUMERO_FERMETURES_MAX'].map((k) => {
    const m = src.match(new RegExp(`\\nconst ${k} = (\\d+);`)); if (!m) throw new Error(`${k} introuvable`); return `const ${k} = ${m[1]};\n`;
  }).join('');
  const code = consts + morceau(src, 'async function lirePagesDisparues(')
    + morceau(src, 'const parLots = ', ';\n') + morceau(src, 'async function jugerBeebsDepotsSansNumero(');
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = { ...moduleSansNumero, archiverErreur };
  if (journal) {
    const juger = deps.jugerDepotBeebsSansNumero;
    deps.jugerDepotBeebsSansNumero = (job, ctx) => { const v = juger(job, ctx); journal.push({ job, v, nReleves: ctx.releves.length, nAnnonces: ctx.annonces.length }); return v; };
  }
  const noms = Object.keys(deps);
  return new Function(...noms, 'console', `${js}\nreturn jugerBeebsDepotsSansNumero;`)(...noms.map((k) => deps[k]), { log() {}, warn() {}, error() {} });
}

const paris = (v) => {
  const x = Date.parse(String(v ?? ''));
  return Number.isFinite(x) ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(x) : '—';
};
const court = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** Tout le parc, toutes les pages : { res[], journal, ecritures }. */
export async function simuler({ handlerTs } = {}) {
  const journal = []; const ctx = { ecritures: [] };
  const juge = chargerJuge({ handlerTs, journal });
  const r0 = await juge(clientLectureSeule(ctx), 0);
  const res = [r0];
  for (let p = 1; p < r0.pages; p++) res.push(await juge(clientLectureSeule(ctx), p));
  return { res, journal, ecritures: ctx.ecritures };
}

async function main() {
  const args = process.argv.slice(2);
  const json = args[args.indexOf('--json') + 1] && args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
  const lu = new Date().toISOString();
  console.log(`Simulation EN LECTURE SEULE du juge « dépôt Beebs sans numéro » — ${paris(lu)} (Paris)`);
  console.log(`Code : ${path.relative(RACINE, HANDLER_WATCH)} (jugerBeebsDepotsSansNumero, extrait tel quel) + _shared/beebs-depot-sans-numero.js`);
  console.log('Rien n\'est écrit : lectures par `supabase db query --linked --read-only`, écritures du juge seulement notées.\n');
  const { res, journal, ecritures } = await simuler();

  // Les fiches (statut, titre) et la réservation des dépôts : une lecture de plus, hors du juge.
  const fiches = [...new Set(journal.map((x) => x.job.inventaire_id).filter((x) => x != null).map(String))];
  const ficheDe = new Map();
  for (let i = 0; i < fiches.length; i += 150) {
    const lot = fiches.slice(i, i + 150);
    for (const f of await lireProd(`SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) AS r FROM (SELECT id, statut, titre FROM public.inventaire WHERE id IN (${lot.map(litteral).join(', ')})) t;`)) ficheDe.set(String(f.id), f);
  }
  const ids = journal.map((x) => x.job.id);
  const resaDe = new Map();
  for (let i = 0; i < ids.length; i += 150) {
    const lot = ids.slice(i, i + 150);
    for (const j of await lireProd(`SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) AS r FROM (SELECT id, reservation_id IS NOT NULL AS resa, EXISTS (SELECT 1 FROM public.coin_ledger l WHERE l.ref = 'refund_publish_unconfirmed:' || c.id::text) AS deja FROM public.cross_post_jobs c WHERE id IN (${lot.map(litteral).join(', ')})) t;`)) resaDe.set(String(j.id), j);
  }
  const fermees = journal.filter((x) => x.v?.verdict === 'jamais_en_ligne').map((x) => {
    const f = ficheDe.get(String(x.job.inventaire_id)) ?? null;
    const ecr = ecritures.find((e) => e.table === 'cross_post_jobs' && e.filtres.id === x.job.id && e.patch?.status === 'failed');
    const r = resaDe.get(String(x.job.id));
    return { job_id: x.job.id, user_id: x.job.user_id, action: x.job.action, inventaire_id: x.job.inventaire_id, statut_fiche: f?.statut ?? (x.job.inventaire_id == null ? 'fiche supprimée' : '?'),
      titre: x.job.title ?? f?.titre ?? null, prix: x.job.price, depot_le: x.v.depot_le, releves: x.v.releves, ecrit: Boolean(ecr), message: ecr?.patch?.error ?? null,
      rendue_si_allume: x.job.action === 'publish' && r?.resa && !r?.deja ? 'oui (réservation)' : x.job.action === 'publish' ? (r?.deja ? 'déjà rendue' : 'rien (sans réservation)') : 'non (republication)' };
  });
  const attentes = journal.filter((x) => x.v?.verdict === 'attente');
  const parMotif = attentes.reduce((m, x) => { m[x.v.motif] = (m[x.v.motif] ?? 0) + 1; return m; }, {});

  const candidats = res[0]?.candidats ?? 0;
  console.log(`Candidats (published, ni lien ni numéro, jamais vus en ligne, créés il y a plus de 7 jours) : ${candidats} — ${res.length} page(s) de 200`);
  console.log(`Jugés : ${journal.filter((x) => x.v).length} ; écritures notées : ${ecritures.filter((e) => e.table).length} fermeture(s), ${ecritures.filter((e) => e.rpc).length} appel(s) refund_publish_unconfirmed\n`);
  console.log(`FERMETURES (${fermees.length}) — compte · fiche (statut) · titre · prix · dépôt · relevés complets (Paris) · publication rendue ?`);
  for (const f of fermees.sort((a, b) => String(a.user_id).localeCompare(String(b.user_id)) || a.depot_le.localeCompare(b.depot_le))) {
    console.log(`  ${String(f.user_id).slice(0, 8)} · ${f.inventaire_id ?? '—'} (${f.statut_fiche}) · « ${court(f.titre, 44)} » · ${f.prix} € · ${f.action === 'republish' ? 'republié' : 'déposé'} ${paris(f.depot_le)}`
      + ` · ${f.releves.map((r) => `${paris(r.started_at)}${r.voit_tout_en_ligne ? '' : ' (index)'}`).join(' + ')} · ${f.rendue_si_allume} · job ${String(f.job_id).slice(0, 8)}${f.ecrit ? '' : ' · [passage suivant : plafond de 50]'}`);
  }
  const parCompte = (l) => Object.entries(l.reduce((m, f) => { const k = String(f.user_id ?? f.job?.user_id).slice(0, 8); m[k] = (m[k] ?? 0) + 1; return m; }, {})).map(([a, n]) => `${a} ${n}`).join(', ') || '—';
  console.log(`\nEN ATTENTE (${attentes.length}) par motif : ${Object.entries(parMotif).map(([m, n]) => `${m} ${n}`).join(', ') || '—'}`);
  for (const [m] of Object.entries(parMotif)) {
    const l = attentes.filter((x) => x.v.motif === m);
    console.log(`  · ${m} — ${parCompte(l.map((x) => x.job))}${l.some((x) => x.v.annonces?.length) ? ` — annonces : ${[...new Set(l.flatMap((x) => x.v.annonces ?? []))].slice(0, 12).join(', ')}` : ''}`);
  }
  const statuts = fermees.reduce((m, f) => { m[f.statut_fiche] = (m[f.statut_fiche] ?? 0) + 1; return m; }, {});
  const plafond = res.reduce((k, r) => k + (Number(r.attente?.plafond_du_passage) || 0), 0);
  console.log(`\nTOTAL : ${fermees.length} dépôt(s) Beebs sans numéro jugé(s) « jamais mis en ligne » (${fermees.filter((f) => f.ecrit).length} fermé(s) au premier passage, ${plafond} au suivant : plafond de 50 par passage) sur ${new Set(fermees.map((f) => f.user_id)).size} compte(s) — par compte : ${parCompte(fermees)} ;`
    + ` fiches : ${Object.entries(statuts).map(([s, n]) => `${s} ${n}`).join(', ') || '—'} ; publications rendues si allumé : ${fermees.filter((f) => f.rendue_si_allume.startsWith('oui')).length} ;`
    + ` relevés « index seulement » (la page n'a pas tout montré) : ${fermees.filter((f) => f.releves.some((r) => !r.voit_tout_en_ligne)).length}`);
  if (fermees[0]) console.log(`\nMessage (exemple, job ${String(fermees[0].job_id).slice(0, 8)}) : ${fermees[0].message}`);
  if (json) {
    fs.writeFileSync(json, JSON.stringify({ lu_le: lu, candidats, pages: res, fermees,
      attentes: attentes.map((x) => ({ job_id: x.job.id, user_id: x.job.user_id, action: x.job.action, inventaire_id: x.job.inventaire_id, titre: x.job.title, depot_le: x.job.published_at ?? x.job.created_at, ...x.v })) }, null, 2));
    console.log(`Relevé complet (JSON) : ${json}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
