-- (27/10) Réparation : les fiches nées d'un relevé pour une annonce qu'un dépôt FillSell du compte portait déjà
-- (rapport docs/enquetes/doublons-identifiant-2710/RAPPORT.md). Rien n'est réparé « à la main » : la RÈGLE
-- (fiche_releve_doublon_resorber, migration 20261027120000) passe sur chaque annonce du parc dont l'identifiant est
-- porté par un dépôt FillSell (publié, vendu ou annulé, hors jobs de suivi d'un relevé) d'une AUTRE fiche vivante.
-- Relu le 27/10 sur tout le parc : 4 annonces —
--   · Nico, Depop nvlsonchatnoir-roman-en-tres-bon-etat-30fa : fiche 1793089261133 née du relevé, intacte → résorbée
--     (l'annonce rejoint 1793009407689006 et son dépôt 6eef55a8 ; le job de suivi dc8dca7a est clos) ;
--   · XEWER, Leboncoin 3295236977 : fiche 1792999747010 VENDUE avec une vente (315890) → à signaler, rien écrit ;
--   · Johan, Beebs 34209247 : fiche 1792909660810 créée par Johan (4 dépôts) → à signaler, rien écrit ;
--   · afeef3c7, Leboncoin 3265366309 : rattachée par la PERSONNE le 18/09 à une fiche Vinted (dépôt annulé ailleurs) → à signaler, rien écrit.
-- Gardes : la migration appliquée ; sauvegarde protégée avant ; la règle refuse toute fiche qui n'est pas née d'un relevé
-- ou pas intacte (vente, autre annonce, job hors relevé ou en cours, saisie de la personne). Aucun geste sur une
-- plateforme, aucune vente touchée, aucun quota, aucun mail.
-- Inverse : scripts/reparations/20261027_doublons_identifiant_INVERSE.sql (depuis la sauvegarde).
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE public._backup_2710_doublons_paires AS
  SELECT DISTINCT ON (a.id) now() AS sauvegarde_le, a.id AS annonce_id, a.user_id, a.platform, a.listing_id,
         a.inventaire_id AS fiche_annonce, a.job_id AS job_annonce, a.source_rapprochement, j.id AS depot, j.inventaire_id AS fiche_depot
    FROM public.annonces_plateforme a
    JOIN public.cross_post_jobs j ON j.user_id = a.user_id AND j.platform = a.platform AND j.action IN ('publish', 'republish')
         AND btrim(j.platform_listing_id) = a.listing_id AND j.inventaire_id IS NOT NULL AND j.inventaire_id <> a.inventaire_id
         AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ? 'detache_le')
         AND COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
    JOIN public.inventaire fa ON fa.id = a.inventaire_id AND fa.fusionne_dans IS NULL
    JOIN public.inventaire fj ON fj.id = j.inventaire_id AND fj.fusionne_dans IS NULL
   WHERE a.inventaire_id IS NOT NULL AND a.platform <> 'vinted'
   ORDER BY a.id, (j.status = 'published') DESC, j.created_at DESC;
CREATE TABLE public._backup_2710_doublons_fiches AS
  SELECT now() AS sauvegarde_le, i.* FROM public.inventaire i
   WHERE i.id IN (SELECT fiche_annonce FROM public._backup_2710_doublons_paires);
CREATE TABLE public._backup_2710_doublons_jobs AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c
   WHERE c.inventaire_id IN (SELECT fiche_annonce FROM public._backup_2710_doublons_paires);
CREATE TABLE public._backup_2710_doublons_annonces AS
  SELECT now() AS sauvegarde_le, a.* FROM public.annonces_plateforme a
   WHERE a.id IN (SELECT annonce_id FROM public._backup_2710_doublons_paires);
ALTER TABLE public._backup_2710_doublons_paires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_2710_doublons_fiches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_2710_doublons_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_2710_doublons_annonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2710_doublons_paires, public._backup_2710_doublons_fiches, public._backup_2710_doublons_jobs,
              public._backup_2710_doublons_annonces FROM PUBLIC, anon, authenticated;
CREATE TABLE public._resultat_2710_doublons (annonce_id uuid, resultat jsonb, le timestamptz DEFAULT now());
ALTER TABLE public._resultat_2710_doublons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._resultat_2710_doublons FROM PUBLIC, anon, authenticated;

DO $$
DECLARE r record; v jsonb; m integer; n_ok integer := 0; n_sig integer := 0;
BEGIN
  IF to_regprocedure('public.fiche_releve_doublon_resorber(uuid)') IS NULL THEN
    RAISE EXCEPTION 'migration 20261027120000 non appliquée : la règle fiche_releve_doublon_resorber est absente';
  END IF;
  SELECT count(*) INTO m FROM public._backup_2710_doublons_paires;
  IF m < 1 OR m > 20 OR NOT EXISTS (SELECT 1 FROM public._backup_2710_doublons_paires WHERE annonce_id = 'cae643f0-a8cc-4236-a4c0-b0f946baa7d9') THEN
    RAISE EXCEPTION 'paires : 1 à 20 attendues avec l''annonce Depop de Nico, % lues', m;
  END IF;
  FOR r IN SELECT annonce_id FROM public._backup_2710_doublons_paires ORDER BY annonce_id LOOP
    v := public.fiche_releve_doublon_resorber(r.annonce_id);
    INSERT INTO public._resultat_2710_doublons (annonce_id, resultat) VALUES (r.annonce_id, v);
    IF (v ->> 'ok')::boolean THEN n_ok := n_ok + 1; ELSE n_sig := n_sig + 1; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.annonces_plateforme WHERE id = 'cae643f0-a8cc-4236-a4c0-b0f946baa7d9'
                    AND inventaire_id = 1793009407689006 AND job_id = '6eef55a8-adb9-46e8-870b-4ab0e45b34af')
     OR NOT EXISTS (SELECT 1 FROM public.inventaire WHERE id = 1793089261133 AND fusionne_dans = 1793009407689006) THEN
    RAISE EXCEPTION 'la fiche Depop de Nico (1793089261133) n''a pas été résorbée par la règle';
  END IF;
  RAISE NOTICE 'réparation 27/10 : % fiche(s) résorbée(s) par la règle, % à signaler', n_ok, n_sig;
END $$;
COMMIT;
