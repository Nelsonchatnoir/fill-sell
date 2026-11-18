// ═══════════════════════════════════════════════════════════════════════════
// Selftest « accès eBay retiré (invalid_grant) : la cause dite, la reconnexion reconnue, les tâches reparties seules »
// (18/11/2026, point 7 du lot de Nico — rapport .tmp-terminal/t2/p7/RAPPORT.md, à ranger dans docs/enquetes/)
//   npm run selftest:ebay-reconnexion-reprise
//
// LE CAS (16/11, compte au Cloud) : relié à 13:08 sous le pseudo eBay généré à l'inscription, 5 annonces publiées par
// l'API à 14:16-14:18 ; le pseudo est personnalisé chez eBay avant 15:07 (Browse lit déjà le nouveau). eBay coupe le
// jeton de renouvellement d'un compte qui change de pseudo ou de mot de passe (eBay KB 5218) : le premier renouvellement,
// 15:06:07, est refusé (invalid_grant). Puis, côté FillSell :
//   · la tâche du moment passe « eBay a retiré l'accès… puis relance », SANS source ré-armable : elle n'est repartie que
//     relancée à la main à 15:54, après la reconnexion de 15:52 ;
//   · la reconnexion (même compte : même EIAS) est prise pour un « AUTRE compte eBay » (pseudo différent) : politiques,
//     état vendeur et lieu d'expédition effacés ; ses 5 annonces restent notées sous l'ancien pseudo, et leur retrait
//     serait refusé « annonce d'un autre compte » (risque de double vente) ;
//   · rien ne relance les tâches à la reconnexion (ebay-oauth-callback) ; la révocation n'est ni journalisée ni gardée ;
//     tout 400/401 autre qu'invalid_grant révoquait aussi ; une révocation lue sur l'ANCIEN jeton pouvait écraser la
//     reconnexion toute fraîche.
// CE QUE CE TEST VERROUILLE (règle pour tous les comptes, _shared/ebay-reconnexion.js) :
//   A. le même compte eBay se reconnaît à son EIAS, jamais au seul pseudo (renommé = réglages gardés) ;
//   B. seul invalid_grant révoque ; le texte d'eBay est gardé dans le log, jamais un morceau de jeton ;
//   C. une tâche arrêtée sur l'accès retiré attend la reconnexion sous une source ré-armable, avec la cause probable ;
//   D. le ré-armement (base simulée) : rien tant que le compte est révoqué, tout dès qu'il est reconnecté et prêt ;
//   E. les câblages : callback (identité, reprise, pseudo des annonces, trace), obtenirAccessToken (garde sur le jeton
//      lu, log, trace), ebay-api-worker (branche jeton, parcage d'un compte révoqué, filet de reprise).
// Pseudos et identifiants FICTIFS (selftest:donnees-clients).
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

const R = await charger("supabase/functions/_shared/ebay-reconnexion.js");
const V = await charger("supabase/functions/_shared/ebay-voie.ts");
const SOURCES = Array.isArray(V.SOURCES_EBAY_REARMABLES) ? V.SOURCES_EBAY_REARMABLES : [];

