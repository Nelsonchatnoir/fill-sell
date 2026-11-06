# Lot de Nico du 06/11/2026 — 11 points (terminal « Problèmes », reprise du 05/11)

Heures de Paris. Règles durables : `docs/regles/ventes-et-retraits.md` § 06/11, `docs/regles/rapprochement-et-releves.md`
§ 06/11, `docs/regles/extension-et-versions.md` § 06/11. Déploiements et versions : `docs/agents/etat-2026-10-01.md` § 06/11.

## 1. Version minimum abandonnée définitivement
- `0.6.175` ajoutée à `ALREADY_PUBLISHED` ; `EXTENSION_MIN_BUILD` ne se pose JAMAIS (consigne de fin de
  `package-extension.mjs` remplacée) ; sa valeur (0.6.124) ne sert plus qu'au bandeau, qui informe sans jamais dire que la
  file attend.
- Supprimé côté serveur : porte globale de get-pending-jobs (file vide + `extension_update_required`) et refus 409
  d'update-job-status ; filtre par job `build_min_requis` (le champ reste une trace) ; retenues Beebs < 0.6.83 et < 0.6.95,
  colis Vinted < 0.6.84, preuves de retrait < 0.6.80, Opla < 0.6.74, attente ISBN « mise à jour », condition de build de la
  pause « marque » ; la mise en pause `pauseAttente` (needs_user_source « build_min_requis ») ; la condition de build des
  recréations bloquées. App : plus de pastille « En pause — mise à jour ».
- Gardé (ce n'est pas « trop ancien ») : `posteApresDefaut` (un build qui a PLANTÉ sur un job ne le reprend pas — sinon il
  replanterait toutes les 30 min) ; la relance automatique, une fois, quand le poste a le build ; les adaptations de
  capacité (un champ en plus servi à un poste récent).
- Selftest `aucune-retenue-par-version` ; 9 selftests adaptés.
- Tâche de Marta MELE 2fd83d73 (pause « build_min_requis » depuis le 29/10, son poste avait le build depuis le 02/11) — 11:00 :
  relancée par le circuit normal (`scripts/reparations/20261106_relance_marta_pause_version.mjs`, règle
  `vinted_categorie_page_etrangere_publish_en_pause`, `champsRelance`). Seule tâche en pause pour ce motif.

## 2-3. Doudou de nicolas.menar (fiche 1790106697754007, vendue sur Vinted le 06/10)
- Relues le 06/11 à 09:57 sur leur page publique : Leboncoin 3274924341 (Doudou, 24 €) et 3267000921 (Lot 2 doudous,
  36 €) — HTTP 200, `active`, aucune transaction.
- Photos : 3274924341 = la photo même de la fiche (même cadrage, même tache). Le LOT : le doudou du BAS porte la même
  tache brune ovale, au même endroit (bordure grise, couture gauche de la mousseline, petit point sombre juste au-dessus)
  que le doudou vendu ; le doudou du haut n'en a pas. → **le lot contient le doudou vendu** : retrait.
- Retraits armés à 09:58 par `armer_retrait_annonce_pour` (`scripts/reparations/20261106_doudou_lbc_retraits.sql`,
  sauvegarde `_backup_0611_doudou_lbc_retraits`, inverse) : a8d477e9 (3274924341), 81ea0f96 (3267000921).

