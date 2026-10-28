// ═══════════════════════════════════════════════════════════════════════════
// LA MARQUE DE L'ANNONCE VINTED, REPRISE PAR SON IDENTIFIANT (17/10/2026)
//   node scripts/vinted-marque-par-identifiant-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// patrick giry « Paris 2024 » (brand_id 305315, job 3730ef49) et Romain
// « pago » (352029, job 770bed7f) : republications arrêtées au pré-vol sur
// « Vinted ne connaît pas la marque », alors que l'annonce en ligne la porte.
// Anciennes marques libres : la capture garde leur identifiant (payload
// d'édition : brand_id + brand_dto), ni le menu Marque (30 s) ni
// /api/v2/brands ne les proposent plus, et le remplissage ne savait poser une
// marque qu'en cliquant une ligne de ce menu.
//
// Ce que ce test garantit, sur le code LIVRÉ (relu dans les fichiers) :
//   1. la sonde pose brand_id quand la page l'a laissé nul/absent — jamais
//      d'écrasement, création seulement, corps d'article seulement, armement
//      borné ; elle relève les clés brand* réellement envoyées ;
//   2. la preuve (réponse de Vinted) part avec le job ;
//   3. la copie de recréation porte TOUJOURS la marque capturée et son
//      identifiant (ni réponse, ni fiche à la place) et la preuve servie ;
//   4. le formulaire : marque de l'annonce non proposée → posée par son
//      identifiant, sans question ; jamais pour une autre marque ; jamais si
//      #brand porte autre chose ; publication neuve inchangée (question) ;
//   5. une-passe : rien n'est retiré sans preuve (pause, jamais needs_user,
//      aucune durée promise) ;
//   6. serveur : preuve du parc, réarmement des jobs arrêtés, marque retenue
//      et réponse sans effet sur une marque à identifiant, état « En pause ».
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const bg = lire("chrome-extension/background.js");
const vt = lire("chrome-extension/content-scripts/vinted.js");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const { porteUneEstimation, etatJob } = await imp("supabase/functions/_shared/etat-job.js");
const M = await imp("supabase/functions/_shared/vinted-marque-par-id.js");
const C = await imp("supabase/functions/_shared/correctifs-extension.js");
const { appliquerMarqueRetenue, marqueComparable } = await imp("supabase/functions/_shared/marque-absente.js");

// ── 1. LA SONDE DU POST (background.js, monde MAIN) ─────────────────────────
console.log("\n1. LA SONDE POSE L'IDENTIFIANT CAPTURÉ, JAMAIS PAR-DESSUS LA PAGE");
const d = bg.indexOf("        window.__fsMarqueAPoser = null;");
const f = bg.indexOf("        // Les poses s'enchaînent sur le MÊME corps", d);
if (d < 0 || f < 0) { console.error("✗ bloc de pose de la marque introuvable dans background.js"); process.exit(1); }
const bloc = bg.slice(d, f);
const fabrique = new Function("window", "ISBN_ARME_TTL_MS",
  `${bloc}; return { corpsAvecMarque, marqueEnvoyeeOf, marqueRelueOf, derniere: () => dernierePoseMarque };`);
function sonde(id, titre = null, ageMs = 0) {
  const ecouteurs = [];
  const win = { addEventListener: (t, fn) => ecouteurs.push(fn), __fsMarqueAPoser: null };
  const api = fabrique(win, 15 * 60 * 1000);
  const armer = (data, source = win) => { for (const fn of ecouteurs) fn({ source, data: { __fillsellArmeMarque: true, ...data } }); };
  if (id !== undefined) {
    armer({ id, titre });
    if (win.__fsMarqueAPoser && ageMs) win.__fsMarqueAPoser.armeeA -= ageMs;
  }
  return { ...api, armer, win };
}
const URL = "https://www.vinted.fr/api/v2/item_upload/items";
const corps = (item, enveloppe = true) => JSON.stringify(enveloppe ? { item, feedback_id: null, push_up: false } : item);
const article = (extra = {}) => ({ id: null, title: "T-shirt imprimé", catalog_id: 1807, isbn: null, is_unisex: false, price: 5, ...extra });
const lu = (s) => (s == null ? null : JSON.parse(s));

