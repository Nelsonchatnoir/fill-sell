# 10/11/2026 — URGENT : cliente en essai FillSell Cloud, « c'est fait » mais rien publié (d0ac0538)

Cliente : van.nessa.calvo@gmail.com, `d0ac0538-0dbc-4bea-8c57-1c412a07d2c4`, inscrite le 10/11 à 11:44 (Paris), essai
Cloud Stripe du 10/11 11:46:52 au 17/11 11:46:52, palier Free. Web sur Android (Chrome 154). Mail au support à 12:25.
Heures de Paris partout.

## Point 1 — « Continuer » au mur, puis aucun job : AUCUN ENVOI N'EST PARTI DU TÉLÉPHONE

Preuves (journaux d'API `edge_logs` filtrés sur `request.sb.auth_user` = la cliente et l'agent Android, `usage_logs`) :
- 12:00:40 → 12:05:56 : premier lot, 5 articles (pas de mur : 5 annonces disponibles). 5 générations (12:00:46 →
  12:01:44) consomment ses 5 annonces du mois. Le lot est quitté à 12:05:56 sans envoi.
- 12:07:02 mur (annonces, restantes 0, 5 articles → 3 retenus : 1794308080910020, …021, …022, dont la fiche couvre
  Leboncoin + Beebs ; 2 reportés : …096906005, …096906007). 12:07:17 « Continuer ». Les 3 moteurs se préparent
  (resolve-categorie 12:07:19 → 12:07:40, fiches enregistrées étape 3 à 12:07:44). Elle ouvre la fiche de chacun
  (photos lues 12:07:45, 12:07:57, 12:08:09, 12:08:28, 12:08:32). Lot quitté à 12:08:59 (`action_app_ratee`
  stepper_ferme sans_publier, étape 3, ouvert 102 s).
