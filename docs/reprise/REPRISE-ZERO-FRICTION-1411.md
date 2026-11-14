# Reprise — lot « zéro friction » (13/11 soir → 14/11)
Rapport : `docs/enquetes/zero-friction-1411/RAPPORT.md` ; état de prod : `docs/agents/etat-2026-10-01.md` (14/11).

## En service
Blocs A à E poussés (dernier code 1ea9e9d), OTA 2.9.187 → 2.9.190, migrations 20261114013000 et 20261114090000,
orchestrateur cloud-2 3e6bfac72f49, copie Cloud 0.6.188.45703.

## Reste à faire / décider
| Sujet | État | Qui |
|---|---|---|
| Extension 0.6.188 | zip prêt : `build\CWS-0.6.188-A-TELEVERSER\fillsell-extension-0.6.188-cws.zip` ; après acceptation : ajouter « 0.6.188 » à ALREADY_PUBLISHED (package-extension.mjs) | Nico téléverse |
| Veille des annonces récentes (C2) | migration appliquée, interrupteur `veille_recentes_ouverte` = 0 | Nico : allumer quand la 0.6.188 est en ligne |
| 283 ventes Vinted à rattacher (C4) | `scripts/reparations/20261114_ventes_vinted_rattachees.sql` préparé | Nico (compte client hors de l'app) |
| 66 paires de ventes déjà doublées (C4) | aucune touchée | Nico : quelle ligne garder |
| IP « grillées » par la santé (règle du 07/11, définitive) | IP 79 (eBay) et IP 3 (Leboncoin, Beebs) le 14/11 vers 10:05 | Nico : leur appliquer la quarantaine du 14/11 ? |
| Origine Android (E1) | module natif en attente : `docs/enquetes/zero-friction-1411/en-attente/referrer-play-android.patch` ; migration 20261114100000 préparée | Nico : accord pour le prochain binaire |
| Lien de campagne iPhone (E1) | `APP_STORE_PT` = null | Nico lit pt dans App Store Connect |
| Beebs : 331 annonces absentes des 2 derniers relevés, sans constat (modération) | rien fait | Nico : règle avec délai ? |

## Pièges vus
- `git apply --3way` écrit en CRLF (core.autocrlf) ET indexe dans l'index PARTAGÉ : préférer `git apply`, puis
  `git reset -q -- <fichiers>` ; repasser les fichiers en LF si un selftest lit `\n`.
- Un commit qui touche `chrome-extension/` impose de monter EXTENSION_LAST_COMMIT (scripts/build-id.mjs) dans un commit
  à part, sinon `npm run build` (OTA) refuse ; Vercel, lui, construit quand même.
- OTA : `@capgo/native-purchases` du canal = paquet npm 8.3.3 + patch 31e5873 avec le Java TOUT en LF (iOS idem) ;
  sauvegarder l'état vc38 avant, le rendre octet pour octet après (diff -r).
