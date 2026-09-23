// ═══════════════════════════════════════════════════════════════════════════
// SELFTEST « LE CRÉNEAU VA AU BOUT » (2026-09-24)
//   node scripts/creneaux-va-au-bout-selftest.mjs
//
// Deux gardes du sweep planifié changent (cf. scripts/creneaux-patch.mjs) :
//   [1] anti-rafale : un job PARQUÉ (reprise future) ne bloque plus le créneau ;
//   [2] disjoncteur : `needs_user` arrête le comptage au lieu de le grossir.
//
// Ce test fige leur LOGIQUE sur les cas RÉELS relevés en base (23/09) :
//   · Joséphine, Vinted 23/09, créneau 45 : 5 publiées, puis un job anti-robot
//     PARQUÉ (next_action_after à +45 min, step a_capturer) et un job taille-48
//     en needs_user. Avant : le parqué bloquait tout jusqu'à 22:00 et le
//     disjoncteur sautait à 2/2 → Vinted mort pour la journée. Après : le
//     créneau continue, le disjoncteur ne saute pas.
//   · GARDE-FOU : un job à l'étape 'deleted' (annonce hors ligne) BLOQUE
//     TOUJOURS, parqué ou non — on ne relance jamais par-dessus une suppression.
//   · GARDE-FOU : une vraie rafale de `failed` fait toujours sauter le
//     disjoncteur (xxewwer 19/09).
//
// Les deux fonctions ci-dessous sont le MIROIR fidèle du plpgsql patché ; le
// test échoue si un miroir s'écarte des cas nommés. Il vérifie AUSSI que
// scripts/creneaux-patch.mjs applique ses deux ancres sur une reproduction
// exacte des lignes du sweep prod, et REFUSE si une ancre bouge.
// ═══════════════════════════════════════════════════════════════════════════
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond || !detail ? "" : `   ← ${detail}`}`); };
const T0 = Date.parse("2026-09-23T19:42:00+02:00"); // l'instant du disjoncteur, chez Joséphine
const iso = (ms) => new Date(ms).toISOString();

// ── [1] MIROIR de l'anti-rafale patchée ────────────────────────────────────
// v_hors_ligne = jobs à l'étape 'deleted' (annonce supprimée) → BLOQUENT toujours.
// v_mobiles    = jobs non-'deleted' de la boutique connectée, MAIS plus les
//                jobs parqués dans le futur (next_action_after > now).
// Le créneau est bloqué ssi v_hors_ligne + v_mobiles > 0.
function creneauBloque(jobs, { boutique = null, now = T0 } = {}) {
  let horsLigne = 0, mobiles = 0;
  for (const j of jobs) {
    if (!["pending", "processing"].includes(j.status)) continue;
    const step = j.platform_fields?.republish_step ?? "a_capturer";
    const compte = j.platform_fields?.vinted_account_id ?? null;
    if (step === "deleted") { horsLigne++; continue; }
    const meme = boutique == null || compte == null || compte === boutique;
    if (!meme) continue; // autre boutique = v_parques (informatif, ne bloque pas)
    const na = j.platform_fields?.next_action_after ? Date.parse(j.platform_fields.next_action_after) : null;
    const parque = na != null && na > now;              // MODIF 2026-09-24
    if (parque) continue;                                // parqué → n'occupe pas le créneau
    mobiles++;
  }
  return { horsLigne, mobiles, bloque: horsLigne + mobiles > 0 };
}

// ── [2] MIROIR du disjoncteur patché ───────────────────────────────────────
// Jobs du créneau, du plus récent au plus ancien : on s'arrête à 'published'
// (série rompue), à 'needs_user' (parqué, AJOUT 2026-09-24) et à pending/
// processing ; on ne compte que les 'failed' consécutifs.
function disjoncteurCompte(jobsDesc) {
  let n = 0;
  for (const s of jobsDesc) {
    if (s === "published") break;
    if (s === "needs_user") break;               // AJOUT 2026-09-24
    if (s === "failed") { n++; continue; }        // MODIF 2026-09-24 : failed seul
    break;                                        // pending / processing
  }
  return n;
}

console.log("\n[1] Anti-rafale : un job parqué ne bloque plus, une suppression bloque toujours");
{
  // Joséphine 23/09 après la 5ᵉ : un job anti-robot PARQUÉ à +45 min + un needs_user.
  const parque = { status: "pending", platform_fields: { republish_step: "a_capturer", next_action_after: iso(T0 + 45 * 60000) } };
  ok("le job anti-robot parqué à +45 min ne bloque plus le créneau",
    creneauBloque([parque]).bloque === false, JSON.stringify(creneauBloque([parque])));
  // GARDE-FOU : une annonce supprimée (step deleted) bloque, parquée ou non.
  const supprimee = { status: "pending", platform_fields: { republish_step: "deleted", next_action_after: iso(T0 + 45 * 60000) } };
  ok("GARDE-FOU : un job à l'étape 'deleted' bloque TOUJOURS (annonce hors ligne, parquée ou non)",
    creneauBloque([supprimee]).bloque === true && creneauBloque([supprimee]).horsLigne === 1);
  // Un job réellement en vol (pending sans échéance, ou échéance passée) bloque.
  const enVol = { status: "processing", platform_fields: { republish_step: "captured" } };
  ok("un job réellement en vol (processing, pas d'échéance) bloque encore",
    creneauBloque([enVol]).bloque === true);
  const echeancePassee = { status: "pending", platform_fields: { republish_step: "a_capturer", next_action_after: iso(T0 - 60000) } };
  ok("un job dont l'échéance est PASSÉE (prêt à repartir) bloque encore",
    creneauBloque([echeancePassee]).bloque === true);
  // Le cas complet de Joséphine : parqué + needs_user (needs_user n'est ni pending ni processing) → libre.
  const needsUser = { status: "needs_user", platform_fields: { republish_step: "captured" } };
  ok("Joséphine 23/09 : parqué + needs_user → le créneau est LIBRE de créer l'article suivant",
    creneauBloque([parque, needsUser]).bloque === false);
}

console.log("\n[2] Disjoncteur : needs_user arrête, seuls les failed consécutifs comptent");
{
  // Joséphine 23/09 créneau 45, du plus récent au plus ancien : needs_user, pending, published×5.
  const josephine = ["needs_user", "pending", "published", "published", "published", "published", "published"];
  ok("Joséphine 23/09 : needs_user en tête → 0 échec compté, le disjoncteur NE SAUTE PAS",
    disjoncteurCompte(josephine) === 0, String(disjoncteurCompte(josephine)));
  // GARDE-FOU : une vraie rafale anti-robot (deux failed d'affilée) fait sauter à 2.
  ok("GARDE-FOU : deux failed consécutifs → 2 (le disjoncteur saute, seuil 2)",
    disjoncteurCompte(["failed", "failed", "published"]) === 2);
  ok("un seul failed, puis une réussite → 1 (ne saute pas)",
    disjoncteurCompte(["failed", "published"]) === 1);
  ok("failed, needs_user, failed → needs_user coupe la série → 1 (ne saute pas à tort)",
    disjoncteurCompte(["failed", "needs_user", "failed", "failed"]) === 1);
  ok("un needs_user seul (taille à choisir) → 0 (ne compte pas)",
    disjoncteurCompte(["needs_user", "published"]) === 0);
}

console.log("\n[3] Le patch s'applique sur les lignes exactes du sweep prod, et refuse si elles bougent");
const { patcher, ANCRES } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "creneaux-patch.mjs")).href);
// Reproduction EXACTE des régions du corps prod (relevé 2026-09-24) touchées par les ancres.
const EXTRAIT_PROD =
  "      SELECT count(*) FILTER (WHERE j.platform_fields ->> 'republish_step' = 'deleted'),\n" +
  "             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'\n" +
  "                                AND (v_boutique IS NULL OR NULLIF(trim(i.vinted_account_id), '') IS NULL\n" +
  "                                     OR trim(i.vinted_account_id) = v_boutique)),\n" +
  "             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'\n" +
  "                                AND v_boutique IS NOT NULL AND NULLIF(trim(i.vinted_account_id), '') IS NOT NULL\n" +
  "                                AND trim(i.vinted_account_id) <> v_boutique)\n" +
  "      INTO v_hors_ligne, v_mobiles, v_parques\n" +
  "        EXIT WHEN v_j.status = 'published';\n" +
  "        IF v_j.status IN ('failed', 'needs_user') THEN v_disj_n := v_disj_n + 1;\n" +
  "        ELSE EXIT;  -- pending / processing : en cours, pas un échec\n" +
  "        END IF;\n";
{
  const { corps, diffs } = patcher(EXTRAIT_PROD);
  ok("les 2 ancres tombent chacune une fois et sont patchées", diffs.length === 2);
  ok("[1] la garde parquée est ajoutée à v_mobiles", /republish_ts_safe\(j\.platform_fields, 'next_action_after'\), now\(\)\) <= now\(\)/.test(corps));
  ok("[1] v_hors_ligne (étape deleted) est INCHANGÉ", /FILTER \(WHERE j\.platform_fields ->> 'republish_step' = 'deleted'\),/.test(corps));
  ok("[2] needs_user devient un EXIT", /EXIT WHEN v_j\.status = 'needs_user';/.test(corps));
  ok("[2] le comptage ne pèse plus que failed", /IF v_j\.status = 'failed' THEN v_disj_n := v_disj_n \+ 1;/.test(corps) && !/IN \('failed', 'needs_user'\)/.test(corps));
  // Le refus quand une ancre a bougé.
  let refuse = false;
  try { patcher(EXTRAIT_PROD.replace("v_disj_n := v_disj_n + 1", "v_disj_n := v_disj_n + 2")); }
  catch { refuse = true; }
  ok("une ancre qui bouge (corps prod modifié) → le patch REFUSE, il ne devine pas", refuse);
  ok("ANCRES exporté pour relecture (2 changements nommés)", Array.isArray(ANCRES) && ANCRES.length === 2);
}

console.log(ko === 0 ? "\n[selftest:creneaux-va-au-bout] OK\n" : `\n[selftest:creneaux-va-au-bout] ÉCHEC — ${ko} vérification(s) en défaut.\n`);
process.exit(ko === 0 ? 0 : 1);
