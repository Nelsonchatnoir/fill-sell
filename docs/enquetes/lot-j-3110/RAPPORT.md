# Lot J — finition (31/10/2026 soir → 01/11 nuit)

Heure de Paris partout. Aucun mail, rien chez Stripe, aucune annonce touchée à la main. Les propositions du lot I
(fermeture des anciens échecs, ventes « inconnues », « Vendue ? » de Johan) ne sont pas touchées.
Selftest du lot : `npm run selftest:lot-j-3110`. Déploiements et preuves : § « Livraison ».

## 1. Leboncoin : la pause se lève après un essai réussi (Louis)
**Trouvé.**
- louis@ttfamily.fr : l'essai prudent (relevé 3dda4151, 19:38, 407 annonces lues sur 407) a bien LEVÉ la pause à
  19:40:28 (`leve_le`) : reprise prudente jusqu'au 01/11 01:40. La clé `blocage_acces` restait là, avec la levée dedans.
- Mais pendant ces 6 h de reprise, le serveur disait encore « pause » à l'extension (`blocages.leboncoin`, état
  « reprise ») : l'extension coupait la veille des commandes, le relevé des ventes et la recherche des liens. Ses
  ventes Leboncoin n'étaient donc PAS surveillées, alors que Leboncoin avait répondu.
- Deuxième défaut, plus grave : si Leboncoin avait refusé de nouveau après la levée, la pause ne se serait JAMAIS
  remise. `platform_settings_fusionner` fusionne l'objet ; le nouveau blocage gardait `leve_le` de l'ancien → l'état
  restait « reprise », puis « libre ».
- louis-seller@ttfamily.fr (machine virtuelle) : pause toujours posée, aucun essai (son poste ne fait jamais Leboncoin).

**Changé** (règle pour tous les comptes, `_shared/blocage-leboncoin.js`) :
- essai réussi → l'extension n'est plus mise en pause (absent = libre, toutes versions) : les ventes sont de nouveau
  surveillées tout de suite ; seules les actions restent espacées (une toutes les 10 min pendant 6 h, pas de rafale) ;
- refus après la levée → la pause se remet, avec le même délai (essai 24 h plus tard) : les clés de l'ancienne levée
  sont retirées (handler-watch, update-job-status) ;
- reprise finie → la clé `blocage_acces` est rangée dans `blocage_acces_dernier` (clé présente = pause en cours) ;
- un poste en machine virtuelle ne fait jamais l'essai (il le « consommait » sans rien faire) : louis-seller garde sa
  pause tant que SON essai n'a pas réussi sur un vrai poste.

## 2. Bouton « Synchroniser »
**Trouvé.** Rosa : 6 appuis. Le serveur ne relit pas une plateforme lue il y a moins de 15 min, mais le bouton restait
actif et rien ne le disait.

**Changé** (`src/stock/boutonSynchro.js`, `src/stock/BlocSynchro.jsx`) :
- sous le bouton : « Vinted à jour il y a 3 min · Leboncoin à jour il y a 4 min » (plateformes connectées seulement) ;
- tout lu il y a moins de 15 min → bouton grisé, « Tout est à jour, prochaine synchro automatique vers 14 h » ;
- il se rouvre seul à la fin des 15 min, ou dès qu'une plateforme n'est plus à jour ou vient d'être connectée ;
- stock remis à zéro (annonces trouvées, stock vide) : jamais grisé (règle du 26/10) ;
- cadence et relevés automatiques : inchangés.

## 3. eBay : compte qui n'est pas sur eBay France (Rosa, « reginat8117 », eBay États-Unis)
**Trouvé.**
- Ses 4 premières publications eBay (19:16 → 19:54) ont été créées AVANT qu'elle relie son compte eBay (20:05:39) :
  elles partaient par l'extension (essais coupés : « The page keeping the extension port… »).
- À la liaison, le serveur les a basculées vers l'API et rangées « compte à finir » (lien ebay.fr) SANS lire le pays du
  compte (`rerouterPublicationsVersApi`). Les 14 suivantes passaient par la garde du worker : closes avec le bon message.
- L'app lisait l'état du compte eBay une seule fois au chargement : un compte relié depuis un autre onglet laissait eBay
  proposé.
- Sur tout le parc, seules ces 4 tâches étaient dans ce cas.

