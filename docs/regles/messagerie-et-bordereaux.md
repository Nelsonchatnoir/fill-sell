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
  expire (poste éteint : jamais servie en retard ; **24 h depuis le 17/10**, migration 20261017100000) ; 20 demandes par jour ; une copie encore valable est rendue
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

## Règles (16/10 nuit — « utilisable pour de vrai », mission de Nico)

- **Comptes bêta : Nico et Ornella, personne d'autre.** Ornella = `ornellaracano@icloud.com`
  (`f8aa02a5-23cb-4325-bba8-127f61a75741`, identifiée le 16/10 à 22:50 ; les deux autres comptes « ornella… » sont
  d'autres personnes, sans activité). Script `scripts/reparations/20261016_drapeau_messagerie_ornella.sql`
  (sauvegarde `_backup_1610_beta_flags_ornella`, inverse dans le fichier). Contrôle : `count(*)` des porteurs = 2.
- **Répondre SANS liste blanche** (migration 20261016220000, **APPLIQUÉE le 17/10 vers 09:00**, feu vert nommé ; 33/33
  rejouées sur la prod ; seuls les 2 porteurs du drapeau passent, prouvé sur un compte réel sans drapeau) : interrupteur `coin_config.messagerie_envoi_mode`
  (0 fermé : les réponses en attente sont reverrouillées ; 1 liste blanche, valeur si la clé manque ; 2 ouvert aux
  comptes bêta). Garde-fous, tous en base ou prouvés : une réponse ne naît que d'un appui (session) ; même clé =
  même réponse ; même texte vers la même conversation en 10 min = même réponse ; l'app garde UNE clé par brouillon
  jusqu'à la réponse de la base (un second appui après une coupure rejoue le même envoi) ; l'exécutant prend une
  réponse à la fois et ne la renvoie JAMAIS (prise sans confirmation en 10 min → « echec / sans_confirmation »,
  dit « vérifie sur la plateforme ») ; une réponse qu'aucun poste n'a prise en 24 h ne part jamais en retard
  (« echec / trop_ancienne ») ; clé d'idempotence de la plateforme = numéro de notre réponse (Leboncoin
  `clientMessageId`, Depop `idempotency_key`).
- **Texte EXACT** : plus aucun `btrim` (seul un texte vide est refusé) ; empreinte SHA-256 du texte
  (`messagerie_reponses.empreinte`, calculée en base, comparée à celle de l'app si elle la donne, RECALCULÉE par
  l'exécutant — extension ou `ebay-messagerie` — juste avant l'envoi : différente, rien ne part,
  `empreinte_differente`). Trace : statut, prise, fin, `resultat` {http, code, message_ref, executant, empreinte_ok}.
- **Générer le bordereau = un appui, PUIS l'écran de confirmation.** Vinted « commander l'étiquette », Leboncoin
  « confirmer la disponibilité », Beebs « accepter la commande » : l'écran dit en une phrase ce que le geste engage
  (`phraseEngagement`, `src/messagerie/vue.js`) ; seul « Confirmer » appelle `bordereau_generer`, qui GARDE la phrase
  (`bordereaux_demandes.engagement`) et refuse sans elle. Interrupteur `coin_config.bordereaux_generation_ouverte`
  (et `bordereaux_ouverts`). Jamais automatique, jamais en lot.
- **UNE génération par commande, à vie** : index unique partiel `bordereaux_demandes_une_generation` (demandée, en
  cours, générée, prête, incertaine) ; `bordereau_generer` rend la génération existante (`deja`) ; l'extension relit
  l'état de la plateforme AVANT le geste (déjà fait → aucun appel qui engage, on récupère) ; le geste part UNE fois
  (Vinted : une seconde seulement après un 401, refusé avant tout traitement) ; issue inconnue (réseau coupé, 5xx,
  onglet figé, prise sans réponse en 10 min) → « incertaine », jamais refaite. Les extensions d'avant (sans
  `p_capacites: ['generer']`) ne reçoivent jamais une génération.
