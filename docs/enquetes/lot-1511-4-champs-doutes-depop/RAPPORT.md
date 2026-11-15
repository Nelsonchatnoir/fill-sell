# Décisions du point 4 (ventes effacées) + question Depop — 15/11/2026 (heure de Paris)

Suite de `docs/enquetes/lot-1511-3-ventes-effacees/RAPPORT.md`. Décisions de Nico : (a) reprendre prix d'achat, frais,
marges, marques et liens vers la fiche depuis les sauvegardes quotidiennes (« Restore to a new project ») ; (b) remettre
les doutes au numéro de commande distinct ; (c) « Mes boutiques Vinted » : PAS maintenant (stabilisation, aucune
nouveauté). Question Depop : merelus.serge (3c82995d, gratuit, extension 0.6.186), « accès Depop non accordé ».

## (a) Les champs perdus, repris des sauvegardes

### Les copies temporaires (lecture seule)
- Une copie de sauvegarde relance d'elle-même les tâches planifiées de la prod (doc Supabase) : 18 de nos 35 crons
  appellent nos fonctions avec le secret de cron. Feu vert de Nico : **rotation du secret de cron** avant les copies
  (runbook `docs/ROTATION_CRON_SECRET.md`) : fonctions 14:00:25, coffre 14:00:27 (nouvelle valeur jamais affichée ni
  écrite ; empreintes relues des deux côtés). Les appels de cron de la prod passent tous ensuite (200, aucun 401).
