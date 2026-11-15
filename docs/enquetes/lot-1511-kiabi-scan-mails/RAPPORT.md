# Lot du 15/11 — Cloud Beebs via Kiabi (af37fa49), scan eBay unique, mails Cloud (heure de Paris)

Comptes désignés par leur id8. Aucun mail à un utilisateur (deux mails de test à l'adresse de Nico seulement), rien chez
Stripe, aucun quota, prix ni offre changé, rien fait à la place de la cliente, rien modifié à la main sur son compte.

## Point 1 — af37fa49 : connexion Beebs « Connexion avec Kiabi » sur le Cloud

### a) Le déroulé exact — QUATRE sessions ce matin, pas deux
Sources : enregistrements cloud-2 `etat/essais/beebs-2026-11-15T06-43-19-152Z`, `T06-45-17-174Z`, `T06-58-59-349Z`,
`T08-36-29-965Z` (`-connexion.jsonl` : chaque requête de la page Beebs et de la fenêtre Kiabi, chaque toucher) ;
`usage_logs` et `cloud_connexions` du compte ; journal de l'orchestrateur fea32cebd669 (sessions 3 et 4).
⚠️ Le journal de 13221aaa56f0 (sessions 1 et 2) a disparu au redéploiement de 07:55 (conteneur recréé) : corrigé, voir c).

| # | Ouverte → fermée | Kiabi affichée | E-mail accepté | Mot de passe accepté | Code demandé | Code renvoyé à Kiabi | Fin |
|---|---|---|---|---|---|---|---|
| 1 | 07:43:19 → 07:45:11 | 07:43:26.8 | 07:43:56.9 | 07:44:03.99 | 07:44:04.9 | jamais | fermée par elle (« client ») |
| 2 | 07:45:17 → 07:52:00 | 07:45:21.0 | 07:45:42.7 | 07:45:50.77 | 07:45:51.3 | jamais | « expiree » : 5 min sans geste |
| 3 | 07:58:59 → 08:00:17 | 07:59:04.1 | 07:59:25.8 | 07:59:33.17 | 07:59:34.1 | jamais | fermée par elle |
| 4 | 09:36:30 → 09:37:38 | 09:36:34.2 | 09:36:48.6 | 09:36:55.2 | 09:36:56.1 | jamais | fermée par elle |

Chaque session, à l'identique :
- `www.beebs.app/fr/auth` (session 1 : 403 DataDome, interstitiel passé seul à 07:43:22) → toucher « Connexion avec
  Kiabi » → fenêtre Firebase de Beebs → `identity.kiabi.com/oauth/authorize` **303** → `www.kiabi.com/account/auth` **200**
  (`connexion_redirection_fournisseur`, le correctif du 14/11 fonctionne) ; DataDome de Kiabi passé seul (session 1 :
  trois interstitiels, 07:43:30, 07:43:44, 07:43:55) ;
- e-mail validé (`/account/_next/data/…/signIn.json`), puis mot de passe : `identity.kiabi.com/identity/v1/password/login`
  **200** → `/identity/v1/mfa/stepup` **200** → `/identity/v1/passwordless/start` **200** → page `signInWithCode` ;
- puis PLUS AUCUNE requête vers Kiabi : aucun code n'a jamais été soumis (une saisie validée ferait partir l'appel de
  vérification puis `/account/codeExchange`). Session 2 : app quittée 13 s après la page du code, reprises à 07:46:04
  (n = 1) et 07:46:28 (n = 2) — le passage par la boîte mail —, derniers gestes 07:46:59, fermée 5 min après. Session 4 :
  app quittée 10 s après (09:37:06), revenue 5 s plus tard (09:37:11). Sessions 1, 3, 4 : séries de touchers rapides sur
  la zone du code (07:45:06 → 07:45:08 ×7, 08:00:13 → 08:00:14 ×4, 09:37:23 → 09:37:24 ×4), puis fermeture.
- Aucun refus de FillSell dans les 4 sessions : aucune requête `bloquee`, aucun ERR_BLOCKED_BY_CLIENT, aucun
  `connexion_navigation_refusee`.

