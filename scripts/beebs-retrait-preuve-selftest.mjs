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
  REGLE_DEUX_CONSTATS_404, deuxConstats404Prouvent, constats404Beebs, attente404Beebs, messageRetraitBeebs404,
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
// (25/10) + jugerConstats404Beebs : preuveAbsenceMesAnnonces juge les constats « page 404 » d'un retrait.
// (29/10, lot B 4.9) + la règle « suppression envoyée + deux 404 après l'envoi » et le résumé de la lecture (R6).
const src = [bj.match(/^const REGLE_SUPPRESSION_ENVOYEE_404 = .*$/m)?.[0] ?? "", extraire("produitVenduSurBeebs"), extraire("jugerConstats404Beebs"), extraire("jugerConstats404ApresEnvoi"),
  extraire("resumeLectureMesAnnonces"), extraire("preuveAbsenceMesAnnonces"), extraire("preuveRetraitDepuis"), extraire("confirmerRetraitParMesAnnonces")].join("\n");
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
// (24/10, 0.6.133) Encore listée, mais la fiche produit du numéro EXACT dit SoldOut : vendue sur Beebs, plus achetable.
const listee = L([], [...nico, "34097677"], 10);
const vsb1 = await fabrique([listee], { pageAnnonce: { http: 200, produit: true, sku: "34097677", disponibilite: "SoldOut" } }).confirmerRetraitParMesAnnonces("34097677", t);
ok(vsb1.success === true && vsb1.preuveRetrait?.source === "page_produit" && vsb1.preuveRetrait.vendue === true && vsb1.preuveRetrait.numero === "34097677"
  && preuveRetraitBeebsValide({ preuve_retrait: vsb1.preuveRetrait }), "listée mais SoldOut (sku exact) → succès AVEC la preuve « page_produit », acceptée par le serveur", JSON.stringify(vsb1));
const vsb2 = await fabrique([listee], { pageAnnonce: { http: 200, produit: true, sku: "34097677", disponibilite: "InStock" } }).preuveAbsenceMesAnnonces("34097677", t);
ok(vsb2.verdict === "presente", "listée et InStock (page encore en cache) : présente, rien n'est conclu");
const vsb3 = await fabrique([listee], { pageAnnonce: { http: 200, produit: true, sku: "34000001", disponibilite: "SoldOut" } }).preuveAbsenceMesAnnonces("34097677", t);
ok(vsb3.verdict === "presente", "SoldOut d'un AUTRE produit de la page : jamais une preuve");
const vsb4 = await fabrique([listee], { pageAnnonce: { http: 404, produit: false, sku: "34097677", disponibilite: "SoldOut" } }).preuveAbsenceMesAnnonces("34097677", t);
ok(vsb4.verdict === "presente", "page sans réponse 200 : jamais une preuve");

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
  // (25/10) Sans contexte de retrait (republication, preuve relue) : la règle du 04/10 seule — l'index qui la
  // porte encore bloque. Pour un RETRAIT, la même lecture devient un CONSTAT (section 3 ter) : deux constats à
  // 6 h d'écart prouvent le retrait même si l'index la porte encore (boncoin59300, 33747519).
  const idx = await fabrique([jo], { pageAnnonce: { http: 404, produit: false }, index: true }).preuveAbsenceMesAnnonces("33909468", t);
  ok(idx.verdict === "illisible" && !("constats404" in (idx.lecture ?? {})), "page 404 mais l'index la porte encore (cache), hors retrait : rien n'est conclu, aucun constat");
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

