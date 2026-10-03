// Autotest — multi-boutiques Vinted : chaque ligne dit sa boutique, un job
// retenu dit laquelle ouvrir, et l'app lit la boutique ouverte avec LA règle
// du serveur (03/10, point 16, Ornella @ornella-vend / @luciatrendyshop)
//   npm run selftest:boutique-connectee
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { boutiqueConnecteeVinted, loginsDesBoutiques, BOUTIQUE_FRAICHEUR_MS } = await imp("supabase/functions/_shared/boutique-connectee.js");
const { situationJob, lireFile, libelleAction, boutiqueAttendue } = await imp("src/utils/fileDesJobs.js");
const { etatAttenteBoutique, messageFicheAttenteBoutique, phraseBoutiqueActive } = await imp("src/utils/attenteBoutique.js");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const T0 = Date.parse("2026-10-03T12:00:00Z");
const iso = (min) => new Date(T0 + min * 60000).toISOString();
// Les deux boutiques RÉELLES d'Ornella (profiles.vinted_sync_pin).
const PIN = { v: 2, boutiques: [{ user_id: "472079", login: "ornella-vend" }, { user_id: "257364012", login: "luciatrendyshop" }] };

console.log("\n1. LA BOUTIQUE OUVERTE : UNE RÈGLE, CELLE DU SERVEUR");
const sonde = { vinted_identite: { user_id: "472079", login: "ornella-vend" }, checked_at: iso(-20) };
const runLucia = { vinted_user_id: "257364012", vinted_login: "luciatrendyshop", started_at: iso(-2) };
const a = boutiqueConnecteeVinted({ sessions: sonde, run: runLucia, maintenant: T0 });
ok(a?.userId === "257364012" && a.source === "sync_dressing" && a.fraiche, "le relevé du dressing plus récent que la sonde tranche (bascule de boutique)");
const b = boutiqueConnecteeVinted({ sessions: sonde, run: null, maintenant: T0 + BOUTIQUE_FRAICHEUR_MS });
ok(b?.userId === "472079" && b.fraiche === false, "au-delà de 30 min : connue, mais plus fraîche (ne décide plus rien)");
ok(boutiqueConnecteeVinted({ sessions: null, run: null, maintenant: T0 }) === null, "rien de relevé : null, on ne devine pas");
ok(loginsDesBoutiques(PIN).get("257364012") === "luciatrendyshop", "pseudos lus dans le pin de synchro");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/const vu = boutiqueConnecteeVinted\(\{ sessions, run \}\);/.test(gpj) && !/source: "sync_dressing",\s+id:/.test(gpj),
  "get-pending-jobs garde sa garde de boutique avec CETTE règle (plus de copie en ligne)");
const sync = lire("src/utils/vintedSync.js");
ok(/const vu = boutiqueConnecteeVinted\(\{ sessions: data\?\.extension_sessions \?\? null, run: runs\?\.data\?\.\[0\] \?\? null \}\);/.test(sync)
   && /fraiche: vu\.fraiche/.test(sync), "l'app lit la boutique ouverte avec la même règle (avant : la sonde seule, sans âge)");

console.log("\n2. LA FILE DES JOBS : LA BOUTIQUE DE CHAQUE LIGNE, ET LAQUELLE OUVRIR");
const boutiques = {
  connectee: { userId: "472079", login: "ornella-vend", fraiche: true },
  liste: PIN.boutiques,
  origines: new Map([["inv-o", "472079"], ["inv-l", "257364012"], ["inv-x", ""]]),
};
const ctx = { maintenant: T0, lang: "fr", extension: { etat: "active" }, boutiques };
const job = (o) => ({ id: o.id ?? "j", platform: "vinted", action: "republish", status: "pending", created_at: iso(-60), platform_fields: { republish_step: "a_capturer" }, ...o });
const surLucia = job({ id: "l", inventaire_id: "inv-l" });
const surOrnella = job({ id: "o", inventaire_id: "inv-o" });
const sl = situationJob(surLucia, ctx);
ok(sl.groupe === "pause" && sl.motif === "boutique" && sl.raison === "En attente de ta boutique @luciatrendyshop : ouvre-la sur vinted.fr dans Chrome, ça repartira tout seul",
  "job de l'AUTRE boutique : en pause, la boutique à ouvrir nommée (avant : « en attente de son tour »)", sl.raison);
