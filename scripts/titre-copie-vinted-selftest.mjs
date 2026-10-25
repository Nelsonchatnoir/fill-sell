// ═══════════════════════════════════════════════════════════════════════════
// LE TITRE D'UNE COPIE VINTED : UN SAUT DE LIGNE N'EN FAIT PAS UN AUTRE TITRE (25/10)
//   `npm run selftest:titre-copie-vinted`
// ═══════════════════════════════════════════════════════════════════════════
// Vincent A., job 9138772c, « Champavert, le lycanthrope\nPar Pétrus Borel » :
// le champ Titre de Vinted supprime le saut de ligne sans espace → annonce née
// « Champavert, le lycanthropePar Pétrus Borel » (10514173498, 24/10 18:53:11),
// jamais reconnue par les comparateurs (ponctuation → espace), redéposée à
// 19:46:01 (10514978864) : deux annonces en ligne.
// Ce test garantit (supabase/functions/_shared/titre-copie-vinted.js) :
//   1. memeTitre / titreSansSautDeLigne : la règle, sur le cas réel ;
//   2. la COPIE de l'extension (background.js) est EXACTEMENT le module ;
//   3. l'extension (vrai background.js, vm) tape le titre sur une ligne et
//      reconnaît la copie « …lycanthropePar… » ;
//   4. get-pending-jobs sert le titre sur une ligne à TOUTES les versions
//      (job.title, titre_saisi de la recréation), sans rien écrire ;
//   5. vinted.js rend le titre relu dans le champ (titre_pose), le background
//      compare la copie à lui ;
//   6. les messages disent vrai : jamais « rien n'est redéposé » ni « Relance-la »
//      après un retrait.
//   node scripts/titre-copie-vinted-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";
import * as M from "../supabase/functions/_shared/titre-copie-vinted.js";
import { CANAL_RE } from "../supabase/functions/_shared/etat-job.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ${detail}` : ""}`); } };

const TITRE_NL = "Champavert, le lycanthrope\nPar Pétrus Borel";
const TITRE_COLLE = "Champavert, le lycanthropePar Pétrus Borel";

console.log("\n1. La règle, sur le cas réel");
ok(M.titreNormCopie(TITRE_NL) !== M.titreNormCopie(TITRE_COLLE), "la normalisation seule ne les rapprochait pas (« lycanthrope par » ≠ « lycanthropepar »)");
ok(M.memeTitre(TITRE_NL, TITRE_COLLE) && M.memeTitre(TITRE_COLLE, TITRE_NL), "memeTitre : la copie au saut de ligne supprimé est la même (dans les deux sens)");
ok(M.memeTitre(TITRE_NL, "Champavert, le lycanthrope Par Pétrus Borel"), "titre tapé sur une ligne (espace) : le même");
ok(M.memeTitre("Short jean Levi’s  levi-Strauss 24x32", "short jean levi s levi strauss 24x32"), "ponctuation, casse, apostrophe : comme avant");
ok(M.memeTitre("Pull Été Cœur rouge", "pull ete coeur rouge") === false && M.memeTitre("Pull Été Cœur rouge taille M", "pull éte cœur rouge taille m"),
  "accents ignorés seulement via le compact (≥ 12 caractères) — « œ » reste « œ »");
ok(!M.memeTitre("Pull bleu", "Pullbleu"), "titre court (< 12 lettres et chiffres) : il faut la même forme normalisée");
ok(!M.memeTitre("", "") && !M.memeTitre("   ", "x") && !M.memeTitre(null, null), "un titre vide n'est jamais le même titre");
ok(!M.memeTitre(TITRE_NL, "Champavert, le lycanthrope Par Pétrus Borel tome 2"), "un mot de plus : un autre titre");
ok(!M.memeTitre("Robe Zara bleue taille M", "Robe Zara bleue taille S"), "une taille différente : un autre titre");
ok(M.titreSansSautDeLigne(TITRE_NL) === "Champavert, le lycanthrope Par Pétrus Borel", "saut de ligne → une espace");
ok(M.titreSansSautDeLigne("Lot de 3 \r\n  livres\n\nPoche\n") === "Lot de 3 livres Poche", "\\r\\n, espaces autour, sauts multiples, saut final : une espace, bords nets");
ok(M.titreAUnSautDeLigne(TITRE_NL) && !M.titreAUnSautDeLigne("Sans saut") && !M.titreAUnSautDeLigne(null), "titreAUnSautDeLigne");

