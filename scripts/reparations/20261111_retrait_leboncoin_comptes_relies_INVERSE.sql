-- INVERSE de 20261111_retrait_leboncoin_comptes_relies.sql (11/11/2026, L1) — tant que les retraits ne sont pas partis.
-- Depuis la sauvegarde public._backup_1111_retrait_lbc_relies :
--   · les retraits nés du script (compte relié, sur les deux jumelles, créés au moment du script) qui ne sont pas partis —
--     en attente (pending) OU en attente d'un geste (needs_user, relecture M1) — passent « cancelled » avec un message
--     vrai. Un retrait déjà pris (processing) ou fait (deleted) n'est PAS touché : une annonce retirée ne se remet en ligne
--     qu'en la republiant (geste de la personne) ;
--   · les deux dépôts reprennent leurs platform_fields d'avant (retrait_arme, pending_removal) s'ils sont encore
--     « published » et que leur retrait vient d'être annulé ici ;
--   · les tâches de la jumelle annulées PAR LA RÈGLE (marque retrait_partout_compte_relie) reprennent statut, erreur et
--     platform_fields d'avant (needs_user compris) ; les remises en vente closes par elle reviennent avec leurs champs ;
--   · les marques des deux jumelles posées par le script sont retirées ; une question posée par lui (aucune attendue) est
--     déclarée sans objet.
-- Les lignes du journal (usage_logs) restent : elles disent ce qui a été fait, puis défait.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1111_retrait_lbc_relies') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde absente : le script n''a pas été passé, rien à défaire';
  END IF;
END
$garde$;

-- 1. Les retraits nés du script, pas encore partis (pending ou needs_user).
UPDATE public.cross_post_jobs d
   SET status = 'cancelled',
       error = 'Retrait annulé (inverse du rattrapage du 11/11, comptes reliés) : l''annonce est restée en ligne.',
       platform_fields = COALESCE(d.platform_fields, '{}'::jsonb)
         || jsonb_build_object('inverse_rattrapage_1111', jsonb_build_object('le', now(), 'statut_avant', d.status))
 WHERE d.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND d.platform = 'leboncoin' AND d.action = 'delete'
   AND d.status IN ('pending', 'needs_user')
   AND d.inventaire_id IN (1792340705460616, 1792340705460686)
   AND d.created_at = (SELECT min(b.le) FROM public._backup_1111_retrait_lbc_relies b);

-- 2. Les deux dépôts (encore « published ») : les deux clés posées par la règle (retrait_arme, pending_removal)
--    reprennent leur valeur d'avant — seulement si elles désignent un retrait que l'étape 1 vient d'annuler. Le reste
--    de platform_fields (écrit depuis par les relevés) n'est pas touché.
UPDATE public.cross_post_jobs j
   SET platform_fields = (j.platform_fields - 'retrait_arme' - 'pending_removal')
         || CASE WHEN (b.ligne -> 'platform_fields') ? 'retrait_arme'
                 THEN jsonb_build_object('retrait_arme', b.ligne #> '{platform_fields,retrait_arme}') ELSE '{}'::jsonb END
         || CASE WHEN (b.ligne -> 'platform_fields') ? 'pending_removal'
                 THEN jsonb_build_object('pending_removal', b.ligne #> '{platform_fields,pending_removal}') ELSE '{}'::jsonb END
  FROM public._backup_1111_retrait_lbc_relies b
 WHERE b.t = 'cross_post_jobs' AND j.id = b.cle::uuid
   AND j.id IN ('ad4e2895-c5e3-40e9-8bf0-5f1b10199479', '21a23488-a389-49a2-b228-5fc416d82c93')
   AND j.status = 'published'
   AND EXISTS (SELECT 1 FROM public.cross_post_jobs d
                WHERE d.id::text = j.platform_fields #>> '{retrait_arme,job}' AND d.status = 'cancelled'
                  AND COALESCE(d.platform_fields, '{}'::jsonb) ? 'inverse_rattrapage_1111');

-- 3. Les tâches de la jumelle annulées par la règle : statut, erreur et platform_fields d'avant.
UPDATE public.cross_post_jobs j
   SET status = b.ligne ->> 'status', error = b.ligne ->> 'error', platform_fields = b.ligne -> 'platform_fields'
  FROM public._backup_1111_retrait_lbc_relies b
 WHERE b.t = 'cross_post_jobs' AND j.id = b.cle::uuid
   AND j.status = 'cancelled' AND (b.ligne ->> 'status') IS DISTINCT FROM 'cancelled'
   AND COALESCE(j.platform_fields, '{}'::jsonb) ? 'retrait_partout_compte_relie';

-- 4. Les remises en vente closes par la règle.
UPDATE public.remises_en_vente r
   SET statut = b.ligne ->> 'statut', motif = b.ligne ->> 'motif', traite_le = NULLIF(b.ligne ->> 'traite_le', '')::timestamptz
  FROM public._backup_1111_retrait_lbc_relies b
 WHERE b.t = 'remises_en_vente' AND r.id = (b.cle)::bigint
   AND r.statut = 'abandonnee' AND r.motif = 'retrait_partout_compte_relie';

-- 5. Les marques posées par le script, et une question qu'il aurait posée.
DELETE FROM public.jumelles_retirees_partout m
 WHERE m.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND m.inventaire_id IN (1792340705460616, 1792340705460686)
   AND m.le = (SELECT min(b.le) FROM public._backup_1111_retrait_lbc_relies b);
UPDATE public.inventaire_doublons q
   SET statut = 'caduque', decide_le = now(), decide_par = 'inverse_rattrapage_1111'
 WHERE q.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND q.statut = 'proposee'
   AND q.source = 'retrait_partout_compte_relie' AND q.garde IN (1792340705460616, 1792340705460686)
   AND q.created_at = (SELECT min(b.le) FROM public._backup_1111_retrait_lbc_relies b);

SELECT 'retraits_encore_ouverts' AS quoi, count(*) AS n FROM public.cross_post_jobs d
 WHERE d.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND d.platform = 'leboncoin' AND d.action = 'delete'
   AND d.status IN ('pending', 'processing', 'needs_user') AND d.inventaire_id IN (1792340705460616, 1792340705460686)
UNION ALL
SELECT 'retraits_deja_faits (irreversibles)', count(*) FROM public.cross_post_jobs d
 WHERE d.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND d.platform = 'leboncoin' AND d.action = 'delete'
   AND d.status = 'deleted' AND d.inventaire_id IN (1792340705460616, 1792340705460686)
   AND d.created_at >= (SELECT min(b.le) FROM public._backup_1111_retrait_lbc_relies b);

COMMIT;