## 4. Le « Oui » qui n'armait rien hors session
- Cause : `inventaire_doublon_decider` lisait le compte sur la session (`auth.uid()`) — sans session, « unauthorized ».
- Règle : migration `20261106100000_doublon_decider_auteur_legitime` — corps unique (`_corps`, compte de la QUESTION),
  deux entrées (l'app ; l'équipe sur ordre, service seulement, auteur nommé). **PRÉPARÉE, NON APPLIQUÉE** : feu vert nommé
  de Nico. Banc jetable `scripts/essais/20261106100000_banc.mjs` : 30/30 (défaut rejoué ; la personne obtient exactement les
  mêmes issues ; l'équipe la même issue que la personne ; droits ; inverse).

## 5. Point 1 c, version étroite
- Migration `20261106120000_fiche_annonces_vivantes_vente_lbc_enregistree` **PRÉPARÉE, NON APPLIQUÉE**.
- Cas réels (prod, lecture seule, `scripts/essais/20261106120000_cas_reels.sql`) : 152 fiches (36 comptes) changent de
  compte, toutes de 1 à 0 ; 0 franchit le seuil 2 que lisent les appelants → aucune décision ne change aujourd'hui ; la
  version large en changeait 238 dont 2 au seuil (les deux pièces uniques du STOP du 05/11), intactes ici. Effet voulu :
  les 7 séries de Louis vendues le 06/11 compteront 1 au lieu de 2 quand le relevé verra leur remise en vente.
- Banc `scripts/essais/20261106120000_banc.mjs` : 10/10.

## 6. Juge « annonce publiée disparue » : RALLUMÉ
- Simulation (vrai code, vraie prod) : 5 082 jugées, 17 fermetures, 17 vérifiées parties (Vinted 11 × 404, 3 × « Vendu » ;
  Leboncoin 3 × 410). Vraies republications : 596 dont l'ancienne annonce ≠ celle en ligne (390 des comptes de l'incident) :
  toutes « attendre », jugées sur le numéro en ligne. Zéro faux → `JUGER_ANNONCES_PUBLIEES_DISPARUES = true`.

## 7. Les couples « à vérifier »
- `docs/enquetes/rattachements-0511/TRI-PHOTOS-79.md` : 78 ce matin (le 79e est sorti : annexe) — 62 vrais, 3 faux,
  13 indécidables. Rien touché.

## 8. Louis
- Les 7 ventes en série « Achat en cours » : enregistrées le 06/11 à 07:15, les 7 remises en vente publiées à 07:20.
- Deux AUTRES ventes en série jamais enregistrées : 3297299585 (« Rangement Noir et Gris », Vendu depuis le 05/11 09:49) et
  3280443604 (« Rangement Blanc », Vendu depuis le 24/10 12:10). Cause : la lecture fraîche (24/10, décision 7) sautait
  un job déjà marqué `sale_signal = sold` — ici un « Vendu » lu sur la page, SANS preuve exacte — et la preuve de la
  transaction n'arrivait jamais. Règle : migration `20261106110000_lecture_fraiche_preuve_exacte` **PRÉPARÉE, NON
  APPLIQUÉE** ; banc 11/11. Une fois appliquée, les deux ventes passent au relevé suivant de Louis.

## 9. Spam support@
- Sortis (« Non-spam ») : Pascal Caffray (15/10, « Erreur compte synchro eBay » — attend une réponse), Nicolas THOBOIS
  (24/10, « STOP »), alertes internes « Paiement échoué » nivake03 (23/10) et nadegemarcelin78 (09/10).
- Laissés : 2 invitations TestFlight « AdsGPT … OpenAI OpenAds Campaign » (22/10) — leurre non sollicité.

## 10. Champs requis : trois choix à trancher (rien appliqué)
- (a) **Le rayon des autres plateformes suit-il le public choisi sur Vinted ?** Aujourd'hui Beebs, eBay et Leboncoin
  prennent le genre écrit par la rédaction (IA) ; quand la personne choisit « Femme » sur Vinted pour une chaussure que
  l'IA a dite « homme », les autres plateformes restent sur un rayon homme (grille qui commence au 38) et reposent la
  question. Recommandation : OUI, le choix explicite de la personne prime sur la supposition de l'IA, pour toutes les
  plateformes — seulement quand c'est un vrai choix (pas une valeur par défaut).
- (b) **Casquette « Medium-Large » → « taille unique » ?** La règle « accessoire sans taille » ne remplace jamais une
  taille écrite. Recommandation : NON en général (« Medium-Large » est une vraie taille de casquette ajustée) ; OUI
  seulement quand la grille du rayon n'a QUE « taille unique » (la seule valeur possible), la taille réelle restant dans
  le titre/la description.
