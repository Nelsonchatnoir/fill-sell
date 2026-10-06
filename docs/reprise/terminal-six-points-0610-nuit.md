# Reprise — terminal « six points + modale Free » (06/10 nuit)

Mandat de Nico (06/10 soir) : pousser 076f6a4, puis six points (colis Vinted,
tailles, geronimo, mails de vente, carte Leboncoin nom/prénom, remise en
vente), chacun corrigé à la RÈGLE, retesté, zéro régression ; complément :
textes de la modale « Republication automatique » d'un Free. État de prod :
`docs/agents/etat-2026-10-01.md` § « 06/10 nuit ».

## En prod (relu)
- Fonctions : get-pending-jobs v221 (`true`), update-job-status v131,
  handler-watch v90, push-ventes v8, ebay-api-worker v78 (`false`).
- Migrations (feux verts explicites) : 20261006210000 (preuve « vue en ligne »
  des mails de vente, Vinted seulement), 20261006220000 (remise en vente d'un
  import eBay épuisé) — appliquées et inscrites (`migration repair`).
- Données : retrait Overwatch de geronimo annulé (inverse prêt).

## À livrer par Nico
- Extension 0.6.102 : `build/CWS-0.6.102-A-TELEVERSER/fillsell-extension-0.6.102-b230ebe-cws.zip`
  (BUILD_ID `2026-10-06T18:38:36Z+b230ebe`, sha256 `4f61b450…`) — remplace la
  0.6.101 jamais téléversée (rangée dans `build/anciens-zips/`). Après
  acceptation : `ALREADY_PUBLISHED` += "0.6.102" ; EXTENSION_MIN_BUILD jamais
  sans décision de Nico. Le poste de Nico tourne déjà la 0.6.102 (copie dev).
- OTA 2.9.64 : `dist/` (build `2026-10-06T18:39:03Z+b230ebe`) contient 2.9.63
  + carte Leboncoin + modale Free + lot Free.

## Règles neuves (et où)
- Tailles : `_shared/taille-de-service.js` (R0 → R3 → R4 → R1 → R2) ;
  question de taille tranchée une fois par handler-watch
  (`_shared/taille-question-auto.js`, marqueur `taille_convertie_serveur`).
- Leboncoin nom/prénom : `_shared/lbc-identite.js` (motif exact
  `lbc_escrow_identite`) ; app `src/stock/EcranIdentiteLbc.jsx` ;
  handler-watch : éclaireur 12 h, reprise du compte quand il passe.
- Colis Vinted : 0.6.102 `lireReferentielColisVinted`, `colis_bilan.referentiel`.
- Free : `repubLotReserve = false` (StockTab) — retour arrière d'une ligne.

## Ouvert
- patrick giry : 35 dépôts Leboncoin attendent son nom et prénom (éclaireur
  relancé à 20:21, revenu au même mur — compte pas encore complété).
- Les essais réels des tailles « EU N », « 2XL », enfants ne sont pas rejoués
  en ligne ce soir : leur chemin (R0 et l'extension) n'a pas changé ; preuve
  en ligne du 06/10 soir (0.6.101) toujours valable.
