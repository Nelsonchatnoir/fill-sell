# Reprise — terminal « Problèmes », lot du 05/10

Brouillon tenu pendant le lot ; la version finale est réécrite à la clôture.

## Fait (en prod)
- Sessions de l'extension refusées depuis le 04/10 19:01 → corrigé (mig 20261005090000).
- Remise en vente après une vente partielle : file `remises_en_vente` + tick
  (mig 20261005100000) ; cron `remises-en-vente-5min` = mig 20261005100100, à
  appliquer sur GO de Nico (rattrape 10 fiches Vinted de Louis).
- Palier unique serveur (mig 20261005110000) et fonctions edge alignées.
- ujs v128, handler-watch v81, gpj v215, generate-listing v112, voice-intent
  v155, voice-transcribe v46, deal-analysis v42, avis-demande v4.

## En cours
- Extension 0.6.97 (LBC transporteurs exacts, Vinted colis/marque/lenteur,
  republication après suppression envoyée, palier).
- App : colis Vinted au lot et au stepper (retenu par rayon), carte « Prêt »
  sans rayon.

## À faire
- Essais réels 0.6.97 (Nico recharge l'extension).
- Fiches de test de Nico supprimées (point 13).
