# Lot « zéro blocage » — 24/10/2026 (après-midi et soir)

Décision de Nico : une publication, une republication et un retrait passent à 100 %, sans geste, sauf ce que la
personne seule peut faire (se connecter, finir son compte vendeur, compte restreint). Tout le reste vient de nous.
On corrige les RÈGLES, on le prouve sur tout le catalogue, zéro régression.

Mesures : `scripts/zero-blocage-mesure.mjs` (avant : `mesure-avant.json`, 14:3x ; après les réparations de données :
`mesure-apres-donnees.json`, 16:06), classement des causes `supabase/functions/_shared/cause-blocage.js`.
⚠️ Le code SERVEUR de ce lot n'est pas encore déployé (garde-fou automatique « Production Deploy ») : les commandes
sont données à Nico ; extension 0.6.134 à téléverser ; deux migrations attendent son feu vert.

## A. Les cas ouverts

### A1 — Thibault, « Samsung player start 2 » (Leboncoin 25ceaa1c)
- **Fait.** Recréé à 13:37:10 (3294283058) ; le relevé le voit en ligne (vu 13:37). Ses republications Leboncoin
  repartent une à une (13:47, 13:57, 14:05, 14:15) ; 3438f999 (« T shirt ») est retirée depuis 14:19:32 et attend sa
  recréation : le poste de Thibault ne répond plus depuis 14:18 (veille / Chrome fermé) — elle repart à son retour.
- **La ligne Depop « deleted » n'est PAS une republication** : c'est un retrait (72765b1a, 21/10 16:46) demandé par
  Thibault lui-même (usage_logs `retrait_annonces`, chemin `logo_stock`, 16:45:21), après le message « Depop
  n'accepte pas les objets électriques ». La republication 05c348ef n'a jamais rien retiré (étape `a_capturer`).
  Aucune annonce retirée sans recréation possible : la garde (pré-vol avant retrait) n'a pas été franchie.

### A2 — Republication Depop (Thibault, 29 pauses)
- **Cause.** La copie d'une republication recopie le dernier job publié de l'annonce (`spend_coins_and_republish`).
  Les dépôts Depop de Thibault sont nés SANS numéro (platform_listing_id NULL) : le relevé a créé un second job
  « published » de SUIVI, vide (`source: releve`), et c'est lui qui a été recopié — description, rayon, état et port
  absents, alors que le dépôt FillSell du même lien (même produit Depop) les porte tous.
- **Règle corrigée (tous les comptes)** : `_shared/copie-republication-depop.js`, branché dans get-pending-jobs avant
  le port : la copie se complète AVANT le départ — dépôt FillSell de la même annonce (lien, numéro ou produit Depop,
  jamais un job de suivi) → annonce en ligne relevée → fiche ; jamais par-dessus une valeur de la copie ; un rayon
  seulement s'il désigne une feuille ; l'état suit la fiche. Selftest `copie-republication-depop` (7).
- **Électronique (B7)** : une republication Depop d'un article que Depop refuse est CLOSE (auto ou demandée), annonce
  intacte, unité rendue ; l'app ne la propose plus (`repubEtatPlateforme` → `interdit`).
- **Données** : les 31 copies complétées et remises en file (16:04, `scripts/reparations/20261024_thibault_copies_depop.mjs`,
  sauvegarde + inverse ; ses ports saisis gardés) ; les 2 téléphones clos (16:01).
- **Reste** : la migration de `spend_coins_and_republish` (source = dépôt, pas le job de suivi) et le motif Depop de
  `listing_designe` — non faits (gpj complète la copie au départ, ce qui suffit).

### A3 — Vinted, « la marque n'est plus proposée par le menu » (12 pauses, 5 comptes)
- **Causes.** (1) La pause ne se levait qu'avec une preuve (`marque_pose_envoi`) qu'aucun code ne pose : pause
  permanente. (2) 7 des 12 sont des marques du catalogue : `#brand` lu une fois, trop tôt (onglet en arrière-plan),
  puis la garde refusait même quand `#brand` portait LA bonne marque. (3) La ligne « Utiliser X comme marque » n'était
  reconnue qu'en français. (4) mele.marta : marques vraiment absentes de la recherche (anciennes marques libres).
