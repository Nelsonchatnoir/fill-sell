# Brief — vidéo de présentation, variante « site » (refaite le 09/10/2026, compte « Camille »)

> Refaite le 2026-10-09 (18:40–19:50, heure de Paris) dans le worktree `C:\Users\nicol\fill-and-sell-seo`
> (branche `seo-crosslisting`). Aucun commit, aucun push, aucun déploiement, aucun SQL, aucune connexion
> à fillsell.app ni à un compte. `C:\Users\nicol\fillsell-video` **lu seulement** (rendu sur une copie
> dans le scratchpad, empreintes vérifiées avant/après, § 8). Rien écrit dans `C:\Users\nicol\fill-and-sell`
> ni dans `chrome-extension/`.
> Règles appliquées : décisions de Nico du 09/10 (`etat-des-lieux/03c-decisions-nico-0910.md`, elles
> priment), fiche de vérité `03-fiche-de-verite.md` (§ 0 bis, § 15, § 16), captures « Camille »
> (`briefs/captures.md`).
> **Rien n'est en ligne : tout ce qui suit attend la validation de Nico (§ 5).**

## 0. En bref

| | Variante du 09/10 après-midi (remplacée) | **Cette variante** |
|---|---|---|
| Durée | 71,5 s, 11 scènes | **53,5 s** (1 605 images à 30 i/s), 9 scènes |
| Données | compte réel de Nico (646,90 €, 235 ventes, « Robot aspirateur », main sur la Casio…) | **compte de démonstration « Camille »** seulement (mêmes chiffres et photos que les captures du site) |
| Plateformes | quatre, initiales neutres | **cinq : Vinted, Leboncoin, eBay, Beebs, Depop**, logos tels que l'app les dessine |
| Accroche | 0–5 s (« Tu vends sur… », STOP) | **lisible dès l'image 0** : « Une photo. » → « Cinq plateformes. » (0,5 s) → les cinq logos (1 s) → « Sans un copier-coller. » (1,8 s) |
| Republication automatique | « Avec Pro ou Business » | **sans palier** ; Vinted, Leboncoin, Beebs et Depop (version A) — **version B prête** sans Depop (§ 2) |
| Son | aucun | aucun (muette, texte incrusté en français) |
| MP4 / VP9 / AV1 | 5,27 / 3,13 / 2,01 Mo | **4,01 / 2,54 / 1,66 Mo** (A ; B identique à 0,2 % près), décodés de bout en bout sans erreur |

