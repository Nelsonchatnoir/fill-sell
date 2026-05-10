import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORMS: Record<string, string> = {
  FR: "Vinted, eBay, Leboncoin, Vestiaire Collective, Backmarket, Facebook Marketplace",
  BE: "Vinted, eBay, 2ememain, Facebook Marketplace",
  CH: "Vinted, eBay, Ricardo.ch, Facebook Marketplace",
  LU: "Vinted, eBay, Anibis, Facebook Marketplace",
  DE: "eBay Kleinanzeigen, Vinted, Rebuy, Facebook Marketplace",
  AT: "Willhaben, eBay, Vinted, Facebook Marketplace",
  ES: "Wallapop, Vinted, eBay, Milanuncios, Facebook Marketplace",
  IT: "Subito, Vinted, eBay, Facebook Marketplace",
  NL: "Marktplaats, Vinted, eBay, Facebook Marketplace",
  PT: "Olx.pt, Vinted, eBay, Facebook Marketplace",
  PL: "OLX.pl, Vinted, Allegro, Facebook Marketplace",
  SE: "Blocket, Vinted, eBay, Facebook Marketplace",
  DK: "DBA.dk, Vinted, eBay, Facebook Marketplace",
  NO: "Finn.no, Vinted, eBay, Facebook Marketplace",
  FI: "Tori.fi, Vinted, eBay, Facebook Marketplace",
  GB: "eBay UK, Depop, Vinted UK, Gumtree, Facebook Marketplace",
  IE: "DoneDeal, eBay, Vinted, Facebook Marketplace",
  US: "eBay, Poshmark, Mercari, Facebook Marketplace, OfferUp, Craigslist",
  CA: "eBay, Kijiji, Facebook Marketplace, Poshmark, OfferUp",
  MA: "Avito, OLX, Jumia, Facebook Marketplace, WhatsApp",
  DZ: "Avito, OLX, Facebook Marketplace, WhatsApp",
  TN: "OLX, Tayara, Facebook Marketplace, WhatsApp",
};

const AFRICA_CODES = new Set(["SN","CI","CM","GH","NG","KE","ZA","EG","TZ","UG","ET","ML","BF","NE","TD","MR"]);
const EUROPE_CODES = new Set(["CZ","HU","RO","SK","BG","HR","GR","RS","UA","BY","LT","LV","EE"]);
const LATAM_CODES = new Set(["MX","BR","AR","CO","CL","PE","VE","EC","BO","PY","UY"]);

function getPlatforms(countryCode: string | null, lang: string): string {
  if (countryCode && PLATFORMS[countryCode]) return PLATFORMS[countryCode];
  if (countryCode && AFRICA_CODES.has(countryCode)) return "Jumia, OLX, Facebook Marketplace, WhatsApp groupes locaux";
  if (countryCode && EUROPE_CODES.has(countryCode)) return "Vinted, eBay, OLX local, Facebook Marketplace";
  if (countryCode && LATAM_CODES.has(countryCode)) return "Mercado Libre, OLX, Facebook Marketplace, Instagram Shop";
  if (lang === "en") return "eBay, Depop, Facebook Marketplace, Vinted";
  return "Vinted, eBay, Leboncoin, Facebook Marketplace";
}

