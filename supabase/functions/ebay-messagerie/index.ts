import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { appelEbay, lireEnvEbay, obtenirAccessToken, type EbayEnv } from "../_shared/ebay-oauth.ts";
import { appelTrading, blocs, erreurTrading, valeur } from "../_shared/ebay-trading-releve.ts";
import { commandesEbay, conversationsEbay, texteMessageEbay } from "../_shared/messagerie-ebay.js";

// ═══════════════════════════════════════════════════════════════════════════
// ebay-messagerie — BÊTA MESSAGERIE + COMMANDES eBAY (16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Chantier « messages + bordereaux » (docs/enquetes/messages-bordereaux-1610/
// RAPPORT.md). eBay se lit par l'API officielle, côté serveur, avec le jeton
// DÉJÀ consenti — aucun scope demandé en plus (commerce.message reste interdit
// par _shared/ebay-oauth.ts).
//
// Trois modes :
//   · verifier (secret de cron SEULEMENT) — ce que nos droits permettent, en
//     COMPTEURS et CODES : Trading GetMyMessages (résumé), GetMemberMessages
//     (nombre), Message API REST (refus attendu sans commerce.message),
//     Logistics API (étiquettes : refus attendu hors États-Unis). Aucun
//     contenu ne sort ;
//   · releve (cron : comptes bêta reliés ; JWT : le compte appelant s'il est
//     bêta) — les en-têtes des 30 derniers jours (reçus, envoyés), le texte de
//     10 messages au plus par passage, et les commandes à expédier
//     (getOrders NOT_STARTED|IN_PROGRESS) → messagerie_enregistrer,
//     commandes_enregistrer ;
//   · envoyer — UNE réponse en attente (messagerie_reponse_a_envoyer ; 16/10
//     nuit : comptes bêta sans liste blanche, mode relu à la prise), texte
//     EXACT (empreinte revérifiée avant l'envoi), par AddMemberMessageRTQ
//     (réponse à la question d'un acheteur).
//
// ⛔ Lire ≠ marquer lu : ReviseMyMessages n'est jamais appelé.
// ⛔ Aucun texte de message dans un journal ; la réponse HTTP ne porte que des
//    compteurs (relevé) ou des codes (vérification).
// Appelants : pg_cron (secret, vault) ET l'app (JWT) → déployer avec
// --no-verify-jwt ; garde maison à deux branches ci-dessous.
// ═══════════════════════════════════════════════════════════════════════════

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const JOURS = 30;
const CORPS_PAR_PASSAGE = 10;   // GetMyMessages ReturnMessages : 10 identifiants au plus par appel
const COMPTES_MAX = 20;

type Entete = {
  message_id: string; external_id: string | null; sender: string | null; recipient: string | null;
  send_to_name: string | null; subject: string | null; item_id: string | null; item_title: string | null;
  receive_date: string | null; read: boolean | null; folder_id: string; message_type: string | null;
  response_enabled: boolean; texte?: string | null;
};

function bornes() {
  const fin = new Date();
  const debut = new Date(fin.getTime() - JOURS * 86400_000);
  const f = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, ".000Z");
  return { debut: f(debut), fin: f(fin) };
}

function lireEntetes(xml: string, dossier: string): Entete[] {
  return blocs(xml, "Message").map((m) => ({
    message_id: valeur(m, "MessageID") ?? "",
    external_id: valeur(m, "ExternalMessageID"),
    sender: valeur(m, "Sender"),
    recipient: valeur(m, "RecipientUserID"),
    send_to_name: valeur(m, "SendToName"),
    subject: valeur(m, "Subject"),
    item_id: valeur(m, "ItemID"),
    item_title: valeur(m, "ItemTitle"),
    receive_date: valeur(m, "ReceiveDate"),
    read: valeur(m, "Read") === null ? null : valeur(m, "Read") === "true",
    folder_id: valeur(m, "FolderID") ?? dossier,
    message_type: valeur(m, "MessageType"),
    response_enabled: valeur(m, "ResponseEnabled") === "true",
  })).filter((e) => e.message_id);
}

async function entetesDossier(env: EbayEnv, token: string, dossier: "0" | "1") {
  const { debut, fin } = bornes();
  const r = await appelTrading(env, token, "GetMyMessages",
    `<DetailLevel>ReturnHeaders</DetailLevel><FolderID>${dossier}</FolderID><StartTime>${debut}</StartTime><EndTime>${fin}</EndTime>`);
  const err = erreurTrading(r.xml);
  return { http: r.http, erreur: err, entetes: err ? [] : lireEntetes(r.xml, dossier) };
}

