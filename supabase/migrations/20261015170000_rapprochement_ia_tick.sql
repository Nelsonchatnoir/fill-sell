-- ═══════════════════════════════════════════════════════════════════════════
-- 15/10 soir — L'IA DES DOUTES TOURNE TOUTE SEULE, BORNÉE (décision 3 de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- rapprochement_ia_tick() : toutes les 2 minutes, au plus 3 comptes ACTIFS
-- (comptes_actifs(7)) qui ont une question « Est-ce le même article ? » ouverte,
-- éligible à l'IA, sans verdict ; un appel à rapprochement-ia (mode appliquer,
-- 20 questions au plus) par compte. Interrupteur coin_config
-- rapprochement_ia_actif ('1' = marche ; absent ou autre = rien ne part).
-- Coût mesuré le 15/10 : 0,0002 € par paire au texte, 0,0004 € avec les
-- miniatures ; plafond 1 € par compte et par passage dans la fonction.
-- Mesure CPU : une lecture indexée (inventaire_doublons par statut) + 3 pg_net.
-- Inverse : supabase/rollbacks/20261015170000_rapprochement_ia_tick.sql.

create or replace function public.rapprochement_ia_tick(p_comptes integer default 3)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;
revoke all on function public.rapprochement_ia_tick(integer) from public, anon, authenticated;

-- La réponse de l'IA : en plus, jamais deux annonces d'une même plateforme.
create or replace function public.inventaire_doublon_decider_ia(p_id uuid, p_decision text, p_raison text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  d record;
  r jsonb;
begin
  select * into d from inventaire_doublons where id = p_id for update;
  if d.id is null then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  if d.statut <> 'proposee' then return jsonb_build_object('ok', false, 'reason', 'deja_tranchee', 'statut', d.statut); end if;
  if d.motif in ('annonce_en_double', 'deux_annonces_meme_plateforme', 'photo_meme_plateforme',
                 'meme_photo_deux_annonces_meme_plateforme', 'photo_deux_annonces', 'plusieurs_exemplaires_vivants',
                 'annonce_remplacee', 'remise_en_ligne_titre_court', 'copie_non_prouvee', 'homonyme_vendu') then
    return jsonb_build_object('ok', false, 'reason', 'hors_ia', 'motif', d.motif);
  end if;
  if p_decision = 'non' then
    update inventaire_doublons
       set statut = 'refusee', decide_le = now(), decide_par = 'ia',
           preuves = coalesce(preuves, '{}'::jsonb) || jsonb_build_object('ia', jsonb_build_object('decision', 'non', 'raison', p_raison, 'le', now()))
     where id = d.id;
    return jsonb_build_object('ok', true, 'decision', 'non');
  elsif p_decision = 'oui' then
    if exists (select 1 from inventaire_doublons x where x.user_id = d.user_id and x.statut = 'refusee' and x.decide_par = 'utilisateur') then
      return jsonb_build_object('ok', false, 'reason', 'compte_deux_exemplaires');
    end if;
    if not exists (select 1 from inventaire where id = d.garde and user_id = d.user_id and fusionne_dans is null and statut is distinct from 'vendu')
       or not exists (select 1 from inventaire where id = d.absorbe and user_id = d.user_id and fusionne_dans is null and statut is distinct from 'vendu') then
      return jsonb_build_object('ok', false, 'reason', 'fiche_vendue_ou_absente');
    end if;
    -- (15/10 soir) Jamais deux annonces d'une MÊME plateforme sur une fiche par
    -- l'IA : ferreirasab, « Bottes Zippy 21 » — deux annonces Leboncoin jugées
    -- « même pièce » que la même fiche Vinted (deux exemplaires possibles).
    if exists (select 1 from inventaire g join inventaire a on true
                where g.id = d.garde and a.id = d.absorbe and g.vinted_item_id is not null and a.vinted_item_id is not null)
       or exists (select 1 from annonces_plateforme ag join annonces_plateforme aa on aa.platform = ag.platform
                   where ag.user_id = d.user_id and ag.inventaire_id = d.garde and ag.disparu_le is null and ag.retiree_le is null
                     and aa.user_id = d.user_id and aa.inventaire_id = d.absorbe and aa.disparu_le is null and aa.retiree_le is null)
       or exists (select 1 from cross_post_jobs jg join cross_post_jobs ja on ja.platform = jg.platform
                   where jg.user_id = d.user_id and jg.inventaire_id = d.garde and jg.status = 'published' and coalesce(jg.action, 'publish') in ('publish', 'republish')
                     and ja.user_id = d.user_id and ja.inventaire_id = d.absorbe and ja.status = 'published' and coalesce(ja.action, 'publish') in ('publish', 'republish')) then
      return jsonb_build_object('ok', false, 'reason', 'deux_annonces_meme_plateforme');
    end if;
    r := inventaire_fusionner_pour(d.user_id, d.garde, d.absorbe, 'ia (doublon proposé)');
    if coalesce((r ->> 'ok')::boolean, false) then
      update inventaire_doublons
         set statut = 'fusionnee', decide_le = now(), decide_par = 'ia', fusion_id = nullif(r ->> 'fusion_id', '')::uuid,
             preuves = coalesce(preuves, '{}'::jsonb) || jsonb_build_object('ia', jsonb_build_object('decision', 'oui', 'raison', p_raison, 'le', now()))
       where id = d.id;
    end if;
    return r || jsonb_build_object('decision', 'oui');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
end;
$function$;
revoke all on function public.inventaire_doublon_decider_ia(uuid, text, text) from public, anon, authenticated;
grant execute on function public.inventaire_doublon_decider_ia(uuid, text, text) to service_role;

insert into coin_config (key, value, updated_at) values ('rapprochement_ia_actif', '0', now())
  on conflict (key) do nothing;

select cron.schedule('rapprochement-ia-2min', '*/2 * * * *', $$select public.rapprochement_ia_tick(3)$$);
