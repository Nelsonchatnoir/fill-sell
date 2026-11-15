// ═══════════════════════════════════════════════════════════════════════════
// VERROU — UN REFUS AVANT APPEL NE CONSOMME JAMAIS LE SCAN UNIQUE D'UN ARTICLE (15/11/2026, lot de Nico, point 2)
//   npm run selftest:ebay-scan-refus-avant-appel
// ═══════════════════════════════════════════════════════════════════════════
// Le worker eBay ne fait qu'UN identify Lens par article (marqueur inventaire.attributs.lens_scan, réservé AVANT
// l'appel). Le 02/11 (5 articles) et le 14/11 (5 articles), lens-analysis a répondu 429 « identify_unavailable » : le
// plafond IA, AVANT tout appel payant. Le worker a pourtant écrit « echec » : le scan unique de ces 10 articles était
// perdu sans qu'un centime ait été dépensé.
// Règle (tous les comptes) : un refus prouvé AVANT tout appel payant (plafond, IA indisponible, limite, garde) rend la
// réservation ; un appel payant abouti (réponse rendue, même vide) ou un doute (délai, coupure, passerelle) la consomme.
// Ce test exécute la règle livrée (_shared/lens-scan-refus-avant-appel.js), vérifie que le worker la branche (lecture
// du source, comme les autres verrous du worker) et que la preuve « avant appel » tient toujours dans lens-analysis.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };
console.log("ebay-scan-refus-avant-appel-selftest");

let R = null;
try {
  R = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/lens-scan-refus-avant-appel.js")).href);
} catch (e) {
  ok(false, "la règle existe : supabase/functions/_shared/lens-scan-refus-avant-appel.js", String(e?.message ?? e).slice(0, 120));
}
const decide = (issue) => (R?.refusAvantAppelLens ? R.refusAvantAppelLens(issue) : { rendu: false, raison: null });
const etat = (m) => (R?.etatMarqueurScanLens ? R.etatMarqueurScanLens(m) : "pose");

// ── 1. Refus AVANT tout appel payant → réservation RENDUE ────────────────────
console.log("1. refus avant appel → rendu");
// Les 10 marqueurs du 02/11 et du 14/11, tels que relus en base le 15/11 (détail « HTTP 429 identify_unavailable »).
const MARQUEURS_PERDUS = [
  ["8ac5bbda", 1793651578883, "2026-11-02T20:50:07.031Z"], ["521b7f89", 1793654205757, "2026-11-02T21:20:05.887Z"],
  ["521b7f89", 1793653451585, "2026-11-02T21:20:05.887Z"], ["521b7f89", 1793657936423, "2026-11-02T22:22:03.654Z"],
  ["521b7f89", 1793658309470, "2026-11-02T22:28:03.862Z"], ["f8aa02a5", 1794675210902, "2026-11-14T16:56:06.333Z"],
  ["f8aa02a5", 1794675610237, "2026-11-14T17:02:09.489Z"], ["13e274de", 1794615766169017, "2026-11-14T18:42:17.301Z"],
  ["13e274de", 1794615766169016, "2026-11-14T18:42:21.801Z"], ["e5be98ba", 1794627032481, "2026-11-14T19:02:06.952Z"],
];
for (const [compte, article] of MARQUEURS_PERDUS) {
  const r = decide({ http: 429, erreur: "identify_unavailable" });
  ok(r.rendu === true && r.raison === "plafond_ia", `${compte} / ${article} : 429 identify_unavailable (plafond IA) → réservation rendue`, JSON.stringify(r));
}
const RENDUS = [
  [{ http: 503, erreur: "ai_unavailable" }, "ia_indisponible", "503 ai_unavailable (IA sans réponse, ou filet du scan complet)"],
  [{ http: 429, erreur: "rate_limited" }, "limite_compte", "429 rate_limited (garde par compte)"],
  [{ http: 401, erreur: "Unauthorized" }, "garde_acces", "401 Unauthorized de lens-analysis (secret refusé)"],
  [{ http: 401, erreur: null }, "garde_acces", "401 de la passerelle (jeton refusé, la fonction n'a pas tourné)"],
  [{ http: 400, erreur: "appel_interne_invalide" }, "garde_appel", "400 appel_interne_invalide"],
  [{ http: 400, erreur: "invalid_json" }, "garde_appel", "400 invalid_json"],
  [{ http: 400, erreur: "Missing urls" }, "garde_appel", "400 Missing urls"],
  [{ http: 500, erreur: "Missing API key" }, "cle_ia_absente", "500 Missing API key"],
  [{ http: 500, erreur: 'Anthropic 529: {"type":"error","error":{"type":"overloaded_error"}}' }, "panne_ia", "500 « Anthropic 529 » (IA surchargée, réponse d'erreur jamais facturée)"],
  [{ http: 500, erreur: "Anthropic 500: Internal server error" }, "panne_ia", "500 « Anthropic 500 »"],
];
for (const [issue, raison, nom] of RENDUS) {
  const r = decide(issue);
  ok(r.rendu === true && r.raison === raison, `${nom} → rendu (${raison})`, JSON.stringify(r));
}

