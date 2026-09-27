-- ═══════════════════════════════════════════════════════════════════════════
-- UNE ANNONCE, DEUX FICHES : L'IDENTIFIANT CERTAIN DU DÉPÔT FAIT FOI (27/09)
-- APPLIQUÉE le 27/09 à 14:32 (GO nommé de Nico, CLI db query -f), après rejeu
-- annulé : 5 recâblages, 7c406c26 annulé, 5e7ab0b7 rendu (retiré par l'extension
-- à 14:32, l'annonce vendue de Louis est hors ligne), d74689a8 pending,
-- 629cc31b annulé, 4 jobs Nadège en file.
-- ═══════════════════════════════════════════════════════════════════════════
-- Balayage du 27/09 (audit) : 7 annonces Leboncoin encore portées par deux
-- fiches, 3 comptes. Cause prouvée sur chacune : la RÉCUPÉRATION DU LIEN par
-- l'extension (≤ 0.6.69) se rabattait sur le TITRE quand la carte de l'annonce
-- n'était pas encore listée — et deux titres jumeaux (« Rangement Blanc … » /
-- « Rangement Blanc et Gris … », « Doudou » / « Lot 2 doudous », deux
-- « T-shirt manches longues Primark 13-14 ans ») donnaient le lien de l'AUTRE
-- fiche. Preuve : platform_fields.lbc_depot (adsubmit.id ou
-- sans_adsubmit.id, rendu par Leboncoin lui-même au dépôt) porte l'identifiant
-- RÉEL, différent de platform_listing_id :
--   · louis         e1fc65c8  certain 3275434644  écrit 3274249173  (page publique : « désactivée »)
--   · louis         232c54d6  certain 3275469445  écrit 3275466509  (page publique : « désactivée »)
--   · josephinecerni 2efb46ba certain 3277362645  écrit 3277049948  (en ligne, relevé du 27/09 09:16)
--   · nicolas.menar 73b9a63d  certain 3275108417  écrit 3266998688  (en ligne, relevé)
--   · nicolas.menar 1a816abd  certain 3275210273  écrit 3275188719  (en ligne, relevé)
-- Depuis le 27/09 11:38, le trigger cross_post_jobs_lien_jamais_croise refuse
-- ce croisement à l'écriture, et l'extension 0.6.71 (en examen) ne se rabat
-- plus jamais sur le titre quand l'identifiant certain existe. Reste à défaire
-- les 5 croisements déjà écrits — par la fonction faite pour ça
-- (defaire_croisement_annonce, 20260927094500) : chaque job de l'AUTRE fiche
-- est recâblé sur SON identifiant certain ; un geste destructeur sans
-- identifiant certain est annulé (rien n'est retiré).
--
-- Deux cas sans identifiant certain, tranchés par le relevé, pas par nous :
--   · josephinecerni 629cc31b (« Gilet femme S », recâblé le 26/09 par la
--     réparation « suivi orphelin » sur l'annonce 3264688634 « Gilet à capuche
--     In Extenso S femme ») : cette annonce est celle de la fiche « Gilet à
--     capuche Inextenso S femme » (job 5ce5436e, publié le 06/09) ; la fiche
--     « Gilet femme S » est déjà suivie par 58ac3f91 (3264734804, en ligne).
--     629cc31b est un DOUBLON de suivi : annulé, relevé recâblé.
--   · josephinecerni 3264977032 (« T-shirt Nasa Shein », deux jobs du 07/09
--     sans preuve de dépôt) : NON tranchée ici — la question « quel article
--     vend cette annonce ? » la posera à la personne au prochain geste.
--
-- Conséquences défaites dans le même geste :
--   · louis : le retrait 5e7ab0b7 (fiche « Blanc et Gris » vendue, annonce
--     3274249173 — la SIENNE) avait été annulé « Doublon : un retrait est déjà
--     en cours » à cause du retrait 7c406c26 de l'AUTRE fiche, qui visait la
--     même annonce à tort. 7c406c26 est annulé par defaire (son annonce
--     3275434644 est désactivée : rien à retirer) ; 5e7ab0b7 revient en file —
--     sans lui, une annonce vendue restait en ligne.
--   · nicolas.menar : la question d74689a8 (« annonce partagée ») n'a plus
--     d'objet une fois le croisement défait : la republication revient en file.
--
-- nadegemarcelin78 (même lot, LE ROUGE) : 5 republications Vinted en
-- needs_user « état non vérifié » dont le diagnostic dit « Compte restreint
-- jusqu'au 26/09/2026 » (vinted.fr/listing-restriction). La règle
-- « compte_restreint » (pas-de-rouge, update-job-status v88) attend désormais
-- la date ; elle est échue : les 5 reviennent en file — l'état réel de chaque
-- annonce est revérifié avant tout geste (étape 'captured', rien supprimé).
--
-- Rien n'est retiré par cette migration, aucune fiche n'est fusionnée ni
-- supprimée, aucun crédit ne bouge. Idempotente (gardes de statut).

BEGIN;

-- ── 1. Les cinq croisements : l'identifiant certain fait foi ────────────────
SELECT defaire_croisement_annonce('faf5021a-479a-4bb3-b3ec-c296770739b7', 'leboncoin', '3274249173', 1789991184800)    AS louis_blanc_gris;
SELECT defaire_croisement_annonce('faf5021a-479a-4bb3-b3ec-c296770739b7', 'leboncoin', '3275466509', 1790184184077)    AS louis_bleu_vert;
SELECT defaire_croisement_annonce('afeef3c7-0b0b-408c-a25b-3823448e3eb1', 'leboncoin', '3277049948', 1787440298751004) AS josephine_primark;
SELECT defaire_croisement_annonce('39bfa95a-0b8d-46fe-b836-040966d02cfd', 'leboncoin', '3266998688', 1790106695686005) AS menar_lot_gris;
SELECT defaire_croisement_annonce('39bfa95a-0b8d-46fe-b836-040966d02cfd', 'leboncoin', '3275188719', 1790106695686006) AS menar_lot_bleu;

-- Le message posé par defaire dit « choix fait dans l'app » : ici c'est
-- l'identifiant certain du dépôt qui a tranché — le dire tel quel.
UPDATE cross_post_jobs SET
  error = 'L''annonce visée est celle d''un autre article (identifiant certain du dépôt relu le 27/09) : rien n''a été retiré.',
  platform_fields = platform_fields - 'needs_user_source' - 'annonce_partagee'
 WHERE id = '7c406c26-268d-4ce2-90e9-cda32c96b431' AND status = 'cancelled'
   AND platform_fields->'lien_delie'->>'motif' = 'annonce_d_un_autre_article';

-- ── 2. louis : le retrait de l'annonce VENDUE revient en file ───────────────
UPDATE cross_post_jobs SET
  status = 'pending', error = NULL,
  platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - 'next_action_after' - 'processing_since')
    || jsonb_build_object('retrait_rearme_2709', jsonb_build_object('le', now(),
         'motif', 'annulé « doublon » à cause du retrait 7c406c26 de l''autre fiche (annonce croisée) — croisement défait'))
 WHERE id = '5e7ab0b7-b68d-4b4a-b04f-cca2705ce7fe' AND status = 'cancelled' AND action = 'delete'
   AND platform_listing_id = '3274249173' AND inventaire_id = 1789991184800;

