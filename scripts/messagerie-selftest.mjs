// Selftest — la bêta « messages + bordereaux » (16/10/2026).
//   npm run selftest:messagerie
//
// Ce qu'il garantit, sur le code LIVRÉ :
//   a. normaliseurs Vinted / Leboncoin / Depop : formes RELEVÉES le 16/10
//      (données synthétiques, aucune donnée réelle) → contrat de la base ;
//      rien de plus vieux que 30 jours ; le côté (vendeur/acheteur) et
//      l'annonce exacte ; jamais un nom ni une adresse ;
//   b. états de commande : énumération des envois Vinted (code du site) et
//      machine d'états Leboncoin (vente réelle de Nico) ;
//   c. les conversations à détailler : nouvelles ou changées, 5 au plus ;
//   d. blocage : 403, 429, captcha → arrêt ;
//   e. le CHEMIN DU BORDEREAU s'arrête à la dernière marche : aucune requête
//      vers le fichier d'étiquette sans derniereMarche:true (fetch espion),
//      et la constante BORDEREAU_DERNIERE_MARCHE_OUVERTE reste false ;
//   f. jamais « marquer comme lu » (aucun appel mark_as_read / read / mark-read
//      dans le code), jamais un texte de message dans la console ;
//   g. l'envoi Vinted / Leboncoin / Depop a la forme relevée dans le code des
//      sites ; background.js relit la liste blanche avant tout envoi ;
//   h. la migration : RLS partout, AUCUNE politique d'écriture, liste blanche
//      en lecture seule, REVOKE anon sur chaque fonction, purge 30 j / 5 j,
//      secret de cron jamais écrit.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
console.log("messagerie-selftest");

const SOURCE = lire("chrome-extension/messagerie.js");
function charger(extra = {}) {
  const g = { ...extra };
  new Function("globalThis", "self", SOURCE)(g, g);
  return g.FILLSELL_MESSAGERIE;
}
const M = charger();
const MAINTENANT = Date.parse("2026-10-16T12:00:00Z");
const ilYa = (jours) => new Date(MAINTENANT - jours * 86400000).toISOString();

// ── a. Normaliseurs ──────────────────────────────────────────────────────────
await cas("Vinted : liste seule → conversation sans annonce, non lus, extrait borné", () => {
  const r = M.normaliserVinted({ conversations: [
    { id: 501, unread: true, updated_at: ilYa(1), description: "x".repeat(300), opposite_user: { id: 77, login: "acheteuse_a" }, photo: "https://img/1.jpg" },
  ] }, {}, MAINTENANT);
  assert.equal(r.conversations.length, 1);
  const c = r.conversations[0];
  assert.equal(c.ref, "501");
  assert.equal(c.interlocuteur_ref, "77");
  assert.equal(c.interlocuteur_pseudo, "acheteuse_a");
  assert.equal(c.non_lus, 1);
  assert.ok(c.extrait.length <= 140);
  assert.equal(c.annonce_ref, undefined, "sans détail, l'annonce n'est pas devinée");
  assert.equal(r.messages.length, 0);
});

