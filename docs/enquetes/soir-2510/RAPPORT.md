# 25/10 soir — feux verts de Nico : bordereaux Pro/Business, Leboncoin hors de France, créneau de republication, lecture de fond (heure de Paris)

Reprise à 17:56 (nouveau terminal). Consigne : appliquer puis prouver les trois propositions nommées, ouvrir la lecture
des descriptions aux payants dès la 0.6.144 servie, expliquer le « rythme par plateforme » (aucun feu vert), puis les
champs requis.

## 1. Bordereaux des comptes Pro/Business — FAIT et PROUVÉ
- Migration `20261025181000_bordereaux_copie_pro_business` **appliquée à 18:02:02** (`migration repair` fait) : la
  politique de stockage `bordereaux_insert` accepte `messagerie_beta OU bordereaux_ouverts_pour(compte, 'vinted')`.
  Lecture (`bordereaux_select`) et effacement n'exigeaient déjà pas la bêta ; `bordereau_copie_noter` acceptait déjà les
  Pro/Business hors bêta (relu en prod) : seule l'écriture du fichier bloquait.
- Preuve de la règle (essai annulé, insertion réelle dans `storage.objects` sous les claims de chaque compte) : les 7
  comptes Pro/Business touchés **acceptés**, un compte Free et un compte Premium **refusés** (RLS).
- Relance (script `scripts/reparations/20261025_bordereaux_copie_relance.sql`, essai à blanc d'abord, sauvegarde
  `_backup_2510_bordereaux_relance`, inverse) à 18:06:00 : 31 commandes de 7 comptes dont la dernière demande avait échoué
  sur la copie (commande toujours « à expédier », bordereau prêt chez Vinted, aucune copie) → une demande « récupérer »
  chacune, exactement ce que fait le clic. Leurs postes les prennent une par passage.
