// ═══════════════════════════════════════════════════════════════════════════
// REJEU — LES TAILLES RANGÉES PAR SITE (12/11, point 1a) : ancien code ↔ nouveau, sur les valeurs RÉELLES
//   node --import ./scripts/loader-ext.mjs scripts/tailles-par-site-rejeu.mjs [--ancien <rev>]
//        [--depop <jobs.json>] [--copies <copies.json>]
// ═══════════════════════════════════════════════════════════════════════════
// Rejoue, <rev> (défaut HEAD) contre la copie de travail, ce que le point 1a change dans le vocabulaire commun
// (_shared/tailles.js, copié dans l'extension Depop) et ce qui l'appelle :
//   1. memeTaille sur toutes les paires, tailleDansGrille de chaque taille contre la grille des autres
//      (scripts/fixtures/moteur-tailles-etats-prod-0910.json : tailles des fiches et des tâches, 120 jours) ;
//   2. chaque taille réelle contre chaque grille Depop de la région IT (docs/plateformes/depop/tailles.json) ;
//   3. les combinaisons (taille × grille relevée) publiées du 18 au 23/09 (tailles-publiees-2026-09-18.json) ;
//   4. le parc eBay (ebay-tailles-parc-2026-11-07.json) : tailleDansGrille et le complément eBay ;
//   5. (--depop) les tâches Depop réelles : la taille posée par l'app (tailleDepop) et la résolution du connecteur
//      (depopResoudreTaille, vm, depop-tailles.js de chaque version) ;
//   6. (--copies) la garde « une taille de copie qui contredit la fiche ne part jamais » sur les publications réelles :
//      chaque copie contredite est LISTÉE (à relire une par une : ce sont les cas que la règle corrige).
// Les fichiers --depop / --copies sont lus en prod en lecture seule et restent HORS du dépôt (valeurs de tailles et
// de chemins seulement, aucun compte). Une différence n'est admise que si elle porte ce que le point vise : une lettre
// préfixée d'un site, un âge écrit en anglais, une stature en cm préfixée, une tranche d'âge écrite avec « / », une
// grille d'âges qui porte une option neutre (« Other », « Autre »). Toute autre différence est un échec.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const rev = arg("--ancien") ?? "HEAD";
const lireGit = (p) => execFileSync("git", ["show", `${rev}:${p}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const lireDisque = (p) => readFileSync(join(ROOT, p), "utf8");
const json = (p) => JSON.parse(lireDisque(p));

// Recopie un module et tout ce qu'il importe en relatif (extension « .js » facultative, comme Vite), dans une version.
function materialiser(lire, entree) {
  const dir = mkdtempSync(join(tmpdir(), "tailles-par-site-rejeu-"));
  const vus = new Set();
  const copier = (p) => {
    if (vus.has(p)) return;
    vus.add(p);
    let src;
    try { src = lire(p); } catch { return; }
    const cible = join(dir, p);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, src);
    for (const m of src.matchAll(/(?:import|export)\s[^"';]*?from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
      const base = posix.normalize(posix.join(posix.dirname(p), m[1]));
      for (const essai of [base, `${base}.js`, `${base}.mjs`, `${base}/index.js`]) {
        try { lire(essai); copier(essai); break; } catch { /* suivante */ }
      }
    }
  };
  copier(entree);
  return pathToFileURL(join(dir, entree)).href;
}
async function charger(lire) {
  return {
    tailles: await import(materialiser(lire, "supabase/functions/_shared/tailles.js")),
    ebay: await import(materialiser(lire, "supabase/functions/_shared/taille-ebay.js")),
    depop: await import(materialiser(lire, "src/utils/depopPublication.js")),
    connecteur: (() => {
      const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, URL, Math, Number, String, Array, Object, Set, Map, JSON, Date, Promise, RegExp, Error, globalThis: undefined });
      ctx.globalThis = ctx;
      vm.runInContext(lire("chrome-extension/content-scripts/depop-tailles.js"), ctx);
      vm.runInContext(`${lire("chrome-extension/content-scripts/depop.js")}\n;globalThis.__t = { depopResoudreTaille };`, ctx);
      return ctx.__t;
    })(),
  };
}
const avant = await charger(lireGit);
const apres = await charger(lireDisque);

// Ce que le point vise.
const SITE = "(?:eu|eur|fr|it|de|es|int|uk|us)";
const VISE = [
  ["lettre préfixée d'un site", new RegExp(`^\\s*${SITE}(?:\\s*[:.]\\s*|[\\s-]+)(?:[2-8]?x{0,5}[sl]|m|x+[sl])\\s*$`, "i")],
  ["âge écrit en anglais", /\d\s*(?:months?|mths?|mos?|yrs?|years?|y\.?\s*o\.?)\b|\bages?\s*:?\s*\d|new ?born/i],
  ["stature en cm préfixée", new RegExp(`^\\s*${SITE}\\s*[:.]?\\s*\\d{2,3}\\s*cm\\s*$`, "i")],
  ["tranche d'âge écrite avec « / »", /^\s*\d{1,2}\s*\/\s*\d{1,2}\s*(?:mois|m|ans?|a|y|yrs?|years?|months?|mths?)\b/i],
];
const motifVise = (...valeurs) => { for (const v of valeurs) for (const [nom, re] of VISE) if (re.test(String(v ?? ""))) return nom; return null; };
const NEUTRES = /^(?:other|others|autre|autres|altro|otro|andere|one size|taille unique)$/i;

let echecs = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) echecs++; };
const tableau = (lignes, max = 60) => { for (const l of lignes.slice(0, max)) console.log(`      ${l}`); if (lignes.length > max) console.log(`      … ${lignes.length - max} de plus`); };

// ── 1. LES TAILLES RÉELLES ENTRE ELLES ─────────────────────────────────────
const F = json("scripts/fixtures/moteur-tailles-etats-prod-0910.json");
const tailles = [...new Set([...(F.tailles ?? []), ...(F.tailles_jobs ?? [])].map((s) => String(s).trim()).filter(Boolean))];
console.log(`\n1. ${tailles.length} tailles réelles distinctes (fiches + tâches, fixture du 09/10)`);
const dPaires = [], dGrille = [];
for (const a of tailles) for (const b of tailles) if (avant.tailles.memeTaille(a, b) !== apres.tailles.memeTaille(a, b)) dPaires.push([a, b]);
for (const t of tailles) {
  const g = tailles.filter((x) => x !== t);
  const x = avant.tailles.tailleDansGrille(t, g)?.valeur ?? null, y = apres.tailles.tailleDansGrille(t, g)?.valeur ?? null;
  if (x !== y) dGrille.push([t, x, y]);
}
console.log(`   memeTaille : ${tailles.length ** 2} paires, ${dPaires.length} différentes ; tailleDansGrille : ${dGrille.length} différentes`);
tableau(dPaires.map(([a, b]) => `≡ « ${a} » / « ${b} » : ${avant.tailles.memeTaille(a, b)} → ${apres.tailles.memeTaille(a, b)}  [${motifVise(a, b) ?? "HORS VISÉE"}]`));
tableau(dGrille.map(([t, x, y]) => `« ${t} » : ${x ?? "∅"} → ${y ?? "∅"}  [${motifVise(t, x, y) ?? "HORS VISÉE"}]`));
ok(dPaires.every(([a, b]) => motifVise(a, b)), "1 : toute différence de paire porte ce que le point vise");
ok(dGrille.every(([t, x, y]) => motifVise(t, x, y)), "1 : toute différence de grille porte ce que le point vise");

// ── 2. CHAQUE TAILLE RÉELLE CONTRE CHAQUE GRILLE DEPOP (région IT) ─────────
const DEPOP = json("docs/plateformes/depop/tailles.json");
const grillesIT = DEPOP.grilles.filter((g) => g.region === "IT").map((g) => ({ id: g.id, nom: g.nom, options: g.tailles.map((t) => t.libelle) }));
const depopJobs = arg("--depop") ? JSON.parse(readFileSync(arg("--depop"), "utf8")) : [];
const valeurs2 = [...new Set([...tailles, ...depopJobs.flatMap((r) => [r.depop_taille, r.taille]).filter(Boolean).map(String)])];
const d2 = [];
for (const g of grillesIT) for (const t of valeurs2) {
  const x = avant.tailles.tailleDansGrille(t, g.options)?.valeur ?? null, y = apres.tailles.tailleDansGrille(t, g.options)?.valeur ?? null;
  if (x !== y) d2.push([g, t, x, y]);
}
console.log(`\n2. ${valeurs2.length} tailles × ${grillesIT.length} grilles Depop IT : ${d2.length} différentes`);
const vise2 = ([g, t, x, y]) => (x === null && g.options.some((o) => /^(?:other|autre)$/i.test(o)) && apres.tailles.tailleDansGrille(t, g.options.filter((o) => !/^(?:other|autre)$/i.test(o)))?.valeur === y
  ? "grille d'âges avec une option neutre (« Other »)" : null) ?? motifVise(t, x, y);
tableau(d2.map((d) => `grille ${d[0].id} ${d[0].nom} « ${d[1]} » : ${d[2] ?? "∅"} → ${d[3] ?? "∅"}  [${vise2(d) ?? "HORS VISÉE"}]`), 80);
ok(d2.every(vise2), "2 : toute différence porte ce que le point vise");
ok(d2.every(([, , x]) => x === null), "2 : aucune taille trouvée hier n'en change (seuls des refus deviennent des tailles)");

// ── 3. LES TAILLES PUBLIÉES DU 18 AU 23/09 ─────────────────────────────────
const P = json("scripts/fixtures/tailles-publiees-2026-09-18.json");
const combos = (P.combos ?? P.combinaisons ?? []);
let n3 = 0; const d3 = [];
for (const c of combos) {
  const t = c.taille ?? c.valeur; const g = c.grille ?? c.options;
  if (!t || !Array.isArray(g)) continue;
  n3++;
  const x = avant.tailles.tailleDansGrille(t, g)?.valeur ?? null, y = apres.tailles.tailleDansGrille(t, g)?.valeur ?? null;
  if (x !== y) d3.push([t, x, y]);
}
console.log(`\n3. ${n3} combinaisons publiées (taille × grille relevée) : ${d3.length} différentes`);
tableau(d3.map(([t, x, y]) => `« ${t} » : ${x ?? "∅"} → ${y ?? "∅"}  [${motifVise(t, x, y) ?? "HORS VISÉE"}]`));
ok(n3 > 0, "3 : la fixture est lue");
ok(d3.every(([t, x, y]) => motifVise(t, x, y)), "3 : toute différence porte ce que le point vise");

// ── 4. LE PARC eBay ────────────────────────────────────────────────────────
const E = json("scripts/fixtures/ebay-tailles-parc-2026-11-07.json");
const d4 = [];
for (const c of E.cas) {
  const l = E.listes[c.cat][c.aspect];
  const ferme = l.mode === "SELECTION_ONLY";
  const r = (m) => m.tailles.tailleDansGrille(c.taille, l.valeurs)?.valeur ?? m.ebay.tailleEbayComplement(c.aspect, c.taille, l.valeurs, { ferme })?.valeur ?? null;
  const x = r(avant), y = r(apres);
  if (x !== y) d4.push([c, x, y]);
}
console.log(`\n4. ${E.cas.length} combinaisons eBay (taille × rayon × aspect) : ${d4.length} différentes (règle commune puis complément)`);
tableau(d4.map(([c, x, y]) => `« ${c.taille} » [${c.cat} ${c.aspect} ${E.listes[c.cat][c.aspect].mode}] : ${x ?? "∅"} → ${y ?? "∅"}  [${motifVise(c.taille, x, y) ?? "HORS VISÉE"}]`));
ok(d4.every(([c, x, y]) => motifVise(c.taille, x, y)), "4 : toute différence porte ce que le point vise");

// ── 5. LES TÂCHES DEPOP RÉELLES ────────────────────────────────────────────
if (depopJobs.length) {
  const brut = json("docs/plateformes/depop/brut/attributes-categories-size-mapping.json");
  const grilles = { feuilles: new Map(), grilles: new Map(brut.size_sets.map((s) => [s.id, s])) };
  for (const e of brut.category_size_mapping) grilles.feuilles.set(`${e.department}/${e.group}/${e.product_type}`, e);
  const lib = (m, pf, chemin) => { const r = m.connecteur.depopResoudreTaille(pf, chemin, "IT", grilles); return r?.libelle ?? (r?.question ? "QUESTION" : r?.sansGrille ? "SANS GRILLE" : JSON.stringify(r)); };
  let n5 = 0, total = 0; const d5 = [], d5app = [];
  for (const r of depopJobs) {
    const chemin = Array.isArray(r.chemin) ? r.chemin : null;
    if (!chemin) continue;
    n5++; total += Number(r.n);
    const pf = { depopTaille: r.depop_taille ?? undefined, taille: r.taille ?? undefined, ...(r.repondue ? { needsUserResolved: { depopTaille: r.repondue } } : {}) };
    const x = lib(avant, pf, chemin), y = lib(apres, pf, chemin);
    if (x !== y) d5.push([r, x, y]);
    if (r.taille) {
      const a = avant.depop.tailleDepop(r.taille, chemin), b = apres.depop.tailleDepop(r.taille, chemin);
      if (a !== b) d5app.push([r, a, b]);
    }
  }
  console.log(`\n5. ${n5} combinaisons Depop réelles (${total} tâches, 60 jours) : connecteur ${d5.length} différentes, app (tailleDepop) ${d5app.length}`);
  tableau(d5.map(([r, x, y]) => `${r.chemin.join("/")} « ${r.depop_taille ?? r.taille} » (${r.n} tâche(s), ${r.publies} publiée(s)) : ${x} → ${y}  [${motifVise(r.depop_taille, r.taille) ?? "HORS VISÉE"}]`));
  tableau(d5app.map(([r, a, b]) => `app ${r.chemin.join("/")} « ${r.taille} » : ${a} → ${b}  [${motifVise(r.taille) ?? "HORS VISÉE"}]`));
  ok(d5.every(([r, x]) => motifVise(r.depop_taille, r.taille) && x === "QUESTION"), "5 : seules des QUESTIONS visées deviennent des tailles (connecteur)");
  ok(d5app.every(([r]) => motifVise(r.taille)), "5 : app, toute différence porte ce que le point vise");
}

// ── 6. LA GARDE « CONTREDIT LA FICHE » SUR LES PUBLICATIONS RÉELLES ────────
if (arg("--copies")) {
  const G = await import(pathToFileURL(join(ROOT, "src/utils/tailleInventee.js")).href);
  const lignes = JSON.parse(readFileSync(arg("--copies"), "utf8"));
  let total = 0, remplacees = 0, ecartees = 0, nRemp = 0, nEcart = 0;
  const liste = [];
  for (const r of lignes) {
    const n = Number(r.n); total += n;
    const v = G.tailleAGarder(r.copie, { tailleFiche: r.fiche, sourceFiche: r.source_fiche ?? "", tailleLue: r.lue });
    if (!v.contredit) continue;
    if (v.remplacement) { remplacees += n; nRemp++; } else { ecartees += n; nEcart++; }
    liste.push(`${r.platform} copie « ${r.copie} » ; fiche « ${r.fiche} »${r.source_fiche ? ` (${r.source_fiche})` : ""} ; étiquette « ${r.lue} » → ${v.remplacement ? `« ${v.remplacement} »` : "QUESTION"} (${n} tâche(s), ${r.comptes} compte(s))`);
  }
  console.log(`\n6. ${lignes.length} combinaisons (copie × fiche × étiquette) de ${total} publications réelles (30 jours) :`);
  console.log(`   copie contredite → remplacée par la fiche : ${remplacees} tâches (${nRemp} combinaisons) ; → question : ${ecartees} tâches (${nEcart} combinaisons)`);
  tableau(liste, 400);
}

console.log(echecs ? `\n❌ ${echecs} contrôle(s) en échec` : "\n✅ rejeu : seules les entrées visées changent");
process.exit(echecs ? 1 : 0);
