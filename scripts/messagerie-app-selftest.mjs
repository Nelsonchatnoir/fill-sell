// Selftest — les écrans de la bêta « messages + bordereaux » (16/10/2026).
//   npm run selftest:messagerie-app
//
// Ce qu'il garantit :
//   a. rien pour le parc : la barre, l'espace « Messages · À expédier », la
//      section « À expédier » des Ventes et l'indicateur de la carte ne se
//      rendent QUE pour un compte bêta ; hors bêta, une seule lecture puis
//      plus rien (la relecture s'arrête) ; jamais de setInterval ;
//   b. le bouton « Bordereau » est INACTIF dans tous les cas ;
//   c. une réponse verrouillée le dit (liste blanche), une réponse en échec dit
//      que rien n'est parti ;
//   d. non lus : même règle que messagerie_compteurs (systèmes exclus, vue
//      dans FillSell après le dernier message = lue) ; tri et « À expédier » ;
//   e. eBay : normaliseurs serveur (messages groupés par annonce ×
//      interlocuteur, commandes sans adresse) ;
//   f. aucun émoji, jamais « pépites ».
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { conversationNonLue, trierConversations, etatReponse, boutonBordereau, commandesAExpedier, libelleEtatCommande, nomPlateforme } from "../src/messagerie/vue.js";
import { conversationsEbay, commandesEbay, texteMessageEbay, etatCommandeEbay } from "../supabase/functions/_shared/messagerie-ebay.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
console.log("messagerie-app-selftest");

const APP = lire("src/App.jsx");
const STOCK = lire("src/tabs/StockTab.jsx");
const VENTES = lire("src/tabs/VentesTab.jsx");
const CARTE = lire("src/stock/Carte.jsx");
const HOOK = lire("src/messagerie/useMessagerieBeta.js");
const FICHIERS_UI = ["src/messagerie/EspaceMessagerie.jsx", "src/messagerie/SectionAExpedier.jsx", "src/messagerie/BarreMessagerie.jsx", "src/messagerie/vue.js", "src/messagerie/useMessagerieBeta.js"];

