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
//      sites ; (16/10 nuit) background.js revérifie l'empreinte du texte avant
//      tout envoi (plus de liste blanche pour les comptes bêta) ;
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

// ── a bis. BEEBS (relevé le 16/10 au soir sur le compte d'Ornella) et DEPOP ──
// Données SYNTHÉTIQUES aux formes relevées ; aucun message réel.
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (charge) => `${b64url({ alg: "RS256" })}.${b64url({ iss: "https://securetoken.google.com/babytouch-782e4", ...charge })}.sig`;
const JETON_TEL = jwt({ user_id: "u-moi", firebase: { identities: { email: ["e"], phone: ["+33600000000"] } }, phone_number: "+33600000000" });
const JETON_SANS_TEL = jwt({ user_id: "u-moi", firebase: { identities: { email: ["e"] } } });

await cas("Beebs : la date de la liste (« 27/08/2026 », « 16/10 », « 14:05 », « Hier ») → heure de Paris", () => {
  assert.equal(M.dateBeebsListe("27/08/2026", MAINTENANT), "2026-08-26T22:00:00.000Z");
  assert.equal(M.dateBeebsListe("16/10", MAINTENANT), "2026-10-15T22:00:00.000Z");
  assert.equal(M.dateBeebsListe("14:05", MAINTENANT), "2026-10-16T12:05:00.000Z");
  assert.equal(M.dateBeebsListe("Hier", MAINTENANT), "2026-10-14T22:00:00.000Z");
  assert.equal(M.dateBeebsListe("bientôt", MAINTENANT), null);
});

await cas("Beebs : liste + détail → conversation, sens par l'émetteur, messages de Beebs = système, jamais le nom complet", () => {
  const lecture = { moi: "u-moi", conversations: [
    { chat_id: "3HESxABC123", nom: "Julie D.", date_texte: "10:05", apercu: "Bonjour", non_lus: 2 },
    { chat_id: "3IVkOLD456", nom: "Paul M.", date_texte: "27/08/2026", apercu: "x", non_lus: 0 },
    { chat_id: "3ADMIN789", nom: "Beebs", date_texte: "15/10", apercu: "Info", non_lus: 0 },
  ] };
  const details = {
    "3HESxABC123": { interlocuteur: { id: "u-autre", bloque_par_moi: false }, bloque: false, messages: [
      { id: "m1", created_at: ilYa(0.1), text: "Bonjour", from_user_id: "u-autre", is_from_admin: false, sentByMe: false },
      { id: "m2", created_at: ilYa(0.05), text: "Oui", from_user_id: "u-moi", is_from_admin: false, sentByMe: true },
      { id: "m3", created_at: ilYa(40), text: "vieux", from_user_id: "u-autre", is_from_admin: false },
    ] },
    "3ADMIN789": { interlocuteur: { id: M.BEEBS_ADMIN }, messages: [{ id: "a1", created_at: ilYa(1), text: "Info", from_user_id: M.BEEBS_ADMIN, is_from_admin: true }] },
  };
  const r = M.normaliserBeebs(lecture, details, MAINTENANT);
  const c = r.conversations.find((x) => x.ref === "3HESxABC123");
  assert.equal(c.interlocuteur_ref, "u-autre");
  assert.equal(c.interlocuteur_pseudo, "Julie D.");
  assert.equal(c.non_lus, 2);
  assert.equal(c.reponse_possible, true);
  assert.equal(c.systeme, false);
  assert.equal(c.dernier_le, ilYa(0.05), "la date exacte du dernier message lu, pas celle de la liste");
  assert.equal(r.conversations.find((x) => x.ref === "3IVkOLD456").dernier_le, "2026-08-26T22:00:00.000Z", "sans détail : la date de la liste");
  assert.equal(r.conversations.find((x) => x.ref === "3ADMIN789").systeme, true);
  assert.equal(r.messages.find((m) => m.ref === "m1").sens, "recu");
  assert.equal(r.messages.find((m) => m.ref === "m2").sens, "envoye");
  assert.equal(r.messages.find((m) => m.ref === "a1").sens, "plateforme");
  assert.ok(!r.messages.some((m) => m.ref === "m3"), "plus de 30 jours");
  assert.equal(r.conversations.find((x) => x.ref === "3HESxABC123").annonce_ref, undefined, "messagerie de personne à personne : aucune annonce devinée");
});

