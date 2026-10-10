// `npm run selftest:depop-partout` — AUCUNE LISTE DE PLATEFORMES N'OUBLIE DEPOP
// (faiblesse 5 du rattachement Depop, 09/10/2026).
//
// POURQUOI. Le projet n'a pas de liste unique des plateformes : chaque module
// écrit la sienne en dur (libellés, relevés, murs de connexion, canaux de
// questions…). La créer aurait touché des centaines de lignes en service pour
// les cinq plateformes actuelles, sans preuve de zéro régression possible en
// une nuit. Choix : Depop est ajoutée PARTOUT où les autres sont écrites, et ce
// test refuse qu'une liste l'oublie. Une liste qui nomme Beebs ET Opla nomme
// Depop — ou figure ci-dessous, avec la RAISON pour laquelle Depop n'y a pas sa
// place. Une nouvelle liste sans Depop fait tomber ce test : on décide, on ne
// laisse pas filer.
//
// CE QUI EST LU (arbre syntaxique TypeScript, jamais une regex sur le texte —
// une liste écrite sur plusieurs lignes est vue comme une autre) :
//   · un tableau littéral qui contient les chaînes "beebs" et "opla" ;
//   · un objet littéral dont les clés comprennent beebs et opla ;
//   · une expression régulière dont une alternative nomme Beebs et Opla ;
//   · un `switch` qui a un `case "beebs"` et un `case "opla"`.
// Dossiers : src/, supabase/functions/, chrome-extension/ (pas les tests, pas
// les fichiers générés hors code).
//
//   node scripts/depop-partout-selftest.mjs              → contrôle
//   node scripts/depop-partout-selftest.mjs --inventaire → toutes les listes
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIERS = ["src", "supabase/functions", "chrome-extension"];
const EXTENSIONS = /\.(js|jsx|ts|tsx|mjs)$/;
const IGNORES = new Set(["node_modules", "dist", "build"]);

