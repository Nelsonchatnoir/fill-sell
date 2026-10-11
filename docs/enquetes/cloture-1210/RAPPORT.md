# Clôture du 11-12/10 (nuit) — tout ce qui restait ouvert, prouvé en réel

Demande de Nico (11/10) : clore tout ce qui reste ouvert (A1 → A11), prouver en réel la version finale de
l'extension, nettoyer. Ajouts en cours de route : A10 (champs Leboncoin à la main), A10bis (question à liste vide),
garde du journal des paiements, horloge de Louis, cas Morgane (ISBN).

## Servi

| Quoi | Version | verify_jwt avant → après |
|---|---|---|
| web (Vercel) | `2026-10-11T20:27:55Z+0a1ff78` (entrée `index-CW8La14e.js` : 200 avec `Origin`) | — |
| OTA (Capgo, canal production) | **2.9.86** (`2026-10-11T20:26:41Z+0a1ff78`) | — |
| get-pending-jobs | v241 | true → true |
| handler-watch | v102 | false → false |
| generate-listing | v117 | true → true |
| resolve-categorie | v15 | false → false |
| ebay-api-worker | v85 | false → false |
| apple-iap-webhook | v37 | false → false |
| google-play-webhook | v28 | false → false |
| apple-notification-history | v23 | false → false |
| abonnements-stores-audit (nouvelle, lecture seule) | v1 | false (x-cron-secret) |

Migrations (GO nommés de Nico, rejeu en transaction annulée montré, inscrites) :
`20261012090000_disjoncteur_republication_compte_seul`, `20261012100000_journal_notifications_stores`.

Extension : **aucune ligne de `chrome-extension/` modifiée** — tout est corrigé côté serveur ou app.
**0.6.110 BONNE À TÉLÉVERSER** : `C:\Users\nicol\fill-and-sell\build\CWS-0.6.110-A-TELEVERSER\fillsell-extension-0.6.110-a3c5aef-cws.zip`
(BUILD_ID `2026-10-11T14:31:05Z+a3c5aef`, chargée chez Nico, tous les tests réels de cette nuit tournent dessus).

Selftests : 275/275 avant (runner séquentiel `scripts/selftests-sequentiels.mjs`), **285/285 après**.
Push unique : `2367c10..0a1ff78` (21 commits, un par point), HEAD distant = HEAD local.

## Point par point

