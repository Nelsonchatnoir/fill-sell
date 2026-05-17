import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost"];

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

  try {
    const body = await req.json();
    const {
      periode,
      profit,
      profit_prev,
      ventes,
      ventes_prev,
      marge,
      ca,
      categories_top3,      // [{ cat, profit, marge_pct }]
      marques_top3,         // [{ marque, profit }]
      meilleur_article,
      meilleur_article_profit,
      articles_lents,       // nombre
      articles_lents_details, // [{ nom, jours }] top 3 les plus vieux
      stock_total,          // nombre d'articles en stock
      plateformes_ventes,   // [{ p, count, ca, profit, avgMargin }] top 5
      plateformes_stock,    // [{ p, count, invested }] top 3
      lang,
      question,
    } = body;

    const _lang = lang === "en" ? "en" : "fr";

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // ── Prompt système — analyse structurée en 5 sections ──────────────────
    const systemPrompt = _lang === "en"
      ? `You are a personal financial coach for resellers (Vinted, eBay, Depop, Leboncoin).
You receive real stats from a reseller's app. Generate a complete, personalized business analysis structured in EXACTLY 5 sections.

FORMAT RULES (MANDATORY):
- Each section starts with its emoji + title on its own line, then content
- Use **number** markdown for key figures (they will be rendered bold)
- Bullet points with "•" (not "-")
- Keep each bullet under 15 words — direct, actionable
- No generic fluff — every sentence must reference the user's actual data
- End with an encouraging closing line
- Max 350 words total

SECTIONS TO GENERATE (in this order):
## 📊 Overview
Key figures: CA, net profit, margin, sales count vs previous period

## 🔥 What's working
Top categories and brands by profit — why they work, what to double down on

## ⚠️ What's not working
Slow items (stock > 30 days), underperforming categories (margin < 20%) — specific names

## 💡 Personalized tips
2-3 concrete, actionable recommendations based strictly on this user's data

## 🎯 Monthly target
Projection at current pace — how many more sales to reach a round profit goal

If platform data is provided: mention the best/worst resale platform by margin in the relevant section (🔥 or ⚠️). Keep it to one bullet — only if data is present.`
      : `Tu es un coach financier personnel pour les revendeurs (Vinted, eBay, Depop, Leboncoin).
Tu reçois les vraies stats d'un revendeur depuis son app. Génère une analyse business complète et personnalisée structurée en EXACTEMENT 5 sections.

RÈGLES DE FORMAT (OBLIGATOIRES) :
- Chaque section commence par son emoji + titre sur sa propre ligne, puis le contenu
- Utilise **chiffre** markdown pour les données clés (elles seront rendues en gras)
- Bullets avec "•" (pas "-")
- Chaque bullet < 15 mots — direct, actionnable
- Zéro généralité — chaque phrase doit référencer les vraies données de l'utilisateur
- Termine par une phrase d'encouragement
- Max 350 mots au total

SECTIONS À GÉNÉRER (dans cet ordre) :
## 📊 Vue globale
Chiffres clés : CA, bénéfice net, marge, nombre de ventes vs mois précédent

## 🔥 Ce qui marche
Top catégories et marques par bénéfice — pourquoi ça marche, quoi intensifier

## ⚠️ Ce qui marche pas
Articles lents (stock > 30 jours), catégories sous-performantes (marge < 20%) — noms précis

## 💡 Conseils personnalisés
2-3 recommandations concrètes et actionnables basées strictement sur les données de cet utilisateur

## 🎯 Objectif du mois
Projection au rythme actuel — combien de ventes supplémentaires pour atteindre un objectif de bénéfice arrondi

Si des données de plateformes sont fournies : mentionner la meilleure/pire plateforme par marge dans la section concernée (🔥 ou ⚠️). Un seul bullet — seulement si les données sont présentes.`;

    // ── Message utilisateur — données complètes ────────────────────────────
    const cat3 = Array.isArray(categories_top3) ? categories_top3 : [];
    const mar3 = Array.isArray(marques_top3) ? marques_top3 : [];
    const lentsDetails = Array.isArray(articles_lents_details) ? articles_lents_details : [];
    const platV = Array.isArray(plateformes_ventes) ? plateformes_ventes : [];
    const platS = Array.isArray(plateformes_stock) ? plateformes_stock : [];

    const userMsg = _lang === "en"
      ? [
          `Period: ${periode || "this month"}`,
          `Revenue (CA): ${ca ?? "?"}€ | Net profit: ${profit ?? 0}€ | Avg margin: ${marge ?? 0}% | Sales: ${ventes ?? 0}`,
          profit_prev != null ? `Previous period: profit ${profit_prev}€, sales ${ventes_prev ?? 0}` : "",
          `Best category: ${cat3[0]?.cat || "N/A"} (${cat3[0]?.profit || 0}€ profit, ${cat3[0]?.marge_pct || 0}% margin)`,
          cat3[1] ? `2nd category: ${cat3[1].cat} (${cat3[1].profit}€, ${cat3[1].marge_pct}% margin)` : "",
          cat3[2] ? `3rd category: ${cat3[2].cat} (${cat3[2].profit}€, ${cat3[2].marge_pct}% margin)` : "",
          mar3[0] ? `Best brand: ${mar3[0].marque} (${mar3[0].profit}€ profit)` : "",
          mar3[1] ? `2nd brand: ${mar3[1].marque} (${mar3[1].profit}€)` : "",
          `Best single item: ${meilleur_article || "N/A"} (+${meilleur_article_profit || 0}€)`,
          `Slow items (>30 days in stock): ${articles_lents ?? 0}${lentsDetails.length ? " — incl. " + lentsDetails.map(x => `${x.nom} (${x.jours}d)`).join(", ") : ""}`,
          `Total items in stock: ${stock_total ?? "?"}`,
          platV.length ? `Sales platforms: ${platV.map(p => `${p.p} (${p.count} sales, ${p.ca}€ revenue, ${p.profit}€ profit, ${p.avgMargin}% avg margin)`).join(" | ")}` : "",
          platS.length ? `Stock platforms: ${platS.map(p => `${p.p} (${p.count} items, ${p.invested}€ invested)`).join(" | ")}` : "",
          question ? `User's question: "${question}"` : "",
        ].filter(Boolean).join("\n")
      : [
          `Période : ${periode || "ce mois"}`,
          `CA : ${ca ?? "?"}€ | Bénéfice net : ${profit ?? 0}€ | Marge moy. : ${marge ?? 0}% | Ventes : ${ventes ?? 0}`,
          profit_prev != null ? `Période précédente : bénéfice ${profit_prev}€, ventes ${ventes_prev ?? 0}` : "",
          `Meilleure catégorie : ${cat3[0]?.cat || "N/A"} (${cat3[0]?.profit || 0}€ de bénéfice, ${cat3[0]?.marge_pct || 0}% de marge)`,
          cat3[1] ? `2e catégorie : ${cat3[1].cat} (${cat3[1].profit}€, ${cat3[1].marge_pct}% de marge)` : "",
          cat3[2] ? `3e catégorie : ${cat3[2].cat} (${cat3[2].profit}€, ${cat3[2].marge_pct}% de marge)` : "",
          mar3[0] ? `Meilleure marque : ${mar3[0].marque} (${mar3[0].profit}€ de bénéfice)` : "",
          mar3[1] ? `2e marque : ${mar3[1].marque} (${mar3[1].profit}€)` : "",
          `Meilleur article : ${meilleur_article || "N/A"} (+${meilleur_article_profit || 0}€)`,
          `Articles lents (>30j en stock) : ${articles_lents ?? 0}${lentsDetails.length ? " — dont " + lentsDetails.map(x => `${x.nom} (${x.jours}j)`).join(", ") : ""}`,
          `Total articles en stock : ${stock_total ?? "?"}`,
          platV.length ? `Plateformes de ventes : ${platV.map(p => `${p.p} (${p.count} ventes, ${p.ca}€ CA, ${p.profit}€ bénéfice, ${p.avgMargin}% marge moy.)`).join(" | ")}` : "",
          platS.length ? `Stock par plateforme : ${platS.map(p => `${p.p} (${p.count} articles, ${p.invested}€ investis)`).join(" | ")}` : "",
          question ? `Question de l'utilisateur : "${question}"` : "",
        ].filter(Boolean).join("\n");

    const response = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
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
  } catch (err: any) {
    if (err?.isAiUnavailable) {
      return new Response(JSON.stringify({ error: "ai_unavailable", retry_after: 30 }), {
        status: 503, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
