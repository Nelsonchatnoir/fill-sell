// ═══════════════════════════════════════════════════════════════════════════
// LA MARQUE DEPOP : UNE RÈGLE, JAMAIS DE QUESTION — `npm run selftest:depop-marque`
// ═══════════════════════════════════════════════════════════════════════════
// 17/10/2026, Nico. Cas réel : Thibault, 14 publications Depop arrêtées sur
// « Marque (Depop) » — « Autres », « Short », « T shirt », Jules, Bonobo… — et
// la réponse redemandée à l'identique (boucle sur le T-shirt « IKKS », dont la
// fiche porte la marque « Diverse »). Ce test prouve, sans réseau ni base :
//   A. le connecteur (content-scripts/depop.js, exécuté dans un bac à sable)
//      et la copie serveur (_shared/marque-depop.js) portent les MÊMES listes
//      fermées et la MÊME forme comparable ;
//   B. la règle, sur la liste Depop relevée le 08/10 (21 697 marques actives) :
//      absence ou nom commun → « Other » ; égalité exacte (casse, accents,
//      espaces) → cette marque ; sinon → « Other » ; jamais une autre marque,
//      jamais une question — vérifié aussi sur TOUTE la liste ;
//   C. le filet serveur des extensions ≤ 0.6.122 (publications seulement) : il
//      tranche « hors liste » et les listes fermées, jamais une question
//      ambiguë (« Plusieurs marques Depop s'écrivent… ») ;
//   D. le correctif d'extension `depop_marque_ambigue`, dormant tant que le
//      vrai BUILD_ID n'est pas posé ;
//   E. le câblage (connecteur, update-job-status, handler-watch).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
const charger = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
let ko = 0;
let n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ${detail}` : ""}`); } };

const M = await charger("supabase/functions/_shared/marque-depop.js");
const C = await charger("supabase/functions/_shared/correctifs-extension.js");

// Le connecteur, exécuté tel que Chrome le charge (après depop-tailles.js).
const ctx = vm.createContext({ console, URL, Math, Number, String, Array, Object, Set, Map, JSON, Date, Promise, RegExp, Error, globalThis: undefined });
ctx.globalThis = ctx;
vm.runInContext(lire("chrome-extension/content-scripts/depop-tailles.js"), ctx, { filename: "depop-tailles.js" });
vm.runInContext(`${lire("chrome-extension/content-scripts/depop.js")}
;globalThis.__t = { depopCleMarque, depopNonMarque, depopIndexMarques, depopResoudreMarque, DEPOP_SANS_MARQUE_MOTS, DEPOP_NOMS_COMMUNS };`, ctx, { filename: "depop.js" });
const T = ctx.__t;

const BRUT = JSON.parse(lire("docs/plateformes/depop/brut/attributes.json"));
const REF = T.depopIndexMarques(BRUT.brand);
const resoudre = (depopMarque, marque = "") => T.depopResoudreMarque({ depopMarque, marque }, REF);

console.log("\nA. CONNECTEUR = SERVEUR, À L'IDENTIQUE");
{
  const memes = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  ok(memes(new Set(T.DEPOP_SANS_MARQUE_MOTS), new Set(M.MOTS_SANS_MARQUE_DEPOP)), "la liste des absences de marque");
  ok(memes(new Set(T.DEPOP_NOMS_COMMUNS), new Set(M.NOMS_COMMUNS_DEPOP)), "la liste des noms communs de vêtement");
  const echantillon = ["H&M", "  Lacoste +  ", "Pantalón", "T-Shirt", "Sans marque/Générique", "Levi’s", "« Autres »", "Jack   &   Jones", "ÉCHARPE", "-- Short --"];
  ok(echantillon.every((s) => T.depopCleMarque(s) === M.cleMarqueDepop(s)), "la même forme comparable");
  ok(echantillon.every((s) => T.depopNonMarque(s) === M.nonMarqueDepop(s)), "le même verdict « pas une marque »");
  // Toute absence de la liste commune (estSansMarque) est une absence ici aussi.
  const A = await charger("supabase/functions/_shared/marque-absente.js");
  const communes = ["Sans marque", "Marque générique", "Générique", "Aucune", "Aucune marque", "Pas de marque", "Non marqué", "No brand", "Unbranded", "Generic", "Generic brand", "NoBrand", "- Sans marque/Générique -"];
  ok(communes.every((v) => A.estSansMarque(v) && M.nonMarqueDepop(v) === "absence"), "la liste commune des absences (marque-absente.js) est couverte");
  ok(!/\bgant\b|\bpolo\b|\bbob\b|\btop\b/.test(M.NOMS_COMMUNS_DEPOP.join(" ")), "jamais « gant », « polo », « bob », « top » parmi les noms communs");
}

