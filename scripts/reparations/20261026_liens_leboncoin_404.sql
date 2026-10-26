-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 26/10 (bloc A1, Elodie82) — LES LIENS LEBONCOIN QUI MÈNENT À UNE 404
-- ═══════════════════════════════════════════════════════════════════════════
-- Le portefeuille Celine d'Elodie82 (fiche 1792947185695, vendu sur Vinted) est resté en ligne sur Leboncoin : son
-- retrait 35873583 ouvrait https://www.leboncoin.fr/ad/3295261130, que Leboncoin redirige vers /ad/ad/3295261130 —
-- une page 404 dont la garde d'identité a lu le titre « 404 » et abandonné. Relevé réel du 26/10 (vrai navigateur) :
-- /ad/<id> et /ad/x/<id> → 404 ; /ad/<n'importe quel rayon réel>/<id> → l'annonce (portefeuille en ligne, lu sous
-- /ad/vetements/3295261130 et /ad/accessoires_bagagerie/3295261130).
-- La RÈGLE est corrigée (annonce-lien.ts → get-pending-jobs, extension 0.6.147, depot-coupe-tranche). Ce script
-- applique la même règle aux lignes déjà écrites, tous comptes : jobs Leboncoin VIVANTS (pending, processing,
-- needs_user, published) et annonces de relevé dont le lien n'a pas de rayon réel → /ad/vetements/<id>, l'identifiant
-- étant celui du job (platform_listing_id) sinon celui du lien. Les jobs clos (cancelled, deleted, failed) ne sont
-- pas réécrits (aucune ligne inutile). Trace : platform_fields.lien_reecrit (avant, après, par).
-- Sauvegardes : _backup_2610_liens_lbc_jobs, _backup_2610_liens_lbc_annonces (RLS, aucun droit).
-- Inverse : 20261026_liens_leboncoin_404_INVERSE.sql. Aucun mail, rien n'est publié ni retiré par ce script.
-- Essai à blanc : remplacer COMMIT par ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2610_liens_lbc_jobs AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2610_liens_lbc_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2610_liens_lbc_jobs FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS public._backup_2610_liens_lbc_annonces AS
  SELECT now() AS sauvegarde_le, a.* FROM public.annonces_plateforme a WHERE false;
ALTER TABLE public._backup_2610_liens_lbc_annonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2610_liens_lbc_annonces FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_2610_liens_lbc_jobs
SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.platform = 'leboncoin' AND c.status IN ('pending', 'processing', 'needs_user', 'published')
   AND c.listing_url ~ 'leboncoin\.fr/ad/([^/?#]+/)?[0-9]{6,}([/?#]|$)'
   AND NOT (c.listing_url ~ '^https://www\.leboncoin\.fr/ad/[a-z_]+/[0-9]{6,}([/?#]|$)'
            AND c.listing_url !~ '^https://www\.leboncoin\.fr/ad/(ad|x)/');

INSERT INTO public._backup_2610_liens_lbc_annonces
SELECT now(), a.* FROM public.annonces_plateforme a
 WHERE a.platform = 'leboncoin' AND a.url ~ '^https://www\.leboncoin\.fr/ad/((ad|x)/)?[0-9]{6,}/?$';

DO $$
DECLARE nj integer; na integer; attendus_j integer; attendus_a integer;
BEGIN
  SELECT count(*) INTO attendus_j FROM public._backup_2610_liens_lbc_jobs;
  SELECT count(*) INTO attendus_a FROM public._backup_2610_liens_lbc_annonces;
  IF attendus_j > 20 OR attendus_a > 40 THEN
    RAISE EXCEPTION 'périmètre plus large que relevé (% jobs, % annonces) — rien n''est fait', attendus_j, attendus_a;
  END IF;
  UPDATE public.cross_post_jobs c
     SET listing_url = 'https://www.leboncoin.fr/ad/vetements/'
           || COALESCE(NULLIF(substring(c.platform_listing_id from '^[0-9]{6,}$'), ''), substring(c.listing_url from 'leboncoin\.fr/ad/(?:[^/?#]+/)?([0-9]{6,})')),
         platform_fields = COALESCE(c.platform_fields, '{}'::jsonb) || jsonb_build_object('lien_reecrit', jsonb_build_object(
           'le', now(), 'avant', c.listing_url, 'par', 'scripts/reparations/20261026_liens_leboncoin_404.sql',
           'motif', 'lien Leboncoin sans rayon réel (page 404) — relevé réel du 26/10'))
   WHERE c.id IN (SELECT id FROM public._backup_2610_liens_lbc_jobs);
  GET DIAGNOSTICS nj = ROW_COUNT;
  UPDATE public.annonces_plateforme a
     SET url = 'https://www.leboncoin.fr/ad/vetements/' || a.listing_id
   WHERE a.id IN (SELECT id FROM public._backup_2610_liens_lbc_annonces) AND a.listing_id ~ '^[0-9]{6,}$';
  GET DIAGNOSTICS na = ROW_COUNT;
  IF nj <> attendus_j OR na <> attendus_a THEN
    RAISE EXCEPTION 'jobs %/% , annonces %/% — rien n''est fait', nj, attendus_j, na, attendus_a;
  END IF;
  RAISE NOTICE 'liens réécrits : % jobs, % annonces de relevé', nj, na;
END $$;
SELECT c.id, c.user_id, c.action, c.status, b.listing_url AS avant, c.listing_url AS apres
  FROM public.cross_post_jobs c JOIN public._backup_2610_liens_lbc_jobs b ON b.id = c.id ORDER BY c.created_at;
COMMIT;
