// (06/11 ~12:30, ordre de Nico — séries de Louis, compte Amiral) Les 7 remises en vente Leboncoin déposées à 07:22-07:29
// alors que les annonces vendues étaient encore en ligne : refusées par Leboncoin (« annonce identique déjà en ligne »,
// contrôle automatique), JAMAIS parues, « published » chez nous. Réparation par la règle B (_shared/depot-lbc-jamais-en-ligne.js,
// patchDepotLbcJamaisEnLigne) : chaque remise repart (pending, sans message), numéro / lien / date du dépôt refusé vidés et
// gardés dans depots_refuses_lbc ; la règle A (get-pending-jobs v337) la retient tant que l'annonce vendue est en ligne,
// puis la redépose — aucun doublon. Preuves (les trois de la règle) : jamais vues par un relevé ; relevés « Mes annonces »
// COMPLETS du 06/11 à 10:13 et 10:19 (402 lues sur 401) sans elles ; pages relues 410 « Cette annonce est désactivée » le
// 06/11 à 12:20 (onglet leboncoin.fr de Nico, lecture seule) — la veille ne les avait pas encore relues, d'où ce script.
//   node scripts/reparations/20261106_louis_remises_refusees_lbc.mjs <remises.json> > …sql
import { readFileSync } from "node:fs";
import { patchDepotLbcJamaisEnLigne, estRemiseEnVente } from "../../supabase/functions/_shared/depot-lbc-jamais-en-ligne.js";
import { archiverErreur } from "../../supabase/functions/_shared/erreurs-archivees.js";

const jobs = JSON.parse(readFileSync(process.argv[2], "utf8"));
const maintenant = Date.now();
const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const sorties = [];
for (const j of jobs) {
  if (j.status !== "published" || !estRemiseEnVente(j)) throw new Error(`inattendu : ${j.id}`);
  const verdict = { depot_le: j.published_at, releves: [{ started_at: "2026-11-06T09:13:00Z", items_vus: 402, total_entries: 401 }, { started_at: "2026-11-06T09:19:00Z", items_vus: 402, total_entries: 401 }],
    lecture: { source: "page_publique", http: 410, h1: "Cette annonce est désactivée", lu_le: "2026-11-06T11:20:06Z", lu_par: "Claude, onglet leboncoin.fr de Nico (lecture seule), ordre de Nico du 06/11" } };
  const p = patchDepotLbcJamaisEnLigne(j, verdict, { maintenant, par: "réparation 06/11 (Nico, séries de Louis) — règle B" });
  if (j.error) p.platform_fields.erreurs_archivees = archiverErreur(p.platform_fields.erreurs_archivees, j.error, "published", "réparation 06/11 (règle B)");
  sorties.push({ id: j.id, numero: j.platform_listing_id, p });
}
console.log(`-- Produit par scripts/reparations/20261106_louis_remises_refusees_lbc.mjs le ${new Date(maintenant).toISOString()} : ${sorties.length} remise(s).
-- Inverse : 20261106_louis_remises_refusees_lbc_INVERSE.sql.
BEGIN;
DO $g$ BEGIN IF to_regclass('public._backup_0611_louis_remises') IS NOT NULL THEN RAISE EXCEPTION 'déjà passé'; END IF; END $g$;
CREATE TABLE public._backup_0611_louis_remises AS
SELECT now() AS le, j.id, j.status, j.error, j.platform_listing_id, j.listing_url, j.published_at, j.platform_fields FROM public.cross_post_jobs j
 WHERE j.id IN (${sorties.map((s) => `'${s.id}'`).join(", ")});
ALTER TABLE public._backup_0611_louis_remises ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_louis_remises FROM PUBLIC, anon, authenticated;
${sorties.map((s) => `UPDATE public.cross_post_jobs SET status = 'pending', error = NULL, platform_listing_id = NULL, listing_url = NULL, published_at = NULL,
  platform_fields = ${lit(s.p.platform_fields)} WHERE id = '${s.id}' AND status = 'published' AND platform_listing_id = '${s.numero}';`).join("\n")}
SELECT left(j.id::text, 8) id, j.status, j.platform_listing_id, j.platform_fields->'depots_refuses_lbc'->0->>'numero' refuse, j.platform_fields->'remise_en_vente'->>'annonce_vendue' vendue
  FROM public.cross_post_jobs j JOIN public._backup_0611_louis_remises b ON b.id = j.id ORDER BY 4;
COMMIT;`);
