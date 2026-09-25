-- ═══════════════════════════════════════════════════════════════════════════
-- DOUBLONS : DANS UNE CHAÎNE, LA FICHE GARDÉE PORTE LA DERNIÈRE ANNONCE
-- (2026-09-25 après-midi, suite de 20260925160000 → 20260925162000)
-- ═══════════════════════════════════════════════════════════════════════════
-- Un objet retiré puis republié plusieurs fois (m1 → m2 → m3 → n) rejoint sa
-- fiche d'ORIGINE, maillon après maillon. Pour que chaque maillon se compare
-- au précédent — et non à l'annonce d'origine retirée des jours plus tôt —,
-- la fusion de deux annonces RETIRÉES successives échange aussi les
-- identités : la fiche gardée prend l'annonce la plus récente (sa date de
-- retrait comprise), l'absorbée garde l'ancienne. Même journal (echange),
-- même défusion (20260925160000) ; aucune annonce vivante n'est en jeu ici.
-- inventaire_fusionner_pour : corps PROD (md5 c3a73fe6a5c5e194b0b9f9095e1a664d),
-- une ancre.

DO $patch$
DECLARE
  v_src text; c int;
  a1 text := $a1$  ELSIF g.vinted_item_id IS NOT NULL AND a.vinted_item_id IS NOT NULL AND vinted_remise_en_ligne(g.id, a.id) THEN$a1$;
  b1 text := $b1$  -- (migration 20260925163000) et deux annonces RETIRÉES successives : le gardé
  -- prend la plus récente, pour que le maillon suivant d'une chaîne se compare à elle.
  ELSIF g.vinted_item_id IS NOT NULL AND a.vinted_item_id IS NOT NULL
        AND (vinted_remise_en_ligne(g.id, a.id) OR vinted_retraits_successifs(g.id, a.id)) THEN$b1$;
BEGIN
  SELECT pg_get_functiondef('public.inventaire_fusionner_pour(uuid,bigint,bigint,text)'::regprocedure) INTO v_src;
  IF md5(v_src) <> 'c3a73fe6a5c5e194b0b9f9095e1a664d' THEN RAISE EXCEPTION 'inventaire_fusionner_pour : md5 inattendu — ON S ARRETE'; END IF;
  c := (length(v_src) - length(replace(v_src, a1, ''))) / length(a1);
  IF c <> 1 THEN RAISE EXCEPTION 'inventaire_fusionner_pour : ancre trouvée % fois (attendu 1) — ON S ARRETE', c; END IF;
  EXECUTE replace(v_src, a1, b1);
END
$patch$;