async function corpsMessages(env: EbayEnv, token: string, ids: string[]) {
  if (!ids.length) return new Map<string, string | null>();
  const r = await appelTrading(env, token, "GetMyMessages",
    `<DetailLevel>ReturnMessages</DetailLevel><MessageIDs>${ids.map((i) => `<MessageID>${i.replace(/[^0-9A-Za-z_-]/g, "")}</MessageID>`).join("")}</MessageIDs>`);
  const out = new Map<string, string | null>();
  if (erreurTrading(r.xml)) return out;
  for (const m of blocs(r.xml, "Message")) {
    const id = valeur(m, "MessageID");
    if (id) out.set(id, texteMessageEbay(valeur(m, "Text"), valeur(m, "Content")));
  }
  return out;
}

// ── MODE VÉRIFIER : des codes, jamais un contenu ─────────────────────────────
async function verifier(admin: SupabaseClient, env: EbayEnv, userId: string) {
  const jeton = await obtenirAccessToken(admin, userId);
  if (!jeton.ok) return { compte: "illisible", motif: jeton.motif };
  const scopes = Array.isArray(jeton.compte?.scopes) ? (jeton.compte!.scopes as string[]).map((s) => s.replace("https://api.ebay.com/oauth/api_scope", "") || "api_scope") : null;
  const resultat: Record<string, unknown> = { scopes };

  const resume = await appelTrading(env, jeton.token, "GetMyMessages", "<DetailLevel>ReturnSummary</DetailLevel>");
  resultat.trading_getmymessages = {
    http: resume.http, ack: valeur(resume.xml, "Ack"), erreur: erreurTrading(resume.xml),
    total: Number(valeur(resume.xml, "TotalMessageCount") ?? NaN) || 0,
    nouveaux: Number(valeur(resume.xml, "NewMessageCount") ?? NaN) || 0,
  };
  const { debut, fin } = bornes();
  const mm = await appelTrading(env, jeton.token, "GetMemberMessages",
    `<MailMessageType>All</MailMessageType><StartCreationTime>${debut}</StartCreationTime><EndCreationTime>${fin}</EndCreationTime><Pagination><EntriesPerPage>25</EntriesPerPage><PageNumber>1</PageNumber></Pagination>`);
  resultat.trading_getmembermessages = {
    http: mm.http, ack: valeur(mm.xml, "Ack"), erreur: erreurTrading(mm.xml),
    echanges: blocs(mm.xml, "MemberMessageExchange").length,
  };
  const api = await appelEbay(env, jeton.token, "/commerce/message/v1/conversation?conversation_type=FROM_MEMBERS&limit=1");
  const apiErr = (api.json as { errors?: Array<{ errorId?: number; message?: string }> } | null)?.errors?.[0];
  resultat.message_api_rest = { http: api.http, errorId: apiErr?.errorId ?? null, message: apiErr?.message?.slice(0, 120) ?? null };
  const log = await appelEbay(env, jeton.token, "/sell/logistics/v1_beta/shipment/FILLSELL-VERIFICATION-0");
  const logErr = (log.json as { errors?: Array<{ errorId?: number; message?: string }> } | null)?.errors?.[0];
  resultat.logistics_api = { http: log.http, errorId: logErr?.errorId ?? null, message: logErr?.message?.slice(0, 120) ?? null };
  const cmd = await appelEbay(env, jeton.token, "/sell/fulfillment/v1/order?limit=1&filter=orderfulfillmentstatus:%7BNOT_STARTED%7CIN_PROGRESS%7D");
  resultat.commandes_a_expedier = { http: cmd.http, total: (cmd.json as { total?: number } | null)?.total ?? null };
  return resultat;
}

