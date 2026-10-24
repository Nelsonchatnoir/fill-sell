# 24/10/2026 soir (19:35 → 21:00) — les 7 décisions de Nico

Message de Nico du 24/10 vers 19:35 : feux verts 20261024233000 et 20261024235000 ; 20261024234000 à adapter (point 1) ;
points 2 à 7. Garde-fous : aucun mail ni notification hors ventes, aucune vente en cours touchée, aucune étiquette
payante, zéro régression. Heure de Paris partout.

## 0. Migrations 233000 et 235000 (feu vert de Nico)
- **20261024233000** (un état de commande connu n'est jamais effacé par « inconnu ») : appliquée à 19:41:10 (essai 7/7,
  inverse `supabase/rollbacks/20261024233000_…_INVERSE.sql`), `migration repair` fait, vérifiée en prod.
- **20261024235000** (bordereau automatique dès la vente, **Vinted seulement**) : adaptée à la décision 2, appliquée à
  19:42:22 (essai 11/11 ; `coin_config.bordereaux_auto = 1`, `bordereaux_auto_depuis = 1792863742` = 24/10 19:42:22) :
  une commande Vinted NEUVE reçoit UNE demande (« générer » ou « récupérer »), au format du compte (pdf par défaut) ;
  double vente → rien d'automatique (« deux_commandes_meme_fiche ») ; vente annulée → copie close ; 20 demandes par jour.

## 1. Vente annulée : « Remettre en vente ? » (20261024234000 RÉÉCRITE — en attente du feu vert nommé)
- Plus rien d'automatique : la fiche revient au stock, la carte « Vente annulée — Remettre en vente ? » (un bouton,
  `src/components/VentesAnnulees.jsx`) ; un appui (`remettre_en_vente_apres_annulation`) remet en vente sur Vinted ET
  partout où l'article avait été retiré à cause de cette vente, hors quota ; avant de republier, un relevé fait APRÈS
  l'appui (`releve_apres_annulation`) : remis en ligne par le vendeur → annonce rattachée, rien de republié.
- Essai à blanc 10/10 (`scripts/essais/20261024234000_essai.sql`, sur la vente du short), inverse prêt
  (`supabase/rollbacks/20261024234000_vinted_annulee_remise_en_vente_hors_quota.sql`). Commit 8155a64.
- **Reste** : le feu vert nommé ; puis Nico annule la vente du short et on prouve le parcours (annulation vue, carte,
  appui, aucun doublon).

## 2. Bordereaux Vinted à TOUS les comptes (20261024235500 ÉCRITE — en attente du feu vert nommé)
- Mesure : les 4 comptes bêta (louis, louis-seller, Nico, Ornella) n'ont JAMAIS eu une commande Leboncoin, Beebs, Depop
  ni eBay relevée — seulement Vinted.
- Migration `20261024235500_bordereaux_vinted_tous_les_comptes` (corps lus en prod, `generer-235500.cjs`) :
  `bordereaux_ouverts_pour(compte, plateforme)` — Vinted : tous (interrupteur `coin_config.bordereaux_vinted_tous`, 0 =
  retour à la bêta sans migration) ; toute autre plateforme : fermée pour tous (« bientot ») ; 8 fonctions réécrites
  (relevé des commandes Vinted SEULES hors bêta, jamais les messages ; demandes Vinted seules servies ; compteurs
  « bordereaux_vinted » dès l'extension 0.6.140). Essai à blanc **19/19** (`scripts/essais/20261024235500_essai.sql`),
  inverse vérifié (les 8 fonctions reviennent au md5 près).
- App : « À expédier » et le réglage « Bordereau automatique » pour la bêta ET les comptes aux bordereaux Vinted ouverts
  (la messagerie reste à la bêta) ; Leboncoin, Beebs, Depop, eBay : « Bordereau X depuis FillSell : bientôt disponible. »,
  aucun bouton (vue.js `PLATEFORMES_BORDEREAU_OUVERTES`). Réglage : texte Vinted seulement.
- Extension 0.6.140 : hors bêta, relevé des commandes Vinted seules si le serveur dit « commandes_seules » ; demandes
  Vinted prises. `bordereau-fichier` : `bordereaux_ouverts_pour`, repli `messagerie_beta` tant que la base n'a pas la
  migration.

## 3. louis — insert Zombicide violet refusé par la modération Leboncoin
- Comparaison avec ses annonces sœurs ACCEPTÉES (Vert 3293339765, Noir 3293342330, Rouge 3293347642 ; 19 dépôts du
  22/10 soir, 18 en ligne) : catégorie, critères, prix, description, livraison, nombre de photos, preuve de dépôt —
  identiques. Seuls la couleur et les photos diffèrent ; aucun doublon ; aucun texte de refus de Leboncoin nulle part.
- Le champ mal posé « de notre fait », commun à la famille : **la marque**. Fiche « Sans marque » (relevé de son annonce
  Beebs), la rédaction a lu « Zombicide » dans le titre (« jeu non inclus ») → Leboncoin « Autre » + « Marque :
  Zombicide » dans la description : un accessoire non officiel déclaré sous la marque d'un éditeur.
- **Règle corrigée (tous les comptes)** : « Sans marque » déclaré par la fiche n'est jamais remplacé par une marque de
  l'IA (`sansMarqueDeLaFiche`, reponsesPartagees.js, aux trois arrivées de l'écran Publier).
- **Relance unique** à 20:40 (`scripts/reparations/20261024_louis_zombicide_violet_relance.sql`, sauvegarde, inverse,
  0 mail) : marque « Sans marque », le reste identique → **déposée à 20:43, annonce 3294614836** ; mise en ligne par la
  modération à confirmer au prochain relevé complet.
