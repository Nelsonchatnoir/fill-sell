// ═══════════════════════════════════════════════════════════════════════════
// meta-inscription — L'INSCRIPTION ENVOYÉE À META PAR LE SERVEUR (API de conversions, 15/11/2026 soir, ordre de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Appelée par le NAVIGATEUR juste après une inscription réussie, en arrière-plan (navigator.sendBeacon, texte brut :
// aucune requête préalable, elle part même si la page se ferme) — et SEULEMENT si la personne a accepté le bandeau
// (src/utils/metaInscription.js). Sans session (l'inscription par e-mail n'en ouvre pas avant la confirmation) :
// déployée --no-verify-jwt, avec sa garde maison :
//   · le compte est relu ICI (auth.users, clé de service) : il doit exister et être né il y a moins de 30 min ;
//   · une seule fois par compte (usage_logs « meta_capi_inscription ») ;
//   · rien de ce que dit le navigateur n'est cru hors de son format (identifiants, fbp/fbc, adresse de notre site).
// La réponse part TOUT DE SUITE (202) ; l'envoi à Meta se fait ensuite (EdgeRuntime.waitUntil), ses erreurs sont
// seulement journalisées : jamais une inscription ralentie ni bloquée. Les jetons : secrets META_CAPI_TOKEN_<pixel>.
// Règles pures et verrou : _shared/meta-capi.js, selftest:meta-capi-inscription.
//
// (17/11/2026, ordre de Nico) Les jetons n'avaient jamais existé (« jeton_absent » à chaque inscription, sans alerte).
//   · envoi au seul pixel de l'API de conversions (PIXELS_CAPI : FillSell Web) ; le pixel du compte pub perso
//     (PIXELS_NAVIGATEUR_SEUL) reste au navigateur (Meta n'y donne aucun jeton) — _shared/meta-capi.js ;
//   · statut « envoye » par pixel ; un échec (jeton absent, refus de Meta) est dit clairement, et au 4e d'affilée une
//     alerte part à support@ (_shared/meta-capi-envoi.js) ;
//   · la trace garde fbp, fbc et le navigateur (`contexte`) : l'essai Cloud et le premier paiement de cette personne,
//     confirmés plus tard par un webhook, partent avec eux (_shared/meta-capi-deno.ts) ; cette trace EST la preuve de
//     l'accord donné au bandeau ;
//   · ESSAI de Nico (« Tester les événements » du Gestionnaire d'événements) : POST { essai_meta: { test_event_code,
//     noms? } } avec l'en-tête x-cron-secret — un compte fictif (aucune donnée de personne), trace meta_capi_essai, hors
//     de la série d'alertes. Verrou : selftest:meta-capi-envoi.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import {
  ENVOYE, FEATURE_ESSAI, FEATURE_INSCRIPTION, URL_APP, evenementInscription, evenementServeur, ipDuClient, lireDemande,
} from "../_shared/meta-capi.js";
import { envoyerAuxPixels, tracerEtSurveiller } from "../_shared/meta-capi-envoi.js";
import { depsMeta } from "../_shared/meta-capi-deno.ts";
import { envoyerEmail } from "../_shared/desinscription.ts";

const ALLOWED_ORIGINS = ["https://fillsell.app", "https://www.fillsell.app", "http://localhost:5173"];

const base = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function envoyer(texte: string, ip: string | null, ua: string) {
  const demande = lireDemande(texte);
  if (!demande) { console.warn("[meta-inscription] demande non conforme"); return; }
  const { data: u, error } = await base.auth.admin.getUserById(demande.user_id);
  if (error || !u?.user) { console.warn("[meta-inscription] compte introuvable"); return; }
  // Une seule fois par compte.
  const { data: deja } = await base.from("usage_logs").select("id").eq("user_id", demande.user_id).eq("feature", FEATURE_INSCRIPTION).limit(1);
  if (deja?.length) return;
  const r = await evenementInscription({ compte: u.user, demande, ip, ua });
  if (!("evenement" in r) || !r.evenement) { console.warn(`[meta-inscription] refus : ${(r as { refus?: string }).refus}`); return; }
  const deps = depsMeta(base, envoyerEmail);
  const envoi = await envoyerAuxPixels({ evenement: r.evenement, deps });
  await tracerEtSurveiller({
    deps, feature: FEATURE_INSCRIPTION, userId: demande.user_id,
    metadata: {
      nom: "CompleteRegistration", event_id: demande.event_id, pixels: envoi.pixels, fbtrace: envoi.fbtrace,
      fbp: Boolean(demande.fbp), fbc: Boolean(demande.fbc), source_url: demande.source_url,
      // Pour l'essai et le premier paiement de cette personne (accord donné) : jamais l'IP, jamais l'e-mail.
      contexte: { fbp: demande.fbp, fbc: demande.fbc, ua: String(ua ?? "").slice(0, 512) || null },
    },
  });
}

