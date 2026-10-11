// Selftest — LA BOUTIQUE VINTED D'UNE PUBLICATION, RELUE JUSTE AVANT LE DÉPÔT
// (11/10, point 7 — Louis : une remise en vente de @neyenonie partie sur @evat).
//
// Ce qui doit tenir, et qui fait tomber ce test si la règle disparaît :
//   1. la garde n'existe QUE pour une publication Vinted d'un compte à
//      PLUSIEURS boutiques confirmées, dont le job porte sa boutique
//      (platform_fields.vinted_account_id, posé par get-pending-jobs v235) ;
//      compte à une boutique, job sans boutique, recréation, une-passe : rien ;
//   2. le verdict de la page de dépôt (vinted.js) : autre boutique OU identité
//      illisible → aucun dépôt ; la bonne → le dépôt part ;
//   3. vinted.js relit la boutique AVANT le clic de dépôt, et rend sans cliquer ;
//   4. le background : garde posée avant tout formulaire, autre boutique déjà
//      lisible → rien n'est rempli ; refus de la page → attente de boutique
//      (pending, attente_boutique, 15 min), JAMAIS une tentative consommée ;
//   5. la sonde libère aussi les PUBLICATIONS en attente de leur boutique.
// Les fonctions sont EXTRAITES des fichiers de l'extension, jamais recopiées.
//
//   node scripts/publication-boutique-avant-depot-selftest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const bg = lire("chrome-extension/background.js");
const vt = lire("chrome-extension/content-scripts/vinted.js");

let n = 0;
const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

// ── 1. La garde (pure) ───────────────────────────────────────────────────────
const { boutiqueAttendueDepotVinted, gardeBoutiqueDepotVinted, messageAttenteBoutiqueDepot } = new Function([
  ...["boutiqueAttendueDepotVinted", "gardeBoutiqueDepotVinted", "messageAttenteBoutiqueDepot"].map((f) => extraireFonctionJs(bg, f)),
  "return { boutiqueAttendueDepotVinted, gardeBoutiqueDepotVinted, messageAttenteBoutiqueDepot };",
].join("\n"))();

const NEYENONIE = "247512093";
const EVAT = "371531";
const BOUTIQUES_LOUIS = [{ user_id: NEYENONIE, login: "neyenonie" }, { user_id: EVAT, login: "evat" }];
const publication = (pf = {}) => ({ id: "j1", platform: "vinted", action: "publish", platform_fields: { vinted_account_id: NEYENONIE, ...pf } });

assert.deepEqual(gardeBoutiqueDepotVinted(publication(), BOUTIQUES_LOUIS),
  { attendue: NEYENONIE, login_attendu: "neyenonie", multi: true });
ok("Louis (deux boutiques) : la publication part avec sa boutique attendue @neyenonie");
assert.equal(gardeBoutiqueDepotVinted(publication(), [{ user_id: NEYENONIE, login: "neyenonie" }]), null);
assert.equal(gardeBoutiqueDepotVinted(publication(), []), null);
assert.equal(gardeBoutiqueDepotVinted(publication(), null), null);
ok("compte à UNE boutique (ou liste vide) : aucune garde, rien ne change");
assert.equal(gardeBoutiqueDepotVinted(publication(), [{ user_id: NEYENONIE }, { user_id: ` ${NEYENONIE} ` }]), null);
ok("la même boutique listée deux fois reste UNE boutique");
assert.equal(gardeBoutiqueDepotVinted(publication({ vinted_account_id: null }), BOUTIQUES_LOUIS), null);
assert.equal(gardeBoutiqueDepotVinted(publication({ vinted_account_id: "  " }), BOUTIQUES_LOUIS), null);
ok("job sans boutique attendue : jamais bloqué (le serveur pose la question « Boutique Vinted »)");
assert.equal(gardeBoutiqueDepotVinted(publication({ republish_recreation: true }), BOUTIQUES_LOUIS), null);
assert.equal(gardeBoutiqueDepotVinted(publication({ republish_delete_then_submit: { item_id: "1" } }), BOUTIQUES_LOUIS), null);
ok("recréation et une-passe exclues (leur retrait est gardé par sa propre preuve de boutique)");
assert.equal(gardeBoutiqueDepotVinted({ ...publication(), action: "republish" }, BOUTIQUES_LOUIS), null);
assert.equal(gardeBoutiqueDepotVinted({ ...publication(), platform: "leboncoin" }, BOUTIQUES_LOUIS), null);
assert.equal(boutiqueAttendueDepotVinted(publication()), NEYENONIE);
ok("seule une PUBLICATION Vinted est concernée");
const sansLogin = gardeBoutiqueDepotVinted(publication(), [{ user_id: NEYENONIE }, { user_id: EVAT, login: "evat" }]);
assert.equal(sansLogin.login_attendu, null);
ok("pseudo inconnu : login_attendu null (jamais un identifiant à l'écran)");

