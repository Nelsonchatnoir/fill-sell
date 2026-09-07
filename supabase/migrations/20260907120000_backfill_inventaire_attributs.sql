-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE de inventaire.attributs (2026-09-07) — sans refaire une sync
-- ═══════════════════════════════════════════════════════════════════════════
-- MESURE DU 07/09 : 50 919 articles sur 50 923 portent attributs = '{}'. La
-- colonne a été posée le 06/09 (migration 20260907000000) et l'extension qui
-- la remplit (b0de857 : marque / taille / état de la LISTE du dressing à chaque
-- sync) est dans la 0.6.20, EN REVIEW au Chrome Web Store : rien ne l'écrit
-- encore en production.
--
-- CE QUE LA BASE PERMET DE RATTRAPER, ET CE QU'ELLE NE PERMET PAS :
--   · marque   : 42 655 articles la portent DÉJÀ dans la colonne inventaire.marque
--                (la sync l'importe depuis toujours) → recopiée dans attributs ;
--   · taille   : 429 seulement, et uniquement via les jobs déjà publiés. La
--                taille n'a JAMAIS eu de colonne dans inventaire : pour les
--                ~50 000 autres, elle n'existe nulle part chez nous. Elle ne
--                peut venir que d'une sync portant b0de857 (0.6.20). C'est la
--                cause de fond des refus Beebs « Taille » — et la raison pour
--                laquelle aucun rattrapage en base ne peut la combler.
--   · état / couleur / matière / genre : 718 / 296 / 422 / 332, même source.
--
-- SOURCES ET PRIORITÉS (cf. 20260907000000) : manuel > vinted_detail > capture
-- > vinted_liste > lens. Le rattrapage utilise :
--   · 'vinted_liste' pour la marque — c'est sa provenance RÉELLE (la liste du
--     dressing), donc une sync ultérieure la rafraîchira au même rang ;
--   · 'backfill_job' pour ce qui vient d'un job publié (valeurs vues et
--     souvent corrigées par l'utilisateur au moment de publier). Source
--     inconnue de inventaire_attributs_rang ⇒ rang 0 : elle REMPLIT un champ
--     vide et se laisse écraser par n'importe quelle source réelle. C'est
--     exactement le comportement voulu pour un rattrapage.
--
-- Le trigger inventaire_attributs_fusion_trg fait la fusion : ces UPDATE ne
-- peuvent donc écraser aucune valeur déjà posée, et rejouer la migration est
-- sans effet (idempotence par construction + garde `NOT attributs ? 'clé'`).
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.inventaire.attributs IS
  'Attributs de l''article, une clé par champ = {v, source, at}. Sources : vinted_liste | vinted_detail | capture | lens | manuel, plus backfill_job (rattrapage du 07/09 depuis les jobs publiés — rang 0, écrasable par toute source réelle). Priorité manuel > vinted_detail > capture > vinted_liste > lens. Cf. migrations 20260907000000 et 20260907120000.';

-- ── 1. Marque : depuis la colonne, pour les articles qui ne l'ont pas encore ──
UPDATE public.inventaire i
   SET attributs = jsonb_build_object(
         'marque', jsonb_build_object(
           'v', trim(i.marque),
           'source', 'vinted_liste',
           'at', to_char(coalesce(i.last_synced_at, i.created_at, now()) AT TIME ZONE 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
 WHERE coalesce(trim(i.marque), '') <> ''
   AND NOT (i.attributs ? 'marque');

-- ── 2. Taille / état / couleur / matière / genre : depuis le dernier job ─────
-- Le job le plus RÉCENT de l'article fait foi (c'est le dernier état publié).
WITH dernier_job AS (
  SELECT DISTINCT ON (j.inventaire_id)
         j.inventaire_id,
         nullif(trim(j.platform_fields->>'taille'), '')  AS taille,
         nullif(trim(j.platform_fields->>'etat'), '')    AS etat,
         nullif(trim(j.platform_fields->>'couleur'), '') AS couleur,
         nullif(trim(j.platform_fields->>'matiere'), '') AS matiere,
         nullif(trim(j.platform_fields->>'genre'), '')   AS genre,
         to_char(j.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at
    FROM public.cross_post_jobs j
   WHERE j.inventaire_id IS NOT NULL
   ORDER BY j.inventaire_id, j.created_at DESC
)
UPDATE public.inventaire i
   SET attributs = (
         SELECT coalesce(jsonb_object_agg(k, jsonb_build_object('v', v, 'source', 'backfill_job', 'at', d.at)), '{}'::jsonb)
           FROM (VALUES ('taille', d.taille), ('etat', d.etat), ('couleur', d.couleur),
                        ('matiere', d.matiere), ('genre', d.genre)) AS champs(k, v)
          WHERE v IS NOT NULL AND NOT (i.attributs ? k))
  FROM dernier_job d
 WHERE d.inventaire_id = i.id
   AND (d.taille IS NOT NULL OR d.etat IS NOT NULL OR d.couleur IS NOT NULL
        OR d.matiere IS NOT NULL OR d.genre IS NOT NULL);
