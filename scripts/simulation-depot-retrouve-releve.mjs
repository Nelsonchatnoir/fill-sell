// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION EN LECTURE SEULE — ce que le passage « dépôt Vinted retrouvé par le relevé » ferait aujourd'hui (07/11)
// ═══════════════════════════════════════════════════════════════════════════
// La règle (handler-watch, jugerDepotsRetrouvesParReleve ; _shared/depot-retrouve-releve.js) est COUPÉE
// (JUGER_DEPOTS_RETROUVES = false) : Nico l'allume après avoir vu cette simulation. Ce script rejoue le VRAI code du
// passage — la fonction extraite de handler-watch/index.ts et transpilée, avec le vrai module partagé — sur les VRAIES
// données de la prod, sans rien écrire :
//  · chaque lecture (même table, mêmes filtres, même ordre, plafond PostgREST de 1 000 lignes) est traduite en un SELECT
//    envoyé par `npx supabase db query --linked --read-only` (transaction en lecture seule) ;
//  · la seule fonction appelée pour LIRE (vinted_remise_apres_annulation, STABLE) part en SELECT ;
//  · chaque écriture (job, question releve_poser_question, rattachement) est seulement NOTÉE, jamais envoyée.
//
//   node scripts/simulation-depot-retrouve-releve.mjs [--json <fichier>]
// Les dates affichées sont à l'heure de Paris.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as module from '../supabase/functions/_shared/depot-retrouve-releve.js';
import { archiverErreur } from '../supabase/functions/_shared/erreurs-archivees.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HANDLER_WATCH = path.join(RACINE, 'supabase/functions/handler-watch/index.ts');
const MAX_ROWS = 1000;