await cas("Vinted : détail → annonce exacte, côté vendeur, offre, messages reçus/envoyés/plateforme", () => {
  const r = M.normaliserVinted({ conversations: [{ id: 502, unread: false, updated_at: ilYa(0.1), description: "ok", opposite_user: { id: 88, login: "b" } }] }, {
    502: {
      allow_reply: true,
      opposite_user: { id: 88, login: "b", is_system: false },
      transaction: { id: 9001, item_id: 1234567, item_ids: [1234567], item_title: "Robe", is_bundle: false, current_user_side: "seller" },
      messages: [
        { entity_type: "message", created_at_ts: ilYa(0.5), entity: { id: 1, user_id: 88, body: "Toujours dispo ?" } },
        { entity_type: "offer_request_message", created_at_ts: ilYa(0.4), entity: { offer_request_id: 55, user_id: 88, price: { amount: "12.0", currency_code: "EUR" }, status_title: "En attente" } },
        { entity_type: "message", created_at_ts: ilYa(0.3), entity: { id: 2, user_id: 999, body: "Oui !" } },
        { entity_type: "status_message", event_type: "success", created_at_ts: ilYa(0.2), entity: { title: "Vendu" } },
        { entity_type: "message", created_at_ts: ilYa(45), entity: { id: 3, user_id: 88, body: "vieux" } },
      ],
    },
  }, MAINTENANT);
  const c = r.conversations[0];
  assert.equal(c.annonce_ref, "1234567");
  assert.equal(c.cote, "vendeur");
  assert.equal(c.reponse_possible, true);
  assert.equal(c.commande_ref, "9001");
  assert.deepEqual(c.offre, { montant: 12, devise: "EUR", statut: "En attente" });
  const parRef = Object.fromEntries(r.messages.map((m) => [m.ref, m]));
  assert.equal(parRef.m1.sens, "recu");
  assert.equal(parRef.m2.sens, "envoye");
  assert.equal(parRef.o55.type, "offre");
  assert.equal(parRef.o55.offre_montant, 12);
  assert.ok(Object.keys(parRef).some((k) => k.startsWith("ssuccess")));
  assert.equal(parRef.m3, undefined, "plus de 30 jours : jamais stocké");
});

await cas("Vinted : un lot (plusieurs articles) n'est imputé à aucune annonce", () => {
  const r = M.normaliserVinted({ conversations: [{ id: 503, updated_at: ilYa(1) }] }, {
    503: { transaction: { id: 1, item_id: 5, item_ids: [5, 6], is_bundle: true, current_user_side: "seller" }, messages: [] },
  }, MAINTENANT);
  assert.equal(r.conversations[0].annonce_ref, null);
});

await cas("Vinted : vente passée (item_id vide, forme relevée le 16/10) → l'annonce est le seul numéro d'item_ids", () => {
  const tr = (extra) => ({ id: 9, status: 450, is_bundle: false, is_completed: true, item_count: 1, item_id: null,
    item_title: null, item_photo: null, item_url: null, current_user_side: "seller", ...extra });
  const r = M.normaliserVinted({ conversations: [
    { id: 504, updated_at: ilYa(2) }, { id: 505, updated_at: ilYa(2) }, { id: 506, updated_at: ilYa(2) },
  ] }, {
    504: { transaction: tr({ item_ids: [7654321] }), messages: [] },
    505: { transaction: tr({ item_ids: [11, 12] }), messages: [] },
    506: { transaction: tr({ item_ids: [] }), messages: [] },
  }, MAINTENANT);
  const parRef = Object.fromEntries(r.conversations.map((c) => [c.ref, c]));
  assert.equal(parRef["504"].annonce_ref, "7654321");
  assert.equal(parRef["504"].cote, "vendeur");
  assert.equal(parRef["505"].annonce_ref, null, "deux articles : aucun");
  assert.equal(parRef["506"].annonce_ref, null);
  assert.equal(M.articleUniqueVinted({ item_id: 5, item_ids: [5] }), "5", "item_id d'abord");
  assert.equal(M.articleUniqueVinted({ is_bundle: true, item_ids: [5] }), null, "un lot : jamais");
  assert.equal(M.articleUniqueVinted(null), null);
});

