import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost"];

const SYSTEM = `You are an item type normalizer for a resale app.
Given a product title, return ONLY the base item type as a short word or phrase (1-2 words max).
Strip all brand names, colors, sizes, conditions, model numbers, and any other details.
Return ONLY the generic item type noun. No punctuation, no explanation, nothing else.

Examples:
"Nike Air Force 1 Low White Sneaker" → Sneakers
"Vintage Levi's 501 Blue Slim Jeans Size 32" → Jean
"Sweatshirt Vintage Logo Rouge Taille M" → Sweatshirt
"Sac Louis Vuitton Speedy 30 Monogram" → Sac
"Apple iPhone 13 Pro 256GB Gris Sidéral" → iPhone
"Table basse IKEA LACK Noire 55x55cm" → Table
"Vase en céramique bleu turquoise" → Vase
"Adidas Ultraboost 21 White Running Shoes" → Baskets
"Guitare acoustique Yamaha FG800 Natural" → Guitare
"Canon EOS R50 Camera Body" → Appareil photo
"PlayStation 5 Console Digital Edition" → Console
"Robe fleurie Zara taille S excellent état" → Robe
"Manteau en laine beige H&M 38" → Manteau
"Perfume Chanel N°5 Eau de Parfum 100ml" → Parfum
"LEGO Star Wars 75192 Millennium Falcon" → Lego`;

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
    const { titre } = await req.json();
    if (!titre) {
      return new Response(JSON.stringify({ error: "Missing titre" }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS },
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
        max_tokens: 20,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: "user", content: titre }],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "AI error" }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const data = await response.json();
    const nom = (data?.content?.[0]?.text ?? "").trim().replace(/["'\n.→]/g, "").trim();

    return new Response(JSON.stringify({ nom: nom || titre }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
