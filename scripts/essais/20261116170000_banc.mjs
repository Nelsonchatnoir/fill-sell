// LE BANC de la migration 20261116170000_ventes_beebs_historique (16/11/2026, point 8 de Nico : l'historique complet des
// ventes Beebs, en silence) — SUR UN POSTGRES JETABLE (embedded-postgres sur le poste), jamais la prod.
//   node scripts/essais/20261116170000_banc.mjs
// Décor : la prod du 13/11 réduite à la chaîne de la vente Beebs (fixtures/prod-1311-ventes-beebs/catalogue.json : tables,
// déclencheurs de `ventes` — dont ventes_push_releve —, RLS), puis les définitions de PROD du 16/11 des fonctions lues par
// la migration (fixtures/prod-1611-ventes-beebs-historique/fonctions.json : _ts_ou_null, beebs_commande_classe,
// beebs_commande_prix, commandes_beebs_noter, ecriture_poste_hors_cloud, push_trg_ventes ; corps sans commentaires,
// md5_prod gardé). Les lectures sont jouées comme l'extension (rôle `authenticated`, identité du compte, sous RLS), chaque
// jeu dans UNE transaction annulée. Comptes d'essai A, B relié à A, C tiers ; valeurs inventées.
// Étapes : A. AVANT — la fonction n'existe pas (aucune vente Beebs n'entre par une lecture) ; B. MIGRATION (jouée deux
// fois) — les cas H1…H13 ; C. INVERSE — retour à l'état d'avant (fonctions de prod intactes à l'octet) ; D. MIGRATION
// rejouée — B de nouveau.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { demarrerBase, ouvrir, construireDecor, outils, ROOT, A, B, C } from './20261111140000_decor.mjs';

export const FIXTURE = 'scripts/essais/fixtures/prod-1311-ventes-beebs/catalogue.json';
export const FONCTIONS_1611 = 'scripts/essais/fixtures/prod-1611-ventes-beebs-historique/fonctions.json';
export const MIGRATION = 'supabase/migrations/20261116170000_ventes_beebs_historique.sql';
export const INVERSE = 'supabase/rollbacks/20261116170000_ventes_beebs_historique_INVERSE.sql';
const REG = "to_regprocedure('public.ventes_beebs_historique_noter(jsonb,jsonb)')";
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

export async function preparer({ port }) {
  const base = await demarrerBase({ port, nom: 'fillsell-banc-beebs-historique-' });
  const c = await ouvrir(base.url);
  const fixture = JSON.parse(lire(FIXTURE));
  const d = await construireDecor(c, fixture);
  for (const sql of fixture.ddl_apres ?? []) { try { await c.query(sql); } catch (e) { d.echecs.push(`ddl : ${e.message}`); } }
  // Ce que la prod a de plus que le décor du 13/11 et que la migration lit : la table des postes Cloud (14/11).
  await c.query('CREATE TABLE IF NOT EXISTS public.cloud_postes (user_id uuid, session_fillsell_id uuid)');
  for (const f of JSON.parse(lire(FONCTIONS_1611)).fonctions) {
    try { await c.query(f.def); } catch (e) { d.echecs.push(`fonction 16/11 ${f.nom} : ${e.message}`); }
  }
  return { base, c, fixture, d };
}

const md5Public = async (c) => Object.fromEntries((await c.query(`SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS f,
  md5(pg_get_functiondef(p.oid)) AS m FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace`)).rows.map((r) => [r.f, r.m]));
export const existe = async (c) => (await c.query(`SELECT ${REG} IS NOT NULL AS e`)).rows[0].e;

const iso = (ms) => new Date(ms).toISOString();
const H = 3600_000, J = 24 * H;

