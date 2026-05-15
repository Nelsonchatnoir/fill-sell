import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost"];

const ALLOWED_TYPES: Record<string, string> = {
  "audio/webm":  "webm",
  "audio/mp4":   "mp4",
  "audio/aac":   "aac",
  "audio/mpeg":  "mp3",
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status !== 429) return res;
      const after = parseInt(res.headers.get("retry-after") || "30", 10);
      if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, after * 1000));
      lastErr = new Error("HTTP 429");
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    }
  }
  const err = new Error("ai_unavailable");
  (err as any).isAiUnavailable = true;
  throw err;
}

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

  // ── Auth ──────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // ── Voice quota — reads is_premium from DB (server-side, not from client) ──
  const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profileData } = await adminClient.from("profiles").select("is_premium").eq("id", user.id).single();
  const isPremiumUser = profileData?.is_premium === true;
  const { data: quotaData } = await adminClient.rpc("check_and_log_usage", {
    p_user_id: user.id,
    p_feature: "voice",
    p_is_premium: isPremiumUser,
    p_daily_limit_free: 10,
    p_monthly_limit_free: 50,
  });
  if (quotaData?.allowed === false) {
    return new Response(
      JSON.stringify({ error: "quota_exceeded", reason: quotaData.reason, limit: quotaData.limit }),
      { status: 429, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const lang = (formData.get("lang") as string | null) ?? "fr";

    if (!audioFile) {
      return new Response(JSON.stringify({ error: "Missing audio field" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    if (audioFile.size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: "File too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    let mimeType = audioFile.type;
    if (!mimeType) {
      const nameExt = (audioFile.name ?? "").split(".").pop()?.toLowerCase() ?? "";
      const extToMime: Record<string, string> = {
        webm: "audio/webm", mp4: "audio/mp4",
        aac: "audio/aac",   mp3: "audio/mpeg", mpeg: "audio/mpeg",
      };
      mimeType = extToMime[nameExt] ?? "";
    }

    const ext = ALLOWED_TYPES[mimeType];
    if (!ext) {
      return new Response(JSON.stringify({ error: "Unsupported format" }), {
        status: 415,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const outForm = new FormData();
    outForm.append("file", audioFile, `audio.${ext}`);
    outForm.append("model", "whisper-1");
    outForm.append("language", lang === "en" ? "en" : "fr");
    outForm.append("prompt", "Fill & Sell, Vinted, eBay, Erborian, Medik8, Stihl, Levi's, Zara, Nike, Adidas, Hermès, Chanel, Louboutin, Patagonia, North Face, Balenciaga, Vestiaire Collective");

    const response = await fetchWithRetry("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: outForm,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ error: errData?.error?.message ?? "OpenAI API error" }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    const data = await response.json();
    return new Response(JSON.stringify({ text: data.text ?? "" }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err: any) {
    if (err?.isAiUnavailable) {
      return new Response(JSON.stringify({ error: "ai_unavailable", retry_after: 30 }), {
        status: 503, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
