// (07/11 nuit, point 4 — 7373c96c, republication Beebs 1a323b66 « Jean Levi's 514 ») La preuve « suppression envoyée +
// deux pages 404 à 6 h d'écart APRÈS l'envoi » vaut aussi pour une REPUBLICATION. Avant : beebs.js ne la cherchait que
// pour action=delete, processRepublishJobPlateforme ne gardait aucun constat, « Mes annonces » se lisait vide pour ce
// compte — 52 vérifications « suppression non prouvée », puis une question « l'origine n'existe plus » posée à la main.
// Le VRAI code : beebs.js (suppressionEnvoyeeDuJob, jugerConstats404ApresEnvoi, preuveAbsenceMesAnnonces,
// preuveRetraitDepuis), background.js (secondConstatBeebsLe, câblage), _shared/beebs-preuve-retrait.js (miroir serveur).
import fs from "node:fs";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const bj = lire("chrome-extension/content-scripts/beebs.js");
const bg = lire("chrome-extension/background.js");
const P = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/beebs-preuve-retrait.js")).href);
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// Horloge pilotée : les fonctions extraites datent leurs constats avec « new Date() ».
let maintenant = Date.parse("2026-11-08T10:00:00Z");
class DateFigee extends Date {
  constructor(...a) { if (a.length) super(...a); else super(maintenant); }
  static now() { return maintenant; }
}
const page = { http: 404, produit: false };
const lecture = { ok: false, lu_le: null, ids: [], pages: [
  { page: "en_verification", ok: false, motif: "réponse vide", ids: [] },
  { page: "en_ligne", ok: true, n: 0, annoncees: 267, ids: [] },
] };
const fabrique = () => new Function("Date", "lireIdsMesAnnoncesBeebs", "produitVenduSurBeebs", "pageAnnonceBeebs", "presenceIndexBeebs",
  `const REGLE_SUPPRESSION_ENVOYEE_404 = "suppression_envoyee_deux_404";\n`
  + ["suppressionEnvoyeeDuJob", "jugerConstats404Beebs", "jugerConstats404ApresEnvoi", "preuveAbsenceMesAnnonces", "preuveRetraitDepuis"]
    .map((f) => extraireFonctionJs(bj, f)).join("\n")
  + "\nreturn { suppressionEnvoyeeDuJob, preuveAbsenceMesAnnonces, preuveRetraitDepuis };")(
  DateFigee, async () => ({ ...lecture, lu_le: new DateFigee().toISOString() }), async () => null, async () => ({ ...page }), async () => true);
const B = fabrique();
const t = () => {};

const NUM = "34165538";
const pf1a3 = { republish_step: "captured", republish_suppression_envoyee: { annonce: NUM, at: "2026-10-26T08:12:17.094Z" } };
const job = { action: "republish", platform: "beebs", listing_url: `https://www.beebs.app/fr/p/${NUM}`, platform_fields: pf1a3 };

// ═══ 1. L'envoi d'une republication d'avant la 0.6.179 : son marqueur, pour son numéro exact ══════════════════
const envoi = B.suppressionEnvoyeeDuJob(job, NUM);
ok(envoi && envoi.le === "2026-10-26T08:12:17.094Z" && envoi.vue_en_ligne_avant, "1a323b66 : l'envoi du 26/10 08:12 vaut fait (annonce vue en ligne : bouton du dialogue)");
ok(B.suppressionEnvoyeeDuJob(job, "34165539") === null, "jamais pour un autre numéro");
ok(B.suppressionEnvoyeeDuJob({ ...job, action: "delete" }, NUM) === null, "un retrait ne lit jamais le marqueur d'une republication");
ok(B.suppressionEnvoyeeDuJob({ ...job, platform_fields: { republish_step: "captured" } }, NUM) === null, "sans marqueur : rien");
const pfNeuf = { beebs_suppression_envoyee: { le: "2026-11-08T09:00:00Z", numero: NUM, vue_en_ligne_avant: { par: "bouton_page" } } };
ok(B.suppressionEnvoyeeDuJob({ ...job, platform_fields: pfNeuf }, NUM)?.le === "2026-11-08T09:00:00Z", "l'envoi gardé par la 0.6.179 (beebs_suppression_envoyee) passe d'abord");
// Le miroir serveur dit la même chose.
const srv = P.suppressionEnvoyeeBeebs(pf1a3, NUM);
ok(srv && Date.parse(srv.le) === Date.parse(envoi.le) && srv.numero === NUM && srv.vue_en_ligne_avant, "serveur (suppressionEnvoyeeBeebs) = extension");
ok(P.suppressionEnvoyeeBeebs(pf1a3, "34165539") === null && P.suppressionEnvoyeeBeebs({}, NUM) === null, "serveur : autre numéro, ou rien → null");
ok(P.suppressionEnvoyeeBeebs(pfNeuf, NUM)?.le === "2026-11-08T09:00:00.000Z", "serveur : beebs_suppression_envoyee d'abord, inchangé");

