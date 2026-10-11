# Lot du 11/10 soir — dix points (poids, Louis, veille, republication, files, Rémi, boutique, SEO, couleur, marque)

Selftests : **260/261 avant** (seul rouge : `veille-commandes`) → **270/270 après**, aucun vert tombé.
Écrans retestés (aperçus réels, 390/360 px) : lot (24 captures, dont 10b, 10e « Leboncoin estime », 10f « Saisir le
poids »), « Confirmer » (poids), stepper (moteur, marque), question Marque, Ventes à confirmer, sélection depuis le
Stock, port Depop — tous verts, captures regardées. `capture-stock-refonte` n'a pas pu tourner (il lui faut
`build/apercu-stock/donnees.json`, absent).

## 1. Poids Leboncoin : facultatif, sans friction

- **Cause** : la règle du 11/10 midi (poids obligatoire en lot, sur « Confirmer », et get-pending-jobs v234 qui ne
  servait plus une publication Leboncoin sans poids).
- **Ce qui change** : en lot comme à l'unité, deux choix — **« Laisser Leboncoin estimer » (par défaut)** ou
  « Saisir le poids » ; le choix est **retenu** pour les publications suivantes (`platform_settings.leboncoin.poids_choix`,
  par `platform_settings_fusionner`). Un poids déjà sur la fiche part toujours. Serveur : seule la règle « jamais servie
  sans poids » est retirée (gpj v236 puis v237) ; un poids écrit « 650 g » reste lu en grammes ; la règle boutique
  de la v235 est intacte. Aucune publication n'était retenue pour son poids au moment du changement (0 en base).
