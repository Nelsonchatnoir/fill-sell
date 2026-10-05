# FillSell Cloud — politique de confidentialité et CGV de l'option (FINALES, 05/10)

**Source unique des textes : `src/cloud/textesLegaux.js`** (français et anglais).
Ce fichier-ci explique ce qu'ils disent, pourquoi, et comment ils partent.

## 1. Comment ils se publient — avec la mise en ligne, sans geste de plus

- `src/pages/Legal.jsx` les affiche **seulement** quand `CLOUD_TEXTES_LEGAUX`
  est vrai (`src/config/cloudOffer.js`), et cet interrupteur **suit le drapeau de
  l'offre** (`= CLOUD_OFFER_ENABLED`). Le jour où l'offre s'ouvre (mise en ligne,
  étape 6), la page `/legal` les montre dans le même push, la même OTA.
- Drapeau baissé (aujourd'hui) : `/legal` se rend **octet pour octet** comme la
  version servie (`scripts/cloud/preuve-identite-compte-ordinaire.mjs`, scènes `LG`).
  Jamais ouverts aux seuls témoins : page publique, sans compte (règle du 15/09).
- Si la revue Apple exigeait les textes AVANT l'ouverture : lever
  `CLOUD_TEXTES_LEGAUX` seul (`= true`), un push, une OTA.
- Contrôle : `npm run selftest:cloud-textes-legaux` (39) — chaque durée et chaque
  fait est relu dans le code (migration du socle, règles pures, orchestrateur,
  palier.js) ; `/legal` rendu interrupteur baissé (aucune trace) puis levé (tout
  y est, articles 1 à 6 intacts).

## 2. Où ils vont sur `/legal`

| Endroit | Ajout |
|---|---|
| CGU 3.9 (plateformes tierces) | une phrase : avec l'option, le navigateur est sur nos serveurs, toujours dans les sessions de l'utilisateur |
| CGV article 2 (extension requise) | une phrase : l'exception de l'option (Vinted, Leboncoin) |
| CGV **article 7** (nouveau) | objet, prix, essai, arrêt, rétractation (renvoi à l'article 6), responsabilité |
| Confidentialité 4.7 (sous-traitants) | Hetzner Online GmbH ; IPRoyal Services FZE LLC |
| Confidentialité **4.8** (nouveau) | ce qui est gardé, où, combien de temps, l'essai unique |

## 3. Ce qui a changé par rapport au brouillon (relecture du 05/10)

1. **IPRoyal n'est PAS lituanien.** Le prestataire est **IPRoyal Services FZE LLC,
   Ajman, Émirats arabes unis** (conditions et politique de confidentialité relues
   le 05/10). C'est un **transfert hors de l'Union européenne** : le texte le dit,
   et dit son encadrement — les **clauses contractuelles types** de la Commission
   (module 2), incluses dans l'accord de traitement d'IPRoyal, qui fait partie de
   ses conditions. IPRoyal garde ses journaux de trafic **au moins 6 mois** : dit.
2. **Le mot de passe passe par nos serveurs.** Le brouillon disait « nous ne voyons
   jamais ton mot de passe ». Faux en l'état : « Me connecter » transmet la saisie
   du téléphone au navigateur par le serveur (`Input.insertText`). Le texte dit
   maintenant exactement cela : transmis, **ni enregistré ni journalisé** (relu
   dans `serveur-cloud/src/connexion.js` : aucune écriture, aucun journal de la
   saisie, image de la page en direct jamais écrite).
3. **Ajouts de ce que le code garde** et que le brouillon taisait : l'historique de
   l'IP réservée (identifiant effacé à 12 mois), le journal des connexions « Me
   connecter » (90 jours), les empreintes gardées **même si le compte est
   supprimé** (`ON DELETE SET NULL`), les comptes de plateforme **déjà reliés à
   FillSell** (relevés Vinted) parmi les verrous de l'essai, la base légale.
4. **Le ton de la page** : vouvoiement en confidentialité, « l'utilisateur » en
   CGV (le brouillon tutoyait).
5. **Les boutiques** : l'essai App Store / Google Play est celui de la boutique, et
   l'option s'y arrête dans ses réglages ; l'arrêt « en un geste, immédiat » est
   celui du web.
6. **Le rappel** : « au plus tard la veille », dans l'app et par e-mail (fenêtre
   J-2 → J-1 du code) ; les rappels de Stripe sont coupés par Nico (05/10).
7. **La traduction anglaise** est écrite (même forme, contrôlée).

## 4. Ce qui reste à Nico (avant la mise en ligne, rien de technique)

1. **Lire et valider** les textes (`src/cloud/textesLegaux.js`).
2. **Hetzner : conclure l'accord de sous-traitance (AVV / DPA)** dans le compte
   Hetzner (accounts.hetzner.com, rubrique des contrats / « Auftragsverarbeitung ») —
   en ligne, quelques clics. Sans lui, Hetzner n'est pas un sous-traitant en règle.
3. **IPRoyal** : son accord de traitement (avec les clauses contractuelles types)
   est accepté avec ses conditions à l'inscription — rien à signer.
4. **Registre des traitements** de FillSell : y ajouter l'option (finalités,
   données, durées, sous-traitants — tout est dans les textes).
5. **Fiches des boutiques, le jour de l'ouverture** : « Confidentialité de l'app »
   (App Store Connect) et « Sécurité des données » (Google Play) — l'option ajoute
   un **identifiant d'appareil** (haché, prévention de la fraude : un essai par
   personne).
6. Consentement : pas de case à cocher (base légale = exécution du contrat ;
   intérêt légitime pour l'essai unique) ; l'écran « Me connecter » dit déjà que
   les connexions sont gardées chiffrées et effacées à l'arrêt de l'option.
