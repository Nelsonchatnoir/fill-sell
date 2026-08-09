// ── Envoi du lien d'installation de l'extension, à SOI-MÊME (2026-08-09) ─────
// Écrite pour le lot 2C-1 : sur téléphone, « M'envoyer le lien pour mon
// ordinateur » doit faire partir un vrai e-mail en UN TAP. Jusqu'ici l'app
// n'avait aucun chemin serveur pour ça — elle ouvrait un `mailto:` pré-rempli
// (ExtensionPitchScreen), donc l'utilisateur devait saisir son adresse et
// appuyer sur Envoyer dans son client mail : deux gestes de plus, et rien ne
// partait s'il abandonnait en route.
//
// L'adresse N'EST JAMAIS prise dans le corps de la requête : elle est lue sur
// le JWT (auth.getUser), côté serveur. Un client compromis ne peut donc pas
// faire envoyer ce mail à un tiers — la fonction n'écrit qu'à son porteur.
//
// Mail TRANSACTIONNEL (l'utilisateur vient de le demander, il l'attend) :
// - pas d'en-tête List-Unsubscribe, pas de garde `marketing_optout` : un
//   opt-out marketing ne doit pas bloquer un lien qu'on vient de réclamer ;
// - journalisé en email_logs sous le type RÉCURRENT 'extension_link' — donc
//   SURTOUT PAS dans l'index email_logs_one_shot_unique (liste fermée des
//   one-shot à vie, règle CLAUDE.md) : renvoyer le lien est légitime.
//
// Garde-fou d'abus : un envoi par utilisateur toutes les 60 s, lu sur la
// dernière ligne email_logs. C'est un LIMITEUR DE DÉBIT, pas une dédup à vie
// (les dédups lues-puis-écrites sont proscrites ici) : dans le pire des cas
// une course fait partir deux fois un lien que l'utilisateur a demandé deux
// fois. Sans conséquence — contrairement à un doublon de mail marketing.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// http://localhost:5173 (Vite dev) obligatoire : sans lui tout appel depuis le
// développement casse au PRÉFLIGHT CORS.
const ALLOWED_ORIGINS = [
  "https://fillsell.app",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:5173",
];

const RESEND_API = "https://api.resend.com/emails";
const FROM = "FillSell <support@fillsell.app>";
const LOGO_URL = "https://fillsell.app/logo.png";
const EXTENSION_URL = "https://fillsell.app/extension";

