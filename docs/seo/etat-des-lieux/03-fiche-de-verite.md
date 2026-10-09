# 03 — Fiche de vérité du produit FillSell (09/10/2026)

> Fondation de tout le contenu SEO/GEO : **rien ne se publie qui n'y figure.**
> Observé le **2026-10-09** (entre 14:40 et 15:40, heure de Paris). Lecture seule : aucun SQL,
> aucune connexion à un compte, aucun déploiement, aucun commit.
> **Contre-vérifiée le 09/10 (15:05–15:45)** : `03b-contre-verification.md`. 4 affirmations fausses
> corrigées (F22, F43, F45, F63), 16 nuancées ; chaque ligne touchée porte la mention « corrigé par
> contre-vérification ».
> **Mise à jour du 09/10 (soir) — décisions de Nico** : `03c-decisions-nico-0910.md` (les six
> décisions, ce que dit le code, et chaque formulation ancienne → nouvelle). Elles **priment** sur
> tout le reste de cette fiche ; chaque ligne modifiée porte la mention « décision de Nico 09/10 ».

## 0. Ce qui a été lu, et ce qui tourne vraiment

| Élément | Valeur constatée le 09/10 | Source |
|---|---|---|
| Code lu | worktree `C:\Users\nicol\fill-and-sell-seo`, branche `seo-crosslisting`, HEAD `8fa7007` = `origin/main` | `git rev-parse HEAD origin/main` |
| Site web servi | build `2026-10-09T11:58:40Z+8fa7007` : le site en ligne = le code lu | `curl https://fillsell.app/build.json` (09/10) |
| Extension servie aux utilisateurs | **0.6.104**, « Dernière mise à jour 8 octobre 2026 », 360 utilisateurs, note 5,0 (1 avis), langue : français | https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm (09/10) |
| Extension dans le dépôt | **0.6.106** (`chrome-extension/manifest.json:4`) : 0.6.105 (Depop) et 0.6.106 (Vinted hors de France) **ne sont pas publiées** | `CLAUDE.md` (bandeau Depop, « Servi ») ; `git show 0cec9e6:chrome-extension/manifest.json` |
| App iOS (binaire) | « Version 2.8 », 24 sept., 15 Mo, iOS/iPadOS 15+, langue affichée : **Anglais** seulement | https://apps.apple.com/fr/app/fillsell/id6762152785 (09/10) |
| App Android (binaire) | « Date de mise à jour 24 sept. 2026 », 500+ téléchargements, éditeur affiché « NelsonCatStudio » | https://play.google.com/store/apps/details?id=app.fillsell.app (09/10) |
| Contenu de l'app | mis à jour par OTA (2.9.67 servie d'après `CLAUDE.md`) ; `package.json:4` = 2.9.68 (non lancée) | `CLAUDE.md` « Servi » |
| Base de données | **non lue** (SQL interdit) : les volumes viennent des migrations, des valeurs de repli du code et de `/legal` (« au 5 octobre 2026 ») — **la base fait foi** | voir § 14 |
| Serveur en avance sur le code lu | `main` LOCAL porte 3 commits non poussés (`4be8623`, `515670a`, `a2ed41b`) dont les migrations `20261009160000` (aucun mail « vendu » avant une vente enregistrée) et `20261009170000` (ventes eBay des gros comptes) **appliquées en prod** le 09/10, et `ebay-ventes-sync` v7. Le site web, lui, = `8fa7007`. — *corrigé par contre-vérification* | `git log 8fa7007..a2ed41b` ; `03b-contre-verification.md` § 0 |
| Relu pour les décisions de Nico (09/10 soir) | `main` du dépôt = `d1b7ac1` (= `origin/main` d'après la référence locale, non rafraîchie) : depuis `8fa7007`, aucun commit ne touche la republication automatique ni l'ouverture de Depop ; OTA 2.9.67 servie (build `9d203ac`) **sans** le code Depop de l'app (`8f88cdd`). Site non relu (connexion à fillsell.app exclue). — *décision de Nico 09/10* | `git diff 8fa7007..main` ; `git merge-base --is-ancestor 8f88cdd 9d203ac` (faux) ; `03c-decisions-nico-0910.md` § 2 |

**Légende de la colonne « Vérifié »** — `oui` : code et état de prod concordent ; `partiel` : code vu
mais réglage en base non relu, ou fonction derrière un interrupteur, ou mesure absente ; `non` :
absent, ou contredit par la prod.

**Règles d'écriture de la colonne « FR sûre »** : tutoiement (registre de la landing et de l'app),
aucun jargon (« job », « polling », « relevé », « token », « pépites » interdits), aucun chiffre qui
n'est pas lu dans la base au moment de la publication, aucune promesse de délai.
**Ajouts — décision de Nico 09/10** : ton **offensif, ultra vendeur** (formules courtes, bénéfices
concrets, comparatifs à notre avantage dans le cadre du § 16) ; **aucun chiffre de quota ni de
plafond**, même lu en base (les volumes de cette fiche sont de l'information interne) ; **jamais
« Opla »** ; **jamais de palier** à côté de la republication automatique ; **jamais eBay** à côté de
la republication ; toute liste de plateformes passe par un jeton du § 0 bis, jamais recopiée en dur.
Seule limite : rien que l'app ne fasse au moment de la mise en ligne.

## 0 bis. Listes de plateformes — une seule source (décision de Nico 09/10)

Chaque texte du site, chaque légende de capture et la vidéo nomment les plateformes **par ces
jetons** (dans le site : la donnée unique prévue par `docs/seo/PLAN.md` § 1.8,
`site/donnees/plateformes.yml`). Retirer Depop d'une liste = changer **une** valeur.

| Jeton | Ce qu'on dit | FR | EN | Condition pour Depop |
|---|---|---|---|---|
| `{PUB}` | publication (F24, F26) | Vinted, Leboncoin, eBay, Beebs et Depop | Vinted, Leboncoin, eBay, Beebs and Depop | D1 |
| `{SYNC}` | synchronisation (F33) | Vinted, Leboncoin, eBay, Beebs et Depop | Vinted, Leboncoin, eBay, Beebs and Depop | D1 |
| `{RETRAIT}` | retrait des copies à la vente (F44) | Vinted, Leboncoin, eBay, Beebs et Depop | Vinted, Leboncoin, eBay, Beebs and Depop | D1 (+ P3 pour une vente faite sur Depop) |
| `{REPUB_AUTO}` | republication automatique (F39) | **A** : Vinted, Leboncoin, Beebs et Depop · **B** : Vinted, Leboncoin et Beebs | **A** : Vinted, Leboncoin, Beebs and Depop · **B** : Vinted, Leboncoin and Beebs | D1 + **D2** (B tant que D2 n'est pas vérifié par Nico) |

- **eBay** n'entre jamais dans `{REPUB_AUTO}` et n'est jamais nommé à côté de la republication.
- **Opla** n'entre dans aucune liste (F55).
- **D1** — Depop ouverte à tous au moment de la mise en ligne : `depop_ouvert` = 1 (0 au 09/10),
  extension avec Depop servie par le Chrome Web Store (0.6.104 servie au 09/10 : sans Depop), OTA
  ≥ 2.9.68 pour l'app iPhone/Android ; clic « Autoriser Depop » côté personne. Si D1 manque au GO :
  Depop sort de toutes les listes et « cinq plateformes » devient « quatre ».
- **D2** — republication automatique Depop active : **non codée au 09/10** (F39 ; 03c § 2.1).
- **P1** (palier de l'automatique), **P3** (vente Depop enregistrée seule, jamais observée) : 03c § 2.2.

---

## 1. Accès : app, web, extension

| ID | Fait (prod ? · plateformes · auto ou geste · limites) | Vérifié | Preuve | Formulation sûre (FR) | Formulation EN | À ne pas dire |
|---|---|---|---|---|---|---|
| F01 | App iOS publiée. Lien réel : `https://apps.apple.com/app/id6762152785`. Nom de fiche « FillSell – Achat Revente », sous-titre « Assistant IA pour revendeurs », gratuite avec achats intégrés, iPhone et iPad (iOS 15+), utilisable sur Mac à puce M1 ou ultérieure **avec macOS 12 ou ultérieur** en tant qu'app iPad (*corrigé par contre-vérification*). 3 notes (5,0). | oui | `src/pages/LandingPage.jsx:43` ; `index.html:99,122-131` ; `ios/App/App.xcodeproj/project.pbxproj:250` (`IPHONEOS_DEPLOYMENT_TARGET = 15.0`) ; App Store 09/10 | « FillSell est gratuit sur l'App Store, pour iPhone et iPad (iOS 15 ou plus). » | "FillSell is free on the App Store for iPhone and iPad (iOS 15 or later)." | « app Mac », « noté 5 étoiles » sans dire « 3 avis », « des milliers d'utilisateurs » |
| F02 | App Android publiée. Package `app.fillsell.app`. Android 7.0 minimum (minSdk 24). 500+ téléchargements, PEGI 3. | oui | `capacitor.config.ts:4` ; `LandingPage.jsx:44` ; `android/variables.gradle:2` ; Google Play 09/10 | « FillSell est gratuit sur Google Play (Android 7 ou plus). » | "FillSell is free on Google Play (Android 7 or later)." | « des milliers de téléchargements » |
| F03 | Application web : la même app s'utilise dans un navigateur sur fillsell.app (route `/app`), sur ordinateur comme sur téléphone. | oui | `src/pages/ExtensionPage.jsx:99` (`nav("/app")`) ; `index.html:114` (`operatingSystem: "iOS, Android, Web"`) | « Tu peux aussi utiliser FillSell depuis ton ordinateur, sur fillsell.app. » | "You can also use FillSell from your computer at fillsell.app." | « app de bureau », « logiciel à installer sur PC » |
| F04 | Langues de l'app : **français et anglais** (dictionnaires `fr` et `en`). La fiche App Store n'affiche que « Anglais ». | oui (app) / non (fiche App Store) | `src/i18n/translations.js:2` (fr), `:389` (en) ; App Store 09/10 « Langues : Anglais » | « L'app est disponible en français et en anglais. » | "The app is available in French and English." | toute autre langue ; ne pas citer la fiche App Store comme preuve de langue |
| F05 | Extension Chrome publiée sur le Chrome Web Store, **seule voie d'installation** (le zip n'est plus proposé depuis le 07/09). Gratuite. Nom « FillSell — Cross-post ». Lien réel : `https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm`. | oui | `LandingPage.jsx:48-55` ; `ExtensionPage.jsx:9-21` ; CWS 09/10 | « L'extension FillSell s'installe gratuitement depuis le Chrome Web Store, une seule fois, et se met à jour toute seule. » | "The FillSell extension installs for free from the Chrome Web Store, once, and updates itself." | « télécharge le fichier zip », « mode développeur » |
| F06 | Navigateurs : extension Manifest V3 distribuée par le Chrome Web Store. **Chrome** : oui. **Microsoft Edge** : constaté en usage réel (« 6 postes Edge actifs le 09/10 ») mais non annoncé ni testé formellement. Brave, Opera : seulement reconnus par le code qui nomme le navigateur, jamais testés. Firefox, Safari : non. Téléphone : impossible (la page `/extension` le dit). | partiel | `chrome-extension/vinted-origine.js:23-26,89-107` ; `supabase/functions/_shared/navigateur-poste.js:4-9` ; `ExtensionPage.jsx:24-40,117-142` | « L'extension s'installe sur un ordinateur, dans Google Chrome. » (Edge : seulement après décision de Nico, ex. « elle fonctionne aussi dans Microsoft Edge ».) | "The extension installs on a computer, in Google Chrome." | « compatible tous navigateurs », « Firefox », « Safari », « Brave », « s'installe sur ton téléphone » |
| F07 | Rôle de l'extension : elle remplit les formulaires de dépôt, relit tes annonces quand tu appuies sur « Synchroniser », vérifie leur statut, repère les ventes et retire les annonces — sur Vinted, Leboncoin, eBay (si le compte n'est pas relié à l'API), Beebs et **Depop** (0.6.105 et plus, accès optionnel « Autoriser Depop » ; condition D1) ; elle **republie sur Vinted, Leboncoin, Beebs et Depop seulement** (eBay n'est jamais republié — et on n'en parle pas). Elle travaille une annonce après l'autre (pause de 8 à 20 s entre deux : information interne). *Corrigé par contre-vérification (eBay sorti de « republie ») ; Depop ajouté : décision de Nico 09/10.* | oui (Depop : prouvé sur le seul compte de Nico) | `chrome-extension/manifest.json:5,13-22` ; `src/pages/Legal.jsx:753-800` ; `chrome-extension/config.js:14,22-23` ; `chrome-extension/content-scripts/depop.js` ; `docs/reprise/terminal-depop-0910.md` « Parcours réel » | « L'extension bosse sur les sites à ta place : elle remplit les formulaires, relit tes annonces, repère tes ventes, retire et republie tes annonces — une à une, à un rythme humain. » | "The extension does the legwork on the sites for you: it fills in the forms, reads your listings, spots your sales, removes and reposts your listings — one at a time, at a human pace." | « instantané », « en masse en quelques secondes », « en temps réel », « Opla » |
| F08 | L'extension travaille dans une **fenêtre dédiée, réduite**, jamais au premier plan ; une fenêtre existe donc dans la barre des tâches. | oui | `chrome-extension/background.js:6136-6144` ; `docs/agents/extension.md` (règle 1 « Invisible, toujours ») | « Elle travaille dans une fenêtre réduite, sans prendre la main sur ce que tu fais. » | "It works in a minimised window, without taking over what you are doing." | « aucune fenêtre », « totalement invisible » (la fiche CWS dit « sans fenêtre visible » : à corriger) |
| F09 | Ordinateur allumé : la publication, la republication, les retraits et la détection des ventes sur Vinted, Leboncoin, Beebs et Depop (Depop : condition D1 — décision de Nico 09/10) exigent l'ordinateur allumé, Chrome ouvert, l'extension active et la session de la plateforme ouverte. L'extension empêche la mise en veille tant qu'il reste des annonces en file (au plus 4 h ; l'écran peut s'éteindre). Exception : eBay relié par l'API (F31). | oui | `src/pages/Legal.jsx:229-231` (permission `power`) ; `LandingPage.jsx:330-331` (FAQ) ; `chrome-extension/config.js:14` (poll 2 min) | « Pour que tes annonces partent, ton ordinateur doit être allumé avec Chrome ouvert. Tant qu'il reste des annonces à publier, l'extension empêche l'ordinateur de se mettre en veille. » | "For your listings to go out, your computer must be on with Chrome open. While listings are queued, the extension keeps the computer from going to sleep." | « tout se fait depuis le téléphone seul », « même ordinateur éteint » (sauf eBay relié) |
| F10 | Ordinateur éteint : les publications et retraits **attendent en file** et partent à la réouverture de Chrome ; un retrait bloqué est retenté (1 h, 3 h, 6 h). **Un dépôt resté en attente plus de 10 jours passe en échec** (quota rendu, « Relancer » d'un appui). **Toute** republication (manuelle comprise, pas seulement l'automatique) est refusée si l'extension n'a pas été vue depuis 7 jours. *Corrigé par contre-vérification.* | oui (nuancé) | `LandingPage.jsx:903` ; `src/hooks/useRepublicationPlanifiee.js:49-56` ; `supabase/functions/handler-watch/index.ts:2723-2745` (`PENDING_MUET_JOURS = 10`) ; `20261002120000_sortie_opla_quotas_et_republication.sql:137` (`extension_stale`) ; `CLAUDE.md` « Retraits (04/10) » | « Ordinateur éteint ? Rien n'est perdu : tes annonces attendent et partent à la prochaine ouverture de Chrome. » | "Computer off? Nothing is lost: your listings wait and go out the next time Chrome opens." | « FillSell continue la nuit ordinateur éteint » (c'est le Cloud, non lancé) |

## 2. Connexion aux plateformes, identifiants

| ID | Fait | Vérifié | Preuve | Formulation sûre (FR) | Formulation EN | À ne pas dire |
|---|---|---|---|---|---|---|
| F11 | Tu te connectes toi-même à Vinted, Leboncoin, Beebs et Depop dans ton navigateur ; l'extension agit dans ces sessions déjà ouvertes. FillSell ne lit ni ne stocke les mots de passe des plateformes. **Depop (décision de Nico 09/10, condition D1)** : l'accès au site est optionnel, accordé par un clic « Autoriser Depop » dans l'extension (0.6.105+, `Legal.jsx:266-268`) ; l'extension lit alors le jeton de session Depop pour agir depuis la page (C22). **Permission « cookies » (corrigé par contre-vérification)** : elle teste le cookie de session Vinted (`v_uid`), mais la version servie 0.6.104 **lit aussi les cookies d'opla.co, en envoie noms et tailles au serveur et peut les supprimer** ; la 0.6.105+ (non servie) lit le jeton Depop. `/legal` dit le contraire (C22) : ne rien écrire sur les cookies. | oui (nuancé) | `Legal.jsx:772` (8.2) ; `Legal.jsx:226-228` ; `ExtensionPage.jsx:88-90` ; `git show 0cec9e6:chrome-extension/background.js` l. 10706-10740 ; `chrome-extension/background.js:10805-10850,11162` | « FillSell ne te demande jamais tes mots de passe Vinted, Leboncoin, Beebs ou Depop : tu restes connecté(e) à tes comptes dans ton navigateur, comme d'habitude, et l'extension travaille dans ces sessions. Pour Depop, tu autorises l'accès d'un clic dans l'extension. » (décision de Nico 09/10 ; Depop sous D1) | "FillSell never asks for your Vinted, Leboncoin, Beebs or Depop passwords: you stay signed in to your accounts in your browser as usual, and the extension works within those sessions. For Depop, you allow access with one click in the extension." | « aucune donnée ne quitte ton navigateur » (le contenu des annonces est envoyé à FillSell), « FillSell n'a aucun accès à tes comptes » |
| F12 | eBay : on relie son compte par la page d'autorisation officielle d'eBay (OAuth) ; FillSell reçoit une autorisation, jamais le mot de passe. | oui | `supabase/functions/ebay-oauth-start/`, `ebay-oauth-callback/` ; `supabase/functions/_shared/ebay-voie.ts:1-60` | « Pour eBay, tu relies ton compte depuis la page officielle d'eBay : FillSell ne voit jamais ton mot de passe. » | "For eBay, you link your account through eBay's official page: FillSell never sees your password." | « partenaire officiel d'eBay », « certifié par eBay » |
| F13 | Compte FillSell : e-mail ou connexion Google (partout) / Apple (**iPhone et web seulement : l'app Android ne propose pas Apple**, corrigé par contre-vérification). | oui (nuancé) | `src/App.jsx:6376` (Apple), `:6434-6441` (OAuth), `:7106-7125` (fournisseurs par plateforme) ; `Legal.jsx:570-571` | « Tu crées ton compte avec ton e-mail ou ton compte Google (ou Apple sur iPhone et sur le web). » | "Create your account with your email or your Google account (or Apple on iPhone and on the web)." | « connexion Apple sur Android » |
| F14 | Une seule extension active à la fois : deux copies publieraient en double. | oui | `ExtensionPage.jsx:216-221` | « Une seule extension FillSell par navigateur. » | "One FillSell extension per browser." | — |

## 3. Lens et IA

| ID | Fait | Vérifié | Preuve | Formulation sûre (FR) | Formulation EN | À ne pas dire |
|---|---|---|---|---|---|---|
| F15 | Lens : photo(s) de l'article → objet, titre, marque, modèle, matière, couleur, état estimé, taille, description, prix conseillé, fourchette de marché, annonces comparables, conseils. Modèle d'IA : Claude Haiku 4.5 (Anthropic). Lit les 5 premières photos ; la fiche les garde toutes. Depuis l'app, le scan rédige aussi l'annonce de chaque plateforme (Vinted, Leboncoin, Beebs, eBay) — mode « annonce » derrière l'interrupteur `lens_unifie` ; éteint, l'app rédige en deux temps, même résultat (note de contre-vérification, `lens-analysis/index.ts:84-91`). | oui | `supabase/functions/lens-analysis/index.ts:251` (schéma), `:1821` (modèle) ; `src/utils/photos.js:107` ; `src/App.jsx:7621-7655` (`mode:'annonce'`) | « Tu prends l'article en photo : Lens reconnaît l'objet, lit la marque, propose un état et un prix, et rédige le titre et la description. Tu relis et tu corriges avant de publier. » | "Take a photo of the item: Lens recognises it, reads the brand, suggests a condition and a price, and writes the title and description. You review and edit before publishing." | « sans relecture », « 100 % exact », « reconnaît tout » |
| F16 | Marque : l'IA a pour **règle** de ne remplir que la marque lue sur l'objet (étiquette, logo, gravure) et de laisser vide sinon — c'est une consigne donnée au modèle, pas une garantie (corrigé par contre-vérification). | oui (nuancé) | `lens-analysis/index.ts:430-485` (« NE JAMAIS construire une requête sur une marque que tu n'as pas lue ») ; `:96-107` | « Lens est réglé pour ne remplir la marque que s'il la lit sur l'article ; sinon il la laisse vide. Tu vérifies avant de publier. » | "Lens is set to fill in the brand only when it reads it on the item; otherwise it leaves it blank. You check before publishing." | « reconnaît toutes les marques » |
| F17 | Modèle : rempli quand il est lu ou reconnu, avec sa source (`lue` / `reconnue` / `web`). | partiel | `lens-analysis/index.ts:251` (`modele_source`) | « Quand il le reconnaît, Lens indique aussi le modèle. » | "When it recognises it, Lens also gives the model." | « identifie le modèle exact à coup sûr » |
| F18 | État : **estimé** sur les photos, dans une liste fermée (Neuf avec étiquette, Neuf sans étiquette, Très bon état, Bon état, Satisfaisant). L'état choisi par la personne n'est jamais embelli. | oui | `lens-analysis/index.ts:251` (`etat_estime`) ; fiche App Store (« l'état que tu as choisi n'est jamais embelli ») | « Lens propose un état, de « Neuf avec étiquette » à « Satisfaisant » ; c'est toi qui le confirmes. » | "Lens suggests a condition, from 'New with tags' to 'Satisfactory'; you confirm it." | « détecte les défauts », « diagnostic » |
| F19 | Prix proposé : établi par une **recherche web d'annonces comparables** (Vinted d'abord, puis eBay, Leboncoin), jusqu'à 8 annonces citées ; l'écran dit sur combien d'annonces le prix repose (solide / fragile / aucune). Sans donnée : confiance basse. Ne repose plus sur l'historique de ventes de la personne (notes de version App Store 2.7). | oui | `lens-analysis/index.ts:441,485-486` ; `:2557-2586` (`web_search`) ; `src/components/AnalyseMarche.jsx:1-60` | « Lens propose un prix à partir d'annonces comparables trouvées en ligne et te montre sur combien d'annonces il s'appuie. » | "Lens suggests a price based on comparable listings found online and shows you how many listings it relies on." | « prix exact », « prix garanti », « base de millions de ventes », « cote officielle » |
| F20 | Un scan Lens compte comme **une annonce** du forfait (un seul compteur). | oui | `LandingPage.jsx:336-337` ; `Legal.jsx:482` (CGV 3.4) | « Un scan Lens compte comme une annonce de ton forfait. » | "A Lens scan counts as one listing from your plan." | « Lens illimité » |
| F21 | Retouche photo par IA (OpenAI, modèle d'image) : deux niveaux (légère ; avancée avec choix de fond), réservée aux forfaits payants (Gratuit : aucune). Volumes (5 photos au plus par annonce ; Gratuit 0, Premium 5, Pro 20, Business 50 annonces retouchées par mois) : **information interne, jamais publiée — décision de Nico 09/10**. | oui | `supabase/functions/generate-listing/index.ts:859-913,943` ; `supabase/migrations/20260902203000_bascule_quotas_valeurs.sql:37-38` ; `Legal.jsx:483-486` | « Avec Premium, Pro ou Business, l'IA retouche tes photos (lumière, fond) pour des annonces qui sautent aux yeux. » | "With Premium, Pro or Business, AI touches up your photos (lighting, background) so your listings stand out." | tout chiffre (photos par annonce, annonces retouchées par mois — décision de Nico 09/10), « photos retouchées pour tous » (la landing le laisse entendre, `LandingPage.jsx:1198`), « qualité studio » |
| F22 | Voix : commandes vocales pour gérer le stock (ajouter, vendre, déplacer, demander un conseil) et dictée dans les champs. Transcription par Whisper (OpenAI), compréhension par Claude Haiku. **Plafonds (corrigé par contre-vérification)** : Gratuit 50 par jour, **et** des plafonds **mensuels** de commandes vocales posés le 02/09 pour **tous** les paliers (`quota_voix_free` 10, `premium` 30, `pro` 80, `business` 200 par mois calendaire) que `voice-intent` applique — valeurs non relues en base. La dictée seule n'a pas de plafond mensuel. Chiffres : information interne, jamais publiée (décision de Nico 09/10). | **faux (chiffres d'avant) → corrigé** | `src/App.jsx:181` (`VOICE_FREE_LIMIT = 50`), `:4204-4212` ; `supabase/migrations/20260902203000_bascule_quotas_valeurs.sql:39-40` ; `supabase/functions/voice-intent/index.ts:1085-1116` ; `voice-transcribe/index.ts:100-102,226-230` ; `ConversionModal.jsx:186-191` | « Tu peux dicter un article ou gérer ton stock à la voix. » (aucun chiffre) | "You can dictate an item or manage your stock by voice." | tout chiffre de commandes vocales, « voix illimitée » (aucun palier), « l'IA comprend tout » |
| F23 | Analyse IA des statistiques (tendances, conseils) sur l'onglet Stats, sans restriction de palier visible dans le code. | partiel | `src/tabs/StatsTab.jsx:443-480,578-602` | « FillSell commente tes chiffres et te donne des pistes. » | "FillSell comments on your numbers and gives you ideas." | « prédictions » chiffrées, « ROI » (aucun champ ROI dans l'app) |

