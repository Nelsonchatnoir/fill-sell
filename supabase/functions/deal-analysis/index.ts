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

function buildPrompt(scoreResult: any, lang: string): string {
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
    const { scoreResult, lang } = await req.json();
    const _lang = lang === 'en' ? 'en' : 'fr';

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing API key' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
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
        max_tokens: 80,
        temperature: 0.4,
        system: _lang === 'en' ? SYSTEM_EN : SYSTEM_FR,
        messages: [{ role: 'user', content: buildPrompt(scoreResult, _lang) }],
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
