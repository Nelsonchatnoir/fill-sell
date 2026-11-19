// ═══════════════════════════════════════════════════════════════════════════
// REPUBLICATION VINTED : LES CORRECTIONS DE LA FEUILLE PASSENT SUR LA CAPTURE — SELFTEST « VERROU » (19/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Demande de Nico (suite de f24628b, 2.9.215) : la correction faite dans la feuille de republication est écrite sur la
// fiche ET sur la tâche (platform_fields.corrections_republication) ; Vinted recrée depuis la CAPTURE de l'annonce en
// ligne : la correction n'y passait pas. Rouge sur le code d'avant (module absent, get-pending-jobs muet).
// Garanties :
//   1. la forme de la feuille (src/stock/correctionsRepublication.js, correctionsPourLaTache) se lit telle quelle ;
//      une correction n'est jamais héritée d'une republication d'avant (recopiée par spend_coins_and_republish) ;
//   2. la capture est corrigée à l'étape « captured » seulement, AVANT le retrait, UNE fois par capture (une recapture
//      les repose) ;
//   3. libellés ET payload.natif : titre, description, prix, état (identifiant et libellé dans la langue de la capture),
//      couleurs (identifiants), marque (identifiant), taille (libellé exact de la grille du rayon, l'identifiant capturé
//      quitte la capture), matière, colis ;
//   4. jamais une valeur inventée : un libellé qui ne se résout pas SANS DOUTE (couleur ambiguë ou hors palette, taille
//      hors grille ou grille inconnue, marque sans identifiant, plusieurs matières sans identifiants) n'est pas posé, et
//      la tâche le dit (non_posees, motif) ;
//   5. la VRAIE fabrique de l'extension (background.js, construireJobRecreation) recrée l'annonce corrigée ;
//   6. les photos choisies ne sont jamais touchées (aucune clé photos dans ce qui s'écrit) ;
//   7. le câblage : get-pending-jobs pose la correction après les autres règles de la capture, et ces règles (capture
//      corrigée par la fiche, couleur posée par nous) ne la défont jamais.
//   node scripts/corrections-republication-vinted-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ${detail}` : ""}`); } };
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");

let M = null;
try { M = await import("../supabase/functions/_shared/corrections-republication.js"); }
catch (e) { ok(false, "_shared/corrections-republication.js existe", String(e?.message ?? e).slice(0, 160)); }
const APP = await import("../src/stock/correctionsRepublication.js");

// Une capture Vinted réelle dans sa forme (valeurs de test, aucun compte client) — relevé du 19/11.
const capture = () => ({
  id: 9001,
  libelles: { categoryPath: ["Test", "Rayon", "Pulls"], colis: "Petit", couleurs: ["Gris"], etat: "Très bon état", marque: "Marque A", matiere_ids: [300], taille: "M" },
  payload: {
    titre: "TEST FillSell pull gris - ne pas acheter", description: "Texte d'origine", prix: "999.0",
    natif: {
      title: "TEST FillSell pull gris - ne pas acheter", description: "Texte d'origine", brand_id: 7001, brand_dto: { id: 7001, title: "Marque A" },
      catalog_id: 1234, color1: "Gris", color1_id: 3, color2: null, color2_id: null, package_size_id: 1, size_id: 207, status_id: 2,
      item_attributes: [{ code: "material", ids: [300] }, { code: "condition", ids: [2] }, { code: "size", ids: [207] }],
      price: { amount: "999.0", currency_code: "EUR" },
    },
    photos_cdn: ["https://images1.vinted.net/x.jpg"],
  },
  photos_urls: ["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-images/t/1.jpg"],
});
const GRILLES = { taille: ["XS", "S", "M", "L", "XL"], matiere: ["Coton", "Laine", "Polyester", "Cuir synthétique"], colis: ["1|Petit", "2|Moyen", "3|Grand"] };
const NE = "2026-11-19T14:00:00.000Z";
const jobVinted = (pf = {}) => ({ id: "11111111-aaaa-4bbb-8ccc-000000000001", platform: "vinted", action: "republish", status: "pending", created_at: NE,
  platform_fields: { republish_step: "captured", capture_id: "9001", vinted_item_id: "123456789", ...pf } });

