# Complément du lot du 15/11 (2) — point 4 : ventes effacées (heure de Paris)

Aucun mail à un utilisateur, rien chez Stripe, rien supprimé, aucun autre compte touché que les six prouvés.

## 1. La cause, preuve à l'appui

**« Réinitialiser mon inventaire »** (Réglages › Mon compte › Zone sensible › « Réinitialiser » puis « Tout supprimer »)
appelait la fonction `supprimer_mon_stock_sans_retrait()`, dont le corps de prod (relu le 15/11, md5 c1246f07…) était :
`… delete from public.ventes where user_id = auth.uid(); delete from public.inventaire where user_id = auth.uid();` —
TOUTES les ventes du compte, en une transaction, puis le stock. Le texte disait bien « Vide ton stock et tes ventes »,
mais les personnes s'en servaient pour repartir d'un stock propre (resynchroniser, changer de boutique Vinted) ; aucun
geste n'était tracé (ni usage_logs, ni motif dans `ventes_supprimees`).

Aggravant : chaque vente effacée laissait une ligne `ventes_supprimees`, que le relevé lit comme « supprimée par la
personne, ne revient JAMAIS » (`enregistrer_ventes_relevees`, § 04/10). La synchro suivante ne ramenait donc pas
l'historique : chez Ludovic, seules les ventes postérieures au 09/11 sont revenues.

**Preuves pour Ludovic (noubliejamais, 2c89e573)** :
- les 1 732 lignes du 13/11 portent le MÊME instant à la milliseconde (`19:14:53.225`) : une seule instruction
  `delete … where user_id = …` (des suppressions à la main en ont une chacune) ; idem 14/11 19:31:51.048 (7) et
  22:33:40.285 (12) ;
- seule `supprimer_mon_stock_sans_retrait` écrit `platform_fields.reinitialisation.le` sur ses tâches : **928** tâches
  marquées à 19:14 le 13/11, **955** à 19:31 et **954** à 22:33 le 14/11 — trois réinitialisations ;
- autour : `stats_analysis` 19:04, puis, le 14/11, « Synchroniser » depuis un stock vide (`source: stock_empty`,
  19:23 et 19:32) — il vide, resynchronise, revide.
- même signature chez les cinq autres (instant unique, stock vidé, « Synchroniser » depuis un stock vide juste après :
  ayadi007 11:00:38 → 11:01:05, jocaille270779 07:33:09 → 07:34:14) ; jlovertab : 675 tâches marquées
  « reinitialisation » à 18:12. Pour les plus anciens (25-26/10), la marque des tâches n'existait pas encore (ajoutée
  le 08/11) : instant unique et compte vidé à zéro.

## 2. L'étendue, sur tous les comptes (ventes_supprimees existe depuis le 04/10/2026 : rien n'est mesurable avant)

10 837 lignes, 103 comptes :

