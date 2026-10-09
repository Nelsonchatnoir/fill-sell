# Captures de l'app pour le site vitrine — refaites le 09/10/2026 (compte « Camille », Depop)

Chantier SEO/GEO, worktree `C:\Users\nicol\fill-and-sell-seo`, branche `seo-crosslisting`
(HEAD `8fa7007`). Passage final le **2026-10-09 à 18:34-18:35** (heure de Paris). Aucun commit,
aucun push, aucun déploiement, aucun SQL, aucune connexion à fillsell.app ni à un compte. Rien
n'a été écrit dans `C:\Users\nicol\fill-and-sell`, dans `chrome-extension/` ni dans
`C:\Users\nicol\fillsell-video`. Les décisions de Nico du 09/10
(`docs/seo/etat-des-lieux/03c-decisions-nico-0910.md`) priment sur l'ancien rapport.

## 0. À retenir

- **20 images** dans `site/medias/captures/` (mêmes noms de fichiers qu'avant + une nouvelle,
  `statistiques-meilleurs-vendeurs.png`), **393 contrôles verts, 0 rouge**
  (`node scripts/apercu/site-capture.mjs`, code de sortie 0, ≈ 2 min).
- **Depop est dans 13 images**, tel que l'app le dessine (logo `DepopIcon`, noms, rayons, file,
  relevé, ventes, statistiques, popup). **Opla n'est dans aucune** (texte ET logo contrôlés).
- **Aucun chiffre de quota ni de plafond**, **aucun palier** (Pro, Premium, Business) dans une
  image ; jamais eBay sur un écran de republication.
- ⛔ **Republication automatique Depop : l'app ne la montre pas** (elle n'est pas codée, ni dans
  l'app ni au serveur, § 3). Les deux images qui portent la ligne « Republication automatique »
  disent donc « Active sur Vinted, Leboncoin et Beebs » — c'est ce que l'app dessine. Les données
  servent déjà Depop : le jour où le code existe, relancer les captures suffit (le script
  avertit tant que Depop manque). **Si la republication automatique Depop n'est pas active à la
  mise en ligne, garder la version B des textes** (`{REPUB_AUTO}` sans Depop).
- **Conditions avant de publier ces images** (D1 de la fiche) : `depop_ouvert` à 1 (ou Depop
  ouverte à tous), extension **≥ 0.6.105 servie** par le Chrome Web Store (les deux images du
  popup sont faites sur la 0.6.105, `8f88cdd`, zip prêt, non servi), **OTA ≥ 2.9.68** pour l'app
  téléphone (la 2.9.67 servie n'a pas Depop ; les captures sont au format téléphone).
- **Dates visibles** : l'horloge des captures est fixée au **vendredi 30/10/2026 17:40** (« OCT
  2026 », « 30 Oct », « 29 Oct »…) pour que « ce mois » soit un mois presque plein. Pour une
  autre date : une ligne, `HORLOGE_DEMO` dans `site-donnees-demo.js`, puis relancer.

## 1. Le compte de démonstration « Camille »

Un seul jeu, `scripts/apercu/site-donnees-demo.js`, tiré d'un générateur à **graine fixe** (les
mêmes chiffres à chaque passage) : aucun chiffre de Nico, aucun nom ni pseudo réel, aucune
adresse, aucun lien d'annonce affiché (adresses de démonstration `demo-…`).

