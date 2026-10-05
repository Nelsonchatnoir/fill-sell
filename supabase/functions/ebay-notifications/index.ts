// ═══════════════════════════════════════════════════════════════════════════
// ebay-notifications — la vente eBay vue à la commande (ORDER_CONFIRMATION)
// 05/10/2026, GO de Nico (point 14)
// ═══════════════════════════════════════════════════════════════════════════
// Avant : une vente eBay se voyait par la veille Browse d'ebay-api-worker, une
// visite toutes les 6 h par annonce (médiane 2,5 h depuis le 01/10). eBay
// envoie désormais, pour chaque compte relié abonné, la notification
// ORDER_CONFIRMATION dès que l'acheteur finit de payer.
//
// DESTINATION (une, pour l'application) :
//   https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-notifications
//   verificationToken = hex(SHA-256("fillsell-ebay-ventes:" + CRON_SECRET)) —
//   dérivé du secret des crons, jamais écrit nulle part ; une rotation de
//   CRON_SECRET impose de relancer l'action « destination » (le défi suit).
//
// TROIS PORTES, UNE FONCTION (verify_jwt = false, garde maison) :
//   · GET ?challenge_code=… : le défi d'eBay (hex SHA-256 de challengeCode +
//     verificationToken + endpoint, dans cet ordre) ;
//   · POST avec x-cron-secret : administration (sujet, destination, abonner,
//     tester, etat) — personne d'autre ;
//   · POST sans x-cron-secret : une notification. Signature x-ebay-signature
//     vérifiée (_shared/ebay-notification.ts). « invalide » = rien ;
//     « indéterminée » = la veille seulement (jamais « vendue ») ; « valide » =
//     _shared/ebay-commande-notification.js décide (stock exact épuisé →
//     sale_signal 'sold', sinon la veille tranche). Toujours 200 à eBay, sauf
//     panne de base (500, pour qu'eBay réessaie).
// Ce que la notification ne fait JAMAIS : enregistrer une vente, retirer une
// annonce, toucher un job non publié, un autre compte, une autre plateforme.
// Journal : ebay_notification_verdicts (kind 'commande'), sans donnée acheteur.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { appelEbay, hotes, lireEnvEbay, lireIdentifiants, obtenirAccessToken, type EbayEnv } from "../_shared/ebay-oauth.ts";
import { verifierSignatureNotification } from "../_shared/ebay-notification.ts";
import { obtenirJetonApplicatif } from "../_shared/ebay-app-token.ts";
import { lireCommandeConfirmee, patchCommandeSurJob, TOPIC_COMMANDE } from "../_shared/ebay-commande-notification.js";

