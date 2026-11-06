// Autotest — un poste trop ancien : ce que la personne voit (03/10, point 25 ; règle changée le 06/11)
//   npm run selftest:extension-a-mettre-a-jour
//
// geronimo0550, extension 0.6.79, Chrome allumé jusqu'à 01:49 : ses 7
// publications du 02/10 au soir ne sont jamais parties — depuis le 02/10, le
// serveur ne servait RIEN à un poste plus ancien que la 0.6.81 (sauf une remise
// en ligne commencée). L'écran disait « Dans la file — Chrome la prend à son
// tour », la carte « En cours… ». Elles sont parties dès la 0.6.89.
//
// ⛔ (06/11, Nico : version minimum ABANDONNÉE DÉFINITIVEMENT) Le serveur sert sa file à tout poste, quel que soit
// son build : aucune tâche n'attend la mise à jour. Aucun écran ne dit donc « En pause — mise à jour de l'extension » ;
// le bandeau d'App peut seulement INFORMER qu'une nouvelle version existe, sans jamais dire que la file attend.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { extensionAMettreAJour, phraseMiseAJourExtension } = await imp("src/utils/extensionAJour.js");
const { situationJob } = await imp("src/utils/fileDesJobs.js");
const { EXTENSION_MIN_BUILD, posteExtensionCompatible } = await imp("supabase/functions/_shared/version-min-extension.js");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LA RÈGLE (06/11) : AUCUNE TÂCHE N'ATTEND LA MISE À JOUR");
const T = Date.parse("2026-10-02T23:30:00Z");
const B0679 = "2026-09-28T21:44:46Z+52b214b · v0.6.79";   // le build RÉEL de geronimo0550
const B0689 = "2026-10-02T21:10:00Z+1a49399 · v0.6.89";
const B06124 = "2026-10-17T18:16:49Z+ced6cfd · v0.6.124";
// La valeur ne bouge plus (elle ne nourrit que le bandeau d'information) : jamais relevée à la 0.6.175.
ok(EXTENSION_MIN_BUILD === "2026-10-17T18:16:49Z", "EXTENSION_MIN_BUILD inchangé (0.6.124) — ne se pose JAMAIS plus");
ok(posteExtensionCompatible(B0679) === false && posteExtensionCompatible(B06124) === true, "le bandeau sait encore qu'une version plus récente existe");
for (const [b, nom] of [[B0679, "0.6.79"], [B0689, "0.6.89"], [B06124, "0.6.124"], [null, "build inconnu"]]) {
  ok(extensionAMettreAJour({ build: b, lastSeenAt: "2026-10-02T23:49:00Z", maintenant: T }) === false, `${nom} : sa file n'attend rien`);
}

console.log("\n2. LA FILE ET LES BARRES : « À SON TOUR », JAMAIS « EN PAUSE — MISE À JOUR »");
const job = (x) => ({ id: "j", inventaire_id: 1, platform: "vinted", action: "publish", status: "pending", created_at: "2026-10-02T21:00:00Z", platform_fields: {}, voie: "extension", ...x });
const ctx = { maintenant: T, lang: "fr", extension: { etat: "vivante" }, extensionAMettreAJour: extensionAMettreAJour({ build: B0679, lastSeenAt: "2026-10-02T23:49:00Z", maintenant: T }) };
ok(situationJob(job({}), ctx).raison === "En file : elle partira à son tour", "publication en file sur un poste en 0.6.79 : « elle partira à son tour »", situationJob(job({}), ctx).raison);
ok(situationJob(job({}), ctx).motif !== "mise_a_jour", "jamais le motif « mise_a_jour »");
// La phrase reste pour les tâches mises en pause AVANT le 06/11 (needs_user_source « build_min_requis »), relancées par handler-watch.
ok(/ferme Chrome complètement puis rouvre-le/.test(phraseMiseAJourExtension("fr")), "la phrase d'avant reste lisible (pauses posées avant le 06/11)");

console.log("\n3. CHAQUE ÉCRAN");
const stock = lire("src/tabs/StockTab.jsx");
ok(/extensionAMettreAJour: false,\s*(\/\/[^\n]*\n\s*)*cloud: compteCloud,/.test(stock), "le Stock ne passe plus « poste trop ancien » aux barres et à la file");
ok(!stock.includes("const majRequise") && !stock.includes("pastilleCourte({ genre: 'maj' }"), "la carte ne dit plus « En pause » pour la mise à jour");
const fdj = lire("src/components/FileDesJobs.jsx");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(fdj.includes("extensionAMettreAJour(") && lps.includes("extensionAMettreAJour("), "la file et le parcours passent par extensionAMettreAJour (toujours false)");
const app = lire("src/App.jsx");
ok(!app.includes("ta file reprendra toute seule après la mise à jour") && !app.includes("your queue will resume on its own after the update"),
  "le bandeau d'App ne dit plus que la file attend la mise à jour (fr et en)");
ok(app.includes("ta file continue de tourner") && app.includes("your queue keeps running"), "le bandeau INFORME : la file continue de tourner (fr et en)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ (06/11) poste ancien : sa file part, aucun écran ne dit qu'elle attend la mise à jour");
