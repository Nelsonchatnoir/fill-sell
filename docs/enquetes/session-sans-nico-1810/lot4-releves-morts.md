# Lot 4 — Relevés morts sans alerte (enquête LECTURE SEULE, 17/10/2026 ≈ 18:40 Paris)

Rien n'a été édité, rien n'a été écrit en base, aucun déploiement, aucun mail. SELECT seulement sur `tojihnuawsoohlolangc`.

## 0. Repères

- **Table des relevés** : `public.vinted_sync_runs` (toutes plateformes, malgré le nom). Colonnes utiles : `platform`
  (vinted|leboncoin|beebs|ebay|opla|depop), `kind` (dressing|annonces), `status` (queued|running|done|incomplete|failed|
  absente|expired|cancelled), `declencheur`, `page_suivante`, `items_vus`, `total_entries`, `erreur`, `extension_build`,
  `started_at`, `updated_at`, `finished_at`, `queued_at`, `claimed_at`, `progres_le`, `vinted_login`, `vinted_user_id`.
- **Versions lues** (`npx supabase functions list`, 17/10 18:35) : `ops-digest` **v35** (`verify_jwt:false`),
  `handler-watch` **v115** (`false`).
- **Drapeaux en vigueur (règle du 05/10, « un relevé ne part que sur un geste »)** :
  - `chrome-extension/background.js:12847` → `const REPRISE_AUTOMATIQUE_RELEVE = false;` : plus aucune reprise
    automatique côté extension (reprise des échecs techniques 13238-13257, rattrapage 13322-13369, veilleur de run
    figé 13547-13708 : tous court-circuités par ce drapeau à leur première ligne).
  - `supabase/functions/handler-watch/index.ts:109` → `const RELANCE_AUTOMATIQUE_RELEVE = false;` : plus de remise en
    file serveur après reconnexion (annonces 3353-3545, dressing Vinted 3564-3667).
  - Migration `20261005200000_releves_sur_geste.sql:62-67` : trigger `garde_releve_sans_geste` (seuls
    `releve_est_geste` = `bouton|bouton_distant|app(:redemande)` et `releve_est_veille` = `cron|veilleur|serveur:*`
    entrent) ; **`profiles_premiers_releves_trg` SUPPRIMÉ** → plus de « planificateur de premiers relevés ».
- **Ce qui clôt un relevé** :
  - côté extension : PATCH final du run (`clore`) ; le run naît `running` directement (`background.js:18206-18215`
    dressing, `16699-16704` annonces) ou est réclamé depuis `queued` (`18017-18041`, `16682-16688`).
  - côté serveur, **chien de garde** `handler-watch/index.ts:887-1176` : `running` sans progression
    (`progres_le`, sinon `updated_at`) depuis **5 min** (`SYNC_RUN_SANS_PROGRES_MIN`, l.924) → `expired` `[watchdog]`
    (l.1084-1097) ; relevé « annonces » dont la liste est déjà écrite → `done` `[incomplet]` (l.1051-1067) ;
    `queued` jamais réclamé en **6 h** → `expired` « demande jamais réclamée » (l.1139-1156). Un relevé **demandé par
    geste** et arrêté avant sa liste est remis en file UNE fois (`:redemande`, l.1115-1124) — jamais pour Vinted, ni
    pour un `cron`.
  - alarmes extension : dressing Vinted toutes les **24 h** (`background.js:974-977`, tir `1002-1004`), relevés
    « annonces » toutes les 24 h décalées de 25 min (`980-983`, `releverQuotidien` 16907-16952 : uniquement les
    plateformes avec un dépôt publié ou une annonce en attente de rattachement, jamais une plateforme écartée
    (`platform_settings.plateformes_ecartees`, l.16916-16923), jamais Opla depuis la sortie (`16925`)).
  - cadence cron dressing : 20 h sur le dernier `done` (`18140-18168`) ; cron refusé s'il n'y a **jamais eu** de
    `done` (`18157-18160`).
  - **Boutique à confirmer** : le premier refus écrit un run `failed` `[boutique_a_confirmer]` (`18662`) ; ensuite,
    tant que le dressing ouvert dans Chrome est celui du refus et que la décision n'est pas prise, **aucun run n'est
    créé pendant 12 h** (`boutiqueEncoreAConfirmer` `17975-17998`, garde `18199-18204`) — le refus n'existe alors
    qu'en `usage_logs` (`sync_click`, `resultat: refusée`, `raison: boutique_a_confirmer`). Passé 12 h, le **cron
    recrée un run `failed` identique chaque jour** (cas lirikk12k ci-dessous : 12 fois).

