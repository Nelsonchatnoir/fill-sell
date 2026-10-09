# Site vitrine FillSell — design et gabarits (09/10/2026)

> Branche `seo-crosslisting`, worktree `C:\Users\nicol\fill-and-sell-seo`. Rien n'est
> commité, rien n'est poussé, rien n'est déployé. Contrat du contenu :
> `docs/seo/FORMAT-CONTENU.md` ; mode d'emploi : `site/README.md` ; architecture :
> `docs/agents/site-vitrine.md`. Les pages actuelles sont des **pages de
> démonstration** (`demonstration: true`, bandeau jaune visible) : elles
> montrent chaque gabarit, elles ne sont pas le contenu final. Elles sont
> servies en `index, follow` comme le seront les vraies pages (le gabarit ne
> les distingue pas) : la PRODUCTION les refuse (`VERCEL_ENV=production`, ou
> un build local sur `main`), et une prévisualisation Vercel ajoute son propre
> en-tête `noindex` — seul un aperçu public non protégé les exposerait
> (revue technique M-10 : ce document disait `noindex`, le code non).
> Corrections de la revue technique du 09/10 soir, mesures avant / après : § 9.

## 1. Le parti pris

**Sujet** : un outil pour revendeurs particuliers et petits pros de la seconde main
(Vinted d'abord, puis Leboncoin, eBay, Beebs, Depop). **Lecteur** : quelqu'un qui
publie déjà à la main sur une ou deux plateformes et qui a peur de la double
vente. **Travail de la page** : lui faire VOIR, en dix secondes, une photo devenir
une annonce en ligne partout, puis l'article vendu et les autres annonces
retirées — et lui donner le bouton pour essayer.

**Le moment mémorable — un seul** : la *scène* du héros. Le téléphone (vraie
capture de l'app) est entouré de trois « fiches » posées comme des étiquettes de
fripe : « Annonce prête », la liste des plateformes qui passent une à une à
« En ligne » (animation orchestrée, une seule sur tout le site, coupée par
`prefers-reduced-motion`), puis « Vendu sur Vinted — les autres annonces de
l'article sont retirées ». Tout le reste du site est calme : texte, captures
réelles, tableaux sourcés.

**Matière** : la boutique de seconde main — la toile (fond lin), l'étiquette
cartonnée (fiches à coins arrondis, trou d'étiquette pêche), l'encre verte du
ticket. Le teal de l'app (#2F9E90 / menthe #4ECDC4) reste la couleur de la
marque, jamais un dégradé décoratif sur toute une section.

### Revue contre les choix par défaut (faite avant d'écrire le code)

| Défaut évité | Ce qui a été choisi à la place, et pourquoi |
|---|---|
| Fond crème + serif + terracotta | Toile lin #EDEAE0 MAIS encre vert nuit, teal de marque, une seule touche pêche (trou d'étiquette, halo) ; aucune serif : la Space Grotesk de l'app, mêmes formes de chiffres que les prix affichés dans l'app. |
| Gros chiffre + petit libellé + dégradé | Aucune statistique en héros (aucun chiffre non sourcé) ; le héros montre le PRODUIT (capture) et le geste (scène). |
| Cartes SaaS identiques partout | Trois familles de surfaces, chacune avec son sens : fiche-étiquette (scène, étapes), carte de données (comparaison, tarifs), sections sombres vert nuit pour les moments de décision (appel final, palier mis en avant). Rayons différenciés (46 px téléphone, 22 px carte, 16 px fiche, 999 px pastille). |
| Surtitre en capitales au-dessus de chaque titre | Surtitres en casse de phrase, seulement là où ils situent (type de page, fil d'Ariane) ; jamais de capitales espacées. |
| Numérotation décorative 01/02/03 | Numéros SEULEMENT sur les vraies séquences (étapes de « Comment ça marche », trajets) ; les fonctions et les capacités ne sont pas numérotées. |
| « → » dans chaque lien, points médians | Libellés d'action nus (« Créer mon compte », « Voir les tarifs ») ; listes en phrases. |
| Logos de plateformes en bandeau | Interdit (aucune affiliation) : noms en TEXTE, étiquettes neutres ; seuls logos : FillSell et les badges officiels des stores. |

## 2. Jetons

Noms courts (la feuille est servie EN LIGNE dans chaque page) — détail et
contrastes en tête de `site/styles/site.css`.

| Jeton | Valeur | Rôle |
|---|---|---|
| `--to` toile | #EDEAE0 | fond de page |
| `--pa` papier | #F6F5F1 | sections alternées, cellules |
| `--en` encre | #10201B | texte |
| `--nu` vert nuit | #10302B | sections sombres (appel final, palier mis en avant, pied) |
| `--sa` teal | #2F9E90 | décor (pastilles, traits) — jamais en petit texte sur clair |
| `--sf` teal profond | #1B6E62 | liens, boutons, texte teal (5,05:1 sur toile) |
| `--cd` | #238478 | début du dégradé des CTA (blanc ≥ 4,5:1) |
| `--me` / `--mp` | #4ECDC4 / #C6F5EF | menthe : accent sur sombre / fond doux |
| `--pe` pêche | #E8956D | touche chaude : anneau des surtitres et des étiquettes, filet des citations, badge « Notre conseil » |
| `--gr` / `--gc` | #5C6560 / #6E695D | texte secondaire / discret |
| `--ss` / `--s2` | #F6F5F1 / #BFCBC6 | texte sur sombre / secondaire sur sombre |
| `--gt` / `--st` | #4D5752 / #195E54 | gris et teal de TÊTE : dans le héros et les têtes de page, ils remplacent `--gr` et `--sf` (chapô, fil d'Ariane, dates, surtitre, liens, bouton contour), posés sur les halos |
| `--ht` / `--hp` | teal 26 % / pêche 24 % | halos du héros et des têtes (couleurs à alpha) |
| `--at` / `--ap` | teal 65 % / pêche 50 % | coins de l'appel final (avant : 75 % / 62 %) |
| `--hm` | menthe 30 % | halo du bouton « Lire » |

Rôles (`--bouton-*`, `--lien*`, `--focus*`) : les PAIRES de contraste sont
vérifiées à chaque build (`PAIRES_CONTRASTE`, `scripts/site/verify-site.mjs`) —
changer une couleur, c'est relancer `npm run site:apercu`. Depuis le 09/10 soir,
le contrôle compose aussi les fonds MÊLÉS au plus fort (une paire peut nommer
`[couleur à alpha, fond]`) : chapô et surtitre au cœur des halos, numéros
d'étapes à la tête du dégradé sombre (`--sf`), texte de l'appel final au cœur de
ses coins teal et pêche, anneau du bouton « Lire ».

**Typographie** : une seule famille, Space Grotesk (variable 300–700, latin,
auto-hébergée, préchargée, `font-display: swap`) + repli métrique `SG Repli`
(Arial ajusté : aucun saut de mise en page au chargement). Échelle fluide
`clamp()` ; titres en 700 très serrés (-0,045 em en h1, -0,035 em en h2), corps
17 px / 1,6, colonne de lecture 720 px (~75 caractères), chapôs 36 em,
`text-wrap: balance` sur les titres et `pretty` sur les chapôs. Typographie
française appliquée au build (`typographie()` : espace insécable avant « : ; ! ? »
et après « « ») ; les guillemets droits sont refusés au contrôle du contenu.

**Mise en page** : mobile d'abord (390 px), ruptures 560 / 760 / 1000 / 1080 /
1180 px ; texte aligné à gauche partout sauf l'appel final (centré, un seul
message) ; gouttière 18 px ; sections rythmées par `--sec` (56 → 112 px).

## 3. Composants (site/gabarits/)

| Composant | Où | Notes |
|---|---|---|
| En-tête collant | toutes | logo, navigation (Comment ça marche, Plateformes ▸ sous-menu `<details>` qui marche SANS JS, fermé quand le focus le quitte, Comparatif, Tarifs, Blog, FAQ), langue (« EN », nom accessible « EN — English »), Se connecter, CTA ; mobile : bouton de menu accessible (`aria-expanded`, Échap, focus rendu). **Ordre du DOM = ordre visuel** : logo, CTA « téléphone », bouton, PUIS le panneau `<nav>` (ouvert, le Tab suivant entre dans le menu ; le focus qui en sort le ferme) ; sur ordinateur, le CTA vit en fin de `<nav>` (`entete-cta-large`), un seul des deux affiché. Barres du bouton en bordures (visibles en contraste élevé) |
| Héros + scène | accueil | capture dans un cadre de téléphone en CSS, trois fiches (`aria-hidden`, le texte vrai est dans le chapô), badges App Store (noir, officiel) et Google Play auto-hébergés, lien Chrome Web Store ; texte en `--gt` / `--st` sur les halos |
| Bandeau des plateformes | accueil | noms en texte, depuis `plateformes.yml` (Depop incluse) |
| Points clés | tous les types | « L'essentiel en 10 secondes » |
| Étapes | guide, trajet, accueil | avec captures (`etapes-medias`) ou en liste (`etapes-liste`) ; JSON-LD HowTo ; numéros en `--ss` en section sombre ; le carrousel n'est un arrêt de Tab que s'il défile |
| Cartes de fonctions | accueil, fonction | capture + phrase + lien |
| Tableau comparatif | accueil (court), comparatif, alternative, classement | cartes sur mobile, tableau sur ordinateur, colonne FillSell surlignée, verdicts oui / partiel / non / sans objet, sources en petit, « Relevé le … » ; faits tiers marqués `data-tiers` ; texte dans la langue de la page quand la donnée l'a (`{ fr, en }`), sinon français marqué `lang="fr"` ; arrêt de Tab seulement s'il défile |
| Bloc « FillSell est notre produit » | comparatif, alternative, classement | avertissement + bloc « méthode » |
| Podium + grille | classement | note écrite (« 89/100 ») ; `<meter>` et rang décoratifs (`aria-hidden` : la liste ordonnée dit déjà le rang) ; ItemList |
| Lecteur vidéo | accueil | affiche en IMAGE PARESSEUSE derrière une vidéo transparente (l'attribut `poster` partait au chargement, même hors écran), lecture au clic (le focus passe à la vidéo), anneau CLAIR sur liseré sombre pour le bouton « Lire », AV1 / VP9 / MP4, `preload="none"`, transcription par chapitre (liste focalisable si elle défile) ; VideoObject ; HORS empreinte des dates (la vidéo a sa date) ; poids des fichiers contrôlé contre `video.json` ; règles `forced-colors` (affiche et triangle visibles) |
| Cartes de tarifs | tarifs, accueil | prix par mois, inclusions SANS chiffre de quota, palier Pro mis en avant |
| Capacités | plateforme | grille de ce que FillSell fait sur la plateforme (eBay : jamais de ligne « republication »), tuile pays |
| Capture en cadre | tête, prose, vidéo | téléphone, fenêtre ou carte ; `sizes` alignés sur la CSS (`TAILLES_TELEPHONE`, `composants.mjs`) ; légende en pastille de la couleur de la section, AU-DESSUS de l'ombre portée du téléphone |
| Tableau Markdown | prose | région qui défile, nommée par le titre qui précède ; coin d'en-tête vide = en-têtes de ligne (`th scope="row"`) ; ligne d'en-tête toute vide retirée ; arrêt de Tab seulement s'il défile |
| Bloc de code | prose | `pre.bloc-code` (module `code`) : défile dans sa boîte, jamais la page |
| FAQ | accueil, faq, tous | `<details>` + FAQPage |
| Sommaire collant, fil d'Ariane, auteur / dates | guide, fonction, article, comparatif | BreadcrumbList sur toutes les pages sauf l'accueil |
| Index des termes | glossaire | `### Terme` → DefinedTermSet ; titre de section masqué (ordre des titres) |
| Appel final | toutes | section vert nuit, un message, un bouton |
| Pied | toutes | colonnes par type, phrase de non-affiliation, périmètre |
| Bandeau de démonstration | pages `demonstration: true` | visible, jamais en production réelle |

## 4. CSS : socle, modules, budgets

- `site/styles/site.css` = SOCLE (tout ce qui précède le premier `@module`,
  13,8 Ko minifié) + modules `/* @module nom : classes */` : scene, etapes,
  code, etapes-liste, fonctions, video, comparaison, tarifs, contenu, capacites,
  comparatif, classement, glossaire, introuvable, bandeaux (`@js` : injecté par
  site.js, jamais en ligne), tete, liees, cadres, defile.
- Une page n'embarque que les modules dont elle porte une classe
  (`scripts/site/lib/bundles.mjs`). **Budget 24 Ko de CSS par page** (relevé de
  20 Ko : l'accueil porte 9 modules), **80 Ko de HTML**, site.js ≤ 6 Ko gzip.
  Mesuré le 09/10 soir, après la revue technique : accueil CSS **24 180 o /
  24 576** (marge 396 o ; 23 422 avant), HTML **79 769 o / 81 920** (marge
  2,1 Ko ; 78 537 avant — la transcription de la nouvelle vidéo en prend
  ~100 o, le CTA dédoublé de l'en-tête ~150 o) ; site.js 3 727 o gzip (3 314
  avant). ⚠️ Marges minces avec un contenu de démonstration (revue M-14) : le
  vrai contenu de l'accueil se mesure avant la fusion.
  **Mesuré avec la rédaction réelle (09/10 nuit)** : accueil FR et EN 25 638 o
  de CSS (modules en plus : pages liées, tableau, capture en fenêtre) et 98 à
  101 Ko de HTML ; pages longues jusqu'à 105 Ko (classement, 6 600 mots ;
  24 Ko en brotli). Budgets relevés à **26 Ko de CSS** et **120 Ko de HTML**
  par page (`bundles.mjs`, `verify-site.mjs`) — à confirmer par Nico.
- `content-visibility: auto` sur les sections hors écran (jamais sur le pied ni
  l'appel final : la mesure de contraste d'axe les lisait vides).
- Images : `<picture>` AVIF + repli WebP (480 / 720 / 960 / 1440), `sizes`
  ALIGNÉS sur la largeur que la CSS donne à l'image (cadre moins ses bords) :
  sur mobile, le 480 part partout (le 720 partait en tête de page,
  30 Kio de trop sur `/fonctions/lens`, 23 sur `/plateformes/vinted`). Pas de
  `<source>` WebP dans les gabarits : tous les navigateurs servis lisent
  l'AVIF, et 11 `<source>` de plus coûteraient ~3 Ko au budget HTML de
  l'accueil ; pas de variante 320 (à 1,75× et plus, le 480 est le plus petit
  utile).
- Aucun `style=` dans les gabarits, zéro dépendance ajoutée.

## 5. Cartes de partage (OG)

`npm run site:og` (Playwright, Chrome installé) : une carte 1200×630 par page et
par langue, `site/medias/og/<lang>/<id>.png|jpg` (le plus léger des deux, ≤ 120 Ko),
manifeste d'empreintes (`VERSION_GABARIT_OG`) : une carte n'est refaite que si
son titre, sa langue ou le gabarit changent. Le build local REFUSE une carte
manquante ou périmée ; Vercel n'en fait qu'un avertissement.

## 6. Captures (docs/seo/design/captures/)

Pleine page, 390×844 (×2) et 1440×900 (×1), consentement déjà refusé, balises
tierces coupées, `content-visibility` neutralisé pour la capture seulement,
**prises par tronçons recollés** : au-delà de 16 384 px de haut (limite de
texture de Chrome, atteinte par l'accueil et le classement en ×2), une capture
d'un seul tenant RÉPÈTE le haut de la page — c'était le cas des captures
mobiles longues jusqu'au 09/10 soir. Refaites le 09/10 à 21 h, après la revue :
`accueil-fr`, `accueil-en`, `guide`, `trajet`, `plateforme`, `fonction`,
`comparatif`, `alternative`, `classement`, `tarifs`, `glossaire`, `faq`,
`article`, `liste`, `404` — `<nom>-390.jpg` et `<nom>-1440.jpg`.

## 7. Lighthouse (mobile, 12.8.2, serveur d'aperçu compressé comme Vercel)

Balises tierces COUPÉES (GTM, gtag AW, Insights) — ce que le gabarit coûte.
**Avant** = sortie de 19:34 figée par la revue technique, **après** = sortie
corrigée du 09/10 à 21 h ; les deux repassées le même soir sur le même poste
(scores perf. / accessibilité / bonnes pratiques / SEO, LCP simulé, poids
transféré). Rapports : scratchpad de la session, `corr-0910/lh-avant/`,
`lh-final/`.

| Page (type) | Avant | LCP | Poids | Après | LCP | Poids |
|---|---|---|---|---|---|---|
| `/` (accueil FR), deux passes | 95 / 100 / 100 / 100 | 2,9 s | 253 Kio | **99** / 100 / 100 / 100 (×2) | **2,1 s** | **122 Kio** |
| `/en` (accueil EN) | 95 / 100 / 100 / **92** | 2,9 s | 250 Kio | **99** / 100 / 100 / **100** | 2,1 s | 120 Kio |
| `/crosslisting/vinted-beebs` (trajet) | 98 / 100 / 100 / 100 (td-has-header ✗) | 2,4 s | 197 Kio | **100** / 100 / 100 / 100 | 1,5 s | 66 Kio |
| `/comparatif/fillsell-vs-stoflow` (comparatif) | 98 / 100 / 100 / 100 | 2,4 s | 199 Kio | **100** / 100 / 100 / 100 | 1,5 s | 68 Kio |
| `/blog/comment-calculer-profits-vinted` (article) | 98 / 100 / 100 / 100 | 2,3 s | 196 Kio | **100** / 100 / 100 / 100 | 1,5 s | 65 Kio |
| `/fonctions/lens` (fonction) | 96¹ | 2,8 s¹ | 253 Kio¹ | **100** / 100 / 100 / 100 | 1,8 s | 105 Kio |
| `/plateformes/vinted` (plateforme) | 97¹ | 2,6 s¹ | 233 Kio¹ | **100** / 100 / 100 / 100 | 1,7 s | 89 Kio |
| `/comparatif/meilleures-applications-crosslisting` (classement) | 98¹ | 2,5 s¹ | 199 Kio¹ | **100** / 100 / 100 / 100 | 1,5 s | 68 Kio |

¹ chiffres de la revue technique (même sortie de 19:34), non repassés.

CLS 0 et TBT 0 ms partout. Ce qui fait le saut : les deux icônes de l'app
(`favicon.ico` 113 → 7,9 Ko, `icon-192x192.png` 46 → 16 Ko, § 9 C-5) — elles
partaient en priorité haute avant le LCP simulé ; puis les `sizes` alignés
(fonction et plateforme : le 480 au lieu du 720, l'audit « images mal
dimensionnées » passe de 30 et 23 Kio à 0). Le LCP observé (sans
ralentissement) reste le chapô, peint au premier affichage. Seul audit encore
sous 0,9 : « images mal dimensionnées » à 5 Kio sur `/fonctions/lens`, le
badge Google Play OFFICIEL (jamais retouché).

Avec les balises tierces de production (copiées d'index.html, parité vérifiée
par `site:verifier`) : non remesuré ce soir (une mesure locale enverrait des
visites de 127.0.0.1 à GTM et Google Ads) ; références du designer : accueil 78
(57 et 83 plus tôt), plateforme 66 ; TBT 270 à 1 340 ms, tout venant de GTM et
de gtag. Le gabarit n'y peut rien sans décision : charger GTM après
interaction ou en différé changerait la mesure publicitaire.

## 8. Ouvert

- **Icônes de l'app recompressées dans `public/`** (§ 9 C-5) : touchent l'app
  (deux fichiers binaires, mêmes URL, rendu identique mesuré), à CONFIRMER par
  Nico ; retour : `git checkout -- public/favicon.ico public/icon-192x192.png`.
- **Blog** : relu ou non par les décisions de Nico avant la fusion ? Six
  avertissements du vérificateur aujourd'hui (« automatisable avec le plan Pro »
  dans `/blog/cross-listing-vinted-leboncoin`, cinq listes « Vinted,
  Leboncoin, eBay et Beebs » sans Depop) ; l'article
  `/blog/cross-listing-vinted-leboncoin` affiche aussi `og-image-fillsell.png`
  (faux logos de plateformes, faux badge App Store — brief 04 § 0.4) dans son
  corps, et `/blog/comment-calculer-profits-vinted` des astérisques littéraux
  dans ses formules (« **293 %** »). Contenu de `src/blog/`, partagé avec l'app.
- **Articles jumeaux** `comment-calculer-profits-vinted` /
  `how-to-calculate-reselling-profits` : pas de `translation` posé (revue M-13)
  — ce ne sont pas encore des traductions l'un de l'autre (guide Vinted d'un
  côté, article général de l'autre) ; les relier par hreflang se fait avec leur
  réécriture en jumeaux (PLAN.md), qui touchera de toute façon `src/blog/`.
- **Concurrents en anglais** : le format accepte `{ fr, en }` (FORMAT-CONTENU
  § 4) mais le brief n'a encore aucune valeur anglaise — les comparatifs `/en`
  affichent le français, marqué `lang="fr"`. Dans la ligne FillSell, l'import
  retire désormais « à tous les paliers » et le renvoi interne « voir
  plateformes_auto » ; le reste de la ligne (« chaque scan compte dans le forfait
  du mois », « sans quota ») est à relire avec le brief.
- **Chapô de l'accueil (démonstration)** : « FillSell transforme une photo en
  annonce prête et la publie… » — il est maintenant aussi la description de
  l'application dans le JSON-LD (§ 9 C-7) ; le vrai chapô devra dire que c'est
  l'extension qui publie (lexique § 15 : jamais « FillSell publie pour toi »).
- **Classement** : les sections grille, variantes et « hors classement » restent
  `data-tiers` (hors lexique, revue M-15) : la grille est un barème qui nomme
  forcément des paliers (« automatique : 4 dès l'entrée ; 3 au palier ≥ 29 € »),
  et le reste décrit les concurrents. Angle mort assumé, à relire à la main.
- **Tarifs** : libellés des inclusions et badge « Notre conseil » sur Pro à
  valider par Nico.
- **Balises tierces** : GTM + gtag AW font perdre 20 à 45 points de performance
  (§ 7) ; les charger après interaction est une décision de mesure, pas de design.
- **Pages de démonstration** : à remplacer par le vrai contenu avant main ; les
  pages EN renvoient vers des pages de fonction FR (pas encore traduites).

## 9. Revue technique du 09/10 soir — ce qui a été corrigé, et la preuve

Revue : `docs/seo/design/revue-technique.md`. Chaque constat a d'abord été
REPRODUIT sur la sortie de 19:34 (copie figée), puis remesuré après correction
avec les mêmes scripts (Playwright, Chrome du poste). « Avant → après ».

| Constat | Correction | Preuve |
|---|---|---|
| **C-1** Menu mobile : Tab sort du menu ouvert et passe SOUS le panneau | bouton AVANT `<nav>` dans le DOM (`layout.mjs`), CTA dédoublé (téléphone / fin de `<nav>` sur ordinateur) ; `focusout` hors de l'en-tête ferme le panneau (`site.js`) | 390 et 820 px : le Tab après « Menu » va à « Comment ça marche » (avant : « Commencer gratuitement », MASQUÉ) ; après « Se connecter », le panneau se ferme et l'élément suivant est visible |
| **C-2** Vidéo : focus perdu au lancement, anneau invisible | `v.focus()` après avoir masqué le bouton ; anneau clair `--ss` posé sur un liseré `--en` | après Entrée : `activeElement` = VIDEO (avant : BODY) ; capture de l'anneau nette (avant : quasi invisible) ; paire contrôlée au build |
| **C-3** Contrastes réels sous AA sur halos, dégradés, ombre | texte de tête en `--gt` / `--st` ; numéros d'étapes en `--ss` ; texte de l'appel final en `--ss`, coins à 65 % / 50 % ; légende en pastille au-dessus de l'ombre ; le vérificateur compose les fonds mêlés au plus fort | mesure pixel par pixel, 15 pages × 390 et 1440 : **56 relevés sous le seuil (38 distincts) → 0** |
| **C-4** Bandeau de consentement masquant des éléments focalisés | `scroll-padding-bottom` à sa hauteur tant qu'il est là, et remontée de l'élément focalisé s'il passe dessous | arrêts de Tab entièrement masqués, bandeau affiché : accueil **18 → 0**, `/tarifs` **9 → 0** (hors les 4 faux positifs du script : le lien d'évitement et les trois commandes DU bandeau) |
| **C-5** Icônes de l'app : 156 Kio sur 253 | `public/favicon.ico` : entrées 16/32/48 gardées À L'OCTET, 64/128/256 retirées (113 → 7,9 Ko) ; `icon-192x192.png` en palette tramée (46 → 16 Ko, écart moyen 0,9/255, invisible à 3×) ; mêmes URL, parité avec l'app gardée | accueil : perf. 95 → **99**, LCP 2,9 → **2,1 s**, poids 253 → **122 Kio** |
| **C-6** Verrou des dates : `video.json` bloquait tout build local, natif et OTA compris | bloc vidéo en habillage (hors empreinte) ; date périmée = erreur dans le build DU SITE local seulement, avertissement dans les builds de l'app (mode « controle ») et sur Vercel ; trois gestes complétés (`site/donnees`, captures) dans `site-vitrine.md`, `CLAUDE.md`, `AGENTS.md` | `selftest:site-moteur` § 11 bis (verrou faussé : app = avertissement, site = refus, Vercel = avertissement) ; build natif vert |
| **C-7** JSON-LD de l'accueil FR recopié d'index.html | pour `/`, le générateur remplace la description de l'app (le chapô visible), celle de l'éditeur (le résumé du pied) et la capture (celle du héros) ; index.html intact | plus d'écart texte / JSON-LD ; plus d'`og-image-fillsell.png` |
| **C-8** Lexique : un palier passait à côté de la republication | `REGLES_DECISION` : republi* / remont* / repost* / relist* dans la même phrase qu'un palier, un plan, un forfait (ou au début de la suivante), lignes de tableau jointes ; blog en avertissement ; l'import des concurrents retire le palier de la ligne FillSell | le nouveau vérificateur, passé sur la sortie de 19:34, refuse les trois cas de la revue ; la sortie corrigée en a 0 |
| **C-9** Contenu de la vidéo | rebâti sur `video.json` de 19:41 (compte « Camille », cinq plateformes) et relu ; règle « Depop partout » dans le texte (Vinted, Leboncoin, eBay et Beebs sans Depop = refus) | transcription : 0 « Pro / Business », 0 chiffre de Nico, Depop nommée ; l'ancienne transcription aurait été refusée |
| **C-10** `<pre>` : page de 777 px sur un écran de 320 | `pre.bloc-code` défile dans sa boîte (module `code`) ; arrêt de Tab seulement s'il défile | largeur de page à 320 px : **777 → 320** |
| **C-11** Valeurs concurrentes françaises sur les pages EN | format `{ fr, en }` (importeur, générateur, gabarits, FORMAT-CONTENU § 4) ; `lang` sur les liens de gabarit vers une page d'une autre langue | liens du pied et du menu `hreflang` + `lang` ; `selftest:site-moteur` § 22 |
| **M-1** « Learn more » (SEO 92 sur /en) | « Read our privacy policy » (`consentementTextes.js`) | SEO `/en` 92 → **100** ; build natif : seul écart de ce fichier = cette chaîne (jamais affichée dans l'app) |
| **M-2** Tableaux Markdown | coin vide → en-têtes de ligne ; ligne d'en-tête vide retirée ; région nommée par le titre | trajet : `td-has-header` disparaît, arbre d'accessibilité « rowheader » |
| **M-3** Langue : nom « English » pour « EN » | « EN — English » | `label-content-name-mismatch` (Lighthouse ordinateur, accueil) : 1 élément → 0 |
| **M-4 / M-5 / M-6** | `<meter>` et rang `aria-hidden` ; `tabindex` gardé seulement si le bloc défile (tableaux, carrousel d'étapes, `<pre>`, et la transcription de la vidéo, désormais focalisable et nommée — revue M-11) ; sous-menu fermé au `focusout` | podium lu « FillSell 89/100 » ; arrêts de Tab : accueil ordinateur 88 → 86, classement mobile 46 → 44 ; sous-menu fermé 6 Tab plus loin |
| **M-7** Images | `sizes` alignés sur la CSS | « images mal dimensionnées » : 30 et 23 Kio → 0 (WebP et 320 : non, § 4) |
| **M-8** Contraste élevé | barres du menu en bordures ; vidéo et triangle « Lire » en `forced-color-adjust: none` | captures en `forced-colors` : icône du menu et triangle visibles (avant : carré vide, carré noir) |
| **M-9** Vidéo tronquée publiée | poids de chaque fichier contrôlé contre `poids_octets` de `video.json` (et `sha256` s'il est déclaré) | AV1 coupé à 1 048 576 o dans une racine de test : build du site refusé, build de l'app averti |
| **M-10** Démonstration en `index` | documentation alignée sur le code (en-tête de ce fichier) | — |
| **M-12** 404 en français pour `/en/…` | rien : la 404 porte DÉJÀ une section anglaise (`<section lang="en">`, « Page not found », liens vers `/en`) | `404.html` relu |
| **M-13**, **M-15**, **M-14** | non appliqués, raisons au § 8 ; budgets remesurés au § 4 | — |

Écart NOMMÉ du build natif (`FILLSELL_BUILD_ESSAI=1 vite build` comparé à
`build/natif-avant`) : 129 fichiers de part et d'autre ; diffèrent seulement
`favicon.ico` et `icon-192x192.png` (C-5), la chaîne « Learn more » → « Read our
privacy policy » de `index-*.js` (M-1) et l'horodatage de
`fillsell-extension.zip` ; les sept `web-*.js` sont identiques en
multiensemble, `index.html` = `app-shell.html` octet pour octet.