// ═══════════════════════════════════════════════════════════════════════════
// LES EXCEPTIONS — chaque entrée dit POURQUOI Depop n'a pas sa place
// ═══════════════════════════════════════════════════════════════════════════
// fichier + signature (le genre de liste et ses éléments, triés) + nombre
// exact d'occurrences dans le fichier. Une liste de plus avec la même
// signature fait tomber le test : une exception ne couvre que ce qu'elle a vu.
export const EXCEPTIONS = [
  // ── SERVEUR ────────────────────────────────────────────────────────────────
  // (10/10) Plus d'exception pour les créneaux de la republication PLANIFIÉE :
  // get-pending-jobs prend la liste du serveur (republish_planifiee_fenetres_courantes),
  // Depop comprise — plus aucune liste écrite en dur.
  { fichier: "supabase/functions/get-pending-jobs/index.ts", signature: "tableau:beebs,ebay,leboncoin,opla", n: 1,
    raison: "Ligne gardée à l'octet (selftest:beebs-age-republication) : Depop y est ajoutée juste à côté, « || j.platform === \"depop\" »." },
  { fichier: "supabase/functions/resolve-categorie/index.ts", signature: "tableau:beebs,ebay,leboncoin,opla,vinted", n: 1,
    raison: "Arbitrage de catégorie par LIBELLÉS : la catégorie Depop se pose par identifiant seulement (faiblesse 3, depopCategoryPath), jamais par cette fonction." },
  { fichier: "supabase/functions/_shared/etat-plateformes.js", signature: "objet:beebs,ebay,leboncoin,opla,vestiaire,vinted", n: 5,
    raison: "Libellés FRANÇAIS de l'état écrits dans les textes : l'état Depop est un identifiant (brand_new…), posé par l'app depuis le palier (src/utils/depopAttributs.js, DEPOP_ETAT_PAR_PALIER) ; aucun texte Depop ne l'écrit." },
  { fichier: "supabase/functions/_shared/titre-du-job.js", signature: "objet:beebs,ebay,leboncoin,opla,vinted", n: 1,
    raison: "Plafond de TITRE : une annonce Depop n'a pas de titre — get-pending-jobs exclut Depop de la question « Titre »." },
  // ── EXTENSION ──────────────────────────────────────────────────────────────
  { fichier: "chrome-extension/background.js", signature: "tableau:beebs,ebay,leboncoin,opla,vinted", n: 2,
    raison: "Listes PAR DÉFAUT des sondes de session, gardées à l'octet (le build Cloud les remplace) : Depop est ajoutée dans le corps de reportPlatformSessions, chez le seul poste qui a la permission www.depop.com." },
  { fichier: "chrome-extension/background.js", signature: "tableau:beebs,ebay,leboncoin,opla", n: 1,
    raison: "RELEVE_PLATEFORMES gardée à l'octet (le build Cloud la remplace) : Depop y entre par RELEVE_PLATEFORMES.push(\"depop\"), juste dessous, sautée sans la permission." },
  // ── APP ────────────────────────────────────────────────────────────────────
  { fichier: "src/stock/Carte.jsx", signature: "objet:beebs,ebay,leboncoin,opla,vinted", n: 1,
    raison: "Règle de la refonte du stock (selftest:stock-refonte) : aucune plateforme nouvelle écrite en dur dans src/stock/ — le nom de Depop vient de stockFiltres.LIBELLE_PLATEFORME (repli de la même ligne)." },
  { fichier: "src/utils/jeuxVideo.js", signature: "objet:beebs,cle,ebay,lbc,opla,salon,vinted", n: 21,
    raison: "Machines de jeu et leur valeur PAR PLATEFORME (champ « Console ») : Depop n'a aucun rayon jeux vidéo (🎮 « unavailable », depopCategories.js) ni de champ console." },
  { fichier: "src/utils/jeuxVideo.js", signature: "objet:beebs,cle,ebay,lbc,opla,portable,vinted", n: 8,
    raison: "Machines portables, même table : Depop n'a aucun rayon jeux vidéo ni de champ console." },
  { fichier: "src/utils/jeuxVideo.js", signature: "objet:beebs,cle,ebay,lbc,opla,vinted", n: 4,
    raison: "Machines hybrides / génériques, même table : Depop n'a aucun rayon jeux vidéo ni de champ console." },
  { fichier: "src/utils/jeuxVideo.js", signature: "objet:beebs,ebay,leboncoin,opla,vinted", n: 1,
    raison: "Feuilles jeu / console / accessoire par LIBELLÉS : le rayon Depop se pose par identifiant (icône), et 🎮 n'y a pas de rayon." },
  // (10/10) La republication PLANIFIÉE nomme Depop (écran, hook, Réglages) :
  // ses trois exceptions du 09/10 sont retirées, la règle s'applique.
  { fichier: "src/publication/moteur/champsPartages.js", signature: "tableau:beebs,ebay,leboncoin,opla,vinted", n: 1,
    raison: "Propagation de la MATIÈRE : elle ne part pas chez Depop (facultative, non envoyée par le connecteur) — taille, couleur et marque, elles, la nomment." },
  { fichier: "src/publication/moteur/champsPartages.js", signature: "objet:beebs,leboncoin,opla,vinted", n: 2,
    raison: "Canal des ASPECTS GÉNÉRIQUES relevés au formulaire (platform_category_aspects) : Depop n'a pas de formulaire relevé — son dépôt passe par l'API, en identifiants." },
  { fichier: "src/utils/rayonFourreToutRelance.js", signature: "objet:beebs,leboncoin,opla,vinted", n: 2,
    raison: "Relance des rayons FOURRE-TOUT « Autres » posés par défaut : le moteur Depop n'en pose jamais (depopCategories.js : SANS_FEUILLE_DEFAUT, un « Autre » ne se choisit jamais par défaut)." },
  { fichier: "src/utils/resolutionPublication.js", signature: "tableau:beebs,leboncoin,opla", n: 1,
    raison: "Descente d'ARBRE DE LIBELLÉS après un refus : jamais pour Depop (faiblesse 3 — rayon par identifiant seulement)." },
];

