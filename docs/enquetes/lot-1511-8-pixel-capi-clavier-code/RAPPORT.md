# 15/11/2026 soir — Pixel Meta (deux pixels), API de conversions, clavier sur ordinateur (C), champ du code (D)

Ordre de Nico (15/11, ≈ 22:00) + complément CAPI (≈ 23:00). Heure de Paris. Aucun mail, rien chez Stripe, aucune
campagne ni pub touchée, rien sur le compte de Doriane (af37fa49) : ni connexion relancée, ni code déclenché.
Décisions de Nico prises pendant le lot : CAPI **seulement avec l'accord au bandeau** (web, jamais les apps natives) ;
politique de confidentialité **réécrite** ; **livrer sans les jetons** (prérequis Meta, voir § 2).

## 1. Pixel Meta — les deux pixels sur fillsell.app (site et /app)
- `src/utils/metaPixel.js` (source unique du site et de la web app) initialise 1425992186075849 (inchangé) PUIS
  921207750637065, avant le PageView : chaque `track` part vers les deux (jamais `trackSingle`). Même consentement
  qu'avant (rien sans « Accepter ») ; apps natives : ni bandeau ni pixel (inchangé). Aucune donnée personnelle côté
  navigateur.
- Avant ce lot : aucune API de conversions, aucun eventID dans le dépôt.
- Verrou **`selftest:meta-pixel-deux-pixels`** : rouge avant (16/21), vert après (23/23).
- Preuves : voir « Preuves » plus bas.

