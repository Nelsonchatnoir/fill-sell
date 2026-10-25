# Créneau de Jocabroc (19:00-22:00, Paris) : enquête du 25/10/2026

Compte : jocabroc8 (Pro), user_id 53efea05-dc2d-4467-a8cd-c6fa52a47a61, boutique Vinted 137708392 « lookyvintage ».
Réglages lus en prod : Vinted 19:00-22:00, jours 1,2,4,5,6,7, ordre « vues », ancienneté 7 j, 6 par jour ;
Leboncoin 19:00-22:00 tous les jours, ordre « anciennes », 7 j, 6 par jour. Fuseau Europe/Warsaw (même heure que Paris).
Heures : 23 et 24/10 en heure d'été (UTC+2), 25/10 en heure d'hiver (UTC+1). Toutes les heures ci-dessous sont celles de Paris,
sauf mention « UTC ».
Lecture seule en base : rien n'a été écrit, déployé ni appliqué. Les fonctions ont été lues par `pg_get_functiondef` en prod
(copies et md5 dans `agents3/prod2/`).

---

## 0. En bref

| | 23/10 | 24/10 |
|---|---|---|
| Vinted (créneau 589 / 615) | 6 prévues, 1 faite : 4 jobs nés, dont **3 sur des annonces mortes** (absentes du dressing depuis le 10, 02 et 07/10) ; **Chrome muet à partir de 21:03** | 6 prévues, 1 faite : **Chrome muet de 16:58 à 21:12**, puis 1 republication réussie (21:15) et **1 annonce morte** (21:48, absente depuis le 29/09) |
| Leboncoin (592 / 616) | 5 prévues, 1 faite : bloqué 19:03→~19:15 par le lot manuel de 18:15, puis **le rythme du compte pris par Vinted** (19:00, 19:30, 20:00) ; une seule place à 20:39, quand Vinted était lui-même bloqué par trois republications manuelles ; puis Chrome muet | 5 prévues, 0 faite, **sautes = {}** : Chrome muet jusqu'à 21:12, puis **le rythme du compte toujours pris par Vinted** (30 min contre 36) ; deux retenues qui n'écrivent rien |

Quatre causes, toutes prouvées en base et dans les journaux :
1. **Chrome éteint pendant le créneau, et la retenue ne dit rien** (étape 3 du balayage : `CONTINUE` muet).
2. **Les annonces Vinted mortes restent candidates** : la branche Vinted de `republish_planifiee_candidats` ne lit ni les relevés
   du dressing ni le signal « plus en ligne » ; l'ordre « vues » les met même EN TÊTE (vues figées, âge qui grandit). Chaque
   annonce morte prend une place des prévues et 30 min de rythme, puis 25 h de pause « introuvable à confirmer ».
3. **Une place prise par un essai sauté n'est jamais rendue** : 6bis compte tous les jobs du créneau, l'étape 6 mesure le rythme
   depuis le dernier job né, quel que soit son sort.
4. **Deux plateformes dans le même créneau ne peuvent pas faire 6 + 5** : le rythme est celui du COMPTE (règle du 18/09, « un seul
   Chrome »), l'intervalle de Vinted (30 min) passe toujours avant celui de Leboncoin (36 min) : Leboncoin est affamé, en silence.

La chute des éligibles Leboncoin (121-127 → 35-51) n'est PAS une panne : c'est la règle du 23/10 (point 3) qui écarte enfin 83
annonces Leboncoin disparues.

---

## 1. Les faits

### 1.1 Les lignes de créneau (`republish_creneaux`)

```
id   jour   pf   statut   élig prév faites  créée   sautes
589  23/10  V    ecourte  163  6    1       19:00   _bloque_en_vol (republication_en_vol) depuis 19:03, dernier 20:42, levé 20:45
592  23/10  LBC  ecourte  35   5    1       19:03   _bloque_en_vol (annonce_hors_ligne) depuis 19:03 (lot manuel, fini 19:14), repris 20:51 par son
                                                      propre job, levé 20:54 ;
                                                      inv:1790174152757, inv:1789908556276007 annonce_introuvable (20:39)
615  24/10  V    ecourte  162  6    1       19:03   10501486243 observee_trop_recente (21:15) ; _bloque_en_vol 21:18→21:24 ;
                                                      10117159001, 10164221462 annonce_introuvable, 10176517596 attente_decision (21:48)
616  24/10  LBC  manque   51   5    0       19:03   {}   (extension_vue = true : posée au retour de Chrome à 21:12)
```
Les jours précédents, même tableau : quand les deux plateformes tournent, Leboncoin fait 0 à 2 (18/10 V 1/6 LBC 0/5 ; 19/10
V 0/6 LBC 2/5 ; 20/10 V 4/6 LBC 0/5 ; 22/10 0/6 et 0/5, Chrome fermé). Le mercredi 21/10 (Vinted ne tourne pas), Leboncoin fait 4/6.

