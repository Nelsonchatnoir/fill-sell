// CONSTRUIT LA FIXTURE DU BANC 20261113140000 (ventes Beebs : garde d'âge, annulation défaite, prix lu, comptes reliés) :
// le catalogue de PROD du 13/11 réduit à la chaîne de la vente Beebs — les définitions de prod (pg_get_functiondef) de
// commandes_beebs_noter, de ventes_prouvees_tick (et de ce qu'elle exécute : ventes_prouvees_a_enregistrer,
// enregistrer_vente_prouvee, enregistrer_vente_atomique…), de vente_transaction_annulee_leboncoin (le modèle de
// l'annulation défaite), ET de toute la chaîne des bancs du 11 et du 12/11 (retrait, vente, questions, notes de vente) ;
// TOUS les déclencheurs de prod de `inventaire`, `cross_post_jobs`, `inventaire_doublons`, `ventes`, `ventes_operations`.
// Rien n'est réécrit de mémoire.
//
//   node scripts/essais/20261113140000_fixture.mjs --fonctions <tout.json> --tables <tab.json> [--verifie-le <ISO>]
//
// <tout.json> : toutes les fonctions du schéma public lues EN PROD en lecture seule
//   (`npx supabase db query --linked --read-only`) : [{ nom, args, iargs, def, acl, owner }] ;
// <tab.json>  : { trig, cols, cons, idx, droits, politiques, coin_config } lus de même (requête du rapport G, 13/11).
// Les deux fichiers restent HORS du dépôt (les commentaires de prod citent des cas réels).
// Base : la fixture du 12/11 (tables, contraintes, index, droits, politiques de la chaîne de la vente) ; en plus, les
// quatre tables que la chaîne Beebs écrit ou lit (ventes_prouvees_refus, ventes_prouvees_passages, inventaire_journal,
// ventes_annulees_attente_go), aux colonnes, contraintes, index, droits et politiques de prod ; coin_config de prod du
// jour (des réglages, aucune donnée de compte).
// ⛔ AUCUNE DONNÉE CLIENT DANS LA FIXTURE VERSIONNÉE : commentaires des corps retirés (lecteur du banc L1, contrôlé :
// idempotent, code identique jeton par jeton à la prod).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { sansCommentairesSql, definitionSansCommentaires, jetonsSql } from './20261111140000_fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = join(ROOT, 'scripts/essais/fixtures/prod-1211-vente-meme-plateforme/catalogue.json');
export const SORTIE_FIXTURE = 'scripts/essais/fixtures/prod-1311-ventes-beebs/catalogue.json';
const SORTIE = join(ROOT, SORTIE_FIXTURE);
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
if (!arg('--fonctions') || !arg('--tables')) { console.error('usage : --fonctions <tout.json> --tables <tab.json> [--verifie-le <ISO>]'); process.exit(2); }
const tout = JSON.parse(readFileSync(arg('--fonctions'), 'utf8'));
const tab = JSON.parse(readFileSync(arg('--tables'), 'utf8'));
const base = JSON.parse(readFileSync(BASE, 'utf8'));

const TABLES_A_DECLENCHEURS = ['inventaire', 'cross_post_jobs', 'inventaire_doublons', 'ventes', 'ventes_operations'];
const TABLES_NEUVES = ['ventes_prouvees_refus', 'ventes_prouvees_passages', 'inventaire_journal', 'ventes_annulees_attente_go'];
const RACINES = [...new Set([...base.racines, 'commandes_beebs_noter', 'beebs_commande_classe', 'ventes_prouvees_tick',
  'ventes_prouvees_a_enregistrer', 'enregistrer_vente_prouvee', 'vente_transaction_annulee_leboncoin', 'annonce_importee',
  '_prix_ou_null', 'comptes_sont_lies', 'signal_vente_lever'])];

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

