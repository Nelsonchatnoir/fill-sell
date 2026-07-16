import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// handler-watch — surveillance QUASI TEMPS RÉEL des handlers de l'extension.
// Appelée par pg_cron toutes les 3 min (header x-cron-secret, même mécanique
// qu'ops-digest). Déployer avec --no-verify-jwt.
//
// Objectif : alerter en ≤ 3 min quand un handler CASSE, sans crier au loup sur
// les échecs LÉGITIMES (champ obligatoire vide, prix < 1, catégorie non
// résolue…) qui sont le filet qui fonctionne, pas une panne.
//
// Rappels d'architecture qui simplifient la détection :
//   - un needsUser (reauth, champ à compléter) NE devient PAS 'failed' : il
//     ré-arme le job en 'pending'. Les lignes 'failed' sont donc déjà les
//     échecs DURS — on n'a qu'à en retirer les refus légitimes connus.
//   - pas de failed_at en base : created_at fait foi (les jobs se traitent dans
//     les minutes qui suivent leur création).
//
// Signaux (voir plan validé) :
//   S1 — même signature, ≥ MULTI_USER_MIN users distincts, ≥ CROSS_MIN échecs,
//        fenêtre WINDOW_MIN. Le plus fiable (un sélecteur cassé frappe tout le
//        monde d'un coup), robuste à tout volume.
//   S2 — signature typée « rupture » (introuvable/timeout/soumission), ≥ 2
//        échecs. Utile à bas volume (mono-user).
//   S3 — anti-bot / restriction (captcha, « temporairement restreint »).
//        Ne relève PAS d'un fix : à router vers la mise en pause (Phase B).
//
// Anti-spam : monitor_state garde last_alerted_at par (plateforme, signature) ;
// on ne ré-alerte pas avant COOLDOWN_MIN.

const RESEND_API = "https://api.resend.com/emails";
const FROM = "FillSell <support@fillsell.app>";
const TO = "support@fillsell.app";

const WINDOW_MIN = 30;      // fenêtre glissante d'analyse
const COOLDOWN_MIN = 60;    // pas de ré-alerte d'une même signature avant 60 min
const CROSS_MIN = 3;        // S1 : nb d'échecs minimum
const MULTI_USER_MIN = 2;   // S1 : nb de users distincts minimum
const BROKEN_MIN = 2;       // S2 : nb d'échecs minimum pour une signature « rupture »

// Refus LÉGITIMES (le filet qui marche) — jamais une alerte handler.
const LEGIT_MARKERS = [
  "aspect(s) obligatoire", "aspect obligatoire", "champ requis", "champ obligatoire",
  "prix doit être", "prix doit etre", "supérieur ou égal", "superieur ou egal",
  "catégorie vinted non résolue", "categorie vinted non resolue",
  "sélectionne une valeur pour continuer", "selectionne une valeur pour continuer",
  "sélectionne le modèle", "selectionne le modele",
  "genre", "reconnexion", "reconnecte", "connexion requise", "adresse",
  "insufficient", "402",
];

// Signatures « RUPTURE » (S2) — panne probable du handler.
const BROKEN_MARKERS = [
  "introuvable", "non trouvé", "non trouve", "selector", "sélecteur", "selecteur",
  "timeout", "délai", "delai dépassé", "delai depasse", "resté sur", "reste sur",
  "http 4", "http 5", "undefined", "null is not", "cannot read",
  "soumission", "jamais soumis", "verify", "vérification de soumission",
];

// Signatures ANTI-BOT (S3).
const ANTIBOT_MARKERS = [
  "temporairement restreint", "captcha", "datadome", "robot", "bot-shield",
  "trop de tentatives", "rate limit", "429", "accès refusé", "acces refuse",
];

type Job = {
  id: string;
  user_id: string;
  platform: string;
  action: string;
  status: string;
  error: string | null;
  handler_build: string | null;
  created_at: string;
};

const hasMarker = (s: string, markers: string[]) =>
  markers.some((m) => s.includes(m));

