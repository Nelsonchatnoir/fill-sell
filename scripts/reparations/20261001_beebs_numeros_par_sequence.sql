-- ═══════════════════════════════════════════════════════════════════════════
-- BEEBS — NUMÉROS DES DÉPÔTS RETROUVÉS PAR LE MOMENT DU DÉPÔT (01/10, point 4)
-- ═══════════════════════════════════════════════════════════════════════════
-- Applique public.beebs_numeros_par_sequence (migration 20261001123000) aux
-- comptes où le rejeu à blanc a trouvé quelque chose. Rejeu à blanc sur tout
-- le parc (13 comptes ayant des dépôts Beebs sans numéro ni lien), le 01/10
-- vers 11:00 — deux calculs indépendants (script hors base et fonction SQL),
-- mêmes résultats :
--   recrutementgroupezk704  127 sans numéro → 121 posés, 1 question,
--                            1 laissé tel quel (déjà rattaché, photo
--                            illisible), 4 sans preuve
--   josephinecerni          7  → 1 posé, 2 laissés tels quels, 4 sans preuve
--   6f41de45 (compte à 2 dépôts) 1 → 1 posé
--   f0acd3af                1  → 1 question (photo différente)
--   9 autres comptes        83 → aucune annonce de même titre dans la
--                            fenêtre : rien posé, rien demandé
-- Contrôles du rejeu annulé (application réelle dans une transaction
-- annulée) : 123 numéros, 123 liens écrits par la règle existante, 123
-- annonces rattachées à leur dépôt, 2 questions, 0 numéro sur deux fiches ;
-- distances photo des 123 : toutes ≤ 4 (dHash) / ≤ 4 (pHash), 62 à 0/0.
-- Hors champ : les 85 + 8 dépôts mis en question au point 5 (la méthode les
-- confirme tous — décision de Nico).
--
-- Sauvegarde : _backup_0110_beebs_sequence (jobs et annonces concernés, AVANT).
-- Inverse : 20261001_beebs_numeros_par_sequence_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public._backup_0110_beebs_sequence (
  quoi text NOT NULL, id uuid NOT NULL, ligne jsonb NOT NULL, le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quoi, id));
ALTER TABLE public._backup_0110_beebs_sequence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0110_beebs_sequence FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _comptes ON COMMIT DROP AS
SELECT u.id AS user_id FROM auth.users u
 WHERE u.id IN ('7373c96c-c0ed-4947-a4c5-ee1b0d2b8d28', 'afeef3c7-0b0b-408c-a25b-3823448e3eb1',
                '6f41de45-3496-46f1-a47d-d259d52dc063')
    OR u.id::text LIKE 'f0acd3af-%';

INSERT INTO public._backup_0110_beebs_sequence (quoi, id, ligne)
SELECT 'job', j.id, to_jsonb(j) FROM cross_post_jobs j JOIN _comptes c USING (user_id)
 WHERE j.platform = 'beebs' AND j.action IN ('publish', 'republish') AND j.status = 'published'
   AND j.platform_listing_id IS NULL AND j.listing_url IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO public._backup_0110_beebs_sequence (quoi, id, ligne)
SELECT 'annonce', a.id, to_jsonb(a) - 'capture' FROM annonces_plateforme a JOIN _comptes c USING (user_id)
 WHERE a.platform = 'beebs' AND a.disparu_le IS NULL
ON CONFLICT DO NOTHING;

SELECT left(c.user_id::text, 8) AS compte,
       public.beebs_numeros_par_sequence(c.user_id, false) - 'detail' AS resultat
  FROM _comptes c ORDER BY 1;
COMMIT;
