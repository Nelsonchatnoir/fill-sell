# 25/10 après-midi — « importer son Vinted puis publier ailleurs, sans aucune friction » (lot de Nico, 13:05)

Audit complet du parcours (étapes, ce qui échoue, ce que voit la personne) : `AUDIT-PARCOURS.md` (même dossier, relevé sur
`d9e1819` avant les correctifs ; les points E1-E13 y sont numérotés). Heure de Paris (UTC+1).

## 1. La cause PROUVÉE de l'échec de lecture chez Louis (louis-seller, 447d920c)

Deux défauts enchaînés, observés dans ses journaux (edge_logs, usage_logs) puis REPRODUITS sur le poste de Nico.

1. **Le pont de sa page vers l'extension était mort.** Son extension s'est mise à jour seule (0.6.131 → 0.6.141) à
   **01:58:40** (`usage_logs.maj_extension`, « rechargement:onUpdateAvailable »). Chrome ne réinjecte pas le script de la
   page dans un onglet déjà ouvert ; l'ancien, coupé de l'extension, avalait chaque commande sans rien dire
   (`fillsell-auth.js` : `catch { /* extension rechargée : sans conséquence */ }`). Ses commandes de la journée :
   - 08:36:13 « Synchroniser » (voie directe) → aucune réponse → repli par la file à 08:36:23 (`sync_click`
     « repli_canal_direct ») ;
   - 10:29 → 10:50 : son lot demande le détail de ses 5 Playmobil à son extension (pont) — plus de 20 demandes, chacune
     attendue **24,5 s** (le délai du lot) sans réponse, aucune écriture de l'extension ;
   - pendant ce temps, la MÊME extension travaillait normalement (polls toutes les 2 min, republication Vinted réussie à
     10:33-10:36, relevé de 330 annonces à 08:38) : seule la page ne la joignait plus. Le 23/10, avant la mise à jour, le
     même poste répondait à chaque demande en 5 à 25 s.
2. **Le lecteur de secours de l'extension n'a JAMAIS rien lu, pour personne (0.6.130 → 0.6.143).** `restRequest`
   rendait `null` pour tout POST sans `Prefer: return=representation` — RPC comprises. `lectures_origine_en_attente`
   revenait donc toujours vide : chez Louis, la liste est relue toutes les 2 min, la requête suivante part **59 ms**
   après (aucune lecture). Mêmes effets : la pause et la synchro « entre deux tâches » (`file_etat_poste`) n'ont jamais
   été vues, la lecture « devant la file » du 25/10 matin non plus.

**Reproduction (poste de Nico, onglet fillsell.app, même extension 0.6.143)** : 13:38 réponse en 4,3 s ; extension
rechargée à 13:43:50 (seule modification : l'identifiant de build sur le disque) ; 13:45 même onglet, jamais rechargé :
ni présence ni réponse en 30 s ; onglet rechargé : réponse en 3,2 s.

**La VM, les deux comptes, @evat** : pas la cause. Son extension lit Vinted avec @evat, la boutique de ses 5 annonces
(propriétaire) ; elle republie sur le même poste au même moment. Le compte Amiral a une extension (session 8632c049)
dans un navigateur connecté à @evat : son relevé de 00:07 a été refusé « boutique à confirmer » — la garde a fonctionné,
rien n'a été importé ; c'est indépendant de la lecture.

## 2. Ce qui est corrigé (règles, pour tous les comptes)

- **Extension 0.6.144** :
  - un appel RPC rend toujours sa réponse (`restRequest`) — le lecteur de secours, la pause et la synchro entre deux
    tâches marchent enfin ;
  - le script de la page est **réinjecté dans les onglets fillsell.app ouverts à chaque installation ou mise à jour** ;
    une copie coupée le dit à la page (`__fillsellPontMort`) et ne se déclare plus présente — **prouvé sur le poste de
    Nico** : l'onglet ouvert à 13:45, jamais rechargé, répond de nouveau après la mise à jour de 14:12 (1 ms ; lecture
    complète en 1,3 s) ;
  - la lecture passe par la **PAGE PUBLIQUE** de l'annonce (JSON-LD Product : texte, couleur, marque, rayon par le fil
    d'Ariane — observé sur 10499143345), une page vue comme un visiteur, lisible quel que soit le compte Vinted ouvert ;
    plus jamais le formulaire d'édition en boucle ; un jeton web expiré est renouvelé par un vrai chargement, une fois ;
  - **le rattrapage en arrière-plan** (`lireFondVinted`) : à la fin des polls, au rythme servi par le serveur ;
  - une page publique lue depuis le site (`FETCH_VINTED_PUBLIC`) est aussi posée sur la fiche : une réponse tardive ne
    perd plus la description.
