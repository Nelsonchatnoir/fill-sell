// LE BANC de la migration 20261113140000_ventes_beebs_cinq_gardes (13/11/2026, point 3b de Nico : ventes Beebs — garde
// d'âge de la commande, annulation défaite, prix lu, comptes reliés ; mail et notification seulement pour une commande de
// moins de 24 h) — SUR UN POSTGRES JETABLE (embedded-postgres sur le poste), jamais la prod.
//   node scripts/essais/20261113140000_banc.mjs
// Décor : la prod du 13/11 réduite à la chaîne de la vente Beebs (fixtures/prod-1311-ventes-beebs/catalogue.json,
// scripts/essais/20261113140000_fixture.mjs) : 226 fonctions de prod (corps sans commentaires, md5 contrôlés), TOUS les
// déclencheurs de prod de inventaire, cross_post_jobs, inventaire_doublons, ventes, ventes_operations ; commandes_beebs_noter
// installée MOT POUR MOT depuis la définition de prod (l'inverse : md5 aa1ff957…).
// Les lectures de la page des ventes sont jouées comme l'extension (rôle `authenticated`, identité du compte qui lit, sous
// RLS), la vente comme le cron (ventes_prouvees_tick), dans UNE transaction annulée ; l'interrupteur
// ventes_beebs_commandes est mis à 1 DANS la base jetable seulement (le chemin qui écrit), puis à 0 (fantôme).
// Les cas (comptes d'essai A, B relié à A, C tiers ; valeurs inventées, cas réels cités par l'id8 du compte) :
// Ordre des produits de la 1re lecture (verdicts) : G1, G2, G3, G4×3, G5, G6, G7, G8, G9, G10.
//   G1 garde d'âge (a99e2876, faf5021a, d71db658 : commandes 2023-2025 relues à chaque lecture) — commande de 2025 sur une
//      annonce importée par un relevé il y a 18 jours ;
//   G2 prix lu — commande d'il y a 2 h, offre acceptée 9,50 € sur une annonce à 12 € ;
//   G3 mail — commande de 3 jours dont la disparition n'a été vue qu'il y a 2 h ;
//   G4 lot (447d920c, commande 1723956 : 5 produits, 10,50 €) — 3 produits à 2, 3 et 5 € vendus 9 € ensemble ;
//   G5 annulation APRÈS l'enregistrement (WAIT_SELLER_CONFIRM puis CANCELLED), copies Leboncoin (en file) et Vinted
//      (déjà retirée) ; relue une seconde fois ;
//   G6 annulation AVANT l'enregistrement : preuve levée (inchangé) ;
//   G7 comptes reliés (faf5021a / 447d920c, seule paire du parc) — l'annonce n'est suivie que par le compte relié ;
//   G8 comptes reliés — la même annonce suivie par les deux (import chez A, dépôt chez B), chacun lit la page ;
//   G9 un tiers non relié qui porte le même numéro : jamais touché ;
//   G10 plusieurs exemplaires (quantité 2) : vente puis annulation ;
//   G11 fantôme (interrupteur à 0) : rien écrit, verdicts au bilan.
// Étapes : A. AVANT (prod) — les défauts se reproduisent ; garde : la migration refuse une définition autre que la prod ;
// B. MIGRATION (jouée deux fois) — corrigé, le reste identique ; C. INVERSE — la prod à l'octet, A de nouveau ;
// D. MIGRATION rejouée — B de nouveau.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { demarrerBase, ouvrir, construireDecor, outils, ROOT, A, B, C } from './20261111140000_decor.mjs';
import { jetonsSql } from './20261111140000_fixture.mjs';

export const FIXTURE = 'scripts/essais/fixtures/prod-1311-ventes-beebs/catalogue.json';
export const MIGRATION = 'supabase/migrations/20261113140000_ventes_beebs_cinq_gardes.sql';
export const INVERSE = 'supabase/rollbacks/20261113140000_ventes_beebs_cinq_gardes_INVERSE.sql';
export const MD5_PROD = 'aa1ff957b15a5eff43f49a54d39e66b3';
export const SIG = 'commandes_beebs_noter(p_rows jsonb, p_user uuid DEFAULT NULL::uuid, p_lecture jsonb DEFAULT NULL::jsonb)';
const REG = "'public.commandes_beebs_noter(jsonb,uuid,jsonb)'::regprocedure";
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
export const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