// ═══ 2. Deux pages 404 à 6 h d'écart après l'envoi : prouvé, « Mes annonces » illisible ou non ═══════════════════
const ctx0 = { constats404: [], suppressionEnvoyee: envoi };
const e1 = await B.preuveAbsenceMesAnnonces(NUM, t, ctx0);
ok(e1.verdict === "illisible" && e1.lecture.constats404?.length === 1 && e1.lecture.apres_envoi === true, "1er passage : un constat 404 noté (après l'envoi), rien conclu");
maintenant += 3 * 3600_000;
const e2 = await B.preuveAbsenceMesAnnonces(NUM, t, { constats404: e1.lecture.constats404, suppressionEnvoyee: envoi });
ok(e2.verdict === "illisible" && e2.lecture.constats404.length === 2, "+3 h : deux constats, écart < 6 h → rien conclu");
maintenant += 4 * 3600_000;
const e3 = await B.preuveAbsenceMesAnnonces(NUM, t, { constats404: e2.lecture.constats404, suppressionEnvoyee: envoi });
ok(e3.verdict === "absente" && e3.lecture.preuve_annonce?.regle === "suppression_envoyee_deux_404", "+7 h : deux pages 404 à 6 h d'écart après l'envoi → retirée");
const preuve = B.preuveRetraitDepuis(e3.lecture, NUM, "apres_suppression");
ok(P.preuveRetraitBeebsValide({ preuve_retrait: preuve }), "la preuve se revérifie côté serveur (preuveRetraitBeebsValide)");
ok(P.suppressionEnvoyeeProuvee({ ...pf1a3, beebs_404_constats: e3.lecture.constats404 }, NUM), "le balayage serveur la voit aussi (suppressionEnvoyeeProuvee)");
// Contre-épreuves.
page.http = 200; page.produit = true;
const e4 = await B.preuveAbsenceMesAnnonces(NUM, t, { constats404: e2.lecture.constats404, suppressionEnvoyee: envoi });
ok(e4.verdict === "presente" && e4.lecture.constats404.length === 0 && e4.lecture.suppression_levee, "page 200 avec sa fiche : encore en vente, constats remis à zéro, envoi levé");
page.http = 404; page.produit = false;
const e5 = await B.preuveAbsenceMesAnnonces(NUM, t, {});
ok(e5.verdict === "illisible" && e5.lecture.constats404 === undefined, "sans envoi (contexte d'avant) : aucun constat, rien conclu — inchangé");
const vieux = [{ le: "2026-10-26T07:00:00Z", page_http: 404, produit: false, en_verification: "non_lue" }];
const e6 = await B.preuveAbsenceMesAnnonces(NUM, t, { constats404: vieux, suppressionEnvoyee: envoi });
ok(e6.lecture.constats404.every((c) => Date.parse(c.le) > Date.parse(envoi.le)), "un constat d'AVANT l'envoi ne compte jamais");

// ═══ 3. Le câblage : beebs.js sert l'envoi à une republication, background.js garde constats et envoi ═══════════
const del = extraireFonctionJs(bj, "deleteListing");
ok(/const envoiDuJob = \["delete", "republish"\]\.includes\(String\(job\?\.action \?\? ""\)\) \? suppressionEnvoyeeDuJob\(job, idCible\) : null;/.test(del)
  && /const ctxPreuve = job\?\.action === "delete" \|\| envoiDuJob/.test(del), "deleteListing : la preuve par la page pour une republication dont l'envoi est parti");
const rep = extraireFonctionJs(bg, "processRepublishJobPlateforme");
const iGarde = rep.indexOf("BEEBS : LES CONSTATS ET L'ENVOI SONT GARDÉS ICI AUSSI");
ok(iGarde > 0 && iGarde < rep.indexOf("const pfApres = { ...pf, ...(job.platform_fields ?? {}) };") && iGarde > rep.indexOf("executerRetraitViaHandler(job, accessToken)"),
  "processRepublishJobPlateforme : constats et envoi gardés juste après le retrait, avant tout réarmement");
ok(/pfB\.beebs_404_constats = result\.beebs404Constats\.slice\(-6\);/.test(rep) && /pfB\.beebs_suppression_envoyee = \{ le: String\(result\.suppressionEnvoyeeLe\)/.test(rep),
  "mêmes clés que le retrait (beebs_404_constats, beebs_suppression_envoyee)");
const second = new Function(`${extraireFonctionJs(bg, "secondConstatBeebsLe")}; return secondConstatBeebsLe;`)();
const c1 = { le: "2026-11-08T10:00:00.000Z", page_http: 404, produit: false };
ok(second({ ...pf1a3, beebs_404_constats: [c1] }) === Date.parse(c1.le) + 6 * 3600_000 + 2 * 60_000, "réarmement : la relecture attend le second constat possible (6 h 02 après le premier)");
ok(Number.isNaN(second({ ...pf1a3, beebs_404_constats: e3.lecture.constats404 })) && Number.isNaN(second({ beebs_404_constats: [c1] })) && Number.isNaN(second(pf1a3)),
  "déjà prouvé, sans envoi, ou sans constat : l'espacement ordinaire");
const rearm = extraireFonctionJs(bg, "rearmerSuppressionNonProuvee");
ok(/const t2 = secondConstatBeebsLe\(pf\);/.test(rearm) && /if \(Number\.isFinite\(t2\) && t2 > Date\.parse\(pf\.next_action_after\)\)/.test(rearm), "rearmerSuppressionNonProuvee : jamais plus tôt que l'espacement ordinaire");

console.log(`beebs-republication-preuve-page : OK (${n} vérifications)`);
