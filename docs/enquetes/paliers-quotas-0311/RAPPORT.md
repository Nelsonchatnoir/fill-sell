# Paliers et quotas — audit, décisions de Nico, correctif des remontées (03/11/2026)

Base : tous les comptes, hors comptes de test, de Nico et d'Ornella, offerts (`is_comped`) et voirememe. Un fait est lu en
base ; un chiffre « estimé » le dit.

## 1. Audit (lecture seule, 03/11 soir) — ce qu'il faut en garder
- Quotas en prod : annonces 5/40/120/300 (chaque rédaction IA, article neuf OU importé, et chaque Lens ; blocage serveur
  avant l'IA) ; remontées 50/1 500/5 000/illimité ; retouche 0/5/20/50 ; voix invisible ; scan, stock et
  `pro_generate_daily_cap` ne bloquent plus rien. Compté nulle part : la mise en ligne sans IA, le nombre de plateformes,
  imports, synchros, retraits.
- 78 % des « annonces » comptées en 30 j sont des rédactions d'articles IMPORTÉS (Business 99 %, Premium 86 %).
- Conversions : 53 premiers paiements en 60 j, dont 32 dans les 24 h d'un mur ; le mur qui fait le plus payer est celui
  du lot (publier son stock importé avec 5 annonces).
- Coût IA par action (30 j) : rédaction 0,011 $ ; Lens complet 0,041 $ (Haiku 5.5, 0,085 $ avant le 29/10) ; mise en ligne
  ≈ 0,001 $ (eBay + 0,021 $) ; retouche 0,066 $.
- ⛔ **Erreur de l'audit, corrigée ici** : il avait pris pour « annulées » les 743 remontées `cancelled` de
  nadegemarcelin78. Elles ont toutes un `published_at` : ce sont des remontées FAITES, remplacées ensuite par la remontée
  suivante du même article. Les chiffres de remontées de l'audit (« status ≠ cancelled ») étaient donc trop bas ; ceux
  du § 4 suivent la bonne règle (publiée un jour, ou en cours).

## 2. Décisions de Nico (03/11 soir)
- **Faites maintenant** : la règle des remontées (faites + en cours pour tous les paliers) et, après le diagnostic, la
  correction du cycle (un paiement du même palier ouvre toujours un cycle neuf), appliquée par la règle, prouvée sur base
  jetable puis appliquée en prod (feu vert donné d'avance). Aucun mail, aucun quota ni palier changé.
- **Décidées, rien à coder maintenant** (prochain binaire complet, après validation des prix sur les stores) : trois jauges
  (« Annonces créées » : rédaction IA ou Lens ; « Publications » : chaque mise en ligne, 1 par plateforme, avec ou sans
  IA ; « Remontées » : chaque republication, 1 par plateforme) ; coût affiché avant chaque publication ; grille B sans
  plafond par jour (la décision du 24/10 tient) ; annonces / remontées Free 5 / 30, Premium 40 / 1 500, Pro 120 / 5 000 ;
  pas d'offre à 79,99 € mais Business illimité (59,99 €) sauf Lens 600 scans par mois (affiché), garde-fou invisible de
  1 500 par mois sur le reste ; Cloud 24,99 € (`CLOUD_PRIX_AFFICHE` changé dans le binaire, pas avant), un Free peut le
  prendre seul ; bordereaux Vinted réservés au Pro et au-dessus (proposition, à confirmer).

## 3. Le correctif (prod, 03/11 entre 20:00 et 20:20, heure de Paris)
- **Cause du blocage de nadegemarcelin78** : son paiement du 16/10 est arrivé 4 jours avant son échéance interne (20/10) ;
  `upgrade_monthly_grant` a reporté l'échéance au 16/11 sans remettre le cycle à zéro (pas de ligne au grand livre). Son
  cycle courait du 29/09 au 16/11 (48 j) : 1 500 remontées atteintes le 29/10. Ni les annulées ni la règle du Free n'y
  pouvaient rien.
- **Migration `20261103233000_paiement_meme_palier_cycle_neuf`** : la règle, puis le recalcul de tout compte payant dont
  la période payée a commencé après son dernier grant. Deux comptes : nadegemarcelin78 (cycle au 16/10 15:09) et
  boncoin59300 (29/10 18:14, son paiement Stripe ; le cycle partait du paiement Google remboursé du 26/10).
- **Migration `20261103234000_remontees_faites_ou_en_cours`** : `remontees_du_cycle` pour Premium / Pro, lue par
  `quotas_etat`, `spend_coins_and_republish`, `remise_en_vente_place`, `republish_planifiee_etat`. Les remontées créées
  dans le cycle, publiées ou en cours. C'est un sous-ensemble de l'ancien compte : aucun compteur ne monte. La règle exacte
  du Free (date de publication) aurait fait monter six compteurs, dont remialbertholl 143 → 242. Le Free garde sa fonction.
- **Preuve** : `PREUVE_PG=embarque node scripts/quotas/preuve-cycle-remontees.mjs`, 38/38 sur Postgres 17 jetable avec
  les définitions de prod (`scripts/quotas/fixtures/prod-0311-cycle-remontees.sql`). Le défaut se reproduit avant le
  correctif. Cas couverts : à l'heure, anticipé, rejeu, proration (aucune prolongation, puis 1,5 jour), changement de
  palier, retard, RESTARTED, appel « lazy », grant déjà posé, recalcul (6 comptes témoins intacts), idempotence. Selftest
  `cycle-et-remontees` (30 contrôles). Empreintes md5 des 6 fonctions de prod vérifiées identiques à la copie juste avant
  l'application.
- **Avant / après en prod** (61 comptes à palier payant, photo lue avant et après) :
  - cycle changé pour 2 comptes seulement : nadegemarcelin78 et boncoin59300 ;
  - annonces changées pour 1 compte : boncoin59300, 14 → 9 ;
  - remontées : aucune ne monte. nadegemarcelin78 1 500 → 871 (629 restantes, `quotas_etat` lu sous son identité) ;
    alizeed48 974 → 301 ; boncoin59300 47 → 27 ; tiblancdeshaut 285 → 274 ; doriane-henri 577 → 555 ; les autres
    baissent de 0 à 9 ;
  - Business : inchangé (illimité).
  - `remontees_du_cycle` est fermée à anon et authenticated ; ses appelants appartiennent à postgres.
  - Extension de nadegemarcelin78 vue le 03/11 à 20:22.
  - Pas d'essai réel : la ligne changée de `spend_coins_and_republish` appelle la même fonction que `quotas_etat`, lue en
    prod, et le chemin complet est prouvé sur la base jetable.

## 4. Recompte à blanc avec la règle du § 2 (lecture seule)
Jauge « Publications » = chaque mise en ligne non-synchro, 1 par plateforme, avec ou sans IA, faite ou en cours.

| Palier | 30 j : comptes / méd / p90 / max | Pire mois (60 j) : méd / p90 / max | Max par cycle |
|---|---|---|---|
| Free (avec extension) | 82 / 4 / 10 / 23 | 4 / 10 / 59 | — |
| Premium | 14 / 32 / 66 / 71 | 34 / 81 / 82 | 133 (tessy.galy) |
| Pro | 18 / 79 / 324 / 451 | 104 / 451 / 898 | 445 (xxewwer) |
| Business | 6 / 419 / 1 100 / 1 100 | 646 / 1 100 / 1 100 | 880 |

(Le pire mois glissant peut chevaucher deux cycles : d'où 898 chez un Pro pour 445 au plus dans un cycle.)

- **Proposition** : Free 15, Premium 300, Pro 1 000, Business illimité.
  - Premium 300 couvre 40 annonces × 5 plateformes + 100 (max observé par cycle : 133) → 0 payant gêné.
  - Pro 1 000 couvre 120 × 5 + 400 (max par cycle : 445) → 0 payant gêné.
- **Free au mur** (30 j, 150 actifs avec extension) :
  - par jauge : annonces 5 → 61 ; publications 15 → 3 (20 → 1) ; remontées 30 → 35 (au mur des 50 aujourd'hui : 19) ;
  - au moins un mur : 75 (aujourd'hui, avec 5 / 50 : 66).
- **Mur du lot intact** : un article Free part sur 1 plateforme en médiane (p90 3, max 4 ; 254 articles, 81 comptes). Les
  3 Free qui atteignent 15 publications avaient tous déjà épuisé leurs 5 annonces : personne n'atteint 15 avant.
- **Lens chez les Business** : 1 scan par cycle au plus (Louis), loin de 600. Le plus gros utilisateur de Lens est un
  Pro : 115 scans dans un cycle (xxewwer).
- **Coût IA d'un Business au pire** avec cette règle (estimé, garde-fou de 1 500 lu par jauge, Lens compris dans les
  annonces) :
  - 600 Lens × 0,041 $ = 24,6 $ ;
  - 900 autres rédactions × 0,011 $ = 9,9 $ ;
  - 1 500 publications × 0,0012 $ = 1,8 $ ;
  - 1 500 remontées × 0,0012 $ = 1,8 $ ;
  - 50 retouches × 0,066 $ = 3,3 $.

  Total ≈ 41 $, ou ≈ 73 $ si toutes les publications partent sur eBay. Un abonnement Business rapporte environ 43,5 € une
  fois les frais Stripe et l'URSSAF retirés. Réel sur 30 j : 11,55 $ pour le plus gros Business.
- ⚠️ **Un garde-fou de 1 500 par mois sur les publications gênerait des Business actuels** (aujourd'hui, ils ne sont pas
  comptés) :
  - sebastien64310 : 769 publications en 13,6 jours de cycle (rythme ≈ 1 700 par mois) ;
  - louis-seller : 781 en 16 jours ;
  - gjehly : 555 publications et 396 remontées en 1,3 jour (import de départ) ;
  - recrutementgroupezk704 : 685 publications en une seule journée.

  Pour qu'il ne serve qu'à arrêter une boucle, il faut un plafond par jour au-dessus du maximum observé (ex. 2 000 par
  jour) ou un mensuel d'au moins 5 000. À trancher par Nico avant le binaire.

## 5. Phase 2, serveur : la grille à 3 jauges derrière un interrupteur (03-04/11 nuit — APPLIQUÉE le 04/11, interrupteur à 0)
Décisions de Nico du 03/11 au soir (maquettes validées écran par écran : https://claude.ai/artifact/D3HQXTLv9N8AcygCtSTgjW,
avis dans la collection `avis`) : retouches IA et voix inchangées, hors des 3 jauges ; Business affiché « tout illimité,
sauf Lens (600/mois) et retouches IA (50/mois) » ; baisses du Free confirmées (remontées 50 → 30, publications 50) ;
garde-fous par jour validés (publications 2 000, remontées 2 000, annonces 800 ; Lens sans garde-fou par jour) ; pas
de mode sombre.

- **Migration** `supabase/migrations/20261104000000_trois_jauges_interrupteur.sql`, GÉNÉRÉE par
  `scripts/quotas/generer-trois-jauges.mjs` depuis les définitions de prod lues le 03/11 vers 23:55
  (`scripts/quotas/fixtures/prod-0311-trois-jauges.sql`, empreintes md5 en tête). Chaque retouche tombe une fois ou
  le script s'arrête. Inverse : `supabase/rollbacks/20261104000000_trois_jauges_interrupteur_INVERSE.sql`.
- **Interrupteur** `coin_config.grille_trois_jauges`, posé à 0. 17 clés neuves (`jauge_<annonces|publications|remontees>_<palier>`,
  0 = illimité ; `jauge_lens_business` 600 ; `garde_jour_*`), ON CONFLICT DO NOTHING : aucune clé existante touchée.
- **7 fonctions neuves**, fermées aux clients : `jauges_actives`, `jauge_annonces_plafond` (à 0 : `quota_annonces_compte`
  à l'identique ; grille : 0 = illimité, le réglage du compte ne bride plus le Business), `quota_remontees_plafond`,
  `jauge_publications_plafond`, `jauge_lens_plafond`, `publications_du_cycle` (même règle que `remontees_du_cycle`,
  action publish), `garde_fou_jour` (heure de Paris, message honnête, jamais une offre).
- **8 fonctions de prod retouchées** : `quotas_etat` (clés `grille`, `annonces_mode`, `publications`, `lens` seulement
  avec l'interrupteur), `quota_republication_free_etat`, `spend_coins_for_generate`, `spend_coins_for_lens`,
  `spend_coins_and_publish` (jauge Publications avant tout débit, verrou par compte, un appel de l'app ne pose plus
  « hors quota » lui-même), `spend_coins_and_republish`, `republish_planifiee_etat`, `remise_en_vente_place`.
- **Compatibilité, sans redéployer de fonction edge** : refus de publication avec `message` (filet générique de l'app,
  04/08) ; garde-fou de la rédaction sous `pro_daily_cap_reached` (generate-listing relaie le message) ; Lens du
  Business et garde-fou Lens sous `quota_scan_atteint` (lens-analysis le relaie) ; remontée automatique sous
  `plafond_auto_atteint` (connu de l'extension 0.6.169). Bordereaux : rien à changer (Pro et Business depuis le 24/10).
- **Preuve** : `PREUVE_PG=embarque node scripts/quotas/preuve-trois-jauges.mjs`, 110/110 sur Postgres 17 jetable. A. à 0,
  pour 6 comptes témoins (Free, Premium, Pro, Business, Business réglé à 1 000, Free neuf), 11 appels chacun, avant et
  après la migration dans la même transaction : identiques. B. à 1 : la grille, les compteurs (annulées, échouées,
  synchro, hors quota, retraits, avant le cycle jamais comptés), les refus et leurs messages, les trois garde-fous,
  Lens 600, la régénération sous 24 h hors garde-fou, retour à 0. C. l'inverse rend les 8 définitions de prod à
  l'empreinte près. Preuve du 03/11 (`preuve-cycle-remontees.mjs`) : 38/38. Selftest `trois-jauges` : 80 contrôles.
- **Appliquée** le 04/11 (feu vert de Nico) : empreintes avant = fixture ; après, 19 corps relus = migration ou inchangés,
  7 fonctions neuves fermées aux clients, 17 clés, interrupteur à 0, migration inscrite. Cf. `docs/agents/etat-2026-10-01.md`.
  (CLI : `db query --linked -f` demande désormais une confirmation ; `--yes` seulement sur ordre de Nico.)
- **Reste avant de basculer** : l'app (maquettes validées), derrière la même clé ; l'avant / après des compteurs
  payants juste avant de passer l'interrupteur à 1.