/** Construit la base jetable : le décor de prod du 13/11, puis commandes_beebs_noter mot pour mot (l'inverse). */
export async function preparer({ port }) {
  const base = await demarrerBase({ port, nom: 'fillsell-banc-ventes-beebs-' });
  const c = await ouvrir(base.url);
  const fixture = JSON.parse(lire(FIXTURE));
  const d = await construireDecor(c, fixture);
  for (const sql of fixture.ddl_apres ?? []) { try { await c.query(sql); } catch (e) { d.echecs.push(`ddl : ${e.message}`); } }
  return { base, c, fixture, d };
}
export async function md5Noter(c) {
  return (await c.query(`SELECT md5(replace(pg_get_functiondef(${REG}), chr(13), '')) AS m`)).rows[0].m;
}
export async function defNoter(c) { return (await c.query(`SELECT pg_get_functiondef(${REG}) AS d`)).rows[0].d; }
export async function neuves(c) {
  return (await c.query(`SELECT to_regprocedure('public.vente_commande_annulee_beebs(bigint,text,text)') IS NOT NULL AS annul,
    to_regprocedure('public.beebs_commande_prix(text[],numeric,jsonb,text)') IS NOT NULL AS prix`)).rows[0];
}

const iso = (ms) => new Date(ms).toISOString();
const H = 3600_000, J = 24 * H;

