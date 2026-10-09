# 03c — Décisions de Nico du 09/10/2026, reportées dans la fiche de vérité

> Ces décisions **priment** sur `03-fiche-de-verite.md`, sur `03b-contre-verification.md` et sur
> tout rapport antérieur. Elles sont reportées dans la fiche : chaque ligne touchée y porte la
> mention « décision de Nico 09/10 ».
> Écrit le **2026-10-09 (soir)**. Lecture seule : aucun SQL, aucune connexion à fillsell.app ni à
> un compte, aucun commit, aucun déploiement.
> Code relu : worktree `C:\Users\nicol\fill-and-sell-seo` (HEAD `8fa7007`) ; `main` du dépôt
> (`d1b7ac1`, égal à `origin/main` d'après la référence locale, non rafraîchie) relu par `git`
> seulement : depuis `8fa7007`, **aucun** commit ne touche la republication automatique ni
> l'ouverture de Depop (`git diff 8fa7007..main` : ventes eBay, rapprochement, App.jsx ; 0
> occurrence de `republish_planifiee`, `PLATEFORMES_PLANIFIEES` ou `depop_ouvert`).

## 1. Les six décisions

1. **Depop est dans FillSell**, ouverture le **10/10**, à la place d'Opla. Plateformes
   présentées PARTOUT : **Vinted, Leboncoin, eBay, Beebs, Depop**. **Opla n'apparaît NULLE PART**
   (ni texte, ni image, ni vidéo). Pour Depop on dit : publication, synchronisation, retrait des
   copies à la vente **et republication automatique** (mise à jour de Nico : elle arrive avec la
   bascule Opla → Depop).
2. **Republication automatique** sur **Vinted, Leboncoin, Beebs et Depop**. eBay : pas de
   republication (inutile chez eBay), **on n'en parle pas du tout**. Elle existe à **tous** les
   paliers : jamais « Pro / Business » ni aucun palier écrit à côté. La liste des plateformes à
   republication automatique doit pouvoir **perdre Depop d'un seul geste** (Nico vérifie qu'elle
   est active avant la mise en ligne).
