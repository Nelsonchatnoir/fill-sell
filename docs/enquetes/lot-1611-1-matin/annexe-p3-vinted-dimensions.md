# P3 — carhoa, « Après-ski Decathlon noir taille 38 » : refus Vinted « dimensions du colis » classé en « aléa »

Diagnostic en lecture seule, le 16/11/2026. Aucun fichier suivi modifié, rien écrit en base, rien déployé.
Job `7dd1a5de-63f2-4adc-8162-caeffe77ab0a` (publish, Edge, extension 0.6.186), compte 6f41de45… (carhoa).

## Résumé
1. **Cause amont : le rayon.** Le mot « ski » de « Après-ski » a envoyé l'article dans le rayon **4733 « Sport › Sports
   d'hiver › Matériel de ski › Skis alpins »** (`categorie_source: mot_cle`, `categorie_mot_cle_titre: ski`, icône 🎿).
   Le bon rayon est « Femmes › Chaussures › Bottes › Bottes de neige » (2621). Les rayons de chaussures ont la grille
   Petit/Moyen/Grand, où « Petit » serait passé.
2. **Dans ce rayon, Vinted exige des dimensions de colis.** Le formulaire n'affiche pas la grille « Format du colis ».
   La question posée par FillSell a proposé 16 formats, et carhoa a choisi « Petit ». La sonde a ajouté
   `package_size_id: 1` dans le POST, et Vinted a répondu 400 : `package_size` « Ces dimensions sont supérieures aux
   limites maximales autorisées », et `parcel_dimensions_height`, `parcel_dimensions_width` et
   `parcel_dimensions_length` à remplir.
3. **L'extension disait vrai, le serveur a remplacé son message.** L'extension 0.6.186 a écrit « Vinted exige les
   dimensions… FillSell ne sait pas encore les renseigner ». `pas-de-rouge` a reconnu « package_size + 400 » comme un
   refus de format, puis l'a classé `colis_non_affiche`. Résultat : reprise **toutes les 30 min sans plafond**,
   **12 reprises**, et le message faux « C'est un aléa de Vinted, rien à faire de ton côté ».
4. **Autres comptes : un seul refus identique.** ayadi007, chariot (rayon 4031), le 06/11, déjà annulé. Mais **un autre
   job d'ayadi007 est bloqué en ce moment** (`9c7d4951`) sur la question « Format du colis » dans ce même rayon : toute
   réponse mènera au même refus, puis à la même boucle.
5. **Correctif urgent côté serveur seulement**, sans nouvelle version de l'extension : classement vrai, sans reprise,
   plus le blocage de la question « format » dans un rayon à dimensions. Pour **envoyer** des dimensions, il faut
   d'abord une capture réelle, puis une nouvelle version de l'extension (la décision « saisie des dimensions » est
   ouverte depuis le 07/11).

## Chronologie (heure de Paris, lue dans `platform_fields`)
| Heure | Fait (source) |
|---|---|
| 14/11 18:53 | Job créé, rayon 4733 Skis alpins (`vinted_ids.catalog_id: 4733`, `categorie_source: mot_cle`) |
| 14/11 18:58, 19:04 | Grille absente au dépôt, verdict « formulaire raté », 2 essais rapprochés (`colis_formulaire_rate.n: 2`) |
| 14/11 19:16 | 3e constat, needs_user « Vinted demande le format du colis pour ce rayon et n'en coche aucun : choisis-le » (`erreurs_archivees`) |
| 14/11 22:05 | carhoa répond « Petit » (`needsUserResolved: {"colis_choisi.libelle": "Petit"}`) |
| 14/11 22:07 | 1er 400 sur les dimensions (`platform_category_aspects`, Skis alpins, `parcel_dimensions_*`, `first_seen_at`) |
| 14/11 22:07 → 15/11 22:19 | Boucle `colis_non_affiche` toutes les 30 min, `pas_de_rouge_reprises: 12` (une seule coupure : un échec du sélecteur photo à 21:37, puis une relance de sa part à 21:44) |
| 15/11 22:38 | Annulé par elle (`annulee_dans_la_file`, `arret_utilisateur`) |
| 15/11 22:39 | Nouveau job `ff5f2925`, rayon 4741 « Autres équipements de ski » (vérification par IA, toujours pas le bon rayon), grille au poids, « 5 kg » par défaut. **Publié.** |