console.log("\n2. La copie de l'extension est EXACTEMENT le module");
const MOD = lire("supabase/functions/_shared/titre-copie-vinted.js");
const BG = lire("chrome-extension/background.js");
for (const nom of ["titreSansSautDeLigne", "titreAUnSautDeLigne", "titreNormCopie", "titreCompactCopie", "memeTitre"]) {
  let a = null, b = null;
  try { a = extraireFonctionJs(MOD, nom); b = extraireFonctionJs(BG, nom); } catch (e) { a = a ?? String(e); }
  ok(a && b && a === b, `${nom} : même texte dans background.js`, a === b ? "" : `module : ${a}\n      extension : ${b}`);
}
ok((BG.match(/^function memeTitre\(/gm) ?? []).length === 1, "une seule définition dans background.js");

console.log("\n3. L'extension (vrai background.js) : titre tapé sur une ligne, copie reconnue");
function chargerBackground() {
  const rien = { addListener: () => {} };
  const aire = (m) => ({ get: async (k) => (typeof k === "string" ? { [k]: m[k] } : { ...m }), set: async (o) => { Object.assign(m, o); }, remove: async (k) => { delete m[k]; } });
  const DOSSIER = path.join(RACINE, "chrome-extension");
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
const B = chargerBackground();
await new Promise((r) => setTimeout(r, 30));
{
  const j = B.sanitizeJob({ platform: "vinted", title: TITRE_NL, platform_fields: {} });
  ok(j.title === "Champavert, le lycanthrope Par Pétrus Borel", "sanitizeJob (Vinted) : le saut de ligne devient une espace", JSON.stringify(j.title));
  const lbc = { platform: "leboncoin", title: TITRE_NL };
  ok(B.sanitizeJob(lbc).title === TITRE_NL, "Leboncoin : inchangé (périmètre Vinted)");
  const sage = { platform: "vinted", title: "Pull Zara bleu taille M", platform_fields: {} };
  ok(B.sanitizeJob(sage) === sage, "titre sans saut : le job est rendu tel quel (même objet)");
  const cap = { payload: { titre: TITRE_NL, description: "Roman", natif: {} }, libelles: {}, photos_urls: ["https://x/1.jpg"] };
  const rec = B.construireJobRecreation({ id: "9138772c", title: TITRE_NL, inventaire_id: 1 }, { vinted_account_id: "21011125" }, cap, 9);
  ok(rec.title === "Champavert, le lycanthrope Par Pétrus Borel", "recréation (titre capturé à saut de ligne) : tapée sur une ligne", JSON.stringify(rec.title));
  const supprimeLe = "2026-10-24T16:52:54.000Z";
  const copie = { vinted_item_id: "10514173498", titre: TITRE_COLLE, photo_ts: Math.floor(Date.parse("2026-10-24T16:53:05Z") / 1000), statut: "active" };
  const r = B.reconnaitreAnnonceRecreee([copie], { titre: TITRE_NL, deletedAt: supprimeLe, idsConnus: new Set() });
  ok(r.item?.vinted_item_id === "10514173498", "la copie « …lycanthropePar… » est reconnue (c'est elle qui manquait avant le 2e envoi)", JSON.stringify(r));
  const deux = B.reconnaitreAnnonceRecreee([copie, { ...copie, vinted_item_id: "10514978864" }], { titre: TITRE_NL, deletedAt: supprimeLe, idsConnus: [] });
  ok(!deux.item && /2 annonces correspondent/.test(deux.raison), "deux copies : abstention (jamais une 3e)");
  ok(!B.reconnaitreAnnonceRecreee([{ ...copie, titre: "Champavert tome 2" }], { titre: TITRE_NL, deletedAt: supprimeLe, idsConnus: [] }).item, "autre titre : rien");
  ok(!B.reconnaitreAnnonceRecreee([copie], { titre: TITRE_NL, deletedAt: "2026-10-24T17:00:00Z", idsConnus: [] }).item, "photos antérieures au retrait : rien (le titre ne prouve jamais seul)");
  ok(B.reconnaitreAnnonceRecreee([copie], { titre: "", deletedAt: supprimeLe, idsConnus: [] }).raison === "titre de référence vide", "titre de référence vide : rien");
}
{
  const f = extraireFonctionJs(BG, "vintedUploadSucceededForTitle");
  ok(/memeTitre\(title, c\.succesVinted\.titre\)/.test(f), "la sonde (réponse de Vinted) compare par memeTitre");
}

console.log("\n4. get-pending-jobs : le titre servi sur une ligne, à toutes les versions");
{
  const GPJ = lire("supabase/functions/get-pending-jobs/index.ts");
  const i = GPJ.indexOf("// ── (25/10, N3) UN TITRE VINTED SERVI N'A JAMAIS DE SAUT DE LIGNE");
  const j = GPJ.indexOf("// ── « UNIVERS » ET « PRODUIT » LEBONCOIN", i);
  const bloc = i > 0 && j > i ? GPJ.slice(i, j) : "";
  ok(bloc.length > 0, "bloc trouvé");
  ok(GPJ.indexOf("LA LIMITE EXACTE DE VINTED : 7 CAPITALES") > 0 && GPJ.indexOf("LA LIMITE EXACTE DE VINTED : 7 CAPITALES") < i, "placé APRÈS la casse (qui pose titre_saisi depuis la copie)");
  ok(/if \(typeof j\.title === "string" && titreAUnSautDeLigne\(j\.title\)\) \{\s*j\.title = titreSansSautDeLigne\(j\.title\);/.test(bloc), "job.title servi sur une ligne (publication ET republication)");
  ok(/const source = saisi\.trim\(\) \? saisi : capture;/.test(bloc) && /\.\.\.pfJ, titre_saisi: apres,/.test(bloc) && /titre_sans_saut_de_ligne: \{/.test(bloc),
    "recréation : titre_saisi servi (lu par l'extension ≥ 0.6.128 avant le titre capturé), trace titre_sans_saut_de_ligne");
  ok(/j\.platform !== "vinted"/.test(bloc) && !/\.update\(/.test(bloc), "Vinted seulement, rien écrit en base");
  ok(/import \{ titreSansSautDeLigne, titreAUnSautDeLigne \} from "\.\.\/_shared\/titre-copie-vinted\.js";/.test(GPJ), "même module que l'extension");
  // La règle servie, rejouée sur la forme réelle du job (republication, copie servie depuis la capture).
  const pfJ = { republish_step: "captured", republish_snapshot: { titre: TITRE_NL, servi_par_le_serveur: true } };
  const saisi = "";
  const source = saisi.trim() ? saisi : pfJ.republish_snapshot.titre;
  ok(M.titreAUnSautDeLigne(source) && M.titreSansSautDeLigne(source) === "Champavert, le lycanthrope Par Pétrus Borel"
    && B.titreSaisiRecreation({ titre_saisi: M.titreSansSautDeLigne(source) }) === "Champavert, le lycanthrope Par Pétrus Borel",
    "titre_saisi servi = le titre que l'extension ≥ 0.6.128 tape et compare");
}

console.log("\n5. Le titre relu dans le champ (titre_pose) et la copie comparée à lui");
{
  const VT = lire("chrome-extension/content-scripts/vinted.js");
  ok(/await fillTextField\('#title, \[data-testid="title--input"\]', job\.title\);\s*return document\.querySelector\('#title, \[data-testid="title--input"\]'\)\?\.value \?\? null;/.test(VT)
    && /if \(typeof lu === "string" && lu\.trim\(\)\) titrePose = lu;/.test(VT), "vinted.js relit le champ après la frappe (titre_pose = el.value)");
  ok(/\.\.\.\(typeof titrePose === "string" \? \{ titre_pose: titrePose\.slice\(0, 200\) \} : \{\}\)/.test(VT), "titre_pose rendu dans le résultat (succès comme échec)");
  const conclure = extraireFonctionJs(BG, "conclureRecreationApresSoumission");
  ok(/const titreCopie = \(typeof result\?\.titre_pose === "string" && result\.titre_pose\.trim\(\)\) \? result\.titre_pose : jobRecreation\.title;/.test(conclure)
    && /vintedUploadSucceededForTitle\(tabId, titreCopie\)/.test(conclure) && /titre: titreCopie, pf,/.test(conclure),
    "après l'envoi, la sonde et la ceinture dressing comparent au titre relu (sinon au titre tapé)");
}

console.log("\n6. Des messages vrais après un envoi d'issue inconnue");
{
  const f = extraireFonctionJs(BG, "retenirDepotIncertain");
  ok(/FillSell vérifie que ta nouvelle annonce est bien " \+\s*"en ligne avant tout nouvel envoi\. Rien à faire de ton côté\./.test(f), "extension : « FillSell vérifie que ta nouvelle annonce est bien en ligne avant tout nouvel envoi »");
  ok(!/rien n'est redéposé entre-temps/.test(f), "plus jamais « rien n'est redéposé entre-temps » (c'était faux : redéposé à 19:46:01)");
  const UJS = lire("supabase/functions/update-job-status/index.ts");
  const i = UJS.indexOf("if (G1_RE.test(brut)) {");
  const g1 = UJS.slice(i, UJS.indexOf("} else if (G4A_RE.test(brut)) {", i));
  ok(i > 0 && /MARQUES_RETRAIT_OU_DEPOT\.some\(\(k\) => p\[k\] != null && p\[k\] !== false\)/.test(g1) && /jG1\?\.action === "republish"/.test(g1),
    "update-job-status : une republication retirée (étape 'deleted' ou trace de retrait/envoi, base OU écriture) est reconnue");
  const m = g1.match(/\? "L'opération n'a pas pu aboutir sur ton ordinateur : ton annonce a été retirée[\s\S]*?jamais deux annonces\."/);
  const texte = m ? m[0].replace(/"\s*\+\s*"/g, "").replace(/^\? "/, "").replace(/"$/, "") : "";
  ok(texte && !/relance/i.test(texte) && /vérifie qu'elle n'est pas déjà en ligne avant tout nouvel envoi/.test(texte), "…et son message ne dit jamais « Relance-la »", texte);
  ok(texte && CANAL_RE.test(texte), "le message reste reconnu comme une coupure (etat-job, CANAL_RE)");
  ok(/: "L'opération n'a pas pu aboutir sur ton ordinateur\. Relance-la depuis la fiche de l'article quand tu veux\.";/.test(g1), "hors retrait : le texte d'avant, inchangé");
}

if (ko) { console.error(`\n✗ ${ko}/${n} échec(s)`); process.exit(1); }
console.log(`\n${n}/${n} vérifications\n✓ selftest titre-copie-vinted : OK`);
