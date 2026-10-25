-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 (balayage des erreurs visibles) — « L'utilisateur ne doit voir AUCUNE erreur qui vient de nous ou
-- qui est déjà réglée » (Nico, 25/10) : les 4 lignes de classe B que les règles d'affichage ne referment pas seules.
-- ═══════════════════════════════════════════════════════════════════════════
-- Relu le 25/10 vers 16:30 (heure de Paris), chacune par son identifiant exact :
--   · 260e0730 (eBay, 309d0787) — B4 : remise en vente créée le 24/10 22:55 sur un stock lu avant la 2e vente eBay
--     (« restant 1 ») ; la fiche est vendue, quantité 0 (deux commandes eBay du 24/10). Elle attendait la configuration
--     du compte eBay (« compte à finir ») : prête, elle aurait remis en vente un article vendu. → close « article vendu ».
--     La règle est corrigée pour tous (ebay-api-worker : un article vendu n'est jamais publié par l'API).
--   · e41ec2a1 (Depop, 7e436336) — B5 : « La publication n'a pas abouti… relance-la » alors que le mur VU est la
--     configuration vendeur Depop (last_diagnostic.quoi = depop_vendeur_a_configurer) : le vrai geste de la personne,
--     dit une fois pour le compte (_shared/vendeur-depop.js). → source « depop_vendeur », message du compte.
--   · c64e5596 (eBay, 92012181) — B5 : brouillon refusé par eBay parce que NOS photos n'y étaient pas (22/10) ; rien en
--     ligne. → close, message neutre et vrai (pas partie, rien en ligne, à republier).
--   · dca5a386 (Leboncoin, afeef3c7) — B8a : rouge depuis le 07/09 « Publication non confirmée » ; aucune annonce de ce
--     titre parmi les 387 annonces Leboncoin relevées du compte ; 236 succès Leboncoin depuis. → close, message neutre.
-- Gardé tel quel (vérifié le 25/10) : la question « retirer ? » 29a1db8a (Beebs 34209200) — l'annonce est EN LIGNE et
-- achetable (vue à 15:12, « Ajouter au panier »), la fiche est vendue : la question est juste.
-- Rien n'est publié, retiré ni envoyé ; aucun mail. Sauvegarde : _backup_2510_erreurs_de_notre_fait. Inverse :
-- 20261025_erreurs_de_notre_fait_INVERSE.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2510_erreurs_de_notre_fait AS
  SELECT now() AS sauvegarde_le, c.id, c.user_id, c.status, c.error, c.platform_fields FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2510_erreurs_de_notre_fait ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2510_erreurs_de_notre_fait FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2510_erreurs_de_notre_fait
SELECT now(), c.id, c.user_id, c.status, c.error, c.platform_fields FROM public.cross_post_jobs c
 WHERE c.id IN ('260e0730-98e0-4651-9692-fa3c3e23deaa', 'e41ec2a1-98a9-4886-949d-4e4645778995',
                'c64e5596-b3f1-4a1f-89a8-def7092b519d', 'dca5a386-806f-4754-875a-1cff5a78c952')
   AND NOT EXISTS (SELECT 1 FROM public._backup_2510_erreurs_de_notre_fait b WHERE b.id = c.id);

-- L'erreur d'avant toujours archivée (même forme que _shared/erreurs-archivees.js).
CREATE FUNCTION pg_temp.archive(pf jsonb, err text, statut text, par text) RETURNS jsonb LANGUAGE sql STABLE AS $f$
  select coalesce(case when jsonb_typeof(pf -> 'erreurs_archivees') = 'array' then pf -> 'erreurs_archivees' end, '[]'::jsonb)
         || case when nullif(btrim(coalesce(err, '')), '') is null then '[]'::jsonb
                 else jsonb_build_array(jsonb_build_object('le', now(), 'statut', statut, 'erreur', left(btrim(err), 600), 'par', left(par, 80))) end
