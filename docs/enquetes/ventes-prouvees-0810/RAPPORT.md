# Ventes prouvées « sold » : recontrôle, cause, correctif (08/10/2026, nuit)

Suite de l'audit `docs/audit/audit-fiabilisation-0810.md` (urgence U1). Heures de
Paris. Comptes de test, de Nico et d'Ornella exclus des comptages. **[mesuré]** =
requête dédiée en lecture seule (`set transaction read only`) ou journaux
Supabase ; **[estimé]** = règle approchée (dite) ; **à vérifier** = non établi.
**Rien n'a été écrit en base, rien déployé, aucun mail.**

## 1. Recontrôle de l'audit

Requête dédiée, une ligne par annonce (compte, fiche, plateforme, statut, preuve
« sold », chaque garde de la base), jamais sur le titre :

| Ce que disait l'audit | Recontrôle [mesuré, 08/10 ~23:00] | Verdict |
|---|---|---|
| 109 articles vendus sur Vinted encore « en stock », 35 comptes | **110** annonces Vinted `published` avec le signal `sold` sur une fiche à pièce unique en stock (35 comptes). Mais **93 seulement ont la preuve** (dernier relevé du dressing de CETTE annonce = `sold`, pris après sa mise en ligne) ; **17** n'en ont pas (dernier relevé `active` ×15, `reserved` ×1, aucun ×1) | **Faux en partie** : 17 « vendus » ne sont que des signaux, jamais une vente |
| (implicite) toutes enregistrables | **90 enregistrables sans aucun doute (24 comptes)** ; 2 refusées par la base (« une vente est déjà liée ») ; 1 douteuse (article peut-être remis en ligne) | précisé |
| 28 avec des annonces ailleurs, 10 comptes | **25** des 90 ont une copie publiée ailleurs (**8 comptes, 32 copies**) | **surévalué** (l'audit comptait les 17 sans preuve) |
| 14 avec une copie vue en ligne depuis 3 jours | **14** = 12 enregistrables (4 comptes, 14 copies vues) + 1 à vérifier (66ffd657) + 1 sans preuve (68e350f0 1790234431981003) | **vrai** |
| Aucun appelant depuis le 28/09 16:46 | 0 fonction SQL, 0 cron, 0 déclencheur, 0 ligne de code ; 0 appel dans les journaux edge sur 24 h (9 appels à `enregistrer_vente_atomique`, 33 à `enregistrer_vente_declaree` sur la même fenêtre) | **vrai** |
| « retiré pour un problème de lenteur » | l'appel n'a vécu que **4 minutes** ; le lien avec la lenteur **n'a jamais été démontré** (§ 2) | **à nuancer** |

Preuves en attente : la plus ancienne du 28/09 05:54, la plus récente du 08/10
22:45 ; âge médian 3,4 jours ; 63 de plus de 2 jours, 19 de plus de 7 jours
[mesuré]. Côté eBay, 2 ventes prouvées (`browse_api`, identifiant exact) sont
refusées par la même garde « vente déjà liée » (b6005a59, 4cd4d9ae).

## 2. Où, quand, pourquoi l'appel a été retiré — et ce qui le déclenchait avant

- **Avant le 28/09 : rien.** La règle naît le 28/09 (GO de Nico après le cas
  Angel) : migration `20260928140738` (commit `59a24fc`, 16:09), corrigée par
  `20260928143457` (`c94c795`, appliquée 16:34). Son seul appelant : un appel
  dans `get-pending-jobs` à **chaque poll d'exécution de chaque extension**
  (`!includeProcessing && !includeNeedsUser`), sans filtre préalable.
- **16:42** : `get-pending-jobs` v158 déployée avec l'appel.
  **≈ 16:46** : retour à v159 (code `fba7c15`), appel retiré du source
  (`125599d`, 16:50). Durée de vie en prod : **environ 4 minutes**.
- **Pourquoi** (`docs/INCIDENT_ASTRA_2026-09-28_LATENCE.md`, mesuré ce jour-là
  par ClickHouse) : latence RPC moyenne 103 ms → 392 ms, p95 172 ms → 1 447 ms
  entre 16:42 et 16:49. Mais le même document écrit **« Le lien causal exact
  n'est PAS démontré »**. Les pointes ont **continué après** le retrait
  (complément de 16:57) : les plus lentes étaient
  `rapprochement_urls_a_empreinter` (13 701 ms, HTTP 500) et
  `doublons_reserver_fiches` (8 391 ms, HTTP 500), dont la source commune
  `doublons_fiches_a_examiner` faisait un UNION avec une recherche corrélée
  avant le LIMIT. Le cron 17 (`doublons-balayage-2min`) a été coupé à 16:54:46,
  et les appels sont revenus à 26-72 ms à 17:02. La reprise de 18:03 note :
  « Aucun appel périodique à `enregistrer_ventes_prouvees` n'a été réintroduit…
  bloqués jusqu'à une version bornée, légère et mesurée ». Elle n'a jamais été
  écrite.
- **Conclusion** : la vente automatique a été retirée **par précaution**, dans
  un incident dont la cause mesurée était ailleurs (le balayage des doublons).
  Les docs ont ensuite continué à la dire active (`consignes-2026-09-28.md`,
  en-tête de `20261008101000`, `docs/reprise/terminal-cloture-multi-synchro-0810.md`).
  La passe Astra du 28/09 notait pourtant (l. 182) : « `enregistrer_ventes_prouvees`
  n'est pas présent dans le code serveur livré ».

## 3. La lenteur, mesurée

- **Coût d'un appel** (EXPLAIN ANALYZE de la sélection de la fonction de prod,
  lecture seule, 08/10) sur les trois plus gros comptes : **35 ms**
  (8a2eba68, 968 fiches en stock parcourues), **29 ms** (2189c4d8, 1 215),
  **11 ms** (dbca7f39, 2 062 annonces publiées parcourues) [mesuré].
