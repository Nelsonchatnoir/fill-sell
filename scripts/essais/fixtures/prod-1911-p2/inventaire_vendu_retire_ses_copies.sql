-- Corps de PROD relu le 19/11/2026 (pg_get_functiondef inventaire_vendu_retire_ses_copies(), md5 40049975a832346be9acea0e8eea4bea), commentaires retirés pour le banc.
CREATE OR REPLACE FUNCTION public.inventaire_vendu_retire_ses_copies()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce(current_setting('fillsell.sans_retrait', true), '') = '1' then
    return new;
  end if;
  if new.fusionne_dans is not null then
    return new;
  end if;
  if old.statut = 'vendu' or (old.quantite is not null and old.quantite <= 0) then
    return new;
  end if;
  if not (new.statut = 'vendu' or (new.quantite is not null and new.quantite <= 0)) then
    return new;
  end if;
  begin
    perform public.armer_retraits_copies(
      new.id, 'vente_article_serveur', null,
      case when new.vinted_status = 'sold' then 'vinted' end,
      interval '10 minutes');
  exception when others then
    raise warning 'inventaire_vendu_retire_ses_copies (article %) : % — vente poursuivie', new.id, sqlerrm;
  end;
  return new;
end;
$function$
;
