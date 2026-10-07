// ═══════════════════════════════════════════════════════════════════════════
// PREUVE — RATTACHEMENT AVANT STOCK (07/10/2026), EN TRANSACTION ANNULÉE
// ═══════════════════════════════════════════════════════════════════════════
// Joue la migration 20261007140000 puis un compte NEUF FICTIF (Vinted +
// Leboncoin + Beebs, annonces communes) dans UNE transaction qui finit par
// ROLLBACK : rien n'est écrit en prod (pg_net non plus : sa file est annulée).
// Les photos sont de VRAIES photos déjà empreintées (cache photo_empreintes).
//
//   node scripts/reparations/20261007_preuve_rattachement_avant_stock.mjs
//
// Ce qu'elle PROUVE :
//   1. première synchro multi-plateformes : zéro doublon dans le stock à aucun
//      moment (le moteur attend les relevés, puis tranche tout en un passage) ;
//      même photo → rattachée ; titre seul → article « À VÉRIFIER » (hors du
//      stock affiché, avec sa question) ;
//      type d'objet différent → jamais candidat ; même photo vue sur
//      Leboncoin ET Beebs, sans article → UN seul article créé ;
//   2. synchro suivante (mêmes annonces relevées à nouveau) : rien ne bouge ;
//   3. une vente sur un article rattaché : les copies Leboncoin et Beebs
//      partent au retrait (preuve « photo_identique » lue par retrait_job_prouve) ;
//   4. une republication d'un article rattaché vise LA bonne annonce ;
//   5. « Non » fait entrer l'article à vérifier au stock, « Oui » le réunit ;
//   6. (Nico, 07/10 soir) un article « à vérifier » GARDE TOUT : sa copie Beebs
//      (même photo) lui est rattachée, sa vente Leboncoin est reconnue par le
//      relevé des commandes (enregistrer_ventes_relevees) et arme le retrait de
//      la copie Beebs, exactement comme pour tout article ; sa republication
//      vise la bonne annonce.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = path.join(RACINE, 'supabase', 'migrations', '20261007140000_rattachement_avant_stock.sql');
const PHOTOS = [
  // Huit photos réelles, deux à deux éloignées (dhash > 14), déjà empreintées.
  ...JSON.parse(fs.readFileSync(path.join(RACINE, 'build', 'rattachement', 'photos-test.json'), 'utf8'))[0].urls,
];
if (PHOTOS.length < 8) { console.error('photos de test manquantes (build/rattachement/photos-test.json)'); process.exit(1); }
const P = PHOTOS.map((u) => `'${u.replace(/'/g, "''")}'`);
const U = "'00000000-0000-4000-8000-0000000a0710'::uuid";

// --en-prod : la migration est appliquée, on prouve ce qui tourne (sans la
// rejouer : son déclencheur verrouillerait vinted_sync_runs le temps du test).
let m = process.argv.includes('--en-prod') ? ''
  : fs.readFileSync(MIGRATION, 'utf8').replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
