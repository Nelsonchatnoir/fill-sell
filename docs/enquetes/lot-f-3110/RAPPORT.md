# Lot F — 31/10/2026 : Sébastien, Johan, pause, fausse alerte, republication sur un ancien numéro

Heure de Paris partout. Commits : `7553d9b` (code), `4f9899b` (extension, marqueurs de progrès), `f6c27f2` / `39270cc`
(recalages d'`EXTENSION_LAST_COMMIT`), `d5bd65b` (garde de la cible : deux exemplaires en ligne = attente), `3876dc8`
(OTA 2.9.140). Extension **0.6.162** (zip : `build\CWS-0.6.162-A-TELEVERSER\fillsell-extension-0.6.162-cws.zip`).
Selftest neuf : `selftest:lot-f-3110` (76 vérifications, code livré exécuté). Suite complète **502 / 0 rouge** (11:20, sur d5bd65b).

## 1. Sébastien (sebastien64310, Business) — mise à jour 0.6.161 à moitié faite

### Ce qui s'est passé (journaux des fonctions, passerelle REST, usage_logs, vinted_sync_runs)
- 03:16:54 : dernier poll avant la nuit (3 jobs servis, 26 retenus « au compte-gouttes »), puis plus rien jusqu'à 06:27
  (poste en veille ; aucun battement).
- 06:27:20 : poll de la **0.6.159** (session d'extension `2ac92f1f`) → 19 jobs servis. Ce worker ne fait ensuite plus AUCUN
  appel (aucun job démarré) : il est arrêté, et Chrome installe la 0.6.161 en attente. Aucune trace « rechargement » :
  les 29 journaux `maj_extension` du parc en 0.6.161 viennent tous de NOTRE rechargement ; celui de Sébastien est le
  chemin « Chrome seul ».
- Le nouveau worker 0.6.161 démarre **quatre fois** — 06:31:12 (« Synchroniser » sur la page : relevé Vinted direct,
  échec « sonde de session Vinted : erreur réseau : Failed to fetch » dans l'onglet Vinted à 06:31:18), 06:34:07,
  06:39:19 (reconnexion de la page FillSell), 06:41:29 — chacun visible par sa lecture de démarrage
  (`needs_user_source=eq.depop_acces`), et **jamais un poll**, jamais un réveil toutes les 2 min ni toutes les 30 s.
- Cause : **plus aucune alarme**. Chrome efface les alarmes d'une extension à sa mise à jour ; nous ne les reposions que
  dans `runtime.onInstalled` / `onStartup`, et ce worker n'a pas reçu `onInstalled` (aucune trace « installée », aucune
  alarme de 30 s qui l'aurait tenu éveillé). Sans alarme : pas de poll → pas de ping (`extension_version` reste 0.6.159,
  `extension_last_seen_at` figé à 06:27:20), pas de journal `maj_extension` (envoyé en FIN de poll, et son « installée le »
  posé par `onInstalled`), réservations de 03:16 expirées, relevés Leboncoin/Beebs/Depop restés « queued ».
- Ce n'est PAS un PC éteint : la page FillSell du PC (session web `4bdccd42`) appelle le serveur toutes les 2 min de
  06:39 à 08:20 au moins.

### Correctif (extension 0.6.162, `chrome-extension/background.js`)
- À **chaque démarrage** du worker (quel que soit l'événement qui le réveille) : alarmes reposées (`creerAlarmeSiBesoin`,
  rien si elles existent), puis **mise à jour constatée sans `onInstalled`** (`constaterVersionAuDemarrage` : version vue
  en `storage.local`, ou trace de rechargement laissée par l'ancienne version) → journal `maj_extension` complété
  (`constatee_au_demarrage`) et envoyé tout de suite, pont de la page réinjecté, poll dans les 5 s (la version arrive
  dans profiles au premier ping).
- **Veille du poll** (`veillerPoll`, au démarrage, à chaque alarme, à chaque appel de la page) : aucun poll réussi depuis
  8 min et personne ne tient le verrou → alarmes reposées, poll relancé. Verrou tenu 40 min **sans job commencé ni
  progrès** → **rechargement propre**, jamais pendant un job commencé, une republication retirée (mémoire) ni quand la
  base dit un job en vol, une republication à l'étape « deleted » ou un relevé en cours (`raisonsDeNePasRecharger`) ;
  **2 rechargements par 6 h au plus** (plafond journalisé) ; trace `extension_redemarrage_auto`.
- Le dernier poll réussi est noté (`fillsell_dernier_poll_ok`, survit aux redémarrages du worker).
- Rien changé côté serveur à la règle « extension muette = PC fermé » : un PC fermé n'exécute aucun de ces chemins.

### Preuve sur le poste de Nico (essai réel, `scripts/essais/20261031_lot_f_test_maj_file_nico*.sql`)
- Harnais (copie d'essai, jamais livrée) : la 0.6.162 avec `onInstalled` neutralisé et les alarmes effacées au premier
  démarrage — le cas exact de Sébastien. File de Nico en pause, **4 publications de test à 999 € en attente**.
- 10:23:17 copie posée ; **10:23:51** la 0.6.161 se recharge seule (copie de développement, « au premier moment sûr ») ;
  **10:23:52** le nouveau worker constate la mise à jour et envoie `maj_extension` (`constatee_au_demarrage: true`,
  `jobs_en_attente: 4`, 0.6.161 → 0.6.162) ; **10:23:55** premier poll ; `profiles.extension_version` = 0.6.162 ;
  **10:24:53** poll de l'alarme RECRÉÉE (une minute après le démarrage : le délai de création) ; puis toutes les 2 min.
- Reprise de la file à 10:25:37 → les 4 publications parties seules avec la 0.6.162 : Depop 10:27:07
  (`nels2nchatnoir-annonce-de-test-fillsell-lot-8c9d`), Beebs 10:28:11 (34269931), Leboncoin 10:29:31 (3298926422),
  Vinted 10:30:37 (10604289204).

## Non-régression sur le poste de Nico (compte de Nico, annonces de test à 999 €)
- **Mise à jour avec file en attente** : ci-dessus (harnais, cas Sébastien).
- **Pause puis reprise** : pause (bouton de l'app) à 10:33:30 au milieu des 4 republications ; polls de 10:33:57 et
  10:34:53 : « file EN PAUSE → 4 gardées, 0 distribué » ; la capture Leboncoin déjà commencée est allée au bout ; aucune
  annonce retirée pendant la pause (aucun `deleted_at`) ; reprise à 10:35:11.
- **Republication** (`20261031_lot_f_test_republications_nico.sql`) : Vinted 10604289204 → **10604418731** (10:42:17),
  Depop `…-8c9d` → **`…-ec19`** (10:45:07), Leboncoin 3298926422 → **3298959829** (10:55:57). Beebs : la recréation
  n'a pas eu lieu — l'annonce déposée à 10:28 n'était pas encore rendue par Beebs (vérification de Beebs), la garde
  existante « pas de retrait sans recréation garantie » a mis la republication en attente, **rien n'a été retiré**.
  Le parcours Beebs complet n'est donc pas prouvé ce jour (la garde, elle, l'est).
- **Vente + retrait des copies** (`…_test_vente_nico.sql`, vente déclarée par `enregistrer_vente_atomique`, pas réelle) :
  fiche 1793438600000 vendue sur Vinted à 10:46:41 → job Vinted `sold`, retrait Depop armé sur `…-ec19` à la même
  seconde → `deleted` ; la republication Depop close « retrait ciblé, pas une vente ».
- **Relevé + rattachement** (`…_test_releve_nico.sql`, geste « Synchroniser » Leboncoin et Depop) : relevés de 10:59 à
  11:00, 17/17 annonces lues ; Leboncoin 3298959829 rattachée PAR SON NUMÉRO (source `job`) à sa fiche 1793438600001,
  aucune fiche neuve.
- **Mise à jour sans file** : build livré (2026-10-31T09:31:55Z+3876dc8, sans harnais) copié à 11:01:07 ; à 11:04:57
  rechargement sûr « fin de cycle », 11:04:58 `maj_extension` (`jobs_en_attente: 0`, 39270cc → 3876dc8),
  `profiles.extension_build` à jour, poll suivant à 11:05:04.
- **Fin** (`…_test_FIN_nico.sql`) : retraits des annonces de test restantes (Vinted 10604418731 retirée à 11:08 par
  3876dc8, Leboncoin et Beebs à 11:09) et file de Nico remise EN PAUSE comme il l'avait laissée. La republication Beebs
  en attente est restée ouverte après le retrait de son annonce (le retrait ne clôt que les jobs « en ligne ») :
  fermée par le geste « Annuler » de « Ta file » (`…_test_FIN2_nico.sql`). Aucun job de test ouvert.

## 2. Fausse alerte « extension sur un autre compte »

- Cause : la présence (`__fillsellExt`) est annoncée par le PONT de la page, qui répond même quand le service worker
  est muet ; la règle du 15/10 concluait « autre compte » d'un simple silence (6 min sans passage, confirmé 3 min plus
  tard). Johan : son extension pinguait (polls 01:16, 01:33, 01:49, 02:05, 02:23, 02:51 le 31/10 — cycles longs), alerte
  à 02:49 (« vue il y a 16 min ») 19 s avant le poll suivant ; Sébastien : worker muet après sa mise à jour ;
  nicolas.menar, sos.cuisine : silences.
- Correctif : le pont (0.6.162) demande au service worker pour **quel compte** il travaille (`FILLSELL_ETAT_COMPTE` :
  oui / non / inconnu, jamais l'identité de l'autre compte) et le dit à la page (`__fillsellCompte`). L'app
  (`useExtensionAutreCompte`) n'affiche « autre compte » que sur **`meme: false`** ; un silence confirmé donne
  « **Ton ordinateur ne répond pas** » dans « À régler », sans durée, sans bandeau (`texteExtensionMuette`). Une
  extension ≤ 0.6.161 ne peut plus déclencher « autre compte ». Journal : `extension_autre_compte` (preuve) /
  `extension_muette` (silence).
- Les deux cas prouvés par le selftest (pont joué dans une fausse page : `meme: false` → « autre compte » ; service worker
  muet 4 s → `vivant: false`, jamais « autre compte ») et par l'état pur `etatExtensionDuNavigateur`.
- À regarder (non corrigé ici) : le battement de 5 min de Johan n'a pas tourné pendant ses cycles longs de la nuit
  (`battement_le` resté au 30/10 14:36).

## 3. La pause de file (tiblancdeshaut, Pro)

- **Tenue** : depuis sa pause (30/10 14:59), chaque poll écrit « file EN PAUSE → 74 publication(s)/republication(s)
  gardée(s) ». Les deux recréations passées après — **7ff873c5** (19:44) et **098cab75** (19:47) — avaient leur annonce
  **déjà retirée** le 26/10 14:49:52 et le 27/10 09:41:50 (`deleted_at_serveur`), AVANT la pause : c'est l'exception
  admise (une republication retirée va au bout). Remises en file à 19:39 / 19:42 par la règle « recreated sans numéro »
  du lot E, recréées à 19:44 / 19:47 (3298559628, 3298562510).
- **Contradiction** : quand une retenue « une annonce hors ligne à la fois » se levait, get-pending-jobs écrivait
  « En file : ta republication passera à son tour… » sur les republications du compte, **pause ou non** — d'où les 73
  lignes « En file » ; et l'écran (`etat-job`) avait sa propre définition de « republication engagée ».
- Correctif : une seule règle (`jobRetenuParPause`, `_shared/file-pause.js`) pour le serveur, l'app et le popup
  (copie générée) ; « **En pause à ta demande** » sur la ligne du job (texte écrit par le serveur pendant une pause),
  la feuille « Ta file », les compteurs (« N en pause à ta demande »), les barres, « À régler » et le popup ; à la
  reprise, ces lignes repassent « En file » (24 h après la reprise, lignes concernées seulement).
- Sa pause n'a pas été levée, aucun de ses jobs touché.

## 4. Republication d'une annonce qui a déjà changé de numéro (Johan, Leboncoin)

### Qui a recréé ?
- **Pas FillSell** : aucun job de dépôt Leboncoin de Johan à ces heures ; les 164 jobs « publish » des numéros
  3297…/3298… sont des lignes de RELEVÉ (`handler_build = releve-annonces`). Son extension faisait, de 15:00 à 15:11,
  87 RETRAITS Vinted (créés par lui de 14:57 à 15:09), rien sur Leboncoin.
- Deux vagues sur son compte Leboncoin : 29/10 17:13 → 17:22 et **30/10 15:10:29 → 15:28:28 (84 annonces, une toutes les
  ~10 s)**, juste après sa pause de 14:59 ; mêmes fichiers photo Leboncoin (même empreinte dans l'adresse), prix parfois
  baissé, une photo ajoutée parfois ; ~86 annonces en ligne avant comme après (remplacement, pas ajout). Un geste de masse
  depuis son compte (outil de Leboncoin ou d'un tiers) : **à demander à Johan** (aucun mail envoyé).

### 4a. La règle : jamais un retrait sur un numéro périmé
- `_shared/republication-cible.js` + get-pending-jobs (après la pause, avant l'étape qui retire) : republication pas encore
  engagée sur Leboncoin, Depop, Beebs → numéro visé absent du **dernier relevé probant** (`releve_preuve_absence`) alors
  qu'il existait avant, et fiche portant UNE annonce vue dans ce relevé (deux ou plus = deux exemplaires : attente, jamais
  une clôture sur un doute) → **close « déjà remise en ligne »**
  (`cancelled` + `republication_sans_objet`, « rien n'a été retiré ni recréé ») ; sans successeur → **retenue avant tout
  retrait** (`cible_absente_releve`, jamais sur Beebs) ; elle repart si un relevé revoit la cible. L'app la dit « Fait »
  (jamais « arrêtée ») et ne la propose pas « à relancer ».
- Pourquoi c'est nécessaire : servie telle quelle, la republication aurait vu l'annonce « déjà absente » (retrait acté)
  puis recréé la copie capturée → un doublon sur Leboncoin.
- Johan (calculé sur ses 32 republications Leboncoin en file, après la réparation) : **30 closes « déjà remise en ligne »**
  à la reprise de sa file, **2 retenues** (Chemise Robe di Kappa 3291778726, Veste de ski Dare2B 3293851082 : aucune annonce
  vue au dernier relevé) — rien ne part tant que sa file est en pause.

### 4b. Les 12 articles importés en double
- Cause : la règle v23 « republication » (même annonce publiée deux fois) exige TOUT identique : chaque photo (même
  nombre), titre, description, **prix**. Johan change le prix en recréant (Michael Kors 25 → 20 €, Pull & Bear 5 → 3 € avec
  une photo ajoutée en couverture) : la règle échoue ; « jamais deux annonces d'une plateforme dans un groupe » isole la
  nouvelle annonce ; trois annonces sur les mêmes photos (ancienne + deux recréations) passent pour un « vendeur de lots »
  (« rien ») ; le moteur décide « nouveau » → `creer` : une fiche entre au stock pour un doute (contre la règle du 07/10).
  Et le filtre de couverture (`paireAretes`) ne comparait même pas deux annonces dont la première photo diffère.
- Correctif du moteur (`_shared/rapprochement/moteur.js`) : la **succession** — deux annonces d'une même plateforme aux
  mêmes photos (≥ 2 quasi identiques), titre proche sans conflit, jamais vues par le même relevé (`run_id` différents) —
  n'est plus « deux exemplaires » ni « lots » : l'annonce ouverte devient la **question « Est-ce le même article ? » vers
  la fiche d'origine, hors du stock** (`a_verifier`, motif `remise_en_ligne_meme_plateforme`), jamais une fiche neuve.
  Deux annonces en ligne ensemble restent deux exemplaires (« Annonce en double ? », lots : inchangés) ; la republication
  v23 identique reste rattachée automatiquement. Pour deux annonces successives, la couverture est aussi comparée à la
  2e photo de l'autre (trois lectures au plus).
- **Fusion des 12 par le chemin de l'app** (`scripts/reparations/20261031_johan_doublons_lbc_fusion.sql`, essai à blanc
  puis exécution, sauvegardes `_backup_3110_johan_doublons_*`, inverse `…_INVERSE.sql`) : les 13 questions DÉJÀ posées par
  le moteur reçoivent « Oui, c'est le même article » par la fonction du bouton (`inventaire_doublon_decider`, au nom du
  compte ; trace `usage_logs reparation_lot_f_doublons_lbc`). Preuve exigée et vérifiée pour chaque paire avant écriture :
  même titre, même description, **toutes les photos Leboncoin de l'ancienne annonce présentes à l'identique** dans la
  nouvelle, jamais en ligne ensemble. 12 articles, **13 fusions** (Pull & Bear : deux fiches en double). La « Veste
  Lacoste » est prouvée par l'annonce précédente de la fiche (3292499783, mêmes 7 photos) : la republication FillSell avait
  changé sa couverture. Aucune plateforme touchée, aucun job relancé, sa pause intacte.

### 4c. Mesure sur tout le parc (31/10 ~10:00)
- Republications en file, pas encore engagées, dont le numéro visé est absent du dernier relevé probant :
  **Leboncoin 33** (Johan 32, jocaille270779 1 — numéro jamais vu dans aucun relevé), **Beebs 0**, **Depop 0**.
  La règle 4a s'applique à tous les comptes, à leur prochain poll.

## Ce qui reste
- **Déploiement** de get-pending-jobs et rapprochement : refusé par le classifieur de Claude Code (« Production
  Deploy ») — lignes données à Nico. Tant qu'il n'est pas fait, les règles 3 (texte serveur), 4a et 4b ne tournent pas
  en production (l'extension 0.6.162 et l'app n'en dépendent pas).
- `republication_engagee` (SQL) compte l'étape « captured » (republication simplement en file) : tant qu'une
  republication attend, l'ancienne annonce n'est jamais datée disparue (`constater_absences_releve`). Migration à
  décider par Nico (non écrite en prod).
- Rattacher AUTOMATIQUEMENT une succession prouvée (prix changé) demanderait d'élargir la garde de la base
  (`rapprochement_republication_prouvee`) : migration à décider ; aujourd'hui, une question hors stock.
- Johan : demander qui a recréé ses annonces Leboncoin (29/10 et 30/10) ; battement de présence muet pendant ses longs
  cycles (à regarder).
- Vu pendant les essais (hors lot F, non corrigé) : un retrait ciblé depuis l'app ne clôt que les publications « en
  ligne » de la plateforme (`cancelPublishAfterDelete`) ; une republication EN ATTENTE de la même annonce reste ouverte
  (elle échouera « plus en ligne », sans rien retirer). À décider.
- Parcours Beebs complet de republication non prouvé ce jour (annonce neuve encore en vérification chez Beebs).
- ritthik2003 : poste déclaré « Microsoft Basic Render Driver » → traité comme machine virtuelle (jamais Leboncoin)
  depuis la 0.6.161 : à vérifier (un PC réel sans pilote graphique le montre aussi).
