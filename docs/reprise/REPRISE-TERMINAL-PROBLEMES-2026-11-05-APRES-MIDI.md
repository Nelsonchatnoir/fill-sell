# Reprise — terminal « Problèmes », 05/11/2026 après-midi (lot A à C de Nico)

Suite de `REPRISE-TERMINAL-PROBLEMES-2026-11-05.md` (matin). État de prod : `docs/agents/etat-2026-10-01.md`, section
« 05/11 après-midi ». Dossier partagé avec le terminal Cloud (ses commits du jour : d3ac9a7, 2d943b8, d41332e, 7c48b8c,
2a4b388 — ses fichiers : `serveur-cloud/`, `scripts/cloud*`, `scripts/reparations/20261105_cloud_*`,
`docs/enquetes/beebs-cloud-0411/`).

## 0. Ce qui attend Nico
1. **Sa confirmation** que le terminal Cloud valide ses commits pour la prod. Alors, UNE fois, par ce terminal :
   relire `functions list` (version, verify_jwt) ; déployer get-pending-jobs (verify_jwt true), update-job-status,
   handler-watch, extension-session (verify_jwt false / false / true — RELIRE avant) et ops-digest (false) depuis HEAD ; appliquer
   20261105110000 (relire les md5 prod de `releve_est_veille` 3c9435a1… et `spend_coins_and_republish` 534784e4… ; si
   changés, régénérer depuis `pg_get_functiondef`) par `db query --linked -f` + `migration repair --status applied`.
2. Après : lire en base le job de Smail (ee5fc232) et les pauses Leboncoin de 25caeedd, 521b7f89, 6a7595b1.
3. **Zip 0.6.174** à téléverser (chemin dans le rapport final). Après acceptation de la 0.6.173 puis de la 0.6.174 :
   les ajouter à `ALREADY_PUBLISHED` (`scripts/package-extension.mjs`).
4. Décisions : point 9 (Worker e-mail Cloudflare / boîte réelle — aucun accès Cloudflare ici) ; point 15 (espacer les
   lectures de routine Leboncoin : cadence = Nico) ; doublons de ventes Leboncoin 458085, 266885, 139705 (script décidé par
   Nico) ; affichages 11, 14, 16 A (preuve à l'écran impossible sans session : voir § 2).

## 1. Fait et prouvé
- A1 gpj NON déployé seul (changerait la description de la tâche ouverte 1877d3ff de Nico servie à cloud-2).
- A3 migration réalignée (un seul juge, garde-fou de Nico) — preuve 77/77 ; selftest `annonce-partie-un-seul-juge`.
- A4 `_shared/releves-de-veille.js` + handler-watch ; selftest `releves-de-veille` (32) ; `releve-fin-claire` adapté.
- A5 essai réel 10A (compte Leboncoin de Nico, son Chrome déjà connecté, lecture seule, aucun login) : le détail d'une
  transaction rend `item.id` = numéro d'annonce (321188533 → 3152401428 ; 359085469 → 3261819062).
- A6 `_shared/lbc-interdits.js` ; selftest `lbc-interdits` (59).
- A8 digest réel reçu 13:51:48 (« 🔴 Files arrêtées (extension ouverte) : 9 ») ; point 3 rejoué sur le texte réel de
  lp.vtd89 (arrêt au 1er essai) ; point 6 rejoué sur 29 titres + 595 descriptions réels (0 invisible isolé restant, 0
  lettre/accent/emoji changé). Point 2 : aucune preuve réelle possible sans provoquer une panne d'Auth pour tout le parc.
- 12 vente 458084 rendue à Amiral (script `_regle_`, sauvegarde, INVERSE).
- 10 `_shared/retrait-vente-prouvee.js` + extension ; selftest `retrait-vente-prouvee` (28).
- 15 extension : messagerie et lectures de routine Leboncoin arrêtées en pause.
- 18 republication « cible absente » close après deux relevés probants (selftest lot-f, 83).
- 19 visite de contrôle toujours jugée ; selftest `visite-controle-lbc` (11).

## 2. Pas fait (raison)
- Affichages 11 (« N annonces » = articles lus, vendus compris), 14 (copies Opla comptées « en ligne » au Tableau), 16 A
  (dépôt Beebs « en vérification » montré « En ligne ») : correctifs d'écran, que Nico veut prouvés sur le vrai écran ;
  aucune session fillsell.app utilisable ici sans saisir un mot de passe. Plans : rapports d'enquête du 05/11 (points 11,
  14, 16) dans le rapport final.
- 16 B (juge des dépôts Beebs sans numéro, 56 fiches / 7 comptes) et 16 C (empreinte lue aussi sur depot_jamais_en_ligne).
- 18 faux positifs de l'alerte : publication programmée CORRIGÉE (ops-digest, à déployer avec le commun) ; restent le départ effacé, le seuil de 24 h, la pause Leboncoin.
- 10 migration « délai 0 en base » non écrite : la levée côté get-pending-jobs suffit sans migration.

## Phrase de reprise
> Reprends le terminal « Problèmes » : lis `docs/reprise/REPRISE-TERMINAL-PROBLEMES-2026-11-05-APRES-MIDI.md` puis
> `docs/agents/etat-2026-10-01.md` (sections 05/11). Relis `git status` et `npx supabase functions list`. Le déploiement
> commun et la migration 20261105110000 attendent ma confirmation sur le terminal Cloud.

## 05/11 soir (après 16:00) — état exact
- Déployé : migration 20261105110000 ; get-pending-jobs v332, update-job-status v172, handler-watch v163 (juge corrigé,
  règle « annonce publiée disparue » COUPÉE), extension-session v14, ops-digest v49 ; web 3d06bef.
- Données réparées (sauvegarde + inverse) : vente 458084 → Amiral ; 24 republications Vinted rendues (17:11) ; Albator
  défusionné (17:54) ; 3 doublons de ventes fondus (17:56).
- PRÉPARÉ, NON APPLIQUÉ (feu vert nommé de Nico) : 20261105170000 remise en vente des séries (B) ; 20261105180000 mail à
  chaque vente (5b/A5 ; décision sur la règle de rafale) ; 20261105190000 règles de rattachement (A3, agent, en cours) ;
  20261105200000 archive support_mails + Worker cloudflare/email-support (point 4).
- À valider par Nico : rallumage du juge « annonce publiée disparue » (simulation : 21 closes, 7 comptes).
- Reste : 5a R1 (Beebs : mur de connexion jamais dit pendant un retrait) et R3 (digest : juger chaque retrait en retard) ;
  16 B (dépôts Beebs sans numéro jugés par la règle commune) ; point 7 (un relevé pour les deux comptes de Louis : effet à
  valider avant) ; tuile « Opla » prouvée par selftest seulement (aucun dépôt Opla sur le compte de Nico).
