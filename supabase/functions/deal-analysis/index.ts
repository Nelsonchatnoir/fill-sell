import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "https://fillsell.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getPlatforms(country: string | null): string {
  const c = (country ?? "").toUpperCase();
  if (c === "FR") return "Vinted, Leboncoin, Vestiaire Collective, BackMarket, eBay France, Facebook Marketplace";
  if (c === "GB") return "eBay UK, Vinted UK, Depop, Gumtree, Facebook Marketplace";
  if (c === "US") return "eBay, Facebook Marketplace, Poshmark, Mercari, OfferUp, Craigslist";
  if (c === "CA") return "eBay, Kijiji, Facebook Marketplace, Poshmark, OfferUp";
  if (c === "DE") return "eBay Kleinanzeigen, Vinted, Facebook Marketplace";
  if (c === "AT") return "Willhaben, eBay Kleinanzeigen, Vinted, Facebook Marketplace";
  if (c === "CH") return "Ricardo.ch, Vinted, eBay, Facebook Marketplace";
  if (["BE","NL","LU"].includes(c)) return "2ememain, Vinted, Marktplaats, Facebook Marketplace";
  if (c === "ES") return "Wallapop, Vinted, eBay, Milanuncios, Facebook Marketplace";
  if (c === "IT") return "Subito, Vinted, eBay, Facebook Marketplace";
  if (c === "PT") return "OLX.pt, Vinted, eBay, Facebook Marketplace";
  if (c === "PL") return "OLX, Allegro, Vinted, Facebook Marketplace";
  if (c === "MA") return "Avito, OLX Maroc, Facebook Marketplace";
  if (c === "DZ") return "Ouedkniss, Facebook Marketplace";
  if (c === "TN") return "Tayara, Facebook Marketplace";
  if (["SN","CI","CM","BF","ML","NE","TG","BJ","GN","GA","CG","MG","MR","TD"].includes(c)) return "Jumia, CoinAfrique, Facebook Marketplace, WhatsApp";
  if (c === "NG") return "Jiji, Jumia, Facebook Marketplace";
  if (["KE","TZ","UG"].includes(c)) return "Jiji, OLX Africa, Facebook Marketplace";
  if (c === "ZA") return "Gumtree SA, OLX SA, Facebook Marketplace";
  if (c === "TH") return "Shopee TH, Lazada TH, Kaidee, Facebook Marketplace";
  if (c === "VN") return "Shopee VN, Lazada VN, Chợ Tốt, Facebook Marketplace";
  if (c === "ID") return "Tokopedia, Shopee ID, OLX Indonesia, Facebook Marketplace";
  if (c === "PH") return "Shopee PH, Carousell, Facebook Marketplace";
  if (["MY","SG"].includes(c)) return "Carousell, Shopee, Lazada, Facebook Marketplace";
  if (c === "IN") return "OLX India, Quikr, Flipkart Second-Hand, Facebook Marketplace";
  if (c === "JP") return "Mercari JP, Yahoo Auctions JP, Rakuma";
  if (c === "KR") return "Bungaejangter, Danggeun Market, Joongna";
  if (c === "CN") return "Xianyu (闲鱼), Facebook Marketplace";
  if (c === "TW") return "Shopee TW, Carousell TW";
  if (c === "HK") return "Carousell HK, Facebook Marketplace";
  if (c === "BR") return "OLX Brasil, Mercado Livre, Facebook Marketplace";
  if (["MX","AR","CL","CO","PE","VE","EC","BO","PY","UY"].includes(c)) return "Mercado Libre, Facebook Marketplace, OLX";
  if (c === "AU") return "Gumtree AU, Facebook Marketplace, eBay AU";
  if (c === "NZ") return "Trade Me, Facebook Marketplace, eBay";
  return "eBay, Facebook Marketplace, Vinted";
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

function buildScoreSystem(lang: string): string {
  if (lang === "en") return `You are the AI assistant of Fill & Sell, a profit tracking app for resellers.
Your tone is direct, intelligent and human — never cringe, never generic.
Write ONE analysis of 1-2 sentences maximum, only based on the data provided.
Never invent data not provided. No markdown. No emojis. No lists. Vary your phrasing.`;
  return `Tu es l'assistant IA de Fill & Sell, une app de suivi de profits pour revendeurs.
Tu analyses des deals de revente. Ton ton est direct, intelligent et humain — jamais cringe, jamais générique.
Tu tutoies l'utilisateur naturellement.
Tu écris UNE analyse de 1-2 phrases maximum, uniquement basée sur les données reçues.
N'invente jamais de données non fournies. Pas de markdown. Pas d'emojis. Pas de listes. Varie ta formulation.`;
}

