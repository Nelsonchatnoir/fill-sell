-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 soir (lot « zéro blocage ») — 4 jobs CLOS (rien à republier ni à publier) et 2 RELANCÉS (cause levée)
-- ═══════════════════════════════════════════════════════════════════════════
-- Aucune annonce touchée : seuls des jobs encore en attente (needs_user / pending), jamais un retrait engagé.
-- CLOS (status cancelled, motif vrai, unité de republication rendue par republish_refund_on_terminal) :
--   · 05c348ef, 5d7b895b (thibault, Depop) : téléphones — Depop n'accepte pas les objets électriques ; la règle B7
--     close désormais une telle republication au lieu de la laisser en pause (05c348ef : l'annonce Depop a de plus
--     été retirée par Thibault lui-même le 21/10, logo du Stock) ;
--   · fa5c6f20 (louis, Leboncoin) : la page de l'annonce dit « Article vendu » (republish_etat_reel sold ; relevé du
--     24/10 12:10 transaction sold) — une annonce vendue ne se republie pas (règle A4) ; la vente suit son circuit ;
--   · f86ecce8 (mele.marta, Vinted, PUBLICATION) : l'article est DÉJÀ en ligne sur la même boutique (fiche
--     1792843588428 = annonce 4279156557, active, boutique 158898598) — une nouvelle publication créerait un doublon.
-- RELANCÉS (pending, étape a_capturer, compteur de reprises à 0 — le contrôle avant retrait reste) :
--   · e104cacb (xxewwer), 30e507a4 (voirememe), Leboncoin « introuvable persistant » : la lecture refusait l'annonce
--     à cause de la mémoire « annonce morte » de l'extension ; leurs postes (0.6.131) l'ont oubliée — le veilleur relit
--     ces annonces « active » (23/10 21:52 → 24/10 13:21). Le relevé les voit en ligne sous leur numéro exact.
-- Gardes (sinon RIEN) : chaque job dans l'état relu juste avant (statut, plateforme, étape avant retrait).
-- Sauvegarde : _backup_2410_zero_blocage_jobs. Inverse : …_INVERSE.sql. Aucun mail, aucune notification.
BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public._backup_2410_zero_blocage_jobs AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2410_zero_blocage_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_zero_blocage_jobs FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2410_zero_blocage_jobs
  SELECT now(), c.* FROM public.cross_post_jobs c
   WHERE c.id IN ('05c348ef-7a7f-4780-b296-060b6df5766f', '5d7b895b-eb97-4e7a-b168-4e10152eb38f', 'fa5c6f20-0075-4115-a6ba-11739d1abb40',
                  'f86ecce8-8dc7-4ade-b5f3-d48b03f63052', 'e104cacb-50e7-45c8-aaca-f80c3093c53d', '30e507a4-aad6-4916-bbcf-14ec95d0a581');

DO $$
DECLARE
  n integer;
  v_trace jsonb := jsonb_build_object('le', now(), 'par', 'Claude — lot « zéro blocage » (24/10 soir)', 'pose_par', 'scripts/reparations/20261024_zero_blocage_clotures_et_relances.sql');
