-- INVERSE de supabase/migrations/20261017141000_dressing_garde_commande_annulee.sql :
-- la définition EN PROD le 17/10 à 14:05, AVANT la migration (pg_get_functiondef, mot
-- pour mot ; md5 a63b6f1128757a0b767dd2852a094f57 — celle de la migration
-- 20261011120000). Garde : l'inverse ne part que si la prod porte la version de la
-- migration (son message « annonce jamais revue en ligne ») ; sinon il s'arrête, rien
-- n'est écrit. Le déclencheur inventaire_0_vendu_vinted_par_la_vente n'est pas touché.
-- Aucune donnée ne bouge : une fiche gardée en stock par la garde le reste ; au
-- dressing suivant, la règle du 11/10 revient (« vendu » direct sans job vivant).
-- Application : npx supabase db query --linked -f supabase/rollbacks/20261017141000_dressing_garde_commande_annulee.sql

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF position('annonce jamais revue en ligne' IN pg_get_functiondef('public.inventaire_vendu_vinted_par_la_vente()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'la prod ne porte pas la version de la migration 20261017141000 : inverse arrêté, rien n''est écrit';
  END IF;
END
$garde$;

CREATE OR REPLACE FUNCTION public.inventaire_vendu_vinted_par_la_vente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id  text := nullif(btrim(coalesce(new.vinted_item_id, '')), '');
  v_job uuid;
  v_pf  jsonb;
begin
  begin
    if v_id is null then return new; end if;
    -- Le job Vinted VIVANT de cette annonce exacte (numéro, jamais le titre).
    select c.id, c.platform_fields into v_job, v_pf
      from public.cross_post_jobs c
     where c.user_id = new.user_id and c.platform = 'vinted' and c.status = 'published'
       and coalesce(c.action, 'publish') in ('publish', 'republish')
       and (btrim(coalesce(c.platform_listing_id, '')) = v_id
            or substring(coalesce(c.listing_url, '') from '/items/([0-9]+)') = v_id)
     order by c.created_at desc
     limit 1
     for update;
    if v_job is null then return new; end if;            -- import pur : comportement du 03/08
    -- Une vente déjà écrite pour cette fiche ou cette annonce : le statut suit.
    if exists (select 1 from public.ventes v
                where v.user_id = new.user_id and (v.inventaire_id = new.id or v.annonce_id = v_id))
       or exists (select 1 from public.ventes_operations o
                   where o.user_id = new.user_id
                     and o.cle in ('annonce:vinted:' || v_id, coalesce(v_pf ->> 'vente_operation_cle', ''))) then
      return new;
    end if;
    -- Le signal part sur le job, comme l'extension le voulait (D'ABORD : s'il
    -- échoue, la fiche n'est pas touchée et l'écriture d'origine passe).
    if coalesce(v_pf ->> 'sale_signal', '') <> 'sold' then
      update public.cross_post_jobs
         set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
               'sale_signal', 'sold',
               'unavailable_since', coalesce(platform_fields ->> 'unavailable_since',
                                             to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
               'sale_signal_pose_par', jsonb_build_object(
                 'par', 'inventaire_vendu_vinted_par_la_vente', 'le', now(),
                 'motif', 'dressing_sold_fiche_vendue_par_le_client'))
       where id = v_job;
    end if;
    -- Puis la fiche reste en stock : la vente l'écrira (ligne, stock, retraits).
    new.statut := old.statut;
    new.quantite := old.quantite;
    raise log 'inventaire_vendu_vinted_par_la_vente : fiche % (annonce %) gardée en stock, signal sur le job %',
      new.id, v_id, v_job;
  exception when others then
    -- Jamais une synchro cassée par la garde : en cas d'erreur, l'écriture
    -- d'origine passe telle quelle (comportement d'avant).
    raise warning 'inventaire_vendu_vinted_par_la_vente (fiche %) : %', new.id, sqlerrm;
    return new;
  end;
  return new;
end;
$function$
;

COMMIT;
