import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { appelEbay, hotes, lireEnvEbay, obtenirAccessToken } from "../_shared/ebay-oauth.ts";
import { obtenirJetonApplicatif } from "../_shared/ebay-app-token.ts";
import { lectureQuantiteEbay } from "../_shared/ebay-etat-annonce.js";

// ═══════════════════════════════════════════════════════════════════════════
// ebay-ventes-sync — LES VENTES eBAY, PAR L'API D'ORDRES, SERVEUR SEUL
// 2026-09-19
//
// Aucun Chrome, aucun onglet, aucune fenêtre de travail : le jeton vendeur
// vient de obtenirAccessToken() (refresh compris), comme ebay-api-worker.
//
// ⭐ LE SCOPE EST DÉJÀ CONSENTI. `sell.fulfillment` a été demandé dès le lot 0
//    (05/09, _shared/ebay-oauth.ts, commentaire « lot 3 — détecter les ventes »).
//    Mesuré le 19/09 : 26 comptes reliés, 26/26 portent le scope. AUCUN
//    re-consentement n'est demandé à personne.
// ⛔ ET ON N'EN AJOUTE AUCUN. `sell.finances` a été retiré du keyset exprès :
//    tout scope ajouté forcerait CHAQUE vendeur relié à reconnecter.
//
// ── LE SCHÉMA CI-DESSOUS EST RELEVÉ, PAS RECOPIÉ (appel réel du 19/09) ──────
// Le chemin d'abord : la doc eBay écrit dans son PROPRE exemple
// `https://api.ebay.com/sell/v1/order`. Mesuré : ce chemin rend **404**. Le bon
// est `/sell/fulfillment/v1/order` — c'est la réponse qui a tranché.
// Enveloppe : { href, total, limit, offset, orders[] }  → offset/limit.
// Commande  : orderId · legacyOrderId · creationDate · lastModifiedDate ·
//             orderFulfillmentStatus · orderPaymentStatus · sellerId ·
//             pricingSummary{priceSubtotal,deliveryCost,total} ·
//             cancelStatus{cancelState,cancelRequests[]} ·
//             paymentSummary{totalDueSeller,refunds[],payments[]} ·
//             lineItems[{ lineItemId, legacyItemId, sku, title, lineItemCost,
//                         quantity, soldFormat, lineItemFulfillmentStatus,
//                         total, deliveryCost, taxes[], properties{
//                         fromBestOffer, buyerProtection }, … }] ·
//             salesRecordReference · totalFeeBasisAmount
//
// ⛔ LES FRAIS RÉELS NE SONT PAS DANS CETTE RÉPONSE. `totalFeeBasisAmount` est
//    l'ASSIETTE sur laquelle eBay calcule sa commission, PAS la commission.
//    Aucun `totalMarketplaceFee` dans le corps relevé. Conséquence assumée :
//    `selling_fees` reste à 0 pour eBay, et on ne va pas le chercher ailleurs —
//    « ailleurs », c'est `sell.finances`, et ce scope est interdit ici.
//
// ⛔ AUCUNE DONNÉE PERSONNELLE D'ACHETEUR NE SORT D'ICI. La réponse en porte
//    beaucoup (buyer.username, buyerRegistrationAddress avec nom, adresse,
//    téléphone et e-mail ; fulfillmentStartInstructions avec l'adresse de
//    livraison). RIEN de tout cela n'est lu, transporté ni écrit : seuls
//    l'identifiant de COMMANDE et l'identifiant d'ANNONCE traversent.
//
// ⭐ UN PRIX NÉGOCIÉ, ENFIN NOMMÉ : `lineItems[].properties.fromBestOffer`
//    dit si la ligne vient d'une offre acceptée. C'est le seul endroit des
//    quatre plateformes où la négociation se LIT au lieu de se supposer.
//
// Déployer avec --no-verify-jwt (appelé par pg_cron, garde x-cron-secret).
// ═══════════════════════════════════════════════════════════════════════════

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-cron-secret" };
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const CHEMIN = "/sell/fulfillment/v1/order";
// 720 jours, pas 730 : eBay refuse en 30830 (« La date de début doit être
// comprise dans les 2 années précédant la date du jour ») dès qu'on colle à la
// borne. Mesuré en réel le 19/09 — c'est l'API qui a tranché.
const FENETRE_MAX_J = 720;
// Recouvrement du curseur : une commande peut changer d'état (remboursement,
// annulation) après sa création. On relit toujours les 30 derniers jours.
const RECOUVREMENT_J = 30;
const PAGE = 200;          // maximum accepté par getOrders (doc : Maximum 200)
const PAGES_MAX = 25;      // 5 000 commandes par compte et par passage — borne dure
// (09/10, Jocabroc) UN APPEL D'ÉCRITURE TIENT EN 8 s, OU IL N'ÉCRIT RIEN. PostgREST
// passe par `authenticator` (statement_timeout = 8s) : le 09/10, toutes les
// commandes d'un compte partaient en UN appel ; au-delà de 8 s la base l'annulait
// en entier (« canceling statement due to statement timeout », 04:40 et 06:00
// UTC) et le passage suivant recommençait — 174 commandes chez eBay, 0 en base,
// depuis la liaison du compte. Les lignes partent donc par lots bornés, de la
// plus ANCIENNE à la plus récente : un lot refusé n'avance jamais le curseur
// (ci-dessous) au-delà de ce qui est écrit, il sera relu au passage suivant.
const LOT_RPC = 40;
// (09/10 soir) Une commande dont la quantité eBay n'a pas été lue APRÈS elle reste
// « à relire » (ventes_ebay_exemplaires) : on relit son annonce ici, par Browse
// (jeton applicatif, lecture publique), au plus RELECTURES_MAX par compte et par
// passage — la base dit lesquelles et quand (1 h, 2 h, 4 h… jusqu'à 24 h).
const RELECTURES_MAX = 10;
const MARKETPLACE = "EBAY_FR";   // = _shared/ebay-publication.ts (non importé : module lourd)