| Ce que montrent les images | Valeur |
|---|---|
| Ventes du mois (octobre, au 30) | **62** — Vinted 31, Leboncoin 10, Depop 8, Beebs 7, eBay 6 |
| Profit du mois / chiffre d'affaires du mois | **1 268 €** / 1 901 € (panier moyen 30,66 €) |
| Six mois (mai → octobre) | 266 ventes, 7 030 € de CA, 4 819 € de profit |
| Profit par mois (croissance régulière) | 416 € → 620 € → 715 € → 850 € → 950 € → 1 268 € |
| Stock | 42 articles, 268 € immobilisés, 90 annonces en ligne (Vinted 41, Leboncoin 24, Beebs 10, eBay 5, Depop 10) |
| Partent vite | délai moyen de vente 9 j sur le mois (mode 10 j) ; les 3 meilleures marges sont restées **1 à 3 jours** en stock |
| Meilleurs vendeurs | doudoune The North Face Nuptse 55 € → 135 € en 2 j ; veste Carhartt Detroit vintage 22 € → 85 € en 1 j (Depop) ; Olympus OM-1 22 € → 79 € en 3 j (eBay) |

Pourquoi c'est crédible : prix de seconde main ordinaires (t-shirts 10-18 €, sweats 20-34 €,
baskets 35-62 €, enfant 8-30 €, quelques pièces à 75-135 €), prix d'achat tous connus (friperie,
vide-grenier, lots), un tirage pondéré qui fait la part des petites ventes, des marges de 60-75 %
typiques de la revente d'occasion, une croissance progressive, **Depop seulement depuis son
ouverture** (ventes et annonces des 19 derniers jours), Beebs pour l'enfant et le jouet. Chiffres
jamais présentés comme ceux d'un client : chaque fiche de `captures.json` porte
`description_fr` « Compte de démonstration, chiffres fictifs. Ce n'est ni le résultat d'un
client ni une promesse de gains. » (EN : "Demo account, illustrative figures…") — **dans la
description, jamais dans l'image**.

Photos : les huit photos libres `public/landing/*.webp` et `public/pata2.jpg` (dos du t-shirt
Patagonia, deuxième photo de sa fiche) — photos produit sans donnée personnelle
(`04-design-medias.md`). `pata1.jpg` est la même face que `tshirt-patagonia.webp` : pas reprise.
Il n'existe pas d'autre photo libre : les 35 autres articles du stock n'ont pas de photo et sont
tenus **hors des écrans capturés** (fiches achetées il y a 23 à 37 jours, mises en ligne depuis
1 à 13 jours : derrière les articles photographiés sur les cartes « Plus récents » comme dans
« Remonter »). Le sweat Red Bull est l'article vendu de l'histoire.

## 2. Les images

