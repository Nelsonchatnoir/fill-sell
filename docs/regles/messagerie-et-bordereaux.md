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
- **Bordereau : AU CLIC seulement** (16/10 soir, migration 20261016200000). La dernière marche (le fichier)
  ne s'ouvre que pour une demande née d'un clic sur « Bordereau » dans l'app (`bordereau_demander`, session de
  la personne) ; l'extension la prend (`bordereau_demande_a_traiter`, UNE à la fois), ouvre la dernière marche
  UNE fois, dépose la copie, rend le résultat (`bordereau_demande_resultat`). Il faut à la fois
  `BORDEREAU_DERNIERE_MARCHE_OUVERTE = true` (`chrome-extension/messagerie.js`) ET
  `coin_config.bordereaux_ouverts = 1` (0 = tout fermé). Seul un bordereau PRÊT chez la plateforme se demande
  (Vinted 220/230/250, Leboncoin `available` + `parcel-label-generated`) ; une demande non prise en 30 min
  expire (poste éteint : jamais servie en retard) ; 20 demandes par jour ; une copie encore valable est rendue
  sans rien redemander. Vinted : `pdf_label`, sinon `digital_label` UNE fois. Copie au nom UNIQUE (horodaté :
  jamais d'écrasement), type lu dans le fichier (PDF/PNG/JPEG), 5 Mo au plus. **Générer** un bordereau n'est
  codé nulle part : Vinted « commander l'étiquette », Leboncoin « confirmer la disponibilité », Beebs « accepter
  la commande » (= débit de l'acheteur), eBay « acheter l'étiquette » sont des gestes du vendeur — l'app dit
  l'état et ouvre la bonne page de la plateforme (`actionCommande`, `lienCommande` dans `src/messagerie/vue.js`).
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
  rattaché à aucun. Vinted : sur une vente passée, `transaction.item_id` (et titre, photo) revient VIDE et le
  numéro n'est plus que dans `item_ids` (constaté le 16/10, 8 fils de Nico) → `articleUniqueVinted` lit
  `item_id`, sinon le SEUL élément d'`item_ids`.
- **Règle de lecture changée = relecture une fois, au rythme ordinaire.** Le poste garde la mémoire des fils
  déjà détaillés ; changer ce qu'un normaliseur lit dans le détail impose d'augmenter `REGLE_DETAIL[plateforme]`
  (`messagerie.js`) : la mémoire de cette plateforme est oubliée une fois et les fils sont relus 5 par passage,
  les plus récents d'abord. Jamais de relecture en rafale, jamais de réparation en base pour forcer une relecture.
- **eBay** : messages par la Trading API (`GetMyMessages`) avec le jeton DÉJÀ consenti (aucun scope ajouté ;
  `commerce.message` reste interdit, la Message API REST répond 403) ; étiquettes : la Logistics API répond
  403 (US seulement) — le bordereau eBay s'achète dans eBay. Fonction `ebay-messagerie` (`verify_jwt = false`,
  garde à deux branches : secret du vault OU session bêta).
- **Beebs** (relevé le 16/10 soir, en lecture, sur le compte d'Ornella — téléphone vérifié) : messagerie et
  bordereau exigent un téléphone vérifié. Détection SANS requête : le jeton de session (cookie `access_token`,
  jeton Firebase) porte l'identité « phone » (`firebase.identities.phone` / `phone_number`) ; sinon motif
  `telephone_non_verifie` noté en base, et la page `/fr/account/chats` renvoie de toute façon vers
  `/fr/account/phone-verification`. Ne jamais saisir un numéro à la place de la personne. Liste = HTML rendu de
  `/fr/account/chats` (liens `/fr/account/chats/<id>` : nom public, date, aperçu, pastille) ; détail = flux RSC
  de `/fr/account/chats/<id>` (en-tête `RSC: 1`) ; réponse = `POST https://api.beebs.app/chats/v3`
  `{to_user_id, text}`, en-tête `authorization` = le jeton BRUT ; l'utilisateur « système » de Beebs =
  `iwJIYrpj3cYueeS5JWCQCIKHbfx2`. Beebs n'a pas de pseudo : le nom public affiché (« Prénom N. ») en tient lieu,
  jamais le nom complet, jamais l'avatar. Commandes = liens de la page « Ventes » (flux RSC) + objet commande de
  la page `/fr/account/orders/<id>` (états du site WAIT_SELLER_CONFIRM → … → LABEL_PRINTED, date limite =
  bordereau + 6 jours) — lues même quand la messagerie est murée. Ouvrir une conversation SUR LE SITE la marque
  lue (lire le flux depuis l'extension : non prouvé, accepté par Nico le 16/10).

## Règles (16/10 soir, clôture du chantier)

- **Un mur se DIT, il ne se tait pas.** Une lecture empêchée par la plateforme (Beebs sans téléphone,
  session absente, jeton absent, Depop non autorisé, eBay à reconnecter, pause de sécurité) laisse son motif
  dans `messagerie_releves.dernier_motif` / `pause_jusqu_au` ; l'app le traduit (`murReleve`) en tête des
  messages, avec le geste à faire. Un mur de la LISTE n'est pas un blocage : les commandes sont lues quand même.
  Un 401 seul n'est pas un mur (jeton Vinted d'une heure) ; un incident passager (onglet indisponible) non plus.
- **Vinted, 401 = jeton expiré** : renouvelé comme la page (`POST /web/api/auth/refresh`), puis l'appel est
  refait UNE fois — liste, détail, commandes, chemin du bordereau, envoi d'une réponse (un 401 = refusé avant
  tout traitement, la seconde tentative ne peut pas doubler un message). Jamais de seconde tentative après une
  autre erreur ; jamais de boucle.
- **Commandes de toutes les plateformes** : Vinted, Leboncoin, Beebs, Depop par l'extension (même passage que
  les messages) ; eBay par `ebay-messagerie`, qui relit aussi par leur numéro les commandes suivies sorties du
  filtre « à expédier » (une commande expédiée ne reste jamais « à expédier »). Commandes Beebs et Depop : formes
  écrites d'après le code des sites (aucune vente le 16/10) — une forme inconnue n'écrit rien (Beebs) ou reste
  « inconnu », affichée « État à vérifier » (Depop). Purge : closes 30 jours, toute commande figée 60 jours.
- **Écrans** : aucun temps estimé (garde `selftest:aucune-estimation`) — seules les dates données par une
  plateforme (date limite de dépôt, 48 h Beebs) s'affichent, marquées `estimation-ok:`. Arobase seulement là où
  la plateforme a des pseudos (Vinted, eBay, Depop) ; transporteurs en clair (`libelleTransporteur`).
- **Liste blanche** : procédure exacte (une requête par conversation, son inverse, contrôle « vide ») dans le
  rapport, § 9.4. Une réponse écrite pendant le verrou ne part jamais après coup.
