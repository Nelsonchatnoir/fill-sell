-- ═══════════════════════════════════════════════════════════════════════════
-- UNE ANNONCE DÉCLARÉE « RETIRÉE MOI-MÊME » NE GÉNÈRE PLUS DE RETRAIT (01/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Lot du 01/10 suite, point 6 (GO Nico). laforge.vinted, eBay 198641288930 :
-- l'annonce disparaît (relevés du 29/09), la fiche est supprimée à 14:01 →
-- un retrait est créé (rien à retirer) et tombe en échec « aucune publication
-- par API » ; la personne répond « je l'ai retirée moi-même ».
--   1. retrait_garde_vendue_et_doublon (BEFORE INSERT des retraits, tous les
--      chemins) : une annonce déclarée retirée par la personne → la ligne de
--      retrait n'est PAS créée (trace usage_logs « retrait_evite »). Corps :
--      la définition EN PROD du 01/10, plus ce seul bloc.
--   2. Trigger : la déclaration ferme les retraits déjà ouverts (en attente,
--      à compléter, en échec) de la même annonce.
-- Parc (rejeu à blanc, 01/10) : 1 ligne dans ce cas (celle de laforge),
-- close par scripts/reparations/20261001_retrait_annonce_retiree_par_soi.sql.
-- Retour arrière : supabase/rollbacks/20261001140000_retrait_annonce_retiree_par_soi.sql
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';

-- La même annonce, désignée par son identifiant ou par son lien (normalisé).
CREATE OR REPLACE FUNCTION public.retrait_meme_annonce(p_platform text, p_id_a text, p_url_a text, p_id_b text, p_url_b text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $f$
  WITH n AS (
    SELECT nullif(btrim(p_id_a), '') ia, nullif(btrim(p_id_b), '') ib,
           nullif(regexp_replace(split_part(split_part(btrim(coalesce(p_url_a, '')), '?', 1), '#', 1), '/$', ''), '') ua,
           nullif(regexp_replace(split_part(split_part(btrim(coalesce(p_url_b, '')), '?', 1), '#', 1), '/$', ''), '') ub)
  SELECT coalesce(
       (n.ia IS NOT NULL AND n.ia = n.ib)
    OR (n.ua IS NOT NULL AND n.ua = n.ub)
    OR (n.ia ~ '^[0-9]+$' AND n.ub IS NOT NULL AND n.ub ~ ('(^|[^0-9])' || n.ia || '([^0-9]|$)'))
    OR (n.ib ~ '^[0-9]+$' AND n.ua IS NOT NULL AND n.ua ~ ('(^|[^0-9])' || n.ib || '([^0-9]|$)')), false)
  FROM n;
$f$;

CREATE OR REPLACE FUNCTION public.retrait_garde_vendue_et_doublon()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item   text;
  v_url    text;
  v_ident  text;
  v_autre  uuid;
begin
  if new.action is distinct from 'delete' or new.status is distinct from 'pending' then
    return new;
  end if;

  -- Jamais un point de panne : sur une erreur imprévue, le retrait est créé
  -- COMME AVANT (les gardes de service de get-pending-jobs restent derrière),
  -- et la cause part en WARNING.
  begin

  if new.platform = 'vinted' then
    v_item := coalesce(
      case when new.platform_listing_id ~ '^\d+$' then new.platform_listing_id end,
      substring(new.listing_url from '/items/(\d+)'));
    v_ident := case when v_item is not null then 'vinted:' || v_item end;
  elsif nullif(btrim(new.platform_listing_id), '') is not null then
    v_ident := new.platform || ':' || btrim(new.platform_listing_id);
  elsif nullif(btrim(new.listing_url), '') is not null then
    v_url := regexp_replace(split_part(split_part(btrim(new.listing_url), '?', 1), '#', 1), '/$', '');
    v_ident := new.platform || ':' || v_url;
  end if;

  -- ── ANNONCE DÉCLARÉE RETIRÉE PAR LA PERSONNE (2026-10-01, lot point 6) ──
  -- laforge.vinted : eBay 198641288930, annonce disparue, retrait créé quand
  -- même (rien à retirer) et tombé en échec ; la personne a déclaré « je l'ai
  -- retirée moi-même ». Règle : une annonce que la personne a déclarée retirée
  -- ne génère PLUS de job de retrait, quel que soit le chemin (app, serveur,
  -- ancien client) : la ligne n'est pas créée, la trace part dans usage_logs.
  if exists (
    select 1 from public.cross_post_jobs p
     where p.user_id = new.user_id and p.platform = new.platform
       and coalesce(p.action, 'publish') in ('publish', 'republish') and p.status = 'cancelled'
       and p.error in ('Réponse dans l''app : « je l''ai retirée moi-même » — pas une vente',
                       'Annonce retirée par le vendeur (confirmé dans l''app)')
       and public.retrait_meme_annonce(new.platform, new.platform_listing_id, new.listing_url, p.platform_listing_id, p.listing_url)
  ) then
    insert into public.usage_logs (user_id, feature, metadata)
    values (new.user_id, 'retrait_evite', jsonb_build_object(
      'motif', 'annonce_declaree_retiree_par_la_personne', 'platform', new.platform,
      'listing_id', new.platform_listing_id, 'listing_url', new.listing_url, 'inventaire_id', new.inventaire_id::text));
    return null;
  end if;

  -- Annonce vendue : rien à retirer, aucune requête ne partira.
  if v_item is not null and public.vinted_annonce_vendue(new.user_id, v_item) then
    new.status := 'cancelled';
    new.error := 'Retrait inutile : cette annonce est vendue sur Vinted, elle n''est plus en vente. Aucune requête envoyée.';
    new.platform_fields := coalesce(new.platform_fields, '{}'::jsonb) || jsonb_build_object(
      'retrait_par', 'vendue_sur_la_plateforme',
      'retrait_non_envoye', jsonb_build_object('le', now(), 'motif', 'annonce_vendue', 'item', v_item,
        'pose_par', 'retrait_garde_vendue_et_doublon (création)'));
    return new;
  end if;

  -- Un seul retrait ouvert par annonce.
  if v_ident is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || '|' || v_ident, 0));
    select j.id into v_autre
    from public.cross_post_jobs j
    where j.user_id = new.user_id and j.platform = new.platform and j.action = 'delete'
      and j.status in ('pending', 'processing', 'needs_user')
      and j.id <> new.id
      and case
            when new.platform = 'vinted' then
              coalesce(case when j.platform_listing_id ~ '^\d+$' then j.platform_listing_id end,
                       substring(j.listing_url from '/items/(\d+)')) = v_item
            when nullif(btrim(new.platform_listing_id), '') is not null then
              btrim(j.platform_listing_id) = btrim(new.platform_listing_id)
            else
              regexp_replace(split_part(split_part(btrim(j.listing_url), '?', 1), '#', 1), '/$', '') = v_url
          end
    order by j.created_at
    limit 1;
    if v_autre is not null then
      new.status := 'cancelled';
      new.error := 'Doublon : un retrait est déjà en cours pour cette annonce.';
      new.platform_fields := coalesce(new.platform_fields, '{}'::jsonb) || jsonb_build_object(
        'retrait_doublon_de', jsonb_build_object('job', v_autre, 'le', now(), 'annonce', v_ident,
          'pose_par', 'retrait_garde_vendue_et_doublon (création)'));
    end if;
  end if;

  exception when others then
    raise warning 'retrait_garde_vendue_et_doublon (job %) : % — retrait créé comme avant', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

