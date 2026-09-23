-- ══════════════════════════════════════════════════════════════════════════════
-- L'INTERRUPTEUR QUI MANQUAIT AU PRÉ-VOL DE LA COPIE (2026-09-23)
-- ══════════════════════════════════════════════════════════════════════════════
-- Le 23/09, la garde « on ne retire pas ce qu'on ne sait pas remettre » (0.6.58)
-- a bloqué 99 republications Vinted sur 99 — 100 % de faux positifs. Elle n'avait
-- AUCUN interrupteur : il a fallu corriger le serveur pour la contourner, parce
-- qu'on ne pouvait pas simplement l'éteindre en attendant le Chrome Web Store.
--
-- RÈGLE POSÉE CE JOUR-LÀ : toute garde capable de bloquer doit pouvoir être
-- coupée depuis le serveur, en une ligne, sans nouvelle version d'extension.
--
-- Lu par get-pending-jobs (champ `prevol_copie_actif` de la réponse) et honoré
-- par l'extension ≥ 0.6.60. 0 = ÉTEINT ; 1, absent ou illisible = ALLUMÉ —
-- une garde s'éteint sur décision, jamais par oubli.
--
--   Couper :   update coin_config set value = 0 where key = 'prevol_copie_actif';
--   Rallumer : update coin_config set value = 1 where key = 'prevol_copie_actif';
--
-- Éteinte, SEUL ce contrôle-là s'arrête. Restent actives : la validité de la
-- capture, la résolution prix/titre par la fonction de la recréation, la borne
-- de fraîcheur 24 h, la garde de boutique étrangère, l'invariant « une seule
-- annonce hors ligne », la réconciliation avant recréation, et l'ordre « on
-- remplit avant de supprimer ».
--
-- Idempotente : rejouable sans effet, et ne réécrit JAMAIS une valeur posée à
-- la main (un ON CONFLICT DO UPDATE rallumerait une garde volontairement
-- coupée — exactement ce qu'on ne veut pas).

insert into public.coin_config (key, value)
values ('prevol_copie_actif', 1)
on conflict (key) do nothing;