- **Règles corrigées** : serveur (gpj) — une pause n'est jamais permanente : marque du catalogue (reprise avec succès
  par le parc, 30 j) relâchée, au plus toutes les 6 h ; sinon relâchée vers un poste qui porte la chaîne de repli.
  Extension 0.6.134 — attente du champ (8 s), garde qui compare la marque posée, ligne libre toutes langues, même marque
  autrement écrite (unique), puis « Sans marque » quand le rayon l'accepte (**règle de Nico du 24/10, remplace celle
  du 17/10** « jamais Sans marque à la place d'une vraie marque »). Jamais une marque inventée.
- **Reste** : effet réel au déploiement de gpj (relâche) et au téléversement de la 0.6.134.

### A4 — Leboncoin « introuvable » (11 pauses)
- **Cause.** L'extension garde 30 jours une mémoire « annonce morte » qui rend `unavailable` SANS lire ; l'oubli de
  cette mémoire quand un relevé revoit l'annonce (0.6.130) n'était branché que sur la veille, pas sur la lecture avant
  republication. Louis fa5c6f20 : l'annonce est VENDUE (« Article vendu ») — classée à tort « introuvable ».
  nino b4bef8cf, Ornella d674dbde : vraies absences.
- **Règles** : extension 0.6.134 (oubli sur tous les chemins : avant republication, preuves et retraits) ; serveur :
  lecture « vendue » → republication close (pas-de-rouge), relevé disparu/vendu tranché (introuvable-a-confirmer,
  handler-watch) ; migration 20261024230000 (planificateur : jamais une annonce vendue) — **à valider**.
- **Données** : 2 persistants (xxewwer, voirememe) + 5 « à confirmer » (xxewwer) relancés (16:01, 16:05) — leurs postes
  ont oublié la mémoire ; fa5c6f20 clos « vendue ». Louis 88db7e2e / c7526556 : garde voulue, non touchés.

