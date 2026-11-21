# Lot du 21/11/2026 (Opus-1) — l'app et le Cloud nickel, puis la landing

Ordre de Nico (21/11 midi) : 8 points, à la racine, pour tous les vendeurs et toutes les plateformes ; aucune seconde
ajoutée par article ; zéro régression ; selftests + au plus un essai réel par point ; aucun mail client.
Heure de Paris partout.

## 1. Tailles Leboncoin (GRAVE)

### Ce qui était cassé (prouvé)
- **vetis.shop, 21/11 11:33** : robe « T5/50 » (taille Vinted « 5XL / 50 / 22 »), d'abord rangée « Baskets (femme) » chez
  Beebs et « Mode > Chaussures » chez Leboncoin → la pointure est demandée (usage_logs `champ_requis_bloquant`, 11:33:40).
  La grille des pointures Leboncoin finit par **« 50 et plus »** (pas « 50 ») : l'app disait « La grille de ce rayon va de
  16 à 49,5 : 50 n'y figure pas ». Le moteur a corrigé le rayon en « Mode > Vêtements » à 11:40:26 (406 s après
  l'affichage — point 2), publication Femme « 50 » partie à 11:40 sur Leboncoin seul (Beebs retiré).
  Et pire : la même taille « 5XL / 50 / 22 » sur un champ de pointure devenait la pointure **« 22 »**.
- **Les grilles « Taille » de Leboncoin dépendent de l'Univers** (lbc_grilles_relevees, 30 j) : Femme
  « 30 - XXXS … 50 - 5XL … 56 - 8XL et plus » (1 922 lectures), Homme **des lettres seules** (1 735), Enfant
  « 3 ans / 98 cm … 18 ans / 182 cm + » (1 126). Le catalogue des champs n'en garde qu'une (Femme). L'écran jugeait donc un
  homme « 50 » dans la grille femme (accepté), puis le serveur posait la question **après** la publication : 18 cas du 19 au
  21/11 (thecloset72000 « FR 52 » → répondu « 6XL », Ornella « EU 48 » → « M », thibault, assopmfrance…).
  ⚠ Chez Leboncoin, un vêtement **Homme** n'a pas « 50 - 5XL » : cette écriture n'existe que dans la grille Femme. Pour un
  homme, « 50 » reste une question (règle de Nico du 19/11 : jamais un nombre changé en lettre) — mais posée AVANT l'envoi.
- « 8XL » ne trouvait pas « 8XL et plus » ; « LG » (assopmfrance) n'était pas reconnu comme L.

### Ce qui est corrigé
- `_shared/lbc-grilles-univers.js` : la grille de l'univers, la même pour l'écran de publication, la carte du rayon et le
  serveur ; une copie qui porte une taille est jugée avant l'envoi (dans la grille : écrite comme Leboncoin l'écrit ; hors :
  la question à l'écran). Copie sans taille : rien de plus demandé.
- `_shared/tailles.js` : palier ouvert « X et plus » / « X + » ; LG/SM/MD/MED/XLG/XSM ; `porteUneLettreDeVetement`.
- `moteur/listes.js` : une taille de vêtement n'est jamais une pointure (et le dit : « vérifie le rayon ») ; plus jamais
  « va de 16 à 49,5 » face à « 50 et plus ».
- `lbc-taille-homme.js` (serveur) : le même vocabulaire (LG → L, 8XL → 8XL et plus).
- Contrôle automatique de nos listes : `_shared/controle-listes-plateformes.js`, section quotidienne d'ops-digest,
  `npm run controle:listes-plateformes` (lecture seule de la prod).

### Preuves
- `selftest:lot-2111-tailles` : 15 vérifications ; sur l'ancien code, les 5 cas sont faux (« 50 » refusé avec le message de
  vetis.shop, pointure « 22 », « 8XL » introuvable, « LG » → question, homme « 50 » sans question à l'écran).
- Essai réel (app locale sur la base de prod, WebKit isolé format iPhone, compte de démo test@fillsell.app, rien publié) :
  T-shirt homme, taille tapée « 50 » pour toutes les plateformes → Leboncoin « À régler », « « 50 » ne s'écrit pas tel quel
  sur Vinted · Leboncoin · Beebs : choisis une fois » (XS … 4XL) ; réponse « L » → Leboncoin « Prêt », « L pour Leboncoin
  seulement » ; « Seulement sur Leboncoin » + « 50 » → « Rien ne correspond » (la grille homme). Aucune erreur de page.
  Coût : 1 rédaction et 1 retouche du quota du compte de démo.
