# Messagerie des plateformes, commandes « à expédier », bordereaux

> Sujet ouvert le 16/10/2026 (chantier « messages + bordereaux », bêta compte de Nico).
> Rapport : `docs/enquetes/messages-bordereaux-1610/RAPPORT.md` (contrats relevés, preuves, checklist en direct).
> Une règle nouvelle de ce sujet s'ajoute ICI, jamais dans `CLAUDE.md`.

## Règles (16/10)

- **Bêta fermée par défaut** : tout passe par `profiles.beta_flags.messages_bordereaux = true` (lu en base par
  `messagerie_beta`, fail-closed). Coupure générale des relevés : `coin_config.messagerie_releves_ouverts = 0`.
  Rien n'est visible ni exécuté pour un compte sans le drapeau (une lecture de `messagerie_compteurs` au
  chargement de l'app, puis plus rien).
- **Lire ≠ marquer lu.** Les plateformes marquent lu par un appel SÉPARÉ (Vinted `PUT …/mark_as_read`,
  Leboncoin `PUT …/messages/<id>/read`, Depop `PATCH …/mark-read`, eBay `ReviseMyMessages`) : jamais appelé.
  `messagerie_vue` ne touche que FillSell. ⛔ En automatisation, ne jamais ouvrir la PAGE « Messages » d'une
  plateforme : Vinted et Leboncoin y ouvrent seuls la conversation la plus récente (lue). Lire l'API depuis
  l'accueil.
- **Répondre = liste blanche.** `messagerie_repondre` enregistre toujours, mais seule une conversation de
  `messagerie_liste_blanche` passe « en_attente ». La liste blanche ne s'écrit qu'en SQL, par Nico (aucune
  politique d'écriture). L'exécutant (extension, ou `ebay-messagerie` pour eBay) prend UNE réponse à la fois
  (`messagerie_reponse_a_envoyer` relit la liste blanche), la relit encore avant l'envoi, 60 s entre deux,
  20 par jour. Une réponse prise et non confirmée en 10 min passe « echec » et n'est **jamais renvoyée**
  (un doublon chez l'acheteur est pire qu'un raté). Jamais d'envoi en série, jamais de réponse automatique,
  jamais d'IA sur un message.
- **Bordereau : la dernière marche est fermée** (`BORDEREAU_DERNIERE_MARCHE_OUVERTE = false` dans
  `chrome-extension/messagerie.js` ET `coin_config.bordereaux_ouverts` ≠ 1). **Générer** un bordereau n'est
  codé nulle part : Vinted « commander l'étiquette » (`PUT transactions/<id>/shipment/order`), Leboncoin
  « confirmer la disponibilité » (`POST purchases/<id>/validate-availability`), Beebs « générer » (=
  accepter la commande, débit de l'acheteur) sont des gestes du vendeur. Le bouton « Bordereau » de l'app
  reste inactif tant que la checklist du rapport (§ 3) n'a pas été faite sur une vraie commande.
- **Données** : pseudo de l'interlocuteur / de l'acheteur, numéros (fil, commande, annonce, colis), texte des
  messages pour l'affichage. JAMAIS nom, adresse, téléphone, e-mail (eBay : `shipTo`,
  `buyerRegistrationAddress` jamais lus). Messages, conversations, réponses : 30 jours (`messagerie_purger`,
  cron quotidien) ; commandes closes : 30 jours ; copie de bordereau : **5 jours au plus** (contrainte en
  base, `bordereaux-purge` horaire). Aucun texte dans `usage_logs`, l'ops-digest, un journal ou la console.
- **Cadence et blocage** : la relève de l'extension vit derrière la veille des commandes (même poll, 10 min ±
  90 s par plateforme) ; 1 liste + 5 détails au plus + commandes en cours + 5 détails ; le serveur dit oui
  avant chaque passage (`messagerie_releve_autorise` : bêta, coupure, pause, anti-robot Vinted, plateforme en
  pause). Premier 403 / 429 / captcha / DataDome : `messagerie_releve_bloque` (6 h, 24 h si récidive) + pause
  locale.
- **Rattachement à l'article** : par l'identifiant seulement (`messagerie_article_pour_annonce` : fiche Vinted,
  annonce relevée prouvée, dépôt FillSell prouvé) — jamais le titre. Un lot (plusieurs articles) n'est
  rattaché à aucun.
- **eBay** : messages par la Trading API (`GetMyMessages`) avec le jeton DÉJÀ consenti (aucun scope ajouté ;
  `commerce.message` reste interdit, la Message API REST répond 403) ; étiquettes : la Logistics API répond
  403 (US seulement) — le bordereau eBay s'achète dans eBay. Fonction `ebay-messagerie` (`verify_jwt = false`,
  garde à deux branches : secret du vault OU session bêta).
- **Beebs** : la messagerie et le téléchargement du bordereau exigent un numéro de téléphone vérifié sur le
  site ; non relevé tant que ce n'est pas fait par la personne (ne jamais le saisir à sa place).
