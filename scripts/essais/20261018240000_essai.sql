-- Essai à blanc de 20261018240000 (18/10 soir) : ROLLBACK. npx supabase db query --linked -f scripts/essais/20261018240000_essai.sql
begin;
create temp table _r (essai text, ok boolean);
drop function if exists public.questions_publication_bilan(timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.questions_publication_bilan(p_debut timestamp with time zone, p_fin timestamp with time zone DEFAULT now())
 RETURNS TABLE(plateforme text, champ text, affichees bigint, levees_personne bigint, levees_moteur bigint, abandons bigint, articles bigint, comptes bigint, plateformes_decochees bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH a AS (
    SELECT u.created_at, u.user_id, u.metadata ->> 'platform' plateforme, u.metadata -> 'champs' ->> 0 champ,
           u.metadata ->> 'inventaire_id' inv, u.metadata ->> 'issue' issue, u.metadata ->> 'par' par,
           nullif(u.metadata ->> 'delai_s', '')::numeric delai_s
      FROM usage_logs u
     WHERE u.feature = 'champ_requis_bloquant' AND u.created_at >= p_debut AND u.created_at < p_fin
  ), aff AS (SELECT * FROM a WHERE issue = 'affiche'),
  suite AS (
    SELECT aff.*, (
      SELECT jsonb_build_object('issue', c.issue, 'par', c.par, 'delai', coalesce(c.delai_s, extract(epoch FROM c.created_at - aff.created_at)))
        FROM a c
       WHERE c.user_id = aff.user_id AND c.inv IS NOT DISTINCT FROM aff.inv AND c.plateforme = aff.plateforme AND c.champ = aff.champ
         AND c.issue <> 'affiche' AND c.created_at >= aff.created_at AND c.created_at < aff.created_at + interval '2 hours'
       ORDER BY c.created_at LIMIT 1) s
      FROM aff)
  SELECT plateforme, champ, count(*),
         count(*) FILTER (WHERE s ->> 'issue' = 'complete' AND coalesce(s ->> 'par', CASE WHEN (s ->> 'delai')::numeric >= 20 THEN 'personne' ELSE 'moteur' END) = 'personne'),
         count(*) FILTER (WHERE s ->> 'issue' = 'complete' AND coalesce(s ->> 'par', CASE WHEN (s ->> 'delai')::numeric >= 20 THEN 'personne' ELSE 'moteur' END) = 'moteur'),
         count(*) FILTER (WHERE s ->> 'issue' IN ('abandonne', 'publie_sans_plateforme', 'bloque_au_clic', 'plateforme_decochee')),
         count(DISTINCT inv), count(DISTINCT user_id),
         count(*) FILTER (WHERE s ->> 'issue' = 'plateforme_decochee')
    FROM suite GROUP BY 1, 2 ORDER BY 3 DESC;
$function$;

REVOKE ALL ON FUNCTION public.questions_publication_bilan(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.questions_publication_bilan(timestamptz, timestamptz) TO service_role;

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
           count(*) FILTER (WHERE recent AND issue IN ('abandonne', 'publie_sans_plateforme', 'plateforme_decochee')) AS abandons,
           count(*) FILTER (WHERE recent AND issue = 'plateforme_decochee') AS plateformes_decochees,
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

-- Lignes d'essai (annulées) : 3 questions affichées sur un champ fictif, une levée par la personne, une abandonnée, une décochée.
insert into usage_logs (user_id, feature, metadata, created_at)
select u, 'champ_requis_bloquant', jsonb_build_object('platform', 'ebay', 'champs', jsonb_build_array('Champ essai 240000'), 'inventaire_id', inv::text, 'issue', iss, 'par', par), now() - make_interval(secs => s)
  from (values ('309d0787-9000-46cc-9c6a-51f7475d7d41'::uuid)) x(u),
       (values (1, 'affiche', null, 300), (1, 'complete', 'personne', 200),
               (2, 'affiche', null, 300), (2, 'abandonne', null, 200),
               (3, 'affiche', null, 300), (3, 'plateforme_decochee', 'personne', 200)) y(inv, iss, par, s);
insert into _r select 'Q1 bilan : 3 affichées', affichees = 3 from questions_publication_bilan(now() - interval '1 hour') where champ = 'Champ essai 240000';
insert into _r select 'Q2 bilan : 1 levée par la personne', levees_personne = 1 from questions_publication_bilan(now() - interval '1 hour') where champ = 'Champ essai 240000';
insert into _r select 'Q3 bilan : 2 abandons (abandonnée + décochée)', abandons = 2 from questions_publication_bilan(now() - interval '1 hour') where champ = 'Champ essai 240000';
insert into _r select 'Q4 bilan : 1 plateforme décochée', plateformes_decochees = 1 from questions_publication_bilan(now() - interval '1 hour') where champ = 'Champ essai 240000';
insert into _r select 'Q5 bilan : la décochée n''est jamais une levée', levees_moteur = 0 from questions_publication_bilan(now() - interval '1 hour') where champ = 'Champ essai 240000';
insert into _r select 'V1 veille : 2 abandons, 1 décochée', (b ->> 'abandons')::int = 2 and (b ->> 'plateformes_decochees')::int = 1 and (b ->> 'completes')::int = 1
  from jsonb_array_elements(champs_requis_veille(7, 500) -> 'bloquants') b where b ->> 'champ' = 'Champ essai 240000';
insert into _r select 'D1 droits : service_role seulement', not has_function_privilege('authenticated', 'public.questions_publication_bilan(timestamptz,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.questions_publication_bilan(timestamptz,timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.questions_publication_bilan(timestamptz,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.champs_requis_veille(integer,integer)', 'execute');
insert into _r select 'D2 lecture seule : STABLE', (select bool_and(provolatile = 's') from pg_proc where proname in ('questions_publication_bilan', 'champs_requis_veille'));
select essai, ok from _r order by essai;
rollback;
