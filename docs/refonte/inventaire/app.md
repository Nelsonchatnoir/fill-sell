# Inventaire — états de job, attentes/progressions, estimations de temps (src/, web + Capacitor)

Catégories : **ÉJ** = état-job · **AL** = attente-loader · **TE** = temps-estimé / heure / durée. Elles se cumulent. Les textes sont cités en FR (miroir EN présent). ‹…› = partie dynamique.

## 1. File des jobs (feuille « Ta file »)
| fichier:ligne | écran/composant | texte exact (ou règle) | cat. | statut source |
|---|---|---|---|---|
| utils/fileDesJobs.js:108 | FileDesJobs ligne « À venir » + phrasePause des barres | « En attente de son tour » | ÉJ | pending (motif tour) |
| utils/fileDesJobs.js:109 | idem | « Part de nos serveurs à son tour » | ÉJ | pending voie=api |
| utils/fileDesJobs.js:110 | idem | « En attente de ton ordinateur — Chrome fermé ou extension pas vue » | ÉJ | pending + extension eteinte/inactive |
| utils/fileDesJobs.js:111 | idem | « En attente de ton ordinateur — l'extension doit se reconnecter à ton compte » | ÉJ | pending + session_expiree |
| utils/fileDesJobs.js:112 | groupe « En pause » | « En attente, ton annonce est intacte » | ÉJ | pending + retenue_serveur |
| utils/fileDesJobs.js:113-116 | idem | « En pause » / « En pause (limite du jour) » / « (rythme de republication) » / « (créneau de republication) » | ÉJ | gel_livres / plafond.retenue / creneau hors |
| utils/fileDesJobs.js:118 | idem | « Republication automatique en pause : elle repartira quand tu la relanceras. Ton annonce est intacte » | ÉJ | republish auto + créneau actif=false |
| utils/fileDesJobs.js:119-120 | idem | « Nouvel essai automatique, rien à faire » (heure calculée, non affichée) | ÉJ | pending + next_action_after futur / error |
| utils/fileDesJobs.js:121 | idem | « ‹P› est en pause de notre côté — reprise automatique » | ÉJ | platform_health.paused |
| utils/fileDesJobs.js:122-124 | idem | « En attente de ta boutique @‹login› : ouvre-la sur vinted.fr dans Chrome, ça repartira tout seul » (variante « ton autre boutique Vinted ») | ÉJ | needs_user:boutique_etrangere / attente_boutique |
| utils/fileDesJobs.js:126-128 | idem | « En attente : ouvre ‹@a puis @b› sur vinted.fr dans Chrome — FillSell y cherchera l'annonce, ça repartira tout seul » | ÉJ | retenue boutique_origine_inconnue |
| utils/fileDesJobs.js:129 | groupe « Un geste à faire » | « Un geste à faire » | ÉJ | needs_user |
| utils/fileDesJobs.js:130 | idem | « Un geste à faire : connecte-toi à ‹P› sur ton ordinateur » | ÉJ | pending attente_session |
| utils/fileDesJobs.js:131 | idem | « Un geste à faire : autorise Opla dans l'extension — l'annonce partira toute seule ensuite » | ÉJ | pending opla a_autoriser |
| utils/fileDesJobs.js:132 | groupe « En cours » | « Hors ligne quelques minutes : remise en ligne en cours » | ÉJ+TE | republish deleted < 30 min |
| utils/fileDesJobs.js:133 | idem | « Hors ligne depuis ‹10:12 / hier 22:40 / le 29 sept.› : remise en ligne dès que possible » | ÉJ+TE | republish deleted > 30 min |
| utils/fileDesJobs.js:135 | idem | « En pause, rien n'a été retiré : FillSell attend le prochain relevé de ‹P› pour savoir si l'annonce est toujours en ligne » | ÉJ | needs_user:introuvable_a_confirmer |
| utils/fileDesJobs.js:136 | idem | « En pause avant tout retrait, ton annonce est intacte : elle repart toute seule dès que ‹P› répond à nouveau » | ÉJ | needs_user republish technique |
| utils/fileDesJobs.js:137 | idem | « Ton compte eBay est inscrit sur un autre site qu'ebay.fr : FillSell n'y publie pas, rien n'a été envoyé » | ÉJ | needs_user:ebay_site_etranger |
| utils/fileDesJobs.js:138 | idem | « Tu as indiqué ne pas vendre sur ‹P› : rien n'est envoyé » | ÉJ | needs_user:plateforme_ecartee |
| utils/fileDesJobs.js:139-140 | idem | « En cours sur ton ordinateur » / « En cours sur nos serveurs » | ÉJ | processing |
| utils/fileDesJobs.js:319 → extensionAJour.js:31-32 | file, barres, EcranSuivi:179 | « En attente de la mise à jour de l'extension : ferme Chrome complètement puis rouvre-le » | ÉJ | pending + extension < MIN_BUILD |
| utils/fileDesJobs.js:69-79 (heureConnue) | situation.heure : n'est plus rendue (sert au tri) | « 17:26 » / « demain 08:00 » / « le 3 oct. à 08:00 » | TE | next_action_after / plafond / créneau |
| utils/fileDesJobs.js:405-412 | sous-titre de « Ta file » | « ‹n› en cours ou à venir · ‹n› en pause · ‹n› geste(s) à faire » / « Rien en cours ni à venir » | ÉJ | compteurs |
| utils/fileDesJobs.js:416-425 | ligne de file + sous-titre des grandes barres | « Publication sur ‹P› » · « Republication sur ‹P› » · « Retrait de ‹P› » (+ « · @login ») | ÉJ | action |
| components/FileDesJobs.jsx:212-213 | feuille | titre « Ta file » ; sous-titre « Lecture de la file… » | AL | — |
| components/FileDesJobs.jsx:203-206,226 | idem | « En cours », « À venir · n », « En pause · n », « Un geste à faire · n » | ÉJ | groupes |
| components/FileDesJobs.jsx:219-221 | idem | « Rien en cours ni à venir. Ce qui est publié, republié ou retiré n'apparaît plus ici. » | ÉJ | aucun job vivant |
| components/FileDesJobs.jsx:229-234 | section En cours | grande BarreProgression par job | AL | processing / deleted |
| components/FileDesJobs.jsx:120-124,132,154 | lignes | raison + icône (Clock, ShieldCheck, Pause, Monitor, Hand) ; ambre si geste, gris sinon | ÉJ | motif |
| components/ChoixBoutiqueFile.jsx:46-47,68 | ligne publication Vinted multi-boutiques | « Part sur @‹login› · ‹source› » / « Part sur la boutique ouverte dans ton navigateur au moment de l'envoi » / « Changer… » | ÉJ | pending publish vinted |
| tabs/StockTab.jsx:11792-11795 | gestes de la file | « Répondre » / « Compléter » / « Régler » | ÉJ | needs_user / error |
| tabs/StockTab.jsx:11805-11811 | pied de la file | « Arrêter les ‹n› republications en attente » + « Tes annonces restent en ligne, rien n'est supprimé. » | ÉJ | republishAnnulable |

## 2. Barres de progression
| fichier:ligne | écran/composant | texte exact (ou règle) | cat. | statut source |
|---|---|---|---|---|
| utils/barresJobs.js:43,47 | toutes les barres (carte Stock, file, retrait, feuille républication, suivi) | « Dans la file — ton ordinateur la prend à son tour… » / court « En file… » | ÉJ+AL | pending publish extension |
| utils/barresJobs.js:44 | idem | « Dans la file de nos serveurs… » | ÉJ+AL | pending api |
| utils/barresJobs.js:45 | idem | « Dans la file — ton ordinateur la retire à son tour… » | ÉJ+AL | pending delete |
| utils/barresJobs.js:46 | idem | « Dans la file — rien n'a encore été touché… » | ÉJ+AL | pending republish |
| utils/barresJobs.js:48 | sous-texte d'attente longue | « D'autres annonces passent avant elle : elle partira à son tour. » | AL | pending au-delà de 2,5× la durée |
| utils/barresJobs.js:49,51 | étape action | « Dépôt en cours sur ‹P›, dans ton Chrome… » / « Dépôt en cours… » | ÉJ+AL | processing publish |
| utils/barresJobs.js:50 | idem | « Publication sur ‹P› depuis nos serveurs… » | ÉJ+AL | api |
| utils/barresJobs.js:52-54 | idem | « Retrait de l'annonce sur ‹P›… » / « …depuis nos serveurs… » / « Retrait en cours… » | ÉJ+AL | processing delete |
| utils/barresJobs.js:55-56 | idem | « Copie complète de ton annonce : photos, texte, prix… » / « Copie en cours… » | ÉJ+AL | republish a_capturer |
| utils/barresJobs.js:57-58 | idem | « Copie faite, rien n'a été retiré — en attente de son tour… » / « Copie faite… » | ÉJ | republish captured pending |
| utils/barresJobs.js:59-60 | idem | « Retrait de l'ancienne annonce — sa copie est en sécurité… » / « Retrait en cours… » | ÉJ+AL | processing captured |
| utils/barresJobs.js:61-62 | idem | « Remise en ligne de ton annonce sur ‹P›… » / « Remise en ligne… » | ÉJ+AL | step deleted |
| utils/barresJobs.js:63-65 | fin | « En ligne sur ‹P›. » · « De retour en tête sur ‹P›. » · « Retirée de ‹P›. » | ÉJ | published / recreated / deleted |
| utils/barresJobs.js:66 | arrêt | « Un geste à faire. » | ÉJ | needs_user |
| utils/barresJobs.js:67 | idem | « Elle n'est pas partie : à relancer. » | ÉJ | failed |
| utils/barresJobs.js:68 | idem | « Annulée. » | ÉJ | cancelled |
| utils/barresJobs.js:69 | idem | « Ton annonce n'est plus en ligne sur ‹P› : republie-la depuis ta fiche. » | ÉJ | republish deleted arrêtée |
| utils/barresJobs.js:186-192,211-212 | idem | phraseEchec = humanizeJobError + sansEstimation ; phrasePause = raison de situationJob | ÉJ | needs_user/failed/pending |
| utils/barresJobs.js:30-39,113-145 | interne (fait avancer barre et %) | dépôt Vinted 62 s, LBC 67, Beebs 68, eBay 238 (serveurs 78), Opla 10, Depop 20 ; file 90 ; republication 35/120/51/17 (Vinted) ou 330 s | TE (implicite) | — |
| components/BarreProgression.jsx:90,372-380 | badge de toute barre | « Terminé » · « Arrêtée » · « Annulée » · « En pause » · « En file » | ÉJ | termine/echec/neutre/pause/attente |
| components/BarreProgression.jsx:91,374 | barre multi | « ‹a› sur ‹n› » | ÉJ | partiel |
| components/BarreProgression.jsx:92,368 | sous-texte avec horloge | « Ça prend plus de temps que d'habitude. On continue, rien à faire de ton côté. » | AL+TE | en_cours > max(2,5×durée, durée+10 s) |
| components/BarreProgression.jsx:93,489 | ligne de piste | « En attente de son tour » | ÉJ | attente |
| components/BarreProgression.jsx:273,380 | pourcentage | « ‹n› % » (max 99 % avant la fin) | AL | — |
| components/BarreProgression.jsx:500-510 | lignes multi | coche / AlertCircle / Pause / anneau SVG | AL | état de piste |
| components/BarreProgression.css:95-131 | couleurs | termine teal ; echec ambre (action) / rouge (erreur) / gris (neutre) ; pause et attente gris ; reflet animé seulement en cours | ÉJ | data-etat/data-ton |
| components/BarreJobCarte.jsx:21-23,33 | barre compacte de la carte Stock | « ‹Pf› · À autoriser » / « · À connecter » / « · À compléter » / « · Annulée » | ÉJ | opla / connexion / needs_user / cancelled |
| components/BarreJobCarte.jsx:25,30 | idem | « ‹Pf› · ‹court› » (ex. « Vinted · En file… ») | ÉJ+AL | en cours |
| components/BarreJobCarte.jsx:26-28,31 | idem (affichée 5 s) | « ‹Pf› · En ligne » / « · De retour en ligne » / « · Retirée » | ÉJ | termine |
| components/BarreJobCarte.jsx:32 | idem | « ‹Pf› · En attente » (pour toute pause) | ÉJ | pause |

