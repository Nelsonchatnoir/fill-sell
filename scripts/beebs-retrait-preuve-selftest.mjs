// Autotest — un retrait Beebs n'est jamais clos sans preuve (03/10, point 4) —
// `npm run selftest:beebs-retrait-preuve`
// Cas fondateur : bouilloire de Nico (Beebs 34097677, retrait 451c9bc4,
// 03/10 10:12) — essai 1 sur une page sans bouton propriétaire, essai 2 qui
// confirme, « supprimé » sans relecture, diagnostic de l'essai 1 resté sur le
// job. Vérifié en ligne le 03/10 à 12:55 : absente des deux onglets de
// « Mes annonces » (le retrait avait bien eu lieu — mais rien ne le prouvait).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILD_BEEBS_PREUVE_RETRAIT, preuveRetraitBeebsValide, verdictClotureRetraitBeebs,
  jugerRetraitBeebsParReleves, numeroRetraitBeebs, MESSAGE_RETRAIT_BEEBS_EN_VERIFICATION,
} from "../supabase/functions/_shared/beebs-preuve-retrait.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LA CLÔTURE « SUPPRIMÉ » D'UN RETRAIT BEEBS");
const preuve = { source: "mes_annonces", absente: true, numero: "34097677", moment: "apres_confirmation", pages: [{ page: "en_verification", n: 1 }, { page: "en_ligne", n: 9, annoncees: 9 }] };
ok(preuveRetraitBeebsValide({ preuve_retrait: preuve }), "preuve « Mes annonces » relue : valide");
ok(!preuveRetraitBeebsValide({ preuve_retrait: { ...preuve, source: "page_publique" } }), "page publique : jamais une preuve");
ok(!preuveRetraitBeebsValide({ preuve_retrait: { ...preuve, absente: false } }), "encore listée : pas une preuve");
ok(verdictClotureRetraitBeebs({ preuve_retrait: preuve }, "2026-10-03T15:00:00Z+abc1234 · v0.6.90") === "ok", "0.6.90 avec preuve : clos");
ok(verdictClotureRetraitBeebs({}, "2026-10-03T15:00:00Z+abc1234 · v0.6.90") === "refuser", "0.6.90 SANS preuve : refusé (vérification, jamais clos)");
ok(verdictClotureRetraitBeebs({ delete_trace: ["confirmation envoyée"] }, "2026-10-02T19:15:37Z+1a49399 · v0.6.89") === "marquer",
  "0.6.89 (la bouilloire) : accepté mais MARQUÉ, les relevés tranchent");
ok(verdictClotureRetraitBeebs({}, null) === "marquer", "build inconnu : marqué, jamais refusé à l'aveugle");
ok(Date.parse(BUILD_BEEBS_PREUVE_RETRAIT) > Date.parse("2026-10-02T19:15:37Z"), "le seuil est postérieur à la 0.6.89 servie");
ok(/en vérification/.test(MESSAGE_RETRAIT_BEEBS_EN_VERIFICATION) && /Mes annonces/.test(MESSAGE_RETRAIT_BEEBS_EN_VERIFICATION) && !/notre côté|développeur/i.test(MESSAGE_RETRAIT_BEEBS_EN_VERIFICATION),
  "message de vérification : vrai, simple");

console.log("\n2. LES RELEVÉS TRANCHENT UN RETRAIT MARQUÉ (postes < 0.6.90)");
const job = { platform: "beebs", action: "delete", status: "deleted", listing_url: "https://www.beebs.app/fr/p/34097677-bouilloire",
  platform_fields: { retrait_sans_preuve_proprietaire: { le: "2026-10-03T08:30:09Z", build: "2026-10-02T19:15:37Z+1a49399" } } };
