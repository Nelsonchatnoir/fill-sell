import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API = "https://api.resend.com/emails";
const FROM = "FillSell <support@fillsell.app>";
const LOGO_URL = "https://fillsell.app/logo.png";

// ── HTML Templates ─────────────────────────────────────────────────────────────

function emailHeader(): string {
  return `
  <div style="text-align:center;padding:32px 0 24px;">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="vertical-align:middle;padding-right:10px;">
          <img src="${LOGO_URL}" width="40" height="40" alt="FillSell"
               style="display:block;border-radius:10px;">
        </td>
        <td style="vertical-align:middle;">
          <span class="brand-name"
                style="font-family:'Plus Jakarta Sans',sans-serif;font-style:italic;
                  font-weight:800;font-size:22px;color:#3EACA0;
                  background:linear-gradient(135deg,#3EACA0 0%,#E8956D 100%);
                  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
                  background-clip:text;">FillSell</span>
        </td>
      </tr>
    </table>
  </div>`;
}

function emailWrapper(content: string, lang: string): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@1,800&display=swap');
body{margin:0;padding:0;background:#F2F2EE;}
.brand-name{
  background:linear-gradient(135deg,#3EACA0 0%,#E8956D 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
a.cta:hover{background:#26b8a6!important;}
</style>
</head>
<body>
<div style="background:#F2F2EE;padding:16px 0 48px;">
  <div style="max-width:560px;margin:0 auto;padding:0 16px;">
    ${emailHeader()}
    <div style="background:#fff;border-radius:16px;padding:32px;
      box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      ${content}
    </div>
    <div style="text-align:center;padding:24px 0 0;
      font-size:12px;color:#9CA3AF;font-family:sans-serif;line-height:1.6;">
      FillSell ·
      <a href="https://fillsell.app" style="color:#9CA3AF;text-decoration:none;">
        fillsell.app
      </a>
    </div>
  </div>
</div>
</body>
</html>`;
}

function ctaButton(label: string): string {
  return `
  <a href="https://fillsell.app" class="cta"
     style="display:block;text-align:center;background:#2DD4BF;
       color:#fff;font-weight:800;font-size:15px;padding:14px 24px;
       border-radius:12px;text-decoration:none;font-family:sans-serif;
       margin-top:4px;">
    ${label}
  </a>`;
}

function welcomeHtml(lang: string): string {
  const isFr = lang !== "en";
  const content = isFr ? `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      Bienvenue sur FillSell&nbsp;! 🎉
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      Votre compte est prêt. FillSell vous aide à gérer votre stock, analyser vos
      marges et publier sur Vinted, eBay et Depop — le tout en quelques secondes.
    </p>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-weight:700;font-size:14px;color:#065F46;
        font-family:sans-serif;">Pour démarrer :</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        <li>🎙️ Ajoutez vos articles par commande vocale</li>
        <li>📸 Analysez les prix avec la photo IA (Lens)</li>
        <li>📊 Suivez vos marges en temps réel</li>
        <li>🚀 Publiez directement sur vos plateformes</li>
      </ul>
    </div>
    ${ctaButton("Ouvrir FillSell")}` : `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      Welcome to FillSell! 🎉
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      Your account is ready. FillSell helps you manage inventory, analyze margins
      and list on Vinted, eBay and Depop — all in seconds.
    </p>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-weight:700;font-size:14px;color:#065F46;
        font-family:sans-serif;">Get started:</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        <li>🎙️ Add items by voice command</li>
        <li>📸 Analyze prices with AI photo (Lens)</li>
        <li>📊 Track your margins in real time</li>
        <li>🚀 List directly on your platforms</li>
      </ul>
    </div>
    ${ctaButton("Open FillSell")}`;
  return emailWrapper(content, lang);
}

function founderHtml(lang: string, premiumCount: number): string {
  const isFr = lang !== "en";
  const hasSpots = premiumCount < 50;
  const spotsLeft = Math.max(0, 50 - premiumCount);

  const badge = isFr
    ? (hasSpots
        ? `🔥 Il reste <strong>${spotsLeft} place${spotsLeft > 1 ? "s" : ""}</strong> Founder`
        : `⚡ Places limitées`)
    : (hasSpots
        ? `🔥 Only <strong>${spotsLeft} Founder spot${spotsLeft > 1 ? "s" : ""}</strong> left`
        : `⚡ Limited spots available`);

  const content = isFr ? `
    <div style="background:linear-gradient(135deg,#3EACA0,#2DD4BF);border-radius:12px;
      padding:14px 20px;margin:0 0 24px;text-align:center;">
      <p style="margin:0;color:#fff;font-weight:800;font-size:15px;font-family:sans-serif;">
        ${badge}
      </p>
    </div>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      Le Founder Plan vous attend 🚀
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 20px;
      font-family:sans-serif;">
      Débloquez la saisie vocale illimitée, l'analyse photo Lens et toutes les
      fonctionnalités pro — au meilleur prix, avant la hausse.
    </p>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;
        letter-spacing:0.07em;color:#9CA3AF;font-family:sans-serif;">Founder Plan inclut</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        <li>🎙️ Voix illimitée (vs 5/jour en gratuit)</li>
        <li>📸 Analyse photo IA (Lens) sans limite</li>
        <li>📊 Stats avancées &amp; export multi-plateformes</li>
        <li>⭐ Accès Fondateur — prix bloqué à vie</li>
      </ul>
    </div>
    ${ctaButton("Je rejoins les Founders")}` : `
    <div style="background:linear-gradient(135deg,#3EACA0,#2DD4BF);border-radius:12px;
      padding:14px 20px;margin:0 0 24px;text-align:center;">
      <p style="margin:0;color:#fff;font-weight:800;font-size:15px;font-family:sans-serif;">
        ${badge}
      </p>
    </div>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      The Founder Plan is waiting for you 🚀
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 20px;
      font-family:sans-serif;">
      Unlock unlimited voice input, AI photo analysis and all pro features —
      at the best price before rates increase.
    </p>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;
        letter-spacing:0.07em;color:#9CA3AF;font-family:sans-serif;">Founder Plan includes</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        <li>🎙️ Unlimited voice (vs 5/day on free)</li>
        <li>📸 Unlimited AI photo analysis (Lens)</li>
        <li>📊 Advanced stats &amp; multi-platform export</li>
        <li>⭐ Founder access — price locked for life</li>
      </ul>
    </div>
    ${ctaButton("Join the Founders")}`;
  return emailWrapper(content, lang);
}

function voiceConversionHtml(lang: string): string {
  const isFr = lang !== "en";
  const content = isFr ? `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      Vous maîtrisez la saisie vocale 🎙️
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 20px;
      font-family:sans-serif;">
      Vous avez atteint votre limite quotidienne de 5 saisies vocales.
      Passez au Premium pour une utilisation illimitée.
    </p>
    <div style="background:#FEF3C7;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;color:#92400E;font-size:14px;font-family:sans-serif;line-height:1.6;">
        ⚡ Avec le plan Premium, la saisie vocale est <strong>illimitée</strong> —
        ajoutez autant d'articles que vous voulez, quand vous voulez.
      </p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;
        letter-spacing:0.07em;color:#9CA3AF;font-family:sans-serif;">Premium débloque</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        <li>🎙️ Voix illimitée (vs 5/jour en gratuit)</li>
        <li>📸 Analyse photo IA sans limite</li>
        <li>📊 Stats avancées &amp; export</li>
      </ul>
    </div>
    ${ctaButton("Passer au Premium")}` : `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      You're mastering voice input 🎙️
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 20px;
      font-family:sans-serif;">
      You've reached your daily limit of 5 voice inputs.
      Upgrade to Premium for unlimited use.
    </p>
    <div style="background:#FEF3C7;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;color:#92400E;font-size:14px;font-family:sans-serif;line-height:1.6;">
        ⚡ With Premium, voice input is <strong>unlimited</strong> —
        add as many items as you want, whenever you want.
      </p>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;
        letter-spacing:0.07em;color:#9CA3AF;font-family:sans-serif;">Premium unlocks</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;
        line-height:1.9;font-family:sans-serif;">
        <li>🎙️ Unlimited voice (vs 5/day on free)</li>
        <li>📸 Unlimited AI photo analysis</li>
        <li>📊 Advanced stats &amp; export</li>
      </ul>
    </div>
    ${ctaButton("Upgrade to Premium")}`;
  return emailWrapper(content, lang);
}

// ── Main handler ───────────────────────────────────────────────────────────────

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
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sent: string[] = [];
  const errors: string[] = [];

  async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({ from: FROM, to: [to], subject, html }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function logEmail(userId: string, emailType: string): Promise<void> {
    await supabase.from("email_logs").insert({ user_id: userId, email_type: emailType });
  }

  // ── Load candidates ────────────────────────────────────────────────────────
  const { data: candidates, error: candidatesErr } = await supabase.rpc(
    "email_tunnel_candidates"
  );
  if (candidatesErr || !candidates) {
    return new Response(
      JSON.stringify({ error: candidatesErr?.message ?? "Failed to fetch candidates" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Load existing logs to prevent duplicates ───────────────────────────────
  const userIds: string[] = candidates.map((c: any) => c.user_id);
  const { data: existingLogs } = userIds.length > 0
    ? await supabase
        .from("email_logs")
        .select("user_id, email_type")
        .in("user_id", userIds)
    : { data: [] as any[] };

  const sentSet = new Set<string>(
    (existingLogs ?? []).map((l: any) => `${l.user_id}:${l.email_type}`)
  );
  const alreadySent = (uid: string, type: string) => sentSet.has(`${uid}:${type}`);

  // ── Premium count for Founder spots text ──────────────────────────────────
  const { count: premiumCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("is_premium", true);
  const founderPremiumCount = premiumCount ?? 0;

  // ── Date windows (UTC) ────────────────────────────────────────────────────
  const now = new Date();
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const dayMinus1 = new Date(todayUTC.getTime() - 1 * 86_400_000);
  const dayMinus3 = new Date(todayUTC.getTime() - 3 * 86_400_000);

  function registeredOn(createdAt: string, targetDay: Date): boolean {
    const d = new Date(createdAt);
    const dayUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return dayUTC.getTime() === targetDay.getTime();
  }

  // ── Trigger 1: J+1 welcome ────────────────────────────────────────────────
  for (const user of candidates as any[]) {
    if (!registeredOn(user.created_at, dayMinus1)) continue;
    if (alreadySent(user.user_id, "welcome")) continue;
    const subject =
      user.lang === "en" ? "Welcome to FillSell 🎉" : "Bienvenue sur FillSell 🎉";
    const ok = await sendEmail(user.user_email, subject, welcomeHtml(user.lang));
    if (ok) {
      await logEmail(user.user_id, "welcome");
      sent.push(`welcome:${user.user_email}`);
    } else {
      errors.push(`welcome:${user.user_email}`);
    }
  }

  // ── Trigger 2: J+3 founder plan (non-premium) ─────────────────────────────
  for (const user of candidates as any[]) {
    if (user.is_premium) continue;
    if (!registeredOn(user.created_at, dayMinus3)) continue;
    if (alreadySent(user.user_id, "founder_plan")) continue;
    const subject =
      user.lang === "en"
        ? "Your Founder Plan is waiting 🚀"
        : "Le Founder Plan vous attend 🚀";
    const ok = await sendEmail(
      user.user_email,
      subject,
      founderHtml(user.lang, founderPremiumCount)
    );
    if (ok) {
      await logEmail(user.user_id, "founder_plan");
      sent.push(`founder_plan:${user.user_email}`);
    } else {
      errors.push(`founder_plan:${user.user_email}`);
    }
  }

  // ── Trigger 3: voice quota hit yesterday (≥5 voice_intent) ───────────────
  const { data: voiceLogs } = await supabase
    .from("usage_logs")
    .select("user_id")
    .eq("feature", "voice_intent")
    .gte("created_at", dayMinus1.toISOString())
    .lt("created_at", todayUTC.toISOString());

  if (voiceLogs) {
    const voiceCounts: Record<string, number> = {};
    for (const log of voiceLogs) {
      voiceCounts[log.user_id] = (voiceCounts[log.user_id] ?? 0) + 1;
    }

    const candidateMap: Record<string, any> = {};
    for (const c of candidates as any[]) {
      candidateMap[c.user_id] = c;
    }

    for (const [uid, count] of Object.entries(voiceCounts)) {
      if (count < 5) continue;
      const user = candidateMap[uid];
      if (!user) continue; // excluded email
      if (user.is_premium) continue;
      if (alreadySent(uid, "voice_conversion")) continue;
      const subject =
        user.lang === "en"
          ? "You've hit your voice limit — go unlimited 🎙️"
          : "Limite vocale atteinte — passez illimité 🎙️";
      const ok = await sendEmail(
        user.user_email,
        subject,
        voiceConversionHtml(user.lang)
      );
      if (ok) {
        await logEmail(uid, "voice_conversion");
        sent.push(`voice_conversion:${user.user_email}`);
      } else {
        errors.push(`voice_conversion:${user.user_email}`);
      }
    }
  }

  return new Response(JSON.stringify({ success: true, sent, errors }), {
    headers: { "Content-Type": "application/json" },
  });
});
