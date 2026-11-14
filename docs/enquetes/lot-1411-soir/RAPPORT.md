# Lot du 14/11 soir — Kiabi sur le Cloud, eBay 25007, ventes d'une vieille extension (heure de Paris)

Comptes désignés par leur id8. Aucun mail, rien chez Stripe, aucune action à la place d'une cliente.

## 1. af37fa49 — connexion Beebs « Continuer avec Kiabi » sur le Cloud

**a) Ce qu'a vu la session de 17:17** (enregistrement cloud-2 `etat/essais/beebs-2026-11-14T16-17-47-292Z-connexion.jsonl`,
426 lignes, et journal de l'orchestrateur) :
- 17:17:47 page `www.beebs.app/fr/auth` servie (200), prête à 17:17:50 (ni captcha ni blocage).
- 17:17:49.9 toucher sur « Continuer avec Kiabi » → fenêtre Firebase de Beebs (`babytouch-782e4.firebaseapp.com/__/auth/…`,
  `createAuthUri` 200) → 17:17:52.3 `identity.kiabi.com/oauth/authorize` **passe** (correctif 1dd38b9 de 15:39) et répond
  **303** → 17:17:52.57 `www.kiabi.com/account/auth` **refusée** (`ERR_BLOCKED_BY_CLIENT`, « inspector » ; journal
  `connexion_navigation_refusee` + `connexion_refus_apres_geste`) → fenêtre fermée, message « lien refusé ».
- 17:18:04 second toucher, même chemin, même refus à 17:18:05.5. Écran fermé par la cliente à 17:18:22 (« client »).
- La page Kiabi ne s'est donc JAMAIS affichée : l'arrêt est à la redirection de Kiabi vers sa propre page de connexion.

- 7e essai de la cliente pendant ce lot, à 20:03:53 (`beebs-2026-11-14T19-03-53-102Z`) : même refus à 20:03:59 et 20:04:12.

**Cause prouvée** : la liste des chemins permis de `www.kiabi.com` (devinée le 30/10) ne contenait pas `/account/auth`.
Plus largement : une redirection du FOURNISSEUR vers une page de son propre site était jugée comme un lien touché.

**b) Règle (tous les comptes, Kiabi et Google / Apple / Facebook)** — `serveur-cloud/src/plateformes.js` +
`connexion.js` :
- l'espace de connexion du compte Kiabi est permis (`/account/auth…`, création, mot de passe oublié, vérification),
  jamais le reste du site (boutique, commandes) ;
- `redirectionFournisseur` : une redirection serveur (3xx, `Fetch.requestPaused.redirectedRequestId`) d'une page de
  connexion permise d'un fournisseur vers une page de SON site est suivie (page exacte, pour ce « Me connecter ») ; la
  chaîne aussi ; jamais un autre site, jamais deux projets Firebase, jamais en clair ; un lien touché reste jugé comme
  avant. Vaut pour Google (`myaccount.google.com`…), Apple (`account.apple.com`…), Facebook (`/recover/…`).
- Verrou `selftest:cloud-connexion-kiabi` (4 tests ; rouge sur le code d'avant : « www.kiabi.com/account/auth
  (17:17:52, 17:18:05) passe » échoue).
- Déployé : orchestrateur cloud-2 1dd38b99cb5f → **13221aaa56f0** (20:15:14, santé OK, image Chrome et CRX inchangés).
- **Essai réel unique** (compte de Nico f44b5917, `outils/essai-connexion-sso.mjs … beebs auto Kiabi 45`, 20:16) :
  « Connexion avec Kiabi » touché → la fenêtre affiche `www.kiabi.com/account/auth` (« Authentification — Créez votre
  compte ou connectez-vous… E-mail, Continuer, Google, Apple ») ; journal 20:16:27.874 `connexion_redirection_fournisseur`
  identity.kiabi.com/oauth/authorize → www.kiabi.com/account/auth, aucun refus ; rien saisi ; Beebs de Nico resté connecté
  (`connectee: true`, aucune purge). Le retour vers Beebs après la saisie Kiabi (identity.kiabi.com puis le gestionnaire
  Firebase, retour déclaré) ne se prouvera qu'avec une vraie connexion Kiabi.

**c) « Me connecter » de 17:49 sans connexion** : `cloud_me_connecter_clic` 17:49:16 → écran ouvert et visible 17:49:17 →
`cloud_connexion_carte_vue` (Stock) à 17:49:32. La carte du Stock ne se monte QUE écran fermé (`!meConnecterOuvert`) :
l'écran a été refermé 15 s après, et AUCUNE ligne n'a été touchée (`cloud_connexion_ouverte` s'écrit au tout premier
instant d'un toucher, avant tout réseau ; aucun `cloud_me_connecter_erreur`). Aucun appel n'a atteint cloud-2 entre
16:30 et 17:39 (journal). Ce n'était pas une panne, mais il a fallu le DÉDUIRE.
Correctif : chaque toucher d'une ligne est tracé (`cloud_me_connecter_ligne_clic`) et la fermeture aussi
(`cloud_me_connecter_ferme` : durée, lignes touchées, `aucune_touchee`). Verrou `selftest:cloud-me-connecter-ferme`
(rouge avant : 0/6).

**d)** Aucun essai sur son compte ni son poste ; ses tâches en file non touchées ; aucun mail.

