-- ═══════════════════════════════════════════════════════════════════════════
-- PLUS JAMAIS DE needs_user MUET (27/09, règle de Nico)
-- APPLIQUÉE le 27/09 à 15:28 (GO nommé, CLI db query -f), après rejeu annulé :
-- trigger posé, 11 jobs reclassés (2 Opla → question de catégorie, 4 champ_a_choisir,
-- 5 relancer, 1 Leboncoin payant → info/cancelled), 0 needs_user sans motif.
-- ═══════════════════════════════════════════════════════════════════════════
-- « Un job ne finit jamais en rouge pour une raison que l'utilisateur peut
-- trancher. Tout needs_user a un needs_user_source, et chaque source a son
-- écran dans l'app. »
--
-- CONSTAT (27/09) : josephinecerni, deux dépôts Opla (67fa12a9 « Doudoune Celio
-- homme XL », 9534b06e « Pyjama poupon Anne Geddes ») en needs_user SANS motif,
-- message brut « Aucune catégorie Opla n'a été résolue pour cet article. » —
-- l'extension 0.6.69 pose ce refus en needs_user directement (liste servie
-- dans oplaCategoryAsk), et update-job-status ne classait que le statut
-- « pending » (graph.studio25, nadegemarcelin78 : classés champ_a_choisir).
-- Mesuré : 9 jobs actifs en needs_user sans motif sur des comptes vus depuis
-- 30 jours (2 Opla catégorie, 2 Beebs « champs encore vides », 2 eBay, 2
-- Leboncoin, 2 Vinted) ; update-job-status v89 classe désormais ces deux
-- statuts et pose un motif par défaut à tout needs_user qui partirait sans.
--
-- CE FICHIER, deux gestes :
--   1. Le FILET EN BASE, pour TOUS les écrivains (get-pending-jobs,
--      handler-watch, fonctions SQL, extensions anciennes) : trigger BEFORE
--      INSERT OR UPDATE — un needs_user sans needs_user_source reçoit
--      « champ_a_choisir » s'il porte un champ à trancher (needsUserField,
--      needsUserFields, champs_a_completer, server_required_fields : l'app
--      ouvre l'éditeur), « relancer » sinon (le message est affiché, le bouton
--      relance). Marqueur needs_user_sans_motif {le, source_posee, message, par}
--      + RAISE LOG : un motif posé par défaut est un chemin à nommer, et
--      l'ops-digest le compte.
--   2. Le RECLASSEMENT des jobs actifs déjà dans ce cas :
--      · les 2 dépôts Opla de josephinecerni : champ_a_choisir + la phrase de
--        pas-de-rouge (§4), la liste est déjà dans needsUserField ;
--      · Leboncoin « aucune option gratuite » (25a… 21/09) : la règle
--        pas-de-rouge dit « info, job clos » — appliquée telle quelle ;
--      · les autres : la règle par défaut du trigger (un UPDATE neutre de
--        platform_fields le déclenche), champ → champ_a_choisir, sinon relancer.
-- Aucun message existant n'est effacé (hors les 2 Opla, réécrits avec la
-- question), aucun job relancé, aucun crédit ne bouge. Idempotent.

BEGIN;

