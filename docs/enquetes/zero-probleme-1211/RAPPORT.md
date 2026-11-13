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
