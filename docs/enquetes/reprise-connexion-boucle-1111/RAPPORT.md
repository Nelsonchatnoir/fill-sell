# 11/11/2026 — la boucle des relevés « reprise_connexion » (09/11 14:09 → 11/11)

Heures de Paris partout. Point « B5 élargi » du lot de Nico du 11/11 : enquête, contre-enquête (cause confirmée), puis
correctif. Aucun pseudo ni annonce de client ici : des débuts d'identifiants de compte (8 caractères) et des chiffres.

Garde-fous de Nico, mot pour mot : « le relevé unique après une VRAIE reconnexion doit continuer de partir (c'est voulu) ;
aucune baisse des relevés planifiés normaux ; ne rien supprimer dans vinted_sync_runs ; zéro régression sur la détection
des ventes et des retraits ; ne pas casser les correctifs Cloud du 09/11 (un seul exécutant, relevé seulement sur poste
connecté). »

## En une phrase
handler-watch (cron toutes les 3 min, seul à écrire `reprise_connexion`) calculait ses gardes sur une lecture que
PostgREST coupait à 1 000 lignes sans le dire : il ne voyait plus ni le relevé réussi ni les reprises déjà posées, et
reposait un relevé à chaque passage. La règle était juste ; sa lecture, non. Le correctif ne change que la lecture.

## La cause
- La règle « un relevé de veille au retour de la connexion » (`_shared/releves-de-veille.js`, rallumée le 05/11 par
  `40413c5`) : un relevé après une vraie reconnexion, 15 min après le dernier relevé réussi, 3 reprises au plus par
  épisode, jamais pendant une pause Leboncoin.
- Sa lecture, dans `handler-watch/index.ts` : pour TOUS les comptes ayant eu un mur de connexion en 7 jours, 30 jours de
  relevés Leboncoin / Beebs / Depop en une requête `.limit(2000)`, sans tri ni pages, erreur non lue.
- PostgREST rend 1 000 lignes au plus, sans erreur. Le plan est un Bitmap Heap Scan : l'ordre physique, donc les lignes
  les plus anciennes. Les trois gardes « déjà reparti », « 15 min » et « 3 par épisode » ne lisaient que cet historique ;
  une ligne absente valait « garde ouverte ». Seule tenait la garde « rien en file » (lue à part) : d'où exactement un
  relevé par passage, dès que le précédent est fini.
- Pourquoi le 09/11 : c'est un seuil de données, pas un déploiement. Jusqu'à 14:06 l'historique demandé faisait 599 à
  831 lignes. À 14:06:20 un compte de plus touche un mur (785352fe, 244 relevés en 30 jours) : 1 017 lignes. Passage de
  14:09:08 : 1 000 lignes rendues. 14:09:09 : premier relevé hors règle. Chaque relevé de la boucle ajoute une ligne
  (2 947 le 11/11 à 11:41) : la coupe s'aggravait seule.
- La coupe explique aussi le creux du 09/11 vers 15 h : à 15:30:14 et 16:15:13 le dernier relevé réussi de trois comptes
  était par hasard DANS les 1 000 lignes rendues (rien posé) ; à 16:18:10, après un mur de plus (1 029 → 1 211 lignes),
  il n'y était plus : trois relevés posés ensemble à 16:18:11. Par heure le 09/11 : 10 à 14 h, 1 à 15 h, 31 à 16 h, 29
  à 17 h, puis 40 à 79.
- La même lecture ne lit pas ses erreurs : pendant une coupure de la base, un historique non lu ouvre toutes les gardes
  de chaque candidat (seul l'index unique « un seul relevé en file » empêche un doublon). Le code corrigé ne pose rien
  dans ce cas.
- Ce que ce n'est pas : un drapeau jamais consommé, un relevé vide tenu pour un échec (1 516 relevés de la boucle sur
  1 534 sont réussis), deux exécutants, le compte Leboncoin partagé par deux comptes FillSell (chacun a son mur et sa
  boucle), l'extension (elle n'écrit jamais ce déclencheur), get-pending-jobs, le Cloud, « Me reconnecter » (tous
  postérieurs de plus de 6 h au premier relevé hors règle).

## Les preuves (lues en base et dans les journaux le 11/11 de 10:20 à 12:40, lecture seule)
- Journal de l'API, requête de handler-watch sur `vinted_sync_runs` (`limit=2000`, colonne `declencheur`) : réponse
  `0-771/*` au passage du 09/11 14:06:07, `0-999/*` à partir de 14:09:08. Sur les 24 h d'avant : 469 passages, 750 à
  803 lignes rendues, jamais 1 000. Le 11/11 de 06:40 à 12:40 : 117 passages sur 117 coupés à 1 000. Statut 200, jamais
  d'erreur.
- Taille de l'historique demandé : 772 lignes le 09/11 à 14:00, 1 017 à 14:15, 1 228 à 16:30, 2 935 le 11/11 à 11:19
  pour 40 comptes. Maximum du 04/11 au 09/11 14:00 : 831.
- Ce que la coupe enlevait (instantané de 11:02:43) : 1 000 lignes gardées (médiane le 01/11), 1 918 coupées (médiane
  le 10/11 à 04:01) ; lignes démarrées depuis le 09/11 14:00 : 5 gardées, 1 709 coupées ; dernier relevé réussi absent
  pour 37 couples compte-plateforme sur 51.