## 3. Carte du Stock : pastille, menu « … », bandeau d'activité, « À régler »
| fichier:ligne | écran/composant | texte exact (ou règle) | cat. | statut source |
|---|---|---|---|---|
| stock/regles.js:232 | pastille (photo, ligne Liste, menu) | « Remontée » ou court de l'étape de republication | ÉJ | republish |
| stock/regles.js:234 | idem | « Ouvre Chrome » (rouge) | ÉJ | republish orpheline |
| stock/regles.js:236 | idem (titre translations:276) | « En pause » (titre « En pause — reprise auto ») | ÉJ | pending sur plateforme en pause |
| stock/regles.js:238 | idem | « Mise à jour » | ÉJ | extension outdated |
| stock/regles.js:240 | idem | « En attente » / « En attente · ‹n› j » | ÉJ+TE | pending + extension pas fraîche |
| stock/regles.js:242 | idem | « En cours… » (point pulsé) | ÉJ+AL | pending/processing |
| stock/regles.js:244 | idem | « Échec · ‹LBC|n› » | ÉJ | failed |
| stock/regles.js:246 | idem | « À régler · ‹pf|n› » | ÉJ | needs_user / action requise / connexion |
| stock/regles.js:248 | idem | « Vérification · ‹pf|n› » | ÉJ | needs_user en_cours |
| stock/regles.js:250 | idem | « En file · Opla » | ÉJ | opla_acces dépassé |
| stock/regles.js:252-256 | idem | « Hors ligne · ‹date› » / « Masquée · … » / « Brouillon · … » | ÉJ | disparu_le / vinted_status |
| stock/regles.js:258-263 | idem | « En ligne (· ‹n› j) » / « Vendu · date » / « Pas en ligne » | ÉJ | published |
| stock/Carte.jsx:56-69 + stock/css.js:33,37 | rendu de la pastille | point de couleur + sk-pouls 1,4 s si pulse | AL | — |
| stock/jetons.js:62-68 | couleurs (TONS) | ok teal / regler ambre / echec rouge / neutre / hors | ÉJ | ton |
| tabs/StockTab.jsx:9202 | titre de la pastille orpheline | « Ton ordinateur ne répond plus — ouvre Chrome pour terminer la recréation… » | ÉJ | republish orpheline |
| tabs/StockTab.jsx:9204-9205 | pastille republication | court de l'étape, pulsé pendant lecture/retrait/deleted ; « Voir où en est la remontée » | ÉJ+AL | republish |
| tabs/StockTab.jsx:9210 | titre « À régler » | « Connexion ‹P› à reprendre sur ton ordinateur » | ÉJ | pending sur connexion |
| tabs/StockTab.jsx:9222-9224 | titre « En attente » | « En attente depuis ‹n› jour(s). Ouvre Chrome… » / « En attente de ton ordinateur — démarrage à la prochaine ouverture de Chrome. » | ÉJ+TE | pending, extension pas fraîche |
| tabs/StockTab.jsx:9228 | titre « En cours… » | « Voir le statut » | ÉJ | pending/processing |
| tabs/StockTab.jsx:9236 | titre Échec | « Voir le détail par plateforme » / erreur humanisée | ÉJ | failed |
| tabs/StockTab.jsx:9246 | titre À régler | « Une information est demandée » / erreur | ÉJ | needs_user |
| tabs/StockTab.jsx:9256 | titre Vérification | « Opla est autorisée : cette annonce repart toute seule. » / texteEnCoursConfirmation | ÉJ | needs_user en_cours |
| tabs/StockTab.jsx:9261-9268 | titres | « L'annonce Vinted n'a pas été retrouvée… » · « Statut relevé sur Vinted… » · « En ligne depuis ‹n› j » | ÉJ+TE | disparu / masquée / en ligne |
| tabs/StockTab.jsx:9174-9180 | tonEtapeRepub | ton déduit du code couleur de l'étape | ÉJ | republish |
| tabs/StockTab.jsx:9415 | bouton « Publier partout » | « Récupération… » | AL | — |
| tabs/StockTab.jsx:9429-9432 | menu > « Ce qui se passe » | « Déposée — vérification Beebs en cours » / « Publiée — à vérifier sur ‹P› » | ÉJ | published + warnings |
| tabs/StockTab.jsx:9434-9440 | idem | « Déposée — vérification Leboncoin en cours, ne pas republier » / « Publiée — récupération du lien en cours sur ‹P› » | ÉJ+AL | published sans lien (48 h) |
| tabs/StockTab.jsx:9446-9447 | idem | « Annonce introuvable sur ‹P› — rien décompté » | ÉJ | refund_unconfirmed |
| tabs/StockTab.jsx:9451,9459 | idem | « Masquée sur Vinted — vu le ‹d› » / « Plus en ligne sur Vinted · ‹d› … » | ÉJ | vinted_status / disparu |
| tabs/StockTab.jsx:9462 | idem | « En ligne depuis aujourd'hui / ‹n› j » | ÉJ+TE | published |
| tabs/StockTab.jsx:9465 | idem | « Beebs vérifie ton annonce… » / « Leboncoin vérifie ton annonce : ne la republie pas… » | ÉJ | published sans lien |
| tabs/StockTab.jsx:9469 → stockFiltres.js:475-525 | idem | « ‹n› à traiter » · « À compléter · ‹P› » · « ‹n› à compléter » · « 1 échec · ‹P› » · « ‹n› échecs » | ÉJ | needs_user / failed |
| tabs/StockTab.jsx:9472 | idem | « En attente de la boutique @‹x› » | ÉJ | autre boutique |
| tabs/StockTab.jsx:9488 | menu | « Compléter la remontée » / « Remettre en ligne maintenant » / « Relancer la remontée » | ÉJ | republish needs_user |
| tabs/StockTab.jsx:9495 | menu (désactivé) | « Remonter · dans ~‹n› h » + « Une remontée par article et par 24 h. » | TE | recréée < 24 h |
| tabs/StockTab.jsx:9497,9504,9521 | menu | « Où en est la remontée » · « Voir le statut des publications » · « Voir la file de l'ordinateur » | ÉJ | — |
| tabs/StockTab.jsx:9513-9523 | bas de carte | BarreJobCarte (republication/publication/retrait en travail) | AL | processing/pending |
| tabs/StockTab.jsx:9346,9353,9368 | carte d'un article vendu | « Encore en ligne sur ‹P› — reconnecte-toi pour le retirer (risque de double vente) »… | ÉJ | delete bloqué |
| tabs/StockTab.jsx:9625-9690 | bandeau d'activité en tête du Stock | photo + titre, « ‹P› · republication|dépôt », « ‹faites› sur ‹total› », barre (en pause si l'ordinateur est muet > 10 min) | ÉJ+AL | fournée |
| tabs/StockTab.jsx:9636-9637,9677 | idem | estimation retirée (`estimation = null`) | TE (supprimé) | — |
| tabs/StockTab.jsx:9642,9685 | idem | pas de la barre = somme des durées d'un job, ou 120 s | TE (implicite) | — |
| tabs/StockTab.jsx:7063 | ligne de l'actif | « Ton ordinateur dépose l'annonce » / titre de l'étape | ÉJ | processing |
| tabs/StockTab.jsx:9699-9700 | sous le bandeau | « ‹n› republication(s) arrêtée(s). Tes annonces sont restées en ligne. ‹n› déjà commencée(s) vont finir. » | ÉJ | arrêt utilisateur |
| tabs/StockTab.jsx:9708 | idem | « ‹n› test(s) à blanc terminé(s) » | ÉJ | dry_run_completed |
| tabs/StockTab.jsx:9726-9728 | idem (rouge) | « Ton ordinateur ne répond plus — ouvre Chrome pour terminer la recréation… » | ÉJ | orpheline |
| tabs/StockTab.jsx:10300-10303 | encart ambre | lignesAttenteBoutique + « Rien n'est perdu, rien n'a échoué — ils attendent, c'est tout. » | ÉJ | autre boutique |
| tabs/StockTab.jsx:10308-10316 | encart ambre | « Connecte-toi à ‹P› sur ton ordinateur. ‹n› opération(s) l'attend(ent) et repartira/ont toute(s) seule(s). » | ÉJ | attente_connexion |
| stock/Haut.jsx:98-99 | feuille Boutique | « Tu regardes une autre boutique : ses republications et ses retraits attendront… » | ÉJ | — |
| stock/Haut.jsx:101-104 | idem | lignesAttenteBoutique + phraseRassurance | ÉJ | — |
| stock/Haut.jsx:252-254 | ligne Republication automatique | « Active sur ‹…› » / « Chaque jour, sans y penser » | ÉJ | réglage |
| stock/Haut.jsx:127 | tuile À régler | « ventes à confirmer, infos manquantes, brouillons » | ÉJ | — |
| tabs/StockTab.jsx:8758-8762 | tuile À régler | « annonces à retirer » ; aria « …dont ‹n› annonce(s) encore en ligne à retirer » | ÉJ | delete bloqués |
| stock/EcranARegler.jsx:34-54 | écran À régler | « ‹n› chose(s) à régler » / « Rien à régler » / « …des annonces qui attendent ton geste… » | ÉJ | — |
| tabs/StockTab.jsx:8706-8709 | ligne identité LBC | « ‹n› annonce(s) Leboncoin en attente : complète ton compte une fois, elles partent toutes seules. » | ÉJ | needs_user identité |
| tabs/StockTab.jsx:8711-8712 | ligne attente | « Annonce(s) qui attend(ent) ton geste » + « ‹n› pas partie(s) · ‹n› à compléter » | ÉJ | failed / needs_user |
| tabs/StockTab.jsx:8685-8688 + retraitsBloques.js:331-395 | ligne retraits | « Annonce(s) encore en ligne à retirer » + geste | ÉJ | delete bloqué |
| stock/EcranIdentiteLbc.jsx:75-80 | écran identité LBC | « Un instant… » / « Essai en cours » / « C'est fait » ; « On essaie une annonce sur ton ordinateur… » | AL+ÉJ | — |
| components/FeuilleActivite.jsx:164-171 | « Ce qui attend une action de ta part » | sous-titre « ‹n› n'a pas été publiée · ‹n› à compléter » | ÉJ | failed / needs_user |
| components/FeuilleActivite.jsx:192-194 | idem | étiquette « Pas partie » (rouge) / « À compléter » (ambre) | ÉJ | idem |
| tabs/StockTab.jsx:7113-7116 | idem | « Il manque une information » / « Elle n'est pas partie » | ÉJ | idem |
| tabs/StockTab.jsx:8496,8538,8543,8626,11339-11345 | filtres et puces | « À compléter » · « En échec » · « Hors ligne » · « À régler » | ÉJ | — |

