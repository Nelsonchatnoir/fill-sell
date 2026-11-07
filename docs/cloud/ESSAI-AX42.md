# FillSell Cloud — l'ESSAI RÉEL DE L'AX42 (cloud-3), à lancer dès que Hetzner le livre

> ⛔ **06/11/2026 soir, décision de Nico : ESSAI ABANDONNÉ POUR L'INSTANT.** cloud-2 est le serveur de l'ouverture
> (`docs/cloud/REPRISE.md`, bloc du 06/11 soir) ; rien n'attend plus l'AX42. Ce plan et les scripts
> `20261106_cloud_essai_ax42_*` restent valables pour un futur serveur (nom cloud-3, Ubuntu 24.04, mêmes contrôles).

Écrit le 06/11/2026 vers 11:00 (heure de Paris), d'après le code du dépôt (`serveur-cloud/`, commit serveur **61fb7dd**,
le même que cloud-2) et les rapports `docs/enquetes/beebs-cloud-0411/RAPPORT.md` § 13, 15, 16 et
`docs/enquetes/ouverture-cloud-0511/RAPPORT.md` points 9, 11, 12, 14, 16. **Rien de ce qui suit n'est fait.**
Commande : AX42 (AMD Ryzen 7 PRO 8700GE, 8 cœurs / 16 fils, Radeon 780M intégrée, 64 Go) en « vérification manuelle »
(ticket Hetzner 2026110503039457) ; dernier mail lu le 06/11 : réponse automatique de 10:09 à la relance de Nico, aucune
réponse personnelle, aucun mail de livraison. **Relire l'état réel avant chaque étape** : rien ici ne vaut sans relecture.

Notations : `<IP>` = IPv4 de l'AX42 ; `<N>` = son numéro de serveur Robot ; `SSH3` = `ssh -i ~/.ssh/fillsell_cloud_ed25519
root@<IP>` ; `SSH2` = `ssh -i ~/.ssh/fillsell_cloud_ed25519 root@5.9.80.213` (cloud-2) ; `REQ` = une lecture SQL écrite
dans un fichier puis `npx supabase db query --linked -f <fichier>` (jamais une écriture sous ce nom). Nom retenu :
**cloud-3** / **cloud-3.fillsell.app** (cloud-1 = `cloud.fillsell.app`, cloud-2 = `cloud-2.fillsell.app`).

## ⛔ DÉCISIONS DE NICO DU 06/11 APRÈS-MIDI — elles PRIMENT sur le reste de ce document
Hetzner (06/11 11:56, ticket 2026110503039457) : « refaites exactement la même commande, nous l'accepterons » — Nico
la repasse lui-même. Robot relu le 06/11 vers 14:10 : seul cloud-2 (3104939) ; AX42 pas encore livré.
**06/11 16:10 : AX42-1 (B20261106-3543538) ANNULÉE par Hetzner** (délai « several weeks »), sans frais. AX42-2 (même
Ryzen 7 PRO 8700GE, 64 Go ECC) à HEL1 : « usually within a few minutes » mais **187,30 € HT/mois + 94,00 € HT
d'installation** (API Robot, 16:3x) > plafonds de Nico (99 / 49) → NON commandé ; décision de Nico attendue. À la
livraison d'un serveur : tout ce document vaut (nom cloud-3, Ubuntu 24.04, contrôles, bascule de Nico).
1. Essai **OUI**, seuils du § 6.3 **tels quels**, réinstallation en **Ubuntu 24.04** (comme cloud-2).
2. **PAS Ornella** : c'est le **COMPTE DE NICO** qui passe sur cloud-3 dès que cloud-3 a passé ses contrôles (A10 pare-feu,
   A11 Chrome par la Radeon et non SwiftShader, A12 battement sans compte), pour qu'il teste lui-même. cloud-2 GARDE les
   comptes de relecture (Apple d6a9e726, Google 953c1ca6) comme référence. Donc : B1 → `COMPTES_AUTORISES` de cloud-3 =
   **Nico seul** (f44b5917-…), posé à l'étape 2 du § 8 ; B2-B4 (IP et connexions d'Ornella) sans objet : Nico garde
   l'IP 42 et ses connexions (coffre commun, non touché) ; B3 remplacé par le § 8 ci-dessous ; l'étape C se fait sur le
   compte de Nico (annonces à 999 €, ses photos).
3. **DNS** `cloud-3.fillsell.app` : Claude le pose lui-même dans le Chrome de Nico dès que l'IP est connue (un
   enregistrement A, nuage GRIS, aucun AAAA).
4. **Beebs** : « dépôt reçu par Beebs (numéro, en vérification) » vaut preuve ; jamais une vraie annonce d'un utilisateur.
5. Scripts de réparation ÉCRITS le 06/11 (chacun avec son INVERSE), appliqués sur feu vert :
   - (b) bascule de Nico cloud-2 → cloud-3 : `scripts/reparations/20261106_cloud_essai_ax42_bascule_nico.sql` (+ `_INVERSE`) —
     **feu vert donné** : à appliquer quand cloud-3 a passé ses contrôles, dans l'ORDRE du § 8 (cloud-2 lâche, script,
     cloud-3 reprend). Coffre jamais touché, IP 42 inchangée, profil neuf sur cloud-3, profil de cloud-2 intact (secours) ;
   - (c) retrait de cloud-3 : `scripts/reparations/20261106_cloud_essai_ax42_retrait_cloud3.sql` (+ `_INVERSE`) ;
   - (a) Ornella : sans objet (décision 2).
   Preuve sur Postgres JETABLE, fonctions `cloud_serveur_battre` / `cloud_serveur_choisir` de la PROD :
   `PREUVE_PG=embarque node scripts/cloud/preuve-bascule-ax42.mjs` → **30/30** (gardes, aller, retour, retrait, battement
   qui laisse « retire »).
6. Relevé de 5 s en parallèle sur cloud-2 : **OUI** (§ 6.1, copié sur cloud-2 le temps de l'essai).
Déploiement : `SERVEUR_NOM=cloud-3`, puis les deux contrôles (puce graphique active ; Chrome qui l'utilise, jamais
SwiftShader), puis l'essai. Lectures du jour J faites le 06/11 vers 14:10 : cloud-2 = orchestrateur `61fb7ddd6e2a`,
`MEMOIRE_NAVIGATEUR=2g`, `GPU_GROUPES=44,993`, `COFFRE_CLE_VERSION=2`, aucune `COFFRE_CLES_ANCIENNES` ; copie Cloud
`2026-11-05T19:05:12Z+d426d23.p92769f2-cloud` = celle de `build/extension-cloud` ; serveur du dépôt `0997268` (seuls
`outils/deployer.sh`, `env-premier.sh`, `lancer-serveur-test.mjs` ont changé depuis 61fb7dd : orchestrateur identique).

## 0. En une page

| Jour | Étape | Qui | Durée |
|---|---|---|---|
| J0 | A — installer : système, Radeon vérifiée hors réseau, Docker, Caddy, DNS, `.env` fermé, pare-feu | Claude (+ DNS : Nico) | 2 à 3 h |
| J0 | B — UN compte réel sur cloud-3 (Ornella), IP du pool, « Me connecter » | Nico, Ornella | 30 min |
| J0 → J1 | Tenue 12 à 24 h à cadence normale, enregistrement de fond, relevé 5 s | — | une nuit |
| J1 matin | C — une publication à 999 € par plateforme (Vinted, Leboncoin, Beebs, Depop) | Ornella / Nico | 1 h |
| J1 | D-E — charge progressive 1 → 2 → 5 → 10 → 15 … → 45 navigateurs, 20 min par palier ; les 4 retraits SOUS charge | Claude | 4 à 5 h |
| J1 soir | Verdict chiffré, comparaison à cloud-2 ; F — bascule de Nico ou non (décision de Nico) | Nico | — |

Ce qu'on cherche (rien de cela n'est mesuré aujourd'hui) : la Radeon 780M sert-elle Chrome comme l'Intel de cloud-2
(WebGL ANGLE par la vraie puce) ; les plateformes acceptent-elles cette machine comme cloud-2 ; combien de comptes
l'AX42 tient (16 fils au lieu de 32, puce partagée, mémoire de la puce prise sur les 64 Go). Estimation par la
mémoire seule (point 16) : ~30 comptes à 2 Gio réservés, ~45 au p95 réel (1,25 Go).

## 1. Règles de l'essai (en plus de CLAUDE.md)

- Comptes : **Nico** (f44b5917-bccc-4431-ba41-f40571a2ed18), **Ornella** (fb9cd238-…, identifiant complet à lire),
  **relecture Apple** test@fillsell.app (d6a9e726-b6f1-4b7f-a927-2487668d6d96), **relecture Google**
  googlereview@fillsell.app (953c1ca6-…, à lire). Aucun autre compte : `COMPTES_AUTORISES` jamais vide (vide = TOUS).
- Annonces de test à **999 € ou plus**, comptes de Nico ou d'Ornella seulement, retirées à la fin ; jamais un objet de
  valeur ; pages vérifiées dans le Chrome de Nico (jamais WebFetch pour Vinted). Aucun mail.
- IP : celles du pool seulement (`cloud_pool_etat`). **Aucun achat sans l'accord écrit de Nico** (`cloud_ip_achats_auto`
  = 0 ; `acheter-une-ip.mjs --accord-ecrit="…"`). Jamais `cloud_ip_liberer` pour changer l'IP d'un compte actif.
- ⛔ **Jamais de purge du coffre.** Le coffre (`cloud_coffre`) est COMMUN aux serveurs. Une bascule ne retire jamais une
  ligne du coffre sans l'accord écrit de Nico (le 04/11 il l'avait donné, sauvegarde + inverse). Le serveur qui LÂCHE un
  compte s'arrête d'abord, la base change ensuite, le serveur qui REPREND s'ouvre en dernier (`docs/cloud/REPRISE.md`,
  bloc 04/11 soir) — dans un autre ordre, un serveur purgerait les sessions de son profil ou deux machines tiendraient
  la même session.
- cloud-3 ne tient JAMAIS le pool pendant l'essai : `ENTRETIEN_POOL=0` (purges, contrôles, achats, alertes restent au
  serveur qui le tient aujourd'hui). Création de serveurs coupée (aucun `HCLOUD_TOKEN` sur cloud-3).
- Aucun arrêt de cloud-3 de plus de **10 min** pendant qu'il sert un compte réel : au-delà de 15 min sans battement, la
  base réattribue le compte au serveur vivant le plus libre (`cloud_serveur_choisir`) — y compris cloud-1, qui ne sert
  personne : le compte resterait sans navigateur. Les redémarrages (GRUB, puce) se font AVANT l'étape B.
- Aucune tâche en cours (`processing`) d'un compte servi au moment d'un redéploiement (la vidange attend 10 min au plus).
- Toute anomalie de plateforme (glissière, « accès restreint ») = arrêt de la plateforme, on note « environnement », on
  ne réessaie pas sans Nico.

## 2. Avant la livraison (à préparer maintenant)

### 2.1 Décisions de Nico (une ligne chacune)
1. Feu vert de l'essai, ce plan compris (seuils du § 6.3 à valider ou corriger).
2. Ornella sur le Cloud pendant l'essai (option OFFERTE, aucun paiement) — **avec l'accord d'Ornella** : toutes ses
   tâches Vinted / Leboncoin / Beebs / Depop passent alors par cloud-3 (`profiles.cloud_voie`), son ordinateur n'en
   reçoit plus ; elle fait elle-même « Me connecter » sur son téléphone et crée l'annonce de test. Variante sans
   Ornella : bascule de Nico dès l'étape B (§ 8), cloud-2 n'est plus la référence simultanée.
3. DNS `cloud-3.fillsell.app` (la clé Cloudflare du poste a expiré le 12/10 : geste de Nico, ou Claude dans son Chrome sur
   son ordre, comme le 04/11 pour cloud-2).
4. Beebs : une annonce « TEST » à 999 € est souvent retirée par la modération Beebs (constaté le 05/10 et le 05/11) —
   accepter « dépôt reçu par Beebs (numéro, en vérification) » comme preuve, ou désigner une vraie annonce d'Ornella.
5. Deux scripts de réparation à écrire puis à approuver (modèles : `scripts/reparations/20261105_compte_relecture_apple.sql`,
   `20261104_cloud_essai_gpu_bascule_nico.sql`) : (a) Ornella sur cloud-3 + INVERSE ; (b) seulement si bascule : Nico de
   cloud-2 vers cloud-3 + INVERSE ; (c) en cas d'abandon : `cloud_serveurs` cloud-3 « retire » + INVERSE.
6. Relancer sur cloud-2, le temps de l'essai, le même relevé de 5 s qu'au 05/11 (lecture seule) pour une comparaison
   SIMULTANÉE.

### 2.2 Lectures (aucune écriture) — à refaire le jour J
`REQ` :
```sql
select nom, domaine, ipv4, capacite, comptes, ouverts, etat, vu_le from public.cloud_serveurs order by nom;
select * from public.cloud_comptes_a_servir();
select user_id, serveur, etat from public.cloud_postes order by maj_le desc;
select public.cloud_places_libres();
select public.cloud_pool_etat();
select id, ip, etat, user_id, reserve_pour, reserve_jusqu_au, refus, expire_le, attributions from public.cloud_ips order by id;
select id from public.profiles where id::text like 'fb9cd238%';
select id from auth.users where lower(email) = 'googlereview@fillsell.app';
select is_cloud, cloud_canal, cloud_voie, beta_flags->>'cloud' as temoin from public.profiles where id::text like 'fb9cd238%';
select platform, count(*) from public.cross_post_jobs where user_id::text like 'fb9cd238%'
   and created_at > now() - interval '30 days' group by 1;   -- les plateformes réellement utilisées par Ornella
