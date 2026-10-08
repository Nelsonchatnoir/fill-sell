# Audit de fiabilisation — 08/10/2026 (soir), lecture seule

HEAD audité : `6494276` (poussé le 08/10, web servi `2026-10-08T20:17:29Z+6494276`).
Périmètre : tout le fonctionnement sauf le vocal. **Rien n'a été modifié** :
aucune écriture en base (toutes les requêtes en `set transaction read only`),
aucune migration, aucun déploiement, aucun mail, aucun compte touché.
Comptes de test, de Nico et d'Ornella exclus de tous les comptages (liste
`BLAST_BASES_INTERNES` d'`email-tunnel`, adresses `%test%` et `@fillsell.app`,
`f8aa02a5`). Comptes désignés par les 8 premiers caractères de leur uuid.
Heures de Paris. **[mesuré]** = requête dédiée, chiffre lu ; **[estimé]** =
règle approchée (dite) ; **à vérifier** = non établi.
Méthode : un coordinateur et cinq passes parallèles (identité/synchro,
ventes/retraits, extension/jobs, paiements/quotas, décalages/crons), environ
150 requêtes en lecture seule, définitions SQL lues en prod
(`pg_get_functiondef`), journaux Supabase (lecture). Les points les plus lourds
ont été recontrôlés par une seconde requête (signalé « recontrôlé »).

## Résumé (en français simple)

```
GRAVE (double vente possible aujourd'hui)
- Les ventes Vinted ne s'enregistrent plus toutes seules depuis le 28/09 : 109 articles vendus sur
  Vinted sont encore « en stock » (35 comptes), et 28 ont encore des annonces ailleurs (10 comptes).
- Un article remis en ligne sur Leboncoin/eBay/Beebs/Opla devient une 2e fiche : 55 articles exposés (9 comptes).
- 3 annonces Opla d'articles vendus sont notées « retirées » mais revues en ligne (à vérifier sur Opla).
- 27 retraits d'articles vendus attendent un ordinateur éteint ou un accès Opla, sans prévenir la personne ;
  un clic « Vendue ? » sur une annonce morte peut retirer l'annonce vivante (89 fiches).
MOYEN
- Des règles n'ont plus d'exécutant depuis la coupure des crons 17/22 (6 249 fiches jamais examinées) ;
  les questions débordent (3 267 « Vendue ? », 2 107 rapprochements) ; 1 097 fiches Vinted mortes jamais datées.
- Paiements : un payant qui ne paie plus garde son palier ; webhook Google sans authentification ;
  lecture d'abonnement d'un autre compte possible ; quotas Premium/Pro décomptés sur des échecs.
- Surveillance : aucun cron ne rend son vrai résultat ; l'ops-digest ne voit ni crons coupés, ni rafales de fiches.
MINEUR : compteurs faux, lectures tronquées, docs en décalage (0.6.104 déjà servie à 21 comptes).
SOUS CONTRÔLE : prise des jobs atomique, ventes eBay auto, pas de double vente par course serveur, crons exécutés.
```

---

## 0. URGENCES (risque de double vente actif)

### U1 — Les ventes Vinted PROUVÉES ne s'enregistrent plus seules depuis le 28/09 16:46
- **Gravité** rouge — **Classes** 2, 4, 5, 10.
- **Où** : `enregistrer_ventes_prouvees(p_user)` (migrations `20260928140738` /
  `20260928143457`, « GO Nico 28/09 : vente certaine sur identifiant exact,
  automatiquement ») existe en prod mais n'a **aucun appelant**. Son appel dans
  `get-pending-jobs` a été retiré le 28/09 à 16:46 (commit `125599d`, latence —
  `docs/INCIDENT_ASTRA_2026-09-28_LATENCE.md` : « ne pas réintroduire le
  balayage à chaque poll sans cause et charge vérifiées ») et rien ne l'a
  remplacé. Le déclencheur `cross_post_jobs_preuve_vente_retire_copies` est
  inerte : le « Point A » d'`armer_retrait_job_pour` exige une ligne `ventes`
  sur une fiche `vendu`. Une vente Vinted vue `sold` attend donc le clic de la
  personne sur le bandeau « Vendue sur Vinted 🎉 ». Seul eBay enregistre seul.
  Les docs disent l'inverse : `docs/agents/consignes-2026-09-28.md` (« s'enregistre
  automatiquement »), en-tête de `20261008101000`,
  `docs/reprise/terminal-cloture-multi-synchro-0810.md:43`.
- **Preuve** [mesuré, recontrôlé] :
  - aucun appelant : 0 fonction SQL, 0 cron, 0 déclencheur (`pg_proc.prosrc`,
    `cron.job.command`, `pg_trigger`), 0 ligne de code (`chrome-extension/`,
    `supabase/functions/`, `src/`). Dans les journaux edge sur 24 h : **0 appel**,
    contre 9 pour `enregistrer_vente_atomique` et 33 pour
    `enregistrer_vente_declaree` sur la même fenêtre ;
  - **109 annonces Vinted** `published` avec `sale_signal = 'sold'` sur une
    fiche en stock à pièce unique, **35 comptes**. **91** ont la preuve exacte,
    c'est-à-dire le critère même de la règle (instantané `sold` postérieur à la
    publication). 81 attendent depuis plus de 2 jours, 24 depuis plus de
    7 jours, la plus ancienne depuis le 27/09. La passe « ventes » trouve 107 /
    33 comptes avec un filtre voisin ;
  - **28 de ces fiches ont des copies publiées ailleurs (10 comptes)**, dont 14
    copies vues en ligne dans les 3 derniers jours :
    - bd380fbf : 5 copies Opla ;
    - 68e350f0 1790234431981000 : Leboncoin 3261964869, Opla, Beebs ;
    - 66ffd657 1790523715035002 (signal depuis le 27/09) : Leboncoin 3254540549,
      Beebs 33796736, eBay 820034102196 ;
    - 53efea05, 3424a25d ;
  - silence :
    - `push-ventes/index.ts:50` passe `retraitsACliquer: 0` en dur : le mail de
      vente ne dit pas qu'il reste des copies à retirer ;
    - l'ops-digest ne voit que les retraits armés depuis plus de 24 h, jamais
      une vente non enregistrée.
- **Risque** : l'article vendu sur Vinted reste achetable sur Leboncoin, eBay,
  Beebs ou Opla pendant des jours, et le stock comme les chiffres sont faux.
- **Correctif à la racine** : rebrancher la règle sur un événement, pas sur
  chaque poll.
  - Appel de `enregistrer_ventes_prouvees` à la **fin de chaque relevé du
    dressing** (même voie que `trg_rapprochement_fin_run`).
  - Filet cron borné aux `comptes_actifs(7)`, lots de 5, **CPU mesuré avant la
    mise en prod** (règle du 04/10).
  - Section ops-digest « vente prouvée non enregistrée depuis plus de 2 h avec
    copie en ligne », et le vrai compte de copies dans le mail.
  - Corriger les docs qui la disent active.
- **Effort** : M.

