// CONSTRUIT LA FIXTURE DU BANC 20261112140000 (une vente annule aussi les tâches non publiées de SA plateforme) : le
// catalogue de PROD du 12/11 réduit à la chaîne de la vente — les définitions de prod (pg_get_functiondef) de
// enregistrer_vente_atomique et de tout ce qu'elle exécute, ET de toute la chaîne du banc L1 (retrait, vente, questions),
// les déclencheurs de prod de `inventaire`, `cross_post_jobs`, `inventaire_doublons`, `ventes` et `ventes_operations`.
// Rien n'est réécrit de mémoire.
//
//   node scripts/essais/20261112140000_fixture.mjs --fonctions <tout.json> --tables <tab.json> [--verifie-le <ISO>]
//
// <tout.json> : toutes les fonctions du schéma public lues EN PROD en lecture seule
//   (`npx supabase db query --linked --read-only`) : { nom, args, iargs, def, acl, owner } ;
// <tab.json>  : { trig: [{ t, n, def, on, fn }], cols: [{ t, c, ty, nn, d, g, id }] } des mêmes tables, lus de même.
// Les deux fichiers restent HORS du dépôt (les commentaires de prod citent des cas réels).
// Les tables, contraintes, index, droits et politiques sont ceux de la fixture L1 (relus en prod le 11/11, colonnes
// recomparées le 12/11 : seul écart, profiles.cloud_formule, ajoutée ici) ; la table jumelles_retirees_partout (née de
// la migration 20261111140000) est reprise de cette migration, telle qu'appliquée.
// ⛔ AUCUNE DONNÉE CLIENT DANS LA FIXTURE VERSIONNÉE : commentaires des corps retirés (lecteur du banc L1, contrôlé :
// idempotent, code identique jeton par jeton à la prod).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { sansCommentairesSql, definitionSansCommentaires, jetonsSql } from './20261111140000_fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const L1 = join(ROOT, 'scripts/essais/fixtures/prod-1111-retrait-fiche-liee/catalogue.json');
export const SORTIE_FIXTURE = 'scripts/essais/fixtures/prod-1211-vente-meme-plateforme/catalogue.json';
const SORTIE = join(ROOT, SORTIE_FIXTURE);
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
if (!arg('--fonctions') || !arg('--tables')) { console.error('usage : --fonctions <tout.json> --tables <tab.json> [--verifie-le <ISO>]'); process.exit(2); }
const tout = JSON.parse(readFileSync(arg('--fonctions'), 'utf8'));
const tab = JSON.parse(readFileSync(arg('--tables'), 'utf8'));
const l1 = JSON.parse(readFileSync(L1, 'utf8'));

const TABLES_A_DECLENCHEURS = ['inventaire', 'cross_post_jobs', 'inventaire_doublons', 'ventes', 'ventes_operations'];
const RACINES = [...new Set([...l1.racines, ...l1.fonctions.map((f) => f.nom), 'enregistrer_vente_atomique'])];