// ═══════════════════════════════════════════════════════════════════════════
// LA LECTURE
// ═══════════════════════════════════════════════════════════════════════════
const MOT = (m) => new RegExp(`(^|[^A-Za-z0-9_])${m}([^A-Za-z0-9_]|$)`, "i");
const B = MOT("beebs"), O = MOT("opla"), D = MOT("depop");

function nomDeCle(nom) {
  if (!nom) return null;
  if (ts.isIdentifier(nom) || ts.isPrivateIdentifier(nom)) return nom.text;
  if (ts.isStringLiteral(nom) || ts.isNoSubstitutionTemplateLiteral(nom) || ts.isNumericLiteral(nom)) return nom.text;
  return null; // clé calculée : illisible, ignorée
}

// Un étalement conditionnel compte : `...(cond ? { depop: x } : {})` ou
// `...(cond ? ["depop"] : [])` — Depop y est, seulement sous condition.
function etaleDepop(expr) {
  let trouve = false;
  const voir = (n) => {
    if (trouve) return;
    if (ts.isObjectLiteralExpression(n) && n.properties.some((p) => String(nomDeCle(p.name) ?? "").toLowerCase() === "depop")) trouve = true;
    else if (ts.isArrayLiteralExpression(n) && n.elements.some((x) => ts.isStringLiteral(x) && x.text.toLowerCase() === "depop")) trouve = true;
    else if (ts.isParenthesizedExpression(n) || ts.isConditionalExpression(n) || ts.isBinaryExpression(n)) ts.forEachChild(n, voir);
  };
  voir(expr);
  return trouve;
}

/** Toutes les listes de plateformes d'un source. Pur : testé ci-dessous. */
export function listesDuSource(source, fichier = "x.ts") {
  const kind = /\.tsx$/.test(fichier) ? ts.ScriptKind.TSX
    : /\.ts$/.test(fichier) ? ts.ScriptKind.TS
    : /\.jsx$/.test(fichier) ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  const ligne = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visite = (n) => {
    if (ts.isArrayLiteralExpression(n)) {
      const els = n.elements.filter((e) => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)).map((e) => e.text.toLowerCase());
      if (els.includes("beebs") && els.includes("opla")) {
        const etale = n.elements.some((x) => ts.isSpreadElement(x) && etaleDepop(x.expression));
        out.push({ genre: "tableau", ligne: ligne(n), elements: [...new Set(els)].sort(), avecDepop: els.includes("depop") || etale });
      }
    } else if (ts.isObjectLiteralExpression(n)) {
      const cles = n.properties.map((p) => nomDeCle(p.name)).filter((c) => c != null).map((c) => c.toLowerCase());
      if (cles.includes("beebs") && cles.includes("opla")) {
        const etale = n.properties.some((x) => ts.isSpreadAssignment(x) && etaleDepop(x.expression));
        out.push({ genre: "objet", ligne: ligne(n), elements: [...new Set(cles)].sort(), avecDepop: cles.includes("depop") || etale });
      }
    } else if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const t = n.getText(sf);
      if (B.test(t) && O.test(t)) out.push({ genre: "regex", ligne: ligne(n), elements: [t], avecDepop: D.test(t) });
    } else if (ts.isSwitchStatement(n)) {
      const cas = n.caseBlock.clauses.filter(ts.isCaseClause)
        .map((c) => (ts.isStringLiteral(c.expression) ? c.expression.text.toLowerCase() : null)).filter(Boolean);
      if (cas.includes("beebs") && cas.includes("opla")) {
        out.push({ genre: "switch", ligne: ligne(n), elements: [...new Set(cas)].sort(), avecDepop: cas.includes("depop") });
      }
    }
    ts.forEachChild(n, visite);
  };
  visite(sf);
  return out;
}

export const signature = (l) => `${l.genre}:${l.elements.join(",")}`;

function* fichiers(dossier) {
  if (!fs.existsSync(dossier)) return;
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) { if (!IGNORES.has(e.name)) yield* fichiers(p); }
    else if (EXTENSIONS.test(e.name)) yield p;
  }
}

