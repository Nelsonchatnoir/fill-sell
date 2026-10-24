-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 soir (lot « zéro blocage », A5) — christophe.lanoux30 : republication Vinted a017da53 CLOSE, sans
-- objet. En pause depuis le 20/10 « capture incomplète » (erreur passagère de stockage) ; l'article 1792221141892018
-- est VENDU depuis (une vente enregistrée) — la garde cross_post_jobs_refus_relance_article_vendu a refusé la relance,
-- à juste titre. Une republication non engagée d'un article vendu n'a plus d'objet (règle du 15/10) : close, rien
-- retiré, unité rendue. Sauvegarde : _backup_2410_zero_blocage_jobs. Inverse : …_INVERSE.sql. Aucun mail.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2410_zero_blocage_jobs AS SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2410_zero_blocage_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_zero_blocage_jobs FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2410_zero_blocage_jobs SELECT now(), c.* FROM public.cross_post_jobs c WHERE c.id = 'a017da53-1a93-4c67-a170-e2e0c1dfb558';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = 'cancelled',
         error = 'Republication sans objet : l''article est vendu. Rien n''a été retiré.',
         platform_fields = (c.platform_fields - 'needs_user_source' - 'next_action_after' - 'processing_since')
           || jsonb_build_object('cloture_support', jsonb_build_object('le', now(), 'par', 'Claude — lot « zéro blocage » (24/10 soir)', 'motif', 'article_vendu', 'pose_par', 'scripts/reparations/20261024_christophe_republication_sans_objet.sql'))
   WHERE c.id = 'a017da53-1a93-4c67-a170-e2e0c1dfb558' AND c.status = 'needs_user' AND c.platform_fields ->> 'republish_step' = 'captured'
     AND EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = c.inventaire_id AND i.statut = 'vendu')
     AND EXISTS (SELECT 1 FROM public.ventes v WHERE v.inventaire_id = c.inventaire_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'a017da53 : % ligne(s) — rien n''est fait', n; END IF;
END $$;
SELECT id, status, left(error, 60) FROM public.cross_post_jobs WHERE id = 'a017da53-1a93-4c67-a170-e2e0c1dfb558';
COMMIT;
