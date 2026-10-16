# Refonte des écrans vides et pleins — Tableau, Stock, Ventes, Stats (16/10/2026)

Mission de Nico du 16/10 : reproduire les deux maquettes qu'il a validées
(`fillsell-ecrans-vides.html`, `fillsell-ecrans-pleins.html`) avec les vrais
composants et les vraies données, corriger à la racine quatre erreurs de chiffres
vues sur son compte, et ajouter des animations « pop » au parcours d'entrée.
La refonte de la nuit du 15 au 16/10 (onboarding + états vides) est abandonnée :
rien n'en est repris, on repart de `main` (`dc77e6c`).

## Ce qui a changé à l'écran

| Écran | Avant | Après |
|---|---|---|
| Tableau vide | Texte centré sur Vinted, 4 logos | Hub animé des 5 plateformes (vrais logos) qui remontent vers FillSell puis repartent, « Tout ton stock, sur toutes tes plateformes. », Synchroniser / Ajouter, carte Lens animée, 4 tuiles animées |
| Stock vide | Deux « Ajouter un article » | Un seul (la carte du haut) ; bandeau en pointillés sans bouton ; « Ce que FillSell fait » en 4 scènes animées |
| Ventes vide | Texte Vinted/Opla, bloc d'offre avec « Restaurer mes achats » | Scène animée (vente repérée, autres annonces barrées, marge), 5 plateformes, encart Premium vert foncé |
| Stats vide | Axe à « −1 € », « -- », bouton « Actualiser » sans rien à analyser | Courbe d'aperçu qui se dessine, cartes en chargement animé, analyse IA sans bouton, CTA vers le Stock |
| Tableau plein | 4 tuiles KPI, graphes Chart.js | « Ce mois » (encaissé + nombre de ventes, « Profit à venir »), marge en anneau, revenu brut, stock en ligne par plateforme, barres de bénéfices, « Marge par mois » monotone avec hachures, activité récente par type d'événement |
| Ventes plein | 3 KPI, liste à plat dans l'ordre d'enregistrement | Encaissé / ventes / marge du mois, carte « X / Y ventes complètes » + « Compléter en série », filtres par plateforme et « Sans prix d'achat », liste groupée par mois avec total, saisie du prix d'achat dans la carte |
| Stats plein | KPI en tuiles, courbe Chart.js, Vinted deux fois | « PROFIT · période » avec courbe cumulée, marge en anneau « calculée sur X ventes sur Y », analyse IA, donut aux couleurs de l'app, ventes par plateforme + « Sans plateforme », temps pour vendre (« < 1 j »), stock en ligne, meilleures ventes, « Ça dort en stock » |
| Parcours d'entrée | — | Apparitions « pop » sur les éléments existants ; Depop ajoutée à « Où tu vends ? » (demande de Nico du 16/10 en cours de chantier) |

