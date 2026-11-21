# Nuit du 20 au 21/11/2026 — Cloud : codes Vinted, enregistrement, IP 72.9.x ; rouges 1, 2 et 3

Heures de Paris. Règles durables : `docs/regles/extension-et-versions.md` (§ 21/11 nuit, P0 et compléments 1 à 3),
`docs/regles/plateformes.md` (§ 21/11 nuit, rouges 1, 2 et 3).

## Priorité 0 — code Vinted sur le Cloud (alisonbertincourt, melinemaros)
- Journaux sans la réponse de Vinted (enregistrement coupé, relecture du champ = sa longueur seulement) : cause exacte non
  prouvable après coup. Correctif (commit 0c450c6) : relecture de la page 2,5 s après chaque validation (messages d'erreur
  visibles, champ du code encore là), journal `connexion_code_reponse`, phrase de la plateforme redite dans le bandeau.

## Complément 1 — 3e tentative d'alisonbertincourt (23:46:43 → 23:47:56)
- Événements (usage_logs `cloud_connexion_code_etat`) : demande 23:47:16 (longueur 0) ; saisie 23:47:22 (2 frappes,
  longueur 2 : tapé, rien de collé) ; 17 validations 23:47:24 → 23:47:51, TOUTES avec longueur 4 et `envoyee: true`
  (bouton actif, clic parti vers la page ; 1 par Entrée, champ au clavier). Longueur attendue non lue (`attendue: null`).
- Ce que la page en a fait (requête vers Vinted, réponse) : non enregistré à ce moment-là.
- Lecture : 6 s entre la demande du code et la première frappe — trop tôt pour le nouvel e-mail. Trois codes en 7 min :
  23:40:50 (1re page), 23:43:25 (2e), 23:47:16 (3e). Chronologie serveur : 23:42:19 reprise de la page du code 1 (après
  rechargement) ; l'autre écran reçoit « remplacée, ferme puis rouvre » ; 23:42:30 « Fermer » → page et demi-session purgées
  (code 1 perdu) ; 23:42:33 et 23:42:45 nouvelles pages → code 2 à 23:43:25 ; 23:45:22 partie lire son e-mail ; 23:45:28
  toucher Leboncoin sur la carte du Stock → page Vinted remplacée, purgée (code 2 perdu) ; 23:46:44 nouvelle page → code 3.
  Elle a vraisemblablement tapé le code 2, annulé par le 3. Racine corrigée : complément 3a.

## Complément 2 — enregistrement des connexions (cloud-2)
- `ENREGISTREMENT_CONNEXIONS=1` posé dans `/srv/fillsell-cloud/.env` au redéploiement (avant : 0 ; sauvegarde du .env).
- Masquage (tests `vue-bureau.test.mjs`) : chemins sans e-mail ni suite de 4 chiffres ; réponse des étapes de connexion
  gardée en forme/statuts/messages seulement ; 48 h de conservation (connexions seulement).

## Complément 3a — page de code jamais jetée
- « Fermer » pendant un code valable (< 10 min) : la page reste ; rouvrir la reprend. Autre plateforme touchée : retenue une
  fois avec l'explication, remplacée au 2e toucher. Tests `simulation.test.mjs` (« 21/11 nuit », 2 nouveaux, 2 mis à jour).

## Complément 3b — IP 72.9.x
| IP | id | état | AS | ip-api proxy | Beebs accueil | glissière Vinted vue |
|---|---|---|---|---|---|---|
| 72.9.168.234 | 81 | essai (melinemaros) | 25369 Hydra | oui | 406 | **oui, 20/11 21:05** |
| 72.9.173.132 | 76 | essai (Muriel) | 2914 NTT | non | 200 | non |
| 72.9.175.143 | 80 | libre, saine | 2914 NTT | non | 200 | — |
| 72.9.168.8 | 88 | libre, saine | 25369 Hydra | oui | 406 | — |
| 72.9.168.93 | 98 | libre, saine | 25369 Hydra | oui | 406 | — |
| 72.9.171.86 / .169.119 / .169.140 | 82 / 96 / 103 | libres, grillées (sortie GB) | 25369 Hydra | oui | 406 | — |
| 72.9.172.149 | 89 | rebut | 2914 NTT | — | — | — |
| 72.9.172.131 | 43 | repos, suspecte | 2914 NTT | non | 200 | — |
- Glissières DataDome Vinted vues sur cloud-2 depuis le 16/11 : une seule (81). Règle `proxyRefusee` : profil proxy + refus
  anti-robot à l'accueil → échec de sortie `sortie:proxy_refusee` (plus d'essai, hors « 2 saines libres »). 88 et 98 sortent
  au prochain contrôle ; 81 et 76 ne sont pas touchées (jamais d'écriture sur une IP tenue).
- Stock sain restant (proxy = false, 200 partout) : 80, 91, 92, 93, 94, 95, 97, 101 (+ 99 Beebs 403, 102 proxy sans refus).

## Rouges
- **1** (noubliejamais) : rayon Vinted repris de la capture de l'annonce ; sinon message clair « choisis son rayon ».
- **2** (stefcarpro) : refus passager Leboncoin = message neutre, retiré quand Leboncoin répond ; la vraie pause inchangée.
- **3** (alisonbertincourt) : l'ordinateur d'un compte au Cloud dont l'eBay n'est pas relié garde eBay (seulement), et les
  « relie ton eBay » se lèvent à son passage. Son retrait 4d9e6c68 (annonce 880138254503) part au prochain passage de son
  ordinateur (vu pour la dernière fois le 20/11 à 23:56:47) — aucune autre voie : eBay non relié à l'API, le Cloud ne fait pas eBay.
