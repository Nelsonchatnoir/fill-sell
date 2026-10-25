// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT SUR UNE ANNONCE DÉJÀ ABSENTE EST UN RETRAIT FAIT (25/10, règle de Nico) — `npm run selftest:retrait-deja-absent`
// ═══════════════════════════════════════════════════════════════════════════
// « Si l'annonce est déjà absente (404, retirée, vendue), le retrait est considéré comme fait et se clôt seul, sans
// erreur ni message à l'utilisateur. Sur toutes les plateformes. » — jamais au prix d'une double vente.
// Exécute le code LIVRÉ : processDeleteJob, rearmBounded, checkListingState… extraits de chrome-extension/background.js
// (doublures seulement aux bords : onglet, réseau, base), les preuves Beebs de content-scripts/beebs.js, et les modules
// du serveur (_shared/retrait-deja-absent.js, beebs-preuve-retrait.js, pas-de-rouge.js).
//   1. Beebs (boncoin59300, d87c8614) : le constat « page 404 » survit à l'essai et arme l'attente côté serveur ; le
//      second constat ≥ 6 h prouve → `deleted` + deja_absente ; la garde de modération tient.
//   2. Vinted : annonce absente → `deleted` silencieux (boutique invérifiable, 404 du POST confirmé par lecture,
//      vendue) ; en ligne ou illisible → jamais `deleted`.
//   3. Leboncoin : un 410 dans les 2 h d'un VRAI dépôt FillSell n'est jamais « absente » ; un import, si.
//   4. Jamais `deleted` sur une page anti-robot ou illisible (Vinted, Leboncoin, page publique Beebs).
//   5. Depop : le drapeau « déjà absente » n'est plus perdu.
//   6. Le serveur : étiquette lue sur les CHAMPS, juge du balayage (relevés, jamais Beebs sur l'index), écriture,
//      copies, et jamais « elle reste en vente » sans preuve.
//   7. Le câblage (handler-watch, update-job-status, ebay-api-worker).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const importer = (p) => import(pathToFileURL(join(RACINE, p)).href);
const BG = lire("chrome-extension/background.js");
const BJ = lire("chrome-extension/content-scripts/beebs.js");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

const RA = await importer("supabase/functions/_shared/retrait-deja-absent.js");
const BP = await importer("supabase/functions/_shared/beebs-preuve-retrait.js");
const PDR = await importer("supabase/functions/_shared/pas-de-rouge.js");

/** Une fonction de premier niveau d'un fichier (de sa déclaration à la première « } » en colonne 0). */
function extraire(src, nom) {
  const m = new RegExp(`\\n((?:async )?function ${nom}\\()`).exec(src);
  if (!m) throw new Error(`fonction introuvable : ${nom}`);
  const fin = src.indexOf("\n}\n", m.index + 1);
  return src.slice(m.index + 1, fin + 2);
}
function constante(src, nom) {
  const m = new RegExp(`\\nconst ${nom} =[\\s\\S]*?;\\n`).exec(src);
  if (!m) throw new Error(`constante introuvable : ${nom}`);
  return m[0];
}
const MESSAGE_CONSTAT_404_BEEBS = vm.runInNewContext(`${constante(BJ, "MESSAGE_CONSTAT_404_BEEBS")}; MESSAGE_CONSTAT_404_BEEBS`);

// ── Le flux de retrait de l'extension, dans un bac à sable ─────────────────
const FONCTIONS_BG = ["processDeleteJob", "rearmBounded", "cloreRetraitDejaAbsent", "publieLeDuDepotFillsell", "dejaAbsenteDuResultat",
  "dejaAbsenteRetrait", "numeroAnnonceRetrait", "lectureEtatRetrait", "causeLectureImpossible", "preuveDeLecture", "derniereRevueEnLigne",
  "estPageInattendueDeNotreFait", "messagePageInattendue", "extractListingId", "checkListingState", "oublierLbcMorteSiRevue", "lbcUrlDejaMorte",
  "lbcUrlsMortes", "memoriserLbcMorte"];
const CONSTANTES_BG = ["REPRISE_ESPACEE_DELAIS_MIN", "LABEL_PLATEFORME", "TRANSIENT_JOB_ERROR_RE", "LBC_DEAD_KEY", "LBC_CHECK_TIRS", "LBC_DEAD_TTL_MS", "LBC_MODERATION_MS"];
const CODE_BG = `${CONSTANTES_BG.map((n) => constante(BG, n)).join("")}\n${FONCTIONS_BG.map((n) => extraire(BG, n)).join("\n")}\n;({ processDeleteJob, checkListingState })`;

/**
 * Un essai de retrait. `sc` : { job, resultat(job) → résultat du handler, lecture(url, platform, opts) → état (sinon la VRAIE
 * checkListingState avec lireEtatAnnonce(sc.lbc)), depots → réponse REST des dépôts, moderation → beebsAbsenteParModeration }.
 */