⛔ **À lire avant toute mise en ligne — la republication automatique Depop N'EST PAS ACTIVE** (code relu
le 09/10 vers 19:00, § 2). La vidéo servie par défaut (`video.json`, version A) la montre : elle ne peut
partir sur le site **que si Nico a vérifié qu'elle tourne**. Sinon : `node
docs/seo/briefs/video-variante-site/video-json.mjs B` (un geste, fichiers B déjà encodés), en même temps
que `republication_auto: false` sur Depop dans `site/donnees/plateformes.yml`.

## 1. Le film, scène par scène (version A)

| De → à | Scène | Ce qu'on voit / lit | Repose sur |
|---|---|---|---|
| 0 – 3 s | **Accroche** | « Une photo. » (image 0) · « Cinq plateformes. » · les cinq logos jaillissent de la photo du sweat · « Ctrl + C / Ctrl + V » barrés · « Sans un copier-coller. » | F24 (sous D1), F25 |
| 3 – 5,5 s | **Marque** | les logos convergent dans l'icône FillSell · « FillSell » · pastilles Vinted, Leboncoin, eBay, Beebs, Depop · « Une seule app. » | matrice concurrents § 6.2 (« Vinted, Leboncoin, eBay, Beebs et Depop. Une seule app. ») |
| 5,5 – 12,5 s | **Étape 1/5 · Photo** | écran Lens « Scanne. On gère le reste. » (slogan réel de l'écran Lens) → « Résultat du scan » : titre tapé, marque « Pepe Jeans » lue sur le logo, description, « Très bon état · Gris · Coton · Mode », « Lu sur l'objet », 38,00 € « prix de vente conseillé », « Excellent marge +27,00 € (+71 %) », « basé sur 6 annonces » · « Créer l'annonce » ; légendes « Prends une photo. » / « Lens écrit l'annonce — titre, description, marque lue sur l'article, état proposé » / « Et propose le prix — Tu relis, tu publies. » | F15, F16 (marque **lue**), F18 (état **proposé**), F19 (prix + nombre d'annonces) ; accroche vérifiée § 16.4 |
| 12,5 – 20 s | **Étape 2/5 · Publier** | « Étape 1 sur 3 · Où publier ? », les cinq plateformes « Connectée » cochées (ordre de l'app : Vinted, Leboncoin, Beebs, eBay, Depop) · « Publier sur 5 plateformes » → « Publication lancée » : **une plateforme après l'autre** « En file… / Dépôt en cours… / En ligne » → « Publié · 5 en ligne » ; légendes « Coche tes plateformes » / « En ligne sur les cinq — une annonce après l'autre, sans un copier-coller » | F24, F28 (une à la fois) ; libellés réels (`translations.js:313`, `EcranSuivi.jsx`, `barresJobs.js`) |
| 20 – 26 s | **Étape 3/5 · Remonter** | ligne de l'app « Republication automatique — Active sur Vinted, Leboncoin, Beebs et Depop » (interrupteur allumé) + leurs pastilles ; cinq annonces de Camille, la plus vieille (35 j) remonte en tête « De retour en tête ✓ » ; **aucun eBay, aucun palier** ; légendes « Une annonce prend de l'âge… » / « Elle remonte toute seule — les jours et au créneau que tu choisis, ordinateur allumé » | F39 (version A = **D2**), F40 ; `Haut.jsx` (« Active sur »), `barresJobs.js` |
| 26 – 34 s | **Étape 4/5 · Vendre** | le sweat en ligne à 38 € sur les cinq · **« VENDU ! » sur Vinted**, « +27,00 € » · Leboncoin, eBay, Beebs, **Depop** : « RETIRÉE ✓ » l'une après l'autre · encart réel « Déjà vendu ? — Oui, la retirer — Non » ; légendes « Vendu sur Vinted ! — la vente s'enregistre toute seule » / « Vendu ici, retiré là-bas — Leboncoin, eBay, Beebs, Depop : FillSell retire les copies dès la vente enregistrée » / « Un doute ? Il te demande — avant de toucher à une annonce » | F43 (vente Vinted enregistrée seule), F44 (copies déposées par FillSell = prouvées ; retrait Depop prouvé en réel le 09/10), accroche vérifiée « Vendu ici, retiré là-bas » avec « Déjà vendu ? » à la suite |
| 34 – 43 s | **Étape 5/5 · Suivre — « Le mois de Camille »** | pastille **« Compte de démonstration · chiffres fictifs »** pendant toute la scène · « +1 268 € de profit ce mois · 62 ventes » + vraies tuiles de l'accueil (« Ce mois 1268,00 € · 62 ventes », « Marge moy. 68.5% ») · vraie carte « Ventes par plateforme » (Vinted 31, eBay 6, **Depop 8**, Leboncoin 10, Beebs 7 ; « Meilleure marge : Depop »), ligne Depop soulignée · vraie carte « Meilleurs vendeurs » (2 j, 1 j, 3 j en stock, soulignés) ; légendes « Sa marge, calculée toute seule » / « Vendu sur cinq plateformes — Depop compris » / « Ses meilleures pièces : parties en 1 à 3 jours — sur Vinted, Depop et eBay » | F49 ; décision 5 ; découpes des captures « Camille » (`accueil-tableau-de-bord.png`, `statistiques-ventes-par-plateforme.png`, `statistiques-meilleurs-vendeurs.png`) |
| 43 – 47,5 s | **Synchroniser** | bouton « Synchroniser » · Vinted 41, Leboncoin 24, eBay 5, Beebs 10, Depop 10 → « Synchronisé · 90 annonces » ; légendes « Déjà des annonces en ligne ? — Un appui sur « Synchroniser » » / « Tout ton stock arrive, rangé — Gratuit et sans limite. » | F33 (« Gratuit et sans limite » permis pour l'import, § 15) ; chiffres des captures |
| 47,5 – 53,5 s | **Fin** | icône, « FillSell », « Une annonce. Cinq plateformes. », les cinq pastilles, « iPhone · Android · Chrome », « Commencer gratuitement », « fillsell.app » ; en petit : **« Données de démonstration. »** + « Vinted, Leboncoin, eBay, Beebs et Depop sont des marques de leurs propriétaires respectifs. FillSell n'est affilié à aucune de ces plateformes, ni approuvé ni sponsorisé par elles. » ; la dernière image garde l'appel à l'action (pas de fondu final) | F24, F58, F01-F03 ; § 16.1 et § 16.2 |

Le **parcours qui fait rêver** demandé tient en 34 s (0 → 34 s) : une photo → Lens écrit l'annonce →
publiée sur les cinq → remonte toute seule → vendue sur Vinted → copies retirées partout ailleurs, Depop
comprise ; puis le mois de Camille. L'article de l'histoire est le **sweat Red Bull Racing** — celui
que les captures du site montrent vendu sur Vinted et retiré de Depop.

## 2. Republication automatique Depop : NON ACTIVE au 09/10 → version A prête, version B prête

**Vérifié (lecture seule, aucun SQL)** le 09/10 vers 19:00 :
- dépôt principal `main` = `d1b7ac1` (= `origin/main` d'après la référence locale, 09/10 16:05) :
  `src/hooks/useRepublicationPlanifiee.js:32` `PLATEFORMES_PLANIFIEES = ['vinted', 'leboncoin', 'beebs', 'opla']` ;
- **aucune branche locale ni distante** du dépôt ne contient `republish_planifiee_pf_depop` ni une liste
  planifiée avec `depop` (`git grep` sur toutes les références) ;
- la fonction serveur `republish_planifiee_plateformes()` (vinted, leboncoin, beebs, opla) et la note de
  la migration Depop (« la republication Depop est manuelle ») : `captures.md` § 3.1, `03c` § 2.1 —
  rien depuis ne les change.

**Conséquence (consigne de Nico : « si elle ne l'est pas encore, garde le texte prêt et préviens-moi »)** :
- **version A** (Vinted, Leboncoin, Beebs **et Depop**) : rendue, encodée, servie par défaut dans
  `site/medias/video/` — c'est la vidéo demandée, **prête pour le jour où l'automatique Depop tourne** ;
- **version B** (Vinted, Leboncoin et Beebs) : rendue et encodée dans `site/medias/video/version-b/`
  (mêmes noms de fichiers). **Seule différence** : la scène « Remonter » (20–26 s) — la ligne dit « Active
  sur Vinted, Leboncoin et Beebs », trois pastilles, aucun logo Depop sur les annonces de cette scène.
  Depop reste partout ailleurs (publication, vente/retrait, mois de Camille, synchronisation, fin) ;
- **le geste unique** : `node docs/seo/briefs/video-variante-site/video-json.mjs B` réécrit
  `site/medias/video/video.json` (fichiers `version-b/…`, transcription, chapitres, description, poids lus
  sur les fichiers) ; `… A` remet la version A. À faire **en même temps** que `republication_auto` de Depop
  dans `site/donnees/plateformes.yml` (même décision, deux supports). Dans les sources Remotion, la liste
  est une seule ligne : `REPUB_AUTO` (`src/data.ts`), surchargeable au rendu (`rendu.cjs … A|B`).

## 3. Ce qui a été retiré de la variante précédente, et pourquoi

| Retiré | Pourquoi |
|---|---|
| Toutes les captures et données du compte de Nico : tableau de bord (646,90 €, 235 ventes, 5 423,19 €, 80.7 %…), « Mon stock » (« Robot aspirateur », pastilles « +1 », badge Pro), synchronisation réelle (42 annonces), photos de ses articles (maillot Yamaha, sweat Tommy, Casio avec une main, short Quiksilver…), annonces Vinted réelles de la republication | décision 5 : uniquement « Camille ». Les fichiers de Nico (`public/articles`, `public/ecrans`, `music.wav`) **ne sont même pas copiés** dans le dossier de rendu (`preparer.mjs`) ; les quatre fichiers de scènes et de données sont **réécrits** (aucune ligne d'origine portée dans le dépôt, § 7) |
| « Avec Pro ou Business, au créneau que tu choisis » | décision 2 : jamais de palier à côté de l'automatique |
| Initiales neutres V · L · E · B | décision 4 : logos tels que l'app les dessine (`LOGOS_TIERS = true`) |
| Accroche de 5 s + scène « marque » de 4 s, scènes « Synchroniser » + « import/fusion » + « Mon stock » (17 s) | rythme : accroche lisible à l'image 0 ; la synchronisation garde 4,5 s, en fin de film |
| Musique | la vidéo est muette (aucune piste dans aucun fichier ; aucune musique générée) |

Cloud, « Bientôt », « prochaines plateformes », Opla : absents (ils l'étaient déjà dans la variante
précédente ; contrôlé de nouveau, § 4).

## 4. Contrôles de conformité

- **Opla** : aucun texte, aucun logo, aucune image (sources : 0 occurrence hors commentaires ; les
  découpes viennent des captures « Camille », contrôlées sans Opla par `site-capture.mjs`).
- **Cloud, « bientôt », plateformes futures** : aucune occurrence.
- **Paliers** (Pro, Premium, Business, « gratuit » à côté de l'automatique) : aucune occurrence. Le seul
  « gratuit » : « Commencer gratuitement » (CTA, F58) et « Gratuit et sans limite » sur la
  synchronisation (F33, permis § 15).
- **Quotas, plafonds** : aucun chiffre (ni annonces par mois, ni republications, ni lot).
- **eBay** : jamais dans la scène « Remonter » (ni nom, ni logo : `REPUB_AUTO` filtre eBay en dur, les
  annonces de la scène n'affichent que les logos de `REPUB_AUTO`).
- **Lexique § 15** : ni « bot », « robot », « temps réel », « 100 % », « zéro risque », « publié partout
  en même temps », « illimité », « partenaire officiel », « garanti » (recherche sur toutes les sources :
  seuls des pourcentages CSS ressortent). La publication est montrée **une plateforme après l'autre** (F28).
- **Ventes** : la vente de l'histoire a lieu **sur Vinted** (vente enregistrée seule, F43) ; aucune vente
  Depop « enregistrée toute seule » n'est affirmée (P3 non prouvée). Les 8 ventes Depop du mois de Camille
  sont des chiffres de démonstration, sans dire comment elles ont été enregistrées.
- **Chiffres** : tous ceux de `captures.json` (`chiffres_du_compte`) et des captures ; « Compte de
  démonstration · chiffres fictifs » à l'écran pendant toute la scène chiffrée, « Données de
  démonstration. » à la fin ; jamais « résultats de nos clients », aucune promesse de gains.
- **Mention de non-affiliation** à la fin (texte § 16.1 raccourci, cinq plateformes nommées).
- **Libellés de l'app** reproduits : vérifiés présents dans le code du worktree (« Publier sur {n}
  plateforme{s} » `translations.js:313`, « Publication lancée » `EcranSuivi.jsx`, « En file… » / « Dépôt
  en cours… » / « De retour en tête » `barresJobs.js`, « Active sur » `Haut.jsx`, « Oui, la retirer »
  `EcranDoublons.jsx`, « Résultat du scan » `LensTab.jsx`, « Lu sur l'objet » `LensIdentite.jsx`, « prix de
  vente conseillé » `AnalyseMarche.jsx`, « On gère le reste » `translations.js`, « Commencer gratuitement »
  `LandingPage.jsx`).
- **Logo Depop** : copie conforme de `src/components/platform-logos/DepopIcon.jsx` (rouge `#FF2300`, mot
  « depop » blanc, Arial 700, mêmes coordonnées) ; Vinted, eBay, Leboncoin, Beebs : les fichiers d'origine
  de la vidéo, identiques octet pour octet aux sources de l'app pour Leboncoin et Beebs
  (`platform-logos/source/*.png`, md5 comparés), glyphes `simple-icons` de l'app sur socle blanc pour Vinted
  et eBay.

