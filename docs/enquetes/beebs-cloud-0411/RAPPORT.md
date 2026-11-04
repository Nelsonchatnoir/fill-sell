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
