import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_CFG: Record<string, { lang: string; system: string }> = {
  vinted: {
    lang: "fr",
    system: `Tu es un revendeur professionnel sur Vinted. Ton: conversationnel, chaleureux, quelques emojis 🌟✨, mentionne envoi rapide. Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"..."}`,
  },
  leboncoin: {
    lang: "fr",
    system: `Tu es un revendeur professionnel sur Leboncoin. Ton: direct, factuel, prix ferme ou à débattre, modes d'envoi ou remise en main propre. Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"..."}`,
  },
  beebs: {
    lang: "fr",
    system: `Tu es un revendeur sur Beebs. Ton: court, punchy, 2-3 lignes max, quelques emojis 🔥, style jeune. Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"..."}`,
  },
  ebay: {
    lang: "en",
    system: `You are a professional reseller writing eBay listings in English. Tone: structured, technical, include condition grade (Good/Very Good/Like New), measurements if relevant. Return ONLY valid JSON: {"title":"...","description":"..."}`,
  },
  vestiaire: {
    lang: "fr",
    system: `Tu es un vendeur sur Vestiaire Collective. Ton: luxueux, précis, descriptif matières et état, style magazine, pas d'emojis. Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"..."}`,
  },
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // Gate: is_pro required
    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_pro")
      .eq("id", user.id)
      .single();

    if (!profile?.is_pro) return json({ error: "Pro plan required" }, 403);

    const body = await req.json();
    const { inventaire_id, photos, platforms, photo_option } = body;

    if (
      !inventaire_id ||
      !Array.isArray(photos) || photos.length === 0 ||
      !Array.isArray(platforms) || platforms.length === 0
    ) {
      return json({ error: "Missing required fields: inventaire_id, photos, platforms" }, 400);
    }

    // Fetch inventaire item
    const { data: item, error: itemErr } = await adminClient
      .from("inventaire")
      .select("id, titre, marque, description, type, statut, prix_vente")
      .eq("id", inventaire_id)
      .single();

    if (itemErr || !item) return json({ error: "Item not found" }, 404);

    const REMOVE_BG_KEY = Deno.env.get("REMOVE_BG_API_KEY") ?? "";
    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
    const BUCKET = "listing-photos";

    if (!REMOVE_BG_KEY) {
      console.error("[generate-listing] REMOVE_BG_API_KEY secret not set");
    }

    // ── Step 1: Remove.bg on each photo ────────────────────────────────────
    const processedPhotos: Array<{ original: string; bg_removed: string; enhanced: string }> = [];

    for (let i = 0; i < photos.length; i++) {
      const original = photos[i] as string;
      let bgRemoved = original;
      let enhanced = original;

      if (REMOVE_BG_KEY) {
        try {
          // Download image locally first — image_url is blocked by some CDNs for Remove.bg
          const srcRes = await fetch(original);
          if (!srcRes.ok) {
            console.error(`[generate-listing] fetch original photo ${i} failed: ${srcRes.status}`);
          } else {
            const srcBlob = await srcRes.blob();
            const ext = original.includes(".png") ? "png" : "jpg";

            const form = new FormData();
            form.append("image_file", new File([srcBlob], `photo.${ext}`, { type: srcBlob.type || "image/jpeg" }));
            form.append("size", "auto");

            const bgRes = await fetch("https://api.remove.bg/v1.0/removebg", {
              method: "POST",
              headers: { "X-Api-Key": REMOVE_BG_KEY },
              body: form,
            });

            if (bgRes.ok) {
              const blob = await bgRes.blob();
              const path = `${user.id}/${inventaire_id}/bg_${Date.now()}_${i}.png`;
              const { error: upErr } = await adminClient.storage
                .from(BUCKET)
                .upload(path, blob, { contentType: "image/png", upsert: true });

              if (!upErr) {
                bgRemoved = adminClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
                console.log(`[generate-listing] remove.bg OK photo ${i} → ${bgRemoved}`);
              } else {
                console.error(`[generate-listing] upload bg_removed ${i}:`, upErr);
              }
            } else {
              const errText = await bgRes.text();
              console.error(`[generate-listing] remove.bg HTTP ${bgRes.status} photo ${i}:`, errText);
            }
          }
        } catch (e) {
          console.error(`[generate-listing] remove.bg exception ${i}:`, e);
        }
      }

      enhanced = bgRemoved;

      // ── Step 2: GPT-image-1 enhancement (main photo only, if photo_option=ia) ──
      if (photo_option === "ia" && i === 0) {
        try {
          const imgRes = await fetch(bgRemoved);
          const imgBlob = await imgRes.blob();
          const label = [item.marque, item.titre || item.type].filter(Boolean).join(" ") || "fashion item";

          const oaiForm = new FormData();
          oaiForm.append("model", "gpt-image-1");
          oaiForm.append("image[]", new File([imgBlob], "product.png", { type: "image/png" }));
          oaiForm.append("prompt", `Professional e-commerce product photo of this ${label}, perfectly pressed, pure white background, soft studio lighting, flat lay, ultra sharp, commercial photography style, no text, no watermark`);
          oaiForm.append("n", "1");
          oaiForm.append("size", "1024x1024");
          oaiForm.append("quality", "medium");

          const oaiRes = await fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENAI_KEY}` },
            body: oaiForm,
          });

          if (oaiRes.ok) {
            const oaiData = await oaiRes.json();
            const b64: string | undefined = oaiData.data?.[0]?.b64_json;
            if (b64) {
              const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
              const enhBlob = new Blob([binary], { type: "image/png" });
              const enhPath = `${user.id}/${inventaire_id}/enhanced_${Date.now()}.png`;
              const { error: enhErr } = await adminClient.storage
                .from(BUCKET)
                .upload(enhPath, enhBlob, { contentType: "image/png", upsert: true });
              if (!enhErr) {
                enhanced = adminClient.storage.from(BUCKET).getPublicUrl(enhPath).data.publicUrl;
              }
            }
          } else {
            console.error("[generate-listing] gpt-image-1:", await oaiRes.text());
          }
        } catch (e) {
          console.error("[generate-listing] gpt-image-1 exception:", e);
        }
      }

      processedPhotos.push({ original, bg_removed: bgRemoved, enhanced });
    }

    // ── Step 3: Claude Haiku — title + description per platform ────────────
    const itemContext = [
      item.marque && `Marque: ${item.marque}`,
      item.titre && `Article: ${item.titre}`,
      item.type && `Type: ${item.type}`,
      item.description && `Description: ${item.description}`,
      item.statut && `État: ${item.statut}`,
      item.prix_vente != null && `Prix: ${item.prix_vente}€`,
    ].filter(Boolean).join("\n");

    const fallbackTitle = [item.marque, item.titre || item.type].filter(Boolean).join(" ") || "Article";
    const platformListings: Record<string, { title: string; description: string }> = {};

    for (const platform of platforms as string[]) {
      const cfg = PLATFORM_CFG[platform];
      if (!cfg) {
        platformListings[platform] = { title: fallbackTitle, description: item.description ?? "" };
        continue;
      }

      const userMsg = cfg.lang === "en"
        ? `Write a listing for:\n${itemContext}`
        : `Rédige une annonce pour:\n${itemContext}`;

      try {
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 600,
            system: cfg.system,
            messages: [{ role: "user", content: userMsg }],
          }),
        });

        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const text: string = claudeData.content?.[0]?.text ?? "";
          const match = text.match(/\{[\s\S]*?\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            platformListings[platform] = {
              title: String(parsed.title ?? fallbackTitle),
              description: String(parsed.description ?? ""),
            };
          }
        } else {
          console.error(`[generate-listing] claude ${platform}:`, await claudeRes.text());
        }
      } catch (e) {
        console.error(`[generate-listing] claude exception ${platform}:`, e);
      }

      if (!platformListings[platform]) {
        platformListings[platform] = { title: fallbackTitle, description: item.description ?? "" };
      }
    }

    // ── Step 4: Write cross_post_jobs ───────────────────────────────────────
    const now = new Date().toISOString();
    const jobs = (platforms as string[]).map((platform) => ({
      user_id: user.id,
      inventaire_id: item.id,
      platform,
      status: "pending",
      photo_option: photo_option ?? "standard",
      title: platformListings[platform]?.title ?? fallbackTitle,
      description: platformListings[platform]?.description ?? "",
      price: item.prix_vente ?? null,
      photos: processedPhotos,
      generated_at: now,
    }));

    const { data: createdJobs, error: insertErr } = await adminClient
      .from("cross_post_jobs")
      .insert(jobs)
      .select();

    if (insertErr) {
      console.error("[generate-listing] insert:", insertErr);
      return json({ error: "Failed to create jobs", detail: insertErr.message }, 500);
    }

    return json({ jobs: createdJobs });
  } catch (e) {
    console.error("[generate-listing] unhandled:", e);
    return json({ error: "Internal server error" }, 500);
  }
});
