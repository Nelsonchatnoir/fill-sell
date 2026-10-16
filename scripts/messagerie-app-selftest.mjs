// Selftest — les écrans de la bêta « messages + bordereaux » (16/10/2026).
//   npm run selftest:messagerie-app
//
// Ce qu'il garantit :
//   a. rien pour le parc : la barre, l'espace « Messages · À expédier », la
//      section « À expédier » des Ventes et l'indicateur de la carte ne se
//      rendent QUE pour un compte bêta ; hors bêta, une seule lecture puis
//      plus rien (la relecture s'arrête) ; jamais de setInterval ;
//   b. (16/10 soir) le bouton « Bordereau » n'est ACTIF que pour Vinted et
//      Leboncoin, bordereau PRÊT chez la plateforme ; il dépose une demande
//      (bordereau_demander) et rien d'autre ; tout geste qui engage ouvre la
//      page de la plateforme (lien), jamais une action de FillSell ;
//   b'. les murs des relevés (Beebs sans téléphone vérifié, session absente,
//      pause) sont dits en clair ; un 401 seul n'en est pas un ;
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
import { conversationNonLue, trierConversations, etatReponse, actionCommande, commandesAExpedier, libelleEtatCommande, nomPlateforme, lienCommande, lienConversation, murReleve, delaiEnvoi, etatZoneReponse, etatDemandeBordereau, refusDemandeBordereau, pseudoAffiche, libelleTransporteur } from "../src/messagerie/vue.js";
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
const FICHIERS_UI = ["src/messagerie/EspaceMessagerie.jsx", "src/messagerie/SectionAExpedier.jsx", "src/messagerie/BarreMessagerie.jsx", "src/messagerie/vue.js", "src/messagerie/useMessagerieBeta.js", "src/messagerie/ouvrir.js"];

