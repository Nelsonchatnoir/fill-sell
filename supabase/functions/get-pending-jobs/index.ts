import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Appelée par l'extension Chrome (background service worker) toutes les 30 min.
// Auth : JWT utilisateur (Bearer). Les jobs sont lus via un client scoped user
// → la policy RLS "Users manage own cross_post_jobs" garantit qu'on ne retourne
// que les jobs de l'utilisateur authentifié.
//
// Déploiement : supabase functions deploy get-pending-jobs
// verify_jwt reste à true (défaut) : la fonction reçoit toujours un JWT
// utilisateur, contrairement aux webhooks/cron listés dans CLAUDE.md.
// auth.getUser() ci-dessous n'est pas redondant : il fournit l'identité
// (user.id) et alimente le client scoped user pour la RLS.

// ⚠️ http://localhost:5173 (Vite dev) : sans lui, tout appel depuis le développement
// casse dès le PRÉFLIGHT CORS (« header has a value 'https://fillsell.app' that is not
// equal to the supplied origin »). Vécu le 2026-07-13 sur check-listing-status — le
// chemin « Oui, enregistrer la vente » était cassé depuis toujours en local. Passe
// généralisée aux 15 fonctions restantes. La PROD n'a jamais été affectée.
const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin.startsWith("chrome-extension://");
}

// Version minimale sachant lire le dressing Vinted. Miroir de SYNC_VERSION_MIN
// (src/utils/vintedSync.js) et de la garde SQL de demander_sync_dressing() —
// les trois doivent évoluer ENSEMBLE.
const SYNC_VERSION_MIN = "0.5.0";

/** a >= b sur des versions « x.y.z ». false si l'un des deux est illisible —
 *  une version absente (extension antérieure à l'envoi de `version`) n'est
 *  JAMAIS traitée comme capable. */