## 4. Modales du Stock (statut, retrait, échec, compléter)
| fichier:ligne | écran/composant | texte exact (ou règle) | cat. | statut source |
|---|---|---|---|---|
| tabs/StockTab.jsx:2208,2111-2119 | JobStatusModal « Où en est la publication » | « ‹n› plateforme(s) attend(ent) une information de ta part » / « ‹n› est arrêtée » / « ‹n› est reprise après un échec » | ÉJ | needs_user / failed / pending+error |
| tabs/StockTab.jsx:2123-2125 | bandeau gris | « En cours de confirmation » + « …Rien à faire de ton côté. » | ÉJ | needs_user en_cours |
| tabs/StockTab.jsx:2132-2145 | bandeau orange | « En attente de toi » / « Publication arrêtée » / « Reprise après échec » + « Rien ne part au prochain passage : … » (+ « Les relances automatiques sont épuisées… ») | ÉJ | idem |
| tabs/StockTab.jsx:2155-2157 | bandeau vert | « En file d'attente » + « …Prochain passage dans 2 min au plus. » | ÉJ+TE | pending api |
| tabs/StockTab.jsx:2161-2166 | couleurs | gris / vert / orange / rouge | ÉJ | diag |
| tabs/StockTab.jsx:2169-2172 | libellé par plateforme | « En attente » · « Publication… » · « À compléter » · « Échec » | ÉJ+AL | pending / processing / needs_user / failed |
| tabs/StockTab.jsx:2179-2180 | idem | « En cours de confirmation » · « Action requise » | ÉJ | needs_user |
| tabs/StockTab.jsx:2233-2234,2698-2710 | idem | « Depuis ‹moins d'une minute / 12 min / 3 h / 2 j› » + « · plateforme en pause (reprise auto) » | ÉJ+TE | created_at |
| tabs/StockTab.jsx:2255 | idem | « Opla est autorisée : cette annonce repart toute seule. » | ÉJ | opla dépassé |
| tabs/StockTab.jsx:2314-2317 | bouton | « Relances épuisées pour ce job » / « Relancer dans ‹n› min » / « Relancer maintenant » | ÉJ+TE | délai de 10 min |
| tabs/StockTab.jsx:2650-2693 | bandeau (diagnostiquerExtension) | « Extension jamais vue » / « Extension inactive » + « Aucun signe de vie depuis ‹X›… » / « Extension à mettre à jour » / « En file d'attente » + « …au prochain passage (toutes les 2 min). » / « Extension silencieuse » + « …Laisse-lui un instant, ou ouvre Chrome. » | ÉJ+TE | heartbeat 5 / 15 min |
| tabs/StockTab.jsx:2427-2430 | RemovePlatformsModal | « En vérification chez Vinted — masquée aux acheteurs » / « Masquée/Brouillon sur Vinted » / « En ligne » | ÉJ | published |
| tabs/StockTab.jsx:2439-2445 | idem | « Retrait en cours… » ou barre compacte | ÉJ+AL | delete pending/processing |
| tabs/StockTab.jsx:2447 | idem | « Retirée » | ÉJ | deleted |
| tabs/StockTab.jsx:2465-2470 | idem (sablier) | « En vérification Beebs — pas encore en ligne » / « ‹P› vérifie ton annonce — pas encore en ligne » / « Mise en ligne jamais confirmée par ‹P› » | ÉJ+AL | sans lien |
| tabs/StockTab.jsx:2473 | idem | « Pas publiée ici » | ÉJ | — |
| tabs/StockTab.jsx:2478-2479 | idem | « Il manque ‹champ› » / « Une information est attendue » | ÉJ | needs_user |
| tabs/StockTab.jsx:2484 | idem | « Publication en cours de confirmation » | ÉJ | needs_user en_cours |
| tabs/StockTab.jsx:2488 | idem | « Elle n'est pas partie — à relancer » | ÉJ | failed |
| tabs/StockTab.jsx:2498-2516 | idem | « …Puis relance. » · « On relit ‹P› à chaque passage… » · « Relance indisponible pour l'instant… » | ÉJ | — |
| tabs/StockTab.jsx:2604 | idem | « Retrait… » | AL | — |
| tabs/StockTab.jsx:11889-11891 | modale d'échec | « ‹P› — publiée — à vérifier » / « ‹P› — non publiée » | ÉJ | published+warnings / failed |
| tabs/StockTab.jsx:11919-11923 | idem | « 3 relances manuelles déjà utilisées… » | ÉJ | — |
| tabs/StockTab.jsx:11932-11936 | idem | « Relance… » / « Relancé il y a peu — patiente ~‹n› min » / « Relancer maintenant » | AL+TE | délai |
| tabs/StockTab.jsx:11939-11945 | idem | « Une fois la cause ci-dessus réglée. Le job repart tel quel… » | ÉJ | — |
| tabs/StockTab.jsx:11977 | abandon | « … » | AL | — |
| tabs/StockTab.jsx:11834-11866 | modale d'arrêt | « Arrêter les ‹n› republications en attente ? » / « …déjà en cours et ira au bout… » / « Arrêt… » / « Laisser continuer » | ÉJ+AL | annulables / en vol |
| tabs/StockTab.jsx:1708 | NeedsUserModal | « À compléter — ‹P› » | ÉJ | needs_user |
| tabs/StockTab.jsx:1719,1760,1785-1786,1882-1885 | idem | « …l'annonce repartira toute seule. » / « …la publication repartira automatiquement… » / « …tout repart en un seul geste. » | ÉJ | needs_user |
| tabs/StockTab.jsx:1793 | idem | « Valeurs indisponibles… le prochain passage lit la liste… » | ÉJ+TE | needs_user |
| tabs/StockTab.jsx:1984-1987 | idem | « Enregistrement… » / « Relancer la publication » / « Valider et relancer » | AL | — |

## 5. Republication (pastille, feuilles, plafond)
| fichier:ligne | écran/composant | texte exact (ou règle) | cat. | statut source |
|---|---|---|---|---|
| tabs/StockTab.jsx:4913-4920 | court de la pastille | « En file » · « Relevé… » · « Relevée » · « Retrait… » · « Recréation… » · « En ligne » · « À relancer » · « Arrêtée » | ÉJ+AL | republish_step × statut |
| tabs/StockTab.jsx:4946-4947 | idem | « Attend @x » / « En attente de la boutique @x » | ÉJ | autre boutique |
| tabs/StockTab.jsx:4955-4959 | idem | « Connecte-toi » ; « …ta republication repart toute seule dès que tu es connecté. » | ÉJ | attente_connexion |
| tabs/StockTab.jsx:4967-4971 | idem | « Attend @‹l› » ; « En attente de connexion au dressing @‹l› » | ÉJ | attente_boutique |
| tabs/StockTab.jsx:4977-4983 | idem | « En pause » ; « En pause — on s'en occupe » ; « …on la relancera nous-mêmes. » | ÉJ | gel_livres |
| tabs/StockTab.jsx:4989-4991 | idem | « En ligne » ; « Annonce en ligne » | ÉJ | recreated |
| tabs/StockTab.jsx:4998-5000 | idem | « Test à blanc » ; « Test à blanc terminé » | ÉJ | dry_run |
| tabs/StockTab.jsx:5014-5017 | idem | « Plus en ligne » ; « Annonce plus en ligne sur Vinted » | ÉJ | 404 capture |
| tabs/StockTab.jsx:5025-5035 | idem | « Hors ligne — arrêtée » / « Arrêtée » ; « Interrompue après la suppression / avant tout retrait » | ÉJ | failed/cancelled |
| tabs/StockTab.jsx:5045-5049 | idem | « Attend @‹l› » ; « En attente de ta boutique @‹l› » | ÉJ | boutique_etrangere |
| tabs/StockTab.jsx:5072-5076 | idem | « À relancer » ; « À renseigner sur Vinted » | ÉJ | needs_user |
| tabs/StockTab.jsx:5081-5088 | idem | « Hors ligne — republier » ; « Annonce retirée, pas encore recréée » / « En attente de toi » | ÉJ | needs_user |
| tabs/StockTab.jsx:5100-5103 + retenueServeur.js:108-144 | idem | « En attente » ; « En attente de ta boutique — rien n'est touché à l'aveugle » / « En attente de la mise à jour de l'extension — ton annonce est intacte » / « En attente — ton annonce est intacte » ; « Elle repartira toute seule… » | ÉJ | retenue_serveur |
| tabs/StockTab.jsx:5122-5133 | idem | « Demain ‹8h30› » / « Dès ‹14h30› » ; « Republications en pause — reprise ‹à 14h30› » / « Republication étalée — reprend ‹…› » | ÉJ+TE | plafond serveur |
| tabs/StockTab.jsx:5136-5140 | idem | « Recréation… » ; « Ancienne annonce retirée, recréation en cours » | ÉJ+AL | deleted |
| tabs/StockTab.jsx:5146-5150 | idem | « Retrait… » ; « Retrait de l'ancienne annonce » | ÉJ+AL | processing captured |
| tabs/StockTab.jsx:5152-5156 | idem | « Relevée » ; « Relevée, en attente de republication » | ÉJ | pending captured |
| tabs/StockTab.jsx:5160-5164 | idem | « Relevé… » ; « Lecture de ton annonce » | ÉJ+AL | processing a_capturer |
| tabs/StockTab.jsx:5166-5170 | idem | « En file » ; « En attente de ton Chrome » | ÉJ | pending a_capturer |
| tabs/StockTab.jsx:5200-5218 | formateur repriseRepub | « En pause » + « un peu plus tard » ; « Demain ‹h› » / « Dès ‹h› » ; « demain à ‹h› » / « à ‹h› » | TE | plafond.reprise |
| tabs/StockTab.jsx:5283-5286,5316 | RepublishProgressSheet : frise | « Lecture de l'annonce en ligne » · « Contenu sauvegardé chez nous » · « Ancienne annonce retirée » · « Nouvelle annonce en ligne » (coche / sablier) | ÉJ+AL | republish_step |
| tabs/StockTab.jsx:5297-5305 | idem | grande barre de progression | AL | — |
| tabs/StockTab.jsx:5323-5326 | idem | « …FillSell espace volontairement ses gestes… ce n'est pas un blocage. » | ÉJ | deleted |
| tabs/StockTab.jsx:5329-5331 | idem | « Dernière avancée à ‹HH:MM› (heure de Paris). » | TE | horodatages |
| tabs/StockTab.jsx:5334-5339 | idem | erreur brute (jobErrorSansFaussePromesse) | ÉJ | error |
| tabs/StockTab.jsx:5384,5390 | idem | « Relance impossible — réessaie dans un instant. » / « Relance… » | AL | — |
| tabs/StockTab.jsx:5501 | RepublishSheet | « …Hors ligne quelques minutes. » | TE | — |
| tabs/StockTab.jsx:5617-5620 | idem | « ‹n› partent maintenant sur Vinted. » + attente boutique | ÉJ | — |
| tabs/StockTab.jsx:5647-5649 + plafondRepublication.js:63-82 | idem | « Ta limite du jour est de ‹n› : ‹a› partent aujourd'hui, les ‹b› autres partiront demain / les jours suivants… » | ÉJ+TE | plafond |
| tabs/StockTab.jsx:4414-4436,4698-4700 | RepublishAutoBlock | « …en pause… Elle repartira toute seule… » · « …mise de côté pour 24 h… » · « …reprendra demain. » | ÉJ+TE | derniere_erreur |
| tabs/StockTab.jsx:4706-4713 | idem | « ON — ‹n› republiée(s) ce mois… au rythme d'au plus ‹n›/jour… » (« … » pendant le chargement) | ÉJ+AL | — |
| tabs/StockTab.jsx:10981-10984 | barre du mode Remonter | « Mise en file ‹f›/‹t›… (garde cet onglet ouvert) » | AL | — |
| tabs/StockTab.jsx:10990-10992 | idem | « ‹n› sélectionné(s) · ~‹n×5› min / ~‹h› h » | TE | — |
| tabs/StockTab.jsx:11007-11010 | idem | « ‹ok›/‹t› en file — ça tourne tout seul… Reprise automatique si tu le fermes. » | ÉJ | — |
| tabs/StockTab.jsx:11203-11231 | ligne plafond | « …les ‹n› suivantes reprennent ‹à 14h30 / demain à 0h00›… » | ÉJ+TE | plafond_republish |
| tabs/StockTab.jsx:11524 | « Remonter mes annonces » | « Remontée en maintenance : de retour très vite. » / « Ton ordinateur les republie une à une. » | ÉJ+TE | maintenance |
| tabs/StockTab.jsx:8806-8809 | alerte | « Remontée en maintenance » | ÉJ | — |
| tabs/StockTab.jsx:6115-6116 | écrit dans job.error | « Arrêtée à ta demande — ton annonce est restée en ligne. » | ÉJ | cancelled |