const TYPE_LOG = "extension_link";
const FENETRE_MS = 60_000;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Gabarit identique à celui d'email-tunnel (en-tête logo, carte blanche sur
// fond sable, pied fillsell.app) : dupliqué et non partagé, comme le reste des
// fonctions de ce projet.
function emailHtml(isFr: boolean): string {
  const content = `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      ${isFr ? "Ton lien pour installer l'extension" : "Your link to install the extension"}
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 20px;
      font-family:sans-serif;">
      ${isFr
        ? "Ouvre ce mail <strong>sur ton ordinateur</strong>, dans Chrome, et clique sur le bouton. L'installation prend une minute, une seule fois."
        : "Open this email <strong>on your computer</strong>, in Chrome, and click the button. Installing takes a minute, once."}
    </p>
    <a href="${EXTENSION_URL}" class="cta"
       style="display:block;text-align:center;background:#2DD4BF;color:#fff;
         font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;
         text-decoration:none;font-family:sans-serif;margin:0 0 14px;">
      ${isFr ? "Installer l'extension FillSell" : "Install the FillSell extension"}
    </a>
    <p style="color:#9CA3AF;font-size:12.5px;line-height:1.6;margin:0 0 24px;
      font-family:sans-serif;word-break:break-all;">
      ${isFr ? "Le bouton ne marche pas ? Copie ce lien&nbsp;: " : "Button not working? Copy this link: "}
      <a href="${EXTENSION_URL}" style="color:#3EACA0;">${EXTENSION_URL}</a>
    </p>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 20px;">
      <p style="margin:0 0 8px;font-weight:800;font-size:15px;color:#111827;font-family:sans-serif;">
        ${isFr ? "Ce qui se passe ensuite" : "What happens next"}
      </p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.65;font-family:sans-serif;">
        ${isFr
          ? "Dès l'extension installée, ton dressing Vinted remonte tout seul dans FillSell — titres, prix, photos. On lit tes annonces&nbsp;: rien n'est publié, modifié ni supprimé. Tu retrouveras tes articles dans ton stock, même si tu as fermé l'application."
          : "As soon as the extension is installed, your Vinted wardrobe flows into FillSell on its own — titles, prices, photos. We read your listings: nothing is published, edited or deleted. Your items will be in your stock, even if you closed the app."}
      </p>
    </div>
    <p style="color:#111827;font-size:15px;line-height:1.5;margin:0;
      font-family:sans-serif;font-weight:700;">
      Nico<br><span style="font-weight:500;color:#6B7280;font-size:13px;">FillSell</span>
    </p>`;
  return `<!DOCTYPE html>
<html lang="${isFr ? "fr" : "en"}">
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
    </div>
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

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  const json = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), {
      status,
      headers: { "Content-Type": "application/json", ...CORS },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!jwt) return json({ ok: false, reason: "unauthorized" }, 401);
  const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
  if (authError || !authUser) return json({ ok: false, reason: "unauthorized" }, 401);

  // L'adresse du COMPTE, jamais celle du corps de requête.
  const destinataire = authUser.email ?? null;
  if (!destinataire) return json({ ok: false, reason: "no_email" }, 200);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const langDemandee = body?.lang === "en" ? "en" : body?.lang === "fr" ? "fr" : null;
  let lang = langDemandee;
  if (!lang) {
    const { data: profil } = await supabaseAdmin
      .from("profiles").select("lang").eq("id", authUser.id).maybeSingle();
    lang = profil?.lang === "en" ? "en" : "fr";
  }

  // Limiteur de débit (60 s) — lu sur la dernière ligne du type.
  const { data: dernier } = await supabaseAdmin
    .from("email_logs")
    .select("sent_at")
    .eq("user_id", authUser.id)
    .eq("email_type", TYPE_LOG)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (dernier?.sent_at) {
    const ecoule = Date.now() - new Date(dernier.sent_at as string).getTime();
    if (ecoule >= 0 && ecoule < FENETRE_MS) {
      // 200 volontaire : ce n'est pas une panne. Le mail précédent est en
      // route vers la MÊME adresse — l'app affiche « envoyé à … » et le
      // décompte, elle ne doit pas annoncer un échec.
      return json({
        ok: false,
        reason: "throttle",
        email: destinataire,
        retry_dans_s: Math.ceil((FENETRE_MS - ecoule) / 1000),
      }, 200);
    }
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("send_extension_link_sans_cle");
    return json({ ok: false, reason: "send_failed" }, 500);
  }

  const isFr = lang !== "en";
  let httpResend = 0;
  let detailResend: unknown = null;
  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: FROM,
        to: [destinataire],
        subject: isFr
          ? "Ton lien pour installer l'extension FillSell"
          : "Your link to install the FillSell extension",
        html: emailHtml(isFr),
      }),
    });
    httpResend = res.status;
    const brut = await res.text();
    try { detailResend = JSON.parse(brut); } catch { detailResend = brut; }
    if (!res.ok) {
      console.error("send_extension_link_resend_echec", JSON.stringify({ http: httpResend, detail: detailResend }));
      return json({ ok: false, reason: "send_failed" }, 502);
    }
  } catch (e) {
    console.error("send_extension_link_resend_exception", String(e));
    return json({ ok: false, reason: "send_failed" }, 502);
  }

  // Journal APRÈS l'envoi, et jamais bloquant : le mail est parti, un insert
  // raté ne doit pas faire répondre « échec » (l'app relancerait un envoi).
  // Conséquence assumée : sans la ligne, la fenêtre de 60 s ne s'applique pas
  // au prochain appel — un limiteur, pas une garantie d'unicité.
  const { error: logErr } = await supabaseAdmin
    .from("email_logs")
    .insert({ user_id: authUser.id, email_type: TYPE_LOG });
  if (logErr) {
    console.error("send_extension_link_log_echec", logErr.message);
    // Journal lu chaque matin par l'ops-digest de 8h50 — même canal que le
    // tunnel. Son propre échec ne fait que du console.error : jamais de throw,
    // le mail est déjà parti.
    const { error: journalErr } = await supabaseAdmin.from("email_log_echecs").insert({
      user_id: authUser.id,
      email_type: TYPE_LOG,
      code: (logErr as { code?: string }).code ?? null,
      erreur: logErr.message,
    });
    if (journalErr) console.error("send_extension_link_journal_echec", journalErr.message);
  }

  return json({ ok: true, email: destinataire }, 200);
});
