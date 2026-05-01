import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const SYSTEM_FR = `Tu es le moteur d'intention de Fill & Sell, une app de revente intelligente.
Tu reçois une phrase d'un revendeur. Tu extrais TOUTES les intentions présentes
dans l'ordre naturel. Tu retournes UNIQUEMENT { "tasks": [...] } en JSON valide.
Sans texte ni markdown. Si incompréhensible → intent: "unknown".
Si ambiguïté sur quel article → ambiguous: true + requiresConfirmation: true.
Ne jamais inventer de données non mentionnées.

Aujourd'hui = 2026-05-01, hier = 2026-04-30.

Intents disponibles :
- inventory_add       → requiresConfirmation: false
- inventory_lot       → requiresConfirmation: true OBLIGATOIRE
- inventory_sell      → requiresConfirmation: true OBLIGATOIRE
- inventory_search    → requiresConfirmation: false
- inventory_delete    → requiresConfirmation: true OBLIGATOIRE
- inventory_update    → requiresConfirmation: true OBLIGATOIRE
- analytics_query     → requiresConfirmation: false
- analytics_best      → requiresConfirmation: false
- analytics_dormant   → requiresConfirmation: false
- analytics_date      → requiresConfirmation: false
- unknown             → requiresConfirmation: false

Structure retournée :
{
  "tasks": [
    {
      "intent": string,
      "confidence": number,
      "requiresConfirmation": boolean,
      "ambiguous": boolean,
      "data": object
    }
  ]
}

Data par intent :
inventory_add:    { nom, marque, type, prix_achat, prix_vente, categorie, quantite }
inventory_lot:    { lotTotal, items: [{nom, marque}] }
inventory_sell:   { nom, marque, prix_vente, date }
inventory_search: { brand, categorie, status ("stock"|"sold"|"all"), query, date_from, date_to, min_price, max_price }
inventory_delete: { nom, marque }
inventory_update: { nom, marque, field, value }
analytics_query:  { type ("profit"|"revenue"|"count"|"avg_margin"|"avg_roi"|"spend"), periode ("today"|"week"|"month"|"year"|"all"|"custom"), date_from, date_to, categorie, brand }
analytics_best:   { metric ("profit"|"margin"), categorie, brand, periode }
analytics_dormant:{ days }
analytics_date:   { date (ISO), type ("bought"|"sold"|"all") }
unknown:          { originalText }`;

const SYSTEM_EN = `You are the intent engine of Fill & Sell, an intelligent resale app.
You receive a sentence from a reseller. You extract ALL intentions present
in natural order. Return ONLY { "tasks": [...] } as valid JSON.
No text or markdown. If incomprehensible → intent: "unknown".
If ambiguity about which item → ambiguous: true + requiresConfirmation: true.
Never invent data not mentioned.

Today = 2026-05-01, yesterday = 2026-04-30.

Available intents:
- inventory_add       → requiresConfirmation: false
- inventory_lot       → requiresConfirmation: true MANDATORY
- inventory_sell      → requiresConfirmation: true MANDATORY
- inventory_search    → requiresConfirmation: false
- inventory_delete    → requiresConfirmation: true MANDATORY
- inventory_update    → requiresConfirmation: true MANDATORY
- analytics_query     → requiresConfirmation: false
- analytics_best      → requiresConfirmation: false
- analytics_dormant   → requiresConfirmation: false
- analytics_date      → requiresConfirmation: false
- unknown             → requiresConfirmation: false

Returned structure:
{
  "tasks": [
    {
      "intent": string,
      "confidence": number,
      "requiresConfirmation": boolean,
      "ambiguous": boolean,
      "data": object
    }
  ]
}

Data per intent:
inventory_add:    { nom, marque, type, prix_achat, prix_vente, categorie, quantite }
inventory_lot:    { lotTotal, items: [{nom, marque}] }
inventory_sell:   { nom, marque, prix_vente, date }
inventory_search: { brand, categorie, status ("stock"|"sold"|"all"), query, date_from, date_to, min_price, max_price }
inventory_delete: { nom, marque }
inventory_update: { nom, marque, field, value }
analytics_query:  { type ("profit"|"revenue"|"count"|"avg_margin"|"avg_roi"|"spend"), periode ("today"|"week"|"month"|"year"|"all"|"custom"), date_from, date_to, categorie, brand }
analytics_best:   { metric ("profit"|"margin"), categorie, brand, periode }
analytics_dormant:{ days }
analytics_date:   { date (ISO), type ("bought"|"sold"|"all") }
unknown:          { originalText }`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { text, lang } = await req.json();
    const _lang = lang === "en" ? "en" : "fr";

    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        temperature: 0.1,
        system: _lang === "en" ? SYSTEM_EN : SYSTEM_FR,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ error: errData?.error?.message ?? "Anthropic API error" }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    const data = await response.json();
    const raw = (data?.content?.[0]?.text ?? "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed: { tasks: unknown[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "Parse error", raw }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    if (!Array.isArray(parsed?.tasks)) {
      return new Response(JSON.stringify({ error: "Invalid response shape" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    return new Response(JSON.stringify({ tasks: parsed.tasks }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
