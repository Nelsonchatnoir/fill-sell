# Nuit du 25 au 26/10 — refonte de la publication en lot + « zéro rouge de notre fait » (heure de Paris)

Prompt de nuit de Nico (25/10, 22:00). Ce fichier se remplit point par point ; le résumé pour Nico est en tête à la fin.

## 0. Proxy IPRoyal — FAIT
- Commande **#83578416** (ISP Dedicated, France, 1 IP, 30 jours : la même offre et le même compte qu'au 26/09) prolongée
  le 25/10 vers 22:05 depuis le tableau de bord IPRoyal (session déjà ouverte dans Chrome).
- Payée sur le **solde IPRoyal** (choix de Nico, demandé avant de payer) : **5,40 $** ; solde 16,00 $ → 10,60 $.
- Nouvelle échéance : **25/11/2026 à 11:19 (heure de Paris)** — relue par l'API (`expire_date` 2026-11-25 10:19:21 UTC,
  `extended_history` : la période du 26/09 au 26/10). Renouvellement automatique : toujours coupé (inchangé).

## 1. Refonte de l'étape 2 du lot — MAQUETTES (code de la refonte après la validation de Nico)
- Page **https://fillsell.app/demo/lot** : non listée, noindex, réservée au compte de Nico (toute autre session repart
  sur l'accueil) ; ses 32 articles sont lus avec sa session, les états sont simulés, rien n'écrit ni ne publie.
  Trois propositions (`?p=A`, `?p=B`, `?p=C`), la même feuille d'article pour les trois :
  - **A · La liste** — au lieu d'une grande carte par article, une ligne par question avec ses réponses en puces ;
    un seul « Tout valider » pour les textes ; les prêts repliés.
  - **B · Par question** — les questions rangées par sujet (toutes les tailles, puis les âges…) ; une réponse sert à
    plusieurs articles quand leurs listes sont les mêmes.
  - **C · Une à la fois** — une seule question à l'écran, en grand, avec la photo ; la suivante arrive dès la réponse.
- Banc : `node scripts/apercu/capture-maquettes-lot.mjs <lignes.json>` (lignes lues hors dépôt) — 390 px (2x) et 1280 px,
  contrôles : 32 cases, bilan exact, « Tout valider », feuille, cibles ≥ 44 px, champs ≥ 16 px, aucun débordement,
  aucune erreur de page : tout vert.

### 1b. Les défauts de fond vus sur l'écran de Nico — corrigés à la règle (commit du point 1)
- **Le livre « EAT »** : il A un ISBN, écrit sur sa fiche (« ISBN 9782981413604 », clé valide). La rédaction l'avait
  retiré de la copie, et l'app ne lisait QUE la copie ; puis les photos ont donné un faux numéro (« 9782897763 »,
  rejeté à raison). La question « cette catégorie n'accepte que « Ce livre n'a pas d'ISBN » » venait d'une liste à une
  valeur fabriquée par notre code : « Oui, confirmer » aurait publié sans ISBN un livre qui en a un. Corrigé :
  `resoudreIsbn` lit tous les textes, la fiche d'abord (deux ISBN différents → la question) — app ET serveur
  (get-pending-jobs) ; la ligne ISBN n'est plus traitée comme « la seule valeur acceptée » : elle garde sa vraie
  question (le numéro se tape, ou « Ce livre n'a pas d'ISBN » en un geste). Pour EAT : la question disparaît.
- **La montre G-Shock** : le rayon est le bon. Chez Beebs (et Vinted), la « Taille » d'une montre est le diamètre du
  boîtier (Jusqu'à 30 mm … 47 mm et plus) + « Taille unique ». L'IA y posait une valeur sans source
  (« 39 mm - 42 mm ») dans un canal que beebs.js ne lit pas, et le sélecteur partagé redemandait la taille. Corrigé :
  diamètre écrit (« boîtier 42 mm », « 45 mm de diamètre ») → sa tranche ; sinon « Taille unique », posée sur la copie
  (Vinted et Beebs) ; une taille ne part plus jamais à l'IA (même avec un champ dédié : la bague d'Elodie a reçu
  « 22,6 mm » de la même façon) ; sur Beebs, une valeur dans un canal sauté par l'extension n'est plus une valeur.