### b) La cause réelle, preuve à l'appui
**Kiabi exige une vérification en deux étapes pour un appareil qu'il ne connaît pas** : après le mot de passe, un code à
6 chiffres envoyé PAR E-MAIL. Texte réel de la page, lu le 15/11 dans `www.kiabi.com/account/_next/data/…/auth.json`
(clés `page.signIn.withCode`) : « Sécurité avant tout ! Pour protéger votre compte on vous demande une étape de
vérification rapide. » / « Saisissez le code à 6 chiffres reçu par e-mail » / « Votre code à 6 chiffres » / « Envoyer un
nouveau code » / « Pensez à consulter vos spams ». Le navigateur Cloud est un appareil neuf pour Kiabi (et la demi-session
Beebs est purgée à chaque abandon) : le code est redemandé à chaque essai — 4 codes envoyés ce matin. C'est un mur que
seule elle peut franchir (lire son e-mail). Ce que FillSell faisait pendant ce temps :
- rien n'était dit du code (message resté « Connecte-toi comme d'habitude. ») ;
- la page se fermait au bout de 5 minutes sans geste — le temps d'aller lire l'e-mail compris — sur « Fermé après un
  moment sans geste » (session 2), sans un mot sur le code.
Non prouvable : l'arrivée de l'e-mail chez elle, et si elle a tapé des chiffres (les frappes n'étaient pas enregistrées ;
elles le sont désormais, jamais leur contenu).

**Deuxième mur, trouvé dans le code de Kiabi, qui l'aurait arrêtée JUSTE APRÈS le code** : Kiabi revient du code par
`www.kiabi.com/account/codeExchange` (chunk `3drp_9z_iwfhk.js` : `redirectUri: ${baseURL}/account/codeExchange?authType=mfa…`),
puis la page fait `location.href = redirectUrl` (chunk `2b21j8a8-0100.js`). Cette page n'était pas dans la liste permise
(`/account/(…|code)([-_/].*)?$` ne couvre pas `codeExchange`) : une navigation de la page juste après le toucher sur
« Me connecter » aurait été refusée et la fenêtre Kiabi fermée (« lien refusé »).

### c) Ce qui a changé — la RÈGLE, tous les comptes, toutes les plateformes, tous les fournisseurs
- `serveur-cloud/src/codeConnexion.js` (nouveau, pur) + `connexion.js` : la page AFFICHÉE (la fenêtre du fournisseur
  comprise : Kiabi, Google, Apple, Facebook, ou la plateforme elle-même) est lue toutes les 2 s, sans réseau et sans
  jamais lire une valeur saisie ; un champ « one-time-code », nommé code / OTP / PIN, ou des cases d'un chiffre sur une
  page qui parle d'un code = **code demandé** (jamais un code postal, promo, parrainage ; jamais un e-mail ou un mot de
  passe) ;
- la personne lit TOUT DE SUITE : « Kiabi vient de t'envoyer un code par e-mail. Ouvre ta boîte mail (regarde aussi les
  courriers indésirables), puis reviens ici : la page t'attend 10 minutes. Touche la case du code, appuie sur « Écrire »,
  tape le code, puis valide sur la page. Rien reçu au bout de 2 minutes ? Demande un nouveau code sur la page. »
  (par SMS / application / inconnu : variantes) ; l'app (OTA 2.9.197) le montre dans un bandeau par-dessus le haut de
  la page (« Compris » le replie, « Voir » le rouvre ; aucun décalage de la page), et son champ caché passe en
  `one-time-code` (le téléphone propose le code reçu par SMS ou par Mail au-dessus du clavier) ; une app plus ancienne
  lit le même texte dans sa ligne d'état ;
- dès qu'un code est demandé : 10 minutes sans geste (au lieu de 5) et 25 minutes en tout (au lieu de 15), y compris
  pendant qu'elle est partie lire son e-mail ; sans code : 5 et 15, inchangés ;
- une minute avant toute fermeture faute de geste : « Toujours là ? Sans geste, cette page se ferme dans 1 minute :
  touche-la pour la garder ouverte. » (un geste la garde et remet le message d'avant) ;
- fermée pendant l'attente du code : « Page fermée : le code de Kiabi n'a pas été saisi à temps. Rouvre « Me connecter »
  quand tu as ta boîte mail sous la main : Kiabi t'enverra un nouveau code. » ; `cloud_connexions.raison` =
  `code_non_saisi` (faute de geste ou partie) ou `client_au_code` (fermée par elle sur la page du code) ;
- une glissière DataDome dans la fenêtre d'un fournisseur est dite à son nom ;
- les pages de l'espace de connexion Kiabi après le code sont permises (`/account/codeExchange`, `signInWithCode`,
  `signIn`, `signUp`, `passwordless`, `passwordReset`, sans sous-chemin) ; le reste du site Kiabi reste refusé ;
