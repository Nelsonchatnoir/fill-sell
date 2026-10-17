// ═══════════════════════════════════════════════════════════════════════════
// MESSAGERIE + COMMANDES eBAY — NORMALISEURS PURS (bêta, 16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Importé par la fonction edge ebay-messagerie (Deno) ET par le selftest
// (Node, scripts/messagerie-ebay-selftest.mjs) : aucun import, aucune E/S.
//
// eBay par l'API officielle, avec le jeton DÉJÀ consenti (api_scope,
// sell.fulfillment) : la Trading API GetMyMessages lit la messagerie « Mes
// messages » ; aucun scope de plus n'est demandé (garde-fou
// _shared/ebay-oauth.ts : commerce.message reste interdit).
//
// ⛔ DONNÉES : le pseudo eBay de l'interlocuteur / de l'acheteur, le numéro
//    d'annonce et de commande, le texte des messages (affichage seul, 30 j).
//    JAMAIS l'adresse de livraison (fulfillmentStartInstructions.shipTo), le
//    nom, le téléphone, l'e-mail : seuls shippingServiceCode et shipByDate
//    sont lus dans les consignes d'envoi.
// ═══════════════════════════════════════════════════════════════════════════

const TEXTE_MAX = 4000;
const EXTRAIT_MAX = 140;
const RETENTION_MS = 30 * 24 * 3600 * 1000;

function court(s, n) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function iso(v) {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// Le HTML d'un e-mail eBay → son texte. ⚠️ (16/10, relevé réel) `Content` N'EST
// PAS du texte brut : c'est le même gabarit HTML que `Text`, avec ~4 000
// caractères de <head>/<style> AVANT le <body> — le couper avant d'extraire
// gardait le style et jamais le message. On extrait d'abord, on coupe après.
function texteDuHtml(h) {
  let zone = h;
  const uit = h.match(/id=["']?UserInputtedText["']?[^>]*>([\s\S]*?)<\/div>/i);
  if (uit) zone = uit[1];
  else {
    const corps = h.match(/<body[^>]*>([\s\S]*?)(<\/body>|$)/i);
    zone = corps ? corps[1] : h.replace(/<head[\s\S]*?<\/head>/i, " ");
  }
  const texte = zone
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)));
  return court(texte, TEXTE_MAX);
}

/**
 * Le texte d'un message eBay. Le corps est un gabarit HTML d'e-mail ; le mot
 * de la personne est dans #UserInputtedText quand il existe, sinon le corps
 * (<body>) débarrassé de ses balises. `Content` d'abord, `Text` ensuite —
 * l'un comme l'autre peuvent être du HTML. Jamais plus de 4 000 caractères.
 * @param {string | null | undefined} html
 * @param {string | null | undefined} [contenu]
 * @returns {string | null}
 */
export function texteMessageEbay(html, contenu = undefined) {
  for (const source of [contenu, html]) {
    const s = String(source ?? "");
    if (!s.trim()) continue;
    const t = /<\s*(html|body|div|p|br|table|span|!doctype|head)\b/i.test(s) ? texteDuHtml(s) : court(s, TEXTE_MAX);
    if (t) return t;
  }
  return null;
}

/**
 * Les en-têtes de GetMyMessages (dossier 0 = reçus, 1 = envoyés), groupés en
 * conversations : une conversation = une annonce × un interlocuteur (la Trading
 * API ne numérote pas les fils). Les messages d'eBay lui-même sont « système ».
 * entetes: [{ message_id, external_id, sender, recipient, send_to_name,
 *             subject, item_id, item_title, receive_date, read, folder_id,
 *             message_type, response_enabled, texte? }]
 */
export function conversationsEbay(entetes, maintenant = Date.now()) {
  const groupes = new Map();
  for (const e of entetes ?? []) {
    const quand = iso(e?.receive_date);
    if (!quand || maintenant - Date.parse(quand) > RETENTION_MS) continue;
    const envoye = String(e.folder_id ?? "") === "1";
    const systeme = !envoye && (String(e.sender ?? "").toLowerCase() === "ebay" || /^ebay/i.test(String(e.message_type ?? "")) && !/question|member|contact/i.test(String(e.message_type ?? "")));
    const autre = envoye ? (e.recipient || e.send_to_name || null) : (e.sender || null);
    const cle = `${e.item_id ? String(e.item_id) : "sans-annonce"}:${systeme ? "ebay" : String(autre ?? "inconnu")}`;
    const g = groupes.get(cle) ?? {
      ref: cle, interlocuteur_ref: systeme ? null : (autre ? String(autre) : null),
      interlocuteur_pseudo: systeme ? "eBay" : (autre ? String(autre) : null),
      annonce_ref: e.item_id ? String(e.item_id) : null,
      titre: court(e.item_title || e.subject, 200), systeme, cote: "inconnu",
      dernier_le: null, extrait: null, non_lus: 0, reponse_possible: false, _messages: [],
    };
    if (!g.dernier_le || Date.parse(quand) > Date.parse(g.dernier_le)) {
      g.dernier_le = quand;
      // (16/10, relevé réel) L'extrait ne vient QUE d'un texte lu ce passage :
      // sinon null, et la base garde le précédent (jamais l'objet du mail à la
      // place — chaque passage sans texte réécrivait les conversations).
      g.extrait = e.texte ? court(e.texte, EXTRAIT_MAX) : null;
    }
    if (!envoye && e.read === false) g.non_lus += 1;
    if (e.response_enabled === true) g.reponse_possible = true;
    if (/AskSellerQuestion|ResponseToASQ/i.test(String(e.message_type ?? ""))) g.cote = "vendeur";
    g._messages.push({
      conversation_ref: cle,
      ref: String(e.external_id || e.message_id),
      sens: envoye ? "envoye" : (systeme ? "plateforme" : "recu"),
      type: systeme ? "systeme" : "texte",
      texte: e.texte ?? null,
      envoye_le: quand,
    });
    groupes.set(cle, g);
  }
  const conversations = [];
  const messages = [];
  for (const g of groupes.values()) {
    const { _messages, ...c } = g;
    conversations.push(c);
    messages.push(..._messages);
  }
  return { conversations, messages };
}

