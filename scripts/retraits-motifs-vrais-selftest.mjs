// Autotest — retraits arrêtés sur un motif faux (02/10) —
// `npm run selftest:retraits-motifs-vrais`
//   · Vinted, compte bloqué par Vinted (recrutementgroupezk704, a7dd76cd) :
//     la fenêtre de travail finit sur /main/banned — forme RELEVÉE en base ;
//   · la fin d'annonce eBay ne juge plus le dialogue sur le titre (ebay.js) ;
//   · le vendeur Vinted se lit en écartant le compte connecté (vinted.js).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pageCompteVintedBloque, messageCompteVintedBloque, requalificationCompteVintedBloque, SOURCE_COMPTE_VINTED_BLOQUE } from "../supabase/functions/_shared/vinted-compte-bloque.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. COMPTE VINTED BLOQUÉ");
const pfReel = { work_window_state: { at_end: { tab_url: "https://www.vinted.fr/main/banned" }, fins: [{ at: "2026-10-01T20:21:52.075Z", tab_url: "https://www.vinted.fr/main/banned", fill_step: null }] } };
ok(pageCompteVintedBloque(pfReel), "la forme relevée sur a7dd76cd est reconnue");
ok(pageCompteVintedBloque({ work_window_state: { at_end: { tab_url: "https://www.vinted.it/main/banned?x=1" } } }), "autre domaine Vinted, paramètres");
ok(!pageCompteVintedBloque({ work_window_state: { at_end: { tab_url: "https://www.vinted.fr/items/123" } } }), "page d'annonce : non");
ok(!pageCompteVintedBloque({ work_window_state: { at_end: { tab_url: "https://www.vinted.fr/main/bannedx" } } }), "pas un préfixe flou");
ok(!pageCompteVintedBloque({}), "sans relevé de fenêtre : non");
// (04/10, Nico) Un échec de navigation de NOTRE onglet n'est jamais « compte
// bloqué » : la page du DÉBUT de l'essai (onglet partagé) ou d'un essai plus
// ancien ne dit rien de celui-ci.
ok(!pageCompteVintedBloque({ work_window_state: { at_start: { tab_url: "https://www.vinted.fr/main/banned" }, at_end: { tab_url: null } } }),
  "onglet sur /main/banned AVANT notre navigation, essai fini ailleurs : non");
