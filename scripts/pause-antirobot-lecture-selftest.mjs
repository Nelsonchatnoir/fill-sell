// Selftest — pause anti-robot quand Vinted refuse la LECTURE des annonces de sa boutique (18/10, lot 5).
//   npm run selftest:pause-antirobot-lecture
// Cas réel : hu.anastasia (d8b07167…), sonde du compte à 200, sept articles de SA boutique refusés en 403
// (capture) les 17 et 18/10 — la pause du compte exigeait une sonde 403, le serveur servait l'article suivant.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANTIROBOT_LECTURES_MSG, refusSurSaBoutique, retenuParPauseLectures, signalPauseLectures } from "../supabase/functions/_shared/pause-antirobot-vinted.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
console.log("pause-antirobot-lecture-selftest");

// Formes RÉELLES relevées en base le 18/10 (jobs de hu.anastasia).
const refus = (at, verdict = "boutique_ok", extra = {}) => ({
  capture_echec: { at, etape: "a_capturer", motif: "lecture de l'annonce refusée par Vinted (HTTP 403) — protection anti-robot", ...extra },
  gardes: { garde_boutique: { at, verdict, champs_verifies: ["vinted_account_id", "identite_connectee"], boutique_article: "16389756", boutique_connectee: verdict === "boutique_ok" ? "16389756" : null } },
  republish_step: "a_capturer",
});

cas("un refus sur SA boutique compte ; une autre boutique ou une session absente, jamais", () => {
  assert.equal(refusSurSaBoutique(refus("2026-10-17T11:52:14.767Z")), true);
  assert.equal(refusSurSaBoutique(refus("2026-10-18T08:02:35.159Z", "identite_inconnue_capture_seule")), false, "identité illisible : pas une preuve");
  assert.equal(refusSurSaBoutique({ ...refus("2026-10-18T08:00:00Z"), gardes: { garde_boutique: { verdict: "autre_boutique", boutique_article: "1", boutique_connectee: "2" } } }), false, "remialbertholl (24/09) : annonces d'une AUTRE boutique");
  assert.equal(refusSurSaBoutique(refus("2026-10-18T08:00:00Z", "boutique_ok", { cause403: "session_absente" })), false, "pas de session : une connexion à refaire, pas un anti-robot");
  assert.equal(refusSurSaBoutique({}), false);
  assert.equal(refusSurSaBoutique(null), false);
});

cas("le signal : deux articles distincts de sa boutique APRÈS le dernier succès", () => {
  const succes = Date.parse("2026-10-14T09:36:00Z");
  const obs = [
    { article: "1788682174075005", at: Date.parse("2026-10-17T11:39:54Z"), saBoutique: true },
    { article: "1788682174075004", at: Date.parse("2026-10-17T11:52:14Z"), saBoutique: true },
  ];
  assert.deepEqual(signalPauseLectures(obs, succes), { pause: true, articles: 2 });
  assert.equal(signalPauseLectures([obs[0], { ...obs[0] }], succes).pause, false, "le même article deux fois : un seul");
  assert.equal(signalPauseLectures(obs, Date.parse("2026-10-17T12:00:00Z")).pause, false, "un succès après les refus lève la pause");
  assert.equal(signalPauseLectures([obs[0], { ...obs[1], saBoutique: false }], succes).pause, false);
});

cas("ce que la pause retient : les republications Vinted qui lisent encore leur annonce, rien d'autre", () => {
  assert.equal(retenuParPauseLectures({ platform: "vinted", action: "republish", platform_fields: { republish_step: "a_capturer" } }), true);
  assert.equal(retenuParPauseLectures({ platform: "vinted", action: "republish", platform_fields: {} }), true);
  assert.equal(retenuParPauseLectures({ platform: "vinted", action: "republish", platform_fields: { republish_step: "deleted" } }), false, "déjà retirée : elle doit revenir en ligne");
  assert.equal(retenuParPauseLectures({ platform: "vinted", action: "delete", platform_fields: {} }), false, "un retrait passe");
  assert.equal(retenuParPauseLectures({ platform: "vinted", action: "publish", platform_fields: {} }), false, "une publication passe");
  assert.equal(retenuParPauseLectures({ platform: "leboncoin", action: "republish", platform_fields: {} }), false, "les autres plateformes continuent");
});

cas("le message dit la vraie cause et le seul geste, sans nommer un navigateur (hu.anastasia est sous Edge)", () => {
  assert.ok(/refuse la lecture de tes annonces/.test(ANTIROBOT_LECTURES_MSG));
  assert.ok(/rien n'a été touché/.test(ANTIROBOT_LECTURES_MSG) && /tout repartira seul/.test(ANTIROBOT_LECTURES_MSG));
  assert.ok(!/Chrome/.test(ANTIROBOT_LECTURES_MSG));
});

cas("get-pending-jobs : branchée dans la pause du compte, sans passage « à toi » à 6 h, sonde une fois par 45 min", () => {
  const G = lire("supabase/functions/get-pending-jobs/index.ts");
  assert.ok(/import \{ ANTIROBOT_LECTURES_MSG, refusSurSaBoutique, retenuParPauseLectures, signalPauseLectures \} from "\.\.\/_shared\/pause-antirobot-vinted\.js";/.test(G));
  assert.ok(/saBoutique: refusSurSaBoutique\(pf\)/.test(G));
  assert.ok(/const lecturesSeules = !sonde403 && nbArticles\(obsAr\.filter\(\(o\) => o\.saBoutique\)\) >= 2;/.test(G));
  assert.ok(/if \(sonde403 \|\| lecturesSeules\) \{/.test(G));
  assert.ok(/if \(lecturesSeules\) for \(const j of vintedOut\) if \(!retenuParPauseLectures\(j\)\) garder\.add\(String\(j\.id\)\);/.test(G), "retraits et publications passent");
  assert.ok(/if \(!lecturesSeules && Date\.now\(\) - Date\.parse\(depuisAr\) > PAUSE_VINTED_GESTE_MS\)/.test(G), "pas de passage à la personne à 6 h");
  assert.ok(/if \(!recreations\.size && Date\.now\(\) - dernierRefus >= 45 \* 60_000\)/.test(G), "une sonde au plus toutes les 45 min");
  assert.ok(/j\.error === ANTIROBOT_LECTURES_MSG \? \{ error: null \}/.test(G), "à la levée, le message part");
});

console.log(`pause-antirobot-lecture-selftest : ${n} cas verts`);
