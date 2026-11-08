-- RATTRAPAGE DU PARC (08/11 après-midi, point 3 de Nico : « 931 doublons d'autres comptes non traités ») — les lignes SANS fiche qui doublent une ligne rattachée sont closes PAR LA RÈGLE
-- (migration 20261108143000_une_ligne_vivante_par_annonce : public.lignes_sans_fiche_clore), jamais à la main.
--
-- Prérequis : la migration 20261108143000 APPLIQUÉE (la fonction doit exister — sinon ce script s'arrête).
-- Portée : TOUS les comptes (ayadi007 déjà fait à 13:50) — mesure du 08/11 ~15:50 : 491 lignes sur 11 comptes.
-- (931 au matin = 440 d'ayadi007, déjà closes, + 491 ailleurs.)
-- Sauvegarde : public._backup_0811_lignes_sans_fiche_parc (id, statut, erreur, platform_fields d'avant).
-- Inverse : scripts/reparations/20261108_lignes_sans_fiche_doublons_parc_INVERSE.sql.
-- Lecture préalable (rien n'écrit) : scripts/reparations/20261108_lignes_sans_fiche_doublons_PREUVE.sql.
-- ⚠ Une seule transaction (BEGIN … COMMIT ci-dessous) : la table de passage meurt au COMMIT.
-- Jamais : une ligne rattachée, un retrait (delete), une tâche « processing », un titre — le numéro EXACT seulement.

DO $garde$
BEGIN
  IF to_regprocedure('public.lignes_sans_fiche_clore(uuid,text,text,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'lignes_sans_fiche_clore absente : appliquer d''abord la migration 20261108143000';
  END IF;
END
$garde$;

BEGIN;

CREATE TABLE IF NOT EXISTS public._backup_0811_lignes_sans_fiche_parc (
  id uuid PRIMARY KEY, user_id uuid NOT NULL, status text, error text, platform_fields jsonb, sauve_le timestamptz DEFAULT now());
-- Sauvegarde NÉE PROTÉGÉE (règle du 24/10, selftest:tables-droits-explicites) : RLS active, aucun droit client.
ALTER TABLE public._backup_0811_lignes_sans_fiche_parc ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_0811_lignes_sans_fiche_parc FROM PUBLIC, anon, authenticated;

-- 1. Les numéros à traiter, et LA ligne rattachée gardée pour chacun (la plus récente sur une fiche vivante).
CREATE TEMP TABLE _gardees_0811_parc ON COMMIT DROP AS
SELECT DISTINCT ON (k.platform, btrim(k.platform_listing_id)) k.user_id, k.platform, btrim(k.platform_listing_id) AS lid, k.id AS garde
  FROM cross_post_jobs k JOIN inventaire i ON i.id = k.inventaire_id
 WHERE TRUE
   AND k.status IN ('published', 'sold') AND COALESCE(k.action, 'publish') IN ('publish', 'republish')
   AND i.fusionne_dans IS NULL AND NULLIF(btrim(k.platform_listing_id), '') IS NOT NULL
   AND EXISTS (SELECT 1 FROM cross_post_jobs o WHERE o.user_id = k.user_id AND o.platform = k.platform AND o.inventaire_id IS NULL
                 AND o.status IN ('published', 'pending', 'needs_user') AND COALESCE(o.action, 'publish') IN ('publish', 'republish')
                 AND btrim(o.platform_listing_id) = btrim(k.platform_listing_id))
 ORDER BY k.platform, btrim(k.platform_listing_id), COALESCE(k.published_at, k.created_at) DESC;

-- 2. La sauvegarde, AVANT toute écriture.
INSERT INTO public._backup_0811_lignes_sans_fiche_parc (id, user_id, status, error, platform_fields)
SELECT o.id, o.user_id, o.status, o.error, o.platform_fields
  FROM cross_post_jobs o JOIN _gardees_0811_parc g ON g.user_id = o.user_id AND g.platform = o.platform AND btrim(o.platform_listing_id) = g.lid
 WHERE o.inventaire_id IS NULL AND o.status IN ('published', 'pending', 'needs_user') AND COALESCE(o.action, 'publish') IN ('publish', 'republish')
ON CONFLICT (id) DO NOTHING;

-- 3. La règle, numéro par numéro (rend le nombre de lignes closes).
SELECT count(*) AS numeros, sum(public.lignes_sans_fiche_clore(g.user_id, g.platform, g.lid, g.garde, 'rattrapage_0811_parc')) AS closes,
       (SELECT count(*) FROM public._backup_0811_lignes_sans_fiche_parc) AS sauvegardees
  FROM _gardees_0811_parc g;

COMMIT;
