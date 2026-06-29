import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost"];

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ── Détection par plateforme ───────────────────────────────────────────────────

function detectLeboncoin(html: string): "sold" | "active" | "unknown" {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const pp = data?.props?.pageProps;
      const isActive = pp?.adDetail?.isActive ?? pp?.ad?.isActive;
      if (isActive === false) return "sold";
      if (isActive === true) return "active";
      const st = String(pp?.adDetail?.adStatus ?? pp?.ad?.status ?? "");
      if (/INACTIVE|DELETED|SOLD/i.test(st)) return "sold";
      if (/^ACTIVE$/i.test(st)) return "active";
    } catch { /* fall through */ }
  }
  if (
    html.includes("Cette annonce n’est plus disponible") ||
    html.includes("Cette annonce n'est plus disponible") ||
    html.includes("a été supprimée") ||
    html.includes('"isActive":false') ||
    html.includes('"adStatus":"INACTIVE"') ||
    html.includes('"adStatus":"DELETED"')
  ) return "sold";
  return "active";
}

function detectVinted(html: string, finalUrl: string): "sold" | "active" | "unknown" {
  if (/\/not-found|\/404/.test(finalUrl)) return "sold";
  if (
    html.includes('"can_buy":false') ||
    html.includes('"status":"sold"') ||
    html.includes('"is_hidden":true') ||
    html.includes('"sold":true') ||
    html.includes("item-not-available") ||
    html.includes("n’est plus disponible") ||
    html.includes("is no longer available")
  ) return "sold";
  return "active";
}

function detectEbay(html: string, finalUrl: string): "sold" | "active" | "unknown" {
  if (!/\/itm\//.test(finalUrl)) return "sold";
  if (
    html.includes("This listing was ended") ||
    html.includes("Cette annonce a pris fin") ||
    html.includes('"listingStatus":"Completed"') ||
    html.includes('"listingStatus":"Ended"')
  ) return "sold";
  return "active";
}

function detectBeebs(html: string): "sold" | "active" | "unknown" {
  if (
    html.includes('"sold":true') ||
    html.includes('"is_sold":true') ||
    html.includes("n’est plus disponible") ||
    html.includes("n'est plus disponible")
  ) return "sold";
  return "active";
}

// ── Fetch + détection ──────────────────────────────────────────────────────────

async function checkListingUrl(
  url: string,
  platform: string
): Promise<"sold" | "active" | "unknown"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);

    const { status } = res;
    const finalUrl = res.url;
    console.log(`[check-listing] ${platform} → HTTP ${status} (${url})`);

    if (status === 404 || status === 410) return "sold";
    // Bot protection ou erreur serveur → ne pas conclure à sold
    if (status !== 200) return "unknown";

    const html = await res.text();

    switch (platform) {
      case "leboncoin": return detectLeboncoin(html);
      case "vinted":    return detectVinted(html, finalUrl);
      case "ebay":      return detectEbay(html, finalUrl);
      case "beebs":     return detectBeebs(html);
      default:          return "unknown";
    }
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[check-listing] Erreur fetch ${url}: ${msg}`);
    return "unknown";
  }
}

// ── Handler principal ──────────────────────────────────────────────────────────

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ok */ }

    // ── Authentification ──────────────────────────────────────────────────────
    let userId: string | null = null;
    const authHeader  = req.headers.get("Authorization") ?? "";
    const cronHeader  = req.headers.get("x-cron-secret");
    const CRON_SECRET = Deno.env.get("CRON_SECRET");

    if (authHeader.startsWith("Bearer ")) {
      const jwt = authHeader.slice(7).trim();
      const { data: { user }, error } = await supabase.auth.getUser(jwt);
      if (error || !user) return json({ error: "Token invalide ou expiré" }, 401);
      userId = user.id;
    } else if (CRON_SECRET && cronHeader === CRON_SECRET) {
      userId = (body?.user_id as string) ?? null;
    } else {
      return json({ error: "Non autorisé" }, 401);
    }

    if (!userId) return json({ error: "user_id manquant" }, 400);

    // ── Récupération des jobs published ──────────────────────────────────────
    const { data: jobs, error: jobsErr } = await supabase
      .from("cross_post_jobs")
      .select("id, listing_url, platform")
      .eq("user_id", userId)
      .eq("status", "published")
      .not("listing_url", "is", null);

    if (jobsErr) return json({ error: jobsErr.message }, 500);

    console.log(`[check-listing] userId=${userId} → ${jobs?.length ?? 0} job(s) à vérifier`);

    const results: Array<{ id: string; platform: string; detected: string }> = [];

    for (let i = 0; i < (jobs?.length ?? 0); i++) {
      const job = jobs![i];
      const detected = await checkListingUrl(job.listing_url, job.platform);

      const patch: Record<string, unknown> = {
        last_checked_at: new Date().toISOString(),
      };
      if (detected === "sold") {
        patch.status  = "sold";
        patch.sold_at = new Date().toISOString();
      }

      const { error: updateErr } = await supabase
        .from("cross_post_jobs")
        .update(patch)
        .eq("id", job.id);

      if (updateErr) {
        console.error(`[check-listing] Update error job ${job.id}:`, updateErr.message);
      }

      results.push({ id: job.id, platform: job.platform, detected });

      if (i < jobs!.length - 1) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    const soldCount = results.filter((r) => r.detected === "sold").length;
    return json({ success: true, checked: results.length, sold: soldCount, results });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[check-listing] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
