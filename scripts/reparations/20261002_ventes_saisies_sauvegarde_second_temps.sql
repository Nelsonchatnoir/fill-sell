-- ═══════════════════════════════════════════════════════════════════════════
-- SAUVEGARDE (aucune écriture sur ventes) — ventes SAISIES susceptibles de
-- recevoir une ligne relevée de la même cession (02/10 soir, point 9)
-- ═══════════════════════════════════════════════════════════════════════════
-- La sauvegarde _backup_0210_ventes_rattrapage ne couvre que les ventes créées
-- depuis le 19/09. Le second temps (0.6.88) peut compléter des ventes saisies
-- PLUS ANCIENNES (commande, numéro d'annonce, date réelle) : on garde leur état
-- d'avant, ligne entière, pour que l'inverse
-- (20261002_ventes_second_temps_INVERSE.sql) puisse les remettre à l'identique.
-- Exécuté le 02/10 ~21:15 Paris, alors que seul le poste de Nico (cobaye) tourne
-- en 0.6.88 : ses 10 ventes déjà complétées à 20:42 ont, pour les champs remplis
-- (commande, numéro d'annonce, date réelle, code plateforme), la valeur vide
-- comme état d'avant (règle de la RPC : seuls les champs vides se remplissent).
BEGIN;
CREATE TABLE public._backup_0210_ventes_saisies_second_temps AS
  SELECT v.*, now() AS sauvegarde_le FROM public.ventes v
   WHERE v.commande_ref IS NULL AND v.inventaire_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public._backup_0210_ventes_rattrapage b WHERE b.id = v.id);
ALTER TABLE public._backup_0210_ventes_saisies_second_temps ADD PRIMARY KEY (id);
ALTER TABLE public._backup_0210_ventes_saisies_second_temps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0210_ventes_saisies_second_temps FROM anon, authenticated;
SELECT count(*) FROM public._backup_0210_ventes_saisies_second_temps;
COMMIT;
