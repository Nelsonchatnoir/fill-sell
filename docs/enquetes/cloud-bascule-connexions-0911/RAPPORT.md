# « Me connecter » Cloud : Vinted ↔ Leboncoin en boucle entre deux écrans — 09/11/2026 soir

Cliente : Delphine Knowles (`d813639b-7555-4898-b0c7-f6dbc4c3d1a5`), essai Stripe démarré à 22:09 (acheté sur son PC),
essai arrêté par elle à 22:14:38 (Réglages, web mobile). Serveur : cloud-2, orchestrateur d9ee076698ac (depuis 20:56).

## 1. Ce qui s'est passé (prouvé : `usage_logs`, `cloud_connexions`, journal de l'orchestrateur, `auth.sessions`)

- **Deux appareils** : un PC (Windows, Chrome 156 ; sessions FillSell 22:05:49 → 22:08:00) et un téléphone Android (web
  mobile ; session créée à **22:13:04**).
- PC : retour de Stripe → « Me connecter » ouvert (`retour_stripe`, 22:10:14) ; Vinted ouvert puis fermé par elle 3 fois
  (22:10:20 → 22:12:14 : 44 s, 33 s, 23 s, raison `client`) ; 2e retour de Stripe 22:12:17 → **Leboncoin ouvert 22:12:23**
  (DataDome passé seul 22:12:28). Cette page reste ouverte sur le PC.
- Téléphone : 1re connexion à 22:13:04 → l'écran s'ouvre seul (`auto`, 22:13:05 : la clé « déjà ouvert » est par
  appareil) → elle touche **Vinted à 22:13:07**.
- Le serveur ne tient qu'une page par compte : il ferme Leboncoin (`remplacee`, code WebSocket **1000**, sans étape
  finale). La page du PC prend cette fermeture pour une coupure → **reprise automatique** 22:13:08 (n = 1) → le serveur
  ferme Vinted (`remplacee`) → le téléphone se reprend (n = 1) → … 15 connexions de 22:13:07 à 22:14:00, une toutes les
  1 à 2 s puis plus espacées (500 ms × 2ⁿ), n = 1 à 6 de chaque côté, `reprises_epuisees` côté Leboncoin à 22:14:00.
  Sous ses yeux : la page de connexion qui change de plateforme et « Une autre connexion est déjà ouverte : elle vient
  d'être fermée. » à chaque tour. 22:14:14 Réglages, 22:14:38 arrêt de l'essai.

## 2. Cause (la règle, pas le cas)

1. Serveur (`serveur-cloud/src/connexion.js`) : la page remplacée était fermée en 1000 sans étape finale ; la même page
   « reprise ailleurs » en 4409, sans étape finale non plus.
2. App (`src/cloud/MeConnecterCloud.jsx`) : toute fermeture sans étape finale = coupure → reprise automatique (01/11,
   pour l'app quittée le temps d'un SMS). Une reprise ouvrait la page comme un toucher : elle remplaçait l'autre.
   Deux écrans du même compte (deux appareils, deux onglets) se remplaçaient donc l'un l'autre jusqu'à épuisement.

## 3. Correctif — une seule connexion à la fois, jamais de bascule automatique

- **Serveur** : une page remplacée reçoit l'étape finale `remplacee` (+ `expire`, déjà une fin pour les apps d'avant ce
  correctif : l'iPhone et Android sans OTA s'arrêtent aussi) et le code 4409 ; une **reprise automatique**
  (`{ reprise: true }`) ne remplace JAMAIS une autre page ouverte (refusée, dite `remplacee`, l'autre reste ;
  `connexion_reprise_refusee` au journal) ; seul un toucher de la personne remplace ; la même page reprise ailleurs (app
  revenue après un SMS) passe à l'écran qui la rouvre et l'autre écran s'arrête ; arrêt du serveur = 1012 (coupure :
  la page se reprend, comme avant).
- **App** (web au push, mobile à la prochaine OTA) : fermeture 1000 / 4409 = voulue → fin « Une autre page de connexion
  FillSell Cloud s'est ouverte (sur cet appareil ou un autre) : celle-ci s'arrête, une seule à la fois… », trace
  `cloud_connexion_fin {etape: 'remplacee'}`, aucune reprise ; seule une coupure (1006, 1001, 1012…) se reprend ; chaque
  reprise se dit au serveur (`reprise: true`).
- Preuves : `selftest:cloud-orchestrateur` (3 tests neufs : deux écrans rejoués — la page remplacée s'arrête, la reprise
  automatique est refusée, aucune ligne de plus dans `cloud_connexions` ; même plateforme sur deux écrans ; 1012) ;
  `selftest:cloud-me-connecter` (6 bis : codes de fermeture, étape finale, drapeau de reprise, textes fr/en).

## 4. La question du pays (Vinted, correctif « France » a2a9246) — pas revenue de façon prouvée

- Correctif en service à 22:10 (orchestrateur d9ee076 depuis 20:56). Aux 3 ouvertures Vinted du PC : **aucun refus de
  navigation** (aucun pays touché, 0 `connexion_navigation_refusee` / `connexion_refus_apres_geste`), **aucun échec de
  pose du témoin** (0 `choix_pays_echec`). Les fermetures (44 s, 33 s, 23 s) sont les siennes, sans geste refusé.
- Limite : aucune image n'est gardée (`ENREGISTREMENT_CONNEXIONS=0`) ; ce qu'elle voyait ne se lit pas.

## 5. Déploiement

(voir l'état de prod `docs/agents/etat-2026-10-01.md`, 09/11 soir, terminal Cloud)
