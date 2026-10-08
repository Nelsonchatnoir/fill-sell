# Reprise — terminal « boucles » (08/10 matin)

Suite de la nuit multi-synchro (`docs/reprise/terminal-multi-synchro-0810.md`).
Quatre demandes de Nico : version servie de l'extension, boucles (Nadège,
veilleurs, parc), imports et quota, nettoyage.

## 1. Extension : la 0.6.102 est servie (le rapport de la nuit avait tort)

- `profiles.extension_build` le 08/10 matin : **51 postes** en
  `2026-10-06T18:38:36Z+b230ebe` (0.6.102), dont 50 vus en 24 h ; jobs de 23
  comptes signés `b230ebe · v0.6.102`. La 0.6.101 (3e77bae) n'a jamais été
  servie (poste de Nico seulement).
- Fait : `"0.6.102"` dans `ALREADY_PUBLISHED` ; zip rangé dans
  `build/anciens-zips/CWS-0.6.102-PUBLIEE-06-10/` (sha256 4f61b450…) ;
  CLAUDE.md, AGENTS.md, état, reprise de la nuit et `build-id.mjs` corrigés.
  0.6.103 (en examen) inchangée, non reconstruite.

## 2. Boucles

### a) Nadège : 8 954 fois la même décision — chemin prouvé

- Lignes `rapprochements` : `attache / job / inventaire NULL`, job 839e4bf2,
  annonce Opla 7f1bb50d, du 07/10 21:26:18 au 22:32:17 UTC (≈ 190/min, rafales
  de 3 min 20 séparées d'une minute). Plus la première du 23/09.
- Chemin : fonction edge `rapprochement` **v2** (`while (true)` tant que l'état
  est « decision ») → `rapprochement_avancer` → `rapprocher_traiter_annonce`.
  L'identifiant de l'annonce désignait un job Opla publié **sans article**
  (rattaché par titre au rattrapage du 23/09). La bande « job » posait
  `inventaire_id = NULL`, écrivait la ligne, rendait « job » : l'annonce restait
  sans article, `restantes = 1`, la boucle continuait 110 s, se relançait une
  fois (3 min 20), puis `rapprochement-1min` la reprenait la minute suivante.
  Départ : la demande de rapprochement de 21:26 UTC (fin de relevé, heure de la
  vente). Fin : le moteur v3 de la nuit, qui n'appelle plus `rapprochement_avancer`.
- Reproduit en base (transaction annulée) : deux tours = deux lignes, annonce
  toujours sans article.

### Ce qui ferme les boucles (tous chemins, pas seulement celui-ci)

| Verrou | État |
|---|---|
| `rapprochement` **v12** : une passe qui entre dans la décision sans rien écrire est comptée (`rapprochement_comptes.passages`, en négatif : -n ; les valeurs ≥ 0 viennent du moteur v2 mort et valent 0), compteur écrit AVANT la lecture (une invocation tuée par les 2 s de CPU reste comptée) ; à 3 → « termine » + `bilan.arret` ; un geste « Synchroniser » (< 30 min) rouvre jusqu'à 6, puis plus rien avant notre correctif (remettre `passages` à 0) | **EN LIGNE** (v12, `false`), prouvé : passe réelle sur nicolas.svobodny → termine, compteur 0 (l'ancien 9 lu comme 0) ; compteur forcé à -3 → arrêt en 207 ms sans passe, puis remis à 0 |
| Migration `20261008100000_rapprochement_jamais_la_meme_decision` : bande « job » exige un article ; `rapprochement_avancer` rend « obsolete » ; **trigger `rapprochements_jamais_repete`** : la base saute toute décision identique à la précédente de l'annonce (24 h) et la compte dans `rapprochements_repetes` | **PRÊTE, NON APPLIQUÉE** (feu vert de Nico) ; prouvée en transaction annulée : avant = « job » + une ligne par tour ; après = « differe », 0 ligne ; 3 écritures identiques → 1 ligne, compteur 2 ; v2 → « obsolete » ; table fermée |
| `ops-digest` : « 🔴 Boucles serveur arrêtées » (comptes arrêtés, décisions répétées) et « ⏱️ Relevés automatiques retenus » | **CODE PRÊT, NON DÉPLOYÉ** : déploiement en erreur 500 côté Supabase, nouvel essai refusé par le classifieur (v32 inchangée) |

