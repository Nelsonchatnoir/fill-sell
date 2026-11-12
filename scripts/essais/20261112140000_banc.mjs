// LE BANC de la migration 20261112140000_vente_arrete_meme_plateforme (12/11/2026, point 2 de Nico : une vente arrête
// aussi les tâches non publiées de SA plateforme) — SUR UN POSTGRES JETABLE (embedded-postgres sur le poste), jamais la prod.
//   node scripts/essais/20261112140000_banc.mjs
// Décor : la prod du 12/11 réduite à la chaîne de la vente (fixtures/prod-1211-vente-meme-plateforme/catalogue.json,
// scripts/essais/20261112140000_fixture.mjs) : 214 fonctions de prod (corps sans commentaires, md5 contrôlés), TOUS les
// déclencheurs de prod de inventaire, cross_post_jobs, inventaire_doublons, ventes et ventes_operations.
// Les mêmes ventes, jouées comme en prod (enregistrer_vente_atomique, côté serveur), dans une transaction annulée :
//   1. le cas : pièce unique vendue sur Vinted par son annonce ; une republication Vinted de CETTE annonce en attente,
//      une publication Leboncoin en attente, une annonce Beebs publiée ;
//   2. même plateforme : une publication Vinted en question (needs_user), une republication Vinted en cours (processing) ;
//   3. plusieurs exemplaires (quantité 3) : rien n'est arrêté, nulle part (vente partielle) ;
//   4. une AUTRE annonce Vinted publiée de la fiche (deux exemplaires) : jamais touchée ; sa republication en attente
//      s'arrête (article épuisé) ;
//   5. vente saisie depuis la fiche (sans annonce) : inchangée (toutes plateformes, déjà) ;
//   6. une republication Vinted rattachée par le titre seul (retrait_job_prouve faux) : jamais touchée.
// Étapes : A. AVANT (prod) — le défaut se reproduit ; garde md5 : la migration refuse une définition qui n'est pas
// celle de prod ; B. MIGRATION — corrigé, tout le reste identique à A ; C. INVERSE — le code de prod jeton pour jeton, A
// de nouveau ; D. MIGRATION rejouée — B de nouveau.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { demarrerBase, ouvrir, construireDecor, outils, ROOT, A } from './20261111140000_decor.mjs';
import { jetonsSql } from './20261111140000_fixture.mjs';

export const FIXTURE = 'scripts/essais/fixtures/prod-1211-vente-meme-plateforme/catalogue.json';
export const MIGRATION = 'supabase/migrations/20261112140000_vente_arrete_meme_plateforme.sql';
export const INVERSE = 'supabase/rollbacks/20261112140000_vente_arrete_meme_plateforme_INVERSE.sql';
export const MD5_PROD = 'd0efd535b771fefdf0ab8220ebac80bc';
export const SIG = 'enregistrer_vente_atomique(p_user uuid, p_cle text, p_inventaire bigint DEFAULT NULL::bigint, p_job uuid DEFAULT NULL::uuid, p_prix numeric DEFAULT NULL::numeric, p_frais numeric DEFAULT 0, p_quantite integer DEFAULT 1, p_quantite_attendue integer DEFAULT NULL::integer, p_plateforme text DEFAULT NULL::text)';
const REG = "'public.enregistrer_vente_atomique(uuid,text,bigint,uuid,numeric,numeric,integer,integer,text)'::regprocedure";
export const MESSAGE_ARRET = 'Cet exemplaire a été vendu ; cette publication est arrêtée.';
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

/** Construit la base jetable : le décor de prod du 12/11 + la table née de L1. Rend { c, fixture, echecs }. */
export async function preparer({ port }) {
  const base = await demarrerBase({ port, nom: 'fillsell-banc-vente-meme-plateforme-' });
  const c = await ouvrir(base.url);
  const fixture = JSON.parse(lire(FIXTURE));
  const d = await construireDecor(c, fixture);
  for (const sql of fixture.ddl_apres ?? []) { try { await c.query(sql); } catch (e) { d.echecs.push(`ddl : ${e.message}`); } }
  return { base, c, fixture, d };
}

/** Les md5 des fonctions de la base jetable, clé nom(arguments) comme la fixture. */
export async function md5Base(c) {
  const r = await c.query(`SELECT p.proname || '(' || pg_get_function_arguments(p.oid) || ')' AS k, md5(pg_get_functiondef(p.oid)) AS m
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace`);
  return Object.fromEntries(r.rows.map((x) => [x.k, x.m]));
}
export async function defVente(c) { return (await c.query(`SELECT pg_get_functiondef(${REG}) AS d`)).rows[0].d; }

