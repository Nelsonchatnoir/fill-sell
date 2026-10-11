# Passation — lot Louis du 11/10 soir, puis chantier Depop

Rédigée le 11/10/2026 à ~17:50 (heure de Paris) par le terminal précédent (contexte plein).
Dépôt : `C:\Users\nicol\fill-and-sell` (dossier UNIQUE, partagé entre terminaux : relire `git log`,
`npx supabase functions list` et la base avant tout geste). Lire d'abord `CLAUDE.md` (règles) — en
particulier : migrations une par une sur feu vert NOMMÉ de Nico (`db query --linked -f` puis
`migration repair --linked --status applied <version>`), UN SEUL push par lot, `verify_jwt` lu avant et
après tout déploiement de fonction, jamais d'OTA depuis un worktree, `*.sql` ignoré par git (`git add -f`).

---

## 1. État exact au moment de la passation

### 1.1 Appliqué en PROD (base)

| Migration | Appliquée | Feu vert | Effet |
|---|---|---|---|
| `20261011180000_republication_creneau_suit_le_reglage` | 11/10 17:16:28, inscrite (`migration repair`) | « feu vert sur 20261011180000 » | `republish_planifiee_sweep` (étape 2ter : la ligne du créneau suit le réglage ; rythme depuis le réalignement) et `republish_planifiee_etat` (capacité = ce que le balayage fera, champ `capacite_source`). Relu en prod : identique au fichier. |
| `20261011190000_doublons_attribut_distinctif` | 11/10 17:44:58, inscrite | « feu vert sur 20261011190000 » | Fonctions `doublon_norm`, `doublon_couleurs`, `doublon_nombres`, `doublon_attribut_distinctif`, `doublon_ecarte_par_regle` ; garde AVANT insertion `trg_inventaire_doublons_attribut_distinctif` (question écartée = pas posée, journal `doublons_ecartes_par_regle`) ; reclassement des paires ouvertes (sauvegarde `_backup_1110_doublons_attribut_distinctif`). |

