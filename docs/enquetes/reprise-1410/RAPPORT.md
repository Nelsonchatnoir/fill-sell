# Reprise en main complète — 14/10 soir → 15/10 nuit (heures de Paris)

Mandat de Nico (14/10 soir) : comprendre avant de toucher, corriger la RÈGLE,
zéro régression, faire repartir ce qui est bloqué par la règle, compte rendu.
Feu vert global de Nico pour les migrations de cette reprise (14/10 ~23:35).
Journal des reprises : `journal-reprise.md` (même dossier).

## Ce qui est en production à la fin

| Élément | Avant | Après |
|---|---|---|
| Migrations | — | **20261015000000** (carte « Vendue » sans boucle), **20261015010000** (commande Vinted annulée → stock), **20261015020000** (tête de file) — appliquées, inverses dans `supabase/rollbacks/` |
| get-pending-jobs | v241 | **v245** (verify_jwt true) |
| handler-watch | v102 | **v104** (verify_jwt false) |
| App (web + OTA) | 2.9.86 | **2.9.88** (web : build `2026-10-15T01:11:40Z+813f7ab` après push) |
| Extension | 0.6.110 servie | **0.6.111 À TÉLÉVERSER** : `build/CWS-0.6.111-A-TELEVERSER/fillsell-extension-0.6.111-42f213b-cws.zip` (BUILD_ID `2026-10-15T01:06:01Z+42f213b`) ; 0.6.110 rangée dans `build/CWS-PERIMES/` |
| Selftests | 284/287 | **293/293** (+ 8 nouveaux : signal-vente-jamais-en-boucle, gpj-file-longue-et-pause, vente-vinted-annulee, tete-de-file, reprise-technique, champs-lbc-etat-marque, a-regler-sans-bandeau et stock-refonte remis au vert) |

## Par lot

### P1-0 — Louis : faux « déjà en ligne » et « Vendue » en boucle
- **Cause prouvée** : (1) la synchro du dressing de l'extension colle la vente
  d'une ANCIENNE annonce d'une fiche à plusieurs exemplaires au job VIVANT d'une
  autre annonce (repli par inventaire_id) ; le serveur démentait, la synchro
  reposait, la vente était refusée (« toujours en ligne ») sans lever le signal,
  et l'app n'offrait aucune sortie. (2) « Rangement Gris » : annonce
  10269274366 plus vue depuis le 07/10, question reportée, le stepper disait
  « déjà en ligne ». (3) même boucle sur un vrai « vendu » d'une fiche déjà
  vendue par une vente saisie (Kit bûche, Swatch de Tech-t).
- **Corrigé** : migration 20261015000000 (déclencheur, refus qui lève le signal,
  même cession, `signal_vente_trancher`, réconciliation bornée dans le cron des
  ventes prouvées) ; app : « Ce n'est pas vendu » / « Déjà enregistrée » ;
  stepper « Plus vue en ligne depuis le JJ/MM » + « Répondre » ; extension
  0.6.111 : le repli par fiche ne vise plus qu'un job sans numéro.
- **Repris par la règle** : 15/10 01:59 → 1 carte démentie (Louis), 15 cartes
  closes sur la vente existante (0 vente créée, 0 mail, 0 retrait).

### P1 — Louis : ventes invisibles, annulation, boutique
- « Vendu » trié par date de vente (`utils/triVendus.js`) ; le lien du mail
  « Vendu » ouvre l'onglet Ventes quand rien n'est à confirmer.
- Commande Vinted annulée : migration 20261015010000 (vente née d'une preuve
  retirée, fiche au stock, job clos ou republié si Vinted l'a remise en ligne ;
  lots reconnus par `item_ids`, transmis par l'extension 0.6.111).
- Bascule de boutique : PAS un défaut — la sonde voit le changement en ≤ 10 min,
  la synchro de 20:20 a lu @neyenonie. Deux boutiques en même temps sur UN compte
  FillSell : non prévu ; deux comptes FillSell (un par navigateur) : possible.

### P2 — Louis : republications Leboncoin en pause, créneaux
- **Cause prouvée** : « Tout mettre en pause » (20:13) passe le module à
  inactif ; get-pending-jobs ignorait un module inactif → 3 republications
  parties 20:15-20:42. 17 republications « relancer » (lecture bloquée par
  l'anti-robot, annonce intacte) sans reprise automatique.
- **Corrigé** : gpj retient les jobs auto d'un module en pause (message dit) ;
  handler-watch les reprend sur PREUVE (sonde « répond » après le blocage,
  3 fois au plus, 3 par compte à chaque passage) — à 03:00 la sonde Leboncoin
  de Louis disait encore « null » : rien n'est reparti, c'est voulu.

### P3 — orphelines (linda, Ornella)
- **linda (cause prouvée)** : la garde de boutique lisait 782 fiches en un seul
  `.in()` → lecture tombée → 784 opérations retenues, toutes plateformes (Table
  noire Leboncoin hors ligne depuis le 13/10 16:57). Corrigé : garde Vinted seule,
  `_shared/par-lots.ts` (30 lectures de masse converties). Son ordinateur est
  éteint depuis le 14/10 16:57 : tout repartira au prochain passage.
- **Ornella 9a7b9499** : republication déjà recréée revenue « Étape inconnue » ;
  règle partagée `_shared/republication-finie.js` → close « published » à 03:00.

### P4 — Ciddjy : 68 dépôts Beebs « mis de côté »
- **Cause prouvée** : file servie entière, chaque tâche comptée « servie sans
  démarrer ». Corrigé : tête de file seule (mig 20261015020000, gpj v243).
- **Reprise** : paquet ciddjy-1 (10) à 03:07, puis handler-watch v104 par
  paquets de 10 avec disjoncteur (> 10 % d'échecs → arrêt).
- Les 6 « interrompue deux fois » restent à la personne (risque de doublon) ;
  le message ne dit plus une « cause probable » inventée (0.6.111).

### P8 — champs requis (partiel)
- DeadRoz : l'état choisi pour la publication passe avant celui de la fiche.
- Louis : « État satisfaisant » ↔ « État satisfaisant - fonctionnel ».
- Ornella « Canon » : une marque devinée par Leboncoin ≠ celle de l'article
  n'est plus gardée (« Autre », jamais « Sans marque ») — extension 0.6.111.

### Non corrigé (et pourquoi)
- **P5 Marta** (vinted.it, HYPOTHÈSE forte) : le domaine se décide dans le
  navigateur ; geste immédiat : se connecter sur www.vinted.fr dans Edge.
- **P6 DeadRoz (paiement compté deux fois)** : cause prouvée (invoice.paid lu
  avant checkout, palier lu sur des drapeaux) ; le correctif touche le flux de
  paiement → décision de Nico (R4).
- **P7** : pas un défaut (annulations d'imports remplacés par republication).
- **P9** mur « Valider et payer » : FillSell ne paie jamais — attend la personne.
- **P10** « n'a pas abouti » Leboncoin : la contradiction de titre PROTÈGE
  (rattachement par titre suspect) ; rien à forcer.
- **P12** Amega : retrait eBay par Chrome = la voie de création de l'annonce
  (par conception) ; Kossiwa : texte « ton annonce est intacte » faux sur une
  publication (correctif d'une ligne, non déployé : update-job-status embarque
  des modules partagés modifiés depuis son dernier déploiement).
- **P13** SPGL 44 : compteur déjà à 0, rien à faire. **P14** : lecture seule.
- **P16 / P17 / P18** (fond) : non commencés.