// ── 2. Appel payant abouti, ou doute → CONSOMMÉ (comme avant) ────────────────
console.log("2. appel abouti ou doute → consommé");
const CONSOMMES = [
  [{ http: 200, erreur: null }, "200 : l'identify a répondu (même vide) — le scan est fait"],
  [{ http: 500, erreur: "Réponse IA non parsable" }, "500 « Réponse IA non parsable » (APRÈS l'appel et la passe de réparation)"],
  [{ http: 500, erreur: "Anthropic 400: messages.0.content.1.image.source.url: invalid" }, "500 « Anthropic 400 » (refus de NOS photos : rejouer ne changerait rien — les 3 marqueurs du 29/10 au 10/11)"],
  [{ http: 500, erreur: "Internal error" }, "500 générique (après appel possible)"],
  [{ http: null, erreur: null, exception: true }, "délai de 45 s dépassé côté worker (lens-analysis continue et paie)"],
  [{ http: null, erreur: null, exception: true }, "coupure réseau (on ne sait pas si lens-analysis a tourné)"],
  [{ http: 546, erreur: null }, "546 de la passerelle (limite de la fonction, après appel possible)"],
  [{ http: 502, erreur: null }, "502 de la passerelle"],
  [{ http: 503, erreur: null }, "503 sans le corps de lens-analysis"],
  [{ http: 429, erreur: null }, "429 sans le corps de lens-analysis"],
  [{ http: 409, erreur: "scan_deja_en_cours" }, "409 (inatteignable en identify) — jamais rendu par défaut"],
  [undefined, "issue illisible"],
];
for (const [issue, nom] of CONSOMMES) {
  const r = decide(issue);
  ok(R?.refusAvantAppelLens && r.rendu === false && r.raison === null, `${nom} → consommé`, JSON.stringify(r));
}
// Une exception l'emporte sur tout statut (le délai peut tomber après un 429 lu… jamais un rendu sur un doute).
ok(R?.refusAvantAppelLens && decide({ http: 429, erreur: "identify_unavailable", exception: true }).rendu === false, "exception côté worker → consommé, même avec un statut lu");

// ── 3. Le marqueur : seul « rendu » laisse l'article scannable ───────────────
console.log("3. marqueur lens_scan");
ok(R?.STATUT_SCAN_RENDU === "rendu", "STATUT_SCAN_RENDU = « rendu »");
ok(etat(undefined) === "aucun" && etat(null) === "aucun", "pas de marqueur → aucun (réservation sur « IS NULL », comme avant)");
ok(etat({ v: { statut: "rendu", job: "j" }, source: "lens", at: "2026-11-15T08:00:00.000Z" }) === "rendu", "marqueur « rendu » → réservable de nouveau");
for (const s of ["ok", "echec", "en_cours"]) ok(etat({ v: { statut: s }, source: "lens", at: "x" }) === "pose", `marqueur « ${s} » → déjà posé (jamais rescanné)`);
ok(etat({ v: { mode: "identify" }, source: "lens", at: "x" }) === "pose", "marqueur sans statut → déjà posé (prudence)");