- Contrôle du 21/11 : grilles figées identiques aux dernières lectures ; 76 libellés enfant présents chez Vinted, Leboncoin et
  Beebs ; 16 champs Leboncoin à listes dépendantes (Maison & Jardin surtout) signalés.

### Ce qui reste
- Les 16 champs Leboncoin à listes dépendantes : le catalogue n'en garde qu'une grille (même défaut que les tailles) ; l'écran
  sait déjà en suivre 6 (Maison & Jardin, `lbcProduitsDependants`) — les autres sont à faire suivre de la même façon.
- Les annonces déjà publiées avec une taille fausse (thecloset72000 « FR 52 » → « 6XL ») : aucune correction à la main ;
  à décider par Nico (script de réparation).
- La robe rangée en « Baskets » : le choix du rayon (points 2 et 7).

## 2. Champs obligatoires : jamais un champ que le moteur va remplir
### Ce qui était cassé
- Pointure Leboncoin / Beebs (vetis.shop, 21/11 03:21 et 11:33, `champ_requis_bloquant`) : des ROBES rangées en chaussures
  (cause : URGENT Vetis ci-dessous) — une pointure n'est jamais demandée à l'IA, la question restait jusqu'à sa saisie (76 s).
- eBay « Style » / « Type » affichés en question, voie API : vetis.shop 21/11 03:13 (eBay décoché 3 s après) ;
  alisonbertincourt 20/11 23:54 (« publié sans eBay », champs « Style, Type »), alors que l'IA de l'écran les avait obtenus
  (`ebay_aspects_ia` 23:54:07, obtenus Style, Type) — et que le serveur les remplit de toute façon au dépôt (remplirAspects :
  IA sous la liste d'eBay, puis la valeur devinée).
### Ce qui est corrigé
- Pointure : à la racine (une robe ne part plus en chaussures, URGENT).
- eBay, voie API : un aspect exigé encore vide QUE LE SERVEUR DEVINE (liste d'au moins deux vraies options ; jamais l'identité,
  une taille, une mesure, un état, un format, un public — mêmes motifs que `aspectDevinable`, tenus égaux par le verrou) n'est
  plus une question et ne retient plus eBay : il part au dépôt (`src/publication/moteur/aspectAuDepot.js`). Marque, Modèle,
  Taille, Pointure, mesures, Département restent des questions. Voie extension : inchangée.
- Icône : « robe … style portefeuille », « jupe portefeuille » → 👗 (le mot qui suit un vêtement nomme la coupe), un vrai
  portefeuille reste 👛 (`src/utils/iconeObjet.js`).
### Preuves
- `selftest:lot-2111-ebay-au-depot` (31 vertes), `selftest:lot-2111-categories` (cas portefeuille), 49 verrous d'icônes et de
  catégories verts. Écran essayé sur le banc isolé (compte de démo, rien publié) : iPhone (WebKit), Android (Pixel 7) et web
  (1440 px) — matière tapée au clavier, étape 3 atteinte, eBay « Prête », aucune erreur de page.
### Ce qui reste
- Le compte de démo publie eBay par l'extension : la règle « au dépôt » (voie API) n'y est prouvée que par son verrou.
- Le filet des questions (45 s) reste tel quel : aucun cas mesuré où le moteur pose un champ après l'avoir montré, hors des
  robes en chaussures.

## 3. Republications Leboncoin arrêtées sur « Univers » (Butin d'Or)

### Ce qui était cassé
- 21/11 08:54 « Table à langer étagère ikea » et 09:36 « Chause haute balancelle 2 en 1 lionello » : pause AVANT tout
  retrait, « Leboncoin exige « Univers » ». Relu : leurs annonces en ligne n'ont **aucun** Univers (publiées avant que
  Leboncoin l'exige) — il n'y avait rien à reprendre ; et le serveur ne relançait jamais une republication Leboncoin arrêtée
  avant retrait, même complétée (seul Vinted avait ce chemin).
### Ce qui est corrigé
- Le champ exigé se lit dans la structure de Leboncoin : la liste « Produit » dépend de l'« Univers » (relevés de chaque
  dépôt). « Table à langer » n'existe que sous « Hygiène et Santé » → posé, et la republication repart d'elle-même (annonce
  toujours en ligne, le pré-vol rejoue le formulaire avant tout retrait). Seulement pour une republication arrêtée sur un
  champ à choisir : aucune lecture de plus pour les autres.
### Preuves
- `selftest:lot-2111-lbc-champ-deduit` (6) sur les listes réelles relevées le 21/11.
### Ce qui reste
- « Porte-bébé et écharpe de portage » : l'univers « Mobilité » n'a jamais été relevé chez Leboncoin → reste la question
  (aucune valeur inventée). Sa couverture viendra avec les dépôts. Une voie complète : l'extension qui essaie chaque univers
  proposé dans le formulaire jusqu'à celui qui porte le produit (nouvelle extension, essai réel à faire).