BEGIN
  -- 1. Les deux téléphones Depop (republication, rien retiré).
  UPDATE public.cross_post_jobs
     SET status = 'cancelled',
         error = 'Republication Depop non lancée : Depop n''accepte pas les objets électriques ou électroniques (téléphones). Ton annonce Depop est intacte, rien n''a été retiré.',
         platform_fields = (platform_fields - 'needs_user_source' - 'next_action_after' - 'processing_since')
           || jsonb_build_object('cloture_support', v_trace || jsonb_build_object('motif', 'article_refuse_par_depop'))
   WHERE id IN ('05c348ef-7a7f-4780-b296-060b6df5766f', '5d7b895b-eb97-4e7a-b168-4e10152eb38f')
     AND platform = 'depop' AND action = 'republish' AND status = 'needs_user' AND platform_fields ? 'depop_interdit'
     AND coalesce(platform_fields ->> 'republish_step', 'a_capturer') IN ('a_capturer', 'captured');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'téléphones Depop : % ligne(s) au lieu de 2 — rien n''est fait', n; END IF;

  -- 2. L'annonce Leboncoin vendue de louis.
  UPDATE public.cross_post_jobs
     SET status = 'cancelled',
         error = 'Republication annulée : ton annonce Leboncoin est vendue (la page affiche « Article vendu »). Rien n''a été retiré ; la vente est suivie à part, comme les autres.',
         platform_fields = (platform_fields - 'needs_user_source' - 'next_action_after' - 'processing_since')
           || jsonb_build_object('cloture_support', v_trace || jsonb_build_object('motif', 'annonce_vendue'))
   WHERE id = 'fa5c6f20-0075-4115-a6ba-11739d1abb40'
     AND platform = 'leboncoin' AND action = 'republish' AND status = 'needs_user'
     AND platform_fields #>> '{republish_etat_reel,state}' = 'sold'
     AND coalesce(platform_fields ->> 'republish_step', 'a_capturer') IN ('a_capturer', 'captured');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'louis fa5c6f20 : % ligne(s) — rien n''est fait', n; END IF;

  -- 3. La publication Vinted en double de mele.marta (l'article est déjà en ligne sur la même boutique).
  UPDATE public.cross_post_jobs c
     SET status = 'cancelled',
         error = 'Publication arrêtée : ce t-shirt est déjà en ligne sur ta boutique Vinted (annonce 4279156557). Rien n''a été publié en double, rien n''a été décompté.',
         platform_fields = (c.platform_fields - 'needs_user_source' - 'next_action_after' - 'processing_since')
           || jsonb_build_object('cloture_support', v_trace || jsonb_build_object('motif', 'deja_en_ligne_meme_boutique', 'annonce', '4279156557'))
   WHERE c.id = 'f86ecce8-8dc7-4ade-b5f3-d48b03f63052'
     AND c.platform = 'vinted' AND c.action = 'publish' AND c.status = 'pending' AND c.platform_listing_id IS NULL
     AND EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = c.inventaire_id AND i.vinted_item_id = '4279156557'
                   AND i.vinted_account_id::text = '158898598' AND i.statut = 'stock');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'mele.marta f86ecce8 : % ligne(s) — rien n''est fait (déjà parti ?)', n; END IF;

  -- 4. Les deux republications Leboncoin « introuvable persistant » : relancées avant retrait.
  UPDATE public.cross_post_jobs
     SET status = 'pending', error = NULL,
         platform_fields = (platform_fields - 'needs_user_source' - 'next_action_after' - 'processing_since' - 'needsUserAttempts'
                              - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur' - 'introuvable_404')
           || jsonb_build_object(
                'introuvable_a_confirmer', coalesce(platform_fields -> 'introuvable_a_confirmer', '{}'::jsonb)
                    || jsonb_build_object('reprises', 0, 'dementi_le', now(), 'dementi_par', 'relevé en ligne, mémoire « annonce morte » oubliée par le poste (0.6.131)'),
                'relance_support', v_trace || jsonb_build_object('cause', 'mémoire « annonce morte » de l''extension, oubliée depuis par le poste'),
                'erreurs_archivees', coalesce(CASE WHEN jsonb_typeof(platform_fields -> 'erreurs_archivees') = 'array' THEN platform_fields -> 'erreurs_archivees' END, '[]'::jsonb)
                    || jsonb_build_array(jsonb_build_object('le', now(), 'statut', status, 'erreur', left(btrim(coalesce(error, '')), 600), 'par', 'relance support (lot zéro blocage)')))
   WHERE id IN ('e104cacb-50e7-45c8-aaca-f80c3093c53d', '30e507a4-aad6-4916-bbcf-14ec95d0a581')
     AND platform = 'leboncoin' AND action = 'republish' AND status = 'needs_user'
     AND platform_fields ->> 'needs_user_source' = 'introuvable_persistant'
     AND coalesce(platform_fields ->> 'republish_step', 'a_capturer') = 'a_capturer';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'introuvables persistants : % ligne(s) au lieu de 2 — rien n''est fait', n; END IF;
END $$;

SELECT c.id, c.platform, c.status, left(c.error, 70) AS message,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c
 WHERE c.id IN ('05c348ef-7a7f-4780-b296-060b6df5766f', '5d7b895b-eb97-4e7a-b168-4e10152eb38f', 'fa5c6f20-0075-4115-a6ba-11739d1abb40',
                'f86ecce8-8dc7-4ade-b5f3-d48b03f63052', 'e104cacb-50e7-45c8-aaca-f80c3093c53d', '30e507a4-aad6-4916-bbcf-14ec95d0a581')
 ORDER BY c.platform, c.id;
COMMIT;
