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
    // include_needs_user (2026-08-04) : demandé UNIQUEMENT par le popup, qui
    // doit montrer en TÊTE ce qui attend un geste de l'utilisateur. ⚠️ Le
    // BACKGROUND ne l'envoie pas et ne doit jamais le faire : un job
    // 'needs_user' distribué au poll serait re-traité en boucle alors qu'il
    // attend une décision humaine.
    const includeNeedsUser = body?.include_needs_user === true;
    const statuses = ["pending"];
    if (includeProcessing) statuses.push("processing");
    if (includeNeedsUser) statuses.push("needs_user");

    // ── État du plafond quotidien d'exécution des republications ────────────
    // (2026-08-29 soir) UNE seule définition, calculée ICI et nulle part
    // ailleurs : limite = coin_config.republish_plafond_jour, faits = jobs
    // republish 'published' du jour Europe/Paris (fenêtre 26 h filtrée par
    // date Paris), retenue = faits >= limite. Sert à la retenue du claim
    // ci-dessous ET à l'affichage de l'app (mode plafond_only) — le serveur
    // fait autorité, l'app ne recalcule plus rien.
    const etatPlafondRepublish = async () => {
      let limite = 45;
      const { data: cfg } = await userClient
        .from("coin_config").select("value").eq("key", "republish_plafond_jour").maybeSingle();
      const v = Number(cfg?.value);
      if (Number.isFinite(v) && v > 0) limite = v;
      const jourParis = (ts: number) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
      const aujourdhui = jourParis(Date.now());
      const depuis = new Date(Date.now() - 26 * 3600_000).toISOString();
      const { data: faitsRows } = await userClient
        .from("cross_post_jobs")
        .select("published_at")
        .eq("action", "republish")
        .eq("status", "published")
        .gte("published_at", depuis);
      const faits = (faitsRows ?? []).filter((r: { published_at: string | null }) => {
        const t = Date.parse(r.published_at ?? "");
        return Number.isFinite(t) && jourParis(t) === aujourdhui;
      }).length;
      return { limite, faits, retenue: faits >= limite, jour: aujourdhui };
    };

    // Mode plafond_only (2026-08-29 soir) : appelé par l'APP (StockTab) pour
    // afficher le bandeau « ta file reprend demain » — la retenue serveur est
    // active depuis v18 mais l'app était muette (arrêt silencieux, exactement
    // le reproche fait au blocage /listing-restriction du matin).
    // ⚠️ COURT-CIRCUITE TOUT LE RESTE, et d'abord la TÉLÉMÉTRIE : un appel
    // venu de l'app web ne doit JAMAIS stamper extension_last_seen_at ni
    // extension_build — il ferait passer une extension éteinte pour vivante
    // (bandeau « ordinateur éteint », fenêtre de fraîcheur de la facturation,
    // ciblage des mails de mise à jour). Aucun job distribué, aucune commande
    // de sync consommée.
    if (body?.plafond_only === true) {
      try {
        return json({ plafond_republish: await etatPlafondRepublish() });
      } catch (_e) {
        // L'app masque le bandeau sur null : jamais un bandeau sur une panne.
        return json({ plafond_republish: null });
      }
    }

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

    let out = (jobs ?? []).filter((j) => !paused.has(j.platform));
    const heldBack = (jobs?.length ?? 0) - out.length;

    // ── Plafond quotidien d'EXÉCUTION des republications (2026-08-29) ────────
    // Campagne anti-bot Vinted du 21/07 (restrictions /listing-restriction sur
    // la régularité et le volume — cas nadegemarcelin78 : 96 republications le
    // 28/08, compte restreint le 29/08). Le débit et la création des jobs ne
    // changent PAS (spend_coins_and_republish intouchée : 300 sélectionnés =
    // 300 débités, 300 pending) — c'est la DISTRIBUTION qui est bornée : au-delà
    // de coin_config.republish_plafond_jour republications EXÉCUTÉES aujourd'hui
    // (published du jour Europe/Paris, toutes sources manuelles ET auto), plus
    // aucun job republish n'est servi au poll d'exécution jusqu'à minuit. Les
    // jobs restent 'pending', Pépite déjà débitée, et repartent le lendemain.
    // Actif côté serveur SANS attendre un paquet CWS ; le plafond embarqué dans
    // l'extension (même clé) reste en place — ceinture et bretelles.
    // EXEMPTION : l'étape 'deleted' n'est JAMAIS plafonnée — une annonce déjà
    // retirée de Vinted doit toujours pouvoir être recréée.
    // Périmètre : le poll d'EXÉCUTION du background uniquement (ni
    // include_processing ni include_needs_user — mêmes flags opt-in que le
    // popup, qui doit continuer de VOIR la file complète pour l'affichage).
    // Best-effort : comptage ou clé illisibles → on distribue normalement (un
    // filet ne doit pas devenir un point de panne, même règle que
    // platform_health ci-dessus).
    let heldRepublish = 0;
    let plafondRepublish: { limite: number; faits: number; retenue: boolean; jour: string } | null = null;
    if (!includeProcessing && !includeNeedsUser && out.some((j) => j.action === "republish")) {
      try {
        plafondRepublish = await etatPlafondRepublish();
        if (plafondRepublish.retenue) {
          const avant = out.length;
          out = out.filter((j) =>
            j.action !== "republish" ||
            (j.platform_fields as Record<string, unknown> | null)?.["republish_step"] === "deleted");
          heldRepublish = avant - out.length;
          if (heldRepublish) {
            console.log(`[get-pending-jobs] userId=${user.id} : plafond republish atteint (${plafondRepublish.faits}/${plafondRepublish.limite} aujourd'hui, Paris) → ${heldRepublish} republish retenu(s) en pending jusqu'à demain (étape 'deleted' exemptée)`);
          }
        }
      } catch (_e) { /* filet best-effort : jamais un point de panne */ }
    }

    console.log(
      `[get-pending-jobs] userId=${user.id} → ${out.length} job(s) distribué(s)` +
      (heldBack ? `, ${heldBack} retenu(s) (plateforme(s) en pause: ${[...paused].join(", ")})` : "") +
      (heldRepublish ? `, ${heldRepublish} republish retenu(s) (plafond quotidien)` : ""),
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

    // ── Contexte du popup (2026-08-04) ──────────────────────────────────────
    // Le popup doit répondre à « où j'en suis ? », pas seulement « qu'est-ce
    // que je publie ? ». Ces deux lectures sont servies ICI plutôt que par
    // deux requêtes REST depuis le popup : la fonction a déjà authentifié
    // l'utilisateur et tient un client scopé RLS — c'est zéro aller-retour de
    // plus. Derrière un flag : le BACKGROUND, qui poll toutes les 2 minutes,
    // ne paie rien de tout ça.
    let contexte: { sync: unknown; sessions: unknown } | null = null;
    if (body?.include_context === true) {
      contexte = { sync: null, sessions: null };
      try {
        const { data: runs } = await userClient
          .from("vinted_sync_runs")
          .select("status, items_vus, items_crees, items_maj, total_entries, queued_at, started_at, finished_at, erreur")
          .eq("kind", "dressing")
          .order("started_at", { ascending: false })
          .limit(1);
        contexte.sync = runs?.[0] ?? null;
      } catch (_e) { /* le contexte ne doit JAMAIS empêcher de publier */ }
      try {
        const { data: prof } = await userClient
          .from("profiles").select("extension_sessions").eq("id", user.id).maybeSingle();
        contexte.sessions = prof?.extension_sessions ?? null;
      } catch (_e) { /* idem */ }
    }

    // plafond_republish joint au poll d'exécution aussi (null hors calcul) :
    // le popup de l'extension pourra un jour l'afficher sans nouvel appel.
    return json({ jobs: out, sync_command: syncCommand, contexte, plafond_republish: plafondRepublish });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[get-pending-jobs] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
