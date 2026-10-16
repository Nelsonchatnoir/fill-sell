// Selftest — UNE REPUBLICATION NE RETIRE JAMAIS AVANT D'AVOIR VÉRIFIÉ QUE LA
// RECRÉATION PEUT ALLER AU BOUT (11/10, point 4 — voirememe, job 66bbae2b).
//
// Le cas : republication Leboncoin, annonce RETIRÉE à 12:03:36, puis recréation
// bloquée sur le critère obligatoire « Produit » (toy_type, Jeux & Jouets, 29
// valeurs), absent de l'annonce d'origine — article hors ligne. Leboncoin ne
// découvre ses requis qu'au remplissage ; Depop pose ses questions (marque,
// taille…) après la suppression.
// La règle, même contrat que le pré-vol Beebs :
//   · Leboncoin et Depop font tourner le VRAI remplisseur en mode
//     republish_prevol_only AVANT le retrait — Leboncoin jusqu'au « Continuer »
//     des critères (photos comprises), Depop jusqu'aux photos (exclues) ;
//   · un champ à choisir → needs_user AVANT tout retrait, annonce en ligne ;
//   · pas de preuve → pending +30 min, aucun essai consommé, rien retiré ;
//   · aucun dépôt pendant le pré-vol, rien laissé chez Leboncoin ;
//   · le poste le déclare : capacité « prevol_recreation_v1 » ;
//   · aucune valeur devinée (le repli « Autre » n'est pas étendu) ; Beebs inchangé.
// Les fonctions sont EXTRAITES des fichiers de l'extension, jamais recopiées.
//
//   node scripts/prevol-recreation-lbc-depop-selftest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const bg = lire("chrome-extension/background.js");
const lbc = lire("chrome-extension/content-scripts/leboncoin.js");
const dp = lire("chrome-extension/content-scripts/depop.js");

let n = 0;
const log = console.log;
const ok = (m) => { n++; log(`  ✓ ${m}`); };

// ── 1. Le verdict (pur) ──────────────────────────────────────────────────────
const reExc = bg.match(/^const EXCEPTION_JS_RE = (\/.*\/);$/m)?.[1];
assert.ok(reExc, "EXCEPTION_JS_RE présent");
const verdictPrevolRecreation = new Function(`const EXCEPTION_JS_RE = ${reExc};\n${extraireFonctionJs(bg, "verdictPrevolRecreation")}\nreturn verdictPrevolRecreation;`)();
const PRODUIT_JOUETS = ["Jeux de construction", "Jouets d'éveil", "Peluches", "Poupées", "Jeux de société", "Puzzles",
  "Figurines", "Véhicules", "Jeux d'extérieur", "Déguisements", "Instruments de musique", "Loisirs créatifs", "Jeux vidéo",
  "Circuits", "Trains", "Robots", "Jeux éducatifs", "Cuisines et dînettes", "Bricolage", "Maisons de poupées",
  "Jeux de cartes", "Jeux d'adresse", "Jouets en bois", "Billes", "Toupies", "Jeux de bain", "Porteurs", "Trottinettes", "Autre"];