async function essai(sc) {
  const ecrits = [], lectures = [], rest = [];
  const memoire = {};
  let statutBase = "pending";
  const doublures = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Date, Math, Number, String, Boolean, Array, Object, Set, Map, Promise, RegExp, Error, encodeURIComponent, setTimeout, clearTimeout,
    sleep: async () => {}, randInt: () => 0,
    chrome: { storage: { local: { get: async (k) => ({ [k]: memoire[k] }), set: async (o) => Object.assign(memoire, o) } } },
    enrichirCibleBeebs: async (j) => j,
    updateJobStatus: async (_t, id, status, extras = {}) => { statutBase = status; ecrits.push({ id, status, ...JSON.parse(JSON.stringify(extras)) }); },
    jobStatusNow: async () => statutBase,
    executerRetraitViaHandler: async (j) => ({ result: sc.resultat(j), tabId: 1 }),
    nettoyerVerdictSuppression: (v) => v ?? null,
    cancelPublishAfterDelete: async () => { ecrits.push({ copies_closes: true }); },
    recordRecentResult: async () => {},
    attendreFinVerificationVinted: async () => {}, marquerBlocageAntiRobot: async () => ({ borne: false }),
    motifSessionMorte: () => false, traiterMurDeConnexion: async () => {},
    beebsAbsenteParModeration: async () => Boolean(sc.moderation),
    stampEtatFenetre: () => {}, releverEtatFenetreTravail: async () => null,
    causeHumaineConnue: () => null, sansPromesseDeReprise: (m) => m,
    decodeJwtSub: () => "uid-1",
    restRequest: async (chemin) => { rest.push(chemin); return sc.depots ?? []; },
    lireEtatOpla: async () => ({ state: "unknown" }), lireEtatDepop: async () => sc.depop ?? ({ state: "unknown" }), checkVintedUnanime: async () => ({ state: "unknown" }),
    lireEtatAnnonce: async () => sc.lbc ?? ({ state: "unknown", raison: "lecture_impossible" }),
  };
  vm.createContext(doublures);
  const { processDeleteJob, checkListingState } = vm.runInContext(CODE_BG, doublures);
  doublures.checkListingState = sc.lecture
    ? async (url, platform, opts) => { lectures.push({ url, platform, opts }); return sc.lecture(url, platform, opts); }
    : async (url, platform, opts) => { lectures.push({ url, platform, opts }); return checkListingState(url, platform, opts); };
  // checkListingState est appelée par son nom dans le bac : on remplace la liaison du bac.
  vm.runInContext("checkListingState = globalThis.checkListingState;", doublures);
  const resultat = await processDeleteJob(JSON.parse(JSON.stringify(sc.job)), "jeton");
  const fin = ecrits.filter((e) => e.status && e.status !== "processing");
  return { ecrits, fin: fin[fin.length - 1] ?? null, lectures, rest, resultat };
}
const supprime = (r) => r.ecrits.some((e) => e.status === "deleted");

// ═══ 1. BEEBS ═══════════════════════════════════════════════════════════════
console.log("1. Beebs (boncoin59300, d87c8614) — deux constats « page 404 » à 6 h d'écart");
const jobBeebs = (pf = {}) => ({ id: "d87c8614", user_id: "u", platform: "beebs", action: "delete", title: "playmobil city action 71149",
  listing_url: "https://www.beebs.app/fr/p/33747519-playmobil-city-action", platform_listing_id: "33747519", inventaire_id: 1792855532058017, platform_fields: pf });
