// LE BANC de la migration 20261111180000_retrait_apres_publication (11/11/2026, L1 — chemins résiduels, relecture : points
// 14 et 4) — SUR UN POSTGRES JETABLE, jamais la prod.
//   node scripts/essais/20261111180000_banc.mjs                    (embedded-postgres sur le poste, port et dossier à part)
//   SELFTEST_RACINE=<copie du dépôt> node …                        (contre-épreuve : la migration et l'inverse de la copie)
// Décor : les définitions de PROD (fixtures/prod-1111-retrait-fiche-liee/catalogue.json, lues le 11/11 : 166 fonctions, les
// 41 déclencheurs de cross_post_jobs et les 20 d'inventaire, la RLS), construites par le décor de L1 (lu, jamais modifié).
//   AVANT   : les corps de prod seuls ; les deux défauts se reproduisent (le choix de la personne est perdu à l'annulation ;
//             un lien tardif prouvé n'arme rien) ;
//   APRÈS   : la migration jouée deux fois — deux fonctions et deux déclencheurs EN PLUS, aucune définition existante
//             changée (md5 de chaque fonction et de chaque déclencheur) ; droits ; tous les cas ;
//   INVERSE : l'état d'AVANT exactement ; le défaut revient ; DE NOUVEAU la migration : l'état d'APRÈS exactement.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demarrerBase, ouvrir, construireDecor, outils, FIXTURE, A } from './20261111140000_decor.mjs';

const ICI = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = process.env.SELFTEST_RACINE ? resolve(process.env.SELFTEST_RACINE) : ICI;
const lireDe = (racine, p) => readFileSync(join(racine, p), 'utf8').replace(/\r\n/g, '\n');
const MIG = lireDe(ROOT, 'supabase/migrations/20261111180000_retrait_apres_publication.sql');
const INV = lireDe(ROOT, 'supabase/rollbacks/20261111180000_retrait_apres_publication_INVERSE.sql');
const fixture = JSON.parse(lireDe(ICI, FIXTURE));

let n = 0, ko = 0;
const ok = (cond, msg, detail) => {
  n++;
  if (cond) { console.log(`  ✓ ${msg}`); return; }
  ko++;
  console.log(`  ✗ ${msg}${detail === undefined ? '' : `\n      ← ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`}`);
};

// Un port et un dossier de données à part (le banc de L1 prend 58000-59500, dossier fillsell-banc-l1-…).
const base = await demarrerBase({ port: 61500 + Math.floor(Math.random() * 1000), nom: 'fillsell-banc-retrait-apres-publication-' });
const c = await ouvrir(base.url);
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
const un = async (sql, p = []) => (await q(sql, p))[0] ?? {};

async function etat() {
  const f = await q(`SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS k, md5(pg_get_functiondef(p.oid)) AS m,
      coalesce(p.proacl::text, '') AS acl, p.prosecdef AS sd, coalesce(p.proconfig::text, '') AS cfg
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace`);
  const t = await q(`SELECT c.relname || '.' || t.tgname AS k, md5(pg_get_triggerdef(t.oid)) AS m, t.tgenabled::text AS en
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal`);
  return { f: Object.fromEntries(f.map((r) => [r.k, `${r.m}|${r.acl}|${r.sd}|${r.cfg}`])), t: Object.fromEntries(t.map((r) => [r.k, `${r.m}|${r.en}`])) };
}
const ecart = (a, b) => {
  const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return { ajoutes: cles.filter((k) => !(k in a)), retires: cles.filter((k) => !(k in b)), changes: cles.filter((k) => k in a && k in b && a[k] !== b[k]) };
};
const NEUVES_F = ['cross_post_jobs_annulee_par_suppression()', 'cross_post_jobs_retrait_apres_publication_lien()'];
const NEUVES_T = ['cross_post_jobs.zzz_annulee_par_suppression', 'cross_post_jobs.zzz_retrait_apres_publication_lien'];

