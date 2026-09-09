-- ═══════════════════════════════════════════════════════════════════════════
-- RÉCONCILIATION À LA SYNCHRO : une « ligne jumelle » Vinted rattache son
-- annonce au job non abouti au lieu de doubler l'article — 2026-09-09, GO Nico
-- ═══════════════════════════════════════════════════════════════════════════
-- CAS FONDATEUR (job 36796d25, Ornella, 09/09 18:07) : l'extension a conclu
-- « Vinted n'a pas été interrogé, l'annonce n'a PAS été créée » (la page Vinted
-- avait crashé après un POST lent ; la sonde ne journalise que les réponses)
-- alors que l'annonce 9944424563 était EN LIGNE. Sans ce trigger, la synchro
-- suivante crée une ligne d'inventaire JUMELLE (même titre, vinted_item_id
-- posé) et l'article d'origine reste sans identifiant : already_published
-- aveugle, retrait à la vente jamais armé, doublon à la relance.
--
-- CE QUE FAIT LE TRIGGER (BEFORE INSERT sur inventaire, lignes de la synchro
-- uniquement — origine = 'vinted_sync', vinted_item_id posé, aucune ligne du
-- compte ne porte déjà cet identifiant) :
--   1. cherche un job vinted publish NON ABOUTI (failed / needs_user /
--      pending) du même compte, créé dans les 7 jours, dont l'article n'a pas
--      de vinted_item_id, n'est ni vendu ni supprimé, et dont le TITRE est le
--      même que celui de la ligne qui arrive (forme comparable : minuscules,
--      lettres et chiffres seuls, espaces unifiés) ;
--   2. pose vinted_item_id sur l'article du job → l'INSERT qui suit heurte
--      l'index unique (user_id, vinted_item_id) et l'upsert de la synchro
--      (ON CONFLICT DO UPDATE, merge-duplicates) enrichit CETTE ligne (statut,
--      vues, favoris, compte, attributs fusionnés) — pas de jumelle, et rien
--      d'écrasé de plus qu'à une synchro normale ;
--   3. marque le job published (listing_url, platform_listing_id, erreur
--      effacée) avec une trace `reconciliation_synchro` dans platform_fields.
-- Ordre des triggers BEFORE INSERT (alphabétique) : check_inventory_limit,
-- inventaire_ecarte_import_sync (brouillons / sans photo → rien n'arrive
-- ici), puis celui-ci.
-- FAIL-SAFE : toute exception → RETURN NEW, la synchro se comporte comme
-- avant (une jumelle plutôt qu'une synchro cassée). Idempotente.
CREATE OR REPLACE FUNCTION public.inventaire_reconcilie_jumelle_vinted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_titre text;
  v_job   record;
BEGIN
  IF coalesce(NEW.origine, '') <> 'vinted_sync' OR NEW.vinted_item_id IS NULL THEN RETURN NEW; END IF;
  BEGIN
    -- La ligne existe déjà pour ce compte : c'est une MISE À JOUR de synchro
    -- (upsert), jamais une jumelle. On ne touche à rien.
    IF EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = NEW.user_id AND i.vinted_item_id = NEW.vinted_item_id) THEN RETURN NEW; END IF;
    v_titre := lower(regexp_replace(coalesce(NEW.titre, ''), '[^[:alnum:]]+', ' ', 'g'));
    v_titre := btrim(v_titre);
    IF length(v_titre) < 6 THEN RETURN NEW; END IF;
    SELECT j.id, j.inventaire_id, j.status, j.error INTO v_job
    FROM cross_post_jobs j
    JOIN inventaire i ON i.id = j.inventaire_id
    WHERE j.user_id = NEW.user_id
      AND j.platform = 'vinted' AND j.action = 'publish'
      AND j.status IN ('failed', 'needs_user', 'pending')
      AND j.created_at > now() - interval '7 days'
      AND i.user_id = NEW.user_id
      AND i.vinted_item_id IS NULL
      AND coalesce(i.statut, '') NOT IN ('vendu', 'supprime')
      AND btrim(lower(regexp_replace(coalesce(j.title, i.titre, ''), '[^[:alnum:]]+', ' ', 'g'))) = v_titre
    ORDER BY j.created_at DESC
    LIMIT 1;
    IF v_job.id IS NULL THEN RETURN NEW; END IF;

    UPDATE inventaire SET vinted_item_id = NEW.vinted_item_id, disparu_le = NULL
    WHERE id = v_job.inventaire_id AND vinted_item_id IS NULL;
    IF NOT FOUND THEN RETURN NEW; END IF;

    UPDATE cross_post_jobs SET
      status = 'published',
      error = NULL,
      listing_url = 'https://www.vinted.fr/items/' || NEW.vinted_item_id,
      platform_listing_id = NEW.vinted_item_id,
      platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object('reconciliation_synchro', jsonb_build_object(
        'le', now(), 'vinted_item_id', NEW.vinted_item_id, 'statut_avant', v_job.status, 'erreur_avant', left(v_job.error, 300),
        'motif', 'annonce trouvée dans la garde-robe Vinted (même titre) après un job non abouti — aucune ligne jumelle créée'))
    WHERE id = v_job.id;
    RAISE NOTICE 'inventaire_reconcilie_jumelle_vinted : job % rattaché à l''annonce % (article %)', v_job.id, NEW.vinted_item_id, v_job.inventaire_id;
    RETURN NEW; -- l'INSERT heurte maintenant (user_id, vinted_item_id) → DO UPDATE de la synchro sur l'article d'origine
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'inventaire_reconcilie_jumelle_vinted : % — synchro inchangée', SQLERRM;
    RETURN NEW;
  END;
END;
$function$;

DROP TRIGGER IF EXISTS inventaire_reconcilie_jumelle_vinted ON public.inventaire;
CREATE TRIGGER inventaire_reconcilie_jumelle_vinted
  BEFORE INSERT ON public.inventaire
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_reconcilie_jumelle_vinted();

COMMENT ON FUNCTION public.inventaire_reconcilie_jumelle_vinted() IS
  'Synchro Vinted : une ligne jumelle (même titre, ≤ 7 j après un job vinted publish non abouti) rattache son annonce au job au lieu de doubler l''article. Fail-safe : exception → synchro inchangée. 2026-09-09.';