const constat = (le) => ({ le, page_http: 404, produit: false, en_verification: "complete", en_ligne: "60/1103", index: "la_porte_encore" });
let pfApresEssai1 = null;
{
  const r = await essai({
    job: jobBeebs({ needsUserAttempts: 1 }),
    resultat: () => ({ success: false, pageAnnonceSansControle: true, reprise: true, error: MESSAGE_CONSTAT_404_BEEBS,
      beebs404Constats: [constat(new Date().toISOString())], trace: ["page 404"] }),
    lecture: () => ({ state: "unavailable", price: null, raison: null, http: 404 }),   // la page publique : 404
  });
  ok(!supprime(r), "essai 1 : la page publique 404 ne clôt jamais un retrait Beebs");
  ok(r.fin?.status === "pending", "essai 1 : reprise (pending)", JSON.stringify(r.fin?.status));
  pfApresEssai1 = r.fin?.platform_fields ?? {};
  ok(Array.isArray(pfApresEssai1.beebs_404_constats) && pfApresEssai1.beebs_404_constats.length === 1, "B1 : le constat de l'essai est GARDÉ sur le job (il se perdait)", JSON.stringify(pfApresEssai1.beebs_404_constats));
  ok(String(r.fin?.error ?? "").startsWith("Beebs ne montre plus cette annonce : sa page est introuvable (404)"), "B1 : le message du constat part intact", String(r.fin?.error).slice(0, 90));
  ok(!r.ecrits.some((e) => /Suppression beebs non aboutie|peut-être encore en ligne/.test(String(e.error ?? ""))), "B1 : plus réécrit en « Suppression beebs non aboutie… peut-être encore en ligne »");
  ok(pfApresEssai1.lecture_etat_retrait?.etat === "unavailable", "la lecture de la page (404) est gardée sur le job, pour un message vrai");
  ok(RA.constat404DeCetEssai(pfApresEssai1), "serveur : le constat est de CET essai (postérieur à processing_since) → l'attente du second constat s'arme sur les CHAMPS");
  const uj = lire("supabase/functions/update-job-status/index.ts");
  const re404 = new RegExp(uj.match(/const CONSTAT_404_BEEBS_RE = \/(.+)\/;/)?.[1] ?? "x^");
  ok(re404.test(String(r.fin?.error ?? "")), "… et le repli texte d'update-job-status le reconnaît aussi");
  ok(!RA.constat404DeCetEssai({ ...pfApresEssai1, processing_since: new Date(Date.now() + 3600_000).toISOString() }),
    "un constat d'un essai PRÉCÉDENT (antérieur à la prise en charge) n'arme rien (session fermée, canal coupé : leur chemin)");
  const pdr = PDR.classerEchec({ platform: "beebs", action: "delete", brut: "Page de l'annonce sans bouton « Supprimer l'annonce », et « Mes annonces » illisible en entier — rien n'a été touché, nouvel essai",
    essais: 5, pf: pfApresEssai1, reprises: 2 });
  ok(pdr.statut === "pending" && !/reste en vente/.test(pdr.message) && /introuvable/.test(pdr.message) && /rien à faire/.test(pdr.message),
    "pas-de-rouge : plus jamais « elle reste en vente sur Beebs » sur une page 404 — « introuvable, pas achetable, FillSell clôt seul »", pdr.message);
}
{
  // Essai 2, 7 h plus tard : la VRAIE preuve de beebs.js (liste « en ligne » tronquée, page 404, index qui la porte encore).
  const src = ["produitVenduSurBeebs", "jugerConstats404Beebs", "preuveAbsenceMesAnnonces", "preuveRetraitDepuis"].map((n) => extraire(BJ, n)).join("\n");
  const soixante = Array.from({ length: 60 }, (_, k) => String(34100000 + k));
  const lecture = { ok: true, lu_le: new Date().toISOString(), ids: soixante,
    pages: [{ page: "en_verification", ok: true, ids: [], n: 0 }, { page: "en_ligne", ok: true, ids: soixante, n: 60, annoncees: 1103 }] };
  const f = new Function("lireIdsMesAnnoncesBeebs", "sleep", "pageAnnonceBeebs", "presenceIndexBeebs", `${src}; return { preuveAbsenceMesAnnonces, preuveRetraitDepuis };`)(
    async () => lecture, async () => {}, async () => ({ http: 404, produit: false }), async () => true);
  const il7h = new Date(Date.now() - 7 * 3600_000).toISOString();
  const preuve = await f.preuveAbsenceMesAnnonces("33747519", () => {}, { constats404: [constat(il7h)] });
  ok(preuve.verdict === "absente", "essai 2 (≥ 6 h) : beebs.js conclut « absente » (deux constats)");
  const preuveRetrait = f.preuveRetraitDepuis(preuve.lecture, "33747519", "deja_absente");
  const r = await essai({ job: jobBeebs({ beebs_404_constats: [constat(il7h)] }), resultat: () => ({ success: true, dejaRetiree: true, preuveRetrait, trace: [] }) });
  const d = r.ecrits.find((e) => e.status === "deleted");
  ok(d && d.error === null, "essai 2 : `deleted`, error null — fait, sans message");
  ok(d?.platform_fields?.preuve_retrait?.annonce?.regle === "deux_constats_404", "la preuve écrite : la règle des deux constats");
  ok(d?.platform_fields?.deja_absente?.preuve?.source === "mes_annonces" && d.platform_fields.deja_absente.vente === null && d.platform_fields.deja_absente.numero === "33747519",
    "le drapeau unique deja_absente (vente inconnue : un « SoldOut » Beebs peut être notre propre essai)", JSON.stringify(d?.platform_fields?.deja_absente));
  ok(BP.verdictClotureRetraitBeebs(d?.platform_fields, "2026-10-25T16:00:00Z+abc1234 · v0.6.144") === "ok", "serveur : la clôture est acceptée (preuve revérifiée)");
  const et = RA.etiquetteRetraitDejaAbsent(d?.platform_fields, { platform: "beebs", numero: "33747519" });
  ok(et?.retrait_par === RA.RETRAIT_PAR_HORS_LIGNE, "serveur : étiqueté « annonce déjà hors ligne » sur les CHAMPS (plus « fillsell »)");
  const rm = await essai({ job: jobBeebs({ beebs_404_constats: [constat(il7h)] }), resultat: () => ({ success: true, dejaRetiree: true, preuveRetrait, trace: [] }), moderation: true });
  ok(!supprime(rm), "garde de modération (dépôt < 72 h jamais vu en ligne) : jamais « retirée »");
}

// ═══ 2. VINTED ══════════════════════════════════════════════════════════════
console.log("\n2. Vinted — l'annonce absente se clôt seule ; en ligne ou illisible, jamais");
const jobVinted = (pf = {}) => ({ id: "v1", user_id: "u", platform: "vinted", action: "delete", title: "Jean",
  listing_url: "https://www.vinted.fr/items/9690105645-jean", platform_listing_id: "9690105645", inventaire_id: 7, platform_fields: pf });
