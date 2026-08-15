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
  // Auto-pause (Phase B) DERRIÈRE UN FLAG OFF PAR DÉFAUT : ne met une
  // plateforme en pause que si HANDLER_WATCH_AUTOPAUSE=1 est explicitement posé
  // côté fonction. Sans ça, handler-watch se contente d'alerter (jamais de
  // pause automatique non voulue). Ne concerne QUE S1 (cross-user) et S3
  // (anti-bot) — jamais S2, ni un refus légitime (déjà exclu en amont).
  const autoPauseOn = Deno.env.get("HANDLER_WATCH_AUTOPAUSE") === "1";

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

  // ── Annonces HORS LIGNE orphelines (2026-08-07, 3d-b validé Nico) ─────────
  // Un job republish resté à l'étape 'deleted' plus de 30 min = une annonce
  // RETIRÉE de Vinted que rien ne recrée (extension endormie, session
  // perdue — cas réel du soir : job 97757a78, ~1 h hors ligne, zéro signal).
  // Le mail doit permettre de DÉCIDER sans ouvrir Supabase : pseudo, titre,
  // durée hors ligne, fraîcheur du heartbeat. needs_user/failed inclus :
  // l'app les montre en rouge, mais rien ne garantit que l'utilisateur l'a
  // vue. Dédup PAR JOB : orphan_alerted_at posé dans platform_fields après
  // l'envoi — une alerte par job, jamais une toutes les 3 minutes.
  // Best-effort INTÉGRAL : ce bloc n'a pas le droit de casser la veille
  // handler, tout est avalé.
  let orphelinsAlertes = 0;
  try {
    const seuilIso = new Date(now - 30 * 60_000).toISOString();
    const { data: bruts } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, title, status, platform_fields")
      .eq("action", "republish")
      .in("status", ["pending", "processing", "needs_user", "failed"])
      .filter("platform_fields->>republish_step", "eq", "deleted")
      .filter("platform_fields->>orphan_alerted_at", "is", "null")
      .lt("platform_fields->>deleted_at", seuilIso);
    // deleted_at absent = pas de durée mesurable, on ne crie pas dessus.
    // deno-lint-ignore no-explicit-any
    const orphelins = ((bruts ?? []) as any[]).filter((j) => j.platform_fields?.deleted_at);
    if (orphelins.length && resendKey) {
      const userIds = [...new Set(orphelins.map((j) => j.user_id as string))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, email, extension_last_seen_at")
        .in("id", userIds);
      // deno-lint-ignore no-explicit-any
      const profParId = new Map(((profs ?? []) as any[]).map((p) => [p.id, p]));
      const minutes = (iso: string | null) => {
        const t = Date.parse(iso ?? "");
        return Number.isFinite(t) ? Math.round((now - t) / 60_000) : null;
      };
      const lignes = orphelins.map((j) => {
        const p = profParId.get(j.user_id) ?? {};
        const horsLigneMin = minutes(j.platform_fields.deleted_at);
        const hbMin = minutes(p.extension_last_seen_at ?? null);
        return `
    <div style="margin:0 0 12px;padding:12px 14px;border:1px solid #FED7AA;border-radius:12px;background:#FFF7ED;font-family:sans-serif;">
      <div style="font-size:14px;font-weight:700;color:#9A3412;">
        ${esc(p.username ?? p.email ?? j.user_id)} — « ${esc(j.title ?? "(sans titre)")} »
      </div>
      <div style="font-size:13px;color:#374151;margin-top:4px;">
        Hors ligne depuis <strong>${horsLigneMin != null ? `${horsLigneMin} min` : "durée inconnue"}</strong>
        · job <code>${esc(j.id)}</code> en <strong>${esc(j.status)}</strong>
      </div>
      <div style="font-size:12px;color:#6B7280;margin-top:4px;">
        ${esc(p.email ?? "email inconnu")} · extension vue il y a ${hbMin != null ? `${hbMin} min` : "jamais / inconnu"}
      </div>
    </div>`;
      });
      const orphHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F2F2EE;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;padding:26px;">
    <h1 style="margin:0 0 4px;font-size:18px;font-family:sans-serif;color:#9A3412;">
      ⚠️ ${orphelins.length} annonce(s) hors ligne sans recréation
    </h1>
    <p style="margin:0 0 14px;font-size:12px;font-family:sans-serif;color:#9CA3AF;">
      Étape 'deleted' depuis plus de 30 min — l'extension du compte ne recrée pas
      (endormie, session perdue…). L'annonce Vinted est retirée, la capture est en
      base : rien n'est perdu, mais personne ne le voit. Une alerte par job.
    </p>
    ${lignes.join("")}
  </div>
</body></html>`;
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: FROM, to: [TO],
          subject: `⚠️ ${orphelins.length} annonce(s) hors ligne sans recréation — republication orpheline`,
          html: orphHtml,
        }),
      });
      if (res.ok) {
        orphelinsAlertes = orphelins.length;
        // Marqueur de dédup posé APRÈS l'envoi réussi, par MERGE du
        // platform_fields relu à l'instant (jamais un écrasement aveugle —
        // l'extension peut se réveiller entre-temps et écrire ses étapes).
        for (const j of orphelins) {
          const { data: frais } = await supabase
            .from("cross_post_jobs").select("platform_fields").eq("id", j.id).maybeSingle();
          const pf = { ...(frais?.platform_fields ?? j.platform_fields), orphan_alerted_at: new Date(now).toISOString() };
          await supabase.from("cross_post_jobs").update({ platform_fields: pf }).eq("id", j.id);
        }
      } else {
        console.error("[handler-watch] alerte orphelines Resend:", await res.text().catch(() => ""));
      }
    }
  } catch (e) {
    console.error("[handler-watch] balayage orphelines:", (e as Error)?.message ?? e);
  }

  // ── Règlement des 'processing' ABANDONNÉS (2026-08-15, dossiers Zen Pulse /
  // Lucas) ──────────────────────────────────────────────────────────────────
  // recoverStaleProcessingJobs (extension) repêche les jobs bloqués et borne
  // les reprises (MAX_STALE_RECOVERIES=2 → failed)… mais il tourne DANS
  // l'extension : si elle ne revient jamais (PC rangé, Chrome désinstallé),
  // le job reste 'processing' pour toujours et la Pépite reste réservée
  // (dossier Lucas 0ca21e6b : dernier heartbeat à la seconde du passage en
  // processing, plus rien depuis 19 h).
  // Règle SERVEUR, volontairement étroite :
  //   - processing depuis ≥ 24 h (processing_since, sinon created_at) ;
  //   - ET extension muette depuis ≥ 24 h (profiles.extension_last_seen_at,
  //     heartbeat stampé par get-pending-jobs toutes les ~2 min quand elle
  //     vit). Une extension vue il y a < 24 h = « simplement hors ligne »
  //     (veille, nuit — cas Carla 284ebb84, revenue le matin et le job s'est
  //     soldé tout seul) : on ne touche à RIEN, l'extension garde la main.
  // Le passage en 'failed' déclenche les triggers de solde EXACTEMENT UNE
  // FOIS (cross_post_jobs_settle_reservation : release de la réservation
  // publish, garde reservation_settled_at ; republish_refund_on_terminal :
  // refund_coins, gardes pepite_remboursee + jamais sur un job abouti).
  // Écriture en compare-and-swap (.eq status processing) : si le statut a
  // bougé entre-temps, on n'écrase rien. Best-effort intégral.
  let processingSoldes = 0;
  try {
    const SEUIL_ABANDON_MS = 24 * 3600_000;
    const { data: bloques } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, action, created_at, platform_fields")
      .eq("status", "processing")
      .in("action", ["publish", "republish"]);
    // deno-lint-ignore no-explicit-any
    const candidats = ((bloques ?? []) as any[]).filter((j) => {
      const since = Date.parse(j.platform_fields?.processing_since ?? j.created_at ?? "");
      return Number.isFinite(since) && now - since >= SEUIL_ABANDON_MS;
    });
    if (candidats.length) {
      const userIds = [...new Set(candidats.map((j) => j.user_id as string))];
      const { data: profs } = await supabase
        .from("profiles").select("id, extension_last_seen_at").in("id", userIds);
      // deno-lint-ignore no-explicit-any
      const lastSeen = new Map(((profs ?? []) as any[]).map((p) => [p.id, Date.parse(p.extension_last_seen_at ?? "")]));
      for (const j of candidats) {
        const seen = lastSeen.get(j.user_id);
        if (Number.isFinite(seen as number) && now - (seen as number) < SEUIL_ABANDON_MS) continue;
        const pf = { ...(j.platform_fields ?? {}) };
        delete pf.processing_since;
        const msg =
          "Traitement interrompu : l'ordinateur qui portait cette publication ne s'est plus manifesté " +
          "depuis plus de 24 h — le job est abandonné et la Pépite rendue. Avant de relancer, vérifie sur " +
          "la plateforme qu'aucune annonce n'a été créée entre-temps (une interruption peut survenir juste " +
          "après le dépôt).";
        const { error: uErr } = await supabase
          .from("cross_post_jobs")
          .update({ status: "failed", error: msg, platform_fields: pf })
          .eq("id", j.id)
          .eq("status", "processing");
        if (!uErr) {
          processingSoldes++;
          console.log(`[handler-watch] job ${j.id} (${j.platform}/${j.action}) processing abandonné → failed, Pépite rendue par trigger`);
        }
      }
    }
  } catch (e) {
    console.error("[handler-watch] règlement des processing abandonnés:", (e as Error)?.message ?? e);
  }

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
    return new Response(JSON.stringify({ ok: true, clean: true, scanned: jobs.length, orphelins_alertes: orphelinsAlertes, processing_soldes: processingSoldes }), {
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

    // Auto-pause (flag OFF par défaut) : S1/S3 seulement, réversible, jamais de
    // ré-activation auto (réactivation MANUELLE — on n'écrit paused=false nulle
    // part ici). On ne repause pas une plateforme déjà en pause.
    if (autoPauseOn && (a.severity === "S1" || a.severity === "S3")) {
      await supabase.from("platform_health").upsert({
        platform: a.platform,
        paused: true,
        reason: `auto ${a.severity}: ${a.signature}`.slice(0, 200),
        severity: a.severity,
        paused_since: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      }, { onConflict: "platform" });
    }

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

  return new Response(JSON.stringify({ ok: true, alerts: alerts.length, sent: sent ? toEmail.length : 0, orphelins_alertes: orphelinsAlertes, processing_soldes: processingSoldes }), {
    headers: { "Content-Type": "application/json" },
  });
});