- Rejeu de la règle sur trois instantanés de prod (deux de l'enquête, un de la contre-enquête) : historique complet →
  0 relevé ; coupé à 1 000 → 98b72757, faf5021a et 447d920c (11:02:43), 14e536e0 et 447d920c (11:19:48), faf5021a et
  447d920c (11:41:46), soit exactement les relevés posés par les passages réels de 11:03:11, 11:21:10 et 11:42:13.
- Premier relevé hors règle : f8a94c06, Beebs, posé le 09/11 à 14:09:09 — mur du 08/11 00:39:23, relevé déjà réussi le
  09/11 à 11:56:52. Les 12 relevés du 05/11 15:40 au 09/11 14:09 sont tous conformes.
- Hors règle depuis la coupe (11/11 11:10) : 1 534 relevés, dont 1 519 posés alors qu'un relevé avait déjà réussi après
  le mur et 1 508 posés moins de 15 min après un relevé réussi. Avant la coupe : 0 sur 12.
- Seul écrivain : handler-watch (0 occurrence dans l'extension, le serveur Cloud et get-pending-jobs ; en base, deux
  fonctions SQL citent ce déclencheur, aucune n'insère dans `vinted_sync_runs`).
- Les autres déclencheurs n'ont pas bougé du 04/11 au 10/11 (cron 93 à 139 par jour, veilleur 45 à 152, app 113 à 243,
  serveur:quotidien_api 91 à 105) ; `reprise_connexion` : 0, 0, 5, 1, 1, 357, 1 040.

## L'étendue
Au 11/11 à 12:27 : 1 572 relevés depuis le 09/11 14:09:09 — Leboncoin 983 (11 comptes), Beebs 589 (4 comptes), Depop 0,
eBay 0, Vinted 0 ; 12 comptes, 15 couples compte-plateforme ; 301 102 annonces Leboncoin relues. Avant : 12 relevés en
3,9 jours. Boucle encore active à 12:39 (dans l'heure : 447d920c 14 relevés, faf5021a 11).

Détail par couple, lu à 11:21 (1 543 relevés alors) :

| plateforme | compte | relevés | premier | dernier | au plus par heure | annonces lues par relevé |
|---|---|---|---|---|---|---|
| Leboncoin | faf5021a | 526 | 09/11 22:39 | 11/11 11:06 | 20 | 388 |
| Leboncoin | 447d920c | 167 | 09/11 22:36 | 11/11 11:21 | 19 | 387 |
| Leboncoin | 6532bae3 | 105 | 09/11 14:45 | 09/11 22:42 | 16 | 10 |
| Leboncoin | 229c7b07 | 60 | 09/11 14:18 | 10/11 03:30 | 19 | 334 |
| Leboncoin | f0acd3af | 46 | 09/11 16:18 | 09/11 22:30 | 18 | 0 |
| Leboncoin | 14e536e0 | 16 | 11/11 10:12 | 11/11 11:21 | 10 | 13 |
| Leboncoin | ebdf29f0 | 12 | 10/11 17:54 | 10/11 19:18 | 8 | 16 |
| Leboncoin | 98b72757 | 10 | 11/11 10:33 | 11/11 11:06 | 7 | 26 |
| Leboncoin | 785352fe | 9 | 09/11 15:03 | 09/11 16:39 | 8 | 26 |
| Leboncoin | 4cfb7afe | 2 | 10/11 22:48 | 10/11 23:48 | 1 | 0 |
| Leboncoin | d199706c | 1 | 09/11 19:09 | 09/11 19:09 | 1 | 0 |
| Beebs | 229c7b07 | 434 | 09/11 18:24 | 10/11 19:24 | 20 | 0 |
| Beebs | f8a94c06 | 106 | 09/11 14:09 | 10/11 12:03 | 12 | 20 |
| Beebs | 4cfb7afe | 41 | 09/11 16:18 | 09/11 19:18 | 20 | 0 |
| Beebs | ebdf29f0 | 8 | 10/11 18:18 | 10/11 19:24 | 5 | 47 |

- faf5021a et 447d920c sont branchés sur le même compte Leboncoin : il a été lu environ 690 fois en 36 h.
- f0acd3af : 42 de ses 46 relevés ont été exécutés par son poste Cloud.
- Exposé à tout passage : tout compte qui touche un mur de connexion puis se reconnecte, navigateur ouvert — c'est
  l'ordre physique des lignes qui décidait. La boucle Beebs s'est arrêtée le 10/11 à 19:26 par hasard (un relevé a
  échoué sur autre chose qu'un mur).
- Un 13e compte (9156866f, Leboncoin) a reçu 2 relevés dans l'heure avant 12:45 : vraie reconnexion ou boucle, non
  vérifié.

## Les effets de la boucle (mesurés par la contre-enquête, 11/11 de 12:20 à 12:40)
La première mesure (« 0 annonce créée, 0 modifiée », sur `items_crees` et `items_maj`) était aveugle aux déclencheurs
de fin de relevé et à la charge d'écriture. La boucle a eu des effets :
- **Absences : 126 TRACES, 8 DATES posées, 0 à tort** (enquête dédiée, 11/11 de 12:55 à 13:35). La contre-enquête avait
  compté 126 « annonces datées disparue » par un relevé de la boucle servant de 2e preuve (123 sur deux relevés de la
  boucle espacés de 5 à 10 min) ; ce sont des traces : la fin d'un relevé retraite aussi les annonces DÉJÀ datées et
  garde leur date. La boucle n'a posé une date que sur 8 annonces : 7 annonces « en pause » d'un compte inscrit le
  11/11 (14e536e0, sans fiche, absentes de 26 relevés complets depuis) et 1 ancienne annonce de 229c7b07 que FillSell
  avait lui-même remplacée par une republication le 09/11. Les 118 autres étaient déjà datées par nos propres gestes
  (106 remplacées par une republication FillSell, 12 retirées par un retrait FillSell). Par compte (traces / dates de la
  boucle) : 229c7b07 84 / 1, faf5021a 25 / 0, 447d920c 9 / 0, 14e536e0 7 / 7, 785352fe 1 / 0. Beebs : 0. Aucune revue en
  ligne depuis. Rien déclenché : 0 job marqué « plus en ligne », 0 carte « Vendue ? », 0 retrait armé, 0 vente supposée,
  0 mail, 0 notification, 0 republication annulée ou déclenchée. **Aucune réparation de données** (décision de Nico du
  11/11). L'écart minimal entre deux preuves d'absence (5 min, 28/09) est gardé (décision de Nico). Preuve en lecture
  seule, à rejouer une heure après le déploiement : `scripts/reparations/20261111_disparitions_boucle_releves_PREUVE.sql`
  (ignoré par git ; joué le 11/11 à 13:30 : 8 / 12 / 106, 0 « autre », 0 revue en ligne).
- **Écritures multipliées par 11** : chaque relevé réécrit toutes les annonces du compte (`run_id`, `vu_le`), même
  quand rien ne change. Écritures de l'API sur `annonces_plateforme` : 9 359 le 07/11, 9 957 le 08/11, 110 980 le 10/11.
  Le 11/11 de 11:35 à 12:35 : 29 relevés de la boucle = 10 720 annonces lues, contre 3 095 pour les 31 autres relevés
  (78 %). Le CPU moyen de la base (17 à 19 % du 08/11 au 10/11) ne montre pas cette charge.
- **La base** a rendu des erreurs 5xx de 11:30 à 11:36 puis de 12:39 à 12:48 et a redémarré (11:35:29, puis 12:44). Le
  lien de cause avec la boucle n'est pas prouvé.
- **Les absences des AUTRES plateformes** : la fin d'un relevé cherche le relevé précédent de la plateforme parmi les 50
  derniers relevés du compte, toutes plateformes confondues. Noyé par la boucle, il en est sorti pour au moins 11
  relevés réussis sur 47 examinés (229c7b07 eBay 4 fois et Leboncoin 3 fois le 10/11, 447d920c Depop, 6532bae3 eBay,
  f8a94c06 eBay et Depop) : à ces relevés-là aucune absence n'a pu être datée ; le relevé suivant rattrape.
- **Ce que voit le client** : l'app lit les 200 derniers relevés réussis du compte. Pour faf5021a (773 réussis en 30
  jours), ceux d'eBay, de Beebs et de Depop n'y sont plus : « Synchronisé il y a… », le détail de la carte et le
  grisage du bouton sont faux pour ces trois plateformes (les 10 autres comptes relus ne sont pas touchés). Pendant la
  boucle, « Synchroniser » ne pose pas de relevé : un relevé de la boucle est en file ou vient de réussir.
- Aucune pause Leboncoin posée sur ces comptes (lu à 11:15).

## Le correctif (la règle, pour tous les comptes ; rien d'autre que la lecture)
`supabase/functions/_shared/releves-de-veille.js` :
1. `candidatsReleveDeVeille` (pur) : ce qui se décide SANS l'historique — le plus récent arrêt de 7 jours est un mur,
   extension vue, session connectée, sonde de moins de 3 h et postérieure au mur, pas de pause Leboncoin. TOUS les
   candidats, murs les plus récents d'abord, jamais coupés.
2. `trancheReleveDeVeille` (pur) : les candidats LUS à ce passage — tous sous le plafond (30) ; au-delà, une tranche de
   30 dont le départ avance d'un pas q à chaque passage du cron, q = le plus grand entier ≤ 30 premier avec n
   (`pasDeTranche`). La fonction edge n'a pas de mémoire : le numéro du passage se lit sur l'heure (pas de 3 min, celui
   du cron `handler-watch-3min`). À nombre de candidats constant et à la cadence du cron, chacun est lu au moins une
   fois tous les ceil(n / q) passages ; si des passages manquent (cron plus lent, passage qui n'atteint pas le bloc),
   plus tard mais jamais oublié ; si n change entre deux passages, la tranche saute et l'attente peut s'allonger d'un
   passage ou deux. **Plafond codé par défaut, à confirmer ou à retirer par Nico.**
3. `lireEtatReleveDeVeille` : l'état EXACT d'un candidat, lu par clé (compte, plateforme) — d'abord le dernier relevé
   réussi des 30 jours (date de fin non vide, tri décroissant, 1 ligne) ; s'il est postérieur au mur, la lecture
   s'arrête là. Sinon : en file ou en cours (1 ligne), puis les reprises posées depuis ce relevé réussi, à défaut depuis
   30 jours (3 lignes au plus). Une erreur, une réponse inattendue, une date illisible ou une exception rendent
   `{ lu: false }`.
4. `gardeReleveDeVeille` et `relevesDeVeilleAReposer` (purs) : les gardes d'avant, inchangées (déjà reparti, en file,
   15 min, 3 par épisode, interrupteur), sur cet état. Un état absent, non lu ou incomplet ne pose RIEN.

`supabase/functions/handler-watch/index.ts`, bloc « LE RELEVÉ AUSSI REPART TOUT SEUL » : la lecture d'historique en vrac
et sa lecture « en file » sont supprimées ; les arrêts de 7 jours se lisent par pages (`lirePagesDisparues`) ; l'état
est lu avant l'interrupteur, et `sync_multi_ouverte_pour` n'est appelée que pour les candidats qu'aucune garde ne
retient ; un journal par passage : « relevés de veille : N candidat(s), N reposé(s), N état(s) illisible(s) (motif) ;
retenus : N déjà reparti, N en file, N cadence, N plafond de l'épisode ; N interrupteur(s) fermé(s) » (et « plafond du
passage atteint » quand la tranche tourne, « N non écrit(s) par la base (motif) », « arrêts lus coupés à 5 000 »). Une
lecture ratée ne se tait plus : arrêts ou profils illisibles → rien à ce passage et une ligne d'erreur ; état ou
interrupteur illisible ou interrompu → fermé, compté et nommé au journal. `relevesDeVeilleAReposer` appelée avec
l'ancien contrat (`{ arrets, historique, … }`) lève au lieu de rendre `[]` en silence.

Ce qui ne change pas : la règle (constantes comprises), la ligne posée (`ligneReleveDeVeille`), les relevés planifiés
(cron, veilleur, app, serveur), la détection des ventes et des retraits, get-pending-jobs et les correctifs Cloud du
09/11, `vinted_sync_runs` (rien supprimé, rien réécrit). Aucune migration, aucune OTA, aucune extension, rien sur le
Cloud. Au premier passage après le déploiement, les comptes en boucle sont retenus par « déjà reparti ».

Choix de lecture, pour que la règle décide comme avant sur un historique complet :
- les fenêtres d'avant sont gardées (30 jours sur `started_at` pour le dernier réussi et les reprises) ;
- le plus récent arrêt d'un couple se choisit par sa date, quel que soit l'ordre d'arrivée des pages.

Trois corrections de la contre-enquête, appliquées avant la livraison :
- le premier jet coupait les candidats à leurs 30 premiers (murs les plus récents) : ce tri étant le même à chaque
  passage, au-delà de 30 candidats les murs les plus anciens n'auraient JAMAIS été lus — le relevé voulu après une vraie
  reconnexion ne serait jamais parti pour eux. D'où la tranche tournante ;
- le premier jet lisait trois fois par candidat et demandait l'interrupteur pour tous (36 appels par passage) ; le
  dernier relevé réussi est maintenant lu d'abord ;
- « dernier réussi » exige une date de fin non vide, épinglée par un cas de selftest : un tri décroissant met les dates
  vides en tête, une ligne réussie sans fin masquerait le vrai dernier relevé réussi (0 ligne de ce genre sur 7 276
  lignes de 30 jours, mesuré le 11/11).

Corrections de la relecture (trois relecteurs, 11/11 à 13:44 : aucun défaut dans le code de production), appliquées
avant le commit : le verrou exécute désormais le VRAI bloc de handler-watch (§ 12) au lieu d'une copie ; le journal
nomme la garde qui retient chaque candidat, compte l'interrupteur interrompu, nomme une insertion refusée et dit la
coupe des arrêts à 5 000 ; la tranche avance d'un pas premier avec n ; l'ancien contrat de `relevesDeVeilleAReposer`
lève ; des cas neufs (relevé en cours sans réussi après le mur, relevé réussi d'une autre plateforme, sonde de 2 h 50 et
de 3 h 10, textes réels des murs Depop et Cloud alors non reconnus — reconnus depuis, voir « Les murs Depop et Cloud »).

## L'état résiduel (les lignes de la boucle restent, consigne de Nico) — aucun script, à contrôler après le déploiement
- Le premier relevé de chaque AUTRE plateforme d'un compte de la boucle ne datera aucune absence (son relevé précédent
  est hors des 50 derniers relevés du compte) ; le relevé suivant rattrape.
