# Suite des décisions du 14/11 (relu 15:10) — urgence af37fa49, points 1 à 6

Heure de Paris partout. Comptes désignés par leur id8. Aucun mail envoyé, rien chez Stripe.

## Urgence af37fa49 (Pro + Cloud) — file arrêtée depuis 14:59:36
- Cause 1 : la file des republications ne sert qu'UNE tâche « capturée » par plateforme (la plus ancienne). C'était la
  copie Vinted d'un article RETENU (copie Beebs retirée le 11/11, jamais recréée) : jamais servie, mais elle gardait la
  place ; chaque passage capturait un article de plus et aucun n'allait au bout.
- Cause 2 : le tour des publications programmées tombait sur Beebs (non connectée au Cloud), servie puis écartée.
- Règle (tous les comptes) : `_shared/file-sans-blocage.js` — une republication retenue ne prend jamais la place de sa
  plateforme ; au poste Cloud, une plateforme non connectée au Cloud ne prend jamais le tour. Cadence inchangée.
  Verrou `selftest:file-sans-blocage` (11/11). Commit 1dd38b9, get-pending-jobs déployé 15:36:55.
- Preuve : publication Vinted 15:38:23, republication Vinted 15:41:42 ; à 17:29, 42 tâches faites depuis le correctif
  (Vinted 4 publications + 24 republications, Leboncoin 4 + 10), dernière à 17:24:49.

## Point 2 — une fiche recréée depuis une annonce non prouvée vivante
- Cause : `rapprocher_importer`, appelé par le moteur de rapprochement, importait une annonce vue dans un relevé « index
  seul » (sans preuve de vie). 85 imports d'annonces retirées en 30 jours.
- Règle : migration **20261114163000_annonce_prouvee_vivante** (APPLIQUÉE le 14/11 vers 17:10, garde md5 sur les corps de
  prod, puis `migration repair`). Nouvelles fonctions `releve_run_index_seul`, `annonce_non_prouvee_vivante` ;
  `rapprocher_importer` refuse avec la raison `annonce_non_prouvee_vivante` ; `rapprochement_v3_lire` marque « perimee ».
  Inverse : `supabase/rollbacks/20261114163000_annonce_prouvee_vivante_INVERSE.sql`.
- Verrou `selftest:annonce-prouvee-vivante` (40/40, base jetable) : cas Beebs (index seul → refus) et cas normal
  Vinted/Leboncoin (relevé complet → import).

## Point 3 — 13e274de, annonces Beebs récentes en 404
Relu le 14/11 vers 17:15 depuis www.beebs.app (`/fr/p/<id>`), témoin 34357926 en 200 InStock.
- **En ligne (200, InStock)** : 34355058 (fiche 1794615789690009), 34355083 (…690007), 34355315 (1794615779815014),
  34355541 (1794615779815019).
- **404, encore rattachées à une fiche** : 34355030, 34355032, 34355084, 34355086, 34355097, 34355100, 34355337,
  34355366, 34355397, 34355451, 34355504 (fiches 17946157…), 34355091 (1794624612019), 34355095 (1794624611972).
- **404, vente en cours de retrait** : 34356253 (fiche 1794649845400002).
- **404, sans fiche** : 34355088, 34355093, 34355591 (jamais en ligne) ; 34355016 (retirée par la cliente via FillSell) ;
  imports 33466824, 33468466, 33468667, 33469875.
- Aucune annonce marquée publiée sans preuve. Les 14 annonces en 404 encore rattachées s'affichent toujours « en ligne
  sur Beebs » dans FillSell ; rien n'est retiré à la main (Beebs à reconnecter : le relevé tranchera).
- Reste : quand Beebs sera reconnectée, le relevé posera les questions « Vendue ? » sur celles qui sont vraiment parties ;
  la veille lit « indéterminé » (une page fantôme rend 404 au fetch, utilisable) ; publier sur la preuve « en vérification »
  reste une décision de Nico.

