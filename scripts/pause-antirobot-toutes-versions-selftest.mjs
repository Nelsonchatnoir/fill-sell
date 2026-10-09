// Autotest — une pause anti-robot Vinted de plus de 6 h passe à la personne,
// pour TOUT le parc, et une extension trop ancienne dit le geste qui la met à
// jour (03/10, point 24 — cynthiabuterne) — npm run selftest:pause-antirobot-toutes-versions
//
// cynthiabuterne (gratuit, extension 0.6.80) : 8 republications « en pause
// anti-robot » depuis le 27/09 (sonde Vinted 403). La règle « au-delà de 6 h,
// c'est un geste » ne tournait QUE dans le poll de get-pending-jobs — qu'un
// poste sous le seuil de version (0.6.81) n'atteint jamais, et qu'un poste
// éteint n'appelle pas (gabyaviat10700, 5 jobs, poste muet depuis le 02/10).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const { PAUSE_VINTED_GESTE_MS, messagePauseVintedGeste } = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/mur-geste.js")).href);
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LE VEILLEUR APPLIQUE LA RÈGLE DES 6 H À TOUT LE PARC");
const hw = lire("supabase/functions/handler-watch/index.ts");
const i = hw.indexOf("// ══ PAUSE ANTI-ROBOT VINTED DE PLUS DE 6 H : À LA PERSONNE, TOUTES VERSIONS");
const bloc = hw.slice(i, hw.indexOf("// ══ eBay EXIGE UNE MISE À NIVEAU", i));
ok(i > 0, "le veilleur porte la règle (avant : seul le poll, jamais atteint sous le seuil ni poste éteint)");
ok(/import \{ PAUSE_VINTED_GESTE_MS, messagePauseVintedGeste \} from "\.\.\/_shared\/mur-geste\.js";/.test(hw), "même seuil et même texte que get-pending-jobs (un seul module)");
ok(/\.not\("platform_fields->attente_antirobot_compte", "is", null\)/.test(bloc) && /Date\.now\(\) - depuisMs <= PAUSE_VINTED_GESTE_MS\) continue;/.test(bloc), "seulement une pause posée depuis plus de 6 h");
ok(/if \(j\.action === "republish" && String\(pf\.republish_step \?\? ""\) === "deleted"\) continue;/.test(bloc), "jamais une recréation (annonce hors ligne)");
ok(/if \(s\.vinted === true && Number\.isFinite\(vuVinted\) && vuVinted > depuisMs\) continue;/.test(bloc), "Vinted revu répondre depuis : on ne touche à rien (la levée vient au poll)");
ok(/\.update\(\{ status: "needs_user", error: messagePauseVintedGeste\(\), platform_fields: pf \}\)\s+\.eq\("id", j\.id\)\.eq\("status", "pending"\)/.test(bloc)
   && /pf\.needs_user_source = "verification_antirobot";/.test(bloc), "needs_user « vérification » — relancé seul quand la sonde revoit Vinted répondre");
ok(PAUSE_VINTED_GESTE_MS === 6 * 3600_000 && /ouvre vinted\.fr dans Chrome/.test(messagePauseVintedGeste()), "6 h, et le geste");

console.log("\n2. « METS À JOUR » DIT LE GESTE LE PLUS SIMPLE");
const app = lire("src/App.jsx");
ok(/Le plus simple : <strong>ferme Chrome complètement, puis rouvre-le<\/strong>/.test(app), "bandeau de l'app : fermer Chrome et le rouvrir, d'abord");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/"Mets l’extension FillSell à jour : ferme Chrome complètement puis rouvre-le — ta file reprendra toute seule après la mise à jour\. Tes annonces restent en ligne\.";/.test(gpj), "réponse du serveur au poste sous le seuil");
const bg = lire("chrome-extension/background.js");
ok(/if \(rep\.extension_update_required\) \{\s+chrome\.storage\.local\.set\(\{ fillsell_maj_requise:/.test(bg) && /verifierMiseAJourSiDue\(\{ urgent: true \}\)/.test(bg),
  "extension 0.6.90 : retient l'exigence et demande la mise à jour à Chrome sans attendre 2 h");
const popup = lire("chrome-extension/popup.js");
// (0.6.106) Le popup nomme le navigateur RÉEL (vinted-origine.js) : « Chrome »
// sous Google Chrome — le texte d'avant, à l'octet —, « Edge » sous Microsoft Edge.
const nomNavigateur = (brands) => {
  const g = { navigator: { userAgentData: { brands: brands.map((brand) => ({ brand })) } } };
  new Function("globalThis", "self", lire("chrome-extension/vinted-origine.js"))(g, g);
  return g.FILLSELL_VINTED.navigateurCourt();
};
const gesteMaj = /Mets FillSell à jour : ferme (?:Chrome|\$\{FILLSELL_VINTED\.navigateurCourt\(\)\}) complètement puis rouvre-le/.test(popup);
ok(/if \(state\.session && state\.majRequise\) \{/.test(popup) && gesteMaj
  && nomNavigateur(["Google Chrome", "Chromium"]) === "Chrome" && nomNavigateur(["Microsoft Edge", "Chromium"]) === "Edge",
  "le popup le dit en tête, avec le geste (« ferme Chrome » sous Google Chrome, « ferme Edge » sous Edge)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ pause anti-robot : à la personne après 6 h, toutes versions ; mise à jour : le geste le plus simple");