- **Ce que FillSell envoie** (code des sites relu le 16/10 nuit, règles pures `decisionGeneration` /
  `corpsCommandeVinted` / `issueGeneration` de `chrome-extension/messagerie.js`) :
  · Vinted : `PUT /api/v2/transactions/<id>/shipment/order` {seller_address_id (numéro de l'adresse par défaut lu sur
    `api.vinted.fr/shipping-estimation/external/shipping_address`, rien d'autre), drop_off_type « point » quand Vinted
    propose point ET domicile, reusable_package_selected false si proposé, label_type choisi dans l'app (1 PDF, 2 code,
    3 QR)} ; refus SANS geste : adresse incomplète, téléphone exigé, enlèvement à domicile / date à choisir, type à
    choisir. Les options (`GET shipments/<id>/label_options`) sont relevées EN LECTURE une fois par 6 h et par
    commande (`plateforme_commandes.options_bordereau` : types et booléens seulement).
  · Leboncoin : `POST /api/consumergoods/purchase/v1/purchases/<id>/action/validate-availability` sans corps, pour les
    seuls envois dont le bordereau naît de la confirmation (mondial_relay, mondial_relay_home, shop2shop,
    relais_colis_*) ; Colissimo / courrier suivi (formulaire d'adresse), envoi libre, main propre → sur Leboncoin.
    Réponse `USECASE_ENTITY_ALREADY_EXISTS` = déjà confirmée.
  · Beebs : l'action serveur `sellerConfirmAction([orderId])` du bouton « Télécharger le bordereau », POST sur la page
    de la commande avec `Next-Action` = identifiant relu à chaque fois dans le code de la page ; téléphone vérifié
    exigé ; remise en main propre (transporteur `5QAfJXcdv81jPJOE8H03ej`) exclue. Le fichier : cherché dans l'objet
    commande (clé « label »/« bordereau » ou PDF) — introuvable, l'app dit « télécharge-le sur Beebs ».
- **Le fichier après le geste** : une tentative 8 s après, puis la « suite » (`bordereau_demande_a_traiter` rend la
  génération « générée » sans copie : 2 min d'écart, 15 essais, 24 h) ; une copie prête ferme aussi la récupération
  de la même commande. eBay : l'étiquette est PAYANTE et s'achète sur eBay (pas d'API en France, conditions d'eBay
  contre tout procédé automatique) — jamais par FillSell. Depop : pas de bordereau en France.
- **Partager, imprimer, 10 × 15** (`src/messagerie/impression/`, chargé à l'usage seulement) : original ou étiquette
  10 × 15 (découpée dans l'A4, tournée, PDF 100 × 150 mm), recadrage retenu par transporteur sur l'appareil, codes
  sans papier en grand, « Tout imprimer » (2 copies prêtes ou plus) en un PDF. App Android (et repli iOS) : le PDF
  fabriqué est déposé sous `<uid>/impressions/` puis ouvert par adresse signée (10 min) ; ces fichiers, et tout
  fichier du bucket qu'aucune copie vivante ne tient, sont effacés après 24 h (`bordereaux_a_purger` +
  `bordereaux-purge` v2).

## Règles (17/10 — écrans bêta vus sur iPhone par Nico)
- **L'écran « Messages » / « À expédier » est une PAGE, jamais une couche.** Il s'ouvre dans le conteneur qui défile de
  l'app (`.wrap.page-pad`, sa réserve basse garde la fin au-dessus de la barre du bas) à la place du contenu de
  l'onglet : classe `fs-espace-beta-ouvert` sur le conteneur (posée pour un compte bêta seulement), règle dans
  `src/messagerie/espace.css` (le Stock reste monté, masqué). L'en-tête et la barre du bas restent les vrais. Cause du
  17/10 : l'ancienne couche `position:fixed` rendue dans l'app était peinte par WebKit SOUS l'en-tête et la barre
  (`src/utils/modale.js`, règle des couches) — croix cachée, onglet changé sous l'écran, liste écrasée.
- **En haut : la flèche ← et le titre.** Ouvrir crée une entrée d'historique (`useEcranMessagerie.js`), une
  conversation une de plus : la flèche, le retour du navigateur, le geste iOS (Safari) et le retour Android
  (Capacitor 8 : `webView.goBack()` tant qu'aucune couche n'écoute) font la même chose. Un appui sur un onglet (barre
  du bas, onglets du bureau) ferme l'écran et retire ses entrées ; un changement d'onglet venu d'ailleurs aussi.
  Ouvrir ne change jamais d'onglet. Au retour, le Stock retrouve sa place. App iOS native : pas de geste retour
  (WKWebView par défaut), la flèche et les onglets suffisent.
- **Les entrées vivent sur le Stock seul** (`tab===1`), même style neutre pour « Messages » et « À expédier » ; seul le
  compteur est coloré.
- **Aucun conteneur à hauteur fixe** dans ces écrans : la page défile d'un seul tenant ; les filtres défilent sur le
  côté (`flex: none`), jamais écrasés.
- **Toute couche de la bêta passe par `src/messagerie/Couche.jsx`** : portail sur `document.body`, `useFondFige`
  (barre du bas masquée), Échap et retour Android. Feuille « Générer le bordereau », aperçu, « Tout imprimer », code
  en plein écran (`premierPlan={false}` : ouvert PAR l'aperçu).
- **Vignette** (`Vignette.jsx`, sources `sourcesVignette` dans `vue.js`) : photo de l'annonce, puis photos de la fiche
  rattachée lues par `urlsPhotos` (une LISTE : la passer à `<img src>` donnait l'image cassée « ? »), une image qui
  casse passe à la suivante, plus rien = icône neutre.
- **Preuves** : `selftest:messagerie-app` (23 cas) ; banc `scripts/apercu/capture-espace-beta-page.mjs` (coquille
  d'App + vrais composants, WebKit ET Chromium à 390 px, 96 contrôles : flèche touchable sous l'en-tête, fin de liste
  et zone de réponse au-dessus de la barre, historique, onglets, place du Stock, compte sans drapeau intact).

## Règles (17/10 — « À expédier » : tout dans FillSell)
- **Règle de Nico** : tout ce que FillSell peut faire ou récupérer se fait dans FillSell ; la plateforme n'est qu'un
  dernier recours (lien discret « Voir la commande sur … », `LienSecours`), sauf ce que FillSell ne fait pas — la carte
  dit pourquoi : acheter une étiquette eBay, enlèvement Vinted à domicile / téléphone exigé / étiquette refusée par
  Vinted, envoi libre ou remise en main propre (Leboncoin, Beebs), indiquer l'envoi sur Depop. `actionCommande` (vue.js)
  rend `generer`, `bordereau`, `attente` (la plateforme prépare, FillSell guette) ou `lien` ; une matrice de 900 cas
  le tient (`selftest:messagerie-app`).
- **Réglages pas encore lus ≠ génération fermée** : `useReglagesMessagerie().generation` vaut true, false (fermée par le
  serveur) ou null (inconnue) ; inconnue, le bouton « Générer » reste (la base refuse si c'est fermé, rien ne part).
  C'était la cause de « c'est toi qui le fais » (17/10).
- **Vinted, options pas encore relues** : papier ou QR au choix ; l'extension vérifie juste avant le geste que Vinted
  propose ce type (`type_etiquette_indisponible` sinon : rien n'est commandé, le bouton revient).
- **Leboncoin Colissimo / courrier suivi** : générés depuis FillSell (`validate-availability` du proxy avec
  `sender.address` + `contact.phone`) ; l'expéditeur est l'**adresse du compte Leboncoin** (décision de Nico) lue dans
  la page au moment du geste (`pages/availability-confirmation/<id>` → `parcel.sender_address`), jamais sortie, jamais
  saisie ni gardée dans FillSell ; incomplète → `adresse_expediteur_a_completer`, rien ne part.
- **Beebs** : le site ne retélécharge pas le bordereau après `LABEL_PRINTED` (code relu le 17/10) ; l'extension garde
  toute adresse de fichier rendue par le geste et fouille la commande (6 niveaux, jamais un lien de suivi) — à prouver
  à la première vraie vente.
- **eBay** : le suivi d'une étiquette achetée (`shipping_fulfillment` : numéro, transporteur ; 10 lectures au plus par
  passage, `ebay-messagerie` v6) s'affiche ; « Expédiées depuis 3 jours » montre le suivi (eBay, Depop, Beebs) ; un
  numéro interne (Vinted, Leboncoin) n'est jamais montré comme suivi.
- **Ordinateur absent** : la demande attend (« En attente de ton ordinateur… ») ; non prise à temps, rien n'est fait
  et le bouton revient. **24 h** (feu vert de Nico, migration **20261017100000** appliquée le 17/10 à 11:45 ; 30 min
  avant) : récupérer comme générer (bordereau Vinted, disponibilité Leboncoin, acceptation Beebs).
- **Garde-fou du geste (17/10)** : juste avant tout geste, l'extension relit la commande chez la plateforme
  (`decisionGeneration`, puis relecture dans le geste lui-même) ; annulée, expédiée, en échec chez Vinted (210) ou
  déjà traitée entre-temps = AUCUN geste, refus nommé (`commande_annulee`, `deja_expediee`) — seule une étiquette
  prête ou en préparation vaut « déjà fait » (0.6.123 ; la 0.6.122 rendait « déjà fait » pour tout statut Vinted ≥ 200,
  sans geste non plus). `selftest:messagerie-generation`.

## Règles (18/10 — chantier « zéro orange + bordereaux », cause des échecs de Louis)
- **Vinted nomme les types d'étiquette en toutes lettres** (`printable`, `digital`, `code` ; code du site relu le
  18/10, `tO` / `backendCode`). Les chiffres 1/2/3 ne servent qu'à l'app (1 papier, 2 code, 3 QR) ; l'extension traduit
  (`TYPES_ETIQUETTE_VINTED`). `label_type` part en toutes lettres seulement quand Vinted en propose PLUSIEURS pour le
  dépôt (sinon nul, comme la page) ; un type inconnu de FillSell est gardé (`options_bordereau.types_vinted`) et la carte
  dit « Commander sur Vinted » — jamais deviné. Cause du 18/10 : types jetés (`Number("digital")`), commande sans type,
  Vinted 210 une seconde après.
- **Capacités de l'extension** (`CAPACITES_BORDEREAU`, messagerie.js) : `generer`, `vinted_types_texte`,
  `relance_vinted`. Le serveur ne donne une génération Vinted qu'à une extension « vinted_types_texte » ; non prise en
  15 min → « echec / extension_a_mettre_a_jour », rien commandé. L'app compare `profiles.extension_build` à
  `GENERATION_VINTED_BUILD_MIN` (vue.js) : avant, « Commander sur Vinted ».
- **L'échec de la plateforme se dit** : `bordereau = 'indisponible'` (Vinted 210, Leboncoin échec d'étiquette) ferme
  la génération « générée » sans copie (« echec / etiquette_echouee_chez_<plateforme> ») à chaque relevé et à chaque
  prise (`bordereaux_generations_closes`) ; la suite ne cherche plus de fichier. Jamais « généré » avant que la
  plateforme ait créé l'étiquette (texte « Demande faite sur … »).
- **Relance** d'une étiquette échouée : seulement sur autorisation écrite en SQL (`bordereaux_relances_autorisees`,
  aucun accès de l'app), UNE fois, avant une date limite, par une extension « relance_vinted » ; la base revérifie la
  commande juste avant (sinon consommée sans relance) ; choix et phrase d'engagement de la demande d'origine.
- **Fichier Vinted** : `pdf_label` d'abord, y compris pour un QR (la page fait de même) ; `digital_label` en recours
  (sa réponse porte le nom du destinataire : seul un fichier en est lu).

## Règles (24/10 soir — test réel du bordereau Vinted, vente de Nico à Ornella ; extension 0.6.136)
- **Le fichier d'une étiquette Vinted se lit EN OCTETS, jamais d'après une forme supposée** (`cheminBordereauVinted`,
  messagerie.js) : un PDF / PNG / JPEG brut (signatures `%PDF`, PNG, JPEG) est pris tel quel ; un JSON donne son base64
  (`file.label`, `label`, `file.content`, `file.data`, `data.label`) ou son lien (`label_url`, `file.url`,
  `file.label_url`, `url`, `data.label_url`), suivi UNE fois — la session ne part qu'à la même adresse que la page (un
  CDN, un tiers : sans, un lien signé n'en a pas besoin) ; jamais le jeton d'un lien dans la trace. Le type de la copie
  suit ses octets (`typeFichierBordereau`, background.js).
- **Cause des 8 demandes sans fichier** (Louis, Ornella ; « http_200_puis_200 », 36 passages) : jusqu'à la 0.6.134, seule
  la forme `{file:{label}}` était acceptée — lue dans le code du site, jamais vue en réponse réelle ; `r.json()` sur un
  PDF rendait null, les deux routes répondaient 200 et rien n'était gardé.
- **Un échec dit la forme vue** : le motif garde son début (`http_<pdf_label>_puis_<digital_label>`) et ajoute
  « · route:http forme » (`fichier No`, `json{clés}`, `html`, type, taille, `redirige`) — jamais une valeur (ni nom, ni
  code, ni adresse) ; 120 caractères au plus. Les deux routes une fois chacune, comme avant.
- **Poste non empaqueté (Nico)** : une copie neuve posée dans son dossier (`C:\Users\nicol\FillSell-Extension-Nico`,
  version du manifest différente) recharge l'extension seule au premier moment sûr (0.6.134,
  `verifierCopieNonEmpaquetee` ; même chemin que la mise à jour du Web Store) ; trace `usage_logs` `maj_extension`
  « rechargement:copie_non_empaquetee ». Copier le manifest EN DERNIER. Prouvé le 24/10 : copie à 16:52:27, rechargé à
  16:55:18 (0.6.134 → 0.6.135, 0 job en vol).
- Preuves : `selftest:bordereau-fichier-octets` (PDF brut, ancienne forme JSON, lien même adresse / CDN / tiers, échec
  tracé sans valeur, dernière marche fermée) ; faux réseaux réalistes dans `selftest:messagerie` et
  `selftest:messagerie-generation`.

## Règles (24/10 nuit — décisions 1 et 2 de Nico ; rapport `docs/enquetes/lot-2410-nuit/RAPPORT.md`)
- **Bordereau automatique dès la vente : VINTED SEULEMENT** (migration 20261024235000, appliquée le 24/10 à 19:42:22) :
  une commande Vinted vue APRÈS `coin_config.bordereaux_auto_depuis` (jamais l'arriéré) reçoit UNE demande — « générer »
  (étiquette à commander) ou « récupérer » (prête) —, au format du compte (`platform_settings.bordereaux.format`, pdf par
  défaut ; « code » → QR). Jamais après une demande du vendeur ni un échec (le bouton reste, motif réel) ; jamais avec une
  copie vivante ; 20 par jour ; double vente de la même fiche → rien d'automatique (« deux_commandes_meme_fiche ») ;
  vente annulée → la copie est close. Interrupteur : `coin_config.bordereaux_auto`.
- **Un état de commande connu n'est jamais effacé par « inconnu »** (migration 20261024233000, 19:41:10).
- **Vente annulée : JAMAIS de remise en vente automatique** (migration 20261024234000, écrite, feu vert attendu) : fiche
  au stock ; carte « Vente annulée — Remettre en vente ? », un bouton ; l'appui remet en vente sur Vinted et partout où
  l'article avait été retiré à cause de cette vente, hors quota ; un relevé fait APRÈS l'appui passe avant : annonce
  remise en ligne par le vendeur → rattachée, rien de republié.
- **Bordereaux VINTED ouverts à TOUS les comptes** (migration 20261024235500, écrite, feu vert attendu) :
  `bordereaux_ouverts_pour(compte, plateforme)` est LE seul endroit qui le dit (Vinted : `coin_config.bordereaux_vinted_tous`
  = 1, sinon la bêta ; toute autre plateforme : fermée pour tous). Hors bêta, le poste (extension 0.6.140) relève les
  COMMANDES Vinted seules — jamais les messages (le serveur répond « commandes_seules ») — et prend les demandes Vinted.
  L'écran « À expédier » existe pour un compte hors bêta dès que son poste a la 0.6.140 (`messagerie_compteurs`
  « bordereaux_vinted ») ; la messagerie reste à la bêta.
- **Leboncoin, Beebs, Depop, eBay : « Bientôt disponible »** pour tous les comptes, bêta comprise : un message court
  (« Bordereau X depuis FillSell : bientôt disponible. »), jamais un bouton ; la base répond « bientot » à toute demande
  hors Vinted. Jamais une étiquette payante.
- Preuves : `selftest:messagerie-app` (règle « bientot », barre et espace hors bêta), `selftest:lot-2410-soir` § 6,
  `selftest:vente-annulee-carte` ; essais à blanc 20261024234000 (10/10) et 20261024235500 (19/19).

## Règles (24/10 nuit, clôture — décisions de Nico ; rapport `docs/enquetes/lot-2410-nuit/RAPPORT.md` § « Clôture »)
- **Bordereaux : paliers Pro et Business SEULEMENT, jamais Free ni Premium — bêta comprise** (migration 20261024235500,
  appliquée le 24/10 à 22:02:55). `bordereaux_ouverts_pour` vérifie le palier (`palier_de`) ; l'automatique rend
  « palier » ; les compteurs ne donnent « bordereaux_vinted » et la génération qu'à un compte Pro/Business. App : aucun
  bouton, aucune mention, aucun réglage de bordereau sans ce droit (fail-closed tant qu'il n'est pas lu) ; jamais dans
  les modales (paywall, comparatif des paliers, upsell). Un bordereau déjà généré n'est jamais effacé par la règle.
- **Une commande Vinted vue ANNULÉE par le relevé des commandes retire sa vente tout de suite** (20261024235700, 22:01:33)
  : vente_commande_annulee_vinted (fiche au stock, retraits arrêtés, remise en vente PROPOSÉE), la vente reconnue par son
  numéro de commande ou les lignes d'une commande éclatée, jamais le titre ; idempotent. Avant : jusqu'à 20 h (lecture
  quotidienne des ventes).
- **Messagerie : une conversation ouverte (30 s) et la liste (60 s) se relisent seules**, bornées (15 min, onglet
  visible, utils/relectureBornee.js) : un message reçu apparaît sans rouvrir l'écran. Le relevé du poste reste à
  10 min ± 90 s.


## 25/10 — bordereaux des comptes Pro/Business hors bêta : la copie du PDF est refusée (`copie_http_400`)
- Observé : les bordereaux sont ouverts aux Pro/Business depuis le 24/10 (`bordereaux_ouverts_pour`), mais la politique de
  stockage `bordereaux_insert` n'accepte que la bêta messagerie (`messagerie_beta`) — Jocabroc : 7 demandes, toutes
  `copie_http_400` (24-25/10) ; 26 échecs sur 5 comptes depuis le 25/10 00:27. Correctif écrit, NON appliqué :
  `supabase/migrations/PROPOSITION_20261025_bordereaux_copie_pro_business.sql.txt` (`messagerie_beta(auth.uid()) OR
  bordereaux_ouverts_pour(auth.uid(), 'vinted')`) — feu vert nommé de Nico.