- **Jocabroc : ses 4 bordereaux prêts de 18:07:27 à 18:13:09** (PDF de 52 à 57 Ko, typés `application/pdf` dans le
  stockage, valables jusqu'au 30/10) — Nico prévenu à 18:16.
- Les autres comptes : voir § 7 (état de fin de session). Deux comptes ont des échecs d'une autre nature, `onglet_fige`
  (leur onglet Vinted n'a pas répondu en 45 s) : ce n'est pas la règle de stockage.
- 0 mail, 0 notification (aucun déclencheur sur les tables de bordereaux).

## 2. Leboncoin réservé à la France dès la création — FAIT et PROUVÉ
- Migration `20261025181500_lbc_hors_france_creation` **appliquée à 18:08:28** (corps de prod de
  `spend_coins_and_publish` relu juste avant : identique à celui de la proposition ; md5 après = fichier).
- Essai annulé juste avant, sous les claims réels : Marta (adresse en Italie) → Leboncoin refusé `platform_paused` /
  `lbc_hors_france`, rien créé ; son Vinted passe la règle ; le Leboncoin de Nico passe la règle. 6 310 codes postaux,
  2 comptes hors de France au 25/10 (Belgique, Italie).
- La table `codes_postaux_fr` a ses droits écrits dans le fichier (régime du 30/10 ; `selftest:tables-droits-explicites`
  rouge sinon) : ce sont ceux que la base lui avait déjà donnés à la création (relus avant / après : identiques).

## 3. Le créneau remplace ses sautés, écarte les annonces mortes, dit chaque retenue — FAIT (preuve de ce soir § 6)
- Migration `20261025180000_creneau_remplace_les_sautes` **appliquée à 17:58:56** : garde md5 des trois corps de prod
  vérifiée juste avant (identiques à la proposition), essai annulé rejoué à 17:58 (14 comptes, ancienne et nouvelle règle,
  0 job créé, 0 erreur), md5 relus après = ceux du fichier, inverse vérifié au md5 (= prod d'avant).
- Premiers passages après application (18:00 → 18:12) : 200 à chaque passage, les republications planifiées des autres
  comptes continuent au même rythme (louis Leboncoin 18:09:01, louis-seller Vinted 18:12:02, à l'heure que leur note
  `_espacement` annonçait) ; motifs neufs écrits : `_espacement` (louis, louis-seller), `_extension_absente`
  (josephinecerni ×3, meminiandmove : Chrome muet depuis la veille ou la nuit — retenues jusque-là SANS motif).
- **L'app le montre** (`src/components/RepublicationPlanifiee.jsx`, web au push) : pendant le créneau, « Le créneau attend
  Chrome », « Les republications Leboncoin sont réparties sur le créneau — la republication Vinted de 19h30 compte aussi
  pour Leboncoin », « Plus rien ne partira sur Leboncoin dans ce créneau » (avant le créneau manqué de la veille ; jamais
  l'heure de la suivante : « aucun temps estimé devant la personne », règle du 15/10, selftest aucune-estimation) ; dans
  l'historique : « Chrome était fermé de 19h03 à 21h12 (dernier signe à 16h58) » et le rythme. Selftest neuf
  `creneau-remplace-les-sautes` (39 contrôles, dont les phrases réelles calculées sur le 24/10 de Jocabroc).
- Cadence intouchée (vérifiée par le selftest) : rythme du compte toutes plateformes, un job par compte et par passage.

## 4. Lecture des descriptions dès l'import — ouverte aux payants (s'allume avec la 0.6.144 servie)
- `coin_config.lecture_fond_mode = 2` posé à 18:23:21 (journalisé ; script `scripts/reparations/20261025_lecture_fond_payants.sql`,
  inverse). Le serveur ne sert la lecture qu'à une extension ≥ 0.6.144 : chaque compte payant (36 avec une extension vue
  en 3 jours) commence au moment où son Chrome reçoit la 0.6.144 du Web Store ; aucun poste en 0.6.141 ne lit rien.
- Rythme inchangé : 3 pages publiques par poll, 20 à 45 s d'écart, 300 par jour et par compte ; premier refus de Vinted =
  compte coupé 6 h (serveur et extension) ; refus comptés chaque jour par ops-digest. Coût serveur mesuré : 6 ms par poll
  (EXPLAIN ANALYZE, compte payant de 1 380 fiches).

## 5. Le « rythme par plateforme » — explication (AUCUN changement fait)
**a. D'où viennent les ~30 min.** Le créneau ne republie pas à la chaîne : il RÉPARTIT ce qui est prévu sur toute sa durée.
Intervalle = durée du créneau ÷ nombre prévu : chez Jocabroc, 3 h ÷ 6 Vinted = 30 min, 3 h ÷ 5 Leboncoin = 36 min. But :
des annonces qui remontent toute la soirée, jamais une rafale. La republication « normale » (bouton, lot) enchaîne au
contraire : la suivante part dès que la précédente est finie — mesuré chez Jocabroc, une republication Vinted prend ~4 min,
une Leboncoin ~11 min. Le point qui bloque : le rythme est compté pour le **compte**, toutes plateformes (règle du 18/09,
« un seul Chrome ») — après chaque republication Vinted, Leboncoin doit attendre ses 36 min, comptées depuis cette
republication Vinted.

**b. Ce que changerait le rythme par plateforme.** Une seule ligne : l'attente de Leboncoin serait comptée depuis la
dernière republication **Leboncoin** (idem pour Vinted). Ce n'est PAS plusieurs onglets à la fois : l'extension fait
toujours une seule chose à la fois (une file, un verrou) ; si deux tombent ensemble, la seconde attend quelques minutes.
Anti-robot : inchangé pour chaque site — Vinted voit toujours une republication toutes les 30 min, Leboncoin une toutes
les 36 min, ce que Leboncoin voit déjà le mercredi quand Vinted ne tourne pas (21/10 : 4 sur 6) ; aucun site ne voit
l'activité de l'autre (mesuré sur 7 jours : 1 job Leboncoin marqué anti-robot sur 5 939). Ce qui change : l'ordinateur
travaille plus pendant le créneau (≈ 80 min sur 180 au lieu de ≈ 25), Chrome doit rester ouvert tout le créneau.

**c. Le créneau de Jocabroc (6 Vinted + 5 Leboncoin, 19:00-22:00).** Aujourd'hui : Vinted 19:00, 19:30, 20:00, 20:30,
21:00, 21:30 = 6 ; Leboncoin toujours repoussé à 36 min après chaque Vinted, jusqu'à 22:06 → **0** (l'app le dit
désormais). Avec le rythme par plateforme : Vinted aux mêmes heures, Leboncoin 19:03, 19:39, 20:15, 20:51, 21:27 → **6 + 5
= 11**, fini vers 21:40 (Chrome ouvert, annonces en ligne). Sans y toucher, l'autre issue honnête : annoncer des prévues
qui tiennent dans le rythme partagé (≈ 3 + 3), ou séparer les créneaux des deux plateformes.

## 6. Le créneau de Jocabroc ce soir — ce qui est mesuré (Nico : « n'attends pas qu'il rouvre, je verrai par les check news »)
- 19:00:06 : lignes du créneau nées (Vinted 641 : 6 prévues, 135 éligibles ; Leboncoin 644 à 19:03 : 5 prévues, 53
  éligibles). La 1re republication Vinted (job d3fcf5a6) vise **10297584228**, la 1re annonce vivante — la morte d'hier
  (10125516124, rang 6) n'est plus candidate ; deux annonces mortes notées une fois « annonce_introuvable » (10118315224,
  10176517596).
- Son Chrome est muet depuis **18:51:24** (juste après sa publication Leboncoin de 18:49) : à 19:03 le balayage a écrit
  `_extension_absente` sur les deux lignes ; ce que son app reçoit (relu sous ses droits, transaction annulée) : créneau en
  cours + « extension absente, dernier signe 18:51 » → elle affiche « Le créneau attend Chrome ». Le job d3fcf5a6 attend
  son poste ; rien n'est perdu (le créneau reprend seul jusqu'à 22:00).
- Sans rythme par plateforme, Leboncoin fera 0 ce soir même si Chrome revient (§ 5) — l'app le dira (« Plus rien ne
  partira sur Leboncoin dans ce créneau »).