interface LigneVente {
  ref: string; titre: string | null; prix: number | null; devise: string | null;
  vendu_le: string | null; statut: string; listing_id: string | null;
  url: string | null; frais: number | null; lot: boolean;
}

function squelette(o: unknown, prof = 0): unknown {
  if (prof > 6) return "…";
  if (Array.isArray(o)) return o.length ? [`[${o.length}]`, squelette(o[0], prof + 1)] : ["[0]"];
  if (o && typeof o === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o as Record<string, unknown>)) out[k] = squelette((o as Record<string, unknown>)[k], prof + 1);
    return out;
  }
  return typeof o;
}

const nb = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Une commande → UNE ligne PAR ARTICLE. eBay donne à chaque `lineItem` son
// propre `legacyItemId` et son propre montant : une commande à trois articles
// produit trois ventes rattachables, jamais un « lot » indivisible.
// Le `ref` porte l'article, pas seulement la commande : c'est lui la clé
// d'unicité, et deux lignes d'une même commande ne doivent pas s'écraser.
function lignesDeLaCommande(o: Record<string, any>): LigneVente[] {
  const items: Record<string, any>[] = Array.isArray(o?.lineItems) ? o.lineItems : [];
  // `cancelState` prime sur le statut de paiement : une commande payée puis
  // annulée n'est pas une vente. Valeur relevée pour « rien demandé » :
  // NONE_REQUESTED. Toute autre valeur part en 'cancelled' — côté RPC, un
  // statut inconnu n'écrit rien de toute façon.
  const annule = String(o?.cancelStatus?.cancelState ?? "NONE_REQUESTED").toUpperCase() !== "NONE_REQUESTED";
  const statut = annule ? "cancelled" : String(o?.orderPaymentStatus ?? "");
  const vendu = o?.creationDate ? String(o.creationDate) : null;
  return items.map((li) => ({
    // `lineItemCost` = le prix de L'ARTICLE (offre acceptée comprise, cf.
    // properties.fromBestOffer). `total` y ajoute le port : ce n'est pas le
    // prix de vente de l'objet, on ne le prend pas.
    ref: `${o?.orderId ?? ""}:${li?.lineItemId ?? ""}`,
    titre: li?.title ? String(li.title) : null,
    prix: nb(li?.lineItemCost?.value),
    devise: li?.lineItemCost?.currency ? String(li.lineItemCost.currency) : null,
    vendu_le: vendu,
    statut,
    // legacyItemId = l'identifiant d'annonce classique eBay, celui-là même que
    // porte cross_post_jobs.platform_listing_id (222/223 dépôts eBay l'ont).
    listing_id: li?.legacyItemId ? String(li.legacyItemId) : null,
    url: li?.legacyItemId ? `https://www.ebay.fr/itm/${li.legacyItemId}` : null,
    // ⛔ Les frais réels ne sont PAS dans getOrders (cf. bandeau). NULL, jamais 0
    //    « par défaut » : VIDE ≠ ZÉRO, ici comme sur le prix d'achat.
    frais: null,
    lot: false,
  })).filter((l) => l.ref.length > 1);
}

