# Lot E — retours de thecloset72000 (Pro) — 30/10/2026 (heure de Paris)

Mail envoyé à la cliente le 30/10 vers 16:30 (par Nico) ; ce lot livre chaque point promis. Travail fait dans une copie
séparée du dépôt (`fill-and-sell-lot-e`, branche `lot-e/thecloset`) pendant que l'autre terminal travaille sur le Cloud ;
aucun fichier en commun hors `docs/agents/etat-2026-10-01.md`.

## 1. Leboncoin : 3 photos sur 15

**Cause prouvée.** Leboncoin sert une nouvelle page de dépôt (« Dites-nous en plus sur votre article », composant
`dynamic-deposit-input-photo-v2`) : plus de tuile « Ajouter N photos » ni de cases avant envoi, mais une zone
« Cliquez et déposez jusqu'à N photos ». L'extension ne savait pas la lire (`source: "illisible"`), et sa lecture
« stable » acceptait deux « illisible » de suite (0,7 s) → repli silencieux à 3 photos. Relevé le 30/10 sur le compte de
Nico, page ouverte puis quittée sans enregistrer (aucun dépôt) ; le code de la page dit `maxPhotos = max(gratuit,
pack)`, sans chiffre quand un pack payant existe.

**Corrigé (extension 0.6.160).** Le nombre se lit d'abord dans la page elle-même (`packPhotoConfig.basicPhotoLimit`,
monde MAIN), puis sur les libellés des deux pages ; seule une lecture chiffrée compte. Si c'est vraiment illisible et
que la fiche a plus de 3 photos : rien ne part, le dépôt est quitté sans brouillon, et l'app affiche « Leboncoin n'a
pas affiché le nombre de photos gratuites — rien n'est parti, appuie sur Relancer ». Plus jamais 3 photos en silence.

**Preuve.** Les fonctions exactes du correctif, jouées sur la vraie page (compte de Nico, 30/10 vers 17:10) : page →
20 gratuites (`basicPhotoLimit 20`, `maxPackPhotoLimit 20`, `hasFreePackPhoto true`), libellé → 20 (`libelle_v2`) ;
l'ancienne règle lisait : rien. Selftest `lbc-photos-gratuites` (nouvelle page, illisible = arrêt, lecture qui attend la
galerie, page muette → libellé).

**Chiffres (base, 30/10 vers 17:05).** Depuis le 01/10, 347 lectures « illisible » sur 26 comptes, dont **203 dépôts
amputés** (première le 20/10 à 16:42, dernière le 30/10 à 16:36), **201 partis en ligne, chez 19 comptes**, 198
articles. **192 sont encore en ligne** (19 comptes, de 92 à 1 annonce par compte), **524 photos manquantes**. Le
29/10, 138 lectures illisibles ; le 30/10, plus aucune lecture réussie : la nouvelle page est servie à tous.

**Remise à niveau : proposée, non exécutée** — `scripts/reparations/20261030_lbc_photos_amputees_PROPOSITION.sql`
(listes seulement). Proposition : quand le compte porte la 0.6.160, une republication Leboncoin de chaque annonce
(toutes les photos gratuites), marquée réparation (sans pièce ni quota), 10 par compte et par jour au plus. Variante :
une ligne dans l'app « partie avec 3 photos sur N — republier ? ». Décision de Nico (cadence).

## 2. Description personnalisée absente sur Leboncoin, Beebs et eBay

