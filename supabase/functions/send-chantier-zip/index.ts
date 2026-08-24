import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ONE-SHOT (2026-08-24) : envoi du zip CWS 0.6.7 à Nico par mail — il est à
// l'étranger sans accès au PC. La pièce jointe est renommée .bin (Gmail
// rejette les archives contenant du JavaScript, et une extension Chrome en
// contient). À SUPPRIMER après l'envoi (comme send-merine-reply le 28/07) :
// `npx supabase functions delete send-chantier-zip`.
// Auth : header x-cron-secret (même contrat que le trigger email-tunnel).
// Déploiement : supabase functions deploy send-chantier-zip --no-verify-jwt

serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const { to, subject, body_text, filename, content_b64 } = await req.json();
  if (!to || !filename || !content_b64) {
    return new Response(JSON.stringify({ error: "champs manquants" }), { status: 400 });
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "FillSell <support@fillsell.app>",
      to: [to],
      subject: subject ?? "Zip extension",
      text: body_text ?? "",
      attachments: [{ filename, content: content_b64 }],
    }),
  });
  const body = await r.text();
  return new Response(body, { status: r.status, headers: { "Content-Type": "application/json" } });
});