ok(situationJob(surOrnella, ctx).raison === "En attente de son tour", "job de la boutique ouverte : à son tour");
ok(libelleAction(surLucia, "fr", boutiques) === "Republication sur Vinted · @luciatrendyshop" && libelleAction(surOrnella, "fr", boutiques) === "Republication sur Vinted · @ornella-vend",
  "chaque ligne Vinted dit sa boutique");
ok(libelleAction(surOrnella, "fr", { ...boutiques, liste: [PIN.boutiques[0]] }) === "Republication sur Vinted", "une seule boutique : rien d'ajouté");
ok(libelleAction(job({ platform: "leboncoin", inventaire_id: "inv-l" }), "fr", boutiques) === "Republication sur Leboncoin", "autres plateformes : rien d'ajouté");
const horsLigne = job({ id: "d", inventaire_id: "inv-l", platform_fields: { republish_step: "deleted", deleted_at: iso(-3) } });
ok(situationJob(horsLigne, ctx).motif === "boutique", "à l'étape « hors ligne », un job retenu par la boutique le dit aussi (la remise en ligne se fait sur sa boutique)");
const retrait = job({ id: "r", action: "delete", inventaire_id: "inv-l", platform_fields: {} });
ok(situationJob(retrait, ctx).motif === "boutique", "un retrait d'une autre boutique attend aussi (même garde que le serveur)");
ok(boutiqueAttendue(job({ inventaire_id: "inv-x" }), boutiques) === null, "origine inconnue : rien de retenu (fail-open du serveur)");
ok(situationJob(surLucia, { ...ctx, boutiques: { ...boutiques, connectee: { ...boutiques.connectee, fraiche: false } } }).motif !== "boutique",
  "boutique ouverte relevée il y a plus de 30 min : rien d'affirmé (le serveur ne retient rien)");
ok(situationJob(job({ id: "p", action: "publish", inventaire_id: "inv-l", platform_fields: {} }), ctx).motif !== "boutique", "une publication neuve n'appartient à aucune boutique");
const file = lireFile([surLucia, surOrnella], ctx);
ok(file.pause.length === 1 && file.a_venir.length === 1, "la file range chacun à sa place");

console.log("\n3. LES AUTRES ÉCRANS SUIVENT LA MÊME FRAÎCHEUR");
const perime = { userId: "472079", login: "ornella-vend", fraiche: false };
ok(etatAttenteBoutique({ jobs: [{ ...surLucia, status: "pending" }], origines: boutiques.origines, connectee: perime, boutiques: PIN.boutiques }) === null,
  "en-tête : rien affirmé sur un relevé périmé");
ok(messageFicheAttenteBoutique({ connectee: perime, origine: "257364012", boutiques: PIN.boutiques }) === null, "fiche : rien affirmé sur un relevé périmé");
ok(phraseBoutiqueActive(perime, "fr") === "Dernière boutique vue dans Chrome : @ornella-vend.", "« actuellement » seulement quand c'est vrai");
const st = lire("src/tabs/StockTab.jsx");
ok(/boutiques: \(boutiquesVinted\?\.length \?\? 0\) >= 1 \? \{ connectee: boutiqueConnectee, liste: boutiquesVinted, origines: originesBoutique \} : null/.test(st),
  "le Stock passe la boutique aux barres et à la file");
const fdj = lire("src/components/FileDesJobs.jsx");
ok(/libelleAction\(job, lang, boutiques\)/.test(fdj) && /boutiques: contexte\?\.boutiques \?\? autonome\?\.boutiques \?\? null/.test(fdj), "la file l'affiche, y compris ouverte hors du Stock");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ multi-boutiques : chaque ligne dit sa boutique, l'attente dit laquelle ouvrir");
