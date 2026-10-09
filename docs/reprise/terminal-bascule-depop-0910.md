# Reprise — terminal du 09/10 soir : preuve 0.6.106 + bascule Opla → Depop

## Fait [mesuré]
- 0.6.106 `9d442ae` chargée chez Nico (zip exact) ; republication Vinted 4a1d0f93 et
  publication Depop 667223b6 VERTES en 0.6.106 (cf. `docs/agents/etat-2026-10-01.md`,
  « 09/10 soir — PREUVE 0.6.106 + BASCULE »). Sauvegarde de la 0.6.105 de Nico : scratchpad
  de la session (`backup-FillSell-Extension-Nico-0.6.105-f59c1c2`).
- Migration 20261009230000 APPLIQUÉE : Depop ouverte à tous à `opla_sortie_le`,
  republication automatique Depop ouverte (pf_depop = 1, espacement 900 s).
- App + site : bascule à la même horloge, sans geste (selftest `bascule-opla-depop`).

## À vérifier au prochain check (après 00:00)
- `select public.depop_autorise('<un compte ordinaire>')` = true ;
  `select key, value from coin_config where key = 'republish_planifiee_pf_opla'` = 0
  (handler-watch) ; jobs Opla publish/republish en attente → cancelled `opla_sortie` ;
  aucun retrait Opla clos (`action = 'delete'`).
- fillsell.app : Depop dans la landing (textes, logos).

## Ouvert / décisions de Nico
- Téléverser `build/CWS-0.6.106-A-TELEVERSER/fillsell-extension-0.6.106-9d442ae-cws.zip`
  + « Envoyer pour examen » (tant qu'elle n'est pas servie, Depop ne s'affiche chez personne
  d'autre que Nico).
- get-pending-jobs `PF_CRENEAU` + 'depop' (non fait : lecture refusée par le classifieur).
- Écran « republication planifiée » de l'app sans ligne Depop (`PLATEFORMES_PLANIFIEES`,
  exceptions de `selftest:depop-partout` à retirer en même temps).
- `selftest:veille-commandes` rouge AVANT ce lot (extension non touchée ici).