// Tables : celles du 12/11, déclencheurs remplacés par ceux de la prod du 13/11, colonnes recomparées ; les quatre neuves.
const tables = base.tables.map((t) => ({ ...t, trig: [] }));
for (const nom of TABLES_NEUVES) {
  if (tables.some((t) => t.nom === nom)) throw new Error(`table déjà dans la fixture : ${nom}`);
  const cols = tab.cols.filter((c) => c.t === nom).map((c) => ({ d: c.d ?? null, g: c.g ?? '', id: c.id ?? '', n: c.c, nn: !!c.nn, t: c.ty }));
  if (!cols.length) throw new Error(`table absente de la prod : ${nom}`);
  tables.push({ nom, cols, cons: (tab.cons ?? []).filter((k) => k.t === nom).map(({ t, ...k }) => k),
    idx: (tab.idx ?? []).filter((x) => x.t === nom).map((x) => x.def), trig: [] });
}
const parNom = new Map(tables.map((t) => [t.nom, t]));
for (const nom of TABLES_A_DECLENCHEURS) if (!parNom.has(nom)) throw new Error(`table absente de la fixture : ${nom}`);
for (const g of tab.trig) if (TABLES_A_DECLENCHEURS.includes(g.t)) parNom.get(g.t).trig.push({ def: g.def, fn: String(g.fn).replace(/^public\./, ''), n: g.n, on: g.on });
const ecarts = [];
for (const t of tables) {
  if (t.nom === 'jumelles_retirees_partout') continue;   // créée par ddl_apres (migration 20261111140000)
  const prod = tab.cols.filter((c) => c.t === t.nom);
  if (!prod.length) throw new Error(`colonnes de prod non lues : ${t.nom}`);
  for (const c of prod) {
    if (t.cols.some((k) => k.n === c.c)) continue;
    t.cols.push({ d: c.d ?? null, g: c.g ?? '', id: c.id ?? '', n: c.c, nn: !!c.nn, t: c.ty });
    ecarts.push(`${t.nom}.${c.c}`);
  }
  for (const k of t.cols) if (!prod.some((c) => c.c === k.n)) throw new Error(`colonne absente en prod : ${t.nom}.${k.n}`);
}
// Les séquences des colonnes des tables neuves (défaut nextval('…'::regclass)).
const sequences = [...base.sequences];
for (const t of tables.filter((x) => TABLES_NEUVES.includes(x.nom))) for (const k of t.cols) {
  const m = /nextval\('(?:public\.)?([a-z_0-9]+)'::regclass\)/.exec(String(k.d ?? ''));
  if (m && !sequences.includes(m[1])) sequences.push(m[1]);
}
const CMD = { SELECT: 'r', INSERT: 'a', UPDATE: 'w', DELETE: 'd', ALL: '*' };
const droits = {
  tables: [...base.droits.tables, ...(tab.droits ?? []).filter((d) => TABLES_NEUVES.includes(d.nom))],
  politiques: [...base.droits.politiques, ...(tab.politiques ?? []).filter((p) => TABLES_NEUVES.includes(p.table))
    .map((p) => ({ table: p.table, check: p.check ?? null, cmd: CMD[p.cmd] ?? p.cmd, nom: p.nom, permissive: p.permissive, roles: p.roles, using: p.using ?? null }))],
};

const fixture = {
  source: 'catalogue de PROD du 13/11 réduit à la chaîne de la vente Beebs (scripts/essais/20261113140000_fixture.mjs), commentaires des corps retirés',
  lu_le: arg('--verifie-le') ?? new Date().toISOString(), verifie_le: arg('--verifie-le') ?? new Date().toISOString(),
  tables_a_declencheurs: TABLES_A_DECLENCHEURS, racines: RACINES,
  md5: Object.fromEntries(fonctions.map((f) => [`${f.nom}(${f.args})`, md5(f.def)])),
  md5_prod: Object.fromEntries(fonctions.map((f) => [`${f.nom}(${f.args})`, f.md5_prod])),
  acl_prod: Object.fromEntries(fonctions.map((f) => [`${f.nom}(${f.args})`, f.acl])),
  fonctions: fonctions.map(({ nom, args, def }) => ({ nom, args, def })), tables, sequences,
  config: { ...base.config, coin_config: tab.coin_config }, droits, ddl_apres: base.ddl_apres, colonnes_ajoutees: ecarts,
};
mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, JSON.stringify(fixture, null, 1) + '\n');
console.log(`fixture : ${fonctions.length} fonctions, ${tables.length} tables, ${tables.reduce((n, t) => n + t.trig.length, 0)} déclencheurs, `
  + `colonnes ajoutées ${ecarts.join(', ') || 'aucune'} — ${Math.round(JSON.stringify(fixture).length / 1024)} Ko`);
