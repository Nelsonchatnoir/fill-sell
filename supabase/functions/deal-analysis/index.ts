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

const SYSTEM_QA_FR = `Tu es expert en achat-revente sur Vinted, eBay et Leboncoin.
Tu aides les revendeurs à évaluer leurs deals et maximiser leurs profits.
Réponds uniquement aux questions business achat-revente (prix, marges, plateformes, articles).
Si la question est hors sujet, réponds brièvement que tu es spécialisé achat-revente et invite à poser une question sur un deal.
Réponds sans astérisques, avec des emojis, en français, de façon concise (5-7 lignes max).
Utilise des retours à la ligne pour aérer la réponse.`;

const SYSTEM_QA_EN = `You are an expert in reselling on Vinted, eBay and Leboncoin.
You help resellers evaluate deals and maximize profits.
Only answer business resale questions (prices, margins, platforms, items).
If off-topic, briefly say you specialize in resale and invite a deal-related question.
Reply without asterisks, with emojis, in English, concisely (5-7 lines max).
Use line breaks to keep the answer readable.`;

const SYSTEM_PRICE_ADVICE_FR = `L'utilisateur te demande un conseil de prix de revente pour un article précis.
Réponds UNIQUEMENT avec :
💰 Prix de revente recommandé (fourchette réaliste)
📈 Si prix d'achat mentionné : marge estimée + verdict (🔥 excellent / ✅ bon / ⚠️ moyen / ❌ éviter)
📦 Plateforme conseillée (1-2 max)
💡 1 conseil court pour vendre plus vite
Pas d'analyse business générale. Réponse courte (5-6 lignes max). Avec emojis. Sans astérisques.`;

const SYSTEM_PRICE_ADVICE_EN = `The user is asking for a resale price recommendation for a specific item.
Reply ONLY with:
💰 Recommended resale price (realistic range)
📈 If purchase price mentioned: estimated margin + verdict (🔥 excellent / ✅ good / ⚠️ average / ❌ avoid)
📦 Recommended platform(s) (1-2 max)
💡 1 short tip to sell faster
No general business analysis. Short reply (5-6 lines max). With emojis. No asterisks.`;

const SYSTEM_BUY_FR = `Tu es expert en achat-revente occasion (Vinted, eBay, Leboncoin, Backmarket...).
L'utilisateur envisage d'acheter un article d'occasion et te demande si c'est une bonne affaire.
Analyse le deal proposé et réponds UNIQUEMENT avec :
🛒 Verdict : ✅ Bonne affaire / ⚠️ Risqué / ❌ Trop cher
💰 Fourchette de revente estimée (prix marché actuel)
📈 Marge potentielle brute (si prix d'achat mentionné, déduis ~15% de frais estimés)
⚠️ Points de vigilance (état, réparations à prévoir, pièges fréquents pour ce type d'article)
💡 1 conseil concret (négociation possible ? plateforme optimale ? timing ?)
Si l'état est ambigu ou l'article rare/peu courant → ajoute cette ligne exactement : 📸 Envoie des photos dans l'onglet Lens pour une analyse plus précise
Sans astérisques. Avec emojis. Court (6-8 lignes max).`;

const SYSTEM_BUY_EN = `You are an expert in secondhand resale (Vinted, eBay, Facebook Marketplace, Backmarket...).
The user is considering buying a secondhand item and asks if it's a good deal.
Analyze the proposed deal and reply ONLY with:
🛒 Verdict: ✅ Good deal / ⚠️ Risky / ❌ Too expensive
💰 Estimated resale price range (current market)
📈 Potential gross margin (if purchase price mentioned, deduct ~15% estimated fees)
⚠️ Watch out for (condition, repairs needed, common traps for this type of item)
💡 1 concrete tip (can you negotiate? best platform? timing?)
If condition is ambiguous or item is rare/uncommon → add this exact line: 📸 Send photos in the Lens tab for a more precise analysis
No asterisks. With emojis. Short (6-8 lines max).`;

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

    if (body.buyAdvice) {
      // Buy advice mode: should the user buy this item?
      systemPrompt = _lang === 'en' ? SYSTEM_BUY_EN : SYSTEM_BUY_FR;
      userMsg = body.buyAdvice;
      maxTokens = 300;
    } else if (body.priceAdvice) {
      // Price advice mode: focused recommendation for a specific item
      systemPrompt = _lang === 'en' ? SYSTEM_PRICE_ADVICE_EN : SYSTEM_PRICE_ADVICE_FR;
      userMsg = body.priceAdvice;
      maxTokens = 250;
    } else if (body.question) {
      // Q&A mode: free-form resale question
      systemPrompt = _lang === 'en' ? SYSTEM_QA_EN : SYSTEM_QA_FR;
      userMsg = body.question;
      maxTokens = 300;
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