-- ── LA DÉCLARATION FERME LES RETRAITS DÉJÀ OUVERTS DE CETTE ANNONCE ────────
-- « Je l'ai retirée moi-même » arrive parfois APRÈS un retrait (laforge.vinted :
-- fiche supprimée à 14:01, retrait créé et tombé en échec, réponse ensuite).
-- Un retrait en attente, à compléter ou en échec sur la MÊME annonce n'a plus
-- rien à faire : il est clos (jamais un retrait en cours d'exécution, jamais
-- un retrait armé par un « Déjà vendu ? oui », que sa propre règle gère).
CREATE OR REPLACE FUNCTION public.retraits_clos_par_declaration_retiree()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  BEGIN
    UPDATE public.cross_post_jobs d
       SET status = 'cancelled',
           error = 'Rien à retirer : tu as indiqué avoir retiré cette annonce toi-même.',
           platform_fields = coalesce(d.platform_fields, '{}'::jsonb) || jsonb_build_object(
             'clos_par_declaration', jsonb_build_object('le', now(), 'job_declare', NEW.id, 'statut_avant', d.status))
     WHERE d.user_id = NEW.user_id AND d.platform = NEW.platform AND d.action = 'delete'
       AND d.status IN ('pending', 'needs_user', 'failed')
       AND public.retrait_meme_annonce(NEW.platform, d.platform_listing_id, d.listing_url, NEW.platform_listing_id, NEW.listing_url)
       AND NOT EXISTS (SELECT 1 FROM public.inventaire_doublons q
                        WHERE q.user_id = d.user_id AND q.preuves ? 'retraits_oui'
                          AND (q.preuves -> 'retraits_oui') ? d.id::text);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'retraits_clos_par_declaration_retiree (job %) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $f$;

DROP TRIGGER IF EXISTS cross_post_jobs_declaration_retiree_ferme_retraits ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_declaration_retiree_ferme_retraits
  AFTER UPDATE OF status, error ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND coalesce(NEW.action, 'publish') IN ('publish', 'republish')
        AND NEW.error IN ('Réponse dans l''app : « je l''ai retirée moi-même » — pas une vente',
                          'Annonce retirée par le vendeur (confirmé dans l''app)')
        AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.error IS DISTINCT FROM NEW.error))
  EXECUTE FUNCTION public.retraits_clos_par_declaration_retiree();
