import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
Projection at current pace — how many more sales to reach a round profit goal`
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
Projection au rythme actuel — combien de ventes supplémentaires pour atteindre un objectif de bénéfice arrondi`;

    // ── Message utilisateur — données complètes ────────────────────────────
    const cat3 = Array.isArray(categories_top3) ? categories_top3 : [];
    const mar3 = Array.isArray(marques_top3) ? marques_top3 : [];
    const lentsDetails = Array.isArray(articles_lents_details) ? articles_lents_details : [];

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
          question ? `Question de l'utilisateur : "${question}"` : "",
        ].filter(Boolean).join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
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
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