function versionAuMoins(a: string, b: string): boolean {
  if (!/^\d+(\.\d+)*$/.test(a ?? "") || !/^\d+(\.\d+)*$/.test(b ?? "")) return false;
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsOrigin = isAllowedOrigin(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Token invalide ou expiré" }, 401);

    // include_processing (2026-07-12) : OPT-IN, demandé UNIQUEMENT par le popup.
    // Le popup ne lisait que les jobs 'pending' : dès qu'un job passait en
    // 'processing', il disparaissait de sa liste et la ligne retombait sur
    // « Non incluse » — vécu sur Beebs, qui est traité en DERNIER et a donc le
    // plus de chances d'être déjà en cours quand le popup (re)lit la file.
    // ⚠️ Le BACKGROUND ne passe PAS ce flag et continue de ne voir que 'pending' :
    // lui renvoyer des jobs 'processing' le ferait re-traiter des jobs en cours.
    const body = await req.json().catch(() => ({}));
    const includeProcessing = body?.include_processing === true;
    const statuses = includeProcessing ? ["pending", "processing"] : ["pending"];

    // Télémétrie extension (2026-07-18) : chaque poll stampe
    // profiles.extension_last_seen_at (+ extension_build si le background
    // l'envoie — versions récentes uniquement). Sert au ciblage du mail
    // « mise à jour extension » (email-tunnel, mode extension_update) et au
    // futur bandeau de version dans l'app. Service role : ces colonnes ne
    // doivent pas dépendre de la policy UPDATE client. Best-effort : un échec
    // n'empêche JAMAIS la distribution des jobs.
    const version = typeof body?.version === "string" ? body.version.slice(0, 20) : "";
    try {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const patch: Record<string, unknown> = { extension_last_seen_at: new Date().toISOString() };
      const build = typeof body?.build === "string" ? body.build.slice(0, 120) : "";
      if (build) patch.extension_build = build;
      await admin.from("profiles").update(patch).eq("id", user.id);
      // Version du manifest (2026-08-05) : rangée en MAX, pas en dernière vue —
      // un compte à deux machines (portable 0.4.x, fixe 0.5.0) ne doit pas
      // faire osciller le bouton de sync. La logique du max vit dans la RPC,
      // qui n'écrit que si la version proposée est strictement supérieure.
      if (version) await admin.rpc("noter_version_extension", { p_user_id: user.id, p_version: version });
    } catch (_e) { /* télémétrie best-effort, jamais bloquante */ }

    // action + listing_url (2026-07-11) : les jobs de SUPPRESSION
    // (action='delete', armés par le bandeau semi-auto de l'app après une
    // vente) passent par la même file — le background route sur job.action
    // et cible l'annonce via listing_url.
    const { data: jobs, error: jobsErr } = await userClient
      .from("cross_post_jobs")
      .select("id, platform, action, status, title, description, price, photos, photo_option, platform_fields, inventaire_id, listing_url, created_at")
      .in("status", statuses)
      .order("created_at", { ascending: true });

    if (jobsErr) return json({ error: jobsErr.message }, 500);

    // Mode dégradé (Phase B) : une plateforme EN PAUSE (platform_health.paused)
    // ne se voit plus distribuer ses jobs — ils RESTENT 'pending' (rien perdu,
    // repris dès que paused repasse à false). L'app affiche le message de
    // maintenance. Lecture tolérante : en cas d'échec, on ne bloque JAMAIS la
    // distribution (le mode dégradé ne doit pas devenir un point de panne).
    let paused = new Set<string>();
    try {
      const { data: health } = await userClient
        .from("platform_health")
        .select("platform, paused")
        .eq("paused", true);
      paused = new Set((health ?? []).map((h: { platform: string }) => h.platform));
    } catch (_e) { /* mode dégradé indisponible → on distribue normalement */ }

    const out = (jobs ?? []).filter((j) => !paused.has(j.platform));
    const heldBack = (jobs?.length ?? 0) - out.length;
    console.log(
      `[get-pending-jobs] userId=${user.id} → ${out.length} job(s) distribué(s)` +
      (heldBack ? `, ${heldBack} retenu(s) (plateforme(s) en pause: ${[...paused].join(", ")})` : ""),
    );

    // ── Commande de sync du dressing mise en file depuis le mobile ──────────
    // (2026-08-05) L'utilisateur installe l'extension UNE FOIS sur son
    // ordinateur puis commande depuis son téléphone : le clic pose une ligne
    // vinted_sync_runs en 'queued', que l'extension réclame ici à son poll.
    //
    // ⚠️ LA GARDE DE VERSION EST TENUE ICI, À LA LIVRAISON, ET NULLE PART
    // AILLEURS. Une 0.4.x sait entretenir extension_last_seen_at mais ignore
    // complètement la commande de sync : si on la lui servait, elle
    // l'AVALERAIT (demande consommée, jamais exécutée). Elle n'envoie pas de
    // `version` au poll → elle n'apprend jamais que la commande existe, et
    // celle-ci attend une extension capable (ou expire à 6 h).
    // La version qui fait foi est celle de CE poll, pas la colonne stockée
    // (qui est un max historique, potentiellement d'une AUTRE machine).
    // Le TTL de 6 h est appliqué ICI en simple filtre de lecture : une demande
    // trop vieille n'est jamais servie. Le MARQUAGE en 'expired' vit dans
    // demander_sync_dressing() (au clic suivant) — c'est le seul endroit où il
    // est nécessaire, puisque c'est là qu'une demande morte bloquerait le
    // compte via l'index unique. Rien à purger depuis un poll.
    let syncCommand: { id: string } | null = null;
    if (versionAuMoins(version, SYNC_VERSION_MIN) && !includeProcessing) {
      try {
        // Marque en 'expired' les demandes trop vieilles AVANT de lire. Sans
        // cet appel, une demande jamais réclamée resterait 'queued' pour
        // toujours : l'écran afficherait une attente qui ne viendra jamais, et
        // le bouton resterait grisé. Ici, elle est nettoyée dans les 2 min qui
        // suivent l'ouverture de Chrome.
        await userClient.rpc("purger_ma_sync_queue");
        // Le .gte reste la garde qui FAIT FOI : même si le marquage ci-dessus
        // échoue, une demande périmée n'est jamais servie.
        const ttl = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: cmds } = await userClient
          .from("vinted_sync_runs")
          .select("id")
          .eq("kind", "dressing")
          .eq("status", "queued")
          .gte("queued_at", ttl)
          .order("queued_at", { ascending: true })
          .limit(1);
        if (cmds?.length) syncCommand = { id: cmds[0].id as string };
      } catch (_e) { /* la file de sync ne doit JAMAIS bloquer la distribution des jobs */ }
    }

    return json({ jobs: out, sync_command: syncCommand });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[get-pending-jobs] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
