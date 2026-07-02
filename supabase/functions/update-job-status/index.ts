import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Appelée par l'extension Chrome après chaque tentative de publication.
// Auth : JWT utilisateur (Bearer). L'update passe par un client scoped user
// → RLS garantit qu'un utilisateur ne peut modifier que ses propres jobs.
//
// Body : { job_id: uuid, status: string, error?: string, listing_url?: string }
//
// Transitions gérées ici (cycle de publication) :
//   pending → processing → published / failed / cancelled
//   ('pending' est aussi accepté pour ré-armer un job après un dry-run)
// Le cycle post-publication (published → sold + création de vente + annulation
// des jobs frères) reste géré par check-listing-status — ne pas le dupliquer ici.
//
// Déploiement : supabase functions deploy update-job-status --no-verify-jwt
// (le JWT est vérifié ici en code ; --no-verify-jwt évite le 401 sur le preflight OPTIONS)

const ALLOWED_STATUSES = ["pending", "processing", "published", "failed", "cancelled"];

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

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ok */ }

    const jobId = body.job_id as string | undefined;
    const status = body.status as string | undefined;

    if (!jobId || !status) return json({ error: "job_id et status requis" }, 400);
    if (!ALLOWED_STATUSES.includes(status)) {
      return json({ error: `status invalide, valeurs acceptées : ${ALLOWED_STATUSES.join(", ")}` }, 400);
    }

    const patch: Record<string, unknown> = { status };

    if (status === "published") {
      patch.published_at = new Date().toISOString();
      patch.error = null;
      if (typeof body.listing_url === "string" && body.listing_url) {
        patch.listing_url = body.listing_url;
      }
    } else if (status === "failed") {
      patch.error = typeof body.error === "string" ? body.error.slice(0, 2000) : "Erreur inconnue";
    } else if (status === "pending") {
      // Ré-armement (dry-run) : on nettoie l'erreur d'une éventuelle tentative précédente
      patch.error = null;
    }

    const { data: updated, error: updateErr } = await userClient
      .from("cross_post_jobs")
      .update(patch)
      .eq("id", jobId)
      .select("id, status")
      .maybeSingle();

    if (updateErr) return json({ error: updateErr.message }, 500);
    if (!updated) return json({ error: "Job introuvable" }, 404);

    console.log(`[update-job-status] userId=${user.id} job=${jobId} → ${status}`);

    return json({ success: true, job: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[update-job-status] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