// ── a. Rien pour le parc ─────────────────────────────────────────────────────
await cas("App : la barre et l'espace ne se rendent que pour un compte bêta", () => {
  assert.ok(/\{messagerie\.beta&&\(\s*<BarreMessagerie/.test(APP), "barre sous messagerie.beta");
  assert.ok(/\{messagerie\.beta&&espaceMessagerie&&\(/.test(APP), "espace sous messagerie.beta");
  assert.ok(/messagerie=\{messagerie\.beta\?\{parArticle:messagerie\.parArticle,ouvrir:\(id\)=>setEspaceMessagerie\(\{onglet:'messages',article:id\}\)\}:null\}/.test(APP), "Stock : null hors bêta");
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

// ── b. Le bouton « Bordereau » et les gestes qui engagent ────────────────────
await cas("« Bordereau » ACTIF seulement pour Vinted / Leboncoin, bordereau prêt ; sinon un lien vers la plateforme", () => {
  const actifs = [
    { platform: "vinted", etat: "a_expedier", bordereau: "pret", commande_ref: "9001", conversation_ref: "501" },
    { platform: "leboncoin", etat: "a_expedier", bordereau: "pret", commande_ref: "777" },
  ];
  for (const c of actifs) assert.equal(actionCommande(c).type, "bordereau", JSON.stringify(c));
  const liens = [
    { platform: "vinted", etat: "a_expedier", bordereau: "a_obtenir", conversation_ref: "501" },
    { platform: "vinted", etat: "a_expedier", bordereau: "indisponible" },
    { platform: "leboncoin", etat: "a_confirmer", bordereau: "a_generer", commande_ref: "777" },
    { platform: "leboncoin", etat: "a_expedier", bordereau: "a_obtenir", commande_ref: "777" },
    { platform: "beebs", etat: "a_confirmer", bordereau: "a_generer", commande_ref: "ord-1" },
    { platform: "beebs", etat: "a_expedier", bordereau: "pret", commande_ref: "ord-1" },
    { platform: "ebay", etat: "a_expedier", bordereau: "a_obtenir", commande_ref: "12-345" },
    { platform: "depop", etat: "a_expedier", bordereau: "sans_objet", commande_ref: "77" },
    { platform: "vinted", etat: "inconnu", bordereau: "inconnu" },
  ];
  for (const c of liens) {
    const a = actionCommande(c);
    assert.equal(a.type, "lien", JSON.stringify(c));
    assert.ok(/^https:\/\//.test(a.url), a.url);
    assert.ok(a.aide.length > 10);
  }
  assert.ok(actionCommande(liens[0]).aide.includes("c’est toi qui le fais"), "Vinted : commander l'étiquette = geste du vendeur");
  assert.ok(actionCommande(liens[2]).aide.includes("disponibilité") && actionCommande(liens[2]).aide.includes("jamais"));
  assert.ok(actionCommande(liens[4]).aide.includes("accepter la commande"), "Beebs : générer = accepter");
  assert.equal(actionCommande(liens[5]).type, "lien", "Beebs : bordereau prêt = lien (aucune dernière marche qui n'engage rien n'a été vue)");
  assert.ok(actionCommande(liens[6]).aide.includes("eBay"));
  assert.ok(actionCommande(liens[7]).aide.includes("pas de bordereau"));
});

await cas("liens des plateformes (relevés le 16/10) ; l'app ne crée une demande QUE dans le geste de clic", () => {
  assert.equal(lienCommande({ platform: "vinted", conversation_ref: "501" }), "https://www.vinted.fr/inbox/501");
  assert.equal(lienCommande({ platform: "vinted" }), "https://www.vinted.fr/my_orders");
  assert.equal(lienCommande({ platform: "leboncoin", commande_ref: "777" }), "https://www.leboncoin.fr/compte/part/transaction/777");
  assert.equal(lienCommande({ platform: "beebs", commande_ref: "ord-1" }), "https://www.beebs.app/fr/account/orders/ord-1");
  assert.equal(lienCommande({ platform: "ebay", commande_ref: "12-345" }), "https://www.ebay.fr/sh/ord/details?orderid=12-345");
  assert.equal(lienCommande({ platform: "depop" }), "https://www.depop.com/sellinghub/sold-items/");
  assert.equal(lienConversation({ platform: "beebs", conversation_ref: "3HESx" }), "https://www.beebs.app/fr/account/chats/3HESx");
  const section = lire("src/messagerie/SectionAExpedier.jsx");
  const appels = [...section.matchAll(/rpc\('bordereau_demander'/g)];
  assert.equal(appels.length, 1, "un seul appel");
  const fn = section.slice(section.indexOf("const demanderBordereau = async (c) =>"));
  assert.ok(fn.indexOf("rpc('bordereau_demander'") > 0, "dans le geste « demanderBordereau »");
  assert.ok(/onClick=\{\(\) => demanderBordereau\(c\)\}/.test(section), "branché sur le clic seulement");
  for (const f of ["src/App.jsx", "src/messagerie/EspaceMessagerie.jsx", "src/messagerie/useMessagerieBeta.js"]) assert.ok(!/bordereau_demander/.test(lire(f)), "aucune demande depuis " + f);
  assert.ok(/createSignedUrl\(copie\.chemin, 600\)/.test(section), "copie privée : adresse signée 10 min");
});

await cas("demandes de bordereau : chaque état dit quoi faire ; refus en clair", () => {
  assert.equal(etatDemandeBordereau({ statut: "demandee" }).attente, true);
  assert.ok(etatDemandeBordereau({ statut: "demandee" }).texte.includes("ordinateur"));
  assert.ok(etatDemandeBordereau({ statut: "expiree" }).texte.includes("abandonnée") && etatDemandeBordereau({ statut: "expiree" }).texte.includes("rien n’a été fait"));
  assert.ok(etatDemandeBordereau({ statut: "echec", motif: "http_403" }).texte.includes("rien n’a été fait"));
  assert.equal(etatDemandeBordereau(null), null);
  assert.ok(refusDemandeBordereau("pas_pret").includes("prêt"));
  assert.ok(refusDemandeBordereau("plafond_jour").includes("20"));
});

await cas("murs des relevés : Beebs sans téléphone vérifié, session absente, pause ; un 401 seul n'en est pas un", () => {
  const beebs = murReleve({ platform: "beebs", dernier_motif: "telephone_non_verifie" });
  assert.equal(beebs.titre, "Vérifie ton numéro sur Beebs");
  assert.ok(beebs.action.url.includes("beebs.app"));
  assert.ok(murReleve({ platform: "leboncoin", dernier_motif: "jeton_absent" }).titre.includes("Connecte-toi à Leboncoin"));
  const p = murReleve({ platform: "vinted", dernier_motif: "http_429", pause_jusqu_au: new Date(Date.now() + 3600e3).toISOString() });
  assert.ok(p.titre.includes("pause de sécurité"));
  assert.equal(murReleve({ platform: "vinted", dernier_motif: "http_401" }), null, "jeton expiré, renouvelé par la page");
  assert.equal(murReleve({ platform: "vinted", dernier_motif: null }), null);
  assert.equal(murReleve({ platform: "depop", dernier_motif: "onglet_indisponible" }), null, "incident passager : rien à dire");
  assert.ok(murReleve({ platform: "ebay", dernier_motif: "jeton_revoque" }).titre.includes("eBay"));
});

await cas("zone de réponse : verrouillée hors liste blanche, active en liste blanche, fermée pour un message de la plateforme", () => {
  const v = etatZoneReponse({ platform: "vinted" }, false);
  assert.equal(v.possible, true); assert.equal(v.verrouillee, true); assert.ok(v.texte.includes("liste blanche"));
  const a = etatZoneReponse({ platform: "beebs" }, true);
  assert.equal(a.verrouillee, false); assert.ok(a.texte.includes("une seule fois"));
  assert.equal(etatZoneReponse({ platform: "depop", systeme: true }, true).possible, false);
  assert.equal(etatZoneReponse({ platform: "leboncoin", reponse_possible: false }, true).possible, false);
});

await cas("pseudos (@ seulement là où la plateforme a des pseudos) et transporteurs en clair", () => {
  assert.equal(pseudoAffiche("vinted", "acheteuse_a"), "@acheteuse_a");
  assert.equal(pseudoAffiche("ebay", "acheteur_e"), "@acheteur_e");
  assert.equal(pseudoAffiche("leboncoin", "Marc"), "Marc");
  assert.equal(pseudoAffiche("beebs", "Julie D."), "Julie D.");
  assert.equal(pseudoAffiche("vinted", "  "), null);
  assert.equal(libelleTransporteur("mondial_relay"), "Mondial Relay");
  assert.equal(libelleTransporteur("shop2shop"), "Shop2Shop");
  assert.equal(libelleTransporteur("FR_ColiposteColissimo"), "Colissimo");
  assert.equal(libelleTransporteur("FR_ColiposteLettreSuivie"), "Coliposte lettre suivie");
  assert.equal(libelleTransporteur(null), null);
});

await cas("date limite : texte et urgence (< 48 h)", () => {
  const maintenant = Date.parse("2026-10-16T12:00:00Z");
  assert.equal(delaiEnvoi({ a_expedier_avant: "2026-10-17T10:00:00Z" }, "fr", maintenant).urgent, true);
  assert.equal(delaiEnvoi({ a_expedier_avant: "2026-10-22T10:00:00Z" }, "fr", maintenant).urgent, false);
  assert.ok(delaiEnvoi({ a_expedier_avant: "2026-10-22T10:00:00Z" }, "fr", maintenant).texte.startsWith("À déposer avant le 22/10"));
  assert.equal(delaiEnvoi({ a_expedier_avant: "2026-10-15T10:00:00Z" }, "fr", maintenant).depasse, true);
  assert.equal(delaiEnvoi({}, "fr", maintenant), null);
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

await cas("À expédier : à confirmer d'abord, puis la date limite la plus proche, puis les états à vérifier ; rien d'autre", () => {
  const l = commandesAExpedier([
    { id: 1, etat: "a_expedier", vendue_le: "2026-10-15T10:00:00Z" },
    { id: 2, etat: "livree" },
    { id: 3, etat: "a_confirmer", vendue_le: "2026-10-16T10:00:00Z" },
    { id: 4, etat: "a_expedier", vendue_le: "2026-10-14T10:00:00Z" },
    { id: 5, etat: "inconnu", vendue_le: "2026-10-13T10:00:00Z" },
    { id: 6, etat: "expediee" },
  ]);
  assert.deepEqual(l.map((c) => c.id), [3, 4, 1, 5]);
  assert.equal(libelleEtatCommande("a_confirmer", "fr", "leboncoin"), "Disponibilité à confirmer");
  assert.equal(libelleEtatCommande("a_confirmer", "fr", "beebs"), "Commande à accepter");
  assert.equal(libelleEtatCommande("inconnu"), "État à vérifier");
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
  // (relevé réel du 16/10) Un passage SANS texte relu ne donne pas d'extrait (la
  // base garde le précédent) : jamais l'objet du mail, jamais une réécriture.
  const sansTexte = conversationsEbay([{ message_id: "9", sender: "a", folder_id: "0", item_id: "1", subject: "Objet du mail", receive_date: "2026-10-15T10:00:00Z", read: true }], maintenant);
  assert.equal(sansTexte.conversations[0].extrait, null);
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

await cas("eBay (relevé réel du 16/10) : `Content` est du HTML avec ~4 000 car. de style avant <body> → le texte du corps, jamais le style", () => {
  const style = "<style>" + ".c{color:#333;margin:0}".repeat(200) + "</style>";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${style}</head><body><table><tr><td>Nouveau message de acheteur1</td></tr><tr><td>Est-ce encore disponible ?</td></tr></table></body></html>`;
  const t = texteMessageEbay("", html);
  assert.ok(t.includes("Est-ce encore disponible ?"), t.slice(0, 80));
  assert.ok(!/color:|margin|<style|<html/.test(t), "aucun style ni balise");
  // Et le même HTML passé par `Text` seulement.
  assert.ok(texteMessageEbay(html, null).includes("Est-ce encore disponible ?"));
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
