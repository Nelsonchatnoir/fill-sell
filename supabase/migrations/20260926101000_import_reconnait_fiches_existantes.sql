-- ═══════════════════════════════════════════════════════════════════════════
-- L'IMPORT RECONNAÎT LES FICHES EXISTANTES, VENDUES COMPRISES (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════════════
-- LE FAIT (labouquinerie85) : le relevé OPLA du 24/09 11:30 a créé 17 fiches.
--   9 portent le titre EXACT d'un article vendu sur Vinted en 2024 (Cent poèmes
--   de la mer, Tokyo Tribe 2, Trains de caractère en France, Le blé et
--   l'alouette, Triominos, Solaris, Papyrus, Coffret Nicolas Cage, La
--   présidente) ; 1 (« 36 papas ») celui d'un article EN STOCK qui portait
--   déjà son annonce Opla. Elle a vu des doublons, les a supprimés — et leurs
--   annonces vivantes sont parties avec (25/09 23:15, « Cent poèmes de la
--   mer » : Leboncoin + Opla retirées).
--   Parc (balayage du 26/09) : 30 fiches d'import ont un homonyme exact, 11
--   comptes dont 4 payants ; 18 homonymes en stock, 12 seulement vendus.
--
-- LA CAUSE, LUE EN PROD (pg_get_functiondef) : le premier tour du moteur
--   (rapprocher_classer) ne cherche que les fiches EN STOCK SANS annonce
--   publiée sur la plateforme. Une fiche vendue, ou une fiche qui a déjà son
--   annonce sur cette plateforme, n'est jamais candidate : l'annonce tombe
--   « sans candidat », et l'import automatique crée une seconde fiche. La
--   garde du jumeau de rapprocher_importer (20/09) ne regarde, elle aussi,
--   que le stock, et seulement au-delà de 12 caractères (« 36 papas » : 8).
--
-- CE QUE FAIT CETTE MIGRATION — un bloc ajouté dans rapprocher_importer, sur
--   le seul chemin AUTOMATIQUE, avant la garde du jumeau (inchangée) :
--   même titre (titre_norm égal, ou mêmes mots qui comptent — titre_jetons)
--   qu'une fiche du compte EN STOCK ou VENDUE → pas de création. La
--   proposition est posée sur l'annonce, motif `homonyme_en_stock` ou
--   `homonyme_vendu`, et l'annonce reste dans « Annonces à rattacher » : la
--   personne tranche (même article, autre exemplaire → « Créer l'article »,
--   ou ignorer). Le refus est tracé UNE FOIS (decision 'refus_jumeau'), comme
--   la garde du jumeau.
--   ⛔ AUCUN RATTACHEMENT AUTOMATIQUE à une fiche vendue ou déjà publiée :
--      un titre ne prouve pas l'exemplaire (un bouquiniste a des doubles).
--   ⛔ Le geste MANUEL n'est pas touché (p_par = 'utilisateur') : « Créer
--      l'article » crée toujours, c'est la réponse « autre exemplaire ».
--   ⛔ Rien ne change pour une annonce dont le titre n'existe nulle part : elle
--      s'importe dès le premier relevé, comme depuis le 24/09.
--
-- ÉCRITE le 26/09/2026, NON APPLIQUÉE — en attente de la validation de Nico.

DO $do$
DECLARE
  v_def text; v_new text;
  a1 text := $a$  v_tn text; v_jumeau bigint; v_jumeau_titre text;
BEGIN$a$;
  r1 text := $a$  v_tn text; v_jumeau bigint; v_jumeau_titre text;
  v_homo bigint; v_homo_titre text; v_homo_statut text; v_homo_n integer;
