-- ═══════════════════════════════════════════════════════════════════════════
-- DEPOP — LES DÉCLENCHEURS DE RETRAIT ET DE RELEVÉ PARTENT AUSSI POUR DEPOP
-- (09/10/2026, parcours réel de Nico) — NON APPLIQUÉE : feu vert de Nico.
-- ═══════════════════════════════════════════════════════════════════════════
--   npx supabase db query --linked -f supabase/migrations/20261009110000_depop_declencheurs_retrait_releve.sql
--   npx supabase migration repair --linked --status applied 20261009110000
-- Inverse : supabase/rollbacks/20261009110000_depop_declencheurs_retrait_releve_INVERSE.sql
--
-- POURQUOI. 20261009020000 a ouvert à Depop les FONCTIONS (retrait_cible_vivante,
-- trancher_publications_sans_lien, alerte_lever_revues_plateformes,
-- relancer_jobs_connexion…), mais les clauses WHEN de SEPT déclencheurs ne
-- nommaient toujours pas Depop (relu en prod le 09/10, pg_get_triggerdef) — le
-- même trou que celui de la republication (20261009100000, appliquée). Mesuré
-- dans le parcours réel du 09/10 : le retrait de la peinture (job 946d24ac,
-- Depop DELETE 204 puis 404 à 09:31 UTC) a laissé son annonce « en_ligne » en
-- base (ni retiree_le, ni disparu_le), jusqu'au relevé suivant.
--
-- CE QU'ELLE FAIT : les mêmes sept déclencheurs, à l'octet, 'depop' ajouté à
-- leur SEULE liste de plateformes (insertion pure, garde md5 : elle s'arrête si
-- une définition a bougé depuis sa lecture) :
--   · cross_post_jobs_retrait_ferme_annonce (+ _ins) : un retrait Depop fait
--     (status 'deleted') date l'annonce (retiree_le, disparu_le) — comme
--     Leboncoin, Beebs, eBay, Opla (listing_designe sur l'identifiant du job) ;
--   · cross_post_jobs_retrait_annonce_remplacee : un retrait qui vise une
--     annonce déjà remplacée par une republication est redirigé (ou attend)
--     — retrait_cible_vivante sait déjà lire Depop ;
--   · cross_post_jobs_retrait_rejuge : une republication publiée rejuge les
--     retraits en file de la même fiche ;
--   · releve_clos_tranche_publications : un relevé Depop COMPLET constate les
--     absences sur DEUX relevés (constater_absences_releve) et tranche les
--     publications sans lien ;
--   · vinted_sync_runs_leve_alertes_disparues : un relevé complet lève les
--     alertes « plus en ligne » des annonces revues ;
--   · releve_reussi_relance_connexion : un relevé réussi relance les jobs
--     Depop bloqués par la connexion.
-- Rien ne change pour les autres plateformes (mêmes fonctions, mêmes clauses,
-- 'depop' en plus). Une ligne Depop n'existe que pour un compte autorisé (garde
-- depop_autorise, 20261009020000) : aujourd'hui le seul compte de Nico.
-- Idempotente si rejouée sur l'état d'après ? NON : la garde md5 l'arrête
-- (définitions déjà changées) — c'est voulu, rien n'est réécrit deux fois.

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- ── 0. Les définitions de prod n'ont pas bougé depuis leur lecture (09/10) ──
DO $garde$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('cross_post_jobs_retrait_ferme_annonce', 'c6c53fd3ed6c3010427f9333fd84aa26'),
    ('cross_post_jobs_retrait_ferme_annonce_ins', 'adc21c2f8c002dfebded853ba48362cc'),
    ('cross_post_jobs_retrait_annonce_remplacee', '076230ef9c42ca68201ca1d1339c54e1'),
    ('cross_post_jobs_retrait_rejuge', '218dac86c444859e3dceee69fe8ac72f'),
    ('releve_clos_tranche_publications', '7ad045a7afd109eae3f77e15cc0a5678'),
    ('vinted_sync_runs_leve_alertes_disparues', 'dfcfeff25aaf9836917394ed5293288f'),
    ('releve_reussi_relance_connexion', 'f42f807025b88094f775e3e96dba179f')
  ) AS v(nom, md5_attendu) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname = r.nom
                    AND md5(pg_get_triggerdef(t.oid)) = r.md5_attendu) THEN
      RAISE EXCEPTION 'migration arrêtée : le déclencheur % a changé depuis sa lecture du 09/10 (ou n''existe plus)', r.nom;
    END IF;
  END LOOP;
END
$garde$;

