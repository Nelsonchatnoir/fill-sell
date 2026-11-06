# Lot « Prêt à soumettre » (06/11/2026) — état des stores, champ par champ, et ce qui reste

Heures de Paris. Tout ce qui suit a été LU (API d'App Store Connect depuis la session ouverte, Play Console, base, code)
au moment indiqué. Ordre de Nico : seul l'abonnement Cloud se soumet ; la 2.9 (Apple) et la version Google attendent
l'AX42, un test réel sur ce serveur, puis le feu vert de Nico.

## 1. Apple — App Store Connect (app 6762152785, version 2.9 « À finaliser avant soumission », sortie MANUELLE)
| Champ | FR | EN | État |
|---|---|---|---|
| Nom | FillSell – Crosslisting | FillSell – Crosslisting | fait (part avec la 2.9 ; en ligne : « Achat Revente » / « Reseller App ») |
| Sous-titre | Assistant IA pour revendeurs | AI Inventory & Profit | fait |
| Description | 3 866 car., Depop oui, Opla non, Cloud « en France » | 3 498 car., LBC/Beebs « in France » seulement | fait |
| Nouveautés | oui | oui | fait |
| Mots-clés | cross-post,cross-listing,multi-plateformes,revente,annonces | crosslist,cross-post,reseller,multi-platform,listing,resale | fait |
| Vidéo d'aperçu | iPhone 6,3" + 6,9", iPad 13" (25 s, affiche à 10 s) | idem | fait 06/11 (6 vidéos, traitées par Apple) |
| Captures | 8 × iPhone 6,3", 6,5", 6,9" + iPad 13" | idem | fait 06/11 (64, toutes « COMPLETE ») ; iPhone Duo : non (facultatif) |
| En-tête de page produit (5244×2950) | — | — | non fait (facultatif, nouveau) |
| URL confidentialité | /legal#confidentialite | /legal?lang=en#confidentialite | fait |
| URL support / marketing | https://fillsell.app | https://fillsell.app | fait |
| Catégorie | Économie et entreprise / Finance | | inchangé |
| Âge | 4+ | | inchangé |
| Confidentialité de l'app | 13 types publiés 06/11 | | fait (docs/stores/donnees-2.9.md) |
| Notes relecteurs + compte | test@fillsell.app (mot de passe déjà saisi), notes 06/11 collées | | fait |
| Contrat « Paid Applications » | nouvelle version ACCEPTÉE 06/11, actif jusqu'au 13/04/2027 | | fait |
| Statut DSA | en vigueur : « pas commerçant » (16/04) ; le passage en « commerçant » n'a pas été enregistré (500 ×3, formulaire revenu vide le 06/11 vers 13:00) | | ⏳ Nico : ressaisir + codes e-mail/téléphone + avis SIRENE (build/stores/avis-situation-sirene-928578434.pdf) |
| Abonnements | Premium, Pro, Pro2, Premium Founder, Business : APPROVED ; **Cloud : WAITING_FOR_REVIEW** (soumis 10:37) | | fait |
| Binaire 2.9.161 | — | — | fait 06/11 13:20 : Codemagic 175 (dbd9f34) ENVOYÉ, build 2611061217, non soumis ; 172-174 refusés (lock, puis profil sans Push) |

## 2. Google — Play Console (app 4973021343170715891, publication gérée ACTIVÉE)
| Champ | fr-FR | en-US | État |
|---|---|---|---|
| Nom | FillSell – Crosslisting | FillSell – Crosslisting | en ligne depuis le 05/11 |
| Description courte | 5 plateformes | « One photo, one listing, posted to all your marketplaces. » | fait |
| Description | Depop oui, Opla non, Cloud « En France » | corrigée 06/11 : « Vinted, eBay or Depop (and, in France, Leboncoin and Beebs) », « cinq plateformes » et « LBC et eBay : bientôt » retirés | brouillon enregistré |
| Captures téléphone | 8 neuves, dans l'ordre | 8 neuves (EN), dans l'ordre | brouillon enregistré |
| Bannière 1024×500 | « Crée une fois. Vends partout. » | « List once. Sell everywhere. » | brouillon enregistré |
| Vidéo | youtube.com/watch?v=nPXOWMjW_AE (non répertoriée) | youtube.com/watch?v=9nqPNDN33yA (non répertoriée) | brouillon enregistré (vidéo verticale 1080×1920 : YouTube la classe en Short) |
| Icône | inchangée | | ok |
| Catégorie / tags | Productivité ; Finances perso, Outils, Productivité, Shopping | | inchangé |
| Coordonnées | support@fillsell.app, site | | inchangé |
| Sécurité des données | 14 types, suppression dans l'app, lien /legal#confidentialite | | enregistré 06/11, non envoyé |
| Accès à l'app | googlereview@fillsell.app (mot de passe inchangé) + notes 06/11 | | enregistré, non envoyé |
| Classification, cible, annonces… | 21/06/2026 | | inchangés |
| Déclaration IA | aucune déclaration « IA » proposée dans Contenu de l'application (10 déclarations, toutes traitées) | | rien à remplir aujourd'hui |
| Statut professionnel | « compte professionnel » choisi, coordonnées du profil de paiement | | ⏳ code SMS à saisir par Nico |
| Abonnements | Premium, Pro, Business actifs ; Cloud actif (forfait mensuel, essai 7 j) + traduction en-US ajoutée 06/11 | | fait |
| AAB 2.9.161 (vc 33) | — | — | fait 06/11 : build/AAB-A-TELEVERSER-2.9.161-vc33/ (a61d0ec, Firebase, même clé que 2.9.38) ; piste interne : BROUILLON enregistré, aucun testeur, rien envoyé |

## 3. Code et base (06/11)
- Textes légaux du Cloud PUBLIÉS sur /legal (`CLOUD_TEXTES_LEGAUX = true`, offre toujours fermée) + clause « Territoire :
  France » + date du 6 novembre.
- Feuille des formules : Depop ajoutée à « Publication sur Vinted, Leboncoin, eBay, Beebs & Depop » (FR/EN).
- Traduction à l'affichage des messages stockés, export Excel et canal « Sales » en anglais (agent, relus).
- ⛔ Bug trouvé et corrigé : `pushVentes.plugin()` ne rendait jamais la main sur un vrai téléphone (plugin Capacitor
  pris pour une promesse) — `selftest:push-plugin-proxy` (règle : docs/regles/ventes-et-retraits.md).
- Migration 20261105230000 APPLIQUÉE 10:47:47 (feu vert nommé) ; journal relu sur de vraies republications.
- Binaire : versions alignées 2.9.161 (package.json, Android vc 33, Codemagic) — au-dessus de l'OTA servie (2.9.160).

## 4. Restes (qui, pourquoi)
- Nico : pièce justificative DSA Apple ; code SMS Google ; conditions Firebase (le garde-fou refuse que Claude accepte
  des conditions) ; clé APNs « FillSell Push » et clé privée Firebase (création de secrets refusée à Claude) ; pousser main (2 commits du terminal « Problèmes » en attente).
- Après les clés : `npm run binaires` (AAB 2.9.161 + Codemagic → TestFlight), téléversement en piste interne, essais
  avec les comptes de relecture (TestFlight / piste interne : identifiants = geste de Nico).

## 5. Suite du 06/11 après-midi
- Parcours connecté EN ANGLAIS prouvé sur le compte de démo test@fillsell.app (WebKit iPhone isolé, session par lien à
  usage unique côté serveur, révoquée ensuite) : Board, AI Stock, Sales, Stats en anglais ; reste trouvé et corrigé :
  la pastille « Sans plateforme » (Sales). Trouvé : ce compte affiche des dinars serbes (RSD) — script
  scripts/reparations/20261106_compte_relecture_apple_euro.sql prêt, non appliqué (garde-fou : à lancer par Nico).
- Web : site bloqué sur 8bd22d6 de 05/11 23:04 à 06/11 12:30 (lock) ; règle npm ci (a459538).
