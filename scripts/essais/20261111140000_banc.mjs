// LE BANC de la migration 20261111140000_retrait_partout_fiche_liee (L1, 11/11/2026) — SUR UN POSTGRES JETABLE, jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261111140000_banc.mjs        (embedded-postgres sur le poste ; par défaut)
//   PREUVE_PG=postgres://…@127.0.0.1:…/…  node scripts/essais/20261111140000_banc.mjs   (une base jetable)
// Décor : les définitions de PROD (fixtures/prod-1111-retrait-fiche-liee/catalogue.json — 197 fonctions, tous les
// déclencheurs de inventaire, cross_post_jobs et inventaire_doublons, la RLS ; relues en prod le 11/11).
//   AVANT   : les corps de la fixture à l'octet ; le défaut se reproduit (cas joués « avant ») ; le verrou est ROUGE sans la migration ;
//   APRÈS   : la migration jouée deux fois — exactement six fonctions, une table et un déclencheur EN PLUS, aucune définition
//             existante changée (md5, droits et réglages de CHAQUE fonction ; md5 de chaque déclencheur) ; tous les cas verts ;
//   INVERSE : l'état d'AVANT, exactement (TOUTES les fonctions, tous les déclencheurs, les tables) ; le défaut revient ;
//   DE NOUVEAU la migration : l'état d'APRÈS, exactement ; la règle revient ;
//   LES DEUX SCRIPTS DE RÉPARATION (scripts/reparations/20261111_*), joués sur un décor qui reproduit les lignes lues en
//   prod le 11/11 : leurs IDENTIFIANTS TECHNIQUES (comptes, fiches, dépôts, annonces relevées, liens) — que les scripts
//   visent — et des valeurs d'essai inventées pour tout le reste (numéros, liens, titres, source) : aucune donnée client.
//   Gardes, sauvegarde, geste, contrôle, preuve, inverse.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { demarrerBase, ouvrir, construireDecor, outils, lire, ROOT, FIXTURE, MIGRATION, INVERSE, NEUVES, TABLE_NEUVE } from './20261111140000_decor.mjs';
import { jouerCas } from './20261111140000_cas.mjs';

let PG = process.env.PREUVE_PG || 'embarque';
if (/supabase\.(co|com)|pooler/.test(PG)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }

let n = 0, ko = 0;
const ok = (cond, msg, detail) => {
  n++;
  if (cond) { console.log(`  ✓ ${msg}`); return; }
  ko++;
  console.log(`  ✗ ${msg}${detail === undefined ? '' : `\n      ← ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600)}`}`);
};
/** Joue des cas en silence ; rend { n, rouges: [messages] }. */
async function compter(o, opts) {
  const rouges = []; let total = 0;
  const journal = console.log; console.log = () => {};
  try { await jouerCas(o, (c, m, d) => { total++; if (!c) rouges.push(d === undefined ? m : `${m} ← ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400)}`); }, opts); } finally { console.log = journal; }
  return { n: total, rouges };
}

const fixture = JSON.parse(lire(FIXTURE));
const MIG = lire(MIGRATION), INV = lire(INVERSE);
const base = PG === 'embarque' ? await demarrerBase({ port: 58000 + Math.floor(Math.random() * 1500), nom: 'fillsell-banc-l1-' }) : null;
const url = base ? base.url : PG;
const c = await ouvrir(url);
const q = async (sql, p = []) => (await c.query(sql, p)).rows;

/** L'état des définitions : md5, droits et réglages de chaque fonction ; md5 de chaque déclencheur ; les tables. */
async function etat() {
  const f = await q(`SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS k, md5(pg_get_functiondef(p.oid)) AS m,
      coalesce((SELECT string_agg(x, ',' ORDER BY x) FROM unnest(p.proacl::text[]) x), '') AS acl, p.prosecdef AS sd, coalesce(p.proconfig::text, '') AS cfg
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace`);
  const t = await q(`SELECT c.relname || '.' || t.tgname AS k, md5(pg_get_triggerdef(t.oid)) AS m, t.tgenabled::text AS en
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal`);
  // Les droits comparés par leur CONTENU (l'ordre des entrées d'une ACL dépend de l'ordre des GRANT rejoués).
  const r = await q(`SELECT c.relname AS k, coalesce((SELECT string_agg(x, ',' ORDER BY x) FROM unnest(c.relacl::text[]) x), '') || '|' || c.relrowsecurity AS m FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'`);
  return { f: Object.fromEntries(f.map((x) => [x.k, `${x.m}|${x.acl}|${x.sd}|${x.cfg}`])), t: Object.fromEntries(t.map((x) => [x.k, `${x.m}|${x.en}`])),
    r: Object.fromEntries(r.map((x) => [x.k, x.m])) };
}
const ecart = (a, b) => {
  const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return { ajoutes: cles.filter((k) => !(k in a)), retires: cles.filter((k) => !(k in b)), changes: cles.filter((k) => k in a && k in b && a[k] !== b[k]) };
};
const vide = (e) => !e.ajoutes.length && !e.retires.length && !e.changes.length;
const NEUVES_ARGS = ['annonce_en_retrait_compte_relie(p_job uuid)', 'armer_retrait_copie_reliee(p_job uuid, p_chemin text, p_pose text, p_marque jsonb)',
  'armer_retraits_fiche_liee(p_user uuid, p_fiche bigint, p_chemin text)', 'copie_retrait_partout_repondre(p_id uuid, p_decision text, p_annonce_montree uuid)',
  'copies_fiche_liee(p_user uuid, p_fiche bigint)', 'inventaire_arme_retraits_fiche_liee()'];