- À vérifier au prochain check : créneaux 641 / 644 clos (faites, motifs), job d3fcf5a6.
- Sa publication Leboncoin de 18:49 (job 6ae4cdc7, fiche « Dessin signé Nelson Mandela… » importée sans texte) est retenue
  « en cours de lecture de ton annonce d'origine » : son extension 0.6.141 ne lit pas (lecteur réparé dans la 0.6.144) —
  elle part seule dès que la 0.6.144 est sur son poste.

## 8. Beebs en arrière-plan (0.6.145) — écrit, pilote sur le poste de Nico
- Serveur (`_shared/lecture-fond.js` § Beebs, `get-pending-jobs` → `lecture_fond_beebs`) : servi aux seuls postes ≥ 0.6.145 ;
  interrupteur `coin_config.lecture_fond_mode_beebs` ABSENT = 1 (le poste de Nico seul, en mesure) ; 2 pages par poll, 30 à
  60 s d'écart, 120 par jour, coupure 12 h au premier refus ; lectures bornées (200 annonces, la 2e photo seulement).
- Extension 0.6.145 (`lireFondBeebs`) : requête de même origine depuis l'onglet www.beebs.app, jamais de navigation vers
  l'annonce, jamais pendant un relevé ; 403 / 429 / vérification = « antirobot » → arrêt 12 h tout de suite.
- Refus et plafond comptés par plateforme (un refus Beebs ne coupe pas Vinted) ; ops-digest lit le journal par pages
  (avec les payants ouverts, il dépassait 1 000 lignes par jour : PostgREST en coupait le reste sans erreur).
- Leboncoin : la liste « Mes annonces » porte déjà tout (texte, photos, critères) — aucune page à lire ; le seul manque
  (relevé qui n'écrit que 400 captures sur 816) est une règle d'écriture, pas une lecture : à faire, CPU mesuré d'abord.
  Depop : 0 fiche incomplète jamais lue (mesuré le 25/10) — rien à lire.

## 7. Selftests
- Avant (18:10 → 18:20, arbre au commit fceb2d5 + migrations renommées) : 433/434 ; le rouge,
  `tables-droits-explicites`, venait de la table `codes_postaux_fr` (droits non écrits dans le fichier) — corrigé.
- Lot 1 (438a539) : 435/435 (18:34 → 18:43 ; un rouge intermédiaire, `aucune-estimation`, a fait retirer toute heure
  future des textes du créneau). Lot Beebs (5f8f54c) : 436/436 (19:05 → 19:15 ; rouge intermédiaire
  `gpj-file-longue-et-pause` : lecture des fiches passée par `lireParLots`). Lint : rien de neuf.

## 9. Bordereaux — état à 19:20
- 26 sur 31 prêts (Jocabroc 4/4, recrutementgroupezk704 18/18, seghirdeborah711 2/4, sebastien64310 1/1, voirememe 1/1).
- 4 « onglet_fige » (antikcollections 2, seghirdeborah711 2) : relancés UNE fois de plus à 19:19:14
  (`scripts/reparations/20261025_bordereaux_copie_relance_2.sql`) ; antikcollections est muet depuis 18:47 (sa demande attend
  son poste, 24 h au plus). Marta : 1 en file, poste éteint.

## 10. Champs requis (« zéro question ») — diagnostic fait, plan prêt, à coder après les décisions de Nico
- 7 jours : 418 questions affichées sur 26 comptes (190 levées par la personne, 70 par le moteur, 45 abandons) ; les quatre
  champs (taille, âge, pointure, matière) = 273 (65 %) : Beebs Taille 135, Beebs Âge 52, Vinted Taille 25, Leboncoin Pointure 17
  (11 abandons, dont Marta 12 affichages), eBay Taille 17, Beebs Matière 11, eBay Matière 8. La friction est dans l'app (6 jobs
  seulement en attente sur ces champs).
- Causes prouvées des 5 cas : Sandra (Beebs Matière : rédaction sans photo, la Matière est un champ « partagé » que
  l'enrichissement saute, question en texte libre face à une liste fermée ; Beebs Âge d'un magazine : âge non déduit hors
  jouets, levier IA en « fantôme ») ; chaouidz (eBay Matière libre, l'IA « ne jamais inventer », aucun repli) ; Marta (copie
  rédigée sans les champs de la fiche ; « EU 37.5 » jugé hors liste — corrigé le 25/10 01:07 ; Leboncoin de toute façon
  hors de France) ; Johan (Lens sans taille, titre muet : vrai dernier recours).
- Valeurs FAUSSES en ligne nées d'une question : chaouidz « Pointure 16 » au lieu de 31 (Leboncoin 3294638238, Beebs
  34229052) ; louis-seller, 27 livres Beebs en « 8 ans - 12 ans ».
- Règle proposée (une chaîne pour l'écran, le lot et le serveur) : la personne → la FICHE lue au jugement (pas seulement pour
  Opla) → le texte du vendeur → la règle du rayon → l'IA avec photos → le bac de la grille quand il est vrai → une seule
  question, liste fermée. Détail, fichiers, selftests et les 7 décisions : `CHAMPS-REQUIS.md` (même dossier).
