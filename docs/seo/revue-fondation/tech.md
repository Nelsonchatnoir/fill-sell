# Revue de la fondation du site vitrine — exactitude SEO et robustesse du moteur (09/10/2026)

Angle : SEO technique et robustesse du générateur, des gabarits, du vérificateur
et des selftests. Lecture seule : aucun correctif écrit, rien de commité, aucune
écriture dans `site/`, `src/` ni `scripts/` du worktree. Les essais destructifs
ont tourné sur une COPIE des sources (dossier jetable de la session), avec les
scripts du worktree appelés tels quels (`genererSite`, `verifierSite`).

## Verdict

La fondation est saine sur l'essentiel : HTML complet sans JS, canonical /
hreflang / x-default réciproques et cohérents avec le sitemap, JSON-LD valide en
`@graph` sans note, budgets tenus, statique sous `/assets/site/` à empreinte,
site.js léger, refus `page:inconnue` et refus d'un texte modifié sans date
PROUVÉS. Aucun constat bloquant dans le code lui-même. Neuf constats importants
sont à corriger avant le GO. Les principaux :

- le vérificateur refuse à tort toute réponse de FAQ qui porte un lien, du gras
  ou du code collé à une ponctuation ;
- un lien relatif écrit à la main passe partout et part en 404 ;
- le build Vercel tombe dès qu'un autre terminal retouche `src/pages/Legal.jsx`
  ou un article du blog sans lancer `site:dater` ;
- le § 2.7 de l'architecture (langues et plateformes comme DONNÉES) n'est pas
  implémenté ;
- le bouton principal et l'anneau de focus manquent de contraste ;
- le garde de similarité laisse passer deux pages identiques à 65 % ;
- rien n'empêche de déployer le contenu « Brouillon de démonstration » ;
- le cache `immutable` s'applique aussi aux 404 sous `/assets/site/`.

Plusieurs affirmations du compte rendu sont inexactes ou partielles (détail au
§ 4).

## 1. Ce qui a été rejoué

