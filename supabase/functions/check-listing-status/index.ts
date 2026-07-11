import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { orchestrateSale } from "../_shared/sale-orchestration.ts";

// v5 (2026-07-11) — ORCHESTRATEUR DB PUR, appelé par l'extension Chrome.
//
// Les v1-v4 faisaient du scraping HTTP serveur des listing_url (User-Agent
// Safari iPhone + détecteurs HTML par plateforme). Abandonné (décision
// 2026-07-11) : les IPs Supabase se font bloquer par DataDome/bot-shield, la
// fonction n'était appelée par aucun cron, et listing_url n'était jamais
// peuplé. La DÉTECTION vit désormais dans le background de l'extension
// (session réelle du vendeur, mêmes détecteurs HTML portés là-bas) ; ici ne
// reste que l'orchestration de la vente, partagée avec update-job-status :
//   POST { job_id } + Bearer JWT utilisateur
//   → garde published→sold, vente alignée confirmSell (frais 0), inventaire
//     → vendu + marges, annulation de TOUS les frères (pending inclus),
//     platform_fields.pending_removal sur les frères encore live (bandeau
//     semi-auto de l'app), email via email-tunnel.
// Voir _shared/sale-orchestration.ts pour le détail.
//
// Déploiement : supabase functions deploy check-listing-status
// (verify_jwt peut rester au défaut : l'appel porte toujours un JWT user.)

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost"];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin.startsWith("chrome-extension://");
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsOrigin = isAllowedOrigin(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authErr } = await admin.auth.getUser(authHeader.slice(7).trim());
    if (authErr || !user) return json({ error: "Token invalide ou expiré" }, 401);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ok */ }
    const jobId = body.job_id as string | undefined;
    if (!jobId) return json({ error: "job_id requis" }, 400);

    const result = await orchestrateSale(admin, user.id, jobId);
    if (!result.ok) return json({ error: result.reason ?? "Orchestration impossible" }, 409);
    return json({ success: true, sale: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[check-listing-status] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