console.log("\nB. LA RÈGLE, SUR LA LISTE DEPOP DU 08/10");
{
  const absences = ["Autres", "Autre", "autres", "Other", "Sans marque", "", "Divers", "Diverse", "Générique", "No brand", "Generic", "Sans", "Sans marque/Générique", "- Sans marque -", "Unbranded", "Inconnue"];
  for (const v of absences) {
    const r = resoudre(v);
    ok(r.id === "unbranded" && !r.remplacee && !r.question, `absence « ${v} » → Other, sans trace de remplacement`);
  }
  const communs = ["Short", "T shirt", "T-shirt", "Tshirt", "Jean", "Jeans", "Pantalon", "Pantalón", "Maillot", "Slip", "Chapeau", "Débardeur", "Écharpe", "Baskets"];
  for (const v of communs) {
    const r = resoudre(v);
    ok(r.id === "unbranded" && r.remplacee?.motif === "nom_commun", `nom commun « ${v} » → Other (tracé), jamais la marque Depop du même nom`);
  }
  const horsListe = ["Jules", "Bonobo", "Orchestra", "Kaporal", "Lafayette", "laure aimé", "Emma Keller", "Chic Me", "Zzz Inconnue"];
  for (const v of horsListe) {
    const r = resoudre(v);
    ok(r.id === "unbranded" && r.remplacee?.motif === "hors_liste_depop" && r.remplacee.de === v, `hors liste « ${v} » → Other (tracé)`);
  }
  const exactes = [["IKKS", "ikks"], ["ikks", "ikks"], ["H&M", "h-m"], ["h&m", "h-m"], ["H&M+", "h-m-plus"], ["Lacoste", "lacoste"], ["Lacoste +", "lacoste-plus"],
    ["Forever 21", "forever-21"], ["Jack & Jones", "jack-jones"], ["Jack   &   Jones", "jack-jones"], ["Pepe Jeans", "pepe-jeans"], ["ZARA", "zara"],
    ["Tommy Hilfiger", "tommy-hilfiger"], ["Decathlon", "decathlon"], ["Celio", "celio"], ["Wrangler", "wrangler"], ["Patagonia", "patagonia"],
    ["h-m", "h-m"], ["Gant", "gant"], ["Polo", "polo"]];
  for (const [v, id] of exactes) {
    const r = resoudre(v);
    ok(r.id === id && !r.remplacee, `« ${v} » → ${id}`, JSON.stringify(r));
  }
  ok(resoudre("Autres", "Jules").id === "unbranded" && resoudre("", "IKKS").id === "ikks", "la valeur choisie pour Depop passe avant la marque de la fiche");
  // Le T-shirt de Thibault : fiche « Diverse », réponse « T shirt » → Other, jamais IKKS (lu dans le titre).
  ok(T.depopResoudreMarque({ depopMarque: "T shirt", marque: "Diverse" }, REF).id === "unbranded", "le T-shirt « IKKS » (fiche « Diverse ») part en Other, jamais une marque prise au titre");
  // TOUTE la liste : chaque marque active se retrouve elle-même (sauf les mots des listes fermées).
  let fautes = 0;
  const actives = BRUT.brand.filter((b) => b?.id && b.status === "active");
  for (const b of actives) {
    const r = resoudre(b.name);
    if (T.depopNonMarque(b.name)) { if (r.id !== "unbranded") fautes++; continue; }
    if (r.id !== b.id) fautes++;
  }
  ok(fautes === 0, `les ${actives.length} marques actives : chacune se retrouve elle-même (ou Other si c'est un mot d'une liste fermée)`, `${fautes} faute(s)`);
  // Jamais une AUTRE marque : quelle que soit l'entrée, Other, ou une marque de même forme (ou de même identifiant).
  const parId = new Map(actives.map((b) => [b.id, b]));
  let autres = 0;
  const essais = actives.flatMap((b) => [b.name, `${b.name}s`, b.name.replace(/[^A-Za-z0-9]+/g, ""), ` ${b.name.toUpperCase()} `]).slice(0, 60000);
  for (const v of essais) {
    const r = resoudre(v);
    if (r.id === "unbranded") continue;
    const m = parId.get(r.id);
    if (!m || (T.depopCleMarque(m.name) !== T.depopCleMarque(v) && String(m.id).toLowerCase() !== v.trim().toLowerCase())) autres++;
  }
  ok(autres === 0, `${essais.length} entrées voisines : jamais une autre marque`, `${autres} faute(s)`);
  ok(essais.every((v) => !("question" in resoudre(v))), "jamais une question");
}

