# Reprise — complément du 08/10 après-midi (chemins v3, Louis Beebs)

Suite de `docs/reprise/terminal-cloture-multi-synchro-0810.md`. Deux défauts
vus en réel par Nico après le « SUJET CLOS » de la fin de matinée.

## 1. Multi-synchro : les chemins qui créent une fiche depuis un relevé

### Ce qui a été établi

- **romain.knc (7e436336) n'est pas un contournement.** Les 4 fiches
  Leboncoin de 10:32 sortent du moteur v3 : journal de la fonction
  `rapprochement`, passe du compte à 08:32:16 UTC, 17 nœuds, 0 arête, plan
  « creer 4 ». Le détail `{"voie":"rapprochement","job_id":…}` venait de
  `rapprocher_importer`, qui écrivait son propre détail sans la règle. Même
  chose pour ocbijoux62 : ses 209 imports sont ceux de la réparation v3 du parc
  (02:19 Paris).
- **Tous les imports depuis la nuit sont v3** : 504 lignes « import » par le
  moteur, 19 comptes (01:55 → 02:20 réparation du parc, 10:32 romain.knc) ; 458
  fiches « releve_* » créées le 08/10, toutes avec leur décision.
- **Belma** : pointure 39 sur Vinted, 40 sur Leboncoin, photos de deux séances
  différentes → deux articles pour le moteur. **Sandales talons** Leboncoin :
  pointure 42 ; les sandales Vinted sont en 41 et 36 → aucun lien. romain.knc a
  lui-même republié Belma, Sandales et Matériel électronique sur Leboncoin
  entre 11:24 et 11:44 : ces annonces sont liées par son geste.

### Les chemins (recensement)

| Chemin | Crée une fiche ? | Passe par |
|---|---|---|
| Relevé Leboncoin / Beebs / eBay / Opla (extension, tous builds) | non | `annonces_plateforme` → `rapprocher_releve` → identifiant d'un dépôt FillSell (preuve) ou moteur v3 |
| Relevé eBay par l'API (`ebay-releve-api`) | non | idem (`rapprocher_releve`) |
| Veilleur, cron | non | n'importe rien (`garde_releve_sans_geste`) |
| Moteur v3 (`rapprochement_v3_fiche_de`) | oui | `rapprocher_importer(…, 'rapprochement')` |
| La personne (`rapprochement_decider`) | oui | `rapprocher_importer(…, 'utilisateur')` |
| Rattachement par job orphelin (handler-watch) | non | identifiant (preuve) |
| **Dressing Vinted (extension)** | **oui, `vinted_sync`** | **aucun moteur** : jamais comparé aux imports déjà au stock |
| Vente partielle (`consume_one_unit`, `enregistrer_vente_atomique`) | ligne « vendu », origine vide | hors relevé |
| App, `generate-listing`, `lens-analysis` | fiche de la personne | hors relevé |

Aucun client n'a jamais écrit de fiche « releve_* » (historique git vérifié).

### Ce qui change

- **Garde en base** (migration 20261008130000, EN ATTENTE du feu vert nommé de
  Nico) : `inventaire_releve_par_decision` refuse toute fiche « releve_* » (et
  toute origine réécrite en « releve_* ») sans la clé que seul
  `rapprocher_importer` pose, juste avant son insert, et retire juste après.
  Restauration par nous : `set_config('fillsell.import_releve','on',true)`.
- **La règle tracée** : `rapprocher_importer` écrit `regle: rapprochement_v3`
  quand c'est le moteur (même migration). Les 504 imports d'avant l'ont reçue
  par `scripts/reparations/20261008_imports_v3_regle_tracee.sql`
  (`regle_posee: 20261008_tracabilite`, sauvegarde `_backup_0810_regle_v3`,
  RLS, fermée ; inverse prêt). FAIT.
- **Les fiches Vinted jugées** : `rapprochement_v3_lire` rend
  `vinted_a_juger` (fiches `vinted_sync` nées depuis
  `rapprochement_comptes.vinted_juge_le`, 200 par passe, seulement si le
  compte a des imports) ; le moteur (mode normal) compare ces fiches aux
  imports automatiques au stock : import intact sûrement identique → fusion
  vers la fiche Vinted (portée `vinted_nouvelle`, la base garde l'« intact »,
  sinon la question) ; doute → « à vérifier » ; un concurrent → rien. La fin
  d'un relevé réveille la passe quand il y en a. Point de départ : 07/10
  23:30 UTC. `rapprochement` v13 DÉPLOYÉE (`verify_jwt` false) : inerte tant
  que la migration n'est pas posée.

