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

let lastScore    = null;
let lastPills    = null;
let lastAnalysis = null;
let lastCallTime = 0;

function pillsKey(pills) { return JSON.stringify(pills ?? []); }

function buildPrompt(scoreResult, lang) {
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
    if (pills.length > 0)   lines.push(`Highlights: ${pills.join(', ')}`);
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
  if (pills.length > 0)   lines.push(`Points forts: ${pills.join(', ')}`);
  lines.push(`Dimensions: Profit ${dimensions.profitPotentiel}/10, Liquidité ${dimensions.liquidite}/10, Safety ${dimensions.safety}/10, Upside ${dimensions.upside}/10`);
  lines.push("Génère l'analyse en 1-2 phrases.");
  return lines.join('\n');
}

export async function generateDealAnalysis(scoreResult, lang = 'fr') {
  const { score, pills = [] } = scoreResult;
  const _lang = lang === 'en' ? 'en' : 'fr';
  const now   = Date.now();
  const key   = pillsKey(pills);

  if (lastAnalysis !== null) {
    if (Math.abs(score - lastScore) < 0.5 && key === pillsKey(lastPills)) return lastAnalysis;
    if (now - lastCallTime < 2500) return lastAnalysis;
  }

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        temperature: 0.4,
        system: _lang === 'en' ? SYSTEM_EN : SYSTEM_FR,
        messages: [{ role: 'user', content: buildPrompt(scoreResult, _lang) }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.content?.[0]?.text?.trim() ?? null;
    if (!text) return null;
    lastScore    = score;
    lastPills    = pills;
    lastAnalysis = text;
    lastCallTime = now;
    return text;
  } catch {
    return null;
  }
}
