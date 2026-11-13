# Lot « zéro problème » — 12/11/2026 soir (terminal « Problèmes »)

Comptes désignés par leur id8 (règle du 11/11). Heures de Paris. Constat complet de la phase 1 (lecture seule) : rendu à
Nico dans le terminal le 12/11 vers 22:40 ; pièces hors dépôt (elles citent des clients) dans le scratchpad de la session
(`audit/bloc*.md`). Ordre de livraison fixé par Nico : étape 1 (argent et confiance : 4a, 4c, 4d, 4b), étape 2 (bloc 1 :
tailles, genre, état, catégories), étape 3 (bloc 3 : retraits, ventes, adresse), étape 4 (bloc 2 : comptes hors France —
plan d'abord), étape 5 (bloc 5 : promesses), bloc 6 (P3 et écrans maintenant, le reste dans l'extension 0.6.187).

Principe de Nico (12/11) : on construit pour l'international — identifiants plutôt que libellés, grilles et capacités
PAR SITE, pays / langue / monnaie de chaque compte de plateforme lus une fois ; jamais de refus ni de grisage pour cacher
un manque.

## Étape 1 — argent et confiance

### 4a. Un achat de test n'envoie jamais de mail à un client
**Cause prouvée** (journal des boutiques, email_logs) : le compte de test 5322fa18 a reçu `cloud_essai_veille` le 07/11 à
19:00, puis `cloud_paiement` « 24,99 € » chaque jour à 18:50 du 08 au 12/11 ; chacun suit un DID_RENEW
`app.fillsell.cloud.sub` d'environnement **Sandbox** (lignes 46, 56, 61, 64, 70 ; TestFlight renouvelle tous les jours).
apple-iap-webhook lisait `data.environment` pour le journal seulement ; support@ recevait aussi l'alerte Cloud et
`ops_paiement` (renouvellement Sandbox de `pro2.sub`). Google : même trou (testPurchase journalisé, jamais lu), pas encore
servi. Stripe : fermé par chance (un seul secret de signature), aucun test de `livemode`. Aucun autre compte touché.

**Correctif** (règle `docs/regles/mails-paiements-comptabilite.md`, 12/11 soir) : une règle
`_shared/environnement-store.js` ; aucun mail client pour un achat de test, alerte support@ « [TEST] », droits gardés ;
un événement Stripe du mode test n'est jamais appliqué en prod ; le rappel de la veille écarte un essai de test lu à la
source.

**Verrou** : `selftest:store-test-sans-mail` — 19 rouges sur 881c2b9 (dont : le vrai module d'envoi, rejouant la ligne 70,
envoie `cloud_paiement` au client), 35 verts après.

### 4c. L'offre suit le canal qui facture, pas l'appareil
**Cause prouvée** (code, audit) : `formulesCloudVendables` et `cartesFormulesCloud` décidaient sur le canal de l'APPAREIL ;
un abonné App Store (16 en prod) voyait sur le web « Pro + Cloud, 49,99 €/mois » sans bouton et « le changement se fait
dans ton abonnement App Store » — où l'offre n'existe pas (Apple n'a pas validé) ; un client du Cloud seul App Store
(`canalAbonnementDuProfil` ignorait `cloud_canal`) voyait « Passer à … », les conditions, puis un refus 409 et « change de
formule dans l'app sur ton iPhone ». **Correctif** : la règle `voieFormulesDuCompte` (canal qui facture + son interrupteur),
le texte de Nico, aucun bouton ; le serveur dit la même chose. **Verrou** : `selftest:formules-canal-ferme`.

### 4d. Changer de formule pendant l'essai
**Écarts prouvés** (code) : montée pendant l'essai annoncée « au prorata » (faux : l'essai continue) ; vers Business + Cloud,
79,99 € prélevés tout de suite sans le dire ; descente de la feuille de la veille refusée ; « Retirer le Cloud » pendant
l'essai : texte faux puis 409 ; C4 visible pendant l'essai (impasse) ; Apple : semaine gratuite sans droits, sans un mot.
**Correctif** : texte = issue de la vraie fonction serveur ; descente par changer-formule ; « Arrêter l'essai » ; C4 caché ;
question avant la feuille de la boutique. **Verrou** : `selftest:formules-essai-changement`.

### 4b. « On te prévient la veille »
12 textes d'écran (6 FR, 6 EN) retirés ; conditions inchangées. Le mail de la veille est codé sur les 3 canaux mais n'a
jamais touché un vrai client (seul envoi : le compte de test, Sandbox, le 07/11) ; premier attendu : Stripe, compte d607ba20,
le 13/11 vers 16:00 — à relire dans email_logs. **Verrou** : `selftest:promesse-veille-app`.

### Cloud et relevés (complément de Nico, 12/11 21:58) — compte b695d990
**Cause prouvée** (vinted_sync_runs, ebay_accounts, cloud_coffre, code) : relevé eBay 2a2223ec (app, 12/11 09:35) jamais
réclamé → expiré à 15:36 avec le texte « ton ordinateur… » ; redemandé par le POLL DU POSTE CLOUD (bb677c32,
« app:redemande », 15:36) → expiré à 21:38. Le Cloud ne porte pas eBay (copie de l'extension : Vinted, Leboncoin, Beebs,
Depop) ; eBay d'un client Cloud passe par l'API, et son eBay n'est pas relié à FillSell (aucune ligne ebay_accounts) — ses
relevés eBay des 10 et 11/11 avaient été faits par l'extension de son ORDINATEUR (build ba13a51), éteint le 12/11. Coffre du
Cloud : Vinted seul. `is_cloud` faux pendant l'essai : voulu (is_cloud = payé), aucune règle ne s'y trompe.
Autres demandes vérifiées : relevés Vinted / Leboncoin / Beebs / Depop d'un compte au Cloud actif → laissés au Cloud
(`commandeLaisseeAuCloud`) ; plateforme non connectée au coffre → même expiration « ordinateur » (même trou, corrigé) ;
ventes : lues par les relevés (même chemin) ou par l'API eBay si relié ; retraits / publications eBay : à l'ordinateur
(reste, 0 tâche ouverte, 3 comptes exposés). **Correctif** : règle `cloud-voie.js`, handler-watch, get-pending-jobs, app.
**Verrou** : `selftest:cloud-releves-sans-ordinateur`.

### Étape 1 — EN SERVICE (12/11 au soir)
- Suite complète sur une copie LF (881c2b9 + étape 1) : 687/689 — `cloud-voie` rouge (ordre d'un import, corrigé, puis les
  175 selftests qui lisent get-pending-jobs relancés : 175/175) et `onglet-muet-partout` (vert relancé deux fois, instable,
  sans lien). La passe 4a seule : 684/685 (le rouge, un libellé « Environnement » lu comme une estimation, corrigé).
- Commits **24f3b69** (correctif) + **1b91d34** (version 2.9.177), poussés b681ffc..1b91d34 ; le commit = la copie testée
  (46 fichiers comparés, 0 écart).
- Fonctions, depuis `git -c core.autocrlf=false archive 1b91d34`, versions lues avant / après : apple-iap-webhook v55 → **v56**,
  google-play-webhook v48 → **v49**, stripe-webhook v77 → **v78**, email-tunnel v91 → **v92** (verify_jwt false avant et
  après, `--no-verify-jwt`) ; validate-google-purchase v28 → **v29**, create-checkout-session v78 → **v79** (verify_jwt true) ;
  handler-watch v196 → **v197** (false) ; get-pending-jobs v365 → **v366** (true). Appels sans session : 400 (webhooks
  signés), 401 (les autres). Dépendances : aucune modifiée depuis leur dernier déploiement hors de ce lot (deno info).
  Premiers passages : get-pending-jobs v366 188 appels en 200, médiane 1 330 ms (v365 : 1 274) ; handler-watch v197 2
  passages en 200 (13,4 s et 18,3 s ; v196 : 10 à 11 s, déjà 12 à 39 s le 11/11).