// ── 2. Le verdict de la page de dépôt (pur, vinted.js) ──────────────────────
const verdictBoutiqueAvantDepotVinted = new Function(`${extraireFonctionJs(vt, "verdictBoutiqueAvantDepotVinted")}\nreturn verdictBoutiqueAvantDepotVinted;`)();
const garde = gardeBoutiqueDepotVinted(publication(), BOUTIQUES_LOUIS);
assert.equal(verdictBoutiqueAvantDepotVinted(garde, { success: true, userId: EVAT, login: "evat" }).verdict, "mauvaise_boutique");
ok("le cas du 11/10 : Chrome sur @evat, article de @neyenonie → mauvaise_boutique (aucun dépôt)");
for (const ident of [
  { success: false, httpStatus: 403, accesRefuse: true, error: "accès refusé par Vinted (HTTP 403)" },
  { success: false, httpStatus: 401, sessionExpiree: true, error: "session Vinted absente ou expirée (HTTP 401)" },
  { success: false, error: "erreur réseau : Failed to fetch" },
  { success: false, sessionExpiree: true, error: "session Vinted anonyme" },
  { success: true, userId: "" },
  null,
]) assert.equal(verdictBoutiqueAvantDepotVinted(garde, ident).verdict, "identite_illisible", JSON.stringify(ident));
ok("identité illisible (401, 403, réseau, anonyme, vide) chez un compte à plusieurs boutiques → aucun dépôt");
assert.equal(verdictBoutiqueAvantDepotVinted(garde, { success: true, userId: NEYENONIE, login: "neyenonie" }).verdict, "boutique_ok");
ok("la bonne boutique ouverte → le dépôt part");
assert.equal(verdictBoutiqueAvantDepotVinted(null, { success: true, userId: EVAT }).verdict, "sans_garde");
assert.equal(verdictBoutiqueAvantDepotVinted({ attendue: NEYENONIE, multi: false }, null).verdict, "sans_garde");
ok("sans garde (mono-boutique) → rien ne change, même identité illisible");