| Nature | Comptes | Ventes | Restauré |
|---|---|---|---|
| **Réinitialisation de l'inventaire, compte encore là** | **6** | **4 685** | **oui (4 643 + 42 doutes)** |
| Réinitialisation juste avant la suppression du compte (le compte n'existe plus) | 16 | 5 472 | non (compte supprimé) |
| Suppressions une à une (2 à 6 s entre deux, au rythme d'une personne qui confirme chaque vente) | 82 | 657 | non (gestes explicites) |
| Article supprimé avec ses ventes (une instruction, 5 à 6 ventes du même article) | 3 | 17 | non (geste explicite) |
| Compte de Nico (essai, 16/10) | 1 | 6 | non |

Les six comptes touchés, payants d'abord :

| Compte | Palier | Réinitialisation(s) | Ventes effacées | Restantes avant | Remises | Doutes | Après |
|---|---|---|---|---|---|---|---|
| noubliejamais (Ludovic, 2c89e573) | Pro (Stripe) | 13/11 19:14 (1 732), 14/11 19:31 (7), 22:33 (12) | 1 751 | 59 | **1 711** | 40 | **1 770** |
| van-breugel.sandra (9148e867) | Premium | 25/10 13:14 | 409 | 7 | **409** | 0 | **416** |
| ayadi007 (cfdfda6f) | Premium | 08/11 11:00 | 746 | 32 | **744** | 2 | **776** |
| goks2725 (43dfb277) | gratuit | 25/10 12:07 (1 569), 28/10 14:49 (18) | 1 587 | 0 | **1 587** | 0 | **1 587** |
| jocaille270779 (0a24c951) | gratuit | 26/10 07:33 | 175 | 0 | **175** | 0 | **175** |
| jlovertab (ae27133d) | gratuit | 08/11 18:12 | 17 | 0 | **17** | 0 | **17** |

## 3. Le correctif (pour tous) et son verrou

Migration **20261115140000_ventes_jamais_effacees_sans_le_vouloir** (feu vert de Nico, appliquée à **12:35:49**,
`migration repair` fait ; inverse `supabase/rollbacks/…_INVERSE.sql`). Droits du journal ajoutés sur second feu vert à
**13:09:58** (`GRANT ALL` à `service_role` seulement, marqueur « droits : serveur seulement » — exigé par
`selftest:tables-droits-explicites` ; relu : `authenticated` ne lit pas, `service_role` lit) :
- `supprimer_mon_stock_sans_retrait(p_avec_ventes boolean DEFAULT false)` : par défaut, le stock seulement — les ventes
  RESTENT (détachées de leurs fiches) ; elles ne partent que sur `p_avec_ventes = true`. Une app d'avant (appel sans
  argument) garde donc les ventes, dès maintenant. Le geste est noté (`usage_logs` « reinitialisation_inventaire » :
  ventes gardées / effacées, articles). L'ancienne fonction sans argument est supprimée (vérifié : PostgREST résout
  l'appel avec et sans argument vers la nouvelle).
- **Toute** suppression d'une vente, quel que soit son auteur (personne, fonction du serveur, clé de service), est
  journalisée dans `ventes_suppressions_journal` avec la LIGNE ENTIÈRE (prix d'achat, frais, marque, marge…), le rôle,
  le motif (posé par le code, sinon reconnu à la requête : `suppression_vente`, `suppression_article_et_vente`,
  `reinitialisation_inventaire_avec_ventes`, `fonction:<nom>`…) et la requête. Une vente effacée par erreur se rendra
  désormais à l'identique.
- `ventes_supprimees` porte son motif et le code qui l'a faite (`source`, `motif`).

App (web et OTA) : la confirmation dit « Vider tout ton stock ? Tes ventes restent. » ; une case **décochée à chaque
ouverture** « Supprimer aussi toutes mes ventes (historique et chiffre d'affaires effacés pour toujours) » change le
bouton en « Tout supprimer, ventes comprises ». L'app envoie TOUJOURS `p_avec_ventes` et ne retombe jamais sur
l'appel sans argument ; une erreur n'efface rien et le dit.

**Verrous** :
- `selftest:ventes-jamais-effacees` (23) : casse si un chemin de code (app, extension, fonctions edge) efface des
  ventes hors de la liste FERMÉE de gestes explicites (supprimer une vente, supprimer un article et sa vente,
  supprimer son compte), si une fonction SQL efface des ventes hors de la liste fermée des fonctions du serveur
  (fusion du relevé, éclatement d'un lot, annulations prouvées, réinitialisation sur case cochée), si la
  réinitialisation peut effacer des ventes sans `p_avec_ventes`, si l'app l'appelle sans, si la case n'est pas
  décochée à chaque ouverture, ou si la journalisation disparaît. ROUGE sur le code d'avant : 17 rouges sur 23.
- `selftest:ventes-jamais-effacees-pg` (27, base jetable) : A. le corps de prod d'avant efface tout (la cause) ;
  B. après : sans case, les ventes restent, détachées, geste noté ; C. case cochée : journal ligne entière et pierre
  tombale motivée ; D. motifs des autres chemins, et aucune pierre tombale posée par le serveur ; E. la restauration
  jouée telle quelle ; F. l'inverse.

## 4. La restauration (jouée à 12:27:54)

Script `scripts/reparations/20261115_ventes_reinitialisation_restaurees.sql` (+ `_INVERSE`, `_VERIFIER`), une
transaction :
- sauvegarde `public._backup_1511_ventes_reinitialisation` (4 685 lignes, la décision de chacune) ;
- remises avec leur **id d'origine** : titre, prix de vente, date de vente, plateforme, commande, annonce ; statut
  « vendu » ; source « relevé » quand elles avaient une commande ; devise EUR (Vinted, Leboncoin) ;
- **aucun déclencheur** : `alter table ventes disable trigger user` DANS la transaction, réactivés avant le COMMIT
  (relu après : 0 déclencheur désactivé sur 5) ; compteurs push_ventes, cross_post_jobs, inventaire et email_logs des six
  comptes relus avant/après l'insertion : identiques (sinon rien n'était écrit). Après : 0 mail « vente », 0 ligne
  push nouvelle, 0 tâche créée par la restauration (les 2 tâches d'ayadi007 de 12:17:57 sont à lui, avant) ;
- aucun doublon : aucune vente déjà présente par commande / annonce / id ; 0 doublon de commande relu après ;
- **42 doutes NON remis** (même titre qu'une vente déjà là, sur la même plateforme ; jamais de rapprochement sur un
  titre seul) : Ludovic 40 — ses 58 ventes Vinted recréées le 15/11 à 10:21 n'ont ni commande, ni annonce, ni date ;
  ayadi007 2. Liste : `select … from _backup_1511_ventes_reinitialisation where decision = 'doute_titre'` — à trancher ;
- les 4 643 lignes `ventes_supprimees` des ventes rendues sont MARQUÉES (source « reinitialisation_inventaire »,
  motif « restauree 15/11 … »), aucune supprimée. Conséquence voulue et sûre : le relevé continue de ne pas les
  recréer (pas de doublon) ; il ne les mettra pas non plus à jour (une annulation tardive d'une de ces ventes ne
  s'appliquerait pas seule).

**Ce qui n'est PAS récupérable depuis la base** : pour cinq comptes, prix d'achat, frais, marge, marque, type,
description et lien vers la fiche (les fiches ont été vidées avec le stock) — `ventes_supprimees` ne gardait que titre,
prix de vente, date, plateforme, commande, annonce ; aucune autre table ne les avait (cherché : toutes les sauvegardes
`_backup_*` au format des ventes, `annonces_plateforme`, `cross_post_jobs`) ; ventes sans date : goks2725 34,
Ludovic 8, ayadi007 6. **Sandra** : prix d'achat, frais, marque, type, description et source repris de sa
sauvegarde complète du 02/10 (`_backup_0210_ventes_rattrapage`, ses 409 ventes).
**Récupérable par Nico** : les sauvegardes physiques quotidiennes de Supabase (relues : 08/11 → 15/11, 04:20 UTC, pas
de PITR) contiennent les lignes ENTIÈRES de Ludovic (sauvegarde du 13/11 04:24, avant 19:14), d'ayadi007 et de
jlovertab (08/11 04:20, avant 11:00 et 18:12). Les lire demande « Restore to a new project » (Dashboard › Database ›
Backups) : un projet neuf, à décider par Nico ; je remettrais alors prix d'achat, frais, marques et liens par l'id. Les
sauvegardes ne remontent pas au 25-26/10 (goks2725, jocaille270779 : non récupérable).

## 5. Changer le compte Vinted synchronisé (compte Pro, extension sur l'ordinateur)

En mots simples, pour le client :
1. Sur ton ordinateur, dans Chrome, va sur vinted.fr, déconnecte-toi, puis connecte-toi avec l'autre compte Vinted.
2. Dans FillSell, onglet Stock, appuie sur « Synchroniser ».
3. FillSell voit une nouvelle boutique et demande « C'est ma boutique — l'ajouter » : touche-le. Ses annonces arrivent
   dans ton stock ; des pastilles en haut du Stock te laissent filtrer par boutique.
⛔ N'utilise pas « Réinitialiser mon inventaire » pour ça.

Limites honnêtes : la nouvelle boutique s'AJOUTE (l'ancienne reste suivie, avec ses articles) — il n'existe pas de geste
« ne plus suivre cette boutique » ; une boutique déjà suivie par un autre compte FillSell est refusée (« écris-nous pour
la transférer »). Correction proposée (non faite, à décider) : Réglages › « Mes boutiques Vinted », avec « Ne plus suivre »
qui retire du stock les articles de cette boutique sans toucher aux ventes ni aux annonces.

## Livraison
- Migration 20261115140000 appliquée (12:35:49) ; restauration jouée (12:27:54) et relue ; web et OTA (voir l'état de prod).
- Verrous `selftest:ventes-jamais-effacees` (23/23, 17 rouges sur le code d'avant), `selftest:ventes-jamais-effacees-pg`
  (27/27) ; suite complète avant le commit : 793 selftests verts (un seul rouge en route, `tables-droits-explicites`,
  corrigé par les droits du journal) ; lint des fichiers touchés identique à avant ; `build:essai` vert.
- Extension inchangée (le zip 0.6.191 du lot (2) reste à téléverser). Aucun mail envoyé.