const tirs404 = [1, 2, 3].map((tir) => ({ tir, state: "unavailable", http: 404, raison: null }));
{
  const garde = () => ({ success: false, needsUser: false, verificationBoutiqueImpossible: true, verdict: { preuve_manquante: "origine" }, error: "origine de l'annonce invérifiable", trace: [] });
  const a = await essai({ job: jobVinted(), resultat: garde, lecture: () => ({ state: "unavailable", http: 404, tirs: tirs404 }) });
  const d = a.ecrits.find((e) => e.status === "deleted");
  ok(d && d.error === null && !a.ecrits.some((e) => e.status === "pending"), "V1 : boutique invérifiable + annonce absente (3 lectures unanimes) → `deleted`, sans attente en boucle");
  ok(d?.platform_fields?.deja_absente?.preuve?.source === "etat_annonce" && d.platform_fields.deja_absente.preuve.moment === "lecture_avant_garde_boutique"
    && d.platform_fields.delete_confirmed_by === "etat_annonce" && Array.isArray(d.platform_fields.delete_preuve?.tirs), "V1 : la preuve écrite (tirs) et le drapeau");
  ok(a.ecrits.some((e) => e.copies_closes), "V1 : la copie publiée est close comme après tout retrait");
  ok(RA.etiquetteRetraitDejaAbsent(d?.platform_fields, { platform: "vinted" })?.retrait_par === RA.RETRAIT_PAR_HORS_LIGNE, "serveur : « déjà hors ligne »");
  const b = await essai({ job: jobVinted(), resultat: garde, lecture: () => ({ state: "active", http: 200 }) });
  ok(!supprime(b) && b.fin?.status === "pending" && b.fin?.platform_fields?.verification_boutique_vinted && b.fin.platform_fields.lecture_etat_retrait?.etat === "active",
    "V1 : annonce EN LIGNE → jamais retirée, l'attente de boutique d'avant (et la lecture gardée)");
  const c = await essai({ job: jobVinted(), resultat: garde, lecture: () => ({ state: "unknown", raison: "bot_shield_403", http: 403 }) });
  ok(!supprime(c) && c.fin?.status === "pending", "V1 : page anti-robot → jamais retirée");
  const s = await essai({ job: jobVinted({ vinted_account_id: "40292699" }), lecture: () => ({ state: "unavailable", http: 404, tirs: tirs404 }),
    resultat: () => ({ ...garde(), verdict: { preuve_manquante: "session" } }) });
  ok(s.lectures.length === 0 && !supprime(s) && s.fin?.status === "pending", "V1 borné : une SESSION illisible (la page avait son vendeur) ne fait rien lire — l'attente d'avant");
  const r = await essai({ job: jobVinted({ lecture_etat_retrait: { etat: "active", lu_le: new Date(Date.now() - 5 * 60_000).toISOString() } }), resultat: garde,
    lecture: () => ({ state: "unavailable", http: 404, tirs: tirs404 }) });
  ok(r.lectures.length === 0 && !supprime(r), "V1 borné : au plus une lecture par demi-heure (l'attente repasse toutes les 2 min, jamais trois GET à chaque fois)");
}
{
  const post404 = () => ({ success: true, verdict: { conclusion: "http_404_presumee_absente", http: 404 }, trace: ["API delete → HTTP 404"] });
  const a = await essai({ job: jobVinted(), resultat: post404, lecture: () => ({ state: "unavailable", http: 404, tirs: tirs404 }) });
  const d = a.ecrits.find((e) => e.status === "deleted");
  ok(d && d.platform_fields?.deja_absente?.preuve?.moment === "post_404_confirme_par_lecture", "V3 : le 404 du POST confirmé par la lecture → `deleted` avec sa preuve");
  const b = await essai({ job: jobVinted(), resultat: post404, lecture: () => ({ state: "active", http: 200 }) });
  ok(!supprime(b) && b.fin?.status === "pending" && /toujours en ligne \(vérifié\)/.test(b.fin?.error ?? ""), "V3 : 404 du POST mais annonce EN LIGNE → jamais « retirée » (double vente évitée)", b.fin?.error);
  const c = await essai({ job: jobVinted(), resultat: post404, lecture: () => ({ state: "unknown", raison: "bot_shield_200", http: 200 }) });
  ok(!supprime(c) && c.fin?.status === "pending", "V3 : 404 du POST et page illisible → rien n'est conclu");
}
{
  const echec = () => ({ success: false, needsUser: true, error: "Jeton CSRF Vinted introuvable sur la page (page 404 ou non hydratée) — requête de suppression NON envoyée.", trace: ["NON envoyée"] });
  const a = await essai({ job: jobVinted(), resultat: echec, lecture: () => ({ state: "sold", http: 200 }) });
  const d = a.ecrits.find((e) => e.status === "deleted");
  ok(d?.platform_fields?.deja_absente?.vente === true, "vendue sur Vinted → `deleted`, vente: true");
  ok(RA.etiquetteRetraitDejaAbsent(d?.platform_fields, { platform: "vinted" })?.retrait_par === RA.RETRAIT_PAR_VENDUE, "serveur : « vendue sur la plateforme »");
  const s = await essai({ job: jobVinted(), resultat: () => ({ success: true, verdict: { conclusion: "supprimee", http: 200 }, trace: [] }) });
  const ds = s.ecrits.find((e) => e.status === "deleted");
  ok(ds && !ds.platform_fields?.deja_absente && RA.etiquetteRetraitDejaAbsent(ds.platform_fields, { platform: "vinted" }) === null, "un vrai retrait (HTTP 200) : jamais « déjà absente » — retiré par FillSell");
}

