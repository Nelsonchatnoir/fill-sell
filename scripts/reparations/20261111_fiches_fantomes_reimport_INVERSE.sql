-- INVERSE de 20261111_fiches_fantomes_reimport.sql (11/11/2026, L1) : les 7 fiches reviennent, depuis la sauvegarde
-- complète public._backup_1111_fiches_fantomes, et chaque ligne qui les désignait reprend sa clé de fiche.
--   · les fiches : réinsérées telles quelles (mêmes identifiants, mêmes colonnes). Une fiche née d'un relevé ne s'insère
--     que sur décision (inventaire_releve_par_decision) : la restauration « par nous seulement » est explicite, dans
--     cette transaction (fillsell.import_releve = on, le chemin dit par la garde elle-même) ;
--   · dépôts, annonces relevées, rapprochements, conversations, commandes, relevés et captures Vinted : leur
--     inventaire_id d'avant, seulement s'il est encore NULL (une ligne rattachée depuis à une autre fiche n'est pas reprise) ;
--   · fiches_annonce (supprimées en CASCADE) : réinsérées.
-- Rien n'est publié ni retiré : les dépôts restent clos, les annonces restent retirées.
-- Limite dite (banc 20261111140000) : les colonnes de trace posées par les déclencheurs à l'insertion (prix_vente_change_le,
-- poids_change_le, …) prennent l'heure de la restauration.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
DECLARE v_n integer;
BEGIN
  IF to_regclass('public._backup_1111_fiches_fantomes') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde absente : le script n''a pas été passé, rien à défaire';
  END IF;
  SELECT count(*) INTO v_n FROM public.inventaire i
    JOIN public._backup_1111_fiches_fantomes b ON b.t = 'inventaire' AND i.id = b.cle::bigint;
  IF v_n <> 0 THEN RAISE EXCEPTION '% fiche(s) existent déjà : rien n''est écrit', v_n; END IF;
END
$garde$;

SELECT set_config('fillsell.import_releve', 'on', true);
INSERT INTO public.inventaire
SELECT (jsonb_populate_record(NULL::public.inventaire, b.ligne)).*
  FROM public._backup_1111_fiches_fantomes b WHERE b.t = 'inventaire';
SELECT set_config('fillsell.import_releve', '', true);

UPDATE public.cross_post_jobs x SET inventaire_id = (b.ligne ->> 'inventaire_id')::bigint
  FROM public._backup_1111_fiches_fantomes b WHERE b.t = 'cross_post_jobs' AND x.id::text = b.cle AND x.inventaire_id IS NULL;
UPDATE public.annonces_plateforme x SET inventaire_id = (b.ligne ->> 'inventaire_id')::bigint
  FROM public._backup_1111_fiches_fantomes b WHERE b.t = 'annonces_plateforme' AND x.id::text = b.cle AND x.inventaire_id IS NULL;
UPDATE public.rapprochements x SET inventaire_id = (b.ligne ->> 'inventaire_id')::bigint
  FROM public._backup_1111_fiches_fantomes b WHERE b.t = 'rapprochements' AND x.id::text = b.cle AND x.inventaire_id IS NULL;
UPDATE public.messagerie_conversations x SET inventaire_id = (b.ligne ->> 'inventaire_id')::bigint
  FROM public._backup_1111_fiches_fantomes b WHERE b.t = 'messagerie_conversations' AND x.id::text = b.cle AND x.inventaire_id IS NULL;
UPDATE public.plateforme_commandes x SET inventaire_id = (b.ligne ->> 'inventaire_id')::bigint
  FROM public._backup_1111_fiches_fantomes b WHERE b.t = 'plateforme_commandes' AND x.id::text = b.cle AND x.inventaire_id IS NULL;
UPDATE public.vinted_listing_snapshots x SET inventaire_id = (b.ligne ->> 'inventaire_id')::bigint
  FROM public._backup_1111_fiches_fantomes b WHERE b.t = 'vinted_listing_snapshots' AND x.id::text = b.cle AND x.inventaire_id IS NULL;
UPDATE public.vinted_republish_captures x SET inventaire_id = (b.ligne ->> 'inventaire_id')::bigint
  FROM public._backup_1111_fiches_fantomes b WHERE b.t = 'vinted_republish_captures' AND x.id::text = b.cle AND x.inventaire_id IS NULL;
INSERT INTO public.fiches_annonce
SELECT (jsonb_populate_record(NULL::public.fiches_annonce, b.ligne)).*
  FROM public._backup_1111_fiches_fantomes b WHERE b.t = 'fiches_annonce'
ON CONFLICT DO NOTHING;

INSERT INTO public.usage_logs (user_id, feature, metadata)
SELECT (b.ligne ->> 'user_id')::uuid, 'restauration_article', jsonb_build_object(
         'chemin', 'intervention_support', 'n_articles', count(*), 'articles', jsonb_agg(b.cle ORDER BY b.cle),
         'motif', 'inverse_fiche_fantome_reimport_1111')
  FROM public._backup_1111_fiches_fantomes b WHERE b.t = 'inventaire'
 GROUP BY b.ligne ->> 'user_id';

SELECT b.t, count(*) AS sauvegardees,
       count(*) FILTER (WHERE CASE b.t
         WHEN 'inventaire' THEN EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id::text = b.cle)
         WHEN 'cross_post_jobs' THEN EXISTS (SELECT 1 FROM public.cross_post_jobs x WHERE x.id::text = b.cle AND x.inventaire_id = (b.ligne ->> 'inventaire_id')::bigint)
         WHEN 'annonces_plateforme' THEN EXISTS (SELECT 1 FROM public.annonces_plateforme x WHERE x.id::text = b.cle AND x.inventaire_id = (b.ligne ->> 'inventaire_id')::bigint)
         WHEN 'rapprochements' THEN EXISTS (SELECT 1 FROM public.rapprochements x WHERE x.id::text = b.cle AND x.inventaire_id = (b.ligne ->> 'inventaire_id')::bigint)
         ELSE true END) AS restaurees
  FROM public._backup_1111_fiches_fantomes b GROUP BY b.t ORDER BY b.t;

COMMIT;
