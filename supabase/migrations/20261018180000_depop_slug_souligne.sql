-- ═══════════════════════════════════════════════════════════════════════════
-- DEPOP : LE PSEUDO DU VENDEUR PEUT PORTER UN « _ » (18/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Retrait Depop 81188384 (compte a3002ab6, armé le 17/10 à 12:27 à la vente
-- Vinted de l'article) : « Retrait Depop impossible : aucun identifiant
-- d'annonce sur ce job », 16 essais en 30 h, l'annonce TOUJOURS EN LIGNE
-- (risque de double vente). L'identifiant n'a jamais manqué : le lien
-- https://www.depop.com/products/thard_733-jean-bonobo-taille-40-coupe-aceb/
-- est sur le job, et le dépôt 1661efb0 porte depop_product_id = 958393360.
-- C'est la LECTURE du slug qui refusait le « _ » du pseudo
-- (/products/([A-Za-z0-9]+-…) : mesuré le 18/10, 71 liens Depop sur 328 jobs
-- n'étaient pas lus (64 dépôts publiés, dont 34 sans platform_listing_id).
-- Le nouveau motif ne change AUCUNE lecture existante (0 lien lu autrement,
-- 0 identifiant en base contredit) : il lit seulement les liens refusés.
--
-- LA RÈGLE, côté base (même correction que les fonctions edge, même jour) :
--   1. annonce_id_depuis_url et identifiant_annonce_depuis_lien lisent
--      [A-Za-z0-9_]+ en tête du slug — le déclencheur BEFORE INSERT des
--      retraits (retrait_identifiant_depuis_lien) pose donc l'identifiant ;
--   2. armer_retrait_job_pour recopie depop_product_id du dépôt sur le retrait.
-- Aucun index, aucune colonne générée, aucune politique ne dépend de ces deux
-- fonctions IMMUTABLE (relu le 18/10) : rien à reconstruire.
-- Réécrites depuis pg_get_functiondef en PROD le 18/10 (md5 avant :
--   annonce_id_depuis_url 1672b24414ea625d5af1e843961acaa2,
--   identifiant_annonce_depuis_lien 3783f236286db32d17c387f4bcc90ef1,
--   armer_retrait_job_pour 9eedc07f8bc2e4bea972d0b57d0c6cdc) ; droits et propriétaire gardés
--   (CREATE OR REPLACE).
-- Les 34 dépôts Depop publiés sans identifiant : scripts/reparations/20261018_depop_identifiants_slug.sql.
-- Essai à blanc : scripts/essais/20261018180000_essai.sql (ROLLBACK).
-- Inverse : supabase/rollbacks/20261018180000_depop_slug_souligne_INVERSE.sql
-- Application (feu vert de Nico) :
--   npx supabase db query --linked -f supabase/migrations/20261018180000_depop_slug_souligne.sql
--   npx supabase migration repair --linked --status applied 20261018180000

CREATE OR REPLACE FUNCTION public.annonce_id_depuis_url(p_platform text, p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE lower(COALESCE(p_platform, ''))
    WHEN 'leboncoin' THEN substring(COALESCE(p_url, '') from '/(\d{6,})(?:[/?#]|$)')
    WHEN 'beebs'     THEN substring(COALESCE(p_url, '') from '/p/(\d+)(?:[-/?#]|$)')
    WHEN 'opla'      THEN substring(COALESCE(p_url, '') from '(art_[A-Za-z0-9_-]+)')
    WHEN 'depop'     THEN substring(COALESCE(p_url, '') from '/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])')  -- (18/10) « _ » admis : pseudo du vendeur (thard_733-…)
    WHEN 'ebay'      THEN substring(COALESCE(p_url, '') from '/itm/(?:[^/?#]*/)?(\d{9,})')
    ELSE NULL END
$function$;

CREATE OR REPLACE FUNCTION public.identifiant_annonce_depuis_lien(p_platform text, p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_platform
    WHEN 'vinted'    THEN substring(p_url from '/items/([0-9]+)')
    WHEN 'beebs'     THEN substring(p_url from '/p/([0-9]+)(?:[-/?#]|$)')
    WHEN 'ebay'      THEN substring(p_url from '/itm/(?:[^/?#]*/)?([0-9]{9,})')
    WHEN 'leboncoin' THEN substring(p_url from '/([0-9]{6,})(?:\.htm)?(?:[/?#]|$)')
    WHEN 'opla'      THEN substring(p_url from '(art_[A-Za-z0-9_-]+)')
    WHEN 'depop'     THEN substring(p_url from '/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])')  -- (18/10) « _ » admis : pseudo du vendeur (thard_733-…)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.armer_retrait_job_pour(p_job_id uuid, p_chemin text, p_delai interval, p_preuve_geste boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  j        public.cross_post_jobs%rowtype;
  v_item   text;
  v_url    text;
  v_ident  text;
  v_sans_lien boolean;
  v_pf     jsonb;
  v_del    uuid;
  v_compte text;
begin
  select * into j from public.cross_post_jobs where id = p_job_id for update;
  if not found or j.inventaire_id is null
     or coalesce(j.action, 'publish') not in ('publish', 'republish')
     or j.status is distinct from 'published' then
    return null;
  end if;

  -- Point A, incident Angel : le dépôt prouve l'annonce, pas une vente.
  -- Lecture indexée ventes_user_inventaire_idx ; aucune réécriture de données.
  if not exists (
    select 1 from public.ventes v
    join public.inventaire i on i.id = v.inventaire_id and i.user_id = v.user_id
    where v.user_id = j.user_id and v.inventaire_id = j.inventaire_id
      and i.statut = 'vendu'
      and lower(coalesce(v.statut, '')) not in ('annule', 'annulée', 'cancelled', 'canceled')
      and coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, '')) is not null
      and lower(coalesce(nullif(i.plateforme, ''), nullif(v.plateforme_code, ''), v.plateforme)) <> lower(j.platform)
    limit 1
  ) then
    -- (2026-09-30, règle Louis partie 2 — décision Nico) Le geste de la
    -- personne vaut preuve de vente pour CE retrait-là seulement : « oui » à
    -- « Déjà vendu ? » sur l'annonce que l'app lui a montrée (preuve déjà
    -- reconnue le 27/09). La fiche doit être vendue, et jamais sur la
    -- plateforme de l'annonce retirée. Toutes les autres gardes restent.
    if not coalesce(p_preuve_geste, false) or not exists (
      select 1 from public.inventaire i
       where i.id = j.inventaire_id and i.user_id = j.user_id and i.statut = 'vendu'
         and lower(coalesce(nullif(i.plateforme, ''), '')) <> lower(j.platform)
    ) then
      return null;
    end if;
  end if;
  -- (27/09 soir) UN TITRE N'EST JAMAIS UNE PREUVE : l'annonce doit être liée à
  -- SA fiche par une preuve, et la fiche ne doit pas porter deux annonces
  -- vivantes sur cette plateforme (deux annonces = deux exemplaires).
  if not public.retrait_job_prouve(j.id) then
    return null;
  end if;
  -- (15/10, P16) Deux annonces vivantes sur la plateforme : rien d'office — sauf
  -- le « oui » de la personne à « Déjà vendu ? » sur CETTE annonce (montrée par
  -- l'écran, preuve par le geste) : c'est elle, et elle seule, qui part.
  if public.fiche_annonces_vivantes(j.inventaire_id, j.platform) >= 2 and not coalesce(p_preuve_geste, false) then
    return null;
  end if;
  if coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold' then
    return null;
  end if;
  v_url := nullif(btrim(coalesce(j.listing_url, '')), '');
  if j.platform = 'vinted' then
    v_item := coalesce(case when j.platform_listing_id ~ '^\d+$' then j.platform_listing_id end,
                       substring(v_url from '/items/(\d+)'));
    if v_item is not null and public.vinted_annonce_vendue(j.user_id, v_item) then
      return null;
    end if;
  end if;
  v_sans_lien := v_url is null and nullif(btrim(coalesce(j.platform_listing_id, '')), '') is null;
  if exists (
    select 1 from public.cross_post_jobs d
     where d.user_id = j.user_id and d.inventaire_id = j.inventaire_id
       and d.platform = j.platform and d.action = 'delete'
       and (d.status in ('pending', 'processing', 'needs_user')
            or (d.status = 'deleted' and d.created_at >= coalesce(j.published_at, j.created_at)))
       and (v_sans_lien
            or public.listing_designe(coalesce(j.platform_listing_id, v_item, v_url), d.listing_url, d.platform_listing_id)
            or (v_url is not null and d.listing_url = v_url)
            or (j.platform_listing_id is not null and d.platform_listing_id = j.platform_listing_id))
  ) then
    return null;
  end if;
  v_pf := jsonb_build_object('arme_par', jsonb_build_object(
            'chemin', p_chemin, 'le', now(), 'depot', j.id,
            'pose_par', 'armer_retrait_job (serveur)'));
  if coalesce(p_preuve_geste, false) then
    v_pf := v_pf || jsonb_build_object('preuve', 'geste_deja_vendu');   -- MODIF 2026-09-30
  end if;
  if v_url is null then
    v_pf := v_pf || jsonb_build_object('removal_url_missing', true);
  end if;
  if j.platform = 'beebs' and v_sans_lien then
    v_pf := v_pf || jsonb_build_object('retrait_attend_lien', jsonb_build_object(
              'depuis', now(), 'motif', 'depot_beebs_en_verification_a_la_vente'));
  end if;
  if j.platform = 'vinted' then
    select nullif(btrim(i.vinted_account_id::text), '') into v_compte
      from public.inventaire i where i.id = j.inventaire_id;
    if v_compte is not null then
      v_pf := v_pf || jsonb_build_object('vinted_account_id', v_compte);
    end if;
  end if;
  -- (18/10, retrait Depop 81188384) Le numéro de l'annonce rendu au dépôt
  -- (depop_product_id : POST listing/products → 201 {id, slug}) suit le retrait :
  -- l'extension retire par ce numéro, sans dépendre de la lecture du lien.
  if j.platform = 'depop' and coalesce(j.platform_fields ->> 'depop_product_id', '') ~ '^[0-9]+$' then
    v_pf := v_pf || jsonb_build_object('depop_product_id', j.platform_fields -> 'depop_product_id');
  end if;
  if p_delai is not null and p_delai > interval '0' then
    v_pf := v_pf || jsonb_build_object('next_action_after', to_jsonb(now() + p_delai));
  end if;
  insert into public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  values
    (j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original',
     j.title, v_url, nullif(btrim(coalesce(j.platform_listing_id, '')), ''), v_pf)
  returning id into v_del;
  update public.cross_post_jobs
     set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
           'pending_removal', false,
           'retrait_arme', jsonb_build_object('job', v_del, 'le', now(), 'chemin', p_chemin))
   where id = j.id;
  return v_del;
end;
$function$;
