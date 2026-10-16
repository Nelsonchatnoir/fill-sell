# Chantier « Messages + bordereaux » (+ étude des offres aux favoris) — 16/10/2026

> Pour Nico. Court d'abord, détail ensuite. Tout ce qui est écrit « prouvé » a été lu sur TES comptes,
> en lecture seule, le 16/10 entre 14:10 et 15:15 (heure de Paris). Aucun message, aucune offre, aucun
> bordereau, aucune commande touchés. Aucun nom, adresse ou texte de message recopié ici.

## 0. L'essentiel

1. **Lire les messages marche sur 4 plateformes sur 5** : Vinted, Leboncoin, Depop par l'extension (prouvé
   sur tes comptes, avec le code livré), **eBay par l'API avec l'accès que tu as déjà donné** (prouvé :
   10 messages lisibles, aucun nouveau consentement). **Beebs non** : sa messagerie web exige un numéro de
   téléphone vérifié, ton compte ne l'est pas (je n'ai rien saisi).
2. **Lire ne marque jamais « lu »** chez la plateforme : chaque site le fait par un appel à part, que
   FillSell n'appelle jamais (prouvé sur Depop : 1 non lu avant, 1 après ; Vinted : 7 non lus avant et
   après mes lectures).
3. **Répondre depuis l'app est codé et VERROUILLÉ** : la réponse s'enregistre, mais ne part que vers une
   conversation de la **liste blanche** (vide). L'app le dit à l'écran. Tu y mettras la conversation avec
   Ornella (§ 6).
