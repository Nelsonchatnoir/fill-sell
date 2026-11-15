# 15/11/2026 soir — 0.6.191 validée, Cloud en 0.6.191, essai réel de la règle de prix, origine du « Me connecter » Depop

Ordre de Nico (15/11, ≈ 18:05) : valider la 0.6.191 avant téléversement, la mettre sur le Cloud, prouver en réel la règle
de prix à la republication sur son compte Cloud (f44b5917), dire d'où venait la régression Depop. Heure de Paris partout.

## 1. La 0.6.191 avant téléversement
- **Suite complète** sur HEAD 9fdb844 (arbre propre, séquentielle, 18:13 → 18:41) : **798/798 verts, 0 rouge** —
  dont les selftests de publication, republication, retrait et relevés de Vinted, Leboncoin, Beebs, eBay, Depop.
- **Le zip** `build/CWS-0.6.191-A-TELEVERSER/fillsell-extension-0.6.191-cws.zip` (seul fichier du dossier ; seul dossier
  `CWS-*-A-TELEVERSER` ; 0.6.190 rangée dans `build/CWS-PERIMES/REMPLACEE-PAR-0.6.191-1511-…`) : manifeste 0.6.191 à la
  racine, BUILD_ID `2026-11-15T11:07:11Z+b8d189c` (≥ EXTENSION_LAST_COMMIT 10:36:59Z, 84a8d8f). Comparé fichier par fichier
  au build de `chrome-extension/` au commit HEAD (même transformation, jeton remis) : 37 fichiers = 37 sources livrables,
  35 identiques à l'octet, 2 SVG identiques au retour à la ligne près (CRLF de la copie de travail Windows, md5 du zip =
  md5 du fichier de travail) ; aucun fichier en trop. Aucun commit n'a touché `chrome-extension/` après b8d189c.
  0.6.191 jamais publiée (dernière acceptée : 0.6.186).
- **Écart avec la 0.6.186 servie** (`ba13a51`, 157 comptes) : 11 commits, 10 fichiers (background, Beebs, Depop, Leboncoin,
  Vinted, messagerie, popup). Preuve réelle de la plus grande partie : la 0.6.189 (= 0.6.186 + 0.6.187 à 0.6.189) tourne au
  Cloud depuis le 14/11 12:39. Sur 36 h : Vinted republications 92/92, publications 24/25 ; Leboncoin publications 22/23
  (1 annulée), republications 13/13, retrait 1/1 ; Beebs publications 4/4 ; Depop 3/4 ; Vinted retrait 1/1. Les 2 arrêts sont
  des questions de taille (« 48 » hors grille Vinted, « 8-9 » hors grille Depop), pas des pannes. 0.6.190 (pause du PC
  d'un compte au Cloud ; jamais sur la copie Cloud : `COPIE_CLOUD`) et 0.6.191 (bloc de catégorie Leboncoin attendu) :
  selftests, et l'essai réel du § 3 (republication Leboncoin d'un vêtement).