// ── a. Rien pour le parc ─────────────────────────────────────────────────────
await cas("App : la barre et l'espace ne se rendent que pour un compte bêta", () => {
  assert.ok(/\{messagerie\.beta&&\(\s*<BarreMessagerie/.test(APP), "barre sous messagerie.beta");
  assert.ok(/\{messagerie\.beta&&espaceMessagerie&&\(/.test(APP), "espace sous messagerie.beta");
  assert.ok(/messagerie=\{messagerie\.beta\?\{parArticle:messagerie\.parArticle\}:null\}/.test(APP), "Stock : null hors bêta");
  assert.ok(/messagerieBeta=\{messagerie\.beta\}/.test(APP), "Ventes : booléen bêta");
  assert.ok(/lazyMessagerie\(\(\) => import\('\.\/messagerie\/EspaceMessagerie'\)\)/.test(APP), "espace chargé à la demande");
});

await cas("Stock et Ventes : indicateur et section derrière le drapeau", () => {
  assert.ok(/messages=\{messagerie \? \(Number\(messagerie\.parArticle\?\.\[item\.id\]\) \|\| 0\) : null\}/.test(STOCK));
  assert.ok(/\{p\.messages > 0 && \(/.test(CARTE), "la carte n'affiche rien à 0 ni à null");
  assert.ok(/\(p\.marque \|\| p\.vues != null \|\| p\.favoris != null \|\| p\.boutique \|\| p\.messages > 0\)/.test(CARTE));
  assert.ok(/\{messagerieBeta&&<SectionAExpedier /.test(VENTES));
  assert.ok(/messagerieBeta=false,/.test(VENTES), "défaut fermé");
});

await cas("le drapeau : une lecture hors bêta puis la relecture s'arrête ; jamais de setInterval", () => {
  assert.ok(/data\.beta !== true\) \{\s*setEtat\(\{ \.\.\.VIDE, pret: true, user: userId \}\);\s*relecture\.current\?\.arreter\(\);/.test(HOOK));
  assert.ok(/demarrerRelecture\(lire, \{ intervalleMs: 120_000/.test(HOOK));
  for (const f of FICHIERS_UI) assert.ok(!/setInterval\s*\(/.test(lire(f)), f);
});

// ── b. Le bouton « Bordereau » ───────────────────────────────────────────────
await cas("le bouton « Bordereau » est inactif dans tous les cas, et dit pourquoi", () => {
  for (const c of [
    { platform: "vinted", etat: "a_expedier", bordereau: "pret" },
    { platform: "vinted", etat: "a_expedier", bordereau: "a_obtenir" },
    { platform: "leboncoin", etat: "a_confirmer", bordereau: "a_generer" },
    { platform: "leboncoin", etat: "a_expedier", bordereau: "indisponible" },
    { platform: "ebay", etat: "a_expedier", bordereau: "a_obtenir" },
    { platform: "beebs", etat: "a_expedier", bordereau: "inconnu" },
  ]) {
    const b = boutonBordereau(c, "fr");
    assert.equal(b.actif, false, JSON.stringify(c));
    assert.ok(b.titre.includes("vraie commande"));
    assert.ok(b.aide.length > 10);
  }
  assert.ok(/boutonBordereau\(c, 'fr'\)|boutonBordereau\(c, lang\)/.test(lire("src/messagerie/SectionAExpedier.jsx")));
  assert.ok(/<button type="button" disabled /.test(lire("src/messagerie/SectionAExpedier.jsx")), "rendu désactivé en dur");
  assert.ok(boutonBordereau({ platform: "leboncoin", etat: "a_confirmer" }).aide.includes("disponibilité"));
  assert.ok(boutonBordereau({ platform: "ebay", etat: "a_expedier" }).aide.includes("eBay"));
});

// ── c. Les réponses ──────────────────────────────────────────────────────────
await cas("réponses : verrouillée → « liste blanche », échec → « rien n'est parti »", () => {
  assert.ok(etatReponse({ statut: "verrouillee", motif: "liste_blanche" }).texte.includes("liste blanche"));
  assert.ok(etatReponse({ statut: "verrouillee", motif: "plafond_jour" }).texte.includes("20 réponses"));
  assert.ok(etatReponse({ statut: "echec" }).texte.includes("rien n’est parti"));
  assert.equal(etatReponse({ statut: "envoyee" }).ton, "ok");
});

// ── d. Non lus, tri, À expédier ──────────────────────────────────────────────
await cas("non lus : systèmes exclus ; vue dans FillSell après le dernier message = lue", () => {
  assert.equal(conversationNonLue({ non_lus: 2, dernier_message_le: "2026-10-16T10:00:00Z" }), true);
  assert.equal(conversationNonLue({ non_lus: 2, systeme: true, dernier_message_le: "2026-10-16T10:00:00Z" }), false);
  assert.equal(conversationNonLue({ non_lus: 2, dernier_message_le: "2026-10-16T10:00:00Z", vu_dans_app_le: "2026-10-16T11:00:00Z" }), false);
  assert.equal(conversationNonLue({ non_lus: 2, dernier_message_le: "2026-10-16T12:00:00Z", vu_dans_app_le: "2026-10-16T11:00:00Z" }), true);
  assert.equal(conversationNonLue({ non_lus: 0 }), false);
  const t = trierConversations([
    { id: "a", non_lus: 0, dernier_message_le: "2026-10-16T12:00:00Z" },
    { id: "b", non_lus: 1, dernier_message_le: "2026-10-15T12:00:00Z" },
    { id: "c", systeme: true, non_lus: 3, dernier_message_le: "2026-10-16T13:00:00Z" },
  ]);
  assert.deepEqual(t.map((x) => x.id), ["b", "a", "c"]);
});

await cas("À expédier : à confirmer d'abord, puis la plus ancienne ; rien d'autre", () => {
  const l = commandesAExpedier([
    { id: 1, etat: "a_expedier", vendue_le: "2026-10-15T10:00:00Z" },
    { id: 2, etat: "livree" },
    { id: 3, etat: "a_confirmer", vendue_le: "2026-10-16T10:00:00Z" },
    { id: 4, etat: "a_expedier", vendue_le: "2026-10-14T10:00:00Z" },
  ]);
  assert.deepEqual(l.map((c) => c.id), [3, 4, 1]);
  assert.equal(libelleEtatCommande("a_confirmer"), "Disponibilité à confirmer");
  assert.equal(nomPlateforme("leboncoin"), "Leboncoin");
});

// ── e. eBay (serveur) ────────────────────────────────────────────────────────
await cas("eBay : messages groupés par annonce × interlocuteur ; messages d'eBay = système ; 30 jours", () => {
  const maintenant = Date.parse("2026-10-16T12:00:00Z");
  const r = conversationsEbay([
    { message_id: "1", external_id: "x1", sender: "acheteur1", folder_id: "0", item_id: "123", item_title: "Montre", receive_date: "2026-10-15T10:00:00Z", read: false, message_type: "AskSellerQuestion", response_enabled: true, texte: "Dispo ?" },
    { message_id: "2", external_id: "x2", sender: null, recipient: "acheteur1", folder_id: "1", item_id: "123", receive_date: "2026-10-15T11:00:00Z", read: true, message_type: "ResponseToASQQuestion", texte: "Oui" },
    { message_id: "3", sender: "eBay", folder_id: "0", subject: "Avis", receive_date: "2026-10-14T10:00:00Z", read: false, message_type: "eBayMessage" },
    { message_id: "4", sender: "acheteur2", folder_id: "0", item_id: "9", receive_date: "2026-08-01T10:00:00Z", read: false },
  ], maintenant);
  assert.equal(r.conversations.length, 2);
  const c = r.conversations.find((x) => x.ref === "123:acheteur1");
  assert.equal(c.non_lus, 1);
  assert.equal(c.cote, "vendeur");
  assert.equal(c.reponse_possible, true);
  assert.equal(r.messages.find((m) => m.ref === "x2").sens, "envoye");
  assert.ok(r.conversations.find((x) => x.systeme), "message d'eBay = système");
  assert.ok(!r.messages.some((m) => m.ref === "4"), "plus de 30 jours");
});

await cas("eBay : commandes sans adresse, état et date limite", () => {
  const [c] = commandesEbay([{
    orderId: "12-345", orderFulfillmentStatus: "NOT_STARTED", orderPaymentStatus: "PAID", creationDate: "2026-10-15T10:00:00.000Z",
    buyer: { username: "acheteur_e", buyerRegistrationAddress: { fullName: "Jean Dupont", email: "j@d.fr" } },
    pricingSummary: { total: { value: "25.00", currency: "EUR" } },
    lineItems: [{ legacyItemId: "123", title: "Montre", lineItemFulfillmentInstructions: { shipByDate: "2026-10-18T22:59:59.000Z" } }],
    fulfillmentStartInstructions: [{ shippingStep: { shippingServiceCode: "FR_ColiposteColissimo", shipTo: { fullName: "Jean Dupont", contactAddress: { addressLine1: "1 rue" } } } }],
  }]);
  assert.equal(c.etat, "a_expedier");
  assert.equal(c.acheteur_pseudo, "acheteur_e");
  assert.equal(c.annonce_ref, "123");
  assert.equal(c.montant, 25);
  assert.equal(c.a_expedier_avant, "2026-10-18T22:59:59.000Z");
  assert.equal(c.transporteur, "FR_ColiposteColissimo");
  const s = JSON.stringify(c);
  for (const interdit of ["Jean", "Dupont", "j@d.fr", "1 rue"]) assert.ok(!s.includes(interdit), interdit);
  assert.equal(etatCommandeEbay("FULFILLED", null), "expediee");
  assert.equal(etatCommandeEbay("NOT_STARTED", "CANCELED"), "annulee");
});

await cas("eBay : le texte d'un message sort du gabarit HTML, borné", () => {
  assert.equal(texteMessageEbay('<html><div id="UserInputtedText">Bonjour,<br>toujours dispo ?</div><div>pied</div></html>'), "Bonjour, toujours dispo ?");
  assert.equal(texteMessageEbay(null, "Texte brut"), "Texte brut");
  assert.ok(texteMessageEbay("<p>" + "a".repeat(5000) + "</p>").length <= 4000);
});

// ── f. Règles d'écran ────────────────────────────────────────────────────────
await cas("aucun émoji, jamais « pépites »", () => {
  for (const f of FICHIERS_UI) {
    const t = lire(f);
    assert.ok(!/pépite/i.test(t), f);
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t), `émoji dans ${f}`);
  }
});

console.log(`messagerie-app-selftest : ${n} cas verts`);
