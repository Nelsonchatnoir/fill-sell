// Autotest — une annonce eBay déclarée absente par les relevés : ce qu'eBay en dit vraiment —
// `npm run selftest:ebay-disparue-motif` (_shared/ebay-disparue-motif.js, ebay-api-worker motiverDisparuesEbay).
// Cas du 03/11 (numéros fictifs ici) : une annonce publiée
// par l'API le 01/11 à 14:30:46, fin chez eBay à 14:47:45 (vitrine), 0 vendu ; close « eBay n'a donné aucun motif ».
import { motifAnnonceDisparueEbay, raisonFinDepuisXml, relanceDepuisXml, RAISONS_FIN_EBAY } from "../supabase/functions/_shared/ebay-disparue-motif.js";
import { lireItemTrading } from "../supabase/functions/_shared/ebay-retrait-trading.js";
import fs from "node:fs";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const N = "400000000002";
const xml = ({ statut = "Completed", vendus = 0, fin = "2026-11-01T13:47:45.000Z", raison = null, relance = null, id = N } = {}) =>
  `<GetItemResponse><Ack>Success</Ack><Item><ItemID>${id}</ItemID><ListingDetails><StartTime>2026-11-01T13:30:46.000Z</StartTime><EndTime>${fin}</EndTime>` +
  `${raison ? `<EndingReason>${raison}</EndingReason>` : ""}${relance ? `<RelistedItemID>${relance}</RelistedItemID>` : ""}</ListingDetails>` +
  `<ListingType>FixedPriceItem</ListingType><Seller><UserID>vendeur_test</UserID></Seller><SellingStatus><QuantitySold>${vendus}</QuantitySold><ListingStatus>${statut}</ListingStatus></SellingStatus><Title>Objet</Title></Item></GetItemResponse>`;
const lire = (o) => { const x = xml(o); return { lecture: lireItemTrading(x), raisonFin: raisonFinDepuisXml(x), relance: relanceDepuisXml(x) }; };
const PUB = "2026-11-01T13:30:46.872Z";

console.log("\n1. ARRÊTÉE SANS VENTE");
const a = motifAnnonceDisparueEbay({ ...lire(), publieLe: PUB, numero: N, vitrine: { verdict: "terminee_sans_vente", fin: "2026-11-01T13:47:45.000Z" } });
ok(a?.issue === "arretee_sans_motif" && a.message.startsWith("Cette annonce a bien été en ligne sur eBay, du 01/11 à 14h30 au 01/11 à 14h47, puis elle a été arrêtée sans vente ; eBay ne dit pas pourquoi."),
  "cas du 03/11 : en ligne du 01/11 14h30 au 01/11 14h47, arrêtée sans vente, eBay ne dit pas pourquoi (heure de Paris)", a?.message);
