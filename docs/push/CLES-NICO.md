# Notifications (ventes, « Vente annulée ») et Pub/Sub — ce que Nico fait lui-même

> Écrit le 06/10/2026, remis à jour le 25/10/2026 (lot du matin). Rien de ce qui suit n'a encore été fait : au 25/10,
> 0 téléphone enregistré, aucun secret APNs/FCM, binaires des stores sans module de notifications (App Store 2.8,
> Google Play 2.9.10). Côté serveur TOUT est prêt et armé (migration `20261025040000` appliquée le 25/10 à 10:11,
> push-ventes v14) : il ne manque que les clés et le binaire.

Quatre blocs, dans cet ordre, une seule fois (~20 min en tout). Les fichiers téléchargés restent dans
**Téléchargements** : Claude les prend là, les range et les pose comme secrets — ils ne vont jamais dans git.
Ensuite tu dis une phrase à Claude (fin de page) ; il fait tout le reste.

---

## A. Firebase (Android) — 5 minutes

Sans le fichier `google-services.json`, le binaire Android ne peut PAS recevoir de notification, et l'app planterait au
moment d'« Activer ». Le script de fabrication de l'AAB refuse donc de le construire sans ce fichier.

1. Ouvre <https://console.firebase.google.com> (connecté au compte Google de FillSell).
2. **« Créer un projet »** → nom : `FillSell` → **Continuer** → Google Analytics : **décoche** → **Créer le projet** →
   **Continuer**.
3. Sur l'accueil du projet, clique l'icône **Android** (« Ajouter une application » → Android) :
   - Nom du package Android : `app.fillsell.app` (exactement) ; pseudo : `FillSell Android` ; SHA-1 : vide ;
   - **Enregistrer l'application** → **Télécharger google-services.json** → **Suivant** → **Suivant** →
     **Accéder à la console**.
4. Roue dentée ⚙️ → **Paramètres du projet** → onglet **Comptes de service** → **Générer une nouvelle clé privée** →
   **Générer la clé** (fichier `fillsell-…-firebase-adminsdk-….json` : la clé d'ENVOI, à ne partager avec personne).

---

## B. Apple (iOS) — 5 minutes

1. <https://developer.apple.com/account/resources/identifiers/list> → **app.fillsell.app** → coche
   **Push Notifications** (ne clique PAS sur « Configure ») → **Save** → **Confirm**.
2. <https://developer.apple.com/account/resources/profiles/list> → **FillSell AppStore** (l'étape 1 l'a rendu
   « Invalid ») → **Edit** → **Save** sans rien changer. Le NOM reste exactement `FillSell AppStore`.
3. <https://developer.apple.com/account/resources/authkeys/list> → **+** → Key Name `FillSell Push` → coche
   **Apple Push Notifications service (APNs)** → **Configure** → **Sandbox & Production**, **Team Scoped (All
   Topics)** → **Save** → **Continue** → **Register** → **Download** (une seule fois) → `AuthKey_XXXXXXXXXX.p8`.
   (Les `AuthKey_DYF87JYZ89` / `AuthKey_W7MZC3YK99` déjà présents ne sont PAS des clés APNs.)

---

## C. Google Pub/Sub (authentification des notifications Google Play) — 5 minutes

1. <https://play.google.com/console> → FillSell → **Monétiser avec Play** → **Configuration de la monétisation** →
   **Notifications en temps réel pour les développeurs** : note le nom du projet dans `projects/<PROJET>/topics/…`.
2. <https://console.cloud.google.com> → projet `<PROJET>` → **IAM et administration** → **Comptes de service** →
   **Créer un compte de service** → nom `pubsub-push-fillsell` → **Créer et continuer** → **OK** (aucun rôle).
   Copie son adresse `pubsub-push-fillsell@<PROJET>.iam.gserviceaccount.com`.
3. **Pub/Sub** → **Abonnements** → l'abonnement de type Push vers
   `https://tojihnuawsoohlolangc.supabase.co/functions/v1/google-play-webhook` → **Modifier** → coche
   **Activer l'authentification** → compte de service : `pubsub-push-fillsell@…` → Audience :
   `https://tojihnuawsoohlolangc.supabase.co/functions/v1/google-play-webhook` → **Mettre à jour**.
   (Si Google refuse faute de droit : **IAM** → **Accorder l'accès** → principal
   `service-<numéro du projet>@gcp-sa-pubsub.iam.gserviceaccount.com` → rôle **Créateur de jetons du compte de
   service** → **Enregistrer**, puis recommence l'étape 3.)
4. Retour dans Play Console, même page qu'à l'étape 1 → **Envoyer une notification de test**.

---

## D. Codemagic (iOS) — 1 clic, APRÈS le bloc B

<https://codemagic.io/apps> → FillSell → **Start new build** → workflow **Capacitor iOS Build**, branche **main** →
**Start** (~25 min → TestFlight ; ou dépose un jeton d'API dans `Téléchargements\codemagic-token.txt` et Claude le
lance et le suit lui-même).

---

## Ensuite : la phrase à dire à Claude

« Fichiers dans Téléchargements, Pub/Sub fait : pubsub-push-fillsell@<PROJET>.iam.gserviceaccount.com »

Claude, avec ces fichiers (`npm run binaires`) : pose `APNS_KEY_ID` / `APNS_PRIVATE_KEY` (équipe `BQ379Y93X3`,
sujet `app.fillsell.app`) et `FCM_SERVICE_ACCOUNT` ; prouve les deux clés chez Apple et Google sur un jeton factice
(rien n'est envoyé à personne) ; range `google-services.json` dans `android/app/` et fabrique l'AAB signé
(`build/AAB-A-TELEVERSER-<version>-vc33/`) ; pose `GOOGLE_PUBSUB_SA_EMAIL`, attend la ligne « oidc_ok » de ta
notification de test au journal, puis seulement passe `GOOGLE_PUBSUB_AUTH=exiger`.

## Le test sur ton iPhone (sans fausse vente)

1. TestFlight → FillSell → **Installer**. Ouvre l'app (compte `nicolas.svobodny@gmail.com`, celui de ton iPhone) →
   Réglages › Préférences › **Notifications de ventes** → **Autoriser**.
2. Claude relit `appareils_push` (une ligne iOS sur ton compte), puis envoie une note d'ESSAI « Vente annulée »
   (`npm run push:essai-annulation -- --envoyer`, ton compte seul, aucun mail) : « Vente annulée sur Vinted — Article
   test (essai) : remettre en vente ? ». Appuie dessus : l'app s'ouvre sur « Ventes annulées ».
3. Les binaires pour tout le monde : App Store Connect → **+ Version** → le build Codemagic → **Envoyer pour examen** ;
   Play Console → Production → **Créer une release** → le SEUL fichier du dossier `build/AAB-A-TELEVERSER-…` →
   **Envoyer pour examen**. Notes de version : « Nouveau : sois prévenu dès qu'un article se vend, ou qu'une vente
   est annulée. Active les notifications quand l'app te le propose, ou dans Réglages › Préférences. »
