# Dépôt, git, build, écran blanc, site vitrine, selftests

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- Selftests (compte et morceaux mis de côté) (ex-L396-398)
- « FillSell — Instructions Claude » : jumeau AGENTS.md, chrome-extension/ (ex-L461-470)
- Dossier de travail unique, extension unique, déploiement CWS, OTA jamais depuis un worktree (ex-L495-526)
- ⛔ Site vitrine statique (09/10) (ex-L641-664)
- Format des réponses (ex-L665-668)
- Git (migrations inscrites, push direct sur main) (ex-L669-673)
- ⛔ Un seul push sur main par lot (ex-L674-686)
- ⛔ Écran blanc : le build avant le code (ex-L687-724)

<!-- ex-CLAUDE.md L396-398 : Selftests (compte et morceaux mis de côté) -->
- **Selftests** : 151 dans package.json + 37 scripts non câblés, 0 rouge (04/10). Morceaux 0.6.76/0.6.78 mis de côté le 28/09 :
  `scripts/lib/morceaux-mis-de-cote.mjs` (un morceau ne revient qu'avec sa
  preuve réelle — son test tombe sinon).

<!-- ex-CLAUDE.md L461-470 : « FillSell — Instructions Claude » : jumeau AGENTS.md, chrome-extension/ -->
# FillSell — Instructions Claude

> **Jumeau de `AGENTS.md`** (lu par Codex), qui reprend toutes les règles
> ci-dessous + architecture, état des chantiers et glossaire (`supabase/AGENTS.md`,
> `src/AGENTS.md`, `docs/agents/*.md`). Une règle ajoutée ici se reporte là-bas,
> le même jour. ⚠️ Codex ne lit que ~32 Ko d'`AGENTS.md` : garder la racine
> sous cette taille, le détail va dans `docs/agents/`. Jamais d'`AGENTS.md` ni
> d'autre fichier annexe dans `chrome-extension/` : tout commit dans ce
> dossier impose de recaler `EXTENSION_LAST_COMMIT`, sinon `npm run build` échoue.


<!-- ex-CLAUDE.md L495-526 : Dossier de travail unique, extension unique, déploiement CWS, OTA jamais depuis un worktree -->
## Dossier de travail — UN SEUL, sans exception