- (c) **Une pointure posée par la rédaction sans source → traitée comme vide ?** Recommandation : OUI — une pointure que
  ni la personne, ni le titre, ni la description, ni la fiche ne donnent est une invention : la question partagée est
  posée une fois (règle « jamais inventé »).
- Essai réel prévu (scénario de 484818a) : fiches TEST chaussures homme et femme, à faire après la décision.

## 11. Retrait Leboncoin en boucle (Cédric GRIZSTYLE)
- Annonce 3303036848 republiée le 05/11 à 22:27, vendue sur Vinted (retrait armé 22:31), vue « active » au tableau de bord
  à 22:30, puis 410 « désactivée » à 22:48 et 23:04 : lectures dans la fenêtre de modération (2 h), chacune comptée comme
  un essai. Leboncoin ne distingue pas modération et retrait (page et tableau de bord) : seul le temps depuis le dépôt.
- Règle : `_shared/lbc-retrait-moderation.js` (update-job-status) — dans la fenêtre, attente sans essai consommé ; après,
  le 410 clôt sans message.
- Retrait de Cédric clos à 10:08 par la clôture du serveur (« déjà hors ligne ») : page relue 410 à 09:57, 11 h 30 après
  le dépôt ; copie publiée f21124c0 close « pas une vente » (`scripts/reparations/20261106_retrait_lbc_cedric_clos.mjs`,
  sauvegarde `_backup_0611_retrait_lbc_cedric`, inverse).

---

# Lot n° 2 du 06/11/2026 (après-midi) — feux verts 1-6, points 7-13, complément « séries de Louis »

## Migrations (feux verts nommés)
- `20261106100000` appliquée ; preuve réelle 12:07:12 : la question 60621113 (copie Beebs 34032772 du Doudou de
  nicolas.menar), « Oui » de l'équipe par `inventaire_doublon_decider_pour`, auteur nommé dans `preuves.repondu_par`,
  la copie déjà retirée → « caduque », aucun second retrait.
- `20261106120000` appliquée 12:07 : sur 12 022 fiches avec une annonce Leboncoin vivante, 152 passent de 1 à 0, aucune
  ne franchit le seuil 2 → aucune décision ne change.
- `20261106110000` appliquée 12:08 : le déclencheur de lecture fraîche vérifié en prod ; 3297299585 (« Rangement Noir
  et Gris ») et 3280443604 (« Rangement Blanc ») attendent le prochain relevé de Louis (dernier : 10:19).

## Point 4 — champs requis (a, b, c) et point 9 — aspects eBay
Voir `docs/regles/republication-et-publication.md` § 06/11. ebay-api-worker v110, ebay-account v27 (12:31).

## Point 5 — Nicolas THOBOIS
Désinscrit de tous les envois marketing (`email_destinataires` + trace `marketing_optout`, comme `desinscrire()`) ;
le support n'est jamais filtré. Script `scripts/reparations/20261106_thobois_desinscription.sql` (+ INVERSE).

## Point 6 — AdsGPT
Les 2 invitations restent dans le spam ; rien fait.

## Point 7 — ayadi007 (Business), publications eBay
- Cause : PAS le cache. eBay redirige le formulaire de mise en vente vers son onboarding des paiements
  (hôte `ebaypayonboardingweb.ebay.*`, `account-status-error`) : la configuration des paiements de son compte vendeur n'est
  pas terminée. Aucune publication ne peut aboutir avant qu'il la termine sur eBay (Mon eBay → Paiements).
- Pourquoi le correctif existant ne le couvrait pas : il reconnaissait la page d'INSCRIPTION vendeur, pas la page des
  paiements ; l'extension voyait une page inattendue et la tâche repartait (incident Chrome).
- Règle pour tous : la page d'arrivée prime — une page eBay de paiements = mur « paiements » (message vrai, rien publié),
  comme le compte vendeur inactif ; l'éclaireur relâche tout dès qu'une publication eBay aboutit. update-job-status v176,
  get-pending-jobs v337. Refonte de fond NON déployée ; Leboncoin et Vinted non touchés.
