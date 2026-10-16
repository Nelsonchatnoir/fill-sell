// ═══════════════════════════════════════════════════════════════════════════
// Selftest « panneau des racines » — CATÉGORIE LEBONCOIN (16/10/2026, PAUGUES)
//   node scripts/lbc-categorie-racines-selftest.mjs [chemin/vers/leboncoin.js]
//
// LE CAS : 9 dépôts de PAUGUES (compte PRO, 15/10) arrêtés sur « Catégorie:
// panneau des racines introuvable », 7 reprises chacun ; seul autre cas en 45
// jours : MeMiniandMove (PRO, 21/09). Lu dans le code du dépôt Leboncoin le
// 16/10 : le sélecteur manuel filtre l'arbre par type de compte et « Divers »
// (id 37, droits { private: {buy, sell}, pro: {} }) n'existe pas pour un pro.
// L'ancien repère exigeait « Divers » dans la liste : il ne trouvait jamais le
// panneau d'un pro.
// CE QUE CE TEST PROUVE, sur les fonctions RÉELLES de leboncoin.js (extraites,
// jamais recopiées) :
//   1. le panneau est reconnu chez un particulier (13 racines), chez un pro
//      (12, sans Divers), en mise en page étroite (une liste, un tiroir) ;
//   2. une autre liste (pied de page, feuilles d'une racine) n'est jamais prise
//      pour le panneau des racines ;
//   3. l'ancien repère, lui, ne trouvait rien sur l'arbre d'un pro (la cause) ;
//   4. de bout en bout (selectCategory) : compte pro, « Maison & Jardin >
//      Décoration » choisi au sélecteur manuel ; compte pro et chemin
//      « Divers > Autres » : la racine absente passe par les suggestions de
//      Leboncoin (règle du 12/09), jamais par « panneau introuvable ».
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonction } from "./lib/vinted-taille-bac.mjs";
import { Doc, h } from "./lib/mini-dom.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHEMIN = process.argv[2] ?? join(ROOT, "chrome-extension/content-scripts/leboncoin.js");
const SRC = readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n");

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

const ligne = (re) => { const m = SRC.match(re); if (!m) throw new Error(`introuvable : ${re}`); return m[0]; };

// L'arbre relevé dans le code du dépôt (16/10) : les racines d'un particulier,
// et celles d'un pro — les mêmes moins « Divers » (aucun droit pro).
const RACINES_PART = ["Emploi", "Véhicules", "Immobilier", "Locations de vacances", "Électronique", "Maison & Jardin",
  "Famille", "Mode", "Loisirs", "Animaux", "Matériel professionnel", "Services", "Divers"];
const RACINES_PRO = RACINES_PART.filter((r) => r !== "Divers");
const FEUILLES = {
  "Maison & Jardin": ["Ameublement", "Papeterie & Fournitures scolaires", "Électroménager", "Arts de la table", "Décoration", "Linge de maison", "Bricolage", "Jardin & Plantes"],
  Mode: ["Vêtements", "Chaussures", "Accessoires & Bagagerie", "Montres & Bijoux"],
  Loisirs: ["Antiquités", "Collection", "Livres", "Jeux & Jouets"],
  Divers: ["Autres"],
};

// Une racine telle que le dépôt la rend : <li><button><icône/><span>nom</span><chevron/></button></li>.
const liRacine = (nom, onclick) => {
  const b = h("button", { type: "button", id: nom }, h("div", {}), h("span", { class: "icone" }), h("span", {}, nom), h("span", { class: "chevron" }));
  b.onclick = onclick;
  return h("li", { class: "w-full" }, b);
};

// ── Le bac à sable : les fonctions RÉELLES, un document fabriqué ────────────
function charger(document, { suggestions = [] } = {}) {
  const corps = [
    extraireFonction(SRC, "texteComparable"),
    ligne(/^const normalizeFuzzy = .+;$/m),
    ligne(/^const RACINES_LBC = Object\.freeze\(\[[\s\S]*?\]\);$/m),
    extraireFonction(SRC, "trouverPanneauRacinesLbc"),
    extraireFonction(SRC, "releveListesCategorieLbc"),
    extraireFonction(SRC, "findSuggestionRadio"),
    extraireFonction(SRC, "choisirSuggestionLeboncoin"),
    extraireFonction(SRC, "selectCategory"),
    extraireFonction(SRC, "waitFor"),
    "return { trouverPanneauRacinesLbc, releveListesCategorieLbc, selectCategory };",
  ].join("\n\n");
  const sleep = () => Promise.resolve();
  const humanPause = () => Promise.resolve();
  const MouseEvent = class { constructor(type) { this.type = type; } };
  const chrome = { runtime: { sendMessage: async () => ({ choix: null, motif: "aucune" }) } };
  void suggestions;
  return new Function("document", "sleep", "humanPause", "MouseEvent", "chrome", "console", corps)(
    document, sleep, humanPause, MouseEvent, chrome, { log() {}, warn() {}, error() {} });
}