- **Aucun appel à `spend_coins_and_publish`** de tout le projet entre 12:00 et 13:30 (0 sur l'heure, contre 354 l'heure
  précédente, autres comptes), et aucune relecture d'adresse Leboncoin (`profiles?select=platform_settings`), que le
  clic « Envoyer » fait AVANT la RPC. Les gardes muettes du clic (`inventoryFull`, `publishedStateLoaded`) ne
  peuvent pas s'appliquer (stock illimité, lot qui attend la relecture). Donc : le geste « Envoyer » n'a jamais eu
  lieu (ou n'était pas possible) — le moteur n'a rien refusé, il n'a rien reçu.

**LA CAUSE (trouvée en rejouant son lot par l'app, 13:40-13:45, sans rien envoyer) : son compte n'a AUCUNE adresse de
remise** (`platform_settings.leboncoin.adresse` absent). Leboncoin et Beebs la réclament à chaque annonce : le moteur les
retire (`lbcAdresseManquante`) ; ses articles, déjà sur Vinted, n'avaient plus aucune plateforme. Chaque article restait
« À vérifier — Coche la plateforme où publier : eBay, Depop » (motif FAUX : elle avait coché Leboncoin et Beebs), le
bouton « Réponds aux questions pour envoyer » restait gris, et RIEN dans le lot ne permettait de saisir l'adresse : un
cul-de-sac. Elle a ouvert chaque article (photos lues 12:07:45 → 12:08:32), n'a rien trouvé à régler, a quitté.
Preuve sur le parc : les 3 comptes bloqués (bookibulle, logannlaffargue, van.nessa) n'ont pas d'adresse ;
dylan.fontaine13 (sans adresse) n'a publié que sur Depop ; tous les comptes qui ont une adresse ont publié leurs lots.

Correctif de la cause (règle, tous les comptes) :
- `lot/regles.js` bilanArticle : rien de publiable + adresse manquante → motif « Adresse de remise » (plus « Aucune
  plateforme » / « À vérifier ») ; `lot/sujetsDuLot.js` : une question « Adresse de remise » (Leboncoin, Beebs) ;
- `lot/AdresseRemiseDuLot.jsx` : le lot demande l'adresse UNE fois (bloc « Ton adresse de remise »), même écriture que
  Réglages › Expédition (platform_settings_fusionner, champs d'adresse seuls ; hors de France averti ; vérification
  BAN) ; enregistrée → chaque moteur la relit (`relireAdresseLbc`, nouveau dans le moteur) et les articles repartent ;
- moteur (`ListingPreviewScreen` motifsCtaGris) : plateformes cochées retirées faute d'adresse → « Adresse de remise à
  indiquer (Leboncoin, Beebs) — Réglages › Expédition », jamais « Coche eBay, Depop ».
Un article qui a une AUTRE plateforme publiable reste prêt (Leboncoin/Beebs exclues et dites, comme avant).

Ce qui l'a trompée en plus : à l'étape 2, chaque article réglé affichait « ✓ Réglé », et quitter un lot
préparé disait « Quitter ? Les textes préparés sont gardés » — jamais « rien n'est parti ». Rien ne traçait non plus
le geste d'envoi : impossible de distinguer côté serveur « pas touché » de « touché sans effet ».

Autres comptes (requête : `lot_mur_quota_choix` = continuer depuis la grille à 3 jauges du 04/11, jobs `publish`
marqués `lot_publication` dans les 30 min, et dans la minute comme demandé) — 17 « continuer », 11 suivis d'envois :
- bookibulle@gmail.com (2981c70d) : 04/11 15:41 et 15:55 — 0 job, aucun depuis ;
- logannlaffargue@gmail.com (4cfb7afe) : 08/11 14:39, 14:42 ; 09/11 13:37 (×2), 13:44, 18:50, 18:51, 18:52, 18:55 —
  0 job, aucun depuis ; aucun appel `spend_coins_and_publish` le 09/11 (journaux d'API) : même chemin (lot quitté) ;
- victorine.boutique.contact@gmail.com (a962a59e) : 09/11 21:59 — 0 dans les 30 min, mais 4 jobs du lot ensuite
  (envoi à 22:30 : préparation longue) → pas touchée ;
- van.nessa.calvo@gmail.com : 10/11 12:07.
Dans la minute (critère strict) : seuls dylan.fontaine13 (04/11 20:42), jessica.alhiane (07/11 21:44) et
julian.boissel (08/11 18:13) ont un job ; les autres envois arrivent après 1 à 30 min de préparation (normal).

Correctif (règle, pour tous les comptes, Cloud et extension — même écran) — `src/publication/lot/LotPublication.jsx` :
- un lot qui a des articles PRÊTS ne se quitte plus en silence : « Quitter » (ou ‹) ouvre la feuille « Rien n'est
  encore parti » (« aucune annonce ne part sur les plateformes tant que tu n'appuies pas sur « Envoyer » »), avec le
  MÊME geste que le bouton du bas (« Envoyer N publications » / « Programmer… ») et « Quitter sans envoyer » ;
- sans article prêt : le second appui dit « Rien n'est parti — quitter ? » ;
- la ligne d'un article réglé dit « ✓ Prêt à envoyer — touche la ligne pour revoir. » (plus « Réglé ») ;
- traces `usage_logs` : `lot_envoi_demande` (au clic), `lot_quitte_sans_envoyer` (articles, prêts, à compléter, en
  préparation, mur, cloud, libellé et état du bouton), `lot_envoi_sans_job`.
- Selftest : `npm run selftest:lot-sortie-sans-envoi`.

## Point 2 — essai Cloud traité comme un Free : C'EST LA RÈGLE DÉFINIE, rien changé

FillSell Cloud est une option SANS quota propre : le compte garde les quotas de son palier, pendant l'essai comme payé
(Stripe, Apple, Google). Sources : `_shared/cloud-option.js:9-17` (décisions de Nico du 04/10 : « Cloud se prend SEUL.
Le compte garde les quotas de son palier (Free : 5 annonces) ») et `:22` (jamais is_premium/pro/business depuis
Cloud) ; `src/utils/palier.js:13-18` ; `src/cloud/textes.js:123-126` (« Pendant l'essai : Tes 5 annonces du plan
Free ») ; CGV `src/cloud/textesLegaux.js:43` ; site `site/contenu/fr/tarifs.md:172`, `faq.md:97` ; cadre du 30/10
(`docs/cloud/REPRISE.md:1549-1550`) : mur de conversion vers le palier supérieur, jamais le Cloud reproposé. En prod,
aucune fonction de quota (quotas_etat, palier_de, spend_coins_*, jauges) ne lit le Cloud ; coin_config n'a aucune clé
de quota Cloud.
Son état réel : annonces 5/5 utilisées ; remontées Free 30/30 (4 faites + 26 en cours, d'où `plafond_republication_free`) ;
publications 0/50 (ne bloque pas). Remise le 10/12 01:00.
→ Le garde-fou s'applique : rien inventé, aucun quota changé, le mur Premium reste (c'est la règle). Si Nico veut que
l'essai Cloud ouvre davantage, c'est une décision NOUVELLE : des valeurs (aucune n'existe) à brancher dans quotas_etat,
jauge_annonces_plafond, jauge_publications_plafond, quota_remontees_plafond / quota_republication_free_etat,
spend_coins_for_generate, spend_coins_and_publish, spend_coins_and_republish, plus CGV, site et textes de l'app.

## Point 3 — « C'est fait » sans job

- L'écran 3 du lot se titrait « C'est parti » avec une coche ✓ même quand rien n'était parti. Désormais : titre
  « C'est parti » et ✓ seulement si au moins un article est en file ; sinon « Pas envoyé », « ! » et « Rien n'est
  parti ». L'écran qui a des publications en file est inchangé (« N publications en file »).
- Un article n'est « En file » que si son job est RELU : l'estampille du lot (`bulk_batch_id`) rend les jobs qu'elle
  touche ; aucun → relecture (même filtre) ; toujours aucun → « Le serveur n'a pas confirmé — rien n'a été créé pour
  cet article. » (trace `lot_envoi_sans_job`). Lecture en erreur : rien n'est conclu (la confirmation du serveur vaut).
  Mesure avant correctif : 1 336 jobs de lot sur 1 337 estampillés en 7 jours (la preuve est fiable).
- Aucun autre écran de confirmation touché (stepper à l'unité, republication, Stock).

## Point 4 — les 17 republications « Annulée à ta demande » : GESTE DE LA CLIENTE

« Tout annuler » de « Ta file », confirmé, depuis son téléphone à 12:22:00.742 : les 17 jobs (lot 916f189e…, créés
12:15:58 → 12:16:03, étape `a_capturer`, jamais touchés par le poste Cloud) portent tous
`annulee_dans_la_file {par: "app (Ta file)", le: 2026-11-10T11:22:00.742Z}` à la milliseconde (un seul appel
`annulerJobs`, `src/utils/annulerFile.js:89`, seul appelant `FileDesJobs.jsx:393` → bouton « Tout annuler » :430-435
puis confirmation :508). Journaux d'API : 12:21:51 pause de la file, 12:22:01 relecture puis 15 PATCH conditionnels
`status=eq.pending&action=eq.republish` depuis l'agent Android de la cliente. Aucune tâche pg_cron, fonction edge ni
le poste Cloud n'écrit ce marqueur. La 18e (déjà engagée) a été publiée à 12:19. Rien relancé (garde-fou).

## Point 5 — déblocage (ordre de Nico : ses 5 articles, annonces rendues)

- Annonces rendues (ordre de Nico) : `scripts/reparations/20261110_annonces_rendues_d0ac0538.sql` (sauvegarde
  `_backup_1011_annonces_rendues_d0ac0538`, inverse `…_INVERSE.sql`), passé à 13:3x : les 5 générations du lot de 12:00
  + la régénération de 12:05:33 sortent du décompte (`generate_listing` → `generate_listing_rendue`, coût et dates
  conservés). Décompte : 5 → 0 consommées (5 restantes sur 5 jusqu'au 10/12). Le lot de 12:07 n'avait rien consommé.
  Aucun autre compte, aucun plafond touchés.
- Rejeu par la voie normale de l'app (navigateur isolé WebKit, session à usage unique de SON compte, révoquée à la fin ;
  reprise de lot du Stock `fs_lot_reprise_<uid>` : …910020, …910021, …910022, …906005, …906007 → Leboncoin + Beebs) :
  écran 1 conforme (« Préparer 10 publications », 0 annonce consommée : textes déjà rédigés) ; écran 2 : les 5
  « À vérifier — Coche la plateforme où publier : eBay, Depop », bouton gris → ARRÊT sans envoi (aucune écriture).
  C'est ce rejeu qui a révélé l'adresse manquante.
- **Bloqué sur une donnée qu'elle seule a** : son adresse de remise. Rien n'est inventé ; elle la saisit (Réglages ›
  Expédition, ou désormais dans le lot), puis « Envoyer ». Ses 5 articles sont préparés, ses 5 annonces rendues.
