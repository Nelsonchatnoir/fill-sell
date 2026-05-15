import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost"];

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

function buildSystemPrompt(lang: string, platforms: string, countryName: string | null, photoCount: number, isPremium: boolean): string {
  const multiNote = photoCount > 1
    ? (lang === "en"
        ? ` You have ${photoCount} photos of the same item — cross-reference them.`
        : ` Tu as ${photoCount} photos du même article — croise-les.`)
    : "";

  const schema = `{"titre":string,"marque":string|null,"categorie":"Mode"|"Luxe"|"High-Tech"|"Maison"|"Sport"|"Musique"|"Beauté"|"Collection"|"Livres"|"Auto-Moto"|"Électroménager"|"Jouets"|"Autre","description":string,"prix_achat_suggere":number|null,"prix_vente_suggere":number,"fourchette_min":number,"fourchette_max":number,"confiance":"basse"|"moyenne"|"haute","plateformes":string[],"verdict":"excellent"|"bon"|"moyen"|"eviter","notes":string}`;

  if (lang === "en") {
    if (!isPremium) {
      return `You are an expert in secondhand resale (${platforms}).${multiNote}
Analyze the item visually and return ONLY valid JSON (no markdown, no explanation):
${schema}
${countryName ? `Region: ${countryName}.` : ""} Platforms from: ${platforms}

PROCESS:
1. BRAND: Identify the brand from visible logos, labels or style cues. If uncertain, set marque to null.
2. PRICE: Estimate the resale price range based on your training knowledge of this item type and brand. Set confiance="moyenne" if uncertain, "basse" if very uncertain. Note in notes that prices are estimates.
3. RULES: verdict="excellent" if margin>40%, "bon" if>20%, "moyen" if>0%, "eviter" if negative. If purchase price provided: use it to compute verdict. notes: one actionable selling tip.`;
    }
    return `You are an expert in secondhand resale (${platforms}).${multiNote}
Analyze the item and return ONLY valid JSON (no markdown, no explanation):
${schema}
${countryName ? `Region: ${countryName}.` : ""} Platforms from: ${platforms}

MANDATORY PROCESS — follow in order:
1. BRAND VALIDATION: If you detect a brand visually, you MUST do a web search to confirm the exact spelling and that the brand exists (e.g. visual "pict pure clothing" → search → "Picture Organic Clothing"). Never return a brand without web search confirmation. If no brand found or confirmed, set marque to null.
2. PRICE ESTIMATION: Always base the price range on a real web search. Query: "[brand] [item type] Vinted price" or "[brand] [item type] site:vinted.com". If no Vinted results, try eBay. Set fourchette_min/fourchette_max from actual listings found. Mention the source in notes (e.g. "Price based on 5 Vinted listings"). If no market data found: set confiance="basse" and state it in notes.
3. RULES: verdict="excellent" if margin>40%, "bon" if>20%, "moyen" if>0%, "eviter" if negative. confiance="haute" if brand/model confirmed by search + prices found, "moyenne" if partial, "basse" if uncertain or no data. If purchase price provided: use it to compute verdict. notes: source of price estimate + one actionable selling tip.`;
  }
  if (!isPremium) {
    return `Tu es expert en achat-revente occasion (${platforms}).${multiNote}
Analyse l'article visuellement et réponds UNIQUEMENT avec du JSON valide (sans markdown, sans explication) :
${schema}
${countryName ? `Région : ${countryName}.` : ""} Plateformes parmi : ${platforms}

PROCESSUS :
1. MARQUE : Identifie la marque à partir des logos, étiquettes ou indices visuels visibles. Si incertain, mettre marque à null.
2. PRIX : Estime la fourchette de prix de revente à partir de ta connaissance de ce type d'article et de cette marque. Mettre confiance="moyenne" si incertain, "basse" si très incertain. Préciser dans notes que les prix sont estimés.
3. RÈGLES : verdict="excellent" si marge>40%, "bon" si>20%, "moyen" si>0%, "eviter" si marge négative. Si prix d'achat fourni : l'utiliser pour calculer le verdict. notes : un conseil concret pour vendre plus vite.`;
  }
  return `Tu es expert en achat-revente occasion (${platforms}).${multiNote}
Analyse l'article et réponds UNIQUEMENT avec du JSON valide (sans markdown, sans explication) :
${schema}
${countryName ? `Région : ${countryName}.` : ""} Plateformes parmi : ${platforms}

PROCESSUS OBLIGATOIRE — suivre dans l'ordre :
1. VALIDATION MARQUE : Si tu détectes une marque visuellement, tu DOIS faire une web search pour confirmer l'orthographe exacte et l'existence de la marque (ex : visuel "pict pure clothing" → recherche → "Picture Organic Clothing"). Ne jamais retourner une marque sans confirmation par web search. Si aucune marque trouvée ou confirmée, mettre marque à null.
2. ESTIMATION PRIX : Toujours baser la fourchette de prix sur une web search réelle. Requête : "[marque] [type article] Vinted prix" ou "[marque] [type article] site:vinted.fr". Si pas de résultat Vinted, essayer eBay.fr ou Leboncoin. Fixer fourchette_min/fourchette_max à partir des annonces trouvées. Mentionner la source dans notes (ex : "Prix basé sur 5 annonces Vinted"). Si aucune donnée marché trouvée : confiance="basse" et le préciser dans notes.
3. RÈGLES : verdict="excellent" si marge>40%, "bon" si>20%, "moyen" si>0%, "eviter" si marge négative. confiance="haute" si marque confirmée par recherche ET prix trouvés, "moyenne" si partiel, "basse" si incertain ou aucune donnée. Si prix d'achat fourni : l'utiliser pour calculer le verdict. notes : source de l'estimation prix + un conseil concret pour vendre plus vite.`;
}

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