- L'app de faf5021a ne montrera le dernier relevé réussi d'eBay, de Beebs et de Depop qu'après un nouveau relevé réussi
  de chacune ; même saturation pour l'heure de la prochaine synchronisation automatique (300 lignes sur 3 jours).
- Les 8 dates d'absence posées par la boucle restent (aucune à tort) ; les 118 autres traces portaient déjà une date.
- Les reprises de la boucle comptent dans l'épisode (3 reprises au plus depuis le dernier relevé réussi) : pour un compte
  dont le dernier relevé de la boucle a échoué sur un mur, l'épisode peut déjà être au plafond — son prochain relevé
  voulu attendra le prochain relevé réussi. À compter par couple au contrôle d'après déploiement.
- Environ 100 000 lignes écrites par la boucle dans la table des imports écartés (`sync_import_ecartes`, comptes
  faf5021a et 447d920c, estimation du planificateur) : purge APRÈS le déploiement, sur décision de Nico du 11/11 —
  uniquement les lignes écrites par les relevés de la boucle (preuve de sélection d'abord), avec sauvegarde, script
  montré avant de lancer.

## Le verrou — `npm run selftest:releves-de-veille` (111 contrôles à la livraison de B5, dont 79 neufs : § 6 à 13 ; 137 depuis les murs Depop et Cloud et la preuve par exécutant, § 12 et § 13 bis)
Un faux serveur qui coupe comme le vrai (1 000 lignes au plus, sans erreur, ordre physique), sur le parc du 11/11 à
11:03 en chiffres : 2 935 lignes, 40 comptes à mur, 526 reprises réussies après le mur du premier compte.
- Écrit AVANT le correctif et lancé sur le code d'alors : ROUGE — « reposés : c01|leboncoin, c02|leboncoin,
  c04|leboncoin, c05|beebs » (les trois comptes en boucle, plus la vraie reconnexion). Après le correctif : VERT —
  seule la vraie reconnexion (c05) part.
- Le défaut d'avant y reste rejoué (la lecture en vrac reçoit 1 000 lignes sur 2 935 et repose les comptes en boucle),
  et la même règle sur l'historique complet ne repose que la vraie reconnexion.
- L'état lu est celui de l'historique complet, que le serveur coupe à 1 000 lignes, à 3 lignes, ou pas du tout : 7
  lectures pour 5 candidats (une par relevé déjà reparti, trois pour la vraie reconnexion), l'interrupteur demandé pour
  elle seule.
- Un état non lu ne pose rien : chacune des trois lectures en erreur, sans réponse lisible ou interrompue ; état absent ;
  état incomplet. Une ligne réussie sans date de fin ne masque pas le vrai dernier relevé réussi.
- La vraie reconnexion : un relevé ; rien tant qu'il est en file ; rien après un relevé réussi ; 2e puis 3e si le relevé
  retombe au mur (chacun après une sonde postérieure au nouveau mur), puis plus rien ; un relevé réussi clôt l'épisode.
  Réussi il y a moins de 15 min : rien. Épisode borné à 30 jours.
- Deux comptes FillSell sur le même compte Leboncoin : chacun son état. Le premier relevé hors règle (09/11 14:09:09)
  n'est plus posé.
- Aucun candidat privé de lecture : 35 murs → 35 candidats ; au-delà du plafond, chacun est lu en ceil(n / q) passages
  consécutifs ; 31 candidats dont 30 déjà repartis, la vraie reconnexion (mur le plus ancien) reçoit son relevé en 2
  passages au plus, une seule fois ; rotation sans oubli si le cron ne passe qu'une fois sur k (k de 1 à 30, n de 31 à
  120) ; la cadence de 3 min est épinglée sur celle du cron.
