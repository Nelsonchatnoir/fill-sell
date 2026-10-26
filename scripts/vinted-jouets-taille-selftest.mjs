// ═══════════════════════════════════════════════════════════════════════════
// UN JOUET VINTED A TOUJOURS UNE TAILLE (26/10, « Maison Gabby » de Louis) — `npm run selftest:vinted-jouets-taille`
// ═══════════════════════════════════════════════════════════════════════════
// « Maisons de poupées » jamais relevée : « Vérifier » disait « Prêt », l'extension s'est arrêtée sur « Taille ».
// Mesure : les 10 rayons « Enfants › Jeux et jouets › … » relevés exigent la même grille (31 valeurs) ; 73 jouets en
// ligne sur 73 portent une taille (45 « Taille unique »). Règle : l'exigence est connue AVANT l'envoi (ligne
// synthétique), un OBJET prend « Taille unique » (jamais un déguisement, jamais à la place d'une taille écrite), et
// le serveur répond seul à la question déjà posée (handler-watch, R7).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const imp = (p) => import(pathToFileURL(join(RACINE, p)).href);
const V = await imp("supabase/functions/_shared/vinted-exigences.js");
const Q = await imp("supabase/functions/_shared/taille-question-auto.js");
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };

const GABBY = ["Enfants", "Jeux et jouets", "Poupées, poupons et accessoires", "Maisons de poupées"];
const DEGUISEMENT = ["Enfants", "Jeux et jouets", "Déguisements et jeux de rôle", "Déguisements"];
console.log("1. La règle");
ok(V.vintedExigeUneTaille(GABBY) && V.vintedExigeUneTaille(["Enfants", "Jeux et jouets", "Peluches"]), "tout rayon de jouets exige une taille, même jamais relevé");
ok(!V.vintedExigeUneTaille(["Femmes", "Vêtements", "Robes"]) && !V.vintedExigeUneTaille(["Maison", "Décoration"]), "hors des jouets : le catalogue décide, comme avant");
ok(V.vintedObjetSansTaille(GABBY) && !V.vintedObjetSansTaille(DEGUISEMENT) && !V.vintedObjetSansTaille(["Enfants", "Jeux et jouets", "Loisirs créatifs", "Tabliers et blouses"]), "un objet : oui ; un déguisement, un tablier : non (ils se portent)");
ok(V.VINTED_TAILLES_JOUETS.length === 31 && V.VINTED_TAILLES_JOUETS.includes("Taille unique"), "la grille mesurée : 31 valeurs, dont « Taille unique »");

console.log("\n2. L'écran le sait avant l'envoi (plus de « Prêt » à tort)");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/!rows\.some\(r => r\.field_key === "size"\) && vintedExigeUneTaille\(String\(key\)\.split\(" > "\)\)\)/.test(lps) && /synthetique: "vinted_taille_exigee"/.test(lps), "ligne synthétique « Taille » quand le catalogue n'en a pas");
ok(/if \(platform === "vinted" && vintedObjetSansTaille\(cheminListe\)\) \{[\s\S]{0,200}source: "objet_sans_taille"/.test(lps) && /new Set\(\["objet_sans_taille",/.test(lps), "un objet sans taille dite reçoit « Taille unique », posée sur la copie (jamais la fiche)");

console.log("\n3. Le serveur répond seul à la question déjà posée (Louis, job du 26/10 12:11)");
const job = (pf) => ({ status: "needs_user", platform: "vinted", platform_fields: { taille: "", categoryPath: GABBY,
  needsUserField: { platform: "vinted", field_key: "size", field_label: "Taille", input_type: "grid", allowed_values: [...V.VINTED_TAILLES_JOUETS], target: { root: "vintedAspects", key: "size" } }, ...pf } });
const rep = Q.reponseTailleAuto(job({}), null, ["Maison Gabby chat et accessoires", "Âge recommandé : À partir de 1 an. Très bon état."]);
ok(rep?.valeur === "Taille unique" && rep?.regle === "R7", "« Maison Gabby » → « Taille unique » (jamais « 12-18 mois » d'un âge recommandé)", JSON.stringify(rep));
ok(Q.reponseTailleAuto(job({ taille: "4 ans" }))?.valeur === "4 ans / 104 cm", "une taille écrite passe devant (« 4 ans » → « 4 ans / 104 cm »)");
const deg = Q.reponseTailleAuto({ ...job({}), platform_fields: { ...job({}).platform_fields, categoryPath: DEGUISEMENT } }, null, ["Déguisement de pirate"]);
ok(deg === null, "un déguisement sans taille : la question reste à la personne");

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
