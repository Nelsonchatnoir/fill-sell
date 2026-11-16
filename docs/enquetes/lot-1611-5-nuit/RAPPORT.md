# Lot du 16/11 nuit — OTA à l'ouverture, nouvel inscrit sur le code du jour, alerte d'essai (rapport)

Heure de Paris.

## 1. L'OTA posée dès l'ouverture suivante
- **Cause.** Plugin @capgo/capacitor-updater 8.51.2 (les deux binaires), `autoUpdate: 'atInstall'` : après le 1er
  lancement, une OTA n'est cherchée qu'au premier plan, mise en file, et posée au passage en arrière-plan SUIVANT —
  ouverture → fermeture → ouverture (prouvé en base : test5, 19:43:54 ancienne version, 19:46:47 la nouvelle).
- **Corrigé (JS, `src/natif/miseAJourOuverture.js`).** Fenêtre de 15 s au démarrage à froid et à chaque retour au
  premier plan : un bundle prêt plus récent est posé tout de suite derrière l'écran de lancement (`CapacitorUpdater.set`) ;
  si la personne fait déjà quelque chose (geste, saisie, achat, veille d'achat, parcours d'entrée, publication) → rien,
  le passage en arrière-plan comme avant. Un seul rechargement, garde de boucle, secours à 8 s, trace `maj_ouverture`.
  Verrou `selftest:ota-ouverture-suivante` (57 ; rouge avant : 8).

## 2. Le nouvel inscrit sur le code du jour
- **Mesure (09/11 → 16/11).** 6 inscrits natifs sur 53 (11 %) ont fait toute leur 1re session, onboarding compris, sur le
  code du binaire (iPhone 5/37 sur 2.9.164 du 07/11 ; Android 1/16) ; 1 n'a jamais basculé. 'atInstall' n'est donc PAS
  garanti : sa seule borne est le plafond JS de 10 s ; au-delà, iPhone attend 2 passages en arrière-plan, Android recharge
  en pleine utilisation.
- **Fait.** Binaires neufs qui embarquent l'OTA 2.9.208 : iPhone 2.9.208 (Codemagic, soumis à Apple), Android 2.9.208 /
  versionCode 40 (Play). capacitor.config.ts inchangé (« onLaunch » / « always » rechargeraient sous le doigt).

## 3. L'alerte de chaque essai Cloud démarré
- **Cause.** La liste fermée des alertes du 14/11 (6b5b98a) coupait `cloud.essai_debut` (`A(null)`) : la clé
  « alerte:… » était réservée dans cloud_mails, l'envoi refusé (Stripe : victorine 15:39 ; Apple : test5 19:47). Second
  trou : les « 7 jours offerts » (create-checkout-session) posaient un essai sans alerte.
- **Corrigé.** Catégorie `essai_demarre` (alertes-nico.js) ; l'alerte donne compte + id court, formule, canal, palier,
  prix après l'essai, début et FIN de l'essai ; Business + Cloud jamais ; les 7 jours offerts passent par le même point.
  Verrou `selftest:alerte-essai-cloud` (162 ; rouge avant : 28). Fonctions : stripe-webhook, apple-iap-webhook,
  google-play-webhook (--no-verify-jwt), create-checkout-session.
- Les 2 alertes coupées du 16/11 (a962a59e, 08918381) ne repartent pas seules (clé déjà réservée).

## 4. Réglage Google de l'essai
- À poser le 17/11, une fois l'OTA prise (premium-cloud-trial-7d et pro-cloud-trial-7d → « N'ont jamais eu cet abonnement »).
