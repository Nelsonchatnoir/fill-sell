// ═══════════════════════════════════════════════════════════════════════════
// VERROU — UN SEUL JUGE D'ÉTAT : L'ÉCRAN, LE SERVEUR ET L'EXTENSION (12/11, lot « zéro problème », 1d-i — Nico)
// ═══════════════════════════════════════════════════════════════════════════
//     npm run selftest:etat-grille-ecran
//
// Cas réels (12/11, compte cfdfda6f) : « Scanner de code Munbyn » (fiche 1794481671759) et l'écran CarPlay
// (1794492636815) portent « Neuf avec étiquette » ; rangés en Leboncoin Électronique, dont la grille n'a pas
// d'étiquette (« État neuf · Très bon état · Bon état · État satisfaisant - fonctionnel · Pour pièces »). Le serveur et
// l'extension savaient traduire (« État neuf ») ; l'ÉCRAN, lui, jugeait la valeur hors liste et BLOQUAIT : 12 min 22 s
// sur l'écran, rien de publié. Trois copies de la même règle (get-pending-jobs, leboncoin.js, _shared), aucune à l'écran.
// Compte 010ff35b (07/11) : l'état eBay « Ouvert (jamais utilisé) » → question partout ; décision de Nico : « Très bon
// état », jamais embelli. Décision de Nico (1e) : un parfum « Neuf » ne redemande plus rien — dans un rayon où
// l'étiquette n'a pas de sens (repéré par l'IDENTIFIANT du rayon, ou la branche du catalogue), « Neuf » = le neuf de la
// grille, « sans étiquette » d'abord.
// Ce que le verrou prouve, sans réseau ni base :
//   A. l'écran (moteur/listes.jugerValeurContreListe) traduit l'état dans LA grille, par le niveau commun ;
//   B. jamais deviné : « Neuf » nu face à une grille qui sépare avec / sans étiquette → question (aucune suggestion) ;
//   C. « Ouvert (jamais utilisé) » → « Très bon état », jamais un neuf ;
//   D. rayon sans étiquette (Vinted 152 « Parfums », Beebs « Hygiène et beauté > Parfums ») : « Neuf » sans question ;
//   E. PARITÉ, matrice états × grilles : écran = _shared = get-pending-jobs = extension (copie générée, à l'octet) ;
//   F. par identifiants et par site : les libellés d'état de chaque site Vinted (status_id) se lisent par leur niveau.
import fs from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { console.log(`  (import de ${p} impossible : ${e.message})`); return {}; } };
let ko = 0, okN = 0;
const ok = (c, m) => { if (c) { okN++; console.log(`  ✓ ${m}`); } else { ko++; console.log(`  ✗ ${m}`); } };

const L = await charger("src/publication/moteur/listes.js");
const E = await charger("supabase/functions/_shared/etat-correspondance.js");

