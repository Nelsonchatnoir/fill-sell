# Lot de Nico du 08/11 après-midi — terminal « Problèmes » (13 points)

Heures de Paris. Règle de relance appliquée partout : status 'pending', error NULL, retrait de needs_user_*,
needsUserAttempts, next_action_after, error_technique, processing_since ; erreurs_archivees et republish_step gardés.

## 1. Vitesse des republications (priorité n° 1)
**1a. Cadence mesurée (Joséphine, josephinecerni, Pro, 874 republications créées le 04/11 22:07:43 → 22:14).**
État à 15:00 : 80 publiées (Beebs 29, Leboncoin 22, Vinted 29), 796 en attente (Beebs 253, Leboncoin 275, Vinted 268).
Le 08/11 : 47 republications de 09:24 à 14:53, une toutes les ~7 min (écarts de 3 à 15 min), UNE plateforme à la fois.
D'où vient l'intervalle :
- serveur (get-pending-jobs, « article par article », 02/10) : à chaque poll (~2-3 min), PAR plateforme, 1 tâche
  « captured » (le retrait suivant) + 1 « a_capturer » (la lecture suivante) → 6 tâches servies chez elle (journal :
  « 6 job(s) distribué(s), 793 republish retenu(s) ») ;
- extension : `REPUBLISH_ESPACEMENT_MS` = 2 min entre deux gestes, compté sur UN minuteur global
  (`dernierGesteRepublishAt`) → après une republication Leboncoin, Vinted et Beebs « skipped » jusqu'au cycle suivant.
  Journaux update-job-status : une seule tâche passe « processing → published » par cycle de poll.
- **Une plateforme attendait donc la fin d'une autre.** Pause de respiration (50 d'affilée → 2 h) : comptée elle aussi
  toutes plateformes confondues.
**1b. Correctif** (règle : `docs/regles/republication-et-publication.md` § 08/11 après-midi) :
- extension 0.6.181 : espacement compté PAR plateforme ; un retrait (vente) né pendant un cycle plus long le coupe
  entre deux tâches (une fois par retrait) ; toujours UNE action à la fois, un onglet : le poste n'est pas plus chargé ;
- get-pending-jobs : pause de respiration PAR plateforme (`_shared/pause-respiration.js`) ; seules les republications
  des plateformes en pause sont retenues ; forme d'ensemble gardée pour les applis installées ;
- Cloud : même extension (copie Cloud reconstruite depuis le commit, `EXTENSION_SEULE=1 deployer.sh`) ; même serveur.
- Rien ne change pour l'ordre et la règle des remises de Louis (série `louis-remises-lbc-0611`, attente_annonce_vendue :
  blocs serveur intouchés) ni pour le « retrait confirmé avant recréation » (une-passe et invariant hors ligne intacts).
