-- ════════════════════════════════════════════════════════════════════════════
-- MAILS DE VENTE : LA PREUVE « ANNONCE VUE EN LIGNE » AUX DÉCLENCHEURS
-- (06/10/2026 soir, feu vert de Nico)
-- ════════════════════════════════════════════════════════════════════════════
-- CE QUI MANQUAIT
--   · Une vraie vente Vinted vue par la veille (lecture « sold » de l'annonce,
--     push_trg_job) partait SANS mail quand la boutique n'avait pas été relevée
--     hier ou aujourd'hui : la garde de push-ventes (v6/v7) ne connaissait que
--     les relevés (vinted_listing_snapshots) et les publications < 48 h ; elle
--     ignorait que la veille avait LU l'annonce en ligne quelques heures avant.
--     Seuls 23 à 42 comptes ont une boutique relevée chaque jour.
--   · À l'inverse, le déclencheur des jobs se fiait à la date du CONSTAT
--     (unavailable_since) : Anastasia H, poste éteint un mois, revenu le 06/10
--     → deux mails à 16:58 pour des annonces vues en ligne pour la dernière
--     fois le 06/09. Et le déclencheur de l'inventaire ne regardait que « un
--     relevé dans les 24 h » : Louis (Amiral), fiches à quantité 9997 qui
--     repassent « vendues » sur d'ANCIENNES annonces → quatre mails à 17:03
--     pour des annonces vendues les 30/09, 04/10 et 05/10.
--
-- LA RÈGLE (VINTED SEULEMENT — les jobs des autres plateformes gardent le chemin
-- de l'après-midi, aucune vraie vente n'y perd son mail ; une seule règle, aux deux déclencheurs Vinted ; même fenêtre que la
-- garde de push-ventes) — une vente détectée ne vaut une note que si :
--   1. son annonce n'a JAMAIS été vue « sold » par un relevé d'un jour
--      précédent (heure de Paris) ;
--   2. ET elle a été vue EN LIGNE hier ou aujourd'hui (Paris), par :
--        · la veille (lecture de l'annonce : cross_post_jobs.vu_en_ligne_le,
--          ou la dernière lecture sans doute ni absence) ;
--        · un relevé (Vinted : vinted_listing_snapshots ; autres plateformes :
--          annonces_plateforme en ligne) ;
--        · sa publication par FillSell il y a moins de 48 h ;
--      ou c'est une commande eBay arrivée par l'API (inchangé).
--   La preuve trouvée est écrite sur la note (push_ventes.preuve_recente) :
--   push-ventes l'accepte (v8) au lieu d'exiger un relevé d'hier.
--   Les autres gardes ne bougent pas : déclarée, doublon, rattrapage de masse
--   (push_ventes_a_envoyer), « déjà vue vendue un jour précédent » (push-ventes).
--
-- LA PREUVE DE LA VEILLE (écriture minimale) : `cross_post_jobs.vu_en_ligne_le`
-- garde l'heure de la dernière lecture EN LIGNE de l'annonce par la veille
-- (lecture réussie, ni doute, ni absence, ni vente). Posée dans la ligne que la
-- veille écrit DÉJÀ (BEFORE UPDATE OF last_checked_at, clause WHEN) : aucune
-- écriture en plus, aucune ligne réécrite. Elle survit aux lectures
-- indéterminées qui suivent (avant : la moitié des lectures récentes portaient
-- un compteur de doute — la vente qui suivait n'aurait eu aucune preuve).
-- Pas de rattrapage de masse : tant qu'elle est vide, la dernière lecture
-- propre (last_checked_at sans drapeau) fait foi — c'est la même information.
--
-- CHARGE (règle du 04/10) : le déclencheur BEFORE ne tourne que quand
-- last_checked_at change (lectures de la veille) et ne lit rien ; les
-- déclencheurs de vente ne tournent que sur un passage à « vendu » (WHEN) et
-- lisent par index unique (vinted_snapshots_jour_unique,
-- annonces_plateforme_unique, cross_post_jobs_inventaire). Mesures : rapport
-- du 06/10 soir.
-- ════════════════════════════════════════════════════════════════════════════

set lock_timeout = '3s';

-- ── 1. La note porte sa preuve ─────────────────────────────────────────────
alter table public.push_ventes add column if not exists preuve_recente text;

-- ── 2. La dernière lecture EN LIGNE par la veille ──────────────────────────
alter table public.cross_post_jobs add column if not exists vu_en_ligne_le timestamptz;

create or replace function public.cross_post_jobs_vu_en_ligne()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Une lecture de la veille qui a vu l'annonce EN LIGNE : statut publié, ni
  -- vente, ni absence (même provisoire), ni doute. Jamais une heure future,
  -- jamais un recul.
  if new.last_checked_at is not null
     and new.status = 'published'
     and new.last_checked_at <= now() + interval '5 minutes'
     and new.last_checked_at > coalesce(new.vu_en_ligne_le, '-infinity'::timestamptz)
     and (new.platform_fields ->> 'sale_signal') is null
     and (new.platform_fields ->> 'unavailable_since') is null
     and (new.platform_fields ->> 'unavailable_pending_since') is null
     and coalesce(new.platform_fields ->> 'check_unknown_count', '0') = '0'
     and coalesce(new.platform_fields ->> 'check_unresolved', 'false') <> 'true' then
    new.vu_en_ligne_le := new.last_checked_at;
  end if;
  return new;
end;
$$;

do $$ begin
  -- Création seule (jamais DROP : il prend le verrou exclusif de la table).
  if not exists (select 1 from pg_trigger where tgname = 'cross_post_jobs_vu_en_ligne' and tgrelid = 'public.cross_post_jobs'::regclass) then
    create trigger cross_post_jobs_vu_en_ligne
    before update of last_checked_at on public.cross_post_jobs
    for each row when (new.last_checked_at is distinct from old.last_checked_at)
    execute function public.cross_post_jobs_vu_en_ligne();
  end if;
end $$;

-- ── 3. Les deux questions, une fois pour toutes ────────────────────────────
-- Vinted : l'annonce a-t-elle été vue VENDUE par un relevé d'un jour précédent ?
create or replace function public.push_vinted_vendue_avant(p_user uuid, p_item text)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select p_user is not null and nullif(btrim(coalesce(p_item, '')), '') is not null and exists (
    select 1 from public.vinted_listing_snapshots s
     where s.user_id = p_user
       and s.vinted_item_id = btrim(p_item)
       and s.status = 'sold'
       and s.captured_on < (now() at time zone 'Europe/Paris')::date
  );
$$;

-- L'annonce a-t-elle été vue EN LIGNE hier ou aujourd'hui (Paris) par un relevé,
-- ou par la veille sur un job vivant de la même fiche ? Rend la preuve, null sinon.
create or replace function public.push_preuve_en_ligne(p_user uuid, p_pf text, p_annonce text, p_inv bigint DEFAULT NULL::bigint)
returns text
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_debut_hier timestamptz := ((now() at time zone 'Europe/Paris')::date - 1)::timestamp at time zone 'Europe/Paris';
  v_annonce text := nullif(btrim(coalesce(p_annonce, '')), '');
  v_d date;
  v_t timestamptz;
begin
  if p_user is null or v_annonce is null or p_pf is null then return null; end if;
  -- Relevé de la boutique.
  if p_pf = 'vinted' then
    select max(s.captured_on) into v_d from public.vinted_listing_snapshots s
     where s.user_id = p_user and s.vinted_item_id = v_annonce
       and s.captured_on >= v_aujourdhui - 1
       and s.status in ('active', 'reserved', 'hidden');
    if v_d is not null then return 'releve:' || v_d::text; end if;
  else
    select a.vu_le into v_t from public.annonces_plateforme a
     where a.user_id = p_user and a.platform = p_pf and a.listing_id = v_annonce
       and a.vu_le >= v_debut_hier and a.disparu_le is null
       and a.statut_plateforme in ('en_ligne', 'en_verification');
    if v_t is not null then return 'releve:' || to_char(v_t at time zone 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI'); end if;
  end if;
  -- La veille, sur un job de la même fiche qui désigne cette annonce.
  if p_inv is not null then
    select max(greatest(j.vu_en_ligne_le,
                        case when j.status = 'published'
                              and (j.platform_fields ->> 'sale_signal') is null
                              and (j.platform_fields ->> 'unavailable_since') is null
                              and (j.platform_fields ->> 'unavailable_pending_since') is null
                              and coalesce(j.platform_fields ->> 'check_unknown_count', '0') = '0'
                              and coalesce(j.platform_fields ->> 'check_unresolved', 'false') <> 'true'
                             then j.last_checked_at end))
      into v_t
      from public.cross_post_jobs j
     where j.inventaire_id = p_inv and j.user_id = p_user and j.platform = p_pf
       and j.action in ('publish', 'republish')
       and public.listing_designe(v_annonce, j.listing_url, j.platform_listing_id);
    if v_t >= v_debut_hier and v_t <= now() + interval '5 minutes' then
      return 'veille:' || to_char(v_t at time zone 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI');
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.push_vinted_vendue_avant(uuid, text) from public, anon, authenticated;
revoke all on function public.push_preuve_en_ligne(uuid, text, text, bigint) from public, anon, authenticated;

-- ── 4. push_noter range la preuve sur la note ──────────────────────────────
-- (définition EN PROD du 06/10 soir, seul ajout : fillsell.push_preuve lu,
-- effacé aussitôt — jamais repris par la note suivante — et écrit en
-- preuve_recente)
create or replace function public.push_noter(p_user uuid, p_origine text, p_pf text, p_vente bigint DEFAULT NULL::bigint, p_inv bigint DEFAULT NULL::bigint, p_job uuid DEFAULT NULL::uuid, p_commande text DEFAULT NULL::text, p_annonce text DEFAULT NULL::text, p_titre text DEFAULT NULL::text, p_prix numeric DEFAULT NULL::numeric, p_devise text DEFAULT NULL::text, p_vendu_le timestamp with time zone DEFAULT NULL::timestamp with time zone, p_declaree boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cles text[] := '{}';
  v_q    integer;
  v_pf   text := nullif(btrim(coalesce(p_pf, '')), '');
  v_preuve text := nullif(btrim(coalesce(current_setting('fillsell.push_preuve', true), '')), '');
begin
  -- (06/10 soir) La preuve posée par le déclencheur ne vaut que pour CET appel.
  if v_preuve is not null then perform set_config('fillsell.push_preuve', '', true); end if;
  -- Point d'essai : la preuve « un échec d'envoi ne bloque pas la vente ».
  if coalesce(current_setting('fillsell.push_essai_panne', true), '') = '1' then
    raise exception 'panne simulée (essai)';
  end if;
  if p_user is null then return; end if;
  -- (06/10) Plus de sortie « sans téléphone » : la note porte aussi le mail.

  if p_commande is not null and v_pf is not null then
    v_cles := v_cles || ('commande:' || v_pf || ':' || p_commande);
  end if;
  if p_annonce is not null and v_pf is not null then
    v_cles := v_cles || ('annonce:' || v_pf || ':' || p_annonce);
  end if;
  if p_job is not null then
    v_cles := v_cles || ('job:' || p_job::text);
  end if;
  -- La fiche n'identifie la vente que pour un article à pièce unique : deux
  -- ventes d'une fiche en plusieurs exemplaires sont deux ventes.
  if p_inv is not null then
    select coalesce(i.quantite, 1) into v_q from public.inventaire i where i.id = p_inv;
    if coalesce(v_q, 1) <= 1 or p_declaree then
      v_cles := v_cles || ('fiche:' || p_inv::text);
    end if;
  end if;

  insert into public.push_ventes (
    user_id, origine, plateforme, vente_id, inventaire_id, job_id, commande_ref, annonce_id,
    titre, prix, devise, vendu_le, cles, statut, lot, preuve_recente
  ) values (
    p_user, case when p_declaree then 'declaree' else p_origine end, v_pf, p_vente, p_inv, p_job,
    p_commande, p_annonce, left(p_titre, 200), p_prix, p_devise, p_vendu_le, v_cles,
    case when p_declaree then 'declaree' else 'a_envoyer' end,
    pg_current_xact_id()::text::bigint,
    case when p_declaree then null else left(v_preuve, 120) end
  );

  -- Un seul appel par transaction ; pg_net ne part qu'après la validation.
  if not p_declaree and coalesce(current_setting('fillsell.push_relance', true), '') <> '1' then
    perform set_config('fillsell.push_relance', '1', true);
    perform net.http_post(
      url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
      headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
      body    := '{"trigger":"push_noter"}'::jsonb,
      timeout_milliseconds := 60000
    );
  end if;
end;
$function$;

revoke all on function public.push_noter(uuid, text, text, bigint, bigint, uuid, text, text, text, numeric, text, timestamptz, boolean) from public, anon, authenticated;

-- ── 5. Les jobs : la preuve « vue en ligne » pour VINTED ; les autres plateformes inchangées ──
-- (06/10 soir) Le chemin des jobs LBC / eBay / Beebs / Opla reste EXACTEMENT
-- celui de l'après-midi (disparition < 24 h, commande eBay par l'API, ou
-- dernière lecture < 24 h) : aucune vraie vente de ces plateformes ne perd son
-- mail. Seul Vinted passe à la preuve « vue en ligne » (son trou, ses 6 faux).
create or replace function public.push_trg_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pf text;
  v_declaree boolean;
  v_dispa timestamptz;
  v_annonce text;
  v_debut_hier timestamptz;
  v_vu timestamptz;
  v_preuve text;
begin
  begin
    v_pf := public.plateforme_normalisee(new.platform);
    v_annonce := nullif(btrim(coalesce(new.platform_listing_id, '')), '');
    v_declaree := public.push_declaration_en_cours(new.user_id, new.inventaire_id);
    if not v_declaree then
      v_dispa := least(public._ts_ou_null(new.platform_fields ->> 'unavailable_since'),
                       public._ts_ou_null(new.platform_fields ->> 'unavailable_pending_since'));
      if v_pf is distinct from 'vinted' then
        -- Inchangé (définition EN PROD du 06/10 après-midi).
        if v_dispa is not null then
          if v_dispa < now() - interval '24 hours' then return new; end if;
        elsif not (coalesce(new.voie, '') = 'api' and new.status = 'sold') then
          if old.last_checked_at is null or old.last_checked_at < now() - interval '24 hours' then
            return new;
          end if;
        end if;
      else
        -- Vinted : une disparition constatée il y a plus de 24 h n'est pas une vente du moment.
        if v_dispa is not null and v_dispa < now() - interval '24 hours' then return new; end if;
        -- Jamais une annonce déjà vue vendue un jour précédent.
        if public.push_vinted_vendue_avant(new.user_id, v_annonce) then return new; end if;
        v_debut_hier := ((now() at time zone 'Europe/Paris')::date - 1)::timestamp at time zone 'Europe/Paris';
        -- La veille l'a lue EN LIGNE hier ou aujourd'hui (la lecture qui voit la
        -- vente ne compte pas : c'est l'état d'AVANT qui prouve).
        v_vu := greatest(old.vu_en_ligne_le,
                         case when old.status = 'published'
                               and (old.platform_fields ->> 'sale_signal') is null
                               and (old.platform_fields ->> 'unavailable_since') is null
                               and (old.platform_fields ->> 'unavailable_pending_since') is null
                               and coalesce(old.platform_fields ->> 'check_unknown_count', '0') = '0'
                               and coalesce(old.platform_fields ->> 'check_unresolved', 'false') <> 'true'
                              then old.last_checked_at end);
        if v_vu >= v_debut_hier and v_vu <= now() + interval '5 minutes' then
          v_preuve := 'veille:' || to_char(v_vu at time zone 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI');
        elsif new.published_at > now() - interval '48 hours' then
          v_preuve := 'publiee:' || to_char(new.published_at at time zone 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI');
        else
          v_preuve := public.push_preuve_en_ligne(new.user_id, v_pf, v_annonce, null);
        end if;
        if v_preuve is null then return new; end if;  -- aucune preuve récente : rien
        perform set_config('fillsell.push_preuve', v_preuve, true);
      end if;
    end if;
    perform public.push_noter(new.user_id, 'job', v_pf, null, new.inventaire_id, new.id,
      null, v_annonce, new.title, new.price, null, null,
      v_declaree);
  exception when others then
    perform set_config('fillsell.push_preuve', '', true);
    raise warning 'push_trg_job (job %) : % — vente poursuivie', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

-- ── 6. Le relevé Vinted : la preuve « vue en ligne » de CETTE annonce ──────
-- (avant : « un relevé réussi dans les 24 h » pour toute la boutique)
create or replace function public.push_trg_inventaire_vinted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item text;
  v_preuve text;
begin
  begin
    if new.fusionne_dans is not null then return new; end if;
    if coalesce(current_setting('fillsell.sans_retrait', true), '') = '1' then return new; end if;
    v_item := nullif(btrim(coalesce(new.vinted_item_id, '')), '');
    if v_item is null then return new; end if;
    -- Jamais une annonce déjà vue vendue un jour précédent (fiches à quantité
    -- qui repassent « vendues » sur une ancienne annonce à chaque relevé).
    if public.push_vinted_vendue_avant(new.user_id, v_item) then return new; end if;
    -- Vue EN LIGNE hier ou aujourd'hui : le relevé précédent de cette fiche…
    if old.vinted_item_id is not distinct from new.vinted_item_id
       and old.vinted_status in ('active', 'reserved', 'hidden')
       and old.last_synced_at >= ((now() at time zone 'Europe/Paris')::date - 1)::timestamp at time zone 'Europe/Paris'
       and old.last_synced_at <= now() + interval '5 minutes' then
      v_preuve := 'releve:' || to_char(old.last_synced_at at time zone 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI');
    else
      -- … ou un relevé du jour / de la veille, ou la veille sur son job.
      v_preuve := public.push_preuve_en_ligne(new.user_id, 'vinted', v_item, new.id);
    end if;
    if v_preuve is null then return new; end if;
    perform set_config('fillsell.push_preuve', v_preuve, true);
    perform public.push_noter(new.user_id, 'vinted', 'vinted', null, new.id, null,
      null, v_item, new.titre, new.prix_vente, null, null, false);
  exception when others then
    perform set_config('fillsell.push_preuve', '', true);
    raise warning 'push_trg_inventaire_vinted (article %) : % — relevé poursuivi', new.id, sqlerrm;
  end;
  return new;
end;
$function$;