const ENDPOINT = "https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-notifications";
const NOM_DESTINATION = "FillSell ventes";
const ABONNER_MAX = 15;
const ABONNER_BUDGET_MS = 40_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function sha256Hex(t: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function jetonDeVerification(): Promise<string> {
  const s = Deno.env.get("CRON_SECRET")?.trim() ?? "";
  if (!s) throw new Error("CRON_SECRET absent");
  return sha256Hex(`fillsell-ebay-ventes:${s}`);
}

function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function journaliser(adm: SupabaseClient, v: { kind: string; topic?: string | null; notification_id?: string | null; verdict: string; detail?: string | null; kid?: string | null; http_status?: number }) {
  const { error } = await adm.from("ebay_notification_verdicts").insert({
    kind: v.kind, topic: v.topic ?? null, notification_id: v.notification_id ?? null, verdict: v.verdict,
    detail: v.detail ? String(v.detail).slice(0, 500) : null, kid: v.kid ?? null, http_status: v.http_status ?? 200,
  });
  if (error) console.warn(`[ebay-notifications] journal non écrit (${error.message})`);
}

// ── Administration ──────────────────────────────────────────────────────────
let schemaVersionCache: string | null = null;
async function lireSujet(env: EbayEnv): Promise<{ http: number; json: unknown }> {
  const app = await obtenirJetonApplicatif(env);
  const r = await appelEbay(env, app, `/commerce/notification/v1/topic/${TOPIC_COMMANDE}`);
  return { http: r.http, json: r.json };
}
async function schemaVersion(env: EbayEnv): Promise<string> {
  if (schemaVersionCache) return schemaVersionCache;
  const s = await lireSujet(env);
  const payloads = ((s.json as { supportedPayloads?: Array<{ schemaVersion?: string; format?: string[] | string; deliveryProtocol?: string }> } | null)?.supportedPayloads) ?? [];
  const v = payloads.map((p) => String(p.schemaVersion ?? "")).filter(Boolean).sort().pop();
  schemaVersionCache = v || "1.0";
  return schemaVersionCache;
}

async function destinationId(env: EbayEnv, creer: boolean): Promise<{ id: string | null; detail: string }> {
  const app = await obtenirJetonApplicatif(env);
  const liste = await appelEbay(env, app, "/commerce/notification/v1/destination?limit=100");
  const dests = ((liste.json as { destinations?: Array<{ destinationId?: string; deliveryConfig?: { endpoint?: string }; status?: string }> } | null)?.destinations) ?? [];
  const deja = dests.find((d) => d.deliveryConfig?.endpoint === ENDPOINT);
  if (deja?.destinationId) return { id: deja.destinationId, detail: `existante (${deja.status ?? "?"})` };
  if (!creer) return { id: null, detail: `absente (liste HTTP ${liste.http})` };
  // eBay envoie le défi (GET ?challenge_code) à l'instant de la création.
  const r = await fetch(`${hotes(env).api}/commerce/notification/v1/destination`, {
    method: "POST",
    headers: { Authorization: `Bearer ${app}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ name: NOM_DESTINATION, status: "ENABLED", deliveryConfig: { endpoint: ENDPOINT, verificationToken: await jetonDeVerification() } }),
  });
  const texte = await r.text();
  const id = (r.headers.get("location") ?? "").split("/").pop() || null;
  return { id, detail: `création HTTP ${r.status}${texte ? ` ${texte.slice(0, 300)}` : ""}` };
}

async function abonnementExistant(env: EbayEnv, token: string): Promise<string | null> {
  const r = await appelEbay(env, token, "/commerce/notification/v1/subscription?limit=100");
  const subs = ((r.json as { subscriptions?: Array<{ subscriptionId?: string; topicId?: string; destinationId?: string }> } | null)?.subscriptions) ?? [];
  return subs.find((s) => s.topicId === TOPIC_COMMANDE)?.subscriptionId ?? null;
}

async function abonner(adm: SupabaseClient, env: EbayEnv, opts: { user_id?: string; limite?: number }) {
  const debut = Date.now();
  const dest = await destinationId(env, false);
  if (!dest.id) return { erreur: "destination absente — action « destination » d'abord", detail: dest.detail };
  const version = await schemaVersion(env);
  let q = adm.from("ebay_accounts").select("user_id, ebay_user_id").is("revoked_at", null);
  if (opts.user_id) q = q.eq("user_id", opts.user_id);
  const { data: comptes, error } = await q;
  if (error) return { erreur: error.message };
  const { data: deja } = await adm.from("ebay_abonnements_ventes").select("user_id, statut");
  const actifs = new Set((deja ?? []).filter((d) => d.statut === "actif").map((d) => d.user_id));
  const aFaire = (comptes ?? []).filter((c) => !actifs.has(c.user_id)).slice(0, Math.min(opts.limite ?? ABONNER_MAX, ABONNER_MAX));
  const bilan: Array<Record<string, unknown>> = [];
  for (const c of aFaire) {
    if (Date.now() - debut > ABONNER_BUDGET_MS) { bilan.push({ user: c.user_id.slice(0, 8), statut: "reporte_budget" }); continue; }
    const tok = await obtenirAccessToken(adm, c.user_id);
    if (!tok.ok) {
      await adm.from("ebay_abonnements_ventes").upsert({ user_id: c.user_id, ebay_user_id: c.ebay_user_id, statut: "refuse", erreur: `jeton : ${tok.motif}`, maj_le: new Date().toISOString() });
      bilan.push({ user: c.user_id.slice(0, 8), statut: "refuse", motif: tok.motif });
      continue;
    }
    const r = await fetch(`${hotes(env).api}/commerce/notification/v1/subscription`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok.token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ topicId: TOPIC_COMMANDE, status: "ENABLED", destinationId: dest.id,
        payload: { format: "JSON", schemaVersion: version, deliveryProtocol: "HTTPS" } }),
    });
    const texte = await r.text();
    let id = (r.headers.get("location") ?? "").split("/").pop() || null;
    if (!id && r.status === 409) id = await abonnementExistant(env, tok.token);
    const ok = Boolean(id) && (r.status === 201 || r.status === 409 || r.status === 200);
    await adm.from("ebay_abonnements_ventes").upsert({
      user_id: c.user_id, ebay_user_id: c.ebay_user_id, subscription_id: id, destination_id: dest.id,
      statut: ok ? "actif" : "refuse", erreur: ok ? null : `HTTP ${r.status} ${texte.slice(0, 300)}`, maj_le: new Date().toISOString(),
    });
    bilan.push({ user: c.user_id.slice(0, 8), statut: ok ? "actif" : "refuse", http: r.status });
  }
  return { destination: dest.id, schemaVersion: version, comptes: (comptes ?? []).length, deja_actifs: actifs.size, traites: bilan.length, bilan, ms: Date.now() - debut };
}

async function tester(adm: SupabaseClient, env: EbayEnv, userId: string) {
  const { data: ab } = await adm.from("ebay_abonnements_ventes").select("subscription_id").eq("user_id", userId).maybeSingle();
  if (!ab?.subscription_id) return { erreur: "pas d'abonnement actif pour ce compte" };
  const tok = await obtenirAccessToken(adm, userId);
  if (!tok.ok) return { erreur: `jeton : ${tok.motif}` };
  const r = await appelEbay(env, tok.token, `/commerce/notification/v1/subscription/${ab.subscription_id}/test`, { method: "POST" });
  return { http: r.http, reponse: r.texte.slice(0, 300) };
}

// ── La notification ─────────────────────────────────────────────────────────
function formeDe(v: unknown, prof = 0): unknown {
  if (prof > 4) return "…";
  if (Array.isArray(v)) return v.length ? [formeDe(v[0], prof + 1), `×${v.length}`] : [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 20).map(([k, x]) => [k, formeDe(x, prof + 1)]));
  if (typeof v === "string") return /^\d+$/.test(v) ? `chiffres(${v.length})` : `texte(${v.length})`;
  return typeof v;
}

async function traiterNotification(req: Request): Promise<Response> {
  const adm = admin();
  const corpsBrut = new Uint8Array(await req.arrayBuffer());
  let notif: Record<string, unknown> = {};
  try { notif = JSON.parse(new TextDecoder().decode(corpsBrut)); } catch { notif = {}; }
  const topic = String((notif.metadata as { topic?: string } | undefined)?.topic ?? "");
  const notifId = String((notif.notification as { notificationId?: string } | undefined)?.notificationId ?? "").slice(0, 80) || null;

  // Sans en-tête de signature, ce n'est pas eBay : rien (le module partagé
  // rendrait « indéterminée », qui laisse pousser la veille).
  if (!req.headers.get("x-ebay-signature")) {
    await journaliser(adm, { kind: "commande", topic, notification_id: notifId, verdict: "invalide", detail: "sans x-ebay-signature" });
    return json({ ok: true, ignore: true });
  }
  const env = lireEnvEbay();
  const ids = lireIdentifiants();
  const sig = await verifierSignatureNotification(corpsBrut, req.headers.get("x-ebay-signature"), env, ids.clientId, ids.clientSecret);
  if (sig.verdict === "invalide") {
    console.error(`[ebay-notifications] SIGNATURE INVALIDE — rien fait (notif ${notifId ?? "?"}, ${sig.detail})`);
    await journaliser(adm, { kind: "commande", topic, notification_id: notifId, verdict: "invalide", detail: sig.detail, kid: sig.kid });
    return json({ ok: true, ignore: true });
  }
  if (topic !== TOPIC_COMMANDE) {
    await journaliser(adm, { kind: "commande", topic, notification_id: notifId, verdict: "ignoree", detail: "sujet non géré" });
    return json({ ok: true, ignore: true });
  }
  const cmd = lireCommandeConfirmee(notif);
  if (!cmd) {
    // La FORME seule (clés, types, longueurs) — jamais une valeur : de quoi
    // corriger la lecture sans garder la moindre donnée d'acheteur.
    await journaliser(adm, { kind: "commande", topic, notification_id: notifId, verdict: "illisible",
      detail: `forme ${JSON.stringify(formeDe((notif.notification as Record<string, unknown> | undefined)?.data))} schema ${String((notif.metadata as { schemaVersion?: string } | undefined)?.schemaVersion ?? "?")} signature ${sig.verdict}`, kid: sig.kid });
    return json({ ok: true, ignore: true });
  }
  const signatureValide = sig.verdict === "valide";
  const res = await appliquerCommande(adm, cmd, signatureValide, false);
  if (res.erreurBase) return json({ error: "base" }, 500);
  if (res.compte !== "trouve") {
    await journaliser(adm, { kind: "commande", topic, notification_id: notifId, verdict: res.compte, detail: res.bilan.join(" ; ") });
    return json({ ok: true, ignore: true });
  }
  const bilan = res.bilan;
  await journaliser(adm, { kind: "commande", topic, notification_id: notifId, verdict: signatureValide ? "valide" : "indeterminee", detail: bilan.join(" ; "), kid: sig.kid });
  return json({ ok: true });
}

/** Le compte et les jobs touchés par une commande ; à blanc = rien d'écrit. */
async function appliquerCommande(adm: SupabaseClient, cmd: NonNullable<ReturnType<typeof lireCommandeConfirmee>>, signatureValide: boolean, aBlanc: boolean) {
  const bilan: string[] = [];
  // Le compte : par le pseudo ou l'identifiant public eBay (ebay_user_id).
  const cles = [cmd.username, cmd.userId].filter((x): x is string => Boolean(x));
  const { data: comptes, error: eC } = await adm.from("ebay_accounts").select("user_id").in("ebay_user_id", cles).is("revoked_at", null);
  if (eC) { console.error(`[ebay-notifications] base : ${eC.message}`); return { erreurBase: true, compte: "base", bilan }; }
  const users = [...new Set((comptes ?? []).map((c) => c.user_id))];
  if (users.length !== 1) {
    bilan.push(`${users.length} compte(s) pour ce vendeur`);
    return { erreurBase: false, compte: users.length ? "compte_ambigu" : "compte_inconnu", bilan };
  }
  const userId = users[0];
  for (const ligne of cmd.lignes) {
    const { data: jobs, error: eJ } = await adm.from("cross_post_jobs")
      .select("id, platform_fields").eq("user_id", userId).eq("platform", "ebay").eq("status", "published")
      .in("action", ["publish", "republish"]).eq("platform_listing_id", ligne.listingId)
      .order("created_at", { ascending: false }).limit(1);
    if (eJ) { console.error(`[ebay-notifications] base : ${eJ.message}`); return { erreurBase: true, compte: "base", bilan }; }
    const job = jobs?.[0];
    if (!job) { bilan.push(`${ligne.listingId}:annonce_hors_fillsell`); continue; }
    const r = patchCommandeSurJob(job.platform_fields, ligne, { orderId: cmd.orderId, notificationId: cmd.notificationId, signatureValide });
    if (!r.nouvelle) { bilan.push(`${ligne.listingId}:deja_notee`); continue; }
    if (aBlanc) { bilan.push(`${ligne.listingId}:job ${job.id}:${r.vendue ? "vendue" : `veille(${r.raison})`}:a_blanc`); continue; }
    const { error: eU } = await adm.from("cross_post_jobs").update({ platform_fields: r.pf }).eq("id", job.id).eq("status", "published");
    if (eU) { console.error(`[ebay-notifications] base : ${eU.message}`); return { erreurBase: true, compte: "base", bilan }; }
    bilan.push(`${ligne.listingId}:${r.vendue ? "vendue" : `veille(${r.raison})`}`);
    console.log(`[ebay-notifications] commande ${cmd.orderId} → job ${job.id} : ${r.vendue ? "vendue (stock épuisé)" : `veille en tête (${r.raison})`}`);
  }
  return { erreurBase: false, compte: "trouve", bilan };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const challenge = url.searchParams.get("challenge_code");
    if (!challenge) return new Response("ebay-notifications : prêt", { status: 200 });
    try {
      const challengeResponse = await sha256Hex(challenge + await jetonDeVerification() + ENDPOINT);
      await journaliser(admin(), { kind: "defi", topic: TOPIC_COMMANDE, verdict: "defi_repondu", detail: `endpoint ${ENDPOINT}` });
      return json({ challengeResponse });
    } catch (e) {
      console.error(`[ebay-notifications] défi impossible : ${(e as Error)?.message ?? e}`);
      return json({ error: "défi impossible" }, 503);
    }
  }
  if (req.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });

  const secret = Deno.env.get("CRON_SECRET")?.trim() ?? "";
  if (secret && req.headers.get("x-cron-secret") === secret) {
    const env = lireEnvEbay();
    const adm = admin();
    const body = await req.json().catch(() => ({})) as { action?: string; user_id?: string; limite?: number };
    try {
      if (body.action === "sujet") return json(await lireSujet(env));
      if (body.action === "destination") return json(await destinationId(env, true));
      if (body.action === "abonner") return json(await abonner(adm, env, body));
      if (body.action === "tester" && body.user_id) return json(await tester(adm, env, body.user_id));
      // À BLANC : une commande fabriquée (jamais signée) suit le vrai chemin
      // compte → job → décision, sans rien écrire.
      if (body.action === "simuler") {
        const cmd = lireCommandeConfirmee((body as { notification?: unknown }).notification);
        if (!cmd) return json({ error: "commande illisible" }, 400);
        return json(await appliquerCommande(adm, cmd, (body as { signature_valide?: boolean }).signature_valide === true, true));
      }
      if (body.action === "etat") {
        const { data } = await adm.from("ebay_abonnements_ventes").select("statut");
        const parStatut: Record<string, number> = {};
        for (const r of data ?? []) parStatut[r.statut] = (parStatut[r.statut] ?? 0) + 1;
        return json({ destination: await destinationId(env, false), abonnements: parStatut });
      }
      return json({ error: "action inconnue" }, 400);
    } catch (e) {
      return json({ error: (e as Error)?.message ?? String(e) }, 500);
    }
  }
  return traiterNotification(req);
});