- Statique : dans le bloc de handler-watch, toute lecture de `vinted_sync_runs` est triée et lue par pages, aucune par
  `.in("user_id")`, aucun `.limit` de 1 000 ou plus, jamais de coupe des candidats, l'état lu avant l'interrupteur, les
  lignes de la colle épinglées ; dans le module, trois lectures de `vinted_sync_runs` au plus par clé (quatre lectures en
  tout au Cloud actif, avec la ligne du coffre), bornées, le dernier réussi d'abord.
- § 12, LE VRAI BLOC : le bloc de handler-watch est découpé dans `index.ts` avec `lirePagesDisparues`, ses types retirés
  (`typescript`) et exécuté sur le faux serveur (profils, interrupteur et insertion compris) : sur le parc du 11/11,
  seul c05 est reposé et le journal dit « 5 candidat(s), 1 reposé(s), 0 état(s) illisible(s) ; retenus : 4 déjà
  reparti » ; au passage suivant, rien (en file) ; états en panne ou interrompus, interrupteur fermé, en erreur ou
  interrompu, profils illisibles, insertion refusée, arrêt « expired » plus récent que le mur, 5 000 arrêts : rien de
  posé, et c'est dit.
- Le verrou mord : 40 défauts réintroduits un à un sur une copie (24 dans le module, 16 dans handler-watch — dont les 6
  que la relecture avait trouvés verts quand le verrou ne lisait que des présences) : 40 rouges, 0 vert. Écrit avant
  le correctif, le cas du parc du 11/11 était ROUGE sur le code d'alors (voir plus haut).