await cas("Leboncoin : annonce = list_id, côté par le propriétaire, favori sans texte, système", () => {
  const r = M.normaliserLeboncoin({ moi: "u-moi", conversations: [
    { conversation_id: "c1", item: { id: "3289322234", type: "ad", subject: "Montre", image: "i", owner_id: "u-moi" }, partners: [{ id: "u-x", name: "Xa" }], unseen_counter: 2, policies: [], last_message_sent_at: ilYa(1), last_message_preview: "Bonjour" },
    { conversation_id: "c2", item: { id: "an:1:abc", type: "an", owner_type: "system" }, partners: [{ id: "lbc", name: "leboncoin" }], unseen_counter: 0, policies: ["participant-cannot-write"], last_message_sent_at: ilYa(2) },
  ] }, { c1: [
    { id: "m1", type: "ApiSystemMessage", text: "Xa s'intéresse à votre annonce", outgoing: false, sentAt: ilYa(1.2), typeAttributes: { subType: "FAVOURITE_AD" } },
    { id: "m2", type: "ApiTemplateMessage", text: "Toujours disponible ?", outgoing: false, sentAt: ilYa(1.1), typeAttributes: {} },
    { id: "m3", type: "ApiTextMessage", text: "Oui", outgoing: true, sentAt: ilYa(1), typeAttributes: {} },
  ] }, MAINTENANT);
  const [c1, c2] = r.conversations;
  assert.equal(c1.annonce_ref, "3289322234");
  assert.equal(c1.cote, "vendeur");
  assert.equal(c1.non_lus, 2);
  assert.equal(c1.reponse_possible, true);
  assert.equal(c2.annonce_ref, null);
  assert.equal(c2.systeme, true);
  assert.equal(c2.reponse_possible, false);
  const m = Object.fromEntries(r.messages.map((x) => [x.ref, x]));
  assert.equal(m.m1.type, "favori");
  assert.equal(m.m1.texte, null, "la mise en favori n'emporte pas le texte (qui nomme la personne)");
  assert.equal(m.m2.type, "texte");
  assert.equal(m.m3.sens, "envoye");
});

await cas("Leboncoin : offre reçue (négociation) → montant lu dans le texte ; achat → statut", () => {
  const o = M.normaliserMessageLeboncoin({ id: "o1", type: "ApiIntegrationMessage", text: "Xa vous propose 15,50 € pour Montre", outgoing: false, sentAt: ilYa(1), typeAttributes: { scope: "fr.leboncoin.consumergoods_negotiation" } }, "c1");
  assert.equal(o.type, "offre");
  assert.equal(o.offre_montant, 15.5);
  assert.equal(o.offre_devise, "EUR");
  const a = M.normaliserMessageLeboncoin({ id: "p1", type: "ApiIntegrationMessage", text: "X a acheté", outgoing: false, sentAt: ilYa(1), typeAttributes: { scope: "fr.leboncoin.consumergoods_purchase" } }, "c1");
  assert.equal(a.type, "statut");
  assert.equal(a.offre_montant, undefined);
});

await cas("Depop : conversation officielle = système, horodatages en secondes, sens par l'interlocuteur", () => {
  const ts = Math.floor((MAINTENANT - 3600000) / 1000);
  const r = M.normaliserDepop({ conversations: [
    { conversation_id: "d1", users: [{ id: 42, username: "vendeur_z" }], unread_count: 1, last_message_timestamp: ts, last_message_text: "Hi", read_only: false, chat_meta_status: "DEPOP_OFFICIAL" },
  ] }, { d1: [{ id: "x1", user_id: 42, text: "Hello", created_timestamp: ts }, { id: "x2", user_id: 7, text: "Hey", created_timestamp: ts }] }, MAINTENANT);
  assert.equal(r.conversations[0].systeme, true);
  assert.equal(r.conversations[0].dernier_le, new Date(ts * 1000).toISOString());
  assert.equal(r.messages.find((m) => m.ref === "x1").sens, "recu");
  assert.equal(r.messages.find((m) => m.ref === "x2").sens, "envoye");
});

await cas("aucun champ de nom, d'adresse, de téléphone ou d'e-mail ne sort des normaliseurs", () => {
  const r = M.normaliserVinted({ conversations: [{ id: 1, updated_at: ilYa(1), opposite_user: { id: 2, login: "p", first_name: "Jean", last_name: "Dupont", email: "j@d.fr" } }] }, {}, MAINTENANT);
  const s = JSON.stringify(r);
  for (const interdit of ["Jean", "Dupont", "j@d.fr", "address", "phone"]) assert.ok(!s.includes(interdit), interdit);
});

