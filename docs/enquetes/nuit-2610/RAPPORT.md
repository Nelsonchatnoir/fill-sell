# Nuit du 25 au 26/10 — refonte de la publication en lot + « zéro rouge de notre fait » (heure de Paris)

Prompt de nuit de Nico (25/10, 22:00). Ce fichier se remplit point par point ; le résumé pour Nico est en tête à la fin.

## 0. Proxy IPRoyal — FAIT
- Commande **#83578416** (ISP Dedicated, France, 1 IP, 30 jours : la même offre et le même compte qu'au 26/09) prolongée
  le 25/10 vers 22:05 depuis le tableau de bord IPRoyal (session déjà ouverte dans Chrome).
- Payée sur le **solde IPRoyal** (choix de Nico, demandé avant de payer) : **5,40 $** ; solde 16,00 $ → 10,60 $.
- Nouvelle échéance : **25/11/2026 à 11:19 (heure de Paris)** — relue par l'API (`expire_date` 2026-11-25 10:19:21 UTC,
  `extended_history` : la période du 26/09 au 26/10). Renouvellement automatique : toujours coupé (inchangé).

## 1. Refonte de l'étape 2 du lot — MAQUETTES (code de la refonte après la validation de Nico)
- Page **https://fillsell.app/demo/lot** : non listée, noindex, réservée au compte de Nico (toute autre session repart
  sur l'accueil) ; ses 32 articles sont lus avec sa session, les états sont simulés, rien n'écrit ni ne publie.
  Trois propositions (`?p=A`, `?p=B`, `?p=C`), la même feuille d'article pour les trois :
  - **A · La liste** — au lieu d'une grande carte par article, une ligne par question avec ses réponses en puces ;
    un seul « Tout valider » pour les textes ; les prêts repliés.
  - **B · Par question** — les questions rangées par sujet (toutes les tailles, puis les âges…) ; une réponse sert à
    plusieurs articles quand leurs listes sont les mêmes.
  - **C · Une à la fois** — une seule question à l'écran, en grand, avec la photo ; la suivante arrive dès la réponse.
- Banc : `node scripts/apercu/capture-maquettes-lot.mjs <lignes.json>` (lignes lues hors dépôt) — 390 px (2x) et 1280 px,
  contrôles : 32 cases, bilan exact, « Tout valider », feuille, cibles ≥ 44 px, champs ≥ 16 px, aucun débordement,
  aucune erreur de page : tout vert.
