# 03b — Contre-vérification adversariale de la fiche de vérité (09/10/2026)

> Objet : relire chaque affirmation de `03-fiche-de-verite.md` marquée vérifiée et chercher à la
> **réfuter** dans le code et l'état de prod écrit. Observé le **2026-10-09** (15:05–15:45, Paris).
> Lecture seule : aucun SQL, aucune connexion à un compte, aucun commit, aucun déploiement.
> Les corrections sont reportées dans la fiche (lignes marquées « corrigé par contre-vérification »).

## 0. Sources et limites

| Source | Ce qui a été lu |
|---|---|
| Worktree `C:\Users\nicol\fill-and-sell-seo` (HEAD `8fa7007` = `origin/main`) | `src/`, `chrome-extension/` (lecture), `supabase/functions/`, `supabase/migrations/`, `docs/agents/etat-2026-10-01.md`, `docs/reprise/terminal-marta-0910.md`, `CLAUDE.md` |
| `main` LOCAL du dépôt (3 commits non poussés au-dessus d'`origin/main` : `4be8623`, `515670a`, `a2ed41b`), lus par `git show` | migration `20261009160000` **APPLIQUÉE** le 09/10 ~14:10 ; migration `20261009170000` **APPLIQUÉE** + `ebay-ventes-sync` v7 ; réparations eBay du 09/10. **La prod serveur est donc en avance sur le code du worktree** (le site web, lui, = `8fa7007`). |
| `curl https://fillsell.app/build.json` (09/10 15:1x) | `2026-10-09T11:58:40Z+8fa7007` (inchangé) |
| `curl https://fillsell.app/` (09/10) | balises `GTM-TJNKL6T5` et **`AW-16622098460`** (Google Ads) présentes dans le HTML servi |
| https://apps.apple.com/fr/app/fillsell/id6762152785 (09/10) | 3 notes, 5,0 ; Version 2.8 ; iOS 15+ ; Mac M1 + macOS 12 ; langue « Anglais » ; 8 achats intégrés (liste § 3) |
| https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm (09/10) | 0.6.104, 360 utilisateurs, « Suivi en temps réel », « sans fenêtre visible ni interruption » |
| https://play.google.com/store/apps/details?id=app.fillsell.app (09/10) | 500+, NelsonCatStudio, Opla citée, « à vie » |

**Non vérifiable ici (base non lue)** : valeurs vivantes de `coin_config` (`sync_multi_ouverte`,
`republication_multi_ouverte`, `quota_voix_*`, `lens_unifie`, `veille_commandes_ouverte`,
plafonds). Quand un fait en dépend, il est dit « déduit » et la preuve indirecte est citée.

## 1. Verdict par affirmation

Légende : **confirmé** (la réfutation a échoué) · **à nuancer** (vrai, mais la formulation promet
trop ou omet une condition) · **faux** (contredit par le code ou la prod).

| ID | Verdict | Ce qui réfute ou nuance (preuve) | Correction appliquée à la fiche |
|---|---|---|---|
| F01 | confirmé | App Store relu : 3 notes, 5,0 ; « Nécessite iOS 15.0 » ; Mac « puce Apple M1 » **et macOS 12** | précision macOS 12 |
| F02 | confirmé | `android/variables.gradle:2` (`minSdkVersion = 24`) ; Play relu : 500+ | — |
| F03 | confirmé | `src/router/AppRouter.jsx:122` (`/app` sous `RequireAuth`, aucun renvoi vers les stores sur navigateur mobile) | — |
| F04 | confirmé | `translations.js` fr/en ; composants récents bilingues (`publication/lot/LivraisonDuLot.jsx:53-92`) | — |
| F05 | confirmé | `ExtensionPage.jsx:21` (seul lien : le Web Store) | — |
| F06 | confirmé (partiel) | `chrome-extension/vinted-origine.js:23` (« 6 postes Edge actifs le 09/10 ») | — |
| F07 | à nuancer | la phrase met eBay dans « retire et republie » : eBay n'est **jamais** republié (`useRepublicationPlanifiee.js:30-32`) | phrase précisée |
| F08 | confirmé | `background.js:6136-6144` (`focused:false`, `state:"minimized"`) | — |
| F09 | confirmé | `background.js:90` (`EVEIL_PLAFOND_MS = 4 h`), `:132` | — |
| F10 | à nuancer | (1) un **dépôt resté en attente plus de 10 jours passe en échec** (quota rendu, « Relancer ») : `handler-watch/index.ts:2723-2745` (`PENDING_MUET_JOURS = 10`) ; (2) ce n'est pas seulement l'automatique : **toute** republication, manuelle comprise, est refusée si l'extension n'a pas été vue depuis 7 jours (`spend_coins_and_republish`, raison `extension_stale`, `20261002120000…:137`) | condition ajoutée |
| F11 | à nuancer | la phrase « la permission cookies ne sert qu'à tester `v_uid` » est **fausse pour la version servie** : 0.6.104 lit aussi tous les cookies d'opla.co, en envoie noms et tailles au serveur (`platform_fields.opla_cookies`) et peut les **supprimer** (`git show 0cec9e6:chrome-extension/background.js`, l. 10706-10740 ; actuel `background.js:10805-10850`) ; 0.6.105+ lit le cookie `access_token` de Depop (`:11162`, non servie). `/legal` dit « Aucun cookie n'est lu en dehors de ce test, ni transmis » (`Legal.jsx:226-228`) → **C22** | phrase sur les cookies retirée de la formulation, renvoi C22 |
| F12 | confirmé | `_shared/ebay-voie.ts` | — |
| F13 | à nuancer | « Continuer avec Apple » : iPhone (natif) et web seulement ; **l'app Android ne propose que Google** (`App.jsx:7106-7125`) | précisé |
| F14 | confirmé | — | — |
| F15 | confirmé (note) | le mode « annonce » (scan qui rédige les copies) est derrière l'interrupteur `coin_config.lens_unifie` ; éteint, l'app retombe sur la rédaction classique, même résultat en deux temps (`lens-analysis/index.ts:84-91`) | note ajoutée |
| F16 | à nuancer | c'est une **règle donnée à l'IA** (`lens-analysis/index.ts:430-485`), pas une garantie ; la recherche web peut aussi corriger une marque lue | « Lens est réglé pour… », relecture rappelée |
| F17-F19 | confirmé | `lens-analysis/index.ts:251,441,485-486,2574-2587` (requête Vinted puis eBay/Leboncoin, 8 annonces au plus, `confiance:"basse"` sans donnée) | — |
| F20 | confirmé | fusion scans + annonces (02/09) ; CGV 3.4 | — |
| F21 | confirmé | `20260902203000…:37-38` (0/5/20/50), `gpt-image-2` (`generate-listing/index.ts:1026`) | — |
| F22 | **faux (chiffres)** | la migration `20260902203000_bascule_quotas_valeurs.sql:39-40` pose des plafonds **mensuels** de commandes vocales : `quota_voix_free 10`, `premium 30`, `pro 80`, `business 200` ; `voice-intent/index.ts:1085-1116` les applique (mois calendaire, `check_and_log_usage`) **en plus** des 50/jour du Gratuit. « Gratuit : 50 par jour ; payants sans limite » est donc faux si ces clés sont en base (non relue ; aucune migration ne les retire). La dictée seule (`voice-transcribe`) n'a pas de plafond mensuel (`:100-102`). | chiffres retirés ; § 10.3 complété ; § 14 |
| F23 | confirmé (partiel) | `stats-analysis/index.ts:76` (garde-fou de 30 appels) | — |
| F24 | à nuancer | eBay par l'extension bute souvent sur la reconnexion de sécurité d'eBay (« REAUTH VENTE ») : la publication passe alors en attente de « Connecte ton compte eBay » (`update-job-status/index.ts:1160-1240`, `_shared/ebay-voie.ts:1-20`) | note eBay |
| F25 | confirmé | — | — |
| F26 | à nuancer | 20 articles = plafond technique « décision à confirmer » (`regles.js:20-23`) ; le lot **reste dans le quota du mois** : chaque article rédigé compte une annonce, le gratuit n'en prépare jamais au-delà (`regles.js:108-135,364-372`) → **5 articles par mois en Gratuit** | condition ajoutée |
| F27 | à nuancer | vrai à la lettre, mais **chaque article à publier passe par une rédaction IA** (1 annonce, `generate-listing/index.ts:500-540`), y compris un article importé qu'on publie sur une nouvelle plateforme ; seul un article **déjà rédigé** pour les plateformes visées part sans rien compter (`regles.js:108-117`). « La publication est incluse » laisse croire à des publications gratuites en nombre | formulation réécrite |
| F28-F30 | confirmé | — | — |
| F31 | à nuancer | le compte eBay doit être **prêt à vendre** (politiques paiement, retours, livraison ; vendeur non bloqué) sinon la publication attend (`_shared/ebay-voie.ts:55-70`) ; la règle « jamais ebay.fr pour un compte étranger » est en prod (mig `20261009150000` APPLIQUÉE, `docs/reprise/terminal-marta-0910.md`) | condition ajoutée |
| F32 | confirmé (note) | un compte Vinted étranger peut déjà travailler sur www.vinted.fr (mêmes identifiants) d'après `terminal-marta-0910.md` § B — à ne pas promouvoir | — |
| F33 | à nuancer | « toutes les plateformes connectées » dépend de l'interrupteur `sync_multi_ouverte` (fail-closed, `src/utils/syncPlateformes.js:26-37` ; valeur 1 **déduite** dans `docs/enquetes/marine-0510/RAPPORT.md:47`) ; le relevé vise les plateformes **choisies** (« Où tu vends ? », `plateformes_vendeur`) ; une plateforme lue il y a moins de 15 min n'est pas relue (`demander_sync_plateforme`, `20261009020000…`) | précisé |
| F34 | à nuancer | la synchronisation ne publie ni ne modifie aucune annonce, mais une vente qu'elle révèle (dressing Vinted « sold ») est **enregistrée seule et fait retirer les copies ailleurs** (`20261008233100…:20-41`) ; elle complète aussi des champs vides de la fiche | formulation réécrite |
| F35-F36 | confirmé | — | — |
| F37 | à nuancer | Leboncoin et Beebs passent par l'interrupteur `republication_multi_ouverte` (fail-closed, `20260917220000…:13-45` ; `StockTab.jsx:5815-5845`) — ouvert **en fait** (républications Beebs de Louis les 06 et 08/10, `etat-2026-10-01.md` « 08/10 après-midi »), non relu en base ; une même annonce n'est pas republiée deux fois en 24 h (`cadence_24h`) | note ajoutée |
| F38 | à nuancer | extension vue dans les 7 jours exigée (raison `extension_stale`) | condition ajoutée |
| F39 | confirmé (partiel) | + aucune automatique Vinted pendant une vérification anti-robot du compte (`pause_antirobot`) | note ajoutée |
| F40 | confirmé (partiel) | `get-pending-jobs/index.ts:500-600` | — |
| F41 | confirmé (note) | seulement pour une annonce **déposée par FillSell** ; une annonce importée à plusieurs exemplaires n'est jamais remise en vente (`20261005100000…:13-14`) | note ajoutée |
| F42 | à nuancer | Gratuit : pas de veille des commandes (`background.js:19307-19340`, palier payant exigé) ; chaque annonce publiée est relue **au plus toutes les 2 h** (`SALE_CHECK_MIN_INTERVAL_MS`, `:9796`) avec un délai de grâce (2 h après un dépôt, 12 h après une republication) et deux lectures avant « Plus en ligne » ; eBay : relecture Browse **toutes les 6 h par annonce** (`ebay-api-worker/index.ts:2215`), en quelques minutes pour les comptes reliés abonnés aux commandes ; **247 ventes eBay manquaient** au parc (78 comptes) jusqu'au 09/10 (mig `20261009170000`, commit local `515670a`) et une enchère en cours a été lue « vendue » jusqu'au 09/10 (veilleur v83) | conditions ajoutées |
| F43 | **faux (généralité)** | l'enregistrement **seul** ne vaut que pour **Vinted** (dressing « sold », page lue « vendue » depuis `20261009130000`) et **eBay** (Browse / commandes) — et Depop (bêta). **Leboncoin et Beebs** : la lecture « vendue » reste un **signal**, la vente attend l'appui de la personne (`background.js:20003-20009` : « Les autres plateformes ne changent pas : leur drapeau attend le clic » ; `git show a2ed41b:supabase/migrations/20261009160000_mail_apres_la_vente.sql:66-68`). Beebs ne conclut jamais « vendue », seulement « plus en ligne » (`background.js:10102-10114`) | fait et formulation réécrits |
| F44 | à nuancer | le retrait automatique suit une vente **enregistrée** : seule pour Vinted/eBay, **après ta confirmation** pour Leboncoin/Beebs ; « Retrait automatique partout après une vente » (`ConversionModal.jsx:186`) promet trop (copies non prouvées → question ; ordinateur allumé pour Vinted/LBC/Beebs) | formulation réécrite ; C01 nuancée ; C24 |
| F45 | **faux (formulation)** | depuis le 09/10 ~14:10 (mig `20261009160000` appliquée, commit local `4be8623`) : **aucun mail avant une vente enregistrée** ; une vente déclarée à la main n'a pas de mail ; les ventes Leboncoin/Beebs (non enregistrées seules) n'en reçoivent donc **pas** (« 1 mail en 30 j (Leboncoin…) ne serait pas parti », même fichier l. 66-68) | formulation réécrite |
| F46-F47 | confirmé | stores datés du 24/09 (binaire < 2.9.62) | — |
| F48 | confirmé | `ConversionModal.jsx:901-903` (mig `20260904120100`) | — |
| F49-F53 | confirmé | aucun scanner (`package.json` : aucun plugin code-barres) | — |
| F54-F57 | confirmé | `stockFiltres.js:76-97`, `cloudOffer.js:30` | — |
| F58 | confirmé | `ConversionModal.jsx:122-138` ; App Store relu (voir § 3 : 4 packs « Pépites » encore listés) | § 10.4 complété |
| F59-F61 | confirmé / partiel | — | — |
| F62 | confirmé, à compléter | sur le web, **Meta** (pixel, après consentement) et **Google Ads** reçoivent aussi des données (voir F63) | ajouté |
| F63 | **faux** | « aucun SDK publicitaire ; mesure d'audience par GTM » : le site charge **sur chaque page, sans consentement**, la balise **Google Ads `AW-16622098460`** (`index.html:159-165`, présente dans le HTML servi le 09/10) et, **après consentement**, le **pixel Meta** `1425992186075849` (`src/utils/metaPixel.js`, `BandeauConsentement.jsx`). Le pixel TikTok avait été retiré le 07/09 pour cette raison exacte (`index.html:205-211`). `/legal` se contredit (`Legal.jsx:101` « aucun SDK publicitaire… aucune donnée utilisée à des fins publicitaires » contre `:708-709` « pixel Meta… traceur publicitaire ») → **C21** | fait réécrit ; « à ne pas dire » complété |
| F64 | à nuancer | la suppression annule **l'abonnement Stripe (web) seulement** (`delete-account/index.ts:82-100`) ; un abonnement App Store / Google Play **continue** tant qu'il n'est pas résilié dans le store | formulation réécrite |

**Bilan** : 64 affirmations relues. **4 fausses** (F22, F43, F45, F63), **16 à nuancer**
(F07, F10, F11, F13, F16, F24, F26, F27, F31, F33, F34, F37, F38, F42, F44, F64), 3 confirmées
avec une note (F15, F39, F41), le reste confirmé.

## 2. Les quatre erreurs qui auraient coûté cher

1. **F43 / F44 / F45 — « la vente s'enregistre seule, les copies partent seules, un mail à chaque
   vente »** : vrai pour Vinted et eBay seulement. Sur Leboncoin et Beebs, FillSell repère une vente
   (ou une annonce « plus en ligne ») et **attend ton appui** ; tant que tu n'as pas confirmé, aucune
   copie n'est retirée et **aucun mail ne part**. Un texte SEO « FillSell retire tout seul tes
   annonces dès qu'un article se vend, où qu'il se vende » serait faux pour la moitié des
   plateformes. Formulation sûre : « Quand Vinted ou eBay marque ton article vendu, FillSell
   enregistre la vente et retire ses autres annonces. Sur Leboncoin et Beebs, il te demande de
   confirmer d'un appui. »
2. **F63 — « aucun traceur publicitaire »** : le site porte Google Ads sans consentement et Meta
   après consentement. C'est aussi un **risque CNIL** (article 82) que `/legal` aggrave en affirmant
   l'inverse ; à trancher par Nico avant toute page qui parle de vie privée.
3. **F22 — chiffres de la voix** : un plafond mensuel de commandes vocales existe pour **tous** les
   paliers (10 / 30 / 80 / 200 d'après la migration du 02/09). Ne publier aucun chiffre ni
   « illimité ».
4. **F27 — « publication incluse »** : en pratique, chaque nouvel article publié consomme une
   annonce du forfait (5 par mois en Gratuit). Les comparatifs qui diraient « publication illimitée
   en gratuit » seraient trompeurs.

## 3. Compléments factuels (stores, 09/10)

- **App Store, achats intégrés listés** (https://apps.apple.com/fr/app/fillsell/id6762152785, 09/10) :
  Business 59,99 € ; FillSell Premium 12,99 € ; FillSell Pro 29,99 € ; **Fill & Sell Premium 9,99 €** ;
  **Pack 100 Pépites 4,99 €**, **Pack 220 Pépites 9,99 €**, **Pack 460 Pépites 19,99 €**,
  **Pack 1150 Pépites 49,99 €** (la fiche ne citait que le premier pack).
- App Store : Mac « doté d'une puce Apple M1 ou ultérieure » **et macOS 12 ou ultérieur** ; iPod touch
  aussi cité.
- Chrome Web Store (09/10) : 0.6.104, 360 utilisateurs — confirmé.
- Google Play (09/10) : 500+, « NelsonCatStudio », Opla et « à vie » toujours présents — confirmé.

## 4. Nouvelles contradictions (ajoutées au § 13 de la fiche)

- **C21 — Traceurs publicitaires** : `index.html:159-165` charge Google Ads (`AW-16622098460`) sur
  chaque page sans consentement ; pixel Meta après consentement ; `/legal` (`Legal.jsx:97,101`,
  `:774` pour l'extension) affirme « aucun SDK publicitaire » et « jamais utilisées pour du tracking
  publicitaire », puis décrit le pixel Meta (`:708-709`). Juridique d'abord.
- **C22 — Permission « cookies » de l'extension** : `/legal` (`Legal.jsx:226-228`) « uniquement
  `v_uid`… aucun cookie lu en dehors de ce test, ni transmis » contre 0.6.104 qui mesure (noms et
  tailles envoyés au serveur) et purge les cookies d'opla.co ; 0.6.105+ lit le jeton Depop.
- **C23 — « Un seul ajout, publié partout en même temps »** (FAQ landing `LandingPage.jsx:327`, aussi
  en JSON-LD FAQPage) contre une publication une annonce à la fois, 8 à 20 s d'écart, Leboncoin une
  par compte (`config.js:22-23`).
- **C24 — « Retrait automatique partout après une vente »** (app, `ConversionModal.jsx:186`) et
  fiches stores (« l'extension retire les copies ») : seulement après une vente **enregistrée**
  (seule sur Vinted/eBay, confirmée par la personne sur Leboncoin/Beebs) et pour les copies
  **prouvées** ; les autres deviennent la question « Déjà vendu ? ».
- **C01 (nuancée)** : « Tu confirmes, il retire » n'est faux que pour les ventes Vinted et eBay
  prouvées ; il reste vrai pour Leboncoin et Beebs. Le texte à écrire distingue les deux cas.

## 5. Hors périmètre SEO, vu en passant (à signaler à Nico, non corrigé)

- `voice-intent` : le commentaire et l'app attendent la raison `monthly` (`App.jsx:4212`) alors que
  `check_and_log_usage` (dernière définition du dépôt, `20260608000000…:46`) rend `monthly_limit` —
  le message « le vocal se repose » ne s'afficherait jamais (définition en prod non relue).
- `StockTab.jsx:5836` relit les statistiques par `setInterval` toutes les 2 min, ce que la règle du
  04/10 (« jamais de setInterval qui relit la base ») interdit.

## 6. Ce qui reste à relire en base avant publication (ajouté au § 14)

`sync_multi_ouverte`, `republication_multi_ouverte`, `quota_voix_*` (et la définition en prod de
`check_and_log_usage`), `lens_unifie`, `republish_planifiee_pf_*`, `veille_commandes_ouverte`.
