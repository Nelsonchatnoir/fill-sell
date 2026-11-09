# Reprise — terminal « Problèmes », lot de Nico du 08/11 nuit → 09/11 (créneaux du manuel, points 1 et 2)

Suite de `docs/reprise/terminal-problemes-0811-nuit.md`. Heures de Paris. État de prod : `docs/agents/etat-2026-10-01.md`.
Décisions de Nico reçues : « 18 mois » → « 86 » (2-16 ans) VALIDÉ ; confirmation > 50 republications MISE DE CÔTÉ (futur
chantier, rien codé) ; copie 0.6.183-cloud = terminal Cloud ; créneaux et manuel = OPTION B avec exception (ci-dessous).
0.6.183 téléversée au Chrome Web Store par Nico.

## Point 1 — assopmfrance (Pro), Leboncoin « annonce introuvable » — refus JUSTE, mot FAUX ; même famille à tort ailleurs
- Faits : remise en avant groupée (republier_lot, lot 3d02fa38, 21:16:45 → 21:18:09, 222 republications créées) ; refus de
  la fiche 1793885648177 « Écusson pm 123 » sur Leboncoin à 21:17:47 (web) et 21:19:53 (autre appareil).
- Ce que le serveur a répondu : reason `annonce_introuvable` + motif `annonce_vendue` (« cette annonce Leboncoin est
  vendue ») — `republication_annonce_partie` = annonce_vendue (branche du relevé : transaction_plateforme 'sold'). La trace
  de l'app ne gardait que reason (et `res.error`, vide) : d'où « introuvable ».