$f$;
CREATE FUNCTION pg_temp.attente_close(pf jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  select pf - array['needs_user_source', 'needs_user_sans_motif', 'needsUserField', 'needsUserFields', 'champs_a_completer',
                    'needs_user_tick_le', 'needs_user_actif_ms', 'needs_user_vu_le', 'needs_user_vu_erreur', 'next_action_after']
$f$;

DO $$
DECLARE n integer; total integer := 0;
BEGIN
  -- B4 : la remise en vente d'un article vendu (preuve relue au moment du geste : fiche vendue, quantité 0).
  UPDATE public.cross_post_jobs c
     SET status = 'cancelled',
         error = 'Arrêtée : l''article est vendu (deux ventes eBay le 24/10, stock à 0) — la remise en vente n''a plus d''objet. Rien n''a été publié.',
         platform_fields = pg_temp.attente_close(c.platform_fields)
           || jsonb_build_object('erreurs_archivees', pg_temp.archive(c.platform_fields, c.error, c.status, 'réparation 25/10 : remise en vente d''un article vendu'),
                                 'article_vendu', jsonb_build_object('le', now(), 'statut', i.statut, 'quantite', i.quantite, 'pose_par', 'scripts/reparations/20261025_erreurs_de_notre_fait.sql'),
                                 'hors_quota', true)
    FROM public.inventaire i
   WHERE c.id = '260e0730-98e0-4651-9692-fa3c3e23deaa' AND c.status = 'needs_user' AND c.action = 'publish'
     AND c.platform_fields ? 'remise_en_vente' AND i.id = c.inventaire_id AND i.user_id = c.user_id
     AND (i.statut = 'vendu' OR coalesce(i.quantite, 1) <= 0);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  IF n <> 1 THEN RAISE EXCEPTION 'B4 260e0730 : attendu 1, obtenu % — rien n''est fait', n; END IF;

  -- B5 Depop : le mur VU est la configuration vendeur — le geste du compte, avec son message (vendeur-depop.js).
  UPDATE public.cross_post_jobs c
     SET error = 'Depop demande de terminer ta configuration de vendeur (ajouter un moyen de paiement) avant ta première mise en ligne. Fais-le une seule fois sur depop.com, sur ton ordinateur : tes publications Depop repartiront toutes seules. Rien n''a été publié ni retiré.',
         platform_fields = (c.platform_fields - 'pas_de_rouge')
           || jsonb_build_object('needs_user_source', 'depop_vendeur',
                                 'erreurs_archivees', pg_temp.archive(c.platform_fields, c.error, c.status, 'réparation 25/10 : mur vendeur Depop nommé'),
                                 'requalifie_par', jsonb_build_object('le', now(), 'de', 'relancer', 'vers', 'depop_vendeur', 'pose_par', 'scripts/reparations/20261025_erreurs_de_notre_fait.sql'))
   WHERE c.id = 'e41ec2a1-98a9-4886-949d-4e4645778995' AND c.status = 'needs_user' AND c.platform = 'depop'
     AND c.platform_fields #>> '{last_diagnostic,quoi}' = 'depop_vendeur_a_configurer';
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  IF n <> 1 THEN RAISE EXCEPTION 'B5 e41ec2a1 : attendu 1, obtenu % — rien n''est fait', n; END IF;

  -- B5 eBay : brouillon refusé faute de NOS photos — pas partie, rien en ligne.
  UPDATE public.cross_post_jobs c
     SET status = 'cancelled',
         error = 'Pas partie sur eBay : eBay a refusé le brouillon parce que les photos n''y étaient pas arrivées (22/10). Rien n''est en ligne — tu peux la publier de nouveau.',
         platform_fields = pg_temp.attente_close(c.platform_fields - 'pas_de_rouge')
           || jsonb_build_object('erreurs_archivees', pg_temp.archive(c.platform_fields, c.error, c.status, 'réparation 25/10 : échec de notre fait, clos'),
                                 'clos_par_reparation', jsonb_build_object('le', now(), 'motif', 'photos_non_recues_par_ebay', 'pose_par', 'scripts/reparations/20261025_erreurs_de_notre_fait.sql'))
   WHERE c.id = 'c64e5596-b3f1-4a1f-89a8-def7092b519d' AND c.status = 'needs_user' AND c.platform = 'ebay' AND c.action = 'publish';
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  IF n <> 1 THEN RAISE EXCEPTION 'B5 c64e5596 : attendu 1, obtenu % — rien n''est fait', n; END IF;

  -- B8a : dépôt Leboncoin jamais confirmé (07/09), absent des annonces relevées du compte.
  IF EXISTS (SELECT 1 FROM public.annonces_plateforme a JOIN public.inventaire i ON i.id = 1787440272383007
              WHERE a.user_id = 'afeef3c7-0b0b-408c-a25b-3823448e3eb1' AND a.platform = 'leboncoin'
                AND (a.inventaire_id = i.id OR lower(coalesce(a.titre, '')) = lower(coalesce(i.titre, '')))) THEN
    RAISE EXCEPTION 'B8a dca5a386 : une annonce Leboncoin de cette fiche (ou de ce titre) existe au relevé — rien n''est fait';
  END IF;
  UPDATE public.cross_post_jobs c
     SET status = 'cancelled',
         error = 'Pas partie sur Leboncoin : le dépôt du 07/09 n''a jamais été confirmé, et Leboncoin ne la montre pas (absente des annonces relevées de ton compte). Rien n''est en ligne — tu peux la publier de nouveau.',
         platform_fields = c.platform_fields
           || jsonb_build_object('erreurs_archivees', pg_temp.archive(c.platform_fields, c.error, c.status, 'réparation 25/10 : dépôt jamais confirmé, clos'),
                                 'clos_par_reparation', jsonb_build_object('le', now(), 'motif', 'depot_jamais_confirme_absent_des_releves', 'pose_par', 'scripts/reparations/20261025_erreurs_de_notre_fait.sql'))
   WHERE c.id = 'dca5a386-806f-4754-875a-1cff5a78c952' AND c.status = 'failed' AND c.platform = 'leboncoin' AND c.action = 'publish';
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  IF n <> 1 THEN RAISE EXCEPTION 'B8a dca5a386 : attendu 1, obtenu % — rien n''est fait', n; END IF;
  RAISE NOTICE '% ligne(s) refermée(s)', total;
END $$;

SELECT left(c.id::text, 8) AS job, c.platform, c.status, left(c.error, 70) AS message, c.platform_fields ->> 'needs_user_source' AS source,
       (SELECT count(*) FROM public.email_logs e WHERE e.sent_at > now() - interval '5 minutes') AS mails_5_min
  FROM public.cross_post_jobs c WHERE c.id IN (SELECT id FROM public._backup_2510_erreurs_de_notre_fait);
COMMIT;