// ── b. États de commande ─────────────────────────────────────────────────────
await cas("Vinted : statut d'envoi → état et bordereau", () => {
  const t = (u, s) => M.etatCommandeVinted(u, s);
  assert.deepEqual(t(null, 100), { etat: "a_expedier", bordereau: "a_obtenir" });
  assert.deepEqual(t(null, 210), { etat: "a_expedier", bordereau: "indisponible" });
  assert.deepEqual(t(null, 230), { etat: "a_expedier", bordereau: "pret" });
  assert.deepEqual(t(null, 300), { etat: "expediee", bordereau: "sans_objet" });
  assert.deepEqual(t(null, 400), { etat: "livree", bordereau: "sans_objet" });
  assert.deepEqual(t(null, 500), { etat: "annulee", bordereau: "sans_objet" });
  assert.deepEqual(t(null, 600), { etat: "retour", bordereau: "sans_objet" });
  assert.deepEqual(t("completed", 400), { etat: "terminee", bordereau: "sans_objet" });
  assert.deepEqual(t("failed", 100), { etat: "annulee", bordereau: "sans_objet" });
  assert.deepEqual(t(null, undefined), { etat: "inconnu", bordereau: "inconnu" });
});

await cas("Leboncoin : machine d'états → état et bordereau", () => {
  const t = (step, s, ev) => M.etatCommandeLeboncoin(step, s, ev);
  assert.deepEqual(t("in_progress", "reserved", []), { etat: "a_confirmer", bordereau: "a_generer" });
  assert.deepEqual(t("in_progress", "available", ["seller-confirmed-item-availability"]), { etat: "a_expedier", bordereau: "a_obtenir" });
  assert.deepEqual(t("in_progress", "available", ["parcel-label-generated"]), { etat: "a_expedier", bordereau: "pret" });
  assert.deepEqual(t("in_progress", "sent", []), { etat: "expediee", bordereau: "sans_objet" });
  assert.deepEqual(t("in_progress", "received", []), { etat: "livree", bordereau: "sans_objet" });
  assert.deepEqual(t("done", "finished", []), { etat: "terminee", bordereau: "sans_objet" });
  assert.deepEqual(t("cancelled", null, []), { etat: "annulee", bordereau: "sans_objet" });
});

await cas("commandes : montants (Leboncoin en CENTIMES), acheteur en pseudo seul, colis = identifiant", () => {
  const [l] = M.normaliserCommandesLeboncoin([{ purchase_id: 123, step: "in_progress", created_at: ilYa(1), title: "T", price: 1800, user_name: "acheteur_l",
    detail: { item_id: "3289322234", statut: "available", evenements: ["parcel-label-generated"], parcel_id: "p-1", shipping_type: "shop2shop" } }]);
  assert.equal(l.montant, 18);
  assert.equal(l.acheteur_pseudo, "acheteur_l");
  assert.equal(l.annonce_ref, "3289322234");
  assert.equal(l.envoi_ref, "p-1");
  assert.equal(l.bordereau, "pret");
  const [v] = M.normaliserCommandesVinted([{ transaction_id: 9, title: "R", price: { amount: "20.0", currency_code: "EUR" }, transaction_user_status: "in_progress",
    detail: { status: 230, item_ids: [5], buyer_login: "acheteur_v", shipment: { id: 66, status: 230 }, thread_id: 777, offer_price: { amount: "18.0", currency_code: "EUR" } } }]);
  assert.equal(v.montant, 18);
  assert.equal(v.annonce_ref, "5");
  assert.equal(v.conversation_ref, "777");
  assert.equal(v.envoi_ref, "66");
  assert.equal(v.etat, "a_expedier");
  assert.equal(v.bordereau, "pret");
});

