// (21/11/2026, ordre de Nico, point 3) Remettre le texte du vendeur, UNE FOIS LU sur la fiche, sur les 4 annonces eBay en
// ligne du compte 8fd44622 (publiées par l'API le 19/11 avec un texte de l'IA) — sur place, sans retrait ni republication.
//   node scripts/reparations/20261121_texte_vendeur_ebay_8fd44622.mjs            (simulation : rien n'est écrit)
//   node scripts/reparations/20261121_texte_vendeur_ebay_8fd44622.mjs --executer (seulement si chaque fiche est lue)
// Par annonce, la fonction remise-texte-vendeur-ebay dit : texte_pas_encore_lu (rien), deja_bon, different_du_depot (rien :
// changée par la personne), texte_a_remettre (simulation) ou la modification faite. Clé de service lue par la CLI, jamais écrite.
// Inverse : la description d'avant est dans cross_post_jobs.description d'avant la modification (sauvegarde
// _backup_2111_texte_ia_8fd44622 pour la fiche) — à republier à la main par la même fonction si besoin (jamais fait seul).
// Leboncoin (4) : rien ici — leur prochaine republication part avec le texte lu (get-pending-jobs, contenuAImposer).
// L'annonce eBay du mug (compte 52f5dc70, 880138201156) a été publiée par l'EXTENSION : l'API ne la modifie pas.
import { spawnSync } from "node:child_process";
const REF = "tojihnuawsoohlolangc";
const JOBS = ["cf082176-8232-44e2-a95e-9ee8b283d7bc", "c867e948-7c4a-4876-9b0e-3605917cab52", "3ce2efb6-ef98-4567-8a00-a4e8b8059c50", "edc2b55c-a27f-4442-ac6a-4eecb62d4d11"];
const executer = process.argv.includes("--executer");
const r = spawnSync("npx", ["supabase", "projects", "api-keys", "--project-ref", REF, "-o", "json"], { encoding: "utf8", shell: true });
const service = JSON.parse(r.stdout).find((k) => k.name === "service_role")?.api_key;
if (!service) { console.error("clé de service illisible"); process.exit(2); }
for (const job_id of JOBS) {
  const rep = await fetch(`https://${REF}.supabase.co/functions/v1/remise-texte-vendeur-ebay`, {
    method: "POST", headers: { Authorization: `Bearer ${service}`, apikey: service, "content-type": "application/json" },
    body: JSON.stringify({ job_id, executer }),
  });
  const corps = await rep.json().catch(() => null);
  console.log(job_id.slice(0, 8), rep.status, corps?.verdict ?? corps?.motif ?? "?", corps?.changements ? corps.changements.join(",") : "");
}
