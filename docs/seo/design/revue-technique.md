# Revue technique du site vitrine : accessibilité, vitesse, SEO technique (09/10/2026, soir)

> Revue adverse en LECTURE SEULE de la livraison « design et gabarits » (branche
> `seo-crosslisting`, worktree `C:\Users\nicol\fill-and-sell-seo`). Aucun correctif
> écrit, rien commité, rien poussé, aucun SQL, aucune connexion à fillsell.app,
> `package-lock.json` intact. Seul fichier écrit dans le dépôt : ce rapport. Les builds
> ont été faits dans `build/site-apercu/` (site) et dans le scratchpad de la session
> (natif). Les mesures portent sur le build de 19:34 (copie figée dans le scratchpad,
> servie par `scripts/site/serveur-apercu.mjs` sur le port 4391, compression comprise).
> D'autres agents écrivaient en même temps dans `site/medias/` : ce qui en dépend est
> signalé comme tel.

## 0. Verdict

La livraison tient ses promesses mesurables. Tous les chiffres du compte rendu ont été
rejoués et retrouvés, à ±1 point près : build, vérificateur, selftests, Lighthouse
mobile et ordinateur, budgets, build natif identique. Le SEO technique est propre :
canonical, hreflang réciproques, sitemap, JSON-LD conforme au texte visible pour tous
les types générés, aucune note, aucun jeton restant, aucune trace d'Opla.

Lighthouse affiche 100 en accessibilité partout, mais ce score ne voit pas les défauts
qui comptent ici. Le clavier, le rendu réel des dégradés et le mode contraste élevé en
révèlent plusieurs, qui sont dans les **gabarits** : ils partiront donc avec le vrai
contenu.

- Une fois le menu mobile ouvert, Tab sort du menu et va sous le panneau ouvert : le
  focus devient invisible.
- La lecture de la vidéo fait perdre le focus, et l'anneau du bouton « Lire » ne se
  voit pas.
- Des textes passent sous 4,5:1 sur les halos et les dégradés. Le contrôle du build ne
  vérifie que des paires de couleurs unies.
- Le bandeau de consentement masque des éléments focalisés.
- Les blocs `<pre>` d'un article du blog provoquent un défilement horizontal sur mobile.

Côté vitesse, la seule marge réelle est dans les deux icônes de l'app (156 Kio). Sans
elles, l'accueil mobile passe de 95–96 à 99, le LCP simulé de 2,85 à 1,99 s et le poids
de 253 à 97 Kio.

Côté processus, deux garde-fous fuient :
- **Le verrou des dates** bloque TOUT build local, natif et OTA compris, dès qu'un
  autre agent touche `site/medias/video/video.json`. C'est prouvé ce soir, et la règle
  ne figure pas dans les « trois gestes ».
- **Le lexique du vérificateur** laisse passer un palier écrit à côté de la
  republication automatique, à trois endroits de la sortie.

Rien de **bloquant** au sens strict : la production refuse les pages de démonstration,
et aucun de ces points ne casse le site. En revanche, les points « important » sont à
traiter avant la fusion sur `main`.

## 1. Ce qui a été rejoué

| Contrôle | Résultat | Écart avec le compte rendu |
|---|---|---|
| `npm run site:apercu -- --sans-serveur` (19:34) | 34 pages, 1 576 liens internes, 0 erreur, 9 avertissements (titres/descriptions du blog), recouvrement max 24 % (`en/faq` / `en`) | aucun |
| `npm run site:verifier -- build/site-apercu` | 0 erreur, 9 avertissements | aucun |
| `selftest:site-aiguillage` / `-routes-app` / `-balises` / `-blog-lecteurs` / `-consentement` / `-moteur` | 40 / 97 / 159 / 106 / 18 / 108, 0 échec | aucun |
| `selftest:depop-partout` | OK | aucun (mais voir C-9 : il ne lit pas la transcription) |
| Budgets (accueil) | HTML 78 537 o / 81 920 (marge 3,4 Ko) ; CSS 23 422 o / 24 576 (marge 1,15 Ko) ; site.js 3 314 o gzip / 6 Ko | conforme ; marges minces (voir M-14) |
| Build natif (`FILLSELL_BUILD_ESSAI=1 vite build`, scratchpad) comparé à `build/natif-avant` | 129 fichiers de part et d'autre. Une fois normalisés l'identifiant de build et les empreintes des morceaux (les 7 morceaux `web-*.js` comparés en multiensemble), seul `fillsell-extension.zip` diffère (horodatage). `cmp index.html app-shell.html` : **identiques octet pour octet** | conforme, MAIS le build n'a abouti qu'avec `FILLSELL_SITE_CONTROLE=0` (voir C-6) |
| Liens `/x/` → 308 `/x`, `/FAQ` → 404, `/en/inexistant` → 404 + `404.html` | conformes | — |