console.log("A. LE MÊME COMPTE eBAY SE RECONNAÎT À SON IDENTIFIANT IMMUABLE (EIAS), JAMAIS AU SEUL PSEUDO");
ok(!R.__erreur, "module _shared/ebay-reconnexion.js chargé", R.__erreur);
ok(!V.__erreur && SOURCES.length > 0, "module _shared/ebay-voie.ts chargé (SOURCES_EBAY_REARMABLES)", V.__erreur);
{
  const avant = { ebay_user_id: "pseudo_auto.1234", ebay_eias_token: "EIAS-FICTIF-A" };
  const renomme = essai(R.memeCompteEbay, avant, { username: "maboutique78", eiasToken: "EIAS-FICTIF-A" });
  ok(renomme?.meme === true && renomme?.renomme === true && renomme?.preuve === "eias"
    && renomme?.ancienPseudo === "pseudo_auto.1234" && renomme?.nouveauPseudo === "maboutique78",
  "même EIAS, pseudo changé : MÊME compte, renommé (le 16/11 : « AUTRE compte », réglages effacés)", JSON.stringify(renomme));
  const pareil = essai(R.memeCompteEbay, avant, { username: "PSEUDO_AUTO.1234", eiasToken: "EIAS-FICTIF-A" });
  ok(pareil?.meme === true && pareil?.renomme === false, "même EIAS, même pseudo (casse ignorée) : même compte, pas renommé", JSON.stringify(pareil));
  const autre = essai(R.memeCompteEbay, avant, { username: "autreboutique", eiasToken: "EIAS-FICTIF-B" });
  ok(autre?.meme === false && autre?.renomme === false && autre?.preuve === "eias", "EIAS différents : un AUTRE compte (réglages remis à zéro, règle du 03/10)", JSON.stringify(autre));
  const autreMemePseudo = essai(R.memeCompteEbay, avant, { username: "pseudo_auto.1234", eiasToken: "EIAS-FICTIF-C" });
  ok(autreMemePseudo?.meme === false, "EIAS différents même sous le même pseudo : l'EIAS décide", JSON.stringify(autreMemePseudo));
  const parPseudo = essai(R.memeCompteEbay, { ebay_user_id: "MaBoutique", ebay_eias_token: null }, { username: "maboutique", eiasToken: "EIAS-X" });
  ok(parPseudo?.meme === true && parPseudo?.preuve === "pseudo", "EIAS inconnu d'un côté : le pseudo décide (casse ignorée)", JSON.stringify(parPseudo));
  const pseudosDiff = essai(R.memeCompteEbay, { ebay_user_id: "a_1", ebay_eias_token: null }, { username: "b_2", eiasToken: null });
  ok(pseudosDiff?.meme === false && pseudosDiff?.renomme === false, "EIAS inconnus, pseudos différents : autre compte (comportement d'avant)", JSON.stringify(pseudosDiff));
  ok(essai(R.memeCompteEbay, null, { username: "x", eiasToken: "E" })?.meme === null, "aucune ligne d'avant : rien de prouvé, rien d'effacé");
  ok(essai(R.memeCompteEbay, { ebay_user_id: "x", ebay_eias_token: "E" }, { username: null, eiasToken: null })?.meme === null,
    "identité eBay illisible au retour : rien de prouvé, rien d'effacé");
}

console.log("\nB. SEUL invalid_grant RÉVOQUE ; LE TEXTE D'eBAY EST GARDÉ, JAMAIS UN MORCEAU DE JETON");
{
  const v = (http, error, access_token) => essai(R.verdictRenouvellement, { http, error, access_token });
  ok(v(200, undefined, "jeton-fictif") === "ok", "2xx avec un jeton d'accès : renouvelé");
  ok(v(400, "invalid_grant") === "revoque", "400 invalid_grant : révocation (état normal : « à reconnecter »)");
  ok(v(400, "invalid_scope") === "refuse" && v(401, "invalid_client") === "refuse" && v(400, "invalid_request") === "refuse" && v(401) === "refuse",
    "tout autre 400/401 : NOTRE requête refusée, jamais une révocation (avant : un invalid_client révoquait tout le parc)");
  ok(v(500, "server_error") === "transitoire" && v(503) === "transitoire" && v(200, undefined, undefined) === "transitoire" && v(0) === "transitoire",
    "5xx, réseau, 2xx sans jeton : transitoire (la ligne ne bouge pas)");
  const texte = "the provided authorization refresh token is invalid or was issued to another client";
  const d = essai(R.descriptionEbaySure, `${texte} v^1.1#i^1#p^3#r^1#I^3#f^0#t^Ul4xMF8xOjAwRkZBMEZCRkI0MjBCQTFFQkE2 et AgAAAA**AQAAAA**aAAAAA**ZmF1eGpldG9uZmljdGlm`);
  ok(typeof d === "string" && d.startsWith(texte), "la phrase d'eBay est gardée telle quelle", JSON.stringify(d));
  ok(typeof d === "string" && !/v\^1\.1#/.test(d) && !/Ul4xMF8xOjAw/.test(d) && !/AgAAAA\*\*/.test(d) && !/ZmF1eGpldG9u/.test(d),
    "tout ce qui ressemble à un jeton est masqué", JSON.stringify(d));
  const borne = essai(R.descriptionEbaySure, "x ".repeat(400));
  ok(typeof borne === "string" && borne.length <= 160 && borne.length >= 150, "bornée à 160 caractères", JSON.stringify(borne).slice(0, 80));
  ok(essai(R.descriptionEbaySure, undefined) === "" && essai(R.descriptionEbaySure, null) === "", "absente : vide");
}

