# Diagnostic points 8 et 11 (16/11/2026, lecture seule)

Heure de Paris partout. Rien écrit en base, aucun fichier du dépôt modifié, aucune commande git d'écriture, aucun
déploiement, aucune action sur une plateforme. Lectures : `npx supabase db query --remote --read-only` (requêtes
`q1.sql` à `q59.sql` de ce dossier), photos de NOTRE stockage Supabase (lues pour comparaison, `img/`, `img2/`,
planches `planche-*.jpg`, empreintes recalculées par `vignettes.mjs`), empreinte Leboncoin rejouée par
`verif-empreinte.mjs` (module du dépôt `src/utils/empreinteContenu.js`, sans rien écrire).

---------------------------------------------------------------------------------------------------------------------

## POINT 8 — Refus de modération Leboncoin

### 8.0 Où les refus sont détectés et classés

| Étape | Où | Marque posée |
|---|---|---|
| Dépôt jamais vu aux relevés complets | SQL `trancher_publications_sans_lien` (migration `20261113203000_lbc_refus_dit_refus.sql` l. 71 ; message `message_refus_leboncoin` l. 42) | `platform_fields.depot_jamais_en_ligne.issue` = `refus_moderation_probable` (failed) ; `article_en_ligne_ailleurs` (cancelled : la fiche a une autre annonce Leboncoin en ligne) ; `doublon_photo_de` si dHash égal à une annonce en ligne |
| Sonde de modération | `handler-watch` (+ `chrome-extension/background.js` l. ~26737-26825, `moderation_probe`) | `platform_fields.jamais_en_ligne` |
| Bouton « Relancer » de l'app après un refus | `src/utils/relanceDepotMort.js` | `relance_apres_depot_mort.constat` (le dépôt refusé, ses traces retirées) |
| Garde « mêmes photos » avant envoi | `supabase/functions/_shared/lbc-memes-photos.js` + `get-pending-jobs/index.ts` l. 15930-16040 | needs_user `lbc_memes_photos` |
| Garde « relance à l'identique » avant envoi | `src/utils/relanceRefusLbc.js` + `get-pending-jobs/index.ts` l. 16042-16085 | needs_user `refus_lbc_meme_contenu` |
| Classement d'affichage | `_shared/cause-blocage.js` l. 81 (`refus_lbc_meme_contenu` → plateforme/modération), l. 84 (`lbc_memes_photos` → garde/doublon possible) | — |
| Veille | `scripts/lbc-refus-familles.prod.sql` | familles mots_cles / photos / relance / inexplique |

Le motif exact n'existe que dans le mail de Leboncoin au vendeur : chaque cause ci-dessous est établie sur nos données.

### 8.1 gjehly (229c7b07) — les 3 annonces retenues `refus_lbc_meme_contenu` (copies créées le 13/11 15:17-15:18, lot 16f0ada1)

**(1) 673503a3 — « Topps Disney100 Chrome Anna #9 … (2023) EN »** (fiche 1793030096058, relevé eBay ; 29,96 € ;
Loisirs › Collection ; produit « Jeux de cartes » (IA, à la place du pré-rempli « Image et sticker ») ; état « Très bon
état » ; colis 250-500 g ; 2 photos personnelles (recto, verso), description = titre).
- Historique : dépôts refusés ≈ 06-07/11 (n° effacé), 08-09/11 (relances « Relancer » ×3 : 08/11 23:31, 09/11 10:14,
  10/11 06:37), 3305476808 (09/11), 3306058262 (10/11 06:40), 3306762703 (11/11 09:56, copie 5adbc272),
  **3308911206 (14/11 06:48, cette tâche)** → 6 dépôts identiques, 6 refus.
- Rien de « mal posé » repérable : 56 autres cartes Topps/Disney du même compte, mêmes champs (rayon, produit, état,
  colis, texte = titre, 2 photos sur le même fond), sont en ligne. Aucune jumelle de fichier, aucun mot-clé, aucun lien.
  **Le premier refus reste inexpliqué chez nous** (motif dans le mail de Leboncoin à gjehly).