## 4. Publication croisée

| ID | Fait | Vérifié | Preuve | Formulation sûre (FR) | Formulation EN | À ne pas dire |
|---|---|---|---|---|---|---|
| F24 | Publication à l'unité sur **Vinted, Leboncoin, eBay, Beebs et Depop** (jeton `{PUB}` — **décision de Nico 09/10** ; Depop sous la condition D1 : au 09/10 seules les quatre premières sont ouvertes à tous, `PLATEFORMES_STOCK_OUVERTES`, Depop en bêta du seul compte de Nico, publication prouvée en réel sur ce compte). Tu coches les plateformes (Depop n'est jamais cochée d'office, `stockFiltres.js:95`) ; l'extension remplit chaque formulaire. Un champ qui manque devient une question en français (jamais une relance en boucle). Note de contre-vérification : sur eBay, la voie de l'extension bute souvent sur la reconnexion de sécurité d'eBay ; la publication attend alors « Connecte ton compte eBay » (relier le compte, F31, est le chemin conseillé). | oui (nuancé) | `src/utils/stockFiltres.js:86` (`PLATEFORMES_STOCK_OUVERTES`) ; `CLAUDE.md` « Un champ manquant se demande » ; `supabase/functions/update-job-status/index.ts:1160-1240` ; `_shared/ebay-voie.ts:1-20` | « Une annonce, cinq plateformes : tu la remplis une fois, FillSell la publie sur celles que tu coches — Vinted, Leboncoin, eBay, Beebs et Depop. S'il manque une info, l'app te la demande. » (`{PUB}` ; sans D1 : « quatre plateformes » et la liste sans Depop) | "One listing, five marketplaces: fill it in once, FillSell publishes it on the ones you tick — Vinted, Leboncoin, eBay, Beebs and Depop. If anything's missing, the app asks you." | « toutes les plateformes », « Vestiaire », « Facebook Marketplace », « Opla » (toujours — décision de Nico 09/10), « Depop » tant que D1 n'est pas rempli, « sans jamais rien te demander » |
| F25 | Une version par plateforme : titre, description et état écrits une fois ; catégorie, taille, couleur et colis adaptés à chaque site. Un rayon introuvable devient une question, jamais une plateforme grisée. **Depop (décision de Nico 09/10)** : sa copie dérive de la copie Vinted (pas de rédaction IA propre), sans titre, avec des hashtags ; rayon par identifiant Depop ou choisi à la main (`src/utils/depopPublication.js:1-24`). | oui | fiches stores (09/10) ; `supabase/functions/_shared/redaction-plateformes.ts` ; `CLAUDE.md` « Un rayon introuvable se DEMANDE » | « Chaque plateforme reçoit une annonce adaptée à ses rubriques : catégorie, taille, couleur, colis. » | "Each marketplace gets a listing adapted to its own fields: category, size, colour, parcel." | — |
| F26 | Publication en lot : livrée (03/10). Taille de lot plafonnée (20 articles, plafond technique « décision à confirmer » — **information interne, jamais publiée : décision de Nico 09/10**), articles choisis dans le Stock ; questions du lot regroupées ; suivi et arrêt du lot. Plateformes : Vinted, Leboncoin, eBay, Beebs, **et Depop là où elle est ouverte** (`PLATEFORMES_LOT`, condition D1 — décision de Nico 09/10). **Le lot reste dans le quota du mois** : chaque article rédigé compte une annonce ; le Gratuit n'en prépare jamais au-delà de son quota (chiffre : information interne) — *corrigé par contre-vérification*. | oui (nuancé) | `src/publication/lot/regles.js:15-23,108-135,364-372` ; `src/publication/lot/EntreesStock.jsx:42-53` ; `docs/publication-en-lot.md` ; `CLAUDE.md` « Publication en lot (03/10) : livrée » | « Publie tout un lot d'articles d'un coup : tu choisis les plateformes, FillSell prépare, tu vérifies, c'est parti. » | "Publish a whole batch of items in one go: you pick the marketplaces, FillSell prepares, you check, off it goes." | tout chiffre de taille de lot (« jusqu'à 20 articles » — décision de Nico 09/10), « publication en masse illimitée », « 100 articles en un clic » |
| F27 | La publication elle-même n'est **pas décomptée** : le quota porte sur les annonces **créées par l'IA** (depuis une photo ou un article du stock). **En pratique (corrigé par contre-vérification)** : chaque nouvel article à publier passe par une rédaction IA (1 annonce), y compris un article importé qu'on publie sur une nouvelle plateforme ; seul un article **déjà rédigé** pour les plateformes visées part sans rien compter. Le Gratuit publie donc 5 articles par mois, chacun sur toutes ses plateformes (chiffre : information interne, jamais publiée — décision de Nico 09/10). | oui (nuancé) | `Legal.jsx:482-487` (CGV 3.4) ; `LandingPage.jsx:325` (FAQ) ; `supabase/functions/generate-listing/index.ts:500-540` ; `src/publication/lot/regles.js:108-117` | « Ton forfait compte les articles rédigés par l'IA ; une fois rédigé, un article part sur toutes tes plateformes sans rien compter de plus. » | "Your plan counts the items written by AI; once written, an item goes out to all your marketplaces at no extra count." | « N annonces publiées par mois » (libellé ambigu des cartes de la landing, voir C09) |
| F28 | Rythme : une annonce à la fois, 8 à 20 s aléatoires entre deux ; Leboncoin, une seule à la fois par compte. | oui | `chrome-extension/config.js:22-23` ; `docs/publication-en-lot.md:20` | « L'extension publie tes annonces une à une, à un rythme humain. » | "The extension publishes your listings one by one, at a human pace." | « publication instantanée » |
| F29 | Modération : Leboncoin et Beebs vérifient les nouvelles annonces (elles peuvent rester invisibles un temps) ; un dépôt jamais vu en ligne est compté comme un échec (refus de modération), pas comme une vente. | oui | `Legal.jsx:159` ; `supabase/migrations/20261009140000_depot_jamais_en_ligne_echec_publication.sql` | « Leboncoin et Beebs vérifient les nouvelles annonces : elles peuvent mettre un moment à apparaître. » | "Leboncoin and Beebs review new listings: they can take a while to appear." | « en ligne immédiatement partout » |
| F30 | Leboncoin : l'extension ne valide jamais d'option payante (« Valider et payer »). | partiel | `docs/publication-en-lot.md:25` | « FillSell ne souscrit jamais d'option payante à ta place. » | "FillSell never buys a paid option on your behalf." | — |
| F31 | eBay : si le compte eBay est **relié**, la publication passe par l'**API officielle d'eBay** côté serveur (sans ordinateur allumé), sur **ebay.fr uniquement** (`EBAY_FR`) ; un compte eBay inscrit dans un autre pays n'est pas publié (raison affichée ; mig `20261009150000` appliquée). Le compte relié doit être **prêt à vendre chez eBay** (politiques de paiement, de retours et de livraison ; vendeur non bloqué), sinon la publication attend — *corrigé par contre-vérification* (`_shared/ebay-voie.ts:55-70`). Compte non relié : publication par l'extension. eBay n'est jamais republié. | oui (nuancé) | `supabase/functions/ebay-api-worker/index.ts:1-10,3125` ; `supabase/functions/_shared/ebay-publication.ts:22` ; `supabase/migrations/20261005140000_ebay_voie_de_creation.sql:77-122` ; `supabase/migrations/20261009150000_ebay_site_du_compte.sql` | « Sur eBay France, une fois ton compte relié, FillSell publie par l'interface officielle d'eBay, même si ton ordinateur est éteint. » | "On eBay France, once your account is linked, FillSell publishes through eBay's official interface, even with your computer off." | « tous les sites eBay », « eBay.com / UK / Allemagne », « republication eBay » |
| F32 | Vinted : **France (vinted.fr)** dans la version servie (0.6.104). Les 17 sites Vinted de la zone euro sont prêts en 0.6.106 (permission optionnelle) mais **non publiés**. | oui | `git show 0cec9e6:chrome-extension/manifest.json` (hôtes vinted.fr / vinted.com) ; `chrome-extension/manifest.json:23-43` (0.6.106) ; `chrome-extension/vinted-origine.js:13-38` | « Vinted France. » | "Vinted France." | « Vinted dans toute l'Europe », « Vinted Belgique, Italie… » (tant que 0.6.106 n'est pas servie) |