/** L'essai de Nico : un événement par nom, compte FICTIF, avec le code de « Tester les événements ». */
// Aucune donnée d'une personne : adresse IP de documentation (RFC 5737), navigateur fixe, compte fictif.
const IP_ESSAI = "192.0.2.10";
const UA_ESSAI = "Mozilla/5.0 (FillSell essai API de conversions)";
async function essai(corps: Record<string, unknown>) {
  const code = String((corps?.essai_meta as Record<string, unknown>)?.test_event_code ?? "").trim();
  if (!/^TEST[0-9A-Z]{2,20}$/i.test(code)) return { ok: false, erreur: "test_event_code absent ou non conforme (TEST…)" };
  const demandes = (corps?.essai_meta as Record<string, unknown>)?.noms;
  const noms = Array.isArray(demandes) && demandes.length ? demandes.map(String) : ["CompleteRegistration"];
  const compte = { id: "00000000-0000-4000-8000-0000000e5a1f", email: "essai-capi@fillsell.app", created_at: new Date().toISOString() };
  const deps = depsMeta(base, envoyerEmail);
  const bilan: Record<string, unknown> = {};
  for (const nom of noms) {
    let evenement: Record<string, unknown> | undefined;
    if (nom === "CompleteRegistration") {
      const demande = lireDemande({ user_id: compte.id, event_id: crypto.randomUUID(), source_url: URL_APP });
      evenement = (await evenementInscription({ compte, demande, ip: IP_ESSAI, ua: UA_ESSAI }) as { evenement?: Record<string, unknown> }).evenement;
    } else {
      const r = await evenementServeur({
        nom, compte, canal: "stripe", contexte: { ua: UA_ESSAI }, montant: { montant: 49.99, devise: "EUR" },
      }) as { evenement?: Record<string, unknown>; refus?: string };
      evenement = r.evenement ? { ...r.evenement, event_id: crypto.randomUUID() } : undefined;
      if (!evenement) { bilan[nom] = { refus: r.refus }; continue; }
    }
    if (!evenement) { bilan[nom] = { refus: "evenement_non_construit" }; continue; }
    const envoi = await envoyerAuxPixels({ evenement, deps, testEventCode: code });
    await tracerEtSurveiller({ deps, feature: FEATURE_ESSAI, userId: null, suivie: false, metadata: { nom, event_id: evenement.event_id, pixels: envoi.pixels, fbtrace: envoi.fbtrace, test_event_code: code } });
    bilan[nom] = { event_id: evenement.event_id, pixels: envoi.pixels, fbtrace: envoi.fbtrace };
  }
  const tousEnvoyes = Object.values(bilan).every((b) => Object.values((b as { pixels?: Record<string, string> }).pixels ?? { x: "?" }).every((s) => s === ENVOYE));
  return { ok: tousEnvoyes, bilan };
}

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const CORS = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: CORS });
  const texte = (await req.text().catch(() => "")).slice(0, 4000);
  const ua = req.headers.get("user-agent") ?? "";
  // L'essai de Nico : seulement avec le secret de cron (jamais depuis un navigateur).
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) {
    let corps: Record<string, unknown> = {};
    try { corps = JSON.parse(texte); } catch { /* corps illisible */ }
    if (corps?.essai_meta) {
      const r = await essai(corps);
      return new Response(JSON.stringify(r), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  }
  const travail = envoyer(texte, ipDuClient(req.headers), ua)
    .catch((e) => console.error("[meta-inscription] erreur :", (e as Error)?.message ?? e));
  // @ts-ignore EdgeRuntime : fourni par le runtime Supabase ; absent, on attend (comportement sûr, jamais une perte).
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(travail); else await travail;
  return new Response(null, { status: 202, headers: CORS });
});