console.log("\n3 ter. (25/10) UN RETRAIT : DEUX CONSTATS « PAGE 404 » À 6 H D'ÉCART PROUVENT, MÊME SI L'INDEX LA PORTE ENCORE");
// boncoin59300, retrait d87c8614 (annonce 33747519) : compte de 1 103+ annonces, « en ligne » rend 60 annonces,
// « en vérification » lue en entier ne la porte pas, page « 404 - Oups, page perdue ! » sans fiche ni bouton (25/10
// au matin), index public qui la porte encore (relevé 25/10 00:37) : 20 essais jamais conclus. L'index est en retard.
{
  const soixante = Array.from({ length: 60 }, (_, k) => String(34100000 + k));
  const bc = L([], soixante, 1103);
  const p404 = { pageAnnonce: { http: 404, produit: false }, index: true };
  const il = (h) => new Date(Date.now() - h * 3600_000).toISOString();
  const c0 = { le: il(7), page_http: 404, produit: false, en_verification: "complete", en_ligne: "60/1103", index: "la_porte_encore" };
  const r1 = await fabrique([bc], p404).preuveAbsenceMesAnnonces("33747519", t, { constats404: [] });
  ok(r1.verdict === "illisible" && r1.lecture?.constats404?.length === 1 && r1.lecture.constats404[0].page_http === 404
    && r1.lecture.constats404[0].en_verification === "complete" && r1.lecture.constats404[0].index === "la_porte_encore",
    "premier constat : rien n'est conclu, le constat est rendu (404, hors vérification, index qui la porte)", JSON.stringify(r1.lecture?.constats404));
  const r2 = await fabrique([bc], p404).preuveAbsenceMesAnnonces("33747519", t, { constats404: [{ ...c0, le: il(2) }] });
  ok(r2.verdict === "illisible" && r2.lecture?.constats404?.length === 2, "second constat 2 h après le premier : pas encore (6 h au moins)");
  const r3 = await fabrique([bc], p404).preuveAbsenceMesAnnonces("33747519", t, { constats404: [c0] });
  ok(r3.verdict === "absente" && r3.lecture?.preuve_annonce?.regle === REGLE_DEUX_CONSTATS_404 && r3.lecture.preuve_annonce.constats_404.length === 2
    && r3.lecture.preuve_annonce.page_http === 404 && r3.lecture.preuve_annonce.en_verification === "complete",
    "second constat 7 h après le premier : RETIRÉE, avec la preuve (les deux dates)", JSON.stringify(r3.lecture?.preuve_annonce));
  const fn = new Function("lireIdsMesAnnoncesBeebs", "sleep", "pageAnnonceBeebs", "presenceIndexBeebs", `${src}; return preuveRetraitDepuis;`)(null, null, null, null);
  const preuve404 = fn(r3.lecture, "33747519", "deja_absente");
  ok(preuve404.source === "mes_annonces" && preuve404.absente === true && preuve404.annonce?.regle === REGLE_DEUX_CONSTATS_404
    && preuveRetraitBeebsValide({ preuve_retrait: preuve404 }) && verdictClotureRetraitBeebs({ preuve_retrait: preuve404 }, "2026-10-25T12:00:00Z+abc1234 · v0.6.143") === "ok",
    "la preuve écrite (« déjà retirée de Beebs ») est acceptée par le serveur, qui la revérifie", JSON.stringify(preuve404.annonce));
  ok(!preuveRetraitBeebsValide({ preuve_retrait: { ...preuve404, annonce: { ...preuve404.annonce, constats_404: [il(1)] } } })
    && !preuveRetraitBeebsValide({ preuve_retrait: { ...preuve404, annonce: { ...preuve404.annonce, constats_404: [il(3), il(1)] } } })
    && verdictClotureRetraitBeebs({ preuve_retrait: { ...preuve404, annonce: { ...preuve404.annonce, constats_404: [il(3), il(1)] } } }, "2026-10-25T12:00:00Z+abc1234 · v0.6.143") === "refuser",
    "un seul constat, ou deux à moins de 6 h : jamais crus sur parole (refusé → vérification)");
  const enVente = await fabrique([bc], { pageAnnonce: { http: 200, produit: true }, index: true }).preuveAbsenceMesAnnonces("33747519", t, { constats404: [c0] });
  ok(enVente.verdict === "presente" && Array.isArray(enVente.lecture?.constats404) && enVente.lecture.constats404.length === 0,
    "la page se relit 200 avec fiche : présente, les constats repartent de zéro");
  const verif = await fabrique([L(["33747519"], soixante, 1103)], p404).preuveAbsenceMesAnnonces("33747519", t, { constats404: [c0] });
  ok(verif.verdict === "presente" && verif.lecture?.constats404?.length === 0, "revenue « en vérification » : présente, constats remis à zéro (jamais une preuve)");
  const sansVerif = await fabrique([{ ok: false, ids: soixante, pages: [{ page: "en_verification", ok: false, ids: [], n: 0, motif: "x" }, page("en_ligne", soixante, 1103)] }], p404)
    .preuveAbsenceMesAnnonces("33747519", t, { constats404: [c0] });
  ok(sansVerif.verdict === "illisible" && !("constats404" in (sansVerif.lecture ?? {})), "« en vérification » illisible : aucun constat (c'est elle qui sépare un 404 d'une vérification)");
  const ancienFaux = await fabrique([bc], p404).preuveAbsenceMesAnnonces("33747519", t, { constats404: [{ ...c0, en_verification: "illisible" }, { le: "pas une date" }] });
  ok(ancienFaux.verdict === "illisible" && ancienFaux.lecture?.constats404?.length === 1, "un « constat » mal formé n'est jamais compté");
  const beaucoup = Array.from({ length: 9 }, (_, k) => ({ ...c0, le: il(5 - k * 0.5) }));
  const garde = await fabrique([bc], p404).preuveAbsenceMesAnnonces("33747519", t, { constats404: [c0, ...beaucoup] });
  ok(garde.verdict === "absente" && (garde.lecture?.constats404 ?? []).length <= 6 && garde.lecture.constats404[0].le === c0.le,
    "onze constats : le PREMIER est toujours gardé (il date l'écart), la liste reste courte (6)");

  // Le câblage : retrait seulement, constats rendus, gardés par le background, attente datée côté serveur.
  const dlb = bj.slice(bj.indexOf("async function deleteListing(job)"), bj.indexOf("// ⚠️⚠️ AUCUNE MESURE DE LAYOUT DANS CE FICHIER"));
  ok(/const ctxPreuve = job\?\.action === "delete"/.test(dlb) && (dlb.match(/beebs404Constats: preuve\.lecture\.constats404/g) ?? []).length === 1
    // (29/10, lot B 4.9) 3 reprises + la sortie « absente » (sortieAbsente) : les constats et le résumé de la lecture partent aussi.
    && (dlb.match(/\.\.\.constatsDe\(preuve\)/g) ?? []).length === 4, "deleteListing : constats du job pour un RETRAIT seulement, rendus au background à chaque reprise");
  ok(/MESSAGE_CONSTAT_404_BEEBS/.test(dlb) && /Beebs ne montre plus cette annonce/.test(bj) && !/reste en vente/.test(bj.slice(bj.indexOf("const MESSAGE_CONSTAT_404_BEEBS"), bj.indexOf("const MESSAGE_CONSTAT_404_BEEBS") + 500)),
    "le message d'un constat est vrai (introuvable, hors vérification, index en retard) — jamais « encore en vente »");
  const bgr = lire("chrome-extension/background.js");
  const rep = bgr.slice(bgr.indexOf("} else if (result && !result.success && result.reprise) {"), bgr.indexOf("} else if (result && !result.success && result.reprise) {") + 1600);
  ok(/Array\.isArray\(result\.beebs404Constats\)/.test(rep) && /pfC\.beebs_404_constats = result\.beebs404Constats/.test(rep)
    && rep.indexOf("job.platform_fields = pfC;") < rep.indexOf("await rearmBounded(accessToken, job"), "background : les constats sont posés sur le job AVANT rearmBounded (la trace survit à la reprise)");
  const uj = lire("supabase/functions/update-job-status/index.ts");
  const b404 = uj.slice(uj.indexOf("RETRAIT BEEBS : PAGE 404 CONSTATÉE"), uj.indexOf("RETRAIT BEEBS : PAGE 404 CONSTATÉE") + 4000);
  // (29/10, lot B 4.9) Les constats d'un retrait : ceux du 25/10, ou — après une suppression ENVOYÉE — ceux d'après l'envoi ;
  // le message dit alors l'envoi (messageRetraitBeebsApresEnvoi404).
  ok(/constats404DuRetraitBeebs\(pfCorps404\)/.test(b404) && /jrow404\?\.action === "delete" && jrow404\.platform === "beebs"/.test(b404)
    && /needsUserAttempts: Number\(pfBase404\.needsUserAttempts \?\? 0\) \|\| 0/.test(b404) && /next_action_after: attente\.prochain/.test(b404)
    && /statutEffectif = "pending";/.test(b404)
    && /messageEffectif = constats404Beebs\(pfCorps404\)\.length \? messageRetraitBeebs404\(constats404\) : messageRetraitBeebsApresEnvoi404\(pfCorps404\);/.test(b404),
    "update-job-status : attente du second constat = pending, aucun essai consommé, prochain essai à 6 h du premier, message vrai");
  ok(uj.indexOf("RETRAIT BEEBS : PAGE 404 CONSTATÉE") > uj.indexOf("const RETRAIT_VERIF_BEEBS_RE") && /if \(!pfRetraitVerif && !pfCanalCoupe/.test(b404),
    "… après la règle « en vérification » (qui garde la main), jamais par-dessus un canal coupé");
  // Le LIEN texte de l'extension ↔ règle du serveur (même garde que retrait-beebs-verification) : seul un essai qui a
  // lu la page 404 arme l'attente — une session fermée ou une lecture ratée, constats sur le job ou pas, gardent leur chemin.
  const reSrc = b404.match(/const CONSTAT_404_BEEBS_RE = \/(.+)\/;/)?.[1] ?? null;
  const texteExt = (bj.match(/const MESSAGE_CONSTAT_404_BEEBS =\s*((?:"[^"]*"\s*\+?\s*)+);/)?.[1] ?? "").split(/"\s*\+\s*"/).join("").replace(/^"|"$/g, "");
  const re404 = reSrc ? new RegExp(reSrc) : null;
  ok(Boolean(re404 && texteExt && re404.test(texteExt) && re404.test(`${texteExt}. Nouvel essai automatique (tentative 2/5), rien à faire.`)
    && /typeof body\.error === "string" && CONSTAT_404_BEEBS_RE\.test\(body\.error\)/.test(b404)
    && !re404.test("Page de l'annonce sans bouton « Supprimer l'annonce », et « Mes annonces » illisible en entier — rien n'a été touché, nouvel essai")),
    "le texte de l'extension arme la règle (ré-armé compris) ; « Mes annonces » illisible ne l'arme jamais", texteExt.slice(0, 80));
  const cs = constats404Beebs({ beebs_404_constats: [{ ...c0, le: il(1) }, c0, { le: il(2) }] });
  ok(cs.length === 2 && cs[0].le === c0.le, "serveur : constats valides, du plus ancien au plus récent");
  const att = attente404Beebs([c0]);
  ok(Date.parse(att.prochain) >= Date.now() + 30 * 60_000 - 1000 && attente404Beebs([{ ...c0, le: il(1) }]).prochain > il(-4.9),
    "prochain essai : 6 h (et 2 min) après le premier constat, jamais avant 30 min");
  const m = messageRetraitBeebs404([c0]);
  ok(/introuvable depuis le \d{2}\/\d{2} à \d{2}h\d{2}/.test(m) && /n'est plus achetable/.test(m) && /index public/.test(m) && /rien à faire/.test(m) && !/en vente/.test(m),
    "message daté et vrai : introuvable depuis…, plus achetable, l'index en retard, rien à faire", m);
  ok(deuxConstats404Prouvent([il(7), il(0)]) && !deuxConstats404Prouvent([il(5), il(0)]) && !deuxConstats404Prouvent([il(9)]), "deux dates à 6 h ou plus : preuve ; sinon non");
}

console.log("\n4. LES CHEMINS DE CLÔTURE");
const dl = bj.slice(bj.indexOf("async function deleteListing(job)"), bj.indexOf("// ⚠️⚠️ AUCUNE MESURE DE LAYOUT DANS CE FICHIER"));
// (29/10, lot B 4.9 C) chaque chemin dit comment l'annonce a été vue en ligne avant l'envoi (bouton de sa page, de sa carte).
ok((dl.match(/await confirmerRetraitParMesAnnonces\(idCible, t, \{ par: "(bouton_page|carte_mes_annonces)" \}\)/g) ?? []).length === 2, "les deux chemins (page de l'annonce, carte) relisent « Mes annonces » après la confirmation");
ok(!/return \{ success: true \}/.test(dl) && !/return \{ success: true, trace \}/.test(dl), "aucun succès sans preuve dans deleteListing");
// (25/10) Les deux appels portent le contexte du retrait (ses constats « page 404 ») : ctxPreuve.
ok((dl.match(/await preuveAbsenceMesAnnonces\(idCible, t, ctxPreuve\)/g) ?? []).length === 2, "page sans bouton / carte introuvable : la liste complète tranche");
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

console.log("\n4. (24/10, 0.6.133) VENDUE SUR BEEBS : LA FICHE PRODUIT DU NUMÉRO EXACT DIT « SoldOut »");
// Retraits « Suppression envoyée… encore dans Mes annonces » depuis le 14/10 (DeadRoz 34083968, Joséphine 34116769) :
// Beebs passe « Vendu » l'annonce supprimée avec le motif « Vendu via une autre plateforme » et la garde dans
// « Mes annonces ». Pages relues le 24/10 : ld+json Product sku = le numéro, availability SoldOut.
const vendue = { source: "page_produit", vendue: true, numero: "34083968", disponibilite: "SoldOut", moment: "apres_confirmation" };
ok(preuveRetraitBeebsValide({ preuve_retrait: vendue }), "fiche produit SoldOut du numéro exact : preuve valide");
ok(!preuveRetraitBeebsValide({ preuve_retrait: { ...vendue, disponibilite: "InStock" } }), "InStock (page en cache) : jamais une preuve");
ok(!preuveRetraitBeebsValide({ preuve_retrait: { ...vendue, vendue: false } }), "vendue non dite : pas une preuve");
ok(!preuveRetraitBeebsValide({ preuve_retrait: { ...vendue, numero: "" } }), "sans numéro : pas une preuve");
ok(!preuveRetraitBeebsValide({ preuve_retrait: { ...vendue, source: "page_publique" } }), "une autre source : pas une preuve");
ok(verdictClotureRetraitBeebs({ preuve_retrait: vendue }, "2026-10-24T12:00:00Z+abc1234 · v0.6.133") === "ok", "0.6.133 avec la fiche SoldOut : clos");
const bjs = lire("chrome-extension/content-scripts/beebs.js");
const fn = bjs.slice(bjs.indexOf("async function produitVenduSurBeebs("), bjs.indexOf("async function produitVenduSurBeebs(") + 600);
ok(/page\.http === 200 && page\.sku === String\(idCible\) && page\.disponibilite === "SoldOut"/.test(fn), "extension : page 200, sku EXACT, SoldOut — les trois");
ok(/String\(x\?\.sku \?\? x\?\.productID \?\? ""\) === String\(id\)/.test(bjs), "extension : la fiche Product de CE numéro, jamais un autre produit de la page");
const pAbs = bjs.slice(bjs.indexOf("async function preuveAbsenceMesAnnonces("), bjs.indexOf("function preuveRetraitDepuis("));
// (25/10) « présente » rend aussi les constats remis à zéro (lecture: { ...lecture, ...constatsRemis }).
ok(pAbs.indexOf("produitVenduSurBeebs(idCible)") > 0 && pAbs.indexOf("produitVenduSurBeebs(idCible)") < pAbs.indexOf('return { verdict: "presente", lecture: { ...lecture, ...constatsRemis } };'),
  "extension : encore dans « Mes annonces » → la fiche produit est relue avant de conclure « présente »");
const del = bjs.slice(bjs.indexOf("async function deleteListing("), bjs.indexOf("// ── CHEMIN 1 (nominal depuis le 11/09)"));
ok(/const dejaVendue = await produitVenduSurBeebs\(idCible\);/.test(del) && /aucun clic/.test(del), "extension : déjà vendue → aucun nouveau clic, retrait fait avec sa preuve");
ok(/source: "page_produit", vendue: true, numero: String\(idCible\)/.test(bjs), "extension : la preuve « page_produit » porte le numéro");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ retrait Beebs : jamais clos sans la liste du propriétaire relue, ou la fiche produit qui dit vendue");
