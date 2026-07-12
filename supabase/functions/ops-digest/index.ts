import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ops-digest — digest quotidien des anomalies cross_post_jobs, envoyé à
// support@fillsell.app UNIQUEMENT s'il y a au moins une ligne (silence = sain).
// Appelée par pg_cron à 8h50 UTC (avant l'email-tunnel de 9h), header
// x-cron-secret sur le modèle d'email-tunnel. Déployer avec --no-verify-jwt.
//
// Quatre sections :
//   1. jobs 'failed' des dernières 24 h (approximé par created_at : pas de
//      failed_at en base ; les jobs sont traités dans les minutes qui suivent
//      leur création, un failed plus vieux a déjà été signalé la veille) ;
//   2. jobs bloqués en 'processing' > 15 min malgré le repêchage de
//      background.js (platform_fields.processing_since, repli created_at) ;
//   3. jobs 'delete' non terminés > 24 h — le cas le plus grave : l'annonce
//      d'un article VENDU ailleurs est toujours en ligne (risque de double
//      vente). Terminaux d'un delete : 'deleted' (LIVE), 'dry_run_completed',
//      'cancelled' — un delete 'failed' reste donc signalé ici, c'est voulu ;
//   4. veille Beebs (dossier « annonces qui disparaissent », dette D4) :
//      jobs Beebs 'published' des 7 derniers jours portant le drapeau
//      platform_fields.unavailable_since — suspects n°1 de disparition
//      silencieuse pendant les premiers jours de volume réel.

const RESEND_API = "https://api.resend.com/emails";
const FROM = "FillSell <support@fillsell.app>";
const TO = "support@fillsell.app";

type Job = {
  id: string;
  platform: string;
  action: string;
  status: string;
  title: string | null;
  error: string | null;
  created_at: string;
  published_at: string | null;
  listing_url: string | null;
  platform_fields: Record<string, unknown> | null;
};

const JOB_COLUMNS =
  "id, platform, action, status, title, error, created_at, published_at, listing_url, platform_fields";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function jobRow(j: Job, extra?: string): string {
  const url = j.listing_url
    ? ` — <a href="${esc(j.listing_url)}">${esc(j.listing_url)}</a>`
    : "";
  return `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#374151;">
    <strong>[${esc(j.platform)}]</strong> ${esc(j.title ?? "(sans titre)")}
    — <code>${esc(j.action)}/${esc(j.status)}</code>, créé le ${esc(j.created_at)}${url}
    ${j.error ? `<br><span style="color:#B91C1C;">${esc(j.error)}</span>` : ""}
    ${extra ? `<br><span style="color:#92400E;">${extra}</span>` : ""}
  </li>`;
}

function section(title: string, jobs: Job[], extraFor?: (j: Job) => string): string {
  if (jobs.length === 0) return "";
  return `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      ${esc(title)} (${jobs.length})
    </h2>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${jobs.map((j) => jobRow(j, extraFor?.(j))).join("")}
    </ul>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok");
  }

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const iso24h = new Date(now - 24 * 3_600_000).toISOString();
  const iso7d = new Date(now - 7 * 86_400_000).toISOString();

  // 1. Échecs des dernières 24 h.
  const { data: failed, error: e1 } = await supabase
    .from("cross_post_jobs")
    .select(JOB_COLUMNS)
    .eq("status", "failed")
    .gte("created_at", iso24h)
    .order("created_at", { ascending: false });

  // 2. Bloqués en 'processing' > 15 min (filtre processing_since côté JS :
  // le champ vit dans le JSON platform_fields).
  const { data: processing, error: e2 } = await supabase
    .from("cross_post_jobs")
    .select(JOB_COLUMNS)
    .eq("status", "processing");
  const stuck = ((processing ?? []) as Job[]).filter((j) => {
    const since = Date.parse(
      (j.platform_fields?.processing_since as string) ?? j.created_at,
    );
    return Number.isFinite(since) && now - since > 15 * 60_000;
  });

  // 3. Deletes non terminés > 24 h (risque de double vente).
  const { data: deletesOverdue, error: e3 } = await supabase
    .from("cross_post_jobs")
    .select(JOB_COLUMNS)
    .eq("action", "delete")
    .in("status", ["pending", "processing", "failed"])
    .lt("created_at", iso24h)
    .order("created_at", { ascending: true });

  // 4. Veille Beebs : publiés < 7 jours puis drapés unavailable.
  const { data: beebsRecent, error: e4 } = await supabase
    .from("cross_post_jobs")
    .select(JOB_COLUMNS)
    .eq("platform", "beebs")
    .eq("action", "publish")
    .eq("status", "published")
    .gte("published_at", iso7d);
  const beebsWatch = ((beebsRecent ?? []) as Job[]).filter(
    (j) => j.platform_fields?.unavailable_since != null,
  );

  const queryErrors = [e1, e2, e3, e4].filter(Boolean).map((e) => e!.message);
  if (queryErrors.length > 0) {
    return new Response(JSON.stringify({ error: queryErrors }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const counts = {
    failed_24h: (failed ?? []).length,
    stuck_processing: stuck.length,
    delete_overdue: (deletesOverdue ?? []).length,
    beebs_unavailable_7d: beebsWatch.length,
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return new Response(JSON.stringify({ ok: true, clean: true, counts }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F2F2EE;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
    <h1 style="margin:0 0 4px;font-size:18px;font-family:sans-serif;color:#111827;">
      ⚠️ FillSell ops-digest — ${total} anomalie${total > 1 ? "s" : ""}
    </h1>
    <p style="margin:0 0 12px;font-size:12px;font-family:sans-serif;color:#9CA3AF;">
      cross_post_jobs, relevé du ${new Date().toISOString()}
    </p>
    ${section("Jobs en échec (24 h)", (failed ?? []) as Job[])}
    ${section("Bloqués en processing > 15 min (repêchage inopérant)", stuck)}
    ${
    section(
      "🔴 Retraits (delete) non terminés > 24 h — risque de double vente",
      (deletesOverdue ?? []) as Job[],
    )
  }
    ${
    section(
      "Veille Beebs — publiés puis unavailable < 7 jours (dossier disparitions, D4)",
      beebsWatch,
      (j) =>
        `unavailable_since : ${esc(j.platform_fields?.unavailable_since)}`,
    )
  }
  </div>
</body></html>`;

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      subject: `⚠️ FillSell ops-digest — ${total} anomalie${total > 1 ? "s" : ""} (failed ${counts.failed_24h} · stuck ${counts.stuck_processing} · delete ${counts.delete_overdue} · beebs ${counts.beebs_unavailable_7d})`,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return new Response(
      JSON.stringify({ ok: false, counts, resend_error: detail }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ ok: true, sent: true, counts }), {
    headers: { "Content-Type": "application/json" },
  });
});
