import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ops-digest — digest quotidien des anomalies cross_post_jobs, envoyé à
// support@fillsell.app UNIQUEMENT s'il y a au moins une ligne (silence = sain).
// Appelée par pg_cron à 8h50 UTC (avant l'email-tunnel de 9h), header
// x-cron-secret sur le modèle d'email-tunnel. Déployer avec --no-verify-jwt.
//
// Six sections (la 6e : abonnés dont le renouvellement n'est pas constaté —
// échéance dépassée de plus de 3 jours sans événement de paiement, via la RPC
// coins_awaiting_payment qui porte la même condition que la garde SQL) :
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
//      silencieuse pendant les premiers jours de volume réel ;
//   5. croisement IAP Apple (incident raraajaws 28/07 : pack payé jamais
//      crédité) : notifications ONE_TIME_CHARGE des 48 h relues via
//      apple-notification-history, chaque transactionId doit avoir sa ligne
//      coin_ledger kind='purchase' ref='apple:<txid>'. Si la relecture est
//      indisponible, l'alerte le dit chaque jour jusqu'à réparation — la cause
//      trouvée le 28/07 était qu'aucune clé « Achat intégré » n'existait dans
//      App Store Connect (les clés d'équipe ne signent pas pour cette API).
//      Google n'a pas d'équivalent relisible : couvert par google-play-webhook
//      (crédit server-side) + filet client au lancement.

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

  // 5. Croisement IAP Apple : tout ONE_TIME_CHARGE des 48 h sans ligne
  // purchase correspondante = un client qui a payé sans être crédité. Un
  // échec de relecture ne fait JAMAIS échouer le digest : il devient une
  // alerte (visible chaque jour tant que le secret Apple n'est pas re-posé).
  const iapAlerts: string[] = [];
  try {
    const histRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/apple-notification-history`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": expectedSecret },
        body: JSON.stringify({
          startDate: new Date(now - 48 * 3_600_000).toISOString(),
          notificationType: "ONE_TIME_CHARGE",
        }),
      },
    );
    const hist = await histRes.json();
    if (!histRes.ok || hist.error) throw new Error(hist.error ?? `HTTP ${histRes.status}`);
    const txs = (hist.notifications ?? []).filter(
      (n: Record<string, unknown>) => n.transactionId != null,
    ) as Array<Record<string, unknown>>;
    if (txs.length > 0) {
      const refs = txs.map((n) => `apple:${n.transactionId}`);
      const { data: credited, error: e5 } = await supabase
        .from("coin_ledger").select("ref").eq("kind", "purchase").in("ref", refs);
      if (e5) throw new Error(e5.message);
      const have = new Set((credited ?? []).map((r: { ref: string }) => r.ref));
      for (const n of txs) {
        if (!have.has(`apple:${n.transactionId}`)) {
          iapAlerts.push(
            `Apple ${n.productId} — tx ${n.transactionId} — user ${n.appAccountToken ?? "INCONNU"} — acheté ${n.purchasedAt ?? "?"} — AUCUNE ligne purchase dans coin_ledger`,
          );
        }
      }
    }
  } catch (e) {
    iapAlerts.push(
      `Relecture Apple indisponible (${String((e as Error)?.message ?? e)}) — croisement impossible. Pistes : la clé APPLE_API_PRIVATE_KEY doit être une clé « Achat intégré » d'App Store Connect (une clé d'équipe donne un 401), et le message d'erreur ci-dessus porte le diagnostic du chargeur.`,
    );
  }

  // 6. Abonnés que le filet refuse de créditer faute d'événement de paiement
  // (cycle par utilisateur du 28/07). Soit un past_due légitime, soit un
  // webhook de renouvellement qui ne parvient plus — dans les deux cas un
  // client payant cesse de recevoir ses Pépites, ça ne doit pas se découvrir
  // par hasard. La RPC porte la même condition que la garde SQL.
  const awaitingRows: string[] = [];
  try {
    const { data: awaiting, error: e6 } = await supabase.rpc("coins_awaiting_payment");
    if (e6) throw new Error(e6.message);
    for (const a of (awaiting ?? []) as Array<Record<string, unknown>>) {
      awaitingRows.push(
        `${a.tier} ${a.canal} — ${a.email ?? a.user_id} — échéance ${String(a.next_grant_at).slice(0, 10)}, ${a.jours_retard} j de retard — aucun grant depuis`,
      );
    }
  } catch (e) {
    awaitingRows.push(
      `Contrôle des renouvellements indisponible (${String((e as Error)?.message ?? e)}) — vérifier la RPC coins_awaiting_payment.`,
    );
  }

  // 7. Plafond GLOBAL du mode identify (2026-07-28). Identify est gratuit :
  // il ouvre un chemin API sans contrepartie de revenu, et c'est la SEULE garde
  // du produit qui regarde un total plutôt qu'un utilisateur. Le seuil est
  // recopié ici depuis lens-analysis (PLAFOND_IDENTIFY_GLOBAL) — deux
  // constantes à garder alignées, une seule décision. On alerte dès 80 % : à
  // 100 %, l'identify est déjà court-circuité pour tout le monde.
  const PLAFOND_IDENTIFY_GLOBAL = 3000;
  const identifyRows: string[] = [];
  try {
    // Journée en heure de PARIS, jamais d'UTC brut (cf. CLAUDE.md).
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const nb = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const debutJour = new Date(now - ((nb("hour") * 3600 + nb("minute") * 60 + nb("second")) * 1000)).toISOString();
    const { count, error: e7 } = await supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("feature", "lens_identify")
      .gte("created_at", debutJour);
    if (e7) throw new Error(e7.message);
    const n = count ?? 0;
    if (n >= PLAFOND_IDENTIFY_GLOBAL) {
      identifyRows.push(
        `PLAFOND ATTEINT : ${n}/${PLAFOND_IDENTIFY_GLOBAL} identifies aujourd'hui — le mode identify est COURT-CIRCUITÉ pour tout le monde (les parcours continuent sans analyse, champs vides).`,
      );
    } else if (n >= Math.floor(PLAFOND_IDENTIFY_GLOBAL * 0.8)) {
      identifyRows.push(
        `${n}/${PLAFOND_IDENTIFY_GLOBAL} identifies aujourd'hui (${Math.round((n / PLAFOND_IDENTIFY_GLOBAL) * 100)} %) — au-delà du plafond, identify se coupe.`,
      );
    }
  } catch (e) {
    identifyRows.push(
      `Compteur identify indisponible (${String((e as Error)?.message ?? e)}) — plafond global non vérifiable aujourd'hui.`,
    );
  }

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
    iap_alerts: iapAlerts.length,
    awaiting_payment: awaitingRows.length,
    lens_identify: identifyRows.length,
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
    ${
    iapAlerts.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      🔴 IAP — achats store sans crédit Pépites (${iapAlerts.length})
    </h2>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${iapAlerts.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#B91C1C;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    awaitingRows.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      🔴 Abonnés non recrédités — renouvellement non constaté (${awaitingRows.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Échéance dépassée de plus de 3 jours sans événement de paiement : soit l'abonnement
      ne se renouvelle plus (past_due, résiliation), soit le webhook du store ne parvient plus.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${awaitingRows.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#B91C1C;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    identifyRows.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      🔴 Lens identify — plafond global journalier (${identifyRows.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Le mode identify est gratuit pour l'utilisateur : c'est la seule garde du produit
      qui regarde un TOTAL et non un utilisateur. ~0,010 € l'appel.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${identifyRows.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#B91C1C;">${esc(a)}</li>`).join("")}
    </ul>`
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
      subject: `⚠️ FillSell ops-digest — ${total} anomalie${total > 1 ? "s" : ""} (failed ${counts.failed_24h} · stuck ${counts.stuck_processing} · delete ${counts.delete_overdue} · beebs ${counts.beebs_unavailable_7d} · iap ${counts.iap_alerts} · abo ${counts.awaiting_payment} · identify ${counts.lens_identify})`,
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
