-- INVERSE de 20261001_xxewwer_bravely_quantite.sql — sur décision seulement.
-- (L'annonce eBay, elle, se remonte à 2 par la même action du worker si besoin.)
BEGIN;
SET LOCAL lock_timeout = '3s';
-- Remettre « vendu » ne doit RIEN armer : la vente est déjà traitée.
SELECT set_config('fillsell.sans_retrait', '1', true);
UPDATE inventaire i SET statut = b.ligne ->> 'statut', quantite = (b.ligne ->> 'quantite')::int
  FROM public._backup_0110_xxewwer b WHERE b.quoi = 'fiche' AND i.id = b.id::bigint;
UPDATE cross_post_jobs j SET status = b.ligne ->> 'status', error = b.ligne ->> 'error', platform_fields = b.ligne -> 'platform_fields'
  FROM public._backup_0110_xxewwer b WHERE b.quoi = 'retrait' AND j.id = b.id::uuid AND j.status = 'cancelled';
COMMIT;
