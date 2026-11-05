// Autotest — ce que l'app appelle « en ligne » (05/11, point 6 — règles de Nico) — `npm run selftest:affichage-en-ligne`.
//   a) un dépôt Beebs / Leboncoin EN VÉRIFICATION chez la plateforme : « Beebs vérifie ton annonce », jamais « En ligne »,
//      jamais compté en ligne, jamais « Remonter » — mais la plateforme reste OCCUPÉE (pas de 2e dépôt, retrait visé) ;
//   b) Opla est quittée : plus aucun dépôt Opla « en ligne » nulle part (Stock, Tableau, Statistiques) ;
//   c) le compteur d'une boutique ne compte que les annonces en vente ; une quantité aberrante (9999) ne gonfle plus l'en-tête.
import fs from "node:fs";
import { computeRemovalInfo } from "../src/utils/publicationState.js";
import { estEnVerification, plateformesEnVerification } from "../src/utils/enVerification.js";
import { etatPlateformes } from "../src/utils/stockFiltres.js";
import { repubEtatPlateforme } from "../src/utils/republication.js";

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const pub = (platform, o = {}) => ({ id: `${platform}-1`, platform, action: "publish", status: "published", created_at: "2026-10-30T10:00:00Z",
  published_at: "2026-10-30T10:05:00Z", listing_url: `https://exemple/${platform}/1`, platform_fields: {}, ...o });

console.log("a) Beebs / Leboncoin en vérification");
const verifBeebs = pub("beebs", { platform_fields: { pas_encore_visible: { regle: "releve_en_verification_0511" } } });
const sansLien = pub("leboncoin", { listing_url: null, platform_fields: { pas_encore_visible: { regle: "test" } } });
const lbcSansLienEnLigne = pub("leboncoin", { id: "lbc-2", listing_url: null });
ok(estEnVerification(verifBeebs) && estEnVerification(sansLien), "marqueur pas_encore_visible → en vérification");
ok(!estEnVerification(lbcSansLienEnLigne), "Leboncoin publiée SANS lien enregistré et sans marqueur → en ligne (062f992c, vue en ligne au relevé)");
ok(!estEnVerification(pub("beebs")) && !estEnVerification(pub("vinted", { listing_url: null })), "lien + pas de marqueur → en ligne ; Vinted jamais concerné");
const r = computeRemovalInfo([verifBeebs, pub("vinted")]);
ok(r.publishedActive.includes("beebs") && plateformesEnVerification(r.publishedActive, r.latestPubByPlatform).join() === "beebs", "Beebs reste publiée (retrait visé) ET en vérification");
const e = etatPlateformes([verifBeebs, sansLien, pub("vinted")]);
ok(!e.enLigne.includes("beebs") && !e.enLigne.includes("leboncoin") && e.enLigne.includes("vinted"), "etatPlateformes : jamais « en ligne » (Stock, Statistiques)", JSON.stringify(e.enLigne));
ok(e.occupees.includes("beebs") && e.occupees.includes("leboncoin"), "… mais occupées : jamais un 2e dépôt");
ok(e.enVerification.includes("beebs") && e.enVerification.includes("leboncoin"), "la liste « en vérification » est rendue");
const item = { id: 1, statut: "stock", disparu_le: null };
ok(repubEtatPlateforme(item, [verifBeebs], "beebs") === "ineligible", "jamais « Remonter » une annonce en vérification");
ok(repubEtatPlateforme(item, [pub("beebs")], "beebs") !== "ineligible", "une annonce Beebs vraiment en ligne reste republiable (comme avant)");

console.log("\nb) Opla quittée");
const eo = etatPlateformes([pub("opla"), pub("vinted")]);
ok(!eo.enLigne.includes("opla") && !eo.occupees.includes("opla"), "un dépôt Opla publié n'est plus ni en ligne ni occupé", JSON.stringify(eo));
ok(repubEtatPlateforme(item, [pub("opla")], "opla") === "ineligible", "jamais de republication Opla");

console.log("\nc) Compteurs");
const st = lire("src/tabs/StockTab.jsx");
ok(st.includes("const enVerification=plateformesEnVerification(publishedActive,latestPubByPlatform);") &&/const pasAchetable=p=>enVerification\.includes\(p\)\|\|p==="opla";/.test(st)
  && /const enLigne=logosEnLigne\.some\(p=>!\(p==="vinted"&&vintedMasquee\)&&!pasAchetable\(p\)\);/.test(st)
  && /filter\(p=>plateformesCompte\.includes\(p\)&&!pasAchetable\(p\)\)\.length;/.test(st),
  "carte du Stock : la pastille verte et le compteur « En ligne (n/N) » sans les dépôts en vérification ni Opla");
ok(/const qteStock=\(l\)=>\(l\?\?\[\]\)\.reduce\(\(a,i\)=>a\+\(Number\(i\.quantite\)>=1000\?1:\(i\.quantite\|\|1\)\),0\);/.test(st), "en-tête : une quantité ≥ 1000 (9999) compte pour un article");
const qteStock = (l) => (l ?? []).reduce((a, i) => a + (Number(i.quantite) >= 1000 ? 1 : (i.quantite || 1)), 0);
ok(qteStock([{ quantite: 9999 }, { quantite: 2 }, { quantite: null }]) === 4, "9999 + 2 + 1 → 4 (et non 10 002)");
const vs = lire("src/utils/vintedSync.js");
ok(/export async function compterEnVenteDuReleve/.test(vs) && /\.eq\('status', 'active'\)/.test(vs), "le compteur de la boutique lit les annonces relevées « active » pendant le relevé");
ok(/en vente\$\{vendues \?/.test(st) && /article\$\{vus > 1 \? 's' : ''\} lu/.test(st), "« N en vente · M vendues encore affichées » ; sans compte lisible : « N articles lus », jamais « annonces »");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — ce que l'app appelle « en ligne »`);
process.exit(ko ? 1 : 0);
