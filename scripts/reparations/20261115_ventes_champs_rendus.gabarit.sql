-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 15/11/2026 (décision (a) de Nico, point 4 — ventes effacées) : LES CHAMPS PERDUS DES VENTES RENDUES, REPRIS DES SAUVEGARDES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- FICHIER FABRIQUÉ par 20261115_ventes_champs_rendus_generer.mjs (gabarit : 20261115_ventes_champs_rendus.gabarit.sql).
-- Les valeurs ci-dessous ont été LUES dans deux copies temporaires des sauvegardes quotidiennes de Supabase (« Restore to
-- a new project », lecture seule) : 08/11 04:20 UTC pour ayadi007 (cfdfda6f), 13/11 04:24 UTC pour noubliejamais
-- (2c89e573). jlovertab : ses 17 ventes sont nées le 08/11 APRÈS la sauvegarde et ont été effacées avant la suivante —
-- aucune sauvegarde ne les a ; goks2725 et jocaille270779 : aucune sauvegarde assez ancienne.
--
-- Règles de Nico :
--   · QUE les champs perdus : prix d'achat, frais (selling_fees, frais_plateforme), marge (benefice), marque, lien vers la
--     fiche — sur les ventes déjà rendues (restauration du 15/11 12:27:54 et doutes remis), appariées par leur id
--     d'origine ET leur numéro de commande ET leur prix de vente ; jamais par le titre ;
--   · rien d'écrasé : un champ rempli depuis la restauration garde sa valeur (la marge n'est reprise que si le prix
--     d'achat est encore vide) ;
--   · le lien vers la fiche : seulement vers LA fiche du compte qui porte le même numéro d'annonce Vinted, unique, déjà
--     « vendu », reliée à aucune autre vente ; sinon pas de lien (et la raison est gardée) ;
--   · rien ne se déclenche : aucun déclencheur UPDATE sur ventes (vérifié, sinon refus) ; push_ventes, cross_post_jobs,
--     inventaire et email_logs relus avant/après : identiques, sinon rien n'est écrit. Aucune fiche n'est modifiée.
-- Sauvegarde : public._backup_1511c_ventes_champs_rendus (avant / lu / lien, ligne par ligne). Inverse : …_INVERSE.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1511c_ventes_champs_rendus') IS NOT NULL THEN
    RAISE EXCEPTION 'déjà joué (_backup_1511c_ventes_champs_rendus existe) : rien n''est écrit';
  END IF;
  IF to_regclass('public._backup_1511b_ventes_doutes') IS NULL THEN
    RAISE EXCEPTION 'les doutes d''abord (20261115_ventes_doutes_remises.sql) : rien n''est écrit';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.ventes'::regclass AND NOT tgisinternal AND (tgtype::int & 16) <> 0) THEN
    RAISE EXCEPTION 'un déclencheur UPDATE existe sur ventes : rien n''est écrit, à relire';
  END IF;
END
$garde$;

CREATE TEMP TABLE _champs_lus (id bigint PRIMARY KEY, compte text, commande_ref text, prix_vente numeric, prix_achat numeric,
  benefice numeric, selling_fees numeric, frais_plateforme numeric, marque text, fiche_num text, copie text) ON COMMIT DROP;
INSERT INTO _champs_lus VALUES
-- @VALEURS@

CREATE TABLE public._backup_1511c_ventes_champs_rendus AS
WITH cibles AS (
  SELECT vente_id FROM public._backup_1511_ventes_reinitialisation WHERE decision = 'restauree'
  UNION SELECT vente_id FROM public._backup_1511b_ventes_doutes WHERE decision = 'remise'
),
a AS (
  SELECT v.id, v.user_id, s.copie, s.fiche_num,
         v.prix_achat AS prix_achat_avant, v.benefice AS benefice_avant, v.selling_fees AS selling_fees_avant,
         v.frais_plateforme AS frais_plateforme_avant, v.marque AS marque_avant, v.inventaire_id AS inventaire_id_avant,
         s.prix_achat AS prix_achat_lu, s.benefice AS benefice_lu, s.selling_fees AS selling_fees_lu,
         s.frais_plateforme AS frais_plateforme_lu, s.marque AS marque_lu,
         (SELECT min(i.id) FROM public.inventaire i WHERE i.user_id = v.user_id AND i.vinted_item_id = s.fiche_num) AS fiche_id,
         (SELECT count(*) FROM public.inventaire i WHERE i.user_id = v.user_id AND i.vinted_item_id = s.fiche_num) AS fiches_du_numero,
         (SELECT min(i.statut) FROM public.inventaire i WHERE i.user_id = v.user_id AND i.vinted_item_id = s.fiche_num) AS fiche_statut
    FROM _champs_lus s
    JOIN public.ventes v ON v.id = s.id AND left(v.user_id::text, 8) = s.compte
     AND v.commande_ref IS NOT DISTINCT FROM s.commande_ref AND v.prix_vente = s.prix_vente
   WHERE v.id IN (SELECT vente_id FROM cibles)
)
SELECT now() AS sauve_le, a.*,
       CASE
         WHEN a.fiche_num IS NULL THEN NULL
         WHEN a.inventaire_id_avant IS NOT NULL THEN 'deja_reliee'
         WHEN a.fiche_id IS NULL THEN 'fiche_absente'
         WHEN a.fiches_du_numero > 1 THEN 'plusieurs_fiches'
         WHEN a.fiche_statut IS DISTINCT FROM 'vendu' THEN 'fiche_pas_vendue'
         WHEN EXISTS (SELECT 1 FROM public.ventes w WHERE w.inventaire_id = a.fiche_id) THEN 'fiche_deja_a_une_vente'
         WHEN count(*) OVER (PARTITION BY a.fiche_id) > 1 THEN 'fiche_pour_plusieurs_ventes'
         ELSE 'reliee'
       END AS lien
  FROM a;
