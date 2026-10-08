// ═══════════════════════════════════════════════════════════════════════════
// PREUVE AVANT / APRÈS — une fusion faite À LA MAIN dans l'app qui déplace
// l'annonce Vinted vers l'autre fiche (défaut du 28/09, migration 20261008150000)
// ═══════════════════════════════════════════════════════════════════════════
// La voie EXACTE de l'app (src/utils/fusionArticles.js) : la RPC
// inventaire_fusionner(p_garde, p_absorbe) sous l'identité d'un utilisateur
// connecté. Un compte fictif, une fiche créée à la main (gardée) et une fiche
// du dressing Vinted (fondue), sur la base TELLE QU'ELLE EST EN PROD, puis
// ROLLBACK : rien n'est écrit.
//   node scripts/reparations/20261008_preuve_fusion_identite_vinted.mjs
// Avant 20261008150000 : refus « [boutique_a_confirmer] » (la garde de boutique
// voyait la fiche fondue lâcher son vinted_account_id). Après : la fusion passe,
// l'annonce Vinted suit l'objet.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const U = "'00000000-0000-4000-8000-0000000e0810'::uuid";
const sql = `
BEGIN;
CREATE TEMP TABLE _preuve (k text, v jsonb);
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000000', ${U}, 'authenticated', 'authenticated', 'preuve-fusion-vinted-0810@fillsell.invalid', '', now(), now(), now(), '{}', '{}');
INSERT INTO profiles (id) VALUES (${U}) ON CONFLICT (id) DO NOTHING;
UPDATE profiles SET vinted_sync_pin = '{"v":"2","boutiques":[{"user_id":"b-preuve"}]}'::jsonb WHERE id = ${U};
INSERT INTO inventaire (id, user_id, titre, prix_vente, prix_achat, statut, quantite, photos, origine, vinted_item_id, vinted_status, vinted_account_id, created_at) VALUES
  (9300000000001, ${U}, 'Veste en jean', 30, 8, 'stock', 1, '["https://x.test/h.jpg"]', NULL, NULL, NULL, NULL, now() - interval '5 days'),
  (9300000000002, ${U}, 'Veste en jean Levi''s', 30, NULL, 'stock', 1, '["https://x.test/v.jpg"]', 'vinted_sync', 'vt-preuve', 'active', 'b-preuve', now() - interval '1 day');
SELECT set_config('request.jwt.claims', json_build_object('sub', ${U}, 'role', 'authenticated')::text, true);
DO $p$
DECLARE r jsonb;
BEGIN
  BEGIN
    r := public.inventaire_fusionner(9300000000001, 9300000000002);
  EXCEPTION WHEN OTHERS THEN
    r := jsonb_build_object('ok', false, 'erreur', left(SQLERRM, 200));
  END;
  INSERT INTO _preuve VALUES ('rpc_app', r);
END $p$;
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO _preuve SELECT 'apres', (SELECT jsonb_object_agg(i.id::text, jsonb_build_object('fusionne_dans', i.fusionne_dans, 'vinted_item_id', i.vinted_item_id))
                                     FROM inventaire i WHERE i.user_id = ${U});
SELECT k, v FROM _preuve;
ROLLBACK;
`;
const f = path.join(os.tmpdir(), `preuve-fusion-vinted-${process.pid}.sql`);
fs.writeFileSync(f, sql);
let out;
try { out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { console.error(String(e.stdout || '') + String(e.stderr || e.message)); process.exit(1); }
finally { fs.rmSync(f, { force: true }); }
const R = Object.fromEntries(JSON.parse(out.slice(out.indexOf('{'))).rows.map((l) => [l.k, l.v]));
const ok = R.rpc_app?.ok === true && String(R.apres?.['9300000000002']?.fusionne_dans) === '9300000000001' && R.apres?.['9300000000001']?.vinted_item_id === 'vt-preuve';
console.log(JSON.stringify(R));
console.log(ok ? 'FUSION ABOUTIE : l\'annonce Vinted a suivi l\'objet (transaction annulée).' : `FUSION REFUSÉE : ${R.rpc_app?.erreur ?? R.rpc_app?.reason ?? '?'} (transaction annulée).`);
process.exit(0);