- **Ce qui la rend lente** : la sélection parcourt **toutes** les fiches en stock
  (ou toutes les annonces publiées) du compte pour trouver au plus cinq
  annonces : aucun index ne porte le signal `sale_signal` (un champ jsonb). Pas
  de verrou ni d'attente : un balayage du compte, proportionnel à sa taille.
  Chaque candidate ajoute une lecture indexée des relevés Vinted (0,03 à 0,16 ms).
- **Volume** : `get-pending-jobs` reçoit environ 10 000 appels par 24 h
  (journaux `function_edge_logs`, qui en perdent une partie), soit 7 à 9 par
  minute. À 11-35 ms, l'appel à chaque poll coûterait **moins d'une demi-seconde
  de calcul par minute** [estimé] : il n'explique pas la saturation du 28/09,
  cohérent avec l'incident (§ 2).
- **Sans index, sur tout le parc** (ce que ferait un cron naïf) : la même
  sélection, sans filtre de compte, lit les 92 416 annonces (33 600 pages,
  **188 ms**) pour 95 candidates [mesuré]. D'où l'index partiel (§ 4).

## 4. Le correctif à la racine (livré, NON appliqué)

| Pièce | Où |
|---|---|
| Index partiel des annonces publiées portant le signal `sold` (118 lignes pour tout le parc) | `supabase/migrations/20261008233000_ventes_prouvees_index.sql` (CONCURRENTLY, seule) |
| Sélection `ventes_prouvees_a_enregistrer`, exécuteur `enregistrer_vente_prouvee`, passage `ventes_prouvees_tick`, veille `ventes_prouvees_veille`, cron SQL `ventes-prouvees-2min`, armement daté | `supabase/migrations/20261008233100_ventes_prouvees_automatiques.sql` ; inverse `supabase/rollbacks/20261008233100_ventes_prouvees_automatiques_INVERSE.sql` |
| Alerte « le cron ne tourne plus / une preuve attend » (support@, une par heure au plus) | `supabase/functions/veille-cpu/index.ts` + `_shared/ventes-prouvees.js` (à déployer) |
| Section « Ventes prouvées » (et « non branchée » tant que la migration manque) | `supabase/functions/ops-digest/index.ts` (à déployer) |

