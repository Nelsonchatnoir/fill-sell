-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 22/10 au soir (point 1f, décision de Nico) — la taille des fiches écrasée par « Compléter », rendue
-- ═══════════════════════════════════════════════════════════════════════════
-- Jusqu'au 22/10 matin (corrigé à la racine, commit 01c2437), « Compléter » écrivait la réponse d'une plateforme
-- (sa grille : « Autre », « 14 ans (152-164 cm) », « M »…) sur la taille de la FICHE. 34 fiches en 30 jours portent
-- une taille égale à une réponse de « Compléter » (source manuel). Rejeu de l'historique (copies Leboncoin / eBay
-- créées AVANT l'écrasement — elles portent la taille de la fiche telle quelle —, captures Vinted d'avant) :
--   · 5 fiches avaient une AUTRE taille avant : elles la retrouvent (ci-dessous, preuve à l'appui), avec la source
--     « manuel » de la valeur écrasée (la fusion des attributs ne laisse rien passer sous un « manuel ») et la trace
--     rendue_le / ecrasee_par_completer / preuve ;
--   · 2 fiches avaient déjà la même taille (batix-pilotage S, L) : rien à faire ;
--   · 27 fiches n'avaient AUCUNE taille avant (la réponse a rempli une case vide) ou aucune trace de la précédente :
--     non touchées, listées au rapport (aucune valeur devinée).
-- RIEN n'est republié (décision de Nico) ; les annonces parties avec la taille écrasée sont listées au rapport.
-- Garde : une fiche n'est réécrite que si sa taille est TOUJOURS la valeur écrasée (personne n'y a touché depuis).
-- Sauvegarde : _backup_2210_soir_tailles ; inverse : 20261022_soir_tailles_ecrasees_par_completer_INVERSE.sql.
-- Aucun mail. Essai : remplacer COMMIT par ROLLBACK.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_2210_soir_tailles (
  le timestamptz DEFAULT now(), inventaire_id bigint PRIMARY KEY, user_id uuid, taille_avant jsonb, taille_apres jsonb);
ALTER TABLE public._backup_2210_soir_tailles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2210_soir_tailles FROM anon, authenticated;

CREATE TEMP TABLE _rendues (inventaire_id bigint, ecrasee text, rendue text, preuve text);
INSERT INTO _rendues VALUES
  (1792333216188020, 'Autre',               '8 ans / 128 cm',  'copie Leboncoin du 18/10 18:27 (avant l''écrasement du 19/10 10:57)'),
  (1789889085507006, '10 ans (128-140 cm)', '10 ans / 140 cm', 'copie Leboncoin du 20/10 00:03 et capture Vinted d''avant'),
  (1787440297428000, '14 ans (152-164 cm)', 'S',               'copie Leboncoin du 27/09 08:15 et capture Vinted d''avant'),
  (1790778002038,    'M',                   '38',              'copies Leboncoin et eBay du 30/09 16:23 (avant l''écrasement de 17:57)'),
  (1790957184849,    'W34 | FR 44',         '44',              'copie eBay du 02/10 18:06 (avant l''écrasement de 19:09)');

INSERT INTO public._backup_2210_soir_tailles (inventaire_id, user_id, taille_avant)
SELECT i.id, i.user_id, i.attributs -> 'taille'
  FROM inventaire i JOIN _rendues r ON r.inventaire_id = i.id
 WHERE i.attributs -> 'taille' ->> 'v' = r.ecrasee
ON CONFLICT (inventaire_id) DO NOTHING;

UPDATE inventaire i
   SET attributs = jsonb_set(i.attributs, '{taille}', jsonb_build_object(
         'v', r.rendue, 'source', 'manuel', 'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'rendue_le', now(), 'ecrasee_par_completer', r.ecrasee, 'preuve', r.preuve))
  FROM _rendues r
 WHERE r.inventaire_id = i.id AND i.attributs -> 'taille' ->> 'v' = r.ecrasee;

UPDATE public._backup_2210_soir_tailles b SET taille_apres = i.attributs -> 'taille'
  FROM inventaire i WHERE i.id = b.inventaire_id AND b.taille_apres IS NULL;

SELECT p.email, b.inventaire_id, left(i.titre, 40) titre, b.taille_avant ->> 'v' avant, b.taille_apres ->> 'v' apres
  FROM public._backup_2210_soir_tailles b JOIN inventaire i ON i.id = b.inventaire_id JOIN profiles p ON p.id = b.user_id
 ORDER BY 1, 2;
COMMIT;