function buildQASystem(lang: string, platforms: string, currency: string): string {
  if (lang === "en") return `You are an expert in reselling on ${platforms}.
You help resellers evaluate deals and maximize profits.
User currency: ${currency}. Interpret amounts without explicit currency as ${currency}.
Only answer business resale questions (prices, margins, platforms, items).
If off-topic, briefly say you specialize in resale and invite a deal-related question.
Reply without asterisks, with emojis, in English, concisely (5-7 lines max).
Use line breaks to keep the answer readable.`;
  return `Tu es expert en achat-revente sur ${platforms}.
Tu aides les revendeurs à évaluer leurs deals et maximiser leurs profits.
Devise de l'utilisateur : ${currency}. Interpréter les montants sans devise explicite comme étant en ${currency}.
Réponds uniquement aux questions business achat-revente (prix, marges, plateformes, articles).
Si la question est hors sujet, réponds brièvement que tu es spécialisé achat-revente et invite à poser une question sur un deal.
Réponds sans astérisques, avec des emojis, en français, de façon concise (5-7 lignes max).
Utilise des retours à la ligne pour aérer la réponse.`;
}

function buildPriceAdviceSystem(lang: string, platforms: string, currency: string): string {
  if (lang === "en") return `The user is asking for a resale price recommendation for a specific item.
User currency: ${currency}. Interpret amounts without explicit currency as ${currency}.
Reply ONLY with:
💰 Recommended resale price range (realistic, in ${currency})
📈 If purchase price mentioned: estimated margin + verdict (🔥 excellent / ✅ good / ⚠️ average / ❌ avoid)
📦 Recommended platform(s) among: ${platforms} (1-2 max)
💡 1 short tip to sell faster
No general business analysis. Short reply (5-6 lines max). With emojis. No asterisks.`;
  return `L'utilisateur te demande un conseil de prix de revente pour un article précis.
Devise de l'utilisateur : ${currency}. Interpréter les montants sans devise explicite comme étant en ${currency}.
Réponds UNIQUEMENT avec :
💰 Prix de revente recommandé (fourchette réaliste, en ${currency})
📈 Si prix d'achat mentionné : marge estimée + verdict (🔥 excellent / ✅ bon / ⚠️ moyen / ❌ éviter)
📦 Plateforme(s) conseillée(s) parmi : ${platforms} (1-2 max)
💡 1 conseil court pour vendre plus vite
Pas d'analyse business générale. Réponse courte (5-6 lignes max). Avec emojis. Sans astérisques.`;
}

function buildBuySystem(lang: string, platforms: string, currency: string): string {
  if (lang === "en") return `You are an expert in secondhand resale (${platforms}).
The user is considering buying a secondhand item and asks if it's a good deal.
User currency: ${currency}. Interpret amounts without explicit currency as ${currency}.
Analyze the proposed deal and reply ONLY with:
🛒 Verdict: ✅ Good deal / ⚠️ Risky / ❌ Too expensive
💰 Estimated resale price range (current market, in ${currency})
📈 Potential gross margin (if purchase price mentioned, deduct ~15% estimated fees)
⚠️ Watch out for (condition, repairs needed, common traps for this type of item)
💡 1 concrete tip (can you negotiate? best platform among: ${platforms}? timing?)
If condition is ambiguous or item is rare/uncommon → add this exact line: 📸 Send photos in the Lens tab for a more precise analysis
No asterisks. With emojis. Short (6-8 lines max).`;
  return `Tu es expert en achat-revente occasion (${platforms}).
L'utilisateur envisage d'acheter un article d'occasion et te demande si c'est une bonne affaire.
Devise de l'utilisateur : ${currency}. Interpréter les montants sans devise explicite comme étant en ${currency}.
Analyse le deal proposé et réponds UNIQUEMENT avec :
🛒 Verdict : ✅ Bonne affaire / ⚠️ Risqué / ❌ Trop cher
💰 Fourchette de revente estimée (prix marché actuel, en ${currency})
📈 Marge potentielle brute (si prix d'achat mentionné, déduis ~15% de frais estimés)
⚠️ Points de vigilance (état, réparations à prévoir, pièges fréquents pour ce type d'article)
💡 1 conseil concret (négociation possible ? meilleure plateforme parmi : ${platforms} ? timing ?)
Si l'état est ambigu ou l'article rare/peu courant → ajoute cette ligne exactement : 📸 Envoie des photos dans l'onglet Lens pour une analyse plus précise
Sans astérisques. Avec emojis. Court (6-8 lignes max).`;
}

