# 26/10 — Urgence « la publication est devenue lente » (Jocabroc) — heure de Paris

Prompt de Nico du 26/10 matin. Compte de Jocabroc (53efea05) : LECTURE SEULE. Essais réels : compte de Nico.

## En tête, pour Nico
- **La lenteur : cause prouvée, corrigée, en ligne (web 4ade5e1 servi à 08:44).** Ce n'était pas l'IA (chaque appel dure
  1 à 6 s) : la PAGE ne répondait plus. Trois rotations de textes d'exemple (onglet « Deal » retiré, Lens, saisie vocale)
  redessinaient TOUTE l'app (stock entier + écran de publication) environ chaque seconde, quel que soit l'onglet. Chez
  Jocabroc (778 fiches), le fil de la page n'avait plus de répit : deux requêtes lancées ensemble partaient à 4,6 s
  d'écart, des réponses servies par le cache (0,3 s) restaient espacées de 23 à 25 s, 18 s de calcul pur entre la fiche
  relue et le débit. Tous comptes : délai « texte rédigé → 1re catégorie » 1,5 s (19-24/10) → 8,9 s (26/10).
  S'y ajoutaient : la lecture de fond qui tenait le verrou de l'extension (75 s et 97 s d'attente mesurées) et le lot
  qui lisait les annonces Vinted une à une, 8 à 20 s d'écart.
- **Chronométrage avant / après (compte de Nico)** :

  | Étape | Avant | Après |
  |---|---|---|
  | Page au repos (tâches longues) | ~60 ms toutes les 1 à 1,5 s | 2 tâches en 25 s |
  | Lecture d'une page demandée par l'écran, lecture de fond active | 75,5 s et 96,9 s (pour 1 s de lecture) | lecture de fond coupée chez les payants ; elle cède le verrou (0.6.146) |
  | 10 lectures Vinted (textes du vendeur) | une à une, 19,4 s mesurées entre deux → 1 min 30 à 3 min 20 | 10 en parallèle : **11,7 s** (0.6.146) — 36,2 s avec la 0.6.145 (24,5 s d'attente de fin de cycle) |
  | Lot de 10 articles → Leboncoin, préparation jusqu'à « prêts » | 23,8 s (calcul de la page : 4,8 s) | 26,8 s (calcul de la page : 1,0 s) |
  | Publier à l'unité : du clic au départ du job | 92 s chez Jocabroc (article 006) | même seconde (job créé à 09:02:33, clic à 09:02:33) |
  | **10 articles d'un nouvel utilisateur prêts à partir** | 2 à 4 min + attentes du verrou | **≈ 12 s de lectures + ≈ 27 s de préparation, qui se chevauchent : < 40 s** |

  ⚠️ Mesure décomposée, dite telle quelle : le compte de Nico n'a que 2 articles Vinted qui ne sont pas déjà sur
  Leboncoin, et l'index unique (compte × annonce Vinted) interdit de dupliquer une fiche importée. Les lectures ont été
  chronométrées sur 10 vraies annonces Vinted de Nico (même appel que le lot), la préparation sur 10 copies TEST à 999 €
  (scripts/essais/20261026_lot_vitesse_*, supprimées ensuite). Ces 10 préparations ont compté 10 annonces de son quota
  du mois (58 → 48 ; une re-préparation dans les 24 h ne recompte pas).
- **Description du vendeur** : conservée partout (vérifié : les 10 copies préparées ont gardé leur texte au caractère
  près ; « Annonce déjà rédigée, reprise telle quelle » à l'unité).
- **Lecture de fond (étape 1)** : elle ralentissait → remise à la valeur d'avant le 25/10 18:23:21 : **clé absente
  (= mode 1, le poste pilote de Nico seul)**, appliqué à 07:38:34.
- **Catégories (étape 4)** : décompte ci-dessous ; nouvelle règle « jamais un blocage, puis la valeur que l'article
  nomme ».
- **Zip 0.6.146** : `C:\Users\nicol\fill-and-sell\build\CWS-0.6.146-A-TELEVERSER\fillsell-extension-0.6.146-4ade5e1-cws.zip`
  (seul dans son dossier ; l'ancien zip de la nuit est rangé dans `build/CWS-PERIMES/CWS-0.6.146-ebdc605-REMPLACE-le-26-10-NE-PAS-TELEVERSER`).
  597 464 octets, sha256 `2aef5b28dd8026d5f020a70daf7d715f194b0a36ce8d47127c5981a567f4f306`, manifest 0.6.146 relu dans le
  zip, BUILD_ID `2026-10-26T07:44:08Z+4ade5e1`. À faire par toi : le téléverser sur le Chrome Web Store et « Envoyer pour
  examen ».
- **Bloqué par le classifieur (à toi)** : `! npx supabase functions deploy get-pending-jobs` (pause de la lecture de fond
  pendant la publication + couleur écrite dans le titre ; prod v292, verify_jwt true).

## Étape 1 — la lecture de fond était en cause : OUI
- Code : la lecture de fond tourne DANS le poll de l'extension, verrou de flux tenu, et attend 20 à 45 s entre deux
  pages (Beebs 30 à 60 s). Toute lecture demandée par l'écran, capture, « Publier maintenant » attend derrière.
- Mesure (poste de Nico, page publique d'une annonce demandée comme le fait l'écran) : sans lecture de fond 1,3 à 1,5 s ;
  avec : **75,5 s** puis **96,9 s** d'attente pour 0,9 à 1 s de lecture.
- Chez Jocabroc : ~120 lectures de fond en 2 h pendant qu'elle publiait. Mais attention : sur son article lent du
  25/10 18:46, aucune lecture de fond n'a tourné — la lecture de fond n'explique qu'une partie ; la cause principale est
  l'étape 2.
- Fait : `coin_config.lecture_fond_mode` 2 → absent (journalisé ; script `20261026_lecture_fond_retour_pilote.sql`,
  inverse `20261025_lecture_fond_payants.sql`). Serveur (à déployer) : aucune lecture de fond servie si le poll sert des
  tâches ou si un geste de publication date de moins de 10 min. Extension 0.6.146 : la lecture de fond cède dès qu'un
  flux attend, 10 min après une demande de l'app, ou si le cycle a eu des tâches ; la maintenance du poll (liens,
  veille, messagerie) passe après une demande de l'écran.

## Étape 2 — ce qui faisait attendre l'écran
- Chemin à l'unité (carte complète : rapport d'agent) : à l'ouverture, lecture d'origine (si la fiche n'a pas son
  texte) ; à l'étape 2, generate-listing (6 s, « Rédaction »), prévol des catégories, passes IA des champs ; au clic,
  adresse → résolution (reprise du prévol si l'empreinte concorde) → fiche relue → débit.
- Commits qui ont mis la lecture d'origine dans le chemin : 241b456 (22/10, OTA 2.9.109), 8cfd98c (25/10, 2.9.116),
  8f1b430 (26/10, 2.9.118). Les leviers IA (6c7634a, 18/10) et lbc_champs_ia (e14ae19, 11/10) sont plus anciens : rien
  de neuf côté IA entre le 21/10 (rapide) et le 25/10 (lent) — le chemin de publication lui-même n'a pas changé ; c'est
  la page qui saturait.
- Corrigé (89b29f7) : plus aucun minuteur qui redessine l'app hors de l'écran concerné ; lot : 10 lectures en parallèle.
- **Non fait, dit** : au clic, si l'empreinte du prévol ne concorde plus (une passe IA a modifié des champs après lui),
  le filet recalcule les catégories (1 à 4 appels, ~1 à 2 s chacun maintenant que la page répond). Les supprimer exige
  de prouver par rejeu « 0 écart » qu'une empreinte réduite ne perd aucun champ : pas fait aujourd'hui (risque de perdre
  des aspects). Une table de correspondance « rayon Vinted → chemin Leboncoin » (60 j : 335 rayons, 304 univoques, 96,5 %
  des dépôts) supprimerait l'appel pour Leboncoin : migration, **feu vert nommé de Nico requis**.

## Étape 3 — preuve de vitesse : voir le tableau en tête.

## Étape 4 — catégories Leboncoin
- Origine de la règle « le pré-rempli Leboncoin bat l'IA » : 5958b37 (0.6.141, 24/10, décision 3), insert Zombicide de
  louis refusé par la modération — cause « non prouvée » dans son rapport ; la vraie cause était la marque.
- **Décompte** (warnings « CONSERVÉ » depuis le 20/10 : 218 sur 208 jobs) :
  - règle IA (0.6.141) : **6 cas — nous 3, Leboncoin 2, les deux 1 ; 1 blocage (le pot à sucre)** ;
  - les ~180 évoqués sont la règle « hors liste » (13/08) : 206 — nous 90, Leboncoin 62, les deux 44, indécidable 10,
    0 blocage ; sur les champs de catégorie (Type, Produit, Univers : 27) : Leboncoin 21, nous 4.
- Nouvelle règle (ec9700d, leboncoin.js ⟦prerempli-ia⟧) : jamais un blocage (la liste Produit sous le Type pré-rempli n'a
  ni notre Produit ni « Autre » → notre paire) ; puis la valeur que l'article nomme ; sinon le pré-rempli reste.
  Pot à sucre → notre paire ; plat à huîtres → « Plat de service » reste (le texte ne nomme aucun des deux).
- Pot à sucre (a64153a4, needs_user) : relance par la voie normale `correctifs-extension` « lbc_prerempli_ia_blocage »,
  UNE fois vers un poste à jour. Le build est posé au zip (commit de ce rapport) ; actif dès le déploiement de
  get-pending-jobs ET la 0.6.146 installée chez elle (Chrome Web Store). ⚠️ Le bouton « Compléter » est à déconseiller
  d'ici là (la question n'a pas de bonne réponse).

## Étape 5 — annonces moins complètes
- Poids : « estimated_parcel_weight : contrôle introuvable » = **faux avertissement** (le formulaire particulier n'a
  pas ce critère ; le poids passe par le bloc livraison). 668/990 publications depuis le 20/10 ; **584 parties AVEC
  livraison** et un palier ≥ au poids de la fiche ; 4 sans livraison (un même compte, autre cause, non traitée) ; 81 sans
  relevé. Corrigé (aa98c54).
- Couleur : « bleu marine » parti en « Blanc » = la couleur de son annonce Vinted (page publique, 0.6.144) qui remplaçait
  le « Bleu » de Leboncoin. Règle : la couleur écrite dans le titre (puis la 1re phrase) gagne toujours, jamais une
  couleur de décor (« à pois blancs ») ; serveur (à déployer). Assiettes « Jaune » : le titre ne dit aucune couleur, le
  texte dit « faïence blanche… carreaux jaunes » → « Blanc » reste (la règle ne devine pas).
- 0.6.141 vs 0.6.144 : aucune publication Leboncoin de Jocabroc en 0.6.141 ; contre la 0.6.128/0.6.131 : photos,
  livraison, état, type/produit identiques ; les écarts propres à la 0.6.144 sont la couleur (corrigée) — « moins
  complètes » n'est pas prouvé sur le nombre de champs.
- Vu en passant : ses 5 annonces Leboncoin de ce matin sont rattachées par le relevé de 07:01 au compte FillSell
  0a24c951 — son second compte, sur lequel elle s'est connectée à 06:58 (voir « Plus qu'à 5 »).

## Étape 6 — restes de la nuit
- Annonces TEST Leboncoin (3295481647, 3295482142, 3295483038, 3295483342) : jamais en ligne (« Cette annonce est
  désactivée », absentes de « Mes annonces », alors que celle du client acceptée à 03:18 est en ligne) → lignes closes
  par le geste « Oublier » de l'app. Fiches 1791730636507 et 1791729478750 : titre et texte d'origine remis (script +
  sauvegarde + inverse). **T-shirt TEST Beebs (508fb8b8) : toujours sans numéro d'annonce (Beebs « en vérification »,
  annonce à 999 €) : rien à retirer tant que Beebs ne l'affiche pas** — le retrait Beebs du vase (4a965139) attend pareil.
