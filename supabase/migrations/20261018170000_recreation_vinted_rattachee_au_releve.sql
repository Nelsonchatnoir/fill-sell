-- ═══════════════════════════════════════════════════════════════════════════
-- UNE RECRÉATION VINTED SE RATTACHE AU RELEVÉ, JAMAIS UNE COPIE DE PLUS (18/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Régis (juchsregis, boutique 31995881), 18/10 : 49 republications lancées ;
-- chaque recréation finissait en « canal coupé » et repartait 5, 10 min plus
-- tard — 7 copies du short Levi's, 4 du bloc-feuillet, toutes EN LIGNE.
-- Vinted ne renvoie plus vers /items/<numéro> après un dépôt réussi mais vers
-- /member/<vendeur> (code du site relu le 18/10 : `O = tr(N.id) … navigateToPage(O)`) :
-- la preuve par l'adresse et la sonde ne voient plus rien, seule la relecture
-- du dressing reconnaît la copie ; chez Régis elle ne l'a jamais vue (date de
-- suppression recalée 7 min trop tard pour la 1re copie, lecture de la page 1
-- muette ensuite). Le relevé COMPLET, lui, lit toutes les pages.
--
-- RÈGLE (tout le parc, toutes versions d'extension) : quand un relevé du
-- dressing apporte une annonce de numéro inconnu, au même titre, de la même
-- boutique, apparue pendant un de NOS envois (retrait de la une-passe ou
-- tentative de recréation : [envoi − 2 min, envoi + 20 min], jamais avant le
-- retrait), d'une republication Vinted encore « retirée, pas revenue » :
--   · la fiche de l'article prend ce numéro, la republication est close en
--     succès (published) — c'est sa remise en ligne, pas un article neuf ;
--   · si la republication est déjà close sur une autre copie (≤ 3 jours), la
--     copie de plus part par le circuit normal de retrait (job 'delete', son
--     numéro exact, même forme que le doublon_de_republication du 02/10) et
--     n'est pas importée.
-- Le numéro, l'heure de NOS envois et la boutique font la preuve ; le titre
-- seul ne suffit jamais. Deux républications au même titre candidates = doute
-- → rien (l'import suit son cours). Jamais un point de panne : sur une erreur,
-- l'import se fait comme avant.
-- Nom du déclencheur : « inventaire_a_… » tire AVANT inventaire_ecarte_import_sync
-- (ordre alphabétique) — un relevé automatique n'importe rien de neuf, mais il
-- doit pouvoir rattacher une remise en ligne.
-- Inverse : supabase/rollbacks/20261018170000_recreation_vinted_rattachee_au_releve_INVERSE.sql

create or replace function public.recreation_vinted_titre_norm(p text)
returns text language sql immutable as $$
  select btrim(regexp_replace(lower(normalize(coalesce(p, ''), NFKC)), '[^[:alnum:]]+', ' ', 'g'))
$$;

-- Heures de NOS envois portées par une republication Vinted (retrait, tentatives).
create or replace function public.recreation_vinted_envois(pf jsonb)
returns timestamptz[] language plpgsql immutable as $$
declare
  r timestamptz[] := '{}';
  v text;
  e jsonb;
begin
  if pf is null then return r; end if;
  foreach v in array array[pf -> 'suppression_verdict' ->> 'date_serveur', pf ->> 'deleted_at_client', pf ->> 'deleted_at',
                           pf ->> 'deleted_at_serveur', pf -> 'recreation_tentee' ->> 'at'] loop
    begin
      if nullif(btrim(coalesce(v, '')), '') is not null then r := r || v::timestamptz; end if;
    exception when others then null;
    end;
  end loop;
  if jsonb_typeof(pf -> 'recreation_envois') = 'array' then
    for e in select x from jsonb_array_elements(pf -> 'recreation_envois') x loop
      begin
        r := r || (case when jsonb_typeof(e) = 'string' then e #>> '{}' else e ->> 'at' end)::timestamptz;
      exception when others then null;
      end;
    end loop;
  end if;
  return r;
end $$;

-- Le plus tôt possible du retrait (horloge Vinted, puis client, puis serveur).
create or replace function public.recreation_vinted_retrait_le(pf jsonb)
returns timestamptz language plpgsql immutable as $$
declare
  r timestamptz;
  v text;
  t timestamptz;
begin
  if pf is null then return null; end if;
  foreach v in array array[pf -> 'suppression_verdict' ->> 'date_serveur', pf ->> 'deleted_at_client', pf ->> 'deleted_at',
                           pf ->> 'deleted_at_serveur'] loop
    begin
      if nullif(btrim(coalesce(v, '')), '') is not null then
        t := v::timestamptz;
        if r is null or t < r then r := t; end if;
      end if;
    exception when others then null;
    end;
  end loop;
  return r;
end $$;

create or replace function public.inventaire_rattache_recreation_vinted()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_titre text;
  v_t timestamptz;
  v_n integer := 0;
  v_job record;
  c record;
  v_pf jsonb;
  v_garde text;
begin
  if coalesce(new.origine, '') <> 'vinted_sync' or nullif(btrim(coalesce(new.vinted_item_id, '')), '') is null
     or new.listed_at_guess is null then
    return new;
  end if;
  begin
    -- Upsert d'une ligne déjà connue : c'est une mise à jour du relevé, rien à rattacher.
    if exists (select 1 from inventaire i where i.user_id = new.user_id and i.vinted_item_id = new.vinted_item_id) then
      return new;
    end if;
    v_titre := recreation_vinted_titre_norm(new.titre);
    if v_titre = '' then return new; end if;
    v_t := new.listed_at_guess;

    for c in
      select j.id, j.status, j.inventaire_id, j.title, j.platform_fields as pf,
             i.vinted_item_id as fiche_numero
        from cross_post_jobs j
        join inventaire i on i.id = j.inventaire_id and i.user_id = j.user_id
       where j.user_id = new.user_id and j.platform = 'vinted' and j.action = 'republish'
         and j.created_at > now() - interval '30 days'
         and (
               (j.status in ('pending', 'needs_user') and j.platform_fields ->> 'republish_step' = 'deleted')
            or (j.status = 'published' and j.platform_fields ->> 'republish_step' = 'recreated'
                and coalesce(j.published_at, j.created_at) > now() - interval '3 days')
         )
         and recreation_vinted_titre_norm(coalesce(nullif(j.platform_fields -> 'republish_snapshot' ->> 'titre', ''), j.title)) = v_titre
         and new.vinted_item_id is distinct from nullif(btrim(coalesce(j.platform_fields ->> 'vinted_item_id', '')), '')
         and new.vinted_item_id is distinct from nullif(btrim(coalesce(j.platform_fields ->> 'old_vinted_item_id', '')), '')
         and (new.vinted_account_id is null
              or coalesce(nullif(j.platform_fields ->> 'vinted_account_id', ''), i.vinted_account_id) is null
              or coalesce(nullif(j.platform_fields ->> 'vinted_account_id', ''), i.vinted_account_id) = new.vinted_account_id)
         and recreation_vinted_retrait_le(j.platform_fields) is not null
         and v_t >= recreation_vinted_retrait_le(j.platform_fields) - interval '2 minutes'
         and exists (select 1 from unnest(recreation_vinted_envois(j.platform_fields)) e
                      where v_t >= e - interval '2 minutes' and v_t <= e + interval '20 minutes')
    loop
      v_n := v_n + 1;
      v_job := c;
    end loop;
    if v_n <> 1 then return new; end if;   -- aucune, ou un doute : l'import suit son cours

    v_pf := coalesce(v_job.pf, '{}'::jsonb);

    if v_job.status in ('pending', 'needs_user') then
      -- ── LA REMISE EN LIGNE : la fiche prend le numéro, la republication est close ──
      update inventaire
         set vinted_item_id = new.vinted_item_id, disparu_le = null,
             listed_at_guess = new.listed_at_guess, vinted_status = coalesce(new.vinted_status, vinted_status),
             vinted_view_count = new.vinted_view_count, vinted_favourite_count = new.vinted_favourite_count,
             vinted_account_id = coalesce(vinted_account_id, new.vinted_account_id),
             last_synced_at = coalesce(new.last_synced_at, now())
       where id = v_job.inventaire_id and user_id = new.user_id
         and vinted_item_id is not distinct from v_job.fiche_numero;
      if not found then return new; end if;
      update cross_post_jobs
         set status = 'published', error = null,
             listing_url = 'https://www.vinted.fr/items/' || new.vinted_item_id,
             platform_listing_id = new.vinted_item_id,
             published_at = v_t,
             platform_fields = (v_pf - 'next_action_after' - 'needs_user_source' - 'error_technique' - 'recreation_retries'
                                - 'processing_since' - 'depot_incertain' - 'recreation_attente_releve')
               || jsonb_build_object(
                    'republish_step', 'recreated', 'recreated_at', v_t,
                    'old_vinted_item_id', coalesce(nullif(v_pf ->> 'vinted_item_id', ''), v_job.fiche_numero),
                    'new_vinted_item_id', new.vinted_item_id,
                    'reconciliation', 'remise en ligne retrouvée au relevé du dressing (numéro inconnu, heure d''un de nos envois, même titre, même boutique)',
                    'rattachement_releve', jsonb_build_object('le', now(), 'numero', new.vinted_item_id, 'mise_en_ligne', v_t,
                      'statut_avant', v_job.status, 'pose_par', 'inventaire_rattache_recreation_vinted'))
       where id = v_job.id;
      raise log 'inventaire_rattache_recreation_vinted : republication % rattachée à % (fiche %)', v_job.id, new.vinted_item_id, v_job.inventaire_id;
      return null;  -- la fiche d'origine porte l'annonce : aucune fiche neuve
    end if;

    -- ── UNE COPIE DE PLUS d'une republication déjà remise en ligne ─────────────
    v_garde := coalesce(nullif(v_pf ->> 'new_vinted_item_id', ''), v_job.fiche_numero);
    if v_garde is null or v_garde = new.vinted_item_id then return new; end if;
    if not exists (
      select 1 from cross_post_jobs d
       where d.user_id = new.user_id and d.platform = 'vinted' and d.action = 'delete'
         and d.status not in ('cancelled', 'failed')
         and coalesce(case when d.platform_listing_id ~ '^\d+$' then d.platform_listing_id end,
                      substring(d.listing_url from '/items/(\d+)')) = new.vinted_item_id) then
      insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, voie, title,
                                   listing_url, platform_listing_id, platform_fields)
      values (new.user_id, v_job.inventaire_id, 'vinted', 'delete', 'pending', 'original', 'extension',
              left(coalesce(new.titre, v_job.title, ''), 200),
              'https://www.vinted.fr/items/' || new.vinted_item_id, new.vinted_item_id,
              jsonb_build_object(
                'arme_par', jsonb_build_object('chemin', 'doublon_de_republication', 'republication', v_job.id::text,
                  'garde', v_garde, 'le', now(), 'mise_en_ligne', v_t,
                  'pose_par', 'inventaire_rattache_recreation_vinted (copie de plus vue au relevé)'))
              || case when new.vinted_account_id is not null
                      then jsonb_build_object('vinted_account_id', new.vinted_account_id) else '{}'::jsonb end);
    end if;
    update cross_post_jobs
       set platform_fields = platform_fields || jsonb_build_object('doublons_retires',
             coalesce(platform_fields -> 'doublons_retires', '[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('numero', new.vinted_item_id, 'mise_en_ligne', v_t, 'le', now())))
     where id = v_job.id;
    raise log 'inventaire_rattache_recreation_vinted : copie % de la republication % (gardée %) → retrait armé', new.vinted_item_id, v_job.id, v_garde;
    return null;  -- la copie de plus n'entre pas au stock : elle part
  exception when others then
    raise warning 'inventaire_rattache_recreation_vinted : % — import inchangé', sqlerrm;
    return new;
  end;
end $$;

drop trigger if exists inventaire_a_rattache_recreation_vinted on public.inventaire;
create trigger inventaire_a_rattache_recreation_vinted
  before insert on public.inventaire
  for each row when (new.origine = 'vinted_sync' and new.vinted_item_id is not null)
  execute function public.inventaire_rattache_recreation_vinted();
