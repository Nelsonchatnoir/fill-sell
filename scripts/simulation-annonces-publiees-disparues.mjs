// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION EN LECTURE SEULE — ce que le juge « annonce publiée confirmée disparue » FERMERAIT aujourd'hui (05/11)
// ═══════════════════════════════════════════════════════════════════════════
// La règle (handler-watch, jugerAnnoncesPublieesDisparues ; _shared/annonce-publiee-disparue.js) est COUPÉE en prod
// depuis l'incident du 05/11 16:33 (24 republications Vinted vivantes closes, jugées sur l'ANCIENNE annonce). Ce script
// rejoue le VRAI code du juge — la fonction extraite de handler-watch/index.ts et transpilée, avec les vrais modules
// partagés — sur les VRAIES données de la prod, tranche par tranche (0 à 15, comme le cron), sans rien écrire :
//  · chaque lecture du juge (même table, mêmes filtres, même ordre, même limite, plafond PostgREST de 1 000 lignes) est
//    traduite en un SELECT envoyé par `npx supabase db query --linked --read-only` (transaction en lecture seule) ;
//  · chaque écriture du juge (clôture, marqueur « en vérification ») est seulement NOTÉE, jamais envoyée.
// Sortie : compte, plateforme, action, annonce, titre, preuve (motif), dernière vue, et le total.
//
//   node scripts/simulation-annonces-publiees-disparues.mjs [--tranche N]… [--job <uuid>] [--json <fichier>]
//     --tranche N : une tranche (0 à 15 ; répétable) — par défaut les 16 ;
//     --job <uuid> : la seule candidate de ce job (filtre id ajouté à la lecture des candidates — le reste à l'identique) ;
//     --json <fichier> : le relevé complet en JSON (fermetures, marqueurs, décisions, compteurs).
// Les dates affichées sont à l'heure de Paris.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as moduleAnnonce from '../supabase/functions/_shared/annonce-publiee-disparue.js';
import * as moduleIntrouvable from '../supabase/functions/_shared/introuvable-a-confirmer.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HANDLER_WATCH = path.join(RACINE, 'supabase/functions/handler-watch/index.ts');
const MAX_ROWS = 1000; // PostgREST coupe à 1 000 lignes sans erreur (limit(5000) rend 1 000)
const SIMULTANEES = 6;

// ── Lecture de la prod : SELECT seulement, transaction en lecture seule ─────────────────────────────────────────────
let actives = 0; let numero = 0; const attente = [];
async function lireProd(sql) {
  if (!/^\s*SELECT\s/i.test(sql)) throw new Error('lecture seule : seul un SELECT part');
  while (actives >= SIMULTANEES) await new Promise((r) => attente.push(r));
  actives++;
  const f = path.join(os.tmpdir(), `simulation-disparues-${process.pid}-${numero++}.sql`);
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
        const i = sortie.indexOf('{');
        return JSON.parse(sortie.slice(i)).rows?.[0]?.r ?? [];
      } catch (e) { if (essai >= 3) throw e; }
    }
  } finally { fs.rmSync(f, { force: true }); actives--; attente.shift()?.(); }
}