```
cloud-2 (ce que cloud-3 doit recevoir à l'identique ; aucun secret affiché) :
```bash
SSH2 'cd /srv/fillsell-cloud/deploiement && cat .env && docker compose ps --format "{{.Image}} {{.Status}}"'   # deploiement/.env : sans secret
SSH2 'grep -rho "20[0-9-]*T[0-9:]*Z+[0-9a-f.p]*-cloud" /srv/fillsell-cloud/extension/*.js | sort -u'           # BUILD_ID de la copie Cloud
SSH2 "grep -E '^(COMPTES_AUTORISES|MEMOIRE_NAVIGATEUR|NAVIGATEURS_MAX|SOCLE_MO|BLOQUER_PUBLICITE|GPU_PERIPHERIQUES|ENTRETIEN_POOL|COFFRE_CLE_VERSION)=' /srv/fillsell-cloud/.env"
SSH2 "grep -c '^COFFRE_CLES_ANCIENNES=.' /srv/fillsell-cloud/.env"                                           # 0 ou 1, jamais la valeur
```
Attendu : orchestrateur `fillsell-orchestrateur:61fb7dd…` ; copie Cloud de base d426d23 (BUILD_ID à noter) ;
`git log -1 --format=%h -- serveur-cloud` = 61fb7dd sur `main`. Si la copie locale `build/extension-cloud` n'a pas le même
BUILD_ID : `node scripts/cloud/build-extension-cloud.mjs --extension=d426d23` (même base que la copie en service).

## 3. Étape A — l'installation (la machine ne sert personne)

### A1. Livraison : numéro, IP, état
- Commande : le mail « server ready » de Hetzner, ou Robot (identifiants `ROBOT_USER` / `ROBOT_PASSWORD` de `secrets.env`,
  jamais affichés) : `curl -s -u "$ROBOT_USER:$ROBOT_PASSWORD" https://robot-ws.your-server.de/server` → `server_number`,
  `product` (AX42), `server_ip`, `dc`, `status`.
- Vérification : produit AX42, statut prêt, centre de données noté ; prix et conditions de résiliation LUS dans Robot
  (règle de Nico : tout vérifier sur le modèle précis).
- Retour arrière : aucun (lecture).

### A2. DNS (dès que l'IP est connue)
- Commande (Nico, Cloudflare) : enregistrement **A** `cloud-3` → `<IP>`, **nuage gris** (DNS only), aucun AAAA.
- Vérification : `nslookup cloud-3.fillsell.app 1.1.1.1` → `<IP>`.
- Retour arrière : supprimer l'enregistrement.

