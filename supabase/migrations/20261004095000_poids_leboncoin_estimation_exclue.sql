SET lock_timeout = '8s';
-- ═══════════════════════════════════════════════════════════════════════════
-- LE POIDS D'UNE FICHE NE SE LIT PAS SUR L'ESTIMATION DE LEBONCOIN (04/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- 20261004093000 lisait le poids d'une annonce Leboncoin dans
-- `estimated_parcel_weight`. Relu le 04/10 sur les annonces de Louis : ses
-- rangements de yaourtière (quelques centaines de grammes) y portent 2 000,
-- 5 000, voire 40 000 g. Ce n'est pas le poids de l'objet : c'est la tranche
-- que Leboncoin ESTIME d'après la catégorie quand le vendeur n'en donne pas
-- (« Sans poids, il l'estime lui-même », carte Livraison du stepper). Le
-- reporter sur la fiche l'aurait propagé, traduit, sur Beebs, Vinted et eBay.
-- Désormais : le poids d'une annonce vient de ce que le VENDEUR a choisi —
-- Beebs (tranche du formulaire, weight_id ou libellé « Poids jusqu'à … »),
-- eBay (poids du colis de l'annonce), ou un poids explicite de la capture.
-- La republication Leboncoin, elle, reprend toujours la tranche de son
-- annonce (get-pending-jobs) : c'est la même annonce, à l'identique.
-- Rien à défaire : aucune fiche n'avait encore reçu un poids de Leboncoin
-- (journal relu à 11:10, 9 lignes, aucune venue de Leboncoin).
-- Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.annonce_poids_g(p_platform text, p_d jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v numeric;
  t text;
BEGIN
  IF p_d IS NULL OR jsonb_typeof(p_d) <> 'object' THEN RETURN NULL; END IF;
  t := p_d ->> 'poids_g';
  IF t ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' THEN v := t::numeric; END IF;
  IF v IS NULL AND NULLIF(p_d ->> 'format_colis_id', '') IS NOT NULL THEN
    SELECT poids_g INTO v FROM beebs_formats_colis WHERE id = p_d ->> 'format_colis_id';
  END IF;
  IF v IS NULL AND p_platform = 'beebs' AND COALESCE(p_d ->> 'format_colis', '') ~* '^poids' THEN
    v := public.poids_g_de_texte(p_d ->> 'format_colis');
  END IF;
  -- ⛔ Leboncoin : `estimated_parcel_weight` est une ESTIMATION de la
  --    plateforme (tranche par catégorie), jamais lue comme le poids de l'objet.
  IF p_platform = 'leboncoin' AND NOT (t ~ '^\s*[0-9]+(\.[0-9]+)?\s*$') THEN RETURN NULL; END IF;
  IF v IS NULL OR v < 1 OR v > 200000 THEN RETURN NULL; END IF;
  RETURN round(v)::integer;
END;
$function$;