let numeroFichier = 0;
async function lireProd(sql) {
  if (!/^\s*SELECT\s/i.test(sql) || /;\s*\S/.test(sql.trim().replace(/;\s*$/, ''))) throw new Error('lecture seule : un seul SELECT part');
  const f = path.join(os.tmpdir(), `simulation-depot-retrouve-${process.pid}-${numeroFichier++}.sql`);
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

const nomSql = (c) => { if (!/^\w+$/.test(String(c))) throw new Error(`nom refusé : ${c}`); return `"${c}"`; };
const litteral = (v) => (v === null || v === undefined ? 'NULL'
  : typeof v === 'number' && Number.isFinite(v) ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
// « col->a->b » (PostgREST) → "col"->'a'->'b'
const chemin = (c) => { const [col, ...cles] = String(c).split('->'); return nomSql(col) + cles.map((k) => `->${litteral(k)}`).join(''); };

class Requete {
  constructor(table, ctx) { this.table = table; this.ctx = ctx; this.cols = '*'; this.ou = []; this.egal = {}; this.tri = []; this.lim = null; this.maj = null; }
  select(c = '*') { if (!this.maj) this.cols = c; return this; }
  update(p) { this.maj = p; return this; }
  eq(c, v) { this.ou.push(`${nomSql(c)} = ${litteral(v)}`); this.egal[c] = v; return this; }
  in(c, l) { this.ou.push(l.length ? `${nomSql(c)} IN (${l.map((x) => litteral(String(x))).join(', ')})` : 'FALSE'); return this; }
  is(c, v) { if (v !== null) throw new Error(`is(${c}, ${v}) non géré`); this.ou.push(`${nomSql(c)} IS NULL`); this.egal[c] = null; return this; }
  gte(c, v) { this.ou.push(`${nomSql(c)} >= ${litteral(v)}`); return this; }
  or(expr) {
    const parties = String(expr).split(',').map((p) => {
      const m = /^(.+?)\.(not\.)?is\.null$/.exec(p.trim());
      if (!m) throw new Error(`or(${p}) non géré`);
      return `${chemin(m[1])} IS ${m[2] ? 'NOT ' : ''}NULL`;
    });
    this.ou.push(`(${parties.join(' OR ')})`); return this;
  }
  order(c, o = {}) { this.tri.push(`${nomSql(c)} ${o.ascending === false ? 'DESC' : 'ASC'}`); return this; }
  limit(n) { this.lim = n; return this; }
  then(ok, ko) { return this.executer().then(ok, ko); }
  sql() {
    const cols = String(this.cols).trim() === '*' ? '*' : String(this.cols).split(',').map((c) => nomSql(c.trim())).join(', ');
    const n = Math.min(this.lim ?? MAX_ROWS, MAX_ROWS);
    return `SELECT coalesce(jsonb_agg(x ORDER BY n), '[]'::jsonb) AS r FROM (SELECT to_jsonb(t) AS x, row_number() OVER () AS n FROM (`
      + `SELECT ${cols} FROM public.${nomSql(this.table)}${this.ou.length ? ` WHERE ${this.ou.join(' AND ')}` : ''}`
      + `${this.tri.length ? ` ORDER BY ${this.tri.join(', ')}` : ''} LIMIT ${n}) t) s;`;
  }
  async executer() {
    if (this.maj) { // JAMAIS envoyée : notée, « réussie » (compare-and-set) pour que le passage compte comme en prod
      this.ctx.ecritures.push({ table: this.table, filtres: { ...this.egal }, patch: this.maj });
      return { data: this.egal.id != null ? [{ id: this.egal.id }] : [], error: null };
    }
    try { return { data: await lireProd(this.sql()), error: null }; } catch (e) { return { data: null, error: { message: String(e?.message ?? e) } }; }
  }
}
function clientLectureSeule(ctx) {
  return {
    from: (table) => new Requete(table, ctx),
    rpc: async (nom, args) => {
      if (nom === 'vinted_remise_apres_annulation') { // STABLE : une lecture
        try {
          const r = await lireProd(`SELECT jsonb_build_array(public.vinted_remise_apres_annulation(${Number(args.p_retiree)}, ${Number(args.p_vivante)})) AS r;`);
          ctx.lectures.push({ rpc: nom, args, data: r?.[0] ?? null, source: 'lecture' });
          return { data: r?.[0] ?? null, error: null };
        } catch (e) {
          // Le rôle « --read-only » de la CLI n'a pas EXECUTE sur cette fonction (service_role et postgres seulement) :
          // la valeur lue à part, en SELECT, par l'outil SQL de la session (--oui « retiree:vivante=true,… »), sinon false
          // (prudent : aucune question posée).
          const cle = `${Number(args.p_retiree)}:${Number(args.p_vivante)}`;
          const v = ctx.oui.has(cle) ? ctx.oui.get(cle) : false;
          ctx.lectures.push({ rpc: nom, args, data: v, source: ctx.oui.has(cle) ? 'lue_a_part (--oui)' : `inconnue (${String(e?.message ?? e).match(/permission denied[^\n"]*/)?.[0] ?? 'erreur'}) → false` });
          return { data: v, error: null };
        }
      }
      ctx.ecritures.push({ rpc: nom, args }); // jamais envoyé
      return { data: nom === 'releve_poser_question' ? true : { ok: true, simule: true }, error: null };
    },
  };
}

function morceau(src, debut, finMarque = '\n}\n') {
  const i = src.indexOf(debut);
  if (i < 0) throw new Error(`« ${debut} » introuvable dans handler-watch`);
  const f = src.indexOf(finMarque, i);
  return src.slice(i, f < 0 ? undefined : f + finMarque.length);
}
export function chargerPassage({ journal = null } = {}) {
  const src = fs.readFileSync(HANDLER_WATCH, 'utf8').replace(/\r\n/g, '\n');
  const consts = ['DEPOTS_RETROUVES_PAGE', 'DEPOTS_RETROUVES_ECRITURES_MAX', 'DEPOT_RETROUVE_RATTACHER_RPC'].map((k) => {
    const m = src.match(new RegExp(`\\nconst ${k} = (\\d+|true|false);`)); if (!m) throw new Error(`${k} introuvable`); return `const ${k} = ${m[1]};\n`;
  }).join('');
  const code = consts + morceau(src, 'const parLots = ', ';\n') + morceau(src, 'async function jugerDepotsRetrouvesParReleve(');
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = { ...module, estDepotRetrouveAJuger: module.estDepotAJuger, archiverErreur };
  if (journal) {
    const juger = deps.jugerDepotRetrouve;
    deps.jugerDepotRetrouve = (c) => { const v = juger(c); journal.push({ c, v }); return v; };
  }
  const noms = Object.keys(deps);
  return new Function(...noms, 'console', `${js}\nreturn jugerDepotsRetrouvesParReleve;`)(...noms.map((k) => deps[k]), { log() {}, warn() {}, error() {} });
}

const paris = (v) => {
  const x = Date.parse(String(v ?? ''));
  return Number.isFinite(x) ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(x) : '—';
};
const court = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export async function simuler({ oui = new Map() } = {}) {
  const journal = []; const ctx = { ecritures: [], lectures: [], oui };
  const passage = chargerPassage({ journal });
  const res = await passage(clientLectureSeule(ctx));
  return { res, journal, ecritures: ctx.ecritures, lectures: ctx.lectures };
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
  const lu = new Date().toISOString();
  console.log(`Simulation EN LECTURE SEULE du passage « dépôt Vinted retrouvé par le relevé » — ${paris(lu)} (Paris)`);
  console.log(`Code : ${path.relative(RACINE, HANDLER_WATCH)} (jugerDepotsRetrouvesParReleve, extrait tel quel) + _shared/depot-retrouve-releve.js`);
  console.log('Rien n\'est écrit : lectures par `supabase db query --linked --read-only`, écritures du passage seulement notées.\n');
  const oui = new Map((args.includes('--oui') ? String(args[args.indexOf('--oui') + 1] ?? '') : '').split(',').filter(Boolean)
    .map((x) => { const [k, v] = x.split('='); return [k.trim(), v?.trim() === 'true']; }));
  const { res, journal, ecritures, lectures } = await simuler({ oui });
  console.log(`Bilan du passage : ${JSON.stringify(res)}\n`);
  for (const { c, v } of journal) {
    const j = c.job;
    console.log(`· job ${j.id} (${j.status}, créé ${paris(j.created_at)}) — compte ${String(j.user_id).slice(0, 8)} — fiche du dépôt ${j.inventaire_id} (${c.ficheDepot?.statut ?? '?'}) « ${court(c.ficheDepot?.titre, 50)} »`);
    console.log(`    numéro lu au dépôt ${v.numero ?? '—'} (${(v.sources ?? []).map((s) => s.source + (s.detail ? ':' + s.detail : '')).join(' + ') || '—'}) ; boutique ${v.boutique ?? '—'}`);
    if (c.porteuse) console.log(`    porteuse ${c.porteuse.id} (${c.porteuse.origine ?? 'fiche'} ; ${c.porteuse.statut} ; Vinted ${c.porteuse.vinted_status}) née ${paris(c.porteuse.created_at)} ; photos communes ${v.photos_communes ?? 0} ; ventes ${(c.ventesAnnonce ?? []).map((x) => x.id).join(', ') || '—'} ; question ${c.question ? c.question.statut : '—'} ; « Oui » possible ${c.unionPossible}`);
    console.log(`    → DÉCISION ${v.decision} (${v.raison})${v.questionSeule ? ' [dépôt arrêté par la personne : jamais réécrit]' : ''}${v.nee_apres_le_depot === false ? ' [fiche neuve née AVANT le dépôt]' : ''}${v.pas_intacte?.length ? ` [pas intacte : ${v.pas_intacte.join(', ')}]` : ''}`);
    for (const e of ecritures.filter((x) => (x.filtres?.id === j.id) || (x.args?.p_existante != null && String(x.args.p_existante) === String(j.inventaire_id)) || x.args?.p_job === j.id)) {
      if (e.rpc) console.log(`    ÉCRITURE NOTÉE : rpc ${e.rpc}(${JSON.stringify({ ...e.args, p_preuves: e.args.p_preuves ? '{…}' : undefined })})`);
      else console.log(`    ÉCRITURE NOTÉE : ${e.table} ${JSON.stringify(e.filtres)} → status « ${e.patch.status} »${e.patch.listing_url ? `, lien ${e.patch.listing_url}` : ''}${e.patch.platform_listing_id ? `, numéro ${e.patch.platform_listing_id}` : ''}\n      message : ${e.patch.error ?? '(effacé)'}`);
    }
  }
  const jumeaux = ecritures.filter((e) => e.table && !journal.some(({ c }) => c.job.id === e.filtres?.id));
  for (const e of jumeaux) console.log(`· ÉCRITURE NOTÉE (job de suivi) : ${e.table} ${JSON.stringify(e.filtres)} → « ${e.patch.status} » — ${e.patch.error}`);
  console.log(`\nLectures de fonctions : ${lectures.map((l) => `${l.rpc}(${l.args.p_retiree}, ${l.args.p_vivante}) = ${l.data} [${l.source}]`).join(' ; ') || '—'}`);
  console.log(`TOTAL : ${journal.length} dépôt(s) jugé(s) ; ${ecritures.filter((e) => e.table).length} écriture(s) de job, ${ecritures.filter((e) => e.rpc).length} appel(s) d'écriture notés (aucun envoyé).`);
  if (json) { fs.writeFileSync(json, JSON.stringify({ lu_le: lu, res, journal: journal.map(({ c, v }) => ({ job: c.job.id, v })), ecritures, lectures }, null, 2)); console.log(`JSON : ${json}`); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