### Preuves

- Transaction annulée : écriture directe refusée (42501), origine réécrite
  refusée, fiche Vinted et fiche de l'app acceptées, `rapprocher_importer`
  passe et trace la règle, la clé retombe juste après (insert suivant refusé),
  lecture Corinne 83 ms, dbca7f39 270 ms, plafond de 200 tenu (204 = un lot
  du dressing partage sa date).
- Rejeu sur la nuit (romain.knc, tessy.galy, la.mode.licyca) : 0 décision.
  Rejeu sur 7 jours (22 comptes) : les fusions proposées portent toutes sur
  des imports modifiés par la personne, déjà en question depuis la
  réparation de la nuit — la base les laisse en question.
- `npm run selftest:aucune-fiche-sans-v3` vert ; `--prod` après
  l'application.

## 2. Louis : republication Beebs lente, article repoussé au samedi

### Causes

- **Le job de la Bleue (8d0fabb6, annonce 32745154)** : créé à 21:54 par le
  balayage (créneau mardi/samedi 19:00–22:00), suppression envoyée vers
  21:58, Beebs la montrait encore deux minutes après → reprise à 22:05,
  créneau fermé → `get-pending-jobs` l'a retenu jusqu'au samedi 19:00 avec
  « Ton annonce est intacte, rien n'a été retiré ». Faux : 32745154 manquait aux
  relevés du 07/10 (complet, 112 vues) et du 08/10. La retenue n'exemptait que
  l'étape « deleted », pas une suppression envoyée non encore prouvée.
- **La lenteur (~20 min par article)** : 6 min de lectures avant la
  suppression, ~8 min d'attente de la preuve (Beebs garde la page et l'index
  public plusieurs minutes après une suppression ; l'extension relit 2 min
  puis attend 5 min), 2 à 5 min de pause voulue après le retrait, puis le
  redépôt. Les 8 republications du 06/10 ont toutes échoué au premier
  contrôle et prouvé l'absence au second.
- **« Mes annonces » vide** (louis 3/23 relevés, ornellaracano 2/24,
  b.halbot 1/7, 8 comptes sur 14 jours, tous builds) : le relevé lit la page
  RENDUE (onglet dans une fenêtre minimisée) ; la liste « Actuellement en
  ligne » est un composant client que la page ne peint pas toujours. Le
  relevé se replie sur l'index public (112) et se dit incomplet : rien n'est
  conclu. La preuve de suppression, elle, lit le flux de la page par fetch
  (pas le rendu) : pas touchée par ce défaut ; « en ligne » s'y arrête à 60
  (60/112 chez Louis), d'où la preuve par l'annonce elle-même (404 + hors
  index + hors vérification), plus lente à tomber.

### Ce qui change

- **Une republication dont la suppression est partie va au bout** :
  `retraitEngage` (`_shared/retenue-creneau.js`) ; `get-pending-jobs` v223
  (`verify_jwt` true) ne la retient plus au créneau, au plafond ni à la pause.
  La remise en ligne n'a lieu que sur preuve (extension inchangée). FAIT.
- **Le balayage ne lance plus ce qui ne peut pas finir** (migration
  20261008140000, EN ATTENTE du feu vert) : moins de temps restant dans le
  créneau que `republish_duree_estimee` (médiane des 10 dernières
  automatiques ; Beebs 25 min par défaut) → l'article reste en ligne, part au
  créneau suivant ; une suppression envoyée compte comme un retrait en vol.
  Rejeu du 06/10 : lancée à 21:33, pas à 21:54.
- **Proposé pour l'extension (0.6.104, rien construit)** : relire « Mes
  annonces » jusqu'à ~6 min après la suppression au lieu de 2 min + 5 min
  d'attente ; une suppression envoyée non prouvée ne consomme pas d'essai ; le
  relevé Beebs lit le flux de la page quand le rendu est vide.

### Louis

- Job 8d0fabb6 repris à 12:38 par son poste : suppression PROUVÉE (page 404,
  hors index, hors vérification, 12:39), redépôt programmé après 12:42.
- Les 12 ventes du 06/10 : non touchées (décision de Nico).