## 5. À valider par Nico (avant toute mise en ligne)

1. **D2 — republication automatique Depop** : non active au 09/10 (§ 2). Version A par défaut ; si elle
   n'est pas active au GO → `video-json.mjs B` + `plateformes.yml`.
2. **D1 — Depop ouverte à tous** au moment de la mise en ligne (`depop_ouvert` à 0 au 09/10), extension
   avec Depop servie par le Chrome Web Store (0.6.104 servie ne l'a pas), OTA ≥ 2.9.68. Sans D1, la vidéo
   entière ne peut pas partir (Depop y est partout) : elle n'a pas de version « quatre plateformes ».
3. **P1 — palier de l'automatique** : le code la réserve encore à Pro et Business ; la vidéo ne dit
   aucun palier (décision 2) — à aligner côté app avant la mise en ligne, comme pour les pages.
4. **Le ton** : « Une photo. Cinq plateformes. Sans un copier-coller. », « Une seule app. », « Vendu ici,
   retiré là-bas », « Elle remonte toute seule », « Le mois de Camille ». Aucun concurrent n'est nommé dans
   la vidéo (un comparatif nommé exige la date et la source à l'écran : il reste pour les pages).
5. **L'écran Lens** est reconstruit (thème, libellés et mise en page de l'app, capture
   `lens-analyse-photo.png`), pas filmé : la photo du sweat est un vrai article de démonstration, le
   résultat (marque « Pepe Jeans » lue sur le logo, 38 €, 6 annonces 32-45 €) est écrit pour la démo.
   Idem « Où publier ? », « Publication lancée », « Remonter » : reconstruits avec les libellés réels.
   Les trois écrans chiffrés du « mois de Camille » sont, eux, des **découpes des vraies captures**.
6. **Marge « +27,00 € (+71 %) »** : calculée sur le prix d'achat de démonstration (11 €) ; l'encart
   « Excellent » n'apparaît dans l'app que si un prix d'achat est saisi.
7. **eBay publié dans « Publication lancée »** : montré comme les autres ; pour un compte eBay relié,
   l'app publie par l'API d'eBay (l'écran ne dit pas qui dépose : rien de faux).
