# Chantier « zéro orange + bordereaux » — 18/10/2026 (une passe, 10:55 → 13:15 Paris)

## Résumé (à lire en premier)

- **Bordereaux (lot 1) — cause PROUVÉE, c'était notre faute.** Vinted écrit les types d'étiquette en toutes lettres
  (`printable`, `digital`, `code`) ; l'extension les lisait comme des chiffres 1/2/3 et les jetait tous. Elle a donc
  commandé l'étiquette des deux commandes Vinted Go de Louis **sans type** alors que Vinted en proposait plusieurs ;
  Vinted a écrit « Échec du bordereau d'envoi » **une seconde après** chacun de nos gestes (09:53:15 → 09:53:16,
  09:55:14 → 09:55:14). Corrigé dans l'extension **0.6.126** (zip prêt). **Filet en prod depuis 11:22** : l'échec est
  dit tout de suite avec la vraie raison et le seul geste, la boucle est arrêtée, et plus aucune extension d'avant ne
  peut commander une étiquette Vinted. Les deux commandes de Louis sont toujours en échec chez Vinted : **une relance
  unique est autorisée** et partira seule dès que son poste aura la 0.6.126 (jusqu'au 26/10 00:00), sans rien faire si
  Louis a obtenu ses bordereaux lui-même entre-temps. **Verdict bêta : NON, pas encore** (critères § 1.6).
- **Lot 2** : compteur de dépense IA vivant (Anthropic **54,76 $** au 18/10 midi, ≈ 3,1 $/jour, projection ≈ 96 $
  pour octobre) et **plafond codé en dur** dans les trois fonctions qui coûtent (coupe-circuit à trois niveaux,
  ≤ 185 $/mois). Correspondances apprises sur les annonces acceptées : **banc figé, 8 champs à 0 faux**, livrés en
  **mode fantôme** avec bascule automatique codée (48 h, ≥ 15 cas, 100 %) et retour arrière automatique. Constat
  honnête : ce levier couvre peu (les questions qui restent sont surtout des cas vraiment ambigus).
- **Lot 3** : oranges des comptes actifs **112 lignes / 29 comptes → 91 / 18** (règle de l'app après le web de ce
  jour). Preuve réelle : les 3 annonces eBay bloquées « EAN exigé » sont **en ligne** (12:44) avec « Non applicable ».
- **Lot 4** : les **6 ventes Beebs** rangées « Ailleurs » sont réparées (12:23, aucun mail). Lecture de la page des
  ventes Beebs livrée **en fantôme** (interrupteur éteint : la forme réelle d'une commande Beebs n'a jamais été lue).
- **Lot 5** : 9cdr9rm4rn — le serveur distribuait, **c'est son ordinateur qui dormait** ; sa file est repartie
  (9 republications le 18/10). hu.anastasia — vrai défaut de règle (pause anti-robot qui ne se posait jamais) :
  **corrigé en prod à 11:45** ; la reprise dépend de Vinted et d'un Edge ouvert.
- **Lot 6** : aucun doublon possible aujourd'hui ; **un trou de mauvaise boutique fermé** (0.6.126) et le routage par
  poste en prod (12:31). Réponse à Louis : § 6.
- **Livraison** : 9 fonctions edge, 4 migrations (inverses prêtes), 2 réparations, web + OTA 2.9.101, **zip
  0.6.126 à téléverser** : `build\CWS-0.6.126-A-TELEVERSER\fillsell-extension-0.6.126-7920a40-cws.zip`. La 0.6.125
  est **déjà acceptée et servie** (15 comptes à 12:45) : la 0.6.126 peut partir tout de suite. Selftests
  **350 → 358, 0 rouge**.

---

## Lot 1 — Bordereaux et bêta messages

**Statut : 1.1 FAIT ET PROUVÉ · 1.2 FAIT (Vinted prouvé par le code du site ; à prouver en réel par la relance de
Louis) · 1.3 FAIT ET PROUVÉ · 1.4 FAIT (relance armée) · 1.5 FAIT (constat) · 1.6 verdict NON.**

### 1.1 La cause (preuves)
- Base : `bordereaux_demandes` e5e13793 et d2b070c8 — `choix {type_etiquette: 1}`, geste « fait » à 09:53:15 et
  09:55:14 ; `plateforme_commandes.options_bordereau` = `{transporteur: "Vinted Go", types_etiquette: []}` (liste
  VIDE) ; `etat_plateforme` 230/**210** (LabelFailed). Messages de la conversation relevés : « Échec du bordereau
  d'envoi » à **09:53:16** et **09:55:14** — une seconde après le geste : refus immédiat de notre requête.
- Code du site de Vinted (chunk `1bkja4h2woifo.js`, relu le 18/10) : `tO = {Digital:"digital", Printable:"printable",
  Code:"code"}` ; les options d'un dépôt portent `label_types` en toutes lettres ; la fenêtre « type d'étiquette »
  s'ouvre dès que Vinted en propose PLUSIEURS, et la valeur choisie (`backendCode`, une chaîne) part telle quelle dans
  `PUT transactions/<id>/shipment/order {seller_address_id, pick_up_date, drop_off_type, reusable_package_selected,
  label_type}`. Les chiffres 1/2/3 (`tI`) ne servent qu'aux statistiques.
- Notre code (16/10) faisait `types.map(Number).filter([1,2,3])` → `Number("digital") = NaN` → liste vide →
  `label_type: null` alors que deux types étaient proposés. Le reste de notre requête est identique à celle de la page
  (adresse `shipping-estimation/external/shipping_address`, dépôt, emballage). **Ce n'est pas « Vinted seul ».**

### 1.2 Le correctif (tous les comptes) et la revue des autres plateformes
- **Extension 0.6.126** (`chrome-extension/messagerie.js`) : `TYPES_ETIQUETTE_VINTED`, `typeEtiquetteVinted`,
  `typesBrutsVinted` ; `label_type` en toutes lettres quand Vinted en propose plusieurs (sinon nul, comme la page) ;
  un type inconnu de FillSell se voit (`types_vinted`) et n'est jamais deviné ; 210 lu au fichier = « étiquette
  échouée chez Vinted » (avant : « à obtenir ») ; fichier par `pdf_label` d'abord, QR compris (comme la page) ;
  `CAPACITES_BORDEREAU` = generer, vinted_types_texte, relance_vinted.
- **Serveur** (migration `20261018100000`, appliquée 11:22) : une génération Vinted n'est plus donnée qu'à une
  extension qui dit « vinted_types_texte » (une d'avant commanderait sans type) ; non prise en 15 min → « echec /
  extension_a_mettre_a_jour », rien commandé. App : tant que l'extension du compte est d'avant la 0.6.126
  (`GENERATION_VINTED_BUILD_MIN = 2026-10-18T10:56:25Z`), la carte Vinted dit « Commander sur Vinted » au lieu de
  « Générer » (aucune attente pour rien).
- **Leboncoin** (revue du code) : requête écrite d'après le code du site (16-17/10), types d'envoi normalisés ;
  **aucune vente Leboncoin en bêta depuis le 16/10** (0 ligne dans `plateforme_commandes`) — rien à prouver en réel.
  Ajouté par précaution : un événement d'échec d'étiquette Leboncoin → « indisponible » → même filet (migration
  `20261018130000`). **Beebs** : action serveur relue dans le code de la page à chaque fois, téléphone vérifié, remise
  en main propre exclue ; aucune commande Beebs en bêta. **eBay** : l'étiquette est payante et ne s'achète jamais par
  FillSell (pas d'API en France, conditions d'eBay) — rien qui puisse échouer chez nous. **Depop** : pas de bordereau
  en France.

### 1.3 Le filet (en prod)
- `bordereaux_generations_closes` (à chaque relevé des commandes et à chaque prise) : génération « générée » sans copie
  + étiquette échouée chez la plateforme (`indisponible`) → « echec / etiquette_echouee_chez_<plateforme> » ;
  commande annulée → « echec / commande_annulee ». La suite ne cherche plus de fichier après un échec. Appliqué tout de
  suite : les 2 demandes de Louis (« générée », 15 essais de fichier) → « echec » à 11:22:06.
- App (web de ce jour) : « Redemander sur Vinted — Vinted a refusé d'émettre ce bordereau (« Échec du bordereau
  d'envoi »)… » ; plus jamais « Bordereau généré » avant la plateforme (« Demande faite sur Vinted : Vinted crée
  l'étiquette, FillSell récupère le fichier… »).

### 1.4 Les commandes de Louis
- État réel lu par SON poste (relevé de 11:00, inchangé ensuite) : 23283842931 et 23305737164 en **210** — il n'a pas
  obtenu ses bordereaux lui-même. Rien n'a été annulé, rien refait avec l'ancienne extension.
- **Relance unique armée** (`scripts/reparations/20261018_relance_bordereaux_louis.sql`, sauvegarde + inverse) :
  `bordereaux_relances_autorisees`, jusqu'au 26/10 00:00 (Vinted : « à envoyer avant le 26 oct. 10:00 »). Elle ne
  naît que quand une extension « vinted_types_texte » + « relance_vinted » prend ses demandes, et la base revérifie
  juste avant (commande toujours à expédier, échec ou à obtenir, sans copie ni autre demande) ; sinon l'autorisation est
  consommée SANS relance. L'extension relit Vinted juste avant le geste (étiquette déjà là : aucun geste, elle la
  récupère) et recommande une seule fois avec SON choix (1 = à imprimer). Essai à blanc (ROLLBACK) : extension
  d'avant → rien, rien consommé ; 0.6.126 → une relance née et prise, la seconde attend la prise suivante.
- **En attendant**, Louis voit « Redemander sur Vinted » : s'il le fait, FillSell récupère ensuite le bordereau.

### 1.5 Le parcours bêta sur les vraies données (Louis et Ornella)
- **Commandes détectées** : Vinted oui (Louis 9, Ornella 11 commandes relevées). Leboncoin, Beebs, Depop, eBay :
  **aucune commande en cours depuis l'ouverture de la bêta** (ventes des 14 derniers jours : Vinted seulement, plus
  « Ailleurs ») — rien à détecter, relevés vivants sans mur (`messagerie_releves`, 18/10 ~11:00).
- **Messages** : lus en direct — Louis Vinted (dernier 11:31), eBay (11:52), Leboncoin (17/10 18:47), Depop ; Ornella
  Vinted (10:33), Leboncoin (11:57). **Aucune réponse envoyée** par l'un ou l'autre depuis l'app (0 ligne
  `messagerie_reponses`) : l'envoi n'a été prouvé que sur le compte de Nico (16-17/10).
- **Bordereau visible dans l'app** : jamais encore (les 2 seules générations du parc sont celles de Louis, en échec).
- **Ornella** : son poste est passé SEUL en **0.6.125** (relevé 12:37 — une mise à jour d'extension ne demande pas de
  redémarrer Chrome). À vérifier chez elle quand elle aura la 0.6.126 : une commande Vinted « Générer le bordereau »
  de bout en bout (choix du type, fichier dans l'app), une commande Leboncoin et une Beebs à la première vente, une
  réponse envoyée depuis l'app.

### 1.6 Verdict : la bêta peut-elle s'ouvrir au parc ? **NON, pas encore.**
Critères écrits (tous les trois) : (1) la relance de Louis aboutit (bordereau Vinted dans l'app) avec la 0.6.126 ;
(2) au moins une commande Leboncoin ou Beebs menée de bout en bout dans l'app ; (3) le bilan fantôme
`ventes_beebs_commandes` montre la vraie forme d'une commande Beebs. La lecture (commandes, messages) est solide ; la
génération n'a pas encore réussi une seule fois en réel.

---

## Lot 2 — Zéro orange par la déduction

**Statut : budget FAIT ET PROUVÉ · référentiel FAIT (eBay par l'API à l'usage, veille des champs existante, voir
ci-dessous) · correspondances apprises FAIT, À PROUVER (fantôme, bascule automatique) · Lens étoffé, photo au dépôt,
seconde relecture : PAS FAIT (raison ci-dessous).**

### Budget IA (mesuré, puis plafonné)
| | Août | Septembre | Octobre (1→18, 12:00) |
|---|---|---|---|
| Anthropic | ≈ 65,9 $ | ≈ 88,7 $ | **54,76 $** (≈ 3,1 $/jour, pic 6,4 $ ; projection ≈ 96 $) |
| OpenAI (retouche photo, voix) | ≈ 13,9 $ | ≈ 8,8 $ | 4,08 $ |
Source : notre compteur (`usage_logs.metadata.cost_usd`), désormais agrégé en direct dans `ia_depense_jour`
(déclencheur, rattrapé au 01/10). ⚠️ À recouper une fois avec la console Anthropic (aucune clé d'administration lue).
Non chiffrés : `ebay_aspects_ia`, `lbc_champs_ia`, voix (≈ 1,5 $/mois estimé).
- **Coût par article publié** (avant) : 0,062 $ en octobre (886 articles), 0,079 $ en septembre. Après : **inchangé**
  — le lot n'ajoute aucun appel IA (les correspondances apprises coûtent 0 ; l'étape fantôme n'appelle rien).
- **Plafond codé en dur** (`supabase/functions/_shared/budget-ia.ts`, selftest `budget-ia`) — Anthropic, jour / mois :
  « moteur » (ce que le lot 2 ajoutera) 6 / 120 $ → au-delà : la question ; « confort » (rayon, champs, aspects,
  couleur, identify) 9 / 160 $ → l'arbre, le texte, la question ; « essentiel » (Lens, rédaction) 14 / 185 $ → saisie
  à la main, rien débité. Compteur illisible : essentiel et confort passent, moteur non. Branché AVANT tout appel et
  tout débit dans `resolve-categorie` v17, `lens-analysis` v108, `generate-listing` v118.
- **Aucune passe IA sur le stock** : rien n'a été lancé sur les 112 835 articles ; le banc n'appelle aucune IA.

### Correspondances apprises (le levier « gratuit »)
- Migration `20261018120000` : `deduction_apprise` reconstruite chaque nuit (02:35 UTC, ≈ 6 s) sur les annonces
  ACCEPTÉES (jobs publiés/vendus + annonces Leboncoin relevées = la valeur choisie par le vendeur), règle unanime
  (≥ 4 articles de ≥ 2 comptes avec le catalogue Vinted ; ≥ 8 de ≥ 3 pour la catégorie seule), jamais l'état, la marque,
  la couleur, la taille, la matière, le poids, les dimensions, un identifiant. 113 règles au 18/10.
- **Banc figé** (`scripts/banc-deduction-apprise.mjs`, `docs/enquetes/zero-orange-1810/banc-deduction.json` : appris
  avant le 06/10, testé sur les annonces acceptées après, articles du banc inscrits) :

| Plateforme | Champ | Testés | Couverts | Justes | Faux | Servi |
|---|---|---|---|---|---|---|
| Leboncoin | clothing_type (public Mode) | 57 | 12 | 12 | 0 | fantôme |
| Leboncoin | clothing_category | 54 | 11 | 11 | 0 | fantôme |
| Leboncoin | leisure_book_language | 14 | 10 | 10 | 0 | fantôme |
| Leboncoin | leisure_collection_product | 30 | 8 | 8 | 0 | fantôme |
| Leboncoin | toy_type | 60 | 3 | 3 | 0 | fantôme |
| Beebs | genre | 188 | 29 | 29 | 0 | fantôme |
| eBay | Département | 64 | 2 | 2 | 0 | fantôme |
| eBay | Type | 109 | 2 | 2 | 0 | fantôme |
| Leboncoin | shoe_category, shoe_type | 3 | 1 | 1 | 0 | non (trop peu) |
| **Catégorie** (Vinted → Leboncoin/Beebs/eBay) | | 445/230/108 | 23/6/1 | 15/6/1 | **8**/0/0 | **non** (recul Leboncoin) |
  Tous les autres champs : aucune règle unanime → non servis (règle « un seul champ en recul = pas livré »).
- **Mode fantôme** (app, web de ce jour) : après la fiche, le texte et la mémoire, l'app NOTE (`deduction_fantome`) ce
  qu'elle aurait posé, sans rien toucher. **Bascule automatique codée** (`deduction_bascule_evaluer`, cron 6 h) :
  « actif » quand le fantôme a ≥ 48 h, ≥ 15 cas relus sur des annonces acceptées et **100 %** égaux à la valeur en
  ligne ; **retour arrière automatique** (« coupe ») si ce qui est posé tombe sous 97 % sur ≥ 10 cas en 72 h, ou si les
  refus de la plateforme pour ces articles dépassent de 15 points ceux de la semaine d'avant. Chaque bascule est
  écrite dans `usage_logs` (`deduction_bascule`). Couper à la main : `update deduction_bascule set etat='eteint'`.
- Ordre réel du moteur après ce lot : texte du vendeur → fiche → texte de l'annonce → mémoire (éteinte) →
  **correspondances apprises** → IA sur la vraie liste → question.
- **Pas fait, et pourquoi** : Lens étoffé (fiche universelle d'un coup), lecture de photo au dépôt, seconde relecture
  à confiance basse — chacun change un appel payant et la qualité d'un champ ; sans banc IA dédié (interdit sur le
  stock, et pas mesurable en une passe sans risque), je ne l'ai pas branché. Le niveau « moteur » du plafond est prêt
  pour eux.
- **Questions encore posées (7 j, `champ_requis_bloquant`, articles)** : Beebs Taille 121 (dont 115 le 14/10, réglé
  le 17/10 par `childSizes` : 3 le 17/10, 0 le 18/10), Leboncoin Univers 82 et Produit 40 (surtout Décoration :
  objets que la liste de Leboncoin ne nomme pas — vraie ambiguïté), eBay Longueur/Largeur/Hauteur 42/38/32 (un compte,
  44 décorations murales le 18/10 : dimensions absentes du texte → vraie question). Mesure « après » : à relire vers
  le 25/10 (`champs_requis_veille(7)`).
- **Référentiel** : existant et vivant — `platform_category_aspects` (Vinted 129 rayons, Beebs 188, Leboncoin 35,
  relevés au dépôt), `ebay_item_aspects` (API officielle, 367 catégories, à la demande), `lbc_grilles_relevees`
  (6 288 listes) ; l'alerte « une plateforme ajoute un champ obligatoire » existe depuis la nuit du 17/10
  (`champs_requis_veille`, ops-digest). Pas fait : rafraîchissement HEBDOMADAIRE forcé de l'eBay par l'API (la
  fonction `fetch-ebay-aspects` exige la clé service_role — l'exposer à un cron demande de changer sa garde ; laissé).

---

## Lot 3 — Zéro orange hors IA

**Statut : FAIT ET PROUVÉ (EAN réel, Ornella réel) ; refus de contenu Leboncoin et coupures : FAIT, se prouvent au
prochain cas.**

| Type (comptes actifs 7 j) | Avant (11:20) | Après (règle de l'app du 18/10) |
|---|---|---|
| **Total** | **112 lignes / 29 comptes** | **91 / 18** |
| eBay EAN exigé (sebimsn10) | 3 | **0 — en ligne à 12:44 (227572603313, …344, …365)** |
| Introuvable à confirmer | 9 | 0 orange (« En pause · relevé attendu ») — dont Ornella 9ce306a4 → attente de sa boutique @472079 |
| Coupures techniques | 4 | 0 orange (reprise seule) |
| eBay site étranger | 2 | 0 orange (« En pause ») |
| Refus de contenu Leboncoin | 1 en boucle (jocabroc8, « instagram ») | reprise unique sans « instagram » ; puis question avec les mots exacts |
| Vrais gestes (LBC pro payer 23, LBC nom 13, eBay compte 13, Depop vendeur 12, anti-robot 8, champs 8, connexion 7, Depop autoriser 5, autres) | ≈ 90 | ≈ 91 |
- Ce qui change (racine) : `_shared/description-leboncoin.ts` (« instagram ») ; `_shared/pas-de-rouge.js` (refus de
  contenu Leboncoin : jamais deux fois le même texte, empreinte du texte servi) ; **EAN eBay** : celui de la fiche s'il
  est lisible, sinon **« Non applicable »** — le texte officiel d'eBay France ; « Ne s'applique pas » (valeur du MPN)
  a été **refusé par eBay** à 12:33 (preuve réelle), corrigé et redéployé à 12:39 ; `CANAL_RE` unique (coupures :
  reprise seule, jamais un bouton « Relancer ») ; introuvable d'une autre boutique → attente de boutique ;
  `StockTab` : une attente automatique est grise « En pause », hors « À régler ».
- Les 2 refus de modération Leboncoin restants sont des annonces de TEST de Nico.

## Lot 4 — Ventes Beebs

**Statut : réparation FAIT ET PROUVÉ · détection FAIT, À PROUVER (fantôme, `coin_config.ventes_beebs_commandes = 0`).**
- Réparation (12:23, `scripts/reparations/20261018_ventes_beebs_ailleurs.sql`, sauvegarde
  `_backup_1810_ventes_beebs_ailleurs`, inverse) : ventes 77407, 87308, 94454, 125115 (Ornella), 142259, 158347 →
  `beebs` ; 5 fiches → `beebs`. Mails, notes et appels sortants comptés avant/après : identiques (aucun mail).
- Détection (règle) : une commande lue sur la page des ventes de Beebs = vente prouvée. `commandes_beebs_noter`
  (migration `20261018110000`) rattache par le **numéro du produit seulement** (deux jobs = doute, rien) et pose la même
  preuve que Depop (`ventes_prouvees_tick` : vente « Beebs », copies retirées) ; commande annulée = preuve levée. La
  0.6.126 relit la page des ventes quand une annonce Beebs disparaît (une fois par 30 min au plus) et au passage bêta.
  **Une disparition seule ne vaut jamais vente** (bandeau inchangé).
- Pourquoi éteint : la page des ventes n'a jamais rendu une commande lisible en base (0 ligne Beebs dans
  `plateforme_commandes`), la forme de `products[].id` n'est pas prouvée. En fantôme, la fonction écrit son bilan
  (`usage_logs ventes_beebs_commandes`) sans rien toucher : **allumer** (`update coin_config set value=1 where
  key='ventes_beebs_commandes'`) quand un bilan montre `prouvees_ou_auraient > 0` et `forme_inconnue = 0`. Essai à blanc
  (compte d'Ornella, ROLLBACK) : preuve posée en écrit, rejouée sans réécriture, levée sur annulation, 0 mail.
- Décision pour Nico (C2) : une vente DÉCLARÉE au clic sur une carte Beebs reste « Ailleurs » (règle du 28/09).

## Lot 5 — Files de republication figées

**Statut : 9cdr9rm4rn PROUVÉ (pas de défaut serveur) · hu.anastasia FAIT (règle en prod), reprise À PROUVER.**
- **9cdr9rm4rn** : journaux par sujet du jeton — le serveur distribuait à chaque appel (« 1 à 3 job(s) distribué(s) ») ;
  plus AUCUN appel du poste de 19:20 à 21:15 UTC, puis des réveils de quelques secondes toutes les 2 h commençant par un
  jeton expiré = **ordinateur en veille** (`requestKeepAwake` n'empêche pas une mise en veille demandée). Les
  republications « de nuit » sont son lot MANUEL du 16/10 07:54 (255 jobs), hors créneau par règle (décision de Nico).
  Plafond Pro (73 < 170) et pause de respiration : normaux. « keep_awake ne voyait qu'1 job » : inexact (124 à 18:17,
  117 à 23:17 ; la trace de 23:17 est écrite au réveil). Reprise prouvée : 9 republications le 18/10 (09:54 → 11:30),
  poste passé en 0.6.125 à 12:25.
- **hu.anastasia** : chaque lecture d'annonce de SA boutique refusée par l'anti-robot (403) alors que la sonde du compte
  répondait 200 → la pause du compte (qui exigeait une sonde 403) ne se posait jamais → un nouvel article refusé toutes
  les 2-5 min. Règle corrigée pour tout le parc (`_shared/pause-antirobot-vinted.js`, get-pending-jobs v259+) : deux
  articles de sa boutique refusés après le dernier succès suffisent à mettre en pause les republications qui lisent leur
  annonce (retraits, publications, recréations continuent), une sonde toutes les 45 min, message à un seul geste, pas de
  « à toi » à 6 h. Elle s'appliquera au prochain poll de son Edge (aucun depuis 10:13). Même défaut : meminiandmove.
- **Non changé (décision de Nico)** : le plafond de 4 h de l'éveil (`EVEIL_PLAFOND_MS`) relâche la machine au milieu
  d'un gros lot (12 comptes, 58 relâches avec ≥ 20 jobs en file en 7 jours). Proposition : éveil tant que la file
  progresse (45 min sans progrès → relâche, filet 24 h) + trace `veille_constatee`.

## Lot 6 — Deux machines, un seul compte Leboncoin (Louis)

**Statut : FAIT (serveur en prod 12:31 ; extension dans la 0.6.126).**
- Aujourd'hui : **aucun doublon possible** — chaque job est réservé à UN poste (`reserver_jobs_extension`,
  `controler_job_extension`), un seul dépôt Leboncoin à la fois par compte. Trous trouvés : la boutique Vinted n'était
  connue que par compte (jobs servis à la mauvaise machine, attentes) ; **la recréation d'une republication Vinted ne
  relisait pas la boutique** (seul cas qui pouvait publier sur la mauvaise boutique) ; un 403 d'une commande Vinted
  d'une autre boutique pouvait mettre en pause les messages du compte.
- Corrigé : boutique Vinted PAR POSTE (preuves de dépôt, gardes, poll), job Vinted servi au poste ouvert sur la bonne
  boutique quand deux postes vivants ont deux boutiques, mur d'une plateforme par poste (plus de « connecte-toi » faux
  sur la machine sans Leboncoin) ; 0.6.126 : garde de boutique AVANT le formulaire de recréation, identité et sessions
  du poste au poll, commande suivie d'une autre boutique = « pas ce compte », jamais un blocage.
- **Réponse à faire à Louis** (2-3 phrases) : « Oui, tu peux mettre ton Vinted pro sur ton PC et ton Vinted perso sur
  la VM, avec ton compte Leboncoin sur l'une ou sur les deux : FillSell donne à chaque ordinateur les tâches du compte
  qui y est ouvert, et une même tâche n'est jamais faite deux fois. Pour que ce soit complet, laisse ton extension se
  mettre à jour (version 0.6.126, dans les prochains jours) et choisis ta boutique Vinted par défaut dans Réglages. »

---

## Livraison
- **Fonctions edge** (verify_jwt lus avant/après, inchangés) : get-pending-jobs **v258** (11:40, minimum 0.6.124) →
  **v259** (11:45, lot 5) → **v260** (12:31, lots 3 et 6) ; update-job-status **v142** → **v143** ; handler-watch
  **v117** (12:31) → **v118** (12:39, EAN « Non applicable ») ; ebay-api-worker **v89** → **v90** ; lens-analysis
  **v108**, resolve-categorie **v17**, generate-listing **v118** (plafond IA ; embarque aussi les interrupteurs de la
  nuit, éteints).
- **Migrations** (appliquées, `migration repair` fait, inverses dans `supabase/rollbacks/`) : `20261018100000`
  (11:22), `20261018110000` (~12:20), `20261018120000` (12:03), `20261018130000` (12:36).
- **Réparations** : `20261018_relance_bordereaux_louis.sql` (11:2x), `20261018_ventes_beebs_ailleurs.sql` (12:23).
- **EXTENSION_MIN_BUILD = 2026-10-17T18:16:49Z** (0.6.124, ordre de Nico, 11:40) ; 0.6.124 et 0.6.125 inscrites
  (`ALREADY_PUBLISHED`, `PUBLISHED_BUILD_IDS`). Effet constaté : les postes d'avant se sont mis à jour seuls (15
  comptes en 0.6.125 à 12:45) ; un poste d'avant ne reçoit rien tant qu'il n'est pas à jour.