### 1.1 Lighthouse 12.8.2 (local, balises tierces coupées : GTM, gtag AW, Insights)

Mobile = Moto G simulé (412×823, ralentissement simulé) ; ordinateur = `--preset=desktop`.
Scores : perf / a11y / bonnes pratiques / SEO. Poids en Kio transférés.

| Type | Page | Mobile | LCP | TBT | CLS | Poids | Ordinateur | LCP | Poids |
|---|---|---|---|---|---|---|---|---|---|
| accueil-fr | `/` | 96 / 100 / 100 / 100 | 2,77 s | 0 ms | 0,000 | 253 | 100 / 100 / 100 / 100 | 0,72 s | 386 |
| accueil-en | `/en` | 95 / 100 / 100 / 92 | 2,90 s | 0 ms | 0,000 | 250 | 100 / 100 / 100 / 92 | 0,72 s | 382 |
| guide | `/comment-ca-marche` | 97 / 100 / 100 / 100 | 2,60 s | 0 ms | 0,000 | 224 | 100 / 100 / 100 / 100 | 0,58 s | 227 |
| guide (EN) | `/en/how-it-works` | 97 / 100 / 100 / 92 | 2,59 s | 0 ms | 0,000 | 223 | 100 / 100 / 100 / 92 | 0,60 s | 225 |
| guide (pilier) | `/crosslisting` | 98 / 100 / 100 / 100 | 2,45 s | 0 ms | 0,000 | 196 | 100 / 100 / 100 / 100 | 0,57 s | 206 |
| trajet | `/crosslisting/vinted-beebs` | 98 / 100 / 100 / 100 | 2,44 s | 0 ms | 0,000 | 197 | 100 / 100 / 100 / 100 | 0,54 s | 207 |
| plateforme | `/plateformes/vinted` | 97 / 100 / 100 / 100 | 2,60 s | 0 ms | 0,000 | 233 | 100 / 100 / 100 / 100 | 0,59 s | 230 |
| fonction | `/fonctions/lens` | 96 / 100 / 100 / 100 | 2,76 s | 0 ms | 0,000 | 253 | 100 / 100 / 100 / 100 | 0,57 s | 236 |
| comparatif | `/comparatif/fillsell-vs-stoflow` | 98 / 100 / 100 / 100 | 2,45 s | 0 ms | 0,000 | 199 | 100 / 100 / 100 / 100 | 0,56 s | 199 |
| alternative | `/alternative/vendoo` | 98 / 100 / 100 / 100 | 2,31 s | 0 ms | 0,000 | 196 | 100 / 100 / 100 / 100 | 0,57 s | 206 |
| classement | `/comparatif/meilleures-applications-crosslisting` | 98 / 100 / 100 / 100 | 2,45 s | 0 ms | 0,000 | 199 | 100 / 100 / 100 / 100 | 0,56 s | 199 |
| tarifs | `/tarifs` | 98 / 100 / 100 / 100 | 2,44 s | 0 ms | 0,000 | 197 | 100 / 100 / 100 / 100 | 0,58 s | 207 |
| glossaire | `/glossaire` | 98 / 100 / 100 / 100 | 2,45 s | 0 ms | 0,000 | 206 | 100 / 100 / 100 / 100 | 0,55 s | 206 |
| faq | `/faq` | 98 / 100 / 100 / 100 | 2,42 s | 10 ms | 0,000 | 206 | 100 / 100 / 100 / 100 | 0,57 s | 206 |
| article | `/blog/cross-listing-vinted-leboncoin` | 98 / 100 / 100 / 100 | 2,50 s | 0 ms | 0,000 | 232 | 100 / 100 / 100 / 100 | 0,55 s | 222 |
| liste | `/blog` | 98 / 100 / 100 / 100 | 2,46 s | 0 ms | 0,000 | 205 | 100 / 100 / 100 / 100 | 0,56 s | 205 |
| 404 | `/inexistant` | non mesurable : Lighthouse refuse une page en statut 404 (`ERRORED_DOCUMENT_REQUEST`) | | | | | | | |

- **Accueil mobile repassé deux fois** : FR 96 puis 95, EN 95 puis 95 ; LCP de 2,83 à
  2,89 s. Le LCP **observé** (sans ralentissement) vaut 0,70 s : c'est le chapô, peint
  dès le premier affichage (FCP = LCP observé = 702 ms). Le LCP simulé de 2,4 à 2,9 s
  est donc un effet du modèle de Lighthouse, qui compte toutes les requêtes parties
  avant ce LCP : police 22 Ko, image du héros 40 Ko, et surtout `favicon.ico` 113 Ko et
  `icon-192x192.png` 46 Ko (C-5).