8. **Affiche** : image 150 (5,0 s) — icône, « FillSell », les cinq pastilles, « Une seule app. »
   (identique en A et B).
9. **JSON-LD** : `uploadDate`, URL absolues à remplir à la mise en ligne ; durée `PT53.5S` (si un
   validateur refuse la décimale : `PT54S`).
10. **Textes du site autour de la vidéo** (`site/gabarits/textes.mjs`, non touchés ici) :
    `videoChapo` dit « de la synchronisation à la vente » — la vidéo va maintenant de la photo au mois de
    Camille, la synchronisation est à la fin ; à ajuster par le chantier des pages si Nico le souhaite.
    Le build reprend le titre, la transcription et le JSON-LD de `video.json`.

## 6. Fichiers produits

Tous à 720×1280, 30 i/s, **53,500 s (1 605 images)**, **sans piste audio**, image clé toutes les 5 s.

| Fichier (`site/medias/video/`) | Version A (servie) | Version B (`version-b/`, mêmes noms) | Codage |
|---|---|---|---|
| `fillsell-presentation.mp4` | **4 009 563 o** (≈ 600 kb/s) | 4 012 321 o | H.264 High niveau 3.1 (`avc1.64001F`), yuv420p, x264 `veryslow` `tune animation` CRF 21, **faststart** (`ftyp > moov > free > mdat`, lu octet par octet) |
| `fillsell-presentation.webm` | **2 535 382 o** (≈ 379 kb/s) | 2 529 428 o | VP9 profil 0, deux passes, CRF 33 |
| `fillsell-presentation-av1.webm` | **1 657 358 o** (≈ 248 kb/s) | 1 651 885 o | AV1 profil 0 (Main), niveau 3.1 (`av01.0.05M.08`, `seq_level_idx` 5 lu), 8 bits, libaom CRF 34 `cpu-used 5` |
| `fillsell-presentation-poster.webp` | 720×1280, 21 036 o | identique (même image) | image 150, rendue par Remotion à 720×1280 (pas de mise à l'échelle), WebP q82 |
| `fillsell-presentation-poster-360.webp` | 360×640, 8 866 o | identique | même image, rendue à 360×640 |
| `video.json` | **version A** | — (`video-json.mjs B` pour basculer) | titres FR/EN, description FR/EN, `aria-label` FR/EN, **transcription FR (37 lignes) + traduction EN**, 8 chapitres FR/EN, JSON-LD `VideoObject` (URL et date à remplir), conditions de mise en ligne ; poids et durées **lus sur les fichiers** |

Chaque fichier vidéo tient seul sous 6 Mo ; le visiteur n'en télécharge qu'un, au clic (`preload="none"`) ;
ordre des sources : AV1, VP9, MP4 (`build-site.mjs` les trie ainsi). CRF 19 a été essayé pour le MP4
(5 291 338 o) : aucune différence visible sur un recadrage de texte fin (carte « Ventes par plateforme ») —
CRF 21 gardé, plus léger.

Dans `docs/seo/briefs/video-variante-site/` :

| Fichier | Rôle |
|---|---|
| `preparer.mjs` | crée le dossier de rendu : copie (lecture seule) `src`, `scripts`, `package.json`, polices et logos de `fillsell-video` — **jamais** ses photos, captures ni musique —, pose les quatre fichiers réécrits, les six photos libres de Camille (`public/landing/*.webp`) et les trois découpes des captures « Camille » (sharp) |
| `src/data.ts`, `src/scenesA.tsx`, `src/scenesB.tsx`, `src/scenesC.tsx` | scènes et données réécrites (compte « Camille », `REPUB_AUTO`) |
| `variante-site.patch` | correctif de `src/ui.tsx` (logos de l'app + Depop dessinée comme `DepopIcon`, `LOGOS_TIERS = true`, cinq étapes, fondus de 6 images, scène sans fondu d'entrée / de sortie, légendes à taille variable) |
| `rendu.cjs` | rendu Remotion, version `A` ou `B` (images fixes, affiche, master 1080×1920 sans son), node_modules de `fillsell-video` **en lecture**, cache webpack coupé, Chrome Headless déjà présent |
| `encoder.sh` | MP4, VP9 (2 passes), AV1 et affiches WebP à partir du master |
| `video-json.mjs` | écrit `video.json` pour A ou B (le geste unique de la vidéo) |

Hors site (scratchpad de la session, éphémère) : masters 1080×1920 sans son `master-A.mp4`
(46 718 787 o) et `master-B.mp4` (46 638 002 o), H.264 CRF 10.

## 7. Méthode et reproduction

1. `node docs/seo/briefs/video-variante-site/preparer.mjs <dossier>` (dossier vide, jamais dans
   `fillsell-video`) ;
2. dans `<dossier>` : `patch -p1 < <worktree>/docs/seo/briefs/video-variante-site/variante-site.patch` ;
3. `node rendu.cjs <dossier> A video <master-A.mp4> 10` (≈ 4 min, 16 cœurs) — idem `B` ;
   affiche : `node rendu.cjs <dossier> A poster <poster-720.png> 150 0.6667`, puis `0.3333` ;
4. `bash encoder.sh <master-A.mp4> site/medias/video <poster-720.png> <poster-360.png> <travail>` ;
   pour B, sortie `site/medias/video/version-b` (A et B en parallèle : ≈ 22 min, l'AV1 domine) ;
5. `node docs/seo/briefs/video-variante-site/video-json.mjs A` (ou `B`).

Reproduction **vérifiée** : un dossier neuf fait par `preparer.mjs` + le correctif redonne, fichier pour
fichier, `src/` et `public/` du dossier qui a servi au rendu (`diff -r` : identiques).

Pourquoi le correctif ne porte que `ui.tsx` : `data.ts` et les trois fichiers de scènes sont réécrits en
entier ; un correctif aurait recopié dans le dépôt, en lignes retirées, les données du compte de Nico
(identifiant de compte, titres, numéros d'annonces) — ils sont donc livrés entiers dans `src/`.

## 8. Vérifications faites

- **Lecture complète** : les six fichiers vidéo (A et B × MP4, VP9, AV1) décodés de bout en bout par le
  ffmpeg de Remotion (`-xerror`, sortie `rawvideo` vers `null`) : code 0, **aucune erreur, 1 605 images
  chacun** ; ffprobe : 53,500 s, un seul flux (vidéo), 720×1280, 30/1, yuv420p, profils et niveaux
  ci-dessus. (Un premier essai avec la sortie `null` par défaut échoue sur l'**encodeur**
  `wrapped_avframe` absent de ce ffmpeg minimal, pas sur le décodage — refait avec `rawvideo`.)
- **Faststart** : `moov` avant `mdat` dans les deux MP4.
- **Planche contact** du MP4 web final (A) : **40 images**, une toutes les 2 s de 0 à 53,4 s plus 0,5 /
  1 / 1,5 / 3 / 5 / 17 / 21 / 25 / 27 / 29,4 / 35 / 41 s, relues à l'œil ; version B : 21, 23 et 25 s.
  - **Accroche à 0–2 s** : « Une photo. » + la photo dès l'image 0 ; « Cinq plateformes. » et le logo
    Vinted à 0,5 s ; les cinq logos à 1 s ; Ctrl + C / Ctrl + V à 1,5 s ; « Sans un copier-coller. » à 2 s.
  - **Depop, nom et logo** : publication (14 s « Où publier ? » ; 16-18 s « Publication lancée »),
    retrait des copies (29,4-32 s, carte Depop « RETIRÉE ✓ » + légende), ventes (38 s, « Depop · 322,00 € ·
    8 ventes », ligne soulignée ; 41-42 s « sur Vinted, Depop et eBay »), synchronisation (44-46 s), fin.
  - **Republication automatique** (21-25 s) : A « Active sur Vinted, Leboncoin, Beebs et Depop » ; B « …
    Leboncoin et Beebs », aucun logo Depop dans la scène ; **jamais eBay**.
  - **Aucune donnée de Nico** (aucun de ses articles, chiffres, captures), **aucun Opla**, aucun Cloud,
    aucun palier, aucun chiffre de quota.
  - Les images vides à 20, 26 et 34 s sont les fondus entre scènes (6 images de chaque côté), pas des
    trous ; la dernière image (53,4 s) garde l'appel à l'action.
- **`video.json`** : les règles de lecture de `scripts/site/build-site.mjs` (§ vidéo : sources triées
  AV1/VP9/MP4, MP4 présent, affiche la plus large présente, transcription FR et EN) rejouées sur A et sur B :
  conformes. Le build complet du site n'a **pas** été lancé (il écrit dans `build/site-apercu/`, que
  d'autres terminaux utilisent).
- **Sources** : recherche des mots bannis et des données de Nico (Opla, Cloud, bot, robot, temps réel,
  100 %, zéro risque, en même temps, illimité, Pro, Business, Premium, par mois, par jour, jusqu'à,
  bientôt, partenaire, officiel, garanti, 646, 235 ventes, 5 423, aspirateur, Casio, Yamaha, Tommy,
  Quiksilver, identifiant de compte) : seules des valeurs CSS en `%` ressortent.
- **`fillsell-video` intact** (vérifié à la fin, 19:45) : md5 de `SORTIE/FillSell-video-finale.mp4`
  (`c1ca26e12b8cf8eb47df5bae8706bf18`) et de `public/music.wav` (`6e5f5313178d583d8c3f277e6c6de9fb`)
  identiques avant/après ; listing horodaté de `node_modules/.cache` et `node_modules/.remotion` identique ;
  aucun fichier du projet plus récent que le début du travail (18:40). Dossier principal
  `C:\Users\nicol\fill-and-sell` : propre (`git status` vide), seulement lu par `git grep` / `git log`.

## 9. Ce que je n'ai pas pu vérifier

- Lecture dans de vrais navigateurs (Safari macOS/iOS, Chrome Android) : non testée (décodage complet
  par ffmpeg seulement, § 8).
- La republication automatique Depop, Depop ouverte à tous, le palier de l'automatique : lus dans le
  code, **jamais en base** (SQL interdit) — `coin_config` fait foi le jour J.
- Les 1 605 images n'ont pas toutes été vues : planches à une image toutes les 2 s (et 4 images de 0 à
  2 s) du master A, images clés comparées A/B, 40 images fixes de mise au point.

## 10. Historique

- **09/10, 15:40–16:30** — première variante « site » de l'original (80,5 s → 71,5 s) : Cloud et
  « prochaines plateformes » retirés, textes corrigés, initiales neutres, données du compte de Nico.
- **09/10, 18:40–19:50** — **refaite** selon les décisions de Nico du 09/10 : compte « Camille »,
  cinq plateformes dont Depop, logos de l'app, accroche à l'image 0, 53,5 s, aucun palier ni quota,
  versions A/B de la republication automatique Depop (non active : B prête).
