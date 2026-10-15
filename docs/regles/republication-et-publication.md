# Republication, publication (unité et lot), cadence et quotas de republication

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- 16/10 nuit — une seule vérité sur les attentes : six mots d'état, une source, aucun temps estimé (en fin de fichier)
- 09-10/10 — publication en lot : page blanche (ex-L138-146)
- 08/10 — une republication dont la suppression est partie va au bout (ex-L250-263)
- 06/10 soir — une republication ne bute jamais sur une valeur que son annonce porte (ex-L317-322)
- 05/10 soir — gratuit = 50 republications par mois (ex-L329-332)
- 04/10 nuit — défauts clients (marque absente, texte de la fiche, colis) (ex-L347-358)
- 04/10 — cadence (plafond Premium, coin_config journalisé) (ex-L366-367)
- 03/10 nuit — marque, annonce de test, republication (ex-L384-395)
- Publication en lot (03/10) (ex-L453-454)

<!-- ex-CLAUDE.md L138-146 : 09-10/10 — publication en lot : page blanche -->
- **⛔ PUBLICATION EN LOT : PAGE BLANCHE (09/10 22:13 → 10/10, Nico et Louis)** :
  `EcranAvant` lisait `userId` (f06c91f, port Depop, 2.9.70) et `exclusDepop`
  (4b34f9e, 2.9.71) sans les recevoir → tout lot tombait à la fin de la
  préparation (bloc Livraison). Corrigé à la racine : props passées,
  `BarriereErreur` par moteur, article, ligne et bloc (article cassé = mis de
  côté, journal `usage_logs` `lot_article_mis_de_cote` / `lot_bloc_en_erreur` /
  `lot_ecran_en_erreur`), build qui refuse toute variable non définie
  (`selftest:variables-definies`). Poids du lot FACULTATIF comme à l'unité
  (Nico). Aperçu : `node scripts/apercu/capture-lot-publication.mjs`.

<!-- ex-CLAUDE.md L250-263 : 08/10 — une republication dont la suppression est partie va au bout -->
- **⛔ UNE REPUBLICATION DONT LA SUPPRESSION EST PARTIE VA AU BOUT (08/10, Louis)** :
  créneau fermé, plafond ou pause n'y changent rien (`retraitEngage`,
  `_shared/retenue-creneau.js`, `get-pending-jobs` v223) ; la remise en ligne
  n'a lieu que sur PREUVE de la suppression (extension). Migration
  **20261008140000 APPLIQUÉE** (08/10 11:20 UTC) : le balayage ne lance plus une
  republication qui ne peut pas finir dans le créneau (`republish_duree_estimee`).
  Extension **0.6.104** (BUILD_ID `2026-10-08T14:53:27Z+0cec9e6`, chargée chez
  Nico) : zip LIVRÉ (`build/CWS-0.6.104-A-TELEVERSER/` ; preuve de republication
  Beebs levée par Nico — option d, l'échec venait de la modération Beebs) ; un retrait Beebs ne se clôt plus « déjà retirée » pendant la modération
  (annonce jamais vue en ligne, dépôt < 72 h) ; handler-watch v94 relance une
  fois les tâches « sans démarrage » quand le poste a la 0.6.104 : preuve Beebs relue ~6 min par le background,
  aucun essai consommé sans preuve, relevé Beebs par le flux quand « Mes
  annonces » est peinte vide (`selftest:beebs-preuve-relue`).
  Selftest `selftest:republication-va-au-bout`.

<!-- ex-CLAUDE.md L317-322 : 06/10 soir — une republication ne bute jamais sur une valeur que son annonce porte -->
- **⛔ UNE REPUBLICATION NE BUTE JAMAIS SUR UNE VALEUR QUE SON ANNONCE PORTE
  (06/10 soir, dbz70)** : « EU N » ≡ « N » (jamais UK/US/IT/DE) — régression
  ca63277 (0.6.90) ; une valeur servie par le serveur n'atteint le formulaire
  qu'à une (re)capture (handler-watch recapture une fois) ; un remplissage
  lent mais vivant n'est jamais coupé (port de remplissage allumé pour un
  compte coupé à 5 min) ; une marque d'origine se reconnaît par son id.

<!-- ex-CLAUDE.md L329-332 : 05/10 soir — gratuit = 50 republications par mois -->
- **⛔ Gratuit = 50 republications PAR MOIS** (05/10 soir, Nico ; plus « à vie ») :
  coin_config `quota_republication_free`, même cycle que `quota_annonces_free`
  (`debut_cycle_quotas` → `coin_wallets.next_grant_at`), compteur unique
  `quota_republication_free_etat` (exécutées + en file), mig 20261005173000.