// ── 1-3. La reconnaissance du panneau ──────────────────────────────────────
console.log("1. Le panneau des racines est reconnu à ses racines");
{
  const pageAvec = (racines, { etroit = false } = {}) => new Doc([
    h("header", {}, h("ul", {}, ...["Aide", "Divers", "Contact", "Presse", "Carrières", "Blog", "Sécurité", "CGU", "Cookies", "Plan du site"].map((t) => h("li", {}, h("a", {}, t))))),
    h("div", { class: etroit ? "" : "flex" }, h("ul", { class: etroit ? "flex flex-col" : "border-r" }, ...racines.map((r) => liRacine(r)))),
  ]);
  const part = pageAvec(RACINES_PART);
  const S1 = charger(part);
  const p1 = S1.trouverPanneauRacinesLbc(part);
  ok("particulier (13 racines) : trouvé", p1 && p1.children.length === 13);
  const pro = pageAvec(RACINES_PRO);
  const S2 = charger(pro);
  const p2 = S2.trouverPanneauRacinesLbc(pro);
  ok("PRO (12 racines, sans Divers) : trouvé", p2 && p2.children.length === 12 && !p2.textContent.includes("Divers"));
  const etroit = pageAvec(RACINES_PRO, { etroit: true });
  const p3 = charger(etroit).trouverPanneauRacinesLbc(etroit);
  ok("mise en page étroite (une liste, un tiroir par racine) : trouvé", p3 && p3.children.length === 12);
  ok("le pied de page (10 liens dont « Divers ») n'est jamais pris", p1 !== part.querySelector("ul") && p2 !== pro.querySelector("ul"));
  const feuilles = new Doc([h("ul", {}, ...FEUILLES["Maison & Jardin"].map((f) => h("li", {}, h("button", {}, f))))]);
  ok("une liste de FEUILLES n'est pas un panneau de racines", charger(feuilles).trouverPanneauRacinesLbc(feuilles) === null);
  const menu = new Doc([h("nav", {}, h("ul", {}, ...RACINES_PRO.map((r) => h("li", {}, h("a", { href: `/${r}` }, r)))))]);
  ok("un menu de LIENS qui nomme les rubriques n'est jamais pris (jamais cliqué)", charger(menu).trouverPanneauRacinesLbc(menu) === null);
  const rien = new Doc([h("ul", {}, h("li", {}, "Mode"), h("li", {}, "Loisirs"), h("li", {}, "Famille"))]);
  ok("trois racines seulement : pas de conclusion", charger(rien).trouverPanneauRacinesLbc(rien) === null);
  ok("le relevé d'échec dit ce que la page montrait", /liste\(s\), les plus longues/.test(charger(rien).releveListesCategorieLbc(rien)));
}

console.log("2. La cause : l'ancien repère ne trouvait JAMAIS le panneau d'un pro");
{
  const ancien = (doc) => [...doc.querySelectorAll("ul")].find((u) => u.children.length >= 10 && u.textContent.includes("Divers")) ?? null;
  const pro = new Doc([h("ul", {}, ...RACINES_PRO.map((r) => liRacine(r)))]);
  const part = new Doc([h("ul", {}, ...RACINES_PART.map((r) => liRacine(r)))]);
  ok("ancien repère, particulier : trouvé (c'est pour ça que personne d'autre n'était touché)", ancien(part) !== null);
  ok("ancien repère, PRO : RIEN → « panneau des racines introuvable »", ancien(pro) === null);
  ok("le code livré n'a plus l'ancien repère", !/u\.children\.length >= 10 && u\.textContent\.includes\("Divers"\)/.test(SRC));
}

