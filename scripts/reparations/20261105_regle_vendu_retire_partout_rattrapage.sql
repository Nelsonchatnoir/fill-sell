-- (05/11 soir, clôture, point 1 b — ordre de Nico : « VENDU QUELQUE PART = RETIRÉ PARTOUT », règle appliquée aux cas existants
-- par le CIRCUIT NORMAL de l'app — jobs de retrait —, jamais par une réparation à la main). Avant chaque retrait, l'annonce a
-- été RELUE sur la plateforme le 05/11 vers 22:10 et confirmée comme le MÊME article déjà vendu (titre, prix, photo) :
--  1. Doudou « Marie les Aristochats gris et blanc » (nicolas.menar 39bfa95a, fiche 1790106697754007) : vendu sur Vinted le
--     06/10 (10101127941 « Vendu », même titre, même prix 24 €, même photo) ; Beebs 34032772 EN VENTE (« Ajouter au
--     panier », 24 €) → le « Oui, la retirer » de SA question ouverte depuis le 06/10 (60621113, copie_non_prouvee).
--  2. Montre « Swatch skin sfb101 pureline 1996 » (boncoin59300) : vendue sur Leboncoin (3184771753 « Article vendu », 40 €) ;
--     Beebs 33145728 EN VENTE (40 €) → retrait du dépôt Beebs 232ab851 (rattaché par photo identique : retrait d'office).
-- NON traité ici (rapport docs/enquetes/rattachements-0511/VENDU-RETIRE-PARTOUT.md) : Leboncoin 3274924341 du Doudou (aucun
-- geste sûr avant la migration 20261105240000 : tous viseraient le « Lot 2 doudous » 3267000921 porté par le même dépôt) ;
-- le lot 3267000921 (question à Nico) ; le T-shirt Friends (à relire).
-- Sauvegarde : public._backup_0511_vendu_retire_partout. Inverse : 20261105_regle_vendu_retire_partout_rattrapage_INVERSE.sql.
BEGIN;
DO $garde$
BEGIN
  IF to_regclass('public._backup_0511_vendu_retire_partout') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé (_backup_0511_vendu_retire_partout existe) : rien n''est écrit';
  END IF;
END $garde$;
CREATE TABLE public._backup_0511_vendu_retire_partout AS
SELECT now() AS le, 'inventaire_doublons' AS t, d.id::text AS cle, to_jsonb(d.*) AS ligne, NULL::uuid AS retrait_cree
  FROM public.inventaire_doublons d WHERE d.id = '60621113-83d7-4258-8236-fc758effe593'
UNION ALL
SELECT now(), 'cross_post_jobs', j.id::text, to_jsonb(j.*), NULL::uuid
  FROM public.cross_post_jobs j WHERE j.id = '232ab851-75e7-48bd-8fbc-3cc4efd7fb83';
ALTER TABLE public._backup_0511_vendu_retire_partout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0511_vendu_retire_partout FROM PUBLIC, anon, authenticated;

-- 1. Doudou : le « Oui, la retirer » de la question ouverte (l'annonce montrée : 285e5620, Beebs 34032772).
SELECT public.inventaire_doublon_decider('60621113-83d7-4258-8236-fc758effe593'::uuid, 'oui',
  '285e5620-fc56-43f9-8503-52c268dd8b08'::uuid) AS doudou_beebs;
-- 2. Swatch : le retrait du dépôt Beebs prouvé, par le chemin normal.
UPDATE public._backup_0511_vendu_retire_partout b
   SET retrait_cree = public.armer_retrait_job_pour('232ab851-75e7-48bd-8fbc-3cc4efd7fb83'::uuid,
                        'rattrapage_vendu_retire_partout', '0'::interval, false)
 WHERE b.t = 'cross_post_jobs' AND b.cle = '232ab851-75e7-48bd-8fbc-3cc4efd7fb83';

-- Les retraits armés (les deux fiches), à suivre :
SELECT j.id, j.platform, j.action, j.status, left(j.title, 60) AS titre, j.created_at
  FROM public.cross_post_jobs j
 WHERE j.action = 'delete' AND j.platform = 'beebs' AND j.created_at > now() - interval '5 minutes'
   AND j.inventaire_id IN (1790106697754007, (SELECT inventaire_id FROM public.cross_post_jobs WHERE id = '232ab851-75e7-48bd-8fbc-3cc4efd7fb83'));
COMMIT;