- **Ordinateur** : le LCP est l'image du héros sur l'accueil, le guide, la fonction et
  la plateforme, sinon le h1 ou le chapô.
- **Audits « poids 0 »** (hors score) qui échouent :
  - `label-content-name-mismatch` sur toutes les pages ordinateur (M-3) ;
  - `td-has-header` sur le trajet (M-2) ;
  - `link-text` sur les pages /en (« Learn more », M-1).
- **Balises de production** (GTM, gtag AW) : **non remesurées volontairement**. Une
  mesure locale enverrait des visites de 127.0.0.1 au conteneur GTM et à Google Ads. Les
  chiffres du designer (accueil 57 à 83, TBT jusqu'à 1,3 s) restent la seule référence.

### 1.2 Poids (sortie)

| Page | HTML | brotli | CSS en ligne | JSON-LD | Script en ligne |
|---|---|---|---|---|---|
| `/` | 78 537 o | 17 537 o | 23 422 o | 7 904 o | 3 314 o |
| `/en` | 72 775 o | 15 622 o | 23 422 o | 5 954 o | 3 314 o |
| `/comparatif/meilleures-applications-crosslisting` | 53 520 o | 13 155 o | 21 908 o | 2 742 o | 3 314 o |
| `/tarifs` | 40 919 o | 10 475 o | 17 538 o | 3 203 o | 3 314 o |
| autres pages vitrine | 35 à 48 Ko | 9 à 13 Ko | 15,2 à 19,8 Ko | 0,7 à 4,1 Ko | 3 314 o |

Police : une seule, `space-grotesk-latin` en woff2 de 22 288 o, préchargée, en `swap`,
avec un repli métrique (CLS mesuré 0 partout).

Images au premier écran de l'accueil :
- **mobile** : héros AVIF 480 (40 Ko), icône 64 px (3,9 Ko) et badges (4,5 + 5,8 Ko) ;
  les badges sont dans la fenêtre, donc `loading="lazy"` ne les retarde pas ;
- **ordinateur** : s'y ajoutent les six captures des étapes (132 Ko, priorité basse),
  dans la distance de chargement paresseux de Chrome.

Vidéo : `preload="none"`, rien n'est chargé avant le clic.

## 2. Constats

Gravité : **important** (à traiter avant la fusion sur `main`) ; **mineur** (à
planifier). Aucune correction n'a été écrite.

### Important

**C-1. Menu mobile : une fois ouvert, Tab quitte le menu et le focus passe SOUS le
panneau** (WCAG 2.4.3 ordre du focus, 2.4.11 focus non masqué)
- Mesure (Playwright, 390×844, clavier réel) : Tab jusqu'au bouton Menu, puis Entrée.
  `aria-expanded="true"`, le panneau est visible et le sous-menu déplié. Les Tab
  suivants vont pourtant à « Commencer gratuitement » (top 440 px), puis « Installer
  l'extension », puis au badge App Store, tous recouverts par l'en-tête ouvert (bas à
  702 px). Pour atteindre les liens du menu, il faut 4 Maj+Tab, qui arrivent sur « Se
  connecter », le dernier lien. Même constat à 820 px de large.
- Cause : dans le DOM, `<nav id="navigation">` est AVANT le bouton
  (`site/gabarits/layout.mjs`). C'est la CSS (`order: 5`) qui place le panneau dessous.
  Un lecteur d'écran mobile (VoiceOver, balayage) suit le même ordre.
- Correction proposée :
  - placer le bouton avant `<nav>` dans le DOM et garder la place visuelle par la CSS,
    ou donner le focus au premier lien à l'ouverture ;
  - fermer le panneau quand le focus en sort (`focusout`).

**C-2. Lecteur vidéo : le focus est perdu au lancement, et l'anneau du bouton « Lire »
est invisible** (2.4.3, 2.4.7, 1.4.11)
- Mesure : bouton « Lire la vidéo » focalisé, puis Entrée. La vidéo joue, mais
  `document.activeElement` = `BODY`, car le bouton passe en `hidden`
  (`site/js/site.js`). Tab saute ensuite les contrôles de la vidéo ; seul Maj+Tab les
  retrouve.
- L'anneau `:focus-visible` (3 px `#1B6E62`, décalé de 2 px) se pose sur l'affiche,
  sombre et teal, et sur le halo menthe du bouton. Sur la capture du focus, il ne se
  distingue presque pas.
- Le contrôle `PAIRES_CONTRASTE` ne voit pas ce cas : il ne connaît que l'anneau sur
  toile, blanc, papier et vert nuit.
- Correction proposée :
  - `v.focus()` après `b.hidden = true` ;
  - un anneau clair sur ce bouton (`--focus-sur-fonce`, ou double anneau
    clair/sombre).

**C-3. Contrastes réels sous 4,5:1 sur les halos et les dégradés** (1.4.3). Lighthouse
et axe ne les voient pas, puisqu'ils ne calculent pas un fond en dégradé. Le build ne
les voit pas non plus : il ne compare que des jetons unis.
- Méthode : chaque morceau de texte relevé par `Range`, avec sa couleur calculée.
  Capture pleine page avec le texte rendu transparent, puis fond échantillonné sous
  chaque boîte de texte (21 points), et pire ratio WCAG. 15 pages × 390 et 1440 px. Les
  faux positifs ont été retirés : `thead` masqué du tableau mobile et texte défilé de la
  transcription.

| Où | Texte | Taille | Pire ratio mesuré | Fond réel |
|---|---|---|---|---|
| Halo teal du héros et de la tête, toutes pages, 390 px | surtitre `--sf` | 15,2 px / 600 | 4,13 à 4,30 | `#C4DACF` à `#CCDDD2` |
| idem | chapô `--gr` | 17,4 px / 500 | 4,06 à 4,44 (faq ordinateur 4,37 à 20,5 px) | `#C4D9CE` à `#D3E0D5` |
| idem | fil d'Ariane `--gr` | 13,8 px | 4,15 à 4,49 | idem |
| Étapes en section sombre (accueil FR/EN, 390 et 1440) | « Étape 1 » `--me` | 14,4 px / 700 | 3,98 à 4,27 | `#185D53` (dégradé `--sf`) |
| Légende sous un cadre de téléphone (`figcaption`, accueil vidéo, guide) | `--gr` | 13,1 px | 2,77 à 3,03 | `#AEB1A8` à `#B5B9B5` : l'**ombre portée du téléphone** (`0 42px 80px -34px`) passe sous la légende |
| Appel final, coin pêche (390) | « Gratuit pour commencer… » `--s2` | 13,8 px | 4,15 | `#705440` |

- Correction proposée :
  - pour le halo : réduire son opacité derrière la colonne de texte, ou passer le
    surtitre et le chapô en `--en` / un gris plus sombre ;
  - pour les étapes : numéro en `--ss` ;
  - pour l'ombre : décaler la légende ou réduire l'ombre ;
  - pour le contrôle : ajouter au vérificateur les couleurs mêlées les plus défavorables
    (halo à 26 % sur toile, `--sf` en tête de dégradé sombre, pêche à 62 % sur encre),
    calculées depuis les jetons.

**C-4. Le bandeau de consentement masque des éléments focalisés** (2.4.11, WCAG 2.2)
- Mesure, première visite en 390×844 (aucun choix encore fait) : sur l'accueil,
  **18 arrêts de Tab** sont entièrement cachés derrière le bandeau fixe du bas (badges,
  liens, FAQ…), et 6 sur `/tarifs`. Chrome ne fait pas défiler un élément qui est
  « dans la fenêtre » mais sous le bandeau.
- Le bandeau est bien le premier arrêt après le lien d'évitement (bon choix) ; le défaut
  ne touche que ceux qui le passent sans répondre.
- Correction proposée : poser `scroll-padding-bottom` à la hauteur du bandeau tant qu'il
  est affiché (`site.js`, qui l'insère déjà).

**C-5. Les icônes de l'app pèsent 62 % de l'accueil mobile**
- Mesure : `favicon.ico` (113 Ko) et `icon-192x192.png` (46 Ko) partent à 337 ms, en
  priorité haute, et totalisent 156 Kio sur 253.
- Même passe Lighthouse avec ces deux URL bloquées, deux fois : perf **99**, LCP simulé
  **1,99 s** (au lieu de 2,77–2,90), poids **97 Kio**.
- Le vérificateur IMPOSE ces liens : il exige la parité des liens d'icônes avec la
  coquille de l'app (`RELS_PARTAGES`, `verify-site.mjs`). Le site ne peut donc pas
  pointer seul vers l'icône de 64 px qu'il publie déjà (3,9 Ko).
- Correction proposée, à décider :
  - recompresser `public/favicon.ico` (ICO 16/32/48, environ 5 à 15 Ko) et
    `icon-192x192.png` (PNG quantifié, environ 10 Ko). Cela touche l'app, mais aucun
    code ;
  - ou bien assouplir la parité pour `rel=icon` sur le site.

**C-6. Le verrou des dates bloque tous les builds locaux, natif et OTA compris, quand
un AUTRE fichier que le contenu change**
- Preuve : le build natif de la revue (19:52) a échoué sur « DATES PÉRIMÉES : / et /en
  (contenu changé) ». Aucun fichier de `site/contenu/` ni de `src/blog/` n'avait bougé
  depuis le verrou (19:29). C'est `site/medias/video/video.json` (refait par l'agent
  vidéo à 19:41) qui a changé : la description, la transcription, la légende et les
  dimensions de la vidéo sont dans la zone `fs:contenu`, donc dans l'empreinte
  (`scripts/site/lib/dates.mjs`).
- Il a fallu `FILLSELL_SITE_CONTROLE=0` pour faire la comparaison du natif.
- Même mécanique attendue, non éprouvée ici, pour :
  - `site/donnees/plateformes.yml` (les jetons sont dans le texte) ;
  - une capture refaite à d'autres dimensions (`width`/`height` sont hachés).
- Or `docs/agents/site-vitrine.md` (« trois gestes ») ne cite que `src/blog/*.md` et
  `site/contenu/`. Une fois sur `main`, un terminal qui met à jour la vidéo ou une
  donnée bloque l'OTA d'un autre.
- Correction proposée, au choix :
  - sortir la vidéo de l'empreinte (bloc d'habillage, avec une date propre à la vidéo) ;
  - ou compléter les « trois gestes » ;
  - et, dans les deux cas, ne faire échouer que les builds DU SITE, un simple
    avertissement suffisant pour le natif et l'OTA, comme sur Vercel.