console.log("\nC. UNE TÂCHE ARRÊTÉE SUR L'ACCÈS RETIRÉ ATTEND LA RECONNEXION, SOUS UNE SOURCE RÉ-ARMABLE");
const LE = "2026-11-16T14:06:07.000Z";
const JOB = { id: "job-fictif-1", user_id: "u-fictif-1", platform: "ebay", action: "publish", status: "processing", voie: "api", error: null,
  platform_fields: { processing_since: "2026-11-16T14:06:00.000Z", ebayCategoryId: "11632", needsUserAttempts: 0 } };
{
  const w = essai(R.ecritureJetonRefuse, JOB, { motif: "revoque", detail: "invalid_grant", maintenant: LE });
  ok(w?.status === "needs_user", "accès retiré : needs_user (à la personne de se reconnecter)", JSON.stringify(w).slice(0, 300));
  ok(SOURCES.includes(w?.platform_fields?.needs_user_source), "source RÉ-ARMABLE (ebay_connexion_requise : le bouton « Connecte ton compte eBay »)", String(w?.platform_fields?.needs_user_source));
  ok(w?.platform_fields?.[R.CLE_ACCES_RETIRE ?? "ebay_acces_retire"]?.le === LE && w?.platform_fields?.ebay_acces_retire?.motif === "revoque",
    "marque datée ebay_acces_retire { le, motif }");
  ok(w?.platform_fields?.ebayCategoryId === "11632" && !("processing_since" in (w?.platform_fields ?? {})), "le reste de la tâche est gardé ; plus « en cours »");
  ok(/toute seule/.test(w?.error ?? "") && !/puis relance/i.test(w?.error ?? "") && /pseudo/.test(w?.error ?? "") && /mot de passe/.test(w?.error ?? ""),
    "message : la cause probable (pseudo, mot de passe, Mon eBay) et « repartira toute seule » — plus jamais « puis relance »", w?.error);
  ok(/Réglages › Mes plateformes › eBay/.test(w?.error ?? "") && !/Chrome|ordinateur|extension/i.test(w?.error ?? ""), "le geste vrai (Réglages › Mes plateformes › eBay), jamais Chrome ni l'ordinateur");
  ok(w && !w.__absent && !w.__exception && JOB.platform_fields.processing_since && JOB.status === "processing", "pure : la tâche d'entrée n'est pas modifiée");
  const nc = essai(R.ecritureJetonRefuse, JOB, { motif: "non_connecte", maintenant: LE });
  ok(nc?.status === "needs_user" && SOURCES.includes(nc?.platform_fields?.needs_user_source) && /toute seule/.test(nc?.error ?? "") && /pas relié/.test(nc?.error ?? ""),
    "compte jamais relié : même attente, même reprise", nc?.error);
  const tr = essai(R.ecritureJetonRefuse, JOB, { motif: "refresh_echoue", detail: "503 temporarily_unavailable", maintenant: LE });
  ok(tr?.status === "pending" && tr?.platform_fields?.needs_user_source === undefined && !tr?.platform_fields?.ebay_acces_retire,
    "eBay muet (5xx, réseau) : en file, comme avant", JSON.stringify(tr).slice(0, 200));
  const rf = essai(R.ecritureJetonRefuse, JOB, { motif: "refresh_refuse", detail: "400 invalid_scope", maintenant: LE });
  ok(rf?.status === "needs_user" && !SOURCES.includes(rf?.platform_fields?.needs_user_source) && /Jeton eBay indisponible/.test(rf?.error ?? "") && !rf?.platform_fields?.ebay_acces_retire,
    "notre requête refusée : en attente sans boucle d'appels, jamais présentée comme une reconnexion", rf?.error);
  // Le filet : la reprise est due quand le compte a été reconnecté APRÈS l'arrêt.
  const arretee = { ...JOB, status: "needs_user", platform_fields: w?.platform_fields ?? {} };
  ok(essai(R.repriseApresReconnexionDue, arretee, { revoked_at: null, connected_at: "2026-11-16T14:52:42.000Z" }) === true, "filet : reconnecté après l'arrêt → reprise due");
  ok(essai(R.repriseApresReconnexionDue, arretee, { revoked_at: "2026-11-16T14:06:07.000Z", connected_at: "2026-11-16T12:08:03.000Z" }) === false, "filet : toujours révoqué → rien");
  ok(essai(R.repriseApresReconnexionDue, arretee, { revoked_at: null, connected_at: "2026-11-16T12:08:03.000Z" }) === false, "filet : connexion d'AVANT l'arrêt → rien (pas de boucle)");
  ok(essai(R.repriseApresReconnexionDue, { ...arretee, status: "pending" }, { revoked_at: null, connected_at: "2026-11-16T14:52:42.000Z" }) === false, "filet : une tâche déjà repartie n'est pas candidate");
  ok(essai(R.repriseApresReconnexionDue, arretee, null) === false, "filet : aucune ligne eBay → rien");
}

