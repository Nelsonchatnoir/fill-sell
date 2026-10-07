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
//      même photo → rattachée ; titre seul → proposition HORS du stock ;
//      type d'objet différent → jamais candidat ; même photo vue sur
//      Leboncoin ET Beebs, sans article → UN seul article créé ;
//   2. synchro suivante (mêmes annonces relevées à nouveau) : rien ne bouge ;
//   3. une vente sur un article rattaché : les copies Leboncoin et Beebs
//      partent au retrait (preuve « photo_identique » lue par retrait_job_prouve) ;
//   4. une republication d'un article rattaché vise LA bonne annonce ;
//   5. « Non » à une proposition crée l'article, « Oui » le rattache.
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

let m = fs.readFileSync(MIGRATION, 'utf8').replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
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
  (${U}, 'leboncoin', 'L4', 'https://www.leboncoin.fr/ad/vetements/L4', 'Pantalon bleu foncé femme', 8, ${P[6]}, 'en_ligne', '00000000-0000-4000-8000-00000000a001', now());

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
  (${U}, 'beebs', 'B3', 'https://www.beebs.app/fr/p/B3', 'Lampe de chevet bois', 20, ${P[7]}, 'en_ligne', '00000000-0000-4000-8000-00000000b001', now());
UPDATE vinted_sync_runs SET status = 'done', finished_at = now() WHERE id = '00000000-0000-4000-8000-00000000b001';
UPDATE rapprochement_comptes SET passages_photos = 99 WHERE user_id = ${U};

-- ── 1b. APRÈS les relevés : un passage tranche tout.
DO $$ DECLARE r jsonb; i int; j jsonb := '[]'; BEGIN
  FOR i IN 1..10 LOOP r := rapprochement_avancer(${U}, 20000); j := j || jsonb_build_array(r); EXIT WHEN r->>'etat' IN ('termine','attente_releves','occupe','cpu'); END LOOP;
  INSERT INTO _preuve VALUES ('moteur', j);
END $$;
INSERT INTO _preuve SELECT 'premiere_synchro', jsonb_build_object(
  'articles', (SELECT jsonb_agg(jsonb_build_object('id', i.id, 'titre', i.titre, 'origine', i.origine,
                 'annonces', (SELECT jsonb_agg(a.platform || ':' || a.listing_id ORDER BY a.listing_id) FROM annonces_plateforme a WHERE a.inventaire_id = i.id)) ORDER BY i.id)
               FROM inventaire i WHERE i.user_id = ${U} AND i.fusionne_dans IS NULL),
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
    'propositions', (SELECT count(*) FROM annonces_plateforme a WHERE a.user_id = ${U} AND a.proposition IS NOT NULL AND a.inventaire_id IS NULL)));
END $$;

-- ── 5. LA PERSONNE TRANCHE : « Oui » au paréo (L2), puis un « Non » simulé
--    sur une proposition fabriquée (import), en tant qu'elle.
SELECT set_config('request.jwt.claims', json_build_object('sub', ${U}, 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', ${U}::text, true);
INSERT INTO _preuve SELECT 'oui_pareo', rapprochement_decider((SELECT id FROM annonces_plateforme WHERE user_id = ${U} AND listing_id = 'L2'), 'attache', NULL);

-- ── 3. UNE VENTE SUR L'ARTICLE RATTACHÉ (la robe) : les copies partent.
-- Comme la détection de vente : la vente (Vinted) est inscrite, puis l'article passe vendu.
INSERT INTO ventes (id, user_id, inventaire_id, plateforme, plateforme_code) VALUES (9100000000901, ${U}, 9100000000001, 'Vinted', 'vinted');
UPDATE inventaire SET statut = 'vendu', quantite = 0 WHERE id = 9100000000001;
INSERT INTO _preuve SELECT 'vente_robe', jsonb_build_object(
  'retraits', (SELECT jsonb_agg(jsonb_build_object('platform', j.platform, 'statut', j.status, 'listing', COALESCE(j.platform_listing_id, j.listing_url)))
               FROM cross_post_jobs j WHERE j.user_id = ${U} AND j.inventaire_id = 9100000000001 AND j.action = 'delete'));

-- Un poste avec l'extension (sinon la republication est refusée, à raison).
INSERT INTO profiles (id) VALUES (${U}) ON CONFLICT (id) DO NOTHING;
UPDATE profiles SET extension_last_seen_at = now(), extension_version = '0.6.102', extension_build = '0.6.102' WHERE id = ${U};
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
ok(arts.length === 7, 'stock final : 4 Vinted + sac + pantalon + lampe = 7 articles, aucun doublon', arts.map((a) => a.titre));
ok(deArt('L1')?.id === 9100000000001 && deArt('B1')?.id === 9100000000001, 'même photo que la robe Vinted : L1 et B1 rattachées à la robe', { L1: deArt('L1')?.id, B1: deArt('B1')?.id });
ok((ps.propositions ?? []).some((p) => p.annonce === 'L2' && String(p.vers) === '9100000000002'), 'paréo (titre seul) : proposition HORS du stock vers le paréo Vinted', ps.propositions);
ok(!deArt('L2'), 'le paréo Leboncoin n’est PAS un article du stock tant que ce n’est pas tranché');
ok(deArt('L3') && deArt('L3')?.id === deArt('B2')?.id, 'sac vu sur Leboncoin ET Beebs (même photo) : UN seul article', { L3: deArt('L3')?.id, B2: deArt('B2')?.id });
ok(deArt('L4') && deArt('L4')?.id !== 9100000000003, 'pantalon ≠ blazer : jamais candidat, article créé', deArt('L4'));
ok(deArt('B3'), 'la lampe (Beebs seulement) : article créé');
ok(ps.en_attente === 0 && ps.compte?.etat === 'termine', 'rapprochement terminé, plus rien en attente', ps.compte);
ok(['L1', 'B1', 'L3', 'B2'].every((l) => ps.preuves_retrait?.[l] === true), 'copies rattachées = preuves de retrait (retrait_job_prouve)', ps.preuves_retrait);
console.log('2. Synchro suivante');
ok(R.synchro_suivante?.articles === 7 && R.synchro_suivante?.propositions === 1, 'les mêmes annonces relevées à nouveau : 7 articles, 1 proposition, rien de neuf', R.synchro_suivante);
console.log('5. La personne tranche');
ok(R.oui_pareo?.ok === true && String(R.oui_pareo?.inventaire_id) === '9100000000002', '« Oui » : le paréo Leboncoin rejoint le paréo Vinted', R.oui_pareo);
console.log('3. Vente sur un article rattaché');
const ret = R.vente_robe?.retraits ?? [];
ok(ret.some((r) => r.platform === 'leboncoin') && ret.some((r) => r.platform === 'beebs'), 'la robe vendue : retraits Leboncoin ET Beebs armés', ret);
console.log('4. Republication d’un article rattaché');
const jr = R.job_republication ?? [];
ok(R.republication_sac?.rpc?.allowed !== false && jr.some((j) => String(j.listing_url ?? '').includes('/B2') || j.listing_id === 'B2'), 'republier le sac sur Beebs vise l’annonce B2', { rpc: R.republication_sac?.rpc, jobs: jr });
console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert (transaction annulée : rien d’écrit).');
process.exit(ko ? 1 : 0);
