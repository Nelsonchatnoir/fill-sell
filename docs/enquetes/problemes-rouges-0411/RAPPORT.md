# Problèmes rouges du 04/11 — huit points

Heure de Paris. Aucune donnée client recopiée ici au-delà des pseudos donnés par Nico ; les numéros de job sont abrégés.
Enquêtes en lecture seule (base de prod en `--read-only`), code corrigé par RÈGLE, selftests étendus.

## 1. Attente croisée Beebs (9cdr9rm4rn, Pro) — « Pyjama 36 mois » et « Ensemble 9 mois », 03/11 15:22

**Cause (lue en base et dans le code)**
- `spend_coins_and_republish` (SQL, prod, md5 `bd1d4dfb…`) crée une republication en recopiant les platform_fields du
  dernier dépôt « published » (la republication précédente), moins une LISTE NOIRE figée au 17/10. Aucune trace de
  retrait posée depuis n'y figurait : `republish_suppression_envoyee`, `suppression_non_prouvee`, `preuve_retrait`,
  `republish_retrait`, `retenue_*`, `recreation_*`, `error_technique`… Même trou dans le miroir JS
  (`_shared/photos-lbc-amputees.js`, republier-photos-lbc).
- Deux juges différents : l'extension jugeait SON marqueur au numéro (`suppressionDejaEnvoyee` : hérité = « pas le
  mien » → le job passait par le garde-fou) et celui des AUTRES à sa seule présence
  (`republish_suppression_envoyee=not.is.null`). Côté serveur, `retraitEngage` (présence seule) exemptait les deux.
  Pyjama (marqueur 34174560 du 18/10, annonce actuelle 34199633) et Ensemble (34174206 / 34199441) se sont donc
  retenus l'un l'autre ; fausses alertes « hors ligne sans recréation » au support le 04/11 à 10:09 et 10:15.
- Exposition : 0 job ouvert ce soir avec un marqueur hérité ; 31 dépôts « published » (30 Beebs sur 7 comptes,
  1 Depop) portent un marqueur d'un autre numéro et seraient recopiés à leur prochaine republication — dont le
  Pyjama (le nettoyage du 04/11 n'a touché que l'Ensemble).

**Règle (toutes les plateformes qui ont ce garde-fou : Leboncoin, Beebs, Depop ; Vinted construit déjà à neuf)**
- (a) Une republication neuve n'hérite d'AUCUNE trace de retrait : `republication_sans_traces(pf)`, règle PAR
  PRÉFIXES (`^(republish_(suppression|retrait|reprise|etat)|republished_|suppression_|preuve_retrait|retrait|retenue_|
  deleted_|recreat|old_|new_listing|orphan_|delete_|deja_absente|beebs_404_|error_technique)`), PUIS la liste d'avant.
  Mesuré sur 8 000 sources « published » : les préfixes n'attrapent que des traces. Migration
  `20261104210000_republication_sans_traces_de_retrait` (preuve jetable `scripts/preuve-republication-sans-traces.mjs`
  7/7, corps compilé) — **NON APPLIQUÉE** (feu vert de Nico). Miroir JS `TRACES_DE_RETRAIT_RE`
  (`_shared/retenue-creneau.js`) dans republier-photos-lbc.
- (b) Un seul juge, serveur ET extension : un marqueur est HÉRITÉ (donc muet) sur DEUX preuves — il nomme une annonce
  qui n'est aucune de celles du job (numéro, lien, ancien numéro / lien, capture) ET il date d'avant la naissance du job.
  Tout le reste retient comme avant (marqueur sans annonce, numéro actuel, job sans numéro, naissance inconnue, marqueur
  écrit après la naissance, étape « deleted »). Même règle pour la trace écrite « Suppression envoyée à … » (une erreur
  archivée ou technique d'avant la naissance n'est pas la sienne). `suppressionEnvoyeeHeritee`, `retraitEngage`
  (`_shared/retenue-creneau.js`), copies dans `background.js` (`suppressionDejaEnvoyee`, `retraitEngageJob`) et
  `etat-job.js` (régénéré). Le garde-fou de l'extension juge les autres avec le MÊME juge que soi.
