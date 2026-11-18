> Annexe du rapport du lot T2 du 18/11 (docs/enquetes/lot-1811-t2/RAPPORT.md) : enquête de l'agent, copiée telle quelle,
> noms, pseudos et adresses remplacés par l'id8 du compte ou un repère (règle « données de clients »).

# Point 6 (lot du 18/11/2026) — Refus de modération Leboncoin des comptes 020816ba et cfdfda6f

Enquête en lecture seule, le 18/11/2026 au soir, heure de Paris. Je n'ai rien écrit en base, rien modifié dans le dépôt,
lancé aucune commande git d'écriture, aucun déploiement, aucun mail, et je n'ai rien fait sur Leboncoin. Toutes les
requêtes viennent de fichiers propres à ce dossier (`q*.sql`, passés par `-f`). La course sur le `_q.sql` commun ne touche
donc aucune preuve ci-dessous ; seule la toute première requête (liste des colonnes) était polluée, et je l'ai relancée.

## Verdict en 5 lignes

1. **Compte 020816ba : 18 refus sur 18. C'est notre faute, et la cause est un texte mal posé.** Chaque description
   refusée contient un bloc « 🍀 - De temps en temps sur mon profil les mangas suivants : » (ou « les jeux suivants : »),
   suivi d'une liste de 20 à 24 titres d'**autres** produits (Naruto, One piece, Dragon ball…, ou 20 jeux Switch).
   Notre nettoyage le sert tel quel. Les 6 dépôts du même compte qui n'ont pas ce bloc sont en ligne : même session,
   même rayon, même gabarit, dont 4 déposés **entre** deux refus.
2. **Compte cfdfda6f : 5 refus sur 7 relèvent d'une famille déjà connue** (règle du 16/11) : une 2ᵉ annonce du même
   objet sur le **même** compte Leboncoin (23b59b14). Il a changé de compte le 16/11. Le relevé du nouveau compte a créé
   à 10:29 des fiches en double, avec des questions « Est-ce le même article ? » ouvertes. Le lot de 29 publications
   de 20:51 à 21:27 a reposé ces objets. Le client a lui-même répondu « Oui, même article » pour 3 d'entre eux à 22:05,
   après les refus. La garde n'a pas vu le doublon : ce sont les mêmes images (tout ou partie) dans des fichiers
   différents. **2 refus sur 7 restent inexpliqués.**
3. **Règle à corriger (020816ba, preuve forte) :** `supabase/functions/_shared/description-leboncoin.ts`. Une ligne qui
   annonce d'autres articles du vendeur, suivie d'un deux-points et d'une liste de plus de 5 éléments, sort du texte
   **servi**. La fiche n'est jamais touchée.
4. **Mesure sur tout le parc.** Sur 60 jours, 20 dépôts portent ce bloc : 18 refusés, 2 jamais vus en ligne (retirés
   par le vendeur), 0 accepté. La règle ne change aucun des 323 dépôts acceptés qui parlent d'autres articles
   (15 comptes). Sur 14 jours, elle explique 18 des 26 refus « inexpliqués » de la veille.
5. **Compte cfdfda6f :** nos données ne permettent pas de bâtir une règle nouvelle sûre (mesures au § B.3). Seule
   l'extension « empreintes » proposée le 16/11 et jamais faite aurait retenu 1 des 7 (447f3ed2). Il reste un défaut
   de rayon à part : une table à manger rangée en « Arts de la table ».

---

## A. Compte 020816ba (inscrit sur FillSell le 15/11 à 21:03 ; compte Leboncoin ancien, annonces depuis 2023)

### A.1 Ce qui est parti et comment le refus a été su (q2, q6, q7, q38)
- **26 publications FillSell** du 15/11 22:46 au 16/11 00:48, par l'extension 0.6.186 (Chrome).
  - Rayons : Loisirs › Livres (22), Électronique › Jeux vidéo (3), Loisirs › DVD - Films (1).
  - Champs posés : état « Très bon état », « Bande dessinée et manga », poids par défaut « Jusqu'à 100 g » (format Petit),
    ville Nantes 44000.
  - Photos : 4 à 9, rapatriées de Vinted (`rehosted/…`).
  - Le dépôt (adsubmit) répond 201 `created` avec la page « Votre annonce est publiée » pour les 26.
