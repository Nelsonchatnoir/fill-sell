// ═══════════════════════════════════════════════════════════════════════════
// Selftest du LIEN « vérification vendeur eBay » (2026-09-10)
//   node scripts/ebay-lien-verification-selftest.mjs
//
// Le lien ne doit apparaître QUE sur un refus eBay portant un motif KYC_*
// NOMMÉ par le serveur. Partout ailleurs — autre code, autre plateforme, autre
// statut, motif absent — l'écran ne change pas d'un pixel. C'est la garde que
// Nico a posée : « sur un code inconnu, on garde le comportement actuel ».
//
// Les formes de job ci-dessous sont RECOPIÉES de la base (job f0b84d87 pour le
// cas KYC, et les formes voisines qui ne doivent RIEN déclencher).
// ═══════════════════════════════════════════════════════════════════════════
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { lienVerificationEbay, EBAY_SELLER_HUB_URL, natureNeedsUser } = await import(
  pathToFileURL(join(ROOT, "src/utils/shared.js")).href
);

let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.log(`  ✗ ${nom} ${extra}`); }
};

// ── Le job RÉEL de Victor, tel qu'il est en base après le correctif v33 ──────
const VICTOR = {
  platform: "ebay",
  status: "needs_user",
  action: "publish",
  error: "eBay demande de vérifier ton identité de vendeur avant d'autoriser une mise en vente…",
  platform_fields: {
    ebayCategoryId: "3001",
    last_diagnostic: {
      voie: "api", etape: "publish", http: 400, errorId: 25019,
      motif_ebay: "KYC_DSAReq_EUB2C_SYI",
      motif_nomme: true,
      message_ebay_generique: "Impossible de modifier l'annonce. […] mots inappropriés […]",
    },
  },
};

console.log("\n▸ Le refus RÉEL (KYC_DSAReq_EUB2C_SYI)");
{
  const l = lienVerificationEbay(VICTOR, "fr");
  check("un lien est proposé", !!l);
  check("il pointe sur le Seller Hub", l?.url === EBAY_SELLER_HUB_URL, `→ ${l?.url}`);
  check("l'URL est bien celle relevée vivante le 10/09", l?.url === "https://www.ebay.fr/sh/ovw");
  // ⛔ LE POINT QUI COMPTE : le libellé ne promet pas une page morte.
  check("le libellé ne dit PAS « vérifier mon identité »", !/vérifier\s+mon\s+identité/i.test(l?.libelle ?? ""),
    `→ « ${l?.libelle} » — les URLs de vérification testées le 10/09 sont MORTES`);
  check("le libellé nomme le compte vendeur", /compte vendeur eBay/i.test(l?.libelle ?? ""), `→ « ${l?.libelle} »`);
  check("l'aide dit de revenir relancer", /relance/i.test(l?.aide ?? ""));
  check("version anglaise cohérente", /seller account/i.test(lienVerificationEbay(VICTOR, "en")?.libelle ?? ""));
}

console.log("\n▸ La nature du needs_user : « action », JAMAIS « à compléter »");
{
  // Pas de needsUserField, pas de champs_a_completer, pas de serverRequired
  // → 'action'. C'est ce qui garantit qu'aucun bouton « Compléter » n'apparaît
  // (bug corrigé le 09/09 sur Leboncoin puis Vinted).
  check("natureNeedsUser = 'action'", natureNeedsUser(VICTOR) === "action", `→ ${natureNeedsUser(VICTOR)}`);
  check("aucun needsUserField sur le job", !VICTOR.platform_fields.needsUserField);
}

console.log("\n▸ RIEN ne se déclenche ailleurs");
{
  const nul = (nom, job) => check(nom, lienVerificationEbay(job, "fr") === null);
  nul("code eBay INCONNU (motif non nommé)", {
    ...VICTOR, platform_fields: { last_diagnostic: { errorId: 25002, motif_ebay: "SOME_OTHER_REASON_CODE" } } });
  nul("refus eBay SANS motif du tout", {
    ...VICTOR, platform_fields: { last_diagnostic: { errorId: 25002, http: 400 } } });
  nul("aucun last_diagnostic", { ...VICTOR, platform_fields: {} });
  nul("platform_fields absent", { platform: "ebay", status: "needs_user" });
  nul("même motif, mais plateforme Vinted", { ...VICTOR, platform: "vinted" });
  nul("même motif, mais plateforme Leboncoin", { ...VICTOR, platform: "leboncoin" });
  nul("même motif, mais statut published", { ...VICTOR, status: "published" });
  nul("même motif, mais statut failed", { ...VICTOR, status: "failed" });
  nul("même motif, mais statut pending", { ...VICTOR, status: "pending" });
  nul("job vide", {});
  nul("null", null);
  // Une chaîne qui CONTIENT KYC_ sans commencer par lui ne compte pas.
  nul("motif « PRE_KYC_CHECK » (ne commence pas par KYC_)", {
    ...VICTOR, platform_fields: { last_diagnostic: { motif_ebay: "PRE_KYC_CHECK" } } });
}

console.log("\n▸ Toute la famille KYC_ est couverte, pas seulement le code vu");
{
  for (const code of ["KYC_DSAReq_EUB2C_SYI", "KYC_AUTRE_SUFFIXE", "kyc_minuscules_XX"]) {
    check(`« ${code} » déclenche le lien`,
      lienVerificationEbay({ ...VICTOR, platform_fields: { last_diagnostic: { motif_ebay: code } } }, "fr") !== null);
  }
}

console.log(
  echecs === 0
    ? "\n[selftest:ebay-lien-verification] OK — le lien n'apparaît que sur un KYC_ nommé, et ne promet aucune page morte.\n"
    : `\n[selftest:ebay-lien-verification] ÉCHEC — ${echecs} vérification(s) en défaut.\n`,
);
process.exit(echecs === 0 ? 0 : 1);
