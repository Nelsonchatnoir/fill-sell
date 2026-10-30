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

1. **Téléverser l'extension 0.6.160** au Chrome Web Store : sans elle, les dépôts Leboncoin de plus de 3 photos
   continuent de partir à 3.
2. **Décider la remise à niveau** des 192 annonces Leboncoin amputées (proposition ci-dessus).
3. Pas d'essai réel dans ce lot sur une vraie annonce (Leboncoin 0.6.160, « Modifier sur eBay ») : à faire sur le
   compte de Nico (annonce à 999 € ou plus) dès la 0.6.160 posée.