async function callClaude(apiKey: string, payload: object, beta?: string): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (beta) headers["anthropic-beta"] = beta;
  const r = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => `HTTP ${r.status}`);
    throw new Error(`Anthropic ${r.status}: ${t}`);
  }
  return r.json();
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

  // ── Quota via usage_logs (lens: 3j+15m gratuit, 5j+60m premium) ──────────
  const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile } = await adminClient
    .from("profiles")
    .select("is_premium")
    .eq("id", user.id)
    .single();
  const isPremium = profile?.is_premium === true;
  const { data: quotaData } = await adminClient.rpc("check_and_log_usage", {
    p_user_id: user.id,
    p_feature: "lens",
    p_is_premium: isPremium,
    p_daily_limit_free: 3,
    p_monthly_limit_free: 15,
    p_daily_limit_premium: 5,
    p_monthly_limit_premium: 60,
  });
  if (quotaData?.allowed === false) {
    return new Response(
      JSON.stringify({ error: "quota_exceeded", reason: quotaData.reason, limit: quotaData.limit }),
      { status: 429, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  try {
    const body = await req.json();
    const { urls, description, prixAchat, lang = "fr", userCountry, userStats } = body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({ error: "Missing urls" }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const _lang = lang === "en" ? "en" : "fr";
    const countryCode = userCountry?.code ?? null;
    const countryName = userCountry?.name ?? null;
    const platforms = getPlatforms(countryCode, _lang);
    const systemPrompt = buildSystemPrompt(_lang, platforms, countryName, urls.length, isPremium);

    const textParts: string[] = [];
    if (description) textParts.push(_lang === "en" ? `Details: ${description}` : `Détails : ${description}`);
    if (prixAchat != null) textParts.push(_lang === "en" ? `Purchase price: €${prixAchat}` : `Prix d'achat : ${prixAchat}€`);
    if (userStats?.avgMargin != null) textParts.push(_lang === "en" ? `My average margin: ${userStats.avgMargin}%` : `Ma marge moyenne : ${userStats.avgMargin}%`);
    if (userStats?.topCategories?.length) textParts.push(_lang === "en" ? `My top categories: ${userStats.topCategories.join(", ")}` : `Mes meilleures catégories : ${userStats.topCategories.join(", ")}`);
    const userText = textParts.length ? textParts.join("\n") : (_lang === "en" ? "Analyze this item." : "Analyse cet article.");

    const imageContent = (urls as string[]).slice(0, 5).map(url => ({
      type: "image",
      source: { type: "url", url },
    }));

    const initialMessages = [
      { role: "user", content: [...imageContent, { type: "text", text: userText }] },
    ];

    const basePayload = {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      temperature: 0,
      system: systemPrompt,
    };

    let data: any;
    if (isPremium) {
      // Premium : web_search activé pour des prix en temps réel
      try {
        const wsMessages: any[] = [...initialMessages];
        data = await callClaude(apiKey, {
          ...basePayload,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: wsMessages,
        }, "web-search-2025-03-05");

        for (let i = 0; i < 2 && data.stop_reason === "tool_use"; i++) {
          wsMessages.push({ role: "assistant", content: data.content });
          const toolResults = (data.content as any[])
            .filter((b: any) => b.type === "tool_use")
            .map((b: any) => ({
              type: "tool_result",
              tool_use_id: b.id,
              content: b.content ?? [],
            }));
          if (!toolResults.length) break;
          wsMessages.push({ role: "user", content: toolResults });
          data = await callClaude(apiKey, {
            ...basePayload,
            tools: [{ type: "web_search_20250305", name: "web_search" }],
            messages: wsMessages,
          }, "web-search-2025-03-05");
        }
      } catch {
        data = await callClaude(apiKey, { ...basePayload, messages: initialMessages });
      }
    } else {
      // Gratuit : analyse vision directe sans web_search
      data = await callClaude(apiKey, { ...basePayload, messages: initialMessages });
    }

    const rawText = (data.content as any[] ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text as string)
      .join("")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let itemData: Record<string, unknown>;
    try {
      itemData = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        itemData = JSON.parse(match[0]);
      } else {
        throw new Error(_lang === "en" ? "AI response could not be parsed" : "Réponse IA non parsable");
      }
    }

    return new Response(JSON.stringify(itemData), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err: any) {
    console.error("[lens-analysis] Error:", err);
    if (err?.isAiUnavailable) {
      return new Response(JSON.stringify({ error: "ai_unavailable", retry_after: 30 }), {
        status: 503, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    return new Response(JSON.stringify({ error: err?.message ?? "Internal error" }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