**Cause prouvée.** Sa personnalisation était la ligne `#the_closet72jeanFR44 #jean` (sa référence de stock), ajoutée
sous le texte (fiche du 30/10 : les 5 copies la portent ; elle n'est dans aucune copie rédigée par FillSell). La règle
`descriptionFidele` (26/10) retirait toute ligne de hashtags hors Vinted et Depop — même écrite par la personne.
Chemin du texte : carte → `edited[p].description` → `construireJobs` (`descriptionFidele`) → `cross_post_jobs.description`
→ vinted.js / depop.js / leboncoin.js / beebs.js (job.description) et ebay-api-worker (job.description). Aucune autre
étape ne l'a modifié (`contenu_du_vendeur` vide sur ses jobs).

**Corrigé.** Une ligne absente de toutes les copies de FillSell a été écrite par la personne : elle part telle quelle,
partout (ni état, ni genre, ni hashtags retouchés) ; le texte du vendeur aussi. Les hashtags de FillSell restent
retirés hors Vinted et Depop. Selftest `lot-refonte-c` § 4.

## 3. Ville Leboncoin

**Fait.** Réglages › Expédition : « Ville de tes annonces Leboncoin » (vide = la ville de l'adresse, comme avant).
À la publication, la carte Leboncoin montre la ville (« Montfort-le-Gesnois (72450) · ton adresse ») et « Changer »
(code postal + ville, ou « Mon adresse »). L'extension localise l'annonce à cette commune. Une republication garde la
ville de l'annonce d'origine. Selftest `lot-e-3010` § 4.

## 4. Photos par plateforme

**Fait.** Sur chaque carte (comme titre, prix, description) : une ligne « 8 photos sur 15 · Choisir » ; ouverte, les
photos qui partent (glisser pour réordonner, la 1re = couverture, × pour retirer) et celles de la fiche à ajouter, dans
la limite de la plateforme (Vinted 20, Depop 8, Beebs 10, eBay 24, Leboncoin 20 dont seules les gratuites partent).
Sans choix, rien ne change. Un choix ne réécrit jamais la fiche et n'est jamais complété par elle. Mobile d'abord, thème
de l'app. Selftest `lot-e-3010` § 4.

## 5. eBay

**a. Caractéristiques.** Avant : seuls les aspects obligatoires partaient. Désormais un aspect facultatif part quand sa
valeur est connue (fiche, analyse photo : saison, coupe, pointure, matériau, référence ; rayon pour le Département),
recalé sur la liste d'eBay ; rien de connu → rien (jamais inventé, jamais demandé). Le Département suit le rayon genré.
Selftest `lot-e-3010` § 5a.

**b. Modification après publication.** Confirmé dans le code : la voie API publie par l'Inventory API
(createOrReplaceInventoryItem → createOffer → publishOffer), et eBay interdit de modifier ces annonces dans Seller Hub.
Ses 4 publications eBay récentes sont en voie API. **Fait** : Stock › menu de l'article › « Modifier sur eBay » (titre,
description, prix) ; eBay révise l'annonce en place (même numéro, vues et favoris gardés) ; un réglage eBay inconnu →
rien n'est écrit. Selftest `lot-e-3010` § 5b (eBay simulé). Pas d'essai sur une vraie annonce eBay dans ce lot.

## 6. Vinted, matière « Denim »

**Cause prouvée.** Le jean (fiche 1793359672203) : matière « denim » venue de l'analyse photo (`source: lens`), aucune
composition lue (`attributs_visibles` = la coupe seulement). L'analyse identifiait la matière « à partir des indices
visuels », la rédaction la recopiait sur toutes les plateformes.

**Corrigé.** Analyse photo : la matière d'un vêtement vient seulement d'une étiquette de composition lue (copiée avec ses
pourcentages), sinon rien. Rédaction : jamais déduite du type d'article. Une composition part en matières dans l'ordre de
l'étiquette : Vinted les coche (3 au plus, 0.6.160), Leboncoin, Beebs, Opla et eBay prennent la première. Depop
n'envoie pas de matière (inchangé). Leboncoin peut garder la matière qu'il pré-remplit lui-même quand FillSell n'en a pas.

## 7. Depop, jean femme rangé en homme

**Cause prouvée.** Même jean : titre « Lee Taille (14) FR 44 **Femme** Jean… », mais `genre = "Homme"` sur Vinted, eBay,
Beebs et Depop (la rédaction « tranche toujours » le genre). FillSell a proposé Hommes > Jeans sur les 4 plateformes
(`categorie_par_mot`) ; elle a corrigé les 4 rayons à la main (`choix_humain`). Le moteur Depop comptait le genre deviné
« Homme » comme un indice : avec « Femme » du titre, « les deux » → Homme proposé, garde désarmée. eBay envoyait en plus
le Département du genre (« Homme ») sur un rayon Femme.

**Corrigé, toutes plateformes.** Un genre écrit dans le titre (puis la description) remplace un genre deviné contraire,
avant tout calcul de rayon ; Depop ne compte plus le genre deviné contre le texte ; eBay prend le Département du rayon.
Selftest `lot-e-3010` § 7.

## Tests

Selftest neuf `selftest:lot-e-3010` ; selftests ajustés `lbc-photos-gratuites`, `lot-refonte-c`, `lens-photos-fiche`,
`prevol-recreation-lbc-depop`, `lbc-forfait-pro` (ils exigeaient l'ancien code mot pour mot). **Suite complète 499 /
0 rouge** (seconde passe sur l'état final, 30/10). En première passe, quatre rouges (`opla-catalogue`, `opla-prevol`,
`ventes-prouvees`, `mail-apres-vente`) venaient de la copie séparée : Git y extrait les fichiers en fins de ligne
Windows ; remis en LF comme le dossier principal, verts. Écrans neufs vus à 390 px (banc d'essai, faux client, aucune
connexion) : carte Depop « 8 photos sur 15 », carte Leboncoin ouverte (poignées, couverture, retrait, ville), feuille
« Modifier sur eBay ».

## Déploiement (30/10, ordre de Nico)

Fonctions, `verify_jwt` lu avant et après (inchangé) : ebay-account v23 → **v24** (vrai), lens-analysis v115 → **v116**
(vrai), generate-listing v127 → **v128** (vrai), ebay-api-worker v101 → **v102** (faux), handler-watch v149 → **v150**
(faux), get-pending-jobs v305 → **v306** (vrai), de 17:28 à 17:29. Web : au push. Extension 0.6.160 et OTA 2.9.138 :
voir la fin de `docs/agents/etat-2026-10-01.md`.

## Ce qui reste

1. ~~Téléverser l'extension 0.6.160~~ — remplacée par la **0.6.161** (§ Finition) : sans elle, les dépôts Leboncoin
   de plus de 3 photos continuent de partir à 3.
2. ~~Décider la remise à niveau des 192 annonces~~ — décision de Nico : la ligne « Republier avec toutes tes photos »
   (§ Finition, A1).
3. ~~Essai réel~~ — fait le 30/10 soir (§ Finition, partie B).

## Finition (30/10 soir) — tout prouvé en réel, extension 0.6.161

La 0.6.160 n'a jamais été téléversée ; la 0.6.161 la remplace (zip seul dans son dossier, voir l'état de prod). Copie
séparée `fill-and-sell-lot-e`, branche `lot-e/thecloset` ; rien du Cloud touché. Urgence Louis : rapport à part
`docs/enquetes/louis-lbc-restreint-3010/RAPPORT.md`.

### Partie A — causes et règles

- **A1, annonces Leboncoin parties avec moins de photos** : ligne « Cette annonce est partie avec moins de photos que
  prévu. Republier avec toutes tes photos ? » dans la fenêtre de retrait du Stock (`RemovePlatformsModal`), fonction
  `republier-photos-lbc` (v1, verify_jwt vrai) : un geste, une à la fois par compte, sans pièce ni quota, visible avec
  une extension qui lit la nouvelle page (build ≥ 16:30:40Z), jamais pendant un blocage Leboncoin.
- **A2, « Étape de republication inconnue : recreated »** (Johan, 3 Leboncoin) : l'extension ne connaissait pas l'étape
  « recreated » sans numéro. Règle : l'extension la remet en attente, le serveur tranche par les relevés (annonce
  recréée vue → clôture ; ancienne disparue et rien vu → reprise sans doublon, Leboncoin et Beebs). Parc traité au
  déploiement : fanion Johan clos (annonce 3298266722 vue ailleurs), casquette et jean repris, Vinted de linda clos
  (10542669657). ⚠️ La première version a aussi repris une republication Beebs ÉCHOUÉE de XEWER (refus de vérification
  34140079) → redéposée (34267671) à 19:48 sans geste ; corrigé et redéployé dans l'heure (seules `pending` /
  `needs_user`, jamais un refus de vérification Beebs).
