// ═══════════════════════════════════════════════════════════════════════════
// eBay : UN REFUS QUI VISE LE COMPTE N'EST JAMAIS « RELANCER » — SOURCE DÉDIÉE, MUR PAR COMPTE, UN ÉCLAIREUR (09/11)
// `npm run selftest:ebay-refus-compte`
// ═══════════════════════════════════════════════════════════════════════════
// Point 2 de Nico (09/11) — nicolas.menar (Premium) : 11 publications eBay refusées (06/11 23:16 → 08/11 23:26), errorId
// 25019, code TRISK_pmts2_Issue_617_Block_BuyingandSellingandm2m, « … confirmer votre identité ou vos données
// financières … ». Rangées « relancer » par le déclencheur (aucune source posée par le worker) : l'app proposait
// « Relancer maintenant », et chaque nouvelle publication retapait le même mur.
// Ce test prouve :
//   1. le classement (règle unique) : identité / données financières (KYC_*, TRISK_*, phrase FR/EN), compte bloqué
//      (USER_ON_HOLD, phrase) ; un refus d'article reste hors du mur ; les cas réels relevés en base ;
//   2. le mur par compte : rien envoyé à eBay sous un mur de moins de 30 jours ; l'éclaireur = la tâche relancée APRÈS
//      le mur ; une publication faite après le mur le lève (jamais un relevé) ; un mur de plus de 30 jours ne retient plus ;
//   3. ce que l'app montre : le lien chez eBay, « C'est fait, relancer » et son aide — jamais « Relancer maintenant » ;
//   4. les branchements : worker (4 refus, décision avant tout appel, entretien borné et conditionné), app (relance =
//      « c'est fait », lien, libellés), cause du blocage, messages en anglais ;
//   5. le test mord.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classerRefusEbay, classerErreurEbay, decisionMurCompteEbay, murCompteEbay, gesteMurCompteEbay, marqueurRefusCompte,
  attendMurCompteEbay, SOURCE_EBAY_VERIFICATION_IDENTITE, SOURCE_EBAY_COMPTE_BLOQUE, SOURCES_MUR_COMPTE_EBAY, CLE_REFUS_COMPTE,
  MESSAGE_VERIFICATION_IDENTITE, MESSAGE_COMPTE_BLOQUE, EBAY_SELLER_HUB_URL,
} from "../supabase/functions/_shared/ebay-refus-compte.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// Les refus réels, tels qu'eBay les a rendus (last_diagnostic.brut, relu en base le 09/11).
const TRISK = {
  errorId: 25019,
  message: "Impossible de modifier l'annonce. L'objet ne peut pas être mis en vente ou modifié. Il est possible que le titre ou la description contienne des mots inappropriés ou que le vendeur enfreigne le règlement d'eBay.",
  params: [
    { name: "0", value: "Il semble que vous n&#39;avez pas fourni les informations requises pour confirmer votre identit&eacute; ou vos donn&eacute;es financi&egrave;res.<font color=#757575 size=1>{e301847-1212400x}</font>" },
    { name: "1", value: "Il semble que vous n'avez pas fourni les informations requises pour confirmer votre identité ou vos données financières. Tant que nous n'aurons pas reçu ces informations, vos activités de vente et de communication seront soumises à des restrictions afin de garantir la sécurité des transactions pour vous et la communauté eBay." },
    { name: "2", value: "TRISK_pmts2_Issue_617_Block_BuyingandSellingandm2m" },
    { name: "3", value: "1212400" },
  ],
};
const ON_HOLD = {
  errorId: 25002,
  message: "Une erreur utilisateur est survenue. Votre compte eBay a été bloqué. Selon les données en notre possession, votre carte de crédit a été refusée à deux reprises pour un paiement et/ou votre compte présente un arriéré de plus de 60 jours.",
  params: [{ name: "0", value: "Le compte a été bloqué." }, { name: "1", value: "Votre compte eBay a été bloqué. Selon les données en notre possession, votre carte de crédit a été refusée à deux reprises pour un paiement et/ou votre compte présente un arriéré de plus de 60 jours." }, { name: "2", value: "1012" }, { name: "3", value: "USER_ON_HOLD" }],
};
const KYC = { errorId: 25019, message: "Impossible de modifier l'annonce.", params: [{ name: "1", value: "Nous avons toujours besoin de vérifier vos informations. Seuls les vendeurs vérifiés peuvent mettre des objets en vente." }, { name: "2", value: "KYC_DSAReq_EUB2C_SYI" }] };
const ASPECT = { errorId: 25129, message: "La valeur « Bleu nuit » n'est pas acceptée pour Couleur.", params: [{ name: "0", value: "Couleur" }] };
const RETOURS = { errorId: 25002, message: "Spécifiez des conditions de retour valides.", params: [{ name: "0", value: "ReturnsAcceptedOption" }] };
const INCONNU = { errorId: 25005, message: "Catégorie non valide.", params: [{ name: "0", value: "XYZ_Category_Leaf_Required" }] };

