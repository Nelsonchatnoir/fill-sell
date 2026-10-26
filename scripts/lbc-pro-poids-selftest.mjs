// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN PRO : LE POIDS DU COLIS EST POSÉ — `npm run selftest:lbc-pro-poids`
// ═══════════════════════════════════════════════════════════════════════════
// 18/10/2026 (extension 0.6.128). Job b1b9bb68 (compte PRO, en needs_user
// depuis le 14/10 : « Leboncoin demande « Poids du colis* » ») — la valeur
// était pourtant connue (lbcAspects.estimated_parcel_weight = « De 1 kg à 2 kg »).
// Faits : la sonde des critères attendait 4 s un label classique ; sur le
// formulaire PRO, État et Poids du colis sont rendus plus tard → rien vu, TOUT
// le remplissage des critères sautait (état, canal générique, seconde passe,
// celle-ci aussi sous `if (hasCriteria)`) ; le formulaire PRO n'a pas la case
// livraison, le poids n'y passe que par le canal générique ; au verdict, seule
// la clé de l'état était reposée.
// Preuve HORS LIGNE : le VRAI leboncoin.js tourne dans un vm, sur une maquette
// du formulaire PRO (DOM minimal fait main — jsdom n'est pas installé — et
// horloge VIRTUELLE : 15 s d'attente durent quelques millisecondes) :
//   · critères rendus 9 s après la sonde : posés (avant : 4 s, tout sautait) ;
//   · critères rendus 17 s après : seconde passe, posés ;
//   · libellé sans clé sémantique (label for= React) : posé par le libellé ;
//   · particulier : sonde de 4 s inchangée (plus un avertissement) ;
//   · au verdict : valeur connue posée SI la liste la porte, jamais hors liste ;
//   · AUCUN clic sur « Valider et payer », aucune case livraison cherchée.
//   node scripts/lbc-pro-poids-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = fs.readFileSync(path.join(RACINE, "chrome-extension/content-scripts/leboncoin.js"), "utf8");
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ${detail}` : ""}`); } };

// ── Horloge virtuelle : setTimeout et Date du bac à sable ────────────────────
function horlogeVirtuelle() {
  let maintenant = 0, seq = 0;
  const minuteries = new Map();
  const BASE = Date.parse("2026-10-18T12:00:00Z");
  const setT = (cb, ms = 0, ...args) => { const id = ++seq; minuteries.set(id, { t: maintenant + Math.max(0, Number(ms) || 0), id, cb: () => cb(...args) }); return id; };
  const clearT = (id) => { minuteries.delete(id); };
  class FDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(BASE + maintenant); }
    static now() { return BASE + maintenant; }
  }
  async function executer(promesse, limiteMs = 10 * 60_000) {
    let fini = false, valeur, erreur;
    promesse.then((v) => { fini = true; valeur = v; }, (e) => { fini = true; erreur = e; });
    for (;;) {
      await new Promise((r) => setImmediate(r));
      if (fini) break;
      if (!minuteries.size) throw new Error("bloqué : plus aucune minuterie et la promesse n'est pas réglée");
      const suivante = [...minuteries.values()].sort((a, b) => a.t - b.t || a.id - b.id)[0];
      minuteries.delete(suivante.id);
      maintenant = Math.max(maintenant, suivante.t);
      if (maintenant > limiteMs) throw new Error("délai virtuel dépassé");
      suivante.cb();
    }
    if (erreur) throw erreur;
    return valeur;
  }
  return { setT, clearT, FDate, executer, ms: () => maintenant, remettre: () => { maintenant = 0; minuteries.clear(); } };
}