// Normalise un message d'erreur en signature stable : minuscule, on coupe la
// « [sonde réseau : … ] » (volatile), on retire les chiffres et on tronque —
// deux échecs du même bug tombent sur la même signature.
function signatureOf(error: string): string {
  return error
    .toLowerCase()
    .split("[sonde")[0]
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function probableCause(sig: string, severity: string): string {
  if (severity === "S3" || hasMarker(sig, ANTIBOT_MARKERS))
    return "Anti-bot / rate-limit — NE PAS déployer de fix, envisager la mise en pause de la plateforme (Phase B).";
  if (sig.includes("introuvable") || sig.includes("resté sur") || sig.includes("reste sur") || sig.includes("selecteur") || sig.includes("sélecteur"))
    return "Sélecteur DOM probablement changé (nouvelle version du site) — vérifier le content-script de la plateforme.";
  if (sig.includes("timeout") || sig.includes("delai") || sig.includes("délai"))
    return "Page plus lente ou structure changée — timeout d'un attente DOM.";
  if (sig.includes("soumission") || sig.includes("verify"))
    return "Formulaire soumis mais refusé sur place — validation plateforme ou champ manquant non détecté.";
  return "Signature non catégorisée — inspecter les jobs échantillons ci-dessous.";
}

const fileFor = (platform: string) =>
  `chrome-extension/content-scripts/${platform}.js`;

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

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

  const now = Date.now();
  const windowIso = new Date(now - WINDOW_MIN * 60_000).toISOString();

  const { data: rows, error: qErr } = await supabase
    .from("cross_post_jobs")
    .select("id, user_id, platform, action, status, error, handler_build, created_at")
    .eq("status", "failed")
    .gte("created_at", windowIso);

  if (qErr) {
    return new Response(JSON.stringify({ error: qErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const jobs = (rows ?? []) as Job[];

  // Regroupement par (plateforme, signature) en excluant les refus légitimes.
  type Cluster = {
    platform: string;
    signature: string;
    jobs: Job[];
    users: Set<string>;
    broken: boolean;
    antibot: boolean;
  };
  const clusters = new Map<string, Cluster>();
  for (const j of jobs) {
    const err = (j.error ?? "").toLowerCase();
    if (!err || hasMarker(err, LEGIT_MARKERS)) continue; // filet qui marche
    const sig = signatureOf(j.error ?? "");
    if (!sig) continue;
    const key = `${j.platform}::${sig}`;
    let c = clusters.get(key);
    if (!c) {
      c = { platform: j.platform, signature: sig, jobs: [], users: new Set(), broken: hasMarker(err, BROKEN_MARKERS), antibot: hasMarker(err, ANTIBOT_MARKERS) };
      clusters.set(key, c);
    }
    c.jobs.push(j);
    c.users.add(j.user_id);
    c.broken = c.broken || hasMarker(err, BROKEN_MARKERS);
    c.antibot = c.antibot || hasMarker(err, ANTIBOT_MARKERS);
  }

  // Application des seuils S1 / S2 / S3.
  const alerts: Array<Cluster & { severity: string }> = [];
  for (const c of clusters.values()) {
    let severity: string | null = null;
    if (c.antibot) severity = "S3";
    else if (c.jobs.length >= CROSS_MIN && c.users.size >= MULTI_USER_MIN) severity = "S1";
    else if (c.broken && c.jobs.length >= BROKEN_MIN) severity = "S2";
    if (severity) alerts.push({ ...c, severity });
  }

  if (alerts.length === 0) {
    return new Response(JSON.stringify({ ok: true, clean: true, scanned: jobs.length }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Cooldown anti-spam via monitor_state.
  const cooldownIso = new Date(now - COOLDOWN_MIN * 60_000).toISOString();
  const toEmail: Array<Cluster & { severity: string }> = [];
  for (const a of alerts) {
    const { data: existing } = await supabase
      .from("monitor_state")
      .select("id, last_alerted_at")
      .eq("platform", a.platform)
      .eq("signature", a.signature)
      .maybeSingle();

    const sampleIds = a.jobs.slice(0, 3).map((j) => j.id);
    const build = a.jobs.find((j) => j.handler_build)?.handler_build ?? null;
    const sampleError = a.jobs[0]?.error ?? null;
    const stillCooling = existing?.last_alerted_at && existing.last_alerted_at > cooldownIso;

    const patch = {
      platform: a.platform,
      signature: a.signature,
      severity: a.severity,
      occurrences: a.jobs.length,
      distinct_users: a.users.size,
      sample_job_ids: sampleIds,
      sample_error: sampleError,
      handler_build: build,
      last_seen_at: new Date(now).toISOString(),
      resolved: false,
      ...(stillCooling ? {} : { last_alerted_at: new Date(now).toISOString() }),
    };
    // upsert sur (platform, signature)
    await supabase.from("monitor_state").upsert(patch, { onConflict: "platform,signature" });

    if (!stillCooling) toEmail.push(a);
  }

  if (toEmail.length === 0) {
    return new Response(JSON.stringify({ ok: true, alerts: alerts.length, sent: 0, note: "tous en cooldown" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rapport de DIAGNOSTIC (aide à la décision — aucun fix appliqué).
  const block = (a: Cluster & { severity: string }) => {
    const build = a.jobs.find((j) => j.handler_build)?.handler_build ?? "(inconnu)";
    return `
    <div style="margin:0 0 16px;padding:14px 16px;border:1px solid #FECACA;border-radius:12px;background:#FEF2F2;font-family:sans-serif;">
      <div style="font-size:14px;font-weight:700;color:#B91C1C;">
        [${esc(a.severity)}] ${esc(a.platform)} — ${esc(a.jobs.length)} échec(s), ${esc(a.users.size)} utilisateur(s), ${WINDOW_MIN} min
      </div>
      <div style="font-size:13px;color:#374151;margin-top:6px;"><strong>Cause probable :</strong> ${esc(probableCause(a.signature, a.severity))}</div>
      <div style="font-size:12px;color:#6B7280;margin-top:4px;">Fichier : <code>${esc(fileFor(a.platform))}</code> — build : <code>${esc(build)}</code></div>
      <div style="font-size:12px;color:#6B7280;margin-top:4px;">Signature : <code>${esc(a.signature)}</code></div>
      <div style="font-size:12px;color:#6B7280;margin-top:4px;">Jobs : ${a.jobs.slice(0, 3).map((j) => `<code>${esc(j.id)}</code>`).join(", ")}</div>
      <div style="font-size:12px;color:#B91C1C;margin-top:6px;">${esc(a.jobs[0]?.error ?? "")}</div>
    </div>`;
  };

  const worst = toEmail.some((a) => a.severity === "S1") ? "S1"
    : toEmail.some((a) => a.severity === "S3") ? "S3" : "S2";
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F2F2EE;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;padding:26px;">
    <h1 style="margin:0 0 4px;font-size:18px;font-family:sans-serif;color:#111827;">
      🚨 FillSell handler-watch — ${toEmail.length} incident(s) handler
    </h1>
    <p style="margin:0 0 14px;font-size:12px;font-family:sans-serif;color:#9CA3AF;">
      Fenêtre ${WINDOW_MIN} min — relevé du ${new Date(now).toISOString()}. Diagnostic = aide à la décision, aucun fix appliqué.
    </p>
    ${toEmail.map(block).join("")}
  </div>
</body></html>`;

  let sent = false;
  if (resendKey) {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject: `🚨 handler-watch [${worst}] — ${toEmail.length} incident(s) : ${toEmail.map((a) => a.platform).join(", ")}`,
        html,
      }),
    });
    sent = res.ok;
    if (!res.ok) console.error("[handler-watch] Resend:", await res.text().catch(() => ""));
  } else {
    console.error("[handler-watch] RESEND_API_KEY manquant — incident détecté mais non notifié");
  }

  return new Response(JSON.stringify({ ok: true, alerts: alerts.length, sent: sent ? toEmail.length : 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