### 1.2 Les republications automatiques nées dans ces créneaux (`cross_post_jobs`)

```
job       créé          annonce        sort
f626887e  23/10 19:00   10357735096    publiée 19:18
fde3d484  23/10 19:30   10164221462    404 à 19:31 → pause « introuvable à confirmer » → close « disparue » 24/10 21:21
d4281e1d  23/10 20:00   10117159001    404 à 20:01 → pause → close « disparue » 24/10 21:21
851599a2  23/10 20:39   LBC 3293947984 publiée 20:52
961f0a27  23/10 21:12   10176517596    née 9 min après le dernier signe de Chrome (21:03) ; retenue « hors créneau » toute la
                                          matinée du 24 ; servie 24/10 21:14 → 404 → pause → close « disparue » 25/10 01:36
2e290028  24/10 21:15   10357467974    publiée 21:21
04659f4b  24/10 21:48   10118315224    404 à 21:48 → pause → close « disparue » 25/10 02:24 (heure d'hiver)
```
Les republications manuelles du 23/10 (10:10-10:58, 18:15, 20:27-20:42) ont toutes réussi. Elles bloquent le créneau pendant
qu'elles tournent (garde anti-rafale, motif écrit `_bloque_en_vol`) : Leboncoin de 19:03 à ~19:15, Vinted de 20:27 à 20:45.
Entre 19:15 et 20:39, Leboncoin attendait le rythme du compte : chaque job Vinted (19:00, 19:30, 20:00) repoussait de 36 min
sa prochaine place ; il n'est passé à 20:39 que parce que Vinted était bloqué par ses republications manuelles.

### 1.3 Chrome (journaux `function_logs`, polls `get-pending-jobs` de 53efea05, toutes les 2 min quand il vit)

- 23/10 : polls continus de 18:00 à **21:03:18**, puis plus rien jusqu'au 24/10 **06:22:31**.
- 24/10 : polls de 06:22 à **16:58:42**, puis plus rien jusqu'à **21:12:12**.
- Seul `get-pending-jobs` écrit `profiles.extension_last_seen_at` (recherche dans tout le dépôt et dans les fonctions SQL) :
  le balayage voyait donc l'extension « absente » (> 10 min) de 21:13 à 22:00 le 23/10 et de 19:03 à 21:12 le 24/10.
- Le passage du balayage de 19:00 le 24/10 manque dans `function_edge_logs` (16:57 puis 17:03 UTC) : les deux lignes sont nées
  à 19:03. Sans effet ici (Chrome était éteint) ; `net._http_response` montre des délais de 5 s de pg_net sur la résolution DNS
  (observation, pas une cause du cas).

### 1.4 Les annonces Vinted mortes

```
annonce       dernière vue        relevés complets sans elle   « plus en ligne » depuis   essais de republication (tous annulés)
10117159001   02/10 16:30         28                           03/10 17:11                17/10 19:00, 19/10 19:42, 23/10 20:00
10164221462   10/10 21:15         20                           12/10 18:09                16/10 19:00, 18/10 19:33, 23/10 19:30
10176517596   07/10 20:09         23                           09/10 08:26                19/10 20:12, 23/10 21:12
10118315224   29/09 16:35         35                           02/10 15:14                24/10 21:48
```
La fiche garde `vinted_item_id`, `vinted_status = 'active'`, `disparu_le = NULL`, `statut = 'stock'` : rien ne la marque morte.
Les relevés du dressing sont pourtant complets et fréquents (25/10 12:39 : 262 lues sur 262 ; 24/10 21:18 : 254/254 ; 23/10
20:38 : 257/257). Aujourd'hui, **24 des 159 éligibles Vinted** de Jocabroc sont absentes de 20 à 37 relevés complets de sa
boutique (21 portent aussi le signal « plus en ligne »), dont les rangs 6, 14, 21 et 24 : sans correction, la 2e republication
de ce soir viserait une annonce morte (10125516124, absente depuis le 09/10).
Sur le parc (comptes à republication planifiée Vinted active), Jocabroc est aujourd'hui le seul compte concerné.