<!-- ex-CLAUDE.md L347-358 : 04/10 nuit — défauts clients (marque absente, texte de la fiche, colis) -->
- **Défauts clients (04/10 nuit)** : une vente supprimée par la personne ne
  revient plus au relevé (`ventes_supprimees`, mig 20261004220000) ;
  l'absence de marque part en « Sans marque » sans question
  (`_shared/marque-absente.js`, liste FERMÉE, jamais une vraie marque) et la
  marque du catalogue choisie est retenue (`platform_settings.vinted.
  marques_retenues`) ; le texte qui part est celui de la FICHE au moment de
  l'envoi (`src/publication/texteDeLaFiche.js`) ; ⛔ aucun format de colis
  deviné (seul `format_colis_source: 'manuel'` part ; poids de la fiche et
  transporteurs retenus `platform_settings.leboncoin.transporteurs` posés au
  service ; lot : poids FACULTATIF depuis le 10/10, comme à l'unité — sans
  poids, Leboncoin et Beebs gardent leur estimation) ; prix/quantité des
  fiches modifiables en lot — les annonces en ligne ne suivent pas.

<!-- ex-CLAUDE.md L366-367 : 04/10 — cadence (plafond Premium, coin_config journalisé) -->
- **Cadence (04/10)** : plafond Premium **50**/jour ; tout changement de
  `coin_config` est daté et journalisé (`coin_config_journal`).

<!-- ex-CLAUDE.md L384-395 : 03/10 nuit — marque, annonce de test, republication -->
- **Marque (03/10 nuit)** : une réponse partagée atteint TOUTE plateforme qu'elle
  nomme (`moteur/reponsesPartagees.js`) ; la marque de la fiche n'est jamais
  redemandée ; ⛔ Vinted ne crée PLUS de marque libre (03/10) : marque exacte
  du catalogue, sinon une QUESTION, jamais « Sans marque » en silence.
  ⛔ Annonce de test : 999 € ou plus, jamais le tableau de Nico. **Republication** : âge et prix repris de L'annonce en ligne.
  Question « Marque » hors catalogue (`src/annonces/QuestionMarque.jsx`) : le
  pourquoi, « Sans marque » en un tap, recherche dans le catalogue Vinted
  (commande `CHERCHER_MARQUE`, 0.6.94) ; « Sans marque » jamais écrit sur la
  fiche. **Republication (0.6.94)** : l'annonce est RELUE avant tout retrait
  (`champs_lus_sur_l_annonce.lus`), la taille affichée l'emporte sur la copie
  (gpj v205). Exception de créneau : `creneau_exception` bornée, posée par
  réparation sur décision de Nico seulement.

<!-- ex-CLAUDE.md L453-454 : Publication en lot (03/10) -->
- **Publication en lot (03/10)** : livrée ; `docs/publication-en-lot.md` ;
  migration 20261003010000 (un arrêt ne repart jamais) appliquée.

## ⛔ PLUS AUCUN « GESTE À FAIRE » QUE L'APP PEUT TRANCHER SEULE (15/10 soir, Nico)
- Une publication ou une republication lancée PART ; une question seulement si aucune donnée fiable n'existe
  (`_shared/questions-tranchees.ts`, handler-watch).
- **Boutique Vinted** (`_shared/boutique-publication-vinted.js`) : article lié → sa boutique ; sinon la boutique
  changée dans la file, puis la boutique par défaut (Réglages › Mes plateformes, `platform_settings.vinted.
  boutique_defaut`), puis la boutique ouverte dans le navigateur à l'envoi. Jamais une boutique hors du compte ;
  l'extension relit la boutique avant le dépôt. Plus de question « boutique_a_choisir ».
- **État** (`_shared/etat-correspondance.js`) : annonce capturée → fiche → autres plateformes, traduit dans la
  grille demandée ; jamais deviné (« État neuf » ≠ « avec / sans étiquette »).
- **Sans objet** : publication/republication non engagée d'un article à vente ENREGISTRÉE, republication
  orpheline → annulées, rien retiré.
- **Poids Leboncoin exigé** (compte PRO, « Poids du colis* » sans estimation) : noté sur preuve
  (`platform_settings.leboncoin.poids_exige`) → « Saisir le poids » d'office au lot et à l'unité, gpj ne sert
  jamais une publication sans poids ; « un poids pour tout le lot » règle aussi la question en tranche et les
  annonces du lot en file, modifiable article par article. Jamais une tranche apprise « sans format ».
- **La file** : le bouton mène à l'action en un tap (Répondre → mini-éditeur) ; AUCUNE heure ni durée promise
  (`sansEstimation`) ; une attente automatique (relevé à venir, pause technique avant retrait, eBay étranger,
  plateforme écartée) est une pause, jamais un geste.