| # | Fichier | Écran | Depop | Remarque |
|---|---|---|---|---|
| 1 | `accueil-tableau-de-bord.png` | Tableau d'accueil | — | « Bonjour Camille », 4 819 € depuis le début, **1 268 € ce mois sur 62 ventes**, 7 030 € de CA, 42 en stock. Le tableau n'affiche aucune plateforme (§ 3) |
| 2 | `lens-scan-photo.png` | Lens, la photo avant l'analyse | — | inchangé sur le fond |
| 2 | `lens-analyse-photo.png` | Lens, résultat | — | taille, composition, saison lues ; l'encart « Ton annonce est prête » (« 4 plateformes » en dur) reste sous la barre d'onglets (§ 6) |
| 3 | `publication-choix-plateformes.png` | Stepper 1/3 « Où publier ? » | **oui** | cinq plateformes cochées, Depop « Connectée », « Continuer · 5 plateformes » |
| 3 | `publication-verification-annonces.png` | Stepper 2/3 | **oui** | carte DEPOP (Homme › … › T-shirts, sans titre : « — ») |
| 4 | `publication-en-lot.png` | Lot 1/3 | **oui** | Leboncoin, eBay, Depop cochées, Beebs décochée, « 9 annonces à créer », ≈ 5 min (règle de l'app) |
| 4 | `publication-en-lot-pret.png` | Lot 2/3 | **oui** | « Leboncoin · eBay · Depop », « Envoyer 9 annonces » |
| 5 | `stock-vue-ensemble.png` | Stock, haut | **oui** | pastille Depop 10 ; ligne « Republication automatique — Active sur Vinted, Leboncoin et Beebs » (§ 3) |
| 5 | `stock-cartes-multi-plateformes.png` | Stock, cartes | **oui** | Patagonia sur 5 plateformes, short sur 3 (dont Depop) |
| 6 | `synchronisation-en-cours.png` | Synchronisation | **oui** | « 3 plateformes sur 5 », « Synchronisation de Depop en cours » |
| 7 | `vente-retrait-copies.png` | Vente → retrait des copies | **oui** | vendu sur Vinted : retrait **Depop** en cours, retrait Leboncoin à venir |
| 7 | `vente-deja-vendu-question.png` | « Déjà vendu ? » | — | copie eBay liée par le seul titre → question (règle du 06/10) |
| 8 | `republication-remonter.png` | « Remonter mes annonces » | **oui** | 23 annonces, logos Depop dans la liste ; ligne automatique sans Depop (§ 3) ; aucun eBay visible |
| 8 | `republication-creneaux.png` | Créneau et jours | — | découpe (le reste de l'écran montre des plafonds) |
| 9 | `ventes-et-marges.png` | Ventes | **oui** | +1 268 €, 62 ventes ; en tête un survêtement Adidas vendu 45 € **sur Depop** |
| 9 | `statistiques-ventes-par-plateforme.png` | Stats, 1 mois | **oui** | délai par catégorie, ventes par plateforme (Depop 322 €, 8 ventes), « Meilleure marge : Depop » |
| 9 | `statistiques-meilleurs-vendeurs.png` | Stats, 1 mois (**nouvelle**) | — | « vendus en 1 à 3 jours » : 2 j, 1 j, 3 j en stock ; dessous, « Articles lents » (35-36 j) |
| 10 | `extension-popup-ordinateur.png` | Popup 0.6.105, 1280 × 800 | **oui** | cinq plateformes « Connectée » dont Depop ; Öhlins en file pour Leboncoin et Depop |
| 10 | `extension-popup.png` | Popup entier | **oui** | « En cours : Depop · publication » (casquette Volcom), « 3 en file » |
| 10 | `extension-barre-outils.png` | Barre d'outils Chrome | — | copie de `public/extension-guide/…step-6-toolbar-icon.png` (688 × 112, petite) |

Formats : téléphone 390 × 844 à l'échelle 3 (1170 × 2532), découpe 1170 × 999, popup 2560 × 1600
et 1140 × 3315. Alt FR et EN dans `captures.json` : les chiffres qu'ils citent sont **lus sur
l'écran** au moment de la capture (un chiffre absent fait échouer le passage).

## 3. Où l'app n'affiche pas Depop alors qu'elle le devrait

1. **Republication automatique (ligne du Stock, de « Remonter », écran des Réglages)** — la
   seule vraie lacune. Le faux serveur sert pourtant Depop active (`republicationAutoDemo`).
   - App : `src/hooks/useRepublicationPlanifiee.js:32` `PLATEFORMES_PLANIFIEES = ['vinted',
     'leboncoin', 'beebs', 'opla']` — l'état Depop servi est ignoré (`:199-205`, `:38-40`), donc
     `src/tabs/StockTab.jsx:5801-5803` ne passe jamais Depop à `LigneRepublicationAuto`
     (`src/stock/Haut.jsx:237-241`) ; Réglages : `src/components/RepublicationPlanifiee.jsx:57`
     (`NOMS`), `:61-66` (`GESTE`), `:84` (`REMONTE_LE_FIL`) sans Depop.
   - Serveur : `republish_planifiee_plateformes()` = vinted, leboncoin, beebs, opla
     (`20260918200100_republication_planifiee_multi_fonctions.sql:51-54`) ; pas de clé
     `republish_planifiee_pf_depop` ; `spend_coins_and_republish(…, 'auto')` refuse une
     plateforme non ouverte (`20261009020000_depop_plateforme_base.sql:2098`) ; la migration Depop
     le dit : « la republication Depop est manuelle » (`:37-38`).
   - Ce qu'il faudrait : ajouter `depop` aux deux listes (app + `republish_planifiee_plateformes`),
     aux tables `NOMS`/`GESTE`/`REMONTE_LE_FIL`, la clé `coin_config republish_planifiee_pf_depop`,
     et faire passer Depop dans le balayage (`republish-auto-sweep`). Côté captures, **rien** :
     le compte « Camille » sert déjà Depop ; relancer `node scripts/apercu/site-capture.mjs` et la
     ligne dira « Active sur Vinted, Leboncoin, Beebs et Depop » (le contrôle cesse d'avertir).
   - Palier (P1) : le code réserve encore l'automatique au Pro (`RepublicationPlanifiee.jsx:358,
     727,892`, « Réservée au plan Pro ») ; Camille est Pro pour que l'écran soit dans son état
     allumé, et aucune image ne montre de palier.
2. **Tableau d'accueil** (`src/tabs/DashboardTab.jsx`) : n'affiche **aucune** plateforme (ni
   Depop ni les autres) — l'« Activité récente » (`:563-596`) n'a pas de logo. Rien à faire côté
   données ; il faudrait un logo de plateforme par vente dans l'activité récente.
3. **Lens, encart « Ton annonce est prête »** : « Titre, description et champs pour les 4
   plateformes » **en dur** (`src/tabs/LensTab.jsx:1083-1084`, EN « 4 marketplaces ») — faux
   quand Depop est ouverte. Il faudrait compter les plateformes du compte
   (`plateformesDuCompte`). La capture garde l'encart sous la barre d'onglets.
4. **Stats, couleur de Depop** : `src/tabs/StatsTab.jsx:186` (`PLATFORM_FIXED_COLORS`) n'a pas
   Depop : sa barre prend la couleur de rang (vert `#059669`, proche du vert Vinted) au lieu du
   rouge Depop (`#FF2300`, `ListingPreviewScreen.jsx:174`). Le nom passe car le serveur écrit
   « Depop » (`20261009120000_vente_sans_preuve_annonce_en_ligne.sql:169-170`) ; une vente écrite
   avec le code `depop` s'afficherait « depop » (`src/utils/shared.js:115`, `PLATFORM_LABELS`).
5. **Ventes, écran vide** (`src/tabs/VentesTab.jsx:186-187`) : « Vinted, Leboncoin, eBay, Beebs
   ou **Opla** » — ni Depop, et Opla nommée. Pas visible sur les captures (le compte a des
   ventes), mais à corriger avant l'ouverture.
6. **Popup** : seule la **0.6.105+** connaît Depop (contexte serveur `depop.ouverte`, ou accès
   `www.depop.com` accordé, ou job Depop en file) ; la 0.6.104 servie ne la montre pas.

Ce qui affiche Depop sans rien de plus que la garde ouverte (« compte démo Camille relié à
Depop » = `rpc depop_autorise` → vrai, `coin_config depop_ouvert` = 1, `beta_flags.depop`,
relevé Depop fini, annonces et ventes Depop dans les données) : stepper, lot, stock (pastille,
cartes, « Remonter »), synchronisation, file des retraits, ventes, statistiques, popup.

## 4. Opla : absente partout, et comment

Aucune image ne la montre, et rien n'est maquillé : les harnais passent à l'app **ce qu'App.jsx
calcule après la bascule du 10/10** — `plateformesVisibles = plateformesOuvertes = ['depop']`
(`oplaFermee`, `App.jsx:2620-2635`), `oplaRelie = false` ; le popup reçoit
`contexte.opla = { relie: false, sortie_active: true }` et n'a la permission que de
`www.depop.com` → sa ligne Opla n'existe pas (`popup.js` 0.6.105, `:744-747`). Contrôlé à chaque
image : le mot « Opla » (tout le texte de la page et des cadres) et tout logo Opla (`alt`,
`aria-label`, `src`).

## 5. Contrôles (`scripts/apercu/site-capture.mjs`)

Pour chaque image : aucune erreur de page ; texte attendu présent ; aucun mot interdit (Opla,
Cloud, Nico et pseudos connus, « undefined », « NaN », « null », « aperçu », « TODO »…) ; aucun
logo Opla ; **Depop présent dans l'image** là où il est prévu (texte ou logo, 13 images) ;
**aucun chiffre de quota ni de plafond dans l'image** ; **aucun palier dans l'image** ; jamais
« 4 plateformes » ; jamais eBay sur la ligne de republication automatique ni (nom ou logo) sur
les deux écrans de republication ; le texte de l'image est lu (zone capturée, au premier plan :
`elementFromPoint`, un texte caché par une feuille ou la barre d'onglets ne compte pas) ; aucun
défilement horizontal ; images chargées ; **aucune requête** vers la base, fillsell.app ou une
plateforme ; **0 écriture** ; popup : objet `chrome` chargé, rien demandé ni ouvert, version
affichée = manifest du commit ; textes alternatifs complets. Un **avertissement** (sans échec)
nomme chaque plateforme de `PLATEFORMES_REPUBLICATION_AUTO` que la ligne de l'app ne montre pas :
2 avertissements au passage final (Depop, § 3.1).

Relecture à l'œil (outil Read) des 20 images du passage final ou du passage identique qui le
précède : nettes (Space Grotesk chargée), aucune donnée réelle, aucun texte de mise au point,
aucun Opla, Depop là où prévu. Corrigé en relisant : cartes du stock qui montraient des fiches
sans photo (dates des fiches revues), doublon de titre en stock et en vente (« Lot de 5 bodies »),
eBay visible dans « Remonter » (short retiré d'eBay), Beebs pour des vêtements adultes (lot, file,
popup), encart Lens « 4 plateformes », alt incomplets.

Robustesse : un autre terminal écrivait dans `build/site-apercu/` pendant les passages ; Vite
rechargeait alors les pages en pleine capture (un passage à blanc l'a montré). Le script coupe
désormais le rechargement à chaud (WebSocket simulée et muette). L'horloge est fixée
(`context.clock.install`), le temps s'écoule normalement à partir d'elle.

## 6. Écarts assumés (tous visibles dans le code des harnais)

- **Coquille** (`site-coquille.jsx`) recopiée d'App.jsx (App.jsx ne se monte pas sans session) :
  ni compteur « N annonces restantes », ni **pastille de palier** (`badgePalier = false`) — App.jsx
  montre une pastille Pro/Premium/Business à tous les comptes payants ; retirée pour qu'aucun
  palier ne paraisse à côté de la republication automatique.
- **Lens** : description et attributs un peu plus longs (lus sur la photo : taille, composition,
  saison) pour que l'encart « 4 plateformes » (bug § 3.3) tombe sous la barre d'onglets.
- **Stepper** : Depop cochée — l'app ne la précoche jamais (`stockFiltres.js:95`) ; c'est le geste
  de Camille.
- **Lot** : Beebs décochée (vêtements adultes), durée calculée par `dureeEstimeeMin` / `libelleDuree`.
- **« Déjà vendu ? »** garde la copie eBay (la question existe pour toute plateforme) ; Depop est
  montrée dans le retrait prouvé (image 7a).
- **Popup 0.6.105** (non servi aujourd'hui) ; `EXTENSION_COMMIT=9d442ae` refait les deux images
  sur la 0.6.106 si c'est elle qui part au Web Store.
- **Découpe des créneaux** inchangée ; la note de l'app « Le nombre exact s'affiche une fois le
  module actif » y figure (bug déjà signalé : elle s'affiche module actif).

## 7. À décider ou à savoir avant publication

1. **D2 — republication automatique Depop** : non codée (§ 3.1) → version B des textes, ou le code
   puis un nouveau passage (les images 5 et 8 nommeront alors Depop).
2. **D1** : Depop ouverte à tous, extension ≥ 0.6.105 servie, OTA ≥ 2.9.68 (captures téléphone).
3. **P1** : republication automatique réservée au Pro dans le code ; aucune image ne montre de
   palier ni « Réservée au plan Pro ».
4. **Dates** des images (fin octobre) : à garder ou à changer (`HORLOGE_DEMO`).
5. **Logos** : décision de Nico appliquée (logos tels que l'app les dessine dans les captures).
6. **Serveur, vu en passant** (non vérifié en prod, aucun SQL) : `relancer_jobs_connexion_echus()`
   nomme « Opla » tout job qui n'est ni Vinted, ni Leboncoin, ni Beebs
   (`20261009020000_depop_plateforme_base.sql:1508-1509`, `ELSE 'Opla'`) : un job **Depop** en
   attente de connexion recevrait un message « … sur Opla ». À relire en prod
   (`pg_get_functiondef`) et à corriger avant l'ouverture de Depop.
7. **Remarques sur l'app** (non corrigées, hors périmètre) : pourcentages au point (« 68.5% »,
   « 66.7% », « 74.0% ») ; « +1268,00 € ce mois » sans espace des milliers à côté de « 1 268,00 € » ;
   carte DEPOP du stepper : titre « — » et pastille « Prêt » décalée ; le bandeau de la file, au
   fond de l'image 7a, annonce le dépôt Depop de l'Öhlins pendant que la feuille montre le retrait
   en cours.

## 8. Fichiers et relance

| Fichier | Rôle |
|---|---|
| `scripts/apercu/site-donnees-demo.js` | le compte « Camille » ; `HORLOGE_DEMO`, `PLATEFORMES_DEMO`, **`PLATEFORMES_REPUBLICATION_AUTO`** (retirer `'depop'` = version B, un seul geste), `chiffresDemo`, `listeNoms` |
| `scripts/apercu/site-capture.mjs` | lance Vite (faux client Supabase), fixe l'horloge, coupe le HMR, joue les gestes, contrôle, écrit les PNG et `captures.json` ; `EXTENSION_COMMIT`, `APERCU_TEXTES=<dossier>` (texte de chaque image, pour déboguer) |
| `site-app.jsx`, `site-stock.jsx`, `site-publication.jsx`, `site-republication.jsx`, `site-extension.jsx`, `site-extension-chrome.js`, `site-coquille.jsx` | harnais (Depop ouverte, Opla fermée, horloge lue une fois au chargement) |

Relancer : `node scripts/apercu/site-capture.mjs` (≈ 2 min ; `APERCU_PORT` /
`APERCU_DEJA_LANCE=1` pour un Vite déjà servi ; des clés en argument pour n'en refaire que
certaines — `captures.json` n'est réécrit que par un passage complet). Lint propre sur les
fichiers `scripts/apercu/site-*`.

## 9. Historique

- **09/10, 16:14** — premier jeu : compte « Camille » Pro, 7 articles + 1 vendu, 22 ventes sur six
  mois (497 € de profit, 94 € dans le mois), quatre plateformes, Depop et Opla exclues, popup
  0.6.104 ; 19 images, 257 contrôles. Remplacé à la demande de Nico (décisions du 09/10 : Depop
  partout, chiffres d'un très bon mois, aucun quota ni palier).
- **09/10, 18:35** — ce jeu-ci.

## 10. Sources

- Décisions de Nico du 09/10 : `docs/seo/etat-des-lieux/03c-decisions-nico-0910.md` (D1, D2, P1,
  P5) et `03-fiche-de-verite.md` § 13 (C25-C30), § 16.
- Code lu au worktree `8fa7007` (références ligne à ligne ci-dessus) ; extension lue au commit
  `8f88cdd` (0.6.105) par `git show`, jamais dans `chrome-extension/`.
- Aucune source externe consultée pour ce travail.
