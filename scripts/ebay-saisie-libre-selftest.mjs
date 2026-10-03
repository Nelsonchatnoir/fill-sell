// `node scripts/ebay-saisie-libre-selftest.mjs [fichier ebay.js]`
//
// UN ASPECT eBAY EN SAISIE LIBRE SE REMPLIT (03/10, point 7).
// Kit lumières Kodak de geronimo0550 (job 0692b536) — et 6 autres jobs depuis
// le 16/08 : « Numéro de pièce fabricant » valait « Ne s'applique pas » dans le
// job, mais arrivait VIDE dans le formulaire. La ligne relevée n'a ni
// bouton-valeur ni puce : « structure : button.fake-link ; tooltip ;
// p.textual-display ; input.textbox__control ». Aucun chemin n'y écrivait, et le
// constat des obligatoires la lisait vide → « LIVE : … refus eBay garanti ».
//
// ⛔ CE TEST EXÉCUTE LE VRAI CODE : fillSpecificSafe, computeUnfilledRequired et
//    leurs aides sont extraites du fichier livré (ou du fichier MINIFIÉ passé en
//    argument) et tournent contre un faux DOM qui reproduit la ligne relevée.
//    Le moteur de sélecteurs du faux DOM ne couvre que ce que ces fonctions
//    emploient : une nouvelle forme de sélecteur fait échouer le test.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FICHIER = process.argv[2] ? String(process.argv[2]).replace(/\\/g, "/") : "chrome-extension/content-scripts/ebay.js";
const SRC = fs.readFileSync(path.join(ROOT, FICHIER), "utf8").split("\r\n").join("\n");

function extraire(nom) {
  const debut = SRC.search(new RegExp(`(?:async\\s+)?function\\s+${nom}\\s*\\(`));
  if (debut < 0) throw new Error(`${nom} introuvable dans ${FICHIER}`);
  let p = SRC.indexOf("(", debut), n = 0;
  for (; p < SRC.length; p++) { if (SRC[p] === "(") n++; else if (SRC[p] === ")") { n--; if (n === 0) break; } }
  let i = SRC.indexOf("{", p), d = 0;
  for (; i < SRC.length; i++) { if (SRC[i] === "{") d++; else if (SRC[i] === "}") { d--; if (d === 0) break; } }
  return SRC.slice(debut, i + 1);
}
function constante(nom) {
  const m = SRC.match(new RegExp(`const\\s+${nom}\\s*=\\s*([\\s\\S]*?);\\n`));
  if (!m) throw new Error(`constante ${nom} introuvable`);
  return `const ${nom} = ${m[1]};`;
}