## 5. Synchronisation (import du stock déjà en ligne)

| ID | Fait | Vérifié | Preuve | Formulation sûre (FR) | Formulation EN | À ne pas dire |
|---|---|---|---|---|---|---|
| F33 | Import des annonces déjà en ligne sur Vinted, Leboncoin, eBay (par l'API si relié, sinon par l'extension), Beebs **et Depop** (jeton `{SYNC}` — décision de Nico 09/10 ; Depop sous D1 : relevé codé, `src/utils/syncPlateformes.js:23`, et prouvé sur le seul compte de Nico le 09/10, `docs/reprise/terminal-depop-0910.md`), **uniquement sur appui de « Synchroniser »** (règle du 05/10 : plus aucun import lancé tout seul). Un seul appui relit les plateformes **où tu vends** (« Où tu vends ? ») et auxquelles tu es connecté(e) ; une plateforme lue il y a moins de 15 min n'est pas relue. Le relevé multiplateforme passe par l'interrupteur `sync_multi_ouverte` (valeur 1 déduite, non relue). Aucun quota sur l'import, tous paliers. *Corrigé par contre-vérification.* | oui (nuancé) | `src/annonces/textes.js:41` ; `src/tabs/StockTab.jsx:3830` ; `CLAUDE.md` « UN RELEVÉ D'IMPORT NE PART QUE SUR SYNCHRONISER » et « Aucun quota sur l'import » ; `docs/multi-synchro.md:3-4` ; `ConversionModal.jsx:186-187` | « Un appui sur « Synchroniser » et tes annonces déjà en ligne sur Vinted, Leboncoin, eBay, Beebs et Depop arrivent dans ton stock, rangées. Gratuit et sans limite. » (`{SYNC}`) | "One tap on 'Sync' and your listings already live on Vinted, Leboncoin, eBay, Beebs and Depop land in your stock, neatly filed. Free and unlimited." | « en arrière-plan sans rien faire », « en 40 secondes » (illustration de la landing, `:942-943`), « tes annonces remontent toutes seules » pour l'import (`ExtensionPage.jsx:176` ; la formule reste juste pour la republication automatique, F39), « Depop » tant que D1 n'est pas rempli |
| F34 | La synchronisation **lit** seulement : elle ne publie ni ne modifie aucune annonce. **Mais (corrigé par contre-vérification)** une vente qu'elle révèle (dressing Vinted « vendu ») est enregistrée seule et **fait retirer les copies de l'article ailleurs** (F43-F44) ; elle complète aussi les champs vides des fiches. | oui (nuancé) | `LandingPage.jsx:954` ; `ExtensionPage.jsx:178` ; `20261008233100_ventes_prouvees_automatiques.sql:20-41` | « Synchroniser lit tes annonces : rien n'est publié ni modifié. » | "Syncing reads your listings: nothing is published or edited." | « rien n'est jamais supprimé » (une vente révélée fait retirer les copies) |
| F35 | Une fiche par article : rapprochement côté serveur. Fusion seulement sur **mêmes photos ET accord du titre**, sans conflit (type, couleur, taille) ni concurrent ; ou identifiant d'un dépôt FillSell. Jamais la photo seule, jamais le titre seul ; deux annonces d'une même plateforme = deux exemplaires. Doute → « Annonces à vérifier » / « Est-ce le même article ? », hors du stock. Les décisions de la personne sont définitives. | oui | `docs/multi-synchro.md:22-47` ; `supabase/functions/_shared/rapprochement/` ; `CLAUDE.md` « RATTACHEMENT AVANT STOCK » ; `src/annonces/textes.js` (`rapprochementSous`) | « Un même article en ligne sur plusieurs plateformes devient une seule fiche : FillSell compare les photos et le titre. Au moindre doute, il te pose la question au lieu de deviner. » | "The same item live on several marketplaces becomes a single card: FillSell compares photos and title. When in doubt, it asks you instead of guessing." | « reconnaît automatiquement tous les doublons », « par le titre », « 100 % fiable » |
| F36 | Plusieurs boutiques Vinted : FillSell peut en suivre plusieurs (aucune limite par palier) ; il travaille sur celle qui est connectée dans le navigateur ; une boutique ne s'ajoute que sur clic « Ajouter @x à mes boutiques ». | partiel | `src/stock/ConfirmationBoutique.jsx:1-17` ; `docs/publication-en-lot.md:24` (un dépôt part sur la boutique connectée) | « Tu as plusieurs boutiques Vinted ? FillSell peut les suivre toutes ; il travaille sur celle où tu es connecté(e) dans ton navigateur. » | "Several Vinted shops? FillSell can follow them all; it works on the one you're signed in to in your browser." | « gère plusieurs comptes Vinted en même temps », « multi-comptes simultanés » |

