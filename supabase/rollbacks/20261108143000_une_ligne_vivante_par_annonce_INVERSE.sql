-- INVERSE de 20261108143000_une_ligne_vivante_par_annonce : supprimer_mon_stock_sans_retrait remise MOT POUR MOT à sa
-- définition de PRODUCTION du 08/11 (pg_get_functiondef, md5 sans CR b0ab3a21aaf15c2b11864f9650f3a86e) ; déclencheurs,
-- fonctions et index ajoutés retirés. Les lignes déjà closes le restent (leur état d'avant est dans
-- platform_fields.reinitialisation / ligne_sans_fiche_close : rouvrir = script de réparation INVERSE, jamais ce fichier).
-- Ni BEGIN ni COMMIT : appliquée seule, sur décision.

DROP TRIGGER IF EXISTS cross_post_jobs_une_ligne_par_annonce ON public.cross_post_jobs;
DROP TRIGGER IF EXISTS cross_post_jobs_une_ligne_par_annonce_maj ON public.cross_post_jobs;
DROP FUNCTION IF EXISTS public.cross_post_jobs_une_ligne_par_annonce();
DROP FUNCTION IF EXISTS public.lignes_sans_fiche_clore(uuid, text, text, uuid, text);
DROP INDEX IF EXISTS public.cross_post_jobs_sans_fiche_vivantes;

CREATE OR REPLACE FUNCTION public.supprimer_mon_stock_sans_retrait()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'supprimer_mon_stock_sans_retrait : appel sans utilisateur'
      using errcode = 'insufficient_privilege';
  end if;
  perform set_config('fillsell.sans_retrait', '1', true);
  delete from public.ventes where user_id = auth.uid();
  delete from public.inventaire where user_id = auth.uid();
end;
$function$
;
