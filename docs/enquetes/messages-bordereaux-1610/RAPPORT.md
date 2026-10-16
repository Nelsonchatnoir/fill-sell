# Chantier « Messages + bordereaux » (+ étude des offres aux favoris) — 16/10/2026

> Pour Nico. Court d'abord, détail ensuite. Tout ce qui est écrit « prouvé » a été lu sur TES comptes,
> en lecture seule, le 16/10 entre 14:10 et 15:15 (heure de Paris). Aucun message, aucune offre, aucun
> bordereau, aucune commande touchés. Aucun nom, adresse ou texte de message recopié ici.
>
> **⟶ CLÔTURE DU 16/10 AU SOIR : § 9** (ce qui est fait par plateforme, ce qui ne marche pas et
> pourquoi, ce qui reste à prouver au vrai achat, protocole de test de bout en bout, liste blanche).
>
> **⟶ 16/10 NUIT, UTILISABLE POUR DE VRAI (Nico + Ornella) : § 10** (réponses sans liste blanche, bordereaux
> générés depuis FillSell, 10 × 15 et impression, protocole de test entre vous deux, C1 / C2 / C3, feux verts).

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
6. **Fait après ton feu vert (16/10 vers 15:25)** : migration `20261016170000` appliquée, drapeau actif sur
   ton seul compte. **Les 4 plateformes sont relevées en réel, de bout en bout** : eBay par le serveur (cron
   20 min), Vinted, Leboncoin et Depop par ton extension, que Chrome a prise **tout seul** (pas besoin de
   « Recharger » : ta copie se recharge d'elle-même au premier moment sûr depuis le 03/10). En base à
   16:30 : Vinted 16 conversations / 35 messages, Leboncoin 4 / 5, eBay 2 / 4, Depop 1 / 1 ; non-lus des
   plateformes **inchangés** après nos lectures (Vinted 7, Leboncoin 6 fils / 8 messages, Depop 1). Les
   **compteurs FillSell = ceux des plateformes** sur 30 jours (Vinted 4 = 4, Leboncoin 3 = 3) ; les autres
   non-lus ont plus de 30 jours et n'entrent pas (conservation).
7. **Un défaut trouvé sur tes vraies données, corrigé (extension 0.6.118, prise seule par Chrome à 16:44)** :
   sur une vente Vinted passée, Vinted ne remplit plus `item_id` (le numéro n'est plus que dans `item_ids`) →
   8 conversations sur 16 n'avaient pas d'article. Corrigé ; ces fils sont relus une fois, 5 par passage.
8. **Offres aux favoris** : faisable proprement sur **eBay** (natif, anonyme, déjà consenti) ; **une par
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

La liste blanche ne s'écrit **jamais** depuis l'app. Procédure exacte (une requête par conversation, et son
inverse) : **§ 9.4**.

## 7. Ce qui est livré, ce qui attend

**Livré (code + docs) — inerte sans le drapeau**
- Extension **0.6.116 → 0.6.117 → 0.6.118** (non empaquetées, **pas de zip** ; le zip à téléverser reste la
  0.6.115) : `chrome-extension/messagerie.js` (lecteurs, normaliseurs, envoyeurs verrouillés, chemin du
  bordereau) + relève dans `background.js`, juste après la veille des commandes, avec sa cadence (10 min ±
  90 s) — c'est l'ordonnanceur existant. 0.6.117 : un passage qui n'a rien pu lire note son motif en base ;
  lectures Depop reprises sur erreur réseau (la 0.6.116 n'écrivait rien pour Depop, sans dire pourquoi).
  0.6.118 : annonce Vinted lue aussi dans `item_ids` ; fils déjà lus relus une fois.
- Serveur : `ebay-messagerie` **v3** (`verify_jwt = false`, garde maison à deux branches : secret du vault
  OU session bêta) ; `bordereaux-purge` **v1** (même garde, secret seulement).
- App (web, au push ; **pas d'OTA**) : barre « Messages · À expédier » (compte bêta seulement),
  liste toutes plateformes + conversation + réponse verrouillée, section « À expédier » dans Ventes
  (bouton « Bordereau » **inactif**), indicateur de messages sur la carte de l'article. Pour le parc :
  une lecture au chargement, puis plus rien ; carte identique.
- Selftests : `selftest:messagerie` (30 cas), `selftest:messagerie-app` (12 cas) ; suite complète : § 8.

**APPLIQUÉE (« Feu vert sur 20261016170000 », 16/10 vers 15:25)** — migration
**`20261016170000_messagerie_bordereaux_beta.sql`** (inverse : `supabase/rollbacks/20261016170000_messagerie_bordereaux_beta.sql`) :
7 tables neuves (RLS : chacun lit ses lignes, **aucune** écriture directe), 14 fonctions (toutes fermées
sans le drapeau ; `REVOKE anon` nommé), bucket privé `bordereaux` (5 Mo max), 3 crons (purge des
messages 1×/jour ; purge des bordereaux 1×/heure **seulement s'il y a une copie expirée** ; relevé eBay
toutes les 20 min **seulement s'il existe un compte bêta relié à eBay**). **Essai à blanc fait** (36
vérifications, transaction annulée, prod relue inchangée). Rien d'existant n'est modifié.
Appliquée par `db query` puis `migration repair`, prod relue (7 tables, RLS, 14 fonctions, aucune ouverte à
anon, 3 crons, bucket privé). Drapeau posé sur ton seul compte
(`scripts/reparations/20261016_drapeau_messagerie_nico.sql`, sauvegarde + inverse). `bordereaux-purge` v1
déployée. CPU pendant les relevés eBay : 12 à 29 % (rien d'anormal).

**Ton extension** : les builds sont copiés dans `C:\Users\nicol\FillSell-Extension-Nico` (l'ancienne 0.6.110
gardée dans `build/anciennes-extensions-nico/`) ; ta copie se recharge seule au premier moment sûr (aucun job
en vol, aucun relevé). Aucun geste de ta part : la relève a démarré à 15:52.

## 8. Garde-fous tenus, effets de bord constatés, suite

- Aucun message, aucune offre, aucun bordereau, aucune commande touchés ; aucune connexion à un compte ;
  aucune bannière acceptée ; rien saisi dans la fenêtre « Numéro de téléphone » de Beebs (fermée par
  Échap) ; aucune IA sur un message ; aucun contenu dans un journal.
- **Effet de bord** : en ouvrant la page « Messages » de Vinted, le site a affiché tout seul la
  conversation la plus récente (comme quand tu ouvres ta messagerie) : elle a pu être marquée lue. Même
  chose chez Leboncoin, sur un message de Leboncoin lui-même (« Place à l'automne »). L'extension, elle,
  n'ouvre jamais ces pages : elle lit l'API depuis la page d'accueil.
- eBay : ton jeton a été relu (et renouvelé s'il expirait) par la fonction serveur, jamais affiché.
- **Défaut trouvé au premier relevé réel, corrigé** : le champ `Content` d'eBay n'est pas du texte mais le
  même gabarit HTML (≈ 4 000 caractères de style avant le message) ; v1 stockait le style. Corrigé (v2 :
  le texte est extrait du corps, puis coupé) ; les 4 messages fautifs effacés et relus. Puis v3 : un passage
  sans texte nouveau ne réécrit plus les conversations. Les deux cas sont dans le selftest.
- **Testé de bout en bout, en réel, sur ton compte** : la relève des 4 plateformes jusqu'à la base (chiffres
  § 0), les non-lus des plateformes inchangés après lecture, le rattachement (Leboncoin : 3 fils sur 3 qui
  portent une annonce ; Vinted : 1, puis le défaut ci-dessous ; eBay : la question porte sur une annonce
  retirée le 24/09, sans article de stock — rien à rattacher, c'est juste ; Depop : message de Depop
  lui-même). Je n'ai jamais fait passer le texte de tes messages par moi (règle « aucune IA sur les
  messages ») : vérifié par des comptes et des formes seulement.
- **Défaut trouvé au relevé réel Vinted, corrigé (0.6.118)** : 8 conversations sur 16 (ventes passées)
  arrivaient sans article : Vinted y laisse `item_id`, le titre et la photo à vide et ne garde le numéro que
  dans `item_ids` (forme lue, sans contenu, sur 2 fils). Le lecteur prend désormais ce numéro unique (un lot
  reste sans article) ; la mémoire « déjà lu » de Vinted est oubliée une fois, les fils sont relus 5 par
  passage (jamais en rafale). Preuve sur le moteur de rattachement : l'un des 2 numéros lus désigne une fiche
  de ton stock (`fiche_vinted`), l'autre aucun article FillSell. **À vérifier au prochain check** : les 8 fils
  Vinted portent leur annonce (`messagerie_conversations.annonce_ref`), ≥ 1 rattaché.
- **Verrou des réponses prouvé en prod** (transaction annulée à coup sûr, sur un de tes vrais fils Vinted) :
  la réponse s'enregistre « verrouillée — liste_blanche », la même clé renvoie la même réponse (jamais deux),
  l'exécutant n'a **rien à envoyer** ; 0 réponse en base après.
- **Pas testable aujourd'hui (et c'est voulu)** : l'envoi réel d'une réponse (liste blanche vide), la dernière
  marche du bordereau (fermée), une commande « à expédier » réelle (0 en cours chez toi), Beebs (téléphone).
- Écrans vérifiés en local à 390 px, sur données synthétiques : 23 contrôles verts
  (`scripts/apercu/capture-messagerie-beta.mjs`).
- Suite complète des selftests et build : voir l'état final dans `docs/agents/etat-2026-10-01.md`
  (§ 16/10 fin d'après-midi).

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

## 9. Clôture du chantier (16/10 au soir) — « en une seule passe »

> Mission de Nico du 16/10 au soir. Ton Chrome était connecté au compte Beebs d'Ornella (téléphone vérifié,
> avec son accord). Tout ce qui suit a été lu en LECTURE : aucun message envoyé, aucune offre, aucune commande
> confirmée ou acceptée, aucun bordereau généré, aucun réglage modifié, aucune annonce touchée. Aucun texte de
> message recopié ici, aucune IA sur un message.

### 9.0 L'essentiel

1. **Messages : les 5 plateformes.** Vinted, Leboncoin, Depop, eBay (déjà relevés) **et Beebs** : liste =
   page « Messages » rendue par le serveur, détail = flux de la page de la conversation, réponse =
   `POST api.beebs.app/chats/v3` — **verrouillée par la liste blanche comme les autres**. Prouvé sur la vraie
   page (compte d'Ornella) avec le code livré : 2 conversations lues (numéro, nom, date), détail lu
   (interlocuteur, 2 messages bien formés), page des ventes lue ; et ta propre extension (0.6.119, prise seule
   par Chrome à 20:29) a fait sa relève Beebs à **20:29:33 sans échec**. Rien n'est entré en base : les 2
   conversations d'Ornella ont plus de 30 jours (règle de conservation).
2. **« À expédier » : toutes les commandes en cours des 5 plateformes** (Vinted, Leboncoin, Beebs, Depop par
   l'extension ; eBay par le serveur), avec état, pseudo, numéro, photo, montant, article de ton stock (par
   numéro), transporteur en clair, date limite quand la plateforme la donne (eBay, Beebs, Depop).
3. **Bordereau au clic, Vinted et Leboncoin, opérationnel jusqu'au bout** : ton clic sur « Bordereau » dépose
   une demande → ton ordinateur ouvre la dernière marche UNE fois → copie gardée 5 jours → ouverte sur ton
   téléphone (adresse signée). Migration **20261016200000** appliquée sur ton feu vert (essai à blanc 15/15).
   Seul un bordereau déjà PRÊT chez la plateforme peut être demandé.
4. **Les gestes qui engagent ne sont jamais faits par FillSell** : Vinted « commander l'étiquette », Leboncoin
   « confirmer la disponibilité », Beebs « accepter la commande », eBay « acheter l'étiquette » → l'app dit
   l'état et un bouton ouvre la bonne page de la plateforme.
5. **Mur à la racine** : un compte Beebs sans téléphone vérifié est détecté sans aucune requête (le jeton de
   session ne porte pas l'identité « téléphone ») → l'app dit « **Vérifie ton numéro sur Beebs** » au lieu
   d'une messagerie vide. Même principe : session absente (« Connecte-toi à … dans Chrome »), Depop non
   autorisé, eBay à reconnecter, pause de sécurité. Un 401 Vinted seul n'est pas un mur (jeton d'une heure,
   renouvelé — et désormais renouvelé par nous aussi, 0.6.120).
6. **Ton stock n'a rien reçu d'Ornella** : aucun relevé Beebs, aucune annonce relevée, aucune fiche créée,
   aucun job créé sur ton compte pendant la session (requêtes du soir). **0 job Beebs en file, en cours ou à
   faire** sur ton compte au début (18:58) et à la fin. **Liste blanche vide.**
7. **Il ne reste que le test de bout en bout avec un vrai achat** (§ 9.5).

### 9.1 Par plateforme

✅ fait et prouvé · 🟢 fait, à prouver au vrai achat · 🟡 écrit d'après le code du site (aucune vente pour le voir) · ❌ impossible

| | Messages | Répondre | « À expédier » | Bordereau |
|---|---|---|---|---|
| **Vinted** | ✅ | 🟢 verrouillé ; jeton renouvelé sur 401 (0.6.120) | ✅ (commandes en cours + détail) | 🟢 au clic quand prêt (220/230/250) : `pdf_label`, sinon `digital_label` une fois ; sinon « Commander sur Vinted » (lien) |
| **Leboncoin** | ✅ | 🟢 verrouillé | ✅ (machine d'états) | 🟢 au clic quand `available` + `parcel-label-generated` ; « Confirmer sur Leboncoin » (lien) |
| **Beebs** | ✅ si téléphone vérifié (prouvé, compte d'Ornella) ; sinon mur dit | 🟢 verrouillé (`POST /chats/v3`, jeton brut) | 🟡 page « Ventes » + objet commande de sa page | ❌ pas de dernière marche qui n'engage rien : « Accepter sur Beebs » / « Télécharger sur Beebs » (liens) |
| **eBay** | ✅ (API) | 🟢 verrouillé (réponse à une question) | ✅ (API) ; une commande expédiée est relue (v4) | ❌ pas d'API d'étiquette en France : « Étiquette sur eBay » (lien) |
| **Depop** | ✅ | 🟢 verrouillé | 🟡 `receipts?role=seller` | ❌ pas de bordereau Depop en France : « Voir sur Depop » (lien) |

### 9.2 Ce qui ne marche pas, et pourquoi

- **Beebs sur TON compte** : ton numéro est rattaché au compte d'Ornella et Beebs ne laisse pas le changer
  soi-même → ton compte restera sans téléphone vérifié → messagerie et bordereaux Beebs fermés pour toi. L'app
  le dira (« Vérifie ton numéro sur Beebs »). Il faut que le support Beebs déplace ton numéro, ou un autre numéro.
- **Bordereau Beebs** : « générer le bordereau » = accepter la commande et débiter l'acheteur (geste du
  vendeur). Le téléchargement d'un bordereau déjà généré n'est pas dans le code lisible du site (page rendue par
  le serveur) et aucune vente n'existait pour l'observer → lien vers la commande sur Beebs.
- **Commandes Beebs et Depop** : aucune vente sur aucun des deux comptes → formes jamais vues. Lecteurs
  tolérants ; une forme inconnue n'écrit rien (Beebs) ou s'affiche « État à vérifier » (Depop).
- **Étiquette eBay** : Logistics API 403 hors États-Unis (prouvé le 16/10) → lien.
- **Ouvrir une conversation Beebs sur le site la marque lue** ; la lire depuis l'extension (flux RSC) : non
  prouvé dans un sens ou dans l'autre (accepté par Nico le 16/10).

### 9.3 Ce qui reste à prouver au vrai achat

- Vinted : la commande apparaît dans « À expédier » ; bordereau prêt tout de suite ou après « Commander » ;
  `pdf_label` ou code (`digital_label`) ; la copie s'ouvre sur ton téléphone ; « Expédiée » après dépôt.
- Leboncoin : « Disponibilité à confirmer » → après ta confirmation, `parcel-label-generated` → « Bordereau »
  actif → `prepare-parcel` → `label_url` → fichier.
- Beebs : l'objet commande est bien dans la page de la commande (forme lue dans le code) ; états
  WAIT_SELLER_CONFIRM → LABEL_PRINTED ; date limite = bordereau + 6 jours.
- Depop : champs des reçus (`shippingStatus`, `buyer.username`, `shippingDeadline`).
- eBay : la commande apparaît avec la date limite et le service choisi ; « expédiée » ensuite (relecture v4).
- Messages : le message d'Ornella arrive ; une fois la conversation en liste blanche, ta réponse part **une
  seule fois** et apparaît chez elle.

### 9.4 Liste blanche — la procédure exacte (Claude l'exécute en SQL, sur ta demande)

La liste blanche ne s'écrit **jamais** depuis l'app. Une conversation = plateforme + numéro du fil.

1. Trouver la conversation (après le premier message d'Ornella ; pseudos seulement) :
   ```sql
   SELECT platform, conversation_ref, interlocuteur_pseudo, titre_annonce,
          to_char(dernier_message_le AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI') AS dernier
     FROM public.messagerie_conversations
    WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
      AND platform = '<vinted|leboncoin|beebs|depop|ebay>'
      AND interlocuteur_pseudo ILIKE '%<pseudo d''Ornella sur cette plateforme>%'
    ORDER BY dernier_message_le DESC;
   ```
2. L'AJOUTER (une ligne par conversation, numéro exact) :
   ```sql
   INSERT INTO public.messagerie_liste_blanche (user_id, platform, conversation_ref, note)
   VALUES ('f44b5917-bccc-4431-ba41-f40571a2ed18', '<plateforme>', '<conversation_ref>', 'Test avec Ornella')
   ON CONFLICT DO NOTHING
   RETURNING platform, conversation_ref;
   ```
3. La RETIRER (l'inverse exact) :
   ```sql
   DELETE FROM public.messagerie_liste_blanche
    WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
      AND platform = '<plateforme>' AND conversation_ref = '<conversation_ref>'
   RETURNING platform, conversation_ref;
   ```
4. Vérifier qu'elle est vide à la fin : `SELECT count(*) FROM public.messagerie_liste_blanche;` → 0.

Une réponse déjà écrite pendant que la conversation était verrouillée **ne part pas** après l'ajout (elle reste
« verrouillée ») : seule une réponse écrite APRÈS l'ajout part. Une réponse en attente dont la conversation sort
de la liste blanche est reverrouillée.

### 9.5 Protocole de test de bout en bout (Ornella achète une annonce de Nico à 999 € ou plus, lui écrit, puis annule)

Pour chaque plateforme, l'annonce de test est à **999 € ou plus**, sur ton compte ; Ornella achète depuis le
sien. Ton ordinateur reste allumé, Chrome ouvert (l'extension relève à chaque passage ; eBay par le serveur).
Ce que tu dois voir dans l'app : ouvre « Messages · À expédier » (bandeau au-dessus des onglets).

**Vinted**
1. Ornella t'écrit sur l'annonce, puis l'achète.
2. Dans l'app : la conversation apparaît (« Messages »), puis la commande dans « À expédier » (pseudo, numéro,
   prix, « Dans ton stock » si l'article y est).
3. Si l'état dit « Commander sur Vinted » : tu commandes l'étiquette **sur Vinted** (bouton de l'app → page de
   la conversation). Au relevé suivant, « Bordereau » devient actif.
4. Tu appuies sur « Bordereau » sur ton téléphone → « Demande envoyée » → « Ouvrir le bordereau » : le PDF (ou
   le code) s'ouvre.
5. Liste blanche : je mets la conversation (§ 9.4), tu réponds depuis l'app → « Envoi actif » → la réponse
   arrive chez Ornella une seule fois.
6. Tu annules la vente **sur Vinted**, sans expédier ; je retire la conversation de la liste blanche.

**Leboncoin**
1. Ornella t'écrit puis achète (paiement sécurisé, Mondial Relay de préférence).
2. Dans l'app : « Disponibilité à confirmer » + bouton « Confirmer sur Leboncoin ».
3. Tu confirmes **sur Leboncoin** (c'est ce geste qui crée le bordereau). Au relevé suivant : « À expédier »,
   « Bordereau » actif.
4. « Bordereau » sur le téléphone → la copie s'ouvre.
5. Réponse via la liste blanche (comme Vinted, § 9.4).
6. Tu annules **sur Leboncoin** sans expédier ; retrait de la liste blanche.

**Beebs** (exige un compte VENDEUR au téléphone vérifié — le tien ne l'est pas, § 9.2)
1. Ornella achète (et t'écrit si la messagerie de ton compte est ouverte).
2. Dans l'app : « Commande à accepter » + « Accepter sur Beebs » — et, si ton compte n'a pas de téléphone
   vérifié, le mur « Vérifie ton numéro sur Beebs » en tête des messages.
3. **Ne pas accepter** (accepter = générer le bordereau = débiter Ornella) : tu refuses / annules **sur Beebs**.
4. Je vérifie que la commande a bien été lue (forme de la page) et qu'elle passe « Annulée ».

**eBay**
1. Ornella achète (paiement immédiat) et t'envoie une question.
2. Dans l'app (relevé par le serveur) : la question dans « Messages », la commande dans « À expédier » avec la
   date limite d'envoi et le service choisi, bouton « Étiquette sur eBay ».
3. Réponse : liste blanche (§ 9.4), tu réponds depuis l'app → part par l'API une seule fois.
4. Tu annules la commande **sur eBay** sans expédier → elle quitte « À expédier » au relevé suivant (v4).

**Depop**
1. Ornella achète et t'écrit.
2. Dans l'app : la conversation, puis la commande dans « À expédier » (« Voir sur Depop », pas de bordereau en
   France) — forme des reçus à vérifier ensemble.
3. Réponse via la liste blanche.
4. Tu annules **sur Depop** (remboursement) sans expédier.

**Test de réponse (toutes plateformes)** : la conversation hors liste blanche → l'app dit « Envoi verrouillé »,
la réponse s'enregistre « non envoyée » ; après l'ajout (§ 9.4), une NOUVELLE réponse → « En attente » →
« Envoyée » ; elle apparaît UNE fois chez Ornella ; retrait de la liste blanche ; `count(*)` = 0.

### 9.6 Fin de session : effacement, remise à zéro, retour sur ton Beebs

- **Données Beebs relevées sur le compte d'Ornella** : 0 conversation, 0 message, 0 commande en base (ses deux
  conversations ont plus de 30 jours ; aucune vente). Effacement passé quand même, compté (état de prod).
- **Remise à zéro de ton inventaire : PAS NÉCESSAIRE.** Rien d'Ornella n'est entré dans ton stock (aucun relevé
  Beebs pendant la session ; le relevé refuse de toute façon de lire le dressing d'un autre compte Beebs que
  celui de tes annonces). Si tu la fais quand même (Réglages › « Tout remettre à zéro »,
  `supprimer_mon_stock_sans_retrait`), voici ce qu'elle fait :
  - **efface** : tes **80 fiches** de stock (titres, photos, **prix d'achat**, attributs, quantités, liens
    vers les annonces) ; tes **238 ventes** (prix, bénéfices, dates — donc tout l'historique des stats et du
    Tableau) ; les **40 fiches d'annonce** générées (`fiches_annonce`, liées aux scans Lens) ;
  - **garde** : tes annonces EN LIGNE sur les plateformes (rien n'est retiré nulle part) ; ton compte, ton
    abonnement, tes réglages, tes connexions (extension, eBay) ; l'historique des jobs, les annonces relevées et
    les rapprochements (détachés de toute fiche, ils se rattacheront au prochain relevé) ; tes scans Lens
    (`lens_scans`) ; la messagerie et les commandes (détachées de l'article) ;
  - **irréversible** (aucune sauvegarde automatique).
- Ensuite : tu te reconnectes à TON Beebs dans Chrome ; aucune autre action n'est nécessaire.

## 10. Utilisable pour de vrai — Nico ET Ornella (16/10 nuit, « une seule passe »)

> Mission de Nico du 16/10 au soir. Rien n'a été envoyé, généré, accepté ni acheté sur une plateforme pendant
> cette passe : le code des sites (Vinted, Leboncoin, Beebs) a été relu dans leurs fichiers publics, et une seule
> lecture a été faite sur ton compte Vinted (l'adresse d'expédition par défaut : 200, « complète », clés seulement).
> Aucun texte de message, aucun nom, aucune adresse recopiés ici.

### 10.0 L'essentiel

1. **Deux comptes bêta, personne d'autre** : toi et **Ornella = `ornellaracano@icloud.com`**
   (`f8aa02a5-23cb-4325-bba8-127f61a75741`, 899 fiches, ≈ 1 000 jobs sur 30 jours, extension 0.6.114 du store).
   Les deux autres comptes « ornella… » en base sont d'autres personnes (0 fiche, 0 job). Drapeau posé le 16/10
   vers 23:40 (`scripts/reparations/20261016_drapeau_messagerie_ornella.sql`, sauvegarde + inverse) ; contrôle :
   2 porteurs.
2. **Répondre sans liste blanche** — dès la migration **20261016220000** appliquée (feu vert à donner, § 10.4) :
   la réponse part sur ton appui seulement, **telle que tu l'as écrite** (plus aucun « trim », empreinte SHA-256
   vérifiée par la base PUIS par l'exécutant juste avant l'envoi), **une seule fois** (même clé = même réponse ;
   même texte vers la même conversation en 10 min = même réponse ; une clé par brouillon côté app ; clé
   d'idempotence de la plateforme = numéro de notre réponse ; prise jamais renvoyée ; non prise en 24 h = jamais
   envoyée en retard), **tracée** en base.
3. **Générer le bordereau depuis FillSell** (Vinted « commander l'étiquette », Leboncoin « confirmer la
   disponibilité », Beebs « accepter la commande ») : un appui → **écran de confirmation** (une phrase : ce que ça
   engage ; Vinted : papier ou QR) → « Confirmer » → ton ordinateur fait le geste **une fois** (état relu juste
   avant : déjà fait = on récupère, rien de plus) → le PDF (ou le code) arrive dans FillSell. **Une génération par
   commande, à vie** (index en base ; issue inconnue = « incertaine », jamais refaite).
4. **eBay : non, et le bouton vers eBay reste.** L'étiquette eBay est payante, elle n'a **aucune API en France**
   (Logistics API = USPS seulement), et les conditions d'eBay (art. 3) interdisent « tout autre procédé
   automatique » ; eBay n'empêche même pas d'acheter **deux** étiquettes pour la même commande (jusqu'à 5). Le
   texte de l'app le dit, et renvoie à « Bordereaux d'envoi » sur eBay pour ne pas en racheter une.
   **Depop** : pas de bordereau en France, bouton vers Depop.
5. **Partager, imprimer, 10 × 15** : chaque bordereau s'ouvre en aperçu — « Étiquette 10 × 15 » (découpée dans l'A4,
   tournée, PDF 100 × 150 mm pour Munbyt et autres thermiques) ou « Original » ; partager / télécharger /
   imprimer ; « Tout imprimer » réunit les bordereaux prêts en un seul PDF ; un code sans papier s'affiche en grand,
   plein écran.
6. **Trois corrections à la racine** : ventes à 0 € (C1), photos payantes Leboncoin (C2), « panneau des racines
   introuvable » (C3) — § 10.6.

### 10.1 Par plateforme

✅ fait et prouvé (essai à blanc, selftests) · 🟢 fait, à prouver au vrai achat · ❌ impossible (raison)

| | Répondre | Générer le bordereau | Récupérer / afficher | Partager · 10 × 15 |
|---|---|---|---|---|
| **Vinted** | 🟢 POST …/replies, texte exact | 🟢 PUT …/shipment/order (adresse par son numéro, point relais, papier/QR au choix) | 🟢 `pdf_label` ou `digital_label` | ✅ |
| **Leboncoin** | 🟢 clé `clientMessageId` = notre réponse | 🟢 POST …/action/validate-availability (Mondial Relay, Shop2Shop, Relais Colis) ; Colissimo / courrier suivi → sur Leboncoin (formulaire d'adresse) | 🟢 `prepare-parcel` → `label_url` | ✅ |
| **Beebs** | 🟢 (compte au téléphone vérifié) | 🟢 action du bouton « Télécharger le bordereau » (`sellerConfirmAction`), téléphone vérifié exigé ; main propre → app Beebs | 🟡 fichier cherché dans la commande ; introuvable → « télécharge-le sur Beebs » | ✅ si fichier |
| **eBay** | 🟢 par le serveur (API), texte exact | ❌ payante, pas d'API en France, conditions d'eBay → bouton vers eBay | — | — |
| **Depop** | 🟢 clé `idempotency_key` = notre réponse | ❌ pas de bordereau en France → bouton vers Depop | — | — |

### 10.2 Ce qui ne marche pas, ou pas encore, et pourquoi

- **Aucun geste n'a encore été vu en vrai** : les appels « qui engagent » ont été relus dans le code des sites
  (16/10 nuit), jamais exécutés. Ils seront prouvés au premier test (§ 10.3). Un refus de la plateforme ne fait
  rien (l'app dit pourquoi, « rien n'a été fait ») ; une coupure pendant le geste → « incertaine » : vérifier sur la
  plateforme, FillSell ne refait jamais.
- **Beebs, le fichier** : le lien du bordereau généré n'est pas dans le code lisible du site (aucune vente vue) ;
  s'il n'est pas dans l'objet commande, l'app dit « télécharge-le sur Beebs ».
- **Beebs sur TON compte** : toujours sans téléphone vérifié → génération refusée (« vérifie ton numéro ») ; le test
  Beebs se fait sur le compte d'Ornella **avec SA future extension du store** (0.6.121), ou en vendant depuis son
  compte.
- **Vinted, cas non couverts** : enlèvement à domicile (date à choisir), téléphone exigé par le transporteur,
  adresse incomplète → refus clair, à faire sur Vinted.
- **L'app mobile Android** ne sait pas partager un fichier depuis l'app (pas de plugin natif dans le binaire) : le PDF
  est déposé dans ton dossier privé puis ouvert dans Chrome (télécharger, imprimer, envoyer à l'app Munbyt) ; il est
  effacé au bout de 24 h. iOS : feuille de partage (non prouvée sur iPhone ; repli = même dépôt). Un « Tout
  imprimer » de plus de 5 Mo est refusé (limite du dossier) et l'écran le dit.
- **Le recadrage 10 × 15** n'a vu aucun vrai bordereau : détection générique (code-barres, blancs, pointillés de
  découpe), recadrages de secours (« Ajuster »), retenus par transporteur sur l'appareil.

### 10.3 Protocole de test — Nico et Ornella, entre vous deux

Avant : migration 20261016220000 appliquée (§ 10.4) ; ton ordinateur allumé, Chrome ouvert (ta copie prend seule
la 0.6.121) ; pour Beebs et pour que la relève tourne chez Ornella, la 0.6.121 du store sur SON ordinateur.
Chaque annonce de test : **999 € ou plus**, titre « TEST — ne pas acheter », sur le compte du vendeur.
Dans l'app : bandeau « Messages · À expédier » (au-dessus des onglets).

**1. Message (toutes plateformes)**
1. Ornella écrit sur ton annonce de test. → Elle apparaît dans « Messages » au relevé suivant (eBay : 20 min).
2. Tu réponds depuis l'app : l'écran dit « Envoi actif : ta réponse part telle que tu l'écris… une seule fois ».
   Écris un texte avec deux espaces au début, un retour à la ligne et un accent. Appuie **deux fois de suite** sur
   l'envoi.
3. Attendu : « En attente » → « Envoyée, telle que tu l'as écrite » ; chez Ornella, **un seul** message, identique
   au caractère près. Moi : je relis `messagerie_reponses` (1 ligne, empreinte, exécutant, numéro du message).

**2. Vinted** (Ornella achète ton annonce à 999 €)
1. « À expédier » : la commande, l'acheteuse, « Générer le bordereau » (si Vinted demande un choix papier / QR,
   l'écran te le propose).
2. Appuie : l'écran de confirmation dit « Commander l'étiquette engage l'envoi… » → **Commander l'étiquette**.
3. Attendu : « Génération demandée » → « Bordereau généré sur Vinted : récupération… » → « Ouvrir le bordereau ».
   Sur Vinted : l'étiquette est commandée **une** fois. Réappuie sur « Générer » ailleurs (autre téléphone) :
   rien ne repart (« déjà »).
4. « Ouvrir le bordereau » → « Étiquette 10 × 15 » → « Partager ou imprimer » → l'app Munbyt (ou l'imprimante
   thermique de l'ordinateur, papier 100 × 150). Si la découpe est mauvaise : « Ajuster le recadrage » (retenu pour
   ce transporteur).
5. **Annulation** : tu annules la commande **sur Vinted** sans expédier ; Ornella est remboursée. La commande quitte
   « À expédier » au relevé suivant.

**3. Leboncoin** (paiement sécurisé, Mondial Relay ou Shop2Shop)
1. « À expédier » : « Disponibilité à confirmer » + « Générer le bordereau ».
2. Écran : « Confirmer la disponibilité valide la vente… » → **Confirmer la disponibilité**.
3. Attendu : Leboncoin passe la vente « disponible », le bordereau arrive dans FillSell ; impression 10 × 15 comme
   Vinted. Colissimo / courrier suivi : l'app dit de le faire sur Leboncoin (formulaire d'adresse).
4. **Annulation** sur Leboncoin, sans expédier.

**4. Beebs** (vendeur = un compte au téléphone vérifié : celui d'Ornella ; acheteur = toi)
1. ⚠️ **Accepter la commande débite l'acheteur** (toi, 999 €), remboursé à l'annulation. Si vous ne voulez pas de
   ce débit : s'arrêter à l'écran de confirmation (« Annuler »), puis refuser sur Beebs.
2. Sinon : « Générer le bordereau » → **Accepter la commande** → la commande passe « bordereau imprimé » ; le
   fichier arrive dans FillSell, ou l'app dit « télécharge-le sur Beebs ».
3. **Annulation** sur Beebs.

**5. eBay** : la commande apparaît avec la date limite ; « Étiquette sur eBay » ouvre la commande sur eBay (rien à
générer dans FillSell) ; annulation sur eBay. **Depop** : « Voir sur Depop ».

**6. Tout imprimer** : avec deux bordereaux prêts ou plus, le bouton « Tout imprimer · N » réunit tout en un PDF
(10 × 15 : une étiquette par page).

**Moi, après chaque étape** : je relis la base (une génération par commande, statut, geste « fait » ou « déjà
fait », copie 5 jours), en lecture seule, et je te dis ce que j'ai vu.

### 10.4 Ce qui attend TON feu vert (dans cet ordre)

1. **Migration 20261016220000** (messagerie ouverte + génération). Essai à blanc **33/33** (transaction annulée,
   prod relue inchangée). Ce qu'elle fait : réponses sans liste blanche (mode 2) et texte exact + empreinte ;
   génération (table des demandes étendue, une par commande, `bordereau_generer`, étapes, prise par capacité) ;
   options de bordereau relevées ; purge des fichiers d'impression (24 h) ; rien de destructif (0 réponse,
   0 demande, 0 copie, 0 commande en base). Inverse : `supabase/rollbacks/20261016220000_…`.
   `npx supabase db query --linked -f supabase/migrations/20261016220000_messagerie_ouverte_bordereaux_generes.sql`
   puis `npx supabase migration repair --linked --status applied 20261016220000`.
2. **Migration 20261016221000** (C1, prix des ventes nées d'un job) puis la réparation
   `scripts/reparations/20261016_ventes_prix_zero.sql` (aucun mail renvoyé) — § 10.6.
3. **OTA 2.9.97** (écrans de la bêta sur l'app mobile) — prête, envoyée seulement sur ton feu vert.

### 10.5 Preuves (sans rien toucher chez une plateforme)

- **Essai à blanc de 20261016220000 : 33/33** (transaction annulée, données d'essai sur ton compte, prod relue
  inchangée : ancienne `messagerie_repondre` en place, aucune clé neuve, aucun objet d'essai, cron d'avant). Dont :
  réponse « en attente » SANS liste blanche ; texte gardé AVEC ses espaces ; **même clé → même réponse, 1 ligne** ;
  **même texte en 10 min → même réponse** ; empreinte fausse refusée ; **prise une seule fois** ; résultat rendu une
  seule fois ; mode 1 = liste blanche, mode 0 = reverrouillage ; **réponse non prise en 24 h → jamais envoyée en retard** ; génération sans phrase refusée ; **deux
  générations → la même demande** ; **seconde génération écrite en direct → refusée par l'index** ; extension
  d'avant → rien ; génération faite → suite « fichier » → prête avec la copie → une nouvelle demande rend la copie ;
  **génération prise sans réponse → « incertaine » → jamais une seconde** ; transition interdite refusée ; options
  de bordereau gardées, ligne inchangée jamais réécrite ; fichier d'impression de 25 h rendu à la purge, celui
  d'1 h non.
- **Selftests neufs** : `selftest:messagerie-generation` (17 cas : même clé d'idempotence quand on rejoue le même envoi
  sur Leboncoin et Depop, texte qui part tel quel sur les 4 plateformes, empreinte = celle de Postgres ; corps
  Vinted et refus ; décision « déjà fait → aucun geste » ; **0 appel qui engage quand l'étiquette est déjà
  commandée** (Vinted 200/220/230/250, Leboncoin `available`, Beebs `LABEL_PRINTED`) ; **un seul PUT / POST**,
  Vinted une seconde seulement après un 401 ; 500 / réseau coupé = incertain, jamais retenté ; préparation en
  lecture seule sans nom, adresse ni téléphone en sortie ; fonctions de page autonomes) ;
  `selftest:bordereau-impression` (50 : 10 × 15 sur de vrais PDF rendus par pdf.js, rotation, découpe, fusion) ;
  `selftest:messagerie-app` (18, réécrit aux nouvelles règles) ; `selftest:messagerie` (44).

### 10.6 Les trois corrections à la racine

**C1 — Ventes à 0 €** (règle : `docs/regles/ventes-et-retraits.md` § 16/10 soir, C1)
- **Cause** : le déclencheur `push_trg_job` (prod) passait `new.price` à la note de vente ; sur une
  **republication**, ce prix est NULL (il vit dans `platform_fields.prix_recreation` / `republish_snapshot.prix`,
  même trou que le 11/10) ; puis `push-ventes` écrivait `Number(null) || 0` → « vendu 0 € », et un **bénéfice
  négatif** quand le prix d'achat était connu.
- **Ampleur** : 128 notes sans prix depuis le 06/10 (84 sur 7 jours), toutes Vinted, toutes des republications ;
  **45 mails « 0 € » à 17 comptes** depuis le 06/10, dont **26 à 14 comptes sur 7 jours**, dont 9 avec un bénéfice
  négatif. Aucune notification push (0 appareil). Les **ventes** elles-mêmes (table `ventes`) ont toutes leur prix :
  seul le prix ANNONCÉ manquait.
- **Correctif** (migration 20261016221000, tous comptes) : UNE règle du prix d'une vente née d'un job — la vente
  enregistrée (jamais pour eBay), sinon le prix lu à la vente, sinon le prix du job, sinon le dernier prix publié,
  sinon la fiche ; chaque source > 0, sinon la suivante ; **rien = inconnu (NULL), jamais 0**. Le mail
  (`push-ventes` v11) n'écrit **aucun montant ni bénéfice** quand le prix est inconnu.
- **Réparation** : `scripts/reparations/20261016_ventes_prix_zero.sql` remet le prix sur les 128 notes (119 par la
  vente enregistrée, 8 par le prix lu à la vente, 1 par le prix de republication ; aucune ne reste sans prix),
  **aucun mail renvoyé** (essai à blanc : 284 mails avant, 284 après).
- **Note 2348 (Louis)** : notre base ne connaît que **14 €** (la vente 181210, confirmée dans l'app au prix de
  l'annonce, sans relevé de la transaction Vinted). Les 12 € réels n'existent nulle part chez nous (offre acceptée ?).
  La réparation y mettra 14 € ; si c'est 12 €, c'est la VENTE 181210 qu'il faut corriger (Louis dans l'app, ou
  un script sur ta décision).

**C2 — Leboncoin, photos payantes** (règle : `docs/regles/plateformes.md` § 16/10)
- **Cause** : l'extension envoyait TOUTES les photos de la fiche ; le seul plafond était une table de l'app
  (« Divers > Autres » = 3). Lu dans le code du dépôt Leboncoin : le nombre gratuit dépend de la catégorie ET du
  type de compte (`photosMinNumber`, sinon 3 pour un particulier, 5 pour un pro).
- **Ampleur (30 jours)** : PAUGUES 11 dépôts bloqués à 6-11 photos ; un autre compte 23 dépôts Mode à 7-17 photos
  (14/10) ; 2 autres comptes, 1 dépôt chacun.
- **Correctif (extension seule, tous les comptes)** : au dépôt, l'extension LIT la galerie du formulaire (le libellé
  du bouton d'ajout — « Ajouter 20 photos » = tout gratuit —, sinon les emplacements gratuits affichés), exige deux
  lectures identiques, et n'envoie que les N premières photos, dans l'ordre de la fiche. Illisible : 3 photos
  (le minimum de Leboncoin), avec une note — **jamais une photo payante**. Le bilan va dans
  `platform_fields.photos_lbc`. Le pré-vol de recréation fait de même. Plus de plafond codé en dur dans
  l'extension ; la table de l'app reste comme filet tant que les postes n'ont pas la 0.6.121.
- **Le motif du mur** : le même écran finissait en `champ_a_choisir` (12 jobs) ou `relancer` (11) — une question
  déjà tranchée restait sur le job et le filet du serveur la rouvrait. Pour ce mur, les marqueurs de question passée
  tombent et le motif est toujours `relancer`.

**C3 — « Catégorie : panneau des racines introuvable »**
- **Cause** : l'extension ne reconnaissait le panneau des catégories que s'il contenait « Divers » ; or Leboncoin
  filtre l'arbre par type de compte et « Divers » n'existe pas pour un compte **PRO**. PAUGUES est pro (preuve :
  `owner.type = "pro"` sur son annonce) ; seul autre cas en 45 jours : un autre compte pro (21/09).
- **Correctif** : le panneau est reconnu à ses racines (la liste dont la plupart des éléments, 4 au moins, sont des
  racines connues ; des boutons seulement), relu 3 s au plus ; un échec joint un relevé de la page.
- **Les 8 jobs de PAUGUES** (c6e69317, 1448cb67, 064ddaa6, b2c54353, 8e79a16d, c79fca01, f6e6e0bb, bc458731) :
  `pending` en reprise automatique (toutes les 6 h, sans limite) ; ils **repartent seuls dès que le Chrome de
  PAUGUES a la 0.6.121 du store** (il est en 0.6.114) — d'ici là chaque essai s'arrête avant les photos, rien n'est
  déposé. 3 d'entre eux ont 6 à 9 photos : C2 leur sert aussi.
- **À prouver au premier dépôt réel** : `platform_fields.photos_lbc` (un pro doit lire 5, Mode chez un particulier
  20, Divers 3) ; les 8 jobs de PAUGUES `published` après sa mise à jour (si son forfait pro est épuisé, ce sera
  « Valider et payer » avec la phrase qui dit que ce n'est pas le pack photos). Les 23 jobs de l'autre compte
  attendent son « Relancer » (décision de la personne).