- **Comment on a su le refus.** Les annonces n'apparaissent jamais aux relevés complets de 10:22 et de 13:16. La base
  les marque alors `depot_jamais_en_ligne.issue = refus_moderation_probable` (jugement du 16/11 à 13:16), statut
  `failed`, avec le message « Leboncoin a refusé cette annonce juste après son dépôt… le motif est dans le mail ».
- **Le motif n'est capturé nulle part chez nous** : il est seulement dans le mail de Leboncoin au vendeur.

### A.2 Ce qui sépare refusés et acceptés (tous du même compte, même heure)

| | Bloc « …sur mon profil les X suivants : » + liste | Statut |
|---|---|---|
| 18 dépôts (00:09 → 00:48, sauf 00:19-00:23) | **oui** (24 titres de mangas, ou 20 jeux Switch) | **18 refusés** |
| 2 dépôts (Death note 00:14, La colline 00:45) | oui | jamais vus en ligne, retirés par le vendeur |
| 6 dépôts (15/11 22:46, 22:50 ; 16/11 00:19, 00:20, 00:22, 00:23) | **non** | **6 en ligne** |

Hypothèses écartées une par une, preuves à l'appui :

- **Rayon.** Les deux côtés sont dans le même rayon : 15 refusés et les 6 acceptés en Loisirs › Livres.
- **Rythme ou compte neuf.** Des acceptations tombent au milieu de la rafale (00:19 → 00:23), et le compte Leboncoin
  porte des annonces depuis 2023.
- **Doublon sur le compte.** 1 refusé sur 18 seulement a une jumelle en ligne (Kingdom 1 à 6, même titre, autres photos)
  (q32).
- **Mention de réseau social.** « ig : … » figure dans les 26 textes, acceptés compris.
- **Liens, téléphone, hashtags, titres en majuscules.** Aucun dans les 26 textes.
- **Photos.** Même origine et même nombre des deux côtés.
- **Prix.** Pas de seuil qui sépare les deux groupes.
- **Le texte servi.** Je l'ai rejoué avec le nettoyage d'aujourd'hui (`essai-nettoyage.mjs`) : il est **identique** au
  texte de la fiche, et la liste part chez Leboncoin dans les 20 cas.

**Une réserve honnête.** 95 annonces que ce vendeur a déposées **lui-même** entre le 11/06/2023 et le 16/11/2025 portent
la même liste et sont en ligne (q30). Leboncoin l'acceptait donc encore il y a un an. La dernière annonce en ligne qui
la porte date du 16/11/2025 ; aucune de celles d'après ne la porte, soit une quarantaine de janvier à novembre 2026
(q54). La modération s'est durcie, ou il a retiré la liste lui-même : nos données ne disent pas lequel. La preuve absolue est le texte du mail de refus, ou un essai sur le compte de Nico (§ D).

