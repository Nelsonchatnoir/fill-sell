-- ─────────────────────────────────────────────────────────────────────────────
-- FILET SERVEUR : supprimer un article ARME le retrait de ses annonces en ligne
-- (2026-09-16, diagnostic « le plan de retrait ne retire pas tout », GO Nico)
--
-- POURQUOI. Le plan de suppression de l'app (buildDeletePlan, App.jsx) ne
-- voyait que les jobs action='publish' : une annonce dont la dernière mise en
-- ligne vient d'une REPUBLICATION n'entrait jamais dans « en ligne », aucun
-- retrait n'était armé, l'annonce restait achetable après la suppression de
-- l'article (bouilloire 9880378302, 16/09). Et tout chemin qui supprime une
-- ligne d'inventaire SANS passer par le plan (article absent du cache client,
-- SQL) ne retirait rien du tout. 50 annonces orphelines mesurées, 7 comptes.
--
-- CE QUE FAIT LE TRIGGER (BEFORE DELETE, ligne par ligne, tant que le lien
-- inventaire_id est encore là — la FK cross_post_jobs_inventaire_id_fkey est
-- en ON DELETE SET NULL et l'efface juste après) :
--   1. pour chaque plateforme, le job publish/republish 'published' le plus
--      récemment MIS EN LIGNE, avec listing_url, SANS retrait déjà actif sur
--      cette plateforme → INSERT d'un job action='delete' (même forme que
--      l'app : pending, photo_option 'original', titre, listing_url) ;
--   2. les publish/republish non terminaux restants → 'cancelled', même
--      message que l'app ;
--   3. une ligne usage_logs `retrait_annonces` (chemin
--      suppression_article_filet_serveur) si au moins un retrait est armé.
-- Quand l'app a déjà tout armé, le trigger ne trouve rien et n'écrit rien :
-- il complète, il ne double pas.
--
-- QUAND IL NE FAIT RIEN (trois gardes, dans cet ordre) :
--   · garde de session : `select set_config('fillsell.sans_retrait','1',true);`
--     dans la transaction d'un nettoyage SQL → aucun retrait armé. C'est aussi
--     ce que pose la RPC supprimer_mon_stock_sans_retrait (réinitialisation et
--     suppression de compte depuis l'app : elles n'ont jamais retiré
--     d'annonces, elles ne doivent pas commencer) ;
--   · cascade (pg_trigger_depth() > 1) : une suppression entraînée par un
--     parent n'est pas un geste sur l'article ;
--   · clé service (request.jwt.claims.role = 'service_role') : delete-account
--     et les scripts d'exploitation. Un compte qui part ne se fait pas retirer
--     ses annonces eBay par FillSell.
-- Il ne BLOQUE JAMAIS une suppression : tout échec interne est journalisé en
-- WARNING et le DELETE se poursuit.
-- Idempotent (create or replace / drop if exists), rejouable.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.inventaire_arme_retraits_avant_suppression()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role        text;
  v_pub         record;
  v_n           integer := 0;
  v_annules     integer := 0;
  v_plateformes text[] := '{}';
begin
  if coalesce(current_setting('fillsell.sans_retrait', true), '') = '1' then
    return old;
  end if;
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  begin
    v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    v_role := null;
  end;
  if v_role = 'service_role' then
    return old;
  end if;

  begin
    for v_pub in
      select distinct on (j.platform) j.platform, j.id, j.listing_url, j.title
        from public.cross_post_jobs j
       where j.user_id = old.user_id
         and j.inventaire_id = old.id
         and coalesce(j.action, 'publish') in ('publish', 'republish')
         and j.status = 'published'
         and nullif(btrim(j.listing_url), '') is not null
         and not exists (
           select 1 from public.cross_post_jobs d
            where d.user_id = old.user_id
              and d.inventaire_id = old.id
              and d.action = 'delete'
              and d.platform = j.platform
              and d.status in ('pending', 'processing', 'needs_user'))
       order by j.platform, coalesce(j.published_at, j.created_at) desc, j.created_at desc
    loop
      insert into public.cross_post_jobs
        (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
      values
        (old.user_id, old.id, v_pub.platform, 'delete', 'pending', 'original',
         coalesce(v_pub.title, old.titre), v_pub.listing_url,
         jsonb_build_object('filet_suppression_serveur', jsonb_build_object(
           'le', now(),
           'job_publication', v_pub.id,
           'motif', 'annonce en ligne non couverte par le plan de suppression de l''app')));
      v_n := v_n + 1;
      v_plateformes := v_plateformes || v_pub.platform;
    end loop;

    update public.cross_post_jobs
       set status = 'cancelled',
           error  = 'Annulé : l''article a été supprimé du stock'
     where user_id = old.user_id
       and inventaire_id = old.id
       and coalesce(action, 'publish') <> 'delete'
       and status in ('pending', 'processing', 'needs_user');
    get diagnostics v_annules = row_count;

    if v_n > 0 then
      insert into public.usage_logs (user_id, feature, metadata)
      values (old.user_id, 'retrait_annonces', jsonb_build_object(
        'chemin', 'suppression_article_filet_serveur',
        'plateformes', (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from unnest(v_plateformes) as p),
        'n_annonces', v_n,
        'n_articles', 1,
        'article_id', old.id::text,
        'publications_annulees', v_annules));
    end if;
  exception when others then
    raise warning 'inventaire_arme_retraits_avant_suppression (article %) : % — suppression poursuivie', old.id, sqlerrm;
  end;
  return old;
end;
$$;

drop trigger if exists inventaire_arme_retraits_avant_suppression on public.inventaire;
create trigger inventaire_arme_retraits_avant_suppression
  before delete on public.inventaire
  for each row execute function public.inventaire_arme_retraits_avant_suppression();

-- ── RPC pour l'app : vider SON stock sans armer de retrait ──────────────────
-- Réinitialisation (handleReset) et suppression de compte (handleDeleteAccount)
-- faisaient deux DELETE sous le JWT de l'utilisateur : avec le trigger, elles
-- armeraient le retrait de TOUTES ses annonces. Elles passent par ici : la
-- garde de session est posée dans la même transaction (set_config local),
-- puis ventes AVANT inventaire (ventes.inventaire_id est sans cascade).
-- SECURITY INVOKER : la RLS de l'utilisateur s'applique telle quelle.
create or replace function public.supprimer_mon_stock_sans_retrait()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'supprimer_mon_stock_sans_retrait : appel sans utilisateur'
      using errcode = 'insufficient_privilege';
  end if;
  perform set_config('fillsell.sans_retrait', '1', true);
  delete from public.ventes where user_id = auth.uid();
  delete from public.inventaire where user_id = auth.uid();
end;
$$;

revoke all on function public.supprimer_mon_stock_sans_retrait() from public;
grant execute on function public.supprimer_mon_stock_sans_retrait() to authenticated;
