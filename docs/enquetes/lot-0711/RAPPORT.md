# Lot du 07/11/2026 — terminal « Problèmes » (heure de Paris)

Règle du lot (Nico) : chaque constat vérifié par lecture avant tout correctif ; la RÈGLE corrigée, jamais le cas.
Enquêtes en lecture seule (base, code, journaux, page publique Leboncoin lue depuis l'onglet de Nico).

## 1. Garde « jumeau » Leboncoin : remises annulées sur une annonce VENDUE — constat EXACT
- Jobs 18af38a2 (3303702852, déposé 06/11 20:08) et fdda158a (3303792394, 07/11 01:14), compte Amiral (faf5021a) :
  « cancelled » par `trancher_publications_sans_lien` avec « … en ligne sous l'annonce 3297400164 / 3298491503 : rien à
  refaire, rien n'est vendu ». Ces deux annonces sont VENDUES (jobs « sold » le 06/11 07:15) ; Leboncoin les garde
  « active » avec la transaction « pending » / « sold » (annonces_plateforme.transaction_plateforme).
- Page publique lue le 07/11 vers 11:00 : 3303702852, 3303792394 et 3303867959 (rang 3, 06:50) = « Cette annonce est
  désactivée » (HTTP 410) ; 3297400164 et 3298491503 actives, transaction pending / sold.
- Cause : les gardes « l'article est en ligne sous une autre annonce » (`trancher_publications_sans_lien` deux boucles,
  `depot_jamais_en_ligne_refermer`, `article_en_ligne_ailleurs`) lisaient `statut_plateforme = 'en_ligne'` seul.
  Effet de bord : la série de Louis a pris la clôture du rang 1 pour une sortie de série et a déposé les rangs 2 et 3.
- Parc (60 jours) : 2 clôtures à tort, toutes deux de Louis (la 3e citée, Livre du 20/10, était juste à son heure).
- Correctif : migration `20261107140000_annonce_vendue_jamais_en_ligne.sql` (écrite depuis la prod, NON APPLIQUÉE :
  feu vert de Nico requis) — aide `annonce_prise_par_une_vente()` (transaction lue, vente enregistrée, job « sold », job
  publié `sale_signal 'sold'`) dans les trois gardes ; règle `depots_clos_sur_annonce_vendue_rejuger()` appelée à chaque
  relevé : un dépôt clos ainsi depuis 14 jours, vente prouvée AVANT la clôture, dépôt jamais vu, aucune annonce non
  vendue en ligne → « failed » avec le motif vrai (publication rendue). `phrase_rien_vendu()` : jamais « rien n'est
  vendu » sur une remise en vente. App : `src/utils/rienVenduSurVente.js` (affichage, tous les textes, toutes sources).
- Preuve : `PREUVE_PG=embarque node scripts/preuve-annonce-vendue-jamais-en-ligne.mjs` → 27/27 (inverse au md5).
  Simulation en lecture sur la prod : la règle rejugerait exactement les 2 dépôts de Louis, aucun autre.
- « Repartent d'elles-mêmes » : NON appliqué tel quel — leurs dépôts ont été REFUSÉS par Leboncoin (410), pas perdus.
  Rejugés « failed », la série s'arrête (arrêt au premier refus). Les redéposer maintenant = un 4e refus (point 6).

## 2. Relevé Leboncoin plafonné à 400 ? — constat INEXACT
- Aucun plafond : l'API de Leboncoin dit elle-même 400 annonces actives pour la boutique PARTAGÉE de Louis
  (account_stats.active_ads = total = 400) ; elles se répartissent 281 + 119 sur ses deux comptes FillSell. D'autres
  comptes lisent 462 et 1 186 annonces ; Louis a lu 401 à 404 les 05-06/11.
- « [statuts] active 440 » : les 10 annonces de chevauchement entre pages comptées deux fois (4 × 10). Corrigé (0.6.177).
- ayadi007 n'est pas à 400 : 128-129 annonces lues sur 128-129.
- Les remises : refusées (410), et un refus n'apparaît pas dans le tableau de bord de Leboncoin (essai réel du 30/10).

