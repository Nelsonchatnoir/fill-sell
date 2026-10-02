// ── avis-demande : QUAND demander un avis, décidé côté serveur (02/10/2026) ──
// Décision de Nico (lot B). La règle vit dans _shared/avis-demande.js ; cette
// fonction LIT les faits réels du compte (jobs, entrée, paiements, demandes
// passées), applique la règle, et ÉCRIT la trace dans usage_logs
// (feature 'avis_demande', metadata { evenement, plateforme, declencheur,
// serie }) pour que Nico suive ce que ça donne.
//
// Appelants : l'app (web sur ordinateur : la carte ; iOS/Android : la fenêtre
// OFFICIELLE du store, jamais une fenêtre maison) et le popup de l'extension.
// Tous portent un JWT utilisateur → verify_jwt = true (défaut), l'identité
// est relue par auth.getUser() : un compte ne lit et n'écrit que SES traces.
//
// Corps (POST JSON) :
//   { action: "ouvrir", plateforme }  → la règle ; si elle dit oui, la ligne
//        'affiche' est écrite AVANT de répondre (60 jours partent de là) et
//        la réponse porte l'URL d'avis (extension, web). Sinon rien d'écrit.
//   { action: "noter", plateforme, evenement }  → « Laisser un avis »,
//        « Plus tard » (30 jours), « C'est déjà fait » (plus jamais).
//   { action: "etat", plateforme }    → la règle, sans rien écrire.
//
// ⛔ Un fait illisible = on n'ouvre pas. La demande ne bloque JAMAIS rien : un
//    échec répond { ouvrir: false } en 200, l'appelant n'affiche rien.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { AVIS, PLATEFORMES_AVIS, EVENEMENTS, decisionAvis } from "../_shared/avis-demande.js";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];
const autorisee = (o: string) => ALLOWED_ORIGINS.includes(o) || o.startsWith("chrome-extension://");