3. **Aucun chiffre de quota ni de plafond**, nulle part (annonces par mois, republications par
   jour ou par mois, taille d'un lot, retouches, commandes vocales, rien de tel).
4. **Logos** : sur les pages du site, noms en texte + mention de non-affiliation ; dans les
   captures et la vidéo, logos **tels que l'app les dessine**.
5. **Chiffres des captures et de la vidéo** : uniquement le compte de démonstration
   « Camille », chiffres qui donnent envie mais crédibles (un très bon mois de revendeuse :
   profit du mois, nombre de ventes, ventes sur plusieurs plateformes dont Depop, articles qui
   partent vite). Plus aucun vrai chiffre de Nico ; jamais présenté comme le résultat d'un vrai
   client ni comme une garantie de gains.
6. **Ton offensif, ultra vendeur** : passer devant les concurrents, formules qui frappent,
   comparatifs à notre avantage. **Seule limite** : ne rien affirmer que l'app ne fait pas au
   moment de la mise en ligne, et rester dans le cadre légal (faits vrais et vérifiables, aucun
   dénigrement, aucun faux chiffre — § 5).

## 2. Ce que dit le code aujourd'hui (09/10) — points à confirmer avant la mise en ligne

Écrit **sans contredire Nico** : ce sont des conditions à remplir ou à vérifier, pas des
objections. Codes repris dans la fiche (§ 0 bis, § 13, § 14).

### 2.1 Depop, capacité par capacité

| Ce qu'on dit (décision 1) | Code au 09/10 | Prouvé en réel ? | Condition |
|---|---|---|---|
| **Publication** sur Depop | oui : connecteur `chrome-extension/content-scripts/depop.js` (0.6.105+), copie Depop posée par l'app (`src/utils/depopPublication.js` : dérivée de la copie Vinted, sans titre), rayon par identifiant (`src/utils/depopCategories.js`), lot (`src/publication/lot/regles.js:18`, `PLATEFORMES_LOT` contient `depop`) ; un job Depop ne part qu'au poste qui a l'accès Depop (gpj v224) | **oui**, compte de Nico (09/10 : `POST listing/products` 201, relu `STATUS_ONSALE` — `docs/reprise/terminal-depop-0910.md` « Parcours réel » § 4) | **D1** |
| **Synchronisation** Depop | oui : relevé Depop (`demander_sync_plateforme('depop')`, `src/utils/syncPlateformes.js:23`), rattachement v17 « identifiant avant moteur » | **oui** (relevé 09:04, annonce rattachée, aucune fiche neuve — même document § 1 et § 4) | **D1** |
| **Retrait des copies à la vente** — l'annonce Depop retirée quand l'article se vend ailleurs | oui : retrait Depop par l'extension ; déclencheurs de retrait ouverts à Depop (mig `20261009110000`, appliquée d'après `CLAUDE.md` ; l'en-tête du fichier dit encore « NON APPLIQUÉE ») | **oui** (retrait `DELETE` 204 puis 404 — même document § 3 et § 4) | **D1** |
| **Retrait des copies à la vente** — vente faite **sur Depop** → copies retirées ailleurs | oui par le code : le veilleur lit `STATUS_PURCHASED` → `sold` sur l'identifiant exact (`chrome-extension/background.js:11173-11202`) et pose une `sale_evidence` exacte (`:20010-20013`) ; le cron 52 enregistre toute `sale_evidence` exacte, quelle que soit la plateforme (`20261008233100_ventes_prouvees_automatiques.sql:152-158`), puis retire les copies prouvées | **non** : aucune vente Depop observée (« 0 vente » au parcours du 09/10) | **D1 + P3** |
| **Republication** Depop à la demande (un appui) | oui : `PLATEFORMES_REPUBLIABLES` = toutes sauf eBay (`src/utils/republication.js:26`) ; `spend_coins_and_republish(…, 'depop')` ; rattachement des republications ouvert à Depop (mig `20261009100000` appliquée) | **oui** (suppression 204/404 puis recréation 201, relue en ligne — même document § 2) | **D1** |
| **Republication automatique** Depop | **non codée** : `republish_planifiee_plateformes()` = `vinted, leboncoin, beebs, opla` (`20260918200100_republication_planifiee_multi_fonctions.sql:51-54`) ; app : `PLATEFORMES_PLANIFIEES = ['vinted','leboncoin','beebs','opla']` (`src/hooks/useRepublicationPlanifiee.js:32`) ; l'écran n'a ni nom, ni geste, ni ligne Depop (`src/components/RepublicationPlanifiee.jsx:57-84`) ; aucune clé `republish_planifiee_pf_depop` ; la migration Depop le dit : « ni republication PLANIFIÉE Depop (…) : la republication Depop est manuelle » (`20261009020000_depop_plateforme_base.sql:37-38`) | non | **D2** |

### 2.2 Conditions et points à confirmer

- **D1 — Depop ouverte à tous au moment de la mise en ligne.** Aujourd'hui : `depop_ouvert`
  resté à **0**, bêta du seul compte de Nico (`depop_autorise`, mig `20261009020000`). Il faut
  aussi : (a) une extension avec Depop **servie** par le Chrome Web Store — la 0.6.104 servie
  n'a pas Depop ; zips 0.6.105 et 0.6.106 prêts, un seul ordre possible
  (`docs/reprise/terminal-depop-0910.md` « Décisions » § 3) ; (b) pour l'app iPhone/Android,
  une OTA **≥ 2.9.68** : l'OTA 2.9.67 servie (build `9d203ac`, 08/10) **ne contient pas** le
  code Depop de l'app (`git merge-base --is-ancestor 8f88cdd 9d203ac` : faux) ; le web l'a
  (`8f88cdd` est un ancêtre de `8fa7007`) ; (c) côté personne, un clic « Autoriser Depop » dans
  l'extension (accès optionnel, `Legal.jsx:266-268`). Depop n'est jamais cochée d'office à la
  publication (`src/utils/stockFiltres.js:95`).
- **D2 — Republication automatique Depop** : non codée au 09/10 (tableau ci-dessus). Si elle
  n'est pas active au GO, on retire Depop de la liste `REPUB_AUTO` (fiche § 0 bis) : version B
  de chaque phrase.
- **P1 — Republication automatique et paliers.** Le code au 09/10 la réserve à **Pro et
  Business** : refus `auto_reserve_pro` (`20261005173000_republication_free_mensuelle.sql:401-409`),
  le balayage arrête un compte qui n'est plus Pro (`20261008140000_republication_finit_dans_son_creneau.sql:130-133`),
  l'écran affiche « Réservée au plan Pro » (`RepublicationPlanifiee.jsx:358,727`). La règle de
  Nico (aucun palier écrit à côté) est appliquée dans la fiche. **À confirmer** : l'ouverture
  à tous les paliers sera-t-elle faite avant la mise en ligne ? D'ici là, aucun texte ne dit
  « pour tous », « dès le gratuit » ni « sur tous les forfaits » à propos de l'automatique
  (ce serait aussi écrire un palier à côté), et aucune capture ne montre « Réservée au plan
  Pro ».
- **P2 — Opla encore présente hors du site.** L'app la retire d'elle-même à la bascule du
  10/10 00:00 (`opla_sortie_le`, `src/utils/stockFiltres.js:74-86`). Restent : `/legal`
  (non-affiliation `Legal.jsx:152,179`, republication `:159,186`, extension `:261-263,756-763`,
  retrait `:812-813`), fiches App Store / Google Play (C05), permission `opla.co` de
  l'extension 0.6.104 (C22), et le suivi des annonces Opla déjà en ligne (gardé pour les
  comptes reliés). **À confirmer** : `/legal` décrit des accès réels de l'extension ; Nico
  décide si elle garde la mention d'Opla tant que l'extension la demande.
