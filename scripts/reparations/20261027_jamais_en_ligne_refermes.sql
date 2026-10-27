-- (27/10) Réparation : les lignes « jamais mises en ligne » jugées AVANT la règle 20261027100000 (rapport
-- docs/enquetes/jamais-en-ligne-2710/RAPPORT.md). Rien n'est réparé « à la main » : c'est la règle qui passe.
--   1. La règle (depot_jamais_en_ligne_refermer, migration 20261027100000) passe sur chaque compte × plateforme qui
--      porte une ligne en échec « jamais en ligne ». Relu le 27/10 : 11 lignes, une seule a son article en ligne —
--      BONCOIN (boncoin59300@), job aea284ac, GTA IV Xbox 360 : dépôt 3294665225 jamais vu, article en ligne sous
--      3295468043 (même fiche 1792855407839006, Leboncoin, même compte ; rattachée le 26/10 à 16:57 par le relevé
--      941f3088, suivie par le job 21d6091f) → close sans rouge.
--   2. Les autres gardent leur échec (article en ligne nulle part, numéro absent de tout relevé), mais leur motif dit
--      ce qu'on sait — le texte que la règle écrit désormais, avec LES MÊMES relevés : plus de « refusée par sa
--      modération » (6 Leboncoin + 1 eBay) ni de « refusée par sa vérification, ou retirée » (4 Beebs).
-- Gardes : la migration appliquée (la fonction existe) ; sauvegarde protégée avant ; 11 à 25 lignes, la GTA dedans ;
-- une ligne dont les dates du motif ne se retrouvent pas dans ses relevés fait tout annuler. Aucune vente, aucun
-- retrait, aucun redépôt, aucun mail, aucun quota (lignes failed, réservations soldées au jugement).
-- Inverse : scripts/reparations/20261027_jamais_en_ligne_refermes_INVERSE.sql (depuis la sauvegarde).
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE public._backup_2710_jamais_en_ligne AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c
   WHERE c.status = 'failed' AND COALESCE(c.action, 'publish') = 'publish'
     AND COALESCE(c.platform_fields, '{}'::jsonb) ? 'depot_jamais_en_ligne';
ALTER TABLE public._backup_2710_jamais_en_ligne ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2710_jamais_en_ligne FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record; b jsonb; m integer; n_regle integer := 0; n_texte integer := 0;
  v_nom text; v_p text; v_s text; v_new text;
  v_gta uuid := 'aea284ac-5614-47b7-8473-8edcb27dfcb4';
BEGIN
  IF to_regprocedure('public.depot_jamais_en_ligne_refermer(uuid,text,bigint,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'migration 20261027100000 non appliquée : la règle depot_jamais_en_ligne_refermer est absente';
  END IF;
  SELECT count(*) INTO m FROM public._backup_2710_jamais_en_ligne;
  IF m < 11 OR m > 25 OR NOT EXISTS (SELECT 1 FROM public._backup_2710_jamais_en_ligne WHERE id = v_gta) THEN
    RAISE EXCEPTION 'sauvegarde : 11 à 25 lignes avec la GTA attendues, % lues', m;
  END IF;

  -- 1. La règle, compte par compte.
  FOR r IN SELECT DISTINCT user_id, platform FROM public._backup_2710_jamais_en_ligne LOOP
    b := public.depot_jamais_en_ligne_refermer(r.user_id, r.platform, NULL, NULL, NULL);
    RAISE NOTICE 'règle % % : %', r.user_id, r.platform, b;
  END LOOP;
  UPDATE public.cross_post_jobs c SET platform_fields = c.platform_fields || jsonb_build_object(
           'reparation_2710_jamais_en_ligne', jsonb_build_object('le', now(), 'par', 'regle', 'statut_avant', s.status))
    FROM public._backup_2710_jamais_en_ligne s
   WHERE c.id = s.id AND c.status IS DISTINCT FROM s.status;
  GET DIAGNOSTICS n_regle = ROW_COUNT;
  IF NOT EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE id = v_gta AND status = 'cancelled'
                    AND platform_fields #>> '{depot_jamais_en_ligne,annonce_en_ligne}' = '3295468043'
                    AND platform_fields #>> '{depot_jamais_en_ligne,issue}' = 'article_en_ligne_ailleurs') THEN
    RAISE EXCEPTION 'la GTA (aea284ac) n''a pas été refermée par la règle';
  END IF;

  -- 2. Les motifs des lignes restées en échec : ce qu'on sait, avec leurs relevés.
  FOR r IN
    SELECT c.id, c.platform, c.error, c.platform_fields -> 'depot_jamais_en_ligne' AS d
      FROM public.cross_post_jobs c JOIN public._backup_2710_jamais_en_ligne s ON s.id = c.id
     WHERE c.status = 'failed' AND c.error ~ 'refusée par sa modération|refusée par sa vérification'
  LOOP
    v_nom := CASE r.platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay'
                             WHEN 'depop' THEN 'Depop' ELSE r.platform END;
    SELECT to_char(COALESCE(x.finished_at, x.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI') INTO v_p
      FROM public.vinted_sync_runs x WHERE x.id = (r.d ->> 'premier')::uuid;
    SELECT to_char(COALESCE(x.finished_at, x.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI') INTO v_s
      FROM public.vinted_sync_runs x WHERE x.id = (r.d ->> 'second')::uuid;
    IF v_p IS NULL OR v_s IS NULL OR position(('relevés du ' || v_p || ' et du ' || v_s) IN r.error) = 0 THEN
      RAISE EXCEPTION 'job % : les relevés du motif (%, %) ne se retrouvent pas', r.id, v_p, v_s;
    END IF;
    v_new := CASE WHEN r.platform = 'beebs' AND r.error LIKE '%trois jours après le dépôt%'
                  THEN 'Trois jours après le dépôt, cette annonce n''était ni en ligne ni « en vérification » dans tes annonces Beebs'
                  WHEN r.platform = 'beebs'
                  THEN 'Sept jours après le dépôt, cette annonce n''est ni en ligne ni « en vérification » dans tes annonces Beebs'
                  ELSE 'Cette annonce est absente de tes annonces ' || v_nom END
      || ' aux relevés complets du ' || v_p || ' et du ' || v_s || ', et ' || v_nom || ' n''a donné aucun motif. '
      || CASE WHEN NULLIF(r.d ->> 'doublon_photo_de', '') IS NOT NULL
              THEN 'Elle porte la même photo que ton annonce ' || (r.d ->> 'doublon_photo_de') || ', déjà en ligne sur ' || v_nom || '. '
              ELSE '' END
      || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.';
    UPDATE public.cross_post_jobs SET error = v_new,
           platform_fields = platform_fields || jsonb_build_object('reparation_2710_jamais_en_ligne',
             jsonb_build_object('le', now(), 'par', 'texte', 'statut_avant', 'failed', 'erreur_avant', r.error))
     WHERE id = r.id AND status = 'failed';
    GET DIAGNOSTICS m = ROW_COUNT; n_texte := n_texte + m;
  END LOOP;
  RAISE NOTICE 'réparation 27/10 : % ligne(s) refermée(s) par la règle, % motif(s) réécrit(s)', n_regle, n_texte;
END $$;
COMMIT;
