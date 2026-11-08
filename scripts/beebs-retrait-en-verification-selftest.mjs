// ═══════════════════════════════════════════════════════════════════════════
// BEEBS : UN RETRAIT D'UNE ANNONCE « EN VÉRIFICATION » ATTEND, ET NE DIT JAMAIS « ARRÊTÉ » (08/11 soir, point 4 de Nico)
// `npm run selftest:beebs-retrait-en-verification`
// ═══════════════════════════════════════════════════════════════════════════
// recrutementgroupezk704 (Business), retrait 53cff028 de l'annonce 34083555 : dans « En vérification » chez Beebs depuis
// le 30/09 (relevés du 29/10 au 02/11 : 2 clés exactes dans l'onglet). Beebs n'offre aucun bouton de suppression pendant
// la vérification. L'extension disait « page pas encore rendue », COMPTAIT l'essai (compteur resté à 4) : chaque passage
// finissait « Plusieurs essais automatiques n'ont pas abouti : le retrait est arrêté » (failed), que update-job-status
// requalifiait en attente (pending) — le brut gardé disait « arrêté » d'un job en attente.
// Ce test prouve :
//   1. beebs.js : présente dans l'onglet « En vérification » → enVerification, texte qui garde la signature lue par le serveur ;
//   2. background : enVerification → pending, compteur intact, AVANT rearmBounded ; les autres reprises inchangées ;
//   3. serveur : le brut d'une attente ne garde jamais la conclusion « arrêté » ; un failed la garde ; le cas réel ;
//   4. le test mord.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brutSelonStatut } from "../supabase/functions/_shared/erreurs-archivees.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const beebs = lire("chrome-extension/content-scripts/beebs.js");
const bg = lire("chrome-extension/background.js");
const ujs = lire("supabase/functions/update-job-status/index.ts");

