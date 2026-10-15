-- INVERSE de 20261015190000_une_annonce_une_fiche.sql (15/10 soir).
-- 1. Le déclencheur « le lien suit l'identifiant » et les deux fonctions de la
--    cascade disparaissent ; 2. le tick revient à sa forme du 15/10 17:xx
--    (définition relue en prod avant la migration) ; 3. les liens corrigés
--    reprennent leur valeur d'avant (trace platform_fields.lien_suit_identifiant).
BEGIN;
DROP TRIGGER IF EXISTS cross_post_jobs_lien_suit_identifiant ON public.cross_post_jobs;
DROP FUNCTION IF EXISTS public.cross_post_jobs_lien_suit_identifiant();
DROP FUNCTION IF EXISTS public.annonce_partagee_attribuer(uuid, text, text, bigint, text, text);
DROP FUNCTION IF EXISTS public.annonce_partagee_reprendre(uuid, text, text);
CREATE OR REPLACE FUNCTION public.rapprochement_ia_tick(p_comptes integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  n integer := 0;
  ids jsonb := '[]'::jsonb;
begin
  if coalesce((select value from coin_config where key = 'rapprochement_ia_actif'), '0') <> '1' then
    return jsonb_build_object('actif', false);
  end if;
  for r in
    select d.user_id
      from inventaire_doublons d
     where d.statut = 'proposee'
       and d.motif not in ('annonce_en_double', 'deux_annonces_meme_plateforme', 'photo_meme_plateforme',
                           'meme_photo_deux_annonces_meme_plateforme', 'photo_deux_annonces', 'plusieurs_exemplaires_vivants',
                           'annonce_remplacee', 'remise_en_ligne_titre_court', 'copie_non_prouvee', 'homonyme_vendu')
       and not exists (
         select 1 from rapprochement_ia_verdicts v
          where v.user_id = d.user_id
            and v.paire = case when d.garde::text collate "C" < d.absorbe::text collate "C"
                               then d.garde::text || '|' || d.absorbe::text
                               else d.absorbe::text || '|' || d.garde::text end)
       and d.user_id in (select user_id from comptes_actifs(7))
     group by d.user_id
     order by min(d.created_at)
     limit greatest(1, least(p_comptes, 10))
  loop
    perform net.http_post(
      url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/rapprochement-ia',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
      body := jsonb_build_object('user_id', r.user_id, 'mode', 'appliquer', 'limite', 20),
      timeout_milliseconds := 150000);
    n := n + 1;
    ids := ids || to_jsonb(r.user_id);
  end loop;
  return jsonb_build_object('actif', true, 'comptes', n, 'ids', ids);
end;
$function$
;
UPDATE public.cross_post_jobs SET
  listing_url = platform_fields #>> '{lien_suit_identifiant,lien_avant}',
  platform_listing_id = COALESCE(platform_fields #>> '{lien_suit_identifiant,identifiant_avant}', platform_listing_id),
  platform_fields = platform_fields - 'lien_suit_identifiant'
 WHERE platform_fields ? 'lien_suit_identifiant';
COMMIT;
