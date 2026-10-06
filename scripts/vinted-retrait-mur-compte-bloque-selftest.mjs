// ═══════════════════════════════════════════════════════════════════════════
// Selftest « compte bloqué » : le retrait tenté par l'API sous le mur des pages
// (2026-10-06, DeadRoz a7dd76cd)
//   node scripts/vinted-retrait-mur-compte-bloque-selftest.mjs [chemin/vers/vinted.js]
//
// LE CAS : retrait Vinted de DeadRoz (annonce 9865454800, boutique 127239260,
// vendue sur Leboncoin le 01/10). Chaque essai depuis le 01/10 atterrit sur
// https://www.vinted.fr/main/banned ; pourtant l'API répond (sonde
// users/current 200, même boutique ; relevés complets 664/664 qui voient
// l'annonce « active »). Le content script abandonnait sur le mur sans essayer
// l'API.
// CE QUE CE TEST PROUVE, sur deleteListing RÉEL (extrait de vinted.js) :
//   1. sur /main/banned, le retrait est tenté PAR L'API, avec la garde de
//      boutique (boutique d'origine du job) et la preuve exigée ;
//   2. API 2xx → succès (l'annonce est retirée) ;
//   3. API refusée → le mur « compte bloqué », exactement comme avant ;
//   4. sans boutique d'origine connue ou sans numéro : aucun appel, le mur.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonction } from "./lib/vinted-taille-bac.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHEMIN = process.argv[2] ?? join(ROOT, "chrome-extension/content-scripts/vinted.js");
const SRC = readFileSync(CHEMIN, "utf8");

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

function charger({ pathname, reponseApi }) {
  const appels = [];
  const deleteVintedItemViaApi = async (itemId, t, trace, opts) => {
    appels.push({ itemId, opts });
    return reponseApi;
  };
  const corps = [extraireFonction(SRC, "deleteListing"), "return deleteListing;"].join("\n");
  const location = { pathname, href: `https://www.vinted.fr${pathname}` };
  const fn = new Function("location", "deleteVintedItemViaApi", "DELETE_DRY_RUN", "console", corps)(
    location, deleteVintedItemViaApi, false, { log() {}, warn() {}, error() {} },
  );
  return { deleteListing: fn, appels };
}
const JOB = {
  platform_listing_id: "9865454800",
  listing_url: "https://www.vinted.fr/items/9865454800-jeans-levis-homme-511-coupe-slim-w34-l32-bleu-ciel-j227",
  platform_fields: { vinted_account_id: "127239260" },
};

console.log("\n[1] DeadRoz — /main/banned, l'API accepte le retrait");
{
  const b = charger({ pathname: "/main/banned", reponseApi: { success: true, verdict: { conclusion: "supprimee", http: 200 } } });
  const r = await b.deleteListing(JOB);
  ok("retrait tenté par l'API, une fois", b.appels.length === 1 && b.appels[0].itemId === "9865454800", JSON.stringify(b.appels));
  ok("   avec la boutique d'origine (garde de boutique) et la preuve exigée",
    b.appels[0]?.opts?.boutiqueAttendue === "127239260" && b.appels[0]?.opts?.preuveRequise === true, JSON.stringify(b.appels[0]?.opts));
  ok("   succès rendu (verdict « supprimee »)", r.success === true && r.verdict?.conclusion === "supprimee" && r.sousMurCompteBloque === true, JSON.stringify(r));
}

console.log("\n[2] /main/banned, l'API refuse → le mur, comme avant");
{
  const b = charger({ pathname: "/main/banned", reponseApi: { success: false, error: "CHALLENGE 403", verdict: { conclusion: "refus" } } });
  const r = await b.deleteListing(JOB);
  ok("compte bloqué rendu (needsUser + compteBloque)", r.success === false && r.needsUser === true && r.compteBloque === true, JSON.stringify(r));
  ok("   message inchangé", /^COMPTE VINTED BLOQUÉ/.test(String(r.error)), r.error);
}

console.log("\n[3] Sans boutique d'origine ou sans numéro : aucun appel");
{
  const b = charger({ pathname: "/main/banned", reponseApi: { success: true } });
  const r = await b.deleteListing({ ...JOB, platform_fields: {} });
  ok("sans vinted_account_id : pas d'appel API, le mur", b.appels.length === 0 && r.compteBloque === true, JSON.stringify(b.appels));
  const b2 = charger({ pathname: "/main/banned", reponseApi: { success: true } });
  const r2 = await b2.deleteListing({ platform_fields: { vinted_account_id: "127239260" }, listing_url: "https://www.vinted.fr/" });
  ok("sans numéro d'annonce : pas d'appel API, le mur", b2.appels.length === 0 && r2.compteBloque === true, JSON.stringify(b2.appels));
}

console.log("\n[4] Les autres pages ne changent pas");
{
  const b = charger({ pathname: "/", reponseApi: { success: true } });
  const r = await b.deleteListing(JOB);
  ok("accueil = anti-robot (CHALLENGE), aucun appel", b.appels.length === 0 && /^CHALLENGE /.test(String(r.error)), r.error);
}

console.log(ko ? `\n[selftest:vinted-retrait-mur-compte-bloque] ÉCHEC — ${ko} vérification(s) en défaut.` : "\n[selftest:vinted-retrait-mur-compte-bloque] OK");
process.exit(ko ? 1 : 0);