**Changé** :
- passage « voie extension → api » : compte hors d'eBay France → clôture « FillSell publie seulement sur eBay France… » ;
- filet à chaque passage du worker : toute attente eBay (publication, republication ; jamais en cours, jamais un retrait)
  d'un compte hors d'eBay France est close sous sa vraie raison ; le brut technique est archivé, jamais affiché ;
- app : l'état eBay est relu au retour dans l'app (au plus une fois par minute) → eBay grisé avec sa phrase.
- eBay France : inchangé.

## 4. Leboncoin : adresse refusée en republication seulement (doriane-henri)
**Trouvé — la différence.**
- Publication : l'extension tape l'adresse des Réglages « 2 rue arsene soulages 12110 viviez ». Leboncoin ne connaît
  pas cette rue : l'extension se replie sur la commune « Viviez (12110) ». Ses 22 publications du jour sont TOUTES
  passées ainsi (warning `adresse_barreau3_repli_commune`).
- Republication : son annonce d'origine est localisée à la commune. Le serveur y ajoutait la rue des Réglages (règle du
  01/10, pour les comptes où Leboncoin exige une rue). Le contrôle de l'extension AVANT tout retrait cherche alors
  « 2 rue arsene soulages 12110 Viviez » : aucune proposition → pause « Vérifie tes Réglages ».
- Donc : chez nous. La rue servie était justement celle que Leboncoin ne connaît pas.

**Changé** :
- une publication passée par la commune avec l'adresse des Réglages prouve que Leboncoin ne connaît pas la rue et
  accepte la commune → la republication tape la commune (rue servie avant : retirée, jamais remise) ;
- même adresse passée en publication → jamais « tes Réglages » : « c'est chez nous », reprise automatique espacée.

## Livraison
**Déployés par Claude** (versions et `verify_jwt` lus avant / après, 31/10 23:57) :
- get-pending-jobs v314 → **v315** (verify_jwt vrai) ; update-job-status v161 → **v162**, handler-watch v153 → **v154**,
  ebay-api-worker v102 → **v103** (tous `--no-verify-jwt`, verify_jwt faux, inchangé). De 23:57 à 00:01 : 70 + 11 + 1 + 1
  appels, tous 200.
- **OTA 2.9.144** : canal production lu 2.9.143 → relu **2.9.144** (00:01:13) ; dist `2026-10-31T23:00:35Z+92c2cbb`
  (contient « Tout est à jour, prochaine synchro automatique »).
- Extension : **inchangée** (aucun fichier de `chrome-extension/` touché) — pas de zip ; la 0.6.163 reste celle à téléverser.
- Migrations : aucune.