Les règles :
1. **Appelant borné, hors de tout poll** : cron SQL pur (pas de pg_net, pas de
   délai de 5 s, vrai statut dans `cron.job_run_details`), minutes impaires ;
   verrou unique (deux passages simultanés : le second s'efface) ; 25 annonces
   et 4 s au plus par passage, le reste au suivant.
2. **Seulement les preuves arrivées depuis l'armement** (`coin_config`
   `ventes_prouvees_auto_depuis`, posé à l'application) : l'arriéré n'est jamais
   traité par le cron (§ 6). Dans l'index, l'ensemble des preuves en attente
   tient en quelques centaines de lignes : relire « toutes celles depuis
   l'armement » coûte autant que « celles depuis le dernier passage », sans
   jamais en perdre une (un compte reporté parce qu'un relevé tourne est repris
   au passage suivant).
3. **Seule une preuve « sold » enregistre une vente** : le dernier relevé du
   dressing de CETTE annonce dit `sold` (pris après sa mise en ligne), ou la page
   de CETTE annonce a été lue `sold` sur son identifiant exact. Jamais
   `unavailable`, jamais une annonce introuvable ou disparue, jamais un signal
   démenti par le dressing (Louis, 06/10, migrations 20261008110000 à 112000 :
   inchangées).
4. **La chaîne existante, seule** : `enregistrer_vente_atomique` INCHANGÉE (ses
   gardes du 08/10, son reçu `ventes_operations`) → retraits des copies prouvées
   dans la même transaction → `inventaire_vendu_retire_ses_copies` (retraits,
   questions « Déjà vendu ? »). C'est l'appel même de la détection automatique
   eBay en prod (`orchestrateSale`, mêmes arguments). Notifications : le signal
   `sold` a déjà créé sa note `push-ventes` ; la vente retombe sur les mêmes clés
   (`annonce:`, `job:`, `fiche:`) → « doublon », aucun second mail.
5. **Refus mémorisé** (`ventes_prouvees_refus`), réexaminé 6 h plus tard (15 min
   après une erreur) : jamais rejoué à chaque passage, jamais perdu.
6. **Veille** : `ventes_prouvees_veille()` (passages, en retard, arriéré, refus)
   lue par veille-cpu (alerte) et l'ops-digest (section, objet du mail).
   Vérifier l'état réel : `select public.ventes_prouvees_veille();` (absente =
   non branchée), `select * from cron.job where jobname = 'ventes-prouvees-2min';`,
   `select * from ventes_prouvees_passages order by debut desc limit 5;`.

Coût (règle du 04/10) : avec l'index, une lecture de l'index partiel par passage
(estimé < 5 ms, à relire après application par `pg_stat_statements`) ; une ligne
de passage toutes les 2 min (purge à 14 jours) ; plus ce qu'écrit une vente.

Un point à savoir : pendant un passage, les fiches traitées sont verrouillées
jusqu'à la fin (au plus 4 s). Un clic « Vendue » de la personne sur la même
fiche à cet instant attend, et au-delà de 1,5 s (`lock_timeout`
d'`enregistrer_vente_atomique`) reçoit « réessaie » — sans jamais de double vente.

## 5. Tests

- **Banc** `scripts/ventes-prouvees-banc.mjs` (`npm run banc:ventes-prouvees`),
  sur un vrai Postgres 17 jetable, jamais la prod, avec les fonctions de vente et
  de retrait de PROD capturées le 08/10 (`scripts/fixtures/ventes-prouvees-prod-0810.json`)
  et les deux migrations rejouées telles quelles : **57/57**. Couvre
  l'idempotence (une vente, un retrait, un reçu ; clic après coup = rejoué),
  « unavailable » seul et « sold » démenti (rien), l'arriéré (jamais par le
  cron), le passage borné (25 puis 15 ; budget 500 ms : 2 faites, 8 reportées),
  **deux passages simultanés sur deux connexions** (l'un s'efface ; 20 fiches →
  20 ventes, 20 retraits), le clic pendant un passage (0 double), le refus
  mémorisé, le drapeau coupé, le relevé en cours, la veille et l'alerte, la copie
  non prouvée (question, pas de retrait), la vente partielle, et le rattrapage
  appliqué puis défait par son inverse.
- **Le banc mord** : 7 mutations de la migration (sans verrou, « unavailable »
  accepté, sans borne, sans budget, refus non mémorisé, arriéré traité, relevé
  ignoré) → 7/7 détectées. Sans le verrou, aucune double vente n'apparaît
  quand même : le reçu et le verrou par fiche d'`enregistrer_vente_atomique` la
  tiennent seuls ; le verrou du passage évite le travail en double.
