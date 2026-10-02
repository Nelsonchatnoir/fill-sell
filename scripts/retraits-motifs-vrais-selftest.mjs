// Autotest — retraits arrêtés sur un motif faux (02/10) —
// `npm run selftest:retraits-motifs-vrais`
//   · Vinted, compte bloqué par Vinted (recrutementgroupezk704, a7dd76cd) :
//     la fenêtre de travail finit sur /main/banned — forme RELEVÉE en base ;
//   · la fin d'annonce eBay ne juge plus le dialogue sur le titre (ebay.js) ;
//   · le vendeur Vinted se lit en écartant le compte connecté (vinted.js).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pageCompteVintedBloque, messageCompteVintedBloque } from "../supabase/functions/_shared/vinted-compte-bloque.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. COMPTE VINTED BLOQUÉ");
const pfReel = { work_window_state: { at_end: { tab_url: "https://www.vinted.fr/main/banned" }, fins: [{ at: "2026-10-01T20:21:52.075Z", tab_url: "https://www.vinted.fr/main/banned", fill_step: null }] } };
ok(pageCompteVintedBloque(pfReel), "la forme relevée sur a7dd76cd est reconnue");
ok(pageCompteVintedBloque({ work_window_state: { fins: [{ tab_url: "https://www.vinted.it/main/banned?x=1" }] } }), "autre domaine Vinted, paramètres");
ok(!pageCompteVintedBloque({ work_window_state: { at_end: { tab_url: "https://www.vinted.fr/items/123" } } }), "page d'annonce : non");
ok(!pageCompteVintedBloque({ work_window_state: { at_end: { tab_url: "https://www.vinted.fr/main/bannedx" } } }), "pas un préfixe flou");
ok(!pageCompteVintedBloque({}), "sans relevé de fenêtre : non");
const m = messageCompteVintedBloque("delete", "Jeans Levi's 511");
ok(/compte bloqué/.test(m) && /n'a PAS été retirée/.test(m) && /appli Vinted/.test(m) && !/relance|notre onglet/i.test(m), "message vrai, geste réel, jamais « relance »");

console.log("\n2. FIN D'ANNONCE eBay : LE NUMÉRO, PLUS LE TITRE");
const eb = lire("chrome-extension/content-scripts/ebay.js");
ok(!/annonce trouvée par titre exact/.test(eb), "plus de repli par titre pour trouver la ligne");
ok(!/texteDe\(dialog\)\.toLowerCase\(\)\.includes\(job\.title/.test(eb), "le dialogue n'est plus jugé sur le titre du job");
ok(/nommeUneAutre/.test(eb) && /nomme une autre annonce que celle trouvée par son numéro/.test(eb), "refus si le dialogue nomme une AUTRE annonce");
const bg = lire("chrome-extension/background.js");
ok(/delete_trace: result\.trace\.slice\(-40\)/.test(bg), "la trace du handler part avec l'échec");

console.log("\n3. VENDEUR VINTED : LE COMPTE CONNECTÉ EST ÉCARTÉ");
const vt = lire("chrome-extension/content-scripts/vinted.js");
const d = vt.indexOf("async function proprietaireAnnonceVinted(t) {");
const f = vt.indexOf("\n}\n", d);
const src = vt.slice(d, f + 3);
const fabrique = new Function("document", "fetchBorne", `${src}; return proprietaireAnnonceVinted;`);
const docAvec = (ids) => ({ querySelectorAll: () => ids.map((id) => ({ getAttribute: () => `/member/${id}-pseudo` })) });
const fetchMoi = (id) => async () => ({ ok: true, json: async () => ({ user: { id, login: "moi" } }) });
const t = () => {};
const r1 = await fabrique(docAvec(["472079", "257364012"]), fetchMoi(257364012))(t);
ok(r1?.vendeur === "472079" && r1.session === "257364012", "Ornella : deux profils, le connecté écarté → vendeur 472079", JSON.stringify(r1));
const r2 = await fabrique(docAvec(["257364012"]), fetchMoi(257364012))(t);
ok(r2?.vendeur === "257364012", "sa propre annonce : vendeur = compte connecté");
const r3 = await fabrique(docAvec(["111", "222", "257364012"]), fetchMoi(257364012))(t);
ok(r3 === null, "deux autres profils : illisible, rien n'est conclu");
const r4 = await fabrique(docAvec([]), fetchMoi(257364012))(t);
ok(r4 === null, "aucun profil : illisible");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ retraits : motifs vrais, identité par numéro");