| Geste | Résultat |
|---|---|
| `FILLSELL_SITE=1 FILLSELL_BUILD_ESSAI=1 npx vite build --outDir build/revue-tech` | VERT : « app-shell.html écrit (12719 o) », « site généré : 15 pages en 989 ms (site.js 2843 o gzip, CSS 9224 o, quotas : base) », « 321 liens internes contrôlés, similarité max 0.02, 0 erreur(s), 10 avertissement(s) » |
| `node scripts/site/verify-site.mjs build/revue-tech` | 0 erreur ; sur `build/essai-natif` : 37 erreurs (refus attendu) |
| `selftest:site-aiguillage / -routes-app / -balises / -blog-lecteurs / -consentement / depop-partout / imports-epingles` | tous verts (39, 116, 82, 106, 18 vérifications) |
| `npx eslint scripts/site site/js site/gabarits scripts/vite-plugin-site.mjs scripts/vite-plugin-app-shell.mjs` | 0 sortie |
| `git diff --stat package-lock.json` | vide (lockfile intact) |
| Matrice de routage sur `serveur-apercu.mjs` (port 4473) | conforme au compte rendu (308 du slash final, 404.html, coquille sur les routes de l'app) ; écarts au § 3 |
| JSON-LD de 15 pages, parsé | 15 blocs valides, `@graph`, aucun `aggregateRating` ; `#website` / `#app` référencés hors de `/` sans y être définis (voulu, architecture § 5) |
| Tailles | plus grosse page 37 644 o ; CSS en ligne 9 224 o ; site.js 6 133 o, soit 2 868 o gzip ; aiguillage en ligne 2 726 caractères (1 218 o gzip) ; police 22 288 o ; ni `react` ni `supabase-js` dans site.js |

Harnais (jetables, hors dépôt) : `harnais.mjs` (21 essais sur le générateur),
`verif-fautes.mjs` (20 fautes injectées dans une sortie verte, verrou recalé
pour isoler la règle de la datation), `datation.mjs`, `matrice.mjs`, dans le
dossier de travail de la session.

## 2. Constats

### I-1 — IMPORTANT — Le vérificateur refuse à tort toute réponse de FAQ avec un lien, du gras ou du code collé à une ponctuation

- **Preuve** : `harnais.mjs` essais 18, 19 et 20, sur `site/contenu/fr/faq.md` :
  - « … c'est **gratuit**. » → BUILD ROUGE ;
  - « … comme dans [le guide](page:crosslisting/vinted-vers-leboncoin). » → BUILD ROUGE ;
  - « … grâce à l'**extension** Chrome. » → BUILD ROUGE ;
  - message commun : `faq/index.html : FAQPage « Sur quelles plateformes FillSell publie-t-il ? » ne reprend pas le texte affiché`.
- **Cause** :
  - `texteBrut` (`scripts/site/lib/html.mjs:38`) remplace chaque balise par une espace, d'où « gratuit . » et « l' extension » ;
  - la réponse JSON-LD vient de `toString(mdast)` (`markdown.mjs:168`), sans ces espaces ;
  - la comparaison `visible.includes(t)` (`verify-site.mjs:262-266`) échoue donc.
- **Même cause, deux autres effets** :
  - une liste dans une réponse donne « VintedLeboncoin » côté JSON-LD (essai 8, rouge) ;
  - un paragraphe ajouté après la dernière question avec un lien la fait échouer (essais 6 et 10-13 du premier passage).
- **Effet** : on ne peut pas mettre de lien interne dans une réponse de FAQ. C'est pourtant le meilleur endroit pour le maillage. Le message d'erreur égare le rédacteur.
- **Correction proposée** :
  - comparer des formes normalisées des deux côtés : retirer les espaces devant `.,;:!?)` et après `'’(`, ou bien extraire le texte visible depuis le même mdast ;
  - joindre les éléments de liste par une espace dans `toString` (`join(' ')` sur les enfants) ;
  - ajouter un selftest qui couvre gras, lien, code et liste dans une réponse.

### I-2 — IMPORTANT — Un lien relatif écrit à la main (`[x](faq)`, `../page`) n'est vu ni par le générateur ni par le vérificateur

- **Preuve** : essai 3 → BUILD VERT, la sortie porte `href="faq" href="../faq-inexistante"`. Servi sous `/crosslisting/vinted-vers-leboncoin`, il vise `/crosslisting/faq`, donc un 404. `verif-fautes.mjs` faute 1 (verrou recalé) : NON VUE.
- **Cause** :
  - `markdown.mjs:72` ne contrôle que les liens qui commencent par `/` ;
  - `cheminInterne` (`verify-site.mjs:78-84`) classe tout href sans `/` initial comme externe ;
  - même angle mort pour `http://fillsell.app/…` et `https://www.fillsell.app/…` (faute 15 : NON VUE).
- **Correction proposée** :
  - générateur : refuser tout lien sans schéma ni `/` (hors `#ancre`, `mailto:`, `tel:`) ;
  - vérificateur : résoudre chaque href contre l'URL de la page (`new URL(href, page.url)`), et traiter toute URL dont l'hôte est `fillsell.app` ou `www.fillsell.app` comme interne (avec erreur sur `http:` et sur `www.`).

### I-3 — IMPORTANT — Le build de PRODUCTION échoue dès qu'un autre terminal retouche `src/pages/Legal.jsx` ou un article de `src/blog/` sans `site:dater`

- **Preuve** : essai 16. Une ligne de commentaire ajoutée à `Legal.jsx` donne : `BUILD ROUGE : DATES PÉRIMÉES … /legal (route de l'app, src/pages/Legal.jsx modifié) → npm run site:dater`.
- **Pourquoi c'est grave ici** :
  - l'empreinte de `/legal` porte sur les OCTETS du fichier source (`dates.mjs`, `empreinteFichier`, appelé par `build-site.mjs:333-344` et `verify-site.mjs:442-447`) : un refactor sans effet visible re-date la page, et casse le build ;
  - `src/blog/*.md` est partagé avec la SPA ;
  - le build Vercel (`build:web`) sert AUSSI l'app ;
  - une fois sur `main`, un push d'un autre terminal (correctif urgent de l'app, retouche d'un article ou des mentions légales) passe en ERROR sur Vercel jusqu'à ce que quelqu'un lance `site:dater`. La prod reste sur l'ancien déploiement (sûr), mais le correctif ne part pas. Aucun autre terminal ne connaît cette règle, et CLAUDE.md et AGENTS.md n'y renvoient pas.
- **Correction proposée** :
  - pour les routes de l'APP (`/legal`) : ne jamais faire échouer le build. Garder la date du verrou et écrire un avertissement (ou prendre la date du dernier commit qui touche le fichier, faute de mieux) ;
  - pour le contenu du site et du blog : déplacer le refus « verrou périmé » dans un selftest ou un crochet pre-push (`selftest:site-dates`), lancé avant le push ; sur Vercel, un avertissement plus la date du verrou ;
  - à défaut : documenter la règle dans CLAUDE.md et AGENTS.md le jour du merge.

### I-4 — IMPORTANT — L'international « par données » (architecture § 2.7, consigne de Nico du 09/10) n'est pas implémenté

- **Preuve** :
  - `site/langues.mjs` et `site/donnees/` n'existent pas (`ls` : « No such file or directory ») ;
  - `grep "=== 'en'\|=== 'fr'\|'fr' ? \|['fr', 'en']\|en_US\|'/en'"` relève une vingtaine de branchements en dur : `build-site.mjs:242, 249, 252, 269, 283, 293, 428-434`, `contenu.mjs:35, 185-186`, `html.mjs:82`, `markdown.mjs:190`, `layout.mjs:53, 80`, `quotas.js:26`, `site.js:20, 62, 104`, `verify-site.mjs:357` ;
  - `alternatesDe(fr, en)` ne sait relier que deux langues ;
  - les textes de la liste du blog vivent dans le générateur (`build-site.mjs:137-140, 279-282`).
- **Cohérence** : le pied de page présente FillSell comme « l'app française des revendeurs … au-dessus de Vinted, Leboncoin, eBay et Beebs » (`textes.mjs:30, 66`). C'est le périmètre dit comme une IDENTITÉ, sans date, ce que le § 2.7 écarte.
- **Effet** : ajouter `/de` demanderait de toucher le générateur, les gabarits, site.js et le vérificateur, soit l'inverse de la promesse.
- **Correction proposée** :
  - créer `site/langues.mjs` (code, préfixe, hreflang, og:locale, locale des dates et des nombres, libellés, ordre de priorité du x-default) et `site/donnees/plateformes.yml` ;
  - générer les alternates pour N langues ;
  - x-default = la langue déclarée « porte internationale » ;
  - sortir TEXTE_LISTE et listeBlog dans `textes.mjs`.

### I-5 — IMPORTANT — Contrastes : le bouton principal et l'anneau de focus sont sous les seuils WCAG AA

- **Preuve** : ratios calculés (formule WCAG 2.x) sur `site/styles/site.css` :

| Élément | Ratio | Seuil | Verdict |
|---|---|---|---|
| `.bouton-premier` (`:135`) : texte blanc sur `#2F9E90`, 15 px gras (« Créer un compte », « Accepter ») | 3,27:1 | 4,5:1 (15 px gras n'est pas du « grand texte ») | ÉCHEC |
| `:focus-visible` (`:81`) : anneau `#4ECDC4` sur blanc | 1,93:1 | 3:1 (critère 1.4.11) | ÉCHEC |
| `:focus-visible` : anneau `#4ECDC4` sur `#EDEAE0` (fond de page) | 1,61:1 | 3:1 | ÉCHEC |
| `:focus-visible` : anneau `#4ECDC4` contre `#2F9E90` | 1,69:1 | 3:1 | ÉCHEC |
| `.carte small` (`:203`) : `#8A8578` sur blanc, 13 px | 3,68:1 | 4,5:1 | ÉCHEC |
| Liens au survol : `#2F9E90` sur `#EDEAE0` | 2,72:1 | 4,5:1 | ÉCHEC |

- **Ce qui tient** : liens au repos 5,05:1, navigation 5,52:1, dates 5,01:1, pied de page 6,59:1 et plus.
- **Correction proposée** :
  - fond du bouton principal en `--sarcelle-fonce` (`#1B6E62`, 6,08:1 avec le blanc) ou texte de 19 px gras ;
  - anneau de focus foncé (`--encre` ou `#1B6E62`) sur fond clair, turquoise seulement sur fond foncé (`.pied`, `.appel`) ;
  - `--gris-clair` à foncer pour du texte ;
  - ajouter au vérificateur un contrôle des paires de jetons déclarées.

### I-6 — IMPORTANT — Garde de similarité trop lâche pour les pages en série prévues (trajets X → Y)

- **Preuve** : avec les fonctions du dépôt (`mots`, bardeaux de 5 mots), deux pages partageant 60 % de leur texte mot pour mot donnent Jaccard = 0,427 (le seuil est 0,5). À 70 %, Jaccard = 0,537 : c'est à partir de là que le build refuse. Jusqu'à environ 65 % de texte commun, deux pages passent.
- **Autres limites** : la comparaison n'a lieu qu'au sein d'un même `type` (`verify-site.mjs:374-389`), et `page` ou `guide` sont au choix du rédacteur. Le seuil est conforme à l'architecture (§ 5), mais c'est le seul rempart automatique contre les pages-portes.
- **Correction proposée** :
  - mesurer le RECOUVREMENT `|A∩B| / min(|A|,|B|)`, avec refus à ≥ 0,4 et avertissement à ≥ 0,25 ;
  - comparer toutes les pages d'une même langue, quel que soit le type ;
  - écrire les 3 paires les plus proches dans le résumé.

### I-7 — IMPORTANT — Rien n'empêche de déployer le contenu « Brouillon de démonstration »

- **Preuve** :
  - les 6 pages du site portent `demonstration: true` et des descriptions qui commencent par « Brouillon de démonstration. » ;
  - elles sont `index, follow`, au sitemap, dans `llms.txt` (`build/revue-tech/llms.txt`, ligne « > Brouillon de démonstration. L'app des revendeurs … ») ;
  - aucun refus ne dépend de l'environnement : le build est VERT.
- **Correction proposée** : `build:web` (ou le générateur quand `VERCEL_ENV === 'production'`) refuse toute page `demonstration: true`, et toute description qui contient « Brouillon ». En prévisualisation, le bandeau reste permis.

### I-8 — IMPORTANT — Le cache `immutable` d'un an s'applique aussi aux 404 sous `/assets/site/` (à prouver sur Vercel, risque de la classe du 01/10)

- **Preuve locale** (`matrice.mjs`, qui rejoue `vercel.json`) :
  - `/assets/site/inexistant.js` → `404 cc=public, max-age=31536000, immutable` ;
  - `/inconnu.png` → même chose (la règle d'images existait déjà).
- **Risque** :
  - si Vercel pose aussi cet en-tête sur la réponse 404, ce qu'on ne peut prouver qu'en prévisualisation, un 404 pris par Cloudflare pendant une bascule d'alias resterait servi tant que le contenu de site.js ou de la police ne change pas ;
  - l'empreinte n'évolue qu'avec le contenu : ce peut être des mois ;
  - effet : menu mobile mort, bandeau de consentement absent, mesure perdue ;
  - aggravant : sur mobile, la navigation et les boutons de connexion de l'en-tête ne s'ouvrent QUE par site.js (`site.css:107, 114`, `display: none` sans JS).
- **Correction proposée** :
  - prouver d'abord : `curl -sI https://<prévisualisation>/assets/site/x.js` et lire `cache-control` ;
  - si l'en-tête est présent : règle Cloudflare « Cache by status code : 404 → no-store » sur `/assets/site/*` (ou `CDN-Cache-Control` court), Cloudflare ne servant que le 200 immuable ;
  - côté site : rendre la navigation visible sans JS (masquée par une classe `js` posée par le script en ligne).

### I-9 — IMPORTANT — Contrôles de la région datée : un libellé de gabarit re-date toutes les pages, et une description modifiée re-date les AUTRES pages

- **Preuve** (`datation.mjs`) :
  - la description (méta) de `/faq` modifiée re-date `/` et `/crosslisting/vinted-vers-leboncoin`, mais pas `/faq` : la carte « À lire aussi » de ces pages affiche cette description ;
  - « À lire aussi » → « Lire aussi » : l'empreinte change (`e1226871…` → `6c39af9a…`) ;
  - « Sommaire » → « Au sommaire » : l'empreinte change aussi ;
  - une classe CSS changée ne change pas l'empreinte (témoin).
- **Cause** : `pagesLiees`, `sommaire` et `bandeauDemonstration` sont DANS `<!--fs:contenu-->` (`site/gabarits/page.mjs:17-22`, `accueil.mjs`).
- **Écart avec le compte rendu** : il affirme « retoucher un gabarit ne date aucune page ». C'est faux pour tout libellé placé dans la région. Un `site:dater` après une retouche de libellé daterait tout le site du jour : le piège même que le verrou devait fermer.
- **Correction proposée** : sortir de la région les éléments de navigation (sommaire, pages liées) et le bandeau de démonstration, ou les entourer d'un marqueur exclu de l'empreinte comme `fs:dates`.

### M-1 — MINEUR — Dates acceptées sans contrôle de vraisemblance

- **Preuve** :
  - essai 11 : `publie: "2030-01-01"` → BUILD VERT, `<lastmod>2030-01-01` au sitemap ;
  - essai 12 : `publie: "2026-02-31"` → BUILD VERT, `<time datetime="2026-02-31" data-maj>3 mars 2026`. `Date.parse('2026-02-31')` donne `1772496000000` (le jour déborde), d'où une date invalide au sitemap et un `datetime` qui contredit le texte ;
  - essai 14 : une date avancée à la main dans le verrou, contenu inchangé → BUILD VERT, `<lastmod>2026-12-25`. Le contrôle « l'inverse » ne compare qu'à HEAD (`verify-site.mjs:449-457`), donc il est muet sur Vercel où le verrou commité EST HEAD.
- **Correction proposée** :
  - valider aller-retour : `new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v` ;
  - refuser une date au-delà d'aujourd'hui (heure de Paris) ;
  - sur Vercel, comparer au verrou de `VERCEL_GIT_PREVIOUS_SHA` (ou au `lastmod` du sitemap servi) : une `maj` qui avance sans changement d'empreinte = refus.

### M-2 — MINEUR — Résolution `page:` trop permissive entre langues (brouillon contourné, lien qui change de langue en silence)

- **Preuve** :
  - essai 13 : brouillon FR plus version EN publiée, puis un lien FR `page:essai/revue` → BUILD VERT, `<a href="/en/essai/revue">essai</a>`. Le refus « BROUILLON » (`build-site.mjs:152`) vient APRÈS le repli « une seule autre version » (`:150-151`) ;
  - essai 10 : une page EN qui lie un article FR seul donne un lien vers du français, sans un mot.
- **Correction proposée** :
  - tester le brouillon AVANT le repli ;
  - lien vers une autre langue : avertissement, ou syntaxe explicite `page:fr:<id>` ; à défaut, `hreflang` sur le lien.

### M-3 — MINEUR — `id` en double : un titre « ## Contenu » ou « ## Navigation » prend l'id du `<main>` (cible du lien d'évitement) ou du menu

- **Preuve** : essai 5 → BUILD VERT, `id="contenu" x2, id="navigation" x2`. Faute 10 du vérificateur : NON VUE.
- **Correction proposée** : réserver les ids du gabarit dans `ancre()` (`contenu`, `navigation`, `fil`…) et faire vérifier par le vérificateur l'unicité des `id`.

### M-4 — MINEUR — Angles morts du vérificateur (fautes injectées, verrou recalé, toutes NON VUES)

`verif-fautes.mjs` :

| Faute injectée | Numéro |
|---|---|
| second `<meta name="robots" content="noindex">` | 3 |
| `<meta name="googlebot" content="noindex">` | 4 |
| second canonical vers une autre page | 5 |
| nœud `@graph` de `@type` `AggregateRating` sous une clé neutre (`clesInterdites` ne lit que les CLÉS, `verify-site.mjs:96-104`) | 6 |
| JSON-LD dans un `<script type="application/ld+json" id="x">` (regex exacte `:88`) | 7 |
| URI `data:` de 2 Ko contenant des espaces (`:315`, la regex s'arrête au premier blanc) | 9 |
| `og:image` vers un fichier absent (essai 7 côté générateur : `og: /og-absente.png` → VERT) | 11 |
| BreadcrumbList qui ne suit pas le fil visible | 16 |
| FAQPage réduite à un fragment (« Non. ») de la réponse visible | 17 |
| `breadcrumb` qui vise un `@id` absent | 18 |
| `<h1>` vide | 19 |
| ancre absente sur une AUTRE page (`/faq#nulle-part`, essai 4 → VERT) | 2 |

Ces fautes viennent d'un gabarit retouché plutôt que du contenu, mais le
vérificateur est présenté comme le dernier rempart.

- **Correction proposée** :
  - toutes les metas `robots` et `googlebot`, et tous les canonicals (exactement un) ;
  - `@type` interdits (`AggregateRating`, `Review`) où qu'ils soient ;
  - tout `<script>` dont `type` vaut `application/ld+json`, quels que soient les attributs ;
  - URI `data:` mesurée jusqu'au guillemet fermant ;
  - `og:image` et `twitter:image` présents dans la sortie ou dans `public/` ;
  - BreadcrumbList égale au fil visible ;
  - résolution des `@id` du graphe ;
  - ancres inter-pages contre les `id` de la cible.

### M-5 — MINEUR — `llms-full.txt` garde des `page:` bruts

- **Preuve** : essai 21. Un lien par référence (`[la FAQ][f]` / `[f]: page:faq`) et un lien titré (`[x](page:faq "La FAQ")`) sont bien résolus dans le HTML (2 liens), mais `llms-full.txt` contient `page:faq "La FAQ")` et `page:faq`. La regex de `build-site.mjs:446` ne connaît ni le titre ni la définition, et le vérificateur ne relit pas `llms-full.txt`.
- **Correction proposée** : produire `llms-full.txt` depuis le mdast déjà résolu (remark-stringify n'est pas disponible : sérialiser le texte et les liens depuis l'arbre), puis faire refuser `page:` et `media:` restants par le vérificateur.

### M-6 — MINEUR — Collision avec `public/` invisible en mode `site:dater`

- **Preuve** : essai 9, page `site/contenu/fr/landing/essai.md` → « DATER VERT (collision non vue) ».
- **Cause** : `dejaLa` (`build-site.mjs:166`) liste le dossier de sortie, et en mode dater il est vide (jetable supprimé). Le build complet la refuse bien, mais le compte rendu la range parmi les « 13 refus prouvés (mode dater) ».
- **Correction proposée** : lire `public/` en plus du dossier de sortie.

### M-7 — MINEUR — Nom de fichier libre : il devient l'URL sans contrôle

- **Preuve** : essai 6. `site/contenu/fr/Mon Guide.md` donne la page `/Mon Guide` (canonical avec une espace). Le build tombe, mais seulement par ricochet : « lien /Mon%20Guide répondrait 404 » puis « page ORPHELINE ».
- **Correction proposée** : appliquer au CHEMIN du fichier le motif de `id` (`[a-z0-9-/]`), avec un message direct.

### M-8 — MINEUR — `indexnow.json` se trompe de référence dès qu'un lot compte plusieurs commits, et il est servi publiquement

- **Preuve** : `build-site.mjs:462-473`. Le verrou de l'arbre égal à HEAD donne la référence `HEAD^`. Or la règle du dépôt est « commits séparés, UN push » : si le commit du contenu n'est pas le dernier du lot, `urls` est vide. `/indexnow.json` répond 200 (matrice).
- **Correction proposée** : comparer au verrou de `VERCEL_GIT_PREVIOUS_SHA` ou, mieux, laisser le script d'envoi comparer le sitemap servi au nouveau ; écrire le fichier hors du dossier servi (ou le servir en `noindex`, hors cache).

### M-9 — MINEUR — Soft 404 restant sur `/blog/<slug inconnu>`

- **Preuve** : `vercel.json:118` réécrit `/blog/(.*)` vers la coquille ; la matrice donne `/blog/inconnu → 200 COQUILLE` (canonical vers l'accueil dans le HTML brut). Tous les articles sont écrits en statique dans les deux modes de build (le prérendu du blog le fait aussi hors site) : ce rewrite ne sert plus que les slugs inconnus.
- **Correction proposée** : retirer `/blog` et `/blog/(.*)` des rewrites (un slug inconnu répond un vrai 404), et ajouter une redirection 301 par article renommé. À arbitrer, l'architecture l'avait gardé.

### M-10 — MINEUR — Divers SEO et accessibilité

- **`@id` de l'accueil** : `https://fillsell.app#page` (sans slash) côtoie `https://fillsell.app/#organization` ;
  - `inLanguage` vaut `fr-FR` / `en`, quand `hreflang` et `lang` valent `fr` / `en` ;
  - `publisher` de BlogPosting recopie en partie le nœud `#organization` (nom, logo) au lieu d'y renvoyer seulement ;
  - l'auteur « Équipe FillSell » est une Organization sans `@id`.
  - **Correction** : `@id` construits sur `ORIGINE + '/'` à la racine, une seule forme de langue, renvoi par `@id`.
- **`/app-shell.html`** est servi directement, en 200, `index, follow`, avec le canonical et le titre de l'accueil.
  - **Correction** : prouver sur la prévisualisation qu'un `X-Robots-Tag` posé sur `/app-shell.html` ne touche pas les chemins réécrits, puis le poser ; sinon, ne rien faire.
- **Suggestion « This page is available in English »** : insérée AVANT le lien d'évitement (`site.js:116`), elle devient le premier arrêt du clavier ; en position fixe en haut, elle recouvre le logo sur mobile.
  - **Correction** : l'insérer après `.evitement`, et décaler son `top` sous l'en-tête.
- **Menu mobile** : Échap ferme le menu sans rendre le focus au bouton (`site.js:83`). Le focus tombe sur `body` si un lien du menu l'avait.
  - **Correction** : `bouton.focus()` à la fermeture par Échap.
- **Bandeau de consentement** : `role="dialog"` ajouté en FIN de `body`, sans gestion du focus. Il est atteint en dernier au clavier.
  - **Correction** : le placer en tête du `body`, ou passer à `role="region"` avec un libellé, sans piège à focus.
- **Plage de la police** : `→` (U+2192, cartes du blog) est hors `unicode-range` et s'affiche donc dans une autre police.
  - **Correction** : ajouter U+2192 au sous-ensemble.
- **Serveur d'aperçu** : il n'est pas fidèle à la casse sous Windows (`/FAQ` → 200 en local, 404 sur Vercel).
  - **Correction** : comparer la casse exacte du chemin à `readdirSync`.
- **Avertissements de longueur** : ils ne sont pas tous anciens. `blog/index.html` a une description de 184 caractères, et c'est le texte NOUVEAU de `TEXTE_LISTE.fr.chapo` (`build-site.mjs:280`).
- **Selftest des balises** : la parité de la sortie n'est jouée que si `build/site-apercu` existe, éventuellement périmé (`site-balises-selftest.mjs:84-102`). Le vérificateur intégré la rejoue de toute façon.

## 3. Ce qui tient (vérifié, pas seulement lu)

- **Refus du générateur** :
  - `page:inconnue` → « page:inconnue inconnu » (essai 1) ;
  - texte modifié sans `site:dater` → « DATES PÉRIMÉES … /crosslisting/vinted-vers-leboncoin (contenu changé) » (essai 2) ;
  - HTML brut `<img onerror>` / `<script>` dans le Markdown : échappé (essai 15).
- **Head complet** : `charset` en premier, viewport sans blocage du zoom, `<title>` et description uniques, `robots`, canonical absolu sans slash final, hreflang fr/en/x-default réciproques et identiques au sitemap, OG et Twitter (images 1200×630 présentes dans `public/`), icônes et manifeste repris d'`index.html`, police préchargée avec `crossorigin` et même URL que `@font-face`.
- **404.html** : `noindex, follow`, sans canonical, bilingue avec `lang` par section.
- **robots.txt** : identique à `public/robots.txt` (un seul groupe `*`, `$` gardé, Sitemap absolu).
- **llms.txt / llms-full.txt** : `text/plain; charset=utf-8` et `noindex` (en-têtes `vercel.json`).
- **sitemap.xml** :
  - 15 URL, sans `changefreq` ni `priority` ;
  - `lastmod` égal à la date visible et au `dateModified` ;
  - les 9 URL du sitemap de prod sont gardées.
- **Statique** :
  - police, médias et site.js sous `/assets/site/` à empreinte ;
  - un fichier manquant répond un vrai 404, jamais la coquille.
- **site.js** :
  - 2 868 o gzip ;
  - `cta_click` poussé avec `eventCallback` et `eventTimeout: 800`, plus une minuterie à nous qui assure la navigation (garde `parti` contre le double appel GTM + gtag) ;
  - `fs_lang` jamais écrit au chargement ;
  - textes du consentement partagés avec l'app.
- **Accessibilité de base** : `lang` sur `<html>` et sur le lien de langue, lien d'évitement, un seul `<h1>`, `aria-expanded` / `aria-controls` sur le menu, tableaux en `region` focalisable, `:focus-visible` présent (mais trop pâle, I-5).

## 4. Affirmations du compte rendu à corriger

| Affirmation | Correction |
|---|---|
| « Retoucher un gabarit ne date aucune page. » | Faux pour les libellés dans la région (I-9). |
| « 16 fautes injectées une à une … toutes détectées. » | Vrai pour SES 16 fautes. 12 autres passent (M-4), dont le lien relatif et l'ancre inter-pages (I-2). |
| « 13 refus prouvés (mode dater) … collision avec public/landing. » | La collision n'est PAS vue en mode dater (M-6). |
| « Les 10 avertissements portent sur des articles de blog existants, non modifiés. » | L'un porte sur la description nouvelle de `/blog` (M-10). |
| « Le refus des dates périmées est prouvé. » | Vrai. Il s'étend aussi à `Legal.jsx`, fichier de l'app, d'où I-3. |

## 5. À prouver sur la prévisualisation avant le GO (complète la liste du compte rendu)

Commandes :

```
curl -sI https://<prev>/faq                       # 200 servi par faq/index.html (trailingSlash:false + dossier)
curl -sI https://<prev>/faq/                      # 308 → /faq
curl -sI https://<prev>/assets/site/x.js          # 404 : lire cache-control (I-8)
curl -sI https://<prev>/inexistant                # 404 + corps 404.html malgré les rewrites
curl -sI https://<prev>/legal                     # coquille, SANS X-Robots-Tag
curl -sI https://<prev>/auth/confirm?code=x       # coquille + X-Robots-Tag noindex (en-tête lu sur le chemin DEMANDÉ)
curl -sI https://<prev>/FAQ                       # 404 (casse, M-10)
```

Puis, sur la prévisualisation :

- relire le journal du build : « site généré », « 0 erreur(s) », et `vercel.json` réécrit par la plateforme (CLAUDE.md, 01/10) toujours lisible par `verifierDestinationsRewrites` ;
- lire `VERCEL_GIT_PREVIOUS_SHA` dans l'environnement du build, pour M-1 et M-8.
