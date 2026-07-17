import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];

const PLATFORMS: Record<string, string> = {
  FR: "Vinted, eBay, Leboncoin, Vestiaire Collective, Backmarket, Facebook Marketplace",
  BE: "Vinted, eBay, 2ememain, Facebook Marketplace",
  CH: "Vinted, eBay, Ricardo.ch, Facebook Marketplace",
  LU: "Vinted, eBay, Anibis, Facebook Marketplace",
  DE: "eBay Kleinanzeigen, Vinted, Rebuy, Facebook Marketplace",
  AT: "Willhaben, eBay, Vinted, Facebook Marketplace",
  ES: "Wallapop, Vinted, eBay, Milanuncios, Facebook Marketplace",
  IT: "Subito, Vinted, eBay, Facebook Marketplace",
  NL: "Marktplaats, Vinted, eBay, Facebook Marketplace",
  PT: "Olx.pt, Vinted, eBay, Facebook Marketplace",
  PL: "OLX.pl, Vinted, Allegro, Facebook Marketplace",
  SE: "Blocket, Vinted, eBay, Facebook Marketplace",
  DK: "DBA.dk, Vinted, eBay, Facebook Marketplace",
  NO: "Finn.no, Vinted, eBay, Facebook Marketplace",
  FI: "Tori.fi, Vinted, eBay, Facebook Marketplace",
  GB: "eBay UK, Depop, Vinted UK, Gumtree, Facebook Marketplace",
  IE: "DoneDeal, eBay, Vinted, Facebook Marketplace",
  US: "eBay, Poshmark, Mercari, Facebook Marketplace, OfferUp, Craigslist",
  CA: "eBay, Kijiji, Facebook Marketplace, Poshmark, OfferUp",
  MA: "Avito, OLX, Jumia, Facebook Marketplace, WhatsApp",
  DZ: "Avito, OLX, Facebook Marketplace, WhatsApp",
  TN: "OLX, Tayara, Facebook Marketplace, WhatsApp",
};

const AFRICA_CODES = new Set(["SN","CI","CM","GH","NG","KE","ZA","EG","TZ","UG","ET","ML","BF","NE","TD","MR"]);
const EUROPE_CODES = new Set(["CZ","HU","RO","SK","BG","HR","GR","RS","UA","BY","LT","LV","EE"]);
const LATAM_CODES = new Set(["MX","BR","AR","CO","CL","PE","VE","EC","BO","PY","UY"]);

function getPlatforms(countryCode: string | null, lang: string): string {
  if (countryCode && PLATFORMS[countryCode]) return PLATFORMS[countryCode];
  if (countryCode && AFRICA_CODES.has(countryCode)) return "Jumia, OLX, Facebook Marketplace, WhatsApp groupes locaux";
  if (countryCode && EUROPE_CODES.has(countryCode)) return "Vinted, eBay, OLX local, Facebook Marketplace";
  if (countryCode && LATAM_CODES.has(countryCode)) return "Mercado Libre, OLX, Facebook Marketplace, Instagram Shop";
  if (lang === "en") return "eBay, Depop, Facebook Marketplace, Vinted";
  return "Vinted, eBay, Leboncoin, Facebook Marketplace";
}

