# Lignes rouges « jamais mise en ligne » qui ne se referment pas — 27/10/2026

Demande de Nico (27/10) : la ligne Leboncoin du GTA de BONCOIN reste « refusée par sa modération » alors que le relevé
a retrouvé l'article en ligne. Toutes les heures sont celles de Paris.

## 1. Cause : un cas jamais couvert, pas une régression

Chronologie lue en base (`cross_post_jobs`, `annonces_plateforme`, `vinted_sync_runs`) :

| Heure | Fait |
|---|---|
| 24/10 23:11:49 | Dépôt FillSell, job `aea284ac` : adsubmit 201 `{"status":"created","ad_id":3294665225}` |
| 25/10 00:36, 25/10 23:25 | Relevés complets (1 207 annonces) : 3294665225 absente |
| 26/10 ~01:49 | Leboncoin date la mise en ligne de **3295468043** (`publiee_le`) |
| 26/10 16:53:07 | Le relevé `941f3088` (1 208 annonces) lit 3295468043, sans fiche |
| 26/10 16:54:22 | Fin du relevé → `trancher_publications_sans_lien` : 3294665225 absente de deux relevés complets → `failed`, « refusée par sa modération » |
| 26/10 16:57:40 | Le rapprochement du compte rattache 3295468043 à la fiche (photo identique, auto) et crée le job `21d6091f` publié |

- Le jugement tombe à la clôture du relevé ; le rapprochement de ce même relevé part au moteur du compte
  (`rapprocher_releve`, depuis le 07/10) et finit après. La clôture « article en ligne ailleurs » (09/10) ne lit que
  les annonces DÉJÀ rattachées à la fiche : 3 minutes trop tôt. Ensuite, aucune règle ne relit une ligne `failed`.
- Le « rattrapage du 10/10 au 21/10 » n'en était pas un : les 38 lignes Beebs et 6 Leboncoin repassées `published`
  portent toutes `erreurs_archivees.par = relance_manuelle` (une : « relance support unique ») — ce sont des relances,
  donc de nouveaux dépôts. Aucune ligne n'a jamais été refermée par un relevé, même numéro ou pas.
- Donc : **pas de commit fautif**. Le cas (article retrouvé en ligne après le jugement) n'a jamais été couvert.

## 2. 3295468043 n'est pas 3294665225 renumérotée : c'est un second dépôt, fait hors FillSell

- Leboncoin numérote dans l'ordre du temps (relevé sur tout le parc : les numéros 32946… sont des dépôts du 24/10
  22:20 → 25/10 00:53, les 32954… du 26/10 00:30 → 02:06). 3295468043 a été créée le 26/10 vers 01:49.
- Sur 1 960 dépôts Leboncoin de 20 jours, le numéro rendu au dépôt est celui que le relevé lit (1 751 vus sous ce
  numéro) : Leboncoin ne renumérote pas une annonce.
- Aucun job FillSell n'a déposé 3295468043. Son texte n'est pas celui de FillSell : nos dépôts Leboncoin gardent
  5 hashtags (vérifié sur 4 annonces du même compte), 3295468043 n'en a aucun (même description sinon ; la majuscule du
  titre est celle de Leboncoin, 22 titres sur 22).
- **Une seule annonce en ligne pour cet article sur Leboncoin** : 3294665225 n'apparaît dans aucun des relevés du compte
  depuis le dépôt (aucune ligne `annonces_plateforme`, tous statuts confondus), 3295468043 est en ligne. Pas de doublon.

## 3. Ce qui change (migration `20261027100000`, en attente du feu vert nommé de Nico)

- **`depot_jamais_en_ligne_refermer`** (la règle) : une publication `failed` portant `depot_jamais_en_ligne` se referme
  quand un relevé de CE compte, sur CETTE plateforme, voit en ligne :
  - un identifiant du dépôt (numéro, lien, adsubmit) → la ligne repasse « publiée » avec son lien, erreur archivée ;
    si une autre publication suit déjà cette annonce → close sans rouge (« déjà suivie par FillSell ») ;
  - une autre annonce de la MÊME fiche → close sans rouge, « ton article y est en ligne sous l'annonce … (vue au relevé
    du …) ».
  Jamais un titre, une photo, une fiche jumelle. Rien redéposé, retiré, vendu ; aucun quota ; aucun mail. 25 lignes au
  plus par appel ; publications seules ; Vinted exclu.