- **Notre faute = la répétition** : avant le 13/11 rien n'empêchait de renvoyer l'identique ; APRÈS la règle du 13/11,
  la copie 673503a3 est encore PARTIE le 14/11 à 06:46 (6e refus). Prouvé : au service, `lbc_envois` note
  brute `l1:9e620c1bfa893676`, servie `l1:157513cb226f713e` ; l'empreinte en base de la tâche refusée 137ea70c =
  `l1:157513cb226f713e` (rejouée par `verif-empreinte.mjs`). Le juge (`relanceRefusLbc.js` l. 128-130, chemin
  « contenu », refus d'avant la règle) ne compare que la copie AVANT service (`cand.brute`), alors que la tâche refusée
  porte en base ce qui est PARTI (état posé par `lbc_deduit` au service, poids, produit posés au dépôt). Il n'a matché
  qu'au service suivant (14/11 17:22), une fois le dépôt refusé réécrit dans la tâche.
- Retenue actuelle : juste. Ne pas relancer à l'identique.

**(2) 7473219e — « Topps Disney100 Chrome Cruella De Vil #90 … (2023) EN »** (fiche 1793030096012 ; 12 € ; mêmes champs).
Même histoire, mêmes dates : 3305478136 (09/11), 3306058550 (10/11 06:42), 3306766519 (11/11 10:00, copie 3e60c398),
**3308912418 (14/11, servie 06:56 alors que servie = `l1:0225128c5adbcf04` = empreinte de cef15f28 refusée)**. Premier
refus inexpliqué ; 5 renvois identiques dont 1 après la règle (même trou du juge). Retenue juste.

**(3) 17dba85f — « Sony Crash Bandicoot 2: Cortex Strikes Back PS1 PAL 1997 Platinum SCES-00967 »** (fiche
1794604588358000, née du relevé Vinted le 13/11 22:16, Vinted 10792720327 ; 22 € ; Électronique › Jeux vidéo ; 3 photos).
- **Cause : doublon d'une annonce EN LIGNE du même compte Leboncoin.** L'annonce 3308086796 (9faf6527, fiche
  1794440473664, en ligne depuis le 12/11 18:50, vue le 16/11 04:05, même compte 3c557013) porte le même titre, la même
  description, le même prix, et **la même photo de couverture** : dHash 0 bit, pHash identique (`photo_empreintes`,
  empreinte du fichier rehosted calculée le 14/11 05:52, AVANT le dépôt de 07:06 ; planche `planche-crash.jpg`).
- Comment c'est arrivé : la vente Vinted de la fiche 1794440473664 (13/11 ~16:11) a été annulée ; le retrait Leboncoin a
  été annulé avec elle (3308086796 est resté en ligne) ; le relevé Vinted de 22:16 a créé une 2e fiche pour une annonce
  Vinted aux mêmes photos, sans question « Est-ce le même article ? » ; le lot du 14/11 05:49 a publié les deux fiches.
- La garde « mêmes photos » ne l'a pas vu : elle compare des FICHIERS (rapatrie-fiche/1794440473664 ≠
  rehosted/1794604588358000), ne lit les empreintes que si le moteur a posé une paire, et exige 2 jumelles.