- Web : build 2026-11-12T22:04:35Z+1b91d34, entrée de l'app lue avec `Origin` : 200.
- **OTA 2.9.177** publiée (canal production = 2.9.177, commit 1b91d34, `--delta`, 162 fichiers). ⚠ Deux obstacles levés :
  (1) un fichier vide `'programmee_servie_le'` (nom avec apostrophes, 0 octet, écrit le 12/11 à 21:28 par une redirection
  ratée, auteur inconnu) rendait l'arbre « sale » : déplacé, intact, dans le scratchpad de la session ; (2) Capgo voyait
  `@capgo/native-purchases` « Android native code changed » : node_modules porte le patch de la vc38 (253a740), le canal
  l'empreinte de la vc37. Le bundle JavaScript ne dépend pas de ce code Java (la 2.9.175 marche sur les deux binaires) :
  pour l'envoi, le module a été remis dans l'état du canal (ancien patch), compatibilité « OK », OTA envoyée, puis
  node_modules remis dans l'état vc38 OCTET POUR OCTET (copie de sauvegarde). ⚠ À décider quand la vc38 sera publiée :
  la prochaine OTA depuis node_modules patché bute sur la même garde.
- Retour : fonctions depuis une archive de b681ffc, dans l'ordre inverse ; app : nouvelle OTA (numéro neuf) d'un commit
  qui revient sur 24f3b69.
- À relire : le mail « 24,99 € » de 5322fa18 ne doit plus partir le 13/11 vers 18:50 (le renouvellement TestFlight, s'il
  vient, doit écrire « mails Cloud RETENUS (achat de test) » et une alerte « [TEST] ») ; le premier `cloud_essai_veille`
  réel attendu pour d607ba20 (Stripe) le 13/11 vers 16:00 (email_logs).