4. **Bordereaux** : le chemin est codé jusqu'à la dernière marche (Vinted, Leboncoin), **jamais appelé**.
   Il reste à le voir sur UNE vraie commande (§ 3, 5 minutes). **eBay : non** — pas d'étiquette par
   l'API en France (prouvé : « Access denied » sur ton compte). **Beebs : non pour l'instant** (0 vente,
   téléphone requis, et générer le bordereau = accepter la commande et débiter l'acheteur).
5. **Deux découvertes utiles** : le détail d'une vente Leboncoin donne le **numéro exact de l'annonce**
   (rattachement certain, plus de titre + prix) et toute la **machine d'états** de la vente ; et chez
   Leboncoin **une mise en favori arrive comme une conversation** (preuve pour les offres aux favoris).
6. **Ce qui attend ton feu vert** : la migration `20261016170000` (7 tables neuves, rien de destructif,
   § 7). Sans elle, tout le code est en place mais n'écrit rien. Puis j'active le drapeau sur ton seul
   compte.
7. **Offres aux favoris** : faisable proprement sur **eBay** (natif, anonyme, déjà consenti) ; **une par
   une, validée** sur Leboncoin et Depop ; **pas sur Vinted** (préférer « baisser le prix », qui prévient
   tous les favoris sans message) ; pas sur Beebs (app mobile seulement). Recommandation § 5.

## 1. Plateforme × fonction

✅ faisable et fait · 🟡 faisable, à valider en direct · ❌ impossible (aujourd'hui)

| | Messages (lire) | Répondre | Commandes « à expédier » | Bordereau | Offres aux favoris |
|---|---|---|---|---|---|
| **Vinted** | ✅ liste, détail, offres reçues, article lié (numéro exact) | 🟡 codé, verrouillé (forme lue dans le code du site) | ✅ lu (0 en cours chez toi ; 220 ventes passées lues) | 🟡 chemin codé jusqu'au fichier PDF / QR | 🟡 une par une seulement — **déconseillé** |
| **Leboncoin** | ✅ liste, messages, offres (montant), mises en favori | 🟡 codé, verrouillé | ✅ lu + machine d'états (0 en cours ; 10 ventes passées) | 🟡 chemin codé jusqu'au fichier | 🟡 une par une, natif, aux favoris qui ont choisi de prévenir |
| **Depop** | ✅ liste, messages (1 conversation chez toi : Depop lui-même) | 🟡 codé, verrouillé | — (vendu = déjà relevé) | ❌ écarté (pas de bordereau en France) | 🟡 natif (« Send offer » aux « likes »), appel à relever |
| **eBay** | ✅ par l'API, accès déjà consenti (10 messages, 2 questions sur 30 j) | 🟡 codé (réponse à une question), verrouillé | ✅ par l'API (0 à expédier) | ❌ pas d'API d'étiquette en France | ✅ natif par l'API, anonyme, déjà consenti |
| **Beebs** | ❌ tant que le téléphone n'est pas vérifié sur le site | 🟡 appel connu (`POST /chats/v3`), non branché | ❌ 0 vente, page rendue côté serveur | ❌ générer = accepter la commande | ❌ offre groupée dans l'app mobile seulement |

Raisons détaillées et preuves : annexe A.

## 2. Le contrat de données (pour les maquettes)

Ce qu'on a **vraiment**, et rien d'autre. « réel » = vu sur tes comptes ; « code » = lu dans le code du site.

**Conversation** (`messagerie_conversations`) — une par fil, toutes plateformes :
plateforme · numéro du fil · **pseudo** de l'interlocuteur (jamais nom ni adresse) · article lié (numéro
d'annonce, titre, photo de l'annonce) · **article de ton stock** quand le numéro le désigne (fiche Vinted,
annonce relevée prouvée, ou ton dépôt FillSell — jamais le titre) · ton côté (vendeur / acheteur) ·
date et extrait (140 car.) du dernier message · **nombre de non-lus** (Vinted : lu / non lu seulement ;
Leboncoin, Depop, eBay : un nombre) · réponse possible ou non · dernière offre (montant, devise, statut) ·
conversation « système » (message de la plateforme elle-même : Vinted Team, Depop, eBay, Leboncoin).

**Message** (`messagerie_messages`) : sens (reçu / envoyé / plateforme) · type (texte, offre, statut,
**favori**, système) · texte (affichage seul, 4 000 car. max) · offre (montant, devise, statut) · date.
- Vinted : texte, offre (`offer_request_message`, `offer_message`), statuts de la vente.
- Leboncoin : question type de l'acheteur, texte libre, **mise en favori** (`FAVOURITE_AD`), relances,
  offre reçue (montant lu dans le texte), étapes de l'achat.
- Depop : texte. eBay : texte (sorti du gabarit HTML d'eBay), messages d'eBay = système.

**Commande** (`plateforme_commandes`) : plateforme · **numéro de commande** · état (à confirmer · à
expédier · expédiée · livrée · terminée · annulée · retour · incident) + état brut · bordereau (à générer
sur la plateforme · à récupérer · prêt · indisponible) · **pseudo de l'acheteur** · titre, photo, montant ·
numéro d'annonce et article du stock · transporteur (Leboncoin : `shop2shop`… ; eBay : service choisi) ·
identifiant du colis chez la plateforme (jamais le fichier) · date de vente · date limite d'envoi (eBay
seulement : Vinted et Leboncoin ne la donnent pas dans ce qu'on lit — à confirmer en direct).

**Bordereau** (`bordereaux_copies` + dossier privé) : la copie du PDF, **5 jours au plus** (bloqué en
base), effacée automatiquement. Le fichier porte le nom et l'adresse de l'acheteur : il n'est jamais lu
par FillSell, seulement gardé pour l'afficher sur ton téléphone.

États relevés (pour les écrans) :
- Vinted, statut d'envoi (code du site) : 1-150 bordereau à récupérer · 200 en préparation · 210 échec
  · **220/230/250 bordereau prêt** · 300/310 expédié · 350 perdu · 400 livré · 500 annulé · 600+ retour.
- Leboncoin, machine d'états (vente réelle) : `created` → `reserved` (payée, **disponibilité à
  confirmer**) → `available` (+ `parcel-label-generated` = **bordereau prêt**) → `sent` → `received` →
  `money-unblocked` → `finished` ; annulations : `admin-cancelled`, `seller-cancelled`,
  `seller-shipment-expired`.
- eBay : `NOT_STARTED` / `IN_PROGRESS` = à expédier, `FULFILLED` = expédiée, `CANCELED` = annulée.

## 3. À vérifier en direct à la première vraie commande (5 minutes)

Toi : tu fais les gestes qui engagent (confirmer, générer, expédier). Moi : je lis seulement, avant et
après chaque geste.

**Vinted** (une vente « en cours »)
1. Elle apparaît dans « À expédier » (état, pseudo, numéro, photo) — 10 min au plus après la vente.
2. Statut d'envoi lu : prêt (220/230/250) **tout de suite**, ou « à récupérer » (1-150) ?
3. Si « à récupérer » : le bouton « Obtenir le bordereau » de Vinted demande-t-il un choix (point
   relais, date d'enlèvement, papier ou QR) ? C'est le geste qui engage — **toi** sur Vinted.
4. Une fois prêt : j'ouvre la dernière marche **une fois** (`pdf_label` ou `digital_label`), je vérifie
   le fichier, sa copie 5 jours, et qu'il s'affiche sur le téléphone. (Vinted compte cette ouverture.)
5. Après dépôt : passe-t-elle « Expédiée » au relevé suivant ?

**Leboncoin** (une vente avec paiement sécurisé, Mondial Relay de préférence)
1. Elle apparaît en « Disponibilité à confirmer » (état `reserved`).
2. **Toi** : « Confirmer la disponibilité » sur Leboncoin. Puis : `available` + `parcel-label-generated` ?
3. J'ouvre la dernière marche (`prepare-parcel` → `label_url` → fichier) **une fois** ; QR Mondial
   Relay : par e-mail seulement, ou aussi dans `prepare-parcel` ?
4. Le fichier répond-il encore après l'envoi, et jusqu'à quand (il est en 404 après la vente terminée) ?

**eBay** : la commande apparaît (pseudo, date limite d'envoi, service choisi) ; le bordereau s'achète dans
eBay (rien à valider côté FillSell).

**Messages** : un message d'Ornella sur Vinted ou Leboncoin apparaît dans « Messages » (10 min max) ; tu
mets la conversation dans la liste blanche (§ 6) ; ta réponse part, et apparaît chez Ornella **une seule
fois**.

**Risque anti-robot, fonction par fonction**

| Fonction | Requêtes | Risque | Pourquoi |
|---|---|---|---|
| Lire la liste des conversations | 1 par plateforme / 10 min ± 90 s | **R0-R1** | la page fait la même lecture (Vinted la relit à chaque ouverture de la messagerie) |
| Lire le détail (nouvelles ou changées) | 5 au plus par passage, 1,2-2,8 s d'écart | R1 | ce que fait la page quand on ouvre une conversation |
| Lire les commandes en cours | 1 + 5 détails au plus / 10 min | R0-R1 | la « veille des commandes » existante lit déjà la même liste |
| eBay (API) | 2 lectures + 10 textes max / 20 min | **R0** | API officielle, quotas eBay |
| Répondre | 1 réponse au plus par passage, 60 s d'écart, 20 par jour | R2 si en série | un message envoyé depuis un outil externe ; **jamais en série, jamais automatique** |
| Ouvrir le bordereau | au clic seulement | R1 | Vinted compte l'ouverture (souhaitable : sans elle, annulation à J+5) |
| Générer un bordereau | **jamais par FillSell** | — | Vinted « commander l'étiquette », Leboncoin « confirmer la disponibilité », Beebs « accepter la commande » : gestes du vendeur |

Au premier 403, 429, captcha ou page DataDome : **arrêt immédiat**, pause de 6 h (24 h si ça recommence
dans la journée), en base ET sur le poste. La pause anti-robot Vinted existante et la pause d'une
plateforme coupent aussi la relève.

## 4. Conservation et politique de confidentialité

**Durées proposées (et posées dans la migration)** :
- messages, conversations, réponses écrites : **30 jours** après le dernier message (purge chaque nuit) ;
- commandes : 30 jours après leur dernier changement une fois livrées / terminées / annulées ;
- copie d'un bordereau : **5 jours au plus** (contrainte en base, purge toutes les heures) ;
- rien de plus vieux que 30 jours n'entre jamais (même au premier relevé).

**À ajouter avant d'ouvrir au parc** (rien n'est changé aujourd'hui : bêta sur ton seul compte) :
1. `src/pages/Legal.jsx` § 8 (extension) : l'extension **lit la messagerie et les commandes** des
   plateformes connectées, pour les afficher dans FillSell ; liste des données (pseudo, numéro de
   commande, texte des messages, copie du bordereau) ; durées ci-dessus ; aucune IA, aucune revente ;
   réponse envoyée **seulement sur action de l'utilisateur**.
2. § 8.2 (« ne collecte aucune donnée personnelle supplémentaire ») et la règle écrite « aucune donnée
   d'acheteur » (`background.js`, `ebay-ventes-sync`) : à réécrire (pseudo et numéro de commande oui,
   adresse jamais).
3. **§ 8.5 eBay** (« Aucun autre accès (messagerie…) n'est demandé ») : vrai pour le consentement (aucun
   droit ajouté), mais FillSell **lirait** la messagerie eBay avec l'accès existant → il faut le dire.
4. Fiche Chrome Web Store, « pratiques de confidentialité » : cocher **« communications personnelles »**
   (messagerie) et « données de l'utilisateur » (commandes).
5. Les acheteurs et interlocuteurs sont des **tiers** : base légale (intérêt légitime du vendeur à gérer
   ses ventes), minimisation (pseudo), durée, droit d'effacement (supprimer ses données = supprimer ces
   tables pour son compte).

## 5. Offres aux favoris — étude (aucun code)

**Pourquoi on avait abandonné le 24/09** (d'après l'audit) : le risque est dans l'**envoi**, pas dans la
lecture ; les conditions de Vinted interdisent les outils externes « pour promouvoir des articles » et
les messages « à 5 utilisateurs ou plus », Leboncoin bloque la messagerie pour messages répétitifs, la
licence eBay interdit les messages non sollicités ; une vague de restrictions Vinted « activité
automatisée » tourne depuis juillet ; savoir **qui** a mis en favori n'existait vraiment qu'à Opla
(quittée) et Beebs (dans l'app) ; et la règle « aucune donnée d'acheteur » l'empêchait.

| Plateforme | Faisable ? | Comment | Volume sans risque | |
|---|---|---|---|---|
| **eBay** | ✅ | « Offre aux acheteurs intéressés » par l'API (déjà consentie, EBAY_FR accepté) : eBay choisit les destinataires (ceux qui suivent l'objet ou l'ont dans le panier), anonymes, remise ≥ 5 %, valable 2 jours | 1 offre par annonce tant qu'elle court ; eBay plafonne lui-même | **le plus sûr** |
| **Leboncoin** | 🟡 | Les favoris qui ont choisi de prévenir **ouvrent une conversation** (`FAVOURITE_AD`, prouvé aujourd'hui) ; l'offre native du vendeur part dans cette conversation, à **une** personne, valable 48 h | ≤ 10 par jour et par compte, ≥ 3 min d'écart, **jamais deux fois le même texte** | validée une par une |
| **Depop** | 🟡 | « Send offer » natif aux personnes qui ont aimé l'article ou l'ont dans leur panier (web depuis janvier 2024 selon Depop), 24 h ; l'appel exact reste à relever | même prudence que Leboncoin | à relever |
| **Vinted** | ❌ (déconseillé) | Qui : **seulement** par la notification « X a mis ton article en favori » (prouvé aujourd'hui : elle porte la personne, l'article et un lien vers une conversation), gardée 7 jours ; puis une offre **une par une** dans une conversation. **Aucune offre groupée.** | ≤ 4 personnes par annonce et par jour (sous le seuil « 5 » des conditions) — et même ainsi, c'est l'usage que la vague de restrictions vise | **préférer « baisser le prix »** : Vinted prévient tous les favoris, sans message, natif |
| **Beebs** | ❌ | L'offre groupée aux favoris existe **dans l'app mobile** seulement ; rien dans le site web ; messagerie web derrière un téléphone vérifié | — | — |

**Recommandation** : (1) sortir d'abord l'**offre eBay aux intéressés**, côté serveur, sur ton clic,
journalisée — sans extension, sans nouveau consentement ; (2) ensuite Leboncoin et Depop, **une personne
à la fois, validée par toi**, plafonds tenus en base (10/jour, 3 min, textes différents) ; (3) sur Vinted,
un bouton « **Baisser le prix** » (qui prévient tous les favoris) plutôt que des offres ; (4) jamais
d'envoi en série ni automatique.

## 6. Comment mettre Ornella dans la liste blanche (à ton retour)

La liste blanche ne s'écrit **jamais** depuis l'app. Après le feu vert de la migration et un premier
relevé, je te donne la ligne exacte (une conversation = plateforme + numéro du fil), ou tu me dis
« mets la conversation avec Ornella sur <plateforme> ». Une ligne SQL, et la retirer = une ligne.

## 7. Ce qui est livré, ce qui attend

**Livré (code, commit unique, push) — inerte sans le drapeau**
- Extension **0.6.116** (non empaquetée, **pas de zip**) : `chrome-extension/messagerie.js` (lecteurs,
  normaliseurs, envoyeurs verrouillés, chemin du bordereau) + relève dans `background.js`, juste après
  la veille des commandes, avec sa cadence (10 min ± 90 s) — c'est l'ordonnanceur existant.
- Serveur : `ebay-messagerie` **v1 déployée** (`verify_jwt = false`, garde maison à deux branches :
  secret du vault OU session bêta) ; `bordereaux-purge` (même garde, secret seulement).
- App (web, au push ; **pas d'OTA**) : barre « Messages · À expédier » (compte bêta seulement),
  liste toutes plateformes + conversation + réponse verrouillée, section « À expédier » dans Ventes
  (bouton « Bordereau » **inactif**), indicateur de messages sur la carte de l'article. Pour le parc :
  une lecture au chargement, puis plus rien ; carte identique.
- Selftests : `selftest:messagerie` (26 cas), `selftest:messagerie-app` (11 cas) ; suite complète : § 8.

**Attend ton feu vert nommé** — migration **`20261016170000_messagerie_bordereaux_beta.sql`**
(inverse : `supabase/rollbacks/20261016170000_messagerie_bordereaux_beta.sql`) :
7 tables neuves (RLS : chacun lit ses lignes, **aucune** écriture directe), 14 fonctions (toutes fermées
sans le drapeau ; `REVOKE anon` nommé), bucket privé `bordereaux` (5 Mo max), 3 crons (purge des
messages 1×/jour ; purge des bordereaux 1×/heure **seulement s'il y a une copie expirée** ; relevé eBay
toutes les 20 min **seulement s'il existe un compte bêta relié à eBay**). **Essai à blanc fait** (36
vérifications, transaction annulée, prod relue inchangée). Rien d'existant n'est modifié.
Sur feu vert : `npx supabase db query --linked -f supabase/migrations/20261016170000_messagerie_bordereaux_beta.sql`
puis `npx supabase migration repair --linked --status applied 20261016170000`, puis le drapeau sur ton
compte (`scripts/reparations/20261016_drapeau_messagerie_nico.sql`, sauvegarde + inverse).

**Attend ton geste** : recharger l'extension (0.6.116 copiée dans `C:\Users\nicol\FillSell-Extension-Nico`,
l'ancienne 0.6.110 gardée dans `build/anciennes-extensions-nico/`) — voir § 8.

## 8. Garde-fous tenus, effets de bord constatés, suite

- Aucun message, aucune offre, aucun bordereau, aucune commande touchés ; aucune connexion à un compte ;
  aucune bannière acceptée ; rien saisi dans la fenêtre « Numéro de téléphone » de Beebs (fermée par
  Échap) ; aucune IA sur un message ; aucun contenu dans un journal.
- **Effet de bord** : en ouvrant la page « Messages » de Vinted, le site a affiché tout seul la
  conversation la plus récente (comme quand tu ouvres ta messagerie) : elle a pu être marquée lue. Même
  chose chez Leboncoin, sur un message de Leboncoin lui-même (« Place à l'automne »). L'extension, elle,
  n'ouvre jamais ces pages : elle lit l'API depuis la page d'accueil.
- eBay : ton jeton a été relu (et renouvelé s'il expirait) par la fonction serveur, jamais affiché.
- Suite complète des selftests et build : voir l'état final dans `docs/agents/etat-2026-10-01.md`
  (§ 16/10 soir).

## Annexe A — Appels relevés (méthode · preuve · engage ?)

**Vinted** (`/api/v2/…` de la page) — `inbox?page&per_page` GET réel · `conversations/<id>` GET réel
(messages, transaction : `item_id`, `item_ids`, `current_user_side`, `shipment_status`) ·
`conversations/<id>/replies` POST code (**engage**) · `conversations/<id>/mark_as_read` PUT code (jamais
appelé) · `conversations/stats` (non-lus) code · `my_orders?type=sold&status=in_progress|all` GET réel ·
`transactions/<id>` GET réel (`buyer.login`, `shipment.status`, `order.user_msg_thread_id` = le fil) ·
`shipments/<id>/label_options` GET code · `transactions/<id>/shipment/order` PUT code (**engage** :
dépôt, enlèvement, papier/QR) · `transactions/<id>/shipment/pdf_label` · `digital_label` ·
`shipments/<id>/label_url` GET code (Vinted compte l'ouverture) · `transactions/<id>/offers` POST code
(**engage**) · `inbox-notifications/v1/notifications` GET réel (type 20 = favori : personne + article +
lien vers une conversation ; 7 jours). Une nouvelle messagerie (`/messaging/main/…`, fils en UUID) existe
dans le code : à surveiller (la lecture actuelle répond 200).

**Leboncoin** (`api.leboncoin.fr`, jeton de la page) — `messaging-items-api/v3/conversations[?page_hash]`
GET réel (50 par page) · `messaging/proxy/api/v1/hal/<moi>/conversations/<id>/messages?expanded=true`
GET réel · même chemin en POST `{clientMessageId, text, attachments}` code (**engage**) ·
`…/messages/<id>/read` PUT code (jamais appelé) · `…/hal/<moi>/counter` (non-lus) réel ·
`consumergoods/proxy/v3/pages/transactions` GET réel · `consumergoods/purchase/v2/purchases/<id>` GET
réel (**numéro d'annonce**, machine d'états, `parcelID`, `parcelShippingType`) ·
`consumergoods/proxy/v1/purchases/<id>/validate-availability` POST code (**engage** : naissance du
bordereau) · `pages/prepare-parcel/<id>` GET (réel sur vente terminée, audit) · `label_url` GET (404
après la vente) · `purchases/<id>/confirm-shipment` POST code (**engage**) ·
`buyer-interest-api/v1/interested-items` code (côté acheteur).

**Depop** (`webapi.depop.com/presentation/api/v1`, jeton du cookie en Bearer) — `conversations/?limit`
GET réel · `conversations/<id>/messages/` GET réel (lecture ≠ lu, prouvé) ·
`conversations/messages/` POST `{user_id, text, product_id, idempotency_key}` code (**engage**) ·
`conversations/mark-read/` code (jamais appelé) · `offers/`, `offers/me/active` GET réel (0).

**eBay** (API, compte relié) — Trading `GetMyMessages` 200 (10 messages, 10 non lus) · `GetMemberMessages`
200 (2 échanges sur 30 j) · `AddMemberMessageRTQ` (**engage**, codé, verrouillé) ·
`commerce/message/v1/conversation` **403 « Access denied »** (exige `commerce.message`, non demandé) ·
`sell/logistics/v1_beta/shipment` **403 « Access denied »** (étiquettes : non) ·
`sell/fulfillment/v1/order` (NOT_STARTED|IN_PROGRESS) 200, 0 commande. Droits du jeton : `api_scope`,
`sell.account`, `sell.inventory`, `sell.fulfillment`, `commerce.notification.subscription`.

**Beebs** — `/chats/v3` POST `{to_user_id, text, attachment}` code (**engage**) ·
`/chats/v3/users/unread-chat-count` code · `/account/chats` → redirige vers
`/account/phone-verification` (réel) · bordereau : « Vérifier votre numéro de téléphone pour télécharger
le bordereau » (code) ; générer = accepter la commande (aide Beebs, audit du 24/09).

Sources hors comptes : aide Depop / annonce « Send Offer » (janvier 2024) ; fil communautaire eBay sur
GetMyMessages avec le scope de base ; audit du 24/09 (`docs/AUDIT_BORDEREAUX_FAVORIS_2026-09-24.md`).