const sql = `
BEGIN;
${m}
CREATE TEMP TABLE _preuve (k text, v jsonb);
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000000', ${U}, 'authenticated', 'authenticated', 'preuve-rattachement-0710@fillsell.invalid', '', now(), now(), now(), '{}', '{}');

-- La base Vinted : quatre articles (relevé du dressing terminé).
INSERT INTO vinted_sync_runs (id, user_id, kind, platform, status, declencheur, queued_at, started_at, finished_at, items_vus, total_entries)
VALUES ('00000000-0000-4000-8000-00000000d001', ${U}, 'dressing', 'vinted', 'done', 'bouton', now() - interval '6 min', now() - interval '6 min', now() - interval '5 min', 4, 4);
INSERT INTO inventaire (id, user_id, titre, prix_vente, statut, quantite, photos, vinted_item_id, created_at) VALUES
  (9100000000001, ${U}, 'Robe longue fleurie taille M 🔥', 12, 'stock', 1, jsonb_build_array(${P[0]}), 'v1', now() - interval '5 min'),
  (9100000000002, ${U}, 'Pareo blanc et rose taille M', 5, 'stock', 1, jsonb_build_array(${P[1]}), 'v2', now() - interval '5 min'),
  (9100000000003, ${U}, 'Blazer bleu foncé femme', 8, 'stock', 1, jsonb_build_array(${P[2]}), 'v3', now() - interval '5 min'),
  (9100000000004, ${U}, 'Chapeau noir en laine 57', 6, 'stock', 1, jsonb_build_array(${P[3]}), 'v4', now() - interval '5 min');

-- Les relevés Leboncoin et Beebs, demandés par « Synchroniser », EN COURS.
INSERT INTO vinted_sync_runs (id, user_id, kind, platform, status, declencheur, queued_at, started_at, progres_le, items_vus, total_entries) VALUES
  ('00000000-0000-4000-8000-00000000a001', ${U}, 'annonces', 'leboncoin', 'running', 'bouton', now() - interval '3 min', now() - interval '2 min', now(), 4, 4),
  ('00000000-0000-4000-8000-00000000b001', ${U}, 'annonces', 'beebs', 'queued', 'bouton', now() - interval '3 min', now() - interval '3 min', NULL, 0, NULL);
INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, photo_url, statut_plateforme, run_id, vu_le) VALUES
  -- même photo que la robe Vinted → rattachée
  (${U}, 'leboncoin', 'L1', 'https://www.leboncoin.fr/ad/vetements/L1', 'Robe fleurie longue', 12, ${P[0]}, 'en_ligne', '00000000-0000-4000-8000-00000000a001', now()),
  -- même titre que le paréo, autre photo → proposition hors du stock
  (${U}, 'leboncoin', 'L2', 'https://www.leboncoin.fr/ad/vetements/L2', 'Pareo blanc et rose taille M', 5, ${P[4]}, 'en_ligne', '00000000-0000-4000-8000-00000000a001', now()),
  -- un article qui n'existe nulle part ailleurs (photo aussi sur Beebs)
  (${U}, 'leboncoin', 'L3', 'https://www.leboncoin.fr/ad/vetements/L3', 'Sac cabas osier', 15, ${P[5]}, 'en_ligne', '00000000-0000-4000-8000-00000000a001', now()),
  -- « Pantalon bleu foncé » contre « Blazer bleu foncé » : jamais candidat (type)
  (${U}, 'leboncoin', 'L4', 'https://www.leboncoin.fr/ad/vetements/L4', 'Pantalon bleu foncé femme', 8, ${P[6]}, 'en_ligne', '00000000-0000-4000-8000-00000000a001', now()),
  -- même titre que le chapeau / le blazer Vinted, sans photo → « à vérifier »
  (${U}, 'leboncoin', 'L5', 'https://www.leboncoin.fr/ad/vetements/L5', 'Chapeau noir en laine 57', 6, NULL, 'en_ligne', '00000000-0000-4000-8000-00000000a001', now()),
  (${U}, 'leboncoin', 'L6', 'https://www.leboncoin.fr/ad/vetements/L6', 'Blazer bleu foncé femme', 8, NULL, 'en_ligne', '00000000-0000-4000-8000-00000000a001', now());

-- ── 1a. PENDANT les relevés : le moteur attend, rien n'entre dans le stock.
SELECT rapprochement_demander(${U}, 'preuve');
UPDATE rapprochement_comptes SET passages_photos = 99 WHERE user_id = ${U};
INSERT INTO _preuve SELECT 'pendant_releves', jsonb_build_object(
  'moteur', rapprochement_avancer(${U}, 20000),
  'articles', (SELECT count(*) FROM inventaire WHERE user_id = ${U} AND fusionne_dans IS NULL));

-- Les relevés finissent ; Beebs écrit ses annonces.
UPDATE vinted_sync_runs SET status = 'done', finished_at = now() WHERE id = '00000000-0000-4000-8000-00000000a001';
UPDATE vinted_sync_runs SET status = 'running', started_at = now(), progres_le = now() WHERE id = '00000000-0000-4000-8000-00000000b001';
INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, photo_url, statut_plateforme, run_id, vu_le) VALUES
  -- même photo que la robe Vinted → rattachée aussi
  (${U}, 'beebs', 'B1', 'https://www.beebs.app/fr/p/B1', 'Robe longue à fleurs', 12, ${P[0]}, 'en_ligne', '00000000-0000-4000-8000-00000000b001', now()),
  -- même photo que L3 (aucun article) → regroupée sur UN seul article
  (${U}, 'beebs', 'B2', 'https://www.beebs.app/fr/p/B2', 'Panier en osier', 15, ${P[5]}, 'en_ligne', '00000000-0000-4000-8000-00000000b001', now()),
  -- seulement sur Beebs → créée
  (${U}, 'beebs', 'B3', 'https://www.beebs.app/fr/p/B3', 'Lampe de chevet bois', 20, ${P[7]}, 'en_ligne', '00000000-0000-4000-8000-00000000b001', now()),
  -- même photo que le paréo Leboncoin (L2, à vérifier) → rattachée à LUI
  (${U}, 'beebs', 'B4', 'https://www.beebs.app/fr/p/B4', 'Paréo blanc rose', 5, ${P[4]}, 'en_ligne', '00000000-0000-4000-8000-00000000b001', now());
UPDATE vinted_sync_runs SET status = 'done', finished_at = now() WHERE id = '00000000-0000-4000-8000-00000000b001';
UPDATE rapprochement_comptes SET passages_photos = 99 WHERE user_id = ${U};

-- ── 1b. APRÈS les relevés : un passage tranche tout.
DO $$ DECLARE r jsonb; i int; j jsonb := '[]'; BEGIN
  FOR i IN 1..10 LOOP r := rapprochement_avancer(${U}, 20000); j := j || jsonb_build_array(r); EXIT WHEN r->>'etat' IN ('termine','attente_releves','occupe','cpu'); END LOOP;
  INSERT INTO _preuve VALUES ('moteur', j);
END $$;
INSERT INTO _preuve SELECT 'premiere_synchro', jsonb_build_object(
  'articles', (SELECT jsonb_agg(jsonb_build_object('id', i.id, 'titre', i.titre, 'origine', i.origine, 'a_verifier', i.a_verifier,
                 'annonces', (SELECT jsonb_agg(a.platform || ':' || a.listing_id ORDER BY a.listing_id) FROM annonces_plateforme a WHERE a.inventaire_id = i.id)) ORDER BY i.id)
               FROM inventaire i WHERE i.user_id = ${U} AND i.fusionne_dans IS NULL),
  'stock_affiche', (SELECT count(*) FROM inventaire WHERE user_id = ${U} AND fusionne_dans IS NULL AND statut = 'stock' AND a_verifier IS NULL),
  'questions', (SELECT jsonb_agg(jsonb_build_object('id', d.id, 'garde', d.garde, 'absorbe', d.absorbe, 'motif', d.motif)) FROM inventaire_doublons d WHERE d.user_id = ${U} AND d.statut = 'proposee'),
  'propositions', (SELECT jsonb_agg(jsonb_build_object('annonce', a.listing_id, 'motif', a.proposition ->> 'motif', 'vers', a.proposition ->> 'inventaire_id'))
                   FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.proposition IS NOT NULL AND a.inventaire_id IS NULL),
  'en_attente', (SELECT count(*) FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.inventaire_id IS NULL AND a.proposition IS NULL AND a.ignoree_le IS NULL),
  'compte', (SELECT to_jsonb(c) - 'user_id' FROM rapprochement_comptes c WHERE c.user_id = ${U}),
  'preuves_retrait', (SELECT jsonb_object_agg(a.listing_id, retrait_job_prouve(a.job_id)) FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.job_id IS NOT NULL));

-- ── 2. SYNCHRO SUIVANTE : mêmes annonces relevées à nouveau, rien ne bouge.
INSERT INTO vinted_sync_runs (id, user_id, kind, platform, status, declencheur, queued_at, started_at, finished_at, items_vus, total_entries) VALUES
  ('00000000-0000-4000-8000-00000000a002', ${U}, 'annonces', 'leboncoin', 'running', 'bouton', now(), now(), NULL, 4, 4);
UPDATE annonces_plateforme SET run_id = '00000000-0000-4000-8000-00000000a002', vu_le = now() WHERE user_id = ${U} AND platform = 'leboncoin';
UPDATE vinted_sync_runs SET status = 'done', finished_at = now() WHERE id = '00000000-0000-4000-8000-00000000a002';
UPDATE rapprochement_comptes SET passages_photos = 99 WHERE user_id = ${U};
DO $$ DECLARE r jsonb; i int; BEGIN
  FOR i IN 1..10 LOOP r := rapprochement_avancer(${U}, 20000); EXIT WHEN r->>'etat' IN ('termine','attente_releves','occupe','cpu'); END LOOP;
  INSERT INTO _preuve VALUES ('synchro_suivante', jsonb_build_object('moteur', r,
    'articles', (SELECT count(*) FROM inventaire WHERE user_id = ${U} AND fusionne_dans IS NULL),
    'stock_affiche', (SELECT count(*) FROM inventaire WHERE user_id = ${U} AND fusionne_dans IS NULL AND statut = 'stock' AND a_verifier IS NULL),
    'a_verifier', (SELECT count(*) FROM inventaire WHERE user_id = ${U} AND fusionne_dans IS NULL AND a_verifier IS NOT NULL),
    'questions', (SELECT count(*) FROM inventaire_doublons d WHERE d.user_id = ${U} AND d.statut = 'proposee'),
    'propositions', (SELECT count(*) FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.proposition IS NOT NULL AND a.inventaire_id IS NULL)));
END $$;

-- Un poste avec l'extension (sinon la republication est refusée, à raison).
INSERT INTO profiles (id) VALUES (${U}) ON CONFLICT (id) DO NOTHING;
UPDATE profiles SET extension_last_seen_at = now(), extension_version = '0.6.102', extension_build = '0.6.102' WHERE id = ${U};

-- La suite se joue en tant que la personne (republication, réponses).
SELECT set_config('request.jwt.claims', json_build_object('sub', ${U}, 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', ${U}::text, true);

-- ── 6a. UN ARTICLE À VÉRIFIER SE REPUBLIE (le paréo L2, photo) : vise L2.
INSERT INTO _preuve SELECT 'republication_a_verifier', jsonb_build_object(
  'article', (SELECT a.inventaire_id FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.listing_id = 'L2'),
  'a_verifier', (SELECT i.a_verifier IS NOT NULL FROM inventaire i JOIN annonces_plateforme a ON a.inventaire_id = i.id WHERE a.user_id = ${U} AND a.listing_id = 'L2'),
  'rpc', spend_coins_and_republish((SELECT a.inventaire_id FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.listing_id = 'L2'), NULL, 'manuel', NULL, 'leboncoin'));
INSERT INTO _preuve SELECT 'job_republication_a_verifier', (SELECT jsonb_agg(jsonb_build_object('action', j.action, 'statut', j.status, 'listing_url', j.listing_url))
  FROM cross_post_jobs j WHERE j.user_id = ${U} AND j.action = 'republish'
   AND j.inventaire_id = (SELECT a.inventaire_id FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.listing_id = 'L2'));

-- ── 6b. UN ARTICLE À VÉRIFIER VENDU (le paréo L2, copie Beebs B4) : le relevé
--     des commandes le reconnaît, et la vente arme le retrait de la copie.
INSERT INTO _preuve SELECT 'commande_a_verifier', enregistrer_ventes_relevees('leboncoin',
  jsonb_build_array(jsonb_build_object('ref', 'CMD-PREUVE-L2', 'statut', 'done', 'titre', 'Pareo blanc et rose taille M', 'prix', 5,
                                       'listing_id', 'L2', 'vendu_le', now())), ${U});
INSERT INTO _preuve SELECT 'vente_a_verifier', jsonb_build_object(
  'article', (SELECT a.inventaire_id FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.listing_id = 'L2'),
  'vente_sur', (SELECT v.inventaire_id FROM ventes v WHERE v.user_id = ${U} AND v.commande_ref = 'CMD-PREUVE-L2'));
UPDATE inventaire SET statut = 'vendu', quantite = 0
 WHERE id = (SELECT a.inventaire_id FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.listing_id = 'L2');
INSERT INTO _preuve SELECT 'retrait_copie_a_verifier', jsonb_build_object(
  'retraits', (SELECT jsonb_agg(jsonb_build_object('platform', j.platform, 'statut', j.status, 'listing', COALESCE(j.platform_listing_id, j.listing_url)))
               FROM cross_post_jobs j WHERE j.user_id = ${U} AND j.action = 'delete'
                AND j.inventaire_id = (SELECT a.inventaire_id FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.listing_id = 'L2')));

-- ── 5. LA PERSONNE TRANCHE, en tant qu'elle : « Non » au chapeau (L5) — il
--    entre au stock ; « Oui » au blazer (L6) — il rejoint le blazer Vinted.
INSERT INTO _preuve SELECT 'non_chapeau', inventaire_doublon_decider((SELECT d.id FROM inventaire_doublons d JOIN annonces_plateforme a ON a.inventaire_id = d.absorbe
                                                                       WHERE d.user_id = ${U} AND d.statut = 'proposee' AND a.listing_id = 'L5'), 'non', NULL);
INSERT INTO _preuve SELECT 'oui_blazer', inventaire_doublon_decider((SELECT d.id FROM inventaire_doublons d JOIN annonces_plateforme a ON a.inventaire_id = d.absorbe
                                                                      WHERE d.user_id = ${U} AND d.statut = 'proposee' AND a.listing_id = 'L6'), 'oui', NULL);
INSERT INTO _preuve SELECT 'apres_reponses', jsonb_build_object(
  'chapeau', (SELECT jsonb_build_object('id', i.id, 'a_verifier', i.a_verifier, 'statut', i.statut) FROM inventaire i JOIN annonces_plateforme a ON a.inventaire_id = i.id WHERE a.user_id = ${U} AND a.listing_id = 'L5'),
  'blazer_L6_sur', (SELECT a.inventaire_id FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.listing_id = 'L6'),
  'a_verifier_restants', (SELECT count(*) FROM inventaire WHERE user_id = ${U} AND fusionne_dans IS NULL AND statut = 'stock' AND a_verifier IS NOT NULL));

-- ── 3. UNE VENTE SUR L'ARTICLE RATTACHÉ (la robe) : les copies partent.
-- Comme la détection de vente : la vente (Vinted) est inscrite, puis l'article passe vendu.
INSERT INTO ventes (id, user_id, inventaire_id, plateforme, plateforme_code) VALUES (9100000000901, ${U}, 9100000000001, 'Vinted', 'vinted');
UPDATE inventaire SET statut = 'vendu', quantite = 0 WHERE id = 9100000000001;
INSERT INTO _preuve SELECT 'vente_robe', jsonb_build_object(
  'retraits', (SELECT jsonb_agg(jsonb_build_object('platform', j.platform, 'statut', j.status, 'listing', COALESCE(j.platform_listing_id, j.listing_url)))
               FROM cross_post_jobs j WHERE j.user_id = ${U} AND j.inventaire_id = 9100000000001 AND j.action = 'delete'));

-- ── 4. REPUBLIER le sac (L3 + B2 regroupées) sur Beebs : vise B2.
INSERT INTO _preuve SELECT 'republication_sac', jsonb_build_object(
  'article', (SELECT a.inventaire_id FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.listing_id = 'B2'),
  'rpc', spend_coins_and_republish((SELECT a.inventaire_id FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.listing_id = 'B2'), NULL, 'manuel', NULL, 'beebs'));
INSERT INTO _preuve SELECT 'job_republication', (SELECT jsonb_agg(jsonb_build_object('action', j.action, 'statut', j.status, 'listing_url', j.listing_url, 'listing_id', j.platform_listing_id, 'source', j.platform_fields -> 'source_job_id'))
  FROM cross_post_jobs j WHERE j.user_id = ${U} AND j.action = 'republish');

SELECT k, v FROM _preuve;
ROLLBACK;
`;
const f = path.join(os.tmpdir(), `preuve-rattachement-${Date.now()}.sql`);
fs.writeFileSync(f, sql);
let out;
try {
  out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  const t = String(e.stdout || e.message); const i = t.indexOf('ERROR:');
  console.error(i >= 0 ? t.slice(i, i + 800) : t.slice(0, 1500)); process.exit(1);
} finally { fs.rmSync(f, { force: true }); }
const lignes = JSON.parse(out.slice(out.indexOf('{'))).rows;
const R = Object.fromEntries(lignes.map((l) => [l.k, l.v]));
fs.writeFileSync(path.join(RACINE, 'build', 'rattachement', 'preuve-resultat.json'), JSON.stringify(R, null, 1));