- **Ce que les gens voient** : bloc « Poids du colis » du lot avec les deux boutons (« N articles Leboncoin ont déjà
  un poids sur la fiche : il part avec l'annonce ») ; sur « Confirmer », une carte à deux choix, le champ seulement en
  « Saisir le poids » (Publier n'attend le poids que dans ce cas ; revenir à « estimer » retire le poids tapé).
- **Preuve** : `selftest:lot-poids-leboncoin` réécrit sans l'affaiblir — le poids saisi part (lot, copie, fiche,
  serveur, extension) ; l'estimation publie sans bloquer (défaut, lot de Louis rejoué, serveur, stepper).

## 2. Les vêtements de Louis (lot du 11/10, 11:07 → 11:27) — lecture seule

18 annonces (pas 17), lues dans le JSON de la page publique et la fenêtre « Modes de remise » : **toutes en ligne,
toutes en format S, poids de 207 à 250 g** (15 à 250 g ; 3286197542 Gigoteuse rouge 233 g, 3286208995 Top à pois
207 g, 3286209974 Blouse kiabi 225 g). **Aucune au-delà de S ni de 1 kg.** Rien modifié.
Appréciation (pas un fait) : 250 g paraît bas pour 3286202310 (lot 8 t-shirts), 3286201068 (lot 5 manches longues),
3286204445 (lot été, 7 pièces), 3286205849 (lot 3 mois, 9 pièces), 3286212104 et 3286213321 (jeans adulte).
À noter : « Gigoteuse bleu clair étoiles » (3286198656) est rangée sous /vetements/, les trois autres sous
/vetements_bebe/ (livraison 0,49 € contre 0,99 € en point relais).

## 3. Test « veille-commandes » rouge

- **Cause** : test périmé, **pas un défaut de la surveillance** : il cherchait un texte sur deux lignes avec « \n »
  en dur, alors que `background.js` est extrait en CRLF sur ce poste (core.autocrlf). Le code est juste
  (`veillerCommandes` avant `checkPublishedListings`), le zip aussi. Défaut latent depuis la naissance du test
  (a857538, 05/10) ; rouge depuis le 09/10 ~18:31 (reset d1b7ac1 qui a réécrit le fichier).
- **Correction** : le fichier est lu tel que git le garde (CRLF → LF) ; contre-épreuve : code déplacé → rouge.

## 4. Republication qui retire avant de vérifier (voirememe, 1786376708642)

- **Cause** : le pré-vol d'avant retrait Leboncoin ne contrôlait que titre, prix, photos, catégorie, adresse ; les
  critères du rayon n'étaient découverts qu'à la recréation, après le retrait. Leboncoin avait pourtant déjà refusé
  « Produit » (toy_type) sur Jeux & Jouets (catalogue, source server_400, depuis le 19/09). Pré-vol complet avant
  retrait : Beebs seulement (et Vinted par la une-passe).
- **Ce qui change** :
  - extension **0.6.109** : pré-vol de RECRÉATION pour Leboncoin et Depop avant tout retrait — le vrai formulaire est
    déroulé (Leboncoin : titre, catégorie, photos, critères, « Continuer », puis « Quitter sans enregistrer » ; Depop :
    jusqu'aux photos, rien envoyé). Champ exigé manquant → pause AVANT le retrait, annonce intacte, liste fermée de la
    plateforme. Sans preuve → nouvel essai dans 30 min. Rien deviné, pas d'IA ;
  - serveur (gpj v237), pour les postes sans ce pré-vol : un requis PROUVÉ (server_400, jamais 'dom') absent des
    critères repris de l'annonce → pause avant retrait, trois tours au plus. Effet sur la file actuelle : 0.
- **Ce que les gens voient** : « Republication en pause AVANT tout retrait : ton annonce Leboncoin est TOUJOURS EN
  LIGNE… Leboncoin exige « Produit »… » avec la liste.
- **Cet article** : rien relancé. Le job 66bbae2b reste en pause à l'étape « deleted » (annonce 3247959211 retirée).
  ⚠️ La fiche avait une deuxième annonce Leboncoin (3285030264, Collection, republiée le 09/10) qui n'a pas été
  revue au relevé complet du 10/10 11:43 : la fiche n'a peut-être plus AUCUNE annonce Leboncoin en ligne.
- **Parc depuis le 18/09** : 17 republications retirées puis bloquées par un champ obligatoire (Leboncoin 9,
  Vinted 6, Beebs 2) : 839f1077 xxe Vinted 18/09 ISBN (1 h) · 911b9e79 voi LBC 19/09 Produit · 5078177d voi LBC
  19/09 Produit · ea96b298 lou LBC 19/09 catégorie puis Produit · f6314286 lou LBC 19/09 État · 60c19562 xxe LBC
  19/09 catégorie puis État (11,9 h) · 6aabc550 xxe Vinted 22/09 format colis · f554a951 fam LBC 25/09 Poids ·
  fb358c75 fam LBC 25/09 Produit + Poids (68,8 h) · 279c046f car Vinted 27/09 ISBN (23 h) · edd1e8c1 nad Vinted 28/09
  format colis · 2586c549 mis Beebs 29/09 Pointure (53,8 h) · 889853d2 joc LBC 30/09 État hors liste · 21a71cc8 loh
  Vinted 01/10 format colis (23 h) · 8d487ebb niv Beebs 02/10 Taille « L » (106,6 h) · 2d37ee4a 2hy Vinted 02/10
  Modèle/stockage/RAM · **66bbae2b voi LBC 11/10 Produit — toujours hors ligne (seule aujourd'hui)**.
  Rien côté Vinted depuis le 02/10, ni Beebs depuis le 29/09 (gardes existantes). 21 autres retraits bloqués pour
  une autre raison (catégorie absente, adresse, formulaire changé…), dont 166e5729 (jon, Vinted, compte en restriction
  de vente) et 1660ea94 (joc, LBC, « dépôt peut-être déjà parti ») encore hors ligne.
- **Reste** : prouver en réel, avant téléversement, la sortie « Quitter sans enregistrer » du pré-vol Leboncoin APRÈS
  les critères (prouvée le 03/09 sur un brouillon à l'entrée seulement ; si elle manque, la recréation reprend le
  brouillon par le chemin existant — le pré-vol ne dépose jamais rien). Annonce de test à 999 €. Coût : 1 à 3 min et
  un envoi de photos par republication Leboncoin.

## 5. Files qui ne repartent pas

**Rémi (3 boutiques)** — ce n'était pas « introuvable » mais « mauvaise boutique » mal reconnue : les 10 pauses
visaient des articles de @celineetmarie, servis pendant que Chrome était sur @narema75 ; la sonde users/current rendait
403 (identité illisible) → le serveur servait, la capture recevait 404 (l'adresse d'édition ne connaît que la boutique
connectée), et au 5ᵉ 404 la tâche passait « introuvable_indetermine », sans aucune levée possible.
**Les 10 annonces étaient EN LIGNE** (relevé complet du 10/10 00:07, vues en ligne le 10/10, aucune vente, aucun
retrait) : 10049630809, 6045682503, 7807778032, 9500314459, 9500936887, 9966403577, 9966419624, 10049063247,
9502425149, 10049587513 — aucune vendue ni retirée, donc rien à faire suivre.

**hu.anastasia (1 boutique)** — 12 republiées de 09:46 à 11:04 ; puis **aucune requête de son extension de 11:25 à
13:11** (absente) ; au retour, 4 polls (13:11 → 13:34) sans un seul job : un relevé **Beebs** demandé par l'app à
13:06 (session Beebs morte) gelait TOUS ses jobs, Vinted compris (« la synchro passe devant »). Ses 215 sont saines ;
plafond Premium 50/jour (12 faites) → 38 au plus aujourd'hui, le reste à partir de minuit.

**Règle posée — « un article bloqué ne retient jamais les autres »** (gpj v237 + extension 0.6.109) :
- un relevé ne retient plus que les jobs de SA plateforme, et seulement frais (30 min, avant : jusqu'à 6 h) ;
- la boutique lue sur la page par la dernière capture devient une source d'identité (la sonde rend 403 chez Rémi) ;
- une pause « introuvable » posée sous une identité illisible se lève seule dès que la bonne boutique est vue
  connectée (jamais avant, jamais sur une autre, deux fois au plus par tâche) ;
- compte-gouttes équitable : une tâche reportée reprend sa place à la fin de son attente (avant : elle reprenait la
  tête et 5 tâches de Rémi n'étaient jamais servies) ;
- extension : un 404 de capture sous une identité illisible, chez un compte à plusieurs boutiques, est une attente
  de boutique (identité relue par l'onglet d'abord), jamais un compteur « introuvable ».
- **Effet constaté** : à 14:56, au déploiement, les 10 pauses de Rémi se sont levées (@celineetmarie vue connectée
  par la sonde et la capture) ; à 15:05 : 2 republiées, 1 en recréation, 7 en file. Ce sont SES republications du
  07/10 et du 11/10, reparties par la règle — aucune relance manuelle.
- **Reste (non fait, à trancher)** : une republication figée à l'étape « deleted » retient sans limite les autres
  « captured » de sa plateforme (gpj, garde « une annonce hors ligne à la fois ») ; le disjoncteur du balayage SQL
  de la republication auto compte les échecs d'article comme des échecs de compte.

## 6. Rémi — « 17 articles sur 900 », ventes invisibles

- **(a) 17 sur 900** : l'inventaire était lu en UNE requête `.limit(3000)` ; PostgREST coupe à **1 000 lignes sans
  erreur**. Rémi : 1 349 fiches, 1 000 chargées → 17 narema75 sur 899/900 en stock. Vrais chiffres : **187 sur 1 218**.
  **Parc : 18 comptes** au-delà de 1 000 → 9 267 fiches en stock et 1 390 vendues invisibles (totaux, filtres, lot,
  republication faux) ; ventes : 3 comptes, 1 562 invisibles. **Corrigé** : lecture complète par pages (même ordre,
  clé created_at/id, ni doublon ni trou si la synchro écrit pendant la lecture) ; dans le même lot, ce qui aurait
  cassé avec la lecture complète : prix d'annonce du Stock et écritures groupées (prix d'achat, prix, quantité) par
  lots de 400.
- **(b) 187 en stock pour 219 relevées** : rien ne manque — 219 = 183 actives + 36 vendues ; 187 = 183 + 3 vendues
  sur Vinted restées en stock (cf. c) + 1 (« Sac Lancaster », disparu le 05/10, question « Vendue ? » en attente).
- **(c) ventes invisibles** : l'écran Ventes montre bien la base (581 lignes, ventes du 10/10 et 11/10 présentes).
  Ce qui manque : 5 ventes Vinted du 10/10 (3 narema75, 2 celineetmarie) sans ligne — le rattrapage A5 de 11:08 a
  refusé la vente prouvée (« Vérifie le prix » : republications, prix NULL), le bandeau « 🎉 Vendue » arrivait prix
  vide, et Rémi a tapé 5 fois « Non, je l'ai retirée » à 13:06 → jobs annulés, aucune vente. **Corrigé** : prix du
  bandeau = prix lu > prix du job > prix de recréation > prix relevé > prix de la fiche (27 bandeaux étaient au prix
  vide) ; « Non, je l'ai retirée » n'est plus offert ni accepté sous une preuve de vente ; filtre « Vendu » suit la
  boutique. **Base** : migration **20261011170000 APPLIQUÉE** (ton feu vert, cron normal) — vente prouvée et
  « Ventes à confirmer » prennent le prix de recréation ; les **9 ventes prouvées bloquées** (4 comptes) seront
  enregistrées par le cron **à partir de 17:08** (fin du refus de 6 h posé à 11:08) ; au plus 1 mail « Vendu »
  (vente du 11/10 06:06). Vérifier : `select * from ventes_prouvees_passages order by debut desc limit 5;`.
  **À décider (Nico)** : les 5 ventes de Rémi (jobs annulés par ses taps) — les reproposer ou non.
- **(d) nadegemarcelin78 (607 en stock + 15 vendues)** : **incident du 03/09**, pas une boutique qu'il gère —
  relevé automatique (« cron ») du 03/09 07:12 fait par l'extension de Rémi alors que son Chrome portait la session
  Vinted de Nadège ; boutique jamais confirmée chez Rémi ; ce sont les annonces de Nadège (les 622 dans ses propres
  relevés) ; même adresse IP et même navigateur pour les deux comptes (même foyer) ; fiches figées depuis le 03/09,
  aucune vente ni annonce ailleurs ; 3 retraits du 11/09 avaient réellement supprimé des annonces de Nadège
  (déjà documenté). La garde « boutique non confirmée » empêche que cela recommence. **Rien supprimé ni déplacé :
  Nico décide.**
- **Reste** : volume — pour ces 18 comptes, chaque rechargement télécharge jusqu'à 3,4 fois plus (4,2 Mo au lieu de
  1,2 Mo pour le plus gros) ; suite possible : relire seulement ce qui a changé. Fenêtre de suppression d'un article
  (« Je l'ai retirée » sous une sonde « vendue ») non modifiée : décision produit.

## 7. Boutique vérifiée juste avant le dépôt (extension 0.6.109)

- **Ce qui change** : chez un compte à plusieurs boutiques confirmées, la page relit la boutique Vinted active
  au dernier geste, juste avant le clic de dépôt d'une publication (remise en vente comprise). Autre boutique, ou
  identité illisible → **rien n'est soumis**, le job attend sa boutique (15 min, aucune tentative consommée) et
  repart seul quand la bonne est ouverte. Compte à une boutique : rien ne change.
- **Ce que les gens voient** : « En attente de ta boutique Vinted @x : cet article appartient à cette boutique, il
  ne se publie que sur elle. Ouvre-la sur vinted.fr dans Chrome, la publication repartira toute seule. Rien n'a été
  publié ailleurs. »
- **Reste** : une identité qui resterait illisible en continu retiendrait les publications d'un compte à plusieurs
  boutiques (la page lit pourtant l'identité par sa propre session, ce que la sonde ne fait pas).

## 8. Search Console — « Applications logicielles »

- **Constat** : la propriété https://fillsell.app/ n'a **pas** de rapport « Applications logicielles » dans la Search
  Console (seulement « Fils d'Ariane » et « Vidéos ») : **il n'existe donc aucun bouton « Valider la correction »
  pour ce type**. Les avertissements n'apparaissent qu'au test des résultats enrichis : 5 non critiques — 4 × « Type
  d'objet non valide pour le champ priceSpecification » (un par offre) et « aggregateRating manquant (facultatif) ».
- **Correction** (site/gabarits/donnees-structurees.mjs, seul fichier) : `priceSpecification`
  (UnitPriceSpecification + billingDuration, refusé par Google pour une application) retiré ; le « par mois » porté
  par `Offer.description`. Test en mode code : **5 → 1**. Reste « aggregateRating » : FillSell n'a aucune note à lui ;
  recopier celles des stores est interdit par Google (et refusé par `site:verifier`).
- Vérification sur l'URL en ligne après déploiement : voir § Servi.

## 9. Couleur Vinted : elle ne bloque plus jamais

- **Mesure 18/09 → 11/10** (`champ_requis_bloquant`) : 2 943 lignes toutes causes (93 comptes, 130 « abandonne »,
  19 comptes). **Couleur : 174 lignes, 13 comptes** — **Vinted 100** (79 affichages, 17 complétés, **4 « abandonne »
  = 2 articles**), **eBay 74** (57 affichages, 15 complétés, **2 « abandonne » = 1 article**), Beebs, Leboncoin,
  Depop 0. 3 des 19 comptes qui ont abandonné l'ont fait sur la couleur (enzopeche32, alizeed48, jakefawright).
  Côté serveur : 0 job retenu pour la couleur — toute la friction était dans l'app.
- **Causes** : import sans Lens ; rédaction et IA générique en texte seul ; **liste de couleurs Vinted tronquée à 20
  sur 29 dans 67 des 77 rayons** (Marron, Jaune, Doré, Multicolore absents — justement celles d'une figurine) ;
  couleurs de Lens en anglais jamais traduites.
- **Ce qui change** (publication seulement, stepper et lot) : couleur connue (copie, fiche, Lens) ramenée à la palette,
  sinon UN appel IA qui regarde 1 à 2 photos et le texte (generate-listing v116, `resolve_couleur`, Haiku 4.5, réponse
  contrôlée dans la liste), sinon « Multicolore » — **jamais une question** ; jamais par-dessus une couleur présente ;
  taille, marque, rayon inchangés ; palette Vinted entière ; table anglais → français. Serveur : le filet ne pose plus
  la question « Couleur ». Coût estimé ~0,003 $ par appel (quelques appels par jour), filet 400/compte/24 h.
  **Republication : inchangée, sans IA.**
- **Ce que les gens voient** : plus de question « Couleur » ; une couleur posée (ex. « Marron ») modifiable.
- **Reste** : la troncature vient du relevé de la liste par l'extension (doublons avant `slice(0,40)`) — sans effet
  maintenant sur l'app (palette entière), à corriger avec une prochaine extension ; pas de filet serveur côté eBay
  pour les anciennes versions de l'app.

## 10. Question « Marque » posée en boucle

- **Ce qui s'est passé** : lucyburaux988 n'a pas vu 20 questions mais **5, une par article** ; les « 20 » sont 4
  lignes de journal par article (affichage générique + affichage partagé + deux « complete »). Ni plateforme, ni
  étape, ni relance. Le vrai défaut : la question était posée **alors que la fiche n'avait aucune marque** (Lens :
  marque absente ; rédaction : null), par la règle du 24/09 « pas de Sans marque d'office » ; réponse « Sans marque »
  4 fois sur 5.
- **Ce qui change** : aucune marque nulle part (fiche, Lens, copies) et aucune lecture partielle d'étiquette par Lens
  → **« Sans marque » d'office, sans question** ; une marque présente hors catalogue Vinted garde sa question ; une
  marque du catalogue passe ; une marque tapée n'est jamais redemandée. La réponse à la question « marque hors
  catalogue » est rangée sur l'article (`attributs.marque_vinted`) et reprise à chaque publication Vinted suivante
  (app et serveur). 1 ligne de journal = 1 affichage.
- **Mesure « avant »** (questions Marque par article publié au stepper, par semaine) : 14/09 **0,153** · 21/09
  **0,072** · 28/09 **0,035** · 05/10 **0,100** ; le 10/10, **21,4 %** des articles ; depuis le 03/10 aucun article
  ne l'a vue deux fois. « Après » : à rejouer dans quelques jours avec
  `docs/enquetes/lot-1110-soir/mesure_question_marque.sql` (`npx supabase db query --linked -f … -o csv`).

## Servi

- **get-pending-jobs v237** (`verify_jwt` true, lu avant/après ; v236 au point 1) ; **generate-listing v116**
  (`verify_jwt` true) ; migration **20261011170000 APPLIQUÉE** et inscrite (14:51).
- **OTA 2.9.83** servie (canal production, build `2026-10-11T13:08:31Z+81ef9cc`).
- **Extension 0.6.109 À TÉLÉVERSER** : `C:\Users\nicol\fill-and-sell\build\CWS-0.6.109-A-TELEVERSER\fillsell-extension-0.6.109-81ef9cc-cws.zip`
  (seul dans son dossier ; BUILD_ID `2026-10-11T13:09:39Z+81ef9cc` ; embarque 0.6.108 et 0.6.107, jamais téléversées ;
  ancien dossier 0.6.108 rangé dans `build/CWS-PERIMES/`). Avant : la preuve réelle du § 4.
- Commits : da56c61 (1), 060e5d6 (3), 218bac6 (8), 3b3e85c (5 serveur), 3470714 (4 serveur), 8f97cc7 + 4b62efe
  (extension 7/5/4), dd2a742 (6), f7750bb (9), be8387b (10), 8eb4685 (9-10 serveur), d3b0d54 (tests câblés),
  81ef9cc (version).
