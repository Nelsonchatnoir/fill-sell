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
// - journalisé en email_logs sous le type 'extension_link'.
//
// ⛔ DEPUIS LE 25/09 : UN SEUL LIEN PAR PERSONNE (règle de Nico, cf. le bloc
// plus bas). Avant, un limiteur de 60 s laissait repartir le lien à chaque
// tap espacé (Amandine LC : 3 mails en 17 min). Un lien déjà parti ne repart
// plus ; l'index email_logs_extension_link_unique (migration 20260925224000)
// ferme la course de deux appels simultanés. Le type n'entre PAS dans
// email_logs_one_shot_unique : 202 doublons historiques l'en empêchent.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
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

  // ── UN SEUL LIEN PAR PERSONNE (2026-09-25, règle de Nico) ────────────────
  // Amandine LC, inscrite à 21:08 : welcome 21:08, puis ce lien à 21:17 ET à
  // 21:25 — deux taps « M'envoyer le lien » à 8 min d'écart, que le limiteur
  // de 60 s laissait passer. Trois mails en 17 minutes. Mesuré : 202 liens en
  // trop sur 931 personnes depuis le 09/08, jusqu'à 6 pour une même personne.
  // Désormais : un lien déjà parti (n'importe quand) ne repart plus. La
  // réponse reste « throttle » — l'app l'affiche déjà comme une CONFIRMATION
  // (« Lien envoyé à … »), jamais comme un échec : aucune mise à jour d'app.
  // ⛔ Garde lue-puis-écrite : elle suffit contre des taps espacés (le bouton
  //    est verrouillé pendant l'envoi) ; la course de deux appels simultanés
  //    se ferme par l'index unique (migration 20260925224000).
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
    // 200 volontaire : ce n'est pas une panne. Le lien est déjà dans la boîte
    // de la MÊME adresse — l'app affiche « envoyé à … », jamais un échec.
    return json({
      ok: false,
      reason: "throttle",
      deja_envoye: true,
      envoye_le: dernier.sent_at,
      email: destinataire,
      retry_dans_s: ecoule >= 0 && ecoule < FENETRE_MS ? Math.ceil((FENETRE_MS - ecoule) / 1000) : 0,
    }, 200);
  }

  // L'envoi, la ligne email_logs et le journal des échecs vivent dans la
  // PORTE UNIQUE (_shared/desinscription.ts). Cette fonction ne fait plus que
  // authentifier, refuser un second lien, et lire le verdict.
  //
  // dedup 'reservation' (25/09) : la ligne est posée AVANT l'envoi, et
  // l'index email_logs_extension_link_unique la rend unique — deux appels
  // simultanés ne font partir qu'un mail. Sûr même avant l'index : la garde
  // ci-dessus garantit qu'aucune ligne antérieure n'existe, donc l'effacement
  // de la réservation sur un envoi raté ne touche QUE la ligne qu'on vient de
  // poser (jamais l'historique).
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
    dedup: "reservation",
  });

  // Un autre appel a posé la ligne une fraction de seconde avant nous : le
  // lien part (ou est parti) vers la même adresse — une confirmation.
  if (!r.envoye && r.motif === "deja_envoye") {
    return json({ ok: false, reason: "throttle", deja_envoye: true, email: destinataire, retry_dans_s: 0 }, 200);
  }
  if (!r.envoye) {
    console.error("send_extension_link_echec", JSON.stringify({ motif: r.motif, http: r.status ?? 0 }));
    return json({ ok: false, reason: "send_failed" }, r.motif === "sans_cle" ? 500 : 502);
  }

  return json({ ok: true, email: destinataire }, 200);
});