**Preuves.**
- Point 1 (Louis) : au premier poll après le déploiement (23:58:28), journal « Leboncoin en reprise prudente (levé le
  2026-10-31T18:40:28Z) — lectures de l'extension rouvertes » ; le résumé de la veille des commandes du 31/10 (écrit à
  00:00:47) compte **1 passage Leboncoin, 2 requêtes, 0 coupure** (aucun refus), là où il n'y en avait aucun depuis la
  pause. Reprise prudente jusqu'au 01/11 01:40, puis la clé est rangée par le serveur. louis-seller : pause intacte.
  Selftest : refus après la levée → pause remise, essai 24 h plus tard (le témoin montre l'ancien défaut).
- Point 2 : selftest (grisé, réouverture, plateforme connectée, stock remis à zéro, heure de Paris) ; build et OTA. Pas vu
  dans l'app en production (pas de connexion à fillsell.app en automatisation).
- Point 3 (Rosa) : 4fb536fb, 2162d4f3, 4c44d14a, 5dfed533 closes par la règle au premier passage du worker (23:58:03) :
  « FillSell publie seulement sur eBay France : ton compte eBay « reginat8117 » est sur eBay États-Unis. Rien n'a été
  publié. », sans `ebay_a_finir` ni `error_technique` (archivés). Plus aucune tâche dans ce cas sur le parc.
- Point 4 (Doriane) : sur leboncoin.fr (navigateur de Nico, lecture seule), le service d'adresses rend **[]** pour
  « 2 rue arsene soulages 12110 Viviez » (précis et simple) et **« Viviez (12110) »** pour « Viviez 12110 » en mode
  simple — exactement ce que le contrôle avant retrait accepte. La règle appliquée à ses vraies données rend « commune »
  (`voie_des_reglages_retiree`). Tâche 2734ec09 relancée à 23:59 (script `scripts/reparations/20261031_doriane_relance_republication_lbc.sql`,
  sauvegarde `_backup_3110_doriane_relance_lbc`, inverse fourni) : pending, étape a_capturer, annonce toujours en ligne.

**Reste.**
- Doriane : sa republication est AUTOMATIQUE, donc tenue par son créneau (19:00-23:00, intouchable) — elle partira le
  01/11 à partir de 19:00. La preuve finale (annonce republiée) est à relire à ce moment-là.
- Doriane, 2e republication dans le même cas (3ec94b0b, 31/10 20:22) : relancée le 01/11 à 00:12 sur feu vert de Nico
  (script `scripts/reparations/20261031_doriane_relance_republication_lbc_2.sql`, sauvegarde `_backup_3110_doriane_relance_lbc_2`,
  inverse fourni) : pending, étape a_capturer ; part aussi dans son créneau du 01/11.
- Point 2 : la règle « aucune heure prévue devant la personne » (16/10) est levée pour cette seule phrase, à ta demande
  (marqueur `estimation-ok:`). L'heure est exacte pour eBay relié par l'API ; pour les autres, c'est l'heure de l'alarme
  quotidienne de l'extension (Chrome ouvert), au plus tôt 20 h après le dernier relevé.
- Rosa : les 14 publications closes plus tôt l'avaient été par l'ancienne garde (bon message) : rien à faire.

Suite complète : 508 selftests, 1 rouge à la première passe (`aucune-estimation`, la phrase du point 2) → marqué
exception, vert ; `lot-j-3110` 63/0, `urgence-louis-3010` 82/0. Lint : aucun problème neuf. Aucun mail, rien chez Stripe.

## Suite (01/11, 00:10 → 00:13)
- Push sur main refusé par le classifieur à 00:05 (« Out-of-Place Publication »), puis FAIT à 00:11:07 sur feu vert
  explicite de Nico : bcf3cb9..cc30b3a (6dcaaff, 92c2cbb, cc30b3a).
- fillsell.app sert `2026-10-31T23:11:24Z+cc30b3a` (lu à 00:11:48) ; entrée `assets/index-DjaFSDuX.js` 200 AVEC `Origin` ;
  `assets/App-DNOu7HHd.js` 200, contient « Tout est à jour, prochaine synchro automatique » et la relecture de
  `ebay_voie_api` au retour dans l'app.
- 3ec94b0b relancée (voir « Reste »).

## Point 2 bis (01/11, 00:15 → 00:35) — la carte de synchro, plus sobre (constat de Nico, 2.9.144, 00:08)
**Trouvé.** La ligne par plateforme faisait un pavé, et elle ne lisait que les synchros demandées (règle du 05/10) :
sur le compte de Nico, Vinted et eBay disaient « 29/10 » alors que le relevé quotidien de l'extension (Vinted, 30/10
20:05, `cron`) et celui du serveur par l'API (eBay, 31/10 10:10, `serveur:quotidien_api`) avaient réussi depuis.
**Changé** (`src/stock/BlocSynchro.jsx`, `src/stock/boutonSynchro.js`, `lireDerniersReussis`) :
- détail par plateforme replié, ouvert en touchant l'en-tête de la carte (chevron) ;
- une phrase : « La synchro et la surveillance des ventes sont automatiques. » (bouton grisé : « Tout est à jour… ») ;
- « Synchronisé il y a… », détail et grisage : le dernier relevé RÉUSSI, tous déclencheurs ; les pastilles et les points
  à régler ne changent pas.
**Preuves.** Sur les données du compte de Nico, le lecteur rend Vinted 30/10 20:05 (cron), eBay 31/10 10:10 (API),
Leboncoin 31/10 14:54, Beebs 31/10 15:50 (veilleur), Depop 31/10 10:59. Requête : 1 ms sur le compte le plus chargé
(index). Selftest `lot-j-3110` 76/0 ; suite complète 508 / 0 rouge ; lint sans problème neuf ; build. OTA **2.9.145**
(canal lu 2.9.144 → relu 2.9.145 à 00:33:15, dist `2026-10-31T23:32:49Z+04827ab`). Pas vu dans l'app : jamais de
connexion à fillsell.app en automatisation.