- (c) Filet du cycle : un frère à l'étape « captured » qui porte une retenue posée derrière CE job ne le retient pas si
  ce job est le plus ancien (`jePasseDevant`) ; date illisible → on attend ; jamais pour un frère à l'étape « deleted ».
- handler-watch : plus d'alerte « hors ligne » sur un marqueur hérité.

## 2. Timeouts Vinted chez gjehly (Business) — « L'onglet de dépôt n'a pas répondu »

**Cause (ses données : 42 republications publiées, 27 en file, ≥ 59 essais ratés le 04/11)**
- Pas un délai de remplissage : c'est l'OUVERTURE de l'onglet de dépôt (`getOrCreateWorkTab`). Motif archivé :
  « le content script ne répond pas, ni après rechargement puis onglet neuf, ni fenêtre de travail visible ».
- Le poste est lent : ouverture médiane 85 s (12 à 164 s) contre ~7 s sur le parc (19 comptes, 310 republications du
  04/11) ; photos 6,6 s contre ~2,5 s ; retard des minuteurs 5,9 s contre ~1 s. Pas un gel Chrome (frozen=false).
- Et notre règle était inadaptée : la page était jugée à 10 s (8 s si un ping restait sans réponse), puis RECHARGÉE
  et REMPLACÉE toutes les ~20 s — aucune page n'avait le temps de finir. Les réussites tombent exactement sur les
  instants de ping ; le modèle reproduit les 138 s des échecs. « Un sur deux » = la cadence (une republication toutes
  les ~6 min, échec reprogrammé à +5 min). Rien n'est retiré : tout se passe avant le moindre envoi à la page.

**Règle (extension, tous les postes)** : le poste apprend sa vitesse — l'âge de la page au premier « pong » (ou l'âge
atteint quand tout a échoué) est noté par plateforme (`fillsell_reveil_onglet`, 10 dernières mesures,
chrome.storage.local). La PREMIÈRE page reçoit une patience de 1,5 × le 80e centile, plafonnée à 90 s, seulement à
partir de 3 mesures et si elle dépasse 20 s : un poste rapide (mesures de 5 à 10 s) garde exactement la règle d'avant.
Pendant l'attente rien n'est envoyé à la page (aucune suppression possible). `patienceApprise`,
`contentScriptRepondSurOnglet({ jusqua })`, `relancerOngletMuet` rend `depuis` (`selftest:onglet-muet-partout`).

## 3. Marc (thecloset72000, Pro) — eBay « Cette opération n'est pas autorisée pour les objets de l'inventaire »

- Confirmé (capture de Marc + doc eBay) : « Currently, listings created through the Inventory API cannot be edited
  through Seller Hub or any other listing platform. Any revisions must be done through the Inventory API. »
  (developer.ebay.com/api-docs/sell/inventory/overview.html). Aucun retour possible Inventory → Trading
  (bulkMigrateListing va dans l'autre sens). Touche TOUS les vendeurs : 1 018 annonces eBay en ligne publiées par l'API,
  51 comptes.
- Existant : « Modifier sur eBay » (menu « … » du Stock, 30/10, `ebay-account` `modifier_annonce`) : titre, description,
  prix seulement. Utilisé une fois sur le parc.
- Chiffrage :
  - a) garder l'API Inventory, tout modifier depuis l'app (caractéristiques, photos ; `lire_annonce` + PUT de l'article
    et de l'offre) et remplir plus de caractéristiques à la publication (lignes « Libellé : valeur » de la description,
    mots sûrs du titre : Vintage, W/L, 22W, Made in…) : ≈ 800-1 100 lignes, ≈ 4 jours ;
  - b) publier par l'API Trading : ≈ 1 500-2 000 lignes, 8-12 jours + rodage ; ventes inchangées (legacyItemId), mais
    retraits, republications, stock et conditions de vente à brancher, refus à relever en réel, DEUX voies pour toujours
    (les 1 018 annonces Inventory restent Inventory), retouches faites sur eBay écrasées par une republication.