console.log("\nD. LE RÉ-ARMEMENT, SUR UNE BASE SIMULÉE : RIEN TANT QUE LE COMPTE EST RÉVOQUÉ, TOUT DÈS QU'IL EST RECONNECTÉ ET PRÊT");
// Une base en mémoire qui répond aux seules formes de requêtes de rearmerJobsEbayConnexionSiUtilisable.
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
      maybeSingle() { return Promise.resolve({ data: lignes()[0] ?? null, error: null }); },
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
{
  const SS_PRET = { inscription_vendeur: true, politiques_activees: true, politiques: { livraison: 1, paiement: 1, retours: 1 }, lieu_expedition: true,
    selling_limit: { quantity: 10, amount: { value: 500, currency: "EUR" } } };
  const w = essai(R.ecritureJetonRefuse, JOB, { motif: "revoque", detail: "invalid_grant", maintenant: LE });
  const tables = {
    ebay_accounts: [{ user_id: "u-fictif-1", revoked_at: LE, fulfillment_policy_id: "f1", payment_policy_id: "p1", return_policy_id: "r1", seller_state: SS_PRET }],
    cross_post_jobs: [
      { id: "job-fictif-1", user_id: "u-fictif-1", platform: "ebay", status: w?.status, voie: "api", error: w?.error, platform_fields: w?.platform_fields },
      { id: "job-fictif-2", user_id: "u-fictif-1", platform: "ebay", status: "needs_user", voie: "api", error: "question", platform_fields: { needs_user_source: "aspects_manquants" } },
      { id: "job-fictif-3", user_id: "u-fictif-1", platform: "ebay", status: "pending", voie: "api", error: null, platform_fields: {} },
    ],
  };
  const { admin, ecritures } = baseSimulee(tables);
  const rearmer = V.rearmerJobsEbayConnexionSiUtilisable;
  const n0 = typeof rearmer === "function" ? await rearmer(admin, "u-fictif-1") : -1;
  ok(n0 === 0 && ecritures.length === 0 && tables.cross_post_jobs[0].status === "needs_user", "compte encore révoqué : rien ne repart, rien n'est écrit", `n=${n0}, écritures=${ecritures.length}`);
  // La reconnexion (callback) : revoked_at levé, mêmes politiques (le compte renommé les garde).
  tables.ebay_accounts[0].revoked_at = null;
  const n1 = typeof rearmer === "function" ? await rearmer(admin, "u-fictif-1") : -1;
  const j1 = tables.cross_post_jobs[0];
  ok(n1 === 1 && j1.status === "pending" && j1.voie === "api" && j1.error === null, "reconnecté et prêt : la tâche arrêtée repart seule (pending, voie API)", `n=${n1} ${JSON.stringify(j1).slice(0, 200)}`);
  ok(!("needs_user_source" in (j1.platform_fields ?? {})) && typeof j1.platform_fields?.ebay_connexion_resolue_le === "string", "source levée, levée datée (ebay_connexion_resolue_le)");
  ok(tables.cross_post_jobs[1].status === "needs_user" && tables.cross_post_jobs[2].status === "pending" && ecritures.length === 1,
    "une autre question, ou une tâche déjà en file, ne sont jamais touchées (une écriture, une seule)");
  const n2 = typeof rearmer === "function" ? await rearmer(admin, "u-fictif-1") : -1;
  ok(n2 === 0 && ecritures.length === 1, "idempotent : un second passage ne réécrit rien");
}

