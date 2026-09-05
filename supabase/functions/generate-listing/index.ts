import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Détection de catégorie de l'app (≈120 règles regex + défauts par catégorie) :
// UNIQUE source de vérité, importée telle quelle — jamais dupliquée ici.
// shared.js est un module pur (aucun import, aucune API navigateur), le
// bundler du CLI Supabase l'embarque au deploy comme n'importe quel import
// relatif. Même signature que côté app : detectObjectIcon(titre, description, type).
import { detectObjectIcon, ALL_OBJECT_ICONS, ICON_LEGEND } from "../../../src/utils/shared.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Tailles ENFANT (2026-07-15, chantier « trou tailles bébé/enfant ») ──────
// Les schémas vinted/beebs/ebay acceptent désormais, POUR LES ARTICLES
// ENFANT uniquement, les valeurs canoniques du référentiel
// src/utils/childSizes.js : "Prématuré" | "Naissance" | "N mois"
// (1|3|6|9|12|18|24|36) | "N ans" (2→16, 18 LBC seulement) | "EU N"
// (pointure 15→41). JAMAIS de nombre nu : "3" est ambigu (3 ans ? pointure ?
// taille 34 tronquée ?) et c'est précisément ce qui rendait le fuzzy des
// content scripts dangereux (un "2" matchait "2 ans"). La conversion vers le
// libellé exact de chaque plateforme ("6-9 mois / 68 cm" Vinted, "6 mois
// (60-66 cm)" Beebs…) se fait à l'insert du job (handlePublish), pas ici.
// ── Rédaction par plateforme : MODULE PARTAGÉ (02/09 soir) ───────────────────
// PLATFORM_CFG, limites, directives, contexte article et post-production
// (canonicalisation, état mappé, pose ISBN) vivent désormais dans
// _shared/redaction-plateformes.ts — extraits tels quels, partagés avec le
// mode unifié de lens-analysis : une seule source de prompts, un seul contrat.
import {
  VERSION_PROMPT,
  construireContexteArticle,
  redigerAnnoncesPlateformes,
} from "../_shared/redaction-plateformes.ts";
// Forme comparable partagée (05/09) : une réponse IA qui se rapproche d'une
// valeur de la liste transmise repart sous la forme EXACTE de cette valeur.
import { valeurDeListeCorrespondante } from "../_shared/texte-comparable.ts";

// ── Retouche photo (GPT Image 2) ───────────────────────────────────────────────
// Niveau "ia_light" : un seul prompt générique (luminosité/balance des blancs
// uniquement — les codes photo par catégorie n'entrent pas en jeu à ce niveau).
// Formulé "item" et non "garment" : il s'applique à toutes les catégories.
const OPENAI_IMG_PROMPT_LIGHT = `Lightly enhance this product photo: adjust white balance and brightness slightly so the item reads clearly, and correct any obvious color cast. Keep everything else exactly as in the original photo — pose, framing, angle, background, and every detail of the item.

Strict constraints — do NOT change:
- The pose, framing, angle, or camera perspective
- The background
- The item's shape, size, color, pattern, material texture, or any detail (logos, stitching, prints, labels, signs of wear)
- Do not smooth, iron, or flatten anything; do not remove wrinkles, creases, or defects
- Do not add, remove, or invent any element

This is a fast, subtle brightness/white-balance correction only — nothing else should visibly change.`;

// Règle de réalisme commune à TOUTES les familles du niveau "ia_advanced".
// La photo doit montrer le VRAI article : améliorer la présentation (lumière,
// netteté, fond, fidélité couleurs), jamais l'objet lui-même. Un article
// "parfait" qui ne ressemble pas à ce que l'acheteur reçoit = litige et
// non-conformité aux règles des plateformes.
const REALISM_RULES = `Strict realism constraints — non-negotiable:
- The result must show the exact same item, exactly as it is: same shape, proportions, colors, pattern, material texture, and every detail (logos, stitching, prints, labels, hardware).
- Never remove or hide defects, stains, scratches, pilling, or signs of wear — the buyer must see the item's true condition.
- Never artificially smooth, iron, flatten, or "perfect" the item. Natural folds, light creases, and the real drape of the material must stay visible — a real, slightly lived-in look is correct and expected.
- Keep colors strictly faithful to the original photo — no saturation or tone shift that changes the perceived color.
- Do not add, remove, or invent any element on or around the item.
- Do not change the pose, framing, angle, or camera perspective.
Only the PRESENTATION may improve: lighting, sharpness, white balance, and a cleaner, less distracting background (kept recognizable as the same location).`;

