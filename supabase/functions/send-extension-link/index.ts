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
// ⛔ DEPUIS LE 01/10 : UNE DEMANDE PART TOUJOURS (règle de Nico). Du 25/09 au
// 01/10, « un seul lien par personne » répondait 200 « throttle » SANS RIEN
// ENVOYER à qui avait déjà reçu un lien un jour — et l'app affichait « Lien
// envoyé à … » (domagalajessica, 01/10 : dernier lien reçu le 13/08 ; 16
// comptes, 25 demandes perdues). Désormais :
//   · (06/10, Nico) AUCUN plafond : seul un double appui (moins de 60 s
//     après un lien PARTI) répond 429 « rafale » — le lien est déjà en route,
//     et l'app le dit (le « 10 min / 3 par 24 h » du 04/10 est retiré) ;
//   · la fonction ne répond JAMAIS « ok » quand rien n'est parti ;
//   · chaque envoi réel écrit sa ligne email_logs (journal APRÈS l'envoi —
//     l'index « un seul lien à vie » est supprimé, migration 20261001133000) ;
//   · catégorie 'support' : une demande de la personne n'entre pas dans le
//     plafond des 2 mails par jour envoyés de notre initiative.
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
// ── (04/10, Nico) UNE LIMITE SIMPLE : 1 LIEN TOUTES LES 10 MIN, 3 PAR 24 H ──
// Yousri Youssouf (inscrit le 03/10, sur téléphone) : 10 appuis, 4 mails
// « extension_link » en 14 minutes (00:05 → 00:19) — l'anti-rafale d'une
// minute laissait passer chaque nouvel appui. Le lien est le même à chaque
// fois : un second envoi n'apporte rien tant que le premier peut encore
// arriver (10 min), et trois par jour couvrent tous les cas réels (mail perdu,
// autre ordinateur). Au-delà : RIEN ne part, la réponse le dit (« rafale »,
// avec l'heure du dernier envoi et le temps à attendre) — jamais un « ok ».
// ── (06/10, Nico) PLUS AUCUN PLAFOND : « le lien de l'extension ne doit jamais
// être bloqué par un plafond ». Les « 3 par 24 h » et la fenêtre de 10 min
// sont retirés ; reste le double appui : une demande qui suit de moins de
// 60 s un lien PARTI est le même geste — le mail est déjà en route, la
// réponse le dit (« rafale », heure du dernier envoi).
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

  // ── DOUBLE APPUI SEULEMENT (06/10) : un lien parti il y a moins de 60 s ──
  // Garde lue-puis-écrite : suffisante contre des taps (le bouton est
  // verrouillé pendant l'envoi). Aucun compte par jour.
  const depuis24h = new Date(Date.now() - FENETRE_MS).toISOString();
  const { data: recents } = await supabaseAdmin
    .from("email_logs")
    .select("sent_at")
    .eq("user_id", authUser.id)
    .eq("email_type", TYPE_LOG)
    .gte("sent_at", depuis24h)
    .order("sent_at", { ascending: false })
    .limit(1);
  const envois = ((recents ?? []) as Array<{ sent_at: string }>)
    .map((r) => new Date(r.sent_at).getTime()).filter((t) => Number.isFinite(t));
  const maintenant = Date.now();
  let attenteMs = 0;
  let plafond: "fenetre" | null = null;
  if (envois.length && maintenant - envois[0] < FENETRE_MS) {
    attenteMs = FENETRE_MS - (maintenant - envois[0]);
    plafond = "fenetre";
  }
  if (plafond && attenteMs > 0) {
    // Rien ne part. L'app le dit tel quel : l'heure du dernier envoi, le
    // temps à attendre. (`reason` reste « rafale » : les versions de l'app
    // déjà installées savent l'afficher.)
    return json({
      ok: false,
      reason: "rafale",
      plafond,
      envoye_le: new Date(envois[0]).toISOString(),
      email: destinataire,
      retry_dans_s: Math.ceil(attenteMs / 1000),
    }, 429);
  }

  // L'envoi, la ligne email_logs et le journal des échecs vivent dans la
  // PORTE UNIQUE (_shared/desinscription.ts).
  // dedup 'journal' (01/10) : la ligne est écrite APRÈS l'envoi réel — jamais
  // de ligne pour un mail qui n'est pas parti, et jamais d'effacement de
  // l'historique sur un échec (ce que fait 'reservation', réservé aux types
  // couverts par un index d'unicité).
  // categorie 'support' : l'utilisateur vient de réclamer ce lien — un opt-out
  // marketing ne doit pas le bloquer, et le plafond marketing ne le compte pas.
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

  return json({ ok: true, email: destinataire }, 200);
});