console.log("\n1. LE CLASSEMENT DES REFUS eBAY");
{
  const t = classerErreurEbay(TRISK);
  ok(t?.source === SOURCE_EBAY_VERIFICATION_IDENTITE && t.code === "TRISK_pmts2_Issue_617_Block_BuyingandSellingandm2m", "client-39bfa95a (TRISK_…, 25019) → vérification d'identité eBay", JSON.stringify(t));
  ok(classerErreurEbay(KYC)?.source === SOURCE_EBAY_VERIFICATION_IDENTITE, "KYC_DSAReq_EUB2C_SYI (10/09) → vérification d'identité eBay");
  ok(classerErreurEbay(ON_HOLD)?.source === SOURCE_EBAY_COMPTE_BLOQUE, "USER_ON_HOLD (27/10) → compte eBay bloqué");
  ok(classerErreurEbay(ASPECT) === null, "refus d'un aspect (25129) : pas un refus de compte");
  ok(classerErreurEbay(RETOURS) === null, "retours obligatoires (25002) : son chemin à lui, pas le mur");
  ok(classerErreurEbay(INCONNU) === null, "code inconnu sans phrase de compte : rien de deviné");
  ok(classerRefusEbay({ codes: [], phrases: ["Please verify your identity before listing."] })?.source === SOURCE_EBAY_VERIFICATION_IDENTITE, "sans code, la phrase anglaise d'eBay suffit");
  ok(classerRefusEbay({ codes: [], phrases: ["Your account has been suspended."] })?.source === SOURCE_EBAY_COMPTE_BLOQUE, "sans code, « account suspended » → compte bloqué");
  ok(classerRefusEbay({ codes: [], phrases: ["Le titre contient des mots inappropriés."] }) === null, "le parapluie d'eBay seul ne range rien");
  ok(MESSAGE_VERIFICATION_IDENTITE.includes("finalises la vérification de ton identité") && /C'est fait, relancer/.test(MESSAGE_VERIFICATION_IDENTITE), "le message dit de finaliser la vérification sur eBay, et comment relancer");
  ok(!/Relancer maintenant/.test(MESSAGE_VERIFICATION_IDENTITE + MESSAGE_COMPTE_BLOQUE), "aucun message ne promet « Relancer maintenant »");
}

console.log("\n2. LE MUR PAR COMPTE, UN ÉCLAIREUR");
{
  const T0 = Date.parse("2026-11-08T22:06:00Z");
  const mur = { id: "mur", platform: "ebay", action: "publish", status: "needs_user",
    platform_fields: { needs_user_source: SOURCE_EBAY_VERIFICATION_IDENTITE, [CLE_REFUS_COMPTE]: marqueurRefusCompte(classerErreurEbay(TRISK), { maintenant: T0 }) } };
  const neuve = { id: "neuve", platform: "ebay", action: "publish", status: "processing", platform_fields: {} };
  const apres = T0 + 3600_000;
  ok(murCompteEbay([mur], apres)?.source === SOURCE_EBAY_VERIFICATION_IDENTITE, "le mur vu le 08/11 tient le lendemain");
  ok(decisionMurCompteEbay(neuve, [mur], apres).action === "retenir", "une NOUVELLE publication du compte n'est pas envoyée à eBay (retenue)");
  const relancee = { ...neuve, platform_fields: { derniere_relance_manuelle: new Date(T0 + 1800_000).toISOString() } };
  ok(decisionMurCompteEbay(relancee, [mur], apres).raison === "eclaireur", "« C'est fait, relancer » APRÈS le mur : l'éclaireur part");
  const relanceeAvant = { ...neuve, platform_fields: { derniere_relance_manuelle: new Date(T0 - 60_000).toISOString() } };
  ok(decisionMurCompteEbay(relanceeAvant, [mur], apres).action === "retenir", "une relance d'AVANT le mur ne fait pas un éclaireur");
  const publiee = { id: "p", platform: "ebay", action: "publish", status: "published", published_at: new Date(T0 + 2 * 3600_000).toISOString() };
  ok(murCompteEbay([mur, publiee], apres + 3600_000) === null, "eBay accepte une publication après le mur : le mur tombe");
  ok(decisionMurCompteEbay(neuve, [mur, publiee], apres + 3600_000).action === "servir", "…et les publications repartent");
  const releve = { ...publiee, handler_build: "releve-annonces" };
  ok(murCompteEbay([mur, releve], apres + 3600_000) !== null, "un relevé ne prouve jamais que le compte vend");
  ok(decisionMurCompteEbay(neuve, [mur], T0 + 31 * 86_400_000).action === "servir", "un mur de plus de 30 jours ne retient plus");
  const retrait = { ...neuve, action: "delete" };
  ok(decisionMurCompteEbay(retrait, [mur], apres).action === "servir", "un retrait n'est jamais retenu");
  ok(decisionMurCompteEbay(neuve, [], apres).action === "servir", "aucun mur : rien ne change");
  const retenue = marqueurRefusCompte({ famille: "verification_identite" }, { retenue: true, murVuLe: T0, maintenant: apres });
  ok(Date.parse(retenue.vu_le) === T0 && retenue.retenue_le, "une retenue garde la date du mur (jamais un mur « revu » sans appel)");
  // Re-mur : l'éclaireur refusé de nouveau — le mur est daté du nouveau refus, l'ancienne relance ne sert plus.
  const mur2 = { ...mur, id: "mur2", platform_fields: { ...mur.platform_fields, [CLE_REFUS_COMPTE]: marqueurRefusCompte(classerErreurEbay(TRISK), { maintenant: T0 + 2 * 3600_000 }) } };
  ok(decisionMurCompteEbay(relancee, [mur, mur2], apres + 3 * 3600_000).action === "retenir", "l'éclaireur refusé de nouveau : le mur est revu, la vieille relance ne repart pas");
}

console.log("\n3. CE QUE L'APP MONTRE");
{
  const j = { platform: "ebay", action: "publish", status: "needs_user", platform_fields: { needs_user_source: SOURCE_EBAY_VERIFICATION_IDENTITE } };
  const g = gesteMurCompteEbay(j, "fr");
  ok(g?.url === EBAY_SELLER_HUB_URL && g.libelle === "Finaliser ma vérification sur eBay", "le lien chez eBay : « Finaliser ma vérification sur eBay »");
  ok(g?.relancer === "C'est fait, relancer" && /Seulement une fois que c'est fait sur eBay/.test(g.relancerAide), "la relance : « C'est fait, relancer », seulement une fois fait sur eBay");
  ok(gesteMurCompteEbay({ ...j, platform_fields: { needs_user_source: SOURCE_EBAY_COMPTE_BLOQUE } }, "fr")?.libelle === "Régler mon compte sur eBay", "compte bloqué : « Régler mon compte sur eBay »");
  ok(gesteMurCompteEbay(j, "en")?.relancer === "Done, relaunch", "en anglais aussi");
  ok(gesteMurCompteEbay({ ...j, platform_fields: { needs_user_source: "relancer" } }) === null, "toute autre attente : rien ne change");
  ok(attendMurCompteEbay(j) && !attendMurCompteEbay({ ...j, status: "pending" }), "attendMurCompteEbay : needs_user seulement");
}

console.log("\n4. LES BRANCHEMENTS");
{
  const w = lire("supabase/functions/ebay-api-worker/index.ts");
  const appels = w.match(/if \(await parquerSiRefusCompte\(admin, job, (rItem|maj|cre|pub)\.http, e,/g) ?? [];
  ok(appels.length === 4, "worker : les quatre refus d'eBay (fiche, offre maj, offre, publication) passent par le classement", String(appels.length));
  // Chaque appel précède le marquer générique de son site.
  for (const [site, generique] of [["rItem", 'error: refusItem.error'], ["cre", 'error: refusOffre.error'], ["pub", 'error: refus.error']]) {
    const a = w.indexOf(`parquerSiRefusCompte(admin, job, ${site}.http`); const b = w.indexOf(generique, a);
    ok(a > 0 && b > a && b - a < 900, `worker : ${site} — classement AVANT le message générique`);
  }
  const dMur = w.indexOf("const dMur = decisionMurCompteEbay("); const jeton = w.indexOf("const jeton = await obtenirAccessToken(admin, job.user_id);", dMur);
  ok(dMur > 0 && jeton > dMur && jeton - dMur < 1500, "worker : la décision du mur passe AVANT tout appel à eBay (jeton compris)");
  ok(/if \(http >= 500 \|\| http === 0\) return false;/.test(w), "worker : un refus passager (5xx, réseau) n'est jamais un mur");
  ok(/murCompte = await murCompteEbayEntretien\(admin\)/.test(w), "worker : l'entretien du mur (reclassement, relâche sur preuve) tourne à chaque passe");
  ok(/\.eq\("platform_fields->>needs_user_source", "relancer"\)\.not\("platform_fields->last_diagnostic->motif_ebay", "is", null\)\s*\n\s*\.limit\(50\)/.test(w), "worker : reclassement borné (50), seulement les « relancer » qui portent un motif d'eBay");
  ok(/\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)\.eq\("platform_fields->>needs_user_source", "relancer"\)\.select\("id"\)/.test(w), "worker : écriture conditionnée au statut et à la source lus");
  ok(/if \(!Number\.isFinite\(murJob\) \|\| !compteEbayAPublieDepuis\(jc, murJob\)\) continue;/.test(w), "worker : une retenue ne repart que sur PREUVE (publication après son mur), jamais sur l'âge");
  const stock = lire("src/tabs/StockTab.jsx");
  ok(/\.\.\.SOURCES_MUR_COMPTE_EBAY,\n\];/.test(stock), "app : la relance vaut « c'est fait » (source levée, le serveur la repose si le mur tient)");
  ok(/const murEbay = gesteMurCompteEbay\(job, lang\);\s*\n\s*if \(murEbay\) return \{ url: murEbay\.url, label: murEbay\.libelle \};/.test(stock), "app : le bouton principal de la fiche ouvre eBay");
  ok((stock.match(/murEbay \? murEbay\.relancer : \(fr \? "Relancer maintenant"/g) ?? []).length === 1 && /\{murEbay\?murEbay\.relancer:\(lang==="en"\?"Relaunch now":"Relancer maintenant"\)\}/.test(stock),
    "app : « C'est fait, relancer » à la place de « Relancer maintenant » (carte et fiche)");
  ok(/murEbay\?murEbay\.relancerAide:/.test(stock), "app : l'aide sous la relance dit « seulement une fois fait sur eBay »");
  ok(/const mur = gesteMurCompteEbay\(job, lang\);\s*\n\s*if \(mur\) return \{ url: mur\.url, libelle: mur\.libelle, aide: mur\.aide \};/.test(lire("src/utils/shared.js")), "app : lienVerificationEbay suit la règle unique");
  const cause = lire("supabase/functions/_shared/cause-blocage.js");
  ok(/ebay_verification_identite: \[ORIGINE\.UTILISATEUR/.test(cause) && /ebay_compte_bloque: \[ORIGINE\.PLATEFORME/.test(cause), "cause du blocage : rangée chez la personne / chez eBay, jamais « chez nous »");
  const { traduireMessageServeur } = await import("../src/utils/messagesServeur.js");
  ok(/^eBay is blocking sales on your account/.test(traduireMessageServeur(MESSAGE_VERIFICATION_IDENTITE, "en")), "message d'identité lu en anglais");
  ok(/^eBay has blocked your seller account/.test(traduireMessageServeur(MESSAGE_COMPTE_BLOQUE, "en")), "message de compte bloqué lu en anglais");
  ok(traduireMessageServeur(MESSAGE_VERIFICATION_IDENTITE, "fr") === MESSAGE_VERIFICATION_IDENTITE, "en français : le texte d'origine, octet pour octet");
  ok(SOURCES_MUR_COMPTE_EBAY.length === 2, "deux sources de mur, et deux seulement");
}

console.log("\n5. LE TEST MORD");
{
  // Le classement d'avant (motifReelEbay) ne nommait que KYC_ : TRISK_ partait sans source → « relancer » par défaut.
  const avant = (e) => (e.params ?? []).some((p) => /^KYC_/i.test(String(p.value))) ? "nomme" : null;
  ok(avant(TRISK) === null && classerErreurEbay(TRISK) !== null, "l'ancien classement laissait TRISK_ sans source (le contrôle 1 le distingue)");
  const sansEclaireur = (job, jobs) => (murCompteEbay(jobs) ? "retenir" : "servir");
  const T0 = Date.now() - 3600_000;
  const mur = { platform: "ebay", action: "publish", status: "needs_user", platform_fields: { [CLE_REFUS_COMPTE]: { famille: "verification_identite", vu_le: new Date(T0).toISOString() } } };
  const relancee = { platform: "ebay", action: "publish", status: "processing", platform_fields: { derniere_relance_manuelle: new Date().toISOString() } };
  ok(sansEclaireur(relancee, [mur]) === "retenir" && decisionMurCompteEbay(relancee, [mur]).action === "servir", "une règle sans éclaireur bloquerait la relance « C'est fait » (le contrôle 2 le distingue)");
}

if (ko) { console.error(`\n✗ ${ko} contrôle(s) en échec`); process.exit(1); }
console.log("\n✓ ebay-refus-compte : tout est vert");