ok(numeroRetraitBeebs(job) === "34097677", "numéro lu sur le lien");
const R = (at, vus, tot, erreur = null) => ({ status: "done", started_at: at, items_vus: vus, total_entries: tot, erreur });
ok(jugerRetraitBeebsParReleves(job, { releves: [], annonces: [] }) === null, "aucun relevé depuis : rien n'est conclu");
ok(jugerRetraitBeebsParReleves(job, { releves: [R("2026-10-03T12:00:00Z", 9, 9)], annonces: [] }) === null, "un seul relevé complet sans elle : on attend le second");
const v2 = jugerRetraitBeebsParReleves(job, { releves: [R("2026-10-03T18:00:00Z", 9, 9), R("2026-10-03T12:00:00Z", 9, 9)], annonces: [] });
ok(v2?.verdict === "prouve", "deux relevés complets sans elle : preuve écrite", JSON.stringify(v2));
const revue = [{ listing_id: "34097677", vu_le: "2026-10-03T12:00:30Z", statut_plateforme: "en_ligne" }];
ok(jugerRetraitBeebsParReleves(job, { releves: [R("2026-10-03T12:00:00Z", 10, 10)], annonces: revue })?.verdict === "rouvrir",
  "revue en ligne dans un relevé complet APRÈS le retrait → le retrait repart (double vente évitée)");
ok(jugerRetraitBeebsParReleves(job, { releves: [R("2026-10-03T12:00:00Z", 10, 10)], annonces: [{ ...revue[0], statut_plateforme: "en_verification" }] })?.verdict === "rouvrir",
  "revue « en vérification » : elle est toujours là → le retrait repart");
ok(jugerRetraitBeebsParReleves(job, { releves: [R("2026-10-03T08:31:00Z", 9, 9), R("2026-10-03T08:20:00Z", 9, 9)], annonces: [] }) === null,
  "relevés pendant la propagation (< 2 min après) ou avant : ne comptent pas");
ok(jugerRetraitBeebsParReleves(job, { releves: [R("2026-10-03T12:00:00Z", 5, 9), R("2026-10-03T18:00:00Z", 9, 9, "[incomplet] x")], annonces: [] }) === null,
  "relevés incomplets : ne comptent pas");
ok(jugerRetraitBeebsParReleves({ ...job, platform_fields: { ...job.platform_fields, preuve_retrait: preuve } }, { releves: [R("2026-10-03T12:00:00Z", 9, 9)], annonces: revue }) === null,
  "déjà prouvé par « Mes annonces » : rien à rejuger");

