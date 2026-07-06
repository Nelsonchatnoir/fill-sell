import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_CFG: Record<string, { lang: string; system: string }> = {
  vinted: {
    lang: "fr",
    system: `Tu es un revendeur professionnel sur Vinted. Ton: conversationnel, chaleureux, quelques emojis 🌟✨, mentionne envoi rapide. Infère taille, matière, état et marque depuis le contexte article. Infère aussi le genre cible de l'article (rayon Vinted) depuis le type d'article, la coupe, la taille et la description: "Femme" (robe, jupe, escarpins, bikini, taille 36/38...), "Homme" (costume, coupe homme...), "Enfant" (tailles enfant, puériculture). Pour un article de mode (vêtement, chaussure, accessoire, montre, sac, bijou, lunettes), tranche TOUJOURS "Femme" ou "Homme" dès qu'il existe le MOINDRE signal: taille genrée, coupe, style, couleurs/motifs, rayon habituel de la marque ou du modèle (ex: une Casio F-91W se vend rayon Homme). "Mixte" est réservé à deux cas seulement: un article de mode strictement unisexe SANS AUCUN signal exploitable, ou un objet hors mode (électronique, maison, livres, jouets, sport...). Si un champ ne s'applique pas (ex: taille pour un objet), utilise null. Pour "matiere", choisis EXACTEMENT une valeur de cette liste fermée (celle du formulaire Vinted, identique pour toutes les catégories) ou null — jamais de texte libre ni de valeur composée ("Résine et acier inoxydable" est invalide, choisis la matière DOMINANTE, ex: "Acier"): Acier|Acrylique|Alpaga|Argent|Bambou|Bois|Cachemire|Caoutchouc|Carton|Coton|Cuir|Cuir synthétique|Cuir verni|Céramique|Daim|Denim|Dentelle|Duvet|Fausse fourrure|Feutre|Flanelle|Jute|Laine|Latex|Lin|Maille|Mohair|Mousse|Mousseline|Mérinos|Métal|Nylon|Néoprène|Or|Paille|Papier|Peluche|Pierre|Plastique|Polaire|Polyester|Porcelaine|Rotin|Satin|Sequin|Silicone|Soie|Toile|Tulle|Tweed|Velours|Velours côtelé|Verre|Viscose|Élasthanne. Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"...","platform_fields":{"taille":"XS|S|M|L|XL|XXL|Unique|null","matiere":"<valeur de la liste>|null","etat":"Très bon état|Bon état|Satisfaisant|Neuf avec étiquette|Neuf sans étiquette","marque":"...ou null","genre":"Femme|Homme|Enfant|Mixte"}}`,
  },
  leboncoin: {
    lang: "fr",
    system: `Tu es un revendeur professionnel sur Leboncoin. Ton: direct, factuel, prix ferme ou à débattre, modes d'envoi ou remise en main propre. Infère l'état et le format colis depuis le contexte article. Pour "etat", choisis EXACTEMENT une valeur de la liste (libellés réels du formulaire Leboncoin — "État neuf" et "État satisfaisant", jamais "Neuf" ni "État correct"). Pour "univers" (rayon Mode/accessoires), choisis la cible de l'article; Leboncoin accepte "Mixte". Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"...","platform_fields":{"etat":"État neuf|Très bon état|Bon état|État satisfaisant|Pour pièces","format_colis":"Lettre|Petit colis|Moyen colis|Grand colis|Très grand colis|Non défini","univers":"Femme|Homme|Enfant|Mixte|null"}}`,
  },
  beebs: {
    lang: "fr",
    system: `Tu es un revendeur sur Beebs. Ton: court, punchy, 2-3 lignes max, quelques emojis 🔥, style jeune. Infère taille, état et marque depuis le contexte. Si un champ ne s'applique pas, utilise null. Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"...","platform_fields":{"taille":"XS|S|M|L|XL|XXL|Unique|null","etat":"Neuf|Très bon état|Bon état","marque":"...ou null"}}`,
  },
  ebay: {
    lang: "en",
    system: `You are a professional reseller writing eBay listings in English. Tone: structured, technical. Infer size, material, condition and brand from the item context. Use null if a field doesn't apply (e.g. size for a non-clothing item). Return ONLY valid JSON: {"title":"...","description":"...","platform_fields":{"size":"XS|S|M|L|XL|XXL|One Size|null","material":"...or null","condition":"New|Like New|Very Good|Good|Acceptable","brand":"...or null"}}`,
  },
  vestiaire: {
    lang: "fr",
    system: `Tu es un vendeur sur Vestiaire Collective. Ton: luxueux, précis, descriptif matières et état, style magazine, pas d'emojis. Infère taille, matière, état et marque depuis le contexte. Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"...","platform_fields":{"taille":"XS|S|M|L|XL|XXL|Unique|null","matiere":"...ou null","etat":"Neuf avec étiquette|Neuf sans étiquette|Excellent état|Très bon état|Bon état","marque":"...ou null"}}`,
  },
};

