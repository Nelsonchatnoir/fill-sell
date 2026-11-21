// Autotest VERROU : UNE DESCRIPTION DU FLUX NEXT.JS VINTED N'EST JAMAIS UNE RÉFÉRENCE (21/11/2026, extension 0.6.196)
//
//     node scripts/vinted-flux-reference-2111-selftest.mjs
//
// Le cas réel (lu en base le 21/11, compte 52f5dc70) : le 20/11 à 23:15-23:23, la lecture de la page publique Vinted
// (extension b8a84d3, « page », résultat ok) écrit sur 5 fiches la description « $17b », « $17d »… — la RÉFÉRENCE d'un
// texte que le flux Next.js range à part, sur une ligne « 17b:T<longueur en octets>,<texte> ». 3 autres fiches sur deux
// comptes depuis le 01/11. La référence passait pour le texte du vendeur (un seul « mot » : l'IA rédigeait à sa place).
// Ce qu'il prouve, sur background.js lu tel quel (lireFluxNextVinted, analyserPagePubliqueVinted) :
//   1. « $17b » → le texte de sa ligne T, entier (accents, emoji, retours à la ligne : longueur en octets UTF-8) ;
//   2. « $$… » → le texte qui commence par « $ » ; une description ordinaire : inchangée ;
//   3. une référence sans ligne, une autre référence ($undefined, $L1…), une longueur qui déborde → AUCUNE description
//      (page_sans_annonce : la lecture le dit), jamais la référence ;
//   4. « 217b:T » n'est jamais pris pour « 17b:T ».
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BG = readFileSync(join(RACINE, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };
function extraire(nom) {
  const m = new RegExp(`\\n((?:async )?function ${nom}\\()`).exec(BG);
  if (!m) throw new Error(`fonction introuvable : ${nom}`);
  const debut = m.index + 1;
  return BG.slice(debut, BG.indexOf("\n}\n", debut) + 2);
}
const ctx = { console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, Number, String, Boolean, Array, Object, Set, Map, RegExp, parseInt };
vm.createContext(ctx);
const { lireFluxNextVinted, analyserPagePubliqueVinted } = vm.runInContext(
  `${["lireFluxNextVinted", "analyserPagePubliqueVinted", "estPageBotShield"].map(extraire).join("\n")}\n;({ lireFluxNextVinted, analyserPagePubliqueVinted })`, ctx);

const octets = (s) => Buffer.byteLength(s, "utf8");
const ID = "10463579108";
// Une page sans JSON-LD : le flux Next.js découpé en morceaux self.__next_f.push([1,"…"]).
function page(flux, { morceaux = 3 } = {}) {
  const taille = Math.ceil(flux.length / morceaux);
  const pousses = [];
  for (let i = 0; i < flux.length; i += taille) pousses.push(`<script>self.__next_f.push([1,${JSON.stringify(flux.slice(i, i + taille))}])</script>`);
  return { ok: true, status: 200, html: `<html><head><title>Mug Molly Hatch | Vinted</title></head><body>${pousses.join("")}</body></html>` };
}
const bloc = (desc, id = ID) => `5:["$","div",null,{"data":{"description":${JSON.stringify(desc)},"item_id":${id}},"name":"description"}]\n`;
const texteVendeur = "Mug Molly Hatch x Anthropologie 🐶\nNeuf avec étiquette, jamais utilisé.\nEnvoi soigné — 12,50 €";

console.log("1. la référence « $17b » se résout en son texte");
{
  const flux = `0:{"a":1}\n${bloc("$17b")}17b:T${octets(texteVendeur).toString(16)},${texteVendeur}18:{"suite":true}\n`;
  const lu = lireFluxNextVinted(page(flux).html, ID);
  ok(lu?.description === texteVendeur, "le texte entier, accents, emoji et retours à la ligne compris", JSON.stringify(lu?.description));
  const lp = analyserPagePubliqueVinted(page(flux), ID);
  ok(lp.ok === true && lp.source === "flux_next" && lp.description === texteVendeur, "analyserPagePubliqueVinted rend ce texte (jamais « $17b »)", JSON.stringify(lp));
  const flux2 = `${bloc("$1a")}0:{"x":1}\n1a:T${octets("Très bon état").toString(16)},Très bon état`;
  ok(lireFluxNextVinted(page(flux2, { morceaux: 5 }).html, ID)?.description === "Très bon état", "la ligne T en fin de flux, le flux coupé en 5 morceaux");
}

console.log("2. « $$ » et une description ordinaire");
{
  ok(lireFluxNextVinted(page(bloc("$$20 le lot")).html, ID)?.description === "$20 le lot", "« $$20 le lot » → « $20 le lot »");
  ok(lireFluxNextVinted(page(bloc("Porté deux fois, très bon état.")).html, ID)?.description === "Porté deux fois, très bon état.", "une description ordinaire : inchangée");
}

console.log("3. jamais la référence");
{
  ok(lireFluxNextVinted(page(bloc("$17d")).html, ID) === null, "« $17d » sans sa ligne T → aucune description (page_sans_annonce)");
  ok(analyserPagePubliqueVinted(page(bloc("$17d")), ID).motif === "page_sans_annonce", "… et la lecture le dit");
  ok(lireFluxNextVinted(page(bloc("$undefined")).html, ID) === null && lireFluxNextVinted(page(bloc("$L1c")).html, ID) === null, "« $undefined », « $L1c » : pas un texte");
  ok(lireFluxNextVinted(page(`${bloc("$17b")}17b:T999,court`).html, ID) === null, "une longueur qui déborde le flux → aucune description");
}

console.log("4. une ligne voisine n'est jamais prise");
{
  const autre = "Texte d'une AUTRE annonce";
  const flux = `${bloc("$17b")}217b:T${octets(autre).toString(16)},${autre}\n17b:T${octets(texteVendeur).toString(16)},${texteVendeur}`;
  ok(lireFluxNextVinted(page(flux).html, ID)?.description === texteVendeur, "« 217b:T » n'est pas « 17b:T »");
  ok(lireFluxNextVinted(page(bloc("$17b", "999")).html, ID) === null, "le bloc d'une autre annonce (item_id différent) n'est jamais lu");
}

console.log("5. livré");
{
  const man = JSON.parse(readFileSync(join(RACINE, "chrome-extension/manifest.json"), "utf8"));
  const [a, b, c] = String(man.version).split(".").map(Number);
  ok(a > 0 || b > 6 || (b === 6 && c >= 196), `manifest ≥ 0.6.196 (lu ${man.version})`);
}

console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
