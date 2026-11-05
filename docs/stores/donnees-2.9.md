# Déclarations de données de la 2.9 — Apple (Confidentialité de l'app) et Google (Sécurité des données)

Préparé le 05/11/2026 au soir (lot « Ouverture du Cloud », phase 2), À SAISIR AVEC LA SOUMISSION (fin de la phase 3 :
la détection du pays peut ajouter une donnée). Relu dans le code ; chaque ligne dit d'où vient la donnée.
Aujourd'hui chez Apple (publié il y a 7 mois) : 2 types seulement — adresse e-mail, interaction avec le produit.

## Ce que l'app native collecte (rien n'est vendu ; aucun pistage au sens d'Apple dans l'app native)
| Type (Apple) | Type (Google) | D'où | Finalités | Lié à l'identité |
|---|---|---|---|---|
| Coordonnées › Adresse e-mail | Infos personnelles › Adresse e-mail | compte, mails de service et d'assistance, mails du parcours (email-tunnel) | Fonctionnalités de l'app ; Publicité ou marketing du développeur | oui |
| Identifiants › Identifiant utilisateur | Infos personnelles › ID utilisateur | compte Supabase, pseudo | Fonctionnalités | oui |
| Identifiants › Identifiant de l'appareil | Appareil ou autres ID | identifiant d'installation (un essai Cloud par appareil, haché en base), jeton de notification | Fonctionnalités (prévention de la fraude à l'essai) | oui |
| Achats › Historique des achats | Infos financières › Historique des achats | abonnements (Apple, Google, Stripe), packs | Fonctionnalités | oui |
| Données financières › Autres données financières | Infos financières › Autres infos financières | prix d'achat, de vente, marges du stock | Fonctionnalités | oui |
| Contenu utilisateur › Photos ou vidéos | Photos et vidéos › Photos | photos des annonces (stockage), Lens (analyse par Anthropic), retouche (OpenAI) | Fonctionnalités | oui |
| Contenu utilisateur › Données audio | Fichiers audio › Enregistrements vocaux | dictée d'un article (voice-transcribe → transcription OpenAI, non gardée) | Fonctionnalités | oui |
| Contenu utilisateur › Service client | Messages › Autres messages | mails à l'assistance, « signaler un bug » | Fonctionnalités | oui |
| Contenu utilisateur › Autre contenu | Activité dans l'app › Autre contenu généré | annonces, fiches du stock, messagerie des plateformes (bêta) | Fonctionnalités | oui |
| Données d'utilisation › Interaction avec le produit | Activité dans l'app › Interactions | événements de l'app (parcours, feuille des formules) | Analyses ; Fonctionnalités | oui |
| Diagnostics › Autres données de diagnostic | Infos et performances de l'app › Autres | version de l'app et de l'extension, erreurs jointes à un signalement | Fonctionnalités | oui |
| Autres données | Autres | FillSell Cloud : sessions des plateformes (cookies, gardés chiffrés sur nos serveurs), identifiants de compte de plateforme hachés (un essai par compte Vinted) ; les mots de passe tapés dans « Me connecter » transitent vers la plateforme, jamais gardés | Fonctionnalités | oui |

Google : données chiffrées en transit — oui ; demande de suppression — oui (suppression du compte dans l'app, à
vérifier sur le binaire 2.9) ; aucune donnée partagée avec des tiers à des fins publicitaires ; sous-traitants
(Supabase, Hetzner, IPRoyal, Anthropic, OpenAI, Stripe, Resend) = « transfert à un prestataire », non déclaré comme partage.

## Points ouverts (à trancher avant la saisie)
- **GTM dans l'app native** : `index.html` charge Google Tag Manager (GTM-TJNKL6T5) sans condition — donc aussi dans
  l'app iOS/Android. Selon les balises du conteneur (GA4 ? Google Ads ? Meta ?), il faut soit le couper dans l'app native
  (le plus simple), soit déclarer les données de Google (et, s'il y a de la publicité, le pistage + la demande ATT).
  Le pixel Meta, lui, ne se charge pas dans l'app native (bandeau de consentement absent : `!isNative`).
- **Pays (phase 3)** : lu sur le compte ou le téléphone → rien à déclarer ; lu par l'IP → « Localisation approximative ».
