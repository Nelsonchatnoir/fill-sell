// Autotest — un accident avant tout retrait n'est jamais un geste, aussi côté serveur (25/10 nuit)
//   npm run selftest:accident-avant-retrait
//
// Fixtures relevées en prod (lecture seule, 25/10) :
//   · Deborah 83206086 (24/10) : 5 essais, onglet de dépôt muet AVANT tout envoi à la page,
//     brut « Republication interrompue pendant la suppression (onglet de travail vinted : le
//     content script ne répond pas…) », affiché « Relance-la depuis la fiche », 3 reprises
//     brûlées, « En pause » à vie ;
//   · jocabroc bfe46249 (21/10) : 4 coupures au même instant, sortie de boucle « ferme Chrome
//     et Relancer », needs_user depuis.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const m = await import(new URL(`file:///${join(ROOT, "supabase/functions/_shared/accident-avant-retrait.js").replace(/\\/g, "/")}`));
const { accidentAvantRetrait, prochaineRepriseAvantRetrait, coupureSeule, MESSAGE_ACCIDENT_AVANT_RETRAIT } = m;
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const BRUT_DEBORAH = "Republication interrompue pendant la suppression (onglet de travail vinted : le content script ne répond pas, ni après rechargement puis onglet neuf). Relance depuis l'app : l'état réel de l'annonce sera re-vérifié avant tout geste.";
const deborah = {
  platform: "vinted", action: "republish", status: "needs_user",
  error: "L'opération n'a pas pu aboutir sur ton ordinateur. Relance-la depuis la fiche de l'article quand tu veux.",
  platform_fields: {
    republish_step: "captured", capture_id: "17907", vinted_item_id: "10350034040", needs_user_source: "relancer",
    error_technique: { at: "2026-10-24T18:13:24.331Z", brut: BRUT_DEBORAH, pose_par: "update-job-status (requalification affichage G1/G4)" },
    reprises_apres_connexion_n: 3, reprise_apres_connexion_mur: "L'opération n'a pas pu aboutir sur ton ordinateur. Relance-la depuis la fiche de l'article quand tu veux.",
  },
};
const jocabroc = {
  platform: "vinted", action: "republish", status: "needs_user",
  error: "La republication s'interrompt chaque fois au même moment sur ton ordinateur (4 essais de suite, l'onglet Vinted se ferme) : ton annonce est intacte, rien n'a été retiré. Ferme complètement Chrome puis rouvre-le, et appuie sur « Relancer ». Si ça bloque encore, écris-nous : c'est de notre côté, on regarde.",
  platform_fields: {
    republish_step: "captured", capture_id: 16557, vinted_item_id: "10297959284", needs_user_source: "relancer", canal_coupe_rejoue: 4,
    boucle_technique: { essais: 4, signature: "canal_coupe", le: "2026-10-21T07:23:59.834Z" },
    canal_coupe_diag: { url: "https://www.vinted.fr/items/new#fillsell-worker", status: "loading", discarded: false },
  },
};
const avec = (job, pf, extra = {}) => ({ ...job, ...extra, platform_fields: { ...job.platform_fields, ...pf } });

console.log("\n1. LES DEUX CAS DU 21 ET DU 24/10 REPARTENT");
ok(accidentAvantRetrait(deborah)?.signature === "technique", "Deborah : onglet de dépôt muet avant tout envoi → accident avant retrait");
ok(accidentAvantRetrait(jocabroc)?.signature === "boucle_canal_coupe", "jocabroc : même coupure répétée → accident avant retrait (trace de boucle gardée)");
ok(coupureSeule(BRUT_DEBORAH) && coupureSeule(deborah.error), "le brut ET l'affichage G1 se lisent comme une coupure");