### 1.5 Leboncoin : 121-127 éligibles (20-22/10) → 35 (23/10) → 51 (24/10)

`republish_planifiee_candidats('leboncoin')` aujourd'hui : 134 annonces, **83 « annonce_introuvable »** et 51 éligibles. Les 83 ont
toutes le signal « plus en ligne » (posé entre le 28/09 et le 24/10) et 82 sont datées `disparu_le` par le relevé Leboncoin dans
`annonces_plateforme`, sans être revues depuis. C'est la règle du 23/10 (migration `20261023140000`, point 3 de Louis) : avant
elle, ces 83 étaient comptées éligibles (et pouvaient être tirées). 35 → 51 : le va-et-vient normal (republications des 7
derniers jours, en cours le 23 au soir avec le lot manuel de 18:15).

---

## 2. Les causes, prouvées

### (a) Pourquoi 6 prévues → 1 faite ; un sauté est-il remplacé ?
Non. Dans `republish_planifiee_sweep` (prod) :
- **6bis** compte `count(*)` des jobs du créneau, quel que soit leur sort : un job annulé « plus en ligne » prend une place des 6.
- **6** mesure le rythme depuis `max(created_at)` du dernier job auto né (toutes plateformes) : un job annulé 15 s après sa
  naissance bloque le créneau 30 min (Vinted) ou 36 min (Leboncoin).
- La boucle passe bien au candidat suivant quand un candidat est MIS DE CÔTÉ (motif) ou refusé pour lui-même par le RPC — mais
  un candidat qui devient un job puis échoue n'est jamais remplacé.
23/10 Vinted : 4 jobs, 3 morts → 3 places et 1 h 30 de rythme perdues, puis Chrome éteint dès 21:03 (le job de 21:12 est né
pour un Chrome déjà fermé). 24/10 Vinted : Chrome éteint jusqu'à 21:12, 1 réussie, 1 morte, fin à 22:00.

### (b) Pourquoi les annonces Vinted disparues restent candidates soir après soir
La branche Vinted de `republish_planifiee_candidats` ne garde que : `statut = 'stock'`, `vinted_item_id` non nul, photos,
`vinted_status` ni hidden ni draft, `disparu_le IS NULL`, ancienneté. Elle ignore l'absence des relevés complets
(`vinted_listing_snapshots`, `vinted_sync_runs`) et le signal `sale_signal = 'unavailable'` (que la branche des autres plateformes
lit depuis le 23/10). La règle du 24/10 (A5) n'écarte une annonce qu'APRÈS un essai clos « disparue » : chaque annonce morte coûte
au moins une place, et la pause « introuvable à confirmer » dure ~25 h. L'ordre « vues » aggrave : vues figées / âge croissant =
le plus petit ratio = tête de liste. Ces quatre annonces ont coûté **9 places** du 16 au 24/10 (tableau 1.4).

### (c) Pourquoi Leboncoin a fait 0 sur 5 le 24/10 sans aucun motif
Deux `CONTINUE` muets du balayage, prouvés par l'horaire :
1. **19:03 → 21:12 : étape 3** (`extension_last_seen_at` > 10 min) — Chrome muet (aucun poll de 16:58 à 21:12). Aucune écriture.
2. **21:15 → 22:00 : étape 6** — chaque passage, Leboncoin passe en premier (0 job auto ce jour-là) mais le rythme se mesure
   depuis le dernier job du COMPTE : Vinted 21:15:01 → Leboncoin pas avant 21:51:01 ; Vinted 21:48:01 → pas avant 22:24:01,
   après la fin. Aucune écriture.