assert.equal(PRODUIT_JOUETS.length, 29);
const BLOQUE_PRODUIT = {
  success: false, needsUser: true,
  error: "Leboncoin demande : Produit (« Ce champ est requis »). Renseigne-le dans FillSell…",
  unfilledRequired: ["Produit"],
  needsUserField: { field_key: "toy_type", field_label: "Produit", target: { root: "lbcAspects", key: "toy_type" }, input_type: "dropdown", allowed_values: PRODUIT_JOUETS },
};
const cas = [
  [{ success: true, republishPreflight: true, unfilledRequired: [] }, "ok"],
  [{ success: true, republishPreflight: true }, "ok"],
  [{ success: true }, "illisible"],
  [{ success: true, listingUrl: "https://www.leboncoin.fr/ad/jeux_jouets/1" }, "illisible"],
  [{ success: true, republishPreflight: true, unfilledRequired: ["univers"] }, "illisible"],
  [BLOQUE_PRODUIT, "champ_a_choisir"],
  [{ success: false, needsUser: true, needsUserField: { field_key: "depopMarque", field_label: "Marque (Depop)" } }, "champ_a_choisir"],
  [{ success: false, needsUser: true, draftBlocked: true, draftDiscarded: true, error: "Brouillon Leboncoin abandonné" }, "brouillon_jete"],
  [{ success: false, needsUser: true, error: "Connexion Leboncoin requise : se connecter sur leboncoin.fr" }, "session"],
  [{ success: false, needsUser: true, sessionPage: "morte", error: "Connexion Depop requise : ta session…" }, "session"],
  [{ success: false, needsUser: true, attenteUtilisateur: true, attenteMotif: "depop_vendeur_a_configurer", error: "Active la vente…" }, "attente_utilisateur"],
  [{ success: false, error: "Cannot read properties of undefined (reading 'x')" }, "defaut_fillsell"],
  [{ success: false, needsUser: true, error: "CHALLENGE DATADOME : Leboncoin affiche une vérification anti-robot" }, "illisible"],
  [{ success: false, error: "Timeout: pas de réponse du content script" }, "illisible"],
  [null, "illisible"],
];
for (const [r, attendu] of cas) assert.equal(verdictPrevolRecreation(r), attendu, JSON.stringify(r)?.slice(0, 120));
ok(`verdict : ${cas.length} cas — preuve seule autorise ; champ → question ; session ; attente ; brouillon ; sinon illisible`);