console.log("\n3. L'EXTENSION : LA PREUVE PROPRIÉTAIRE, EXÉCUTÉE");
const bj = lire("chrome-extension/content-scripts/beebs.js");
const extraire = (nom) => {
  const d = bj.indexOf(`async function ${nom}(`) >= 0 ? bj.indexOf(`async function ${nom}(`) : bj.indexOf(`function ${nom}(`);
  if (d < 0) throw new Error(`${nom} absent de beebs.js`);
  const f = bj.indexOf("\n}\n", d);
  return bj.slice(d, f + 2);
};
const src = [extraire("preuveAbsenceMesAnnonces"), extraire("preuveRetraitDepuis"), extraire("confirmerRetraitParMesAnnonces")].join("\n");
// (04/10) La page de l'annonce et l'index, simulés : par défaut ILLISIBLES
// (aucune réponse), donc jamais une preuve par accident.
const fabrique = (lectures, { pageAnnonce = { http: null, produit: false }, index = null } = {}) => {
  let i = 0;
  const lireIdsMesAnnoncesBeebs = async () => lectures[Math.min(i++, lectures.length - 1)];
  const sleep = async () => {};
  const pageAnnonceBeebs = async () => pageAnnonce;
  const presenceIndexBeebs = async () => index;
  return new Function("lireIdsMesAnnoncesBeebs", "sleep", "pageAnnonceBeebs", "presenceIndexBeebs",
    `${src}; return { preuveAbsenceMesAnnonces, confirmerRetraitParMesAnnonces };`)(lireIdsMesAnnoncesBeebs, sleep, pageAnnonceBeebs, presenceIndexBeebs);
};
const page = (p, ids, annoncees = null) => ({ page: p, ok: true, ids, n: ids.length, ...(annoncees != null ? { annoncees } : {}) });
const L = (verif, ligne, annoncees) => ({ ok: true, lu_le: "2026-10-03T10:55:00Z", ids: [...verif, ...ligne], pages: [page("en_verification", verif), page("en_ligne", ligne, annoncees)] });
const t = () => {};
const nico = ["34083630", "34095479", "34090327", "34085052", "34076509", "34077175", "34005631", "34003891", "33991304"];
const a = await fabrique([L(["34099999"], nico, 9)]).preuveAbsenceMesAnnonces("34097677", t);
ok(a.verdict === "absente", "relevé RÉEL du 03/10 (9 en ligne, 1 en vérification) : bouilloire absente → preuve");
const p = await fabrique([L([], [...nico, "34097677"], 10)]).preuveAbsenceMesAnnonces("34097677", t);
ok(p.verdict === "presente", "encore listée → présente");
const inc = await fabrique([L([], nico.slice(0, 5), 9)]).preuveAbsenceMesAnnonces("34097677", t);
ok(inc.verdict === "illisible", "liste partielle (5 lues sur 9 annoncées) : rien n'est conclu");
const ill = await fabrique([{ ok: false, ids: [], pages: [{ page: "en_verification", ok: false, ids: [], n: 0, motif: "renvoyée vers /fr/auth" }, page("en_ligne", nico, 9)] }]).preuveAbsenceMesAnnonces("34097677", t);
ok(ill.verdict === "illisible", "un onglet illisible : rien n'est conclu");
const c1 = await fabrique([L([], [...nico, "34097677"], 10), L([], [...nico, "34097677"], 10), L([], nico, 9)]).confirmerRetraitParMesAnnonces("34097677", t);
ok(c1.success === true && c1.preuveRetrait?.source === "mes_annonces" && c1.preuveRetrait.numero === "34097677",
  "propagation asynchrone : listée 2 fois puis absente → succès AVEC la preuve", JSON.stringify(c1));
const c2 = await fabrique([L([], [...nico, "34097677"], 10)]).confirmerRetraitParMesAnnonces("34097677", t);
ok(c2.success === false && c2.reprise === true && c2.suppressionEnvoyee === true && /vérification au prochain passage/.test(c2.error),
  "toujours listée après 2 min : jamais « supprimé », vérification au passage suivant");

