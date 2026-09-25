-- ═══════════════════════════════════════════════════════════════════════════
-- DOUBLONS : LES RETRAITS SUCCESSIFS D'UN MÊME OBJET (2026-09-25 après-midi)
-- ═══════════════════════════════════════════════════════════════════════════
-- Suite de 20260925160000 (remise en ligne Vinted). MESURÉ le 25/09 : sur 233
-- fiches vivantes remises en ligne, 44 le sont au bout d'une CHAÎNE (l'objet
-- retiré puis republié deux ou trois fois : 38 chaînes de 2, 6 de 3). Pour
-- que toutes les fiches de la chaîne rejoignent la fiche d'ORIGINE — jamais
-- une fusion dans une fiche elle-même absorbée —, deux annonces RETIRÉES dont
-- la seconde est apparue après le retrait de la première (même boutique, un
-- jour de marge) sont reconnues comme le même objet republié : la fusion ne
-- touche à aucune identité (chaque fiche garde son annonce retirée).
-- Le plafond « plusieurs exemplaires vivants » compte désormais les annonces
-- vivantes de TOUT le groupe de titre, la paire comprise : deux ou plus → la
-- personne tranche (une chaîne ne s'achève que par UNE annonce vivante).
-- Corps PROD relus (md5), patchés en place, chaque ancre trouvée UNE fois :
--   inventaire_doublon_evaluer   3ec352ff2f97615db8503e44e7d419a4
--   inventaire_doublons_pour     355fc2d34f40688d9ffcb179feaa9329

DO $verif$
BEGIN
  IF md5(pg_get_functiondef('public.inventaire_doublon_evaluer(bigint,bigint)'::regprocedure)) <> '3ec352ff2f97615db8503e44e7d419a4' THEN
    RAISE EXCEPTION 'inventaire_doublon_evaluer a changé en prod depuis la lecture — ON S ARRETE';
  END IF;
  IF md5(pg_get_functiondef('public.inventaire_doublons_pour(bigint)'::regprocedure)) <> '355fc2d34f40688d9ffcb179feaa9329' THEN
    RAISE EXCEPTION 'inventaire_doublons_pour a changé en prod depuis la lecture — ON S ARRETE';
  END IF;
END
$verif$;

CREATE OR REPLACE FUNCTION public.vinted_retraits_successifs(p_premier bigint, p_second bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM inventaire m, inventaire n
     WHERE m.id = p_premier AND n.id = p_second AND m.id <> n.id AND m.user_id = n.user_id
       AND m.vinted_item_id IS NOT NULL AND n.vinted_item_id IS NOT NULL AND m.vinted_item_id <> n.vinted_item_id
       AND m.vinted_status = 'closed' AND m.disparu_le IS NOT NULL
       AND n.vinted_status = 'closed' AND n.disparu_le IS NOT NULL
       AND COALESCE(m.vinted_account_id, '') = COALESCE(n.vinted_account_id, '')
       AND n.created_at >= m.disparu_le - interval '1 day');
$function$;
REVOKE ALL ON FUNCTION public.vinted_retraits_successifs(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vinted_retraits_successifs(bigint, bigint) TO service_role;

CREATE OR REPLACE FUNCTION pg_temp.remplacer_une_fois(p_src text, p_ancre text, p_par text, p_nom text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE c int;
BEGIN
  c := (length(p_src) - length(replace(p_src, p_ancre, ''))) / length(p_ancre);
  IF c <> 1 THEN RAISE EXCEPTION '% : ancre trouvée % fois (attendu 1) — ON S ARRETE : %', p_nom, c, left(p_ancre, 80); END IF;
  RETURN replace(p_src, p_ancre, p_par);
END
$function$;

DO $patch$
DECLARE v text;
BEGIN
  v := pg_get_functiondef('public.inventaire_doublon_evaluer(bigint,bigint)'::regprocedure);
  v := pg_temp.remplacer_une_fois(v,
$a$    v_remise := vinted_remise_en_ligne(a.id, b.id) OR vinted_remise_en_ligne(b.id, a.id);$a$,
$b$    v_remise := vinted_remise_en_ligne(a.id, b.id) OR vinted_remise_en_ligne(b.id, a.id)
             OR vinted_retraits_successifs(a.id, b.id) OR vinted_retraits_successifs(b.id, a.id);$b$, 'evaluer/successifs');
  v := pg_temp.remplacer_une_fois(v,
$a$  IF v_remise AND v_niveau = 'certain' AND EXISTS (
       SELECT 1 FROM inventaire o
        WHERE o.user_id = a.user_id AND o.id <> a.id AND o.id <> b.id
          AND o.fusionne_dans IS NULL AND o.statut = 'stock'
          AND o.vinted_item_id IS NOT NULL AND o.disparu_le IS NULL
          AND lower(btrim(o.titre)) IN (lower(btrim(a.titre)), lower(btrim(b.titre)))) THEN$a$,
$b$  IF v_remise AND v_niveau = 'certain' AND (
       SELECT count(*) FROM inventaire o
        WHERE o.user_id = a.user_id
          AND o.fusionne_dans IS NULL AND o.statut = 'stock'
          AND o.vinted_item_id IS NOT NULL AND o.disparu_le IS NULL
          AND lower(btrim(o.titre)) IN (lower(btrim(a.titre)), lower(btrim(b.titre)))) >= 2 THEN$b$, 'evaluer/exemplaires');
  EXECUTE v;
END
$patch$;

DO $patch$
DECLARE v text;
BEGIN
  v := pg_get_functiondef('public.inventaire_doublons_pour(bigint)'::regprocedure);
  v := pg_temp.remplacer_une_fois(v,
$a$            OR vinted_remise_en_ligne(i.id, f.id) OR vinted_remise_en_ligne(f.id, i.id))$a$,
$b$            OR vinted_remise_en_ligne(i.id, f.id) OR vinted_remise_en_ligne(f.id, i.id)
            OR vinted_retraits_successifs(i.id, f.id) OR vinted_retraits_successifs(f.id, i.id))$b$, 'doublons_pour/successifs');
  EXECUTE v;
END
$patch$;
