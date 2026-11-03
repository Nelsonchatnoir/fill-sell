// Génère l'essai à blanc de 20261103203000_cloud_voie_place_attente (ROLLBACK) depuis la migration elle-même :
//   node scripts/essais/20261103203000_generer.mjs   puis   npx supabase db query --remote -f scripts/essais/20261103203000_essai.sql
// Tout est annulé à la fin. Le compte de Nico (offert) sert de témoin : son Cloud « arrêté » DANS la transaction doit
// rendre ses tâches et retirer son drapeau ; un compte ordinaire (le premier sans Cloud) sert pour la liste d'attente.
import { readFileSync, writeFileSync } from 'node:fs';
const ICI = new URL('.', import.meta.url);
const mig = readFileSync(new URL('../../supabase/migrations/20261103203000_cloud_voie_place_attente.sql', ICI), 'utf8').replace(/\r\n/g, '\n');
const corps = mig.slice(mig.indexOf('BEGIN;\n') + 'BEGIN;\n'.length, mig.lastIndexOf('COMMIT;'));
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const essai = `-- Essai à blanc de 20261103203000_cloud_voie_place_attente : annulé (ROLLBACK). Généré par 20261103203000_generer.mjs.
BEGIN;
${corps}
CREATE TEMP TABLE essai_0311 (n serial, quoi text, valeur jsonb) ON COMMIT DROP;
INSERT INTO essai_0311 (quoi, valeur) SELECT 'renommee', to_jsonb(to_regprocedure('public.cloud_compte_synchroniser_pool(uuid)') IS NOT NULL);
INSERT INTO essai_0311 (quoi, valeur) SELECT 'nico_attendue', to_jsonb(public.cloud_voie_attendue('${NICO}'));
INSERT INTO essai_0311 (quoi, valeur) SELECT 'nico_voie', to_jsonb((SELECT cloud_voie FROM public.profiles WHERE id = '${NICO}'));
INSERT INTO essai_0311 (quoi, valeur) SELECT 'synchro', public.cloud_voies_synchroniser();
INSERT INTO essai_0311 (quoi, valeur) SELECT 'crons', (SELECT jsonb_agg(jobname ORDER BY jobname) FROM cron.job WHERE jobname IN ('cloud-voies-5min', 'push-cloud-place-5min'));
INSERT INTO essai_0311 (quoi, valeur) SELECT 'nico_pending_marques_avant', to_jsonb((SELECT count(*) FROM public.cross_post_jobs WHERE user_id = '${NICO}' AND status = 'pending' AND platform_fields ? 'attente_verification_cloud'));
INSERT INTO essai_0311 (quoi, valeur) SELECT 'nico_verifs_avant', (SELECT jsonb_object_agg(k, platform_settings -> k -> 'cloud_verification') FROM public.profiles, unnest(ARRAY['vinted','leboncoin','beebs','depop']) k WHERE id = '${NICO}' AND platform_settings -> k ? 'cloud_verification');
-- Le Cloud de Nico « s'arrête » (DANS la transaction) : la règle doit retirer le drapeau par le déclencheur.
UPDATE public.profiles SET is_cloud = false WHERE id = '${NICO}';
INSERT INTO essai_0311 (quoi, valeur) SELECT 'nico_voie_apres_arret', to_jsonb((SELECT cloud_voie FROM public.profiles WHERE id = '${NICO}'));
INSERT INTO essai_0311 (quoi, valeur) SELECT 'nico_pending_marques_apres', to_jsonb((SELECT count(*) FROM public.cross_post_jobs WHERE user_id = '${NICO}' AND status = 'pending' AND platform_fields ? 'attente_verification_cloud'));
INSERT INTO essai_0311 (quoi, valeur) SELECT 'nico_verifs_apres', to_jsonb((SELECT count(*) FROM public.profiles, unnest(ARRAY['vinted','leboncoin','beebs','depop']) k WHERE id = '${NICO}' AND platform_settings -> k ? 'cloud_verification'));
-- Il reprend : le drapeau revient.
UPDATE public.profiles SET is_cloud = true WHERE id = '${NICO}';
INSERT INTO essai_0311 (quoi, valeur) SELECT 'nico_voie_apres_reprise', to_jsonb((SELECT cloud_voie FROM public.profiles WHERE id = '${NICO}'));
-- Un compte ordinaire : vente, inscription, file.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.profiles WHERE is_cloud IS NOT TRUE AND cloud_essai_debut IS NULL AND cloud_voie IS FALSE ORDER BY id LIMIT 1), 'role', 'authenticated')::text, true);
INSERT INTO essai_0311 (quoi, valeur) SELECT 'ordinaire_dispo', public.cloud_disponibilite_moi();
INSERT INTO essai_0311 (quoi, valeur) SELECT 'ordinaire_preparer', public.cloud_essai_preparer_moi('essai-blanc-0311');
INSERT INTO essai_0311 (quoi, valeur) SELECT 'ordinaire_inscrire', public.cloud_attente_inscrire_moi();
INSERT INTO essai_0311 (quoi, valeur) SELECT 'ordinaire_inscrire_bis', public.cloud_attente_inscrire_moi();
INSERT INTO essai_0311 (quoi, valeur) SELECT 'places_a_offrir', to_jsonb(public.cloud_attente_places_a_offrir());
INSERT INTO essai_0311 (quoi, valeur) SELECT 'a_prevenir_existe', to_jsonb(public.cloud_attente_a_prevenir_existe());
INSERT INTO essai_0311 (quoi, valeur) SELECT 'quitter', public.cloud_attente_quitter_moi();
INSERT INTO essai_0311 (quoi, valeur) SELECT 'apres_quitter', public.cloud_disponibilite_moi() -> 'attente';
SELECT n, quoi, valeur FROM essai_0311 ORDER BY n;
ROLLBACK;
`;
writeFileSync(new URL('20261103203000_essai.sql', ICI), essai);
console.log('essai écrit :', essai.length, 'caractères');
