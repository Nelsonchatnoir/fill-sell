// Selftest — UN 404 DE CAPTURE SOUS UNE IDENTITÉ ILLISIBLE N'EST PAS
// « INTROUVABLE » (11/10, point 5 — Rémi, compte à trois boutiques).
//
// Le cas : la sonde users/current du service worker rend souvent 403 ; la
// garde laissait capturer (« identite_inconnue_capture_seule ») ; la capture
// d'un article de @celineetmarie, Chrome sur @narema75, prenait un 404 (l'adresse
// d'édition du propriétaire ne connaît pas l'annonce) ; traiterIntrouvable404
// Republication rendait « identite_inconnue », le compteur avançait, et au 5e
// 404 le job passait needs_user « introuvable_indetermine » — 10 jobs bloqués,
// annonces EN LIGNE.
// La règle (chez un compte à PLUSIEURS boutiques, boutique de l'article connue) :
//   · l'identité se relit d'abord par l'onglet de travail ;
//   · toujours illisible, ou différente → ATTENTE DE BOUTIQUE : aucun compteur,
//     aucune pause « introuvable » ;
//   · la BONNE boutique → « disparue », chemin inchangé ;
//   · compte à une boutique : inchangé (compteur borné, puis needs_user).
// Les fonctions sont EXTRAITES de background.js, jamais recopiées.
//
//   node scripts/republication-404-boutique-selftest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const bg = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const log = console.log;
const ok = (m) => { n++; log(`  ✓ ${m}`); };

// ── 1. Le verdict (pur) ──────────────────────────────────────────────────────
const verdictIntrouvable404Republication = new Function(
  `${extraireFonctionJs(bg, "verdictIntrouvable404Republication")}\nreturn verdictIntrouvable404Republication;`)();
const CELINE = "88111222", NAREMA = "55444333", JCASSOU = "32977976";
const V = (boutique, identite, multiBoutiques) => verdictIntrouvable404Republication({ boutique, identite, multiBoutiques });
assert.equal(V(CELINE, "", true), "attente_boutique");
assert.equal(V(CELINE, null, true), "attente_boutique");
ok("Rémi : boutique de l'article connue, identité illisible, trois boutiques → ATTENTE de boutique");
assert.equal(V(CELINE, NAREMA, true), "mauvaise_boutique");
ok("une autre boutique ouverte → attente (inchangé)");
assert.equal(V(CELINE, CELINE, true), "disparue");
assert.equal(V(CELINE, CELINE, false), "disparue");
ok("404 sous la BONNE boutique → disparue (chemin inchangé)");
assert.equal(V(CELINE, "", false), "identite_inconnue");
assert.equal(V(CELINE, NAREMA, false), "mauvaise_boutique");
assert.equal(V("", "", false), "disparue");
ok("compte à UNE boutique : verdicts d'avant, à l'identique");
assert.equal(V("", "", true), "boutique_inconnue");
assert.equal(V("", NAREMA, true), "boutique_inconnue");
ok("article sans boutique chez un compte à plusieurs : indéterminé borné (inchangé)");