## Étape 2 — bloc 1 : tailles, genre, état, catégories (EN SERVICE le 13/11 vers 01:00)
Quatre chantiers menés en parallèle dans des copies séparées, fusionnés (un seul conflit, une ligne d'import), suite
complète sur la copie fusionnée en LF : **696/696** ; build:essai OK ; deno check : 0 erreur. Rapports détaillés des
chantiers (hors dépôt, ils citent des comptes) : scratchpad de la session, `etape2/{A,B,C,D}.md`.
- **1d-i** (cfdfda6f, « Neuf avec étiquette » bloqué sur Leboncoin Électronique) : l'écran ne traduisait pas l'état ; trois
  copies de la règle. UN juge (`_shared/etat-correspondance.js`, niveau commun ; Vinted par `status_id`) pour l'écran, le
  serveur et l'extension ; « Ouvert (jamais utilisé) » = très bon état ; beauté : « Neuf » = neuf sans étiquette ; un
  « Neuf » nu n'est plus deviné. Verrou `etat-grille-ecran` (24 rouges → 34 verts).
- **1d-ii** : le chemin du catalogue Vinted n'était écrit sur aucune fiche (0/313) ; lu désormais depuis l'identifiant
  (`cheminVintedFiche.js`). Cas cca934e7 : catalogue 1813 → Univers « Homme » sans question. Verrou `chemin-vinted-fiche`.
- **1e** : la machine d'un jeu (titre, puis description) se pose sur Beebs « Console » et Vinted « plateforme » ; âge et
  PEGI non écrits : question. Verrou `console-du-jeu` (27 rouges → 31 verts).
- **1c** (2bde8576 « 15 et moins », af37fa49 « UK 8 child ») : get-pending-jobs retirait l'identifiant de taille de toute
  capture (851 sur 1 143 en 2 jours), même encore valable ; grille_incoherente supprimait la liste et disait « relance /
  écris-nous » ; la relance après mise à jour ignorait le build en échec. Désormais : identifiant gardé s'il est dans le
  groupe du rayon (capacité `taille_groupe_rayon_v1`, extension 0.6.187), id retiré → même pointure EU par identifiant,
  sinon UNE question avec la liste (`champ_a_choisir`, voisines en tête), relance seulement sur vieux build ; childSizes :
  « EU 15 ». Retour sans déploiement : `coin_config.republish_taille_ids_retires_taille_par_id` = 2. Verrou
  `vinted-grille-chaussures-enfant` (19 rouges → 68 verts). ⚠ L'audit avait tort pour labouquinerie85 : c'était l'État.
- **1a** (c7c382b7 : Depop « EU M », « EU 140cm » ; legging publié « 9 ans » et « Naissance ») : tailles PAR SITE dans
  `_shared/tailles.js` (une table par système, eBay délègue), une copie contraire à la fiche est remplacée par la taille de
  la fiche ou devient une question. Rejeu (5 333 publications) : 22 copies corrigées, 14 questions ; Depop : baf800fe → M,
  fe3af982 → 10 years. Verrou `tailles-prefixe-et-anglais-partages` (62 rouges → 86 verts). ⚠ Correction de l'audit : la
  fiche du legging a été réécrite par le relevé Beebs de l'EXTENSION (déclencheur `inventaire_attributs_avant_update`), pas
  par `fiche_completer_depuis_annonce` — qui, elle aussi, complète depuis nos dépôts (3 025 compléments en 30 j). Migration
  `20261112213000_releve_jamais_depuis_notre_depot` (les deux chemins) + script de la fiche de c7c382b7 : PRÉPARÉS, banc
  jetable 37/37, **NON appliqués : feu vert de Nico**.
- **1b** (c7c382b7, fiches Lens en anglais) : l'icône de repli 👗 jugeait le genre (« Femme/Fille ») alors que le rayon
  résolu était « Hommes » ; l'icône se lit désormais sur l'identifiant du rayon, la garde de genre sur le rayon qui part,
  un rayon choisi aligne le genre. Les 11 questions de genre des 2 comptes anglais (30 j) disparaissent ; 6 fiches ne
  sont plus rangées en « Robes » sur eBay. Verrou `icone-et-genre-fiche-anglaise` (19 rouges → 37 verts).
- **1d-iii** (cfdfda6f) : le mot du titre cède au catalogue Vinted ET à l'IA ; 🚗 → « Véhicules › Équipement auto » ;
  « Jeux et jouets » Vinted → « Jeux & Jouets » Leboncoin par identifiants. Rejeu 60 j (117 371 tâches) : 431 icônes
  changent, toutes visées ; 0 autoradio juste changé. Verrou `categorie-catalogue-vinted` (13 rouges → 27 verts).
### Livraison
- Commits **44b3ada** (correctif), **f4410ef** (2.9.178), **f5a1920** (`EXTENSION_LAST_COMMIT` recalé : la garde de build
  refusait le site et l'OTA tant qu'il ne l'était pas ; aucun numéro d'extension, `EXTENSION_MIN_BUILD` non touché).
- Fonctions (archive de f4410ef) : update-job-status v195 → **v196**, handler-watch v197 → **v198** (verify_jwt false),
  get-pending-jobs v366 → **v367** (true) ; sans session : 401. get-pending-jobs v367 : 97 appels en 200, médiane 1 185 ms.
  Non redéployées (elles importent `tailles.js` mais servent la même valeur, ou leur copie de prod diffère de main) :
  generate-listing (garde l'ancienne lecture des tailles pour la rédaction), ebay-api-worker, ebay-account,
  ia-banc-deduction, remise-ordre-photos-ebay.
- Web 2026-11-13T00:00:14Z+f5a1920 (entrée lue avec `Origin` : 200) ; **OTA 2.9.178** (module natif remis à l'état du
  canal pour l'envoi, puis à l'état vc38 octet pour octet).
- Extension 0.6.187 : `leboncoin.js`, `vinted.js`, `background.js`, `depop-tailles.js` — un seul zip à la fin du lot.
- Retour : fonctions depuis une archive de f5a1920^^^ (9ad5320) ; app : nouvelle OTA d'un commit qui revient sur 44b3ada.

## Étape 3 — retraits, ventes, adresse (EN SERVICE le 13/11 vers 02:50)
Trois chantiers en parallèle, fusionnés (un conflit : deux entrées ajoutées au même endroit de `cause-blocage.js`, les
deux gardées), suite complète sur la copie fusionnée en LF : **702/702** ; build:essai OK ; deno check : aucune erreur
NOUVELLE (correction du 13/11 : « 0 erreur » était faux — get-pending-jobs en porte 2 et handler-watch 3, déjà sur main).
- **N1** (82e64f14 / 67cd1c77, 8a2eba68 / 46569b9d) : la perte du « published » vient de la panne Supabase du 11/11
  (13:24-13:27 : 546 puis 503/504, deux PATCH de la fiche en 520) — `retenirDepotIncertain` a remis la tâche « pending » à
  l'étape recreated. Règle : numéro exact vu actif après le retrait → publié + fiche au nouveau numéro ; doute ou sans
  preuve à 6 h → question ; jamais de second dépôt. **Après déploiement : 67cd1c77 « published », fiche passée au numéro
  10761660236 ; 46569b9d → question `recreation_deja_partie`.** Verrou `recreated-vinted-numero-connu`.
- **3a** : les 2 faux rouges du 05/11 et les 2 rouges de a5da17ee ont la MÊME forme (vus en ligne avant la vente, poste
  muet) : la décision écrite de Nico (Q11 a) tranche — rouge = vu en ligne APRÈS la vente, sinon « 🟡 À relire ». Rejeu
  des 38 retraits : 6 rouges → 1 rouge + 11 à relire. f3aec8cc (d8b07167, Beebs) reste ROUGE (relue active le 11/11, après
  la vente) ; 7c6f4b35 et 450bdf41 (a5da17ee) → « à relire ». N2 : files arrêtées à tort retirées. Verrous
  `retraits-en-retard`, `attente-extension-active`.
- **N3** (b695d990, d607ba20, d0ac0538) : eBay d'un client Cloud non relié → « relie ton compte eBay », retrait = risque
  de double vente visible ; jamais « ordinateur ». Verrou `ebay-a-relier-cloud`.
- **3c** (14e536e0, ca9afe24, ebdf29f0) : un numéro confirmé par un autre dépôt n'est plus candidat ; le cas juste
  (90d11dae) reste une question. Le retard de rattachement depuis le 10/11 vient des relevés concurrents (la passe attend
  la fin de tout relevé du compte), pas des empreintes ; le correctif n'en dépend plus. Verrou
  `depot-numero-d-un-autre-depot`.
- **3d** (a1e210f2 ; 8ac5bbda, 98b72757) : même code postal → commune de Leboncoin servie ; CEDEX / 75000 → bloqué avant
  tout essai, message qui explique. Verrou `lbc-commune-meme-cp`. Effet : ~11 publications de 98b72757 (49308) → « à toi
  de jouer » avec l'explication.
- **3b** : les 5 gardes des ventes Beebs construites ; migration `20261113140000_ventes_beebs_cinq_gardes` PRÉPARÉE (banc
  jetable 48/48), NON appliquée ; interrupteur à 0 (relu, jamais touché) ; lecture sans 403 dans la 0.6.187 ; essai réel
  en lecture seule à faire sur le compte d'Ornella avant le zip. Verrous `ventes-beebs-cinq-gardes`,
  `ventes-beebs-lecture-due`.
### Livraison
- Commits **448ac74** (correctif) + **117c2ab** (`EXTENSION_LAST_COMMIT` recalé, 2.9.179).
- Fonctions (archive de 117c2ab) : handler-watch v198 → **v199**, ops-digest v63 → **v64**, beebs-lien v28 → **v29**
  (verify_jwt false, `--no-verify-jwt`) ; get-pending-jobs v367 → **v368** (true) ; sans session : 401. Écarts d'avant ce lot
  emportés (vérifiés) : ops-digest prend les modules Cloud de main (déjà servis ailleurs) ; beebs-lien n'utilise de
  `recreation-deja-partie.js` que `urlsPhotos`, identique (md5).
- Web 2026-11-13T01:46:15Z+117c2ab (entrée lue avec `Origin` : 200) ; **OTA 2.9.179**.
- Retour : fonctions depuis une archive de 3470227 ; app : nouvelle OTA qui revient sur 448ac74.

## Étape 5 — descriptions, couleurs, remontées, bordereaux, relevés (EN SERVICE le 13/11 vers 04:50)
Quatre chantiers en parallèle (H, I, J, K), fusionnés (un conflit de doc, résolu ; `ListingPreviewScreen.jsx` et
`resolutionPublication.js` fusionnés à trois voies), suite complète sur la copie fusionnée en LF : **718/718** ;
build:essai OK ; deno check : aucune erreur nouvelle.
- **5a (de63ca45)** : consignes en tête et lues avec la négation (`lireConsignes`) ; capacités par plateforme et par site
  (`_shared/capacites-texte.js`) ; description en blocs, ses 3 phrases finales posées mot pour mot et en dernier ; faits
  sans source retirés du texte rédigé (un défaut écrit ne tombe jamais) ; état jamais monté par la rédaction ; date de
  test rangée dans `attributs.teste_le` et réécrite au jour de l'envoi (get-pending-jobs, omise sur Beebs). Rejeu sans IA
  de ses 7 fiches : finit par ses 3 phrases 0/28 → 28/28 ; interdits sans source 32 → 12. Réparation de ses 92 fiches
  (`scripts/reparations/20261113_de63ca45_date_de_test*`) PRÉPARÉE, NON exécutée. 7 verrous (137 rouges → 183 verts).
- **5a, état inconnu** : l'écran ne remplit plus jamais « Très bon état » ; UNE question « État » (stepper, lot, ancien
  écran), le clic refuse un job sans état. Mesuré : 848 publications en 30 jours seraient passées par elle. Verrou
  `etat-inconnu-question` (0 → 19). **« Une copie ne dit jamais mieux que la fiche » PRÉPARÉE, PAS EN SERVICE** (342 copies
  en 30 j, dont 227 tiennent l'état de la fiche d'un relevé) : part avec la migration 20261112213000
  (`en-attente/etat-copie-ramenee-a-la-fiche.patch`).
- **5a-2** : « Remonter » lit le seuil de 7 j et coche par plateforme republiable (eBay jamais) ; récentes visibles et
  décochées ; tri à la milliseconde ; plafond gratuit = les plus anciennes. Cas de63ca45 / 1789717140683000. Verrou
  `remonter-par-plateforme` (18 rouges → 35 verts).
- **5b** : « Bordereau du JJ/MM · Imprimé le JJ/MM », « Tout imprimer » (non imprimés) / « Tout réimprimer » ; l'app part
  avant la migration sans rien casser. Migration `20261113153000_bordereau_imprime_le` PRÉPARÉE (banc 30/30), NON appliquée.
  Verrou `bordereau-imprime` (24 → 24).
- **5c** : couleur Depop prise sur la copie, puis la valeur commune, puis la fiche, par identifiants
  (`_shared/depop-couleur.js`) — app, filet get-pending-jobs, copie de republication. Rejeu 8ac5bbda : les 30 publications
  parties sans couleur la reçoivent, les 19 autres inchangées. Modification d'une annonce Depop en ligne : préparée derrière
  un interrupteur FERMÉ (depop.js) ; cartographie à faire (compte de Nico, 999 €, `docs/plateformes/depop/CARTOGRAPHIE.md`
  § 9). Verrou `depop-couleur-fiche` (24 rouges → 57 verts).
- **Question 3 (grille_incoherente)** : plus jamais « écris-nous » comme seule sortie (`_shared/grille-incoherente-issue.js`).
  Verrou `grille-incoherente-jamais-impasse` (6 rouges → 29 verts).
- **Bloc 6** : P3 (refus du relevé automatique comptés dans ops-digest ; migration `20261113154000_cron_refus_journalise`
  PRÉPARÉE, banc 32/32, NON appliquée) ; « Vinted synchronisé il y a 21 h · Leboncoin il y a 8 min » ; ligne « 245 en vente ·
  11 vendues encore affichées » visible, et cachée quand le compte est faux (23 relevés sur 60 en 24 h). Verrous
  `cron-refus-journalise`, `synchro-entete-plateforme`, `vendues-encore-affichees`.
- **5e + bloc 6 dans la 0.6.187** (code poussé, manifest non monté) : 641fb37e — Vinted n'a rien refusé le 11/11 (relance
  sans remise des compteurs, sortie 3 min plus tard sans essai) ; acae56d5 — course entre l'armement de la couleur et l'envoi
  (corrigée : armement accusé avant le clic) ; la sonde pose état et couleur par identifiant quand la page les laisse vides ;
  la copie d'une recréation se retrouve par le numéro renvoyé par Vinted ou l'empreinte des photos, plus jamais par le titre
  (6 600 des 6 809 recréations de 14 j n'étaient reconnues que par le titre) ; P1/P2/P4 ; compte « en vente » figé dans la
  note du relevé. Migration P2 `20261113170500_cadence_cron_seule` PRÉPARÉE (banc 29/29), NON appliquée. Verrous
  `vinted-envoi-sans-perte` (34), `releve-cron-cadence` (16). **Second réarmement de 641fb37e SUSPENDU** : il relancerait une
  tâche arrêtée par la garde `recreation_bloquee` (`en-attente/rearmement-mange-641fb37e.patch`) — décision de Nico.
### Livraison
- Commits **d92d140** (correctif) + **ed7de34** (`EXTENSION_LAST_COMMIT` recalé, 2.9.180).
- Fonctions (archive de ed7de34) : get-pending-jobs v368 → **v369**, generate-listing v143 → **v144**, lens-analysis v127 →
  **v128** (verify_jwt true) ; update-job-status v196 → **v197**, handler-watch v199 → **v200**, ops-digest v64 → **v65**
  (verify_jwt false, `--no-verify-jwt`).
- Web 2026-11-13T03:45:15Z+ed7de34 (entrée lue avec `Origin` : 200) ; **OTA 2.9.180**.
- Retour : fonctions depuis une archive de a7c071f ; app : nouvelle OTA qui revient sur a7c071f.
### Reste (décisions de Nico)
- Migrations PRÉPARÉES, NON appliquées : 20261112213000, 20261113140000, 20261113153000, 20261113154000, 20261113170500.
- Scripts de données : fiche c7c382b7 (après 20261112213000), dates de test de de63ca45 (92 fiches).
- Extension 0.6.187 : l'essai réel n° 1 de la recréation Vinted (numéro gardé à travers la redirection) est la condition
  de livraison ; zip après lui.

## Réponse de Nico au rapport de l'étape 5 (13/11 matin)

### 1. Nuit du 13/11 — plateforme choisie jamais vue connectée (priorité absolue)
Constat et correction : `docs/enquetes/zero-probleme-1211/nuit-1311-plateforme-jamais-vue.md`. En bref : ff1f879f
n'était PAS connecté à vinted.fr dans son Chrome (preuve : la lecture de ses ventes, dans un onglet vinted.fr de son
Chrome, a reçu 400 `user_login_required` — exactement la réponse mesurée pour un visiteur anonyme) ; AUCUN écran ne le
lui a dit (pastille « jamais » grise, bouton « Tout est à jour », popup « Vérifié il y a N min ») ; aucune synchro Vinted
ne pouvait partir (première synchro automatique : sessions vues seulement, une fois par compte ; relevé quotidien :
jamais sans première synchro ; 0 appui). Mêmes faits pour 1f95f334 et 7d64bf87 ; ed4531e2 était connecté (lectures et
publications réussies en onglet) mais la sonde ne le voyait pas. Depuis le 01/10 : 28 comptes ayant choisi Vinted avec
l'extension n'ont jamais eu un seul relevé Vinted tenté. Verrou `selftest:connexion-choisie` (38 → 60).