## Point 4 — compte au Cloud : l'extension du PC ne fait plus rien (13e274de)
- Preuve : 12:44:08.993 GET puis 12:44:09.084 PATCH profiles (journaux edge), User-Agent Windows / Chrome 157 =
  `ecrireExtensionSessions` de l'extension du PC (poste 727410c6, build Store ba13a51) : beebs=false. Le poll du PC à
  12:44:09.937 a posé « session connue morte » sur le premier retrait ; les 5 autres l'ont été aux polls du poste Cloud,
  qui relisaient la valeur écrite par le PC.
- État réel : Beebs est À RECONNECTER dans le Cloud lui-même (relevé Cloud 11:33:24 « reconnexion demandée », coffre
  connecte=false à 11:35:50). 6 retraits retenus : 5 fantômes 404 (27214557, 27214877, 27214883, 27214891, 27214895) et
  34356253 (404 à 17:15).
- Règle (tous les comptes, décidée par le serveur) : `_shared/cloud-voie.js` — compte au Cloud ACTIF = un seul exécutant,
  le poste Cloud. Tout autre poste reçoit de get-pending-jobs une réponse vide avec `compte_cloud` (aucune tâche,
  relevé, commande, lecture de fond, demande de connexion) ; ses sessions ne sont plus notées ; la connexion d'une
  plateforme du Cloud se lit dans `cloud_coffre` ; le message dit « Reconnecte Beebs dans l'app » (jamais Chrome ni
  l'ordinateur). handler-watch lit aussi le coffre. Migration **20261114170000_sessions_poste_cloud_seul** : le PATCH
  `extension_sessions` d'un poste qui n'est pas le poste Cloud est ignoré en base (8/8 comptes Cloud vérifiés : leur poste
  Cloud est reconnu par `cloud_postes.session_fillsell_id` et par le build « -cloud »).
- Extension 0.6.190 : popup « Extension en pause : ton compte utilise FillSell Cloud, tout se fait depuis nos serveurs.
  Elle reprendra toute seule si FillSell Cloud s'arrête. » ; arrêt des tâches de fond propres au PC ; reprise automatique
  (la pause ne vaut que 30 min après la dernière réponse qui l'a dite).
- Verrou `selftest:compte-cloud-pc-en-pause` (53, rouge avant : 45 KO). Banc jetable de la migration : 11/11.
- Préparé, NON joué : `scripts/reparations/20261114_retraits_fantomes_beebs.sql` (+ _INVERSE) — clore les 5 fantômes
  sans attendre la reconnexion ; la règle Beebs exige 2 constats 404 à 6 h d'écart, et Nico décide.

## Point 5 — af37fa49
- a) eBay : le relevé du compte n'était lu que depuis Réglages › Compte eBay (seller_state NUL : « vendeur » conclu sans
  rien lire). Le message suit maintenant l'étape relevée, avec « Créer mes conditions eBay » puis « Ou les créer moi-même
  sur eBay » (https://www.ebay.fr/bp/manage) ; plus jamais « Me connecter » sur un compte relié. Reprise automatique :
  ebay-api-worker relève le compte avant de parquer, et la passe `relireComptesEbayAFinir` (3 comptes au plus par passe,
  barème 15 min → 1 h → 6 h → 1 j, 30 jours) fait repartir les publications dès que le compte est prêt. Verrou
  `selftest:ebay-compte-a-finir` (40, rouge avant : 35 KO).
- b) Beebs « Continuer avec Kiabi » : le vrai hôte `identity.kiabi.com` manquait à la liste des hôtes permis
  (serveur-cloud/src/plateformes.js, liste devinée le 30/10) ; corrigé dans 1dd38b9, orchestrateur 1dd38b99cb5f déployé
  15:39. Enregistrements : /srv/fillsell-cloud/etat/essais/beebs-2026-11-14T13-21-50… à T14-07-02.