Rejeu du code corrigé sur les trois instantanés de prod, serveur plafonné à 1 000 lignes dans l'ordre physique : 9
candidats, 9 lectures d'une ligne, aucun appel d'interrupteur, 0 état illisible, 0 relevé reposé — comme la règle d'avant
sur l'historique complet (qui, coupé, en reposait 3, 2 et 2).

Suite complète des selftests : voir l'état de production à la livraison (relancée avant le commit, sortie à l'appui).

## Le coût
Par passage, avec les 9 candidats du 11/11 : la lecture des arrêts, celle des profils, puis 9 lectures d'une ligne, soit
11 appels — à la place d'une lecture de 1 000 lignes (2 935 parcourues), d'une lecture « en file » et de 40 appels
d'interrupteur. Un candidat qui n'est pas « déjà reparti » coûte deux lectures et un appel de plus ; au plus 30
candidats lus par passage.

Plans des trois lectures, lus en prod le 11/11 vers 12:10 (`EXPLAIN` sans exécution, compte faf5021a, le plus gros) :
- dernier réussi : `Bitmap Index Scan on vinted_sync_runs_user_date` (compte + 30 jours, 589 lignes estimées) puis tri
  d'une ligne (coût 517) ;
- en file : `Index Scan using vinted_sync_runs_un_seul_actif` (coût 2,35) ;
- reprises de l'épisode : même accès par `vinted_sync_runs_user_date`, filtre, 3 lignes au plus (coût 518).

Aucun balayage de table. « Dernier réussi » et « reprises » lisent les relevés de 30 jours du compte : aucun index ne
porte `finished_at` ni `queued_at`. Aucun index n'est créé par ce correctif.

Pire cas : une plateforme déconnecte beaucoup de comptes d'un coup et 30 se reconnectent dans le même passage — 90
lectures, 30 appels d'interrupteur et 30 insertions, en série, soit environ 150 appels (une quarantaine avant le
correctif, une dizaine en temps normal après).

La durée et le CPU de handler-watch ne peuvent se lire qu'en service (règle du projet : « CPU mesuré avant la prod ») :
mesurés sur les premiers passages après le déploiement et écrits dans l'état ; avant : médiane 9,9 s, maximum 26,9 s
sur 28 appels du 11/11 de 07:30 à 10:30. Un allongement net = retour immédiat à la version d'avant.

## La preuve avant / après — à lancer UNE heure après le déploiement (lecture seule)
Remplacer l'heure de « borne » par l'heure de Paris du déploiement de handler-watch.

```sql
WITH borne AS (SELECT '2026-11-11 15:00+01'::timestamptz AS t)
SELECT CASE WHEN r.queued_at < b.t THEN '1. heure AVANT' ELSE '2. heure APRES' END AS periode,
       r.platform AS plateforme,
       left(r.user_id::text, 8) AS compte,
       count(*) AS releves_reprise_connexion,
       count(*) FILTER (WHERE r.status = 'done') AS reussis,
       to_char(min(r.queued_at) AT TIME ZONE 'Europe/Paris', 'HH24:MI') AS premier,
       to_char(max(r.queued_at) AT TIME ZONE 'Europe/Paris', 'HH24:MI') AS dernier
FROM vinted_sync_runs r
CROSS JOIN borne b
WHERE r.declencheur = 'reprise_connexion'
  AND r.queued_at >= b.t - interval '1 hour' AND r.queued_at < b.t + interval '1 hour'
GROUP BY 1, 2, 3
ORDER BY 1, 2, releves_reprise_connexion DESC;
```

- Heure d'avant, mesurée le 11/11 de 10:15 à 11:15 : 447d920c 15, faf5021a 13, 14e536e0 12, 98b72757 10, soit 50 relevés
  Leboncoin.
- Attendu dans l'heure d'après : aucune ligne pour ces comptes ; au plus 1 relevé pour un compte qui vient de se
  reconnecter après un mur, jamais plus de 3 par épisode. Un relevé déjà en file à l'instant du déploiement s'exécute une
  dernière fois (il a été posé avant la borne).
- Niveau de référence d'avant le 09/11 : au plus 1 par heure pour un couple, 2 par heure sur tout le parc.

Contrôle « aucune baisse des relevés normaux », même borne :

```sql
WITH borne AS (SELECT '2026-11-11 15:00+01'::timestamptz AS t)
SELECT coalesce(r.declencheur, '(aucun)') AS declencheur,
       count(*) FILTER (WHERE coalesce(r.queued_at, r.started_at) <  b.t) AS heure_avant,
       count(*) FILTER (WHERE coalesce(r.queued_at, r.started_at) >= b.t) AS heure_apres
FROM vinted_sync_runs r CROSS JOIN borne b
WHERE coalesce(r.queued_at, r.started_at) >= b.t - interval '1 hour'
  AND coalesce(r.queued_at, r.started_at) <  b.t + interval '1 hour'
GROUP BY 1
ORDER BY 2 DESC;
```