**C-7. JSON-LD de l'accueil FR non conforme au texte visible**
- Organization, WebSite et SoftwareApplication sont recopiés d'`index.html`. On y lit :
  - `description` : « Publiez une annonce sur Vinted, Leboncoin, eBay et Beebs en une
    seule fois. Republication automatique, gestion du stock à la voix, analyse photo IA,
    retrait des annonces en un tap après la vente. » Quatre plateformes au lieu de cinq,
    du vouvoiement, une fonction (la voix) absente de la page, et « retrait […] en un
    tap » ;
  - `screenshot` : `https://fillsell.app/og-image-fillsell.png`. Le brief de design
    (`04-design-medias.md` § 0.4) dit de cette image qu'elle « dessine de faux logos de
    plateformes et un faux badge App Store » ;
  - Organization : « pour les revendeurs français », identité nationale que PLAN.md § 7
    écarte.
- Les offres, elles, sont bien remplacées par celles de `tarifs.yml`.
- Tous les autres types ont été comparés au DOM rendu et sont conformes : FAQPage,
  HowTo, BreadcrumbList, ItemList, DefinedTermSet, offres de `/tarifs` et
  `/en/pricing`, Article et BlogPosting (headline = h1, dates, auteur, image).
- Correction proposée : comme pour `offers`, le générateur remplace pour `/` la
  `description` et le `screenshot` (une capture ou la carte OG de l'accueil). Changer
  `index.html` toucherait la coquille de l'app.

**C-8. Le lexique du vérificateur laisse passer un palier à côté de la republication
automatique** (décision de Nico : « jamais de palier écrit à côté »). Trois cas dans la
sortie de 19:34, tous avec 0 erreur au vérificateur :
- `/comparatif/fillsell-vs-stoflow`, colonne FillSell (pas `data-tiers`) :
  « Republication — Manuelle et automatique, **à tous les paliers** » ; dans la même
  colonne, « sans quota, tous paliers ». La regex exige le littéral
  « republication automatique » suivi de `Pro|Business|Premium|Gratuit` : « paliers »
  et la coupure th/td la déjouent.
- La transcription de la vidéo, sur l'accueil, dans `<main>` : « FillSell la republie
  tout seul. **Avec Pro ou Business**, au créneau que tu choisis ». Le verbe
  « republie » n'est pas couvert (contenu d'un autre agent, refait depuis : à relire).
