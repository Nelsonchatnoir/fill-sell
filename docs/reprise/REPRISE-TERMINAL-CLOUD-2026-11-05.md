# Reprise — terminal « Cloud » (essai cloud-2, tests de publication), 05/11/2026

Écrite le 05/11 vers 14:00 (heure de Paris), avant le `/clear` demandé par Nico. Le récit complet est dans
`docs/enquetes/beebs-cloud-0411/RAPPORT.md`, § 15 (essai de tenue) et § 16 (tests de publication). Ce fichier tient seul :
où on en est, ce qui est commité, déployé ou pas, ce qui attend Nico, et comment reprendre sans rien casser.

- Dossier partagé avec le **terminal « Problèmes »** (sa reprise : `docs/reprise/REPRISE-TERMINAL-PROBLEMES-2026-11-05.md`).
  C'est LUI qui fera le déploiement commun de production, une seule fois (décision de Nico, 05/11 ~13:50).
  Ne jamais committer ses fichiers : relire `git status` et commiter avec `git commit --only <mes fichiers>` ; relire
  `git log origin/main..HEAD` avant chaque push (un push emporte les commits des autres).
- Mes commits du jour : d3ac9a7, 2d943b8 (docs), **d41332e** (verrou Cloud), **7c48b8c** (annonce disparue), et le commit
  de ce fichier (correctif « en vérification », clôture annulable, liste des 22).

## 0. Ce qui attend Nico

1. **Déploiement commun (terminal « Problèmes »)** — ce que mon terminal y met :
   - **d41332e** (Cloud) : orchestrateur `serveur-cloud/` + copie Cloud de l'extension. Déployé sur **cloud-2 seulement**
     (11:51). Pour cloud-1 / la production Cloud : `bash serveur-cloud/outils/deployer.sh <ip> <domaine>` sur un arbre propre,
     après `node scripts/cloud/build-extension-cloud.mjs --extension=d426d23` (même base que la copie en service), quand
     aucun job ne tourne (le navigateur redémarre). ⛔ cloud-1 sert à nouveau Nico seulement après l'INVERSE de la bascule (§ 3).
   - **7c48b8c + commit de ce fichier** (handler-watch) : la règle « annonce publiée confirmée disparue » + marqueur
     « en vérification ». handler-watch porte AUSSI des changements non déployés de l'autre terminal (2c9c876).
   - **chrome-extension/background.js** (commit de ce fichier) : la capture des fiches saute les annonces « en vérification ».
     Part dans le PROCHAIN paquet de l'extension (CWS) : `EXTENSION_LAST_COMMIT` à mettre à jour dans un commit à part, comme
     d'habitude ; aucune version bumpée ici. La copie Cloud le porte par patch (`build-extension-cloud.mjs`).
2. **Avant ce déploiement : la liste des 22 annonces qui seraient closes** (compte, plateforme, titre, preuve) est au
   RAPPORT § 16. Clôture annulable : `scripts/reparations/20261105_regle_annonces_publiees_disparues_INVERSE.sql`.
3. **Garder ou rendre cloud-2** (Hetzner enchère 3104939, i9-13900, 0,3136 € HT/h, plafond 195,70 € HT/mois) : ordre de
   Nico seulement. Le rendre = d'abord l'INVERSE de la bascule (§ 3), puis seulement la résiliation.