// ── MODE RELEVÉ ──────────────────────────────────────────────────────────────
async function relever(admin: SupabaseClient, env: EbayEnv, userId: string) {
  const { data: aut } = await admin.rpc("messagerie_releve_autorise", { p_platform: "ebay", p_user: userId });
  if (!(aut as { autorise?: boolean } | null)?.autorise) return { saute: (aut as { motif?: string } | null)?.motif ?? "autorisation_illisible" };
  const jeton = await obtenirAccessToken(admin, userId);
  if (!jeton.ok) return { saute: `jeton_${jeton.motif}` };

  const recus = await entetesDossier(env, jeton.token, "0");
  const envoyes = await entetesDossier(env, jeton.token, "1");
  if (recus.erreur && envoyes.erreur) {
    await admin.rpc("messagerie_enregistrer", { p_platform: "ebay", p_conversations: [], p_messages: [], p_etat: { motif: `trading_${String(recus.erreur).slice(0, 80)}` }, p_user: userId });
    return { erreur: "trading", detail: String(recus.erreur).slice(0, 120) };
  }
  const entetes = [...recus.entetes, ...envoyes.entetes];

  // Le texte : seulement des messages pas encore connus en base, 10 au plus.
  const { data: connus } = await admin.from("messagerie_messages")
    .select("message_ref, messagerie_conversations!inner(platform)")
    .eq("user_id", userId).eq("messagerie_conversations.platform", "ebay").limit(1000);
  const dejaLa = new Set((connus ?? []).map((m: { message_ref: string }) => String(m.message_ref)));
  const nouveaux = entetes.filter((e) => !dejaLa.has(String(e.external_id || e.message_id)))
    .sort((a, b) => Date.parse(b.receive_date ?? "") - Date.parse(a.receive_date ?? ""))
    .slice(0, CORPS_PAR_PASSAGE);
  const corps = await corpsMessages(env, jeton.token, nouveaux.map((e) => e.message_id));
  for (const e of entetes) if (corps.has(e.message_id)) e.texte = corps.get(e.message_id) ?? null;
  // Un message connu sans texte relu ce passage ne doit pas apparaître « sans texte » :
  // on ne l'envoie pas (la base le garde tel qu'il est).
  const aEnvoyer = entetes.filter((e) => corps.has(e.message_id) || !dejaLa.has(String(e.external_id || e.message_id)));
  const { conversations } = conversationsEbay(entetes);
  const { messages } = conversationsEbay(aEnvoyer);

  const { data: bilan, error } = await admin.rpc("messagerie_enregistrer", {
    p_platform: "ebay", p_conversations: conversations.slice(0, 60), p_messages: messages.slice(0, 300), p_etat: {}, p_user: userId,
  });
  if (error) return { erreur: "base", detail: error.message.slice(0, 160) };

  // Les commandes à expédier (NOT_STARTED | IN_PROGRESS), lecture seule.
  const r = await appelEbay(env, jeton.token, "/sell/fulfillment/v1/order?limit=50&filter=orderfulfillmentstatus:%7BNOT_STARTED%7CIN_PROGRESS%7D");
  let bilanCommandes: unknown = null;
  if (r.http === 200) {
    const orders = ((r.json as { orders?: Array<{ orderId?: string }> } | null)?.orders ?? []);
    // (v4, 16/10 soir) Une commande expédiée SORT de ce filtre : sans relecture,
    // elle restait « à expédier » dans FillSell. Les commandes suivies en base et
    // absentes de la liste sont relues par leur numéro (getOrders orderIds, 50 au plus).
    const vus = new Set(orders.map((o) => String(o?.orderId ?? "")));
    const { data: suivies } = await admin.from("plateforme_commandes").select("commande_ref")
      .eq("user_id", userId).eq("platform", "ebay").in("etat", ["a_confirmer", "a_expedier", "inconnu"]).limit(50);
    const aRelire = (suivies ?? []).map((s: { commande_ref: string }) => String(s.commande_ref))
      .filter((ref) => ref && !vus.has(ref) && /^[0-9A-Za-z-]{5,60}$/.test(ref));
    if (aRelire.length) {
      const rr = await appelEbay(env, jeton.token, `/sell/fulfillment/v1/order?orderIds=${aRelire.map(encodeURIComponent).join(",")}`);
      if (rr.http === 200) orders.push(...((rr.json as { orders?: Array<{ orderId?: string }> } | null)?.orders ?? []));
    }
    const lignes = commandesEbay(orders);
    if (lignes.length) {
      const { data } = await admin.rpc("commandes_enregistrer", { p_platform: "ebay", p_commandes: lignes.slice(0, 40), p_user: userId });
      bilanCommandes = { ...(data as Record<string, unknown> ?? {}), relues: aRelire.length };
    } else bilanCommandes = { aucune: true, relues: aRelire.length };
  } else bilanCommandes = { http: r.http };
  return { entetes: entetes.length, textes_lus: corps.size, bilan, commandes: bilanCommandes };
}

