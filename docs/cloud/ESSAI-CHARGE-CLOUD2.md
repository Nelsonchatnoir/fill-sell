# FillSell Cloud — ESSAI DE CHARGE PROGRESSIVE SUR cloud-2 (06/11/2026 : lancé à 17:37:15, ARRÊTÉ par Nico à 18:25 — plus d'essai, la charge se mesure en réel)

> **06/11 soir, feu vert de Nico — ses consignes** : arrêt immédiat au premier palier ROUGE ou au moindre signe anti-robot sur
> son compte (connexion demandée, captcha, restriction) ; aucun accès sortant des navigateurs de charge, vérifié avant le
> palier 2 ; son compte tourne normalement, rien n'est interrompu ; à la fin comme à l'arrêt, toute la charge retirée et
> cloud-2 vérifié revenu à son état de départ. Deux outils ajoutés pour les tenir (06/11 17:37-17:45) :
> - `garde-charge.sh <compte>` (unité `fs-garde-charge`, toutes les 10 s) : retire toute la charge AU PREMIER signe — requête
>   DataDome neuve dans l'enregistrement de fond, `blocages.json` modifié, événement `verification_*` /
>   `connexion_acces_restreint` / glissière de l'orchestrateur, oom ou remplacement du navigateur du compte, « GPU process » /
>   « context lost », mémoire disponible de l'hôte < 6 Gio ;
> - `derouler-charge.sh <début palier 1> [<sa fin>]` (unité `fs-derouler-charge`) : déroule les paliers SEUL sur le serveur
>   (le minuteur du PC a été coupé à 17:43 faute de mémoire sur le poste), sonde ACTIVE de sortie sur `fs-charge-01` avant le
>   palier 2, contrôle des connexions établies de chaque navigateur de charge à chaque palier, arrêt au premier ROUGE, puis
>   retour au calme lu, relevés arrêtés, état final écrit (`charge-etat-fin.txt`, à comparer à l'état de départ de 17:37:03).

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

## 6. Ce qui s'est passé le 06/11 (17:37 → 18:26) — ARRÊTÉ par Nico : la page de charge ne mesurait rien de réel
Tous les chiffres ci-dessous sont mesurés avec l'ANCIENNE page (`charge.html`, animée en continu à 60 images/s) ;
`etat/essais/charge-palier-*.json` sur cloud-2.
| Palier | Fenêtre | Hôte : processeur moy. / mémoire dispo min. | Puce (rendu 3D moy.) | Navigateur de Nico | Verdict |
|---|---|---|---|---|---|
| 1 (Nico seul) | 17:37:20 → 17:57:27 | 0 % / 61,2 Go | 0,0 % | 1 360 Mo, bridé 8,6 % des relevés | VERT |
| 2 (+1 charge) | 17:58:12 → 18:18:13 | 2 % / 59,9 Go | **18,3 %** | 1 349 Mo, bridé 9,0 % | VERT |
| 5 (+4 charge), interrompu | 18:18:57 → ~18:24 | 9,1 % / 56,2 Go | **65,2 %** | 1 288 Mo, bridé 8,3 % | ROUGE (puce) |
- La sonde de sortie avant le palier 2 (17:57:42) : rien ne sort de `fs-charge-01` (direct 1.1.1.1:443 et 8.8.8.8:53, relais
  vers example.com) ; le résolveur DNS de Docker répond aux noms (une requête DNS par l'hôte, aucune connexion) — vrai aussi
  pour un navigateur de compte : la phrase « aucun DNS » de ce dossier est fausse pour le DNS de Docker.
- Lecture : un navigateur de charge animé = 18 % de la puce, un vrai compte = 0 % en moyenne. Le rouge du palier 5 ne dit
  RIEN de la capacité réelle. Mémoire d'un navigateur de charge : 1 256 Mo (médiane, lest 750 Mo) ; celle du compte de Nico
  1 288 à 1 360 Mo (cgroup), dont 836 à 926 Mo non récupérables.
- Garde (`garde-charge.sh`) muette de 17:37 à 18:25 : aucun signe anti-robot ; aucune tâche de Nico touchée ; aucune
  vérification posée en base.
- Décision de Nico (~18:30) : essai ARRÊTÉ ; ni page animée ni page fixe (`charge-reelle.html`, écrite, jamais lancée, retirée).
  L'essai représentatif (vrai code de l'extension, copies locales, rythme réel) a été chiffré (1,5 à 2 jours) puis ÉCARTÉ par
  Nico (~18:45) : pas d'annonces de test ; la charge se mesure EN RÉEL, utilisateur par utilisateur (agent fillsell-mesure,
  vues cloud_charge_heures / cloud_charge_comptes, alerte de capacité à 65 %) — docs/cloud/REPRISE.md, bloc « ENCHAÎNEMENT ».

## 5. Garde-fous
- Le compte de Nico est le seul compte réel sur la machine : un palier qui le gêne (bridage, lenteur d'une tâche,
  anti-robot) arrête l'essai. Aucune publication forcée pendant l'essai : sa cadence normale continue.
- Les navigateurs de charge ne sortent pas (proxy mort + pare-feu FILLSELL-NAV) : aucune plateforme, aucun compte.
- Aucun redémarrage de l'orchestrateur ni de Caddy ; aucune écriture en base.