let ko = 0;
const ok = (c, quoi, d = '') => { console.log(`  ${c ? '✓' : '✗'} ${quoi}${c ? '' : `   ← ${typeof d === 'string' ? d : JSON.stringify(d)}`}`); if (!c) ko++; };
const ps = R.premiere_synchro ?? {};
const arts = ps.articles ?? [];
const deArt = (lid) => arts.find((a) => (a.annonces ?? []).some((x) => x.endsWith(`:${lid}`)));
console.log('1. Première synchro multi-plateformes');
ok(R.pendant_releves?.moteur?.etat === 'attente_releves' && R.pendant_releves?.articles === 4, 'pendant les relevés : le moteur attend, le stock reste à 4 articles', R.pendant_releves);
const visibles = arts.filter((a) => !a.a_verifier);
const aVerif = arts.filter((a) => a.a_verifier);
ok(ps.stock_affiche === 7 && visibles.length === 7, 'stock affiché : 4 Vinted + sac + pantalon + lampe = 7 articles, aucun doublon', visibles.map((a) => a.titre));
ok(aVerif.length === 3, 'trois articles « à vérifier » (paréo, chapeau, blazer), HORS du stock affiché', aVerif.map((a) => a.titre));
ok((ps.questions ?? []).length === 3, 'chacun avec sa question « Est-ce le même article ? »', ps.questions);
ok(deArt('L1')?.id === 9100000000001 && deArt('B1')?.id === 9100000000001, 'même photo que la robe Vinted : L1 et B1 rattachées à la robe', { L1: deArt('L1')?.id, B1: deArt('B1')?.id });
ok(deArt('L2')?.a_verifier && String(deArt('L2')?.a_verifier?.candidat) === '9100000000002', 'paréo (titre seul) : article « à vérifier », question vers le paréo Vinted', deArt('L2'));
ok(deArt('B4') && deArt('B4')?.id === deArt('L2')?.id, 'sa copie Beebs (même photo) lui est rattachée : UN article, deux annonces', { L2: deArt('L2')?.id, B4: deArt('B4')?.id });
ok(!(ps.propositions ?? []).length, 'plus aucune annonce sans article (ventes, retraits, republication sinon perdus)', ps.propositions);
ok(deArt('L3') && deArt('L3')?.id === deArt('B2')?.id, 'sac vu sur Leboncoin ET Beebs (même photo) : UN seul article', { L3: deArt('L3')?.id, B2: deArt('B2')?.id });
ok(deArt('L4') && deArt('L4')?.id !== 9100000000003, 'pantalon ≠ blazer : jamais candidat, article créé', deArt('L4'));
ok(deArt('B3'), 'la lampe (Beebs seulement) : article créé');
ok(ps.en_attente === 0 && ps.compte?.etat === 'termine', 'rapprochement terminé, plus rien en attente', ps.compte);
ok(['L1', 'B1', 'L3', 'B2', 'L2', 'B4'].every((l) => ps.preuves_retrait?.[l] === true), 'copies rattachées = preuves de retrait (retrait_job_prouve), à vérifier compris', ps.preuves_retrait);
console.log('2. Synchro suivante');
ok(R.synchro_suivante?.stock_affiche === 7 && R.synchro_suivante?.a_verifier === 3 && R.synchro_suivante?.questions === 3 && R.synchro_suivante?.articles === 10,
  'les mêmes annonces relevées à nouveau : 7 au stock, 3 à vérifier, 3 questions, rien de neuf', R.synchro_suivante);