- `/blog/cross-listing-vinted-leboncoin` (et `llms-full.txt`) : « manuelle sur tous
  les plans, **automatisable avec le plan Pro** », deux fois. Le blog n'est pas relu
  par le lexique (choix écrit, « sera réécrit »), mais cet article part tel quel à la
  fusion.
- Par ailleurs, le compte rendu dit que le vérificateur contrôle « l'absence de toute
  trace de quota ». En réalité il refuse les traces techniques et les chiffres, pas le
  mot : « sans quota » passe.
- Correction proposée :
  - élargir la règle (`republi\w*|remont\w*` à moins de N mots de
    `palier|plan|forfait|Pro|Premium|Business`, cellules th + td jointes) ;
  - décider si le blog est relu avant la fusion.

**C-9. Contenu de la vidéo à l'instant du build (dossier d'un autre agent, signalé
pour la technique)**
- La sortie de 19:34 publiait, dans le texte visible (transcription), le VideoObject et
  la légende :
  - quatre plateformes, sans Depop (« FillSell en 71 secondes : tes annonces Vinted,
    Leboncoin, eBay et Beebs ») ;
  - les chiffres du compte de Nico (« Profit net 646,90 € · 235 ventes · Revenu brut
    5 423,19 € ») ;
  - « L'app qui publie, republie et retire pour toi », sur l'affiche aussi.
