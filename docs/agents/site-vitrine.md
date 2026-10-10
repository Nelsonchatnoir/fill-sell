# Site vitrine statique — pour les autres terminaux et Codex (09/10/2026)

> Fondation livrée sur la branche `seo-crosslisting` (worktree
> `C:\Users\nicol\fill-and-sell-seo`), **rien n'est poussé ni déployé** : la mise
> en ligne attend le GO de Nico. Architecture : `docs/seo/ARCHITECTURE.md` (v2),
> ses revues `docs/seo/revue-architecture/` et la revue de la fondation
> `docs/seo/revue-fondation/` (corrigée le 09/10). Mode d'emploi du contenu :
> `site/README.md` ; contrat des types de pages : `docs/seo/FORMAT-CONTENU.md` ;
> design final, gabarits et scores : `docs/seo/design/DESIGN.md` (09/10 soir).
> Se périme : le code et `vercel.json` font foi.

## Mise en ligne — procédure du GO (clôture du 09/10 nuit)

Deux branches prêtes, poussées : `seo-crosslisting` (site tel quel, vidéo
validée, republication automatique Depop annoncée) et
`seo-crosslisting-variante-b` (la même + UN commit : `republication_auto: false`
pour Depop, vidéo B, brief des concurrents, cinq articles du blog).
1. **Choisir** : l'app montre-t-elle Depop dans le réglage de la republication
   automatique (`PLATEFORMES_PLANIFIEES`, `useRepublicationPlanifiee.js`) sur
   `origin/main` ET en production ? Oui → `seo-crosslisting` ; non →
   `seo-crosslisting-variante-b`.
2. **Jamais entre 23:30 et 00:30.** `git fetch` ; rebase de la branche choisie
   sur `origin/main` (essai du 09/10 23:33 sur 2441cab : aucun conflit, site
   construit, natif identique à main hors des 15 écarts nommés ci-dessous) ;
   `npm run site:apercu -- --sans-serveur` (0 erreur) ; `npm run build:essai`.
3. **Un seul push** sur `main`. Puis le contrôle `Origin` de l'accueil (plus
   haut) et `npm run site:preuve-consentement -- https://fillsell.app` (le
   bandeau doit être là, aucune requête Google avant « Accepter »).