-- ── 1. Le filet ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cross_post_jobs_needs_user_motif()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pf     jsonb;
  v_champ  boolean;
  v_source text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'needs_user' THEN RETURN NEW; END IF;
  v_pf := COALESCE(NEW.platform_fields, '{}'::jsonb);
  IF NULLIF(btrim(v_pf ->> 'needs_user_source'), '') IS NOT NULL THEN RETURN NEW; END IF;
  v_champ :=
       NULLIF(btrim(v_pf #>> '{needsUserField,field_key}'), '') IS NOT NULL
    OR (jsonb_typeof(v_pf -> 'needsUserFields') = 'array' AND jsonb_array_length(v_pf -> 'needsUserFields') > 0)
    OR (jsonb_typeof(v_pf -> 'champs_a_completer') = 'array' AND jsonb_array_length(v_pf -> 'champs_a_completer') > 0)
    OR (jsonb_typeof(v_pf -> 'server_required_fields') = 'array' AND jsonb_array_length(v_pf -> 'server_required_fields') > 0);
  v_source := CASE WHEN v_champ THEN 'champ_a_choisir' ELSE 'relancer' END;
  NEW.platform_fields := v_pf || jsonb_build_object(
    'needs_user_source', v_source,
    'needs_user_sans_motif', jsonb_build_object(
      'le', now(), 'source_posee', v_source, 'message', left(COALESCE(NEW.error, ''), 300),
      'par', 'trigger cross_post_jobs_needs_user_motif'));
  RAISE LOG 'cross_post_jobs_needs_user_motif : job % (% %) needs_user SANS MOTIF — source « % » posée par défaut : %',
    NEW.id, NEW.platform, COALESCE(NEW.action, 'publish'), v_source, left(COALESCE(NEW.error, ''), 160);
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS cross_post_jobs_needs_user_motif ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_needs_user_motif
  BEFORE INSERT OR UPDATE OF status, platform_fields ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.status = 'needs_user' AND NULLIF(NEW.platform_fields ->> 'needs_user_source', '') IS NULL)
  EXECUTE FUNCTION public.cross_post_jobs_needs_user_motif();

-- ── 2a. josephinecerni : la question de catégorie Opla, comme chez Nadège ──
UPDATE cross_post_jobs j SET
  error = 'Opla a besoin de savoir dans quelle catégorie ranger cet article, et on ne veut pas la deviner. '
       || 'Choisis-la ci-dessous parmi les ' || jsonb_array_length(j.platform_fields #> '{needsUserField,allowed_values}')::text
       || ' proposées : un seul geste, et la publication repart. Rien n''a été publié.',
  platform_fields = j.platform_fields || jsonb_build_object(
    'needs_user_source', 'champ_a_choisir',
    'pas_de_rouge', jsonb_build_object('at', now(), 'motif', 'categorie_a_choisir', 'verdict', 'a_toi', 'pose_par', 'migration 20260927163000'))
 WHERE j.status = 'needs_user' AND j.platform = 'opla'
   AND NULLIF(j.platform_fields ->> 'needs_user_source', '') IS NULL
   AND j.error LIKE 'Aucune catégorie Opla n''a été résolue%'
   AND j.platform_fields #>> '{needsUserField,field_key}' = 'oplaCategoryChoice'
   AND jsonb_typeof(j.platform_fields #> '{needsUserField,allowed_values}') = 'array'
   AND jsonb_array_length(j.platform_fields #> '{needsUserField,allowed_values}') >= 2;

-- ── 2b. Leboncoin sans option gratuite : la règle dit « info, job clos » ──
UPDATE cross_post_jobs j SET
  status = 'cancelled',
  error = 'Leboncoin ne propose plus de dépôt gratuit sur ce compte : son dernier écran n''offre que « Valider et payer ». '
       || 'FillSell ne paie jamais à ta place, donc cette annonce n''est pas partie et rien ne t''a été facturé. '
       || 'Tes autres plateformes ne sont pas concernées.',
  platform_fields = (j.platform_fields - 'next_action_after')
    || jsonb_build_object('pas_de_rouge', jsonb_build_object('at', now(), 'motif', 'lbc_sans_option_gratuite', 'verdict', 'info', 'pose_par', 'migration 20260927163000'))
 WHERE j.status = 'needs_user' AND j.platform = 'leboncoin'
   AND NULLIF(j.platform_fields ->> 'needs_user_source', '') IS NULL
   AND j.error LIKE 'Leboncoin ne propose aucune option gratuite%';

-- ── 2c. Les autres jobs actifs : la règle par défaut du filet ──────────────
UPDATE cross_post_jobs j SET platform_fields = COALESCE(j.platform_fields, '{}'::jsonb)
  FROM profiles p
 WHERE p.id = j.user_id AND j.status = 'needs_user'
   AND NULLIF(j.platform_fields ->> 'needs_user_source', '') IS NULL
   AND p.extension_last_seen_at > now() - interval '30 days';

COMMIT;
