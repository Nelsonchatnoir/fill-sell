-- ═══════════════════════════════════════════════════════════════════════════
-- UNE RECRÉATION VINTED SE RATTACHE AU RELEVÉ PAR SON NUMÉRO OU SES PHOTOS, JAMAIS PAR SON TITRE (13/11)
-- ═══════════════════════════════════════════════════════════════════════════
-- Décision K1 de Nico (13/11) : « Passe les deux rattachements serveur restants (recreation-vinted-verifiee et
-- la base) à l'empreinte des photos. Plus aucun rattachement par le titre. »
--
-- Avant (migration 20261018170000, définition de prod relue par pg_get_functiondef le 13/11, md5 01b1d478…,
-- identique au dépôt) : une annonce de numéro inconnu apportée par le relevé, AU MÊME TITRE (recreation_vinted_titre_norm),
-- de la même boutique, apparue pendant un de nos envois, était rattachée à la republication « retirée, pas revenue »,
-- ou — republication déjà remise en ligne — RETIRÉE comme copie de plus. En 30 jours (lecture seule) : 0 rattachement,
-- 2 retraits sur ce seul accord titre + heure + boutique (compte 2189c4d8, tâche a4733d01, 10526669221 le 25/10 ;
-- compte 02ca0f20, tâche 6b5f8dd1, 10544108264 le 27/10).
--
-- RÈGLE (tout le parc, toutes versions d'extension) : mêmes conditions de numéro, d'heure et de boutique, mais la
-- PREUVE que l'annonce est NOTRE copie remplace le titre :
--   · le numéro que Vinted a rendu à notre envoi (platform_fields.copie_par_numero.id, extension 0.6.187) ; ou
--   · un JETON de photo de notre envoi (platform_fields.recreation_photos_envoyees.jetons, 0.6.187 — identifiants
--     d'images téléversées par NOUS) présent dans les photos de l'annonce (…/t/<jeton>/… ou …/tc/<jeton>/…, même
--     lecture que jetonPhotoVinted de l'extension et de recreation-vinted-verifiee.js) ;
--   · et (garde de plus) un numéro PLUS GRAND que l'annonce retirée : Vinted numérote ses annonces dans l'ordre.
-- Sans preuve — tâche d'une extension d'avant la 0.6.187, empreinte illisible —, RIEN n'est rattaché ni retiré :
-- l'import suit son cours (comme un doute d'avant), get-pending-jobs juge la fiche par ses photos (empreintes,
-- recreation-vinted-verifiee.js : la question ou l'attente, jamais un second envoi), et une copie de plus déjà en
-- ligne n'est plus retirée sans preuve (elle entre au stock ; le moteur des doublons la juge par ses photos).
-- Deux republications prouvées pour la même annonce = doute → rien. Jamais un point de panne : sur une erreur,
-- l'import se fait comme avant. Le déclencheur (inventaire_a_rattache_recreation_vinted) n'est pas touché.
-- recreation_vinted_titre_norm reste en base (plus appelée ; l'inverse la rappelle).
-- Banc : node scripts/cloud/pg-jetable.mjs scripts/recreation-vinted-par-empreinte-banc.mjs
-- Inverse : supabase/rollbacks/20261113190000_recreation_vinted_par_empreinte_INVERSE.sql

-- Les jetons des photos Vinted d'une liste (chaînes ou objets { url }), sans doublon.
create or replace function public.recreation_vinted_jetons_photos(p jsonb)
returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct m[1]) filter (where m is not null), '{}'::text[])
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) e
    left join lateral regexp_match(case when jsonb_typeof(e) = 'string' then e #>> '{}' else e ->> 'url' end,
                                   '/(?:t|tc)/([A-Za-z0-9_-]{12,})/') m on true
$$;

CREATE OR REPLACE FUNCTION public.inventaire_rattache_recreation_vinted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_jetons text[];
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
    -- (13/11, décision K1) La preuve : le numéro rendu par Vinted à NOTRE envoi, ou un jeton de photo de NOTRE envoi
    -- dans les photos de l'annonce. Jamais le titre.
    v_jetons := recreation_vinted_jetons_photos(new.photos);
    v_t := new.listed_at_guess;

    for c in
      select j.id, j.status, j.inventaire_id, j.title, j.platform_fields as pf,
             i.vinted_item_id as fiche_numero,
             case when new.vinted_item_id = nullif(btrim(coalesce(j.platform_fields -> 'copie_par_numero' ->> 'id', '')), '')
                  then 'numero_vinted' else 'jeton_photo' end as preuve
        from cross_post_jobs j
        join inventaire i on i.id = j.inventaire_id and i.user_id = j.user_id
       where j.user_id = new.user_id and j.platform = 'vinted' and j.action = 'republish'
         and j.created_at > now() - interval '30 days'
         and (
               (j.status in ('pending', 'needs_user') and j.platform_fields ->> 'republish_step' = 'deleted')
            or (j.status = 'published' and j.platform_fields ->> 'republish_step' = 'recreated'
                and coalesce(j.published_at, j.created_at) > now() - interval '3 days')
         )
         and (
               new.vinted_item_id = nullif(btrim(coalesce(j.platform_fields -> 'copie_par_numero' ->> 'id', '')), '')
            or (cardinality(v_jetons) > 0
                and exists (select 1
                              from jsonb_array_elements_text(case when jsonb_typeof(j.platform_fields -> 'recreation_photos_envoyees' -> 'jetons') = 'array'
                                                                  then j.platform_fields -> 'recreation_photos_envoyees' -> 'jetons'
                                                                  else '[]'::jsonb end) x
                             where x = any (v_jetons)))
         )
         and new.vinted_item_id is distinct from nullif(btrim(coalesce(j.platform_fields ->> 'vinted_item_id', '')), '')
         and new.vinted_item_id is distinct from nullif(btrim(coalesce(j.platform_fields ->> 'old_vinted_item_id', '')), '')
         -- Vinted numérote dans l'ordre : la copie porte un numéro plus grand que l'annonce retirée.
         and not (new.vinted_item_id ~ '^\d+$'
                  and coalesce(nullif(btrim(coalesce(j.platform_fields ->> 'old_vinted_item_id', '')), ''),
                               nullif(btrim(coalesce(j.platform_fields ->> 'vinted_item_id', '')), '')) ~ '^\d+$'
                  and new.vinted_item_id::numeric <= coalesce(nullif(btrim(coalesce(j.platform_fields ->> 'old_vinted_item_id', '')), ''),
                                                              nullif(btrim(coalesce(j.platform_fields ->> 'vinted_item_id', '')), ''))::numeric)
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
    if v_n <> 1 then return new; end if;   -- aucune preuve, ou un doute : l'import suit son cours

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
                    'reconciliation', 'remise en ligne retrouvée au relevé du dressing (numéro inconnu, heure d''un de nos envois, '
                      || case v_job.preuve when 'numero_vinted' then 'numéro rendu par Vinted à notre envoi'
                              else 'photo téléversée par notre envoi' end || ', même boutique — jamais le titre)',
                    'rattachement_releve', jsonb_build_object('le', now(), 'numero', new.vinted_item_id, 'mise_en_ligne', v_t,
                      'statut_avant', v_job.status, 'preuve', v_job.preuve, 'pose_par', 'inventaire_rattache_recreation_vinted'))
       where id = v_job.id;
      raise log 'inventaire_rattache_recreation_vinted : republication % rattachée à % (fiche %, preuve %)', v_job.id, new.vinted_item_id, v_job.inventaire_id, v_job.preuve;
      return null;  -- la fiche d'origine porte l'annonce : aucune fiche neuve
    end if;

    -- ── UNE COPIE DE PLUS d'une republication déjà remise en ligne (prouvée : numéro ou photo de notre envoi) ──
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
                  'garde', v_garde, 'le', now(), 'mise_en_ligne', v_t, 'preuve', v_job.preuve,
                  'pose_par', 'inventaire_rattache_recreation_vinted (copie de plus vue au relevé)'))
              || case when new.vinted_account_id is not null
                      then jsonb_build_object('vinted_account_id', new.vinted_account_id) else '{}'::jsonb end);
    end if;
    update cross_post_jobs
       set platform_fields = platform_fields || jsonb_build_object('doublons_retires',
             coalesce(platform_fields -> 'doublons_retires', '[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('numero', new.vinted_item_id, 'mise_en_ligne', v_t, 'le', now(), 'preuve', v_job.preuve)))
     where id = v_job.id;
    raise log 'inventaire_rattache_recreation_vinted : copie % de la republication % (gardée %, preuve %) → retrait armé', new.vinted_item_id, v_job.id, v_garde, v_job.preuve;
    return null;  -- la copie de plus n'entre pas au stock : elle part
  exception when others then
    raise warning 'inventaire_rattache_recreation_vinted : % — import inchangé', sqlerrm;
    return new;
  end;
end $function$;
