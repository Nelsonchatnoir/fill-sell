// ═══════════════════════════════════════════════════════════════════════════
// MESSAGERIE + COMMANDES « À EXPÉDIER » — BÊTA (16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Chantier « messages + bordereaux » ; rapport :
// docs/enquetes/messages-bordereaux-1610/RAPPORT.md.
//
// Script CLASSIQUE (pas de module) chargé par importScripts() dans
// background.js, comme vinted-origine.js. Il pose un seul objet global,
// FILLSELL_MESSAGERIE, et ne fait RIEN tout seul : background.js
// (releverMessagerieBeta) l'appelle derrière la veille des commandes, pour
// les seuls comptes porteurs de profiles.beta_flags.messages_bordereaux.
//
// Trois familles, et une quatrième fermée :
//  1. NORMALISEURS — purs, testés en Node (scripts/messagerie-selftest.mjs) :
//     de la forme RELEVÉE de chaque plateforme vers le contrat de la base
//     (messagerie_enregistrer, commandes_enregistrer) ;
//  2. LECTEURS DE PAGE — fonctions AUTONOMES (aucune référence extérieure :
//     chrome.scripting.executeScript les sérialise), exécutées dans l'onglet
//     de travail de la plateforme, en LECTURE (GET) seulement. Elles ne rendent
//     que les champs du contrat : jamais un nom, une adresse, un téléphone ;
//  3. ENVOYEURS DE PAGE — l'envoi d'UNE réponse, jamais appelé sans une
//     réponse sortie de messagerie_reponse_a_envoyer (liste blanche lue en
//     base au moment de la prise, puis relue par background.js) ;
//  4. LE CHEMIN DU BORDEREAU (Vinted, Leboncoin) jusqu'au fichier : sans
//     `derniereMarche: true`, aucun fichier d'étiquette n'est demandé
//     (selftest) ; background.js ne le passe QUE pour une demande née d'un
//     clic dans l'app (16/10 soir, migration 20261016200000).
//
// ⛔ CONTRATS RELEVÉS EN LECTURE SUR LE COMPTE DE NICO LE 16/10 :
//   Vinted   GET /api/v2/inbox?page&per_page → conversations[{id, unread,
//            updated_at, description, opposite_user{id,login}, item_photos}] ;
//            GET /api/v2/conversations/<id> → conversation{messages[],
//            transaction{item_id, item_ids, item_title, current_user_side,
//            offer_price, status, shipment_id, shipment_status}, allow_reply} ;
//            GET /api/v2/my_orders?type=sold&status=in_progress ;
//            GET /api/v2/transactions/<id> → buyer{login}, shipment{status},
//            order{user_msg_thread_id}. Réponse : POST
//            /api/v2/conversations/<id>/replies {reply:{body,…}} (code du site).
//   Leboncoin GET api…/messaging-items-api/v3/conversations[?page_hash] →
//            {conversations[{conversation_id, item{id,type,subject,image,
//            owner_id}, partners[{id,name}], unseen_counter, policies,
//            last_message_sent_at, last_message_preview}], metadata{
//            current_user, next_page_hash}} ; GET …/messaging/proxy/api/v1/
//            hal/<moi>/conversations/<id>/messages?expanded=true&order=asc ;
//            GET …/consumergoods/purchase/v2/purchases/<id> → fsm{current_state,
//            states_history}, item{id}, metadata{parcelID, parcelShippingType}.
//            Réponse : POST …/hal/<moi>/conversations/<id>/messages
//            {clientMessageId, text, attachments:[]} (code du site).
//   Depop    GET webapi…/presentation/api/v1/conversations/?limit&unreadOnly ;
//            GET …/conversations/<id>/messages/. Réponse : POST
//            …/conversations/messages/ {user_id, text, product_id,
//            idempotency_key} (code du site).
// ⛔ JAMAIS « MARQUER COMME LU ». Chaque site le fait par un appel SÉPARÉ
//    (Vinted PUT …/mark_as_read, Leboncoin PUT …/messages/<id>/read, Depop
//    PATCH …/mark-read) que ce fichier n'appelle jamais : lire ≠ marquer lu
//    (prouvé sur Depop le 16/10 : 1 non lu avant, 1 après).
// ⛔ Aucun texte de message dans un console.log ni dans un journal.
// ⛔ Beebs (relevé le 16/10 au soir, en lecture, sur le compte d'Ornella —
//    téléphone vérifié) : la messagerie web n'existe que pour un compte dont
//    le téléphone est vérifié — le jeton de session (cookie access_token,
//    jeton Firebase) porte alors l'identité « phone » ; sinon la page
//    /fr/account/chats renvoie vers /fr/account/phone-verification. Sans
//    téléphone : motif `telephone_non_verifie`, et l'app le DIT (« vérifie ton
//    numéro sur Beebs ») au lieu d'une messagerie vide. Liste : HTML rendu par
//    le serveur (/fr/account/chats) ; détail : flux RSC de /fr/account/chats/
//    <id> (messages {id, created_at, chat_id, text, attachment, from_user_id,
//    to_user_id, is_from_admin}) ; réponse : POST https://api.beebs.app/
//    chats/v3 {to_user_id, text}, en-tête `authorization` = le jeton brut
//    (code du site). Ouvrir une conversation SUR LE SITE la marque lue ; lire
//    son flux RSC d'ici : non prouvé (accepté par Nico le 16/10).
// ⛔ Commandes Beebs et Depop : AUCUNE vente sur les comptes de Nico ni
//    d'Ornella le 16/10 — lecteurs écrits d'après le code des sites (Beebs :
//    page « Ventes » et page de la commande en flux RSC, états
//    WAIT_SELLER_CONFIRM → LABEL_PRINTED → IN_DELIVERY… ; Depop :
//    GET …/receipts/?role=seller). À prouver à la première vraie vente ; une
//    forme illisible n'écrit RIEN.
// ═══════════════════════════════════════════════════════════════════════════
(function (g) {
  "use strict";

  // ── Cadence : celle de la veille des commandes (10 min ± 90 s) ───────────
  const CADENCE_MS = 10 * 60 * 1000;
  const ALEA_MS = 90 * 1000;
  const DETAILS_MAX = 5;            // conversations détaillées par passage
  const COMMANDES_DETAILS_MAX = 5;  // commandes détaillées par passage
  const MESSAGES_PAR_CONVERSATION = 30;
  const EXTRAIT_MAX = 140;
  const RETENTION_MS = 30 * 24 * 3600 * 1000;
  const PLATEFORMES_EXTENSION = Object.freeze(["vinted", "leboncoin", "depop", "beebs"]);
  const PLATEFORMES_COMMANDES = Object.freeze(["vinted", "leboncoin", "depop", "beebs"]);
  // La dernière marche du bordereau (le fichier d'étiquette) : OUVERTE le
  // 16/10 au soir (mission de Nico, migration 20261016200000) — mais elle ne
  // part QUE pour une demande née d'un clic dans l'app (bordereau_demander →
  // bordereau_demande_a_traiter), et seulement si coin_config.
  // bordereaux_ouverts = 1. Rien d'autre n'appelle les chemins du bordereau.
  const BORDEREAU_DERNIERE_MARCHE_OUVERTE = true;
  // Beebs : l'utilisateur « système » (messages de Beebs lui-même), relevé
  // dans le code du site (ADMIN_USER_ID).
  const BEEBS_ADMIN = "iwJIYrpj3cYueeS5JWCQCIKHbfx2";

  // ── 1. Outils purs ───────────────────────────────────────────────────────
  function texteCourt(s, n = EXTRAIT_MAX) {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    if (!t) return null;
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  }
  function dateIso(v) {
    if (v == null || v === "") return null;
    let d;
    if (typeof v === "number") d = new Date(v < 1e12 ? v * 1000 : v);
    else d = new Date(String(v));
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  function recente(iso, maintenant = Date.now()) {
    const t = Date.parse(iso ?? "");
    return Number.isFinite(t) && maintenant - t <= RETENTION_MS;
  }
  function montant(v) {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  /** Un signe de blocage dans une réponse lue (403, 429, captcha, DataDome). */
  function signeBlocage(lecture) {
    if (!lecture || typeof lecture !== "object") return null;
    const http = Number(lecture.http);
    if (lecture.bot === true) return lecture.motif ? String(lecture.motif) : "captcha";
    if (http === 403) return "http_403";
    if (http === 429) return "http_429";
    return null;
  }

  /** Les conversations à détailler : nouvelles ou changées, les plus récentes d'abord. */
  function aDetailler(liste, connues, max = DETAILS_MAX) {
    const parRef = new Map((connues ?? []).map((c) => [String(c.conversation_ref), c]));
    return (liste ?? [])
      .filter((c) => c && c.ref && recente(c.dernier_le))
      .filter((c) => {
        const k = parRef.get(String(c.ref));
        if (!k) return true;
        const avant = Date.parse(k.dernier_message_le ?? "");
        const apres = Date.parse(c.dernier_le ?? "");
        return !Number.isFinite(avant) || (Number.isFinite(apres) && apres > avant);
      })
      .sort((a, b) => (Date.parse(b.dernier_le ?? "") || 0) - (Date.parse(a.dernier_le ?? "") || 0))
      .slice(0, max)
      .map((c) => String(c.ref));
  }

  // La RÈGLE de lecture du détail, par plateforme. Quand elle change (un champ
  // mal lu), la mémoire « déjà détaillé » du poste est oubliée UNE fois : les
  // fils sont relus avec la nouvelle règle au rythme ordinaire (5 par passage,
  // les plus récents d'abord), jamais en rafale.
  // vinted 2 (16/10) : l'annonce est lue aussi dans item_ids.
  const REGLE_DETAIL = Object.freeze({ vinted: 2, leboncoin: 1, depop: 1, beebs: 1 });

  /** La mémoire des fils détaillés du poste, oubliée si la règle a changé. */
  function memoireDetails(etat, platform) {
    const regle = REGLE_DETAIL[platform] ?? 1;
    const memo = etat?.detailles && typeof etat.detailles === "object" ? etat.detailles : {};
    if ((etat?.regleDetail ?? 1) !== regle) return { memo: {}, regle, oubliee: Object.keys(memo).length };
    return { memo, regle, oubliee: 0 };
  }

  // ── 2. Normaliseurs : VINTED ─────────────────────────────────────────────
  // L'annonce d'une conversation Vinted : `item_id`, ou, quand Vinted le laisse
  // vide (ventes passées : item_id, item_title, item_photo à null, constaté le
  // 16/10 sur 8 fils de Nico), le SEUL numéro de `item_ids`. Un lot (plusieurs
  // articles) n'est imputé à aucune annonce.
  function articleUniqueVinted(tr) {
    if (!tr || tr.is_bundle) return null;
    if (tr.item_id != null) return String(tr.item_id);
    const ids = Array.isArray(tr.item_ids) ? tr.item_ids.filter((x) => x != null && x !== "") : [];
    return ids.length === 1 ? String(ids[0]) : null;
  }

  // Liste : [{id, unread, updated_at, description, opposite_user:{id,login}, photo}]
  // Détail : {[id]: {allow_reply, opposite_user:{id,login,is_system}, transaction:{…}, messages:[…]}}
  function normaliserVinted(lecture, details = {}, maintenant = Date.now()) {
    const conversations = [];
    const messages = [];
    for (const c of lecture?.conversations ?? []) {
      const ref = c?.id != null ? String(c.id) : null;
      if (!ref) continue;
      const det = details?.[ref] ?? null;
      const tr = det?.transaction ?? null;
      const autre = det?.opposite_user ?? c.opposite_user ?? null;
      const article = articleUniqueVinted(tr);
      const conv = {
        ref,
        interlocuteur_ref: autre?.id != null ? String(autre.id) : null,
        interlocuteur_pseudo: autre?.login ?? null,
        dernier_le: dateIso(c.updated_at),
        extrait: texteCourt(c.description),
        non_lus: c.unread ? 1 : 0,
        photo: c.photo ?? null,
      };
      if (det) {
        conv.annonce_ref = article;
        conv.titre = tr?.item_title ?? null;
        conv.cote = tr?.current_user_side === "seller" ? "vendeur" : tr?.current_user_side === "buyer" ? "acheteur" : "inconnu";
        conv.systeme = Boolean(autre?.is_system) || !tr;
        conv.reponse_possible = det.allow_reply === true ? true : det.allow_reply === false ? false : null;
        if (tr?.id != null) conv.commande_ref = String(tr.id);
        const offre = (det.messages ?? []).filter((m) => /offer/.test(String(m?.entity_type))).pop();
        if (offre?.entity?.price) {
          conv.offre = {
            montant: montant(offre.entity.price.amount),
            devise: offre.entity.price.currency_code ?? null,
            statut: texteCourt(offre.entity.status_title, 60),
          };
        }
        const autreId = autre?.id != null ? String(autre.id) : null;
        const lus = (det.messages ?? []).slice(-MESSAGES_PAR_CONVERSATION);
        for (const m of lus) {
          const n = normaliserMessageVinted(m, ref, autreId);
          if (n && recente(n.envoye_le, maintenant)) messages.push(n);
        }
      }
      conversations.push(conv);
    }
    return { conversations, messages };
  }

  function normaliserMessageVinted(m, conversationRef, autreId) {
    const e = m?.entity ?? {};
    const quand = dateIso(m?.created_at_ts);
    if (!quand) return null;
    const type = String(m?.entity_type ?? "");
    const sensDe = (uid) => (uid == null ? "plateforme" : String(uid) === autreId ? "recu" : "envoye");
    if (type === "message") {
      if (e.id == null) return null;
      return { conversation_ref: conversationRef, ref: `m${e.id}`, sens: sensDe(e.user_id), type: "texte",
        texte: e.is_hidden ? null : (e.body ?? null), envoye_le: quand };
    }
    if (type === "offer_request_message" || type === "offer_message") {
      const id = e.offer_request_id ?? `${quand}-${e.price?.amount ?? ""}`;
      return { conversation_ref: conversationRef, ref: `o${id}`, sens: sensDe(e.user_id), type: "offre", texte: null,
        offre_montant: montant(e.price?.amount), offre_devise: e.price?.currency_code ?? null,
        offre_statut: texteCourt(e.status_title, 60), envoye_le: quand };
    }
    if (type === "status_message" || type === "action_message") {
      return { conversation_ref: conversationRef, ref: `s${m?.event_type ?? type}-${quand}`, sens: "plateforme", type: "statut",
        texte: texteCourt(e.title, 200), envoye_le: quand };
    }
    return { conversation_ref: conversationRef, ref: `x${type}-${quand}`, sens: "plateforme", type: "systeme",
      texte: null, envoye_le: quand };
  }

  // Statut d'envoi Vinted (énumération lue dans le code du site le 16/10) :
  // 1 New · 100 Estimated · 150 InstructionsConfirmed · 200 LabelProcessing ·
  // 210 LabelFailed · 220 LabelProcessed · 230 LabelSent · 250 TrackingPending ·
  // 300 Shipped · 310 HeldAtPostOffice · 350 LostParcel · 400 Delivered ·
  // 500 CancelDone · 600+ ReturnToSender… · 700+ centre de vérification.
  function etatCommandeVinted(statutUtilisateur, statutEnvoi) {
    const u = String(statutUtilisateur ?? "").toLowerCase();
    if (u === "failed" || u === "canceled" || u === "cancelled") return { etat: "annulee", bordereau: "sans_objet" };
    if (u === "completed") return { etat: "terminee", bordereau: "sans_objet" };
    const s = Number(statutEnvoi);
    if (!Number.isFinite(s)) return { etat: "inconnu", bordereau: "inconnu" };
    if (s === 210) return { etat: "a_expedier", bordereau: "indisponible" };
    if ([220, 230, 250].includes(s)) return { etat: "a_expedier", bordereau: "pret" };
    if (s < 220) return { etat: "a_expedier", bordereau: "a_obtenir" };
    if (s === 300 || s === 310 || (s >= 700 && s < 800)) return { etat: "expediee", bordereau: "sans_objet" };
    if (s === 350) return { etat: "litige", bordereau: "sans_objet" };
    if (s === 400) return { etat: "livree", bordereau: "sans_objet" };
    if (s === 500) return { etat: "annulee", bordereau: "sans_objet" };
    if (s >= 600 && s < 700) return { etat: "retour", bordereau: "sans_objet" };
    return { etat: "inconnu", bordereau: "inconnu" };
  }

  // [{transaction_id, title, price{amount,currency_code}, date, photo_url,
  //   transaction_user_status, detail?:{status, item_id, item_ids, buyer_login,
  //   shipment{id,status}, thread_id, offer_price, debit_processed_at}}]
  function normaliserCommandesVinted(commandes) {
    const out = [];
    for (const c of commandes ?? []) {
      const ref = c?.transaction_id != null ? String(c.transaction_id) : null;
      if (!ref) continue;
      const d = c.detail ?? null;
      const { etat, bordereau } = etatCommandeVinted(c.transaction_user_status, d?.shipment?.status);
      const ids = Array.isArray(d?.item_ids) ? d.item_ids : [];
      out.push({
        ref, etat, bordereau,
        etat_plateforme: [d?.status ?? null, d?.shipment?.status ?? null, c.transaction_user_status ?? null]
          .filter((x) => x != null && x !== "").join("/") || null,
        acheteur_pseudo: d?.buyer_login ?? null,
        titre: c.title ?? null,
        photo: c.photo_url ?? null,
        montant: montant(d?.offer_price?.amount ?? c.price?.amount),
        devise: d?.offer_price?.currency_code ?? c.price?.currency_code ?? null,
        annonce_ref: ids.length === 1 ? String(ids[0]) : (ids.length === 0 && d?.item_id != null ? String(d.item_id) : null),
        conversation_ref: d?.thread_id != null ? String(d.thread_id) : null,
        envoi_ref: d?.shipment?.id != null ? String(d.shipment.id) : null,
        vendue_le: dateIso(d?.debit_processed_at ?? c.date),
      });
    }
    return out;
  }

  // ── 3. Normaliseurs : LEBONCOIN ──────────────────────────────────────────
  function normaliserLeboncoin(lecture, details = {}, maintenant = Date.now()) {
    const moi = lecture?.moi ?? null;
    const conversations = [];
    const messages = [];
    for (const c of lecture?.conversations ?? []) {
      const ref = c?.conversation_id ? String(c.conversation_id) : null;
      if (!ref) continue;
      const item = c.item ?? {};
      const annonce = item.type === "ad" && item.id ? String(item.id) : null;
      const autre = Array.isArray(c.partners) ? c.partners[0] : null;
      const policies = Array.isArray(c.policies) ? c.policies : [];
      conversations.push({
        ref,
        interlocuteur_ref: autre?.id ?? null,
        interlocuteur_pseudo: autre?.name ?? null,
        annonce_ref: annonce,
        titre: item.subject ?? null,
        photo: item.image ?? null,
        cote: annonce ? (moi && item.owner_id === moi ? "vendeur" : "acheteur") : "inconnu",
        systeme: item.type !== "ad" || item.owner_type === "system",
        dernier_le: dateIso(c.last_message_sent_at),
        extrait: texteCourt(c.last_message_preview),
        non_lus: Math.max(0, Number(c.unseen_counter) || 0),
        reponse_possible: !policies.includes("participant-cannot-write"),
      });
      for (const m of (details?.[ref] ?? []).slice(-MESSAGES_PAR_CONVERSATION)) {
        const n = normaliserMessageLeboncoin(m, ref);
        if (n && recente(n.envoye_le, maintenant)) messages.push(n);
      }
    }
    return { conversations, messages };
  }

  // Types relevés le 16/10 : ApiTemplateMessage (question type de
  // l'acheteur), ApiSystemMessage (FAVOURITE_AD = mise en favori,
  // THOR_REMINDER_SELLER = relance), ApiIntegrationMessage (paiement,
  // envoi, offre). Le message libre est le reste.
  function normaliserMessageLeboncoin(m, conversationRef) {
    if (!m?.id) return null;
    const quand = dateIso(m.sentAt ?? m.date);
    if (!quand) return null;
    const t = String(m.type ?? "");
    const sub = String(m.typeAttributes?.subType ?? "");
    const scope = String(m.typeAttributes?.scope ?? "");
    let type = "texte"; let sens = m.outgoing ? "envoye" : "recu";
    if (t === "ApiSystemMessage") { type = sub === "FAVOURITE_AD" ? "favori" : "systeme"; sens = "plateforme"; }
    else if (t === "ApiIntegrationMessage") { type = /nego|offer/i.test(scope) ? "offre" : "statut"; sens = "plateforme"; }
    // Offre (scope « consumergoods_negotiation », relevé le 16/10) : le montant
    // est dans le texte (« … 15 € … ») — lu s'il y est, jamais deviné.
    let offre = null;
    if (type === "offre") {
      const mt = String(m.text ?? "").match(/(\d+(?:[.,]\d{1,2})?)\s?€/);
      if (mt) offre = montant(mt[1]);
    }
    return { conversation_ref: conversationRef, ref: String(m.id), sens, type,
      texte: type === "favori" ? null : (m.text ?? null), envoye_le: quand,
      ...(offre != null ? { offre_montant: offre, offre_devise: "EUR" } : {}) };
  }

  // Machine d'états d'une vente (relevée le 16/10, gabarit « part-delivery-
  // pickup-point ») : created → reserved (payée, disponibilité à confirmer) →
  // available (+ parcel-label-generated : bordereau prêt) → sent → received →
  // money-unblocked → finished ; annulations : admin-/seller-cancelled,
  // seller-shipment-expired.
  function etatCommandeLeboncoin(etape, statutFsm, evenements = []) {
    const s = String(statutFsm ?? "").toLowerCase();
    const step = String(etape ?? "").toLowerCase();
    if (/cancel/.test(s) || step === "cancelled") return { etat: "annulee", bordereau: "sans_objet" };
    if (s === "created" || s === "reserved") return { etat: "a_confirmer", bordereau: "a_generer" };
    if (s === "available") {
      const pret = evenements.some((e) => /parcel-(label|qrcode)-generated/.test(String(e)));
      return { etat: "a_expedier", bordereau: pret ? "pret" : "a_obtenir" };
    }
    if (s === "sent") return { etat: "expediee", bordereau: "sans_objet" };
    if (s === "received") return { etat: "livree", bordereau: "sans_objet" };
    if (s === "money-unblocked" || s === "finished" || step === "done") return { etat: "terminee", bordereau: "sans_objet" };
    if (/litig|incident|dispute/.test(s)) return { etat: "litige", bordereau: "sans_objet" };
    if (/return/.test(s)) return { etat: "retour", bordereau: "sans_objet" };
    return { etat: "inconnu", bordereau: "inconnu" };
  }

  // [{purchase_id, step, created_at, title, thumbnail, price (CENTIMES),
  //   user_name, detail?:{item_id, statut, evenements[], parcel_id, shipping_type}}]
  function normaliserCommandesLeboncoin(commandes) {
    const out = [];
    for (const c of commandes ?? []) {
      const ref = c?.purchase_id != null ? String(c.purchase_id) : null;
      if (!ref) continue;
      const d = c.detail ?? null;
      const { etat, bordereau } = etatCommandeLeboncoin(c.step, d?.statut, d?.evenements ?? []);
      out.push({
        ref, etat, bordereau,
        etat_plateforme: [c.step ?? null, d?.statut ?? null].filter(Boolean).join("/") || null,
        acheteur_pseudo: c.user_name ?? null,
        titre: c.title ?? null,
        photo: c.thumbnail ?? null,
        // ⛔ Leboncoin rend les montants en CENTIMES.
        montant: Number.isFinite(Number(c.price)) ? Math.round(Number(c.price)) / 100 : null,
        devise: "EUR",
        annonce_ref: d?.item_id != null ? String(d.item_id) : null,
        transporteur: d?.shipping_type ?? null,
        envoi_ref: d?.parcel_id ?? null,
        vendue_le: dateIso(c.created_at),
      });
    }
    return out;
  }

  // ── 4. Normaliseurs : DEPOP ──────────────────────────────────────────────
  function normaliserDepop(lecture, details = {}, maintenant = Date.now()) {
    const conversations = [];
    const messages = [];
    for (const c of lecture?.conversations ?? []) {
      const ref = c?.conversation_id ? String(c.conversation_id) : null;
      if (!ref) continue;
      const autre = Array.isArray(c.users) ? c.users[0] : null;
      const autreId = autre?.id != null ? String(autre.id) : null;
      conversations.push({
        ref,
        interlocuteur_ref: autreId,
        interlocuteur_pseudo: autre?.username ?? null,
        systeme: String(c.chat_meta_status ?? "") === "DEPOP_OFFICIAL",
        dernier_le: dateIso(c.last_message_timestamp),
        extrait: texteCourt(c.last_message_text),
        non_lus: Math.max(0, Number(c.unread_count) || 0),
        reponse_possible: c.read_only === true ? false : true,
      });
      for (const m of (details?.[ref] ?? []).slice(-MESSAGES_PAR_CONVERSATION)) {
        if (!m?.id) continue;
        const quand = dateIso(m.created_timestamp);
        if (!quand || !recente(quand, maintenant)) continue;
        messages.push({ conversation_ref: ref, ref: String(m.id),
          sens: autreId && String(m.user_id) === autreId ? "recu" : "envoye",
          type: "texte", texte: m.text ?? null, envoye_le: quand });
      }
    }
    return { conversations, messages };
  }

  // Depop, commandes (« receipts », rôle vendeur) : AUCUNE vente relevée le
  // 16/10 (liste vide sur le compte de Nico : {objects:[], page_info}) ; les
  // champs viennent du code du site (shippingStatus, shippingDeadline,
  // buyer.username, trackingNumber, shipping_provider). Lecture tolérante,
  // camelCase ou snake_case ; un état inconnu reste « inconnu » (l'app le
  // montre quand même dans « À expédier », « état à vérifier »).
  // ⛔ Pas de bordereau Depop en France : bordereau « sans_objet ».
  function etatCommandeDepop(statut) {
    const s = String(statut ?? "").toLowerCase();
    if (!s) return "inconnu";
    if (/cancel|refund|void/.test(s)) return "annulee";
    if (/complete|finished|done|closed/.test(s)) return "terminee";
    if (/deliver/.test(s)) return "livree";
    if (/label_expired|expired/.test(s)) return "a_expedier";
    if (/await|to_ship|not_shipped|ready_to_ship|unshipped|pending|paid|new|purchased|sold/.test(s)) return "a_expedier";
    if (/ship|transit|dispatch|sent|in_delivery/.test(s)) return "expediee";
    if (/dispute|issue|problem|litig/.test(s)) return "litige";
    if (/return/.test(s)) return "retour";
    return "inconnu";
  }

  const premier = (...vals) => vals.find((v) => v != null && v !== "");

  function normaliserCommandesDepop(commandes) {
    const out = [];
    for (const o of commandes ?? []) {
      const ref = premier(o?.id, o?.receiptId, o?.receipt_id, o?.purchaseId, o?.purchase_id);
      if (ref == null) continue;
      const statut = premier(o.shippingStatus, o.shipping_status, o.status, o.state);
      const lignes = premier(o.items, o.products, o.purchasedProducts, o.purchased_products, o.lineItems, o.line_items) ?? [];
      const unique = Array.isArray(lignes) && lignes.length === 1 ? (lignes[0]?.product ?? lignes[0]) : null;
      const photos = unique ? premier(unique.pictures, unique.photos, unique.images, unique.preview) : null;
      const photo = Array.isArray(photos) ? premier(photos[0]?.url, photos[0]?.["320"], photos[0]?.formats?.P2?.url, typeof photos[0] === "string" ? photos[0] : null)
        : (typeof photos === "object" && photos ? premier(photos.url, photos["320"]) : null);
      const total = premier(o.total, o.totalPrice, o.total_price, o.price, o.amount, o.pricing);
      const valeur = typeof total === "object" && total
        ? premier(total.amount, total.total, total.value, total.price_amount, total.priceAmount) : total;
      const devise = typeof total === "object" && total ? premier(total.currency, total.currency_name, total.currencyName) : premier(o.currency);
      const etat = etatCommandeDepop(statut);
      out.push({
        ref: String(ref), etat,
        bordereau: "sans_objet",
        etat_plateforme: statut != null ? texteCourt(String(statut), 80) : null,
        acheteur_pseudo: premier(o.buyer?.username, o.buyer?.user_name, o.buyerUsername, o.buyer_username) ?? null,
        titre: unique ? texteCourt(premier(unique.description, unique.title, unique.name), 200)
          : (Array.isArray(lignes) && lignes.length > 1 ? `${lignes.length} articles` : null),
        photo: photo ?? null,
        montant: montant(valeur),
        devise: devise ?? null,
        annonce_ref: unique ? (premier(unique.slug, unique.productSlug, unique.product_slug, unique.id) ?? null) : null,
        transporteur: texteCourt(premier(o.shipping_provider, o.shippingProvider, o.shipping?.provider, o.shipping?.provider_name), 80),
        envoi_ref: premier(o.trackingNumber, o.tracking_number) != null ? String(premier(o.trackingNumber, o.tracking_number)) : null,
        a_expedier_avant: etat === "a_expedier" ? dateIso(premier(o.shippingDeadline, o.shipping_deadline, o.shipBy, o.ship_by)) : null,
        vendue_le: dateIso(premier(o.soldAt, o.sold_at, o.created_at, o.createdAt, o.date, o.purchased_at)),
      });
    }
    return out;
  }

  // ── 4bis. Normaliseurs : BEEBS (messages) ───────────────────────────────
  // La date d'un élément de la liste (/fr/account/chats) : « 27/08/2026 »
  // (relevé), « 27/08 », « 14:05 » (aujourd'hui), « Hier ». Heure de Paris.
  function dateBeebsListe(texte, maintenant = Date.now()) {
    const t = String(texte ?? "").trim().toLowerCase();
    if (!t) return null;
    const paris = (y, mo, d, h = 0, mi = 0) => {
      // Décalage de Paris à cette date (été +2, hiver +1), sans dépendance.
      const essai = new Date(Date.UTC(y, mo - 1, d, h, mi));
      const local = new Date(essai.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
      const utc = new Date(essai.toLocaleString("en-US", { timeZone: "UTC" }));
      return new Date(essai.getTime() - (local.getTime() - utc.getTime())).toISOString();
    };
    const aujourdhui = new Date(new Date(maintenant).toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) return paris(Number(m[3].length === 2 ? `20${m[3]}` : m[3]), Number(m[2]), Number(m[1]));
    m = t.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (m) return paris(aujourdhui.getFullYear(), Number(m[2]), Number(m[1]));
    m = t.match(/^(\d{1,2})[:h](\d{2})$/);
    if (m) return paris(aujourdhui.getFullYear(), aujourdhui.getMonth() + 1, aujourdhui.getDate(), Number(m[1]), Number(m[2]));
    if (/^(hier|yesterday)$/.test(t)) {
      const h = new Date(aujourdhui.getTime() - 86400000);
      return paris(h.getFullYear(), h.getMonth() + 1, h.getDate());
    }
    return null;
  }

  // Liste : {moi, conversations:[{chat_id, nom, date_texte, apercu, non_lus}]} ;
  // détail : {[id]: {interlocuteur:{id}, bloque, messages:[{id, created_at,
  // text, attachment, from_user_id, is_from_admin, sentByMe}]}}.
  // Beebs n'a pas de pseudo : le nom public affiché (« Prénom N. ») en tient
  // lieu — jamais le nom complet. Une conversation Beebs n'est liée à aucune
  // annonce (messagerie de personne à personne).
  function normaliserBeebs(lecture, details = {}, maintenant = Date.now()) {
    const moi = lecture?.moi != null ? String(lecture.moi) : null;
    const conversations = [];
    const messages = [];
    for (const c of lecture?.conversations ?? []) {
      const ref = c?.chat_id ? String(c.chat_id) : null;
      if (!ref) continue;
      const det = details?.[ref] ?? null;
      const autreId = det?.interlocuteur?.id != null ? String(det.interlocuteur.id) : (det?.destinataire != null ? String(det.destinataire) : null);
      const lus = Array.isArray(det?.messages) ? det.messages : [];
      const dates = lus.map((m) => Date.parse(m?.created_at ?? "")).filter(Number.isFinite);
      const conv = {
        ref,
        interlocuteur_ref: autreId,
        interlocuteur_pseudo: texteCourt(c.nom, 80),
        dernier_le: dates.length ? new Date(Math.max(...dates)).toISOString() : dateBeebsListe(c.date_texte, maintenant),
        extrait: texteCourt(c.apercu),
        non_lus: Math.max(0, Number(c.non_lus) || 0),
      };
      if (det) {
        conv.systeme = autreId === BEEBS_ADMIN;
        conv.reponse_possible = det.bloque === true || det.interlocuteur?.bloque_par_moi === true ? false : true;
      }
      conversations.push(conv);
      for (const m of lus.slice(-MESSAGES_PAR_CONVERSATION)) {
        if (m?.id == null) continue;
        const quand = dateIso(m.created_at);
        if (!quand || !recente(quand, maintenant)) continue;
        const admin = m.is_from_admin === true || String(m.from_user_id ?? "") === BEEBS_ADMIN;
        const envoye = m.sentByMe === true || (moi != null && String(m.from_user_id ?? "") === moi);
        messages.push({ conversation_ref: ref, ref: String(m.id),
          sens: admin ? "plateforme" : (envoye ? "envoye" : "recu"),
          type: admin ? "systeme" : "texte",
          texte: m.text ?? null, envoye_le: quand });
      }
    }
    return { conversations, messages };
  }

  // ── 4ter. Normaliseurs : BEEBS (commandes) ──────────────────────────────
  // États du site (OrderStatusEnum, code de la page de commande, 16/10) :
  // WAIT_SELLER_CONFIRM (48 h pour accepter — « générer le bordereau » =
  // ACCEPTER la commande et débiter l'acheteur : geste du vendeur, jamais
  // FillSell) → CONFIRMED_BY_SELLER / WAITING_GENARATING_LABEL_BY_SELLER
  // (bordereau en cours de création) → LABEL_PRINTED / _WARNING (bordereau
  // prêt, 6 jours pour déposer, < 48 h = WARNING) → IN_DELIVERY → DELIVERED /
  // RETRIEVED_BY_BUYER → APPROVED_BY_BUYER → SELLER_PAID(_REVIEW) ;
  // CANCELLED, LOST_PARCEL, LITIGATION*, LITIGATION_RETURN_*.
  function etatCommandeBeebs(statut) {
    const s = String(statut ?? "").toUpperCase();
    if (!s) return { etat: "inconnu", bordereau: "inconnu" };
    if (s.startsWith("WAIT_SELLER_CONFIRM")) return { etat: "a_confirmer", bordereau: "a_generer" };
    if (s === "CONFIRMED_BY_SELLER" || s === "WAITING_GENARATING_LABEL_BY_SELLER") return { etat: "a_expedier", bordereau: "a_obtenir" };
    if (s === "LABEL_PRINTED" || s === "LABEL_PRINTED_WARNING") return { etat: "a_expedier", bordereau: "pret" };
    if (s === "IN_DELIVERY") return { etat: "expediee", bordereau: "sans_objet" };
    if (s === "DELIVERED" || s === "DELIVERED_WARNING" || s === "RETRIEVED_BY_BUYER") return { etat: "livree", bordereau: "sans_objet" };
    if (s === "APPROVED_BY_BUYER" || s.startsWith("SELLER_PAID")) return { etat: "terminee", bordereau: "sans_objet" };
    if (s === "CANCELLED") return { etat: "annulee", bordereau: "sans_objet" };
    if (s.startsWith("LITIGATION_RETURN")) return { etat: "retour", bordereau: "sans_objet" };
    if (s === "LOST_PARCEL" || s.includes("LITIGATION") || s.includes("ARRANGEMENT")) return { etat: "litige", bordereau: "sans_objet" };
    return { etat: "inconnu", bordereau: "inconnu" };
  }

  // [{id, order:{status, status_updated_at, created_at, carrier_id, products[],
  //   buyer{first_name|firstName, last_name|lastName}, total…}}]
  function normaliserCommandesBeebs(commandes) {
    const out = [];
    for (const c of commandes ?? []) {
      const o = c?.order ?? null;
      const ref = premier(o?.id, c?.id);
      if (ref == null || !o) continue;
      const { etat, bordereau } = etatCommandeBeebs(o.status);
      const produits = Array.isArray(o.products) ? o.products : [];
      const unique = produits.length === 1 ? produits[0] : null;
      const photo = unique ? premier(unique.image, unique.thumbnail, Array.isArray(unique.images) ? unique.images[0] : null, Array.isArray(unique.pictures) ? unique.pictures[0] : null) : null;
      const acheteur = o.buyer ?? null;
      const prenom = premier(acheteur?.first_name, acheteur?.firstName);
      const nomFamille = premier(acheteur?.last_name, acheteur?.lastName);
      const pseudo = prenom ? `${String(prenom).trim()}${nomFamille ? ` ${String(nomFamille).trim().charAt(0)}.` : ""}` : null;
      const total = premier(o.total_price, o.totalPrice, o.total, o.price, o.amount, unique?.price);
      const valeur = typeof total === "object" && total ? premier(total.amount, total.value) : total;
      const majLe = dateIso(premier(o.status_updated_at, o.updated_at));
      const s = String(o.status ?? "").toUpperCase();
      out.push({
        ref: String(ref), etat, bordereau,
        etat_plateforme: o.status ? texteCourt(String(o.status), 80) : null,
        acheteur_pseudo: pseudo ? texteCourt(pseudo, 80) : null,
        titre: unique ? texteCourt(premier(unique.title, unique.name, unique.label), 200) : (produits.length > 1 ? `${produits.length} articles` : null),
        photo: typeof photo === "string" ? photo : (photo?.url ?? null),
        montant: montant(valeur),
        devise: "EUR",
        annonce_ref: unique ? (premier(unique.id, unique.product_id, unique.productId) != null ? String(premier(unique.id, unique.product_id, unique.productId)) : null) : null,
        transporteur: texteCourt(premier(o.carrier_name, o.carrier?.name, o.carrier_id), 80),
        envoi_ref: premier(o.shipping?.tracking_number, o.shipping?.parcel_id) != null ? String(premier(o.shipping?.tracking_number, o.shipping?.parcel_id)) : null,
        // La date limite que le site affiche : déposer dans les 6 jours après le
        // bordereau (LABEL_PRINTED, calcul du site : status_updated_at + 6 j).
        a_expedier_avant: (s === "LABEL_PRINTED" || s === "LABEL_PRINTED_WARNING") && majLe
          ? new Date(Date.parse(majLe) + 6 * 86400000).toISOString() : null,
        vendue_le: dateIso(premier(o.created_at, o.createdAt)),
      });
    }
    return out;
  }

  const NORMALISEURS = Object.freeze({ vinted: normaliserVinted, leboncoin: normaliserLeboncoin, depop: normaliserDepop, beebs: normaliserBeebs });
  const NORMALISEURS_COMMANDES = Object.freeze({
    vinted: normaliserCommandesVinted, leboncoin: normaliserCommandesLeboncoin,
    depop: normaliserCommandesDepop, beebs: normaliserCommandesBeebs,
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 5. LECTEURS DE PAGE — AUTONOMES. Ne rien y référencer d'extérieur.
  // ═════════════════════════════════════════════════════════════════════════
  // Chacun rend { ok, http?, bot?, motif?, requetes, … } et s'arrête au
  // premier 403/429/captcha.

  // Vinted : la liste (1 page, 20 conversations).
  async function lecteurListeVinted(parPage) {
    // (0.6.119) Le jeton d'accès Vinted vit 1 h : un 401 le fait renouveler
    // comme la page (POST /web/api/auth/refresh), puis la lecture est refaite UNE fois.
    const renouveler = async () => { try { const x = await fetch("/web/api/auth/refresh", { method: "POST", credentials: "include", headers: { Accept: "application/json" } }); return x.ok; } catch { return false; } };
    const lire = () => fetch(`/api/v2/inbox?page=1&per_page=${parPage}`, {
      credentials: "include", headers: { Accept: "application/json" }, cache: "no-store",
    }).catch(() => null);
    let r = await lire();
    let requetes = 1;
    if (r && r.status === 401 && (await renouveler())) { r = await lire(); requetes = 2; }
    if (!r) return { ok: false, motif: "reseau", requetes };
    const t = await r.text().catch(() => "");
    const bot = /datadome|captcha-delivery|geo\.captcha|Are you a human/i.test(t.slice(0, 5000));
    if (r.status !== 200 || !t.trim().startsWith("{")) return { ok: false, http: r.status, bot, motif: `http_${r.status}`, requetes };
    let j = null;
    try { j = JSON.parse(t); } catch { return { ok: false, http: 200, motif: "json", requetes }; }
    const conversations = (Array.isArray(j?.conversations) ? j.conversations : []).map((c) => ({
      id: c?.id ?? null, unread: c?.unread === true, updated_at: c?.updated_at ?? null,
      description: c?.description ?? null,
      opposite_user: c?.opposite_user ? { id: c.opposite_user.id ?? null, login: c.opposite_user.login ?? null } : null,
      photo: Array.isArray(c?.item_photos) && c.item_photos[0] ? (c.item_photos[0].url ?? null) : null,
    }));
    return { ok: true, http: 200, conversations, requetes };
  }

  // Vinted : le détail de quelques conversations (1 appel chacune, pause humaine).
  async function lecteurDetailsVinted(refs) {
    const renouveler = async () => { try { const x = await fetch("/web/api/auth/refresh", { method: "POST", credentials: "include", headers: { Accept: "application/json" } }); return x.ok; } catch { return false; } };
    const details = {}; let requetes = 0; let renouvele = false;
    for (const ref of refs) {
      await new Promise((ok) => setTimeout(ok, 1200 + Math.random() * 1400));
      requetes++;
      const lire = () => fetch(`/api/v2/conversations/${encodeURIComponent(ref)}`, {
        credentials: "include", headers: { Accept: "application/json" }, cache: "no-store",
      }).catch(() => null);
      let r = await lire();
      if (r && r.status === 401 && !renouvele) { renouvele = true; if (await renouveler()) { r = await lire(); requetes++; } }
      if (!r) continue;
      if (r.status === 403 || r.status === 429) return { ok: false, http: r.status, motif: `http_${r.status}`, details, requetes };
      const t = await r.text().catch(() => "");
      if (r.status !== 200 || !t.trim().startsWith("{")) continue;
      let c = null;
      try { c = JSON.parse(t)?.conversation; } catch { continue; }
      if (!c) continue;
      const tr = c.transaction ?? null;
      details[String(ref)] = {
        allow_reply: c.allow_reply,
        opposite_user: c.opposite_user ? { id: c.opposite_user.id ?? null, login: c.opposite_user.login ?? null, is_system: c.opposite_user.is_system === true } : null,
        transaction: tr ? {
          id: tr.id ?? null, status: tr.status ?? null, item_id: tr.item_id ?? null,
          item_ids: Array.isArray(tr.item_ids) ? tr.item_ids : [], item_title: tr.item_title ?? null,
          is_bundle: tr.is_bundle === true, current_user_side: tr.current_user_side ?? null,
          offer_price: tr.offer_price ? { amount: tr.offer_price.amount ?? null, currency_code: tr.offer_price.currency_code ?? null } : null,
          shipment_id: tr.shipment_id ?? null, shipment_status: tr.shipment_status ?? null,
        } : null,
        messages: (Array.isArray(c.messages) ? c.messages : []).map((m) => {
          const e = m?.entity ?? {};
          return {
            entity_type: m?.entity_type ?? null, event_type: m?.event_type ?? null, created_at_ts: m?.created_at_ts ?? null,
            entity: {
              id: e.id ?? null, user_id: e.user_id ?? null, body: e.body ?? null, is_hidden: e.is_hidden === true,
              title: e.title ?? null, status_title: e.status_title ?? null, offer_request_id: e.offer_request_id ?? null,
              price: e.price ? { amount: e.price.amount ?? null, currency_code: e.price.currency_code ?? null } : null,
            },
          };
        }),
      };
    }
    return { ok: true, details, requetes };
  }

  // Vinted : les commandes EN COURS (+ celles qu'on suit encore), détaillées.
  async function lecteurCommandesVinted(suivies, detailsMax) {
    const renouveler = async () => { try { const x = await fetch("/web/api/auth/refresh", { method: "POST", credentials: "include", headers: { Accept: "application/json" } }); return x.ok; } catch { return false; } };
    let requetes = 1;
    const lireListe = () => fetch("/api/v2/my_orders?type=sold&status=in_progress&page=1&per_page=20", {
      credentials: "include", headers: { Accept: "application/json" }, cache: "no-store",
    }).catch(() => null);
    let r = await lireListe();
    if (r && r.status === 401 && (await renouveler())) { r = await lireListe(); requetes++; }
    if (!r) return { ok: false, motif: "reseau", requetes };
    const t = await r.text().catch(() => "");
    const bot = /datadome|captcha-delivery|geo\.captcha|Are you a human/i.test(t.slice(0, 5000));
    if (r.status !== 200 || !t.trim().startsWith("{")) return { ok: false, http: r.status, bot, motif: `http_${r.status}`, requetes };
    let j = null;
    try { j = JSON.parse(t); } catch { return { ok: false, http: 200, motif: "json", requetes }; }
    const enCours = (Array.isArray(j?.my_orders) ? j.my_orders : []).map((o) => ({
      transaction_id: o?.transaction_id ?? null, title: o?.title ?? null,
      price: o?.price ? { amount: o.price.amount ?? null, currency_code: o.price.currency_code ?? null } : null,
      date: o?.date ?? null, photo_url: o?.photo_url ?? null, transaction_user_status: o?.transaction_user_status ?? null,
    })).filter((o) => o.transaction_id != null);
    const vus = new Set(enCours.map((o) => String(o.transaction_id)));
    const aLire = [...enCours, ...(suivies ?? []).filter((ref) => !vus.has(String(ref))).map((ref) => ({ transaction_id: ref, suivie: true }))];
    for (const o of aLire.slice(0, detailsMax)) {
      await new Promise((ok) => setTimeout(ok, 1200 + Math.random() * 1400));
      requetes++;
      const rd = await fetch(`/api/v2/transactions/${encodeURIComponent(o.transaction_id)}`, {
        credentials: "include", headers: { Accept: "application/json" }, cache: "no-store",
      }).catch(() => null);
      if (!rd) continue;
      if (rd.status === 403 || rd.status === 429) return { ok: false, http: rd.status, motif: `http_${rd.status}`, requetes };
      const td = await rd.text().catch(() => "");
      if (rd.status !== 200 || !td.trim().startsWith("{")) continue;
      let tr = null;
      try { tr = JSON.parse(td)?.transaction; } catch { continue; }
      if (!tr) continue;
      if (o.suivie) {
        o.title = tr.item_title ?? tr.title ?? null;
        o.transaction_user_status = tr.status === 450 ? "completed" : null;
      }
      o.detail = {
        status: tr.status ?? null, item_id: tr.item_id ?? null,
        item_ids: Array.isArray(tr?.order?.item_ids) ? tr.order.item_ids : [],
        buyer_login: tr?.buyer?.login ?? null,
        shipment: tr.shipment ? { id: tr.shipment.id ?? null, status: tr.shipment.status ?? null } : null,
        thread_id: tr?.order?.user_msg_thread_id ?? null,
        offer_price: tr?.offer?.price ? { amount: tr.offer.price.amount ?? tr.offer.price, currency_code: tr.offer.currency ?? null } : null,
        debit_processed_at: tr.debit_processed_at ?? null,
      };
    }
    return { ok: true, http: 200, commandes: aLire.filter((o) => !o.suivie || o.detail), requetes };
  }

  // Leboncoin : la liste (1 page, 50 conversations), jeton de la page.
  async function lecteurListeLeboncoin() {
    const tok = localStorage.getItem("luat");
    if (!tok) return { ok: false, motif: "jeton_absent", requetes: 0 };
    const r = await fetch("https://api.leboncoin.fr/api/messaging-items-api/v3/conversations", {
      headers: { authorization: `Bearer ${tok}`, accept: "application/json" },
    }).catch(() => null);
    if (!r) return { ok: false, motif: "reseau", requetes: 1 };
    const t = await r.text().catch(() => "");
    const bot = /datadome|captcha-delivery|geo\.captcha/i.test(t.slice(0, 5000));
    if (r.status !== 200) return { ok: false, http: r.status, bot, motif: `http_${r.status}`, requetes: 1 };
    let j = null;
    try { j = JSON.parse(t); } catch { return { ok: false, http: 200, motif: "json", requetes: 1 }; }
    const conversations = (Array.isArray(j?.conversations) ? j.conversations : []).map((c) => ({
      conversation_id: c?.conversation_id ?? null,
      item: c?.item ? { id: c.item.id ?? null, type: c.item.type ?? null, subject: c.item.subject ?? null,
        image: c.item.image ?? null, owner_id: c.item.owner_id ?? null, owner_type: c.item.owner_type ?? null } : null,
      partners: (Array.isArray(c?.partners) ? c.partners : []).slice(0, 1).map((p) => ({ id: p?.id ?? null, name: p?.name ?? null })),
      unseen_counter: c?.unseen_counter ?? 0, policies: Array.isArray(c?.policies) ? c.policies : [],
      last_message_sent_at: c?.last_message_sent_at ?? null, last_message_preview: c?.last_message_preview ?? null,
    }));
    return { ok: true, http: 200, moi: j?.metadata?.current_user ?? null, conversations, requetes: 1 };
  }

  async function lecteurDetailsLeboncoin(moi, refs) {
    const tok = localStorage.getItem("luat");
    if (!tok || !moi) return { ok: false, motif: "jeton_absent", requetes: 0 };
    const details = {}; let requetes = 0;
    for (const ref of refs) {
      await new Promise((ok) => setTimeout(ok, 1300 + Math.random() * 1500));
      requetes++;
      const r = await fetch(`https://api.leboncoin.fr/messaging/proxy/api/v1/hal/${encodeURIComponent(moi)}/conversations/${encodeURIComponent(ref)}/messages?expanded=true&order=asc`, {
        headers: { authorization: `Bearer ${tok}`, accept: "application/hal+json" },
      }).catch(() => null);
      if (!r) continue;
      if (r.status === 403 || r.status === 429) return { ok: false, http: r.status, motif: `http_${r.status}`, details, requetes };
      if (r.status !== 200) continue;
      const j = await r.json().catch(() => null);
      const msgs = Array.isArray(j?._embedded?.messages) ? j._embedded.messages : [];
      details[String(ref)] = msgs.map((m) => ({
        id: m?.id ?? null, type: m?.type ?? null, text: m?.text ?? null, outgoing: m?.outgoing === true,
        sentAt: m?.sentAt ?? null, date: m?.date ?? null,
        typeAttributes: { subType: m?.typeAttributes?.subType ?? null, scope: m?.typeAttributes?.scope ?? null },
      }));
    }
    return { ok: true, details, requetes };
  }

  // Leboncoin : la première page des ventes ; détail (machine d'états) des
  // ventes en cours et de celles qu'on suit encore.
  async function lecteurCommandesLeboncoin(suivies, detailsMax) {
    const tok = localStorage.getItem("luat");
    if (!tok) return { ok: false, motif: "jeton_absent", requetes: 0 };
    const H = { authorization: `Bearer ${tok}`, accept: "application/json" };
    let requetes = 1;
    const u = "https://api.leboncoin.fr/api/consumergoods/proxy/v3/pages/transactions"
      + `?created_at%5Blt%5D=${encodeURIComponent(new Date().toISOString())}&limit=20&user_kind=seller`;
    const r = await fetch(u, { headers: H }).catch(() => null);
    if (!r) return { ok: false, motif: "reseau", requetes };
    const t = await r.text().catch(() => "");
    const bot = /datadome|captcha-delivery|geo\.captcha/i.test(t.slice(0, 5000));
    if (r.status !== 200) return { ok: false, http: r.status, bot, motif: `http_${r.status}`, requetes };
    let lot = null;
    try { lot = JSON.parse(t); } catch { return { ok: false, http: 200, motif: "json", requetes }; }
    const suiviesSet = new Set((suivies ?? []).map(String));
    const commandes = (Array.isArray(lot) ? lot : []).map((x) => ({
      purchase_id: x?.id?.purchase_id ?? null, step: x?.step ?? null, created_at: x?.created_at ?? null,
      title: x?.item?.title ?? null, thumbnail: x?.item?.thumbnail_url ?? null, price: x?.price ?? null,
      user_name: x?.user_name ?? null,
    })).filter((c) => c.purchase_id != null && (c.step === "in_progress" || suiviesSet.has(String(c.purchase_id))));
    for (const c of commandes.slice(0, detailsMax)) {
      await new Promise((ok) => setTimeout(ok, 1300 + Math.random() * 1500));
      requetes++;
      const rd = await fetch(`https://api.leboncoin.fr/api/consumergoods/purchase/v2/purchases/${encodeURIComponent(c.purchase_id)}`, { headers: H }).catch(() => null);
      if (!rd) continue;
      if (rd.status === 403 || rd.status === 429) return { ok: false, http: rd.status, motif: `http_${rd.status}`, requetes };
      if (rd.status !== 200) continue;
      const d = await rd.json().catch(() => null);
      if (!d) continue;
      c.detail = {
        item_id: d?.item?.id ?? null,
        statut: d?.fsm?.current_state?.status ?? null,
        evenements: (Array.isArray(d?.fsm?.states_history) ? d.fsm.states_history : [])
          .map((s) => s?.event?.name ?? s?.event?.type ?? null).filter(Boolean),
        parcel_id: d?.metadata?.parcelID ?? null,
        shipping_type: d?.metadata?.parcelShippingType ?? null,
      };
    }
    return { ok: true, http: 200, commandes, requetes };
  }

  // Depop : la liste (24), jeton du cookie access_token envoyé en Bearer —
  // exactement ce que fait le site (credentials « omit » : sans cela, CORS).
  // (0.6.117) Une lecture qui échoue « réseau » (Failed to fetch : mesuré par
  // intermittence le 09/10, cf. depopJson de content-scripts/depop.js) est
  // reprise deux fois (1 s, puis 2,5 s) ; une RÉPONSE (401, 404, 429…) se lit.
  async function lecteurListeDepop() {
    const m = String(document.cookie ?? "").match(/(?:^|;\s*)access_token=([^;]+)/);
    if (!m) return { ok: false, motif: "jeton_absent", requetes: 0 };
    let tok = m[1]; try { tok = decodeURIComponent(m[1]); } catch { /* tel quel */ }
    let r = null; let requetes = 0;
    for (const attente of [0, 1000, 2500]) {
      if (attente) await new Promise((ok) => setTimeout(ok, attente));
      requetes++;
      r = await fetch("https://webapi.depop.com/presentation/api/v1/conversations/?limit=24&unreadOnly=false", {
        method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${tok}` }, credentials: "omit", cache: "no-store",
      }).catch(() => null);
      if (r) break;
    }
    if (!r) return { ok: false, motif: "reseau", requetes };
    if (r.status !== 200) return { ok: false, http: r.status, motif: `http_${r.status}`, requetes };
    const j = await r.json().catch(() => null);
    const conversations = (Array.isArray(j?.objects) ? j.objects : []).map((c) => ({
      conversation_id: c?.conversation_id ?? null, last_message_text: c?.last_message_text ?? null,
      unread_count: c?.unread_count ?? 0, last_message_timestamp: c?.last_message_timestamp ?? null,
      read_only: c?.read_only === true, chat_meta_status: c?.chat_meta_status ?? null,
      users: (Array.isArray(c?.users) ? c.users : []).slice(0, 1).map((u) => ({ id: u?.id ?? null, username: u?.username ?? null })),
    }));
    return { ok: true, http: 200, conversations, requetes };
  }

  async function lecteurDetailsDepop(refs) {
    const m = String(document.cookie ?? "").match(/(?:^|;\s*)access_token=([^;]+)/);
    if (!m) return { ok: false, motif: "jeton_absent", requetes: 0 };
    let tok = m[1]; try { tok = decodeURIComponent(m[1]); } catch { /* tel quel */ }
    const details = {}; let requetes = 0;
    for (const ref of refs) {
      await new Promise((ok) => setTimeout(ok, 1200 + Math.random() * 1400));
      let r = null;
      for (const attente of [0, 1000, 2500]) {
        if (attente) await new Promise((ok) => setTimeout(ok, attente));
        requetes++;
        r = await fetch(`https://webapi.depop.com/presentation/api/v1/conversations/${encodeURIComponent(ref)}/messages/`, {
          method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${tok}` }, credentials: "omit", cache: "no-store",
        }).catch(() => null);
        if (r) break;
      }
      if (!r) continue;
      if (r.status === 403 || r.status === 429) return { ok: false, http: r.status, motif: `http_${r.status}`, details, requetes };
      if (r.status !== 200) continue;
      const j = await r.json().catch(() => null);
      details[String(ref)] = (Array.isArray(j?.objects) ? j.objects : []).map((x) => ({
        id: x?.id ?? null, user_id: x?.user_id ?? null, text: x?.text ?? null, created_timestamp: x?.created_timestamp ?? null,
      }));
    }
    return { ok: true, details, requetes };
  }

  // Depop : les ventes (« receipts », rôle vendeur), 1 page de 12 — l'appel
  // de la page « Sold » du site. Jeton du cookie en Bearer, comme la liste.
  async function lecteurCommandesDepop() {
    const m = String(document.cookie ?? "").match(/(?:^|;\s*)access_token=([^;]+)/);
    if (!m) return { ok: false, motif: "jeton_absent", requetes: 0 };
    let tok = m[1]; try { tok = decodeURIComponent(m[1]); } catch { /* tel quel */ }
    let r = null; let requetes = 0;
    for (const attente of [0, 1000, 2500]) {
      if (attente) await new Promise((ok) => setTimeout(ok, attente));
      requetes++;
      r = await fetch("https://webapi.depop.com/presentation/api/v1/receipts/?role=seller&limit=12", {
        method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${tok}` }, credentials: "omit", cache: "no-store",
      }).catch(() => null);
      if (r) break;
    }
    if (!r) return { ok: false, motif: "reseau", requetes };
    if (r.status !== 200) return { ok: false, http: r.status, motif: `http_${r.status}`, requetes };
    const j = await r.json().catch(() => null);
    if (!j || !Array.isArray(j.objects)) return { ok: false, http: 200, motif: "forme_inconnue", requetes };
    // Seuls les champs du contrat sortent de la page (jamais d'adresse).
    const garder = (o) => {
      if (!o || typeof o !== "object") return null;
      const p = {};
      for (const k of ["id", "receiptId", "receipt_id", "purchaseId", "purchase_id", "shippingStatus", "shipping_status", "status", "state",
        "shippingDeadline", "shipping_deadline", "shipBy", "ship_by", "trackingNumber", "tracking_number", "shipping_provider", "shippingProvider",
        "soldAt", "sold_at", "created_at", "createdAt", "date", "purchased_at", "currency"]) if (o[k] != null) p[k] = o[k];
      for (const k of ["total", "totalPrice", "total_price", "price", "amount", "pricing"]) {
        const v = o[k];
        if (v == null) continue;
        p[k] = typeof v === "object" ? { amount: v.amount ?? v.total ?? v.value ?? v.price_amount ?? v.priceAmount ?? null, currency: v.currency ?? v.currency_name ?? v.currencyName ?? null } : v;
      }
      if (o.buyer) p.buyer = { username: o.buyer.username ?? o.buyer.user_name ?? null };
      if (o.buyerUsername ?? o.buyer_username) p.buyer_username = o.buyerUsername ?? o.buyer_username;
      if (o.shipping) p.shipping = { provider: o.shipping.provider ?? null, provider_name: o.shipping.provider_name ?? null };
      for (const k of ["items", "products", "purchasedProducts", "purchased_products", "lineItems", "line_items"]) {
        if (!Array.isArray(o[k])) continue;
        p[k] = o[k].slice(0, 10).map((x) => {
          const q = x?.product ?? x ?? {};
          return { id: q.id ?? null, slug: q.slug ?? q.productSlug ?? q.product_slug ?? null, description: q.description ?? q.title ?? q.name ?? null,
            pictures: Array.isArray(q.pictures) ? q.pictures.slice(0, 1) : (Array.isArray(q.photos) ? q.photos.slice(0, 1) : (Array.isArray(q.images) ? q.images.slice(0, 1) : null)) };
        });
      }
      return p;
    };
    return { ok: true, http: 200, commandes: j.objects.map(garder).filter(Boolean), requetes };
  }

  // Beebs : la liste des conversations, HTML rendu par le serveur de
  // /fr/account/chats (relevé le 16/10 : <a href="/fr/account/chats/<id>">
  // [avatar] [ [nom] [date] ] [ [aperçu] [pastille de non-lus ?] ]).
  // Le téléphone vérifié est lu AVANT toute requête, dans le jeton de session
  // (identités Firebase) : sans lui, aucune requête — le mur est dit.
  async function lecteurListeBeebs() {
    const brut = String(document.cookie ?? "").split(/;\s*/).find((c) => c.startsWith("access_token="));
    if (!brut) return { ok: false, motif: "session_absente", mur: "connexion", requetes: 0 };
    let tok = brut.slice("access_token=".length);
    try { tok = decodeURIComponent(tok); } catch { /* jeton brut */ }
    let charge = null;
    try {
      const b = String(tok.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
      const octets = Uint8Array.from(atob(b + "=".repeat((4 - (b.length % 4)) % 4)), (x) => x.charCodeAt(0));
      charge = JSON.parse(new TextDecoder().decode(octets));
    } catch { charge = null; }
    const moi = charge ? (String(charge.user_id ?? charge.sub ?? "").trim() || null) : null;
    const ids = charge?.firebase?.identities ?? null;
    const telephone = Boolean(charge?.phone_number) || (Array.isArray(ids?.phone) && ids.phone.length > 0);
    if (charge && !telephone) return { ok: false, motif: "telephone_non_verifie", mur: "telephone", requetes: 0, moi };
    const r = await fetch("/fr/account/chats", { credentials: "include", headers: { Accept: "text/html" }, cache: "no-store" }).catch(() => null);
    if (!r) return { ok: false, motif: "reseau", requetes: 1 };
    let finale = "";
    try { finale = new URL(r.url).pathname; } catch { finale = ""; }
    if (/phone-verification/.test(finale)) return { ok: false, motif: "telephone_non_verifie", mur: "telephone", requetes: 1, moi };
    if (/\/(login|signin|sign-in|connexion|auth)\b/.test(finale)) return { ok: false, motif: "session_absente", mur: "connexion", requetes: 1 };
    const html = await r.text().catch(() => "");
    // Toute page Beebs charge DataDome : seul un DÉFI (petite page captcha) est un mur.
    const defi = /captcha-delivery\.com|geo\.captcha/i.test(html) && html.length < 60000;
    if (r.status === 403 || r.status === 429 || defi) return { ok: false, http: r.status, bot: true, motif: defi ? "captcha" : `http_${r.status}`, requetes: 1 };
    if (r.status !== 200) return { ok: false, http: r.status, motif: `http_${r.status}`, requetes: 1 };
    const doc = new DOMParser().parseFromString(html, "text/html");
    const vus = new Set();
    const conversations = [];
    for (const a of doc.querySelectorAll('a[href*="/account/chats/"]')) {
      const m = String(a.getAttribute("href") ?? "").match(/\/account\/chats\/([A-Za-z0-9_-]{6,80})/);
      if (!m || vus.has(m[1])) continue;
      vus.add(m[1]);
      const corps = a.children[a.children.length - 1] ?? null;
      const l1 = corps?.children?.[0] ?? null;
      const l2 = corps?.children?.[1] ?? null;
      const texte = (el) => String(el?.textContent ?? "").replace(/\s+/g, " ").trim() || null;
      const pastille = l2 && l2.children.length > 1 ? texte(l2.children[l2.children.length - 1]) : null;
      conversations.push({
        chat_id: m[1],
        nom: texte(l1?.children?.[0]),
        date_texte: texte(l1?.children?.[1]),
        apercu: texte(l2?.children?.[0]),
        non_lus: l2 && l2.children.length > 1 ? (Number.parseInt(pastille ?? "", 10) || 1) : 0,
      });
    }
    return { ok: true, http: 200, moi, conversations, requetes: 1 };
  }

  // Beebs : le détail d'une conversation = le flux RSC de sa page (ce que le
  // site charge en l'ouvrant). Ne sortent que : l'identifiant de
  // l'interlocuteur, « bloqué », et les messages (jamais prénom ni nom).
  async function lecteurDetailsBeebs(refs) {
    const details = {}; let requetes = 0;
    for (const ref of refs) {
      await new Promise((ok) => setTimeout(ok, 1200 + Math.random() * 1400));
      requetes++;
      const r = await fetch(`/fr/account/chats/${encodeURIComponent(ref)}`, {
        credentials: "include", headers: { RSC: "1", Accept: "*/*" }, cache: "no-store",
      }).catch(() => null);
      if (!r) continue;
      if (r.status === 403 || r.status === 429) return { ok: false, http: r.status, bot: true, motif: `http_${r.status}`, details, requetes };
      if (r.status !== 200) continue;
      const t = await r.text().catch(() => "");
      const out = { interlocuteur: null, destinataire: null, bloque: null, messages: [] };
      const vusMsg = new Set();
      const marcher = (v, profondeur) => {
        if (!v || typeof v !== "object" || profondeur > 60) return;
        if (!Array.isArray(v)) {
          const msg = v.message;
          if (msg && typeof msg === "object" && msg.id != null && msg.chat_id != null && "from_user_id" in msg) {
            if (String(msg.chat_id) === String(ref) && !vusMsg.has(String(msg.id))) {
              vusMsg.add(String(msg.id));
              out.messages.push({ id: String(msg.id), created_at: msg.created_at ?? null, text: msg.text ?? null,
                attachment: msg.attachment ? true : false, from_user_id: msg.from_user_id ?? null,
                is_from_admin: msg.is_from_admin === true, sentByMe: v.sentByMe === true });
            }
          } else if (typeof v.chatId === "string" && String(v.chatId) === String(ref)) {
            if (v.userId != null && ("firstName" in v || "userImage" in v)) out.interlocuteur = { id: String(v.userId), bloque_par_moi: v.blockedByMe === true };
            if (v.toUserId != null && "blocked" in v) { out.destinataire = String(v.toUserId); out.bloque = v.blocked === true; }
          }
        }
        for (const x of Object.values(v)) marcher(x, profondeur + 1);
      };
      for (const ligne of t.split("\n")) {
        const i = ligne.indexOf(":");
        if (i < 0) continue;
        const reste = ligne.slice(i + 1);
        if (!/^[[{]/.test(reste)) continue;
        try { marcher(JSON.parse(reste), 0); } catch { /* ligne d'une autre forme */ }
      }
      details[String(ref)] = out;
    }
    return { ok: true, details, requetes };
  }

  // Beebs : les ventes. La page « Ventes » (flux RSC) porte les liens des
  // commandes ; la page d'une commande porte l'objet commande passé à la page
  // (status, products, buyer, seller…). Aucune vente sur aucun compte le 16/10 :
  // un objet introuvable n'écrit RIEN (motif rendu).
  async function lecteurCommandesBeebs(suivies, detailsMax) {
    let requetes = 1;
    const r = await fetch("/fr/account/orders/list/seller", { credentials: "include", headers: { RSC: "1", Accept: "*/*" }, cache: "no-store" }).catch(() => null);
    if (!r) return { ok: false, motif: "reseau", requetes };
    if (r.status === 403 || r.status === 429) return { ok: false, http: r.status, bot: true, motif: `http_${r.status}`, requetes };
    if (r.status !== 200) return { ok: false, http: r.status, motif: `http_${r.status}`, requetes };
    const t = await r.text().catch(() => "");
    const ids = [];
    // Un numéro de commande porte au moins un chiffre (jamais « list », « history »…).
    for (const m of t.matchAll(/\/account\/orders\/(?!list\b|history\b|buyer\b|seller\b)((?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{6,80})/g)) if (!ids.includes(m[1])) ids.push(m[1]);
    for (const s of suivies ?? []) if (!ids.includes(String(s))) ids.push(String(s));
    const commandes = [];
    let illisibles = 0;
    for (const id of ids.slice(0, detailsMax)) {
      await new Promise((ok) => setTimeout(ok, 1200 + Math.random() * 1400));
      requetes++;
      const rd = await fetch(`/fr/account/orders/${encodeURIComponent(id)}`, { credentials: "include", headers: { RSC: "1", Accept: "*/*" }, cache: "no-store" }).catch(() => null);
      if (!rd) continue;
      if (rd.status === 403 || rd.status === 429) return { ok: false, http: rd.status, bot: true, motif: `http_${rd.status}`, requetes };
      if (rd.status !== 200) continue;
      const td = await rd.text().catch(() => "");
      let trouve = null;
      const marcher = (v, profondeur) => {
        if (trouve || !v || typeof v !== "object" || profondeur > 60) return;
        if (!Array.isArray(v) && typeof v.status === "string" && Array.isArray(v.products) && (v.buyer || v.seller)
            && String(v.id ?? id) === String(id)) { trouve = v; return; }
        for (const x of Object.values(v)) marcher(x, profondeur + 1);
      };
      for (const ligne of td.split("\n")) {
        const i = ligne.indexOf(":");
        if (i < 0) continue;
        const reste = ligne.slice(i + 1);
        if (!/^[[{]/.test(reste)) continue;
        try { marcher(JSON.parse(reste), 0); } catch { /* ligne d'une autre forme */ }
        if (trouve) break;
      }
      if (!trouve) { illisibles++; continue; }
      const o = trouve;
      // Seuls les champs du contrat sortent de la page (jamais d'adresse, de téléphone).
      commandes.push({ id, order: {
        id: o.id ?? id, status: o.status, status_updated_at: o.status_updated_at ?? o.updated_at ?? null,
        created_at: o.created_at ?? null, carrier_id: o.carrier_id ?? null, carrier_name: o.carrier?.name ?? o.carrier_name ?? null,
        total_price: o.total_price ?? o.totalPrice ?? o.total ?? o.price ?? null,
        buyer: o.buyer ? { first_name: o.buyer.first_name ?? o.buyer.firstName ?? null, last_name: o.buyer.last_name ?? o.buyer.lastName ?? null } : null,
        shipping: o.shipping ? { tracking_number: o.shipping.tracking_number ?? null, parcel_id: o.shipping.parcel_id ?? null } : null,
        products: (o.products ?? []).slice(0, 10).map((p) => ({ id: p?.id ?? p?.product_id ?? null, title: p?.title ?? p?.name ?? null,
          price: p?.price ?? null, image: p?.image ?? (Array.isArray(p?.images) ? p.images[0] : null) ?? p?.thumbnail ?? null })),
      } });
    }
    return { ok: true, http: 200, commandes, requetes, illisibles };
  }

  const LECTEURS = Object.freeze({
    vinted: { liste: lecteurListeVinted, details: lecteurDetailsVinted, commandes: lecteurCommandesVinted },
    leboncoin: { liste: lecteurListeLeboncoin, details: lecteurDetailsLeboncoin, commandes: lecteurCommandesLeboncoin },
    depop: { liste: lecteurListeDepop, details: lecteurDetailsDepop, commandes: lecteurCommandesDepop },
    beebs: { liste: lecteurListeBeebs, details: lecteurDetailsBeebs, commandes: lecteurCommandesBeebs },
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 6. ENVOYEURS DE PAGE — UNE réponse, après la double vérification de la
  //    liste blanche. AUTONOMES. Rendent { ok, http, messageRef?, motif? }.
  // ═════════════════════════════════════════════════════════════════════════
  async function envoyeurVinted(r) {
    let csrf = null;
    for (const s of document.querySelectorAll("script")) {
      const m = (s.textContent || "").match(/\\?"csrf[_-]?token\\?"\s*:\s*\\?"([^"\\]+)\\?"/i);
      if (m) { csrf = m[1]; break; }
    }
    const anon = (document.cookie.split("; ").find((x) => x.indexOf("anon_id=") === 0) || "").split("=").slice(1).join("=") || null;
    if (!csrf) return { ok: false, motif: "csrf_absent" };
    // (0.6.119) Un 401 (jeton d'accès d'une heure expiré) = réponse REFUSÉE avant
    // tout traitement : le jeton est renouvelé comme la page, puis UNE seconde
    // tentative — jamais plus, et jamais après une autre erreur (un doublon chez
    // l'acheteur est pire qu'un raté).
    const renouveler = async () => { try { const x = await fetch("/web/api/auth/refresh", { method: "POST", credentials: "include", headers: { Accept: "application/json" } }); return x.ok; } catch { return false; } };
    const poster = () => fetch(`/api/v2/conversations/${encodeURIComponent(r.conversationRef)}/replies`, {
      method: "POST", credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": csrf, ...(anon ? { "X-Anon-Id": anon } : {}) },
      body: JSON.stringify({ reply: { body: r.texte, photo_temp_uuids: [], is_personal_data_sharing_check_skipped: false } }),
    }).catch(() => null);
    let res = await poster();
    if (res && res.status === 401 && (await renouveler())) res = await poster();
    if (!res) return { ok: false, motif: "reseau" };
    const j = await res.json().catch(() => null);
    const dernier = Array.isArray(j?.conversation?.messages) ? j.conversation.messages[j.conversation.messages.length - 1] : null;
    return { ok: res.status >= 200 && res.status < 300, http: res.status, messageRef: dernier?.entity?.id != null ? `m${dernier.entity.id}` : null,
      motif: res.status >= 300 ? `http_${res.status}` : null, bot: res.status === 403 || res.status === 429 };
  }

  async function envoyeurLeboncoin(r) {
    const tok = localStorage.getItem("luat");
    if (!tok || !r.moi) return { ok: false, motif: "jeton_absent" };
    const cle = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const res = await fetch(`https://api.leboncoin.fr/messaging/proxy/api/v1/hal/${encodeURIComponent(r.moi)}/conversations/${encodeURIComponent(r.conversationRef)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, Accept: "application/hal+json", "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId: cle, text: r.texte, attachments: [] }),
    }).catch(() => null);
    if (!res) return { ok: false, motif: "reseau" };
    const j = await res.json().catch(() => null);
    return { ok: res.status >= 200 && res.status < 300, http: res.status, messageRef: j?.id ?? null,
      motif: res.status >= 300 ? `http_${res.status}` : null, bot: res.status === 403 || res.status === 429 };
  }

  async function envoyeurDepop(r) {
    const m = String(document.cookie ?? "").match(/(?:^|;\s*)access_token=([^;]+)/);
    if (!m) return { ok: false, motif: "jeton_absent" };
    let tok = m[1]; try { tok = decodeURIComponent(m[1]); } catch { /* tel quel */ }
    if (!r.interlocuteurRef) return { ok: false, motif: "destinataire_inconnu" };
    const res = await fetch("https://webapi.depop.com/presentation/api/v1/conversations/messages/", {
      method: "POST", credentials: "omit",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ user_id: Number(r.interlocuteurRef) || r.interlocuteurRef, text: r.texte,
        product_id: r.annonceRef ? (Number(r.annonceRef) || r.annonceRef) : undefined,
        idempotency_key: crypto?.randomUUID?.() ?? `${Date.now()}` }),
    }).catch(() => null);
    if (!res) return { ok: false, motif: "reseau" };
    const j = await res.json().catch(() => null);
    return { ok: res.status >= 200 && res.status < 300, http: res.status, messageRef: j?.id ?? null,
      motif: res.status >= 300 ? `http_${res.status}` : null, bot: res.status === 403 || res.status === 429 };
  }

  // Beebs (code du site, createChatMessage) : POST https://api.beebs.app/chats/v3
  // {to_user_id, text}, en-tête `authorization` = le jeton Firebase BRUT (pas
  // « Bearer »). Sans téléphone vérifié dans le jeton : rien ne part.
  async function envoyeurBeebs(r) {
    const brut = String(document.cookie ?? "").split(/;\s*/).find((c) => c.startsWith("access_token="));
    if (!brut) return { ok: false, motif: "jeton_absent" };
    let tok = brut.slice("access_token=".length);
    try { tok = decodeURIComponent(tok); } catch { /* jeton brut */ }
    let charge = null;
    try {
      const b = String(tok.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
      charge = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b + "=".repeat((4 - (b.length % 4)) % 4)), (x) => x.charCodeAt(0))));
    } catch { charge = null; }
    const ids = charge?.firebase?.identities ?? null;
    if (charge && !(charge.phone_number || (Array.isArray(ids?.phone) && ids.phone.length))) return { ok: false, motif: "telephone_non_verifie" };
    if (!r.interlocuteurRef) return { ok: false, motif: "destinataire_inconnu" };
    const res = await fetch("https://api.beebs.app/chats/v3", {
      method: "POST",
      headers: { authorization: tok, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ to_user_id: r.interlocuteurRef, text: r.texte }),
    }).catch(() => null);
    if (!res) return { ok: false, motif: "reseau" };
    const j = await res.json().catch(() => null);
    const ok = res.status >= 200 && res.status < 300 && j?.success !== false;
    return { ok, http: res.status, messageRef: j?.data?.id != null ? String(j.data.id) : null,
      motif: ok ? null : `http_${res.status}`, bot: res.status === 403 || res.status === 429 };
  }

  const ENVOYEURS = Object.freeze({ vinted: envoyeurVinted, leboncoin: envoyeurLeboncoin, depop: envoyeurDepop, beebs: envoyeurBeebs });

  // ═════════════════════════════════════════════════════════════════════════
  // 7. LE CHEMIN DU BORDEREAU — la dernière marche seulement sur demande (clic).
  //    AUTONOMES. Sans `derniereMarche: true`, aucune requête vers le fichier
  //    d'étiquette ne part (selftest : un fetch espion le prouve).
  // ═════════════════════════════════════════════════════════════════════════
  // Vinted (code du site, 16/10) : l'étiquette existe quand l'envoi est en
  // 220/230/250 ; sinon le bouton « get_shipping_label » de la conversation
  // ouvre la commande de l'étiquette (PUT transactions/<id>/shipment/order :
  // choix du dépôt, de la date d'enlèvement, papier/numérique — c'est un
  // geste qui ENGAGE, jamais fait ici). Fichier : GET transactions/<id>/
  // shipment/pdf_label → {file:{label (base64), filename}} ; QR :
  // …/digital_label ; Vinted compte l'ouverture du bordereau.
  async function cheminBordereauVinted(p) {
    const etapes = [];
    const renouveler = async () => { try { const x = await fetch("/web/api/auth/refresh", { method: "POST", credentials: "include", headers: { Accept: "application/json" } }); return x.ok; } catch { return false; } };
    let renouvele = false;
    const lire = async (chemin) => {
      etapes.push(`GET ${chemin}`);
      let r = await fetch(chemin, { credentials: "include", headers: { Accept: "application/json" }, cache: "no-store" }).catch(() => null);
      if (r && r.status === 401 && !renouvele) {
        renouvele = true;
        if (await renouveler()) r = await fetch(chemin, { credentials: "include", headers: { Accept: "application/json" }, cache: "no-store" }).catch(() => null);
      }
      if (!r) return { http: 0, j: null };
      return { http: r.status, j: await r.json().catch(() => null) };
    };
    const t = await lire(`/api/v2/transactions/${encodeURIComponent(p.transactionId)}`);
    if (t.http === 403 || t.http === 429) return { ok: false, etape: "transaction", motif: `http_${t.http}`, bot: true, etapes };
    const statut = Number(t.j?.transaction?.shipment?.status);
    const envoi = t.j?.transaction?.shipment?.id ?? p.shipmentId ?? null;
    if (![220, 230, 250].includes(statut)) {
      return { ok: false, etape: "statut", motif: statut < 220 ? "bordereau_a_obtenir_sur_vinted" : "bordereau_sans_objet", statut, etapes };
    }
    const options = envoi ? await lire(`/api/v2/shipments/${encodeURIComponent(envoi)}/label_options`) : { http: 0, j: null };
    const derniere = p.numerique
      ? `/api/v2/transactions/${encodeURIComponent(p.transactionId)}/shipment/digital_label`
      : `/api/v2/transactions/${encodeURIComponent(p.transactionId)}/shipment/pdf_label`;
    if (p.derniereMarche !== true) {
      return { ok: false, etape: "derniere_marche", motif: "fermee", prepare: { url: derniere, options_http: options.http }, etapes };
    }
    const f = await lire(derniere);
    const label = f.j?.file?.label ?? null;
    if (label) return { ok: true, base64: label, nom: f.j?.file?.filename ?? "bordereau.pdf", etapes };
    if (f.http === 403 || f.http === 429) return { ok: false, etape: "fichier", motif: `http_${f.http}`, bot: true, etapes };
    // (16/10 soir) Pas de bordereau papier : certains transporteurs n'ont qu'un
    // code (digital_label) — demandé UNE fois, jamais plus. Forme à prouver à
    // la première vraie commande.
    if (!p.numerique) {
      const q = await lire(`/api/v2/transactions/${encodeURIComponent(p.transactionId)}/shipment/digital_label`);
      const code = q.j?.file?.label ?? q.j?.digital_label?.label ?? null;
      if (code) return { ok: true, base64: code, nom: q.j?.file?.filename ?? "bordereau-code.png", numerique: true, etapes };
      return { ok: false, etape: "fichier", motif: `http_${f.http}_puis_${q.http}`, bot: q.http === 403 || q.http === 429, etapes };
    }
    return { ok: false, etape: "fichier", motif: `http_${f.http}`, etapes };
  }

  // Leboncoin (code du site + vente terminée de Nico, 16/10) : la vente doit
  // être « available » avec l'événement parcel-label-generated (la
  // disponibilité confirmée par le vendeur — POST …/purchases/<id>/
  // validate-availability, un geste qui ENGAGE, jamais fait ici). Puis GET
  // …/consumergoods/proxy/v1/pages/prepare-parcel/<id> → {parcel_id,
  // label_url, with_qrcode} ; fichier : GET label_url (jeton requis) —
  // 404 une fois la vente terminée (mesuré par l'audit du 24/09).
  async function cheminBordereauLeboncoin(p) {
    const tok = localStorage.getItem("luat");
    if (!tok) return { ok: false, etape: "jeton", motif: "jeton_absent", etapes: [] };
    const H = { authorization: `Bearer ${tok}`, accept: "application/json" };
    const etapes = [];
    const lire = async (url, accept) => {
      etapes.push(`GET ${url.replace(/^https:\/\/api\.leboncoin\.fr/, "")}`);
      const r = await fetch(url, { headers: accept ? { ...H, accept } : H }).catch(() => null);
      if (!r) return { http: 0, j: null, r: null };
      return { http: r.status, r, j: accept ? null : await r.json().catch(() => null) };
    };
    const a = await lire(`https://api.leboncoin.fr/api/consumergoods/purchase/v2/purchases/${encodeURIComponent(p.purchaseId)}`);
    if (a.http === 403 || a.http === 429) return { ok: false, etape: "achat", motif: `http_${a.http}`, bot: true, etapes };
    const statut = String(a.j?.fsm?.current_state?.status ?? "");
    const evts = (a.j?.fsm?.states_history ?? []).map((s) => s?.event?.name ?? "");
    if (statut !== "available" || !evts.some((e) => /parcel-(label|qrcode)-generated/.test(e))) {
      return { ok: false, etape: "statut", motif: statut === "reserved" ? "disponibilite_a_confirmer_sur_leboncoin" : "bordereau_pas_pret", statut, etapes };
    }
    const prep = await lire(`https://api.leboncoin.fr/api/consumergoods/proxy/v1/pages/prepare-parcel/${encodeURIComponent(p.purchaseId)}`);
    const url = prep.j?.label_url ?? prep.j?.parcel?.label_url ?? null;
    if (!url) return { ok: false, etape: "preparation", motif: `label_url_absent_http_${prep.http}`, etapes };
    if (p.derniereMarche !== true) {
      return { ok: false, etape: "derniere_marche", motif: "fermee", prepare: { url, qr: prep.j?.with_qrcode === true }, etapes };
    }
    const f = await lire(url, "application/pdf");
    if (!f.r || f.http !== 200) return { ok: false, etape: "fichier", motif: `http_${f.http}`, bot: f.http === 403 || f.http === 429, etapes };
    const buf = new Uint8Array(await f.r.arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { ok: true, base64: btoa(bin), nom: `bordereau-${p.purchaseId}.pdf`, etapes };
  }

  const CHEMINS_BORDEREAU = Object.freeze({ vinted: cheminBordereauVinted, leboncoin: cheminBordereauLeboncoin });

  g.FILLSELL_MESSAGERIE = Object.freeze({
    CADENCE_MS, ALEA_MS, DETAILS_MAX, COMMANDES_DETAILS_MAX, MESSAGES_PAR_CONVERSATION, RETENTION_MS,
    PLATEFORMES_EXTENSION, PLATEFORMES_COMMANDES, BORDEREAU_DERNIERE_MARCHE_OUVERTE,
    texteCourt, dateIso, recente, signeBlocage, aDetailler, REGLE_DETAIL, memoireDetails,
    articleUniqueVinted, normaliserVinted, normaliserMessageVinted, etatCommandeVinted, normaliserCommandesVinted,
    normaliserLeboncoin, normaliserMessageLeboncoin, etatCommandeLeboncoin, normaliserCommandesLeboncoin,
    normaliserDepop, etatCommandeDepop, normaliserCommandesDepop,
    BEEBS_ADMIN, dateBeebsListe, normaliserBeebs, etatCommandeBeebs, normaliserCommandesBeebs,
    NORMALISEURS, NORMALISEURS_COMMANDES,
    LECTEURS, ENVOYEURS, CHEMINS_BORDEREAU,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