/** La migration, sa garde md5 visée sur la définition présente dans la base jetable (le décor n'a pas les commentaires de
 *  prod : la garde de prod ne peut que refuser — c'est contrôlé à part). */
export function migrationPourLaBase(texte, md5Present) {
  const garde = `chr(13), '')) <> '${MD5_PROD}' THEN`;
  if (texte.split(garde).length !== 2) throw new Error('la garde de la migration ne vise pas le md5 de prod');
  return texte.replace(garde, `chr(13), '')) <> '${md5Present}' THEN`);
}

/** Les six cas, joués dans UNE transaction annulée. Rend l'état comparable de chaque tâche et le résultat des ventes. */
export async function jouer(c) {
  const t = outils(c);
  await c.query('BEGIN');
  try {
    await t.comptes();
    const vendue = { sale_signal: 'sold' };
    // 1. Le cas.
    const f1 = await t.fiche(A);
    const p1 = await t.depot(A, f1, { platform: 'vinted', pf: vendue });
    const r1 = await t.depot(A, f1, { platform: 'vinted', action: 'republish', status: 'pending', num: null, url: null, il: '3 days', pf: { republish_step: 'a_capturer', vinted_item_id: p1.num, republish_source: 'manuel' } });
    const l1 = await t.depot(A, f1, { platform: 'leboncoin', status: 'pending', num: null, url: null, il: '3 days' });
    const e1 = await t.depot(A, f1, { platform: 'beebs' });
    // 2. Même plateforme : une question, une republication en cours.
    const f2 = await t.fiche(A);
    const p2 = await t.depot(A, f2, { platform: 'vinted', pf: vendue });
    // (une republication naît « publish » : créée AVANT la publication en question, comme en prod — index unique)
    const q2 = await t.depot(A, f2, { platform: 'vinted', action: 'republish', status: 'processing', num: null, url: null, il: '1 day', pf: { republish_step: 'captured', vinted_item_id: p2.num, processing_since: '2026-11-12T10:00:00Z' } });
    const n2 = await t.depot(A, f2, { platform: 'vinted', status: 'needs_user', num: null, url: null, il: '2 days', pf: { needs_user_source: 'champ_a_choisir' } });
    // 3. Plusieurs exemplaires.
    const f3 = await t.fiche(A, { quantite: 3 });
    const p3 = await t.depot(A, f3, { platform: 'vinted', pf: vendue });
    const r3 = await t.depot(A, f3, { platform: 'vinted', action: 'republish', status: 'pending', num: null, url: null, il: '3 days', pf: { republish_step: 'a_capturer', vinted_item_id: p3.num } });
    const l3 = await t.depot(A, f3, { platform: 'leboncoin', status: 'pending', num: null, url: null, il: '3 days' });
    // 4. Une autre annonce Vinted publiée de la fiche.
    const f4 = await t.fiche(A);
    const p4 = await t.depot(A, f4, { platform: 'vinted', pf: vendue });
    const x4 = await t.depot(A, f4, { platform: 'vinted', il: '20 days' });
    const r4 = await t.depot(A, f4, { platform: 'vinted', action: 'republish', status: 'pending', num: null, url: null, il: '2 days', pf: { republish_step: 'a_capturer', vinted_item_id: x4.num } });
    // 5. Vente saisie depuis la fiche.
    const f5 = await t.fiche(A);
    const p5 = await t.depot(A, f5, { platform: 'vinted' });
    const r5 = await t.depot(A, f5, { platform: 'vinted', action: 'republish', status: 'pending', num: null, url: null, il: '3 days', pf: { republish_step: 'a_capturer', vinted_item_id: p5.num } });
    // 6. Rattachée par le titre seul.
    const f6 = await t.fiche(A);
    const p6 = await t.depot(A, f6, { platform: 'vinted', pf: vendue });
    const r6 = await t.depot(A, f6, { platform: 'vinted', action: 'republish', status: 'pending', num: null, url: null, il: '3 days', pf: { republish_step: 'a_capturer', vinted_item_id: p6.num, rattachement: { par: 'auto', motif: 'titre_exact' } } });

    const vente = async (inv, job, extra = {}) => {
      const r = await c.query(`SELECT public.enregistrer_vente_atomique($1, $2, $3, $4, $5, 0, $6, $7, $8) AS r`,
        [A, extra.cle ?? null, inv, job, 20, extra.quantite ?? 1, extra.attendue ?? null, extra.plateforme ?? null]);
      const x = { ...r.rows[0].r }; delete x.ventes_ids; return x;
    };
    const ventes = {
      v1: await vente(f1, p1.id), v2: await vente(f2, p2.id), v3: await vente(f3, p3.id), v4: await vente(f4, p4.id),
      v5: await vente(f5, null, { cle: 'essai-5', plateforme: 'vinted', attendue: 1 }), v6: await vente(f6, p6.id),
    };
    const ids = { p1, r1, l1, e1, p2, n2, q2, p3, r3, l3, p4, x4, r4, p5, r5, p6, r6 };
    const taches = {};
    for (const [k, v] of Object.entries(ids)) {
      const j = await t.tache(v.id);
      taches[k] = { status: j.status, error: j.error ?? null, cle: j.platform_fields?.vente_operation_cle ? 'posée' : null };
    }
    const fiches = {};
    for (const [k, f] of Object.entries({ f1, f2, f3, f4, f5, f6 })) {
      const r = (await c.query('SELECT statut, quantite FROM inventaire WHERE id = $1', [f])).rows[0];
      fiches[k] = r;
    }
    const retraits = (await c.query(`SELECT platform, status, listing_url FROM cross_post_jobs WHERE user_id = $1 AND action = 'delete' ORDER BY platform, listing_url`, [A])).rows
      .map((r) => `${r.platform}:${r.status}:${r.listing_url === e1.url ? 'annonce Beebs du cas 1' : r.listing_url}`);
    return { ventes, taches, fiches, retraits };
  } finally {
    await c.query('ROLLBACK');
  }
}

