// (06/11 ~12:00, ordre de Nico, point 7 — URGENT ayadi007, Business) Ses publications eBay par l'extension butent à CHAQUE
// clic « Mettre en vente » sur ebaypayonboardingweb.ebay.com/account-status-error/ (configuration des paiements de son
// compte vendeur eBay en erreur) — prises pour une mise en veille de Chrome, reprises sans fin. La règle est corrigée et
// déployée (update-job-status v176, get-pending-jobs v335 : _shared/ebay-page-vendeur.ts estPagePaiementsVendeurEbay) ;
// ce script lui applique la MÊME transformation, tout de suite, pour les tâches en attente dont la dernière fin est ce
// mur (sinon chacune retaperait le mur une fois de plus) : needs_user `ebay_compte_vendeur_inactif`, mur « paiements »,
// message du geste chez eBay, compteur de la base, motif d'avant archivé. Une tâche « processing » n'est jamais touchée
// (son retour passe par la règle). Rien n'est publié ni retiré ; aucune annonce eBay n'a été créée (eBay refuse la mise en
// vente avant le paiement configuré — vérifié aussi par la recherche publique eBay).
//   node scripts/reparations/20261106_ayadi007_mur_paiements_ebay.mjs <jobs.json> > …sql
import { readFileSync } from "node:fs";
import { MESSAGE_PAIEMENTS_EBAY } from "../../supabase/functions/_shared/vendeur-ebay.js";
import { archiverErreur } from "../../supabase/functions/_shared/erreurs-archivees.js";

const jobs = JSON.parse(readFileSync(process.argv[2], "utf8"));
const le = new Date().toISOString();
const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const out = [];
for (const j of jobs) {
  const pf = j.platform_fields ?? {};
  const fins = Array.isArray(pf.work_window_state?.fins) ? pf.work_window_state.fins : [];
  const fin = fins.length ? fins[fins.length - 1] : pf.work_window_state?.at_end;
  if (j.status !== "pending" || j.platform !== "ebay" || !/^https:\/\/ebaypayonboardingweb\.ebay\.[a-z.]+\//.test(String(fin?.tab_url ?? ""))) continue;
  const { next_action_after, needsUserField, needsUserFields, champs_a_completer, serverRequired, server_required_fields, bfcache_rearms, ...pfSans } = pf;
  const n = { ...pfSans };
  n.needs_user_source = "ebay_compte_vendeur_inactif";
  n.compte_vendeur_inactif = {
    depuis: le, derniere: le, observations: fins.filter((f) => /ebaypayonboardingweb/.test(String(f?.tab_url ?? ""))).length || 1,
    tab_url: String(fin.tab_url).slice(0, 300), fill_step: fin.fill_step ?? null, verdict_extension: j.error ? String(j.error).slice(0, 600) : null,
    mur: "paiements", pose_par: "réparation 06/11 (Nico, point 7) : la règle update-job-status v176 appliquée à la tâche en attente",
  };
  n.erreurs_archivees = archiverErreur(pf.erreurs_archivees, j.error, "pending", "réparation 06/11 (mur des paiements eBay, pas un incident Chrome)");
  out.push({ id: j.id, pf: n });
}
if (!out.length) throw new Error("aucune tâche à requalifier");
console.log(`-- Produit par scripts/reparations/20261106_ayadi007_mur_paiements_ebay.mjs le ${le} : ${out.length} tâche(s).
-- Inverse : 20261106_ayadi007_mur_paiements_ebay_INVERSE.sql.
BEGIN;
DO $g$ BEGIN IF to_regclass('public._backup_0611_ayadi007_mur_paiements') IS NOT NULL THEN RAISE EXCEPTION 'déjà passé'; END IF; END $g$;
CREATE TABLE public._backup_0611_ayadi007_mur_paiements AS
SELECT now() AS le, j.id, j.status, j.error, j.platform_fields FROM public.cross_post_jobs j WHERE j.id IN (${out.map((o) => `'${o.id}'`).join(", ")});
ALTER TABLE public._backup_0611_ayadi007_mur_paiements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_ayadi007_mur_paiements FROM PUBLIC, anon, authenticated;
${out.map((o) => `UPDATE public.cross_post_jobs SET status = 'needs_user', error = ${lit(MESSAGE_PAIEMENTS_EBAY).replace("::jsonb", "")}, platform_fields = ${lit(o.pf)}
 WHERE id = '${o.id}' AND status = 'pending';`).join("\n")}
SELECT left(j.id::text, 8) id, j.status, j.platform_fields->>'needs_user_source' nus, j.platform_fields->'compte_vendeur_inactif'->>'mur' mur
  FROM public.cross_post_jobs j JOIN public._backup_0611_ayadi007_mur_paiements b ON b.id = j.id;
COMMIT;`);
console.error(`${out.length} tâche(s) : ${out.map((o) => o.id.slice(0, 8)).join(", ")}`);