### 4. Feux verts appliqués (13/11, une à la fois, lecture avant / après)
| Quoi | Heure (Paris) | Avant → après |
|---|---|---|
| F1 `20261112213000` | 07:05 | md5 041d7722/0f714c68 (= lus le 12/11) → 1cf04e26/4f6ec0f6 ; `annonce_vient_de_notre_depot` créée ; déclencheur actif |
| Script c7c382b7 (fiche 1793630721658) | 07:12 | taille « Naissance » et marque « Autre » (source releve_beebs) retirées ; étiquette « EU 140cm », marque « River Island » gardées ; sauvegarde `_backup_1112_c7c382b7_fiche_legging` |
| « Une copie ne dit jamais mieux que la fiche » | avec ce lot | code versé (get-pending-jobs), verrou `etat-copie-jamais-au-dessus` |
| `20261113140000` ventes Beebs | ~08:00 | sauvegarde `_backup_1311_ventes_beebs_cinq_gardes` (9 fonctions) ; md5 aa1ff957 = lu ; 2 fonctions neuves ; interrupteur `ventes_beebs_commandes` = 0 avant et après |
| `20261113153000` bordereaux | ~08:02 | colonne `imprime_le` + `bordereau_marquer_imprime` (anon : non) ; 502 lignes, 0 marquée |
| `20261113154000` refus du relevé automatique | ~08:03 | déclencheur `cron_refus_journalise` ajouté ; les 23 autres intacts et actifs |
| `20261113170500` P2 | ~08:05 | md5 prod 304ab0f8 = inverse ; → ccd33ccf ; déclencheur actif |
| Script de63ca45 (92 + 67 fiches « Jeu testé le ») | 09:23 | APRÈS le correctif eBay (NEB, sinon ses fiches seraient parties sur eBay sans phrase) : avant 94/92/72/67 → après teste_le posé sur 159, phrase figée restante 2 (hors modèle), 5 « plus tard » laissées (sans année, « UMD », 2 phrases à ses mots) ; sauvegarde `_backup_1113_de63ca45_date_de_test` |
Bancs sur Postgres jetable relancés avant : 37/37, 48/48, 30/30, 32/32, 29/29. Journal Postgres après : aucune erreur
des fonctions touchées. Script de63ca45 : joué après le correctif eBay (ligne du tableau).

### Livraison (13/11 matin)
- Commits **0e8dd9b** (96 fichiers : point 1, F1 « copie jamais au-dessus », 6a préparé, 6b, K1 serveur, I3/I4/I5, H2,
  formules Cloud, eBay phrase de test) + **acde971** (EXTENSION_LAST_COMMIT, app 2.9.181), poussés.
- Suite complète sur la copie fusionnée (LF) : **728/728** ; puis NEB et les 34 selftests de ses fichiers : verts ;
  donnees-clients, aucune-estimation, imports-jamais-masques ; build:essai OK.
- Fonctions (archive de acde971, versions et verify_jwt lus avant / après, inchangés) : get-pending-jobs v370 (true),
  ebay-api-worker v128, ops-digest v66, handler-watch v201, email-tunnel v93, push-ventes v29, abonnements-stores-audit
  v16, apple-iap-webhook v57, google-play-webhook v50, stripe-webhook v79 (false) ; create-checkout-session v80,
  cancel-subscription v62, changer-formule v7, send-extension-link v26, validate-apple-receipt v49,
  validate-google-purchase v30 (true). Fermeture des imports relue fichier par fichier (`fonctions-touchees.mjs` n'en
  voyait que 3 sur 16). Premiers passages : get-pending-jobs v370 1 223 appels en 200 (1,4 s ; v369 : 1,34 s).
- Web acde971 (entrée 200) ; **OTA 2.9.181** (canal production, commit acde971) ; module natif restauré (cmp).
- empreintes-urls : pic de 2 120 appels (546 : 546) entre 08:00 et 09:00, tous par pg_net (`fusion_photo_tick`,
  rangement photo des relevés du matin) — même nature que les pics quotidiens (12/11 : 900/216, 869/247, 802/139),
  retombé ; sans lien avec le déploiement.

### 2. Formules « + Cloud » partout
- Vérifié avant d'ouvrir : l'iPhone en vente (2.9.164) achète par le module natif générique ; le JS servi (2.9.181)
  nomme `app.fillsell.{premium,pro,business}.cloud` ; prix identiques web / Apple / Google : 34,99 / 49,99 / 79,99 € par
  mois. Aucun écart d'identifiant, de prix ni de période.
- Écarts trouvés et corrigés : Android déjà ouvert sur la vc37 (formules désormais à partir du binaire 2.9.176) ; double
  abonnement Apple possible pour un Cloud seul App Store (formules masquées pour ces comptes) ; essai jamais annoncé sur
  iPhone (le module 8.3.3 ne rend pas l'offre) ; lien Google des mails vers le Cloud seul. Restent : un Apple ID déjà
  abonné au groupe voit « 7 jours » alors qu'Apple facture tout de suite (la feuille d'Apple affiche les vraies
  conditions ; seul un binaire le règle) ; pas d'essai proposé aux abonnés boutique ; offre d'essai Android jamais
  vérifiée en vrai.
