-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 — CHAMPS OBLIGATOIRES : LA VEILLE (lot 3, « champs déduits »)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (audit du 17/10, lecture seule) : aucune section de l'ops-digest ne
-- regarde ni « une plateforme ajoute un champ obligatoire » (le catalogue
-- platform_category_aspects le sait : required + first_seen_at, alimenté par les
-- relevés DOM de l'extension et par les refus 400), ni le volume des questions
-- posées à l'écran Publier (usage_logs champ_requis_bloquant : 1 090 lignes en
-- 7 j, Taille Beebs 152, Univers Leboncoin 109…). Un champ nouveau ou un champ
-- qui double d'une semaine à l'autre n'était vu par personne.
--
-- LA RÈGLE : une fonction de veille, lue par l'ops-digest (quotidien), même
-- modèle que releves_morts_veille (20261018010000) :
--   · `nouveaux` : un champ OBLIGATOIRE apparu depuis p_jours sur un rayon connu
--     depuis PLUS longtemps (un rayon relevé pour la première fois n'est pas un
--     champ ajouté par la plateforme) ; `sans_liste` quand aucune valeur n'est
--     relevée (rien à déduire : la question est inévitable tant que la liste
--     n'est pas lue) ; jamais Opla (sortie du 11/10) ;
--   · `bloquants` : les questions affichées par plateforme et champ sur p_jours,
--     avec la fenêtre précédente (affiches_avant) pour voir une hausse, les
--     complétées, les abandons, les articles et les comptes touchés ;
--   · `total_affiches` / `total_affiches_avant` : les deux fenêtres entières —
--     c'est la mesure « avant / après » du lot 3 (à relire 7 jours après).
-- Lecture seule, STABLE, service_role seulement. Rien n'est modifié ici.
-- Inverse : supabase/rollbacks/20261018020000_champs_requis_veille.sql.
-- Application :
--   npx supabase db query --linked -f supabase/migrations/20261018020000_champs_requis_veille.sql
--   npx supabase migration repair --linked --status applied 20261018020000

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.champs_requis_veille(p_jours integer DEFAULT 7, p_limite integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH rayons AS (
    SELECT platform, category_key, min(first_seen_at) AS rayon_depuis
      FROM platform_category_aspects
     GROUP BY 1, 2
  ), nouveaux AS (
    SELECT a.platform, a.category_key, a.field_label, a.field_key, a.source, a.seen_count,
           (a.allowed_values IS NULL OR jsonb_typeof(a.allowed_values) <> 'array'
            OR jsonb_array_length(a.allowed_values) = 0) AS sans_liste,
           to_char(a.first_seen_at AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI') AS vu_le,
           to_char(r.rayon_depuis AT TIME ZONE 'Europe/Paris', 'DD/MM') AS rayon_depuis
      FROM platform_category_aspects a
      JOIN rayons r ON r.platform = a.platform AND r.category_key = a.category_key
     WHERE a.required = true
       AND a.platform <> 'opla'
       AND a.first_seen_at > now() - make_interval(days => p_jours)
       AND r.rayon_depuis < now() - make_interval(days => p_jours)
     ORDER BY a.first_seen_at DESC
     LIMIT p_limite
  ), lignes AS (
    SELECT l.metadata ->> 'platform' AS platform,
           c.champ,
           l.metadata ->> 'issue' AS issue,
           l.metadata ->> 'inventaire_id' AS inv,
           l.user_id,
           l.created_at > now() - make_interval(days => p_jours) AS recent
      FROM usage_logs l
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(l.metadata -> 'champs') = 'array' THEN l.metadata -> 'champs' ELSE '[]'::jsonb END
      ) AS c(champ)
     WHERE l.feature = 'champ_requis_bloquant'
       AND l.created_at > now() - make_interval(days => 2 * p_jours)
  ), bloquants AS (
    SELECT platform, champ,
           count(*) FILTER (WHERE recent AND issue = 'affiche') AS affiches,
           count(*) FILTER (WHERE NOT recent AND issue = 'affiche') AS affiches_avant,
           count(*) FILTER (WHERE recent AND issue = 'complete') AS completes,
           count(*) FILTER (WHERE recent AND issue IN ('abandonne', 'publie_sans_plateforme')) AS abandons,
           count(DISTINCT inv) FILTER (WHERE recent AND issue = 'affiche') AS articles,
           count(DISTINCT user_id) FILTER (WHERE recent AND issue = 'affiche') AS comptes
      FROM lignes
     GROUP BY 1, 2
    HAVING count(*) FILTER (WHERE recent AND issue = 'affiche') > 0
     ORDER BY 3 DESC
     LIMIT p_limite
  )
  SELECT jsonb_build_object(
    'jours', p_jours,
    'nouveaux', coalesce((SELECT jsonb_agg(to_jsonb(n)) FROM nouveaux n), '[]'::jsonb),
    'bloquants', coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM bloquants b), '[]'::jsonb),
    'total_affiches', (SELECT count(*) FROM lignes WHERE recent AND issue = 'affiche'),
    'total_affiches_avant', (SELECT count(*) FROM lignes WHERE NOT recent AND issue = 'affiche')
  );
$function$;

REVOKE ALL ON FUNCTION public.champs_requis_veille(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.champs_requis_veille(integer, integer) TO service_role;

COMMENT ON FUNCTION public.champs_requis_veille(integer, integer) IS
  '18/10 lot 3 — veille des champs obligatoires (nouveaux sur un rayon connu, questions posées par champ, deux fenêtres). Lecture seule, lue par ops-digest.';

COMMIT;
