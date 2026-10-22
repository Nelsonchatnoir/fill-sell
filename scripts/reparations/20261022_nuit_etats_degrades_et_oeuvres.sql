-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 22/10 nuit (décisions de Nico) — republier, par le circuit normal de l'app :
--   1. les annonces des comptes PAYANTS dont l'état a été DÉGRADÉ (plus bas que celui de la fiche) ;
--   2. les 2 œuvres de paugues mal rangées sur Vinted (« Toiles et panneaux », « Encadrements »).
-- ═══════════════════════════════════════════════════════════════════════════
-- Le geste : « Republier » (spend_coins_and_republish, source « manuel »), en tant que le compte. Au départ :
--   · Leboncoin / Beebs / Depop : get-pending-jobs (v270) impose le texte, l'état (jamais dégradé en republication)
--     et les photos de la fiche ;
--   · Vinted : la capture de l'annonce est corrigée AVANT le retrait (état de la fiche noté avant la capture ; œuvre →
--     « Peintures ») — un formulaire incomplet s'arrête sans rien retirer.
-- Gardes, vérifiées ici pour chaque annonce, sinon elle est SAUTÉE et dite : fiche au stock (non fusionnée), dépôt
-- publié avec son numéro, aucune tâche déjà en file sur cette fiche et cette plateforme (pas de doublon), aucune
-- alerte « plus en ligne » ni signal de vente, aucun retrait en file sur la fiche, aucune transaction Leboncoin en cours.
-- Plafonds, quotas et créneaux : ceux de chaque compte (la RPC refuse au-delà ; get-pending-jobs étale la distribution).
-- Hors champ (listé au rapport) : Opla (quittée), eBay (pas de republication dans l'app), annonces sans numéro, alertes
-- en cours, republications déjà en cours (Louis). Aucun mail. Sauvegarde : _backup_2210_nuit_republications.
-- Essai : remplacer COMMIT par ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '170s';
CREATE TABLE IF NOT EXISTS public._backup_2210_nuit_republications (
  le timestamptz DEFAULT now(), job_source uuid PRIMARY KEY, user_id uuid, inventaire_id bigint, platform text,
  annonce text, motif text, source_avant jsonb, garde text, resultat jsonb);
ALTER TABLE public._backup_2210_nuit_republications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2210_nuit_republications FROM anon, authenticated;

CREATE TEMP TABLE _cibles (job_prefixe text, inventaire_id bigint, platform text, annonce text, motif text);
INSERT INTO _cibles VALUES
  -- 1. états dégradés, comptes payants
  ('', 1787440273769007, 'beebs',     '34090428',    'etat_degrade'),   -- josephinecerni
  ('', 1792239408365019, 'beebs',     '34184212',    'etat_degrade'),   -- sebimsn10
  ('', 1789717152898003, 'beebs',     '34043155',    'etat_degrade'),   -- xxewwer
  ('', 1789676224963,    'depop',     'nelsonchatnoij-robe-fluide-camaieu-avec-imprime-f9a4', 'etat_degrade'), -- nicolas.svobodny
  ('', 1792588102799002, 'leboncoin', '3292537287',  'etat_degrade'),   -- jocabroc8
  ('', 1787440273769007, 'leboncoin', '3275470510',  'etat_degrade'),   -- josephinecerni
  ('', 1785432328453,    'leboncoin', '3272017443',  'etat_degrade'),   -- ornellaracano
  ('', 1792419768346009, 'leboncoin', '3292703560',  'etat_degrade'),   -- sebastien64310
  ('', 1792239408365019, 'leboncoin', '3290232698',  'etat_degrade'),   -- sebimsn10
  ('', 1787873497742003, 'leboncoin', '3278090358',  'etat_degrade'),   -- tessy.galy
  ('', 1790174160920,    'vinted',    '10125580653', 'etat_degrade'),   -- jocabroc8
  ('', 1792420846445,    'vinted',    '10445026469', 'etat_degrade'),   -- sebastien64310
  -- 2. paugues : œuvres mal rangées sur Vinted
  ('', 1792441607070,    'vinted',    '10450175638', 'oeuvre_categorie'),
  ('', 1792599699501,    'vinted',    '10474010355', 'oeuvre_categorie');

CREATE TEMP TABLE _jugees AS
SELECT c.*, j.id AS job_source, j.user_id, to_jsonb(j.*) - 'description' AS source_avant,
  CASE
    WHEN j.id IS NULL THEN 'dépôt publié introuvable sous ce numéro'
    WHEN i.statut IS DISTINCT FROM 'stock' OR i.fusionne_dans IS NOT NULL THEN 'fiche hors stock'
    WHEN EXISTS (SELECT 1 FROM cross_post_jobs x WHERE x.inventaire_id = c.inventaire_id AND x.platform = c.platform
                   AND x.status IN ('pending', 'processing', 'needs_user')) THEN 'une tâche est déjà en file (pas de doublon)'
    WHEN EXISTS (SELECT 1 FROM cross_post_jobs x WHERE x.inventaire_id = c.inventaire_id AND x.action = 'delete'
                   AND x.status IN ('pending', 'processing', 'needs_user')) THEN 'un retrait est en file sur la fiche'
    WHEN j.platform_fields ? 'unavailable_since' OR coalesce(j.platform_fields ->> 'sale_signal', '') <> '' THEN 'alerte ou signal de vente'
    WHEN c.platform = 'leboncoin' AND EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.platform = 'leboncoin'
                   AND a.listing_id = c.annonce AND leboncoin_transaction_lue(a.transaction_plateforme, a.capture) IN ('pending', 'sold'))
         THEN 'transaction Leboncoin en cours'
    ELSE 'ok'
  END AS garde
  FROM _cibles c
  LEFT JOIN LATERAL (SELECT * FROM cross_post_jobs j WHERE j.inventaire_id = c.inventaire_id AND j.platform = c.platform
                       AND j.status = 'published' AND btrim(coalesce(j.platform_listing_id, '')) = c.annonce
                     ORDER BY j.created_at DESC LIMIT 1) j ON true
  LEFT JOIN inventaire i ON i.id = c.inventaire_id;

INSERT INTO public._backup_2210_nuit_republications (job_source, user_id, inventaire_id, platform, annonce, motif, source_avant, garde)
SELECT job_source, user_id, inventaire_id, platform, annonce, motif, source_avant, garde FROM _jugees WHERE job_source IS NOT NULL
ON CONFLICT (job_source) DO NOTHING;

DO $$
DECLARE g record; r jsonb;
BEGIN
  FOR g IN SELECT * FROM _jugees WHERE garde = 'ok' LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', g.user_id, 'role', 'authenticated')::text, true);
    IF g.platform = 'vinted' THEN
      r := public.spend_coins_and_republish(g.inventaire_id, g.annonce, 'manuel', NULL, 'vinted');
    ELSE
      r := public.spend_coins_and_republish(g.inventaire_id, NULL, 'manuel', NULL, g.platform);
    END IF;
    UPDATE public._backup_2210_nuit_republications SET resultat = r WHERE job_source = g.job_source;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

SELECT split_part(p.email, '@', 1) AS compte, j.platform, j.annonce, j.motif, j.garde,
       coalesce(b.resultat::text, '') AS resultat
  FROM _jugees j LEFT JOIN profiles p ON p.id = j.user_id
  LEFT JOIN public._backup_2210_nuit_republications b ON b.job_source = j.job_source
 ORDER BY j.motif, j.platform, 1;
COMMIT;