## 6. Republication automatique par créneaux (components/RepublicationPlanifiee.jsx)
| fichier:ligne | écran/composant | texte exact (ou règle) | cat. | statut source |
|---|---|---|---|---|
| :367-370 | ligne d'état | « Réglages illisibles pour l'instant — on réessaie » / « Lecture de tes réglages… » | AL | état inconnu |
| :372-375 | idem | « Aperçu · activation incluse dans le plan Pro » · « Mode classique en cours » · « Réglage à corriger » · « Inactive » | ÉJ | réglage |
| :377-391 | idem | « Active · pas encore en service » · « Active · arrêtée pour aujourd'hui » · « Active · extension muette depuis 7 jours » · « Active · compteur du mois plein » · « Active · dernier créneau manqué » · « Active · en attente d'une republication en vol »… | ÉJ | état serveur |
| :393-394 | idem | « Active · en cours jusqu'à ‹10h› · ‹n› remontée(s) » | ÉJ+TE | dans le créneau |
| :396 | idem | « Active · ‹8h–10h› · ‹tous les jours› » | TE | créneau |
| :403-405 | avis | « Pas encore en service » | ÉJ | — |
| :415-418 | avis | « ‹P› a refusé deux retraits de suite… » + « …repart d'elle-même demain… » | ÉJ+TE | disjoncteur |
| :421-427 | avis | « Il manque l'extension Chrome » / « Ton extension ne s'est pas manifestée depuis plus d'une semaine » | ÉJ | — |
| :430-431 | avis | « …le compteur est plein. » | ÉJ | quota |
| :437-449 | avis | « Le créneau attend : … » + « …Le créneau reprend tout seul derrière. » | ÉJ | blocage |
| :451-463 | avis | « ‹Hier›, ‹8h–10h› : rien n'est parti… » + « Prochaine tentative ‹demain à 8h›, dès que Chrome est ouvert. » | ÉJ+TE | créneau manqué |
| :465-467 | avis | « ‹n› republications restantes ce mois. » | TE | quota |
| :469-472 | avis | « Le créneau en permet ‹n› sur ‹N› éligibles… » | ÉJ | — |
| :213-227 | historique (sautées) | « …déjà en cours… » · « Un essai a échoué il y a moins de 24 h : mise de côté un jour. » · « Republiée il y a moins de 24 h. »… | ÉJ+TE | sautes |
| :228-255 | historique (notes) | « Plafond du jour atteint. » · « Créneau bloqué : … » · « …(elles repartiront seules à la connexion) »… | ÉJ | notes |
| :292-323 | plateforme | « Ne ferait pas remonter » · « Pas encore disponible » · « Aucune annonce à remonter » · « Non connectée dans Chrome » | ÉJ | manque |
| :676-679 | ligne plateforme | « illisible » / « lecture… » / « ‹8h–10h› · ‹10›/j » / « En pause » / « Non réglée » | ÉJ+AL+TE | — |
| :682-693 | idem | « Arrêtée pour aujourd'hui » · « En cours jusqu'à ‹10h› » · « Prochain créneau » · « ‹n› annonces remonteront » | ÉJ+TE | — |
| :773-786 | écran Plateformes | « …· ‹n› en cours » / « …· ‹n› au prochain créneau » / « Lecture de tes réglages… » | ÉJ+AL | — |
| :485,801,1003,1402 | idem | anneau qui tourne (rpRing), point pulsé (rpPulse) | AL | actif |
| :818-820 | cellule | « En cours » / « Prochain créneau » ; « pas encore connu » | ÉJ+TE | — |
| :835-836 | idem | « …il en reste ‹n› aujourd'hui… » | ÉJ | — |
| :908-910 | cellule Créneau du bloc Stock | « proposé » · « en cours · jusqu'à ‹10h› » · « aujourd'hui / demain / lundi » | ÉJ+TE | — |
| :913-922 | cellule « Vont partir » | « pas encore en service » · « extension muette » · « si Chrome est ouvert »… | ÉJ | nombreAttendu |
| :942-948 | variante pied | « Incluse à partir du plan Pro » / « Active sur … » | ÉJ | — |
| :1011 | cellule | « Créneau » / « Prochain créneau » | TE | — |
| :1179-1181 | réglages | « En cours / Prochain passage » ; « Maintenant / ‹8h› » ; « jusqu'à ‹10h› / demain » | ÉJ+TE | — |
| :1233-1234 | idem | « Chrome est ouvert sur @x — lu à ‹14h32›. » | TE | — |
| :1263-1271 | idem | « Chrome connecté · passe ce créneau » | ÉJ | — |
| :1311-1317 | idem | « …une toutes les ‹n› min environ… » | TE | — |
| :1404-1413 | pied | « En pause. Tes réglages sont conservés. » · « D'ici ‹10h›, ‹n› annonces remonteront si Chrome est ouvert. » · « ‹Demain› entre ‹8h› et ‹10h›… Sinon, tentative au créneau suivant. » | ÉJ+TE | — |
| :1532 | historique | « Chargement… » | AL | — |
| :1556-1571 | idem | « Créneau en cours — ‹n› remontée(s)… » · « Chrome était fermé… » · « Tout ce qui était prévu est passé — première à ‹8h05›… » | ÉJ+TE | — |
| :1584-1589 | idem | « Créneau manqué » · « Rien à faire » · « ‹n› remontées » · « ‹n› sautées » | ÉJ | — |
| :1604-1615 | idem | « Remontée à ‹8h05› » · « Attend une action de ta part. » · « En cours. » · « Échec — … » | ÉJ+TE | statuts |
| :1623-1637 | idem | « De ‹8h› à ‹9h› / Depuis ‹8h› · ‹n› en vol… » ; « À ‹8h05› » | ÉJ+TE | — |

