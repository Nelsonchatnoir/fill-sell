-- ═══════════════════════════════════════════════════════════════════════════
-- DEUX FICHES DU MÊME OBJET (MÊME PHOTO) SONT REPÉRÉES ET PROPOSÉES — JAMAIS FUSIONNÉES SEULES
-- (09/10 soir, audit eBay — cas 5, le Xbox de XEWER ; GO de Nico « à la racine »)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cas 5 : la fiche Vinted du Xbox (1791388026133002, née du dressing, déjà vendue)
-- et la fiche née du relevé Leboncoin (1791388213169, même photo) ont vécu côte à
-- côte ; la seconde portait un « à vérifier » (homonyme_vendu) qui ne se voit qu'en
-- stock — elle est passée « vendue » par le bandeau eBay : deux ventes, un objet.
-- Le moteur v3 (08/10) n'aurait plus fait naître cette paire, mais trois trous
-- restent ouverts (enquête du 09/10) : fiches-main ignore une fiche VENDUE ;
-- app/app et app/relevé ne sont jamais comparées ; aucune passe ne rejuge deux
-- fiches qui existent déjà toutes les deux (crons 17 et 22 coupés depuis le 28/09).
-- Mesuré le 09/10 : 45 paires même photo, sans question, sur 10 comptes (dont 9
-- « vendue / en stock », 6 avec une copie encore en ligne).
--
-- LA RÈGLE : deux fiches du même compte dont la PREMIÈRE PHOTO a la même
-- empreinte (phash) reçoivent la question qui existe déjà — jamais une fusion :
--   · en stock / en stock → « Est-ce le même article ? » (motif photo_identique,
--     écran des doublons) ;
--   · vendue / en stock → « Déjà vendu ? » (motif homonyme_vendu, garde = la
--     vendue : bandeau « Déjà vendu ? ») — un second exemplaire réel se dit
--     « Non » (et la garde inventaire_doublons_jamais_deux_exemplaires filtre les
--     cas prouvés) ;
--   · vinted / vinted : deux annonces Vinted = deux exemplaires (exclu) ;
--   · vendue / vendue : rien (« une vente, une fois » est la règle des ventes).
-- Une paire déjà posée, refusée ou tranchée n'est JAMAIS reposée (index unique
-- inventaire_doublons_paire). Au plus p_limite questions par appel ; appelée par
-- la fonction `rapprochement` en fin de passe d'un compte (comptes que la passe
-- traite déjà) — aucun cron nouveau. Mesure : la requête du parc entier tient en
-- ~1 s (enquête), quelques ms par compte.
-- Inverse : DROP FUNCTION (scripts/reparations/20261009_inverse_fiches_meme_photo.sql).
CREATE OR REPLACE FUNCTION public.fiches_meme_photo_questions(p_user uuid, p_limite integer DEFAULT 20)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '3s'
AS $function$
DECLARE
  n integer := 0; v_n integer; r record;
BEGIN
  IF p_user IS NULL OR coalesce(p_limite, 0) <= 0 THEN RETURN 0; END IF;
  FOR r IN
    WITH f AS (
      SELECT i.id, i.statut, e.phash, (i.vinted_item_id IS NOT NULL OR coalesce(i.origine, '') = 'vinted_sync') AS vinted
        FROM inventaire i JOIN photo_empreintes e ON e.url = i.photos ->> 0
       WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
         AND jsonb_typeof(i.photos) = 'array' AND e.phash IS NOT NULL AND e.phash !~ '^(0+|f+)$')
    SELECT a.id AS a_id, a.statut AS sa, b.id AS b_id, b.statut AS sb
      FROM f a JOIN f b ON a.phash = b.phash AND a.id < b.id
     WHERE NOT (a.vinted AND b.vinted)
       AND NOT (a.statut = 'vendu' AND b.statut = 'vendu')
       AND NOT EXISTS (SELECT 1 FROM inventaire_doublons d WHERE d.user_id = p_user
                        AND d.motif IS DISTINCT FROM 'copie_non_prouvee'
                        AND least(d.garde, d.absorbe) = a.id AND greatest(d.garde, d.absorbe) = b.id)
     ORDER BY a.id, b.id
     LIMIT p_limite
  LOOP
    INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
    VALUES (p_user,
            CASE WHEN r.sb = 'vendu' THEN r.b_id ELSE r.a_id END,
            CASE WHEN r.sb = 'vendu' THEN r.a_id ELSE r.b_id END,
            'probable', 'proposee',
            CASE WHEN 'vendu' IN (r.sa, r.sb) THEN 'homonyme_vendu' ELSE 'photo_identique' END,
            jsonb_build_object('regle', 'meme_photo_fiches', 'photo', 'phash_identique'), 'meme_photo')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    n := n + v_n;
  END LOOP;
  RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION public.fiches_meme_photo_questions(uuid, integer) FROM PUBLIC, anon, authenticated;