- État à 13:05 : 11 publications eBay (créées 11:16-12:19) au mur, toutes needs_user avec le message, aucun numéro,
  rien créé chez eBay. AUCUNE n'est en ligne : impossible tant qu'eBay bloque son compte.

## Point 8 — Jean-Luc LASSARAT, Vinted « Accessoires »
Règle corrigée pour tous les accessoires (`docs/regles/plateformes.md` § 06/11 après-midi). Son article (éponge auto)
n'a pas de rayon Vinted : sa tâche dca7193f n'est pas touchée et repart par le circuit normal quand il choisit le
rayon. Reste : régénérer le sélecteur de rayon depuis l'arbre vivant.

## Point 10 — Guillaume JEHLY
Toute tâche retenue pour une session morte porte le message (`docs/regles/republication-et-publication.md`) ;
121 de ses tâches l'avaient à 12:48. Le message tombe seul quand la session est revue connectée (handler-watch v170,
13:14 : sans cela, les tâches qui attendent leur créneau après la reconnexion le gardaient).

## Point 11 — les 62 couples « vrais »
Rien touché. Actions préparées : `docs/enquetes/rattachements-0511/ACTIONS-62-VRAIS.md` — 56 couples à retirer
(65 annonces), 4 déjà résolus, 2 à trancher (n° 20 dylan.fontaine13, n° 22 josephinecerni). Les 13 indécidables
restent intacts. Validation de Nico avant toute action.

## Point 12 — Pascal Caffray (diagnostic, aucun mail)
Compte 3b7e2361, eBay par l'API (fluxen62), aucune règle de retours (`return_policy_id` NULL). Chez nous : « pas de
retour » est proposé alors qu'eBay l'interdit aux pros (erreur 25002), et `src/components/EbayCompteSection.jsx` ne
propose que 30 jours ou « pas de retour » quand le serveur accepte 14/30/60 (défaut ouvert) ; le « nom en double »
était le bug corrigé le 17/10 (cf0a017). Chez lui : créer une règle de retours (14 ou 30 jours) et la choisir, puis
relancer (job b731ae0f, annulé le 31/10).

## Point 13 — « annonce publiée disparue » depuis 11:33
2 fermetures, 2 justes : 11:33 Vinted 10269377101 ; 12:33 Leboncoin 2954815327 (410 « Cette annonce est désactivée »
relu à 12:48). Aucun faux, règle laissée allumée.

## Complément — séries de Louis (compte Amiral)
- Règles A et B : `docs/regles/ventes-et-retraits.md` § 06/11 après-midi.
- Les 7 remises refusées : 3303252818, 3303253000, 3303253213, 3303253491, 3303253691, 3303253932, 3303254205 (dépôts de
  07:22-07:29), toutes 410 relues à 12:20 — jamais parues. Remises en pending 12:29 (script
  `20261106_louis_remises_refusees_lbc`, dépôt refusé gardé dans `depots_refuses_lbc`), retenues par la règle A à 12:47
  (les 9 annonces vendues encore « active » sur Leboncoin) ; elles partiront seules, sans doublon, quand le relevé les
  verra partir.
- Le parc : 4 autres dépôts « published » refusés, sur 2 comptes : inandup33 ×3 (3280170490, 3280174176, 3282746279)
  et jocabroc8 ×1 (3279731310), tous relus en 410. La règle B v169 les fermera (« failed », publication rendue).
  76 autres dépôts jamais vus restent impossibles à trancher (preuves incomplètes) : rien fait.