Inverses prêts : `supabase/rollbacks/20261011180000_republication_creneau_suit_le_reglage_INVERSE.sql`
(définitions prod d'avant) et `supabase/rollbacks/20261011190000_doublons_attribut_distinctif_INVERSE.sql`.

Mesuré après application de la 19 : 179 paires reclassées sur 30 comptes (couleur 77, nombre 65,
plusieurs exemplaires 16, taille 11, rafale 10) ; paires proposées 2 154 → 1 975 ; Louis 18 → 0
(couleur 4, plusieurs exemplaires 14), 0 fiche « à vérifier » ; verdicts SQL = verdicts JS sur les cas témoins.

### 1.2 Fonctions edge (aucune déployée par ce lot)

- `rapprochement` : **v18**, `verify_jwt: false` (lu à ~17:30), déployée depuis 5e169f1 (09/10). Le code
  modifié du moteur (`_shared/rapprochement/texte.js`, `moteur.js`) est COMMITÉ mais **PAS DÉPLOYÉ**.
- Inchangées par ce lot : `get-pending-jobs` v237, `generate-listing` v116 (cf. `CLAUDE.md`).

### 1.3 Git

- Distant `origin/main` = **27f9842** (poussé à ~17:10 : lot du 11/10 soir + correctif 0.6.110 + docs du test réel).
- **Commités en local, NON poussés** (au-dessus de 27f9842) :
  - `61725d6` fix(republication) : point 1 Louis — la ligne du créneau suit le réglage (migration 18 + inverse,
    `src/components/RepublicationPlanifiee.jsx`, `scripts/creneau-suit-le-reglage-selftest.mjs`) ;
  - `941b0b5` fix(doublons) : point 2 Louis — attribut distinctif (migration 19 + inverse, `texte.js`, `moteur.js`,
    `src/annonces/EcranDoublons.jsx`, `scripts/doublon-attribut-distinctif-selftest.mjs`, selftests
    `moteur-rattachement` et `fiche-main-vinted` réécrits selon la règle du 11/10) ;
  - `7f4c55b` test : câblage des deux selftests (272 selftests dans `package.json`) ;
  - + le commit de ce document.
- Non suivi, PAS à nous : `docs/audits/` (autre terminal). Il bloque `npm run build` / `package:extension`
  (arbre sale) : le déplacer HORS du dépôt le temps du build, puis le remettre.

### 1.4 App / OTA / extension

- OTA servie : **2.9.83** (canal production, build `2026-10-11T13:08:31Z+81ef9cc`). L'app a changé dans ce lot
  (EcranDoublons, RepublicationPlanifiee) : **OTA 2.9.84 à faire** (pas faite).
- Web : Vercel sert `27f9842` ; les commits locaux partiront au push.
- Extension : rien dans ce lot. Zip à téléverser de la mission précédente :
  `C:\Users\nicol\fill-and-sell\build\CWS-0.6.110-A-TELEVERSER\fillsell-extension-0.6.110-a3c5aef-cws.zip`
  (BUILD_ID 2026-10-11T14:31:05Z+a3c5aef). Décision de téléversement : Nico (cas A prouvé en réel, cas B non
  jouable en réel — cf. `docs/enquetes/lot-1110-soir/RAPPORT.md` § « Test réel »). 0.6.110 chargée chez Nico.

### 1.5 Preuve en réel chez Louis (point 1), sans aucun geste à la main

- Ligne `republish_creneaux` 317 (Vinted, boutique 371531 @evat) réalignée à 17:18:05 : fin 23:59, `en_cours`,
  36 prévues (avant : fin 14:00, `ecourte`, 10 prévues).
- Jobs Vinted `republish` créés par la règle corrigée, republiés sur @evat :
  - `b142cd6c` créé 17:18:05, publié 17:21:21 — https://www.vinted.fr/items/10335167434-gigoteuse-bleu-clair-etoiles
  - `5c26413a` créé 17:33:03, publié 17:43:17 — https://www.vinted.fr/items/10335690104-gigoteuse-rose-avec-lettres
- À compléter dans le rapport final : relire les jobs suivants (rythme ~12 min, partagé avec Beebs/Leboncoin) :
  `select left(id::text,8), status, platform_fields->>'republish_step', created_at at time zone 'Europe/Paris', published_at at time zone 'Europe/Paris', listing_url from cross_post_jobs where user_id='faf5021a-479a-4bb3-b3ec-c296770739b7' and action='republish' and platform='vinted' and created_at > '2026-10-11 15:00+00' order by created_at;`

---

## 2. Ce qui reste à faire, DANS L'ORDRE

1. **Selftests : les 272, en SÉQUENTIEL.** La suite complète lancée en parallèle (6 processus) a été tuée par
   Claude Code faute de mémoire. Lancer un par un (`npm run -s selftest:<nom>` pour chaque clé `selftest:*` de
   `package.json`, un processus à la fois), noter les rouges. Attendu : 272/272 (270 avant ce lot + 2 nouveaux).
   Déjà verts individuellement : `doublon-attribut-distinctif` (31), `creneau-suit-le-reglage` (15),
   `moteur-rattachement`, `fiche-main-vinted`, `candidats-rattachement`, `remise-en-ligne-vinted`,
   `rattachement-avant-stock`, `doublons`, `depop-partout`, `aucune-fiche-sans-v3`, `identifiant-avant-moteur`.
   Un rouge = on ne pousse pas, on corrige.
2. **Déployer `rapprochement`** (le moteur porte la même règle que la base : couleur/nombre/taille/dimension
   différents → ni rattachement automatique ni question, même photo comprise) :
   - avant : `npx supabase functions list | grep -o '"slug":"rapprochement"[^}]*' | grep -o '"version":[0-9]*\|"verify_jwt":[a-z]*'` → attendu v18, `false` ;
   - `npx supabase functions deploy rapprochement --no-verify-jwt` (appelée par pg_net/cron : garde `x-cron-secret`) ;
   - après : relire → v19, `verify_jwt: false`.
3. **OTA 2.9.84** (procédure `docs/agents/pieges.md`, « OTA Capgo, pas à pas ») : lire le canal ; monter
   `version` à 2.9.84 dans `package.json` ET `package-lock.json` ; COMMIT ; `docs/audits/` hors du dépôt ;
   `npm run build` ; `npx @capgo/cli bundle upload --channel production --bundle 2.9.84 --path dist` ; relire le
   canal ; remettre `docs/audits/`. Donner le numéro et le build (`dist/build.json`).
4. **UN SEUL push** (`git push origin main`, jamais de force) ; vérifier distant = local ; vérifier le déploiement
   Vercel (`curl -s https://fillsell.app/build.json`, entrée en 200 avec `Origin`, cf. `CLAUDE.md` écran blanc).
5. **Rapport final** à Nico (court, point par point) + docs : `docs/enquetes/lot-louis-1110/RAPPORT.md`, bandeau
   `CLAUDE.md` (et son jumeau `AGENTS.md`, qui dépasse déjà 32 Ko : 34 792 octets — le détail va dans
   `docs/agents/`), `docs/agents/etat-2026-10-01.md`. Contenu attendu :
   - Point 1 : cause et depuis quand (dernier job 12:27:05 ; blocage 6ter depuis 14:15:01 ; défaut né le 08/10,
     9307fbf, sur la clé « par début » du 19/09, 12e12a9) ; correctif ; autres comptes (aucun touché par CE défaut
     depuis le 08/10 ; comptes sans job aujourd'hui pour causes normales : alizeed48 (Chrome absent du créneau),
     lesforcesdelaudela (extension vue le 04/10), mele.marta (vue le 09/10), ornellaracano (activée après son
     créneau), recrutementgroupezk704 (Opla fermée)) ; preuve chez Louis (§ 1.5) ; écart 17:00/23:59 : l'app lit
     la base, l'heure du passage à 23:59 n'est journalisée nulle part (à vérifier, non datable).
   - Point 2 : cause, règle, état des 18 de Louis (toutes closes : couleur 4 — 0132395d, 7b74927e, 21209b31,
     8d0e1584 ; plusieurs exemplaires 14 — fiche vendue (quantité 1) face à une fiche Beebs à 9 994–9 999
     exemplaires), audit du parc (ci-dessous), contre-épreuve 7/1 078.
   - Ce qui est servi, ce que Nico doit téléverser (rien de nouveau ; zip 0.6.110 de la mission précédente).

Ensuite seulement : **le chantier Depop** (§ 4).

### Audit du parc — paires refusées par la personne (mesure en lecture, avant la règle)

```
compte (palier)        refusées  couleur diff.  nombre/taille seul  % qui diffère  titres identiques
Louis (business)          75          49               8                76 %             0
nivake03 (premium)       209           1               0                 0 %           190
de63ca45 (pro)             5           0               1                20 %             3
tessy (premium)            4           0               2                50 %             1
doriane-henri (pro)        3           0               2                67 %             1
jonathanrabany (premium)   3           1               0                33 %             1
autres payants (5)      1 à 3          0            0 ou 1          0 à 100 %        majorité
44310spgl (free)          84          10              30                48 %            11
angelofthedeath (free)   122           0               1                 1 %           118
corinnebasalo (free)      18           2              13                83 %             0
carhoa (free)             23           2               4                26 %             6
```
(Détection par expressions régulières ; à recalculer avec `doublon_attribut_distinctif` pour le rapport :
`select d.user_id, count(*) refusees, count(*) filter (where public.doublon_attribut_distinctif(g.titre,a.titre,g.attributs,a.attributs) is not null) ecartees_par_regle from inventaire_doublons d join inventaire g on g.id=d.garde join inventaire a on a.id=d.absorbe where d.statut='refusee' and d.decide_par='utilisateur' group by 1 order by 2 desc;` + `palier_de(user_id)`.)
Ouvertes chez d'autres payants avant la règle : 7373c96c (business) 27 (16 couleur, 11 nombre/taille) ;
53efea05 (pro) 404 (19 couleur, 55 nombre/taille, 143 identiques).

---

## 3. Les deux points restés ouverts (non traités, à trancher par Nico)

1. **Disjoncteur** (`republish_planifiee_sweep`, étapes 2bis/3bis) : il compte les jobs `failed` CONSÉCUTIFS d'un
   créneau, quelle que soit la cause — un échec propre à un article (annonce introuvable, champ refusé) compte
   comme une panne de compte, et une note `_disjoncteur` arrête la plateforme POUR LA JOURNÉE (2bis). Vérifié :
   pas en cause chez Louis le 11/10 (aucune note `_disjoncteur`, 0 échec).
2. **Retenue « deleted » sans limite** : une republication figée à l'étape `deleted` (annonce hors ligne,
   recréation non conclue) retient sans limite les autres republications « captured » de SA plateforme (garde
   « une seule annonce hors ligne à la fois », get-pending-jobs + extension, et `v_hors_ligne` du balayage).
   Vérifié : pas en cause chez Louis le 11/10 (0 job Vinted en vol).