- **P3 — Vente Depop enregistrée seule** : codée, jamais observée (aucune vente Depop au
  parcours). Le mail de vente Depop (`push-ventes`) n'est pas vérifié non plus. Tant qu'une
  vraie vente Depop n'est pas vue enregistrée, la version prudente des phrases F42/F43 existe
  dans la fiche.
- **P4 — Quotas sans chiffre ≠ « illimité ».** Les volumes existent (fiche § 10.3, information
  interne). Aucun texte ne doit laisser croire qu'il n'y en a pas (« illimité », « sans
  limite » hors import et stock, « autant que tu veux »). Les volumes restent lisibles dans
  l'app avant l'achat (feuille des offres) et dans les CGV 3.4 (`Legal.jsx:482-486`). **À
  confirmer par Nico** : les CGV gardent-elles leurs chiffres (texte contractuel) ?
- **P5 — Captures et vidéo.** (a) L'écran de republication automatique de l'app n'a **pas** de
  ligne Depop (D2) : une capture « telle que l'app la dessine » avec Depop n'est possible
  qu'après le code ; (b) le jeu de démonstration actuel `scripts/apercu/site-donnees-demo.js`
  (non suivi par git) dit « Ni Opla, ni Depop » et raconte 22 ventes sur six mois : à refaire
  selon la décision 5 (autre lot) ; (c) la feuille des offres de l'app affiche les volumes
  (`ConversionModal.jsx:238-282`) : elle ne doit pas apparaître dans une capture.

## 3. Lignes touchées : ancienne formulation → nouvelle

Jetons (fiche § 0 bis) : `{PUB}` = « Vinted, Leboncoin, eBay, Beebs et Depop » ;
`{REPUB_AUTO}` = « Vinted, Leboncoin, Beebs et Depop » (version A) ou « Vinted, Leboncoin et
Beebs » (version B, sans Depop).