// ═══ 3. LEBONCOIN ═══════════════════════════════════════════════════════════
console.log("\n3. Leboncoin — un 410 dans les 2 h d'un vrai dépôt FillSell n'est jamais « absente »");
const jobLbc = () => ({ id: "l1", user_id: "u", platform: "leboncoin", action: "delete", title: "Lampe",
  listing_url: "https://www.leboncoin.fr/ad/decoration/3124643163", platform_listing_id: "3124643163", inventaire_id: 9, platform_fields: {} });
const echecLbc = () => ({ success: false, error: "Annonce introuvable : « Cette annonce est désactivée »", trace: [] });
const il = (h) => new Date(Date.now() - h * 3600_000).toISOString();
{
  const a = await essai({ job: jobLbc(), resultat: echecLbc, lbc: { state: "unavailable", http: 410 },
    depots: [{ published_at: il(0.5), handler_build: "2026-10-25T12:00:00Z+abc1234 · v0.6.144" }] });
  ok(!supprime(a), "L1 : dépôt FillSell publié il y a 30 min, page en 410 (modération) → jamais « retirée »");
  ok(a.lectures[0]?.opts?.publieLe === a.lectures[0]?.opts?.publieLe && Date.parse(a.lectures[0]?.opts?.publieLe) > Date.now() - 3600_000, "L1 : la date du dépôt est passée à checkListingState", JSON.stringify(a.lectures[0]?.opts));
  ok(a.rest.some((p) => /platform=eq\.leboncoin/.test(p) && /platform_listing_id=eq\.3124643163/.test(p) && /action=in\.\(publish,republish\)/.test(p)), "L1 : les dépôts lus par NUMÉRO exact");
  const b = await essai({ job: jobLbc(), resultat: echecLbc, lbc: { state: "unavailable", http: 410 },
    depots: [{ published_at: il(3), handler_build: "2026-10-25T12:00:00Z+abc1234 · v0.6.144" }] });
  ok(supprime(b) && b.ecrits.find((e) => e.status === "deleted")?.platform_fields?.deja_absente?.preuve?.http === 410, "L1 : dépôt de 3 h, 410 → retrait fait, preuve 410");
  const c = await essai({ job: jobLbc(), resultat: echecLbc, lbc: { state: "unavailable", http: 410 },
    depots: [{ published_at: il(0.5), handler_build: "releve-annonces" }] });
  ok(supprime(c), "L1 : un IMPORT du relevé (pas un dépôt FillSell) n'ouvre aucune fenêtre de modération");
  const d = await essai({ job: jobLbc(), resultat: echecLbc, lbc: { state: "unknown", raison: "bot_shield_403", http: 403 }, depots: [] });
  ok(!supprime(d), "Leboncoin anti-robot (403, trois tirs) → jamais « retirée »");
}

// ═══ 4. DEPOP ═══════════════════════════════════════════════════════════════
console.log("\n4. Depop — le drapeau « déjà absente » n'est plus perdu");
{
  const job = { id: "dp1", user_id: "u", platform: "depop", action: "delete", title: "Doudoune", listing_url: "https://www.depop.com/products/popeye-doudoune-ff69/",
    platform_listing_id: "popeye-doudoune-ff69", inventaire_id: 3, platform_fields: {} };
  const a = await essai({ job, resultat: () => ({ success: true, deja_absente: true, vendue: true, etape: "etat_avant", trace: ["etat_avant : STATUS_PURCHASED — vendue, aucun DELETE"] }) });
  const d = a.ecrits.find((e) => e.status === "deleted");
  ok(d?.platform_fields?.deja_absente?.preuve?.source === "depop_status_purchased" && d.platform_fields.deja_absente.vente === true && d.platform_fields.deja_absente.numero === "popeye-doudoune-ff69",
    "D1 : vendue sur Depop, aucun DELETE → deja_absente { vente: true }", JSON.stringify(d?.platform_fields?.deja_absente));
  ok(RA.etiquetteRetraitDejaAbsent(d?.platform_fields, { platform: "depop" })?.retrait_par === RA.RETRAIT_PAR_VENDUE, "serveur : « vendue sur la plateforme »");
  const vieux = RA.etiquetteRetraitParTrace(["cible popeye : 404 — déjà absente, aucun DELETE"], { platform: "depop", numero: "popeye-doudoune-ff69" });
  ok(vieux?.retrait_par === RA.RETRAIT_PAR_HORS_LIGNE && vieux.deja_absente.vente === null, "un ancien poste Depop : la trace « aucun DELETE » suffit au repli");
  ok(RA.etiquetteRetraitParTrace(["DELETE : HTTP 204", "vérification : HTTP 404"], { platform: "depop" }) === null, "un vrai DELETE Depop : retiré par FillSell");
}

