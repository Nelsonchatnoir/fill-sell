// ── AUTOTEST : eBay ORDER_CONFIRMATION → la veille, et « vendue » seulement si prouvé (05/10)
//   node scripts/ebay-commande-notification-selftest.mjs
import { lireCommandeConfirmee, patchCommandeSurJob, TOPIC_COMMANDE } from "../supabase/functions/_shared/ebay-commande-notification.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const notif = (lignes, topic = TOPIC_COMMANDE) => ({
  metadata: { topic, schemaVersion: "1.0" },
  notification: { notificationId: "n-1", eventDate: "2026-10-05T12:00:00.000Z",
    data: { user: { userId: "u-pub", username: "xxewwer" }, order: { orderId: "15-15245-15618", orderLineItems: lignes } } },
});

console.log("\n1. Lecture du message");
const c = lireCommandeConfirmee(notif([{ orderLineItemId: "10085383325115", listingId: "377494897809", quantity: 1 }]));
ok(c?.orderId === "15-15245-15618" && c.lignes.length === 1 && c.lignes[0].listingId === "377494897809" && c.lignes[0].quantite === 1, "commande, ligne, numéro d'annonce, quantité");
ok(c?.username === "xxewwer" && c?.userId === "u-pub", "le vendeur (pseudo et identifiant public)");
ok(lireCommandeConfirmee(notif([{ listingId: "377494897809", quantity: 1 }], "MARKETPLACE_ACCOUNT_DELETION")) === null, "un autre sujet : rien");
ok(lireCommandeConfirmee(notif([{ listingId: "abc", quantity: 1 }])) === null, "aucun numéro d'annonce valable : rien");
ok(lireCommandeConfirmee({ metadata: { topic: TOPIC_COMMANDE }, notification: { data: {} } }) === null, "message vide : rien");

console.log("\n2. Annonce à UNE unité, signature valide : « vendue » tout de suite");
const ligne = c.lignes[0];
const pf1 = { veille_ebay_le: "2026-10-05T09:00:00Z", quantite_ebay: { disponible: 1, exacte: true, vendus: 0 } };
const r1 = patchCommandeSurJob(pf1, ligne, { orderId: c.orderId, notificationId: c.notificationId, signatureValide: true, maintenant: "2026-10-05T12:00:05Z" });
ok(r1.vendue && r1.pf.sale_signal === "sold" && r1.pf.sale_evidence?.source === "order_confirmation" && r1.pf.sale_evidence?.exact === true, "sale_signal 'sold' + preuve (commande)");
ok(!("veille_ebay_le" in r1.pf), "poussée en tête de la veille (veille_ebay_le effacé)");
ok(r1.pf.commandes_ebay?.length === 1 && r1.pf.commandes_ebay[0].order_id === "15-15245-15618", "la commande est notée sur le job");
ok(pf1.sale_signal === undefined, "l'objet d'entrée n'est pas modifié");

console.log("\n3. Jamais « vendue » sans preuve du stock épuisé, ni sans signature valide");
const r2 = patchCommandeSurJob({ quantite_ebay: { disponible: 3, exacte: true } }, ligne, { orderId: "o2", signatureValide: true });
ok(!r2.vendue && r2.raison === "stock_restant" && r2.pf.sale_signal === undefined && !("veille_ebay_le" in r2.pf), "3 en stock, 1 commandé : la veille tranche, aucun drapeau");
const r3 = patchCommandeSurJob({}, ligne, { orderId: "o3", signatureValide: true });
ok(!r3.vendue && r3.raison === "stock_inconnu", "stock inconnu : la veille tranche");
const r4 = patchCommandeSurJob({ quantite_ebay: { disponible: 1, exacte: false } }, ligne, { orderId: "o4", signatureValide: true });
ok(!r4.vendue, "stock non exact : la veille tranche");
const r5 = patchCommandeSurJob({ quantite_ebay: { disponible: 1, exacte: true } }, ligne, { orderId: "o5", signatureValide: false });
ok(!r5.vendue && r5.raison === "signature_non_valide" && r5.pf.sale_signal === undefined, "signature indéterminée : jamais « vendue » (les retraits ne partent pas sur un message non prouvé)");
const r6 = patchCommandeSurJob({ quantite_ebay: { disponible: 2, exacte: true } }, { ...ligne, quantite: 2 }, { orderId: "o6", signatureValide: true });
ok(r6.vendue, "2 en stock, 2 commandés : épuisé, « vendue »");

console.log("\n4. Rejouée par eBay : rien de neuf");
const r7 = patchCommandeSurJob(r1.pf, ligne, { orderId: c.orderId, notificationId: "n-1", signatureValide: true, maintenant: "2026-10-05T12:01:00Z" });
ok(!r7.nouvelle && r7.pf.commandes_ebay.length === 1, "même commande, même ligne : notée une seule fois");
ok(r7.pf.sale_evidence.lu_le === "2026-10-05T12:00:05Z", "la preuve d'origine n'est pas réécrite");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ ORDER_CONFIRMATION : la veille en tête, « vendue » seulement sur preuve");
