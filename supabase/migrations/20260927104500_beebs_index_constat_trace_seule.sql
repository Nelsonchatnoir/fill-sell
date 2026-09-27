-- ═══════════════════════════════════════════════════════════════════════════
-- BEEBS : L'ABSENCE DE L'INDEX EST UNE TRACE, JAMAIS UN VERDICT (27/09, retour)
-- ═══════════════════════════════════════════════════════════════════════════
-- beebs_index_constat (20260927103000, appliquée le matin même) savait CLORE
-- un dépôt absent de l'index public depuis plus de 7 jours : cancelled,
-- « Rien n'est en ligne — tu peux la republier », relance rendue possible.
-- Mesuré dans l'heure : 13 dépôts clos sur 4 comptes, dont 8 d'ornellaracano
-- qui n'étaient même pas encore passés par le balayage de nuit. Or l'index ne
-- voit ni une annonce EN MODÉRATION, ni une annonce VENDUE (en-tête de
-- _shared/beebs-index.ts : « Une absence ne prouve rien ») : affirmer « rien
-- n'est en ligne » et rouvrir la relance, c'est inviter au doublon — et
-- retirer la garde voulue par le balayage de nuit (« ⚠️ AVANT DE REPUBLIER,
-- va vérifier tes annonces », bouton « Voir mes annonces Beebs », pas de
-- relance).
--
-- Désormais : la fonction ne fait QUE poser la trace platform_fields.beebs_index
-- (même signature, p_clore ignoré — beebs-lien v3, déployée le 27/09 à 12:25,
-- passe déjà false : plus rien ne clôt depuis).
-- APPLIQUÉE le 27/09 à 12:51 (décision de Nico, point C) après rejeu annulé
-- (appel p_clore=true → « trace », statut inchangé ; droits identiques).
-- Les 13 dépôts clos : restaurés par 20260927110500 (12:50).

CREATE OR REPLACE FUNCTION public.beebs_index_constat(p_job uuid, p_trace jsonb, p_clore boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n integer;
BEGIN
  IF p_job IS NULL OR p_trace IS NULL THEN RETURN 'arguments'; END IF;
  -- p_clore : conservé pour la signature, IGNORÉ (27/09) — une absence de
  -- l'index ne clôt jamais un dépôt.
  UPDATE cross_post_jobs SET
    platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('beebs_index', p_trace)
   WHERE id = p_job AND platform = 'beebs' AND listing_url IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN CASE WHEN v_n > 0 THEN 'trace' ELSE 'rien' END;
END
$function$;

REVOKE ALL ON FUNCTION public.beebs_index_constat(uuid, jsonb, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beebs_index_constat(uuid, jsonb, boolean) TO service_role;