4. Écarts du build NATIF dus à la branche (mesurés le 09/10, aucun effet à
   l'écran du natif) : marqueurs `site:balises` dans `index.html` (commentaires),
   `app-shell.html` (inerte), textes et clé du bandeau dans le bundle (jamais
   affiché en natif), articles du blog réécrits/retirés (prérendu inerte),
   icônes recompressées, ordre des imports (minifieur). Extension et base : 0.

## ⛔ Les trois gestes que TOUT terminal doit connaître (une fois sur main)

1. **Toucher ce qui s'écrit DANS une page = `npm run site:dater` dans le même
   commit** (puis commiter `site/dates.lock.json`) : `src/blog/*.md`,
   `site/contenu/`, et aussi les DONNÉES que les pages affichent
   (`site/donnees/plateformes.yml` — ses jetons sont dans le texte —,
   `tarifs.yml` pour `/tarifs`, `concurrents.yml` pour les comparatifs) et une
   capture citée refaite à d'autres dimensions (texte alternatif et dimensions
   sont dans l'empreinte). Sinon le **build du site** refuse (`npm run
   site:apercu`, « DATES PÉRIMÉES ») ; les builds de l'APP (`npm run build`,
   natif, OTA : plugin `controleSite`) et Vercel ne font qu'**avertir** —
   jamais une OTA ni un déploiement bloqués pour une date (revue technique
   C-6 du 09/10 : `video.json`, refait par un autre terminal, bloquait l'OTA de
   tous). La vidéo de l'accueil n'entre plus dans l'empreinte (elle a sa
   propre date, `VideoObject.uploadDate`). `src/pages/Legal.jsx` n'est plus
   suivi : `/legal` est au sitemap sans date.
2. **Ajouter une route à `AppRouter.jsx`, ou écrire une nouvelle URL
   `https://fillsell.app/…` dans un mail, une fonction edge ou l'extension :
   l'ajouter à `scripts/site/routes-app.mjs` ET aux `rewrites` de `vercel.json`,
   même commit.** Sinon elle répond 404 en prod (plus d'attrape-tout). TOUS les
   builds le refusent en nommant la route (plugin `appShell`, au début du build).
3. **Une page HTML posée dans `public/`** (vérification Search Console…) se
   nomme dans `HTML_PUBLIC_PERMIS` (`routes-app.mjs`), sinon tout build la refuse.

Le build local lit aussi, par motif, des fichiers de l'app que Vercel lit pour
le site : `export const supabaseUrl/supabaseAnonKey` (src/lib/supabase.js,
clé du jeton de session seulement), les marqueurs
`site:balises:*` et les trois JSON-LD d'`index.html`. Un changement de forme
fait tomber `npm run build` en local (message nommé) — jamais seulement Vercel.
Saut d'urgence, bruyant : `FILLSELL_SITE_CONTROLE=0` (OTA d'urgence seulement).

## Ce qui change pour l'APP (à lire avant de toucher au routage)

- **Deux mondes, une base de code.** Dans un build du site (`FILLSELL_SITE=1`,
  posé par `npm run build:vercel`, la `buildCommand` de `vercel.json`) :
  `dist/index.html` = l'ACCUEIL STATIQUE ; la coquille Vite de l'app est copiée
  octet pour octet en `dist/app-shell.html` (plugin `appShell`, dans TOUS les
  builds, natif compris — ~13 Ko inertes pour Capacitor). `build:vercel` ne
  sert QUE Vercel (le « build web » des binaires reste `npm run build`).
- **`vercel.json` ne réécrit plus tout** : seules les routes de la liste FERMÉE
  `scripts/site/routes-app.mjs` vont à `/app-shell.html` ; le reste tombe sur
  `404.html` (fin du « soft 404 »). Contrôle : `scripts/site/controle-routes.mjs`,
  joué par chaque build et par `npm run selftest:site-routes-app`.
- `"trailingSlash": false` : `/x/` répond 308 vers `/x` (aucun retour tiers ne
  finit par `/`). Ne pas ajouter `cleanUrls` (la destination `/app-shell.html`
  deviendrait fausse).
- **Route React `/` sur le web** (`AppRouter.jsx`, `AccueilWeb`) : quand
  `__FILLSELL_SITE__` est vrai, que `RedirectIfLoggedIn` conclut « déconnecté » ET
  qu'aucun jeton `sb-*-auth-token` ne subsiste → `location.replace('/'…)` vers
  l'accueil statique ; sinon l'ancienne `LandingPage` (filet, aucune boucle
  possible). Natif et builds hors site : code absent du bundle (constante fausse).
  ⛔ Invariant : aucune route de la SPA ne recharge `/` de force tant qu'un jeton
  peut subsister.
- **Blog dans la SPA** (`BlogPost.jsx`, `BlogList.jsx`) : sous
  `__FILLSELL_SITE__`, la SPA ne peint plus l'ancien blog React — elle recharge
  la page STATIQUE (`/blog/<slug>`, ou `/blog` pour un slug inconnu). Aucune
  boucle : le fichier statique passe avant le rewrite.
- **Aiguillages de `/`** : script EN LIGNE (`site/js/aiguillage.js`), ordre FIXE —
  `?code=`/`?token_hash=` → `/auth/confirm` AVANT toute lecture de session (bug
  du 16/09, mauvais compte) ; `#access_token=` / `error_description` → `/login`
  (supabase-js y consomme le fragment) ; jeton avec `refresh_token` → `/app`
  (2 départs max en 20 s, page masquée, secours 4 s, rejoué sur `pageshow`).
  `capterOffre()` et `capterSource()` tournent en ligne sur TOUTES les pages
  vitrine, depuis les modules de l'app. `selftest:site-aiguillage`.
- **Balises de mesure — SOUS CONSENTEMENT sur le web (09/10 soir, CNIL)** :
  `index.html` garde ses blocs `<!-- site:balises:<nom>:debut/fin -->` (GTM,
  Insights, gtag AW, noscript GTM) — c'est ce que le natif et l'OTA embarquent,
  tel quel. Dans le build Vercel, les pages vitrine ET `app-shell.html` portent
  à la place UN bloc `consentement` (script en ligne
  `site/js/balises-consentement.js` : mode consentement Google v2 refusé par
  défaut, GTM et gtag AW chargés SEULEMENT après « Accepter », cookies Google
  effacés au refus) + `insights` (Vercel, sans cookie). Identifiants lus dans
  les blocs d'`index.html`. ⛔ Une balise ajoutée à `index.html` va DANS un
  bloc marqué (sinon `selftest:site-balises` tombe) ; un traceur hors du bloc
  consentement dans une page ou dans la coquille web = build rouge
  (`site:verifier`). Preuve en vrai Chrome : `npm run site:preuve-consentement`
  ; mesures : `docs/seo/mesures/consentement-2026-10-09.md`.
- **Consentement** : textes dans `src/utils/consentementTextes.js` (nomment
  Google ET Meta depuis le 09/10), lus par `BandeauConsentement.jsx` et par le
  bandeau du site. Clé de stockage `fs_consent_pub_v2` (`consentement.js`,
  commune) : un accord donné à l'ancien texte (Meta seul, `fs_consent_pub`)
  est redemandé, un refus d'avant reste un refus. `selftest:site-consentement`.
- **`fs_lang`** n'est jamais écrit au chargement d'une page vitrine : seulement
  sur un choix de langue explicite ou un CTA depuis `/en/…` (`langueApp` de
  `site/langues.mjs`).

## Gestes et garde-fous

- **Aperçu local** : `npm run site:apercu` (build dans `build/site-apercu/`,
  serveur qui rejoue `vercel.json`, casse des chemins comprise). ⛔ Jamais
  `FILLSELL_SITE=1` vers `dist/` : `dist/` est le dossier du natif et de l'OTA
  (l'app native démarrerait sur la page marketing) — le plugin le REFUSE hors de
  Vercel (`FILLSELL_SITE_DIST=1` pour passer outre en connaissance de cause,
  `vercel deploy --prebuilt`).
- **Build Vercel** : le générateur journalise toujours « site généré : N pages en
  X ms » (ou « site vitrine NON généré : raison ») puis rejoue `site:verifier`
  sur la sortie ; toute erreur = déploiement en échec, jamais une page partie de
  travers — SAUF les dates et les cartes de partage, simples avertissements sur
  Vercel. Il ne lit PLUS aucune base au build : la mécanique des quotas
  (`{{quota:…}}`, `coin_config`, `GRANTS_FALLBACK`, `site/js/quotas.js`) est
  retirée (décision de Nico du 09/10 : aucun chiffre de quota nulle part).
- **Production** (`VERCEL_ENV=production`, ou un build local sur `main`) : toute
  page `demonstration: true` ou « Brouillon de démonstration » est REFUSÉE. Le
  contenu réel remplace les brouillons avant la fusion sur `main`.
- **Un push du site = un redéploiement complet de l'app** (entrée renommée) :
  même règle qu'ailleurs, un seul push par lot.
- **Écran blanc / CDN** : les fichiers du site vivent sous `/assets/site/<nom>.<empreinte>.<ext>`,
  exclus des rewrites (un manquant = vrai 404, jamais la coquille en 200), en
  cache d'UNE HEURE (`must-revalidate`), comme l'app — pas `immutable` d'un an
  tant que la prévisualisation n'a pas prouvé qu'un 404 n'emporte pas l'en-tête
  (incident du 01/10). Sans `site.js` (404), la navigation mobile reste
  visible (classe `js` retirée par `onerror`). Variante « vitrine » du contrôle
  `Origin` de CLAUDE.md :
  `curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://fillsell.app' https://fillsell.app$(curl -s https://fillsell.app/ | grep -o '/assets/site/site\.[0-9a-f]*\.js')`.
- **Selftests** : `selftest:site-moteur`, `-aiguillage`, `-routes-app`,
  `-balises`, `-blog-lecteurs`, `-consentement` (hors ligne, < 10 s chacun).

## Design et gabarits (09/10 soir)

- **Types de pages** (`docs/seo/FORMAT-CONTENU.md`) : accueil, guide, trajet,
  plateforme, fonction, comparatif, alternative, classement, tarifs,
  glossaire, faq (+ article et liste du blog, 404). Un champ propre à un autre
  type, un jeton inconnu, un ancien `{{quota:…}}` : build rouge.
- **Données** : `site/donnees/plateformes.yml` (Depop OUVERTE, plus aucune trace
  de la plateforme sortie le 10/10, `republication_auto`, `vente_enregistree_seule`,
  `mode`), `tarifs.yml` (prix, ce qui est inclus SANS chiffre),
  `concurrents.yml` (GÉNÉRÉ : `npm run site:concurrents` depuis le brief).
- **Jetons** `{{plateformes}}`, `{{republication}}`, `{{nb_plateformes}}` : la
  republication Depop se retire d'UNE ligne de `plateformes.yml`.
- **CSS** : socle + modules (`/* @module nom : classes */` dans
  `site/styles/site.css`) ; chaque page n'embarque que ses modules ; budget
  24 Ko PAR PAGE (`scripts/site/lib/bundles.mjs`). Le module `bandeaux : @js`
  (consentement, langue) part dans site.js, jamais en ligne.
- **Médias** : badges officiels auto-hébergés (`site/medias/badges`), cartes de
  partage par page (`npm run site:og`, `site/medias/og`), icône 64 px
  (`site/medias/marque`). Plus aucune `og-image-*.png` de `public/` sur le site.
- **Serveur d'aperçu** : compresse (brotli/gzip) comme Vercel — sans ça, les
  mesures Lighthouse locales comptaient l'HTML en clair.
- **Revue technique corrigée (09/10, nuit)** — détail et mesures avant/après :
  `docs/seo/design/DESIGN.md` § 9. À retenir pour tout terminal :
  - **lexique** : `REGLES_DECISION` (`verify-site.mjs`) refuse tout palier,
    plan ou forfait dans la phrase d'une republication (republi*, remont*,
    repost*, relist*), lignes de tableau jointes ; une phrase qui énumère
    Vinted, Leboncoin, eBay et Beebs SANS Depop est refusée (le blog : en
    avertissement, tant que Nico n'a pas décidé s'il est relu avant la fusion) ;
  - **concurrents** : `npm run site:concurrents` retire de la ligne FillSell
    tout palier écrit à côté de la republication (journalisé) ; toute valeur
    du brief peut s'écrire `{ fr, en }` (`FORMAT-CONTENU.md` § 4) ;
  - **vidéo** : `video.json` déclare `poids_octets` (et, s'il veut, `sha256`)
    par fichier ; un fichier d'un autre poids = build du site rouge
    (avertissement dans les builds de l'app) ;
  - **icônes de l'app** : `public/favicon.ico` (16/32/48, 7,9 Ko au lieu de
    113 Ko) et `public/icon-192x192.png` (palette, 16 Ko au lieu de 46 Ko)
    recompressés, mêmes URL, rendu identique — à confirmer par Nico
    (retour : `git checkout -- public/favicon.ico public/icon-192x192.png`).

## Le blog

`src/blog/*.md` reste la source unique, partagée avec la SPA (`posts.js`) et
son contrat « une ligne `clé: valeur` » (`faq` = JSON sur UNE ligne).
Dans un build du site, `/blog`, `/en/blog` et chaque `/blog/<slug>` sont écrits
en statique par le générateur (gabarit `article`), sans JS de l'app ; un slug
inconnu passe encore par la coquille (rewrite `/blog/(.*)`), dont la SPA
recharge aussitôt `/blog` statique. Hors build du site, `prerenderBlog` fait
comme avant. La FAQ visible d'un article doit reprendre les questions de son
frontmatter : `selftest:site-blog-lecteurs`.

## À prouver sur la PRÉVISUALISATION avant le GO (personne ne l'a encore fait)

```
curl -sI https://<prev>/assets/site/absent.js        # 404 : lire Cache-Control (attendu : max-age=3600)
curl -sI -H 'Origin: https://fillsell.app' https://<prev>/assets/site/absent.js
curl -sI https://<prev>/app-shell.html               # X-Robots-Tag: noindex
curl -sI https://<prev>/legal                        # coquille, SANS X-Robots-Tag (l'en-tête suit le chemin DEMANDÉ)
curl -sI https://<prev>/extension                    # idem
curl -sI https://<prev>/auth/confirm?code=x          # coquille + X-Robots-Tag noindex
curl -sI https://<prev>/faq/                         # 308 → /faq
curl -sI https://<prev>/FAQ                          # 404 (casse)
curl -sI https://<prev>/inexistant                   # 404 + corps 404.html
```

Si `/legal` portait `X-Robots-Tag` : retirer la règle `/app-shell.html` de
`vercel.json` (elle désindexerait les mentions légales). Si le 404 de
`/assets/site/` ne porte PAS l'en-tête long : `immutable` d'un an peut revenir.

## Ce qui reste à trancher (Nico) avant la mise en ligne

- Le CONTENU réel (la production refuse les brouillons) : tarifs visibles
  (Stripe les exige sur le site du compte), et les ancres de l'ancienne
  landing (`/#tarifs`, `/#faq`, `/#comment`) si des liens de campagne les visent.
- `/blog/(.*)` : garder le rewrite (slug inconnu → coquille → `/blog` statique,
  200) ou le retirer (vrai 404 via `404.html`, une 301 par article renommé).
- Une règle Cloudflare « statut 404 → pas de cache » sur `/assets/*` (geste de
  Nico, côté Cloudflare) : protège aussi les images de `public/`, dont la règle
  `immutable` d'un an (antérieure au site) s'applique encore aux 404.
- Cloudflare renvoie 403 aux robots d'entraînement (GPTBot, ClaudeBot, CCBot…) :
  décision B2 de la revue B, hors code.
- `/extension` et `/legal` restent des coquilles de l'app (indexables, sans texte
  sans JS) ; `/legal` reste au sitemap (non-régression), sans `lastmod`.
- `/auth` (bouton « Se connecter » du popup de l'extension) passe par la SPA puis
  `/` : une redirection `/auth` → `/login` serait plus directe (revue A M2).
- GTM et Google Ads : sous consentement sur le web depuis le 09/10 (ci-dessus).
  **FAIT le 10/10 (décision de Nico : pas de bandeau dans l'app native)** : les
  builds hors site (natif, OTA, dev) retirent GTM, Google Ads, le noscript et le
  dns-prefetch GTM de la coquille (`scripts/vite-plugin-natif-sans-google.mjs`,
  `sansBalisesGoogle`, `selftest:site-balises` § 6 bis) — le build REFUSE tout
  traceur restant ; `/legal` § 5 réécrite d'après ce qui est réellement chargé
  (web : Google Analytics, Google Ads, pixel Meta après « Accepter » ; Vercel
  Web Analytics sans cookie ; app native : aucun traceur).
- Les contrôles de livraison OTA / binaires ne vérifient pas encore que
  `dist/index.html` est la coquille (revue A M4, point 2).
- `site/donnees/plateformes.yml` : les pays ouverts (Vinted hors de France avec
  la 0.6.106, eBay hors de France) sont à confirmer — le pied de page en tire
  le périmètre affiché.
- Le BLOG avant la fusion : les articles RÉÉCRITS (rédaction du 09/10) ne
  portent plus aucun avertissement ; restent ceux des deux anciens articles
  anglais laissés tels quels (`sell-same-item-…` : titre de 112 car., liste sans
  Depop, description 174 car. ; `how-to-calculate-…` : titre 81, description
  180). Les passer en erreur = une ligne de `verify-site.mjs` (branche `article`).
- Les valeurs ANGLAISES des faits concurrents : FAITES pour les seuls outils et
  critères de la comparaison de `/en` (fillsell, vendoo, crosslist, relistly ×
  plateformes, app_mobile, ia_photo, import_synchro, retrait_auto_copies,
  republication) ; les autres restent en français marqué `lang="fr"`.

## Intégration de la rédaction (09/10 nuit) — ce qui a bougé hors du texte

- Budgets relevés : HTML 120 Ko, CSS en ligne 26 Ko par page (`verify-site.mjs`,
  `bundles.mjs`) — la démonstration tenait dans 80 / 24 Ko, le vrai contenu non.
- Vérificateur : le lexique ne relit plus les citations (conditions des
  plateformes : « des bots », « search robots ») ; « Relistly » et « Reposter »
  ne passent plus pour un verbe de republication (`sansNomsOutils`).
- Gabarit : la cellule courte de la comparaison de l'accueil coupe aussi au
  « ; » anglais et jamais dans une citation ; le chapô anglais de la
  comparaison dit « The full comparison is in French ».
- Blog : jetons `{{…}}` écrits en clair (la SPA ne les remplace pas) ; FAQ
  `__FAQ__` de deux articles remplie depuis la FAQ visible.
- Les icônes recompressées de `public/` (ci-dessus) : touchent l'app (deux
  fichiers binaires, aucun code) ; le build natif ne diffère que d'elles et du
  libellé anglais du bandeau de consentement (« Read our privacy policy »,
  jamais affiché dans l'app).