## 3. Ciddjy (Beebs) : 4 redépôts « pas de réponse du content script » — constat EXACT, précisé
- Job 49342549, annonce 34177027 retirée le 07/11 06:27 ; redépôts 06:34, 06:54, 07:15, 07:49, chacun arrêté à la borne
  de 10 min. Le script RÉPONDAIT (battements) ; « dernière phase : debut » parce que beebs.js ne marquait aucune phase.
- Cause : poste devenu lent (remplissages Beebs 37-99 s le 05/11, 285-566 s le 06/11, pré-vol de CE job 602 s) et borne
  fixe. Le pré-vol a frôlé la borne, l'annonce a été retirée quand même. Risque prouvé : après la borne le remplissage
  CONTINUAIT jusqu'au clic (ayoub, 04/11 : annonce parue 12 min après « délai dépassé ») → 0 à 4 doublons possibles chez
  Ciddjy, à trancher par un relevé.
- Correctifs : serveur — un essai Beebs muet/à la borne est SUSPECT (`_shared/recreation-deja-partie.js`) : annonces
  relues avant tout redépôt ; cause levée `remplissage_borne_depassee` (`_shared/recreation-bloquee.js`) : la remise en
  ligne bloquée repart SEULE, une fois tout de suite et une fois au build 0.6.177, borne élargie à 20 min, après relecture ;
  `prevol_trop_lent` classé (pas-de-rouge). Extension 0.6.177 — « abandon » à la borne (aucun clic d'envoi après),
  phases Beebs, borne adaptative (`fill_borne_ms`), pré-vol > 70 % de la borne = AUCUN retrait.
- Ce job repart par la règle au prochain passage de handler-watch (déployé), après un relevé Beebs complet.

## 4. nicolas.menar : doudou Simba en « Jouets › Peluches › Modernes » — constat EXACT
- Cause : `brancheGenre` (src/utils/categorieParMot.js) lisait « Bébé » dans la racine eBay « Bébé, puériculture » et
  écartait la feuille 148373 pour un genre Fille ; l'icône 🧸 prenait le relais. Correctif : la racine puériculture
  n'est pas un genre. Selftest `puericulture-genre-ebay` (doudou EXACT 148373 pour tout genre ; robe Fille inchangée).
  0 autre cas dans le parc depuis le 12/09. App (web au push ; mobile à l'OTA).

## 5. ayadi007
- a) Autoradio Suzuki (3303452096) : PAS le cas « pour + marque » (marque envoyée VECHTEL, fabricant, gardée à juste
  titre ; Suzuki/Fiat jamais envoyées). Refus de modération Leboncoin sans indice chez nous : 8 autoradios du même lot,
  même rayon, acceptés le même jour. Rien à corriger.
- b) C'est la MÊME annonce : « failed » juste (jamais vue, relevés de 21:27 et 21:36 complets, 128/128, 129/129). Aucun
  lien avec un plafond.
- c) Machine de maquillage : NOTRE faute — rayon Vinted 967 « neuf seulement » pour un article « Très bon état » ; 8
  remplissages puis le générique. Corrigé : classé tout de suite (pas-de-rouge `vinted_rayon_neuf_seulement` +
  update-job-status) ; 0.6.177 : attente de la personne sans réessais.
- d) Chariot : « Grand » choisi par lui en réponse à NOTRE question ; les DIMENSIONS ne viennent de personne (FillSell
  ne sait pas les envoyer). Corrigé : la question sur une clé jamais relue tombe, message vrai (serveur + 0.6.177).
  Décision à prendre : saisie des dimensions du colis Vinted.

## 6. Inserts Zombicide / remises de Louis — cause établie sur preuve
- 3303867959 (« Blanc et Vert Pomme », rang 3, 06:50, marque « Autre », AUCUNE marque SEB envoyée) : DÉSACTIVÉE (410),
  comme 3303792394 (marque retirée → « Autre ») et 3303702852. Leurs annonces vendues identiques sont toujours
  affichées sous transaction (3295743872, 3298491503, 3297400164 ; Zombicide 3297234692, 3298021777).
- Cause : Leboncoin refuse un dépôt identique à une annonce encore affichée (essai réel du 30/10 sur le compte de Nico :
  « similaire à une annonce déjà en ligne », à la seconde du dépôt). La marque n'est PAS la cause.
