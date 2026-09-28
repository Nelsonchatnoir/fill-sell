-- Point A : import Vinted limité aux boutiques confirmées ; titre jamais preuve.
-- GO Nico du 28/09, passe A à I et priorité Nadège. Idempotent, aucun balayage ni déplacement de fiches.
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
CREATE OR REPLACE FUNCTION public.inventaire_ecarte_import_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_motif text;
begin
  -- Ne concerne QUE les lignes ecrites par la sync dressing.
  -- La saisie manuelle (origine NULL) n'est JAMAIS touchee : 1 074 articles
  -- manuels sans photo chez 239 comptes, c'est du stock legitime.
  if coalesce(new.origine,'') <> 'vinted_sync' then
    return new;
  end if;

  -- INSERT PUR UNIQUEMENT (28/08, resserrage).
  -- En PostgreSQL un BEFORE INSERT tire AVANT la resolution du ON CONFLICT :
  -- un RETURN NULL annulerait aussi le DO UPDATE de l'upsert de la sync, et
  -- figerait la ligne existante (vues, favoris, prix, statut) pour toujours.
  -- Si l'article existe deja, on laisse passer : la derive draft/hidden se
  -- traite a l'affichage, pas en gelant la donnee.
  if exists (
    select 1 from inventaire i
    where i.user_id = new.user_id
      and i.vinted_item_id is not distinct from new.vinted_item_id
  ) then
    return new;
  end if;

  if new.vinted_status = 'draft' then
    v_motif := 'brouillon';
  elsif new.photos is null
     or jsonb_typeof(new.photos) <> 'array'
     or jsonb_array_length(new.photos) = 0 then
    v_motif := 'sans_photo';
  else
    return new;
  end if;

  insert into sync_import_ecartes (user_id, vinted_item_id, vinted_status, titre, motif)
  values (new.user_id, new.vinted_item_id, new.vinted_status, left(coalesce(new.titre,''),120), v_motif);

  return null;
end;
$function$;

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
DROP TRIGGER IF EXISTS inventaire_ecarte_import_sync ON public.inventaire;
CREATE TRIGGER inventaire_ecarte_import_sync BEFORE INSERT ON public.inventaire FOR EACH ROW EXECUTE FUNCTION public.inventaire_ecarte_import_sync();
DROP FUNCTION IF EXISTS public.boutique_vinted_confirmee(uuid,text);