## 2. API de conversions (CAPI) — l'inscription envoyée aussi par le serveur
- Navigateur (`src/utils/metaInscription.js`) : à une inscription WEB réussie, avec accord au bandeau, un event_id est
  tiré ; le pixel envoie CompleteRegistration avec `eventID` aux deux pixels ; `navigator.sendBeacon` (texte brut, part
  même si la page se ferme, n'attend rien) demande à la fonction `meta-inscription` d'envoyer le MÊME event_id.
  Compte NOUVEAU seulement (une adresse déjà inscrite rend `identities: []` : rien) ; Google/Apple sur le web, qui ne
  passent pas par signUp : mesurés à leur première session (compte de moins de 10 min) — ils ne l'étaient pas du tout.
- Serveur (`supabase/functions/meta-inscription`, règles pures `_shared/meta-capi.js`) : réponse 202 immédiate, envoi en
  arrière-plan (`EdgeRuntime.waitUntil`) ; compte relu en base (auth.users), né il y a moins de 30 min ; une seule fois
  par compte (usage_logs « meta_capi_inscription ») ; e-mail et identifiant en SHA-256, fbp/fbc s'ils existent, IP et
  navigateur de la requête, adresse de la page (notre site, sans paramètres) — rien d'autre. Erreurs journalisées
  seulement. `verify_jwt` false (aucune session avant la confirmation de l'e-mail), déclarée dans `config.toml`.
- Politique de confidentialité (`Legal.jsx`, FR et EN) : « Aucune donnée personnelle (email, identifiant de compte)
  n'est transmise à Meta » remplacée par ce qui part réellement, avec l'accord seulement.
- **Jetons : NON générés.** Meta l'a refusé, pour des raisons de compte que je ne pouvais pas lever :
  · 921207750637065 : « Vous devez être admin ou développeur(se) de ce portefeuille business pour créer un token
    d'accès » ;
  · 1425992186075849 (portefeuille FillSell 866957382367075) : « Vous devez associer une adresse e-mail à cette
    entreprise » (Paramètres de l'entreprise › Informations sur l'entreprise).
  Tant que les secrets `META_CAPI_TOKEN_921207750637065` / `META_CAPI_TOKEN_1425992186075849` manquent, la fonction
  n'envoie rien et note `jeton_absent` (une ligne par inscription). Les jetons, une fois générés, se rangent en
  secrets : aucun redéploiement.
- Verrou **`selftest:meta-capi-inscription`** (38) : rouge avant (module absent), vert après.

## 3. C — « Me connecter » sur ordinateur : un clic dans l'image donne le clavier
- **Vérifié en réel** (essai unique, compte de Nico f44b5917, Leboncoin, Chrome de bureau ISOLÉ, page autonome du
  serveur Cloud qui sert le MÊME `clientConnexion.js` que l'app ; 22:22:30 → 22:24:06, rien soumis) :
  clic dans un champ de l'image puis « essai » tapé → focus sur `BODY`, **aucun message envoyé** ; après « Écrire »,
  « essai » → 5 messages partis. Confirmé.
- Cause : le canvas ne prend pas le focus ; le clic de souris le retirait au champ caché qui porte le clavier.
- Correctif (`src/cloud/connexion/clientConnexion.js`) : `mousedown` dans l'image → preventDefault + focus sur le champ
  caché. Toutes plateformes, toutes pages (identifiant, mot de passe, code). Au doigt : rien ne change.
- Verrou **`selftest:cloud-clavier-ordinateur`** (vrai Chrome) : rouge avant (8/13 : « x » reçu au lieu de « xyz »),
  vert après (13/13), téléphone compris (un toucher n'ouvre jamais le clavier ; « Écrire » l'ouvre et un toucher le garde).
- Vu pendant l'essai, sans lien avec C : le clic sur le champ de recherche de « Mes annonces » Leboncoin (Nico déjà
  connecté) n'a pas mis le focus dans la page distante (`clavier:false`). Un toucher de 0 ms donne bien le focus à un
  champ ordinaire (vérifié en local) : à surveiller avec D, non corrigé.

## 4. D — le champ du code dans usage_logs
- Écrit par l'ORCHESTRATEUR (donc web, iPhone, Android, toute version de l'app) : `cloud_connexion_code_etat`,
  moments demande / saisie / validation / nouveau_code / passe / fermeture ; `longueur` du champ (jamais sa valeur ;
  mot de passe, e-mail, identifiant jamais mesurés), `attendue`, `clavier` (le champ du code a le focus),
  `validation` (au moins une envoyée), `envoyee` (bouton actif / Entrée dans le champ), compteurs (frappes,
  validations, nouveaux codes), écran, plateforme, fournisseur.
- Bornes : 40 lignes au plus par connexion ; une « saisie » au changement seulement, une toutes les 3 s au plus ;
  aucune ligne sans code. La lecture de DÉTECTION (toutes les 2 s) est identique à l'octet (aucune valeur lue).
- Verrou **`selftest:cloud-code-etat`** : rouge avant (1/9, copie du dernier commit), vert après (9/9) ; serveur Cloud
  **221/221**.

## Preuves
- **Inscription, navigateur** (build de prod servie en LOCAL, inscription par e-mail SIMULÉE : la requête signup
  interceptée, aucun compte créé, aucun mot de passe en production ; envois vers Meta lus puis coupés) :
  PageView → 1425992186075849 ET 921207750637065 ; CompleteRegistration → les deux, `eid` 8e193ae4-… identique ;
  demande au serveur (sendBeacon, text/plain) avec le MÊME event_id, `fbp` lu dans son cookie, aucune donnée
  personnelle. Configs `signals/config/<pixel>` chargées pour les deux.
- **Serveur** : meta-inscription v1 déployée ; demande non conforme → 202, rien ; compte inexistant → 202, rien ;
  GET → 405. La preuve « navigateur + serveur dédupliqués dans le Gestionnaire d'événements » attend les jetons.
- **Note de méthode** : Chrome SANS fenêtre (headless) charge le pixel mais Meta n'envoie jamais `/tr` (vérifié aussi
  sur la prod d'avant) ; avec fenêtre : PageView 200. Les preuves de pixel se font avec fenêtre.
- **C** : essai réel (§ 3) + verrou dans un vrai Chrome. **D** : simulation de bout en bout (3 tests), unitaires (3).
- Déploiements : meta-inscription v1 (verify_jwt false) ; orchestrateur cloud-2 f56c04f1fe69 → ebc9be7b0bb2 (santé
  ok, 8 navigateurs revenus en 1 min, client servi avec C) ; web par le push de ce lot.

## Ce que ça change pour les utilisateurs
- Pixel : la campagne du compte perso reçoit enfin les événements du site (PageView, CompleteRegistration), comme le
  pixel FillSell Web. Rien de changé pour qui refuse le bandeau ni dans les apps.
- CAPI : rien tant que les jetons manquent ; ensuite, les inscriptions avec accord perdues par le navigateur
  (bloqueurs, page fermée) seront comptées, sans doublon.
- C : sur ordinateur, on clique dans un champ et on tape — sans « Écrire ». Téléphone : identique.
- D : la prochaine connexion avec code (Doriane comprise) dira ce qui était dans le champ, s'il avait le focus, et si
  une validation est partie.

## Ce qui reste
- Jetons CAPI : deux réglages Meta par Nico (rôle admin/développeur sur le portefeuille du pixel 921207750637065 ;
  e-mail de l'entreprise FillSell), puis génération des jetons et mise en secrets ; preuve navigateur + serveur
  dédupliquée à faire à ce moment-là.
- Aucune OTA, aucun binaire, aucune extension nécessaires : C n'agit qu'à la souris (rien au doigt), pixel et CAPI ne
  partent jamais en natif, D vit dans le serveur. Le code partagé partira avec la prochaine OTA, sans effet visible.