// Qualité unifiée (2026-07) : un seul prompt — l'ex-analyse Premium avec
// web_search — pour TOUS les tiers. Chaque analyse coûte des Pépites
// (coin_config.price_lens_overflow) ; la différenciation par tier se fait
// uniquement sur le grant mensuel de Pépites (free=30, premium=150, pro=600).
function buildSystemPrompt(lang: string, platforms: string, countryName: string | null, photoCount: number): string {
  const multiNote = photoCount > 1
    ? (lang === "en"
        ? ` You have ${photoCount} photos of the same item — cross-reference them.`
        : ` Tu as ${photoCount} photos du même article — croise-les.`)
    : "";

  const schema = `{"titre":string,"marque":string|null,"modele":string|null,"matiere":string|null,"etat_estime":string|null,"taille_estimee":string|null,"categorie":"Mode"|"High-Tech"|"Maison"|"Sport"|"Musique"|"Beauté"|"Collection"|"Livres"|"Auto-Moto"|"Électroménager"|"Jouets"|"Autre","description":string,"prix_achat_reel":number|null,"prix_achat_suggere":number|null,"prix_vente_suggere":number,"fourchette_min":number,"fourchette_max":number,"fourchette_marche":{"bas":number,"moyen":number,"haut":number}|null,"vitesse_vente":"rapide"|"moyen"|"lent","vitesse_vente_explication":string|null,"plateformes":string[],"conseils":string[],"confiance":"basse"|"moyenne"|"haute","verdict":"excellent"|"bon"|"moyen"|"eviter","score":number,"notes":string,"est_vendu":boolean,"prix_vente_reel":number|null,"attributs_visibles":{"nom_parfum":string,"volume":string,"teinte":string,"reference_fabricant":string,"taille_ecran":string,"capacite":string,"hauteur":string,"largeur":string,"longueur":string}|null}`;
  // attributs_visibles (2026-07-16, chantier champs obligatoires eBay) :
  // clés TOUTES optionnelles — seules celles réellement LUES sur l'article
  // apparaissent. Consommées par le flux resolve_aspects (aspects eBay
  // obligatoires sans champ dédié : Nom de parfum, Volume, Numéro de pièce
  // fabricant, dimensions…). ⚠️ Déploiement lens-analysis GATED : juste
  // avant le merge vers main, jamais avant (consigne du 2026-07-16).

  if (lang === "en") {
    return `You are an expert in secondhand resale (${platforms}).${multiNote}
Analyze the item and return ONLY valid JSON (no markdown, no explanation):
${schema}
${countryName ? `Region: ${countryName}.` : ""} Platforms from: ${platforms}

MANDATORY PROCESS — follow in order:
1. IDENTIFICATION: Identify marque, modele, matiere, etat_estime from visual cues and labels. For taille_estimee (size), prioritize the "User note:" field first: if the user writes a size in free text (e.g. "size M", "taille 42", "pointure 42", "US 9", "UK 8"), use that. Infer from context whether the item is a garment (letter sizes XS-XXL or EU numeric 34-52) or a shoe (EU/US/UK shoe size). For garments, keep the exact system the user wrote in (e.g. "M", "42") — never convert speculatively. For shoes, always format the value as "EU {n}" (e.g. "EU 42", "EU 38.5") regardless of language, even if the user wrote a bare number or a US/UK size you can reliably convert to EU — this avoids confusion with garment numeric sizes. Only if no size appears in the user note, try to read it visually from a tag/label in the photos. If still nothing found, set taille_estimee=null — never invent a value. Since the app is in English, append the US shoe-size equivalent in parentheses only when a reliable EU→US conversion exists (e.g. "EU 42 (US 9)") — omit it if you're not confident in the conversion.
1bis. VISIBLE ATTRIBUTES: fill attributs_visibles ONLY with values READ on the item, its label or packaging — NEVER estimated or speculatively converted: nom_parfum (fragrance commercial name), volume ("50 ml", with a space), teinte (cosmetics shade), reference_fabricant (printed MPN/reference), taille_ecran ("6,7 pouces"), capacite ("128 Go"), hauteur/largeur/longueur (ONLY if numeric measurements are printed or visible on a measuring tape in a photo, with unit "80 cm"). Required confidence: include a key ONLY if the reading is CLEAR — blurry photo, partial text or deduction = key ABSENT. Nothing legible → attributs_visibles=null.
2. BRAND VALIDATION: If you detect a brand visually, you MUST do a web search to confirm exact spelling and existence (e.g. "pict pure clothing" → search → "Picture Organic Clothing"). Never return a brand without web search confirmation. If not found, marque=null.
3. PRICE ESTIMATION: Always base prices on a real web search. Query: "[brand] [item type] Vinted price" or site:vinted.com. Fallback: eBay. Set fourchette_min/fourchette_max AND fourchette_marche.bas/moyen/haut from actual listings. Cite source in notes (e.g. "Based on 5 Vinted listings"). If no data: confiance="basse".
4. SPEED & PLATFORMS: Estimate vitesse_vente (rapide/moyen/lent) with vitesse_vente_explication. Order plateformes by best fit for this item. Provide exactly 2–3 concrete conseils to maximise the sale.
5. SCORE: Rate 0–10 based on potential margin, demand, and ease of resale.
6. PURCHASE PRICE EXTRACTION: Read the field labelled "User note:" in the message. If the user mentions a price they paid — in any form ("bought for 20", "paid €15", "cost me 8 euros", "acheté 50e", etc.) — extract the numeric value and set prix_achat_reel to that number. If no price is mentioned, set prix_achat_reel to null.
7. SALE DETECTION: Read the "User note:" field. If the user says they already sold this item — in any form ("sold for 80€", "sold it for X", "I sold it", "vendu 80€", "je l'ai vendu", etc.) — set est_vendu: true and prix_vente_reel to the numeric sale amount. Otherwise set est_vendu: false and prix_vente_reel: null.
8. RULES:
   MARGIN CALCULATION (strict priority):
   - If prix_achat_reel is not null: margin = prix_vente_suggere − prix_achat_reel. This is the ONLY basis for verdict and score. NEVER anchor prix_vente_suggere on it (market data only).
   - If prix_achat_reel is null: margin = prix_vente_suggere − prix_achat_suggere.
   VERDICT (margin-only, no exceptions): verdict="excellent" if margin>40% of prix_vente_suggere, "bon" if>20%, "moyen" if>0%, "eviter" if margin≤0.
   CRITICAL: if prix_achat_reel is known and margin is negative or zero → verdict MUST be "eviter". Strong brand and high demand are secondary factors — they NEVER override a negative real margin.
   SCORE (0–10, reflects real profitability): negative margin → 0–3; margin 0–20% → 4–5; margin 20–40% → 6–7; margin >40% → 8–10. Adjust ±1 for demand/ease, but NEVER above 4 if real margin is negative.
   confiance="haute" if brand confirmed + prices found, "moyenne" if partial, "basse" if uncertain.
   prix_achat_suggere: your independent market estimate — set to null if prix_achat_reel is not null. notes: price source + one actionable tip.`;
  }
  return `Tu es expert en achat-revente occasion (${platforms}).${multiNote}
Analyse l'article et réponds UNIQUEMENT avec du JSON valide (sans markdown, sans explication) :
${schema}
${countryName ? `Région : ${countryName}.` : ""} Plateformes parmi : ${platforms}

PROCESSUS OBLIGATOIRE — suivre dans l'ordre :
1. IDENTIFICATION : Identifie marque, modele, matiere, etat_estime à partir des indices visuels et étiquettes. Pour taille_estimee, priorise d'abord le champ "Note de l'utilisateur :" : si l'utilisateur écrit une taille en texte libre (ex : "taille M", "taille 42", "pointure 42", "US 9", "UK 8"), utilise-la. Déduis du contexte s'il s'agit d'un vêtement (tailles lettres XS-XXL ou numériques FR/EU 34-52) ou d'une chaussure (pointure EU/US/UK). Pour un vêtement, garde le système exact utilisé par l'utilisateur (ex : "M", "42") — ne convertis jamais de façon spéculative. Pour une chaussure, formate toujours la valeur en "EU {n}" (ex : "EU 42", "EU 38.5"), même si l'utilisateur a écrit un nombre seul ou une pointure US/UK que tu peux convertir de façon fiable en EU — ça évite la confusion avec les tailles vêtement numériques. Seulement si aucune taille n'apparaît dans la note utilisateur, essaie de la lire visuellement sur une étiquette en photo. Si toujours rien trouvé, mets taille_estimee=null — n'invente jamais de valeur.
1bis. ATTRIBUTS VISIBLES : renseigne attributs_visibles UNIQUEMENT avec des valeurs LUES sur l'article, son étiquette ou son packaging — JAMAIS estimées ni converties spéculativement : nom_parfum (nom commercial du parfum), volume ("50 ml", avec espace), teinte (cosmétique), reference_fabricant (MPN/référence imprimée), taille_ecran ("6,7 pouces"), capacite ("128 Go"), hauteur/largeur/longueur (UNIQUEMENT si des mesures chiffrées sont imprimées ou visibles sur un mètre en photo, avec unité "80 cm"). Niveau de confiance exigé : n'inclus une clé QUE si la lecture est NETTE — photo floue, texte partiel ou déduction = clé ABSENTE. Aucune clé lisible → attributs_visibles=null.
2. VALIDATION MARQUE : Si tu détectes une marque visuellement, tu DOIS faire une web search pour confirmer l'orthographe exacte et l'existence (ex : "pict pure clothing" → recherche → "Picture Organic Clothing"). Ne jamais retourner une marque sans confirmation. Si non trouvée, marque=null.
3. ESTIMATION PRIX : Toujours baser les prix sur une web search réelle. Requête : "[marque] [type] Vinted prix" ou site:vinted.fr. Fallback : eBay.fr ou Leboncoin. Fixer fourchette_min/fourchette_max ET fourchette_marche.bas/moyen/haut à partir des annonces trouvées. Citer la source dans notes (ex : "Prix basé sur 5 annonces Vinted"). Si aucune donnée : confiance="basse".
4. VITESSE ET PLATEFORMES : Estimer vitesse_vente (rapide/moyen/lent) avec vitesse_vente_explication. Ordonner les plateformes par pertinence pour cet article. Fournir exactement 2 à 3 conseils concrets dans le champ conseils pour maximiser la vente.
5. SCORE : Note de 0 à 10 basée sur la marge potentielle, la demande et la facilité de revente.
6. EXTRACTION PRIX D'ACHAT : Lis le champ "Note de l'utilisateur :" dans le message. S'il mentionne un prix payé — sous n'importe quelle forme ("acheté 50e", "payé 12€", "coûte 30 euros", "j'ai mis 8€", "bought for 20", etc.) — extrais la valeur numérique et mets-la dans prix_achat_reel. Si aucun prix mentionné, prix_achat_reel = null.
7. DÉTECTION VENTE : Lis le champ "Note de l'utilisateur :" dans le message. Si l'utilisateur mentionne avoir déjà vendu l'article — sous n'importe quelle forme ("vendu 80€", "je l'ai vendu", "sold for X", "vendu pour X", etc.) — mets est_vendu: true et prix_vente_reel au montant numérique. Sinon est_vendu: false et prix_vente_reel: null.
8. RÈGLES :
   CALCUL DE MARGE (priorité stricte) :
   - Si prix_achat_reel n'est pas null : marge = prix_vente_suggere − prix_achat_reel. C'est l'UNIQUE base pour le verdict et le score — NE JAMAIS l'utiliser pour fixer prix_vente_suggere (toujours basé sur les données marché).
   - Si prix_achat_reel est null : marge = prix_vente_suggere − prix_achat_suggere.
   VERDICT (basé uniquement sur la marge, sans exception) : verdict="excellent" si marge>40% du prix_vente_suggere, "bon" si>20%, "moyen" si>0%, "eviter" si marge≤0.
   CRITIQUE : si prix_achat_reel est connu et que la marge est négative ou nulle → verdict DOIT être "eviter". La marque forte et la demande sont des facteurs secondaires — ils ne peuvent JAMAIS contredire une marge réelle négative.
   SCORE (0 à 10, reflète la rentabilité réelle) : marge négative → 0-3 ; marge 0-20% → 4-5 ; marge 20-40% → 6-7 ; marge >40% → 8-10. Ajuster ±1 selon demande/facilité, jamais au-dessus de 4 si marge réelle négative.
   confiance="haute" si marque confirmée ET prix trouvés, "moyenne" si partiel, "basse" si incertain.
   prix_achat_suggere : estimation marché indépendante — mettre à null si prix_achat_reel n'est pas null. notes : source de l'estimation prix + un conseil concret pour vendre plus vite.`;
}

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

