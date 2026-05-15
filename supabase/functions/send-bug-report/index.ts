import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost"];

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
  if (authError || !authUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  try {
    const { message, userEmail, platform, userId } = await req.json();

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "Missing message" }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    if (message.length > 2000) {
      return new Response(JSON.stringify({ error: "Message too long (max 2000 chars)" }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing Resend API key" }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#1D9E75;margin-bottom:4px">🐛 Bug Report — Fill &amp; Sell</h2>
  <p style="color:#6B7280;font-size:13px;margin-top:0">${platform} · ${new Date().toISOString()}</p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:16px 0"/>
  <div style="background:#F9FAFB;border-radius:10px;padding:16px;font-size:14px;color:#111827;white-space:pre-wrap">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:16px 0"/>
  <p style="font-size:12px;color:#9CA3AF;margin:0">User: ${userEmail ?? "unknown"}</p>
  <p style="font-size:12px;color:#9CA3AF;margin:4px 0">ID: ${userId ?? "unknown"}</p>
  <p style="font-size:12px;color:#9CA3AF;margin:4px 0">Platform: ${platform}</p>
</div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Fill & Sell <noreply@fillsell.app>",
        to: ["support@fillsell.app"],
        subject: `[Bug Report] ${platform} — ${userEmail ?? "unknown"}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: err?.message ?? "Resend error" }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