- **Déclencheurs** `annonces_plateforme_referme_depot_ins/_maj` : la règle dès qu'une annonce en ligne apparaît ou est
  rattachée à une fiche (changement utile seulement — une ligne relue à l'identique ne déclenche rien).
- **`trancher_publications_sans_lien`** : la règle à chaque relevé complet (rattrapage, isolée par un bloc d'exception) ;
  motifs sans déduction. **`fail_publish_without_listing_url`** : le motif de la sonde 72 h, idem. Logique inchangée.
- **Motif** : « Cette annonce est absente de tes annonces Leboncoin aux relevés complets du 25/10 à 16h44 et du 26/10 à
  19h23, et Leboncoin n'a donné aucun motif. Rien n'est vendu, ton article reste dans ton stock, et cette publication
  ne compte pas dans tes limites. » (Beebs : « … n'est ni en ligne ni « en vérification » dans tes annonces Beebs … »).
  Un vrai motif lu au dépôt (adsubmit 4xx) garde son texte (`_shared/pas-de-rouge.js`).
- `_shared/cause-blocage.js` (sentinelle d'ops-digest) range le motif neuf dans la même classe (plateforme / modération).
  Pris en compte au prochain déploiement d'ops-digest ; rien côté client.
- Réparation `scripts/reparations/20261027_jamais_en_ligne_refermes.sql` (sauvegarde `_backup_2710_jamais_en_ligne`,
  inverse) : la RÈGLE passe sur les comptes concernés, puis les motifs des lignes restées en échec sont réécrits avec
  leurs propres relevés.

## 4. Preuve : essai à blanc sur la prod (`scripts/essais/20261027100000_essai.sql`, ROLLBACK) — 26/26

- GTA : `cancelled`, « Ce dépôt n'a jamais été retrouvé dans tes annonces Leboncoin, mais ton article y est en ligne sous
  l'annonce 3295468043 (vue au relevé du 26/10 à 16h53) : rien à refaire, rien n'est vendu. » ; ancien motif archivé ;
  `21d6091f` intact (publié, même lien).
- Le 26/10 rejoué : annonce détachée → la ligne reste rouge ; rattachée à la fiche → refermée sur-le-champ.
- Même numéro (annonce d'essai sous le numéro du dépôt d'Ornella) → « publiée » avec son lien ; déjà suivie par une
  autre publication → close « déjà suivie par FillSell ».
- Gardes : même titre sans fiche, même titre autre fiche, même fiche autre plateforme, même fiche disparue → rien.
- Coût : relevé de BONCOIN relu à l'identique (1 241 annonces, 693 ms) → aucun job réécrit ; lecture du déclencheur
  0,1 ms ; la règle sur les 7 comptes × plateformes, 6 ms. Aucun retrait, aucun dépôt, aucun mail.
- Après l'essai : GTA toujours `failed`, aucun déclencheur, corps de trancher inchangé (md5 relu).
- Inverse essayé (migration puis inverse, ROLLBACK) : les deux corps reviennent au md5 relu en prod, droits identiques,
  déclencheurs et règle supprimés.

## 5. Les 7 lignes « refusée par sa modération » depuis le 11/10

« Absente » = le numéro n'apparaît dans aucun relevé du compte depuis le dépôt, et aucune autre annonce de la même fiche
n'est en ligne sur la plateforme (fiche supprimée : seul le numéro se vérifie).

| Job | Compte | Plateforme | Annonce | Article | État réel |
|---|---|---|---|---|---|
| `aea284ac` | BONCOIN | Leboncoin | 3294665225 | GTA IV Xbox 360 (stock) | **En ligne sous 3295468043** → se referme |
| `495e9ffc` | Ornella | Leboncoin | 3286567604 | Support de fond photo (fiche supprimée) | Absente — 19 relevés probants depuis |
| `46522917` | recrutementgroupezk704 | Leboncoin | 3288010842 | Jean Levi's 505 (vendu) | Absente — 8 relevés |
| `6b4de23c` | louis-seller | Leboncoin | 3291253848 | Pyjama In Extenso 10 ans (vendu) | Absente — 17 relevés |
| `1bce0c79` | louis-seller | Leboncoin | 3291650368 | Short velours Orchestra 8 ans (vendu) | Absente — 15 relevés |
| `36529e5f` | paugues | Leboncoin | 3293609494 | Huile André Thomas (fiche supprimée) | Absente — 2 relevés |
| `43e3371c` | mataich67 | eBay | 336857790393 | Air Max Command 41 (stock) | Absente des relevés du 24/10 et du 25/10 — **mais lue ACTIVE par la veille eBay le 22/10 à 21h54** (quantité 1) |

- Les 6 autres restent en échec (rien n'est en ligne) ; leur motif devient le texte factuel (réparation, étape 2).
- Les 4 lignes Beebs en échec (« trois jours après le dépôt … refusée par sa vérification, ou retirée ») : rien en
  ligne non plus ; même réécriture factuelle.
- ⚠️ À trancher par Nico : `43e3371c` (eBay) a été en ligne — eBay l'a mise en vente, puis elle a quitté les annonces
  actives sans motif lu. Ce n'est pas « jamais mise en ligne ». La veille eBay ne pose pas `vu_en_ligne_le`, donc le
  jugement l'a prise pour un dépôt jamais vu. Une vente eBay n'est pas exclue : à relire chez eBay avant de la relancer.

## 6. Appliqué le 27/10 (feu vert nommé de Nico)

- Suite complète des selftests : 469/469 verts (en lots, mémoire du poste basse).
- Migration appliquée vers 09:23 + `migration repair` ; objets relus en prod (règle, deux déclencheurs, droits inchangés ;
  trancher md5 `6ea3fdf3…`, fail_publish md5 `f97b80f5…`).
- Réparation jouée : GTA `aea284ac` relue en prod — `cancelled`, « Ce dépôt n'a jamais été retrouvé dans tes annonces
  Leboncoin, mais ton article y est en ligne sous l'annonce 3295468043 (vue au relevé du 26/10 à 16h53) : rien à refaire,
  rien n'est vendu. » ; `refermee.suivie_par` = `21d6091f` (publié, intact). Les 10 autres : `failed`, motif factuel.
- eBay `43e3371c` relue sur sa page publique : « Le vendeur a mis fin à cette annonce le Sat 24 Oct à 16:07, car elle
  comportait une erreur. » — TERMINÉE, pas vendue ; aucun job de retrait FillSell. Non relancée (le vendeur l'a arrêtée).
- Reste : redéployer ops-digest (classement du motif neuf).