4. **Palier 3** (20 republications par plateforme) : reporté aux « finitions Cloud » (Nico, 05/11 ~13:50).
5. **Finitions Cloud** (après l'essai, liste au RAPPORT § 15, points 1 à 6) : relancer les jobs dès un « Résoudre » réussi ;
   heure de chaque étape d'une republication ; une vérification réussie (seule ou après « Résoudre ») lève la pause
   (messagerie ET jobs) ; redépôt Leboncoin pris puis rendu en 4 s (10-20 min hors ligne) ; retenue « une annonce hors
   ligne à la fois » levée trop tôt (Mickey Depop + Leboncoin hors ligne ensemble 10:19-10:28) ; preuve sur le vrai écran de
   « À reconnecter ». + palier 3. + la règle « une annonce hors ligne à la fois » est GLOBALE (toutes plateformes) : le palier 2
   avance une annonce à la fois, toutes plateformes confondues (à mesurer / décider).
6. **Règle de renouvellement des IP refusées** (fc25780, `_shared/cloud-pool.js`) : NON déployée sur cloud-1 (refus du
   classifieur le 04/11) ; il faut le feu vert nommé de Nico, avant le 24/11.

## 1. L'essai de tenue (04/11 18:00 → 05/11 08:00) — VALIDÉ par Nico (05/11 matin)

- cloud-2 = 5.9.80.213 (`ssh -i ~/.ssh/fillsell_cloud_ed25519 root@5.9.80.213`), `cloud-2.fillsell.app`, Ubuntu 24.04,
  Google Chrome officiel sur la puce Intel UHD 770, `ENTRETIEN_POOL=0`, `ENREGISTREMENT_FOND=1`.
- Compte de Nico (f44b5917-bccc-4431-ba41-f40571a2ed18) sur cloud-2, IP 42 (94.194.94.68) ; IP 39 RÉSERVÉE à Nico jusqu'au
  03/12 (pour le retour) ; `cloud_ip_achats_auto = 0`.
- cloud-1 (178.105.24.16, `cloud.fillsell.app`) : `COMPTES_AUTORISES=00000000-…` (ne sert personne ; jamais vide).
- Nuit : aucune glissière Vinted / Leboncoin / Depop ; Beebs : vérification de l'appareil passée SEULE à 02:48:48.

## 2. Les tests de publication (05/11)

- Palier 1 (10:28-10:35) : publications « Veste lot F » et « Jean Lee » sur 5 plateformes (écran de l'app dans le Chrome de
  Nico, session déjà ouverte) ; republications par `spend_coins_and_republish` sous le compte de Nico (SQL :
  `set_config('request.jwt.claims', …)` + `role authenticated`). eBay : la fonction ne republie pas eBay (`invalid_platform`).
- **d41332e** : Beebs était fermé par NOTRE verrou (jeton court expiré, jeton long là) — preuve réelle 11:53 (une visite de
  l'accueil, jeton renouvelé en 9 s), Veste et Jean Lee publiées sur Beebs, Mickey republié.
- Palier 2 (13:06:43 → essai CLOS 15:45 sur décision de Nico) : Vinted 5/5 (10 à 23 s hors ligne), Depop 5/5 (3 à 6 min),
  Beebs 5/5 vraies annonces (3 à 9 min), Leboncoin 1/5 (Veste lot F 6 min ; Jean Lee bloqué en geste attendu alors que le
  numéro de l'adsubmit prouve le redépôt — défaut ; T-shirt homme : pré-vol photo raté 15:38, nouvel essai 16:08, rien retiré ;
  Lot de 2 t-shirts et Veste lot H jamais apparus chez Leboncoin). Aucun doublon Vinted/Depop ; Beebs : anciennes pages encore
  servies 1-2 h (cache). Lent parce qu'UNE annonce hors ligne à la fois, toutes plateformes confondues. Mémoire : pointe 1,36 Go
  (limite 2 Go). Coût ≈ 7,0 € HT + IP 4 $ au 05/11 15:45. Détail : RAPPORT § 16 « Palier 2 — bilan ».
- ⚠ Jobs encore ouverts sur le compte de Nico après la clôture : Leboncoin Jean Lee (5e4201ba, geste attendu — l'annonce
  3302754094 est bien le redépôt : même numéro que l'adsubmit 201) et Leboncoin T-shirt homme (32e12d08, nouvel essai 16:08).
- Les fiches TEST sur Beebs sont retirées par la modération Beebs (absentes de « Mes annonces », relu le 05/11 vers 13:50
  dans le navigateur de cloud-2) ; les vraies annonces republiées sont dans « Mes annonces > en ligne » aussitôt, leur page
  publique arrive plus tard (cache de Beebs).

## 3. Revenir sur cloud-1 (procédure, NE PAS improviser)

`docs/cloud/REPRISE.md`, bloc « 04/11 soir → 05/11 18:00 — ESSAI … cloud-2 » : 1) arrêter le poste de Nico sur cloud-2 ;
2) `scripts/reparations/20261104_cloud_essai_gpu_bascule_nico_INVERSE.sql` (coffre restauré, poste rendu à cloud-1, IP 39) ;
3) seulement ensuite `COMPTES_AUTORISES` de cloud-1 = le compte de Nico. ⛔ Dans l'autre ordre, cloud-1 purgerait les sessions
du profil (le coffre commun est vidé pour l'essai). Jamais `cloud_ip_liberer` sur le compte de Nico ; aucune purge.

## 4. Sur cloud-2 après la clôture (05/11 15:45)

- Enregistreurs de l'essai ARRÊTÉS (`/usr/local/bin/fs-memoire.sh`, `/usr/local/bin/fs-alarmes.py`) ; leurs fichiers restent :
  `etat/essais/memoire-2026-11-05.csv`, `etat/essais/alarmes-2026-11-05.log`. Fichiers de test (suites) effacés sur les deux serveurs.
- Reste allumé : `ENREGISTREMENT_FOND=1` (configuration de l'orchestrateur, ~30 Mo/jour) — à retirer au prochain déploiement.
- Lire l'état réel : `etat/endurance/blocages.json`, `etat/essais/fond-f44b5917-<jour>.jsonl`, `docker compose logs orchestrateur`
  (dans `/srv/fillsell-cloud/deploiement`) ; base : `cloud_coffre`, `cloud_postes`, `messagerie_releves`, `cross_post_jobs`.

## 5. Reprendre

Lire ce fichier, puis RAPPORT § 15 et § 16 ; relire l'état réel (base + cloud-2) avant d'affirmer quoi que ce soit ; ne
rien lancer sur cloud-2 sans ordre de Nico ; aucune purge, aucun achat, aucun contact plateforme hors de ses ordres.
