import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();

    if (!jwt) {
      return new Response(JSON.stringify({ error: "JWT manquant" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let userId: string;
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      userId = payload.sub;
      if (!userId) throw new Error("sub manquant");
    } catch {
      return new Response(JSON.stringify({ error: "Token invalide ou expiré" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("[delete-account] Erreur suppression auth:", deleteError.message);
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log("[delete-account] Compte supprimé:", userId);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[delete-account] Erreur inattendue:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