**Inchangés, vérifiés** : l'en-tête et la barre d'onglets (aucune ligne d'`App.jsx` qui les
porte n'est touchée ; captures prod/local identiques à l'œil — seule la transparence laisse
voir un autre contenu derrière), la carte « PROFIT NET · DEPUIS LE DÉBUT » (bloc JSX, mini-courbe
et images clés **identiques à l'octet** à `main` ; capture avant/après **identique au pixel**),
l'écran Stock avec données, la police et les couleurs de l'app.

## Les quatre corrections de chiffres (pour tous les comptes)

Toutes vivent dans `src/utils/ventesStats.js` (selftest `npm run selftest:ventes-stats`, 65
assertions) ; les écrans ne font qu'afficher.

### a) « Ventes par plateforme » affichait Vinted deux fois
- **Cause** : les écrans regroupaient sur `ventes.plateforme`, qui est un LIBELLÉ d'écran.
  `enregistrer_vente_atomique` (02/10) y écrit « Vinted », « eBay », « Ailleurs » et met le code
  (« vinted ») dans `plateforme_code` ; les autres chemins écrivent « vinted ». Même plateforme,
  deux clés. Parc : **86 comptes** ont une même plateforme sous plusieurs libellés, **1 093 ventes**
  ont un libellé différent de leur code.
- **Règle** : une vente se range par sa plateforme normalisée (`plateformeVente`, miroir de la
  fonction SQL `plateforme_normalisee`) ; le libellé corrigé par la personne prime sur
  `plateforme_code` (aucun déclencheur ne recalcule le code quand on modifie une vente).
- **Preuve (compte de Nico, 6 derniers mois)** :
  - avant (libellé brut) : `vinted` 16 ventes 348,10 € · `Vinted` 1 vente 18,00 € ;
  - après (normalisé) : `vinted` **17 ventes 366,10 €** — une seule ligne.

### b) Un prix d'achat à 0 € comptait pour 100 % de marge
- **Cause** : vide ≠ zéro (03/08) traite 0 € comme un vrai prix (« gratuit ») ; la marge en %
  valait donc 100 % et entrait dans les moyennes. Sur le compte de Nico, **10 ventes** à 0 €
  (Casio 120 €, Aspirateur 98 €, trois ventes eBay…) affichaient 100 %, d'où « Meilleure
  marge : eBay 100 % ». Parc : **1 251 ventes**, **106 comptes**.
- **Règle (Nico, 16/10)** : la marge EN % ne s'affiche et n'entre dans une moyenne que si le
  prix d'achat est **strictement positif** (`margePctVente`, `margeMoyenne`). À 0 €, la carte dit
  « prix d'achat à 0 € » sans pourcentage ; le bénéfice en euros reste compté (c'est un vrai
  bénéfice). NULL (inconnu) et 0 (saisi) restent distingués partout (`prixAchatZero` ≠
  `prixAchatConnu`). Appliqué aussi à ce qui part vers l'analyse IA.
- **Preuve** : la requête des ventes à 0 € de Nico rend 10 lignes à « 100.0 % » avant ; après,
  la marge moyenne des Stats sur 6 mois est « 69,3 % calculée sur 7 ventes sur 30 (les autres
  n'ont pas de prix d'achat, ou un prix d'achat à 0 €) » et aucun « 100,0 % » n'est affiché
  (contrôle automatique `capture-refonte-1610.mjs`).

### c) La somme des plateformes ne collait pas au revenu
- **Cause** : les lignes sans plateforme étaient écartées du bloc (`if(!p)return`). Chez Nico,
  4 ventes sans plateforme (Stratocaster 2 468 €…) pèsent 2 646,56 € sur 3 385,65 €. Parc :
  **840 ventes** sans plateforme, **71 comptes**.
- **Règle** : une ligne « Sans plateforme », toujours en dernier ; la somme des lignes = le
  revenu de la période, au centime ; une ligne « Total de la période » le montre.
- **Preuve (6 derniers mois)** : avant, Σ plateformes = **739,09 €** pour un revenu de
  **3 385,65 €** ; après, Σ = 366,10 + 194,00 + 91,00 + 73,00 + 14,99 + **2 646,56 (sans
  plateforme)** = **3 385,65 €**, 30 ventes.

### d) La liste des ventes était mal triée
- **Cause** : l'app lit les ventes par `created_at desc` (ordre d'enregistrement) et la liste
  gardait cet ordre : une vente de 2024 saisie le 10/10 passait devant août 2026. Parc :
  35 998 ventes enregistrées plus de 30 jours après leur date, 173 comptes.
- **Règle** : date de vente décroissante, puis enregistrement, puis identifiant ; sans date en
  dernier (« Date inconnue ») — `trierVentes`, appliqué une fois dans `App.jsx` à tout ce qui
  descend vers l'onglet Ventes.