// ── 4. Le worker branche la règle ───────────────────────────────────────────
console.log("4. ebay-api-worker");
const W = lire("supabase/functions/ebay-api-worker/index.ts");
const debutScan = W.indexOf("async function scannerLensSiNecessaire(");
const finScan = W.indexOf("\n}\n", debutScan);
const S = debutScan > 0 && finScan > debutScan ? W.slice(debutScan, finScan) : "";
ok(S.length > 0, "scannerLensSiNecessaire trouvée");
ok(/import \{[^}]*\brefusAvantAppelLens\b[^}]*\} from "\.\.\/_shared\/lens-scan-refus-avant-appel\.js";/.test(W), "le worker importe la règle partagée");
ok(S.includes("refusAvantAppelLens({ http: httpLens, erreur: erreurLens, exception: exceptionLens })"), "l'issue de l'appel est jugée par la règle");
const iDecision = S.indexOf("refusAvantAppelLens({");
const iEchec = S.indexOf('marqueur({ statut: "echec"');
ok(iDecision > 0 && iEchec > iDecision, "la règle est jugée AVANT l'écriture « echec »");
ok(/marqueur\(\{ statut: STATUT_SCAN_RENDU,[\s\S]{0,400}?\.eq\("id", job\.inventaire_id\)\.eq\("user_id", job\.user_id\)\s*\.eq\("attributs->lens_scan->v->>statut", "en_cours"\)\.eq\("attributs->lens_scan->v->>job", job\.id\)\.eq\("attributs->lens_scan->>at", at\)/.test(S),
  "la réservation est rendue par un UPDATE conditionnel sur SA réservation (en_cours, son job, son horodatage)");
ok(S.includes('.is("attributs->lens_scan", null)'), "réservation d'un article jamais scanné : inchangée (IS NULL)");
ok(/\.eq\("attributs->lens_scan->v->>statut", STATUT_SCAN_RENDU\)\.eq\("attributs->lens_scan->>at", /.test(S), "réservation d'un article rendu : sur CE marqueur exact (statut rendu + horodatage lu)");
ok(S.includes('etatMarqueurScanLens(attributs?.lens_scan)'), "le marqueur lu passe par la règle (rendu = réservable)");
ok(/passe\?\.rendus\?\.has\(job\.inventaire_id\)/.test(S) && /passe\?\.rendus\?\.add\(job\.inventaire_id\)/.test(S), "jamais deux essais sur le même article dans le même passage");
ok(/const passe: Passe = \{ scans: 0, debut: Date\.now\(\), rendus: new Set<number>\(\) \};/.test(W), "le passage porte l'ensemble des articles rendus");
ok((S.match(/functions\/v1\/lens-analysis/g) ?? []).length === 1, "UN seul appel à lens-analysis par passage dans la fonction (aucune relance en boucle)");
ok(S.includes("if (passe) passe.scans += 1;") && S.indexOf("if (passe) passe.scans += 1;") < S.indexOf("functions/v1/lens-analysis"), "chaque essai compte toujours dans la borne de la passe");
ok(/const SCANS_MAX_PAR_PASSE = 3;/.test(W), "borne de 3 scans par passe inchangée");
ok(S.includes('console.warn(`[ebay-api-worker] Lens identify refusé AVANT appel'), "la raison du rendu est écrite au journal");

// ── 5. La preuve « avant appel » tient dans lens-analysis ────────────────────
console.log("5. lens-analysis : la preuve");
const L = lire("supabase/functions/lens-analysis/index.ts");
const iPremierAppel = L.indexOf("const { data: spend, error: spendErr } = estIdentify");
const iIdentifyUnavailable = L.indexOf('JSON.stringify({ error: "identify_unavailable", budget: budget.motif })');
const iRateLimited = L.indexOf('JSON.stringify({ error: "rate_limited" })');
const iInterne = L.indexOf('JSON.stringify({ error: "appel_interne_invalide" })');
const iUrls = L.indexOf('JSON.stringify({ error: "Missing urls" })');
const iCle = L.indexOf('JSON.stringify({ error: "Missing API key" })');
const iBudget503 = L.indexOf('JSON.stringify({ error: "ai_unavailable", retry_after: 30, budget: budget.motif })');
const iAppelIdentify = L.indexOf("    if (estIdentify) {\n      data = await appelerAvecRepliImage({});\n      trackUsage(data);\n    } else {");
ok(iPremierAppel > 0 && iAppelIdentify > iPremierAppel, "le premier appel de l'identify vient après le (non-)débit");
for (const [i, nom] of [[iIdentifyUnavailable, "429 identify_unavailable"], [iRateLimited, "429 rate_limited"], [iInterne, "400 appel_interne_invalide"], [iUrls, "400 Missing urls"], [iCle, "500 Missing API key"], [iBudget503, "503 ai_unavailable du filet"]]) {
  ok(i > 0 && i < iPremierAppel, `${nom} : rendu AVANT tout débit et tout appel`);
}
ok((L.match(/isAiUnavailable = true/g) ?? []).length === 1 && L.indexOf("isAiUnavailable = true") < L.indexOf("async function callClaude("), "« ai_unavailable » ne naît que de fetchWithRetry (3 essais sans réponse)");
ok(L.includes('if (err?.isAiUnavailable) {\n      return new Response(JSON.stringify({ error: "ai_unavailable", retry_after: 30 }), {\n        status: 503'), "le 503 ai_unavailable de l'échec : seulement sur cette erreur");
ok(L.includes('throw new Error(_lang === "en" ? "AI response could not be parsed" : "Réponse IA non parsable");'), "après un appel abouti, la passe de réparation ratée rend « Réponse IA non parsable » (consommé), jamais ai_unavailable");
ok(/console\.warn\("\[lens-analysis\] traduction FR impossible —", \(e as Error\)\?\.message \?\? e\);\n    return null;/.test(L), "la traduction avale ses erreurs : elle ne change jamais la réponse");
ok((L.match(/new Error\(`Anthropic \$\{r\.status\}: \$\{t\}`\)/g) ?? []).length === 1, "« Anthropic NNN » ne naît que de callClaude (réponse d'erreur de l'IA)");

console.log(`\nebay-scan-refus-avant-appel-selftest : ${verts} ok, ${rouges} raté(s)`);
if (rouges) process.exit(1);