console.log("\nE. LES CÂBLAGES (callback, obtenirAccessToken, ebay-api-worker)");
{
  const cb = lire("supabase/functions/ebay-oauth-callback/index.ts");
  const iUpsert = cb.indexOf('let { error } = await admin.from("ebay_accounts").upsert(ligne, { onConflict: "user_id" });');
  const iIdent = cb.indexOf("const identiteAvant = memeCompteEbay(");
  const iReset = cb.indexOf("if (identiteAvant.meme === false) {");
  ok(iIdent > 0 && iReset > iIdent && iReset < iUpsert, "callback : l'identité d'avant est jugée par memeCompteEbay (EIAS d'abord), AVANT d'écrire");
  ok(!/memePseudo === false \|\| memeEias === false/.test(cb), "callback : plus de « pseudo OU EIAS différent ⇒ autre compte »");
  const iRenom = cb.indexOf("await renommerVendeurAnnoncesEbay(admin, userId,");
  ok(iRenom > iUpsert && /if \(identiteAvant\.renomme\)/.test(cb), "callback : compte renommé → ses annonces suivent le nouveau pseudo (après l'écriture du compte)");
  const iRearm = cb.indexOf("await rearmerJobsEbayConnexionSiUtilisable(admin, userId)");
  const iOk = cb.indexOf('return retour("ok");');
  ok(iRearm > iUpsert && iOk > iRearm, "callback : les tâches qui attendaient la reconnexion repartent À LA RECONNEXION (après l'écriture, avant le retour)");
  ok(/import \{[^}]*rearmerJobsEbayConnexionSiUtilisable[^}]*\} from "\.\.\/_shared\/ebay-voie\.ts";/.test(cb) && /from "\.\.\/_shared\/ebay-reconnexion\.js";/.test(cb), "callback : imports");
  ok(/feature: "ebay_reconnexion"/.test(cb), "callback : la reconnexion après révocation est tracée (usage_logs ebay_reconnexion)");
  ok(/\.select\("ebay_user_id, ebay_eias_token, revoked_at, revoked_reason, connected_at"\)/.test(cb), "callback : la ligne d'avant est lue avec sa révocation");

  const o = lire("supabase/functions/_shared/ebay-oauth.ts");
  const corps = o.slice(o.indexOf("export async function obtenirAccessToken("), o.indexOf("// ── Appel REST eBay avec un jeton vendeur"));
  ok((corps.match(/\.eq\("refresh_token", compte\.refresh_token\)/g) ?? []).length >= 2,
    "obtenirAccessToken : chaque écriture vise la connexion dont on a renouvelé le jeton (une reconnexion entre-temps garde le sien)");
  ok(/\.is\("revoked_at", null\)/.test(corps), "obtenirAccessToken : on ne re-révoque pas une ligne déjà révoquée");
  ok(/const verdict = verdictRenouvellement\(/.test(corps) && /if \(verdict === "revoque"\)/.test(corps) && !/http === 400 \|\| http === 401/.test(corps),
    "obtenirAccessToken : seul invalid_grant révoque (verdictRenouvellement)");
  ok(/console\.warn\(`\[ebay-oauth\] accès refusé par eBay/.test(corps) && /descriptionEbaySure\(json\.error_description\)/.test(corps), "obtenirAccessToken : le refus est journalisé avec le texte d'eBay, nettoyé");
  ok(/feature: "ebay_acces_refuse"/.test(corps), "obtenirAccessToken : la révocation est tracée (usage_logs ebay_acces_refuse : l'historique survit à la reconnexion)");
  const logs = corps.split("\n").filter((l) => /console\.(warn|log|error)\(/.test(l));
  ok(logs.length > 0 && logs.every((l) => !/refresh_token\}|access_token\}|\$\{compte\.refresh_token|\$\{json\.access_token|\$\{json\.refresh_token/.test(l)), "obtenirAccessToken : aucun jeton dans un log");
  ok(/"refresh_refuse"/.test(o), "ResultatToken : le motif refresh_refuse existe");

  const w = lire("supabase/functions/ebay-api-worker/index.ts");
  const iMur = w.indexOf("const dMur = decisionMurCompteEbay(");
  const iJeton = w.indexOf("const jeton = await obtenirAccessToken(admin, job.user_id);", iMur);
  const branche = iJeton > 0 ? w.slice(iJeton, iJeton + 1200) : "";
  ok(/const ecrit = ecritureJetonRefuse\(job, \{ motif: jeton\.motif, detail: jeton\.detail \?\? null \}\);/.test(branche),
    "worker : la tâche arrêtée sur le jeton passe par ecritureJetonRefuse (source ré-armable)");
  ok(!/puis relance/.test(branche) && !w.includes("eBay a retiré l'accès de FillSell à ton compte : reconnecte-le dans les Paramètres, puis relance."),
    "worker : plus de « … puis relance » sur un accès retiré");
  const iRevoque = w.indexOf("if (etatCompte && !etatCompte.usable && etatCompte.revoque) {");
  const iAFinir = w.indexOf("if (etatCompte && !etatCompte.usable) {");
  ok(iRevoque > 0 && iAFinir > iRevoque && iJeton > iAFinir, "worker : un compte révoqué attend sa reconnexion, jamais « compte bien relié… à finir » (avant le parcage « à finir »)");
  ok(/async function reprendreAccesEbayRetires\(admin: SupabaseClient\)/.test(w) && /accesRetires = await reprendreAccesEbayRetires\(admin\);/.test(w),
    "worker : le filet de reprise (si le callback n'a pas pu relancer) passe à chaque tick, borné");
  ok(/import \{[^}]*ecritureJetonRefuse[^}]*\} from "\.\.\/_shared\/ebay-reconnexion\.js";/.test(w), "worker : import de la règle");

  const rc = lire("supabase/functions/_shared/ebay-releve-compte.ts");
  ok(/revoque: ligne\?\.revoked_at != null/.test(rc), "etatCompteEbayApiFrais dit si le compte est révoqué");
}

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ accès eBay retiré : cause dite, même compte reconnu, tâches reparties seules à la reconnexion");
