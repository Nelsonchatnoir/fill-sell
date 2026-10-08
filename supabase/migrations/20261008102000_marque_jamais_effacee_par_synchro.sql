-- ════════════════════════════════════════════════════════════════════════════
-- UNE SYNCHRO N'EFFACE JAMAIS UNE MARQUE (08/10/2026, matin)
-- ════════════════════════════════════════════════════════════════════════════
-- LE CAS (inventaire_journal, 7 derniers jours) : xxewwer et josephinecerni,
-- des dizaines d'articles Vinted dont la marque est « complétée » 9 à 12 fois
-- (« Skylanders », « Nintendo », « Disney ») — toujours avec avant = NULL.
-- LA CAUSE : un ping-pong entre deux écritures.
--   · la synchro du dressing Vinted (extension, toutes versions) envoie
--     `marque: a.marque ?? null` dans son upsert (merge-duplicates) : quand
--     l'annonce Vinted n'a pas de marque, la colonne repasse à NULL ;
--   · le relevé Beebs/Leboncoin/Opla suivant voit un champ vide et le complète
--     depuis son annonce (fiche_completer_depuis_annonce, journal
--     « champ_vide_complete »).
-- Chaque synchro du dressing, puis chaque relevé : deux écritures sur l'article
-- (et les triggers de la fiche), une ligne de journal, sans fin.
-- LA RÈGLE (celle du 04/10, Louis : un relevé complète les champs VIDES, il
-- n'écrase jamais) vaut dans l'autre sens : une écriture de synchro (celle qui
-- avance last_synced_at) ne VIDE jamais une marque non vide. Une marque
-- différente, elle, s'écrit comme avant ; la personne qui efface sa marque
-- dans l'app (sans toucher last_synced_at) l'efface comme avant.
-- Mesure : une comparaison de deux colonnes par ligne, seulement quand la
-- marque est dans la liste des colonnes écrites (BEFORE UPDATE OF marque).
-- Inverse : supabase/rollbacks/20261008102000_marque_jamais_effacee_par_synchro_INVERSE.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.inventaire_marque_jamais_effacee_par_synchro()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NULLIF(btrim(COALESCE(NEW.marque, '')), '') IS NULL
     AND NULLIF(btrim(COALESCE(OLD.marque, '')), '') IS NOT NULL
     AND NEW.last_synced_at IS DISTINCT FROM OLD.last_synced_at THEN
    NEW.marque := OLD.marque;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.inventaire_marque_jamais_effacee_par_synchro() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inventaire_marque_jamais_effacee_par_synchro ON public.inventaire;
CREATE TRIGGER inventaire_marque_jamais_effacee_par_synchro
  BEFORE UPDATE OF marque ON public.inventaire
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_marque_jamais_effacee_par_synchro();

COMMIT;