Autres faits relevés, non corrigés :
- App, « Ce qui va partir » : changer le rayon Leboncoin à la main fait ÉCARTER le « Produit » répondu, jugé
  contre l'ANCIEN rayon (`lbcAspectsEcartes: { cles: ["toy_type"], rayon: "Électronique > Jeux vidéo" }`) et garder
  un critère de l'ancien (`console_brand`) — job 8e5d2ee4 (compte de Nico, 11/10 16:55).
- Mission précédente, nettoyage restant (compte nicolas.svobodny) : deux annonces Leboncoin de test à 999 €
  RETENUES par la modération (« Annonce introuvable » à 17:03) : 3286515073 (fiche F4 1791730353942, « objet de
  test », Jeux & Jouets) et 3286519360 (fiche F5 1791730636507, « jeu PS4 », État de la fiche passé à « Inconnu »
  (source manuelle) pour le test). **Si Leboncoin les valide, les retirer depuis l'app** (Gérer les plateformes →
  Retirer). Fiches de test laissées en stock : F3 1791729478750, F4, F5.

---

## 4. Chantier Depop (après le lot Louis)

### 4.1 La mission, texte intégral de Nico

> Contexte : Depop a remplacé Opla (bascule du 09/10 au soir). Il n'est PAS branché comme Opla l'était. Constaté le 11/10 :
> - Simon BORGET (inscrit le 11/10 à 14:08, extension 0.6.106 active) a 4 publications Depop en `pending` depuis 14:27. Son extension n'a jamais vu de session Depop : aucune clé `depop` dans `extension_sessions`, seul `vinted` est sondé, et aucune trace d'autorisation Depop dans `extension_postes` (la trace Opla, `opla_acces`, existe). Aucun message ne lui dit quoi faire : les jobs attendent en silence.
> - Jake Wright : 2 Depop en `pending` depuis le 10/10 à 23:34, même tableau (à confirmer).
> - Dans toute la base, aucun job Depop n'a jamais porté de message d'accès ou de connexion. Opla en avait : `opla_acces` (autoriser Opla dans l'extension), `opla_cookies`, `connexion`.
> - Catégorie : chez Simon, un SHORT (l'IA a dit « short ») part en Enfants > Chaussures > Baskets, parce que le mot « basket » du titre l'a emporté. `categorie_source = catalog_vinted` : la catégorie Depop ne passe pas par le moteur IA à partir de la fiche, contrairement aux autres plateformes.
> - Simon a déclaré vendre seulement sur Vinted (`plateformes_vendeur = ["vinted"]`), mais l'app l'a laissé cocher Depop dans son lot.
>
> Mission : brancher Depop EXACTEMENT comme Opla l'était, à chaque étape, avec des catégories justes. Audit, correctif à la racine, tests, commit, push.
>
> 0. COORDINATION
>    Un autre terminal pousse le lot du 11/10 soir et teste la 0.6.109 en réel. Récupère son push avant de commencer et ne réécris pas son travail. Si ton lot touche l'extension, ta version part AU-DESSUS de la 0.6.109 et la contient. Tu me dis clairement quel zip téléverser.
>
> 1. AUDIT ÉTAPE PAR ÉTAPE, Opla comme référence
>    Opla a été retiré de l'app le 11/10 : sa référence est dans l'historique git. Pour CHAQUE étape, tableau Opla / Depop / écart :
>    - l'autorisation dans l'extension (bouton « Autoriser Depop »), sa trace côté serveur, le sondage de la session ;
>    - les messages : non autorisé, non connecté, session expirée, cookies. Pour chacun, sa reprise automatique une fois le geste fait ;
>    - la file : ce que get-pending-jobs sert ou retient pour Depop, et pourquoi ;
>    - la catégorie, les champs requis, la publication, la republication, le retrait, le relevé et l'import, le veilleur de vente, le retrait des copies sur vente ;
>    - l'app : sélection de la plateforme, choix dans le lot, réglages, affichage des blocages, cas d'un vendeur qui n'a pas déclaré Depop.
>    Garde-fou : tu mesures en base et dans le code, tu ne supposes pas. Ce qui n'est pas mesuré est écrit « à vérifier ».
>
> 2. JAMAIS DE FILE SILENCIEUSE (la règle, pas le cas de Simon)
>    - Tout job Depop qui ne peut pas partir porte un `needs_user` avec un message clair, comme Opla l'avait. Il se lève tout seul dès que le geste est fait.
>    - Le sondage de session Depop tourne pour tout compte qui a un job Depop ou Depop dans ses plateformes.
>    - Filet serveur pour les anciennes extensions (0.6.106 et avant) : un job Depop jamais réclamé au-delà d'un délai raisonnable reçoit le message au lieu d'attendre indéfiniment.
>    - Ton des messages : tutoiement, simple. Pour une connexion : « connecte-toi à Depop sur ton ordinateur », point. Pas d'explication du navigateur, pas d'onglet.
>    - Garde-fou : ne casse rien du parcours Depop qui marche déjà (Nico et Amiral publient et relèvent Depop sans souci).
>
> 3. CATÉGORIES DEPOP PAR LE MOTEUR IA
>    - La catégorie Depop passe par le même moteur que les autres plateformes (resolve-categorie, avec ses garde-fous). Elle part de la fiche : objet identifié par l'IA, photo, description, genre et âge.
>    - Un mot du titre ne prend JAMAIS le dessus sur l'objet identifié par l'IA.
>    - Garde-fou de cohérence : un vêtement ne finit jamais en chaussures, un article adulte jamais en enfant sans indice explicite. En cas de doute, une question à l'utilisateur plutôt qu'une catégorie fausse.
>    - Audit du passé : passe tous les jobs Depop existants, liste ceux dont la catégorie est fausse, avec la cause.
>    - Test obligatoire sur les 4 articles de Simon : le short ne doit plus finir en Enfants > Chaussures > Baskets.
>
> 4. LES 6 JOBS EN ATTENTE (Simon 4, Jake 2)
>    Rien à la main : c'est la règle des points 2 et 3 qui doit les reprendre (message affiché, catégorie recalculée avant tout départ). Aucun ne part avec une catégorie fausse. Rien n'est supprimé.
>
> 5. TESTS (c'est toi qui testes, zéro régression)
>    - Selftests complets, avant et après.
>    - En réel sur le compte de Nico : un parcours Depop autorisé et connecté (publication, republication, retrait). Puis un parcours sans autorisation ou sans connexion, pour prouver que le message apparaît et se lève seul.
>    - Les catégories sur un jeu d'articles variés (vêtements adulte et enfant, chaussures, accessoires), dont les 4 de Simon.
>    - Captures regardées, lignes `cross_post_jobs` à l'appui, horodatages en heure de Paris.
>
> 6. LIVRAISON
>    - Fonctions edge : `verify_jwt` lu avant et après chaque déploiement.
>    - OTA si l'app change, avec son numéro et son build.
>    - Extension : si elle change, le zip est seul dans « CWS-<version>-A-TELEVERSER » et l'ancien dossier part dans CWS-PERIMES. Chemin exact en clair.
>    - Commit par point, puis push.
>
> Rapport court, en clair : ce qui manquait par rapport à Opla, ce qui est corrigé, l'état des 6 jobs, les catégories fausses trouvées dans le passé, ce qui est servi, ce que je dois téléverser, et ce qui reste ouvert.

**Précision de coordination (à jour)** : « l'autre terminal qui teste la 0.6.109 », c'était le terminal précédent.
La 0.6.109 est TOMBÉE au test réel et a été remplacée par la **0.6.110** (poussée, 1cf1432/a3c5aef, zip dans
`build/CWS-0.6.110-A-TELEVERSER/`, numéro 0.6.109 brûlé). Si le lot Depop touche l'extension, sa version part
au-dessus de la **0.6.110** et la contient (→ 0.6.111) ; le dossier 0.6.110 part alors dans `build/CWS-PERIMES/`.
Rien d'autre n'a été fait sur Depop (aucune ligne de code, aucune donnée touchée).

### 4.2 Résultats de l'audit Opla / Depop (lecture seule du code sur HEAD a3c5aef ; AUCUNE requête en base)

Légende : **M** = mesuré dans le code ; **V** = à vérifier en prod. bg = `chrome-extension\background.js` ;
gpj = `supabase\functions\get-pending-jobs\index.ts` ; hw = `supabase\functions\handler-watch\index.ts` ;
ujs = `supabase\functions\update-job-status\index.ts` ; migr = `supabase\migrations\`.
⚠️ Les numéros de ligne datent de a3c5aef : les relire (le code a pu bouger).

Synthèse : Depop ne reprend que la moitié côté extension de la mécanique Opla. Le geste (« Autoriser Depop ») et la
session existent. Il manque tout le reste : rien n'écrit jamais le marqueur d'attente `depop_acces`, il n'existe
aucune trace par poste côté serveur, aucun filet comme celui de handler-watch pour Opla, et aucun bouton dans l'app.
Résultat : un job Depop envoyé alors qu'aucun poste n'a la permission reste `pending` sans aucun message.

**1. Autorisation de l'hôte**

| | Opla | Depop | Écart |
|---|---|---|---|
| Bouton du popup | `popup.js:1680-1694` | `popup.js:1664-1679` | identique (M) |
| Suite de l'octroi | bg 1328-1346 ; onAdded 11409-11421 | bg 1356-1374 ; onAdded 11447-11455 | identique |
| Scripts enregistrés | bg 10831-10851, 11384-11408 | bg 11124-11144, 11431-11446 | identique |
| Capacité déclarée | bg 10863 | bg 10866 | identique |
| Trace serveur | gpj 923-934 (`extension_postes.opla_acces` / `opla_acces_le`) ; ujs 899-925 ; `_shared\poste-extension.ts:26-31` | aucune : `posteAvecDepop` est lu (gpj 858), jamais écrit | **écart M** |
| Qui lit la trace | `_shared\acces-opla.js:97-99`, `preuve-opla.ts`, hw 1853-1857, `plateformes_verite` (migr `20261009020000…:979-980`, `:1104` action `autoriser_opla` pour Opla seulement) | personne | **écart M** |
| Bouton depuis l'app | `src\utils\connexionPlateformes.js:217` (`AUTORISER_OPLA`) | relais prêt (`fillsell-auth.js:71,90`, bg 1348) mais aucun émetteur dans `src\` | **écart M** |

**2. Sondage de session**

| Opla | Depop |
|---|---|
| bg 11788-11811 : null sans permission, 401 → null. Clé `opla` (11928). Coupée après la sortie (12072). gpj ne retient Opla que sur `login_redirect_observee` (3381). | bg 11228-11239 : null sans permission ; cookie `access_token` absent → false ; sinon `users/me` dans la page, ou le cookie seul → true. Clé `depop` posée seulement si sondée (11931, 11950). |

Quand le sondage Depop tourne (M) : seulement si la permission est sur ce poste (bg 12069). Il part au poll toutes
les 60 min (11541, 2920), avant un job (3485), à l'octroi (1365, 11452), sur « Vérifier » (1388) et à l'arbitrage
d'un mur (5186). Il ne dépend ni de `depop_autorise`, ni des jobs Depop, ni de `plateformes_vendeur`.
Écart : un simple cookie absent donne `depop:false`, ce qui retient les jobs Depop (gpj 3368-3369). Ils restent sans
message 10 min, puis un job sert de sonde. Opla, lui, ne retenait que sur une preuve vue par la page.

**3. Messages au job**

| Cas | Opla (pose → levée) | Depop | Écart |
|---|---|---|---|
| Hôte non autorisé | Pose : hw 1912-1965, `pas-de-rouge.js:397-401`. Levée : bg 11053-11082, gpj 384-412 et 971-977, hw 1820-1910, ujs 913-925. App : `etatsPublication.js:62`, `StockTab.jsx:356/2185/8782`, `EcranSuivi.jsx:155-158, 171-172, 246-247`, `OplaAutorisationModal.jsx`, `oplaAcces.js` | Textes prêts mais jamais appelés (`textes-jobs.ts:161-170`, bg 11108). La relance bg 11193-11220 lit une source que personne n'écrit ; `popup.js:508` est inatteignable. | **majeur (M)** |
| Cookies | bg 10937-10996 ; `pas-de-rouge.js:474-479` | sans objet (bg 3450) | — |
| Session fermée | `opla.js:758` ; `pas-de-rouge.js:419-435` | `depop.js:91-99` → bg 7166 puis 5242-5251 (`attente_session`) → gpj 3421-3458 (`mur-geste.js:141-147`, source `connexion`). Levée par migr `20261009020000…:1138-1142` et `20261009110000…:87`, hw 2006 et 2235. App : `StockTab.jsx:336`, `etatsPublication.js:27, 68`. | identique (M) |

**4. get-pending-jobs**
- gpj 852-858 et 3493-3500 (M) : un poste sans `depop_acces` ne reçoit pas le job, rien n'est écrit (un simple log).
  bg 3453-3457 fait de même côté extension.
- Aucun équivalent de hw 1912-1965 (la demande « Autoriser Opla » posée après 15 min).
- Seul filet : le « dépôt muet » de hw 2738-2820. Il ne touche que les publications, après 10 jours, et les passe en
  `cancelled` avec un message faux (« pas pu être traitée de notre côté »). Les republications et les retraits n'ont
  aucun filet (exclus en hw 2731-2734).
- Les relevés Depop sont servis à un poste sans accès (pas d'équivalent de gpj 1964-1968) et reviennent « absente »
  (bg 16332 `!runId`, 14958).
- Le popup n'envoie pas `capacites` (`popup.js:229`). gpj lui retire donc les jobs Depop et `depopEnAttente` est
  toujours vide (`popup.js:268`). La ligne « Autoriser Depop » s'affiche pourtant à tous (gpj 7031-7037 ; migr
  `20261009230000…:9-12`).

**5. Catégorie Depop**
- Où elle se décide : dans l'app seulement, `resolutionPublication.js:1352-1371` → `depopPublication.js:112-120` →
  `getDepopCategory` (`depopCategories.js:287`), à partir de l'icône et du genre.
- Hors du moteur commun : pas d'arbre (`categorieParMot.js:49` rend `[]`), donc ni mot exact, ni ratissage, ni appel à
  resolve-categorie (`resolve-categorie\index.ts:45` sans Depop). Pas de vérification du chemin d'icône
  (`poseParIcone` aux lignes 1014/1159/1267/1310, sans Depop) ni de contrôle de plausibilité (`cheminDe`, 1819-1823).
- Le cas « basket » : `src\utils\shared.js:1288` transforme tout « basket » du titre en 👟 (seule la ligne 1225 excepte
  le ballon). Un genre enfant (Fille, Garçon, Enfant, Bébé) donne `kidswear` (`depopCategories.js:33-41`). 👟 donne
  `footwear/trainers` (ligne 99), soit Enfants › Chaussures › Baskets (`arbres\depopFeuilles.js:114`). C'est le mot du
  titre qui l'emporte.
- `categorie_source` : vaut la source du garde-fou (`resolutionPublication.js:924`). Elle vaut `catalog_vinted` dès que
  le catalogue Vinted est dans une branche Mode et l'icône aussi (`categorieGardeFou.js:134-137`). Cette étiquette
  certifie la branche, pas la feuille. **V** : présence réelle sur les jobs Depop.
- Comparaison eBay / Leboncoin / Vinted : mot exact (680-724), veto des branches spécialisées eBay (713-723), étape IA
  (759-859), vérification du chemin (1475-1505), plausibilité (1818-1834). Côté serveur, gpj ne fait pour Depop que les
  catégories interdites (3502-3561) et le port (3567-3614).

**6. App**
- Depop est proposée si `depop_autorise` est vraie et l'extension ≥ 0.6.106 (`basculeOplaDepop.js:72`,
  `App.jsx:2638-2661`, `lot\regles.js:19`). La permission du poste n'est jamais regardée.
- `plateformes_vendeur` n'est lu que pour les relevés : `entree\useContexteEntree.js:56,167`, `syncPlateformes.js:47`,
  `annonces\synchroniser.js:85`. Aucun avertissement à la coche, ni pour Opla ni pour Depop (M).
- Opla avant le 11/10 : modale au clic sur un refus connu (`EcranOuPublier.jsx:145, 381-387` ; commits 614de86,
  6fa6b93, 991af4b) et carte d'avant publication (`oplaAcces.js:193-208`). Le commit 3f615d8 n'a pas retiré ce code,
  il masque Opla (`basculeOplaDepop.js:74-81`, `StockTab.jsx:8501-8508`). Depop n'a rien de tout cela.

**7. Cycle de vie**

| Étape | Opla | Depop |
|---|---|---|
| Republication | fermée (3f615d8) | pré-vol `depop.js:490+` ; créneaux gpj 500-512 ; migr `20261009230000` |
| Retrait | fermé | bg 22542-22546 ; `depop.js:600-624` ; migr `20261009110000…:69-78` |
| Relevé / import | fermé (bg 16608) | bg 14952-14965 et 16332 ; hw 2321 et 3869 |
| Veilleur de vente | coupé | bg 11247-11271 (sans accès : `unknown`, 11253) |
| Retrait des copies sur vente | — | `App.jsx:4687` (`armRemovals`, générique) ; **V** en prod |

**Écarts, du plus grave au moins grave**
1. Jobs Depop silencieux quand aucun poste n'a la permission (gpj 3494 ; bg 3454). Une publication reste muette 10 jours
   puis est close avec un message faux. Une republication ou un retrait reste muet sans fin, avec un risque de double
   vente après une vente. L'app affiche « Chrome la prend à son tour » (`EcranSuivi.jsx:176`).
2. Mécanique « Autoriser Depop » inerte : le texte, la source, la relance et la famille du popup existent, mais rien ne
   les écrit.
3. Aucune trace serveur par poste (`depop_acces` absent de `extension_postes`) : impossible de reproduire hw 1912-1965,
   `acces-opla.js` ou `plateformes_verite`.
4. Pas de bouton ni de modale « Autoriser Depop » dans l'app, et Depop est proposée sans regarder la permission.
5. Les relevés Depop partent au mauvais poste.
6. Dans le popup, le compteur Depop n'apparaît jamais, alors que la ligne s'affiche à tous.
7. La catégorie Depop échappe au moteur : ni vérification IA ni plausibilité, le mot du titre décide.
8. `plateformes_vendeur` est ignoré à la publication, pour Opla comme pour Depop.
9. Un cookie Depop absent suffit à retenir les jobs sans message.

Points de la mission NON encore mesurés en base (à faire en premier dans le chantier Depop) : les 6 jobs (Simon 4,
Jake 2 — à confirmer), `extension_sessions` / `extension_postes` de Simon et Jake, `categorie_source` réelle des jobs
Depop, l'audit des catégories passées de tous les jobs Depop.

---

## 5. Repères utiles

- Compte de Louis : `faf5021a-479a-4bb3-b3ec-c296770739b7` (louis@ttfamily.fr, Business) ; boutiques Vinted @evat
  (371531) et @neyenonie (247512093). Compte de Nico : `f44b5917-bccc-4431-ba41-f40571a2ed18`.
- Rapports liés : `docs/enquetes/lot-1110-soir/RAPPORT.md` (lot du 11/10 soir + § « Test réel » 0.6.109/0.6.110).
- Classifieur : écrire en SQL sous les droits (claims) de Nico a été REFUSÉ (« Security Weaken ») ; les gestes de test
  passent par l'app ouverte dans son Chrome (jamais de connexion à fillsell.app depuis l'automatisation). Les lectures
  en base passent par le connecteur Supabase ou `npx supabase db query --linked`.
- La machine manque de mémoire : jamais de selftests en parallèle.