if (M) {
  console.log("\n1. La forme de la feuille se lit telle quelle ; jamais héritée");
  const feuille = APP.correctionsPourLaTache({ toutes: { taille: "L", couleur: "Noir, Blanc", etat: "Bon état", titre: "TEST FillSell pull noir - ne pas acheter" }, parPf: {} }, "vinted");
  const pfApp = { corrections_republication: { ...feuille, le: "2026-11-19T14:00:05.000Z", par: "feuille_republication" } };
  const lu = M.correctionsDeLaTache(pfApp);
  ok(lu?.taille?.v === "L" && lu?.couleurs?.v === "Noir, Blanc" && lu?.etat?.v === "Bon état" && /pull noir/.test(lu?.titre?.v ?? ""),
    "correctionsPourLaTache (app) → correctionsDeLaTache (serveur) : mêmes clés, mêmes valeurs", JSON.stringify(lu));
  ok(M.correctionsDeCetteTache(jobVinted(pfApp)) != null, "écrites après la naissance de la tâche : elles valent pour elle");
  ok(M.correctionsDeCetteTache(jobVinted({ corrections_republication: { ...feuille, le: "2026-11-17T09:00:00.000Z" } })) == null,
    "recopiées d'une republication d'avant (écrites 2 jours avant la naissance) : ignorées");
  ok(M.correctionsDeCetteTache(jobVinted({ corrections_republication: { ...feuille, job_id: "autre-tache", le: "2026-11-19T14:00:05.000Z" } })) == null,
    "nommées pour une AUTRE tâche (job_id) : ignorées");
  ok(M.correctionsDeCetteTache(jobVinted({ corrections_republication: { ...feuille, job_id: "11111111-aaaa-4bbb-8ccc-000000000001" } })) != null,
    "nommées pour CETTE tâche (job_id) : valent, quelle que soit l'heure");
  ok(M.correctionsDeLaTache({}) == null && M.correctionsDeLaTache({ corrections_republication: { taille: { v: "  " } } }) == null, "rien, ou des valeurs vides : null");

  console.log("\n2. À l'étape « captured », avant le retrait, une fois par capture");
  ok(M.captureACorrigerParLaFeuille(jobVinted(pfApp)), "captured + corrections de cette tâche → à corriger");
  ok(!M.captureACorrigerParLaFeuille(jobVinted({ ...pfApp, republish_step: "a_capturer", capture_id: null })), "a_capturer : rien (la capture n'existe pas encore)");
  ok(!M.captureACorrigerParLaFeuille(jobVinted({ ...pfApp, deleted_at: "2026-11-19T14:05:00Z" })), "retrait engagé (deleted_at) : jamais");
  ok(!M.captureACorrigerParLaFeuille(jobVinted({ ...pfApp, republish_step: "deleted" })), "étape deleted : jamais");
  ok(!M.captureACorrigerParLaFeuille({ ...jobVinted(pfApp), status: "processing" }), "tâche déjà prise (processing) : jamais");
  const tracee = M.traceCorrectionsPosees(jobVinted(pfApp).platform_fields, { jobId: jobVinted().id, captureId: "9001", posees: { taille: "L" }, non_posees: [] });
  ok(!M.captureACorrigerParLaFeuille(jobVinted(tracee)), "même capture déjà corrigée : plus jamais");
  ok(M.captureACorrigerParLaFeuille(jobVinted({ ...tracee, capture_id: "9002" })), "recapture (capture > 24 h) : la correction est reposée sur la nouvelle");
  ok(!M.captureACorrigerParLaFeuille(jobVinted({})), "sans correction : rien");

  console.log("\n3. Libellés ET payload.natif");
  const cap = capture();
  const r = M.correctionsSurLaCaptureVinted({
    corrections: { titre: { v: "TEST FillSell pull noir - ne pas acheter" }, description: { v: "Texte corrigé\nligne 2" }, prix: { v: "1200" },
      etat: { v: "Bon état" }, marque: { v: "Marque B", id: 7002 }, taille: { v: "l" }, couleurs: { v: "Noir, Blanc" }, matieres: { v: "laine" }, colis: { v: "Moyen" } },
    capture: cap, grilles: GRILLES, prixDeLaTache: 999,
  });
  const nat = r.payload.natif;
  ok(r.payload.titre === "TEST FillSell pull noir - ne pas acheter" && nat.title === r.payload.titre, "titre : payload.titre et natif.title");
  ok(r.payload.description === "Texte corrigé\nligne 2" && nat.description === r.payload.description, "description : payload et natif, sauts de ligne gardés");
  ok(r.prix === 1200 && Number(r.payload.prix) === 1200, "prix : rendu pour la tâche (prix_republication) et posé sur la capture");
  ok(r.libelles.etat === "Bon état" && nat.status_id === 3 && nat.item_attributes.find((a) => a.code === "condition")?.ids?.[0] === 3,
    "état : libellé, status_id ET item_attributes[condition] (3 = Bon état)", JSON.stringify(nat.item_attributes));
  ok(r.libelles.marque === "Marque B" && nat.brand_id === 7002 && nat.brand_dto.id === 7002, "marque : l'identifiant fait foi (brand_id, brand_dto)");
  ok(r.libelles.taille === "L" && nat.size_id === null && !nat.item_attributes.some((a) => a.code === "size") && r.payload.champs_utilisateur?.taille === "L",
    "taille : le libellé EXACT de la grille du rayon (« l » → « L »), l'identifiant capturé quitte la capture", JSON.stringify(r.payload.taille_corrigee));
  ok(JSON.stringify(r.libelles.couleurs) === JSON.stringify(["Noir", "Blanc"]) && nat.color1_id === 1 && nat.color2_id === 12 && nat.color1 === "Noir",
    "couleurs : identifiants Vinted (1, 12) et libellés de la langue de la capture");
  ok(r.libelles.matiere === "Laine" && !("matiere_ids" in r.libelles) && !nat.item_attributes.some((a) => a.code === "material"),
    "matière : le libellé de la liste, les identifiants d'avant retirés (sinon la recréation reposerait l'ancienne)");
  ok(r.libelles.colis === "Moyen" && nat.package_size_id === 2, "colis : l'identifiant de la grille du rayon (2 = Moyen)");
  ok(Object.keys(r.posees).length === 9 && r.non_posees.length === 0 && r.change, "9 corrections posées, aucune refusée", JSON.stringify(r.non_posees));
  ok(r.libelles.categoryPath.join(" > ") === "Test > Rayon > Pulls" && nat.catalog_id === 1234 && cap.libelles.taille === "M",
    "le reste de la capture intact (rayon) ; la capture d'entrée n'est pas modifiée en place");
  ok(!("photos_urls" in r) && !("photos_urls" in r.payload) && JSON.stringify(r.payload.photos_cdn) === JSON.stringify(cap.payload.photos_cdn),
    "photos : jamais touchées (rien à écrire dans photos_urls)");

  console.log("\n4. Jamais une valeur inventée : non posée, et dite");
  const motif = (corrections, extra = {}) => {
    const x = M.correctionsSurLaCaptureVinted({ corrections, capture: capture(), grilles: GRILLES, ...extra });
    return { motifs: x.non_posees.map((p) => `${p.cle}:${p.motif}`), x };
  };
  ok(motif({ couleurs: { v: "Rosa" } }).motifs.join() === "couleurs:couleur_ambigue", "« Rosa » (5 ou 24) : ambiguë, non posée");
  ok(motif({ couleurs: { v: "Bleu nuit" } }).motifs.join() === "couleurs:couleur_hors_palette_vinted", "« Bleu nuit » : hors palette, non posée");
  ok(motif({ taille: { v: "XXL" } }).motifs.join() === "taille:taille_hors_grille_du_rayon", "taille absente de la grille du rayon : non posée");
  { const y = M.correctionsSurLaCaptureVinted({ corrections: { taille: { v: "L" } }, capture: capture(), grilles: {} });
    ok(y.non_posees.map((p) => p.motif).join() === "grille_du_rayon_inconnue" && y.libelles.taille === "M" && y.payload.natif.size_id === 207,
      "grille du rayon inconnue : non posée, la capture garde SA taille et son identifiant"); }
  ok(motif({ marque: { v: "Marque inconnue" } }).motifs.join() === "marque:marque_sans_identifiant_vinted", "marque sans identifiant : non posée");
  { const y = motif({ marque: { v: "marque c" } }, { marques: [{ id: 7003, libelle: "Marque C" }, { id: 7003, libelle: "Marque C" }] }).x;
    ok(y.libelles.marque === "marque c" && y.payload.natif.brand_id === 7003 && !y.non_posees.length, "même marque portée par une annonce du compte (un seul identifiant) : posée"); }
  ok(motif({ marque: { v: "Marque D" } }, { marques: [{ id: 1, libelle: "Marque D" }, { id: 8, libelle: "Marque D" }, { id: 9, libelle: "Marque D" }] }).motifs.join() === "marque:marque_ambigue_dans_le_catalogue",
    "deux identifiants pour un libellé : non posée");
  { const y = motif({ marque: { v: "Sans marque" } }).x;
    ok(y.payload.natif.brand_id === 1 && y.libelles.marque === "Sans marque", "« Sans marque » : l'identifiant natif 1"); }
  ok(motif({ matieres: { v: "Coton, Polyester" } }).motifs.join() === "matieres:plusieurs_matieres_sans_identifiants",
    "plusieurs matières sans identifiants (la recréation n'en pose qu'une) : non posée");
  ok(motif({ matieres: { v: "Bambou" } }).motifs.join() === "matieres:matiere_hors_liste_vinted", "matière hors liste : non posée");
  ok(motif({ colis: { v: "Énorme" } }).motifs.join() === "colis:colis_hors_grille_du_rayon", "colis hors grille du rayon : non posé");
  ok(motif({ titre: { v: "x".repeat(101) } }).motifs.join() === "titre:titre_trop_long_pour_vinted", "titre de plus de 100 caractères : non posé");
  { const it = capture(); it.libelles.etat = "Ottime"; it.libelles.couleurs = ["Grigio"];
    const y = M.correctionsSurLaCaptureVinted({ corrections: { etat: { v: "Bon état" }, couleurs: { v: "Noir" } }, capture: it, grilles: GRILLES });
    ok(y.libelles.etat === "Buone" && y.payload.natif.status_id === 3 && JSON.stringify(y.libelles.couleurs) === JSON.stringify(["Nero"]),
      "capture italienne : l'état et la couleur partent dans SA langue (« Buone », « Nero »), par identifiant", JSON.stringify(y.libelles)); }
  { const sans = capture(); sans.libelles.etat = ""; sans.libelles.couleurs = []; sans.payload.natif.color1_id = null;
    ok(motif({}).motifs.length === 0 && M.correctionsSurLaCaptureVinted({ corrections: { etat: { v: "Bon état" } }, capture: sans }).non_posees[0]?.motif === "langue_de_la_capture_inconnue",
      "langue de la capture illisible : l'état n'est pas posé (jamais un libellé dans une autre langue)"); }
  { const y = M.correctionsSurLaCaptureVinted({ corrections: { taille: { v: "L" }, couleurs: { v: "Gris" } }, capture: capture(), grilles: GRILLES });
    ok(y.posees.couleurs === "Gris" && y.change, "une valeur déjà en ligne reste posée (dite), rien d'inventé"); }

  console.log("\n5. La VRAIE fabrique de l'extension recrée l'annonce corrigée (background.js, construireJobRecreation)");
  const B = chargerBackground();
  await new Promise((res) => setTimeout(res, 30));
  const capCorr = { ...cap, libelles: r.libelles, payload: r.payload, photos_urls: cap.photos_urls };
  const rec = B.construireJobRecreation({ id: "j1", title: "titre du job", inventaire_id: 7 }, { vinted_account_id: "31995881", prix_republication: r.prix }, capCorr, r.prix);
  const pfR = rec.platform_fields;
  ok(rec.title === "TEST FillSell pull noir - ne pas acheter", "titre recréé = titre corrigé", rec.title);
  ok(rec.description === "Texte corrigé\nligne 2", "description recréée = description corrigée");
  ok(rec.price === 1200, "prix recréé = prix corrigé");
  ok(pfR.taille === "L" && !pfR.taille_ids, "taille : le libellé corrigé, SANS l'identifiant de l'ancienne taille", JSON.stringify({ t: pfR.taille, ids: pfR.taille_ids }));
  ok(pfR.marque === "Marque B" && pfR.marque_id === 7002, "marque : libellé et identifiant corrigés");
  ok(pfR.etat === "Bon état" && JSON.stringify(pfR.colors) === JSON.stringify(["Noir", "Blanc"]), "état et couleurs : libellés corrigés");
  ok(pfR.vinted_ids?.status_id === 3 && JSON.stringify(pfR.vinted_ids?.color_ids) === JSON.stringify([1, 12]), "identifiants (page non française) : état 3, couleurs 1 et 12");
  ok(pfR.matiere === "Laine" && !pfR.matiere_ids && !(pfR.itemAttributesCaptures ?? []).some((a) => a.code === "material" || a.code === "size"),
    "matière : le libellé corrigé, ni l'ancien identifiant ni l'ancienne taille dans les attributs capturés");
  ok(pfR.packageSize === "Moyen" && pfR.packageSizeId === 2, "colis : Moyen, identifiant 2");
  ok(JSON.stringify(rec.photos.map((p) => p.url)) === JSON.stringify(cap.photos_urls), "photos : celles de la capture (choisies ou non), intactes");

  console.log("\n6. Les règles du service ne défont jamais une correction");
  const sous = jobVinted({ corrections_republication: { couleurs: { v: "Noir" }, etat: { v: "Bon état" }, le: "2026-11-19T14:00:05.000Z" } });
  ok(M.champSousCorrection(sous, "couleurs") && M.champSousCorrection(sous, "etat") && !M.champSousCorrection(sous, "taille"),
    "avant d'être jugée, une correction protège son champ (couleurs, état) — pas les autres");
  const refusee = jobVinted({ ...sous.platform_fields, ...M.traceCorrectionsPosees({}, { jobId: sous.id, captureId: "9001", posees: { etat: "Bon état" }, non_posees: [{ cle: "couleurs", motif: "x" }] }) });
  ok(M.champSousCorrection(refusee, "etat") && !M.champSousCorrection(refusee, "couleurs"), "après : seul un champ POSÉ reste protégé (une couleur refusée rend la main aux règles d'avant)");
}