ALTER TABLE public._backup_1511c_ventes_champs_rendus ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1511c_ventes_champs_rendus FROM PUBLIC, anon, authenticated;

DO $rendre$
DECLARE
  -- Les ventes lues dans les copies, par compte : toutes doivent être retrouvées par id + commande + prix, sinon refus.
  v_attendus constant jsonb := '@ATTENDUS@';
  v_lus jsonb;
  v_comptes uuid[];
  v_n integer;
  v_avant jsonb;
  v_apres jsonb;
BEGIN
  SELECT jsonb_object_agg(u, n) INTO v_lus
    FROM (SELECT left(user_id::text, 8) u, count(*) n FROM public._backup_1511c_ventes_champs_rendus GROUP BY 1 ORDER BY 1) x;
  IF v_lus IS DISTINCT FROM v_attendus THEN
    RAISE EXCEPTION 'ventes retrouvées % au lieu de % (id + commande + prix) : rien n''est écrit, à relire', v_lus, v_attendus;
  END IF;
  SELECT array_agg(DISTINCT user_id) INTO v_comptes FROM public._backup_1511c_ventes_champs_rendus;
  SELECT jsonb_build_object(
    'push_ventes', (SELECT count(*) FROM public.push_ventes WHERE user_id = ANY (v_comptes)),
    'cross_post_jobs', (SELECT count(*) FROM public.cross_post_jobs WHERE user_id = ANY (v_comptes)),
    'inventaire', (SELECT count(*) || ':' || coalesce(sum(hashtext(id::text || coalesce(statut, ''))), 0) FROM public.inventaire WHERE user_id = ANY (v_comptes)),
    'email_logs', (SELECT count(*) FROM public.email_logs WHERE user_id = ANY (v_comptes))) INTO v_avant;
  UPDATE public.ventes v
     SET prix_achat       = CASE WHEN v.prix_achat IS NULL THEN b.prix_achat_lu ELSE v.prix_achat END,
         benefice         = CASE WHEN v.benefice IS NULL AND v.prix_achat IS NULL THEN b.benefice_lu ELSE v.benefice END,
         selling_fees     = coalesce(v.selling_fees, b.selling_fees_lu),
         frais_plateforme = coalesce(v.frais_plateforme, b.frais_plateforme_lu),
         marque           = coalesce(v.marque, b.marque_lu),
         inventaire_id    = CASE WHEN v.inventaire_id IS NULL AND b.lien = 'reliee' THEN b.fiche_id ELSE v.inventaire_id END
    FROM public._backup_1511c_ventes_champs_rendus b
   WHERE b.id = v.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  SELECT jsonb_build_object(
    'push_ventes', (SELECT count(*) FROM public.push_ventes WHERE user_id = ANY (v_comptes)),
    'cross_post_jobs', (SELECT count(*) FROM public.cross_post_jobs WHERE user_id = ANY (v_comptes)),
    'inventaire', (SELECT count(*) || ':' || coalesce(sum(hashtext(id::text || coalesce(statut, ''))), 0) FROM public.inventaire WHERE user_id = ANY (v_comptes)),
    'email_logs', (SELECT count(*) FROM public.email_logs WHERE user_id = ANY (v_comptes))) INTO v_apres;
  IF v_apres IS DISTINCT FROM v_avant THEN
    RAISE EXCEPTION 'les champs rendus ont fait bouger autre chose (% → %) : rien n''est écrit', v_avant, v_apres;
  END IF;
  IF v_n <> @N@ THEN RAISE EXCEPTION 'ventes complétées : % sur @N@ prévues : rien n''est écrit', v_n; END IF;
  RAISE NOTICE 'ventes complétées : % ; aucun push, aucune tâche, aucun article, aucun mail (avant = après : %)', v_n, v_apres;
END
$rendre$;

SELECT left(b.user_id::text, 8) AS compte, count(*) AS ventes,
       count(*) FILTER (WHERE b.prix_achat_avant IS NULL AND b.prix_achat_lu IS NOT NULL) AS prix_achat_rendus,
       count(*) FILTER (WHERE b.benefice_avant IS NULL AND b.prix_achat_avant IS NULL AND b.benefice_lu IS NOT NULL) AS marges_rendues,
       count(*) FILTER (WHERE (b.selling_fees_avant IS NULL AND b.selling_fees_lu IS NOT NULL)
                           OR (b.frais_plateforme_avant IS NULL AND b.frais_plateforme_lu IS NOT NULL)) AS frais_rendus,
       count(*) FILTER (WHERE b.marque_avant IS NULL AND b.marque_lu IS NOT NULL) AS marques_rendues,
       count(*) FILTER (WHERE b.lien = 'reliee') AS fiches_reliees,
       count(*) FILTER (WHERE b.lien IS NOT NULL AND b.lien <> 'reliee') AS fiches_non_reliees,
       string_agg(DISTINCT b.lien, ', ') FILTER (WHERE b.lien IS NOT NULL AND b.lien <> 'reliee') AS raisons
  FROM public._backup_1511c_ventes_champs_rendus b GROUP BY 1 ORDER BY 1;
COMMIT;