## 3.1 Pourquoi le format dépasse les limites, et ce que Vinted attend

**Ce qui a été envoyé** (`last_diagnostic` du job) :
`…"catalog_id":4733,"isbn":null,"ai_photo":false,"price":"7","package_size_id":1,…`,
avec la mention « package_size_id POSÉ dans le corps par la sonde (1) — la page l'avait laissé vide ».
Le bilan colis confirme : `colis_bilan.source: "envoi_direct"`, `libelle: "Petit"`.

**Réponse 400 complète** (`server_required_fields` du job ; `error_technique.brut` est coupé par la sonde) :
```
package_size              « Ces dimensions sont supérieures aux limites maximales autorisées »
parcel_dimensions_height  « Ajoute une hauteur »
parcel_dimensions_width   « Ajoute une largeur »
parcel_dimensions_length  « Ajoute une longueur »
```

**Ce que Vinted propose pour le rayon 4733.** Les avertissements disent « section non rendue par Vinted » et « section
toujours absente au dépôt » : le formulaire n'affiche pas la grille. Le référentiel
`shipping-estimation/external/catalogs/4733/package_sizes` répond HTTP 200 avec 16 formats :
`1|Petit · 2|Moyen · 3|Grand · 4|Personnalisé · 5|Remise en main propre · 8..17 (5–80 kg) · 18|Très petit`
(`colis_bilan.referentiel`). Pour comparer, un rayon ordinaire (1810) n'en a que 4 : 1, 2, 3 et 8.

**Le même schéma chez ayadi007** (job `43b69049`, rayon 4031 « Chariots à outils », 06/11) :
- même référentiel à 16 formats ;
- « Grand » envoyé directement ;
- même 400 sur les dimensions.

**En base, deux rayons seulement portent des `parcel_dimensions_*`** (`platform_category_aspects`, source `server_400`) :
« Chariots à outils » et « Skis alpins ».

**Réponse :**
- Dans ces rayons, aucun format standard (Petit, Moyen, Grand, poids) n'est accepté. Vinted veut les **dimensions du
  colis** dans `parcel_dimensions_height`, `parcel_dimensions_width` et `parcel_dimensions_length`.
- « Ces dimensions sont supérieures aux limites » vise le format standard envoyé, refusé dans ce rayon. Le rayon 4733
  impose ces dimensions parce qu'il est fait pour des skis.

**NON PROUVÉ, aucune trace dans le dépôt ni en base :**
- la forme exacte du corps du POST pour les dimensions (clés, imbrication) ;
- l'unité (cm probable, pas lue) ;
- les valeurs limites ;
- l'id à envoyer avec (`4|Personnalisé` ?).

Pourquoi ce manque : `grilleDuReferentielColis` (`chrome-extension/content-scripts/vinted.js:903-908`) **jette**
`parcel_measurements`, `type` et `custom` de la réponse du référentiel (`parcel_measurements: null` pour 1810 dans
`scripts/vinted-colis-referentiel-selftest.mjs:54`). Les captures de republication ne portent rien sur le colis :
`vinted_republish_captures` sur 60 jours, 21 860 lignes, 0 avec `parcel`.

Il faut donc **une capture réelle** sur le compte de Nico (annonce de test à 999 € ou plus, rayon 4733 ou 4031) :
ce que le formulaire affiche, et le POST.