- Recommandation : a). **Validée par Nico le 04/11 au soir, codée** :
  - « Modifier sur eBay » modifie TOUT : titre, prix, description, caractéristiques (celles de la catégorie : obligatoires
    d'abord, liste fermée en choix, recalées à l'écriture d'eBay, une obligatoire jamais retirée) et photos (ordre,
    retrait, ajout, 24 au plus). Serveur : `ebay-account` `lire_annonce` / `modifier_annonce`,
    `_shared/ebay-modifier-annonce.ts` (`aspectsControles`, `lireAnnonceEbay`) ; la tâche suit (ebayAspects, photos).
  - À la publication, les caractéristiques que la personne écrit déjà sont lues (`_shared/ebay-aspects-du-texte.ts`) :
    lignes « Libellé : valeur », « vintage », « made in / fabriqué en », « W40 L30 », « 22W / grande taille »,
    « 5 poches », styles de jambe, « jean / denim » — toujours recalées sur la liste eBay, jamais par-dessus une valeur
    connue, jamais une taille, avant l'IA (un aspect obligatoire lu n'est plus demandé). Selftests
    `ebay-aspects-du-texte` (22) et `ebay-modifier-tout` (30).

## 4. eBay « compte pas prêt » chez un vendeur eBay actif (benjamin.ployer, Pro)

- Son compte : inscrit aux conditions de vente (Business Policies) mais 0 livraison / 0 paiement / 0 retours sur
  EBAY_FR ; scope `sell.account` déjà accordé. L'API Inventory exige les trois pour publier. Ses 2 tâches parquées
  `compte_pas_pret` / étape `conditions` (11:06, 11:34), annulées à 12:02.
- La contradiction est chez nous : l'app sait créer ces conditions (`activer_politiques`, `creer_politique`,
  `poser_livraison`), mais depuis la décision du 12/10 l'étape « conditions » envoie sur ebay.fr/bp/manage.
  24 comptes sur 161 reliés seraient dans ce cas aujourd'hui (14 non inscrits, 10 inscrits sans les trois).
