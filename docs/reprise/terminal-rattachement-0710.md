# Reprise — terminal « rattachement avant stock » (07/10)

Règle de Nico : « un article n'entre JAMAIS dans le stock tant qu'il n'a pas
été rapproché de tout ce que l'utilisateur a déjà ». Détail, mesures,
simulation : `docs/rattachement-avant-stock.md`.

## Où on en est (07/10, 15 h)
- Feu vert de Nico sur 20261007140000 (« Feux vert … go ») ; l'application a
  été REFUSÉE par le classifieur du mode auto → Nico la lance lui-même (§ 1).
- En prod : fonction `rapprochement` **v2** (`false`, 401 sans secret),
  `ops-digest` v32 (pauses de relevés listées). Rien d'autre.
- Les 7 fonctions remplacées par la migration sont identiques, en prod, à la
  capture du matin (relu à 14:45) : l'inverse
  (`scripts/reparations/20261007140000_rattachement_avant_stock_INVERSE.sql`)
  est à jour.
- Simulation du parc faite (98 comptes, 0 échec) ; RIEN n'est appliqué.
- Corinne : pause Leboncoin + Beebs toujours en place (`pause_releves`,
  `leve_le` NULL), stock 518, plus rien créé depuis 12 h.
- Commits locaux NON poussés (6d6e012 → HEAD) ; web/OTA servis : 2.9.65.

## 1. Par Nico (deux lignes, dans ce terminal, préfixe « ! »)
```
! npx supabase db query --linked -f supabase/migrations/20261007140000_rattachement_avant_stock.sql
! npx supabase migration repair --linked --status applied 20261007140000
```

## 2. Ensuite (l'agent)
1. Relire : fonctions `rapprochement_avancer`, `synchro_avancement`,
   déclencheur `trg_rapprochement_fin_run`, cron `rapprochement-1min`
   (`net._http_response` en 200 au premier passage) ; en-tête de la migration
   « APPLIQUÉE … ».
2. `handler-watch` : geste avant/après, `npx supabase functions deploy
   handler-watch --no-verify-jwt` (v90 → v91, `false`).
3. Preuve sur ce qui tourne : `node scripts/reparations/20261007_preuve_rattachement_avant_stock.mjs --en-prod`.
4. Corinne : `node scripts/reparations/20261007_rattrapage_releves.mjs
   --appliquer --user 771ac4d9-727c-4f68-bd8c-f4c7e8056a03`, puis le moteur
   sur ses annonces en attente (`rapprochement_demander` + `rapprochement_relancer`),
   puis `scripts/reparations/20261007_corinne_leve_pause_relance.sql` (leve_le
   posé, relevés LBC + Beebs en file `app`) ; vérifier : aucun article créé
   en double, stock ≈ 475.
5. Parc : `--appliquer --tous` (pause si CPU > 60 %), totaux contre la
   simulation.
6. Essai réel sur le compte de Nico (f44b5917…, extension vivante) : relevés
   en file, durée des relevés + du moteur, stock inchangé (rien de nouveau).
7. 2.9.66 : commit de version, `npm run build`, UN push, build.json +
   entrée avec `Origin`, OTA Capgo, canal relu.
8. État (`docs/agents/etat-2026-10-01.md` § « 07/10 »), bloc de tête de
   CLAUDE.md, mémoire.

## Inverses
- Migration : `scripts/reparations/20261007140000_rattachement_avant_stock_INVERSE.sql`.
- Rattrapage : `scripts/reparations/20261007_rattrapage_releves_INVERSE.sql`.
- Pause de Corinne : `UPDATE pause_releves SET leve_le = NULL WHERE user_id = '771ac4d9-…'`.