const OPENAI_IMG_PROMPT_LIGHT = `Lightly enhance this clothing product photo: adjust white balance and brightness slightly so the garment reads clearly, and correct any obvious color cast. Keep everything else exactly as in the original photo — pose, framing, angle, background, wrinkles, garment details.

Strict constraints — do NOT change:
- The pose, framing, angle, or camera perspective
- The background
- The garment's shape, cut, size, color, pattern, fabric texture, or any design detail (buttons, logos, stitching, prints, labels)
- Do not smooth fabric or remove wrinkles
- Do not add, remove, or invent any element

This is a fast, subtle brightness/white-balance correction only — nothing else should visibly change.`;

const OPENAI_IMG_PROMPT_ADVANCED = `Enhance this clothing product photo to make it look professional and sale-ready, while keeping the garment exactly as it is.

Lighting: Apply soft, natural, warm-toned lighting — as if photographed near a bright window on a clear day. Even, flattering light with no harsh shadows or overexposed areas. Increase contrast and pop slightly for a more premium, catalog-like look.

Fabric: Naturally smooth out wrinkles and creases, as if the garment had been gently steamed — realistic, never artificial or plastic-looking.

Background: If the background is cluttered or messy, subtly clean and simplify it (soft blur or neutral tidy-up) without changing its general setting or color — keep it recognizable as the same location, just tidier and less distracting.

Color and clarity: Improve color accuracy and sharpness noticeably, keeping tones true to the original.

Strict constraints — do NOT change:
- The pose, framing, angle, or camera perspective
- The garment's shape, cut, size, color, pattern, fabric texture, or any design detail (buttons, logos, stitching, prints, labels)
- Do not add, remove, or invent any element on the garment itself

The result must be the exact same garment in the exact same photo, with visibly improved lighting, contrast, a cleaner background, and a light natural pressing effect.`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_pro, is_founder, apple_original_transaction_id, google_purchase_token")
      .eq("id", user.id)
      .single();

    const isPremium = profile?.is_founder === true
      || profile?.apple_original_transaction_id != null
      || profile?.google_purchase_token != null
      || profile?.is_pro === true;
    if (!isPremium) return json({ error: "Premium or Pro plan required" }, 403);

    const body = await req.json();
    const { inventaire_id, photos, platforms } = body;
    // item_data: champs de l'article envoyés directement par le client quand aucune ligne
    // inventaire n'existe encore (switch "ajouter au stock" différé/désactivé) — évite de
    // dépendre d'une ligne DB qui n'est créée qu'à la publication, voire jamais.
    const item_data = body.item_data && typeof body.item_data === "object" ? body.item_data : null;
    // photo_option: "ia_advanced" (retouche marquée, fond nettoyé), "ia_light" (correction rapide
    // luminosité/blancs uniquement), "original" (aucune retouche). Toute valeur inconnue ou legacy
    // ("ia_multi", "ia_simple", etc.) retombe sur "ia_advanced" pour ne jamais casser un ancien appel.
    const photo_option = (body.photo_option as string) || "ia_advanced";
    // price may be pre-fetched client-side; used as fallback if prix_vente is null in DB
    const body_price = body.price != null ? Number(body.price) : null;

    if (
      (!inventaire_id && !item_data) ||
      !Array.isArray(photos) || photos.length === 0 ||
      !Array.isArray(platforms) || platforms.length === 0
    ) {
      return json({ error: "Missing required fields: inventaire_id or item_data, photos, platforms" }, 400);
    }

    let item: { titre?: string; marque?: string; description?: string; type?: string; statut?: string; prix_vente?: number | null };
    if (item_data) {
      item = item_data;
    } else {
      const { data, error: itemErr } = await adminClient
        .from("inventaire")
        .select("id, titre, marque, description, type, statut, prix_vente")
        .eq("id", inventaire_id)
        .single();
      if (itemErr || !data) return json({ error: "Item not found" }, 404);
      item = data;
    }

    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
    const BUCKET = "listing-photos";

    // ── Step 1 & 2: Photo processing ──────────────────────────────────────────
    let processedPhotos: Array<{ type: string; url: string }>;

    if (photo_option === "original") {
      processedPhotos = (photos as string[]).map((url, i) => ({
        type: i === 0 ? "original" : `photo_${i}`,
        url,
      }));
    } else {
      // GPT Image 2: retouch each photo. Two distinct tiers:
      // - ia_light: quality "low", prompt limited to brightness/white balance — fast, subtle
      // - ia_advanced (default): quality "medium", fuller prompt with background cleanup + contrast pop.
      //   "medium" et non "high" : high ne répond jamais avant la limite wall-clock des Edge
      //   Functions (~400s, vérifié le 2026-07-06) et retombait silencieusement sur la photo originale.
      const isLight = photo_option === "ia_light";
      const promptToUse = isLight ? OPENAI_IMG_PROMPT_LIGHT : OPENAI_IMG_PROMPT_ADVANCED;
      const qualityToUse = isLight ? "low" : "medium";
      const photosToProcess = photos as string[];
      const ts = Date.now();
      const results = await Promise.allSettled(
        photosToProcess.map(async (photoUrl, idx) => {
          const srcRes = await fetch(photoUrl);
          if (!srcRes.ok) {
            console.error(`[gpt-image] fetch photo ${idx} failed: ${srcRes.status}`);
            return { type: idx === 0 ? "original" : `photo_${idx}`, url: photoUrl };
          }
          const srcBlob = await srcRes.blob();

          const form = new FormData();
          form.append("model", "gpt-image-2");
          form.append("prompt", promptToUse);
          form.append("n", "1");
          form.append("size", "1024x1024");
          form.append("quality", qualityToUse);
          form.append("image[]", srcBlob, "product.jpg");

          const res = await fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENAI_KEY}` },
            body: form,
          });

          console.log(`[gpt-image] photo ${idx} (${photo_option}) status: ${res.status}`);

          if (!res.ok) {
            console.error(`[gpt-image] photo ${idx} error:`, await res.text());
            return { type: idx === 0 ? "original" : `photo_${idx}`, url: photoUrl };
          }

          const resData = await res.json();
          const b64 = resData.data?.[0]?.b64_json;
          if (!b64) {
            console.error(`[gpt-image] photo ${idx}: no b64_json in response`);
            return { type: idx === 0 ? "original" : `photo_${idx}`, url: photoUrl };
          }

          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const outBlob = new Blob([bytes], { type: "image/png" });
          const path = `${user.id}/enhanced/${ts}_${idx}.png`;

          const { error: upErr } = await adminClient.storage
            .from(BUCKET)
            .upload(path, outBlob, { contentType: "image/png", upsert: true });

          if (upErr) {
            console.error(`[gpt-image] upload photo ${idx}:`, upErr);
            return { type: idx === 0 ? "original" : `photo_${idx}`, url: photoUrl };
          }

          const url = adminClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          console.log(`[gpt-image] photo ${idx} OK → ${url}`);
          return { type: idx === 0 ? "original" : `enhanced_${idx}`, url };
        })
      );

      processedPhotos = results.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : { type: i === 0 ? "original" : `photo_${i}`, url: photosToProcess[i] }
      );
    }

    // ── Step 3: Claude Haiku — title + description per platform ──────────────
    const itemContext = [
      item.marque && `Marque: ${item.marque}`,
      item.titre && `Article: ${item.titre}`,
      item.type && `Type: ${item.type}`,
      item.description && `Description: ${item.description}`,
      item.statut && `État: ${item.statut}`,
      item.prix_vente != null && `Prix: ${item.prix_vente}€`,
    ].filter(Boolean).join("\n");

    const fallbackTitle = [item.marque, item.titre || item.type].filter(Boolean).join(" ") || "Article";
    const platformListings: Record<string, { title: string; description: string; platform_fields: Record<string, string | null> }> = {};

    await Promise.all(
      (platforms as string[]).map(async (platform) => {
        const cfg = PLATFORM_CFG[platform];
        if (!cfg) {
          platformListings[platform] = { title: fallbackTitle, description: item.description ?? "", platform_fields: {} };
          return;
        }

        const userMsg = cfg.lang === "en"
          ? `Write a listing for:\n${itemContext}`
          : `Rédige une annonce pour:\n${itemContext}`;

        try {
          const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": ANTHROPIC_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 900,
              system: cfg.system,
              messages: [{ role: "user", content: userMsg }],
            }),
          });

          if (claudeRes.ok) {
            const claudeData = await claudeRes.json();
            const text: string = claudeData.content?.[0]?.text ?? "";
            const firstBrace = text.indexOf("{");
            const lastBrace = text.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              try {
                const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
                platformListings[platform] = {
                  title: String(parsed.title ?? fallbackTitle),
                  description: String(parsed.description ?? ""),
                  platform_fields: parsed.platform_fields ?? {},
                };
              } catch (parseErr) {
                console.error(`[generate-listing] JSON parse error ${platform}:`, parseErr);
              }
            }
          } else {
            console.error(`[generate-listing] claude ${platform}:`, await claudeRes.text());
          }
        } catch (e) {
          console.error(`[generate-listing] claude exception ${platform}:`, e);
        }

        if (!platformListings[platform]) {
          platformListings[platform] = { title: fallbackTitle, description: item.description ?? "", platform_fields: {} };
        }
      })
    );

    // ── Return generated data (INSERT happens client-side in ListingPreviewScreen) ──
    return json({
      photos: processedPhotos,
      platforms: platformListings,
      price: item.prix_vente ?? body_price ?? null,
    });

  } catch (e) {
    console.error("[generate-listing] unhandled:", e);
    return json({ error: "Internal server error" }, 500);
  }
});
