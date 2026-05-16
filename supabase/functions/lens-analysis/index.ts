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

  const freeSchema = `{"titre":string,"marque":string|null,"categorie":"Mode"|"Luxe"|"High-Tech"|"Maison"|"Sport"|"Musique"|"Beauté"|"Collection"|"Livres"|"Auto-Moto"|"Électroménager"|"Jouets"|"Autre","description":string,"prix_achat_suggere":number|null,"prix_vente_suggere":number,"fourchette_min":number,"fourchette_max":number,"confiance":"basse"|"moyenne"|"haute","plateformes":string[],"verdict":"excellent"|"bon"|"moyen"|"eviter","score":number,"notes":string}`;
  const premiumSchema = `{"titre":string,"marque":string|null,"modele":string|null,"matiere":string|null,"etat_estime":string|null,"categorie":"Mode"|"Luxe"|"High-Tech"|"Maison"|"Sport"|"Musique"|"Beauté"|"Collection"|"Livres"|"Auto-Moto"|"Électroménager"|"Jouets"|"Autre","description":string,"prix_achat_suggere":number|null,"prix_vente_suggere":number,"fourchette_min":number,"fourchette_max":number,"fourchette_marche":{"bas":number,"moyen":number,"haut":number}|null,"vitesse_vente":"rapide"|"moyen"|"lent","vitesse_vente_explication":string|null,"plateformes":string[],"conseils":string[],"confiance":"basse"|"moyenne"|"haute","verdict":"excellent"|"bon"|"moyen"|"eviter","score":number,"notes":string}`;
  const schema = isPremium ? premiumSchema : freeSchema;

  if (lang === "en") {
    if (!isPremium) {
      return `You are an expert in secondhand resale (${platforms}).${multiNote}
Analyze the item visually and return ONLY valid JSON (no markdown, no explanation):
${schema}
${countryName ? `Region: ${countryName}.` : ""} Platforms from: ${platforms}

PROCESS:
1. BRAND & DESCRIPTION: Identify the brand from visible logos, labels or style cues. If uncertain, marque=null. Write a description of 1–2 sentences max identifying the item (brand, type, visible condition, notable features).
2. PRICE: Estimate resale price range based on your training knowledge. confiance="moyenne" if uncertain, "basse" if very uncertain. Note in notes that prices are estimates.
3. SCORE: Rate 0–10 based on potential margin, demand, and ease of resale.
4. RULES: verdict="excellent" if margin>40%, "bon" if>20%, "moyen" if>0%, "eviter" if negative. If purchase price provided: use it to compute verdict only. prix_achat_suggere: your market estimate of what to pay — set to null if user provided their purchase price. notes: one actionable selling tip.`;
    }
    return `You are an expert in secondhand resale (${platforms}).${multiNote}
Analyze the item and return ONLY valid JSON (no markdown, no explanation):
${schema}
${countryName ? `Region: ${countryName}.` : ""} Platforms from: ${platforms}

MANDATORY PROCESS — follow in order:
1. IDENTIFICATION: Identify marque, modele, matiere, etat_estime from visual cues and labels.
2. BRAND VALIDATION: If you detect a brand visually, you MUST do a web search to confirm exact spelling and existence (e.g. "pict pure clothing" → search → "Picture Organic Clothing"). Never return a brand without web search confirmation. If not found, marque=null.
3. PRICE ESTIMATION: Always base prices on a real web search. Query: "[brand] [item type] Vinted price" or site:vinted.com. Fallback: eBay. Set fourchette_min/fourchette_max AND fourchette_marche.bas/moyen/haut from actual listings. Cite source in notes (e.g. "Based on 5 Vinted listings"). If no data: confiance="basse".
4. SPEED & PLATFORMS: Estimate vitesse_vente (rapide/moyen/lent) with vitesse_vente_explication. Order plateformes by best fit for this item. Provide exactly 2–3 concrete conseils to maximise the sale.
5. SCORE: Rate 0–10 based on potential margin, demand, and ease of resale.
6. RULES: verdict="excellent" if margin>40%, "bon" if>20%, "moyen" if>0%, "eviter" if negative. confiance="haute" if brand confirmed + prices found, "moyenne" if partial, "basse" if uncertain. If purchase price provided: use ONLY for verdict/margin — NEVER anchor prix_vente_suggere on it (market data only). prix_achat_suggere: your independent market estimate — set to null if user provided their purchase price. notes: price source + one actionable tip.`;
  }
  if (!isPremium) {
    return `Tu es expert en achat-revente occasion (${platforms}).${multiNote}
Analyse l'article visuellement et réponds UNIQUEMENT avec du JSON valide (sans markdown, sans explication) :
${schema}
${countryName ? `Région : ${countryName}.` : ""} Plateformes parmi : ${platforms}

PROCESSUS :
1. MARQUE ET DESCRIPTION : Identifie la marque à partir des logos, étiquettes ou indices visuels. Si incertain, marque=null. Rédige une description de 1 à 2 phrases max identifiant l'article (marque, type, état visible, caractéristiques notables).
2. PRIX : Estime la fourchette de prix de revente d'après ta connaissance du type d'article et de la marque. confiance="moyenne" si incertain, "basse" si très incertain. Préciser dans notes que les prix sont estimés.
3. SCORE : Note de 0 à 10 basée sur la marge potentielle, la demande et la facilité de revente.
4. RÈGLES : verdict="excellent" si marge>40%, "bon" si>20%, "moyen" si>0%, "eviter" si marge négative. Si prix d'achat fourni : utiliser uniquement pour calculer le verdict. prix_achat_suggere : ton estimation marché de ce que vaut l'article à l'achat — mettre à null si prix d'achat fourni par l'utilisateur. notes : un conseil concret pour vendre plus vite.`;
  }
  return `Tu es expert en achat-revente occasion (${platforms}).${multiNote}
Analyse l'article et réponds UNIQUEMENT avec du JSON valide (sans markdown, sans explication) :
${schema}
${countryName ? `Région : ${countryName}.` : ""} Plateformes parmi : ${platforms}

PROCESSUS OBLIGATOIRE — suivre dans l'ordre :
1. IDENTIFICATION : Identifie marque, modele, matiere, etat_estime à partir des indices visuels et étiquettes.
2. VALIDATION MARQUE : Si tu détectes une marque visuellement, tu DOIS faire une web search pour confirmer l'orthographe exacte et l'existence (ex : "pict pure clothing" → recherche → "Picture Organic Clothing"). Ne jamais retourner une marque sans confirmation. Si non trouvée, marque=null.
3. ESTIMATION PRIX : Toujours baser les prix sur une web search réelle. Requête : "[marque] [type] Vinted prix" ou site:vinted.fr. Fallback : eBay.fr ou Leboncoin. Fixer fourchette_min/fourchette_max ET fourchette_marche.bas/moyen/haut à partir des annonces trouvées. Citer la source dans notes (ex : "Prix basé sur 5 annonces Vinted"). Si aucune donnée : confiance="basse".
4. VITESSE ET PLATEFORMES : Estimer vitesse_vente (rapide/moyen/lent) avec vitesse_vente_explication. Ordonner les plateformes par pertinence pour cet article. Fournir exactement 2 à 3 conseils concrets dans le champ conseils pour maximiser la vente.
5. SCORE : Note de 0 à 10 basée sur la marge potentielle, la demande et la facilité de revente.
6. RÈGLES : verdict="excellent" si marge>40%, "bon" si>20%, "moyen" si>0%, "eviter" si marge négative. confiance="haute" si marque confirmée ET prix trouvés, "moyenne" si partiel, "basse" si incertain. Si prix d'achat fourni par l'utilisateur : utiliser UNIQUEMENT pour calculer la marge et le verdict — NE JAMAIS l'utiliser pour fixer prix_vente_suggere (toujours basé sur les données marché). prix_achat_suggere : estimation marché indépendante — mettre à null si prix d'achat fourni par l'utilisateur. notes : source de l'estimation prix + un conseil concret pour vendre plus vite.`;
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
    if (prixAchat != null) textParts.push(_lang === "en" ? `My actual purchase price (cost paid): €${prixAchat}` : `Mon prix d'achat réel (coût payé) : ${prixAchat}€`);
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
      max_tokens: isPremium ? 1200 : 800,
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

    // Si l'utilisateur a fourni son prix d'achat, on ne retourne pas prix_achat_suggere
    if (prixAchat != null) itemData.prix_achat_suggere = null;

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
