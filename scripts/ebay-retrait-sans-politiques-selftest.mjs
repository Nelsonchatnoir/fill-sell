// ═══════════════════════════════════════════════════════════════════════════
// Selftest « un retrait eBay part dès la reconnexion, sans attendre les trois règles de vente »
// (19/11/2026 midi, point 2 du lot de Nico — décision : OUI)
//   npm run selftest:ebay-retrait-sans-politiques
//
// LE TROU : une tâche eBay arrêtée faute de connexion (accès retiré par eBay, compte jamais relié) ne repartait à la
// (re)connexion que si le compte était « prêt » — 3 règles de vente retenues (livraison, paiement, retours), état
// vendeur relevé (rearmerJobsEbayConnexionSiUtilisable, _shared/ebay-voie.ts). Juste pour une publication (elle buterait
// sur « politiques absentes »), faux pour un RETRAIT : retirer une annonce n'a besoin d'aucune règle de vente. Un compte
// reconnecté sans ses règles (autre compte relié, règles à rechoisir) gardait donc en ligne sur eBay l'annonce d'un
// article vendu ailleurs — risque de double vente.
// LA RÈGLE (décision de Nico du 19/11) : un retrait repart dès que le compte est relié (non révoqué) ; une publication ou
// une republication garde l'exigence (compte prêt). Mêmes sources ré-armables, même garde needs_user, mêmes appelants :
// ebay-oauth-callback (à la reconnexion), filet reprendreAccesEbayRetires d'ebay-api-worker, ebay-account.
// CE QUE CE TEST VERROUILLE :
//   A. la règle pure (rearmementEbayPermis) : retrait ← relié ; publication, republication ← prêt ; rien sans liaison ;
//   B. le ré-armement sur une base simulée : compte relié SANS règles → le retrait repart, la publication attend ;
//      compte prêt → les deux ; compte révoqué → rien ; une autre question jamais touchée ;
//   C. les câblages : rearmerJobsEbayConnexionSiUtilisable lit la ligne une fois et juge par la règle ; ses appelants.
// Identifiants FICTIFS (selftest:donnees-clients).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => { try { return readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } };
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };
const essai = (f, ...a) => { if (typeof f !== "function") return { __absent: true }; try { return f(...a); } catch (e) { return { __exception: String(e?.message ?? e) }; } };
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const V = await charger("supabase/functions/_shared/ebay-voie.ts");

console.log("A. LA RÈGLE : UN RETRAIT N'ATTEND QUE LA LIAISON, UNE PUBLICATION ATTEND LE COMPTE PRÊT");
ok(!V.__erreur, "module _shared/ebay-voie.ts chargé", V.__erreur);
const P = (action, etat) => essai(V.rearmementEbayPermis, { action }, etat);
ok(P("delete", { relie: true, pret: false }) === true, "retrait, compte relié sans ses règles de vente : il part");
ok(P("delete", { relie: true, pret: true }) === true, "retrait, compte prêt : il part");
ok(P("delete", { relie: false, pret: false }) === false, "retrait, compte pas relié (révoqué, absent) : il attend");
ok(P("publish", { relie: true, pret: false }) === false && P("republish", { relie: true, pret: false }) === false,
  "publication, republication, compte relié sans ses règles : elles attendent (inchangé)");
ok(P("publish", { relie: true, pret: true }) === true && P("republish", { relie: true, pret: true }) === true, "publication, republication, compte prêt : elles partent");
ok(P(undefined, { relie: true, pret: false }) === false && P(undefined, { relie: true, pret: true }) === true, "action absente = publication (comportement d'avant)");
ok(P("publish", { relie: false, pret: true }) === false, "jamais sans liaison, même « prêt » d'après une vieille ligne");

console.log("\nB. LE RÉ-ARMEMENT, SUR UNE BASE SIMULÉE");
function baseSimulee(tables) {
  const ecritures = [];
  const from = (t) => {
    const etat = { mode: "select", patch: null, filtres: [], n: Infinity };
    const lignes = () => (tables[t] ?? []).filter((r) => etat.filtres.every(([k, v]) => r[k] === v)).slice(0, etat.n);
    const q = {
      select() { return q; },
      update(p) { etat.mode = "update"; etat.patch = p; return q; },
      eq(k, v) { etat.filtres.push([k, v]); return q; },
      limit(n) { etat.n = n; return q; },
      maybeSingle() { return Promise.resolve({ data: structuredClone(lignes()[0] ?? null), error: null }); },
      then(res, rej) {
        try {
          if (etat.mode === "update") {
            const touchees = lignes();
            for (const r of touchees) { Object.assign(r, structuredClone(etat.patch)); ecritures.push({ table: t, id: r.id }); }
            return Promise.resolve({ data: touchees.map((r) => ({ id: r.id })), error: null }).then(res, rej);
          }
          return Promise.resolve({ data: structuredClone(lignes()), error: null }).then(res, rej);
        } catch (e) { return Promise.reject(e).then(res, rej); }
      },
    };
    return q;
  };
  return { admin: { from }, ecritures };
}
const SS_PRET = { inscription_vendeur: true, politiques_activees: true, politiques: { livraison: 1, paiement: 1, retours: 1 }, lieu_expedition: true,
  selling_limit: { quantity: 10, amount: { value: 500, currency: "EUR" } } };