## 6. Republication

| ID | Fait | Vérifié | Preuve | Formulation sûre (FR) | Formulation EN | À ne pas dire |
|---|---|---|---|---|---|---|
| F37 | Republier = **retirer l'annonce puis la redéposer** (Vinted, Leboncoin, Beebs, **Depop** — Depop à la demande : codée et prouvée sur le seul compte de Nico le 09/10, suppression puis recréation ; décision de Nico 09/10, sous D1) : nouvelle annonce, vues, favoris et ancienneté perdus, effet irréversible. eBay n'est jamais republié. Une même annonce n'est pas republiée deux fois en 24 h. Leboncoin et Beebs passent par l'interrupteur serveur `republication_multi_ouverte` (fail-closed) — ouvert **en fait** (republications Beebs du 06 et du 08/10), non relu en base. *Corrigé par contre-vérification* (`20260917220000_republication_multiplateforme.sql:13-45` ; `StockTab.jsx:5815-5845`). | oui (nuancé) | `Legal.jsx:159` (CGV art. 4) ; `src/components/RepublicationPlanifiee.jsx:62-69` ; `src/utils/republication.js:24-26` ; `src/hooks/useRepublicationPlanifiee.js:30-32` | « Republier, c'est retirer l'annonce puis la remettre en ligne : elle repart en haut des résultats, mais ses vues et ses favoris repartent de zéro. » | "Reposting means removing the listing and putting it back online: it goes back to the top of the results, but its views and favourites start from zero." | « sans perdre tes favoris », eBay à côté de la republication sous toute forme (« republication eBay », « sauf eBay » — décision de Nico 09/10), « modifie l'annonce sans la supprimer » |
| F38 | Republication **manuelle** (un appui, ou en lot pour les payants) sur tous les paliers, sur Vinted, Leboncoin, Beebs et Depop (Depop sous D1 — décision de Nico 09/10). Volumes mensuels : Gratuit 50 (depuis le 05/10, plus « à vie »), Premium 1 500, Pro 5 000, Business sans plafond mensuel — **information interne, jamais publiée (décision de Nico 09/10)**. « Republier en lot » : forfaits payants seulement. Toute republication exige une extension vue dans les 7 derniers jours (*corrigé par contre-vérification*). | oui (valeurs au 05/10) | `supabase/migrations/20261005173000_republication_free_mensuelle.sql:47` ; `20260902203000_bascule_quotas_valeurs.sql:34-35` ; `Legal.jsx:483-486` ; `ConversionModal.jsx:1064` | « Sur tous les forfaits, tu remontes une annonce en un appui. » | "On every plan, you bump a listing with one tap." | « republications offertes à vie » (fiches stores, faux depuis le 05/10), tout volume de republication (« 50 par mois »… — décision de Nico 09/10), « illimité », « autant que tu veux » |
| F39 | Republication **automatique par créneaux**. **Décision de Nico 09/10** : elle se présente sur **Vinted, Leboncoin, Beebs et Depop** (jeton `{REPUB_AUTO}`, § 0 bis), à **tous** les paliers, **aucun palier écrit à côté** ; eBay n'est jamais mentionné. **Ce que dit le code au 09/10** (points à confirmer, `03c-decisions-nico-0910.md` § 2) : (a) **Pro et Business** seulement (refus `auto_reserve_pro`, balayage qui arrête un compte non Pro, écran « Réservée au plan Pro ») → **P1** ; (b) plateformes du module : Vinted, Leboncoin, Beebs (et Opla jusqu'à la bascule du 10/10) — **Depop absente** (`republish_planifiee_plateformes()`, `PLATEFORMES_PLANIFIEES`, aucune clé `republish_planifiee_pf_depop`, aucune ligne Depop à l'écran) → **D2** : version B tant que Nico ne l'a pas vérifiée active. Réglages : jours, créneau (préréglages matin, midi, soir), ancienneté minimale (plancher de sécurité d'une semaine, réglable jusqu'à un an : pas un quota), un plafond et l'ordre (valeurs : information interne). Ordinateur allumé requis ; rien ne part si l'extension n'a pas été vue depuis une semaine, ni sur Vinted pendant une vérification anti-robot du compte (`pause_antirobot`, note de contre-vérification). | partiel (P1, D2 ; ouverture par plateforme non relue en base) | `RepublicationPlanifiee.jsx:29-33,57-84,114-119,358,727` ; `useRepublicationPlanifiee.js:30-40,49-56` ; `20260918200100_republication_planifiee_multi_fonctions.sql:51-54` ; `20261005173000_republication_free_mensuelle.sql:401-409` ; `20261008140000_republication_finit_dans_son_creneau.sql:130-133` ; `20261009020000_depop_plateforme_base.sql:37-38` ; `src/tabs/StockTab.jsx:4528-4543` ; `ConversionModal.jsx:238-282` | « Tes annonces remontent toutes seules : FillSell les republie sur {REPUB_AUTO}, les jours et au créneau que tu choisis, pendant que tu fais autre chose — ordinateur allumé. » (A : « Vinted, Leboncoin, Beebs et Depop » ; B : « Vinted, Leboncoin et Beebs ») | "Your listings bump themselves back up: FillSell reposts them on {REPUB_AUTO}, on the days and in the time slot you choose, while you get on with something else — with your computer on." (A: "Vinted, Leboncoin, Beebs and Depop"; B: "Vinted, Leboncoin and Beebs") | tout palier à côté (« avec Pro », « réservée à Business », « dès le gratuit », « sur tous les forfaits » — décision de Nico 09/10), tout chiffre de plafond ou de quota, « toutes les 24 h » (`LandingPage.jsx:720,1107`), « 24 h/24 », « même ordinateur éteint », eBay sous toute forme, « Depop » tant que D2 n'est pas vérifié |
| F40 | Garde-fous : pause après une série de republications, plafond quotidien **par palier** (valeurs des migrations : repli 45, Premium 50, Pro 170, Business 100 000 ; la base fait foi — **information interne, jamais publiée : décision de Nico 09/10**), coupure de tout d'un geste (`republish_planifiee_pause_generale`). | partiel | `supabase/functions/get-pending-jobs/index.ts:505-600` ; `supabase/migrations/20260904120000_republish_pause_et_plafonds_par_palier.sql:43-45` ; `20260912130000_republish_planifiee_coin_config.sql:5,56` ; `src/hooks/useRepublicationPlanifiee.js:13-14` | « FillSell espace tes republications à un rythme humain pour protéger ton compte. Tu coupes tout d'un geste, quand tu veux. » | "FillSell spaces out your reposts at a human pace to protect your account. Switch it all off in one tap, whenever you like." | tout chiffre (« 45 par jour quel que soit le plan » de la FAQ et des CGV, plafonds par palier — décision de Nico 09/10), « zéro risque de bannissement » |
| F41 | Remise en vente après une vente partielle : si une fiche a plusieurs exemplaires et qu'une vente clôt l'annonce d'une plateforme, FillSell republie le même contenu sur cette plateforme (compte comme une republication ; reportée si le plafond est atteint). En service (cron 31, GO de Nico). Seulement pour une annonce **déposée par FillSell** : une annonce importée à plusieurs exemplaires n'est jamais remise en vente (note de contre-vérification, `20261005100000…:13-14`). | oui | `supabase/migrations/20261005100000_remise_en_vente_apres_vente_partielle.sql:1-31` ; `CLAUDE.md` « 05/10 » | « Tu vends un article en plusieurs exemplaires ? Après une vente, FillSell le remet en ligne sur la plateforme où il s'est vendu. » | "Selling an item in several units? After a sale, FillSell relists it on the marketplace where it sold." | « gestion de stock multi-entrepôt » |

## 7. Ventes, retraits, notifications

| ID | Fait | Vérifié | Preuve | Formulation sûre (FR) | Formulation EN | À ne pas dire |
|---|---|---|---|---|---|---|
| F42 | **Décision de Nico 09/10 : Depop ajoutée** (sous D1) — par le veilleur de l'extension, qui lit l'état de l'annonce Depop sur son identifiant exact (`STATUS_PURCHASED` → vendue, `chrome-extension/background.js:11173-11202`) ; **jamais observée en réel** (aucune vente Depop au parcours du 09/10) → P3. Détection des ventes : Vinted, Leboncoin, Beebs par l'extension (vérification des annonces publiées ; liste des commandes Vinted et Leboncoin relue toutes les 10 min pour les comptes **payants** seulement) ; eBay par le serveur (relecture eBay de chaque annonce, notifications de commande pour les comptes reliés). Délai réel non remesuré depuis ces changements ; mesure du 05/10 (avant) : Vinted, médiane 8,3 h jusqu'au signal. **Précisions (corrigé par contre-vérification)** : chaque annonce est relue par l'extension **au plus toutes les 2 h**, après un délai de grâce (2 h après un dépôt, 12 h après une republication), et « plus en ligne » exige deux lectures ; Beebs ne conclut jamais « vendue », seulement « plus en ligne » ; eBay : une relecture **toutes les 6 h par annonce**, quelques minutes pour les comptes reliés ; **247 ventes eBay manquaient** au parc jusqu'au 09/10 (rattrapées, mig `20261009170000`) et une enchère en cours a pu être lue « vendue » jusqu'au 09/10 (veilleur v83). | partiel | `supabase/migrations/20261005150000_veille_commandes_interrupteur.sql:4-14` ; `chrome-extension/background.js:9796,9840-9866,10102-10114,19307-19340` ; `supabase/functions/ebay-api-worker/index.ts:2148-2219` ; commit local `515670a` ; `docs/reprise/terminal-marta-0910.md` § A ; `docs/agents/etude-delai-ventes-0510.md` § 1-2 ; `CLAUDE.md` « ORDER_CONFIRMATION (66 abonnés) » | « FillSell repère tes ventes sur Vinted, Leboncoin, eBay, Beebs et Depop. Pour Vinted, Leboncoin, Beebs et Depop, ton ordinateur doit être allumé avec Chrome ouvert. » (version prudente tant que P3 n'est pas levé : Depop retiré de la première phrase) | "FillSell spots your sales on Vinted, Leboncoin, eBay, Beebs and Depop. For Vinted, Leboncoin, Beebs and Depop, your computer must be on with Chrome open." | tout délai chiffré, « instantané », « en temps réel » |
| F43 | **Décision de Nico 09/10 — Depop** (sous D1) : par le code, une vente lue sur Depop est une preuve exacte (`sale_evidence` posée par le veilleur, `chrome-extension/background.js:20010-20013`) que le cron 52 enregistre comme toute preuve exacte, quelle que soit la plateforme (`20261008233100_ventes_prouvees_automatiques.sql:152-158`), puis il retire les copies prouvées — **jamais observé en réel** (P3). Vente **enregistrée toute seule sur preuve**, **sur Vinted et eBay seulement** (Depop : ci-dessus) (Vinted depuis le 08/10 23:40 : dressing « sold », et depuis le 09/10 la page de l'annonce lue « vendue » ; eBay depuis le 01/10 : relecture eBay ou commande). **Leboncoin et Beebs (corrigé par contre-vérification)** : la lecture « vendue » (Leboncoin) ou « plus en ligne » (Beebs) reste un **signal** ; la vente attend l'appui de la personne (« Vendue sur Leboncoin ? »). Sans preuve, partout : question, jamais une vente. | **faux dans sa généralité → corrigé** | `supabase/migrations/20261008233100_ventes_prouvees_automatiques.sql:20-49` ; `20261009130000_vinted_preuve_page.sql:1-30` ; `chrome-extension/background.js:20003-20009` (« Les autres plateformes ne changent pas : leur drapeau attend le clic ») ; `git show a2ed41b:supabase/migrations/20261009160000_mail_apres_la_vente.sql` l. 66-68 ; `CLAUDE.md` « VENTES PROUVÉES » | « Quand Vinted, eBay ou Depop marque ton article vendu, FillSell enregistre la vente tout seul. Sur Leboncoin et Beebs, il te demande de confirmer d'un appui. » (version prudente tant que P3 n'est pas levé : « Quand Vinted ou eBay… ») | "When Vinted, eBay or Depop marks your item as sold, FillSell records the sale on its own. On Leboncoin and Beebs, it asks you to confirm with one tap." | « toute annonce disparue est une vente », « FillSell enregistre tes ventes tout seul sur toutes les plateformes » |
| F44 | Retrait des autres annonces du même article, **une fois la vente enregistrée** (toute seule pour Vinted et eBay, **après ta confirmation pour Leboncoin et Beebs** — corrigé par contre-vérification) : **automatique** pour les copies liées par une preuve (dépôt FillSell, identifiant, import, geste de la personne, photo identique) ; copie non prouvée → question « Déjà vendu ? » (« Oui, la retirer » / « Non », jamais reposée). Retrait définitif. Vinted, Leboncoin, Beebs, **Depop** : par l'extension (ordinateur allumé) ; eBay créé par l'API : par l'API. **Depop (décision de Nico 09/10, jeton `{RETRAIT}`, sous D1)** : retrait d'une annonce Depop prouvé en réel le 09/10 (`DELETE` 204 puis 404, compte de Nico), déclencheurs de retrait ouverts à Depop (mig `20261009110000`, appliquée d'après `CLAUDE.md`) ; une vente faite **sur** Depop qui retire les copies ailleurs : P3. | oui (nuancé) | `20261008233100_ventes_prouvees_automatiques.sql:33-41` (point 4) ; `CLAUDE.md` « RÈGLES DÉFINITIVES DU 27/09 » ; `ConversionModal.jsx:186` (« Retrait automatique partout après une vente », promet trop : C24) | « Vendu ici, retiré là-bas : dès qu'une vente est enregistrée, FillSell retire les autres annonces de l'article, sur Vinted, Leboncoin, eBay, Beebs et Depop. Au moindre doute sur une annonce, il te demande « Déjà vendu ? » avant d'y toucher. » (`{RETRAIT}` — décision de Nico 09/10) | "Sold here, removed there: as soon as a sale is recorded, FillSell removes the item's other listings on Vinted, Leboncoin, eBay, Beebs and Depop. If it has any doubt about a listing, it asks 'Already sold?' before touching it." | « le retrait attend toujours ta confirmation » (faux pour Vinted et eBay depuis le 08/10 ; vrai pour Leboncoin et Beebs, voir C01) ; « retrait automatique partout » ; « retrait instantané » ; « plus jamais de double vente » (promesse absolue) |
| F45 | Un e-mail quand FillSell **enregistre** une vente **récente** (catégorie support, jamais plafonné ; vente ancienne, doublon : rien) ; pas de mail pour une vente déclarée à la main ni pour un rattrapage de masse. Règle « aucun mail avant une vente enregistrée » **appliquée** le 09/10 vers 14:10 (commit `4be8623`, non poussé ; le fichier du worktree dit encore « NON APPLIQUÉE »). **Conséquence (corrigé par contre-vérification)** : les ventes Leboncoin et Beebs, qui ne s'enregistrent pas seules et sont confirmées à la main, **n'ont pas de mail** (« 1 mail en 30 j (Leboncoin…) ne serait pas parti »). **Depop (décision de Nico 09/10)** : vente enregistrée seule par le code (F43), mail correspondant non vérifié (P3) — ne pas écrire « mail » pour Depop avant. | **faux (formulation d'avant) → corrigé** | `supabase/migrations/20261006180000_mails_de_vente.sql` ; `git show a2ed41b:supabase/migrations/20261009160000_mail_apres_la_vente.sql` l. 1-70 ; `CLAUDE.md` « UN MAIL À CHAQUE VENTE » | « Quand FillSell enregistre une vente sur Vinted ou eBay, tu reçois un e-mail. » | "When FillSell records a sale on Vinted or eBay, you get an email." | « un e-mail à chaque vente », « une notification sur ton téléphone » |
| F46 | Notification push sur le téléphone : construite côté serveur, mais **inactive** tant que les binaires 2.9.62 ne sont pas publiés (fiches stores datées du 24/09). | non (pour le public) | `capacitor.config.ts` (PushNotifications) ; `docs/agents/etat-2026-10-01.md:1387-1420` ; `docs/push/CLES-NICO.md` § C ; stores 09/10 | — (ne rien publier) | — | « notification push à chaque vente » |
| F47 | Bandeau « Vendue sur X » dans l'app quand elle est ouverte. | partiel | `docs/agents/etude-delai-ventes-0510.md` § 4 | « L'app t'affiche tes ventes dès que tu l'ouvres. » | "The app shows your sales as soon as you open it." | — |

## 8. Stock, chiffres, outils

| ID | Fait | Vérifié | Preuve | Formulation sûre (FR) | Formulation EN | À ne pas dire |
|---|---|---|---|---|---|---|
| F48 | Stock **sans limite d'articles** sur tous les paliers (depuis le 04/09). | oui | `ConversionModal.jsx:901-903` ; `Legal.jsx:449-451` (CGU 3.3) | « Ton stock n'a pas de limite d'articles, même en gratuit. » | "Your stock has no item limit, even on the free plan." | — |
| F49 | Marges et bénéfices : prix d'achat, prix de vente, frais, marge, bénéfice net, tableau du mois. Un prix d'achat inconnu est **exclu** des calculs (jamais compté comme 0). Tous paliers. | oui | `src/utils/comptabilite.js` ; `CLAUDE.md` « Prix d'achat : VIDE ≠ ZÉRO » ; `src/i18n/translations.js:9-25` | « Ton stock, tes ventes et ta marge se calculent tout seuls ; un article dont tu ne connais pas le prix d'achat est écarté du calcul plutôt que compté comme gratuit. » | "Your stock, sales and margin are calculated for you; an item with an unknown purchase price is left out of the calculation rather than counted as free." | « ROI » (aucun champ ROI), « comptabilité certifiée », « déclaration fiscale » |
| F50 | Export Excel (.xlsx : une feuille par mois, récapitulatif, inventaire) et import Excel ou CSV (.xlsx, .xls, .csv). Ouvert à tous les comptes depuis le 09/08. | oui | `src/App.jsx:114,6232-6366` ; `src/tabs/StockTab.jsx:9381` ; `src/i18n/translations.js:29-32` | « Exporte ton stock et tes ventes en Excel, ou importe ton fichier Excel ou CSV. » | "Export your stock and sales to Excel, or import your Excel or CSV file." | « réservé à Premium » (la landing ne le met que sur la carte Premium, voir C11) |
| F51 | Scan de code-barres : **aucun scanner**. Lens peut lire un ISBN/EAN imprimé sur la photo (attribut `isbn_ean`). | non (scanner) / partiel (lecture ISBN) | `lens-analysis/index.ts:977` ; recherche `barcode` et `mlkit` sans résultat dans `src/` et `package.json` | « Pour un livre, Lens peut lire l'ISBN s'il est visible sur la photo. » | "For a book, Lens can read the ISBN if it is visible in the photo." | « scan de code-barres », « scanner EAN » |
| F52 | Emplacements de rangement (champ `emplacement`, utilisable à la voix). | partiel | `src/tabs/StockTab.jsx:9052` ; `src/App.jsx:1869` | « Tu peux noter où chaque article est rangé. » | "You can note where each item is stored." | — |
| F53 | Suppression d'un article : un récapitulatif dit ce qui va être retiré en ligne avant de confirmer. | partiel | fiche App Store, notes 2.7 (09/10) | « Avant de supprimer un article, l'app te dit quelles annonces seront retirées. » | "Before you delete an item, the app tells you which listings will be removed." | — |

## 9. Statut des plateformes et des offres non ouvertes

| ID | Fait | Vérifié | Preuve | Formulation sûre (FR) | Formulation EN | À ne pas dire |
|---|---|---|---|---|---|---|
| F54 | **Depop — décision de Nico 09/10** : Depop entre dans FillSell (ouverture le **10/10**) ; on dit : publication, synchronisation, retrait des copies à la vente et republication automatique. **Code et prod au 09/10** : bêta fermée pour le **seul compte de Nico** (`depop_ouvert` = 0, `depop_autorise`) ; parcours réel **vert** sur ce compte (relevé, publication, republication à la demande, retrait, publication croisée ; FIN relue chez Depop) ; vente Depop **jamais observée** (P3) ; republication **automatique** Depop **non codée** (D2, F39). **Condition D1 avant toute mention publique** : `depop_ouvert` = 1 ; une extension avec Depop servie par le Chrome Web Store (0.6.104 servie : sans Depop ; 0.6.105 / 0.6.106 prêtes) ; une OTA ≥ 2.9.68 pour l'app iPhone/Android (2.9.67 servie sans le code Depop de l'app ; le web l'a) ; côté personne, un clic « Autoriser Depop » dans l'extension ; Depop n'est jamais cochée d'office. Seul un compte Depop **français, en euros** a été éprouvé. | partiel (D1, D2, P3) | `src/utils/stockFiltres.js:87-95` ; `supabase/migrations/20261009020000_depop_plateforme_base.sql` ; `20261009100000…`, `20261009110000…` ; `docs/reprise/terminal-depop-0910.md` ; `docs/plateformes/depop/CARTOGRAPHIE.md:6,93-95` ; `03c-decisions-nico-0910.md` § 2 | « Depop rejoint FillSell : publie, synchronise, republie et retire tes annonces Depop avec tout le reste de ton stock. Pour Depop, tu autorises l'accès d'un clic dans l'extension. » (l'automatique sur Depop ne se dit que par `{REPUB_AUTO}`, sous D2) | "Depop joins FillSell: publish, sync, repost and remove your Depop listings along with the rest of your stock. For Depop, you allow access with one click in the extension." | « Depop » avant que D1 soit rempli ; « Depop UK / US », « Depop dans tous les pays » ; « partenaire de Depop » ; « remplace Opla » (Opla n'est jamais nommée) |
| F55 | **Opla** (information interne) : sortie le **10/10/2026 à 00:00** (Paris) : plus de publication ni de republication ; seul le suivi des annonces déjà en ligne reste pour les comptes reliés. Encore citée par les fiches App Store / Play, par `/legal` et par la permission `opla.co` de l'extension 0.6.104 (C05, C22, C28). **Décision de Nico 09/10 : Opla n'apparaît NULLE PART** (texte, image, vidéo, logo). | oui | `Legal.jsx:261-263` ; `src/utils/stockFiltres.js:74-86` ; `CLAUDE.md` « Sortie d'Opla » | — (ne jamais nommer Opla) | — | « Opla » sous toute forme (texte, capture, vidéo, logo), « publie sur Opla », « remplace Opla », « cinq plateformes » qui la compterait (« cinq plateformes » n'est permis que pour `{PUB}`, sous D1) |
| F56 | **FillSell Cloud** (sans ordinateur) : **non lancé** (`CLOUD_OFFER_ENABLED = false`) ; seul un encart informatif « Bientôt » apparaît sous les cartes des offres dans l'app. | oui | `src/config/cloudOffer.js:30` ; `src/cloud/EncartCloudBientot.jsx:1-36` | Ne rien annoncer. | — | « sans ordinateur », « dans le cloud », prix ou date du Cloud |
| F57 | Vinted hors de France : prêt (0.6.106), non publié (F32). | oui | voir F32 | — | — | « Vinted Europe » |

## 10. Paliers et tarifs

> **Décision de Nico 09/10** : on ne publie que les **prix** — Gratuit 0 €, Premium 12,99 €, Pro
> 29,99 €, Business 59,99 € par mois (F58). Les volumes de § 10.1 à § 10.4 (annonces,
> republications, retouches, commandes vocales, plafonds) sont de l'**information interne**, jamais
> publiée : ni site, ni capture, ni vidéo (C27). Sans chiffre ne veut pas dire « illimité » (P4).

### 10.1 Ce que la landing affiche (texte exact, `src/pages/LandingPage.jsx:1329-1516`)

Les nombres sont des jetons remplis au rendu depuis `coin_config` (lecture anonyme) ; si la lecture
échoue, des valeurs de repli s'affichent (`GRANTS_FALLBACK`, `:100-104`, relevé du 07/09). Les valeurs
ci-dessous sont celles du repli, identiques à `/legal` « au 5 octobre 2026 ». Tous les boutons mènent à
la création de compte (`/login?mode=signup`), jamais à un paiement.

- En-tête : « Tarifs » / « Un plan pour chaque volume. » / « Commence gratuitement. Passe Premium, Pro ou Business quand tu veux vendre plus, sans engagement. » (version anglaise : « Start free. Move to Premium or Pro whenever you want to sell more — no commitment. » — Business absent).

| Carte | Texte affiché (dans l'ordre) |
|---|---|
| **Gratuit** | « Pour se lancer » · « 0 € / mois » · pastille « {ADS_FREE} annonces publiées / mois » (5) · « {REPUB_FREE} republications par mois » (50) · « Synchronisation gratuite et illimitée » · « Publication auto sur Vinted, Leboncoin, eBay & Beebs » · « Calcul de marge instantané » · « Suivi de tes ventes » · bouton « Commencer gratuitement » |
| **Premium** | bandeau « Le plus populaire » · « Pour vendre régulièrement » · « 12,99 € / mois » · « {ADS_PREMIUM} annonces publiées / mois » (40) · « {REPUB_PREMIUM} republications par mois » (1 500) · « Retouche IA — {RETOUCHE_PREMIUM} annonces retouchées par mois (jusqu'à 5 photos chacune) » (5) · « Publication auto sur Vinted, Leboncoin, eBay & Beebs » · « Import & export Excel de ton stock » · « Support par email » · bouton « Passer Premium » |
| **Pro** | « Pour les gros volumes » · « 29,99 € / mois » · « {ADS_PRO} annonces publiées / mois » (120) · « {REPUB_PRO} republications par mois » (5 000) · « Republication automatique — tes annonces remontent toutes seules » · « Retouche IA — {RETOUCHE_PRO} … » (20) · « Publication auto sur Vinted, Leboncoin, eBay & Beebs » · « Support prioritaire » · bouton « Passer Pro » |
| **Business** | « Le sommet. Zéro limite. » · « 59,99 € / mois » · « {ADS_BUSINESS} annonces publiées / mois » (300) · « Republications illimitées — autant que tu veux » · « Republication automatique — tes annonces remontent toutes seules » · « Retouche IA — {RETOUCHE_BUSINESS} … » (50) · « Publication auto sur Vinted, Leboncoin, eBay & Beebs » · « Support prioritaire » · bouton « Passer Business » (carte visible : `src/config/businessOffer.js:70` = `true`) |

- **Aucun prix annuel**, **aucun essai gratuit** sur la landing. Mentions « Gratuit pour commencer — sans carte bancaire » (`:596`, `:1546`).
- FAQ (`:323-340`, aussi injectée en JSON-LD FAQPage) : volumes mensuels « {ADS_*} … {REPUB_*} … illimitées en Business », « La publication elle-même est incluse et illimitée » ; « la republication automatique est volontairement plafonnée à 45 par jour » (voir C02) ; « Premium et Pro sont sans engagement » (Business omis).

### 10.2 Ce que l'app affiche (feuille des offres, `src/components/ConversionModal.jsx`)

- Bloc « Dans tous les forfaits » (`:181-191`) : « Import de tes annonces depuis toutes tes plateformes » · « Publication sur Vinted, Leboncoin, eBay & Beebs » · « Commandes vocales » · « Retrait automatique partout après une vente ».
- Cinq lignes par carte (`:238-282`), coches puis croix : « {N} annonces créées et publiées sur toutes tes plateformes par mois » · « {N} republications par mois » (Business : « Republications illimitées — tu republies quand tu veux, autant que tu veux ») · « Republication automatique — tes annonces remontent toutes seules, sans que tu y touches » (Pro, Business ; croix sinon) · « Retouche IA — {N} annonces retouchées par mois (jusqu'à 5 photos chacune) » (croix en Gratuit) · « Support par email » (Premium) / « Support prioritaire » (Pro, Business) / « Support » barré (Gratuit).
- Prix **écrits en dur** : 12,99 € / 29,99 € / 59,99 € « /mois » (`:134-138`). « Plus AUCUN essai gratuit (2026-07-22) » (`:124`). Encart « Bientôt : FillSell Cloud » sous les cartes.
- La cadence technique (45/jour) « n'est PLUS affichée nulle part » dans l'app (`:233-235`).

### 10.3 Ce que le serveur applique (migrations ; base non relue) — information interne, jamais publiée (décision de Nico 09/10)

| Clé | Gratuit | Premium | Pro | Business | Source |
|---|---|---|---|---|---|
| Annonces créées par IA / cycle | 5 | 40 | 120 | 300 | `20260902203000_bascule_quotas_valeurs.sql:30-31` |
| Republications / cycle | 50 (mensuel depuis le 05/10) | 1 500 | 5 000 | 0 = illimité | `20261005173000…:47` ; `20260902203000…:34-35` |
| Retouches IA / cycle | 0 | 5 | 20 | 50 | `20260902203000…:37-38` |
| Republication automatique (code au 09/10 ; **décision de Nico 09/10 : tous les paliers, aucun palier écrit** — à confirmer avant la mise en ligne, P1/C25) | non | non | oui | oui | `RepublicationPlanifiee.jsx:29-33` ; `20261005173000…:401-409` |
| Plafond quotidien de republication (sécurité) | 45 (repli) | 50 | 170 | 100 000 | `20260904120000…:43-45` ; `20260912130000…:56` ; `get-pending-jobs/index.ts:566-600` |
| Stock | illimité | illimité | illimité | illimité | `ConversionModal.jsx:901-903` |
| Commandes vocales / mois calendaire (garde-fou invisible, *ajouté par contre-vérification*) | 10 (+ 50 / jour) | 30 | 80 | 200 | `20260902203000…:39-40` ; `voice-intent/index.ts:1085-1116` (valeurs non relues en base) |
| Cycle | date anniversaire de l'inscription | date anniversaire de l'abonnement | idem | idem | `Legal.jsx:487` (CGV 3.4) |

`/legal` (CGV 3.4, `Legal.jsx:482-486`) donne exactement ces volumes « au 5 octobre 2026 ». Prix : Stripe
(web) et achats intégrés (stores) ; « les prix web et les prix des boutiques peuvent différer ».

### 10.4 Ce que les stores affichent (09/10)

- App Store, achats intégrés : « FillSell Premium 12,99 € », « FillSell Pro 29,99 € » (deux fois), « Business 59,99 € », **« Fill & Sell Premium 9,99 € »** (ancien tarif Founder) et **quatre packs « Pépites »** : 100 à 4,99 €, 220 à 9,99 €, 460 à 19,99 €, 1150 à 49,99 € (packs retirés de l'app le 02-03/09 ; liste complétée par contre-vérification, relue le 09/10). Source : https://apps.apple.com/fr/app/fillsell/id6762152785.
- Fiches App Store et Play : « Tu commences gratuitement : un nombre d'annonces par mois, et des republications **offertes à vie** » (faux depuis le 05/10) ; Opla citée comme cinquième plateforme.
- Google Play : prix Business en Irlande et en Italie relevés à 74,99 € le 10/08 (`src/config/businessOffer.js:24-60`), **non revérifié** ; l'app affiche 59,99 € partout.

| ID | Fait | Vérifié | Preuve | Formulation sûre (FR) | Formulation EN | À ne pas dire |
|---|---|---|---|---|---|---|
| F58 | Quatre paliers mensuels : Gratuit 0 €, Premium 12,99 €, Pro 29,99 €, Business 59,99 € par mois, sans engagement. Aucun prix annuel. Aucun essai gratuit (depuis le 22/07). Inscription gratuite sans carte bancaire. **Décision de Nico 09/10** : on publie les prix seulement ; les volumes par palier (§ 10.3) sont une information interne. | oui | § 10.1-10.4 | « Gratuit (0 €) pour commencer, sans carte bancaire. Premium 12,99 €, Pro 29,99 €, Business 59,99 € par mois, sans engagement. » | "Free (€0) to start, no credit card. Premium €12.99, Pro €29.99, Business €59.99 a month, no commitment." | tout volume par palier (annonces, republications, retouches, commandes vocales, plafonds — décision de Nico 09/10), « illimité » ou « autant que tu veux » pour un palier, « essai gratuit de 7 jours », « prix annuel », « -X % à l'année », « Zéro limite » (Business a des volumes) |
| F59 | Résiliation : web (Stripe) depuis l'app ; achat dans l'App Store ou Google Play : l'app ouvre la page d'abonnements du store. Effet en fin de période, sans remboursement au prorata. | oui | `src/reglages/SousPageAbonnement.jsx:44-47` ; `Legal.jsx:490,497-500` | « Tu arrêtes quand tu veux ; l'abonnement court jusqu'à la fin de la période payée. » | "Cancel anytime; your subscription runs until the end of the paid period." | « résiliation en un clic » pour un achat fait dans un store (c'est le store qui gère) |
| F60 | Support : e-mail support@fillsell.app ; « Support prioritaire » sur Pro et Business = engagement de traitement, aucun canal distinct n'existe. | partiel | `ConversionModal.jsx:457` (« aucun canal dédié n'existe ») ; `LandingPage.jsx:42` | « Une question ? support@fillsell.app. » | "Questions? support@fillsell.app." | « support dédié », « interlocuteur attitré », « chat en direct », « 24/7 » |

## 11. Données, RGPD, suppression

| ID | Fait | Vérifié | Preuve | Formulation sûre (FR) | Formulation EN | À ne pas dire |
|---|---|---|---|---|---|---|
| F61 | Hébergement : site servi par Vercel derrière Cloudflare (en-têtes `server: cloudflare`, `x-vercel-cache` lus le 09/10) ; données stockées chez Supabase « infrastructure AWS eu-west-1 — Europe » (déclaratif de `/legal`, région non vérifiable sans accès). | partiel | `Legal.jsx:416-428` ; `curl -sI https://fillsell.app/` (09/10) | « Tes données FillSell sont stockées en Europe (Supabase, Irlande). » | "Your FillSell data is stored in Europe (Supabase, Ireland)." | « toutes tes données restent en France / en Europe » (les photos et la voix partent chez des services d'IA, F62), « hébergé en France » |
| F62 | Traitements par des services d'IA : photos et textes envoyés à Anthropic (Lens, rédaction, voix comprise), audio à OpenAI (Whisper), photos à OpenAI (retouche). **Non listés** dans les sous-traitants de `/legal` (4.7 : Supabase, Vercel, Stripe, Google/Apple). La fiche Google Play déclare un partage « Photos et vidéos et Audio » avec des tiers. Mails envoyés par Resend (non listé). Sur le site web, **Google Ads et Meta** reçoivent aussi des données de navigation (F63) — *ajouté par contre-vérification*. | oui (faits) / non (dans /legal) | `lens-analysis/index.ts:1751,1821` ; `voice-transcribe/index.ts:226-230` ; `generate-listing/index.ts:943` ; `Legal.jsx:648-658` ; Google Play 09/10 | (après mise à jour de `/legal`) « Pour analyser tes photos et ta voix, FillSell utilise des services d'intelligence artificielle. » | "To analyse your photos and voice, FillSell uses AI services." | « aucune donnée partagée avec des tiers » (ne dire que « aucune donnée vendue », formulation de `/legal`) |
| F63 | RGPD : responsable de traitement FillSell (auto-entrepreneur), droits listés, réclamation CNIL ; mesure d'audience par Google Tag Manager. **« Aucun SDK publicitaire » est FAUX sur le web (corrigé par contre-vérification)** : la balise **Google Ads `AW-16622098460`** se charge sur chaque page **sans consentement** (présente dans le HTML servi le 09/10) et le **pixel Meta** `1425992186075849` se charge **après consentement** (bandeau). `/legal` se contredit (C21). Dans les apps natives et l'extension, aucun SDK publicitaire trouvé. | **faux → corrigé** | `index.html:4-9,159-165,205-211` ; `src/utils/metaPixel.js:1-30` ; `src/utils/consentement.js` ; `src/components/BandeauConsentement.jsx` ; `Legal.jsx:97,101,401-413,557-607,686-709` ; `curl https://fillsell.app/` (09/10) | « Tu peux exercer tes droits (accès, rectification, effacement) à support@fillsell.app. » | "You can exercise your rights (access, correction, erasure) at support@fillsell.app." | « conforme RGPD certifié », « aucun traceur », « aucun traceur publicitaire », « aucune donnée utilisée à des fins publicitaires » |
| F64 | Suppression du compte dans l'app : **Réglages → Compte → « Supprimer mon compte »**, double confirmation ; efface compte, stock, ventes et photos ; **les annonces en ligne ne sont pas retirées** ; l'abonnement **web (Stripe)** est annulé — **un abonnement pris dans l'App Store ou Google Play continue tant qu'il n'est pas résilié dans le store** (corrigé par contre-vérification, `supabase/functions/delete-account/index.ts:82-100`). `/legal` dit « Profil → Paramètres » et « immédiate et définitive », mais aussi « supprimées dans un délai de 90 jours ». | oui (app, nuancé) / partiel (/legal) | `src/reglages/textes.js:193-201` ; `src/reglages/SousPageCompte.jsx:65-68` ; `src/compte/supprimerCompte.js:21` ; `delete-account/index.ts:82-100` ; `Legal.jsx:611-644` | « Tu peux supprimer ton compte depuis l'app (Réglages, Compte). Tes annonces déjà en ligne sur les plateformes restent en ligne, et un abonnement pris sur l'App Store ou Google Play se résilie dans le store. » | "You can delete your account in the app (Settings, Account). Listings already live on the marketplaces stay online, and a subscription bought on the App Store or Google Play is cancelled in the store." | « tout est effacé partout, annonces comprises », « supprimer ton compte arrête ton abonnement » |

## 12. Ton (tutoiement / vouvoiement)

| Surface | Registre constaté | Preuve |
|---|---|---|
| Landing `/` | **tu** (« Tes annonces », « Tu synchronises ») | `LandingPage.jsx:558-562` |
| Balises `<title>` / og:title | **tu** (« Publie et republie… ») | `index.html:28-38` |
| Meta description (index) | **vous** (« Publiez une annonce… ») | `index.html:41` |
| App (FR) | **tu** | `src/i18n/translations.js`, `src/reglages/textes.js:194-201` |
| Page `/extension` | **tu** dans la page, **vous** dans la meta description (« Installez l'extension… ») | `ExtensionPage.jsx:58-65,86-97` |
| Blog | **vous** (ex. 30 « vous » dans `cross-listing-vinted-leboncoin.md`, 32 dans `publier-annonce-plusieurs-plateformes.md`) | `src/blog/*.md` |
| `/legal` | **vous** (normal pour un texte juridique) | `Legal.jsx` |
| Fiche Chrome Web Store | **vous** (« Publie automatiquement vos annonces ») | CWS 09/10 ; `manifest.json:5` |
| Fiches App Store / Play | **tu** | stores 09/10 |
| Règle de l'app | jamais « on synchronise pour toi » ; « connecte-toi à X sur ton ordinateur » ; un seul verbe « synchroniser » | `src/annonces/textes.js:7-23` |

## 13. Contradictions relevées (à trancher avant toute réécriture)

Classées par gravité (juridique et confiance d'abord).

1. **C01 — « Le retrait attend ta confirmation » est faux depuis le 08/10 23:40.** Landing
   `:1142` (« Tu confirmes, il retire »), `:1183` (« Le retrait attend ta confirmation — jamais dans ton
   dos »), FAQ `:335` ; `/legal` 8.4 `Legal.jsx:809-813` (« jamais déclenché sans votre confirmation
   explicite ») ; blog `cross-listing-vinted-leboncoin.md:36,67,86`. Prod : vente prouvée enregistrée
   seule et copies prouvées retirées (`20261008233100`, eBay depuis le 01/10) ; l'app dit déjà « Retrait
   automatique partout après une vente » (`ConversionModal.jsx:186`) et les stores « l'extension retire
   les copies ». **Le texte contractuel (CGV 8.4) est le plus urgent.**
   *Nuance de contre-vérification* : « Tu confirmes, il retire » n'est faux que pour les ventes
   **Vinted et eBay** prouvées ; pour **Leboncoin et Beebs**, la vente attend toujours l'appui de la
   personne (`background.js:20003-20009`). Le nouveau texte doit distinguer les deux cas.
2. **C02 — « 45 republications par jour, quel que soit le plan »** (landing FAQ `:333`, CGV
   `Legal.jsx:488`) contre des plafonds par palier côté serveur (Premium 50, Pro 170, Business
   100 000 d'après les migrations ; l'app a retiré ce chiffre). Ne publier aucun chiffre tant que la
   base n'est pas relue.
   *Décision de Nico 09/10* : aucun chiffre de plafond ne se publie, même relu en base ; le « 45 » de
   la FAQ de la landing (et de son JSON-LD) disparaît du futur site ; CGV : P4 (C27).
3. **C03 — « Elle remonte en tête des résultats toutes les 24 h »** (`LandingPage.jsx:720,1107`)
   contre une ancienneté minimale de 7 jours (`RepublicationPlanifiee.jsx:118`, `StockTab.jsx:4543`).
4. **C04 — `/extension` : « Tes annonces Vinted remontent toutes seules dans l'app — … en quelques
   secondes »** (`ExtensionPage.jsx:176`) contre la règle du 05/10 : l'import ne part que sur
   « Synchroniser ».
5. **C05 — Fiches App Store et Google Play périmées** : Opla en cinquième plateforme (sortie le 10/10),
   « republications offertes à vie » (50 par mois depuis le 05/10), langue « Anglais » seule (App
   Store), achats intégrés « Pack 100 Pépites » et « Fill & Sell Premium 9,99 € » toujours listés.
   *Décision de Nico 09/10* : Opla ne doit apparaître nulle part (C28) ; Depop entre dans les fiches
   après D1 ; « offertes à vie » et tout volume en sortent (décision 3). Hors site : à signaler à Nico.
6. **C06 — `/legal` 4.7 (sous-traitants) incomplet** : Anthropic, OpenAI (photos, voix), Resend,
   Cloudflare, Capgo (mises à jour de l'app) absents ; la fiche Play déclare pourtant un partage de
   photos et d'audio. CGU 3.1 décrit FillSell comme un simple outil de suivi d'achat-revente.
7. **C07 — `/legal` incohérent sur la suppression** : 4.5 « supprimées dans un délai de 90 jours » contre
   4.6 « immédiate et définitive » ; chemin « Profil → Paramètres » contre « Réglages → Compte » dans
   l'app ; ne dit pas que les annonces en ligne restent en ligne (l'app le dit).
8. **C08 — `/legal` 8.3** : permission `alarms` « vérification périodique (~30 min) » (`Legal.jsx:220-222`)
   contre un cycle de 2 min (`chrome-extension/config.js:14`) ; le tableau des permissions décrit déjà les
   17 domaines Vinted et Depop de 0.6.105/0.6.106, versions **non publiées** (0.6.104 servie).
   *Décision de Nico 09/10* : la ligne Depop du tableau devient exacte quand une extension avec Depop
   est servie (D1).
9. **C09 — Libellé des cartes de prix de la landing** : « N annonces publiées / mois » alors que la FAQ et
   les CGV disent que la publication est incluse et non décomptée (le quota porte sur les annonces
   créées par l'IA). L'app dit « annonces créées et publiées ». Proposer : « N annonces rédigées par
   l'IA / mois ».
   *Décision de Nico 09/10* : sans objet pour le futur site — les cartes n'affichent que les prix (C27).
10. **C10 — Retouche photo présentée sans palier** : section Lens de la landing (`:1198`, « Et la photo
    elle-même est retouchée ») alors que le Gratuit a 0 retouche.
11. **C11 — Excel** : la landing ne le met que sur la carte Premium (`:1417`) alors qu'il est ouvert à
    tous depuis le 09/08 (`translations.js:29-32`).
12. **C12 — Republication automatique « sur Vinted » seulement** (landing `:1083`) contre un module
    multiplateforme (Vinted, Leboncoin, Beebs) ouvert plateforme par plateforme en base : à relire en
    base avant d'écrire quoi que ce soit.
    *Décision de Nico 09/10* : l'automatique se présente sur `{REPUB_AUTO}` (Vinted, Leboncoin, Beebs,
    Depop ; version B sans Depop tant que D2 n'est pas vérifié), sans palier (C25, C26).
13. **C13 — Business** : intro des tarifs en anglais sans Business ; FAQ « Premium et Pro sont sans
    engagement » sans Business ; accroche « Le sommet. Zéro limite. » alors que Business a 300 annonces
    et 50 retouches par cycle.
    *Décision de Nico 09/10* : aucun volume publié ; « Zéro limite » reste banni (P4).
14. **C14 — Animation de vente** : « Retiré des 4 autres » (`:1155`) avec trois plateformes montrées
    (quatre plateformes au total) ; prix « 21 € » en français, « €18 » en anglais (`:223`).
    *Décision de Nico 09/10* : avec `{PUB}` (cinq plateformes sous D1), « Retiré des 4 autres » devient
    juste si l'animation montre les cinq.
15. **C15 — Fiche Chrome Web Store** : « Suivi en temps réel », « sans fenêtre visible ni
    interruption » (une fenêtre réduite existe, cycle de 2 min) ; registre « vous ».
16. **C16 — Ton** : meta description de l'accueil et de `/extension` au « vous », pages au « tu » ;
    blog au « vous ».
17. **C17 — Blog « calculer ses profits »** : « ROI » et « en temps réel » (aucun champ ROI dans l'app).
18. **C18 — Identité d'éditeur dispersée** (signal d'entité pour les moteurs) : App Store « Nicolas
    Svobodny », Google Play « NelsonCatStudio », Chrome Web Store au nom de la personne physique,
    JSON-LD `Organization` « FillSell » (`index.html:84-103`).
19. **C19 — Prix Business Google Play** en Irlande et en Italie (74,99 € relevé le 10/08, non revérifié)
    contre 59,99 € affiché partout.
20. **C20 — `/legal` 3.3 « republications Vinted »** et 3.4 EN « the 5 supported platforms » : périmés.
    *Décision de Nico 09/10* : « 5 plateformes » redevient juste avec `{PUB}` sous D1, mais `/legal`
    nomme encore Opla et pas Depop dans la non-affiliation (`Legal.jsx:152,179` ; C28).

*Ajoutées par contre-vérification (09/10, détail : `03b-contre-verification.md` § 4) :*

21. **C21 — Traceurs publicitaires (juridique)** : `index.html:159-165` charge la balise Google Ads
    `AW-16622098460` sur chaque page **sans consentement** (servie le 09/10) ; pixel Meta après
    consentement (`src/utils/metaPixel.js`). `/legal` affirme « FillSell ne contient aucun SDK
    publicitaire… Aucune donnée n'est utilisée à des fins publicitaires » (`Legal.jsx:97,101`) puis
    décrit le pixel Meta comme « traceur publicitaire » (`:708-709`). Le pixel TikTok avait été retiré
    le 07/09 pour la même raison (`index.html:205-211`).
22. **C22 — Permission « cookies » de l'extension** : `/legal` (`Legal.jsx:226-228`) « uniquement
    `v_uid`… Aucun cookie n'est lu en dehors de ce test, ni transmis » contre la 0.6.104 servie, qui
    mesure les cookies d'opla.co (noms et tailles envoyés au serveur) et peut les supprimer.
    *Décision de Nico 09/10* : à l'ouverture de Depop (D1), l'extension servie lira le jeton de session
    Depop (`chrome-extension/background.js:11162`) : `/legal` doit le dire avant.
23. **C23 — « Un seul ajout, publié partout en même temps »** (FAQ de la landing `:327`, aussi en
    JSON-LD FAQPage) contre une publication une annonce à la fois, 8 à 20 s d'écart, Leboncoin une
    par compte (`chrome-extension/config.js:22-23`).
24. **C24 — « Retrait automatique partout après une vente »** (app, `ConversionModal.jsx:186` ;
    stores « l'extension retire les copies ») : seulement après une vente **enregistrée** (seule sur
    Vinted et eBay, confirmée par la personne sur Leboncoin et Beebs) et pour les copies **prouvées** ;
    les autres deviennent « Déjà vendu ? ».

*Ajoutées par les décisions de Nico (09/10 soir, détail : `03c-decisions-nico-0910.md` § 2) — points
à confirmer, écrits sans contredire Nico :*

25. **C25 — Republication automatique et paliers (P1)** : décision de Nico = tous les paliers, aucun
    palier écrit ; code au 09/10 = Pro et Business seulement (refus `auto_reserve_pro`,
    `20261005173000…:401-409` ; balayage `20261008140000…:130-133` ; écran « Réservée au plan Pro »,
    `RepublicationPlanifiee.jsx:358,727`) ; landing et app : « Republication automatique » sur les
    cartes Pro et Business seulement (§ 10.1, § 10.2). À confirmer avant la mise en ligne ; d'ici là,
    aucun texte ne dit « pour tous » ni « dès le gratuit » pour l'automatique.
26. **C26 — Republication automatique Depop (D2)** : décision de Nico = oui ; code au 09/10 = **non
    codée** (`republish_planifiee_plateformes()` = vinted, leboncoin, beebs, opla ;
    `PLATEFORMES_PLANIFIEES` idem ; aucune ligne Depop à l'écran ; `20261009020000…:37-38` « la
    republication Depop est manuelle »). Version B de `{REPUB_AUTO}` tant que Nico ne l'a pas vérifiée.
27. **C27 — Volumes affichés partout** (décision : aucun chiffre de quota ni de plafond) : cartes de
    prix et FAQ de la landing (+ JSON-LD FAQPage, `LandingPage.jsx:323-340,1329-1516`), feuille des
    offres de l'app (`ConversionModal.jsx:238-282`), CGV 3.4 (`Legal.jsx:482-488`), fiches stores
    (« offertes à vie »). Site : retirés ; captures : jamais la feuille des offres ; CGV : P4.
28. **C28 — Opla encore présente** (décision : nulle part) : `/legal` (`Legal.jsx:152,159,179,186,
    261-263,756-763,812-813`), fiches stores (C05), extension 0.6.104 (permission `opla.co`) ;
    commentaires de la landing seulement (`LandingPage.jsx:677,709`, non rendus). L'app la retire
    d'elle-même à la bascule du 10/10 00:00 (`opla_sortie_le`). `/legal` : P2.
29. **C29 — Depop absente de ce qui est servi** : extension servie 0.6.104 sans Depop (0.6.105 /
    0.6.106 prêtes, non publiées, un seul ordre possible au Web Store) ; OTA 2.9.67 servie sans le code
    Depop de l'app (`8f88cdd` absent de `9d203ac`) ; `depop_ouvert` = 0. Condition D1.
30. **C30 — Captures et données de démonstration** : le jeu `scripts/apercu/site-donnees-demo.js`
    exclut Depop (« Ni Opla, ni Depop ») et raconte 22 ventes sur six mois (décision 5 : un très bon
    mois, plusieurs plateformes dont Depop) ; l'écran de republication automatique n'a pas de ligne
    Depop (D2) et affiche « Réservée au plan Pro » hors Pro (P1) : capturer avec un compte de
    démonstration Pro ou Business, et Depop seulement là où l'app la dessine.

## 14. Non vérifié ici (à relire en base ou par Nico avant publication)

- Valeurs vivantes de `coin_config` : `quota_annonces_*`, `quota_republication_*`, `quota_retouche_*`,
  `republish_plafond_jour*`, `republish_planifiee_pf_*` (quelles plateformes en automatique),
  `republication_multi_ouverte`, `lens_unifie`, `veille_commandes_ouverte`, `opla_sortie_le`,
  `depop_ouvert`. La landing les lit en direct : ce qui s'affiche sur le site est juste par
  construction, mais tout texte rédigé à la main (blog, comparatifs) doit les relire.
- Délai réel de détection d'une vente depuis la veille des commandes (0.6.98) et les ventes prouvées
  automatiques (08/10) : aucune mesure publiée.
- Support officiel de Microsoft Edge (constaté en usage, jamais annoncé).
- Région Supabase (déclarée eu-west-1 ; DNS derrière Cloudflare, non vérifiable).
- Publication des binaires 2.9.62 (push) et de l'extension 0.6.105 / 0.6.106.
- Prix Google Play hors France.
- *Ajouté par contre-vérification* : `sync_multi_ouverte` (relevé multiplateforme, valeur 1 seulement
  déduite), `republication_multi_ouverte` (republication Leboncoin/Beebs, ouverte d'après les faits),
  `quota_voix_*` (plafonds mensuels de commandes vocales) et la définition en prod de
  `check_and_log_usage`, `lens_unifie` (scan qui rédige les annonces).
- Les balises présentes dans le conteneur Google Tag Manager `GTM-TJNKL6T5` (configuration hors dépôt).
- *Ajouté par les décisions de Nico (09/10)* — à vérifier par Nico **avant la mise en ligne** :
  **D1** (`depop_ouvert` = 1 ; extension avec Depop servie par le Chrome Web Store ; OTA ≥ 2.9.68 ;
  `/legal` à jour pour Depop) ; **D2** (republication automatique Depop codée et active :
  `republish_planifiee_plateformes()`, clé `republish_planifiee_pf_depop`, ligne Depop dans l'écran
  de l'app) ; **P1** (automatique ouverte à tous les paliers) ; **P3** (une vraie vente Depop vue
  enregistrée seule, et son mail) ; **P4** (les CGV gardent-elles leurs volumes ?) ; **P2** (`/legal`
  et Opla). Détail : `03c-decisions-nico-0910.md` § 2.2.

## 15. Lexique pour le site

- **À employer** : synchroniser, annonce, fiche, stock, publier, republier, retirer, plateforme,
  extension, ordinateur, « connecte-toi à X sur ton ordinateur », « Déjà vendu ? », « Annonces à
  vérifier », forfait, annonces rédigées par l'IA ; *décision de Nico 09/10* : « Depop » (sous D1),
  les noms des plateformes **en texte** et la mention de non-affiliation (§ 16.1), les jetons du § 0 bis.
- **Bannis** : job, polling, relevé (pour le public), token, pépites, unités, « IA magique »,
  « robot », « bot », « 100 % automatique », « zéro risque », « temps réel », « illimité » sans objet
  précis, « publié partout en même temps », « retrait automatique partout », « un e-mail à chaque
  vente » (ajouts de la contre-vérification), « partenaire officiel » de Vinted / Leboncoin / eBay / Beebs / Depop (FillSell n'est affilié à aucune,
  cf. fiches stores).
- **Bannis — décision de Nico 09/10** :
  - **tout chiffre de quota ou de plafond** : annonces par mois, republications par jour ou par mois,
    retouches, photos par retouche, commandes vocales, taille d'un lot (« jusqu'à 20 »), « 45 par
    jour »… — y compris dans une capture ou la vidéo ;
  - **« Opla »**, son logo, et « remplace Opla » ;
  - **toute mention de palier à côté de la republication automatique** : « Pro », « Business »,
    « Premium », « gratuit », « réservée à », « dès … », « sur tous les forfaits », « plan Pro » ;
  - **eBay à côté de la republication** : « republication eBay », « sauf eBay », « (hors eBay) » ;
  - « illimité », « autant que tu veux », « sans limite » pour un palier ou une republication (permis
    seulement pour le stock, F48, et l'import, F33) ;
  - « Depop » tant que D1 n'est pas rempli ; Depop dans la republication automatique tant que D2 ne
    l'est pas ;
  - tout chiffre de vente, de profit ou de délai qui ne vient pas du compte de démonstration
    « Camille » présenté comme tel (§ 16.2).

## 16. Présentation, ton et accroches (décisions de Nico 09/10)

### 16.1 Logos et non-affiliation (décision 4)

- **Pages du site** : les plateformes sont nommées **en texte**, jamais par leur logo ; chaque page
  qui en nomme une porte la mention de non-affiliation (pied de page), reprise de `/legal`
  (`Legal.jsx:152,179`) :
  - FR : « FillSell n'est affilié à aucune des plateformes citées (Vinted, Leboncoin, eBay, Beebs,
    Depop), ni approuvé ni sponsorisé par elles. Leurs noms et marques appartiennent à leurs
    titulaires respectifs et ne sont cités qu'à des fins d'identification. »
  - EN : "FillSell is not affiliated with, endorsed or sponsored by any of the marketplaces
    mentioned (Vinted, Leboncoin, eBay, Beebs, Depop). Their names and trademarks belong to their
    respective owners and are cited for identification purposes only."
  - Depop dans la liste sous D1 ; Opla jamais.
- **Captures et vidéo** : les logos **tels que l'app les dessine** (`src/components/platform-logos/`
  : `VintedLogo`, `LeboncoinIcon`, `EbayLogo`, `BeebsIcon`, `DepopIcon`, via `PlatformLogo`) ; jamais
  un logo redessiné ou pris ailleurs ; jamais `OplaIcon`.

### 16.2 Chiffres des captures et de la vidéo (décision 5)

- Un seul compte : la démonstration **« Camille »** (`scripts/apercu/site-donnees-demo.js`, jeu à
  refaire : C30). Un très bon mois, crédible : profit du mois, nombre de ventes, ventes sur
  plusieurs plateformes dont Depop (sous D1), articles qui partent vite ; aucun montant irréaliste ;
  **aucun vrai chiffre** de Nico ni d'un compte réel.
- Mention visible près de chaque capture chiffrée et dans la vidéo : FR « Compte de démonstration,
  chiffres fictifs. » · EN "Demo account, illustrative figures." Jamais « résultats de nos
  clients », jamais une promesse de gains (« tu gagneras… »).
- Jamais à l'écran : un volume ou un plafond (feuille des offres exclue, C27), « Réservée au plan
  Pro » (P1), Opla, une ligne Depop que l'app ne dessine pas (D2).

### 16.3 Ton offensif — le cadre (décision 6)

- Offensif = phrases courtes, verbes d'action, bénéfices concrets, comparatifs à notre avantage ;
  **chaque phrase repose sur une ligne F-xx** de cette fiche, dans l'état de la mise en ligne.
- Comparatifs : licites s'ils ne sont pas trompeurs, comparent des services qui répondent aux mêmes
  besoins et portent sur des caractéristiques essentielles, pertinentes, vérifiables et
  représentatives (le prix compris), sans confusion ni dénigrement, chaque affirmation prouvable
  (Code de la consommation, art. L122-1 et suivants ; sources lues le 2026-10-09 et réserve : texte
  officiel à relire sur legifrance.gouv.fr — `03c-decisions-nico-0910.md` § 5). Côté FillSell : une
  ligne F-xx ; côté concurrent : un fait daté avec son URL (`docs/seo/concurrents/`).
- Interdits : faux chiffres, gains promis, délais promis, « zéro risque », qualificatifs sur un
  concurrent ; on dit ce que FillSell fait, pas ce que l'autre rate.

### 16.4 Accroches vérifiées, prêtes à l'emploi

| Accroche FR | EN | Repose sur | Condition |
|---|---|---|---|
| « Une annonce, cinq plateformes. » | "One listing, five marketplaces." | F24 | D1 (sinon « quatre » / "four") |
| « Une photo, Lens écrit l'annonce. Tu relis, tu publies. » | "One photo, Lens writes the listing. You check, you publish." | F15 | — |
| « Tes annonces remontent toutes seules sur {REPUB_AUTO}. » | "Your listings bump themselves back up on {REPUB_AUTO}." | F39 | D2 pour Depop ; « ordinateur allumé » dit dans le texte qui suit ; aucun palier à côté |
| « Vendu ici, retiré là-bas. » | "Sold here, removed there." | F43, F44 | « Déjà vendu ? » dit dans le texte qui suit |
| « Tout ton stock déjà en ligne, importé en un appui. Gratuit. » | "Your whole live stock, imported in one tap. Free." | F33 | Depop nommée seulement sous D1 |
| « Ta marge se calcule toute seule. » | "Your margin works itself out." | F49 | — |
| « Stock sans limite, même en gratuit. » | "No limit on your stock, even on the free plan." | F48 | — |
| « Jamais ton mot de passe. » | "Never your password." | F11, F12 | — |
| « Au moindre doute, FillSell te demande. » | "Any doubt, FillSell asks you." | F35 | — |
| « eBay par l'interface officielle, même ordinateur éteint. » | "eBay through its official interface, even with your computer off." | F31 | compte eBay relié, eBay France |
| « iPhone, Android, ordinateur : ton stock te suit. » | "iPhone, Android, computer: your stock goes where you go." | F01-F03 | — |