- Premier passage de la règle B (v168, 12:48) : 200 jugés, rien fermé (page remplie d'imports, fenêtre de 30 jours) ;
  corrigé en v169 (12:57), simulation sur tout le parc = exactement ces 4.

# Lot n° 2, suite (retour de Nico de 13:20)

## 1. Tests et push
Suite complète par morceaux (10 familles, 600 selftests, 14:26-14:54) : 0 rouge sur le code final (deux rouges dus à
mes changements de libellé des retours eBay, corrigés et relancés). build:essai vert, lint sans erreur nouvelle.

## 2. Les 62 couples — feu vert pour 56 (65 annonces)
- Exclus par le garde-fou « plusieurs exemplaires » (le tri le dit lui-même : neufs, catalogue, timbres) : n° 1, 2, 3,
  6, 12, 21, 23, 32, 34, 40, 44, 45, 75 (13 couples, 16 annonces). Jamais touchés : n° 20, 22, les 13 indécidables.
- Relus en vente juste avant (Chrome de Nico, lecture seule), annonce gardée comprise : eBay 14:10-14:20, Beebs
  14:21-14:23, Leboncoin et Depop 14:24-14:25. Écartés à la relecture : Beebs 34139465 (n° 41) déjà hors ligne (404) ;
  n° 57, 59, 69 (sebastien64310) : l'annonce GARDÉE est hors ligne (404) → le doublon est la seule annonce en vente,
  rien retiré.
- **45 retraits armés** (39 couples) : eBay 17 (benjamin.ployer 6, boncoin59300 1, quartierdeschineurs 1, nino57270 9),
  Beebs 24, Leboncoin 2 (n° 16, 50), Depop 2 (n° 58, 73) — pending, voie extension, par
  `scripts/reparations/20261106_couples_vrais_retraits_{ebay,beebs,lbcdepop}.sql` (+ INVERSE ; heure de lecture du lot
  eBay corrigée à 14:22 : `_ebay_heure.sql`).
- n° 20 (dylan.fontaine13, Leboncoin, Psykokwak) et n° 22 (josephinecerni, Beebs, lot bonnets) : non touchés.

## 3. Sélecteur de rayon Vinted
Régénéré depuis l'arbre vivant (2 874 nœuds, 2 462 feuilles ; détail : `docs/regles/plateformes.md` § 06/11 fin
d'après-midi). 23 ajoutées, 50 retirées, 26 déplacées ; aucun rayon valable aujourd'hui n'a disparu. Annonces publiées :
rayon gardé (Vinted laisse l'ancien sur la page ; 55 republications réussies en 48 h sur ces fiches). ⚠ Bascule de
Vinted compte par compte (6 comptes encore sur l'ancien arbre).

## 4. Retours eBay
Type de vendeur lu chez eBay ; « pas de retour » jamais proposé ni accepté hors particulier ; 14/30/60 jours, la durée
choisie part telle quelle (selftest `ebay-retours`). ebay-account v30 (14:11). Tâche b731ae0f non relancée, aucun mail.

## 5. ayadi007
Ses 10 publications eBay attendaient le geste, aucune en file : rien ne serait reparti même son compte prêt. Corrigé
(éclaireur de handler-watch au barème) ; premier éclaireur 13:54, non servi dans ses 30 min, retenu ; suivant au
barème. Aucune annonce eBay en ligne à 15:00.

## 6. Vérifications
- Règle B (14:48) : les 4 dépôts « failed » ; rien à rendre (aucune réservation).
- Louis : aucun relevé depuis 10:19 → ventes 3297299585 / 3280443604 pas encore enregistrées ; 7 remises retenues.

# Décisions de Nico de 15:10
1. Poussé 10f31e8..fdefb12 ; Vercel PRÊT (fdefb12 servi par fillsell.app) ; chaînes témoins des points 4 a/b/c, 8, 9,
   du sélecteur Vinted et de l'écran des retours lues dans le bundle servi.
2. n° 20 : 3285616924 (77,30 €) relu en vente 15:10, retrait armé 15:13 ; 3295344632 gardé.
3. n° 22 : republication b3cb7da0 close (pas de réservation), 33923195 relu en vente, retrait armé 15:13 ; 33939379
   gardé. Aucun message à la personne.
4. Vinted, chemin selon l'arbre du compte : voir `docs/regles/plateformes.md`. Simulation sur les 24 publications Vinted
   ouvertes : 2 dans la zone — 85016145 (compte basculé, refus « Accessoires ») : reprise attendue au passage de handler-watch v177 ;
   9ca7860d (arbre inconnu) inchangé.
5. Retours eBay, voie extension : 14/30/60 ; « Pas de retour » seulement au particulier lu chez eBay.
