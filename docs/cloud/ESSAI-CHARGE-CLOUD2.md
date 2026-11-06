# FillSell Cloud — ESSAI DE CHARGE PROGRESSIVE SUR cloud-2 (préparé le 06/11/2026 soir, NON LANCÉ : feu vert de Nico)

Heures de Paris. Décision de Nico (06/11 soir) : cloud-2 est le serveur de l'ouverture ; la charge progressive, jamais
faite (paliers 1-2 seulement le 05/11, un seul compte réel), doit dire combien de comptes il tient et ce qui lâche EN
PREMIER : processeur, mémoire ou puce graphique. **Rien ici n'est lancé sans le feu vert de Nico.**

## 1. La machine et ce qui y tourne
- cloud-2 = enchère Hetzner 3104939, 5.9.80.213, Intel Core i9-13900 (32 fils), 62 Gio, Intel UHD 770 (Raptor Lake-S,
  8086:a780, i915, Mesa « iris »), Ubuntu 24.04, Google Chrome officiel par la puce (ANGLE / OpenGL).
- En service : orchestrateur `61fb7ddd6e2a`, Caddy, le navigateur du compte de Nico (`fs-nav-f44b5917-…`, plafonds de
  production : 2 Gio, 1,5 fil, 512 Mo de mémoire partagée, 768 processus). L'essai ne l'arrête jamais.
- Mesuré avant l'essai (un compte) : mémoire totale médiane 1 060 Mo (p95 1 216, pointe noyau 1 661) ; processeur moyen
  0,033 fil sur 18 h 43 (05/11 22:13 → 06/11 16:56), pointes bridées au plafond de 1,5 fil (3 639 × 100 ms) ; puce : 0 %
  au repos (intel_gpu_top, 06/11 17:15) — jamais mesurée en charge.

## 2. Ce qui est PRÊT (06/11 vers 17:20)
- `intel-gpu-tools` (1.28) installé sur cloud-2 : 2 paquets ajoutés (intel-gpu-tools, libdrm-nouveau2), AUCUNE mise à
  jour, aucun service redémarré (`NEEDRESTART_SUSPEND=1`) ; navigateur de Nico et orchestrateur restés « Up 19 hours ».
- Outils (dépôt `serveur-cloud/outils/charge/`, copiés dans `/srv/fillsell-cloud/charge/` sur cloud-2, NON démarrés) :
  - `charge.html` — la page d'un navigateur de charge (canvas + 60 éléments animés, lest de 750 Mo ≈ la mémoire non
    récupérable médiane d'un vrai compte ; le titre porte le rendu WebGL et un compteur d'images) ;
  - `fs-charge.sh <de> <a> [lest]` — lance les navigateurs de charge : MÊME image, MÊMES plafonds, MÊME puce, MÊME réseau
    filtré qu'un compte (navigateur.js), proxy MORT (rien ne sort), aucun compte, aucune plateforme, étiquette
    `fillsell.charge=1` (l'orchestrateur ne les voit pas) ;
  - `fs-mesure.sh` (5 s : chaque navigateur — mémoire, processeur, bridage, oom — et l'hôte) ;
  - `fs-mesure-gpu.sh` (5 s : `intel_gpu_top -c`, occupation du rendu 3D « RCS % », fréquence, RC6) ;
  - `lire-palier.py <début> <fin> --images` (chiffres du palier + images/s de chaque navigateur de charge + VERDICT) ;
  - `arreter-charge.sh` (retire toute la charge, à tout moment).

## 3. Lancement (sur feu vert de Nico seulement) — `SSH2` = `ssh -i ~/.ssh/fillsell_cloud_ed25519 root@5.9.80.213`
0. Lectures : aucune tâche `processing` du compte de Nico ; noter les signes anti-robot de la journée (base, fond) ;
   `SSH2 'docker ps --format "{{.Names}} {{.Status}}"'`.
1. Relevés : `SSH2 'systemd-run --unit=fs-mesure --property=Nice=10 /bin/sh /srv/fillsell-cloud/charge/fs-mesure.sh;
   systemd-run --unit=fs-mesure-gpu --property=Nice=10 /bin/sh /srv/fillsell-cloud/charge/fs-mesure-gpu.sh'`
   — vérifier 15 s plus tard : `tail -2 /srv/fillsell-cloud/etat/essais/charge-*-$(date +%F).csv`.
2. Palier 1 (référence : le compte de Nico seul), 20 min, puis `SSH2 'python3 /srv/fillsell-cloud/charge/lire-palier.py
   <début> <fin>'`.
3. Paliers suivants — navigateurs AU TOTAL (réels + charge) : **2 → 5 → 10 → 15 → 20 → 25 → 30 → 35 → 40 → 45**.
   Passer au palier suivant = `SSH2 'sh /srv/fillsell-cloud/charge/fs-charge.sh <de> <a>'` (vers 2 : `1 1` ; vers 5 :
   `2 4` ; vers 10 : `5 9` ; … ; vers 45 : `40 44`). Chaque palier tient **20 min**, puis
   `lire-palier.py <début> <fin> --images`.
4. Fin : `SSH2 'sh /srv/fillsell-cloud/charge/arreter-charge.sh'`, 20 min de retour au calme, puis
   `SSH2 'systemctl stop fs-mesure fs-mesure-gpu'`. Les CSV restent dans `/srv/fillsell-cloud/etat/essais/`.
Durée : ~3 h 40 pour les 11 paliers (moins si un palier est rouge).

## 4. Un palier est VERT si, sur ses 20 min (seuils écrits dans `lire-palier.py`)
- hôte : processeur moyen ≤ 60 %, p95 ≤ 85 % ; charge moyenne ≤ 32 (fils) ; mémoire disponible minimale ≥ 6 Gio ;
- puce : rendu 3D moyen ≤ 60 %, p95 ≤ 90 % ; navigateurs de charge ≥ 20 images/s (médiane), rendu toujours Intel
  (jamais SwiftShader / llvmpipe) ;
- compte de Nico : bridé au plafond sur ≤ 10 % des relevés ; aucun oom ; aucun signe anti-robot neuf ;
  `docker logs --since 20m fs-nav-f44b5917-bccc-4431-ba41-f40571a2ed18 2>&1 | grep -ciE "gpu process|context lost"` = 0.

**Arrêt** : au premier palier ROUGE (retour au palier d'avant : `docker rm -f` des derniers lancés), à 45, ou au
moindre signe anti-robot sur le compte de Nico (toute la charge retirée, on note, on ne relance pas sans Nico).
**Ce qui lâche en premier** = la première règle rouge (processeur, mémoire ou puce). **Comptes tenables** =
min(dernier palier vert ; règle des 2 Gio réservés : ⌊(62 − 4) / 2⌋ = 29 — la capacité automatique d'aujourd'hui est
30). Au-delà de 30, l'essai dit seulement si la mémoire RÉELLE laisserait monter `NAVIGATEURS_MAX` (décision de Nico).

## 5. Garde-fous
- Le compte de Nico est le seul compte réel sur la machine : un palier qui le gêne (bridage, lenteur d'une tâche,
  anti-robot) arrête l'essai. Aucune publication forcée pendant l'essai : sa cadence normale continue.
- Les navigateurs de charge ne sortent pas (proxy mort + pare-feu FILLSELL-NAV) : aucune plateforme, aucun compte.
- Aucun redémarrage de l'orchestrateur ni de Caddy ; aucune écriture en base.