// ── 2. Simulation de prevolRecreationAvantRetrait ───────────────────────────
const tracerGarde = new Function(`${extraireFonctionJs(bg, "tracerGarde")}\nreturn tracerGarde;`)();
const domaines = bg.match(/^const DOMAINE_PREVOL_RECREATION = (\{[^\n]*\});$/m)?.[1];
assert.ok(domaines, "DOMAINE_PREVOL_RECREATION présent");
function monter(resultatPrevol) {
  const j = { statuts: [], questions: [], murs: [], attentes: [], prevols: 0 };
  const ctx = {
    prevolFormulaireRecreation: async (job) => {
      j.prevols++;
      j.jobPrevol = job;
      if (resultatPrevol instanceof Error) throw resultatPrevol;
      return { tabId: 7, result: resultatPrevol };
    },
    persistDiscoveredAspects: async () => {},
    verdictPrevolRecreation, tracerGarde,
    markNeedsUser: async (_t, job, r) => { j.questions.push({ pf: job.platform_fields, r }); },
    traiterMurDeConnexion: async (_t, job, r, msg) => { j.murs.push({ job, r, msg }); },
    marquerAttenteUtilisateur: async (_t, job, r) => { j.attentes.push({ job, r }); },
    updateJobStatus: async (_t, id, status, extra) => { j.statuts.push({ id, status, extra }); },
    motifLisible: (s) => String(s ?? ""),
    VO: { navigateurCourt: () => "Chrome" },
  };
  const fn = new Function("ctx", `
    const { prevolFormulaireRecreation, persistDiscoveredAspects, verdictPrevolRecreation, tracerGarde, markNeedsUser,
      traiterMurDeConnexion, marquerAttenteUtilisateur, updateJobStatus, motifLisible, VO } = ctx;
    const DOMAINE_PREVOL_RECREATION = ${domaines};
    ${extraireFonctionJs(bg, "prevolRecreationAvantRetrait")}
    return prevolRecreationAvantRetrait;
  `)(ctx);
  return { fn, j };
}
const jobVoirememe = () => ({ id: "66bbae2b", platform: "leboncoin", action: "republish", title: "Lot de jouets", platform_fields: { republish_step: "captured" } });
console.log = () => {}; console.warn = () => {};
let sorties;
try {
  // a. voirememe : « Produit » à choisir → question AVANT tout retrait.
  {
    const { fn, j } = monter(BLOQUE_PRODUIT);
    const job = jobVoirememe(); const pf = { ...job.platform_fields };
    const r = await fn({ accessToken: "t", job, pf, label: "Leboncoin" });
    assert.equal(r.status, "needsUser");
    assert.equal(j.questions.length, 1);
    const q = j.questions[0];
    assert.equal(q.r.needsUserField.field_key, "toy_type");
    assert.deepEqual(q.r.needsUserField.target, { root: "lbcAspects", key: "toy_type" });
    assert.equal(q.r.needsUserField.allowed_values.length, 29);
    assert.match(q.r.error, /mise en pause AVANT tout retrait, ton annonce est toujours en ligne/);
    assert.match(q.r.error, /« Produit »/);
    assert.equal(q.pf.gardes.prevol_formulaire_recreation.verdict, "champ_a_choisir");
    assert.equal(j.statuts.length, 0, "aucune autre écriture (ni processing, ni retrait)");
    assert.equal(j.jobPrevol.platform_fields.republish_step, "captured");
    sorties = r;
    ok("voirememe : « Produit » (toy_type, 29 valeurs, cible lbcAspects.toy_type) demandé AVANT tout retrait");
  }
  // b. Pas de preuve → pending +30 min, aucun essai consommé.
  for (const [quoi, res] of [["délai dépassé", new Error("Timeout: pas de réponse du content script")], ["page illisible", { success: false, error: "Élément introuvable" }], ["défaut de notre code", { success: false, error: "x is not defined" }]]) {
    const { fn, j } = monter(res);
    const job = jobVoirememe(); const pf = { ...job.platform_fields, needsUserAttempts: 2 };
    const avant = Date.now();
    const r = await fn({ accessToken: "t", job, pf, label: "Leboncoin" });
    assert.equal(r.status, "skipped", quoi);
    assert.equal(j.statuts.length, 1);
    assert.equal(j.statuts[0].status, "pending");
    const pfE = j.statuts[0].extra.platform_fields;
    const d = Date.parse(pfE.next_action_after) - avant;
    assert.ok(d > 29 * 60_000 && d <= 30 * 60_000 + 5_000, `${quoi} : +30 min (${d})`);
    assert.equal(pfE.needsUserAttempts, 2, "aucune tentative consommée");
    assert.equal(j.questions.length + j.murs.length + j.attentes.length, 0);
  }
  ok("pas de preuve (délai, page illisible, défaut FillSell) → pending +30 min, compteur intact, rien retiré");
  // c. Preuve positive → le retrait suit (null), trace « ok ».
  {
    const { fn, j } = monter({ success: true, republishPreflight: true, unfilledRequired: [], discoveredRequired: [] });
    const job = jobVoirememe(); const pf = { ...job.platform_fields, next_action_after: "2026-10-11T00:00:00Z" };
    const r = await fn({ accessToken: "t", job, pf, label: "Leboncoin" });
    assert.equal(r, null);
    assert.equal(pf.republish_prevol_formulaire.verdict, "ok");
    assert.equal(pf.gardes.prevol_formulaire_recreation.verdict, "ok");
    assert.equal(pf.next_action_after, undefined);
    assert.equal(j.statuts.length, 0);
    ok("preuve positive (page suivante affichée) → le retrait peut suivre, trace « ok »");
  }
  // d. Session fermée → attente de connexion ; attente utilisateur → needs_user ; brouillon jeté → 1 min.
  {
    const { fn, j } = monter({ success: false, needsUser: true, sessionPage: "morte", error: "Connexion Depop requise : …" });
    const r = await fn({ accessToken: "t", job: { ...jobVoirememe(), platform: "depop" }, pf: {}, label: "Depop" });
    assert.equal(r.status, "needsUser");
    assert.equal(j.murs.length, 1);
    assert.match(j.murs[0].msg, /^Connexion Depop requise : se connecter sur depop\.com dans Chrome\. La republication repartira toute seule, ton annonce n'a pas été touchée\.$/);
  }
  {
    const { fn, j } = monter({ success: false, needsUser: true, attenteUtilisateur: true, attenteMotif: "depop_vendeur_a_configurer", error: "Active la vente sur Depop." });
    const r = await fn({ accessToken: "t", job: { ...jobVoirememe(), platform: "depop" }, pf: {}, label: "Depop" });
    assert.equal(r.status, "needsUser");
    assert.equal(j.attentes.length, 1);
    assert.match(j.attentes[0].r.error, /^Republication Depop mise en pause AVANT tout retrait, ton annonce est toujours en ligne : Active la vente/);
  }
  {
    const { fn, j } = monter({ success: false, needsUser: true, draftBlocked: true, draftDiscarded: true });
    const avant = Date.now();
    await fn({ accessToken: "t", job: jobVoirememe(), pf: {}, label: "Leboncoin" });
    const d = Date.parse(j.statuts[0].extra.platform_fields.next_action_after) - avant;
    assert.ok(d > 50_000 && d <= 65_000, `brouillon jeté : nouvel essai dans une minute (${d})`);
  }
  ok("session fermée → attente de connexion ; blocage de compte → needs_user dit ; brouillon jeté → nouvel essai dans 1 min");
} finally {
  console.log = log; console.warn = log;
}
void sorties;

// ── 3. Le circuit : pré-vol APRÈS l'invariant, AVANT le retrait ─────────────
const prp = extraireFonctionJs(bg, "processRepublishJobPlateforme");
const iBeebs = prp.indexOf("prevolFormulaireRecreationBeebs({ ...job, platform_fields: pf })");
const iInvariant = prp.indexOf("retenirDerriereAnnonceHorsLigne(accessToken, job, pf, horsLigne[0])");
const iPrevol = prp.indexOf("await prevolRecreationAvantRetrait({ accessToken, job, pf, label })");
const iProcessing = prp.indexOf('await updateJobStatus(accessToken, job.id, "processing", { platform_fields: pf });');
const iRetrait = prp.indexOf("await executerRetraitViaHandler(job, accessToken)");
const iRedepot = prp.indexOf('if (step === "deleted") {');
assert.ok(iBeebs > 0 && iInvariant > iBeebs && iPrevol > iInvariant && iProcessing > iPrevol && iRetrait > iProcessing && iRedepot > iRetrait,
  "Beebs → invariant → pré-vol Leboncoin/Depop → processing → retrait → redépôt");
assert.match(prp.slice(iInvariant, iPrevol + 200), /if \(PLATEFORMES_PREVOL_RECREATION\.includes\(job\.platform\) && !suppressionDejaEnvoyee\(job, pf\)\) \{\s*const refus = await prevolRecreationAvantRetrait\(\{ accessToken, job, pf, label \}\);\s*if \(refus\) return refus;/);
ok("processRepublishJobPlateforme : le pré-vol complet précède le retrait ; un refus rend la main avant lui");
assert.match(bg, /^const PLATEFORMES_PREVOL_RECREATION = \["leboncoin", "depop"\];$/m);
assert.match(prp, /if \(job\.platform === "beebs"\) \{\s*let resultatPrevol = null;/);
ok("Leboncoin et Depop seulement ; le pré-vol Beebs reste le sien, inchangé (Vinted : une-passe)");
const pfr = extraireFonctionJs(bg, "prevolFormulaireRecreation");
assert.match(pfr, /republish_recreation: true,\s*republish_prevol_only: true,/);
assert.match(pfr, /action: "publish",\s*listing_url: null,\s*platform_listing_id: null,/);
assert.match(pfr, /sanitizeJob\(/);
assert.match(pfr, /assurerScriptDepopSurOnglet\(tabId\)/);
assert.match(pfr, /envoyerFillListing\(tabId, jobPrevol\)/);
ok("prevolFormulaireRecreation : le job EXACT de la recréation + republish_prevol_only, par le canal du dépôt");

// ── 4. La capacité déclarée au serveur ──────────────────────────────────────
assert.match(extraireFonctionJs(bg, "capacitesDeclarees"), /const caps = \[[^\]]*"prevol_recreation_v1"[^\]]*\];/);
ok("capacité « prevol_recreation_v1 » déclarée à chaque poll");

// ── 5. leboncoin.js : arrêt après « Continuer », sortie propre, rien de deviné ─
const fl = extraireFonctionJs(lbc, "fillListingForm");
assert.match(fl, /const prevolRecreation = fields\.republish_prevol_only === true;/);
assert.match(fl, /if \(correspond && stadeReprenable && !prevolRecreation\) \{/, "un pré-vol ne reprend jamais un dépôt restauré");
const iRemplir = fl.indexOf("avance = await lbcRemplirJusquAApercu(job, fields, warnings, unfilledRequired);");
const iFin = fl.indexOf("if (prevolRecreation) return await lbcFinPrevolRecreation(avance, { warnings, unfilledRequired, t, trace });");
const iDescription = fl.indexOf('relayerEtape("description");');
const iSubmit = fl.indexOf("submit", iDescription);
assert.ok(iRemplir > 0 && iFin > iRemplir && iDescription > iFin && iSubmit > iFin, "la preuve part AVANT l'étape 4 (description, prix, dépôt)");
assert.match(fl.slice(iRemplir - 200, iFin), /catch \(e\) \{[\s\S]*if \(prevolRecreation\) await lbcQuitterDepotSansEnregistrer\(t\)[\s\S]*throw e;/);
ok("leboncoin.js : titre → catégorie → photos → critères → « Continuer », puis ARRÊT avant description/prix/dépôt");
const lr = extraireFonctionJs(lbc, "lbcRemplirJusquAApercu");
// (16/10) Le pré-vol envoie les photos GRATUITES, comme le futur redépôt : le nombre est lu sur le
// formulaire (selftest:lbc-photos-gratuites) — jamais une photo du pack payant.
assert.match(lr, /if \(job\.photos\?\.length\) \{[\s\S]{0,400}const choixPhotos = photosAEnvoyerLbc\(job\.photos, await lireQuotaPhotosLbcStable\(\)\);[\s\S]{0,300}const photoNote = await uploadPhotos\(photoInput, choixPhotos\.photos\);/, "le pré-vol envoie les photos gratuites (pré-remplissage Leboncoin)");
assert.match(lr, /const continueBtn = findButtonByExactText\("Continuer"\);/);
assert.match(lr, /const repliProduit = \/_product\$\|\^decoration_type\$\/\.test\(forKey\) \? \["Autre", "Autres"\] : \[\];/);
assert.match(lr, /if \(!crit\.required \|\| crit\.filled \|\| !\/_product\$\|\^decoration_type\$\/\.test\(crit\.key\)\) continue;/);
const lrCode = lr.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n"); // sans les commentaires
assert.doesNotMatch(lrCode, /toy_type/, "« Produit » des jouets n'est jamais choisi par nous (aucune valeur en dur)");
ok("leboncoin.js : photos gratuites envoyées ; repli « Autre » limité à *_product / decoration_type (toy_type jamais deviné)");

// Simulation de la sortie : le DOM de Leboncoin, en miniature.
// (11/10, test réel 0.6.109) `etroite` : la mise en page de la fenêtre de
// travail minimisée — le bouton texte « Quitter » est masqué (« hidden!
// lg:block! »), seul le bouton-icône SANS texte, aria-label="Quitter", est
// affiché. La sortie ne le voyait pas (« quitter_introuvable », job 7fbaf36f).
function domLbc({ etroite = false } = {}) {
  const boutons = [];
  const bouton = (texte, onClick, { aria = null, cache = false } = {}) => {
    const b = { textContent: texte, cache, clics: 0, getAttribute: (n) => (n === "aria-label" ? aria : null), click() { this.clics++; onClick?.(); } };
    boutons.push(b); return b;
  };
  const sansEnregistrer = { b: null };
  bouton("Retour"); bouton("Continuer");
  const ouvrir = () => { sansEnregistrer.b ??= bouton("Quitter sans enregistrer"); };
  const quitterTexte = bouton("Quitter", ouvrir, { cache: etroite });
  const quitterIcone = bouton("", ouvrir, { aria: "Quitter", cache: !etroite });
  return { document: { querySelectorAll: () => boutons }, quitter: etroite ? quitterIcone : quitterTexte, autreQuitter: etroite ? quitterTexte : quitterIcone, sansEnregistrer };
}
const monterSortie = (dom) => new Function("ctx", `
  const { document, estVisibleSansLayoutLbc, waitFor } = ctx;
  ${extraireFonctionJs(lbc, "nomsControleLbc")}
  ${extraireFonctionJs(lbc, "boutonLbcParNom")}
  ${extraireFonctionJs(lbc, "lbcQuitterDepotSansEnregistrer")}
  ${extraireFonctionJs(lbc, "lbcFinPrevolRecreation")}
  return lbcFinPrevolRecreation;
`)({ document: dom.document, estVisibleSansLayoutLbc: (b) => !b.cache, waitFor: async (f) => f() ?? null });
console.log = () => {};
try {
  const dom = domLbc();
  const fin = monterSortie(dom);
  const trace = [];
  const r = await fin({ bodyArea: {}, enumerated: [{ key: "toy_type", label: "Produit", filled: true }] },
    { warnings: ["w"], unfilledRequired: ["produit"], t: (l) => trace.push(l), trace });
  assert.equal(r.success, true); assert.equal(r.republishPreflight, true);
  assert.deepEqual(r.unfilledRequired, []); assert.deepEqual(r.requisNonBloquants, ["produit"]);
  assert.equal(r.prevolRecreation.brouillon_jete, true);
  assert.equal(dom.quitter.clics, 1);
  assert.equal(dom.sansEnregistrer.b.clics, 0, "le clic qui navigue part APRÈS la réponse");
  await new Promise((res) => setTimeout(res, 250));
  assert.equal(dom.sansEnregistrer.b.clics, 1);
  assert.equal(verdictPrevolRecreation(r), "ok");

  const dom2 = domLbc();
  const r2 = await monterSortie(dom2)({ blocked: BLOQUE_PRODUIT }, { warnings: [], unfilledRequired: ["Produit"], t: () => {}, trace: [] });
  assert.equal(r2.success, false); assert.equal(r2.needsUserField.field_key, "toy_type");
  assert.equal(r2.prevolRecreation.brouillon_jete, true);
  await new Promise((res) => setTimeout(res, 250));
  assert.equal(dom2.sansEnregistrer.b.clics, 1, "même bloqué, rien n'est laissé chez Leboncoin");
  assert.equal(verdictPrevolRecreation(r2), "champ_a_choisir");

  const sansQuitter = { document: { querySelectorAll: () => [{ textContent: "Continuer", getAttribute: () => null, click() { throw new Error("jamais"); } }] } };
  const r3 = await monterSortie(sansQuitter)({ bodyArea: {}, enumerated: [] }, { warnings: [], unfilledRequired: [], t: () => {}, trace: [] });
  assert.equal(r3.prevolRecreation.brouillon_jete, false);
  assert.equal(r3.prevolRecreation.motif_sortie, "quitter_introuvable");

  // Fenêtre de travail minimisée (mise en page étroite) : le bouton-icône
  // aria-label « Quitter » est LE bouton — preuve ET champ bloquant.
  for (const avance of [{ bodyArea: {}, enumerated: [] }, { blocked: BLOQUE_PRODUIT }]) {
    const domE = domLbc({ etroite: true });
    const rE = await monterSortie(domE)(avance, { warnings: [], unfilledRequired: [], t: () => {}, trace: [] });
    assert.equal(rE.prevolRecreation.brouillon_jete, true, "fenêtre étroite : la sortie trouve le bouton-icône");
    assert.equal(rE.prevolRecreation.motif_sortie, undefined);
    assert.equal(domE.quitter.clics, 1, "le bouton-icône aria-label=\"Quitter\" est cliqué");
    assert.equal(domE.autreQuitter.clics, 0, "jamais le bouton masqué");
    await new Promise((res) => setTimeout(res, 250));
    assert.equal(domE.sansEnregistrer.b.clics, 1);
  }
} finally {
  console.log = log;
}
ok("sortie du wizard : « Quitter » → « Quitter sans enregistrer » (clic différé après la réponse), preuve ou champ bloquant rendus ; fenêtre étroite : bouton-icône aria-label ; sans bouton, on le dit");

// Même règle partout où leboncoin.js cherche « Quitter » : par le NOM
// (boutonLbcParNom), jamais par offsetParent (nul en fenêtre minimisée) ni par
// le seul texte — le chemin « brouillon bloquant » compris.
{
  const code = lbc.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  assert.doesNotMatch(code, /offsetParent !== null && \/\^?quitter/i, "aucun « Quitter » cherché par offsetParent");
  assert.doesNotMatch(code, /\/\^quitter\$\/i\.test\(\(b\.textContent/, "aucun « Quitter » cherché par son seul texte");
  const fl2 = extraireFonctionJs(lbc, "fillListingForm");
  assert.match(fl2, /const btnQuitter = boutonLbcParNom\(\/\^quitter\$\/i\);/);
  assert.match(fl2, /waitFor\(\(\) => boutonLbcParNom\(\/quitter sans enregistrer\/i\), 5000\)/);
  const nomsDe = new Function(`${extraireFonctionJs(lbc, "nomsControleLbc")}\nreturn nomsControleLbc;`)();
  assert.deepEqual(nomsDe({ textContent: "  ", getAttribute: (n) => (n === "aria-label" ? "Quitter" : null) }), ["Quitter"]);
  assert.deepEqual(nomsDe({ textContent: " Quitter\n", getAttribute: () => null }), ["Quitter"]);
}
ok("leboncoin.js : tout « Quitter » (pré-vol, brouillon bloquant, diagnostic) se trouve par son nom accessible, sans offsetParent");

// ── 6. depop.js : arrêt juste avant les photos ──────────────────────────────
const fd = extraireFonctionJs(dp, "fillListingForm");
const iMarque = fd.indexOf("depopResoudreMarque(pf, referentiel)");
const iTaille = fd.indexOf("depopResoudreTaille(pf, v.chemin");
const iLieu = fd.indexOf("const lieu = await depopLieu(session.pays);");
const iArret = fd.indexOf("if (pf.republish_prevol_only === true) {");
const iPhotos = fd.indexOf('depopEtape("photos");');
const iMonter = fd.indexOf("depopMonterPhoto(");
const iCreer = fd.indexOf("DEPOP_ENDPOINTS.creer");
assert.ok(iMarque > 0 && iTaille > iMarque && iLieu > iTaille && iArret > iLieu && iPhotos > iArret && iMonter > iPhotos && iCreer > iMonter,
  "marque → taille → lieu → ARRÊT → photos → création");
assert.match(fd.slice(iArret, iPhotos), /return depopSortie\(\{ success: true, republishPreflight: true, unfilledRequired: \[\]/);
ok("depop.js : marque, taille, lieu tranchés, arrêt AVANT les photos (rien n'est créé chez Depop)");

// Simulation : le vrai fillListingForm de Depop, le réseau remplacé.
async function depopAvec({ marque = { id: "nike", nom: "Nike" }, taille = { idGrille: 1, idTaille: 2, libelle: "M" } } = {}) {
  const appels = { photos: 0, json: 0 };
  const fn = new Function("ctx", `
    const { DEPOP_ACTIF, DEPOP_PAYS_EURO, DEPOP_MSG_SESSION, DEPOP_MSG_VENDEUR, depopEtape, depopTracer, depopSortie, depopSession,
      depopStatutVendeur, depopPrevol, depopAttributs, depopGrilles, depopResoudreMarque, depopResoudreTaille, depopRegion,
      depopLieu, depopMonterPhoto, depopValiderPhotos, depopJson, DEPOP_ENDPOINTS, depopUuid, depopAttendre, DEPOP_PAUSE_MS, depopUrlPublique } = ctx;
    ${fd}
    return fillListingForm;
  `)({
    DEPOP_ACTIF: true, DEPOP_PAYS_EURO: new Set(["FR"]), DEPOP_MSG_SESSION: "Connexion Depop requise", DEPOP_MSG_VENDEUR: "vendeur",
    depopEtape: () => {}, depopTracer: () => {}, depopSortie: ({ t0, ...r }) => r,
    depopSession: async () => ({ connecte: true, pays: "FR", id: 1 }), depopStatutVendeur: async () => ({ canSell: true }),
    depopPrevol: () => ({ ok: true, chemin: ["womenswear", "tops", "t-shirts"], photos: ["https://x/1.jpg"], description: "d", prix: 10, etat: "used_good", port: 5, quantite: 1, couleurs: [] }),
    depopAttributs: async () => ({}), depopGrilles: async () => ({}),
    depopResoudreMarque: () => marque, depopResoudreTaille: () => taille, depopRegion: () => "EU",
    depopLieu: async () => ({ address: "Paris", countryCode: "FR", geoLat: 1, geoLng: 2 }),
    depopMonterPhoto: async () => { appels.photos++; return 1; }, depopValiderPhotos: async () => true,
    depopJson: async () => { appels.json++; return { ok: true, statut: 201, corps: { id: 9, slug: "s" } }; },
    DEPOP_ENDPOINTS: { creer: "c", produit: () => "p" }, depopUuid: () => "u", depopAttendre: async () => {}, DEPOP_PAUSE_MS: 0,
    depopUrlPublique: (s) => `https://www.depop.com/products/${s}/`,
  });
  return { fn, appels };
}
{
  const { fn, appels } = await depopAvec();
  const r = await fn({ id: "d1", platform_fields: { republish_recreation: true, republish_prevol_only: true } });
  assert.equal(r.success, true); assert.equal(r.republishPreflight, true);
  assert.equal(appels.photos, 0, "aucune photo envoyée"); assert.equal(appels.json, 0, "aucune création");
  assert.equal(verdictPrevolRecreation(r), "ok");
  const q = await depopAvec({ marque: { question: { field_key: "depopMarque", field_label: "Marque (Depop)", input_type: "text", explication: "« Zzz » n'est pas dans la liste" } } });
  const rq = await q.fn({ id: "d2", platform_fields: { republish_recreation: true, republish_prevol_only: true } });
  assert.equal(verdictPrevolRecreation(rq), "champ_a_choisir");
  assert.equal(q.appels.photos + q.appels.json, 0);
  const pub = await depopAvec();
  const rp = await pub.fn({ id: "d3", platform_fields: {} });
  assert.equal(rp.success, true); assert.ok(rp.listingUrl);
  assert.equal(pub.appels.photos, 1, "une publication normale envoie toujours ses photos");
}
ok("depop : pré-vol → preuve sans photo ni création ; marque hors liste → question avant retrait ; publication normale inchangée");

console.log(`\n✓ prevol-recreation-lbc-depop : ${n} contrôles verts`);