function buildScorePrompt(scoreResult: any, lang: string, currency: string): string {
  const { score, label, dimensions, pills, context } = scoreResult;
  const { margePercent, profitNet, vsMoyenne, topPercent } = context;
  const cur = currency || "EUR";

  if (lang === "en") {
    const lines = [
      `Deal Score: ${score}/10 — ${label}`,
      `Margin: ${margePercent}%`,
      `Net profit: ${profitNet} ${cur}`,
    ];
    if (vsMoyenne !== null) lines.push(`Vs average: +${vsMoyenne} ${cur}`);
    if (topPercent !== null) lines.push(`Ranking: top ${topPercent}%`);
    if (pills.length > 0) lines.push(`Highlights: ${pills.join(", ")}`);
    lines.push(`Dimensions: Profit ${dimensions.profitPotentiel}/10, Liquidity ${dimensions.liquidite}/10, Safety ${dimensions.safety}/10, Upside ${dimensions.upside}/10`);
    lines.push("Write the analysis in 1-2 sentences.");
    return lines.join("\n");
  }

  const lines = [
    `Deal Score: ${score}/10 — ${label}`,
    `Marge: ${margePercent}%`,
    `Profit net: ${profitNet} ${cur}`,
  ];
  if (vsMoyenne !== null) lines.push(`Écart vs moyenne: +${vsMoyenne} ${cur}`);
  if (topPercent !== null) lines.push(`Classement: top ${topPercent}%`);
  if (pills.length > 0) lines.push(`Points forts: ${pills.join(", ")}`);
  lines.push(`Dimensions: Profit ${dimensions.profitPotentiel}/10, Liquidité ${dimensions.liquidite}/10, Safety ${dimensions.safety}/10, Upside ${dimensions.upside}/10`);
  lines.push("Génère l'analyse en 1-2 phrases.");
  return lines.join("\n");
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
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  try {
    const body = await req.json();
    const _lang = body.lang === "en" ? "en" : "fr";
    const currency = body.currency || "EUR";
    const country = body.country || null;
    const platforms = getPlatforms(country);

    // ── Quota deal (QA, priceAdvice, buyAdvice — 10/jour gratuit, illimité premium) ──
    if (body.question || body.priceAdvice || body.buyAdvice) {
      const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: prf } = await adminClient.from("profiles").select("is_premium").eq("id", user.id).single();
      const isPremiumDeal = prf?.is_premium === true;
      const { data: quotaDeal } = await adminClient.rpc("check_and_log_usage", {
        p_user_id: user.id,
        p_feature: "deal",
        p_is_premium: isPremiumDeal,
        p_daily_limit_free: 10,
        p_monthly_limit_free: null,
        p_daily_limit_premium: null,
        p_monthly_limit_premium: null,
      });
      if (quotaDeal?.allowed === false) {
        return new Response(
          JSON.stringify({ error: "quota_exceeded", reason: quotaDeal.reason, limit: quotaDeal.limit }),
          { status: 429, headers: { "Content-Type": "application/json", ...CORS } }
        );
      }
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    let systemPrompt: string;
    let userMsg: string;
    let maxTokens: number;

    if (body.buyAdvice) {
      systemPrompt = buildBuySystem(_lang, platforms, currency);
      userMsg = body.buyAdvice;
      maxTokens = 300;
    } else if (body.priceAdvice) {
      systemPrompt = buildPriceAdviceSystem(_lang, platforms, currency);
      userMsg = body.priceAdvice;
      maxTokens = 250;
    } else if (body.question) {
      systemPrompt = buildQASystem(_lang, platforms, currency);
      userMsg = body.question;
      maxTokens = 300;
    } else {
      systemPrompt = buildScoreSystem(_lang);
      userMsg = buildScorePrompt(body.scoreResult, _lang, currency);
      maxTokens = 120;
    }

    const response = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        temperature: 0.4,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Anthropic API error" }), {
        status: response.status,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const data = await response.json();
    const analysis = data?.content?.[0]?.text?.trim() ?? null;

    return new Response(JSON.stringify({ analysis }), {
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