- Proposition (Nico décide) : (A) retenir une remise Leboncoin tant que son annonce vendue identique reste affichée
  (= règle A, retirée le 06/11) ; (B) remettre en vente sous une annonce visiblement différente (photos dans un autre
  ordre, titre) — non éprouvé, risque de refus ; (C) ne rien remettre automatiquement sur Leboncoin pour un article à
  plusieurs exemplaires tant que la transaction n'est pas close.

## 7. Restes anciens
- Marta MELE (3 republications Vinted retirées les 02-03/11, page italienne) : Vinted exige la couleur alors que la
  capture la porte. Correctif 0.6.177 (couleur relue, posée au POST, couleur vide = arrêt AVANT retrait) + cause levée
  `vinted_couleur_connue_non_posee` (message « défaut de notre côté »). Mécanisme exact non prouvé (pas d'essai réel sur
  une page italienne) ; 27 autres republications de Marta attendent (poste éteint depuis le 03/11). À décider : retenir
  avant retrait les recréations Vinted non françaises avec couleur jusqu'au build.
- linda.sidhoum : erreur réseau passagère sur le référentiel des tailles (1 essai). 0.6.177 relit 2 fois. Le job repasse
  seul (reprises serveur), annonce intacte.
- labrunettedu44 : l'annonce de 2021 n'a AUCUN prix (relevé, tâche, fiche) — le pré-vol avait raison, « relancer » ne
  pouvait pas aboutir. Message vrai (update-job-status), prix de la fiche repris par get-pending-jobs, classement corrigé.

## 8. « Ventes annulées » — constat EXACT (4 lignes d'Ornella), 2 lignes légitimes
- Pull, machine L'OR, robe gris, robe portefeuille : article remis en ligne par Ornella (« Republier » de Vinted, 28/10)
  sous une fiche NEUVE créée par la synchro ; 3 vendus depuis. Soutiens-gorge et manteau : aucune jumelle, lignes justes.