**Attention, la signature à 16 formats ne suffit pas comme preuve.** Le rayon 4070 (nettoyeur haute pression,
JEAN-LUC LASSARAT `5ac7684b`) a le même référentiel à 16 formats, et son annonce d'origine porte
`package_size_id: 9` (10 kg). La seule preuve fiable reste un 400 sur `parcel_dimensions_*` déjà observé.

## 3.2 Envoyer les dimensions : où, et ce qui existe déjà

**Aujourd'hui, l'information n'existe nulle part. Rien à envoyer sans la demander.**
- `inventaire.poids_g` est NULL pour cet article (id 1794678188319). C'est un poids, pas des dimensions.
- `inventaire.attributs` n'a aucune clé de colis. `mesure_largeur` et `mesure_longueur` (14 articles) sont des mesures
  de **vêtement** (`measurement_width` / `measurement_length`, `src/utils/vintedAttributs.js:63`), jamais des
  dimensions de colis.
- `attributs.colis_vinted` ne contient qu'un **libellé de format** (`src/components/ListingPreviewScreen.jsx:12033`).

**Ce qui existe déjà pour demander des valeurs dans l'app (sans rien inventer) :**
- `needsUserField` (un champ) et `needsUserFields` (jusqu'à 4 champs en plus, dans un même geste) : voir
  `src/tabs/StockTab.jsx:1299-1311`. La réponse s'écrit dans `pf[target.root][target.key]` et dans
  `needsUserResolved["root.key"]` (`StockTab.jsx:1697-1736`). Le mécanisme « tranché par l'utilisateur » est déjà
  respecté par les handlers.
- Unités : `src/utils/champsDimension.js:20-34` (`uniteDuChamp`, `valeurAvecUnite`, en cm) sert **déjà** à demander
  Largeur, Longueur et Hauteur sur eBay (Jocabroc, 25/09). Il est limité à eBay (`if (platform !== "ebay") return null`,
  ligne 21) : il suffit de l'ouvrir aux 3 clés `parcel_dimensions_*` de Vinted.
- La saisie numérique existe déjà : `input_type: "number"` (`supabase/functions/_shared/port-depop.js:62`).

**Ce qui bloque, et doit rester ainsi tant que l'extension ne sait pas les poser :**
- `chrome-extension/background.js:6666-6668` : `NON_RESOLUBLES` contient `parcel_dimensions_*`.
- `supabase/functions/update-job-status/index.ts:4297-4315` : la question sur une clé `parcel_dimensions_*` est
  retirée, parce que ce champ n'est jamais relu.

**Le circuit à construire, une fois la décision prise par Nico et la capture faite :**
1. Question needs_user à 3 champs nombre en cm, cible `{root: "colis_dimensions", key: "hauteur_cm" | "largeur_cm" |
   "longueur_cm"}`. Un canal à part, **pas** `vintedAspects`, que la boucle d'attributs chercherait dans le formulaire.
2. get-pending-jobs les sert sur le job (via `needsUserResolved`). On peut les retenir sur la fiche
   (`attributs.colis_dimensions`), comme `colis_vinted`.
3. Extension : armer les valeurs à côté de `armerColisPourPost` (`vinted.js:815-820`). La sonde les ajoute au corps
   avec `corpsAvecColis` (`background.js:11027-11060`), et seulement si la page les a laissées vides, comme pour le
   colis, l'ISBN ou la marque.
4. Garder `parcel_measurements` dans `colis_bilan.referentiel` (`vinted.js:903-908`, `977-985`) pour connaître les
   limites du rayon.

## 3.3 Où ce refus devient « aléa / reprise », et le correctif

**Le chemin exact, preuve à l'appui :**
1. L'extension 0.6.186 donne le message vrai et `dimensionsColisExigees: true` (`vinted.js:6014-6017`, `6076-6077`,
   `6085`). Ce drapeau n'est **lu nulle part**.
2. L'arrière-plan : toutes les clés sont dans `NON_RESOLUBLES`, donc `updateJobStatus(…, "failed", { error: base + probe })`
   (`background.js:6687`). La sonde ajoute `[sonde réseau : … HTTP 400 … "field":"package_size" …]`.
