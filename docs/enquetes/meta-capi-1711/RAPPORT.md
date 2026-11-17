# 17/11/2026 — Suivi Meta (API de conversions) : les inscriptions n'arrivaient pas chez Meta

Ordre de Nico (17/11 après-midi). Heure de Paris. Aucune campagne ni aucun budget touchés, rien chez Stripe, aucun mail
aux utilisateurs, rien envoyé à Meta pour un compte de test.

## 1. Cause prouvée
- `usage_logs` (feature `meta_capi_inscription`) : les 5 inscriptions avec accord depuis le 15/11 (dont celle du 17/11
  08:17) portent `{"921207750637065":"jeton_absent","1425992186075849":"jeton_absent"}`.
- `supabase secrets list` (17/11 ~15:40) : **aucun secret `META_CAPI_TOKEN_*`**. Ils n'ont jamais existé : le 15/11, Meta
  avait refusé de générer les jetons (rapport `docs/enquetes/lot-1511-8-pixel-capi-clavier-code/RAPPORT.md` § 2), et la
  fonction notait « jeton_absent » en silence, sans aucune alerte. La fonction lisait le bon nom : rien de mal nommé,
  rien d'expiré.
- Les deux blocages de Meta, relus le 17/11 :
  · 1425992186075849 « FillSell Web » (portefeuille FillSell 866957382367075) : « Vous devez associer une adresse e-mail à
    cette entreprise » — le profil de Nico n'avait aucun e-mail dans ce portefeuille ;
  · 921207750637065 : il appartient au compte pub PERSO (« Nicolas Sby, 967689532550296 »), qui n'est dans aucun
    portefeuille → « Vous devez être admin ou développeur(se) de ce portefeuille business ». Aucun jeton possible.

## 2. Décisions de Nico (17/11, posées par questions)
- **Accord web seulement** : la politique de confidentialité et la décision du 15/11 disaient « aucun traceur Meta dans
  l'app » ; l'app n'a ni bandeau ni fenêtre ATT (Apple appelle « tracking » l'envoi d'un e-mail haché à Meta). Donc :
  inscription, essai et premier paiement envoyés pour les personnes qui ont dit oui au bandeau WEB à leur inscription,
  quel que soit le canal de paiement ensuite ; une inscription faite dans l'app n'envoie rien.
- **E-mail du portefeuille** : support@fillsell.app (ajouté par moi ; code de confirmation envoyé par Meta).
- **Pixel 921** : rester au navigateur ; partager le pixel 1425 avec le compte pub perso (voir § 6, pas encore possible).

## 3. Ce qui a été fait chez Meta
- Profil de Nico dans le portefeuille FillSell : e-mail **support@fillsell.app**, « Confirmation en attente » (le code
  transmis par Nico a été refusé par Meta : « Ce code est incorrect » ; fenêtre laissée ouverte). Meta a quand même
  ouvert « Générer un token d'accès » avec l'adresse en attente.
- Jeton du pixel 1425992186075849 généré par « Configurer **sans** Dataset Quality API » (l'autre option, cochée par
  défaut, est irréversible d'après Meta : évitée). Copié par le presse-papiers et rangé directement en secret Supabase
  **`META_CAPI_TOKEN_1425992186075849`** (17/11 16:11) : fichier temporaire supprimé, presse-papiers vidé, jamais dans le
  code, un log ou un commit.
- Rien d'autre modifié : aucune campagne, aucun budget, aucune condition acceptée (une fenêtre « J'accepte » des
  Conditions des Outils Meta Business a été fermée sans accepter).

## 4. Ce qui change dans le code
- `_shared/meta-capi.js` (règles pures) : `PIXELS_CAPI` = FillSell Web seul ; `PIXELS_NAVIGATEUR_SEUL` = 921 ;
  `estCompteDeTest` (nicolas.svobodny*, hoosslocal, googlereview, test*, nicotest*, alias compris) ; `lireMontant` ;
  `demandesDeCloud` / `demandesDePaiement` ; `evenementServeur` (StartTrial / Subscribe / Purchase : e-mail et
  identifiant en SHA-256, fbp/fbc, valeur et devise ; Stripe en « website » avec le navigateur gardé, Apple/Google en
  « system_generated » ; Purchase jamais sans montant ; event_id stable par compte et par nom) ; statut `envoye` ;
  série d'échecs et mail d'alerte.
- `_shared/meta-capi-envoi.js` (orchestration, dépendances injectées) : envoi aux pixels, trace, alerte à support@ au
  4e échec d'affilée (une par série), conversions une fois par compte, accord web exigé ; ne lève jamais.
