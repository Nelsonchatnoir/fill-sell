# 10/11/2026 soir — le quota d'annonces comptait les imports (passe légère sur le texte du vendeur)

Heures de Paris partout. Ordre de Nico (10/11) : corriger à la racine ce qui est compté, pour tous les paliers et toutes
les voies ; ne changer ni les valeurs des quotas, ni la grille, ni le coût.

## La règle (Nico)
- COMPTE : une fiche rédigée par l'IA à partir des photos, et chaque scan Lens.
- NE COMPTE JAMAIS : un article importé d'une plateforme (ou saisi au stock) qui reprend son titre ET sa description
  d'origine. La passe légère de l'IA (rayon, champs, état) reste faite, gratuite. C'est ce que l'app affichait déjà
  (`jaugesExplications.js` : « Ne compte jamais : un article que tu saisis toi-même au stock, tes annonces importées
  des plateformes ») — le serveur ne le faisait pas.

## Ce qui était compté à tort (preuves en base)
- `quota_annonces_consommees` comptait TOUTE ligne `usage_logs.generate_listing`, y compris celles où
  `texte_vendeur_titre` = `texte_vendeur_description` = true (l'IA n'a rien rédigé). Lue par `quotas_etat` (en-tête,
  Réglages), `spend_coins_for_generate` (guichet de generate-listing), `spend_coins_for_lens`, `garde_fou_jour`.
- Compte d0ac0538 (Free, essai Cloud) : 5 lignes le 10/11 15:14 → 15:17, toutes texte du vendeur (vinted_sync, 0 image,
  ~0,011 $) → 5 sur 5, bloquée. Un compte Business (illimité) : 314 lignes du même cas le 09/11.
- Le guichet (`generate-listing` → `spend_coins_for_generate`) refusait AVANT de savoir qui écrit le texte : la passe
  légère d'un import était refusée « quota_annonces_atteint ».
- L'app prévoyait aussi 1 annonce par import : « Où publier ? » (`StepperNouveau`, bouton « Plus d'annonce ce
  mois-ci »), le mur du lot (`consomme` = toute fiche non couverte), la barre de sélection du Stock.

## Le correctif (règle, tous les comptes)
- Migration `20261110170000_annonces_texte_vendeur_hors_quota` (réécrite depuis `pg_get_functiondef` de prod, 3
  conditions ajoutées, signatures et droits inchangés) : la passe légère sort du décompte et n'ouvre ni la dédup 24 h
  ni la « régénération » du guichet (une vraie rédaction qui la suit compte). Preuve sur Postgres jetable :
  `PREUVE_PG=embarque node scripts/quotas/preuve-texte-vendeur.mjs` (18/18) ; inverse à l'octet près.
- `generate-listing` : la fiche est lue AVANT le guichet ; titre ET description du vendeur (`passeLegere`, mêmes
  variables que la trace `texte_vendeur_*`) → ni quota, ni garde-fou du jour, ni débit.
- App : `redactionHorsQuota` (`src/utils/sourceDuTexte.js`, partagée) — « Où publier ? » (`m.texteHorsQuota`), mur du
  lot, barre du Stock (`aRediger`). Un import dont la description d'origine sera lue avant rédaction compte comme du
  texte du vendeur (`plateformeOrigine`).
- Inchangé : une vraie rédaction IA, chaque scan Lens (ligne `lens`, ou `generate_listing` `source: lens_unifie` sans
  clés texte_vendeur), un titre seul ou une description seule du vendeur, un corps item_data sans marqueur.

## Comptes limités touchés depuis la grille à 3 jauges (04/11) — mesuré le 10/11 au soir, avant la migration, RIEN modifié
- Méthode : chaque blocage « annonces » tracé depuis le 04/11 (`lot_mur_quota_affiche` jauge annonces,
  `offers_modal_open` quota_geste annonces, `premium_cta_click` quota_annonces / lot_publication_mur, refus Lens),
  décompte recalculé à l'instant du blocage avec l'ancienne puis la nouvelle règle ; plus l'état du cycle en cours.
- 12 comptes (hors d0ac0538) ont heurté un mur ou un refus alors que la vraie règle leur laissait de la place
  (4cfb7afe ×7, 010ff35b Premium ×5, a962a59e ×2, fc37c75e ×2, 379aa8a7 ×2,
  2981c70d ×2, e24a7fc8 ×2, 1cc18f96 ×2, 6d347cc3, ebdf29f0, e603c112 (Lens), 6a7595b1).
- 16 comptes sont BLOQUÉS en ce moment par ce seul décompte (13 Free à 5/5 dont 8 à 0 vraie rédaction, 1 Premium
  40/40 → 0, 1 Pro 120/120 → 114, 1 Business à surcharge 400 : 463 → 64). Dont 8 hors de la liste précédente.
  Au total 20 comptes distincts bloqués à tort (hors d0ac0538).
- En tout, 45 comptes limités (hors d0ac0538) ont des passes légères comptées dans leur cycle en cours (jauge
  gonflée), dont les 16 bloqués.
- Tous retrouvent leur décompte juste par la migration, sans aucune écriture sur leurs comptes.

## Le compte d0ac0538
- Surcharge posée à la main (quotas_par_compte 10, « claude (ordre de Nico) ») retirée après la migration :
  `scripts/reparations/20261110_quota_annonces_d0ac0538_retire.sql` (sauvegarde `_backup_1011_quota_d0ac0538`,
  inverse `…_INVERSE.sql`), garde « décompte corrigé = 0 ». Quota normal 5, 0 consommée → 5 disponibles.