const fns = new Map();
for (const f of tout) { if (!fns.has(f.nom)) fns.set(f.nom, []); fns.get(f.nom).push(f); }
const corps = (f) => sansCommentairesSql(f.def.slice(f.def.indexOf('AS $')));
const appels = (txt) => { const out = new Set(); for (const m of txt.matchAll(/\b(?:public\.)?([a-z_][a-z_0-9]*)\s*\(/g)) if (fns.has(m[1])) out.add(m[1]); return out; };
const racines = new Set(RACINES);
for (const g of tab.trig) if (TABLES_A_DECLENCHEURS.includes(g.t)) racines.add(String(g.fn).replace(/^public\./, ''));
const gardees = new Set(), file = [...racines];
while (file.length) {
  const n = file.pop();
  if (gardees.has(n)) continue;
  if (!fns.has(n)) throw new Error(`fonction absente de la prod : ${n}`);
  gardees.add(n);
  for (const f of fns.get(n)) for (const a of appels(corps(f))) if (!gardees.has(a)) file.push(a);
}

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const fonctions = [...gardees].sort().flatMap((n) => fns.get(n).map((f) => {
  const brut = f.def.replace(/\r/g, '');
  const def = definitionSansCommentaires(brut);
  if (definitionSansCommentaires(def) !== def) throw new Error(`lecteur SQL non idempotent : ${f.nom}`);
  if (JSON.stringify(jetonsSql(def)) !== JSON.stringify(jetonsSql(brut))) throw new Error(`lecteur SQL : le code de ${f.nom} a changé`);
  return { nom: f.nom, args: f.args, def, md5_prod: md5(brut), acl: f.acl };
}));

// Tables : celles de L1, déclencheurs remplacés par ceux de la prod du 12/11, colonnes recomparées.
const tables = l1.tables.map((t) => ({ ...t, trig: [] }));
const parNom = new Map(tables.map((t) => [t.nom, t]));
for (const nom of TABLES_A_DECLENCHEURS) if (!parNom.has(nom)) throw new Error(`table absente de la fixture L1 : ${nom}`);
for (const g of tab.trig) if (TABLES_A_DECLENCHEURS.includes(g.t)) parNom.get(g.t).trig.push({ def: g.def, fn: String(g.fn).replace(/^public\./, ''), n: g.n, on: g.on });
const ecarts = [];
for (const t of tables) {
  const prod = tab.cols.filter((c) => c.t === t.nom);
  for (const c of prod) {
    if (t.cols.some((k) => k.n === c.c)) continue;
    t.cols.push({ d: c.d ?? null, g: c.g ?? '', id: c.id ?? '', n: c.c, nn: !!c.nn, t: c.ty });
    ecarts.push(`${t.nom}.${c.c}`);
  }
  for (const k of t.cols) if (!prod.some((c) => c.c === k.n)) throw new Error(`colonne absente en prod : ${t.nom}.${k.n}`);
}
const migL1 = readFileSync(join(ROOT, 'supabase/migrations/20261111140000_retrait_partout_fiche_liee.sql'), 'utf8').replace(/\r\n/g, '\n');
const ddlJumelles = migL1.slice(migL1.indexOf('CREATE TABLE IF NOT EXISTS public.jumelles_retirees_partout'),
  migL1.indexOf('\n', migL1.indexOf('FOR SELECT TO authenticated USING (user_id = auth.uid());')) + 1);
if (!/^CREATE TABLE/.test(ddlJumelles) || !/CREATE POLICY/.test(ddlJumelles)) throw new Error('DDL de jumelles_retirees_partout introuvable');

const fixture = {
  source: 'catalogue de PROD du 12/11 réduit à la chaîne de la vente (scripts/essais/20261112140000_fixture.mjs), commentaires des corps retirés',
  lu_le: arg('--verifie-le') ?? new Date().toISOString(), verifie_le: arg('--verifie-le') ?? new Date().toISOString(),
  tables_a_declencheurs: TABLES_A_DECLENCHEURS, racines: RACINES,
  md5: Object.fromEntries(fonctions.map((f) => [`${f.nom}(${f.args})`, md5(f.def)])),
  md5_prod: Object.fromEntries(fonctions.map((f) => [`${f.nom}(${f.args})`, f.md5_prod])),
  acl_prod: Object.fromEntries(fonctions.map((f) => [`${f.nom}(${f.args})`, f.acl])),
  fonctions: fonctions.map(({ nom, args, def }) => ({ nom, args, def })), tables, sequences: l1.sequences,
  config: l1.config, droits: l1.droits, ddl_apres: [ddlJumelles], colonnes_ajoutees: ecarts,
};
mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, JSON.stringify(fixture, null, 1) + '\n');
console.log(`fixture : ${fonctions.length} fonctions, ${tables.length} tables, ${tables.reduce((n, t) => n + t.trig.length, 0)} déclencheurs, `
  + `colonnes ajoutées ${ecarts.join(', ') || 'aucune'} — ${Math.round(JSON.stringify(fixture).length / 1024)} Ko`);
