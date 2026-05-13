import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_TYPES: Record<string, string> = {
  "audio/webm":  "webm",
  "audio/mp4":   "mp4",
  "audio/aac":   "aac",
  "audio/mpeg":  "mp3",
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

serve(async (req) => {
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

  // ── Voice quota (non-premium: 5/day) ──────────────────
  const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = new Date().toISOString().split("T")[0];
  const { data: profile } = await adminClient
    .from("profiles")
    .select("is_premium, voice_count_today, voice_count_date")
    .eq("id", user.id)
    .single();
  const isPremium = profile?.is_premium === true;
  if (!isPremium) {
    const count = profile?.voice_count_date === today ? (profile?.voice_count_today ?? 0) : 0;
    if (count >= 5) {
      return new Response(JSON.stringify({ error: "Daily voice limit reached" }), {
        status: 429, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    await adminClient
      .from("profiles")
      .update({ voice_count_today: count + 1, voice_count_date: today })
      .eq("id", user.id);
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

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
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
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
