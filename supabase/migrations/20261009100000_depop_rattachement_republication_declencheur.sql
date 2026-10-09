-- DEPOP (09/10, parcours réel de Nico) — le DÉCLENCHEUR de rattachement des
-- republications ignorait Depop.
--
-- 20261009020000 a ouvert la FONCTION cross_post_jobs_rattacher_republication()
-- à Depop (`v_pf NOT IN ('leboncoin', 'beebs', 'opla', 'depop')`), mais la
-- clause WHEN de son déclencheur, posée le 18/09 (20260918200400), ne nomme
-- toujours que leboncoin / beebs / opla (relu en prod le 09/10 :
-- pg_get_triggerdef). Une republication Depop (suppression puis recréation,
-- nouvel identifiant) ne rattachait donc PAS sa nouvelle annonce à l'article
-- et ne datait pas la disparition de l'ancienne : au relevé suivant, la
-- nouvelle annonce arrivait orpheline au moteur.
--
-- Effet : le déclencheur part aussi pour Depop. Rien ne change pour les trois
-- autres plateformes (même fonction, même clause). Un job Depop n'existe que
-- pour un compte autorisé (garde depop_autorise, 20261009020000).
-- Idempotente. Inverse : recréer le déclencheur avec la liste d'avant.
DROP TRIGGER IF EXISTS cross_post_jobs_rattacher_republication ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_rattacher_republication
  AFTER UPDATE OF status ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published'
        AND NEW.action = 'republish'
        AND NEW.platform IN ('leboncoin', 'beebs', 'opla', 'depop'))
  EXECUTE FUNCTION public.cross_post_jobs_rattacher_republication();

-- Contrôle :
--   SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'cross_post_jobs_rattacher_republication';
--   → … ARRAY['leboncoin'::text, 'beebs'::text, 'opla'::text, 'depop'::text] …