// Familles de retouche "ia_advanced" : un prompt spécialisé par famille de
// produit, mappé depuis l'icône retournée par detectObjectIcon (les mêmes
// icônes que les tuiles Stock/Ventes et le mapping catalogue des plateformes).
// Chaque prompt = intro spécialisée (codes photo de la famille) + REALISM_RULES.
// Pour ajuster une famille : modifier son intro ; pour déplacer une catégorie :
// déplacer son icône d'une liste à l'autre. Icône absente de toute liste →
// famille "default".
const RETOUCH_FAMILIES: Array<{ family: string; icons: string[]; intro: string }> = [
  {
    family: "vetements",
    icons: ["👗","🥼","🧥","🎀","🤵","👔","🧶","👕","🩳","👖","🩲","🧦","👙","🧣","🧤","🧢","🎭"],
    // Curseur tissu (2026-07-10) : le 1er recalibrage anti-"repassage vapeur"
    // laissait les faux plis de stockage (vêtement resté plié en boule) — trop
    // loin dans l'autre sens. Cible = "présenté pour la vente" : faux plis de
    // pliage atténués (SEULE exception, explicitement scellée, à la règle
    // anti-lissage de REALISM_RULES ci-dessous), tombé naturel et micro-plis
    // de la matière conservés, jamais de surface parfaitement lisse.
    intro: `Enhance this clothing product photo for a resale listing. Apply soft, natural, window-like lighting (even, no harsh shadows), improve sharpness and color accuracy, and tidy a cluttered background so the garment stands out.

Fabric presentation — aim for "prepared for sale", the way a careful seller would lightly steam and neatly arrange a garment before shooting it: soften the pronounced storage and folding creases (sharp crease lines left by a garment stored folded or crumpled), so it looks cared-for and presentable. This softening of storage creases is the ONLY exception to the no-smoothing rule below. Always preserve the fabric's natural drape and the normal micro-folds of the material: never press it flat, never produce a perfectly smooth, flat, wrinkle-free surface — real fabric always keeps a slight relief, and a fully ironed-looking result reads as fake. The target is "clean and presentable", never "brand-new in shrink-wrap".`,
  },
  {
    family: "chaussures",
    icons: ["👟","👢","👠","🩴","🥿"],
    intro: `Enhance this footwear product photo for a resale listing. Apply clean, even lighting that reveals the shoe's materials and stitching, improve sharpness, and neutralize a distracting background so the pair reads clearly (keep the original angle — do not recompose into a different view). Leather grain, fabric texture, and creasing from normal wear must stay exactly as they are.`,
  },
  {
    family: "sacs",
    icons: ["👜","👛","🧳","🎒","👝","🎽"],
    intro: `Enhance this bag / leather-goods product photo for a resale listing. Apply soft, even lighting that shows the material's true grain and the hardware, improve sharpness, and clean up a distracting background. The bag's actual shape and structure as photographed must be preserved — do not inflate, restuff, or straighten it, and keep handles, straps, and hardware exactly as they are.`,
  },
  {
    family: "accessoires",
    icons: ["⌚","💍","🕶️","🪢","☂️","🗝️","💎"],
    intro: `Enhance this accessory / jewelry product photo for a resale listing. Favor crisp, sharp detail on the item (dial, stones, engravings, textures), with clean neutral lighting and a quieter background so the small item reads clearly. Reflections may be softened slightly but scratches and real wear must remain visible.`,
  },
  {
    family: "hightech",
    icons: ["📱","💻","🖥️","📲","🎧","🔊","🎮","📺","📷","🛸","🖨️","⌨️","🖱️","🔌","📡","📇","⏱️","🎤","📟"],
    intro: `Enhance this electronics product photo for a resale listing. Apply clean, neutral, even lighting (no color cast on screens or plastics), improve sharpness, and simplify a cluttered background toward a tidy, uncluttered look. Screen content, stickers, port wear, and surface scratches must remain exactly as photographed.`,
  },
  {
    family: "maison",
    icons: ["🛋️","🪑","🛏️","🛌","💡","🪞","🕯️","🖼️","🪴","🏺","🍽️","🍳","🪟","🪶","🟫","📜","🕰️","🎄","🖋️","☕","🫖","🧹","🧊","♨️","🥣","🍞","🍟","💇","🌀","🌡️","🧺","🧼","🪒","🪛","🪚","🔨","🪜","🖌️","🔩","📏","🔧","🌱","✂️","🔥","⛱️","🧵","🐕","🏠","⚡","🌿"],
    intro: `Enhance this home / furniture / appliance product photo for a resale listing. Apply warm, natural interior lighting, improve sharpness and color accuracy, and tidy the surroundings so the item is the clear subject (keep the room recognizable — just cleaner and less distracting). Wood grain, upholstery texture, and marks from normal use must remain exactly as they are.`,
  },
  {
    family: "livres_medias",
    icons: ["📚","📖","📰","💿","📀","💽","🃏","📮","🪙","🏆"],
    intro: `Enhance this book / media / collectible product photo for a resale listing. Present the cover or item flat and legible: even, glare-free lighting, strong sharpness on titles and artwork, faithful colors, and a clean background. Edge wear, creases, and aging must remain exactly as photographed — condition is what the buyer is judging.`,
  },
  {
    family: "enfants_jouets",
    icons: ["🧸","🪆","🧩","🧱","🦸","🎲","🏎️","👶","💺","🍼","🚼","🚁"],
    intro: `Enhance this toy / baby-gear product photo for a resale listing. Apply bright, friendly, even lighting with accurate colors, improve sharpness, and clean up a cluttered background so the item stands out. Play wear, faded prints, and used-condition details must remain exactly as they are.`,
  },
  {
    family: "sport",
    icons: ["🚲","🛴","🛹","⛸️","🎿","⚽","🏀","🎾","⛳","🏋️","🥊","⛺","🎣","🧘","🏃","🤿","🏄","🐴","🎱","🥽","🪖","⛑️","🏍️","🛵","🛞","🚗"],
    intro: `Enhance this sports / outdoor equipment product photo for a resale listing. Apply clear, even lighting that shows the equipment's condition honestly, improve sharpness and color accuracy, and reduce background clutter so the item reads at a glance. Scuffs, dirt traces, and wear from normal use must remain exactly as photographed.`,
  },
  {
    family: "beaute",
    icons: ["🌸","💄","💅","🧴"],
    intro: `Enhance this beauty / cosmetics product photo for a resale listing. Favor a clean, bright presentation: neutral even lighting, crisp label legibility, faithful packaging colors, and an uncluttered background. The fill level, seals, and label condition must remain exactly as photographed — never make a used product look new.`,
  },
];

// Prompt de repli : toute icône hors familles (instruments 🎸🎻🥁…, 📦 Autre, …).
const RETOUCH_DEFAULT_INTRO = `Enhance this product photo for a resale listing. Apply soft, natural, even lighting, improve sharpness, white balance, and color accuracy, and tidy a cluttered background so the item is the clear subject.`;

const ICON_TO_RETOUCH = new Map<string, { family: string; prompt: string }>();
for (const f of RETOUCH_FAMILIES) {
  const prompt = `${f.intro}\n\n${REALISM_RULES}`;
  for (const icon of f.icons) ICON_TO_RETOUCH.set(icon, { family: f.family, prompt });
}

function retouchProfileFor(item: { titre?: string; description?: string; type?: string }) {
  const icon = detectObjectIcon(item.titre ?? "", item.description ?? "", item.type ?? "");
  return {
    icon,
    ...(ICON_TO_RETOUCH.get(icon) ?? {
      family: "default",
      prompt: `${RETOUCH_DEFAULT_INTRO}\n\n${REALISM_RULES}`,
    }),
  };
}

// ── Choix de fond (ia_advanced uniquement) ─────────────────────────────────────
// Flow "option A" : le fond est choisi AVANT génération, une seule image est
// produite (un seul appel GPT Image 2, qualité "medium" — jamais de multi-pass
// ni de "high" qui timeout). "original" (défaut) = aucun remplacement de fond
// (comportement historique conservé). Étendre = ajouter une entrée ici.
const BACKGROUND_OPTIONS: Record<string, string> = {
  white: `New background: a premium seamless white studio sweep (cyclorama), bright and clean, with a subtle soft gradient from pure white behind the product to a very light grey toward the edges, professional e-commerce lighting.`,
  grey:  `New background: a polished microcement / smooth concrete surface in soft neutral grey, with subtle natural texture and gentle tonal variation, modern industrial-chic feel, soft directional studio light. Understated and premium, not busy.`,
  beige: `New background: a warm natural linen fabric backdrop with a soft visible woven texture, warmly and evenly lit, refined and tactile.`,
  wood:  `New background: a pale natural light-oak wood surface with clean visible grain (planks / parquet), warm daylight, calm lifestyle feel.`,
};

// Clause d'intégrité objet — préfixée à CHAQUE prompt de fond (remplace l'intro
// famille dans cette passe). Approche prompt-only (pas de masque/segmentation) :
// /images/edits accepte bien un `mask`, mais le CONSTRUIRE exige une étape de
// détourage de l'objet (appel segmentation ou 2e passe) — exclue par la
// contrainte "un seul appel, coût inchangé". La clause porte donc SEULE la
// garantie que seul le fond (et, pour un vêtement, les faux plis) change.
//
// DEUX variantes selon la famille détectée :
//   - vetements → CLAUSE VÊTEMENT : autorise un défroissage LÉGER des faux plis
//     de stockage/pliage (rendu "catalogue pro"), stricte sur tout le reste
//     (couleurs, matière, motifs, logos, défauts, forme, cadrage).
//   - toute autre famille → CLAUSE STRICTE : objet 100 % intact (inchangée).
const BG_INTEGRITY_CLAUSE = `Replace ONLY the background of this product photo. The product itself must remain strictly identical to the original: do not redraw, reshape, resize, recolor, clean, repair or beautify it. Preserve exactly its shape, contours, proportions, colors, material and texture, patterns, logos, text, stitching, and every existing defect, stain, scratch, mark or sign of wear. Keep the product in its original position, angle, scale and framing. Add a soft, natural, physically plausible contact shadow beneath the product so it sits believably on the new surface, avoiding any cut-out, floating or pasted look. Do not add any object, prop, text or watermark.`;

