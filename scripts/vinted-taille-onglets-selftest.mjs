// ═══════════════════════════════════════════════════════════════════════════
// Selftest des ONGLETS DE TAILLE VINTED (2026-09-10, avant le paquet 0.6.25)
//   node scripts/vinted-taille-onglets-selftest.mjs
//
// CE QU'IL PROTÈGE — une seule chose, la plus dangereuse du lot 0.6.25 :
// `releverOngletsTaille()` ne doit JAMAIS prendre les OPTIONS d'une grille
// pour des ONGLETS. Le relevé du 10/09 sur /items/new montre un panneau Taille
// à SIX onglets (S/M/L 80, EU 82, UK 81, FR 83, IT 84, US 85), dont seul
// l'actif est dans le DOM ; mais beaucoup de catégories n'ont AUCUN onglet et
// servent une liste unique. Or la détection d'onglets est une heuristique de
// forme (« ≥ 2 boutons au texte court dans un ancêtre proche ») — et 12 des 17
// libellés du groupe 80 (« XXXS », « XXS », « XS », « S », « M »…) font ≤ 8
// caractères. Si les options sont elles-mêmes des <button>, l'heuristique nue
// les rend comme onglets et `activerOngletTaille` en CLIQUE une : une taille
// FAUSSE posée sur une grille qui marchait très bien avant le paquet.
//
// Le test fait tourner LE CODE RÉELLEMENT EMBARQUÉ : la fonction est extraite
// de chrome-extension/content-scripts/vinted.js, jamais recopiée ici. Si
// quelqu'un la réécrit sans la garde, ce test tombe.
//
// Le mini-DOM ci-dessous n'implémente que ce que la fonction touche
// (querySelector/querySelectorAll/closest/parentElement/textContent, sélecteurs
// « button » et « [data-testid^="…" ] ») — assez pour juger, pas un navigateur.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(ROOT, "chrome-extension/content-scripts/vinted.js"), "utf8");

// ── Extraction du code réel ────────────────────────────────────────────────
const selMatch = SRC.match(/^const TAILLE_OPTIONS_SEL = (.+);$/m);
const fnMatch = SRC.match(/^function releverOngletsTaille\(\) \{[\s\S]*?^\}$/m);
if (!selMatch) throw new Error("TAILLE_OPTIONS_SEL introuvable dans vinted.js");
if (!fnMatch) throw new Error("releverOngletsTaille() introuvable dans vinted.js");

// ── Mini-DOM ───────────────────────────────────────────────────────────────
class N {
  constructor(tag, attrs = {}, texte = "") {
    this.tag = tag; this.attrs = attrs; this.texte = texte;
    this.children = []; this.parentElement = null;
  }
  add(...kids) {
    for (const k of kids) { k.parentElement = this; this.children.push(k); }
    return this;
  }
  get textContent() {
    return this.children.length
      ? this.children.map((c) => c.textContent).join("")
      : this.texte;
  }
  getAttribute(n) { return this.attrs[n] ?? null; }
  matches(sel) {
    const pfx = sel.match(/^\[data-testid\^="(.+)"\]$/);
    if (pfx) return String(this.attrs["data-testid"] ?? "").startsWith(pfx[1]);
    return this.tag === sel;
  }
  *descendants() { for (const c of this.children) { yield c; yield* c.descendants(); } }
  querySelectorAll(sel) { return [...this.descendants()].filter((n) => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  closest(sel) {
    for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n;
    return null;
  }
}

let racine = null;
const document = {
  querySelector: (sel) => (racine.matches(sel) ? racine : racine.querySelector(sel)),
};

const releverOngletsTaille = new Function(
  "document", "TAILLE_OPTIONS_SEL",
  `${fnMatch[0]}\nreturn releverOngletsTaille;`,
)(document, eval(selMatch[1]));

// ── Fabriques de panneaux, calquées sur le relevé du 10/09 ─────────────────
const LETTRES = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL"];
const FR = ["FR 30", "FR 32", "FR 34", "FR 36", "FR 38", "FR 40", "FR 42", "FR 44", "FR 46"];
const ONGLETS = ["S/M/L", "EU", "UK", "FR", "IT", "US"];

/** Grille seule. `tagOption` : les options sont des <button> (le cas piégeux) ou des <div>. */
const grille = (groupe, libelles, tagOption, idDepart = 1735) =>
  new N("div", { class: "grid" }).add(
    ...libelles.map((t, i) =>
      new N(tagOption, { "data-testid": `size-group-${groupe}-grid-option-${idDepart + i}` }, t)),
  );

/** Panneau à onglets : barre d'onglets + grille, sous un ancêtre commun. */
const panneauAOnglets = (groupe, libelles, tagOption, idDepart) =>
  new N("div", { class: "panel" }).add(
    new N("div", { class: "tabs" }).add(...ONGLETS.map((t) => new N("button", {}, t))),
    grille(groupe, libelles, tagOption, idDepart),
  );

// ── Vérifications ──────────────────────────────────────────────────────────
let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.log(`  ✗ ${nom} ${extra}`); }
};
const lancer = (arbre) => { racine = arbre; return releverOngletsTaille().map((b) => b.texte); };