## 15/10 soir (3) — clôture du rouge (rapport `docs/enquetes/cloture-rouge-1510/RAPPORT.md`)
- **Jamais un deuxième dépôt Beebs à l'aveugle** (`_shared/depot-sans-numero.js`, gpj v252+) : une publication Beebs
  dont le dernier essai a PU partir (essai commencé sans fin relevée, formulaire muet après le clic, « non confirmé »
  avec une requête captée) est retenue : relevé du compte demandé, puis annonce apparue depuis (reliée à rien,
  numérotée après l'essai) aux photos de NOTRE copie → rattachée, aucune → redépôt autorisé (`depot_verifie`),
  doute → question (`depot_deja_parti`, une relance de la personne vaut réponse). « Non confirmé » SANS aucune
  requête = rien n'est parti : un nouvel essai n'est pas à l'aveugle.
- **Toute remise en ligne Beebs part avec ≥ 5 caractères de description** : la sienne (annonce capturée) → celle de
  la FICHE → les faits du job. Couleur/matière ajoutées aux publications seulement.
- **Une recréation bloquée repart seule quand la cause est levée** (`_shared/recreation-bloquee.js`,
  `CAUSES_LEVEES_PAR_LE_SERVEUR`, handler-watch v110+) : une fois par cause et par job, jamais sur une cause du
  compte ; message vrai sans durée.
- **Dépôt muet** (handler-watch v110+, `_shared/depot-muet.js`) : l'attente se compte depuis la DERNIÈRE REMISE EN
  FILE (création, fermeture précédente, `remis_en_file_le` posé par la base sur needs_user/failed/cancelled →
  pending — mig 20261015210000 —, relance de l'app, archive de relance). Une reprise technique n'en est pas une.
- **Feuille Leboncoin** (`_shared/lbc-feuille-corrigee.js`, gpj) : publication rangée dans une feuille Maison &
  Jardin sans paire réelle (fourre-tout) et dont aucun Produit n'est nommé dans l'annonce, quand UNE seule autre
  feuille porte un Produit nommé → cette feuille, avec sa paire (lampe Accolay → Décoration › Éclairage › Lampe à
  poser). Deux candidates : rien ne bouge.
- **Mots-clés Leboncoin** (décision de Nico, 15/10, remplace le 10/09) : une ligne « Mots-clés : / Keywords : /
  Tags : » compte dans les 5 ; au-delà (avec les hashtags restants), elle part du texte ENVOYÉ.
- **Marque Vinted hors catalogue** (ujs v137, gpj v252, extension 0.6.114) : la question « Sans marque ou une
  marque du catalogue » part UNE fois avant toute suppression (plus de reprise ni de champ retiré) ; la réponse
  (rangée sur l'article, servie en `marque_choisie`) prime sur la marque capturée à la recréation, l'ancien
  brand_id n'est plus transmis. NON fait : poser le brand_id capturé dans le corps de la recréation (« reprendre
  exactement l'annonce ») — exige un essai réel sur le compte de Nico avant (la recréation suit la suppression).

## 16/10 nuit — UNE SEULE VÉRITÉ SUR LES ATTENTES (mission de Nico ; détail `docs/refonte/etape-1-attentes.md`)
- **Six mots, les mêmes partout** (app, extension, serveur, mails) : **En file** (ça partira seul, à son tour) ·
  **En cours** · **Fait** · **À toi de jouer** (question, connexion, autorisation, publication pas partie à relancer) ·
  **En pause** + la raison en une ligne (retenue, boutique à ouvrir, limite du jour, créneau, nouvel essai automatique,
  ordinateur éteint, mise à jour…) · **Arrêtée** (annulée, vendue, doublon). Chaque statut technique → UN mot
  (`ETATS`, `LIBELLES` de `supabase/functions/_shared/etat-job.js`). Interdits : « En attente », « Dans la file »,
  « Échec » pour un simple ré-armement, tout mot nouveau.
- **Une seule source** : `etatJob(job, ctx)` décide ; l'app (`src/utils/fileDesJobs.js` → FileDesJobs, barres,
  pastilles, EcranSuivi, SuiviLot, LotPublication, StockTab) et le popup de l'extension (copie GÉNÉRÉE
  `chrome-extension/etat-job.js`, `npm run gen:etat-job-extension`, divergence refusée par `selftest:etat-job`)
  ne font qu'afficher. Une nouvelle situation = une ligne dans `etat-job.js`, jamais un calcul local.
- **Plus AUCUN temps estimé devant la personne** : ni durée (« ~5 min », « quelques minutes », « toutes les 2 min »),
  ni heure prévue (« vers 14:05 », « prochain créneau à… »), ni compte à rebours (« Renvoyer dans 30 s »). On dit
  ce qui se passe et ce qui fera repartir ; `humanizeJobError` passe tout texte de job par `sansEstimation`
  (filet pour les anciens textes en base). Garde : `npm run selftest:aucune-estimation` (0 ligne, sources app +
  extension + serveur + mails). Gardés et marqués `estimation-ok:` : les faits passés (« depuis le 14/10 »), les
  dates imposées par un tiers ou un contrat (restriction Vinted « jusqu'au JJ/MM », relance Stripe, fin d'essai),
  les réglages eBay (retours sous 30 jours).
- **Loaders** : la phrase dit l'étape réelle (« Dépôt en cours sur Vinted, dans ton Chrome… »), jamais un délai ;
  Synchroniser = plateformes terminées sur visées + une ligne par plateforme. Ouvert (décision de Nico) : le
  pourcentage animé de `BarreProgression` (glisse sur des durées médianes) — maquette « étapes sans % » proposée.