// ── 2. Simulation de traiterIntrouvable404Republication ─────────────────────
const corps = extraireFonctionJs(bg, "traiterIntrouvable404Republication");
const lireBoutiquesPin = new Function(`${extraireFonctionJs(bg, "lireBoutiquesPin")}\nreturn lireBoutiquesPin;`)();
function monter({ boutiques, ongletRend = null }) {
  const ecrits = [], patchs = [], ongletLu = { n: 0 };
  const ctx = {
    restRequest: async (chemin, _t, opts) => {
      if (chemin.startsWith("profiles?")) return [{ vinted_sync_pin: { v: 2, boutiques } }];
      if (chemin.startsWith("inventaire?") && opts?.method === "PATCH") { patchs.push(chemin); return null; }
      if (chemin.startsWith("inventaire?")) return [{ vinted_account_id: CELINE }];
      throw new Error(`chemin inattendu ${chemin}`);
    },
    updateJobStatus: async (_t, id, status, extra) => { ecrits.push({ id, status, extra: JSON.parse(JSON.stringify(extra)) }); },
    recordRecentResult: async () => {},
    identiteVintedParOnglet: async () => { ongletLu.n++; return ongletRend; },
    identiteVintedCache: { at: 0, val: null },
    lireBoutiquesPin,
    verdictIntrouvable404Republication,
    VO: { navigateurCourt: () => "Chrome", domaineVintedAffiche: () => "vinted.fr" },
  };
  const fn = new Function("ctx", `
    const { restRequest, updateJobStatus, recordRecentResult, identiteVintedParOnglet, identiteVintedCache, lireBoutiquesPin, verdictIntrouvable404Republication, VO } = ctx;
    ${corps}
    return traiterIntrouvable404Republication;
  `)(ctx);
  return { fn, ecrits, patchs, ongletLu };
}
const REMI = [{ user_id: CELINE, login: "celineetmarie" }, { user_id: NAREMA, login: "narema75" }, { user_id: JCASSOU, login: "jcassou" }];
const silence = console.log; console.log = () => {};
try {
  // a. Rémi, identité illisible partout : six 404 de suite → six attentes, jamais needs_user.
  {
    const { fn, ecrits, patchs, ongletLu } = monter({ boutiques: REMI, ongletRend: null });
    const job = { id: "remi-1", inventaire_id: 42 };
    let pf = {};
    for (let i = 0; i < 6; i++) {
      const r = await fn({ accessToken: "t", job, pf, userId: "u", etape: "a_capturer", boutiqueArticle: CELINE, identCourante: null });
      assert.equal(r.status, "skipped", `passage ${i + 1}`);
      pf = ecrits.at(-1).extra.platform_fields;
    }
    assert.ok(ecrits.every((e) => e.status === "pending"), "toujours pending");
    assert.equal(pf.attente_boutique.user_id, CELINE);
    assert.equal(pf.attente_boutique.login, "celineetmarie");
    assert.equal(pf.introuvable_indetermine, undefined, "aucun compteur « indéterminé »");
    assert.equal(pf.needs_user_source, undefined);
    assert.equal(pf.introuvable_404.verdict, "attente_boutique");
    assert.equal(patchs.length, 0, "l'article n'est jamais daté disparu_le");
    assert.equal(ongletLu.n, 6, "l'identité est relue par l'onglet avant chaque verdict");
    const echeance = Date.parse(pf.next_action_after) - Date.now();
    assert.ok(echeance > 14 * 60_000 && echeance <= 15 * 60_000, "échéance 15 min");
    ok("Rémi : six 404 sous une identité illisible → six attentes de @celineetmarie, aucun compteur, jamais needs_user");
  }
  // b. Rémi, l'onglet lit @narema75 → attente de la bonne boutique (mauvaise_boutique).
  {
    const { fn, ecrits } = monter({ boutiques: REMI, ongletRend: { user_id: NAREMA, login: "narema75", source: "onglet" } });
    const r = await fn({ accessToken: "t", job: { id: "remi-2", inventaire_id: 42 }, pf: {}, userId: "u", etape: "a_capturer", boutiqueArticle: CELINE, identCourante: null });
    assert.equal(r.status, "skipped");
    const pf = ecrits[0].extra.platform_fields;
    assert.equal(pf.introuvable_404.verdict, "mauvaise_boutique");
    assert.equal(pf.introuvable_404.identite, NAREMA);
    assert.equal(pf.introuvable_404.source_identite, "onglet");
    assert.equal(pf.attente_boutique.user_id, CELINE);
    ok("Rémi : l'onglet lit @narema75 → attente de @celineetmarie (identité tracée « onglet »)");
  }
  // c. L'onglet lit la BONNE boutique → disparue, chemin inchangé.
  {
    const { fn, ecrits, patchs } = monter({ boutiques: REMI, ongletRend: { user_id: CELINE, login: "celineetmarie", source: "onglet" } });
    const r = await fn({ accessToken: "t", job: { id: "remi-3", inventaire_id: 42 }, pf: {}, userId: "u", etape: "a_capturer", boutiqueArticle: CELINE, identCourante: null });
    assert.equal(r.status, "failed");
    assert.equal(ecrits[0].status, "failed");
    assert.match(ecrits[0].extra.error, /Vinted n'a pas rendu cette annonce/);
    assert.equal(patchs.length, 0, "(15/10, 0.6.113) jamais daté disparu_le sur un 404 seul");
    ok("404 sous la BONNE boutique (lue par l'onglet) → verdict « disparue » rapporté, article jamais daté sur cette seule lecture (le serveur met en pause)");
  }
  // d. Compte à UNE boutique, identité illisible : chemin d'avant (compteur, puis needs_user), onglet jamais lu.
  {
    const { fn, ecrits, ongletLu } = monter({ boutiques: [{ user_id: CELINE, login: "celineetmarie" }], ongletRend: { user_id: NAREMA } });
    let pf = {};
    for (let i = 0; i < 5; i++) {
      await fn({ accessToken: "t", job: { id: "mono", inventaire_id: 42 }, pf, userId: "u", etape: "a_capturer", boutiqueArticle: CELINE, identCourante: null });
      pf = ecrits.at(-1).extra.platform_fields;
    }
    assert.deepEqual(ecrits.map((e) => e.status), ["pending", "pending", "pending", "pending", "needs_user"]);
    assert.equal(pf.needs_user_source, "introuvable_indetermine");
    assert.equal(ongletLu.n, 0, "compte à une boutique : l'onglet n'est pas consulté");
    ok("compte à UNE boutique : inchangé — 4 attentes bornées puis needs_user, onglet jamais lu");
  }
  // e. Identité du service worker lisible et différente : pas besoin de l'onglet.
  {
    const { fn, ecrits, ongletLu } = monter({ boutiques: REMI, ongletRend: null });
    await fn({ accessToken: "t", job: { id: "remi-5", inventaire_id: 42 }, pf: {}, userId: "u", etape: "a_capturer", boutiqueArticle: CELINE, identCourante: { user_id: JCASSOU, login: "jcassou" } });
    assert.equal(ecrits[0].extra.platform_fields.introuvable_404.verdict, "mauvaise_boutique");
    assert.equal(ongletLu.n, 0);
    ok("identité déjà lisible : aucune lecture d'onglet de plus");
  }
} finally {
  console.log = silence;
}

// ── 3. Textes : l'onglet AVANT le verdict, l'attente sans compteur ──────────
const iOnglet = corps.indexOf("await identiteVintedParOnglet()");
const iVerdict = corps.indexOf("const verdict = verdictIntrouvable404Republication(");
assert.ok(iOnglet > 0 && iVerdict > iOnglet, "l'onglet est lu avant de conclure");
assert.match(corps.slice(0, iOnglet), /if \(multiBoutiques && boutique && !identId\) \{\s*const parOnglet = $/,
  "l'onglet n'est lu QUE chez un compte à plusieurs boutiques, boutique connue, identité illisible");
const brancheAttente = corps.slice(corps.indexOf('if (verdict === "mauvaise_boutique" || verdict === "attente_boutique") {'), corps.indexOf('if (verdict === "identite_inconnue" || verdict === "boutique_inconnue") {'));
assert.ok(brancheAttente.length > 50);
assert.doesNotMatch(brancheAttente, /introuvable_indetermine|needs_user|"failed"/);
ok("traiterIntrouvable404Republication : onglet lu avant le verdict ; branche d'attente sans compteur ni needs_user");

// ── 4. La garde de capture ne recapture pas à l'aveugle un job qui attend ───
const prj = extraireFonctionJs(bg, "processRepublishJob");
assert.match(prj, /if \(!identCourante\?\.user_id && String\(pf\.attente_boutique\?\.user_id \?\? ""\) === boutiqueArticle\) \{\s*identCourante = await identiteVintedParOnglet\(\);/);
const iGarde = prj.indexOf("identCourante = await identiteVintedParOnglet();");
const iCapture = prj.indexOf("const cap = await capturerEtPersisterDepuisExtension({");
const iComparaison = prj.indexOf("if (identCourante?.user_id && identCourante.user_id !== boutiqueArticle) {");
assert.ok(iGarde > 0 && iComparaison > iGarde && iCapture > iComparaison);
ok("garde de capture : un job qui attend déjà sa boutique relit l'onglet AVANT de recapturer");

// ── 5. (25/10 nuit, audit N2 — 7e480fce) Sonde publique non mesurée : jamais « toujours en ligne », jamais un mur ──
const ujs = fs.readFileSync(new URL("../supabase/functions/update-job-status/index.ts", import.meta.url), "utf8");
const iArb = ujs.indexOf('} else if (publiqueVivante === true) {');
const iNul = ujs.indexOf('lecture: "item_upload_404_sonde_publique_non_mesuree"');
assert.ok(iArb > 0 && iNul > iArb, "le mur de connexion n'est posé que sur une annonce VUE en ligne (200 public)");
const brancheNulle = ujs.slice(ujs.indexOf("} else {", iArb + 10), iNul + 400);
assert.match(brancheNulle, /pfArb\["needs_user_source"\] = SOURCE_INTROUVABLE;/);
assert.match(brancheNulle, /messageEffectif = messagePause\("vinted"\);/);
assert.doesNotMatch(brancheNulle.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n"), /toujours en ligne|Connexion Vinted requise/);
ok("sonde publique non mesurée → pause « introuvable à confirmer » (le relevé tranche), aucune affirmation");

console.log(`\n✓ republication-404-boutique : ${n} contrôles verts`);
