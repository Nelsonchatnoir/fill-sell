// Autotest — un retrait eBay d'un compte relié passe par l'API Trading —
// `npm run selftest:ebay-retrait-trading` (_shared/ebay-retrait-trading.js,
// ebay-api-worker). Cas réel du 15/10 : Amega Gaming (compte relié
// « vintora16 »), annonce 178450879276 (import du relevé), article vendu sur
// Vinted le 14/10, retrait bloqué « Connexion eBay requise ».
import { lireItemTrading, verdictAvantRetraitTrading, preuveApresRetraitTrading, retraitBloqueParSessionEbay, retraitAttendLePoste, RETRAIT_ATTENTE_POSTE_MS } from "../supabase/functions/_shared/ebay-retrait-trading.js";
import fs from "node:fs";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const xml = ({ id = "178450879276", vendeur = "vintora16", statut = "Active", vendus = 0, type = "FixedPriceItem", ack = "Success" } = {}) =>
  `<?xml version="1.0" encoding="UTF-8"?><GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>${ack}</Ack><Item><ItemID>${id}</ItemID>` +
  `<ListingDetails><EndTime>2026-11-14T18:25:00.000Z</EndTime></ListingDetails><ListingType>${type}</ListingType>` +
  `<Seller><UserID>${vendeur}</UserID></Seller><SellingStatus><QuantitySold>${vendus}</QuantitySold><ListingStatus>${statut}</ListingStatus></SellingStatus>` +
  `<Title>Lot de 3 boxers Pierre Cardin taille L</Title></Item></GetItemResponse>`;

console.log("\n1. LA LECTURE GetItem");
const l = lireItemTrading(xml());
ok(l.itemId === "178450879276" && l.vendeur === "vintora16" && l.statut === "Active" && l.type === "FixedPriceItem", "champs lus", JSON.stringify(l));
const err = lireItemTrading(`<GetItemResponse><Ack>Failure</Ack><Errors><ShortMessage>Invalid</ShortMessage><LongMessage>Item not found.</LongMessage><ErrorCode>17</ErrorCode><SeverityCode>Error</SeverityCode></Errors></GetItemResponse>`);
ok(err.ack === "Failure" && err.erreurs[0]?.code === "17", "erreur eBay lue");

console.log("\n2. AVANT TOUT GESTE");
ok(verdictAvantRetraitTrading({ itemId: "178450879276", compteEbay: "vintora16", lecture: l }).geste === "retirer", "Amega : même numéro, même vendeur, active → retirer");
ok(verdictAvantRetraitTrading({ itemId: "178450879276", compteEbay: "vintora16", lecture: l }).appel === "EndFixedPriceItem", "prix fixe → EndFixedPriceItem");
ok(verdictAvantRetraitTrading({ itemId: "1", compteEbay: "v", lecture: lireItemTrading(xml({ id: "1", vendeur: "v", type: "Chinese" })) }).appel === "EndItem", "enchère → EndItem");
ok(verdictAvantRetraitTrading({ itemId: "178450879276", compteEbay: "VINTORA16", lecture: l }).geste === "retirer", "vendeur comparé sans la casse");
ok(verdictAvantRetraitTrading({ itemId: "178450879276", compteEbay: "autre_pseudo", lecture: l }).geste === "autre_compte", "autre compte eBay → jamais touchée");
ok(verdictAvantRetraitTrading({ itemId: "178450879277", compteEbay: "vintora16", lecture: l }).geste === "identite", "eBay rend un autre numéro → arrêt");
ok(verdictAvantRetraitTrading({ itemId: "178450879276", compteEbay: "vintora16", lecture: lireItemTrading(xml({ statut: "Completed", vendus: 1 })) }).geste === "deja_vendue", "déjà vendue sur eBay → on le dit (double vente)");
ok(verdictAvantRetraitTrading({ itemId: "178450879276", compteEbay: "vintora16", lecture: lireItemTrading(xml({ statut: "Ended" })) }).geste === "deja_terminee", "déjà terminée sans vente → rien à faire");
ok(verdictAvantRetraitTrading({ itemId: "178450879276", compteEbay: "vintora16", lecture: err }).geste === "illisible", "lecture en échec → rien n'est touché");
ok(verdictAvantRetraitTrading({ itemId: "178450879276", compteEbay: "", lecture: l }).geste === "autre_compte", "compte relié inconnu → jamais touchée");