console.log("\n7. Câblage (get-pending-jobs)");
{
  const G = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/from "\.\.\/_shared\/corrections-republication\.js"/.test(G), "get-pending-jobs importe _shared/corrections-republication.js");
  const iCF = G.indexOf("couleur de la fiche : ${String((e as Error)?.message ?? e)} — file servie telle quelle");
  const iCorr = G.indexOf("captureACorrigerParLaFeuille(j");
  const iFinie = G.indexOf("══ UNE REPUBLICATION RECRÉÉE EST FINIE");
  ok(iCF > 0 && iCorr > iCF && iCorr < iFinie, "la capture reçoit les corrections APRÈS la capture corrigée par la fiche et la couleur posée par nous (dernier écrivain)");
  const bloc = iCorr > 0 ? G.slice(iCorr, iFinie) : "";
  ok(/vinted_republish_captures"\)\.update\(\{ libelles: [^}]*payload/.test(bloc) && !/photos_urls/.test(bloc),
    "écrit libellés et payload de la capture, jamais photos_urls");
  ok(/\.eq\("status", "pending"\)/.test(bloc) && /traceCorrectionsPosees\(/.test(bloc), "trace sur la tâche, tâche encore en attente seulement");
  ok(/platform_category_aspects/.test(bloc) && /\.slice\(0, 10\)/.test(bloc), "grilles du rayon relevées (platform_category_aspects), 10 tâches par passage");
  ok(/champSousCorrection\(j as never, "etat"\)/.test(G), "capture corrigée par la fiche : l'état corrigé lui sert de référence (elle ne le défait pas)");
  ok(/!champSousCorrection\(j as never, "couleurs"\)/.test(G), "couleur posée par nous : jamais sur une couleur corrigée");
}

console.log(`\n${n - ko}/${n} vérifications`);
if (ko) { console.log(`✗ ${ko} échec(s)`); process.exit(1); }
console.log("✓ selftest corrections-republication-vinted : OK");

function chargerBackground() {
  const DOSSIER = path.join(RACINE, "chrome-extension");
  const rien = { addListener: () => {} };
  const aire = (m) => ({ get: async (k) => (typeof k === "string" ? { [k]: m[k] } : { ...m }), set: async (o) => { Object.assign(m, o); }, remove: async (k) => { delete m[k]; } });
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, "base64").toString("binary"), btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    fetch: async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]" }),
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien, lastError: null, id: "selftest", getManifest: () => ({ version: "0.0.0" }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local: aire({}), session: aire({}), onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 1 }), remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 1 }), get: async () => ({ id: 1 }) },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [] }, cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} }, notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8"), contexte, { filename: "background.js" });
  return ctx;
}
