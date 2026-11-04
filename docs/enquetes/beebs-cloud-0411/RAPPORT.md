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