3. update-job-status : la règle des dimensions (`index.ts:4302`) ne joue **que sur needs_user** avec une question
   `parcel_dimensions_*`, c'est-à-dire pour les extensions ≤ 0.6.176. Depuis la 0.6.177 le statut est `failed`, et
   c'est `pas-de-rouge` qui tranche (`index.ts:4530`, `4607`, puis `4678-4679` : le message de l'extension part dans
   `error_technique.brut`).
4. `supabase/functions/_shared/pas-de-rouge.js:638` : `refusColisVinted(t)` est vrai. La règle
   (`vinted-colis.js:38-44`) demande `/package_size/` et `/400/`, et la réponse de la sonde contient les deux.
5. `pas-de-rouge.js:639` : `colisEnvoyeEtRefuse(t)` est faux. La mention « package_size_id POSÉ dans le corps » n'est
   que dans `diagnostic` (`vinted.js:6029`), jamais dans le message d'erreur des dimensions.
6. `pas-de-rouge.js:653-657` : le poste a la version 0.6.186 (`posteAvecEnvoiColis` vrai), donc
   `colis_non_affiche`, reprise **30 min fixes**, sans compteur ni plafond. Le message vient de `vinted-colis.js:75-80`
   (« la page de Vinted n'a pas affiché les formats… C'est un aléa de Vinted, rien à faire de ton côté : nouvel essai
   automatique »).

**Reproduction sur le code actuel** (`.tmp-terminal/p3/verrou-proto.mjs`, refus réel de carhoa) :
```
refusColisVinted: true | colisEnvoyeEtRefuse: false | posteAvecEnvoiColis: true
{"action":"publish","reprises":0,"verdict":"reprise","statut":"pending","motif":"colis_non_affiche","dansMinutes":30,…"C'est un aléa de Vinted…"}
{"action":"publish","reprises":11,…"motif":"colis_non_affiche","dansMinutes":30,…}     ← aucun plafond
{"action":"republish","reprises":0,…"Ton annonce a été retirée de Vinted… C'est un aléa de Vinted…"}
ROUGE (3)
```

**Correctif proposé (serveur seulement, la règle vaut pour tous les comptes) :**
- A. `supabase/functions/_shared/vinted-colis.js`, après la ligne 44 :
  - `export function refusDimensionsColisVinted(t)`, vrai sur `/parcel_dimensions_(height|width|length)/i` ou sur
    `/Vinted exige les dimensions du colis/i` ;
  - `messageDimensionsColis(action, pf)`, qui nomme le rayon (`pf.categoryPath`).
- B. `supabase/functions/_shared/pas-de-rouge.js`, **avant la ligne 629** (la règle « 0 bis » des formats), sur le modèle
  de « neuf seulement » (lignes 672-682) :
  ```js
  if (platform === "vinted" && (action === "publish" || action === "republish") && refusDimensionsColisVinted(t)) {
    return { verdict: "a_toi", statut: "needs_user", motif: "vinted_dimensions_colis", source: "relancer",
             message: messageDimensionsColis(action, pf) };
  }
  ```
  - Message pour une publication : « Vinted demande les dimensions du colis (hauteur, largeur, longueur) pour le rayon
    « Sport › Sports d'hiver › Matériel de ski › Skis alpins », et FillSell ne sait pas encore les envoyer : rien n'a
    été publié. Choisis un autre rayon Vinted pour cet article depuis l'app, puis relance la publication, ou publie-le
    toi-même sur Vinted. »
  - Pour une republication : « Ton annonce a été retirée de Vinted et n'est pas encore revenue en ligne… Rien n'est
    perdu : ses données sont sauvegardées… ».
  - Jamais de `dansMinutes`. Plus de boucle : seul un clic de la personne relance.
  - Option, à faire décider par Nico : à la place de « relancer », la question de **rayon**
    (`categoryLevelChoice` + nouvelle `raison`, voir `_shared/rayon-refuse-moteur.js:536-540` et
    `handler-watch/index.ts:2857`). Limite : elle ne propose que la même racine (« Sport »), et donc pas « Bottes de
    neige ».
