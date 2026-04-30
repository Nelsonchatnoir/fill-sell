import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
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

    const ext = ALLOWED_TYPES[audioFile.type];
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