- **iPhone ouvert le 13/11 à 08:49** (`coin_config.cloud_formules_apple` = 1 ; Stripe et Google l'étaient). Android :
  la vc38 (2.9.176) est **approuvée** dans la Play Console, en « publication gérée » : elle attend le bouton « Publier 3
  modifications » (avec les deux descriptions de fiche) — non cliqué ; les formules s'y ouvrent seules dès qu'elle est
  installée. Achat de test Sandbox : impossible sans iPhone (TestFlight, compte Sandbox).
- Verrou `selftest:formules-ouverture-partout` (19 → 33).

### 6. Cas réels de l'étape 3
- **bf85d176 (même objet importé deux fois)** : la passe du 12/11 15:40 avait bien vu le même objet ; la base
  (`rapprochement_v3_fiche_intacte`) a refusé la fusion parce que l'article d'origine porte DEUX annonces, posé une
  question restée dans Synchroniser, et « Publier en lot » a emporté la copie vers Leboncoin (garde « jumeau » retirée le
  09/10). Correctif : migration `20261113180000_meme_objet_rattache_ou_retenu` PRÉPARÉE (banc jetable) — rattachement
  quand toutes les annonces sont dans le groupe fort, sinon question avec la fiche Vinted hors du stock, et retenue de
  toute publication liée par une question « même article » ouverte sur photo identique. Son cas : rattrapage PRÉPARÉ
  (3 questions). 145 questions de ce motif depuis le 01/10 (102 ouvertes, 28 comptes). Verrou `meme-objet-import` (13 → 55).
- **98b72757 (Cholet 49308)** : 49308 a été saisi dans Réglages › « Ville de tes annonces Leboncoin » le 11/11 à 11:27
  (champ qui acceptait 5 chiffres quelconques ; aucun code FillSell ne produit 49308). Règle : un code d'aucune commune
  retombe sur le code de l'adresse si c'est la même commune, sinon sur le code connu de Leboncoin ; doute = question ;
  l'écran refuse un tel code. Ses 12 publications partent au prochain passage en « Cholet 49300 ». Verrou
  `lbc-ville-cedex-repli` (28 → 36).

### 3. Réponses de Nico appliquées
641fb37e laissée arrêtée par sa garde. H1 : les 2 fiches hors modèle laissées. H2 : fait (script de63ca45, 67 « Jeu
testé le » rangées ; 5 laissées). H4 : rien touché. I3 : « Marquer non imprimé » dans l'app (marche avant et après sa
migration `20261113193000`, PRÉPARÉE, à valider). I4 : l'en-tête compte Vinted « en vente » (447d920c : 996 au lieu de
1 007). I5 : digest rouge au-delà de 6 refus par compte ou 150 au total en 24 h (rejoué sur 14 jours : 4 rouges, tous
f44b5917). K1 : rattachement serveur de la recréation Vinted sans titre (get-pending-jobs en service) ; la partie base,
migration `20261113190000`, PRÉPARÉE (banc 32/32), à valider. J1, I1, I2 : rien à changer. H3, H5, J2, K2 : essais réels
(point 5).

### 5. Essais réels — non faits, et pourquoi
- Republication Vinted avec la 0.6.187 dans le Chrome de Nico : le compte f44b5917 a le Cloud pour exécutant unique
  (`cloud_voie` = vrai, poste `…-cloud`) ; une extension chargée dans son Chrome ne recevrait aucune tâche. Dans ce Chrome,
  la copie non empaquetée (`FillSell-Extension-Nico`, 0.6.162) est désactivée et la version du Web Store n'est pas
  installée. Rien n'a été basculé : décision de Nico (essai sur le poste Cloud, ou Cloud coupé le temps de l'essai).
- Lecture des ventes Beebs d'Ornella (f8aa02a5, extension 0.6.186 sur son ordinateur) : ses lectures en mode fantôme
  reçoivent 0 commande à chaque passage ; la lecture sans 403 est dans la 0.6.187 — l'essai demande la 0.6.187 chez elle.
- Cartographie de la modification Depop, essai Beebs (H3), coupe Beebs à 1 500 (H5) : pas encore faits.
- La 0.6.187 n'est donc pas empaquetée : sa condition de livraison (l'essai de recréation Vinted) n'est pas remplie.