console.log("\n3 bis. UN GROS COMPTE : « EN LIGNE » TRONQUÉE À 60 (04/10, Joséphine, ~190 annonces)");
{
  const soixante = Array.from({ length: 60 }, (_, k) => String(34000000 + k));
  const jo = L([], soixante, 190);
  const r404 = await fabrique([jo], { pageAnnonce: { http: 404, produit: false }, index: false }).preuveAbsenceMesAnnonces("33909468", t);
  ok(r404.verdict === "absente" && r404.lecture?.preuve_annonce?.page_http === 404 && r404.lecture.preuve_annonce.index === "absente",
    "chino de golf : liste tronquée, page 404 sans fiche, hors vérification, hors index → retirée, AVEC la preuve", JSON.stringify(r404.lecture?.preuve_annonce));
  const c = await fabrique([jo], { pageAnnonce: { http: 404, produit: false }, index: false }).confirmerRetraitParMesAnnonces("34055112", t);
  ok(c.success === true && c.preuveRetrait?.source === "mes_annonces" && c.preuveRetrait.annonce?.page_http === 404,
    "retrait ou republication confirmés : la preuve porte la page de l'annonce", JSON.stringify(c.preuveRetrait));
  const idx = await fabrique([jo], { pageAnnonce: { http: 404, produit: false }, index: true }).preuveAbsenceMesAnnonces("33909468", t);
  ok(idx.verdict === "illisible", "page 404 mais l'index la porte encore (cache) : rien n'est conclu");
  const enVente = await fabrique([jo], { pageAnnonce: { http: 200, produit: true }, index: true }).preuveAbsenceMesAnnonces("33917715", t);
  ok(enVente.verdict === "presente", "page 200 avec fiche produit : ENCORE en vente → présente, jamais retirée");
  const verif = await fabrique([L(["33909468"], soixante, 190)], { pageAnnonce: { http: 404, produit: false }, index: false }).preuveAbsenceMesAnnonces("33909468", t);
  ok(verif.verdict === "presente", "page 404 mais EN VÉRIFICATION : présente (une annonce en vérification rend aussi 404)");
  const sansVerif = await fabrique([{ ok: false, ids: soixante, pages: [{ page: "en_verification", ok: false, ids: [], n: 0, motif: "x" }, page("en_ligne", soixante, 190)] }],
    { pageAnnonce: { http: 404, produit: false }, index: false }).preuveAbsenceMesAnnonces("33909468", t);
  ok(sansVerif.verdict === "illisible", "« en vérification » illisible : jamais de preuve par la page seule");
  const pageRatee = await fabrique([jo], { pageAnnonce: { http: null, produit: false }, index: false }).preuveAbsenceMesAnnonces("33909468", t);
  ok(pageRatee.verdict === "illisible", "page de l'annonce illisible : rien n'est conclu");
}

console.log("\n4. LES CHEMINS DE CLÔTURE");
const dl = bj.slice(bj.indexOf("async function deleteListing(job)"), bj.indexOf("// ⚠️⚠️ AUCUNE MESURE DE LAYOUT DANS CE FICHIER"));
ok((dl.match(/await confirmerRetraitParMesAnnonces\(idCible, t\)/g) ?? []).length === 2, "les deux chemins (page de l'annonce, carte) relisent « Mes annonces » après la confirmation");
ok(!/return \{ success: true \}/.test(dl) && !/return \{ success: true, trace \}/.test(dl), "aucun succès sans preuve dans deleteListing");
ok((dl.match(/await preuveAbsenceMesAnnonces\(idCible, t\)/g) ?? []).length === 2, "page sans bouton / carte introuvable : la liste complète tranche");
const bg = lire("chrome-extension/background.js");
ok((bg.match(/\(state === "unavailable" \|\| state === "sold"\) && job\.platform !== "beebs"/g) ?? []).length >= 4,
  "la page publique ne clôt plus un retrait Beebs (retrait, canal coupé, republication ×2)");
ok(/if \(result\.preuveRetrait\) pfOk\.preuve_retrait = result\.preuveRetrait;/.test(bg) && /pfOk\.diagnostic_essai_precedent = pfOk\.last_diagnostic; delete pfOk\.last_diagnostic;/.test(bg)
  && /updateJobStatus\(accessToken, job\.id, "deleted", \{ error: null, platform_fields: pfOk \}\)/.test(bg),
  "clôture : la preuve écrite, le diagnostic d'un essai précédent archivé, l'erreur effacée");
ok(/if \(result\?\.preuveRetrait\) pfApres\.preuve_retrait = result\.preuveRetrait;/.test(bg), "republication : la preuve du retrait est écrite aussi");
const ujs = lire("supabase/functions/update-job-status/index.ts");
ok(/verdictClotureRetraitBeebs\(pfBp, body\.handler_build\)/.test(ujs) && /retrait_sans_preuve_proprietaire = \{/.test(ujs), "update-job-status : refuse ou marque");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/jugerRetraitBeebsParReleves\(j, \{ releves: rRel\.data \?\? \[\], annonces: rAnn\.data \?\? \[\] \}\)/.test(hw), "handler-watch : les relevés tranchent les retraits marqués");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ retrait Beebs : jamais clos sans la liste du propriétaire relue");