console.log("\nC. LE FILET SERVEUR (extensions ≤ 0.6.122, publications seulement)");
{
  const QHORS = (v) => `« ${v} » n'est pas dans la liste des marques de Depop. Écris la marque comme Depop l'écrit, ou « Autre » si l'article n'a pas de marque.`;
  const QAMB = (v) => `Plusieurs marques Depop s'écrivent « ${v} » : écris-la exactement comme sur Depop, ou « Autre » si l'article n'a pas de marque.`;
  const job = (depopMarque, marque, error, extra = {}) => ({ platform: "depop", action: "publish", status: "needs_user", error,
    platform_fields: { depopMarque, marque, needsUserField: { field_key: "depopMarque", field_label: "Marque (Depop)", input_type: "text", explication: error, target: { root: null, key: "depopMarque" } }, needsUserResolved: { depopMarque }, needs_user_source: "champ_a_choisir", ...extra } });
  const r1 = M.reponseMarqueDepop(job("T shirt", "Diverse", QHORS("T shirt")));
  ok(r1?.valeur === "Sans marque" && r1.motif === "nom_commun", "c56f06c4 (T-shirt, réponse « T shirt ») → « Sans marque »");
  ok(M.reponseMarqueDepop(job("Jules", "Jules", QHORS("Jules")))?.motif === "hors_liste_depop", "ce0fbb3a (Jules, hors liste) → « Sans marque »");
  ok(M.reponseMarqueDepop(job("Autres", "Jules", QHORS("Autres")))?.motif === "absence", "779eca50 (« Autres ») → « Sans marque »");
  ok(M.reponseMarqueDepop(job("H&M", "H&M", QAMB("H&M"))) === null, "question ambiguë (H&M) : jamais tranchée par le serveur");
  ok(M.reponseMarqueDepop({ ...job("Jules", "Jules", QHORS("Jules")), action: "republish" }) === null, "une republication : jamais (la marque de son annonce)");
  ok(M.reponseMarqueDepop({ ...job("Jules", "Jules", QHORS("Jules")), status: "pending" }) === null, "un job qui n'attend rien : rien");
  ok(M.reponseMarqueDepop(job("Jules", "Jules", QHORS("Jules"), { marque_depop_tranchee: { le: "x" } })) === null, "une fois par job");
  // La même question rendue EN BOUCLE par le background ≤ 0.6.122 (failed, question retirée) :
  // 779eca50 / 4891f5d1 (« Autres »), 8cd9469a (« Jean ») — seules les listes fermées s'y tranchent.
  const enBoucle = (valeur, marque) => ({ platform: "depop", action: "publish", status: "failed",
    error: "« Marque (Depop) » : ta réponse a bien été enregistrée, et ce champ est pourtant redemandé à l'identique.",
    platform_fields: { depopMarque: valeur, marque, needsUserResolved: { depopMarque: valeur },
      boucle_needs_user: { field_key: "depopMarque", field_label: "Marque (Depop)", cible: "depopMarque", valeur, motif: "valeur_inchangee", blocages: 3 } } });
  ok(M.reponseMarqueDepop(enBoucle("Autres", "Jules"))?.motif === "absence" && M.reponseMarqueDepop(enBoucle("Jean", "Kaporal"))?.motif === "nom_commun",
    "en boucle : « Autres », « Jean » → « Sans marque »");
  ok(M.reponseMarqueDepop(enBoucle("Bonobo", "Bonobo")) === null && M.reponseMarqueDepop(enBoucle("H&M", "H&M")) === null,
    "en boucle : une valeur hors des listes fermées n'est pas tranchée (hors liste et ambiguë s'y confondent)");
  const pfB = M.champsApresMarqueDepop(enBoucle("Autres", "Jules").platform_fields, M.reponseMarqueDepop(enBoucle("Autres", "Jules")), "2026-10-17T10:00:00.000Z", "test");
  ok(!pfB.boucle_needs_user && pfB.depopMarque === "Sans marque" && pfB.marque === "Jules", "… la boucle effacée, la marque de la fiche intacte");
  const autreQ = job("Jules", "Jules", "Depop exige une taille de SA grille pour ce rayon.");
  autreQ.platform_fields.needsUserField = { field_key: "depopTaille", field_label: "Taille (Depop)" };
  ok(M.reponseMarqueDepop(autreQ) === null, "une autre question : rien");
  const pf = M.champsApresMarqueDepop(job("T shirt", "Diverse", QHORS("T shirt")).platform_fields, r1, "2026-10-17T10:00:00.000Z", "test");
  ok(pf.depopMarque === "Sans marque" && pf.needsUserResolved.depopMarque === "Sans marque" && !pf.needsUserField && !pf.needs_user_source
    && pf.marque === "Diverse" && pf.marque_depop_tranchee?.de === "T shirt" && pf.needsUserAttempts === 0, "la réponse : cible, needsUserResolved, question effacée, fiche (marque) intacte, trace");
  ok(T.depopResoudreMarque({ depopMarque: "Sans marque" }, REF).id === "unbranded", "« Sans marque » → Other dans le connecteur (nouveau)");
  // L'ANCIEN connecteur (≤ 0.6.122), rejoué tel qu'il était : sa clé retirait
  // tout sauf a-z0-9, et sa liste d'absences comptait 11 mots.
  const ancienneCle = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const anciensMots = new Set(["", "sansmarque", "aucunemarque", "aucune", "nobrand", "unbranded", "other", "autre", "autresansmarque", "nonmarque", "generique"]);
  ok(anciensMots.has(ancienneCle(M.SANS_MARQUE_DEPOP)), "la réponse du filet (« Sans marque ») est lue comme une absence par l'ancien connecteur → Other");
  ok(!anciensMots.has(ancienneCle("Autres")) && ancienneCle("H&M") === ancienneCle("H&M+") && ancienneCle("Lacoste") === ancienneCle("Lacoste +"),
    "le défaut rejoué : « Autres » inconnu, « H&M » = « H&M+ », « Lacoste » = « Lacoste + »");
}

