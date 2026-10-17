# Session de nuit sans Nico — 18/10 (5 points) — RAPPORT

Heures de Paris. Ordre de travail : 1, 5, 3, 2, 4. Chaque point dit FAIT ET PROUVÉ, FAIT À PROUVER ou PAS FAIT, avec
la preuve ou la raison. Selftests de départ (17/10 23:40) : **345 / 346** (seul rouge : `vinted-origine`, d'avant).

## RÉSUMÉ (à lire en premier)
| Point | Statut | En une ligne |
|---|---|---|
| 1. Mémoire compte × catégorie | **FAIT, À PROUVER — livré ÉTEINT** | Mécanisme, table (RLS) et réglages faits ; seuls les champs « public du rayon » sont retenus (mesuré). Preuve réelle impossible : la rédaction IA remplit déjà l'Univers de Mode, et ces champs n'ont été demandés qu'UNE fois depuis le 12/10 → **0 question évitable aujourd'hui**. |
| 5. Cache et regroupement IA | **FAIT ET PROUVÉ** (cache, partage) ; regroupement **NON activé** | Haiku 4.5 partout ; catégorie = 92 % du coût de déduction ; 26 % des appels étaient des jumeaux payés deux fois. Partage dans l'app + cache serveur des catégories allumés : **−69 % d'appels de catégorie** (estimé). Regroupement des aspects eBay : −13 % de coût mais qualité en baisse sur 91 vrais articles → éteint. |
| 3. Ventes Beebs | **FAIT (enquête prouvée)**, pas de correctif | 0 vente Beebs jamais détectée seule (le veilleur ne PEUT pas dire « vendu ») ; 12 ventes Beebs confirmées au clic, dont 6 rangées « Ailleurs » depuis le 02/10. Trois correctifs proposés. |
| 2. Preuve Leboncoin « Marque : Paris 2024 » | **PAS FAIT** ; retrait Depop **PROUVÉ** | L'annonce est encore « En cours de vérification » chez Leboncoin ; son dépôt date d'avant le correctif ; l'app interdit à juste titre republication et retrait. Depop : 404 relu. |
| 4. Les deux rouges anciens | **FAIT ET PROUVÉ** | Lint : ne plante plus (il lisait les copies minifiées android/ios/build). `vinted-origine` : vert à la racine, test intact → extension **0.6.125**. |

**Chiffres** : questions évitées par la mémoire : 0 sur les 6 derniers jours (68 sur la fenêtre de 7 j, mais presque toutes d'un lot
du 11/10 d'avant le correctif A10) · coût IA par article : 0,0129 $ → ≈ 0,0104 $ (déduction 0,0049 $ → ≈ 0,0019 $) ·
qualité : partage et cache identiques par construction (cache : 110 / 110 champs identiques, 0 appel) ; regroupement :
67,5 % de valeurs justes contre 71,3 % → refusé.
**Livraison** : un seul zip à téléverser, `build\CWS-0.6.125-A-TELEVERSER\fillsell-extension-0.6.125-9d11d42-cws.zip` (aucune
permission nouvelle) · web 9d11d42 servi · OTA **2.9.100** · selftests **345/346 → 350/350**.
**Reste à Nico** : téléverser le zip. Rien d'autre n'est à faire ; trois décisions l'attendent, sans urgence (fin du rapport).

## POINT 1 — MÉMOIRE COMPTE × CATÉGORIE — FAIT, À PROUVER (livré derrière un interrupteur ÉTEINT)

### En clair
- Le mécanisme est fait, testé (selftest 60/60) et sa table est en prod (essai à blanc 8/8, appliquée à 00:06).
- La preuve réelle demandée (A demandé → réponse → B rempli sans question → publié) **n'a pas pu être faite** : sur le
  compte de Nico, la rédaction IA remplit déjà l'Univers de Mode (« Homme » posé sur un T-shirt sans genre, carte
  Leboncoin « Déjà rempli »), donc la question n'apparaît pas ; la carte ne permet pas de vider l'Univers. Essai fait à
  00:20 sur deux fiches d'essai (999 €), quitté avant publication, fiches retirées ensuite (0 job, 0 annonce). Une
  rédaction a consommé 1 annonce du quota de Nico (66 → 65).
- Donc, règle de la nuit : **livré ÉTEINT**. Interrupteur fail-closed : `profiles.beta_flags.memoire_categorie` (un
  compte) puis `coin_config.memoire_categorie_ouverte` (tous). Éteint = rien lu, rien posé, rien retenu, section Réglages
  masquée. Pour l'allumer chez Nico seul : `update profiles set beta_flags = coalesce(beta_flags,'{}'::jsonb) ||
  '{"memoire_categorie":true}'::jsonb where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';`
- **Le chiffre qui compte** : depuis le correctif A10 du 11/10 au soir, les champs retenus n'ont été demandés qu'UNE
  fois (Mode, 0 réponse antérieure) : **0 question évitée sur 6 jours**. Les 68 « évitées » de la fenêtre de 7 jours
  viennent presque toutes d'UN lot du 11/10 au matin (compte faf5021a, 71 questions), avant ce correctif. Les questions
  qui restent (Décoration 18, Livres 6, Sport 3) portent sur des FAMILLES D'OBJETS, où la mémoire se tromperait une fois
  sur trois : le bon levier y est la déduction par le texte (« Déco » ≠ « Décoration », audit du lot 3), pas la mémoire.

### La règle
Quand la personne répond ELLE-MÊME à un champ requis qui dépend du RAYON, l'app retient sa réponse pour
utilisateur × compte plateforme × plateforme × catégorie cible × champ (table `memoire_champs_categorie`, RLS) et la
repose seule sur le prochain article du même rayon. Code : `src/publication/moteur/memoireCategorie.js` (règle pure),
`src/utils/memoireChamps.js` (lecture une fois par compte, écriture au clic Publier), écran Publier, questions, lot,
Réglages › Préférences (`src/reglages/MemoireRayons.jsx`). Selftest `memoire-categorie` (54).

Gardes : champ VIDE et REQUIS seulement ; APRÈS la fiche (genre, catégorie Vinted, taille enfant, mot du titre), le
texte et Lens (la mémoire ne joue que si rien de l'article ne décide) ; valeur dans la grille d'aujourd'hui, sinon
ignorée et la question revient ; un titre ou une description qui nomme un AUTRE public la fait taire ; seule une
réponse de la personne (un CHOIX dans la liste) est retenue, au clic Publier, pour les plateformes réellement
envoyées ; une nouvelle réponse remplace l'ancienne ; aucune ligne inchangée réécrite. Visible : la valeur posée
s'affiche dans les questions (« Repris de ta dernière réponse pour « Mode > Vêtements » ») et dans le lot (une carte
par groupe), modifiable d'un geste ; Réglages › Préférences liste les réponses retenues, « Oublier », « Tout oublier ».

`compte` : la boutique quand FillSell la connaît (Vinted multi-boutiques) ; « principal » ailleurs — l'app ne connaît
aucun identifiant de compte Leboncoin ni eBay (un compte connecté par plateforme et par utilisateur).

### La liste exacte des champs, et pourquoi
Mesure : rejeu de toutes les réponses « complete » (usage_logs `champ_requis_bloquant`) sur 60 jours, valeur lue sur le
job publié ; « juste » = la réponse précédente du MÊME compte sur le MÊME rayon était la bonne.

| Plateforme · champ | Ce qu'il dit | Rejeu (juste / rempli) | Verdict |
|---|---|---|---|
| Leboncoin Univers `clothing_type` (Mode > Vêtements : Femme / Maternité / Homme / Enfant) | le public du rayon | 59 / 59 (synonymes Fille/Garçon → Enfant comme au service) | **RETENU** |
| Leboncoin Univers `shoe_type` (Mode > Chaussures) | le public du rayon | 2 / 2 | **RETENU** |
| Leboncoin Univers `accessories_univers` (accessoires, montres et bijoux : Femme / Homme / Enfant / Mixte) | le public du rayon | — (même liste de publics) | **RETENU** |
| eBay Département | le public ; la catégorie eBay est déjà genrée | même valeur sur 97,2 % des articles d'un compte × catégorie (71 articles) | **RETENU** |
| Leboncoin Univers `house_and_garden_type` (Décoration, Arts de la table) | une famille d'OBJETS | 11 / 16 | exclu |
| Leboncoin Produit (`decoration_type`, `*_product`…) | l'objet | 8 / 16 | exclu |
| Leboncoin Genre `leisure_book_genre`, `dvd_movies_style` | le contenu du livre / du film | 0 / 5 | exclu |
| Leboncoin Genre `baby_clothing_universe` (Fille / Garçon / Mixte) | l'enfant de CET article | majorité 50 % | exclu |
| Leboncoin Type (`*_type`, `furniture_category`…), Support (DVD / Blu-ray) | l'objet | majorité 67-85 % | exclu |
| Beebs Âge | l'âge de l'enfant pour cet article | 1 / 2 | exclu |
| Taille, pointure, marque, état, couleur, matière, ISBN, poids, dimensions, colis, prix, titre, description | l'ARTICLE | — | exclus par principe |

La base refuse tout autre champ (CHECK `memoire_champs_categorie_champ_du_rayon`) ; le module se tait aussi si la liste
d'un champ retenu cesse d'être une liste de publics. Ajouter un champ = décision de Nico + migration.

### Mesure « avant » (7 jours au 17/10 23:59 — voir « Le chiffre qui compte » plus haut)
- `champs_requis_veille()` : 413 questions affichées en 7 j (606 la semaine d'avant) ; Univers Leboncoin 103.
- Questions qui auraient été évitées par la mémoire (rejeu, mémoire = réponse précédente du compte sur le rayon) :
  **69 sur 76** questions des champs retenus (Univers Mode > Vêtements 68 / 73, Chaussures 1 / 3), **0 remplie à tort** ;
  soit 69 / 413 = 17 % de toutes les questions de la semaine. eBay Département : 0 affichage en 7 j (3 « bloqué au clic »).
- Si l'Univers / Produit de Décoration avaient été retenus : 13 remplissages faux sur 32 — c'est pourquoi ils ne le sont pas.
- Mesure « après » : `usage_logs` feature `memoire_categorie` (issues `appliquee`, `modifiee`, `retenue`) et
  `champs_requis_veille()` — à relire vers le 25/10.

### Base
Migration `20261018030000_memoire_champs_categorie.sql` (inverse `supabase/rollbacks/…`). Essai à blanc (transaction
annulée) : 8 contrôles sur 8 — insertion, horodatage serveur, remplacement, champ `taille` refusé par la base, ligne
d'un autre compte refusée (RLS), un autre compte ne voit ni n'efface rien, le propriétaire vide sa mémoire, anon exclu.
**Appliquée le 18/10 à 00:06**, historique réparé (`applied`), table + RLS + 4 règles relues en prod.

## POINT 5 — CACHE ET REGROUPEMENT DES APPELS IA — FAIT ET PROUVÉ (partage + cache des catégories) ; regroupement NON activé (qualité en baisse)

### Les faits (7 jours au 17/10 23:50)
- Fournisseur et modèle : **Anthropic, `claude-haiku-4-5-20251001`** pour toute la déduction (catégorie, aspects eBay,
  champs Leboncoin, couleur, ISBN, genre). OpenAI ne sert qu'à la retouche photo (pas une déduction de champ).
- Appels : `resolve-categorie` 3 179 appels (63 comptes, 3,95 $) — 3,64 par article en moyenne (médiane 1, p90 8) ;
  rédaction `generate_listing` 2,36 appels par génération (9,32 $, classification comprise) ; aspects eBay 1,59 appel par
  demande (une 1re passe + un appel par aspect resté vide) ; seconde passe Leboncoin 1 par lot de champs.
- Coût : déduction ≈ 4,3 $ / 7 j, dont `resolve-categorie` ≈ 92 %. Par article qui a de l'IA (702) : **0,0129 $** en moyenne
  (médiane 0,0101 $) ; déduction seule : **0,0049 $** en moyenne (médiane 0,0017 $).
- Trou mesuré : **839 appels de catégorie sur 3 179 (26 %) sont un jumeau exact** (même compte, mêmes jetons, < 2 s) — la
  même question partie deux fois en parallèle et payée deux fois ; **1 752 (55 %)** reprennent une question identique du
  même compte posée < 10 min avant ; 447 de plus (14 %) entre 10 min et 30 jours. Aucun cache nulle part (sauf Lens).

### Ce qui est livré
1. **Partage dans l'app — ACTIVÉ** (`src/utils/questionCategorie.js`) : toute question à `resolve-categorie` passe par là ;
   une question identique EN VOL est partagée, une réponse de moins de 10 min est rendue telle quelle ; jamais une erreur,
   un 429 ni « ia_indisponible ». Même réponse par construction (même corps → même réponse du serveur). Selftest
   `question-categorie` (12). Effet attendu : −1 752 appels / 7 j, −2,05 $.
2. **Cache serveur** (`_shared/claude-cache.ts`, table `ia_questions_cache`, migration 20261018040000 appliquée à 00:36, RLS,
   service_role seul) : empreinte sha256 exacte de la question (modèle, consigne, message = contenu de l'article, plateforme,
   liste des champs ou candidates) → l'article change, la question change ; 30 jours ; mêmes contrôles sur le texte relu ;
   une relecture n'est ni payée ni comptée dans le plafond (ligne `resolve_categorie_cache` à 0 $). Interrupteurs par
   fonction : `ia_cache_categorie` (voir la livraison plus bas), `ia_cache_aspects` = 0 (gain négligeable : 4,5 % de
   répétitions sur ≈ 0,21 $ / 7 j, et ce chemin n'a pas de température fixée). Selftest `claude-cache` (20).
3. **Regroupement des aspects eBay en UN appel** (`completerAspectsIAGroupe`) — **ÉTEINT** (`ia_aspects_groupes = 0`) : banc
   sur 91 vrais articles (`point5-banc.md`) : −13 % de coût par article mais 85,7 % de champs remplis contre 91,8 %, 67,5 %
   justes contre 71,3 %, accord 81,7 % contre 96,1 % de bruit. Cause : le défaut connu du cas Manon (un mot du titre n'est
   pas réutilisé pour deux aspects). L'ancien chemin reste. `generate-listing` n'est PAS redéployé (v117 inchangée) : ses
   deux interrupteurs sont éteints, et le redéployer embarquerait par ricochet six jours de changements d'autres lots
   (`etat-job.js` via `src/utils/shared.js`) pour un effet nul.

### Coût par article avant / après (estimation par rejeu des 7 jours ; mesure réelle à relire vers le 25/10)
| | Avant | Après (partage + cache catégorie) |
|---|---|---|
| Appels `resolve-categorie` / 7 j | 3 179 | ≈ 980 (−69 %) |
| Déduction / 7 j | ≈ 4,3 $ | ≈ 1,7 $ (−61 %) |
| Déduction par article (moyenne) | 0,0049 $ | ≈ 0,0019 $ |
| IA totale par article (moyenne) | 0,0129 $ | ≈ 0,0104 $ (−19 %) |
| Qualité | — | identique par construction (même question → même réponse) ; cache prouvé 110 / 110 champs identiques, 0 appel |
Relecture : `select date_trunc('day', created_at at time zone 'Europe/Paris') j, feature, count(*) from usage_logs where feature
in ('resolve_categorie','resolve_categorie_cache') and created_at > now() - interval '14 days' group by 1,2 order by 1;`

## POINT 3 — VENTES BEEBS — FAIT (enquête prouvée) ; correctif NON codé (aucun n'est prouvable sans vraie vente)

Requêtes en lecture seule le 17/10 vers 23:50 et le 18/10 vers 00:10 ; rien écrit, rien vendu, rien retiré.

### Une vente Beebs a-t-elle déjà été relevée ? — détection automatique : JAMAIS ; ventes confirmées au clic : OUI
- **0 job Beebs** avec `sale_signal = 'sold'`, **0** avec `sale_evidence`, 0 avec `detected_price` (4 411 jobs Beebs).
- **12 annonces Beebs confirmées vendues PAR LA PERSONNE** (réponse « Oui » à « Plus en ligne, vendue ? ») :
  - 5 avant le 28/09, écrites `beebs` (ventes 1899, 1900, 2012, 4169, 11912 ; comptes f44b5917 et f8aa02a5) ;
  - **6 depuis le 02/10, écrites « Ailleurs »** (`plateforme_code = 'ailleurs'`, `annonce_id` = le numéro Beebs) :
    ventes 77407, 87308, 94454, 125115, 142259, 158347 (5 comptes, 02/10 → 14/10) — invisibles comme ventes Beebs ;
  - 1 job vendu sans ligne de vente (a064c8ef, 25/09) et 1 vente `beebs` sans job (47571, saisie à la main ?) : **à vérifier**.
- Pourquoi « Ailleurs » : en prod, `enregistrer_vente_atomique` (md5 cf93c3b6…) écrit
  `CASE WHEN v_proof THEN j.platform ELSE 'ailleurs' END` avec `v_proof := sale_signal = 'sold'` — règle née le 28/09
  (`20260928111221_point_b_vente_atomique.sql`). Sans preuve, la plateforme déclarée n'est pas gardée.

### Le veilleur Beebs tourne-t-il, que relève-t-il ? — OUI, mais il ne peut pas dire « vendu »
- Il tourne : 2 933 annonces Beebs publiées (62 comptes) ; **766 relues en 24 h, 2 007 en 7 j (34 comptes)**, dernière lecture
  le 17/10 à 23:52 ; 196 relevés « Mes annonces » terminés en 7 j (38 comptes).
- Il lit la page PUBLIQUE de l'annonce (`chrome-extension/background.js` `detectBeebsState`, ~l. 10467) : `AVAILABLE` → en
  ligne, toute autre valeur → « indisponible », champ absent → inconnu. **Il ne rend JAMAIS « vendu »** — le code le dit :
  la valeur d'une vente réelle n'a jamais été observée (inchangé depuis le 12/07). Deux lectures « indisponible » posent
  `sale_signal = 'unavailable'` (177 jobs : 116 « je l'ai retirée moi-même », 48 questions encore ouvertes, 12 vendus).
- Aucune autre voie ne couvre Beebs : relevé des ventes (vinted, leboncoin, opla, depop), veille des commandes (vinted,
  leboncoin), `enregistrer_ventes_relevees` (refuse beebs), `ventes_prouvees_tick` (exige `sold` ou une preuve exacte).
  La lecture des commandes Beebs n'existe qu'en bêta messagerie (3 comptes), jamais prouvée : 0 commande écrite.

### Conclusion (prouvé)
Il y a de vraies ventes Beebs chez les utilisateurs (au moins 12 confirmées), et la détection automatique est **cassée par
construction**, pas par un sélecteur : la page publique ne dit jamais « vendu », aucune vente n'est donc jamais prouvée,
et la vente confirmée à la main est rangée « Ailleurs ». Signal sous-exploité : le relevé « Mes annonces » classe une carte
« vendue » (`/vendu|sold/`) — 3 annonces, dont 34080027 vue « vendue » le 01/10, 4 jours avant la question du veilleur ;
mais 33878149 est « vendue » au relevé alors que la page et l'index la montrent en ligne (« invendu » / « soldes »
attrapés par l'expression ? commande en attente ?) : **à vérifier**.

### Correctif — aucun codé cette nuit, trois proposés (décision de Nico)
- **C0 — observation seule (extension)** : écrire dans le diagnostic du relevé le fragment de texte qui a classé une carte
  Beebs « vendue » (`background.js`, classement des cartes, ~l. 15078), aucune décision changée. Non fait cette nuit : la
  fonction injectée sert le relevé de TOUTES les plateformes et n'a pas de selftest d'exécution — risque > gain pour un
  changement fait sans Nico.
- **C2 — la plateforme d'une vente déclarée** : garder `p_plateforme` (Beebs) quand la personne confirme une vente sans
  preuve, sans en faire une preuve (retraits inchangés) ; réparer les 6 ventes « Ailleurs » par script (sauvegarde,
  inverse, 0 mail). Touche la fonction centrale des ventes : décision de Nico, migration à valider.
- **C1 — vraie détection** : `detectBeebsState` rend « vendu » pour LA valeur observée sur une vraie page vendue + preuve
  exacte comme Depop (`ventes_prouvees_tick` l'accepte déjà). Prouvable seulement avec la capture d'une vraie page vendue.

## POINT 4 — LES DEUX ROUGES ANCIENS — FAIT ET PROUVÉ

### `npm run lint` plantait
- **Cause** : `eslint .` n'ignorait que `dist/` et parcourait les copies MINIFIÉES de l'app que Capacitor pose dans
  `android/` et `ios/` (`assets/public`, plusieurs Mo par fichier), plus les paquets et vieilles copies de l'extension dans
  `build/` — des artefacts non suivis par git, jamais du source → mémoire épuisée.
- **Correctif** : `eslint.config.js` ignore `dist`, `android`, `ios`, `build` (rien de suivi par git n'est exclu).
- **Preuve** : `npx eslint .` va au bout en 99 s. Il rend 906 erreurs et 378 avertissements, tous d'avant : surtout
  l'extension, qui n'a pas de bloc de configuration à elle (445 « non défini » dans `background.js` : `importScripts`,
  globales `FILLSELL_*`), `design_extract/` (96), les content scripts (84). Les corriger est un chantier à part (non fait).

### `selftest:vinted-origine` était rouge
- **Cause** : depuis le 16/10, la copie générée `chrome-extension/etat-job.js` (sources `src/utils/publicationState.js`,
  `src/utils/retenueServeur.js`, `_shared/attente-autre-boutique.js`) portait cinq littéraux `vinted.fr` dans son CODE : le
  lien d'une annonce importée et quatre phrases « ouvre-la sur vinted.fr dans Chrome ». La règle du 09/10 (Marta, vendeuse
  italienne) l'interdit dans l'extension : une seule origine Vinted, `chrome-extension/vinted-origine.js`.
- **Correctif à la racine, assertion intacte** : `_shared/lien-vinted.js` porte l'origine (vinted.fr) pour l'app et le
  serveur — textes et liens au caractère près, inchangés ; le générateur `scripts/gen-etat-job-extension.mjs` remplace ce
  module, dans l'extension, par l'origine de `vinted-origine.js` (le domaine du vendeur : une vendeuse italienne lit enfin
  « vinted.it » dans le popup). Copie régénérée.
- **Preuve** : `vinted-origine` 10 cas verts, sans qu'une ligne du selftest ait changé ; nouveau `lien-vinted` (11) ;
  `etat-job`, `attente-boutique`, `file-des-jobs`, `boutique-connectee`, `a-regler-sans-bandeau`, `aucune-estimation` verts.
- **Conséquence** : `chrome-extension/` change → extension **0.6.125** (voir la livraison).

## POINT 2 — PREUVE LEBONCOIN « MARQUE : PARIS 2024 » — PAS FAIT (Leboncoin vérifie encore l'annonce) ; retrait Depop PROUVÉ
- **Leboncoin 3290209516** (compte de Nico, Electrastuff) : la page publique est joignable (relue à 00:56, « hier à
  19:32 », 999 €) avec la description « Article de TEST FillSell, ne pas acheter. T-shirt imprimé homme, taille M, très bon
  état, coloris bleu. » — **sans** « Marque : Paris 2024 ». C'est attendu : ce dépôt a été fait à 19:32 par le build
  `2026-10-17T17:18:57Z+9129f95-dirty`, AVANT le correctif de la garde de description (8f15a6c, 0.6.124) ; il ne peut pas
  prouver ce correctif. Dans « Mes annonces » de Nico, Leboncoin la classe toujours **« En cours de vérification »**
  (relu à 01:00).
- L'app dit la même chose (« Leboncoin vérifie ton annonce ») : sa garde interdit la republication (doublon) et ne propose
  pour le retrait qu'« Oublier » — faux ici, donc pas cliqué. Rien forcé. Synchronisation Leboncoin lancée par le geste
  de l'app à 00:58 (le dernier relevé datait du 17/10 11:27, avant le dépôt) : le relevé de 00:59 voit 3290209516 au
  statut « inconnu » (en vérification) → le lien n'est pas rattaché, comme la règle le veut (`trancher_publications_sans_lien`
  ne rattache qu'une annonce « en ligne »).
- **Depop** : job de retrait 1f339da9 `deleted` (17/10 21:35), page relue à 00:57 : « 404 Page not found ». **Prouvé.**
- Beebs (pour mémoire) : l'annonce 34185769 a été retirée par Beebs ; le job de retrait attend (« pas encore visible »).
- **Reste** : quand Leboncoin aura fini sa vérification, le prochain relevé rattache le lien ; alors retrait par l'app.
  La preuve « Marque : Paris 2024 » sur Leboncoin demande un NOUVEAU dépôt par la 0.6.124 ou plus (republication de cette
  annonce une fois en ligne, puis retrait) — selftest `marques-exactes` (62) en attendant.

## INCIDENTS DE LA NUIT
- **Aucun en prod** (pas d'écran blanc, aucune fonction en erreur). Web relu après chaque push : 5cd453f, 915f92d,
  05113e2, 9d11d42 servis, entrée 200 avec `Origin`, /app rendu, console propre.
- **Évité de justesse** : la carte du lot lisait deux valeurs qu'elle ne recevait pas (`posesDuLot`, `changerPosesDuLot`
  calculées dans le parent) — **`build:essai` était vert**, c'est ESLint sur les fichiers touchés qui l'a vu, avant le
  push. Même classe que la page blanche du lot du 09/10. Leçon : `npx eslint <fichiers touchés>` avant chaque push (le lint
  complet ne plante plus).

## CHOIX PRIS SANS NICO
1. Mémoire : liste réduite aux champs qui disent le PUBLIC du rayon (données à l'appui) ; Univers / Produit de Décoration,
   genres de livres et âge Beebs exclus ; livrée **éteinte** faute de preuve réelle possible.
2. Deux fiches d'essai créées par SQL sur le compte de Nico (999 €), jamais publiées, retirées ensuite (0 job, 0 annonce) ;
   une rédaction IA a consommé 1 annonce de son quota (66 → 65).
3. IA : partage des questions de catégorie dans l'app ACTIVÉ ; cache serveur des catégories ALLUMÉ à 00:49
   (`coin_config.ia_cache_categorie = 1`) après le banc et le contrôle de bout en bout ; cache des aspects éteint (gain
   nul) ; regroupement éteint (qualité) ; `generate-listing` non redéployé ; fonction de banc `ia-banc-deduction` laissée
   en place (lecture seule, secret de cron) pour rejouer la comparaison.
4. Ventes Beebs : aucun code ; trois correctifs proposés (C0, C1, C2).
5. Leboncoin : synchronisation lancée sur le compte de Nico ; ni republication ni « Oublier ».
6. Lint : seuls les artefacts sont ignorés ; les 906 erreurs d'avant ne sont pas traitées.
7. Selftests : contrôles de FORME mis à la nouvelle forme du code, propriété inchangée — `champs-deduits` (2),
   `couleur-auto` (1), `depop-rayon` (1) ; `rayon-refuse` reverdi en changeant MON code, pas le test. `vinted-origine` :
   aucune ligne changée.
8. Copie non empaquetée de l'extension chez Nico non rechargée (elle tourne en 0.6.124 `ced6cfd` ; la 0.6.125 ne change
   que les phrases du popup pour un vendeur étranger).

## LIVRAISON
- **Le seul zip à téléverser** : `C:\Users\nicol\fill-and-sell\build\CWS-0.6.125-A-TELEVERSER\fillsell-extension-0.6.125-9d11d42-cws.zip`
  (BUILD_ID `2026-10-17T23:03:01Z+9d11d42`, 551 Ko) — contient TOUTE la 0.6.124. La 0.6.124 est rangée :
  `build\CWS-PERIMES\PERIME-fillsell-extension-0.6.124-ced6cfd-JAMAIS-TELEVERSE-remplace-par-0.6.125-9d11d42.zip`.
- **Manifest relu** (zip 0.6.125 contre zip 0.6.124) : seule la version change — **aucune permission nouvelle**
  (permissions storage, alarms, scripting, cookies, power ; 8 hôtes obligatoires, 19 optionnels, identiques). Pratiques de
  confidentialité CWS inchangées (mêmes cases que la 0.6.124).
- `EXTENSION_MIN_BUILD` NON relevé (reste `2026-09-30T20:16:41Z`). Après l'acceptation CWS : `"0.6.125"` dans
  `ALREADY_PUBLISHED` (`scripts/package-extension.mjs`) et `EXTENSION_MIN_BUILD = '2026-10-17T23:03:01Z'`.
- **Web** : 9d11d42 servi (`build.json` `2026-10-17T23:03:57Z+9d11d42`, entrée `assets/index-DucCGZYm.js` 200 avec `Origin`,
  /app et Réglages › Préférences rendus, console propre) ; le commit de documentation final ne change pas l'app.
- **OTA 2.9.100** (build `2026-10-17T23:05:32Z+fff63e8`), canal production relu : 2.9.99 → **2.9.100**.
- **Fonctions** : `resolve-categorie` v15 → **v16** (`verify_jwt` false, inchangé) ; `ia-banc-deduction` **v2** (nouvelle,
  false, garde par secret de cron) ; `generate-listing` v117 inchangée.
- **Migrations appliquées** (avec inverse) : `20261018030000_memoire_champs_categorie` (00:06),
  `20261018040000_ia_questions_cache` (00:36).
- **Interrupteurs** : `ia_cache_categorie = 1` ; `ia_cache_aspects = 0` ; `ia_aspects_groupes = 0` ;
  `memoire_categorie_ouverte` absent (= éteint).
- **Selftests** : avant **345 / 346** (rouge : `vinted-origine`) ; après **350 / 350** ; nouveaux : `memoire-categorie` (60),
  `question-categorie` (12), `claude-cache` (20), `lien-vinted` (11).

## CE QUI RESTE À NICO
- **Téléverser le zip 0.6.125** et « Envoyer pour examen ». C'est tout ce qui est à faire.
- Décisions, quand il le voudra (rien ne presse, rien n'est cassé) : allumer la mémoire (chez lui d'abord, une ligne SQL
  plus haut) ; C2 Beebs (vente déclarée rangée « Beebs », 6 ventes à réparer) ; l'annonce Leboncoin d'essai 3290209516
  (999 €, en vérification) — l'app la retirera dès qu'elle sera en ligne, ou à supprimer sur Leboncoin.