/** Les cas H1…H13, dans UNE transaction annulée. Rend un état comparable (sans identifiant tiré au sort). */
export async function jouer(c) {
  const t = outils(c);
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const un = async (sql, p = []) => (await q(sql, p))[0] ?? {};
  await c.query('BEGIN');
  try {
    await t.comptes();
    await c.query(`UPDATE coin_config SET value = 0 WHERE key = 'ventes_beebs_commandes'`);
    const noter = (user, rows, lecture = { requetes: 1, voie: 'entretien', forme: 'document', liste_total: rows.length }) => t.enApp(user, async () =>
      (await un('SELECT public.ventes_beebs_historique_noter($1::jsonb, $2::jsonb) AS b', [JSON.stringify(rows), JSON.stringify(lecture)])).b);
    const maintenant = Date.now();
    let n = 41000000;
    const num = () => String(n++);
    const cmd = (ref, { statut = 'SELLER_PAID', il = 30 * J, produits = [{ id: num(), titre: `Article ${ref}`, prix: 10 }], montant = 10, total = 12, date } = {}) =>
      ({ ref, statut, date: date === undefined ? iso(maintenant - il) : date, produits, ...(montant != null ? { montant } : {}), ...(total != null ? { total } : {}) });
    const R = {};

    // ── Mise en scène ──
    // H5 : un produit suivi par une tâche Beebs publiée il y a 60 jours, commande d'il y a 10 jours → circuit vivant.
    const f5 = await t.fiche(A);
    const j5 = await t.depot(A, f5, { platform: 'beebs', il: '60 days' });
    // H6 : une tâche importée il y a 5 jours sur un produit vendu il y a 400 jours → historique ; la fiche est EN STOCK.
    const f6 = await t.fiche(A);
    const j6 = await t.depot(A, f6, { platform: 'beebs', il: '5 days', pf: { source: 'releve' } });
    // H7 : une vente Beebs supprimée par la personne (pierre tombale).
    await c.query(`INSERT INTO ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, supprimee_le, source)
      VALUES ($1, 'beebs', 'R7', NULL, 'Supprimée', 9, now() - interval '3 days', 'app')`, [A]);
    // H8 : la même cession — fiche VENDUE (annonce Beebs relevée), une vente saisie Beebs sans commande, 15 €.
    const f8 = await t.fiche(A, { statut: 'vendu' });
    const n8 = num();
    await t.annonce(A, f8, { platform: 'beebs', num: n8 });
    await c.query(`INSERT INTO ventes (user_id, titre, prix_vente, date, plateforme, plateforme_code, inventaire_id, quantite, statut, source)
      VALUES ($1, 'Vente saisie', 15, current_date - 40, 'beebs', 'beebs', $2, 1, 'vendu', 'manuel')`, [A, f8]);
    // H14 : le point final (enregistrer_vente_atomique) a déjà enregistré la cession de ce numéro (son reçu), sans annonce_id.
    const n14 = num();
    await c.query(`INSERT INTO ventes_operations (user_id, cle, resultat) VALUES ($1, $2, '{"ventes_ids": [1]}'::jsonb)`, [A, `annonce:beebs:${n14}`]);
    // H11 : la commande R11 est déjà enregistrée chez le compte relié B.
    await c.query(`INSERT INTO ventes (user_id, titre, prix_vente, date, vendu_le, plateforme, plateforme_code, commande_ref, quantite, statut, source)
      VALUES ($1, 'Chez B', 11, current_date - 20, now() - interval '20 days', 'beebs', 'beebs', 'R11', 1, 'vendu', 'releve')`, [B]);

    const avant = {
      push: Number((await un('SELECT count(*) AS n FROM push_ventes')).n),
      net: Number((await un('SELECT count(*) AS n FROM net._appels')).n),
      jobs: JSON.stringify(await q(`SELECT id, status, platform_fields, inventaire_id FROM cross_post_jobs ORDER BY id`)),
      fiches: JSON.stringify(await q(`SELECT id, statut, prix_vente, quantite FROM inventaire ORDER BY id`)),
      annonces: JSON.stringify(await q(`SELECT id, statut_plateforme, inventaire_id FROM annonces_plateforme ORDER BY id`)),
    };

    // ── H1 : 18 commandes terminées (forme de faf5021a : 07/2023 → 02/2026), une requête ──
    const h1 = [];
    for (let k = 0; k < 18; k++) h1.push(cmd(`H1-${k}`, { il: (60 + k * 50) * J }));
    // H2 trop récente (30 h) ; H3 annulée ; H4 livrée pas encore terminée ; H12 sans date.
    const h2 = cmd('H2', { il: 30 * H });
    const h3 = cmd('H3', { statut: 'CANCELLED' });
    const h4 = cmd('H4', { statut: 'DELIVERED', il: 10 * J });
    const h12 = cmd('H12', { date: null });
    const h5 = cmd('H5', { il: 10 * J, produits: [{ id: j5.num, titre: 'Suivie', prix: 10 }] });
    const h6 = cmd('H6', { il: 400 * J, produits: [{ id: j6.num, titre: 'Avant le suivi', prix: 10 }] });
    const h7 = cmd('R7');
    const h8 = cmd('H8', { il: 39 * J, produits: [{ id: n8, titre: 'Même cession', prix: 14 }], montant: 14, total: 16 });
    // H9 : un lot de 3 produits (2, 3, 5 €) vendu 9 € (total 10,50) → une vente par produit, au prorata.
    const h9 = cmd('H9', { produits: [{ id: num(), titre: 'Lot a', prix: 2 }, { id: num(), titre: 'Lot b', prix: 3 }, { id: num(), titre: 'Lot c', prix: 5 }], montant: 9, total: 10.5 });
    // H10 : unité non prouvée (montant 1200 pour un total de 12 : des centimes ?) → prix inconnu, jamais ×100.
    const h10 = cmd('H10', { montant: 1200, total: 12, produits: [{ id: num(), titre: 'Centimes ?', prix: 1200 }] });
    const h10b = cmd('H10b', { total: null });
    const h11 = cmd('R11');
    const h14 = cmd('H14', { produits: [{ id: n14, titre: 'Reçu du point final', prix: 10 }] });
    const lot1 = [...h1, h2, h3, h4, h12, h5, h6, h7, h8, h9, h10, h10b, h11, h14];
    const b1 = await noter(A, lot1);
    R.bilan1 = Object.fromEntries(['mode', 'recues', 'produits', 'creees', 'completees', 'deja', 'suivie', 'supprimee', 'autre_compte',
      'trop_recente', 'en_cours', 'annulees', 'date_inconnue', 'fiche_liee', 'fiche_en_stock', 'sans_fiche', 'prix_inconnus', 'liste_total']
      .map((k) => [k, b1?.[k] ?? null]));
    R.a_relire = [...(b1?.a_relire ?? [])].sort();
    R.ventesH1 = Number((await un(`SELECT count(*) AS n FROM ventes WHERE user_id = $1 AND commande_ref LIKE 'H1-%' AND source = 'releve'
      AND plateforme_code = 'beebs' AND prix_vente = 10 AND frais_plateforme IS NULL AND vendu_le IS NOT NULL AND titre LIKE 'Article H1-%'`, [A])).n);
    R.h2_h3_h4_h12 = Number((await un(`SELECT count(*) AS n FROM ventes WHERE user_id = $1 AND commande_ref IN ('H2','H3','H4','H12')`, [A])).n);
    R.h5 = Number((await un(`SELECT count(*) AS n FROM ventes WHERE user_id = $1 AND (commande_ref = 'H5' OR annonce_id = $2)`, [A, j5.num])).n);
    R.h6 = await un(`SELECT inventaire_id, prix_vente::text AS p FROM ventes WHERE user_id = $1 AND commande_ref = 'H6'`, [A]);
    R.h6_fiche = (await un(`SELECT statut FROM inventaire WHERE id = $1`, [f6])).statut;
    R.h7 = Number((await un(`SELECT count(*) AS n FROM ventes WHERE user_id = $1 AND commande_ref = 'R7'`, [A])).n);
    R.h8 = await q(`SELECT commande_ref, prix_vente::text AS p, source, (vendu_le IS NOT NULL) AS date_posee, annonce_id = $3 AS annonce FROM ventes
      WHERE user_id = $1 AND inventaire_id = $2 ORDER BY id`, [A, f8, n8]);
    R.h9 = (await q(`SELECT commande_ref, prix_vente::text AS p FROM ventes WHERE user_id = $1 AND commande_ref LIKE 'H9:%' ORDER BY commande_ref`, [A]))
      .map((x) => Number(x.p));
    R.h10 = (await q(`SELECT prix_vente FROM ventes WHERE user_id = $1 AND commande_ref IN ('H10','H10b') ORDER BY commande_ref`, [A])).map((x) => x.prix_vente);
    R.h11 = Number((await un(`SELECT count(*) AS n FROM ventes WHERE user_id = $1 AND commande_ref = 'R11'`, [A])).n);
    R.h14 = Number((await un(`SELECT count(*) AS n FROM ventes WHERE user_id = $1 AND commande_ref = 'H14'`, [A])).n);
    // ── H13 : rejeu de la même liste → aucune ligne neuve, aucune réécrite ──
    const totalAvant = Number((await un(`SELECT count(*) AS n FROM ventes WHERE user_id = $1`, [A])).n);
    const releveAvant = (await un(`SELECT max(releve_le)::text AS m FROM ventes WHERE user_id = $1 AND source = 'releve' AND plateforme_code = 'beebs'`, [A])).m;
    const b2 = await noter(A, lot1);
    R.rejeu = { creees: b2?.creees, completees: b2?.completees, lignes: Number((await un(`SELECT count(*) AS n FROM ventes WHERE user_id = $1`, [A])).n) - totalAvant,
      reecrites: (await un(`SELECT max(releve_le)::text AS m FROM ventes WHERE user_id = $1 AND source = 'releve' AND plateforme_code = 'beebs'`, [A])).m !== releveAvant };
    // ── Silence : aucune note, aucun appel, aucune tâche, aucune fiche ni annonce changée (hors prix vide d'une fiche vendue) ──
    R.silence = {
      push: Number((await un('SELECT count(*) AS n FROM push_ventes')).n) - avant.push,
      net: Number((await un('SELECT count(*) AS n FROM net._appels')).n) - avant.net,
      jobs: JSON.stringify(await q(`SELECT id, status, platform_fields, inventaire_id FROM cross_post_jobs ORDER BY id`)) === avant.jobs,
      fiches: JSON.stringify(await q(`SELECT id, statut, prix_vente, quantite FROM inventaire ORDER BY id`)) === avant.fiches,
      annonces: JSON.stringify(await q(`SELECT id, statut_plateforme, inventaire_id FROM annonces_plateforme ORDER BY id`)) === avant.annonces,
    };
    R.journal = Number((await un(`SELECT count(*) AS n FROM usage_logs WHERE user_id = $1 AND feature = 'ventes_beebs_historique'`, [A])).n);
    // ── Le tiers C ne voit rien de A ; le compte B ne reçoit rien ──
    R.tiers = Number((await un(`SELECT count(*) AS n FROM ventes WHERE user_id IN ($1, $2) AND source = 'releve' AND commande_ref <> 'R11'`, [B, C])).n);
    // ── Fantôme : interrupteur à 0 → bilan seul ──
    await c.query(`UPDATE coin_config SET value = 0 WHERE key = 'ventes_beebs_historique'`);
    const b3 = await noter(A, [cmd('F1')]);
    R.fantome = { mode: b3?.mode, aurait: b3?.aurait_ecrit, lignes: Number((await un(`SELECT count(*) AS n FROM ventes WHERE commande_ref = 'F1'`)).n) };
    await c.query(`DELETE FROM coin_config WHERE key = 'ventes_beebs_historique'`);
    const b4 = await noter(A, [cmd('F2')]);
    R.absent = { mode: b4?.mode, lignes: Number((await un(`SELECT count(*) AS n FROM ventes WHERE commande_ref = 'F2'`)).n) };
    await c.query(`INSERT INTO coin_config (key, value) VALUES ('ventes_beebs_historique', 1)`);
    // ── Compte au Cloud actif lu par un AUTRE poste d'extension → rien ──
    await c.query(`UPDATE profiles SET cloud_voie = true, extension_postes = '{"s-pc": {"build": "2026-11-10T14:10:14Z+ba13a51"}}'::jsonb WHERE id = $1`, [C]);
    await c.query('RESET ROLE');
    await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: C, role: 'authenticated', session_id: 's-pc' })]);
    await c.query('SET ROLE authenticated');
    const b5 = (await un('SELECT public.ventes_beebs_historique_noter($1::jsonb, NULL) AS b', [JSON.stringify([cmd('K1')])])).b;
    await t.commeServeur();
    R.cloud = { mode: b5?.mode, lignes: Number((await un(`SELECT count(*) AS n FROM ventes WHERE commande_ref = 'K1'`)).n) };
    // ── Sans identité : refus ──
    await c.query('SAVEPOINT anonyme');
    R.anonyme = await c.query(`SELECT public.ventes_beebs_historique_noter('[]'::jsonb, NULL)`).then(() => 'accepte', (e) => (/utilisateur inconnu/.test(e.message) ? 'refuse' : e.message));
    await c.query('ROLLBACK TO SAVEPOINT anonyme');
    // ── Droits : anon ne peut pas l'appeler ──
    R.anon = (await un(`SELECT has_function_privilege('anon', ${REG}, 'EXECUTE') AS a, has_function_privilege('authenticated', ${REG}, 'EXECUTE') AS b`));
    return R;
  } finally {
    await c.query('ROLLBACK');
  }
}