| | Cassé | Corrigé | Preuve |
|---|---|---|---|
| A1 | plafond de 20 dans le Stock et le lot | plus de plafond ; seule limite le quota du palier, dit dans la barre avant de lancer ; sélection en Set, envoi unique | réel : **21 articles** cochés d'un « Tout (21) », 21 jobs Depop, 0 doublon ; aperçu `capture-lot-sans-plafond` (71 articles, 1280 → 320, mur du quota 37/34) |
| A2 | lien discret | vrai bouton plein 44 px | réel (PC) + aperçu 1280/768/390/320 |
| A3 | rayon refusé par Vinted (« Jeux et jouets » devenu intermédiaire) → message « bouton Compléter » sans réponse possible | moteur commun (`_shared/rayon-refuse-moteur.js`) choisit une FEUILLE ; question de dernier recours = feuilles, liste complète ; handler-watch débloque les jobs en pause | réel : **Horloge de Louis repartie seule à 22:10** (Enfants › Jeux et jouets › Jeux éducatifs › Autres jeux éducatifs), https://www.vinted.fr/items/10340665531 — par le SERVEUR, sur sa 0.6.106 ; Beebs alizeed48 (c39edb51) rayon posé, en file |
| A4 | un échec d'article coupait le compte | `republish_echec_portee` : seul un échec du compte coupe | rejeu 30 j : 154 créneaux, 0 coupé à tort |
| A5 | remise en ligne ratée gelait la file sans limite | ≥ 2 échecs et > 2 h → sortie de la file ; cause du COMPTE → reste et protège, et le DIT | le Cendrier de jonathanrabany est une restriction Vinted : message réel « Vinted limite en ce moment les mises en vente de ton compte… ne retire aucune autre de tes annonces » |
| A6 | retrait d'article vendu en silence (Ornella, nerema75) | murs « boutique » (nommée) et « ordinateur » ; bandeau prioritaire qui se lève seul ; « À régler » : un geste par mur | Ornella (90583f9a) : « Ouvre ta boutique @ornella-vend » ; aperçu `capture-retraits-vendus` (le défaut « Reconnecte-toi à Vinted, Vinted… » trouvé et corrigé) |
| A7 | roue hors écran ≤ 375 px | compteur réduit avant la roue | aperçu `capture-entete-marque` 320 → 1920 |
| A8 | issue des achats inconnue ; UPGRADE Apple jeté (Ciddjy payé Pro, resté Premium) | issue classée (`checkout_issue`) ; table de décision Apple/Google, journal `stores_notifications_journal`, inconnu signalé ; journal borné à 2 s, jamais bloquant | Ciddjy réparé (is_pro, dotation) ; audit 29 abonnés : « payé sans effet » = **vide** ; banc `preuve-webhooks-journal` vert (achat, renouvellement, passage × Apple, Google × journal OK/erreur/exception/rejet/sans réponse) ; notification TEST d'Apple → **SUCCESS** après déploiement |
| A9 | compteur Depop vide dans le popup | filtre Depop réservé à la file d'exécution (serveur, toutes versions) | réel : requête du popup depuis la session de Nico → 9 jobs Depop rendus |
| A10 | Univers / Produit / Type demandés à la main (Louis) | déduits de la fiche, seconde passe IA bornée à la liste | réel : lot de 3 vêtements Leboncoin préparé **sans aucune question**, `univers = Homme`, « Votre annonce est publiée » |
| A10bis | question à liste vide, « Arts de la table » cassé le 04/10 (3561156) | vrai sélecteur, retour à la liste, Produit après son Univers ; « noël » n'est plus un objet | « Moules noel » : publié par Louis à 21:51 en Décoration › Rangement (AVANT le correctif, laissé tel quel) ; règle corrigée (parc 60 j : 2 mieux rangés, 0 cassé) |
| Morgane | Blake & Mortimer refusé 400 « ISBN valide » | règle unique « livre = ISBN » (`vintedExigeUnIsbn`), ISBN lu sur les photos (`_shared/isbn-ia.ts`), « Ce livre n'a pas d'ISBN », lien eBay « compte à finir » | réel : ISBN 2-87097-047-1 lu sur sa photo de la page de copyright, job reparti seul, **publié 22:23** https://www.vinted.fr/items/10340844595 |

Constats de l'enquête Morgane : la génération AVAIT les photos (`images: 0` compte les photos retouchées) ; elle a tapé
l'ISBN 3 fois (pas 5 : 2 « complete » étaient des questions retirées par un changement de rayon — mesure corrigée,
`retiree`) et ses 3 ISBN sont partis ; pour la BD, le catalogue disait « facultatif ». Autres comptes touchés en 30 j : 0.

## Tests réels (poste de Nico, extension 0.6.110, articles de test à 999 €)

