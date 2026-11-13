-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261113154000_cron_refus_journalise — CHAQUE REFUS DE CADENCE DU RELEVÉ VINTED AUTOMATIQUE, UNE LIGNE usage_logs
-- (13/11, étape 5 du lot « zéro problème », bloc 6 P3, feu vert de Nico : « journaliser les refus : usage_logs +
-- ops-digest »). NON APPLIQUÉE : feu vert de Nico requis pour l'appliquer.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CONSTAT (audit du 12/11, lecture seule) : l'extension refuse le relevé lancé par son alarme quotidienne (« cron ») quand
-- le dernier relevé réussi a moins de 20 h (background.js SYNC_CRON_COOLDOWN_MS ; ceinture SQL garde_cadence_sync_runs,
-- 0 refus serveur : l'extension filtre avant). Elle n'écrit qu'une NOTE réécrite sur ce relevé porteur
-- (journaliserRefusCron, PATCH de vinted_sync_runs.erreur) : « [note] cadence cron : N sync 'cron' refusée(s) depuis ce
-- run (fenêtre de 20 h), dernière le <ISO> ». ≈ 491 refus en 7 jours sur 127 comptes, dont 92 entre 12 et 20 h après le
-- dernier relevé (ceux qui coûtent un jour) — aucune ligne, rien dans ops-digest. Cas : 447d920c, relevé de geste du 11/11
-- 20:29 (Paris), cron refusé le 12/11 10:34, ~38 h sans relevé automatique.
-- LA RÈGLE — côté SERVEUR, sur ce que TOUTES les versions de l'extension écrivent déjà (aucune livraison d'extension) :
--   cron_refus_journaliser() — NOUVELLE, déclencheur AFTER UPDATE OF erreur sur vinted_sync_runs, filtré dans WHEN
--   (relevés du dressing, note CHANGÉE, segment « cadence cron : » présent) : le compteur de la note lu avant / après
--   (motifs identiques à supabase/functions/_shared/cron-refus.js) ; s'il MONTE, une ligne usage_logs
--   feature = 'cron_refuse', metadata = { run_id, porteur (déclencheur du relevé porteur), compteur, nouveaux (la
--   hausse, 1 d'ordinaire), refus_le (la « dernière le » de la note), age_min (refus − fin du relevé porteur),
--   extension_build (profiles, le poste du compte) }. Une note réécrite sans hausse (autre écrivain) : rien. Le segment
--   effacé puis réécrit à 1 : une ligne (le refus est neuf).
--   ⛔ La cadence, la règle des 20 h, l'alarme, garde_cadence_sync_runs : INCHANGÉES. Aucune ligne existante touchée.
--   ⛔ Un journal ne bloque JAMAIS la note : toute erreur du journal est avalée (EXCEPTION), la mise à jour passe.
--   Ne voit PAS le refus « cron_sans_premiere_sync » (aucun relevé, donc aucune note) : à écrire par l'extension (0.6.187).
-- Coût : la clause WHEN écarte toute autre mise à jour sans appeler la fonction ; ≈ 70 lignes usage_logs par jour.
-- ops-digest (redéployé avec cette étape) compte ces lignes (24 h) et, tant que la migration n'est pas appliquée, lit les
-- notes des relevés porteurs (borne haute).
-- Banc : node scripts/essais/20261113154000_banc.mjs (Postgres jetable : avant / migration / inverse / rejouée).
-- Inverse : supabase/rollbacks/20261113154000_cron_refus_journalise_INVERSE.sql.
-- À jouer (feu vert de Nico) : npx supabase db query --linked -f supabase/migrations/20261113154000_cron_refus_journalise.sql
--   puis npx supabase migration repair --linked --status applied 20261113154000  (version à relire contre « migration list »).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.cron_refus_journaliser()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_apres integer;
  v_avant integer;
  v_refus timestamptz;
BEGIN
  BEGIN
    v_apres := coalesce((regexp_match(coalesce(NEW.erreur, ''), 'cadence cron :\s*(\d+)\s+sync'))[1]::integer, 0);
    v_avant := coalesce((regexp_match(coalesce(OLD.erreur, ''), 'cadence cron :\s*(\d+)\s+sync'))[1]::integer, 0);
    IF v_apres <= v_avant THEN RETURN NULL; END IF;
    BEGIN
      v_refus := (regexp_match(NEW.erreur, 'derni[eè]re le ([^ |]+)'))[1]::timestamptz;
    EXCEPTION WHEN others THEN
      v_refus := NULL;
    END;
    INSERT INTO usage_logs (user_id, feature, metadata)
    VALUES (NEW.user_id, 'cron_refuse', jsonb_build_object(
      'run_id', NEW.id,
      'porteur', NEW.declencheur,
      'compteur', v_apres,
      'nouveaux', v_apres - v_avant,
      'refus_le', coalesce(v_refus, now()),
      'age_min', CASE WHEN NEW.finished_at IS NULL THEN NULL
                      ELSE round(extract(epoch FROM (coalesce(v_refus, now()) - NEW.finished_at)) / 60) END,
      'extension_build', (SELECT p.extension_build FROM profiles p WHERE p.id = NEW.user_id)));
  EXCEPTION WHEN others THEN
    RETURN NULL; -- un journal ne bloque jamais l'écriture de la note
  END;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.cron_refus_journaliser() IS
  '13/11 (étape 5, bloc 6 P3) : une ligne usage_logs « cron_refuse » par refus de cadence du relevé Vinted automatique, lue sur la note que l''extension écrit au relevé porteur (motifs = _shared/cron-refus.js). Ne change ni la cadence ni la règle des 20 h.';
REVOKE ALL ON FUNCTION public.cron_refus_journaliser() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cron_refus_journalise ON public.vinted_sync_runs;
CREATE TRIGGER cron_refus_journalise AFTER UPDATE OF erreur ON public.vinted_sync_runs
  FOR EACH ROW
  WHEN (NEW.kind = 'dressing' AND NEW.erreur IS DISTINCT FROM OLD.erreur AND NEW.erreur LIKE '%cadence cron :%')
  EXECUTE FUNCTION public.cron_refus_journaliser();

COMMIT;
