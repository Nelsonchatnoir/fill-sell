-- ── Relevé : VUES et FAVORIS par plateforme (2026-09-18, demande Nico) ────────
-- Les listes « Mes annonces » les montrent à chaque relevé (Leboncoin :
-- « 2 vues pour cette annonce » / « 0 mises en favoris » ; eBay : colonnes
-- Vues / Suivis du Hub vendeur ; Beebs : œil et cœur sur la carte ; Opla :
-- viewCount / favouriteCount de l'API). L'extension (≥ 0.6.42, HEAD ≥ ca00d08)
-- les écrit à CHAQUE relevé, et seulement si ces colonnes existent (sondées
-- avant l'upsert). L'app additionne ces compteurs à ceux de Vinted sur la
-- carte de l'article, et montre le détail par plateforme au tap.
-- NULL = la liste ne le montrait pas — jamais 0 par défaut.
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS vues integer;
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS favoris integer;
COMMENT ON COLUMN public.annonces_plateforme.vues IS 'Vues affichées par la plateforme au dernier relevé (NULL = non montré)';
COMMENT ON COLUMN public.annonces_plateforme.favoris IS 'Favoris / suivis affichés par la plateforme au dernier relevé (NULL = non montré)';