BEGIN$a$;
  a2 text := $a$  v_tn := titre_norm(NULLIF(trim(a.titre), ''));
  IF p_par IS DISTINCT FROM 'utilisateur' AND length(COALESCE(v_tn, '')) > 12 THEN$a$;
  r2 text := $a$  v_tn := titre_norm(NULLIF(trim(a.titre), ''));

  -- ── L'IMPORT RECONNAÎT LES FICHES EXISTANTES, VENDUES COMPRISES (2026-09-26) ──
  -- labouquinerie85, relevé Opla du 24/09 : 9 fiches créées sous le titre exact
  -- d'un article VENDU, 1 sous celui d'un article en stock déjà publié. Le
  -- premier tour du moteur ne voit que le stock sans annonce sur la
  -- plateforme ; ces fiches existantes lui étaient invisibles.
  -- ⛔ ON NE CRÉE PAS, ON DEMANDE : même titre (titre_norm, ou mêmes mots qui
  --    comptent) qu'une fiche en stock OU vendue → proposition posée sur
  --    l'annonce ; la personne tranche. Jamais de rattachement automatique à
  --    une fiche vendue ou déjà publiée : un titre ne prouve pas l'exemplaire.
  -- ⛔ Le geste MANUEL n'est pas touché (p_par = 'utilisateur').
  IF p_par IS DISTINCT FROM 'utilisateur' AND COALESCE(v_tn, '') <> ''
     AND COALESCE(array_length(titre_jetons(a.titre), 1), 0) > 0 THEN
    SELECT i.id, i.titre, i.statut, count(*) OVER ()
      INTO v_homo, v_homo_titre, v_homo_statut, v_homo_n
      FROM inventaire i
     WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
       AND (titre_norm(i.titre) = v_tn OR titre_jetons(i.titre) = titre_jetons(a.titre))
     ORDER BY (i.statut = 'stock') DESC, (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    IF v_homo IS NOT NULL THEN
      UPDATE annonces_plateforme
         SET proposition = jsonb_build_object('inventaire_id', v_homo, 'job_id', NULL,
                                              'motif', CASE WHEN v_homo_statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END,
                                              'score', 0.5, 'statut_fiche', v_homo_statut, 'titre_fiche', v_homo_titre,
                                              'candidats', '[]'::jsonb, 'candidats_total', v_homo_n,
                                              'at', now()),
             updated_at = now()
       WHERE id = a.id;
      IF NOT EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'refus_jumeau') THEN
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, a.id, v_homo, 'refus_jumeau', p_par, 1,
                jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_homo_titre,
                                   'motif', CASE WHEN v_homo_statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END,
                                   'statut_fiche', v_homo_statut, 'homonymes', v_homo_n));
      END IF;
      RETURN jsonb_build_object('ok', false, 'reason', 'jumeau_probable',
                                'inventaire_id', v_homo, 'titre_article', v_homo_titre,
                                'motif', CASE WHEN v_homo_statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END);
    END IF;
  END IF;

  IF p_par IS DISTINCT FROM 'utilisateur' AND length(COALESCE(v_tn, '')) > 12 THEN$a$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rapprocher_importer';
  IF v_def IS NULL THEN RAISE EXCEPTION 'rapprocher_importer introuvable'; END IF;
  IF position('L''IMPORT RECONNAÎT LES FICHES EXISTANTES' IN v_def) > 0 THEN
    RAISE NOTICE 'rapprocher_importer : déjà migrée'; RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 THEN
    RAISE EXCEPTION 'rapprocher_importer : ancre 1 (DECLARE) absente ou multiple — corps prod différent de celui relu le 26/09';
  END IF;
  IF (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 THEN
    RAISE EXCEPTION 'rapprocher_importer : ancre 2 (garde du jumeau) absente ou multiple — corps prod différent de celui relu le 26/09';
  END IF;
  v_new := replace(replace(v_def, a1, r1), a2, r2);
  EXECUTE v_new;
END
$do$;

-- ── Contrôle final — BLOQUANT ───────────────────────────────────────────────
DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.rapprocher_importer(uuid,uuid,text)'::regprocedure) INTO v_def;
  IF position('L''IMPORT RECONNAÎT LES FICHES EXISTANTES' IN v_def) = 0 THEN RAISE EXCEPTION 'contrôle : bloc homonymes absent'; END IF;
  IF position('homonyme_vendu' IN v_def) = 0 OR position('homonyme_en_stock' IN v_def) = 0 THEN RAISE EXCEPTION 'contrôle : motifs absents'; END IF;
  -- la garde du jumeau d'avant est toujours là, une fois
  IF (length(v_def) - length(replace(v_def, 'LA GARDE DU JUMEAU (2026-09-20)', ''))) / length('LA GARDE DU JUMEAU (2026-09-20)') <> 1 THEN
    RAISE EXCEPTION 'contrôle : garde du jumeau du 20/09 perdue ou doublée';
  END IF;
END
$do$;