console.log("\n3. LA PREUVE APRÈS");
ok(preuveApresRetraitTrading({ itemId: "178450879276", lecture: lireItemTrading(xml({ statut: "Completed" })) }).prouve === true, "relue terminée → prouvé");
ok(preuveApresRetraitTrading({ itemId: "178450879276", lecture: l }).prouve === false, "toujours active → pas prouvé (reporté)");
ok(preuveApresRetraitTrading({ itemId: "178450879276", lecture: null }).prouve === false, "relecture impossible → pas prouvé");

console.log("\n4. QUELS RETRAITS PASSENT PAR L'API");
const amega = { platform: "ebay", action: "delete", status: "needs_user", platform_fields: { needs_user_source: "connexion", attente_session: { depuis: "2026-10-14T17:50:00Z" } } };
ok(retraitBloqueParSessionEbay(amega), "Amega 3691ee7a (needs_user connexion) → voie API");
ok(retraitBloqueParSessionEbay({ ...amega, status: "pending", platform_fields: { attente_session: {} } }), "en attente de session → voie API");
ok(!retraitBloqueParSessionEbay({ ...amega, status: "pending", platform_fields: {} }), "un retrait en file normal reste à l'extension");
ok(!retraitBloqueParSessionEbay({ ...amega, platform: "leboncoin" }), "eBay seulement");
ok(!retraitBloqueParSessionEbay({ ...amega, action: "publish" }), "retraits seulement");

console.log("\n4 bis. LE RETRAIT N'ATTEND JAMAIS L'ORDINATEUR (24/10, Thierry)");
const t0 = Date.parse("2026-10-23T17:00:00+02:00");
const thierry = { platform: "ebay", action: "delete", status: "pending", created_at: "2026-10-23T14:40:40.389671+00:00",
  platform_fields: { reprise_processing: { le: "2026-10-23T16:03:01.440Z", par: "handler-watch", motif: "poste_muet", age_min: 46 } } };
ok(retraitAttendLePoste(thierry, t0), "Thierry d5075013 : rendu « poste muet » par le chien de garde → voie API");
ok(retraitAttendLePoste({ ...thierry, platform_fields: {} }, Date.parse("2026-10-23T16:56:00+02:00")), "15 min en file sans être fait → voie API");
ok(!retraitAttendLePoste({ ...thierry, platform_fields: {} }, Date.parse("2026-10-23T16:50:00+02:00")), "10 min en file : l'extension a encore la main");
ok(!retraitAttendLePoste({ ...thierry, status: "processing" }, t0), "jamais un retrait en cours chez l'extension (processing)");
ok(!retraitAttendLePoste({ ...thierry, platform: "vinted" }, t0) && !retraitAttendLePoste({ ...thierry, action: "republish" }, t0), "eBay et retraits seulement");
ok(retraitAttendLePoste({ ...thierry, platform_fields: { interruption: { poste: "muet" } } }, Date.parse("2026-10-23T16:42:00+02:00")), "interruption « poste muet » → voie API sans attendre");
ok(RETRAIT_ATTENTE_POSTE_MS === 15 * 60_000, "délai : 15 min");

console.log("\n5. LE WORKER L'APPLIQUE");
const w = fs.readFileSync(new URL("../supabase/functions/ebay-api-worker/index.ts", import.meta.url), "utf8");
ok(/if \(!precedent && \/\^\\d\{9,\}\$\/\.test\(idAnnonce\)\) return await retirerParTrading/.test(w), "retirer() : sans publication de notre API → Trading");
ok(/\.update\(\{ voie: "api", status: "pending", error: null, platform_fields: pf \}\)/.test(w) && /\.eq\("voie", "extension"\)\.select\("id"\)/.test(w), "reroutage voie extension → api (CAS)");
ok(/await lire\(\)/.test(w) && /preuveApresRetraitTrading/.test(w), "GetItem relu avant ET après le geste");
ok(/if \(!parSession && !retraitAttendLePoste\(j\)\) continue;/.test(w) && /platform_fields, created_at"\)/.test(w),
  "reroutage : session absente OU ordinateur qui n'a pas fait le retrait à temps (created_at lu)");

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