- Retenue actuelle (par « envoi », c'est son propre dépôt refusé) : juste. Rien à relancer tant que 3308086796 est en
  ligne. Question à trancher : même objet (fiche en double à fusionner) ou 2e exemplaire ? (et Vinted porte peut-être
  deux annonces pour lui : 10792720327 et 10804741521, publiée par FillSell le 14/11 14:22 — à vérifier).

### 8.2 ayadi007 (cfdfda6f) — les 4 refus du 13/11 (+ 2 du 12/11, même cause)

Fait établi : ayadi a DEUX comptes Leboncoin (`compte_plateforme` bf460991 et 23b59b14). Relevés : 23b59b14 connecté
le 12/11 11:10 → 13/11 10:22, puis bf460991 dès 13/11 11:41. Tous les dépôts FillSell du 12/11 et du 13/11 matin sont
partis sur **23b59b14**. Il vend le même produit sous plusieurs fiches (une par annonce Vinted, mêmes photos).

| Tâche | Article | Dépôt refusé | Jumelle EN LIGNE sur le MÊME compte (23b59b14) | Garde d'aujourd'hui |
|---|---|---|---|---|
| **76d55115** | Écran vidéo projecteur 150 pouces, 78 €, Électronique › Ordinateurs | 3307954917, 12/11 16:03 | 3307938923 (f7264afb, 15:43) : **même fichier photo**, même titre, texte, prix | retenue (2 jumelles en comptant l'autre compte) |
| **ab836857** | Autoradio pour Renault Master 2019-2022, 99 €, Véhicules › Équipement auto | 3307929220 (12/11 ~15:30) puis, relancée, 3308344651 (13/11 10:27) | 3307789802 (09c76f0c, 12/11 12:06) : **même titre, même texte, même prix**, photos = versions « améliorées » des mêmes (pHash 14-16 bits) | **NON retenue** (1 jumelle de fichier, sur un compte inconnu) |
| **e5337ed2** | Support Wallbox Autoportant, 65 €, Maison › Bricolage | 3307936149 (12/11 ~15:35) puis 3308345618 (13/11 10:28) | 3307267675 (11/11 17:11) : **mêmes fichiers photo** | retenue (2 en comptant bf460991) |
| **cc81c36a** | Road Top 12,3" CarPlay BMW X3/X4, 179 €, Véhicules › Équipement auto | 3308346481, 13/11 10:30 (classé « article en ligne ailleurs ») | 3307771523 (828c3932, 12/11 11:41) : **mêmes fichiers photo** | **NON retenue** (1 seule jumelle) |
| f181149a | Support imprimante table de travail, 99 € | 3307927464, 12/11 15:29 | 3307925904 (15:27) mêmes fichiers | retenue |
| bf94a937 | Lustre cristal 40 cm E14, 58 € | 3307948700, 12/11 15:55 | 3307940939 (15:46) mêmes fichiers | retenue |

Rien de mal posé dans la catégorie ni les champs : **chaque refusée était la 2e annonce identique sur le même compte
Leboncoin.** Les dépôts du 12-13/11 précèdent les gardes du 13/11 après-midi ; ab836857 et e5337ed2 ont été relancées
à l'identique (13/11 10:27-10:28, garde pas encore en place) → refusées 2 fois.

**La mesure du 13/11 (« Leboncoin accepte la 2e, refuse la 3e », seuil 2) est un artefact des deux comptes d'ayadi.**
Rejouée (q10, q35) : du 25/10 au 16/11, sur tout le parc, dépôts avec une jumelle aux mêmes fichiers vue en ligne après
le dépôt → **10 acceptés, tous avec la jumelle sur un AUTRE compte Leboncoin** (ayadi, jumelles sur bf460991) ; **6
refusés, tous avec une jumelle sur le MÊME compte** (ayadi ×4, f44b5917 ×2 essais) ; **0 accepté avec une jumelle sur le
même compte**. La règle vraie : **une jumelle en ligne sur le compte qui dépose suffit** (seuil 1 par compte Leboncoin =
la décision d'origine de Nico). Seuil 2 tous comptes confondus laisse passer cc81c36a et retiendrait à tort un dépôt dont
les deux jumelles sont sur l'autre compte.

Cas 5eb7dc3f (copie d'ab836857, 16/11) : servie à 10:20 alors que servie `l1:25a1e1624bcb9a26` = empreinte d'ab836857
refusée ; sauvée par hasard (session Leboncoin perdue à 10:22, « En attente de ta connexion »), retenue à 10:35. Même
trou que gjehly. Antérieur, hors des 4 : 2da8e471 (autoradio Suzuki, 06/11) reste inexpliqué (enquête du 07/11).

### 8.3 Parc — refus de modération Leboncoin des 30 derniers jours (par dépôt, toutes marques)

La veille `lbc-refus-familles.prod.sql` (30 j) n'en voit que **21** (elle ignore les constats rangés par « Relancer »
et les `article_en_ligne_ailleurs`). Compte complet (q32/q34) : **55 dépôts refusés, 17 comptes** :

| Famille (notre classement) | Dépôts | Comptes | Détail |
|---|---|---|---|
| Inexpliqué | 26 | 13 | dont e95e8b9d ×5 (tableaux), 7373c96c ×5 (19/10), 53efea05 ×3, 2da8e471 (ayadi) |
| Relance d'un refus, à l'identique | 11 | 3 | gjehly ×8 (Anna, Cruella), ayadi ×2, d71db658 ×1 |
| Plus de 5 mots-clés / liste « Mots-clés » | 9 | 6 | tous AVANT la règle des cinq mots-clés (13/11) |
| Mêmes fichiers photo qu'une annonce en ligne | 8 | 2 | ayadi ×6 (jumelle même compte), f44b5917 ×2 (essais) |
| Même photo par empreinte + même titre/prix, même compte | 1 | 1 | gjehly Crash Bandicoot |

Tâches retenues en ce moment : `refus_lbc_meme_contenu` ×4 (gjehly ×3, ayadi 5eb7dc3f), `lbc_memes_photos` ×1
(ayadi f229a3fe : jumelle 3310626922 sur 23b59b14, compte courant 23b59b14 → retenue juste aussi avec la règle corrigée).

### 8.4 Correction de la RÈGLE (proposée, rien fait)

**R1 — `relanceRefusLbc.js` : le juge compare aussi ce qui PARTIRAIT** (l. 128-130) :
```js
if (!cand.texteInchange || !texteInchange || (!cand.brute && !cand.servie)) continue;
const e = soi ? cand.brute : empreinteEnvoiLbcDuJob(r);
// La tâche refusée porte en base ce qui est PARTI (valeurs posées au service et au dépôt) : on la compare à ce qui
// partirait maintenant (servie), pas seulement à la copie d'avant le service (brute).
if (e && (e === cand.brute || (!soi && cand.servie && e === cand.servie))) return { ...base, par: "contenu" };
```
Effet : une copie d'un refus d'avant la règle est retenue dès son PREMIER service (673503a3, 7473219e, 5eb7dc3f l'auraient
été). get-pending-jobs passe déjà `servie` (l. ~16068). Le bouton de l'app (`relanceRefusLbc`) n'est pas touché.

**R2 — `_shared/lbc-memes-photos.js` + get-pending-jobs : « déjà en ligne sur le COMPTE qui dépose »** (décision de Nico) :
- `SEUIL_ANNONCES_MEMES_FICHIERS` (l. 45) : 2 → **1**, compté sur le compte Leboncoin du dépôt ;
- `jugerMemesPhotosLbc` (l. 135-175) reçoit `compteDepot` ; boucle des occupants (l. ~148-158) : une jumelle sur un AUTRE
  compte connu ne compte pas (`if (compteDepot && o.compte && o.compte !== compteDepot) continue;`) ; compte inconnu de
  part ou d'autre → elle compte (prudence) ;
- get-pending-jobs l. 15990 : lire `compte_plateforme` des annonces et le poser sur les occupants (l. 16004) ;
  `compteDepot` = `compte_plateforme` du dernier relevé Leboncoin du compte FillSell (`vinted_sync_runs`, < 24 h), sinon
  null (tous les comptes comptent) — aucune extension à changer ;
- **empreintes pour toutes les jumelles** (l. 16015-16021 : aujourd'hui seulement pour une paire du moteur) et recherche
  des fiches dont la PREMIÈRE photo a le même dHash (l. 15945-15957 : aujourd'hui par adresse seulement) — attrape le
  Crash Bandicoot (fichiers différents, pHash identique). Lectures bornées comme aujourd'hui (lots, 1 000 au plus).
- Option (décision de Nico, ab836857) : même titre + même texte + même prix qu'une annonce en ligne du même compte →
  retenue aussi (pas un rapprochement : une retenue avec question ; jamais sur le titre seul).

**R3 (décision)** : quand le refus s'explique par une jumelle du même compte, la retenue « relance à l'identique » devrait
tomber dès que la jumelle n'est plus en ligne (5eb7dc3f : le contenu n'était pas en cause).

**R4 (veille)** : `lbc-refus-familles.prod.sql` compte aussi `relance_apres_depot_mort.constat`, `article_en_ligne_ailleurs`,
les jumelles par compte et par empreinte (requête prête : `q34.sql`).

### 8.5 Ce qui peut être relancé

- gjehly 673503a3, 7473219e : **non** à l'identique (6 refus chacune). Seulement après une modification (vraie
  description, photos) — de préférence avec le motif du mail de Leboncoin. « Relancer » le dit déjà.
- gjehly 17dba85f : **non** tant que 3308086796 est en ligne ; à annuler si c'est le même objet (question « même
  article » à poser), à différencier si c'est un 2e exemplaire.
- ayadi : rien à relancer. e5337ed2, cc81c36a, f181149a, bf94a937 : la fiche est déjà en ligne sur Leboncoin (3308741101,
  3308735132, 3308400123, 3310597738). 76d55115 et 5eb7dc3f/ab836857 : d'autres fiches du même produit sont en ligne ;
  après R2, « Relancer » de l'app suffit, le serveur retient tant qu'une jumelle est en ligne sur le compte.
- **Aucun script `scripts/reparations/`** : aucune donnée fausse à corriger.

### 8.6 Selftests verrous proposés

- `selftest:lbc-relance-identique` (+ fixture `scripts/fixtures/lbc-relance-identique-1311.json`) : cas « copie neuve,
  premier service » tiré de 673503a3/137ea70c (brute ≠ refusé, servie = refusé `l1:157513cb226f713e`) → retenue.
  **ROUGE** sur le code actuel (rend null), vert après R1.
- `selftest:lbc-doublon-meme-compte` (neuf, pur, sur `jugerMemesPhotosLbc`) : corpus mesuré (10 acceptés à jumelle sur
  l'autre compte → jamais retenus ; 6 refusés à jumelle du même compte → tous retenus ; cc81c36a 1 jumelle même compte →
  retenue ; deux jumelles sur l'autre compte seulement → pas retenue ; Crash : fichiers différents, dHash/pHash égaux,
  sans paire du moteur → retenue). **ROUGE** aujourd'hui (seuil 2, empreintes réservées aux paires), vert après R2.

---------------------------------------------------------------------------------------------------------------------

## POINT 11 — Caisse à vin d'ornellaracano (f8aa02a5)

### 11.1 Verdict : **C'EST LE MÊME OBJET. Le rattachement est juste ; rien à réparer.**

| | Fiche Vinted (gardée) 1788463964366007 | Fiche Leboncoin (absorbée) 1790174128565 |
|---|---|---|
| Origine | vinted_sync, créée 03/09 21:32 ; Vinted 10698117550 (active, remise en ligne 07/11) | relevé Leboncoin 23/09 16:35 ; annonce 3218690913 (déposée 19/09 23:21) |
| Titre | « Caisse de rangement en bois vintage déco » | « Caisse à vin en bois Château Lagrange Saint-Julien Médoc 2005 » |
| Texte | « Jolie caisse de rangement en bois… **inscription décorative d'origine**… Je ne prends pas de mesures » | « caisse à vin… Château Lagrange, millésime 2005… Matière : bois » |
| Prix | 5 € | 10 € → 8 € → 5 € (suivi le 04/10) |
| Dimensions | aucune | aucune |
| Photos | 3 (images1.vinted.net) | 2 (couvercle « Les Fiefs de Lagrange… 2005 », intérieur) |

Photos (`photo_empreintes`) : couvercle Vinted c1004bad ↔ couvercle Leboncoin : **pHash identique**, dHash 1 bit ;
intérieur Vinted 6ee1485b et 823fc012 ↔ intérieur Leboncoin : **dHash et pHash identiques**. Ce sont les mêmes
photographies (planche `planche-caisse.jpg`). Le texte Vinted décrit la même caisse sans nommer le château
(« inscription décorative d'origine »). Même objet, présenté autrement selon la plateforme.

### 11.2 Quelle règle, quand

- 23/09 16:35 : **pas un rattachement** — import (`rapprochements` decision « import ») dans une fiche NEUVE
  1790174128565 (« aucun_candidat » aux 10 relevés précédents).
- 25/09 12:04 : le recensement (`source` recensement_2509) pose la question « Est-ce le même article ? » a1e7aba6,
  motif **photo_identique** (preuves : dHash 0, pHash 0, 2 photos communes, prix différents ; aucun signal titre).
- **30/09 13:33:51 : fusion** 2918ef43-66e0-4cd9-a014-e544ca80dd9a, `par = utilisateur:photo_go_nico_3009` (correction
  n° 3 du 30/09 sous le feu vert de Nico, `scripts/reparations/20260930_corrections_sans_trace.sql`), question fermée
  « fusionnee ». Ont suivi la fiche Vinted : annonces 3218690913, 3276225993, jobs e88ceb1b, 74222e0e, 3 rapprochements ;
  puis les republications 3280753166 (02/10) et 3310544697 (f2bd4ee7, 16/11 08:50).
- La règle CLAUDE.md (« jamais sur un titre seul ») est respectée : la preuve est la photo, les titres n'ont qu'un mot
  commun. La règle « photo identique = preuve » (`selftest:rattachement-regles`, décision a) n'est **pas fautive** ;
  rien à corriger.

### 11.3 Combien d'autres fusions par la même règle (`utilisateur:photo_go_nico_3009`)

1 078 lignes, **0 défaite** ; 1 037 dont les deux fiches existent encore (28 comptes, 1 seule chez Ornella). Preuve
photo relue aujourd'hui sur les empreintes des deux fiches : **1 025 confirmées** (dHash égal ou pHash ≤ 10), **2** sans
empreinte, **10 à relire** (toutes af37fa49, paires Opla ↔ Vinted : titres concordants, prix identiques, mais les photos
des fiches ont changé depuis — 1790530586142 « Levis pull M » ↔ 1790531476442002 « Sweat Levi's noir », etc.).

### 11.4 Réparation : aucune. Esquisse SEULEMENT si Nico jugeait autrement (déconseillé)
`scripts/reparations/20261116_ornella_caisse_vin_defusion.sql` :
1. lecture avant (fusion 2918ef43…, annonces d1d5e7ca/120a1a7b/28f133c1/1adfcb64, jobs) ;
2. sauvegardes `_backup_1611_caisse_vin_inventaire|annonces|jobs` (les deux fiches, leurs annonces et tâches) ;
3. `SELECT public.inventaire_defusionner_pour('f8aa02a5-23cb-4325-bba8-127f61a75741', '2918ef43-66e0-4cd9-a014-e544ca80dd9a', 'reparation_1611_caisse_vin');`
   — ne ramène que les déplacements du 30/09 ; 28f133c1 (3280753166), 1adfcb64 (3310544697), eb470dc9 et f2bd4ee7 resteraient
   sur la fiche Vinted (à déplacer explicitement, avec relecture) ;
4. inverse `_INVERSE.sql` : restauration depuis les sauvegardes (ou refusion par la même fonction que le bouton).
Selftest verrou : sans objet (aucun correctif). Garde de non-régression possible : ajouter la paire (titres différents,
pHash 0) au corpus de `selftest:doublons` comme « même article ».

---------------------------------------------------------------------------------------------------------------------

## Décisions pour Nico

1. R2 : seuil « mêmes photos » = **1 par compte Leboncoin** (sa décision du 13/11, la mesure « 2 » étant fausse) ;
   compte du dépôt lu sur le dernier relevé, inconnu → tous les comptes comptent.
2. R2 : empreintes (pHash ≤ 10) pour toutes les jumelles, pas seulement les paires du moteur.
3. Option R2 : même titre + même texte + même prix sur le même compte → retenue aussi ?
4. R3 : lever la retenue « relance identique » quand le refus venait d'une jumelle disparue depuis ?
5. gjehly : demander le motif du mail Leboncoin pour Anna/Cruella ? (aucun mail sans son ordre) ; Crash Bandicoot : même
   objet ou 2e exemplaire (et double annonce Vinted 10792720327 / 10804741521 à vérifier) ?
6. Caisse à vin : confirmer « même objet, rien à faire ».

## Constats annexes (hors périmètre, non diagnostiqués)

- ayadi 23b59b14 : 3307789802, 3307938923, 3307919949, 3307771523, 3307925904, 3307940939 ne sont plus vues depuis le
  13/11 10:22 malgré ~25 relevés complets du même compte (13/11 20:38-22:17, 62/62) et n'ont pas de `disparu_le` : elles
  restent « en ligne » pour la garde (fausses jumelles possibles) et pour le stock. Relevés en boucle toutes les 2 min ce
  soir-là. À regarder.
- gjehly : aucune question « même article » entre 1794440473664 et 1794604588358000 malgré pHash identique.
