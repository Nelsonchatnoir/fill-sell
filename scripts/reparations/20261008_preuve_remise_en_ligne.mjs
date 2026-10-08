// ═══════════════════════════════════════════════════════════════════════════
// PREUVE — LA REMISE EN LIGNE VINTED (migration 20261008160000), sur la base
// TELLE QU'ELLE EST EN PROD, dans UNE transaction ANNULÉE (ROLLBACK) : un compte
// fictif, rien n'est écrit, aucune fiche de client n'est lue ni touchée.
//   node scripts/reparations/20261008_preuve_remise_en_ligne.mjs           (la migration est jouée dans la transaction)
//   node scripts/reparations/20261008_preuve_remise_en_ligne.mjs --appliquee (la migration est déjà en prod : on ne la rejoue pas)
// Le cas fabriqué : une fiche d'origine A (annonce Vinted v-100 supprimée, une
// copie Leboncoin en ligne, prix d'achat), une fiche intermédiaire M (v-200,
// supprimée elle aussi), la fiche de la nouvelle annonce H (v-300, en ligne),
// deux relevés complets du dressing. On vérifie :
//   1. la lecture rend l'état Vinted, les nouvelles fiches, le dernier relevé complet ;
//   2. « Vendue » sur l'annonce morte v-100 (sans preuve) : REFUSÉE, drapeau armé ;
//      enregistrée comme avant, drapeau coupé (aucune régression tant qu'on n'arme pas) ;
//   3. l'écriture « remise_en_ligne » : A garde la copie Leboncoin et prend v-300,
//      H et M s'y fondent, les jobs de v-100 et v-200 sont clos « pas une vente » ;
//   4. une VRAIE vente de v-300 (preuve « sold ») enregistre la vente ET arme le
//      retrait de la copie Leboncoin — la garde ne la touche pas ;
//   5. une remise en ligne qui n'en est pas une (ancienne revue APRÈS l'apparition
//      de la nouvelle : deux exemplaires) n'est jamais fondue.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APPLIQUEE = process.argv.includes('--appliquee');
const MIG = fs.readFileSync(path.join(RACINE, 'supabase', 'migrations', '20261008160000_remise_en_ligne_vinted.sql'), 'utf8');
// le corps de la migration, sans ses BEGIN/COMMIT (la transaction est celle de la preuve)
const corps = MIG.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '').replace(/^SET LOCAL statement_timeout = '30s';\s*$/m, '').replace(/^SET LOCAL lock_timeout = '3s';\s*$/m, '');
const U = "'00000000-0000-4000-8000-0000000f0810'::uuid";
const A = 9310000000001, M = 9310000000002, H = 9310000000003, X = 9310000000004, Y = 9310000000005;
const T = "Jean Levi''s 501 Vintage W34 L32 Bleu (Z177)";
const sql = `
BEGIN;
SET LOCAL statement_timeout = '60s';
${APPLIQUEE ? '' : corps}
CREATE TEMP TABLE _p (k text, v jsonb);
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000000', ${U}, 'authenticated', 'authenticated', 'preuve-remise-en-ligne-0810@fillsell.invalid', '', now(), now(), now(), '{}', '{}');
INSERT INTO profiles (id) VALUES (${U}) ON CONFLICT (id) DO NOTHING;
UPDATE profiles SET vinted_sync_pin = '{"v":"2","boutiques":[{"user_id":"b-rel"}]}'::jsonb WHERE id = ${U};
UPDATE coin_config SET value = 1 WHERE key IN ('rapprochement_remise_en_ligne', 'vente_garde_remise_en_ligne');
-- deux relevés complets du dressing (il y a 3 jours, il y a une heure)
INSERT INTO vinted_sync_runs (id, user_id, kind, platform, status, declencheur, started_at, finished_at, items_vus, total_entries, items_crees, items_maj, vinted_user_id, vinted_login)
VALUES (gen_random_uuid(), ${U}, 'dressing', 'vinted', 'done', 'bouton', now() - interval '3 days', now() - interval '3 days' + interval '1 minute', 2, 2, 0, 2, 'b-rel', 'preuve'),
       (gen_random_uuid(), ${U}, 'dressing', 'vinted', 'done', 'bouton', now() - interval '1 hour', now() - interval '59 minutes', 1, 1, 1, 0, 'b-rel', 'preuve');
-- A : l'origine (annonce v-100 supprimée il y a 14 jours), copie Leboncoin, prix d'achat
-- M : l'intermédiaire (v-200, plus revue depuis 8 jours, jamais datée disparue)
-- H : la nouvelle annonce (v-300, apparue au dernier relevé)
-- X/Y : deux exemplaires (Y revue APRÈS l'apparition de X : en ligne ensemble)
INSERT INTO inventaire (id, user_id, titre, prix_vente, prix_achat, statut, quantite, photos, origine, vinted_item_id, vinted_status, vinted_account_id,
                        first_seen_at, last_synced_at, disparu_le, created_at) VALUES
  (${A}, ${U}, '${T}', 25, 8, 'stock', 1, '["https://x.test/a.jpg"]', 'vinted_sync', 'v-100', 'active', 'b-rel', now() - interval '20 days', now() - interval '15 days', now() - interval '14 days', now() - interval '20 days'),
  (${M}, ${U}, '${T}', 25, NULL, 'stock', 1, '["https://x.test/m.jpg"]', 'vinted_sync', 'v-200', 'active', 'b-rel', now() - interval '14 days', now() - interval '8 days', NULL, now() - interval '14 days'),
  (${H}, ${U}, '${T}', 24, NULL, 'stock', 1, '["https://x.test/h.jpg"]', 'vinted_sync', 'v-300', 'active', 'b-rel', now() - interval '50 minutes', now() - interval '50 minutes', NULL, now() - interval '50 minutes'),
  (${X}, ${U}, 'Robe Sézane Lou fleurie 38', 30, NULL, 'stock', 1, '["https://x.test/x.jpg"]', 'vinted_sync', 'v-400', 'active', 'b-rel', now() - interval '50 minutes', now() - interval '50 minutes', NULL, now() - interval '50 minutes'),
  (${Y}, ${U}, 'Robe Sézane Lou fleurie 38', 30, NULL, 'stock', 1, '["https://x.test/y.jpg"]', 'vinted_sync', 'v-500', 'active', 'b-rel', now() - interval '10 days', now() - interval '40 minutes', now() - interval '30 minutes', now() - interval '10 days');
INSERT INTO cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, platform_listing_id, listing_url, published_at, platform_fields, created_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', ${U}, ${A}, 'vinted', 'publish', 'published', '${T}', 25, 'v-100', 'https://www.vinted.fr/items/100', now() - interval '20 days',
   jsonb_build_object('sale_signal', 'unavailable', 'unavailable_since', now() - interval '14 days'), now() - interval '20 days'),
  ('a0000000-0000-4000-8000-000000000002', ${U}, ${A}, 'leboncoin', 'publish', 'published', '${T}', 25, '999001', 'https://www.leboncoin.fr/ad/vetements/999001', now() - interval '19 days', '{}'::jsonb, now() - interval '19 days'),
  ('a0000000-0000-4000-8000-000000000003', ${U}, ${M}, 'vinted', 'publish', 'published', '${T}', 25, 'v-200', 'https://www.vinted.fr/items/200', now() - interval '14 days', '{}'::jsonb, now() - interval '14 days'),
  ('a0000000-0000-4000-8000-000000000004', ${U}, ${H}, 'vinted', 'publish', 'published', '${T}', 24, 'v-300', 'https://www.vinted.fr/items/300', now() - interval '50 minutes', '{}'::jsonb, now() - interval '50 minutes');
INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, job_id, source_rapprochement, vu_le)
VALUES (${U}, 'leboncoin', '999001', 'https://www.leboncoin.fr/ad/vetements/999001', '${T}', 25, 'en_ligne', ${A}, 'a0000000-0000-4000-8000-000000000002', 'job', now() - interval '1 hour');
INSERT INTO vinted_listing_snapshots (user_id, vinted_item_id, inventaire_id, captured_at, captured_on, price, status) VALUES
  (${U}, 'v-100', ${A}, now() - interval '15 days', (now() - interval '15 days')::date, 25, 'active'),
  (${U}, 'v-200', ${M}, now() - interval '8 days', (now() - interval '8 days')::date, 25, 'active'),
  (${U}, 'v-300', ${H}, now() - interval '50 minutes', (now() - interval '50 minutes')::date, 24, 'active');

-- 1. la lecture
INSERT INTO _p SELECT 'lire', jsonb_build_object('actif', d -> 'remise_en_ligne_actif', 'nouvelles', d -> 'vinted_nouvelles', 'releves', d -> 'vinted_releves_complets',
  'fiche_a', (SELECT x FROM jsonb_array_elements(d -> 'fiches') x WHERE x ->> 'id' = '${A}'))
  FROM (SELECT public.rapprochement_v3_lire(${U}) d) z;
INSERT INTO _p VALUES ('predicats', jsonb_build_object(
  'a_h', public.vinted_remise_en_ligne(${A}, ${H}), 'm_h', public.vinted_remise_en_ligne(${M}, ${H}), 'y_x', public.vinted_remise_en_ligne(${Y}, ${X}),
  'possible_a_h', public.rapprochement_v3_remise_possible(${U}, ${A}, ${H}), 'possible_y_x', public.rapprochement_v3_remise_possible(${U}, ${Y}, ${X}),
  'maillon_m', public.rapprochement_v3_remise_maillon(${U}, ${A}, ${M})));

-- 2. « Vendue » sur l'annonce morte, sans preuve : armée → refus ; coupée → comme avant (annulé aussitôt)
DO $p$
DECLARE r jsonb; r2 jsonb;
BEGIN
  r := public.enregistrer_vente_declaree(${U}, 'a0000000-0000-4000-8000-000000000001', 25);
  INSERT INTO _p VALUES ('vente_morte_armee', r);
  BEGIN
    UPDATE coin_config SET value = 0 WHERE key = 'vente_garde_remise_en_ligne';
    r2 := public.enregistrer_vente_declaree(${U}, 'a0000000-0000-4000-8000-000000000001', 25);
    r2 := r2 || jsonb_build_object('statut_a', (SELECT statut FROM inventaire WHERE id = ${A}));  -- instruction à part : l'état d'après la vente
    RAISE EXCEPTION 'annule';  -- tout ce bloc est défait ; r2 reste
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  INSERT INTO _p VALUES ('vente_morte_coupee', r2);
END $p$;
INSERT INTO _p SELECT 'apres_annulation', jsonb_build_object('statut_a', statut, 'garde', (SELECT value FROM coin_config WHERE key = 'vente_garde_remise_en_ligne')) FROM inventaire WHERE id = ${A};

-- 3. l'écriture de la passe
INSERT INTO _p SELECT 'appliquer', public.rapprochement_v3_appliquer(${U}, jsonb_build_array(
  jsonb_build_object('type', 'remise_en_ligne', 'garde', '${A}', 'absorbe', '${H}', 'chaine', jsonb_build_array('${M}'), 'motif', 'photo_identique', 'preuve', '{}'::jsonb),
  jsonb_build_object('type', 'remise_en_ligne', 'garde', '${Y}', 'absorbe', '${X}', 'chaine', '[]'::jsonb, 'motif', 'photo_identique', 'preuve', '{}'::jsonb)), 'normal', true);
INSERT INTO _p SELECT 'fiches', jsonb_object_agg(i.id::text, jsonb_build_object('fusionne_dans', i.fusionne_dans, 'vinted_item_id', i.vinted_item_id, 'vinted_status', i.vinted_status,
  'disparu_le', i.disparu_le IS NOT NULL, 'prix_achat', i.prix_achat, 'statut', i.statut)) FROM inventaire i WHERE i.user_id = ${U};
INSERT INTO _p SELECT 'jobs', jsonb_object_agg(j.id::text, jsonb_build_object('inv', j.inventaire_id, 'status', j.status, 'remplacee', j.platform_fields -> 'remplacee_par' ->> 'vinted_item_id'))
  FROM cross_post_jobs j WHERE j.user_id = ${U} AND j.action = 'publish';
INSERT INTO _p SELECT 'annonce_lbc', jsonb_build_object('inv', inventaire_id) FROM annonces_plateforme WHERE user_id = ${U};

-- 3 bis. l'inverse (scripts/reparations/20261008_remises_en_ligne_vinted_INVERSE.sql), défait aussitôt
DO $p$
DECLARE f record; r jsonb; res jsonb;
BEGIN
  BEGIN
    FOR f IN SELECT id FROM inventaire_fusions WHERE user_id = ${U} AND par = 'utilisateur:photo_rapprochement_v3_remise' AND defait_le IS NULL ORDER BY created_at DESC LOOP
      r := public.inventaire_defusionner_pour(${U}, f.id, 'utilisateur:inverse_remise_en_ligne_0810');
    END LOOP;
    UPDATE cross_post_jobs SET status = COALESCE(platform_fields -> 'remplacee_par' ->> 'statut_avant', 'published'), error = NULL, platform_fields = platform_fields - 'remplacee_par'
     WHERE user_id = ${U} AND platform = 'vinted' AND status = 'cancelled' AND platform_fields -> 'remplacee_par' ->> 'par' = 'rapprochement_v3';
    res := jsonb_build_object('fiches', (SELECT jsonb_object_agg(i.id::text, jsonb_build_object('fusionne_dans', i.fusionne_dans, 'vinted_item_id', i.vinted_item_id)) FROM inventaire i WHERE i.user_id = ${U}),
                              'jobs_ouverts', (SELECT count(*) FROM cross_post_jobs j WHERE j.user_id = ${U} AND j.platform = 'vinted' AND j.status = 'published'));
    RAISE EXCEPTION 'annule';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  INSERT INTO _p VALUES ('inverse', res);
END $p$;

-- 4. une VRAIE vente de la nouvelle annonce (preuve « sold ») : vente et retrait de la copie Leboncoin
DO $p$
DECLARE r jsonb;
BEGIN
  UPDATE cross_post_jobs SET platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', now())
   WHERE id = 'a0000000-0000-4000-8000-000000000004';
  r := public.enregistrer_vente_atomique(p_user := ${U}, p_cle := null, p_job := 'a0000000-0000-4000-8000-000000000004'::uuid, p_prix := 24);
  INSERT INTO _p VALUES ('vraie_vente', r || jsonb_build_object(
    'statut_a', (SELECT statut FROM inventaire WHERE id = ${A}),
    'retraits', (SELECT jsonb_agg(jsonb_build_object('platform', d.platform, 'listing', d.platform_listing_id, 'status', d.status))
                   FROM cross_post_jobs d WHERE d.user_id = ${U} AND d.action = 'delete')));
END $p$;
SELECT k, v FROM _p;
ROLLBACK;
`;
const f = path.join(os.tmpdir(), `preuve-remise-en-ligne-${process.pid}.sql`);
fs.writeFileSync(f, sql);
let out;
try { out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { console.error(String(e.stdout || '') + String(e.stderr || e.message)); process.exit(1); }
finally { fs.rmSync(f, { force: true }); }
const R = Object.fromEntries(JSON.parse(out.slice(out.indexOf('{'))).rows.map((l) => [l.k, l.v]));
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const fi = R.fiches ?? {}, jo = R.jobs ?? {};
console.log(JSON.stringify(R, null, 1).slice(0, 6000));
ok(R.lire?.actif === true, '1. lecture : le drapeau armé est lu');
ok((R.lire?.nouvelles ?? []).includes(String(H)), '1. lecture : la fiche de la nouvelle annonce est « nouvelle »');
ok(!!R.lire?.releves?.['b-rel'], '1. lecture : le dernier relevé complet de la boutique');
ok(R.lire?.fiche_a?.vinted_status === 'active' && !!R.lire?.fiche_a?.last_synced_at && !!R.lire?.fiche_a?.first_seen_at && R.lire?.fiche_a?.vinted_account_id === 'b-rel', '1. lecture : l\'état Vinted de chaque fiche');
ok(R.predicats?.a_h === true && R.predicats?.m_h === true, '1. remise en ligne reconnue (annonce supprimée, jamais en ligne ensemble)');
ok(R.predicats?.y_x === false && R.predicats?.possible_y_x === 'pas_une_remise_en_ligne', '5. deux exemplaires en ligne ensemble : jamais une remise en ligne');
ok(R.predicats?.possible_a_h === null && R.predicats?.maillon_m === null, '3. gardes de la base : la paire et le maillon passent');
ok(R.vente_morte_armee?.ok === false && R.vente_morte_armee?.code === 'remise_en_ligne' && /v-300/.test(R.vente_morte_armee?.reason ?? ''), '2. « Vendue » sur l\'annonce remplacée : refusée (garde armée), la nouvelle annonce nommée');
ok(R.vente_morte_coupee?.ok === true && R.vente_morte_coupee?.statut_a === 'vendu', '2. garde coupée : enregistrée comme avant (aucun changement tant qu\'on n\'arme pas)');
ok(R.apres_annulation?.statut_a === 'stock' && R.apres_annulation?.garde === 1, '2. (le cas « coupée » a été annulé dans la preuve)');
ok(R.appliquer?.faits?.remise_en_ligne === 1 && R.appliquer?.faits?.remise_en_ligne_maillon === 1 && R.appliquer?.faits?.remise_en_ligne_jobs_clos === 2, '3. écriture : une remise en ligne, un maillon, deux jobs morts clos');
ok(R.appliquer?.sautes?.['remise_en_ligne_pas_une_remise_en_ligne'] === 1 && !fi[String(X)]?.fusionne_dans && !fi[String(Y)]?.fusionne_dans, '5. écriture : les deux exemplaires restent deux fiches');
ok(fi[String(A)]?.vinted_item_id === 'v-300' && fi[String(A)]?.vinted_status === 'active' && fi[String(A)]?.disparu_le === false && fi[String(A)]?.prix_achat === 8, '3. la fiche d\'origine garde son prix d\'achat et prend l\'annonce vivante');
ok(String(fi[String(H)]?.fusionne_dans) === String(A) && fi[String(H)]?.vinted_item_id === 'v-100' && String(fi[String(M)]?.fusionne_dans) === String(A), '3. la nouvelle et l\'intermédiaire se fondent dans l\'origine (l\'annonce morte reste à la fondue)');
ok(jo['a0000000-0000-4000-8000-000000000001']?.status === 'cancelled' && jo['a0000000-0000-4000-8000-000000000001']?.remplacee === 'v-300'
  && jo['a0000000-0000-4000-8000-000000000003']?.status === 'cancelled', '3. les jobs des annonces mortes : clos « remplacée, pas une vente »');
ok(jo['a0000000-0000-4000-8000-000000000004']?.status === 'published' && String(jo['a0000000-0000-4000-8000-000000000004']?.inv) === String(A)
  && jo['a0000000-0000-4000-8000-000000000002']?.status === 'published', '3. l\'annonce vivante et la copie Leboncoin sur la même fiche');
ok(String(R.annonce_lbc?.inv) === String(A), '3. la copie Leboncoin relevée reste sur la fiche gardée');
ok(R.inverse?.fiches?.[String(A)]?.vinted_item_id === 'v-100' && !R.inverse?.fiches?.[String(H)]?.fusionne_dans && R.inverse?.fiches?.[String(H)]?.vinted_item_id === 'v-300'
  && !R.inverse?.fiches?.[String(M)]?.fusionne_dans && R.inverse?.jobs_ouverts === 3, '3 bis. l\x27inverse : chaque fiche retrouve son annonce, les jobs Vinted rouverts');
ok(R.vraie_vente?.ok === true && R.vraie_vente?.statut_a === 'vendu', '4. vraie vente (preuve « sold ») : enregistrée');
ok((R.vraie_vente?.retraits ?? []).some((d) => d.platform === 'leboncoin' && d.listing === '999001'), '4. vraie vente : le retrait de la copie Leboncoin est armé');
console.log(ko ? `\n${ko} échec(s)` : '\nPREUVE VERTE (transaction annulée, rien écrit)');
process.exit(ko ? 1 : 0);