- Le cas de Butin d'Or se réparera par ce circuit au prochain passage de son poste après le déploiement de get-pending-jobs
  (la table à langer) ; la balancelle reste une question.

## 6a. La carte du Stock de Louis (« Leboncoin : pas connecté »)
- Cassé : la tuile ne lisait que le dernier relevé demandé à la main ; le relevé fait par le Cloud au retour de la connexion
  était filtré comme « veille », et le mur « pas connecté » se déduisait d'un vieux relevé, sans lire le coffre du Cloud.
- Corrigé : pour un compte Cloud, une plateforme connectée au Cloud montre son dernier relevé réussi (tous déclencheurs),
  sinon « ✓ connecté » ; jamais « pas connecté ». Preuve : `selftest:lot-2111-cloud-sans-chrome` § 4. Reste : l'essai à
  l'écran sur un vrai compte Cloud (le compte de démo n'est pas au Cloud) — essai de non-régression fait sur le Stock et sa
  carte (compte ordinaire) : affichage inchangé, aucune erreur de page.

## 6b. Aucun message d'un compte Cloud ne parle de Chrome
- Cassé (linda) : la restriction Vinted écrite par l'extension (« ouvre vinted.fr dans Chrome pour voir ce que Vinted
  demande ») perdait au Cloud sa phrase entière, remplacée par « FillSell Cloud réessaie tout seul ; si ça bloque encore,
  relance-la » ; la file des tâches, la republication programmée et l'onglet Stock gardaient 6 textes « dans Chrome ».
- Corrigé : la restriction dit « ouvre l'app Vinted ou vinted.fr, depuis ton téléphone, pour voir ce que Vinted demande » ;
  les 6 textes ont leur version Cloud ; filet final sur la file des tâches. Essayé puis retiré : traduire le texte en base
  à l'écriture (le serveur reconnaît des tâches par le début de leur texte — « En attente de ta connexion à »).
- Preuve : `selftest:lot-2111-cloud-sans-chrome` § 1-3. Reste : les messages serveur anti-robot (`ANTIROBOT_COMPTE_MSG`)
  sont comparés tels quels par le serveur : traduits à l'affichage seulement (déjà le cas dans l'app).

## 7. Catégories Vinted
- Cassé : « Pull » d'une femme → « Maison › Animaux › Chiens › Vêtements & accessoires › Pulls » avec certitude (la feuille
  sans genre passait toujours, les pulls enfants étaient écartés par le genre) ; assopmfrance (19/11) : « Accessoires de mode
  › Pochettes de costume » servi alors que Vinted lui avait accepté « Femmes › Accessoires › Lunettes de soleil » le 08/11.
- Corrigé : un genre de personne n'accepte jamais une feuille Animaux (5 pulls femme en candidats) ; l'arbre Vinted du compte
  se lit aussi dans les chemins que Vinted a acceptés pour lui (→ « Hommes › Accessoires › Pochettes de costume »).
- Preuve : `selftest:lot-2111-categories` (6), sur l'arbre Vinted réel. Reste : la robe de vetis.shop rangée « Baskets » chez
  Beebs et Leboncoin (moteur corrigé 406 s plus tard) — point 2.

## 5. Cloud : captcha sans bouton (Muriel, 0c97dc8b)
- Cassé : glissière Beebs à 11:19 → « revenue » → aucun bouton, « résoudre » refusé par l'orchestrateur, aucune
  notification (aucun appareil push), aucun mail ; Beebs arrêté, 15 dépôts en file. (Opus-2, b428fcd, 13:13 : une
  vérification passée seule n'est plus une résolution → la sienne est redevenue une glissière, avec son bouton.)
- Corrigé : bouton « Résoudre » pour « à résoudre » ET « revenue » (app + orchestrateur) ; la cliente est prévenue une fois
  par incident (nouvelle fonction push-cloud-verification : push, puis mail de repli si aucun push reçu). Le mail est
  PRÊT mais COUPÉ (`coin_config.cloud_verification_mail` absent) : aucun mail client sans ton ordre — un mot pour l'allumer.
- Preuves : `selftest:lot-2111-cloud-verification` (7), test serveur « prévenue une seule fois » (23/23 verifications),
  `selftest:cloud-me-connecter` (80). Reste : l'essai réel sur un compte Cloud (le compte de démo n'est pas au Cloud) ;
  l'orchestrateur à redéployer au calme pour que le bouton « revenue » et la notification soient en service.