- **Le robot aspirateur** : l'arbre Beebs (579 feuilles) n'a AUCUN rayon pour un aspirateur (Petit électroménager =
  5 feuilles de cuisine) : aucune proposition honnête n'existe. Corrigé : sans candidat, la carte dit « Aucun rayon
  Beebs ne correspond à … » et propose « Pas sur Beebs » en un geste (même pour un article qui n'a que Beebs : il sort
  du lot) ; avec des candidats, les 3 premiers en puces ; la recherche vide ne s'ouvre plus d'office.
- **Le téléphone** : la marque était connue (Samsung). La liste « Modèle » relevée chez Vinted est celle d'Apple (le
  champ dépend de la marque, notre relevé ne la porte pas) : 50 iPhone servis à un Samsung. Corrigé : une liste de
  modèles Apple ne se propose qu'à un article Apple ; ailleurs le modèle se tape (l'extension le cherche dans la liste
  de SA marque). Reste : une vraie recherche dans toute la liste Vinted exige de relever les modèles PAR MARQUE
  (extension) — non fait cette nuit. « Espace de stockage » reste une vraie question (aucune source), en puces.
- **Titres coupés** : le titre du texte qui part est un champ de 2 lignes (plus une ligne qui le coupe).
- Selftest neuf `lot-defauts-2610` (36 contrôles) ; `livre-isbn-vinted` suit le nouveau code (43 contrôles).