-- ── 3. josephinecerni : le doublon de suivi 629cc31b ────────────────────────
UPDATE cross_post_jobs SET
  status = 'cancelled',
  error = 'Doublon de suivi : cette fiche est déjà suivie par son annonce 3264734804 ; l''annonce 3264688634 est celle d''un autre article (« Gilet à capuche Inextenso S femme »).',
  platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('lien_delie',
    jsonb_build_object('le', now(), 'annonce', '3264688634', 'motif', 'doublon_de_suivi_2709'))
 WHERE id = '629cc31b-687d-4f5b-9c01-386d78118ab6' AND status = 'published' AND inventaire_id = 1787440283600006;

UPDATE annonces_plateforme SET
  inventaire_id = 1787440286057000, job_id = '5ce5436e-5375-43be-a3d0-8ac33a13806a',
  source_rapprochement = 'manuel', proposition = NULL, updated_at = now()
 WHERE user_id = 'afeef3c7-0b0b-408c-a25b-3823448e3eb1' AND platform = 'leboncoin' AND listing_id = '3264688634'
   AND inventaire_id IS DISTINCT FROM 1787440286057000;

-- ── 4. nicolas.menar : la question « annonce partagée » n'a plus d'objet ────
UPDATE cross_post_jobs SET
  status = 'pending', error = NULL,
  platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - 'needs_user_source' - 'annonce_partagee'
      - 'needs_user_vu_le' - 'needs_user_vu_erreur' - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'next_action_after' - 'processing_since')
    || jsonb_build_object('annonce_partagee_resolue_2709', jsonb_build_object('le', now(),
         'motif', 'croisement défait : 73b9a63d recâblé sur son identifiant certain 3275108417'))
 WHERE id = 'd74689a8-cbc0-4088-9b6e-23ef8b288d45' AND status = 'needs_user'
   AND platform_fields->>'needs_user_source' = 'annonce_partagee';

-- ── 5. nadegemarcelin78 : la restriction Vinted est échue ───────────────────
UPDATE cross_post_jobs SET
  status = 'pending',
  error = 'La restriction de ton compte Vinted (jusqu''au 26/09) est terminée : la republication repart toute seule, l''état réel de l''annonce est revérifié avant tout geste.',
  platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - 'needs_user_source' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
      - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needsUserAttempts' - 'processing_since')
    || jsonb_build_object(
         'next_action_after', (now() + interval '1 minute')::text,
         'pas_de_rouge', jsonb_build_object('at', now(), 'motif', 'compte_restreint_echu', 'verdict', 'reprise', 'pose_par', 'migration 20260927151500'))
 WHERE user_id = '8a2eba68-7a2d-4fc1-aab0-aba23189c33b' AND platform = 'vinted' AND action = 'republish'
   AND status = 'needs_user' AND platform_fields->>'needs_user_source' IS NULL
   AND platform_fields->'last_diagnostic'->>'signal' = 'listing_restriction'
   AND platform_fields->'last_diagnostic'->>'titre' ~ 'jusqu''au 26/09/2026'
   AND platform_fields->>'republish_step' = 'captured' AND (platform_fields->>'deleted_at') IS NULL;

COMMIT;
