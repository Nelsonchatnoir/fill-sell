-- INVERSE de scripts/reparations/20261018_ventes_commandes_failed.sql : remet les trois
-- ventes (108583, 125191, 167304), leurs fiches, leurs jobs, leurs reçus et les lignes
-- remises_en_vente EXACTEMENT comme avant la réparation, depuis les sauvegardes
-- _backup_1810_ventes_failed_* (lignes entières). Retire aussi : les traces
-- ventes_supprimees de ces ventes (sinon « cette vente ne revient jamais »), les lignes
-- remises_en_vente et les marqueurs vente_annulee_remise nés de la réparation, les
-- publications que remises_en_vente_tick aurait créées depuis (statut 'cancelled', jamais
-- effacées : une annonce peut déjà être partie — à retirer par le circuit normal si c'est
-- le cas), les lignes inventaire_journal de la réparation. Les usage_logs vente_retiree
-- restent (trace). AUCUN MAIL (mêmes gardes et compteurs que la réparation).
-- Application : npx supabase db query --linked -f scripts/reparations/20261018_ventes_commandes_failed_INVERSE.sql

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SET LOCAL fillsell.push_relance = '1';
SET LOCAL fillsell.sans_retrait = '1';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1810_ventes_failed_ventes') IS NULL THEN RAISE EXCEPTION 'sauvegarde absente : rien n''est fait'; END IF;
  IF (SELECT count(*) FROM public.ventes WHERE id IN (108583, 125191, 167304)) <> 0 THEN RAISE EXCEPTION 'une des ventes existe déjà : rien n''est fait'; END IF;
END
$garde$;

CREATE TEMP TABLE _cpt (moment text PRIMARY KEY, mails bigint, notes bigint) ON COMMIT DROP;
INSERT INTO _cpt SELECT 'avant',
  (SELECT count(*) FROM public.email_logs WHERE user_id IN ('f0acd3af-2571-4a7e-a3db-100ee3f7c867', 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e', '6d93b4e5-f3c9-41e7-ad75-2a4a6dcb2c20')),
  (SELECT count(*) FROM public.push_ventes WHERE user_id IN ('f0acd3af-2571-4a7e-a3db-100ee3f7c867', 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e', '6d93b4e5-f3c9-41e7-ad75-2a4a6dcb2c20') AND statut = 'a_envoyer');

-- 1. Les publications nées de la remise en vente après annulation : closes (jamais effacées).
UPDATE public.cross_post_jobs c SET status = 'cancelled',
       error = 'Remise en vente annulée (inverse de la réparation du 18/10) : si l''annonce est partie, retire-la depuis l''app.'
 WHERE c.inventaire_id IN (1786715158533002, 1791648748392, 1788608380708001)
   AND (c.platform_fields #>> '{remise_en_vente,apres_annulation}') = 'true'
   AND c.status IN ('pending', 'processing', 'needs_user');

-- 2. Les lignes remises_en_vente : celles de la réparation retirées, celles d'avant remises.
DELETE FROM public.remises_en_vente WHERE inventaire_id IN (1786715158533002, 1791648748392, 1788608380708001);
INSERT INTO public.remises_en_vente SELECT (jsonb_populate_record(NULL::public.remises_en_vente, ligne)).* FROM public._backup_1810_ventes_failed_remises;

-- 3. Les jobs : lignes entières d'avant (statut, erreur, platform_fields, sold_at…).
UPDATE public.cross_post_jobs c SET
  status = r.status, error = r.error, platform_fields = r.platform_fields, sold_at = r.sold_at,
  last_checked_at = r.last_checked_at, platform_listing_id = r.platform_listing_id, listing_url = r.listing_url
FROM (SELECT (jsonb_populate_record(NULL::public.cross_post_jobs, ligne)).* FROM public._backup_1810_ventes_failed_jobs) r
WHERE c.id = r.id;

-- 4. Les fiches : statut, quantité, état d'annonce d'avant.
UPDATE public.inventaire i SET statut = r.statut, quantite = r.quantite, vinted_status = r.vinted_status
FROM (SELECT (jsonb_populate_record(NULL::public.inventaire, ligne)).* FROM public._backup_1810_ventes_failed_fiches) r
WHERE i.id = r.id;

-- 5. Les ventes (mêmes id, toutes les colonnes), puis les reçus.
INSERT INTO public.ventes SELECT (jsonb_populate_record(NULL::public.ventes, ligne)).* FROM public._backup_1810_ventes_failed_ventes;
DELETE FROM public.ventes_operations o WHERE o.cle IN ('annonce:vinted:10272733675', 'annonce:vinted:10320086112', 'annonce:vinted:9887248155');
INSERT INTO public.ventes_operations SELECT (jsonb_populate_record(NULL::public.ventes_operations, ligne)).* FROM public._backup_1810_ventes_failed_recus;

-- 6. Les traces qui empêcheraient la vente de revenir, et le journal de la réparation.
DELETE FROM public.ventes_supprimees WHERE vente_id IN (108583, 125191, 167304);
DELETE FROM public.inventaire_journal WHERE motif = 'commande_annulee' AND inventaire_id IN (1786715158533002, 1791648748392, 1788608380708001)
  AND detail ->> 'vente' IN ('108583', '125191', '167304');

INSERT INTO _cpt SELECT 'apres',
  (SELECT count(*) FROM public.email_logs WHERE user_id IN ('f0acd3af-2571-4a7e-a3db-100ee3f7c867', 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e', '6d93b4e5-f3c9-41e7-ad75-2a4a6dcb2c20')),
  (SELECT count(*) FROM public.push_ventes WHERE user_id IN ('f0acd3af-2571-4a7e-a3db-100ee3f7c867', 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e', '6d93b4e5-f3c9-41e7-ad75-2a4a6dcb2c20') AND statut = 'a_envoyer');
DO $verif$
DECLARE a record; b record;
BEGIN
  SELECT * INTO a FROM _cpt WHERE moment = 'avant'; SELECT * INTO b FROM _cpt WHERE moment = 'apres';
  IF a.mails <> b.mails OR a.notes <> b.notes THEN
    RAISE EXCEPTION 'un mail ou une note serait parti (mails % → %, notes % → %) : tout est annulé', a.mails, b.mails, a.notes, b.notes;
  END IF;
  IF (SELECT count(*) FROM public.ventes v JOIN public._backup_1810_ventes_failed_ventes b ON b.id = v.id WHERE to_jsonb(v) = b.ligne) <> 3 THEN
    RAISE EXCEPTION 'une vente remise diffère de sa sauvegarde : tout est annulé';
  END IF;
END
$verif$;

SELECT v.id, v.titre, v.prix_vente, i.statut, i.quantite, i.vinted_status FROM public.ventes v JOIN public.inventaire i ON i.id = v.inventaire_id WHERE v.id IN (108583, 125191, 167304) ORDER BY v.id;

COMMIT;