- **Preuve (Nico)** : avant, rangs 1 à 8 = 04/10/2026, 02/10/2026, 13/02/2024, 13/02/2024,
  17/03/2024, 08/07/2024, 10/07/2024, 03/02/2025 ; après = 04/10, 02/10, 03/09, 26/08, 11/08,
  05/08, 31/07, 29/07/2026. Contrôle automatique : 22 mois en ordre décroissant.

Aucune donnée n'a été modifiée : les quatre corrections sont des règles de LECTURE.

## Textes vérifiés dans le code
- **Republication** : Vinted, Leboncoin, Beebs et Depop, jamais eBay
  (`utils/republication.PLATEFORMES_REPUBLIABLES`) — la phrase le dit.
- **« Tes ventes récentes remontent aussi quand tu synchronises tes boutiques »** (maquette) :
  **retirée**. Seule la synchronisation du dressing Vinted ramène des ventes passées (« ventes
  Vinted à enregistrer ») ; les relevés Leboncoin, Beebs, eBay et Depop ramènent des annonces.
- Retrait toujours « sur confirmation » ; aucun émoji (icônes SVG, vignettes de repli par
  catégorie, icône de balayage) ; vrais logos (`PlatformLogo`).
- « Restaurer mes achats » quitte l'onglet Ventes : il existe dans Réglages › Abonnement
  (`SousPageAbonnement`, téléphone, compte non Premium).

## Animations
CSS seul (`src/ecrans/animations.js`), transform/opacity sauf trois petits tracés SVG ; les
animations SMIL de la maquette sont réécrites en CSS ; les compteurs roulent chiffre par chiffre
en CSS (`Compteur`, le texte exact reste lu par les lecteurs d'écran) au lieu du compteur JS de
la maquette. Écrans pleins : entrée une fois par ouverture d'onglet (l'onglet Stats, toujours
monté, la rejoue), seul le point « live » boucle. Écrans vides : boucles douces, en pause hors
de l'écran (`Boucle`). « Réduire les animations » : aucune animation, état final affiché
(vérifié : 0 animation en cours).

## Stock en ligne (Tableau « En stock », Stats « Stock en ligne »)
Même calcul que les pastilles du Stock (`stockFiltres.etatPlateformes`). Une lecture à
l'ouverture (colonnes minimales, pages de 1 000 sur l'index `user_id, created_at desc, id desc` :
21 ms pour le plus gros compte, 2 967 lignes). ⛔ Pas de tri par `id` : mesuré, Postgres
parcourait alors la clé primaire de tous les comptes (16 893 lignes écartées pour une page).
L'onglet Stats ne lit qu'une fois ouvert.

## Vérifications
- Écrans vides : app RÉELLE en local (`npx vite --port 5217`) et en prod, compte de test
  `support+refonte.test.1610@fillsell.app`, Chromium isolé, 390 px —
  `node scripts/refonte/ecrans-vides-1610.mjs --base=… --nom=apres|avant` : aucun débordement,
  aucun émoji visible, aucune erreur.
- Écrans pleins : banc `scripts/apercu/refonte-1610.html` (vrais onglets, faux client Supabase,
  données de Nico relues en lecture seule dans `build/apercu-refonte-1610/`, jamais commitées) —
  `APERCU_PORT=5216 node scripts/apercu/capture-refonte-1610.mjs` : tout vert (débordement,
  émojis, écritures, Vinted une fois, Σ = revenu, aucun 100 %, tri, « < 1 j », Compléter en
  série, PROFIT NET identique au pixel, réduction des animations).
- Parcours d'entrée : scène `?ecran=entree` du banc (apparitions « pop » en cours puis finales).
- Selftests : voir l'état (`docs/agents/etat-2026-10-01.md`, 16/10 après-midi).

## Ce qui reste
- **OTA mobile** non envoyée (la consigne était commit + push : le web part par Vercel) ;
  procédure : `docs/agents/pieges.md` § Déploiement.
- `selftest:vinted-origine` était déjà rouge avant ce chantier (copie générée
  `chrome-extension/etat-job.js` de la nuit) : non touché.
