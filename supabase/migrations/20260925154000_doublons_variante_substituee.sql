-- ═══════════════════════════════════════════════════════════════════════════
-- DOUBLONS : UNE AUTRE VARIANTE N'EST PAS UNE QUESTION (2026-09-25 après-midi)
-- ═══════════════════════════════════════════════════════════════════════════
-- Relu sur le recensement du parc (migration 20260925151000 appliquée, 182
-- paires « probables ») : des vendeurs ont des séries d'objets qui ne
-- diffèrent que par UN mot rare — « Hochet hippopotame | Fait main | Coton »
-- et « Hochet Koala | Fait main | Coton », « Assassin's Creed II » et
-- « … Revelations », « Poupée Bratz Jade » et « … Sasha ». 80 % des mots en
-- commun, le même prix, pas de photo qui prouve : la règle les proposait.
-- Ce sont deux objets. Les proposer, c'est poser une question absurde.
--
-- LA RÈGLE (fiche ↔ fiche seulement) : quand SEUL le titre rapproche (motif
-- « titre_proche » : aucune photo, 75 % des mots, même prix), une paire n'est pas proposée si le titre
-- le plus court porte un mot RARE du stock du compte (présent dans moins de
-- max(3 ; 1 %) de ses fiches) que l'autre titre n'a pas — c'est une autre
-- variante (« koala » au lieu d'« hippopotame »), pas le même objet décrit
-- autrement. Un titre court ENTIÈREMENT contenu dans l'autre (« Porte
-- revues » / « Porte revue en bois foncé »), ou dont les mots manquants sont
-- des mots communs du compte (« notice », « livret »), reste une question.
-- ⛔ La photo IDENTIQUE ou PROCHE et le titre PRÉCIS (≥ 5 mots, ≥ 80 %) ne sont
--    pas concernés : mesuré sur le recensement, la garde y écartait aussi de
--    vrais doublons (« Yokai Attack », « Journal Spirou n° 1444 », « MSI Forge
--    GK320 ») — dans le doute, on propose.
-- ⛔ Le faisceau des relevés (annonce ↔ fiche) n'est pas modifié.
-- inventaire_doublon_evaluer : corps PROD (md5 aaaadee8050449d61ff6270995b21aad,
-- relu, patché en place — une ancre, un bloc ajouté).

DO $verif$
BEGIN
  IF md5(pg_get_functiondef('public.inventaire_doublon_evaluer(bigint,bigint)'::regprocedure)) <> 'aaaadee8050449d61ff6270995b21aad' THEN
    RAISE EXCEPTION 'inventaire_doublon_evaluer a changé en prod depuis la lecture — ON S ARRETE';
  END IF;
END
$verif$;

-- Le titre le plus court porte-t-il un mot RARE du compte que l'autre n'a pas ?
CREATE OR REPLACE FUNCTION public.titres_variante_substituee(p_user uuid, a text, b text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ja text[] := titre_jetons(a); jb text[] := titre_jetons(b);
  v_court text[]; v_long text[]; v_manque text[]; v_n integer; v_seuil integer; v_t text; v_df integer;
BEGIN
  IF COALESCE(array_length(ja, 1), 0) <= COALESCE(array_length(jb, 1), 0) THEN v_court := ja; v_long := jb;
  ELSE v_court := jb; v_long := ja; END IF;
  v_manque := ARRAY(SELECT x FROM unnest(v_court) x WHERE NOT (x = ANY (v_long)) AND x !~ '^[0-9]+$');
  IF COALESCE(array_length(v_manque, 1), 0) = 0 THEN RETURN false; END IF;   -- le court est contenu dans le long
  SELECT count(*) INTO v_n FROM inventaire WHERE user_id = p_user AND fusionne_dans IS NULL;
  v_seuil := greatest(3, ceil(v_n * 0.01)::integer);
  FOREACH v_t IN ARRAY v_manque LOOP
    SELECT count(*) INTO v_df FROM inventaire i
     WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND titre_jetons(i.titre) @> ARRAY[v_t];
    IF v_df < v_seuil THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END;
$function$;
REVOKE ALL ON FUNCTION public.titres_variante_substituee(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.titres_variante_substituee(uuid, text, text) TO service_role;

DO $patch$
DECLARE
  v_src text; v_new text; c int;
  a1 text := $a1$  v_niveau := nv ->> 'niveau'; v_motif := nv ->> 'motif';$a1$;
  b1 text := $b1$  v_niveau := nv ->> 'niveau'; v_motif := nv ->> 'motif';
  -- AJOUT 2026-09-25 (migration 20260925154000) : sans photo qui prouve, une
  -- autre VARIANTE (un mot rare du titre court absent de l'autre) n'est pas
  -- une question — « Hochet hippopotame » / « Hochet Koala ».
  IF v_niveau = 'probable' AND v_motif = 'titre_proche'
     AND titres_variante_substituee(a.user_id, a.titre, b.titre) THEN
    v_niveau := 'ecarte'; v_motif := 'variante_substituee';
  END IF;$b1$;
BEGIN
  SELECT pg_get_functiondef('public.inventaire_doublon_evaluer(bigint,bigint)'::regprocedure) INTO v_src;
  IF md5(v_src) <> 'aaaadee8050449d61ff6270995b21aad' THEN RAISE EXCEPTION 'inventaire_doublon_evaluer : md5 inattendu — ON S ARRETE'; END IF;
  c := (length(v_src) - length(replace(v_src, a1, ''))) / length(a1);
  IF c <> 1 THEN RAISE EXCEPTION 'inventaire_doublon_evaluer : ancre trouvée % fois (attendu 1) — ON S ARRETE', c; END IF;
  v_new := replace(v_src, a1, b1);
  EXECUTE v_new;
END
$patch$;
