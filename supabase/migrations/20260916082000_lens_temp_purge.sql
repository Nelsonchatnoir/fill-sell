-- ═══════════════════════════════════════════════════════════════════════════
-- MÉNAGE DU BUCKET lens-temp — CÔTÉ SERVEUR (2026-09-16, GO Nico)
--
-- Depuis le correctif du 15/09, le client ne purge PLUS les photos `lens-temp`
-- du scan précédent : elles sont devenues les photos d'un article du stock
-- (creerArticlePourFiche les rattache telles quelles, faute de mieux à cet
-- instant — le bucket durable n'est alimenté qu'à l'ouverture du stepper).
-- Personne ne fait donc plus le ménage, et le bucket grossit sans borne.
--
-- ⛔ LE MÉNAGE EST SERVEUR, PAS CLIENT. Un client qui purge ne voit que SON
--    scan courant : c'est exactement ce qui effaçait les photos d'articles.
-- ⛔ UNE PHOTO RÉFÉRENCÉE NE PART JAMAIS, QUEL QUE SOIT SON ÂGE. Trois
--    références comptent, pas deux : `fiches_annonce.fiche->'photos'`,
--    `cross_post_jobs.photos` ET `inventaire.photos`. La troisième n'est pas
--    dans la consigne mais elle est le cœur du sujet : c'est précisément parce
--    que les URLs lens-temp vivent maintenant dans inventaire.photos que le
--    client a cessé de purger. L'oublier reviendrait à effacer les photos des
--    articles nés d'un scan, c'est-à-dire à refaire le bug qu'on vient de
--    corriger.
--    ⚠️ `lens_scans.photos` n'est VOLONTAIREMENT pas une référence : chaque
--    scan cite ses propres photos, le cron ne purgerait jamais rien. Le scan
--    garde sa trace, pas ses octets — c'est le sens de la borne d'âge.
-- ⛔ BORNE D'ÂGE : 7 jours minimum, en dur dans la fonction de sélection.
-- ⛔ LE CRON ÉCRIT CE QU'IL SUPPRIME, pas seulement un compteur : une ligne par
--    fichier dans lens_temp_purge_trace, POSÉE AVANT la suppression et datée
--    après. Un fichier qui n'a pas pu partir se lit donc à `supprimee_le IS
--    NULL` et repartira au run suivant.
--
-- Forme des URLs publiques (pour la comparaison) :
--   https://<ref>.supabase.co/storage/v1/object/public/lens-temp/<name>[?v=…]
-- Le `?v=` est la parade au 404 mis en cache (incident Delavier, 02/09) : il
-- faut couper la query, sinon RIEN ne matche et tout paraît orphelin.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.lens_temp_purge_trace (
  name          text PRIMARY KEY,
  compte        uuid,
  taille        bigint NOT NULL DEFAULT 0,
  televersee_le timestamptz,
  listee_le     timestamptz NOT NULL DEFAULT now(),
  supprimee_le  timestamptz,
  run_id        uuid
);

ALTER TABLE public.lens_temp_purge_trace ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lens_temp_purge_trace FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS lens_temp_purge_trace_en_attente_idx
  ON public.lens_temp_purge_trace (listee_le) WHERE supprimee_le IS NULL;

-- ── La SÉLECTION vit en SQL, comme republish_captures_purgeables ────────────
-- L'Edge Function n'exécute que la suppression : elle ne décide de rien.
CREATE OR REPLACE FUNCTION public.lens_temp_a_purger(p_limite integer DEFAULT 500)
RETURNS TABLE (name text, compte uuid, taille bigint, televersee_le timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH brut AS (
    SELECT e AS el FROM public.inventaire i, LATERAL jsonb_array_elements(i.photos) e
      WHERE jsonb_typeof(i.photos) = 'array'
    UNION ALL
    SELECT e FROM public.cross_post_jobs j, LATERAL jsonb_array_elements(j.photos) e
      WHERE jsonb_typeof(j.photos) = 'array'
    UNION ALL
    SELECT e FROM public.fiches_annonce f, LATERAL jsonb_array_elements(f.fiche->'photos') e
      WHERE jsonb_typeof(f.fiche->'photos') = 'array'
  ), urls AS (
    SELECT CASE WHEN jsonb_typeof(el) = 'string' THEN el #>> '{}'
                WHEN jsonb_typeof(el) = 'object'
                  THEN COALESCE(el->>'url', el->>'original', el->>'enhanced', el->>'bg_removed')
           END AS u
    FROM brut
  ), refs AS (
    SELECT DISTINCT split_part(split_part(u, '/storage/v1/object/public/lens-temp/', 2), '?', 1) AS nom
    FROM urls WHERE u LIKE '%/storage/v1/object/public/lens-temp/%'
  )
  SELECT o.name,
         NULLIF(split_part(o.name, '/', 2), '')::uuid,
         COALESCE((o.metadata->>'size')::bigint, 0),
         o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = 'lens-temp'
    AND o.created_at < now() - interval '7 days'
    AND NOT EXISTS (SELECT 1 FROM refs WHERE refs.nom = o.name)
  ORDER BY o.created_at
  LIMIT GREATEST(COALESCE(p_limite, 500), 0);
$$;

REVOKE ALL ON FUNCTION public.lens_temp_a_purger(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lens_temp_a_purger(integer) TO service_role;

-- ── Le cron ────────────────────────────────────────────────────────────────
-- 03:50 UTC, dans le créneau des purges (republish-purge 03:40, publish-sans-
-- lien 03:30) et loin des fenêtres de publication.
-- ⛔ UNSCHEDULE AVANT SCHEDULE : `cron.schedule` sur un nom existant remplace,
--    mais un rejeu de ce fichier sur une base où le job n'existe PAS doit
--    aussi marcher — et surtout on ne veut JAMAIS deux jobs du même nom (le
--    doublon handler-watch-3min, cf. CLAUDE.md).
SELECT cron.unschedule('lens-temp-purge-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lens-temp-purge-daily');

SELECT cron.schedule(
  'lens-temp-purge-daily',
  '50 3 * * *',
  $CRON$
  SELECT net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/lens-temp-purge',
    headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
    body    := '{}'::jsonb
  );
  $CRON$
);