try {
  const d = await construireDecor(c, fixture);
  const o = outils(c, { url: base.url });
  await o.comptes();
  const pf = async (id) => (await un(`SELECT platform_fields AS pf FROM cross_post_jobs WHERE id = $1`, [id])).pf ?? {};
  const retraitsDe = async (num) => q(`SELECT id, status, platform, platform_listing_id, listing_url, platform_fields AS pf FROM cross_post_jobs
    WHERE user_id = $1 AND action = 'delete' AND platform_listing_id = $2 ORDER BY created_at`, [A, num]);

  // ── Les scènes ──
  /** Une tâche EN COURS sur une fiche (et, au choix, une annonce publiée à côté), puis le geste de suppression. */
  async function annulation(geste, { publiee = true } = {}) {
    const f = await o.fiche(A);
    if (publiee) await o.depot(A, f, { platform: 'leboncoin' });
    const t = await o.depot(A, f, { platform: 'vinted', status: 'processing', num: null, url: null, pf: { processing_since: new Date().toISOString() } });
    if (geste === 'app') await o.supprimerEnRetirant(A, f);
    else if (geste === 'filet') await o.supprimer(A, f);
    else if (geste === 'laisser') await o.supprimerEnLaissant(A, f);
    else if (geste === 'ta_file') await o.enApp(A, () => c.query(`UPDATE cross_post_jobs SET status = 'cancelled', error = 'Annulée à ta demande — rien n''a été publié.' WHERE id = $1`, [t.id]));
    return { f, t: await o.tache(t.id) };
  }
  /** Une annonce partie SANS lien ni numéro, marquée par update-job-status (retrait_apres_publication_attendu). */
  async function partieSansLien({ platform = 'beebs', marque = true, extra = {}, action = 'publish' } = {}) {
    const f = await o.fiche(A);
    const x = await o.depot(A, f, { platform, status: 'published', num: null, url: null, action,
      pf: { ...(marque ? { retrait_apres_publication_attendu: { le: new Date().toISOString(), motif: 'fiche_supprimee_pendant_la_tache' } } : {}), ...extra } });
    return { f, id: x.id };
  }
  const relevePoseLeLien = (id, url) => c.query(`UPDATE cross_post_jobs SET listing_url = $2,
      platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object('lien_retrouve_par_identifiant', jsonb_build_object('le', now(), 'url', $2::text))
    WHERE id = $1`, [id, url]);
  const titrePoseLeLien = (id, url) => o.enApp(A, () => c.query(`UPDATE cross_post_jobs SET listing_url = $2,
      platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object('listing_url_recovery', jsonb_build_object('at', now(), 'page', 'mes-annonces'))
    WHERE id = $1`, [id, url]));
  const lienSansPreuve = (id, url) => o.enApp(A, () => c.query(`UPDATE cross_post_jobs SET listing_url = $2 WHERE id = $1`, [id, url]));
  const preuveBeebs = (id, num) => c.query(`UPDATE cross_post_jobs SET platform_listing_id = $2,
      platform_fields = (coalesce(platform_fields, '{}'::jsonb) - 'retrait_apres_publication_attendu')
        || jsonb_build_object('preuve_identifiant_beebs_acceptee', jsonb_build_object('at', now(), 'numero', $2::text))
    WHERE id = $1`, [id, num]);

  console.log('A. AVANT — les définitions de prod, seules');
  ok(d.echecs.length === 0 && d.nt === d.ntTotal, `décor de prod : ${d.nf}/${d.nfTotal} fonctions, ${d.nt}/${d.ntTotal} déclencheurs, ${d.np}/${d.npTotal} politiques`, d.echecs.slice(0, 3));
  const AVANT = await etat();
  ok(NEUVES_F.every((k) => !(k in AVANT.f)) && NEUVES_T.every((k) => !(k in AVANT.t)), 'ni les deux fonctions ni les deux déclencheurs n\'existent avant');
  {
    const { t } = await annulation('app');
    ok(t.status === 'cancelled' && t.inventaire_id === null && !t.platform_fields?.annulee_par_suppression,
      'DÉFAUT (14) reproduit : la suppression « avec retrait » annule la tâche, la fiche part, et rien ne garde le CHOIX de la personne', t.platform_fields);
    const s = await partieSansLien();
    const num = o.numero();
    await relevePoseLeLien(s.id, `https://www.beebs.app/fr/p/${num}`);
    ok((await retraitsDe(num)).length === 0, 'DÉFAUT (4) reproduit : le relevé retrouve le lien PAR L\'IDENTIFIANT d\'une annonce partie après le retrait de son article — aucun retrait');
  }

  async function lesCas(titre) {
    console.log(titre);
    // ── (14) La marque du choix, posée à l'annulation ──
    {
      const { f, t } = await annulation('app');
      const m = t.platform_fields?.annulee_par_suppression ?? {};
      ok(t.status === 'cancelled' && m.avec_retrait === true && m.par === 'app' && m.fiche === String(f) && m.statut_avant === 'processing',
        '(14) « Retirer aussi les annonces … et supprimer » (l\'app arme les retraits, puis annule) → marque avec_retrait vrai, par l\'app, la fiche, le statut d\'avant', t.platform_fields);
    }
    {
      const { t } = await annulation('app', { publiee: false });
      const m = t.platform_fields?.annulee_par_suppression ?? {};
      ok(m.avec_retrait === false, '(14) suppression sans aucune annonce en ligne (rien à retirer : la publication en cours est seulement annulée) → avec_retrait faux', t.platform_fields);
    }
    {
      const { t } = await annulation('filet');
      const m = t.platform_fields?.annulee_par_suppression ?? {};
      ok(m.avec_retrait === true && m.par === 'filet', '(14) suppression par la base seule (le filet arme le retrait de l\'annonce publiée, puis annule) → avec_retrait vrai, par le filet', t.platform_fields);
    }
    {
      const { t } = await annulation('filet', { publiee: false });
      ok(t.platform_fields?.annulee_par_suppression?.avec_retrait === false && t.platform_fields?.annulee_par_suppression?.par === 'filet',
        '(14) suppression « simple » vue par le filet (aucune annonce) → avec_retrait faux', t.platform_fields);
    }
    {
      // (Relecture finale du 11/11) Un retrait par le logo VIEUX de 10 min (poste éteint, pas encore exécuté), une
      // publication Leboncoin de la même fiche en cours, puis la suppression : la modale ne propose AUCUN retrait (« sera
      // annulée », « retrait déjà en cours sur Vinted, laissé tel quel ») — l'app annule et supprime, rien d'autre.
      const f = await o.fiche(A);
      const v = await o.depot(A, f, { platform: 'vinted' });
      await c.query(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields, created_at)
        VALUES ($1, $2, 'vinted', 'delete', 'pending', 'original', 'Article d''essai', $3, '{}'::jsonb, now() - interval '10 minutes')`, [A, f, v.url]);
      const t = await o.depot(A, f, { platform: 'leboncoin', status: 'processing', num: null, url: null, pf: { processing_since: new Date().toISOString() } });
      await o.enApp(A, async () => {
        await c.query(`UPDATE cross_post_jobs SET status = 'cancelled', error = 'Annulé : l''article a été supprimé du stock' WHERE id = $1`, [t.id]);
        await c.query(`DELETE FROM inventaire WHERE id = $1`, [f]);
      });
      const m = (await o.tache(t.id)).platform_fields?.annulee_par_suppression ?? {};
      ok(m.avec_retrait === false, '(relecture finale) un retrait par le LOGO vieux de 10 min, la modale sans retrait proposé → avec_retrait FAUX (fenêtre de 2 min, celle de L1)', m);
    }
    {
      // … et le retrait de l'app, inséré quelques secondes avant l'annulation (« Retirer aussi les annonces … et supprimer »).
      const f = await o.fiche(A);
      await o.depot(A, f, { platform: 'vinted' });
      const t = await o.depot(A, f, { platform: 'leboncoin', status: 'processing', num: null, url: null, pf: { processing_since: new Date().toISOString() } });
      await o.supprimerEnRetirant(A, f);
      const m = (await o.tache(t.id)).platform_fields?.annulee_par_suppression ?? {};
      ok(m.avec_retrait === true, '(relecture finale) le retrait armé par l\'app quelques secondes avant l\'annulation → avec_retrait VRAI', m);
    }
    {
      const { t } = await annulation('laisser');
      ok(t.status === 'cancelled' && !t.platform_fields?.annulee_par_suppression && t.platform_fields?.annonces_laissees_en_ligne === true,
        '(14) « Supprimer la fiche, laisser les annonces en ligne » → aucune marque (son propre texte, sa propre marque)', t.platform_fields);
    }
    {
      const { t } = await annulation('ta_file');
      ok(t.status === 'cancelled' && !t.platform_fields?.annulee_par_suppression, '(14) une annulation « Ta file » (autre texte) → aucune marque', t.platform_fields);
    }
    // ── (4) Le lien tardif ──
    {
      const s = await partieSansLien();
      const num = o.numero();
      await relevePoseLeLien(s.id, `https://www.beebs.app/fr/p/${num}`);
      const r = await retraitsDe(num);
      const p = await pf(s.id);
      const j = await q(`SELECT metadata FROM usage_logs WHERE user_id = $1 AND feature = 'retrait_annonces' AND metadata ->> 'depot' = $2`, [A, s.id]);
      ok(r.length === 1 && r[0].status === 'pending' && r[0].pf?.arme_par?.chemin === 'publication_apres_retrait' && r[0].pf?.arme_par?.preuve_identite === 'lien_retrouve_par_identifiant'
        && !/armer_retrait_job/.test(r[0].pf?.arme_par?.pose_par ?? '') && p.retrait_apres_publication?.retrait === r[0].id && p.retrait_arme?.job === r[0].id
        && !('retrait_apres_publication_attendu' in p) && j.length === 1,
        '(4) le relevé retrouve le lien PAR L\'IDENTIFIANT → un retrait armé (voie ordinaire, pending), la tâche le porte, le journal le dit', { r, p, j: j.length });
    }
    {
      const s = await partieSansLien();
      const num = o.numero();
      await titrePoseLeLien(s.id, `https://www.beebs.app/fr/p/${num}`);
      const p = await pf(s.id);
      ok((await retraitsDe(num)).length === 0 && p.retrait_apres_publication_attendu?.lien_non_prouve?.titre === true,
        '(4) lien retrouvé par le TITRE (recoverMissingListingUrls) → JAMAIS un retrait ; la marque reste et le dit', p);
    }
    {
      const s = await partieSansLien({ platform: 'leboncoin' });
      const num = o.numero();
      await lienSansPreuve(s.id, `https://www.leboncoin.fr/ad/vetements/${num}`);
      ok((await retraitsDe(num)).length === 0 && !!(await pf(s.id)).retrait_apres_publication_attendu?.lien_non_prouve,
        '(4) lien d\'origine non prouvée (filet anti-doublon de l\'extension, par le titre) → JAMAIS un retrait');
    }
    {
      const s = await partieSansLien({ marque: false });
      const num = o.numero();
      await c.query('BEGIN');
      await c.query(`SET LOCAL track_functions = 'pl'`);
      await relevePoseLeLien(s.id, `https://www.beebs.app/fr/p/${num}`);
      const appels = await q(`SELECT calls FROM pg_stat_xact_user_functions WHERE funcname = 'cross_post_jobs_retrait_apres_publication_lien'`);
      await c.query('COMMIT');
      ok((await retraitsDe(num)).length === 0 && appels.length === 0, '(4) une tâche SANS la marque reçoit son lien → la fonction n\'est même pas appelée (clause WHEN)', appels);
    }
    {
      const s = await partieSansLien();
      const num = o.numero();
      const deja = (await un(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
        VALUES ($1, $2, 'beebs', 'delete', 'pending', 'original', 'x', $3, '{}'::jsonb) RETURNING id`, [A, s.f, `https://www.beebs.app/fr/p/${num}`])).id;
      await relevePoseLeLien(s.id, `https://www.beebs.app/fr/p/${num}`);
      const r = await retraitsDe(num);
      ok(r.length === 1 && r[0].id === deja && (await pf(s.id)).retrait_apres_publication?.deja_ouvert === true,
        '(4) un retrait déjà ouvert sur cette annonce → pas de second (la tâche pointe celui qui existe)', r);
    }
    {
      const s = await partieSansLien();
      const num = o.numero();
      await preuveBeebs(s.id, num);
      const r = await retraitsDe(num);
      ok(r.length === 1 && r[0].pf?.arme_par?.preuve_identite === 'preuve_identifiant_beebs_acceptee',
        '(4) numéro Beebs PROUVÉ par « Mes annonces » avant / après (update-job-status), la copie de l\'extension sans la marque → retrait armé (la marque lue sur l\'ancienne ligne)', r);
    }
    {
      const s = await partieSansLien({ platform: 'vinted', action: 'republish', extra: { old_listing_url: 'https://www.vinted.fr/items/10799999991-ancienne', vinted_account_id: 'b-1' } });
      await relevePoseLeLien(s.id, 'https://www.vinted.fr/items/10799999991-ancienne');
      ok((await retraitsDe('10799999991')).length === 0, '(4) republication : le lien posé est celui de l\'ANCIENNE annonce → jamais un retrait');
      const num = o.numero();
      await c.query(`UPDATE cross_post_jobs SET listing_url = NULL WHERE id = $1`, [s.id]);
      await relevePoseLeLien(s.id, `https://www.vinted.fr/items/${num}`);
      const r = await retraitsDe(num);
      ok(r.length === 1 && r[0].listing_url === `https://www.vinted.fr/items/${num}` && r[0].pf?.vinted_account_id === 'b-1',
        '(4) republication : le lien NEUF prouvé → retrait de l\'annonce neuve, boutique Vinted suivie', r);
    }
    {
      // Une erreur dans la fonction (une plateforme inconnue, un identifiant illisible) ne fait jamais échouer l'écriture du lien.
      const s = await partieSansLien({ platform: 'beebs' });
      let erreur = null;
      try { await relevePoseLeLien(s.id, 'https://www.beebs.app/fr/p/'); } catch (e) { erreur = e.message; }
      ok(erreur === null && (await un(`SELECT listing_url FROM cross_post_jobs WHERE id = $1`, [s.id])).listing_url === 'https://www.beebs.app/fr/p/',
        '(4) un lien illisible : l\'écriture du lien passe, rien n\'est armé', erreur);
    }
  }

  console.log('B. APRÈS — la migration jouée deux fois');
  await c.query(MIG);
  await c.query(MIG);
  const APRES = await etat();
  const e = ecart(AVANT, { f: Object.fromEntries(Object.entries(APRES.f)), t: APRES.t });
  const eF = ecart(AVANT.f, APRES.f), eT = ecart(AVANT.t, APRES.t);
  ok(eF.ajoutes.sort().join(',') === [...NEUVES_F].sort().join(',') && eF.retires.length === 0 && eF.changes.length === 0,
    `exactement deux fonctions EN PLUS, aucune des ${Object.keys(AVANT.f).length} fonctions existantes changée (md5, droits, réglages)`, eF);
  ok(eT.ajoutes.sort().join(',') === [...NEUVES_T].sort().join(',') && eT.retires.length === 0 && eT.changes.length === 0,
    `exactement deux déclencheurs EN PLUS sur cross_post_jobs, aucun des ${Object.keys(AVANT.t).length} existants changé`, eT);
  void e;
  const droits = await q(`SELECT p.proname, p.prosecdef, coalesce(p.proconfig::text, '') AS cfg,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY ($1)`, [NEUVES_F.map((x) => x.replace('()', ''))]);
  ok(droits.length === 2 && droits.every((r) => r.prosecdef && /search_path=public, pg_temp/.test(r.cfg) && !r.auth && !r.anon),
    'les deux fonctions : SECURITY DEFINER, search_path fixé, ni anon ni authenticated', droits);
  const defs = await q(`SELECT t.tgname, pg_get_triggerdef(t.oid) AS d FROM pg_trigger t WHERE t.tgrelid = 'public.cross_post_jobs'::regclass AND t.tgname LIKE 'zzz_%'`);
  ok(defs.some((x) => /BEFORE UPDATE OF status/.test(x.d) && /supprim/.test(x.d)) && defs.some((x) => /AFTER UPDATE OF listing_url, platform_listing_id/.test(x.d) && /retrait_apres_publication_attendu/.test(x.d)),
    'les deux clauses WHEN sont étroites (la transition visée, la marque présente)', defs.map((x) => x.d));
  await lesCas('B. Les cas, migration appliquée');

  console.log('C. INVERSE');
  await c.query(INV);
  const INVERSE = await etat();
  const iF = ecart(AVANT.f, INVERSE.f), iT = ecart(AVANT.t, INVERSE.t);
  ok(!iF.ajoutes.length && !iF.retires.length && !iF.changes.length && !iT.ajoutes.length && !iT.retires.length && !iT.changes.length,
    'l\'inverse rend l\'état d\'AVANT exactement (fonctions, déclencheurs, droits, réglages)', { iF, iT });
  {
    const { t } = await annulation('app');
    ok(!t.platform_fields?.annulee_par_suppression, 'après l\'inverse, le défaut revient (aucune marque du choix)');
  }
  console.log('D. DE NOUVEAU la migration');
  await c.query(MIG);
  const DE_NOUVEAU = await etat();
  const nF = ecart(APRES.f, DE_NOUVEAU.f), nT = ecart(APRES.t, DE_NOUVEAU.t);
  ok(!nF.ajoutes.length && !nF.retires.length && !nF.changes.length && !nT.ajoutes.length && !nT.retires.length && !nT.changes.length,
    'de nouveau la migration : l\'état d\'APRÈS exactement');
  {
    const { t } = await annulation('app');
    ok(t.platform_fields?.annulee_par_suppression?.avec_retrait === true, 'et la règle revient');
  }
} catch (e) {
  ko++;
  console.log(`  ✗ le banc s'est arrêté : ${e?.stack ?? e}`);
} finally {
  await c.end().catch(() => {});
  await base.arreter();
}
console.log(`\nBANC ${ko ? 'ROUGE' : 'VERT'} — ${n - ko}/${n} contrôles`);
process.exit(ko ? 1 : 0);