## 7. Synchronisation et relevés
| fichier:ligne | écran/composant | texte exact (ou règle) | cat. | statut source |
|---|---|---|---|---|
| annonces/textes.js:32,34,37 | BlocSynchro (Stock), au repos | « Jamais synchronisé » · « Synchronisé ‹il y a 12 min› » · « … · ‹n› annonces » | ÉJ+TE | runs |
| annonces/textes.js:36,38 | idem, en cours | « Synchronisation » · « ‹n› plateformes sur ‹N› » | ÉJ+AL | vague |
| annonces/textes.js:41-44 | bouton | « Synchroniser » · « En cours » · « Envoi… » · « Extension requise » | ÉJ+AL | — |
| annonces/textes.js:47-56 | mots des pastilles | « à connecter » · « à autoriser » · « en cours… » · « en attente » · « échec » · « lues » · « autre compte » · « expiré » · « jamais » | ÉJ | status |
| annonces/textes.js:60-62,66 | écran en cours | « Synchronisation de ‹P› en cours » · « Synchronisation en attente de ton ordinateur » · « On range les annonces dans ton stock. » · « Ton ordinateur travaille pendant ce temps. » | ÉJ+AL | running/queued |
| annonces/textes.js:71-74 | rapprochement | « Rapprochement de tes annonces en cours » + « ‹n› annonces à comparer… » | ÉJ+AL | — |
| annonces/textes.js:75 | temps restant | « Moins d'une minute » / « Environ ‹n› min » | TE | secondes_restantes |
| annonces/textes.js:76-81 | lignes d'avancement | « ‹l› sur ‹a› » · « en attente » · « en cours » · « terminé » · « à reconnecter » | ÉJ+AL | statuts |
| annonces/textes.js:82 | résumé | « Ton stock est prêt » | ÉJ | — |
| annonces/textes.js:100 | rangement | « …rangement en cours — elle arrive dans ton stock d'ici quelques minutes. » | ÉJ+TE | — |
| annonces/textes.js:106 | point à régler | « Connecte-toi à ‹P› sur ton ordinateur, puis appuie sur « Synchroniser ». » | ÉJ | — |
| annonces/textes.js:116 | idem | « …réessaie dans quelques minutes. » | ÉJ+TE | anti_robot |
| annonces/textes.js:117-119 | idem | « …s'est arrêtée avant la fin… » · « …n'a pas pris… » · « …n'a pas abouti… » | ÉJ | — |
| annonces/textes.js:121,124 | idem | « …s'est arrêtée — ‹motif›… » · « …à temps… » | ÉJ | — |
| annonces/textes.js:131-133 | idem | « …synchronisation incomplète — ‹n› lues sur ‹N›… » | ÉJ | incomplete |
| annonces/textes.js:137,140 | idem | relevés vides · « Ton ordinateur n'a pas répondu… » | ÉJ | — |
| annonces/textes.js:146-158 | titres des points | « ‹P› : pas connecté » · « …synchronisation arrêtée » · « …à reprendre » · « …incomplète »… | ÉJ | — |
| annonces/textes.js:164-166 | bande verte | « ‹P› : ‹n› annonces synchronisées et rangées… » | ÉJ | done |
| annonces/textes.js:169,173-174 | sous « Me connecter » | « Une fois connecté, appuie sur « Synchroniser ». » · « Toujours pas connecté… » | ÉJ | — |
| annonces/etatReleve.js:21-29 | survol d'une pastille | « 12 min » · « 9 h » · « 2 j » | TE | — |
| annonces/etatReleve.js:31-41 | titre / résumé | « à l'instant » · « il y a ‹n› min/h/j » | TE | — |
| annonces/etatReleve.js:182-270 | pastilles des plateformes | n (« · », « — », lu/N) + mot + couleur | ÉJ | runs |
| annonces/finReleve.js:26-49 | phrase de fin | situation → texte | ÉJ | run.erreur |
| stock/BlocSynchro.jsx:47-54 | point des pastilles | teal / gris / ambre | ÉJ | phase |
| stock/BlocSynchro.jsx:58,64 | idem | « à jour » ; point pulsé | ÉJ+AL | — |
| stock/BlocSynchro.jsx:82-84 | ligne | « ‹n› point(s) à régler » | ÉJ | — |
| stock/BlocSynchro.jsx:390 | bouton | texte du bouton | ÉJ+AL | — |
| stock/BlocSynchro.jsx:420 | résumé | « ‹n› annonces à jour sur ‹n› plateformes · ‹il y a…› » | ÉJ+TE | — |
| stock/BlocSynchro.jsx:472,475 | titre | « Tu pourras synchroniser dans ‹n› min. » | TE | délai entre synchros |
| stock/BlocSynchro.jsx:497-513 | en cours | ConstellationReleve + barre animée | AL | — |
| stock/BlocSynchro.jsx:505-507 | idem | « Synchronisation de ‹P› en cours » / « Rapprochement… » / « On range… » / « …en attente de ton ordinateur » | ÉJ+AL | — |
| stock/BlocSynchro.jsx:516-518 | idem | « Environ ‹n› min » | TE | serveur |
| stock/BlocSynchro.jsx:522-532 | idem | avancement par plateforme | ÉJ+AL | — |
| stock/BlocSynchro.jsx:547 | feuille | « ‹n› points à régler » / « Synchronisation » | ÉJ | — |
| stock/BlocSynchro.jsx:585 | feuille | « Synchronisation refusée » | ÉJ | — |
| stock/BlocSynchro.jsx:591 | feuille | « Rangement en cours » + « …d'ici quelques minutes » | ÉJ+TE | — |
| annonces/ConstellationReleve.jsx:44-87 + theme.js:57-68 | animation du relevé | rvPouls, rvRespire, rvTourne (8 s), rvBalaye | AL | — |
| tabs/StockTab.jsx:3049-3053 | VintedDressingSync | « Suivi arrêté au bout de 10 minutes… » | ÉJ+TE | — |
| tabs/StockTab.jsx:3252-3257 | idem | « Tu pourras synchroniser dans ‹n› min. » | TE | délai de 15 min |
| tabs/StockTab.jsx:3330-3358 | idem | « Annonces Vinted synchronisées ‹à l'instant / il y a… / hier à HH:MM / le jj/mm›. » | ÉJ+TE | — |
| tabs/StockTab.jsx:3362-3372 | idem | « automatique toutes les 24 h quand Chrome est ouvert » | TE | — |
| tabs/StockTab.jsx:3375-3380 | idem | « Démarrage… » / « ‹n› articles sur ‹N› » / « ‹n› articles lus » | AL | running |
| tabs/StockTab.jsx:3570-3574 | refus | « …tu pourras resynchroniser dans ~‹m› min. » | TE | cadence |
| tabs/StockTab.jsx:3576-3585 | refus | « Une demande est déjà en attente : elle partira à la prochaine ouverture de Chrome… » · « …déjà en cours… » | ÉJ | — |
| tabs/StockTab.jsx:3594-3596 | idem | « …Réessaie dans un instant. » | TE | — |
| tabs/StockTab.jsx:3614-3622 | bilan | « …Elle reprend toute seule dans ~‹min› min (tentative a/b)… » | ÉJ+TE | reprise auto |
| tabs/StockTab.jsx:3625-3666 | bilan | « Synchronisation terminée… » / « Annonces Vinted synchronisées — ‹n› importés… » | ÉJ | done |
| tabs/StockTab.jsx:3676-3688 | bilan | « Synchronisation incomplète… repartira là où elle s'est arrêtée. » · « …réessaie un peu plus tard… » | ÉJ+TE | — |
| tabs/StockTab.jsx:3732-3735 | bilan | « …réessaie dans quelques minutes. » | ÉJ+TE | 403 |
| tabs/StockTab.jsx:3744-3755 | bilan | « Nouvelle tentative automatique dans ~‹min› min (tentative a/b)… » | ÉJ+TE | retry403 |
| tabs/StockTab.jsx:3764-3785 | bilan | « Synchronisation échouée… » · « …non exécutée… » | ÉJ | — |
| tabs/StockTab.jsx:3899,3915 | question boutique | « J'ai changé de boutique — relancer » · « Ajout… » | AL | — |
| tabs/StockTab.jsx:4008-4022 | ligne Vinted | « Synchronisation en cours… » · « Envoi de la demande… » · « Demande en attente de ton ordinateur » · « Demande en attente — elle passe en premier » · « Jamais synchronisée »… | ÉJ+AL+TE | — |
| tabs/StockTab.jsx:4035 | bouton | « En cours » / « Envoi… » / « Synchroniser » | ÉJ+AL | — |
| tabs/StockTab.jsx:4086-4096 | carte Vinted | « Synchronisation en cours… » · « Sync en attente » · « Demande en attente »… | ÉJ+AL | — |
| tabs/StockTab.jsx:4123-4139 | encart + loader | « Ta synchronisation passe en premier » + « …deux minutes environ… » / « …reprennent ‹à 23h30›… » | AL+TE | — |
| tabs/StockTab.jsx:4155-4181 | encart + loader | « Demande envoyée » + « …2 minutes au plus. » ; « Ton ordinateur n'a pas encore répondu »… | AL+TE | queued |
| tabs/StockTab.jsx:4189-4191 | ligne | « Tu pourras synchroniser dans ‹n› min. » | TE | — |
| tabs/StockTab.jsx:4193-4202 | encart + loader | progression + « La synchronisation se poursuit sur ton ordinateur… » | AL | running |
| tabs/StockTab.jsx:3884-3888 | AVIS_COULEURS | vert / orange / rouge | ÉJ | — |
| utils/syncPlateformes.js:256-266 | refus | « …il y a moins de 15 min — réessaie dans un instant. » | ÉJ+TE | — |
| annonces/BandesReleve.jsx:79-108 | parcours d'entrée | bandes réussite et murs | ÉJ | — |
| annonces/EcranDoublons.jsx:137,156,170,252 | à vérifier | « …à la prochaine synchronisation. » · « Il en reste ‹n›… » · « …réessaie dans un instant. » | ÉJ | — |
| annonces/QuestionMarque.jsx:101,130 | question marque | « … » · « …au prochain passage… » | AL+TE | — |