// ── Le banc ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const principal = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (principal) {
  let n = 0, ko = 0;
  const ok = (cond, msg, detail) => {
    n++;
    if (cond) { console.log(`  ✓ ${msg}`); return; }
    ko++;
    console.log(`  ✗ ${msg}${detail === undefined ? '' : `\n      ← ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900)}`}`);
  };
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const { base, c, fixture, d } = await preparer({ port: 54000 + Math.floor(Math.random() * 2000) });
  try {
    ok(d.echecs.length === 0 && d.nf === d.nfTotal && d.nt === d.ntTotal,
      `décor de prod : ${d.nf}/${d.nfTotal} fonctions, ${d.nt}/${d.ntTotal} déclencheurs, ${d.np}/${d.npTotal} politiques`, d.echecs.slice(0, 5));
    const m0 = await md5Base(c);
    const fausses = Object.entries(fixture.md5).filter(([k, m]) => m0[k] !== m).map(([k]) => k);
    ok(fausses.length === 0, `md5 du décor = md5 de la fixture (prod sans commentaires) pour les ${Object.keys(fixture.md5).length} fonctions`, fausses.slice(0, 5));
    ok(fixture.md5_prod[SIG] === MD5_PROD, `la fixture porte le md5 de prod de enregistrer_vente_atomique (${MD5_PROD})`, fixture.md5_prod[SIG]);
    const DEF_PROD = fixture.fonctions.find((f) => `${f.nom}(${f.args})` === SIG).def;

    console.log('A. AVANT — les définitions de prod du 12/11');
    const RA = await jouer(c);
    ok(RA.ventes.v1.ok === true && RA.ventes.v1.siblingsCancelled === 1 && RA.retraits.includes('beebs:pending:annonce Beebs du cas 1'), 'A · cas 1 : la vente passe, 1 arrêtée (Leboncoin), le retrait Beebs armé (déclencheur de la fiche vendue, comme en prod)', [RA.ventes.v1, RA.retraits]);
    ok(RA.taches.r1.status === 'pending' && RA.taches.r1.cle === null, 'A · cas 1 : LE DÉFAUT — la republication Vinted de l\'annonce vendue reste en attente, intacte', RA.taches.r1);
    ok(RA.taches.l1.status === 'cancelled' && RA.taches.l1.error === MESSAGE_ARRET, 'A · cas 1 : la publication Leboncoin en attente est arrêtée', RA.taches.l1);
    ok(RA.taches.n2.status === 'needs_user' && RA.taches.q2.status === 'processing', 'A · cas 2 : la question Vinted et la republication Vinted en cours restent', [RA.taches.n2, RA.taches.q2]);
    ok(RA.fiches.f1.statut === 'vendu' && Number(RA.fiches.f1.quantite) === 0, 'A · cas 1 : fiche « vendu », quantité 0', RA.fiches.f1);

    // La garde md5 : la migration telle quelle refuse une définition qui n'est pas celle de prod.
    const MIG = lire(MIGRATION), INV = lire(INVERSE);
    let refus = null;
    try { await c.query(MIG); } catch (e) { refus = e.message; await c.query('ROLLBACK').catch(() => {}); }
    ok(/a changé en prod depuis sa lecture du 12\/11/.test(refus ?? '') && (await md5Base(c))[SIG] === m0[SIG],
      'garde : la migration telle quelle refuse une définition autre que celle de prod (rien n\'est réécrit)', refus);

    console.log('B. MIGRATION');
    await c.query(migrationPourLaBase(MIG, m0[SIG]));
    const DEF_B = await defVente(c);
    ok(DEF_B.includes("OR (v_restant=0 AND c.status IN ('pending','processing','needs_user')))"), 'B : la condition corrigée est en place');
    const jp = jetonsSql(DEF_PROD), jb = jetonsSql(DEF_B);
    const i = jp.indexOf('j.platform)');
    ok(i > 0 && egal([...jp.slice(0, i), 'j.platform', 'OR', '(v_restant=0', 'AND', 'c.status', 'IN', "('pending','processing','needs_user')))", ...jp.slice(i + 1)], jb),
      'B : le code = celui de prod, à la seule condition près (jeton pour jeton)');
    const autres = Object.entries(await md5Base(c)).filter(([k, m]) => k !== SIG && fixture.md5[k] && m !== fixture.md5[k]).map(([k]) => k);
    ok(autres.length === 0, 'B : aucune autre fonction touchée', autres);
    const RB = await jouer(c);
    ok(RB.taches.r1.status === 'cancelled' && RB.taches.r1.error === MESSAGE_ARRET && RB.taches.r1.cle === 'posée',
      'B · cas 1 : la republication Vinted de l\'annonce vendue est ARRÊTÉE (message de la vente, reçu posé)', RB.taches.r1);
    ok(RB.ventes.v1.siblingsCancelled === 2 && RB.retraits.includes('beebs:pending:annonce Beebs du cas 1'), 'B · cas 1 : 2 arrêtées (Vinted + Leboncoin), le retrait Beebs armé comme en A', [RB.ventes.v1, RB.retraits]);
    ok(RB.taches.n2.status === 'cancelled' && RB.taches.q2.status === 'cancelled', 'B · cas 2 : la question Vinted et la republication Vinted en cours sont arrêtées', [RB.taches.n2, RB.taches.q2]);
    ok(RB.taches.r3.status === 'pending' && RB.taches.l3.status === 'pending' && Number(RB.fiches.f3.quantite) === 2,
      'B · cas 3 : plusieurs exemplaires — rien d\'arrêté (quantité restante 2)', [RB.taches.r3, RB.taches.l3, RB.fiches.f3]);
    ok(RB.taches.x4.status === 'published' && RB.taches.r4.status === 'cancelled', 'B · cas 4 : l\'autre annonce Vinted publiée intacte ; sa republication en attente arrêtée (article épuisé)', [RB.taches.x4, RB.taches.r4]);
    ok(egal(RB.taches.r5, RA.taches.r5) && egal(RB.taches.p5, RA.taches.p5) && RB.taches.r5.status === 'cancelled', 'B · cas 5 : vente saisie — identique à A (déjà arrêtée)', [RA.taches.r5, RB.taches.r5]);
    ok(RB.taches.r6.status === 'pending' && egal(RB.taches.r6, RA.taches.r6), 'B · cas 6 : rattachée par le titre seul — jamais touchée', RB.taches.r6);
    const changees = ['r1', 'n2', 'q2', 'r4'];
    const memes = Object.keys(RA.taches).filter((k) => !changees.includes(k) && !egal(RA.taches[k], RB.taches[k]));
    ok(memes.length === 0, `B : les ${Object.keys(RA.taches).length - changees.length} autres tâches identiques à A`, memes.map((k) => [k, RA.taches[k], RB.taches[k]]));
    ok(egal(RA.fiches, RB.fiches) && egal(RA.retraits, RB.retraits), 'B : fiches et retraits identiques à A', [RA.retraits, RB.retraits]);
    const vMemes = Object.keys(RA.ventes).filter((k) => {
      const a = { ...RA.ventes[k] }, b = { ...RB.ventes[k] }; delete a.siblingsCancelled; delete b.siblingsCancelled; return !egal(a, b);
    });
    ok(vMemes.length === 0, 'B : les six ventes rendent la même chose qu\'en A (hors le compte des arrêtées)', vMemes);

    console.log('C. INVERSE');
    await c.query(INV);
    const DEF_C = await defVente(c);
    ok(egal(jetonsSql(DEF_C), jp), 'C : le code de prod de enregistrer_vente_atomique, jeton pour jeton');
    const RC = await jouer(c);
    ok(egal(RC, RA), 'C : les six cas reviennent exactement à A (défaut compris)', { RA: RA.taches.r1, RC: RC.taches.r1 });

    console.log('D. MIGRATION rejouée');
    await c.query(migrationPourLaBase(MIG, (await md5Base(c))[SIG]));
    const RD = await jouer(c);
    ok(egal(RD, RB), 'D : les six cas reviennent exactement à B');
  } finally {
    await c.end().catch(() => {});
    await base.arreter();
  }
  console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}