## 2. 13e274de — un article refusé par eBay (25007)

**a) Cause prouvée (base + journaux d'ebay-account)** : ce n'est pas l'article. Les 82 réussites du jour portaient toutes
une règle de livraison CHOISIE pour l'article (325352930011, 325351779011…). L'article refusé n'en avait pas : il part avec
la règle du COMPTE, 327113190011 = « Livraison FillSell » créée par l'app (`poser_livraison`) à 02:32, réécrite à 02:34 puis
à **10:14:32** (Shop2Shop, Lettre suivie, Mondial Relay, Colissimo). Avec elle : 5 mises en ligne réussies de 03:38 à
08:42 (dont un bracelet, même catégorie 50637) ; après 10:14 : **6 refus 25007 sur 6** (10:55 → 19:12, cinq catégories,
1,90 € à 14,90 €), aucune réussite. Le contenu exact de la règle n'a pas été relu chez eBay (lecture avec le jeton de la
cliente non faite) : le champ précis qui la rend invalide reste à lire.

**b) Règle (tous les comptes)** — `_shared/ebay-livraison-refusee.js` + `ebay-api-worker` : refus 25007 sur la règle du
compte → FillSell retient pour CET article une autre règle du vendeur, prouvée par une mise en ligne réussie du compte dans
les 30 jours ET toujours présente sur son compte eBay (liste relue), d'abord la plus servie dans la même catégorie ; une
seule fois par article. Sinon (aucune prouvée, liste illisible, règle choisie par la personne, remplacement déjà
essayé) : message clair « … Choisis une règle de livraison pour cet article (Livraison eBay › Changer), puis relance ».
Rien n'est créé ni modifié chez eBay. La règle servie est notée à chaque mise en ligne (`ebay_api.fulfillment_policy_id`).
Verrou `selftest:ebay-livraison-refusee` (24 ; rouge avant : 0/8). Déployé : ebay-api-worker 131 → **132** (20:10:53,
`verify_jwt` false relu avant et après ; démarrage vu à 20:16:06).

**c) Relance NON faite** : le job 7b2c5d53 a été relancé une 2e fois depuis l'app à 19:58:05 (ancien worker : 25007 de
nouveau à 19:58:11), puis **annulé depuis l'app (« Ta file ») à 20:01:52** — avant le déploiement du correctif. Le relancer
irait contre cette annulation : rien fait (le script `scripts/reparations/20261114_relance_ebay_25007_13e274de.sql`, prêt,
refuse d'ailleurs un job qui n'est plus `needs_user`). La prochaine publication eBay du compte sans règle choisie passera
par la règle (remplacement par 325352930011 pour un bijou, d'après ses mises en ligne).

## 3. Comptes au Cloud — ventes et relevés d'une extension de PC antérieure à 0.6.190

Les anciennes extensions relèvent d'elles-mêmes (alarmes : relevé Vinted « cron », relevé quotidien des annonces et des
ventes) et le serveur acceptait `enregistrer_ventes_relevees`, `commandes_vinted_noter` et les écritures directes de
`vinted_sync_runs`. Migration **20261114200000_ventes_releves_poste_cloud_seul** (corps de prod relus, garde md5) :
compte au Cloud actif → l'écriture d'un AUTRE POSTE D'EXTENSION que le poste Cloud est ignorée (ventes : « compte_cloud »,
rien enregistré ; relevé : non créé, l'extension passe à la suite). Inchangés : comptes sans Cloud, poste Cloud, app,
rôle service ; ventes déjà enregistrées non touchées. Banc jetable `selftest:ventes-poste-cloud-seul` (32/32 : vente
refusée depuis le PC sur compte Cloud, acceptée depuis le poste Cloud, réponse identique sur un compte sans Cloud,
inverse = corps de prod octet pour octet). **PRÉPARÉE, NON appliquée** : feu vert explicite de Nico sur CETTE migration
requis (règle du 07/08). **APPLIQUÉE le 14/11 à 20:28:50 sur feu vert de Nico** (md5 avant = banc ; repair fait).
  Job 7b2c5d53 : laissé annulé (décision de Nico).

## Livraison
- Commits 13221aa (code, docs) + dab79d9 (app 2.9.194), poussés 20:18:07. Suite 778/778 (par morceaux), lint identique à
  HEAD, build:essai vert.
- Web **dab79d9** (build.json 2026-11-14T19:19:24Z+dab79d9, entrée de l'app 200 avec Origin) ; **OTA 2.9.194** (canal
  production relu : 2.9.194, dab79d9 ; module natif rendu octet pour octet).
- Extension : inchangée (aucun fichier de `chrome-extension/` touché) — rien de neuf à téléverser.