// ── 4. De bout en bout : selectCategory sur la page d'un pro ────────────────
// Le sélecteur manuel du dépôt : un bouton « Choisissez » ouvre le panneau des
// racines (filtrées par droits) ; une racine ouvre ses feuilles ; une feuille
// choisit la catégorie.
function pageDepot({ racines, suggestions = [] }) {
  const choix = [];
  const zone = h("div", { class: "my-xl" });
  const doc = new Doc([
    h("form", {},
      h("input", { name: "subject", value: "Salière étain ancienne" }),
      ...suggestions.map((s) => h("li", {}, h("input", { type: "radio", value: s.id }), h("span", {}, s.libelle))),
      zone),
  ]);
  for (const r of doc.querySelectorAll('input[type="radio"]')) r.onclick = () => choix.push(`suggestion:${r.parentElement.textContent}`);
  const declencheur = h("button", { type: "button" }, h("span", {}, "Choisissez"));
  const fermer = h("button", { type: "button" }, "Fermer");
  fermer.onclick = () => { for (const c of [...zone.children]) if (c !== declencheur) zone.retirer(c); };
  zone.ajouter(declencheur);
  declencheur.onclick = () => {
    const panneau = h("div", { class: "flex" });
    const ulRacines = h("ul", { class: "border-r" }, ...racines.map((r) => liRacine(r, () => {
      for (const u of panneau.children.slice(1)) panneau.retirer(u);
      panneau.ajouter(h("ul", { class: "flex flex-col" }, ...(FEUILLES[r] ?? []).map((f) => {
        const b = h("button", { type: "button" }, h("span", {}, f));
        b.onclick = () => choix.push(`${r} > ${f}`);
        return h("li", {}, b);
      })));
    })));
    panneau.ajouter(ulRacines);
    zone.ajouter(panneau);
    zone.ajouter(fermer);
  };
  return { doc, choix };
}

console.log("3. De bout en bout : compte PRO, sélecteur manuel");
{
  const { doc, choix } = pageDepot({ racines: RACINES_PRO, suggestions: [{ id: "39", libelle: "Maison & JardinArts de la table" }] });
  const S = charger(doc);
  const warnings = [];
  let erreur = null;
  await S.selectCategory("Maison & Jardin", "Décoration", { warnings }).catch((e) => { erreur = e; });
  ok("aucune erreur (avant : « panneau des racines introuvable »)", erreur === null, String(erreur?.message ?? ""));
  ok("Maison & Jardin > Décoration choisie au sélecteur manuel", choix.join("|") === "Maison & Jardin > Décoration", choix.join("|"));
}
{
  const { doc, choix } = pageDepot({ racines: RACINES_PART });
  const S = charger(doc);
  let erreur = null;
  await S.selectCategory("Mode", "Montres & Bijoux", {}).catch((e) => { erreur = e; });
  ok("particulier : inchangé (Mode > Montres & Bijoux)", erreur === null && choix.join("|") === "Mode > Montres & Bijoux", `${erreur?.message ?? ""} ${choix.join("|")}`);
}
console.log("4. Compte PRO et chemin « Divers > Autres » : la racine absente passe par les suggestions");
{
  const { doc, choix } = pageDepot({ racines: RACINES_PRO, suggestions: [{ id: "19", libelle: "Maison & JardinAmeublement" }] });
  const S = charger(doc);
  const warnings = [];
  let erreur = null;
  await S.selectCategory("Divers", "Autres", { warnings }).catch((e) => { erreur = e; });
  ok("aucune erreur", erreur === null, String(erreur?.message ?? ""));
  ok("la suggestion de Leboncoin est retenue", choix.join("|") === "suggestion:Maison & JardinAmeublement", choix.join("|"));
  ok("le remplacement est TRACÉ (categorie_chemin_invalide)", warnings.some((w) => w?.code === "categorie_chemin_invalide"));
}
{
  // Le panneau ne se monte pas du tout : l'échec garde son motif (reprise du serveur) et dit ce que la page montrait.
  const doc = new Doc([h("form", {}, h("div", {}, (() => { const b = h("button", { type: "button" }, "Choisissez"); b.onclick = () => {}; return b; })()))]);
  let erreur = null;
  await charger(doc).selectCategory("Mode", "Vêtements", {}).catch((e) => { erreur = e; });
  ok("panneau jamais monté : même motif, relevé joint", /^Catégorie: panneau des racines introuvable\. — Observabilité: /.test(String(erreur?.message ?? "")), String(erreur?.message ?? ""));
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ panneau des racines Leboncoin : tout passe");
process.exit(ko ? 1 : 0);
