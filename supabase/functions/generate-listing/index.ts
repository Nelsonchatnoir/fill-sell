import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_CFG: Record<string, { lang: string; system: string }> = {
  vinted: {
    lang: "fr",
    system: `Tu es un revendeur professionnel sur Vinted. Ton: conversationnel, chaleureux, quelques emojis 🌟✨, mentionne envoi rapide. Infère taille, matière, état et marque depuis le contexte article. Si un champ ne s'applique pas (ex: taille pour un objet), utilise null. Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"...","platform_fields":{"taille":"XS|S|M|L|XL|XXL|Unique|null","matiere":"...ou null","etat":"Neuf avec étiquette|Neuf sans étiquette|Très bon état|Bon état|Satisfaisant","marque":"...ou null"}}`,
  },
  leboncoin: {
    lang: "fr",
    system: `Tu es un revendeur professionnel sur Leboncoin. Ton: direct, factuel, prix ferme ou à débattre, modes d'envoi ou remise en main propre. Infère l'état et le format colis depuis le contexte article. Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"...","platform_fields":{"etat":"Neuf|Très bon état|Bon état|État correct|Pour pièces","format_colis":"Lettre|Petit colis|Moyen colis|Grand colis|Très grand colis|Non défini"}}`,
  },
  beebs: {
    lang: "fr",
    system: `Tu es un revendeur sur Beebs. Ton: court, punchy, 2-3 lignes max, quelques emojis 🔥, style jeune. Infère taille, état et marque depuis le contexte. Si un champ ne s'applique pas, utilise null. Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"...","platform_fields":{"taille":"XS|S|M|L|XL|XXL|Unique|null","etat":"Neuf|Très bon état|Bon état","marque":"...ou null"}}`,
  },
  ebay: {
    lang: "en",
    system: `You are a professional reseller writing eBay listings in English. Tone: structured, technical. Infer size, material, condition and brand from the item context. Use null if a field doesn't apply (e.g. size for a non-clothing item). Return ONLY valid JSON: {"title":"...","description":"...","platform_fields":{"size":"XS|S|M|L|XL|XXL|One Size|null","material":"...or null","condition":"New|Like New|Very Good|Good|Acceptable","brand":"...or null"}}`,
  },
  vestiaire: {
    lang: "fr",
    system: `Tu es un vendeur sur Vestiaire Collective. Ton: luxueux, précis, descriptif matières et état, style magazine, pas d'emojis. Infère taille, matière, état et marque depuis le contexte. Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"...","platform_fields":{"taille":"XS|S|M|L|XL|XXL|Unique|null","matiere":"...ou null","etat":"Neuf avec étiquette|Neuf sans étiquette|Excellent état|Très bon état|Bon état","marque":"...ou null"}}`,
  },
};