/** Les oublis : listes sans Depop non couvertes par une exception exacte. */
export function oublis(listesParFichier, exceptions = EXCEPTIONS) {
  const fautes = [];
  const parCle = new Map();
  for (const [fichier, listes] of listesParFichier) {
    for (const l of listes) {
      if (l.avecDepop) continue;
      const cle = `${fichier}|${signature(l)}`;
      if (!parCle.has(cle)) parCle.set(cle, []);
      parCle.get(cle).push(l);
    }
  }
  const vues = new Set();
  for (const [cle, ls] of parCle) {
    const [fichier, sig] = cle.split("|");
    const ex = exceptions.find((x) => x.fichier === fichier && x.signature === sig);
    if (!ex) { for (const l of ls) fautes.push(`${fichier}:${l.ligne} — ${l.genre} sans Depop : ${l.elements.join(", ").slice(0, 160)}`); continue; }
    vues.add(ex);
    if (!ex.raison || ex.raison.length < 12) fautes.push(`${fichier} — exception sans raison écrite (${sig.slice(0, 80)})`);
    if (ls.length !== ex.n) fautes.push(`${fichier} — ${ls.length} liste(s) « ${sig.slice(0, 80)} » pour ${ex.n} excusée(s) : une liste de plus (ou de moins) se décide`);
  }
  for (const ex of exceptions) {
    if (!vues.has(ex)) fautes.push(`${ex.fichier} — exception périmée (plus aucune liste « ${ex.signature.slice(0, 80)} ») : la retirer`);
  }
  return fautes;
}

function toutesLesListes() {
  const res = new Map();
  for (const d of DOSSIERS) {
    for (const f of fichiers(path.join(RACINE, d))) {
      const rel = path.relative(RACINE, f).split(path.sep).join("/");
      const listes = listesDuSource(fs.readFileSync(f, "utf8"), rel);
      if (listes.length) res.set(rel, listes);
    }
  }
  return res;
}