console.log("\nD. LE CORRECTIF D'EXTENSION (question ambiguë), DORMANT");
{
  const c = C.CORRECTIFS_EXTENSION.find((x) => x.cle === "depop_marque_ambigue");
  ok(!!c && c.platform === "depop" && c.buildMin === C.BUILD_DEPOP_MARQUE && C.BUILD_DEPOP_MARQUE === "2026-10-17T13:13:01Z", "entrée depop_marque_ambigue, build de la 0.6.123 (posé au paquet du 17/10)");
  const amb = { platform: "depop", action: "publish", status: "needs_user", handler_build: "2026-10-15T19:36:02Z+18cc681 · v0.6.114",
    error: "Plusieurs marques Depop s'écrivent « H&M » : écris-la exactement comme sur Depop, ou « Autre » si l'article n'a pas de marque.",
    platform_fields: { needsUserField: { field_key: "depopMarque" }, needs_user_source: "champ_a_choisir" } };
  ok(C.correctifPourJob(amb)?.cle === "depop_marque_ambigue", "une question ambiguë d'un poste 0.6.114 est reconnue");
  ok(!C.posteAJour("2026-10-17T12:00:00Z+abcdef0", c), "aucun poste réel ne porte encore le correctif (2099)");
  ok(C.posteAJour("2099-01-02T00:00:00Z+abcdef0", c), "le vrai BUILD_ID posé, un poste à jour le relancera une fois");
  const hors = { ...amb, error: "« Jules » n'est pas dans la liste des marques de Depop. Écris la marque comme Depop l'écrit, ou « Autre » si l'article n'a pas de marque." };
  ok(C.correctifPourJob(hors)?.cle !== "depop_marque_ambigue", "une question « hors liste » n'est pas ce correctif (le serveur la tranche)");
}

console.log("\nE. LE CÂBLAGE");
{
  const dp = lire("chrome-extension/content-scripts/depop.js");
  const debut = dp.indexOf("async function fillListingForm(job)");
  const fill = dp.slice(debut, dp.indexOf("\n}\n", debut));
  ok(fill.includes("depopResoudreMarque(pf, referentiel)") && !/marque\.question/.test(fill), "fillListingForm : la marque est résolue, jamais une question");
  ok(/code: "depop_marque_other"/.test(fill), "un remplacement par Other est dit (avertissement depop_marque_other)");
  const qt = lire("supabase/functions/_shared/questions-tranchees.ts");
  ok(/reponseMarqueDepop\(j\)/.test(qt) && /\.eq\("action", "publish"\)/.test(qt) && /\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)/.test(qt), "handler-watch (questions tranchées) : publications seulement, compare-and-swap");
  const ujs = lire("supabase/functions/update-job-status/index.ts");
  ok(/reponseMarqueDepop\(\{ platform: "depop"/.test(ujs) && /if \(pfMarqueDepop\) patch\.platform_fields = pfMarqueDepop;/.test(ujs), "update-job-status : la question tranchée dès le rapport de l'extension");
}

console.log(ko ? `\n✗ depop-marque : ${ko} rouge(s) sur ${n}` : `\n✓ depop-marque : ${n} contrôles verts`);
process.exit(ko ? 1 : 0);