| ID | Ancienne formulation sûre (FR) | Nouvelle formulation sûre (FR) | Décision |
|---|---|---|---|
| Règles d'écriture (§ 0) | tutoiement, aucun jargon, aucun chiffre non lu en base, aucune promesse de délai | + ton offensif, aucun chiffre de quota ou de plafond, jamais Opla, jamais de palier à côté de l'automatique, eBay jamais à côté de la republication, listes de plateformes par jetons | 1, 2, 3, 6 |
| § 0 bis (nouveau) | — | listes uniques `{PUB}`, `{SYNC}`, `{RETRAIT}`, `{REPUB_AUTO}` et conditions D1, D2 | 1, 2 |
| F07 | « … puis retire ou republie tes annonces — une à une, à un rythme humain. » (fait : republie Vinted, Leboncoin, Beebs) | « L'extension bosse sur les sites à ta place : elle remplit les formulaires, relit tes annonces, repère tes ventes, retire et republie tes annonces — une à une, à un rythme humain. » (fait : + Depop, 0.6.105+) | 1 |
| F09 | inchangée (fait : Vinted, Leboncoin, Beebs) | inchangée (fait : + Depop) | 1 |
| F11 | « … tes mots de passe Vinted, Leboncoin ou Beebs … » | « … tes mots de passe Vinted, Leboncoin, Beebs ou Depop … » + « Pour Depop, tu autorises l'accès d'un clic dans l'extension. » | 1 |
| F21 | « Avec Premium, Pro ou Business, l'IA retouche tes photos (lumière, fond), jusqu'à 5 photos par annonce. » | « Avec Premium, Pro ou Business, l'IA retouche tes photos (lumière, fond) pour des annonces qui sautent aux yeux. » (volumes : information interne) | 3 |
| F22 | inchangée (« Tu peux dicter un article ou gérer ton stock à la voix. ») | inchangée (les plafonds vocaux du fait deviennent information interne) | 3 |
| F24 | « … Vinted, Leboncoin, eBay et Beebs … » ; à ne pas dire : « Depop », « Opla » (après le 10/10) | « Une annonce, cinq plateformes : tu la remplis une fois, FillSell la publie sur celles que tu coches — {PUB}. S'il manque une info, l'app te la demande. » (sans D1 : « quatre plateformes ») ; à ne pas dire : « Opla » (toujours) | 1 |
| F25 | inchangée | inchangée (fait : copie Depop adaptée, sans titre) | 1 |
| F26 | « Tu peux publier jusqu'à 20 articles d'un coup, dans la limite de ton forfait … » | « Publie tout un lot d'articles d'un coup : tu choisis les plateformes, FillSell prépare, tu vérifies, c'est parti. » | 3 |
| F27 | inchangée (fait : « Le Gratuit publie donc 5 articles par mois ») | inchangée (le chiffre devient information interne) | 3 |
| F33 | « … sur Vinted, Leboncoin, eBay et Beebs et les range dans ton stock. Gratuit et sans limite. » | « Un appui sur « Synchroniser » et tes annonces déjà en ligne sur {SYNC} arrivent dans ton stock, rangées. Gratuit et sans limite. » | 1 |
| F37 | inchangée ; à ne pas dire « republication eBay » | inchangée (fait : + Depop à la demande) ; à ne pas dire : eBay à côté de la republication, sous toute forme | 1, 2 |
| F38 | inchangée (fait : volumes 50 / 1 500 / 5 000) | inchangée (volumes : information interne) | 3 |
| F39 | « Avec Pro ou Business, FillSell republie tout seul tes annonces qui ont plus de 7 jours (…) » | « Tes annonces remontent toutes seules : FillSell les republie sur {REPUB_AUTO}, les jours et au créneau que tu choisis, pendant que tu fais autre chose — ordinateur allumé. » | 2, 3, 6 |
| F40 | « FillSell espace les republications et s'arrête chaque jour à un plafond, pour protéger ton compte. (…) » | « FillSell espace tes republications à un rythme humain pour protéger ton compte. Tu coupes tout d'un geste, quand tu veux. » | 3 |
| F42 | « … sur Vinted, Leboncoin, Beebs et eBay. Pour Vinted, Leboncoin et Beebs, il faut que ton ordinateur soit allumé … » | « FillSell repère tes ventes sur {PUB}. Pour Vinted, Leboncoin, Beebs et Depop, ton ordinateur doit être allumé avec Chrome ouvert. » (prudente sans P3 : Depop retiré de la première phrase) | 1 |
| F43 | « Quand Vinted ou eBay marque ton article vendu (…) » | « Quand Vinted, eBay ou Depop marque ton article vendu, FillSell enregistre la vente tout seul. Sur Leboncoin et Beebs, il te demande de confirmer d'un appui. » (prudente sans P3 : ancienne) | 1 |
| F44 | « Dès qu'une vente est enregistrée, FillSell retire les autres annonces de l'article. (…) » | « Vendu ici, retiré là-bas : dès qu'une vente est enregistrée, FillSell retire les autres annonces de l'article, sur {RETRAIT}. Au moindre doute sur une annonce, il te demande « Déjà vendu ? » avant d'y toucher. » | 1, 6 |
| F45 | inchangée (Vinted, eBay) | inchangée ; Depop seulement après P3 | 1 |
| F54 | « Ne pas nommer Depop. » / « D'autres plateformes arriveront. » | « Depop rejoint FillSell : publie, synchronise, republie et retire tes annonces Depop avec tout le reste de ton stock. Pour Depop, tu autorises l'accès d'un clic dans l'extension. » (sous D1 ; « republie » automatique sous D2) | 1, 2 |
| F55 | « Ne pas proposer Opla. » ; à ne pas dire « publie sur Opla », « cinq plateformes » | aucune formulation ; à ne pas dire : « Opla » sous toute forme (texte, image, vidéo, logo) ; « cinq plateformes » permis seulement pour {PUB} sous D1 | 1 |
| F58 | « Gratuit pour commencer, sans carte bancaire. Premium 12,99 €, Pro 29,99 €, Business 59,99 € par mois, sans engagement. » | « Gratuit (0 €) pour commencer, sans carte bancaire. Premium 12,99 €, Pro 29,99 €, Business 59,99 € par mois, sans engagement. » ; à ne pas dire : tout volume par palier | 3 |
| § 10.1 et § 10.3 | observations des volumes | gardées comme **information interne**, jamais publiée | 3 |
| C02, C05, C08, C09, C12, C14, C20, C22 | contradictions d'avant | statut mis à jour (fiche § 13) | 1, 2, 3 |
| C25 à C30 (nouvelles) | — | palier de l'automatique, Depop automatique, quotas affichés, Opla encore présente, Depop absente des binaires et de l'extension servis, captures | 1 à 5 |
| § 14 | — | + D1, D2, P1, P3, OTA ≥ 2.9.68, extension Depop servie | 1, 2 |
| § 15 lexique | — | bannis : tout chiffre de quota ou de plafond, « Opla », tout palier à côté de l'automatique, eBay à côté de la republication | 1, 2, 3 |
| § 16 (nouveau) | — | présentation (logos, non-affiliation, chiffres « Camille »), ton offensif, accroches vérifiées | 4, 5, 6 |

