// ═══════════════════════════════════════════════════════════════════════════
// Selftest « eBay : l'onboarding des PAIEMENTS du compte vendeur est un mur » (06/11, Nico, point 7 — ayadi007)
//   node scripts/ebay-paiements-mur-selftest.mjs
//
// LE CAS : ayadi007 (Business, payé le 06/11 à 10:15), 4 publications eBay par l'extension. À chaque clic « Mettre en
// vente », eBay détourne l'onglet vers ebaypayonboardingweb.ebay.com/account-status-error/ ; le changement de domaine
// ferme le canal (« moved into back/forward cache ») : pris pour une mise en veille de Chrome, reprises sans fin.
// LA RÈGLE : même mur que l'inscription vendeur (21/09) — needs_user `ebay_compte_vendeur_inactif`, mur « paiements »,
// message du geste chez eBay (Paiements) ; les autres dépôts eBay du compte sont retenus derrière, avec CE message.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  messageRetenueVendeurEbay, MESSAGE_PAIEMENTS_EBAY, MESSAGE_VENDEUR_EBAY, murVendeurEbayVuLe, attendVendeurEbay,
} from "../supabase/functions/_shared/vendeur-ebay.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const maintenant = Date.parse("2026-11-06T11:00:00Z");
const mur = (mur, derniere) => ({
  platform: "ebay", action: "publish", status: "needs_user", voie: "extension",
  platform_fields: { needs_user_source: "ebay_compte_vendeur_inactif",
    compte_vendeur_inactif: { tab_url: mur === "paiements" ? "https://ebaypayonboardingweb.ebay.com/account-status-error/" : "https://onboardweb.ebay.fr/onboard-revamped/",
      derniere, depuis: derniere, ...(mur ? { mur } : {}) } },
});

console.log("1. Le mur « paiements » est un mur VU (il retient les autres dépôts eBay du compte)");
const p = mur("paiements", "2026-11-06T10:45:21Z");
ok("murVendeurEbayVuLe le date", Number.isFinite(murVendeurEbayVuLe(p, maintenant)));
ok("la tâche attend ce geste (attendVendeurEbay)", attendVendeurEbay(p));

console.log("2. Le message des tâches retenues : celui du DERNIER mur vu");
ok("dernier mur = paiements → message paiements", messageRetenueVendeurEbay([mur(null, "2026-11-05T10:00:00Z"), p], maintenant) === MESSAGE_PAIEMENTS_EBAY);
ok("dernier mur = inscription → message inscription", messageRetenueVendeurEbay([p, mur(null, "2026-11-06T10:50:00Z")], maintenant) === MESSAGE_VENDEUR_EBAY);
ok("aucun mur : le message d'avant (inscription)", messageRetenueVendeurEbay([], maintenant) === MESSAGE_VENDEUR_EBAY);
ok("le message dit le geste (Mon eBay → Paiements) et « Rien n'a été publié »", /Mon eBay → Paiements/.test(MESSAGE_PAIEMENTS_EBAY) && /Rien n'a été publié/.test(MESSAGE_PAIEMENTS_EBAY)
  && !/rien à faire de ton côté/i.test(MESSAGE_PAIEMENTS_EBAY));

console.log("3. Branchements");
const ujs = readFileSync(join(ROOT, "supabase/functions/update-job-status/index.ts"), "utf8");
ok("update-job-status : la page de paiement compte comme le mur, AVANT le palliatif bfcache",
  /const pagePaiements = estPagePaiementsVendeurEbay\(atEnd\?\.tab_url\);\s*\n\s*const pageInscription = pagePaiements \|\| estPageInscriptionVendeurEbay\(atEnd\?\.tab_url\);/.test(ujs)
  && ujs.indexOf("const pagePaiements = estPagePaiementsVendeurEbay") < ujs.indexOf("let bfcacheRearms: number | null = null;"));
ok("update-job-status : mur « paiements » posé, message paiementsVendeurEbay", /pagePaiements \? \{ mur: "paiements" \}/.test(ujs) && /\? paiementsVendeurEbay\(String\(jrow\.action \?\? "publish"\)\)/.test(ujs));
const gpj = readFileSync(join(ROOT, "supabase/functions/get-pending-jobs/index.ts"), "utf8");
ok("get-pending-jobs : les retenues portent le message du dernier mur", /const messageE = messageRetenueVendeurEbay\(jobsE as never\[\], maintenantE\);/.test(gpj)
  && /\.update\(\{ status: "needs_user", error: messageE, platform_fields: pfAPersister\(pfV\) \}\)/.test(gpj));
const textes = readFileSync(join(ROOT, "supabase/functions/_shared/textes-jobs.ts"), "utf8");
ok("textes-jobs : même texte que MESSAGE_PAIEMENTS_EBAY pour une publication",
  textes.includes("Connecte-toi à eBay sur ton ordinateur, ouvre \" +") && textes.includes("affiché sa page d'état du compte de paiement au moment de publier"));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