try {
  const d = await construireDecor(c, fixture);
  const o = outils(c, { url, roles: fixture.droits.roles ?? [] });
  await o.comptes();

  console.log('A. AVANT — les définitions de prod, seules');
  ok(d.nf === d.nfTotal && d.nt === d.ntTotal && d.np === d.npTotal && d.echecs.length === 0,
    `décor : ${d.nf}/${d.nfTotal} fonctions, ${d.nt}/${d.ntTotal} déclencheurs, ${d.np}/${d.npTotal} politiques de prod`, d.echecs.slice(0, 3));
  const md5Base = await o.md5();
  const differentes = Object.keys(fixture.md5).filter((k) => md5Base[k] !== fixture.md5[k]);
  ok(differentes.length === 0, `les ${Object.keys(fixture.md5).length} fonctions de la base jetable sont celles de la fixture (prod sans commentaires), à l'octet — TOUTES`, differentes.slice(0, 5));
  const AVANT = await etat();
  const nomsNeufs = NEUVES.map((f) => f.replace(/^public\./, '').split('(')[0]);
  ok(Object.keys(AVANT.f).every((k) => !nomsNeufs.includes(k.split('(')[0])) && !('inventaire.inventaire_arme_retraits_fiche_liee' in AVANT.t) && !(TABLE_NEUVE in AVANT.r),
    'aucune des six fonctions, ni la table, ni le déclencheur de la règle n\'existent avant');
  const avantDefaut = await compter(o, { apres: false });
  ok(avantDefaut.rouges.length === 0 && avantDefaut.n >= 30, `le défaut se reproduit : ${avantDefaut.n}/${avantDefaut.n} contrôles « avant » (aucun retrait chez le compte relié, la file de la jumelle partirait)`, avantDefaut.rouges.slice(0, 5));
  const SANS = ['1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.', '9.', '10.', '11.', '12.', '16.'];
  const rouge = await compter(o, { apres: true, seulement: SANS });
  console.log(`  — le verrou SANS la migration : ${rouge.rouges.length} contrôle(s) ROUGES sur ${rouge.n} :`);
  for (const m of rouge.rouges) console.log(`      ✗ ${m.slice(0, 150)}`);
  ok(rouge.rouges.length >= 20, `le verrou est ROUGE sans la migration (${rouge.rouges.length} contrôles en échec)`);
  ok(vide(ecart(AVANT.f, (await etat()).f)), 'les cas joués ne changent aucune définition');

  console.log('\nB. APRÈS — la migration, jouée deux fois');
  await c.query(MIG);
  await c.query(MIG);
  const APRES = await etat();
  const ef = ecart(AVANT.f, APRES.f), et = ecart(AVANT.t, APRES.t), er = ecart(AVANT.r, APRES.r);
  ok(JSON.stringify(ef.ajoutes.sort()) === JSON.stringify(NEUVES_ARGS) && !ef.retires.length && !ef.changes.length,
    `fonctions : 6 ajoutées, 0 changée, 0 retirée sur ${Object.keys(AVANT.f).length} (md5, droits, réglages de chacune)`, ef);
  ok(JSON.stringify(et.ajoutes) === JSON.stringify(['inventaire.inventaire_arme_retraits_fiche_liee']) && !et.retires.length && !et.changes.length,
    `déclencheurs : 1 ajouté (inventaire_arme_retraits_fiche_liee), 0 changé, 0 retiré sur ${Object.keys(AVANT.t).length}`, et);
  ok(JSON.stringify(er.ajoutes) === JSON.stringify([TABLE_NEUVE]) && !er.retires.length && !er.changes.length,
    `tables : 1 ajoutée (${TABLE_NEUVE}, la marque), 0 changée (droits, RLS), 0 retirée sur ${Object.keys(AVANT.r).length}`, er);
  const neuves = await q(`SELECT p.proname, p.prosecdef, p.proconfig::text AS cfg, p.provolatile::text AS vol,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS srv, p.proacl::text AS acl
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1::text[]) ORDER BY 1`, [nomsNeufs]);
  for (const f of neuves) {
    const reponse = f.proname === 'copie_retrait_partout_repondre';
    ok(f.prosecdef && /search_path=public, pg_temp/.test(f.cfg) && !f.anon && f.auth === reponse && f.srv && !/(^|[{,])=X/.test(f.acl ?? ''),
      `${f.proname} : SECURITY DEFINER, search_path fixé, ni anon ni PUBLIC, ${reponse ? 'authenticated (la réponse de la personne)' : 'ni authenticated'}, service_role oui${f.vol === 's' ? ', STABLE' : ''}`, f);
  }
  ok(/lock_timeout=1s/.test(neuves.find((f) => f.proname === 'armer_retraits_fiche_liee')?.cfg ?? '') && /lock_timeout=2s/.test(neuves.find((f) => f.proname === 'copie_retrait_partout_repondre')?.cfg ?? ''),
    'lock_timeout : 1 s pour la traversée (une ligne tenue ne fige jamais une suppression), 2 s pour la réponse');
  const trg = (await q(`SELECT pg_get_triggerdef(t.oid) AS d FROM pg_trigger t WHERE t.tgrelid = 'public.inventaire'::regclass AND t.tgname = 'inventaire_arme_retraits_fiche_liee'`))[0]?.d ?? '';
  ok(/BEFORE DELETE ON public\.inventaire FOR EACH ROW EXECUTE FUNCTION inventaire_arme_retraits_fiche_liee\(\)/.test(trg), 'le déclencheur : BEFORE DELETE ON inventaire FOR EACH ROW', trg);
  const apres = await compter(o, { apres: true, migration: MIG, inverse: INV });
  ok(apres.rouges.length === 0, `tous les cas verts avec la migration : ${apres.n - apres.rouges.length}/${apres.n}`, apres.rouges.slice(0, 8));
  const APRES2 = await etat();
  ok(vide(ecart(APRES.f, APRES2.f)) && vide(ecart(APRES.t, APRES2.t)), 'après les cas (pannes provoquées, migration rejouée, verrous), les définitions sont celles d\'APRÈS');

  console.log('\nC. INVERSE');
  await c.query(INV);
  const INVE = await etat();
  const ei = ecart(AVANT.f, INVE.f), eti = ecart(AVANT.t, INVE.t), eri = ecart(AVANT.r, INVE.r);
  ok(vide(ei) && vide(eti) && vide(eri), `l'état d'AVANT, exactement : ${Object.keys(INVE.f).length} fonctions (md5, droits, réglages), ${Object.keys(INVE.t).length} déclencheurs, ${Object.keys(INVE.r).length} tables identiques`, { ei, eti, eri });
  const md5Inv = await o.md5();
  ok(Object.keys(fixture.md5).every((k) => md5Inv[k] === fixture.md5[k]), `aller-retour : les ${Object.keys(fixture.md5).length} md5 de la fixture, TOUS identiques après l'inverse`);
  const defaut = await compter(o, { apres: false, seulement: ['1.', '2.', '10.', '11.'] });
  ok(defaut.rouges.length === 0, `le défaut revient (${defaut.n}/${defaut.n} contrôles « avant » sur les cas 1, 2, 10, 11)`, defaut.rouges);

  console.log('\nD. DE NOUVEAU LA MIGRATION');
  await c.query(MIG);
  const REAP = await etat();
  ok(vide(ecart(APRES.f, REAP.f)) && vide(ecart(APRES.t, REAP.t)) && vide(ecart(APRES.r, REAP.r)), 'l\'état d\'APRÈS, exactement (md5, droits, réglages, tables)',
    { f: ecart(APRES.f, REAP.f), t: ecart(APRES.t, REAP.t), r: ecart(APRES.r, REAP.r) });
  const re = await compter(o, { apres: true, seulement: ['1.', '2.', '10.', '11.'] });
  ok(re.rouges.length === 0, `la règle revient (${re.n}/${re.n} sur les cas 1, 2, 10, 11)`, re.rouges);

  // F. La migration sœur du lot L1 (chemins résiduels, un autre agent), si elle est là : appliquée APRÈS celle-ci, comme
  //    en prod ; la règle et tous ses cas restent verts (deux déclencheurs de plus sur cross_post_jobs).
  const SOEUR = 'supabase/migrations/20261111180000_retrait_apres_publication.sql';
  if (existsSync(join(ROOT, SOEUR))) {
    console.log('\nF. AVEC LA MIGRATION SŒUR 20261111180000 (chemins résiduels), appliquée après');
    const errSoeur = await c.query(lire(SOEUR)).then(() => null, (e) => e.message);
    ok(errSoeur === null, 'la migration sœur s\'applique sur l\'état d\'APRÈS', errSoeur);
    const ensemble = await compter(o, { apres: true, migration: MIG, inverse: INV });
    ok(ensemble.rouges.length === 0, `tous les cas verts avec les deux migrations : ${ensemble.n - ensemble.rouges.length}/${ensemble.n}`, ensemble.rouges.slice(0, 8));
  }

  await jouerReparations(o);
} catch (e) {
  ok(false, 'banc interrompu', `${e.message}${e.where ? ` — ${String(e.where).slice(0, 300)}` : ''}`);
} finally {
  await c.end().catch(() => {});
  if (base) await base.arreter();
}
console.log(ko ? `\n✗ banc 20261111140000 : ${ko} contrôle(s) en échec sur ${n}` : `\n✓ banc 20261111140000 : ${n}/${n} — vert.`);
process.exit(ko ? 1 : 0);

// ═══ E. LES DEUX SCRIPTS DE RÉPARATION, sur un décor qui reproduit les lignes lues en prod le 11/11 ═══════════════════
// Les identifiants techniques sont ceux que les scripts visent ; les numéros, liens, titres et la source du lien sont
// inventés (les scripts lisent les numéros dans les lignes, jamais un littéral).
async function jouerReparations(o) {
  const S = {
    retrait: lire('scripts/reparations/20261111_retrait_leboncoin_comptes_relies.sql'),
    retraitPreuve: lire('scripts/reparations/20261111_retrait_leboncoin_comptes_relies_PREUVE.sql'),
    retraitInverse: lire('scripts/reparations/20261111_retrait_leboncoin_comptes_relies_INVERSE.sql'),
    fantomes: lire('scripts/reparations/20261111_fiches_fantomes_reimport.sql'),
    fantomesPreuve: lire('scripts/reparations/20261111_fiches_fantomes_reimport_PREUVE.sql'),
    fantomesInverse: lire('scripts/reparations/20261111_fiches_fantomes_reimport_INVERSE.sql'),
  };
  const U2 = '447d920c-976a-4d8f-aff4-a2998050358c', U1 = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
  const jouer = async (sql) => { try { await c.query(sql); return null; } catch (e) { await c.query('ROLLBACK').catch(() => {}); return e.message; } };
  await o.commeServeur();
  for (const u of [U2, U1]) {
    await q(`INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [u, `${u.slice(0, 8)}@exemple.invalid`]);
    await q(`INSERT INTO profiles (id, email, is_premium, is_pro, is_business, extension_last_seen_at, extension_version, extension_build, lang)
      VALUES ($1, $2, true, true, true, now(), '0.6.186', '0.6.186', 'fr') ON CONFLICT DO NOTHING`, [u, `${u.slice(0, 8)}@exemple.invalid`]);
  }
  await q(`INSERT INTO comptes_lies (user_a, user_b, motif) VALUES ($1, $2, 'essai : même personne')`, [U2, U1]);
  // Les liens 116 et 186 du cas réel : la séquence des cas joués plus haut a pu les donner à des fiches d'essai.
  await q(`DELETE FROM fiches_liees_comptes WHERE id IN (116, 186)`);

  console.log('\nE1. Script des deux annonces Leboncoin (décor : les identifiants lus en prod le 11/11, valeurs d\'essai pour le reste)');
  const numTitre = '3399000001', numPersonne = '3399000002';
  for (const [fiche, depot, num, pf, annonce, src, lien, supprimee] of [
    [1792340705460616, 'ad4e2895-c5e3-40e9-8bf0-5f1b10199479', numTitre,
      { source: 'releve', rattachement: { annonce_id: '0607c980-29ee-40f9-93df-e79c10650c6a', at: '2026-09-20T09:50:58.057014+00:00', motif: 'titre_exact', par: 'auto', score: 0.95 } },
      '0607c980-29ee-40f9-93df-e79c10650c6a', 'automatique', 116, 1789889098557002],
    [1792340705460686, '21a23488-a389-49a2-b228-5fc416d82c93', numPersonne,
      { source: 'releve', rattachement: { annonce_id: 'bffc6551-e8f7-4769-a6e9-f4618b1fdfad', at: '2026-09-20T09:58:22.406598+00:00', par: 'utilisateur' } },
      'bffc6551-e8f7-4769-a6e9-f4618b1fdfad', 'manuel', 186, 1789889101726001],
  ]) {
    const lienAnnonce = o.LIEN.leboncoin(num);
    await q(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, prix_vente, description, photos, origine, created_at)
      VALUES ($1, $2, 'Article d''essai', 'stock', 1, 5, 'Très bon état.', '["https://essai.supabase.co/storage/v1/object/public/photos/essai-1.jpg"]'::jsonb, 'transfert_boutique_1810', '2026-10-18 18:24:49+02')`, [fiche, U1]);
    await q(`INSERT INTO cross_post_jobs (id, user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url, published_at, created_at, handler_build, platform_fields, photo_option, voie)
      VALUES ($1, $2, $3, 'leboncoin', 'published', 'publish', 'Article d''essai', 5, $4, $5, '2026-09-20 09:55:00+00', '2026-09-20 09:55:00+00', 'releve-annonces', $6, 'original', 'extension')`, [depot, U1, fiche, num, lienAnnonce, JSON.stringify(pf)]);
    await q(`INSERT INTO annonces_plateforme (id, user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, job_id, source_rapprochement, vu_le, created_at, publiee_le, transaction_plateforme)
      VALUES ($1, $2, 'leboncoin', $3, $4, 'Article d''essai', 5, 'en_ligne', $5, $6, $7, now() - interval '5 minutes', '2026-09-19 18:23:29+00', '2025-11-14 10:49:59+00', 'aucune')`, [annonce, U1, num, lienAnnonce, fiche, depot, src]);
    await q(`INSERT INTO fiches_liees_comptes (id, fiche_a, user_a, fiche_b, user_b, source) VALUES ($1, $2, $3, $4, $5, 'transfert_boutique_essai')`, [lien, supprimee, U2, fiche, U1]);
  }
  const ecrits = async () => q(`SELECT (SELECT count(*)::int FROM cross_post_jobs WHERE action = 'delete' AND user_id IN ($1, $2)) AS d,
    to_regclass('public._backup_1111_retrait_lbc_relies') IS NOT NULL AS b, (SELECT count(*)::int FROM jumelles_retirees_partout WHERE user_id = $1) AS m`, [U1, U2]).then((r) => r[0]);
  // Les gardes. a) La boutique Leboncoin n'est pas (ou plus) partagée : la règle ne s'appliquerait pas → rien n'est écrit.
  const g0 = await jouer(S.retrait);
  const e0 = await ecrits();
  ok(/plus partagée/.test(g0 ?? '') && e0.d === 0 && !e0.b && e0.m === 0, 'garde : boutique Leboncoin non partagée (portée de la règle) → le script s\'arrête, rien n\'est écrit', g0);
  await q(`INSERT INTO sync_import_ecartes (user_id, motif, titre) VALUES ($1, 'compte_relie:leboncoin', 'essai')`, [U1]);
  // b) Une annonce sous achat en cours → rien n'est écrit.
  await q(`UPDATE annonces_plateforme SET transaction_plateforme = 'pending' WHERE id = 'bffc6551-e8f7-4769-a6e9-f4618b1fdfad'`);
  const refus = await jouer(S.retrait);
  const e1 = await ecrits();
  ok(/sous transaction/.test(refus ?? '') && e1.d === 0 && !e1.b, 'garde : une annonce sous achat en cours → le script s\'arrête, rien n\'est écrit (ni retrait, ni sauvegarde)', refus);
  await q(`UPDATE annonces_plateforme SET transaction_plateforme = 'aucune' WHERE id = 'bffc6551-e8f7-4769-a6e9-f4618b1fdfad'`);
  // c) (relecture M2) Une tâche en file sur une jumelle (0 le 11/11) → rien n'est écrit, à relire avant.
  const enFile = (await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, photo_option)
    VALUES ($1, 1792340705460686, 'beebs', 'pending', 'publish', 'Article d''essai', 5, 'original') RETURNING id`, [U1]))[0].id;
  const g2 = await jouer(S.retrait);
  const e2 = await ecrits();
  ok(/en file sur les jumelles/.test(g2 ?? '') && e2.d === 0 && !e2.b && (await q(`SELECT status FROM cross_post_jobs WHERE id = $1`, [enFile]))[0].status === 'pending',
    'garde « 0 tâche en file » : une publication en file sur une jumelle → le script s\'arrête, rien n\'est écrit, elle reste en file', g2);
  await q(`DELETE FROM cross_post_jobs WHERE id = $1`, [enFile]);
  ok((await jouer(S.retraitPreuve)) === null, 'la PREUVE (lecture seule) se joue avant');
  const err = await jouer(S.retrait);
  ok(err === null, 'le script passe (une transaction)', err);
  // (Relecture finale, point 7) Le budget de la règle part du début de la REQUÊTE ; le script est envoyé d'un seul message
  // (db query -f, comme ici) : le temps qu'il consomme AVANT d'appeler la règle est mesuré par elle (attente_avant_ms).
  const resultat = (await q(`SELECT resultat FROM _backup_1111_retrait_lbc_relies WHERE t = 'fiches_liees_comptes' AND cle = '116'`))[0]?.resultat ?? {};
  const attentes = ['1789889098557002', '1789889101726001'].map((k) => Number(resultat?.[k]?.attente_avant_ms));
  console.log(`      (temps consommé par le script avant la règle : ${attentes.join(' ms, ')} ms ; budget 2000 ms)`);
  ok(attentes.every((x) => Number.isFinite(x) && x < 500), `point 7 : le script consomme ${Math.max(...attentes)} ms du budget avant la règle (moins de 500 ms)`, resultat);
  const r = await q(`SELECT inventaire_id::text AS fiche, platform_listing_id AS num, status, user_id, listing_url, platform_fields AS pf FROM cross_post_jobs
    WHERE action = 'delete' AND user_id IN ($1, $2) ORDER BY inventaire_id`, [U1, U2]);
  ok(r.length === 2 && r.every((x) => x.user_id === U1 && x.status === 'pending'), 'deux retraits, au nom du compte relié, en attente — et rien chez l\'autre compte', r.map((x) => [x.fiche, x.num, x.status]));
  const rTitre = r.find((x) => x.fiche === '1792340705460616'), rPers = r.find((x) => x.fiche === '1792340705460686');
  ok(rTitre?.num === numTitre && rTitre?.listing_url === o.LIEN.leboncoin(numTitre) && !rTitre?.pf?.arme_par,
    'dépôt ad4e2895 (titre seul) : le geste du logo (sous les droits du compte, numéro rempli depuis le lien par la base), hors règle', rTitre);
  ok(rPers?.num === numPersonne && rPers?.pf?.arme_par?.chemin === 'suppression_article_compte_relie' && rPers?.pf?.arme_par?.de_fiche === '1789889101726001',
    'dépôt 21a23488 (rattaché par la personne) : armé PAR LA RÈGLE (armer_retraits_fiche_liee), sur sa jumelle', rPers?.pf?.arme_par);
  const refusTitre = await q(`SELECT metadata ->> 'motif' AS m FROM usage_logs WHERE user_id = $1 AND feature = 'retrait_refuse_compte_relie' AND metadata ->> 'article_id' = '1792340705460616'`, [U1]);
  const questions = await q(`SELECT id FROM inventaire_doublons WHERE user_id = $1`, [U1]);
  ok(refusTitre.length === 1 && refusTitre[0].m === 'rattachement_non_confirme' && questions.length === 0,
    'la règle refuse la copie rattachée par le titre seul et le trace ; aucune question (le retrait du logo l\'attend déjà)', { refusTitre, questions });
  const marques = await q(`SELECT inventaire_id::text AS f FROM jumelles_retirees_partout WHERE user_id = $1 ORDER BY 1`, [U1]);
  ok(JSON.stringify(marques.map((x) => x.f)) === JSON.stringify(['1792340705460616', '1792340705460686']), 'les deux jumelles portent leur marque (décision 4)', marques);
  const fj = await q(`SELECT count(*)::int AS n FROM inventaire WHERE id IN (1792340705460616, 1792340705460686) AND statut = 'stock'`);
  ok(fj[0].n === 2, 'les deux fiches jumelles restent au stock (décision 2)');
  const sauv = await q(`SELECT t, count(*)::int AS n FROM _backup_1111_retrait_lbc_relies GROUP BY t ORDER BY t`);
  ok(JSON.stringify(sauv) === JSON.stringify([{ t: 'annonces_plateforme', n: 2 }, { t: 'cross_post_jobs', n: 2 }, { t: 'fiches_liees_comptes', n: 2 }, { t: 'inventaire', n: 2 }]),
    'sauvegarde : 2 fiches, 2 dépôts, 2 annonces, 2 liens (aucune tâche, remise ni question à garder)', sauv);
  const droitsSauv = await q(`SELECT c.relrowsecurity AS rls, has_table_privilege('authenticated', c.oid, 'SELECT') AS a FROM pg_class c WHERE c.oid = 'public._backup_1111_retrait_lbc_relies'::regclass`);
  ok(droitsSauv[0].rls && !droitsSauv[0].a, 'sauvegarde née protégée (RLS, aucun droit client)');
  const deux = await jouer(S.retrait);
  ok(/déjà passé/.test(deux ?? '') && (await q(`SELECT count(*)::int AS n FROM cross_post_jobs WHERE action = 'delete' AND user_id = $1`, [U1]))[0].n === 2,
    'rejoué : refusé (« déjà passé »), aucun retrait de plus', deux);
  ok((await jouer(S.retraitPreuve)) === null, 'la PREUVE se joue après');
  // L'inverse, tant que les retraits ne sont pas partis — l'un d'eux attend un geste (needs_user, relecture M1).
  await q(`UPDATE cross_post_jobs SET status = 'needs_user' WHERE action = 'delete' AND user_id = $1 AND inventaire_id = 1792340705460616`, [U1]);
  ok((await jouer(S.retraitInverse)) === null, 'l\'INVERSE passe');
  const ri = await q(`SELECT status, platform_fields #>> '{inverse_rattrapage_1111,statut_avant}' AS avant FROM cross_post_jobs WHERE action = 'delete' AND user_id = $1 ORDER BY inventaire_id`, [U1]);
  ok(ri.length === 2 && ri.every((x) => x.status === 'cancelled') && ri.map((x) => x.avant).sort().join() === 'needs_user,pending',
    'inverse : les deux retraits « cancelled » (message vrai), celui qui attendait un geste (needs_user) compris', ri);
  const d30 = (await q(`SELECT platform_fields AS pf, platform_fields = $1::jsonb AS egal FROM cross_post_jobs WHERE id = '21a23488-a389-49a2-b228-5fc416d82c93'`,
    [JSON.stringify({ source: 'releve', rattachement: { annonce_id: 'bffc6551-e8f7-4769-a6e9-f4618b1fdfad', at: '2026-09-20T09:58:22.406598+00:00', par: 'utilisateur' } })]))[0];
  ok(d30.egal === true, 'inverse : le dépôt 21a23488 retrouve ses platform_fields d\'avant, à l\'identique (retrait_arme, pending_removal retirés)', d30.pf);
  ok((await q(`SELECT count(*)::int AS n FROM jumelles_retirees_partout WHERE user_id = $1`, [U1]))[0].n === 0, 'inverse : les marques posées par le script sont retirées');

  console.log('\nE2. Script des 7 fiches fantômes (décor : les identifiants lus en prod le 11/11, valeurs d\'essai pour le reste)');
  const FICHES = [[1794389289141, U2, 'releve_beebs', '2026-11-11 10:28:09+01'], [1794389289234, U2, 'releve_beebs', '2026-11-11 10:28:09+01'],
    [1794391571153, U2, 'releve_depop', '2026-11-11 11:06:11+01'], [1794391571230, U2, 'releve_depop', '2026-11-11 11:06:11+01'],
    [1794393469413, U2, 'releve_depop', '2026-11-11 11:37:49+01'], [1794263945937, U2, 'releve_depop', '2026-11-09 23:39:05+01'],
    [1794260149701, U1, 'releve_leboncoin', '2026-11-09 22:35:49+01']];
  const DEPOTS = [['c7c86c11-8a79-4bc2-9448-168ebcefcb7b', 0, 'leboncoin', '49ccb771-4afe-4830-b8d6-fd725a649810'],
    ['241f7efc-05ee-434e-9275-d9570e7bf839', 0, 'beebs', '2f72895a-631a-4450-84f7-dbb44116aaae'],
    ['cc930ca1-5593-48e6-a4e0-0481d809b5c1', 1, 'leboncoin', '6ae458c2-102b-4489-bc1a-42db754ebaae'],
    ['4b451540-5286-4b4b-aff7-d7a2c6a14452', 1, 'beebs', '5e47094f-f2a4-41dd-9ec3-3285d3d47796'],
    ['02aeb6b7-bcd0-47ac-a56a-ce01afd30a15', 2, 'depop', '988feaef-773c-481e-8684-cc5a044676aa'],
    ['b49783b3-be4d-4a59-91ad-1c801826ebb9', 3, 'depop', 'aff57050-5bc1-43dd-9514-04498aba6d08'],
    ['b7664bf4-a14a-462e-9439-207ce7fa82d6', 4, 'depop', '08bcfb0c-dde1-45ba-a2db-74d6edc974b8'],
    ['8384a0d3-79a8-46d4-8375-4f002b3ce505', 4, 'beebs', '7bd525bf-bfb6-404b-85b9-4f933d064647'],
    ['8c64768c-0097-4ce3-818a-57c9dcc81eea', 5, 'depop', 'c0a7ccca-9290-4338-9f4a-b4de6adf4ff9'],
    ['90f535a9-67a6-4c74-8204-e9fec138448f', 6, 'leboncoin', 'a62b5a7f-a6d1-4099-966a-77168cf1275c']];
  await q(`SELECT set_config('fillsell.import_releve', 'on', false)`);
  for (const [id, u, orig, ne] of FICHES) {
    await q(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, prix_vente, description, origine, created_at)
      VALUES ($1, $2, 'Article d''essai', 'stock', 1, 1, 'Très bon état.', $3, $4)`, [id, u, orig, ne]);
  }
  await q(`SELECT set_config('fillsell.import_releve', '', false)`);
  for (const [job, k, pf, ann] of DEPOTS) {
    const [inv, u] = FICHES[k];
    const num = pf === 'depop' ? `essai-depop-${o.numero()}` : o.numero();
    const lienAnnonce = o.LIEN[pf](num);
    await q(`INSERT INTO cross_post_jobs (id, user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url, published_at, created_at, handler_build, platform_fields, photo_option, error)
      VALUES ($1, $2, $3, $4, 'cancelled', 'publish', 'Article d''essai', 1, $5, $6, now() - interval '3 hours', now() - interval '3 hours', 'releve-annonces', '{"source":"releve"}'::jsonb, 'original',
              'Annonce retirée par le vendeur (retrait ciblé depuis l''app) — pas une vente')`, [job, u, inv, pf, num, lienAnnonce]);
    await q(`INSERT INTO annonces_plateforme (id, user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, job_id, source_rapprochement, vu_le, created_at, disparu_le, retiree_le)
      VALUES ($1, $2, $3, $4, $5, 'Article d''essai', 1, 'en_ligne', $6, $7, 'automatique', now() - interval '3 hours', now() - interval '3 hours', now() - interval '2 hours', now() - interval '2 hours')`, [ann, u, pf, num, lienAnnonce, inv, job]);
    await q(`INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score) VALUES ($1, $2, $3, 'import', 'auto', 0.9)`, [u, ann, inv]);
  }
  // Une fiche HORS de la liste, même compte, même origine : jamais touchée.
  await q(`SELECT set_config('fillsell.import_releve', 'on', false)`);
  await q(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, origine, created_at) VALUES (1794389289999, $1, 'Article d''essai', 'stock', 1, 'releve_beebs', '2026-11-11 10:28:09+01')`, [U2]);
  await q(`SELECT set_config('fillsell.import_releve', '', false)`);
  const lignes = async () => Object.fromEntries((await q(`
      SELECT 'inventaire:' || i.id AS k, to_jsonb(i.*) AS v FROM inventaire i WHERE i.id IN (${FICHES.map((f) => f[0]).join(',')})
      UNION ALL SELECT 'cross_post_jobs:' || x.id, to_jsonb(x.*) FROM cross_post_jobs x WHERE x.id = ANY($1::uuid[])
      UNION ALL SELECT 'annonces_plateforme:' || x.id, to_jsonb(x.*) FROM annonces_plateforme x WHERE x.id = ANY($2::uuid[])
      UNION ALL SELECT 'rapprochements:' || x.id, to_jsonb(x.*) FROM rapprochements x WHERE x.annonce_id = ANY($2::uuid[])`,
  [DEPOTS.map((d) => d[0]), DEPOTS.map((d) => d[3])])).map((r) => [r.k, r.v]));
  const AV = await lignes();
  // Les gardes : un dépôt encore « published » → rien n'est écrit.
  await q(`UPDATE cross_post_jobs SET status = 'published' WHERE id = '8c64768c-0097-4ce3-818a-57c9dcc81eea'`);
  const g1 = await jouer(S.fantomes);
  ok(/dépôt ou une tâche vivante/.test(g1 ?? '') && (await q(`SELECT count(*)::int AS n FROM inventaire WHERE id IN (${FICHES.map((f) => f[0]).join(',')})`))[0].n === 7
    && !(await q(`SELECT to_regclass('public._backup_1111_fiches_fantomes') IS NOT NULL AS b`))[0].b, 'garde : un dépôt vivant → le script s\'arrête, rien n\'est écrit', g1);
  await q(`UPDATE cross_post_jobs SET status = 'cancelled' WHERE id = '8c64768c-0097-4ce3-818a-57c9dcc81eea'`);
  // Une annonce encore vivante → rien n'est écrit.
  await q(`UPDATE annonces_plateforme SET retiree_le = NULL, disparu_le = NULL WHERE id = 'a62b5a7f-a6d1-4099-966a-77168cf1275c'`);
  const g2b = await jouer(S.fantomes);
  ok(/annonce vivante/.test(g2b ?? ''), 'garde : une annonce vivante → le script s\'arrête, rien n\'est écrit', g2b);
  await q(`UPDATE annonces_plateforme SET retiree_le = $2::timestamptz, disparu_le = $3::timestamptz WHERE id = $1`,
    ['a62b5a7f-a6d1-4099-966a-77168cf1275c', AV['annonces_plateforme:a62b5a7f-a6d1-4099-966a-77168cf1275c'].retiree_le, AV['annonces_plateforme:a62b5a7f-a6d1-4099-966a-77168cf1275c'].disparu_le]);
  // Une fiche de plus sur le mauvais compte (liste fautive) → rien n'est écrit.
  await q(`UPDATE inventaire SET user_id = $1 WHERE id = 1794260149701`, [U2]);
  const g3 = await jouer(S.fantomes);
  ok(/6 sur 7/.test(g3 ?? ''), 'contrôle strict : une fiche sur un autre compte que l\'attendu → 6 sur 7, rien n\'est écrit', g3);
  await q(`UPDATE inventaire SET user_id = $1 WHERE id = 1794260149701`, [U1]);
  ok((await jouer(S.fantomesPreuve)) === null, 'la PREUVE (lecture seule) se joue avant');
  const delAvant = (await q(`SELECT count(*)::int AS n FROM cross_post_jobs WHERE action = 'delete'`))[0].n;
  const comptesAvant = (await q(`SELECT (SELECT count(*)::int FROM cross_post_jobs WHERE id = ANY($1::uuid[])) AS d, (SELECT count(*)::int FROM annonces_plateforme WHERE id = ANY($2::uuid[])) AS a,
    (SELECT count(*)::int FROM rapprochements WHERE annonce_id = ANY($2::uuid[])) AS r`, [DEPOTS.map((x) => x[0]), DEPOTS.map((x) => x[3])]))[0];
  const e2b = await jouer(S.fantomes);
  ok(e2b === null, 'le script passe (une transaction ; il compte lui-même dépôts, annonces et rapprochements avant et après)', e2b);
  const restent = (await q(`SELECT count(*)::int AS n FROM inventaire WHERE id IN (${FICHES.map((f) => f[0]).join(',')})`))[0].n;
  ok(restent === 0 && (await q(`SELECT count(*)::int AS n FROM inventaire WHERE id = 1794389289999`))[0].n === 1, 'les 7 fiches sont supprimées ; la fiche hors liste est intacte');
  ok((await q(`SELECT count(*)::int AS n FROM cross_post_jobs WHERE action = 'delete'`))[0].n === delAvant, 'aucun retrait né (le filet et la règle du 11/11 ont tiré et n\'ont rien trouvé)');
  const comptesApres = (await q(`SELECT (SELECT count(*)::int FROM cross_post_jobs WHERE id = ANY($1::uuid[]) AND inventaire_id IS NULL) AS d,
    (SELECT count(*)::int FROM annonces_plateforme WHERE id = ANY($2::uuid[]) AND inventaire_id IS NULL) AS a,
    (SELECT count(*)::int FROM rapprochements WHERE annonce_id = ANY($2::uuid[]) AND inventaire_id IS NULL) AS r`, [DEPOTS.map((x) => x[0]), DEPOTS.map((x) => x[3])]))[0];
  ok(JSON.stringify(comptesAvant) === JSON.stringify({ d: 10, a: 10, r: 10 }) && JSON.stringify(comptesApres) === JSON.stringify(comptesAvant),
    `(relecture M3) dépôts / annonces / rapprochements : ${comptesAvant.d} / ${comptesAvant.a} / ${comptesAvant.r} avant, les mêmes après, sans fiche`, { comptesAvant, comptesApres });
  const AP = await lignes();
  const changesHorsCle = Object.keys(AV).filter((k) => !k.startsWith('inventaire:')).filter((k) => {
    const a = { ...AV[k] }, b = { ...(AP[k] ?? {}) }; delete a.inventaire_id; delete b.inventaire_id; return JSON.stringify(a) !== JSON.stringify(b) || AP[k]?.inventaire_id !== null;
  });
  ok(changesHorsCle.length === 0, `dépôts, annonces relevées, rapprochements : intacts, seule leur clé de fiche passe à NULL (${Object.keys(AV).length - 7} lignes)`, changesHorsCle);
  const sauvF = await q(`SELECT t, count(*)::int AS n FROM _backup_1111_fiches_fantomes GROUP BY t ORDER BY t`);
  ok(JSON.stringify(sauvF) === JSON.stringify([{ t: 'annonces_plateforme', n: 10 }, { t: 'cross_post_jobs', n: 10 }, { t: 'inventaire', n: 7 }, { t: 'rapprochements', n: 10 }]), 'sauvegarde complète : 7 fiches, 10 dépôts, 10 annonces, 10 rapprochements', sauvF);
  ok((await jouer(S.fantomesPreuve)) === null, 'la PREUVE se joue après');
  ok((await jouer(S.fantomesInverse)) === null, 'l\'INVERSE passe');
  const RI = await lignes();
  const diff = [];
  for (const k of Object.keys(AV)) {
    for (const col of new Set([...Object.keys(AV[k]), ...Object.keys(RI[k] ?? {})])) {
      if (JSON.stringify(AV[k][col]) !== JSON.stringify(RI[k]?.[col])) diff.push(`${k.split(':')[0]}.${col}`);
    }
  }
  const diffs = [...new Set(diff)].sort();
  console.log(`      (colonnes qui diffèrent après l'inverse : ${diffs.join(', ') || 'aucune'})`);
  ok(Object.keys(AV).every((k) => RI[k]) && diffs.every((d2) => /^inventaire\.(prix_vente_change_le|prix_vente_change_par|poids_change_le|poids_change_par|updated_at)$/.test(d2)),
    'inverse : les 7 fiches et chaque ligne rattachée reviennent à l\'identique, hors colonnes de trace posées par les déclencheurs à l\'insertion', diffs);
}