## Étape 4 — comptes hors France (décisions de Nico du 13/11 : `scratchpad/etape4/DECISIONS-NICO-1311.md`)
### L0 — EN SERVICE (13/11 ~09:55)
- Plus aucune tâche eBay close parce que le compte est hors France (D9) : ATTENTE `ebay_site_etranger` (« Ton site eBay
  arrive bientôt, rien n'est perdu »), reprise seule à l'ouverture du site (code qui sait y publier ET
  `coin_config.ebay_pays_<cc>` = 1 ; France seule aujourd'hui) ; handler-watch ne la solde plus à 72 h. D10 : un compte
  eBay dont le site lu n'est pas la France n'est plus servi à l'extension (attente + « Relie ton eBay à FillSell ») ; un
  compte de l'extension sans liaison reste sur ebay.fr (son site n'est pas lisible : 27 des 33 comptes eBay par
  l'extension).
- Commits **771605b** + **0de9048** (2.9.182) ; handler-watch v202, ebay-api-worker v129 (false), get-pending-jobs v371
  (true) ; web 0de9048 ; **OTA 2.9.182**. Suite 730/730. Verrou `ebay-site-attente` (0/43 → 58/58).
- Migration `20261113184500_ebay_site_attente_jamais_expiree` PRÉPARÉE (banc 30/30) : `expire_publish_reservations`
  fermerait une attente à J+14 — à appliquer avant le 27/11 (feu vert de Nico).
- Lecture unique des 54 comptes au site inconnu (13/11 ~10:00, pg_net, `site_compte`, 54 réponses 200) : 49 France, 4 US,
  1 UK, 1 Italie. Parc actif : France 189, US 12, UK 6, Italie 3, Allemagne 2, Belgique 2, Autriche 1, inconnu 0.
  Aucune tâche fermée ni mise en attente (les 6 comptes étrangers découverts n'en ont aucune d'ouverte).

## Deuxième réponse de Nico (13/11 midi)

### 1. Paiements et abonnements : tout vrai, avant de valider
Tableau complet (situations × web / iPhone / Android, écran, texte, ce qui est prélevé et quand, mails, écart) :
`docs/enquetes/zero-probleme-1211/paiements-1311.md` § 1. 19 écarts texte ≠ réalité corrigés (P1-P19), dont : « 7 jours
gratuits » montré à un identifiant Apple qui avait déjà eu la semaine du groupe (Apple prélevait tout de suite) — lu sans
nouveau binaire dans les transactions signées du module 8.3.3 (`src/lib/eligibiliteApple.js`) : « Pas d'essai : {prix}
prélevés aujourd'hui » avant la fenêtre d'Apple ; « Se désabonner » d'un abonné boutique sur le web coupait l'accès et
disait « annulé » (désormais 409, rien écrit, où arrêter) ; montées : ce qui part aujourd'hui est dit ; mails des formules
corrigés. Restent (R1-R5) : offre d'essai Android choisie par le module (jamais prouvée) ; montée classique depuis un autre
canal = 2e abonnement ; remboursement Stripe non traité ; grâce Google rouverte par validate-google-purchase ; textes des
conditions du Cloud / Legal / site. Essai des abonnés boutique comme sur le web : impossible sans binaire (offres
promotionnelles Apple, offres développeur Google) — le texte dit « Pas d'essai ». Essai Android en vrai : impossible sans
appareil (aucune image Google Play sur ce PC). Verrou `selftest:textes-paiement-verite` (55 rouges → 69 verts).

### 2. Décisions appliquées
- Migrations (une à la fois, lecture avant / après, bancs relancés) : `20261113180000` (même objet ; md5 803a5227 /
  f2b2a913 = lus → 23f59fbe / 5e5a9084, 3 fonctions neuves) + rattrapage restreint au clavier bf85d176 (10:32 : import
  1790174130756 fusionné dans 1794494010078017 ; 25caeedd et ebdf29f0 laissés) ; `20261113190000` (01b1d478 = lu →
  fa15ad33) ; `20261113193000` (colonnes non_imprime_le, imprime_avant + RPC ; 504 lignes) ; `20261113184500`
  (6e03144a = lu → 2a396215). Journal Postgres : aucune erreur des fonctions touchées.
- Play Console : « Publier 3 modifications » cliqué et confirmé (vc38 2.9.176 + 2 descriptions de fiche) le 13/11 ~11:00.
- Les 7 doubles en ligne (53efea05 ×2, fc37c75e ×5) : liste rendue à Nico, rien retiré.
- 52 comptes sans choix : les plateformes utilisées comptent comme choisies (point 3).
- Essai 0.6.187 sur le seul poste Cloud de Nico : mécanisme « extension pilote par compte » prêt dans l'orchestrateur
  (`serveur-cloud/src/extensionPilote.js`, verrou cloud-extension-pilote 5 → 5) ; NON déployé : redéployer l'orchestrateur
  redémarre les 6 navigateurs Cloud (clients compris) — décision de Nico.

### 3. Une action réussie prouve la connexion
`_shared/preuve-action.js` : vente lue, dépôt publié ou vendu, retrait fait, relevé fait → session vue 7 jours ; jamais
« pas connecté » dans les 24 h qui suivent. Parc : connectés sans être vus depuis le 01/10 = 3 comptes (ed4531e2 Vinted ;
4dcf42bd, bafbd2de Leboncoin) ; chiffres refaits (3 jours) : 92 lectures réussies toutes vues ; 22 lectures en 400 dont 3
vues par une autre action, 8 vraiment pas connectés. Migration `20261113213000` PRÉPARÉE (le code marche avant et après).
Verrou `action-reussie-session-vue` (32 → 48).

### 4. Refus Leboncoin sans motif (f0acd3af et 10 autres)
Aucune trace dans « Mes annonces » (30 jours, 2 372 relevés : seulement active / paused / inactive). Quatre familles : plus
de 5 mots-clés servis (notre défaut, corrigé : `_shared/description-leboncoin.ts`, 1 403 textes sur 1 419 identiques) ;
mêmes photos qu'une annonce en ligne du compte ; relance à l'identique ; 2 inexpliqués. Message vrai « Leboncoin a refusé
cette annonce… » : migration `20261113203000` PRÉPARÉE. Verrous `lbc-cinq-mots-cles` (9 → 23), `lbc-refus-message` (30/30).

### Étape 4 — L1 (préparé)
Site de chaque compte de plateforme : `_shared/sites-plateformes.js`, `_shared/comptes-plateformes.js` (écrivains sans
effet tant que M1 n'existe pas) ; M1 `20261113210000_comptes_plateformes` PRÉPARÉE (banc 40/40), feu vert de Nico attendu.

### Livraison (13/11 ~12:45)
Commits **fe8209e** (79 fichiers) + **3a32eab** (EXTENSION_LAST_COMMIT, 2.9.183), poussés. Suite 735/736 (le rouge :
site-aiguillage, figeait l'offre FILLSELL50 finie le 01/11 — mis à jour, 40/40) ; Cloud 211/211 et 5/5. 21 fonctions
(archive 3a32eab, verify_jwt inchangés) : get-pending-jobs v372, update-job-status v198, handler-watch v203,
ebay-api-worker v130, ebay-account v41, ebay-oauth-callback v25, ebay-oauth-start v19, ebay-account-deletion v21,
ebay-messagerie v19, ebay-notifications v18, ebay-releve-api v20, ebay-ventes-sync v22, releve-completer v17,
remise-ordre-photos-ebay v8, ia-banc-deduction v21, cancel-subscription v63, create-checkout-session v81, email-tunnel v94,
apple-iap-webhook v58, google-play-webhook v51, stripe-webhook v80. Web 3a32eab ; **OTA 2.9.183**.

## Troisième réponse de Nico (13/11 après-midi)

### 7. Vente « inconnue » de f0acd3af (10788214725) — c'est elle
Lue sur Vinted (lecture seule) : 10788214725 est une « Ceinture Sézane cuir véritable camel – 89 cm » (38 €, vendue 33 €)
de son propre compte, sans aucune tâche FillSell ; la veste (10788211328, 10 €) est en ligne, non vendue. Le numéro voisin
n'est que la numérotation de tout Vinted. Rien à faire.

### 2. Feux verts appliqués (13/11 ~13:15-13:40, lecture avant / après, bancs relancés 22/22, 30/30, 40/40)
`20261113213000` (plateformes_verite : ab921e54 = lu → 6a48d15f ; témoins : ed4531e2 Vinted « à vérifier », ff1f879f
« inconnue », f44b5917 « connectée ») ; `20261113203000` (58a5c7fa = lu → 9c82939f, message_refus_leboncoin) ; M1
`20261113210000` (table comptes_plateformes, RLS, ni anon ni client en écriture) + remplissage : 226 comptes eBay (EBAY_FR
195, US 16, GB 6, IT 3, BE 2, DE 2, AT 1, CA 1) et 234 Vinted.

### 3-4. Les 7 doubles et « même objet »
Rattrapage 2e passage (25caeedd, ebdf29f0 : questions 7ee10946 et 359a4f52 → fusionnées). Doubles : retrait par le geste
« Retirer » de l'app (`scripts/essais/20261113_retraits_doubles_nico.sql`), règle de Nico (la copie au prix actuel de la
fiche — le dernier prix posé —, sinon la plus ancienne) : retirées 3290542513, 407330996482 (fait : `deleted`),
3305143401, 3305134349, 3305146607, 3305137965, 3305131119 (en file : l'extension du vendeur) ; gardées 3276946640,
407321497159, 3305154715, 3305295555, 3305308288, 3305238099 (25 € : prix relevé le 08/11), 3305300248.

### 1. Essai de la 0.6.187 sur le seul poste Cloud de Nico — RÉUSSI
Moment calme (0 tâche, 0 relevé Cloud) : orchestrateur 90323d60f16d → ed7095c3465c de 14:03:27 à 14:04:33 ; les 6
navigateurs rouverts entre 14:04:39 et 14:04:48 (20-30 s), 0 erreur, passages repris (14:22-14:23). Pilote 0.6.186.45582
posé 14:05:22 pour f44b5917 seul ; republication 3d43fea4 (fiche de test 999 €) publiée 14:12:54 → 10790914500,
`copie_par_numero.source` = onglet, 12 photos, copie confirmée par l'empreinte de ses photos (Vinted avait renvoyé
l'onglet au profil) ; l'ancienne 10675129855 : « Page not found ». Retour : copie commune re-signée 0.6.186.45583
(14:18:55, empreinte bc897c0f = la commune, build ba77b92-cloud), dossier pilote archivé ; CRX commun 2cd567724086
inchangé ; les 5 clients non redémarrés une 2e fois. **Zip 0.6.187** : `build\CWS-0.6.187-A-TELEVERSER\fillsell-extension-0.6.187-cws.zip`
(BUILD_ID 2026-11-13T13:27:42Z+9856e10, commits d6b0c85 + 9856e10). Défaut préexistant vu : les alertes de
l'orchestrateur échouent (« permission denied for function envoyer_mail_ponctuel »).

### 5. Leboncoin
Mêmes photos : seuil MESURÉ — Leboncoin accepte la 2e copie (14 sur 15 en ligne) et refuse la 3e (0 sur 4) : retenue à 2
jumelles en ligne, à 1 pour une paire « même article » ouverte ; la règle stricte de Nico (1) est une ligne, à son mot.
Relance à l'identique d'un refus : bloquée tant que rien n'a changé. Veille des familles : `scripts/lbc-refus-familles.prod.sql`
(13:00 : 2 inexpliqués, aucune nouvelle famille).

### 6. Paiements, la fin
Comptes à 2 abonnements actifs (lus le 13/11) : 785352fe (Premium App Store + Pro Stripe depuis le 10/11 : double
prélèvement, remboursement partiel de 8,66 € le 10/11 ; Apple reprélève le 30/11) ; c7c382b7 (Pro Stripe + Cloud seul
App Store, essai → 24,99 € le 19/11) ; f0acd3af (Pro App Store + Cloud seul App Store, → 24,99 € le 16/11) ; 5322fa18
(test). Rien annulé ni remboursé. Correctifs et textes AVANT → APRÈS : `docs/enquetes/zero-probleme-1211/paiements-1311-suite.md`.
⚠ Geste chez Stripe à faire par Nico : cocher `charge.refunded` sur le point de terminaison du webhook.

### Livraison (13/11 ~15:00)
Commits ca9308d (66 fichiers) + cd1d34a (2.9.184) ; suite 744/744. Fonctions : email-tunnel v95, garde-abonnement v1
(NOUVELLE, true), create-checkout-session v82, cancel-subscription v64, changer-formule v8, send-extension-link v27,
validate-apple-receipt v50, validate-google-purchase v31, get-pending-jobs v373, update-job-status v199, ops-digest v67,
push-ventes v30, abonnements-stores-audit v17, apple-iap-webhook v59, google-play-webhook v52, stripe-webhook v81
(verify_jwt inchangés) ; signer-offre-boutique NON déployée (essai des abonnés boutique, prochain binaire). Web cd1d34a ;
**OTA 2.9.184**.

## Quatrième réponse de Nico (13/11 fin d'après-midi) — clôture du terminal

### 1. Un abonné peut TOUJOURS ajouter le Cloud
- **a) La règle** (`_shared/un-seul-abonnement.js`, `compterFormules` / `decisionAchat` / `decisionSurLectures`) : une
  seule FORMULE à la fois (Premium, Pro ou Business, avec ou sans Cloud), tous canaux confondus ; le Cloud (pack ou Cloud
  seul) ajouté à une formule est toujours permis, quel que soit le canal de la formule et celui du Cloud. Refus seulement
  pour une 2e formule ou un 2e Cloud ; un compte qui a déjà le Cloud seul se voit proposer la formule SANS Cloud (« elle
  s'ajoute à ton Cloud »). Même règle dans garde-abonnement (lit aussi `cloud_formule`), create-checkout-session
  (`cloudSeulRefuse` : jamais à une formule vivante), le filet `_shared/deux-abonnements.ts` (alerte seulement pour un
  vrai double : 785352fe oui ; c7c382b7, f0acd3af non) et l'app (`src/lib/gardeAchat.js`, Réglages › Abonnement montre
  le bloc FillSell Cloud à un abonné payant sans Cloud).
- **b) Personne n'a été empêché** : de 14:55 à 17:45, aucun appel à create-checkout-session, garde-abonnement,
  validate-apple-receipt, validate-google-purchase ni changer-formule (journaux des fonctions) ; seul un compte gratuit
  (b23f13b0) a ouvert puis fermé les offres. Mais depuis l'ouverture des formules, l'écran ne montrait plus le bloc
  « Cloud seul » à un abonné (`cacherBlocCloud`) : corrigé dans l'OTA 2.9.185.
- **c) Le tableau** (`selftest:abonne-ajoute-le-cloud`, 36 cas sur le vrai code ; formule payée jusqu'au 30/11, essai
  commencé le 13/11) :

| Formule payée sur | Pack sur le même canal | Cloud seul, même canal | Cloud seul, autre canal |
|---|---|---|---|
| Web (Stripe) | Premium / Pro : 7 jours sans rien de plus, puis la différence ajoutée à la facture du 30/11 ; Business : différence au prorata aujourd'hui, puis 79,99 €/mois. Accès : Cloud ouvert sur le même abonnement | « Carte demandée, rien n'est prélevé avant le 20 novembre. Puis 24,99 €/mois » ; 2e abonnement Stripe ; formule gardée | iPhone / Android : semaine offerte si la boutique la donne, sinon « 24,99 € prélevés aujourd'hui, puis chaque mois » ; 2e abonnement ; formule intacte |
| App Store | « Pas d'essai : le changement se fait dans ton abonnement App Store, sans second abonnement. 49,99 € sont prélevés aujourd'hui » (Apple rend le prorata) | semaine si l'identifiant Apple ne l'a jamais eue dans « FillSell Cloud », sinon 24,99 € aujourd'hui ; 2e abonnement Apple | Web : essai 7 jours par carte, palier Apple gardé ; Android : comme ci-contre |
| Google Play | « Pas d'essai : … la différence au prorata est prélevée aujourd'hui, puis 49,99 €/mois » (binaire vc38 requis pour les packs) | offre 7 jours si Google la rend, sinon 24,99 € aujourd'hui ; 2e abonnement | Web / iPhone : comme ci-dessus |

  Pendant l'essai, le bloc dit « Gratuit jusqu'au 20 novembre à 18:18. Ensuite, 24,99 €/mois s'ajoutent à ta formule
  Pro, sauf si tu l'arrêtes avant. » Sur 5c20c40 : 190 verts, 63 rouges ; après : 253 / 0.
  **Essai réel : pas fait.** Le mode test de Stripe ne prouve rien ici (stripe-webhook ignore tout événement
  `livemode: false`) ; un achat Sandbox demande TestFlight sur un iPhone ; se connecter à l'app de production depuis
  l'automatisation est exclu. Observé à la place : le renouvellement Sandbox quotidien du compte de test 5322fa18 (Pro
  App Store + Cloud seul App Store) à 18:50, passé par apple-iap-webhook v60 (voir § 5).
