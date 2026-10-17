-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 — LES TROIS VENTES DE COMMANDES VINTED « FAILED » SEULEMENT SIGNALÉES
-- (décision de Nico, 18/10 : annulées, vente gardée en trace, fiches remises en
-- stock, état Vinted relu, copies retirées remises en vente par les jobs normaux,
-- 0 mail)
-- ═══════════════════════════════════════════════════════════════════════════
-- Les trois (usage_logs vente_vinted_commande_annulee_signalee, motif
-- annulation_anterieure_a_la_regle — les seules du parc, relues le 18/10) :
--   · 108583  f0acd3af  « Casque de Réalité Virtuelle Livoo »  commande 23005108550  10 €
--   · 125191  de63ca45  « BlazBlue: Continuum Shift – PS3 »     commande 23050946301  9,99 €
--             (copies Leboncoin 3285903913, eBay 377559886325, Beebs 34145092 retirées à
--              la vente le 11/10 09:03 — elles reviennent par remises_en_vente_tick)
--   · 167304  6d93b4e5  « Pull fin pailleté noir Mango Basics » commande 22927441285  9,80 €
-- Le geste : la RÈGLE elle-même (vente_commande_annulee_vinted, migration
-- 20261018000000 appliquée avant — garde ci-dessous), appelée une fois par vente avec
-- le numéro de commande relevé : trace ventes_supprimees + usage_logs vente_retiree
-- (reçu compris), fiche au stock, vinted_status du relevé, job Vinted clos ou republié
-- s'il a été revu en ligne, copies à remettre en file.
-- Sauvegardes (relues par l'inverse) : _backup_1810_ventes_failed_{ventes, fiches, jobs,
-- recus, remises}. Inverse : scripts/reparations/20261018_ventes_commandes_failed_INVERSE.sql.
-- AUCUN MAIL : fillsell.push_relance = 1 (push_noter n'appelle jamais push-ventes) ;
-- email_logs et push_ventes « a_envoyer » des trois comptes comptés avant / après dans
-- la transaction — écart non nul → RAISE EXCEPTION, rien n'est écrit.
-- Application : npx supabase db query --linked -f scripts/reparations/20261018_ventes_commandes_failed.sql

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SET LOCAL fillsell.push_relance = '1';

DO $garde$
BEGIN
  IF position('vente_annulee_remise' IN pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'migration 20261018000000 absente : rien n''est fait';
  END IF;
  IF (SELECT count(*) FROM public.ventes WHERE id IN (108583, 125191, 167304) AND plateforme_code = 'vinted') <> 3 THEN
    RAISE EXCEPTION 'les trois ventes ne sont pas (plus) là telles qu''attendues : rien n''est fait';
  END IF;
  IF to_regclass('public._backup_1810_ventes_failed_ventes') IS NOT NULL THEN
    RAISE EXCEPTION 'sauvegarde _backup_1810_ventes_failed_ventes déjà présente : la réparation a déjà tourné, rien n''est fait';
  END IF;
END
$garde$;

-- ── Sauvegardes (lignes entières, to_jsonb) ──────────────────────────────────
CREATE TABLE public._backup_1810_ventes_failed_ventes AS SELECT id, to_jsonb(v) AS ligne FROM public.ventes v WHERE id IN (108583, 125191, 167304);
CREATE TABLE public._backup_1810_ventes_failed_fiches AS SELECT id, to_jsonb(i) AS ligne FROM public.inventaire i WHERE id IN (1786715158533002, 1791648748392, 1788608380708001);
CREATE TABLE public._backup_1810_ventes_failed_jobs AS SELECT id, to_jsonb(c) AS ligne FROM public.cross_post_jobs c WHERE inventaire_id IN (1786715158533002, 1791648748392, 1788608380708001);
CREATE TABLE public._backup_1810_ventes_failed_recus AS SELECT to_jsonb(o) AS ligne FROM public.ventes_operations o
  WHERE o.cle IN ('annonce:vinted:10272733675', 'annonce:vinted:10320086112', 'annonce:vinted:9887248155');
CREATE TABLE public._backup_1810_ventes_failed_remises AS SELECT id, to_jsonb(r) AS ligne FROM public.remises_en_vente r WHERE inventaire_id IN (1786715158533002, 1791648748392, 1788608380708001);
ALTER TABLE public._backup_1810_ventes_failed_ventes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1810_ventes_failed_fiches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1810_ventes_failed_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1810_ventes_failed_recus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1810_ventes_failed_remises ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1810_ventes_failed_ventes, public._backup_1810_ventes_failed_fiches, public._backup_1810_ventes_failed_jobs,
  public._backup_1810_ventes_failed_recus, public._backup_1810_ventes_failed_remises FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _cpt (moment text PRIMARY KEY, mails bigint, notes bigint) ON COMMIT DROP;
INSERT INTO _cpt SELECT 'avant',
  (SELECT count(*) FROM public.email_logs WHERE user_id IN ('f0acd3af-2571-4a7e-a3db-100ee3f7c867', 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e', '6d93b4e5-f3c9-41e7-ad75-2a4a6dcb2c20')),
  (SELECT count(*) FROM public.push_ventes WHERE user_id IN ('f0acd3af-2571-4a7e-a3db-100ee3f7c867', 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e', '6d93b4e5-f3c9-41e7-ad75-2a4a6dcb2c20') AND statut = 'a_envoyer');

-- ── La règle, une fois par vente ──────────────────────────────────────────────
CREATE TEMP TABLE _fait (vente bigint, commande text, resultat jsonb) ON COMMIT DROP;
DO $faire$
DECLARE r jsonb; x record;
BEGIN
  FOR x IN SELECT * FROM (VALUES (108583, '23005108550'), (125191, '23050946301'), (167304, '22927441285')) AS t(vente, commande) ORDER BY vente LOOP
    r := public.vente_commande_annulee_vinted(x.vente, 'failed', x.commande, NULL);
    INSERT INTO _fait VALUES (x.vente, x.commande, r);
    IF r ->> 'action' IS DISTINCT FROM 'retiree' OR r ->> 'fiche' IS DISTINCT FROM 'fiche' THEN
      RAISE EXCEPTION 'vente % : la règle rend % — tout est annulé', x.vente, r::text;
    END IF;
  END LOOP;
END
$faire$;

-- ── Contrôles DANS la transaction ──────────────────────────────────────────────
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
  IF (SELECT count(*) FROM public.ventes WHERE id IN (108583, 125191, 167304)) <> 0 THEN RAISE EXCEPTION 'une vente est encore là : tout est annulé'; END IF;
  IF (SELECT count(*) FROM public.inventaire WHERE id IN (1786715158533002, 1791648748392, 1788608380708001) AND statut = 'stock' AND quantite = 1) <> 3 THEN
    RAISE EXCEPTION 'une fiche n''est pas revenue au stock : tout est annulé';
  END IF;
  IF (SELECT count(*) FROM public.remises_en_vente WHERE inventaire_id = 1791648748392 AND statut = 'a_faire'
        AND job_vendu IN ('37656970-55da-4382-b54f-d777bcc59cd3', '59606544-9fac-4974-82fd-cdb2e54e1153', '21748c34-c045-44cf-87e3-2c99b34e4a28')) <> 3 THEN
    RAISE EXCEPTION 'les 3 copies de 125191 ne sont pas en file de remise en vente : tout est annulé';
  END IF;
END
$verif$;

SELECT f.vente, f.commande, f.resultat,
       (SELECT statut || '/' || coalesce(quantite::text, '∅') || '/' || coalesce(vinted_status, '∅') FROM public.inventaire WHERE id = (SELECT (ligne ->> 'inventaire_id')::bigint FROM public._backup_1810_ventes_failed_ventes b WHERE b.id = f.vente)) AS fiche,
       (SELECT count(*) FROM public.ventes_supprimees s WHERE s.vente_id = f.vente) AS supprimee,
       (SELECT count(*) FROM public.remises_en_vente r WHERE r.inventaire_id = (SELECT (ligne ->> 'inventaire_id')::bigint FROM public._backup_1810_ventes_failed_ventes b WHERE b.id = f.vente) AND r.statut = 'a_faire') AS copies_en_file,
       (SELECT mails FROM _cpt WHERE moment = 'avant') || '→' || (SELECT mails FROM _cpt WHERE moment = 'apres') AS mails
  FROM _fait f ORDER BY f.vente;

COMMIT;