- Le SEUL dossier de travail est `C:\Users\nicol\fill-and-sell\`. Il n'en
  existe pas d'autre : l'ancien worktree
  `C:\Users\nicol\fill-and-sell-chrome-extension\` a été SUPPRIMÉ le
  26/07/2026 (il a coûté une matinée : zip CWS du 24/07 parti sans le fix
  Beebs, deux extensions actives se disputant les jobs). Si un rapport, une
  mémoire ou un commentaire de code y fait encore référence, il est périmé —
  ne JAMAIS y rediriger Nico, ne jamais le recréer.
- Le build de l'extension est produit dans `build\extension\`.
  Le poste Nico charge la copie stable autorisée dans
  `C:\Users\nicol\FillSell-Extension-Nico` (Fable, 28/09).
- UNE SEULE extension FillSell active dans Chrome à la fois — jamais la
  version Web Store ET une unpacked ensemble : elles pollent les mêmes jobs,
  se les disputent, et `handler_build` en base ment sur qui a traité quoi.
  Avant un test unpacked : désactiver/retirer la version Web Store.
- Un push sur main ne déploie PAS l'extension. Le déploiement, c'est :
  `npm run package:extension` (qui refuse tout paquet non traçable), puis
  téléverser `build\fillsell-extension-<version>-cws.zip` sur la fiche
  Chrome Web Store, ET cliquer « Envoyer pour examen ». Tant que ces trois
  gestes ne sont pas faits, les utilisateurs tournent sur l'ancien code —
  vérifiable par `profiles.extension_build` / `cross_post_jobs.handler_build`.
- ⛔ **Jamais d'OTA envoyée depuis un worktree** (04/10) : `npx @capgo/cli
  bundle upload` part du dossier principal SEULEMENT. Capgo hache octet par
  octet les sources natives des plugins dans `node_modules` : dans un
  worktree Windows (`core.autocrlf`), `patch-package` avait écrit des lignes
  CRLF dans `@capgo/native-purchases` — même version, même code — et l'OTA
  2.9.46 a déclenché une fausse alerte « native changes ». `.gitattributes`
  force désormais `patches/*.patch` en LF. Une alerte Capgo se vérifie dans
  `app_versions.native_packages` avant tout retour en arrière
  (`docs/agents/pieges.md`, Déploiement).


<!-- ex-CLAUDE.md L641-664 : ⛔ Site vitrine statique (09/10) -->
## ⛔ SITE VITRINE STATIQUE (09/10, en production le 10/10)

Le site public (accueil, guides, FAQ, blog) est généré en HTML statique par
`npm run build:vercel` ; l'app reste la SPA. Trois gestes pour TOUT terminal
(détail : `docs/agents/site-vitrine.md`) :
- **toucher `src/blog/*.md`, `site/contenu/` ou `site/donnees/` = `npm run
  site:dater` dans le même commit** (+ `site/dates.lock.json`) : sinon le build
  du site (`npm run site:apercu`) refuse (« DATES PÉRIMÉES ») ; `npm run build`
  (natif, OTA) et Vercel n'en font qu'un avertissement (revue technique C-6) ;
- **nouvelle route dans `AppRouter.jsx`, ou nouvelle URL `https://fillsell.app/…`
  dans un mail, une fonction edge, l'extension = l'ajouter à
  `scripts/site/routes-app.mjs` ET aux `rewrites` de `vercel.json`, même
  commit** : plus d'attrape-tout, sinon 404 en prod (tout build le refuse en
  nommant la route) ;
- **une page HTML dans `public/`** (vérification Search Console…) se nomme dans
  `HTML_PUBLIC_PERMIS` (`routes-app.mjs`).
⛔ `build:vercel` ne sert QUE Vercel : le natif et l'OTA restent `npm run build`
(jamais `FILLSELL_SITE=1` vers `dist/`).
⛔ **Traceurs (10/10, Nico)** : sur le web, Google (GTM, Google Ads) et le pixel
Meta ne se chargent qu'après « Accepter » (bandeau maison) ; l'app NATIVE n'a pas
de bandeau et ne charge AUCUNE balise Google (`scripts/vite-plugin-natif-sans-google.mjs`,
le build refuse tout traceur restant). Une balise ajoutée ou retirée = `/legal` § 5
mise à jour le même jour (`src/pages/Legal.jsx`).


<!-- ex-CLAUDE.md L665-668 : Format des réponses -->
## Format des réponses

Toujours mettre le contenu des réponses textuelles dans un bloc de code (``` ```) pour faciliter le copier-coller. Diagnostics, rapports, récapitulatifs, listes de changements — tout doit être dans un bloc.


<!-- ex-CLAUDE.md L669-673 : Git (migrations inscrites, push direct sur main) -->
## Git
- **Migrations Supabase** : appliquées en prod une par une (comportement normal et irréversible), et TOUJOURS inscrites dans l'historique : `db query --linked -f <fichier>` puis `migration repair --linked --status applied <version>` (règle du 01/10).
- **Code applicatif** (React, Edge Functions, extension Chrome) : commit et push **directement sur `main`**, plus de branche feature ni de PR (consigne 2026-07-21). Toujours build/vérifier avant de push — le push tient lieu de validation.
- Déployer les Edge Functions concernées quand elles changent (cf. section dédiée).


<!-- ex-CLAUDE.md L674-686 : ⛔ Un seul push sur main par lot -->
### ⛔ UN SEUL PUSH SUR `main` PAR LOT (consigne 2026-09-18, payée deux fois)

« Fichier par fichier » veut dire **commits**, JAMAIS déploiements. Les commits
restent séparés pour la lisibilité — ils **partent ensemble**.

Un push = un déploiement Vercel = **tous les chunks renommés**. Le 18/09, six
pushs en dix minutes (dont quatre déploiements en trente-trois secondes) ont
mis la prod à l'écran blanc : chaque onglet ouvert pointait sur des fichiers
qui venaient d'être supprimés. Le code était bon, le build vert.

Empiler les commits en local, vérifier, puis pousser **une fois**. Un fichier
neuf à sortir avant son câblage reste un COMMIT séparé dans le MÊME push.


<!-- ex-CLAUDE.md L687-724 : ⛔ Écran blanc : le build avant le code -->
### ⛔ ÉCRAN BLANC : LE BUILD AVANT LE CODE

Ordre de diagnostic, non négociable — une demi-journée perdue le 11/09 et une
autre le 18/09 pour avoir cherché dans les fichiers d'abord :

1. **l'empreinte du build** — en bas de la page Réglages, ou
   `curl https://fillsell.app/build.json` : elle dit quel commit tourne
   vraiment chez la personne (jamais `-dirty` depuis le 01/10 : `npm run
   build` REFUSE un arbre sale — Vercel comme OTA — et nomme les fichiers ;
   `package.json` et `package-lock.json` montent ENSEMBLE ; simple
   vérification de compilation : `npm run build:essai`, jamais servi) ;
2. **un rechargement forcé** — si l'écran revient, c'était un chunk périmé et
   il n'y a rien à corriger dans le code ;
   ⛔ **blanc MÊME après rechargement, pour tout le monde : le CDN** (01/10,
   22:22). Demander l'entrée COMME un navigateur, avec `Origin` :
   `e=$(curl -s https://fillsell.app/app | grep -o 'assets/index-[^"]*.js'); curl -s -o /dev/null -w '%{http_code}
' -H 'Origin: https://fillsell.app' https://fillsell.app/$e`
   — 404 ici et 200 sans `Origin` = Cloudflare garde un 404 pris au
   déploiement (une heure). Aucun code en cause ; remède : renommer l'entrée
   (toute modification exécutée de `src/main.jsx`), UN push, puis relire.
   Cause du 01/10 : deux pushs à deux minutes (code, puis docs) ;
3. **l'état du déploiement Vercel** (READY ou ERROR) ;
4. **alors seulement**, ouvrir un fichier.

⚠️ Un écran blanc n'est pas forcément une exception de rendu : avec `lazy()` +
`<Suspense fallback={null}>`, un 404 sur un chunk rend exactement le même écran
vide qu'un crash, **et le build est vert dans les deux cas**. Depuis e67aae3 la
garde `vite:preloadError` (src/main.jsx) recharge une fois toute seule — un
écran blanc qui SURVIT à ça, alors oui, c'est du code.

⛔ **Une variable lue sans être reçue = page blanche, build vert** (10/10,
publication en lot : `ReferenceError: userId is not defined` dès la fin de la
préparation, du 09/10 22:13 au 10/10). Le build la REFUSE désormais
(`selftest:variables-definies`, joué par `prebuild` : `no-undef` sur `src/`,
~5 s). Un écran qui enchaîne des articles pose des barrières
(`src/components/BarriereErreur.jsx`) : l'article qui casse est mis de côté
avec une phrase, les autres continuent — jamais tout l'écran.

