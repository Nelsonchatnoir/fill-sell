# 26/10 nuit — « Ta file » : pouvoir annuler (demande de Nico)

## Ce qui change (app seulement)

- **« Tout annuler »** : bouton rouge à côté de « Mettre en pause / Reprendre », dans la barre de la pause. Il ne paraît
  que s'il y a quelque chose d'annulable. Confirmation : « Annuler les N publications (et/ou republications) en
  attente ? — Rien de ce qui est déjà en ligne n'est retiré, et ton quota n'est pas consommé. » ; s'il reste des
  tâches qui continuent (en cours, annonce déjà retirée, retrait après une vente), le nombre et la raison sont dits.
- **Par ligne** : une petite croix visible partout (confirmation dans la ligne : « Annuler cette publication ? Rien de
  ce qui est en ligne ne bouge. » — Garder / Annuler) et, au téléphone, glisser la ligne vers la gauche révèle un
  panneau rouge « Annuler ». Pas de croix sur les lignes « En cours », sur une republication déjà retirée, ni sur un
  retrait.
- L'ancien bouton de pied « Arrêter les N republications en attente » (Stock) est remplacé : un seul geste, qui couvre
  aussi les publications. Les annulées disparaissent tout de suite de la file ; le Stock les marque « arrêtées à ta
  demande » (l'article redevient « En ligne », comme avant).

## Les garde-fous (src/utils/annulerFile.js)

- S'annule : publication pending / needs_user sans lien ni numéro ; republication pending / needs_user dont le relevé
  n'a pas commencé (étape absente ou `a_capturer`).
- Jamais : un job en cours ; une republication `captured` (la suppression part pendant cette étape, avant d'être
  écrite), `deleted` ou suppression envoyée ; un retrait (`delete`).
- Écriture : une mise à jour par job, relue juste avant, gardée en base (statut lu, action, étape ou lien) ; statut
  `cancelled` et `arret_utilisateur` dans la même écriture → `controler_job_extension` refuse toute écriture
  ultérieure de l'extension.
- Quota : une publication se compte à la génération (rien à rendre) ; une republication annulée porte `hors_quota`,
  que les quatre compteurs de prod excluent déjà (relu en base le 26/10 : quotas_etat,
  quota_republication_free_etat, spend_coins_and_republish, remise_en_vente_place). Aucune migration.

## Preuves

- `npm run selftest:file-annuler` (règle, écriture gardée sur un bouchon qui enregistre chaque requête — dont un job
  passé à `captured` entre l'écran et l'écriture : refusé —, câblage de l'écran).
- `node scripts/apercu/capture-file-annuler.mjs` : composant réel, 390 px tactile et 1280 px, 0 erreur de page, aucun
  défilement horizontal ; captures dans `screenshots-review/file-annuler/` (1-file, 2-croix, 3-glisser, 4-confirmation,
  5-après).
- Suite complète des selftests relancée avant le commit ; `npm run build:essai` vert.

## Reste à faire

- Servi au web au push ; OTA mobile non lancée.