/** Les attentes : l'état rendu par jouer() après la migration. */
export function controler(R) {
  const ok = [];
  const v = (nom, cond, det = '') => ok.push({ nom, ok: !!cond, det });
  v('H1 18 commandes terminées → 18 ventes relevées (prix lu, date, titre, frais inconnus)', R.ventesH1 === 18, `ventesH1=${R.ventesH1}`);
  // 31 commandes lues : H1 ×18, H2, H3, H4, H12, H5, H6, R7, H8, H9, H10, H10b, R11, H14 ; créées : 18 + H6 + 3 (H9) + 2 (H10).
  v('bilan : mode écrit, 31 reçues, 24 créées, liste_total mesurée', R.bilan1.mode === 'ecrit' && R.bilan1.recues === 31 && R.bilan1.creees === 24
    && R.bilan1.liste_total === 31, JSON.stringify(R.bilan1));
  v('H2/H3/H4/H12 (30 h, annulée, livrée, sans date) → aucune vente', R.h2_h3_h4_h12 === 0 && R.bilan1.trop_recente === 1 && R.bilan1.annulees === 1
    && R.bilan1.en_cours === 1 && R.bilan1.date_inconnue === 1, `n=${R.h2_h3_h4_h12}`);
  v('a_relire = H12, H2, H4 (jamais réglées par le poste)', JSON.stringify(R.a_relire) === JSON.stringify(['H12', 'H2', 'H4']), JSON.stringify(R.a_relire));
  v('H5 produit suivi avant la commande → laissé au circuit vivant, 0 vente', R.h5 === 0 && R.bilan1.suivie === 1, `h5=${R.h5}`);
  v('H6 commande d\'avant le suivi → vente sans fiche, fiche EN STOCK intacte', R.h6.inventaire_id == null && Number(R.h6.p) === 10 && R.h6_fiche === 'stock'
    && R.bilan1.fiche_en_stock === 1, JSON.stringify(R.h6) + R.h6_fiche);
  v('H7 vente supprimée par la personne → jamais recréée', R.h7 === 0 && R.bilan1.supprimee === 1, `h7=${R.h7}`);
  v('H8 même cession → la vente saisie est COMPLÉTÉE (commande, date, annonce), son prix gardé, pas doublée',
    R.h8.length === 1 && R.h8[0].commande_ref === 'H8' && Number(R.h8[0].p) === 15 && R.h8[0].source === 'manuel' && R.h8[0].date_posee && R.h8[0].annonce
    && R.bilan1.completees === 1 && R.bilan1.fiche_liee === 1, JSON.stringify(R.h8));
  v('H9 lot de 3 → 3 ventes, 9 € au prorata (1,80 · 2,70 · 4,50)', JSON.stringify(R.h9) === JSON.stringify([1.8, 2.7, 4.5]), JSON.stringify(R.h9));
  v('H10 unité non prouvée (1200 pour 12 €, ou sans total) → prix inconnu, jamais ×100', JSON.stringify(R.h10) === JSON.stringify([null, null]) && R.bilan1.prix_inconnus === 2, JSON.stringify(R.h10));
  v('H11 commande déjà chez le compte relié → jamais une 2e fois', R.h11 === 0 && R.bilan1.autre_compte === 1, `h11=${R.h11}`);
  v('H14 reçu du point final (ventes_operations « annonce:beebs:<n°> ») → jamais une seconde vente', R.h14 === 0 && R.bilan1.deja === 1, `h14=${R.h14}`);
  v('H13 rejeu → 0 ligne neuve, 0 réécrite', R.rejeu.creees === 0 && R.rejeu.completees === 0 && R.rejeu.lignes === 0 && R.rejeu.reecrites === false, JSON.stringify(R.rejeu));
  v('silence : 0 note push_ventes, 0 appel réseau, tâches / fiches / annonces inchangées', R.silence.push === 0 && R.silence.net === 0 && R.silence.jobs
    && R.silence.fiches && R.silence.annonces, JSON.stringify(R.silence));
  v('bilan usage_logs ventes_beebs_historique écrit (une par lecture)', R.journal === 2, `journal=${R.journal}`);
  v('comptes B et C : rien écrit', R.tiers === 0, `tiers=${R.tiers}`);
  v('fantôme (interrupteur 0) → bilan seul, 0 vente', R.fantome.mode === 'fantome' && R.fantome.aurait === 1 && R.fantome.lignes === 0, JSON.stringify(R.fantome));
  v('interrupteur absent → fantôme (fail-closed)', R.absent.mode === 'fantome' && R.absent.lignes === 0, JSON.stringify(R.absent));
  v('compte au Cloud lu par un autre poste → compte_cloud, rien écrit', R.cloud.mode === 'compte_cloud' && R.cloud.lignes === 0, JSON.stringify(R.cloud));
  v('sans identité → refus', R.anonyme === 'refuse', R.anonyme);
  v('droits : authenticated oui, anon non', R.anon.a === false && R.anon.b === true, JSON.stringify(R.anon));
  return ok;
}