const tache = (id, action, source) => ({ id, user_id: "u-fictif", platform: "ebay", action, status: "needs_user", voie: "api", error: "attente",
  platform_fields: { needs_user_source: source, ebay_acces_retire: { le: "2026-11-18T10:00:00.000Z", motif: "revoque" } } });
{
  const tables = {
    // Reconnecté (non révoqué), mais SANS ses règles de vente (autre compte relié, règles à rechoisir).
    ebay_accounts: [{ user_id: "u-fictif", revoked_at: null, fulfillment_policy_id: null, payment_policy_id: null, return_policy_id: null, seller_state: null }],
    cross_post_jobs: [
      tache("retrait-1", "delete", "ebay_connexion_requise"),
      tache("pub-1", "publish", "ebay_connexion_requise"),
      tache("republi-1", "republish", "ebay_connexion_requise"),
      { ...tache("question-1", "delete", "aspects_manquants") },
    ],
  };
  const { admin, ecritures } = baseSimulee(tables);
  const rearmer = V.rearmerJobsEbayConnexionSiUtilisable;
  const n1 = typeof rearmer === "function" ? await rearmer(admin, "u-fictif") : -1;
  const [retrait, pub, republi, question] = tables.cross_post_jobs;
  ok(n1 === 1 && retrait.status === "pending" && retrait.voie === "api" && retrait.error === null,
    "compte relié sans règles : le RETRAIT repart (pending, voie API)", `n=${n1} ${JSON.stringify(retrait).slice(0, 160)}`);
  ok(!("needs_user_source" in (retrait.platform_fields ?? {})) && typeof retrait.platform_fields?.ebay_connexion_resolue_le === "string", "source levée, levée datée");
  ok(pub.status === "needs_user" && republi.status === "needs_user", "la publication et la republication attendent toujours le compte prêt (inchangé)");
  ok(question.status === "needs_user" && ecritures.length === 1, "une autre question n'est jamais touchée ; une seule écriture");
  // Le compte devient prêt : publication et republication repartent à leur tour.
  Object.assign(tables.ebay_accounts[0], { fulfillment_policy_id: "f1", payment_policy_id: "p1", return_policy_id: "r1", seller_state: SS_PRET });
  const n2 = typeof rearmer === "function" ? await rearmer(admin, "u-fictif") : -1;
  ok(n2 === 2 && pub.status === "pending" && republi.status === "pending", "compte prêt : la publication et la republication repartent", `n=${n2}`);
  const n3 = typeof rearmer === "function" ? await rearmer(admin, "u-fictif") : -1;
  ok(n3 === 0 && ecritures.length === 3, "idempotent : un passage de plus ne réécrit rien");
}
{
  const tables = {
    ebay_accounts: [{ user_id: "u-fictif", revoked_at: "2026-11-18T10:00:00.000Z", fulfillment_policy_id: "f1", payment_policy_id: "p1", return_policy_id: "r1", seller_state: SS_PRET }],
    cross_post_jobs: [tache("retrait-2", "delete", "ebay_connexion_requise")],
  };
  const { admin, ecritures } = baseSimulee(tables);
  const n = typeof V.rearmerJobsEbayConnexionSiUtilisable === "function" ? await V.rearmerJobsEbayConnexionSiUtilisable(admin, "u-fictif") : -1;
  ok(n === 0 && ecritures.length === 0 && tables.cross_post_jobs[0].status === "needs_user", "compte encore révoqué : même le retrait attend (rien n'est écrit)");
}
{
  const { admin, ecritures } = baseSimulee({ ebay_accounts: [], cross_post_jobs: [tache("retrait-3", "delete", "ebay_connexion_requise")] });
  const n = typeof V.rearmerJobsEbayConnexionSiUtilisable === "function" ? await V.rearmerJobsEbayConnexionSiUtilisable(admin, "u-fictif") : -1;
  ok(n === 0 && ecritures.length === 0, "aucune liaison eBay : rien");
}

console.log("\nC. LES CÂBLAGES");
const v = lire("supabase/functions/_shared/ebay-voie.ts");
const corps = v.slice(v.indexOf("export async function rearmerJobsEbayConnexionSiUtilisable("));
ok(/export function rearmementEbayPermis\(/.test(v), "la règle est exportée (rearmementEbayPermis)");
ok(/if \(!rearmementEbayPermis\(j, \{ relie, pret \}\)\) continue;/.test(corps.slice(0, 3000)), "rearmerJobsEbayConnexionSiUtilisable juge chaque tâche par la règle");
ok(!/if \(!\(await compteEbayApiUsable\(admin, userId\)\)\) return 0;/.test(corps.slice(0, 3000)), "plus de « compte pas prêt ⇒ rien », qui retenait aussi les retraits");
ok(/\.select\("id, action, platform_fields"\)/.test(corps.slice(0, 3000)), "l'action de chaque tâche est lue");
const cb = lire("supabase/functions/ebay-oauth-callback/index.ts");
ok(/await rearmerJobsEbayConnexionSiUtilisable\(admin, userId\)/.test(cb), "ebay-oauth-callback relance à la reconnexion (même fonction)");
const wk = lire("supabase/functions/ebay-api-worker/index.ts");
ok(/for \(const u of dus\) reparties \+= await rearmerJobsEbayConnexionSiUtilisable\(admin, u\);/.test(wk), "le filet reprendreAccesEbayRetires passe par la même fonction");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ un retrait eBay part dès la reconnexion ; les publications attendent toujours le compte prêt");