{
  const s = sonde(305315, "Paris 2024");
  const r = lu(s.corpsAvecMarque(URL, corps(article({ brand_id: null }))));
  ok(r?.item?.brand_id === 305315 && s.derniere() === 305315, "brand_id nul → l'identifiant capturé (305315) est posé, et la pose est dite");
  ok(r?.item?.title === "T-shirt imprimé" && r?.item?.catalog_id === 1807 && r?.feedback_id === null, "aucune autre clé touchée");
}
ok(lu(sonde(352029, "pago").corpsAvecMarque(URL, corps(article())))?.item?.brand_id === 352029, "brand_id absent → posé (clé du payload d'édition de la même ressource)");
ok(lu(sonde(305315).corpsAvecMarque(URL, corps(article({ brand_id: null }), false)))?.brand_id === 305315, "corps nu (sans enveloppe item) → posé");
ok(sonde(305315).corpsAvecMarque(URL, corps(article({ brand_id: 53 }))) === null, "la page a posé une marque (53) → jamais d'écrasement");
ok(sonde(305315).corpsAvecMarque(URL, corps(article({ brand_id: 1 }))) === null, "la page a posé « Sans marque » (1) → on n'y touche pas");
ok(lu(sonde(305315, "Paris 2024").corpsAvecMarque(URL, corps(article({ brand_id: null, brand: "" }))))?.item?.brand === "Paris 2024", "clé `brand` présente et vide → libellé capturé");
ok(!("brand" in (lu(sonde(305315, "Paris 2024").corpsAvecMarque(URL, corps(article({ brand_id: null }))))?.item ?? {})), "clé `brand` absente → jamais inventée");
ok(lu(sonde(305315, "Paris 2024").corpsAvecMarque(URL, corps(article({ brand_id: null, brand: "Autre" }))))?.item?.brand === "Autre", "un libellé `brand` déjà écrit par la page n'est jamais réécrit");
ok(sonde(305315).corpsAvecMarque(`${URL}/10044656108`, corps(article({ brand_id: null }))) === null, "édition (items/{id}) → rien : création seulement");
ok(sonde(305315).corpsAvecMarque("https://www.vinted.fr/api/v2/photos", corps(article({ brand_id: null }))) === null, "autre endpoint → rien");
ok(sonde(305315).corpsAvecMarque(URL, JSON.stringify({ item: { title: "x" } })) === null, "corps sans catalog_id → rien (pas un article)");
ok(sonde(305315).corpsAvecMarque(URL, "pas du json") === null, "corps illisible → rien, jamais d'exception");
ok(sonde(undefined).corpsAvecMarque(URL, corps(article({ brand_id: null }))) === null, "jamais sans armement");
ok(sonde(1).corpsAvecMarque(URL, corps(article({ brand_id: null }))) === null, "id 1 (« Sans marque ») jamais armé : il a sa ligne native");
ok(sonde(-4).corpsAvecMarque(URL, corps(article({ brand_id: null }))) === null, "id invalide → jamais armé");
ok(sonde(305315, null, 16 * 60 * 1000).corpsAvecMarque(URL, corps(article({ brand_id: null }))) === null, "armement périmé (> 15 min) → rien");
{
  const s = sonde(305315);
  s.armer({ id: null });
  ok(s.corpsAvecMarque(URL, corps(article({ brand_id: null }))) === null, "désarmé (id null) → rien");
  const s2 = sonde(undefined);
  s2.armer({ id: 305315 }, { autre: true });
  ok(s2.corpsAvecMarque(URL, corps(article({ brand_id: null }))) === null, "un message d'une autre source n'arme rien");
}
{
  const s = sonde(undefined);
  const rel = s.marqueEnvoyeeOf(URL, corps(article({ brand_id: 305315, brand: "Paris 2024", brand_dto: { id: 305315 } })));
  ok(rel?.brand_id === "305315" && rel?.brand === "Paris 2024" && rel?.brand_dto === "(objet)", "relevé passif : les clés brand* réellement envoyées");
  ok(s.marqueEnvoyeeOf("https://www.vinted.fr/api/v2/photos", corps(article())) === null && s.marqueEnvoyeeOf(URL, "x") === null, "relevé : création seulement, jamais d'exception");
  ok(s.marqueRelueOf(JSON.stringify({ code: 0, item: { id: 10400000001, brand_id: 305315 } })) === 305315
    && s.marqueRelueOf(JSON.stringify({ code: 0, item: { id: 10400000001, brand_dto: { id: 352029, title: "pago" } } })) === 352029,
    "réponse de création : la marque relue (item.brand_id, sinon item.brand_dto.id)");
  ok(s.marqueRelueOf(JSON.stringify({ code: 0, item: { id: 1 } })) === null && s.marqueRelueOf("<html>") === null, "réponse sans marque lisible → null, jamais d'exception");
}
ok((bg.match(/marqueRelue: marquePosee \? marqueRelueOf\(/g) ?? []).length === 2, "fetch ET XMLHttpRequest relaient la marque relue dans la réponse");
ok(/const avantMarque = avecColis \?\? avant;\s*const avecMarque = corpsAvecMarque\(url, avantMarque \?\? body\);\s*return avecMarque \?\? avantMarque;/.test(bg),
  "corpsPourDepot : la marque ferme la chaîne ISBN → langue → colis → marque");
ok((bg.match(/marquePosee = dernierePoseMarque/g) ?? []).length === 2, "fetch ET XMLHttpRequest relaient la pose (marquePosee)");
ok((bg.match(/marqueEnvoyee: marqueEnvoyeeOf\(/g) ?? []).length === 2, "fetch ET XMLHttpRequest relaient les clés envoyées (marqueEnvoyee)");

// ── 2. LA PREUVE PART AVEC LE JOB ───────────────────────────────────────────
console.log("\n2. LA RÉPONSE DE VINTED EST LA PREUVE, ÉCRITE SUR LE JOB");
{
  const fab = (captures) => new Function("readProbeCaptures", "FILLSELL_BUILD_ID",
    `${extraireFonctionJs(bg, "preuveMarqueEnvoi")}; return preuveMarqueEnvoi;`)(async () => ({ captures }), "2026-10-17T00:00:00Z+abc");
  const p = await fab([{ url: URL, status: 200, marquePosee: 305315, marqueEnvoyee: { brand_id: "305315" }, marqueRelue: 305315 }])(7);
  ok(p?.id === 305315 && p.http === 200 && p.envoyee?.brand_id === "305315" && p.relue === 305315 && p.confirmee === true && /^2026-10-17T00:00:00Z/.test(p.build),
    "preuve : identifiant, HTTP, clés envoyées, marque relue et confirmée, build");
  const pNon = await fab([{ url: URL, status: 200, marquePosee: 305315, marqueRelue: null }])(7);
  ok(pNon?.http === 200 && pNon.relue === null && pNon.confirmee === false, "200 sans marque relue : écrite, mais jamais « confirmée »");
  ok((await fab([{ url: URL, status: 400, marquePosee: 352029 }])(7))?.http === 400, "un refus est aussi une preuve (dans l'autre sens)");
  ok((await fab([{ url: URL, status: 200 }])(7)) === null && (await fab([])(null)) === null, "sans pose de la sonde : aucune preuve");
}
ok(/marque_pose_envoi: marqueEnvoi/.test(bg) && /pf\.marque_pose_envoi = marqueEnvoi;/.test(bg), "écrite à la publication ET à la conclusion d'une recréation");
ok(/marquePosee: c\?\.marquePosee \?\? null/.test(vt) && /brand_id POSÉ dans le corps par la sonde/.test(vt), "un refus de Vinted dit si la sonde a posé la marque");

// ── 3. LA COPIE DE RECRÉATION ───────────────────────────────────────────────
console.log("\n3. LA RECRÉATION PART DE LA MARQUE DE L'ANNONCE EN LIGNE");
{
  const construire = new Function("sanitizeJob", `${extraireFonctionJs(bg, "construireJobRecreation")}; return construireJobRecreation;`)((j) => j);
  const cap = (id, titre) => ({
    payload: { titre: "T-shirt", description: "d", natif: { brand_id: id, brand_dto: id ? { id, title: titre } : null, catalog_id: 1807 } },
    libelles: { marque: titre, categoryPath: ["Hommes"] }, photos_urls: [],
  });
  const job = { id: "3730ef49", title: "T-shirt", inventaire_id: 1 };
  let pf = construire(job, { vinted_item_id: "10044656108" }, cap(305315, "Paris 2024"), 5).platform_fields;
  ok(pf.marque === "Paris 2024" && pf.marque_id === 305315 && pf.marque_capturee === "Paris 2024", "« Paris 2024 » : libellé, identifiant et marque capturée partent");
  pf = construire(job, { marque_choisie: "Sans marque" }, cap(305315, "Paris 2024"), 5).platform_fields;
  ok(pf.marque === "Paris 2024" && pf.marque_id === 305315, "une réponse (marque_choisie « Sans marque ») ne remplace plus une marque à identifiant");
  pf = construire(job, { marque: "Nike" }, cap(352029, "pago"), 5).platform_fields;
  ok(pf.marque === "pago" && pf.marque_id === 352029, "une marque posée sur le job (fiche) ne remplace pas « pago »");
  pf = construire(job, {}, cap(1, "Sans marque"), 5).platform_fields;
  ok(pf.marque === "Sans marque" && !("marque_id" in pf) && !("marque_capturee" in pf), "« Sans marque » (brand_id 1) : ligne native, aucun identifiant");
  pf = construire(job, { marque_choisie: "Nike" }, cap(null, "Bidule"), 5).platform_fields;
  ok(pf.marque === "Nike" && !("marque_id" in pf), "marque SANS identifiant (jamais vu) : la réponse de la personne vaut encore");
  ok(construire(job, { marque_injection_prouvee: true }, cap(305315, "Paris 2024"), 5).platform_fields.marque_injection_prouvee === true, "la preuve servie voyage jusqu'au formulaire");
  ok(!("marque_injection_prouvee" in construire(job, {}, cap(305315, "Paris 2024"), 5).platform_fields), "sans preuve servie : rien");
}

// ── 4. LE FORMULAIRE (vinted.js) ────────────────────────────────────────────
console.log("\n4. LE FORMULAIRE : PAR SON IDENTIFIANT, SANS QUESTION — JAMAIS UNE AUTRE MARQUE");
const texteComparable = new Function(`${extraireFonctionJs(vt, "texteComparable")}; return texteComparable;`)();
{
  const SEL = extraireFonctionJs(vt, "selectVintedBrand");
  // (26/10) + les aides de l'étape Marque : relance de la recherche, identifiant du catalogue, budget,
  // relecture de #brand, signal à selector_health, prefill_brand du diagnostic.
  const noms = ["document", "SANS_MARQUE_RE", "marqueAbsenceComparable", "selectVintedNoBrand", "closeAnyOpenDropdown", "openDropdown",
    "waitForElement", "typeHuman", "attendreChoixMarque", "humanPause", "confirmDropdownIfNeeded", "marquesDuCatalogueVinted",
    "suggestionsMarqueProches", "texteComparable", "armerMarquePourPost",
    "retaperDernierCaractere", "marqueExacteDuCatalogueVinted", "budgetMarqueMs", "attendreValeurMarque",
    "signalerLigneDeCreationAbsente", "decrirePrefillMarque",
    // (28/10) La relecture d'un menu Vinted, ancien <input> comme bouton « bloom » (selftest vinted-menus-bloom).
    "valeurChampVinted"];
  // (24/10, lot « zéro blocage », A3 — Nico) « Une marque introuvable ne bloque jamais : marque la plus proche
  // prouvée, ou « Sans marque » quand la catégorie l'accepte. » Le harnais NOTE la pose de « Sans marque ».
  const harnais = ({ brandValue = "", choix = { type: "aucune", suggestions: [] } } = {}) => {
    const armements = []; const attentes = []; const sansMarque = [];
    const valeurs = [
      { querySelector: () => ({ value: brandValue }), querySelectorAll: () => [] },
      { test: (v) => /^sans marque$/i.test(String(v ?? "").trim()) },
      (v) => String(v ?? "").toLowerCase().trim(),
      async () => { sansMarque.push(true); },
      async () => {}, async () => {}, async () => ({}), async () => {},
      async (m, t, id) => { attentes.push({ m, t, id }); return choix; },
      async () => {}, async () => {}, async () => [],
      (dem, v) => v, texteComparable,
      (id, titre) => armements.push({ id, titre }),
      async () => {}, async () => null, () => 60000,
      // #brand est figé dans ce harnais : la relecture rend sa valeur si elle convient, sinon rien.
      async (_t, accepte) => (accepte(brandValue) ? brandValue : null),
      async () => true, () => "prefill_brand non relevé",
      (el) => String(el?.value ?? ""),
    ];
    const fn = new Function(...noms, `${SEL}; return selectVintedBrand;`)(...valeurs);
    return { fn, armements, attentes, sansMarque };
  };
  const journal = console.warn; console.warn = () => {};
  try {
    let h = harnais(); let w = [];
    let r = await h.fn("Paris 2024", w, { marqueId: 305315, marqueCapturee: "Paris 2024", injectionProuvee: true });
    ok(r?.poseeParId === true && r.marqueId === 305315 && !r.needsUser, "« Paris 2024 » absente du menu (30 s), envoi direct PROUVÉ → posée par son identifiant, AUCUNE question");
    ok(h.armements.length === 1 && h.armements[0].id === 305315 && h.armements[0].titre === "Paris 2024" && h.attentes[0]?.t === 30000 && h.attentes[0]?.id === 305315,
      "l'identifiant CAPTURÉ est armé, après 30 s d'attente de sa ligne");
    ok(w.some((x) => /posée par son identifiant/.test(String(x))), "le chemin pris est dit (avertissement)");
    h = harnais(); w = [];
    r = await h.fn("Paris 2024", w, { marqueId: 305315, marqueCapturee: "Paris 2024" });
    ok(r?.resolution === "sans_marque" && !r.needsUser && h.armements.length === 0 && h.sansMarque.length === 1 && w.some((x) => /Sans marque/.test(String(x))),
      "(24/10) envoi direct NON prouvé, ni ligne ni écriture équivalente → « Sans marque » que le rayon accepte, aucune question, dit dans les avertissements");
    h = harnais({ choix: { type: "inconnue", suggestions: [] } });
    r = await h.fn("pago", [], { marqueId: 352029, marqueCapturee: "pago" });
    ok(r?.resolution === "sans_marque" && h.armements.length === 0 && h.sansMarque.length === 1, "(24/10) « pago » : seule la ligne « Sans marque » proposée → « Sans marque », jamais une pause sans fin");
    h = harnais({ choix: { type: "aucune", suggestions: ["Okaidi", "Okaidi Kids"] } });
    r = await h.fn("Okaïdi", [], { marqueId: null });
    ok(r?.resolution !== "sans_marque" || h.sansMarque.length === 1, "(24/10) une écriture équivalente unique est cherchée avant « Sans marque » (jamais une voisine)");
    h = harnais({ choix: { type: "catalogue", el: { click() {} } } });
    r = await h.fn("Paris 2024", [], { marqueId: 305315, marqueCapturee: "Paris 2024" });
    ok(r?.poseeParId === true && h.armements.length === 1, "ligne cliquée mais #brand resté vide → par son identifiant");
    h = harnais({ brandValue: "Paris 2024", choix: { type: "catalogue", el: { click() {} } } });
    r = await h.fn("Paris 2024", [], { marqueId: 305315, marqueCapturee: "Paris 2024" });
    ok(r === undefined && h.armements.length === 0, "Vinted propose la ligne et #brand la porte → chemin normal, rien d'armé");
    // (26/10) #brand porte une AUTRE marque (pré-remplie par Vinted) : la chaîne tourne quand même, mais
    // l'identifiant n'est jamais armé sur un champ rempli ; ici le champ reste figé sur « Zara » (rien ne
    // la remplace) → la question, jamais « Zara » gardée en silence.
    h = harnais({ brandValue: "Zara" });
    r = await h.fn("Paris 2024", [], { marqueId: 305315, marqueCapturee: "Paris 2024", injectionProuvee: true });
    ok(r?.needsUser === true && h.armements.length === 0 && h.sansMarque.length === 1,
      "#brand porte une AUTRE marque → rien d'armé (jamais deux marques), même envoi prouvé ; « Sans marque » tenté pour la remplacer, puis la question");
    h = harnais();
    r = await h.fn("Nike", [], { marqueId: 305315, marqueCapturee: "Paris 2024" });
    ok(r?.resolution === "sans_marque" && h.armements.length === 0 && h.attentes[0]?.t === 30000, "l'identifiant ne vaut que pour LA marque capturée (jamais armé pour « Nike ») ; (24/10) « Sans marque », aucune question");
    h = harnais();
    r = await h.fn("Zorglubia", [], { marqueId: null });
    ok(r?.resolution === "sans_marque" && !r?.needsUser && h.armements.length === 0 && h.attentes[0]?.t === 30000,
      "(24/10) publication neuve (aucun identifiant), marque inconnue de Vinted : « Sans marque », plus la question du 03/10 ; (26/10) après 30 s d'attente de la ligne de création, plus 10");
    h = harnais();
    r = await h.fn("Paris 2024", [], { marqueId: 305315 });
    ok(r?.resolution === "sans_marque" && h.armements.length === 0, "identifiant sans marque capturée (appel ancien) : jamais armé");
  } finally { console.warn = journal; }
}
{
  const messages = [];
  const armer = new Function("window", `${extraireFonctionJs(vt, "armerMarquePourPost")}; return armerMarquePourPost;`)(
    { postMessage: (m) => messages.push(m), location: { origin: "https://www.vinted.fr" } });
  armer(305315, " Paris 2024 "); armer(1, "Sans marque"); armer(null);
  ok(messages[0]?.__fillsellArmeMarque === true && messages[0].id === 305315 && messages[0].titre === "Paris 2024", "armerMarquePourPost : canal __fillsellArmeMarque, id et libellé");
  ok(messages[1]?.id === null && messages[2]?.id === null, "id 1 ou null → désarme");
}
ok(/armerColisPourPost\(null\);\s*\/\/[^\n]*\n(\s*\/\/[^\n]*\n)*\s*armerMarquePourPost\(null\);/.test(vt), "désarmée à chaque remplissage (onglet de travail partagé)");
ok(/if \(dedie === "marque" && Number\(fields\.marque_id\) > 1\) continue;/.test(vt), "aucune réponse (vintedAspects.brand) ne remplace la marque à identifiant");
ok(/if \(questionMarque\?\.poseeParId\) marqueParId = /.test(vt) && /if \(marqueParId\) \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*const libellesMarque = /.test(vt),
  "posée par son identifiant : #brand vide n'est pas un requis manquant");

// ── 5. UNE-PASSE : RIEN N'EST RETIRÉ SANS PREUVE ────────────────────────────
console.log("\n5. UNE-PASSE : RIEN N'EST RETIRÉ SANS PREUVE, JAMAIS UNE QUESTION");
{
  const iGarde = vt.indexOf("if (onePass?.item_id && !recreation && marqueParId) {");
  const iRetrait = vt.indexOf("const del = await deleteVintedItemViaApi(String(onePass.item_id)");
  const garde = iGarde >= 0 ? vt.slice(iGarde, vt.indexOf("// ── UNE-PASSE : suppression de l'annonce d'origine JUSTE avant le clic", iGarde)) : "";
  ok(iGarde > 0 && iRetrait > iGarde, "la garde précède la suppression de l'annonce d'origine");
  ok(/job\.platform_fields\?\.marque_injection_prouvee !== true/.test(garde) && /brandPage \|\|/.test(garde), "retrait refusé sans preuve servie, ou si #brand porte une autre valeur");
  ok(/marqueParIdNonProuvee: true/.test(garde) && !/needsUser/.test(garde), "le refus n'est jamais une question (aucun needsUser)");
  const msgCs = garde.match(/error: ("[^"]+"(\s*\+\s*"[^"]+")*)/)?.[1] ?? "";
  const texteCs = msgCs.split(/"\s*\+\s*"/).join("").replace(/^"|"$/g, "");
  ok(texteCs.length > 40 && !porteUneEstimation(texteCs) && /Rien n'a été retiré/.test(texteCs), "message vrai, sans durée", texteCs);
}
{
  const i = bg.indexOf("if (result?.marqueParIdNonProuvee) {");
  const branche = i >= 0 ? bg.slice(i, bg.indexOf("// ── FORMAT DE COLIS NON PROPOSÉ PAR LE FORMULAIRE (0.6.84)", i)) : "";
  ok(i > 0 && /updateJobStatus\(accessToken, job\.id, "pending"/.test(branche) && !/"needs_user"/.test(branche), "arrière-plan : pending, jamais needs_user");
  ok(/delete pf\[k\]/.test(branche) && /"needs_user_source", "needsUserField", "champs_a_completer", "needsUserBoucle"/.test(branche), "les traces de l'ancienne question sont levées");
  const morceaux = [...branche.matchAll(/"([^"]{20,})"/g)].map((m) => m[1]).filter((t) => /annonce|marque|FillSell/.test(t));
  const texte = morceaux.join("");
  ok(texte.length > 60 && !porteUneEstimation(texte) && /rien à faire/.test(texte), "message vrai, sans durée", texte);
}

// ── 6. SERVEUR ──────────────────────────────────────────────────────────────
console.log("\n6. SERVEUR : PREUVE DU PARC, RÉARMEMENT, L'ANNONCE GAGNE, « EN PAUSE »");
{
  const B = M.BUILD_VINTED_MARQUE_PAR_ID;
  ok(typeof B === "string" && Number.isFinite(Date.parse(B)), `BUILD_VINTED_MARQUE_PAR_ID lisible (${B}${Date.parse(B) > Date.now() ? " — PROVISOIRE : rien ne s'active" : ""})`);
  const le = (min) => new Date(Date.parse("2026-10-17T10:00:00Z") + min * 60000).toISOString();
  const acc = (id, min) => ({ id, http: 200, relue: id, confirmee: true, le: le(min) });
  ok(M.envoiMarqueProuve([]) === false && M.envoiMarqueProuve(null) === false, "aucune preuve → non prouvé");
  ok(M.envoiMarqueProuve([acc(305315, 0)]) === true, "un dépôt accepté, la marque relue dans la réponse → prouvé");
  ok(M.envoiMarqueProuve([{ id: 305315, http: 200, relue: null, confirmee: false, le: le(0) }]) === false,
    "un 200 SANS la marque relue (Vinted aurait pu l'ignorer) → ne prouve rien");
  ok(M.envoiMarqueProuve([acc(305315, 0), { id: 352029, http: 201, relue: 53, confirmee: false, le: le(5) }]) === false,
    "un 2xx qui remet une AUTRE marque, après la dernière acceptée → plus prouvé (refus)");
  ok(M.envoiMarqueProuve([acc(305315, 0), { id: 352029, http: 400, le: le(5) }]) === false, "refusé APRÈS le dernier accepté → plus prouvé");
  ok(M.envoiMarqueProuve([{ id: 305315, http: 400, le: le(0) }, { ...acc(352029, 5), http: 201 }]) === true, "accepté après un refus → prouvé");
  ok(M.envoiMarqueProuve([acc(305315, 0), { id: 352029, http: 200, relue: null, le: le(5) }]) === true, "un 200 neutre (réponse sans marque lisible) ne révoque rien");
  ok(M.envoiMarqueProuve([{ ...acc(1, 0) }, { ...acc(305315, 0), le: "illisible" }]) === false, "« Sans marque » ou date illisible : ne prouve rien");
  ok(M.marqueAIdentifiantCapturee({ republish_snapshot: { brand_id: 305315 } }) === 305315 && M.marqueAIdentifiantCapturee({ republish_snapshot: { brand_id: "352029" } }) === 352029, "identifiant capturé lu sur la copie");
  ok(M.marqueAIdentifiantCapturee({ republish_snapshot: { brand_id: 1 } }) === null && M.marqueAIdentifiantCapturee({}) === null && M.marqueAIdentifiantCapturee(null) === null, "« Sans marque » ou rien : null");
  const pause = { platform: "vinted", action: "republish", status: "pending", platform_fields: { republish_step: "captured", pause_marque_par_id: { n: 1 } } };
  ok(M.enPauseMarqueParId(pause) && !M.enPauseMarqueParId({ ...pause, status: "needs_user" })
    && !M.enPauseMarqueParId({ ...pause, platform_fields: { ...pause.platform_fields, republish_step: "deleted" } }), "pause reconnue (pending, pas encore retirée) — rien d'autre");
  const e = etatJob({ id: "x", inventaire_id: 1, ...pause, error: "Republication en pause AVANT tout retrait", created_at: le(-30) }, { maintenant: Date.parse(le(0)), extension: { etat: "vivante" } });
  ok(e.etat === "en_pause" && e.motif === "retenue_serveur", "état : « En pause », annonce intacte (jamais « À toi de jouer »)", JSON.stringify(e));
}
{
  const c = C.CORRECTIFS_EXTENSION.find((x) => x.cle === "vinted_marque_par_identifiant");
  ok(c && c.buildMin === M.BUILD_VINTED_MARQUE_PAR_ID && c.platform === "vinted" && c.actions.join() === "republish", "réarmement : entrée vinted_marque_par_identifiant, au build du correctif");
  const B114 = "2026-10-15T19:36:02Z+18cc681 · v0.6.114";
  const repub = (error, pf, extra = {}) => ({ platform: "vinted", action: "republish", status: "needs_user", handler_build: B114, error, platform_fields: pf, ...extra });
  const patrick = repub("Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted ne connaît pas la marque « Paris 2024 » et ne permet plus d'en créer une nouvelle.",
    { republish_step: "captured", needs_user_source: "prevol_negatif", republish_snapshot: { marque: "Paris 2024", brand_id: 305315 } });
  const romain = repub("Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted ne connaît pas la marque « pago » et ne permet plus d'en créer une nouvelle.",
    { republish_step: "captured", needs_user_source: "prevol_negatif", republish_snapshot: { marque: "pago", brand_id: 352029 } });
  const cousu = repub("Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. Motif : Le champ Marque n'a pas pu être renseigné avec « Cousu Main » (introuvable au catalogue Vinted, création impossible, et même le repli « Sans marque » a échoué).",
    { republish_step: "captured", needs_user_source: "relancer", republish_snapshot: { marque: "Cousu Main", brand_id: 135472 } }, { handler_build: "2026-10-02T19:15:37Z+1a49399 · v0.6.89" });
  const retiree = repub("Ton annonce a été retirée de Vinted et n'a pas pu être recréée automatiquement : Vinted exige « Marque ». Rien n'est perdu : toutes ses données sont sauvegardées.",
    { republish_step: "deleted", deleted_at: "2026-10-07T22:15:35.887Z", last_diagnostic: "refus serveur HTTP 400 (/api/v2/item_upload/items) || réponse : {\"code\":99,\"errors\":[{\"field\":\"brand\",\"value\":\"Le champ Marque doit être renseigné\"}]}", republish_snapshot: { marque: "Vintage Love", brand_id: 19889 } },
    { handler_build: "2026-10-11T14:31:05Z+a3c5aef · v0.6.110" });
  const avant = Date.parse(B114.slice(0, 20)) < Date.parse(M.BUILD_VINTED_MARQUE_PAR_ID);
  if (avant) {
    ok(C.correctifPourJob(patrick)?.cle === "vinted_marque_par_identifiant" && C.correctifPourJob(romain)?.cle === "vinted_marque_par_identifiant", "patrick « Paris 2024 » et Romain « pago » : reconnus");
    ok(C.correctifPourJob(cousu)?.cle === "vinted_marque_par_identifiant", "l'arrêt des builds ≤ 0.6.93 (« n'a pas pu être renseigné ») aussi");
    ok(C.correctifPourJob(retiree)?.cle === "vinted_marque_par_identifiant", "une annonce retirée, refusée 400 `brand` : recréée avec sa marque");
  }
  // (26/10 nuit) Ces règles valent pour les entrées d'AVANT la 0.6.146 ; la 0.6.146 (marque créée, correctifs-extension-selftest
  // § 1 quater) reprend une fois ce qu'elles laissaient en question.
  const AVANT_0146 = C.CORRECTIFS_EXTENSION.filter((x) => x.cle !== "vinted_marque_creee");
  ok(C.correctifPourJob({ ...patrick, platform_fields: { ...patrick.platform_fields, republish_snapshot: { marque: "Paris 2024", brand_id: 1 } } }, AVANT_0146) === null
    && C.correctifPourJob({ ...patrick, platform_fields: { republish_step: "captured" } }, AVANT_0146) === null, "sans vraie marque à identifiant : jamais réarmé (avant la 0.6.146)");
  ok(C.correctifPourJob({ ...patrick, handler_build: `${M.BUILD_VINTED_MARQUE_PAR_ID}+abcdef0` })?.cle !== "vinted_marque_par_identifiant", "un arrêt SUR le build corrigé n'est jamais réarmé par ce correctif");
  // (25/10 nuit) … mais la chaîne de repli (0.6.134) le reprend UNE fois ; un arrêt sur la 0.6.134+ jamais.
  ok(C.correctifPourJob({ ...patrick, handler_build: `${M.BUILD_VINTED_MARQUE_PAR_ID}+abcdef0` })?.cle === "vinted_marque_chaine_de_repli", "arrêt en 0.6.123-0.6.133 : réarmé une fois vers la chaîne de repli (0.6.134)");
  ok(C.correctifPourJob({ ...patrick, handler_build: `${M.BUILD_VINTED_MARQUE_CHAINE}+abcdef0` }, AVANT_0146) === null, "un arrêt SUR la chaîne de repli n'est jamais réarmé (par elle)");
  ok(C.correctifPourJob({ ...patrick, platform: "leboncoin" }, AVANT_0146) === null && C.correctifPourJob({ ...patrick, action: "publish" }, AVANT_0146) === null, "Vinted, republication seulement (entrées d'avant la 0.6.146)");
  ok(C.posteAJour(`${M.BUILD_VINTED_MARQUE_PAR_ID}+abcdef0`, c) === true, "un poste au build du correctif le porte");
}
{
  const retenues = { [marqueComparable("Paris 2024")]: "Disneyland Paris" };
  const j = { platform: "vinted", action: "republish", platform_fields: { republish_snapshot: { marque: "Paris 2024", brand_id: 305315 }, vintedAspects: { brand: "Paris 2024" } } };
  ok(appliquerMarqueRetenue(j, retenues, new Date(), { annonceParIdentifiant: true }) === null && j.platform_fields.vintedAspects.brand === "Paris 2024",
    "poste à jour : une marque retenue ne remplace jamais la marque à identifiant de l'annonce");
}
ok(/appliquerMarqueRetenue\(j, retenues as Record<string, unknown>, new Date\(\), \{ annonceParIdentifiant: posteMarqueParId \}\)/.test(gpj), "get-pending-jobs : marque retenue sans effet pour un poste à jour");
ok(/import \{ BUILD_VINTED_MARQUE_PAR_ID, BUILD_VINTED_MARQUE_CHAINE, envoiMarqueProuve, enPauseMarqueParId, marqueAIdentifiantCapturee \} from "\.\.\/_shared\/vinted-marque-par-id\.js";/.test(gpj), "get-pending-jobs lit la règle partagée");
ok(/const posteAJourMarque = buildMsDe\(buildDuPoll\) >= buildMsDe\(BUILD_VINTED_MARQUE_PAR_ID\);/.test(gpj)
  && /if \(posteAJourMarque\) \{[\s\S]{0,300}marqueProuvee = await envoiMarqueProuveParc\(admin\);/.test(gpj), "la preuve n'est lue que pour un poste qui porte le correctif");
ok(/if \(!relaches\.has\(String\(j\.id\)\) && enPauseMarqueParId\(j\) && !\(posteAJourMarque && marqueProuvee\)\) \{ retenusMarque\.add/.test(gpj), "une pause n'est resservie qu'avec la preuve, à un poste à jour — ou relâchée (24/10)");
// (24/10, lot « zéro blocage », A3) Une pause « marque » n'est jamais permanente.
ok(/const raison = id && duCatalogue\.has\(id\) \? "marque_du_catalogue" : \(posteChaine \? "chaine_de_repli" : null\);/.test(gpj)
  && /Date\.now\(\) - t < 6 \* 3_600_000/.test(gpj) && /\.eq\("action", "republish"\)\.eq\("status", "published"\)/.test(gpj),
  "(24/10) pause relâchée : marque du catalogue (reprise avec succès par le parc, 30 j) ou poste à la chaîne de repli ; au plus toutes les 6 h");
ok(/if \(marqueProuvee\) j\.platform_fields = \{ \.\.\.pfM, marque_injection_prouvee: true \};/.test(gpj), "marque_injection_prouvee servi seulement sur preuve");
ok(/else if \("marque_injection_prouvee" in pfM\) \{\s*const \{ marque_injection_prouvee: _perime, \.\.\.reste \} = pfM;\s*j\.platform_fields = reste;/.test(gpj),
  "un drapeau resté en base (preuve révoquée) est retiré de la copie servie");
ok(/const posteMarqueParIdR = buildMsDe\(buildDuPoll\) >= buildMsDe\(BUILD_VINTED_MARQUE_PAR_ID\);/.test(gpj)
  && /if \(posteMarqueParIdR && marqueAIdentifiantCapturee\(pfR\) != null\) continue;/.test(gpj),
  "la réponse (marque_choisie) n'est plus servie sur une marque à identifiant — à un poste qui porte le correctif (un ancien poste ne boucle pas)");

console.log(ko === 0
  ? "\n✅ MARQUE VINTED PAR IDENTIFIANT : la marque de l'annonce en ligne est reprise telle quelle, rien n'est retiré sans preuve.\n"
  : `\n❌ ${ko} contrôle(s) en échec.\n`);
process.exit(ko === 0 ? 0 : 1);