console.log("\n2. JAMAIS APRÈS UN RETRAIT, JAMAIS UNE QUESTION, JAMAIS UN MUR QUI A SA RÈGLE");
for (const k of ["deleted_at", "suppression_verdict", "republish_suppression_envoyee", "recreation_tentee", "recreation_envois", "depot_parti_vers_profil", "new_vinted_item_id"]) {
  ok(accidentAvantRetrait(avec(deborah, { [k]: k === "recreation_envois" ? ["2026-10-24T18:12:00Z"] : { at: "x" } })) === null, `trace « ${k} » → rien`);
}
ok(accidentAvantRetrait(avec(deborah, { republish_step: "deleted" })) === null, "étape deleted → rien (recréation : sa règle)");
ok(accidentAvantRetrait(avec(deborah, { needs_user_source: "prevol_negatif" })) === null, "pré-vol négatif (un champ) → rien");
ok(accidentAvantRetrait(avec(deborah, { needs_user_source: "tache_sans_demarrage" })) === null, "tâche sans démarrage → sa règle");
ok(accidentAvantRetrait(avec(deborah, { needsUserField: { field_key: "brand" } })) === null, "question ouverte → rien");
ok(accidentAvantRetrait(avec(deborah, { mur_vinted_verification: { le: "x" } })) === null, "vérification du compte Vinted → geste, rien");
ok(accidentAvantRetrait(avec(deborah, { error_technique: { brut: "Republication en pause avant toute suppression : Motif : protection anti-robot (DataDome)" } },
  { error: "Republication en pause : protection anti-robot" })) === null, "anti-robot → sa pause, rien");
ok(accidentAvantRetrait(avec(deborah, { error_technique: { brut: "Connexion Vinted requise : se connecter sur vinted.fr" } }, { error: "Connexion Vinted requise" })) === null,
  "connexion → geste de la personne, rien");
ok(accidentAvantRetrait(avec(deborah, { error_technique: null }, { error: "Vinted exige « Marque » et l'annonce d'origine ne porte pas cette information." })) === null,
  "motif de la personne → rien");
ok(accidentAvantRetrait({ ...deborah, platform: "leboncoin" }) === null && accidentAvantRetrait({ ...deborah, action: "publish" }) === null
  && accidentAvantRetrait({ ...deborah, status: "pending" }) === null, "Vinted, republication, needs_user seulement");

console.log("\n3. ESPACÉ COMME L'EXTENSION 0.6.134 (5, 20, 60 min puis 3 h) — LA SENTINELLE LIT LE COMPTEUR");
const t0 = Date.parse("2026-10-25T08:00:00Z");
const delais = [];
let pf = {};
for (let i = 0; i < 6; i++) { const r = prochaineRepriseAvantRetrait(pf, { maintenant: t0 }); delais.push(r.delaiMin); pf = { reprise_avant_retrait: r.reprise_avant_retrait }; }
ok(JSON.stringify(delais) === JSON.stringify([5, 20, 60, 180, 180, 180]), "5, 20, 60, 180, 180, 180", JSON.stringify(delais));
ok(pf.reprise_avant_retrait.n === 6, "compteur reprise_avant_retrait.n (sentinelle « accidents_repetes_avant_retrait » au-delà de 3)");
ok(!/minute|heure|\d+\s*min|bientôt/i.test(MESSAGE_ACCIDENT_AVANT_RETRAIT) && /avant toute suppression/.test(MESSAGE_ACCIDENT_AVANT_RETRAIT)
  && !/Relance|Ferme/.test(MESSAGE_ACCIDENT_AVANT_RETRAIT), "message : aucun temps promis, aucun geste, « avant toute suppression »");

console.log("\n4. CÂBLAGE");
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), "utf8"); } catch { return ""; } };
const ujs = lire("supabase/functions/update-job-status/index.ts");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/coupureSeule\(body\.error\)/.test(ujs) && /accidentAvantRetrait\(\{/.test(ujs), "update-job-status : l'accident avant retrait est réglé à l'écriture");
ok(/statutEffectif = "pending";\s*messageEffectif = MESSAGE_ACCIDENT_AVANT_RETRAIT;/.test(ujs) && !/Ferme complètement Chrome/.test(ujs),
  "update-job-status : la sortie de boucle reste en file, plus de « Relancer »");
ok(/\.filter\(\(j\) => accidentAvantRetrait\(j\)\)/.test(hw) && /\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)/.test(hw), "handler-watch : les arrêts déjà en base repartent (écriture gardée)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ un accident avant tout retrait repart seul, espacé ; jamais après un retrait, jamais une question");
