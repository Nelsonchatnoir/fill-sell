# Reprise — terminal « Problèmes » du 12/11/2026

Rapport : `docs/enquetes/terminal-problemes-1211/RAPPORT.md`. Comptes par id8. Heures de Paris.
Consignes de la session (Nico) : copie à part depuis origin/main ; jamais la branche du site marketing ; chaque fonction part
de sa version EN PROD ; cause prouvée, classement, correctif à la racine, selftests, zéro régression ; aucune réparation à la
main ; aucun mail, aucune console ; l'état de prod et la reprise du terminal 1 lus, PAS modifiés (les versions déployées par
ce terminal sont donc écrites ICI, à reporter dans `docs/agents/etat-2026-10-01.md` si Nico le veut).

## Classement
| Point | Compte | Classement | Suite |
|---|---|---|---|
| 1. lots de publications « qui ne partent jamais » | 229c7b07 (et 4cfb7afe) | NORMAL : publications programmées, créneau du soir 19:00–22:00, une à la fois | décision de Nico sur la cadence (une à la fois par COMPTE → ~40 par soir) |
| 2. vente qui n'arrête pas la republication du même article | 6e3d92b3 | ROUGE, corrigé | voir ci-dessous |
| 3. retrait Beebs f4367beb | c7c382b7 | NORMAL, borné : clos seul à 7 jours du dépôt (14/11 ≥ 10:48, relecture de 12 h suivante) | rien ; relire le 14/11 au soir |

## Point 2 — EN SERVICE (12/11, commit 21fa849, poussé ce30433..21fa849)
- Suite complète 678/678 sur une copie de travail en LF de 21fa849 (12:25 → 12:48). ⚠ Dans une copie extraite en CRLF
  (autocrlf du poste), 8 selftests sont rouges pour les seules fins de ligne (opla-catalogue, ebay-retours, opla-prevol,
  ventes-prouvees, mail-apres-vente, copie-non-prouvee-question, a-regler-retirer, etat-job) : tous verts en LF.
- 13:44:18 sauvegarde (`_backup_1112_vente_arrete_meme_plateforme`, 3 définitions, garde md5 passée) ; **13:47:42
  migration 20261112140000** (`db query --linked --yes -f`, puis `migration repair --status applied`) : md5 d0efd535… →
  **970ca3b4f5b4dc1818c7b46f363658dc**, condition en place, droits, propriétaire, SECURITY DEFINER, search_path,
  lock_timeout 1500ms, statement_timeout 5s inchangés ; base démarrée le 11/11 13:29, aucune attente de verrou avant.
- **update-job-status v192** (13:48:43, avant v191), **ebay-api-worker v124** (13:49:00, avant v123), **handler-watch
  v192** (13:49:20, avant v191) : `verify_jwt` false avant et après, appel sans session → 401 pour les trois ; depuis
  l'archive LF entière de 21fa849. get-pending-jobs v361 non touchée.
- **13:51:09 : fac6fdef arrêtée par la règle** (handler-watch, « questions tranchées … vendu: 1 », motif
  `article_vendu_vente_enregistree`, « Article vendu le 11/11 : cette republication sur Vinted n'a plus d'objet. Rien
  n'a été retiré ni publié. »). PREUVE de 13:52:30 : reste 931a27d7 (compte ba656e5f, « article vendu » sans ligne de
  vente, voulu) ; retenues au démarrage : 0.
