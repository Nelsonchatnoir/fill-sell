-- APPLIQUÉE le 29/09/2026 à 23:59:54 (GO de nuit de Nico, geste 3).
--
-- josephinecerni : son relevé Beebs de 21:52 a importé 21 annonces comme
-- fiches neuves (origine releve_beebs + 21 jobs « releve-annonces »), alors
-- qu'elles étaient ses propres dépôts FillSell sans identifiant.
-- Pour chaque paire : l'annonce relevée est rattachée à la FICHE D'ORIGINE et
-- à son DÉPÔT (le dépôt reçoit le numéro exact et le lien du relevé), puis le
-- job « releve-annonces » et la fiche en double sont supprimés.
--   · 16 paires uniques : liste validée par Nico ;
--   · 3 « Jeans fille 10 ans » (1 €) et 2 « Short femme TeX 38 » (2 €) :
--     décision de Nico, ordre des dépôts (publiés 20:37, 20:46, 20:47 ;
--     21:05, 21:09) et ordre des numéros Beebs.
-- Aucun retrait : fillsell.sans_retrait = '1' (sinon le trigger
-- inventaire_arme_retraits_avant_suppression armait le retrait de l'annonce
-- portée par le job « releve-annonces »), et le job est supprimé avant la fiche.
-- La garde cross_post_jobs_lien_jamais_croise est restée active (0 refus).
--
-- Rejeu annulé avant application : 21 jobs supprimés, 21 annonces rattachées,
-- 21 dépôts numérotés, 21 fiches supprimées, stock 362 → 341, 0 retrait,
-- 0 lien refusé, 0 usage_logs, 0 annonce visible, 0 question, 0 photo de fiche
-- d'origine modifiée, autres jobs du compte inchangés.
-- Relecture après : identique (21/21/0/0, stock 341, 0 retrait, 0 question).
--
-- ⚠️ INVERSE : la partie dépôts/annonces se défait (voir supabase/rollbacks) ;
-- les 21 fiches en double et leurs 21 jobs n'ont PAS été copiés avant
-- suppression. Les recréer = réimporter l'annonce (rapprocher_importer lit la
-- capture toujours présente dans annonces_plateforme), pas une restauration
-- à l'identique.