// ═══ 5. LE SERVEUR : LE JUGE DU BALAYAGE ════════════════════════════════════
console.log("\n5. Le balayage (handler-watch) — ce qui prouve, ce qui ne prouve jamais");
{
  const R = (started, vus, tot, extra = {}) => ({ status: "done", started_at: started, finished_at: started, items_vus: vus, total_entries: tot, erreur: null, ...extra });
  const retraitLbc = { ...jobLbc(), status: "pending", created_at: "2026-10-25T08:57:00Z" };
  const ligneGone = [{ listing_id: "3124643163", vu_le: "2026-10-16T10:00:00Z", disparu_le: "2026-10-17T10:00:00Z", statut_plateforme: "en_ligne" }];
  const relevesAvant = [R("2026-10-22T10:00:00Z", 40, 40), R("2026-10-21T10:00:00Z", 41, 41)];
  const v = RA.jugerRetraitDejaAbsent(retraitLbc, { releves: relevesAvant, annonces: ligneGone });
  ok(v?.motif === "deux_releves_complets" && v.vente === null && v.preuve.source === "releves_complets",
    "f38fc7f6 (Hassan Said) : vue puis partie au relevé, absente des deux derniers relevés complets (même d'avant la demande) → retrait fait", JSON.stringify(v));
  ok(RA.jugerRetraitDejaAbsent(retraitLbc, { releves: relevesAvant, annonces: [] }) === null, "jamais vue par un relevé (deux comptes, un seul relevé) → rien n'est conclu");
  ok(RA.jugerRetraitDejaAbsent(retraitLbc, { releves: [R("2026-10-22T10:00:00Z", 30, 40), R("2026-10-21T10:00:00Z", 41, 41)], annonces: ligneGone }) === null, "un relevé incomplet → rien");
  ok(RA.jugerRetraitDejaAbsent(retraitLbc, { releves: relevesAvant, annonces: [{ ...ligneGone[0], disparu_le: null, vu_le: "2026-10-22T10:05:00Z" }] }) === null, "revue en ligne par un des deux relevés → rien (elle est là)");
  ok(RA.jugerRetraitDejaAbsent({ ...retraitLbc, status: "processing" }, { releves: relevesAvant, annonces: ligneGone }) === null, "un retrait en cours chez l'extension (processing) n'est jamais jugé");
  const vV = { ...jobVinted({ vinted_account_id: "40292699" }), status: "pending", created_at: "2026-09-26T20:36:00Z" };
  ok(RA.jugerRetraitDejaAbsent(vV, { snapshot: { status: "sold", captured_at: "2026-09-20T10:00:00Z" }, releves: [] })?.vente === true, "Vinted : dernier instantané « sold » → fait, vente: true");
  const D = (started, b) => R(started, 100, 100, { kind: "dressing", vinted_user_id: b, vinted_login: "x", finished_at: new Date(Date.parse(started) + 600_000).toISOString() });
  const dressing = [D("2026-09-25T10:00:00Z", "40292699"), D("2026-09-24T10:00:00Z", "40292699"), D("2026-09-01T10:00:00Z", "40292699")];
  ok(RA.jugerRetraitDejaAbsent(vV, { releves: dressing, derniereVue: "2026-09-01T10:05:00Z", snapshot: { status: "active" } })?.motif === "deux_releves_complets",
    "Vinted : vue le 01/09, absente des deux relevés complets de SA boutique d'après (avant la demande) → fait");
  ok(RA.jugerRetraitDejaAbsent({ ...vV, platform_fields: {} }, { releves: dressing, derniereVue: null }) === null, "Vinted : jamais vue et boutique inconnue → rien (une boutique jamais relevée ne dit rien)");
  ok(RA.jugerRetraitDejaAbsent(vV, { releves: dressing, derniereVue: "2026-09-25T10:03:00Z" }) === null, "Vinted : vue PENDANT un des deux relevés → rien");
  // Beebs : jamais sur le relevé.
  const vB = { ...jobBeebs({}), status: "pending", created_at: "2026-10-24T17:04:00Z" };
  ok(RA.jugerRetraitDejaAbsent(vB, { releves: relevesAvant, annonces: [{ listing_id: "33747519", vu_le: "2026-10-01T00:00:00Z", disparu_le: "2026-10-02T00:00:00Z" }], depotsBeebs: [] }) === null,
    "Beebs : absente des relevés (index public) → JAMAIS conclu");
  const deux = { beebs_404_constats: [constat(il(9)), constat(il(1))] };
  ok(RA.jugerRetraitDejaAbsent({ ...vB, platform_fields: deux }, { depotsBeebs: [] })?.motif === "deux_constats_404", "Beebs : deux constats « page 404 » à 8 h d'écart, pas un dépôt FillSell → fait");
  ok(RA.jugerRetraitDejaAbsent({ ...vB, platform_fields: deux }, { depotsBeebs: [{ published_at: il(30), vu_en_ligne_le: null }] }) === null,
    "Beebs : dépôt de 30 h jamais vu en ligne (Beebs l'examine peut-être) → rien (garde de modération)");
  // (25/10) 7 jours : mesuré, un dépôt jamais vu en ligne peut le devenir jusqu'à 126 h après sa sortie de vérification.
  ok(RA.jugerRetraitDejaAbsent({ ...vB, platform_fields: deux }, { depotsBeebs: [{ published_at: il(80), vu_en_ligne_le: null }] }) === null, "Beebs : dépôt de 80 h jamais vu en ligne → rien (Beebs peut encore la mettre en ligne : mesuré jusqu'à 126 h)");
  ok(RA.jugerRetraitDejaAbsent({ ...vB, platform_fields: deux }, { depotsBeebs: [{ published_at: il(7 * 24 + 2), vu_en_ligne_le: null }] })?.motif === "deux_constats_404", "Beebs : dépôt de plus de 7 jours → fait");
  ok(RA.jugerRetraitDejaAbsent({ ...vB, platform_fields: deux }, { depotsBeebs: null }) === null, "Beebs : dépôts non lus → rien");
  ok(RA.jugerRetraitDejaAbsent({ ...vB, platform_fields: { beebs_404_constats: [constat(il(3)), constat(il(1))] } }, { depotsBeebs: [] }) === null, "Beebs : deux constats à 2 h d'écart → rien");
}

