-- PREUVE (lecture seule) de la migration 20261112140000_vente_arrete_meme_plateforme et de la règle « sans objet » étendue
-- (handler-watch, _shared/questions-tranchees.ts) — 12/11/2026, point 2 de Nico.
-- À jouer AVANT et APRÈS : npx supabase db query --linked --read-only -f scripts/reparations/20261112_vente_arrete_meme_plateforme_PREUVE.sql
-- Attendu AVANT : corrigee = false, md5 d0efd535b771fefdf0ab8220ebac80bc ; 1 tâche active sur un article vendu avec sa vente.
-- Attendu APRÈS la migration : corrigee = true ; APRÈS handler-watch (≤ 3 min) : 0 tâche en attente d'un article vendu avec
-- sa vente (la tâche du cas : cancelled, sans_objet.motif = article_vendu_vente_enregistree) ; les retenues « article vendu »
-- sans vente (needs_user) inchangées.
SELECT json_build_object(
  'enregistrer_vente_atomique', (SELECT json_build_object(
      'md5', md5(pg_get_functiondef(p.oid)),
      'corrigee', position('OR (v_restant=0 AND c.status IN (''pending'',''processing'',''needs_user'')))' IN pg_get_functiondef(p.oid)) > 0,
      'droits', p.proacl::text, 'security_definer', p.prosecdef)
    FROM pg_proc p WHERE p.oid = 'public.enregistrer_vente_atomique(uuid,text,bigint,uuid,numeric,numeric,integer,integer,text)'::regprocedure),
  'actives_sur_article_vendu', (SELECT coalesce(json_agg(json_build_object('job', left(j.id::text, 8), 'compte', left(j.user_id::text, 8),
      'plateforme', j.platform, 'action', j.action, 'statut', j.status, 'etape', j.platform_fields->>'republish_step',
      'source', j.platform_fields->>'needs_user_source', 'fiche', i.statut, 'quantite', i.quantite,
      'vente', EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = i.id)) ORDER BY j.created_at), '[]'::json)
    FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
   WHERE j.status IN ('pending', 'processing', 'needs_user') AND j.action IN ('publish', 'republish')
     AND (i.statut = 'vendu' OR i.quantite <= 0)),
  'le_cas', (SELECT json_build_object('statut', status, 'erreur', error, 'sans_objet', platform_fields->'sans_objet')
    FROM cross_post_jobs WHERE id = 'fac6fdef-7e1a-4503-a46c-34b26afadf02'),
  'retenues_execution_24h', (SELECT count(*) FROM cross_post_jobs
    WHERE platform_fields->'article_vendu'->>'pose_par' LIKE '%démarrage refusé%'
      AND (platform_fields->'article_vendu'->>'le')::timestamptz > now() - interval '24 hours')
) AS preuve;