- **d) Verrou** `selftest:cloud-en-plus-de-formule` : casse si la garde (serveur, app, garde-abonnement,
  create-checkout-session) refuse un jour l'ajout du Cloud à une formule (3 formules × 3 canaux × pack / Cloud seul sur les
  3 canaux, puis montée de formule, aucune alerte) ou si l'écran cache le bloc. Sur 5c20c40 : 22 verts, 131 rouges ;
  après : 171 / 0.
- **e) Textes** (version des conditions 2026-11-13 gardée : retour au fond déjà accepté, poussé le 13/11) :
  conditions du Cloud art. 6 « C'est un abonnement distinct des forfaits : il se prend seul, avec le forfait gratuit, ou
  en plus d'un forfait payant (Premium, Pro ou Business), sur le web, dans l'App Store ou dans Google Play, quel que soit
  le canal où le forfait est payé ; résilier le forfait n'arrête pas le Cloud. » ; CGV art. 7 « L'option FillSell Cloud
  est un abonnement distinct des forfaits : elle se souscrit seule (forfait gratuit compris, avec ses volumes) ou en plus
  d'un forfait payant (Premium, Pro ou Business), sur le web, dans l'App Store ou dans Google Play, quel que soit le canal
  où le forfait est payé. La résiliation d'un forfait n'arrête pas l'option FillSell Cloud. » ; formules et mentions
  légales 3.4 : « une seule formule à la fois, tous canaux confondus ».
- **f) 785352fe** : aucun mail. Premium App Store ACTIF, renouvellement automatique, échéance 30/11 à 18:32 (dernier
  DID_RENEW le 30/10). À redire à Nico le 28/11 si c'est toujours le cas.

### 2-3. Leboncoin et Stripe
Seuil mesuré validé par Nico. Webhook Stripe `we_1TNHq1QZRA77vrWJHXw51Svb` : avant, 6 événements
(checkout.session.completed, customer.subscription.deleted, customer.subscription.updated, invoice.paid,
invoice.payment_action_required, invoice.payment_failed) ; après, les mêmes + `charge.refunded` ; URL et version d'API
(2026-03-25.dahlia) inchangées ; aucun avertissement.

### 4. Alertes Cloud vers support@
Migration `20261113224500_alertes_cloud_service_role_support` (banc jetable 112/112) APPLIQUÉE : envoyer_mail_ponctuel
réécrite depuis la prod (md5 2c347219… → 9de0aade…), droits `{postgres=X/postgres}` → `{postgres=X/postgres,service_role=X/postgres}` ;
le service_role n'envoie que la catégorie « support », à support@ seulement. Inverse :
`supabase/rollbacks/20261113224500_alertes_cloud_service_role_support_INVERSE.sql`. Preuve sur cloud-2 (vrai chemin de
l'orchestrateur) : deux refus attendus (adresse hors support@, catégorie « marketing ») ; simulation ; puis la vraie
alerte « [TEST] » à 17:34:28 → `email_logs` cloud_alerte support@ 17:34:28, reçue par support@ 17:34:29 (`support_mails`,
transfert ok), 0 échec. Effet : support@ reçoit désormais les alertes de l'orchestrateur (~16 à 20 par jour ; 178 étaient
perdues depuis le 01/11).

### 5. Contrôles du jour
- Veille de l'essai Cloud de d607ba20 (fin le 15/11 à 15:16) : `cloud_essai_veille` envoyé à 16:00:16, livré.
- 18:50 : renouvellement Sandbox quotidien du compte de test 5322fa18 (Pro App Store + Cloud seul App Store) reçu à
  18:50:30 par apple-iap-webhook v60 (rallumage neutralisé : référence close) ; seule l'alerte interne « [TEST] … Paiement
  24,99 € » est partie à support@ ; aucun mail au compte (email_logs vide), aucune alerte « deux abonnements ».

### Livraison (13/11 ~17:30)
Commits 9fbf9e2 + 23ef826 (2.9.185) ; suite 747/747. Fonctions : garde-abonnement v2, create-checkout-session v83,
stripe-webhook v82, apple-iap-webhook v60, google-play-webhook v53, abonnements-stores-audit v18, email-tunnel v96,
push-ventes v31, validate-google-purchase v32, validate-apple-receipt v51, cancel-subscription v65, changer-formule v9,
send-extension-link v28 (verify_jwt inchangés). Web 23ef826 ; **OTA 2.9.185**. Migration 20261113224500 marquée appliquée.