- traces : journal `connexion_code_demande` / `connexion_code_passe`, `connexion_fermee` porte `code` et `code_vu` ;
  enregistrement `code_demande`, `code_passe`, `frappe` (pendant_code, une ligne / 5 s, jamais le contenu) ; app :
  `cloud_connexion_code_vu` (une ligne par code demandé) ;
- `deployer.sh` garde désormais le journal de l'orchestrateur remplacé (`/srv/fillsell-cloud/archives/journaux/`, gz,
  600, les 30 derniers) avant de recréer le conteneur.
- **Verrou `selftest:cloud-connexion-code`** (13 vérifications : `serveur-cloud/tests/code-connexion.test.mjs` 10 tests,
  simulation « 15/11, af37fa49 » 4 tests + Kiabi 2, automate, client, écran, liste Kiabi). ROUGE sur le code d'avant :
  simulation 0/4 (« message du code : On prépare ta page de connexion… | Connecte-toi comme d'habitude. »), et
  `codeExchange` refusé ; VERT après.

### d) La preuve obtenue
- Nico n'a pas de compte Kiabi (aucun e-mail de Kiabi dans sa boîte) : pas de parcours complet possible ; ses
  identifiants à elle jamais utilisés.
- Essai réel UNIQUE (compte de Nico f44b5917, `outils/essai-connexion-sso.mjs … beebs auto Kiabi 45`, 10:54:55 →
  10:55:40, orchestrateur f56c04f1fe69) : « Connexion avec Kiabi » touché → `www.kiabi.com/account/auth` affichée
  (`connexion_redirection_fournisseur`), aucun refus, et **aucun faux « code demandé »** sur la vraie page Kiabi lue
  toutes les 2 s pendant 25 s (`connexion_fermee` : `code: null, code_vu: false`) ; rien saisi ; Beebs de Nico resté
  connecté (`connectee: true`).
- La vraie page de connexion Kiabi (Chrome de Nico, lecture seule, 15/11 vers 10 h) : un seul champ, l'e-mail → aucun code ; le
  texte réel de la page du code (auth.json) → reconnu « par e-mail » : les deux sont dans le verrou.
- Preuve finale à venir : sa prochaine connexion — `connexion_code_demande` (Kiabi, email), lignes `frappe` pendant le
  code, puis `cloud_connexions` « connectee » pour af37fa49 (ou une raison `code_non_saisi` / `client_au_code` qui dira où
  elle s'arrête). Ses 50 tâches Beebs et la lecture de ses ventes Beebs attendent cette connexion (rien touché).

## Point 2 — scan eBay unique perdu sur un refus avant appel

### La règle corrigée (tous les comptes)
`supabase/functions/_shared/lens-scan-refus-avant-appel.js` + `ebay-api-worker` (`scannerLensSiNecessaire`) : un refus de
lens-analysis **prouvé avant tout appel payant** rend la réservation du scan (marqueur `lens_scan` « rendu ») : 401 de la
porte, 400 de lecture du corps, 500 « Missing API key », 429 `rate_limited`, 429 `identify_unavailable` (filet / plafond),
503 `ai_unavailable` (aucune réponse de l'IA), 500 « Anthropic 429/5xx » (erreur de l'IA, jamais facturée). Preuve dans
lens-analysis (lu le 15/11) : ces réponses partent avant le débit et avant le premier appel à l'IA. Restent consommés :
une réponse 200 (même vide), « Anthropic 4xx », « Réponse IA non parsable », toute autre 500, et le DOUTE (délai de 45 s,
coupure, 502/504/546). Le marqueur « rendu » est réservable de nouveau sur CE marqueur exact (statut et horodatage) ; jamais
un second essai dans le même passage ; la borne de 3 scans par passe et les quotas sont inchangés.
**Verrou `selftest:ebay-scan-refus-avant-appel`** : ROUGE avant (21 ok, 46 ratés), VERT après (66/66) ; il casse aussi si
l'ordre « refus puis appel » change dans lens-analysis.
Déployé : ebay-api-worker **132 → 133** (verify_jwt false relu avant et après, 09:45).

### Les 10 articles, scan rendu (script joué à 09:52:07)
| Compte | Pseudo | Article | Titre | Marqueur (Paris) | Job |
|---|---|---|---|---|---|
| 8ac5bbda | the_closet72 | 1793651578883 | Lee Taille FR 34 Femme Jean Noir | 02/11 21:50:07 | fa58b6ef |
| 521b7f89 | Goulvenk | 1793653451585 | Carhartt WIP Sweat Zippé Capuche Noir S | 02/11 22:20:05 | 74a798a3 |
| 521b7f89 | Goulvenk | 1793654205757 | Sweat zippé à capuche noir taille S | 02/11 22:20:05 | 74a798a3 (marqueur recopié) |
| 521b7f89 | Goulvenk | 1793657936423 | Chemise bleue manches courtes XL | 02/11 23:22:03 | 7037574d |
| 521b7f89 | Goulvenk | 1793658309470 | Sac à dos beige et kaki | 02/11 23:28:03 | d3c7d6c7 |
| f8aa02a5 | Ornella | 1794675210902 | Chemise Massimo Dutti blanche (vendue, job annulé) | 14/11 17:56:06 | a42e72c9 |
| f8aa02a5 | Ornella | 1794675610237 | Mini jupe grise Trafaluc, taille S | 14/11 18:02:09 | a0db2ab3 |
| 13e274de | — | 1794615766169017 | Pantalon chic Zara Woman bleu marine | 14/11 19:42:17 | 0ce4d395 |
| 13e274de | — | 1794615766169016 | Lot 4 jeux de construction supermarché | 14/11 19:42:21 | fff288b1 |
| e5be98ba | clementdelsuc | 1794627032481 | Mini caméra surveillance WiFi Q18 | 14/11 20:02:06 | 86f5cd5f |

⚠️ Le rapport du 14/11 donnait 16:56, 17:02, 18:42 ×2 : c'était l'heure UTC (Paris : 17:56, 18:02, 19:42 ×2 ; 20:02 juste).
Script `scripts/reparations/20261115_scan_ebay_rendu_refus_avant_appel.sql` : sauvegarde
`public._backup_1511_lens_scan_rendu` (10 lignes, RLS), marqueur « echec / HTTP 429 identify_unavailable » remplacé par le
marqueur « rendu » de la règle (raison `plafond_ia`, `reparation: 20261115`), AVEC le déclencheur de fusion (aucun
déclencheur coupé : `inventaire_attributs_fusion` remplace une clé de même source et garde les autres, relu en prod), gardes
« jamais deux fois », « 10 et 10 en base », « valeur exacte encore présente ». Inverse `…_INVERSE.sql` (ne touche que les
marqueurs encore posés par la réparation), relecture `…_VERIFIER.sql`.
**Vérification en base (09:53)** : 10 sauvegardées, 10 « rendu » (raison plafond_ia, rendu_le 15/11 09:52:07), 0 marqueur
429 restant, les autres attributs de chaque fiche intacts (6 à 10 clés). Les 3 « HTTP 500 Anthropic 400 » (29/10 → 10/11)
restent consommés (l'IA refusait nos photos). Le scan repartira au prochain job eBay normal de chaque article.

## Point 3 — mails « Bienvenue » et « Comment ça marche » pour les comptes Cloud

### Avant → après (compte Cloud, ou en essai Cloud, AU MOMENT DE L'ENVOI)
Reconnu par `_shared/mails-compte-cloud.js` : `profiles.cloud_voie` (la lecture du mail de relance de fea32ce) OU Cloud
vivant (`cloudVivantDuProfil` : payé, ou essai en cours non arrêté). Profil illisible → texte d'avant, jamais d'erreur.
- **Bienvenue** : « Une extension installée dans Chrome sur ton ordinateur fait le travail… » → « Tu pilotes depuis ton
  téléphone. FillSell Cloud fait le travail sur les plateformes, depuis ses serveurs, 24 h/24 : rien à installer, rien à
  laisser allumé. Tu connectes chaque plateforme une fois, toi-même, depuis l'app — FillSell ne connaît ni ne garde jamais
  ton mot de passe. » ; bouton « Installer l'extension » (Chrome Web Store) → « Ouvrir FillSell » (fillsell.app) ;
  « L'extension s'installe sur ordinateur, une seule fois. » → « Pour démarrer, connecte tes plateformes dans FillSell :
  Réglages → Abonnement → FillSell Cloud → Connecter mes plateformes. »
- **Comment ça marche** : « Il publie pour toi / … une fenêtre discrète qui ne te vole jamais le focus … » → « FillSell
  Cloud publie tes annonces / Quand tu demandes une publication, FillSell Cloud la fait depuis ses serveurs, sur les
  plateformes que tu as connectées : rien à ouvrir ni à laisser allumé de ton côté. Les gestes sont volontairement
  espacés, au rythme d'un humain. C'est normal si ça prend un moment. »
- Anglais traduit de même. Sujets, préheaders, logos, mise en page, tutoiement, signature « Nico / FillSell » inchangés.
  Compte sans Cloud : rendu **identique à l'octet** à 3cac01f (FR et EN, avec et sans lien de désinscription).

### Recensement des autres mails automatiques
- Partent à un compte Cloud et sont déjà propres (rendus par le vrai code pour un compte Cloud, aucun mot interdit) :
  mails du Cloud (`_shared/cloud-mails.js` : début d'essai, paiement, arrêts, impayé), veille de fin d'essai
  (email-tunnel), impayé Stripe (stripe-webhook → email-tunnel), ventes et rafale (push-ventes), accusé de résiliation
  (cancel-subscription).
- Ne partent jamais à un compte Cloud : relances des tâches (« installe l'extension », « ton ordinateur ») — email-tunnel
  saute tout compte `cloud_voie` avant le rendu (fea32ce) ; lien d'installation de l'extension (send-extension-link) —
  seulement à la demande de la personne connectée, aucun cron ni déclencheur.
- Hors champ (pas automatiques) : blasts `blast_relaunch_aout` et `blast_sync_dressing` (parlent de l'extension, partent
  seulement sur commande manuelle — à corriger s'ils sont relancés), `relance_manuelle`, envoi ponctuel, alertes à support@.

### Tests
- **Verrou `selftest:mails-cloud-sans-ordinateur`** : ROUGE avant (40 verts, 34 rouges sur 74), VERT après (79/79) —
  aucun /ordinateur|computer|chrome|extension/ dans le texte ni le HTML d'un mail Cloud ; rendu non-Cloud identique à
  l'octet ; chaque mail d'emails-fillsell.ts classé ; câblage d'email-tunnel. 67 selftests liés verts.
- Déployé : email-tunnel **101 → 102** (verify_jwt false relu avant et après, 09:45).
- Envoi de test à l'adresse de Nico seulement, par `envoyer_mail_ponctuel` : simulation (réponses 51324, 51325 : « ok »,
  `motif: simulation`), puis réel (51332, 51333 : `envoyes: 1`) — « [Test Cloud] Bienvenue sur FillSell » et « [Test
  Cloud] Comment ça marche », versions FR du Cloud.

### À décider (Nico) — non corrigé
1. Le welcome part à l'INSCRIPTION (handle_new_user → email-tunnel `welcome_now`) : à ce moment, presque aucun compte
   n'est au Cloud (13 comptes ont eu le Cloud ; les 11 qui ont reçu le welcome l'ont reçu avant leur Cloud ; médiane
   11,8 h entre inscription et Cloud, 6 sur 13 dans l'heure). Le texte du Cloud servira surtout au filet J+1 et au
   « comment ça marche ». Retarder le welcome changerait le parcours : décision de Nico.
2. « Comment ça marche » n'atteint presque personne (12 envois en 12 jours pour 243 inscrits) : email-tunnel lit
   `email_tunnel_candidates()` par rpc SANS pagination (3 784 lignes, PostgREST coupe à 1 000 sans erreur). Corriger la
   lecture ferait passer ce mail marketing d'environ 1 à environ 20 par jour : décision de Nico.

## Livraison
- Commits : d0b954c (code des 3 points), f56c04f (message « puis valide sur la page » + verrou sur le texte réel de
  Kiabi), puis version 2.9.197 et docs (ce rapport, règles, état de prod) — un push.
- Suite **788/788** (par morceaux, mémoire ~3 Go), lint identique à HEAD sur les fichiers touchés (6 erreurs `Buffer`
  préexistantes), build:essai vert ; `selftest:cloud-orchestrateur` 218/218.
- Orchestrateur cloud-2 : fea32cebd669 → **d0b954c18085** (09:41:30) → **f56c04f1fe69** (10:54) ; image Chrome
  61fb7ddd6e2a et CRX 2d6968f56f9e inchangés ; journaux remplacés gardés
  (`archives/journaux/orchestrateur-20261115-094130-fea32cebd669.log.gz`, `…-105400-d0b954c18085.log.gz`).
- Fonctions : ebay-api-worker 132 → **133**, email-tunnel 101 → **102** (verify_jwt false, relus avant et après).
- Données : script du point 2 joué (09:52:07), vérifié.
- Extension inchangée : le seul zip à téléverser reste
  `C:\Users\nicol\fill-and-sell\build\CWS-0.6.190-A-TELEVERSER\fillsell-extension-0.6.190-cws.zip`.