ok(!pageCompteVintedBloque({ work_window_state: { fins: [{ tab_url: "https://www.vinted.fr/main/banned" }] } }), "une fin plus ancienne seule : non");
const m = messageCompteVintedBloque("delete", "Jeans Levi's 511");
ok(/compte bloqué/.test(m) && /n'a PAS été retirée/.test(m) && /appli Vinted/.test(m) && !/relance|notre onglet/i.test(m), "message vrai, geste réel, jamais « relance »");
ok(/tant que Vinted affiche cette page/.test(m) && /tant que Vinted affiche cette page/.test(messageCompteVintedBloque("publish", null)),
  "le message ne présume pas un compte fermé (duport.leo3 : page bloquée, compte qui répond)");

console.log("\n1 bis. UN RETRAIT N'EST JAMAIS ARRÊTÉ PAR CE MUR (04/10) — requalification sur tout le parc");
// Forme RELEVÉE en prod sur a7dd76cd : needs_user, fenêtre finie sur /main/banned.
const jobDayane = { platform: "vinted", action: "delete", title: "Jeans Levi's 511", status: "needs_user",
  error: "Le retrait n'a pas abouti après plusieurs essais automatiques, et ton annonce n'a pas été retirée. Tu peux la relancer d'un clic ci-dessous.",
  platform_fields: { needs_user_source: "relancer", needsUserAttempts: 5, ...pfReel } };
const rq = requalificationCompteVintedBloque(jobDayane, "2026-10-04T09:00:00.000Z", "handler-watch (test)");
ok(rq && rq.status === "pending" && !rq.platform_fields.needs_user_source && !rq.platform_fields.needsUserAttempts,
  "a7dd76cd : retrait remis en reprise (pending), plus d'attente d'un clic", JSON.stringify(rq?.status));
ok(rq && rq.platform_fields.next_action_after === "2026-10-04T10:00:00.000Z", "premier nouvel essai dans 1 h", rq?.platform_fields?.next_action_after);
ok(rq && /n'a PAS encore été retirée/.test(rq.error) && /réessaie tout seul/.test(rq.error) && /double vente/.test(rq.error) && !/relancer d'un clic/.test(rq.error),
  "message vrai : pas encore retirée, reprise, double vente nommée");
ok(rq && Array.isArray(rq.platform_fields.erreurs_archivees) && /relancer d'un clic/.test(rq.platform_fields.erreurs_archivees.at(-1)?.erreur ?? ""), "l'ancien message est archivé, pas perdu");
const rq2 = requalificationCompteVintedBloque({ ...jobDayane, error: rq.error, platform_fields: rq.platform_fields }, "2026-10-04T10:00:00.000Z", "test");
ok(rq2 && rq2.platform_fields.compte_vinted_bloque.essais === 2 && rq2.platform_fields.next_action_after === "2026-10-04T13:00:00.000Z", "deuxième mur : 3 h");
const rq3 = requalificationCompteVintedBloque({ ...jobDayane, error: rq2.error, platform_fields: rq2.platform_fields }, "2026-10-04T13:00:00.000Z", "test");
const rq4 = requalificationCompteVintedBloque({ ...jobDayane, error: rq3.error, platform_fields: rq3.platform_fields }, "2026-10-04T19:00:00.000Z", "test");
ok(rq3.platform_fields.next_action_after === "2026-10-04T19:00:00.000Z" && rq4.platform_fields.next_action_after === "2026-10-05T01:00:00.000Z", "puis toutes les 6 h, sans fin");
// Étiqueté « compte bloqué » par l'ancienne lecture (page du début), essai fini ailleurs : raté de notre onglet.
const ancienFaux = { platform: "vinted", action: "delete", title: "18 livres T'choupi", status: "needs_user", error: "Vinted affiche « compte bloqué »…",
  platform_fields: { needs_user_source: SOURCE_COMPTE_VINTED_BLOQUE, work_window_state: { at_start: { tab_url: "https://www.vinted.fr/main/banned" }, at_end: { tab_url: "https://www.vinted.fr/items/9733506257" } } } };
const rqF = requalificationCompteVintedBloque(ancienFaux, "2026-10-04T09:00:00.000Z", "test");
ok(rqF && rqF.status === "pending" && /notre onglet de travail/.test(rqF.error) && !/compte bloqué/.test(rqF.error) && !rqF.platform_fields.compte_vinted_bloque,
  "ancien faux « compte bloqué » (page du début) : reprise, message neutre, motif retiré");
// Publication : comportement d'avant (needs_user, motif vrai), idempotent.
const jobPub = { ...jobDayane, action: "publish" };
const rqP = requalificationCompteVintedBloque(jobPub, "2026-10-03T11:00:00.000Z", "handler-watch (test)");
ok(rqP && rqP.status === "needs_user" && rqP.platform_fields.needs_user_source === SOURCE_COMPTE_VINTED_BLOQUE, "publication : needs_user, motif vrai");
ok(requalificationCompteVintedBloque({ ...jobPub, platform_fields: rqP.platform_fields }, "x", "y") === null, "publication : idempotent");
ok(requalificationCompteVintedBloque({ ...jobDayane, platform: "leboncoin" }, "x", "y") === null, "autre plateforme → rien");
ok(requalificationCompteVintedBloque({ ...jobDayane, platform_fields: { work_window_state: { at_end: { tab_url: "https://www.vinted.fr/items/9865454800" } } } }, "x", "y") === null,
  "page d'annonce, pas d'ancien motif → rien");

console.log("\n1 ter. pas-de-rouge : un retrait ne finit jamais en « relance d'un clic » sur un raté technique");
{
  const { classerEchec } = await import("../supabase/functions/_shared/pas-de-rouge.js");
  const r = classerEchec({ platform: "vinted", action: "delete", brut: "Erreur inconnue XYZ", essais: 5, pf: {}, reprises: 3 });
  ok(r.statut === "pending" && r.verdict === "reprise" && r.dansMinutes === 120 && /double vente/.test(r.message),
    "motif inconnu, budget épuisé : reprise espacée (2 h), message vrai", JSON.stringify(r));
  const r5 = classerEchec({ platform: "leboncoin", action: "delete", brut: "Erreur inconnue XYZ", essais: 5, pf: {}, reprises: 9 });
  ok(r5.statut === "pending" && r5.dansMinutes === 180, "toutes plateformes, puis toutes les 3 h");
  const pub = classerEchec({ platform: "vinted", action: "publish", brut: "Erreur inconnue XYZ", essais: 5, pf: {}, reprises: 3 });
  ok(pub.statut === "needs_user" && pub.motif === "inconnu_relancer", "publication : inchangé (relancer)");
  const cx = classerEchec({ platform: "vinted", action: "delete", brut: "Connexion Vinted requise : ta session est fermée", essais: 1, pf: {}, reprises: 0, sessions: { vinted: false } });
  ok(cx.statut === "needs_user", "un vrai geste (connexion) garde son bouton", JSON.stringify(cx.motif));
}
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/import \{ requalificationCompteVintedBloque \} from "\.\.\/_shared\/vinted-compte-bloque\.js"/.test(hw)
  && /requalificationCompteVintedBloque\(j, new Date\(\)\.toISOString\(\), "handler-watch/.test(hw)
  && /\.ilike\("platform_fields->>work_window_state", "%\/main\/banned%"\)/.test(hw),
  "handler-watch requalifie sur TOUT le parc (poste muet compris)");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/requalificationCompteVintedBloque\(j, new Date\(\)\.toISOString\(\), "get-pending-jobs/.test(gpj), "get-pending-jobs appelle la MÊME fonction");

console.log("\n2. FIN D'ANNONCE eBay : LE NUMÉRO, PLUS LE TITRE");
const eb = lire("chrome-extension/content-scripts/ebay.js");
ok(!/annonce trouvée par titre exact/.test(eb), "plus de repli par titre pour trouver la ligne");
ok(!/texteDe\(dialog\)\.toLowerCase\(\)\.includes\(job\.title/.test(eb), "le dialogue n'est plus jugé sur le titre du job");
ok(/nommeUneAutre/.test(eb) && /nomme une autre annonce que celle trouvée par son numéro/.test(eb), "refus si le dialogue nomme une AUTRE annonce");
const bg = lire("chrome-extension/background.js");
ok(/delete_trace: result\.trace\.slice\(-40\)/.test(bg), "la trace du handler part avec l'échec");

console.log("\n3. VENDEUR VINTED : LE COMPTE CONNECTÉ EST ÉCARTÉ");
const vt = lire("chrome-extension/content-scripts/vinted.js");
const d = vt.indexOf("async function proprietaireAnnonceVinted(t) {");
const f = vt.indexOf("\n}\n", d);
const src = vt.slice(d, f + 3);
const fabrique = new Function("document", "fetchBorne", `${src}; return proprietaireAnnonceVinted;`);
const docAvec = (ids) => ({ querySelectorAll: () => ids.map((id) => ({ getAttribute: () => `/member/${id}-pseudo` })) });
const fetchMoi = (id) => async () => ({ ok: true, json: async () => ({ user: { id, login: "moi" } }) });
const t = () => {};
const r1 = await fabrique(docAvec(["472079", "257364012"]), fetchMoi(257364012))(t);
ok(r1?.vendeur === "472079" && r1.session === "257364012", "Ornella : deux profils, le connecté écarté → vendeur 472079", JSON.stringify(r1));
const r2 = await fabrique(docAvec(["257364012"]), fetchMoi(257364012))(t);
ok(r2?.vendeur === "257364012", "sa propre annonce : vendeur = compte connecté");
const r3 = await fabrique(docAvec(["111", "222", "257364012"]), fetchMoi(257364012))(t);
ok(r3 === null, "deux autres profils : illisible, rien n'est conclu");
const r4 = await fabrique(docAvec([]), fetchMoi(257364012))(t);
ok(r4 === null, "aucun profil : illisible");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ retraits : motifs vrais, identité par numéro");