**1c. Rythme de chaque plateforme : INCHANGÉ.** Recherche web (Clemz — « Clemzend » —, VintedCRM, Crosslist, Vendoo,
Dotb, List Perfectly, Closo) : aucun outil ne republie plusieurs plateformes en même temps ; aucune preuve qu'un rythme
plus rapide que ~2 min par plateforme soit sans risque (aucun seuil publié par Vinted, Leboncoin, Beebs, Depop ; les CGU
de Vinted interdisent la suppression-remise en ligne en lot quel que soit le rythme ; Clemz : 20-30 s entre deux articles
mais 20-30 par jour, 2 × 50 pour un gros dressing). Le risque Vinted connu est le VOLUME en rafale (nadegemarcelin78 :
96 dans la journée, restreint) : la pause 50/2 h reste, par plateforme. Seule exception documentée : eBay par l'API.
Gain attendu : jusqu'à une republication par plateforme et par cycle au lieu d'une pour toutes (×3 chez Joséphine) ;
pour Vinted seul, le rythme d'un compte Vinted seul aujourd'hui.
**1d. Pause → reprise : la cause supposée est FAUSSE, rien à corriger.** 51 pauses / 51 reprises le 08/11 (usage_logs
file_pause). Les republications « juste après une reprise » avaient toutes commencé 20 à 60 s AVANT la reprise
(14:34:31 publiée : en cours depuis 14:33:47, reprise 14:34:02 ; 14:40:41 : en cours depuis 14:39:44, reprise 14:40:35).
Rythme identique sans aucune pause (09:24-11:06 : 7,4 min) et pendant les pauses (6,9 min). La reprise ne court-circuite
rien ; la pause garde sa fonction.
**1e. 05 et 06/11 : poste fermé, prouvé.** Aucun appel de son extension du 04/11 22:51 au 07/11 18:04 (journaux des
fonctions : 0 ligne le 05 et le 06 ; usage_logs : rien entre 04/11 22:46 et 07/11 18:04 ; relevés : aucun).
**1f. « Ta file » dit que la file avance** : par plateforme, faites / restantes / rythme constaté / fin estimée en temps
d'ordinateur allumé (ou de FillSell Cloud), pauses comprises ; aucune estimation sous 4 republications constatées ;
« Mettre en pause puis reprendre n'accélère rien ». Exception nommée à la règle du 16/10 (décision de Nico).

## 2. eBay 25002 « code JavaScript » (Sébastien, 8d59f147)
Cause : le filtre « contenu actif » d'eBay lit `expression (` dans « collection Expression (PolyGram) » (seul motif de code
du texte ; « rapide ( » est passé 5 fois). Établie par élimination sur le texte réel (aucun autre motif nommé par eBay).
Notre HTML n'y est pour rien (1 446 publications API passées avec lui ; `<` toujours échappé). 1 seule tâche de tout le
parc a eu ce refus. Correctif : `sansContenuActifEbay` (`_shared/ebay-publication.ts`) — mot dans un `<span>`, parenthèse
ou point en entité : texte visible identique, aucun invisible. Relance par `scripts/reparations/20261108_relance_ebay_contenu_actif.sql`
après redéploiement d'ebay-api-worker et ebay-account. Voie extension non touchée (0 refus sur 10 053 en 30 j).

## 3. ayadi007 — compte Leboncoin bloqué puis remplacé
- Cause du blocage : NON PROUVÉE (Leboncoin ne donne pas son motif) — faits : compte FillSell de 3 jours, 30 publications
  le 06/11 puis 76 retraits + redépôts en 26 h (nuit comprise), après deux refus de modération ; même rythme chez d'autres
  comptes sans blocage.
- 931 doublons « d'autres comptes » : 440 étaient les siens (clos à 13:50) ; il en reste 491 sur 11 comptes, clos par
  LA règle (`lignes_sans_fiche_clore`, migration 20261108143000) : `scripts/reparations/20261108_lignes_sans_fiche_doublons_parc.sql`
  (sauvegarde `_backup_0811_lignes_sans_fiche_parc`, inverse).