- `selftest:depop-partout` et le vérificateur sont verts : ni l'un ni l'autre ne lit la
  transcription comme une « liste de plateformes ».
- `video.json` a été refait à 19:41 (compte « Camille », cinq plateformes, 53,5 s) : à
  rebâtir et relire. C'est aussi lui qui déclenche C-6.

**C-10. Défilement horizontal de la page sur mobile (Reflow, 1.4.10) :
`/blog/comment-calculer-profits-vinted`**
- Mesure : la page est large de 777 px pour une fenêtre de 320 px. La cause : quatre
  formules en `<pre><code>` (« Profit = Prix de vente − Prix d'achat − … ») ; aucune
  règle `pre` dans `site.css`.
- L'article est réel, pas une démonstration : il partira tel quel. Le gabarit cassera
  tout futur article qui contient un bloc de code.
- On voit aussi dans le code des astérisques littéraux (« `= **293 %**` »), qui relèvent
  du contenu.
- Correction proposée : `.prose pre { overflow-x: auto; }` (ou `white-space: pre-wrap`)
  et `tabindex="0"` sur le bloc s'il défile.

**C-11. Les pages EN contiennent du FRANÇAIS issu des données**
- Exemples :
  - tableau comparatif de `/en` : « manuelle et automatique », « automatique à partir de
    Pro », « titre et description depuis une photo (prompt personnalisable) » ;
  - grille, variantes et « Not ranked, and why » de `/en/compare/best-crosslisting-apps`.
- L'accessibilité est respectée (chaque morceau porte `lang="fr"`). Le défaut est de
  structure : `concurrents.yml` n'a pas de valeurs EN, donc tout comparatif anglais
  affichera du français.
- Même chose pour les libellés du pied (« Lens, l'IA photo », « Ventes et retraits »,
  « Glossaire »…) : ils portent `hreflang="fr"` mais PAS `lang="fr"` (3.1.2).
- Correction proposée : valeurs `{fr, en}` dans le brief et dans `concurrents.yml` (le
  format du contenu ne le prévoit pas aujourd'hui) ; `lang` sur les liens vers une page
  d'une autre langue.

### Mineur

**M-1. « Learn more »** (SEO 92 sur les pages /en)
- Confirmé : c'est le seul audit qui échoue.
- Le texte anglais du bandeau n'est JAMAIS affiché dans l'app : `consentementTextes.js`
  le dit, et l'app reste en français. Changer `en.lien` (« Read our privacy policy »)
  ne modifie donc que des octets du bundle natif, pas son rendu.
- Il suffit d'accepter cet écart nommé dans la preuve « build natif identique ».

**M-2. Tableaux Markdown** (trajet, plateforme…)
- Défauts relevés :
  - première cellule d'en-tête vide ;
  - première colonne en `<td>` au lieu de `<th scope="row">` (lecteur d'écran : la
    ligne n'est pas annoncée) ;
  - région nommée « Tableau » sur toutes les pages ;
  - aucune `<caption>`.
- Correction proposée : promouvoir la 1ʳᵉ colonne en `th` quand l'en-tête de coin est
  vide ; nommer la région depuis le titre qui précède.

**M-3. Sélecteur de langue** : nom accessible « English » / « Français », alors que le
texte visible est « EN » / « FR » (2.5.3, `label-content-name-mismatch`). Proposition :
« EN — English », ou un `aria-label` qui commence par « EN ».

**M-4. `<meter>` du podium sans nom.** La valeur est lue deux fois (« 89/100 », puis
« meter 89 »), et le `.rang` répète le numéro déjà donné par la liste. Proposition :
`aria-hidden="true"` sur le `<meter>` et sur `.rang`.

**M-5. Arrêts de Tab inutiles**
- `ol.etapes-medias[tabindex=0]` reste focalisable sur ordinateur, où il ne défile plus.
- Les `.comparaison[role=region][tabindex=0]` restent focalisables sur mobile, où le
  tableau devient des cartes et ne défile plus.
- Proposition : n'en faire un arrêt que lorsque le bloc défile (`scrollWidth >
  clientWidth`, posé par `site.js`).

**M-6. Sous-menu « Plateformes » (ordinateur)**
- Ce qui marche : Entrée ouvre, Échap ferme et rend le focus au `summary`.
- Le défaut : quand on le quitte au clavier, il reste ouvert (6 Tab plus loin, focus sur
  « Comparatif », sous-menu toujours déplié). Il ne masque pas le focus, mais il cache
  le contenu dessous.
- Proposition : le fermer au `focusout`.

**M-7. Images**
- Défauts relevés :
  - aucun `srcset` WebP : sans AVIF, le navigateur prend toujours le 960 px ;
  - les variantes WebP 480 et 720 (20 fichiers) sont générées, publiées et jamais
    référencées ;
  - `sizes` des cadres de tête (`70vw`) surestime la largeur réelle (`min(64vw,270px)`
    − 18 px) : le 720 au lieu du 480 sur `/fonctions/lens` et `/plateformes/vinted`.
    Lighthouse estime 32 à 46 Kio d'économie ;
  - le `fetchpriority="high"` du héros pèse sur mobile, où le LCP est le chapô.
- Proposition : `<source type="image/webp" srcset>` ; `sizes` aligné sur la CSS ; une
  variante 320 px.

**M-8. Mode contraste élevé (`forced-colors`)**
- L'icône du bouton Menu disparaît : ses barres sont des `background`, et il ne reste
  qu'un carré vide.
- Sur la vidéo : la `<video>` reçoit un fond Canvas qui masque l'affiche posée derrière
  elle, et le triangle « Lire » devient un carré noir.
- Proposition : `@media (forced-colors: active)` avec `forced-color-adjust` sur ces
  éléments, ou des icônes SVG en `currentColor`.

**M-9. Fichier vidéo tronqué publié sans erreur**
- Le build de 19:34 a publié `fillsell-presentation-av1.*.webm` à exactement
  1 048 576 o : la copie a été faite pendant que l'agent vidéo écrivait (1 657 358 o à
  19:39). Chrome lit d'abord la source AV1.
- Ni le générateur ni le vérificateur ne contrôlent la taille ou l'empreinte.
- Proposition : taille et sha256 par fichier dans `video.json`, vérifiés au build.

**M-10. Pages de démonstration en `index, follow`.** `DESIGN.md` dit « `noindex` » :
la documentation et le code divergent. Sans risque en production, qui les refuse, ni en
prévisualisation Vercel, qui ajoute son propre en-tête noindex. Sur un aperçu public
sans protection, ce serait différent.

**M-11. Contenu non mis en forme sur Safari**
- `<summary><h3>` (FAQ) : Chrome garde le titre, vérifié dans l'arbre d'accessibilité.
  VoiceOver sur Safari peut l'aplatir dans le bouton.
- La transcription (`ol`, `max-height: 300px`, `overflow-y: auto`) n'est pas
  focalisable sur Safari : on ne peut pas la faire défiler au clavier.
- Proposition : `tabindex="0"` et un nom sur cette liste.

**M-12. Page 404 en français pour `/en/…`** (une seule `404.html`). Le défaut est
acceptable tant que le choix est assumé ; sinon, un paragraphe anglais dans la page.

**M-13. Articles jumeaux non reliés** : `comment-calculer-profits-vinted` et
`how-to-calculate-reselling-profits` n'ont pas de `translation`, donc pas de hreflang.
PLAN.md les présente pourtant comme jumeaux.

**M-14. Budgets de l'accueil.** Marges de 3,4 Ko de HTML et 1,15 Ko de CSS, avec un
contenu de démonstration. Le JSON-LD (7,9 Ko) et la transcription y prennent une bonne
part. Le vrai contenu peut faire tomber le build.

**M-15. Sections entières marquées `data-tiers` sur le classement.**
`bloc-grille`, `bloc-variantes` et `bloc-hors` sont exemptés du lexique alors que la
grille de notation est un texte de FillSell (« dès le palier d'entrée… »). C'est
défendable, mais c'est un angle mort du contrôle.

**M-16. Informations (pas de défaut).**
- Google n'affiche plus les résultats enrichis HowTo, et ne les affiche plus pour FAQ
  hors sites officiels. Le résultat enrichi « Software App » exige une note : aucun
  résultat enrichi n'est donc à attendre, ce qui est cohérent avec « aucune note ». Le
  balisage garde sa valeur pour les IA.
- VideoObject : `uploadDate` est une date sans heure ni fuseau (valide), et il n'y a
  pas de propriété `transcript`.

## 3. Ce qui tient (vérifié, pas seulement relu)

- **Titres** : un seul `h1` par page sur les 34, aucun saut de niveau, aucun titre vide
  (le h2 masqué du glossaire remplit son rôle).
- **Images** : `alt` présent partout, vide seulement sur les décors (icône à côté du mot
  « FillSell », affiche de la vidéo). `width`/`height` partout, un seul
  `fetchpriority="high"` par page, jamais combiné avec `lazy`.
- **Identifiants et ARIA** : aucun id en double, aucune ancre morte, aucune cible
  `aria-controls` / `aria-labelledby` absente.
- **Langue** : `lang` exact sur les 34 pages, `og:locale` cohérent.
- **Clavier, ce qui marche** :
  - lien d'évitement visible au focus, qui mène dans `<main>` ;
  - FAQ (`<details>`) : Entrée ouvre, Espace referme ;
  - sous-menu sans JS : Entrée ouvre, Échap ferme et rend le focus ;
  - sommaire : la cible arrive sous l'en-tête collant (84 px contre 71 px, grâce à
    `scroll-padding-top`), et le Tab suivant continue dans la prose ;
  - menu mobile : Échap ferme et rend le focus au bouton ;
  - bouton Menu de 44×44 ;
  - anneau de focus présent sur 100 % des arrêts relevés (accueil 390 et 1440,
    classement, guide), et bien visible dans les sections sombres (appel final, palier
    Pro, étapes, pied).
- **Reflow et zoom** :
  - aucun défilement horizontal à 320 px sur les 20 pages testées, sauf C-10 ;
  - avec l'espacement de texte de WCAG 1.4.12, 2 à 3 px de débord dans le pied à
    320 px (négligeable) ;
  - viewport sans `user-scalable=no` ;
  - tailles en `rem` + `vw` : le zoom du texte seul agrandit bien les titres.
- **Mouvement** : la seule animation est coupée par `prefers-reduced-motion`, comme le
  défilement doux.
- **Canonical et hreflang** : 33 pages indexables, canonical = URL propre, sans slash
  final. `og:url` = canonical. hreflang fr/en réciproques avec un `x-default` commun,
  identiques dans le sitemap. `lastmod` = `dateModified` = date visible sur chaque page.
  Le sitemap contient 34 URL : les 33 pages, plus `/legal` (voulu). Aucun titre ni
  aucune description en double.
- **JSON-LD** : JSON valide sur toutes les pages ; aucune `aggregateRating`, `Review`
  ou `ratingValue` ; contenu identique au visible pour tous les types générés (C-7 pour
  l'accueil FR).
- **Sortie** : aucun jeton `{{…}}` dans les pages ni dans `llms*.txt` ; aucune trace
  d'Opla (pages, `llms*.txt`, sitemap, robots, `/assets/site/`) ; aucun `style=` hors du
  `noscript` GTM recopié.
- **Routage** : 308 sur le slash final, 404 sensible à la casse, `noindex` sur
  `404.html` et en-têtes `X-Robots-Tag` de `vercel.json` rejoués par le serveur
  d'aperçu.

## 4. Limites de cette revue

- **Hors périmètre** : les balises tierces de production (voir § 1.1), la
  prévisualisation Vercel, et le vrai Safari/VoiceOver (seul Chrome a été piloté).
- **Contrastes (C-3)** : mesurés sur rendu Chrome, à DPR 1. Un ratio à la frontière
  (4,4 à 4,5) peut bouger d'un dixième avec l'anticrénelage.
- **Vidéo et captures** : leurs fichiers changeaient pendant la revue. Les constats C-9
  et M-9 décrivent l'état de 19:34.
- **Scratchpad** : il est partagé avec les autres agents de la session. Le dossier
  `scratchpad/sortie` y a été vidé puis réécrit par cette revue (copie figée du build) :
  s'il servait à un autre agent, il est à régénérer. Les scripts de mesure sont dans
  `scratchpad/revue-tech-0910/` : `clavier.mjs`, `contraste.mjs`,
  `jsonld-visible.mjs`, `reflow.mjs`, `menu.mjs`, `forced.mjs`, `normaliser.mjs`,
  captures `focus-*.png` et `forced-*.png`. Les rapports Lighthouse sont
  `scratchpad/lh/*-mobile.json` et `*-desktop.json`.
