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

const SYSTEM_FR = `Tu es un assistant de répartition de prix pour une app de revente.
Tu reçois des articles achetés ensemble pour un prix total.
Pour chaque article tu dois :
1. Détecter sa catégorie parmi UNIQUEMENT : Mode, High-Tech, Maison, Électroménager,
   Luxe, Jouets, Livres, Sport, Auto-Moto, Beauté, Musique, Collection, Autre
2. Détecter sa marque si clairement impliquée, null sinon
3. Estimer une répartition logique et cohérente du prix total selon la valeur
   RELATIVE probable entre les objets
La somme DOIT être exactement égale au total fourni.
Retourne UNIQUEMENT un JSON valide sans texte ni markdown.`;

const SYSTEM_EN = `You are a price distribution assistant for a resale app.
You receive items bought together for a total price.
For each item you must:
1. Detect its category from ONLY: Mode, High-Tech, Maison, Électroménager,
   Luxe, Jouets, Livres, Sport, Auto-Moto, Beauté, Musique, Collection, Autre
2. Detect its brand if clearly implied, null otherwise
3. Estimate a logical and coherent distribution of the total price based on
   the RELATIVE probable value between items
The sum MUST exactly equal the total provided.
Return ONLY valid JSON without text or markdown.`;

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
    const { lotTotal, items, lang } = await req.json();
    const _lang = lang === "en" ? "en" : "fr";

    if (!lotTotal || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "Missing lotTotal or items" }), {
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

    // Inclure marque + description dans la ligne pour que l'IA ait le contexte complet
    const itemLines = items.map((i: { nom: string; marque?: string | null; description?: string | null }) => {
      const label = i.marque ? `${i.nom} ${i.marque}` : i.nom;
      return i.description ? `- ${label} (${i.description})` : `- ${label}`;
    }).join("\n");

    const userPrompt = _lang === "en"
      ? `Lot total: €${lotTotal}\nItems:\n${itemLines}\nReturn this JSON:\n{ "items": [{ "nom": string, "prix_estime_lot": number, "categorie": string, "marque": string | null }] }`
      : `Lot total : ${lotTotal}€\nArticles :\n${itemLines}\nRetourne ce JSON :\n{ "items": [{ "nom": string, "prix_estime_lot": number, "categorie": string, "marque": string | null }] }`;

    const response = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        temperature: 0.2,
        system: _lang === "en" ? SYSTEM_EN : SYSTEM_FR,
        messages: [{ role: "user", content: userPrompt }],
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

    let parsed: { items: Array<{ nom: string; prix_estime_lot: number; categorie: string; marque: string | null }> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "Parse error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // Correction automatique : garantit somme exacte = lotTotal
    const resultItems = parsed.items ?? [];
    if (resultItems.length > 0) {
      for (let i = 0; i < resultItems.length - 1; i++) {
        resultItems[i].prix_estime_lot = Math.round(resultItems[i].prix_estime_lot * 100) / 100;
      }
      const sumOthers = resultItems.slice(0, -1).reduce((acc, it) => acc + it.prix_estime_lot, 0);
      resultItems[resultItems.length - 1].prix_estime_lot =
        Math.round((lotTotal - sumOthers) * 100) / 100;
    }

    // Réinjecter nom, marque, description, emplacement depuis les items d'origine
    // (l'IA ne doit générer que prix_estime_lot et categorie)
    const inputItems = items as Array<{ nom: string; marque?: string | null; description?: string | null; emplacement?: string | null }>;
    const mergedItems = resultItems.map((out, idx) => ({
      ...out,
      nom: inputItems[idx]?.nom ?? out.nom,
      marque: inputItems[idx]?.marque ?? out.marque ?? null,
      description: inputItems[idx]?.description ?? null,
      emplacement: inputItems[idx]?.emplacement ?? null,
    }));

    return new Response(JSON.stringify({ items: mergedItems }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err: any) {
    if (err?.isAiUnavailable) {
      return new Response(JSON.stringify({ error: "ai_unavailable", retry_after: 30 }), {
        status: 503, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