// Les grilles RELEVÉES (platform_category_aspects, lues en lecture seule le 12/11).
const ELEC = ["État neuf", "Très bon état", "Bon état", "État satisfaisant - fonctionnel", "Pour pièces"]; // LBC Électronique (7 feuilles)
const MODE = ["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "État satisfaisant"]; // LBC Mode > Vêtements
const LOISIRS = ["État neuf", "Très bon état", "Bon état", "État satisfaisant"]; // LBC Loisirs > Jeux & Jouets
const VINTED_PARFUMS = ["Neuf avec étiquette"]; // Vinted Femmes > Beauté > Parfums (152), « list »
const VINTED_MODE = ["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"];
const BEEBS_PARFUMS = ["Neuf, avec étiquette", "Neuf, sans étiquette"]; // Beebs Hygiène et beauté > Parfums, « dropdown »

const juger = (platform, key, value, allowedValues, extra = {}) => (typeof L.jugerValeurContreListe === "function"
  ? L.jugerValeurContreListe({ platform, key, value, allowedValues, ...extra }) : { dans: false, valeurListe: null, suggested: null });
const bloque = (platform, key, inputType, allowedValues, v) => (typeof L.horsListeBloque === "function"
  ? (!v.dans && L.horsListeBloque({ regle: "nouvelle", platform, key, inputType, allowedValues, suggested: v.suggested })) : true);

// ── A. L'écran traduit l'état dans la grille du rayon ───────────────────────
console.log("A. Leboncoin Électronique (compte cfdfda6f, 12/11) : l'écran ne bloque plus un état connu");
{
  const munbyn = juger("leboncoin", "condition", "Neuf avec étiquette", ELEC);
  ok(munbyn.dans === true && munbyn.valeurListe === "État neuf", `« Neuf avec étiquette » (fiche 1794481671759) → « État neuf » (obtenu ${JSON.stringify(munbyn)})`);
  ok(!bloque("leboncoin", "condition", "combobox", ELEC, munbyn), "… et rien ne bloque (horsListeBloque)");
  const support = juger("leboncoin", "condition", "Neuf sans étiquette", ELEC);
  ok(support.dans === true && support.valeurListe === "État neuf", "« Neuf sans étiquette » (« Support imprimante ») → « État neuf »");
  const elecCond = juger("leboncoin", "electronics_condition", "Neuf avec étiquette", ELEC);
  ok(elecCond.dans === true && elecCond.valeurListe === "État neuf", "une clé « *_condition » est un champ d'état comme « condition »");
  ok(juger("leboncoin", "condition", "Satisfaisant", ELEC).valeurListe === "État satisfaisant - fonctionnel", "« Satisfaisant » → « État satisfaisant - fonctionnel » (même niveau, nom du rayon)");
  ok(juger("leboncoin", "condition", "Très bon état", ELEC).valeurListe === "Très bon état", "l'exact reste l'exact");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  const lignesElec = [{ key: "condition", allowedValues: ELEC }];
  ok(typeof L.etatDuJob === "function" && L.etatDuJob({ platform: "leboncoin", etat: "Neuf avec étiquette", lignes: lignesElec }) === "État neuf"
    && L.etatDuJob({ platform: "leboncoin", etat: "État neuf", lignes: lignesElec }) === null
    && L.etatDuJob({ platform: "leboncoin", etat: "Neuf", lignes: [{ key: "condition", allowedValues: MODE }] }) === null,
    "le JOB porte le libellé de la grille (« État neuf ») ; déjà exact ou hors grille : rien ne change");
  ok(/etatDuJob\(\{ platform: r\.platform, etat: r\.platform_fields\?\.etat/.test(lps) && /etat_saisi: r\.platform_fields\.etat/.test(lps),
    "au clic, l'écran pose le libellé traduit sur le JOB de CETTE plateforme (la valeur d'avant gardée, jamais la fiche)");
}

// ── B. Jamais deviné ─────────────────────────────────────────────────────────
console.log("B. « Neuf » nu face à une grille qui sépare avec / sans étiquette : la question, jamais une devinette");
{
  const neufMode = juger("leboncoin", "condition", "Neuf", MODE);
  ok(neufMode.dans === false && neufMode.suggested === null, `LBC Mode « Neuf » → aucune valeur, aucune suggestion (obtenu ${JSON.stringify(neufMode)})`);
  const neufVinted = juger("vinted", "condition", "Neuf", VINTED_MODE, { rayonId: "1813" });
  ok(neufVinted.dans === false && neufVinted.suggested === null, `Vinted rayon 1813 (Hommes > … > Pulls ras de cou) « Neuf » → la question (obtenu ${JSON.stringify(neufVinted)})`);
  ok(juger("leboncoin", "condition", "État neuf", MODE).dans === false, "« État neuf » face à la grille Mode : jamais « avec / sans étiquette »");
}

// ── C. « Ouvert (jamais utilisé) » ──────────────────────────────────────────
console.log("C. État eBay « Ouvert (jamais utilisé) » (compte 010ff35b, 07/11) → « Très bon état », jamais embelli");
{
  const o = juger("leboncoin", "condition", "Ouvert (jamais utilisé)", ELEC);
  ok(o.dans === true && o.valeurListe === "Très bon état", `LBC Électronique → « Très bon état » (obtenu ${JSON.stringify(o)})`);
  ok(juger("leboncoin", "condition", "Ouvert (jamais utilisé)", MODE).valeurListe === "Très bon état", "LBC Mode → « Très bon état » (jamais « Neuf … étiquette »)");
  ok(juger("vinted", "condition", "Ouvert (jamais utilisé)", VINTED_MODE, { rayonId: "1813" }).valeurListe === "Très bon état", "Vinted → « Très bon état »");
  ok(typeof E.niveauEtat === "function" && E.niveauEtat("Ouvert (jamais utilisé)") === "tres_bon", "le niveau commun est « tres_bon »");
}

// ── D. Rayon où l'étiquette n'a pas de sens ─────────────────────────────────
console.log("D. Parfum « Neuf » : repéré par l'identifiant du rayon (Vinted) ou la branche du catalogue (Beebs)");
{
  const v = juger("vinted", "condition", "Neuf", VINTED_PARFUMS, { rayonId: "152", cheminCategorie: ["Femmes", "Beauté", "Parfums"] });
  ok(v.dans === true && v.valeurListe === "Neuf avec étiquette", `Vinted 152 (grille au seul neuf) « Neuf » → « Neuf avec étiquette » (obtenu ${JSON.stringify(v)})`);
  const b = juger("beebs", "État", "Neuf", BEEBS_PARFUMS, { cheminCategorie: ["Hygiène et beauté", "Parfums"] });
  ok(b.dans === true && b.valeurListe === "Neuf, sans étiquette", `Beebs Parfums « Neuf » → « Neuf, sans étiquette » (obtenu ${JSON.stringify(b)})`);
  ok(juger("beebs", "État", "Neuf avec étiquette", BEEBS_PARFUMS, { cheminCategorie: ["Hygiène et beauté", "Parfums"] }).valeurListe === "Neuf, avec étiquette", "l'exact passe avant (« Neuf avec étiquette » reste avec)");
  // Par l'IDENTIFIANT, jamais par un mot : le même chemin sans identifiant Vinted ne déclenche rien.
  ok(juger("vinted", "condition", "Neuf", VINTED_PARFUMS, { cheminCategorie: ["Femmes", "Beauté", "Parfums"] }).dans === false, "Vinted sans identifiant de rayon : rien n'est supposé (la question)");
  ok(juger("beebs", "État", "Neuf", ["Neuf, avec étiquette", "Neuf, sans étiquette", "Très bon état"], { cheminCategorie: ["Mode", "Femme", "Robes"] }).dans === false, "Beebs Mode « Neuf » → la question");
  // Un article d'occasion en rayon beauté : c'est le RAYON en cause (rayonNeufSeulement, inchangé).
  ok(typeof L.rayonNeufSeulement === "function" && L.rayonNeufSeulement({ platform: "vinted", key: "condition", value: "Très bon état", allowedValues: VINTED_PARFUMS }) === true, "« Très bon état » en Parfums : la carte dit de changer de rayon (inchangé)");
  ok(juger("vinted", "condition", "Très bon état", VINTED_PARFUMS, { rayonId: "152" }).dans === false, "… et jamais « Neuf » posé à sa place");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/jugerValeurContreListe\(\{[^}]*rayonId/.test(lps), "l'écran donne l'identifiant du rayon au juge");
}

// ── E. Parité : écran = _shared = get-pending-jobs = extension ──────────────
console.log("E. Parité, matrice états × grilles (Mode, Électronique, Loisirs)");
const VALEURS = ["Neuf avec étiquette", "Neuf sans étiquette", "Neuf", "État neuf", "Très bon état", "Comme neuf", "Bon état", "Satisfaisant", "Ouvert (jamais utilisé)", "Pour pièces", "Neuf, sans étiquette", "Used - Good"];
const GRILLES = { MODE, ELEC, LOISIRS };
// L'extension : la copie générée + la fonction de leboncoin.js, exécutées telles que Chrome les charge.
const lbc = lire("chrome-extension/content-scripts/leboncoin.js");
const debutCopie = lbc.indexOf("// ═══ DÉBUT — COPIE GÉNÉRÉE de supabase/functions/_shared/etat-correspondance.js");
const debutFn = lbc.indexOf("const normEtatLbc");
const finFn = lbc.indexOf("function trouverOptionEtatExacte");
let ext = null;
try {
  const morceau = lbc.slice(debutCopie >= 0 ? debutCopie : debutFn, finFn);
  const ctx = vm.createContext({});
  vm.runInContext(`${morceau}\n;globalThis.__f = etatLeboncoinExactParmi;`, ctx);
  ext = ctx.__f;
} catch (e) { console.log(`  (extension illisible : ${e.message})`); }
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/from "\.\.\/_shared\/etat-correspondance\.js"/.test(gpj), "get-pending-jobs importe le juge partagé");
const corpsGpj = gpj.slice(gpj.indexOf("const etatLeboncoinExact"), gpj.indexOf("const grillesEtatCache"));
ok(/etatDansLaGrille\(/.test(corpsGpj) && !/parNorm\.get\("etat neuf"\)/.test(corpsGpj), "get-pending-jobs : plus de table à lui (une ligne qui appelle le juge)");
ok(debutCopie >= 0, "leboncoin.js porte la copie GÉNÉRÉE du juge");
let ecarts = 0;
for (const [nom, g] of Object.entries(GRILLES)) {
  for (const v of VALEURS) {
    const partage = typeof E.etatDansLaGrille === "function" ? E.etatDansLaGrille(v, g, { plateforme: "leboncoin" }) : undefined;
    const j = juger("leboncoin", "condition", v, g);
    const ecran = j.dans ? j.valeurListe : null;
    const extension = ext ? ext([v], g) : undefined;
    if (!(partage === ecran && ecran === extension)) { ecarts++; console.log(`    ≠ ${nom} « ${v} » : écran=${ecran} _shared=${partage} extension=${extension}`); }
  }
}
ok(ecarts === 0, `${Object.keys(GRILLES).length * VALEURS.length} cas : l'écran, le serveur et l'extension rendent la même valeur (${ecarts} écart(s))`);
ok(ext && ext(["Neuf avec étiquette"], ELEC) === "État neuf" && ext(["Neuf"], MODE) === null && ext(["", "Très bon état"], MODE) === "Très bon état",
  "extension : le premier candidat qui se traduit, rien de deviné");
try {
  const { genererCopieLeboncoin } = await import(pathToFileURL(join(ROOT, "scripts/gen-etat-correspondance-extension.mjs")).href);
  ok(typeof genererCopieLeboncoin === "function" && genererCopieLeboncoin(lbc) === lbc, "la copie de l'extension est à jour (sinon : node scripts/gen-etat-correspondance-extension.mjs)");
} catch (e) { ok(false, `générateur de la copie de l'extension absent (${e.message})`); }

// ── F. Par identifiants et par site ──────────────────────────────────────────
console.log("F. Les libellés de chaque site Vinted se lisent par leur identifiant (status_id), jamais par un texte français");
{
  const V = await charger("src/utils/etatsVinted.js");
  let diff = 0;
  for (const [langue, libelles] of Object.entries(V.LIBELLES_ETATS_VINTED ?? {})) {
    for (const [id, texte] of Object.entries(libelles)) {
      const n = typeof E.niveauEtat === "function" ? E.niveauEtat(texte, { plateforme: "vinted" }) : null;
      if (n !== (E.VINTED_NIVEAU_PAR_ID ?? {})[id]) { diff++; if (diff < 6) console.log(`    ≠ ${langue} ${id} « ${texte} » → ${n}`); }
    }
  }
  ok(diff === 0 && Object.keys(V.LIBELLES_ETATS_VINTED ?? {}).length >= 15, "15 langues × 5 états Vinted : le niveau de chaque libellé est celui de son identifiant");
  ok(typeof E.niveauEtat === "function" && E.niveauEtat("Ottime", { plateforme: "vinted" }) === "tres_bon" && E.niveauEtat("Neu", { plateforme: "vinted" }) === "neuf_sans_etiquette",
    "Vinted IT « Ottime » = très bon ; Vinted DE « Neu » (status 1) = neuf sans étiquette");
  ok(typeof E.niveauEtat === "function" && E.niveauEtat("Neu", { plateforme: "leboncoin" }) === null, "« Neu » n'est un état que sur le site qui l'emploie (jamais ailleurs par défaut)");
  ok(typeof E.etatDansLaGrille === "function" && E.etatDansLaGrille("Ottime", VINTED_MODE, { plateforme: "vinted" }) === "Très bon état", "une fiche Vinted IT se traduit dans la grille française par son niveau");
  ok(typeof E.niveauEtat === "function" && E.niveauEtat("Neuf, avec étiquette", { plateforme: "beebs" }) === "neuf_etiquette", "Beebs « Neuf, avec étiquette » (virgule) : même niveau");
}

console.log(`\n${ko ? `✗ ${ko} rouge(s)` : "✓ tout vert"} — ${okN} vert(s)`);
process.exit(ko ? 1 : 0);