- Texte proposé après un changement de photo : cause PROUVÉE, ce n'était pas la photo — une course au rechargement
  (la version en ligne Beebs remplaçait le texte « manuel » avant que la fiche soit relue). Corrigé (d20e0b2).
- Zip : voir en tête ; test réel sur le poste de Nico : voir plus bas.

## « Plus qu'à 5 » (Jocabroc, 07:37) — PROUVÉ : elle s'est connectée sur son AUTRE compte FillSell
- À 06:58:38 elle s'est connectée à son second compte (0a24c951, GRATUIT : plafond 5 → sa capture dit « 4 annonces
  restantes »). Son compte Pro (53efea05) ne reçoit plus rien depuis 06:56:52 ; son extension tourne sous le compte
  gratuit (vue à 09:07) → les tâches du Pro ne sont plus servies (« rien ne se republie »). « 89 » = annonces restantes
  du Pro (89 → 85 ce matin) ; « 5 » = le plafond Free. Aucun écran du compte Pro n'a jamais montré 5.
- Depuis le compte gratuit (06:59 → 08:31) : 14 annonces Vinted supprimées (dont 5 rattachées à des fiches du Pro), 19
  annonces Leboncoin publiées (10 au même titre qu'une annonce Leboncoin en ligne suivie par le Pro : doublons POSSIBLES,
  le titre seul n'est qu'un doute), 9 tâches en attente. RIEN touché (lecture seule) : décisions de Nico.