## 8. Parcours de publication (stepper, suivi, lot)
| fichier:ligne | écran/composant | texte exact (ou règle) | cat. | statut source |
|---|---|---|---|---|
| components/ListingPreviewScreen.jsx:11310-11318 | ouverture du stepper | loader plein écran | AL | — |
| :2410-2414 | génération | compteur `elapsed` toutes les 1 s ; bascule d'étape à 20 s | AL | — |
| :2443-2463 | génération | barre « Rédaction de tes annonces » (« Retouche des photos en cours… », « Génération des annonces… ») ; « Tes annonces sont prêtes. » | AL+TE | — |
| :2466 + translations.js:189-190 | idem | « Ça prend ~1-2 minutes pour les retouches IA. » / « Encore quelques secondes… » | TE | — |
| :2052 | photos | « Analyse en cours… » | AL | — |
| :2108-2168 | rangée de plateformes | « Déjà en ligne sur ‹P› » / « Publication déjà en cours sur ‹P› » ; « · en ligne / · en cours / · en pause » | ÉJ | published / pending / pause |
| :342 + translations.js:174 | idem | « ‹P› : publication momentanément en pause… » | ÉJ | platform_health |
| :1692-1695 | idem | « ‹P› s'active avec la prochaine mise à jour… » / « …est en préparation… » | ÉJ | — |
| :5187-5194 (rendu :4137) | motif de verrou | « déjà en ligne pour cet article » · « une publication est déjà en cours » · phraseEtat | ÉJ | published/pending/needs_user |
| :4172 | idem | « ‹P› — dernière publication refusée — tu peux republier » | ÉJ | failed |
| :4196-4209 + translations.js:286,292,293 | encart « comment ça part » | « …automatiquement en quelques minutes… » | TE | voie |
| :10549-10572 + translations.js:308-314 | bouton | « Upload en cours… » · « Génération… » · « Publication en cours… » | AL | — |
| :10584 | idem | « Rien ne peut partir pour l'instant » | ÉJ | — |
| :10795 | motifs du bouton | « Vérification de tes annonces en cours… » | AL | — |
| :11752-11759 | étape Publier | « Ton ordinateur est éteint — la publication démarrera à la prochaine ouverture de Chrome. » | ÉJ | extension éteinte |
| :9987,10229 | erreurs | « …republie dans un instant. » / « …réessaie dans un instant. » | TE | — |
| utils/etatsPublication.js:114-124 | phraseEtat (stepper, rangée) | « en attente d'un champ (‹…›) » · « en attente de ton autorisation Opla » · « en attente de ta connexion à ‹P› » · « en pause : … » · « une publication est en attente » · « dernière publication refusée — tu peux republier » | ÉJ | needs_user:<source> / failed |
| utils/etatsPublication.js:146-155 | erreur already_published | « …une publication attend « ‹champ› »… elle partira toute seule. » · « …est déjà en cours — rien à refaire. » · « …déjà en ligne ou en file. » | ÉJ | — |
| utils/publicationState.js:177-183 | verrou « en doute » | « Vendue d'après la plateforme (le ‹jj/mm›)… » / « Plus vue en ligne depuis le ‹jj/mm›… » | ÉJ+TE | unavailable_since |
| publication/StepperNouveau.jsx:71,79,100 | bouton | « Lecture de l'article… » · « Envoi des photos… » · « Rédaction en cours… » | AL | — |
| publication/StepperNouveau.jsx:169 | idem | « Ton ordinateur est éteint — la publication démarrera… » | ÉJ | — |
| publication/EcranOuPublier.jsx:101-108 | « Où publier ? » | « Déjà en ligne pour cet article » · « Une publication est déjà en cours » · « Opla est autorisée… » | ÉJ | — |
| publication/EcranOuPublier.jsx:355,384 | idem | « Analyse en cours… » · « Je transcris… » | AL | — |
| publication/plateformes.js:144-151 | puce de plateforme verrouillée | « ! » · « En cours » · « Plus vue » · « En ligne » | ÉJ | — |
| publication/plateformes.js:88-101 | rien à publier | « Publication déjà en cours sur ‹P›. » · « ‹P› attend un geste… » · « Rien ne peut partir pour l'instant » | ÉJ | — |
| publication/plateformes.js:180-200 | verdict Confirmer | « ‹P› ne partira pas : … » · « Partira sur ‹P› » · « Rien ne partira pour l'instant » | ÉJ | — |
| publication/EcranConfirmer.jsx:54-56 | Confirmer | « …en quelques minutes… » | TE | — |
| publication/EcranConfirmer.jsx:160-168 | idem | puce « En cours » + « Opla est autorisée… » | ÉJ | — |
| publication/EcranConfirmer.jsx:242,247 | idem | « …ne partira qu'après la mise à jour… » · « L'annonce attendra que tu te connectes… » | ÉJ | — |
| publication/EcranSuivi.jsx:186-190 | suivi « C'est parti » | « Publication lancée » / « Publié » / « Publié en partie » / « Pas encore publié » | ÉJ | etatsFournee |
| publication/EcranSuivi.jsx:211-214 | idem | « ‹n› en ligne · ‹n› en attente · ‹n› refusée(s) » / « ‹n› annonces en route — tu suis chacune ici. » | ÉJ | — |
| publication/EcranSuivi.jsx:148 | ligne | « En cours dans Chrome » / « Publication depuis nos serveurs… » + spinner | ÉJ+AL | processing |
| publication/EcranSuivi.jsx:149 | idem | « En ligne · voir l'annonce ↗ » | ÉJ | published |
| publication/EcranSuivi.jsx:150-151 | idem | « ‹P› demande « ‹champ› » » + « Question » | ÉJ | needs_user |
| publication/EcranSuivi.jsx:155-156 | idem | « Opla est autorisée : elle repart toute seule dans un instant. » + « en file » | ÉJ+TE | — |
| publication/EcranSuivi.jsx:159-175 | idem | « Attend ton autorisation Depop/Opla — partira toute seule une fois accordée. » | ÉJ | — |
| publication/EcranSuivi.jsx:163 | idem | « Attend ta connexion sur ton ordinateur. » | ÉJ | — |
| publication/EcranSuivi.jsx:164 | idem | « Attend quelque chose de ton côté. » + « Attente » | ÉJ | pending+error |
| publication/EcranSuivi.jsx:165 | idem | « La plateforme a refusé. » + « Refusée » | ÉJ | failed |
| publication/EcranSuivi.jsx:169 | idem | « Annulée. » | ÉJ | cancelled |
| publication/EcranSuivi.jsx:179 | idem | mise à jour de l'extension + « Mise à jour » | ÉJ | — |
| publication/EcranSuivi.jsx:180 | idem | « Dans la file — Chrome la prend à son tour » + « en file » | ÉJ | pending |
| publication/EcranSuivi.jsx:119-141,220-234 | barre de la fournée | barre multi-pistes ; « En ligne sur ‹n› plateformes sur ‹N›… » ; « Rien n'est parti pour l'instant… » | ÉJ+AL | — |
| publication/EcranSuivi.jsx:240 | idem | « Lecture de la file… » | AL | — |
| publication/EcranSuivi.jsx:266-273 + :33 | idem | « Pas parties cette fois » + motifs (« déjà en ligne, en file ou en attente »…) | ÉJ | — |
| publication/EcranSuivi.jsx:281-283 + publication/texte.js:8-19 | idem | « Extension active · Chrome vu ‹il y a 2 min› » | ÉJ+TE | — |
| publication/EcranSuivi.jsx:290-291 | idem | « Ton ordinateur est éteint… Tes annonces attendent et partiront dès que Chrome s'ouvre. » | ÉJ | — |
| publication/lot/LotPublication.jsx:86 | lot : puce par article | « En attente » · « Lecture… » · « Rédaction… » · « Vérification… » · « Prêt » · « À compléter » · « Envoi… » · « En file » · « Pas parti »… | ÉJ+AL | phases |
| publication/lot/LotPublication.jsx:106 | idem | « Lecture de ta description sur Vinted, au rythme de tes dépôts… » | AL | — |
| publication/lot/LotPublication.jsx:1360 | idem | spinner | AL | — |
| publication/lot/LotPublication.jsx:918,932 | bouton | « Lecture de tes articles… » · « Préparation… ‹n› sur ‹N› » | AL | — |
| publication/lot/LotPublication.jsx:1179 | carte quota | « On compte… » | AL | — |
| publication/lot/LotPublication.jsx:1191-1192 + lot/regles.js:160-176 | carte | « Avec ton ordinateur allumé : ≈ ‹40 min / 1 h 20›, une annonce après l'autre. » | TE | — |
| publication/lot/LotPublication.jsx:1205-1207 | carte | « Ton ordinateur semble éteint : les annonces partiront à la prochaine ouverture de Chrome. » | ÉJ | — |
| publication/lot/LotPublication.jsx:478,638,1141 | idem | « ‹P› en pause de notre côté » / « En pause de notre côté pour l'instant » | ÉJ | — |
| publication/lot/LotPublication.jsx:635 | idem | « déjà en cours sur ‹P› » | ÉJ | — |
| publication/lot/LotPublication.jsx:1248-1255 | barre | « Mise en file de tes annonces » « ‹f› sur ‹t› articles » | AL | — |
| publication/lot/LotPublication.jsx:1257-1265 | barre | « Préparation des annonces » « ‹n› sur ‹N› préparés » (pas de 15 s) | AL+TE | — |
| publication/lot/SuiviLot.jsx:21 | suivi du lot | « À faire » · « En cours » · « Dans la file » · « Pas parties » · « En ligne » · « Retirées depuis » · « Arrêtées à ta demande » | ÉJ | etatJobLot |
| publication/lot/SuiviLot.jsx:33,156,161 | idem | « en ligne / en cours / dans la file / attend un geste / pas partie / retirée depuis / arrêtée » | ÉJ | — |
| publication/lot/SuiviLot.jsx:131-135 | idem | « Lot du ‹15 octobre, 14:32› » ; « ‹n› annonces en ligne sur ‹N› » + barre | ÉJ+AL | — |
| publication/lot/SuiviLot.jsx:170 | idem | « attend un geste de ta part » | ÉJ | — |
| publication/lot/SuiviLot.jsx:80-177 | idem | « …arrêtée(s)… déjà en cours ira au bout » · « Arrêt… » · « Arrêter ce qui n'est pas parti (‹n›) » · « Retirer du lot » | ÉJ+AL | — |
| publication/lot/SuiviLot.jsx:184 | idem | « Rien dans ce lot pour l'instant. » | ÉJ | — |
| publication/lot/regles.js:380 | écrit dans job.error | « Arrêtée à ta demande — rien n'a été publié. » | ÉJ | cancelled |
| publication/lot/EntreesStock.jsx:91 | barre de sélection | « …il te reste ‹n› annonces ce mois… » | ÉJ | quota |

