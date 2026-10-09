# Site vitrine statique — mode d'emploi (09/10/2026)

Le site public de fillsell.app (accueil, guides, plateformes, fonctions,
comparatifs, tarifs, FAQ, glossaire, blog) est écrit en HTML COMPLET au build,
sans React ni hydratation. L'app (`/app`, `/login`, `/auth/*`…) reste la SPA,
servie par sa coquille `app-shell.html`. Architecture : `docs/seo/ARCHITECTURE.md`
et ses revues ; **contrat des types de pages** : `docs/seo/FORMAT-CONTENU.md` ;
**design** (direction, jetons, composants, captures, scores) :
`docs/seo/design/DESIGN.md`. Pour les autres terminaux et Codex :
`docs/agents/site-vitrine.md`.

> Contenu ACTUEL (09/10 nuit) = la RÉDACTION RÉELLE (`docs/seo/redaction/`) :
> 39 pages FR, 7 pages EN (mode économe voulu par Nico : seules les pages
> anglaises écrites existent ; un lien vers une page sans version anglaise
> s'écrit `page:fr:<id>` suivi de « (in French) »), 9 articles de blog. Plus
> aucune page de démonstration ; `demonstration: true` reste REFUSÉ en
> production (`VERCEL_ENV=production`, ou un build local sur `main`).
> `/blog/publier-annonce-plusieurs-plateformes` est redirigé (308) vers
> `/crosslisting` (`vercel.json`).

## Décisions de Nico (09/10) que le moteur fait respecter

- Plateformes : celles de `site/donnees/plateformes.yml` (Vinted, Leboncoin,
  eBay, Beebs, Depop). La plateforme sortie le 10/10 n'existe nulle part : le
  vérificateur refuse toute page, tout `llms*.txt` qui la nomme.
- **Aucun chiffre de quota ni de plafond** : la mécanique `{{quota:…}}`,
  `site/js/quotas.js`, la lecture de `coin_config` et la meta `fillsell-quotas`
  sont RETIRÉES ; un ancien jeton de quota fait échouer le build (avec sa
  raison) ; `tarifs.yml` refuse tout chiffre dans ce qui est inclus ; le
  vérificateur refuse « 50 republications par mois » et toute trace technique.
- Republication automatique : la liste vient de `republication_auto` des
  données, écrite par le jeton `{{republication}}` — jamais en dur, jamais un
  palier à côté, jamais eBay à côté (le vérificateur le relit).
- Aucun logo de plateforme sur les pages (noms en texte, dans des étiquettes) ;
  la non-affiliation est au pied de chaque page, tirée des données.

## Ajouter une page — le geste

1. Écrire `site/contenu/<langue>/<chemin>.md` (langues : `site/langues.mjs`).
   **Le chemin du fichier EST l'URL** : minuscules, chiffres, `-` et `/`.
   `site/contenu/fr/crosslisting/vinted-beebs.md` → `/crosslisting/vinted-beebs` ;
   `site/contenu/en/…` → `/en/…` ; `accueil.md` → `/` (fr) et `/en` (en).
2. Le frontmatter (YAML validé ; un champ inconnu, ou propre à un autre type,
   = build rouge avec le fichier et le champ nommés). Le **type** choisit le
   gabarit : `accueil` (seulement `accueil.md`), `guide`, `trajet`,
   `plateforme`, `fonction`, `comparatif`, `alternative`, `classement`,
   `tarifs`, `glossaire`, `faq`. Champs et blocs de chaque type :
   **`docs/seo/FORMAT-CONTENU.md`**. Champs communs :

   | Champ | Rôle | Limites |
   |---|---|---|
   | `id` | COMMUN à toutes les langues de la page : relie les hreflang ; cible des liens `page:` | minuscules, chiffres, `-`, `/` |
   | `type` | le gabarit | voir ci-dessus |
   | `lang` | doit égaler le dossier `contenu/<lang>/` | une langue de `site/langues.mjs` |
   | `nom` | nom court : menu, fil d'Ariane, pied | 3 à 40 |
   | `title` | le `<title>` complet, marque comprise | 15 à 70 |
   | `description` | la meta description | 70 à 165 |
   | `h1`, `chapo` | titre et réponse directe en tête de page | 5-90, 40-420 |
   | `publie` | date de publication, ENTRE GUILLEMETS | `"AAAA-MM-JJ"` qui existe, jamais dans le futur |
   | `surtitre` | petit libellé au-dessus du h1 | 3 à 48 |
   | `points_cles` | « l'essentiel en 10 secondes » | 3 à 5 phrases de 20 à 220 |
   | `hero_media`, `hero_alt` | capture dans son cadre (téléphone, fenêtre ou carte, selon ses proportions) ; texte alternatif OBLIGATOIRE | chemin sous `site/medias` |
   | `cta` | appel principal du héros | `inscription` (défaut), `extension`, `stores` |
   | `etapes` | `{ titre, texte, media?, alt? }` : bloc d'étapes numérotées + JSON-LD HowTo | 2 à 8 ; titre 3-70, texte 20-320 |
   | `plateformes_citees` | étiquettes de plateformes sous le titre | ids OUVERTS de `plateformes.yml` |
   | `liens`, `fil` | pages liées (fin de page), étapes intermédiaires du fil d'Ariane | ids de MÊME langue |
   | `faq` | le corps porte « ## Questions fréquentes » | booléen |
   | `og` | image de partage FORCÉE (fichier de `public/`) — par défaut la carte de `npm run site:og` | `.png`, `.jpg` |
   | `brouillon` | JAMAIS générée, jamais au sitemap | booléen |
   | `demonstration` | bandeau « brouillon de démonstration » — refusé en production | booléen |

   Pas de commentaire `#` en bout de ligne ; une valeur qui contient « : » ou
   « # » (liste comprise) s'écrit entre guillemets.
3. **Jetons** (corps ET frontmatter, remplacés AVANT la validation) :
   `{{plateformes}}` (« Vinted, Leboncoin, eBay, Beebs et Depop »),
   `{{republication}}` (« Vinted, Leboncoin, Beebs et Depop »),
   `{{nb_plateformes}}` (« cinq » / « five »). Tirés de `plateformes.yml` :
   une ligne de données change toutes les pages. Un jeton inconnu = build rouge.
   ⛔ Jamais `{{plateformes}}` et la republication dans la même phrase (eBay
   n'est jamais à côté de la republication : le vérificateur le refuse).
4. Le corps en Markdown (GFM : tableaux compris).
   - **Tableau** : sa région se nomme par le TITRE qui le précède (mets un `##`
     ou `###` au-dessus) ; coin d'en-tête vide (`| | Vinted | Beebs |`) = la
     première colonne devient l'en-tête de chaque ligne (lecteurs d'écran).
   - **Bloc de code** (```) : défile dans sa boîte (classe `bloc-code`), jamais
     la page.
   - **Lien vers une page du site** : `[texte](page:<id>)` ; autre langue :
     `page:fr:<id>` (le lien porte `hreflang`) ; ancre : `page:faq#…`.
   - **Autres liens permis** : `#ancre`, `mailto:`, `tel:`, `https://…` EXTERNE,
     et les routes de l'app (`/login?mode=signup`, `/extension`).
   - **Image** : `![texte alternatif obligatoire](media:<chemin sous site/medias>)`.
     Une capture d'écran HAUTE (téléphone) se pose seule dans un cadre de
     téléphone dessiné en CSS, avec la mention « compte de démonstration ».
     Puis `npm run site:images` (AVIF/WebP en 480/720/960/1440 px, manifeste).
   - **FAQ** : `## Questions fréquentes`, puis une `### Question ?` par question.
     Rendue en `<details>` accessibles ; le JSON-LD FAQPage reprend le texte
     VISIBLE. Type `faq` : toutes les `###`.
   - **Glossaire** : `### Terme`, puis UNE phrase de définition (le premier
     paragraphe), puis un exemple → JSON-LD DefinedTermSet.
   - Titres `##` / `###` : ancres automatiques ; à partir de trois `##`, un
     sommaire cliquable (collant sur ordinateur).
5. `npm run site:images` (si des captures sont citées), `npm run site:og` (carte
   de partage : titre ou plateformes changés), `npm run site:dater`, puis
   `npm run site:apercu` (build dans `build/site-apercu/` + serveur local qui
   rejoue `vercel.json`, compression comprise : http://127.0.0.1:4319/).
6. `git add` des fichiers NOMMÉS (contenu, `site/dates.lock.json`,
   `site/medias/generees/`, `site/medias/og/`), un seul push par lot.

## Les données (`site/donnees/`)

| Fichier | Contenu | Qui l'écrit |
|---|---|---|
| `plateformes.yml` | plateformes, pays et domaines ouverts, `mode` (extension / api), `republication_auto`, `vente_enregistree_seule`, `autorisation` | à la main (geste unique : Depop retiré de la republication = une ligne) |
| `tarifs.yml` | paliers (prix par mois, EUR, ce qui est inclus SANS chiffre), « dans tous les forfaits », mentions | à la main ; le build refuse un chiffre |
| `concurrents.yml` | faits concurrents (valeur, verdict, sources https, date, niveau, `traductions`), classement | **généré** : `npm run site:concurrents` depuis `docs/seo/briefs/concurrents.yml` (valide sources/dates/niveaux, retire l'interne, la plateforme sortie et, de la ligne FillSell, tout palier écrit à côté de la republication ; un texte du brief peut s'écrire `{ fr, en }`) — relancer après chaque mise à jour du brief |

## Les médias

| Dossier | Quoi | Geste |
|---|---|---|
| `site/medias/captures/` | captures de l'app (harnais `scripts/apercu/site-*`, compte de démonstration) | cité par `hero_media`, `etapes`, `fonctions`, `media:` → `npm run site:images` |
| `site/medias/video/` | vidéo de présentation (AV1, VP9, MP4, affiche, `video.json`) | `video: true` sur l'accueil ; publiée telle quelle, si chaque fichier a le poids que `video.json` déclare (`poids_octets`, `sha256` facultatif) — sinon build du site rouge (fichier tronqué) |
| `site/medias/badges/` | badges OFFICIELS App Store (noir, SVG) et Google Play (PNG officiel + WebP sans perte servi), FR et EN | téléchargés le 09/10 ; ne jamais retoucher l'artwork |
| `site/medias/marque/` | icône FillSell 64 px (en-tête, pied) | — |
| `site/medias/og/` | cartes de partage 1200×630 par page et langue + manifeste | `npm run site:og` (Playwright, Chrome du poste) |
| `site/medias/generees/` | variantes AVIF/WebP + manifeste | `npm run site:images` |

## Les règles (le build les fait respecter)

- **Chemins réservés à l'app** (`scripts/site/routes-app.mjs`) : aucune page
  sur `/app`, `/login`, `/auth`, `/extension`, `/legal`… `/blog/…` est partagé.
- **Dates honnêtes** : la date de mise à jour vient de `site/dates.lock.json`
  (empreinte du CONTENU PRINCIPAL, sans l'habillage du gabarit : texte, cibles
  des liens, texte alternatif et dimensions des images — donc aussi les jetons
  de `plateformes.yml`, les tarifs, les faits concurrents ; PAS la vidéo, qui a
  sa propre date). Contenu changé sans `npm run site:dater` = build du site
  local rouge ; dans les builds de l'app (natif, OTA) et sur Vercel, un
  avertissement.
- **Cartes de partage** : absente ou périmée = build du site local rouge
  (`npm run site:og`) ; avertissement et repli (carte de l'accueil) sur Vercel
  et dans les builds de l'app.
- **Jamais de logo de plateforme** sur les pages (le vérificateur refuse une
  image « logo » et un SVG aux couleurs d'une plateforme) ; les captures et la
  vidéo montrent les logos tels que l'app les dessine.
- **Lexique** (fiche de vérité § 15 + décisions de Nico) relu dans le `<main>`
  des pages vitrine : bot, robot, temps réel, zéro risque, « le seul outil »,
  partenaire officiel… et les DÉCISIONS (`REGLES_DECISION`) : aucun palier,
  plan ou forfait dans la phrase d'une republication (republi*, remont*,
  repost*, relist* — « à tous les paliers », « Avec Pro », « dès le gratuit »),
  lignes de tableau jointes ; jamais eBay à côté de la republication ; jamais
  « Vinted, Leboncoin, eBay et Beebs » sans Depop. Le blog : décisions en
  avertissement. Les faits des concurrents (`data-tiers`) en sont exclus.
  Depuis le 09/10 (nuit) : le lexique ne relit pas les CITATIONS (`<blockquote>`,
  passages entre « » ou “ ”, le fichier robots.txt — les conditions des
  plateformes citées mot pour mot) ; les règles de décision ne prennent pas les
  NOMS d'outils Relistly et Reposter pour un verbe (`sansNomsOutils`). Le
  vérificateur ne nomme que la PREMIÈRE faute par page et par règle : après une
  correction, relancer.
- **Recouvrement** : deux pages d'une même langue ne partagent pas 40 % ou plus
  des séquences de 5 mots (avertissement dès 25 %).
- **Contrastes** : les paires de jetons de `site.css` (`PAIRES_CONTRASTE`)
  tiennent WCAG AA (4,5:1 texte, 3:1 anneau de focus), y compris sur les fonds
  MÊLÉS (halos du héros et des têtes, tête du dégradé sombre, coins de l'appel
  final) : la couleur à alpha est composée sur son fond, au plus fort.
- **Budgets** : HTML ≤ 120 Ko par page ; **CSS en ligne ≤ 26 Ko PAR PAGE** (la
  feuille est découpée en modules, chaque page n'embarque que les siens —
  `docs/seo/design/DESIGN.md`) ; `site.js` ≤ 6 Ko gzip. Relevés le 09/10 (nuit)
  avec la rédaction réelle (80 / 24 Ko avaient été posés sur la démonstration) :
  pages longues de 82 à 105 Ko (~24 Ko en brotli), accueil à 25,6 Ko de CSS.
- **HTML de `public/`** : nommé dans `HTML_PUBLIC_PERMIS` (`routes-app.mjs`).

## Où vit quoi

| | |
|---|---|
| `site/langues.mjs` | les langues (préfixe, hreflang, og:locale, locale, x-default) |
| `site/donnees/*.yml` | plateformes, tarifs, concurrents (voir plus haut) |
| `site/contenu/<langue>/` | les pages (Markdown + frontmatter) |
| `src/blog/*.md` | le blog — PARTAGÉ avec la SPA (aucun jeton n'y est remplacé : les listes de plateformes s'y écrivent en clair ; FAQ du frontmatter = FAQ visible, `selftest:site-blog-lecteurs`) |
| `site/gabarits/layout.mjs` | tête, en-tête (menu + sous-menu Plateformes), pied |
| `site/gabarits/accueil.mjs`, `page.mjs`, `article.mjs`, `liste.mjs`, `introuvable.mjs` | gabarits (page.mjs sert guide, trajet, plateforme, fonction, comparatif, alternative, classement, tarifs, glossaire, faq) |
| `site/gabarits/composants.mjs`, `blocs.mjs` | composants (captures en cadre, étiquettes, badges, étapes…) et blocs tirés des données (comparaison, tarifs, capacités, classement…) |
| `site/gabarits/donnees-structurees.mjs` | JSON-LD par type |
| `site/gabarits/textes.mjs` | libellés par langue |
| `site/styles/site.css` | système de design : socle + modules (`@module nom : classes`) |
| `site/js/aiguillage.js` | script EN LIGNE (aiguillages de `/`, captures d'acquisition) |
| `site/js/site.js` | JS non vital : mesure, consentement, menu, sous-menu, langue, vidéo au clic |
| `scripts/site/` | générateur, vérificateur, images, cartes OG, concurrents, dates, aperçu |

## Commandes

| | |
|---|---|
| `npm run site:apercu` | build complet dans `build/site-apercu/` puis serveur local ; `-- --sans-serveur` pour le build seul |
| `npm run site:serveur [dossier]` | le serveur seul (rejoue `vercel.json`, compresse comme Vercel) |
| `npm run site:verifier [dossier]` | contrôle d'une sortie, sans JS |
| `npm run site:dater` | met à jour `site/dates.lock.json` |
| `npm run site:images` | variantes AVIF/WebP des images citées |
| `npm run site:og` | cartes de partage (`-- --tout` pour tout refaire) |
| `npm run site:concurrents` | `site/donnees/concurrents.yml` depuis le brief |
| `npm run site:indexnow-liste -- <avant> [après]` | URL à signaler à IndexNow (rien n'est envoyé) |
| `npm run build:vercel` | LA commande de build de Vercel — jamais pour le natif |
| `npm run selftest:site-moteur` · `-aiguillage` · `-routes-app` · `-balises` · `-blog-lecteurs` · `-consentement` | selftests du site |

`FILLSELL_SITE_CONTROLE=0` saute, bruyamment, les contrôles du site et des
routes en début de build (OTA d'urgence seulement).
