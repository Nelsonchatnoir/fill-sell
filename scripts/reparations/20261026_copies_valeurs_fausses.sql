-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 26/10 nuit (point 12 de Nico) — LES VALEURS FAUSSES DES COPIES STOCKÉES, CES 5 CAS SEULEMENT
-- ═══════════════════════════════════════════════════════════════════════════
-- Une republication recopie les platform_fields du dernier dépôt publié de l'annonce (spend_coins_and_republish,
-- corps de prod, l. 150-155 et 477-497 : « taille » et « age » ne sont pas retirés) : elle remettrait en ligne la
-- valeur fausse née d'une question (docs/enquetes/soir-2510/CORRECTIONS-G.md). Ce script corrige la COPIE stockée
-- (le job source que la prochaine republication recopie) et, pour l'âge, la FICHE (l'écran Publier la relit ; un
-- relevé ne comble que le vide : vidée, elle reprendrait la valeur en ligne — elle reçoit donc la bonne).
--   1. chaouidz, Leboncoin 3294638238 — job e7f181c8, platform_fields.taille « 16 » → « 31 » (fiche « EU 31 »).
--   2. chaouidz, Beebs 34229052 — job 29f9116e, platform_fields.taille « 16 » → « 31 ». ⚠️ À la republication,
--      l'extension relit l'annonce et pose d'abord la taille AFFICHÉE (« 16 ») : la correction est TRACÉE
--      (platform_fields.correction_tracee) pour la règle « une correction tracée passe devant la valeur affichée »
--      (get-pending-jobs dès son déploiement, beebs.js avec la 0.6.146).
--   3. louis-seller, Beebs 34200707 « Dance floor thérapie » — job ff37632d, age « 8 ans - 12 ans » → « 16 ans et + » ;
--      fiche 1789889086091001 aussi. Les 26 autres livres : NON touchés (indéterminés).
--   4. josephinecerni, Beebs 33904993 « DVD Limitless » — job f8807f54, age → « 16 ans et + » ; fiche 1787440299372000.
--   5. voirememe, Beebs 34174205 « Funko Star Wars Rivals » — job 72d8c9aa, age « 2 ans - 3 ans » → « 3 ans - 4 ans »
--      (« À partir de 3 ans » écrit par le vendeur) ; fiche 1786391424107 (« 8 ans - 12 ans », lu sur une ancienne
--      annonce disparue) aussi.
-- Garde : chaque ligne doit porter EXACTEMENT la valeur d'avant attendue, sinon rien n'est fait (RAISE). Rien n'est
-- publié, retiré, ni relancé ; aucune annonce en ligne n'est modifiée (FillSell ne sait pas les modifier en place) ;
-- aucun mail. Sauvegarde : _backup_2610_copies_valeurs_fausses (RLS, aucun droit). Inverse :
-- 20261026_copies_valeurs_fausses_INVERSE.sql. ESSAI À BLANC : remplacer COMMIT par ROLLBACK (fin du fichier).
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS public._backup_2610_copies_valeurs_fausses (
  sauvegarde_le timestamptz NOT NULL DEFAULT now(),
  quoi text NOT NULL,           -- 'job' | 'fiche'
  id text NOT NULL,
  avant jsonb NOT NULL          -- platform_fields (job) ou attributs (fiche) AVANT
);
ALTER TABLE public._backup_2610_copies_valeurs_fausses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2610_copies_valeurs_fausses FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _cas_2610 (job_id uuid, inventaire_id bigint, plateforme text, annonce text, cle text, avant text, apres text, motif text) ON COMMIT DROP;
INSERT INTO _cas_2610 VALUES
  ('e7f181c8-72b6-4333-9bff-aabc587d6045', 1792837464698006, 'leboncoin', '3294638238', 'taille', '16', '31', 'pointure de la fiche « EU 31 » et du titre « Pointure 31 » ; « 16 » choisi à une question le 24/10'),
  ('29f9116e-9072-4af2-8269-80c77914d140', 1792837464698006, 'beebs', '34229052', 'taille', '16', '31', 'pointure de la fiche « EU 31 » et du titre « Pointure 31 » ; « 16 » choisi à une question le 24/10'),
  ('ff37632d-d744-4126-be88-e32237c9a919', 1789889086091001, 'beebs', '34200707', 'age', '8 ans - 12 ans', '16 ans et +', 'livre de développement personnel, aucun signe jeunesse (CORRECTIONS-G.md)'),
  ('f8807f54-1212-4177-887b-ef34dc70704a', 1787440299372000, 'beebs', '33904993', 'age', '8 ans - 12 ans', '16 ans et +', 'film pour adultes, aucun signe jeunesse (CORRECTIONS-G.md)'),
  ('72d8c9aa-043f-463c-9832-767d5d820d07', 1786391424107, 'beebs', '34174205', 'age', '2 ans - 3 ans', '3 ans - 4 ans', 'âge écrit par le vendeur : « À partir de 3 ans »');