### A.3 Mesure sur tout le parc (q26, q33, q34, q43 et `mesure-copie.mjs`)
- **60 jours, tous comptes**, dépôts Leboncoin qui annoncent d'autres articles (« sur mon profil / dressing », « mes
  autres annonces / ventes », « je vends aussi », « de temps en temps »…) : 350 textes.
  - La règle proposée en change **20, tous du compte 020816ba** : 18 refusés et 2 jamais en ligne.
  - Elle n'en change **aucun des 323 acceptés** (15 comptes).
  - Elle ne change pas non plus les 2 autres refus : 13e274de (mots-clés de l'article lui-même) et d87570eb.
- **14 jours.** La veille `scripts/lbc-refus-familles.prod.sql` compte 39 refus :
  - inexpliqués 26 (020816ba ×18, cfdfda6f ×6, 48dd94f7 ×1, f175c284 ×1) ;
  - photos 7 (cfdfda6f ×5, f44b5917 ×2, des essais) ;
  - relance 4 (229c7b07) ;
  - mots-clés après la règle 1 (13e274de).
  - **La nouvelle famille « autres articles » explique 18 des 26 inexpliqués.**
  - Taux sur les dépôts jugés : avec le bloc, 18 refus et 0 accepté ; sans le bloc, 25 refus sur environ 4 740 (0,5 %).
- **Les listes de mots-clés sur l'article lui-même ne sont pas en cause.** Elles sont souvent acceptées : 159 dépôts
  acceptés sur 60 jours (21 comptes ; 72 sur 14 jours) ont une ligne de 8 virgules ou plus sans annonce d'autres articles
  (010ff35b, par exemple). Ce
  qui fait refuser, c'est la liste de **noms d'autres produits** : des marques et des licences tierces, ce qui rejoint
  la règle Leboncoin « 5 mots-clés, aucune marque tierce » lue le 10/09.
- **Exposition dans le stock vivant** (fiches non vendues qui annonceraient d'autres articles : 2 089).
  - La règle changerait le texte servi de **734 fiches sur 2 comptes** :
    - 020816ba : 129 fiches (la même liste de mangas) ;
    - 7a0b0d82 : 605 fiches. Son gabarit : « Allez voir mes autres ventes : nombreux articles livres, CD, jeux, jouets,
      déco, maison… », une liste de rayons. Ce compte n'a fait **aucun** dépôt Leboncoin FillSell en 120 jours.
  - Un premier jet touchait aussi 2 fiches de c22c5429 (des liens vers ses autres annonces Leboncoin). Je l'ai corrigé :
    une adresse n'est jamais un élément de liste.

### A.4 La règle à corriger : fichier, ligne, avant et après
**Fichier : `supabase/functions/_shared/description-leboncoin.ts`.** Numéros de ligne de HEAD 86a0297 ; le fichier
n'est pas modifié dans l'arbre.

- **Avant.** `nettoyerSeulement` (l. 501-565) ne retire que :
  - les mentions de sites ;
  - les termes de modération (`supercard`) ;
  - les hashtags (marque tierce, plafond de 5, répétitions) ;
  - les blocs **étiquetés** « Mots-clés : / Keywords : / Tags : » (`blocsMotsCles`, l. 483-499).

  Une liste non étiquetée qui annonce d'autres articles passe telle quelle : le court-circuit de la l. 519 rend le texte
  intact.
- **Après** (diff complet : `(dossier de travail vidé) correctif-description-leboncoin.diff` ; copie corrigée :
  `description-leboncoin.propose.ts`) :
  - après `blocsMotsCles` (l. 499), ajouter `AUTRES_ARTICLES_RE`, `PLAFOND_AUTRES_ARTICLES = 5` et
    `blocsAutresArticles(lignes)`. Le bloc commence par une ligne qui annonce les autres articles **et** porte un
    deux-points suivi d'une liste. La liste est sur la même ligne, ou sur les lignes de liste qui suivent, en sautant les
    lignes vides juste après le deux-points. Une adresse web n'est jamais un élément. Au-delà de 5 éléments, le bloc est
    retenu ;
  - l. 518-519 : `const autres = blocsAutresArticles(lignesOrigine);` puis `&& !autres.lignes.size` dans le
    court-circuit ;
  - l. 527-529 : `if (autres.lignes.has(iLigne)) return null;` en tête du `map` ;
  - l. 560-561 et interface l. 79 : trace `autres_articles: <nombre d'éléments retirés>`.
- **Ce qui ne bouge jamais :**
  - « je vends aussi des livres » sans deux-points ;
  - une phrase après le deux-points (« dans mon dressing : offres bienvenues ») ;
  - la description de l'article lui-même (« le lot contient les tomes suivants : 1, 2, 4… ») ;
  - une liste de 5 éléments ou moins ;
  - un texte conforme, qui ressort à l'octet près.
- **`src/utils/relanceRefusLbc.js` l. 33-34 :** `REGLES_TEXTE_LBC` passe de `"lbc-texte-1311"` à `"lbc-texte-1811"`,
  avec le md5 du nouveau fichier ajouté dans `SOURCES_REGLES_TEXTE_LBC`. Le verrou `selftest:lbc-relance-identique`
  (l. 160-162) l'exige.
- **`supabase/functions/get-pending-jobs/index.ts` l. 12714** (HEAD ; l. 12741 dans l'arbre d'un autre terminal) :
  ajouter `...(r.autres_articles ? { autres_articles: r.autres_articles } : {})` à `description_nettoyage`.
- **Veille `scripts/lbc-refus-familles.prod.sql` :** ajouter une famille `autres_articles` (déclencheur + ligne de
  liste, avant « inexplique ») pour qu'un nouveau cas se voie.
- **Règle écrite :** une section datée du 18/11 dans `docs/regles/plateformes.md`, plus le rapport.

**Après le déploiement.**
- Les 18 refus se relancent avec le texte corrigé. Le juge `refusLbcIdentique` compare le texte servi, qui sera
  différent, et ne les retient donc pas.
- Les 129 autres fiches du compte partent sans le bloc.

### A.5 Le selftest « verrou » proposé : `selftest:lbc-autres-articles`
- Brouillon prêt : `(dossier de travail vidé) lbc-autres-articles-selftest.mjs`, à poser en
  `scripts/lbc-autres-articles-selftest.mjs`.
  - Il suit le style des `scripts/*-selftest.mjs`.
  - Les textes sont anonymisés (ni pseudo ni réseau social), comme l'exige `donnees-clients`.
- **Code d'aujourd'hui : ROUGE**, sortie 1, 6 échecs (`verrou-avant.out`) :
  - la liste de mangas est servie ;
  - la liste de jeux sur la même ligne est servie ;
  - le gabarit « mes autres ventes » est servi ;
  - la trace manque ;
  - la version des règles est inchangée.
- **Copie corrigée : VERT**, sortie 0, 15 contrôles (`verrou-apres.out`). Le contrôle de version, sauté sur la copie,
  passera dans le dépôt une fois `REGLES_TEXTE_LBC` changée.
- **Non-régression sur la copie corrigée :**
  - `selftest:description-leboncoin` : 105 ✓, 0 ✗, comme le dépôt (105) ;
  - `selftest:lbc-cinq-mots-cles` : OK.
  - La suite complète reste à lancer avant le commit.

---

## B. Compte cfdfda6f (Premium + Pro) : 7 refus sur 29 dépôts le 16/11, de 20:51 à 21:27

### B.1 Contexte
- Le 16/11 à 15:22, la réparation « remplacer mon compte » a quitté l'ancien compte bf460991 (108 annonces).
- Le lot 31dc2855 (créé à 20:08, 29 publications servies en un seul passage à 20:50) a reposé ces articles sur le
  nouveau compte **23b59b14**. Les relevés des 24 h précédentes ne voient que ce compte (q16, q17), donc `compteDepot`
  était connu : la garde « même compte » était à seuil 1.
- Ce nouveau compte portait déjà des annonces de certains de ces objets, déposées le 13/11 vers 20:05 et relevées. Le
  relevé du 16/11 à 10:29 a créé pour elles des fiches en double, avec les photos de Leboncoin rapatriées. Les questions
  « Est-ce le même article ? » ont été posées entre 10:29 et 13:28. Le client a répondu « Oui » (fusion) à
  22:05-22:06, **après** les refus (q39), pour les jumelles de 447f3ed2, 880803ce et 8b7391e6 : c'est la preuve que ce
  sont les mêmes objets. La paire de fefbec66 est encore ouverte ; le coffret n'a pas de paire.

### B.2 Les 7 refus (q3, q10, q12, q14, q19, q20, q49)

| Tâche | Article | Prix | Jumelle EN LIGNE sur 23b59b14 au dépôt | Ce qui est commun |
|---|---|---|---|---|
| 8488c824 | Coffret métallique borne de recharge | **9 €** (jumelle 90 €) | 3311051132, déposée 3 min avant par le **même lot** (autre fiche) | même titre, même texte, couverture de même empreinte, fichiers différents |
| 447f3ed2 | Support imprimante | 99 € | 3308740323 (fiche née du relevé 1794821353605) | **2 photos sur 2 = mêmes images** par empreinte, fichiers différents ; paire ouverte depuis 10:29 |
| 880803ce | Road Top 12,3" CarPlay BMW | 179 € | 3308740837 (fiche née du relevé 1794821353268) | même titre et prix ; 2 photos sur 3 par empreinte ; paire ouverte depuis 13:28 |
| 8b7391e6 | Autoradio 1 Din + caméra | 79 € | 3308740893 (fiche née du relevé 1794821353560) | même titre et prix ; 1 photo sur 3 par empreinte |
| fefbec66 | Chariot poste de travail | 119 € (jumelle 65 €) | 3308740524 (fiche née du relevé 1794821354170) | même titre ; 1 photo sur 2 ; paire ouverte depuis 12:51 |
| 16189e4c | Table à manger ronde Tulipe | 79 € | aucune sur 23b59b14 (jumelle sur l'**ancien** compte, quittée par FillSell, peut-être encore en ligne) | rayon **« Arts de la table »** choisi par l'IA parmi les candidates (`ia_parmi_candidats`), poids 500 g – 1 kg |
| 9ed0a647 | Veste polaire chauffante | 52 € | aucune (2 dépôts antérieurs, 25/10 et 07/11, disparus) | — |

- **Côté acceptés :** aucun des 22 dépôts acceptés du lot n'avait de jumelle en ligne sur 23b59b14.
- **Pas d'erreur de texte :** aucun lien, mot-clé, hashtag ni mention de site.
- **Côté garde :** au service de 20:50, la garde « mêmes photos » a retenu 6aa50ed2 (journal de 20:50:15), mais aucun
  des 5 cas ci-dessus. Raisons :
  - elle cherche les jumelles par **fichier** de première photo identique ;
  - elle ne lit les empreintes que pour une paire de motif `photo_identique` (HEAD
    `get-pending-jobs/index.ts` l. 16059 et 16074, `_shared/lbc-memes-photos.js` l. 83-102) ;
  - ici, les fiches nées du relevé portaient les fichiers de Leboncoin et les paires avaient d'autres motifs
    (`photo_multi_titre_en_serie`, `deux_annonces_meme_plateforme`).

### B.3 Pourquoi je ne propose pas de règle nouvelle « sûre » ici (q46, q48, q50, q51)
- **Même titre + même couverture (empreinte) + même compte au dépôt, 30 jours :** 4 refusés et **21 acceptés**
  (229c7b07, cfdfda6f). Ce n'est pas un signal fiable, et le titre seul l'est encore moins (Règles absolues).
- **Paire « Est-ce le même article ? » ouverte (tous motifs) + autre fiche en ligne sur le même compte, 30 jours :**
  2 refusés et **36 acceptés**. La retenir bloquerait des dépôts que Leboncoin accepte.
- **Ce qui reste dans la règle existante** (même jeu de photos, seuil 1 sur le même compte) : l'extension proposée le
  16/11 (annexe 8.4 du rapport du midi, R2, jamais faite). Elle consiste à lire les empreintes de toutes les jumelles et
  à chercher les fiches dont la première photo a la même empreinte, plus seulement le même fichier. Elle aurait retenu
  **447f3ed2** (2 photos sur 2) et le Crash Bandicoot de 229c7b07 (16/11). Son coût en faux positifs est à mesurer
  avant toute décision.
- **Les 2 inexpliqués :**
  - **Table.** Le rayon est faux : « Arts de la table » au lieu de « Ameublement », un défaut de rangement réel. Mais le
    même dépôt a été accepté le 15/11 sur l'ancien compte : ce n'est pas prouvé comme cause. À traiter comme défaut de
    rangement : sur quelles candidates l'IA a-t-elle tranché ?
  - **Veste polaire.** Rien de commun avec un autre refus.

---

## C. Implications de déploiement (lues le 18/11 au soir)

**Fonctions edge** (`npx supabase functions list`) :

| Fonction | Version | `verify_jwt` | Mise à jour | Commande de déploiement |
|---|---|---|---|---|
| get-pending-jobs | 386 | true | 17/11 13:44 | sans `--no-verify-jwt` |
| handler-watch | 210 | false | 16/11 08:40 | avec `--no-verify-jwt` |
| update-job-status | 206 | false | 16/11 13:19 | avec `--no-verify-jwt` |

- Les trois importent `description-leboncoin.ts` (texte servi et texte comparé) : les redéployer ensemble, version et
  `verify_jwt` relus avant et après.
- **⚠ Le dossier partagé bouge pendant l'enquête.** `get-pending-jobs/index.ts` et `update-job-status/index.ts` sont
  modifiés dans l'arbre par d'autres terminaux (cloud-relances, eBay, créneaux… du 18/11, non commités ; `git status`
  relu à la fin). Les déployer maintenant enverrait ce travail en prod : attendre leur commit ou s'accorder avec ces
  terminaux. `description-leboncoin.ts` et `relanceRefusLbc.js`, eux, ne sont touchés par personne.
- **App (web Vercel + OTA Capgo) :** `relanceRefusLbc.js` est dans le paquet de l'app (bouton « Relancer »). Tant que
  l'app garde `lbc-texte-1311`, elle dira « Modifie d'abord l'annonce » sur les 18 refus de 020816ba : même empreinte
  brute, et elle ne sait pas que le texte servi a changé. Avec `lbc-texte-1811`, elle laisse le serveur décider. Il faut
  donc pousser le web, puis faire l'OTA (numéro à **lire** avant ; jamais depuis un worktree).
- **Extension** (`chrome-extension/manifest.json` : **0.6.192** à HEAD, **0.6.193** dans l'arbre d'un autre terminal) :
  aucun changement pour ce point, elle reçoit le texte servi et n'a aucune copie de la règle. **Serveur Cloud** : aucun changement, pour la même raison.
- **Aucune migration, aucun réglage de cadence** : la cadence est hors cause et n'est pas touchée.

## D. Ce qu'il faudrait lire de plus pour une preuve absolue
1. **Le texte exact du mail « Votre annonce … a été refusée »** reçu par 020816ba, pour un manga, et par cfdfda6f, pour
   la table et la veste. Le demander au client est un mail : il faut un ordre explicite de Nico.
2. **L'essai prévu par la doctrine de `description-leboncoin.ts`** (l. 226-227), sur le compte de Nico :
   - annonce à 999 € ou plus, photos jamais publiées, rayon Livres ;
   - le texte de 020816ba sans son pseudo ni son réseau social, d'abord **avec** le bloc, puis **sans** ;
   - c'est la même méthode que l'essai WWE SuperCard du 26/10 (T1 à T6).
3. **Pour cfdfda6f :** mesurer les faux positifs de l'extension « empreintes » (R2 du 16/11) avant de la proposer.

## Fichiers (tous dans `C:\Users\nicol\fill-and-sell\.tmp-terminal\t2\p6\`)
- **Correctif :** `correctif-description-leboncoin.diff`, `description-leboncoin.propose.ts`.
- **Verrou :** `lbc-autres-articles-selftest.mjs`, `verrou-avant.out` (rouge), `verrou-apres.out` (vert).
- **Mesures :** `prototype-autres-articles.mjs`, `mesure-copie.mjs`, `essai-nettoyage.mjs`.
- **Non-régression :** `regr-description-leboncoin.mjs`, `regr-lbc-cinq-mots-cles.mjs`.
- **Requêtes :** `q2.sql` à `q54.sql` (lancées par `r.sh`) ; exports `q38.jsonl`, `depots60.jsonl`, `stock.jsonl`,
  `veille.jsonl`, `functions.json`.

---

## E. Implémentation (18/11 au soir, sur ordre du coordinateur ; rien de commité, rien de déployé)
- **Fichiers modifiés :**
  - `supabase/functions/_shared/description-leboncoin.ts` : `blocsAutresArticles`, la trace `autres_articles` ; md5
    `0e9cbea6cd11c85c9cfa56b3f475cdff` ;
  - `src/utils/relanceRefusLbc.js` : `REGLES_TEXTE_LBC = "lbc-texte-1811"`, md5 ajouté, entrée 1311 gardée ;
  - `supabase/functions/get-pending-jobs/index.ts` : un seul Edit dans `description_nettoyage`, plus un journal ;
  - `scripts/lbc-refus-familles.prod.sql` : famille `autres_articles` / `autres_articles_apres_regle`, colonnes
    `autres_articles` et `regles_servies` ;
  - **nouveau** `scripts/lbc-autres-articles-selftest.mjs`.
- **Ligne à ajouter dans `package.json`** (je n'y ai pas touché) : `"selftest:lbc-autres-articles": "node scripts/lbc-autres-articles-selftest.mjs",`
- **Verrou sur le vrai fichier :** ROUGE avant (6 échecs, `verrou-reel-avant.out`), VERT après (sortie 0, 16 ✓ sur 16,
  `verrou-reel-apres.out`).
- **Selftests :** les 65 `selftest:*` lbc / leboncoin / description, plus `donnees-clients`, sont verts (`st/*.out`).
  `lbc-saisie-longue` est passé rouge une fois puis vert à la relance, sans changement de mon côté : il lit
  `chrome-extension/content-scripts/leboncoin.js`, qu'un autre terminal modifiait à ce moment-là.
- **Veille relancée en lecture :** `autres_articles 020816ba` = 18.
- **Mesure refaite (HEAD contre le vrai fichier) :** 18 refusés et 2 jamais en ligne changés ; 0 des 323 acceptés ;
  stock : 734 fiches sur 2 comptes.