## 1. Cause par compte

### 1.1 « Lohan » = `lohanobert59@gmail.com` (0f8722f5, palier **premium**)

(L'autre « lohan », `lalautelohan1@gmail.com` 2c9affd2, créé le 01/10, n'a jamais eu d'extension ni de run.)

État au 17/10 : `extension_last_seen_at` **17/10 17:07**, `extension_build` `2026-10-15T19:36:02Z+18cc681`
(`extension_version` 0.6.114 dans la sonde), 0 job pending/processing, 57 jobs Vinted `published` (vérifiés
17/10 17:08), 14 eBay `published`, 1 `needs_user` Vinted (16/10). **Le relevé Vinted N'EST PLUS mort** : run
`62b2f7ee` **done 17/10 14:34** (@woodenbridge, 31 articles créés, « disparitions non marquées — changement de
compte Vinted (@lo160 → @woodenbridge) »).

Chronologie de la mort (02/10 22:36 → 17/10 14:34, **14 jours et demi**), toutes heures Paris :

| Quand | Preuve (SQL) | Ce qui s'est passé |
|---|---|---|
| 02/10 19:34 | run `be93927e` done @lo160, 160 art., `bouton` | Dernier relevé Vinted réussi sur @lo160. |
| 03/10 08:12 | note sur `be93927e` : « cadence cron : 1 sync 'cron' refusée… » | Cron refusé par la fenêtre de 20 h (`background.js:18162-18168`). Normal. |
| 02/10 22:36 | run `7b4e0def` **failed** `[boutique_a_confirmer] Ce navigateur est connecté au dressing @woodenbridge — ce compte FillSell suit @lo160` | Chrome connecté à une **autre boutique**. Écrit par `background.js:18662`. |
| 03/10 10:09, 10:14 ×2, 18:53 ; 04/10 14:58, 16:44 | `usage_logs` `sync_click` `resultat:refusée raison:boutique_a_confirmer` ×6 | 6 appuis « Synchroniser » refusés **sans créer de run** (`17976-17998` + `18199-18204`). Les relevés eBay/Beebs/LBC de ces clics partent, eux (eBay done ; Beebs/LBC `absente` : page de connexion). |
| 05/10 → 15/10 | `usage_logs` : 1 ligne le 05/10 (`ventes_annoncees`), **rien** du 06 au 15/10 ; aucun run d'aucune plateforme (les relevés eBay `veilleur` quotidiens s'arrêtent après le 04/10 16:47) | **Extension éteinte 11 jours** (Chrome fermé / PC éteint). Le cron du dressing ne peut pas tirer. |
| 16/10 18:55 | `sync_click refusée boutique_a_confirmer` puis `confirmation_boutique etape:affichee` (boutique 258669486 @woodenbridge) | Le refus mène au geste (règle du 06/10, `ConfirmationBoutique.jsx`). |
| 16/10 18:56:01 | `confirmation_boutique etape:acceptee nb_boutiques:2` → `sync_click lancée` | Boutique ajoutée, synchro relancée sans second appui. |
| 16/10 18:56:24 | run `69e738de` **failed** `[pas_connecte] [cause403] session_absente` (build 2026-10-06) | Mais **aucune session Vinted dans Chrome** (sonde 403). |
| 16/10 19:12 | run `56f42608` failed, même cause (`bouton_distant`, build 2026-10-15) | Idem après mise à jour de l'extension. |
| 17/10 14:34 | run `62b2f7ee` **done** @woodenbridge | Session revenue, relevé réussi. |

**Verdict** : ni run `running` bloqué, ni mur anti-robot, ni chien de garde en cause. Le relevé est mort parce que
**deux gestes humains étaient attendus** (confirmer la boutique @woodenbridge : 02/10 → 16/10 ; se reconnecter à
Vinted dans Chrome : 16/10 → 17/10), avec 11 jours d'extension éteinte au milieu. **Sans alerte** parce que :
(a) les 6 refus de clic ne créent aucune ligne de run (seulement `usage_logs`) ; (b) aucune section de l'ops-digest ne
regarde « dernier relevé réussi par compte et plateforme » (cf. § 5) ; (c) le cron, seule chose qui aurait pu
réessayer, dépend de Chrome ouvert.