- Le geste pour elle : se déconnecter, se reconnecter sur son compte Pro. Règle à décider (non faite) : dire « tu es
  connectée sur ton autre compte FillSell » quand la boutique ouverte est suivie par un autre compte (la trace
  `extension_autre_compte` existait déjà à 05:05).
- Défaut corrigé en chemin (3693cd8) : la modale de conversion prêtait le plafond Free (5) à un compte payant sans
  plafond rendu.

## Test réel de la 0.6.146 sur le poste de Nico (build 4ade5e1, annoncé à 09:00)
- 10 lectures Vinted demandées en parallèle : 11,7 s (première à 1,4 s) — la maintenance et la lecture de fond cèdent.
- Publication à l'unité, fiche TEST « jeu PS4 » (999 €) : clic 09:02:33 = job créé 09:02:33 ; Leboncoin PUBLIÉ à 09:04:46
  (3295532522 ; seul avertissement : la marque de console « Sony » gardée, règle inchangée) ; Vinted PUBLIÉ à 09:09:14
  (10538776073). Texte du vendeur repris tel quel (« Annonce déjà rédigée, reprise telle quelle »).
- Ces deux annonces TEST sont à retirer : voir « Restes » ci-dessous.

## Restes
- Annonces TEST : Vinted 10538776073 et Leboncoin 3295532522 (test de la 0.6.146), T-shirt TEST Beebs (508fb8b8, « en
  vérification »). Le retrait se fait par l'app (« Gérer les plateformes » → Retirer) dès que la plateforme l'affiche.
