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
// Mail TRANSACTIONNEL (l'utilisateur vient de le demander, il l'attend) — la
// catégorie 'support' de la porte le porte désormais :
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
import { envoyerEmail } from "../_shared/desinscription.ts";
import { langue, mailLienExtension } from "../_shared/emails-fillsell.ts";

// http://localhost:5173 (Vite dev) obligatoire : sans lui tout appel depuis le
// développement casse au PRÉFLIGHT CORS.
const ALLOWED_ORIGINS = [
  "https://fillsell.app",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:5173",
];

const TYPE_LOG = "extension_link";
const FENETRE_MS = 60_000;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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

  // L'envoi, la ligne email_logs et le journal des échecs vivent dans la
  // PORTE UNIQUE (_shared/desinscription.ts). Cette fonction ne fait plus que
  // authentifier, limiter le débit, et lire le verdict.
  //
  // dedup 'journal' : type RÉCURRENT (renvoyer le lien est légitime), donc
  // écriture APRÈS envoi, et surtout PAS dans l'index one-shot.
  // categorie 'support' : l'utilisateur vient de réclamer ce lien — un opt-out
  // marketing ne doit pas le bloquer.
  const { sujet, html } = mailLienExtension(langue(lang));
  const r = await envoyerEmail({
    to: destinataire,
    subject: sujet,
    html,
    type: TYPE_LOG,
    userId: authUser.id,
    categorie: "support",
    dedup: "journal",
  });

  if (!r.envoye) {
    console.error("send_extension_link_echec", JSON.stringify({ motif: r.motif, http: r.status ?? 0 }));
    return json({ ok: false, reason: "send_failed" }, r.motif === "sans_cle" ? 500 : 502);
  }
  // Journal raté : le mail est PARTI, on ne répond jamais « échec » (l'app
  // relancerait un envoi). Conséquence assumée, inchangée : sans la ligne, la
  // fenêtre de 60 s ne s'applique pas au prochain appel — un limiteur, pas une
  // garantie d'unicité. La porte l'a déjà consigné dans email_log_echecs,
  // relu chaque matin par l'ops-digest de 8h50.
  if (r.journalise === false) console.error("send_extension_link_log_echec", destinataire);

  return json({ ok: true, email: destinataire }, 200);
});