// ── c. Conversations à détailler ─────────────────────────────────────────────
await cas("à détailler : nouvelles ou changées, récentes, 5 au plus, la plus récente d'abord", () => {
  const liste = Array.from({ length: 9 }, (_, i) => ({ ref: `c${i}`, dernier_le: ilYa(i + 0.5) }));
  liste.push({ ref: "vieille", dernier_le: ilYa(40) });
  const connues = [{ conversation_ref: "c0", dernier_message_le: ilYa(0.5) }, { conversation_ref: "c1", dernier_message_le: ilYa(3) }];
  const r = M.aDetailler(liste, connues, 5);
  assert.equal(r.length, 5);
  assert.ok(!r.includes("c0"), "inchangée");
  assert.ok(r.includes("c1"), "changée");
  assert.ok(!r.includes("vieille"));
  assert.equal(r[0], "c1");
});

await cas("règle de lecture changée : la mémoire du poste est oubliée UNE fois (Vinted 2), pas ailleurs", () => {
  const avant = { detailles: { a: ilYa(1), b: ilYa(2) } };   // état d'une 0.6.117 : pas de regleDetail
  const v = M.memoireDetails(avant, "vinted");
  assert.deepEqual(v.memo, {}); assert.equal(v.oubliee, 2); assert.equal(v.regle, M.REGLE_DETAIL.vinted);
  assert.ok(M.REGLE_DETAIL.vinted >= 2);
  const l = M.memoireDetails(avant, "leboncoin");
  assert.equal(l.oubliee, 0); assert.equal(Object.keys(l.memo).length, 2, "Leboncoin : règle 1, rien d'oublié");
  const apres = M.memoireDetails({ detailles: { a: ilYa(1) }, regleDetail: M.REGLE_DETAIL.vinted }, "vinted");
  assert.equal(apres.oubliee, 0); assert.equal(Object.keys(apres.memo).length, 1, "une seule fois");
  assert.deepEqual(M.memoireDetails(undefined, "depop").memo, {});
  // Relus au rythme ordinaire : la mémoire vide redonne au plus DETAILS_MAX fils par passage.
  const liste = Array.from({ length: 16 }, (_, i) => ({ ref: `v${i}`, dernier_le: ilYa(i + 1) }));
  assert.equal(M.aDetailler(liste, [], M.DETAILS_MAX).length, M.DETAILS_MAX);
});

// ── d. Blocage ───────────────────────────────────────────────────────────────
await cas("signes de blocage", () => {
  assert.equal(M.signeBlocage({ http: 403 }), "http_403");
  assert.equal(M.signeBlocage({ http: 429 }), "http_429");
  assert.equal(M.signeBlocage({ http: 200, bot: true, motif: "http_200" }), "http_200");
  assert.equal(M.signeBlocage({ http: 401 }), null, "401 = session, pas un blocage");
  assert.equal(M.signeBlocage({ ok: true, http: 200 }), null);
});

// ── e. Le bordereau : dernière marche fermée ─────────────────────────────────
function fetchEspion(reponses) {
  const appels = [];
  const f = async (url, init = {}) => {
    appels.push({ url: String(url), method: init.method ?? "GET" });
    const u = String(url); const cle = Object.keys(reponses).find((k) => u.endsWith(k)) ?? Object.keys(reponses).filter((k) => u.includes(k)).sort((a, b) => b.length - a.length)[0];
    const corps = cle ? reponses[cle] : {};
    return { status: 200, ok: true, json: async () => corps, text: async () => JSON.stringify(corps), arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer };
  };
  return { f, appels };
}

await cas("la constante de la dernière marche reste FERMÉE", () => {
  assert.equal(M.BORDEREAU_DERNIERE_MARCHE_OUVERTE, false);
});

await cas("Vinted : bordereau prêt, dernière marche fermée → AUCUNE requête vers le fichier", async () => {
  const { f, appels } = fetchEspion({ "/transactions/9001": { transaction: { shipment: { id: 66, status: 230 } } }, "label_options": { label_options: {} } });
  globalThis.fetch = f;
  const r = await M.CHEMINS_BORDEREAU.vinted({ transactionId: 9001, shipmentId: 66 });
  assert.equal(r.ok, false);
  assert.equal(r.etape, "derniere_marche");
  assert.ok(r.prepare.url.endsWith("/shipment/pdf_label"));
  assert.ok(appels.every((a) => a.method === "GET"), "lecture seule");
  assert.ok(!appels.some((a) => /pdf_label|digital_label|label_url/.test(a.url)), JSON.stringify(appels));
});