Point d'attention (hors sujet mais visible) : la sonde `extension_sessions.vinted_identite` du 17/10 15:05 dit
**@lo160** alors que le run de 14:34 a lu **@woodenbridge** ; les deux boutiques sont confirmées
(`nb_boutiques: 2`). Chaque alternance de compte Vinted dans Chrome produira un relevé « disparitions non marquées —
changement de compte » (c'est la garde voulue), donc **aucune vente Vinted ne sera vue par relevé** tant que les
deux dressings alternent. Beebs/Leboncoin chez Lohan : `absente` (page de connexion) depuis le 27/09, 0 annonce,
0 job → rien à surveiller, pas un relevé mort.

### 1.2 « Rui »

`profiles.email ILIKE '%rui%'` rend **5 lignes dont 1 faux positif** (`jujudefruit@hotmail.be`, « f-rui-t ») :

| uid | email | créé | extension | runs |
|---|---|---|---|---|
| f3278613 | yanick.ruiz@gmail.com | 14/08 | jamais vue | 0 |
| 2b99bd5e | ruioliveira986@gmail.com | 28/06 | jamais vue | 0 |
| 0f0444b5 | alexmatamorosruiz@gmail.com | 22/08 | jamais vue | 0 |
| **d0a92e78** | **ruiduxv2@hotmail.fr** (free) | 19/08 | 0.6.28, build `2026-09-11T11:51:25Z+fa9f9c2`, **vue le 11/09 20:34** | 2 |

Seul `ruiduxv2@hotmail.fr` a vécu. Ses deux runs :

- 20/08 15:03 run `25532633` **done** (87 articles, `bouton`) — note « cadence cron : 1 refusée… 20/08 13:18 ».
- 11/09 19:41 run `fa039e30` **failed** `cron` : `[cause403] session_absente — aucune session Vinted dans ce
  navigateur (HTTP 403 sur la sonde)`. La sonde le confirme : `extension_sessions.http.vinted = 403`, `vinted:null`,
  `checked_at 2026-09-11T18:28:56Z`.
- Depuis : **plus aucune trace** (dernier `usage_logs` 20/08 15:41 ; dernière vérification de job 11/09 20:05 ;
  85 jobs Vinted `published`, 3 Beebs, 3 Leboncoin — jamais revus). 0 job pending/processing.

**Verdict** : relevé mort depuis le **11/09** par **extension jamais revue** (36 jours : Chrome fermé ou extension
retirée) après une **session Vinted déjà fermée** au dernier passage. Rien de bloqué en base (aucun run
`running`/`queued`). Rien ne repartira seul : la reprise serveur exige `extension_last_seen_at` + sonde
`vinted=true` fraîche (`handler-watch/index.ts:3634-3643`) et de toute façon `RELANCE_AUTOMATIQUE_RELEVE = false`.
Ce compte n'entre pas dans la définition « extension vue < 24 h » : c'est un **compte dormant**, pas un relevé mort
sans alerte.

## 2. Nettoyage proposé — SQL prêt, **NE PAS EXÉCUTER** (feu vert de Nico)

Constat (17/10 18:40) : **0 run `running`**, **0 `queued` > 6 h** sur tout le parc ; le chien de garde fait son
travail (7 derniers jours : 9 `expired [watchdog]`, 6 `done [incomplet]`, 29 files expirées « jamais réclamée »).
Seul run en attente : `queued` Vinted de b245e854 (`serveur:retrait_introuvable`, 17/10 17:15, extension vue le
15/10) → le TTL de 6 h (`handler-watch:1139-1156`) l'expirera vers 23:15. **Il n'y a donc rien à clore à la main.**

- **Lohan (0f8722f5)** : rien à clore (relevé repris le 17/10 14:34, aucune ligne ouverte). Aucune relance : le
  prochain cron lira le dressing ouvert.
- **Rui (d0a92e78)** : rien à clore (aucune ligne ouverte). Une relance serait **inutile** sans extension (elle
  expirerait en 6 h). Si Nico veut quand même poser une demande qui partira à son retour :

  ```sql
  -- NE PAS EXÉCUTER sans feu vert. Même forme que les reprises serveur (handler-watch:3647-3653) ;
  -- 'bouton_distant' = geste (releve_est_geste), accepté par garde_releve_sans_geste ; index un_seul_actif = juge.
  INSERT INTO public.vinted_sync_runs (user_id, kind, status, declencheur, queued_at)
  VALUES ('d0a92e78-e983-449b-8f54-70b188fbb2af', 'dressing', 'queued', 'bouton_distant', now());
  -- Inverse : DELETE FROM public.vinted_sync_runs WHERE id = '<id rendu>' AND status = 'queued';
  ```

- **Clôture propre générique** (miroir exact du chien de garde, pour un jour où une ligne resterait `running`
  malgré lui — **0 ligne aujourd'hui**) :

  ```sql
  -- NE PAS EXÉCUTER. D'abord compter :
  SELECT id, user_id, platform, kind, page_suivante, items_vus,
         coalesce(progres_le, updated_at) AT TIME ZONE 'Europe/Paris' AS dernier_signe
  FROM public.vinted_sync_runs
  WHERE status = 'running' AND coalesce(progres_le, updated_at) < now() - interval '24 hours';
  -- Puis, ligne par ligne, compare-and-swap comme handler-watch:1084-1097 (jamais sans l'updated_at lu) :
  UPDATE public.vinted_sync_runs
     SET status = 'expired', finished_at = now(), updated_at = now(),
         erreur = '[watchdog] La synchronisation s''est arrêtée avant la fin. Rien n''a été effacé : appuie sur « Synchroniser » pour la terminer. (clôture manuelle du <date>, arrêt sans progression > 24 h)'
   WHERE id = '<id>' AND status = 'running' AND updated_at = '<updated_at lu>';
  ```

## 3. Mesure sur le parc

Périmètre : **64 comptes** dont l'extension a été vue dans les 24 h (`profiles.extension_last_seen_at`).

### 3.1 Relevés figés

| Mesure | Valeur |
|---|---|
| `running` sans progression > 24 h | **0** |
| `running` (total) | **0** |
| `queued` > 6 h (jamais réclamé) | **0** (1 queued de 17:15, dans le TTL) |
| expirés par le chien de garde, 7 j | 9 (`[watchdog]`) + 6 clos `done [incomplet]` |
| files expirées « jamais réclamée », 7 j | 29 |
| 30 j, `expired` par plateforme (dont watchdog) | vinted 109 (31) · leboncoin 86 (25) · ebay 71 (15) · beebs 65 (19) · opla 58 (6) · depop 2 (0) |

Conclusion : le cas « bloqué `running` sans fin » n'existe plus en prod (chien de garde à 5 min, v115). Le mort
d'aujourd'hui est **le relevé qui échoue proprement chaque jour, ou qui n'est jamais relancé**, chez un compte
dont l'extension tourne.

### 3.2 Comptes actifs (< 24 h) sans relevé **réussi** depuis > 7 jours, par plateforme

Brut (dernier `done` > 7 j, toutes causes) : **28 couples** compte/plateforme — beebs 4, ebay 3, leboncoin 6,
**opla 12**, vinted 3. Après exclusions légitimes :

- Opla : **12** → sortie d'Opla le 11/10 (`oplaSortieActive`, `background.js:16925`, `17707`) : attendu ;
- plateforme **écartée** par la personne (`platform_settings.plateformes_ecartees`) : 3 (e25ff459 : leboncoin,
  ebay, beebs) ;
- `cancelled` « je ne vends pas sur opla » : 1 (déjà dans Opla) ;
- **rien à surveiller** (0 dépôt publié, 0 annonce relevée en ligne — `releverQuotidien` ne passerait pas, l.16926-16943) :
  7 (Lohan beebs+lbc, seghirdeborah711 beebs+lbc, remialbertholl ebay, nadegemarcelin78 ebay, lirikk12k lbc).

Reste **6 couples, 5 comptes, réellement morts sans alerte** :

| uid | email | plateforme | dernier réussi | dernier run | statut | runs depuis (30 j) | à surveiller | ext. vue | cause probable |
|---|---|---|---|---|---|---|---|---|---|
| 013b6044 | isereshop38@gmail.com | vinted | **22/08 21:04** (56 j) | 17/10 14:38 | failed/cron | 1 failed `[cause403] session_absente` | 13 jobs | 17/10 14:41 | **session Vinted fermée** dans Chrome ; le cron échoue, l'app dit « connecte-toi », personne au support ne le sait |
| 4cd4d9ae | lesmillesetunepepite@gmail.com | vinted | 22/09 22:12 (25 j) | 15/10 15:52 | failed/cron | 3 failed (2 session, 1 « Onglet de travail fermé pendant le chargement ») | 234 jobs | 17/10 11:21 | **panne technique jamais reprise** (`REPRISE_AUTOMATIQUE_RELEVE=false`) + session |
| 4cd4d9ae | lesmillesetunepepite@gmail.com | leboncoin | 23/09 09:41 (24 j) | 17/10 10:43 | expired/cron | 6 : 3 absente, 2 expired `[watchdog]` (10 min sans progression), 1 failed | 217 annonces / 213 jobs | 17/10 11:21 | **relevé LBC qui meurt en lecture** (watchdog) et mur de connexion par moments — 430 choses à surveiller |
| 623d41ff | lirikk12k@gmail.com | vinted | 25/09 18:20 (22 j) | 15/10 16:50 | failed/cron | **13 failed cron dont 12 `[boutique_a_confirmer]`** (@mpoe11raw ≠ @l1r1k68) | 129 jobs | 16/10 18:38 | **boutique à confirmer** : la mémoire de 12 h expire, le cron recrée la même question chaque jour |
| 63ad8597 | meminiandmove@gmail.com | leboncoin | 25/09 22:37 (22 j) | 16/10 17:41 | absente/cron | **73 absente** « page de connexion » (26 cron + **30 gestes**) | 37 annonces | 17/10 17:59 | **mur de connexion persistant** : la personne appuie 30 fois et retombe sur la page de connexion — à regarder (DataDome/session LBC ?) |
| d8b07167 | hu.anastasia@gmail.com | beebs | 07/10 08:37 (10 j) | 12/10 18:31 | absente/cron | 6 absente « page de connexion » | 13 annonces / 13 jobs | 17/10 13:57 | **session Beebs fermée** |

Par cause : session fermée **3**, panne technique jamais reprise **2**, boutique à confirmer **1**. Par plateforme :
vinted 3, leboncoin 2, beebs 1. Aucun n'est un mur anti-robot nommé (`[mur:anti_robot]` absent de ces runs).

Hors périmètre (jamais vivants, à mesurer à part) : couples actifs **sans aucun `done` jamais** — beebs 11,
ebay 8, leboncoin 5, depop 3, opla 1.

## 4. Alerte interne — requête exacte et emplacement dans `ops-digest`

### 4.1 La requête (validée en prod le 17/10 : rend exactement les 6 lignes du § 3.2)

```sql
-- Relevés morts sans alerte : compte actif (extension < 24 h), plateforme déjà relevée avec succès,
-- aucun relevé réussi depuis 7 jours, quelque chose à surveiller, pas écartée, pas Opla (sortie 11/10).
WITH actifs AS (
  SELECT p.id, p.email, p.extension_last_seen_at,
         COALESCE(CASE WHEN jsonb_typeof(p.platform_settings->'plateformes_ecartees') = 'array'
                       THEN p.platform_settings->'plateformes_ecartees' END, '[]'::jsonb) AS ecartees
  FROM public.profiles p
  WHERE p.extension_last_seen_at > now() - interval '24 hours'
), dernier_done AS (
  SELECT r.user_id, r.platform, max(r.finished_at) AS done_le
  FROM public.vinted_sync_runs r JOIN actifs a ON a.id = r.user_id
  WHERE r.status = 'done' AND r.platform <> 'opla'
  GROUP BY 1, 2
), dernier_run AS (
  SELECT DISTINCT ON (r.user_id, r.platform)
         r.user_id, r.platform, r.status, r.declencheur, r.started_at, r.erreur
  FROM public.vinted_sync_runs r JOIN actifs a ON a.id = r.user_id
  ORDER BY r.user_id, r.platform, r.started_at DESC
), a_surveiller AS (
  SELECT user_id, platform, sum(n) AS n FROM (
    SELECT user_id, platform, count(*) AS n FROM public.cross_post_jobs
     WHERE status = 'published' AND user_id IN (SELECT id FROM actifs) GROUP BY 1, 2
    UNION ALL
    SELECT user_id, platform, count(*) FROM public.annonces_plateforme
     WHERE disparu_le IS NULL AND ignoree_le IS NULL AND user_id IN (SELECT id FROM actifs) GROUP BY 1, 2
  ) x GROUP BY 1, 2
)
SELECT left(d.user_id::text, 8)                                              AS uid,
       a.email,
       d.platform,
       to_char(d.done_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI')   AS dernier_releve_reussi,
       to_char(dr.started_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI') AS dernier_run,
       dr.status || '/' || coalesce(dr.declencheur, '?')                       AS dernier_statut,
       CASE
         WHEN dr.erreur ILIKE '%[boutique_a_confirmer]%' THEN 'boutique à confirmer'
         WHEN dr.erreur ILIKE '%session_absente%' OR dr.erreur ILIKE '%page de connexion%'
           OR dr.erreur ILIKE '%non accordé%'                               THEN 'session fermée'
         WHEN dr.erreur ILIKE '%anti-robot%' OR dr.erreur ILIKE '%anti_robot%'
           OR dr.erreur ILIKE '%datadome%'                                  THEN 'mur anti-robot'
         WHEN dr.erreur ILIKE '%[watchdog]%' OR dr.erreur ILIKE '%Onglet de travail%'
           OR dr.erreur ILIKE '%pas fini de charger%' OR dr.erreur ILIKE '%jamais réclamée%'
                                                                            THEN 'panne technique jamais reprise'
         WHEN dr.status = 'done'                                             THEN 'jamais reprogrammé'
         ELSE 'autre : ' || left(coalesce(dr.erreur, ''), 80)
       END                                                                    AS cause_probable,
       coalesce(s.n, 0)                                                       AS a_surveiller,
       to_char(a.extension_last_seen_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI') AS extension_vue
FROM dernier_done d
JOIN actifs a        ON a.id = d.user_id
JOIN dernier_run dr  ON dr.user_id = d.user_id AND dr.platform = d.platform
LEFT JOIN a_surveiller s ON s.user_id = d.user_id AND s.platform = d.platform
WHERE d.done_le < now() - interval '7 days'
  AND NOT (a.ecartees ? d.platform)
  AND dr.status <> 'cancelled'
  AND (d.platform = 'vinted' OR coalesce(s.n, 0) > 0)
ORDER BY d.platform, d.done_le
LIMIT 200;
```

Seconde requête, filet sur le chien de garde (doit rendre 0/0 ; sinon handler-watch ne tourne plus) :

```sql
SELECT count(*) FILTER (WHERE status = 'running' AND coalesce(progres_le, updated_at) < now() - interval '1 hour') AS running_figes,
       count(*) FILTER (WHERE status = 'queued'  AND queued_at < now() - interval '7 hours')                      AS queued_oublies
FROM public.vinted_sync_runs WHERE status IN ('running', 'queued');
```

### 4.2 Forme recommandée

`ops-digest` n'exécute pas de SQL brut (supabase-js seulement) : le plus propre est une **RPC `SECURITY DEFINER
STABLE` `public.releves_morts_veille()`** (même modèle que `ventes_prouvees_veille()` appelée l.850 et que
`comptes_actifs(p_jours)`) qui renvoie les lignes de la requête 4.1 + les deux compteurs de 4.1 bis. Migration =
**feu vert explicite de Nico** (`npx supabase db query --linked -f` puis `migration repair`). Variante sans
migration : trois lectures supabase-js (profils actifs 24 h → runs des comptes → jobs/annonces) et le même tri en
JS ; plus lourde, mais déployable seule.

### 4.3 Où insérer dans `supabase/functions/ops-digest/index.ts` (v35 lue ; redéployer avec `--no-verify-jwt`)

1. **Lecture** : à la ligne **810** (entre `const pausesAnciennes = …` l.809 et le commentaire « BOUCLES SERVEUR
   ARRÊTÉES » l.811), bloc sur le modèle des l.802-808 :
   ```ts
   // ── RELEVÉS MORTS SANS ALERTE (17/10, lot 4 : isereshop38 56 j, lirikk12k 22 j, …) ──
   // Compte dont l'extension tourne (< 24 h), plateforme déjà relevée avec succès, et plus
   // aucun relevé réussi depuis 7 jours alors qu'il y a des annonces à surveiller. Lecture seule.
   let relevesMorts: Array<{ uid: string; email: string; platform: string; dernier_releve_reussi: string;
     dernier_run: string; dernier_statut: string; cause_probable: string; a_surveiller: number; extension_vue: string }> = [];
   let relevesFiges = { running_figes: 0, queued_oublies: 0 };
   try {
     const { data, error } = await supabase.rpc("releves_morts_veille");
     if (!error && data) { relevesMorts = data.lignes ?? []; relevesFiges = data.figes ?? relevesFiges; }
   } catch (e) { console.warn("[ops-digest] releves_morts_veille illisible :", String((e as Error)?.message ?? e)); }
   ```
2. **Compteur** : objet `counts` l.863-890, ajouter après `pauses_releves` (l.866) :
   `releves_morts: relevesMorts.length + (relevesFiges.running_figes + relevesFiges.queued_oublies > 0 ? 1 : 0),`
   (le `total` l.891 déclenche alors l'envoi).
3. **Section HTML** : à la ligne **945**, juste après la fermeture du bloc « Relevés en pause » (l.933-944) et
   avant le bloc `arretsRapprochement` (l.946), même gabarit que l.934-943 ; une ligne par couple :
   `${esc(x.email)} — ${esc(x.platform)} — dernier relevé réussi ${esc(x.dernier_releve_reussi)} — dernier run
   ${esc(x.dernier_statut)} le ${esc(x.dernier_run)} — ${esc(x.cause_probable)} — ${esc(x.a_surveiller)} à surveiller
   — extension vue ${esc(x.extension_vue)}` (rouge `#B91C1C` au-delà de 21 jours, ambre `#92400E` sinon) ; une
   ligne rouge supplémentaire si `relevesFiges` n'est pas 0/0 (« chien de garde muet »).
4. **Objet du mail** l.1208 : ajouter `· relevés morts ${counts.releves_morts}` dans la parenthèse.
5. Sortie JSON `counts` (l.894, l.1221) : rien à faire, l'objet est sérialisé tel quel.

## 5. Ce que l'Ops Digest couvre DÉJÀ sur ce sujet (et le trou)

| Section (index.ts) | Ce qu'elle voit | Ce qu'elle ne voit pas |
|---|---|---|
| 10 « Sync dressing — gardes » l.390-489, HTML l.1082-1111 | runs `done`/`incomplete` des 7 j avec note « disparitions non marquées » / « relevé incomplet » (journal `sync_gardes_declenchees`) | un compte **sans run réussi** : il n'y a pas de run à lire |
| « Relevés en pause » l.796-809, HTML l.933-944 | `pause_releves` actives (0 aujourd'hui) | — |
| « Relevés du veilleur retenus » l.834-839, HTML l.960-973 | `releves_auto_refuses` (24 h) | — |
| 12 « pending 48 h » l.538-579 | jobs `pending` par compte + extension vue | ce sont des **jobs**, pas des relevés |
| 11 « dressings croisés » l.499-536 | même `vinted_user_id` sur 2 comptes | — |

**Le trou** : rien ne regarde (a) l'absence de relevé réussi par (compte, plateforme) chez un compte actif ;
(b) les runs figés — le chien de garde les expire **en silence** (`console.log` seulement,
`handler-watch:1070`, `1100-1103`) ; (c) les refus d'appui sans run (`usage_logs sync_click resultat=refusée`) ;
(d) les boucles « même mur chaque jour » (meminiandmove : 73 `absente` ; lirikk12k : 12 `[boutique_a_confirmer]`).
La requête 4.1 ferme (a) et (d) ; 4.1 bis ferme (b). (c) peut s'ajouter plus tard : `usage_logs` `feature='sync_click'`,
`metadata->>'resultat'='refusée'`, ≥ 5 en 7 j par compte.

## 6. Règles à corriger (constats, pas de décision prise ici)

1. **Cron Vinted + boutique à confirmer** : passé 12 h, le cron recrée un run `failed` identique chaque jour
   (`background.js:17987` borne la mémoire ; `18199` ne protège que 12 h) — 12 lignes chez lirikk12k pour une
   question déjà à l'écran. Soit étendre la mémoire au « tant que la décision n'est pas prise », soit n'écrire le
   refus qu'une fois.
2. **Panne technique sur un `cron`** (lesmillesetunepepite : « Onglet de travail fermé pendant le chargement »,
   `[watchdog]` LBC) : depuis le 05/10, plus aucune reprise ; le cron réessaie 24 h plus tard et retombe. Le
   digest (4.1) est le filet minimal ; la cause de l'onglet fermé reste à comprendre sur ce poste.
3. **Mur de connexion persistant** malgré des gestes répétés (meminiandmove LBC ×30 appuis) : à regarder comme un
   cas plateforme (DataDome / session), pas comme un compte.