Pourquoi aucun autre chemin ne boucle (relu en prod le 08/10) : la v3 fait UNE
passe par invocation (aucune boucle sur l'état), sa chaîne de relances est
bornée à 12, `rapprochement_v3_appliquer` n'écrit rien pour une création
refusée et ne touche que des annonces sans article ; `fusion_photo_tick` traite
chaque annonce en attente une fois (état « rattachee »/« relachee ») ;
`handler-watch` ne rattache qu'un job AVEC article (`.not("inventaire_id","is",null)`) ;
`rapprocher_rattraper` n'est lancé qu'à la main. Les seuls trous restants (job
sans article, passe qui meurt toujours) sont fermés par la v12 et la migration.

### b) Veilleurs en rafale — cadence plancher

- Cause (extension, toutes versions servies) : à chaque ronde du veilleur, UNE
  annonce lue « indisponible » (Leboncoin, Beebs, eBay, Opla) demande un relevé
  complet de « Mes annonces » (`demanderRelevePourRattachement`), sans délai.
  44310spgl : 120 annonces Opla lues « indisponibles » alors que chaque relevé
  les retrouve toutes (disparues 0) → un relevé toutes les ~2 min 30 (22 cette
  nuit, 166 en 7 jours, jusqu'à 30/h). choupette06 : 14 relevés Beebs en une
  nuit. Le cron de l'extension (20 h) ne compte que les relevés réussis : une
  plateforme absente ou en échec est relue à chaque alarme.
- Migration `20261008101000_releve_auto_plancher` (**PRÊTE, NON APPLIQUÉE**) :
  un relevé automatique (veilleur, cron) n'est pas créé si un relevé de la même
  plateforme a commencé il y a moins de `coin_config.releve_auto_plancher_min`
  (360 min), par compte et par plateforme ; refus silencieux compté
  (`releves_auto_refuses`). Jamais les gestes, jamais les relevés du serveur
  (retraits, ventes), jamais le dressing Vinted. L'extension crée le run AVANT
  de lire la plateforme : un refus ne coûte aucune requête chez elle — sans
  nouveau zip. Preuve (transaction annulée) : veilleur ×2 + cron → 0 run,
  compteur 2 + 1 ; « bouton » juste après → créé ; autre plateforme sans relevé
  récent → créé ; réglage 0 → coupé. Rejeu des 7 jours : 725 relevés
  automatiques → 312 (44310spgl Opla 167 → 5, voirememe LBC 73 → 24).
- Reste côté extension (pas de zip sans décision) : pourquoi le veilleur lit
  des annonces Opla « indisponibles » à tort chez 44310spgl.

### c) Le parc (7 jours)

- `rapprochements` : une seule répétition anormale (Nadège). Les autres
  (≤ 12 « propose » en 4 jours) sont des relevés successifs, bornés.
- Relevés : les veilleurs ci-dessus ; les « app » répétés (josephinecerni) sont
  des appuis humains espacés de 20 à 60 min.
- Jobs : aucune répétition par article (max 4 publications, Louis/Nico, normales).
- **Trouvé en plus : la marque en ping-pong** — 117 articles, 3 comptes
  (xxewwer, josephinecerni…), 388 écritures en trop : la synchro du dressing
  Vinted envoie `marque: null` (upsert) et efface la marque venue d'une autre
  plateforme, que le relevé suivant recomplète. Migration
  `20261008102000_marque_jamais_effacee_par_synchro` (**PRÊTE, NON
  APPLIQUÉE**) : une écriture de synchro (qui avance `last_synced_at`) ne vide
  jamais une marque non vide ; une autre marque s'écrit, la personne efface
  comme avant. Prouvée en transaction annulée.
- Délais de 5 s dépassés (pg_net) sur quelques crons : déjà là toute la nuit,
  sans lien.

### d) Nettoyage des 8 953 lignes de Nadège — NON FAIT

Sans risque (le moteur ne lit que la dernière ligne d'une annonce — l'import du
08/10 00:18 — et l'existence d'un « ignore » de la personne), mais l'écriture du
script a été refusée par le classifieur. À lancer par Nico : sauvegarde dans
`_backup_0810_boucle_rapprochements` (RLS, fermée), suppression des lignes
`attache/job/NULL` du job 839e4bf2 entre 21:26 et 22:33 UTC sauf la première.

## 3. Imports et quota — aucun quota ne bloque un import

Les « 189 créations refusées (quota/geste) » de la nuit : **aucune par un
quota** (il n'en existe aucun sur ce chemin : `rapprocher_importer` et
`rapprochement_v3_fiche_de` n'en lisent pas, `check_inventory_limit` est levé
depuis le 04/09, `quota_annonces_consommees` compte générations et scans,
les quotas de republication ne comptent que les republications). Décompte
exact : 163 annonces eBay dont la personne avait supprimé la fiche
(9148e867, décision définitive), 3 annonces eBay vendues, 22 annonces
Leboncoin non « active » chez Leboncoin (expirées, en pause), 1 Beebs retenue
(dette). Rien à rejouer. Aucun geste attendu de la personne.

## Commandes (après le feu vert de Nico, une migration à la fois)

```
npx supabase db query --linked -f supabase/migrations/20261008100000_rapprochement_jamais_la_meme_decision.sql
npx supabase migration repair --linked --status applied 20261008100000
npx supabase db query --linked -f supabase/migrations/20261008101000_releve_auto_plancher.sql
npx supabase migration repair --linked --status applied 20261008101000
npx supabase db query --linked -f supabase/migrations/20261008102000_marque_jamais_effacee_par_synchro.sql
npx supabase migration repair --linked --status applied 20261008102000
npx supabase functions deploy ops-digest --no-verify-jwt
```

Selftest : `npm run selftest:boucles-fermees` (36 contrôles). Suite complète
08/10 matin : **208/208 verts** — deux tests rendus indépendants d'une position
(0.6.100 n'est plus la dernière de `ALREADY_PUBLISHED` ; l'empreinte du script
Beebs commence par l'entrée « ping » de la 0.6.103). `npm run build:essai` vert.

Non-régression en base depuis la v12 (07:19 UTC) : tous les crons « succeeded »
et leurs appels en 200 (les délais de 5 s de pg_net existaient toute la nuit),
rapprochements finis sans compte arrêté ni hors « termine », republications,
relevés eBay API, notes et mails de vente qui continuent. Aucun chemin de
publication, republication, retrait, veille ni mail n'a été modifié.