### 1c. Le design B « Par question » — CODÉ (validé par Nico le 25/10 au soir)
- L'étape 2 du lot, hors envoi : le bilan en haut (prêts · à revoir · annonces, une case par article), UN « Tout
  valider » pour les textes écrits par FillSell (leurs vignettes ouvrent chacune sa feuille ; « Annuler » ensuite),
  puis les questions RANGÉES PAR SUJET (« Taille · Beebs », « Âge · Beebs »…, les plus nombreux d'abord), chacune
  répondue en un geste, en puces (≥ 44 px), par le MÊME bloc que le stepper (`BlocQuestions seulement`) ; la réponse
  commune se range dans son sujet ; « Le même poids pour les N » dans le sujet du poids. Ensuite la Livraison du lot,
  repliée (ouverte d'office en « Saisir le poids »), les refus Depop, les réponses reprises, et les prêts repliés.
  Toucher un article ouvre SA feuille (la carte d'avant : son texte, ses plateformes, « Pas sur … », « Le garder pour
  plus tard »). Pendant l'envoi : l'écran d'avant, inchangé.
- Aucune règle réécrite : les questions sont celles que le moteur compte (`clesQuestions`, exportées par le pilote) ;
  deux tailles = une question (comme le stepper). Dans une ligne, la phrase « Exigé … » répétée sous chaque article
  disparaît ; ce qui informe reste (valeur hors liste, où trouver l'ISBN, valeur lue).
- Garde-fous : un moteur qui lève ne met de côté que SON article (même barrière qu'avant, jamais tout l'écran) ; les
  prêts repliés restent rendus sous leur barrière ; un article à revoir a toujours une ligne (« À vérifier » ouvre sa
  feuille), sauf le texte seul que porte « Tout valider ».
- Preuves : selftest neuf `lot-par-question` (39 contrôles) ; banc `capture-lot-publication` (27 écrans à 390 px,
  2 à 1280 px : bilan, sujets, feuille, textes validés, poids saisi, article cassé) tout vert ; suite complète
  (441 selftests) verte ; `build:essai` OK. Le nombre de questions du lot de Nico avant/après : point 16.
- **Le critère de Nico, rejoué** (26/10 à 01:12, son compte, « Publier 32 articles », 5 plateformes, rien envoyé) :
  **11 questions bloquantes avant (25/10, 20:59) → 8**. Disparues, source fiable : la montre (« Taille unique »), le livre
  (âge Beebs), l'ISBN de « EAT » (lu sur la fiche). En UN geste (puces) : Produit Leboncoin ×2 (photo-audio, jouets),
  Taille Beebs (gants enfant), « Pour qui » ×2 (le Scotch, Vinted et Beebs), Support Leboncoin (les bobines, rangées en
  DVD-Films), Espace de stockage (le téléphone). **Reste à taper : le Modèle du téléphone Samsung** — aucune liste fiable
  (il faudrait relever les modèles Vinted marque par marque, côté extension : non fait). Hors des 11 (rayons) : Depop ×6
  « Pas sur Depop » en un geste, Beebs ×4 en puces. Trouvé au rejeu et corrigé (57f2484) : une réponse commune
  « Ce livre n'a pas d'ISBN » proposée pour 2 livres dont « EAT » — un geste aurait effacé son ISBN.

## 12. Valeurs fausses dans les copies stockées — FAIT (ces 5 cas seulement)
- Script `scripts/reparations/20261026_copies_valeurs_fausses.sql` : simulation (transaction annulée) à 23:13, puis
  appliqué à **23:14:42** ; sauvegarde `_backup_2610_copies_valeurs_fausses` (5 copies + 3 fiches) ; inverse
  `20261026_copies_valeurs_fausses_INVERSE.sql`. Garde : chaque ligne devait porter la valeur d'avant attendue.
  | compte | annonce | copie (job source) | avant → après |
  |---|---|---|---|
  | chaouidz | Leboncoin 3294638238 | e7f181c8, `taille` | 16 → 31 |
  | chaouidz | Beebs 34229052 | 29f9116e, `taille` | 16 → 31 (correction tracée) |
  | louis-seller | Beebs 34200707 | ff37632d, `age` (+ fiche) | 8 ans - 12 ans → 16 ans et + |
  | josephinecerni | Beebs 33904993 | f8807f54, `age` (+ fiche) | 8 ans - 12 ans → 16 ans et + |
  | voirememe | Beebs 34174205 | 72d8c9aa, `age` (+ fiche « 8 ans - 12 ans ») | 2 ans - 3 ans → 3 ans - 4 ans |
- Les fiches (âge) : corrigées aussi (l'écran Publier relit la fiche) ; source « manuel » = le seul rang que la fusion
  des attributs laisse passer devant un relevé — « par » et « motif » disent que c'est ce script.
- ⚠️ chaouidz sur Beebs : à la republication, l'extension relit l'annonce et pose d'abord la taille AFFICHÉE (« 16 »).
  La correction est tracée (`correction_tracee`) ; elle passe devant la valeur affichée avec la nouvelle extension.
- Les 26 autres livres de louis-seller : non touchés. Aucune annonce en ligne modifiée, aucun job relancé, aucun mail.

## 2. Republication : confirmation perdue, fausse alerte, reprise en tête
- **2a — nerema75, 259e97c8 (Vinted)** : retrait ET envoi de la nouvelle annonce à 19:44 (une-passe, 0.6.141) ; le
  worker de l'extension qui attendait la confirmation a disparu entre 19:44:17 et 19:45:21 (PROUVÉ par les journaux ;
  POURQUOI Chrome l'a arrêté : non prouvé, compatible avec l'arrêt d'un service worker MV3 pendant la pause du
  remplissage). L'annonce était en ligne (relue à 20:27, publiée, aucun doublon). 6 cas de cette signature en 14 jours,
  tous confirmés après 15 à 51 min. Correctif serveur (allumer le port de remplissage pour la une-passe Vinted) : NON
  FAIT — il ajoute ~260 sessions de remplissage par jour au keepalive : **décision de Nico**. Filet côté extension :
  voir la 0.6.146.
- **2b — l'alerte « hors ligne sans recréation »** : elle ne regardait que l'âge du retrait (> 30 min) — 11 alertes
  Vinted sur 15 en 14 jours tombaient sur une copie déjà en ligne, et la personne lisait « ton ordinateur s'est arrêté
  juste après le retrait », faux. Corrigé à la règle (`_shared/alerte-orpheline.js`, handler-watch) : rien renvoyé
  depuis le retrait → l'alerte, comme avant (la vraie orpheline de Sébastien reste) ; un envoi parti → pas d'alerte
  tant qu'aucune relecture POSTÉRIEURE n'a dit « pas de copie » (puis 30 min sans renvoi) ; envoi jamais vérifié en
  6 h → l'alerte « remise en ligne non vérifiée » (jamais une attente sans fin). Le mail au support dit le motif. À la
  personne : « Reprise après interruption : le retrait et l'envoi de ta nouvelle annonce sont partis à 19:44, puis ton
  ordinateur ou Chrome s'est arrêté avant la confirmation… FillSell vérifie qu'elle est bien en ligne, avant tout
  nouvel envoi ». Selftest neuf `alerte-orpheline` (16 contrôles, les cas réels du 25/10).
- **2c — Sébastien, 1ab00947 (Beebs)** : retrait 18:30, PC éteint à 18:34 pendant l'attente de 2 à 5 min avant le
  redépôt. À la réouverture, le redépôt part EN TÊTE de file (règle déjà en place, vérifiée) — rien changé.

## 8. « Annonce introuvable » alors qu'elle n'est pas prouvée absente — la pause a maintenant une issue
- **Lohan, c0b2d27f (Vinted, @woodenbridge)** : PROUVÉ — chaque relevé de @woodenbridge suivait un relevé de @lo160 ;
  l'extension le notait « changement de compte », et toute note « disparitions non marquées » écartait le relevé :
  jamais « complet », la pause n'avait pas d'issue. Corrigé (`_shared/introuvable-a-confirmer.js`) : sur Vinted, les
  notes de PÉRIMÈTRE (changement de compte, premier relevé, référence d'un autre compte, compte inconnu) n'écartent
  plus un relevé complet de LA boutique de l'annonce ; les notes d'incomplétude (run repris, relevé incomplet,
  effondrement, sans recoupement) l'écartent toujours.
- **Sébastien, 9da0fca5 (Beebs 34232713)** : PROUVÉ pas en ligne (absente du relevé complet de 16:38, aucune réponse de
  l'index Beebs) ; refusée ou retirée : non prouvé. Défaut : sans trace de relevé, seuls les relevés d'APRÈS la
  lecture ratée comptaient. Corrigé : la publication par FillSell de CE numéro sert de dernière vue (Vinted, Beebs) ;
  il faut toujours deux relevés complets sans elle, dont un après la lecture. Pour ces deux pauses : le prochain relevé
  de la bonne boutique tranche (handler-watch le demande déjà, poste en ligne).
- Une annonce revue en ligne repart toujours d'elle-même ; rien n'est jamais retiré par cette règle. Non fait : une
  borne d'horloge de 72 h sans démenti (aujourd'hui : 72 h d'extension ouverte, puis un message) — décision de Nico.
- Selftest `introuvable-a-confirmer` : 100 contrôles (18 neufs, les deux cas réels).

## 5. Leboncoin refuse « WWE 2K20 – PS4 » (xxewwer, 52b5ec71) — la modération n'est plus jamais « à toi »
- PROUVÉ : la catégorie est la bonne (Électronique › Jeux vidéo, la même feuille que « Call of Duty Black Ops 4 – PS4 »
  publié par le même compte à 17:40, et cinq autres jeux le même soir) — ce n'est PAS une règle des jeux vidéo. La
  modération a refusé la DESCRIPTION (adsubmit 403, champ body : « Nous refusons ce type de bien ou service sur
  leboncoin.fr » · « Le bien que vous essayez de vendre ne respecte pas nos règles de diffusion »), cinq fois à
  l'identique de 18:49 à 19:51, puis « Corrige le titre ou la description dans la fiche, puis relance ». La même
  description est en ligne sur Vinted, eBay et Beebs. La phrase exacte : NON PROUVÉE (candidats : « Document
  publicitaire WWE Network », « Carte promotionnelle WWE SuperCard », jamais vus dans une annonce Leboncoin acceptée).
- Corrigé à la règle (pas-de-rouge, update-job-status, handler-watch, état, file, cause) : un refus de contenu
  Leboncoin est classé dès la PREMIÈRE remontée (plus jamais cinq dépôts identiques) et n'est JAMAIS « à toi » :
  « En pause — FillSell s'en occupe : l'équipe est prévenue et adapte le texte Leboncoin (ta fiche ne change pas) »
  (source `lbc_moderation`, état « en pause », cause « nous »), le support reçoit une alerte par job. Le titre seul
  refusé reste une question (un mot nommé, un geste). 52b5ec71 passe dans cette pause au prochain passage de
  handler-watch. Selftest neuf `lbc-moderation` (17 contrôles).
- Reste : trouver la phrase par un essai sur le compte Leboncoin de Nico (le texte tel quel ; sans les deux encarts ;
  un encart à la fois), puis la liste fermée dans `_shared/description-leboncoin.ts`, puis UNE relance de 52b5ec71.
  **Option à trancher par Nico** : un retrait automatique phrase par phrase (au plus 3 reprises — chaque refus compte
  sur le compte Leboncoin de la personne).

## 7. eBay : « États-Unis » puis « pas prêt » (Elodie82) — la vérité, et les 5 articles qui repartent seuls
- PROUVÉ : la détection était juste, mais le COMPTE a changé : « États-Unis » valait pour @echa_5 (site lu 4 fois,
  toujours US) ; à 18:23 elle a relié @aelevy.-86 (eBay France, conditions de vente absentes, bloqué par eBay). Les deux
  messages se contredisaient faute de nommer le compte, et les 5 publications closes « hors France » ne pouvaient
  JAMAIS repartir (le ré-armement eBay ne lit que les pauses). Non prouvé : pourquoi l'app a laissé cocher eBay
  (non reproduit cette nuit).
- Corrigé : un compte relié sur eBay France rouvre, UNE fois, ce que l'ancien compte avait clos — publication jamais
  publiée, close depuis moins de 30 jours, fiche en stock, aucune autre publication eBay vivante ni annonce eBay en
  ligne (jamais un doublon) — à la connexion (ebay-oauth-callback) et en filet (handler-watch). Elle repart « compte à
  finir » et part seule dès que le compte est prêt ; hors quota gardé (**décision de Nico** si elle doit compter).
  Les phrases nomment le compte (« ton compte eBay « echa_5 » est sur eBay États-Unis »). Selftest neuf
  `ebay-hors-france-reouverture` (27 contrôles).
- Elodie : ses 5 publications se rouvrent au prochain passage de handler-watch, en « compte à finir » (rien n'est
  envoyé à eBay) ; elles partiront dès que ses conditions de vente existeront chez eBay. Aucun message envoyé.

## 15. Contrôles du 25/10 au soir
- 0.6.144 : PAS CASSÉE (voir la tête du rapport). ISBN « 0000000000 » : la retenue se lève avec la 0.6.144 — Rég
  (« Moby Dick » publiée à 22:17:39) et Vincent A. (29 retenues levées de 21:31 à 21:35, 6 publiées). Règle juste.
- Alizee : ce n'est pas l'extension — elle a mis sa file EN PAUSE depuis l'app à 20:03:06, et son poste s'est éteint
  juste après ; rien ne part tant qu'elle ne la reprend pas (le bouton est dans sa file).
- Défaut trouvé chez Vincent A. (deux postes, le second sans session Vinted) : le « mur du poste » ne partait jamais
  pour la « pause avant toute suppression » (le motif est DANS la phrase, l'adresse dans le diagnostic) — ce poste
  reprenait l'étape de retrait toutes les 5 à 180 min. Corrigé (update-job-status) : le motif et l'adresse de ce
  rapport comptent ; les jobs vont au poste connecté. Les 31 jobs concernés sont publiés depuis. Selftest neuf
  `mur-poste-pause-avant-retrait` (9 contrôles).

## 10. Depop : « Pour » et frais de port (Thibault)
- « Pour » (18d5cbb1, doudoune enfant) : PROUVÉ — la copie venait d'un job de suivi du relevé, sans genre, et la
  règle ne comptait pas le genre manquant d'un article enfant. Corrigé (commit du point 10, get-pending-jobs v288) :
  le genre manquant se compte et se reprend du dépôt FillSell de la même annonce (« male » ici). Ajouté cette nuit :
  sans dépôt, le genre BRUT de l'annonce en ligne (male / female / unisex) — l'extension le garde désormais à côté de
  « enfant » (0.6.146) ; jamais « Mixte » déduit, sinon la question reste.
- Frais de port (7b2e81e0, 2084dc4b) : annonces créées hors FillSell, aucun port relevé, aucun port par défaut dans
  ses Réglages, et Depop n'a PAS d'option d'expédition par défaut en France (prix national obligatoire, étiquettes
  Depop seulement US/UK/AU). La question est juste : rien n'est inventé (jamais l'historique du compte).

## 11. Taille de bague (Elodie82)
- PROUVÉ : son texte ne porte aucune taille (« Bague vintage diamants baguette ») : la question est juste et reste.
- Règle ajoutée (écran Publier, champ requis) : une taille ÉCRITE collée à un mot explicite (« taille 52 », « T52 »,
  « tour de doigt 60 », « diamètre 17,3 mm ») → la seule valeur de la grille Vinted/Beebs à 0,1 mm (diamètre = tour ÷ π,
  norme ISO 8653) ; « ajustable » → « Ajustable » ; jamais la taille d'une pierre, deux tailles, une taille US/UK, ni
  une valeur sans voisine exacte (« taille 54 » = 17,19 mm → la question). Selftest neuf `taille-bague-du-texte` (18).
- ⚠️ Le même dépôt sur Beebs (34235519, publié à 18:22) porte « 22,6 mm » : écrit nulle part, aucune question
  journalisée — origine NON PROUVÉE (probablement l'IA, avant la règle de cette nuit qui ne lui laisse plus jamais une
  taille). Valeur probablement fausse en ligne : **rien touché, décision de Nico**.

## 12 bis. La correction tracée tient aussi côté extension
- beebs.js (0.6.146) : à la republication, une correction TRACÉE de la copie (chaouidz, 34229052 : 16 → 31) passe
  devant la taille que l'annonce affiche encore ; si l'annonce affiche une troisième valeur, rien n'est forcé. Miroir
  exact de `_shared/correction-tracee.js` (parité vérifiée sur 13 109 cas). L'âge : la copie part déjà seule.

## 14. Adresse refusée par Beebs (Srideals)
- PROUVÉ : ses Réglages n'ont PAS de rue (rue = ville = « Thionville ») ; la suggestion cliquée était la commune seule,
  et Beebs l'a refusée (« Renseigner votre adresse ») — 15 dépôts Beebs acceptés sur 15 avaient une rue. Leboncoin, lui,
  se contente de la commune (32 publications).
- Corrigé : l'extension (0.6.146) ne clique ni ne soumet jamais une suggestion sans rue : arrêt AVANT « Mettre en
  vente » (et avant tout retrait en republication), phrase vraie : « Beebs a besoin de ta rue pour publier : ton adresse
  dans Réglages n'a pas de rue (« Thionville »). Ajoute ta rue et ton numéro dans Réglages › Expédition › Adresse de
  remise : rien n'a été publié. » (classée « réglage du compte ») ; un lieu-dit reste accepté. L'app le dit dès les
  Réglages (« Ajoute ta rue et ton numéro : Beebs les demande pour publier »).
- Non fait : retenir côté serveur, avant Beebs, la publication d'un compte sans rue (l'arrêt de l'extension suffit à
  ne rien publier à moitié). Doute à trancher par Nico : « Meaux 77100 Meaux » (rue = ville) a été validé sur la rue
  d'un commerce proposée par Beebs — faut-il arrêter dès que les Réglages n'ont pas de rue, quelle que soit la
  suggestion ? Srideals : aucun mail envoyé ; 88f51828 reste en attente de sa rue (rien ne la relance tant que ses Réglages n'en ont pas).

## 9. Publier sans ordinateur (patrick giry) — jamais une attente sans issue
- PROUVÉ : son poste était en 0.6.141, vu pour la dernière fois à 17:15 ; la lecture de la description Vinted exige un
  poste en 0.6.144 ; aucune voie serveur ne lit une page Vinted. L'app promettait pourtant « publie dès qu'elle est
  lue » avec le seul bouton « Fermer » : abandon au bout de 3 s, aucun job créé (55 de ses 126 fiches sont sans texte).
- Corrigé (app + serveur) : on n'attend la lecture que s'il existe un LECTEUR maintenant (extension ≥ 0.6.144 sur cet
  appareil, ou un poste du compte en ≥ 0.6.144 vu il y a moins de 15 min). Sinon l'app dit la vérité, en une phrase :
  « Seule l'extension FillSell d'un ordinateur sait lire ta description Vinted : ton ordinateur n'a pas été vu depuis
  17:15 et son extension (0.6.141) doit se mettre à jour. » et propose trois issues : « Écrire ma description »
  (principale ; enregistrée sur la fiche, avec le lien de son annonce Vinted pour copier son texte), « La faire rédiger
  par FillSell » (relue avant de partir, jamais écrite sur la fiche), « Attendre mon ordinateur ». Même règle dans le
  lot, en un geste par article. Le serveur n'attend plus une description que la personne a choisi d'écrire ou de
  faire rédiger. Avec un lecteur, l'écran d'avant, mot pour mot. Chaque cas est tracé. Selftest neuf
  `attente-sans-lecteur` (80 contrôles).
- Limites (dites) : la version d'UN poste n'est pas en base (celle du compte est prêtée au poste au build le plus
  récent) ; « La faire rédiger » à l'unité n'a pas de « C'est bon » bloquant (le texte se voit à l'étape du texte) ;
  le dépôt Vinted/Leboncoin/Beebs/Depop attend toujours un ordinateur — seul eBay part de nos serveurs.

## 6. Le mail de vente manquant (nerema75, la Peluche) et les autres ventes sans mail depuis le 20/10
- La Peluche (job 9bd1a3d8, @celineetmarie) : vue en ligne pour la dernière fois le 10/10 ; vente CONSTATÉE le 25/10 à
  19:27 par « Synchroniser » ; la garde « preuve récente » (vue en ligne hier ou aujourd'hui, ou publiée il y a moins
  de 48 h) a arrêté la note, donc le mail. La vraie date de la vente : inconnue (entre le 10/10 et le 25/10). La garde
  est voulue (pas de mail pour une vente ancienne) — **décision de Nico** : un mail honnête « vente constatée le 25/10 à
  19:27, date exacte inconnue », ou une simple trace. 77 ventes Vinted de 25 comptes dans ce cas depuis le 20/10.
- Défaut de règle PROUVÉ : 7 ventes eBay relevées, datées de moins de 24 h, sans mail (elpastelero ×2, lesforcesdelaudela
  ×2, antikcollections ×3) : la garde « plateforme suivie » exige un relevé d'annonces, qu'ebay-ventes-sync n'écrit
  jamais. Correctif PRÉPARÉ, NON APPLIQUÉ (migration : **feu vert nommé de Nico requis**) :
  `supabase/migrations/PROPOSITION_20261026_vente_releve_date_lue.sql.txt` — sur eBay, la date de la COMMANDE (moins de
  24 h) est sa propre preuve ; ailleurs rien ne change. Corps de prod relu (pg_get_functiondef) ; commandes pour
  l'appliquer dans le fichier. Aucun mail rétroactif.
- Le reste (410 sur 495 ventes sans mail) suit une règle écrite : ventes déclarées par la personne (316), articles non
  suivis par FillSell (58), rattrapages de masse (17), Leboncoin (15)…
