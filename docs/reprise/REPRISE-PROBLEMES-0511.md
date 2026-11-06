# Reprise — terminal « Problèmes » (mise à jour du 06/11/2026, 17:40, heure de Paris)

Ce terminal est fermé. § 0 = ce qui reste OUVERT au 06/11 au soir (à reprendre en premier) ; §§ 1-4 = clôture du 05/11,
gardée pour l'historique. Récit du 06/11 : `docs/enquetes/lot-0611/RAPPORT.md` ; état de prod :
`docs/agents/etat-2026-10-01.md` (sections « 06/11 »).

## 0. Ouvert au 06/11 au soir (relu en base de 17:36 à 17:40)

Fonctions du lot, déployées l'après-midi et pas redéployées depuis : get-pending-jobs (15:30:35), update-job-status
(15:30:58), handler-watch (15:31:05), ebay-account (14:11:05), ebay-api-worker (12:31:38). Numéros : le RAPPORT et
l'état disent v341 / v180 / v177 / v30 / v112 (relus à 15:31) ; `functions list` de 17:40 affiche 343 / 182 / 179 / 32 /
114 pour les MÊMES déploiements (même heure, chemin d'entrée `_341`, `_180`…). Identifier un déploiement par son heure.

**1. Retraits des couples « vrais » : 27 faits, 20 en attente sur 47** (45 du lot + n° 20 + n° 22).
- Les 20 sont `pending`, voie extension, sans erreur : chacun part quand l'extension de son compte repasse. Rien à
  réarmer, rien à forcer. Avant tout geste neuf sur l'un d'eux : relire l'annonce EN VENTE (règle des couples).
- Par compte (dernier passage de l'extension) :
  - Srideals (7153db13), eBay ×9 : 820285486592, 820285488550, 820285490088, 820285507441, 820287270026,
    820287273237, 820287278635, 820293053095, 820293059700 — extension vue le 05/11 12:18.
  - Dylan Fontaine (379aa8a7) : Beebs ×4 (34284975, 34285121, 34297626, 34297633) et Leboncoin ×2 (3285616924 = n° 20,
    3286667636) — 05/11 23:09.
  - piochel cathy (7804bb4a), Beebs ×3 : 34092671, 34139502, 34139642 — 20/10 20:02.
  - Djibril Ziate (9e8c49a0), Beebs ×1 : 34005625 — 04/10 18:26 (extension absente depuis un mois : ce retrait peut ne
    jamais partir ; le doublon reste en vente tant qu'il ne revient pas).
  - Joe0410 (afeef3c7), Beebs ×1 : 33923195 = n° 22 (republication b3cb7da0 close à 15:13) — 04/11 22:50.
- Suivi : `public._backup_0611_couples_retraits` (colonne `retrait_cree`) joint à `cross_post_jobs`. Inverse (annule
  les retraits encore en attente) : `scripts/reparations/20261106_couples_vrais_retraits_INVERSE.sql`.
- Garde-fous de Nico, toujours valables : jamais les séries ni les articles en plusieurs exemplaires, jamais les 13
  indécidables, rien en dehors de la liste (`docs/enquetes/rattachements-0511/ACTIONS-62-VRAIS.md`).

**2. Louis (faf5021a, Leboncoin) : ventes 3297299585 et 3280443604, et ses 9 remises — À VÉRIFIER.**
- Un relevé « Mes annonces » est passé vers 17:27 (280 annonces vues) : les 9 annonces vendues y sont encore
  « active » → la règle A retient toujours les 7 remises de ce matin (1089e37e, 18af38a2, 6e6cd97d, 7ef7d84f, 9e3f4b0a,
  cc247496, fdda158a : `pending`, aucun numéro). C'est le comportement attendu.
- Les 2 ventes NE SONT PAS enregistrées : jobs edf17fe7 (3297299585) et b02dca17 (3280443604) toujours
  « published », `sale_signal` = sold, SANS `sale_evidence`. Le relevé de 17:27 n'a relu ni la capture ni la transaction
  (`capture_le` et `transaction_lue_le` restent à 10:19) ; or la lecture fraîche (migration 20261106110000) exige une
  lecture de la transaction de moins d'une heure, plus récente que la précédente. Leurs 2 remises n'existent donc pas
  encore.
- À vérifier, dans l'ordre : (a) à la prochaine lecture des transactions de Louis, les 2 ventes enregistrées (preuve =
  CE numéro) ; (b) leurs 2 remises créées et retenues comme les 7 ; (c) les 9 remises parties SEULES quand les anciennes
  annonces ont disparu du relevé, sans aucun refus « annonce identique ».
- Si aucune lecture de transaction ne passe d'ici le 07/11 au matin : chercher QUAND l'extension relit les transactions
  Leboncoin (le relevé de 17:27 ne l'a pas fait) avant tout script. Aucun mail à Louis.

**3. ayadi007 (cfdfda6f, eBay par l'extension) : 10 publications bloquées par eBay, 1 annulée.**
- 10 `needs_user` « eBay bloque la mise en vente : la configuration des paiements de ton compte… » (mur « paiements »,
  page `ebaypayonboardingweb`) ; 1 `cancelled` (chaise e4eaae70 : « Cet exemplaire a été vendu »). Aucune annonce eBay en
  ligne, rien créé chez eBay. Un mail lui a été envoyé à 13:42 pour terminer ses paiements.
- La reprise est automatique : handler-watch relance un éclaireur au barème (60, 180, 360, 720, 1440 min ; premier
  13:54, retenu non servi) ; dès qu'UNE publication passe, toutes repartent. À vérifier alors : chacune en ligne chez
  eBay, sans doublon. Refonte de fond NON déployée ; Leboncoin et Vinted non touchés chez lui (consigne de Nico).

**4. Jean-Luc LASSARAT, Vinted : « Hommes > Accessoires > Autres » sans équivalent dans le nouvel arbre.**
- Le chemin selon l'arbre du compte (`_shared/vinted-arbre-compte.js`) ne traduit jamais ce rayon (7 rayons sans
  équivalent) : sa tâche dca7193f (éponge auto) garde sa question de rayon. Elle repart par le
  circuit normal quand il choisit un rayon. Rien à faire de notre côté ; ne pas deviner un rayon pour lui.

**5. Retours eBay de la voie extension : choix enregistré, PAS inscrit sur le formulaire eBay.**
- La question « Retours eBay » (update-job-status) propose désormais 14 / 30 / 60 jours, et « Pas de retour » au seul
  vendeur particulier (type lu par GetUser si le compte a l'API, sinon par Browse sur une annonce eBay en ligne du
  compte ; illisible = pas de « Pas de retour »). Le choix est enregistré pour le compte, comme avant.
- Mais l'extension ne pose TOUJOURS PAS les retours sur le formulaire eBay : ce qu'eBay applique reste le réglage du
  compte chez eBay. Défaut ancien, non corrigé : à décider par Nico (geste de l'extension = nouvelle version CWS).
- Aucun essai réel : aucune question « retours » n'est partie depuis le déploiement (0 ligne à 17:40). La première
  prouvera la lecture du type (log update-job-status « question des retours eBay : vendeur … »).
- Pascal Caffray (b731ae0f) : ne pas relancer sa tâche, ne pas lui écrire — Nico lui répond.

## 1. Fait et en prod le 05/11 au soir

Depuis, réglés le 06/11 : § 2 « 1 c » (migration 20261106120000 appliquée 12:07) ; § 2 « 4 » (règle « annonce publiée
disparue » allumée, 2 fermetures justes à 11:33 et 12:33) ; § 3.5 Louis (remplacé par le § 0.2) ; § 3.7 champs requis
a / b / c (en ligne avec fdefb12). Le reste des §§ 2-3 n'a pas été relu le 06/11.

| Sujet | Ce qui tourne | Preuve |
|---|---|---|
| Séries Leboncoin (migration 20261105170000, « a bis ») | appliquée 20:26:22 | preuve 77/77 ; les 7 ventes en série de Louis (faf5021a) seront prouvées à son prochain relevé « Mes annonces » (cron ~02:30) → 7 remises en vente |
| Un mail à chaque vente (20261105180000, C') | appliquée 20:27:11 | 1er mail de vente normal 21:03 |
| Rafale = UN mail récapitulatif + trace des notes écartées (20261105220000) | push-ventes v17 (21:02:09), migration 21:02:27 | preuve 68/68 ; les 171 notes « rattrapage de masse » d'avant ne partent jamais |
| Rattachement (20261105190000) : photo identique = preuve, P16 gardée, « Annonce en double ? → Oui » refusé sauf republication prouvée | appliquée 20:59:57 ; rapprochement v30 (moteur : jamais d'automatique sur un titre en série ni sans mot commun) ; écran Doublons : le motif du refus | preuve 101/101 |
| Réétiquetage « manuel » → source d'avant / « auto: » | script passé 21:08:06 (1 619 annonces, 2 394 fusions) | sauvegarde `_backup_0511_reetiquetage_manuel_auto` + inverse |
| Champs requis (taille, pointure, rangement) | web au push (484818a) | pas une régression (défaut ancien, 4 morceaux) ; selftest champs-requis-partages 80 |
| Vendu quelque part = retiré partout (20261105240000, feu vert nommé de Nico 22:25) | appliquée 22:21:06 ; retraits armés par le circuit normal, annonces relues EN VENTE juste avant : Beebs 33145728 (Swatch, b025fb4b) et Beebs 34032772 (Doudou, 6dc8d70d) | preuve 72/72 ; scripts `20261105_regle_vendu_retire_partout_rattrapage[_2|_3]` + inverses |
| Mails de support | filtre Gmail « jamais en spam » ; 4 mails de Louis sortis du spam ; Worker « support-fillsell » SANS clé → fonction support-mail v2 (sujet et expéditeur archivés décodés) → `support_mails` ; règle support@ → Worker (~21:31) | mail de test du 05/11 22:02 : archivé (n° 1, transfert « ok » 22:02:47) et reçu dans la boîte de réception |
| Juge des dépôts Beebs sans numéro | ALLUMÉ (feu vert de Nico), handler-watch v166 (22:06:41), fenêtre 14 jours | 6 fermetures relues sur Beebs, toutes justes ; simulation : 49 fermetures sur 6 comptes au premier passage (minutes 42-44 UTC) |
| R1 (mur Beebs pendant un retrait) | gardé (update-job-status) | 1 retrait mis en attente de session au lieu de brûler ses essais |
| R3 (digest rouge/orange/blanc) | COUPÉ (ops-digest v52, 22:13:28) | sur 5 rouges relus : 3 vrais, 2 faux (annonce désactivée / introuvable) → liste brute d'avant |
| Extension 0.6.175 | zip `build/CWS-0.6.175-A-TELEVERSER/fillsell-extension-0.6.175-cws.zip` (BUILD_ID 2026-11-05T20:38:34Z+1354a1d) | contient toute la 0.6.174 (40413c5 ancêtre) ; anciens zips dans `build/CWS-PERIMES/` |

## 2. Points arrêtés (STOP) — ce qui manque pour les finir

**1 c — une ligne dans fiche_annonces_vivantes (20261105210000, préparée, non appliquée)**
- 4 des 5 appelants changent de comportement (retrait d'office au lieu d'une question, question perdue).
- Piste à préparer : n'exclure que les annonces Leboncoin sous transaction dont la vente est DÉJÀ enregistrée (reçu
  `annonce:leboncoin:<n°>`) ; preuve sur base jetable que les 5 appelants restent inchangés ; feu vert de Nico.

**4 — règle « annonce publiée disparue » (handler-watch, JUGER_ANNONCES_PUBLIEES_DISPARUES = false)**
- Corrigée (f69c949) : jamais une annonce jamais vue en ligne, jamais sans numéro ; simulation : 17, toutes vérifiées parties.
- Il manque : relire la simulation la veille de l'allumage (le parc bouge), allumer (true), déployer handler-watch,
  surveiller la première tranche.

## 3. Reste à faire (décisions ou gestes)

1. **Vendu quelque part = retiré partout** (cause prouvée : `docs/enquetes/rattachements-0511/VENDU-RETIRE-PARTOUT.md`) — FAIT
   (migration appliquée, 2 retraits armés). Restent :
   - Doudou Leboncoin 3274924341 (en vente) : la question « Déjà vendu ? » (`poser_questions_copies_non_prouvees(1790106697754007,
     NULL,'vinted','rattrapage:vendu_retire_partout')`) puis « Oui » sur l'annonce 37c21107 — le « Oui » n'arme rien hors session
     de la personne : passer par `armer_retrait_annonce_pour(<annonce>, …, true)` après relecture, comme pour Beebs 34032772.
   - Le lot 3267000921 (« Lot 2 doudous ») : même objet ou non ? (question à Nico, ne pas retirer d'office).
   - 3 vrais rouges de R3, relus EN VENTE le 05/11 à 22:27, retraits DÉJÀ armés et bloqués par la personne : Beebs 34042975
     (f3aec8cc, connexion Beebs à refaire), Leboncoin 3297644264 (3ec8e9b5, pause Leboncoin 403), Leboncoin 3287013710
     (dd5d7e85, session Leboncoin fermée). Rien à armer : ils partent dès la reconnexion / la levée de la pause.
   - T-shirt Friends (Beebs 34139613) : à relire. « Pinceaux » (Opla) : invérifiable, hors rouge.
   - Le « Oui » d'une question n'arme rien hors session de la personne (défaut vu ce soir) : à corriger si des rattrapages
     par script doivent repasser par la question.
2. **Les 105 « à vérifier »** : liste complète dans `docs/enquetes/rattachements-0511/SIMULATION-338.md` § « À vérifier ».
   Par motif : 43 dépôts ou republications FillSell à côté d'une annonce encore en ligne (risque de double vente,
   sebastien64310 surtout), 20 titres différents mais photos identiques, 17 titres reformulés, 13 même titre à prix
   différent, 12 autres. Simulation corrigée le 05/11 soir (une annonce n'est vivante que si le dernier relevé l'a vue) :
   79 « à vérifier » restent. Rien n'y a été touché.
3. **Juge Beebs sans numéro** : premier passage le 05/11 de 22:42:11 à 22:42:14 — 49 dépôts fermés « jamais mis en ligne »
   sur les 6 comptes de la simulation (afeef3c7, b0cb8def, de63ca45, eacbe32c, f66531a7, f8aa02a5), comme prévu. Le couper =
   `JUGER_BEEBS_SANS_NUMERO = false` + déployer handler-watch.
4. **R3** : à rallumer seulement si le juge relit l'annonce (ou exige un relevé récent) avant de dire « rouge ».
5. **Louis** : vérifier au matin du 06/11 que les 7 ventes en série sont prouvées et que les premières remises repartent.
6. **6 mails à support@ encore dans le spam Gmail** (avant le filtre) : un vrai client du 15/10 (« Erreur compte synchro
   eBay ») supprimé par Gmail vers le 14/11, un « STOP » du 24/10, 2 alertes FillSell « Paiement échoué » : à sortir ou non.
7. **Champs requis, à trancher** : (a) le rayon Beebs/eBay/LBC suit-il le public choisi sur Vinted plutôt que le genre de
   la rédaction ? (b) casquette « Medium-Large » → « taille unique » ? (c) une pointure posée par la rédaction sans source
   → traitée comme vide ? Essai réel sur fiches TEST (chaussures homme et femme) : scénario dans le commit 484818a.
8. **Extension 0.6.175** : après acceptation au Chrome Web Store, ajouter « 0.6.175 » à ALREADY_PUBLISHED et poser
   EXTENSION_MIN_BUILD = '2026-11-05T20:38:34Z'.
9. Sonde de session Leboncoin la nuit (1 requête/h) : la faire taire aussi ? (non touchée par la 0.6.175).

## 4. Fichiers non commités

Aucun de ce terminal : tout est commité et poussé (voir `git log`).
`serveur-cloud/outils/charge/garde-charge.sh` (non suivi, 06/11 17:40) est au terminal Cloud : ne pas y toucher.