// ── DOM minimal : les sélecteurs simples que leboncoin.js emploie ici ────────
function parserSimple(s) {
  const m = { tag: null, id: null, attrs: [], not: [] };
  let reste = s.trim();
  const t = reste.match(/^(\*|[a-zA-Z][a-zA-Z0-9-]*)/);
  if (t) { m.tag = t[0] === "*" ? null : t[0].toUpperCase(); reste = reste.slice(t[0].length); }
  while (reste) {
    let x;
    if ((x = reste.match(/^#([A-Za-z0-9_:-]+)/))) m.id = x[1];
    else if ((x = reste.match(/^\[([a-zA-Z_:-]+)(?:([$^*~]?=)(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?(\s+i)?\]/))) m.attrs.push({ nom: x[1], op: x[2] ?? null, val: x[3] ?? x[4] ?? x[5] ?? null, ci: !!x[6] });
    else if ((x = reste.match(/^:not\(([^)]*)\)/))) m.not.push(parserSimple(x[1]));
    else if ((x = reste.match(/^\.([A-Za-z0-9_-]+)/))) m.attrs.push({ nom: "class", op: "~=", val: x[1] });
    else throw new Error(`sélecteur non géré par la maquette : « ${s} »`);
    reste = reste.slice(x[0].length);
  }
  return m;
}
const parserListe = (sel) => String(sel).split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
  if (/\s(?![^[]*\])/.test(s)) throw new Error(`combinateur non géré par la maquette : « ${s} »`);
  return parserSimple(s);
});
function correspond(el, m) {
  if (m.tag && el.tagName !== m.tag) return false;
  if (m.id && el.id !== m.id) return false;
  for (const a of m.attrs) {
    const v = el.getAttribute(a.nom);
    if (v == null) return false;
    if (!a.op) continue;
    const g = a.ci ? v.toLowerCase() : v, d = a.ci ? String(a.val).toLowerCase() : String(a.val);
    if (a.op === "=" && g !== d) return false;
    if (a.op === "$=" && !g.endsWith(d)) return false;
    if (a.op === "^=" && !g.startsWith(d)) return false;
    if (a.op === "*=" && !g.includes(d)) return false;
    if (a.op === "~=" && !g.split(/\s+/).includes(d)) return false;
  }
  return !m.not.some((x) => correspond(el, x));
}
class FEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } preventDefault() {} stopPropagation() {} }
class Noeud {
  constructor(doc, tag, attrs = {}, texte = "") {
    this.ownerDocument = doc; this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.children = []; this.parentElement = null;
    this._texte = texte; this.ecouteurs = {}; this.value = attrs.value ?? ""; this.clics = 0;
  }
  ajouter(...enfants) { for (const e of enfants) { e.parentElement = this; this.children.push(e); } return this; }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? String(this.attrs[k]) : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  hasAttribute(k) { return this.getAttribute(k) != null; }
  removeAttribute(k) { delete this.attrs[k]; }
  get id() { return this.attrs.id ?? ""; }
  get name() { return this.attrs.name ?? ""; }
  get type() { return this.attrs.type ?? ""; }
  get disabled() { return this.hasAttribute("disabled"); }
  get textContent() { return this._texte + this.children.map((c) => c.textContent).join(""); }
  get innerText() { return this.textContent; }
  get isConnected() { let x = this; while (x.parentElement) x = x.parentElement; return x === this.ownerDocument.documentElement; }
  get offsetParent() { return this.parentElement; }
  getBoundingClientRect() { return { width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, x: 0, y: 0 }; }
  getClientRects() { return [this.getBoundingClientRect()]; }
  *descendants() { for (const c of this.children) { yield c; yield* c.descendants(); } }
  querySelectorAll(sel) { const l = parserListe(sel); return [...this.descendants()].filter((e) => l.some((m) => correspond(e, m))); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  matches(sel) { return parserListe(sel).some((m) => correspond(this, m)); }
  closest(sel) { for (let x = this; x; x = x.parentElement) if (x.matches(sel)) return x; return null; }
  addEventListener(t, f) { (this.ecouteurs[t] ??= []).push(f); }
  removeEventListener() {}
  dispatchEvent(ev) { if (ev.type === "click") this.clics++; for (let x = this; x; x = x.parentElement) for (const f of x.ecouteurs[ev.type] ?? []) f.call(x, ev); return true; }
  click() { this.dispatchEvent(new FEvent("click", { bubbles: true })); }
  focus() {} blur() {} scrollIntoView() {}
}
class Doc {
  constructor() { this.documentElement = new Noeud(this, "html"); this.body = new Noeud(this, "body"); this.documentElement.ajouter(this.body); }
  querySelectorAll(sel) { return this.documentElement.querySelectorAll(sel); }
  querySelector(sel) { return this.documentElement.querySelector(sel); }
  getElementById(id) { return [...this.documentElement.descendants()].find((e) => e.id === id) ?? null; }
  createElement(tag) { return new Noeud(this, tag); }
  addEventListener() {} removeEventListener() {}
  execCommand() { return false; }
  get readyState() { return "complete"; }
}

// ── La maquette du formulaire PRO ────────────────────────────────────────────
const POIDS = ["Jusqu’à 100 g", "De 100 g à 250 g", "De 250 g à 500 g", "De 500 g à 1 kg", "De 1 kg à 2 kg", "De 2 kg à 5 kg",
  "De 5 kg à 10 kg", "De 10 kg à 20 kg", "De 20 kg à 30 kg", "De 30 kg à 40 kg", "Supérieur à 40 kg"]; // relevé en base (platform_category_aspects)
const ETATS = ["État neuf", "Très bon état", "Bon état", "État satisfaisant"];
function combobox(doc, { cle, libelle, options, idReact, cleSemantique = true }) {
  const input = new Noeud(doc, "input", { role: "combobox", id: idReact, "aria-controls": `menu-${idReact}` });
  const menu = new Noeud(doc, "ul", { id: `menu-${idReact}`, role: "listbox" });
  for (const o of options) {
    const li = new Noeud(doc, "li", { role: "option" }, o);
    li.addEventListener("click", () => { input.value = o; });
    menu.ajouter(li);
  }
  // cleSemantique : <label for="estimated_parcel_weight"> posé à côté de
  // l'input à id React (le cas mesuré le 16/09) ; sinon le label pointe l'id React.
  const label = new Noeud(doc, "label", { for: cleSemantique ? cle : idReact }, libelle);
  return { bloc: new Noeud(doc, "div", { class: "champ" }).ajouter(label, new Noeud(doc, "div").ajouter(input), menu), input };
}
function formulaire({ pro = true, critereApresMs = 9000, cleSemantique = true }) {
  const doc = new Doc();
  const form = new Noeud(doc, "form");
  doc.body.ajouter(form);
  if (pro) {
    form.ajouter(new Noeud(doc, "div").ajouter(new Noeud(doc, "label", { for: "custom_ref" }, "Référence"), new Noeud(doc, "input", { name: "custom_ref", type: "text" })));
  }
  const etat = combobox(doc, { cle: "condition", libelle: "État*", options: ETATS, idReact: ":form-field-_r_23_", cleSemantique });
  const poids = combobox(doc, { cle: "estimated_parcel_weight", libelle: "Poids du colis*", options: POIDS, idReact: ":form-field-_r_55_", cleSemantique });
  const continuer = new Noeud(doc, "button", {}, "Continuer");
  continuer.addEventListener("click", () => { if (!doc.querySelector("#body")) doc.body.ajouter(new Noeud(doc, "textarea", { id: "body" })); });
  // Le bouton payant de l'écran /options, présent dès le départ pour qu'un clic
  // égaré se voie : il ne doit JAMAIS être cliqué.
  const payer = new Noeud(doc, "button", {}, "Valider et payer");
  doc.body.ajouter(continuer, payer);
  // AUCUNE case livraison (formulaire PRO) : le poids ne passe que par le canal générique.
  return { doc, form, etat, poids, continuer, payer, rendre: () => form.ajouter(etat.bloc, poids.bloc), critereApresMs };
}

// ── Le bac à sable : leboncoin.js tel quel, sur la maquette ──────────────────
const H = horlogeVirtuelle();
function charger(maquette) {
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    document: maquette.doc, setTimeout: H.setT, clearTimeout: H.clearT, setInterval: () => 0, clearInterval: () => {},
    Date: H.FDate, URL, Math, JSON, Promise, Blob,
    MouseEvent: FEvent, PointerEvent: FEvent, KeyboardEvent: FEvent, Event: FEvent, InputEvent: FEvent,
    CSS: { escape: (s) => String(s).replace(/["\\]/g, "\\$&") },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    location: { href: "https://www.leboncoin.fr/deposer-une-annonce", pathname: "/deposer-une-annonce", hostname: "www.leboncoin.fr" },
    navigator: { userAgent: "selftest" },
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.top = ctx; ctx.addEventListener = () => {};
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "leboncoin.js" });
  // Étape 1 et photos (titre, catégorie, page photos) : hors sujet ici.
  ctx.typeInto = async () => {};
  ctx.selectCategory = async () => {};
  ctx.advanceWizardTo = async () => new Noeud(maquette.doc, "input", { type: "file" });
  ctx.setFieldValue = (el, v) => { el.value = String(v); };
  return ctx;
}
const JOB = (pro) => ({
  id: "b1b9bb68-c579-486e-b89d-0275de7bea82", title: "Lot de vêtements", photos: [],
  platform_fields: {
    ...(pro ? { compte_pro: true } : {}), lbcCategoryPath: ["Mode", "Vêtements"],
    lbcAspects: { condition: "Très bon état", estimated_parcel_weight: "De 1 kg à 2 kg" }, etat: "Très bon état",
  },
});
async function remplir(maquette, job) {
  H.remettre();
  const ctx = charger(maquette);
  H.setT(maquette.rendre, maquette.critereApresMs); // les critères arrivent tard, comme sur le formulaire PRO
  const warnings = [], unfilled = [];
  const avance = await H.executer(ctx.lbcRemplirJusquAApercu(job, job.platform_fields, warnings, unfilled));
  return { ctx, avance, warnings, unfilled, fin: H.ms() };
}

console.log("\n1. b1b9bb68 : formulaire PRO, critères rendus 9 s après la sonde");
{
  const m = formulaire({ pro: true, critereApresMs: 9000 });
  const r = await remplir(m, JOB(true));
  ok(m.poids.input.value === "De 1 kg à 2 kg", "« Poids du colis* » = « De 1 kg à 2 kg » (avant : sonde de 4 s, poids jamais posé)", `valeur : « ${m.poids.input.value} » ; warnings : ${r.warnings.join(" | ")}`);
  ok(m.etat.input.value === "Très bon état", "« État* » = « Très bon état »");
  ok(r.avance?.bodyArea && m.continuer.clics === 1, "« Continuer » cliqué une fois, l'aperçu est atteint");
  ok(m.payer.clics === 0, "« Valider et payer » : JAMAIS cliqué");
  ok(!r.warnings.some((w) => /aucun critère/.test(w)), "aucun avertissement de sonde (les critères ont été vus)");
}

console.log("\n2. Formulaire PRO, critères rendus 17 s après (au-delà des 15 s de sonde)");
{
  const m = formulaire({ pro: true, critereApresMs: 17_000 });
  const r = await remplir(m, JOB(true));
  ok(r.warnings.some((w) => /aucun critère vu en 15 s sur le formulaire PRO/.test(w)), "la sonde muette est DITE dans les warnings", r.warnings.join(" | "));
  ok(m.poids.input.value === "De 1 kg à 2 kg", "la seconde passe (jouée même sonde muette, formulaire PRO) pose le poids", `valeur : « ${m.poids.input.value} »`);
  ok(m.etat.input.value === "Très bon état", "…et l'état");
  ok(m.payer.clics === 0, "« Valider et payer » : JAMAIS cliqué");
}

console.log("\n3. Formulaire PRO, label sans clé sémantique (for= id React) : posé par le LIBELLÉ");
{
  const m = formulaire({ pro: true, critereApresMs: 2000, cleSemantique: false });
  const r = await remplir(m, JOB(true));
  ok(m.poids.input.value === "De 1 kg à 2 kg", "« Poids du colis » retrouvé par son libellé et posé (avant : vu par le libellé, rempli par label[for] seul → false sans un mot)", `valeur : « ${m.poids.input.value} » ; ${r.warnings.join(" | ")}`);
  ok(m.etat.input.value === "Très bon état", "« État » aussi, par son libellé");
  ok(m.payer.clics === 0, "« Valider et payer » : JAMAIS cliqué");
}

console.log("\n4. Particulier : la sonde de 4 s ne change pas");
{
  const m = formulaire({ pro: false, critereApresMs: 9000 });
  const job = JOB(false);
  H.remettre();
  const ctx = charger(m);
  H.setT(m.rendre, m.critereApresMs);
  const warnings = [];
  const s = await H.executer(ctx.sonderCriteresLbc(job, warnings));
  ok(s.hasCriteria === null && s.formulairePro === false && H.ms() >= 4000 && H.ms() < 4300, `rien vu en 4 s → null (comme avant), ${H.ms()} ms virtuelles`);
  ok(warnings.some((w) => /aucun critère combobox vu en 4 s/.test(w)), "…et c'est dit dans les warnings");
  H.remettre();
  const m2 = formulaire({ pro: false, critereApresMs: 1000 });
  const ctx2 = charger(m2);
  H.setT(m2.rendre, m2.critereApresMs);
  const s2 = await H.executer(ctx2.sonderCriteresLbc(job, []));
  ok(s2.hasCriteria && H.ms() >= 1000 && H.ms() < 1300, "critère rendu à 1 s : vu à 1 s");
}

console.log("\n5. Au verdict : la valeur connue, SI la liste la porte (jamais hors liste)");
{
  const m = formulaire({ pro: true, critereApresMs: 0 });
  H.remettre();
  const ctx = charger(m);
  m.rendre();
  const bloq = () => [{ key: "estimated_parcel_weight", label: "Poids du colis*", options: POIDS }, { key: "condition", label: "État*", options: ETATS }];
  const w1 = [];
  const b1 = bloq();
  const n1 = await H.executer(ctx.reposerValeursConnuesLbc(b1, { lbcAspects: { estimated_parcel_weight: "de 1 KG à 2 kg" } }, w1));
  ok(n1 === 1 && m.poids.input.value === "De 1 kg à 2 kg" && b1.length === 1 && b1[0].key === "condition", "valeur du job dans la liste (normalizeFuzzy) → l'option EXACTE est posée, le bloqueur levé ; l'état reste à son propre bloc", `n=${n1}, valeur « ${m.poids.input.value} »`);
  m.poids.input.value = "";
  const w2 = [];
  const b2 = bloq();
  const n2 = await H.executer(ctx.reposerValeursConnuesLbc(b2, { lbcAspects: { estimated_parcel_weight: "1,5 kg" } }, w2));
  ok(n2 === 0 && m.poids.input.value === "" && b2.length === 2 && w2.some((w) => /ne figure pas dans la liste/.test(w)), "valeur hors liste → RIEN posé, la question part avec la liste");
  const n3 = await H.executer(ctx.reposerValeursConnuesLbc(bloq(), {}, []));
  ok(n3 === 0 && m.poids.input.value === "", "aucune valeur connue → rien posé");
  ok(ctx.valeurConnueDansListeLbc("De 1 kg à 2 kg", POIDS) === "De 1 kg à 2 kg" && ctx.valeurConnueDansListeLbc("2 kg", POIDS) === null, "valeurConnueDansListeLbc : égalité, jamais une contenance (« 2 kg » ≠ « De 1 kg à 2 kg »)");
  ok(m.payer.clics === 0, "« Valider et payer » : JAMAIS cliqué");
}

console.log("\n6. Ancres — le câblage dans lbcRemplirJusquAApercu et le verdict");
ok(/const \{ hasCriteria, formulairePro \} = await sonderCriteresLbc\(job, warnings\);/.test(SRC), "la sonde passe par sonderCriteresLbc");
ok(/label\[for="baby_age"\], label\[for="estimated_parcel_weight"\]'/.test(SRC) && /const LBC_SONDE_PRO_MS = 15_000;/.test(SRC) && /\[name="custom_ref"\]/.test(SRC), "sonde : Poids du colis, 15 s sur le formulaire PRO (compte_pro ou custom_ref)");
ok(/if \(hasCriteria \|\| formulairePro\) \{\s*etatPose = await lbcSecondePasseCriteres\(\{/.test(SRC), "seconde passe : `if (hasCriteria || formulairePro)`");
// (24/10 nuit) + l'origine de la valeur (« ia » : jamais par-dessus un pré-rempli précis de Leboncoin).
ok(/fallbackValues: repliProduit, libelle: LBC_LIBELLES_PRO\[forKey\] \?\? null,\s*origineIa: origineLbc\[forKey\] === "ia",/.test(SRC), "canal générique : le libellé PRO en repli aussi au premier passage");
// (26/10, étape 5) Particulier : pas de critère « Poids du colis » (le poids part par le bloc livraison) — plus jamais
// « contrôle introuvable » sur 2 publications sur 3 ; le formulaire PRO garde la seconde passe et son avertissement.
ok(/if \(forKey === "estimated_parcel_weight" && !formulairePro\) \{[^}]*continue;\s*\}\s*clesAbsentesPremierePasse\.push\(\[forKey, val\]\);/.test(SRC), "particulier : estimated_parcel_weight n'est jamais noté absent (le poids passe par la livraison) ; PRO inchangé");
ok(/if \(!reposeEtatFaite\) reposes \+= await reposerValeursConnuesLbc\(bloqueurs, fields, warnings\);/.test(SRC)
  && /if \(reposes && !bloqueurs\.length && !reposeEtatFaite\) \{[\s\S]{0,200}reposeEtatFaite = true;/.test(SRC), "verdict : valeurs connues reposées, UN seul recliquage de « Continuer »");
ok(!/valider et payer[^\n]*realClick|realClick\([^)]*payer/i.test(SRC), "aucun chemin ne clique « Valider et payer »");

console.log(`\n${n - ko}/${n} vérifications`);
if (ko) { console.log(`✗ ${ko} échec(s)`); process.exit(1); }
console.log("✓ selftest lbc-pro-poids : OK");