- Voir la suite en fin de rapport (lignes de l'ancien compte, 4 republications).

## 4. jumiss44 — retrait Vinted 90056625 (article vendu le 06/11 19:35)
Cause : la session Vinted est absente de son navigateur (Edge) depuis le 06/11 (relevés du dressing : « aucune session
Vinted dans Microsoft Edge » le 06, 07 et 08/11 ; sonde Vinted 403) ; 12 essais, « identité non prouvée : session » ; le
retrait ne part jamais sans prouver le compte (juste). Après 09:37 le 08/11, l'ordinateur était éteint (aucun poll).
Défaut chez nous : l'app disait « En pause · nouvel essai automatique, rien à faire » alors que le message disait
« Connecte-toi à Vinted ». Règle corrigée : `attendConnexion` (`_shared/etat-job.js`, recopié dans l'extension 0.6.181)
→ « À toi de jouer : connecte-toi ». Le retrait part seul dès qu'elle se reconnecte à Vinted sur son ordinateur.

## 5. Repli « modèle » Vinted — essai réel fait (compte de Nico)
Annonce 10719554551 « TEST FillSell Samsung » à 999 €, Téléphones portables > Samsung, « Mon modèle ne figure pas dans la
liste » → « Autre » : ACCEPTÉE par Vinted. Clés de traduction de Vinted : `item_upload.model.other_options.other` =
« Mon modèle ne figure pas dans la liste », `…other_options.unknown` = « Je ne connais pas le nom du modèle ». La
correspondance « other » est prouvée. Blocage gardé (décision de Nico). Retrait de l'annonce de test : voir fin de rapport.

## 6. Files anciennes sur comptes actifs
- linda.sidhoum : NORMAL — lot de 781 du 13/10 qui se vide les jours où le poste est allumé (604 publiées) ; poste
  éteint depuis le 06/11 17:42 (réveils de nuit seulement).
- doriane-henri : NORMAL — la file avance (~10/h, 72 le 07/11, 37 le 08/11).
- gjehly : NORMAL — Vinted a restreint le compte jusqu'au 10/11 inclus (page /selling-restriction lue le 05/11 13:03) ;
  reprise posée au 11/11 00:05 (fin de journée de Paris + 5 min) ; Leboncoin continue.
- Johan Désiré (tiblancdeshaut) : NORMAL — file en pause à sa demande depuis le 30/10 14:59 ; les 19 Leboncoin visent
  des annonces absentes des relevés (garde juste).
- Rosa Metra : geste de la personne (Leboncoin demande nom et prénom) — MAIS défaut chez nous : chaque nouvelle
  publication et chaque tâche remise en file rouvrait le formulaire et revenait au mur (2 à 3 visites inutiles après
  chaque éclaireur, 11 dépôts neufs). Corrigé : seul l'éclaireur part tant que le mur tient (get-pending-jobs).

## 7. doriane-henri — erreur JS après un déploiement
Cause prouvée : chunk absent → `vite:preloadError` annulé → Vite résout l'import avec `undefined` → TypeError → écran
blanc ~1 s → rechargement. Correctif : `src/utils/lazySur.js` partout, repère de rechargement dans main.jsx (web au push,
mobile à l'OTA). Vercel/Cloudflare corrects (404 franc sur un chunk absent, `/app` revalidé).

## 8. XEWER — « Failed to fetch » sur un lot Leboncoin (07/11 18:17)
Cause prouvée : lot lancé du téléphone (Android), app passée en arrière-plan pendant la boucle, réseau coupé par Android ;
la 31e demande n'a jamais atteint le serveur, rangée « refus », jamais rejouée (fiche 1789717143519005 sans
republication). Correctif : `republierAvecReprise` (attente du premier plan et du réseau, 3 reprises, jamais de doublon).

## 9. julamisvac5962 — lecture d'origine abandonnée
Cause : le choix « attendre mon ordinateur » ne vit que dans l'écran ; « Fermer » ne garde rien : la lecture se fera au
retour du PC (demande en base), mais rien ne repartira ni ne la préviendra. Poste éteint depuis le 07/11 19:55. Correctif
proposé (non fait : il faut un message à la personne — push — et une migration ; « aucun message aux utilisateurs » dans
ce lot) : noter l'intention en base, et au retour de la lecture une pastille « prête à publier » au Stock.

## 10. Stéphanie Durand — publication non partie (07/11 18:11)
Prouvé : lecture d'origine faite en 2,95 s, parcours ouvert 18:11:39, aucune publication demandée, page rechargée à la
main 18:12:08 puis 18:14:55 ; 5 brouillons de lot jamais envoyés (Beebs non connecté) ont consommé son quota gratuit
(5/5 : le quota compte les générations, pas les publications — décision de Nico). Cause de l'abandon : non prouvable
(le parcours ne journalisait aucune sortie). Correctif : trace « stepper_ferme » (étape, plateformes, durée).

## 11. Republication Leboncoin Cloud de Nico (3304125349) : ALLÉE AU BOUT
Job 32e12d08 (cloud-2), ancienne 3295472477 retirée 07/11 13:32:36, nouvelle 3304125349 publiée 13:38:51, vue au relevé
du 08/11 11:26. Rien à corriger (les deux jours d'attente venaient de règles déjà corrigées le 07/11, f22d662).

## 12. Capgo « 1 OTA sur 10 »
Mesure 30 j : 180 échecs / 1 626 installations, dont 137 événements d'UN appareil (fichiers en delta tombés en 42 s) :
taux réel ≈ 2,6 % des installations. Causes : téléchargements interrompus (app tuée, mémoire basse), faux échecs du
plugin 8.51.2 (corrigé en 8.53.0 selon Capgo), anciens binaires 2.9.10 en delta. notifyAppReady hors de cause.
Correctif : plugin ≥ 8.53.0 au prochain binaire (store : décision de Nico) ; Vercel Insights à ne charger que sur le web
(404 à chaque lancement natif, bruit dans Capgo) — non fait ici (index.html géré par le générateur du site, en cours au
terminal Cloud).

## 13. 59 échecs anciens
Relevé : 81 « failed » sur les comptes vus en 7 j (dont 51 Beebs de XEWER du 20/09 au 27/10). Causes : Beebs dépôt sans
numéro jamais en ligne (40), Beebs refusé par sa modération (25, dont 11 déjà relancés et refusés de nouveau, 2 vendus),
Leboncoin refus de modération probable (14), eBay (2). Aucune n'est le reste d'un bug de chez nous : RIEN à relancer.
50 needs_user de plus de 7 j : tous un geste de la personne.

## Mises en production (08/11, après le commit 264d6ac + 0153a71)
- Fonctions : get-pending-jobs v352 (true), ebay-api-worker v119 (false), ebay-account v35 (true) — 15:55-15:56 ; code
  en service comparé fichier par fichier avant (= 1bcb193) et après (= 0153a71).
- Point 2 : la tâche 8d59f147 de Sébastien avait été ANNULÉE par lui entre-temps (« Arrêté à ta demande — tu as abandonné
  eBay pour cet article ») : la relance n'a rien écrit (garde du script) — son choix est respecté. La règle vaut pour
  toutes les prochaines publications eBay.
- Point 3 : 491 doublons sans fiche (11 comptes) clos par la règle 20261108143000 (sauvegarde + inverse).
- Point 1 (Cloud) : copie Cloud 0.6.181 NON déployée (refus du garde-fou « Production Deploy ») ; cloud-2 reste en
  0.6.178-cloud. Le serveur (get-pending-jobs v352) vaut déjà pour le Cloud (pause par plateforme).
- Point 5 : annonce de test 10719554551 en « Vérification en cours » chez Vinted : retrait refusé (403) pendant la
  vérification, à refaire dès la fin.

## Point 3 — ce qui reste (dit, non fait)
- Les ~115 annonces de l'ancien compte Leboncoin d'ayadi007 restent « en ligne » dans FillSell : la règle du 08/11 midi
  (20261108144000) ne date rien quand le compte a changé (pas de 117 « Vendue ? »). Elles se ferment par les juges
  existants quand les relevés du NOUVEAU compte deviennent probants (il a des annonces depuis 12:12) : republications
  « introuvable à confirmer » closes après deux relevés complets, publications par le juge « annonce publiée disparue »
  (« n'est plus en ligne — FillSell n'a rien retiré »), sans question de vente. Aucun relevé Leboncoin depuis 12:03.
- La racine (savoir QUEL compte Leboncoin est connecté) demande : une colonne du compte relevé (migration), l'extension
  qui l'écrit (cookie `lbc_user_id`, déjà lu pour l'API), et une règle « une annonce d'un autre compte n'est jamais
  comparée au compte relevé ». Préparée en description seulement : migration + extension + soumission CWS = décision de Nico.