await cas("Beebs : téléphone non vérifié (jeton) → mur dit, AUCUNE requête ; renvoi vers phone-verification → mur", async () => {
  let appels = 0;
  globalThis.document = { cookie: `access_token=${JETON_SANS_TEL}` };
  globalThis.fetch = async () => { appels++; return { status: 200, url: "https://www.beebs.app/fr/account/chats", text: async () => "" }; };
  let r = await M.LECTEURS.beebs.liste();
  assert.equal(r.motif, "telephone_non_verifie");
  assert.equal(r.mur, "telephone");
  assert.equal(appels, 0, "aucune requête sans téléphone vérifié");
  globalThis.document = { cookie: `access_token=${JETON_TEL}` };
  globalThis.fetch = async () => { appels++; return { status: 200, url: "https://www.beebs.app/fr/account/phone-verification", text: async () => "<html></html>" }; };
  r = await M.LECTEURS.beebs.liste();
  assert.equal(r.motif, "telephone_non_verifie");
  globalThis.document = { cookie: "" };
  r = await M.LECTEURS.beebs.liste();
  assert.equal(r.motif, "session_absente");
  assert.ok(!M.signeBlocage(r), "un mur n'est pas un blocage anti-robot");
});

await cas("Beebs : liste lue dans le HTML rendu (forme relevée : lien, nom, date, aperçu, pastille) ; 403 → blocage", async () => {
  const el = (texte, enfants = []) => ({ textContent: texte ?? enfants.map((e) => e.textContent).join(" "), children: enfants });
  const ancre = (href, nom, date, apercu, pastille) => ({
    getAttribute: (k) => (k === "href" ? href : null),
    children: [el(""), el(null, [el(null, [el(nom), el(date)]), el(null, pastille == null ? [el(apercu)] : [el(apercu), el(pastille)])])],
  });
  globalThis.DOMParser = class { parseFromString() { return { querySelectorAll: () => [
    ancre("/fr/account/chats/3HESxABC123", "Julie D.", "10:05", "Bonjour", "2"),
    ancre("/fr/account/chats/3IVkOLD456", "Paul M.", "27/08/2026", "Merci", null),
    ancre("/fr/account/chats/3HESxABC123", "doublon", "", "", null),
  ] }; } };
  globalThis.document = { cookie: `access_token=${JETON_TEL}` };
  const appels = [];
  globalThis.fetch = async (url, init) => { appels.push({ url, init }); return { status: 200, url: "https://www.beebs.app/fr/account/chats", text: async () => "<html>datadome tags.js chargé sur toutes les pages</html>".padEnd(70000, " ") }; };
  const r = await M.LECTEURS.beebs.liste();
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
  assert.equal(r.moi, "u-moi");
  assert.equal(r.conversations.length, 2);
  assert.deepEqual(r.conversations[0], { chat_id: "3HESxABC123", nom: "Julie D.", date_texte: "10:05", apercu: "Bonjour", non_lus: 2 });
  assert.equal(r.conversations[1].non_lus, 0);
  assert.equal(appels[0].url, "/fr/account/chats");
  assert.ok(!appels[0].init?.method, "GET");
  globalThis.fetch = async () => ({ status: 403, url: "https://www.beebs.app/fr/account/chats", text: async () => "" });
  const b = await M.LECTEURS.beebs.liste();
  assert.equal(M.signeBlocage(b), "http_403", "403 sur Beebs = arrêt immédiat");
});

