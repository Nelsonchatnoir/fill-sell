-- ═══════════════════════════════════════════════════════════════════════════
-- xxewwer — « Bravely Default II » : fiche à 1 exemplaire en stock, aucun
-- retrait (01/10 suite, point 4, GO Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Preuve (Browse, 01/10 10:30 et 11:42) : eBay 377462623400 affiche 2
-- disponibles, 0 vendu. La fiche 1789843450625, importée d'eBay le 19/09 à 1
-- exemplaire (quantité non lue à l'import), a été vendue une fois sur Vinted
-- (vente 22975) → tombée à 0, « vendue », et deux retraits eBay armés (22/09
-- et 27/09) qu'il aurait été faux d'exécuter : il reste un exemplaire.
--   · fiche : en stock, 1 exemplaire (la vente Vinted reste enregistrée) ;
--   · retraits 2773c89d et c0d918a5 (en échec) : clos, rien à retirer ;
--   · l'annonce eBay est baissée à 1 par ebay-api-worker
--     (action reviser_quantite_annonce), hors de ce fichier.
-- Inverse : 20261001_xxewwer_bravely_quantite_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public._backup_0110_xxewwer (
  quoi text NOT NULL, id text NOT NULL, ligne jsonb NOT NULL, le timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (quoi, id));
ALTER TABLE public._backup_0110_xxewwer ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0110_xxewwer FROM PUBLIC, anon, authenticated;

DO $g$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = 1789843450625 AND statut = 'vendu' AND quantite = 0)
     OR NOT EXISTS (SELECT 1 FROM cross_post_jobs WHERE id = '91320446-455b-4b0b-8e33-f22bb771714b' AND status = 'published' AND platform_listing_id = '377462623400')
     OR (SELECT count(*) FROM cross_post_jobs WHERE id IN ('2773c89d-2363-47a0-9663-15d5bc8019e3', 'c0d918a5-db00-4c93-a207-df4b81bdd6bf') AND status = 'failed') <> 2 THEN
    RAISE EXCEPTION 'ETAT_INATTENDU : rien n''est fait';
  END IF;
END $g$;

INSERT INTO public._backup_0110_xxewwer (quoi, id, ligne)
SELECT 'fiche', id::text, to_jsonb(i) - 'photos' - 'description' FROM inventaire i WHERE id = 1789843450625
UNION ALL
SELECT 'retrait', id::text, to_jsonb(j) FROM cross_post_jobs j WHERE id IN ('2773c89d-2363-47a0-9663-15d5bc8019e3', 'c0d918a5-db00-4c93-a207-df4b81bdd6bf')
ON CONFLICT DO NOTHING;

UPDATE inventaire SET statut = 'stock', quantite = 1 WHERE id = 1789843450625;

UPDATE cross_post_jobs SET status = 'cancelled',
       error = 'Rien à retirer : l''annonce eBay porte l''exemplaire qui reste (2 disponibles, 1 vendu sur Vinted).',
       platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
         'clos_quantite', jsonb_build_object('le', now(), 'statut_avant', status, 'par', 'reparation 20261001 point 4'))
 WHERE id IN ('2773c89d-2363-47a0-9663-15d5bc8019e3', 'c0d918a5-db00-4c93-a207-df4b81bdd6bf');

SELECT (SELECT statut || ' / ' || quantite FROM inventaire WHERE id = 1789843450625) AS fiche,
       (SELECT string_agg(status, ',') FROM cross_post_jobs WHERE id IN ('2773c89d-2363-47a0-9663-15d5bc8019e3', 'c0d918a5-db00-4c93-a207-df4b81bdd6bf')) AS retraits,
       (SELECT count(*) FROM cross_post_jobs WHERE inventaire_id = 1789843450625 AND action = 'delete' AND status IN ('pending', 'processing', 'needs_user')) AS retraits_ouverts;
COMMIT;