- **Lot de 21 sur Depop** : 22:33:20 → 22:42:15, une annonce toutes les ~26 s (rythme de l'extension, inchangé) ;
  rayon « Homme › Hauts › T-shirts », taille M, port 4,15 € ; page Depop relue : « Men's White T-shirt €999.00 ».
- **Leboncoin** : 3 vêtements publiés sans question (A10).
- **Vinted** : publication 22:47 (https://www.vinted.fr/items/10341135019) ; republication depuis la carte (« Remonter ») :
  retirée puis recréée à l'identique, 10341269903 (étape `recreated`), puis retirée.
- **Nettoyage (B4)** : 21 retraits Depop demandés depuis l'app (« Gérer les plateformes »), 21 `deleted` (22:49 → 22:59) ;
  boutique Depop relue : 3 annonces, celles de Nico, aucune de test ; Leboncoin « Mes annonces » relu : 10 en ligne, 0 de
  test ; Vinted de test retirée (23:00). **Aucun job de test en file.**
  **Fin du nettoyage (11/10 23:28)** — relu en page dans le Chrome de Nico : Depop « Active (3 listings) » à 6, 28 et 80 €
  (celles de Nico) ; Vinted 10341135019 (publication) et 10341269903 (republication) : « Page not found » ; Leboncoin
  « En ligne (10) », aucune de test ; 3286784431 et 3286784845 (n°2, n°3) : « Cette annonce est désactivée » (modération).
  **19 fiches de test supprimées** (n°1, 4 → 21) par `scripts/reparations/20261012_articles_test_lot_depop_INVERSE.sql` :
  garde dans la requête (aucun job en file, aucune publication à `published`, aucune vente), sauvegarde
  `_backup_1210_articles_test_lot_depop` (78 lignes : 19 fiches, 19 `fiches_annonce`, 40 liens de jobs ; RLS, aucun droit
  client), restauration écrite en tête du script ; 0 retrait armé par le déclencheur, 40 jobs gardés (détachés),
  0 job créé. **Restent n°2 et n°3** (1791800000002/3) : le même script les retirera quand leur publication Leboncoin ne
  sera plus à `published` ; s'ils passent en ligne, les retirer d'abord.
- **A9 en réel** : la requête du popup (sans capacités de poste) depuis la session de Nico rend les 9 jobs Depop en file.
- **A11 (contrôle unique après service)** : depuis le service (22:28) jusqu'à 22:55, 0 passage en échec ni en question sur
  les autres comptes (journal update-job-status ; 21 sur les 6 h d'avant), jobs nés dans les 15 min : 24 (payants), 0
  échec, 0 question. Files arrêtées chez des payants à l'extension active : plafond de 50 republications atteint
  (2189c4d8), créneau fermé et mur boutique (Ornella), restriction Vinted protégée et dite (Cendrier) — voulues.
  **TOUT EST CLOS.**
- **Leboncoin, contrôle avant retrait** : cas complet prouvé sur ce même code (0.6.110, inchangé) —
  `docs/enquetes/lot-1110-soir/RAPPORT.md` § « Test réel du pré-vol Leboncoin », cas A VERT.

## Ce qui reste ouvert

- **« Autorisation Depop retirée dans la page des extensions »** : IMPOSSIBLE ici — l'outil qui pilote Chrome refuse
  `chrome://extensions` et `chrome-extension://…`. Geste de Nico (1 min) : chrome://extensions › FillSell › Détails ›
  Accès aux sites › retirer depop.com ; dans l'app, « Autoriser Depop » doit apparaître (≤ 15 min, handler-watch) ;
  ré-autoriser → il se lève seul et le job part.
- **Leboncoin cas « champ manquant »** : jamais provoqué en réel (le 11/10 : État réhydraté depuis la fiche, Produit
  pré-rempli par Leboncoin, modération) ; le code du pré-vol n'a pas bougé.
- **« Moules noel » de Louis** : en ligne en Décoration › Rangement depuis 21:51 — rien modifié chez Leboncoin, à
  corriger par Louis (ou une republication, qui prendra le bon rayon).
- **2 T-shirts de test Leboncoin en modération** (n°2, n°3) : non retirables tant que Leboncoin ne les a pas validés
  (« Leboncoin vérifie ton annonce » ; encore « désactivées » à 23:25). FillSell relit Leboncoin à chaque passage ; s'ils
  passent en ligne, les retirer, puis relancer le script de nettoyage (il retire leurs 2 fiches, les seules restantes).
- Le compteur « annonces restantes » de l'en-tête ne se met à jour qu'au rechargement (91 affiché, 70 réels) —
  préexistant, non corrigé.
