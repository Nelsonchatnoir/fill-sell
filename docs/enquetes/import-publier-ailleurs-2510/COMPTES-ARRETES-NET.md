# Comptes « arrêtés » depuis le 24/10 vers 22:00 (Paris) : relevé du 25/10 à 16:07 (Paris)

Tout est en lecture seule : SQL sur `tojihnuawsoohlolangc` et logs ClickHouse (fenêtres de 24 h au plus).
Toutes les heures sont à Paris : UTC+2 le 24/10, puis UTC+1 à partir du 25/10 à 03:00. Entre 02:00 et 03:00
le 25/10, l'heure est ambiguë, donc on précise CEST ou CET.

## 1. Méthode, avec deux corrections à la méthode de départ

- **Fenêtres.** AVANT = du 22/10 00:00 au 24/10 22:00 (21/10 22:00Z → 24/10 20:00Z, découpé en trois requêtes).
  APRÈS = du 24/10 22:00 au 25/10 vers 16:07 (logs lus jusqu'à 15:05–15:10Z, `usage_logs` relu à 16:07).
- **« Page » (web et apps Capacitor)** = en-tête `x-client-info: supabase-js-web/…`. L'extension n'envoie pas
  cet en-tête. Ce filtre est plus fiable que `prefer ≠ return=minimal` : avec ce dernier, des envois de
  bordereaux faits par l'extension (POST storage en 400) étaient comptés comme venant de la page.
- **Plateforme, d'après le user-agent et le referer.**
  - iOS-app : WKWebView, sans « Safari/ », sans referer.
  - Android-app : « ; wv) » et referer `https://localhost/`.
  - iOS-Safari et Windows/Mac : Chrome ou Edge, referer `https://fillsell.app/`.
- **Correction 1 : un appel `set_app_build` ne veut pas dire que la personne est revenue.**
  - `App.jsx` (l. 2577–2612, HEAD d9e1819) recharge tout seul un onglet web ouvert, au plus 5 min après
    chaque déploiement : il interroge `/build.json` toutes les 5 min.
  - Fenêtres de déploiement observées (UTC) : 21:19:30–21:34:30 (a07091c / 8ffe23d), 00:03–00:11:30
    (a9ef815), 00:21:40–00:30 (ccf8c37), 10:08:50–10:31 (07df378 / d9e1819).
  - Un chargement sur ordinateur dans ces fenêtres est compté « auto ». Exemple : MeMiniandMove a
    30 chargements, qui sont des rafales de 5 à 8 dans la même seconde (plusieurs onglets) entre 23:26 et
    23:31, puis entre 02:05 et 02:25 (CEST). Aucun n'est un retour.
- **Correction 2 : une « action aboutie » ne passe pas toujours par `usage_logs`.**
  - Une relance de job en échec (`PATCH cross_post_jobs?status=eq.failed`) n'écrit rien dans
    `usage_logs`, mais elle aboutit. C'est le cas de XEWER et de Sébastien.
- **Réserve sur `usage_logs` (republish, source manuel).**
  - Une partie des lignes a été écrite d'un seul bloc, sans aucun appel RPC visible.
  - Thierry : 35 lignes au même horodatage (23/10 12:03:09.107448).
  - Amiral : 10 lignes le 22/10 entre 21:12 et 21:41, sans aucun `spend_coins_and_republish` dans
    `edge_logs` à ces heures.
  - Le compteur fiable d'un geste fait dans la page est donc l'appel RPC de la page.

## 2. Tableau par compte

Légende des abréviations :
- **chg** = chargements `set_app_build`. Pour APRÈS : total et, entre parenthèses, les manuels.
- **pub / rep** = RPC `spend_coins_and_publish` / `spend_coins_and_republish` appelés par la page.
- **gen / lens** = `generate-listing` / `lens-*` dans `function_edge_logs`.
- **UL** = `usage_logs`, dans l'ordre publish / republish manuel / generate_listing / lens.

Les comptes sont groupés par verdict ; chaque compte reprend la même liste de champs.

