# Lot du 22/10 au soir — 8 points (Louis, paugues, Beebs, Leboncoin, file, pause, contenu du vendeur)

Heures de Paris. Tout ce qui suit a été fait par l'agent ; Nico n'a rien à taper ni à vérifier.

## En prod, maintenant

- **Commits** (`main`, un seul push) : `241b456` (code + extension 0.6.130 + réparations), `66efffe`
  (`EXTENSION_LAST_COMMIT` 0.6.130 + app 2.9.109), puis le commit de la règle « copie d'avant le 21/09 » et des docs.
- **Migrations appliquées** (consigne du lot : « Migrations… c'est toi qui les fais » ; essais à blanc en ROLLBACK
  d'abord, corps de prod relus juste avant — inchangés — et après — marqueurs présents) :
  `20261022200000_file_synchro_boutique_partagee` (20:53:24, essai **42/42**) et
  `20261022210000_contenu_du_vendeur` (20:53:34, essai **13/13**). Inverses : `supabase/rollbacks/2026102220*_INVERSE.sql`.
- **get-pending-jobs** v267 → **v268** (21:01:42) → **v269** (21:40:37), `verify_jwt` **true** avant et après chaque
  déploiement ; 152 appels en 200 et 0 avertissement dans les 9 min qui ont suivi la v268.
- **App 2.9.109** : OTA envoyée (build `2026-10-22T19:15:40Z+66efffe`), canal production relu à **2.9.109** (21:16) ;
  le web suit le push de ce lot.
- **Extension 0.6.130 À TÉLÉVERSER**, seule dans son dossier :
  **`C:\Users\nicol\fill-and-sell\build\CWS-0.6.130-A-TELEVERSER\fillsell-extension-0.6.130-66efffe-cws.zip`**
  (BUILD_ID `2026-10-22T19:14:56Z+66efffe`, 37 entrées, 559 Ko). Elle contient TOUTE la 0.6.129. L'ancien dossier
  0.6.129 est rangé dans `build\CWS-PERIMES\CWS-0.6.129-A-TELEVERSER-remplacee-par-0.6.130\` (si la 0.6.129 est déjà en
  examen au CWS, la 0.6.130 la remplace). Parc : 93 comptes en 0.6.128, 0 en 0.6.129.
- **Mails** : `email_logs` relu avant/après chaque réparation : **aucun mail parti par ce lot** (les 3 mails de la soirée
  sont un « welcome » et un « extension_link » d'une inscription de 20:50, et la vraie vente Vinted de meminiandmove à
  21:27, commande 23481782797).
- **Selftests** : suite complète **383 jouée, chacun une fois ; 382 verts**, seul rouge `messages-cause-vraie` (déjà rouge
  avant ce lot) ; 4 selftests existants recalés sur la nouvelle forme du code (même règle) ; 4 nouveaux : `contenu-du-vendeur` (PERMANENT, 239 contrôles),
  `genre-a-choisir`, `lot-2210-soir`, `oeuvre-d-art` (miroir de l'extension compris).

## Point 1 — décisions de Nico sur le rapport précédent

**1a. Achat Beebs = vente : NON allumé.** Les 44 bilans fantômes de `ventes_beebs_commandes` (13 comptes, 18/10 21:58 →
22/10 19:10) ont TOUS lu 0 commande. Or une vraie vente Beebs a eu lieu pendant ce temps (Johan, vente 241273, annonce
34209247, déclarée le 21/10 21:28) et la lecture fantôme suivante (22/10 00:09) n'a rien vu. Le mode fantôme est aveugle :
l'allumer ne prouverait aucune vente. Rien n'est changé.

**1b. Les lectures Leboncoin de plus de 72 h : préparé, pas lancé.** La 0.6.129 (qui envoie la transaction de chaque
annonce) n'est servie à aucun compte. Le script existant `scripts/reparations/20261022_leboncoin_achats_en_cours_existants.sql`
prend seul les lectures FRAÎCHES : il suffira de le relancer quand les relevés ≥ 0.6.129 auront relu ces annonces. Restent
**22 annonces** (13 comptes) : lesmillesetunepepite 6, ocbijoux62 5, ferreirasab, grisette11, louis, m0nc3f,
manon.simon14, martinteophile, matthewsoulie3, sistre28, 8pzps55rt8, thomastranlagana, duport.leo3 (1 chacun).

**1c. Achat annulé : il se voit, sans second mail.** Le mail « Vendu » part toujours à « Achat en cours ». Si l'achat est
annulé, la base défaisait déjà tout (fiche au stock, retraits arrêtés, copies remises en vente) mais l'app ne le disait
nulle part. Désormais une ligne « Achat annulé sur Leboncoin — « titre » est revenu dans ton stock… Rien à faire. » dans
le Stock, 7 jours, bouton « Vu » (`src/stock/achatsAnnules.js`). Aucun mail (vérifié par le selftest : aucune fonction
d'envoi dans ce code).

**1d. Fiches réimportées d'Opla : sorties du stock, sans retrait.** 9 fiches supprimées à 20:59:22
(`scripts/reparations/20261022_soir_opla_reimportees_hors_stock.sql`, sauvegarde `_backup_2210_soir_opla`, inverse) :
44310spgl « Pull neuf taille 52 Bp » ; nadegemarcelin78 « Lot de 5 magasines Picsou » ; ornellaracano « Pull / tunique
longue Zara taille S » ; xxewwer « Lot 4 jeux PS4… », « Need for Speed Shift 2… », « MX vs ATV Alive… », « Medal of
Honor… », « Astérix & Obélix XXL 2… », « Hitman Blood Money… ». **0 retrait créé** (vérifié dans la même transaction).
Non touchée : angelofthedeath91 « Sweat » (déjà fusionnée dans une autre fiche). Aucune n'avait d'annonce en ligne
ailleurs.

**1e. Retrait Beebs clos sans preuve puis revu en ligne : réarmé, pour tout le parc.** Règle en base
(`retraits_beebs_rearmer_revus`, appelée à la clôture de chaque relevé Beebs) : un retrait armé par une vente, clos sans
confirmation, dont l'annonce est revue en ligne 10 min après → remis en file (3 fois au plus, jamais si la fiche n'est
plus vendue, jamais un second retrait). Essai : F1–F3 verts sur les vrais jobs. Les 2 retraits de XEWER (34198202,
34198337) sont toujours en file (modération Beebs) : rien à réarmer aujourd'hui.

**1f. Tailles écrasées par « Compléter » : 5 rendues.** Rejeu de l'historique des 34 fiches : seules 5 avaient une AUTRE
taille avant (preuve : copies Leboncoin / eBay créées avant l'écrasement, captures Vinted) — rendues à 21:05:44
(`scripts/reparations/20261022_soir_tailles_ecrasees_par_completer.sql`, sauvegarde `_backup_2210_soir_tailles`,
inverse) : louis-seller « Pull Noël Kiabi 8 ans » Autre → **8 ans / 128 cm** ; « Short orchestra 10 ans »
10 ans (128-140 cm) → **10 ans / 140 cm** ; josephinecerni « Salopette short KIABI » 14 ans → **S** ; patrick.giry07
« Veste flanelle » M → **38**, « Pantalon chino » W34 | FR 44 → **44**. 2 fiches avaient déjà la même taille
(batix-pilotage) ; 27 n'avaient aucune taille avant (la réponse a rempli une case vide) ou aucune trace : non touchées,
rien deviné. **Rien republié.** Annonces parties avec la valeur de « Compléter » : ce sont les réponses de grille de la
plateforme qui a posé la question — Beebs 34195539 « Autre » (Pull Noël), Beebs 34204390 « 10 ans (128-140 cm) », Beebs
« 14 ans (152-164 cm) » (Salopette), Vinted « M » (Veste flanelle), Vinted « W34 | FR 44 » (chino) ; aucune annonce d'une
AUTRE plateforme n'est partie avec la taille écrasée (les republications Vinted recréent depuis l'annonce en ligne).
**Les 3 sujets annexes (W sur la grille Depop 62, âge en années lu dans le texte, rayon Beebs « neuf seulement » /
enfant-adulte) ne sont PAS livrés** : leur rejeu 30 j n'a pas été fait dans ce lot ; ils restent à décider.

## Point 2 — paugues : une œuvre d'art n'est jamais « Beauté »

**Cause.** « André Thomas - Huile post impressionniste biblique sur carton fort » : `detectType` lit « Huile » → Beauté,
l'icône tombe en 🧴, et Leboncoin la refusait comme cosmétique.
**Correctif (règle, tout le parc).** `src/utils/oeuvreDArt.js` (technique sur support, technique nommée, attribution,
signature, estampes ; exclusions huile de soin, pastel couleur, fusain du Japon…) : le type d'une œuvre est « Maison »,
son icône 🖼️, elle n'est jamais refusée comme cosmétique (app ET extension — miroir exact, vérifié par le selftest),
et sur Vinted elle va en Maison › Décoration › Décorations murales › **Peintures** (3847) ou **Affiches et reproductions**
(3849), feuilles relevées sur l'annonce de paugues. Rejeu symétrique sur 48 832 fiches : 15 types changés, tous des
œuvres Beauté → Maison ; 7 icônes (6 œuvres, 1 douteuse « Boîte d'agencement florales ») ; 0 statut Leboncoin changé à tort.
**Sa fiche et ses annonces.** Type corrigé (21:07:11, `20261022_soir_oeuvres_typees_beaute.sql`, sauvegarde) pour ses 3
œuvres. Annonce Vinted 10485957671 **déjà** en « Peintures » (lue sur la page publique) : rien à changer, rien perdu.
Leboncoin : **publiable** (plus de refus « cosmétique »), **pas publié** pour lui. eBay : « Cadres » (79654), choix de la
personne, laissé.
**Audit 30 j.** 149 fiches « Beauté » dans le parc : **3 œuvres, toutes de paugues** ; 0 job refusé « interdit ».

## Point 3 — Louis : Leboncoin désynchronisé, boutique partagée entre deux comptes

**Ce qu'il voyait, et pourquoi.** Des « Plus en ligne — Vendue ? » sur des annonces EN LIGNE, et un relevé de louis@ « qui
ne tourne plus ». Causes : (1) l'extension mémorisait 30 jours un 410 « désactivée » — or une annonce Leboncoin neuve en
modération répond 410 ; et un lien enregistré sans catégorie (`/ad/<id>`) répond 404 ; (2) les relevés de veille de louis@
étaient refusés (« fausse alerte connue ») et le relevé quotidien sauté (cadence de 20 h après un relevé de vérification
du 21/10 14:32) ; (3) boutique partagée : louis@ et louis-seller publient dans la MÊME boutique Leboncoin — le relevé de
l'un voyait les annonces de l'autre, la présence ne revenait jamais au compte qui les avait publiées.
**Règle (tous les comptes reliés).** En base : un relevé qui voit l'annonce du compte relié rafraîchit la présence chez le
compte qui l'a publiée (présence seulement : jamais une vente, un prix ni un titre lus pour l'autre) ; une alerte posée
alors que la copie jumelle du compte relié est en ligne est close « Cette annonce n'est plus en ligne ; ton article
reste en vente… sous l'annonce X de ton compte FillSell relié » (constat de deux relevés) ou attend la confirmation d'un
relevé (veille) — jamais « vendue ? » ; une alerte de veille déjà démentie par un relevé attend sa confirmation.
Extension 0.6.130 : 410 de moins de 2 h (modération) = « inconnu », jamais mémorisé ; `/ad/<id>` lu sous `/vi/<id>.htm` ;
une mémoire « morte » plus ancienne qu'un relevé qui a vu l'annonce est oubliée.
**Réparation** (21:09:17, `20261022_soir_alertes_dementies_et_jumelles.sql`, sauvegarde `_backup_2210_soir_alertes`) :
8 copies Leboncoin de louis@ closes « remplacées par l'annonce de ton compte relié » (3291884529, 3291956940,
3291927540, 3292006925, 3292120012, 3292021258, 3292085422, 3291943376) ; 13 alertes démenties remises « à confirmer
par un relevé » (xxewwer 7, 44310spgl 3 Opla, ajmalmuntazar25, jocabroc8, voirememe 1 chacun). Aucun retrait, aucune vente.

## Point 4 — la question du rayon a toujours son champ

**Le cas.** louis-seller, « Lunettes enfants stitch » (fiche 1792507479750003, importée de Vinted) : copie Beebs en genre
« Enfant » (Beebs n'a pas ce rayon) ; l'écran comptait une question, grisait Publier… et n'affichait qu'une phrase.
**Correctif.** Confirmer (à l'unité et en lot) et l'ancien écran Publier montrent la question avec **les seuls rayons qui
existent pour cet article** (ceux qui résolvent une vraie catégorie Beebs / Vinted) ; le moteur en pose un seul quand
c'est sûr (un seul rayon possible, ou le texte de la fiche nomme « fille », « garçon »…, ou « Enfant » avec un seul rayon
enfant) et le dit ; la question est comptée (plus jamais « Tout est complété » au-dessus d'un Publier grisé).
**Les autres bloqués.** Aucune trace n'existait (le blocage naît avant tout job). Désormais tracé
(`champ_requis_bloquant`, `genre_rayon`, avec les rayons proposés) : la liste se lira dès demain.

## Point 5 — la synchro demandée passe devant la file, entre deux tâches

**Règle.** Une synchro demandée par la personne (moins de 10 min) est servie devant toute la file de publications ; ne
partent avant elle que les retraits et les republications dont l'annonce est déjà retirée. **Garde absolue** (base,
toutes versions) : aucun relevé ne démarre sur une plateforme où une republication est entre le retrait et la recréation
— il attend, et l'app le dit (« Ta synchro Leboncoin attend une remise en ligne »). **Double garde** (base) : un article
en republication n'est jamais daté « disparu », jamais « Plus en ligne — Vendue ? », jamais constaté absent par un relevé.
Extension 0.6.130 : entre deux tâches, la file s'arrête pour la synchro et repart seule (poll relancé), sans rien perdre.

**Essai réel (compte de Nico, « TEST FillSell — Paris 2024 — ne pas acheter », 999 €)** :
21:18:15 republication Leboncoin demandée ; 21:23:49 ancienne annonce 3290209516 retirée ; 21:24:49 « Synchroniser »
Leboncoin (déclencheur `app`) → l'app affiche la synchro « en attente de remise en ligne » ; **21:26:27 get-pending-jobs :
« relevé leboncoin be5a6489 RETENU — republication 881186f9 entre le retrait et la recréation »** ; 21:29:45 recréée
(**3293344815**, vue en ligne sur la page publique) ; **21:31:06 le relevé part**, fini 21:31:19, il voit la nouvelle
annonce ; aucune alerte, la fiche reste en stock, l'ancienne copie close « en cours de republication — pas une vente ».

## Point 6 — la pause

**Règle.** « Mettre en pause » / « Reprendre » dans la feuille « Ta file » et une ligne dans le Stock. Rien de ce qui n'a
pas commencé ne part ; une tâche commencée va au bout ; **les retraits après une vente ne sont JAMAIS en pause** (une
vente sur une plateforme laisse l'article en vente ailleurs : le retrait évite la double vente — c'est pour ça qu'il
passe toujours) ; une republication dont l'annonce est déjà retirée va jusqu'à la remise en ligne. L'état « en pause » se
voit (Stock, file, popup de l'extension) ; la reprise repart dans l'ordre de la file.
**Essai réel (compte de Nico)** : 21:32:31 pause + republication Leboncoin du « T-shirt homme blanc » (999 €) ; **21:34:27
« file EN PAUSE (geste de la personne) → 1 publication/republication gardée en file », 0 job servi** ; 21:35:28 reprise ;
21:36:26 la même republication repart (étape suivante) ; 21:43:52 recréée (**3293350601**), l'ancienne 3289322234 retirée : rien perdu, rien en double.

**Coût en base (mesuré avant mise en prod, sur le plus gros compte — linda, 653 jobs en file).** `file_etat` 2,6 ms
(474 blocs), relu toutes les 60 s par un Stock ouvert (relecture bornée) ; `file_etat_poste` 2,0 ms (402 blocs), lu par
l'extension au plus toutes les 20 s et seulement entre deux tâches ; `lectures_origine_en_attente` 5,5 ms (1 387
blocs), 60 s. Aucun `setInterval`.

## Point 7 — les faits, sans toucher

- **linda.sidhoum** : 653 republications Vinted en file (a_capturer). Premium : plafond 50 / jour, et 50 faites chacun des
  jours où son ordinateur était allumé ; extension vue pour la dernière fois le 21/10 15:33. La file avance au rythme de
  son plafond et de son PC, rien n'est bloqué.
- **hu.anastasia** : 164 en file depuis le 07/10 ; même cause (PC rarement allumé), extension vue le 21/10 10:45.
- **meyrannes30410** : introuvable (ni profil, ni compte, ni connexion à ce nom). Le message de pause « marque… » n'existe
  que chez 9cdr9rm4rn (3), 111savagenow (2), tessy.galy (1), meminiandmove (1).
- **2hyk6vg842 (Tech-t), Mewtwo** : les deux retraits sont faits le 22/10 à 16:40 / 16:41 (eBay terminée le 21/10 22:36 par
  le vendeur selon sa page, Leboncoin désactivée). Aucun risque de double vente.

## Point 8 — le texte, l'état et les photos du vendeur partent tels quels

**Où ils étaient remplacés (cause prouvée).** Le 20/10 à 13:49, dix fiches de louis@ naissent du relevé Beebs avec le seul
titre et la vignette ; leur annonce Beebs n'est LUE qu'à 22:20. Louis publie sur Leboncoin à 13:57 : la fiche est vide,
le moteur remplit ce qui manque (texte rédigé, « Très bon état » par défaut, 1 photo). Puis chaque republication
Leboncoin / Beebs / Depop **recopie** ce dépôt. Même trou pour un article du dressing Vinted publié depuis le téléphone
(description jamais lue), et pour les copies rédigées avant le 21/09 (le moteur réécrivait alors le texte même présent).

**Règle (toutes plateformes, publication, lot, republication).**
1. Une fiche importée (Vinted, Leboncoin, Beebs, Depop ; eBay est lu en entier par l'API) dont l'annonce d'origine n'est
   pas encore lue **ne part pas** : Stock et lot disent « En cours de lecture de ton annonce d'origine (texte, photos,
   état) : elle partira avec TON contenu dès que l'extension FillSell de ton ordinateur l'aura lue » — jamais une erreur ;
   la lecture est demandée (relevé de veille ; détail Vinted par l'extension 0.6.130 ou l'app ouverte sur l'ordinateur) ;
   l'article du lot repart tout seul dès qu'elle est faite ; get-pending-jobs retient aussi au départ (filet).
2. Au départ, une copie rédigée **avant** que le vendeur soit lu — ou avant la règle du 21/09 — part avec **son texte, son
   état (jamais dégradé) et toutes ses photos dans l'ordre** (photos encore chez la plateforme : rapatriées d'abord) ; la
   copie en base est corrigée, les republications suivantes recopient le bon contenu.
3. Jamais au-dessus d'un choix de la personne (copie rédigée après la lecture, photos retouchées) ; une republication
   Vinted (recréée depuis l'annonce en ligne) n'est jamais retenue.
Selftest **permanent** `contenu-du-vendeur` : 5 plateformes × 5 chemins d'import × publication / lot / republication,
plus la lecture du code de get-pending-jobs, du Stock, du lot, de generate-listing et de l'extension.

**Preuve en prod.** Rejeu avant déploiement sur les 129 copies en file : 0 retenue, 4 corrigées (sauvegardées dans
`_backup_2210_soir_contenu`). Louis, par le circuit normal (« Relancer » et « Republier », 21:12:47) : Vert (3293339765)
et Violet (3293338726) publiés avec SON texte (226 car.), « Neuf sans étiquette », 4 photos ; les 7 annonces Green Horde
fausses republiées avec son contenu — **Noir 3293342330 vérifiée sur Leboncoin** : « 🎯 Organisez vos figurines et cartes
en un clin d'œil ! … ✅ État : neuf », État neuf, galerie de photos complète ; Orange 3293344712, Rouge 3293347642, Blanc 3293350594 recréées,
Bleu, Gris, Rose en cours (au rythme de sa file) ; les 13 copies de Louis ont été corrigées au départ (journal de
get-pending-jobs : « contenu du vendeur imposé — description, état, photos »), 4 après rapatriement de leurs photos Beebs. Puis (21:41:40, `20261022_soir_louis_textes_restants.sql`) : 3 « Black Plague » de louis@ (dépôt du
19/09) et 1 Beebs de louis-seller (« Peluche Disney Daisy Duck ») republiées avec son texte. La Jaune (déjà juste) n'est
pas touchée. 7 unités de son quota Business, prix 0. Aucune vente en cours (transactions vérifiées).

**Audit du parc depuis le 18/09** (annonces publiées par FillSell, encore en ligne, de fiches au contenu du vendeur ;
4 533 annonces ; adaptations exclues : coupe à la longueur, nettoyage, « Marque : X », texte réécrit par la personne après
la copie, copies sans texte en base) : **335 vrais écrasements, 29 comptes (18 payants)** — texte 198, état 157 (dont
**54 dégradés**), photos 7 (1 au lieu de ≥ 2). Payants d'abord : sebastien64310 47 · josephinecerni 44 · jocabroc8 33 ·
louis@ 27 · tessy.galy 27 · sebimsn10 22 · recrutementgroupezk704 21 · thibault.andrieux 19 · xxewwer 13 · voirememe 12 ·
louis-seller 11 · nicolas.svobodny 7 · inandup33 7 · alizeed48 6 · ornellaracano 4 · 9cdr9rm4rn 4 · van-breugel.sandra 3 ·
2hyk6vg842 1 ; gratuits : olivier.mariep 8, noahbessaguetlefort 7, antoinelatour8 3, carhoa 2, six comptes à 1.
**Depuis quand.** Le trou existe depuis que des fiches naissent sans leur contenu : dressing Vinted (03/08, lu seulement
au clic sur l'ordinateur), relevés Leboncoin / Beebs / eBay / Opla (capture du texte depuis le 17/09, relue depuis le
21/09) ; la recopie par republication depuis la republication multiplateforme (17/09). Dans la fenêtre : dès le 18/09
15:33, et chaque semaine depuis (14, 61, 82, 17, 71, 90 — semaine du 19/10 comprise). **Seules les annonces de Louis
sont republiées** ; les autres comptes se corrigent à leur prochaine republication (règle 2) ou attendent la décision.

## Données modifiées (sauvegarde avant, inverse prêt)

| Quand | Script | Changement |
|---|---|---|
| 20:55:53 | `20261022_soir_sauvegarde_contenu_vendeur.sql` | sauvegarde de 129 copies en file (aucune écriture) |
| 20:59:22 | `20261022_soir_opla_reimportees_hors_stock.sql` | 9 fiches hors stock, 0 retrait |
| 21:05:44 | `20261022_soir_tailles_ecrasees_par_completer.sql` | 5 tailles rendues |
| 21:07:11 | `20261022_soir_oeuvres_typees_beaute.sql` | 3 types Beauté → Maison (paugues) |
| 21:09:17 | `20261022_soir_alertes_dementies_et_jumelles.sql` | 8 copies louis@ closes, 13 alertes « à confirmer » |
| 21:12:47 | `20261022_soir_louis_zombicide_contenu.sql` | 2 relances, 7 republications (Louis) |
| 21:41:40 | `20261022_soir_louis_textes_restants.sql` | 4 republications (Louis), 1 refusée (annonce introuvable) |
| au départ | get-pending-jobs v268/v269 | copies corrigées marquées `platform_fields.contenu_du_vendeur` |
| essais | compte de Nico | 2 republications Leboncoin de test (999 €), pause posée puis levée |

## Décisions pour Nico (avec ma recommandation)

1. **Téléverser la 0.6.130** (chemin plus haut). *Recommandé* : oui, ce soir — elle porte l'arrêt entre deux tâches, la
   lecture des descriptions Vinted et la modération Leboncoin ; tant qu'elle n'est pas servie, les lectures Vinted ne se
   font que l'app ouverte sur l'ordinateur.
2. **Les 333 autres vrais écrasements** (hors Louis). *Recommandé* : laisser la règle 2 les corriger à leur prochaine
   republication (aucun geste) ; republier tout de suite seulement les 54 états **dégradés** des payants, par le circuit
   normal, sur ton feu vert.
3. **Louis, ce qui reste** : 4 « Rangement … pour 12 pots » (copie rédigée après la lecture — peut-être ses mots),
   états « Très bon état » au lieu de « Bon état » de louis-seller (Leboncoin 3291939975, 3290876120 ; Beebs 34200417,
   34198312 ; Depop ×3) et « Maison de poupées miniatures - le café » (Beebs sans numéro d'annonce). *Recommandé* : lui
   demander s'il a choisi ces mots / états ; sinon les republier depuis la fiche.
4. **paugues, ses 2 autres œuvres** : Vinted en « Toiles et panneaux » (fournitures) et « Encadrements ». *Recommandé* :
   les republier pour qu'elles passent en « Peintures » (la règle le fait seule à la republication).
5. **1a** : *Recommandé* : laisser Beebs en fantôme et faire lire les commandes par la page des ventes (0.6.126) avant tout
   allumage — le mode actuel n'a jamais vu une commande.
6. **1b** : relancer le script Leboncoin quand ≥ 0.6.129 aura relu les 22 annonces (je le fais au prochain lot si tu veux).
7. **1f, les 3 sujets annexes** : *Recommandé* : les traiter au prochain lot avec leur rejeu 30 j.
8. **Opla** : 14 annonces Opla de louis@ avec un état « comme neuf » au lieu de « neuf » — Opla est quittée : rien à faire,
   à retirer par Louis s'il le souhaite.

## 22/10 nuit — décisions de Nico, faites

**Push et site.** Poussé à 22:14:08 (`412ad2b..e085fed`, puis le commit de cette nuit). Site relu : `build.json` =
`2026-10-22T20:14:37Z+e085fed` ; `/app-shell.html` 200, son entrée `/assets/index-B26LRSpV.js` 200 (680 Ko) lue avec
`Origin`, `/login` 200 et sur la même entrée.

**1. États dégradés des comptes payants.** Correction de mon rapport : 54 états dégradés au TOTAL, dont **45** sur des
comptes payants (les 9 autres sont des comptes gratuits : on n'y touche pas). Sur les 45, **12 republiés** (22:24:25,
`scripts/reparations/20261022_nuit_etats_degrades_et_oeuvres.sql`, sauvegarde `_backup_2210_nuit_republications`) par le
geste de l'app : Beebs josephinecerni 34090428, sebimsn10 34184212, xxewwer 34043155 ; Depop nicolas.svobodny (robe) ;
Leboncoin jocabroc8 3292537287, josephinecerni 3275470510, ornellaracano 3272017443, sebastien64310 3292703560, sebimsn10
3290232698, tessy.galy 3278090358 ; Vinted jocabroc8 10125580653, sebastien64310 10445026469. Gardes vérifiées pour
chacune (fiche au stock, aucun doublon en file, aucun retrait, aucune alerte, aucune transaction Leboncoin) ; plafonds,
quotas et créneaux : ceux du compte (prix 0, inclus). Non republiés, et pourquoi : Opla 14 (quittée), eBay 6 (l'app ne
republie pas eBay ; 2 ont une alerte « plus en ligne »), Louis 6 (déjà en cours), 4 sans numéro d'annonce, 1 alerte
Leboncoin (jocabroc8 3276766127), 1 qui n'est plus dégradé (nicolas.svobodny 3277214299), 1 Depop déjà en file.
**La règle, pour tous** (get-pending-jobs v270 → v271) : en REPUBLICATION, un état plus bas que celui de la fiche remonte
toujours à l'état de la fiche (un état plus haut n'est jamais touché) ; sur Leboncoin c'est le critère du formulaire
(`lbcAspects.condition`) qui compte, et l'état de l'ancienne annonce n'est plus jamais reposé sur une copie qui a reçu
celui du vendeur ; sur Vinted, la capture est corrigée avant le retrait (`_shared/capture-corrigee.js` : l'état de la
fiche noté AVANT la capture, qui le réécrit). Déjà vu partir : **ornellaracano « Robe Maje paillettes » recréée 3293368542, lue sur la page Leboncoin
publique : « Neuf avec étiquette » (avant : « Neuf »), 9 photos, son texte** ; josephinecerni (Leboncoin, Beebs) et xxewwer
(Beebs) en remise en ligne avec l'état imposé ; Nico (Depop, annonce test) : présignature photo refusée par Depop (réseau),
nouvel essai automatique 1/5. Les comptes dont l'ordinateur est éteint (jocabroc8 depuis
17:03, sebimsn10 depuis le 19/10, tessy.galy, sebastien64310) partiront à son retour.

**2. Louis.** Vérifié sur les pages Leboncoin publiques : les 4 annonces Green Horde recréées portent SON texte
(« 🎯 Organisez vos figurines… »), 3 photos (le maximum gratuit de Leboncoin dans « Jeux & Jouets » ; le job en porte 4).
**Noir 3293342330 : « État neuf ». Orange 3293344712, Rouge 3293347642, Blanc 3293350594 : « Très bon état »** — cause
trouvée : get-pending-jobs reposait le critère « État » de l'ANCIENNE annonce (relevé) après que l'état du vendeur avait
été imposé. Corrigé (v271, selftest). Ces 3-là se corrigeront à leur prochaine republication : la règle « une
republication par annonce et par jour » (refus `cadence_24h` relu) l'interdit avant le 23/10 vers 21:30.
Bleu, Gris, Rose : retenus par la respiration de son compte (54 republications, reprise 23:43) ; leur copie porte déjà
l'état de la fiche (« Neuf sans étiquette », critère ancien retiré, 22:30:48), le texte (226 car.) et les 4 photos.
**À vérifier au prochain check : les 3 pages Leboncoin de Bleu, Gris, Rose (« État neuf »).** Les états « Très bon » de
louis-seller et les 4 « Rangement … 12 pots » : non touchés. **L'annonce Beebs sans numéro (« Maison de poupées
miniatures - le café ») n'existe pas sur Beebs** : 4 relevés COMPLETS de louis-seller depuis son dépôt (21/10 22:44,
22/10 04:53, 11:45, 18:28 ; 262 annonces vivantes, toutes rattachées) ne la portent pas, et la page « en vérification »
juste après le dépôt n'avait qu'une carte (la supérette 34206427). Rien à rattacher : la règle du 20/10 la classe
« publication non aboutie » à 72 h (23/10 vers 23:39) ; la fiche reste au stock.

**3. paugues.** Ses 2 œuvres republiées (22:24:25) : « Huile sur toile style post impressionisme - P.Vicent - 1977 »
(Vinted 10450175638, « Toiles et panneaux ») et « Huile sur panneau de bois - Style école française du XIX° » (Vinted
10474010355, « Encadrements »). La republication Vinted recrée depuis la capture : la capture est corrigée vers
« Peintures » (3847) AVANT le retrait ; un formulaire incomplet s'arrête sans rien retirer (pré-vol). Son ordinateur est
éteint depuis 18:53 : **à vérifier au prochain check — les 2 annonces en « Peintures » sur Vinted.**

**Selftests** : suite complète rejouée après les changements de la nuit — **383 jouée, 382 verts**, seul rouge
`messages-cause-vraie` (d'avant) ; `contenu-du-vendeur` passe à 253 contrôles (état en republication, critère Leboncoin,
capture Vinted corrigée).

**Mails** : `email_logs` relu avant et après chaque geste — rien de parti par ce lot (les 3 mails du soir sont deux ventes
Vinted réelles, xxewwer 21:52 et tiblancdeshaut 22:10, et un « extension_link »).

## 23/10 — lot de 4 points : photos eBay (Thierry), fausse alerte eBay (Sébastien), Beebs « introuvable » (Louis), questions trop tôt (louis-seller)

**À téléverser** : `build/CWS-0.6.131-A-TELEVERSER/fillsell-extension-0.6.131-4098342-cws.zip` (extension 0.6.131, contient TOUTE la 0.6.130 ; la 0.6.130 est rangée dans
`build/CWS-PERIMES/`). Envoyer pour examen.

**Selftests** : départ (11:25) **383 joués, 382 verts** — seul rouge `messages-cause-vraie`, déjà rouge avant le lot.
Fin de lot (13:10-13:18) : **384 joués, 383 verts**, seul rouge `messages-cause-vraie`. **Rien n'a régressé.**
Deux fois, un rouge nouveau est apparu en cours de route et a été corrigé avant d'aller plus loin :
- 12:27 : `gpj-file-longue-et-pause`. Une lecture du journal se faisait en un seul `.in()` au lieu de lots. Corrigé :
  get-pending-jobs v275, rejoué vert.
- 13:09 : `champs-deduits`, `memoire-categorie` et `surveillance-releves`. Ces selftests lisent le code mot pour mot.
  J'ai étendu leurs motifs aux nouvelles formes : la garde qu'ils vérifient reste exigée, avec une raison de plus.
Nouveau selftest `lot-2310`. `contenu-du-vendeur` passe de 253 à 292 contrôles, `alertes-compte` de 22 à 36.
`build:essai` vert.

**Mails** : `email_logs` est passé de 10 185 (11:25) à 10 195 (13:21) : 10 mails. Aucun ne vient de ce lot. Ce sont des ventes réelles
(Thierry ×3, tiblancdeshaut ×3), la réponse support de Nico, une inscription (bienvenue + lien d'extension).

### Urgence de 11:44 — Thierry publiait 117 annonces Vinted à une photo de 140 px
**Constaté sur Vinted** (navigateur) : 10494438305, 10494411483 et 10494388040 montrent chacune 3 vignettes. Ce sont
3 recadrages de la MÊME face, en 140×135 px. Le revers manque.

**Fait** :
- **Retenue en base.** Migration 20261023110000 : une publication retenue ne démarre plus, même déjà servie à une
  extension qui la tient en mémoire, et rien n'y est écrit. 65, puis 80 publications retenues (11:52 → 12:09), sans
  erreur.
- **Preuve que la retenue tient** : démarrages refusés (409) à 11:52:26, 11:52:43 et 11:53:01, sans aucun « failed »
  écrit.
- **Lecture.** Le détail eBay de ses 506 fiches est lu (3 lectures de 96 entre 11:55 et 12:05). Les fiches sont
  complétées en pleine taille.
- **Départ.** Les publications repartent seules avec toutes leurs photos. Vérifié sur les 27 servies à 12:18 :
  54 photos de 500 à 770 px.
- **Republication de ses 37 annonces déjà en ligne** (feu vert de 12:05) :
  - 35 republiées par le geste « Republier » de l'app, prix 0, **hors quota** (migration 20261023120000 ; compte de son
    quota : 0) ;
  - 2 non republiées : elles étaient déjà en pleine taille (613 / 646 px et 500 px).
  - 1 annonce (10494422743) s'est **vendue** sur Vinted à 12:19. C'est une vraie vente : retrait eBay armé par le
    circuit. Sa republication s'est arrêtée seule avant tout retrait ; je l'ai close sans message (12:20).
  - **État à 13:24** : les republications suivent la cadence normale de sa file. Son extension finit d'abord les publications du cycle servi à 12:52 ; ensuite, à chaque passage, 1 capture et 1 retrait-recréation. La première est capturée, et sa capture est corrigée par la fiche (12:52:01, 17302) : Faustine la Jeune, Sesterce, 10494275321. La capture porte maintenant 2 photos de 592 et 618 px, l'avers puis le revers, vues une à une, au lieu des 3 recadrages de 140 px. **À vérifier au prochain check : 3 annonces recréées sur Vinted** (photos pleine taille, avers et revers).

### Point 1 — import eBay : une seule photo
**Causes** (vérifiées en base, il y en a cinq, empilées) :
1. La liste eBay (GetMyeBaySelling) ne porte qu'une vignette de 140 px. Le détail (toutes les photos) se lisait à
   60 annonces par relevé. Thierry a importé 507 annonces d'un coup : 447 fiches sont nées avec la seule vignette.
2. La complétion d'une fiche comparait sa photo à l'adresse de la vignette. Dès que la publication l'avait recopiée
   chez nous (`rehosted/<fiche>/`, format `{url}`), plus rien ne la complétait.
3. La garde du départ croyait eBay « lu en entier ». Aucune fiche eBay n'attendait ses photos.
4. Le détail par l'API Trading rend les photos en 400 px (`$_1.JPG`). L'original existe sous la même clé d'image
   (`s-l1600`) : mesuré 509×512 px au lieu de 400×393.
5. La page eBay lue par l'extension (ld+json) ne donne que 5 photos, et elle passait devant le détail API. Résultat :
   228 fiches de 16 comptes bloquées à 5 photos sur 6 à 24.

**Correctifs (pour tout le parc)** :
- **Migration 20261023100000.** La vignette est reconnue sous toutes ses formes : copie rehosted ou rapatriée, même
  image eBay à une autre taille. Les photos sont posées dans l'ordre, sans doublon, et tracées au journal. Les fiches
  eBay demandent leur lecture.
- **Migration 20261023130000.** La lecture la plus riche l'emporte. Les photos eBay sont prises en pleine taille. Une
  fiche qui porte encore ce que la base lui a mis reçoit une lecture plus riche quand elle arrive.
- **Retenue.** `lectureOrigineEnAttente` retient eBay comme Leboncoin, Beebs et Depop, jusqu'au détail lu. Le message
  est « en cours de lecture, rien à faire ». La retenue joue aussi au démarrage (migration 20261023110000).
- **Copie servie avant ses photos.** Au départ, et à la recréation Vinted, elle reçoit celles de la fiche : vignette,
  400 px ou photo manquante sont remplacées.
- **Lectures et rapatriement accélérés.** ebay-releve-api v7 lit d'abord les fiches qui attendent, jusqu'à 150 détails
  par demande. handler-watch v124 rapatrie 48 photos par passage, en commençant par les fiches dont une tâche attend.
- **Autres imports vérifiés dans le code** : ils prenaient déjà tout, dans l'ordre et en grand format.
  - Vinted : `full_size_url` de toutes les photos du dressing ;
  - Leboncoin : `urls_large` ;
  - Beebs : images ld+json ;
  - Depop : `pictures` au format P0.

**Données modifiées** (toutes sauvegardées, inverses en commentaire dans les scripts) :
- **Thierry** :
  - 506 fiches toutes lues : 499 ont toutes leurs photos, 7 n'en ont qu'une parce que leur annonce n'en a qu'une ;
  - 353 fiches repassées en photos originales (`_backup_2310_photos_pleine_taille`) ;
  - 17 fiches complétées (`_backup_2310_photos_origine`).
- **ferreirasab** : 8 fiches Leboncoin complétées (+30 photos). L'ancienne règle les complétait déjà.
- **Parc, fiches bloquées à 5 photos** : 228 fiches de 16 comptes complétées (+1 288 photos, `_backup_2310_photos_plafond5`).
  - payants d'abord : jocabroc8 83, lohanobert59 5, xxewwer 1 ;
  - gratuits : lesforcesdelaudela 86, ericsaint-georges 15, nacirirachid62 9, grisette11 9, nino57270 6,
    pereiramaia138 5, misscat801 3, et 6 comptes à 1.

**Audit du parc** (fiches importées depuis le 18/09) — il reste 9 fiches que je n'ai pas touchées :
- choix possible de la personne : jocabroc8 10/17 (ses propres photos) ;
- famouus-x3 Leboncoin 2/3 ;
- louis@ Beebs 3/5 (article vendu) ;
- jocabroc8 eBay 20/23 (20 = le maximum de l'app) ;
- jocabroc8 eBay 5/16 et 5/20, Leboncoin 5/9 et 5/15 ; nino57270 eBay 3/5.

**Annonces déjà publiées ailleurs avec une photo manquante** (pour décision, rien republié) :
- jocabroc8 : Leboncoin 8 annonces (70 photos), Vinted 2 (11 photos) ;
- louis@ : Leboncoin 4. Probablement la limite gratuite de Leboncoin (3 photos en Jeux & Jouets).
- xxewwer : Leboncoin 1 (7 photos) ;
- nino57270 : Leboncoin 2.

### Point 2 — « Connecte-toi à eBay » chez Sébastien
**Cause** : la ligne lit seulement la sonde ebay.fr de Chrome. L'extension visite une page eBay toutes les heures, et
le Chrome de Sébastien n'est pas connecté à ebay.fr : elle écrit `ebay:false`.
- Or son compte est relié par l'API : publication, retraits, relevé et messages passent tous par l'API.
- La reconnexion (OAuth) n'écrit jamais dans cette sonde : l'alerte ne pouvait pas tomber.
- Les Réglages disaient en même temps « eBay connecté ».

**Correctif (app 2.9.110, web)** : `src/utils/alertesCompte.js`.
- Un compte eBay relié par l'API n'est jamais jugé sur Chrome. Son seul vrai problème possible est le lien lui-même :
  « Reconnecte ton compte eBay », qui disparaît dès que le lien est rétabli.
- Une plateforme écartée (« je ne vends pas sur X ») ou jamais utilisée (aucune tâche, aucune fiche) n'affiche plus
  d'alerte.

**Preuve** : rejeu de l'ancienne et de la nouvelle règle sur les données réelles de 174 comptes. On passe de 26 alertes
à 5.
- Disparues : 6 comptes eBay reliés par l'API — sebastien64310, ornellaracano, nicolas.menar, annehelene.reve,
  romain.guerin85, damienmazies.
- Disparues aussi : 4 plateformes écartées et 14 jamais utilisées.
- Restent : 2 vraies pertes de session (romain.guerin85 Leboncoin, seghirdeborah711 eBay).
- Apparaissent : 3 liens API vraiment cassés, sur des comptes qui vendent sur eBay (malena.patarin85, sistre28,
  alexiszuvich).
- 21 autres comptes reliés portent la même valeur de sonde, mais elle est trop vieille : chez eux l'alerte se serait
  rallumée au prochain passage de Chrome. Elle ne se rallumera plus.

La sienne disparaît à l'ouverture de l'app à jour (OTA 2.9.110, web).

### Point 3 — Louis : 8 Beebs « introuvable à confirmer »
**Cause** : la lecture de la nuit était juste.
- Ces 8 annonces ont quitté la boutique Beebs de louis@ le 18/10, pendant le transfert des fiches @evat. Les articles
  sont en vente chez louis-seller sous de nouveaux numéros, vus en ligne le 23/10 à 09:26.
- Le défaut est une boucle : la republication automatique reprenait chaque nuit le dépôt mort de la fiche, sans voir
  qu'il était signalé « plus en ligne » ni que sa republication précédente avait été close « disparue ».
- Bilan de la boucle : 2 pauses le 20/10, 8 le 21/10, 8 le 23/10, et les vraies republications privées de leurs
  créneaux.
- Même chose sur Leboncoin : 2 comptes.
- Le 403 de 04:50 se disait en plus « Leboncoin a bloqué notre lecture » sur une annonce Beebs.

**Correctifs** :
- **Migration 20261023140000** : une annonce dont l'absence est établie sur son identifiant exact, et qu'aucun relevé
  n'a revue depuis, ne repart plus en republication automatique. Un relevé qui la revoit la remet en jeu. La question
  « vendue ? » du dépôt reste la seule : on ne manque jamais une vraie vente.
- **Extension 0.6.131** : une lecture incomplète (403) avant tout retrait ne pose plus jamais de question. Elle
  réessaie toutes les heures, puis la republication est close sans bruit après 24 h, annonce intacte. La plateforme
  est nommée.

**Rejeu (règle de republication automatique)** :
- Écartées : jocabroc8 Leboncoin 78 (dépôts disparus, confirmés par 2 relevés complets), recrutementgroupezk704
  Leboncoin 9, josephinecerni Beebs 2, et les 8 de Louis.
- Les autres annonces candidates ne bougent pas.

**Données** : les 8 pauses de Louis et 2 de recrutementgroupezk704 sont closes sans message à 12:51 (sauvegarde
`_backup_2310_introuvables_clos`). Rien n'a été retiré, ses 14 questions « vendue ? » sont intactes.

### Point 4 — des questions avant que le moteur ait fini
**Cause** :
- Les deux questions de louis-seller venaient du lot. Le lot ne montre ses questions qu'au repos du moteur : elles
  n'ont très probablement jamais été à l'écran.
- La ligne « affiche » est écrite par la télémétrie, qui comptait avant le repos.
- Dans le stepper unitaire, la même séquence montre bien la question pendant 2 à 4 s.
- Ampleur depuis le 18/10 : 91 lignes Leboncoin, dont 49 levées par le moteur en 5 s ou moins.
- Le casque : la règle audio prend « casque » tout seul. Les casques de protection exigeaient un mot collé
  (« casque vélo »), jamais « casque de ski » ni « casque enfant Oxelo ».

**Correctifs (app 2.9.110)** :
- **Repos du moteur.** Une question n'existe, à l'écran comme au journal, qu'au repos du moteur : 1,2 s, le délai du
  lot, et 45 s au plus. Avant, « Confirmer » affiche « On complète les derniers champs… ».
- **Casque.** `familleDuCasque` lit d'abord la marque, un tour de tête en cm et le contexte ; une seule famille donne
  son icône, sinon la règle d'avant s'applique.

**Rejeu** : 572 fiches disent « casque », dont 69 décidées par le mot nu.
- 16 changent, toutes des casques de protection ou de moto : Oxelo, B'Twin ×4, Quechua ×2, Wed'ze, Wanabee,
  chantier, boxe, Bullit, Scorpion ×3, moto.
- 0 casque audio ne bascule.
- Hors du mot « casque », rien ne peut changer, par construction.
- Sur 30 jours, les publications concernées sont les 5 marquées « publiée ≤ 30 j ».

### Données modifiées (sauvegarde avant, inverse prêt)
| Quand | Script | Changement |
|---|---|---|
| 11:40 | (sauvegarde) | `_backup_2310_photos_origine` : 3 219 fiches ≤ 1 photo, 89 comptes |
| 11:52 → 12:09 | `20261023_retenue_photos_ebay.sql` | 80 publications de Thierry retenues (`_backup_2310_retenues_photos`) |
| 11:56 | `20261023_photos_origine_fiches_lues.sql` | 25 fiches complétées (Thierry 17, ferreirasab 8) |
| 12:03 / 12:17 | `20261023_thierry_vinted_photos_republier(_2).sql` | 35 republications Vinted, hors quota |
| 12:14 / 12:15 | `20261023_thierry_photos_pleine_taille.sql` | 353 fiches de Thierry en photos originales |
| 12:20 | `20261023_thierry_republication_vendue_close.sql` | 1 republication close (annonce vendue) |
| 12:37 | `20261023_parc_photos_plafond_5.sql` | 228 fiches, 16 comptes (+1 288 photos) |
| 12:51 | `20261023_introuvables_planifies_clos.sql` | 10 pauses closes (Louis 8, recrutementgroupezk704 2) |

### Ce que Nico doit décider (avec ma recommandation)
1. **Téléverser la 0.6.131.**
   *Recommandé* : oui, aujourd'hui. Elle porte le refus de démarrage silencieux et la lecture incomplète sans
   question. La base retient déjà tout sans elle.
2. **Les annonces déjà publiées ailleurs avec une photo manquante** (jocabroc8 Leboncoin 8 / Vinted 2, xxewwer 1,
   nino57270 2).
   *Recommandé* : les republier par le circuit, hors quota. Celles de Louis (Leboncoin 4) : non, c'est la limite
   gratuite de Leboncoin.
3. **Les 9 fiches laissées** (photos choisies, plafonds de l'app).
   *Recommandé* : ne rien faire.
4. **Louis, ses 14 questions « vendue ? »** sur ses anciennes annonces Beebs. Les articles sont en vente chez
   louis-seller.
   *Recommandé* : lui demander s'il les a retirées lui-même, puis répondre « retirée » pour lui. Je n'y ai pas touché :
   une vraie vente Beebs ne se voit pas autrement.
5. **Casque, étendre la table des marques** (Oxbow, etc.).
   *Recommandé* : au fil des cas, la règle ne devine jamais.

**Vérifié sur Vinted (18:02, navigateur)** — 10 des 35 republications de Thierry sont recréées (13:52 → 17:12), chacune
avec les 2 photos de la fiche. Trois relues sur leur page publique : avers PUIS revers, en pleine taille (au lieu de 3
recadrages d'une face en 140 px) :
- 10496021103, Zeugitane Carthage Shekel : 603×583 puis 668×718 ;
- 10495924187, Faustine la Jeune Sesterce : 592×573 puis 610×618 ;
- 10496058809, Maximin Hercule Follis : 741×716 puis 688×686.

Vinted ajoute de lui-même un recadrage en 3e vignette. Les 10 anciennes annonces sont closes par le circuit
(« supprimée puis recréée… pas une vente »). 2 ventes réelles pendant l'opération : leurs republications se sont
closes seules, rien retiré. Les 25 autres republications suivent la cadence de sa file. Quota : 0 décompté.

## 23/10 soir — décisions de Nico (1 et 2 ; 3 : rien à faire)

**Tête** :
- Aucune ligne de code touchée : données seulement, par `scripts/reparations/` (sauvegarde, inverse en tête).
- Selftests avant : 384 joués, 383 verts (18:07 → 18:16).
- Selftests après : 384 joués, 383 verts (18:30 → 18:37).
- Seul rouge : `messages-cause-vraie`, d'avant → **zéro régression**.
- `email_logs` : 10 215 à 18:15. Le seul mail depuis (18:25, `extension_link`, un autre compte) est sans rapport.
- 0 message, 0 alerte chez jocabroc8 et chez Louis.

### Décision 1 — les annonces en ligne à qui il manquait des photos
**Republiées à 18:15:54** par le circuit de l'app (« Republier » en tant que le compte, `spend_coins_and_republish`).
Gratuites, marquées `hors_quota` (0 décompté). Ce sont les 7 de jocabroc8 qui gagnent des photos :
- Leboncoin :
  - 3278102982 : 5 → 20 ;
  - 3278109059 : 5 → 11 ;
  - 3279059780 : 5 → 12 ;
  - 3278109961 : 5 → 15 ;
  - 3291557956 : 5 → 12 ;
- Vinted :
  - 10172888526 : 5 → 9 ;
  - 10438871696 : 5 → 12.

**Départ vérifié avant** (règle de départ de get-pending-jobs v275, rejouée sur les vraies données) : chaque fiche vient
d'eBay, toutes ses photos sont chez nous et ont été lues après le dépôt. Leboncoin part donc avec les photos de la fiche.
Sur Vinted, la capture est corrigée par la fiche (9 et 12 photos).

**Vérifié sur la plateforme (18:30, navigateur)** :
- Leboncoin 3278102982 → **3293867563** : « Voir les 20 photos », publiée à 18:29. L'ancienne : « Annonce introuvable ».
- Vinted 10172888526 → **10499778952** : 9 photos (5 vignettes et « + 4 »). L'ancienne est introuvable.

Les 5 autres suivent la cadence du compte : une à la fois, et la suivante attend que la précédente soit revenue en ligne.

**Laissées, rien à gagner** :
- jocabroc8 Leboncoin :
  - 3292079853 : 20 photos, le maximum de l'app ;
  - 3278764402 : fiche à 5 photos, comme l'annonce (décision 3) ;
  - 3279067385 : 10 photos à lui.
- nino57270 :
  - 3291893782 : Leboncoin n'accepte que 3 photos gratuites, elle en a déjà 3 ;
  - 3290695149 : fiche à 3 photos, comme l'annonce.
- xxewwer 3293844895 : déjà 12 sur 12.

Aucune annonce perdue ni doublée. Sauvegarde : `_backup_2310_soir_republications`.

### Décision 2 — Louis, ses questions « vendue ? » Beebs
**16 questions ouvertes, et non 14** : les 14 dépôts des 8 fiches de ce matin, plus 34181926 et 34182096, qui sont le même
cas.

**Constat (relevés)** :
- louis@ et louis-seller@ sont deux comptes reliés, et chacun a **sa propre boutique Beebs**.
- Les 16 annonces ont quitté la boutique de louis@ dans la soirée du 18/10 : 113 annonces au relevé de 10:28, 97 à
  celui de 23:35. Elles manquent à chaque relevé complet depuis, jusqu'au 23/10 à 17:15 (107 sur 107).
- Chaque article est en vente sur la boutique de louis-seller. On le retrouve par sa fiche jumelle (lien posé par le
  transfert du 18/10), jamais par le titre. Il y a été publié après la disparition, entre le 19/10 à 13:22 et le 20/10
  à 13:37, et le relevé du 23/10 à 14:08 le voit en ligne.
- Les deux fiches sont au stock (quantité 1), sans preuve de vente ni retrait ouvert.

**Tranché : les 16 sont closes à 18:28, aucune laissée ouverte** :
- Chaque dépôt mort est clos et sa question levée. La marque `copie_remplacee_par_compte_relie` nomme l'annonce qui le
  remplace. C'est l'issue de la règle « boutique partagée ».
- Rien d'autre ne bouge :
  - aucune vente, aucune fiche, aucun retrait, aucun mouvement de pièces ;
  - les 10 annonces de louis-seller sont intactes (publiées, sans alerte) ;
  - 0 mail, 0 message.
- Script `20261023_soir_louis_questions_beebs.sql`, sauvegarde `_backup_2310_soir_louis_questions`.

**Pourquoi la règle ne l'a pas fait seule** : `cross_post_jobs_alerte_tenue` (22/10) ne ferme une alerte « remplacée par
le compte relié » que si :
- la boutique est partagée par les deux comptes ;
- et seulement au moment où l'alerte naît.

Ici, il y a deux boutiques, et l'article est revenu en vente après la question.

### Ce que Nico doit décider (avec ma recommandation)
1. **Étendre la règle « remplacée par le compte relié »** :
   - à deux comptes reliés qui ont chacun leur boutique ;
   - et la rejouer quand la jumelle passe en ligne après la question.

   Il faut pour cela une migration de `cross_post_jobs_alerte_tenue` et un passage au relevé. Un seul couple de comptes
   est relié aujourd'hui : Louis.
   *Recommandé* : oui. Sinon, le prochain article qu'il déplace d'une boutique à l'autre reposera la question.
2. Toujours de ton côté : téléverser la 0.6.131.