/** Les cas, joués dans UNE transaction annulée. Rend un état comparable (sans identifiant tiré au sort). */
export async function jouer(c, { ecrit = true } = {}) {
  const t = outils(c);
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const un = async (sql, p = []) => (await q(sql, p))[0] ?? {};
  await c.query('BEGIN');
  try {
    await t.comptes();
    await c.query(`UPDATE coin_config SET value = $1 WHERE key = 'ventes_beebs_commandes'`, [ecrit ? 1 : 0]);
    const lirePage = (user, rows, lecture = { requetes: 1 }) => t.enApp(user, async () =>
      (await un('SELECT public.commandes_beebs_noter($1::jsonb, NULL, $2::jsonb) AS b', [JSON.stringify(rows), JSON.stringify(lecture)])).b);
    const tick = async () => (await un('SELECT public.ventes_prouvees_tick(25, 4000) AS r')).r;
    const verdicts = (b) => (b?.commandes ?? []).flatMap((x) => (x.produits ?? []).map((p) => (typeof p === 'object' ? p.verdict : null)).filter(Boolean));
    const prixLus = (b) => (b?.commandes ?? []).flatMap((x) => (x.produits ?? []).filter((p) => typeof p === 'object').map((p) => p.prix ?? null));
    const etatJob = async (id) => {
      const j = await t.tache(id);
      const pf = j.platform_fields ?? {};
      return { status: j.status, signal: pf.sale_signal ?? null, prix: pf.detected_price ?? null, source: pf.sale_evidence?.source ?? null,
        depuis: pf.unavailable_since ?? null, annulee: pf.vente_annulee ? pf.vente_annulee.annonce : null, preuve_prix: pf.sale_evidence?.prix ?? null };
    };
    const etatFiche = async (user, inv) => {
      const f = await un('SELECT statut, quantite FROM inventaire WHERE id = $1', [inv]);
      const v = await q('SELECT prix_vente::text AS p, plateforme_code AS pf FROM ventes WHERE user_id = $1 AND inventaire_id = $2 ORDER BY id', [user, inv]);
      return { statut: f.statut ?? null, quantite: f.quantite == null ? null : Number(f.quantite), ventes: v.map((x) => `${x.pf}:${Number(x.p)}`) };
    };
    const notes = async (job) => (await q(`SELECT statut FROM push_ventes WHERE job_id = $1 ORDER BY id`, [job])).map((x) => x.statut);
    const retraits = async (user, inv) => (await q(`SELECT platform, status FROM cross_post_jobs WHERE user_id = $1 AND inventaire_id = $2 AND action = 'delete' ORDER BY platform`, [user, inv]))
      .map((r) => `${r.platform}:${r.status}`);
    const IMPORT = { source: 'releve', rattachement: { import: true, par: 'rapprochement' } };
    const maintenant = Date.now();
    const R = {};

    // ── G1. Garde d'âge : une commande de 2025 sur une annonce importée par un relevé il y a 18 jours ──
    const f1 = await t.fiche(A);
    const j1 = await t.depot(A, f1, { platform: 'beebs', il: '18 days', pf: IMPORT });
    // ── G2. Prix lu : commande d'il y a 2 h, 9,50 € sur une annonce à 12 € ; une copie Leboncoin publiée ──
    const f2 = await t.fiche(A);
    const j2 = await t.depot(A, f2, { platform: 'beebs', il: '3 days' });
    const l2 = await t.depot(A, f2, { platform: 'leboncoin', il: '3 days' });
    // ── G3. Commande de 3 jours, disparition vue il y a 2 h ──
    const f3 = await t.fiche(A);
    const j3 = await t.depot(A, f3, { platform: 'beebs', il: '10 days', pf: { unavailable_since: iso(maintenant - 2 * H) } });
    // ── G4. Lot : 3 produits (2, 3, 5 €) vendus 9 € ensemble ──
    const f4 = [await t.fiche(A), await t.fiche(A), await t.fiche(A)];
    const j4 = [];
    for (const [k, prix] of [[0, 2], [1, 3], [2, 5]]) {
      const d = await t.depot(A, f4[k], { platform: 'beebs', il: '4 days' });
      await c.query('UPDATE cross_post_jobs SET price = $2 WHERE id = $1', [d.id, prix]);
      j4.push(d);
    }
    // ── G5. Annulation après l'enregistrement : copies Leboncoin et Vinted publiées ──
    const f5 = await t.fiche(A);
    const j5 = await t.depot(A, f5, { platform: 'beebs', il: '5 days' });
    const l5 = await t.depot(A, f5, { platform: 'leboncoin', il: '5 days' });
    const v5 = await t.depot(A, f5, { platform: 'vinted', il: '5 days' });
    // ── G6. Annulation avant l'enregistrement ──
    const f6 = await t.fiche(A);
    const j6 = await t.depot(A, f6, { platform: 'beebs', il: '6 days' });
    // ── G7. L'annonce n'est suivie que par le compte relié B ──
    const f7 = await t.fiche(B);
    const j7 = await t.depot(B, f7, { platform: 'beebs', il: '7 days' });
    // ── G8. La même annonce suivie par A (import) et B (dépôt) ──
    const f8b = await t.fiche(B);
    const j8b = await t.depot(B, f8b, { platform: 'beebs', il: '8 days' });
    const f8a = await t.fiche(A);
    const j8a = await t.depot(A, f8a, { platform: 'beebs', il: '2 days', num: j8b.num, pf: IMPORT });
    // ── G9. Un tiers non relié porte le même numéro qu'une commande lue par A ──
    const f9 = await t.fiche(C);
    const j9 = await t.depot(C, f9, { platform: 'beebs', il: '9 days' });
    // ── G10. Plusieurs exemplaires (quantité 2) ──
    const f10 = await t.fiche(A, { quantite: 2 });
    const j10 = await t.depot(A, f10, { platform: 'beebs', il: '5 days' });

    const recent = iso(maintenant - 2 * H);
    // Première lecture de la page des ventes par A (les 10 commandes les plus récentes, comme l'extension 0.6.187).
    R.lecture1 = await lirePage(A, [
      { ref: 'G1C2025', statut: 'SELLER_PAID', date: '2025-11-09T13:58:00.000Z', produits: [j1.num], montant: 12 },
      { ref: 'G2OFFRE', statut: 'WAIT_SELLER_CONFIRM', date: recent, produits: [j2.num], montant: 9.5, prix_produits: { [j2.num]: 12 } },
      { ref: 'G3TROISJ', statut: 'IN_DELIVERY', date: iso(maintenant - 3 * J), produits: [j3.num] },
      { ref: 'G4LOT', statut: 'WAIT_SELLER_CONFIRM', date: recent, produits: j4.map((d) => d.num), montant: 9,
        prix_produits: { [j4[0].num]: 2, [j4[1].num]: 3, [j4[2].num]: 5 } },
      { ref: 'G5ANNUL', statut: 'WAIT_SELLER_CONFIRM', date: iso(maintenant - 1 * H), produits: [j5.num] },
      { ref: 'G6AVANT', statut: 'WAIT_SELLER_CONFIRM', date: iso(maintenant - 1 * H), produits: [j6.num] },
      { ref: 'G7RELIE', statut: 'WAIT_SELLER_CONFIRM', date: recent, produits: [j7.num] },
      { ref: 'G8DEUX', statut: 'WAIT_SELLER_CONFIRM', date: recent, produits: [j8b.num] },
      { ref: 'G9TIERS', statut: 'WAIT_SELLER_CONFIRM', date: recent, produits: [j9.num] },
      { ref: 'G10EXEMPL', statut: 'WAIT_SELLER_CONFIRM', date: iso(maintenant - 1 * H), produits: [j10.num] },
    ], { requetes: 1, forme: 'document', voie: 'disparition' });
    // G6 : la commande est annulée AVANT le passage du cron.
    R.lecture6 = await lirePage(A, [{ ref: 'G6AVANT', statut: 'CANCELLED', date: iso(maintenant - 1 * H), produits: [j6.num] }]);
    // B lit la même page (boutique partagée) : la commande G8.
    R.lectureB = await lirePage(B, [{ ref: 'G8DEUX', statut: 'WAIT_SELLER_CONFIRM', date: recent, produits: [j8b.num] }]);
    R.tick1 = await tick();
    // G5 : le retrait Vinted armé par la vente est fait (dépôt clos) ; celui de Leboncoin reste en file.
    const rv5 = (await q(`SELECT id FROM cross_post_jobs WHERE user_id = $1 AND inventaire_id = $2 AND action = 'delete' AND platform = 'vinted'`, [A, f5]))[0];
    if (rv5) await t.executerRetrait(rv5.id);
    R.retraits5avant = await retraits(A, f5);
    R.fiche5vendue = await etatFiche(A, f5);
    R.fiche10vendue = await etatFiche(A, f10);
    // Les commandes G5 et G10 sont annulées (le vendeur a refusé), lues deux fois.
    const annulations = [{ ref: 'G5ANNUL', statut: 'CANCELLED', date: iso(maintenant - 1 * H), produits: [j5.num] },
      { ref: 'G10EXEMPL', statut: 'CANCELLED', date: iso(maintenant - 1 * H), produits: [j10.num] }];
    R.lecture5 = await lirePage(A, annulations);
    R.lecture5bis = await lirePage(A, annulations);
    R.tick2 = await tick();

    const etat = {};
    for (const [k, v] of Object.entries({ j1, j2, l2, j3, j5, j6, j7, j8a, j8b, j9, j10 })) etat[k] = await etatJob(v.id);
    for (const [k, v] of Object.entries({ j4a: j4[0], j4b: j4[1], j4c: j4[2] })) etat[k] = await etatJob(v.id);
    const fiches = {
      f1: await etatFiche(A, f1), f2: await etatFiche(A, f2), f3: await etatFiche(A, f3), f4: [await etatFiche(A, f4[0]), await etatFiche(A, f4[1]), await etatFiche(A, f4[2])],
      f5: await etatFiche(A, f5), f6: await etatFiche(A, f6), f7: await etatFiche(B, f7), f8a: await etatFiche(A, f8a), f8b: await etatFiche(B, f8b),
      f9: await etatFiche(C, f9), f10: await etatFiche(A, f10),
    };
    const pushs = { j2: await notes(j2.id), j3: await notes(j3.id), j7: await notes(j7.id) };
    const supprimees = (await q(`SELECT source, motif FROM ventes_supprimees WHERE user_id = $1 ORDER BY id`, [A])).map((x) => `${x.source}:${x.motif}`);
    const remises = (await q(`SELECT platform, statut FROM remises_en_vente WHERE user_id = $1 AND inventaire_id = $2 ORDER BY platform, statut`, [A, f5])).map((x) => `${x.platform}:${x.statut}`);
    const bilan = (b) => b && ({ mode: b.mode, recues: b.recues, prouvees: b.prouvees_ou_auraient, avant_suivi: b.avant_suivi ?? null,
      compte_relie: b.compte_relie ?? null, annulees: b.annulees, annulee_apres: b.annulee_apres_vente, defaites: b.ventes_defaites ?? null,
      levees: b.preuves_levees, forme: b.forme ?? null, voie: b.voie ?? null, verdicts: verdicts(b), prix: prixLus(b),
      defaites_detail: (b.commandes ?? []).flatMap((x) => (x.ventes_defaites ?? []).map((d) => d.issue)) });
    return {
      lecture1: bilan(R.lecture1), lecture6: bilan(R.lecture6), lectureB: bilan(R.lectureB), lecture5: bilan(R.lecture5), lecture5bis: bilan(R.lecture5bis),
      tick1: { enregistrees: R.tick1.enregistrees, refusees: R.tick1.refusees }, tick2: { enregistrees: R.tick2.enregistrees },
      etat, fiches, pushs, supprimees, remises, retraits5avant: R.retraits5avant, retraits5: await retraits(A, f5), retraits2: await retraits(A, f2),
      fiche5vendue: R.fiche5vendue, fiche10vendue: R.fiche10vendue,
      depuis3: etat.j3.depuis ? Math.round((maintenant - Date.parse(etat.j3.depuis)) / H) : null,
    };
  } finally {
    await c.query('ROLLBACK');
  }
}