const BG_INTEGRITY_CLAUSE_CLOTHING = `Replace the background of this clothing photo and present the garment as prepared for sale. You MAY lightly soften pronounced storage or folding creases (sharp crease lines from being stored folded or crumpled) so the garment looks cared-for and neatly arranged, but always preserve the fabric's natural drape and normal micro-folds: never press it perfectly flat, never make it look ironed or shrink-wrapped. Apart from softening those storage creases, the garment must remain strictly identical to the original: do not reshape, resize, recolor, repair or embellish it; preserve exactly its colors, material and texture, all patterns, prints, logos, text and stitching, and every existing defect, stain, hole or sign of wear. Keep the garment in its original position, angle, scale and framing. Add a soft, natural, physically plausible contact shadow so it sits believably on the new surface, with no cut-out, floating or pasted look. Do not add any object, prop, text or watermark.`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── Mesure du coût API (2026-07-28) ──────────────────────────────────────
  // Cette fonction était le seul appel payant NI facturé NI tracé : elle part
  // à chaque génération, y compris quand l'utilisateur ne publie pas ensuite,
  // et c'est l'action la plus fréquente du produit. Sans mesure, les rapports
  // 3/12/35 unités étaient fixés à l'aveugle.
  // L'accumulateur est déclaré ICI, dans le scope de la requête : les quatre
  // appels Claude et la retouche GPT Image vivent tous dans ce handler, donc
  // aucune variable de module (qui serait partagée entre requêtes concurrentes
  // dans le même isolat Deno et mélangerait les compteurs).
  const cost = {
    claude_in: 0, claude_out: 0, claude_calls: 0, images: 0, image_quality: "",
    // Usage OpenAI de la retouche (audit du 08/08) : le bloc `usage` de
    // /images/edits porte les tokens EXACTS — les constantes 0,01/0,04 $ par
    // image ignoraient l'entrée (image source + prompt). img_usage_n compte
    // les réponses qui portaient le bloc : coût « mesuré » seulement quand
    // TOUTES l'ont porté, sinon repli estimé et marqué comme tel.
    img_usage_n: 0, img_text_in: 0, img_image_in: 0, img_out: 0,
  };
  const trackClaude = (data: unknown) => {
    const u = (data as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
    if (!u) return;
    cost.claude_in += u.input_tokens ?? 0;
    cost.claude_out += u.output_tokens ?? 0;
    cost.claude_calls += 1;
  };

  // Remboursement automatique du débit de génération (2026-08-05) : assigné
  // après le débit, appelable depuis le catch GLOBAL (déclaré avant le try
  // pour être dans son scope). Idempotent et best-effort, comme releaseAttempt
  // de lens-analysis : un échec de remboursement ne masque jamais l'erreur
  // d'origine — mais il se voit dans les logs.
  let refundGenerateFn: ((reason: string) => Promise<void>) | null = null;

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
      .select("is_premium, is_pro, is_comped, lang")
      .eq("id", user.id)
      .single();

    // Expression premium canonique (2026-07-25, cf. CLAUDE.md) : is_premium/is_pro
    // = source de vérité maintenue par les flux de paiement, is_comped = comptes
    // offerts. is_founder et les ids Apple/Google résiduels ne valent PLUS
    // statut premium — un abonnement résilié/expiré = free.
    const isPremium = profile?.is_premium === true
      || profile?.is_pro === true
      || profile?.is_comped === true;

    const body = await req.json();
    const { inventaire_id, photos, platforms } = body;
    // item_data: champs de l'article envoyés directement par le client quand aucune ligne
    // inventaire n'existe encore (switch "ajouter au stock" différé/désactivé) — évite de
    // dépendre d'une ligne DB qui n'est créée qu'à la publication, voire jamais.
    const item_data = body.item_data && typeof body.item_data === "object" ? body.item_data : null;
    // canonical_fields (2026-07-11, Sujet 4) : taille/couleur/matiere/marque
    // déjà connus du CLIENT (Lens taille_estimee, saisie utilisateur…) —
    // l'inventaire n'a pas ces colonnes, seul le client peut les fournir.
    // Quand une valeur est présente, elle est injectée dans itemContext comme
    // contrainte ET sert de source prioritaire à la canonicalisation
    // post-génération (voir après le Promise.all).
    const canonicalIn = body.canonical_fields && typeof body.canonical_fields === "object" ? body.canonical_fields : {};
    const canonicalProvided: Record<string, string> = {};
    // "etat" ajouté le 2026-07-28 (lot 1) : l'état LU par le Lens (etat_estime)
    // n'avait AUCUN chemin jusqu'ici — ni item_data ni la table inventaire ne le
    // portent (inventaire.statut vaut stock|vendu, c'est autre chose). Le
    // rédacteur le réinventait donc à chaque fois.
    // ⚠️ INERTE TANT QUE LE FRONT N'ENVOIE PAS LA CLÉ : ListingPreviewScreen ne
    // met encore que taille/couleur/matiere/marque dans canonical_fields. Le
    // serveur est prêt, le client suivra au déploiement Vercel.
    // "isbn" ajouté le 2026-08-31 : le Lens LIT l'ISBN (attributs_visibles
    // .isbn_ean sur la famille livres_medias) et il n'avait AUCUN chemin vers
    // l'annonce — le stepper le réclamait en rouge et l'utilisateur devait le
    // retaper à la main, sur une valeur déjà déchiffrée et payée.
    for (const k of ["taille", "couleur", "matiere", "marque", "etat", "isbn"]) {
      const v = canonicalIn[k];
      if (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null") canonicalProvided[k] = v.trim();
    }

    // ── Mode ciblé "resolve_genre" (2026-07-09) ───────────────────────────────
    // Relance UNIQUEMENT le champ genre avec une instruction stricte. Appelé
    // par ListingPreviewScreen à la publication quand la génération complète a
    // laissé genre vide/"Mixte" sur une catégorie qui exige un rayon genré :
    // le call complet n'est pas déterministe (même article → 4× "Homme" puis
    // 1× "Mixte", vérifié en DB le 2026-07-09) et la publication ne doit plus
    // jamais être bloquée pour ça. Pas de check pièces : micro-appel de
    // secours au sein d'un flux de publication déjà débité par
    // spend_coins_and_publish. Réponse : { genre: "Femme"|"Homme"|"Fille"|
    // "Garçon"|"Bébé"|null } — null si contexte vide ou IA indisponible, le
    // client applique alors son propre défaut.
    if (body.resolve_genre === true) {
      const it = item_data ?? {};
      const ctx = [
        it.marque && `Marque: ${it.marque}`,
        it.titre && `Article: ${it.titre}`,
        it.type && `Type: ${it.type}`,
        it.description && `Description: ${it.description}`,
      ].filter(Boolean).join("\n");
      if (!ctx) return json({ genre: null });
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 50,
            system: `Tu détermines le rayon (genre cible) d'un article pour un site de revente de mode. Réponds UNIQUEMENT du JSON valide: {"genre":"..."} avec une de ces valeurs EXACTES: Femme, Homme, Fille, Garçon, Bébé. JAMAIS Mixte, JAMAIS Enfant, JAMAIS null — tranche TOUJOURS sur le signal le plus probable, même faible (coupe, taille, style, couleurs, rayon habituel de la marque ou du modèle — ex: une Casio F-91W se vend rayon Homme). Article adulte ou indéterminé → Femme ou Homme. Article manifestement enfant → Fille, Garçon ou Bébé.`,
            messages: [{ role: "user", content: `Quel rayon pour cet article ?\n${ctx}` }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          trackClaude(data);
          const text: string = data.content?.[0]?.text ?? "";
          const m = text.match(/"genre"\s*:\s*"(Femme|Homme|Fille|Garçon|Bébé)"/);
          return json({ genre: m ? m[1] : null });
        }
        console.error("[generate-listing] resolve_genre:", await res.text());
      } catch (e) {
        console.error("[generate-listing] resolve_genre exception:", e);
      }
      return json({ genre: null });
    }

    // ── Mode ciblé "resolve_aspects" (2026-07-16, chantier champs obligatoires) ──
    // Micro-appel de secours, même philosophie que resolve_genre : quand la
    // preview B1 de ListingPreviewScreen identifie des aspects eBay
    // OBLIGATOIRES sans source app (audit Phase 0 : Nom de parfum, Volume,
    // Numéro de pièce fabricant, Hauteur/Largeur, Teinte…), on demande à
    // l'IA de les extraire du CONTEXTE — jamais deviner. Réponse :
    // { aspects: { "<nom exact>": "valeur" } } — les aspects non déductibles
    // sont ABSENTS/null, le fallback UI (Phase 3) prend le relais.
    // Entrée : body.aspects = [{ name, allowedValues?: string[] }] (≤ 12).
    if (body.resolve_aspects === true) {
      const it = item_data ?? {};
      const wanted = (Array.isArray(body.aspects) ? body.aspects : [])
        .filter((a: { name?: unknown }) => a && typeof a.name === "string")
        .slice(0, 12);
      // Défauts DÉTERMINISTES (Phase 1, 2026-07-16) : valeur standard eBay SÛRE
      // pour les obligatoires sans source, indépendante du contexte article.
      // Le front les pose déjà côté client (EBAY_ASPECT_DEFAULTS), mais le
      // contrat resolve_aspects ne doit pas EN dépendre : on les applique ici
      // aussi, avant l'IA, pour tout appelant. Trou n°1 = MPN (32 catégories).
      const ASPECT_DEFAULTS: Record<string, string> = {
        "Numéro de pièce fabricant": "Ne s'applique pas",
      };
      const out: Record<string, string> = {};
      for (const a of wanted) if (ASPECT_DEFAULTS[a.name]) out[a.name] = ASPECT_DEFAULTS[a.name];
      // On ne demande à l'IA que les aspects SANS défaut déterministe.
      const askAI = wanted.filter((a: { name: string }) => !ASPECT_DEFAULTS[a.name]);
      const ctx = [
        it.marque && `Marque: ${it.marque}`,
        it.titre && `Article: ${it.titre}`,
        it.modele && `Modèle: ${it.modele}`,
        it.matiere && `Matière: ${it.matiere}`,
        it.couleur && `Couleur: ${it.couleur}`,
        it.type && `Type: ${it.type}`,
        it.description && `Description: ${it.description}`,
        // attributs_visibles de lens-analysis (Phase 2) : valeurs LUES sur
        // l'article en photo (nom de parfum, volume, MPN, dimensions…) —
        // la source la plus fiable pour ces aspects. Absent tant que
        // lens-analysis n'est pas redéployée (gated).
        it.attributs && typeof it.attributs === "object" && Object.keys(it.attributs).length &&
          `Attributs lus sur l'article (photos): ${JSON.stringify(it.attributs)}`,
      ].filter(Boolean).join("\n");
      // Rien à extraire par l'IA (tout couvert par les défauts, ou pas de
      // contexte) : on renvoie directement les défauts déterministes.
      if (!wanted.length || !askAI.length || !ctx) return json({ aspects: out });
      const lines = askAI.map((a: { name: string; allowedValues?: string[] }) => {
        const allowed = Array.isArray(a.allowedValues) ? a.allowedValues.slice(0, 60) : [];
        return `- "${a.name}"${allowed.length ? ` — valeurs eBay (suggestions, saisie libre acceptée ; si tu retiens une valeur de la liste, recopie-la caractère pour caractère, apostrophes et espaces compris) : ${allowed.join(" | ")}` : " — texte libre"}`;
      }).join("\n");
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 400,
            system:
              `Tu extrais des caractéristiques produit eBay depuis le contexte d'une annonce d'occasion. RÈGLE ABSOLUE : ne JAMAIS inventer — une valeur doit être lisible ou strictement déductible du contexte, sinon null. Préfère une valeur de la liste eBay quand elle correspond. Cas particuliers : "Numéro de pièce fabricant" → "Ne s'applique pas" (valeur standard eBay pour un objet d'occasion sans référence fabricant visible dans le contexte) ; "Volume" → format eBay ("50 ml", jamais "50ml") ; dimensions (Hauteur/Largeur/Longueur/Dimensions) → UNIQUEMENT si des mesures chiffrées figurent dans le contexte, avec l'unité ("80 cm"). Retourne UNIQUEMENT du JSON valide: {"aspects":{"<nom exact de l'aspect>":"valeur ou null"}}`,
            messages: [{ role: "user", content: `Aspects à renseigner :\n${lines}\n\nContexte article :\n${ctx}` }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          trackClaude(data);
          const text: string = data.content?.[0]?.text ?? "";
          const m = text.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            const raw = parsed?.aspects && typeof parsed.aspects === "object" ? parsed.aspects : {};
            // Fusion dans `out` (déjà porteur des défauts déterministes) : l'IA
            // ne peut renseigner QUE les aspects demandés à l'IA (askAI) —
            // jamais écraser un défaut déterministe ni inventer une clé.
            const askNames = new Set(askAI.map((a: { name: string }) => a.name));
            // Liste transmise par aspect : si la réponse s'en rapproche (casse,
            // accents, apostrophes ’/', espaces insécables, tirets gommés), on
            // renvoie l'entrée de la liste TELLE QUELLE — l'IA réécrit « Jouets
            // d’éveil » en « Jouets d'éveil » et la plateforme ne reconnaît pas
            // la seconde (job 2e4f88f1, 05/09). Hors liste : réponse inchangée.
            const allowedByName = new Map<string, string[]>(
              askAI.map((a: { name: string; allowedValues?: string[] }) => [a.name, Array.isArray(a.allowedValues) ? a.allowedValues : []]),
            );
            for (const [k, v] of Object.entries(raw)) {
              if (!askNames.has(k)) continue; // hors demande IA
              const s = typeof v === "string" ? v.trim() : "";
              if (s && s.toLowerCase() !== "null") out[k] = valeurDeListeCorrespondante(s, allowedByName.get(k) ?? []) ?? s;
            }
            return json({ aspects: out });
          }
        } else {
          console.error("[generate-listing] resolve_aspects:", await res.text());
        }
      } catch (e) {
        console.error("[generate-listing] resolve_aspects exception:", e);
      }
      // Échec IA : on renvoie quand même les défauts déterministes déjà posés.
      return json({ aspects: out });
    }
    // photo_option: "ia_light" (Retouche IA — correction luminosité/blancs), "original" (aucune
    // retouche). Toute valeur absente, inconnue ou legacy ("ia", "ia_multi", "ia_simple", …)
    // retombe sur "original" : jamais de retouche GPT Image par défaut.
    // ⚠️ Bascule 02/09 : le niveau AVANCÉ ("ia_advanced") est SUPPRIMÉ du produit.
    // Un vieux client OTA qui l'enverrait encore est DÉGRADÉ EN DOUCEUR vers la
    // légère (renommée « Retouche IA ») — jamais un refus pour une option que son
    // écran affichait la veille. Aucun job en vol ne casse : la retouche est
    // synchrone (elle vit dans CET appel), photo_option sur les jobs existants
    // n'est qu'une étiquette.
    const rawPhotoOption = typeof body.photo_option === "string" ? body.photo_option : "";
    const photo_option = rawPhotoOption === "ia_advanced" || rawPhotoOption === "ia_light" ? "ia_light" : "original";
    // background: choix de fond, uniquement pris en compte en ia_advanced (voir
    // BACKGROUND_OPTIONS). Toute valeur absente/inconnue → "original" (aucun
    // remplacement de fond, comportement historique).
    const rawBackground = typeof body.background === "string" ? body.background : "";
    const background = Object.prototype.hasOwnProperty.call(BACKGROUND_OPTIONS, rawBackground) ? rawBackground : "original";
    // price may be pre-fetched client-side; used as fallback if prix_vente is null in DB
    const body_price = body.price != null ? Number(body.price) : null;

    if (
      (!inventaire_id && !item_data) ||
      !Array.isArray(photos) || photos.length === 0 ||
      !Array.isArray(platforms) || platforms.length === 0
    ) {
      return json({ error: "Missing required fields: inventaire_id or item_data, photos, platforms" }, 400);
    }

    // ── Génération PAYANTE : price_generate unités (6 depuis la grille du
    // 2026-08-08), débitées ICI, avant tout appel LLM ────────────────────────
    // (2026-08-05, remplace le plafond 15/60 par 24 h ET l'ancien pré-check
    // « le solde couvre-t-il la future publication » — la génération est un
    // poste à part entière : quelqu'un qui n'a que de quoi générer a le droit
    // de générer, la publication tranchera son propre prix à son propre clic.)
    // Tous tiers : Premium/Pro paient aussi, leurs grants sont là pour ça.
    // spend_coins_for_generate lit price_generate en config (jamais en dur),
    // fait le grant mensuel lazy, débite included d'abord — modèle
    // spend_coins_for_lens. Échec de génération → remboursement AUTOMATIQUE
    // (refundGenerateFn ci-dessous, kind 'refund_generate') : un débit qui
    // survivrait à un échec transformerait le geste en arnaque au premier bug.
    // (La garde « pricing_ack » du 05/08 au soir a été retirée le soir même,
    // décision Nico : Capgo va être réactivé, les fronts mobiles retrouveront
    // l'affichage du prix à la source — le débit reste inconditionnel.)
    {
      // Bascule quotas (02/09) : p_inventaire_id permet au RPC de laisser
      // passer GRATUITEMENT une régénération du même article sous 24 h (42 %
      // des générations sont des reprises de confort) et de dédupliquer le
      // comptage. Les corps item_data (article pas encore sauvé) n'ont pas
      // d'id : chaque appel compte — limite assumée, signalée à Nico.
      const { data: spend, error: spendErr } = await adminClient
        .rpc("spend_coins_for_generate", {
          p_user_id: user.id,
          p_inventaire_id: inventaire_id ?? null,
        });
      if (spendErr) {
        console.error("[generate-listing] spend_coins_for_generate:", spendErr.message);
        return json({ error: "Internal server error" }, 500);
      }
      if (spend?.allowed === false) {
        if (spend.reason === "insufficient_coins") {
          return json({ error: "insufficient_coins", price: spend.price, balance: spend.balance }, 402);
        }
        // Quota d'annonces du cycle atteint (bascule 02/09) — refus AVANT
        // tout appel IA, relayé tel quel : l'app ouvre la modale de
        // conversion (origine quota_annonces).
        if (spend.reason === "quota_annonces_atteint") {
          return json({ error: "quota_annonces_atteint", plafond: spend.plafond, consommes: spend.consommes }, 402);
        }
        // Plafond quotidien Pro (2026-08-08) : la génération offerte a retiré
        // le frein économique — la RPC compte (usage_logs generate_pro_free)
        // et refuse au-delà de coin_config.pro_generate_daily_cap. Le code
        // 'generation_limit' est VOULU : le front affiche déjà ce message
        // serveur tel quel (bandeau step 2), zéro changement client.
        if (spend.reason === "pro_daily_cap_reached") {
          return json({ error: "generation_limit", message: spend.message, cap: spend.cap, used: spend.used }, 429);
        }
        console.error("[generate-listing] débit refusé:", spend?.reason);
        return json({ error: "Internal server error" }, 500);
      }
      const paid: number = spend?.price ?? 0;
      let refunded = false;
      const uid = user.id;
      refundGenerateFn = async (reason: string) => {
        if (refunded || paid <= 0) return;
        refunded = true;
        const { error } = await adminClient.rpc("refund_coins", {
          p_user_id: uid,
          p_amount: paid,
          p_metadata: { source: reason },
          p_kind: "refund_generate",
        });
        if (error) console.error("[generate-listing] refund_coins:", error.message);
      };
    }

    // ── Quota Retouche IA (bascule 02/09) — AVANT tout appel image ──────────
    // La retouche est synchrone et vit dans CET appel : le refus ici garantit
    // qu'aucun appel GPT Image ne part. Clé absente → fail-open ; valeur 0 =
    // aucune retouche au palier (free). Comptage par cycle d'abonnement, sur
    // les lignes usage_logs 'photo_retouche' (posées plus bas à chaque
    // retouche livrée). Refus nommé, relayé à l'app (modale quota_retouche).
    if (photo_option === "ia_light") {
      const { data: tierRow } = await adminClient.from("profiles")
        .select("is_premium,is_pro,is_business,is_comped").eq("id", user.id).maybeSingle();
      const tierRetouche = tierRow?.is_business ? "business" : tierRow?.is_pro ? "pro"
        : (tierRow?.is_premium || tierRow?.is_comped) ? "premium" : "free";
      const { data: qRows } = await adminClient.from("coin_config")
        .select("key, value").in("key", [`quota_retouche_${tierRetouche}`, "quotas_retouche_depuis"]);
      const parCle = Object.fromEntries((qRows ?? []).map((r) => [r.key, r.value]));
      const quotaRetouche = typeof parCle[`quota_retouche_${tierRetouche}`] === "number"
        ? parCle[`quota_retouche_${tierRetouche}`] as number : null;
      if (quotaRetouche !== null) {
        const { data: cycleDebut } = await adminClient.rpc("debut_cycle_quotas", { p_user_id: user.id });
        // Remise à zéro à la fusion (02/09 soir) : les retouches payées en
        // unités AVANT la bascule comptaient dans le cycle et saturaient
        // 3 comptes payants à tort. Borne basse = max(début de cycle,
        // quotas_retouche_depuis) — même modèle que le compteur d'annonces ;
        // dès le cycle suivant, l'origine est dépassée et ne sert plus.
        const depuisEpoch = typeof parCle["quotas_retouche_depuis"] === "number" ? parCle["quotas_retouche_depuis"] as number : 0;
        const cycleIso = cycleDebut ?? new Date(Date.now() - 31 * 864e5).toISOString();
        const borne = new Date(Math.max(Date.parse(cycleIso), depuisEpoch * 1000)).toISOString();
        const { count: retouchesFaites } = await adminClient.from("usage_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id).eq("feature", "photo_retouche")
          .gte("created_at", borne);
        if ((retouchesFaites ?? 0) >= quotaRetouche) {
          await refundGenerateFn?.("quota_retouche"); // prix 0 → no-op ; ancien monde → rendu
          return json({
            error: "quota_retouche_atteint",
            plafond: quotaRetouche, consommes: retouchesFaites ?? 0,
          }, 402);
        }
      }
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
      if (itemErr || !data) {
        // Rien n'a été généré : l'unité du clic est rendue.
        await refundGenerateFn?.("item_not_found");
        return json({ error: "Item not found" }, 404);
      }
      item = data;
    }

    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
    const BUCKET = "listing-photos";

    // ── Re-hébergement des photos EXTERNES (2026-08-06, « Failed to fetch ») ──
    // Les articles importés du dressing (origine='vinted_sync') portent des
    // URLs images1.vinted.net écrites telles quelles par la sync
    // (background.js, frontière de propriété des photos). Le CDN Vinted ne
    // sert AUCUN en-tête CORS : le fetch() des content scripts (urlToFile)
    // échoue depuis les pages Leboncoin/Beebs/eBay en « Failed to fetch » —
    // et un content script MV3 reste soumis au CORS de la page hôte quoi
    // qu'autorise le manifeste. Le re-hébergement vit donc CÔTÉ SERVEUR (pas
    // de CORS ici), AVANT la création du job : mêmes gardes que
    // republish-capture-photos (hôtes Vinted FERMÉS — jamais un proxy
    // ouvert —, taille plafonnée, timeout, séquentiel). Un échec par photo ne
    // bloque pas la génération : l'URL d'origine est conservée, la
    // publication échouera avec le message actionnable des content scripts.
    // inventaire.photos est réaligné URL par URL (structure préservée —
    // strings nues de la sync ET objets {type,url} coexistent en base) : le
    // travail n'a lieu qu'UNE fois par article, et la frontière de propriété
    // de la sync (photosANous) protège ensuite ces URLs de tout écrasement.
    const estUrlCdnExterne = (u: unknown): u is string => {
      if (typeof u !== "string") return false;
      try {
        const url = new URL(u);
        return url.protocol === "https:" && /(^|\.)vinted\.(net|fr|com)$/i.test(url.hostname);
      } catch { return false; }
    };
    let photosSource = photos as string[];
    const externes = photosSource.filter(estUrlCdnExterne);
    if (externes.length) {
      const MAX_OCTETS_PAR_PHOTO = 10 * 1024 * 1024;
      const REHOST_TIMEOUT_MS = 15_000;
      // Retentatives (bug 27/08, job 94cbe6d9 « Plateau vintage ») : un HTTP 520
      // transitoire du Storage à l'UPLOAD laissait la photo sur le CDN en une
      // seule tentative silencieuse — la publication échouait 10 min plus tard
      // sur la page de dépôt. On ne retente que les échecs TRANSITOIRES
      // (réseau, timeout, 5xx/429/408, upload Storage) ; les refus permanents
      // (pas une image, taille hors bornes, 404…) sortent au premier tour.
      const REHOST_TENTATIVES = 3;
      const tsRehost = Date.now();
      const remplacements = new Map<string, string>();
      for (let i = 0; i < externes.length; i++) {
        const src = externes[i];
        for (let tentative = 1; tentative <= REHOST_TENTATIVES; tentative++) {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), REHOST_TIMEOUT_MS);
          let transitoire = false;
          try {
            const resp = await fetch(src, { signal: ctl.signal });
            if (!resp.ok) {
              transitoire = resp.status >= 500 || resp.status === 429 || resp.status === 408;
              console.error(`[generate-listing] rehost photo ${i} (${tentative}/${REHOST_TENTATIVES}): HTTP ${resp.status}`);
            } else {
              const bytes = new Uint8Array(await resp.arrayBuffer());
              const contentType = resp.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
              if (!bytes.byteLength || bytes.byteLength > MAX_OCTETS_PAR_PHOTO) {
                console.error(`[generate-listing] rehost photo ${i}: taille hors bornes (${bytes.byteLength} octets)`);
              } else if (!contentType.startsWith("image/")) {
                console.error(`[generate-listing] rehost photo ${i}: pas une image (${contentType})`);
              } else {
                const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
                // ts dans le chemin : une même URL re-tentée plus tard ne s'écrase pas.
                const path = `${user.id}/rehosted/${inventaire_id ?? "adhoc"}/${tsRehost}_${i}.${ext}`;
                const { error: upErr } = await adminClient.storage
                  .from(BUCKET)
                  .upload(path, bytes, { contentType, upsert: true });
                if (upErr) {
                  transitoire = true; // le cas réel du 27/08 : 520 Cloudflare côté Storage
                  console.error(`[generate-listing] rehost photo ${i} (${tentative}/${REHOST_TENTATIVES}): upload — ${upErr.message}`);
                } else {
                  remplacements.set(src, adminClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
                }
              }
            }
          } catch (e) {
            transitoire = true;
            console.error(`[generate-listing] rehost photo ${i} (${tentative}/${REHOST_TENTATIVES}):`, (e as Error)?.name === "AbortError" ? `timeout ${REHOST_TIMEOUT_MS / 1000}s` : e);
          } finally {
            clearTimeout(timer);
          }
          if (remplacements.has(src) || !transitoire) break;
          if (tentative < REHOST_TENTATIVES) await new Promise((r) => setTimeout(r, 400 * tentative));
        }
      }
      if (remplacements.size) {
        photosSource = photosSource.map((u) => remplacements.get(u) ?? u);
        if (inventaire_id) {
          const { data: ligne } = await adminClient
            .from("inventaire")
            .select("photos")
            .eq("id", inventaire_id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (Array.isArray(ligne?.photos)) {
            const majPhoto = (p: unknown) => {
              if (typeof p === "string") return remplacements.get(p) ?? p;
              if (p && typeof p === "object" && typeof (p as { url?: unknown }).url === "string") {
                const nv = remplacements.get((p as { url: string }).url);
                return nv ? { ...(p as object), url: nv } : p;
              }
              return p;
            };
            const nouvelles = (ligne.photos as unknown[]).map(majPhoto);
            if (JSON.stringify(nouvelles) !== JSON.stringify(ligne.photos)) {
              const { error: majErr } = await adminClient
                .from("inventaire")
                .update({ photos: nouvelles })
                .eq("id", inventaire_id)
                .eq("user_id", user.id);
              if (majErr) console.error(`[generate-listing] rehost: inventaire ${inventaire_id} non réaligné — ${majErr.message}`);
            }
          }
        }
      }
      if (remplacements.size < externes.length) {
        // Rapatriement INCOMPLET malgré les retentatives : trace en error (les
        // console.log se noient) — le balayage handler-watch rapatriera les
        // restantes avant/à la publication (filet du 27/08).
        console.error(`[generate-listing] rehost INCOMPLET: ${externes.length - remplacements.size}/${externes.length} photo(s) encore sur le CDN (inventaire ${inventaire_id ?? "absent"})`);
      }
      console.log(`[generate-listing] rehost: ${remplacements.size}/${externes.length} photo(s) CDN re-hébergée(s) (inventaire ${inventaire_id ?? "absent"})`);
    }

    // ── category_icon (chantier 2026-07-20) ────────────────────────────────
    // EN PLUS des titres/descriptions : une classification directe de l'objet
    // principal parmi la liste FERMÉE des icônes du système (ALL_OBJECT_ICONS,
    // importée de shared.js — jamais une valeur inventée). But : au moment de
    // la génération, la catégorisation ne dépend plus UNIQUEMENT de
    // detectObjectIcon (regex mots-clés sur texte libre). Micro-appel ISOLÉ,
    // même philosophie que resolve_genre/resolve_aspects. Garanties :
    //   - valeur hors liste, absente, contexte vide ou IA en échec → null →
    //     le champ est OMIS de la réponse → le client retombe silencieusement
    //     sur detectObjectIcon (comportement actuel, zéro régression) ;
    //   - lancé MAINTENANT, attendu seulement à la fin (chevauche la retouche
    //     photo et les 4 appels de génération) → coût wall-clock ~nul ;
    //   - n'échoue jamais la génération : toute exception est avalée.
    // detectObjectIcon reste le filet de secours et n'est pas modifié.
    const ICON_SET = new Set<string>(ALL_OBJECT_ICONS as string[]);
    // Légende « emoji = sens » construite depuis la SOURCE DE VÉRITÉ (shared.js).
    // Sans elle, Haiku ne reçoit que des emojis nus et confond les proxys
    // contre-intuitifs (🧶 pelote = sweat/hoodie, pris pour 🧥 manteau ; bug
    // Patagonia 2026-07-21). Une icône sans entrée de légende retombe sur l'emoji
    // seul — jamais d'omission ni de crash.
    const ICON_MENU = (ALL_OBJECT_ICONS as string[])
      .map((ic) => {
        const label = (ICON_LEGEND as Record<string, string>)[ic];
        return label ? `${ic} = ${label}` : ic;
      })
      .join("\n");
    const classifyCategoryIcon = async (): Promise<string | null> => {
      const ctx = [
        item.marque && `Marque: ${item.marque}`,
        item.titre && `Article: ${item.titre}`,
        item.type && `Type: ${item.type}`,
        item.description && `Description: ${item.description}`,
      ].filter(Boolean).join("\n");
      if (!ctx) return null;
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 20,
            system: `Tu classes un article d'occasion en choisissant l'emoji qui représente le mieux son OBJET PRINCIPAL, STRICTEMENT parmi cette liste (aucune autre valeur n'est acceptée). Chaque emoji est suivi de son SENS — fie-toi au sens, pas à l'apparence de l'emoji :\n${ICON_MENU}\n\nRègles : choisis l'objet lui-même, pas un accessoire inclus ni la marque. Un sweat/pull/hoodie (même d'une marque outdoor comme Patagonia, The North Face…) est un vêtement en maille → 🧶, PAS un manteau 🧥. Réponds UNIQUEMENT du JSON valide {"icon":"<un emoji exact de la liste>"} ; si aucun ne convient clairement, {"icon":null}.`,
            messages: [{ role: "user", content: `Quel emoji pour cet article ?\n${ctx}` }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          trackClaude(data);
          const text: string = data.content?.[0]?.text ?? "";
          const m = text.match(/"icon"\s*:\s*"([^"]+)"/);
          const icon = m?.[1];
          if (icon && ICON_SET.has(icon)) return icon;
        } else {
          console.error("[generate-listing] category_icon:", await res.text());
        }
      } catch (e) {
        console.error("[generate-listing] category_icon exception:", e);
      }
      return null;
    };
    const categoryIconPromise = classifyCategoryIcon();

    // ── Step 1 & 2: Photo processing ──────────────────────────────────────────
    let processedPhotos: Array<{ type: string; url: string }>;

    if (photo_option === "original") {
      processedPhotos = photosSource.map((url, i) => ({
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
      // ia_advanced : prompt spécialisé selon la famille de produit (détectée
      // via detectObjectIcon sur titre/description/type — mêmes règles que
      // l'app). ia_light : prompt générique (luminosité/blancs seulement).
      const retouch = retouchProfileFor(item);
      // Fond : uniquement en ia_advanced, valeur connue et != original. Quand un
      // fond est appliqué, on n'envoie PAS l'intro famille — mais la clause
      // d'intégrité (VÊTEMENT pour la famille vetements, autorisant un léger
      // défroissage ; STRICTE sinon, objet 100 % intact) + le fond choisi.
      // Un SEUL appel image, comme avant.
      const bgSuffix = !isLight && background !== "original" ? BACKGROUND_OPTIONS[background] : null;
      let promptToUse: string;
      if (isLight) {
        promptToUse = OPENAI_IMG_PROMPT_LIGHT;
      } else if (bgSuffix) {
        const bgClause = retouch.family === "vetements" ? BG_INTEGRITY_CLAUSE_CLOTHING : BG_INTEGRITY_CLAUSE;
        promptToUse = `${bgClause} ${bgSuffix}`;
        console.log(`[gpt-image] fond appliqué: ${background} (famille ${retouch.family}, icône ${retouch.icon})`);
      } else {
        promptToUse = retouch.prompt;
        console.log(`[gpt-image] famille de retouche: ${retouch.family} (icône ${retouch.icon})`);
      }
      const qualityToUse = isLight ? "low" : "medium";
      const photosToProcess = photosSource;
      // ── Photos verrouillées (2026-08-05, option A validée par Nico) ────────
      // Article DÉJÀ retouché auquel on ajoute de nouvelles photos : le client
      // envoie locked_photos = les URLs déjà retouchées (et déjà payées). Ces
      // photos passent TELLES QUELLES — l'IA ne retraite que les nouvelles,
      // on ne refait jamais un travail payé. Elles ne consomment pas non plus
      // le budget de retouche : le plafond MAX_RETOUCHED s'applique aux photos
      // réellement envoyées à GPT Image, pas aux positions.
      const lockedSet = new Set<string>(
        Array.isArray(body.locked_photos)
          ? (body.locked_photos as unknown[]).filter((u): u is string => typeof u === "string")
          : [],
      );
      // Garde-fou coûts : 5 photos max passent en retouche GPT Image par annonce
      // (base du prix fixe par annonce du système de pièces) ; les photos au-delà
      // sont conservées telles quelles dans l'annonce.
      const MAX_RETOUCHED = 5;
      let retouchBudget = MAX_RETOUCHED;
      const shouldRetouch = photosToProcess.map((u) => {
        if (lockedSet.has(u)) return false;
        if (retouchBudget <= 0) return false;
        retouchBudget--;
        return true;
      });
      const ts = Date.now();
      // Télémétrie retouche (2026-08-08) : départ chrono et nombre de photos
      // réellement envoyées à GPT Image — la ligne usage_logs dédiée est posée
      // juste après processedPhotos.
      const retoucheDebutMs = Date.now();
      const photosEnvoyees = shouldRetouch.filter(Boolean).length;
      const results = await Promise.allSettled(
        photosToProcess.map(async (photoUrl, idx) => {
          if (!shouldRetouch[idx]) {
            return { type: idx === 0 ? "original" : `photo_${idx}`, url: photoUrl };
          }
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
          cost.images += 1;
          cost.image_quality = qualityToUse;
          // Tokens exacts facturés par OpenAI pour CETTE image. Si le détail
          // text/image manque, tout input_tokens part en "text" (tarif le
          // plus bas : on sous-estime plutôt que d'inventer).
          const imgUsage = (resData as {
            usage?: {
              input_tokens?: number; output_tokens?: number;
              input_tokens_details?: { text_tokens?: number; image_tokens?: number };
            };
          }).usage;
          if (imgUsage) {
            const imageIn = imgUsage.input_tokens_details?.image_tokens ?? 0;
            const textIn = imgUsage.input_tokens_details?.text_tokens
              ?? Math.max(0, (imgUsage.input_tokens ?? 0) - imageIn);
            cost.img_usage_n += 1;
            cost.img_text_in += textIn;
            cost.img_image_in += imageIn;
            cost.img_out += imgUsage.output_tokens ?? 0;
          }
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

      // ── Télémétrie retouche (2026-08-08) : ligne usage_logs DÉDIÉE ────────
      // Dernier poste facturé dont le prix de revient n'était mesuré nulle
      // part : le coût images était FONDU dans le cost_usd de la ligne
      // 'generate_listing'. Désormais : une ligne 'photo_retouche' par
      // retouche, même forme que 'lens' et 'generate_listing' (cost_usd dans
      // metadata) — les trois postes se comparent dans une même requête.
      // La ligne 'generate_listing' du même appel ne porte plus que le texte
      // (cf. plus bas), sinon toute somme par feature compterait double.
      // Livraison comptée sur l'URL /enhanced/<ts>_ de CE run : la photo 0
      // retouchée garde type 'original' (l'URL fait foi — piège connu), et
      // les locked_photos, déjà sous /enhanced/ d'un run passé, ne comptent
      // pas. Insert best-effort, comme les autres télémétries.
      const retoucheLivrees = processedPhotos.filter(p => p.url.includes(`/enhanced/${ts}_`)).length;
      // ── Coût RÉEL depuis le bloc usage d'OpenAI (audit du 08/08) ──────────
      // Tarifs gpt-image-2 standard, page pricing OpenAI relevée le 08/08 :
      // text input 5 $/MTok · image input 8 $/MTok · image output 30 $/MTok.
      // cost_source distingue un coût MESURÉ (toutes les réponses portaient
      // le bloc usage) d'un coût SUPPOSÉ (repli sur les constantes maison
      // 0,01/0,04 $ par image, qui ignorent l'entrée).
      const TARIF_GPT_IMAGE2 = { textInParMTok: 5, imageInParMTok: 8, outParMTok: 30 } as const;
      const usageComplet = cost.images > 0 && cost.img_usage_n === cost.images;
      const retoucheUsd = usageComplet
        ? (cost.img_text_in * TARIF_GPT_IMAGE2.textInParMTok
           + cost.img_image_in * TARIF_GPT_IMAGE2.imageInParMTok
           + cost.img_out * TARIF_GPT_IMAGE2.outParMTok) / 1_000_000
        : cost.images * (qualityToUse === "low" ? 0.01 : 0.04);
      adminClient.from("usage_logs").insert({
        user_id: user.id,
        feature: "photo_retouche",
        metadata: {
          level: photo_option,
          image_quality: qualityToUse,
          photos_total: photosToProcess.length,
          photos_envoyees: photosEnvoyees,
          photos_livrees: retoucheLivrees,
          photos_verrouillees: lockedSet.size,
          background: bgSuffix ? background : "original",
          delivered: retoucheLivrees > 0,
          duration_ms: Date.now() - retoucheDebutMs,
          // Tokens bruts TOUJOURS journalisés, même en repli : ils permettent
          // de recaler le coût a posteriori sur la facture OpenAI.
          openai_text_input_tokens: cost.img_text_in,
          openai_image_input_tokens: cost.img_image_in,
          openai_output_tokens: cost.img_out,
          openai_usage_manquants: cost.images - cost.img_usage_n,
          cost_source: usageComplet ? "usage_api" : "estimation_constantes",
          cost_usd: Number(retoucheUsd.toFixed(4)),
        },
      }).then(({ error }) => {
        if (error) console.error("[generate-listing] usage_logs (photo_retouche):", error.message);
      });
    }

    // ── Step 3 : contexte + rédaction par plateforme — MODULE PARTAGÉ ────────
    // (extraits tels quels le 02/09 soir, cf. _shared/redaction-plateformes.ts
    // — la porte Lens unifiée appelle exactement le même code.)
    const { itemContext } = construireContexteArticle({
      item, canonicalProvided,
      familleLivresMedias: retouchProfileFor(item).family === "livres_medias",
    });
    const { platformListings, traceEtat, traceIsbn } = await redigerAnnoncesPlateformes({
      apiKey: ANTHROPIC_KEY, platforms: platforms as string[],
      itemContext, item, canonicalProvided, trackClaude,
    });

    // category_icon : attendu ICI seulement (il chevauchait la retouche photo
    // et la génération). null → champ OMIS → fallback client detectObjectIcon.
    const category_icon = await categoryIconPromise;

    // ── Coût de l'appel (2026-07-28) ─────────────────────────────────────────
    // Tarifs Haiku 4.5 : 1 $/MTok in, 5 $/MTok out. GPT Image 2 /images/edits :
    // ~0,01 $ l'image en quality "low", ~0,04 $ en "medium" (l'option de
    // retouche choisie décide, cf. qualityToUse).
    // Tracé DANS usage_logs (feature 'generate_listing') et non dans
    // coin_ledger : aucune unité n'est débitée ici, c'est de la télémétrie de
    // coût, pas un mouvement de solde. Insert best-effort — une génération
    // réussie ne doit jamais échouer parce que la mesure n'a pas pu s'écrire.
    const claudeUsd = (cost.claude_in / 1e6) * 1 + (cost.claude_out / 1e6) * 5;
    const imageUsd = cost.images * (cost.image_quality === "low" ? 0.01 : 0.04);
    const totalUsd = claudeUsd + imageUsd;
    console.log(
      `[generate-listing][cost] user=${user.id} platforms=${platforms.length} option=${photo_option}`
      + ` claude=${cost.claude_calls} appels ${cost.claude_in}in/${cost.claude_out}out`
      + ` images=${cost.images}@${cost.image_quality || "-"}`
      + ` usd=${totalUsd.toFixed(4)} (claude ${claudeUsd.toFixed(4)} + image ${imageUsd.toFixed(4)})`
    );
    adminClient.from("usage_logs").insert({
      user_id: user.id,
      feature: "generate_listing",
      metadata: {
        platforms: platforms.length,
        photo_option,
        // Bascule quotas (02/09) : l'id d'article alimente la dédup « une
        // régénération sous 24 h ne recompte pas » (quota_annonces_consommees).
        // Absent sur les corps item_data (article pas encore sauvé).
        ...(inventaire_id ? { inventaire_id: String(inventaire_id) } : {}),
        ...traceEtat,
        ...traceIsbn,
        claude_calls: cost.claude_calls,
        claude_input_tokens: cost.claude_in,
        claude_output_tokens: cost.claude_out,
        images: cost.images,
        image_quality: cost.image_quality || null,
        // (2026-08-08) cost_usd = le TEXTE seulement. La part images vit dans
        // la ligne 'photo_retouche' du même appel — avant cette date, cette
        // ligne portait claude + images fondus (cost_scope absent = ancien
        // périmètre, à savoir pour les requêtes historiques).
        cost_usd: Number(claudeUsd.toFixed(4)),
        cost_scope: "texte",
      },
    }).then(({ error }) => {
      if (error) console.error("[generate-listing] usage_logs:", error.message);
    });

    // ── Livraison ou remboursement (2026-08-05) ──────────────────────────────
    // « Réponse vide ou inexploitable » = AUCUNE plateforme générée : le
    // client n'aurait rien à afficher (il vérifie data.platforms) — l'unité
    // est rendue et l'erreur est franche. Une génération PARTIELLE (au moins
    // une plateforme sur les demandées) reste livrée et due : le stepper
    // permet de corriger/compléter plateforme par plateforme.
    const platformsDelivered = Object.values(platformListings ?? {}).filter(Boolean).length;
    if (platformsDelivered === 0) {
      await refundGenerateFn?.("empty_generation");
      return json({ error: "generation_failed" }, 500);
    }
    // Cas dégradé TOTAL : la fonction pose des titres de REPLI quand un appel
    // Claude échoue (design d'avant le paiement, conservé — mieux vaut un
    // squelette que rien). Mais zéro appel LLM abouti = le service payé (la
    // rédaction) n'a PAS été rendu : le squelette part quand même, l'unité
    // est rendue. cost.claude_calls ne compte que les réponses ABOUTIES.
    if (cost.claude_calls === 0) {
      console.warn("[generate-listing] aucun appel LLM abouti — squelette livré, unité remboursée");
      await refundGenerateFn?.("no_llm_output");
    }

    // ── Return generated data (INSERT happens client-side in ListingPreviewScreen) ──
    return json({
      photos: processedPhotos,
      platforms: platformListings,
      price: item.prix_vente ?? body_price ?? null,
      ...(category_icon ? { category_icon } : {}),
    });

  } catch (e) {
    console.error("[generate-listing] unhandled:", e);
    // Génération jamais livrée (erreur LLM, timeout, exception quelconque) :
    // l'unité du clic est rendue avant de répondre.
    await refundGenerateFn?.("unhandled_error");
    return json({ error: "Internal server error" }, 500);
  }
});