## 4. Le geste unique pour Depop (décision 2)

- Une seule donnée porte la liste des plateformes à republication automatique : `{REPUB_AUTO}`
  dans la fiche, et dans le site la donnée prévue par le plan (`site/donnees/plateformes.yml`,
  `docs/seo/PLAN.md` § 1.8). Aucun texte ne recopie la liste en dur.
- **Version A** (Depop active, vérifiée par Nico) : FR « Vinted, Leboncoin, Beebs et Depop » ·
  EN "Vinted, Leboncoin, Beebs and Depop".
- **Version B** (Depop pas encore active) : FR « Vinted, Leboncoin et Beebs » · EN "Vinted,
  Leboncoin and Beebs". Les phrases restent justes telles quelles ; seule la liste change.
- Même principe pour `{PUB}`, `{SYNC}`, `{RETRAIT}` si D1 n'était pas rempli au GO (Depop retiré
  de chacune ; « cinq plateformes » devient « quatre »).
- Captures et vidéo : une scène qui montre Depop dans la republication automatique se
  remplace par la même scène sans Depop (P5).

## 5. Cadre du ton offensif (décision 6)

- **Publicité comparative** (Code de la consommation, art. L122-1 et suivants) : licite si
  elle n'est pas trompeuse, compare des services qui répondent aux mêmes besoins, et compare
  objectivement des caractéristiques **essentielles, pertinentes, vérifiables et
  représentatives** (le prix compris) ; pas de confusion ni de dénigrement ; l'annonceur doit
  pouvoir **prouver** chaque affirmation (art. L122-5). Sources secondaires lues le 2026-10-09 :
  https://www.gouache.fr/en/ressources/comparative-advertising-legal-framework-and-limits/ ;
  https://www.eurojuris.fr/fre/entreprises/finances/fiscalite/articles/regles-publicite-comparative-10594.htm
  — **texte officiel à relire sur legifrance.gouv.fr** avant la première page comparative.
- Conséquence pratique : chaque comparatif cite, côté FillSell, une ligne F-xx de la fiche ; côté
  concurrent, un fait daté avec son URL (dossier `docs/seo/concurrents/`). Aucun chiffre de
  concurrent sans source ; aucun qualificatif sur un concurrent (« lent », « dépassé ») ; on
  dit ce que FillSell fait, pas ce que l'autre rate.
- Chiffres de démonstration (« Camille ») : toujours présentés comme une démonstration (mention
  visible « Compte de démonstration, chiffres fictifs » / "Demo account, illustrative figures"),
  jamais comme le résultat d'un client ni comme une promesse de gains.

## 6. Sources

- Demande relayée de Nico (09/10) et décisions du chantier (tâche calculée du 09/10).
- `docs/seo/PLAN.md` § 1.7-1.8 et § 2.
- `docs/reprise/terminal-depop-0910.md` (parcours réel Depop du 09/10).
- Code et migrations cités ligne à ligne ci-dessus (worktree `8fa7007`).