console.log("\n▸ Panneau à 6 onglets (relevé réel du 10/09, onglet FR actif)");
{
  for (const tagOption of ["button", "div"]) {
    const vus = lancer(panneauAOnglets(83, FR, tagOption, 1969));
    check(`options en <${tagOption}> → les 6 ONGLETS sont rendus`,
      JSON.stringify(vus) === JSON.stringify(ONGLETS), `→ ${JSON.stringify(vus)}`);
    check(`options en <${tagOption}> → aucune OPTION rendue comme onglet`,
      !vus.some((t) => FR.includes(t)), `→ ${JSON.stringify(vus)}`);
  }
}

console.log("\n▸ Grille SANS onglets (le cas que la garde protège)");
{
  const vus = lancer(grille(80, LETTRES, "button"));
  check("options en <button> au texte court → AUCUN onglet (liste vide)",
    vus.length === 0, `→ ${JSON.stringify(vus)} — sans la garde, ces options seraient CLIQUÉES`);
  const vusDiv = lancer(grille(80, LETTRES, "div"));
  check("options en <div> → AUCUN onglet (liste vide)",
    vusDiv.length === 0, `→ ${JSON.stringify(vusDiv)}`);
}

console.log("\n▸ Grille lettrée SANS onglets, sous un panneau profond");
{
  // Les options vivent 3 niveaux sous le panneau : la remontée (8 ancêtres) les
  // croise, mais aucune ne doit être retenue.
  const g = grille(80, LETTRES, "button");
  const arbre = new N("div", { class: "modal" }).add(
    new N("div", { class: "body" }).add(new N("div", { class: "scroll" }).add(g)),
  );
  const vus = lancer(arbre);
  check("remontée sur 8 ancêtres → toujours aucune option prise pour un onglet",
    vus.length === 0, `→ ${JSON.stringify(vus)}`);
}

console.log("\n▸ Le sélecteur d'option est ancré aux DEUX bouts");
{
  const ancre = /\$\{TAILLE_OPTIONS_SEL\}\[data-testid\$="-grid-option-\$\{id\}"\]/.test(SRC);
  check("trouverParId exige le préfixe « size-group- » ET le suffixe de l'id", ancre,
    "— un suffixe seul chercherait dans TOUT le document");
}

console.log("\n▸ Le strip « EU » n'est plus sur le chemin de la POSE");
{
  const stripPose = /replace\(\/\^EU\\s\*\/i, ""\)[\s\S]{0,200}selectClosedOptionSafe/.test(SRC);
  check("aucun replace(/^EU\\s*/i,\"\") ne nourrit selectClosedOptionSafe", !stripPose);
  const occurrences = (SRC.match(/replace\(\/\^EU\\s\*\/i, ""\)/g) ?? []).length;
  check("le seul strip « EU » restant est celui du DIAGNOSTIC (grille lettrée)",
    occurrences === 1, `→ ${occurrences} occurrence(s)`);
}

console.log(
  echecs === 0
    ? "\n[selftest:vinted-taille-onglets] OK — un onglet reste un onglet, une option reste une option.\n"
    : `\n[selftest:vinted-taille-onglets] ÉCHEC — ${echecs} vérification(s) en défaut.\n`,
);
process.exit(echecs === 0 ? 0 : 1);