console.log("\n6. Le serveur — l'écriture, les copies, les mots");
{
  const v = { numero: "3124643163", vente: null, delete_confirmed_by: "releves", preuve: { source: "releves_complets" } };
  const pf = RA.champsRetraitDejaAbsent({ arme_par: { pose_par: "armer_retrait_job" }, next_action_after: "2026-10-26T00:00:00Z", needs_user_source: "relancer",
    error_technique: { brut: "Timeout", at: "2026-10-25T09:00:00Z" }, pas_de_rouge_reprises: 2 },
    { verdict: v, platform: "leboncoin", erreur: "Le retrait n'est pas encore fait…", statut: "pending", par: "handler-watch (test)" });
  ok(pf.deja_absente?.preuve?.source === "releves_complets" && pf.retrait_par === RA.RETRAIT_PAR_HORS_LIGNE && pf.delete_confirmed_by === "releves", "drapeau, étiquette, source");
  ok(!("next_action_after" in pf) && !("needs_user_source" in pf) && !("error_technique" in pf), "l'attente close");
  ok(pf.erreurs_archivees.some((e) => e.erreur === "Le retrait n'est pas encore fait…") && pf.erreurs_archivees.some((e) => e.erreur === "Timeout"), "l'erreur affichée ET le brut archivés");
  ok(pf.arme_par?.pose_par === "armer_retrait_job" && pf.pas_de_rouge_reprises === 2, "les traces restent");
  const retrait = { id: "r1", user_id: "u", platform: "leboncoin", inventaire_id: 9 };
  const pub = (o) => ({ id: "p1", user_id: "u", platform: "leboncoin", action: "publish", status: "published", inventaire_id: 9,
    listing_url: "https://www.leboncoin.fr/ad/decoration/3124643163", platform_listing_id: "3124643163", platform_fields: { unavailable_since: "x", sale_signal: "unavailable" }, ...o });
  ok(RA.copiesAClore([pub({})], retrait, "3124643163").length === 1, "la copie « plus en ligne » de la même annonce est close");
  ok(RA.copiesAClore([pub({ platform_fields: { sale_signal: "sold" } })], retrait, "3124643163").length === 0, "jamais une copie dont la vente est prouvée (son circuit)");
  ok(RA.copiesAClore([pub({ platform_listing_id: "3124643164", listing_url: null })], retrait, "3124643163").length === 0, "jamais une autre annonce");
  ok(RA.copiesAClore([pub({ inventaire_id: 10 })], retrait, "3124643163").length === 0, "jamais la fiche d'un autre article");
  const cl = RA.clotureCopie({ unavailable_since: "x", sale_signal: "unavailable", unavailable_pending_since: "y", rattachement: { a: 1 } }, { le: "t", retraitId: "r1", numero: "3124643163" });
  ok(cl.status === "cancelled" && cl.error === RA.MSG_COPIE_RETIREE && !("unavailable_since" in cl.platform_fields) && cl.platform_fields.removed_by_user === true
    && cl.platform_fields.unavailable_pending_at_delete === "y" && cl.platform_fields.rattachement?.a === 1, "la copie close « pas une vente », trace archivée, le reste intact");
  ok(lire("chrome-extension/background.js").includes(`"${RA.MSG_COPIE_RETIREE}"`), "même texte que l'extension (cancelPublishAfterDelete)");
  // Les mots.
  const frais = new Date().toISOString();
  const enLigne = PDR.classerEchec({ platform: "vinted", action: "delete", brut: "Erreur inconnue XYZ", essais: 5, pf: { lecture_etat_retrait: { etat: "active", lu_le: frais } }, reprises: 1 });
  ok(/encore en ligne sur Vinted/.test(enLigne.message) && /double vente/.test(enLigne.message), "vue en ligne (lecture < 24 h) : on le dit, avec le conseil contre la double vente");
  const inconnu = PDR.classerEchec({ platform: "leboncoin", action: "delete", brut: "Erreur inconnue XYZ", essais: 5, pf: {}, reprises: 1 });
  ok(/Si elle est encore en ligne/.test(inconnu.message) && !/reste en vente/.test(inconnu.message) && /double vente/.test(inconnu.message), "on ne sait pas : « si elle est encore en ligne… », jamais « elle reste en vente »");
  ok(PDR.rienTouche("delete", {}) === "Rien n'a été retiré par FillSell." && /toujours en ligne/.test(PDR.rienTouche("delete", { lecture_etat_retrait: { etat: "active", lu_le: frais } })),
    "« l'annonce est toujours en ligne » seulement sur preuve");
  const vieux = PDR.classerEchec({ platform: "vinted", action: "delete", brut: "Erreur inconnue XYZ", essais: 5, pf: { lecture_etat_retrait: { etat: "active", lu_le: "2026-01-01T00:00:00Z" } }, reprises: 1 });
  ok(/Si elle est encore en ligne/.test(vieux.message), "une lecture de plus de 24 h ne prouve plus rien");
  // Le code, commentaires retirés (ils racontent l'ancien message, à dessein).
  const textes = [lire("supabase/functions/_shared/pas-de-rouge.js"), lire("supabase/functions/_shared/retrait-deja-absent.js")].join("\n")
    .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join("\n");
  ok(!/Tant que ce n'est pas fait, elle reste en vente/.test(textes) && !/elle reste en vente sur \$\{nom\}/.test(textes), "« Tant que ce n'est pas fait, elle reste en vente » n'existe plus dans le code");
}

// ═══ 7. LE CÂBLAGE ══════════════════════════════════════════════════════════
console.log("\n7. Le câblage");
{
  const hw = lire("supabase/functions/handler-watch/index.ts");
  const i = hw.indexOf("UN RETRAIT SUR UNE ANNONCE DÉJÀ ABSENTE SE CLÔT SEUL — TOUT LE PARC");
  const bloc = hw.slice(i, hw.indexOf("UNE REPUBLICATION REPREND L'ÉTAT DE SON ANNONCE", i));
  ok(i > 0 && /getUTCMinutes\(\) % 15 >= 3 && new Date\(\)\.getUTCMinutes\(\) % 15 < 6/.test(bloc), "handler-watch : un balayage, un passage sur cinq (créneau libre 3-6)");
  ok(/\.eq\("action", "delete"\)\.in\("status", \["pending", "needs_user", "failed"\]\)/.test(bloc) && /\.limit\(RETRAITS_ABSENTS_LUS\)/.test(bloc) && /COMPTES_PAR_PASSAGE = 12/.test(bloc),
    "… les retraits ouverts (jamais processing), lus bornés, 12 comptes par passage");
  ok(/jugerRetraitDejaAbsent\(j, \{/.test(bloc) && /ecrireRetraitDejaAbsent\(supabase, j, v,/.test(bloc) && /if \(!lues\.has\(p\)\) continue;/.test(bloc),
    "… le juge partagé, une lecture ratée ne conclut rien");
  ok(/deuxConstats404Prouvent\(constats404Beebs\(/.test(bloc), "… Beebs seulement avec deux constats « page 404 »");
  const ecr = hw.slice(hw.indexOf("async function ecrireRetraitDejaAbsent("));
  ok(/\.update\(\{ status: "deleted", error: null, platform_fields: pf \}\)/.test(ecr) && /\.eq\("status", String\(j\.status\)\)/.test(ecr) && /copiesAClore\(/.test(ecr) && /\.eq\("status", "published"\)/.test(ecr),
    "… écriture `deleted` en compare-and-swap, copies closes conditionnées à « published »");
  const v = hw.slice(hw.indexOf("RETRAIT VINTED D'UNE ANNONCE QUI N'EXISTE PLUS : LE DRESSING TRANCHE"), i);
  ok(!/status: "cancelled", error: v\.message/.test(v) && /ecrireRetraitDejaAbsent\(supabase, j, \{/.test(v), "handler-watch (Vinted, deux relevés) : `deleted` + drapeau, plus `cancelled` + « Rien à retirer »");
  const uj = lire("supabase/functions/update-job-status/index.ts");
  ok(/etiquetteRetraitDejaAbsent\(pfIn0, \{/.test(uj) && uj.indexOf("etiquetteRetraitDejaAbsent(pfIn0") < uj.indexOf("/NON envoy|NON DÉTERMIN/i.test(trace)"),
    "update-job-status : l'étiquette se lit sur les CHAMPS d'abord, la trace n'est plus qu'un repli");
  ok(/const constat404DuCorps = body\.platform_fields && typeof body\.platform_fields === "object"\s*\n\s*&& constat404DeCetEssai\(/.test(uj) && /\(constat404DuCorps \|\| \(typeof body\.error === "string" && CONSTAT_404_BEEBS_RE\.test\(body\.error\)\)\)/.test(uj),
    "update-job-status : l'attente du second constat Beebs s'arme sur les CHAMPS (le texte en repli)");
  const ew = lire("supabase/functions/ebay-api-worker/index.ts");
  ok(!/status: "cancelled", error: "Retrait eBay annulé/.test(ew), "ebay-api-worker : plus aucun retrait « annulé » sur une annonce vendue — `deleted`, sa vente suit son circuit");
  ok(/controleOffre\.lecture\.http === 404/.test(ew) && /source: "offre_404_puis_getitem"/.test(ew), "ebay-api-worker : une offre supprimée (404) → l'annonce relue (GetItem) avant de conclure");
  ok(/etat\.verdict === "indetermine" && !etat\.limite && etat\.motif === "http_404"/.test(ew), "ebay-api-worker : offre hors ligne et annonce introuvable → fait ; jamais sur un quota ni une annonce vivante");
  const bg = lire("chrome-extension/background.js");
  ok(/if \(!result\.needsUser && !result\.reprise && \/introuvable/.test(bg), "extension : la branche « introuvable » ne capte plus un résultat « reprise »");
  ok((bg.match(/publieLe(?:Canal)? = job\.platform === "leboncoin" \? await publieLeDuDepotFillsell\(job, accessToken\) : null;/g) ?? []).length === 2,
    "extension : publieLe passé à checkListingState (après échec ET après canal coupé)");
}

console.log(`\n${rouges ? "✗" : "✓"} retrait déjà absent : ${verts} contrôle(s) vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