### A3. La puce, avant tout système
- Commande : si la machine est livrée sous le système de secours (ou pour le relancer) — clé connue de Robot
  (`GET /key` ; sinon `POST /key` avec `~/.ssh/fillsell_cloud_ed25519.pub`), empreinte MD5
  `ssh-keygen -E md5 -lf ~/.ssh/fillsell_cloud_ed25519.pub`, puis `POST /boot/<N>/rescue` (`os=linux`,
  `authorized_key[]=<empreinte>`) et `POST /reset/<N>` (`type=hw`). Dans le secours :
  `lspci -nnk | grep -A3 -Ei 'vga|display'` ; `ls -l /dev/dri` ; `nproc` ; `free -g` ; `lsblk -d`.
- Vérification : une carte **[1002:…] AMD/ATI** (la 780M) présente, pilote `amdgpu` ; 16 fils ; ~62 Go ; les disques NVMe.
  Noter s'il existe AUSSI une puce de carte mère (ASPEED [1a03:…]) : elle change les nœuds (`card0` / `card1`, A5).
- Échec (aucune puce AMD visible) : ARRÊT, rien installé, rien visité. Question à Hetzner (puce désactivée dans le
  BIOS ?) ou résiliation — Nico seul.

### A4. Ubuntu 24.04 (installimage)
- Si livrée déjà sous Ubuntu 24.04 avec notre clé : `SSH3 'lsb_release -ds; uname -r; grep -c nomodeset /proc/cmdline'`
  (attendu : 24.04, noyau 6.8, `0`) → passer en A5.
- Sinon, dans le secours : `installimage` → Ubuntu 24.04 (noble, base) ; dans l'éditeur : `HOSTNAME cloud-3`, les deux
  disques NVMe en RAID 1 logiciel (`SWRAID 1`, `SWRAIDLEVEL 1`), partitions par défaut (ESP comprise),
  `USE_KERNEL_MODE_SETTING yes` (jamais `nomodeset`) ; enregistrer, `reboot`.
- Vérification : `ssh-keygen -R <IP>` puis `SSH3 'lsb_release -ds; uname -r; cat /proc/mdstat; grep -c nomodeset /proc/cmdline'`.
- Retour arrière : secours + installimage de nouveau (disque vide : rien à perdre).

### A5. Le poste à vraie puce (comme cloud-2)
- Commande : `SSH3 'sh -s' < serveur-cloud/deploiement/gpu/preparer-poste-gpu.sh` puis `SSH3 reboot`.
  (Docker, compose, pare-feu `ufw` 22/80/443, fail2ban, bureau XFCE ouvert pour `bureau` uid 1000, français, Paris,
  sortie `video=HDMI-A-1:1920x1080@60e` forcée.)
- Vérification après le redémarrage :
  ```bash
  SSH3 'timedatectl | grep "Time zone"; systemctl is-active docker lightdm fail2ban; docker compose version; ufw status | head -8
        for c in /sys/class/drm/card[0-9]; do echo "$c $(cat $c/device/vendor)"; done; ls -l /dev/dri
        for s in /sys/class/drm/card*-*/status; do echo "$s $(cat $s)"; done; getent group video render
        lspci -D | grep -Ei "vga|display"; dmesg | grep -i amdgpu | tail -20'
  ```
  Attendu : Europe/Paris ; docker, lightdm, fail2ban actifs ; la carte `0x1002` = `cardX` (noter X : c'est
  `GPU_PERIPHERIQUES=cardX,renderD128`), un connecteur de la carte AMD « connected » (forcé) ; aucun échec amdgpu
  (micrologiciel, `ring … timeout`) ; noter les gid `video` et `render` (→ `GPU_GROUPES`).
- Retour arrière : A4 (réinstallation).