- **Extension 0.6.126** : `build\CWS-0.6.126-A-TELEVERSER\fillsell-extension-0.6.126-7920a40-cws.zip` (BUILD_ID
  `2026-10-18T10:56:25Z+7920a40`), zip seul dans ce dossier ; anciens zips dans `build\CWS-PERIMES` (0.6.124 et 0.6.125
  renommés « PUBLIEE-ET-SERVIE ») ; **manifeste relu : seule la version change, aucune permission nouvelle, même liste
  de fichiers**. La 0.6.125 étant acceptée, **la 0.6.126 peut être téléversée tout de suite**.
- **Web** : push de ce jour (voir l'état de prod pour le `build.json` relu) ; **OTA 2.9.101** (canal production relu).
- Selftests : **350/350 avant → 358/358 après** ; `build:essai` vert ; eslint : aucune erreur nouvelle sauf 2
  `'chrome' is not defined` dans background.js (même classe que les 379 d'avant : l'extension n'a pas de bloc eslint).

## Incidents
- **Deux selftests rendus rouges par mes propres changements** (repo seulement, jamais en prod) : `messages-cause-vraie`
  (ancre de la pause anti-robot), `memoire-categorie` et `ebay-aspects-seconde-passe` (ancres) — réparés avant tout
  commit.
- **Erreur évitée avant la mise en ligne** : `plateformesPubliables` est un Set, je l'avais lu comme un tableau dans le
  stepper (`.includes`) : l'écran de publication aurait planté. Corrigé et gardé par `selftest:deduction-apprise`.
- **Déploiement pendant qu'un fork écrivait** : get-pending-jobs v258/v259 et update-job-status v142 ont pu embarquer
  un état intermédiaire des fichiers du lot 3 (pas-de-rouge, etat-job, description-leboncoin). Aucun 5xx, aucune erreur
  dans les journaux de 11:35 à 12:31 ; redéployés à 12:31 avec le code relu.
- **EAN** : « Ne s'applique pas » refusé par eBay (12:33) — corrigé par le texte officiel « Non applicable » (12:39),
  annonces en ligne à 12:44.
- **Copie non empaquetée de Nico** : non mise à jour en 0.6.126 (copie du build refusée par l'outil de permission) ;
  elle reste en 0.6.124.

## Choix pris sans Nico
1. Relance unique des bordereaux de Louis **différée** à la 0.6.126 (impossible avant) et bornée au 26/10.
2. Plus aucune génération Vinted servie à une extension d'avant la 0.6.126 (sinon : nouvel échec chez Vinted).
3. Plafonds IA : 6/120, 9/160, 14/185 $ (jour/mois) par niveau — sous 200 $ avec 15 $ de marge au pire.
4. Correspondances apprises en fantôme seulement ; seuils de bascule et de retour arrière écrits dans la migration.
5. EAN eBay sans code-barres : « Non applicable » (texte officiel eBay France) au lieu de « Ne s'applique pas ».
6. Détection des ventes Beebs livrée éteinte (forme non prouvée).
7. Plafond de 4 h de l'éveil non touché (décision passée de Nico).
8. 0.6.125 inscrite comme publiée (preuve : 15 comptes) ; le minimum reste à la 0.6.124 (ordre reçu).

## Ce qui reste à Nico
- **Téléverser** `build\CWS-0.6.126-A-TELEVERSER\fillsell-extension-0.6.126-7920a40-cws.zip` (zipper n'est pas
  nécessaire : c'est déjà le zip) et « Envoyer pour examen ». Après acceptation (Claude le fera) : `ALREADY_PUBLISHED` +
  éventuellement `EXTENSION_MIN_BUILD = 2026-10-18T10:56:25Z`.
- Répondre à Louis (§ 6, texte prêt) — FillSell n'envoie rien.
- Décider : plafond de 4 h de l'éveil (lot 5), vente déclarée Beebs « Ailleurs » (lot 4, C2).
- Rien d'autre à taper ni à vérifier : la relance de Louis, la bascule des champs appris et la pause d'hu.anastasia
  se font seules ; Claude relit le 19-20/10 (`deduction_bascule.mesure`, `ventes_beebs_commandes`,
  `bordereaux_relances_autorisees`).
