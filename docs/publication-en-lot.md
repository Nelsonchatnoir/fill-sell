# Publication en lot — conception (nuit du 02 au 03/10/2026)

> Branche locale `feat/publication-en-lot` (depuis `6d49527`). Rien n'est sorti :
> pas de push, pas de migration, pas de fonction, pas d'OTA, pas de zip.
> Maquettes et captures : `screenshots-review/publication-en-lot/` (ignoré par git).

## 1. Ce qui existe déjà (inventaire, relu dans le code et en base)

| Morceau | Où | État |
|---|---|---|
| Moteur de publication d'UN article (rédaction, rayons, champs exigés, questions, gardes, RPC) | `components/ListingPreviewScreen.jsx` (LPS), objet `moteur` (l. ~10015) + `publication/moteur/*` | complet, au singulier |
| Écrans du stepper (U1 → U4) branchés sur `moteur` | `publication/StepperNouveau.jsx`, `Ecran*.jsx`, `BlocQuestions.jsx` | servis à tous (`coin_config.nouveau_stepper_ouvert = 1`) |
| Bloc général Titre / Description / État / Prix + exceptions par carte | `components/BlocValeursGenerales.jsx`, `utils/valeursGenerales.js` | complet |
| Questions regroupées pour UN article (taille posée une fois, propagation) | `BlocQuestions.jsx`, `moteur/regles.js` (`questionsAPoser`, `propagerReponseTaille`) | complet |
| Création des jobs | RPC `spend_coins_and_publish(p_photo_option, p_jobs)` : 1 à 5 jobs, tout-ou-rien, refus `already_published` / `jumeau_en_ligne` / `platform_paused`, aucune lecture de quota, ne rend pas les identifiants | prod (`20260927100000`) |
| Seul « lot » du produit | « Republier en lot » (Stock) : cases, barre collante, une RPC par paire, `bulk_batch_id` posé APRÈS coup par UPDATE | prod, payants seulement |
| Filtres du Stock | « Pas encore sur X », « Nulle part », catégorie, marque, boutique, tri | prod (`utils/stockFiltres.js`) |
| Quotas | `quotas_etat()` ; annonces = générations (`usage_logs 'generate_listing'`, régénération du même article sous 24 h gratuite) : 5 / 40 / 120 / 300 ; refus `quota_annonces_atteint` (402) par `generate-listing` AVANT l'IA ; la publication ne compte nulle part | prod |
| Plafonds de publication | aucun (ni serveur ni extension) ; seul Leboncoin est sérialisé (un job à la fois par compte) ; l'extension traite un job à la fois, 8 à 20 s entre deux | prod |
| Progression | `BarreProgression`, `BarreJobCarte`, `FileDesJobs`, bandeau « En cours » du Stock (agrège déjà publish + republish) | prod (01/10) |
| Annulation | seulement « arrêter les republications en attente » et « abandonner une plateforme » (needs_user/failed) ; rien pour un dépôt en file | prod |
| « Un article qui ressemble est déjà en ligne » | `utils/jumeauxEnLigne.js`, carte ambre de « Confirmer » (n'arrête rien) ; refus serveur `jumeau_en_ligne` si une paire « Est-ce le même article ? » est ouverte | prod |
| Sessions des plateformes | `plateformes_verite()` (serveur tranche) ; session fermée = la plateforme reste cochable, l'annonce attend | prod |
| Multi-boutiques Vinted | un DÉPÔT part toujours sur la boutique connectée dans Chrome ; la garde de boutique ne vise que retraits et republications | prod |
| Leboncoin pro | porte côté serveur (extension trop ancienne → retenu) ; l'extension ne clique jamais « Valider et payer » | prod |
| Détail d'un article du dressing Vinted (la description) | lu par l'extension À L'UNITÉ, sur le clic « Publier », « jamais en lot » (décision 2 du chantier sync) ; cache : capture de republication fraîche (< 30 j, même titre et prix) | prod |

Ce qui n'existait pas : sélection pour publier, passe « N articles » sur le moteur,
questions de tout un lot, quota vu avant l'envoi, suivi et arrêt d'un lot de dépôts.
Le code le disait (`StockTab.jsx` : « C'est le SEUL lot du produit ») ; le moteur, lui,
annonçait déjà sa réutilisation « en boucle (la publication en masse) ».

Mesures en prod (lecture seule, agrégée, comptes de test exclus) :
- 60 jours : 575 séances de publication, 184 comptes ; médiane 2 articles, p75 4, p90 7,
  max 149 ; 115 séances de 5 articles ou plus, 43 de 10 ou plus ; 1,86 plateforme par
  article ; 3 à 6 minutes par article dans les longues séances.
- Stocks des vendeurs actifs : gratuit médiane 66 (p90 565), premium 167, pro 266,
  business 319 articles.
- Fiches incomplètes (stock des vendeurs actifs) : dressing Vinted 33 184 articles dont
  85 % SANS description sur la fiche (elle est restée sur Vinted) et 3 % rattrapables par
  une capture fraîche ; eBay relevé : 94 % sans description (eBay ne la donne pas) ;
  Leboncoin relevé 24 % ; 22 % sans prix ; 19 % sans marque ; 92 % sans colis.
- Demandé APRÈS envoi (60 j, hors Opla) : taille Beebs 37, poids du colis Leboncoin 18,
  taille Vinted 12, « type d'article » Leboncoin 12, marque Vinted 11, marque Beebs 11,
  couleur Vinted 9 — et des murs de compte (nom/prénom Leboncoin, compte eBay à finir).

## 2. Le parcours (téléphone d'abord)

Principe : **le lot ne réécrit pas le moteur, il en héberge un par article.** Chaque
article est préparé par le VRAI moteur du stepper (`ListingPreviewScreen`, mode
`pilote`, sans rien afficher) : même rédaction, mêmes rayons, mêmes champs exigés,
mêmes gardes, même RPC. Le lot n'ajoute que l'orchestration, les questions de tout le
lot au même endroit, le résumé avant l'envoi et le suivi.

1. **Choisir** (Stock) — deux portes : « À traiter » › « Publier plusieurs articles », et,
   sous un filtre « Pas encore sur X » / « Nulle part », « Publier ces N articles ».
   Cases sur les cartes, « Tout sélectionner (N affichés) », barre collante
   « N sélectionnés · Continuer ». 20 articles au plus par lot.
2. **Où les publier ?** — une ligne par plateforme pour tout le lot (Vinted, Leboncoin,
   eBay, Beebs — jamais Opla) : combien partiront, ceux qui y sont déjà, session fermée
   (« elles attendront ta connexion » + Me connecter), eBay à paramétrer, plateforme en
   pause. Le résumé : annonces à créer, ce que ça prend sur le quota du mois, ce qui part
   maintenant et ce qui attendra le prochain mois, la durée avec l'ordinateur allumé.
   « Rien ne part encore. »
3. **Préparation** — une barre, article par article (trois à la fois).
4. **Les réponses avant l'envoi** — seulement les articles qui en ont besoin, regroupés :
   même liste fermée = une réponse pour tous ; sinon une ligne par article. Rayon à
   choisir, taille, marque, couleur, poids du colis, « est-ce le même article ? »,
   prix manquant, texte à relire (quand ce n'est pas le texte du vendeur).
   « Envoyer les N prêts » laisse les autres de côté, rien n'est perdu.
5. **Envoi** — une RPC par article (un article bloqué ne bloque que lui), puis
   « C'est parti : l'extension dépose depuis ton ordinateur, une annonce après l'autre ».
6. **Suivi** — depuis le bandeau du Stock : le lot, ce qui demande un geste en tête,
   puis en cours, dans la file, en ligne, pas parties (avec la raison). « Retirer cet
   article du lot » et « Arrêter ce qui n'est pas parti » (jamais un dépôt déjà commencé).

## 3. Règles du lot

- Texte du vendeur : titre ET description du vendeur = l'article part sans relecture ;
  sinon le texte proposé est montré, à valider (« rien ne part faux »).
- Description d'un article du dressing restée sur Vinted : capture fraîche d'abord ;
  sinon « Lire ma description sur Vinted », article par article (un geste = une
  lecture, la règle du chantier sync tient) — jamais une lecture en série.
- Quota : une préparation = une annonce du quota (comme à l'unité) ; une fiche déjà
  rédigée ne recompte pas. Le lot ne prépare jamais au-delà de ce qui reste : les
  suivants attendent le prochain mois, gardés dans le lot.
- Doublons : un article qui ressemble, en ligne sur la plateforme visée, devient la
  question « Est-ce le même article ? » ; deux articles du lot aux titres voisins ne
  sont jamais comparés entre eux (un titre ne prouve rien).
- Identifiant du lot : `platform_fields.lot_publication = { id, le }` posé à la
  création (porté par la RPC sans migration) + `bulk_batch_id` posé après coup, comme
  la republication en lot.
