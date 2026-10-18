-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 — LOT 4 : LES 6 VENTES BEEBS RANGÉES « AILLEURS » DEVIENNENT « BEEBS »
-- ═══════════════════════════════════════════════════════════════════════════
-- Ventes 77407, 87308, 94454, 125115, 142259, 158347 : déclarées au clic sur la carte de l'annonce BEEBS
-- (« Plus en ligne — vendue ? » → Oui), écrites « Ailleurs » par enregistrer_vente_declaree (règle du 28/09).
-- Preuve par vente (relue le 18/10) : son reçu ventes_operations 'annonce:beebs:<n>' pointe le job Beebs
-- vendu de CE compte, et ventes.annonce_id = ce numéro.
-- Forme écrite : celle des ventes Beebs déjà en base et de enregistrer_vente_atomique (j.platform) —
-- ventes.plateforme = 'beebs', plateforme_code = 'beebs' ; inventaire.plateforme = 'beebs' (976 fiches
-- Beebs en minuscules au 18/10). La vente 87308 n'a pas de fiche (job sans fiche) : 5 fiches seulement.
-- AUCUN MAIL : aucun déclencheur sur UPDATE de ventes (INSERT / DELETE seulement) ni sur
-- inventaire.plateforme (relu le 18/10) ; email_logs, push_ventes et la file pg_net sont comptés
-- avant/après — un écart annule tout.
-- Sauvegarde : _backup_1810_ventes_beebs_ailleurs (lignes entières).
-- Inverse : scripts/reparations/20261018_ventes_beebs_ailleurs_INVERSE.sql
-- Application : npx supabase db query --linked -f scripts/reparations/20261018_ventes_beebs_ailleurs.sql
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1810_ventes_beebs_ailleurs') IS NOT NULL THEN
    RAISE EXCEPTION 'sauvegarde déjà présente : la réparation a déjà tourné, rien n''est fait';
  END IF;
  IF (SELECT count(*) FROM public.ventes v
        JOIN public.ventes_operations o ON o.user_id = v.user_id AND o.cle = 'annonce:beebs:' || v.annonce_id
                                       AND o.resultat -> 'ventes_ids' @> to_jsonb(ARRAY[v.id])
        JOIN public.cross_post_jobs j ON j.id = o.job_id AND j.user_id = v.user_id AND j.platform = 'beebs'
                                     AND j.status = 'sold' AND btrim(j.platform_listing_id) = v.annonce_id
       WHERE v.id IN (77407, 87308, 94454, 125115, 142259, 158347)
         AND v.plateforme = 'Ailleurs' AND v.plateforme_code = 'ailleurs') <> 6 THEN
    RAISE EXCEPTION 'les 6 ventes ne sont pas (plus) telles qu''attendues (Ailleurs, reçu du job Beebs vendu) : rien n''est fait';
  END IF;
  IF (SELECT count(*) FROM public.inventaire i
       WHERE i.id IN (1790957496052, 1789717154274007, 1791049826121, 1789220073010002, 1791818441953)
         AND i.plateforme = 'Ailleurs' AND i.statut = 'vendu') <> 5 THEN
    RAISE EXCEPTION 'les 5 fiches ne sont pas (plus) telles qu''attendues (Ailleurs, vendues) : rien n''est fait';
  END IF;
END
$garde$;

CREATE TABLE public._backup_1810_ventes_beebs_ailleurs (quoi text, id bigint, ligne jsonb);
ALTER TABLE public._backup_1810_ventes_beebs_ailleurs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1810_ventes_beebs_ailleurs FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_1810_ventes_beebs_ailleurs
  SELECT 'vente', v.id, to_jsonb(v) FROM public.ventes v WHERE v.id IN (77407, 87308, 94454, 125115, 142259, 158347);
INSERT INTO public._backup_1810_ventes_beebs_ailleurs
  SELECT 'fiche', i.id, to_jsonb(i) FROM public.inventaire i
   WHERE i.id IN (1790957496052, 1789717154274007, 1791049826121, 1789220073010002, 1791818441953);

CREATE TEMP TABLE _cpt ON COMMIT DROP AS
  SELECT (SELECT count(*) FROM public.email_logs) AS mails, (SELECT count(*) FROM public.push_ventes) AS notes,
         (SELECT count(*) FROM net.http_request_queue) AS appels;

UPDATE public.ventes SET plateforme = 'beebs', plateforme_code = 'beebs'
 WHERE id IN (77407, 87308, 94454, 125115, 142259, 158347) AND plateforme = 'Ailleurs' AND plateforme_code = 'ailleurs';
UPDATE public.inventaire SET plateforme = 'beebs'
 WHERE id IN (1790957496052, 1789717154274007, 1791049826121, 1789220073010002, 1791818441953) AND plateforme = 'Ailleurs';

DO $controle$
BEGIN
  IF (SELECT count(*) FROM public.ventes WHERE id IN (77407, 87308, 94454, 125115, 142259, 158347)
        AND plateforme = 'beebs' AND plateforme_code = 'beebs') <> 6
     OR (SELECT count(*) FROM public.inventaire WHERE id IN (1790957496052, 1789717154274007, 1791049826121, 1789220073010002, 1791818441953)
        AND plateforme = 'beebs' AND statut = 'vendu') <> 5
     OR (SELECT count(*) FROM public.email_logs) <> (SELECT mails FROM _cpt)
     OR (SELECT count(*) FROM public.push_ventes) <> (SELECT notes FROM _cpt)
     OR (SELECT count(*) FROM net.http_request_queue) <> (SELECT appels FROM _cpt) THEN
    RAISE EXCEPTION 'contrôle après écriture en écart (ventes, fiches, mails, notes ou appels sortants) : tout est annulé';
  END IF;
END
$controle$;

SELECT v.id, v.plateforme, v.plateforme_code FROM public.ventes v WHERE v.id IN (77407, 87308, 94454, 125115, 142259, 158347) ORDER BY v.id;
COMMIT;
