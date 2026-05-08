import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const SYSTEM_FR = `Tu es l'assistant IA de Fill & Sell, une app de suivi de profits pour revendeurs.
Tu analyses des deals de revente (Vinted, eBay, Leboncoin...).
Ton ton est direct, intelligent et humain — jamais cringe, jamais générique.
Tu tutoies l'utilisateur naturellement.
Tu écris UNE analyse de 1-2 phrases maximum, uniquement basée sur les données reçues.
N'invente jamais de données non fournies.
Pas de markdown. Pas d'emojis. Pas de listes. Varie ta formulation.`;

const SYSTEM_EN = `You are the AI assistant of Fill & Sell, a profit tracking app for resellers.
Your tone is direct, intelligent and human — never cringe, never generic.
Write ONE analysis of 1-2 sentences maximum, only based on the data provided.
Never invent data not provided. No markdown. No emojis. No lists. Vary your phrasing.`;

const SYSTEM_FREEFORM_FR = `Tu es expert en achat-revente sur Vinted, eBay et Leboncoin.
Tu aides les revendeurs à évaluer leurs deals rapidement.
Réponds sans astérisques, avec des emojis, en français, de façon concise (4-6 lignes max).
Commence toujours ta réponse par le nom de l'article.`;

const SYSTEM_FREEFORM_EN = `You are an expert in reselling on Vinted, eBay and Leboncoin.
You help resellers evaluate their deals quickly.
Reply without asterisks, with emojis, in English, concisely (4-6 lines max).
Always start your reply with the item name.`;

function buildFreeformPrompt(item: string, prixAchat: number | null, prixVente: number | null, frais: number | null, lang: string): string {
  const lines = [`Article : ${item}`];
  if (prixAchat != null) lines.push(lang === "en" ? `Purchase price: €${prixAchat}` : `Prix d'achat : ${prixAchat}€`);
  if (prixVente != null) lines.push(lang === "en" ? `Planned sell price: €${prixVente}` : `Prix de vente envisagé : ${prixVente}€`);
  if (frais != null) lines.push(lang === "en" ? `Fees: €${frais}` : `Frais : ${frais}€`);

  if (lang === "en") {
    if (prixVente == null) {
      lines.push("No sell price provided. Suggest a recommended sell price range based on the item name and market.");
    }
    lines.push("Reply with: 💰 recommended sell price (or range), 📈 estimated margin, ✅/❌ good deal or not, 📦 best platform to sell on.");
  } else {
    if (prixVente == null) {
      lines.push("Pas de prix de vente fourni. Suggère une fourchette de prix de revente recommandée basée sur le nom de l'article et le marché.");
    }
    lines.push("Réponds avec : 💰 prix de revente recommandé (ou fourchette), 📈 marge estimée, ✅/❌ bon deal ou pas, 📦 meilleure plateforme pour vendre.");
  }
  return lines.join("\n");
}

function buildScorePrompt(scoreResult: any, lang: string): string {
  const { score, label, dimensions, pills, context } = scoreResult;
  const { margePercent, profitNet, vsMoyenne, topPercent } = context;

  if (lang === 'en') {
    const lines = [
      `Deal Score: ${score}/10 — ${label}`,
      `Margin: ${margePercent}%`,
      `Net profit: €${profitNet}`,
    ];
    if (vsMoyenne !== null) lines.push(`Vs average: +€${vsMoyenne}`);
    if (topPercent !== null) lines.push(`Ranking: top ${topPercent}%`);
    if (pills.length > 0) lines.push(`Highlights: ${pills.join(', ')}`);
    lines.push(`Dimensions: Profit ${dimensions.profitPotentiel}/10, Liquidity ${dimensions.liquidite}/10, Safety ${dimensions.safety}/10, Upside ${dimensions.upside}/10`);
    lines.push('Write the analysis in 1-2 sentences.');
    return lines.join('\n');
  }

  const lines = [
    `Deal Score: ${score}/10 — ${label}`,
    `Marge: ${margePercent}%`,
    `Profit net: ${profitNet}€`,
  ];
  if (vsMoyenne !== null) lines.push(`Écart vs moyenne: +${vsMoyenne}€`);
  if (topPercent !== null) lines.push(`Classement: top ${topPercent}%`);
  if (pills.length > 0) lines.push(`Points forts: ${pills.join(', ')}`);
  lines.push(`Dimensions: Profit ${dimensions.profitPotentiel}/10, Liquidité ${dimensions.liquidite}/10, Safety ${dimensions.safety}/10, Upside ${dimensions.upside}/10`);
  lines.push("Génère l'analyse en 1-2 phrases.");
  return lines.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const body = await req.json();
    const _lang = body.lang === 'en' ? 'en' : 'fr';

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing API key' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    let systemPrompt: string;
    let userMsg: string;
    let maxTokens: number;

    if (body.item) {
      // Freeform mode: item description + optional prices
      const prixAchat = body.prixAchat != null ? parseFloat(body.prixAchat) : null;
      const prixVente = body.prixVente != null ? parseFloat(body.prixVente) : null;
      const frais = body.frais != null ? parseFloat(body.frais) : null;
      systemPrompt = _lang === 'en' ? SYSTEM_FREEFORM_EN : SYSTEM_FREEFORM_FR;
      userMsg = buildFreeformPrompt(body.item, prixAchat, prixVente, frais, _lang);
      maxTokens = 250;
    } else {
      // Score card mode: scoreResult object
      systemPrompt = _lang === 'en' ? SYSTEM_EN : SYSTEM_FR;
      userMsg = buildScorePrompt(body.scoreResult, _lang);
      maxTokens = 120;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        temperature: 0.4,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Anthropic API error' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const data = await response.json();
    const analysis = data?.content?.[0]?.text?.trim() ?? null;

    return new Response(JSON.stringify({ analysis }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