// ── Le client du juge : les appels PostgREST traduits en SELECT ; les écritures notées, jamais envoyées ─────────────
const nomSql = (c) => { if (!/^\w+$/.test(String(c))) throw new Error(`nom refusé : ${c}`); return `"${c}"`; };
const colonne = (c) => { const m = /^(\w+)->>(\w+)$/.exec(String(c)); return m ? `${nomSql(m[1])}->>'${m[2]}'` : nomSql(c); };
const litteral = (v) => (v === null || v === undefined ? 'NULL'
  : typeof v === 'number' && Number.isFinite(v) ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

class Lecture {
  constructor(table, ctx) { this.table = table; this.ctx = ctx; this.cols = '*'; this.ou = []; this.egal = {}; this.tri = []; this.lim = null; this.plage = null; this.maj = null; }
  select(c = '*') { if (!this.maj) this.cols = c; return this; }
  update(p) { this.maj = p; return this; }
  eq(c, v) { this.ou.push(`${colonne(c)} = ${litteral(v)}`); this.egal[c] = v; return this; }
  in(c, l) { this.ou.push(l.length ? `${colonne(c)} IN (${l.map(litteral).join(', ')})` : 'FALSE'); return this; }
  not(c, op, v) { if (op !== 'is' || v !== null) throw new Error(`not(${c}, ${op}) non géré`); this.ou.push(`${colonne(c)} IS NOT NULL`); return this; }
  gt(c, v) { this.ou.push(`${colonne(c)} > ${litteral(v)}`); return this; }
  gte(c, v) { this.ou.push(`${colonne(c)} >= ${litteral(v)}`); return this; }
  lt(c, v) { this.ou.push(`${colonne(c)} < ${litteral(v)}`); return this; }
  order(c, o = {}) { this.tri.push(`${colonne(c)} ${o.ascending === false ? 'DESC' : 'ASC'}`); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.plage = [a, b]; return this; }
  then(ok, ko) { return this.executer().then(ok, ko); }
  sql() {
    const cols = String(this.cols).trim() === '*' ? '*' : String(this.cols).split(',').map((c) => nomSql(c.trim())).join(', ');
    const n = Math.min(this.plage ? this.plage[1] - this.plage[0] + 1 : this.lim ?? MAX_ROWS, MAX_ROWS);
    return `SELECT coalesce(jsonb_agg(x ORDER BY n), '[]'::jsonb) AS r FROM (SELECT to_jsonb(t) AS x, row_number() OVER () AS n FROM (`
      + `SELECT ${cols} FROM public.${nomSql(this.table)}${this.ou.length ? ` WHERE ${this.ou.join(' AND ')}` : ''}`
      + `${this.tri.length ? ` ORDER BY ${this.tri.join(', ')}` : ''} LIMIT ${n} OFFSET ${this.plage ? this.plage[0] : 0}) t) s;`;
  }
  async executer() {
    if (this.maj) { // JAMAIS envoyée : notée, et « réussie » pour que le juge compte comme en prod (compare-and-set)
      this.ctx.ecritures.push({ table: this.table, filtres: { ...this.egal }, patch: this.maj });
      return { data: this.egal.id != null ? [{ id: this.egal.id }] : [], error: null };
    }
    if (this.table === 'cross_post_jobs' && this.ctx.job) this.ou.push(`"id" = ${litteral(this.ctx.job)}`);
    try { return { data: await lireProd(this.sql()), error: null }; } catch (e) { return { data: null, error: { message: String(e?.message ?? e) } }; }
  }
}
export function clientLectureSeule(ctx) { return { from: (table) => new Lecture(table, ctx) }; }

// ── Le VRAI juge : extrait de handler-watch/index.ts (lirePagesDisparues → fin de jugerAnnoncesPublieesDisparues) ────
export function chargerJuge({ handlerTs = HANDLER_WATCH, modules = [moduleIntrouvable, moduleAnnonce], remplacer = {}, journal = null, console: cons = { log() {}, warn() {}, error() {} } } = {}) {
  const src = fs.readFileSync(handlerTs, 'utf8').replace(/\r\n/g, '\n');
  const debut = src.indexOf('async function lirePagesDisparues(');
  const tete = src.indexOf('async function jugerAnnoncesPublieesDisparues(');
  const fin = tete < 0 ? -1 : src.indexOf('\n}\n', tete);
  if (debut < 0 || tete < debut || fin < 0) throw new Error(`jugerAnnoncesPublieesDisparues introuvable dans ${handlerTs}`);
  const js = ts.transpileModule(src.slice(debut, fin + 3), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = Object.assign({}, ...modules, remplacer);
  if (journal) {
    const decider = deps.decisionAnnoncePubliee;
    deps.decisionAnnoncePubliee = (a) => { const d = decider(a); journal.push({ ...a, d }); return d; };
  }
  const noms = Object.keys(deps);
  return new Function(...noms, 'console', `${js}\nreturn jugerAnnoncesPublieesDisparues;`)(...noms.map((k) => deps[k]), cons);
}

/** Une tranche jugée en lecture seule : { tranche, res, journal (chaque décision et ses entrées), ecritures (notées) }. */
export async function simulerTranche(tranche, { job = null, handlerTs, modules, remplacer } = {}) {
  const journal = []; const ctx = { ecritures: [], job };
  const juge = chargerJuge({ handlerTs, modules, remplacer, journal });
  const res = await juge(clientLectureSeule(ctx), tranche);
  return { tranche, res, journal, ecritures: ctx.ecritures };
}

/** Les fermetures notées d'une tranche, avec leurs preuves. */
export function fermeturesDe({ journal, ecritures }) {
  return ecritures.filter((e) => e.table === 'cross_post_jobs' && e.patch?.status === 'cancelled').map((e) => {
    const j = journal.find((x) => String(x.job?.id) === String(e.filtres.id)) ?? {};
    const job = j.job ?? {};
    const trace = j.vu ? { le: j.vu.vu_le, statut: j.vu.statut } : j.annonce ? { le: j.annonce.vu_le, statut: j.annonce.statut_plateforme } : null;
    return {
      job_id: job.id, user_id: job.user_id, platform: job.platform, action: job.action,
      annonce: moduleAnnonce.identifiantAnnoncePubliee ? moduleAnnonce.identifiantAnnoncePubliee(job) : null,
      ancienne_pf: job.platform_fields?.vinted_item_id ?? null, url: job.listing_url, inventaire_id: job.inventaire_id ?? null,
      motif: e.patch.platform_fields?.annonce_disparue?.motif ?? j.d?.raison ?? null, vendue: Boolean(e.patch.platform_fields?.annonce_disparue?.vendue),
      derniere_vue: trace?.le ?? null, statut_derniere_vue: trace?.statut ?? null, publiee_le: j.creeLe ?? null, boutique: j.boutique ?? null,
      lecture_ratee_depuis: job.platform_fields?.check_unresolved_since ?? null,
    };
  });
}

const paris = (v) => {
  const x = Date.parse(String(v ?? ''));
  return Number.isFinite(x) ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(x) : '—';
};
const court = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

async function main() {
  const args = process.argv.slice(2);
  const valeurs = (k) => args.flatMap((a, i) => (a === k && args[i + 1] != null ? [args[i + 1]] : []));
  const tranches = valeurs('--tranche').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 15);
  const liste = tranches.length ? tranches : Array.from({ length: 16 }, (_, i) => i);
  const job = valeurs('--job')[0] ?? null;
  const json = valeurs('--json')[0] ?? null;
  const lu = new Date().toISOString();
  console.log(`Simulation EN LECTURE SEULE du juge « annonce publiée confirmée disparue » — ${paris(lu)} (Paris)`);
  console.log(`Code : ${path.relative(RACINE, HANDLER_WATCH)} (jugerAnnoncesPublieesDisparues, extrait tel quel) ; tranches ${liste.join(', ')}${job ? ` ; job ${job}` : ''}`);
  console.log('Rien n\'est écrit : lectures par `supabase db query --linked --read-only`, écritures du juge seulement notées.\n');

  const resultats = [];
  for (let i = 0; i < liste.length; i += 4) {
    resultats.push(...await Promise.all(liste.slice(i, i + 4).map((t) => simulerTranche(t, { job }))));
  }
  resultats.sort((a, b) => a.tranche - b.tranche);
  const fermees = resultats.flatMap((r) => fermeturesDe(r).map((f) => ({ tranche: r.tranche, ...f })));
  const marqueurs = resultats.flatMap((r) => r.ecritures.filter((e) => e.patch?.status == null).map((e) => ({ tranche: r.tranche, job_id: e.filtres.id })));

  // Les titres des fiches (une lecture de plus, hors du juge).
  const fiches = [...new Set(fermees.map((f) => f.inventaire_id).filter((x) => x != null).map(String))];
  const titreDe = new Map();
  for (let i = 0; i < fiches.length; i += 150) {
    const lot = fiches.slice(i, i + 150);
    for (const f of await lireProd(`SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) AS r FROM (SELECT id, titre FROM public.inventaire WHERE id IN (${lot.map(litteral).join(', ')})) t;`)) titreDe.set(String(f.id), f.titre);
  }
  for (const f of fermees) f.titre = titreDe.get(String(f.inventaire_id)) ?? null;

  console.log('Tranche  jugées  closes  « en vérification »');
  for (const r of resultats) console.log(`  ${String(r.tranche).padStart(2)}     ${String(r.res.jugees).padStart(4)}    ${String(r.res.closes).padStart(4)}    ${String(r.res.en_verification).padStart(4)}`);
  const somme = (k) => resultats.reduce((s, r) => s + (Number(r.res[k]) || 0), 0);
  console.log(`  TOTAL  ${String(somme('jugees')).padStart(4)}    ${String(somme('closes')).padStart(4)}    ${String(somme('en_verification')).padStart(4)}\n`);

  console.log(`FERMETURES (${fermees.length}) — compte · plateforme · action · annonce · titre · preuve · dernière vue (Paris)`);
  for (const f of fermees) {
    console.log(`  ${String(f.user_id).slice(0, 8)} · ${f.platform} · ${f.action} · ${f.annonce}${f.action === 'republish' && f.ancienne_pf && f.ancienne_pf !== f.annonce ? ` (ancienne ${f.ancienne_pf})` : ''}`
      + ` · « ${court(f.titre, 40)} » · ${f.motif}${f.vendue ? ' [vendue]' : ''} · ${f.derniere_vue ? `${paris(f.derniere_vue)} (${f.statut_derniere_vue || '?'})` : `jamais relevée — publiée le ${paris(f.publiee_le)}`}`
      + ` · job ${String(f.job_id).slice(0, 8)}`);
  }
  const par = (k) => Object.entries(fermees.reduce((m, f) => { m[f[k]] = (m[f[k]] ?? 0) + 1; return m; }, {})).map(([a, n]) => `${a} ${n}`).join(', ') || '—';
  console.log(`\nTOTAL : ${fermees.length} annonce(s) publiée(s) close(s) — par plateforme : ${par('platform')} ; par action : ${par('action')} ; ${new Set(fermees.map((f) => f.user_id)).size} compte(s) ; relevées « en vérification » : ${somme('en_verification')} (marqueur à poser : ${marqueurs.length}, les autres l'ont déjà)`);
  if (json) {
    fs.writeFileSync(json, JSON.stringify({
      lu_le: lu, tranches: resultats.map((r) => ({ tranche: r.tranche, ...r.res })), fermees, marqueurs,
      decisions: resultats.flatMap((r) => r.journal.map((j) => ({ tranche: r.tranche, job_id: j.job?.id, platform: j.job?.platform, action: j.job?.action, decision: j.d?.decision, raison: j.d?.raison }))),
    }, null, 2));
    console.log(`Relevé complet (JSON) : ${json}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