DO $$
DECLARE n integer; r record;
BEGIN
  -- 1. Garde : les 5 jobs, publiés, sur la bonne annonce, avec la valeur d'avant attendue.
  SELECT count(*) INTO n FROM _cas_2610 c JOIN public.cross_post_jobs j ON j.id = c.job_id
   WHERE j.inventaire_id = c.inventaire_id AND j.platform = c.plateforme AND j.status = 'published'
     AND j.platform_listing_id = c.annonce AND coalesce(j.platform_fields->>c.cle, '') = c.avant;
  IF n <> 5 THEN RAISE EXCEPTION 'garde des jobs : 5 attendus avec la valeur d''avant, % trouvés — rien n''est fait', n; END IF;
  -- 2. Sauvegarde.
  INSERT INTO public._backup_2610_copies_valeurs_fausses (quoi, id, avant)
    SELECT 'job', j.id::text, j.platform_fields FROM public.cross_post_jobs j WHERE j.id IN (SELECT job_id FROM _cas_2610);
  INSERT INTO public._backup_2610_copies_valeurs_fausses (quoi, id, avant)
    SELECT 'fiche', i.id::text, coalesce(i.attributs, '{}'::jsonb) FROM public.inventaire i
     WHERE i.id IN (SELECT inventaire_id FROM _cas_2610 WHERE cle = 'age');
  -- 3. Les copies : la bonne valeur, et la correction TRACÉE (avant, après, source, motif).
  UPDATE public.cross_post_jobs j
     SET platform_fields = j.platform_fields
           || jsonb_build_object(c.cle, c.apres)
           || jsonb_build_object('correction_tracee', jsonb_build_object(
                'cle', c.cle, 'avant', c.avant, 'apres', c.apres, 'source', 'correction', 'motif', c.motif,
                'annonce', c.annonce, 'le', now(), 'par', 'scripts/reparations/20261026_copies_valeurs_fausses.sql (point 12 de Nico)'))
    FROM _cas_2610 c
   WHERE j.id = c.job_id AND coalesce(j.platform_fields->>c.cle, '') = c.avant;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 5 THEN RAISE EXCEPTION 'copies : 5 attendues, % écrites — rien n''est fait', n; END IF;
  -- 4. Les fiches (âge) : la bonne valeur. Source « manuel » : c'est le SEUL rang (5) que la fusion des attributs
  --    (inventaire_attributs_fusion / _rang) laisse passer devant un relevé (3) — la valeur est bien décidée par une
  --    personne (Nico, point 12) ; « par » et « motif » disent que c'est ce script. Un relevé ne l'écrasera pas.
  FOR r IN SELECT DISTINCT inventaire_id, apres, motif FROM _cas_2610 WHERE cle = 'age' LOOP
    UPDATE public.inventaire i
       SET attributs = coalesce(i.attributs, '{}'::jsonb) || jsonb_build_object('age', jsonb_build_object(
             'v', r.apres, 'at', now(), 'source', 'manuel', 'motif', r.motif,
             'avant', i.attributs->'age', 'par', 'scripts/reparations/20261026_copies_valeurs_fausses.sql'))
     WHERE i.id = r.inventaire_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'fiche % : 1 attendue, % écrite — rien n''est fait', r.inventaire_id, n; END IF;
  END LOOP;
END $$;

-- Relecture : la nouvelle valeur de chaque copie et de chaque fiche, aucun job relancé, aucun mail.
SELECT c.plateforme, c.annonce, c.cle, c.avant, j.platform_fields->>c.cle AS maintenant, j.status,
       j.platform_fields->'correction_tracee'->>'apres' AS tracee,
       (SELECT i.attributs->'age'->>'v' FROM public.inventaire i WHERE i.id = c.inventaire_id) AS age_fiche
  FROM _cas_2610 c JOIN public.cross_post_jobs j ON j.id = c.job_id ORDER BY c.plateforme, c.annonce;
SELECT count(*) AS mails_5min FROM public.email_logs WHERE sent_at > now() - interval '5 minutes';
COMMIT;
