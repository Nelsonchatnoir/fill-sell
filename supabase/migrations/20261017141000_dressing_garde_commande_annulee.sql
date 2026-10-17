-- ═══════════════════════════════════════════════════════════════════════════
-- 17/10 — LE DRESSING NE DÉFAIT PLUS UNE COMMANDE VINTED ANNULÉE (point 12)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (lecture seule, 17/10) : le 16/10 à 01:35:22, la 0.6.114 a traité seule la
-- commande Vinted annulée 23140574853 de Louis (statut « failed ») : 4 ventes
-- retirées, 4 fiches remises au stock, 4 jobs clos. Le 17/10 à 01:18, la synchro du
-- dressing a repassé ces 4 fiches « vendu » (vinted_status « sold »), sans vente ni
-- ligne de journal. Deux faits :
--   · Vinted garde l'annonce d'origine « sold » (is_closed + item_closing_action
--     'sold') après une commande « failed » — 4 cas sur 4 relevés au 17/10 (Louis et
--     trois autres comptes, encore « sold » des jours après l'annulation) ;
--   · la garde du 11/10 (inventaire_vendu_vinted_par_la_vente) laisse passer le
--     « vendu » direct quand aucun job Vinted n'est vivant (« import pur ») — le cas
--     de toute annonce dont la commande a été annulée (job clos).
-- Le même sort attend toute fiche rendue au stock par vente_commande_annulee_vinted,
-- au dressing suivant.
--
-- LA RÈGLE (dans la garde du 11/10, sans toucher son chemin « job vivant » ni son
-- déclencheur) : une écriture du CLIENT (synchro du dressing) qui passe une fiche
-- stock → vendu sur une annonce « sold » est retenue — la fiche garde son statut, sa
-- quantité et son état d'annonce — quand, en même temps :
--   · aucun job Vinted vivant ne porte cette annonce ;
--   · une vente de CETTE annonce a été retirée pour commande annulée
--     (ventes_supprimees : vinted, source releve_vinted, motif commande_…) ;
--   · aucun relevé n'a revu l'annonce en ligne (active, réservée, masquée) depuis ;
--   · aucune vente n'est écrite pour la fiche ou pour l'annonce.
-- Partout ailleurs, rien ne change : job vivant → signal sur le job (11/10) ; import
-- pur sans annulation → « vendu » direct (03/08) ; écriture du serveur → jamais
-- retenue (le déclencheur ne vise que current_user = authenticated) ; annonce revue en
-- ligne puis revendue → « vendu » comme avant ; vente écrite → le statut suit.
-- Rien n'est jamais retiré, republié ni envoyé par cette garde.
-- ⚠️ Décision de Nico : si Vinted remet l'article en vente sous un NOUVEAU numéro et
--    qu'il se revend (rachat probable du lot A de Louis le 13/10 à 13:22), FillSell ne
--    le voit pas : la fiche reste « stock ».
-- Corps de départ : pg_get_functiondef EN PROD le 17/10 à 14:05 (migration
-- 20261011120000) ; md5 vérifié ci-dessous : la migration S'ARRÊTE si la définition a
-- bougé depuis. Des lignes sont seulement AJOUTÉES.
--
-- ⛔ ORDRE : APRÈS la vérification du lot B de Louis par Nico. Vraie vente :
--    scripts/reparations/20261017_louis_lot_b_remise_ventes.sql D'ABORD (sinon la
--    garde garderait ses 4 fiches en stock). Annulation confirmée : cette migration
--    AVANT le prochain dressing de Louis (vers 01:18), puis
--    scripts/reparations/20261017_louis_lot_b_annulation_confirmee.sql si le dressing
--    est passé avant.
-- Essai à blanc (ROLLBACK) : scripts/essais/20261017141000_essai.sql.
-- Inverse : supabase/rollbacks/20261017141000_dressing_garde_commande_annulee.sql.
-- ⛔ FEU VERT NOMMÉ DE NICO REQUIS. Application :
--   npx supabase db query --linked -f supabase/migrations/20261017141000_dressing_garde_commande_annulee.sql
--   npx supabase migration repair --linked --status applied 20261017141000
-- Selftests : scripts/dressing-garde-commande-annulee-selftest.mjs,
--             scripts/declencheurs-droits-selftest.mjs.

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- ═══ CORPS DE LA MIGRATION (repris à l'octet par l'essai à blanc) ═══════════
-- ── 0. La définition de prod n'a pas bougé depuis sa lecture (17/10 14:05) ──
DO $garde$
BEGIN
  IF md5(pg_get_functiondef('public.inventaire_vendu_vinted_par_la_vente()'::regprocedure))
     IS DISTINCT FROM 'a63b6f1128757a0b767dd2852a094f57' THEN
    RAISE EXCEPTION 'inventaire_vendu_vinted_par_la_vente a changé en prod depuis le 17/10 14:05 : migration arrêtée, rien n''est écrit';
  END IF;
END
$garde$;

-- ── 1. inventaire_vendu_vinted_par_la_vente : une commande annulée ne repasse pas la fiche « vendue » ──
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
    -- (17/10) UNE COMMANDE VINTED ANNULÉE NE REPASSE PAS LA FICHE « VENDUE » : après
    -- une commande « failed », Vinted garde l'annonce d'origine « sold » (is_closed +
    -- item_closing_action 'sold') — 4 cas sur 4 relevés au 17/10. Sans job vivant, tant
    -- que CETTE annonce n'a pas été revue en ligne depuis l'annulation et qu'aucune
    -- vente n'est écrite pour la fiche ou l'annonce, la fiche garde son statut, sa
    -- quantité et son état d'annonce (le dressing du 17/10 01:18 avait défait le retour
    -- au stock du lot de Louis, sans vente ni journal). Job vivant : règle du 11/10.
    if v_job is null
       and exists (select 1 from public.ventes_supprimees s
                    where s.user_id = new.user_id and s.plateforme_code = 'vinted' and s.annonce_id = v_id
                      and s.source = 'releve_vinted' and left(s.motif, 9) = 'commande_'
                      and not exists (select 1 from public.vinted_listing_snapshots x
                                       where x.user_id = new.user_id and x.vinted_item_id = v_id
                                         and x.status in ('active', 'reserved', 'hidden')
                                         and x.captured_at > s.supprimee_le))
       and not exists (select 1 from public.ventes v
                        where v.user_id = new.user_id and (v.inventaire_id = new.id or v.annonce_id = v_id)) then
      new.statut := old.statut;
      new.quantite := old.quantite;
      new.vinted_status := coalesce(old.vinted_status, 'closed');
      raise log 'inventaire_vendu_vinted_par_la_vente : fiche % (annonce %) gardée en stock — commande Vinted annulée, annonce jamais revue en ligne',
        new.id, v_id;
      return new;
    end if;
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
$function$
;
-- ═══ FIN DU CORPS DE LA MIGRATION ═══════════════════════════════════════════

COMMIT;
