# Notifications de ventes — ce que Nico fait lui-même (06/10/2026)

Trois blocs, dans cet ordre. Tout se fait sur le PC (le bloc B marche aussi
sur téléphone). Les fichiers téléchargés restent dans **Téléchargements** :
Claude les prend là, les range et les pose comme secrets — ils ne vont
jamais dans git.

---

## A. Firebase (Android) — 5 minutes, AVANT le binaire Android

Sans le fichier `google-services.json`, le binaire Android ne peut PAS
recevoir de notification, et l'app planterait au moment d'« Activer ». Le
script de fabrication de l'AAB refuse donc de le construire sans ce fichier.

1. Ouvre <https://console.firebase.google.com> (connecté au compte Google de
   FillSell).
2. **« Créer un projet »** (ou « Ajouter un projet ») → nom : `FillSell` →
   **Continuer** → Google Analytics : **décoche** → **Créer le projet** →
   **Continuer**.
3. Sur l'accueil du projet, clique l'icône **Android** (« Ajouter une
   application » → Android) :
   - Nom du package Android : `app.fillsell.app` (exactement) ;
   - Pseudo : `FillSell Android` ; SHA-1 : laisse vide ;
   - **Enregistrer l'application** → **Télécharger google-services.json** →
     **Suivant** → **Suivant** → **Accéder à la console**.
4. Roue dentée ⚙️ en haut à gauche → **Paramètres du projet** → onglet
   **Comptes de service** → **Générer une nouvelle clé privée** →
   **Générer la clé**. Un fichier `fillsell-…-firebase-adminsdk-….json`
   se télécharge (c'est la clé d'ENVOI, à ne partager avec personne).
5. Même page, onglet **Cloud Messaging** : la ligne « API Firebase Cloud
   Messaging (V1) » doit dire **Activé** (c'est le cas par défaut).

→ Dis à Claude : « fichiers Firebase dans Téléchargements ». Il range
`google-services.json` dans `android/app/`, pose la clé d'envoi en secret
(`FCM_SERVICE_ACCOUNT`) et fabrique l'AAB.

---

## B. Apple (iOS) — 5 minutes, AVANT le build Codemagic

1. **Activer les notifications sur l'identifiant de l'app**
   <https://developer.apple.com/account/resources/identifiers/list> →
   clique **app.fillsell.app** → coche **Push Notifications** (ne clique
   PAS sur « Configure », les certificats ne servent pas) → **Save** →
   **Confirm**.
2. **Régénérer le profil de distribution** (l'étape 1 l'a rendu
   « Invalid ») :
   <https://developer.apple.com/account/resources/profiles/list> →
   **FillSell AppStore** → **Edit** → **Save** sans rien changer. Le NOM
   doit rester exactement `FillSell AppStore` (Codemagic l'attend sous ce
   nom). Pas besoin de le télécharger.
3. **Créer la clé d'envoi APNs**
   <https://developer.apple.com/account/resources/authkeys/list> → **+** →
   - Key Name : `FillSell Push` ;
   - coche **Apple Push Notifications service (APNs)** → **Configure** →
     Environment : **Sandbox & Production**, Key Restriction : **Team Scoped
     (All Topics)** → **Save** ;
   - **Continue** → **Register** → **Download** (téléchargeable UNE seule
     fois) → fichier `AuthKey_XXXXXXXXXX.p8` dans Téléchargements. Les 10
     caractères `XXXXXXXXXX` sont le **Key ID**.
   - Si une clé de la liste porte DÉJÀ « APNs » dans ses services, elle
     suffit : donne son Key ID et son .p8 à Claude au lieu d'en créer une.

→ Dis à Claude : « clé APNs dans Téléchargements, Key ID XXXXXXXXXX ». Il
pose `APNS_KEY_ID` et `APNS_PRIVATE_KEY` (l'équipe `BQ379Y93X3` et le sujet
`app.fillsell.app` sont déjà connus).

---

## C. Envoyer les binaires 2.9.62

**Android** (fichier préparé par Claude après le bloc A) :
Play Console → FillSell → **Production** → **Créer une release** →
téléverse le SEUL fichier du dossier
`C:\Users\nicol\fill-and-sell\build\AAB-A-TELEVERSER-2.9.62-vc33\` →
notes de version (ci-dessous) → **Suivant** → **Enregistrer** → **Envoyer
pour examen**.

**iOS** (rien à téléverser : Codemagic fabrique et envoie à TestFlight) :
1. Codemagic → app FillSell → **Start new build** → workflow **Capacitor iOS
   Build**, branche **main** → **Start**. ~25 min → TestFlight.
2. App Store Connect → FillSell → **+ Version** `2.9.62` → section Build :
   choisis le build Codemagic → notes de version → **Ajouter pour examen** →
   **Envoyer pour examen**.

Notes de version proposées :
> Nouveau : sois prévenu dès qu'un article se vend, sur toutes tes
> plateformes. Active les notifications quand l'app te le propose, ou dans
> Réglages › Préférences.

---

## D. Le test de ce soir (téléphone de Nico, binaire 2.9.62 installé)

1. Ouvre FillSell (connecté). Si l'écran « Sois prévenu dès qu'un article se
   vend » s'affiche → **Activer** → **Autoriser**. Sinon : Réglages ›
   Préférences › **Notifications de ventes** → allume.
2. Claude vérifie que le téléphone est enregistré (`appareils_push`).
3. **Envoi de test sans vente** : Claude pose une note d'essai sur ton compte
   (« 🎉 Vendu sur Vinted : Article test 999 € ») → la notification arrive
   en ~20 s, app fermée. Appuie dessus : l'app s'ouvre.
4. **Vraie vente** : sur une annonce cobaye à 999 € (jamais le tableau),
   une vente de test, ou la passer « vendue » côté plateforme → la veille
   la voit → notification en ~20 s après la détection.
5. Couper dans Réglages → plus rien sur ce téléphone.
