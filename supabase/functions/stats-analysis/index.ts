import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const SYSTEM_FR = `Tu es l'assistant IA de Fill & Sell, une app de suivi de profits pour revendeurs.
Tu analyses les performances de vente d'un revendeur sur une période donnée.
Ton ton est direct, intelligent et motivant — jamais générique, jamais cringe.
Tu tutoies l'utilisateur naturellement.
Tu écris une analyse courte de 3-4 phrases maximum, uniquement basée sur les données reçues.
N'invente jamais de données non fournies. Pas de markdown. Pas d'emojis. Pas de listes.`;

const SYSTEM_EN = `You are the AI assistant of Fill & Sell, a profit tracking app for resellers.
You analyze a reseller's sales performance over a given period.
Your tone is direct, intelligent and motivating — never generic, never cringe.
Write a short analysis of 3-4 sentences maximum, only based on the data provided.
Never invent data not provided. No markdown. No emojis. No lists.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { statsData, lang } = await req.json();
    const _lang = lang === 'en' ? 'en' : 'fr';

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing API key' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const { totalProfit, totalRev, avgMargin, salesCount, bestCategory, bestItem, range } = statsData;

    const prompt = _lang === 'en'
      ? [
          `Period: ${range}`,
          `Total profit: €${totalProfit}`,
          `Total revenue: €${totalRev}`,
          `Average margin: ${avgMargin}%`,
          `Number of sales: ${salesCount}`,
          bestCategory ? `Best category: ${bestCategory}` : null,
          bestItem ? `Best item: ${bestItem}` : null,
          'Write a 3-4 sentence personalized analysis of these results.',
        ].filter(Boolean).join('\n')
      : [
          `Période: ${range}`,
          `Profit total: ${totalProfit}€`,
          `Revenu total: ${totalRev}€`,
          `Marge moyenne: ${avgMargin}%`,
          `Nombre de ventes: ${salesCount}`,
          bestCategory ? `Meilleure catégorie: ${bestCategory}` : null,
          bestItem ? `Meilleur article: ${bestItem}` : null,
          "Génère une analyse personnalisée de 3-4 phrases sur ces résultats.",
        ].filter(Boolean).join('\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        temperature: 0.5,
        system: _lang === 'en' ? SYSTEM_EN : SYSTEM_FR,
        messages: [{ role: 'user', content: prompt }],
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