## 2. Le Cloud en 0.6.191
- `EXTENSION_SEULE=1 bash serveur-cloud/outils/deployer.sh 5.9.80.213 cloud-2.fillsell.app` à **18:45:55 → 18:46:20** :
  copie construite depuis le commit 9fdb844 (git archive ; les 21 patchs Cloud s'appliquent), signée sur le serveur avec
  l'image Chrome en place (61fb7ddd6e2a), orchestrateur f56c04f1fe69 inchangé (redémarré une fois).
  `update.xml` : **0.6.189.45717 → 0.6.191.45898** (`version_name` 0.6.191-cloud). Santé : 8 navigateurs.
- Copie servie relue SUR le serveur : manifeste 0.6.191, BUILD_ID `2026-11-15T17:45:58Z+9fdb844-cloud`, le bloc de
  catégorie Leboncoin attendu (0.6.191) présent ; `selftest:cloud-cadence-cron-servie` vert sur ce background.js.
- Les 8 navigateurs ont reçu la même copie (empreinte abd1fa4b6ef0c09e). 7 comptes tournent en 0.6.191.45898 dès 18:46.
  **af37fa49 reste en 0.6.189** : Chrome a posé la 0.6.191 dans son profil, mais l'extension diffère la mise à jour
  (`maj_extension_reportee` 18:46:32, « 1 republication à l'étape 'deleted' ») — sa republication **Beebs 3382b821**
  est arrêtée à « retirée » depuis le **11/11 16:51** (traitée par son PC en 0.6.186 avant son passage au Cloud ; Beebs
  n'est pas dans le coffre Cloud de ce compte) : l'annonce est hors ligne depuis 4 jours et la mise à jour attendra
  tant qu'elle n'est pas conclue. Rien touché (consigne) : à décider, voir « Reste ».
- **Preuve** : job **85113cf9-c65a-46bc-8f34-99715353f926** (compte de Nico, republication Leboncoin), handler_build
  **`2026-11-15T17:45:58Z+9fdb844-cloud · v0.6.191.45898`**, `published` (étape `recreated`) à 18:56:23.

## 3. Essai réel de la règle de prix (compte de Nico, au Cloud)
- Le geste de l'app, passé en SQL avec le jeton du compte (rôle `authenticated`, `request.jwt.claims` de f44b5917 —
  ce que fait PostgREST pour l'app ; le déclencheur a bien noté `prix_vente_change_par = app`).
- **Cobaye : « Nike Hoodie Kaki S »** (fiche 1793009407689012, Leboncoin n° 3295654983, déposée le 26/10 à 25 €, lue en
  ligne à 25 € avant l'essai). Avant : la prochaine republication serait partie à 25 € (`prix_de_l_annonce`).
  - 18:46:55 : fiche 25 → **20 €** (par `app`) ; 18:47:03 : republication « Garder » (`spend_coins_and_republish`, sans
    prix ni baisse, comme le bouton) → job **85113cf9**.
  - **En base** : `price` = **20**, `prix_decision` = `prix_de_la_fiche` (base fiche 20, annonce 25, fiche changée
    18:46:55 > annonce fixée 26/10 12:04), `republish_snapshot.prix` = 20.
  - **Sur le Cloud** : prise 18:48 (0.6.191), ancienne annonce retirée 18:50:20, nouvelle déposée 18:56:23.
  - **En ligne** (page publique Leboncoin, relue après 18:56) : **n° 3310314763 « Nike Hoodie Kaki S » à 20 €**, « aujourd'hui à
    18:56 », même rayon (Pulls / Gilets / Mailles), mêmes critères et description ; l'ancienne n° 3295654983 : « Cette
    annonce est désactivée ».
- **« Autre prix »** sur une deuxième annonce, la TEST « T-shirt femme Picture » à 999 € (fiche 1793387931852,
  n° 3302633163) : prix saisi **1 000 €** (≥ 999 €) → job **1faed316** : `price` = 1000, `prix_decision` = `prix_choisi`,
  `republish_snapshot.prix` = 1000 (le prix choisi gagne sur la fiche et l'annonce, à 999). Puis le serveur l'a retenue
  AVANT tout envoi (18:49:38, `lbc_memes_photos`) : ses 2 photos sont celles de l'annonce n° 3273048001 (« Picture Organic
  Clothing T-shirt blanc »), Leboncoin refuserait le doublon. Rien n'est parti, rien de décompté : c'est le garde-fou
  attendu. Job annulé comme le bouton « Annuler » de l'app (18:51), fiche remise à 999 €. Pas d'autre annonce essayée
  (« pas plus ») : « Autre prix » est prouvé jusqu'au job en base, pas en ligne.

## 4. Depop : d'où venait « Me connecter »
- **En une phrase** : ce n'est pas un changement récent — depuis la migration `20261009020000_depop_plateforme_base`
  (09/10, arrivée de Depop), `plateformes_verite` rangeait le relevé Depop sans accès (« accès Depop non accordé ») dans la
  règle générique « relevé absente → à connecter », donc « Me connecter » ; « Autoriser Depop » n'existait que sur une
  publication retenue, et le 13/11 (0e8dd9b) l'app a écrit « Depop à autoriser » en le testant sur un état serveur inventé.
- Preuves en base : premier relevé « accès Depop non accordé » le 13/10 ; entre le 21/10 et le 15/11, **11 comptes** ont
  tapé « Me connecter » (`vinted_sync_runs` kind `connexion`, `app:connexion`) juste après un tel relevé (21/10, 24-25/10,
  27/10 ×2, 29/10, 05/11, 07/11 — 7 fois le même soir —, 11/11 ×2, 14/11, 15/11 3c82995d). « Autoriser Depop » (publication
  retenue, `needs_user_source = depop_acces`, handler-watch depuis le 11/10) n'a jamais cessé : dernier cas le 11/11.
  Aucune définition de `plateformes_verite` n'a rendu `a_autoriser` pour Depop avant le 15/11 (relu dans les 10 migrations
  qui la définissent). Le compte 3c82995d : relevé Depop « done » le 15/11 à 17:08, après le correctif de 15:07.
- **Garde-fou ajouté** (le verrou du 15/11 ne le couvrait pas) : point 5 de `selftest:depop-acces-verite` — la règle EN
  VIGUEUR (dernière migration qui redéfinit `plateformes_verite`) garde la règle Depop avant « absente → à connecter »,
  l'action `autoriser_depop` et la trace par poste ; le texte écrit par l'extension (`background.js`) est reconnu par cette
  règle ET par l'app ; l'app reçoit l'action que le serveur produit vraiment (plus d'état inventé). Preuve : sur une copie
  avec une migration future qui réécrit `plateformes_verite` sans la règle Depop, l'ancien verrou reste **13/13 vert**, le
  nouveau donne **5 rouges** ; extension qui change son texte : 2 rouges ; code d'avant le 15/11 (b442076^) : 16 rouges ;
  HEAD : 21/21 verts. Prod relue : `plateformes_verite` md5 1808fe8a…, règle et action Depop présentes.

## Livraison
- Changé : `scripts/depop-acces-verite-selftest.mjs` (point 5), `docs/regles/plateformes.md` (règle durable), ce rapport,
  l'état de prod. Rien dans `chrome-extension/` (le zip 0.6.191 reste exact), aucune migration, aucune fonction, ni web
  ni OTA, aucun mail ni push. Seul geste en prod : la copie Cloud (§ 2) ; seules données écrites : la fiche et les deux
  jobs du compte de Nico (§ 3).
- Suite complète relancée avec le garde-fou (19:00 → 19:16) : **798/798 verts**. Lint du fichier changé : propre.

## Reste
- **Nico** : téléverser `C:\Users\nicol\fill-and-sell\build\CWS-0.6.191-A-TELEVERSER\fillsell-extension-0.6.191-cws.zip`.
- **À décider (af37fa49)** : sa republication Beebs 3382b821 est à « retirée » depuis le 11/11 16:51 (annonce hors ligne,
  jamais recréée) ; Beebs n'est pas connecté sur son Cloud, donc rien ne la conclut, et tant qu'elle reste là son
  navigateur Cloud garde la 0.6.189 (mise à jour différée par prudence). Piste à la racine, si Nico le décide : que
  get-pending-jobs compte comme « retenue » (`retenues_deleted`) une republication à « retirée » qu'il ne sert pas à CE
  poste (plateforme absente du coffre Cloud), pour que la mise à jour ne l'attende plus ; et dire au compte que son
  annonce Beebs attend d'être reconnectée.
- « Autre prix » prouvé jusqu'au job en base, pas en ligne (la seule deuxième annonce essayée a été retenue, à raison, par
  la garde « mêmes photos »).