- **A3, Sébastien, montre « Taille unique » refusée** : nouvel arbre Vinted « Accessoires de mode › Montres » — la Taille
  n'apparaît qu'après « Pour qui ? ». L'extension pose « Pour qui ? » avant la taille ; relance après mise à jour
  (`vinted_accessoires_pour_qui_taille`). Parc : seule la tâche de Sébastien.
- **A4, PAUGUES, Juliette, Jocabroc « absente des relevés »** : trois PUBLICATIONS (27 et 28/10), pages publiques
  « désactivée ». Juliette : `adsubmit` 2xx puis canal coupé, dépôt jamais finalisé → règle 0.6.161 (publié seulement
  sur la page de confirmation ou l'annonce). PAUGUES et Jocabroc : confirmation vue, puis l'annonce n'est jamais en
  ligne. **Mécanisme prouvé le 30/10 sur le compte de Nico** : Leboncoin refuse automatiquement, à la seconde du
  dépôt, une annonce « similaire à une annonce déjà en ligne » (mail « refusée » à 20:21:14, page de confirmation
  pourtant affichée) ; un refus n'apparaît ni dans le tableau de bord de Leboncoin ni sur la page « Corriger ». Pour
  PAUGUES et Jocabroc, aucun doublon dans FillSell ni dans leurs relevés : le motif exact est dans le mail de Leboncoin
  reçu par chacun. **Proposition (migration, feu vert de Nico)** : le message « Leboncoin n'a donné aucun motif »
  devient « Leboncoin a sans doute refusé l'annonce juste après le dépôt ; son motif est dans le mail « Votre annonce
  a été refusée » qu'il t'a envoyé ».
- **A5, Amiral (Brave)** : tous les messages « dans Chrome » nomment le navigateur réel du poste (`nommerLeNavigateur`).
- **A6, DBZ70, sous-rayons « Accessoires de mode »** : arbre Vinted servi à certains comptes (5496, 14 sous-rayons)
  ajouté au moteur de rayon du serveur ; les 6 tâches partent seules.

### Partie B — essais réels (compte de Nico, annonces à 999 €)

| Essai | Annonce | Preuve |
|---|---|---|
| B1 Leboncoin ≥ 12 photos | 3298675759 (veste, 30/10 22:22) | « active », 12 photos sur la page (`nb_images` 12), 20 gratuites lues sur la page, mail « est en ligne » |
| B2 ville choisie | 3298675759 | Lyon 69001 sur la page (réglage : autre adresse) |
| B3 « illisible → rien ne part » ne bloque pas | 3298675759 | lecture `page_lbc`, dépôt passé |
| B4 photos choisies / réordonnées | Depop nelsolchatnoir-…-7a44 ; Beebs 34268419 | Depop : ordre en ligne exact (couverture comprise), comparaison image par image (écart ≤ 3,6 contre ≥ 33) ; Beebs : couverture = image 2 (écart 0,0) ; job envoyé dans l'ordre choisi [2,3,4,5,6,7,8,10,1] ; ordre complet en ligne lisible à la validation par l'équipe Beebs (en vérification à 22:43) |
| B5 description de la personne avec hashtags | Leboncoin 3298675759, eBay 820297268148, Beebs 34268419 | texte en ligne identique, hashtags compris ; la note de l'app « les hashtags ne partent que sur Vinted et Depop » ne s'affiche plus sur le texte de la personne |
| B6 eBay matière + saison | 820297546667 | « Matière : Coton biologique », « Saison : Été » en ligne (saison posée dans les lectures de la fiche pour l'essai : aucune étiquette ne la portait) ; « Modifier sur eBay » : 820297268148, même numéro, titre, prix, description changés |
| B7 « Femme » + étiquette lisible | Vinted 10599861522 ; Depop nelsonchatnpir-…-b3f7 | Vinted : Femmes › T-shirts, Matière Coton ; Depop : genre « female », matière ABSENTE → corrigé (extension + app, format relevé sur le formulaire de Depop), essai refait après déploiement (§ Après le déploiement) |
| B8 publier / republier | publier : Vinted, Leboncoin, Beebs, Depop, eBay ci-dessus ; republier : Vinted 10599796049 → **10601153940**, Depop …-7a44 → **…-d82a** | Vinted : ancienne « Page not found », nouvelle en ligne à 999 € (22:31) ; Depop : ancienne 404, nouvelle « on sale », 7 photos (22:38) ; Leboncoin 3298675759 en file (cadence 15 min, planifiée — intouchable) ; Beebs à la validation ; eBay : pas de republication dans FillSell (choix d'origine) |

**Essais ratés puis refaits.** Premier B1 (3298588291) refusé par Leboncoin (doublon de deux annonces en ligne, voir
A4) ; premier Beebs (34267794) retiré de la vérification (mêmes photos) ; Depop sans matière (`attributes: {}`) →
corrigé (extension + app), essai refait.

### Après le déploiement (30/10, 23:20)

- Fonctions : get-pending-jobs v310, handler-watch v153, update-job-status v160, ops-digest v45, republier-photos-lbc
  v1 — verify_jwt inchangé. OTA 2.9.139. Zip 0.6.161 seul dans
  `C:\Users\nicol\fill-and-sell\build\CWS-0.6.161-A-TELEVERSER\`.
- **Push refusé par le classifieur de Claude Code** (4 essais, dont trois sur ordre de Nico) : le web n'a pas les
  changements de l'app ; **B7 Depop (matière) ne peut être refait qu'après le push** (la matière est calculée par
  l'app). L'extension et l'OTA ont le code final.
- Nettoyage par l'app : 7 retraits faits (Vinted, eBay, Depop des fiches 1 et 2, Leboncoin 3298697519) ; ligne
  Leboncoin refusée « oubliée » ; Beebs 34268419 en vérification chez Beebs (à retirer après validation).
- Republication Leboncoin : la tâche s'est figée 15 min après le retrait de l'ancienne annonce (onglet de travail
  en chargement), puis la règle d'interruption l'a reprise à la bonne étape (« retirée ») : recréée sans doublon.
