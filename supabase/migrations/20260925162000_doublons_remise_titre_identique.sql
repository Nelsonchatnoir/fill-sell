-- ═══════════════════════════════════════════════════════════════════════════
-- DOUBLONS : UNE REMISE EN LIGNE À L'IDENTIQUE N'EST PAS ÉCARTÉE PAR SA PHOTO
-- (2026-09-25 après-midi, suite de 20260925160000 / 20260925161000)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QU'ON A VU, À L'ŒIL : chez le compte 30e3fb01, les 108 annonces Vinted
-- retirées et republiées dans l'heure (outil de republication) portent la MÊME
-- photo, encadrée d'un « timbre » décoratif ajouté à la republication : 12
-- paires sur 12 vérifiées, plus la seule autre paire « photo différente » du
-- parc (5f704c61) — 13 sur 13, le même objet. Le cadre suffit à rendre
-- l'empreinte « différente » (dHash 11 à 35), et la règle les écartait toutes.
--
-- LA RÈGLE, bornée : la remise en ligne (même boutique ; l'ancienne annonce
-- retirée, pas vendue ; la suivante apparue au plus 24 h après le retrait)
-- avec un titre IDENTIQUE, sans conflit de couleur, de nombre ni de marque :
--   · titre précis (≥ 3 mots qui comptent) → certain ;
--   · titre court (« cagoule », « bague fantaisie ») → la personne tranche.
-- Tous les garde-fous de CONTEXTE suivent, inchangés : fiche vendue, quantité,
-- plusieurs exemplaires vivants du même titre, deux annonces vivantes sur une
-- même plateforme, freins de la fiche absorbée.
-- inventaire_doublon_evaluer : corps PROD (md5 ce169cf25810c5f2322b0b6aed46a941),
-- une ancre, un bloc ajouté.

DO $patch$
DECLARE
  v_src text; c int;
  a1 text := $a1$
  -- LE CONTEXTE, que ni le titre ni la photo ne savent :$a1$;
  b1 text := $b1$
  -- AJOUT 2026-09-25 après-midi (migration 20260925162000) : la REMISE EN
  -- LIGNE à l'identique — même titre, retirée puis republiée dans les 24 h —
  -- n'est pas écartée par une photo retouchée (cadre ajouté par un outil de
  -- republication : 13 paires sur 13 vérifiées à l'œil, le même objet).
  IF v_remise
     AND (v_niveau = 'probable' OR (v_niveau = 'ecarte' AND v_motif = 'photos_differentes'))
     AND lower(btrim(a.titre)) = lower(btrim(b.titre))
     AND COALESCE(s ->> 'nombre', 'ok') = 'ok' AND COALESCE(s ->> 'lot', 'ok') = 'ok'
     AND ((a.disparu_le IS NOT NULL AND b.created_at BETWEEN a.disparu_le - interval '1 day' AND a.disparu_le + interval '1 day')
       OR (b.disparu_le IS NOT NULL AND a.created_at BETWEEN b.disparu_le - interval '1 day' AND b.disparu_le + interval '1 day')) THEN
    IF COALESCE(array_length(titre_jetons(a.titre), 1), 0) >= 3 THEN
      v_niveau := 'certain'; v_motif := 'remise_en_ligne_titre_identique';
    ELSE
      v_niveau := 'probable'; v_motif := 'remise_en_ligne_titre_court';
    END IF;
  END IF;

  -- LE CONTEXTE, que ni le titre ni la photo ne savent :$b1$;
BEGIN
  SELECT pg_get_functiondef('public.inventaire_doublon_evaluer(bigint,bigint)'::regprocedure) INTO v_src;
  IF md5(v_src) <> 'ce169cf25810c5f2322b0b6aed46a941' THEN RAISE EXCEPTION 'inventaire_doublon_evaluer : md5 inattendu — ON S ARRETE'; END IF;
  c := (length(v_src) - length(replace(v_src, a1, ''))) / length(a1);
  IF c <> 1 THEN RAISE EXCEPTION 'inventaire_doublon_evaluer : ancre trouvée % fois (attendu 1) — ON S ARRETE', c; END IF;
  EXECUTE replace(v_src, a1, b1);
END
$patch$;
