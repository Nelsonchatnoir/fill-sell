# Lot « zéro friction » (13/11 soir → 14/11) — rapport

Comptes en id8, heures de Paris. Tout est EN SERVICE sauf mention « préparé ». Versions : `docs/agents/etat-2026-10-01.md`
(14/11). Suite complète verte avant chaque commit (750 → 761 selftests, par morceaux).

## A — Zéro friction à l'envoi (OTA 2.9.187)
- **Mesuré (7 jours au 13/11)** : 116 fermetures sans publier (61 au 1er écran, médiane 22 s ; 11 au 2e ; 45 au dernier).
  Les 45 du dernier écran, une par une : 25 champ ou clic eBay refusé, 5 mur de quota du palier gratuit (légitime :
  quota « annonces » épuisé), 2 lot quitté, 13 sans cause visible (dont 2 où la personne a publié dans la minute).
- **A1 Âge Beebs** : 205 des 324 questions venaient de « Livres > Autres livres » (magazines, essais, romans adultes).
  Rangement : roman sans signe jeunesse → « Romans pour adultes », recettes → « Livres de recettes » (aucun « Âge »).
  Âge certain : pointure enfant dans une tranche. Âge probable (pré-rempli, montré, 1 geste) : livre / magazine / CD /
  DVD sans signe jeunesse → « 16 ans et + », rollers « du 32 au 35 » → « 8 ans - 12 ans », jeu de société pour adultes,
  puzzle ≥ 500 pièces. Figurine ou jeu vidéo sans indice : la question reste (rien d'inventé).
- **A2** : valeur neutre et vraie (« Non précisé » : classification Vinted), seule valeur suggérée (eBay « Boucle de
  ceinture » de 86647, le « Type » refusé à f8a94c06), « Autre(s) » des listes Leboncoin (image/son, collection,
  instruments…). Jamais taille, marque, état, genre, machine d'un jeu. eBay « Matière doublure externe » sans neutre : la
  question reste, elle ne retient plus qu'eBay.
- **A3** : le bouton ne grise plus pour UNE plateforme — elle est retenue et nommée (« Vinted (Marque) attend une
  réponse… »), les autres partent ; clic eBay sur un champ jamais montré : posé ou laissé au dépôt, jamais refusé.
- **A4 rejeu** (`scripts/rejeu-zero-friction-1411.mjs`) : 507 questions → 49 certaines, 121 probables, 103 déjà réglées
  le 13/11, 234 restent ; 139 abandons → 76 évités par une valeur, 13 où les autres seraient parties, 3 déjà réglés,
  47 restent (taille, état, marque, genre : jamais devinés) ; 66 clics eBay refusés → 0.
- Verrou `selftest:valeurs-probables` ; aperçu du vrai stepper `scripts/apercu/capture-zero-friction-1411.mjs` (10/10).

## B — Offres et parcours (OTA 2.9.188)
- La pastille de quota ouvrait les offres : 148 ouvertures, 2 clics sur une formule (1,4 %) contre 13,5 % pour « Voir les
  offres ». Elle ouvre « Tes quotas du mois » (utilisé, reste, date de remise, ce qui compte), lien discret vers les offres.
- Parcours (119 inscrits du 08 au 13/11) : sans voie de publication, 0 publication sur 79 ; 12 partis relier eBay au milieu.
  eBay passe APRÈS (depuis le récap), le choix Cloud 7 jours / ordinateur en 2e étape, « Ton plan Free » fusionné dans le
  récap. Verrous `selftest:detail-quota`, `selftest:entree-ordre`.

## C — Stock, ventes (OTA 2.9.189, migration 20261114013000)
- **C1** : 7153db13, Leboncoin 3294316029 — constat « absente de deux relevés complets » posé le 09/11, mais la carte ne
  lisait que le statut du job. Désormais « Hors ligne · date » + la question, et plus de « Republier » refusé. En prod :
  Leboncoin 835 annonces (62 comptes), eBay 709 (41), Depop 2. Verrou `selftest:absente-releves-complets`.
- **C2** : veille des annonces récentes (une page par passage, numéros inconnus importés par le chemin d'un relevé,
  empreinte des photos, aucun quota) — extension 0.6.188 + migration appliquée, **interrupteur à 0**.
- **C3** : f0acd3af (Cloud) — 23 relevés au bouton, 0 automatique : la copie Cloud était 0.6.186 (cadence d'avant).
  0.6.188 servie au Cloud le 14/11 ; verrou vert sur la copie servie.
- **C4** : 10699531774 (f0acd3af) vendue le 07/11 16:43 ; pas un doublon FillSell, aucun risque de double vente. Mais la
  vente était COMPTÉE DEUX FOIS (vente relevée sans fiche + « Enregistrer » sur la fiche née du relevé) : 66 paires sur
  12 comptes (646,29 €), 283 fiches exposées (33 comptes). Corrigé dans l'app (verrou `selftest:vente-une-seule-fois`) ;
  réparation des 283 PRÉPARÉE, non jouée (règle du lot).
- **C5** : d8b07167 (Vinted 10330447591 vendue le 31/10 ; Beebs 34042975 relue active le 11/11 09:18, retrait en attente
  de la connexion Beebs) et a5da17ee (eBay vendu le 06/11 ; Vinted 10619395333 et Leboncoin 3300150365 jamais relues
  depuis, poste éteint) : aucune double vente prouvée, indécidable depuis faute de lecture.

## D — IP (orchestrateur 3e6bfac72f49, migration 20261114090000)
- IP 77 jetée le 13/11 à tort (relue 3/3 par son proxy) : quarantaine au lieu du rebut, recontrôles 15 min / 1 h / 4 h /
  12 h, signalement après 4 échecs sur 24 h. Remise en quarantaine le 14/11 09:30, **revenue au pool à 09:36**.
- Prolongation auto sur le solde : prouvée (J-3, registre, échéance relue) ; deux défauts corrigés (« France épuisée »
  bloquait toute prolongation ; la santé ne tournait plus depuis le 12/11). Commandes inconnues jamais prolongées.
  Marge 3 → 2. Verrous `selftest:cloud-ip-quarantaine`, `selftest:cloud-ip-prolongation`.

## E — Divers (OTA 2.9.190)
- **E1** : web déjà suivi ; iPhone : seul le lien de campagne App Store Connect (agrégé) ; Android : lecture du referrer
  Google Play prête mais INACTIVE (module natif en attente du prochain binaire). Verrou `selftest:acquisition-meta`.
- **E2** : 3 refus Leboncoin inexpliqués (d87570eb, cfdfda6f, f175c284 nouveau le 13/11) — pas de famille commune.
  Essai Android réel et essai des abonnés boutique : demandent un téléphone / un binaire.
- **E3** : 4d946500 et 8ac5bbda sur ordinateur : users/me de Depop muet par moments (≈ 7 % des lectures du parc), alors
  que relevé et ventes ne lisent que du public. Identité prouvée retenue 24 h pour ce jeton. Verrou
  `selftest:depop-identite-lecture`. Dans la 0.6.188.