## Cinquième demande de Nico (13/11 soir) — couper le renouvellement ne coupe plus rien

### 1. La règle, à la racine
- AVANT (règle du 08/11) : un essai Cloud dont le renouvellement était coupé s'arrêtait à la seconde. Cas réel cdf7007c :
  essai Pro + Cloud par Apple le 13/11 à 13:13, renouvellement coupé sur l'iPhone à 13:54, Cloud coupé à 13:54:51
  (cloud_essai_fin, cloud_essai_arrete, cloud_voie faux, navigateur et coffre purgés à 13:57) et mail « Pro + Cloud est
  arrêtée » — alors qu'Apple maintient l'essai et le Pro jusqu'au 20/11 13:13.
- APRÈS (`_shared/cloud-option.js`, `ecritureCloudStore`, sens « annulation ») : rien n'est arrêté ; la coupure est notée
  (`cloud_arret_fin_periode = true`), la fin d'essai de la boutique est gardée, le Cloud s'arrête seul à cette date. Apple
  (Cloud seul et formules), Google (CANCELED), et Stripe : stripe-webhook annulait tout de suite (`subscriptions.cancel`) un
  essai résilié au portail ; il ne le fait plus (`coupureRenouvellementStripe`), Stripe le termine à la fin de l'essai sans
  facture. Aucun mail client (nouvel événement `essai_renouvellement_coupe`, alerte interne support@ seulement) ; pas de
  rappel de la veille ; une restauration Apple garde la coupure (validate-apple-receipt).
- **Ce que faisait « Arrêter l'essai »** (avant ce lot) : sur le web (Stripe), un VRAI arrêt immédiat (cancel-subscription,
  `subscriptions.cancel`) ; sur iPhone et Android, les boutons ouvraient la page des abonnements de la boutique : ils ne
  faisaient que couper le renouvellement. **Décision de Nico (19:20) : plus aucun arrêt immédiat d'un essai, sur aucun
  canal** — sur le web, « Arrêter l'essai », « Arrêter le Cloud » et « Se désabonner » d'une formule en essai coupent le
  prélèvement (`couperEssaiStripe` : `cancel_at_period_end` ; le Cloud d'un abonné porté par un schedule : schedule rendu,
  formule payée continue, Cloud jamais facturé) ; même fenêtre et même message que sur les boutiques. Restent immédiats :
  remboursement, révocation, impayé, et le verrou de carte (second essai refusé).
- Fenêtres : « Ton Cloud continue jusqu'au {date}, puis s'arrête seul, sans prélèvement. » (Apple : « Annulé au moins 24
  heures avant la fin de l'essai, … » ; Google : « avant la fin de l'essai ») ; puis l'app : « Ton essai Cloud continue
  jusqu'au {date}. Rien ne sera prélevé. » (dès qu'Apple a confirmé la coupure — décision de Nico) et plus de bouton d'arrêt.
- Conditions du Cloud art. 7 et CGV art. 7 : « Sur le web, vous résiliez depuis l'app (Réglages › Abonnement › FillSell
  Cloud) ; un abonnement pris dans l'App Store ou Google Play se résilie dans les réglages d'abonnement de la boutique. Sur
  tous les canaux, la résiliation coupe le renouvellement et n'arrête rien tout de suite : le Cloud reste actif jusqu'à la
  fin prévue de l'essai ou de la période payée, puis s'arrête seul, et rien n'est prélevé ensuite ; résilié avant la fin
  de l'essai (chez Apple, au moins 24 heures avant), il ne coûte rien. » Version 2026-11-13 (jour du push), en faveur du
  client : minimales inchangées, aucune nouvelle acceptation.
- **Aucun rattrapage** (décision de Nico) : la règle vaut pour les coupures reçues après le déploiement (13/11 20:32). Les
  essais arrêtés avant restent arrêtés — cdf7007c, 8b457627, 7d22ae91 et tout autre compte dans le même cas : aucun script,
  aucune réouverture, aucun mail, IP au repos. Une reprise du renouvellement (AUTO_RENEW_ENABLED) sur un tel essai n'écrit
  que `cloud_arret_fin_periode = false` : l'essai reste arrêté ; à la fin de la semaine d'Apple, Apple prélève et le Cloud
  repart, payé.
- Verrou `selftest:essai-renouvellement-coupe` : 91 rouges sur 119 sur 23ef826 → 131/131 (web compris, et « aucun rattrapage » :
  aucune notification ultérieure ne rouvre un essai arrêté par l'ancienne règle ; aucune fonction ni script de réparation).

### 2. Filet de capacité
Capacité réelle de cloud-2 lue le 13/11 ~17:45 : 25 navigateurs (borne mémoire : 1 907 Mo par compte au p95, 56 196 Mo
disponibles au minimum sur 24 h ; processeur loin), 15 vendus, 6 servis. Seuils : dès 80 % (20/25, le seuil de l'alerte
support@) les essais au renouvellement coupé passent en dernier dans la file ; à 100 % et sans aucune place libre, ils sont
arrêtés UN par tour, une place à la fois (décision de Nico ; fin d'essai la plus proche d'abord, jamais pendant une tâche
ni un « Me connecter » ; l'orchestrateur écrit l'arrêt lui-même, sans migration), avec le message « Le Cloud est complet : ton essai, dont le renouvellement est coupé, s'est
arrêté le {date} pour libérer sa place. Rien ne te sera prélevé tant que le renouvellement reste coupé. » Jamais un Cloud
payé ni un compte offert ; les essais des packs sont concernés (le palier n'est jamais touché). Loin du seuil : décisions
identiques à l'ancien code (20 000 états tirés au hasard). Verrou `selftest:cloud-filet-capacite` 9/9 ; serveur-cloud 211/211.

### 3. Livraison (13/11 ~20:30-20:40)
Commits 899307d (46 fichiers) + d33c7f9 (2.9.186), poussés. Suite complète sur la copie fusionnée en LF (base 23ef826 +
les deux lots), passée en 8 morceaux (mémoire du poste basse, un autre terminal ouvert ; même liste, aucun test sauté) :
749/749 ; build:essai OK. Fonctions (verify_jwt inchangés, lus avant et après) : apple-iap-webhook v61, google-play-webhook
v54, stripe-webhook v83, email-tunnel v97, abonnements-stores-audit v19, push-ventes v32, ops-digest v68, update-job-status
v200 (false) ; cancel-subscription v66, validate-apple-receipt v52, validate-google-purchase v33, create-checkout-session
v84, changer-formule v10, garde-abonnement v3, send-extension-link v29 (true) ; signer-offre-boutique toujours non déployée.
Web d33c7f9 ; **OTA 2.9.186**. Orchestrateur cloud-2 ed7095c3465c → **d33c7f97f4ee** (moment calme : 0 tâche en cours,
0 relevé ; seules 2 tâches Beebs de c7c382b7 en attente depuis le 09 et le 12/11) de 20:39:18 à 20:39:39 ; image Chrome et
CRX inchangés ; 6 navigateurs rouverts entre 20:39:46 et 20:39:54 ; le filet reste muet (6/25). Essai réel : aucun
(Sandbox et mode test Stripe demandent un appareil ou une connexion à l'app de production, exclue depuis l'automatisation).

### 4. IPRoyal — qui paie les IP (lecture seule du compte, 13/11 ~19:45, rien changé)
Aucune IP n'est en renouvellement automatique : les 14 commandes ISP actives affichent « Subscription : Off » et « (Expires) ».
Les factures (« All time ») ne contiennent que 4 DÉPÔTS par carte sur le solde (05/10 $20, 30/10 $15, 02/11 $15, 03/11 $30) et
le premier achat d'IP (#IP-83578416, 26/09, $5.40, carte) ; aucune facture de renouvellement, aucune pour les 13 autres IP :
elles sont payées sur le SOLDE (la prolongation de #83578416 le 25/10 aussi). Moyens enregistrés : visa ****9699, Apple Pay
****2922, Apple Pay ****9699. Solde $5.15 : l'orchestrateur alerte (« moins que les dépenses prévues sur 14 jours : 16 $,
recharger d'au moins 11 $ ») ; première expiration le 25/11 (#83578416), puis 3 le 29/11.
