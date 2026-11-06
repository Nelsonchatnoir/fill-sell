// (06/11, ordre de Nico, point 1) La tâche 2fd83d73 de Marta MELE (publication Vinted « Gioco PS4 F1 2015 », page
// Vinted italienne) est EN PAUSE « build_min_requis » depuis le 29/10 (handler-watch : « repart toute seule dès que
// l'extension est à jour ») alors que son poste a le build depuis le 02/11 — la relance automatique ne l'a jamais
// reprise. La version minimum est abandonnée (06/11) : plus aucune pause pour une extension trop ancienne. Relance par le
// CIRCUIT NORMAL, mot pour mot celui de handler-watch (« UN ÉCHEC QU'UNE EXTENSION CORRIGE REPART ») : regleDeRelance →
// champsRelance (_shared/relance-apres-maj.js), motif archivé (archiverErreur), status pending, error NULL ; fiche relue
// au stock. Rien d'autre.
//   node scripts/reparations/20261106_relance_marta_pause_version.mjs <job.json> > 20261106_relance_marta_pause_version.sql
import { readFileSync } from "node:fs";
import { regleDeRelance, champsRelance } from "../../supabase/functions/_shared/relance-apres-maj.js";
import { archiverErreur } from "../../supabase/functions/_shared/erreurs-archivees.js";

const { job: j, extension_build: eb, fiche } = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (j?.id !== "2fd83d73-f43b-4362-811f-f447b98b865b" || j.status !== "needs_user" || j.platform_fields?.needs_user_source !== "build_min_requis") {
  throw new Error("tâche inattendue (déjà relancée ?)");
}
if (fiche?.statut !== "stock" || fiche?.fusionne_dans) throw new Error("fiche plus au stock : rien");
const regle = regleDeRelance(j);
if (!regle) throw new Error("aucune règle de relance ne couvre la tâche");
const le = new Date().toISOString();
const pf = champsRelance(j, regle, { maintenant: le, extensionBuild: eb });
pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, j.error, "needs_user", "réparation 06/11 (Nico, point 1 : version minimum abandonnée)");
const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
console.log(`-- Produit par scripts/reparations/20261106_relance_marta_pause_version.mjs le ${le} (règle ${regle.cle}).
-- Inverse : 20261106_relance_marta_pause_version_INVERSE.sql.
BEGIN;
DO $garde$ BEGIN
  IF to_regclass('public._backup_0611_relance_marta') IS NOT NULL THEN RAISE EXCEPTION 'script déjà passé : rien n''est écrit'; END IF;
END $garde$;
CREATE TABLE public._backup_0611_relance_marta AS
SELECT now() AS le, j.id, j.status, j.error, j.platform_fields FROM public.cross_post_jobs j WHERE j.id = '${j.id}';
ALTER TABLE public._backup_0611_relance_marta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_relance_marta FROM PUBLIC, anon, authenticated;
DO $ecrit$ DECLARE n int; BEGIN
  UPDATE public.cross_post_jobs SET status = 'pending', error = NULL, platform_fields = ${lit(pf)}
   WHERE id = '${j.id}' AND status = 'needs_user' AND platform_fields->>'needs_user_source' = 'build_min_requis';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'la tâche a bougé : rien n''est écrit'; END IF;
END $ecrit$;
SELECT id, status, error, platform_fields->'relance_apres_maj' relance FROM public.cross_post_jobs WHERE id = '${j.id}';
COMMIT;`);
console.error(`relance ${j.id} par ${regle.cle}`);