await cas("Beebs : détail = flux RSC de la page de la conversation → messages, interlocuteur ; ni prénom ni nom ne sortent", async () => {
  const REF = "3HESxABC123";
  const rsc = [
    '0:["$","div",null,{}]',
    `14:${JSON.stringify(["$", "$L1", null, { chatId: REF, userId: "u-autre", userImage: "https://cdn/x.jpg", firstName: "Julie", lastName: "D", blockedByMe: false, deletable: true }])}`,
    `15:${JSON.stringify(["$", "$L2", null, { toUserId: "u-autre", blocked: false, chatId: REF }])}`,
    `109:${JSON.stringify([["$", "$L3", null, { message: { id: "m1", created_at: "2026-10-16T08:00:00.000Z", chat_id: REF, text: "Bonjour", attachment: null, from_user_id: "u-autre", to_user_id: "u-moi", is_from_admin: false }, sentByMe: false, toUserImage: "x" }]])}`,
    `110:${JSON.stringify(["$", "$L3", null, { message: { id: "m9", created_at: "2026-10-16T08:01:00.000Z", chat_id: "AUTRE", text: "ailleurs", from_user_id: "z", is_from_admin: false } }])}`,
    "111:I[1234,[],\"\"]",
  ].join("\n");
  const appels = [];
  globalThis.fetch = async (url, init) => { appels.push({ url, init }); return { status: 200, text: async () => rsc }; };
  const r = await M.LECTEURS.beebs.details([REF]);
  assert.equal(r.ok, true);
  const d = r.details[REF];
  assert.equal(d.interlocuteur.id, "u-autre");
  assert.equal(d.destinataire, "u-autre");
  assert.equal(d.bloque, false);
  assert.equal(d.messages.length, 1, "seuls les messages de CETTE conversation");
  assert.equal(appels[0].url, `/fr/account/chats/${REF}`);
  assert.equal(appels[0].init.headers.RSC, "1");
  assert.ok(!appels[0].init.method, "GET");
  const s = JSON.stringify(r);
  assert.ok(!s.includes("Julie") && !s.includes("cdn/x.jpg"), "ni prénom ni photo de la personne");
});

await cas("Beebs : réponse — POST api.beebs.app/chats/v3 {to_user_id, text}, jeton BRUT ; rien sans téléphone vérifié", async () => {
  const appels = [];
  globalThis.document = { cookie: `access_token=${JETON_TEL}` };
  globalThis.fetch = async (url, init) => { appels.push({ url, init }); return { status: 200, json: async () => ({ success: true, data: { id: "msg-9" } }) }; };
  const r = await M.ENVOYEURS.beebs({ interlocuteurRef: "u-autre", texte: "Oui" });
  assert.equal(r.ok, true);
  assert.equal(r.messageRef, "msg-9");
  assert.equal(appels[0].url, "https://api.beebs.app/chats/v3");
  assert.equal(appels[0].init.method, "POST");
  assert.equal(appels[0].init.headers.authorization, JETON_TEL, "le jeton brut, pas « Bearer »");
  assert.deepEqual(JSON.parse(appels[0].init.body), { to_user_id: "u-autre", text: "Oui" });
  globalThis.document = { cookie: `access_token=${JETON_SANS_TEL}` };
  const r2 = await M.ENVOYEURS.beebs({ interlocuteurRef: "u-autre", texte: "Oui" });
  assert.equal(r2.ok, false);
  assert.equal(r2.motif, "telephone_non_verifie");
  assert.equal(appels.length, 1, "rien n'est parti");
});

