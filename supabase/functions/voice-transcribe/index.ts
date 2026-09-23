import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import {
  WHISPER_BIAS_PROMPT,
  detecterHallucinationWhisper,
} from "../_shared/whisper-hallucinations.ts";

// ⚠️ http://localhost:5173 (Vite dev) : sans lui, tout appel depuis le développement
// casse dès le PRÉFLIGHT CORS (« header has a value 'https://fillsell.app' that is not
// equal to the supplied origin »). Vécu le 2026-07-13 sur check-listing-status — le
// chemin « Oui, enregistrer la vente » était cassé depuis toujours en local. Passe
// généralisée aux 15 fonctions restantes. La PROD n'a jamais été affectée.
const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];

const ALLOWED_TYPES: Record<string, string> = {
  "audio/webm":  "webm",
  "audio/mp4":   "mp4",
  "audio/aac":   "aac",
  "audio/mpeg":  "mp3",
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

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

  // ── Voice quota — reads premium status from DB (server-side, not from client) ──
  // Expression premium canonique (2026-07-25, cf. CLAUDE.md) : is_premium/is_pro
  // = source de vérité maintenue par les flux de paiement, is_comped = comptes
  // offerts. is_founder et les ids Apple/Google résiduels ne valent PLUS statut
  // premium — un abonnement résilié/expiré = free.
  const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profileData } = await adminClient.from("profiles")
    .select("is_premium, is_pro, is_comped")
    .eq("id", user.id).single();
  const isPremiumUser = !!(
    profileData?.is_premium ||
    profileData?.is_pro ||
    profileData?.is_comped
  );
  const { data: quotaData, error: quotaError } = await adminClient.rpc("check_and_log_usage", {
    p_user_id: user.id,
    p_feature: "voice",
    p_is_premium: isPremiumUser,
    // Quotas 2026-07-23 : Free 50/jour sans plafond mensuel, Premium/Pro
    // ILLIMITÉ (NULL = vrai bypass dans check_and_log_usage — le IF saute
    // quand la limite est NULL, aucun plafond factice). Aligné sur
    // VOICE_FREE_LIMIT (App.jsx) et voice-intent.
    p_daily_limit_free: 50,
    p_monthly_limit_free: null,
    p_daily_limit_premium: null,
    p_monthly_limit_premium: null,
  });
  if (quotaError) console.error("[voice-transcribe] check_and_log_usage error:", quotaError.message);
  if (quotaData?.allowed === false) {
    return new Response(
      JSON.stringify({ error: "quota_exceeded", reason: quotaData.reason, limit: quotaData.limit }),
      { status: 429, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  // ── ISSUE DE LA TRANSCRIPTION (2026-08-11) ─────────────────────────────────
  // POURQUOI. La ligne usage_logs 'voice' est écrite par check_and_log_usage
  // AVANT même qu'on lise l'audio, et sa metadata restait vide : « une requête
  // authentifiée a passé le quota », rien de plus. Résultat, un `voice` sans
  // `voice_intent` était indécidable — panne de format, Whisper muet,
  // hallucination, abandon, ou simple dictée du micro Lens (qui n'appelle
  // JAMAIS voice-intent, par conception) se ressemblaient tous. Sur 48 h,
  // 15 lignes orphelines sur 44 sans un seul moyen de les trancher.
  //
  // CE QUE ÇA NE FAIT PAS : ni quota, ni statut HTTP, ni texte rendu ne
  // changent. L'écriture n'est JAMAIS attendue dans le chemin de réponse
  // (waitUntil quand la plateforme l'expose, sinon promesse abandonnée) et ne
  // peut pas lever. Aucun contenu de phrase n'est enregistré.
  const quotaLogId: string | null = (quotaData as any)?.log_id ?? null;
  const marquerIssue = (issue: string, detail: Record<string, unknown> = {}) => {
    if (!quotaLogId) return;
    try {
      const p = adminClient.from("usage_logs")
        .update({ metadata: { issue, ...detail } })
        .eq("id", quotaLogId)
        .then(() => {}, () => {});
      (globalThis as any).EdgeRuntime?.waitUntil?.(p);
    } catch { /* jamais bloquant */ }
  };

  // ── UNE HALLUCINATION NE DOIT PAS COÛTER UNE UNITÉ (2026-09-19) ────────────
  // MESURÉ sur 30 jours, 234 appels : 63 hallucinations sur les 194 appels
  // tracés, soit 32 %. Et le chiffre qui décide : 23 des 37 « credits_video »
  // étaient le TOUT PREMIER essai vocal du compte. Quelqu'un découvre la
  // fonction, parle, l'app lui répond qu'elle n'a rien entendu — et lui prend
  // une unité. C'est un défaut d'accueil, et le rembourser n'est pas une
  // faveur, c'est de l'honnêteté.
  //
  // COMMENT, SANS TOUCHER AU COMPTEUR DE QUOTA. `check_and_log_usage` compte
  // les lignes `usage_logs` dont `feature = 'voice'` ; elle n'a aucune notion
  // de remboursement et je ne la modifie pas — c'est le quota payant, on ne
  // bricole pas sa fonction pour un cas particulier. On DÉPLACE la ligne sous
  // un autre nom de feature : elle sort du compte, et la télémétrie n'est pas
  // perdue pour autant (même id, même metadata, `rembourse: true`).
  // Réversible d'un UPDATE, et aucune migration.
  const FEATURE_REMBOURSEE = "voice_remboursee";
  const rembourserUnite = (issue: string, detail: Record<string, unknown> = {}) => {
    if (!quotaLogId) return;
    try {
      const p = adminClient.from("usage_logs")
        .update({ feature: FEATURE_REMBOURSEE, metadata: { issue, ...detail, rembourse: true } })
        .eq("id", quotaLogId)
        .then(() => {}, () => {});
      (globalThis as any).EdgeRuntime?.waitUntil?.(p);
    } catch { /* jamais bloquant */ }
  };

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const lang = (formData.get("lang") as string | null) ?? "fr";
    // ── LA DURÉE, ENFIN MESURÉE (2026-09-19) ──────────────────────────────
    // On sait que l'app (audio/mp4) hallucine 2,5 fois plus que le web
    // (21,5 % contre 8,3 %) et on ne sait pas POURQUOI : enregistrement trop
    // court, micro ouvert en retard, appui double. Aucune de ces trois causes
    // n'est distinguable sans la durée — elle n'était mesurée nulle part.
    // L'app l'envoie désormais ; elle est journalisée avec le poids de
    // l'audio, sur TOUTES les issues. Deux semaines de ce chiffre et la cause
    // sera nommée au lieu d'être supposée.
    const dureeBrute = Number(formData.get("duree_ms"));
    const dureeMs = Number.isFinite(dureeBrute) && dureeBrute >= 0 ? Math.round(dureeBrute) : null;

    if (!audioFile) {
      marquerIssue("format", { detail: "audio_absent" });
      return new Response(JSON.stringify({ error: "Missing audio field" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    if (audioFile.size > MAX_SIZE) {
      marquerIssue("format", { detail: "trop_gros", octets: audioFile.size });
      return new Response(JSON.stringify({ error: "File too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    let mimeType = audioFile.type;
    if (!mimeType) {
      const nameExt = (audioFile.name ?? "").split(".").pop()?.toLowerCase() ?? "";
      const extToMime: Record<string, string> = {
        webm: "audio/webm", mp4: "audio/mp4",
        aac: "audio/aac",   mp3: "audio/mpeg", mpeg: "audio/mpeg",
      };
      mimeType = extToMime[nameExt] ?? "";
    }

    const ext = ALLOWED_TYPES[mimeType];
    if (!ext) {
      // Le mime est la donnée qui manquait pour expliquer les 415 muets côté
      // appareil (WebView Android/iOS qui rend un conteneur non listé).
      marquerIssue("format", { detail: "mime_non_supporte", mime: mimeType || null });
      return new Response(JSON.stringify({ error: "Unsupported format" }), {
        status: 415,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const outForm = new FormData();
    outForm.append("file", audioFile, `audio.${ext}`);
    outForm.append("model", "whisper-1");
    outForm.append("language", lang === "en" ? "en" : "fr");
    outForm.append("prompt", WHISPER_BIAS_PROMPT);

    const response = await fetchWithRetry("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: outForm,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      marquerIssue("whisper_ko", { detail: "http", statut: response.status, mime: mimeType || null, octets: audioFile.size, duree_ms: dureeMs });
      return new Response(
        JSON.stringify({ error: errData?.error?.message ?? "OpenAI API error" }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    const data = await response.json();
    const texte = String(data.text ?? "").trim();

    // Hallucinations Whisper (2026-08-03) : sur un audio vide/inaudible,
    // Whisper invente des crédits de sous-titres ou recrache notre prompt de
    // marques. Le coût Whisper est déjà engagé, mais on coupe ICI : pas
    // d'appel Haiku derrière (voice-intent), et l'utilisateur reçoit un
    // message au lieu d'un bouton vocal qui ne fait rien. Le champ `error`
    // est le message AFFICHÉ tel quel par le front (FAB : throw tErr ; micro
    // Lens : ❌ json.error) — le garder humain et localisé, jamais un code.
    const filtre = detecterHallucinationWhisper(texte);
    if (filtre) {
      console.warn("[voice-transcribe] hallucination_filtree", JSON.stringify({
        raison: filtre, texte: texte.slice(0, 120),
      }));
      // L'unité est RENDUE : la ligne sort du compte du quota (cf. en-tête).
      rembourserUnite("hallucine", { raison: filtre, mime: mimeType || null, octets: audioFile.size, duree_ms: dureeMs });
      return new Response(JSON.stringify({
        text: "",
        filtered: filtre,
        // `rembourse` dit à l'app de rendre l'unité côté compteur gratuit
        // aussi : les deux compteurs doivent raconter la même chose.
        rembourse: true,
        // ⛔ LE MESSAGE N'ACCUSE PLUS PERSONNE (2026-09-19). L'ancien disait
        // « réessayez en parlant plus près du micro » : il renvoyait la faute
        // à quelqu'un dont l'enregistrement peut très bien avoir été coupé par
        // NOUS (micro pas encore ouvert, appui trop bref). On dit ce qui s'est
        // passé, on dit que ça n'a rien coûté, et on ne donne pas de leçon.
        error: lang === "en"
          ? "We couldn't make anything out of that recording — it happens when it's very short or the mic hadn't opened yet. Nothing was charged: try again."
          : "On n'a rien pu tirer de cet enregistrement — ça arrive quand il est très court ou que le micro n'était pas encore ouvert. Ça ne t'a rien coûté : réessaie.",
      }), { headers: { "Content-Type": "application/json", ...CORS } });
    }

    // Whisper a répondu 200 avec un texte vide : c'est ce que le front affiche
    // en « Aucune parole détectée ». Distinguer 'vide' de 'ok' est tout l'objet
    // de cette instrumentation — la réponse rendue ne change pas d'un octet.
    marquerIssue(texte ? "ok" : "vide", { mime: mimeType || null, octets: audioFile.size, duree_ms: dureeMs });
    return new Response(JSON.stringify({ text: texte }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err: any) {
    if (err?.isAiUnavailable) {
      marquerIssue("whisper_ko", { detail: "ai_unavailable" });
      return new Response(JSON.stringify({ error: "ai_unavailable", retry_after: 30 }), {
        status: 503, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    marquerIssue("whisper_ko", { detail: "exception" });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