await cas("Vinted : envoi pas encore étiqueté → arrêt AVANT les options (jamais « commander l'étiquette »)", async () => {
  const { f, appels } = fetchEspion({ "/transactions/9002": { transaction: { shipment: { id: 67, status: 100 } } } });
  globalThis.fetch = f;
  const r = await M.CHEMINS_BORDEREAU.vinted({ transactionId: 9002, derniereMarche: true });
  assert.equal(r.motif, "bordereau_a_obtenir_sur_vinted");
  assert.equal(appels.length, 1);
  assert.ok(!appels.some((a) => /shipment\/order/.test(a.url) || a.method !== "GET"));
});

await cas("Vinted : le chemin complet n'existe qu'avec derniereMarche:true (preuve de la dernière marche)", async () => {
  const { f, appels } = fetchEspion({ "/transactions/9003": { transaction: { shipment: { id: 68, status: 220 } } }, "/shipment/pdf_label": { file: { label: "JVBERg==", filename: "l.pdf" } } });
  globalThis.fetch = f;
  const r = await M.CHEMINS_BORDEREAU.vinted({ transactionId: 9003, derniereMarche: true });
  assert.equal(r.ok, true);
  assert.ok(appels.some((a) => a.url.endsWith("/transactions/9003/shipment/pdf_label")));
});

await cas("Leboncoin : disponibilité non confirmée → arrêt ; prêt + dernière marche fermée → aucun fichier", async () => {
  globalThis.localStorage = { getItem: () => "jeton-essai" };
  let espion = fetchEspion({ "/purchases/11": { fsm: { current_state: { status: "reserved" }, states_history: [] } } });
  globalThis.fetch = espion.f;
  let r = await M.CHEMINS_BORDEREAU.leboncoin({ purchaseId: 11 });
  assert.equal(r.motif, "disponibilite_a_confirmer_sur_leboncoin");
  assert.ok(!espion.appels.some((a) => /validate-availability|confirm/.test(a.url)));
  espion = fetchEspion({
    "/purchases/12": { fsm: { current_state: { status: "available" }, states_history: [{ event: { name: "parcel-label-generated" } }] } },
    "prepare-parcel/12": { label_url: "https://api.leboncoin.fr/api/shippingproxy/v1/parcels/P/label", with_qrcode: true },
  });
  globalThis.fetch = espion.f;
  r = await M.CHEMINS_BORDEREAU.leboncoin({ purchaseId: 12 });
  assert.equal(r.etape, "derniere_marche");
  assert.equal(r.prepare.qr, true);
  assert.ok(!espion.appels.some((a) => /\/label$/.test(a.url)), "le fichier n'est jamais demandé");
});