- **Serveur** : `get-pending-jobs` sert `lecture_fond` (`_shared/lecture-fond.js`) : qui lit, quoi, à quel rythme ;
  la retenue « la lecture passe devant » du matin ne vise plus que les extensions qui lisent vraiment (≥ 0.6.144 — elle
  gelait jusqu'à 15 min les postes en 0.6.130-0.6.143) ; `ops-digest` compte les pages lues et les refus de Vinted.
- **App (OTA)** : sonde du pont en 1,5 s avant toute lecture (plus 12 ou 25 s d'attente pour rien) ; page publique
  d'abord avec une extension ≥ 0.6.144 ; une lecture faite au stepper ou au lot ferme sa demande ; le lot ne retient
  plus personne : l'attente se compte, passé 60 s chaque article offre « Écrire ma description » ou « Retirer du lot »,
  et un pont mort affiche « Recharge cette page » (lot gardé) ; les phrases ne promettent plus un départ sans job.

## 3. La garde anti-robot, mesurée

- Rythme : 2 pages au plus par poll (un poll toutes les 2 min), 20 à 45 s entre deux, 300 par jour et par compte ; jamais
  pendant une pause anti-robot ; le PREMIER refus (403, 429, page de vérification) coupe le compte 6 h (extension et
  serveur) ; ouverture par paliers (`coin_config.lecture_fond_mode`, absent = 1 : pilotes ; 2 payants ; 3 tous ; 0 coupé).
- Mesure sur le poste pilote (Nico) depuis 14:14 : voir § 5.

## 4. Rattrapage des fiches déjà importées

- **Fait (14:25)** : 2 628 fiches sans description ont reçu le texte du vendeur que FillSell avait déjà (captures de
  republication valides, même titre et même prix, < 30 jours — la règle de l'app) — 74 comptes ; script
  `scripts/reparations/20261025_descriptions_depuis_captures.sql` (sauvegarde + inverse).
- **Le reste** : par la lecture de fond, dès que les postes ont la 0.6.144 (Chrome Web Store), comptes payants d'abord.

## 5. Preuves sur le vrai parcours

**Le parcours entier, sur le poste de Nico (extension 0.6.144, compte de Nico, annonce de test à 999 €)** :

1. 14:35 — annonce Vinted 10526317534 « TEST FillSell 999 ne pas acheter - vase blanc », avec un texte écrit sur
   Vinted seulement ; importée par la synchro : fiche 1792935319552000 **sans description** (le cas des 71 473).
2. 14:43:41 — la **lecture de fond** (poll, mode mesure) lit sa page publique et pose sur la fiche le texte, le rayon
   Vinted 1940 et la couleur « Blanc » (`usage_logs.lecture_fond`, `attributs.page_publique_lue`) — sans aucun geste.
3. 14:51 — « Publier ailleurs » : le stepper s'ouvre aussitôt avec le texte du vendeur ; aucune attente, aucune lecture.
4. Jobs créés et publiés : eBay 14:52:24, Leboncoin 14:54:19, Beebs 14:55:11, Depop 14:55:43. **Vu en ligne** :
   - eBay `820276336629` : page de l'annonce, 999 EUR, Achat immédiat ;
   - Depop : page du produit, 999,00 €, la description, « listed 0 minutes ago » ;
   - Leboncoin `3295066071` (15:02, `leboncoin.fr/ad/decoration/3295066071`) : titre, 999 €, 3 photos, et la
     description **lue sur Vinted** (« Annonce de test FillSell (parcours importer puis publier ailleurs) … ») ;
     présente dans « Mes annonces » du compte, « Créée aujourd'hui » ;
   - Beebs `34233350` : dépôt réel (numéro lu en tête de « En cours de vérification » juste après le clic, et mail de
     Beebs « Votre annonce est en cours de vérification » à 14:56) ; à 15:00 elle a quitté cet onglet sans paraître en
     ligne (page 404). C'est le comportement de Beebs mesuré le 25/10 (`_shared/beebs-sortie-verification.js`) : une
     annonce chère (≥ 500 €) est examinée invisible, de 48 à 126 h, avant d'être mise en ligne — la précédente annonce
     de test à 999 € (Call of Duty) est en ligne aujourd'hui. Pas encore vue en ligne : dit tel quel.

**La garde anti-robot, mesurée (poste pilote, 14:14 → 15:02)** : 33 pages lues, **0 refus** (aucun 403, 429 ni page
de vérification) — 26 lectures complètes (1,7 s en moyenne), 5 « jeton à rafraîchir » avant le correctif de 14:30
(depuis : rechargement réel, puis relecture), 1 page sans annonce (article vendu). Le rattrapage à grande échelle
attend la 0.6.144 sur les postes (Chrome Web Store) et l'ouverture des paliers (décision de Nico).

**Louis (louis-seller)** : ses 5 Playmobil ont leur texte Vinted depuis 10:50 (script du matin
`20261025_louis_seller_textes_vinted.sql`, lecture d'origine close à 10:50) ; son lot a préparé leur contenu
Leboncoin de 10:51 à 10:54 (5 `generate_listing`, 10 écritures `fiches_annonce`) ; **aucun job, car aucun clic
« Envoyer » depuis** : aucun appel `spend_coins_and_publish` dans ses journaux de 10:45 à 15:10, alors que sa page
est ouverte (elle interroge le serveur jusqu'à 15:04). Son extension travaille (republications Vinted réussies à
13:57 et 14:48) : rien ne retient plus ses articles — le départ attend son geste.

## 6. Jocabroc (Pro, 53efea05) — « tout bloque depuis hier » (mail du 25/10 15:11)

**Ce qui est observé (edge_logs, function_edge_logs, usage_logs, bordereaux_demandes)** :
- Il utilise l'**app web** sous Chrome Windows (aucun user-agent mobile depuis le 23/10). Sa page tourne sur la
  **dernière version** : `profiles.app_build` = `2026-10-25T10:22:55Z+d9e1819`, posé par son chargement de 15:11:44
  (16 chargements depuis le 24/10 21:13, dont 8 entre 12:39 et 12:56 le 25/10). Pas de version en cache — et l'app
  web se met déjà à jour seule (`/build.json` relu toutes les 5 min et au retour sur l'onglet, rechargement quand rien
  n'est en cours, sinon un bandeau « Recharger »).
- **Publier** : le 25/10 à 12:43 et 14:20, il clique « Publier » sur une fiche importée de Vinted le jour même
  (1792928353086006, « Plat creux en faïence », sans description). La suite exacte de ses requêtes : lecture des
  captures → règle « annonce d'origine d'abord » relue → `demander_lecture_origine` → **plus rien** (aucun
  `fiches_annonce`, aucun `generate-listing`, aucun `spend_coins_and_publish`). Le code servi (d9e1819,
  `StockTab.publierAvecDetail`) montrait une bulle de 7 s et ne s'ouvrait pas : l'impasse E1 de l'audit. Le 24/10 à
  13:54, la même suite était allée jusqu'à la publication (lecture réussie). La lecture de ses fiches Vinted passe
  par son extension 0.6.141, dont le lecteur de fond est mort (cause prouvée § 1) ; la page la fait une à une, et
  une demande de lecture déjà faite restait ouverte (1792780708414005, relue à chacun de ses chargements).
- **Bordereaux (« la messagerie bugue »)** : ses 7 demandes des 24-25/10 sont en `copie_http_400` — le stockage
  refuse le PDF : la politique `bordereaux_insert` n'accepte que les comptes de la bêta messagerie, alors que les
  bordereaux sont ouverts aux Pro/Business depuis le 24/10 (`messagerie_beta` = false, `bordereaux_ouverts_pour` =
  true chez lui). Correctif écrit : `PROPOSITION_20261025_bordereaux_copie_pro_business.sql.txt` (feu vert de Nico).
- **Contact** : aucun appel à `send-bug-report` sur tout le parc depuis 24 h (ni réussi ni refusé) : rien d'observé
  chez lui. Le formulaire signale désormais lui-même un refus ou une session expirée (ci-dessous).
- **Republier** : aucune tentative visible dans ses journaux depuis le 23/10 20:30 (dernière republication manuelle,
  réussie) ; ses republications automatiques des 23 et 24/10 visaient des annonces Vinted disparues (10117159001 :
  « Page not found », vu le 25/10) — § 7.

**Ce qui est corrigé (pour tous)** :
- « Publier » sur une fiche pas encore lue n'est plus une impasse (`src/publication/AttenteLectureOrigine.jsx`) :
  un écran lit tout de suite (page publique, 1 à 2 s avec la 0.6.144), relit seul toutes les 6 s (5 min au plus),
  ouvre le stepper dès que c'est lu, dit ce qui se passe (pont à recharger, extension absente de l'appareil),
  « Fermer » laisse la lecture continuer ; jamais « Écrire ma description » pendant l'attente (méthode de Nico :
  seulement si l'annonce d'origine n'a vraiment aucun texte — le stepper le dit alors).
- Chaque action ratée de l'app est signalée au serveur (`src/utils/actionRatee.js`, `usage_logs.action_app_ratee`) :
  publication en attente ou refusée, rédaction ratée, republication retenue ou refusée (unité, lot), contact refusé
  ou session expirée, exceptions non rattrapées (5 par onglet) ; sans session, l'échec attend dans le navigateur et
  part à la session suivante. Le digest a deux alertes : « actions app en échec » et « comptes actifs dont les
  actions app s'arrêtent net » (selftest `action-app-ratee`, 28 contrôles).
- Une lecture faite au stepper ou au lot ferme sa demande (plus de relecture à chaque chargement).

## 7. Les autres comptes « arrêtés net » (mesure du 25/10, 16:07)

- **Pas de panne générale** : depuis le 24/10 22:00, 28 comptes ont agi depuis l'app (105 publications, 622
  republications manuelles, 76 rédactions, 24 Lens — 727 appels de page, aucune erreur), sur web Windows, iOS et Android,
  avec les mêmes versions que les comptes de la liste de Nico.
- Sur les 17 comptes de la liste : **un seul blocage prouvé, Jocabroc** (§ 6) ; Alizee, XEWER, Sébastien, Deborah agissent
  et leurs gestes aboutissent (Alizee : 235 republications acceptées à 15:55) ; Camille, Thierry, Vincent, Asma sont revenus
  sans aucune tentative visible ; MeMiniandMove, Amiral, dbz70, Juliette, Srideals, Alicéane, Glowik, kevin ne sont pas
  revenus (leurs « chargements » sont les rechargements automatiques de l'app après un déploiement).
- La signature « lecture d'origine demandée, puis rien » n'apparaît que chez Jocabroc (×2) et un compte dont l'extension
  est muette depuis le 22/10. 27 lectures demandées n'ont jamais été faites, dont 22 chez Alizee (24/10 18:59-19:01) :
  extension 0.6.131 puis 0.6.141, lecteur mort jusqu'à la 0.6.144.
- Détail : `COMPTES-ARRETES-NET.md` (même dossier ; méthode : `set_app_build` hors fenêtres de rechargement automatique,
  en-tête `x-client-info` de la page).

## 8. La republication planifiée de Jocabroc (créneau 19:00-22:00) — causes prouvées, décision de Nico

- **Vinted 1 sur 6 (23 et 24/10)** : son Chrome était éteint pendant le créneau (aucun poll de 16:58 à 21:12 le 24/10 ;
  plus rien après 21:03 le 23/10) ; et les annonces Vinted **mortes** restent candidates (10117159001, 10164221462,
  10176517596, 10118315224 : absentes de 20 à 35 relevés complets, « Page not found » vu le 25/10) — chacune prend une
  place des 6 et 30 min de rythme, et une place prise par un essai sauté n'est jamais rendue.
- **Leboncoin 0 sur 5 sans motif (24/10)** : deux retenues muettes du balayage (Chrome absent, puis le rythme du COMPTE
  pris par Vinted : 30 min contre 36) ; aucun job Leboncoin n'est né. Ni la sonde Leboncoin (403) ni l'extension n'y sont
  pour rien. La baisse des éligibles (121 → 35-51) est juste : 83 annonces Leboncoin disparues écartées depuis le 23/10.
- **6 + 5 dans le même créneau est impossible avec le rythme partagé** (règle du 18/09, « un seul Chrome ») : ~6 au total.
- **Proposition écrite, NON appliquée** (Nico, 25/10 : « pour la republication on ne touche à rien ») :
  `PROPOSITION_20261025_creneau_remplace_les_sautes.sql.txt` (+ inverse, essai joué) — un sauté rend sa place, les
  annonces mortes sont écartées avant tout essai, chaque retenue écrit son motif. Pour 6 + 5 : le rythme par plateforme
  (cadence : décision de Nico). Détail : `CRENEAU-JOCABROC.md` (même dossier).

## 9. Lecture complète des autres plateformes (méthode de Nico) — mesuré, et un défaut de production corrigé

- Le vrai manque hors Vinted est petit : fiches vivantes dont le champ manquant n'a jamais été lu — Beebs 390, Leboncoin
  528, eBay 67, Depop 0 (contre 67 405 fiches Vinted sans texte) ; les pourcentages de départ comptaient les fiches
  fusionnées. Détail, sources par champ et mesures anti-robot : `LECTURE-FOND-AUTRES-PLATEFORMES.md`.
- **Corrigé et prouvé en prod (16:20, releve-completer v4)** : le relevé serveur réécrivait chaque annonce Beebs à chaque
  passage (comparaison d'un jsonb relu, aux clés rangées par Postgres, avec un objet JS) — « 600 écrites, 0 inchangée »
  toutes les 15 min depuis au moins le 18/10, toujours les 3 mêmes comptes, les autres jamais servis. Passage de 16:22 :
  **812 inchangées**, 226 écrites ; eBay 0 réécriture (25 avant). Selftest `releve-completer-inchange`.
- Le reste (décision et mesure) : Leboncoin — le relevé lit toute la liste mais n'écrit que 400 captures (budget) ;
  Beebs — lecture des photos en arrière-plan (extension 0.6.145, pilote 48 h sur le poste de Nico) ; `annonce_donnees`
  (migration : prendre la première valeur saine).

**Nettoyage de la preuve (16:15 → 16:25)** : l'annonce de test retirée depuis l'app (« Gérer les plateformes ») — vu sur
les plateformes à 16:25 : Vinted « Page not found », Leboncoin « Cette annonce est désactivée », eBay terminée, Depop
introuvable. Beebs : le retrait attend que Beebs sorte l'annonce de son examen (garde de 7 jours : « pas encore visible
sur Beebs, FillSell la retirera dès qu'elle apparaît »).

## 10. Livré

- Extension **0.6.144** : `build\CWS-0.6.144-A-TELEVERSER\fillsell-extension-0.6.144-7b08e45-cws.zip` (à téléverser par Nico).
- **OTA 2.9.116** servie à 16:30 ; web au push.
- Fonctions : get-pending-jobs v286, update-job-status v150, handler-watch v131, ebay-api-worker v98, ops-digest v41,
  releve-completer v4.
