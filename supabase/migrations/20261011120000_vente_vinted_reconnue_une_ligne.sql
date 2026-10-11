-- ═══════════════════════════════════════════════════════════════════════════
-- 20261011120000 — TOUTE VENTE VINTED RECONNUE A SA LIGNE DE VENTE, UNE SEULE
-- (11/10, lot unique de Nico — A5)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (11/10) : 35 annonces Vinted mailées « vendu » chez 14 comptes ont
-- leur fiche passée « vendu » par la synchro du dressing ; 22 (+1 à 10:35)
-- n'ont AUCUNE ligne dans `ventes` — ni compta, ni retrait des copies.
--
-- CAUSE EXACTE : la migration 20261009130000 (vinted_preuve_page) a posé le
-- déclencheur BEFORE UPDATE `cross_post_jobs_vinted_preuve_page`, dont la
-- fonction `vinted_preuve_page_veilleur()` s'exécute avec les droits de
-- l'APPELANT et appelle `public._ts_ou_null` — or EXECUTE sur _ts_ou_null est
-- retiré à `authenticated` depuis le 27/09 (20260927113000). Effet, depuis le
-- 09/10 ~12:00 : tout PATCH de l'extension qui pose `sale_signal = 'sold'` sur
-- un job Vinted tombe en 403 « permission denied for function _ts_ou_null »
-- (7 797 refus en 24 h, 67 jobs). L'extension retombe alors sur son repli
-- historique (background.js ~18881 : `statut: 'vendu'` posé directement par
-- l'upsert du dressing) : fiche vendue SANS ligne de vente, SANS retrait des
-- copies, et la note « vendu » part par le relevé (inventaire_push_vinted_vendu).
-- Dernier sale_signal Vinted écrit dans toute la base : 09/10 11:43:52.
-- Même classe d'incident que le 04/10 (20261005090000).
--
-- LA RÈGLE, À LA RACINE, INDÉPENDANTE DE LA VERSION DE L'EXTENSION :
--  1. le déclencheur s'exécute en SECURITY DEFINER (search_path figé), comme
--     les autres déclencheurs de cross_post_jobs — corps inchangé à l'octet ;
--  2. une fiche Vinted qu'un client (extension, rôle authenticated) passe de
--     « stock » à « vendu » parce que le dressing dit « sold », ALORS qu'un job
--     Vinted VIVANT porte cette annonce exacte et qu'aucune vente n'est écrite,
--     ne passe plus « vendu » en silence : la fiche reste en stock et le signal
--     de vente est posé sur le job — exactement ce que l'extension voulait
--     écrire. La vente suit alors le chemin unique (ventes_prouvees_tick →
--     enregistrer_vente_prouvee → enregistrer_vente_atomique) : UNE ligne de
--     vente, le stock, les retraits des copies prouvées ; sans preuve, la
--     question « Vendue ? » de l'app. Sans job vivant (import pur), rien ne
--     change (comportement du 03/08). Une vente déjà écrite (ligne ou reçu) :
--     rien ne change non plus.
--
-- Contrôle de classe (ne plus jamais) : `npm run selftest:declencheurs-droits --
-- --prod` — aucun déclencheur exécuté avec les droits de l'appelant n'appelle
-- une fonction fermée à authenticated (relu le 11/10 : celui-ci était le seul).
--
-- Rattrapage (fiches déjà passées « vendu » sans ligne depuis le 09/10 11:43) :
-- scripts/reparations/20261011_ventes_vinted_sans_ligne.mjs (à blanc par défaut,
-- feu vert nommé, sauvegarde avant, aucune notification, aucun mail).
-- Inverse : scripts/reparations/20261011_inverse_vente_vinted_reconnue_une_ligne.sql
-- Preuve (transaction annulée) : node scripts/preuves/preuve-vente-vinted-une-ligne.mjs --avec-migration=20261011120000
--
-- MESURE (« tâche automatique mesurée, bornée ») : aucune tâche nouvelle. Le
-- déclencheur 2 ne s'exécute que sur la transition stock → vendu d'une fiche
-- écrite par un client avec vinted_status = 'sold' (quelques dizaines par jour au
-- parc), lecture indexée (cross_post_jobs par user_id/platform, ventes par
-- user_id/inventaire_id et annonce_id, ventes_operations unique).
-- Application (règle du 01/10) :
--   npx supabase db query --linked -f supabase/migrations/20261011120000_vente_vinted_reconnue_une_ligne.sql
--   npx supabase migration repair --linked --status applied 20261011120000

-- ── 1. Le signal de vente Vinted n'est plus refusé (403) ───────────────────
CREATE OR REPLACE FUNCTION public.vinted_preuve_page_veilleur()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id  text := nullif(btrim(coalesce(new.platform_listing_id, '')), '');
  v_sig timestamptz := public._ts_ou_null(new.platform_fields ->> 'unavailable_since');
begin
  if v_id is null or v_sig is null or new.last_checked_at is null then return new; end if;
  -- Le veilleur écrit sa lecture (last_checked_at) et son signal dans la MÊME
  -- écriture ; la synchro du dressing ne touche jamais last_checked_at.
  if new.last_checked_at is not distinct from old.last_checked_at then return new; end if;
  if abs(extract(epoch from (new.last_checked_at - v_sig))) > 2 then return new; end if;
  -- La page lue est celle de listing_url : son numéro doit être CELUI du job.
  if coalesce(substring(new.listing_url from '/items/([0-9]+)'), '') <> v_id then return new; end if;
  new.platform_fields := new.platform_fields || jsonb_build_object('sale_evidence', jsonb_build_object(
    'platform', 'vinted', 'listing_id', v_id, 'state', 'sold', 'exact', true,
    'source', 'page_annonce_veilleur', 'lu_le', new.platform_fields ->> 'unavailable_since',
    'pose_par', 'vinted_preuve_page_veilleur'));
  return new;
end;
$function$;

-- ── 2. Une fiche vendue par le dressing passe par LA vente ─────────────────
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
$function$;

DROP TRIGGER IF EXISTS inventaire_0_vendu_vinted_par_la_vente ON public.inventaire;
-- « 0 » : avant les autres déclencheurs BEFORE UPDATE de la fiche (ordre
-- alphabétique), pour qu'ils voient le statut gardé.
CREATE TRIGGER inventaire_0_vendu_vinted_par_la_vente
  BEFORE UPDATE OF statut ON public.inventaire
  FOR EACH ROW
  WHEN (old.statut = 'stock' AND new.statut = 'vendu' AND new.vinted_status = 'sold'
        AND current_user = 'authenticated'::name)
  EXECUTE FUNCTION public.inventaire_vendu_vinted_par_la_vente();