await cas("Beebs : commandes — états du site, 48 h / 6 jours, pseudo « Prénom N. », jamais le nom ni l'adresse", () => {
  const l = M.normaliserCommandesBeebs([
    { id: "o1", order: { id: "o1", status: "WAIT_SELLER_CONFIRM", created_at: ilYa(0.5), buyer: { first_name: "Marie", last_name: "Durand" }, products: [{ id: 33894364, title: "Veste", price: 12, image: "https://cdn.beebs.app/x.jpg" }], total_price: 15.5 } },
    { id: "o2", order: { id: "o2", status: "LABEL_PRINTED", status_updated_at: "2026-10-15T10:00:00.000Z", products: [{ id: 1, title: "A" }, { id: 2, title: "B" }], buyer: { firstName: "Léa" } } },
    { id: "o3", order: { id: "o3", status: "IN_DELIVERY", products: [], buyer: {} } },
    { id: "o4", order: null },
  ]);
  assert.equal(l.length, 3, "une commande sans objet n'écrit rien");
  const [a, b, c] = l;
  assert.equal(a.etat, "a_confirmer"); assert.equal(a.bordereau, "a_generer");
  assert.equal(a.acheteur_pseudo, "Marie D.");
  assert.equal(a.annonce_ref, "33894364");
  assert.equal(a.montant, 15.5);
  assert.equal(a.photo, "https://cdn.beebs.app/x.jpg");
  assert.equal(a.a_expedier_avant, null);
  assert.ok(!JSON.stringify(a).includes("Durand"));
  assert.equal(b.etat, "a_expedier"); assert.equal(b.bordereau, "pret");
  assert.equal(b.a_expedier_avant, "2026-10-21T10:00:00.000Z", "6 jours après le bordereau (calcul du site)");
  assert.equal(b.titre, "2 articles"); assert.equal(b.annonce_ref, null);
  assert.equal(c.etat, "expediee");
  const e = (s) => M.etatCommandeBeebs(s).etat;
  assert.equal(e("WAITING_GENARATING_LABEL_BY_SELLER"), "a_expedier");
  assert.equal(e("WAIT_SELLER_CONFIRM_RMP"), "a_confirmer");
  assert.equal(e("SELLER_PAID_REVIEW"), "terminee");
  assert.equal(e("LITIGATION_RETURN_IN_DELIVERY"), "retour");
  assert.equal(e("LOST_PARCEL"), "litige");
  assert.equal(e("CANCELLED"), "annulee");
  assert.equal(e("NOUVEL_ETAT"), "inconnu");
});

await cas("Beebs : lecteur des ventes — liens de la page « Ventes », objet commande de sa page ; forme inconnue = rien", async () => {
  const liste = `5:${JSON.stringify(["$", "a", null, { href: "/fr/account/orders/list/buyer" }])}\n6:${JSON.stringify(["$", "a", null, { href: "/fr/account/orders/ord-9f3a2" }])}\n7:${JSON.stringify(["$", "a", null, { href: "/fr/account/orders/ord-77b1c" }])}`;
  const commande = `3:${JSON.stringify(["$", "$L9", null, { order: { id: "ord-9f3a2", status: "LABEL_PRINTED", status_updated_at: "2026-10-15T10:00:00.000Z", products: [{ id: 5, title: "Robe" }], buyer: { first_name: "Marie", last_name: "Durand", address: { street: "1 rue" } }, seller: { id: "u-moi" } } }])}`;
  const appels = [];
  globalThis.fetch = async (url) => { appels.push(url); return { status: 200, text: async () => (url.endsWith("/list/seller") ? liste : url.endsWith("ord-9f3a2") ? commande : "0:[]") }; };
  const r = await M.LECTEURS.beebs.commandes([], 5);
  assert.equal(r.ok, true);
  assert.equal(r.commandes.length, 1);
  assert.equal(r.illisibles, 1);
  assert.equal(r.commandes[0].order.status, "LABEL_PRINTED");
  assert.ok(!appels.some((u) => u.includes("/list/buyer") && !u.endsWith("/list/seller")), "jamais la page « Achats »");
  assert.ok(!JSON.stringify(r).includes("1 rue"), "jamais l'adresse");
});

await cas("Depop : commandes (« receipts ») — états, acheteur en pseudo, date limite, pas de bordereau ; forme inconnue = « inconnu »", () => {
  const d = M.normaliserCommandesDepop([
    { id: 77, shippingStatus: "AWAITING_SHIPPING", buyer: { username: "acheteur_d", address: "1 rue" }, items: [{ slug: "nico-veste-123", description: "Veste en jean\nTaille M", pictures: [{ url: "https://p/1.jpg" }] }], total: { amount: "25.00", currency: "EUR" }, shippingDeadline: "2026-10-20T10:00:00Z", created_at: ilYa(1) },
    { receipt_id: "r2", shipping_status: "SHIPPED", items: [] },
    { id: 3, status: "quelque_chose" },
  ]);
  assert.equal(d[0].etat, "a_expedier");
  assert.equal(d[0].bordereau, "sans_objet");
  assert.equal(d[0].acheteur_pseudo, "acheteur_d");
  assert.equal(d[0].annonce_ref, "nico-veste-123");
  assert.equal(d[0].montant, 25);
  assert.equal(d[0].devise, "EUR");
  assert.equal(d[0].a_expedier_avant, "2026-10-20T10:00:00.000Z");
  assert.equal(d[0].photo, "https://p/1.jpg");
  assert.ok(!JSON.stringify(d).includes("1 rue"));
  assert.equal(d[1].etat, "expediee");
  assert.equal(d[1].ref, "r2");
  assert.equal(d[2].etat, "inconnu");
  assert.equal(M.etatCommandeDepop("CANCELLED"), "annulee");
  assert.equal(M.etatCommandeDepop("COMPLETED"), "terminee");
});