- C. `supabase/functions/update-job-status/index.ts:4302-4315` : étendre le bloc « dimensions ». Une question `colis`
  (cible `colis_choisi.libelle`) dans un rayon où un 400 `parcel_dimensions_*` est **déjà prouvé**
  (`platform_category_aspects`, `platform='vinted'`, `category_key` égal au chemin, `field_key like
  'parcel_dimensions_%'`, `source='server_400'`) devient le message vrai, sans question dont toutes les réponses
  échouent. C'est le cas, en ce moment, d'ayadi007 `9c7d4951`.
- À déployer : `update-job-status`, ainsi que `get-pending-jobs` et `handler-watch` qui importent `pas-de-rouge.js`.
  Versions et `verify_jwt` à lire avant et après le déploiement.
- Cause amont, correction séparée à faire décider par Nico : `src/utils/shared.js:1685`
  `[/\bskis?\b|snowboard/i, '🎿']` reconnaît « Après-**ski** », et l'icône 🎿 mène à « Skis alpins »
  (`src/utils/vintedCategories.js:588`). Il faut une règle « après-ski » vers les chaussures (bottes de neige) placée
  **avant**. La vérification par IA du 2e job a choisi « Autres équipements de ski », tout aussi faux.

## 3.4 Autres comptes touchés (Vinted, 60 jours)

Requête (`.tmp-terminal/p3/q15.sql`) : jobs Vinted dont l'erreur ou `platform_fields` contient un refus
`package_size` (`"field":"package_size"`, « Sélectionne le format de ton colis », « Vinted exige le format du colis »)
ou des dimensions (`parcel_dimensions`, « supérieures aux limites », « dimensions du colis »). On écarte les simples
mentions de `package_size_id` dans le corps du POST.

**Même refus « dimensions » (2 jobs, 2 comptes) :**