function buildSystemPrompt(lang: string, platforms: string, countryName: string | null, photoCount: number): string {
  const multiNote = photoCount > 1
    ? (lang === "en"
        ? `\nYou are analyzing ${photoCount} photos of the same item — cross-reference them for a more precise assessment.`
        : `\nTu analyses ${photoCount} photos du même article — croise-les pour une évaluation plus précise.`)
    : "";

  if (lang === "en") {
    return `You are an expert in secondhand resale (${platforms}).${multiNote}
Analyze the photo(s) of this item and reply with a structured response:
🔍 Identification: brand, model, estimated condition
💰 Recommended resale price range (based on current market)
${countryName ? `📍 Region: ${countryName} — recommend platforms adapted to this market.` : ""}
📦 Best platform(s) for this item among: ${platforms}
If a purchase price is provided: 📈 estimated margin + verdict (🔥 excellent / ✅ good deal / ⚠️ average / ❌ avoid)
💡 One concrete tip to sell faster
No asterisks. Use emojis. Short structured response (6-8 lines max).`;
  }
  return `Tu es expert en achat-revente occasion (${platforms}).${multiNote}
Analyse la/les photo(s) de cet article et réponds de façon structurée :
🔍 Identification : marque, modèle, état estimé
💰 Fourchette de prix de revente recommandée (basée sur le marché actuel)
${countryName ? `📍 Région : ${countryName} — recommande les plateformes adaptées à ce marché.` : ""}
📦 Meilleure(s) plateforme(s) pour cet article parmi : ${platforms}
Si un prix d'achat est fourni : 📈 marge estimée + verdict (🔥 excellent / ✅ bon deal / ⚠️ moyen / ❌ éviter)
💡 Un conseil concret pour vendre plus vite
Sans astérisques. Avec emojis. Réponse structurée courte (6-8 lignes max).`;
}

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

  // ── Lens quota (non-premium: 3/day) ───────────────────
  const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = new Date().toISOString().split("T")[0];
  const { data: profile } = await adminClient
    .from("profiles")
    .select("is_premium, lens_count_today, lens_count_date")
    .eq("id", user.id)
    .single();
  const isPremium = profile?.is_premium === true;
  if (!isPremium) {
    const count = profile?.lens_count_date === today ? (profile?.lens_count_today ?? 0) : 0;
    if (count >= 3) {
      return new Response(JSON.stringify({ error: "Daily lens limit reached" }), {
        status: 429, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    await adminClient
      .from("profiles")
      .update({ lens_count_today: count + 1, lens_count_date: today })
      .eq("id", user.id);
  }

  try {
    const body = await req.json();
    const {
      images,         // new: [{base64, mimeType}]
      imageBase64,    // legacy fallback
      mimeType = "image/jpeg",
      description,
      prixAchat,
      lang = "fr",
      userCountry,
      userStats,
    } = body;

    // Normalize to images array
    const photoList: { base64: string; mimeType: string }[] =
      Array.isArray(images) && images.length > 0
        ? images.slice(0, 5)
        : imageBase64
        ? [{ base64: imageBase64, mimeType }]
        : [];

    if (photoList.length === 0) {
      return new Response(JSON.stringify({ error: "Missing image" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const _lang = lang === "en" ? "en" : "fr";
    const countryCode = userCountry?.code ?? null;
    const countryName = userCountry?.name ?? null;
    const platforms = getPlatforms(countryCode, _lang);
    const systemPrompt = buildSystemPrompt(_lang, platforms, countryName, photoList.length);

    // Build text context
    const textParts: string[] = [];
    if (description) {
      textParts.push(_lang === "en" ? `Details: ${description}` : `Détails : ${description}`);
    }
    if (prixAchat != null) {
      textParts.push(_lang === "en" ? `Purchase price: €${prixAchat}` : `Prix d'achat : ${prixAchat}€`);
    }
    if (userStats?.avgMargin != null) {
      textParts.push(_lang === "en"
        ? `My average margin on similar sales: ${userStats.avgMargin}%`
        : `Ma marge moyenne sur mes ventes : ${userStats.avgMargin}%`);
    }
    if (userStats?.topCategories?.length) {
      textParts.push(_lang === "en"
        ? `My best categories: ${userStats.topCategories.join(", ")}`
        : `Mes meilleures catégories : ${userStats.topCategories.join(", ")}`);
    }
    const userText = textParts.length
      ? textParts.join("\n")
      : (_lang === "en" ? "Analyze this item." : "Analyse cet article.");

    // Build message content: all images first, then text
    const messageContent: unknown[] = [
      ...photoList.map(p => ({
        type: "image",
        source: { type: "base64", media_type: p.mimeType, data: p.base64 },
      })),
      { type: "text", text: userText },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: messageContent }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Anthropic error: ${errText}` }), {
        status: response.status,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const data = await response.json();
    const analysis = data?.content?.[0]?.text?.trim() ?? null;

    // Structured extraction using first photo
    let itemData = null;
    try {
      const firstPhoto = photoList[0];
      const structured = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 150,
          temperature: 0,
          system: "Extract item info from this image. Return ONLY valid JSON: {\"nom\":string,\"marque\":string|null,\"categorie\":string,\"description\":string|null,\"prixVenteEstime\":number|null}. categorie must be one of: Mode,Luxe,High-Tech,Maison,Sport,Musique,Beauté,Collection,Livres,Auto-Moto,Électroménager,Jouets,Autre. No markdown.",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: firstPhoto.mimeType, data: firstPhoto.base64 },
                },
                { type: "text", text: description ? `Item details: ${description}` : "Extract item data." },
              ],
            },
          ],
        }),
      });
      if (structured.ok) {
        const sd = await structured.json();
        const raw = (sd?.content?.[0]?.text ?? "").replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
        itemData = JSON.parse(raw);
      }
    } catch {
      // structured extraction is best-effort
    }

    return new Response(JSON.stringify({ analysis, itemData }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
