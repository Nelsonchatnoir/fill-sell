let lastScore    = null;
let lastPills    = null;
let lastAnalysis = null;
let lastCallTime = 0;

function pillsKey(pills) { return JSON.stringify(pills ?? []); }

export async function generateDealAnalysis(scoreResult, lang = 'fr', currency = 'EUR', country = null) {
  const { score, pills = [] } = scoreResult;
  const _lang = lang === 'en' ? 'en' : 'fr';
  const now   = Date.now();
  const key   = pillsKey(pills);

  if (lastAnalysis !== null) {
    if (Math.abs(score - lastScore) < 0.5 && key === pillsKey(lastPills)) return lastAnalysis;
    if (now - lastCallTime < 2500) return lastAnalysis;
  }

  try {
    const response = await fetch(
      'https://tojihnuawsoohlolangc.supabase.co/functions/v1/deal-analysis',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoreResult, lang: _lang, currency, country }),
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.analysis?.trim() ?? null;
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
