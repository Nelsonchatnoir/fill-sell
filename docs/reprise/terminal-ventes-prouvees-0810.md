# Reprise — ventes prouvées « sold » (08/10 nuit)

Mandat de Nico : recontrôler l'urgence U1 de l'audit (lecture seule), corriger à
la racine (un appelant borné, seule une preuve « sold », la chaîne de retrait
existante, une veille), préparer le rattrapage À BLANC ; rien appliquer, rien
déployer, aucun mail. Rapport : `docs/enquetes/ventes-prouvees-0810/RAPPORT.md`.

## Ce qui est fait (dans le dépôt, poussé)

- `supabase/migrations/20261008233000_ventes_prouvees_index.sql` — index partiel
  (CONCURRENTLY, seul) ; **NON appliquée**.
- `supabase/migrations/20261008233100_ventes_prouvees_automatiques.sql` — sélection,
  exécuteur, passage borné, veille, cron SQL `ventes-prouvees-2min`, armement
  daté ; **NON appliquée**. Inverse : `supabase/rollbacks/20261008233100_ventes_prouvees_automatiques_INVERSE.sql`.
- `supabase/functions/_shared/ventes-prouvees.js` (décision de la veille),
  `veille-cpu/index.ts` (alerte support@, une par heure au plus),
  `ops-digest/index.ts` (section « Ventes prouvées », « non branchée » tant que la
  migration manque) — **NON déployées** (veille-cpu v1, ops-digest v34, `false`).
- `scripts/lib/ventes-prouvees-selection.mjs` : la sélection lue DANS la migration
  (rattrapage, mesure, tests jouent le même texte).
- Banc `scripts/ventes-prouvees-banc.mjs` (Postgres jetable, fonctions de prod
  capturées dans `scripts/fixtures/ventes-prouvees-prod-0810.json`) : 57/57,
  mutations 7/7. Lancer : `npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3`
  puis `npm run banc:ventes-prouvees`.
- `selftest:ventes-prouvees` : 57/57, mutations 14/14.
- Rattrapage `scripts/reparations/20261008_rattrapage_ventes_prouvees.mjs` (à
  blanc par défaut) + inverse `…_INVERSE.sql` ; résultat à blanc dans
  `docs/enquetes/ventes-prouvees-0810/RATTRAPAGE-A-BLANC.md`.
- Docs corrigées : CLAUDE.md, AGENTS.md (32 768 octets), consignes du 28/09,
  reprise de clôture multi-synchro, incident Angel, état (section « 08/10 nuit —
  VENTES PROUVÉES »).

## Ce qui attend le feu vert nommé de Nico, dans l'ordre

1. `npx supabase db query --linked -f supabase/migrations/20261008233000_ventes_prouvees_index.sql`
   puis `npx supabase migration repair --linked --status applied 20261008233000`.
2. `npx supabase db query --linked -f supabase/migrations/20261008233100_ventes_prouvees_automatiques.sql`
   puis `npx supabase migration repair --linked --status applied 20261008233100` ;
   relire `select public.ventes_prouvees_veille();` puis, 4 min après,
   `select * from ventes_prouvees_passages order by debut desc limit 3;` et le CPU
   (`veille_cpu`, `pg_stat_statements` sur `ventes_prouvees_tick`).
3. `npx supabase functions deploy veille-cpu --no-verify-jwt` et
   `npx supabase functions deploy ops-digest --no-verify-jwt` (relire `functions list` avant/après).
4. Rattrapage compte par compte (**retraits irréversibles**), urgents d'abord :
   `node scripts/reparations/20261008_rattrapage_ventes_prouvees.mjs --appliquer --feu-vert-nico --user <uuid>`.
5. Trancher les 5 « à vérifier » et les 23 signaux sans preuve (rapport à blanc § 4-5).

Couper sans rien retirer : `UPDATE coin_config SET value = 0 WHERE key = 'ventes_prouvees_auto_depuis';`
