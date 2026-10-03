// Autotest — une republication reprend toujours l'état de son annonce (03/10, point E)
//   npm run selftest:etat-repris
//
// dew : compte Vinted FRANÇAIS, page en ANGLAIS. 5 republications arrêtées au
// pré-vol sur « Condition (accepte : New with tags · … ) » alors que la copie
// de chaque annonce porte son état (status_id 2 ou 3). Formes RELEVÉES en base
// le 03/10 (jobs a628e7ef, f17d14f7).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { etatReprisPourJob, etatDansLaLangueDeLaPage } = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/etat-repris.ts")).href);
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const EN5 = ["New with tags", "New without tags", "Very good", "Good", "Satisfactory"];
const EN6 = [...EN5, "Not fully functional"];
const FR5 = ["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"];
const job = (sid, racine, liste, pf = {}) => ({
  platform: "vinted", action: "republish", status: "needs_user",
  platform_fields: {
    needs_user_source: "prevol_negatif", champs_a_completer: ["Condition"],
    needsUserField: { field_key: "condition", field_label: "Condition", allowed_values: liste },
    republish_snapshot: { status_id: String(sid), categoryPath: [racine, "Accessories"], etat: "Très bon état" },
    ...pf,
  },
});

console.log("\n1. LES CAS DE DEW (forme relevée en base)");
{
  const r = etatReprisPourJob(job(2, "Men", EN5));
  ok(r?.valeur === "Very good" && r?.langue === "en" && r?.status_id === 2, "sac à dos (status 2, page anglaise) → « Very good »", JSON.stringify(r));
  const c = etatReprisPourJob(job(3, "Electronics", EN6));
  ok(c?.valeur === "Good", "clavier (status 3, liste à 6 états) → « Good »", JSON.stringify(c));
}

console.log("\n2. CE QUI N'EST JAMAIS TOUCHÉ");
ok(etatReprisPourJob(job(2, "Hommes", FR5)) === null, "page française : la question reste (le libellé français était déjà le bon)");
ok(etatReprisPourJob(job(2, "Men", EN5, { etat_repris: { le: "x" } })) === null, "déjà repris une fois : jamais en boucle");
ok(etatReprisPourJob(job(2, "Men", EN5, { champs_a_completer: ["Condition", "Size"] })) === null, "un autre champ manque aussi : la question reste");
ok(etatReprisPourJob(job(2, "Men", EN5, { vintedAspects: { condition: "Good" } })) === null, "la personne a répondu : sa réponse prime");
ok(etatReprisPourJob(job(1, "Women", ["New with tags"])) === null, "état absent de la liste offerte par la page : rien de posé");
ok(etatReprisPourJob({ ...job(2, "Men", EN5), status: "pending" }) === null, "seulement un job arrêté (needs_user)");
ok(etatReprisPourJob({ ...job(2, "Men", EN5), action: "publish" }) === null, "seulement une republication (la copie porte l'état)");
ok(etatDansLaLangueDeLaPage({ republish_snapshot: { status_id: "x", categoryPath: ["Men"] } }, EN5) === null, "identifiant d'état illisible : rien");

console.log("\n3. CÂBLAGE");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/const etat = etatReprisPourJob\(j\);/.test(hw) && /\.update\(\{ status: "pending", error: null, platform_fields: pfJ \}\)\s+\.eq\("id", j\.id as string\)\.eq\("status", "needs_user"\)/.test(hw),
  "handler-watch : repart seul, écriture conditionnelle (toutes versions d'extension)");
ok(/pfJ\.vintedAspects = \{ \.\.\.\(\(pfJ\.vintedAspects \?\? \{\}\) as Record<string, unknown>\), condition: etat\.valeur \};/.test(hw),
  "posé dans vintedAspects.condition : le canal que toutes les extensions lisent");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/const francaisPageEtrangere = \(!pays\.length \|\| pays\.includes\("FR"\)\) && !!langue && langue !== "fr";/.test(gpj),
  "get-pending-jobs : un compte français à page étrangère reçoit l'état dans la langue de sa page");
ok(/if \(!francaisPageEtrangere\) \{\s+if \(!pays\.length \|\| pays\.includes\("FR"\)\) continue;/.test(gpj),
  "… sans identifiants ni autorisation : le chemin français reste celui d'avant");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ état repris : l'identifiant vient de l'annonce, le libellé de la langue de la page");