-- ── 1. Les mêmes déclencheurs, 'depop' ajouté à leur seule liste de plateformes ──
DROP TRIGGER IF EXISTS cross_post_jobs_retrait_ferme_annonce ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_retrait_ferme_annonce AFTER UPDATE OF status ON public.cross_post_jobs FOR EACH ROW WHEN (((new.action = 'delete'::text) AND (new.status = 'deleted'::text) AND (old.status IS DISTINCT FROM 'deleted'::text) AND (new.platform = ANY (ARRAY['leboncoin'::text, 'beebs'::text, 'ebay'::text, 'opla'::text, 'depop'::text])))) EXECUTE FUNCTION cross_post_jobs_retrait_ferme_annonce();

DROP TRIGGER IF EXISTS cross_post_jobs_retrait_ferme_annonce_ins ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_retrait_ferme_annonce_ins AFTER INSERT ON public.cross_post_jobs FOR EACH ROW WHEN (((new.action = 'delete'::text) AND (new.status = 'deleted'::text) AND (new.platform = ANY (ARRAY['leboncoin'::text, 'beebs'::text, 'ebay'::text, 'opla'::text, 'depop'::text])))) EXECUTE FUNCTION cross_post_jobs_retrait_ferme_annonce();

DROP TRIGGER IF EXISTS cross_post_jobs_retrait_annonce_remplacee ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_retrait_annonce_remplacee BEFORE INSERT OR UPDATE OF status ON public.cross_post_jobs FOR EACH ROW WHEN (((new.action = 'delete'::text) AND (new.status = 'pending'::text) AND (new.platform = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text, 'opla'::text, 'depop'::text])))) EXECUTE FUNCTION retrait_redirige_annonce_remplacee();

DROP TRIGGER IF EXISTS cross_post_jobs_retrait_rejuge ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_retrait_rejuge AFTER UPDATE OF status, listing_url, platform_listing_id ON public.cross_post_jobs FOR EACH ROW WHEN (((new.status = 'published'::text) AND (COALESCE(new.action, 'publish'::text) = ANY (ARRAY['publish'::text, 'republish'::text])) AND (new.inventaire_id IS NOT NULL) AND (new.platform = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text, 'opla'::text, 'depop'::text])) AND ((old.status IS DISTINCT FROM new.status) OR (old.listing_url IS DISTINCT FROM new.listing_url) OR (old.platform_listing_id IS DISTINCT FROM new.platform_listing_id)))) EXECUTE FUNCTION retrait_rejuge_apres_republication();

DROP TRIGGER IF EXISTS releve_clos_tranche_publications ON public.vinted_sync_runs;
CREATE TRIGGER releve_clos_tranche_publications AFTER UPDATE OF status ON public.vinted_sync_runs FOR EACH ROW WHEN (((new.status = 'done'::text) AND (old.status IS DISTINCT FROM 'done'::text) AND (new.kind = 'annonces'::text) AND (new.platform = ANY (ARRAY['leboncoin'::text, 'beebs'::text, 'ebay'::text, 'opla'::text, 'depop'::text])))) EXECUTE FUNCTION releve_clos_tranche_publications();

DROP TRIGGER IF EXISTS vinted_sync_runs_leve_alertes_disparues ON public.vinted_sync_runs;
CREATE TRIGGER vinted_sync_runs_leve_alertes_disparues AFTER UPDATE OF status ON public.vinted_sync_runs FOR EACH ROW WHEN (((new.status = 'done'::text) AND (old.status IS DISTINCT FROM 'done'::text) AND (new.kind = 'annonces'::text) AND (new.platform = ANY (ARRAY['leboncoin'::text, 'ebay'::text, 'beebs'::text, 'opla'::text, 'depop'::text])))) EXECUTE FUNCTION releve_clos_leve_alertes_disparues();

DROP TRIGGER IF EXISTS releve_reussi_relance_connexion ON public.vinted_sync_runs;
CREATE TRIGGER releve_reussi_relance_connexion AFTER UPDATE OF status ON public.vinted_sync_runs FOR EACH ROW WHEN (((new.status = 'done'::text) AND (old.status IS DISTINCT FROM 'done'::text) AND (new.kind = ANY (ARRAY['annonces'::text, 'dressing'::text])) AND (new.platform = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text, 'opla'::text, 'depop'::text])))) EXECUTE FUNCTION releve_reussi_relance_connexion();

-- ── 2. Contrôle : les sept nomment Depop, rien d'autre n'a bougé ──
DO $controle$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger t
   WHERE NOT t.tgisinternal AND t.tgname IN ('cross_post_jobs_retrait_ferme_annonce', 'cross_post_jobs_retrait_ferme_annonce_ins', 'cross_post_jobs_retrait_annonce_remplacee', 'cross_post_jobs_retrait_rejuge', 'releve_clos_tranche_publications', 'vinted_sync_runs_leve_alertes_disparues', 'releve_reussi_relance_connexion')
     AND pg_get_triggerdef(t.oid) LIKE '%''depop''::text%';
  IF n <> 7 THEN RAISE EXCEPTION 'contrôle : % déclencheur(s) sur 7 nomment Depop', n; END IF;
END
$controle$;

COMMIT;