## 9. App.jsx, onglets, pages, autres composants, utilitaires de texte
| fichier:ligne | écran/composant | texte exact (ou règle) | cat. | statut source |
|---|---|---|---|---|
| App.jsx:7276-7281 | démarrage de l'app | logo + loader | AL | — |
| App.jsx:8491-8492,10122-10123 | onglet Stock | pastille ambre ‹n› | ÉJ | articles avec un job needs_user |
| App.jsx:8553-8556 | bandeau extension | « …ta file reprendra toute seule après la mise à jour. » | ÉJ | — |
| App.jsx:5874-5884 | suppression d'un article | « …en cours ou en attente sera annulée… » · « Retrait déjà en cours sur ‹P› — laissé tel quel. » | ÉJ | — |
| App.jsx:9717-9718 | idem | « Je vérifie où cet article est en ligne… » | AL | — |
| App.jsx:9746,9775,9782 | idem | « Suppression… » | AL | — |
| App.jsx:9970 | vente | « Vérification de l'annonce Vinted… » | AL | — |
| App.jsx:9987 | idem | « Enregistrement… » | AL | — |
| App.jsx:10012 | idem | « Retrait en cours… » | ÉJ+AL | — |
| App.jsx:10042 | idem | « …réessaie dans un instant. » | TE | — |
| App.jsx:690 | offres (achat intégré) | « Chargement... » | AL | — |
| App.jsx:624-625,3080-3081 | paiement | « …dans quelques minutes » · « …dans un instant » | TE | — |
| App.jsx:1845,1880,4310 | toasts IA | « …Réessaie dans 30 secondes. » | TE | — |
| App.jsx:3204 | achat | « Achat en attente d'approbation… » | ÉJ | — |
| App.jsx:7319 | inscription | « Ton inscription est en cours » | ÉJ | — |
| App.jsx:7368,7379-7381 | idem | loader ; « Renvoyer dans ‹n› s » | AL+TE | — |
| App.jsx:7475,7507 | connexion | loader | AL | — |
| App.jsx:8650,9328,9549,9243 | divers | « Enregistrement… » · « Copie en cours… » · « Import en cours... » · « envoi… » | AL | — |
| App.jsx:1370-1371 | accueil vide | animations fsPulse / fsScan | AL | — |
| tabs/StockTab.jsx:9889-10890 | ajout d'article | « Analyse en cours… » · « Je t'écoute… » · « Je réfléchis… » · « Répartition en cours… » | AL | — |
| tabs/StockTab.jsx:10595-10611 + App.redesign.css:1037-1047 | Stock vide | lignes « Exemple » en squelette pulsé | AL | — |
| tabs/StockTab.jsx:8787-8820 | alertes | « L'extension doit se reconnecter » · « Ton ordinateur est éteint » + « Tes publications partiront à la prochaine ouverture de Chrome. » · « ‹P› en pause »… | ÉJ | — |
| tabs/DashboardTab.jsx:448-450 | Tableau de bord | loader + « Chargement des données... » | AL | — |
| tabs/StatsTab.jsx:588-591 | Stats IA | barres squelette | AL | — |
| tabs/VentesTab.jsx:1095-1099,1233-1237 | Ventes | barre + « ‹f› / ‹t› mises à jour… » | AL | — |
| tabs/LensTab.jsx:270-271 | Lens | « Analyse en cours… » | AL | — |
| tabs/LensTab.jsx:291-325 | Lens, barre du scan | « Envoi des photos (‹i› sur ‹n›)… » / « Analyse de l'article… » (20 s) | AL+TE | — |
| tabs/LensTab.jsx:650-659,985-991,1262-1266 | EcranPreparation | « Envoi de tes photos… » · « Lecture de tes photos… » · « Ouverture de ton annonce… » | AL | — |
| tabs/LensTab.jsx:1207-1209 | Lens classique | « 🧠 Analyse en cours... » | AL | — |
| components/ui.jsx:135-155 | Loader / LoaderScreen | — | AL | — |
| components/ProtectedRoute.jsx:16-18 | route protégée | loader | AL | — |
| components/BoutonMeConnecter.jsx:30,39 | messages Opla/Depop | « …la publication repart toute seule. » | ÉJ | — |
| components/BoutonMeConnecter.jsx:57-67 | bouton « Me connecter » | « On ouvre… » · « La page de connexion ‹P› s'est ouverte… » · « Ton ordinateur ne répond pas… » · « …Réessaie dans un moment. » | ÉJ+AL+TE | — |
| components/OplaAutorisationModal.jsx:40 | modale | « …elle attend l'autorisation, puis repart toute seule. » | ÉJ | — |
| components/ExtensionPitchScreen.jsx:218-219,242,295 | extension | « Renvoyer dans ‹n› s » · « Envoi du lien… » · « Vérification… » | AL+TE | — |
| components/ExtensionPitchScreen.jsx:96,287,302 | idem | « …en quelques secondes… » · « …laisse Chrome ouvert 2 minutes puis réessaie. » | TE | — |
| components/InstallExtensionCta.jsx:78-79,86 | bouton d'installation | « Renvoyer dans ‹n› s » · « Envoi du lien… » | AL+TE | — |
| hooks/useEnvoiLienExtension.js:100-104 | idem | « …il peut mettre quelques minutes à arriver. Tu pourras en redemander un dans ‹n› min / ‹n› h. » | TE | — |
| components/EbayCompteSection.jsx:78-156,1089 | Réglages eBay | « Vérification chez eBay… » · « Envoi à eBay… » · « Lecture… » | AL | — |
| utils/ebayCompte.js:58 | idem | « FillSell n'a pas répondu en 30 s… » | TE | — |
| CarteLivraisonEbay:29 · CarteRayon:50 · ChoixVenteModale:58 · FusionArticleModal:231 | divers | « Lecture de tes politiques eBay… » · « Chargement des rayons… » · « Lecture de tes annonces… » · « Fusion… » | AL | — |
| components/voice/VoiceKit.jsx:107,112 | voix | ondes + « Je réfléchis… » | AL | — |
| components/voice/VoiceResultCard.jsx:532,633 | voix | « ⏳ En attente de la confirmation précédente… » | AL | — |
| entree/textes.js:68-74 + EtapeReleve.jsx:53-56,129 | entrée, relevé | « Synchronisation demandée… » · « Synchronisation lancée — elle avance sur ton ordinateur » · « Demande gardée — elle part dès que l'extension tourne » | ÉJ+AL | lance / en_file |
| entree/EtapeReleve.jsx:68,73,84-88 | idem | ligne de scan, point pulsé, reflets | AL | — |
| entree/textes.js:52-53 + EtapeExtension.jsx:76-79 | extension | « Détection automatique — rien à recliquer ici » (pulsé) | AL | — |
| entree/EtapeExtension.jsx:49,70-72 | idem | « Envoi du lien… » · « Renvoyer dans ‹n› s » | AL+TE | — |
| entree/EtapeEbay.jsx:50 + textes.js:36 | eBay | « Ouverture de eBay… » | AL | — |
| entree/EtapeFin.jsx:89-90 | fin | point pulsé | AL | — |
| entree/textes.js:94 | tuto | « …ton ordinateur le reprend dès que l'extension tourne. » | ÉJ | — |
| pages/AuthCallback.jsx:66-67 | callback | loader + « Connexion en cours… » | AL | — |
| pages/AuthConfirm.jsx:116-117 | confirmation | « Confirmation en cours… » | AL | — |
| pages/Cancel.jsx:25-26 | paiement | « Ouverture du paiement… » · « Un instant… » | AL | — |
| pages/Desinscription.jsx:97,143,159 | désinscription | « Un instant… » | AL | — |
| pages/ResetPassword.jsx:68,72 | mot de passe | « Mise à jour… » · « Vérification du lien… » | AL | — |
| pages/DemoBarreProgression.jsx:21-230 | /demo/barre-progression | étapes de démonstration + « En pause : Chrome est fermé… » | ÉJ+AL | démo |
| pages/DemoBarreProgression.jsx:385 | idem | « …une vraie publication prend une à trois minutes… » | TE | — |
| pages/LandingPage.jsx:199,904 | landing | « Publication en cours… » | AL | — |
| pages/LandingPage.jsx:204,960 | idem | « en 40 secondes » | TE | — |
| pages/Legal.jsx:221 | mentions légales | « …vérification périodique (~30 min)… » | TE | — |
| cloud/textesConnexion.js:24-37 · cloud/textes.js:77-149 | option Sans ordinateur | « On prépare ta place… » · « …dans quelques heures… » · « …démarre dans un instant. » · « En pause » | ÉJ+AL+TE | — |
| reglages/textes.js:112-113 + SousPageCatalogueQuarantaine:251 | Réglages | « En attente de ton arbitrage » · « Lecture des observations… » | ÉJ+AL | — |
| reglages/SousPagePlateformes.jsx:125-126 | idem | pastille « … » | AL | — |
| reglages/textes.js:65,68 + SousPageAbonnement:204,249 | Abonnement | « Ouverture… » · « Restauration… » | AL | — |
| utils/shared.js:340 | erreur humanisée | « Ta publication est partie sur ‹P›, elle est en cours de confirmation chez eux… » | ÉJ | needs_user en_cours |
| utils/shared.js:410-411 | idem | « …nouvelle vérification dans 24 h. » | ÉJ+TE | — |
| utils/shared.js:424-425 | idem | « …ça repartira tout seul dès que Chrome sera ouvert… » | ÉJ | — |
| utils/shared.js:432,438 | idem | « Annulée : c'était le doublon… » / « Annulée : …déjà en ligne… » | ÉJ | cancelled |
| utils/shared.js:449-511 | idem (eBay) | « …la publication repart d'elle-même… » / « …réessaie d'elle-même. » | ÉJ | — |
| utils/shared.js:593-594 | idem | « …il reste une tentative automatique, dans les minutes qui viennent. » | ÉJ+TE | CHALLENGE |
| utils/shared.js:600-603 | idem | « …la publication est arrêtée… » | ÉJ | — |
| utils/shared.js:699-700 | idem | « Republication mise en pause avant toute suppression… » | ÉJ | — |
| utils/shared.js:718-720 | idem | « …une tentative automatique a lieu dans les minutes qui viennent… » | ÉJ+TE | — |
| utils/shared.js:745-750 | idem | « Notre équipe a annulé / mis en pause cette opération… » | ÉJ | — |
| utils/shared.js:807-811 | idem | « …il ne repartira pas tout seul… » | ÉJ | terminal |
| utils/shared.js:845-849 | idem | « …Elle reprend toute seule, rien à faire de ton côté. » | ÉJ | — |
| utils/shared.js:937-939 | idem (repli) | « …interrompue par un imprévu technique… » | ÉJ | — |
| utils/retraitsBloques.js:253-293 | écran Annonces à retirer | « …FillSell la retirera aussitôt… » · « …FillSell réessaie tout seul… » | ÉJ | delete bloqués |
| utils/retraitsBloques.js:297-327 | carte d'un article vendu | « Encore en ligne sur ‹P› — … » | ÉJ | — |
| utils/retraitsBloques.js:538-556 | ligne À régler | « Vendu, (peut-être) encore en ligne sur ‹P›… » | ÉJ | — |
| utils/republication.js:126,131 | refus | « Une republication est déjà en cours… » · « …ça repart au prochain cycle. » | ÉJ+TE | — |
| utils/oplaAcces.js:185-200 | divers | « À autoriser dans l'extension » · « Opla attend ton autorisation »… | ÉJ | verdict |
| utils/attenteBoutique.js:163-193 | divers | « …reprendront automatiquement dès que tu t'y reconnecteras. » · « …elle apparaît dès que ton ordinateur se réveille. » · « Rien n'est perdu, rien n'a échoué… » | ÉJ | — |
| App.css:644-650 · App.redesign.css:371-424,659 | CSS | animations génériques | AL | — |

Note : `annonces/CarteAnnoncesEnLigne.jsx` n'est monté nulle part (code mort). Il reprend les textes de la section 7.