- **Selftest** `selftest:ventes-prouvees` (dans la suite) : 57 contrôles des
  règles écrites, dont 14 mutations détectées sur 14.
- Suite complète : **217/217 avant** (arbre d'origine `deb93e6`), **218/218 après** ;
  `npm run build:essai` vert avant et après ; `deno check` de veille-cpu et
  ops-digest vert [mesuré, 08/10 nuit].

## 6. Rattrapage de l'arriéré — À BLANC

`node scripts/reparations/20261008_rattrapage_ventes_prouvees.mjs` (lecture
seule) → `RATTRAPAGE-A-BLANC.md` et `rattrapage-a-blanc.json` dans ce dossier.
Même sélection que le cron (lue dans la migration), même chaîne (simulée ici ;
exécutée pour de vrai par le banc, S1, S10, S12). Résultat du 08/10 23:13 :
- **90 articles à enregistrer, 24 comptes** ; copies retirées : **Leboncoin 13,
  Opla 7, eBay 6, Beebs 1** ; questions « Déjà vendu ? » : Opla 5 ; publications
  en attente arrêtées : Leboncoin 1, Beebs 1.
- **Urgents** (copie vue en ligne depuis 3 jours) : **12 articles, 4 comptes**
  (bd380fbf ×5 Opla, 68e350f0 ×5 dont 4 copies Opla NON prouvées → questions,
  53efea05, 3424a25d), liste à part en tête du rapport.
- **À vérifier, rien enregistré** : 5 — 4 « vente déjà liée » (2 eBay, 2 Vinted)
  et 1 « remise en ligne possible » (66ffd657 1790523715035002 : une autre fiche
  du compte, même titre, revue en ligne sur Vinted après la preuve ; ses copies
  Leboncoin, Beebs et eBay sont vues en ligne).
- **Signaux « sold » sans preuve** : 23 (jamais une vente).
- Bebertdeals (c15f4b0e) : 9 ventes, toutes sur ses annonces les plus récentes ;
  les copies restées sur ses anciennes fiches relèvent de la règle « remise en
  ligne » (migration 20261008160000, toujours en attente), pas de ce rattrapage.
- Mails : les notes `push-ventes` de ces signaux existent déjà ; une vente
  enregistrée retombe sur les mêmes clés (doublon). Au-delà de 8 ventes
  distinctes en 5 minutes pour un compte, `push-ventes` les classe « rattrapage
  de masse » (rien n'est envoyé). Aucun mail attendu — à vérifier au premier
  compte appliqué (`push_ventes` du compte, statut).
- **Sauvegarde et inverse** : `--appliquer` sauvegarde d'abord fiches et jobs
  (`_backup_0810_ventes_prouvees_*`, fermées), journalise chaque vente, chaque
  retrait, chaque question (`_rattrapage_0810_ventes_prouvees`) ;
  `scripts/reparations/20261008_rattrapage_ventes_prouvees_INVERSE.sql` défait
  tout sauf un retrait déjà EXÉCUTÉ sur une plateforme (irréversible : listé par
  la requête 0 de l'inverse). Prouvé sur le banc (S12).

## 7. Ce qui attend le feu vert nommé de Nico (dans l'ordre)

1. L'index, SEUL (hors transaction) :
   `npx supabase db query --linked -f supabase/migrations/20261008233000_ventes_prouvees_index.sql`
   puis `npx supabase migration repair --linked --status applied 20261008233000`.
2. La migration (pose l'armement à l'instant de l'application ; le cron
   démarre : seules les preuves arrivées après comptent) :
   `npx supabase db query --linked -f supabase/migrations/20261008233100_ventes_prouvees_automatiques.sql`
   puis `npx supabase migration repair --linked --status applied 20261008233100`.
   Relire : `select public.ventes_prouvees_veille();` et, après 4 minutes,
   `select * from ventes_prouvees_passages order by debut desc limit 3;`.
   Couper sans rien retirer : `UPDATE coin_config SET value = 0 WHERE key = 'ventes_prouvees_auto_depuis';`.
3. Les deux fonctions (geste `functions list` avant/après, `verify_jwt` = false
   pour les deux) :
   `npx supabase functions deploy veille-cpu --no-verify-jwt` et
   `npx supabase functions deploy ops-digest --no-verify-jwt`.
4. Le rattrapage, compte par compte, **retraits irréversibles** — les urgents
   d'abord (bd380fbf, 68e350f0, 53efea05, 3424a25d) :
   `node scripts/reparations/20261008_rattrapage_ventes_prouvees.mjs --appliquer --feu-vert-nico --user <uuid>`.
5. Les 5 « à vérifier » et les 23 « sans preuve » : à trancher (rapport § 4 et § 5).

## 8. Application (GO de Nico, 08/10 → 09/10 nuit)

- **23:40** : index `cross_post_jobs_signal_vendu_idx` construit (CONCURRENTLY, valide),
  puis migration 20261008233100 appliquée ; les deux inscrites (`migration repair`).
  Armement `ventes_prouvees_auto_depuis` = 08/10 23:40:01 (journalisé). Cron
  `ventes-prouvees-2min` = job 52. CPU avant : 5,9 %.
- **Déploiements** : ops-digest v34 → **v35**, veille-cpu v1 → **v2**, `verify_jwt`
  false avant et après (relu par `functions list`). veille-cpu lit la veille :
  `{"lue":true,"anomalies":[]}` à 23:44 et 23:46.
- **Cron** : passages à 23:41, 23:43, 23:45, 23:47… tous « fait », 85 ms en
  moyenne, 189 ms au plus ; 0 candidate (aucune preuve neuve depuis l'armement) ;
  `cron.job_run_details` « succeeded » ; 0 alerte ventes, 0 alerte CPU, CPU max
  10,3 % pendant tout le rattrapage [mesuré].
- **Rattrapage** (`--appliquer --feu-vert-nico`), urgents d'abord :
  1. 3424a25d seul (23:41:50) → preuve : 0 mail, 0 note « Vendu ! », 0 échec de
     mail après 3 passages du cron push-ventes (23:42, 23:43, 23:44) [mesuré] ;
  2. les 11 autres urgents (53efea05, 68e350f0, bd380fbf ; 23:45) → 0 mail, 0 note ;
  3. le reste (78, 23:46) → 3 notes « Vendu ! » nées dans la transaction (signaux
     récents) classées `ignoree` / `rattrapage_ventes_prouvees_0810` avant tout
     envoi ; sur les 24 comptes : **0 mail**, 0 note envoyable [mesuré, 23:46].
  Neutralisation ajoutée au script avant l'application : les notes nées dans la
  transaction du lot, pour les fiches du lot seulement (prouvé au banc, S12, 60/60).
- **Bilan** : **90 ventes, 24 comptes** ; **27 retraits armés** (Leboncoin 13, Opla 7,
  eBay 6, Beebs 1) ; **5 questions « Déjà vendu ? »** Opla (copies non prouvées,
  jamais retirées sans réponse) ; 2 publications en attente arrêtées.
  Journal `public._rattrapage_0810_ventes_prouvees` ; sauvegardes
  `_backup_0810_ventes_prouvees_*` ; inverse `scripts/reparations/20261008_rattrapage_ventes_prouvees_INVERSE.sql`.
- **Non touchés** (consigne de Nico) : les signaux « sold » dont le dernier relevé
  est « active » et tous les signaux sans preuve (23) ; les 5 « à vérifier »
  (4cd4d9ae, 66ffd657, a208137a, b6005a59, bf85d176).
- **Retraits à 00:05** [mesuré] : **13 faits / 27** — Leboncoin 9/13, eBay 4/6.
  Reste : eBay 2 « reportés » par le worker API (offre déjà hors ligne, vente non
  prouvée : non achetables) ; Leboncoin 4, Opla 6, Beebs 1 en attente de
  l'extension de leur compte (68e350f0 vue le 08/10 05:54 ; bd380fbf le 08/10
  18:39 ; 6f41de45 le 04/10 ; e847ef68 le 30/09) ; Opla 1 en « À régler »
  `opla_acces` (63ad8597 : autoriser Opla). Les retraits Opla restent permis
  après la sortie du 10/10 (règle A4). 5 questions Opla sans réponse.
- **Contrôle à 00:05** : 24 passages du cron push-ventes depuis le début, toujours
  0 mail et 0 note envoyée sur les 24 comptes ; cron des ventes : 13 passages,
  tous « fait », 60 ms en moyenne ; 0 alerte ; CPU max 10,3 %.