ok(!/aucun motif/.test(a.message) && /Ce n'est ni FillSell ni un refus de publication/.test(a.message) && /ton article reste dans ton stock/.test(a.message), "plus « aucun motif » : ce qu'on sait, sans rien inventer");
const b = motifAnnonceDisparueEbay({ ...lire({ raison: "NotAvailable", relance: "400000000003" }), publieLe: PUB, numero: N });
ok(b?.issue === "arretee_depuis_le_compte" && b.message.includes("arrêtée depuis ton compte eBay, sans vente (motif choisi : « l'article n'est plus disponible »)")
  && b.message.includes("remise en vente sous l'annonce 400000000003"), "motif choisi par le vendeur + remise en vente sous un autre numéro", b?.message);
ok(motifAnnonceDisparueEbay({ ...lire({ raison: "Bizarre" }), publieLe: PUB, numero: N })?.message.includes("« Bizarre »"), "motif inconnu : gardé tel quel");
ok(RAISONS_FIN_EBAY.LostOrBroken && RAISONS_FIN_EBAY.Incorrect, "libellés des motifs eBay");

console.log("\n2. SUPPRIMÉE PAR eBAY");
const refus = lireItemTrading(`<GetItemResponse><Ack>Failure</Ack><Errors><LongMessage>Cette annonce a été supprimée, car elle enfreint notre Règlement sur les contrefaçons.</LongMessage><ErrorCode>17</ErrorCode><SeverityCode>Error</SeverityCode></Errors></GetItemResponse>`);
const c = motifAnnonceDisparueEbay({ lecture: refus, publieLe: PUB, numero: N, vitrine: { verdict: "indetermine", motif: "http_404" } });
ok(c?.issue === "supprimee_par_ebay" && c.message.includes("puis eBay l'a supprimée. Motif donné par eBay : « Cette annonce a été supprimée, car elle enfreint notre Règlement sur les contrefaçons. »"), "eBay l'a supprimée : SES mots", c?.message);
ok(motifAnnonceDisparueEbay({ lecture: refus, publieLe: PUB, numero: N, vitrine: { verdict: "vivante", quantite: {} } }) === null, "⛔ vitrine qui la vend encore → rien conclu");
ok(motifAnnonceDisparueEbay({ lecture: refus, publieLe: PUB, numero: N, vitrine: null }) === null, "⛔ vitrine muette → rien conclu");

console.log("\n3. JAMAIS DE FAUX MESSAGE");
const act = motifAnnonceDisparueEbay({ ...lire({ statut: "Active", fin: "2026-12-01T00:00:00Z" }), publieLe: PUB, numero: N });
ok(act?.issue === "encore_active" && act.message === null, "eBay la dit encore active → message inchangé (signalé)");
const ven = motifAnnonceDisparueEbay({ ...lire({ vendus: 1 }), publieLe: PUB, numero: N });
ok(ven?.issue === "vendue" && ven.message === null, "vendue → jamais ici (circuit des ventes)");
ok(motifAnnonceDisparueEbay({ ...lire({ id: "400000000003" }), publieLe: PUB, numero: N }) === null, "eBay rend un autre numéro → rien");
ok(motifAnnonceDisparueEbay({ lecture: null, publieLe: PUB, numero: N }) === null, "lecture impossible → rien");
ok(motifAnnonceDisparueEbay({ lecture: lireItemTrading(`<GetItemResponse><Ack>Failure</Ack><Errors><LongMessage>Internal error</LongMessage><ErrorCode>10007</ErrorCode><SeverityCode>Error</SeverityCode></Errors></GetItemResponse>`), numero: N, vitrine: { verdict: "indetermine", motif: "http_404" } }) === null,
  "panne eBay (10007) → rien conclu");
ok(motifAnnonceDisparueEbay({ ...lire(), publieLe: null, numero: N })?.message.startsWith("Cette annonce a bien été en ligne sur eBay jusqu'au 01/11 à 14h47"), "date de publication inconnue : seulement la fin");

console.log("\n4. LE WORKER L'APPLIQUE");
const w = fs.readFileSync(new URL("../supabase/functions/ebay-api-worker/index.ts", import.meta.url), "utf8");
const corps = w.slice(w.indexOf("async function motiverDisparuesEbay"), w.indexOf("async function lireGetItemDiagnostic"));
ok(corps.includes('.eq("platform_fields->depot_jamais_en_ligne->>issue", "refus_moderation_probable")') && corps.includes('.is("platform_fields->motif_ebay", null)')
  && corps.includes(".limit(DISPARUES_PAR_PASSE)") && /const DISPARUES_PAR_PASSE = 3;/.test(w), "cible : closes « absente, sans motif », pas encore relues, 3 par passe");
ok(corps.includes("new Date().getUTCMinutes() % 10 >= 2") && corps.includes("7 * 24 * 3600_000"), "une passe sur cinq, 7 jours au plus");
ok(corps.includes('.eq("action", "delete").eq("platform_listing_id", numero)') && corps.includes('issue: "retrait_fillsell"'), "⛔ une annonce touchée par un retrait FillSell : jamais « pas par FillSell »");
ok(corps.includes('.eq("id", j.id).eq("status", "failed")'), "écriture conditionnée au statut « failed »");
ok(corps.includes("essais >= DISPARUES_ESSAIS_MAX") && corps.includes("message_avant"), "3 essais puis illisible ; l'ancien message gardé dans la trace");
ok(w.includes("disparues = await motiverDisparuesEbay(admin, env)") && /catch \(e\) \{ disparues = \{ erreur/.test(w), "branchée dans la boucle, jamais bloquante");

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
