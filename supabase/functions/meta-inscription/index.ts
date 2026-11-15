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
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { evenementInscription, ipDuClient, lireDemande, nomSecretJeton, PIXELS_META, urlEnvoi } from "../_shared/meta-capi.js";

const ALLOWED_ORIGINS = ["https://fillsell.app", "https://www.fillsell.app", "http://localhost:5173"];
const FEATURE = "meta_capi_inscription";

const base = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function envoyer(texte: string, ip: string | null, ua: string) {
  const demande = lireDemande(texte);
  if (!demande) { console.warn("[meta-inscription] demande non conforme"); return; }
  const { data: u, error } = await base.auth.admin.getUserById(demande.user_id);
  if (error || !u?.user) { console.warn("[meta-inscription] compte introuvable"); return; }
  // Une seule fois par compte.
  const { data: deja } = await base.from("usage_logs").select("id").eq("user_id", demande.user_id).eq("feature", FEATURE).limit(1);
  if (deja?.length) return;
  const r = await evenementInscription({ compte: u.user, demande, ip, ua });
  if (!("evenement" in r) || !r.evenement) { console.warn(`[meta-inscription] refus : ${(r as { refus?: string }).refus}`); return; }
  const pixels: Record<string, string> = {};
  await Promise.all(PIXELS_META.map(async (pixel: string) => {
    const jeton = Deno.env.get(nomSecretJeton(pixel));
    if (!jeton) { pixels[pixel] = "jeton_absent"; return; }
    try {
      const rep = await fetch(urlEnvoi(pixel), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [r.evenement], access_token: jeton }),
        signal: AbortSignal.timeout(10_000),
      });
      const corps = await rep.json().catch(() => null);
      pixels[pixel] = rep.ok ? `ok:${corps?.events_received ?? "?"}` : `http_${rep.status}:${String(corps?.error?.message ?? "").slice(0, 120)}`;
    } catch (e) {
      pixels[pixel] = `echec:${String((e as Error)?.message ?? e).slice(0, 120)}`;
    }
  }));
  const { error: eLog } = await base.from("usage_logs").insert({
    user_id: demande.user_id,
    feature: FEATURE,
    metadata: { event_id: demande.event_id, pixels, fbp: Boolean(demande.fbp), fbc: Boolean(demande.fbc), source_url: demande.source_url },
  });
  if (eLog) console.error("[meta-inscription] trace non écrite :", eLog.message);
  const ratés = Object.entries(pixels).filter(([, s]) => !s.startsWith("ok:"));
  if (ratés.length) console.error("[meta-inscription] envoi raté :", JSON.stringify(Object.fromEntries(ratés)));
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
  const travail = envoyer(texte, ipDuClient(req.headers), req.headers.get("user-agent") ?? "")
    .catch((e) => console.error("[meta-inscription] erreur :", (e as Error)?.message ?? e));
  // @ts-ignore EdgeRuntime : fourni par le runtime Supabase ; absent, on attend (comportement sûr, jamais une perte).
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(travail); else await travail;
  return new Response(null, { status: 202, headers: CORS });
});