### A6. L'écran du bureau PAR LA RADEON (le script est écrit pour l'Intel : à adapter sur la machine)
`preparer-poste-gpu.sh` a été écrit pour l'UHD 630/770 : nom de sortie X `HDMI-1` dans `/usr/local/bin/fillsell-ecran.sh`.
Sous le pilote X `amdgpu`, les sorties s'appellent souvent autrement (`HDMI-A-0`, `DisplayPort-0`) : on LIT, on ne devine pas.
- Lecture : `SSH3 'sudo -u bureau DISPLAY=:0 xrandr -q; sudo -u bureau DISPLAY=:0 glxinfo -B | grep -E "renderer|Accelerated|version"'`
- Attendu : écran 1920×1080 ; `OpenGL renderer string: AMD Radeon … (radeonsi, gfx110…)` ; `Accelerated: yes`.
- Corrections (une à la fois, relire après chacune ; retour arrière = le fichier d'avant, `systemctl restart lightdm`) :
  1. Sortie mal nommée : remplacer `HDMI-1` par le nom lu dans `/usr/local/bin/fillsell-ecran.sh`, `systemctl restart lightdm`.
  2. Rendu `llvmpipe` ou une puce de carte mère servant l'écran : `/etc/X11/xorg.conf.d/10-radeon.conf` =
     `Section "Device"` / `Identifier "Radeon"` / `Driver "amdgpu"` / `BusID "PCI:<bus>:<dev>:<fn>"` (en DÉCIMAL, lu dans
     `lspci -D`, ex. `c5:00.0` → `PCI:197:0:0`) / `EndSection`, puis `systemctl restart lightdm`.
  3. Aucun connecteur AMD : ajouter `amdgpu.virtual_display=<0000:bus:dev.fn>,1` à `GRUB_CMDLINE_LINUX` (pas
     `…_DEFAULT` : réécrite par `/etc/default/grub.d/hetzner.cfg`), `update-grub`, `reboot` ; retour arrière : retirer le
     paramètre, `update-grub`, `reboot`.
- Échec après 1-3 (toujours `llvmpipe` / SwiftShader) : ARRÊT, aucune plateforme ; Nico décide (Hetzner ou résiliation).

### A7. La clé de l'extension et un `.env` FERMÉ, posés AVANT le premier déploiement
⛔ `deployer.sh` copie `env.exemple` quand `/srv/fillsell-cloud/.env` n'existe pas, puis lance l'orchestrateur avec
`SERVEUR_NOM=cloud-1`, `COMPTES_AUTORISES=` le compte de Nico et `ENTRETIEN_POOL=1` : la nouvelle machine battrait sous le
nom de cloud-1 (domaine de cloud-1 réécrit dans `cloud_serveurs`) et tiendrait le pool en même temps que lui. Le `.env`
est donc écrit à la main AVANT. (06/11 : CORRIGÉ dans le dépôt — `deployer.sh` refuse un serveur sans `.env` si
`SERVEUR_NOM` n'est pas donné, écrit alors un `.env` FERMÉ par `outils/env-premier.sh`, et refuse un nom différent de
celui du `.env` en place ; `selftest:deployer-nom-serveur`. A7 reste utile pour les autres réglages de l'essai.)
- Commandes :
  ```bash
  SSH3 'mkdir -p /srv/fillsell-cloud/deploiement && test ! -e /srv/fillsell-cloud/.env && echo "aucun .env : bien"'
  scp -i ~/.ssh/fillsell_cloud_ed25519 /c/Users/nicol/fillsell-cloud-proto/extension-key.pem root@<IP>:/srv/fillsell-cloud/cle-extension-cloud.pem
  scp -i ~/.ssh/fillsell_cloud_ed25519 serveur-cloud/deploiement/env.exemple root@<IP>:/srv/fillsell-cloud/.env
  SSH3 'set -e; F=/srv/fillsell-cloud/.env; chmod 600 $F /srv/fillsell-cloud/cle-extension-cloud.pem
    sed -i "s#^TICKETS_CLE=.*#TICKETS_CLE=$(openssl rand -base64 32)#; s#^SERVEUR_NOM=.*#SERVEUR_NOM=cloud-3#;
      s#^DOMAINE=.*#DOMAINE=cloud-3.fillsell.app#; s#^COMPTES_AUTORISES=.*#COMPTES_AUTORISES=00000000-0000-0000-0000-000000000000#;
      s#^ENTRETIEN_POOL=.*#ENTRETIEN_POOL=0#; s#^NAVIGATEURS_MAX=.*#NAVIGATEURS_MAX=4#;
      s#^MEMOIRE_NAVIGATEUR=.*#MEMOIRE_NAVIGATEUR=<valeur de cloud-2, 2.2>#;
      s#^ENREGISTREMENT_FOND=.*#ENREGISTREMENT_FOND=1#; s#^ENREGISTREMENT_CONNEXIONS=.*#ENREGISTREMENT_CONNEXIONS=1#;
      s#^GPU_PERIPHERIQUES=.*#GPU_PERIPHERIQUES=<cardX>,renderD128#" $F
    printf "NAVIGATEUR_GPU=1\nGPU_GROUPES=%s\nSERVEUR_IPV4=<IP>\n" "$(getent group video render | cut -d: -f3 | paste -sd,)" >> $F'
  ```
  `NAVIGATEURS_MAX=4` : pendant l'essai, cloud-3 n'attire aucun compte neuf (la base donne un compte au serveur le plus
  libre ; cloud-2 a plus de place) ; les navigateurs de charge (§ 7) ne passent pas par l'orchestrateur et n'en dépendent pas.
- Vérification (aucun secret affiché) :
  `SSH3 "grep -E '^(SERVEUR_NOM|DOMAINE|COMPTES_AUTORISES|ENTRETIEN_POOL|NAVIGATEURS_MAX|MEMOIRE_NAVIGATEUR|NAVIGATEUR_GPU|GPU_GROUPES|GPU_PERIPHERIQUES|SERVEUR_IPV4|ENREGISTREMENT_FOND|ENREGISTREMENT_CONNEXIONS|IPROYAL_ACHATS_AUTORISES|ALERTES_MAIL|ENDURANCE)=' /srv/fillsell-cloud/.env; grep -c '^TICKETS_CLE=.' /srv/fillsell-cloud/.env"`
  → cloud-3, compte inexistant, `ENTRETIEN_POOL=0`, achats 0, alertes 0, endurance 0, TICKETS_CLE posée (1).
  Clé de l'extension : `openssl pkey -in /srv/fillsell-cloud/cle-extension-cloud.pem -pubout | sha256sum` identique sur
  cloud-3 et cloud-2.
- Retour arrière : `rm /srv/fillsell-cloud/.env /srv/fillsell-cloud/cle-extension-cloud.pem`.

### A8. La clé du coffre = celle de cloud-2 (barrière dure)
Une clé différente rendrait le coffre illisible à cloud-3 ; sa première sauvegarde réécrirait alors les lignes du compte
avec une clé que cloud-2 ne lit pas. `deployer.sh` reprend `COFFRE_CLE` et sa version de `secrets.env` : on prouve
d'abord que c'est la même que celle de cloud-2 (empreintes seulement).
- Commandes :
  ```bash
  SSH2 "grep '^COFFRE_CLE=' /srv/fillsell-cloud/.env | cut -d= -f2- | sha256sum | cut -c1-16; grep '^COFFRE_CLE_VERSION=' /srv/fillsell-cloud/.env"
  grep '^COFFRE_CLE=' /c/Users/nicol/fillsell-cloud-proto/secrets.env | cut -d= -f2- | tr -d '\r' | sha256sum | cut -c1-16
  grep '^COFFRE_CLE_VERSION=' /c/Users/nicol/fillsell-cloud-proto/secrets.env
  ```
- Vérification : mêmes 16 caractères, même version. Si cloud-2 porte `COFFRE_CLES_ANCIENNES` (compte 1 en 2.2) :
  `SSH2 "grep '^COFFRE_CLES_ANCIENNES=' /srv/fillsell-cloud/.env" | SSH3 "cat >> /srv/fillsell-cloud/.env"` (jamais affiché).
- Échec (empreintes différentes) : ARRÊT avant A9, question à Nico. Après A9, relire la même empreinte sur cloud-3.

### A9. Le déploiement (dossier principal, arbre propre)
- Commandes :
  ```bash
  cd /c/Users/nicol/fill-and-sell && git status --porcelain -- serveur-cloud supabase/functions/_shared/cloud-pool.js src/cloud/connexion
  git log -1 --format=%h -- serveur-cloud            # = le commit de cloud-2 (2.2)
  SERVEUR_NOM=cloud-3 bash serveur-cloud/outils/deployer.sh <IP> cloud-3.fillsell.app   # refus si le .env dit autre chose
  ```
- Vérification : la sortie dit `déployé : <sha> sur cloud-3.fillsell.app`, « clé du coffre reprise de secrets.env,
  version N », « jeton IPRoyal repris », « clés Supabase posées », puis `santé : {…}` ;
  `SSH3 'cd /srv/fillsell-cloud/deploiement && docker compose ps && docker compose logs --tail 40 orchestrateur | grep -E "demarrage|erreur|alerte"'`
  → `demarrage` avec `serveur: cloud-3`, `comptes_autorises: 1`, `capacite: 4` ;
  `SSH3 "grep -c '^IMAGE_CHROME=fillsell-chrome:' /srv/fillsell-cloud/.env; ls -l /srv/fillsell-cloud/extension-crx/"`
  → 1 (moteur Chrome officiel) et `fillsell-cloud.crx` présent ; `curl -s https://cloud-3.fillsell.app/sante`.
- Retour arrière : `SSH3 'cd /srv/fillsell-cloud/deploiement && docker compose stop orchestrateur'` (la machine ne sert
  personne ; rien en base n'a bougé hors du battement).

### A10. Le pare-feu de sortie (point 14 : une sortie directe depuis une IP Hetzner est refusée par Depop)
- Commandes (après le premier entretien, 60 s après le démarrage) :
  ```bash
  SSH3 'iptables -S FILLSELL-NAV; iptables -S DOCKER-USER | grep br-fillsell; iptables -S INPUT | grep br-fillsell
        ip6tables -S FORWARD | grep br-fillsell; cat /srv/fillsell-cloud/etat/pare-feu.json; cat /proc/sys/kernel/random/boot_id
        wc -l < /srv/fillsell-cloud/etat/proxys-permis.txt; systemctl is-enabled fillsell-pare-feu.service fillsell-pare-feu-maj.path'
  SSH3 'docker run --rm --network fillsell-cloud curlimages/curl -m 8 -sS -o /dev/null -w "%{http_code}\n" https://www.depop.com/; echo "sortie $?"'
  ```
- Vérification : `FILLSELL-NAV` = `-o br-fillsell -j DROP` (07/11 soir : un conteneur ne joint aucun autre — plus de
  `-d 172.31.0.0/24`), ESTABLISHED, UNE ligne `-d <ip> --dport <port>` par IP vivante du pool,
  puis `DROP` ; `pare-feu.json` : même `boot_id`, `"source":"etat"`, destinations = les IP du pool, `"entre_conteneurs":"ferme"`,
  `"pont_filtre":"1"` ; réseau `fillsell-cloud` avec `enable_icc=false` (docs/cloud/ETANCHEITE-CLOUD2.md) ; IPv6 `DROP` ; les deux
  unités `enabled` ; le `curl` ÉCHOUE (nom introuvable ou délai : aucun code HTTP) — aucun contact avec Depop.
- Échec : `docker compose stop orchestrateur`, `sh /srv/fillsell-cloud/deploiement/pare-feu-navigateurs.sh`, relire ;
  aucun compte tant que ce n'est pas vert.

### A11. Google Chrome officiel par la Radeon — contrôle HORS RÉSEAU (comme cloud-2 le 04/11)
Règle (rapport machine-cloud-3010 § 9) : avant toute plateforme, le rendu ANGLE doit nommer la vraie carte ; sinon
résiliation sans aucune visite.
- Commande (profil jetable, proxy mort, compte fictif) :
  ```bash
  SSH3 'cd /srv/fillsell-cloud/deploiement && docker compose stop orchestrateur \
    && docker compose run --rm --no-deps -T orchestrateur node outils/essai-me-connecter.mjs \
         00000000-0000-4000-8000-00000000a5a5 /srv/fillsell-cloud/etat/essais/verif-ax42 --verifier; \
    docker rm -f fs-nav-00000000-0000-4000-8000-00000000a5a5 2>/dev/null; docker compose up -d orchestrateur'
  ```
- Vérification (`etat/essais/verif-ax42/verification.json`) : `puce.appareils` nomme l'AMD ; `puce.rendu` = Radeon
  (radeonsi) ; `webgl` et `gpu_compositing` = `enabled` ; `page.webgl` = « ANGLE (AMD, … Radeon … , OpenGL 4.6) » (le nom
  exact est relevé tel quel) — JAMAIS SwiftShader ni llvmpipe ; écran 1920×1080 ; `Europe/Paris` ;
  langues `fr-FR, fr, en-US, en` ; `pdf: true`, 5 plugins ; `coeurs: 16` (32 sur cloud-2) ; `webdriver: false` ;
  `extension` = `chrome-extension://dnankhhfellobiobloopcjgkdioblpjd/…`.
- Retour arrière : rien à défaire (profil jetable effacé par l'outil).

### A12. Le battement sans effet sur les comptes
- `REQ` : la ligne `cloud-3` de `cloud_serveurs` (actif, `capacite` 4, `vu_le` < 2 min, domaine `cloud-3.fillsell.app`) ;
  `cloud_postes` : AUCUN compte passé à `cloud-3` ; `cloud_places_libres()` noté (+4 attendu).
- Échec (un compte attribué à cloud-3) : `docker compose stop orchestrateur`, rapport à Nico (après 15 min sans battement,
  la base le réattribue ; vérifier qu'il n'est pas tombé sur cloud-1, qui ne sert personne).

## 4. Étape B — les comptes et l'IP

### B1. `COMPTES_AUTORISES` = Ornella + les deux comptes de relecture (Nico n'y entre qu'à la bascule, § 8)
- Commande : `SSH3 'cp /srv/fillsell-cloud/.env /srv/fillsell-cloud/.env.avant-comptes-ax42 && sed -i "s#^COMPTES_AUTORISES=.*#COMPTES_AUTORISES=<uuid Ornella>,d6a9e726-b6f1-4b7f-a927-2487668d6d96,<uuid googlereview>#" /srv/fillsell-cloud/.env && cd /srv/fillsell-cloud/deploiement && docker compose up -d --force-recreate orchestrateur'`
- Vérification : journal `demarrage` → `comptes_autorises: 3` ; aucun navigateur ouvert (aucun de ces comptes n'est encore
  attribué à cloud-3). Les comptes de relecture restent AUSSI dans la liste de cloud-2 : un achat en bac à sable par un
  relecteur part sur le serveur le plus libre (cloud-2 pendant l'essai, `NAVIGATEURS_MAX=4` ici).
- Retour arrière : `cp .env.avant-comptes-ax42 .env`, même recréation.

### B2. L'IP d'Ornella (lecture du pool, aucun achat)
- `REQ` (2.2) : au moins une IP `disponible`, non réservée (l'IP 39 est RÉSERVÉE à Nico jusqu'au 03/12), échéance au-delà
  de la fin de l'essai + 7 jours de repos, `refus` vide de préférence (le 04/11, toutes les IP disponibles portaient un
  refus Beebs : la règle d'attribution les met en fin de file, elle ne les exclut pas).
- Si aucune ne convient : ARRÊT de l'étape B — accord ÉCRIT de Nico pour UNE IP (4 $), achat sur le serveur qui tient le
  pool : `docker compose exec -T orchestrateur node outils/acheter-une-ip.mjs` (le plan) puis
  `… --acheter --accord-ecrit="<phrase de Nico, avec sa date>"` ; attendre ~1 min AVANT
  `… node outils/controle-entree.mjs <ip_id>` (un contrôle trop tôt met l'IP au rebut, 04/11).
- Noter le fournisseur d'accès de l'IP retenue (point 14, (4) : refaire la mesure Depop `/vwdj/` sur un autre fournisseur
  que l'IP 42, Orange AS5511).

### B3. Ornella sur cloud-3 (script de réparation, feu vert NOMMÉ de Nico, accord d'Ornella)
- Le script (à écrire, 2.1-5a) : gardes (cloud-3 bat depuis < 5 min ; profil d'Ornella sans trace Cloud ; sauvegarde
  absente) ; sauvegarde `_backup_<jour>_essai_ax42_ornella` (colonnes Cloud et `beta_flags` d'avant, ligne `cloud_postes`
  s'il y en a une) ; `cloud_postes` (Ornella, `eteint`, `serveur = 'cloud-3'`) posé AVANT l'option, pour que
  `cloud_serveur_choisir` la garde sur cloud-3 ; puis `beta_flags.cloud = true`, `is_cloud = true`, `cloud_canal = 'offert'`
  (comme `20261030_cloud_nico_temoin_offert.sql`) ; relecture en fin de script. INVERSE : colonnes d'avant (l'IP part au
  repos par le déclencheur — chemin produit, jamais `cloud_ip_liberer`).
- Lancement : `npx supabase db query --linked -f scripts/reparations/<fichier>.sql`.
- Vérification : `REQ` `select is_cloud, cloud_canal, cloud_voie, beta_flags->>'cloud', public.cloud_etat(id)->>'etat' from
  public.profiles where id = '<uuid>'` → actif, `cloud_voie` vrai ; `select id, ip from public.cloud_ips where user_id = '<uuid>'`
  → une IP ; `select serveur, etat from public.cloud_postes where user_id = '<uuid>'` → `cloud-3` ; sur cloud-3 en 1-2 min :
  journal `poste_ouvert` (fb9cd238), `docker ps` → `fs-nav-<uuid>` ; verrou du relais : aucune plateforme permise (coffre
  vide) → aucune visite.
- Retour arrière : le script INVERSE (après B5 au plus tôt si les connexions sont faites : voir § 9).

### B4. « Me connecter » (Ornella, sur son téléphone)
- Geste : app à jour (2.9.160 ou plus), Réglages › Abonnement › « Connecter … » ; ou lien autonome de 30 min :
  `SSH3 'cd /srv/fillsell-cloud/deploiement && docker compose exec -T orchestrateur node outils/ticket.mjs <uuid Ornella>'`
  (transmis par Nico, jamais par mail de FillSell). Claude ne saisit aucun mot de passe.
- Vérification : seule la page de connexion s'ouvre ; la ligne « Connecté » s'allume ; `REQ`
  `select plateforme from public.cloud_coffre where user_id = '<uuid>'` → une ligne chiffrée par plateforme ;
  enregistrements `etat/essais/<plateforme>-…-connexion.jsonl` ; **Beebs** : la vérification de l'appareil doit passer
  SEULE (`/interstitial/` → `redirect`, comme cloud-2 le 04/11 à 18:44:16 ; cloud-1 recevait `captcha`) — journal
  `verification_passee_seule` ou lecture de l'enregistrement ; Leboncoin : idem.
- Échec : glissière ou « accès temporairement restreint » à la connexion = « environnement » noté, plateforme
  arrêtée, aucun nouvel essai sans Nico.

### B5. La tenue (12 à 24 h, cadence normale — rien de forcé)
Relevé de 5 s lancé (§ 6.1). Rapports au matin et au soir, lus dans :
```bash
SSH3 'D=/srv/fillsell-cloud/etat; cat $D/endurance/blocages.json 2>/dev/null; tail -5 $D/coupures-relais.jsonl
      F=$D/essais/fond-<uuid8>-<AAAA-MM-JJ>.jsonl; wc -l < $F
      grep "\"http\":403" $F | grep -o "\"suivi\":\"[a-z]*\"" | sort | uniq -c        # 403 par plateforme
      grep "\"http\":403" $F | grep -c "depop.com/vwdj/"                             # point 14
      grep -c "captcha-delivery.com/captcha" $F'                                     # cadres de glissière
```
`REQ` : `platform_settings` → `cloud_verification` par plateforme ; `messagerie_releves` (pauses) d'Ornella.

## 5. Étape C — UNE publication par plateforme, puis son retrait

- Fiche : un vêtement d'Ornella (jamais cosmétique / soin : interdits Leboncoin), **999 €**, « ne pas acheter » dans la
  description, ses vraies photos. Publication par l'app (Ornella, ou Nico sur son téléphone) vers Vinted, Leboncoin,
  Beebs, Depop (Depop seulement si Ornella y a un compte — 2.2 ; sinon Depop attend la bascule de Nico). eBay passe par
  l'API : hors essai (le serveur n'y touche pas).
- Vérification par plateforme (`REQ`) : `select id, platform, action, status, handler_build, created_at, updated_at from
  public.cross_post_jobs where user_id = '<uuid>' and created_at > '<début>' order by created_at;` → `published`,
  `handler_build` en `…-cloud`, durée prise → publiée ; le lien de l'annonce ouvert DANS LE CHROME DE NICO (jamais
  WebFetch pour Vinted) ; aucun doublon ; signes anti-robot (B5) inchangés. Beebs : numéro rendu + « en cours de
  vérification » dans « Mes annonces » (décision 2.1-4). Leboncoin : l'annonce peut attendre la validation de Leboncoin
  avant d'avoir son lien.
- Le **retrait** (les 4) se fait SOUS CHARGE, au plus haut palier vert de l'étape E (geste réel mesuré sous charge) :
  depuis l'app ; vérification : job de retrait fait, ancienne page 404/410 dans le Chrome de Nico, absente de « Mes
  annonces ». Si l'étape E s'arrête au premier palier : retraits faits sans charge, le jour même.
- Retour arrière : le retrait lui-même ; une annonce restée en ligne à la fin = retrait par l'app, jamais à la main en base.

## 6. Étape D — les mesures

### 6.1 Le relevé de 5 s (pas dans le dépôt : écrit ici ; même méthode que le point 16 de cloud-2)
`SSH3` puis :
```bash
cat > /usr/local/bin/fs-mesure-ax42.sh <<'F'
#!/bin/sh
# Essai AX42 (lecture seule) : toutes les 5 s, chaque navigateur (cgroup) et l'hôte (CPU, mémoire, Radeon).
D=/srv/fillsell-cloud/etat/essais; mkdir -p "$D"
P=""; for c in /sys/class/drm/card[0-9]*; do
  [ "$(cat "$c/device/vendor" 2>/dev/null)" = 0x1002 ] && [ -e "$c/device/gpu_busy_percent" ] && P="$c/device" && break; done
PT=""; PI=""
while :; do
  J=$(date +%F); T=$(date +%FT%T); N="$D/ax42-navigateurs-$J.csv"; H="$D/ax42-hote-$J.csv"
  [ -s "$N" ] || echo "le;nom;mem_mo;anon_mo;shmem_mo;fichiers_mo;inactifs_mo;pointe_mo;cpu_usec;bride_n;bride_usec;pids;oom" > "$N"
  [ -s "$H" ] || echo "le;cpu_pct;charge1;dispo_mo;gpu_pct;vram_mo;gtt_mo;navigateurs" > "$H"
  docker ps --no-trunc --format '{{.ID}} {{.Names}}' | grep -E ' fs-(nav|charge)-' | while read -r ID NOM; do
    C=/sys/fs/cgroup/system.slice/docker-$ID.scope; [ -d "$C" ] || C=/sys/fs/cgroup/docker/$ID; [ -d "$C" ] || continue
    M=$(awk '$1=="anon"{a=$2}$1=="shmem"{s=$2}$1=="file"{f=$2}$1=="inactive_file"{i=$2}END{printf "%d;%d;%d;%d",a/1048576,s/1048576,f/1048576,i/1048576}' "$C/memory.stat")
    U=$(awk '$1=="usage_usec"{u=$2}$1=="nr_throttled"{n=$2}$1=="throttled_usec"{t=$2}END{printf "%s;%s;%s",u,n,t}' "$C/cpu.stat")
    echo "$T;$NOM;$(( $(cat "$C/memory.current") / 1048576 ));$M;$(( $(cat "$C/memory.peak" 2>/dev/null || echo 0) / 1048576 ));$U;$(cat "$C/pids.current");$(awk '$1=="oom_kill"{print $2}' "$C/memory.events")" >> "$N"
  done
  read -r _ u n s i w q sq st _ < /proc/stat; TOT=$((u+n+s+i+w+q+sq+st)); IDL=$((i+w)); CPU=""
  [ -n "$PT" ] && [ "$TOT" -gt "$PT" ] && CPU=$(( 100 * ((TOT-PT) - (IDL-PI)) / (TOT-PT) )); PT=$TOT; PI=$IDL
  G=";;"; [ -n "$P" ] && G="$(cat $P/gpu_busy_percent);$(( $(cat $P/mem_info_vram_used) / 1048576 ));$(( $(cat $P/mem_info_gtt_used) / 1048576 ))"
  NB=$(docker ps -q --filter name=fs-nav- --filter name=fs-charge- | wc -l)
  echo "$T;$CPU;$(cut -d' ' -f1 /proc/loadavg);$(awk '/^MemAvailable/{print int($2/1024)}' /proc/meminfo);$G;$NB" >> "$H"
  sleep 5
done
F
chmod 755 /usr/local/bin/fs-mesure-ax42.sh && systemd-run --unit=fs-mesure-ax42 --property=Nice=10 /bin/sh /usr/local/bin/fs-mesure-ax42.sh
```
- Vérification : 15 s plus tard, `tail -3 /srv/fillsell-cloud/etat/essais/ax42-*-$(date +%F).csv` → lignes neuves, `gpu_pct`
  rempli (sinon : `ls /sys/class/drm/card*/device/gpu_busy_percent`).
- Arrêt / retour arrière : `systemctl stop fs-mesure-ax42` (les CSV restent).
- Lecture (médiane, p95, max d'un compte ; `F` = le CSV du jour, `n` = `fs-nav-<uuid>`) :
  ```bash
  awk -F';' -v n=fs-nav-<uuid> '$2==n{print $4+$5}' $F | sort -n | awk '{v[NR]=$1}END{print "anon+shmem Mo : médiane",v[int((NR+1)/2)],"p95",v[int(NR*0.95)],"max",v[NR],"points",NR}'
  awk -F';' -v n=fs-nav-<uuid> '$2==n{print $3}'    $F | sort -n | awk '{v[NR]=$1}END{print "total Mo : médiane",v[int((NR+1)/2)],"p95",v[int(NR*0.95)],"max",v[NR]}'
  awk -F';' -v n=fs-nav-<uuid> '$2==n{if(p!="")print ($9-p)/50000; p=$9}' $F | sort -n | awk '{v[NR]=$1}END{print "CPU % d un cœur : médiane",v[int((NR+1)/2)],"p95",v[int(NR*0.95)],"max",v[NR]}'
  ```
  (cache de fichiers = `fichiers_mo` ; « pointe vue par le noyau » = `pointe_mo` ; bridage par le plafond de 1,5 cœur du
  conteneur = `bride_n` qui monte.) Hôte, sur une fenêtre : `awk -F';' '$1>="<début>" && $1<"<fin>"' ax42-hote-<jour>.csv`.
- Comparaison simultanée (2.1-6) : le relevé de cloud-2 du 05/11 (`/usr/local/bin/fs-memoire.sh`, ARRÊTÉ depuis le 05/11
  15:45) relancé le temps de l'essai, ou ce même script copié sur cloud-2 (la ligne de la Radeon y reste vide).

### 6.2 Ce qui est comparé à cloud-2
| Mesure | cloud-2 (i9-13900, UHD 770, 32 fils) | cloud-3 (relevé) |
|---|---|---|
| Mémoire d'un compte, anon + shmem | médiane 745 Mo, p95 905, max 1 063 (05/11, 5 s) | relevé 6.1 |
| Mémoire totale d'un compte | médiane 1 060 Mo, p95 1 216, max 1 357 ; pointe noyau 1 661 | relevé 6.1 |
| Cache de fichiers | médiane 270 Mo | relevé 6.1 |
| CPU d'un compte | non relevé en continu (« presque au repos ») | relevé 6.1 ; cloud-2 en simultané si 2.1-6 |
| WebGL | « ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL 4.6) », 32 cœurs | A11 |
| Signes anti-robot sur 24 h | Vinted 0 ; Leboncoin 0 depuis la correction du 04/11 22:18 ; Beebs vérification passée seule ; Depop 151 × 403 non bloquants (`/vwdj/`, pré-vols) | B5 |
| Coupures du relais | 4 sur la journée du 05/11 (une ressource chacune) | `coupures-relais.jsonl` |
| Gestes | 05/11 : Vinted 10-23 s hors ligne, Depop 3-6 min, Beebs 3-9 min, Leboncoin 6 min (republications) | durées de l'étape C |

### 6.3 Critères chiffrés (proposés — Nico les valide ou les corrige en 2.1-1)
**Réussite** (tous) :
1. A11 : WebGL ANGLE par la Radeon, composition et rastérisation par la puce.
2. A10 : aucune sortie des navigateurs hors des proxys du pool.
3. B4-B5 : 4 connexions sans glissière ; sur la tenue, aucune glissière ni « accès restreint » ; 403 seulement ceux déjà
   connus comme non bloquants (Depop `/vwdj/` et pré-vols, page 404 Beebs « en vérification ») ; Beebs : vérification de
   l'appareil passée seule.
4. C : 4 publications acceptées par les plateformes (Beebs : dépôt reçu), 4 retraits confirmés, aucun doublon, durées
   au plus 1,5 × celles de cloud-2.
5. Mémoire d'un compte réel : anon + shmem médiane ≤ 900 Mo et total p95 ≤ 1,5 Go (cloud-2 + 20-25 %) ; `oom` = 0.
**Échec** (un seul suffit) : rendu logiciel (SwiftShader / llvmpipe) ; une plateforme qui bloque à la connexion ou
pendant la tenue sans cause de notre côté ; une sortie directe possible ; un `oom_kill` d'un compte réel.

## 7. Étape E — la charge progressive

Il n'y a que deux comptes réels possibles (Ornella, Nico) et les comptes de relecture n'ont aucune plateforme : les
paliers au-delà sont des **navigateurs de charge** — la MÊME image Chrome, les mêmes plafonds que la production
(`specConteneurChrome` : 1,5 cœur, `MEMOIRE_NAVIGATEUR`, 512 Mo de mémoire partagée, 768 processus, puce et écran du
bureau, réseau `fillsell-cloud` filtré), un proxy MORT (`http://verification:morte@127.0.0.1:9` : rien ne sort), aucun
compte, aucune plateforme, une page locale qui anime l'écran (canvas 2D + 60 éléments animés : majorant pour la puce) et
garde un lest de mémoire (600 Mo par défaut, `#lest=<Mo>` pour un autre essai : un compte réel tient ~745 Mo non
récupérables). Ils ne portent pas
l'étiquette `fillsell.cloud` : l'orchestrateur ne les voit pas, ne les compte pas, ne les arrête pas.

### E1. La page et le lanceur
```bash
SSH3 'mkdir -p /srv/fillsell-cloud/charge && cat > /srv/fillsell-cloud/charge/charge.html' <<'F'
<!doctype html><html lang="fr"><meta charset="utf-8"><title>Charge AX42</title>
<style>body{margin:0;overflow:hidden;font:14px sans-serif}.b{position:absolute;width:140px;height:90px;border-radius:12px;
background:linear-gradient(45deg,#d33,#33d);box-shadow:0 6px 18px rgba(0,0,0,.4);animation:m 4s ease-in-out infinite alternate}
@keyframes m{to{transform:translate(800px,420px) rotate(360deg)}}</style>
<canvas id="c" width="1366" height="768" style="position:absolute;inset:0"></canvas>
<script>
const mo = Number((location.hash.match(/lest=(\d+)/) || [])[1] || 600), lest = [];   // 600 Mo par défaut
for (let k = 0; k < mo / 8; k++) { const a = new Float64Array(1048576); a.fill(k); lest.push(a); }
for (let k = 0; k < 60; k++) { const d = document.createElement('div'); d.className = 'b'; d.style.left = (k * 37 % 1100) + 'px';
  d.style.top = (k * 53 % 600) + 'px'; d.style.animationDelay = (-k / 15) + 's'; document.body.appendChild(d); }
const g = document.createElement('canvas').getContext('webgl'), e = g && g.getExtension('WEBGL_debug_renderer_info');
const rendu = e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'sans WebGL';
const x = document.getElementById('c').getContext('2d'); let t = 0;
(function f() { t++; x.clearRect(0, 0, 1366, 768); for (let k = 0; k < 400; k++) { x.fillStyle = 'hsl(' + ((k + t) % 360) + ',70%,50%)';
  x.beginPath(); x.arc((k * 97 + t * 3) % 1366, (k * 61 + t * 2) % 768, 8, 0, 6.283); x.fill(); } requestAnimationFrame(f); })();
setInterval(() => { document.title = 'Charge AX42 | ' + rendu + ' | ' + t; }, 1000);
</script></html>
F
SSH3 'cat > /usr/local/bin/fs-charge.sh' <<'F'
#!/bin/sh
# fs-charge.sh <de> <a> : lance les navigateurs de charge n° <de> à <a> (aucun réseau, aucun compte).
set -eu
. /srv/fillsell-cloud/deploiement/.env                      # VERSION_ORCHESTRATEUR (aucun secret dans ce fichier)
IMG=fillsell-chrome:$VERSION_ORCHESTRATEUR
MEM=$(grep '^MEMOIRE_NAVIGATEUR=' /srv/fillsell-cloud/.env | cut -d= -f2)
CARTE=$(grep '^GPU_PERIPHERIQUES=' /srv/fillsell-cloud/.env | cut -d= -f2 | cut -d, -f1)
for i in $(seq "$1" "$2"); do
  n=$(printf %02d "$i"); d=/srv/fillsell-cloud/charge/p$n
  mkdir -p "$d" && cp /srv/fillsell-cloud/charge/charge.html "$d/" && chown -R 1000:1000 "$d"
  docker run -d --name fs-charge-$n --label fillsell.charge=1 --network fillsell-cloud \
    --memory "$MEM" --cpus 1.5 --shm-size 512m --pids-limit 768 \
    --device /dev/dri/$CARTE --device /dev/dri/renderD128 \
    --group-add "$(getent group video | cut -d: -f3)" --group-add "$(getent group render | cut -d: -f3)" \
    -v "$d:/profil" -v /srv/fillsell-cloud/extension-crx:/extension-crx:ro -v /tmp/.X11-unix:/tmp/.X11-unix:ro \
    -e PROXY_AMONT=http://verification:morte@127.0.0.1:9 -e PROFIL=/profil -e PLATEFORMES_PERMISES= \
    -e JETON_CONTROLE=$(openssl rand -hex 16) -e PORT_CONTROLE=3130 \
    -e DISPLAY=:0 -e ECRAN_EXTERNE=1 -e "CHROME_ARGS_GL=--use-gl=angle --use-angle=gl" "$IMG" >/dev/null
  ip=$(docker inspect -f '{{(index .NetworkSettings.Networks "fillsell-cloud").IPAddress}}' fs-charge-$n)
  k=0; until curl -s -m 2 "http://$ip:9223/json/version" >/dev/null || [ $k -ge 30 ]; do k=$((k+1)); sleep 1; done
  curl -s -X PUT "http://$ip:9223/json/new?file:///profil/charge.html" >/dev/null
done
F
SSH3 'chmod 755 /usr/local/bin/fs-charge.sh'
```
- Lecture des images par seconde de chaque navigateur de charge (la puce partagée tient-elle ?) :
  ```bash
  lire() { for n in $(docker ps --filter label=fillsell.charge=1 --format '{{.Names}}'); do
    ip=$(docker inspect -f '{{(index .NetworkSettings.Networks "fillsell-cloud").IPAddress}}' $n)
    echo "$n $(curl -s http://$ip:9223/json/list | grep -o 'Charge AX42[^"]*' | awk -F' [|] ' '{print $NF}')"; done | sort; }
  lire > /tmp/a; sleep 10; lire > /tmp/b; join /tmp/a /tmp/b | awk '{print $1, ($3-$2)/10, "images/s"}'
  ```
  Le titre porte aussi le rendu WebGL : il doit rester la Radeon (un passage à SwiftShader = la puce a lâché).
- Retour arrière (à tout moment) : `docker rm -f $(docker ps -aq --filter label=fillsell.charge=1); rm -rf /srv/fillsell-cloud/charge/p*`.

### E2. Les paliers
Navigateurs ouverts au total (réels + charge) : **1** (Ornella seule : la référence) → **2** → **5** → **10** → **15** → **20**
→ **25** → **30** → **35** → **40** → **45**. Pour passer au palier suivant : `fs-charge.sh <de> <a>` (ex. de 1 à 2 réels+charge :
`fs-charge.sh 1 1` ; vers 5 : `fs-charge.sh 2 4` ; …). Chaque palier tient **20 min** (240 relevés de 5 s) avant la lecture.

**Un palier est VERT si, sur ses 20 min** (relevé 6.1 + E1) :
- hôte : CPU moyen ≤ 60 %, p95 ≤ 85 % ; charge moyenne ≤ 16 ; `MemAvailable` minimal ≥ 6 Go ; aucun `oom` nulle part ;
- Radeon : `gpu_pct` moyen ≤ 60 %, p95 ≤ 90 % ; navigateurs de charge ≥ 20 images/s (médiane) et toujours sur la Radeon ;
- compte réel : CPU et mémoire dans les bornes du § 6.3 ; bridage (`bride_n` qui monte) sur ≤ 10 % des relevés ; ses
  lectures de fond continuent (messagerie, veille, journal sans erreur neuve) ; aucun signe anti-robot neuf (B5) ;
  `docker logs --since 20m fs-nav-<uuid> 2>&1 | grep -ciE "gpu process|context lost"` = 0.

**Quand s'arrêter** : au premier palier ROUGE (on revient au palier d'avant : `docker rm -f` des derniers lancés), ou à 45
(estimation mémoire au p95 réel), ou au moindre signe anti-robot sur le compte réel (on retire TOUTE la charge, on note,
on ne relance pas sans Nico). **Comptes tenables** = min(dernier palier vert ; ⌊(mémoire totale − 4 Go − pointe de
`gtt_mo` + `vram_mo`) / total p95 réel⌋). Proposition de réglage pour la suite : `NAVIGATEURS_MAX` = ⌊0,8 × comptes
tenables⌋ (décision de Nico ; aujourd'hui la capacité automatique vient de `MEMOIRE_NAVIGATEUR`, flotte.js `capaciteServeur`).

Au plus haut palier vert : les **4 retraits** de l'étape C (gestes réels sous charge), durées comparées à la publication
faite au palier 1. Puis toute la charge retirée (E1, retour arrière) et `systemctl stop fs-mesure-ax42` après 20 min de
retour au calme.

## 8. Étape F — la bascule de comptes depuis cloud-2 : OUI ou NON (Nico seul)

**Par défaut : NON** pendant l'essai — Nico reste sur cloud-2, qui sert de référence simultanée. La bascule ne se fait que
sur l'ordre NOMMÉ de Nico, critères du § 6.3 verts, et toujours dans CET ordre :
1. Lectures : aucune tâche `processing` de Nico (`select count(*) from public.cross_post_jobs where user_id =
   'f44b5917-bccc-4431-ba41-f40571a2ed18' and status = 'processing'` = 0) ; cloud-3 bat ; `cloud_postes` de Nico =
   `cloud-2`.
2. cloud-3 : ajouter Nico à `COMPTES_AUTORISES` (copie `.env.avant-bascule-ax42`, recréation). Sans effet tant que la
   base l'attribue à cloud-2.
3. cloud-2 LÂCHE : `COMPTES_AUTORISES` sans Nico (il reste les deux comptes de relecture : jamais vide), copie
   `.env.avant-bascule-ax42`, `docker compose up -d --force-recreate orchestrateur` (vidange : la tâche en cours va au bout).
   Vérification : plus de `fs-nav-f44b5917…` sur cloud-2, coffre sauvegardé (journal), `cloud_postes` de Nico `eteint`.
   ⚠ Enchaîner l'étape 4 dans les 10 minutes : au-delà de 15 min, la base pourrait le donner au serveur le plus libre,
   cloud-1 compris (qui ne sert personne).
4. La base : script (2.1-5b) — gardes (poste de Nico `eteint` sur cloud-2, cloud-3 bat), sauvegarde, `cloud_postes.serveur
   = 'cloud-3'`. **Le coffre n'est PAS touché** (cloud-3 restaure les cookies du coffre dans un profil neuf sur son disque ;
   l'ancien profil reste intact sur le disque de cloud-2 : c'est le secours). L'IP ne change pas (42 ; la 39 reste
   réservée à Nico). Variante « profil neuf, aucun cookie repris » du 04/11 : SEULEMENT sur l'accord écrit de Nico
   (lignes du coffre sauvegardées puis retirées, il se reconnecte aux 4 plateformes).
5. cloud-3 REPREND : navigateur ouvert en 1-2 min (`poste_ouvert`), plateformes « Connecté » dans l'app ; s'il y a une
   vérification, « Résoudre » par Nico.
**Retour** : le miroir exact — cloud-3 lâche (Nico retiré de sa liste, recréation), INVERSE du script, cloud-2 reprend
(Nico remis dans sa liste, recréation). Au retour, une reconnexion peut être demandée par une plateforme ; jamais une purge.

## 9. Fin de l'essai et retour arrière global

- **AX42 gardée** : décision de Nico (rôle, capacité, `ENREGISTREMENT_FOND=0`, alertes) — hors de cet essai.
- **AX42 rendue**, dans cet ordre :
  1. charge retirée, relevé arrêté ;
  2. Ornella : soit gardée sur le Cloud et déplacée sur cloud-2 (même ordre qu'au § 8 : cloud-3 lâche, script, cloud-2
     reprend), soit sortie par le chemin produit — cloud-3 la retire d'abord de sa liste (navigateur fermé, coffre
     sauvegardé), PUIS le script INVERSE (IP au repos 7 jours, purge prouvée de SES connexions Cloud par l'entretien du
     serveur qui tient le pool ; son ordinateur reprend ses tâches). ⚠ La purge efface le profil sur le disque du serveur
     qui tient le pool (`entretien.js` → `navigateurs.detruire`, chemin local) : le profil d'Ornella sur le disque de cloud-3
     reste, et la preuve dira pourtant « ancien profil détruit » — l'effacer à la main sur cloud-3
     (`rm -rf /srv/fillsell-cloud/profils/<profil>`) AVANT de rendre la machine ;
  3. Nico : s'il a basculé, retour sur cloud-2 (§ 8) AVANT tout arrêt de cloud-3 ;
  4. `docker compose down` sur cloud-3 ; `cloud_serveurs` cloud-3 → `retire` (script 2.1-5c, sauvegarde, INVERSE) ;
     `cloud_places_libres()` relu ;
  5. DNS `cloud-3` supprimé ; résiliation dans Robot par Nico seul (conditions lues en A1).

## 10. Ce qui manque pour lancer

1. La validation de Hetzner (puis le numéro `<N>` et l'IP `<IP>`).
2. Les décisions de Nico du § 2.1 (feu vert, Ornella et son accord, DNS, Beebs, seuils, relevé simultané sur cloud-2).
3. Les scripts de réparation 2.1-5 (a, puis b et c si besoin), écrits et approuvés AVANT l'étape B.
4. Une IP du pool qui convient à Ornella (B2) — sinon l'accord écrit de Nico pour une IP.
5. Les lectures du § 2.2 refaites le jour J (identifiants complets d'Ornella et de googlereview, réglages de cloud-2,
   BUILD_ID de la copie Cloud, plateformes d'Ornella — Depop ?).
6. La disponibilité d'Ornella (connexions, annonce de test) ; à défaut, la variante « bascule de Nico » (§ 8) dès B.

## 11. Pièges vus en lisant le code (pour cet essai et pour la suite)

- **Premier déploiement d'un serveur neuf** : `deployer.sh` installe `env.exemple` tel quel (`SERVEUR_NOM=cloud-1`,
  compte de Nico, `ENTRETIEN_POOL=1`) quand le `.env` manque — d'où A7. CORRIGÉ le 06/11 (nom exigé, `.env` fermé : `outils/env-premier.sh`).
- **Clé du coffre** : un serveur dont `COFFRE_CLE` diffère réécrirait le coffre commun avec une clé que les autres ne
  lisent pas — d'où A8 (le déploiement ne recopie pas non plus `COFFRE_CLES_ANCIENNES`).
- **Purge et flotte** : la purge (entretien du serveur qui tient le pool) ne détruit que le profil présent sur SON
  disque ; pour un compte servi par un autre serveur, la preuve « ancien profil détruit » est fausse. À corriger avant
  l'ouverture à plusieurs serveurs (rapport à Nico).
- **Réattribution** : 15 min sans battement → le compte part au serveur vivant le plus libre, sans regarder
  `COMPTES_AUTORISES` ; cloud-1 bat encore en ne servant personne (à relire en 2.2) : un compte peut y rester bloqué.
- **Écran du poste à puce** : `preparer-poste-gpu.sh` et `fillsell-ecran.sh` nomment la sortie de l'Intel (`HDMI-1`) — A6.