- `_shared/meta-capi-deno.ts` : secrets, usage_logs, porte d'envoi des mails passée par l'appelant, `EdgeRuntime.waitUntil`.
- `meta-inscription` : statut `envoye`, trace avec `contexte` { fbp, fbc, ua } (jamais l'IP), alerte ; mode ESSAI
  (`essai_meta`, x-cron-secret, compte fictif, IP de documentation 192.0.2.10, trace `meta_capi_essai`).
- `_shared/cloud-mails-envoi.ts` : `mailsCloud` (Stripe, Apple, Google : essai_debut → StartTrial au prix de la 1re
  échéance ; paiement « debut » / « fin_essai » → Subscribe + Purchase au montant payé) et `alerteSeuleCloud` (7 jours
  offerts → StartTrial), en arrière-plan, avant les mails (ordre mails → alerte et réponse inchangés).
- `email-tunnel` (`payment_alert`, tout paiement crédité des trois canaux et de validate-google-purchase) : abonnement →
  Subscribe + Purchase, pack → Purchase ; achat de test exclu.
- `Legal.jsx` (FR/EN) : essai et premier paiement (montant, devise, tout canal) pour qui a accepté sur le site ; identifiants
  Meta du navigateur gardés avec le compte ; un compte créé dans l'app n'envoie rien.

## 5. Preuves
- **Meta, « Tester les événements »** du pixel FillSell Web, code TEST63110, essai du 17/11 16:14 (compte fictif) :
  4 événements reçus de « Serveur », « Traitement terminé », sans erreur — Inscription terminée
  `6ec738ce-e8a0-48b4-a453-bbd241e7bc41`, Démarrer l'essai `f73297ac-cdbe-4437-b209-140cc9271d20`, Abonnement
  `95053d69-b3b0-489c-b182-863690ec4ca1`, Achat `52ed6aed-47db-449d-8cc3-beb554516489` (fbtrace AROdbCe6tPZbN20oNLUvkFE,
  AibQbOmJS4o3YyOlw6CUTz8, AOGCwvtAfnInv4cXnAAncUV, AWRp6M-y-cvD1J5tdavA-9e). Capture :
  `preuve-tester-les-evenements-1711.jpg`. Traces `meta_capi_essai` : `{"1425992186075849":"envoye"}`.
- Pixel 921 : aucun envoi serveur possible (décision § 2) — il reçoit toujours le navigateur.
- La trace `meta_capi_inscription` d'une VRAIE inscription passera à `envoye` à la prochaine inscription web avec accord
  (aucune entre le déploiement et la fin du lot) : à relire (`usage_logs`, feature `meta_capi_inscription`).
- Verrou **`selftest:meta-capi-envoi`** (55) : rouge avant (0/1 sur 7023a64, modules absents ; 47/55 avec les modules neufs
  et l'ancien branchement), vert après (55/55). `selftest:meta-capi-inscription` 38/38 (deux vérifications de source
  réécrites sur la nouvelle forme, même sens) ; `meta-pixel-deux-pixels` 23/23.

- Suite complète : **841 / 841, 0 rouge** (17/11 16:37 → 17:07, 10 morceaux au premier plan, mémoire libre ~1,8 Go).
  Une 1re passe (avant un correctif) avait 3 rouges : `alerte-essai-cloud` et `cloud-alerte-nico` (mon branchement :
  la porte d'envoi est désormais passée par l'appelant, et Meta part AVANT les mails, l'ordre mails → alerte et la
  réponse restant ceux d'avant) ; `onglet-muet-partout` (test de délais de l'extension, vert seul, vert à la 2e passe).
- Types (`deno check`) : mêmes erreurs qu'avant, aucune neuve (email-tunnel 2, stripe-webhook 57, create-checkout-session 74 ;
  meta-inscription et google-play-webhook : 0).

## 6. Déploiements (17/11, verify_jwt relu avant et après, inchangé)
- meta-inscription **2 → 3** (16:13) puis **3 → 4** (17:08) — false ; email-tunnel **105 → 106** — false ;
  stripe-webhook **89 → 90** — false ; apple-iap-webhook **67 → 68** — false ; google-play-webhook **61 → 62** — false ;
  create-checkout-session **92 → 93** — true. (Numéros lus par `functions list`.) Démarrage vérifié sans effet : GET
  405 (meta-inscription, apple-iap-webhook, google-play-webhook), POST sans signature 400 (stripe-webhook), sans secret
  401 (email-tunnel), sans session 401 (create-checkout-session). Aucune migration, aucune OTA nécessaire (le navigateur
  n'a pas changé), aucune extension.

## 7. Ce qui reste (Nico)
- **E-mail support@ du portefeuille** : « Confirmation en attente ». Les deux codes donnés ont été refusés (« Ce code est
  incorrect » ; le premier mail datait de ~15:58, valable 60 min) ; un NOUVEAU code a été demandé à 17:05 (« Renvoyer le
  code ») : donner les 6 chiffres de ce dernier mail.
- **Partager 1425 avec le compte pub perso** : le portefeuille FillSell ne propose que « FillSell Ads » (le compte perso
  n'y est pas). Il faut d'abord que le portefeuille ait accès au compte 967689532550296 (Paramètres › Comptes
  publicitaires › Ajouter › Demander l'accès, accepté côté compte perso) — un réglage de plus, à ton feu vert ; ou
  passer la campagne, le jour venu, sur le compte FillSell Ads qui voit déjà 1425.
- La campagne reste en « Trafic » : Meta verra désormais les inscriptions serveur sur 1425, pas sur 921.