| Compte | Job | Statut | Créé | Rayon | Format envoyé | Classement |
|---|---|---|---|---|---|---|
| ayadi007 | 43b69049 | cancelled | 06/11 12:44 | 4031 Maison › Outils et bricolage › Transport et rangement des outils › Chariots à outils | Grand (envoi direct), 0.6.176 | question sur `parcel_dimensions_height`, réponse « Meuble » (cas d'origine du 07/11) |
| carhoa | 7dd1a5de | cancelled | 14/11 18:53 | 4733 Sport › Sports d'hiver › Matériel de ski › Skis alpins | Petit (envoi direct), 0.6.186 | `colis_non_affiche`, 12 reprises, dernière le 15/11 22:19 |

**Même rayon « à dimensions », pas encore refusés mais bloqués** (`.tmp-terminal/p3/q18.sql`, signature
`colis_bilan.referentiel` contenant « 4|Personnalisé ») :

| Compte | Job | Statut | Créé | Rayon | État |
|---|---|---|---|---|---|
| ayadi007 | cad8e650 | cancelled | 10/11 08:56 | 4031 Chariots à outils | annulé par lui |
| ayadi007 | **9c7d4951** | **needs_user** | 12/11 19:03 | 4031 Chariots à outils | **question « Format du colis » ouverte (13 choix) : toute réponse mène au 400 « dimensions », puis à la boucle `colis_non_affiche`** |
| JEAN-LUC LASSARAT | 5ac7684b | pending (prochain essai 10/11 15:57, en retard) | 04/11 17:36 | 4070 (nettoyeur haute pression), republish | aucun refus de dimensions ; l'annonce d'origine a le format 10 kg. À surveiller seulement. |

**Refus `package_size` « format absent »** (autre cause, déjà traitée en septembre et octobre) : XEWER b0d455f2 et
6aabc550, nerema75 81bf5d44, nadegemarcelin78 edd1e8c1, Lohan 21a71cc8 et 143f3105, patrick giry e97b4c67. Aucun
après le 06/10. Le motif `colis_non_affiche` n'a été posé qu'une fois en 60 jours : sur carhoa.

## Selftest « verrou » proposé

`scripts/vinted-colis-dimensions-selftest.mjs`, lancé par `npm run selftest:vinted-colis-dimensions`. Le prototype
`.tmp-terminal/p3/verrou-proto.mjs` est **ROUGE aujourd'hui**, sortie ci-dessus. Le test attend :
1. Refus réel de carhoa (0.6.186), en publication : `needs_user`, motif `vinted_dimensions_colis`, aucun `dansMinutes`,
   un message qui nomme les dimensions et le rayon, et ne contient ni « aléa », ni « rien à faire de ton côté », ni
   « nouvel essai automatique ».
2. Le même refus avec `reprises: 11` : aucune reprise, donc la boucle est fermée.
3. Le même refus en republication : pas de `pending` en boucle, et le message dit « retirée ».
4. Le texte d'ayadi007 (0.6.176, « Champs exigés par Vinted : package_size, parcel_dimensions_height… ») : même règle.
5. Non-régression, à l'identique d'aujourd'hui :
   - le T-shirt de patrick giry (« Sélectionne le format de ton colis », 0.6.100) donne toujours `colis_non_affiche` ;
   - un ancien poste donne toujours `colis_non_propose` ;
   - « envoyé directement, refusé quand même » donne toujours `colis_refuse_meme_envoye`.
6. Si C est fait : vérification sur la structure d'`update-job-status`. Une question `colis` dans un rayon avec un
   `server_400 parcel_dimensions_*` ne survit pas.

Sélection relancée aujourd'hui, toute **VERTE** : `pas-de-rouge`, `vinted-colis-referentiel`, `vinted-colis-serveur`,
`vinted-colis-envoi`, `extension-0-6-177`, `vinted-colis`, `vinted-colis-categorie`. La suite complète reste à
relancer avant le commit.

## Faut-il une nouvelle version de l'extension ?
- **Correctif A + B + C (message vrai, fin de la boucle, plus de question sans issue) : NON.** Tout se passe côté
  serveur (`pas-de-rouge.js`, `vinted-colis.js`, `update-job-status`). Le message de l'extension 0.6.186 est déjà
  juste.
- **Envoyer les dimensions (3.2) : OUI.** Il faut une version neuve (armement plus sonde), et avant elle :
  1. la décision de Nico « saisie des dimensions » ;
  2. une capture réelle (compte de Nico, annonce de test à 999 € ou plus, rayon 4733 ou 4031).
- En option, dans cette même version : garder `parcel_measurements` du référentiel dans le diagnostic.

## ⚠️ Un autre terminal modifie `update-job-status`
À la fin de ce diagnostic, `git status` montre deux changements qui ne viennent pas de moi :
- `supabase/functions/update-job-status/index.ts` modifié : 68 lignes ajoutées, côté eBay ;
- `supabase/functions/_shared/ebay-aspects-depot.ts` ajouté, pas encore suivi par git.

Je n'ai touché à rien. Les numéros de ligne d'`index.ts` cités ici sont ceux du commit **33147cb**. Dans la copie de
travail, ils sont décalés de 65 : le bloc des dimensions est en 4362, `classerEchec` en 4672. Le correctif C touche
le même fichier : il faut se coordonner avant d'y écrire.

## Fichiers de travail (`.tmp-terminal/p3/`)
- Requêtes : `q1.sql` à `q20.sql` (toutes lancées en `--read-only`).
- Résultats : `r2.csv` (`platform_fields` des 2 jobs), `r14.csv`, `r15.csv`.
- Prototype du verrou : `verrou-proto.mjs`.
- Ce rapport : `RAPPORT-P3.md`.
