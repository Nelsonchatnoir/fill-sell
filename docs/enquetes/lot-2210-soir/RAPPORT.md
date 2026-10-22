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
