# Lot du 16/11/2026 midi — zéro plainte client (ordre de Nico)

Heure de Paris. Diagnostics des points 4, 5, 6, 7, 8 et 11 faits par cinq agents en lecture seule (rapports complets dans
`.tmp-terminal/p4` … `p8`, vidé en fin de bloc : les éléments utiles sont repris ici). Points 1, 2, 3, 9, 10 et tous les
correctifs faits ici.

## 1. Essai Cloud impossible sur iPhone (URGENT)

**1.a Cause (case cachée).** La case des conditions (z-index 1250) s'ouvrait DERRIÈRE le parcours d'entrée (9980) : le
correctif du 04/11 ne baissait le parcours que pendant l'achat du Cloud SEUL (`c.cloud.achat`), pas d'une formule
(`c.formules.achat`). rachidafarhi54 (16/11) : essai demandé à 09:02:10, case invisible, étape passée à 09:03:08, parcours
fini à 09:03:31, case acceptée à 09:03:34 sur le Tableau — l'achat est parti d'un écran démonté (même chose pour d4929a4e
le 15/11). **Correctif** : la case est au-dessus de tout (`Z_CONDITIONS` 10060) ; le parcours passe dessous pendant tout
achat et « Passer » disparaît ; l'achat relit `ecranVivant` avant la case, après la case et avant la feuille ; une nouvelle
demande de case rend la précédente « remplacee » (le Pro + Cloud de 09:18:17 pendait pour toujours, sans issue).

**1.b Cause de l'échec de l'achat Apple.**
- Les 5 tentatives de rachidafarhi54 (09:02 → 09:23) sont TOUTES sur le build 3c3f93c (OTA 2.9.199 du 15/11 15:12) :
  l'OTA 2.9.200 (ce6e27f) n'a été construite qu'à 09:23:46. Ce n'est pas une régression de la 2.9.200.
- Son essai était PERMIS par le serveur (`cloud_essai_demandes` : `essai_permis = true` à 09:18:05, appareil jamais vu) : la
  question « essai déjà utilisé » ne lui a donc PAS été montrée. Ses « annule » viennent de la feuille d'Apple elle-même
  (StoreKit `.userCancelled`, rendu « User cancelled » par le module) : 13 s, ~60 s et 3 s après l'acceptation. Le chemin
  des formules jetait le code, la durée de la feuille et l'étape : impossible d'en dire plus sur ces 5 essais.
- Ce que montre le parc : Pro + Cloud a abouti sur iPhone (cdf7007c le 13/11 avec la semaine gratuite, af37fa49 le 14/11) ;
  Premium + Cloud n'a JAMAIS abouti chez Apple (0 notification Apple pour `app.fillsell.premium.cloud`) — 2 personnes, toutes
  deux « annule » en 3 à 60 s (3c82995d le 14/11, rachidafarhi54 le 16/11).
- **App Store Connect non vérifié** : la session ASC du Chrome est fermée et je ne tape pas de mot de passe (règle fixe,
  même avec une autorisation). À vérifier dès que Nico ouvre la session : état de `app.fillsell.premium.cloud` et de son
  offre d'introduction (1 semaine gratuite, 175 pays).
