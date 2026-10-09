// Selftest — l'état d'une annonce eBay lu sur l'API Browse (09/10, Marta).
// Rejoue les réponses RÉELLES relevées le 09/10 à ~12:00 (Paris) par l'action
// en lecture seule `mesure_annonces` d'ebay-api-worker, à l'instant où le
// veilleur les avait lues (vu_le), et vérifie le verdict.
//   npm run selftest:ebay-encheres
import assert from "node:assert/strict";
import { verdictAnnonceEbay, drapeauAvantLaFin, formatEbay, DELAI_FIN_ENCHERE_MS } from "../supabase/functions/_shared/ebay-etat-annonce.js";

const browse = ({ fin = null, options, dispo = "IN_STOCK", q = 1, vendus = 0, bids = null, prix = "10.00" }) => ({
  itemEndDate: fin ?? undefined,
  buyingOptions: options,
  bidCount: bids ?? undefined,
  price: { value: prix, currency: "EUR" },
  estimatedAvailabilities: [{ estimatedAvailabilityStatus: dispo, estimatedAvailableQuantity: q, estimatedSoldQuantity: vendus }],
});
const t = (iso) => Date.parse(iso);
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };

console.log("ebay-encheres-selftest");

// 1. Marta — 920016444915, enchère avec achat immédiat, fin 14/10, lue le 09/10 09:30:05Z.
cas("Marta : enchère en cours (fin future) = VIVANTE, jamais « terminée »", () => {
  const j = browse({ fin: "2026-10-14T06:36:52.000Z", options: ["FIXED_PRICE", "AUCTION"], prix: "26.70" });
  const v = verdictAnnonceEbay(j, t("2026-10-09T09:30:05.575Z"));
  assert.equal(v.verdict, "vivante");
  assert.equal(v.format, "AUCTION");
  assert.equal(v.fin, "2026-10-14T06:36:52.000Z");
});

// 2. Les 8 autres annonces de Marta : prix fixe, offre possible, sans fin (GTC).
cas("Marta : prix fixe sans date de fin = VIVANTE", () => {
  const v = verdictAnnonceEbay(browse({ options: ["FIXED_PRICE", "BEST_OFFER"] }), t("2026-10-09T09:30:05Z"));
  assert.equal(v.verdict, "vivante");
  assert.equal(v.format, "FIXED_PRICE");
});

// 3. labouqu_7 — 158310494197, enchère, fin 26/09 19:34Z, lue le 25/09 16:52Z (AVANT la fin).
cas("labouqu_7 : enchère lue la veille de sa fin = VIVANTE (le 25/09 elle avait été posée « terminée »)", () => {
  const j = browse({ fin: "2026-09-26T19:34:36.000Z", options: ["AUCTION", "BEST_OFFER"], prix: "2.24" });
  assert.equal(verdictAnnonceEbay(j, t("2026-09-25T16:52:02.966Z")).verdict, "vivante");
});
cas("labouqu_7 : la même enchère, terminée sans acheteur (relue le 09/10) = ENCHÈRE SANS ACHETEUR, jamais une vente", () => {
  const j = browse({ fin: "2026-09-26T19:34:36.000Z", options: ["AUCTION", "BEST_OFFER"], prix: "2.24" });
  const v = verdictAnnonceEbay(j, t("2026-10-09T10:00:00Z"));
  assert.equal(v.verdict, "enchere_sans_acheteur");
  assert.notEqual(v.verdict, "vendue");
});

