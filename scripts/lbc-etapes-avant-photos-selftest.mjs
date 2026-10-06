// ═══════════════════════════════════════════════════════════════════════════
// Selftest « pages avant les photos » — DÉPÔT LEBONCOIN (2026-10-06, Glowik)
//   node scripts/lbc-etapes-avant-photos-selftest.mjs [chemin/vers/leboncoin.js]
//
// LE CAS : Glowik, « Gomme de musculation pour la mâchoire », rayon choisi
// « Matériel professionnel > Équipements pour commerces & marchés » (job
// 2c38bff2, 3 échecs en 0.6.100 : « input[type=file] introuvable même après
// avance du wizard paginé »). Relevé le 06/10 dans le Chrome de Nico : sur ce
// rayon, le dépôt enchaîne catégorie → « Décrivez votre bien ! » (description
// OBLIGATOIRE) → « Quel est votre prix ? » → « Ajoutez des photos » → « Où se
// situe votre bien ? ». « Continuer » sur une description vide ne passe pas.
// CE QUE CE TEST PROUVE, sur les fonctions RÉELLES de leboncoin.js (extraites,
// jamais recopiées) :
//   1. ce rayon : la description puis le prix sont posés sur leurs pages, la
//      page des photos est atteinte, les deux marqueurs sont levés ;
//   2. un rayon standard (photos tout de suite) : aucun « Continuer », rien
//      n'est rempli en avance — comportement d'avant ;
//   3. le flux paginé connu (Divers : Type d'annonce → photos) : un clic, rien
//      de rempli ;
//   4. une page qui refuse malgré tout : trois clics, null — comme avant.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonction } from "./lib/vinted-taille-bac.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHEMIN = process.argv[2] ?? join(ROOT, "chrome-extension/content-scripts/leboncoin.js");
const SRC = readFileSync(CHEMIN, "utf8");

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// ── Un faux wizard : des pages, chacune avec ses champs et sa garde ─────────
function wizard(pages) {
  let i = 0;
  const journal = [];
  const champs = {
    body: { value: "", tag: "TEXTAREA", matches: (s) => /#body/.test(s), blur() {}, dispatchEvent() {} },
    price: { value: "", matches: () => false, blur() {}, dispatchEvent() {} },
    file: { matches: () => false },
    location: { matches: () => false },
  };
  const continuer = {
    textContent: "Continuer",
    click() {
      const p = pages[i];
      journal.push(`continuer@${p.nom}`);
      if (p.exige === "body" && !champs.body.value.trim()) { journal.push("refus:description_vide"); return; }
      if (p.exige === "price" && !String(champs.price.value).trim()) { journal.push("refus:prix_vide"); return; }
      if (p.exige === "bloque") { journal.push("refus:bloque"); return; }
      if (i < pages.length - 1) i++;
    },
  };
  const document = {
    querySelector(sel) {
      const p = pages[i];
      if (sel === 'input[type="file"]') return p.champs.includes("file") ? champs.file : null;
      if (sel === "textarea#body, #body") return p.champs.includes("body") ? champs.body : null;
      if (sel === "#price_cents") return p.champs.includes("price") ? champs.price : null;
      if (sel === 'label[for="location"]') return p.champs.includes("location") ? champs.location : null;
      return null;
    },
    querySelectorAll(sel) { return sel.includes("button") ? [continuer] : []; },
  };
  return { document, journal, champs, page: () => pages[i].nom };
}

function charger(document) {
  const corps = [
    extraireFonction(SRC, "waitFor"),
    extraireFonction(SRC, "findButtonByExactText"),
    extraireFonction(SRC, "advanceWizardTo"),
    /^const ETAPES_AVANT_PHOTOS = .+;$/m.exec(SRC)?.[0] ?? "const ETAPES_AVANT_PHOTOS = { absent: true };",
    (() => { try { return extraireFonction(SRC, "remplirEtapeAvantPhotos"); } catch { return "async function remplirEtapeAvantPhotos() {}"; } })(),
    "return { advanceWizardTo, remplirEtapeAvantPhotos, ETAPES_AVANT_PHOTOS };",
  ].join("\n");
  const typeInto = async (el, t) => { el.value = String(t); };
  const setFieldValue = (el, v) => { el.value = String(v); };
  const noop = async () => {};
  return new Function("document", "sleep", "humanPause", "typeInto", "setFieldValue", "relayerEtape", "console", corps)(
    document, noop, noop, typeInto, setFieldValue, () => {}, { log() {}, warn() {}, error() {} },
  );
}
const JOB = { title: "Gomme de musculation pour la mâchoire", description: "Gomme de musculation, neuve.", price: 12 };

console.log("\n[1] Glowik — rayon « Équipements pour commerces & marchés » : description → prix → photos");
{
  const w = wizard([
    { nom: "decrivez", champs: ["body"], exige: "body" },
    { nom: "prix", champs: ["price"], exige: "price" },
    { nom: "photos", champs: ["file"] },
    { nom: "adresse", champs: ["location"] },
  ]);
  const b = charger(w.document);
  const el = await b.advanceWizardTo('input[type="file"]', { probeMs: 50, avantContinuer: () => b.remplirEtapeAvantPhotos(JOB) });
  ok("la page des photos est atteinte", el === w.champs.file, `page=${w.page()} journal=${w.journal.join(",")}`);
  ok("   description posée sur sa page (celle de la fiche)", w.champs.body.value === JOB.description, w.champs.body.value);
  ok("   prix posé sur sa page (12)", w.champs.price.value === "12", w.champs.price.value);
  ok("   aucun refus de Leboncoin", !w.journal.some((x) => x.startsWith("refus")), w.journal.join(","));
  ok("   marqueurs levés : description et prix déjà posés", b.ETAPES_AVANT_PHOTOS.description === true && b.ETAPES_AVANT_PHOTOS.prix === true, JSON.stringify(b.ETAPES_AVANT_PHOTOS));
}

console.log("\n[2] Rayon standard : les photos sont là tout de suite — rien ne change");
{
  const w = wizard([{ nom: "photos", champs: ["file"] }, { nom: "apercu", champs: ["body", "price", "location"] }]);
  const b = charger(w.document);
  const el = await b.advanceWizardTo('input[type="file"]', { probeMs: 50, avantContinuer: () => b.remplirEtapeAvantPhotos(JOB) });
  ok("photos trouvées sans un clic", el === w.champs.file && w.journal.length === 0, w.journal.join(","));
  ok("   rien rempli en avance", w.champs.body.value === "" && w.champs.price.value === "" && !b.ETAPES_AVANT_PHOTOS.description && !b.ETAPES_AVANT_PHOTOS.prix);
}

console.log("\n[3] Flux paginé connu (Divers > Autres : Type d'annonce → photos)");
{
  const w = wizard([{ nom: "type_annonce", champs: [] }, { nom: "photos", champs: ["file"] }, { nom: "decrivez", champs: ["body"] }]);
  const b = charger(w.document);
  const el = await b.advanceWizardTo('input[type="file"]', { probeMs: 50, avantContinuer: () => b.remplirEtapeAvantPhotos(JOB) });
  ok("un clic « Continuer », photos atteintes", el === w.champs.file && w.journal.filter((x) => x.startsWith("continuer")).length === 1, w.journal.join(","));
  ok("   rien rempli en avance (la description viendra après les photos)", w.champs.body.value === "" && !b.ETAPES_AVANT_PHOTOS.description);
}

console.log("\n[4] Une page qui refuse malgré tout : trois clics, puis null (comme avant)");
{
  const w = wizard([{ nom: "mur", champs: [], exige: "bloque" }, { nom: "photos", champs: ["file"] }]);
  const b = charger(w.document);
  const el = await b.advanceWizardTo('input[type="file"]', { probeMs: 50, avantContinuer: () => b.remplirEtapeAvantPhotos(JOB) });
  ok("null après trois « Continuer »", el === null && w.journal.filter((x) => x.startsWith("continuer")).length === 3, w.journal.join(","));
}

console.log(ko ? `\n[selftest:lbc-etapes-avant-photos] ÉCHEC — ${ko} vérification(s) en défaut.` : "\n[selftest:lbc-etapes-avant-photos] OK");
process.exit(ko ? 1 : 0);
