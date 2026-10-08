// ═══════════════════════════════════════════════════════════════════════════
// PREUVE EN TRANSACTION ANNULÉE — migration 20261008150000 (fiche à la main
// face à une fiche Vinted), 08/10/2026 soir
// ═══════════════════════════════════════════════════════════════════════════
// Un compte fictif, des fiches fabriquées, la migration posée DANS la
// transaction, les décisions du moteur écrites par rapprochement_v3_appliquer,
// puis ROLLBACK : rien n'est écrit en prod (pg_net non plus : sa file est
// annulée avec la transaction).
//   node scripts/reparations/20261008_preuve_fiches_main.mjs            (migration incluse)
//   node scripts/reparations/20261008_preuve_fiches_main.mjs --en-prod  (migration déjà posée)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = path.join(RACINE, 'supabase', 'migrations', '20261008150000_fiche_a_la_main_face_a_vinted.sql');
const U = "'00000000-0000-4000-8000-0000000f0810'::uuid";
const m = process.argv.includes('--en-prod') ? ''
  : fs.readFileSync(MIGRATION, 'utf8').split('\r\n').join('\n').replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
const D = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

const sql = `
BEGIN;
${m}
CREATE TEMP TABLE _preuve (k text, v jsonb);
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000000', ${U}, 'authenticated', 'authenticated', 'preuve-fiches-main-0810@fillsell.invalid', '', now(), now(), now(), '{}', '{}');
-- la boutique Vinted du compte, confirmée (garde inventaire_ecarte_import_sync)
INSERT INTO profiles (id) VALUES (${U}) ON CONFLICT (id) DO NOTHING;
UPDATE profiles SET vinted_sync_pin = '{"v":"2","boutiques":[{"user_id":"b-preuve"}]}'::jsonb WHERE id = ${U};

-- 1 fiche à la main (prix d'achat, sa photo) / 2 sa fiche Vinted (dressing, intacte)
-- 3 fiche à la main / 4 fiche Vinted TOUCHÉE (prix d'achat saisi) → la question, jamais la fusion
-- 5 fiche à la main / 6 fiche Vinted intacte → un doute : la question, 6 hors du stock
-- 7 fiche à la main / 8 fiche Vinted, paire refusée par la personne → rien
-- 9 fiche à la main en 3 exemplaires / 10 fiche Vinted → la question
INSERT INTO inventaire (id, user_id, titre, prix_vente, prix_achat, statut, quantite, photos, origine, vinted_item_id, vinted_status, vinted_account_id, created_at) VALUES
  (9200000000001, ${U}, 'Robe Sézane Lou 38', 45, 12, 'stock', 1, '["https://x.test/h1.jpg"]', NULL, NULL, NULL, NULL, now() - interval '10 days'),
  (9200000000002, ${U}, 'Robe Sézane modèle Lou 38', 40, NULL, 'stock', 1, '["https://x.test/v2.jpg"]', 'vinted_sync', 'vt-2', 'active', 'b-preuve', now() - interval '1 hour'),
  (9200000000003, ${U}, 'Pull Saint James', 30, 8, 'stock', 1, '["https://x.test/h3.jpg"]', NULL, NULL, NULL, NULL, now() - interval '9 days'),
  (9200000000004, ${U}, 'Pull marin Saint James', 30, 9, 'stock', 1, '["https://x.test/v4.jpg"]', 'vinted_sync', 'vt-4', 'active', 'b-preuve', now() - interval '1 hour'),
  (9200000000005, ${U}, 'Lampe laiton', 20, NULL, 'stock', 1, '["https://x.test/h5.jpg"]', NULL, NULL, NULL, NULL, now() - interval '8 days'),
  (9200000000006, ${U}, 'Lampe de chevet laiton', 22, NULL, 'stock', 1, '["https://x.test/v6.jpg"]', 'vinted_sync', 'vt-6', 'active', 'b-preuve', now() - interval '1 hour'),
  (9200000000007, ${U}, 'Sac Longchamp', 50, 20, 'stock', 1, '["https://x.test/h7.jpg"]', NULL, NULL, NULL, NULL, now() - interval '7 days'),
  (9200000000008, ${U}, 'Sac Longchamp pliage', 50, NULL, 'stock', 1, '["https://x.test/v8.jpg"]', 'vinted_sync', 'vt-8', 'active', 'b-preuve', now() - interval '1 hour'),
  (9200000000009, ${U}, 'Body bébé', 5, 1, 'stock', 3, '["https://x.test/h9.jpg"]', NULL, NULL, NULL, NULL, now() - interval '6 days'),
  (9200000000010, ${U}, 'Body bébé coton', 5, NULL, 'stock', 1, '["https://x.test/v10.jpg"]', 'vinted_sync', 'vt-10', 'active', 'b-preuve', now() - interval '1 hour');
INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source, decide_par, decide_le)
VALUES (${U}, 9200000000007, 9200000000008, 'probable', 'refusee', 'photo_identique', '{}', 'releve', 'utilisateur', now() - interval '1 day');

INSERT INTO _preuve SELECT 'lire', (SELECT jsonb_build_object('actif', d -> 'fiches_main_actif', 'main', d -> 'fiches_main_a_juger', 'vinted', d -> 'vinted_a_juger')
                                      FROM (SELECT rapprochement_v3_lire(${U}) d) x);
INSERT INTO _preuve SELECT 'gardes', jsonb_build_object(
  '1_2', rapprochement_v3_fiches_fusionnables(${U}, 9200000000001, 9200000000002),
  '3_4', rapprochement_v3_fiches_fusionnables(${U}, 9200000000003, 9200000000004),
  '7_8', rapprochement_v3_fiches_fusionnables(${U}, 9200000000007, 9200000000008),
  '9_10', rapprochement_v3_fiches_fusionnables(${U}, 9200000000009, 9200000000010),
  '2_1', rapprochement_v3_fiches_fusionnables(${U}, 9200000000002, 9200000000001));
INSERT INTO _preuve SELECT 'appliquer', rapprochement_v3_appliquer(${U}, ${D([
  { type: 'fusionner_fiche', garde: '9200000000001', absorbe: '9200000000002', motif: 'photo_identique', preuve: { regle: 'rapprochement_v3', portee: 'fiche_main', photo: 2 } },
  { type: 'fusionner_fiche', garde: '9200000000003', absorbe: '9200000000004', motif: 'photo_identique', preuve: { regle: 'rapprochement_v3', portee: 'fiche_main', photo: 3 } },
  { type: 'fiche_a_verifier', garde: '9200000000005', absorbe: '9200000000006', motif: 'photo_proche', preuves: { regle: 'rapprochement_v3', portee: 'fiche_main', photo: 10 } },
  { type: 'fusionner_fiche', garde: '9200000000007', absorbe: '9200000000008', motif: 'photo_identique', preuve: {} },
  { type: 'fusionner_fiche', garde: '9200000000009', absorbe: '9200000000010', motif: 'photo_identique', preuve: {} },
])}, 'normal', false);
INSERT INTO _preuve SELECT 'apres', (SELECT jsonb_object_agg(i.id::text, jsonb_build_object('fusionne_dans', i.fusionne_dans, 'vinted_item_id', i.vinted_item_id, 'prix_achat', i.prix_achat,
                                       'titre', i.titre, 'a_verifier', i.a_verifier ->> 'motif', 'statut', i.statut))
                                     FROM inventaire i WHERE i.user_id = ${U});
INSERT INTO _preuve SELECT 'questions', (SELECT jsonb_agg(jsonb_build_object('garde', d.garde, 'absorbe', d.absorbe, 'statut', d.statut, 'portee', d.preuves ->> 'portee', 'refus', d.preuves ->> 'refus_fusion'))
                                         FROM inventaire_doublons d WHERE d.user_id = ${U});
INSERT INTO _preuve SELECT 'fusions', (SELECT jsonb_agg(jsonb_build_object('garde', f.garde, 'absorbe', f.absorbe, 'par', f.par, 'vinted', f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id'))
                                       FROM inventaire_fusions f WHERE f.user_id = ${U});
INSERT INTO _preuve SELECT 'journal', (SELECT jsonb_agg(r.detail) FROM rapprochements r WHERE r.user_id = ${U});
-- relancé : rien de plus (décisions définitives, paire déjà tranchée)
INSERT INTO _preuve SELECT 'rejoue', rapprochement_v3_appliquer(${U}, ${D([
  { type: 'fusionner_fiche', garde: '9200000000001', absorbe: '9200000000002', motif: 'photo_identique', preuve: {} },
  { type: 'fiche_a_verifier', garde: '9200000000005', absorbe: '9200000000006', motif: 'photo_proche', preuves: {} },
])}, 'normal', false);
INSERT INTO _preuve SELECT 'stock_affiche', to_jsonb((SELECT count(*) FROM inventaire WHERE user_id = ${U} AND fusionne_dans IS NULL AND statut = 'stock' AND a_verifier IS NULL));
-- l'inverse : la fusion défaite rend la fiche Vinted et son identité
INSERT INTO _preuve SELECT 'defaite', inventaire_defusionner_pour(${U}, (SELECT id FROM inventaire_fusions WHERE user_id = ${U} LIMIT 1), 'fiches_main_inverse');
INSERT INTO _preuve SELECT 'apres_inverse', (SELECT jsonb_object_agg(i.id::text, jsonb_build_object('fusionne_dans', i.fusionne_dans, 'vinted_item_id', i.vinted_item_id))
                                             FROM inventaire i WHERE i.id IN (9200000000001, 9200000000002));
SELECT k, v FROM _preuve;
ROLLBACK;
`;
const f = path.join(os.tmpdir(), `preuve-fiches-main-${process.pid}.sql`);
fs.writeFileSync(f, sql);
let out;
try { out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { console.error(String(e.stdout || '') + String(e.stderr || e.message)); process.exit(1); }
finally { fs.rmSync(f, { force: true }); }
const lignes = JSON.parse(out.slice(out.indexOf('{'))).rows;
const R = Object.fromEntries(lignes.map((l) => [l.k, l.v]));
let ko = 0;
const ok = (c, quoi, detail) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`, detail !== undefined ? JSON.stringify(detail).slice(0, 600) : ''); } else console.log(`  ✓ ${quoi}`); };
const A = R.apres ?? {};
console.log('1. La lecture');
ok(R.lire?.actif === true, 'la lecture allume la règle (fiches_main_actif)', R.lire);
ok((R.lire?.vinted ?? []).length === 5, 'les 5 fiches Vinted nées depuis la dernière passe sont à juger (compte sans import, avec fiches à la main)', R.lire);
console.log('2. Les gardes de la base');
ok(R.gardes?.['1_2'] === null, 'fiche à la main + fiche Vinted intacte : fusionnables', R.gardes);
ok(R.gardes?.['3_4'] === 'vinted_touchee', 'fiche Vinted avec un prix d\'achat saisi : « touchée »', R.gardes);
ok(R.gardes?.['7_8'] === 'paire_tranchee', 'paire refusée par la personne : tranchée', R.gardes);
ok(R.gardes?.['9_10'] === 'quantite', 'plusieurs exemplaires : la question', R.gardes);
ok(R.gardes?.['2_1'] === 'main_pas_a_la_main', 'jamais la fiche Vinted comme « gardée »', R.gardes);
console.log('3. L\'écriture');
ok(String(A['9200000000002']?.fusionne_dans) === '9200000000001', 'la fiche Vinted se fond dans la fiche à la main', A['9200000000002']);
ok(A['9200000000001']?.vinted_item_id === 'vt-2' && A['9200000000002']?.vinted_item_id == null, 'l\'identité Vinted suit l\'objet (la synchro retrouvera la fiche de la personne)', { h: A['9200000000001'], v: A['9200000000002'] });
ok(Number(A['9200000000001']?.prix_achat) === 12 && A['9200000000001']?.titre === 'Robe Sézane Lou 38', 'la fiche de la personne garde son titre et son prix d\'achat', A['9200000000001']);
ok(A['9200000000004']?.fusionne_dans == null && (R.questions ?? []).some((q) => q.garde == 9200000000003 && q.absorbe == 9200000000004 && q.refus === 'vinted_touchee'),
  'fiche Vinted touchée : jamais fondue, la question posée', { v: A['9200000000004'], q: R.questions });
ok(A['9200000000004']?.a_verifier == null, '… et elle reste au stock (la personne l\'a touchée)', A['9200000000004']);
ok(A['9200000000006']?.a_verifier === 'photo_proche' && A['9200000000005']?.a_verifier == null, 'un doute : la fiche Vinted hors du stock, jamais la fiche de la personne', { h: A['9200000000005'], v: A['9200000000006'] });
ok(A['9200000000008']?.fusionne_dans == null && !(R.questions ?? []).some((q) => q.absorbe == 9200000000008 && q.statut === 'proposee'), 'paire refusée : ni fusion, ni question', R.questions);
ok(A['9200000000010']?.fusionne_dans == null && (R.questions ?? []).some((q) => q.absorbe == 9200000000010 && q.refus === 'quantite'), 'plusieurs exemplaires : la question', R.questions);
ok((R.fusions ?? []).length === 1 && R.fusions[0].par === 'utilisateur:photo_rapprochement_v3_main' && R.fusions[0].vinted === 'vt-2', 'une seule fusion, journalisée (défaisable)', R.fusions);
ok(!(R.journal ?? []).length, 'aucune ligne de rapprochement inventée (pas d\'annonce) : le journal est celui des fusions', R.journal);
ok(R.appliquer?.faits?.fusionner_fiche === 1 && R.appliquer?.faits?.fiche_a_verifier === 3 && (R.appliquer?.erreurs ?? []).length === 0, 'bilan : 1 fusion, 3 questions, 0 erreur', R.appliquer);
console.log('4. Relancée');
ok(!R.rejoue?.faits?.fusionner_fiche && (R.rejoue?.erreurs ?? []).length === 0, 'rien de plus : la fusion faite n\'est pas refaite, la question n\'est pas reposée', R.rejoue);
ok(Number(R.stock_affiche) === 7, 'stock affiché : 10 fiches − 1 fondue − 2 fiches Vinted hors du stock le temps de la question = 7', R.stock_affiche);
console.log('5. L\'inverse');
const I = R.apres_inverse ?? {};
ok(I['9200000000002']?.fusionne_dans == null && I['9200000000002']?.vinted_item_id === 'vt-2' && I['9200000000001']?.vinted_item_id == null,
  'fusion défaite (inventaire_defusionner_pour) : la fiche Vinted revient avec son annonce, la fiche de la personne la rend', { r: R.defaite, I });
console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert (transaction annulée : rien d’écrit).');
process.exit(ko ? 1 : 0);