async function callClaude(apiKey: string, payload: object, beta?: string): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (beta) headers["anthropic-beta"] = beta;
  const r = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => `HTTP ${r.status}`);
    throw new Error(`Anthropic ${r.status}: ${t}`);
  }
  return r.json();
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

  // ── Auth ──────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // ── Chaque analyse coûte des Pépites, tous tiers (décision 2026-07-07) ────
  // Plus de quota mensuel inclus ni de frein journalier Premium. Le débit et le
  // log d'usage sont atomiques dans spend_coins_for_lens, qui pose aussi le
  // grant mensuel du tier (free 30 / premium 150 / pro 600) s'il manque.
  const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Pièces débitées pour cette analyse — sert au remboursement best-effort
  // si l'analyse échoue après débit.
  let paidWithCoins = 0;

  const { data: spend, error: spendErr } = await adminClient.rpc("spend_coins_for_lens", {
    p_user_id: user.id,
  });
  if (spendErr || !spend) {
    console.error("[lens-analysis] spend_coins_for_lens:", spendErr?.message);
    return new Response(
      JSON.stringify({ error: "coin_debit_failed" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
  if (spend.allowed === false) {
    if (spend.reason === "insufficient_coins") {
      return new Response(
        JSON.stringify({ error: "insufficient_coins", price: spend.price, balance: spend.balance }),
        { status: 402, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }
    console.error("[lens-analysis] spend_coins_for_lens refused:", spend.reason);
    return new Response(
      JSON.stringify({ error: "coin_debit_failed", reason: spend.reason }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
  paidWithCoins = spend.price ?? 0;

  try {
    const body = await req.json();
    const { urls, description, prixAchat, lang = "fr", userCountry, userStats } = body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({ error: "Missing urls" }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const _lang = lang === "en" ? "en" : "fr";
    const countryCode = userCountry?.code ?? null;
    const countryName = userCountry?.name ?? null;
    const platforms = getPlatforms(countryCode, _lang);
    const systemPrompt = buildSystemPrompt(_lang, platforms, countryName, urls.length);

    const textParts: string[] = [];
    if (description) textParts.push(_lang === "en" ? `User note: ${description}` : `Note de l'utilisateur : ${description}`);
    if (prixAchat != null) textParts.push(_lang === "en" ? `My actual purchase price (cost paid): €${prixAchat}` : `Mon prix d'achat réel (coût payé) : ${prixAchat}€`);
    if (userStats?.avgMargin != null) textParts.push(_lang === "en" ? `My average margin: ${userStats.avgMargin}%` : `Ma marge moyenne : ${userStats.avgMargin}%`);
    if (userStats?.topCategories?.length) textParts.push(_lang === "en" ? `My top categories: ${userStats.topCategories.join(", ")}` : `Mes meilleures catégories : ${userStats.topCategories.join(", ")}`);
    const userText = textParts.length ? textParts.join("\n") : (_lang === "en" ? "Analyze this item." : "Analyse cet article.");

    const imageContent = (urls as string[]).slice(0, 5).map(url => ({
      type: "image",
      source: { type: "url", url },
    }));

    const initialMessages = [
      { role: "user", content: [...imageContent, { type: "text", text: userText }] },
    ];

    const basePayload = {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      temperature: 0,
      system: systemPrompt,
    };

    // Analyse unifiée : web_search pour tout le monde (prix marché en direct),
    // avec repli sur l'analyse vision seule si l'outil échoue.
    let data: any;
    try {
      const wsMessages: any[] = [...initialMessages];
      data = await callClaude(apiKey, {
        ...basePayload,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: wsMessages,
      }, "web-search-2025-03-05");

      for (let i = 0; i < 2 && data.stop_reason === "tool_use"; i++) {
        wsMessages.push({ role: "assistant", content: data.content });
        const toolResults = (data.content as any[])
          .filter((b: any) => b.type === "tool_use")
          .map((b: any) => ({
            type: "tool_result",
            tool_use_id: b.id,
            content: b.content ?? [],
          }));
        if (!toolResults.length) break;
        wsMessages.push({ role: "user", content: toolResults });
        data = await callClaude(apiKey, {
          ...basePayload,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: wsMessages,
        }, "web-search-2025-03-05");
      }
    } catch {
      data = await callClaude(apiKey, { ...basePayload, messages: initialMessages });
    }

    const rawText = (data.content as any[] ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text as string)
      .join("")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let itemData: Record<string, unknown>;
    try {
      itemData = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        itemData = JSON.parse(match[0]);
      } else {
        throw new Error(_lang === "en" ? "AI response could not be parsed" : "Réponse IA non parsable");
      }
    }

    // Si l'utilisateur a fourni son prix d'achat, on ne retourne pas prix_achat_suggere
    if (prixAchat != null) itemData.prix_achat_suggere = null;

    return new Response(JSON.stringify(itemData), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err: any) {
    console.error("[lens-analysis] Error:", err);
    // Analyse hors quota payée en pièces mais jamais livrée : remboursement
    // best-effort (crédité en solde "acheté", cf. refund_coins).
    if (paidWithCoins > 0) {
      await adminClient.rpc("refund_coins", {
        p_user_id: user.id,
        p_amount: paidWithCoins,
        p_metadata: { source: "lens_overflow_failed" },
      }).then(({ error }) => {
        if (error) console.error("[lens-analysis] refund_coins:", error.message);
      });
    }
    if (err?.isAiUnavailable) {
      return new Response(JSON.stringify({ error: "ai_unavailable", retry_after: 30 }), {
        status: 503, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    return new Response(JSON.stringify({ error: err?.message ?? "Internal error" }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