// ── f. Jamais « marquer lu », jamais un texte dans la console ────────────────
function sansCommentaires(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|[^:"'`\\])\/\/.*$/, "$1")).join("\n");
}
const BG = lire("chrome-extension/background.js");
const debutSection = BG.indexOf("// MESSAGERIE + COMMANDES « À EXPÉDIER » — BÊTA (0.6.116");
const finSection = BG.indexOf("/** Les jobs à relire en priorité, tels qu'en base (publiés seulement). */");
assert.ok(debutSection > 0 && finSection > debutSection, "section messagerie introuvable dans background.js");
const SECTION = BG.slice(debutSection, finSection);

await cas("aucun appel « marquer comme lu » dans le code (messagerie.js, section de background.js)", () => {
  for (const [nom, code] of [["messagerie.js", sansCommentaires(SOURCE)], ["background.js", sansCommentaires(SECTION)]]) {
    for (const motif of [/mark_as_read/, /mark-read/, /\/read[`"'?]/, /markAsRead/]) assert.ok(!motif.test(code), `${nom} : ${motif}`);
  }
});

await cas("aucun texte de message, d'extrait ni de corps dans la console", () => {
  const lignes = (SOURCE + "\n" + SECTION).split("\n").filter((l) => /console\.(log|warn|error|info)/.test(l));
  for (const l of lignes) assert.ok(!/\.texte\b|\.text\b|\.body\b|extrait|description/.test(l), l.trim());
});

await cas("lecteurs de page : lecture seule (aucun POST/PUT/PATCH/DELETE)", () => {
  for (const [pf, l] of Object.entries(M.LECTEURS)) {
    for (const [nom, fn] of Object.entries(l)) {
      if (!fn) continue;
      assert.ok(!/method\s*:\s*["'](POST|PUT|PATCH|DELETE)/i.test(fn.toString()), `${pf}.${nom}`);
    }
  }
});

await cas("(0.6.118) background.js passe la mémoire par la règle, et la note AVANT tout retour anticipé", () => {
  const i = SECTION.indexOf("async function releverMessagerieUnePlateforme");
  const corps = SECTION.slice(i, SECTION.indexOf("// 3. Les commandes en cours", i));
  const iRegle = corps.indexOf("M.memoireDetails(e, platform)");
  const iNote = corps.indexOf("e.detailles = memo; e.regleDetail = regle;");
  const iDetail = corps.indexOf("L.details");
  assert.ok(iRegle > 0 && iNote > iRegle && iDetail > iNote, "règle → note → lecture du détail");
  assert.ok(!/e\.detailles && typeof e\.detailles/.test(corps), "plus de mémoire lue sans la règle");
});

await cas("(0.6.117) un passage sans lecture note son motif en base ; Depop reprend 2 fois une erreur réseau", async () => {
  assert.ok(/if \(!r\?\.ok && !r\?\.refuse\) await noterEchecReleveMessagerie\(platform, e\.dernierMotif, token\);/.test(SECTION));
  assert.ok(/noterEchecReleveMessagerie\(platform, "depop_acces", token\)/.test(SECTION));
  assert.ok(/p_conversations: \[\], p_messages: \[\],\s*p_etat: \{ motif:/.test(SECTION), "aucun contenu : un code court");
  let essais = 0;
  globalThis.document = { cookie: "access_token=jt" };
  globalThis.fetch = async () => { essais++; if (essais < 3) throw new TypeError("Failed to fetch"); return { status: 200, json: async () => ({ objects: [] }) }; };
  const r = await M.LECTEURS.depop.liste();
  assert.equal(r.ok, true);
  assert.equal(r.requetes, 3);
  essais = -10;
  const r2 = await M.LECTEURS.depop.liste();
  assert.equal(r2.ok, false);
  assert.equal(r2.motif, "reseau");
  assert.equal(r2.requetes, 3, "jamais plus de 3 essais");
});

// ── g. L'envoi, verrouillé ───────────────────────────────────────────────────
await cas("background.js relit la liste blanche avant l'envoi, et n'envoie qu'UNE réponse par passage", () => {
  const i = SECTION.indexOf("async function envoyerReponseMessagerie");
  const corps = SECTION.slice(i, SECTION.indexOf("/** Un passage de la bêta", i));
  const iListe = corps.indexOf("messagerie_liste_blanche?");
  const iEnvoi = corps.indexOf("executerDansOngletPlateforme(rep.platform, envoyeur");
  assert.ok(iListe > 0 && iEnvoi > iListe, "liste blanche relue AVANT l'envoyeur");
  assert.ok(/liste_blanche_absente/.test(corps));
  assert.equal((corps.match(/messagerie_reponse_a_envoyer/g) || []).length, 1, "une seule prise par passage");
});

await cas("envoi Vinted : forme relevée (POST …/replies, reply.body, X-CSRF-Token)", async () => {
  const appels = [];
  globalThis.document = { querySelectorAll: () => [{ textContent: '{\\"csrf_token\\":\\"tok123\\"}' }], cookie: "anon_id=a1" };
  globalThis.fetch = async (url, init) => { appels.push({ url, init }); return { status: 200, json: async () => ({ conversation: { messages: [{ entity: { id: 9 } }] } }) }; };
  const r = await M.ENVOYEURS.vinted({ conversationRef: "501", texte: "Oui" });
  assert.equal(r.ok, true);
  assert.equal(appels[0].url, "/api/v2/conversations/501/replies");
  assert.equal(appels[0].init.method, "POST");
  assert.equal(appels[0].init.headers["X-CSRF-Token"], "tok123");
  assert.deepEqual(JSON.parse(appels[0].init.body).reply.body, "Oui");
});

await cas("envoi Leboncoin et Depop : formes relevées dans le code des sites", async () => {
  const appels = [];
  globalThis.localStorage = { getItem: () => "jeton" };
  globalThis.fetch = async (url, init) => { appels.push({ url, init }); return { status: 201, json: async () => ({ id: "m-1" }) }; };
  let r = await M.ENVOYEURS.leboncoin({ conversationRef: "c1", texte: "Oui", moi: "u-moi" });
  assert.equal(r.ok, true);
  assert.ok(appels[0].url.endsWith("/hal/u-moi/conversations/c1/messages"));
  const b = JSON.parse(appels[0].init.body);
  assert.equal(b.text, "Oui"); assert.deepEqual(b.attachments, []); assert.ok(b.clientMessageId);
  globalThis.document = { cookie: "access_token=jt" };
  r = await M.ENVOYEURS.depop({ conversationRef: "d1", interlocuteurRef: "42", texte: "Hi" });
  assert.ok(appels[1].url.endsWith("/presentation/api/v1/conversations/messages/"));
  const d = JSON.parse(appels[1].init.body);
  assert.equal(d.user_id, 42); assert.equal(d.text, "Hi"); assert.ok(d.idempotency_key);
});

// ── h. La migration ──────────────────────────────────────────────────────────
const MIG = lire("supabase/migrations/20261016170000_messagerie_bordereaux_beta.sql");
await cas("migration : RLS sur les 7 tables, AUCUNE politique d'écriture sur nos tables", () => {
  for (const t of ["messagerie_conversations", "messagerie_messages", "messagerie_liste_blanche", "messagerie_reponses", "messagerie_releves", "plateforme_commandes", "bordereaux_copies"]) {
    assert.ok(MIG.includes(`ALTER TABLE public.${t}`) && new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`).test(MIG), `RLS ${t}`);
    assert.ok(new RegExp(`CREATE POLICY \\w+ ON public\\.${t}\\s+FOR SELECT TO authenticated USING \\(user_id = auth\\.uid\\(\\)\\)`).test(MIG), `lecture ${t}`);
  }
  assert.ok(!/CREATE POLICY[^;]*ON public\.\w+\s+FOR (INSERT|UPDATE|DELETE|ALL)/.test(MIG), "aucune écriture directe du client");
});

await cas("migration : REVOKE anon nommé sur chaque fonction ; purge réservée au service", () => {
  const fonctions = [...MIG.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.ok(fonctions.length >= 14, `fonctions : ${fonctions.length}`);
  for (const f of fonctions) assert.ok(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon`).test(MIG), `REVOKE ${f}`);
  assert.ok(/REVOKE ALL ON FUNCTION public\.messagerie_purger\(integer\) FROM PUBLIC, anon, authenticated/.test(MIG));
});

await cas("migration : 30 jours (messages), 5 jours au plus (copies), secret de cron jamais écrit", () => {
  assert.ok(/envoye_le < now\(\) - interval '30 days'/.test(MIG));
  assert.ok(/CHECK \(expire_le <= cree_le \+ interval '5 days'\)/.test(MIG));
  assert.ok(/public\.cron_secret\(\)/.test(MIG));
  assert.ok(!/x-cron-secret['"]?\s*,\s*'[A-Za-z0-9]{12,}/.test(MIG));
  assert.ok(/liste_blanche_absente|liste_blanche/.test(MIG));
});

console.log(`messagerie-selftest : ${n} cas verts`);