async function principal() {
  const port = 54000 + Math.floor(Math.random() * 900);
  const { base, c, d } = await preparer({ port });
  const lignes = [];
  let echecs = 0;
  const dire = (ok, nom, det = '') => { lignes.push(`${ok ? '✓' : '✗'} ${nom}${!ok && det ? `  — ${det}` : ''}`); if (!ok) echecs++; };
  try {
    dire(d.echecs.filter((e) => !/déjà|already/.test(e)).length < 40, `décor de prod construit (${d.nf}/${d.nfTotal} fonctions, ${d.nt}/${d.ntTotal} déclencheurs)`, d.echecs.slice(0, 5).join(' | '));
    // A. AVANT
    dire(!(await existe(c)), 'A. avant : ventes_beebs_historique_noter absente (aucune vente Beebs n\'entre par une lecture)');
    const md5Avant = await md5Public(c);
    // B. MIGRATION (deux fois)
    await c.query(lire(MIGRATION));
    await c.query(lire(MIGRATION));
    dire(await existe(c), 'B. migration jouée deux fois sans erreur');
    const md5Apres = await md5Public(c);
    const touchees = Object.keys(md5Avant).filter((k) => md5Apres[k] !== md5Avant[k]);
    dire(touchees.length === 0, 'B. aucune fonction de prod réécrite', touchees.join(', '));
    const R = await jouer(c);
    for (const x of controler(R)) dire(x.ok, `B. ${x.nom}`, x.det);
    // C. INVERSE
    await c.query(lire(INVERSE));
    const md5Inverse = await md5Public(c);
    const diff = [...new Set([...Object.keys(md5Avant), ...Object.keys(md5Inverse)])].filter((k) => md5Avant[k] !== md5Inverse[k]);
    dire(!(await existe(c)) && diff.length === 0, 'C. inverse : fonction retirée, toutes les autres à l\'octet', diff.join(', '));
    dire(Number((await c.query(`SELECT count(*) AS n FROM coin_config WHERE key = 'ventes_beebs_historique'`)).rows[0].n) === 0, 'C. inverse : interrupteur retiré');
    // D. MIGRATION rejouée
    await c.query(lire(MIGRATION));
    const R2 = await jouer(c);
    const k2 = controler(R2);
    dire(k2.every((x) => x.ok), `D. migration rejouée : ${k2.filter((x) => x.ok).length}/${k2.length} cas verts`, k2.filter((x) => !x.ok).map((x) => x.nom).join(' | '));
  } catch (e) {
    dire(false, 'banc interrompu', String(e?.stack ?? e).slice(0, 600));
  } finally {
    await c.end().catch(() => {});
    await base.arreter();
  }
  console.log(lignes.join('\n'));
  console.log(echecs ? `\nROUGE : ${echecs} échec(s)` : `\nVERT : ${lignes.length} contrôles`);
  process.exit(echecs ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) principal();