- Hors lot, vu en passant : `empreintes-urls` v19 dépasse son temps CPU plusieurs fois par heure depuis le 11/11
  (jusqu'à 24 par heure le 12/11 à 10h) — non touchée, à regarder.

## Point 2 — le détail du lot
- Migration **20261112140000** `vente_arrete_meme_plateforme` (enregistrer_vente_atomique réécrite depuis la prod, md5
  d0efd535… ; une condition ; commentaires anonymisés). Sauvegarde `scripts/reparations/20261112_vente_arrete_meme_plateforme_SAUVEGARDE.sql`
  → `public._backup_1112_vente_arrete_meme_plateforme` ; preuve `…_PREUVE.sql` (lecture seule, avant/après) ; inverse
  `supabase/rollbacks/20261112140000_vente_arrete_meme_plateforme_INVERSE.sql` + `migration repair --status reverted`.
- **update-job-status** (garde au démarrage, 409), **handler-watch** (règle 3 « sans objet » sur les tâches en attente),
  **ebay-api-worker** (garde dans `publier()`), toutes `verify_jwt` false (`--no-verify-jwt`), déployées depuis
  `git -c core.autocrlf=false archive <commit>` entière.
- Versions AVANT (lues le 12/11 vers 11:45) : update-job-status v191, handler-watch v191, ebay-api-worker v123,
  get-pending-jobs v361 (non touchée). Prod = origin/main pour get-pending-jobs et handler-watch (tous fichiers) ;
  update-job-status v191 et ebay-api-worker v123 embarquaient des fichiers partagés plus anciens (cloud-conditions.js,
  cloudOffer.js, interrupteurs.js ; shared.js — commentaire et lien de connexion Leboncoin, sans effet sur ces fonctions) :
  le redéploiement les aligne sur main.
- Retour : redéployer les trois fonctions depuis une archive de ce30433 (origin/main d'avant le lot), puis l'INVERSE SQL.

## Outillage laissé
- Copie de travail : `C:\Users\nicol\AppData\Local\Temp\claude\32da762e80935617\fef1c54f-f756-4cd5-a7ed-5ed0ccd1be02\scratchpad\wt-pb`
  avec une JONCTION `node_modules` → dépôt principal : ⛔ la retirer par `cmd /c rmdir <wt-pb>\node_modules` AVANT tout
  `git worktree remove` ou `rm -rf` (sinon le node_modules du dépôt principal est effacé).
- Lectures de prod hors dépôt (citent des clients) : `…\scratchpad\cat\` (catalogue des fonctions), `…\scratchpad\defs\`.
- Banc : `node scripts/essais/20261112140000_banc.mjs` ; fixture : `node scripts/essais/20261112140000_fixture.mjs --fonctions <tout.json> --tables <tab.json>`.

## Après-midi — points 4 à 6 (rapport § 4 à 6)
| Point | Compte | Classement | Suite |
|---|---|---|---|
| 4. publications programmées : dire quand ça part | 229c7b07, 4cfb7afe | ROUGE (l'app se taisait), corrigé | OTA 2.9.174 + web |
| 5. empreintes-urls, temps de calcul dépassé | tout le parc (rapprochement ralenti, rien de cassé) | cause dans les appelants SQL (rafales de 100) : rapport seul | décision de Nico : borner `rapprochement_v3_empreinter` |
| 6. Leboncoin « Animaux › Animaux » bloquée | cfdfda6f (298e4944, c8fd2caa) | ROUGE, corrigé | get-pending-jobs + handler-watch + app |
- Formule du rythme (point 4) : médiane des servies des 3 derniers créneaux pleins (14 jours au plus), bornée au plafond ;
  aucun créneau plein → aucun chiffre. `src/utils/rythmeProgramme.js`.
- Verrous : `selftest:programmees-verite` (7 rouges sur 5e88909 → 30/30), `selftest:lbc-animal-vivant` (8 rouges → 21/21).
- ⚠ Faute d'outillage (rien perdu) : un `git stash` raté dans la copie a été suivi d'un `git stash pop` qui a tenté
  d'appliquer la remise du terminal Cloud (stash@{0}, « POINT 4 bandeau Cloud… ») — refusé par git, remise CONSERVÉE, copie
  intacte. La pile de stash est partagée entre toutes les copies : jamais `git stash` ici.
- **EN SERVICE (commit 1746fae, poussé 5e88909..1746fae à 14:55)** : suite complète 680/680 sur une copie LF (14:32 → 14:54) ;
  **get-pending-jobs v362** (14:55:45, avant v361, `verify_jwt` true avant et après, sans session → 401 ; 145 appels en 200,
  médiane 1 166 ms contre 1 337 pour v361, aucune autre réponse) ; **handler-watch v193** (14:56:04, avant v192, `verify_jwt`
  false, `--no-verify-jwt`, sans session → 401) ; tous deux depuis l'archive LF entière de 1746fae. **14:57:09 : 298e4944
  reçoit le geste** (handler-watch, « questions tranchées … animal_lbc: 1 »). **OTA 2.9.174** publiée (canal production =
  2.9.174, commit 1746fae, `--delta`, 162 fichiers) depuis le dossier principal avancé en avance rapide (propre avant et
  après) ; web 2026-11-12T13:56:42Z+1746fae, entrée relue avec `Origin` : 200.
- Retour : get-pending-jobs et handler-watch depuis l'archive de 5e88909 ; app : nouvelle OTA (numéro neuf) d'un commit
  qui revient sur 1746fae.

## Soir — point 5 corrigé (GO de Nico) : rafales d'empreintes bornées à 10
- Migration 20261112160000 + fonction rapprochement (cadence) ; fusion_photo_tick inchangée. Verrou
  `selftest:empreintes-rafales` (6 rouges sur cfef7d7 → 11/11), banc 15/15.
- Référence avant : empreintes-urls 23 % d'échecs (24 h) ; attentes de photos du rapprochement médiane 29 s, p90 85 s.
