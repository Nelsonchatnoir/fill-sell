import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { appelEbay, lireEnvEbay, obtenirAccessToken } from "../_shared/ebay-oauth.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const attendu = Deno.env.get("CRON_SECRET");
  if (!attendu || req.headers.get("x-cron-secret") !== attendu) return json({ error: "Non autorisé" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const corps = await req.json().catch(() => ({}));
  const mode = String(corps?.mode ?? "sync");
  const env = lireEnvEbay();
  const bornePlancher = new Date(Date.now() - FENETRE_MAX_J * 86400_000);

  const { data: comptes, error: errComptes } = await admin
    .from("ebay_accounts").select("user_id").is("revoked_at", null).limit(200);
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
    const { data: derniere } = await admin
      .from("ventes").select("vendu_le")
      .eq("user_id", c.user_id).eq("plateforme_code", "ebay")
      .not("vendu_le", "is", null).order("vendu_le", { ascending: false }).limit(1);
    const repere = derniere?.[0]?.vendu_le ? new Date(Date.parse(derniere[0].vendu_le) - RECOUVREMENT_J * 86400_000) : bornePlancher;
    const depuis = repere < bornePlancher ? bornePlancher : repere;

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

    // UNE seule porte d'écriture, la même que les trois autres plateformes.
    const { data: res, error } = await admin.rpc("enregistrer_ventes_relevees", {
      p_platform: "ebay", p_rows: lignes, p_user: c.user_id,
    });
    if (error) { bilan.push({ rpc: error.message, lignes: lignes.length }); continue; }
    totalCreees += Number(res?.creees ?? 0);
    totalAdoptees += Number(res?.adoptees ?? 0);
    bilan.push({ pages, lignes: lignes.length, ...(res as object) });
  }

  return json({
    ok: true, comptes: comptes?.length ?? 0, pages: totalPages,
    lignes: totalLignes, creees: totalCreees, adoptees: totalAdoptees, bilan,
  });
});