console.log('6. Un article « à vérifier » garde TOUT');
ok(R.republication_a_verifier?.a_verifier === true && R.republication_a_verifier?.rpc?.allowed !== false
  && (R.job_republication_a_verifier ?? []).some((j) => String(j.listing_url ?? '').includes('/L2')), 'il se republie, sur la bonne annonce', R.republication_a_verifier);
ok(R.vente_a_verifier?.article != null && String(R.vente_a_verifier?.vente_sur) === String(R.vente_a_verifier?.article), 'sa commande Leboncoin est reconnue (vente sur CET article)', R.vente_a_verifier);
const retAV = R.retrait_copie_a_verifier?.retraits ?? [];
ok(retAV.some((r) => r.platform === 'beebs'), 'vendu : le retrait de sa copie Beebs est armé, comme pour tout article', retAV);
console.log('5. La personne tranche');
ok(R.non_chapeau?.ok === true && R.apres_reponses?.chapeau?.a_verifier == null && R.apres_reponses?.chapeau?.statut === 'stock', '« Non » : le chapeau Leboncoin entre au stock (un autre article)', { r: R.non_chapeau, apres: R.apres_reponses?.chapeau });
ok(R.oui_blazer?.ok === true && String(R.apres_reponses?.blazer_L6_sur) === '9100000000003', '« Oui » : le blazer Leboncoin rejoint le blazer Vinted (une seule carte)', { r: R.oui_blazer, L6: R.apres_reponses?.blazer_L6_sur });
ok(R.apres_reponses?.a_verifier_restants === 0, 'plus rien à vérifier (le paréo vendu n’est plus en stock)', R.apres_reponses);
console.log('3. Vente sur un article rattaché');
const ret = R.vente_robe?.retraits ?? [];
ok(ret.some((r) => r.platform === 'leboncoin') && ret.some((r) => r.platform === 'beebs'), 'la robe vendue : retraits Leboncoin ET Beebs armés', ret);
console.log('4. Republication d’un article rattaché');
const jr = R.job_republication ?? [];
ok(R.republication_sac?.rpc?.allowed !== false && jr.some((j) => String(j.listing_url ?? '').includes('/B2') || j.listing_id === 'B2'), 'republier le sac sur Beebs vise l’annonce B2', { rpc: R.republication_sac?.rpc, jobs: jr });
console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert (transaction annulée : rien d’écrit).');
process.exit(ko ? 1 : 0);