## 4. Republications Vinted d'annonces parties
- Cassé (Doriane 09:21, gilet sherpa) : 5 republications « manuel » du 18 au 21/11 d'une annonce jamais revue depuis le 10/11
  (23 relevés complets en 3 jours), chacune close « n'est plus en ligne » — et reproposée chaque jour par l'app.
- Corrigé (app) : une annonce Vinted vendue/close, ou close « disparue » sans relevé ni publication depuis, n'est plus proposée.
  Preuve : `selftest:lot-2111-republication-vinted` (5). Reste : la même règle côté cron (migration prête, feu vert à demander).

## 8. Depop : frais de port à l'international (demande de Sébastien64310)
### Ce qui était cassé
- Seul le port France existait (`platform_settings.depop.frais_port_defaut`) ; l'extension n'envoyait que
  `national_shipping_cost` : impossible d'offrir l'envoi hors de France.
### Ce qui est corrigé
- Réglages › Expédition › Frais de port Depop : « Envoi à l'international (facultatif) » — vide = France seule (comme avant),
  jamais une question ni une erreur ; écrit par `platform_settings_fusionner` (`frais_port_international`).
- get-pending-jobs le pose sur chaque tâche Depop SERVIE (`depopPortInternational`, dans la lecture du profil déjà faite,
  aucune écriture en base) ; l'extension 0.6.197 l'envoie (`international_shipping_cost`, 0 à 99,99 €), une plus ancienne
  l'ignore ; illisible → rien d'envoyé, jamais un refus.
- Nom du champ : relevé le 21/11 dans le code public de Depop (`national_shipping_cost` et `international_shipping_cost`
  côte à côte ; formulaire : `internationalShippingCost`, facultatif, < 100).
### Preuves
- `selftest:lot-2111-depop-international` (21 vertes : réglage, pré-vol de depop.js exécuté, corps envoyé, serveur, écran).
- Écran essayé (banc isolé, compte de démo, Depop simulée ouverte pour le banc seulement) : iPhone, Android et web — 12,50 tapé,
  enregistré, vidé sans message d'erreur, retiré ; réglages du compte de démo revenus à vide.
### Ce qui reste
- Essai réel sur Depop (une annonce TEST à 999 € avec l'international) : il faut une session Depop de Nico dans Chrome.

## URGENT (Nico, 21/11 après-midi) — Vetis Shop : robes rangées en chaussures ; matière vide
- Cause (base, `cross_post_jobs.platform_fields`) : `categorie_chaussure_malgre_le_mot` = règle `pointure_contre_mot_vetement`,
  preuve « le texte du vendeur parle de pointure » (sa signature « rangés par tailles ou pointures »), contre `mot_ecarte` robe et
  `categorie_objet_ia` robe ; `categorie_verification` « confirme » baskets.
- Corrigé pour tous : un mot isolé du texte n'est jamais une preuve ; titre + objet = vêtement → jamais une chaussure ; la
  vérification ne confirme jamais des chaussures contre eux ; même principe pour le vêtement traditionnel eBay.
- Matière : jamais VIDÉE par FillSell — elle n'a jamais été LUE pour ses robes importées de Vinted (rédaction sur le seul
  texte, 0 image ; sa description renvoie à l'étiquette en photo ; notre lecture de l'annonce Vinted ne relève pas « Matière »).
  Les fiches où elle a saisi une matière (« polyester ») la gardent. Réparation : lire la matière de l'annonce Vinted (extension).
- Matière, corrigé pour tous (21/11, extension 0.6.197 + app + get-pending-jobs) : la page publique Vinted porte la matière en
  clair (`{"code":"material","data":{"title":"Matière","value":"Polyester"}}`, relu sur une de ses robes) ; l'extension la lit
  (`lireFluxNextVinted`, et le JSON-LD) et la pose sur la fiche (`attributs.matiere`, source `vinted_detail` : une matière
  saisie à la main gagne toujours) ; l'app aussi, et l'écran qui s'ouvre la voit tout de suite (`attributsAjoutesEnMemoire`).
  Une lecture faite par un lecteur d'avant (sans `lecteur: 2`) est refaite UNE fois en lecture de fond, par un poste ≥ 0.6.197,
  au rythme habituel (jamais pendant une publication). Ses 918 fiches sans matière : remplies à la prochaine lecture de leur
  annonce (une publication les relit) ; la lecture de fond n'est ouverte qu'aux pilotes (`coin_config.lecture_fond_mode` absent
  = 1) — l'ouvrir plus largement est une décision de Nico. Verrou : `selftest:lecture-matiere-vinted-2111`.
