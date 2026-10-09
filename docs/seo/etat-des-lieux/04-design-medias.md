# 04 — Design et médias (préparation des étapes 5 et 6)

Chantier SEO/GEO FillSell — état des lieux du **09/10/2026**, branche `seo-crosslisting`
(`C:\Users\nicol\fill-and-sell-seo`, identique à `origin/main` au moment de la lecture).

Travail en LECTURE SEULE : rien n'a été écrit dans le dépôt principal, rien n'a été
commité, poussé ni déployé, aucune requête SQL, aucune connexion à fillsell.app. Les
images extraites (vidéos, captures d'essai) sont restées dans le scratchpad de la
session. Les mesures de contraste ont été CALCULÉES (formule WCAG 2.x) par un script,
pas estimées. Chaque constat externe porte son URL et la date d'observation (09/10/2026).

---

## 0. Ce qu'il faut retenir

1. **La référence visuelle est la landing actuelle** (dessin « FillSell Landing » de
   Claude Design, en ligne depuis le 07/09/2026, `src/pages/LandingPage.jsx` + `landing.css`),
   qui reprend les jetons de l'app (`UI` de `src/components/ui.jsx`). Le blog
   (`blog.css`) vit sur une palette PLUS ANCIENNE et doit être aligné ; `design_extract/`
   (Nunito, « Fill & Sell », juin) est obsolète.
2. **Trois défauts de contraste de la charte actuelle** à corriger dans les pages
   statiques : le teal `#2F9E90` en texte sur fond clair (2,72:1 sur le canvas — même
   la moitié colorée des grands titres échoue au seuil 3:1), le gris `#8A8578` en petit
   texte (3,06:1) et le pied `#A39D8E` (2,48:1). Le blanc sur le dégradé des CTA descend
   à 4,41:1 au milieu du bouton. Corrections proposées § 1.3 (rendu quasi identique).
3. **Logos des plateformes** : Vinted et eBay sont des tracés simple-icons, Leboncoin et
   Beebs sont les icônes d'app récupérées par l'API iTunes. Aucune licence d'usage
   marketing. eBay écrit noir sur blanc que ses logos ne sont pas permis dans des
   supports marketing sans autorisation ; Vinted, que l'usage du signe « Vinted »
   demande une autorisation écrite. **Décision de Nico** (§ 1.13).
4. **Images** : les 8 photos produit de la landing (`public/landing/*.webp`) sont
   réutilisables. **Toutes les images OG actuelles sont à refaire** : `og-image.jpg`/`.png`
   annoncent « Depop · Poshmark » (et `og-image.jpg` est l'image OG d'un article de blog
   publié), `og-image-en.png` porte l'ancien nom « Fill & Sell », `og-image-fillsell.png`
   (l'OG de tout le site) dessine de faux logos de plateformes et un faux badge App Store.
5. **Vidéo de présentation trouvée** : `C:\Users\nicol\fillsell-video\SORTIE\FillSell-video-finale.mp4`
   (projet Remotion, 08/10/2026) — 80,5 s, 1080×1920 vertical, 30 i/s, 36,9 Mio, musique
   synthétisée maison. **Elle montre les VRAIES données du compte de Nico** (articles,
   prix, tableau de bord : 646,90 € de profit net, 235 ventes, 5 423,19 € de revenu brut)
   et une scène **« Bientôt : FillSell Cloud »** (non lancé). Non publiable telle quelle ;
   le projet source permet une variante « site » en quelques changements (§ 3.3).
6. **Le harnais `scripts/apercu/` fonctionne sur cette machine** : Playwright 1.61.1 +
   Chrome 154 (`channel: 'chrome'`), six écrans réels montés et capturés sans erreur
   pendant cet état des lieux. Tous les écrans clés demandés sont montables avec des
   données fictives ; difficulté et pièges par écran § 4.3.
7. **Badges stores** : Apple (SVG distant, 44 px) et Google Play (PNG distant, visuel aligné
   à 44 px) ; le badge Apple BLANC du CTA final, posé à côté de Google Play, contredit la
   règle d'Apple (badge noir dès qu'un autre badge figure). L'extension n'a pas de badge
   officiel : bouton maison vers le Chrome Web Store.

---

## 1. Brief de design réutilisable (pages statiques)

### 1.1 Sources lues et ce qui fait foi

| Source | Rôle | Statut |
|---|---|---|
| `src/pages/LandingPage.jsx` (159 Ko, styles en ligne) + `src/pages/landing.css` (keyframes, media queries, cloisonné `.lp-root`) | Dessin de la vitrine actuelle | **Référence** |
| `src/components/ui.jsx` (`UI`), `src/entree/theme.js`, `src/stock/jetons.js` | Jetons de l'app (mêmes valeurs que la landing) | **Référence** |
| `C:\Users\nicol\fill-and-sell-design\stock-redesign\NOTES.md` (refonte Stock, 03/10, planche v7) | Jetons, échelle typo, grille 8 px, composants de l'app | Référence pour les écrans d'app |
| `src/base.css` | Socle commun (reset, Space Grotesk, champs à 16 px) | À reprendre |
| `src/App.css` (v2) / `src/App.redesign.css` (v1.3) | Anciennes variables (`--teal #2DB89A`, `--bg #FAFBFB`…) | Partiellement obsolète ; `--bg #FAFBFB` reste le fond de l'app |
| `src/pages/blog.css` | Palette du blog (`#3EACA0`, `#1D9E75`, `#6B7280`…) | **Désalignée** (§ 1.3, 1.4) |
| `src/pages/ExtensionPage.jsx` | Page `/extension` (jetons `UI`, 560 px de large) | Cohérente |
| `design_extract/redesign1-3/` (bundle Claude Design, juin, Nunito, « Fill & Sell ») | Ancien redesign | **Obsolète** |
| `index.html` | Polices, `theme-color #2F9E90`, fond `#EDEAE0` | Référence |

Rendu vérifié : la landing, `/extension` et `/blog` ont été rendues localement (serveur
Vite du worktree, toutes requêtes vers supabase.co / fillsell.app / traceurs bloquées) et
lues : fond de page calculé `rgb(237,234,224)` = `#EDEAE0` sur les trois routes.

### 1.2 Couleurs (valeurs exactes, rôles)

Fréquence dans `LandingPage.jsx` entre parenthèses.

| Jeton proposé | Valeur | Rôle observé |
|---|---|---|
| `--encre` | `#10201B` (22) | Texte principal, sélection pleine (FR/EN actif), fond CTA final, carte Pro |
| `--vert-nuit` | `#10302B` (21) | Fond des sections sombres (avec radial `#1B6E62` en haut à gauche) |
| `--teal` | `#2F9E90` (69) | Accent : début du dégradé CTA, coches, sur-titres, mots en relief des titres |
| `--teal-profond` | `#1B6E62` (23) | Liens, bouton contour, fin du dégradé CTA, texte des pastilles |
| `--menthe-vive` | `#4ECDC4` (54) | Accent SUR FOND SOMBRE : sur-titres, chiffres, mots en relief |
| `--menthe-reflet` | `#6FDFD3` / `#C6F5EF` | Reflet du « shimmer » (clair / sombre) |
| `--canvas` | `#EDEAE0` (11) | Fond de page (jamais blanc pur : choix assumé, cf. `index.html`) |
| `--papier` | `#F6F5F1` (53) | Surfaces claires : sections alternées, cartes, FAQ, bandeau de preuve, pied |
| `--carte` | `#FFFFFF` | Cartes de l'app (`UI.card`) |
| `--fond-app` | `#FAFBFB` | Fond de l'app connectée (`--bg`) — pour les cadres d'écran |
| `--trait` | `#E7E3D8` (36) | Bordures 1 px partout |
| `--trait-fort` | `#D8D3C6` (13) | Séparateurs verticaux |
| `--trait-doux` | `#EFECE3` | Séparateurs internes (app) |
| `--texte-2` | `#5C6560` (22) | Texte secondaire, paragraphes, liens de nav |
| `--texte-3` | `#8A8578` (18) | Mentions discrètes (« / mois », « Gratuit pour commencer ») — **grand texte seulement** |
| `--texte-placeholder` | `#6B7A75` | Placeholders, loupe (app) |
| `--peche` | `#E8956D` | Touche chaude : halos radiaux, bouton « Passer Pro » (avec texte encre) |
| `--peche-clair` | `#F2B48C` | Fin du dégradé Pro |
| `--or` | `rgba(214,178,96,.55)` / `#E7B84C`, `#FBE9A6` | Liseré et texte du badge Pro |
| Business | `#060B09`, dégradé `#F4FFFD → #9BE8DC → #F2C98A` | Carte et bouton Business |
| Wordmark (app, blog, vidéo) | dégradé 135° `#3EACA0 → #E8956D` | « FillSell » en Plus Jakarta Sans italique 800 |
| Icône d'app | haut `#01BFCF` → bas `#FE7108` (pixels mesurés sur `AppStore_1024x1024.png`) | Logo (carré arrondi, sac blanc + flèche) |
| États app | ambre `#8A6100`/`#FFF6E3`/`#EED9A6`, point `#E0A53C` ; rouge `#B91C1C`/`#FEF2F2` ; négatif `#9B5148` ; menthe `#EFF4F2`/`#D6E2DE` | Pastilles d'état (NOTES.md § 1) |

Couleurs de marque tierces utilisées par les logos : Vinted `#007782`, eBay `#E53238`
(simple-icons), Depop `#FF2300` (à ne pas montrer, § 1.13).

**Incohérences à connaître** : `theme-color` vaut `#2F9E90` dans `index.html`,
`#1D9E75` dans `public/manifest.json` (dont la description dit encore « Suivi de profits
revente ») et `#4ECDC4` dans `public/site.webmanifest`. Les pages statiques devraient
porter `#2F9E90` (ou `#10302B` si l'en-tête devient sombre).

### 1.3 Contrastes mesurés (WCAG 2.x, calcul exact)

AA = 4,5:1 (texte courant), 3:1 (grand texte : ≥ 24 px, ou ≥ 18,66 px gras).

| Usage | Paire | Ratio | Verdict |
|---|---|---|---|
| Encre / canvas | `#10201B` / `#EDEAE0` | 14,02 | AAA |
| Encre / papier | `#10201B` / `#F6F5F1` | 15,47 | AAA |
| Encre / blanc | `#10201B` / `#FFFFFF` | 16,87 | AAA |
| Texte secondaire / canvas | `#5C6560` / `#EDEAE0` | 5,01 | AA |
| Texte secondaire / papier | `#5C6560` / `#F6F5F1` | 5,52 | AA |
| Texte secondaire / blanc | `#5C6560` / `#FFFFFF` | 6,03 | AA |
| **Gris discret / canvas** | `#8A8578` / `#EDEAE0` | **3,06** | grand texte seulement |
| Gris discret / papier | `#8A8578` / `#F6F5F1` | 3,37 | grand texte seulement |
| Placeholder / canvas | `#6B7A75` / `#EDEAE0` | 3,74 | grand texte seulement |
| Placeholder / blanc | `#6B7A75` / `#FFFFFF` | 4,50 | AA (limite) |
| **Pied « © 2026 »** | `#A39D8E` / `#F6F5F1` | **2,48** | ÉCHEC |
| Wordmark landing / en-tête | `#4A5A52` / `#FAFAF8` | 6,99 | AA |
| **Teal en texte / canvas** (sur-titres 12 px, mots en relief du H1) | `#2F9E90` / `#EDEAE0` | **2,72** | ÉCHEC, même en grand texte |
| Teal / papier | `#2F9E90` / `#F6F5F1` | 3,00 | grand texte seulement |
| Teal profond / canvas | `#1B6E62` / `#EDEAE0` | 5,05 | AA |
| Teal profond / papier | `#1B6E62` / `#F6F5F1` | 5,57 | AA |
| Blanc / dégradé CTA — début | `#FFFFFF` / `#2F9E90` | 3,27 | grand texte seulement |
| Blanc / dégradé CTA — milieu | `#FFFFFF` / `#258679` | 4,41 | sous AA pour 15,5 px gras |
| Blanc / dégradé CTA — fin | `#FFFFFF` / `#1B6E62` | 6,08 | AA |
| Blanc / pastille « Le plus populaire » (début) | `#FFFFFF` / `#37AC9C` | 2,78 | ÉCHEC (10,5 px) |
| Pastille quota (sur canvas) | `#1B6E62` / `#DAE2D8` (10 % teal composé) | 4,59 | AA |
| Titre clair / section sombre | `#F6F5F1` / `#10302B` | 13,01 | AAA |
| Paragraphe 72 % / section sombre | `#B6BEBA` / `#10302B` | 7,48 | AAA |
| Paragraphe 72 % / coin radial `#1B6E62` | `#B9CFC9` / `#1B6E62` | 3,72 | à éviter dans le coin |
| Menthe vive / section sombre | `#4ECDC4` / `#10302B` | 7,34 | AAA |
| Blanc / encre (CTA final, Pro) | `#FFFFFF` / `#10201B` | 16,87 | AAA |
| Sous-titre 60 % / carte Pro | `#9AA09B` / `#10201B` | 6,33 | AA |
| Encre / pêche (« Passer Pro ») | `#10201B` / `#E8956D` | 7,19 | AAA |
| Blanc / pêche | `#FFFFFF` / `#E8956D` | 2,35 | **interdit** |
| Pêche en texte / canvas | `#E8956D` / `#EDEAE0` | 1,95 | **interdit** |
| Ambre « à régler » | `#8A6100` / `#FFF6E3` | 5,16 | AA |
| Rouge échec | `#B91C1C` / `#FEF2F2` | 5,91 | AA |
| Blog : lien/CTA | `#1D9E75` / `#FFFFFF` | 3,39 | ÉCHEC texte courant |
| Blog : `--sub` sur canvas (chapô de `/blog`) | `#6B7280` / `#EDEAE0` | 4,02 | ÉCHEC 16 px |
| Blog : `--sub` sur carte blanche | `#6B7280` / `#FFFFFF` | 4,83 | AA |
| Blog : dates `--label` | `#A3A9A6` / `#FFFFFF` | 2,39 | ÉCHEC |
| Bordure / canvas | `#E7E3D8` / `#EDEAE0` | 1,07 | décoratif seulement (une carte doit se lire par son fond ou son ombre, pas par ce trait) |

**Corrections proposées pour les pages statiques** (même famille de couleurs) :
- texte teal sur fond clair (sur-titres, liens, mots en relief des titres) : `#1B6E62`
  (5,05 sur canvas) ; si l'on veut garder un teal plus lumineux pour les grands titres
  seulement : `#238478` (3,76 sur canvas, ≥ 3:1 pour grand texte) ;
- dégradé des CTA : `linear-gradient(135deg,#238478,#1B6E62)` → blanc ≥ 4,52:1 sur
  toute la largeur (aujourd'hui `#2F9E90 → #1B6E62`, 3,27 à 6,08) ;
- petit texte discret : `#6E695D` (4,54 sur canvas, 5,01 sur papier) au lieu de `#8A8578` ;
  garder `#8A8578` pour ≥ 18,66 px gras ou les éléments non textuels ;
- pied de page : `#5C6560` au lieu de `#A39D8E` ;
- pastille « Le plus populaire » : texte `#FFFFFF` sur `#1B6E62` uni (6,08) ;
- shimmer des titres : sur fond clair il passe par `#6FDFD3` (illisible un instant) —
  le garder SUR FOND SOMBRE seulement, ou le retirer ; `prefers-reduced-motion` le coupe
  déjà.

### 1.4 Typographie

- **Space Grotesk** partout (titres, corps, boutons) — graisses chargées : 300, 400, 500,
  600, 700 (Google Fonts, `index.html`). Pas d'italique dans la famille : l'italique du
  wordmark de la landing est un oblique synthétisé.
- **Plus Jakarta Sans** : seulement `italic 800` et `italic 900`, réservée au wordmark
  « FillSell » (app, blog, vidéo).
- ⚠️ Le blog demande `Plus Jakarta Sans` **droite** 800 pour ses titres : seule l'italique
  est chargée, le navigateur rend donc tous les titres du blog EN ITALIQUE (vérifié au
  rendu : `h1` « Blog FillSell » et titres des cartes italiques). À aligner sur Space
  Grotesk 700.
- Pour l'auto-hébergement prévu par l'architecture (`site/assets`) : les woff2 latin
  existent déjà localement — `C:\Users\nicol\fillsell-video\public\fonts\`
  (Space Grotesk 400/500/600/700, Plus Jakarta Sans 800 italic, issus de @fontsource 5.3.0,
  licence OFL-1.1, ~13 Ko chacun) et `C:\Users\nicol\fill-and-sell-design\stock-redesign\assets\fonts\`
  (Space Grotesk + `LICENCE-Space-Grotesk-OFL.txt`). Le sous-ensemble « latin » couvre
  le français (accents, œ, €, apostrophe typographique).

Échelle relevée sur la landing (desktop → mobile par `clamp`) :

| Élément | Taille | Interligne | Approche | Graisse | Couleur |
|---|---|---|---|---|---|
| H1 | `clamp(38px,5.2vw,64px)` | 1,02 | −0,035 em | 700 | encre + 2ᵉ moitié teal |
| H2 de section | `clamp(28px,3.6vw,44px)` | 1,06 | −0,03 em | 700 | encre / `#F6F5F1` sur sombre |
| H2 du CTA final | `clamp(28px,4vw,46px)` | 1,08 | −0,03 em | 700 | blanc |
| Chapô hero | `clamp(16px,1.5vw,19px)` | 1,55 | — | 500 | `#5C6560` |
| Chapô de section | `clamp(15px,1.4vw,18px)` | 1,55 | — | 500 | `#5C6560` |
| Sur-titre | 12 px, MAJUSCULES | — | +0,12 em | 700 | teal (clair) / `#4ECDC4` (sombre) |
| Titre de carte | 20 px | — | −0,02 em | 700 | — |
| Corps de carte | 14,5 px | 1,55 | — | 500 | `#5C6560` / 72 % clair |
| Prix | 40 px | 1 | −0,03 em | 700 | — |
| Chiffre de pilier | 32 px | 1 | −0,04 em | 700 | `#4ECDC4` |
| Question FAQ | 15,5 px | — | — | 700 | encre |
| Réponse FAQ | 14 px | 1,6 | — | 500 | `#5C6560` |
| Nav / petits textes | 13,5 px | 1,4 | — | 600 | `#5C6560` |
| Bouton principal | 15,5 px | — | — | 700 | blanc |
| Wordmark (en-tête) | 18 px italique | — | −0,02 em | 700 | `#4A5A52` |

Graisses écrites en ligne sur la landing : 700 (116 fois), 500 (51), 600 (29) ; le 400
sert au texte qui hérite du corps (téléchargé au rendu) ; le 300 est déclaré dans la
feuille Google Fonts mais n'est pas téléchargé sur la vitrine (aucun usage) — inutile de
l'auto-héberger. L'app (NOTES.md § 2) ajoute :
chiffres tabulaires pour prix et compteurs, champ de recherche à 16 px (anti-zoom iOS).

### 1.5 Mise en page, espacements, points de rupture

- Conteneurs : 1200 px (en-tête, hero), 1120 px (sections), 1000 px (CTA final), 780 px
  (FAQ), 680/660 px (bloc titre centré), 860 px (blog), 700 px (article), 560 px
  (`/extension`).
- Gouttière latérale : 22 px (landing) ; 16 px dans l'app (grille de 8 px, NOTES.md § 3).
- Padding vertical des sections : `clamp(56px,7vw,110px)` ; hero `clamp(44px,6vw,84px)`.
- Écarts récurrents : 9-13 px (icône/texte, boutons), 16-18 px (grilles de cartes),
  22-30 px (blocs), 44-48 px (titre → contenu).
- Grilles : piliers `repeat(auto-fit,minmax(280px,1fr))` ; tarifs 4 → 2 colonnes
  (< 1180 px) → 1 (< 640 px).
- Ruptures : 1100 (3ᵉ puce du bandeau masquée), 1040 (menu burger), 760 (bandeau de
  preuve et schéma « téléphone → ordinateur » en colonne), 620 (tuiles de plateformes en
  une colonne), 560 (scène du hero réduite à 74 %).
- Cible tactile : 44 px minimum (`TACTILE`, `src/entree/theme.js`).
- Proposition d'échelle pour `site.css` : 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96, plus
  le `clamp` de section ci-dessus.

### 1.6 Rayons

Pastilles et boutons de nav 999 px · boutons principaux 14 px (13 dans les cartes de
prix) · cartes de section 22-24 px · FAQ 16 px · bandeau de preuve 18 px · CTA final
30 px · scène du hero 28 px · petits contrôles 8-12 px · logos de plateformes
`round(taille × 0,28)` · app : 16 (cartes), 14 (recherche, bouton principal), 12
(boutons de carte, vignettes), 20 (bloc de synchro, haut des feuilles).

### 1.7 Ombres (toujours teintées encre ou teal, jamais grises neutres)

| Usage | Valeur |
|---|---|
| CTA principal | `0 12px 26px -10px rgba(27,110,98,.55)` |
| CTA de nav | `0 6px 16px -6px rgba(27,110,98,.5)` |
| Carte mise en avant (Premium) | `0 20px 48px -24px rgba(27,110,98,.5)` |
| Carte sombre (Pro) | `0 22px 50px -24px rgba(16,32,27,.6)` |
| Scène / maquette | `0 30px 66px -30px rgba(16,32,27,.6)` |
| Bouton clair sur sombre | `0 16px 34px -14px rgba(0,0,0,.5)` |
| Carte d'app | `0 1px 3px rgba(16,32,27,.04)` à `0 1px 4px rgba(16,32,27,.05)` |
| Feuille d'app | `0 -8px 40px rgba(16,32,27,.22)` |

### 1.8 Fonds de section et décor

- Alternance : canvas `#EDEAE0` (fond de page) → papier `#F6F5F1` bordé de `#E7E3D8`
  en haut/bas → **section sombre** `radial-gradient(120% 100% at 0% 0%,#1B6E62,transparent 58%),#10302B`.
- Hero : deux halos flous — teal `radial-gradient(circle,rgba(47,158,144,.28),transparent 66%)`
  en haut à droite, pêche `rgba(232,149,109,.24)` en bas à gauche.
- CTA final : `radial teal .9` (haut gauche) + `radial pêche .55` (bas droite) sur `#10201B`,
  rayon 30 px.
- En-tête collant : `rgba(250,250,248,.92)` + `backdrop-filter: blur(14px) saturate(1.4)`,
  trait bas `#E7E3D8`.
- Les maquettes du hero sont **dessinées en HTML/CSS** (téléphone de 168×300 px, vraies
  photos produit), pas des captures : nettes à tout zoom, quasi 0 octet.

### 1.9 Composants

**Boutons**

| Variante | Style |
|---|---|
| Principal | dégradé 135° teal → teal profond (corriger les stops, § 1.3), texte blanc 700 15,5 px, padding 15×26, rayon 14, ombre CTA, flèche SVG 17 px trait 2,4 |
| Principal de nav | même dégradé, pastille 999, 13,5 px, padding 10×18 |
| Contour (extension) | bordure 1,5 px `#1B6E62`, texte `#1B6E62` 700 15 px, padding 14×22, rayon 14, icône « pièce de puzzle » 17 px |
| Clair sur sombre | fond `#F6F5F1`, texte encre 700 16 px, padding 16×30, rayon 14 |
| Pro | dégradé 120° `#E8956D → #F2B48C`, texte encre |
| Business | dégradé 120° `#F4FFFD → #9BE8DC 55% → #F2C98A`, texte `#060B09` |
| Lien de nav | 13,5 px 600 `#5C6560`, padding 7×11, rayon 9 |
| « Se connecter » | bordure 1 px `#E7E3D8`, pastille 999 |
| Sélecteur FR/EN | rail `#F6F5F1` bordé, segment actif `#10201B` texte blanc 12 px 700 |
| Focus clavier | aucun style dédié sur la landing — reprendre `outline: 2px solid #2F9E90; outline-offset: 2px` (`.en-focus`, `src/entree/theme.js`) |

**Cartes**
- Claire de section : `#F6F5F1`, 1 px `#E7E3D8`, rayon 22-24, padding 28-30.
- Sombre (sur section sombre) : `rgba(246,245,241,.05)`, 1 px `rgba(78,205,196,.22)`,
  rayon 22, padding 28 ; titre 20 px `#F6F5F1`, texte 72 %.
- Mise en avant : bordure 1,5 px `#2F9E90` + ombre teal + pastille centrée en débord
  (`top:-13px`).
- Carte d'app (`UI.Card`) : blanc, 1 px `#E7E3D8`, rayon 16, ombre `0 1px 4px rgba(16,32,27,.05)`.
- FAQ : `<details>` papier, rayon 16, `summary` 18×20 px, bouton « + » 26 px rayon 8 sur
  canvas. Le JSON-LD FAQPage est construit depuis la FAQ affichée (même tableau).

**Pastilles et étiquettes**
- Quota : 12 px 700 `#1B6E62` sur `rgba(47,158,144,.1)`, bordure `rgba(47,158,144,.2)`,
  pastille 999, padding 6×11.
- Sur-titre : 12 px 700 MAJUSCULES +0,12 em.
- Coche pleine : cercle `#2F9E90` 15-16 px, coche blanche (décoratif ; le texte voisin
  porte le sens).
- Bandeau de preuve : papier, rayon 18, padding 16×26, puces séparées par des traits
  `#D8D3C6` de 20 px.
- Badges de plan (app, `PlanBadge.jsx`) : Premium dégradé `#37AC9C → #1B6E62` ; Pro
  `#1C4038 → #0D1F1A` + liseré or + texte or ; Business noir + liseré menthe.

### 1.10 Mouvement

`fsShimmer` (reflet des mots en relief, 4,5 s), `fsFloat` (téléphone, 6 s), apparition au
défilement (opacité + `translateY(26px)`, 0,7 s `cubic-bezier(.2,.7,.3,1)`, armée en JS
seulement : sans JS tout reste visible), vol des vignettes vers les plateformes dans le
hero. `@media (prefers-reduced-motion:reduce)` coupe tout. Règle de l'app à garder :
transform/opacity uniquement, et **jamais une animation en boucle sur un texte qui porte
l'information** (`src/entree/theme.js`).

### 1.11 Iconographie

SVG en ligne au trait (style Lucide : `stroke-width` 2,2-2,6, extrémités rondes), 15-17 px
dans le texte. L'app importe `lucide-react` (licence ISC) : même famille pour le site.
Pas d'emoji dans la landing ; `/extension` en utilise (🧩, 📱, 🔗) — à ne pas reprendre.

### 1.12 Marque : logo et wordmark

- **Logo** = l'icône d'app : carré arrondi, dégradé vertical cyan `#01BFCF` → orange
  `#FE7108`, sac de courses blanc traversé d'une flèche montante. Fichiers : PNG seulement
  (`public/icon-192x192.png` 45 Ko, `public/icon-512x512.png` = `public/logo.png`
  [même empreinte], `public/icon_1024x1024.png`, `public/AppStore_1024x1024.png` à fond
  perdu, `chrome-extension/assets/icons/icon-128.png`). **Aucune source vectorielle (SVG)
  dans le dépôt** : à demander à Nico ou à vectoriser avant de produire OG/illustrations.
- **Wordmark « FillSell »** — trois versions en circulation :
  1. app (`BrandMark.css`), blog, vidéo : Plus Jakarta Sans italique 800, dégradé 135°
     `#3EACA0 → #E8956D` ;
  2. en-tête et pied de la landing : Space Grotesk 700 oblique synthétique, `#4A5A52` ;
  3. OG actuelle : capitale blanche droite.
  À unifier sur la version 1 (le logotype est exempté des exigences de contraste WCAG).
- Désambiguïsation : une autre société « FillSell » (fillsell.com) existe — commentaire
  d'`index.html` ; garder logo + url + `sameAs` cohérents partout.

### 1.13 Badges de plateformes (`src/components/platform-logos/`)

| Plateforme | Composant | Origine (selon l'en-tête du fichier) | Licence / droit d'usage |
|---|---|---|---|
| Vinted | `VintedLogo.jsx` (SVG, `#007782`, sur socle blanc) | tracé simple-icons (« CC0 ») | Marque déposée ; voir ci-dessous |
| eBay | `EbayLogo.jsx` (SVG, `#E53238`, sur socle blanc) | tracé simple-icons | Marque déposée ; voir ci-dessous |
| Leboncoin | `LeboncoinIcon.jsx` (PNG 512 en base64, 12,7 Ko de JSX) | icône d'app via l'API iTunes Lookup (id 484115113) | Œuvre et marque du tiers, aucune licence |
| Beebs | `BeebsIcon.jsx` (PNG en base64, 50,8 Ko de JSX) | icône d'app via l'API iTunes Lookup (id 1457130269) | Idem |
| Opla | `OplaIcon.jsx` | icône d'app (API iTunes) | Idem — **ne pas montrer** (sortie le 10/10) |
| Depop | `DepopIcon.jsx` (mot-symbole dessiné, `#FF2300`) | dessiné maison | **Ne jamais montrer** sur le site (bêta fermée) |

`PlatformLogo` rend tout au même gabarit (rayon 28 %, socle blanc teintable, option
`desature`). Les mêmes logos existent en PNG 128 px pour les mails (`public/email/logo-*.png`).

Ce que disent les sources (observé le 09/10/2026) :
- simple-icons : « Simple Icons is released under CC0 - though that doesn't mean to imply
  that all icons within the project are also CC0 » et demande de respecter les chartes
  des marques — <https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md>.
- eBay : l'usage des noms et/ou logos est « not permitted » dans les « Marketing or
  advertising materials » et « in any manner that implies you are sponsored by,
  affiliated with, or endorsed by eBay » ; une mention **en texte simple** est permise
  sans autorisation écrite — <https://brandpermission.ebay.com/guidelines>.
- Vinted : « The use and publication of the trademark protected sign "Vinted" is only
  permitted after written authorization and with a valid license » (mentions légales) —
  <https://www.vinted.fr/impressum>. La portée exacte (logo seul, ou aussi le nom cité
  pour indiquer une compatibilité) n'est pas tranchée par ce texte ; je ne peux pas la
  vérifier plus avant.
- Leboncoin, Beebs : je n'ai pas trouvé de charte publique d'usage ; non vérifié.

**Recommandation pour les pages statiques** (décision de Nico, la landing actuelle
affiche ces logos depuis le 07/09) : par défaut, **les noms en texte** (usage nominatif,
pour dire avec quoi FillSell fonctionne), éventuellement dans des pastilles neutres
(pastille + nom, sans logo), et une mention « Vinted, Leboncoin, eBay et Beebs sont des
marques de leurs propriétaires respectifs. FillSell n'est ni affilié à ces plateformes
ni approuvé par elles. » Ce n'est pas un avis juridique.

### 1.14 Identité FillSell — ce qui la fait, ce qu'il faut éviter

Ce qui la fait :
- crème chaud + vert profond + teal, une touche pêche (halos, Pro) ; jamais de blanc pur
  en fond de page ;
- une seule police géométrique (Space Grotesk), titres serrés et gras, le wordmark
  italique en dégradé comme seule fantaisie typographique ;
- des titres en deux temps, la seconde moitié en couleur : « Ton téléphone pilote. *Ton
  ordinateur exécute.* », « Tu synchronises. On publie partout. *On republie tes
  annonces.* » ;
- tutoiement, phrases courtes, vocabulaire de revendeur ; des faits vérifiables plutôt
  que des superlatifs (la section témoignages a été retirée le 07/09 faute de vrais
  avis ; la FAQ dit « aucun outil ne peut promettre zéro risque ») ;
- des maquettes dessinées et de vraies photos d'articles (sur tapis de jonc, lumière
  naturelle), pas d'illustrations génériques ;
- alternance claire / sombre très lisible, beaucoup d'air, rayons généreux.

À éviter : le style « néon sur noir » de l'OG actuelle, les compteurs de plateformes
(« 4 plateformes », règle du 02/10 : plus aucun nombre), Opla, Depop, FillSell Cloud, le
mot « pépite(s) » (`public/email/pepite.png` à ne pas reprendre), les avis ou chiffres
non sourcés, les affirmations type « 100 % sécurisé ».

### 1.15 Jetons prêts à coller (`site/styles/site.css`)

```css
:root {
  /* fonds */
  --canvas:#EDEAE0; --papier:#F6F5F1; --carte:#FFFFFF; --vert-nuit:#10302B; --encre:#10201B;
  /* texte */
  --texte:#10201B; --texte-2:#5C6560; --texte-3:#6E695D;      /* #8A8578 : grand texte seulement */
  --texte-sur-sombre:#F6F5F1; --texte-sur-sombre-2:rgba(246,245,241,.72);
  /* accents */
  --teal:#2F9E90;            /* décor, coches, fonds ; jamais en petit texte sur clair */
  --teal-texte:#1B6E62;      /* liens, sur-titres, mots en relief sur clair (5,05:1) */
  --teal-titre:#238478;      /* option : mots en relief ≥ 24 px sur clair (3,76:1) */
  --teal-profond:#1B6E62; --menthe-vive:#4ECDC4; --peche:#E8956D; --peche-clair:#F2B48C;
  /* traits */
  --trait:#E7E3D8; --trait-fort:#D8D3C6; --trait-doux:#EFECE3;
  /* dégradés */
  --cta:linear-gradient(135deg,#238478,#1B6E62);              /* blanc ≥ 4,52:1 partout */
  --section-sombre:radial-gradient(120% 100% at 0% 0%,#1B6E62,transparent 58%),#10302B;
  --wordmark:linear-gradient(135deg,#3EACA0 0%,#E8956D 100%);
  /* rayons */
  --r-pastille:999px; --r-bouton:14px; --r-carte:24px; --r-carte-s:16px; --r-bloc:30px;
  /* ombres */
  --o-cta:0 12px 26px -10px rgba(27,110,98,.55);
  --o-carte-avant:0 20px 48px -24px rgba(27,110,98,.5);
  --o-maquette:0 30px 66px -30px rgba(16,32,27,.6);
  --o-carte-app:0 1px 4px rgba(16,32,27,.05);
  /* typo */
  --police:'Space Grotesk',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  --police-marque:'Plus Jakarta Sans',sans-serif;               /* italic 800 seulement */
  --h1:clamp(38px,5.2vw,64px); --h2:clamp(28px,3.6vw,44px);
  --chapo:clamp(16px,1.5vw,19px); --corps:16px; --petit:13.5px; --surtitre:12px;
  /* mise en page */
  --gouttiere:22px; --max:1120px; --max-texte:700px; --pad-section:clamp(56px,7vw,110px);
}
```

---

## 2. Inventaire des images

Légende « données réelles » : **non** = aucune donnée d'utilisateur ; **Nico** = données
du compte du fondateur (articles, prix, chiffres, pseudo) ; **tiers** = données d'autres
personnes. Les images « Nico » ne sont réutilisables que sur décision explicite de Nico ;
aucune image « tiers » n'a été trouvée dans le dépôt.

### 2.1 Réutilisables telles quelles

| Fichier | Contenu | Dimensions | Poids | Données réelles |
|---|---|---|---|---|
| `public/landing/casquette-volcom.webp` | Casquette beige Volcom, fond béton | 360×360 | 15 Ko | non (photo produit d'un article de Nico, aucune donnée personnelle) |
| `public/landing/chaussures-cyrillus.webp` | Bottines cuir Cyrillus avec étiquette | 360×360 | 15 Ko | non (idem) |
| `public/landing/short-polo.webp` | Short blanc Polo sur tapis de jonc | 360×360 | 47 Ko | non (idem) |
| `public/landing/sweat-ohlins.webp` | Sweat Öhlins | 360×360 | 29 Ko | non (idem) |
| `public/landing/sweat-redbull.webp` | Sweat Red Bull / Infiniti | 360×360 | 36 Ko | non (idem) |
| `public/landing/tshirt-graphique.webp` | T-shirt noir imprimé | 360×360 | 30 Ko | non (idem) |
| `public/landing/tshirt-ours.webp` | T-shirt « Climate change » | 360×360 | 43 Ko | non (idem) |
| `public/landing/tshirt-patagonia.webp` | T-shirt noir Patagonia | 360×360 | 22 Ko | non (idem) |
| `public/icon-192x192.png`, `icon-512x512.png` (= `logo.png`), `icon_1024x1024.png`, `AppStore_1024x1024.png`, `favicon-*.png`, `apple-touch-icon*.png` | Icône FillSell | 16 → 1024 | 1-301 Ko | non |
| `public/extension-guide/extension-install-step-6-toolbar-icon.png` | Barre d'outils Chrome, icône FillSell épinglée | 688×112 | 5 Ko | non (utilisée par `/extension`) |

Limite : 360 px de côté — suffisant pour des vignettes (≤ 180 px affichés en 2×), pas
pour une grande illustration. Les originaux plus grands existent hors dépôt
(`C:\Users\nicol\fill-and-sell-design\stock-redesign\assets\images\p-*.jpg`, et
`fillsell-video\public\articles\`) — ce sont aussi les articles de Nico.

### 2.2 Réutilisables sous condition

| Fichier | Contenu | Dimensions | Poids | Condition |
|---|---|---|---|---|
| `public/pata1.jpg`, `public/pata2.jpg` | T-shirt Patagonia P-6 face/dos (article de Nico) | 800×1067 | 97 / 102 Ko | non référencées dans le code (servies publiquement quand même) ; photo produit sans donnée personnelle |
| `public/email/blast-rentree-2609-lens.jpg` | Écran Lens « Scanne. On gère le reste. » (maquette, aucune donnée) | 560×663 | 28 Ko | basse définition |
| `public/email/blast-rentree-2609-releve.jpg` | Constellation « Relevé de Vinted… » | 600×386 | 15 Ko | basse définition ; logo Opla présent dans la constellation |
| Captures stores — `C:\Users\nicol\Desktop\Apple screenshot\store-appstore-corrige\0{1..4}-*-fr.png` (et `-en`, `store-play\`) | « Une photo. Ta fiche est prête. », « Publie partout, en un geste », « Vendu ici, retiré partout », « Tout ton business, un seul écran » | 1242×2688 | 419-793 Ko | données de démonstration (Patagonia P-6, « Veste Zara vendue 42 € ») mais **« Bonjour Nico »** et une UI de juillet (avant la refonte du Stock), « Publier sur 4 plateformes » (nombre) ; hors dépôt |
| `…\Apple screenshot\05-ipad-dashboard-fr.png` | Tableau de bord iPad | 2064×2752 | 673 Ko | ancien nom **« Fill & Sell »** dans l'interface → plutôt non |

Note : l'API iTunes (`https://itunes.apple.com/lookup?id=6762152785&country=fr&lang=fr_fr`,
09/10/2026) renvoie pour la vitrine française les fichiers `01-photo-fiche-en.png` …
`04-dashboard-en.png` : la fiche française afficherait les captures ANGLAISES — à
vérifier dans App Store Connect (la page `apps.apple.com` a répondu 429, non vérifiable
ici).

### 2.3 À ne pas réutiliser (obsolètes, fausses ou porteuses de données)

| Fichier | Contenu | Dimensions | Poids | Pourquoi |
|---|---|---|---|---|
| `public/og-image-fillsell.png` | **OG actuelle du site** (`index.html`, JSON-LD `screenshot`, 3 articles de blog) : « STOCK. PROFIT. TOUT EN 1. », néon sur noir | 1200×630 | 235 Ko | style hors charte ; **faux logos** de plateformes (Beebs en « b » violet, Leboncoin en cube) ; **faux badge App Store** (Apple : « Use only the badge artwork provided ») ; « 4 plateformes » ; « 100 % sécurisé » |
| `public/og-image.jpg` | « Track your resale profits automatically · Vinted · eBay · **Depop · Poshmark** » | 1200×630 | 116 Ko | **image OG de l'article publié** `comment-calculer-profits-vinted` ; annonce Depop (bêta fermée) et Poshmark (non pris en charge) |
| `public/og-image.png` | même visuel | 1200×630 | 1 335 Ko | idem, et lourd |
| `public/og-image-en.png` | « Fill & Sell — Speak. AI does the rest. » | 1200×630 | 499 Ko | ancien nom ; image d'un article EN publié (`how-to-calculate-reselling-profits`, `sell-same-item…`) |
| `marketing/feature-graphic.png` (+ `.html`) | « FillSell — Assistant IA pour revendeurs », Nunito, données de démo | 1024×500 | 204 Ko | positionnement de juin (vocal, marges) |
| `public/extension-guide/step-1…5` | Parcours d'installation manuelle (mode développeur, zip) | 1213-1600 px | 21-76 Ko | parcours abandonné le 07/09 ; l'étape 4 montre l'explorateur Windows avec **le nom du compte OneDrive** et des dossiers personnels |
| `public/email/blast-rentree-2609-*` (a-h, articles), `blast-sync-*` | Visuels de la campagne du 26/09 | 560-1080 px | 3-203 Ko | **articles réels de Nico** (prix, vues), « 5 plateformes », Opla, offre FILLSELL50 datée ; chiffres « 2 600 vendeurs, 80 000 articles » non vérifiés ici |
| `public/email/logo-*.png` | Logos de plateformes 128 px | 128×128 | 2-10 Ko | mêmes réserves de marque (§ 1.13) ; Opla |
| `public/email/pepite.png` | Icône « pépite » | 64×64 | 2 Ko | vocabulaire banni |
| `screenshots-review/*.png` (7 fichiers suivis), `screenshot_tab0_tableau.png` | Écrans de l'app de **mai 2026** | 780×1688 (et 780×33 930) | 142 Ko – 2,5 Mo | ancien nom « Fill & Sell », ancienne UI, chiffres d'un compte (874,50 € de profit) |
| `src/assets/hero.png`, `react.svg`, `vite.svg` | Gabarit Vite par défaut | 343×361 | 44 Ko | sans rapport, non utilisés |
| `test-assets/photos/test-photo-{1..5}.jpg` | Feuille de papier sur une table (jeux d'essai) | 1200×1200 | ~60 Ko | sans intérêt visuel |
| `ios/…/Splash.imageset/splash-2732x2732*.png` | Écran de démarrage (fond sombre, petite icône) | 2732×2732 | 176 Ko | sans intérêt pour le site |
| `design_extract/redesign1-3/project/assets/logo.png` | = `icon-512` | 512×512 | 228 Ko | doublon |
| `C:\Users\nicol\fill-and-sell-design\stock-redesign\*.png/.html` (planche v7) | Maquettes de la refonte Stock | 390 px (×2) | 1,2-1,6 Mo | pseudos réels **@nelsonchatnoir**, **nicsvob_0**, **nelsonthecat** ; Depop en 5ᵉ plateforme |
| `C:\Users\nicol\fillsell-video\capture\out\*.png`, `public\ecrans\*.png`, `out\stills\*.png` | Captures de l'app pour la vidéo | 1080 px | 0,1-3,1 Mo | **données réelles du compte de Nico** (pseudos masqués par `capture/masques.js`) |

Hors du périmètre lu : `C:\Users\nicol\Desktop\f&s database\` contient aussi des
fichiers aux noms sensibles (mots de passe, clés eBay, certificat `.p12`) — **non
ouverts**. À ne jamais copier vers le site.

---

## 3. Vidéo de présentation

### 3.1 Fichiers trouvés

Recherche (lecture seule) dans `C:\Users\nicol\fill-and-sell`, `fill-and-sell-seo`,
`fill-and-sell-design`, les autres dossiers `fill-and-sell-*` / `fillsell-*`, `Downloads`,
`Videos`, `Desktop`, `Documents`, `Pictures`, `OneDrive` : extensions mp4, webm, mov,
gif, m4v, mkv, avi + fichiers de projet (Premiere, After Effects, CapCut, DaVinci,
config Remotion). **Aucune vidéo dans les deux dépôts** (suivie ou non). Mesures :
`ffprobe` livré avec Remotion
(`fillsell-video\node_modules\@remotion\compositor-win32-x64-msvc\ffprobe.exe`).

| Fichier | Date | Durée | Format | Poids | Contenu | Données réelles | Verdict |
|---|---|---|---|---|---|---|---|
| `C:\Users\nicol\fillsell-video\SORTIE\FillSell-video-finale.mp4` (= `out\FillSell.mp4`, même empreinte MD5) | 08/10/2026 | 80,5 s | 1080×1920, H.264 30 i/s, AAC 48 kHz stéréo, 3,84 Mb/s | 38 644 977 o | **La présentation produit** (détail § 3.2) | **Nico** (articles, prix, compteurs de synchro, tableau de bord) | base de travail, pas publiable telle quelle |
| `…\fillsell-video\out\FillSell-envoi.mp4` | 08/10 | 80,5 s | idem, 2,03 Mb/s | 20 399 893 o | même montage, compressé pour l'envoi | Nico | idem |
| `Downloads\FillSell Story 1080x1920.mp4`, `Paysage 1920x1080`, `Portrait 1080x1350`, `Carre 1080x1080` (+ 4 déclinaisons carrées 600 à 1920 px) | 04-05/09 | 7,0 s | H.264 30 i/s, **sans piste audio** | 0,76 – 3,7 Mo | Pub courte : « L'IA écrit ton annonce. Tu la vends partout. », dressing Vinted synchronisé, republication auto, tuiles LBC/eBay/Beebs cochées, « Publié partout », badges stores | **Nico** (capture de son Stock : « Casquette beige Volcom 21 € », « Maillot … 48 € ») | sous condition ; badges stores redessinés et assombris (non conformes) ; « toutes les 24 h » à vérifier |
| `Downloads\FillSell_ The Reseller's Journey to Freedom_1080p_caption.mp4` (+ `1080x1920_nocap.mp4`) | 28/06 | 55,0 s | 1080×1920, 25 i/s | 47,3 / 46,9 Mo | **Avatar généré par IA** (Dreamina) qui raconte son parcours de revendeur à la 1ʳᵉ personne, slogan « Organise ton business. Développe-le. » | non | **interdit** : faux témoignage, ancien positionnement |
| `Downloads\dreamina-2026-06-28-*.mp4` (2 fichiers identiques) | 28/06 | 17,6 s | 1088×1920, 60 i/s | 14,1 Mo | rush de l'avatar IA | non | interdit |
| `Downloads\ScreenRecording_09-03-2026 10-32-18_1.mov` | 03/09 | 20,0 s | 888×1920, 59,94 i/s | 30,6 Mo | Enregistrement d'écran iPhone : Stock, publication, retouche photo | **Nico**, pseudo **« @nelsonchatnoir » visible** | interdit |
| `Desktop\f&s database\OG + APPpremium FS2\og-animated-fr.mp4` / `-en.mp4` | 27/05 | 12,0 s | 1200×630, 25 i/s | ~0,87 Mo | OG animée « Fill & Sell — Parle. L'IA fait le reste », « IA Vocale / Lens Pro », « copilote des resellers Vinted, Leboncoin & eBay » | non | obsolète |

Aucun GIF trouvé.

### 3.2 La vidéo de présentation (projet Remotion `C:\Users\nicol\fillsell-video`)

Projet : Remotion 4.0.534, composition `FillSell` (`src/Root.tsx` : 2 415 images à 30 i/s,
1080×1920), scènes `src/scenesA|B|C.tsx`, données `src/data.ts`, rendu `npm run render`.
Polices @fontsource (OFL). Musique **synthétisée localement** (`make_music.py`,
`scripts/musique.mjs` : kick, hats, basse, arpège à 112 BPM) → aucun droit de tiers.
Pas de voix ; tout le texte est incrusté.

Images extraites (21 instants + 2 recadrages à pleine résolution, dans le scratchpad) :

| De → à | Scène | Ce qu'on voit |
|---|---|---|
| 0 – 5 s | Accroche | « Tu vends sur… » Vinted, Leboncoin, eBay, Beebs → tampon « STOP » |
| 5 – 9 s | Marque | Icône + wordmark « FillSell », « Vends partout. Une seule fois. L'app qui publie, republie et retire pour toi. » |
| 9 – 14 s | Synchroniser | Étape 1/6 « Importer » : bouton « Synchroniser », eBay 8 annonces, Vinted 14, Beebs 9, Leboncoin en attente — « Toutes tes plateformes, d'un coup » |
| 14 – 21 s | Import + fusion | Grille de vraies annonces → « Tout arrive dans ton stock FillSell » → « Les doublons fusionnent » |
| 21 – 26,5 s | Stock | Écran Stock réel : « Chaque article montre où il est en ligne » |
| 26,5 – 35,5 s | Lens | Étape 2/6 : photo du maillot, « Lens reconnaît l'article, la marque, l'état et rédige le titre et la description » |
| 35,5 – 44 s | Publier | Étape 3/6 : « Où publier ? » puis « Ton ordinateur dépose partout » (fenêtre extension, barres par plateforme) |
| 44 – 51,5 s | Republier | Étape 4/6 : « Republication automatique », liste d'annonces Vinted avec prix réels — « FillSell la republie tout seul » |
| 51,5 – 59 s | Retirer | Étape 5/6 : vendu sur Leboncoin 12 €, « Retirée » ailleurs |
| 59 – 64,5 s | Suivre | Étape 6/6 : **tableau de bord réel** — profit net 646,90 €, 235 ventes, marge moy. 32,35 €, revenu brut 5 423,19 €, 28 en stock ; graphiques |
| 64,5 – 69,5 s | **Cloud** | « BIENTÔT » — « Bientôt : FillSell Cloud — Même PC éteint » |
| 69,5 – 73,5 s | Suite | « Et les prochaines plateformes, dès qu'elles arrivent » (tuiles « + ») |
| 73,5 – 80,5 s | Fin | « FillSell — Vends partout. Sans recopier. », Vinted · Leboncoin · eBay · Beebs, iPhone · Android · Chrome, « Commencer gratuitement », fillsell.app |

Données : l'en-tête de `src/data.ts` le dit lui-même — « DONNÉES RÉELLES — compte de
Nico », relevées en lecture seule le 08/10 (inventaire, annonces, fusions, jobs,
synchro), photos copiées du bucket `listing-photos` ; `capture/extraire.mjs` relit la
base. `capture/masques.js` masque toute ligne portant un `@pseudo` et la carte
« Activité récente ». Dans les 21 images examinées, aucun pseudo, nom ni donnée d'un
tiers n'apparaît (« Bonjour » sans prénom) ; les 2 415 images n'ont pas toutes été
vues.

Blocages pour une publication sur le site :
1. données réelles du compte de Nico (chiffres d'affaires, prix, articles) → **GO
   explicite de Nico** ou passage en données fictives ;
2. scène « Bientôt : FillSell Cloud » (non lancé) → à couper (`SCloud` dans la liste
   `SCENES` de `scenesB.tsx`) ;
3. logos des plateformes en grand (§ 1.13) ;
4. format vertical seulement (pas de 16:9 pour un en-tête de page) ;
5. poids : 36,9 Mio — trop lourd pour une page.

### 3.3 Recommandation (étape 6)

- Variante « site » depuis le projet source (rien à refilmer) : retirer `SCloud`,
  remplacer les chiffres de `SDashboard` et les compteurs `SYNCHRO` par des valeurs
  fictives (ou obtenir le GO de Nico), garder les vraies photos d'articles si Nico
  l'accepte (elles ne portent aucune donnée personnelle), ajouter une composition
  1920×1080 et une 1080×1080.
- Livraison web : H.264 720×1280 (ou 1080×1080) CRF ~26-28 + WebM VP9/AV1, `preload="none"`,
  affiche (`poster`) extraite d'une image clé, sans lecture automatique sonore ; viser
  < 6 Mo ; transcription texte sous la vidéo (le texte incrusté n'est pas lu par les
  robots) ; JSON-LD `VideoObject` (`name`, `description`, `thumbnailUrl`, `uploadDate`,
  `duration` `PT1M20S`, `contentUrl`).
- Le rendu est local (`npx remotion render`) : ce n'est pas un déploiement. Le capteur
  `capture/shoot.mjs` du projet vidéo pointe sur le dépôt principal
  (`DEPOT = 'C:/Users/nicol/fill-and-sell'`) et relit la base : **ne pas le relancer**
  pour la variante fictive — partir des PNG fictifs du harnais (§ 4).

---

## 4. Harnais de captures sans session (`scripts/apercu/`)

### 4.1 Comment il fonctionne

- Chaque écran = un couple `xxx.html` + `xxx.jsx` dans `scripts/apercu/`. Le `.jsx`
  importe les **VRAIS composants** de `src/` (et parfois les vraies règles :
  `regles.js`, `etatsPublication.js`, gardes serveur de `supabase/functions/_shared/`)
  et les monte avec des **objets en dur** (props, moteur factice, photos SVG/aplats
  générés dans la page).
- Le serveur est Vite, avec la config du projet (`vite.config.js` : en dev, aucun fichier
  écrit — le zip de l'extension est servi en mémoire) ou une config dérivée qui remplace
  `src/lib/supabase.js` par **`faux-supabase.js`** (`vite-stock-refonte.config.mjs`,
  `vite-cloud…`, `vite-modale-free…`) : les lectures servent `window.__FIXTURE.tables`
  (filtres PostgREST rejoués : eq, in, is, gt/lt, like, contains, or, order, range…), les
  RPC `window.__FIXTURE.rpc[nom]`, les écritures sont **journalisées et refusées**,
  l'URL est une adresse morte (`http://127.0.0.1:9/faux-supabase`).
- Les `capture-*.mjs` lancent Vite sur un port fixe, attendent qu'il réponde, ouvrent
  **Chrome du poste** (`chromium.launch({ channel: 'chrome' })`, pas de binaire Playwright
  à télécharger), en général 390×844 à `deviceScaleFactor: 2`, `locale: 'fr-FR'`,
  `timezoneId: 'Europe/Paris'`, puis écrivent des PNG dans `screenshots-review/…`
  (dossier ignoré par git) et tuent l'arbre de processus Vite à la sortie.
- ⚠️ Le harnais du Stock (`stock-refonte.jsx`) lit `build/apercu-stock/donnees.json` =
  **le compte de Nico** relu en lecture seule. Le modèle à suivre pour le site est
  `retraits-plafond-0510.jsx` + `retraits-plafond-0510-donnees.js` : il intercepte ce
  fetch et sert un **compte entièrement fictif** (uid inventé, titres inventés, vignettes
  SVG, dates relatives) sans toucher au harnais.
- Pièges d'origine : `cartes-0210.jsx` passe `username="Nico"` au tableau de bord et
  affiche le bandeau de sortie d'Opla ; `stepper-nouveau.jsx` code en dur Opla dans
  `plateformesAffichees` et un cas « Leboncoin session fermée » ; plusieurs harnais
  reprennent des jeux réels (« jobs réels de Louis », « l'aspirateur de Nico ») →
  pour le site, **de nouveaux fichiers** de harnais avec des données fictives, jamais une
  modification des harnais existants (ils servent aux relectures).

### 4.2 Vérification sur la machine (09/10/2026)

- `npx playwright --version` (worktree) : **Version 1.61.1**.
- `chromium.launch({ channel: 'chrome' })` : **OK, Chrome 154.0.8037.98**
  (`C:\Program Files\Google\Chrome\Application\chrome.exe`).
- `chromium.launch()` sans canal : **échoue** — Playwright 1.61 attend
  `chromium_headless_shell-1228`, seul le 1217 est installé. Sans conséquence : tous les
  capteurs utilisent `channel: 'chrome'`.
- `sharp` est présent dans le worktree (conversion WebP/AVIF possible localement).
- **Essai réel** (script dans le scratchpad, serveur Vite du worktree, requêtes vers
  supabase.co et fillsell.app bloquées, PNG écrits dans le scratchpad) : 6 écrans montés,
  **0 erreur de page** — `stepper-nouveau.html?ecran=1` (8,2 s, premier chargement),
  `?ecran=3` (4,0 s), `lens-resultat.html` (5,3 s), `lot-publication.html` (4,6 s),
  `cartes-0210.html#scene=app&avis=0` (3,8 s), `synchro-avancement.html` (3,6 s). Rendu
  fidèle (Space Grotesk, logos, dégradés). Le worktree n'a pas été modifié (seul le cache
  Vite de `node_modules/.vite`, ignoré).

### 4.3 Écrans clés pour le site

| Écran | Composant(s) réel(s) | Harnais existant | Données nécessaires | Difficulté |
|---|---|---|---|---|
| Tableau d'accueil | `src/tabs/DashboardTab.jsx` (props : `items`, `sales`, `tm`, `salesForKpis`, `stockVal`, `selectedRange`, `username`…) | `cartes-0210.jsx` (`scene=app`) | ~10 ventes et ~10 articles fictifs, profits cohérents ; `entete={null}` (pas de bandeau Opla), `username` neutre ou absent | **Faible** |
| Lens / analyse photo | `LensAnalysisResult`, `LensScanHome`, `EcranPreparation` (`src/tabs/LensTab.jsx`) | `lens-resultat.jsx` (scans Bosch IXO et robe Marc Cain, 3 colonnes à 1280 px) | un objet résultat (objet, marque, état, description, prix conseillé, fourchette, annonces de marché) + une photo produit (une des 8 photos de la landing) ; monter UNE colonne à 390 px | **Faible** |
| Fiche article (carte + texte rédigé) | `src/stock/Carte.jsx` (carte et ligne, présentation pure) ; écran « Ce qui va partir » `src/publication/EcranVerifier.jsx` | carte : via `stock-refonte` ; écran : via `stepper-nouveau` (écran 2) | un article fictif complet (titre, prix, marque, état, taille, 3-5 photos, plateformes en ligne) | Faible (carte) / Moyenne (écran) |
| Choix des plateformes / stepper | `src/publication/StepperNouveau.jsx` + `EcranOuPublier`, `EcranVerifier`, `EcranConfirmer`, `EcranSuivi` | `stepper-nouveau.jsx` (`?ecran=1..4`, `?cas=…`) | moteur factice déjà écrit ; **retirer Opla**, toutes plateformes « Connectée », article neutre (les Baskets New Balance du harnais conviennent) | **Faible à moyenne** (copie du harnais sans Opla) |
| Publication en lot | `src/publication/lot/LotPublication.jsx` (`CoqueLot`, `EcranPlateformes`, `EcranAvant`, `EcranFin`), `SuiviLot.jsx`, `EntreesStock.jsx` | `lot-publication.jsx` | 3-11 articles fictifs (vignettes en aplat) ; vérifier qu'aucun texte daté ne parle d'Opla | **Faible** |
| Stock unifié multi-plateformes | `src/tabs/StockTab.jsx` + `src/stock/*` (`Haut`, `BlocSynchro`, `Carte`, `Liste`) | `stock-refonte.jsx` + `vite-stock-refonte.config.mjs` + `faux-supabase.js` ; modèle fictif `retraits-plafond-0510-donnees.js` | tables fictives : `inventaire`, `annonces_plateforme`, `cross_post_jobs`, `vinted_sync_runs`, `profiles`, `coin_config` (`sync_multi_ouverte=1`) ; sans Opla ; sans pseudo de boutique réel | **Moyenne** (jeu de données le plus riche) |
| Haut du Stock (Publier / Remonter / À régler) | `src/stock/Haut.jsx` | `tuiles-stock.jsx` | trois compteurs | **Faible** |
| Ventes | `src/tabs/VentesTab.jsx` (lit `vinted_listing_snapshots`, écrit `ventes`) ; modale `ChoixVenteModale.jsx` | modale : `vente-modale.jsx` ; onglet : aucun | ventes fictives + config au faux Supabase | Faible (modale) / **Moyenne** (onglet) |
| Republication | `src/stock/EcranSelection.jsx` + `EcranPlein.jsx` (« Remonter mes annonces ») ; `RepublicationPlanifiee*` ; `RepublishProgressSheet` (StockTab) | aucun dédié (passer par `stock-refonte` + données fictives) | annonces en ligne depuis 9-40 jours (le jeu `retraits-plafond` en contient 8) ; RPC `republish_planifiee_etat` à servir | **Moyenne** |
| Synchronisation | `src/stock/BlocSynchro.jsx`, `src/annonces/ConstellationReleve.jsx`, `VintedDressingSync` (StockTab) | `synchro-avancement.jsx`, `synchro-repli.jsx` | runs par plateforme (en file, en cours, fini, compteurs) | **Faible** |
| Réglages › extension / plateformes | `src/reglages/SousPagePlateformes.jsx` (props `c`, `T`, hooks `useSessionsPlateformes`/`useVeritePlateformes` qui lisent Supabase) ; popup de l'extension (`chrome-extension/popup.html` + `popup.js`, lus en `?raw`) ; page `/extension` | popup : `cartes-0210.jsx` (`scene=popup`, carte d'avis) ; réglages : aucun ; `/extension` : page publique | contexte `c` fictif + faux Supabase ; popup dans l'état « connecté » | **Moyenne** (réglages) / Faible (`/extension`, capture directe) |

### 4.4 Règles proposées pour les captures du site

- Données **100 % fictives** (uid, titres, prix, compteurs) ; photos = les 8 photos
  produit de la landing ou des aplats ; aucun prénom (« Bonjour » seul), aucun pseudo,
  aucun numéro d'annonce réel.
- Jamais Opla, Depop, FillSell Cloud, « Bientôt » ; jamais de nombre de plateformes.
- Sortie vers `site/assets/` (via un nouveau script), pas `screenshots-review/`.
- 390×844 à ×2 pour les écrans de téléphone ; convertir en AVIF + WebP (sharp), poser
  `width`/`height` ; cadre de téléphone dessiné en CSS comme sur la landing, plutôt que
  cuit dans l'image.
- Bloquer le réseau vers la prod dans le capteur (`page.route(/supabase\.co|fillsell\.app/, r => r.abort())`).
- Ne jamais ouvrir de session fillsell.app en automatisation (règle du projet).

---

## 5. Badges stores et lien de l'extension (état au 09/10/2026)

| Élément | Où | Source / lien | Constat |
|---|---|---|---|
| Badge App Store | hero (noir) et CTA final (**blanc**) de la landing, masqué sur natif | SVG distant `https://tools.applemediaservices.com/api/badges/download-on-the-app-store/{black,white}/{fr-fr,en-us}` — 126,5×40, affiché à 44 px | l'hôte redirige désormais vers `toolbox.marketingtools.apple.com` (observé) ; Apple : « Whenever one or more badges for other app platforms appear in the layout, use the preferred black badge » → le badge blanc du CTA final, à côté de Google Play, n'est pas conforme ; App Store placé en premier : conforme |
| Badge Google Play | mêmes emplacements | PNG distant `https://play.google.com/intl/en_us/badges/static/images/badges/{fr,en}_badge_web_generic.png` — 646×250 (29 px de vide en haut et en bas) | affiché à 57 px avec marges négatives → visuel de 44 px = celui d'Apple ; Google demande « the same size or larger » : conforme |
| Lien App Store | `APP_STORE_URL` | `https://apps.apple.com/app/id6762152785` | fiche « FillSell – Achat Revente », version 2.8 du 24/09/2026, gratuite, 3 notes (API iTunes, 09/10) ; la page web a répondu 429 |
| Lien Google Play | `PLAY_STORE_URL` | `https://play.google.com/store/apps/details?id=app.fillsell.app` | 200, « FillSell », « 500+ téléchargements » (09/10) |
| Extension Chrome | CTA « Installer l'extension Chrome » (hero, sections), page `/extension`, JSON-LD `sameAs` | `https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm` (constante `CHROME_STORE_URL` / `WEBSTORE_URL`) | 200 après redirection vers `/detail/fillsell-—-cross-post/…` ; titre « FillSell — Cross-post », **360 utilisateurs** (09/10). Seule voie d'installation depuis le 07/09 (le zip reste servi mais plus lié). **Pas de badge officiel** : bouton contour maison avec icône « pièce de puzzle » |

Recommandations pour les pages statiques :
- auto-héberger les fichiers officiels des badges (Apple fournit l'artwork ; Google via
  le Partner Marketing Hub ; Chrome Web Store fournit un badge « Available in the Chrome
  Web Store » sans approbation préalable) — supprime trois requêtes tierces et le
  risque de redirection ;
- badge Apple **noir** partout dès que Google Play est à côté ; espace libre = ¼ de la
  hauteur ; hauteur ≥ 40 px (Apple) / ≥ 28 px (Google) ; aucune modification
  (ni opacité, ni recoloration — ce que fait la pub de 7 s) ;
- badge Chrome Web Store : lien obligatoire vers la fiche de l'extension, jamais élément
  principal de la page ; dire « pour Google Chrome™ » plutôt que d'utiliser le logo Chrome.

---

## 6. Ce qui attend une décision de Nico

1. **Logos des plateformes** sur les pages SEO : texte seul (recommandé) ou logos
   actuels (risque de marque eBay / Vinted documenté § 1.13).
2. **Vidéo** : autoriser ses données réelles, ou variante fictive ; confirmer la coupe de
   la scène Cloud ; formats à produire (16:9, 1:1).
3. **Images OG** : remplacer les quatre images actuelles (dont celle d'un article publié
   qui annonce Depop et Poshmark) par des OG dans la charte (§ 1).
4. **Contrastes** : adopter les corrections du § 1.3 sur le site (et, plus tard, sur la
   landing SPA et le blog).
5. **Wordmark unique** et **`theme-color` unique**.
6. **Source vectorielle du logo** (aucun SVG dans le dépôt).

---

## 7. Sources externes (observées le 09/10/2026)

- Apple — App Store Marketing Guidelines : <https://developer.apple.com/app-store/marketing/guidelines/>
- Google Play — badges : <https://play.google.com/intl/en_us/badges/> → <https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/>
- Chrome Web Store — branding : <https://developer.chrome.com/docs/webstore/branding>
- eBay — Intellectual Property Guidelines : <https://brandpermission.ebay.com/guidelines>
- Vinted — mentions légales : <https://www.vinted.fr/impressum>
- simple-icons — DISCLAIMER : <https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md>
- API iTunes (fiche App Store) : <https://itunes.apple.com/lookup?id=6762152785&country=fr&lang=fr_fr>
- Fiche Google Play : <https://play.google.com/store/apps/details?id=app.fillsell.app&hl=fr&gl=FR>
- Fiche Chrome Web Store : <https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm?hl=fr>
- Badges servis : <https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/fr-fr> (redirige vers `toolbox.marketingtools.apple.com`), <https://play.google.com/intl/en_us/badges/static/images/badges/fr_badge_web_generic.png>