// ── Faux DOM, borné aux sélecteurs employés ──────────────────────────────────
class El {
  constructor(tag, { cls = "", id = "", type = "", text = "" } = {}, enfants = []) {
    this.tagName = tag.toUpperCase(); this.className = cls; this.id = id; this.type = type;
    this._text = text; this.children = []; this.parentElement = null; this.value = ""; this.events = [];
    for (const e of enfants) { e.parentElement = this; this.children.push(e); }
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
  getAttribute(a) { return a === "id" ? this.id : a === "class" ? this.className : a === "type" ? this.type : null; }
  *descendants() { for (const c of this.children) { yield c; yield* c.descendants(); } }
  matchesSimple(s) {
    s = s.trim();
    const m = s.match(/^([a-z]+)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i);
    if (!m) throw new Error(`sélecteur non couvert par le faux DOM : « ${s} »`);
    const [, tag, classes, attrs] = m;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    const cls = this.className.split(/\s+/);
    for (const c of (classes.match(/\.[\w-]+/g) ?? [])) if (!cls.includes(c.slice(1))) return false;
    for (const a of (attrs.match(/\[[^\]]+\]/g) ?? [])) {
      const presence = a.match(/^\[([\w-]+)\]$/);
      if (presence) { if (this.getAttribute(presence[1]) == null || this.getAttribute(presence[1]) === "") return false; continue; }
      const am = a.match(/^\[([\w-]+)(\*?=)"([^"]*)"\]$/);
      if (!am) throw new Error(`attribut non couvert : ${a}`);
      const v = String(this.getAttribute(am[1]) ?? "");
      if (am[2] === "*=" ? !v.includes(am[3]) : v !== am[3]) return false;
    }
    return true;
  }
  matches(sel) {
    return sel.split(",").some((alt) => {
      const parts = alt.trim().split(/\s+/);
      if (!this.matchesSimple(parts.at(-1))) return false;
      let anc = this.parentElement;
      for (let k = parts.length - 2; k >= 0; k--) {
        while (anc && !anc.matchesSimple(parts[k])) anc = anc.parentElement;
        if (!anc) return false;
        anc = anc.parentElement;
      }
      return true;
    });
  }
  closest(sel) { let e = this; while (e) { if (e.matches(sel)) return e; e = e.parentElement; } return null; }
  querySelectorAll(sel) { return [...this.descendants()].filter((e) => e.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  focus() { this.events.push("focus"); }
  blur() { this.events.push("blur"); }
  dispatchEvent(ev) { this.events.push(ev.type); return true; }
}
function formulaire({ valeurPreRemplie = "" } = {}) {
  const input = new El("input", { cls: "textbox__control", type: "text" });
  input.value = valeurPreRemplie;
  const label = new El("button", { cls: "fake-link", id: "s0-item-specific-dropdown-label-MPN", text: "Numéro de pièce fabricant" });
  // Relevé EXACT du job 0692b536 : « button.fake-link txt="Numéro de pièce
  // fabricant" ; span.tooltip__overlay[role=tooltip] txt="Code produit attribué
  // par le f" ; p.textual-display txt="Code produit attribué par le f" ;
  // input.textbox__control ». Le texte d'aide n'est JAMAIS une valeur.
  const aide = new El("span", { cls: "tooltip__overlay", text: "" }, [new El("p", { cls: "textual-display", text: "Code produit attribué par le fabricant" })]);
  const ligne = new El("div", { cls: "summary__attributes--field" }, [
    new El("div", { cls: "summary__attributes--label" }, [label, aide]),
    new El("div", { cls: "summary__attributes--value" }, [input]),
  ]);
  // Une ligne VOISINE (menu Marque) : elle ne doit jamais être lue à la place.
  const labelMarque = new El("button", { cls: "fake-link", id: "s0-item-specific-dropdown-label-Brand", text: "Marque" });
  const voisine = new El("div", { cls: "summary__attributes--field" }, [
    new El("div", { cls: "summary__attributes--label" }, [labelMarque]),
    new El("div", { cls: "summary__attributes--value" }, [new El("button", { cls: "se-expand-button__button fake-menu-button__button", text: "Kodak" })]),
  ]);
  const racine = new El("div", { cls: "form" }, [new El("div", { cls: "section" }, [ligne]), new El("div", { cls: "section" }, [voisine])]);
  return { racine, input };
}

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
console.log(`fichier exécuté : ${FICHIER}\n`);

const code = [
  constante("SPECIFIC_VALUE_BTN"), constante("SPECIFIC_LABEL_BTN"),
  extraire("findSpecificLabelButton"), extraire("specificRow"), extraire("dumpSpecificRow"),
  extraire("inputTexteDeLaLigne"), extraire("poserTexteLibre"), extraire("readAspectDisplayValue"),
  extraire("computeUnfilledRequired"), extraire("fillSpecificSafe"), extraire("prefilledMatchesTarget"),
].join("\n");
const fabrique = (document) => new Function(
  "document", "HTMLInputElement", "Event", "FocusEvent", "waitFor", "humanPause", "sleep", "randInt", "dismissLightboxes",
  "normalizeFuzzy", "realClick", "setSpecificValue", "texteComparable",
  `${code}\nreturn { fillSpecificSafe, computeUnfilledRequired, inputTexteDeLaLigne };`,
)(
  document,
  { prototype: {} },
  class { constructor(type) { this.type = type; } },
  class { constructor(type) { this.type = type; } },
  async (fn, ms) => { const v = fn(); return v ?? null; },
  async () => {}, async () => {}, () => 0, async () => {},
  (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  () => {}, async () => { throw new Error("menu : ne doit pas être appelé sur une saisie libre"); },
  (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(),
);

console.log("1. LA SAISIE LIBRE SE REMPLIT (forme relevée sur 0692b536)");
{
  const { racine, input } = formulaire();
  const doc = { querySelectorAll: (s) => racine.querySelectorAll(s), body: { click() {} } };
  const f = fabrique(doc);
  const warnings = [];
  const r = await f.fillSpecificSafe(["Numéro de pièce fabricant"], "Ne s'applique pas", warnings);
  ok(r === true, "fillSpecificSafe rend true", JSON.stringify(warnings));
  ok(input.value === "Ne s'applique pas", `la valeur est DANS la saisie (« ${input.value} »)`);
  ok(input.events.includes("input") && input.events.includes("change") && input.events.includes("blur"), "événements input, change, blur envoyés");
  ok(!warnings.some((w) => /champ sauté/.test(w)), "plus de « champ sauté »");
  const vides = f.computeUnfilledRequired({ ebayRequiredAspects: ["Numéro de pièce fabricant"] }, new Set(), []);
  ok(vides.length === 0, "le constat des obligatoires lit la saisie : plus « lu VIDE »");
}

console.log("\n2. UNE SAISIE DÉJÀ REMPLIE");
{
  const { racine, input } = formulaire({ valeurPreRemplie: "Ne s'applique pas" });
  const f = fabrique({ querySelectorAll: (s) => racine.querySelectorAll(s), body: { click() {} } });
  const evAvant = input.events.length;
  ok(await f.fillSpecificSafe(["Numéro de pièce fabricant"], "Ne s'applique pas", []) === true && input.events.length === evAvant,
    "même valeur déjà là : conservée, rien n'est retapé");
}

console.log("\n3. JAMAIS LA SAISIE D'UNE AUTRE LIGNE");
{
  const { racine } = formulaire();
  const f = fabrique({ querySelectorAll: (s) => racine.querySelectorAll(s), body: { click() {} } });
  const labelMarque = racine.querySelectorAll('button[id*="item-specific-dropdown-label"]').find((b) => b.textContent === "Marque");
  ok(f.inputTexteDeLaLigne(labelMarque) === null, "la ligne Marque (menu) n'a pas de saisie : rien n'est pris chez la voisine");
  const vides = f.computeUnfilledRequired({ ebayRequiredAspects: ["Numéro de pièce fabricant"] }, new Set(), []);
  ok(vides.length === 1, "saisie vide : l'obligatoire est bien constaté vide (rien de faux « rempli »)");
}

console.log("\n4. LE JOB ARRÊTÉ REPART SEUL SUR UN POSTE QUI PORTE LE CORRECTIF");
{
  const { correctifPourJob, posteAJour } = await import("../supabase/functions/_shared/correctifs-extension.js");
  // Texte RELEVÉ sur 0692b536 (geronimo0550), tel qu'en base le 03/10.
  const job = { status: "needs_user", platform: "ebay", action: "publish", handler_build: "2026-10-02T19:15:37Z+1a49399 · v0.6.89", platform_fields: {},
    error: "LIVE : aspect(s) obligatoire(s) eBay vide(s) sur le formulaire : Numéro de pièce fabricant — publication NON tentée (refus eBay garanti). " +
      "Détail du remplissage : numéro de pièce fabricant: champ sauté — bouton-valeur introuvable pour \"Numéro de pièce fabricant\" (aucune chip « Ne s'applique pas » non plus) — " +
      "structure réelle de la ligne : button.fake-link txt=\"Numéro de pièce fabricant\" ; span.tooltip__overlay[role=tooltip] txt=\"Code produit attribué par le f\" ; " +
      "p.textual-display txt=\"Code produit attribué par le f\" ; input.textbox__control | Numéro de pièce fabricant: obligatoire lu VIDE sur le formulaire" };
  const c = correctifPourJob(job);
  ok(c?.cle === "ebay_aspect_saisie_libre", "0692b536 est reconnu par le correctif « saisie libre »");
  ok(c && !posteAJour("2026-10-02T19:15:37Z+1a49399", c) && posteAJour("2026-10-03T16:00:00Z+0000000", c), "servi seulement à un poste qui porte le correctif");
  ok(correctifPourJob({ ...job, error: job.error.replace("input.textbox__control", "div.autre") }) === null, "un autre défaut de ligne n'est pas réarmé");
}

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ eBay : un aspect en saisie libre se remplit, se relit, et jamais chez le voisin");