- Mesuré le 11/11 de 10:20 à 11:20 : reprise_connexion 52, app 15, cron 11, serveur:quotidien_api 10, veilleur 7,
  bouton_distant 4. Attendu après : `reprise_connexion` proche de 0 ; cron, veilleur, app et serveur du même ordre.
- Ces deux requêtes parcourent `vinted_sync_runs` en entier (aucun index sur le déclencheur) : une fois chacune.

Et, sans requête sur la table :
- journal de l'API : plus aucune requête `vinted_sync_runs` à `limit=2000` avec `declencheur` ;
- journal de handler-watch, à chaque passage : « relevés de veille : N candidat(s), 0 reposé(s), 0 état(s)
  illisible(s) ; retenus : N déjà reparti » ; plus aucune ligne « relevé de veille … reposé en lecture seule » pour un
  mur déjà suivi d'un relevé réussi ; un essai réel se juge 15 min au moins après le dernier relevé réussi (garde
  « cadence », voulue) ;
- écritures de l'API sur `annonces_plateforme` revenues vers 10 000 par jour (110 980 le 10/11).

## Livraison
- handler-watch seule, `--no-verify-jwt` (appelée par le cron `handler-watch-3min`, sans session) ; version et
  `verify_jwt` lus avant et après. Déployer est un geste réservé (ordre de Nico) ; le CLI Supabase 3.1.0 demande `--yes`.
- Déployer depuis une archive du commit (`git archive`), jamais depuis le dossier partagé : le 11/11 à 12:46 il portait
  13 fichiers modifiés non commités d'autres chantiers, et 19 fichiers de `src/` sont dans les imports de handler-watch.
- Ce redéploiement met en service dans handler-watch 6 fichiers partagés changés depuis sa version actuelle (`904bacb`),
  pas 2 : `_shared/etat-job.js` (+3 lignes), `_shared/pas-de-rouge.js` (+11), `src/utils/shared.js` (+20, −3),
  `src/utils/messagesServeur.js` (+5), `_shared/ebay-refus-compte.js` (neuf, 193 lignes),
  `_shared/badge-vendu-avant-suivi.js` (neuf, 107 lignes). handler-watch n'en importe que `detectObjectIcon`,
  `CANAL_RE`, `decisionRefusContenuLeboncoin` et `empreinteTexteServi` : aucun changement de comportement attendu, à
  relire avant de déployer. Ils sont déjà servis par get-pending-jobs et update-job-status.

## Les murs Depop et Cloud (11/11, après B5, à part — décision de Nico)
Décision, mot pour mot : « OUI : les murs Depop et Cloud doivent être reconnus (un relevé après une vraie reconnexion,
comme ailleurs). Mais À PART, juste après B5, pas dans B5 : B5 reste petit. »

Les textes que nos relevés écrivent dans `vinted_sync_runs.erreur` pour un mur de connexion (lus dans le code et en base
le 11/11 vers 15 h, `kind='annonces'`, arrêtés, 14 jours) :
- ordinateur, Leboncoin et Beebs : « session <pf> : page de connexion … » (`background.js`) — Leboncoin « absente » 112 +
  88 (40 et 23 comptes), Beebs « absente » 68 (23 comptes). Déjà reconnu ;
- ordinateur, Depop : « [incomplet] Connexion Depop requise : connecte-toi à Depop sur ton ordinateur. · … »
  (`content-scripts/depop.js`, `listerMesArticles`), relevé « absente » — 6 sur 3 comptes (1 en 7 jours) ;
- copie Cloud, Leboncoin / Beebs / Depop : « FillSell Cloud : <pf> demande une reconnexion (session fermée ou jeton non
  renouvelé), aucune visite » (verrou, `scripts/cloud/build-extension-cloud.mjs`, `refusVerrouCloud`), relevé « failed » —
  Leboncoin 3, Beebs 2, Depop 1, sur 3 comptes, tous dans les 7 jours. Le texte d'avant le 05/11 (« … n'est pas connecté
  dans ce navigateur, aucune visite », 5 arrêts d'un compte, dernier le 04/11) n'est plus écrit : hors de la liste.