- « Remettre en vente » créait aujourd'hui de NOUVELLES annonces eBay/Leboncoin pour un article VENDU.
- Migration `20261107150000_ventes_annulees_fermeture.sql` (NON APPLIQUÉE : feu vert requis) : fermeture automatique
  (fiche hors stock ; jumelle PROUVÉE : photos dHash ≤ 4, même boutique, apparue après la vente, jamais en ligne
  ensemble, une seule candidate, née d'un relevé), même garde avant toute création, bouton « Ne pas remettre en vente »
  (RPC `ventes_annulees_ne_pas_remettre`). Preuve 37/37 ; simulation prod : 25 lignes fermées sur 14 fiches (dont les 4
  d'Ornella), soutiens-gorge et manteau gardés. ⚠ Spatule (02ca0f20) : preuve la plus faible (1 photo), à trancher.
- Double fiche (rattachement manqué) : NON corrigé dans ce lot — le moteur range « sold » en vendue même après une
  annulation prouvée ; correctif proposé en 5 étapes (aide SQL, variante de vinted_remise_en_ligne, question jamais
  fusion, fusion acceptée au « Oui », moteur JS + redéploiement de « rapprochement »).

## 9. « À régler » : retirer une ligne — constat EXACT
- Tâche Beebs 68427585 (numéro 34232802 prouvé jamais en ligne) : « Abandonner » refusé dès qu'un numéro existe.
- Correctif (app seulement, OTA) : « Retirer de la liste « À régler » » sur toute ligne — tâche : marque
  `platform_fields.retire_de_a_regler` (statut, numéro, empreinte d'erreur, relances) ; autres lignes : mémoire
  `platform_settings.a_regler_retires` (RPC platform_settings_fusionner), retour sur fait nouveau ; 200 lignes, 90 jours.
  Rien n'est supprimé, annulé ni retiré. Fermeture seule ajoutée quand la fiche jumelle d'un compte relié est présente.

## 10. Photos hébergées chez une autre plateforme — constat exact sur les chiffres, inexact sur « Vinted refuse »
- 22 republications Leboncoin en attente (5 comptes) et 32 annulées ont leurs photos sur images1.vinted.net. Le CDN de
  Vinted sert tout le monde (200) mais sans en-tête CORS hors vinted.fr : le fetch() de la page Leboncoin est bloqué.
  Depuis un serveur, les 85 photos se copient. Beebs : aucun CORS, même chez lui. Leboncoin, Depop, eBay : CORS ouvert.
- Le filet serveur ne les voyait pas (lecture non paginée, 1 000 lignes sur 2 405). Le texte « FillSell la rapatrie
  automatiquement » venait de l'extension seule.
- Correctif : `_shared/photos-hors-plateforme.js` (une photo sur le CDN d'une AUTRE plateforme que celle visée est copiée
  chez nous, Vinted compris, Beebs partout) ; get-pending-jobs retient le job (rien retiré) tant que ses photos ne sont
  pas copiées ET relues ; handler-watch les copie (30 photos / 25 s par cycle, `rapatrierPhotoVerifiee` : type prouvé
  par les octets, copie relue). Texte de l'extension rendu vrai (0.6.177).
- Les 32 annulés : 19 par la personne, 4 article vendu, 9 par l'arrêt de 72 h (anti-robot, connexion). Rien relancé ;
  proposition : relance par la personne, ou script de réparation sur ordre.

## Restes / décisions de Nico
- Feu vert sur les migrations 20261107140000 et 20261107150000 (rien appliqué).
- Point 6 : A, B ou C. Point 5d : saisie des dimensions. Point 7 : retenue Vinted non française. Point 8 : spatule ;
  correctif du rattachement. Point 10 : photo morte dans une republication ; retenue SQL optionnelle.

## Suite du 07/11 après-midi (décisions de Nico)
- Point 6, option A : règle A rétablie (get-pending-jobs, avant la série) ; les remises de Louis closes/jamais vues
  (rangs 1-4, dont 3304017454 déposé à 11:25, 410) reviennent en attente (handler-watch) et repartent à la disparition
  de leur vendue, rang par rang.
- Point 3 : 0.6.178, arrêt à la borne pour TOUS les comptes ; doublons de Ciddjy PROUVÉS (4 annonces, une par essai,
  numérotation Beebs) → règle « nos propres dépôts en double » : 34309782 gardée, 3 retraits par le circuit existant.
- Point 7 (Marta) : retenue de toute republication Vinted d'une page non française avant retrait, jusqu'à la preuve
  (interrupteur coin_config `vinted_republication_hors_fr_prouvee`, essai : drapeau beta `vinted_essai_hors_fr`).
- Point 8 : migration B resserrée APPLIQUÉE (feu vert nommé ; 77 → 51 propositions, 26 fermées, spatule et By Zoé
  ouverts) ; migration C (rattachement = question, jamais fusion) prête, preuve 43/43, NON appliquée.
- Point 6 (nouveaux rouges) : Sonia = photos PNG lourdes (critères LBC après réception) → 0.6.178 + relance au build ;
  tailles eBay (E1/E2) ; correctifs serveur du balayage (dépôts jamais vus sur article vendu/supprimé, prix de la
  fiche, ISBN des republications, taille Depop, « A x B cm », relevés d'absence).
- Vérifié en prod le 07/11 : Ciddjy 17:03 — 49342549 rattachée à 34309782, 3 retraits armés (34309820, 34309865,
  34309939) ; Louis 17:16 — rangs 1-4 remis en attente (dépôts refusés archivés), les 9 rangs retenus par la règle A
  (toutes leurs vendues encore affichées) ; migration B : 77 → 51 propositions ouvertes.
- Marta (preuve en lecture, sans dépôt) : catalogue des couleurs de vinted.it lu en public (29 identifiants, identiques
  à la France, libellés seuls différents) ; la 0.6.178 exécutée sur les 30 republications en attente envoie toujours la
  couleur de la capture (138 exécutions, aucune fausse). NON prouvés sans page connectée : le vrai menu de vinted.it et la
  clé du POST → retenue Vinted hors France MAINTENUE. Points à trancher : b9460406 (24 d'origine, 5 remise le 25/10),
  f1c4a0e0 (27 de la fiche, 9 en ligne), 4 annonces disparues, « Rosa » 5/24, libellés italiens de vintedColors.js.
- Balayage du rouge (parc actif 173 comptes) : « cassé chez nous » 79 (14:06) → 45 (17:31), 0 apparu, aucun taux en
  baisse (sortie : scratchpad balayage-apres2-20261107-1731).