### A5 — Vinted, contrôle avant retrait (11 pauses)
- **Format du colis** (paugues ×2) : notre correction « œuvre d'art » du 22/10 changeait de famille de grille
  (Petit/Moyen/Grand → au poids). Règle : jamais vers une autre famille (`capture-corrigee.js`). romain.knc : Vinted a
  changé la grille du rayon — **reste** (la règle « défaut Vinted → défaut du jour » n'est pas écrite).
- **« Espace de stockage »** (Thibault dca41766, 5 tours) : la valeur capturée était exclue des champs dédiés ;
  extension 0.6.134 reprend stockage et simlock de la capture.
- **Capture incomplète** (christophe) : erreur passagère de stockage → upload réessayé (republish-capture-photos),
  recapture en file espacée. Le job a017da53 est clos « sans objet » (l'article est vendu ; la garde en base a refusé
  la relance — **reste** : la règle « sans objet » du 15/10 ne l'a pas close seule).
- **Sélecteur / accident avant retrait** (patrick, jocabroc8) : file espacée (5, 20, 60 min puis 3 h), jamais un
  geste ; la sentinelle signale la série. La cause du rechargement d'onglet de jocabroc8 n'est pas prouvée.
- **Introuvables Vinted** (jocabroc8 ×2) : migration 20261024230000 (même garde que les autres plateformes) — à valider.
- **Linda** : rien bloqué (file de 624 avance) ; preuve d'appartenance à élargir — **reste**.

### A6 — eBay, Ornella (manteau fille 24 mois)
- **Cause.** Le pré-calcul rangeait l'article en 51580 (« Fille »), l'arbitrage du clic en 155201 (seule valeur de
  Département : « Enfant unisexe ») ; l'encart restait sur 51580, la garde refusait « Fille ».
- **Règles (app)** : Département recalculé pour la catégorie qui part (table unique `moteur/departementEbay.js`) ;
  liste fermée à une valeur posée d'office ; MPN inconnu = « Ne s'applique pas » ; l'encart se remonte aussi sur une
  valeur refusée ; plus jamais « Tout est complété » sous « Pas publié » (B8).
- **Son annonce eBay n'existe pas** (aucun job créé : la garde bloque avant le débit) ; Beebs et Leboncoin publiés et
  en ligne. À republier sur eBay après la mise à jour de l'app.

### A7 — Vinted Italie (mele.marta)
- **Cause des 35 blocages** : le catalogue PARTAGÉ (`platform_category_aspects`, sans colonne pays) a été réécrit en
  italien par sa page (8 lignes : « Condizioni », « Taglia »…) — risque pour TOUT le parc. Remis en français à 15:10
  (script, sauvegarde, inverse) ; l'app lit une liste d'états étrangère par identifiant ; garde en base :
  migration 20261024220000 — **à valider** (sans elle, sa page peut le réécrire).
- **Titre « troppi simboli »** : le refus n'était reconnu qu'en français, et les mots en kana/kanji n'étaient pas
  comptés comme symboles. Règle : motif toutes langues ; mots sans lettre latine retirés quand 3 mots latins restent
  (serveur + extension).
- **Titre « Vinted »** : tapé par elle à la question Titre, écrit tel quel. Règle : jamais un titre vide, générique
  ou égal au nom d'une plateforme (`titreRecevable`) — le titre de la fiche le remplace ; l'app refuse la réponse.
  **L'annonce 10508178148 est en ligne sous le titre « Vinted »** : correction à décider par Nico (republication avec
  le titre de la fiche, ou elle corrige sur Vinted).
- **Couleur** : « Rosa » (libellé italien rangé sur la fiche) devenait « Multicolore ». Tables IT/ES/DE/NL/PT ;
  « COULEUR INTROUVABLE » → reprise couleur retraduite (pas-de-rouge).
- **Données** : f86ecce8 clos (l'article est déjà en ligne sur sa boutique : un doublon serait né). Ses publications
  abandonnées : déjà en ligne (manga, t-shirt) — rien à relancer.

### A8 — recrutementgroupezk704 : **fait** (14:39, 3 dépôts relancés ; a47bdb31 vu en ligne à 14:17).

### A9 — Mails de vente
- **Cause** : un mail par vente, aucun regroupement. **Règle** : les ventes d'un compte décidées dans le même passage
  partent dans UN mail (push-ventes ; chaque vente garde sa réservation `vente:<id>`). 7 j : 47 mails de trop, 35
  auraient été évités sans aucun retard.
- **À savoir** : alice.fournival n'a pas reçu « un mail pour 10 ventes » : un mail pour UNE vente ; 9 ventes sans mail
  (règle du 06/10 « preuve récente »). À trancher par Nico.

## B. Les règles — voir `docs/regles/republication-et-publication.md` § « 24/10 soir ».

## C. La preuve
- **C1** `scripts/bancs/zero-blocage/banc-catalogue.mjs` → `banc-catalogue.json` : 2 495 couples rayon × champ
  obligatoire (Vinted, Leboncoin, Beebs, eBay, Depop) ; **0 sans source** ; 9 refus de plateforme (rayons Vinted
  « neuf seulement ») ; 26 vrais choix (mesures eBay ×20, ISBN ×3, caractéristiques techniques ×2, poids ×1) ;
  453 déduits (texte / IA) — ceux-là peuvent encore demander : 485 encarts affichés en 7 jours (Beebs Taille 75, Âge 46,
  dimensions eBay, Leboncoin dvd_movies_format…). **L'objectif 0 n'est pas atteint sur les déduits.**
- **C2** `rejeu-arrets.mjs` → `rejeu-arrets.json` : 654 arrêts de notre fait depuis le 18/09 — 126 corrigés par ce
  lot, 12 avant, 55 simulés (Depop 29/31 complètes, 2 sans port connu ; titres : les 3 « restants » sont un artefact —
  titre déjà réécrit ou « Vinted » remplacé par la fiche), 198 partiels (champs demandés), 14 vrais choix, **249
  restent** (publications qui ne démarrent pas 76, échecs sans motif 57, catégories 47, non classés 49).
- **C3** sentinelle : `sentinelleArrets` → section rouge d'ops-digest (au déploiement) ; abandon après échec = échec.

## Ce qui reste (à faire, ou à Nico)
1. Déployer les 7 fonctions (commandes données) ; téléverser la 0.6.134 ; valider (ou non) les migrations
   20261024220000 et 20261024230000.
2. Les champs déduits qui demandent encore (Beebs Taille / Âge, dimensions, Leboncoin produits) ; les 249 arrêts
   « restent » du rejeu ; la grille de colis changée par Vinted ; la règle « sans objet » sur article vendu.
3. Décisions : titre « Vinted » en ligne (mele.marta) ; 9 ventes d'alice sans mail.