Ni la sonde Leboncoin (403/null) ni l'extension n'y sont pour rien : aucun job Leboncoin n'est même né, et `get-pending-jobs`
ne retient une plateforme que si sa session vaut `false` (null = inconnu, jamais retenu). Le poste de Jocabroc fait passer ses
jobs Leboncoin (9 republications le 23/10, 9 dépôts le 24/10, 3 retraits le 25/10 : tous aboutis). Ni l'espacement de 900 s
(il ne sert qu'au calcul des prévues), ni les 51 éligibles.

### (d) Pourquoi `eligibles_debut` Leboncoin est tombé de 121 à 35-51
Voir 1.5 : la règle du 23/10 écarte 83 annonces Leboncoin réellement disparues. Le chiffre est devenu juste.

### Et le 6 + 5 ? (structure)
Rythme du compte (règle du 18/09, « un seul Chrome : deux files qui se croisent se gênent ») + intervalles différents (Vinted
10800/6 = 1 800 s, Leboncoin 10800/5 = 2 160 s) : à chaque passage où les deux attendent, l'intervalle de Vinted échoit le
premier et Vinted prend la place. Ce soir : Vinted à 19:00, 19:30, 20:00, 20:30, 21:00, 21:30 ; Leboncoin pas avant 22:06 →
**0**. Les prévues annoncées (6 + 5 = 11 en 3 h) supposent deux rythmes indépendants ; le rythme partagé en permet ~6 au total.

---

## 3. La règle corrigée (proposition, NON appliquée)

Fichier : `supabase/migrations/PROPOSITION_20261025_creneau_remplace_les_sautes.sql.txt` (garde md5 des trois corps de prod).
Cadence intouchée : créneaux, nombre par jour choisi, paliers, quotas, intervalle durée/prévues, espacements mesurés, « un job par
compte et par passage », rythme du compte toutes plateformes.

0. **`republish_essai_saute(status, platform_fields, error)`** (nouvelle, IMMUTABLE, exécutable par service_role seul) : un essai de
   portée ARTICLE (`republish_echec_portee`) arrêté sans rien avoir retiré ni redéposé (marques de
   `_shared/accident-avant-retrait.js`, mot pour mot). Une panne du COMPTE n'est jamais un sauté.
1. **`republish_planifiee_candidats` (Vinted)** : absente de DEUX relevés COMPLETS du dressing de sa boutique commencés après sa
   dernière vue → `annonce_introuvable`, avant tout essai. Définition de « complet » = `releveComplet` de
   `_shared/introuvable-a-confirmer.js`. Jamais vue par un relevé ou boutique inconnue : rien ne change. Un relevé qui la revoit
   lève la garde. Aucune fiche n'est écrite.
2. **`republish_planifiee_sweep`** :
   - la place d'un essai sauté est rendue : il ne compte ni en 6bis ni dans le rythme (6) ; au plus `prevues` sautés rendus par
     créneau (au-delà, comptés comme avant + `_remplacements_epuises`) ; un article n'est tenté qu'une fois par créneau ;
   - toute retenue écrit son motif : `_extension_absente` (état daté : depuis, derniere_vue, episodes, leve_le au retour),
     `_espacement` (republication de référence, sa plateforme, intervalle, prochaine heure, `apres_fin`), `_aucun_candidat`,
     `_remplacements_epuises` — chacun écrit à la transition, jamais à chaque passage ;
   - une annonce introuvable ou vendue n'est notée qu'au premier créneau qui l'écarte (30 jours) : elle le dit une fois ;
   - la boucle lit les 50 premiers éligibles et les 50 premiers mis de côté (100 lignes, au plus 50 appels au RPC, comme avant) :
     50 annonces mortes en tête ne cachent plus les éligibles.
3. **`republish_planifiee_etat`** : la capacité « créneau en cours » compte comme le balayage (l'app annonce ce qu'il fera).

Inverse : `supabase/rollbacks/PROPOSITION_20261025_creneau_remplace_les_sautes_INVERSE.sql.txt` (les trois corps de prod mot pour
mot, puis `DROP FUNCTION republish_essai_saute`).
Essai : `scripts/essais/PROPOSITION_20261025_creneau_remplace_les_sautes_essai.sql` (BEGIN ISOLATION LEVEL REPEATABLE READ … ROLLBACK,
lock_timeout 3 s).

Hors proposition (décision de Nico, c'est la cadence) : **le rythme par plateforme** — étape 6, ajouter `AND j.platform = v_pf` à
la recherche de la republication de référence. Seul moyen de faire 6 Vinted + 5 Leboncoin dans le même créneau de 3 h. Sans
cette décision, la seule issue honnête est d'annoncer des prévues qui tiennent dans le rythme partagé (~3 + 3).

---

## 4. L'essai (joué en prod, BEGIN … ROLLBACK, rien laissé)

### Essai n° 1 — joué le 25/10 à 16:11:53 (Paris), 7 s, ROLLBACK (sortie complète : `agents3/essai_sortie_lignes.txt`)

**Candidats, avant (prod) / après (proposition)** — tous les comptes choisis, leurs plateformes planifiées :
```
compte              pf         éligibles avant → après   motifs après                                   ms avant → après
jocabroc8           vinted     159 → 135                 introuvable 28 (4 avant), trop récente 5       32 → 74
jocabroc8           leboncoin   51 → 51                  introuvable 83                                 33 → 34
josephinecerni      vinted     294 → 294                 —                                              41 → 51
josephinecerni      leboncoin  300 → 300                 —                                              20 → 20
josephinecerni      beebs      285 → 285                 introuvable 2                                  20 → 20
louis@ttfamily      leboncoin   48 → 48                  vendue 1                                       14 → 14
louis@ttfamily      beebs       30 → 30                  —                                              10 → 10
meminiandmove       vinted      53 → 53                  trop récente 5                                 14 → 17
xxewwer             vinted      53 → 53                  —                                              82 → 86
xxewwer             leboncoin   65 → 65                  —                                              23 → 22
```
Sur tout le parc (requête à part, même règle) : Jocabroc est le seul compte dont la règle écarte des annonces (24).

**Les 24 annonces de Jocabroc que la règle écarte** (toutes éligibles avant) : dernière vue entre le 28/09 et le 10/10, absentes de
20 à 37 relevés complets de la boutique 137708392, 21 sur 24 portent le signal « plus en ligne ». Rangs 6, 14, 21, 24, 42, 57, 62,
72, 79, 85, 95, 96, 97, 100, 101, 109, 110, 129, 137, 142, 143, 157, 158, 165. Ex. : 10125516124 (rang 6) vue le 09/10 08:29,
absente de 21 relevés ; 10116955748 (rang 14) vue le 02/10, absente de 29.

**Ce soir, les six premiers éligibles Vinted** (ordre du balayage) :
avant : 10297584228, **10125516124 (morte)**, 9332359786, 9578218644, 9273546273, 9007484034
après : 10297584228, 9332359786, 9578218644, 9273546273, 9007484034, 8897627545 (toutes vues le 25/10).
Leboncoin (inchangé) : 3274551288, 3274571460, 3274659337, 3276048661, 3276765637, 3276888825.

**Les créneaux des 23 et 24/10 rejoués avec la nouvelle classification** :
```
créneau 589 (23/10 V) : f626887e réelle ; fde3d484, d4281e1d, 961f0a27 → sauté = true, absente_avant_essai = true
créneau 615 (24/10 V) : 2e290028 réelle ; 04659f4b → sauté = true, absente_avant_essai = true
créneau 592 (23/10 LBC) : 851599a2 réelle ; créneau 616 (24/10 LBC) : aucun job
```
« absente_avant_essai » = au moins deux relevés complets de sa boutique sans elle, commencés après sa dernière vue et AVANT la
naissance du job : la nouvelle règle les aurait écartées avant tout essai (et, sinon, leur place aurait été rendue).

**Le balayage d'aujourd'hui, joué deux fois dans la transaction** (ancienne règle annulée en sous-transaction, puis nouvelle) :
14 comptes, 0 job créé, aucune exception, 99 ms / 87 ms. Notes que seule la nouvelle règle écrit :
```
josephinecerni   vinted 634 / leboncoin 635   _extension_absente (dernière vue 24/10 15:06) — créneaux 0/20 et 0/15 jusque-là SANS motif
tiblancdeshaut   vinted 636                   _extension_absente (dernière vue 25/10 07:32)
louis-seller     vinted 622                   _espacement : dernière 15:39 (vinted), intervalle 3000 s, prochaine 16:29, apres_fin false
louis@ttfamily   leboncoin 630                _bloque_en_vol (les deux règles, inchangé)
```

SORTIE_ESSAI_2


---

## 5. Ce soir (25/10, 19:00-22:00 ; créneau 18:00-21:00 UTC)

État lu à 16:15 : extension 0.6.141 vivante (poll 15:53), boutique connectée 137708392 (sonde 15:59), aucune pause anti-robot,
aucun job en cours, 0 republication auto aujourd'hui ; session Leboncoin `true` / « compte_vu_sur_la_page » (14:31 UTC).
Prévues attendues à 19:00 : Vinted 6 (6 par jour, capacité 11), Leboncoin 5 (capacité floor(5397/900) = 5) ; intervalles
30 et 36 min ; durées estimées 246 s (Vinted) et 636 s (Leboncoin).

Pour faire **6 Vinted et 5 Leboncoin** il faut, ensemble :
1. **Chrome ouvert et l'ordinateur éveillé de 19:00 à 22:00** (preuves : 23/10 éteint dès 21:03, 24/10 éteint jusqu'à 21:12).
2. **La proposition appliquée** (feu vert de Nico) — sinon le 2e Vinted vise 10125516124, morte (absente de 21 relevés).
3. **Le rythme par plateforme** (décision de Nico, cadence) — sinon Leboncoin = 0, mathématiquement (1.4/2 « Et le 6 + 5 ? »).
4. **Aucune republication manuelle pendant le créneau** : elle bloque sa plateforme tant qu'elle tourne (23/10 : Leboncoin bloqué
   de 19:03 à ~19:15 par le lot de 18:15, Vinted de 20:27 à 20:45).