- L'annonce 3260078076 : importée (job cec1993a, source releve, 05/11 14:34), « Vendu » dès sa 1re lecture
  (`leboncoin_vendu_avant_suivi` = vrai), lue en ligne jusqu'au relevé du 05/11 20:51, ABSENTE des cinq relevés complets
  suivants (06/11 18:15 cron et 18:53 veilleur — constat absence_releves —, 07/11 08:49, 08/11 11:54, 08/11 21:22 :
  199/199). Le « 20:09 » est `last_checked_at` de la veille de l'extension, qui ne l'a PAS lue en ligne (drapeau
  unavailable_since du 06/11 intact : une lecture « active » l'aurait effacé). Aucun relevé à 20:09.
- Classement : NORMAL pour le refus (l'annonce n'est plus en ligne depuis le 06/11), DÉFAUT pour le mot (« vendue » : la
  vente date d'avant le suivi) et pour la trace (motif perdu). Ses autres fiches dans le même cas : 4 annonces
  (3260072464, 3260073440, 3260078076, 3289175453) — refusées à raison.
- Ailleurs (ROUGE, refus À TORT) : 11 annonces Leboncoin importées EN LIGNE, badge d'avant le suivi, jugées « vendues »
  parce que la veille de l'extension a posé `sale_signal 'sold'` (« Article vendu » lu sur la page = le même badge) :
  christopher.boyer30 ×6, jordy.rouleau ×4, lupilou999 ×1 (3004783150 relevée en ligne le 08/11 02:48). La règle du 08/11
  (Jess, 20261108142000) n'écartait que la branche du relevé. 7 jours de traces : 9 refus « annonce_introuvable », 2
  comptes (Jess, réglée le 08/11 ; assopmfrance).
- Correctif :
  - App (web au push, mobile à la prochaine OTA) : `src/utils/traceRefusRepublication.js` — la trace garde
    `reason:motif` (« annonce_introuvable:annonce_vendue »), la phrase du serveur et le numéro ; branché sur republier et
    republier_lot (StockTab).
  - **Migration `20261109010000_vendu_avant_suivi_jamais_une_vente` APPLIQUÉE le 09/11 vers 00:55 (feu vert de Nico, + `migration repair`)** — md5 00b2218f… → 3e7c699e…, verdicts relus en prod = banc :
    CTE `avant_suivi` (Leboncoin, vendu_avant_suivi, ET vue en ligne OU née hors FillSell) lue par les DEUX branches
    (relevé et page). Garde md5 00b2218f… (prod relue le 09/11). Inverse : `supabase/rollbacks/…_INVERSE.sql`.
    Banc jetable 19/19 : `PREUVE_PG=embarque node scripts/essais/20261109010000_banc.mjs`. Effet mesuré sur la prod
    (lecture) : assopmfrance ×4 « vendue » → « plus en ligne » (toujours refusées) ; christopher ×6, jordy ×4, lupilou ×1
    → republiables ; louis ×3, nicolas.menar ×1 (ventes vues pendant le suivi) inchangés.
  - Selftest `selftest:vendu-avant-suivi-republication` (avec PREUVE_PG=embarque : banc compris).

## Point 2 — nicolas.menar (Premium), eBay : 11 publications refusées « identité » — ROUGE (classement), cause prouvée
- Faits : 11 publications eBay voie API (06/11 23:16 → 08/11 23:26 ; 9 le 08/11 en 20 min), errorId 25019, code eBay
  `TRISK_pmts2_Issue_617_Block_BuyingandSellingandm2m`, phrase « … confirmer votre identité ou vos données financières… ».
  Toutes needs_user, source « relancer » posée par le déclencheur `cross_post_jobs_needs_user_motif` (aucune source posée
  par le worker : `needs_user_sans_motif.par` = trigger).
- Cause : `motifReelEbay` ne nommait que la famille KYC_ (relevée le 10/09) ; tout autre code citait la phrase d'eBay
  sans source → « relancer » par défaut → « Relancer maintenant » dans l'app ; et rien ne retenait les publications
  suivantes du compte (chacune retapait eBay). Même défaut sur pièce : USER_ON_HOLD (compte bloqué, 5 publications le
  27/10, rangées « relancer »). Mesure : en base, 3 codes de refus eBay en tout (TRISK ×11, USER_ON_HOLD ×5, KYC ×1).
- Correctif (règle unique `supabase/functions/_shared/ebay-refus-compte.js`) :
  - classement par QUI peut lever le refus : compte chez eBay → `ebay_verification_identite` (KYC_*, TRISK_*, phrase
    identité / données financières FR-EN) ou `ebay_compte_bloque` (USER_ON_HOLD, phrase compte bloqué/suspendu) ; article
    → chemins existants ; passager → pending. Jamais deviné au-delà (code inconnu = phrase d'eBay, comme avant) ;
  - ebay-api-worker : les 4 refus (fiche, offre maj, offre, publication) passent par `parquerSiRefusCompte` (source,
    message, mur daté `ebay_refus_compte.vu_le`) ; AVANT tout appel à eBay, `decisionMurCompteEbay` : sous un mur de
    < 30 j non levé, la publication est retenue sans appel (même source, même message) — sauf l'éclaireur (relancée
    après le mur) ; `murCompteEbayEntretien` à chaque passe : reclasse les anciens refus « relancer » qui portent un
    motif de compte (borné 50, conditionné), relâche les retenues sur PREUVE (publication eBay après leur mur) ;
  - app : lien « Finaliser ma vérification sur eBay » (Seller Hub ; « Régler mon compte sur eBay » si bloqué), relance
    renommée « C'est fait, relancer » avec l'aide « seulement une fois que c'est fait sur eBay » (fiche et carte), la
    relance lève la source (le serveur la repose si le mur tient) ; cause du blocage ; messages en anglais.
  - Selftest `selftest:ebay-refus-compte`.
- Effet attendu au déploiement d'ebay-api-worker : les 11 jobs de nicolas.menar passent en « vérification d'identité
  eBay » au premier passage (message vrai, plus de « Relancer maintenant ») ; ses nouvelles publications eBay attendent
  sans appel ; une relance « C'est fait » part seule, et si eBay l'accepte, les autres repartent.

## Créneaux et republications manuelles — OPTION B avec exception (décision de Nico du 09/11) — CODÉ
- Règle (`supabase/functions/_shared/lot-manuel-creneau.js`, lue À L'EXÉCUTION par get-pending-jobs) : module de
  republication ACTIF sur la plateforme + lot manuel (bulk_batch_id) de PLUS de 10 articles distincts → ses
  republications de cette plateforme ne sont servies que DANS le créneau ; ensuite comme tout manuel (2 min par
  plateforme, pause de 2 h toutes les 50, quotas : rythme inchangé). 1 à 10 articles, unité, module en pause / absent :
  tout de suite, comme avant. Mêmes exemptions que l'automatique (étape deleted, suppression partie, exception de
  créneau). Hors créneau, une tâche née il y a < 90 s (ou d'un lot dont la dernière tâche a < 90 s) attend la fin de la
  création du lot (sinon le passage tombé pendant la création servait les premières tâches).
- Rien n'est créé, annulé ni repoussé : seul `error` (message, à la transition, par 100, 300/passage) ; aucune
  échéance écrite → la tâche reste « en vol » pour `republish_planifiee_sweep` (garde anti-rafale relue en prod le 09/11,
  fixture `scripts/essais/fixtures/prod-0911-sweep/`) → l'automatique reste en pause tant que le lot est en file.
- App : « Ta file » dit « En pause (créneau de republication) » pour ces tâches (get-pending-jobs `lots_dans_creneaux`
  → `ctx.lotsCreneaux`, `_shared/etat-job.js`), l'avancement se compte « de créneau » ; la feuille « Republier N
  articles » le dit avant le clic quand > 10 articles et une plateforme cochée a un module actif.
- Joséphine (lot 77b7bf38 : 299 articles ; créneaux perso 10:00–22:00 sur Vinted, Leboncoin, Beebs, relus le 09/11) :
  son lot tournait à 00:13-00:23 le 09/11 (31 republications en 3 h, hors créneau). Au déploiement de get-pending-jobs,
  ses tâches en attente sont retenues jusqu'à 10:00, sans être recréées ni annulées.
- Selftest `selftest:lot-manuel-creneau` (49 contrôles).
- ⚠️ Interprétation à confirmer par Nico : « avoir des créneaux » = module ACTIF ; un module en pause ou arrêté ne
  retient pas le manuel (sinon le lot ne partirait jamais).
- Mis de côté (décision de Nico) : écran de confirmation au-delà de 50 republications — futur chantier, rien codé.

## En service (09/11, feu vert nommé de Nico)
- Migration 20261109010000 appliquée (~00:55) ; verdicts relus en prod : assopmfrance ×4 « annonce_partie », christopher
  ×6, jordy ×4, lupilou ×1 NULL (republiables), louis ×3 et nicolas.menar ×1 « annonce_vendue » (inchangés).
- Suite complète 648/648 verte (06:28) ; commit c837c27 ; déploiement depuis une archive de HEAD (06:29) :
  get-pending-jobs **v354** (avant v353, verify_jwt true), ebay-api-worker **v121** (avant v120, false).
- Effet vérifié (point 2, 06:30) : les 11 publications eBay de nicolas.menar sont passées seules en
  `ebay_verification_identite` (message « eBay bloque la mise en vente… finalises la vérification »), sans appel à eBay ;
  sa 12e (question de rayon) reste « relancer » (article).
- La suite complète a gelé pendant la nuit (poste en veille) : commit et déploiements faits à 06:2x au lieu de ~01:00 —
  le lot de Joséphine a donc continué hors créneau jusque-là.

- Effet vérifié (créneaux, 06:3x) : au premier poll de Joséphine après le déploiement, 317 tâches de son lot portent
  « Republication de ton lot (plus de 10 articles) en attente de ton créneau… » (borne de ~300 messages par passage, les
  autres suivent) ; la seule tâche servie depuis 06:29 (Leboncoin 1c72f570, 06:31:51) était à l'étape « deleted » (annonce
  déjà retirée : elle va au bout, règle voulue). Les deux dernières publiées (06:21, 06:25) l'ont été avant le déploiement.

## Ce qui attend
- Créneaux : vérifier à 10:00 que le lot de Joséphine repart (créneau ouvert), au rythme de chaque plateforme.
- OTA 2.9.168 (terminal Cloud) : embarque l'app de c837c27 (feuille de republication, file, trace des refus).
- Nico : confirmer « créneaux définis = module ACTIF » (un module en pause ne retient pas le manuel).