SET statement_timeout = '20s';
SET lock_timeout = '1s';
DO $geste$
DECLARE
  v_user uuid;
  r record;
  n_jobs_suppr integer := 0; n_annonces integer := 0; n_depots integer := 0; n_fiches integer := 0; k integer;
  n_retraits integer; n_lien_refuse integer;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE email = 'josephinecerni@gmail.com';
  PERFORM set_config('fillsell.sans_retrait', '1', true);
  CREATE TEMP TABLE _m (depot text, origine bigint, listing text, doublon bigint) ON COMMIT DROP;
  INSERT INTO _m VALUES
   ('b51dd5cd',1787440315560006,'34076808',1790711917643),('27ef9063',1787440314926003,'34076827',1790711915398),
   ('71eb5f55',1787440314926002,'34076845',1790711918217),('d02caef4',1787440314926000,'34076885',1790711918115),
   ('5d4a7c27',1787440314211007,'34076906',1790711917568),('f13fa9ca',1787440314211006,'34076922',1790711918032),
   ('a87775d4',1787440314211000,'34076982',1790711913943),('7dd0df27',1787440313475007,'34077013',1790711918376),
   ('70027c8e',1787440313475004,'34077027',1790711917799),('3a29a497',1787440313475005,'34077062',1790711917705),
   ('3a0ad106',1787440313475001,'34077119',1790711916031),('7cd1049d',1787440275607004,'34077131',1790711914448),
   ('4e1c2e86',1787440274987003,'34077144',1790711914772),('197cdba2',1787440274333007,'34077152',1790711915134),
   ('597ce5b0',1787440274333003,'34077165',1790711915850),('6dece53d',1787440316271001,'34077196',1790711915270),
   ('e7918a40',1787440314926001,'34076870',1790711917458),('c96f744c',1787440314211005,'34076941',1790711918298),
   ('9989b232',1787440314211004,'34076950',1790711917954),('db3a873f',1787440313475003,'34077070',1790711917877),
   ('3ebe1baf',1787440313475002,'34077101',1790711917317);

  FOR r IN
    SELECT m.*, d.id AS depot_id, d.platform_fields AS pf, a.id AS annonce_id, a.url AS annonce_url, rj.id AS releve_id
      FROM _m m
      JOIN cross_post_jobs d ON d.id::text LIKE m.depot || '%' AND d.user_id = v_user AND d.platform = 'beebs'
                            AND d.status = 'published' AND d.inventaire_id = m.origine
                            AND d.listing_url IS NULL AND d.platform_listing_id IS NULL
      JOIN annonces_plateforme a ON a.user_id = v_user AND a.platform = 'beebs' AND a.listing_id = m.listing
                                AND a.inventaire_id = m.doublon AND a.disparu_le IS NULL
      JOIN cross_post_jobs rj ON rj.user_id = v_user AND rj.inventaire_id = m.doublon AND rj.platform = 'beebs'
                             AND rj.handler_build = 'releve-annonces' AND rj.platform_listing_id = m.listing
  LOOP
    DELETE FROM cross_post_jobs WHERE id = r.releve_id; GET DIAGNOSTICS k = ROW_COUNT; n_jobs_suppr := n_jobs_suppr + k;
    UPDATE annonces_plateforme SET inventaire_id = r.origine, job_id = r.depot_id, source_rapprochement = 'job',
           proposition = NULL, updated_at = now()
     WHERE id = r.annonce_id; GET DIAGNOSTICS k = ROW_COUNT; n_annonces := n_annonces + k;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, r.annonce_id, r.origine, 'attache', 'job', 1, jsonb_build_object(
      'motif', 'incident_beebs_2909_nettoyage_doublon', 'job_id', r.depot_id, 'listing_id', r.listing,
      'fiche_doublon_supprimee', r.doublon, 'job_releve_supprime', r.releve_id,
      'decision', 'GO de nuit de Nico (paires uniques : liste validée ; jeans/shorts : ordre des dépôts et des numéros)'));
    UPDATE cross_post_jobs SET listing_url = r.annonce_url, platform_listing_id = r.listing,
           platform_fields = (COALESCE(r.pf, '{}'::jsonb) - ARRAY['lien_en_attente', 'identifiant_beebs_non_prouve', 'candidat_identifiant_beebs', 'attente_identifiant_beebs', 'listing_url_abandon'])
             || jsonb_build_object('lien_par_decision_incident_2909', jsonb_build_object(
                  'at', now(), 'listing_id', r.listing, 'annonce_id', r.annonce_id,
                  'regle', 'annonce relevée rattachée au dépôt par décision de Nico (nettoyage des doublons du relevé 21:52)'))
     WHERE id = r.depot_id AND listing_url IS NULL AND platform_listing_id IS NULL; GET DIAGNOSTICS k = ROW_COUNT; n_depots := n_depots + k;
    DELETE FROM inventaire WHERE id = r.doublon AND user_id = v_user AND origine = 'releve_beebs'
       AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = r.doublon)
       AND NOT EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.inventaire_id = r.doublon);
    GET DIAGNOSTICS k = ROW_COUNT; n_fiches := n_fiches + k;
  END LOOP;

  SELECT count(*) INTO n_retraits FROM cross_post_jobs WHERE user_id = v_user AND action = 'delete' AND created_at = now();
  SELECT count(*) INTO n_lien_refuse FROM cross_post_jobs WHERE user_id = v_user AND platform_fields -> 'lien_refuse' ->> 'le' IS NOT NULL
     AND (platform_fields -> 'lien_refuse' ->> 'le')::timestamptz = now();
  -- Rejoué une seconde fois, la boucle ne trouve plus rien (0 partout) : sans effet.
  IF (n_jobs_suppr, n_annonces, n_depots, n_fiches) NOT IN ((21, 21, 21, 21), (0, 0, 0, 0)) OR n_retraits <> 0 OR n_lien_refuse <> 0 THEN
    RAISE EXCEPTION 'ARRÊT, rien gardé : % % % % retraits % refus %', n_jobs_suppr, n_annonces, n_depots, n_fiches, n_retraits, n_lien_refuse;
  END IF;
END
$geste$;