- **Le message vu par Nico (test5, 11:31)** : `cloud_essai_demandes.raison = appareil_deja_vu` (l'iPhone avait servi à
  l'essai de son compte principal 5322fa18) ; la « décision 8 » faisait refuser la semaine Apple et l'app le disait en
  « Ton essai gratuit FillSell a déjà été utilisé… n'est pas encore activé ». **Décision de Nico appliquée** : la semaine
  gratuite de la boutique active le service tout de suite (serveur : `verdictEssaiStore`, `droitsAchatBoutique`,
  `validate-apple-receipt` ; app : plus de question, une phrase seulement là où l'argent part aujourd'hui). Google Play :
  même règle (même code). Stripe : pas de semaine de boutique — un essai refusé est payé tout de suite avec le service tout
  de suite (jamais une semaine sans service) ; la phrase dit la vraie raison, en une phrase.

**1.c Journalisation vraie.** `formule_cloud_issue` (et `cloud_achat_issue` pour le Cloud seul) : `raison` jamais nulle
(`conditions_refusees`, `conditions_remplacees`, `ecran_ferme`, `boutique_annulee`, `boutique_erreur`,
`essai_refuse_non_confirme`, `semaine_boutique_non_confirmee`…), `etape`, `code` et `message_boutique` de StoreKit / Google
Play, `duree_feuille_ms`, `produit`, `semaine_boutique` (oui / non / inconnu, telle que l'app l'a lue).

**Verrous** : `selftest:achat-formule-issue-vraie` (1 vert / 23 rouges sur 5f4744a → 30/0) ;
`selftest:semaine-boutique-service-actif` (1 / 21 → 22/0). Tests de l'ancienne règle mis à jour : `option-cloud`,
`formules-cloud-boutiques`, `formules-cloud-business-sans-essai`, `formules-ouverture-partout`, `textes-paiement-verite`,
`formules-essai-changement`, `cloud-executant`, `formules-canal-ferme`, `onboarding-trois-jauges`, `paiements-non-regression`
(lignes relues : `scripts/fixtures/paiements-lignes-semaine-1611.json`).

**Preuve attendue (essai démarré sur iPhone en sandbox, onboarding et Tableau)** : je ne peux pas la produire — pas
d'iPhone ni de Mac ici, et un achat de l'App Store se fait au doigt sur le téléphone. La trace dira désormais la vérité au
premier essai (raison, code StoreKit, durée de la feuille).


**1.d Complément de Nico — Android a le même symptôme (ahlamnajjari34, 8464ceb2, 16/11 12:34 et 12:37, OTA 2.9.201).**
- Son essai était PERMIS par le serveur (`cloud_essai_demandes.essai_permis = true` à 12:37:34) : la question « essai déjà
  utilisé » ne lui a PAS été montrée. Les deux « annule » (3 s après la case) viennent de la feuille de Google Play
  (code « user canceled » de Google), comme ceux de rachidafarhi54 viennent de la feuille d'Apple.
- **Cause probable côté Android (lue dans le module natif du binaire en vente, vc38)** : `getProducts` rend une ligne PAR
  OFFRE (l'app voit l'offre `premium-cloud-trial-7d` et annonce donc « 7 jours gratuits »), mais `purchaseProduct` prend la
  PREMIÈRE offre dont le forfait de base correspond (`NativePurchasesPlugin.java`, boucle sur `getSubscriptionOfferDetails`).
  L'offre d'essai et l'offre au plein prix partagent le même forfait : selon l'ordre rendu par Google, la feuille peut
  afficher 34,99 € tout de suite au lieu de la semaine gratuite — d'où une annulation en 3 s. Aucun essai Google n'a
  jamais abouti (0 depuis l'ouverture). Le correctif (choisir l'offre d'essai par son identifiant, `offerIdentifier`) est
  dans le module NATIF : **un binaire Android est indispensable** — décision de Nico (un module natif changé bloque aussi les
  OTA tant que le canal n'est pas « par binaire »).
- Côté iPhone, StoreKit applique seul l'offre d'introduction : pas ce défaut ; reste à lire App Store Connect (session).
- **Preuve demandée (essai démarré sur Android et iPhone, onboarding et Tableau)** : impossible pour moi — aucun téléphone ni
  émulateur avec un compte de test des boutiques, et je ne tape jamais de mot de passe. Depuis l'OTA 2.9.202 (12:40), chaque
  tentative écrit la raison, le code de la boutique, la durée de la feuille et la semaine lue : la prochaine dira laquelle
  des causes est la bonne.

## 2. Page de l'essai Cloud : donner envie de mettre sa carte

- **Cause** : la page Stripe d'un essai ne portait aucun texte de FillSell ni logo ; Google Pay était éteint ; `/cancel`
  rouvrait Premium SEUL à 12,99 € pour un essai Premium + Cloud (`metadata.plan_type` = « standard ») ; rien ne proposait
  de reprendre un essai abandonné ; l'ouverture de la page d'une formule n'était pas journalisée.
- **Fait** :
  - (a) sous le bouton de la page d'ESSAI (formules et Cloud seul) : « 0 € aujourd'hui. Rien n'est prélevé avant le JJ/MM.
    Tu arrêtes en un clic depuis l'app FillSell, quand tu veux. » (`custom_text.submit`, `_shared/texte-page-essai.js`,
    date = fin de l'essai, heure de Paris ; anglais pour un compte anglais) ; logo : l'icône FillSell posée sur le compte
    Stripe (Paramètres › Adaptation à votre marque, 16/11, par le navigateur, sur ordre de Nico — l'API 2023-10-16 de
    create-checkout-session ne garantit pas `branding_settings`, et le classifieur refuse toute session d'essai, même en
    bac à sable) ;
  - (b) la même phrase dans l'app, sur le dernier écran avant la page Stripe et la feuille d'Apple / Google (la case des
    conditions, quand l'essai est annoncé et sûr) ;
  - (c) Google Pay activé (Paramètres › Moyens de paiement, 16/11) ; relu par l'API : `google_pay` « on », disponible ;
  - (d) « Ton essai n'a pas démarré — Reprendre mon essai » au retour dans l'app (20 s à 24 h après la page Stripe ou la
    feuille de la boutique fermée, Cloud éteint, formule en vente ; un « × » ou un essai démarré l'efface ; vu / clic /
    fermé journalisés : `essai_reprise_vu`, `essai_reprise_clic`, `essai_reprise_ferme`) ;
  - (e) `/cancel` rouvre la formule demandée (`_shared/plan-de-session.js`, diagnostic de create-checkout-session) et
    refait la préparation si le serveur la redemande ;
  - (f) `checkout_open` écrit pour la page Stripe d'une formule (avant de quitter l'app).
- **Verrou** : `selftest:essai-page-stripe`.
- **Preuve demandée (capture de la page avec Google Pay)** : impossible pour moi — créer une page Stripe (même en bac à
  sable) est refusé par le classifieur. La première page réelle portera le texte et l'icône ; Google Pay n'apparaît que
  dans Chrome / un navigateur qui le propose, avec une carte enregistrée chez Google.

## 3. Mesurer la pub Meta

- **Constat (base, 13/11 20:10 → 16/11 midi)** : 63 inscrits — `app_ios` 18, `app_android` 10, direct 13, Google 12,
  ChatGPT 5… et **aucun `meta`**. La campagne active reste « FillSell - Installer l'app (continu) » (Trafic, 95 clics sur
  un lien en 30 jours, lu dans le Gestionnaire de publicités, rien modifié). Les inscrits venus par les stores ne sont
  attribuables à rien.
- **Ce qui existe déjà (13-14/11)** : la page `/installer` relit les UTM et les passe à Google Play dans `referrer` ; la
  lecture du referrer dans l'app Android est prête mais INACTIVE (module natif `InstallReferrer`, patch en attente
  `docs/enquetes/zero-friction-1411/en-attente/referrer-play-android.patch`) ; iPhone : le jeton fournisseur `pt` d'App
  Store Connect manque (`APP_STORE_PT = null`).
- **Limites qui ne se contournent pas** : l'App Store ne rend JAMAIS la campagne à l'app (`ct` n'est lu que dans App Store
  Connect, agrégé, seuil de 5) — aucun enregistrement par personne possible sur iPhone sans traceur tiers ; Android : la
  campagne par personne exige un nouveau binaire (le module natif).
- **Liens exacts à mettre dans la pub** (ne rien changer d'autre) :
  - le lien unique actuel, qui sert les deux stores et le web :
    `https://fillsell.app/installer?utm_source=meta&utm_medium=paid&utm_campaign=installer-continu&utm_content=V1-podcast`
    (`V2-maman`, `V3-revendeur`, `V4-cloud` pour les autres pubs) ;
  - si Nico veut des liens DIRECTS : Play Store
    `https://play.google.com/store/apps/details?id=app.fillsell.app&referrer=utm_source%3Dmeta%26utm_medium%3Dpaid%26utm_campaign%3Dinstaller-continu%26utm_content%3DV1-podcast`
    (Play Console › Statistiques › Acquisition, par campagne) ; App Store
    `https://apps.apple.com/app/apple-store/id6762152785?pt=<PT>&ct=meta&mt=8` — `<PT>` à lire dans App Store Connect
    (session fermée : à faire quand Nico l'ouvre ; je le pose alors aussi dans `site/gabarits/installer.mjs`).
- **Ce qui reste (décisions de Nico)** : le binaire Android avec le module `InstallReferrer` (indispensable pour la
  campagne par inscrit Android) ; la migration `20261114100000` (plateforme d'origine) ; le `pt` d'App Store Connect.

## 4. ayadi007 — remplacer un compte Leboncoin bloqué

- **Cause** : FillSell connaît le compte Leboncoin de chaque relevé et de chaque annonce (`compte_plateforme`, extension
  0.6.182) mais ne garde aucun « compte suivi » ; les traces `releve_autre_compte` / `releve_compte_change` ne sont lues par
  personne ; aucun geste « changer de compte » (eBay en a un). Trois endroits mélangeaient encore deux comptes.
- **État d'ayadi007 (diagnostic)** : deux postes, deux comptes. Ancien compte `bf460991…` : 108 annonces « en ligne » chez
  nous, 91 fiches au stock dessus ; son PC Windows est sur la page de connexion Leboncoin depuis 10:28. Nouveau compte
  `23b59b14…` : relevé par le Mac (65 annonces à 11:06) ; 38 dépôts FillSell des 11-12/11 figés depuis le 13/11. Le 16/11
  à 10:42, **19 republications de l'ancien compte closes à tort** « n'est plus en ligne » sur deux relevés du nouveau.
  Risque de double vente : 3 objets vendus avaient encore une annonce active sur l'ancien compte au 15/11.
- **Corrigé (règle, tous les comptes, sans migration)** :
  - une republication n'est plus jamais close ni dite « sans objet » sur le relevé d'un AUTRE compte de la plateforme :
    retenue, avec le vrai message (`republication-cible.js`, motif `autre_compte`) ; les annonces d'un autre compte sur la
    fiche ne passent jamais pour sa remise en ligne ;
  - la garde « mêmes photos » ne compte que les jumelles du compte qui dépose (point 8).
  - Verrou `selftest:compte-plateforme-melange`.
- **Non fait — demande ton feu vert (migration)** : le chemin « remplacer mon compte Leboncoin » (table des comptes suivis,
  `remplacer_compte_plateforme` avec simulation, ligne « À régler » + écran, proposé automatiquement au changement de compte,
  Vinted/Beebs/Depop ensuite) — décisions D1 à D10 dans la liste des décisions. La bascule d'ayadi007 se fait par ce chemin
  (lui-même, ou un script de réparation).
- **Preuve demandée (relevé réussi du nouveau compte, annonces visibles)** : en base à 12:52, le nouveau compte `23b59b14…`
  a **68 annonces en ligne, toutes rattachées à une fiche**, revues à 12:51 (relevé réussi) ; l'ancien `bf460991…` garde
  107 annonces « en ligne » non revues depuis le 15/11 19:32 (95 rattachées) — c'est ce que le chemin « remplacer mon
  compte » clôturera proprement. Les 19 republications de l'ancien compte closes à 10:42 ne sont PAS rouvertes : elles
  viseraient un compte bloqué par Leboncoin.

## 5. contact.grizstyle — 88 tâches en attente sans aucun message

- **Cause** : sa file est **en pause à sa demande depuis le 05/11 22:25** (`platform_settings.file_pause`). get-pending-jobs
  retenait ses 88 tâches mais n'écrivait « En pause à ta demande » que sur une republication dont le texte était exactement
  « En file : … » : ses tâches (texte vide) et toutes les publications ne recevaient rien. Parc : 4 comptes en pause, 158
  tâches retenues, 120 sans aucun texte.
- **b)** Les 24 publications Leboncoin neuves et la publication Vinted n'attendaient PAS un créneau de republication : la
  pause seule. Aucune règle de cadence ne retient une publication neuve ; à la reprise, elles partent tout de suite (une
  à la fois pour Leboncoin), les 63 republications dans son créneau.
- **Fait** : (a) toute tâche retenue par la pause — publication comprise — porte le texte de la pause si elle ne dit rien
  ou seulement une attente (`_shared/pause-dite.js`), effacé à la reprise ; l'écran de suivi d'une publication dit « En
  pause à ta demande » (il disait « En file ») ; (c) Réglages › Republication : « Ton ordinateur est éteint pendant ton
  créneau » quand 3 des 5 derniers créneaux sont passés Chrome fermé, avec les heures où l'ordinateur est allumé d'habitude
  (relevés des 14 derniers jours) et « Changer mon créneau » — la cadence n'est jamais touchée.
- **Verrous** : `selftest:file-pause-dite`, `selftest:creneau-hors-presence` ; `lot-f-3110` mis à la nouvelle règle.
- **Reste** : rien à réparer chez lui (sa file reprendra quand il appuiera sur « Reprendre », ce que ses tâches disent
  maintenant) ; le prévenir par mail = ta décision.

## 6. joshua.sapone — boucle Beebs sans fin

- **Cause de la lenteur** : son ordinateur (MacBook Pro 2017, extension 0.6.186) : contrôle d'avant retrait Beebs médian
  173 s contre 31 s sur le parc (900 contrôles, max 84 s ailleurs) ; les deux vestes sont les plus longues (marque, matière,
  couleur hors des listes Beebs : 2-3 recherches de plus) — corrélation, pas preuve (l'extension n'envoie pas la durée par
  étape). L'extension promettait que « le serveur élargit la borne » : il ne le faisait jamais.
- **Cause de la boucle** : au-delà de la borne (300 s sans port), l'extension avale l'expiration et rend `pending` sans
  erreur (« illisible ») : aucun compteur, aucune fin. Même chemin pour sa table toscane (≈ 40 contrôles par jour).
- **Fait (serveur, tous les comptes)** : premier « trop lent » → reprise dans 30 min avec une borne de 20 min
  (`fill_borne_ms`) ; port de remplissage allumé après un contrôle trop lent (14 j) ; contrôle NON CONCLUANT classé
  (`_shared/prevol-non-concluant.js`) : 30, 60, 120 min puis la personne (« relancer »), message vrai (rien retiré, annonce
  en ligne), jamais « Leboncoin n'a pas affiché les photos ». Réparation : `scripts/reparations/20261116_joshua_prevol_borne_relance.sql`
  (+ INVERSE ; les deux vestes relancées avec la borne de 20 min).
- **Table toscane** : ce n'est pas une table — la pizzeria « La Table Toscane » à 90 000 €, rubrique Immobilier › Bureaux &
  Commerces, choisie par la personne sur Leboncoin (importée par le relevé). FillSell n'a jamais déposé d'annonce Immobilier
  (2 tâches dans toute l'histoire) ; le formulaire Immobilier demande des critères avant les photos. Désormais la boucle
  s'arrête au 4ᵉ contrôle avec un message vrai. Elle attend aujourd'hui (« n'est plus dans ta liste au dernier relevé »).
- **Verrou** : `selftest:prevol-boucle-bornee`. Extension (une ligne) : rendre l'expiration Beebs en « trop lent » et
  envoyer la durée par étape demanderait une 0.6.192 — pas indispensable, le serveur arrête la boucle.

## 7. Historique des ventes Beebs (noubliejamais) — NON FAIT, demande ton feu vert

- **Cause** : aucune vente Beebs n'entre par une lecture : la seule chaîne Beebs (`commandes_beebs_noter`) est une PREUVE
  pour une tâche publiée, en mode fantôme (`coin_config.ventes_beebs_commandes = 0` depuis le 18/10), et `sans_job` = la
  commande ne correspond à aucune tâche FillSell (les 6 produits de noubliejamais : rallumer l'interrupteur n'importerait
  rien). « 5 commandes » = une coupe du LECTEUR (`COMMANDES_DETAILS_MAX = 5`, messagerie.js:89), pas de Beebs : la page lue
  porte toutes les commandes (18 vues chez un autre compte). Le 403 = DataDome dans l'onglet de la personne sur la forme
  0.6.186 (lecture en flux RSC), corrigée en 0.6.187 mais jamais servie (0.6.191 pas encore sur le Web Store).
- **Ce qu'il faut** : une extension 0.6.192 (lecture de tout l'historique, sans requête de plus, 403 sans boucle) — le
  serveur ne peut pas lire Beebs (DataDome) ; une migration (RPC dédiée `ventes_beebs_historique_noter`, interrupteur neuf
  en fantôme, commandes terminées de plus de 48 h, jamais de push, mail, retrait ni tâche) ; un banc jetable ; puis la
  sortie du fantôme sur preuve. Risques : pagination de Beebs inconnue, unité de `amount` jamais vue.

## 8. Refus de modération Leboncoin = notre faute

- **gjehly** : Topps Anna #9 et Cruella #90 déposées 6 fois À L'IDENTIQUE (premier refus inexpliqué chez nous : 56 cartes
  sœurs identiques sont en ligne ; le motif est dans le mail de Leboncoin). Après la règle du 13/11, chaque copie est
  encore partie une fois (14/11 06:46 et 06:56) : le juge ne comparait que la copie d'avant le service. Crash Bandicoot 2 :
  doublon exact d'une annonce en ligne du MÊME compte (même photo, empreintes identiques).
- **ayadi007** : les 4 refus du 13/11 = à chaque fois la 2ᵉ annonce identique (photos, texte, prix) sur le MÊME compte.
  Rien de mal posé dans la catégorie ni les champs. Mesure sur tout le parc (25/10 → 16/11) : 10 acceptées, toutes à
  jumelle sur un AUTRE compte ; 6 refusées, toutes à jumelle sur le MÊME compte.
- **Corrigé** : R1 — le juge compare aussi ce qui PARTIRAIT (la copie d'un refus est retenue dès son premier service) ;
  R2 — compte du dépôt connu : UNE jumelle en ligne sur ce compte retient (seuil 1, ta décision du 13/11 au mot), une
  jumelle sur un autre compte ne compte pas ; compte inconnu (aucun relevé, ou deux comptes relevés en 24 h) : la règle
  d'avant (2). Verrou `selftest:lbc-doublon-meme-compte`.
- **À relancer** : rien à l'identique. Anna et Cruella : seulement après une modification (le bouton le dit) ; Crash : non
  tant que 3308086796 est en ligne ; ayadi : 4 fiches sur 6 déjà en ligne, les 2 autres retenues tant qu'une jumelle est
  en ligne sur le compte.

## 9. Photos par plateforme dans la publication de plusieurs articles

- **Cause** : la fiche d'un article du lot ne montrait que les photos communes. **Fait** : dans la section de CHAQUE
  plateforme, le même composant que la publication à l'unité (`PhotosPlateforme`), écrit par le moteur (`poserPhotosCopie`
  → `edited[p].photos`) et lu par `construireJobs`, commun au lot et à l'unité. Verrou
  `selftest:photos-plateforme-lot-publication`.

## 10. « verre » ne proposait jamais « Verrerie »

- **Cause** : le ratissage des candidates (`candidatsParMot`) ne comparait que des jetons identiques ; « verrerie » n'est
  pas « verre ». **Fait** : au ratissage SEULEMENT, un jeton suivi d'un suffixe de collection ou de métier (-erie, -rie,
  -terie) est de la même famille (verre/verrerie, bijou/bijouterie, linge/lingerie) ; jamais un début de mot
  (table/tablette) ni un mot de moins de 4 lettres. Sur le vrai arbre eBay, « verre » fait entrer 20696. Verrou
  `selftest:ratissage-famille-mots`.

## 11. Caisse à vin (ornellaracano) — rien à corriger

- **Tranché : c'est le même objet.** Mêmes photos (couvercle : pHash identique ; intérieur : dHash et pHash identiques),
  même prix (5 €), le texte Vinted parle de l'« inscription décorative » (le marquage Lagrange). Le 23/09 n'était pas un
  rattachement mais un import ; la fusion date du 30/09 13:33 (`photo_go_nico_3009`, ta correction n° 3 du 30/09) sur
  photo identique — jamais sur le titre. La règle n'est pas fautive (1 037 fusions par la même marque, aucune défaite).

## Ce qui demande une décision de Nico

1. **App Store Connect** (point 1) : ouvrir la session dans ton Chrome (je ne tape jamais de mot de passe) → je lis l'état
   de `app.fillsell.premium.cloud` et de son offre d'essai, et le jeton `pt` pour les liens de campagne (point 3).
2. **Point 4 — « remplacer mon compte Leboncoin »** : feu vert sur le principe et la migration (un compte suivi par
   plateforme ; l'ancien clos « pas une vente », plus surveillé ; amorce : un seul compte vu = suivi, plusieurs = la
   question ; pendant la question, l'autre compte n'est pas importé ; tâches envoyées au poste du compte suivi ; les 38
   annonces figées du nouveau compte ; ayadi clique lui-même ou script ; Beebs / Depop ensuite (extension) ; réarmer un
   retrait quand l'annonce d'une fiche vendue revient en ligne ; prévenir ayadi pour ses 3 annonces vendues encore en
   ligne — aucun mail sans ton ordre). Détail : `annexe-p4.md`.
3. **Point 7 — historique des ventes Beebs** : feu vert pour une extension 0.6.192 (elle remplacerait la 0.6.191 à
   téléverser) et pour la migration (RPC dédiée + interrupteur en fantôme) ; historique muet (aucun mail ni notification,
   même pour une vente récente sans tâche) ; une fiche « en stock » dont le numéro porte une vieille commande : vente sans
   fiche, ou question ? Détail : `annexe-p7.md`.
4. **Point 3 — Android** : un binaire avec le module `InstallReferrer` (seule façon de savoir, par inscrit, qu'il vient de
   la pub) ; la migration `20261114100000` (plateforme d'origine).
5. **Point 6** : Leboncoin Immobilier — dire tout de suite « FillSell ne sait pas encore » (recommandé) ou relever le
   formulaire sur ton compte (annonce de test ≥ 999 €) puis une extension ; servir « Autre » d'avance pour une marque ou une
   matière hors liste Beebs (gain ~40-60 s par valeur sur un poste lent, change le contenu envoyé).
6. **Point 8** : retenir aussi « même titre + même texte + même prix » qu'une annonce en ligne du même compte (jamais sur le
   titre seul) ; lever la retenue « relance à l'identique » quand le refus venait d'une jumelle aujourd'hui disparue ;
   demander à gjehly le motif du mail de Leboncoin (aucun mail sans ton ordre) ; Crash Bandicoot : même objet ou 2ᵉ
   exemplaire ?
7. **Point 5** : prévenir contact.grizstyle (et 3 autres comptes en pause avec des tâches) que leur file est en pause
   (mail = ton ordre, `envoyer_mail_ponctuel`, simulation d'abord).
8. **Point 2** : la page de paiement n'a pu être ni créée ni capturée par moi (création de session Stripe refusée par le
   classifieur, même en bac à sable) — la première page réelle dira si l'icône et le texte s'affichent comme prévu.
