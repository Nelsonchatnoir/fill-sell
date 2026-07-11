import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Appelée par l'extension Chrome (background service worker) toutes les 30 min.
// Auth : JWT utilisateur (Bearer). Les jobs sont lus via un client scoped user
// → la policy RLS "Users manage own cross_post_jobs" garantit qu'on ne retourne
// que les jobs de l'utilisateur authentifié.
//
// Déploiement : supabase functions deploy get-pending-jobs
// verify_jwt reste à true (défaut) : la fonction reçoit toujours un JWT
// utilisateur, contrairement aux webhooks/cron listés dans CLAUDE.md.
// auth.getUser() ci-dessous n'est pas redondant : il fournit l'identité
// (user.id) et alimente le client scoped user pour la RLS.

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

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Token invalide ou expiré" }, 401);

    // action + listing_url (2026-07-11) : les jobs de SUPPRESSION
    // (action='delete', armés par le bandeau semi-auto de l'app après une
    // vente) passent par la même file — le background route sur job.action
    // et cible l'annonce via listing_url.
    const { data: jobs, error: jobsErr } = await userClient
      .from("cross_post_jobs")
      .select("id, platform, action, title, description, price, photos, photo_option, platform_fields, inventaire_id, listing_url, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (jobsErr) return json({ error: jobsErr.message }, 500);

    console.log(`[get-pending-jobs] userId=${user.id} → ${jobs?.length ?? 0} job(s) pending`);

    return json({ jobs: jobs ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[get-pending-jobs] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