5. Le nombre par jour qu'elle a choisi (6) compte tous les jobs nés : un essai sauté y entre encore (intouché) — avec 6 = prévues,
   un sauté = 5 réussies au mieux.

Ce qui l'empêcherait encore : la sonde Leboncoin du service worker en 403 n'empêche rien (jamais retenu sur `null`), mais un vrai
mur dans l'onglet (connexion, DataDome) mettrait les jobs en attente de session : au 2e échec du compte, `_disjoncteur` arrête
Leboncoin pour la journée (motif écrit). Les rangs « vues » bougent d'ici ce soir (les six premiers listés en 4 sont ceux de 16:30).

---

## 6. Ce qui se corrige mieux ailleurs (aucun fichier modifié)

- **App** `src/components/RepublicationPlanifiee.jsx`, `texteMotifCompte` (l. 235-263) : ajouter les textes de `extension_absente`
  (« Chrome était fermé de … à … »), `espacement` (« La suivante ne pouvait partir qu'à … » / après la fin du créneau),
  `aucun_candidat_eligible`, `remplacements_epuises` ; sans eux l'app affiche « Arrêt du passage (motif) ». Phrase du créneau
  manqué (l. 1555-1557) : lire `_extension_absente` plutôt que `extension_vue` (vrai dès que Chrome revient, même à 21:12).
- **Edge `republish-auto-sweep`** (l. 66-84) : ne journalise que la voie historique ; le détail de la branche planifiée
  (`r.planifiee.detail`, refus, exceptions) n'apparaît jamais dans les journaux — une exception du balayage planifié serait muette.
- **Balayage, étape 3** : un job né 9 min après le dernier poll (961f0a27) dort jusqu'au créneau suivant ; la fenêtre de 10 min est
  une règle du module (inchangée ici) — à 5 min (deux polls manqués) il ne serait pas né.
- **Relevé Vinted / fiche** : la fiche d'une annonce absente de 29 relevés complets reste `vinted_status = 'active'` ; la
  proposition s'en passe (preuve lue à la volée), mais l'écran Stock, lui, la montre encore « en ligne ».

## 7. Fichiers
- `supabase/migrations/PROPOSITION_20261025_creneau_remplace_les_sautes.sql.txt`
- `supabase/rollbacks/PROPOSITION_20261025_creneau_remplace_les_sautes_INVERSE.sql.txt`
- `scripts/essais/PROPOSITION_20261025_creneau_remplace_les_sautes_essai.sql`
- scratchpad `agents3/` : `prod2/*.sql` (corps de prod, md5), `gen_creneau.cjs`, `gen_essai.cjs`, `essai_sortie_lignes*.txt`