/** orderFulfillmentStatus + cancelState → état FillSell. */
export function etatCommandeEbay(fulfillment, cancelState) {
  const c = String(cancelState ?? "").toUpperCase();
  if (c === "CANCELED") return "annulee";
  const f = String(fulfillment ?? "").toUpperCase();
  if (f === "NOT_STARTED") return "a_expedier";
  if (f === "IN_PROGRESS") return "a_expedier";
  if (f === "FULFILLED") return "expediee";
  return "inconnu";
}

/**
 * Commandes de getOrders → contrat commandes_enregistrer. Ne lit QUE : numéro,
 * état, pseudo de l'acheteur, ligne (titre, numéro d'annonce), total, date,
 * date limite d'envoi et service choisi. Jamais shipTo ni buyerRegistrationAddress.
 */
export function commandesEbay(orders, suivis = {}) {
  const out = [];
  for (const o of orders ?? []) {
    if (!o?.orderId) continue;
    const lignes = Array.isArray(o.lineItems) ? o.lineItems : [];
    const unique = lignes.length === 1 ? lignes[0] : null;
    const instr = Array.isArray(o.fulfillmentStartInstructions) ? o.fulfillmentStartInstructions[0] : null;
    const service = instr?.shippingStep?.shippingServiceCode ?? null;
    const avant = unique?.lineItemFulfillmentInstructions?.shipByDate ?? null;
    // (17/10) Une étiquette achetée sur eBay (ou un envoi déclaré) : son numéro
    // de suivi et son transporteur, lus par getShippingFulfillments.
    const suivi = suivis?.[String(o.orderId)] ?? null;
    out.push({
      ref: String(o.orderId),
      etat: etatCommandeEbay(o.orderFulfillmentStatus, o.cancelStatus?.cancelState),
      etat_plateforme: [o.orderFulfillmentStatus ?? null, o.orderPaymentStatus ?? null, o.cancelStatus?.cancelState ?? null].filter(Boolean).join("/") || null,
      // eBay n'achète pas de bordereau par API en France : il se prend DANS eBay.
      bordereau: etatCommandeEbay(o.orderFulfillmentStatus, o.cancelStatus?.cancelState) === "a_expedier" ? "a_obtenir" : "sans_objet",
      acheteur_pseudo: o.buyer?.username ?? null,
      titre: court(unique?.title ?? (lignes.length > 1 ? `${lignes.length} articles` : null), 200),
      montant: Number.isFinite(Number(o.pricingSummary?.total?.value)) ? Number(o.pricingSummary.total.value) : null,
      devise: o.pricingSummary?.total?.currency ?? null,
      annonce_ref: unique?.legacyItemId ? String(unique.legacyItemId) : null,
      transporteur: suivi?.transporteur ? court(suivi.transporteur, 80) : (service ? court(service, 80) : null),
      ...(suivi?.numero ? { envoi_ref: court(suivi.numero, 100) } : {}),
      a_expedier_avant: iso(avant),
      vendue_le: iso(o.creationDate),
    });
  }
  return out;
}

/**
 * (17/10) Le suivi d'une commande eBay (getShippingFulfillments) : le premier
 * envoi qui porte un numéro — {numero, transporteur} — sinon null. Rien d'autre
 * n'est lu (ni adresse, ni nom).
 */
export function suiviEbay(reponse) {
  const liste = Array.isArray(reponse?.fulfillments) ? reponse.fulfillments : [];
  const f = liste.find((x) => x?.shipmentTrackingNumber) ?? null;
  if (!f) return null;
  return { numero: String(f.shipmentTrackingNumber), transporteur: f.shippingCarrierCode ? String(f.shippingCarrierCode) : null };
}