### U2 — Remise en ligne hors Vinted : le même article sur DEUX fiches en stock
- **Gravité** rouge — **Classes** 1, 5.
- **Où** : `_shared/rapprochement/remises-en-ligne.js` ne couvre que Vinted.
  Pour Leboncoin, eBay, Beebs et Opla, le chemin d'une annonce remise en ligne
  sous un nouvel identifiant est le suivant :
  1. elle bute sur `conflit_de_groupe` (`moteur.js:332`) tant que l'ancienne
     n'est pas datée ;
  2. son doute est écarté (`:349-353`) ;
  3. elle part en « Annonce en double ? » (`:470`), puis une fiche neuve est
     créée (`rapprochement_v3_appliquer` → `rapprocher_importer`) ;
  4. le mode normal ne rejuge jamais un import créé (`rapprochement/index.ts:241`).
- **Preuve** [mesuré, passe « identité », requête relue] :
  - **55 articles exposés, 9 comptes** : l'ancienne fiche garde une annonce
    Vinted vue en ligne depuis moins de 7 jours, ou une autre copie vivante ; la
    nouvelle porte l'annonce remise en ligne. Répartition :
    - 53efea05 : 40 ;
    - Beebs : 7804bb4a 4, 39bfa95a 2, afeef3c7 1 ;
    - Opla : de63ca45 2 ;
    - Leboncoin : 3424a25d, 5f704c61, 7804bb4a, de63ca45, faf5021a, 1 chacun ;
    - eBay : 68e350f0 1 ;
  - même photo de couverture sur 78 paires eBay sur 81, et sur 69 paires
    Leboncoin sur 75 ;
  - sur 30 jours (borne basse, titre exact), fiches fantômes : Leboncoin 69
    (8 comptes), eBay 79 (3), Beebs 7 (3), Opla 2 (1).
- **Risque** : l'article se vend sur l'annonce remise en ligne. La fiche neuve
  passe « vendu », mais l'annonce Vinted et les copies de l'ancienne fiche
  restent en vente.
- **Correctif à la racine** :
  - étendre la règle « remise en ligne » à toutes les plateformes : jamais en
    ligne ensemble, mêmes photos, accord fort du titre, aucun rival. Alors la
    nouvelle annonce rejoint l'ancienne fiche, et le job mort est clos
    « remplacée, pas une vente » ;
  - rattrapage en mode réparation. Le moteur est déjà écrit pour Vinted (règle
    inerte, migration `20261008160000`).
- **Effort** : M–L.

### U3 — Retraits Opla clos « supprimée » sur un simple « unavailable », annonces revues en ligne
- **Gravité** rouge (à confirmer sur la page Opla) — **Classes** 9, 3.
- **Où** : clôture `delete_confirmed_by = 'etat_annonce'` (extension,
  `checkListingState`). Un état lu « unavailable » vaut preuve de suppression,
  et rien ne rouvre un retrait clos quand un relevé revoit l'annonce.
- **Preuve** [mesuré, recontrôlé] :
  - dbca7f39, **3 fiches VENDUES** (1789169380154007, 1789169380154000,
    1789169371018005) : retraits Opla clos `deleted` le 03/10 à 16:01-16:02,
    pendant la panne d'accès Opla, avec `retiree_le` posé ;
  - les annonces `art_087f2afc…`, `art_83501a41…` et `art_e03c104c…` sont
    **revues `en_ligne` au relevé du 08/10 à 02:08** ;
  - sur 14 jours, 121 retraits ont été clos de cette façon (Vinted 51,
    Leboncoin 34, eBay 30, Opla 4, Beebs 2) ; seuls ces 3 ont été revus en ligne
    ensuite.
  - Réserve : le relevé Opla de l'extension a déjà écrit « en ligne » des
    brouillons (cause du veilleur, 08/10). **À vérifier sur la page Opla**
    avant tout geste.