// La lecture eBay des annonces dont une commande attend sa quantité, puis le
// jugement de ces commandes par la base (ebay_quantite_lue → ebay_commande_appliquer).
// Une réponse illisible (ni 200 ni 404) ne conclut rien : la commande sera relue.
async function relireCommandesEnAttente(admin: SupabaseClient, env: ReturnType<typeof lireEnvEbay>, userId: string) {
  const { data: aRelire, error } = await admin.rpc("ebay_commandes_a_relire", { p_user: userId, p_limite: RELECTURES_MAX });
  if (error || !Array.isArray(aRelire) || !aRelire.length) return {};
  let token: string;
  try { token = await obtenirJetonApplicatif(env); } catch { return { relectures: 0, relecture_jeton: "refuse" }; }
  let relues = 0, illisibles = 0;
  for (const r of aRelire as Array<{ listing_id: string }>) {
    const id = String(r.listing_id ?? "");
    if (!/^\d{9,15}$/.test(id)) continue;
    let lecture: Record<string, unknown> | null = null;
    try {
      const rep = await fetch(`${hotes(env).api}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${id}`, {
        headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE, Accept: "application/json" },
      });
      lecture = lectureQuantiteEbay(rep.status, await rep.json().catch(() => ({})));
    } catch { lecture = null; }
    if (!lecture) { illisibles++; continue; }
    const { error: e2 } = await admin.rpc("ebay_quantite_lue", { p_user: userId, p_listing: id, p_lecture: lecture });
    if (e2) illisibles++; else relues++;
  }
  return { relectures: relues, relectures_illisibles: illisibles };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const attendu = Deno.env.get("CRON_SECRET");
  if (!attendu || req.headers.get("x-cron-secret") !== attendu) return json({ error: "Non autorisé" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const corps = await req.json().catch(() => ({}));
  const mode = String(corps?.mode ?? "sync");
  const env = lireEnvEbay();
  const bornePlancher = new Date(Date.now() - FENETRE_MAX_J * 86400_000);

  // (04/10) Un seul compte quand l'appelant le nomme : le relevé eBay par
  // l'API (ebay-releve-api) relève les ventes du compte qu'il vient de lire.
  // Sans user_id : tous les comptes reliés, comme le passage du matin.
  const seul = typeof corps?.user_id === "string" && /^[0-9a-f-]{36}$/i.test(corps.user_id) ? corps.user_id : null;
  let reqComptes = admin.from("ebay_accounts").select("user_id").is("revoked_at", null);
  if (seul) reqComptes = reqComptes.eq("user_id", seul);
  const { data: comptes, error: errComptes } = await reqComptes.limit(200);
  if (errComptes) return json({ error: errComptes.message }, 500);

  const filtreDepuis = (d: Date) => `creationdate:%5B${d.toISOString().replace(/\.\d{3}Z$/, ".000Z")}..%5D`;

  // ══ MODE SONDE ══════════════════════════════════════════════════════════
  // Le squelette d'une commande réelle (noms de champs et types, ZÉRO valeur)
  // et le vocabulaire de statuts RÉELLEMENT rencontré. C'est ce mode qui a
  // servi à écrire tout ce qui précède — il reste là pour le prochain qui
  // doutera d'un champ, au lieu de deviner.
  if (mode === "schema" || mode === "enums") {
    const trace: Array<Record<string, unknown>> = [];
    const vus = { orderPaymentStatus: {}, orderFulfillmentStatus: {}, cancelState: {}, soldFormat: {}, fromBestOffer: {} } as Record<string, Record<string, number>>;
    let squel: unknown = null;
    let nComptesAvecVentes = 0, nCommandes = 0;
    for (const c of comptes ?? []) {
      const jeton = await obtenirAccessToken(admin, c.user_id);
      if (!jeton.ok) { trace.push({ jeton: jeton.motif }); continue; }
      const r = await appelEbay(env, jeton.token, `${CHEMIN}?limit=${mode === "enums" ? 200 : 2}&filter=${filtreDepuis(bornePlancher)}`);
      const j = r.json as Record<string, any> | null;
      const orders: Record<string, any>[] = Array.isArray(j?.orders) ? j!.orders : [];
      trace.push({ http: r.http, total: j?.total ?? null, orders: orders.length, err: r.http >= 400 ? r.texte.slice(0, 120) : null });
      if (r.http !== 200 || !orders.length) continue;
      nComptesAvecVentes++; nCommandes += orders.length;
      if (!squel) squel = { enveloppe: squelette({ ...j, orders: undefined }), commande: squelette(orders[0]) };
      if (mode === "enums") {
        const inc = (k: string, v: unknown) => { const s = String(v ?? "(absent)"); vus[k][s] = (vus[k][s] ?? 0) + 1; };
        for (const o of orders) {
          inc("orderPaymentStatus", o?.orderPaymentStatus);
          inc("orderFulfillmentStatus", o?.orderFulfillmentStatus);
          inc("cancelState", o?.cancelStatus?.cancelState);
          for (const li of (Array.isArray(o?.lineItems) ? o.lineItems : [])) {
            inc("soldFormat", li?.soldFormat);
            inc("fromBestOffer", li?.properties?.fromBestOffer);
          }
        }
      }
    }
    return json({ ok: true, chemin: CHEMIN, comptes: comptes?.length ?? 0, comptes_avec_ventes: nComptesAvecVentes, commandes: nCommandes, vocabulaire: mode === "enums" ? vus : undefined, ...(squel as object ?? {}), trace: mode === "enums" ? undefined : trace });
  }

  // ══ MODE LIGNES (09/10) — LECTURE SEULE ════════════════════════════════
  // Les lignes EXACTES que le mode sync enverrait à la base pour UN compte
  // (identifiant de commande et d'annonce, titre de l'annonce, prix, date,
  // statut), sur toute la fenêtre de 720 jours — rien n'est écrit. Sert à
  // mesurer (quelles ventes eBay manquent, quelles fiches, quelles copies) et à
  // éprouver l'écriture dans une transaction annulée. Toujours sans donnée
  // d'acheteur (lignesDeLaCommande n'en lit aucune).
  if (mode === "lignes") {
    if (!seul) return json({ error: "mode lignes : user_id obligatoire" }, 400);
    const jeton = await obtenirAccessToken(admin, seul);
    if (!jeton.ok) return json({ ok: false, jeton: jeton.motif });
    const lignes: LigneVente[] = [];
    let offset = 0, pages = 0, stop = false, http = 0;
    while (pages < PAGES_MAX && !stop) {
      const r = await appelEbay(env, jeton.token, `${CHEMIN}?limit=${PAGE}&offset=${offset}&filter=${filtreDepuis(bornePlancher)}`);
      http = r.http; pages++;
      if (r.http !== 200) return json({ ok: false, http: r.http, detail: r.texte.slice(0, 160), lues: lignes.length });
      const j = r.json as Record<string, any> | null;
      const orders: Record<string, any>[] = Array.isArray(j?.orders) ? j!.orders : [];
      for (const o of orders) lignes.push(...lignesDeLaCommande(o));
      offset += PAGE;
      stop = orders.length < PAGE || offset >= Number(j?.total ?? 0);
    }
    return json({ ok: true, http, pages, lignes });
  }

  // ══ MODE SYNC ═══════════════════════════════════════════════════════════
  if (mode !== "sync") return json({ error: `mode inconnu: ${mode}` }, 400);

  const bilan: Array<Record<string, unknown>> = [];
  let totalLignes = 0, totalCreees = 0, totalAdoptees = 0, totalPages = 0;

  for (const c of comptes ?? []) {
    const jeton = await obtenirAccessToken(admin, c.user_id);
    if (!jeton.ok) { bilan.push({ jeton: jeton.motif }); continue; }

    // Curseur : la vente eBay la plus récente déjà connue, moins le
    // recouvrement. Aucune table de curseur à maintenir — `ventes` EST le
    // curseur, et une interruption ne perd donc rien.
    // (09/10) Seules les ventes ÉCRITES PAR CE RELEVÉ (une commande) comptent :
    // une vente eBay déclarée à la main porte aussi plateforme_code « ebay » et
    // une date du jour — elle faisait sauter tout l'historique jamais relevé.
    const { data: derniere } = await admin
      .from("ventes").select("vendu_le")
      .eq("user_id", c.user_id).eq("plateforme_code", "ebay")
      .not("commande_ref", "is", null)
      .not("vendu_le", "is", null).order("vendu_le", { ascending: false }).limit(1);
    const repere = derniere?.[0]?.vendu_le ? new Date(Date.parse(derniere[0].vendu_le) - RECOUVREMENT_J * 86400_000) : bornePlancher;
    // (09/10) `fenetre: "complete"` relit les 720 jours : rattrapage d'un trou
    // laissé par l'ancien curseur (tho-975214 : une commande de 2024 jamais
    // relevée, le curseur partant d'une vente déclarée). Jamais au cron.
    const depuis = corps?.fenetre === "complete" || repere < bornePlancher ? bornePlancher : repere;

    const lignes: LigneVente[] = [];
    let offset = 0, pages = 0, httpDernier = 0, stop = false;
    while (pages < PAGES_MAX && !stop) {
      const r = await appelEbay(env, jeton.token, `${CHEMIN}?limit=${PAGE}&offset=${offset}&filter=${filtreDepuis(depuis)}`);
      httpDernier = r.http;
      pages++; totalPages++;
      if (r.http !== 200) { bilan.push({ http: r.http, detail: r.texte.slice(0, 160) }); break; }
      const j = r.json as Record<string, any> | null;
      const orders: Record<string, any>[] = Array.isArray(j?.orders) ? j!.orders : [];
      for (const o of orders) lignes.push(...lignesDeLaCommande(o));
      const total = Number(j?.total ?? 0);
      offset += PAGE;
      stop = orders.length < PAGE || offset >= total;
    }

    if (!lignes.length) { bilan.push({ http: httpDernier, lignes: 0, pages }); continue; }
    totalLignes += lignes.length;

    // UNE seule porte d'écriture, la même que les trois autres plateformes —
    // par lots bornés (LOT_RPC), de la plus ancienne à la plus récente. Au
    // premier lot refusé on s'arrête : les plus récentes seront relues au
    // passage suivant (le curseur n'a pas dépassé ce qui est écrit).
    lignes.sort((a, b) => (Date.parse(a.vendu_le ?? "") || 0) - (Date.parse(b.vendu_le ?? "") || 0) || a.ref.localeCompare(b.ref));
    const cumul: Record<string, number> = {};
    let appels = 0, refus: string | null = null;
    for (let i = 0; i < lignes.length; i += LOT_RPC) {
      const { data: res, error } = await admin.rpc("enregistrer_ventes_relevees", {
        p_platform: "ebay", p_rows: lignes.slice(i, i + LOT_RPC), p_user: c.user_id,
      });
      if (error) { refus = error.message; break; }
      appels++;
      for (const [k, v] of Object.entries((res ?? {}) as Record<string, unknown>)) {
        if (typeof v === "number") cumul[k] = (cumul[k] ?? 0) + v;
      }
    }
    totalCreees += cumul.creees ?? 0;
    totalAdoptees += cumul.adoptees ?? 0;
    const relues = await relireCommandesEnAttente(admin, env, c.user_id);
    bilan.push({ pages, lignes: lignes.length, appels, ...cumul, ...relues, ...(refus ? { rpc: refus, appel_refuse: appels + 1 } : {}) });
  }

  return json({
    ok: true, comptes: comptes?.length ?? 0, pages: totalPages,
    lignes: totalLignes, creees: totalCreees, adoptees: totalAdoptees, bilan,
  });
});
