-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 22/10 au soir (point 1d, décision de Nico) — les fiches RÉIMPORTÉES d'Opla sortent du stock, sans retrait
-- ═══════════════════════════════════════════════════════════════════════════
-- Opla est quittée depuis le 10/10. Le moteur de rapprochement v3 a pourtant réimporté des annonces Opla orphelines
-- en fiches de stock (corrigé à la racine le 22/10 matin, migration 20261022100000 : une orpheline Opla n'est plus
-- jamais importée). Restent les fiches nées ainsi après le 10/10 : elles sortent du stock.
--   · AUCUN retrait : le déclencheur de suppression (inventaire_arme_retraits_avant_suppression) ne crée jamais de
--     retrait Opla depuis la sortie (il note seulement l'information sur la copie) — vérifié ci-dessous : 0 job créé ;
--   · une fiche qui a une annonce EN LIGNE sur une autre plateforme (ou une publication vivante ailleurs) n'est PAS
--     touchée : elle est listée (_restees) ;
--   · une fiche déjà fusionnée dans une autre (fusionne_dans) n'est plus au stock : rien à faire ;
--   · sauvegarde complète AVANT (_backup_2210_soir_opla : fiche, annonces, jobs) ; inverse :
--     20261022_soir_opla_reimportees_hors_stock_INVERSE.sql. Aucun mail (aucune vente, aucune note touchée).
-- Essai : remplacer COMMIT par ROLLBACK (la dernière requête liste tout).
BEGIN;
SET LOCAL statement_timeout = '120s';
CREATE TABLE IF NOT EXISTS public._backup_2210_soir_opla (
  le timestamptz DEFAULT now(), inventaire_id bigint PRIMARY KEY, user_id uuid, fiche jsonb, annonces jsonb, jobs jsonb);
ALTER TABLE public._backup_2210_soir_opla ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2210_soir_opla FROM anon, authenticated;

CREATE TEMP TABLE _opla AS
SELECT i.id, i.user_id, i.titre, i.fusionne_dans,
       EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.inventaire_id = i.id AND a.platform <> 'opla' AND a.disparu_le IS NULL) AS annonce_ailleurs,
       EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id AND j.platform <> 'opla'
                 AND j.status IN ('pending', 'processing', 'needs_user', 'published')) AS job_ailleurs
  FROM inventaire i
 WHERE i.origine = 'releve_opla' AND i.created_at >= '2026-10-10 00:00:00+02' AND i.statut = 'stock';

CREATE TEMP TABLE _restees AS SELECT * FROM _opla WHERE annonce_ailleurs OR job_ailleurs OR fusionne_dans IS NOT NULL;
CREATE TEMP TABLE _cibles AS SELECT * FROM _opla WHERE NOT annonce_ailleurs AND NOT job_ailleurs AND fusionne_dans IS NULL;

INSERT INTO public._backup_2210_soir_opla (inventaire_id, user_id, fiche, annonces, jobs)
SELECT c.id, c.user_id, to_jsonb(i.*),
       (SELECT coalesce(jsonb_agg(to_jsonb(a.*)), '[]') FROM annonces_plateforme a WHERE a.inventaire_id = c.id),
       (SELECT coalesce(jsonb_agg(to_jsonb(j.*)), '[]') FROM cross_post_jobs j WHERE j.inventaire_id = c.id)
  FROM _cibles c JOIN inventaire i ON i.id = c.id
ON CONFLICT (inventaire_id) DO NOTHING;

CREATE TEMP TABLE _jobs_avant AS SELECT count(*) n FROM cross_post_jobs WHERE action = 'delete' AND created_at > now() - interval '1 minute';
DELETE FROM inventaire i USING _cibles c WHERE i.id = c.id AND i.user_id = c.user_id;

-- Preuve : aucun retrait créé par la suppression.
SELECT 'retraits crees' AS quoi, (SELECT count(*) FROM cross_post_jobs j JOIN _cibles c ON j.user_id = c.user_id
         WHERE j.action = 'delete' AND j.created_at > now() - interval '1 minute')::text AS valeur, '' AS detail
UNION ALL
SELECT 'sortie du stock', c.id::text, p.email || ' — ' || left(c.titre, 60) FROM _cibles c JOIN profiles p ON p.id = c.user_id
UNION ALL
SELECT 'non touchee', r.id::text, p.email || ' — ' || left(r.titre, 60) || CASE WHEN r.fusionne_dans IS NOT NULL THEN ' (déjà fusionnée)'
         WHEN r.annonce_ailleurs THEN ' (annonce en ligne ailleurs)' ELSE ' (publication vivante ailleurs)' END
  FROM _restees r JOIN profiles p ON p.id = r.user_id
ORDER BY 1, 2;
COMMIT;