/** La répartition du prix (fonction neuve, pure) sur des cas de prod et des bords. */
export async function prix(c, produits, montant, prixProduits, devise = null) {
  return (await c.query('SELECT public.beebs_commande_prix($1::text[], $2::numeric, $3::jsonb, $4) AS r',
    [produits, montant, prixProduits == null ? null : JSON.stringify(prixProduits), devise])).rows[0].r;
}

// ── Le banc ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const principal = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (principal) {
  let n = 0, ko = 0;
  const ok = (cond, msg, detail) => {
    n++;
    if (cond) { console.log(`  ✓ ${msg}`); return; }
    ko++;
    console.log(`  ✗ ${msg}${detail === undefined ? '' : `\n      ← ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1200)}`}`);
  };
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const { base, c, fixture, d } = await preparer({ port: 54000 + Math.floor(Math.random() * 2000) });
  try {
    ok(d.echecs.length === 0 && d.nf === d.nfTotal && d.nt === d.ntTotal,
      `décor de prod : ${d.nf}/${d.nfTotal} fonctions, ${d.nt}/${d.ntTotal} déclencheurs, ${d.np}/${d.npTotal} politiques`, d.echecs.slice(0, 5));
    ok(fixture.md5_prod[SIG] === MD5_PROD, `la fixture porte le md5 de prod de commandes_beebs_noter (${MD5_PROD})`, fixture.md5_prod[SIG]);
    const DEF_FIXTURE = fixture.fonctions.find((f) => `${f.nom}(${f.args})` === SIG).def;
    const MIG = lire(MIGRATION), INV = lire(INVERSE);
    // La définition de prod, mot pour mot : l'inverse (aucun client dans ses commentaires) ; même code que la fixture.
    await c.query(INV);
    ok(await md5Noter(c) === MD5_PROD, "l'inverse installe la définition de PROD mot pour mot (md5 aa1ff957…)");
    ok(egal(jetonsSql(await defNoter(c)), jetonsSql(DEF_FIXTURE)), 'même code que la fixture de prod, jeton pour jeton');
    ok(!(await neuves(c)).annul && !(await neuves(c)).prix, 'les deux fonctions neuves n\'existent pas en prod');

    console.log('A. AVANT — les définitions de prod du 13/11');
    const RA = await jouer(c);
    ok(RA.lecture1.verdicts[0] === 'prouvee' && RA.etat.j1.signal === 'sold', 'A · G1 : LE DÉFAUT — une commande de 2025 prouve la vente d\'une annonce importée il y a 18 jours', [RA.lecture1.verdicts, RA.etat.j1]);
    ok(RA.etat.j2.status === 'sold' && egal(RA.fiches.f2.ventes, ['beebs:12']), 'A · G2 : LE DÉFAUT — offre de 9,50 € enregistrée au prix de l\'annonce (12 €)', RA.fiches.f2);
    ok(RA.pushs.j3.includes('a_envoyer'), 'A · G3 : LE DÉFAUT — mail et notification pour une commande de 3 jours (disparition vue il y a 2 h)', RA.pushs.j3);
    ok(egal(RA.fiches.f4.map((f) => f.ventes[0]), ['beebs:2', 'beebs:3', 'beebs:5']), 'A · G4 : LE DÉFAUT — lot de 9 € enregistré 2 + 3 + 5 = 10 €', RA.fiches.f4);
    ok(RA.fiche5vendue.statut === 'vendu' && RA.fiches.f5.statut === 'vendu' && RA.lecture5.annulee_apres === 2 && RA.fiches.f5.ventes.length === 1,
      'A · G5 : LE DÉFAUT — commande annulée après l\'enregistrement : vente gardée, fiche « vendu »', [RA.fiches.f5, RA.lecture5]);
    ok(RA.retraits5.includes('leboncoin:pending'), 'A · G5 : le retrait Leboncoin armé par la vente reste en file', RA.retraits5);
    ok(RA.etat.j6.status === 'published' && RA.etat.j6.signal === null && RA.lecture6.levees === 1, 'A · G6 : annulée avant le cron — preuve levée (comme après)', RA.etat.j6);
    ok(RA.etat.j7.status === 'published' && RA.etat.j7.signal === null && RA.lecture1.verdicts[8] === 'sans_job', 'A · G7 : LE DÉFAUT — la commande lue par A n\'atteint pas l\'annonce de son compte relié B', [RA.etat.j7, RA.lecture1.verdicts]);
    ok(RA.etat.j8a.status === 'sold' && RA.etat.j8b.status === 'sold' && RA.fiches.f8a.ventes.length === 1 && RA.fiches.f8b.ventes.length === 1,
      'A · G8 : LE DÉFAUT — une commande, DEUX ventes (A sur son import, B sur son dépôt)', [RA.etat.j8a, RA.etat.j8b, RA.fiches.f8a, RA.fiches.f8b]);
    ok(RA.etat.j9.status === 'published' && RA.etat.j9.signal === null, 'A · G9 : un tiers non relié n\'est jamais touché');

    // La garde : la migration telle quelle refuse une définition qui n'est pas celle de prod (ni la règle du 13/11).
    await c.query(`CREATE OR REPLACE FUNCTION public.commandes_beebs_noter(p_rows jsonb, p_user uuid DEFAULT NULL::uuid, p_lecture jsonb DEFAULT NULL::jsonb)
      RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$`);
    let refus = null;
    try { await c.query(MIG); } catch (e) { refus = e.message; await c.query('ROLLBACK').catch(() => {}); }
    ok(/a changé en prod depuis sa lecture du 13\/11/.test(refus ?? '') && !(await neuves(c)).annul, 'garde : la migration refuse une définition autre que celle de prod (rien n\'est créé)', refus);
    await c.query(INV);

    console.log('B. MIGRATION (jouée deux fois)');
    await c.query(MIG);
    await c.query(MIG);
    ok((await neuves(c)).annul && (await neuves(c)).prix, 'B : vente_commande_annulee_beebs et beebs_commande_prix existent');
    const droits = (await c.query(`SELECT p.proname, p.proacl::text AS acl FROM pg_proc p WHERE p.proname IN ('vente_commande_annulee_beebs', 'beebs_commande_prix', 'commandes_beebs_noter') ORDER BY 1`)).rows;
    ok(droits.filter((x) => x.proname !== 'commandes_beebs_noter').every((x) => !/authenticated|anon|=X\/postgres,=X/.test(x.acl) && /service_role=X/.test(x.acl))
      && /authenticated=X/.test(droits.find((x) => x.proname === 'commandes_beebs_noter').acl), 'B : droits — les neuves : postgres et service_role seulement ; commandes_beebs_noter : inchangés (authenticated)', droits);
    const RB = await jouer(c);
    ok(RB.lecture1.verdicts[0] === 'avant_suivi' && RB.etat.j1.signal === null && RB.etat.j1.status === 'published' && RB.fiches.f1.ventes.length === 0 && RB.lecture1.avant_suivi === 1,
      'B · G1 : commande d\'avant le suivi → « avant_suivi », rien écrit, aucune vente', [RB.lecture1.verdicts, RB.etat.j1, RB.fiches.f1]);
    ok(egal(RB.fiches.f2.ventes, ['beebs:9.5']) && Number(RB.etat.j2.preuve_prix) === 9.5, 'B · G2 : la vente prend le prix LU sur la commande (9,50 €)', [RB.fiches.f2, RB.etat.j2]);
    ok(RB.pushs.j2.includes('a_envoyer'), 'B · G2 : commande de 2 h → mail et notification (inchangé)', RB.pushs.j2);
    ok(!RB.pushs.j3.includes('a_envoyer') && RB.depuis3 === 72 && egal(RB.fiches.f3.ventes, ['beebs:12']),
      'B · G3 : commande de 3 jours → la vente s\'enregistre, AUCUN mail ni notification (unavailable_since = date de la commande)', [RB.pushs.j3, RB.depuis3, RB.fiches.f3]);
    ok(egal(RB.fiches.f4.map((f) => f.ventes[0]), ['beebs:1.8', 'beebs:2.7', 'beebs:4.5']), 'B · G4 : le lot de 9 € réparti au prorata : 1,80 + 2,70 + 4,50', RB.fiches.f4);
    ok(RB.fiche5vendue.statut === 'vendu' && RB.fiches.f5.statut === 'stock' && Number(RB.fiches.f5.quantite) === 1 && RB.fiches.f5.ventes.length === 0,
      'B · G5 : annulée après l\'enregistrement → vente retirée, fiche rendue au stock', [RB.fiche5vendue, RB.fiches.f5]);
    ok(RB.retraits5.includes('leboncoin:cancelled') && RB.retraits5.includes('vinted:deleted') && RB.remises.includes('vinted:proposee'),
      'B · G5 : retrait Leboncoin en file arrêté ; copie Vinted déjà retirée → remise en vente PROPOSÉE', [RB.retraits5, RB.remises]);
    ok(RB.etat.j5.status === 'published' && RB.etat.j5.signal === null && RB.etat.j5.annulee === 'a_relire' && RB.etat.j5.source === null,
      'B · G5 : l\'annonce Beebs redevient « publiée », à relire par la veille (preuve rangée dans vente_annulee)', RB.etat.j5);
    ok(RB.lecture5.defaites === 2 && egal(RB.lecture5.defaites_detail, ['retiree', 'retiree']) && RB.lecture5bis.defaites === 0 && RB.lecture5bis.annulee_apres === 0 && RB.tick2.enregistrees === 0,
      'B · G5 : relue une seconde fois → rien de plus ; le cron ne la réenregistre pas', [RB.lecture5, RB.lecture5bis, RB.tick2]);
    ok(egal(RB.supprimees, ['commande_beebs:commande_cancelled', 'commande_beebs:commande_cancelled']), 'B · G5/G10 : chaque vente retirée est tracée (ventes_supprimees)', RB.supprimees);
    ok(RB.fiche10vendue.statut === 'stock' && Number(RB.fiche10vendue.quantite) === 1 && RB.fiches.f10.statut === 'stock' && Number(RB.fiches.f10.quantite) === 2 && RB.fiches.f10.ventes.length === 0,
      'B · G10 : plusieurs exemplaires — 2 → 1 à la vente, rendu à 2 par l\'annulation', [RB.fiche10vendue, RB.fiches.f10]);
    ok(egal(RB.etat.j6, RA.etat.j6) && RB.lecture6.levees === 1, 'B · G6 : annulée avant le cron — preuve levée, comme en A');
    ok(RB.etat.j7.status === 'sold' && RB.fiches.f7.ventes.length === 1 && RB.lecture1.verdicts[8] === 'prouvee' && RB.lecture1.compte_relie === 2 && RB.pushs.j7.includes('a_envoyer'),
      'B · G7 : la commande lue par A prouve la vente de l\'annonce de son compte relié B (une vente, chez B, son mail)', [RB.etat.j7, RB.fiches.f7, RB.lecture1]);
    ok(RB.etat.j8a.status === 'published' && RB.etat.j8a.signal === null && RB.fiches.f8a.ventes.length === 0 && RB.etat.j8b.status === 'sold' && RB.fiches.f8b.ventes.length === 1
      && RB.lectureB.verdicts[0] === 'deja_prouvee',
      'B · G8 : une commande, UNE vente — chez le compte qui a DÉPOSÉ l\'annonce (B) ; la lecture de B la trouve déjà prouvée', [RB.etat.j8a, RB.etat.j8b, RB.lectureB]);
    ok(egal(RB.etat.j9, RA.etat.j9) && RB.lecture1.verdicts[10] === 'sans_job', 'B · G9 : le tiers non relié n\'est jamais touché');
    ok(RB.lecture1.forme === 'document' && RB.lecture1.voie === 'disparition' && RA.lecture1.forme === null, 'B : le bilan dit par où la page a été lue (forme, voie)', [RA.lecture1, RB.lecture1]);
    ok(RB.lecture1.prix.includes(9.5) && RB.lecture1.prix.includes(1.8), 'B : le bilan porte le prix lu par produit', RB.lecture1.prix);

    console.log('B bis. Fantôme (interrupteur à 0) : rien écrit');
    const RF = await jouer(c, { ecrit: false });
    ok(RF.lecture1.mode === 'fantome' && Object.values(RF.etat).every((e) => e.signal === null || e.depuis) && RF.tick1.enregistrees === 0 && RF.fiches.f2.ventes.length === 0,
      'fantôme : aucune preuve posée, aucune vente', [RF.lecture1, RF.tick1]);
    ok(RF.lecture1.verdicts[0] === 'avant_suivi' && RF.lecture1.verdicts[1] === 'aurait_prouve' && RF.lecture1.verdicts[8] === 'aurait_prouve', 'fantôme : les verdicts au bilan (avant_suivi, aurait_prouve, compte relié)', RF.lecture1.verdicts);

    console.log('B ter. La répartition du prix (beebs_commande_prix)');
    const [p1, p2, p3, p4, p5] = ['34200615', '34200624', '34292479', '34292493', '34292511'];
    const lot = await prix(c, [p1, p2, p3, p4, p5], 10.5, { [p1]: 1.5, [p2]: 2, [p3]: 3, [p4]: 2, [p5]: 2 });
    ok(egal(Object.values(lot).map((x) => [Number(x.prix), x.source]), [[1.5, 'produit'], [2, 'produit'], [3, 'produit'], [2, 'produit'], [2, 'produit']]),
      'lot de 447d920c (commande 1723956 : 10,50 € = 1,5 + 2 + 3 + 2 + 2) → le prix de chaque produit', lot);
    const egales = await prix(c, [p1, p2, p3], 10, { [p1]: 4 });
    ok(egal(Object.values(egales).map((x) => Number(x.prix)), [3.34, 3.33, 3.33]) && Object.values(egales).every((x) => x.source === 'parts_egales'), 'un prix manque : parts égales, centimes au plus grand reste (somme 10 €)', egales);
    const seul = await prix(c, [p1], 12, { [p1]: 15 });
    ok(Number(seul[p1].prix) === 12 && seul[p1].source === 'commande', 'un produit : le montant de la commande', seul);
    ok(egal(await prix(c, [p1], null, null), {}) && egal(await prix(c, [p1, p2], 10, { [p1]: 5, [p2]: 5 }, 'USD'), {}), 'rien de lu, ou une autre monnaie : aucun prix (celui de la tâche)');
    const sansMontant = await prix(c, [p1, p2], null, { [p1]: 5 });
    ok(egal(Object.keys(sansMontant), [p1]) && Number(sansMontant[p1].prix) === 5, 'sans montant : le prix de chaque produit lu, rien pour les autres', sansMontant);

    console.log('B quater. Annulation : interrupteur de pause, vente saisie');
    await c.query('BEGIN');
    try {
      const t = outils(c);
      await t.comptes();
      const f = await t.fiche(A, { statut: 'vendu', quantite: 0 });
      const jx = await t.depot(A, f, { platform: 'beebs', status: 'sold', pf: { sale_evidence: { source: 'commande_beebs', commande: 'SAISIE1' } } });
      const v = (await c.query(`INSERT INTO ventes (user_id, inventaire_id, titre, prix_vente, plateforme, plateforme_code, annonce_id, quantite, statut)
        VALUES ($1, $2, 'Article d''essai', 12, 'Beebs', 'beebs', $3, 1, 'vendu') RETURNING id`, [A, f, jx.num])).rows[0].id;
      const r1 = (await c.query('SELECT public.vente_commande_annulee_beebs($1, $2, $3) AS r', [v, 'SAISIE1', 'CANCELLED'])).rows[0].r;
      const r2 = (await c.query('SELECT public.vente_commande_annulee_beebs($1, $2, $3) AS r', [v, 'SAISIE1', 'CANCELLED'])).rows[0].r;
      const traces = (await c.query(`SELECT count(*)::int AS n FROM usage_logs WHERE user_id = $1 AND feature = 'vente_beebs_commande_annulee'`, [A])).rows[0].n;
      const reste = (await c.query('SELECT count(*)::int AS n FROM ventes WHERE id = $1', [v])).rows[0].n;
      ok(r1.action === 'signalee' && r2.action === 'signalee' && traces === 1 && reste === 1, 'une vente SAISIE (sans reçu de la preuve) n\'est jamais retirée : signalée une fois', [r1, traces, reste]);
      await c.query(`UPDATE coin_config SET value = 1 WHERE key = 'ventes_annulees_retrait_pause'`);
      const r3 = (await c.query('SELECT public.vente_commande_annulee_beebs($1, $2, $3) AS r', [v, 'SAISIE1', 'CANCELLED'])).rows[0].r;
      ok(r3.action === 'en_pause', 'ventes_annulees_retrait_pause = 1 : rien n\'est retiré (« en_pause »)', r3);
    } finally { await c.query('ROLLBACK'); }

    const changes = ['j1', 'j2', 'j5', 'j7', 'j8a', 'j3', 'j4a', 'j4b', 'j4c', 'j10'];
    const memes = Object.keys(RA.etat).filter((k) => !changes.includes(k) && !egal(RA.etat[k], RB.etat[k]));
    ok(memes.length === 0, `B : les autres tâches identiques à A (${Object.keys(RA.etat).length - changes.length})`, memes.map((k) => [k, RA.etat[k], RB.etat[k]]));

    console.log('C. INVERSE');
    await c.query(INV);
    ok(await md5Noter(c) === MD5_PROD && !(await neuves(c)).annul && !(await neuves(c)).prix, "C : la définition de prod à l'octet (md5), les fonctions neuves retirées");
    const RC = await jouer(c);
    const sansHeure = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'depuis' ? null : v)));
    ok(egal(sansHeure(RC), sansHeure(RA)), 'C : tous les cas reviennent exactement à A (défauts compris)', { RA: RA.lecture1, RC: RC.lecture1 });

    console.log('D. MIGRATION rejouée');
    await c.query(MIG);
    const RD = await jouer(c);
    ok(egal(sansHeure(RD), sansHeure(RB)), 'D : tous les cas reviennent exactement à B');
  } finally {
    await c.end().catch(() => {});
    await base.arreter();
  }
  console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}