// ── 3. Le texte de la carte ─────────────────────────────────────────────────
const m1 = messageAttenteBoutiqueDepot({ verdict: "mauvaise_boutique", loginAttendu: "neyenonie" });
assert.match(m1, /@neyenonie/); assert.match(m1, /Rien n'a été publié ailleurs/); assert.match(m1, /repartira toute seule/);
const m2 = messageAttenteBoutiqueDepot({ verdict: "identite_illisible", loginAttendu: "neyenonie", navigateur: "Edge" });
assert.match(m2, /n'a pas pu lire quelle boutique est ouverte dans Edge/); assert.match(m2, /Rien n'a été publié/);
const m3 = messageAttenteBoutiqueDepot({ verdict: "mauvaise_boutique", loginAttendu: null });
assert.doesNotMatch(m3, /\d{5,}/);
ok("la carte nomme la boutique à ouvrir, dit que rien n'est parti ailleurs, jamais un numéro");

// ── 4. vinted.js : la page relit la boutique AVANT le clic, et rend sans cliquer ─
const iGarde = vt.indexOf("if (job.boutique_depot && !recreation && !onePass) {");
const iVerdict = vt.indexOf("verdictBoutiqueAvantDepotVinted(job.boutique_depot, identDepot)", iGarde);
const iSoumission = vt.indexOf('marquerPhase("soumission");', iGarde);
const iClic = vt.indexOf("publishBtn.click();", iGarde);
assert.ok(iGarde > 0 && iVerdict > iGarde && iSoumission > iVerdict && iClic > iSoumission,
  "la garde de boutique précède la phase « soumission » et le clic de dépôt");
const blocGarde = vt.slice(iGarde, iSoumission);
assert.match(blocGarde, /await vintedUtilisateurCourant\(\)/, "la page relit users/current elle-même");
assert.match(blocGarde, /verdict === "mauvaise_boutique" \|\| constatBoutique\.verdict === "identite_illisible"/);
assert.match(blocGarde, /return \{\s*success: false,\s*boutiqueDepotRetenue: true,/);
assert.doesNotMatch(blocGarde, /\.click\(\)/, "aucun clic dans la garde");
ok("vinted.js : users/current relu juste avant le clic ; autre boutique ou illisible → retour SANS clic");
const iUnePasse = vt.indexOf("if (onePass?.item_id) {\n    const traceDel");
assert.ok(iUnePasse > 0 && iUnePasse < iGarde, "la garde vient après la une-passe (exclue d'elle) — dernier geste avant le clic");
ok("vinted.js : garde au DERNIER geste (après colis, prix, une-passe)");

// ── 5. background : garde posée AVANT tout formulaire, refus → attente ──────
const pj = extraireFonctionJs(bg, "processJob");
const iPose = pj.indexOf("const gardeBoutique = await gardeBoutiqueDepotVintedDuJob(accessToken, job);");
const iProcessing = pj.indexOf('await updateJobStatus(accessToken, job.id, "processing", { platform_fields: job.platform_fields });');
const iOnglet = pj.indexOf("tabId = await ouvrirOngletTravailJob(");
const iFill = pj.indexOf("result = await envoyerFillListing(tabId, job);");
assert.ok(iPose > 0 && iProcessing > iPose && iOnglet > iPose && iFill > iOnglet, "la garde est posée avant processing, l'onglet et le remplissage");
const blocPose = pj.slice(iPose, iProcessing);
assert.match(blocPose, /job\.boutique_depot = gardeBoutique;/, "la garde part avec le job vers vinted.js");
assert.match(blocPose, /identiteVintedDuCycle\(\{ forcer: true \}\)/, "identité du cycle relue FRAÎCHE");
assert.match(blocPose, /await identiteVintedParOnglet\(\)/, "à défaut, l'identité par l'onglet de travail tel qu'il est");
assert.match(blocPose, /String\(ident\.user_id\) !== gardeBoutique\.attendue\)[\s\S]{0,80}retenirPublicationPourBoutique\(/,
  "une autre boutique lisible → retenue AVANT tout formulaire");
ok("processJob : garde posée avant tout formulaire ; autre boutique déjà lisible → rien n'est rempli");
const iRetenue = pj.indexOf("result?.boutiqueDepotRetenue");
const iNeedsUser = pj.indexOf("} else if (result?.needsUser) {");
assert.ok(iRetenue > iFill && iNeedsUser > iRetenue, "le refus de la page est traité avant tout verdict générique");
assert.match(pj.slice(iRetenue, iRetenue + 400), /return await retenirPublicationPourBoutique\(accessToken, job, job\.boutique_depot,/);
ok("processJob : un refus de la page de dépôt → attente de boutique, avant needs_user/réarmement");

const ret = extraireFonctionJs(bg, "retenirPublicationPourBoutique");
assert.doesNotMatch(ret, /rearmBounded|markNeedsUser|needsUserAttempts|"failed"|"needs_user"/, "jamais une tentative consommée, jamais needs_user/failed");
ok("retenirPublicationPourBoutique ne consomme aucune tentative (ni rearmBounded, ni needs_user, ni failed)");

// Simulation : le job ATTEND sa boutique.
const ecrits = [];
const retenir = new Function("ctx", `
  const { jobStatusNow, updateJobStatus, tracerGarde, VO, messageAttenteBoutiqueDepot } = ctx;
  ${ret}
  return retenirPublicationPourBoutique;
`)({
  jobStatusNow: async () => "processing",
  updateJobStatus: async (_t, id, status, extra) => { ecrits.push({ id, status, extra }); },
  tracerGarde: (pf, nom, d) => { pf.gardes = { ...(pf.gardes ?? {}), [nom]: d }; },
  VO: { navigateurCourt: () => "Chrome", domaineVintedAffiche: () => "vinted.fr" },
  messageAttenteBoutiqueDepot,
});
const avant = Date.now();
const job = { id: "j-louis", platform: "vinted", action: "publish", platform_fields: { vinted_account_id: NEYENONIE, processing_since: "x", needsUserAttempts: 1 } };
const r = await retenir("jeton", job, garde, { verdict: "mauvaise_boutique", etape: "avant_depot", lue: EVAT, source: "page_de_depot" });
assert.equal(r.status, "skipped");
assert.equal(ecrits.length, 1);
assert.equal(ecrits[0].status, "pending");
const pfE = ecrits[0].extra.platform_fields;
assert.deepEqual({ user_id: pfE.attente_boutique.user_id, login: pfE.attente_boutique.login }, { user_id: NEYENONIE, login: "neyenonie" });
const echeance = Date.parse(pfE.next_action_after) - avant;
assert.ok(echeance > 14 * 60_000 && echeance <= 15 * 60_000 + 5_000, `échéance ≈ 15 min (${echeance} ms)`);
assert.equal(pfE.needsUserAttempts, 1, "le compteur de tentatives n'avance pas");
assert.equal(pfE.processing_since, undefined);
assert.equal(pfE.gardes.garde_boutique_depot.verdict, "mauvaise_boutique");
assert.match(ecrits[0].extra.error, /@neyenonie/);
ok("simulation : pending + attente_boutique {@neyenonie} + 15 min, compteur de tentatives intact, trace de garde");

const ecritsAnnule = [];
const retenirAnnule = new Function("ctx", `const { jobStatusNow, updateJobStatus, tracerGarde, VO, messageAttenteBoutiqueDepot } = ctx;\n${ret}\nreturn retenirPublicationPourBoutique;`)({
  jobStatusNow: async () => "cancelled", updateJobStatus: async (...a) => ecritsAnnule.push(a), tracerGarde: () => {},
  VO: { navigateurCourt: () => "Chrome", domaineVintedAffiche: () => "vinted.fr" }, messageAttenteBoutiqueDepot,
});
await retenirAnnule("jeton", job, garde, { verdict: "identite_illisible" });
assert.equal(ecritsAnnule.length, 0);
ok("simulation : un job annulé entre-temps n'est jamais réécrit");

// ── 6. La sonde libère aussi les publications ───────────────────────────────
assert.match(bg, /&status=eq\.pending&action=in\.\(publish,republish\)&platform=eq\.vinted` \+\s*`&platform_fields->attente_boutique->>user_id=eq\./);
ok("la sonde libère les publications ET les republications dès que leur boutique est vue");

// ── 7. L'identité par l'onglet ne navigue jamais ────────────────────────────
const parOnglet = extraireFonctionJs(bg, "identiteVintedParOnglet");
assert.doesNotMatch(parOnglet, /getOrCreateWorkTab|chrome\.tabs\.update|chrome\.tabs\.create|ouvrirOnglet/);
assert.match(parOnglet, /findExistingWorkTabId\("vinted"\)/);
assert.match(parOnglet, /t\.discarded/);
assert.match(parOnglet, /type: "VINTED_CURRENT_USER"/);
ok("identiteVintedParOnglet lit l'onglet de travail TEL QU'IL EST (aucune navigation, déchargé = illisible)");

console.log(`\n✓ publication-boutique-avant-depot : ${n} contrôles verts`);
