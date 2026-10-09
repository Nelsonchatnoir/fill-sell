-- ═══════════════════════════════════════════════════════════════════════════
-- 20261009130000 — LA LECTURE DE PAGE DU VEILLEUR VINTED EST UNE PREUVE DE VENTE
-- (09/10, Bebertdeals — chantier D, partie 1)
-- ═══════════════════════════════════════════════════════════════════════════
-- 09/10 11:43 : le veilleur de l'extension de Bebertdeals lit « vendue » sur la
-- PAGE de deux annonces Vinted (10282272590, 10293985723 ; numéro exact,
-- is_closed + item_closing_action « sold » ; pages publiques ouvertes sans
-- session : « Vendu »). Deux mails « vendu » partent à 11:46 — mais AUCUNE
-- vente n'est enregistrée : ventes_prouvees_tick (cron 52) ne reconnaît pour
-- Vinted que le relevé du DRESSING « sold » ou une sale_evidence exacte, que le
-- veilleur de page n'écrit pas pour Vinted. Article en stock, copies en ligne
-- ailleurs : risque de double vente.
-- Mesuré (06/10 → 09/10) : 58 signaux du veilleur de page — 0 démenti, 44
-- confirmés plus tard par un relevé « sold », les 11 restants TOUS « Vendu »
-- sur leur page publique. (Les 4 faux de la période viennent de la SYNCHRO du
-- dressing — Louis — qui n'est PAS une preuve ici.)
--
-- LA RÈGLE : la lecture de la page de l'annonce, sur son numéro exact, est une
-- preuve exacte (comme eBay et Depop) : posée en sale_evidence au moment même
-- où le veilleur écrit son signal → cron 52 : vente, article vendu, retraits
-- des copies prouvées (enregistrer_vente_atomique, gardes inchangées), PUIS le
-- mail par le chemin d'aujourd'hui. Signature du veilleur : last_checked_at et
-- unavailable_since écrits ensemble (±2 s ; la synchro du dressing ne touche
-- jamais last_checked_at), lien de l'annonce = numéro du job.
-- Les signaux posés AVANT cette migration ne sont pas rattrapés (11 ventes
-- réelles : réparation sur GO de Nico).
-- La partie 2 (aucun mail « vendu » avant la vente enregistrée) est dans
-- 20261009160000_mail_apres_la_vente.sql, NON APPLIQUÉE : elle ferait perdre
-- son mail à une vraie vente non prouvée (RoCotCot, Leboncoin, 08/10) —
-- décision de Nico.
-- Inverse : scripts/reparations/20261009_inverse_vinted_preuve_page.sql.
-- Preuve (transaction annulée, aucun mail) : node scripts/push/preuve-mail-apres-vente.mjs --avec-migration=20261009160000
--
-- MESURE (« tâche automatique mesurée, bornée ») : aucune tâche nouvelle ; le
-- déclencheur ne s'exécute que sur la transition sale_signal → « sold » d'un
-- job Vinted publié (≈ 20 par jour au parc), sans lecture de table.

-- ── 1. La lecture de page du veilleur Vinted = preuve exacte ───────────────
CREATE OR REPLACE FUNCTION public.vinted_preuve_page_veilleur()
 RETURNS trigger
 LANGUAGE plpgsql
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

-- <declencheur>
DROP TRIGGER IF EXISTS cross_post_jobs_vinted_preuve_page ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_vinted_preuve_page
  BEFORE UPDATE OF platform_fields ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (new.platform = 'vinted' AND new.action IN ('publish', 'republish') AND new.status = 'published'
        AND (new.platform_fields ->> 'sale_signal') = 'sold'
        AND (old.platform_fields ->> 'sale_signal') IS DISTINCT FROM 'sold'
        AND NOT (new.platform_fields ? 'sale_evidence'))
  EXECUTE FUNCTION public.vinted_preuve_page_veilleur();
-- </declencheur>