// 6 angle prompts — GPT-image-1 generates each from the original photo
const ANGLES = [
  {
    type: "vue_globale",
    prompt: "Product photo of this exact garment, lightly pressed, soft natural window light, neutral warm background, flat lay, preserve all colors logos and prints exactly, full view, lifestyle feel",
  },
  {
    type: "vue_rapprochee",
    prompt: "Same garment, natural window light, neutral warm background, close-up upper half, preserve all details exactly",
  },
  {
    type: "zoom_logo",
    prompt: "Same garment, macro shot of the logo/brand mark, natural light, sharp focus, preserve exact colors and typography",
  },
  {
    type: "detail_matiere",
    prompt: "Same garment, macro shot of the fabric texture, natural light, sharp focus",
  },
  {
    type: "etiquette",
    prompt: "Same garment, close-up of the care label/tag, natural light, sharp and readable",
  },
  {
    type: "vue_dos",
    prompt: "Same garment back view, lightly pressed, natural window light, neutral warm background, flat lay",
  },
];

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

    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_pro")
      .eq("id", user.id)
      .single();

    if (!profile?.is_pro) return json({ error: "Pro plan required" }, 403);

    const body = await req.json();
    const { inventaire_id, photos, platforms } = body;
    // photo_option: "ia_multi" (6 angles), "ia_simple" (1 angle), "original" (no AI)
    const photo_option = (body.photo_option as string) || "ia_multi";
    // price may be pre-fetched client-side; used as fallback if prix_vente is null in DB
    const body_price = body.price != null ? Number(body.price) : null;

    if (
      !inventaire_id ||
      !Array.isArray(photos) || photos.length === 0 ||
      !Array.isArray(platforms) || platforms.length === 0
    ) {
      return json({ error: "Missing required fields: inventaire_id, photos, platforms" }, 400);
    }

    const { data: item, error: itemErr } = await adminClient
      .from("inventaire")
      .select("id, titre, marque, description, type, statut, prix_vente")
      .eq("id", inventaire_id)
      .single();

    if (itemErr || !item) return json({ error: "Item not found" }, 404);

    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
    const BUCKET = "listing-photos";
    const originalUrl = photos[0] as string;

    // ── Step 1 & 2: Photo processing ──────────────────────────────────────────
    let processedPhotos: Array<{ type: string; url: string }>;

    if (photo_option === "original") {
      // No AI generation — return photos as-is
      processedPhotos = (photos as string[]).map((url, i) => ({
        type: i === 0 ? "original" : `photo_${i}`,
        url,
      }));
    } else {
      // GPT-image-1: "ia_simple" → first angle only, "ia_multi" → all 6
      const srcRes = await fetch(originalUrl);
      if (!srcRes.ok) {
        console.error(`[generate-listing] fetch original failed: ${srcRes.status}`);
        return json({ error: "Failed to fetch uploaded photo" }, 500);
      }
      const srcBlob = await srcRes.blob();
      const srcType = srcBlob.type || "image/jpeg";
      const ts = Date.now();
      const anglesToProcess = photo_option === "ia_simple" ? ANGLES.slice(0, 1) : ANGLES;

      const angleResults = await Promise.allSettled(
        anglesToProcess.map(async (angle, idx) => {
          const form = new FormData();
          form.append("model", "gpt-image-1");
          form.append("image", new File([srcBlob], "product.jpg", { type: srcType }));
          form.append("prompt", angle.prompt);
          form.append("n", "1");
          form.append("size", "1024x1024");
          form.append("quality", "medium");
          form.append("response_format", "b64_json");

          const res = await fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENAI_KEY}` },
            body: form,
          });

          if (!res.ok) {
            const err = await res.text();
            console.error(`[generate-listing] gpt-image-1 ${angle.type} HTTP ${res.status}:`, err);
            return { type: angle.type, url: originalUrl };
          }

          const data = await res.json();
          const b64: string | undefined = data.data?.[0]?.b64_json;
          if (!b64) {
            console.error(`[generate-listing] gpt-image-1 ${angle.type}: no b64_json`);
            return { type: angle.type, url: originalUrl };
          }

          const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const outBlob = new Blob([binary], { type: "image/png" });
          const path = `${user.id}/${inventaire_id}/${angle.type}_${ts}_${idx}.png`;

          const { error: upErr } = await adminClient.storage
            .from(BUCKET)
            .upload(path, outBlob, { contentType: "image/png", upsert: true });

          if (upErr) {
            console.error(`[generate-listing] upload ${angle.type}:`, upErr);
            return { type: angle.type, url: originalUrl };
          }

          const url = adminClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          console.log(`[generate-listing] angle ${angle.type} OK → ${url}`);
          return { type: angle.type, url };
        })
      );

      processedPhotos = [
        { type: "original", url: originalUrl },
        ...angleResults.map((r, i) =>
          r.status === "fulfilled" ? r.value : { type: anglesToProcess[i].type, url: originalUrl }
        ),
      ];
    }

    // ── Step 3: Claude Haiku — title + description per platform ──────────────
    const itemContext = [
      item.marque && `Marque: ${item.marque}`,
      item.titre && `Article: ${item.titre}`,
      item.type && `Type: ${item.type}`,
      item.description && `Description: ${item.description}`,
      item.statut && `État: ${item.statut}`,
      item.prix_vente != null && `Prix: ${item.prix_vente}€`,
    ].filter(Boolean).join("\n");

    const fallbackTitle = [item.marque, item.titre || item.type].filter(Boolean).join(" ") || "Article";
    const platformListings: Record<string, { title: string; description: string; platform_fields: Record<string, string | null> }> = {};

    for (const platform of platforms as string[]) {
      const cfg = PLATFORM_CFG[platform];
      if (!cfg) {
        platformListings[platform] = { title: fallbackTitle, description: item.description ?? "", platform_fields: {} };
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
            max_tokens: 900,
            system: cfg.system,
            messages: [{ role: "user", content: userMsg }],
          }),
        });

        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const text: string = claudeData.content?.[0]?.text ?? "";
          const firstBrace = text.indexOf("{");
          const lastBrace = text.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            try {
              const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
              platformListings[platform] = {
                title: String(parsed.title ?? fallbackTitle),
                description: String(parsed.description ?? ""),
                platform_fields: parsed.platform_fields ?? {},
              };
            } catch (parseErr) {
              console.error(`[generate-listing] JSON parse error ${platform}:`, parseErr);
            }
          }
        } else {
          console.error(`[generate-listing] claude ${platform}:`, await claudeRes.text());
        }
      } catch (e) {
        console.error(`[generate-listing] claude exception ${platform}:`, e);
      }

      if (!platformListings[platform]) {
        platformListings[platform] = { title: fallbackTitle, description: item.description ?? "", platform_fields: {} };
      }
    }

    // ── Return generated data (INSERT happens client-side in ListingPreviewScreen) ──
    return json({
      photos: processedPhotos,
      platforms: platformListings,
      price: item.prix_vente ?? body_price ?? null,
    });

  } catch (e) {
    console.error("[generate-listing] unhandled:", e);
    return json({ error: "Internal server error" }, 500);
  }
});