### BLOQUÉ (preuve)

**Jocabroc** · 53efea05 · pro · Windows Chrome 156
- Build et extension : d9e1819 ; extension 0.6.141, vue à 16:03.
- AVANT (22/10 → 24/10 22:00) : chg 14 ; pub/rep 11/20 ; gen 24 ; lens 0 ; UL 11/29/12/7 ; dernière action 24/10 14:00.
- APRÈS : chg 15 (12 manuels) ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : « Publier » à 12:44:31 puis à 14:21:54 sur la fiche importée Vinted 1792928353086006 →
  `demander_lecture_origine` à 12:44:39 et à 14:22:13 → aucun stepper, aucun `generate-listing`.
- Preuve : la lecture est faite par sa page à 14:24:37 (`lecture_origine_faite`), après 1 h 40 d'attente.
  Il recharge à 14:25 et à 15:11, sans nouveau clic jusqu'à 16:07.
- La fiche 1792780708414005 attend sa lecture depuis le 24/10 13:54.

### ACTIF NORMAL ou actions qui aboutissent

**Alizee** · ed4d2d4e · pro · iOS-app et Windows Chrome 109
- Build et extension : d2773bf (OTA 2.9.112, toujours sur l'iPhone à 15:54) ; extension 0.6.131, passée en
  0.6.141 le 25/10 à 14:16.
- AVANT (22/10 → 24/10 22:00) : chg 10 ; pub/rep 35/511 ; gen 119 (21 en ≥400) ; lens 0 ; UL 35/511/40/26 ;
  dernière action 24/10 21:23.
- APRÈS : chg 4 (4 manuels) ; pub/rep 0/**235** ; gen 0 ; lens 0 ; UL rep **235**.
- Refus ou tentatives :
  - 500 sur `rpc/republish_planifiee_etat_multi` à 15:14.
  - 22 fiches attendent leur lecture d'origine depuis le 24/10 entre 18:59 et 19:01.
- Verdict : ACTIF NORMAL à nouveau, avec 235 republications acceptées entre 15:55:10 et 15:56:18. À 16:07,
  2 sont publiées et 233 en file.
- L'« arrêt » du 24/10 venait d'elle :
  - 261 republications arrêtées à 20:40 (lancées entre 18:48 et 18:52) ;
  - 235 arrêtées à 22:45 depuis l'iPhone (lancées entre 21:22 et 21:23) ;
  - toutes étaient encore à l'étape `a_capturer` ;
  - 120 d'entre elles portaient `attente_antirobot_compte`.

**XEWER** · de63ca45 · pro · Android-app
- Build et extension : a07091c (OTA 2.9.113) ; extension 0.6.141, vue à 16:03.
- AVANT (22/10 → 24/10 22:00) : chg 11 ; pub/rep 7/0 ; gen 35 ; lens 7 ; UL 7/1/7/14 ; dernière action 24/10 20:00.
- APRÈS : chg 3 (3 manuels) ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : aucun.
- Verdict : ACTIF. À 05:47–05:48, il relance 8 publications Beebs en échec ; les 8 sont publiées entre 05:52
  et 06:02. Ses 26 republications auto continuent.

**Sébastien** · 48dd94f7 · business · Windows Chrome 155, iOS-Safari et iOS-app
- Build et extension : d9e1819 ; extension 0.6.141, vue à 15:11.
- AVANT (22/10 → 24/10 22:00) : chg 52 ; pub/rep 57/38 ; gen 59 ; lens 0 ; UL 57/40/56/0 ; dernière action **23/10** 17:15.
- APRÈS : chg 4 (3 manuels) ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : aucun.
- Verdict : ACTIF. À 13:42–13:43, il relance 6 publications Beebs en échec ; les 6 sont publiées entre 13:44
  et 13:52. Il a aussi demandé un bordereau à 12:05 et a 9 republications auto.

**Deborah Seghir** · f0acd3af · pro · iOS-app, Windows Chrome 152 et iOS-Safari
- Build et extension : 07df378 (OTA 2.9.115) ; extension **0.6.131**, vue à 10:28.
- AVANT (22/10 → 24/10 22:00) : chg 28 ; pub/rep 2/52 ; gen 1 ; lens 1 ; UL 2/52/3/2 ; dernière action 24/10 18:39.
- APRÈS : chg 14 (14 manuels) ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : aucun.
- Verdict : active autrement, et ses gestes aboutissent :
  - à 22:19, elle règle la republication planifiée (`republish_planifiee_regler` ×3) ;
  - à 07:43, elle connecte eBay (OAuth), puis 10 annonces eBay sont rattachées à 07:59 ;
  - à 08:38, elle tranche 2 doublons et fait 4 suppressions (2 jobs delete passés en `deleted`) ;
  - ses republications auto partent à 08:00 et à 08:42.

### REVENU, aucune tentative visible (pas de preuve de blocage)

**Camille201292** · 785352fe · premium · Windows Chrome 155 et iOS-app
- Build et extension : a07091c (OTA 2.9.113) ; extension 0.6.141, vue à 09:28.
- AVANT (22/10 → 24/10 22:00) : chg 25 ; pub/rep 0/56 ; gen 0 ; lens 0 ; UL 0/56/0/0 ; dernière action 24/10 19:56.
- APRÈS : chg 5 (2 manuels) ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : aucun.
- Verdict : revenue sur iOS à 07:45 et 07:48. Synchros à 07:45 (iOS) et 09:09 (Windows), sans tentative.

**Thierry Dubois** · c2175e91 · pro · Windows Edge 155
- Build et extension : ccf8c37 ; extension 0.6.141, vue à 13:11.
- AVANT (22/10 → 24/10 22:00) : chg 12 ; pub/rep 119/0 ; gen 123 ; lens 0 ; UL 119/35*/120/0 ; dernière action **23/10** 12:17.
- APRÈS : chg 1 (1 manuel) ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : aucun.
- Verdict : revenu une fois à 09:54 (une synchro). Il s'était arrêté le 23/10.

**Vincent A.** · 67a8b907 · free · Windows Chrome 156 et Android-app
- Build et extension : d9e1819 ; extension 0.6.141, vue à 16:02.
- AVANT (22/10 → 24/10 22:00) : chg 20 ; pub/rep 5/50 ; gen 6 ; lens 0 ; UL 5/50/5/5 ; dernière action 24/10 14:09.
- APRÈS : chg 6 (2 manuels) ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives :
  - 403 sur `PATCH profiles` ×2 à 23:46–23:47 (Android) ;
  - erreur auth `/token` 504 à 15:13.
- Verdict : revenu sur Android à 23:46, sans geste. Ses republications ne sont pas bloquées par l'app :
  - 29 sont retenues par le serveur depuis le 24/10 14:09 (`isbn_capture_non_standard`, en attente de
    l'extension 0.6.143) ;
  - 3 sont en `needs_user` (connexion Vinted).

**Asma** · 7d6e2c34 · free · Android-app
- Build et extension : 07df378 (OTA 2.9.115) ; extension 0.6.141, vue à 10:34.
- AVANT (22/10 → 24/10 22:00) : chg 16 ; pub/rep 2/5 ; gen 3 ; lens 1 ; UL 2/5/2/2 ; dernière action 24/10 14:47.
- APRÈS : chg 2 (2 manuels) ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : 403 sur `PATCH profiles` à 12:50.
- Verdict : revenue 1 min à 12:50 pour modifier une vente (`PATCH ventes`).

### PAS REVENU (aucun geste)

**MeMiniandMove** · 63ad8597 · pro · Mac Chrome 155
- Build et extension : ccf8c37 ; extension 0.6.141, vue à 03:11 (CET).
- AVANT (22/10 → 24/10 22:00) : chg 118 ; pub/rep 1/11 ; gen 1 ; lens 0 ; UL 1/11/1/0 ; dernière action 24/10 18:42.
- APRÈS : chg 30 (0 manuel) ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : aucun.
- Verdict : les 30 chargements sont des rechargements automatiques d'onglets après déploiement. Son poste est
  muet depuis 03:11.

**Amiral** · faf5021a · business · Windows Chrome 155
- Build et extension : d9e1819 ; extension 0.6.141, vue à 16:02.
- AVANT (22/10 → 24/10 22:00) : chg 14 ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0/10*/0/0 ; dernière action **22/10** 21:41.
- APRÈS : chg 4 (0 manuel) ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : aucun.
- Verdict : les 4 chargements sont automatiques. Ses 37 republications auto continuent (la dernière à 15:42).

**dbz70** · 4c26231d · premium · Windows Chrome 155
- Build et extension : ccf8c37 ; extension 0.6.141, vue à 02:56 (CET).
- AVANT (22/10 → 24/10 22:00) : chg 15 ; pub/rep 0/98 ; gen 0 ; lens 0 ; UL 0/98/0/0 ; dernière action **23/10** 15:54.
- APRÈS : chg 4 (1 isolé) ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : aucun.
- Verdict : 3 chargements automatiques et 1 isolé à 02:56 (CET), sans geste.

**Juliette .Roy** · c03be4f1 · free · Mac Chrome 150
- Build et extension : d9e1819 ; extension 0.6.141, vue à 14:28.
- AVANT (22/10 → 24/10 22:00) : chg 7 ; pub/rep 0/34 ; gen 0 ; lens 0 ; UL 0/34/0/0 ; dernière action 24/10 20:15.
- APRÈS : chg 3 (1 isolé) ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : 403 sur `PATCH profiles` à 23:30.
- Verdict : 2 chargements automatiques et 1 isolé à 03:59, sans geste.

**Srideals** · 7153db13 · free · Windows
- Build et extension : 13a3716 (onglet du 24/10 19:31) ; extension 0.6.141, vue à 06:05.
- AVANT (22/10 → 24/10 22:00) : chg 14 ; pub/rep 1/18 ; gen 2 ; lens 0 ; UL 1/18/1/0 ; dernière action 24/10 11:04.
- APRÈS : chg 0 ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : 403 sur `PATCH profiles` à 11:08.
- Verdict : l'onglet du 24/10 s'est réveillé à 05:49 (401 puis session rafraîchie), sans geste.

**Alicéane** · 7f278761 · free · Windows Chrome 154
- Build et extension : 4309aac ; extension 0.6.141, vue à 10:14.
- AVANT (22/10 → 24/10 22:00) : chg 2 ; pub/rep 0/16 ; gen 0 ; lens 0 ; UL 0/16/0/0 ; dernière action **23/10** 12:44.
- APRÈS : chg 0 ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : aucun.
- Verdict : aucune requête de page.

**Glowik** · 869e5f03 · premium · Windows
- Build et extension : 6551d21 ; extension 0.6.131, vue le 24/10 à 20:12.
- AVANT (22/10 → 24/10 22:00) : chg 7 ; pub/rep 2/4 ; gen 3 ; lens 0 ; UL 2/4/2/0 ; dernière action 24/10 02:41.
- APRÈS : chg 0 ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : aucun.
- Verdict : aucune requête. Une fiche attend sa lecture d'origine depuis le 24/10 02:39.

**kevin pro louel** · fd7bf936 · free · Android-app et Windows
- Build et extension : 231ec28 ; extension 0.6.141, vue à 16:02.
- AVANT (22/10 → 24/10 22:00) : chg 14 ; pub/rep 3/0 ; gen 6 ; lens 2 ; UL 3/0/3/5 ; dernière action **23/10** 22:30.
- APRÈS : chg 0 ; pub/rep 0/0 ; gen 0 ; lens 0 ; UL 0.
- Refus ou tentatives : aucun.
- Verdict : aucune requête de page.

\* Ces lignes `usage_logs` ont été écrites en bloc, sans appel RPC visible (voir la réserve du §1).

Les identifiants viennent de `profiles` : username, email et nom dans `auth.users`. Les cas ambigus sont
tranchés par l'extension active :
- « Sébastien » = 48dd94f7, sebastien64310, business ;
- « Asma » = 7d6e2c34, abenjemaa, et non « Asma Afif ».

Le palier vient de `palier_de()`.

### Requêtes de page en statut ≥ 400 APRÈS
Sur les 17 comptes, avec le filtre `x-client-info` page :
- 403 sur `PATCH /rest/v1/profiles` : Vincent ×2, Srideals, Asma, Juliette. Ce 403 silencieux est ancien et
  touche l'écriture du profil, pas la publication.
- 500 sur `rpc/republish_planifiee_etat_multi` : Alizee ×1 à 15:14.

Aucun refus sur `spend_coins_*`, `generate-listing` ou `lens-*`.

### `auth_logs` APRÈS
Pour ces 17 `user_id`, une seule erreur : Vincent A., `/token` 504 `request_timeout` à 15:13. Sur le parc, il y
a des timeouts auth diffus (`/user` 504 ×53 ; `/token` 504/500 ×12 entre 15:13 et 15:36), sans lien avec ces comptes.

## 3. Signature « clic Publier → demander_lecture_origine, puis aucun generate-listing en 10 min »

Calcul fait dans ClickHouse : tableau des appels `demander_lecture_origine` (POST, edge_logs) comparé, par
utilisateur, aux appels `generate-listing` (function_edge_logs).

| Période | Appels dlo | Sans suite ≤10 min | Comptes |
|---|---|---|---|
| 20/10 et 21/10 | 0 | 0 | La RPC date du 22/10 au soir ; les logs existent (1,63 M lignes edge_logs le 20/10) |
| 22/10 | 8 | 0 | 1 (Alaah f554921c) |
| 23/10 | 12 | 7 | 3 (Jocabroc 6 dont 4 sans suite, 17fda645 3/3, 447d920c 3/0) |
| 24/10 jusqu'à 22:00 | 59 | 15 | 7 (Alizee 30/0, Marta 13/5, chaouidz 12/7, d4dfdba5 1/1, d71db658 1/1, Glowik 1/1, Jocabroc 1/0) |
| **AVANT, total** | **79** | **22 (28 %)** | |
| **APRÈS (24/10 22:00 → 25/10 16:05)** | **16** | **13 (81 %)** | 5 |

Détail de l'APRÈS :
- **3f91c02e** : 7 appels dlo entre 22:50 et 22:54 ; lecture faite entre 23:00 et 23:02 ; generate-listing
  à 23:02 et 23:03. Délai de 8 à 12 min, donc l'attente s'est résolue.
- **447d920c** : 5 appels dlo entre 10:29 et 10:32 ; lecture faite à 10:50:39 ; 9 generate-listing entre
  10:51 et 10:54. Délai d'environ 20 min, résolu.
- **66cf5b1f** : 1 appel dlo à 09:07 ; generate-listing à 09:15. Résolu.
- **Jocabroc** : 2 appels dlo, à 12:44:39 et à 14:22:13. Aucun generate-listing.
- **Hassan Said** (bf85d176) : 1 appel dlo à 10:58:20. Jamais lu : son extension 0.6.128 n'a pas été vue
  depuis le 22/10.

`lectures_origine_demandees` encore ouvertes (`faite_le` NULL) à 16:03 : **27**, dont Alizee 22 (24/10
18:59–19:01), Jocabroc 1 (24/10 13:54), Glowik 1, Hassan Said 1, cheze camille 1 et Malo Vermersch 1.
Aucune fiche n'est disparue ni vendue.
La « lecture de fond » (`usage_logs.lecture_fond`, 73 lignes depuis 14:14) n'existe que chez Nico, en
mesure, sur le build `d9e1819-dirty`. Elle n'est pas en production.

## 4. Détection générique sur tout le parc

Rappel des lignes d'action APRÈS, à 16:07 :
- sur le parc, **28 comptes** (Alizee comprise) en ont : 105 publish, 622 republish manuel,
  76 generate_listing, 24 lens ;
- côté RPC de page, on compte `spend_coins_and_publish` ×104 et `spend_coins_and_republish` ×623, avec
  **0 erreur** ;
- par plateforme : web Windows, app iOS et app Android ;
- pour comparer, AVANT (70 h) il y avait 54 comptes et 2 653 actions, soit environ 38/h ; APRÈS (environ
  18 h) environ 46/h. Il n'y a pas de chute globale.

Profil recherché : au moins 3 chargements depuis le 24/10 22:00, au moins 10 actions entre le 22 et le 24/10,
et 0 action depuis.
- **Avec le critère brut** (`set_app_build`, rechargements automatiques compris), à 16:07 : **11 comptes**.
  Ce sont Sébastien, dbz70, Vincent A., Alaah (f554921c, free, absente de la liste de Nico), Deborah,
  Jocabroc, Camille201292, Juliette .Roy, XEWER, MeMiniandMove et Amiral. Alizee en est sortie à 15:55.
- **Sans les rechargements automatiques** (au moins 3 chargements manuels) : **5 comptes**.
  Ce sont Deborah (14), Jocabroc (12), XEWER (3), Sébastien (3) et Alaah (3).
  - Une seule tentative bloquée est prouvée : Jocabroc.
  - XEWER et Sébastien ont des relances qui ont abouti.
  - Deborah a des gestes qui ont abouti (planification, eBay, suppressions).
  - Alaah est revenue à 22:12 et 23:07 sur l'app iOS, puis à 15:32 sur Windows, avec des synchros à 15:54.
    Aucune tentative.
- La détection ne fait apparaître **aucun autre groupe de comptes bloqués** sur le parc.

## 5. Versions

- **Les 17 comptes ne sont pas sur un build commun.** Leurs `app_build` actuels se répartissent ainsi :
  d9e1819 (Jocabroc, Sébastien, Vincent A., Juliette, Amiral), 07df378 (Deborah, Asma), ccf8c37 (MeMini,
  Thierry, dbz70), a07091c (Camille, XEWER), d2773bf (Alizee), 13a3716 (Srideals), 231ec28 (kevin),
  6551d21 (Glowik) et 4309aac (Alicéane).
- **Les 28 comptes actifs APRÈS tournent sur les mêmes builds** : 07df378 (12), d9e1819 (10), a9ef815 (3),
  d2773bf (2, dont Alizee) et a07091c (1). Le build ne fait donc pas la différence.
- **Correspondance des builds** (`BUILD_ID` → heure Paris) :
  - web : 2737577 (20:59), a07091c (23:19), 8ffe23d (23:26), a9ef815 (02:03 CEST), ccf8c37 (02:21 CEST),
    07df378 (11:08) et d9e1819 (11:22) ;
  - OTA observées : 2.9.112 = d2773bf, encore sur l'iPhone d'Alizee à 15:54 ; 2.9.113 = a07091c (Camille
    sur iOS à 07:48, XEWER sur Android à 05:48) ; 2.9.115 = 07df378 (Deborah sur iOS à 12:09, Asma sur
    Android à 12:50).
- **Mac.** Aucune action Mac sur le parc après 22:00. Les deux comptes Mac de la liste (MeMiniandMove,
  Juliette) ne sont pas revenus à la main, donc ce n'est pas concluant. Avant, des actions Mac aboutissaient
  (Juliette 34 rep, Ornella 11 rep, MeMini 1 pub le 24/10).

## 6. Limites de l'analyse

- Un clic arrêté dans la page avant tout appel au serveur ne laisse aucune trace : bouton grisé, modale de
  rappel d'extension, `repubEnPause`, `extensionNeverSeen`. « Aucune tentative visible » ne prouve donc pas
  que la personne n'a rien essayé.
- La rétention des logs suffit : les données du 20/10 sont présentes.
- Les comptes revenus pendant la rédaction ont été relus à 16:07. C'est le cas d'Alizee, revenue à 15:54–15:56.