// 4. Jocabroc — 407252783089, enchère, 2 offres, fin 05/10 18:04:30Z, vendue 1,50 €.
cas("Jocabroc : enchère lue 2 h avant sa fin = VIVANTE (le 05/10 elle avait été posée « terminée »)", () => {
  const j = browse({ fin: "2026-10-05T18:04:30.000Z", options: ["AUCTION"], bids: 1, prix: "1.00" });
  assert.equal(verdictAnnonceEbay(j, t("2026-10-05T16:02:02.344Z")).verdict, "vivante");
});
cas("Jocabroc : enchère terminée avec acheteur (OUT_OF_STOCK, 1 vendu) = VENDUE (vraie vente gardée)", () => {
  const j = browse({ fin: "2026-10-05T18:04:30.000Z", options: ["AUCTION"], dispo: "OUT_OF_STOCK", q: 0, vendus: 1, bids: 2, prix: "1.50" });
  const v = verdictAnnonceEbay(j, t("2026-10-06T10:06:03.346Z"));
  assert.equal(v.verdict, "vendue");
  assert.equal(v.prix, 1.5);
  assert.equal(v.vendus, 1);
});
cas("Enchère terminée depuis moins d'une heure, 0 vendu = INDÉTERMINÉ (le gagnant peut ne pas être compté)", () => {
  const j = browse({ fin: "2026-10-05T18:04:30.000Z", options: ["AUCTION"], bids: 2 });
  const v = verdictAnnonceEbay(j, t("2026-10-05T18:04:30.000Z") + DELAI_FIN_ENCHERE_MS - 1000);
  assert.equal(v.verdict, "indetermine");
  assert.equal(v.limite, false);
});

// 5. XEWER — 377552164234, prix fixe, fin 07/10 15:51:28Z, lue 15:52:03Z : arrêtée par le vendeur.
cas("XEWER : prix fixe terminé (fin passée), 0 vendu = TERMINÉE SANS VENTE → la question reste", () => {
  const j = browse({ fin: "2026-10-07T15:51:28.000Z", options: ["FIXED_PRICE", "BEST_OFFER"], prix: "104.69" });
  assert.equal(verdictAnnonceEbay(j, t("2026-10-07T15:52:03.049Z")).verdict, "terminee_sans_vente");
});
cas("Prix fixe à durée fixe, fin FUTURE = VIVANTE (plus jamais « terminée » avant l'heure)", () => {
  const j = browse({ fin: "2026-10-20T12:00:00.000Z", options: ["FIXED_PRICE"] });
  assert.equal(verdictAnnonceEbay(j, t("2026-10-09T12:00:00Z")).verdict, "vivante");
});

// 6. Règles du 01/10 inchangées.
cas("Prix fixe sans fin épuisé avec 1 vendu = VENDUE (01/10, inchangé)", () => {
  const j = browse({ options: ["FIXED_PRICE"], dispo: "OUT_OF_STOCK", q: 0, vendus: 1 });
  assert.equal(verdictAnnonceEbay(j, Date.now()).verdict, "vendue");
});
cas("0 disponible SANS vendu n'est pas une vente (rupture posée par la personne)", () => {
  const j = browse({ options: ["FIXED_PRICE"], dispo: "OUT_OF_STOCK", q: 0, vendus: 0 });
  assert.notEqual(verdictAnnonceEbay(j, Date.now()).verdict, "vendue");
});
cas("Date de fin illisible = INDÉTERMINÉ", () => {
  assert.equal(verdictAnnonceEbay(browse({ fin: "pas une date", options: ["AUCTION"] }), Date.now()).verdict, "indetermine");
});

// 7. Le drapeau posé avant la fin (les 16 du parc au 09/10).
cas("drapeauAvantLaFin : fin 14/10 lue le 09/10 = posé avant la fin", () => {
  assert.equal(drapeauAvantLaFin({ fin_ebay: { fin: "2026-10-14T06:36:52.000Z", vendus: 0, vu_le: "2026-10-09T09:30:05.575Z" } }), true);
  assert.equal(drapeauAvantLaFin({ fin_ebay: { fin: "2026-10-07T15:51:28.000Z", vendus: 0, vu_le: "2026-10-07T15:52:03.049Z" } }), false);
  assert.equal(drapeauAvantLaFin({}), false);
});
cas("formatEbay", () => {
  assert.equal(formatEbay(["FIXED_PRICE", "AUCTION"]), "AUCTION");
  assert.equal(formatEbay(["FIXED_PRICE", "BEST_OFFER"]), "FIXED_PRICE");
  assert.equal(formatEbay(undefined), null);
});

console.log(`ebay-encheres-selftest : ${n} cas verts`);
