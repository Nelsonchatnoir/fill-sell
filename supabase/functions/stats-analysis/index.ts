import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json();
    const {
      periode,
      profit,
      ventes,
      marge,
      meilleure_cat,
      meilleure_cat_pct,
      meilleur_article,
      meilleur_article_profit,
      articles_lents,
      lang,
    } = body;

    const _lang = lang === "en" ? "en" : "fr";

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const systemPrompt = _lang === "en"
      ? "You are an expert financial assistant for resellers (Vinted, eBay, Depop). Analyze the provided stats and generate a short insight (3-4 sentences max), personalized and actionable. Be direct, concrete, and encouraging. Reply in English."
      : "Tu es un assistant financier expert en revente (Vinted, eBay, Depop). Analyse les stats fournies et génère un insight court (3-4 phrases max), personnalisé et actionnable. Sois direct, concret, encourage l'utilisateur. Réponds en français.";

    const userMsg = _lang === "en"
      ? `Period: ${periode}. Net profit: ${profit}€. Sales: ${ventes}. Average margin: ${marge}%. Best category: ${meilleure_cat || "N/A"} (${meilleure_cat_pct || 0}% of profit). Best item: ${meilleur_article || "N/A"} (+${meilleur_article_profit || 0}€). Items in stock for over 30 days: ${articles_lents}.`
      : `Période : ${periode}. Profit net : ${profit}€. Ventes : ${ventes}. Marge moyenne : ${marge}%. Meilleure catégorie : ${meilleure_cat || "N/A"} (${meilleure_cat_pct || 0}% du profit). Meilleur article : ${meilleur_article || "N/A"} (+${meilleur_article_profit || 0}€). Articles en stock depuis plus de 30j : ${articles_lents}.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }],
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

    return new Response(JSON.stringify({ analysis }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
