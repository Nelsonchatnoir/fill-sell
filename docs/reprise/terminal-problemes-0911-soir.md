# Reprise — terminal « Problèmes », lot de Nico du 09/11 soir

Suite de `docs/reprise/terminal-problemes-0911-matin.md`. Heures de Paris. Rapports : `docs/enquetes/lbc-mot-de-passe-0911/`,
`docs/enquetes/beebs-vente-louis-0911/`. État de prod : `docs/agents/etat-2026-10-01.md` (entrée du 09/11 soir).

## Fait et en service
- Web en ligne `2026-11-09T20:30:48Z+fd06799` : lien « Me connecter » Leboncoin = www.leboncoin.fr/compte/part/mes-annonces
  (Guillaume JEHLY) ; un relevé raté par un autre poste ne dit plus « Me reconnecter ».
- get-pending-jobs **v357** (20:59, depuis git archive d085be6, contient d9ee076 du terminal Cloud) : relevés routés au
  poste connecté, relevé servi noté sur le poste (`releve_<pf>`), mur posé par un relevé raté de ce poste.
- Extension **0.6.185** fabriquée (lecteur des ventes Beebs réparé) :
  `build/CWS-0.6.185-A-TELEVERSER/fillsell-extension-0.6.185-cws.zip` — à téléverser par Nico (CWS).

## À faire / en attente
1. **Louis (louis-seller@ttfamily.fr) — 5 articles vendus sur Beebs, toujours en ligne ailleurs** (Vinted et Depop pour les 5,
   Leboncoin pour 3) : 34200615 Pyjama Kiabi 10 ans, 34200624 Jean skinny Tape à l'œil 8 ans, 34292479 Jean Tape à l'œil
   9 ans, 34292493 Pantalon velours Zara 9 ans, 34292511 Jean Kiabi 9 ans (SoldOut sur Beebs, aucun retrait FillSell).
   Circuit normal : Louis répond « Vendu » sur les 5 cartes « Plus en ligne — vendue ? » (Nico le prévient ; aucun mail
   de FillSell). Rien n'a été enregistré à sa place. À relire : ventes enregistrées et retraits partis.
2. **Interrupteur `coin_config.ventes_beebs_commandes` = 0 — NE PAS TOUCHER** (ordre de Nico) : il passera à 1 après
   relecture des premiers bilans fantômes `usage_logs ventes_beebs_commandes` venus de la 0.6.185 (et des éventuels
   `ventes_beebs_lecture_echec`). Requête : `select created_at, user_id, metadata from usage_logs where feature in
   ('ventes_beebs_commandes','ventes_beebs_lecture_echec') order by created_at desc limit 50;`
3. **OTA à faire pour les points 1 et 2** (téléphone) : le lien Leboncoin de la carte d'une tâche échouée (`StockTab`) et
   le relevé tu quand un autre poste est connecté (`lireDerniersRunsReleve`) ne sont sur mobile qu'à la prochaine OTA
   (feu vert de Nico ; `docs/agents/pieges.md` § Déploiement, version ≥ 2.9.170, jamais depuis un worktree).
4. **Mercredi 11/11 : point 3 du terminal Cloud** — couper pour les clients Cloud les relevés que le PC lance encore de
   lui-même (migration sur `vinted_sync_runs` ou extension qui lit « plateformes du Cloud ») :
   `docs/enquetes/cloud-un-executant-0911/RAPPORT.md` § 3. Feu vert nommé de Nico, SQL montré, essai sur base jetable.
5. Vérifier en prod que la règle des relevés tourne : postes portant `releve_<pf>`, murs posés par relevé
   (« relevé tombé sur la page de connexion » dans les journaux de get-pending-jobs), relevés laissés au poste connecté.
   Chez Guillaume : ses 83 republications Leboncoin doivent partir par le poste connecté (Chrome, PC Qualcomm).

## Coordination
- Le terminal Cloud a écrit dans get-pending-jobs ce soir (d9ee076). Tout déploiement de gpj part d'un commit qui le
  contient, depuis un `git archive` (jamais le dossier partagé), après comparaison du code en service fichier par fichier.
