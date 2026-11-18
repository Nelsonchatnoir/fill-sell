# Lot du 18/11 soir — T2 : bugs (Cloud, créneaux, mails de vente, Leboncoin, eBay)

> Ordre de Nico du 18/11 (7 points). Heure de Paris partout. Comptes par leur id8. Annexes (enquêtes complètes des
> agents, anonymisées) : `p3-mails-de-vente.md`, `p4-leboncoin-nom-prenom.md`, `p5-ebay-rayon.md`,
> `p6-leboncoin-refus.md`, `p7-ebay-acces-retire.md`.

## 1. Clients Cloud : plus aucune mention de l'extension
- **Cause** (prouvée en base le 18/11 ~21:40) : 462 tâches en attente de 3 comptes Cloud (2f8b09d2 : 260, a962a59e : 196,
  un 3e : 7) portaient « …si Chrome est ouvert sur ton ordinateur à ce moment-là ». Trois trous :
  1. get-pending-jobs écrivait les retenues de créneau, de lot et de pause avec le texte de l'extension pour TOUT compte ;
  2. la fenêtre de la tâche (`jobErrorSansFaussePromesse`, utils/shared.js) montrait le texte BRUT d'une tâche vivante :
     le filtre Cloud (`texteTacheCloud`) n'y passait jamais — c'est ce que voyaient les clientes ;
  3. le filtre retirait la PHRASE entière qui nommait Chrome (« elle partira dans ton créneau » disparaissait, il ne
     restait que « Ton annonce est intacte, rien n'a été retiré. »).
- **Correctif (la règle, un seul endroit)** : `supabase/functions/_shared/texte-voie.js`, `texteSelonVoie(texte, { cloud,
  nom, lang, executant })` — sans Cloud, le texte à l'octet ; au Cloud, les conditions du poste sont remplacées DANS la
  phrase (« — FillSell Cloud s'en charge, rien à faire de ton côté »), puis toute phrase qui renvoie encore au navigateur
  ou à l'ordinateur devient le seul geste possible (reconnecter au Cloud, résoudre la vérification dans l'app, le geste
  de compte « depuis ton téléphone ») ou part ; eBay par l'API dit « FillSell » (nos serveurs). Appelants :
  get-pending-jobs (retenues écrites selon la voie : `posteCloud || cloudVoie === true`) ; l'app par UNE porte,
  `texteTacheSelonVoie` (humanizeJobError ET la fenêtre de la tâche, toutes les tâches du compte Cloud, eBay compris) ;
  l'écran des créneaux (RepublicationPlanifiee : la sortie de `synthese` et les phrases du nombre attendu) ; la note push
  du créneau (point 2). `cloud/voieCloud.js` `texteTacheCloud` ne décide plus rien (il appelle la règle).
- **Rattrapage** : par le circuit, sans script — get-pending-jobs compare chaque retenue au texte de la VOIE : les 462
  textes déjà posés sont réécrits au passage suivant du poste Cloud (≤ 300 par passage). À relire après déploiement.
- Mails : déjà réglés le 15/11 (`_shared/mails-compte-cloud.js`, welcome et « comment ça marche » ; relances à
  l'ordinateur jamais au Cloud). Notifications : seules les ventes et la place Cloud existent — aucune ne nomme le poste.
- **Preuve / verrou** `selftest:cloud-jamais-ordinateur` : rouge sur HEAD 86a0297 (17 échecs sur 22 : les 51 textes du
  poste des corpus réels ressortent tous avec « Chrome / ordinateur », la fenêtre de la tâche montre le brut,
  humanizeJobError ne garde que « Ton annonce est intacte… »), vert après (21/21).
- **Reste** : les écrans hors tâches (alertes rares « extension jamais vue » de Réglages › republication, etc.) passent
  désormais par la même règle quand ils sont dans `synthese` ; un écran neuf qui parle du poste doit appeler
  `texteSelonVoie` (règle écrite dans `docs/regles/plateformes.md`).

## 2. Créneaux
- **Lot hors créneau** : la feuille « Republier » dit, par plateforme, « partira demain à partir de 19:00 » (début du
  créneau lu au serveur : `fenetre.prochain_debut` ; « ton créneau est ouvert, ils partent maintenant (jusqu'à 22:00) »
  sinon) et propose **« Lancer maintenant »** (pour CE lot : il part tout de suite, au rythme habituel de chaque plateforme
  — le même qu'un lot de 1 à 10 articles ; rien d'autre ne change dans la cadence) et **« Changer le créneau »** (réglages
  de la republication). La file dit « En pause (créneau de republication) : ton lot partira demain à partir de 19:00, au
  rythme habituel ». Choix : `platform_settings.lots_maintenant = { <bulk_batch_id>: ISO }` (platform_settings_fusionner,
  écrit AVANT la première tâche), lu par get-pending-jobs avec la taille du lot (`_shared/lot-manuel-creneau.js` :
  `lotsLancesMaintenant`, `retenueLotManuel` motif `lance_maintenant`) ; 7 jours au plus ; écriture ratée = le lot suit son
  créneau (tracé `lot_maintenant_non_pose`). Exception NOMMÉE à « aucun temps estimé » (16/10) : l'heure de DÉBUT du
  créneau, comme pour les programmées (12/11).
- **Note push** « C'est l'heure de ton créneau » / « Tes annonces repartent : 260 republications sur Vinted, au rythme
  habituel — FillSell Cloud s'en charge… » (au PC : « …si Chrome est ouvert sur ton ordinateur à ce moment-là ») :
  `_shared/push-creneau.js` (pur) + republish-auto-sweep (cron */3) : créneau ouvert depuis < 15 min ET lot retenu qui
  l'attend sur cette plateforme ; une par compte et par ouverture (clé jour:heure), aucune si une autre est partie dans
  l'heure, au plus une par passage ; trace `usage_logs` « push_creneau_lot » posée AVANT l'envoi. Lectures mesurées en
  prod (EXPLAIN ANALYZE) : créneaux 1,6 ms (index user_debut), tâches 2,8 ms, lots 4,7 ms, traces 0,15 ms.
- **Victorine (a962a59e), créneaux « posés à la même seconde »** : PAS automatique. Journaux du 16/11 : 8 appels
  `republish_planifiee_regler` de son Android entre 15:41 et 15:42 (juste après le début de son essai Cloud, 15:39 : elle a
  réglé Vinted soir, Beebs midi, Leboncoin matin), puis 2 appels `republish_planifiee_pause_generale` à 18:30:56 et
  18:30:57 (l'interrupteur « Republication automatique » du Stock, éteint puis rallumé) : la reprise générale réarme
  TOUTES les plateformes mémorisées dans une même transaction, d'où le même `active_le` (17:30:57 UTC). Aucun code ne pose
  de créneau à la place de la personne (la ligne du Stock ouvre les réglages quand rien n'est réglé) ; les créneaux sont
  les siens, modifiables dans Réglages › Automatismes. Rien à réparer.
- **Verrous** `selftest:creneau-lot-heure` (rouge sur HEAD : 10 échecs sur 12 ; vert 25/25) et
  `selftest:push-creneau-lot` (rouge : 14 sur 22 ; vert 21/21) ; `selftest:lot-manuel-creneau` (09/11) mis au texte de la
  voie.

## 3. Mails de vente
- **A. Ventes d'avant le suivi** (cause prouvée) : 30 jours visibles de `push_ventes` → 10 mails, 10 comptes, 29 ventes
  antérieures annoncées (02/11 → 18/11 ; 4e0a80fe : inscrite le 16/11 23:51, premier relevé eBay 00:00:13, mail
  `vente:13033` à 00:00:37 pour une vente du 16/11 15:22). Aucune garde ne lisait l'inscription ni le premier relevé : la
  seule borne était « moins de 24 h » (`push_trg_ventes`), et le chemin tâche bornait l'âge de la PREUVE, jamais la date
  d'achat. **Correctif préparé** : migration `20261118233000_vente_avant_suivi.sql` (+ INVERSE, md5 de prod relus) —
  `vente_avant_suivi()` (début du suivi = le plus tard de l'inscription et du premier relevé de la plateforme ; à défaut,
  la connexion eBay, sinon l'inscription ; jamais now()), branchée dans `push_noter` et `push_noter_commande_vinted` : la
  note naît `ignoree` (`avant_suivi:date|etat_initial|vente_relevee`), la vente et les retraits ne changent pas ; une
  panne de la garde = comportement d'avant. Prouvée sur base jetable (`selftest:vente-avant-suivi-pg` : S1-S10 avant/après,
  panne, INVERSE à l'octet). ⛔ **NON APPLIQUÉE : feu vert nommé de Nico requis.**
- **B. Désinscription** : 4e0a80fe désinscrite le 17/11 07:37:19 ; son seul mail de vente est parti à 00:00:37, AVANT (cas
  A) ; aucun mail de vente n'est parti après une désinscription sur tout le parc (aucun des 28 désinscrits n'a vendu
  depuis). Le trou existait : push-ventes envoyait en catégorie `support`, que la porte ne filtre jamais. Aucune décision
  de Nico n'en faisait un mail transactionnel (docs/regles/ventes-et-retraits.md l. 87 : détail technique). **Correctif** :
  catégorie `notification` dans `_shared/desinscription.ts` (filtrée par la désinscription, en-tête List-Unsubscribe ;
  `marketing` et `support` identiques), `_shared/mail-categorie.js`, push-ventes en `notification` (un refus « désinscrit »
  = échec définitif, jamais réessayé), page de désinscription qui le dit.
- **Verrous** `selftest:vente-avant-suivi` (rouge 0/2 → 31/31), `selftest:vente-avant-suivi-pg` (rouge → 29/29),
  `selftest:mail-vente-desinscrit` (rouge 4/19 → 29/29).
- **À décider par Nico** : `job_pending_relaunch` (relance) est aussi en `support` alors que la page dit « Tu ne recevras
  plus d'emails de relance » ; un lien « Se désinscrire » visible dans le mail de vente.

## 4. Leboncoin — nom et prénom de la « transaction sécurisée » (d5531b8e, 88 publications bloquées)
- **Cause** : compte Leboncoin neuf sans identité ; Leboncoin laisse `escrow_lastname` / `escrow_firstname` vides et bloque
  le Continuer final. FillSell n'avait ces valeurs nulle part et l'extension ne les posait jamais (règle écrite).
  La relance de l'app était retenue en 3,5 s (journal du 17/11 21:11:06 → 21:11:10 « 1 tâche(s) retenue(s) avant essai ») :
  `partagerCandidatsIdentite` ne servait que les tâches marquées par « C'est fait » ou handler-watch (12 h).
- **Correctif** : `_shared/lbc-identite.js` — une relance de l'app après le dernier mur est un éclaireur
  (`relanceeApresMur`, marque `relance_app`, un essai par passage ; s'il bute, la retenue reprend) ; nom et prénom rangés
  une fois sous `platform_settings.leboncoin.identite_vendeur` (`identiteVendeurValide` : 1 à 50 caractères, sinon on
  demande) ; carte « Leboncoin : ton nom et ton prénom » (EcranIdentiteLbc) avec deux champs et « Enregistrer et
  essayer » ; extension **0.6.193** : une case vide reçoit la valeur (une case remplie par Leboncoin n'est jamais touchée,
  jamais de valeur inventée, aucune valeur dans un journal), relue avant le clic ; sans valeur, la question sans clic.
  update-job-status remplace le vieux texte pour toutes les versions. La copie Cloud est la même extension.
- **Verrou** `selftest:lbc-identite-saisie` : rouge sur HEAD (27 échecs sur 32), vert 44/44.
- **Reste** : 0.6.193 à téléverser au Chrome Web Store (Nico) ; **copie Cloud à monter sur feu vert de Nico** ;
  **essai réel non fait** (il faut un compte Leboncoin de Nico SANS nom ni prénom, annonce ≥ 999 €) ; d5531b8e repart par
  le circuit (carte → éclaireur → handler-watch relâche les autres) dès qu'elle a 0.6.193.

## 5. eBay — rayon manquant (2f8b09d2)
- **Cause** : pas la table de correspondance — le GENRE de la copie eBay. Parka rangée par la vendeuse en « Hommes »
  (Vinted 2551) ; la rédaction eBay a deviné « Femme » ; notre table a donné 63862 (Femme), refusé par l'app ; le worker
  a ensuite demandé à l'IA de choisir parmi les suggestions d'eBay « en respectant le genre Femme » : 57988 (Homme), qui
  était dans la liste, a été écarté → « aucun rayon sûr ». Famille : 5 tâches en 60 jours (refus de l'app + aucune
  suggestion), 1 seule en pause aujourd'hui.
- **Correctif** : `_shared/ebay-genre-apres-refus.js` — après un refus, le genre retenu est celui du texte, puis le choix
  de la personne, puis l'étagère Vinted relevée quand le genre deviné la contredit ; la feuille de notre correspondance
  (icône + ce genre) passe en tête des candidates, jamais un rayon refusé. `REGLE_RAYON_VERSION` → 2026-11-18 : les pauses
  repartent seules (rejeu borné à 20). Poids : +339 Ko au paquet du worker (vinted-branche.ts, aucune source plus légère
  fiable : le chemin n'est stocké que sur 17 % des fiches), import ~7 ms.
- **Verrou** `selftest:ebay-genre-apres-refus` : rouge 4/32 → vert 32/32 ; 54 selftests eBay verts.
- **À décider** : faire primer l'étagère Vinted dans l'app (66 copies eBay sur 981 en 60 jours ont un genre contraire à
  l'étagère ; le juste varie d'un cas à l'autre).

## 6. Leboncoin — refus de modération
- **020816ba (18 refus sur 18) : notre faute, texte mal posé.** Chaque texte refusé portait une liste de 20 à 24 noms
  d'AUTRES produits (« De temps en temps sur mon profil les mangas suivants : … »), servie telle quelle ; les 6 dépôts du
  même compte sans ce bloc sont en ligne (dont 4 déposés entre deux refus). Parc, 60 jours : 20 dépôts portent ce bloc,
  18 refusés, 2 jamais vus, 0 accepté ; la règle ne change aucun des 323 dépôts acceptés qui parlent d'autres articles.
  **Correctif** : `_shared/description-leboncoin.ts` (`blocsAutresArticles`) — une ligne qui annonce les autres articles
  du vendeur, suivie d'un deux-points et d'une liste de plus de 5 éléments, sort du texte SERVI (la fiche n'est jamais
  touchée ; l'article lui-même, une phrase, 5 éléments ou moins ne bougent pas). `REGLES_TEXTE_LBC` → lbc-texte-1811,
  trace `autres_articles`, famille ajoutée à `scripts/lbc-refus-familles.prod.sql`. Verrou `selftest:lbc-autres-articles`
  (rouge 6 échecs → vert 16/16).
- **cfdfda6f (5 refus sur 7) : famille connue du 16/11** — 2e annonce du même objet sur le même compte Leboncoin (fiches
  en double créées par le relevé après le changement de compte, mêmes images dans d'autres fichiers). Aucune règle neuve
  sûre (même titre + même couverture : 4 refusés contre 21 acceptés). 2 refus restent inexpliqués (table rangée en « Arts
  de la table », veste polaire). **Reste** : le texte exact du mail de refus de Leboncoin (le demander = un mail : ordre
  de Nico) ou un essai sur le compte de Nico (≥ 999 €).

## 7. eBay — accès révoqués en série
- **Cause** : eBay coupe le jeton de renouvellement quand le compte change de PSEUDO ou de mot de passe, ou retire l'accès
  (base de connaissance eBay 5218). Prouvé pour f5fab0e0 : connectée à 13:08 sous le pseudo généré par eBay, 5 annonces à
  14:16-14:18, renouvellement refusé à 15:06:07 (`invalid_grant`), Browse lit le NOUVEAU pseudo à 15:07, reconnectée à
  15:52 — même compte (même EIAS) — mais notre callback l'a pris pour un « autre compte » (pseudo différent) : réglages
  effacés et ses 5 annonces restées notées sous l'ancien pseudo (un retrait après une vente ailleurs les aurait crues
  d'un autre compte : risque de double vente). Renommage prouvé aussi pour 2 autres comptes ; 12 des 15 pseudos révoqués
  sont des pseudos générés à l'inscription (comptes neufs qui se personnalisent). Côté FillSell, écartés par les données :
  renouvellements concurrents, jeton écrasé, scope, sandbox, suppression de compte, 2e consentement.
- **Correctif** : `_shared/ebay-reconnexion.js` — même compte reconnu par l'EIAS (le pseudo ne compte que s'il manque) ; un
  compte renommé garde ses réglages et ses annonces passent au nouveau pseudo ; seul `invalid_grant` révoque (un autre
  400/401 = `refresh_refuse`, sans toucher la ligne) ; écritures filtrées sur le jeton lu ; le texte d'eBay est gardé dans
  le journal (jamais un jeton) ; la tâche arrêtée au jeton passe en « connexion requise » ré-armable avec la cause
  probable ; **reprise automatique** : ebay-oauth-callback relance les tâches à la reconnexion, et un filet borné dans
  ebay-api-worker. Verrou `selftest:ebay-reconnexion-reprise` (rouge 57 échecs → vert 58/58), 55 selftests eBay verts.
- **Données** : script `scripts/reparations/20261118_ebay_vendeur_renomme_f5fab0e0*.sql` (sauvegarde, gardes, inverse ;
  pseudos LUS en base) pour les 5 annonces de f5fab0e0.
- **À décider par Nico** : la reprise exige un compte eBay « prêt » (3 politiques), retraits compris ; un compte reconnecté
  mais pas prêt garde « reconnecte ton compte » jusqu'à ce qu'il le soit.

## Déploiement, preuves, reste
(complété en fin de lot dans `docs/agents/etat-2026-10-01.md`, section « 18/11 nuit — lot T2 »)
