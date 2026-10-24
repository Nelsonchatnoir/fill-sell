-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 (décision 1 de Nico) — REPUBLIER, PAR LE CIRCUIT NORMAL ET HORS QUOTA, L'ANNONCE BEEBS DU JEAN
-- « W34 L34 (44) » DE recrutementgroupezk704, SANS TAILLE EN LIGNE
-- ═══════════════════════════════════════════════════════════════════════════
-- Relu le 24/10 (pages publiques) : les « 4 tailles 34 » du rapport du 23/10 sont celles des COPIES en base ; en
-- ligne, aucune annonce n'affiche « 34 » :
--   · Beebs 34165464 (ce jean, fiche 1791926965462017) : AUCUNE taille → republiée ici, elle partira en « 44 » ;
--   · Leboncoin 3291177691 (ce jean) : « Taille L » — juste pour un W34, gardée ;
--   · Leboncoin 3293835887 (Johan) : aucune taille — la grille Leboncoin homme n'a que des lettres et aucune table
--     homme n'est publiée (règle du 28/09) : la lettre est à Johan, pas republiée ;
--   · Beebs 34222058 (Johan) : « Taille 44 », juste ; jean 35/34 de patrick.giry07 : vendu, jamais en ligne.
-- La règle d'abord (tous les comptes) : get-pending-jobs v277 sert le W en taille française quand la copie porte le
-- W ou la longueur (_shared/taille-corrigee-par-le-w.js, selftest taille-corrigee-par-le-w) : la copie « 34 » de ce
-- jean partira en « 44 » (W34 lu au titre « … W34 L34 (44) … »).
-- Le geste : « Republier » (spend_coins_and_republish, source « manuel »), en tant que le compte ; plafonds, quotas et
-- créneaux : ceux du compte ; marquée `hors_quota`. Gardes (sinon SAUTÉE et dite) : fiche au stock (1 exemplaire),
-- dépôt publié avec son numéro, aucune tâche en file, aucun retrait en file, aucune alerte ni signal de vente, aucune
-- vente, aucune commande Beebs, et la taille servie calculée = « 44 ». Aucun mail. Sauvegarde :
-- _backup_2410_taille_w_republications. Essai : COMMIT → ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '120s';
CREATE TABLE IF NOT EXISTS public._backup_2410_taille_w_republications (
  le timestamptz DEFAULT now(), job_source uuid PRIMARY KEY, user_id uuid, inventaire_id bigint, platform text,
  annonce text, source_avant jsonb, garde text, resultat jsonb);
ALTER TABLE public._backup_2410_taille_w_republications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_taille_w_republications FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _cibles (job uuid, platform text, annonce text, taille_attendue text);
INSERT INTO _cibles VALUES
  ('2412165b-9749-43c5-8d79-1eb63ee0bd82', 'beebs', '34165464', '44');   -- recrutementgroupezk704, W34 L34 (44)

CREATE TEMP TABLE _jugees AS
SELECT c.*, j.user_id, j.inventaire_id, to_jsonb(j.*) - 'description' AS source_avant,
  CASE
    WHEN j.id IS NULL OR j.status <> 'published' OR btrim(coalesce(j.platform_listing_id, '')) <> c.annonce THEN 'dépôt publié introuvable sous ce numéro'
    WHEN i.statut IS DISTINCT FROM 'stock' OR i.fusionne_dans IS NOT NULL OR coalesce(i.quantite, 1) <> 1 THEN 'fiche hors stock'
    WHEN EXISTS (SELECT 1 FROM cross_post_jobs x WHERE x.inventaire_id = j.inventaire_id AND x.platform = c.platform
                   AND x.status IN ('pending', 'processing', 'needs_user')) THEN 'une tâche est déjà en file (pas de doublon)'
    WHEN EXISTS (SELECT 1 FROM cross_post_jobs x WHERE x.inventaire_id = j.inventaire_id AND x.action = 'delete'
                   AND x.status IN ('pending', 'processing', 'needs_user')) THEN 'un retrait est en file sur la fiche'
    WHEN j.platform_fields ? 'unavailable_since' OR coalesce(j.platform_fields ->> 'sale_signal', '') <> '' THEN 'alerte ou signal de vente'
    WHEN EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = j.inventaire_id) THEN 'une vente existe'
    WHEN EXISTS (SELECT 1 FROM plateforme_commandes pc WHERE pc.inventaire_id = j.inventaire_id
                    OR (pc.user_id = j.user_id AND pc.platform = c.platform AND pc.annonce_ref = c.annonce)) THEN 'une commande existe'
    WHEN btrim(coalesce(j.platform_fields ->> 'taille', '')) <> '34'
      OR i.titre NOT LIKE '%W34 L34 (44)%' THEN 'taille : état inattendu (la copie devait porter « 34 », le titre W34 L34)'
    ELSE 'ok'
  END AS garde
  FROM _cibles c
  LEFT JOIN cross_post_jobs j ON j.id = c.job
  LEFT JOIN inventaire i ON i.id = j.inventaire_id;

INSERT INTO public._backup_2410_taille_w_republications (job_source, user_id, inventaire_id, platform, annonce, source_avant, garde)
SELECT job, user_id, inventaire_id, platform, annonce, source_avant, garde FROM _jugees WHERE user_id IS NOT NULL
ON CONFLICT (job_source) DO UPDATE SET garde = EXCLUDED.garde;

DO $$
DECLARE g record; r jsonb;
BEGIN
  FOR g IN SELECT * FROM _jugees WHERE garde = 'ok' LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', g.user_id, 'role', 'authenticated')::text, true);
    r := public.spend_coins_and_republish(g.inventaire_id, NULL, 'manuel', NULL, g.platform);
    UPDATE public._backup_2410_taille_w_republications SET resultat = r WHERE job_source = g.job;
    IF COALESCE((r ->> 'allowed')::boolean, false) THEN
      UPDATE cross_post_jobs SET platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('hors_quota',
               jsonb_build_object('motif', 'erreur FillSell (taille de jean W/L, décision 1 de Nico du 24/10) : annonce partie sans sa taille', 'le', now()))
       WHERE id = (r ->> 'job_id')::uuid AND user_id = g.user_id;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

SELECT b.platform, b.annonce, b.garde, coalesce(b.resultat ->> 'allowed', '-') AS autorise, coalesce(b.resultat ->> 'reason', '') AS motif,
       coalesce(b.resultat ->> 'job_id', '') AS job,
       coalesce((SELECT j.platform_fields ->> 'taille' FROM cross_post_jobs j WHERE j.id::text = b.resultat ->> 'job_id'), '') AS taille_copiee,
       coalesce((SELECT (j.platform_fields ? 'hors_quota')::text FROM cross_post_jobs j WHERE j.id::text = b.resultat ->> 'job_id'), '') AS hors_quota,
       (SELECT count(*) FROM email_logs e WHERE e.user_id = b.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public._backup_2410_taille_w_republications b WHERE b.job_source IN (SELECT job FROM _cibles) ORDER BY 1, 2;
COMMIT;