// ═══════════════════════════════════════════════════════════════════════════
// LE CONTRÔLE
// ═══════════════════════════════════════════════════════════════════════════
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const toutes = toutesLesListes();
  if (process.argv.includes("--inventaire")) {
    for (const [f, ls] of toutes) for (const l of ls) {
      console.log(`${l.avecDepop ? "✓" : "✗"} ${f}:${l.ligne}  ${signature(l).slice(0, 180)}`);
    }
    process.exit(0);
  }
  let ko = 0;
  const dit = (nom, c, detail) => { if (!c) ko++; console.log(`  ${c ? "ok  " : "❌  "} ${nom}${c || detail === undefined ? "" : `  → ${detail}`}`); };

  console.log("\nLE DÉTECTEUR VOIT CE QU'IL DOIT VOIR (sources synthétiques)");
  const vu = (src, f = "x.js") => listesDuSource(src, f);
  dit("un tableau sans Depop est vu", vu(`const L = ["vinted", "beebs", "opla"];`).some((l) => !l.avecDepop));
  dit("le même tableau avec Depop passe", vu(`const L = ["vinted", "beebs", "opla", "depop"];`).every((l) => l.avecDepop));
  dit("un objet écrit sur plusieurs lignes est vu", vu(`const N = {\n  vinted: "Vinted",\n  beebs: "Beebs",\n  opla: "Opla",\n};`).some((l) => l.genre === "objet" && !l.avecDepop));
  dit("un objet en TypeScript (as Record) est vu", vu(`const N = ({ beebs: "Beebs", opla: "Opla" } as Record<string, string>)[p];`, "x.ts").some((l) => l.genre === "objet" && !l.avecDepop));
  dit("une regex d'alternative est vue", vu(`const R = /Suppression envoyée à (Beebs|Leboncoin|Opla|Vinted)/;`).some((l) => l.genre === "regex" && !l.avecDepop));
  dit("un switch est vu", vu(`switch (p) { case "beebs": break; case "opla": break; }`).some((l) => l.genre === "switch" && !l.avecDepop));
  dit("du JSX ne gêne pas", vu(`const C = () => <div>{["beebs", "opla"].map((x) => <i key={x} />)}</div>;`, "x.jsx").length === 1);
  dit("une liste sans Opla n'est pas une liste de plateformes ici", vu(`const L = ["beebs", "vinted"];`).length === 0);
  dit("Depop ajoutée par étalement conditionnel compte", vu(`const O = { beebs: 1, opla: 2, ...(a ? { depop: 3 } : {}) };`).every((l) => l.avecDepop));
  dit("un étalement SANS Depop ne compte pas", vu(`const O = { beebs: 1, opla: 2, ...(a ? { autre: 3 } : {}) };`).some((l) => !l.avecDepop));

  console.log("\nUNE EXCEPTION NE COUVRE QUE CE QU'ELLE A VU");
  const m1 = new Map([["a.js", vu(`const L = ["beebs", "opla"];`)]]);
  const sig1 = signature(m1.get("a.js")[0]);
  dit("sans exception : faute", oublis(m1, []).length === 1);
  dit("avec l'exception exacte : rien", oublis(m1, [{ fichier: "a.js", signature: sig1, n: 1, raison: "raison écrite en clair" }]).length === 0);
  dit("une liste de plus avec la même signature : faute", oublis(new Map([["a.js", vu(`const L = ["beebs", "opla"]; const M = ["opla", "beebs"];`)]]), [{ fichier: "a.js", signature: sig1, n: 1, raison: "raison écrite en clair" }]).length === 1);
  dit("une exception sans raison : faute", oublis(m1, [{ fichier: "a.js", signature: sig1, n: 1, raison: "" }]).length === 1);
  dit("une exception périmée : faute", oublis(new Map(), [{ fichier: "a.js", signature: sig1, n: 1, raison: "raison écrite en clair" }]).length === 1);

  console.log("\nMUTATION RÉELLE : RETIRER DEPOP D'UNE LISTE EN SERVICE FAIT TOMBER LE TEST");
  {
    const f = "supabase/functions/_shared/rapprochement/moteur.js";
    const src = fs.readFileSync(path.join(RACINE, f), "utf8");
    const mute = src.replace(`'opla', 'depop']`, `'opla']`);
    const avant = oublis(new Map([...toutes, [f, listesDuSource(src, f)]]));
    const apres = oublis(new Map([...toutes, [f, listesDuSource(mute, f)]]));
    dit(`${f} : la mutation a bien eu lieu`, mute !== src);
    dit("et elle est vue", apres.length === avant.length + 1, `${avant.length} → ${apres.length}`);
  }
  {
    const f = "chrome-extension/background.js";
    const src = fs.readFileSync(path.join(RACINE, f), "utf8");
    const mute = src.replace(`ebay: "eBay", beebs: "Beebs", opla: "Opla", depop: "Depop"`, `ebay: "eBay", beebs: "Beebs", opla: "Opla"`);
    const avant = oublis(new Map([...toutes, [f, listesDuSource(src, f)]]));
    const apres = oublis(new Map([...toutes, [f, listesDuSource(mute, f)]]));
    dit(`${f} : la mutation a bien eu lieu`, mute !== src);
    dit("et elle est vue", apres.length > avant.length, `${avant.length} → ${apres.length}`);
  }

  console.log("\nLE DÉPÔT : CHAQUE LISTE NOMME DEPOP, OU DIT POURQUOI");
  let n = 0, avec = 0;
  for (const ls of toutes.values()) for (const l of ls) { n++; if (l.avecDepop) avec++; }
  const fautes = oublis(toutes);
  dit(`${n} listes lues (${avec} avec Depop, ${EXCEPTIONS.reduce((s, e) => s + e.n, 0)} excusées)`, n > 50, n);
  for (const f of fautes) console.log(`      ✗ ${f}`);
  dit("aucun oubli", fautes.length === 0, `${fautes.length} faute(s)`);

  if (ko) { console.error(`\n[selftest:depop-partout] ÉCHEC — ${ko} contrôle(s).`); process.exit(1); }
  console.log("\n[selftest:depop-partout] OK — aucune liste de plateformes n'oublie Depop sans raison écrite.");
}