const JOUR_MS = 24 * 3600_000;
const JOBS_LUS = 300;

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const CORS = {
    "Access-Control-Allow-Origin": autorisee(origin) ? origin : "https://fillsell.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  const json = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Token invalide ou expiré" }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const action = String(body?.action ?? "");
  const plateforme = String(body?.plateforme ?? "");
  if (!PLATEFORMES_AVIS.includes(plateforme)) return json({ error: "plateforme inconnue" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const tracer = async (evenement: string, serie: number | null) => {
    const { error } = await admin.from("usage_logs").insert({
      user_id: user.id, feature: AVIS.FEATURE,
      metadata: { evenement, plateforme, declencheur: AVIS.DECLENCHEUR, ...(serie == null ? {} : { serie }) },
    });
    return !error;
  };

  if (action === "noter") {
    const evenement = String(body?.evenement ?? "");
    if (!EVENEMENTS.includes(evenement) || evenement === "affiche") return json({ error: "evenement inconnu" }, 400);
    const ok = await tracer(evenement, null);
    console.log(`[avis-demande] ${user.id.slice(0, 8)} ${plateforme} : ${evenement}${ok ? "" : " (NON journalisé)"}`);
    return json({ ok });
  }
  if (action !== "ouvrir" && action !== "etat") return json({ error: "action inconnue" }, 400);

  // ── Les faits, tous lus avant de juger ; une lecture ratée = on n'ouvre pas.
  try {
    const maintenant = Date.now();
    const depuis24h = new Date(maintenant - JOUR_MS).toISOString();
    const [rProf, rJobs, rEvts, rLedger, rCheckout] = await Promise.all([
      admin.from("profiles").select("created_at, onboarded_at, is_premium, is_pro").eq("id", user.id).maybeSingle(),
      admin.from("cross_post_jobs")
        .select("id, action, status, created_at, published_at, handler_build, pdr:platform_fields->pas_de_rouge, rs:platform_fields->retenue_serveur, rl:platform_fields->retenue_levee, os:platform_fields->opla_sortie")
        .eq("user_id", user.id)
        .in("action", ["publish", "republish", "delete"])
        // Les imports (relevés, synchro du dressing) ne sont pas des actions
        // de la personne — et ils sont des milliers : écartés à la lecture.
        .or("handler_build.is.null,and(handler_build.not.ilike.*releve-annonces*,handler_build.not.ilike.*sync-dressing*)")
        .order("created_at", { ascending: false })
        .limit(JOBS_LUS),
      admin.from("usage_logs").select("created_at, metadata")
        .eq("user_id", user.id).eq("feature", AVIS.FEATURE)
        .order("created_at", { ascending: false }).limit(50),
      admin.from("coin_ledger").select("kind, created_at")
        .eq("user_id", user.id).in("kind", ["grant_upgrade", "purchase", "grant_monthly"])
        .gte("created_at", depuis24h).limit(20),
      admin.from("usage_logs").select("created_at")
        .eq("user_id", user.id).eq("feature", "checkout_open")
        .gte("created_at", depuis24h).limit(5),
    ]);
    const err = rProf.error ?? rJobs.error ?? rEvts.error ?? rLedger.error ?? rCheckout.error;
    if (err || !rProf.data) {
      console.warn(`[avis-demande] ${user.id.slice(0, 8)} : lecture impossible (${err?.message ?? "profil absent"}) — on n'ouvre pas`);
      return json({ ouvrir: false, motif: "lecture_impossible" });
    }
    const prof = rProf.data as { created_at: string; onboarded_at: string | null; is_premium: boolean | null; is_pro: boolean | null };
    const payant = prof.is_premium === true || prof.is_pro === true;
    // Paiement = montée de plan, pack acheté, renouvellement d'un abonnement
    // payé (la remise mensuelle d'un compte gratuit n'en est pas un), ou un
    // paiement ouvert dans les 24 h.
    const paiementsLes = [
      // deno-lint-ignore no-explicit-any
      ...((rLedger.data ?? []) as any[]).filter((l) => l.kind !== "grant_monthly" || payant).map((l) => l.created_at),
      // deno-lint-ignore no-explicit-any
      ...((rCheckout.data ?? []) as any[]).map((l) => l.created_at),
    ];
    // deno-lint-ignore no-explicit-any
    const jobs = ((rJobs.data ?? []) as any[]).map((j) => ({
      id: j.id, action: j.action, status: j.status, created_at: j.created_at, published_at: j.published_at,
      handler_build: j.handler_build,
      platform_fields: {
        ...(j.pdr != null ? { pas_de_rouge: j.pdr } : {}),
        ...(j.rs != null ? { retenue_serveur: j.rs } : {}),
        ...(j.rl != null ? { retenue_levee: j.rl } : {}),
        ...(j.os != null ? { opla_sortie: j.os } : {}),
      },
    }));
    const d = decisionAvis({
      maintenant, compteCreeLe: prof.created_at, entreeFinieLe: prof.onboarded_at,
      jobs, evenements: rEvts.data ?? [], paiementsLes,
    });
    if (action === "etat" || !d.ouvrir) return json({ ouvrir: false, motif: d.motif, serie: d.serie, ...(action === "etat" ? { ouvrirait: d.ouvrir } : {}) });

    // On ouvre : la trace d'abord — si elle ne s'écrit pas, on n'ouvre pas
    // (sinon la règle des 60 jours ne verrait pas cette demande).
    if (!(await tracer("affiche", d.serie))) {
      console.warn(`[avis-demande] ${user.id.slice(0, 8)} ${plateforme} : trace 'affiche' refusée — on n'ouvre pas`);
      return json({ ouvrir: false, motif: "trace_impossible" });
    }
    console.log(`[avis-demande] ${user.id.slice(0, 8)} ${plateforme} : demande ouverte (série ${d.serie})`);
    return json({
      ouvrir: true, serie: d.serie,
      ...(plateforme === "extension" || plateforme === "web" ? { url: AVIS.URL_AVIS_EXTENSION } : {}),
    });
  } catch (e) {
    console.warn(`[avis-demande] ${user.id.slice(0, 8)} : ${String((e as Error)?.message ?? e)} — on n'ouvre pas`);
    return json({ ouvrir: false, motif: "erreur" });
  }
});