// ── MODE ENVOYER : UNE réponse, jamais plus ──────────────────────────────────
// (16/10 nuit) Comptes bêta sans liste blanche : c'est messagerie_reponse_a_
// envoyer qui dit oui à la prise (coin_config.messagerie_envoi_mode relu, une
// réponse à la fois, jamais renvoyée). Ici : l'empreinte SHA-256 du texte est
// recalculée et comparée à celle de la base AVANT l'envoi — le texte qui part
// est exactement celui saisi (l'échappement XML n'en change pas un caractère).
async function empreinteTexte(texte: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(texte ?? "")));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function envoyer(admin: SupabaseClient, env: EbayEnv, userId: string) {
  const { data: prise } = await admin.rpc("messagerie_reponse_a_envoyer", { p_platforms: ["ebay"], p_user: userId });
  const rep = (prise as { reponse?: Record<string, string> | null } | null)?.reponse;
  if (!rep?.id) return { reponse: null };
  const rendre = (ok: boolean, resultat: Record<string, unknown>) =>
    admin.rpc("messagerie_reponse_resultat", { p_id: rep.id, p_ok: ok, p_resultat: { ...resultat, executant: "serveur ebay-messagerie" }, p_user: userId });
  if (!rep.empreinte || (await empreinteTexte(rep.texte)) !== rep.empreinte) {
    await rendre(false, { motif: "empreinte_differente", empreinte_ok: false });
    return { envoyee: false, motif: "empreinte_differente" };
  }
  // La question à laquelle on répond : le dernier message REÇU de la conversation.
  const { data: conv } = await admin.from("messagerie_conversations").select("id, annonce_ref, interlocuteur_ref")
    .eq("user_id", userId).eq("platform", "ebay").eq("conversation_ref", rep.conversation_ref).maybeSingle();
  const { data: dernier } = await admin.from("messagerie_messages").select("message_ref")
    .eq("conversation_id", conv?.id ?? "").eq("sens", "recu").order("envoye_le", { ascending: false }).limit(1).maybeSingle();
  if (!conv?.annonce_ref || !conv?.interlocuteur_ref || !dernier?.message_ref) {
    await rendre(false, { motif: "question_introuvable" });
    return { envoyee: false, motif: "question_introuvable" };
  }
  const jeton = await obtenirAccessToken(admin, userId);
  if (!jeton.ok) { await rendre(false, { motif: `jeton_${jeton.motif}` }); return { envoyee: false }; }
  const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const r = await appelTrading(env, jeton.token, "AddMemberMessageRTQ",
    `<ItemID>${echapper(String(conv.annonce_ref))}</ItemID><MemberMessage><Body>${echapper(String(rep.texte))}</Body>` +
    `<DisplayToPublic>false</DisplayToPublic><EmailCopyToSender>false</EmailCopyToSender>` +
    `<ParentMessageID>${echapper(String(dernier.message_ref))}</ParentMessageID><RecipientID>${echapper(String(conv.interlocuteur_ref))}</RecipientID></MemberMessage>`);
  const err = erreurTrading(r.xml);
  await rendre(!err, { http: r.http, code: err ? err.split(" ")[0] : null, motif: err ? "trading_refus" : null, empreinte_ok: true });
  return { envoyee: !err };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const corps = await req.json().catch(() => ({}));
  const mode = String(corps?.mode ?? "releve");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const env = lireEnvEbay();

  // Garde à deux branches : le cron (secret du vault) OU une session.
  const secret = Deno.env.get("CRON_SECRET");
  const parCron = Boolean(secret) && req.headers.get("x-cron-secret") === secret;
  let comptes: string[] = [];
  if (parCron) {
    const nomme = typeof corps?.user_id === "string" && /^[0-9a-f-]{36}$/i.test(corps.user_id) ? corps.user_id : null;
    if (mode === "verifier") {
      if (!nomme) return json({ error: "user_id requis" }, 400);
      return json({ mode, resultat: await verifier(admin, env, nomme) });
    }
    const { data: beta } = await admin.from("profiles").select("id").eq("beta_flags->>messages_bordereaux", "true").limit(COMPTES_MAX);
    const ids = (beta ?? []).map((p: { id: string }) => p.id).filter((id) => !nomme || id === nomme);
    if (!ids.length) return json({ mode, comptes: 0 });
    const { data: relies } = await admin.from("ebay_accounts").select("user_id").in("user_id", ids).is("revoked_at", null);
    comptes = (relies ?? []).map((r: { user_id: string }) => r.user_id);
  } else {
    if (mode === "verifier") return json({ error: "Non autorisé" }, 401);
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return json({ error: "Non autorisé" }, 401);
    const { data: beta } = await admin.rpc("messagerie_beta", { p_user: user.id });
    if (beta !== true) return json({ mode, refuse: "beta" }, 403);
    comptes = [user.id];
  }

  const resultats: Record<string, unknown>[] = [];
  for (const userId of comptes) {
    try {
      // Le relevé, puis AU PLUS une réponse en attente.
      const r = mode === "envoyer" ? await envoyer(admin, env, userId)
        : { ...(await relever(admin, env, userId)), envoi: await envoyer(admin, env, userId) };
      resultats.push(r as Record<string, unknown>);
    } catch (e) {
      console.error("[ebay-messagerie] échec d'un compte :", String((e as Error)?.message ?? e).slice(0, 160));
      resultats.push({ erreur: "exception" });
    }
  }
  console.log(`[ebay-messagerie] mode=${mode} comptes=${comptes.length}`);
  return json({ mode, comptes: comptes.length, resultats });
});