- Ce qui n'est PAS un mur (la reconnexion n'y change rien), lus sur la même période : « accès Depop non accordé » (24,
  13 comptes : permission d'hôte), « session Depop illisible (reseau) » (15), « « Mes annonces » n'a pas rendu sa liste
  (redirection du compte, challenge ou page non peinte) » (23 : l'extension la change déjà en « page de connexion »
  quand un signe de la connexion est vu), « [anti_robot] Beebs… » (6), demandes expirées ou jamais réclamées, chien de
  garde, chargements, écriture REST, index Beebs.

Le correctif (`_shared/releves-de-veille.js` ; dans handler-watch, une colonne de plus à la lecture des profils) :
- `MURS_CONNEXION_VEILLE` : une liste FERMÉE de trois textes écrits par nous, chacun avec la voie qui l'ÉCRIT
  (`voieMurVeille`, qui ne choisit plus la preuve) — Cloud : « FillSell Cloud : (leboncoin|beebs|depop) demande une
  reconnexion ( » ; ordinateur : « page de connexion », et le texte COMPLET « Connexion Depop requise : connecte-toi à
  Depop sur ton ordinateur. » (relecture : le début seul attrapait aussi les textes des TÂCHES Depop, « Connexion Depop
  requise : ta session Depop est fermée… », publication et retrait). `murConnexionVeille` lit cette liste.
- LA PREUVE DE SESSION REVENUE SUIT L'EXÉCUTANT DU RELEVÉ, QUEL QUE SOIT LE TEXTE DU MUR. Question posée à Nico le 11/11
  vers 15:25, mot pour mot : « pour un compte, la preuve que la session est revenue doit-elle suivre celui qui EXÉCUTE le
  relevé (Cloud actif → la connexion vérifiée du Cloud ; sinon → la sonde de l'ordinateur), quel que soit le texte du
  mur ? » — réponse : « Suivre l'exécutant ». Le premier jet lisait la preuve sur le texte du mur : un mur « page de
  connexion » d'un compte au Cloud actif se jugeait sur la sonde de l'ordinateur alors que le relevé irait au Cloud, et
  un mur du Cloud d'un compte au Cloud arrêté n'avait jamais de relevé (« Cloud du compte inactif ») alors que
  l'ordinateur le ferait.
  - L'exécutant (`executantReleveDeVeille`) : `profiles.cloud_voie` vrai → le Cloud ; sinon → l'ordinateur. Vérifié dans
    get-pending-jobs : au Cloud actif, un relevé « annonces » de Leboncoin, Beebs ou Depop n'est jamais servi à
    l'ordinateur (`commandeLaisseeAuCloud`, filtre posé à la source, `lireCommandesEnFile` ; verrou
    `selftest:cloud-un-executant`), il reste en file pour le poste Cloud, qui le reçoit (`PLATEFORMES_POSTE_CLOUD` :
    Vinted, Leboncoin, Beebs, Depop) ; au Cloud arrêté, il part au poste qui le réclame — l'ordinateur.
  - Ordinateur (Cloud arrêté) : la sonde, fraîche (3 h) et postérieure au mur — inchangée, mur du Cloud compris.
  - Cloud (Cloud actif) : la sonde ne prouve rien (l'ordinateur ET la copie Cloud écrivent `profiles.extension_sessions` :
    le compte 09/11-soir d813639b a sa sonde Leboncoin de l'ordinateur « connecté » après son mur Cloud). La preuve est
    celle de l'orchestrateur, déjà en base : `cloud_coffre` (compte, plateforme) `connecte = true` — posé par une
    connexion VÉRIFIÉE (« Me connecter », compte lu par l'orchestrateur, `connexion.js`), rafraîchi à chaque sauvegarde du
    navigateur (les 8 lignes connectées des comptes au Cloud actif avaient toutes `maj_le` de 3 min au moment de la
    lecture), retombé à « à reconnecter » quand le verrou ne rouvre plus la plateforme (`coffre.aReconnecter`) — avec
    `maj_le` postérieur au mur et de moins de 3 h. Mur de l'ordinateur compris (« page de connexion », Depop).
  - `cloud_voie` est lu par handler-watch dans sa lecture des profils PAR LOTS (une colonne de plus) ; le module ne lit
    plus aucun profil (la lecture par clé du premier jet est retirée). La preuve du Cloud se lit par clé
    (`lirePreuveCloudVeille` : une ligne du coffre), après le dernier relevé réussi, avant « en file ». Garde neuve au
    journal : « session Cloud non revenue » ; « Cloud du compte inactif » disparaît. Un candidat sans exécutant connu ne
    pose rien (jamais l'ordinateur par défaut).
- Un mur du Cloud qui se répète ne boucle pas : le coffre est réécrit à chaque sauvegarde même quand le verrou refuse
  encore la plateforme, la preuve tient à chaque passage, et c'est le plafond de l'épisode qui borne — 3 relevés, puis
  plus rien jusqu'au prochain relevé réussi (épinglé au verrou, § 12 et § 13 bis).
- Coût, en lectures d'une ligne par candidat lu (30 au plus par passage) : déjà reparti 1 (inchangé) ; ordinateur 3
  (inchangé) ; Cloud actif sans reconnexion 2 (inchangé), avec reconnexion 4 (5 au premier jet : la ligne du profil). La
  lecture des profils par lots porte une colonne de plus, aucun appel de plus. Qui est candidat change : un mur de
  l'ordinateur d'un compte au Cloud actif l'est sans sonde (2 lectures par passage tant que le mur tient, 7 jours au
  plus, 1 dès qu'un relevé a réussi après lui) ; un mur du Cloud d'un compte au Cloud arrêté ne l'est plus qu'avec une
  sonde fraîche postérieure au mur (le premier jet lui donnait 2 lectures par passage pour aucun relevé possible).
- Lu le 11/11 vers 15 h : 6 couples à mur Cloud, aucun avec une ligne au coffre pour la plateforme — 3 d'un compte au
  Cloud actif (trois plateformes jamais connectées : rien ne part), 3 de 2 comptes au Cloud arrêté, désormais jugés sur
  la sonde de l'ordinateur (un relevé au plus si elle est fraîche et postérieure au mur, 3 par épisode ; sondes non
  relues). Le nombre de murs de l'ordinateur sur des comptes au Cloud actif n'a pas été compté.

Le verrou (`selftest:releves-de-veille`, § 12 et § 13 bis, 137 contrôles). Premier jet : écrit AVANT le code, ROUGE (18
échecs sur 129), puis VERT (130/130). Preuve par exécutant : les cas neufs écrits AVANT le code et lancés sur le premier
jet : ROUGE, 12 échecs sur 137 — 5 de comportement (mur de l'ordinateur au Cloud actif, mur du Cloud au Cloud arrêté, par
le module et par le vrai bloc ; texte de tâche Depop pris pour un mur ; candidat sans exécutant), 4 par la seule lecture
du profil par clé (les deux cas « mur du Cloud répété », le cas réel Cloud et le vrai bloc Depop-Cloud, dont le
comportement était déjà juste), 1 par le nom du champ (`executant`), 2 statiques ; après : VERT, 137/137. Les textes réels
de la base, relus aussi dans leurs sources (`depop.js`, `build-extension-cloud.mjs`) ; aucun des refus réels ni des
textes de tâches Depop n'est un mur ; un relevé après une vraie reconnexion Depop (sonde), et Cloud (coffre) ; la preuve
suit l'exécutant dans les deux sens ; rien sur la seule sonde de l'ordinateur au Cloud actif, ni à reconnecter, ni
connexion antérieure au mur ou de plus de 3 h, ni coffre illisible, ni pendant une pause Leboncoin ; l'épisode au Cloud
(en file, retombé au mur, 2e après une connexion réécrite, réussi ; mur répété et coffre rafraîchi : 3 puis le plafond) ;
le VRAI bloc de handler-watch (§ 12), aucun profil lu par clé. Contre-épreuves : 17 défauts du premier jet réintroduits
un à un sur une copie hors dépôt : 17 rouges ; puis 9 pour la preuve par exécutant (preuve qui suit le texte, plafond de
l'épisode sauté pour le Cloud, motif Depop rouvert en préfixe, `cloud_voie` retiré de la lecture par lots ou non rangé
dans le profil, exécutant inconnu tenu pour l'ordinateur, sonde exigée au Cloud, garde du Cloud retirée, exécutant
inversé) : 9 rouges, 0 vert.

Livraison : handler-watch seule (elle embarque le module), comme B5. L'app ne change pas : `MUR_PAGE_CONNEXION`
(`src/annonces/etatReleve.js`) dit ce que l'écran propose, la règle ne le lit pas ; le mur Depop y sort déjà « à
connecter » (relevé « absente »), le mur Cloud garde son bandeau « à reconnecter » lu sur le coffre.

## Reste à décider (Nico)
Codé par défaut, à confirmer :
- Plafond des lectures par passage : 30, avec une tranche qui tourne d'un pas premier avec n ; le retirer est possible
  (une lecture d'une ligne par candidat à chaque passage ; aucun relevé voulu n'est perdu dans les deux cas).
- Mesure de la durée et du CPU de handler-watch sur les premiers passages en service (elle ne peut se lire avant).

Non codé :
- eBay (la demande portait sur toutes les plateformes) : la pose des relevés eBay quotidiens (`ebay-releve-api`,
  `poserQuotidiens`) a les deux défauts de la boucle — une garde « déjà relevé depuis 20 h » calculée sur une lecture
  `.in("user_id", …).limit(2000)` sans tri ni pages, et l'erreur non lue. Aucune boucle constatée (le défaut y retient
  au lieu de reposer) ; à corriger dans l'audit ci-dessous, en tête.
- Garde en base en plus du code : un déclencheur BEFORE INSERT qui refuse une `reprise_connexion` si un relevé a réussi
  après le mur, à moins de 15 min d'un relevé réussi, ou après 3 reprises (migration, banc jetable, feu vert ; la
  définition du mur existerait alors en SQL et en JS : selftest miroir à prévoir).
- ~~Murs que la règle ne reconnaît pas~~ — DÉCIDÉ ET CODÉ le 11/11 (« Les murs Depop et Cloud » ci-dessus ; verrou
  `selftest:releves-de-veille`, § 12 et § 13 bis). ~~La voie d'un mur lue sur son texte~~ — DÉCIDÉ le 11/11 vers 15:25
  (« Suivre l'exécutant ») et codé : la preuve suit `cloud_voie`, plus le texte du mur.
- Non codé, hors de cette règle : au Cloud ARRÊTÉ, get-pending-jobs sert un relevé « annonces » au premier poste qui le
  réclame — l'ordinateur, ou le navigateur Cloud s'il est encore ouvert pendant la grâce (`jobsPourPosteCloud` ne retire
  que les TÂCHES au poste Cloud d'un compte au Cloud inactif, pas les demandes de relevé). La règle juge alors sur la
  sonde de l'ordinateur, que la copie Cloud écrit aussi. Fermer ce trou (règle « un seul exécutant » pour les relevés au
  Cloud inactif) : à décider.
- L'écran pour ces murs (« Me connecter » sur le mur Depop, mur Cloud dit « à reconnecter » sur la tuile au lieu
  d'« échec ») : `src/annonces/etatReleve.js`, livraison web + OTA — non fait, à décider.
- Dressing Vinted : sa reprise reste coupée ; sa lecture (limite de 2 000, triée du plus récent au plus ancien) est à
  passer par la même lecture par clé avant d'être rallumée un jour.
- Alerte dans l'ops-digest au-delà de 3 `reprise_connexion` en 24 h pour un compte et une plateforme (la boucle a tourné
  44 h sans alerte).
- Audit des gardes lues en vrac, lot séparé : d'abord get-pending-jobs (lots manuels, `.limit(1000)`, déjà 972 lignes
  rendues — règle de cadence, rien à changer sans décision), puis 8 lectures de handler-watch « plusieurs comptes d'un
  coup, `.limit(1000)`, sans tri » ; sur `annonces_plateforme`, 8 couples compte-plateforme dépassent 1 000 lignes
  devant des lectures à `.limit(3000)`. Non instruit.
- Lectures « N derniers relevés » saturées par les lignes qui restent (absences : 50 derniers relevés ; app : 200
  derniers réussis) : les corriger par plateforme, ou laisser se résorber au prochain relevé réussi de chacune.
- Essai réel sur le compte Leboncoin de Nico (déconnexion, « Synchroniser », reconnexion : un seul relevé attendu).
- Prévenir le compte dont le Leboncoin a été lu environ 690 fois : aucun mail sans ordre.

## Non vérifié
- La durée et le CPU de handler-watch avec le correctif (mesurés à la livraison).
- Les lectures « en file » et « reprises de l'épisode » n'ont tourné que sur le faux serveur et sur un Postgres jetable :
  au déploiement, tous les candidats du jour sont « déjà reparti » (une seule lecture chacun). Elles ne tourneront contre
  le vrai PostgREST qu'à la première vraie reconnexion — d'où l'essai réel sur le compte Leboncoin de Nico.
- Le code réellement servi par la version en service n'a pas été téléchargé (le fichier n'avait pas changé dans git
  depuis `904bacb`).
- Le plan des deux requêtes de preuve n'a pas été lu en prod (la base refusait la connexion vers 12:50, puis consigne
  de ne plus la lire) ; elles ont été jouées telles quelles sur un Postgres jetable.
- L'effet de la boucle sur l'import pendant qu'elle tournait ; le 13e compte ; le lien entre la boucle et les coupures
  de la base.
