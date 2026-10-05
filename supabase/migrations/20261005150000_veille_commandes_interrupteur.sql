-- ═══════════════════════════════════════════════════════════════════════════
-- Veille des commandes Vinted / Leboncoin — l'interrupteur (05/10, Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Extension 0.6.98 (veillerCommandes, background.js) : la liste des commandes
-- de vente lue toutes les 10 min, comptes payants (palier_de ≥ premium),
-- bornée, mesurée (usage_logs 'veille_commandes', une ligne par jour et par
-- poste), coupée 24 h au premier signe anti-robot. Elle relit cet interrupteur
-- toutes les 30 min, fail-closed : 0 = plus aucune lecture de liste, sur tous
-- les postes, sans nouvelle version. 1 = ouverte.
-- Charge base par poste : 1 lecture de coin_config + 1 rpc palier_de toutes
-- les 30 min ; par commande neuve : 1 lecture de cross_post_jobs. Rien de
-- neuf = 0 écriture.
-- Inverse : UPDATE public.coin_config SET value = 0 WHERE key = 'veille_commandes_ouverte';
INSERT INTO public.coin_config (key, value) VALUES ('veille_commandes_ouverte', 1)
ON CONFLICT (key) DO NOTHING;