- Proposition : bouton « Créer mes conditions eBay » dans l'app. **Validé par Nico le 04/11 au soir (remplace le
  12/10), codé** : `ebay-account` `proposer_conditions` (lecture seule : GetMyeBaySelling puis GetItem sur 3 annonces —
  transporteurs et prix, délai, retours, code postal et ville —, recalés sur les services qu'eBay FR accepte ; sans
  annonce lisible : Colissimo, 2 jours, retours 30 jours, prix VIDE à remplir) et `creer_conditions` (au clic :
  inscription aux conditions de vente si besoin, paiement, retours, livraison — nos politiques, adressées par leur nom —,
  relevé, publications parquées relancées) ; l'adresse d'expédition manquante par `platform_settings_fusionner`.
  L'étape « conditions » ne renvoie plus vers ebay.fr (message et carte : le bouton). Écran `src/stock/CreerConditionsEbay.jsx`.
  Limite : un compte jamais inscrit aux conditions de vente attend l'activation d'eBay (jusqu'à 24 h) ; la création le
  dit et se refait d'un clic.

## 5. Depop : refus « PayPal à relier » pris pour une erreur passagère (christophe.lanoux30)

**Cause** : Depop répond HTTP 400, code 1216 (« È necessario collegare un account PayPal… », italien chez tous les
comptes) APRÈS les photos, alors que canSell vaut true. Le connecteur le rendait en échec inconnu → pas-de-rouge
`inconnu_reprise` (3 reprises de 15 min) ; et l'essai arrêté à l'étape « creation » passait pour la PREUVE que le compte
vend (`controleVendeurPasse`) → toutes les publications retenues repartaient, remontaient leurs photos et reprenaient
le même refus. 60 jours : seul refus de création Depop (6 tâches, 3 comptes) ; le reste (session illisible, photos,
réponse perdue) n'est pas un refus.

**Règle** : un refus de création Depop qui demande un geste sur le COMPTE (`CODES_GESTE_COMPTE_DEPOP` = {1216}, ou le
mot PayPal) est le même mur que la configuration vendeur (une carte, un éclaireur au barème, aucune reprise), avec son
message : « Depop demande de relier un compte PayPal… Relie ton compte PayPal sur depop.com (Réglages › Paiements)… ».
Un essai arrêté sur ce refus ne prouve jamais que le compte vend (`vendeur_depop.paypal_le`), la sonde canSell non plus
tant que ce mur tient. Extension (étape `compte_paypal`, attente nommée), update-job-status (corrige aussi la 0.6.169),
get-pending-jobs (message du mur qui tient), handler-watch. Autres codes Depop « geste » : aucun vu en base ;
`needsReonboarding` (lu, jamais utilisé) et l'endpoint `paypal-agreement` restent à mesurer sur le compte de Nico.

## 6. Vinted « message channel closed » (smaillachkar, Free, inscrit le 03/11)

**Cause** : aucun écouteur défaillant. Vinted renvoie le formulaire `/items/new` vers `/terms_and_conditions?ref_url=…`
~3 s après son chargement (conditions d'utilisation à accepter, compte neuf) : la navigation détruit la page et ferme
le port du remplissage ; si le message arrive après, la garde de page disait « refus passager ». Seul compte en
60 jours ; « Basket Asics Gel-Lethal » : 5 erreurs archivées.

**Règle** : un geste de la personne, nommé — `vinted_conditions_a_accepter` (mur sans question, Relancer), jamais une
reprise. La page le dit avant sa garde (`vinted.js`), le background le lit sur l'onglet quand le canal se coupe
(`conditionsVintedAAccepter`), et update-job-status le nomme pour les postes d'avant d'après une adresse DATÉE de moins
de 5 min, postérieure à la dernière relance (`_shared/vinted-conditions.js`), jamais sur une republication dont le
retrait est engagé.

## 7. Photo HEIC refusée (romain.guerin85, 03/11 20:32, web)

**Cause** : dans « Créer une annonce », l'ajout de photos (`handleAddMorePhotos`) n'attrapait pas l'erreur ; heic2any
0.0.4 (dernière version, 2023, plus maintenue) a refusé le HEIC (« ERR_LIBHEIF format not supported ») : la photo et
les suivantes n'ont pas été ajoutées, sans un mot. Aucun HEIC en base ni dans le stockage aujourd'hui ; deux HEIC bruts
étaient passés par lens-temp le 26/09 (repli « original » du viseur Lens).

**Règle** : le format se lit dans les OCTETS (`_shared/format-photo.js`) ; un HEIC est reconverti CÔTÉ SERVEUR avant
d'entrer dans une fiche, donc avant tout envoi aux plateformes — fonction neuve `photo-heic-jpeg` (verify_jwt true) :
le HEIC posé un instant dans lens-temp, converti par la transformation d'images Supabase (source HEIC acceptée, aucun
décodeur ni CPU dans la fonction), sortie relue dans les octets, original effacé quoi qu'il arrive. heic2any ne reste
qu'en secours. L'ajout de photos saute et DIT une photo illisible ; le viseur Lens ne pose jamais un HEIC dans
lens-temp (`versFormatUniversel`). Essai réel (04/11, un HEIC public de libheif, 718 Ko) : `Accept: image/jpeg` → JPEG
475 Ko en 0,5 s ; avec WebP dans la liste, Storage rend du WebP (d'où « image/jpeg » seul). Fichier d'essai effacé.

## 8. Fiche de départ : des faits anonymes

`enregistrer_depart` (appelée par l'app juste avant tout effacement, seul point d'entrée) écrit
`departs_compte.activite` : par plateforme, publications / republications / retraits faits, tâches, annulées, en file,
voies, première et dernière action et mise en ligne (Paris, à la minute), nombre d'erreurs et les 3 dernières (action,
statut, heure, texte et diagnostic rendus anonymes). `erreur_anonyme` efface le titre, le numéro, le lien, l'e-mail et
le pseudo de la personne, tout ce qui est cité (« … », "…", même coupé), liens, e-mails et TOUS les chiffres, 160
caractères (des erreurs en base contiennent des adresses postales : « Adresse "Via …" »). Mesuré en prod (lecture
seule) sur le compte le plus chargé (4 915 tâches) : 228 ms. Migration `20261104200000_depart_activite_anonyme`
(preuve jetable `scripts/preuve-depart-activite.mjs` 25/25) — **NON APPLIQUÉE** (feu vert de Nico).
