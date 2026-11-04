# Beebs sur le Cloud de Nico — ce qui déclenche le blocage (04/11/2026)

Heure de Paris partout. Mesures en lecture seule sur cloud-1 (aucune visite de Beebs), puis corrections sur la décision
de Nico (« ouvrir le Cloud ce soir ; Beebs seulement ; aucun changement pour l'utilisateur »).

## 1. Les faits (cloud-1 : `etat/endurance/mesures.jsonl`, `blocages.json`, relevés de 30 s `etat/mesure-0311/`)
| Quand | Quoi |
|---|---|
| 03/11 01:25:12 | glissière DataDome (`/captcha/`, sans `t=bv`) dans l'onglet de travail `www.beebs.app/#fillsell-worker` ; contre-visite 01:28:12, 2 s, « refusé » (sans glissière lue) |
| 03/11 16:15:29 | filtre anti-pubs en service (image 9e9bde4 construite 16:15:04, navigateur rouvert 16:15:29) |
| 03/11 18:40:23 | « Résoudre » de Nico : **passé** (filtre actif), compte relu 18:47 |
| 04/11 02:45:57 | nouvelle glissière dans l'onglet de travail ; contre-visite 02:48:57, 2 s, « refusé » |
| 04/11 08:14:16 | « Résoudre » de Nico : vérification de l'appareil puis « Accès temporairement restreint » ; Leboncoin, même navigateur, même IP, même filtre : **passé** à 08:14:07 |

## 2. Le filtre anti-pubs : écarté
- 1er blocage 15 h AVANT lui ; « Résoudre » réussi APRÈS lui (Beebs 03/11 18:40, Leboncoin 04/11 08:14).
- DataDome charge depuis `geo.`, `ct.`, `static.captcha-delivery.com` : hors de la liste, et bien chargés à 08:14 (cache).
- Les 30 hôtes contactés par les pages Beebs (état réseau du profil) : aucun dans la liste. Les seuls jamais vus
  (`googleads.g.doubleclick.net`, `pagead2.googlesyndication.com`) datent du 01/11 20:06-20:16, avant le refus des cookies.
- Les trois causes de l'écran de Beebs sont le texte standard de DataDome pour tout blocage.

## 3. Ce qui précède chaque glissière : le rythme de robot des lectures de fond
Historique du navigateur Cloud (`History`) et `vinted_sync_runs` :
- **Relevé quotidien des annonces Beebs** (alarme de 24 h, `releverQuotidien`) : 03/11 00:52:40-00:53:49 (« Mes annonces »,
  « En vérification », puis 11 fiches à ~4 s : 13 pages en 65 s) ; 04/11 00:44:01-00:44:45 (6 pages en 36 s). Besoin :
  la liste des annonces Beebs à jour (en ligne / en vérification, numéros des publications, disparitions).
- **Messagerie et commandes Beebs** (`releverMessagerieBeta`, 10 min + 0 à 90 s, retombant toujours sur le même tour de
  2 min du poll) : l'accueil Beebs rechargé **toutes les 12 min pile**, 26 fois de 18:55 à 23:55 ; l'onglet fermé 5 min
  après (règle mémoire du 02/11) puis rouvert. Besoin : un message d'acheteur, une commande neuve dans l'app.
- **Onglet caché de 25 min** (04/11 02:21 → 02:45) : l'onglet de travail Beebs réutilisé par les lectures de fond n'a pas
  atteint ses 5 min sans usage (la fermeture se fait en fin de tour) — puis le cadre DataDome y apparaît (02:45:28).
- Détection de vente : fiches Beebs relues par rafales (jusqu'à 8 en 30 s par tour de poll).

## 4. Ce qui distingue le navigateur Cloud (onglet vide, sans réseau)
- Rendu WebGL **SwiftShader** (logiciel), **0 plugin** (un Chrome de bureau en déclare 5), onglet de travail caché sans focus.
- Pendant « Résoudre » : un **téléphone** (écran 390×844 ×3, 5 points de toucher, pointeur tactile) qui annonce un
  **Chrome Linux de bureau** — aucun appareil réel n'a cette combinaison ; c'est ce que lit la vérification de l'appareil.
- Aucune trace d'automatisation par le test classique (`navigator.webdriver` faux).

## 5. Corrections (Beebs seulement ; Vinted, Leboncoin, Depop inchangés ; filtre anti-pubs inchangé)
1. **Cadence de fond** (copie Cloud de l'extension, `RYTHME_BEEBS_CLOUD`, scripts/cloud/build-extension-cloud.mjs) :
   messagerie/commandes 8 à 16 min tirées au hasard, **moyenne 12 min comme avant** (choix de Nico) ; sonde de session
   45-75 min (moyenne 60) ; relevé quotidien de l'alarme seulement : 6 à 15 s entre deux pages Beebs ; détection de vente :
   une fiche Beebs par tranche de deux dues et par tour (régime établi inchangé ; relecture prioritaire d'une commande
   neuve sans limite). Rien de ce qu'une personne lance (import, publication, retrait) n'est touché.
2. **« Me connecter » / « Résoudre » cohérents** (serveur-cloud/src/vueBureau.js, connexion.js) : une VRAIE fenêtre de
   bureau de 500 px aux proportions du téléphone (redimensionnée, aucune émulation), échelle 1, aucun toucher ; un appui =
   un clic, un glissé horizontal = un glisser bouton enfoncé, vertical = la molette. Chaque requête de la page et de ses
   cadres est enregistrée dans `etat/essais/` (hôte, chemin, code, échec, `publicite`).
3. **Zoom sur la glissière** : dans l'APP (elle découpe l'image reçue, `sourceZoom`), seulement si l'app l'annonce
   (`zoom: true`) — actif à la prochaine OTA ; sans elle, la page entière (poignée 50×31 pt, glissière 220×31 pt).

## 6. Le banc hors ligne du 04/11 (le vrai connexion.js, la vraie glissière Beebs servie du cache, aucun réseau)
- Émulation de taille (`Emulation.setDeviceMetricsOverride`) : une souris envoyée à la page arrive **décalée** dans le
  cadre DataDome hors processus (200,300 → 161,137) → abandonnée pour un vrai redimensionnement : 200,300 → 200,300.
- Capture découpée côté serveur (`Page.captureScreenshot` avec `clip`), même à l'échelle 1 et sérialisée : Chrome déplace
  la vue le temps de la prise et des mouvements décalés (+70 px ; ×0,46 avec agrandissement) partent en plein glisser →
  zoom serveur abandonné, zoom dans l'app.
- Version retenue, 3 passages sur 3 : page 500×747, échelle 1, 0 point de toucher ; zone de zoom 360×538 annoncée à l'app ;
  les 24 événements d'un glisser (appui 142,308 → relâché 382,309) tombent tous sur la poignée, sans un décalage.
- La glissière hors ligne ne bouge pas (son script attend le serveur de DataDome) : le glisser réel se vérifie à l'essai.

## 7. Le déploiement, le déblocage et l'essai
- Déployé le 04/11 à 12:02 : orchestrateur **8f33110** (vue bureau, enregistrement) et copie Cloud **0.6.169-cloud**
  `2026-11-04T11:00:31Z+d426d23.p8f33110-cloud` — l'extension DÉJÀ déployée (d426d23) + les patchs Beebs du jour, SANS les
  changements Leboncoin de la 0.6.170 (`--extension=d426d23`). Aucune tâche en cours au déploiement ; Vinted et Depop
  connectés après ; Leboncoin : sa glissière de 11:02 (messagerie, AVANT le déploiement) attend « Résoudre ».
- IP neuve par le pool (`outils/acheter-une-ip.mjs --acheter`, mêmes gardes que l'achat automatique) : IPRoyal
  **87481742**, 4 $, livrée en 20 s, id **40**, `81.181.237.207` (échéance 04/12). Même /22 que 81.181.239.136 (refusée
  par Beebs le 02/11) — sans valeur de preuve : le 02/11, 176.103.182.215 est passée sur le bloc d'une IP refusée.
- Remise à zéro : `outils/effacer-plateforme.mjs` (navigateur), `scripts/reparations/20261104_cloud_beebs_ip_neuve_nico.sql`
  (coffre Beebs, état « vérification », IP 39 → repos, 40 → compte ; inverse `…_INVERSE.sql`), blocage Beebs clos dans
  `blocages.json` (sauvegarde `archives/0411-beebs/`), orchestrateur redémarré.
- Essai unique : UN « Me connecter » Beebs de Nico, enregistré dans `etat/essais/beebs-…-connexion.jsonl`.

## 8. L'essai de 13:40, l'incident de 12:25, la réparation (04/11 après-midi)
- **Incident 12:25** : `cloud_ip_liberer` (bascule d'IP de 12:23) a mis l'IP 39 au repos — chemin d'un compte qui PART —
  et l'entretien a purgé le compte : profil détruit, coffre vidé (Vinted, Leboncoin, Depop, Beebs), session FillSell
  révoquée, réservation de l'IP 2 levée (visite de contrôle Beebs à 12:25). ⛔ Plus jamais `cloud_ip_liberer` pour changer
  l'IP d'un compte qui reste.
- **Essai 13:40** (`etat/essais/beebs-2026-11-04T12-40-03-527Z-connexion.jsonl`, profil neuf, 0 cookie, IP 40) : `GET /fr/auth`
  → 403 dès la 1re requête ; vérification de l'appareil (POST `/interstitial/`, 13:40:07.181) RATÉE avant tout geste →
  glissière → `/captcha/check` (13:40:12.265) → rechargement 403 → « Accès temporairement restreint » ; 13 s. 0 requête
  coupée (verrou, filtre anti-pubs). Même suite qu'au « Résoudre » de 08:14 en mode téléphone ; le 03/11 18:40 (réussi),
  la vérification de l'appareil était passée seule (cookie datadome ancien, IP 39). Ce que la page voit dans les deux
  modes (mesuré) : bureau 500×776 / 500×863, écran 1920×1080, échelle 1, souris — téléphone 393×610 « paysage », ×3,
  5 points de toucher. Cause non prouvée ; candidat principal : l'APPAREIL (SwiftShader, 0 plugin).
- **Réparation (2)**, 14:05 : IP 39 rendue au compte, 40 au pool (disponible, jamais au repos ; son refus Beebs NON noté :
  il déclencherait une visite), réservation de l'IP 2 rétablie, profil d'avant (archive 12:08) remis sous son nom
  (empreinte 7a1cfa22 identique), coffre refait depuis ses 186 cookies (`outils/restaurer-coffre-profil.mjs`). Preuve :
  messagerie Vinted (14:08:29) et Depop (14:08:37) relues sans erreur. Leboncoin : session gardée, glissière de 11:02 à
  résoudre (antérieure à l'incident). Réparation `20261104_cloud_retour_avant_1223_nico.sql` (+ INVERSE), restée sur le poste.
- **Interrupteur des visites de contrôle** (accord de Nico) : `coin_config.cloud_visites_controle_beebs = 0` (14:15),
  déployé 8e91ac1 à 14:17 ; 1er entretien 14:18 : `visites_coupees: ["beebs"]`, aucune visite. Le paquet portait aussi le
  prix 24,99 € de `_shared/cloud-pool.js` (autre terminal) : sans effet sur l'orchestrateur.

## 9. Points 2 et 3 (bugs de notre côté, enregistrement complet)
- **2a — cookie de la glissière** : notre code ne recharge jamais la page (journal de l'essai : aucune navigation refusée,
  aucun `Page.navigate` après l'ouverture) ; le rechargement est celui du script de DataDome. Banc hors ligne (vrai serveur
  HTTPS local) : le cookie posé par la page juste avant son rechargement PART avec lui (`cookies_envoyes: ["datadome"]`) ;
  les 35 ms de la base de cookies ne prouvent pas un rechargement sans cookie. Aucun changement de code.
- **2b — ne plus repartir de zéro** : l'entretien ne purge JAMAIS un compte qui tient une IP ou dont le Cloud est actif
  (`compteToujoursActif` ; lecture ratée = pas de purge) ; `outils/effacer-plateforme.mjs` garde `datadome` par défaut
  (`--avec-datadome` sur décision de Nico). La purge des sessions à l'ouverture le gardait déjà (`COOKIES_GARDES`).
- **2c — lecteur PDF intégré** : steel le coupe par défaut (`plugins.always_open_pdf_externally: true`,
  `plugins_disabled: ["Chrome PDF Viewer"]`) → navigator.plugins vide. `REGLAGES_PDF` le rend tel que Chromium le livre.
  Mesuré au banc : 0 → 5 plugins (« PDF Viewer », « Chrome PDF Viewer », « Chromium PDF Viewer », « Microsoft Edge PDF
  Viewer », « WebKit built-in PDF »), 2 types MIME (application/pdf, text/pdf), `pdfViewerEnabled` vrai ; identité
  inchangée. Empreinte figée : 7a1cfa22decada93 → **091d90b32056e8dd** (EMPREINTE_AUTORISEE, accord de Nico).
- **3 — enregistrement complet** : par requête, noms des cookies envoyés (et retenus) et reçus (et refusés) ; pour
  DataDome, noms et longueurs des paramètres, taille du corps, réponse (verdict, jeton masqué) ; chaque mouvement de
  souris (reçu, rejoué, point du canvas et de la page). Prouvé au banc (aucun secret dans le fichier).

## 10. Point 4 — le vrai rendu graphique (étude, rien commandé)
- **PC de Nico sous WSL2** : rendu par la puce via la couche D3D12 de Mesa — le moteur de rendu se nomme « D3D12 (Intel(R)
  UHD Graphics) », une signature que seul WSL porte, avec des retombées connues en rendu logiciel. Pas parlant pour un
  serveur Linux, et lourd pour son PC. Seule voie parlante sur sa machine : démarrer un Linux sur clé USB (vrai pilote de
  la puce), ~1 h, PC indisponible pendant l'essai.
- **Serveur Linux à puce graphique à l'heure** : Scaleway L4 (Paris), ~0,75-0,90 €/h selon les sources (à relire) ; mais
  une NVIDIA L4 est une carte de centre de données, rare chez les vrais utilisateurs.
- **Hetzner EX44** (i5-13500, puce Intel UHD 770, 64 Go) : la puce la plus répandue chez les vrais utilisateurs Linux. Prix
  à relire (page Hetzner : dès 46,41 €/mois + 46,41 € d'installation TTC ; frais d'installation relevés depuis selon un
  forum). Accès à la puce (`/dev/dri`) non confirmé par les sources : à vérifier avant commande. Capacité : 31 navigateurs
  par la mémoire, ~15-25 en pratique (puce partagée) → ~2 à 3 € par client et par mois, contre 2,83 € sur le cx43.

## 11. Déploiement des points 2-3 et préparation de l'essai (04/11, 15:07 → 15:16)
- Suite complète par lots (le passage d'un bloc avait été arrêté par manque de mémoire du PC) : 545 selftests, 3 rouges
  (offres-trois-jauges, reglages-jauges, cout-publication — travail non commité d'un autre terminal ; aucun fichier du lot).
- Déployé **cce5eba** à 15:07 ; `.env` : EMPREINTE_AUTORISEE **091d90b32056e8dd** (avant : `archives/0411-beebs/env-avant-pdf`).
  Navigateur rouvert, empreinte « autorisée » ; une page voit 5 plugins PDF, 2 types MIME, `pdfViewerEnabled` vrai ;
  entretien 15:08 : aucune visite (Beebs coupé), aucune purge. Vinted relu 15:10:36, Depop 15:12:36, sans erreur.
- IP de l'essai : IPRoyal **87495735**, 4 $ (accord pour cet essai), id **41**, `88.151.56.82`, contrôle d'entrée passé (FR,
  0 liste, aucune plateforme). Bascule 15:15 par `scripts/reparations/20261104_cloud_ip_essai_beebs_nico.sql` (sauvegarde
  `_backup_0411_cloud_ip_essai`, jamais `cloud_ip_liberer`) : 41 au compte, 39 disponible sans réservation (une seule IP
  réservée par compte : la 2 l'est déjà ; offre fermée, visites Beebs coupées). Navigateur rouvert 15:16 sur 88.151.56.82,
  même profil, empreinte identique, aucune purge. Retour sur la 39 après l'essai : `…_INVERSE.sql`.

## 12. L'essai de 15:45 sur l'IP 41, le retour sur l'IP 39, la comparaison avec le PC de Nico (04/11, 15:45 → 16:10)
- **Essai** (`etat/essais/beebs-2026-11-04T14-44-53-440Z-connexion.jsonl`, 12 lignes, 0 geste) : 15:44:54.099 `GET /fr/auth`
  → **403**, cookie envoyé : `datadome` seul (celui du profil remis à 14:05), un nouveau `datadome` reçu ; 15:44:54.283 `i.js` ;
  15:44:56.283 vérification de l'appareil affichée ; **15:44:56.711 POST `/interstitial/`** (9 004 octets chiffrés, aucun
  cookie : autre domaine) → réponse `view: "captcha"` ; 15:44:57.217 `/captcha/` sans aucun script de glissière (à 13:40,
  `captcha.1.37.0.js` était chargé) ; 15:45:00.909 « Accès temporairement restreint » lu dans la page. Refus 2,6 s après
  l'ouverture, avant tout geste ; 0 requête coupée (verrou, filtre). ID DataDome 944edeab-bdaf-841e-4034-2585001aed8f.
- Lecture (deux essais, pas une preuve) : IP neuve 40 + 0 cookie (13:40) → glissière puis refus ; IP neuve 41 + ancien
  cookie datadome (15:45) → refus sec. L'IP neuve ne change rien ; l'ancien cookie a durci la réponse.
- **Retour sur l'IP 39** : `…_ip_essai_beebs_nico_INVERSE.sql` (41 → disponible, refus NON noté ; 39 → compte), navigateur
  fermé 15:48:07 (`ip_remplacee`), rouvert 15:49:10 ; écho 15:53 : sortie 176.103.182.215, empreinte 091d90b32056e8dd,
  même profil, aucune purge. Vinted relu 15:56:31, Depop 16:00:31, sans erreur. Leboncoin : 403 de 11:01:21 (glissière) toujours en attente
  de « Résoudre » (FAUX, corrigé au § 13 : rien à résoudre, messagerie en pause jusqu'à 17:01).
- **Différences mesurées avec le PC de Nico** (Cloud : écho 15:53 et conteneur ; PC : Windows lu à 16:00, WebGL du 30/10) :
  | | Cloud | PC de Nico |
  |---|---|---|
  | Système | Debian 12 (conteneur steel) sur VM Hetzner cx43, AMD EPYC-Rome, 8 cœurs | Windows 11 Pro 10.0.26300, Ryzen 7 7735HS, 16 cœurs logiques |
  | Rendu | SwiftShader (logiciel) : « ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)…) » | AMD Radeon intégrée, pilote 32.0.21030.2001 : « ANGLE (AMD, AMD Radeon(TM) Graphics … Direct3D11) » |
  | Navigateur | Chromium 156.0.8078.73 de Debian ; `Sec-Ch-Ua` « Chromium » 156 seul | Google Chrome 156.0.8078.48 officiel (marque « Google Chrome » : supposée) |
  | Polices | 43 familles (DejaVu, Liberation, Free, Kacst, Tlwg, IPA, WenQuanYi : la liste type des conteneurs) | 340 fichiers de polices Windows |
  | Écran | 1920×1080, échelle 1 ; fenêtre de 500 px pendant « Me connecter » | 1920×1200 |
  Identiques : fr-FR, Europe/Paris, 5 plugins PDF (PC : supposé), `webdriver` faux. Déjà mesuré : Chrome officiel sous Linux
  bloqué (30/10, machine et IP neuves comprises) ; Linux + vraie puce Intel UHD 630 bloqué (30/10 17:45, doute sur l'IP 2) ;
  steel neuf sur Hetzner neuf passé (01/11) ; ce Cloud passé le 03/11 18:40 puis refusé d'IP en IP.
- **Prix relus à 16:00** (rien commandé) : Hetzner EX44 (i5-13500, Intel UHD 770 selon la fiche Intel) **59,00 € HT/mois ou
  0,0945 € HT/h, mise en service 0,00 €**, FSN1/HEL1, Windows dans la liste des systèmes (licence non chiffrée sur la page) ;
  accès à la puce (`/dev/dri`) NON confirmé sans la machine. Scaleway **L4-1-24G 0,013125 € HT/min (0,79 €/h)**, Paris,
  catalogue public ; aucune offre à carte sous Windows (Windows : POP2 seulement) ; les RTX 3070 sont retirées.

## 13. Leboncoin relu sur le Cloud, contrôle de la puce Intel, Windows sur l'EX44 (04/11, 16:15 → 16:45)
- **Leboncoin (correction du § 12)** : il n'attend AUCUN « Résoudre ». `etat/endurance/blocages.json` : glissière de 11:02
  close à 14:11 (`resolue_par: resoudre`) ; glissière de 14:45 dans l'onglet de travail (sonde du compte), contre-visite de
  14:48 : **passe**, close. `platform_settings.<pf>.cloud_verification` vide pour les quatre plateformes (rien à résoudre dans
  l'app). Ce qui arrête sa messagerie : la pause automatique de l'extension après le 403 de 11:01:21
  (`messagerie_releves.pause_jusqu_au` = **17:01:21**, 6 h, `bloquerMessagerie`) ; elle repart seule ensuite.
- **EX44 non commandable par l'API Robot** (33 produits standard relus, comme le 30/10). Choix de Nico : l'enchère
  **3106687** (i5-12500, Intel UHD 770 selon la fiche Intel, ASUS, 64 Go, FSN1-DC2), 0,1651 € HT/h + IPv4 0,0027 € HT/h,
  sans mise en service ; commande d'essai (`test=true`) puis commande 16:27:55 (B20261104-3542083-3113266), livrée 16:33,
  **résiliée 16:39** (`cancellation_date=now`, plus aucun serveur au compte). Coût : une heure entamée au plus, ≈ 0,17 € HT.
- **Mesures (aucun site visité ; sortie réseau coupée par iptables et vérifiée avant Chrome ; profil jetable, proxy mort)** :
  système de secours : i915 chargé (« alderlake_s », 4690), `/dev/dri/card0` et `renderD128` présents, trois sorties
  « disconnected » ; installimage met désormais `USE_KERNEL_MODE_SETTING=1` par défaut (pas de `nomodeset`). Ubuntu 24.04
  (noyau 6.8), sortie forcée `video=HDMI-A-1:1920x1080@60e` → HDMI-A-1 « connected », Xorg 1920×1080 ; `glxinfo` « Mesa
  Intel(R) UHD Graphics 770 (ADL-S GT1) », accéléré. **Google Chrome 157.0.8103.38 officiel** : WebGL « ANGLE (Intel, Mesa
  Intel(R) UHD Graphics 770 (ADL-S GT1), OpenGL 4.6) », WebGL 2, Mesa 25.2.8 ; `SystemInfo` : 2d_canvas, gpu_compositing,
  rasterization, webgl, webgpu, video_decode **enabled** ; 5 plugins, 12 cœurs, `webdriver` faux.
- **Windows sur l'EX44 (rien commandé)** : Windows Server 2025 Standard **49,00 € HT/mois pour 14 cœurs** (i5-13500), facturé
  au mois civil complet, commandable seulement dans Robot ; Windows figure dans la liste des systèmes de la page EX44, non
  vérifié à la commande. **Intel ne prend en charge la puce UHD 770 que sous Windows 10/11 64 bits et Linux** (article Intel
  000005526) : aucun Windows Server ; sans pilote Intel, Windows retombe sur son pilote de base et Chrome sur le rendu
  logiciel.
- **Capacité** (mesurée sur le Cloud, 03-04/11, 242 relevés, un navigateur) : 1,2 Go en moyenne, 2,1 Go au 95e centile,
  2,9 Go au plus ; processeur presque au repos. EX44 (64 Go, 14 cœurs / 20 fils) : ≈ 25 navigateurs par la mémoire, Linux ou
  Windows ; partage de la puce non mesuré.

## 14. Reprise (04/11, 17:00 — tout relu à cette heure, rien deviné)
**cloud-1** (Hetzner `fillsell-cloud-1`, 178.105.24.16, cx43 fsn1 ; `ssh -i ~/.ssh/fillsell_cloud_ed25519 root@178.105.24.16`) :
- `deploiement-orchestrateur-1` = `fillsell-orchestrateur:cce5ebab06b3` (commit cce5eba, déployé 15:07) ;
  `fs-nav-f44b5917-…` = steel `b5bd99decf27` (Chromium 156.0.8078.73 de Debian 12, rendu SwiftShader) ; `deploiement-caddy-1`.
- Copie Cloud de l'extension : 0.6.169, `2026-11-04T11:00:31Z+d426d23.p8f33110-cloud` (déployée 12:02 ; le 15:07 n'a touché
  que l'orchestrateur).
- `.env` (drapeaux, aucun secret) : `EMPREINTE_AUTORISEE=091d90b32056e8dd` (l'ancienne : `archives/0411-beebs/env-avant-pdf`),
  `COMPTES_AUTORISES` = le seul compte de Nico, `ALERTES_MAIL=0`, `IPROYAL_ACHATS_AUTORISES=1`.
- Un seul profil, `p-f44b5917-60c90d1101a8` (empreinte 091d90b32056e8dd), remis par la réparation de 14:05. Poste rouvert à
  15:49:10 sur l'IP 39 ; coffre : Vinted, Leboncoin, Depop = profil, Beebs absente. Enregistrements : `etat/essais/`.
- Plateformes : Vinted relu 16:56:24, Depop 16:48:35, sans erreur. Leboncoin : rien à résoudre ; messagerie en pause
  jusqu'à 17:01:21 ; à 17:00, première lecture d'après la pause PAS ENCORE FAITE, à relire dans `messagerie_releves`. Beebs :
  « onglet_indisponible » (effacée du coffre) ; rien à y faire sans décision de Nico.

**IP (`cloud_ips`, 17:00)** — toutes celles qui restent payées ont déjà vu Beebs : AUCUNE IP propre pour un essai.
| id | IP | état | compte | refus Beebs en base | échéance |
|---|---|---|---|---|---|
| 39 | 176.103.182.215 | attribuee_client | Nico | noté | 03/12 14:09 |
| 2 | 185.134.194.88 | disponible, **réservée à Nico** | — | noté | 29/11 11:37 |
| 1 | 94.194.94.233 | disponible | — | noté | 04/12 13:57 |
| 3 | 81.181.239.136 | disponible | — | noté | 29/11 21:00 |
| 4 | 185.134.192.253 | disponible | — | noté | 02/12 12:29 |
| 40 | 81.181.237.207 | disponible | — | ⚠ **NON noté** (refusée le 04/11 à 13:40) | 04/12 12:03 |
| 41 | 88.151.56.82 | disponible | — | ⚠ **NON noté** (refusée le 04/11 à 15:45) | 04/12 15:08 |
| 5, 6 | — | expirées | — | — | 03/11 |
- 40 et 41 : refus volontairement non notés (la note déclencherait une visite de contrôle). À noter seulement visites
  coupées. Personne d'autre ne peut les recevoir tant que `COMPTES_AUTORISES` ne compte que Nico.

**Interrupteurs (`coin_config`, 17:00)** : `cloud_visites_controle_beebs = 0` (aucune visite Beebs, d'aucune IP, depuis
14:15) ; `cloud_ip_achats_auto = 1`, `cloud_ip_renouvellement_auto = 1`, `cloud_ip_stock_min = 2`, `cloud_ip_achat_max = 10`,
`cloud_ip_budget_mensuel_usd = 60` (6 IP disponibles : aucun achat déclenché) ; `cloud_ip_rotation = 0` ;
`cloud_serveurs_auto = 0`. Entretien : `compteToujoursActif` (cce5eba) — jamais de purge d'un compte qui tient une IP ou
dont le Cloud est actif ; lecture ratée = pas de purge.

**Scripts** — `scripts/reparations/`, sur le PC de Nico SEULEMENT (`*.sql` ignoré par `.gitignore` ; le `git add -f` a été
refusé, non contourné). Exécution : `npx supabase db query --linked -f <fichier>`.
- Bascule sur une IP neuve **sans `cloud_ip_liberer`** : `20261104_cloud_ip_essai_beebs_nico.sql` (remplacer `:ip_neuve` par
  l'id) ; retour sur la 39 : `…_INVERSE.sql` (même remplacement). Sauvegarde `_backup_0411_cloud_ip_essai`. Joués à 15:15
  et 15:48.
- Réparation (2) de 14:05 : `20261104_cloud_retour_avant_1223_nico.sql` / `_INVERSE.sql` (orchestrateur arrêté pendant),
  sauvegarde `_backup_0411_cloud_retour`.
- ⛔ `20261104_cloud_beebs_ip_neuve_nico.sql` : ne JAMAIS relancer (il appelle `cloud_ip_liberer` : incident de 12:25) ; son
  inverse est dépassé par la réparation (2). Sauvegarde `_backup_0411_cloud_beebs_ip`.
- Outils du conteneur orchestrateur : `outils/echo-navigateur.mjs <user>` (IP de sortie, empreinte, sans plateforme),
  `acheter-une-ip.mjs`, `controle-entree.mjs <id>`, `restaurer-coffre-profil.mjs`, `effacer-plateforme.mjs` (garde
  `datadome` sauf `--avec-datadome`).
- Location à l'heure chez Hetzner (API Robot, identifiants dans `fillsell-cloud-proto/secrets.env`) :
  `POST /order/server_market/transaction` (d'abord avec `test=true`), puis résiliation par
  `POST /server/<n>/cancellation` avec `cancellation_date=now`. Aucun serveur dédié en cours.

**Prouvé** :
- Le refus Beebs se décide dans la réponse de DataDome à la vérification de l'appareil (`POST /interstitial/`), 2 à 3 s
  après l'ouverture et avant tout geste (13:40 et 15:45).
- Notre code ne recharge jamais la page ; un cookie posé juste avant le rechargement part avec lui (banc).
- Le filtre anti-pubs et le verrou n'ont rien coupé.
- Une IP neuve (40, 41) donne le même verdict. Mode bureau ou mode téléphone : même verdict.
- Chez Hetzner (enchère i5-12500, UHD 770), la puce est active et Google Chrome 157 officiel l'utilise pour tout, sous Linux,
  avec la sortie écran forcée.
- Ce qui passe : Windows sur du vrai matériel (PC de Nico, Shadow : 30/10) ; un navigateur NEUF (steel neuf le 01/11 ; ce
  Cloud le 03/11 18:40), qui se fait refuser ensuite.

**Écarté** :
- le filtre anti-pubs ;
- le pilotage par les outils de développement à lui seul (le PC piloté passait, 30/10) ;
- l'IP seule et le type d'IP ;
- la langue et le fuseau ;
- Google Chrome officiel seul sous Linux (bloqué le 30/10) ;
- un rechargement sans cookie de notre fait ;
- Scaleway L4 en production (≈ 575 € HT/mois) ;
- Windows Server + puce Intel sur l'EX44 (aucun pilote Intel pour Windows Server) ;
- Shadow (Always On à 208,99 €/mois).

**Ouvert, non prouvé** :
- La cause : la signature du navigateur, repérée après des heures de lectures de fond et partagée par tous les clients
  Cloud (rendu SwiftShader, polices de conteneur, Linux). Probable.
- Linux + vraie puce face à Beebs : pas essayé depuis le 30/10. L'essai demande une IP neuve (4 $) et quelques heures de
  machine, sur accord écrit de Nico.
- La tenue dans la durée de toute solution : il faut plusieurs jours de lectures de fond pour la juger.
- L'EX44 exact : non commandable par l'API ; Windows est listé sur sa page, mais pas vérifié à la commande.
- Le ressenti de l'ancien cookie datadome (2 essais seulement).

**Interdits rappelés** :
- jamais `cloud_ip_liberer` pour un compte qui reste ;
- aucune visite Beebs (interrupteur à 0) ;
- aucun achat d'IP ni de serveur, aucun essai Beebs, aucun contact avec Beebs sans accord écrit de Nico ;
- aucune fausse valeur d'empreinte, aucun navigateur « anti-détection », aucun résolveur, aucune IP tournante ;
- Vinted, Leboncoin et Depop jamais cassés par ce chantier.

## 15. L'essai « recette de prod » sur une machine à vraie puce (04/11 soir → 05/11 18:00, ordre de Nico)
**Ordre de Nico (17:04)** : compte Cloud de Nico ENTIÈREMENT sur une machine d'enchère à puce Intel UHD 770, Linux + Google
Chrome officiel par la vraie puce, IP neuve (4 $), profil neuf, aucun cookie de cloud-1 ; Nico se connecte lui-même aux
quatre plateformes ; fonctionnement normal de prod ; enregistrement complet ; rapports ~21:00, ~08:00, ~18:00 ; verdict
05/11 ~18:00. Plafond 15 € ; une seule IP ; retour sur cloud-1 au moindre souci grave.

**Préalables (17:18)** — `scripts/reparations/20261104_cloud_essai_gpu_preparatifs.sql` (+ INVERSE, sauvegarde
`_backup_0411_essai_gpu_prep`) : `cloud_ip_achats_auto = 0` ; refus Beebs des IP 40 et 41 notés (`restreint`, preuve = les
fichiers d'essai de 13:40 et 15:45), visites Beebs toujours à 0 → aucune visite. ⚠ La règle d'attribution met une IP
refusée en fin de file, elle ne l'exclut pas (toutes les IP disponibles ont un refus Beebs). Les scripts `.sql` du Cloud
entrent au dépôt par une exception ÉTROITE de `.gitignore` (`scripts/reparations/*_cloud_*.sql`) ; celui qui appelle
`cloud_ip_liberer` est désormais arrêté net par sa première ligne. Leboncoin (relu 17:10) : la 1re lecture d'après la
pause (17:02:37) a pris un 403 (API messagerie), glissière 17:03:07, contre-visite 17:06 « passe » ; messagerie de nouveau
en pause jusqu'au 05/11 17:02:37.

**La machine** — enchère Hetzner **3104939** (choix de Nico : plus aucune i5-12500, la seule i5-13500 portait une RTX 4000) :
i9-13900, ASRock Rack W680D4U-1L, 64 Go, FSN1-DC7 ; **5.9.80.213** ; commandée 17:20:27 (B20261104-3542120-3113293),
livrée 17:26 ; 0,3109 + 0,0027 € HT/h (plafond 195,70 € HT/mois si gardée). Puce lue au secours : « Raptor Lake-S GT1 [UHD
Graphics 770] [8086:a780] », i915. Ubuntu 24.04.5 (installimage, ESP), `deploiement/gpu/preparer-poste-gpu.sh`, sortie
HDMI-A-1 forcée : Xorg 1920×1080, `glxinfo` « Mesa Intel(R) Graphics (RPL-S) », Mesa 25.2.8, accéléré.

**Le code (derrière des réglages, défauts = cloud-1 inchangé ; cloud-1 n'est pas redéployé)** :
- `ENTRETIEN_POOL=0` : le 2e serveur ne tient pas le pool (seul le pare-feu de ses navigateurs le suit) ;
- `acheter-une-ip.mjs --accord-ecrit="…"` : l'accord écrit de Nico remplace le seul interrupteur (serveur, plafond, solde,
  registre tiennent ; le registre porte l'accord) ;
- relais du moteur Chrome : régies publicitaires refusées comme sur steel (parité du filtre) ;
- `ENREGISTREMENT_FOND=1` (`src/enregistrementFond.js`) : chaque requête des onglets de travail vers une plateforme ou
  DataDome, et chaque onglet ouvert/fermé, dans `etat/essais/fond-<compte>-<jour>.jsonl` (Network seulement, rien de
  visible par la page ; le service worker de l'extension n'est PAS suivi : `ENREGISTREMENT_FOND_SW`) ;
- `ENREGISTREMENT_CONNEXIONS=1` : « Me connecter » / « Résoudre » enregistrés pour les quatre plateformes, affichage inchangé ;
- image Chrome sur Ubuntu 24.04 à jour (le Mesa de l'hôte) et les polices d'`ubuntu-desktop-minimal`.

**La bascule** — `20261104_cloud_essai_gpu_bascule_nico.sql` (+ INVERSE, sauvegarde `_backup_0411_essai_gpu`) : le coffre
est COMMUN aux serveurs → lignes Vinted / Leboncoin / Depop sauvegardées puis retirées (accord de Nico), session FillSell
gardée ; poste → cloud-2, profil neuf `p-f44b5917-1443a482c05b` (celui de cloud-1, `p-f44b5917-60c90d1101a8`, reste sur son
disque) ; IP 39 → disponible (jamais au repos), IP neuve → Nico. cloud-1 cesse de servir Nico AVANT (`COMPTES_AUTORISES` =
un compte inexistant, jamais vide : vide = tous) : sinon, si cloud-2 se taisait 15 min, la base rendrait le compte à cloud-1
qui purgerait les sessions de son profil (coffre vide). Retour : cloud-2 arrêté → INVERSE → cloud-1 rouvert sur Nico.

**Déroulé (04/11 soir, heures de Paris, relues en base et sur les serveurs)** :
- 18:06 cloud-2 déployé (3094473 ; `deployer.sh` corrigé : un `DESTINATIONS_PROXY` vide disparaissait dans la ligne ssh) ;
  18:16 redéployé **387043a** : le moteur Chrome annonçait « fr-FR, fr » seules (mesuré) → langues d'un vrai Chrome
  français (`--accept-lang=fr-FR,fr,en-US,en`, comme `LANGUES_PROFIL` sur steel).
- 18:08 IP **42** (94.194.94.68, Paris, Orange AS5511 ; même /24 que l'IP 1, déjà vue par Beebs) achetée sur l'accord écrit
  (IPRoyal 87509051, 4 $) ; son contrôle d'entrée, 18 s après la livraison, l'a mise au REBUT (page d'écho vide, proxy pas
  encore actif) → remise « achetee » (`…_ip42_controle_rejoue.sql` + INVERSE), proxy vérifié (sortie 94.194.94.68), contrôle
  rejoué 18:10 : passé (FR, sortie conforme, 0 liste noire, aucune plateforme).
- Navigateur jetable de cloud-2 (sans compte, sans réseau) puis navigateur du compte : WebGL « ANGLE (Intel, Mesa Intel(R)
  Graphics (RPL-S), OpenGL 4.6) », compositing / rastérisation / WebGL / WebGPU par la puce, Chrome 157.0.8103.38, Mesa
  25.2.8, 220 familles de polices, 5 plugins, 32 cœurs (réels), 1920×1080, `webdriver` faux.
- 18:3x `cloud-2.fillsell.app` A → 5.9.80.213 (DNS only), créé dans Cloudflare depuis le navigateur de Nico sur son ordre
  (la clé Cloudflare du poste a expiré le 12/10) ; certificat Let's Encrypt obtenu par Caddy.
- 18:34:29 cloud-1 : `COMPTES_AUTORISES` = compte inexistant, orchestrateur relancé ; navigateur de Nico fermé proprement
  (coffre sauvegardé 18:34:27). Bascule jouée (:ip_neuve = 42) : 7 lignes sauvegardées, coffre = fillsell seule, poste
  cloud-2 / `p-f44b5917-1443a482c05b`, IP 39 disponible, 42 → Nico. 18:35:19 navigateur ouvert sur cloud-2, coffre
  « absente » ×4, sortie 94.194.94.68, aucune plateforme permise.
- 18:44 → 18:49 Nico se connecte depuis l'app : Beebs, Vinted, Leboncoin, Depop vérifiées, sans glissière. **Beebs : la
  vérification de l'appareil passe seule** (POST `/interstitial/` 18:44:16 → `view: "redirect"` + cookie datadome), là où
  cloud-1 recevait `view: "captcha"` (13:40, 15:45). Leboncoin : idem à 18:48:02. Enregistrements :
  `etat/essais/{beebs,vinted,leboncoin,depop}-2026-11-04T17-4x-…-connexion.jsonl` et `fond-f44b5917-2026-11-04.jsonl`.
- 18:5x (ordre de Nico) IP 39 RÉSERVÉE à Nico jusqu'au 03/12 (`…_reserve_39_nico.sql` + INVERSE) ; ⚠ une seule réservation
  par compte (index `cloud_ips_une_reservation`) : celle de l'IP 2 est levée. `cloud_ip_achats_auto` relu : 0.
- cloud-1 relu après la bascule : aucun navigateur, aucun compte au planificateur, entretien sans contrôle ni visite
  (`visites_coupees: ["beebs"]`), mesure « taches faites 0 ».
- 19:1x (ordre de Nico) **renouvellement coupé pour les IP refusées** : règle du plan horaire (`planDuJour`, commit fc25780)
  — une IP du pool au refus de plateforme NON prouvé sert jusqu'à son échéance mais n'est plus jamais renouvelée, sauf
  RÉSERVÉE (la 39) ; une IP attribuée (la 42) reste renouvelée. Plan simulé sur 60 j avec les vraies IP (λ minimal, stock
  minimum 2) : avant = 2 et 3 renouvelées le 24/11, 42 le 01/12 (12 $ sur 30 j, 24 $ sur 60 j) ; après = 39 le 24/11 et 42 le
  01/12 (8 $ sur 30 j, 12 $ sur 60 j). Les 1, 4, 40, 41 n'auraient pas été renouvelées non plus (stock tenu par 2 et 3) :
  échéances 2 et 3 le 29/11, 4 le 02/12, 1 / 40 / 41 le 04/12. ⚠ Mise en service sur cloud-1 (seul à tenir le pool) REFUSÉE par
  le garde-fou de la session : à déployer sur cloud-1 avant le 24/11 (première décision de renouvellement).

**Leboncoin, 1er signal de l'essai (04/11 18:58, lu dans `etat/essais/fond-f44b5917-2026-11-04.jsonl`)** :
- Refusée : `GET https://api.leboncoin.fr/api/account/v2/members/me/account` à **18:58:34.906**, Fetch émis dans l'onglet de
  travail Leboncoin (`/compte/part/mes-annonces`, ouvert par l'extension à 18:58:21) par la veille des commandes
  (`lireCommandesRecentes` : type du compte avant les transactions ; usage_logs `veille_commandes` « coupure »
  `compte_http_403` à 18:58:35). Cookies envoyés : la session + `datadome` ; réponse **403 + un `datadome` neuf posé** = la
  marque d'un refus DataDome sur un appel d'API. 13 s plus tôt (18:58:21.583), la page elle-même appelait le MÊME point
  d'accès avec les mêmes cookies : 200.
- Puis le script DataDome de la page a ouvert un cadre de glissière dans cet onglet caché (vu par le relevé des cadres à
  18:59:17, referer = cette API) → Leboncoin verrouillé, onglet fermé. Nico n'a rien vu : tout s'est passé dans un onglet
  de fond. ⚠ Le cadre lui-même n'est PAS dans l'enregistrement de fond (les cadres des onglets de travail n'y entrent pas :
  trou de l'enregistreur, à corriger) — son type (glissière `t=fe` ou blocage `t=bv`) n'est donc pas lu.
- Ce qui précède (le plus probable, NON prouvé) : depuis la connexion (18:48:55), la page « mes annonces » de Leboncoin a été
  rechargée dans un onglet de fond neuf **toutes les 2 min pile** (18:50:21, 18:52:21, 18:54:21, 18:56:21, 18:58:21 — tour
  du poll ; vraisemblablement le renouvellement du jeton de la page, `assurerJetonLeboncoin`), chaque fois avec ~25 appels
  d'API ; le refus tombe au 6e chargement, sur l'appel de plus. Même point d'accès refusé sur cloud-1 le 04/11 à 14:45
  (sonde du compte) : le signal ne vient donc pas de la machine seule.
- ⚠ Défaut du moteur Chrome (cloud-2) : la contre-visite automatique de 19:02:17 a échoué (« verrou sans exception par
  page » : l'exception par page n'existe que sur steel) → Leboncoin est resté verrouillé jusqu'au « Résoudre » de Nico
  (20:16:38 : lecture 200, aucune glissière, rouvert). Sur cloud-1, la contre-visite l'aurait rouvert seule à ~19:02.
- Réseau Supabase : `cloud_serveur_battre` a reçu une page d'erreur HTML à 19:21:48 et 19:51:33, un tour du planificateur a
  échoué à 19:21:50 (« schema cache ») — sans effet sur le navigateur.

**Pauses de messagerie (ordre de Nico, 20:2x)** : la pause Leboncoin née sur cloud-1 (403 de 17:02:37, jusqu'au 05/11 17:02)
tenait sur cloud-2 et le « Résoudre » de 20:16 ne la levait pas, ni la coupure de 24 h de la veille des commandes posée par
l'extension de cloud-2 à 18:58:34. Règle corrigée (`src/pausesMessagerie.js`) : une résolution réussie lève la pause de la
messagerie et la coupure de la veille de SA plateforme (base + stockage de l'extension) ; un changement de machine ou d'IP
dédiée (`cloud_postes.details.ouvert_sur`) repart sans les pauses de l'ancienne, mémoire comprise. Appliqué au compte de
Nico : `20261104_cloud_essai_gpu_pauses_messagerie_nico.sql` (Leboncoin et Beebs, bloquées avant la bascule ; + INVERSE)
et coupure de la veille Leboncoin retirée du stockage de l'extension de cloud-2 à 20:29 (avant : jusqu'au 05/11 18:58:34).
L'INVERSE de la bascule garde `ouvert_sur` : au retour, cloud-1 repart sans les pauses nées sur cloud-2.

**Leboncoin : la cause à la racine et sa correction (04/11 soir, ordre de Nico)** :
- 20:41 (heure du serveur) veille des commandes Leboncoin COUPÉE à la main sur cloud-2 (`veille_commandes_etat.leboncoin.coupee`,
  motif `coupe_par_nico_correction_0411`, 7 j) ; pause Leboncoin non levée. Une coupure « coupe_par_… » ne se lève qu'à la
  main (`pausesMessagerie.js`).
- La différence exacte (enregistrement de fond + client du site lu dans le cache HTTP du navigateur de cloud-2, AUCUNE
  requête) — mêmes cookies dans les deux cas (datadome compris) :
  · page (200) : `fetch` par le client « S » du site → `Authorization: Bearer <luat>`, `x-lbc-experiment: base64({version:1,
    rollout_visitor_id ← cookie cnfdVisitorId, rollout_user_id, experiment_visitor_id, experiment_user_id})`,
    `Content-Type: application/json`, `credentials: "include"`, Accept par défaut ; et la réponse est mise en cache de
    session (`sessionStorage["cache:https://api.leboncoin.fr/api/account/v2/members/me/account"]`, 300 s) ;
  · veille (403, Cloud) : `authorization: Bearer <luat>`, `accept: application/json` — sans `x-lbc-experiment` ni
    `Content-Type` ; même page, même monde (MAIN), 11 à 13 s après le chargement ;
  · veille sur PC : MÊME code, donc mêmes en-têtes (non capturé : aucun contact Leboncoin) — elle passe chez 8 comptes,
    refusée 5 fois chez 3 comptes (sur les transactions) : même défaut, toléré sur une IP résidentielle de maison.
- Correction (`scripts/leboncoin-comme-la-page.mjs`, une transformation appliquée au PC — `chrome-extension/` — ET à la copie
  Cloud — `build-extension-cloud.mjs`, sur d426d23) : le type du compte est LU dans le cache de session de la page (ventes,
  veille, mur « pro » de la publication), jamais redemandé ; les autres lectures de fond (transactions des ventes et de la
  veille, relevé des annonces `dashboard/v1/search`, messagerie : liste, messages, commandes, détail d'achat) partent avec
  la requête du client de la page (ses en-têtes, calculés comme lui depuis les mêmes cookies, credentials « include »).
  Aucune valeur inventée. Gestes (envoi de message, bordereaux) non touchés.
