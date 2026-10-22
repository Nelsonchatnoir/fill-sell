-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 22/10 au soir (point 2 — paugues) — une œuvre d'art n'est jamais « Beauté »
-- ═══════════════════════════════════════════════════════════════════════════
-- La règle est corrigée à la racine (src/utils/oeuvreDArt.js : detectType, icône, refus Leboncoin, rayon Vinted).
-- Restent les fiches TYPÉES « Beauté » avant la règle. Audit du parc sur 30 jours (149 fiches « Beauté ») : 3 œuvres,
-- toutes de paugues. Elles passent en « Maison » (le type que la règle donne à une œuvre).
-- Rien n'est republié ni retiré : leurs annonces restent en ligne (catégories listées au rapport).
-- Sauvegarde : _backup_2210_soir_oeuvres ; inverse : remettre le type sauvegardé (requête en fin de fichier).
-- Aucun mail. Essai : remplacer COMMIT par ROLLBACK.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_2210_soir_oeuvres (
  le timestamptz DEFAULT now(), inventaire_id bigint PRIMARY KEY, user_id uuid, type_avant text, type_apres text);
ALTER TABLE public._backup_2210_soir_oeuvres ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2210_soir_oeuvres FROM anon, authenticated;
INSERT INTO public._backup_2210_soir_oeuvres (inventaire_id, user_id, type_avant, type_apres)
SELECT i.id, i.user_id, i.type, 'Maison' FROM inventaire i
 WHERE i.id IN (1792681138897, 1792441607070, 1792599699501) AND i.type = 'Beauté'
ON CONFLICT (inventaire_id) DO NOTHING;
UPDATE inventaire i SET type = 'Maison'
  FROM public._backup_2210_soir_oeuvres b WHERE b.inventaire_id = i.id AND i.type = 'Beauté';
SELECT b.inventaire_id, b.type_avant, i.type AS type_maintenant, left(i.titre, 70) titre
  FROM public._backup_2210_soir_oeuvres b JOIN inventaire i ON i.id = b.inventaire_id ORDER BY 1;
COMMIT;
-- INVERSE : UPDATE inventaire i SET type = b.type_avant FROM public._backup_2210_soir_oeuvres b
--           WHERE b.inventaire_id = i.id AND i.type = b.type_apres;