- `lecture-temp-0811` (sauvegarde du 08/11 04:20 UTC) : créée 14:03:26, prête 14:07:47, crons coupés 14:23:58 (ma garde
  attendait un libellé de cible que la CLI 3.1 n'écrit plus : 16 min de retard), **supprimée 15:02:54**. Ses 37 appels
  vers la prod : tous refusés (401).
- `lecture-temp-1311` (sauvegarde du 13/11 04:24 UTC) : créée 14:25:10, base joignable et crons coupés 14:30:05,
  **supprimée 15:03:02**. Ses 9 appels vers la prod : tous refusés (401).
- Rien d'autre n'y a été modifié : on n'y a fait que lire (`select … from ventes left join inventaire`).
- **Coût** : tarif affiché par Supabase avant chaque copie, 109,72 $/mois (calcul Large 109,22 + disque 0,50), soit
  ≈ 0,15 $/h ; 59 min + 38 min → **≈ 0,30 $** (une heure entamée facturée par copie).
- À savoir : le tableau de bord affiche « Organization exceeded its quota in the previous billing cycle — Projects will
  be restricted from 02 Dec 2026 » (sans lien avec ces copies).

### Ce qui a été remis (15:01:42, `scripts/reparations/20261115_ventes_champs_rendus.sql`)
Appariement par l'id d'origine ET le numéro de commande ET le prix de vente (jamais le titre) ; seulement les champs
vides (rien d'écrasé) ; aucun déclencheur UPDATE sur `ventes` (vérifié) ; push_ventes, tâches, fiches, mails relus
avant/après : identiques. Fichier fabriqué par `…_generer.mjs` (gabarit `…gabarit.sql`). Sauvegarde
`_backup_1511c_ventes_champs_rendus`, inverse `…_INVERSE.sql`, contrôle `20261115_ventes_doutes_et_champs_VERIFIER.sql`.

| Compte | Ventes complétées | Frais | Prix d'achat | Marges | Marques | Liens vers la fiche |
|---|---|---|---|---|---|---|
| noubliejamais (Ludovic, 2c89e573) | 1 715 (1 701 rendues + 14 doutes remis) | 1 715 | 0 (aucun dans la sauvegarde) | 0 | 5 | 0 sur 4 (fiches absentes) |
| ayadi007 (cfdfda6f) | 744 | 744 | 4 (0 € = gratuit, comme saisi) | 4 | 9 | 23 sur 26 (3 fiches absentes) |

- Les frais d'origine valaient 0 € sur chaque vente (valeur enregistrée, rendue telle quelle).
- Lien vers la fiche : seulement vers LA fiche du compte au même numéro d'annonce Vinted, unique, « vendu », reliée à
  aucune autre vente ; sinon pas de lien (raison gardée dans la sauvegarde).
- Ludovic : 10 ventes rendues sont nées après la sauvegarde du 13/11 04:24 : rien à reprendre pour elles.
- **Non récupérable** : jlovertab (ses 17 ventes sont nées le 08/11 APRÈS la sauvegarde de 05:20 et ont été effacées à
  18:12 : aucune sauvegarde ne les a) ; goks2725, jocaille270779 : aucune sauvegarde assez ancienne (laissés).

## (b) Les 42 doutes (14:58:14, `scripts/reparations/20261115_ventes_doutes_remises.sql`)
Les ventes déjà en base au même titre (Ludovic, ressaisies par lui le 15/11 à 10:21) n'ont PAS de numéro de commande :
elles sont comparées par l'autre numéro qu'elles portent, celui de l'annonce Vinted de leur fiche. Id d'origine, aucun
déclencheur, pierres tombales marquées. Ludovic : 1 770 → **1 784** ventes. Sauvegarde `_backup_1511b_ventes_doutes`,
inverse `…_INVERSE.sql`. Vérifié après : 0 push, 0 mail, 0 tâche, 0 commande en double, déclencheurs actifs.

**Remises (14, Ludovic)** — numéro de commande présent, et chaque vente du même titre est une autre annonce :
- 02/09/2024 · 17,00 € · lego creator 31143 la cabane des oiseaux
- 03/09/2024 · 19,00 € · lego creator 31143 la cabane des oiseaux
- 11/09/2024 · 19,00 € · lego creator 31143 la cabane des oiseaux
- 14/11/2025 · 43,00 € · lego ninjago 71843
- 01/12/2025 · 52,00 € · lego ninjago 71843 (deux commandes ce jour-là)
- 14/11/2025, 15/11/2025 (×2), 17/11/2025, 18/11/2025 (×2) · 28,00 € · lego creator 31165 les pandas (6 commandes)
- 05/06/2026 · 33,00 € · lego disney vaiana 43272 heihei
- 07/10/2026 · 23,00 € · camion de pompier bluey

**Non remises — déjà là (26, Ludovic)** — même numéro d'annonce que la fiche d'une vente présente : c'est la même vente
(dans ses ventes, sans date ni numéro de commande, ressaisie par lui le 15/11 à 10:21) :
- 29/10/2026 · 25,00 € · lego creator 31143 la cabane des oiseaux (= vente 627740)
- 01/11/2026 · 22,00 € · camion de pompier bluey (= 627743)
- 02/11/2026 · 20,00 € · la maison de bluey (= 627744)
- 03/11/2026 · 70,00 € · lego city train 60511 (= 627738)
- 04/11/2026 · 52,00 € · lego ninjago 71843 (= 627746)
- 05/11/2026 · 40,00 € · lego star wars 75432 (= 627762)
- 05/11/2026 · 21,00 € · lego speed champions 77256 delorean (= 627751)
- 06/11/2026 · 28,00 € · lego creator 31165 les pandas (= 627749)
- 06/11/2026 · 10,00 € · lego ninjago 71805 (= 627737)
- 06/11/2026 · 60,00 € · lego ninjago 71769 (= 627745)
- 06/11/2026 · 33,00 € · lego speed champions 77264 (= 627764)
- 06/11/2026 · 20,00 € · lego speed champions 77261 ferrari 799p (= 627766)
- 06/11/2026 · 60,00 € · lego ninjago 71836 (= 627768)
- 06/11/2026 · 45,00 € · lego disney 43296 stitch et scrump (= 627750)
- 06/11/2026 · 20,00 € · lego city 60510 calendrier de l'avent (= 627771)
- 07/11/2026 · 29,00 € · lego disney vaiana 43272 heihei (= 627742)
- 07/11/2026 · 21,00 € · lego speed champions 77256 delorean (= 627769)
- 07/11/2026 · 60,00 € · lego ideas 21368 snoopy et sa niche (= 627753)
- 07/11/2026 · 20,00 € · lego speed champions 77255 flash mcqueen (= 627772)
- 08/11/2026 · 20,00 € · lego star wars 75359 (= 627739)
- 08/11/2026 · 27,00 € · lego star wars 75431 (= 627763)
- 08/11/2026 · 62,00 € · lego botanicals 11505 (= 627755)
- 08/11/2026 · 40,00 € · lego botanicals 11501 le bouquet de tulipes (= 627787)
- 09/11/2026 · 34,00 € · lego speed champions 77264 (= 627790)
- 09/11/2026 · 34,00 € · lego speed champions 77264 (= 627791)
- 09/11/2026 · 21,00 € · lego speed champions 77256 delorean (= 627783)

**Non remises — sans numéro de commande (2, ayadi007, Leboncoin)** :
- sans date · 48,00 € · imprimante thermique Munbyn étiquette 4x6
- sans date · 119,00 € · boîtier pour disques durs RAID 40 Gbps SSD

## (c) « Mes boutiques Vinted » — non fait (décision de Nico : stabilisation, aucune nouveauté ; gardé pour plus tard).

## Depop — « accès Depop non accordé »
1. **Ce que ça veut dire** : Chrome n'a pas donné à l'extension FillSell l'accès au site depop.com sur CET ordinateur.
   La personne est bien connectée à Depop ; c'est FillSell qui n'a pas encore le droit d'y lire ses annonces.
   **Le parcours exact, clic par clic (à dire au client)** — il se fait sur l'ORDINATEUR, dans Chrome, là où l'extension
   FillSell est installée ; le téléphone seul ne peut pas : c'est Chrome sur l'ordinateur qui donne l'accès.
   1. Sur l'ordinateur, ouvre Chrome (celui où tu as installé l'extension FillSell).
   2. En haut à droite de Chrome, clique sur la petite pièce de puzzle (« Extensions »), puis sur **FillSell**. La petite
      fenêtre FillSell s'ouvre.
   3. Sur la ligne **Depop**, clique sur le bouton **« Autoriser Depop »**.
   4. Chrome affiche une petite fenêtre : « FillSell veut : Lire et modifier vos données sur www.depop.com ». Clique sur
      **« Autoriser »**.
   5. C'est tout, une seule fois. La ligne Depop n'affiche plus le bouton ; FillSell relit tes annonces Depop tout seul
      (ou appuie sur « Synchroniser » dans l'app).
   Depuis l'app (téléphone ou ordinateur), le bouton **« Autoriser Depop »** (Stock › carte du relevé, parcours
   d'entrée, Réglages › Plateformes, Tableau) fait la même chose à distance : il ouvre la fenêtre FillSell sur
   l'ordinateur (Chrome doit y être ouvert) et l'app dit « La fenêtre FillSell s'est ouverte sur ton ordinateur : appuie
   sur « Autoriser Depop » » — il faut alors cliquer sur l'ordinateur (étapes 3 et 4). Sans ordinateur allumé avec
   Chrome ouvert, rien ne peut se faire. (ismael.nourine, matthieu.grn, tomblouin13 l'ont fait d'eux-mêmes.)
2. **Pourquoi « connexion OK » et relevé refusé** : les deux lignes « app:connexion » sont ses « Me connecter » ;
   l'extension ouvre depop.com et marque la demande faite dès que la page s'ouvre — elle ne vérifie aucun accès. Le
   relevé, lui, a besoin de l'accès. **Défaut chez nous** : la vérité serveur (`plateformes_verite`) rangeait « accès
   Depop non accordé » dans les murs de connexion (« à connecter », action « connexion ») alors que son poste déclarait
   « sans accès Depop » ; l'app lui disait donc « Tu n'es pas connecté à Depop » + « Me connecter ». La règle « accès non
   accordé → à autoriser » n'existait que pour Opla ; côté app, la carte du relevé ne reconnaissait pas ce mur.
3. **Correctif (pour tous)** : migration `20261115160000` (feu vert, 15:07:08) : relevé « accès Depop non accordé » →
   « à autoriser » + action `autoriser_depop` ; trace par poste (`depop_acces`) lue comme pour Opla. Relu sur le parc :
   la règle par poste mettait aussi « à autoriser » chez 88 comptes bêta qui n'ont jamais choisi Depop → migration
   `20261115170000` (second feu vert, 15:11:36) : la règle par poste ne vaut que pour qui a choisi Depop. Parc après :
   17 comptes « à autoriser », dont Serge (motif `releve_depop_non_autorise`). App (web + OTA 2.9.199) : la carte du
   relevé, ses bandes et le parcours d'entrée disent « Autoriser Depop » (`etatReleve.js`) ; Réglages › Plateformes
   montre la phrase et le bouton Depop (plus jamais le bloc d'Opla sur la ligne Depop). Le bouton « Autoriser Depop »
   ouvre le popup de l'extension (extension ≥ 0.6.105 : Serge a la 0.6.186). Extension inchangée.
   Verrous : `selftest:depop-acces-verite` (13 ; 10 rouges sur le code d'avant), `selftest:depop-acces-verite-pg`
   (banc 16/16 : la cause rejouée, les 8 comptes du banc du 13/11 identiques, inverse à l'octet, garde md5).
   Inverses : `supabase/rollbacks/20261115170000_…_INVERSE.sql` puis `20261115160000_…_INVERSE.sql`.
- Rien touché sur son compte Depop ; aucun mail ; son passage en Pro : rien fait (aucune action chez Stripe).

## Livraison
- Preuves : `selftest:ventes-champs-rendus-pg` (25/25 : doutes, champs, rien d'écrasé, refus si une vente ne
  correspond plus, inverses) ; Depop ci-dessus. Les preuves du lot d'avant utilisaient de fausses adresses « @ex.fr »
  que `selftest:donnees-clients` refuse : remplacées par le domaine factice permis.
- Note technique : sur la base jetable, une erreur journalise le texte entier de la requête (200 Ko) dans un tuyau non
  vidé et bloque le serveur : la preuve coupe ce journal (`log_min_error_statement = panic`).