- **Risque** : l'article vendu reste achetable sur Opla, et la personne croit le
  retrait fait. La bascule Opla du 10/10 00:00 ne change rien : les retraits
  restent permis (règle A4 d'`opla-sortie.js`), mais rien ne les réarme.
- **Correctif à la racine** :
  - « unavailable » ne clôt un retrait qu'avec une session de la plateforme
    prouvée valide (même règle que les relevés : aucun verdict sur une lecture
    douteuse) ;
  - un relevé qui revoit l'annonce d'un retrait clos rouvre ce retrait.
- **Effort** : M.

### U4 — Connu, en attente du feu vert : copies d'articles vendus (Bebertdeals et parc)
16 annonces (13 fiches, 6 comptes) sont rattachées à une fiche dont l'article
est vendu sur Vinted sous une nouvelle annonce, dont Leboncoin 3271071626 (A178)
et 3271067256 (C202) chez Bebertdeals. Liste et geste :
`docs/enquetes/bebertdeals-0810/RAPPORT.md` (§ réparation, points 2 et 5).
Rappelé ici parce que le risque court tant que rien n'est fait.

---

## 1. Défauts ROUGES (hors urgences)

### R1 — Un clic « Vendue ? » sur une annonce morte retire l'annonce VIVANTE de la même plateforme
- **Classes** 1, 9.
- **Où** :
  - `alerte_lever_revues_plateformes` ne lève une alerte que sur le même
    `listing_id` : une remplaçante n'éteint jamais l'alerte de l'ancienne ;
  - la garde « remplacée » d'`enregistrer_vente_atomique` ne vaut que pour Vinted ;
  - le déclencheur `inventaire_vendu_retire_ses_copies` appelle
    `armer_retraits_copies(…, p_sauf_job NULL, p_sauf_plateforme NULL sauf vente Vinted)`,
    qui arme le job prouvé **le plus récent** de chaque plateforme (`DISTINCT ON
    (platform) … ORDER BY published_at DESC`), c'est-à-dire l'annonce vivante.
    Mécanisme relu en prod ;
  - côté extension, `background.js:19491` (Leboncoin, eBay, Beebs, Opla) n'a
    pas l'équivalent de la clôture `superseded_listing` de Vinted (l. 19460).
- **Preuve** [mesuré, passe « identité »] :
  - 89 fiches en stock (eBay 47, Leboncoin 41, Opla 1 ; 7 comptes, dont 81 chez
    53efea05) portent à la fois une alerte « Plus en ligne — Vendue ? » sur une
    annonce morte et une annonce vivante de la même plateforme ;
  - alertes ouvertes depuis le 20/09 (eBay) et le 28/09 (Leboncoin) ;
  - la vente serait acceptée pour 68 d'entre elles (`retrait_job_prouve` vrai).
- **Risque** : la personne répond « Vendue » à une question posée à tort. FillSell
  enregistre alors une fausse vente et retire l'annonce remise en ligne, ainsi
  que les autres copies (précédents : Louis le 06/10, Bebertdeals le 08/10).
- **Correctif** :
  1. côté serveur, à chaque relevé ou rattachement : un job publié dont une
     annonce de la même plateforme, sur la même fiche, est vue en ligne après
     son `unavailable_since` est clos « remplacée, pas une vente » ;
  2. la garde « remplacée » d'`enregistrer_vente_atomique` vaut pour toutes les
     plateformes.
- **Effort** : S–M.

### R2 — Un retrait d'article vendu n'a pas d'autre exécutant que l'extension, et personne n'est prévenu
- **Classes** 5, 6, 8.
- **Où** : `cross_post_jobs` action `delete`, servie seulement par
  `get-pending-jobs` à un poste allumé. Pas d'expiration, pas de mail, pas de
  ligne « À régler » pour un `pending`. eBay relié par l'API pourrait retirer
  sans l'extension, et ne le fait pas.
- **Preuve** [mesuré, passes « extension » et « ventes »] :
  - 49 retraits ouverts ;
  - **27 retraits d'articles vendus sans personne pour les faire**, ouverts
    depuis 4 à 27 jours :
    - 15 sur des comptes dont l'extension est éteinte depuis plus de 7 jours
      (Leboncoin 7, Vinted 6, eBay 1, Beebs 1, Opla 1 ; plus 11 retraits Vinted
      sans fiche) ;
    - 12 retraits Opla en `needs_user` « autorise Opla » depuis le 26/09
      (8a2eba68, extension active) ;
  - l'ops-digest les liste (section 3), mais aucune relance n'existe côté
    personne. On ne sait pas si les annonces sont encore en ligne.
- **Risque** : l'article vendu reste en vente. Après le 10/10, un compte sans
  Opla relié n'a plus d'écran pour reconnecter Opla et finir ses retraits.
- **Correctif** :
  - un retrait ouvert depuis plus de 24 h devient une ligne « À régler » (le
    geste qui débloque), avec un mail ;
  - eBay relié : retrait par l'API ;
  - Opla : garder la connexion possible pour les seuls retraits après le 10/10.
- **Effort** : S–M. **Urgent avant le 10/10 pour Opla.**

---

## 2. Défauts ORANGES

### Synchronisation et identité

**O1 — Vinted : un relevé qui saute le marquage rend les disparitions indatables à jamais** (classes 3, 8)
- **Où** : `background.js:17785-17835`.
  - La fenêtre des « connues » est `last_synced_at ≥ référent − 5 min`.
  - Le run qui saute le marquage devient le référent suivant.
  - Le filtre `origine = vinted_sync` (l. 17828) exclut les fiches nées dans FillSell.
- **Preuve** [mesuré] :
  - **1 097 fiches en stock (27 comptes)** absentes des deux derniers relevés
    complets de leur boutique, jamais datées ;
  - 660 non vues depuis plus de 30 jours, 673 ont une remplaçante au même
    titre ;
  - 194 sans job Vinted publié : aucune question ne viendra jamais ;
  - 64 ont des copies vivantes ailleurs ;
  - 261 runs sur 1 436 (18 %) sautent le marquage en 30 jours : repris 120,
    rodage 116, changement de compte 17, incomplet 7, effondrement 1. Le
    rapport Bebertdeals ne citait que l'effondrement.
- **Risque** : stock gonflé de fiches mortes, copies orphelines ; un compte qui
  revient après une longue coupure fige son stock.
- **Correctif** :
  - dater côté serveur comme `constater_absences_releve` : absente de deux
    relevés probants de SA boutique (`vinted_account_id`) ;
  - l'effondrement devient une question en lot ;
  - inclure les fiches nées dans FillSell.
- **Effort** : M.

**O2 — Règles restées sans exécutant depuis la coupure des crons 17 et 22** (classes 2, 4 — la classe derrière Bebertdeals, plus large que la remise en ligne)
- **Où** :
  - caducité des questions (`rapprochement_photos_decider` § c, seul appelant :
    `doublons-balayage`). La migration `20261006120100` l'a modifiée le 06/10 :
    changement livré inerte ;
  - examen des fiches (`doublons_examiner_fiche` → `inventaire_doublons_pour`) :
    dernier examen le 28/09 à 16:36 ;
  - `fusion_photo_tick` (cron 20) range encore des comptes « prêts » pour
    `fusion_photo_lot` (cron 22, jamais exécuté) : file morte.
- **Preuve** [mesuré, passe « décalages »] :
  - fiches `vinted_sync` nées du 28/09 16:54 au 07/10 : 9 443, dont 7 551 en
    stock et **6 249 jamais examinées ni questionnées (73 comptes)**. La passe
    v3 ne juge les fiches Vinted qu'à partir du 07/10 23:30 UTC ;
  - 654 imports `releve_*` de la même fenêtre jamais examinés (couverture par
    la réparation v3 du 08/10 : à vérifier) ;
  - au moins 114 questions `proposee` sur une fiche qui n'est plus en stock ;
  - 38 comptes rangés dans la file morte.
- **Risque** : doublons et fantômes de la fenêtre 28/09 → 07/10 jamais vus.
- **Correctif** :
  - pour chaque règle, trancher « portée dans v3 » ou « supprimée » ;
  - porter la caducité dans la passe v3 normale ;
  - rattrapage borné de la fenêtre ;
  - supprimer les files sans exécutant ;
  - selftest « toute fonction de décision a un appelant actif ».
- **Effort** : M.

**O3 — La doctrine « doute → question » est saturée : les questions ne sont ni tranchées, ni périmées, ni relancées** (classes 6, 10)
- **Preuve** [mesuré] :
  - **3 267 alertes « Plus en ligne — Vendue ? »** non tranchées sur des fiches
    à pièce unique (93 comptes) : 2 387 de plus de 7 jours, 760 de plus de
    30 jours, la plus ancienne du 10/08. Par plateforme : Vinted 2 786,
    eBay 217, Leboncoin 208, Opla 31, Beebs 25. **351** ont une copie vue en
    ligne dans les 3 jours (16 comptes) ;
  - 2 107 questions de rapprochement `proposee`, dont 493 de plus de 7 jours,
    et 30 « zombies » (fiche fondue ou absente) ;
  - 680 à 731 « Annonce en double ? » Vinted (38 à 42 comptes), toutes du
    08/10 : 255 avec une seule annonce en ligne (remise en ligne probable) ;
  - 941 fiches cachées du stock (`a_verifier`) ;
  - 23 « Déjà vendu ? » (`copie_non_prouvee`) sans relance, dont 8 copies vues
    en ligne ;
  - rien de tout cela n'est dans l'ops-digest.
- **Risque** : la protection repose sur un geste qui ne vient pas ; la copie
  reste en vente pendant l'attente.
- **Correctif** :
  - caducité dans la passe normale (fiche fondue, vendue ou absente, annonce
    disparue → `caduque`) ;
  - résoudre d'abord par les règles (remise en ligne, R1) ;
  - rappel push ou mail à H+6 pour une copie vue en ligne ;
  - ligne ops-digest par compte au-delà de 50 questions.
- **Effort** : S–M.

**O4 — Beebs : aucune disparition n'est jamais datée par le relevé** (classe 3)
- **Où** : `constater_absences_releve` renvoie `moderation_beebs`.
- **Preuve** [mesuré] : 33 annonces, 8 comptes, 29 fiches en stock. Elles
  restent « vivantes » dans `fiche_annonces_vivantes`, ce qui bloque vente,
  rattachement et fusion.
- **Correctif** : dater après un délai propre à la modération (trois relevés
  probants et 72 h).
- **Effort** : S.

**O5 — Republication Vinted : l'annonce recréée est reconnue par son TITRE dans 98 % des cas** (classes 1, 4)
- **Où** : `background.js:21345` (`reconnaitreAnnonceRecreee`) ; la preuve par
  le numéro (l. 21305) ne mord jamais.
- **Preuve** [mesuré] : 6 332 recréations sur 6 437 en 30 jours (80 comptes) ;
  preuve par numéro 0 fois, y compris sur 1 353 recréations en 0.6.84 ou plus ;
  **0 conflit** mesuré.
- **Risque** : un vendeur à exemplaires homonymes (Louis) verrait un second
  exemplaire collé à la mauvaise fiche.
- **Correctif** : faire mordre la preuve par le numéro ; le titre devient une
  question.
- **Effort** : M.

**O6 — Plusieurs boutiques ou plusieurs postes** (classes 7, 8)
- **Où** :
  - `background.js:17796-17814` : le marquage est délimité par l'heure, pas par
    la boutique ;
  - `inventaire_ecarte_import_sync` refuse en silence l'INSERT d'un autre poste
    pendant un relevé automatique.
- **Preuve** [mesuré] :
  - 8 comptes ont au moins 2 boutiques confirmées, 5 en ont relevé 2 en
    30 jours ;
  - 21 comptes ont eu au moins 2 postes en 7 jours ;
  - qui alterne ses boutiques n'a jamais de disparition datée.
- **Correctif** : délimiter les candidates par `vinted_account_id`.
- **Effort** : S–M.

**O7 — L'identité par la photo est aveugle sur trois populations** (classes 1, 4)
- **Où** : `_shared/empreinte-telechargement.ts:21-33` (`hoteAutorise` n'admet
  que `listing-photos`).
- **Preuve** [mesuré, 7 jours] :
  - 6 160 × 404 sur les liens Vinted signés `?s=` (annonces mortes, empreinte
    jamais calculée de leur vivant) ;
  - 312 fiches en stock (177 comptes) ont leur couverture dans `lens-temp`,
    refusée « hôte hors liste » ;
  - 179 × 429 de notre Storage ;
  - 30 × « Cannot access 'ImageType' before initialization ».
- **Risque** : les règles « photo ET titre » (fiche à la main, remise en ligne,
  U2) ne peuvent pas se déclencher pour ces fiches.
- **Correctif** :
  - admettre `lens-temp` ;
  - empreinte calculée au relevé, tant que le lien vit ;
  - borner la concurrence ;
  - corriger `ImageType`.
- **Effort** : S–M.

**O8 — Rafales d'empreintes : WORKER_RESOURCE_LIMIT et 429 que nous provoquons** (classe 2)
- **Où** : `rapprochement_v3_empreinter` envoie 100 appels de 6 photos d'un coup.
- **Preuve** [mesuré] :
  - `empreintes-urls` : 1 821 × 546 + 29 × 503 + 18 × 520 en 24 h ;
  - 25 × 546 entre 19:17 et 19:31 le 08/10 (synchro Bebertdeals) ;
  - `rapprochement` : 60 × 546 dans la nuit du 07 au 08/10.
  - Un 546 n'écrit ni empreinte ni échec.
- **Risque** : des questions en trop, jamais une fusion à tort.
- **Correctif** : file `empreintes_a_calculer` consommée par un cron borné
  (20 appels en vol au plus), 546 et 429 repris.
- **Effort** : S.

### Ventes et retraits

**O9 — Le retrait des copies n'est jugé qu'une fois, au passage à « vendu »** (classes 5, 6, 10)
- **Où** : `inventaire_vendu_retire_ses_copies` (transition seulement). Une
  garde passagère (`fiche_annonces_vivantes ≥ 2`, ligne `annonces_plateforme`
  non liée) perd le retrait pour toujours.
- **Preuve** [mesuré] :
  - de63ca45 1789717143519003 : vendue le 06/10. À cet instant, deux annonces
    Leboncoin « vivantes », dont un job fantôme recréé par la réparation
    `reparation_2609_suivi_orphelin`, donc ni retrait ni question. Le fantôme
    est clos le 07/10, rien ne rejuge, et Leboncoin 3260299583 est vue en
    ligne le 08/10 à 20:04. La question « confirmee » visait l'autre annonce
    eBay ;
  - autres cas : 39bfa95a 1790106697754007 ; de63ca45 1789717143519004
    (copie Opla vue le 08/10).
- **Correctif** : rejouer `armer_retraits_copies` en fin de relevé et à chaque
  changement de `fiche_annonces_vivantes`, borné aux comptes actifs ; « 2
  vivantes sur une pièce unique » devient une question.
- **Effort** : M.

**O10 — Vente Vinted d'une fiche importée sans job Vinted : bascule « vendu » SANS ligne de vente** (classes 5, 3)
- **Où** : `background.js:18401-18404`. Le Point A refuse alors le retrait des
  copies prouvées, et les questions excluent les copies prouvées.
- **Preuve** [mesuré] : 14 fiches `vinted_sync` (6 comptes) `vinted_status =
  sold` restées en stock ; dbca7f39 1789169089224004 (copie Opla prouvée vue
  le 06/10).
- **Correctif** : la bascule passe par `enregistrer_vente_atomique` (clé
  `annonce:vinted:<id>`).
- **Effort** : M.

**O11 — Une vente relevée arrivée avant la confirmation bloque l'enregistrement, donc les retraits** (classes 7, 5)
- **Où** : `enregistrer_vente_atomique` répond « Une vente est déjà liée à
  cette fiche » ; `enregistrer_ventes_relevees` n'écrit qu'une ligne `ventes`.
- **Preuve** [mesuré, recontrôlé] : 4 fiches en stock avec `sale_signal = sold` :
  - eBay b6005a59 407226713076 et 4cd4d9ae 196847393055 : preuve exacte
    `browse_api`, `vente_auto.raison` = ce refus ;
  - Vinted bf85d176, a208137a.
- **Correctif** : reçu `ventes_operations` posé par le relevé quand il lie par
  numéro ; adoption au lieu du refus.
- **Effort** : S–M.

**O12 — Des commandes relevées sont rattachées à une fiche par le TITRE** (classes 1, 9)
- **Où** : `enregistrer_ventes_relevees` → `rapprocher_classer` sans numéro
  d'annonce.
- **Preuve** [mesuré] : 21 fiches en stock à pièce unique (4 comptes) portent
  une vente sans numéro, dont 20 de plus de 60 jours.
- **Risque** : chiffres faux, fiches impossibles à déclarer vendues.
- **Correctif** : jamais de rattachement sans numéro ; une question à la place.
- **Effort** : S.

**O13 — Ventes en double par insertion directe depuis l'app** (classe 7)
- **Où** : `src/tabs/VentesTab.jsx:763` et le lot `:870-879` (`ventes.insert`,
  sans clé ni index unique).
- **Preuve** [mesuré, recontrôlé] : af37fa49, le 28/09, 25 groupes de lignes
  identiques (même fiche, prix, date, plateforme) insérées à moins de 5 s
  d'intervalle sur des fiches à quantité 1, soit **71 lignes en trop**.
- **Risque** : chiffre d'affaires et bénéfice gonflés.
- **Correctif** : passer par `enregistrer_vente_atomique` (clé
  `manuel:<inventaire>`).
- **Effort** : S.

**O14 — Fiches portant plus d'annonces vivantes sur une plateforme que leur quantité** (classes 5, 7)
- **Preuve** [mesuré] :
  - 31 fiches (11 comptes) ont au moins 2 annonces en ligne sur la même
    plateforme, et 27 en ont plus que leur quantité ;
  - faf5021a (Louis) : 3 fiches à quantité 1 avec deux annonces Beebs à numéros
    quasi consécutifs (34055807/34055808, 27/09, extension 0.6.69). Ce compte
    duplique volontairement ses articles sur Beebs (règle du 27/09) : **à
    vérifier avec lui** ;
  - reprise d'un dépôt vérifiée par le titre et redépôt si la vérification est
    impossible (`background.js:3442`, `:2443`) : 1 paire Opla le 20/09.
- **Risque** : vendre l'une ne retire jamais l'autre (« deux exemplaires »).
- **Correctif** : pièce unique avec 2 annonces vivantes → question « deux
  exemplaires ? » ; reprise d'un dépôt prouvée par le numéro.
- **Effort** : S–M.

**O15 — Retrait d'une annonce Vinted « doublon de republication » sur la seule HEURE de mise en ligne** (classe 9)
- **Où** : `_shared/recreation-impasse-vinted.js:96-107` (`garder_recente`),
  `get-pending-jobs/index.ts:1587-1605`.
- **Preuve** [mesuré] : 1 retrait en 14 jours par ce chemin. [estimé] : la
  fenêtre va de 2 min avant à 20 min après un envoi, sans photo ni titre.
- **Correctif** : exiger en plus la photo identique.
- **Effort** : S.

### Extension et jobs

**O16 — Republications en file à vie, et 7 annonces supprimées jamais recréées** (classes 6, 9)
- **Preuve** [mesuré] :
  - 633 republications Vinted en attente (28 comptes). Environ 490 viennent de
    demandes en masse de 5 comptes Premium plafonnés à 50 par jour (d8b07167 :
    227, extension éteinte depuis le 07/10) ; 95 jobs dans 11 comptes éteints
    depuis plus de 7 jours ;
  - **7 annonces Vinted supprimées les 17-19/08 et jamais recréées** : jobs à
    l'étape « deleted » toujours en attente, fiches encore « en vente » ; le
    support a été prévenu, la personne jamais.
- **Correctif** :
  - expiration d'une demande de masse non servie ;
  - une annonce supprimée non recréée après 24 h devient « À régler » avec un
    mail.
- **Effort** : S–M.

**O17 — Une recréation qui échoue en boucle ne revient jamais à la personne** (classe 6)
- **Preuve** [mesuré] : job 166e5729 (3424a25d), supprimée le 08/10 à 00:08,
  13 recréations ratées « canal coupé », avec le message « rien à faire de ton
  côté ». **À vérifier** : qu'aucune des 13 tentatives n'a créé d'annonce.
- **Correctif** : après N échecs de même cause, `needs_user` avec le vrai geste.
- **Effort** : S.

**O18 — Un « published » perdu n'est jamais rejoué, et un statut terminal peut être réécrit** (classes 7, 10)
- **Où** :
  - `background.js:2218` : un seul essai, rejeu sur 401 seulement ;
  - `:4381`, `:4643` : un échec d'écriture après le dépôt donne « failed »
    (annonce en ligne, plus suivie), ou une remise en file sans contrôle
    anti-doublon ;
  - `controler_job_extension` ne verrouille que « arrêté par la personne », et
    `jobStatusNow` (`:2268`) laisse passer si la lecture échoue.
- **Preuve** [mesuré] : 1 × 500 sur 1 970 appels le 04/10, 0 publication
  « failed » portant un lien. Non matérialisé.
- **Correctif** :
  - file locale de statuts à rejouer (idempotente) ;
  - statuts terminaux verrouillés en base ;
  - historique des statuts.
- **Effort** : M.

**O19 — Gardes « ouvertes si illisibles » dans get-pending-jobs** (classes 3, 10) [estimé]
- **Où** : plafond anti-robot (`:4823-4895`), `:4753`, `:4936`, `:3283` ;
  44 `catch` muets dans la fonction, et dans l'extension 93
  `.catch(()=>{})`, 110 `.catch(()=>null)`, 86 `catch` vides.
- **Preuve** : le 04/10, 47 × 504 pendant la saturation, précisément quand ces
  lectures échouent.
- **Correctif** : une garde illisible retient le job (fermée par défaut) et le
  journalise.
- **Effort** : S.

### Paiements, paliers, quotas

**O20 — Un payant dont le paiement n'arrive plus garde son palier et reçoit un mois de quotas neuf ; l'alerte ne peut pas sonner** (classes 2, 3, 10)
- **Où** :
  - `grant_monthly_coins_sweep` (cron 3) ouvre le cycle payant à l'échéance et
    repousse `next_grant_at` ;
  - la garde `awaiting_payment_event` (retard de plus de 3 jours) et la
    section 6 de l'ops-digest ne peuvent donc jamais jouer ;
  - aucun recalage ne relit Stripe, Apple ou Google ; côté Apple, 10 comptes
    payants sur 14 n'ont aucune date de fin en base.
- **Preuve** [mesuré, recontrôlé] : 3 cycles payants ouverts par le balayage
  sans paiement en 90 jours :
  - 63b80b36 (Stripe, mail `payment_failed` le 06/10, toujours Premium) ;
  - **8a2eba68** (cycle du 29/09 de source `sweep` ; dernier `grant` de source
    `payment` le 28/08 ; pas de formule annuelle au checkout) — **à vérifier
    dans Stripe** ;
  - 4aa33a61 (Free aujourd'hui).
- **Correctif** :
  - le balayage n'ouvre jamais de cycle payant sans paiement prouvé ;
  - détecteur fondé sur le dernier `grant` de source paiement ;
  - recalage quotidien borné (Stripe, App Store Server API, Play
    subscriptionsv2) ;
  - **décision de Nico** : un compte `past_due` garde-t-il un mois de quotas ?
- **Effort** : M (L avec le recalage).

**O21 — google-play-webhook sans authentification, décision sur le type d'événement et non sur l'état** (classes 3, 7)
- **Où** : `google-play-webhook/index.ts:79-95`, `:224-230`, `:380-424`. Ni
  jeton OIDC ni secret, `subscriptionState` jamais lu, pas de journal des
  `messageId`.
- **Preuve** [mesuré] : 1 compte Google payant : non matérialisé.
- **Correctif** : vérifier le jeton OIDC Pub/Sub ; décider sur l'état, comme
  le fait déjà `validate-google-purchase`.
- **Effort** : M.

**O22 — Apple : état décidé par le type d'événement ; une descente de palier ne retire jamais `is_pro` / `is_business`** (classes 3, 7)
- **Où** : `apple-iap-webhook` `:31-32`, `:444-513`, `:488-494` ;
  `google-play-webhook:394-399`.
  - Un DID_RENEW redélivré après EXPIRED remet le premium.
  - Ni `signedDate` ni `notificationUUID` ne sont gardés.
  - GRACE_PERIOD est mal traité.
- **Preuve** [mesuré] : 1 compte Pro Apple ; non matérialisé.
- **Correctif** :
  - décider sur l'état ;
  - poser les trois drapeaux à chaque événement « actif » ;
  - ignorer une notification plus ancienne que la dernière traitée.
- **Effort** : M.

**O23 — `apple-subscription-status` : un utilisateur connecté peut lire l'abonnement d'un AUTRE compte** (classe 3, fuite de données en lecture)
- **Où** : `apple-subscription-status/index.ts:82`, `targetUserId =
  url.searchParams.get("userId") ?? user.id` (relu), fonction en
  `verify_jwt = false`. Aucun appelant dans `src/`.
- **Correctif** : en mode non admin, toujours `user.id`.
- **Effort** : S.

**O24 — `validate-apple-receipt` retire le premium sur une erreur passagère d'Apple, et rend actif un abonnement remboursé** (classes 9, 3)
- **Où** : `:103-108`, `:123-127`, `:105`, `:169`, `:179-181`.
- **Risque** : un payant, même Stripe, qui touche « Restaurer » pendant une
  panne Apple redevient Free.
- **Correctif** : ne jamais retirer sur un statut différent de 0 ; exclure les
  remboursements ; ne retirer que si cette transaction est la source.
- **Effort** : S.

**O25 — Premium/Pro : les republications annulées ou échouées consomment le quota mensuel** (classe 3)
- **Où** : `spend_coins_and_republish` et `quotas_etat` (branche premium/pro) :
  `count(*)` sans filtre de statut (relu dans `republish_planifiee_etat`). La
  version Free, elle, est juste.
- **Preuve** [mesuré] :
  - 7c5f4407 : 114 dont 71 annulées ;
  - cdf7007c : 70 dont 41 ;
  - de63ca45 (Pro) : 691 dont 393 ;
  - personne au plafond aujourd'hui.
- **Correctif** : une seule fonction de comptage pour tous les paliers.
- **Effort** : S.

**O26 — `stripe-webhook` : écritures non vérifiées, et un abonnement payé sans compte retrouvé passe en silence** (classes 10, 1)
- **Où** : `stripe-webhook/index.ts` `:124-127`, `:288-294` (recherche par
  adresse, sensible à la casse, alors que `metadata.fillsell_user_id` est
  posé), `:314-321`, `:415-419`, `:437-441`, `:576-579` ; aucun journal
  d'événements traités.
- **Correctif** :
  - identifier par `fillsell_user_id` ;
  - toute écriture ratée renvoie 500 avec une alerte ;
  - une table `paiements_evenements` (event_id unique), lue par l'ops-digest.
- **Effort** : M.

**O27 — Option Cloud déployée à moitié** (classes 3, 4 ; latent, `CLOUD_OFFER_ENABLED = false`)
- **Où** :
  - `create-checkout-session` v58 : `product: 'cloud'` retombe sur un
    **Checkout Premium** (`SUB_PLANS[product] ?? SUB_PLANS.standard`, l. 453) ;
  - les fonctions Apple, Google, `validate-*` et `cancel-subscription` n'ont
    pas le code Cloud ;
  - le palier par défaut « premium » si la relecture échoue (`stripe-webhook`
    `:392-406`).
- **Correctif** :
  - déployer les 6 fonctions avant d'ouvrir l'offre ;
  - un produit inconnu renvoie 400 ;
  - faire un test d'achat de bout en bout.
- **Effort** : S–M.

### Surveillance

**O28 — Le résultat réel d'un cron pg_net n'est enregistré nulle part** (classes 2, 10)
- **Où** : les crons 2, 4, 5, 7, 9, 12, 13, 14, 15 et 16 n'ont aucun
  `timeout_milliseconds` (5 s par défaut). `net._http_response` est purgée à
  6 h, et « succeeded » veut seulement dire « requête mise en file ».
- **Preuve** [mesuré] :
  - ~26 « Timeout of 5000 ms » entre 16:00 et 22:00, dont environ la moitié sur
    la résolution DNS, aux :00/:15/:30/:45 ;
  - handler-watch : 67 exécutions sur 343 au-delà de 5 s (max 26 s) ;
    ebay-ventes-sync 90 s ; ops-digest environ 3 min ;
  - aucune exécution perdue entre 14:00 et 20:00 UTC, mais aucun code retour
    gardé.
- **Risque** : une fonction planifiée peut répondre 500 pendant des semaines
  sans que personne ne le voie (mail J+1, rapport, purge).
- **Correctif** :
  - table `cron_passages` écrite par chaque fonction planifiée ;
  - contrôle « dernier succès > 2 × période » pour chaque cron actif ;
  - liste des crons inactifs dans l'ops-digest ;
  - `timeout_milliseconds` ≥ p99.
- **Effort** : M.

**O29 — L'ops-digest se tait dans trois cas indiscernables, et ne voit pas ce qui aurait dû alerter** (classes 3, 10)
- **Où** : `ops-digest/index.ts` :
  - `:866-872` : pas de mail si rien ;
  - `:489-495` : 500 sans mail ;
  - `:780`, `:802`, `:821` : `{ data }` lu sans `error`, la section disparaît ;
  - le résultat n'est jamais journalisé.
  - Il ne lit ni `cron.job`, ni `net._http_response`, ni `coin_config`, ni les
    migrations, ni les questions, ni les échecs d'empreinte, ni le rythme de
    création des fiches.
- **Preuve** [mesuré] :
  - le 08/10 à 10:50, `function_logs` ne montre que le démarrage et l'arrêt ;
    impossible de savoir si le mail est parti ;
  - crons 17 et 22 coupés depuis 10 jours sans une ligne ;
  - rafales de création non signalées :

    | Compte | Date | Fiches créées | Fiches avant | Remarque |
    |---|---|---|---|---|
    | 28865d04 | 30/09 | +1 015 | 645 | 344 titres identiques à une fiche Leboncoin/eBay |
    | bd380fbf | 30/09 | +460 | 1 107 | |
    | 2189c4d8 | 06/10 | +285 | 1 056 | |
    | c15f4b0e | 08/10 | +268 | 757 | Bebertdeals |
    | 8a2eba68 | 05/10 | +245 | 793 | |
    | 273e3013 | 01/10 | +109 | 1 438 | |

- **Correctif** :
  - toujours un mail (« RAS » si rien), section illisible = anomalie, ligne
    `ops_digest_runs` et garde-mort à 26 h ;
  - nouvelles sections : crons inactifs ou sans succès, codes pg_net non 200
    par fonction, ventes prouvées non enregistrées (U1), questions par compte,
    relevé qui crée plus de 20 % du stock d'un coup, drapeaux à 0 depuis plus
    de 7 jours, migrations locales non inscrites.
- **Effort** : S (silences) + M (sections).

---

## 3. Défauts BLANCS (mineurs, dette)

| # | Défaut | Classe | Où / preuve | Correctif | Effort |
|---|---|---|---|---|---|
| B1 | Le compteur « créés » de la synchro compte des brouillons jamais créés | 10 | `background.js:18531` ; [mesuré] 809 brouillons (46 comptes) recomptés 2 717 fois en 30 j | compter les lignes rendues par l'upsert | S |
| B2 | Lectures tronquées | 8, 10 | `App.jsx:3432` `limit(3000)` (2 comptes au-delà) ; `background.js:18167`, `:18211` `limit=1000` (5 comptes au-delà) | paginer | S |
| B3 | `releve_incomplet_reprise` inerte (« reprise » refusée par `garde_releve_sans_geste`) ; CLAUDE.md se contredit (27/09 « repris seul » / 05/10 « geste seul ») | 4 | [mesuré] 5 runs « reprise », aucun après le 05/10 midi | trancher, retirer le code mort | S |
| B4 | Point A compare la copie à `inventaire.plateforme` (l'origine) au lieu de la plateforme de la vente | 1, 5 | afeef3c7 : 2 annonces Vinted « hidden » ni retirées ni demandées | comparer à `ventes.plateforme_code` | S |
| B5 | Le poste est identifié par la seule session (pas de `poste_instance`) | 7, 8 | deux extensions sur la session relayée = un poste | envoyer l'instance | S |
| B6 | La pause « session morte » est jugée pour tout le compte | 8 | un poste déconnecté retient 10 min les jobs d'un poste connecté | juger par poste | S |
| B7 | Messages faux après une suppression (« annonce laissée en ligne ») | 10 | b952866a, 3 cas en 30 j | texte selon la preuve | S |
| B8 | Deux jobs pour une seule annonce Beebs | 1, 6 | bd380fbf : 6 publications sans lien + un import sur la même fiche | rattacher, clore le doublon | S |
| B9 | Une génération ratée compte dans le quota d'annonces | 3 | `generate-listing:1202` avant le contrôle `:1243-1255` ; 0 cas mesurable | poser la ligne après livraison | S |
| B10 | 6 comptes offerts sans date de fin (5 avec `is_premium` posé à la main) | 8 | [mesuré] tous inactifs depuis 30 j | date de fin obligatoire | S |
| B11 | `subscription_period_end` en deux formats (jj/mm/aaaa et ISO) | 3 | `cancel-subscription:259-262` ; 4 comptes | ISO partout | S |
| B12 | Mails J+1 : fenêtre fixe « inscrits d'hier », sans rattrapage | 2 | `email-tunnel/index.ts:1747-1765` | « depuis 48 h sans ce mail » | S |
| B13 | Objets en prod sans fichier : `20261007104259` (`pause_releves`, `garde_pause_releves_compte`), `20261006182354/182412` (RLS des sauvegardes) ; version locale `20260927214500` non inscrite | 4 | [mesuré] `migration list` | capturer ; selftest « aucune version distante après le 01/10 sans fichier » | S |
| B14 | Le dépôt ne suit pas la prod pour `fusion_photo_tick` et `handle_new_user` (fichier : `__CRON_SECRET_DU_VAULT__`, prod : `public.cron_secret()`) ; les 48 autres fonctions comparées sont identiques | 4 | [mesuré] md5 des corps normalisés | capturer en migration | S |
| B15 | `veille-cpu` peut devenir aveugle sans prévenir (`{ok:false}`, 200) | 3, 10 | `veille-cpu/index.ts:40-48` ; aujourd'hui 720/720 échantillons, max 58,7 % | alerte après 3 échecs | S |
| B16 | Dettes : `recalage_xewer_tick` appelle une fonction supprimée ; drapeaux à 0 depuis des semaines (`alerte_vinted_revue_ouverte` 18/09, `keepalive_actif` 17/09, `republish_pause_retrait_taille_par_id` 10/09) ; crons 27/28 mal nommés (« 5min » = */10, « 10min » = */15) ; en-têtes faux de `update-job-status:66` et `check-listing-status:22` (prod = config = `false`) | 4 | [mesuré] | ménage | S |
| B17 | Docs en décalage : drapeaux `rapprochement_remise_en_ligne` / `vente_garde_remise_en_ligne` **absents** (CLAUDE.md : « posés à 0 » ; ils naîtront à 0 avec `20261008160000` ; sans ligne, la garde vaut « armée ») ; **0.6.104 `0cec9e6` déjà sur 21 comptes vus < 24 h** (l'état la dit « à téléverser ») ; vente Vinted « automatique » (U1) ; horaires des crons en UTC (ops-digest = 10:50 Paris) | 4 | [mesuré] `coin_config`, `profiles.extension_build` | mettre l'état à jour | S |
| B18 | 5 comptes sous 0.6.81 vus sur 7 j (2 en 0.6.69 vus < 24 h), 47 sous 0.6.99 | 8 | [mesuré] ; aucune fiche née de leurs relevés automatiques depuis le 06/10 | décision MIN_BUILD (Nico) | — |

---

## 4. Crons et fonctions planifiées (classe 2) — état mesuré le 08/10 à 22:00

`cron.job_run_details`, dernières 24 h [mesuré]. « succeeded » = requête mise
en file pour les appels pg_net (voir O28).

| # | Cron | Actif | Dernier passage | 24 h (échecs) | Durée max | Remarque |
|---|---|---|---|---|---|---|
| 2 | email-tunnel-daily | oui | 08/10 11:00 | 1 (0) | 0,07 s | J+1 non rattrapé (B12) |
| 3 | coins-monthly-sweep | oui | 08/10 06:15 | 1 (0) | 0,43 s | ouvre des cycles sans paiement (O20) |
| 4 | ops-digest-daily | oui | 08/10 10:50 | 1 (0) | 0,04 s | résultat inconnu (O29) |
| 5 | handler-watch-3min | oui | 08/10 21:57 | 480 (0) | 0,25 s | 20 % > 5 s côté fonction |
| 7 | email-tunnel-job-relaunch-hourly | oui | 08/10 21:00 | 24 (0) | 0,27 s | |
| 8 | expire-publish-reservations-daily | oui | 08/10 05:20 | 1 (0) | 0,21 s | |
| 9 | republish-purge-daily | oui | 08/10 05:40 | 1 (0) | 0,08 s | aucune photo de fiche ni de job ouvert sous `/republish/` [mesuré] |
| 10 | publish-sans-lien-echec-daily | oui | 08/10 05:30 | 1 (0) | 0,11 s | |
| 12 | ebay-api-worker-2min | oui | 08/10 21:58 | 720 (0) | 0,26 s | |
| 13 | republish-auto-sweep-3min | oui | 08/10 21:57 | 480 (0) | 1,00 s | |
| 14 | lens-temp-purge-daily | oui | 08/10 05:50 | 1 (0) | 0,02 s | |
| 15 | ebay-ventes-sync-daily | oui | 08/10 06:40 | 1 (0) | 0,03 s | 90 s côté fonction |
| 16 | beebs-lien-5min | oui | 08/10 21:55 | 288 (0) | 0,26 s | |
| 17 | doublons-balayage-2min | **non** | **28/09 16:54** | 0 | — | règles orphelines (O2) |
| 20 | fusion-photo-1min | oui | 08/10 21:59 | 1 440 (0) | 1,03 s | alimente une file morte (O2) |
| 22 | fusion-photo-lot-10min | **non** | **jamais** | 0 | — | file morte (O2) |
| 27 | ebay-releve-api-5min | oui | 08/10 21:50 | 144 (0) | 0,29 s | tourne */10 |
| 28 | releve-completer-10min | oui | 08/10 21:52 | 96 (0) | 0,05 s | tourne */15 |
| 29 | veille-cpu-2min | oui | 08/10 21:58 | 720 (0) | 0,20 s | CPU max 58,7 % sur 24 h |
| 31 | remises-en-vente-5min | oui | 08/10 21:55 | 288 (0) | 0,30 s | |
| 34 | push-ventes-1min | oui | 08/10 21:59 | 1 440 (0) | 0,20 s | |
| 51 | rapprochement-1min | oui | 08/10 21:59 | 1 440 (0) | 0,21 s | |

Appels pg_net de 16:00 à 22:00 [mesuré] : 2 174 × 200, 25 × 546
(`empreintes-urls`, 19:17-19:31), environ 26 délais de 5 s dépassés.

---

## 5. Déjà sous contrôle (vérifié)

- **Prise des jobs** atomique : verrou `SKIP LOCKED`, réservation par poste,
  contrôle avant chaque écriture ; 0 refus 409/503 sur 48 h de journaux ; un
  seul job « en cours » dans le parc ; reprise d'un job figé par le poste
  détenteur.
- **Ventes, côté serveur** :
  - verrou par fiche, reçu `ventes_operations`, `ventes_commande_unique`, un
    seul retrait ouvert par annonce (garde BEFORE INSERT) : aucune double vente
    ni double retrait par course entre chemins serveur ;
  - eBay enregistre seul et arme les retraits dans la même transaction
    (signal → retrait, médiane 0,4 h) ;
  - 82 mails de vente en 14 jours, 0 en double ;
  - photo identique comme preuve de retrait : 5 en 14 jours, tous concordants.
- **Retraits exécutés** (14 jours, armé → fait, médiane / p90) : Vinted 3 min /
  5 h, Leboncoin 9 min / 4,4 h, eBay 10 min / 1 h, Beebs 43 min / 24,5 h, Opla
  11 min / 31 h. Biais : les 109 ventes de U1 n'y figurent pas.
- **Datation des absences côté serveur** (Leboncoin, eBay, Opla) : pas de
  fenêtre ; une extension éteinte longtemps ne perd rien hors Vinted.
- **Identifiants** : aucun doublon d'identifiant Vinted ; le slug ne compte
  pas ; eBay API et extension partagent l'ItemID ; les annonces eBay d'un autre
  vendeur sont écartées. Republication Vinted : 0 conflit d'identité sur 6 383.
- **Moteur v3** : 119 à 121 comptes « termine », 0 passe négative, 0 compte
  bloqué, 0 pause de relevés active.
- **Paiements** :
  - un seul calcul du palier (`palier.js` = `palier_de` = `quotas_etat`),
    0 incohérence de drapeaux, 0 payant sans canal ni offre ;
  - signatures Stripe et Apple vérifiées ;
  - quota Free (50 par mois) exact, imports hors quota ;
  - plafond Premium 50 par jour respecté ;
  - réservations de publication éteintes (0 ouverte) ;
  - aucune échéance en retard de plus de 2 jours.
- **Déployé = dépôt** :
  - 55 fonctions edge en prod = 55 dossiers ;
  - `verify_jwt` identique à `config.toml` partout ;
  - les fonctions SQL des 12 dernières migrations inscrites sont en prod à
    l'identique, et `20261008160000` est bien absente ;
  - aucun déclencheur désactivé dans `public`.
- **Crons** : aucune exécution perdue sur 6 h mesurées ; CPU max 58,7 % sur
  24 h ; 1 seul échec de journal de mail en 7 jours.
- **Sortie d'Opla** : `opla_sortie_le` = 1791583200 (10/10 00:00 Paris), lu
  partout (gpj, handler-watch, app, SQL) ; les retraits Opla restent permis
  (A4).
- **Purges** : `republish-purge` supprime fichiers puis ligne, jamais l'inverse ;
  aucune photo de fiche ni de job ouvert ne pointe sous `/republish/`.

---

## 6. Ordre de traitement recommandé (rien n'est lancé : décision de Nico)

1. **U1 — rebrancher l'enregistrement des ventes Vinted prouvées**, à la fin du
   relevé du dressing, avec un filet borné et mesuré en CPU. C'est le plus gros
   risque et le correctif le plus court. Dans la foulée, la section ops-digest
   « vente prouvée non enregistrée ».
2. **R2 — retraits sans exécutant**, *avant le 10/10 00:00* pour Opla : ligne
   « À régler » et mail ; connexion Opla gardée pour les retraits ; retrait
   eBay par l'API.
3. **U3 — « unavailable » ne clôt plus un retrait** ; vérifier sur la page
   Opla les 3 annonces de dbca7f39 ; un relevé qui revoit l'annonce rouvre le
   retrait.
4. **R1 — garde « remplacée » pour toutes les plateformes**, et clôture de
   l'alerte par sa remplaçante (S–M). Cela évite de mauvais clics dès demain.
5. **U2 — règle « remise en ligne » étendue à toutes les plateformes**, après
   le feu vert de `20261008160000` (même moteur), puis rattrapage ; puis U4
   (réparations Bebertdeals déjà prêtes).
6. **Surveillance (O28, O29)** : mail « RAS » et garde-mort, `cron_passages`,
   sections crons inactifs, rafales de fiches, questions, drapeaux et
   migrations. C'est ce qui aurait montré Bebertdeals le 28/09.
7. **O2 — règles orphelines des crons 17/22** : trancher règle par règle, puis
   rattrapage de la fenêtre 28/09 → 07/10.
8. **O3, O9, O14 — questions et rejugement** : caducité dans la passe normale,
   relances, rejugement des retraits en fin de relevé.
9. **Paiements** :
   - vite : O23 (lecture d'un autre compte, S), O24 (S), O25 (S) ;
   - puis O20 (décision past_due, vérifier 8a2eba68 dans Stripe), O26, O21,
     O22 ;
   - O27 avant toute ouverture du Cloud.
10. **Vinted / Beebs** : O1 (datation serveur), O4, O6, O7, O8.
11. **Extension**, au prochain paquet : O18, O19, O15, O16, O17, O5.
12. **Blancs** : au fil de l'eau ; B17 (état et CLAUDE.md) tout de suite, car
    une doc fausse fait prendre de mauvaises décisions.