- Non corrigé (cause non prouvée, à décider) : `toy_type` « Loisirs créatifs » (IA) posé par-dessus le pré-rempli
  Leboncoin « Jeux de société », identique sur les 4 annonces (3 acceptées).

## 4. sos.cuisine — eBay « État manquant », Beebs « Alimentation »
- **eBay, deux causes** (job a5d7f0c9, VTech Switch & Go Dinos Rotor) :
  1. la catégorie : « switch » lu comme la console Nintendo → « Jeux vidéo, consoles > Jeux » (139973) avec
     « Plateforme : Nintendo Switch » et « Nom du jeu vidéo : 3rd Birthday » ; même erreur sur Leboncoin (annonce
     3294575199 publiée en « Jeux vidéo » — non modifiée, à décider). **Règle** : la gamme VTech « Switch & Go » est un
     jouet 🦸, jamais la console (shared.js, jeuxVideo.js ; 4 fiches du parc) ;
  2. l'état : l'URL de dépôt posait 3000 partout ; 139973 et les Livres n'ont pas 3000 (1000/2750/4000/5000/6000, lu chez
     eBay) — mesuré sur deux brouillons de Nico (139973) : condition=3000 → « — », condition=5000 → « Bon état ». 8 jobs,
     3 rayons depuis le 16/10. **Règle** : l'extension (0.6.140) demande au serveur les états du rayon
     (`fetch-ebay-aspects` v18, `{ conditions_category }`, Metadata eBay) et choisit dedans ; là où 3000 existe, rien ne
     change ; serveur muet → la famille d'avant.
  - **Preuve** : job réparé à 20:17 (`scripts/reparations/20261024_sos_cuisine_vtech_ebay_categorie.sql` : 75708
    « Jouets et jeux > Figurines, statues > TV, film, jeux vidéo », Marque VTech) → **publié à 20:21:11 sans geste
    d'elle**, poste 0.6.131 : https://www.ebay.fr/itm/920071245492 (État « Occasion », relu en ligne).
  - Deux brouillons de test sur le compte eBay de Nico (« TEST FillSell etat … ne pas publier », drafts 5433043578411
    et 5433114823812) : à effacer par Nico dans « Vendre > Brouillons ».
- **Beebs « Alimentation »** : aucune déduction n'existait (needs_user). **Règle** (`_shared/alimentation-beebs.js`,
  branchée dans `deduireOptionDuTexte`) : ce que le texte dit (piles, « non fournies », batterie rechargeable, secteur,
  « fonctionne sans pile ») ; rien de dit sur un rayon de jeux électroniques → « Avec pile » ; véhicules télécommandés,
  Montessori, « sans piles » seul, deux alimentations → la question. Mesure de l'agent : 1 102 fiches de jouets, 46
  valeurs dites, 44 justes. Le job Beebs ab4e9982 était déjà publié (sa réponse « Avec pile ») ; la règle rend la même
  valeur sans question sur sa fiche réelle (selftest lot-2410-soir).

## 5. Beebs, tailles (pyjama d'alizeed48)
- Le pyjama n'a jamais eu de job : la question est posée par l'écran Publier. Beebs affiche DEUX champs « Taille » sur
  « Pyjamas (femme) » (« Taille [attributes.women_bras] », 123 valeurs : bonnets 75A…115L ET lettres XXS…9XL) ; l'app ne
  reliait à la taille de la fiche que la clé nue ; « Taille [#2] » (ancien relevé tronqué) était aussi demandé.
- Audit des 148 lignes de taille Beebs (142 rayons) : 138 rayons à un champ, bon champ, taille traduite (1 960/2 017) ;
  4 rayons à homonymes (pyjamas femme, autres maillots femme, chemises homme, un chemin hors arbre).
- **Règle** : la taille de la fiche se TRADUIT dans la liste de l'homonyme (`tailleHomonymeBeebs`, listes.js : « S / 36 /
  8 » → « S », « M / 38 / 10 » → « M » ; jamais « 40 » → col de 40 cm, jamais « 38 » → 85B) ; une clé positionnelle
  n'est jamais une question.
- Restent (décision de Nico) : Bijoux femme (liste des bagues, sans « Taille unique » : 40 questions / 30 j) ; tailles
  EU femme sur liste FR, adultes sur listes par âge.

## 6. seghirdeborah711, vincent.armengol
- Leurs postes sont encore en **0.6.131** (vus 20:14 et 20:43) : la 0.6.139 n'est pas arrivée (Web Store). Aujourd'hui :
  seghirdeborah711, 4 republications Vinted (18:39) en « L'opération n'a pas pu aboutir… » (onglet gelé, corrigé en
  0.6.139) ; vincent, 2 des 4 relances de 19:20 revenues en « Connexion Vinted requise » (mur à la suppression, corrigé
  en 0.6.139) et 31 republications en attente d'une vérification anti-robot Vinted sur son compte.
- **Reste** : dès que leur poste dit 0.6.139/0.6.140 (`profiles.extension_version`), relancer ces jobs (script de
  réparation) et vérifier qu'ils passent.

## 7. Build de l'app
- Changements app de ce lot : carte « Vente annulée », « À expédier » hors bêta, « Bientôt disponible », réglage
  Vinted seul, tailles Beebs, Alimentation Beebs, marque « Sans marque », « Switch & Go ». Web : au push (Vercel).
  Binaires natifs : à faire par Nico (build préparé, commit du lot).