await cas("plateformes relevées par l'extension : Vinted, Leboncoin, Depop, Beebs (messages ET commandes)", () => {
  assert.deepEqual([...M.PLATEFORMES_EXTENSION], ["vinted", "leboncoin", "depop", "beebs"]);
  assert.deepEqual([...M.PLATEFORMES_COMMANDES], ["vinted", "leboncoin", "depop", "beebs"]);
  for (const p of M.PLATEFORMES_COMMANDES) {
    assert.equal(typeof M.LECTEURS[p].commandes, "function", p);
    assert.equal(typeof M.NORMALISEURS_COMMANDES[p], "function", p);
  }
  assert.equal(typeof M.ENVOYEURS.beebs, "function");
  assert.equal(M.REGLE_DETAIL.beebs, 1);
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

await cas("(16/10 soir) dernière marche ouverte, mais SEULEMENT pour une demande née d'un clic", () => {
  assert.equal(M.BORDEREAU_DERNIERE_MARCHE_OUVERTE, true);
  const bg = lire("chrome-extension/background.js");
  const appels = [...bg.matchAll(/obtenirBordereauBeta\(/g)].map((m) => m.index);
  const definition = bg.indexOf("async function obtenirBordereauBeta(") + "async function ".length;
  const traiteur = bg.indexOf("async function traiterDemandeBordereauBeta(");
  const finTraiteur = bg.indexOf("/** Les jobs à relire en priorité", traiteur);
  assert.ok(definition > 0 && traiteur > 0 && finTraiteur > traiteur);
  const ailleurs = appels.filter((i) => i !== definition && !(i > traiteur && i < finTraiteur));
  assert.equal(ailleurs.length, 0, "obtenirBordereauBeta n'est appelée que par l'exécutant des demandes");
  const corps = bg.slice(traiteur, finTraiteur);
  const iPrise = corps.indexOf('rpcMessagerie("bordereau_demande_a_traiter"');
  const iSans = corps.indexOf("if (!d?.id) return;");
  const iChemin = corps.indexOf("obtenirBordereauBeta(");
  assert.ok(iPrise > 0 && iSans > iPrise && iChemin > iSans, "rien sans une demande prise en base");
  assert.ok(/bordereau_demande_resultat/.test(corps), "le résultat est toujours rendu");
  assert.ok(!/bordereau_demander/.test(sansCommentaires(bg)), "l'extension ne crée JAMAIS de demande (seule l'app, au clic)");
  assert.ok(/coin_config\?key=eq\.bordereaux_ouverts/.test(bg), "l'interrupteur serveur est relu");
});

await cas("Vinted : pas de bordereau papier → le code (digital_label) demandé UNE fois", async () => {
  const { f, appels } = fetchEspion({ "/transactions/9004": { transaction: { shipment: { id: 69, status: 230 } } }, "/shipment/digital_label": { file: { label: "iVBORw0KGgo=", filename: "code.png" } } });
  globalThis.fetch = f;
  const r = await M.CHEMINS_BORDEREAU.vinted({ transactionId: 9004, derniereMarche: true });
  assert.equal(r.ok, true);
  assert.equal(r.numerique, true);
  assert.equal(appels.filter((a) => /pdf_label/.test(a.url)).length, 1);
  assert.equal(appels.filter((a) => /digital_label/.test(a.url)).length, 1);
  assert.ok(appels.every((a) => a.method === "GET"));
});

await cas("background.js : copie au nom UNIQUE (horodaté), type lu dans le fichier, 5 Mo au plus", () => {
  const bg = lire("chrome-extension/background.js");
  const i = bg.indexOf("async function deposerCopieBordereau(");
  const corps = bg.slice(i, bg.indexOf("async function traiterDemandeBordereauBeta(", i));
  assert.ok(/-\$\{Date\.now\(\)\}\.\$\{genre\.ext\}/.test(corps), "nom unique");
  assert.ok(!/x-upsert/.test(corps), "jamais d'écrasement d'une copie");
  assert.ok(/5 \* 1024 \* 1024/.test(corps));
  assert.ok(/copie_non_notee/.test(corps), "une copie non notée en base n'est pas rendue « prête »");
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

await cas("lecteurs de page : lecture seule (aucun POST/PUT/PATCH/DELETE ; seul le renouvellement du jeton Vinted, comme la page)", () => {
  const RENOUV = /const renouveler = async \(\) => \{ try \{ const x = await fetch\("\/web\/api\/auth\/refresh", \{ method: "POST", credentials: "include", headers: \{ Accept: "application\/json" \} \}\); return x\.ok; \} catch \{ return false; \} \};/;
  for (const [pf, l] of Object.entries(M.LECTEURS)) {
    for (const [nom, fn] of Object.entries(l)) {
      if (!fn) continue;
      const sans = fn.toString().replace(RENOUV, "");
      assert.ok(!/method\s*:\s*["'](POST|PUT|PATCH|DELETE)/i.test(sans), `${pf}.${nom}`);
    }
  }
});

await cas("(0.6.119) Vinted : un 401 renouvelle le jeton comme la page, puis UNE seule nouvelle lecture ; l'envoi refait UNE fois après un 401, jamais après une autre erreur", async () => {
  let appels = [];
  let premier = true;
  globalThis.fetch = async (url, init = {}) => {
    appels.push({ url, method: init.method ?? "GET" });
    if (url === "/web/api/auth/refresh") return { ok: true, status: 200 };
    if (premier) { premier = false; return { status: 401, text: async () => "" }; }
    return { status: 200, text: async () => JSON.stringify({ conversations: [{ id: 1, unread: false, updated_at: ilYa(1) }] }) };
  };
  const r = await M.LECTEURS.vinted.liste(20);
  assert.equal(r.ok, true);
  assert.deepEqual(appels.map((a) => `${a.method} ${a.url.split("?")[0]}`), ["GET /api/v2/inbox", "POST /web/api/auth/refresh", "GET /api/v2/inbox"]);
  // Toujours 401 après renouvellement : on s'arrête, jamais de boucle.
  appels = [];
  globalThis.fetch = async (url, init = {}) => { appels.push({ url, method: init.method ?? "GET" }); return url === "/web/api/auth/refresh" ? { ok: true, status: 200 } : { status: 401, text: async () => "" }; };
  const r2 = await M.LECTEURS.vinted.liste(20);
  assert.equal(r2.ok, false);
  assert.equal(appels.length, 3, "1 lecture + 1 renouvellement + 1 lecture, jamais plus");
  // L'envoi : 401 → renouvellement → UNE seconde tentative.
  globalThis.document = { querySelectorAll: () => [{ textContent: '{\\"csrf_token\\":\\"tok123\\"}' }], cookie: "anon_id=a1" };
  appels = [];
  let essai = 0;
  globalThis.fetch = async (url, init = {}) => {
    appels.push({ url, method: init.method ?? "GET" });
    if (url === "/web/api/auth/refresh") return { ok: true, status: 200 };
    essai++;
    return essai === 1 ? { status: 401, json: async () => ({}) } : { status: 200, json: async () => ({ conversation: { messages: [{ entity: { id: 7 } }] } }) };
  };
  const e = await M.ENVOYEURS.vinted({ conversationRef: "501", texte: "Oui" });
  assert.equal(e.ok, true);
  assert.equal(appels.filter((a) => a.url.endsWith("/replies")).length, 2, "deux POST seulement : le refusé (401) et le bon");
  // Une autre erreur (500) : AUCUNE seconde tentative.
  appels = [];
  globalThis.fetch = async (url, init = {}) => { appels.push({ url, method: init.method ?? "GET" }); return { status: 500, json: async () => ({}) }; };
  const e2 = await M.ENVOYEURS.vinted({ conversationRef: "501", texte: "Oui" });
  assert.equal(e2.ok, false);
  assert.equal(appels.length, 1, "un seul POST après une erreur qui n'est pas un 401");
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

// ── g. L'envoi (16/10 nuit : comptes bêta sans liste blanche, texte exact) ───
await cas("background.js vérifie l'empreinte du texte AVANT l'envoi, passe la clé d'idempotence, et n'envoie qu'UNE réponse par passage", () => {
  const i = SECTION.indexOf("async function envoyerReponseMessagerie");
  const corps = SECTION.slice(i, SECTION.indexOf("/** Un passage de la bêta", i));
  const iEmpreinte = corps.indexOf("M.empreinteTexte(rep.texte)");
  const iCompare = corps.indexOf("empreinte !== rep.empreinte");
  const iEnvoi = corps.indexOf("executerDansOngletPlateforme(rep.platform, envoyeur");
  assert.ok(iEmpreinte > 0 && iCompare > iEmpreinte && iEnvoi > iCompare, "empreinte recalculée et comparée AVANT l'envoyeur");
  assert.ok(/empreinte_differente/.test(corps));
  assert.ok(/cleEnvoi: rep\.id/.test(corps), "la clé d'idempotence de la plateforme = le numéro de la réponse");
  assert.ok(/texte: rep\.texte,/.test(corps), "le texte part tel quel");
  assert.equal((corps.match(/messagerie_reponse_a_envoyer/g) || []).length, 1, "une seule prise par passage");
  assert.equal((corps.match(/executerDansOngletPlateforme\(rep\.platform, envoyeur/g) || []).length, 1, "un seul envoi par passage");
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

const MIG2 = lire("supabase/migrations/20261016200000_bordereaux_demandes_beta.sql");
await cas("migration 20261016200000 : demandes en lecture seule, REVOKE anon, une demande = un clic (session), bordereau PRÊT seulement", () => {
  assert.ok(/ALTER TABLE public\.bordereaux_demandes ENABLE ROW LEVEL SECURITY/.test(MIG2));
  assert.ok(/CREATE POLICY bordereaux_demandes_lecture ON public\.bordereaux_demandes\s+FOR SELECT TO authenticated USING \(user_id = auth\.uid\(\)\)/.test(MIG2));
  assert.ok(!/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/.test(MIG2), "aucune écriture directe");
  for (const f of ["bordereau_demander", "bordereau_demande_a_traiter", "bordereau_demande_resultat"]) {
    assert.ok(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon`).test(MIG2), `REVOKE ${f}`);
  }
  const demander = MIG2.slice(MIG2.indexOf("CREATE OR REPLACE FUNCTION public.bordereau_demander("), MIG2.indexOf("CREATE OR REPLACE FUNCTION public.bordereau_demande_a_traiter("));
  assert.ok(/v_user uuid := auth\.uid\(\);/.test(demander) && /IF v_user IS NULL THEN RAISE EXCEPTION 'session requise'/.test(demander), "seule une session (l'app, au clic) crée une demande");
  assert.ok(/v_cmd\.etat <> 'a_expedier' OR v_cmd\.bordereau <> 'pret'/.test(demander), "jamais un bordereau qui n'est pas prêt");
  assert.ok(/platform NOT IN \('vinted','leboncoin'\)/.test(demander));
  assert.ok(/GRANT EXECUTE ON FUNCTION public\.bordereau_demander\(uuid\) TO authenticated;/.test(MIG2), "l'app seulement (pas le service)");
  assert.ok(/interval '30 minutes'/.test(MIG2), "une demande sans poste expire");
  assert.ok(/bordereaux_ouverts/.test(MIG2));
  assert.ok(fs.existsSync(path.join(RACINE, "supabase/rollbacks/20261016200000_bordereaux_demandes_beta.sql")), "inverse présent");
});

console.log(`messagerie-selftest : ${n} cas verts`);
