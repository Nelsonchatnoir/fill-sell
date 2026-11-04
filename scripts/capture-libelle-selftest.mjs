// ═══════════════════════════════════════════════════════════════════════════
// Selftest « une information que nous n'avons pas su nommer n'est pas un geste » (05/11, point 5)
//   npm run selftest:capture-libelle
//
// LE CAS : linda.sidhoum, republication Vinted a79256da, needs_user « capture_incomplete » depuis le 30/10 : « taille
// (item_attributes=4 → libellé) … Complète l'information manquante ». L'annonce porte sa taille ; c'est notre lecture du
// référentiel de Vinted (size_groups → « Failed to fetch ») qui a échoué. Seul job du parc dans ce cas (lu le 05/11).
// CE QUE CE TEST PROUVE (module _shared/capture-libelle.js, exécuté) :
//   1. les motifs se lisent dans le texte réel de l'extension (forme actuelle et forme « failed » d'avant) ;
//   2. seuls des motifs « … → libellé) » TOUS de cette forme déclenchent la reprise — un champ réellement absent, une
//      photo, un motif coupé gardent la règle d'avant ;
//   3. la reprise est espacée (10, 30, 120 min), bornée à 3, retire la question, dit que ça vient de chez nous ;
//   4. update-job-status (tout nouveau compte rendu) et handler-watch (les jobs déjà arrêtés, 20 par passage) appliquent
//      la même règle.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const C = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/capture-libelle.js")).href);

let ko = 0;
const ok = (cond, nom, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

const LINDA = "Republication en pause AVANT toute suppression : la capture de ton annonce est incomplète : taille (item_attributes=4 → libellé). " +
  "Ton annonce est intacte sur Vinted. Complète l'information manquante depuis l'app (carte de l'article) ou sur ton annonce Vinted, puis relance la republication.";

console.log("\n[1] les motifs, lus dans le texte réel");
ok(JSON.stringify(C.motifsCaptureIncomplete(LINDA)) === JSON.stringify(["taille (item_attributes=4 → libellé)"]), "linda (texte en base du 30/10)", JSON.stringify(C.motifsCaptureIncomplete(LINDA)));
ok(JSON.stringify(C.motifsCaptureIncomplete("Capture incomplète (couleur 1 (color1_id=12 → libellé) ; taille (size_id=1943 → libellé)) — republication annulée AVANT toute suppression. Ton annonce est intacte."))
  === JSON.stringify(["couleur 1 (color1_id=12 → libellé)", "taille (size_id=1943 → libellé)"]), "forme « failed » des anciennes extensions");
ok(C.motifsCaptureIncomplete("Connexion Vinted requise : se connecter sur vinted.fr") === null, "un autre texte : rien");

console.log("\n[2] seulement des libellés irrésolus");
ok(C.seulementLibellesIrresolus(["taille (item_attributes=4 → libellé)"]), "linda : oui");
ok(!C.seulementLibellesIrresolus(["taille (item_attributes=4 → libellé)", "marque absente"]), "avec un champ réellement absent : non (la question d'avant)");
ok(!C.seulementLibellesIrresolus(["photo 2 (re-hébergement en échec)"]), "une photo : non");
ok(!C.seulementLibellesIrresolus(["taille (size_id=1943 → lib…"]), "un motif coupé : non");
ok(!C.seulementLibellesIrresolus([]) && !C.seulementLibellesIrresolus(null), "aucun motif : non");

console.log("\n[3] la reprise : espacée, bornée, sans geste");
const T = Date.parse("2026-11-05T01:00:00Z");
const pf0 = { republish_step: "a_capturer", needs_user_source: "capture_incomplete", champs_a_completer: ["taille"], needs_user_vu_le: "x" };
const r1 = C.repriseCaptureLibelle(pf0, ["taille (item_attributes=4 → libellé)"], T);
ok(r1 && r1.n === 1 && r1.dansMinutes === 10 && r1.pf.next_action_after === new Date(T + 600_000).toISOString(), "1re reprise dans 10 min");
ok(r1 && !("needs_user_source" in r1.pf) && !("champs_a_completer" in r1.pf) && !("needs_user_vu_le" in r1.pf) && r1.pf.republish_step === "a_capturer", "la question est retirée, l'étape gardée (rien n'a été retiré)");
ok(r1 && /porte bien sa taille/.test(r1.message) && /ça vient de chez nous/.test(r1.message) && /rien à faire de ton côté/.test(r1.message) && /intacte/.test(r1.message), "le message dit vrai", r1?.message);
const r2 = C.repriseCaptureLibelle({ ...pf0, capture_libelle_reprises: 1 }, ["taille (item_attributes=4 → libellé)"], T);
const r3 = C.repriseCaptureLibelle({ ...pf0, capture_libelle_reprises: 2 }, ["taille (item_attributes=4 → libellé)"], T);
ok(r2?.dansMinutes === 30 && r3?.dansMinutes === 120 && r3?.n === 3, "puis 30 min, puis 120 min");
ok(C.repriseCaptureLibelle({ ...pf0, capture_libelle_reprises: 3 }, ["taille (item_attributes=4 → libellé)"], T) === null, "au-delà de 3 : la règle d'avant (la question revient)");

console.log("\n[4] le branchement");
const ujs = lire("supabase/functions/update-job-status/index.ts");
ok(/import \{ motifsCaptureIncomplete, seulementLibellesIrresolus, repriseCaptureLibelle \} from "\.\.\/_shared\/capture-libelle\.js";/.test(ujs), "update-job-status importe la règle");
ok(ujs.includes("if (motifsL && seulementLibellesIrresolus(motifsL)) {") && ujs.includes('if (pfCaptureLibelle) patch.platform_fields = pfCaptureLibelle;') && ujs.includes("&& !pfOplaRelache && !pfCaptureLibelle;"),
  "update-job-status : décide, écrit, et ne laisse aucune autre requalification passer par-dessus");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(hw.includes('.eq("platform_fields->>needs_user_source", "capture_incomplete")') && hw.includes('.like("error", "%→ libellé)%")') && /\.limit\(20\);\n {4}for \(const j of \(arretesL/.test(hw),
  "handler-watch : les jobs déjà arrêtés, 20 par passage, même règle");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ une information que nous n'avons pas su nommer repart seule ; un vrai manque reste une question");