## Où l'état d'un job est CALCULÉ (statut → libellé / groupe / couleur)
- utils/etatsPublication.js:55 natureAttente → kind (attente_champ / autorisation / connexion / plateforme_ecartee / attente) ; :85 attentesParPlateforme (+ refusee) ; :109 phraseEtat ; :135 messageRefusPublication
- utils/fileDesJobs.js:41 etapeRepublication ; :49-55 TERMINAUX / jobVivant ; :59 attendConnexion ; :69 heureConnue ; :82 depuisQuand ; :91-104 rangDepart / comparerDepart ; :220 attenteAutomatique ; **:262 situationJob → {groupe en_cours / a_venir / pause / geste, raison, heure, motif}** ; :375 lireFile ; :405 phraseCompteurs ; :416 libelleAction ; :241 sansEstimation
- utils/barresJobs.js:113 etapesJob (étapes + durées) ; :152 pisteJob → {etape, etat, ton, phrases} (appelle situationJob)
- utils/progression.js:142 etatNormalise ; :150 etatGlobal ; BarreProgression.jsx:109-111 TONS / plusGrave, :359-376 texte et badge ; BarreProgression.css data-etat / data-ton
- components/BarreJobCarte.jsx:18 phrasesCourtes ; components/FileDesJobs.jsx:120 ICONES, :132 couleur
- stock/regles.js:221 pastilleCourte → {texte, ton, pulse} ; stock/jetons.js:62 TONS
- tabs/StockTab.jsx:9181 pastilleArticle (ordre de priorité) ; :8831 deriverArticle (hasPending, pendingSurConnexion, failedJobs, needsUserJobs, enConfirmationJobs, murDirect…) ; :9174 tonEtapeRepub (ton déduit de la couleur)
- tabs/StockTab.jsx:4891 etapeRepublication → {cle, court, couleurs bleu / vert / ambre, titre, detail} ; :4790 repubStepDe ; :4797 repubJobFini ; :4813 activiteFinie ; :4817 activiteEnCours ; :4831 rangActivite ; :5200 repriseRepub ; :5176 heureParis ; :2698 formatDepuis ; :3330 depuisTexte
- tabs/StockTab.jsx:280 etatLienJob ; :350 attenteDeConnexion ; :355 murDeConnexion ; :496 relanceManuelleInfo
- tabs/StockTab.jsx:2120-2182 JobStatusModal (diag, LIB_STATUT, libStatut, TONS) ; :2644 diagnostiquerExtension ; :2353 vintedEnVerification ; :2030 isListingUrlRecoverable
- tabs/StockTab.jsx:3602 bilan, :4008 etatLigne, :3981 etatVintedRemonte, :3884 AVIS_COULEURS (sync Vinted) ; :6827 repubBandeau ; :7029 activite ; :7096 attenteAction ; :6801 horsLigneIds
- utils/shared.js:201 jobActionRequise ; :221 natureNeedsUser (en_cours / a_completer / action) ; :263 needsUserOuvrable ; :280 republicationAnnonceDisparue ; :335 texteEnCoursConfirmation ; :547 humanizeJobError ; :949 jobErrorSansFaussePromesse ; :2516 fraicheurExtension
- utils/stockFiltres.js:223 etatPlateformes ; :291 indexEtatStock ; :307 compteursStock ; :456 pastillesEtat
- utils/publicationState.js:72 computeRemovalInfo (removing / removed / queued) ; :126 plateformesReserveesParRepublication ; :148 plateformesEnDoute ; :170 phraseDouteEnLigne ; :303 vintedPresenceArticle ; :360 republishAnnulable ; :378 estArretUtilisateur ; :381 estGeleLivres
- utils/retenueServeur.js:54 retenueServeurDuJob ; :98 phraseRetenueServeur
- utils/retraitsBloques.js:53-147 retraitBloquePar* ; :182 retraitsBloquesParConnexion ; :240 texteRetraitsBloques ; :297 ligneCarteRetraitBloque ; :331 ligneARegler
- utils/attenteBoutique.js:84 etatAttenteBoutique ; :158 lignesAttenteBoutique ; :205 messageFicheAttenteBoutique
- annonces/synchroniser.js:108 jobAttendConnexion ; :117 attentesDeConnexion
- utils/extensionAJour.js:21 extensionAMettreAJour ; :29 phraseMiseAJourExtension ; utils/oplaAcces.js:185 phraseAccesOpla (+ parcageDepasse)
- publication/moteur/regles.js:525 etatsFournee ; publication/EcranSuivi.jsx:119 piste, :143 ligne
- publication/plateformes.js:34 etatPlateforme ; :81 rienAPublier ; :135 etatVerrouillee ; :144 puceVerrouillee ; :160 verdictConfirmation
- publication/lot/regles.js:311 suiviDuLot ; :346 etatJobLot ; :360 groupeArticle ; :375 depotArretable ; LotPublication.jsx:85 LIBELLE_PHASE, :109 TON_PHASE
- annonces/etatReleve.js:182 etatTuile ; :298 lireVague ; :360 lireBilan ; :99 murConnexionReleve ; :145 arretTechniqueReleve ; :355 releveIncomplet ; annonces/finReleve.js:26 situationFinReleve, :37 texteSituation
- stock/BlocSynchro.jsx:47 pointDe, :264 lignesAvancement ; components/RepublicationPlanifiee.jsx:328 synthese, :480 tonCouleur, :660-693, :773 ; hooks/useRepublicationPlanifiee.js:85 nombreAttendu
- components/FeuilleActivite.jsx:192 (étiquettes) ; stock/MenuArticle.jsx:21 TON_INFO ; ListingPreviewScreen.jsx:5146 (attentesParPlateforme), :5187 motifsVerrouillage

**Calculs en double repérés :**
1. « Attend une connexion » : fileDesJobs:59 ≡ StockTab:350 (copie). synchroniser:108 lit un autre marqueur (`attente_connexion`, `verification_boutique_vinted`).
2. Nature d'un `needs_user`, calculée 5 fois : shared:221, etatsPublication:55, fileDesJobs:220, StockTab:355, stockFiltres:223.
3. Étape et fin d'une republication : fileDesJobs:41/49, StockTab:4790/4788/4810, barresJobs:173 ; StockTab:4891 est homonyme de fileDesJobs:41. Deux vocabulaires : la pastille dit « Relevée / Retrait… / Recréation… », la barre dit « Copie faite… / Retrait de l'ancienne… / Remise en ligne… ».
4. Ordre de la file : fileDesJobs:99 (ordre de l'extension) contre StockTab:4831 (le job en traitement d'abord).
5. Libellé d'un `pending` : « En attente » (StockTab:2169, BarreJobCarte:32), « En file » (regles:250, StockTab:4913, BarreProgression:90, Lot:86), « Dans la file… » (barresJobs, EcranSuivi:180, SuiviLot), « En attente de son tour » (fileDesJobs:108, BarreProgression:93), « En file d'attente » (StockTab:2155 / 2682).
6. Formats d'heure et de durée : fileDesJobs:69 / 82, StockTab:5200 / 5176 / 2698 / 3318, RepublicationPlanifiee:144 / 158, etatReleve:21 / 31, publication/texte.js:8, cloud/regles.js:34. On obtient « 17:26 », « 17h26 » et « 08:30 » selon l'écran.
7. Fraîcheur de l'extension : shared:2500 (60 min / 7 j), StockTab:2641 (5 / 15 min), hbMuet 10 min (StockTab:6867 / 7077 / 8964), retraitsBloques:104 (15 min), connexionPlateformes:74 (5 min), vintedSync:74 (30 min).
8. Couleurs : jetons.TONS, BarreProgression (TONS + CSS), JobStatusModal TONS, etapeRepublication (bleu / vert / ambre) et tonEtapeRepub en sens inverse, FeuilleActivite, MenuArticle.TON_INFO, RepublicationPlanifiee.tonCouleur, BlocSynchro.pointDe, etatReleve (pip), FileDesJobs.couleur, AVIS_COULEURS, LotPublication.TON_PHASE, puces d'EcranSuivi.
9. Étapes « en cours » de publication : JobStatusModal « Publication… », pastille « En cours… », barre « Dépôt en cours… », EcranSuivi « En cours dans Chrome », SuiviLot « en cours », file « En cours sur ton ordinateur ».

## setInterval et autres minuteurs qui relisent ou recalculent
**setInterval**
- App.jsx:2732 : extension_build / last_seen toutes les 10 s (bandeau extension visible, onglet visible)
- App.jsx:2785 : contrôle de version de l'app toutes les 5 min
- App.jsx:3938 : sonde `cross_post_jobs` (empreinte) toutes les 45 s, puis `fetchAll` si changement
- App.jsx:7080 : compte à rebours « Renvoyer », 1 s
- App.jsx:2908 / 2948 / 2982 : rotation des placeholders (4 s / 3 s / 4 s, purement visuel)
- components/BarreProgression.jsx:289 : 1 s en « réduire les animations » (sinon boucle requestAnimationFrame partagée, :56-70)
- components/FileDesJobs.jsx:94 : lecture autonome jobs, fiches, profil, platform_health toutes les 10 s
- components/FileDesJobs.jsx:114 : get-pending-jobs `plafond_only` toutes les 60 s
- components/FileDesJobs.jsx:183 : horloge `maintenant` toutes les 30 s (recalcul des situations)
- components/ListingPreviewScreen.jsx:2412 : `elapsed` toutes les 1 s (génération)
- components/ListingPreviewScreen.jsx:4689 : platform_health toutes les 60 s
- tabs/StockTab.jsx:3057 : run de synchro Vinted toutes les 2 s (SYNC_POLL_MS, max 10 min)
- tabs/StockTab.jsx:3113 : attente « occupée » toutes les 30 s
- tabs/StockTab.jsx:3148 : réclamation toutes les 2 s (max 3 min)
- tabs/StockTab.jsx:3198 : re-rendu « dans N min » toutes les 30 s
- tabs/StockTab.jsx:3231 : reprise retry403 / reprise-auto toutes les 30 s (re-rendu + relecture du run)
- tabs/StockTab.jsx:6070 : stats plateformes toutes les 120 s
- tabs/StockTab.jsx:6523 : boutique connectée toutes les 120 s
- tabs/StockTab.jsx:6780 : get-pending-jobs `plafond_only` toutes les 120 s (onglet visible)
- tabs/StockTab.jsx:7613 : extension_last_seen toutes les 60 s (extension pas vivante)
- tabs/StockTab.jsx:8201 : platform_health toutes les 60 s
- entree/useContexteEntree.js:193 : capacité de synchro toutes les 8 s
- entree/useContexteEntree.js:228 : runs de relevé toutes les 8 s
- utils/connexionPlateformes.js:305 : demande de connexion réclamée ? toutes les 3 s (max 90 s)
- hooks/useEnvoiLienExtension.js:51 : compte à rebours 1 s
- hooks/useSortieOpla.js:31 : horloge 60 s ; :42 : coin_config toutes les 10 min
- hooks/useDemandeAvis.js:69 : toutes les 10 min
- reglages/useSessionsPlateformes.js:64 et reglages/useVeritePlateformes.js:38 : toutes les 60 s
- pages/DemoBarreProgression.jsx:301 : horloge 250 ms

**Relectures en chaîne (setTimeout, relectureBornee)**
- tabs/StockTab.jsx:8157 : jobs toutes les 20 s (lecture légère), lecture complète toutes les 5 min (ou au retour d'onglet après 2 min) ; max 5 min
- annonces/useReleveAnnonces.js:112 : relevés toutes les 60 s, 15 s pendant une synchro ou un rangement ; max 10 min
- hooks/useRepublicationPlanifiee.js:210 : toutes les 120 s par défaut (5 min dans le Stock) ; max 15 min
- utils/oplaAcces.js:156 : accès Opla toutes les 5 min ; max 30 min
- publication/EcranSuivi.jsx:80 : 5 s pendant 3 min, puis 20 s tant qu'un job est en file, en cours ou en attente

**Minuteurs d'affichage**
- BarreJobCarte.jsx:64 : barre finie gardée 5 s
- BarreProgression.jsx:340 : `onFini` après 650 ms
- StockTab.jsx:5889 : note transitoire 7 s
- LotPublication.jsx:414 : re-rendu (tick)
- ConstellationReleve : animation de 8 s