console.log("\n1. BEEBS.JS : « EN VÉRIFICATION » EST NOMMÉ");
{
  const i = beebs.indexOf('if (preuve.verdict === "presente") {');
  const zone = beebs.slice(i, i + 2600);
  ok(/p\?\.page === "en_verification"/.test(zone) && /\(p\.ids \?\? \[\]\)\.map\(String\)\.includes\(String\(idCible\)\)/.test(zone),
    "l'annonce est cherchée par son numéro EXACT dans l'onglet « En vérification »");
  const m = zone.match(/enVerification: true,\s*error: "([^"]+)" \+\s*"([^"]+)"/);
  ok(!!m, "sortie enVerification avec son message", zone.slice(0, 400));
  const texte = m ? m[1] + m[2] : "";
  const reServeur = ujs.match(/const RETRAIT_VERIF_BEEBS_RE = (\/[^\n]+\/i);/)?.[1];
  // eslint-disable-next-line no-eval
  const re = reServeur ? eval(reServeur) : null;
  ok(re && re.test(texte), "le texte garde la signature que update-job-status reconnaît (attente côté serveur, message daté)", reServeur);
  ok(!/pas encore rendue/.test(texte) && /en vérification/.test(texte) && /rien n'a été touché/.test(texte), "plus jamais « page pas encore rendue » pour une annonce en vérification");
  ok(/\(page pas encore rendue\) — rien n'a été touché, nouvel essai/.test(zone.slice(zone.indexOf("if (enVerification) {") + 20)),
    "hors de l'onglet « En vérification » : le chemin d'avant (nouvel essai)");
}

console.log("\n2. BACKGROUND : UNE ATTENTE, JAMAIS UN ESSAI");
{
  const i = bg.indexOf("} else if (result && !result.success && result.reprise) {");
  const zone = bg.slice(i, i + 4000);
  const iV = zone.indexOf('result.enVerification === true');
  const iR = zone.indexOf("await rearmBounded(accessToken, job");
  ok(iV > 0 && iV < iR, "la branche « en vérification » passe AVANT rearmBounded (aucun essai compté)");
  const branche = zone.slice(iV, iR);
  ok(/updateJobStatus\(accessToken, job\.id, "pending"/.test(branche) && /next_action_after: new Date\(Date\.now\(\) \+ RETRAIT_EN_VERIFICATION_MIN \* 60_000\)/.test(branche),
    "pending, prochain passage dans RETRAIT_EN_VERIFICATION_MIN");
  ok(!/needsUserAttempts/.test(branche), "le compteur d'essais n'est pas touché");
  ok(/if \(job\.platform === "beebs" && job\.action === "delete" && result\.enVerification === true\) \{/.test(zone), "Beebs, retrait seulement");
  ok(/actuelV !== "processing" && actuelV !== "pending"/.test(branche), "jamais par-dessus un statut devenu terminal (même garde que rearmBounded)");
  ok(/^const RETRAIT_EN_VERIFICATION_MIN = 60;$/m.test(bg), "délai : 60 min (celui du serveur)");
}

console.log("\n3. SERVEUR : LE BRUT SUIT LE STATUT");
{
  const BRUT_53CFF028 = "L'annonce est toujours dans « Mes annonces » mais sa page n'a pas montré le bouton de suppression (page pas encore rendue) — rien n'a été touché, nouvel essai. Plusieurs essais automatiques n'ont pas abouti : le retrait est arrêté. Si l'annonce est encore en ligne, retire-la à la main sur la plateforme.";
  const p = brutSelonStatut(BRUT_53CFF028, "pending");
  ok(!/le retrait est arrêté/.test(p) && /le job n'est pas arrêté, statut pending/.test(p), "53cff028 en attente : plus de « le retrait est arrêté »", p);
  ok(p.startsWith("L'annonce est toujours dans « Mes annonces » mais sa page n'a pas montré le bouton de suppression (page pas encore rendue) — rien n'a été touché, nouvel essai."),
    "la cause lue est gardée mot pour mot");
  ok(brutSelonStatut(BRUT_53CFF028, "failed") === BRUT_53CFF028, "un failed garde sa conclusion (il est vraiment arrêté)");
  ok(brutSelonStatut(BRUT_53CFF028, "needs_user") !== BRUT_53CFF028, "needs_user : non terminal, même règle");
  const PUB = "Dépôt Beebs non confirmé. Plusieurs essais automatiques n'ont pas abouti : la publication est arrêtée. Relance depuis la fiche de l'article ; si ça se reproduit, écris-nous.";
  ok(!/publication est arrêtée/.test(brutSelonStatut(PUB, "pending")), "même règle pour une publication requalifiée en attente");
  ok(brutSelonStatut("Bouton introuvable — nouvel essai", "pending") === "Bouton introuvable — nouvel essai", "un brut sans conclusion d'arrêt : inchangé");
  ok(brutSelonStatut(null, "pending") === "", "brut absent : vide");
  ok(/brutSelonStatut\(erreurTechniqueBrute, statutEffectif\)/.test(ujs) && /brutSelonStatut\(body\.error\.trim\(\), statutEffectif\)/.test(ujs),
    "update-job-status : les deux écritures du brut passent par la règle");
  // La conclusion d'arrêt de l'extension est bien celle qu'elle écrit (rearmBounded).
  ok(bg.includes('" Plusieurs essais automatiques n\'ont pas abouti : le retrait est arrêté. Si l\'annonce est encore en ligne, retire-la à la main sur la plateforme."'),
    "la phrase reconnue est celle que rearmBounded écrit");
}

console.log("\n4. LE TEST MORD");
{
  const ea = lire("supabase/functions/_shared/erreurs-archivees.js");
  ok(/\["pending", "needs_user"\]\.includes/.test(ea), "la règle ne s'applique qu'aux statuts non terminaux (sans elle, un failed perdrait sa vraie conclusion)");
  const sansGarde = (b) => b.replace(/\s*Plusieurs essais automatiques n'ont pas abouti : le retrait est arrêté\.[^]*$/, "");
  ok(sansGarde("x. Plusieurs essais automatiques n'ont pas abouti : le retrait est arrêté. y") !== brutSelonStatut("x. Plusieurs essais automatiques n'ont pas abouti : le retrait est arrêté. y", "failed"),
    "un remplacement aveugle (sans statut) changerait aussi un failed : la garde du statut est utile");
}

if (ko) { console.error(`\n❌ ${ko} échec(s)`); process.exit(1); }
console.log("\n✅ BEEBS — RETRAIT EN VÉRIFICATION : attente nommée, jamais « arrêté » : tout est vert.");
