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

    // ── État de la RETENUE d'exécution des republications ───────────────────
    // (2026-08-29, régime refondu le 2026-09-04) UNE seule définition,
    // calculée ICI et nulle part ailleurs. Sert à la retenue du claim
    // ci-dessous ET à l'affichage de l'app (mode plafond_only) — le serveur
    // fait autorité, l'app ne recalcule plus rien.
    //
    // DEUX freins, jamais confondus, tous deux RÉVERSIBLES SEULS (on retient,
    // on n'annule jamais : les jobs restent 'pending', unité déjà débitée) :
    //
    //  1. PAUSE DE RESPIRATION — après `republish_pause_apres` republications
    //     d'affilée, la file souffle `republish_pause_duree_min` minutes.
    //     C'est le frein qui répond vraiment à la campagne anti-bot Vinted du
    //     21/07 : ce que /listing-restriction sanctionne, c'est la RAFALE,
    //     pas le total d'une journée.
    //  2. PLAFOND JOURNALIER PAR PALIER — filet de sécurité, jour calendaire
    //     Europe/Paris. L'ancien 45 unique rendait les quotas vendus
    //     inatteignables (45 × 30 = 1350 < quota_republication_premium 1500,
    //     et très loin des 5000 du Pro) : le filet ne doit jamais démentir
    //     l'offre.
    //
    // ⚠️ PÉRIODE DU PLAFOND = JOUR CALENDAIRE EUROPE/PARIS, pas 24 h
    // glissantes : un compte qui bute à 04:18 repart à 00:00. La pause, elle,
    // est un délai GLISSANT depuis la dernière republication réussie.
    // ⚠️ Ni l'un ni l'autre ne connaît les catégories
    // (republish_livres_exemption est un tout autre interrupteur, celui du
    // gel Livres — les livres republiés comptent comme le reste).
    // ⚠️ AUCUNE valeur de réglage en dur : tout vient de coin_config. Une clé
    // de palier absente retombe sur `republish_plafond_jour` (le réglage
    // historique) ; les clés de pause absentes = PAS DE PAUSE. Une clé
    // manquante ne doit JAMAIS créer une retenue que Nico n'a pas posée.
    const etatPlafondRepublish = async () => {
      // Une seule lecture pour tous les réglages.
      const cfg = new Map<string, number>();
      const { data: cfgRows } = await userClient
        .from("coin_config").select("key, value").in("key", [
          "republish_plafond_jour",
          "republish_plafond_jour_premium",
          "republish_plafond_jour_pro",
          "republish_plafond_jour_business",
          "republish_pause_apres",
          "republish_pause_duree_min",
        ]);
      for (const r of (cfgRows ?? []) as { key: string; value: unknown }[]) {
        const v = Number(r.value);
        if (Number.isFinite(v)) cfg.set(r.key, v);
      }
      // Un réglage ne vaut que s'il est strictement positif : 0 ou négatif =
      // clé mal posée, on retombe sur le repli, jamais sur « bloque tout »
      // (le piège de check_inventory_limit, où 0 verrouille au lieu d'ouvrir).
      const positif = (k: string): number | null => {
        const v = cfg.get(k);
        return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
      };
      // Repli historique = la clé unique d'avant le 04/09. 45 en tout dernier
      // recours (coin_config illisible), valeur inchangée depuis le 29/08.
      const limiteHistorique = positif("republish_plafond_jour") ?? 45;

      // ── PALIER ────────────────────────────────────────────────────────────
      // Lu ICI, une fois par requête (jamais par job) et seulement sur les
      // polls qui portent des republications : le coût est un aller-retour,
      // pas N. Via le client SCOPED USER — la policy « select own profile »
      // (auth.uid() = id) garantit qu'on ne lit que sa propre ligne, aucune
      // service role n'est nécessaire ici.
      // Flags CUMULATIFS : on prend le plus haut. is_comped = premium offert
      // (CLAUDE.md). is_founder n'est PAS un signal de palier (marqueur de
      // prix legacy — bug « premium fantôme » du 25/07).
      // Palier illisible → null → repli sur la clé historique : on ne retire
      // jamais le filet sur une lecture ratée.
      let palier: "free" | "premium" | "pro" | "business" | null = null;
      try {
        const { data: prof } = await userClient
          .from("profiles").select("is_business, is_pro, is_premium, is_comped")
          .eq("id", user.id).maybeSingle();
        if (prof) {
          const p = prof as Record<string, unknown>;
          palier = p.is_business === true ? "business"
            : p.is_pro === true ? "pro"
            : (p.is_premium === true || p.is_comped === true) ? "premium"
            : "free";
        }
      } catch (_e) { /* palier illisible → repli */ }

      // Free garde le réglage historique : son vrai gouvernail est
      // republication_avie_free (50 à VIE, limite COMMERCIALE) — on ne lui
      // invente pas de plafond quotidien, on ne lui en retire pas non plus.
      const limite = palier === "business" ? (positif("republish_plafond_jour_business") ?? limiteHistorique)
        : palier === "pro" ? (positif("republish_plafond_jour_pro") ?? limiteHistorique)
        : palier === "premium" ? (positif("republish_plafond_jour_premium") ?? limiteHistorique)
        : limiteHistorique;

      const jourParis = (ts: number) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
      // Secondes écoulées depuis minuit À PARIS. hourCycle h23 explicite :
      // hour12:false rend « 24:00:00 » à minuit sur certaines locales/ICU.
      const secondesParis = (ts: number) => {
        const [h, m, s] = new Date(ts).toLocaleTimeString("en-GB", {
          timeZone: "Europe/Paris", hourCycle: "h23",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        }).split(":").map(Number);
        return h * 3600 + m * 60 + s;
      };
      const aujourdhui = jourParis(Date.now());
      // Fenêtre élargie de 26 h à 96 h (04/09) : les mêmes lignes servent
      // MAINTENANT à deux choses — le décompte du jour (filtré par date Paris,
      // inchangé) et la longueur de la séquence en cours, qui peut remonter
      // au-delà d'hier. UNE seule requête, ordonnée, plafonnée sous la coupure
      // silencieuse de PostgREST à 1000 (au pire 170/jour × 4 = 680).
      // Si une séquence débordait la fenêtre, elle serait SOUS-comptée : la
      // pause ne se déclencherait pas. Sens du repli voulu — on ne retient
      // jamais sur une lecture tronquée.
      const depuis = new Date(Date.now() - 96 * 3600_000).toISOString();
      const { data: faitsRows } = await userClient
        .from("cross_post_jobs")
        .select("published_at")
        .eq("action", "republish")
        .eq("status", "published")
        .gte("published_at", depuis)
        .order("published_at", { ascending: false })
        .limit(1000);
      // Du plus RÉCENT au plus ancien : l'ordre dont la séquence a besoin.
      // Re-trié ici et pas seulement côté PostgREST — la marche arrière du
      // calcul ne doit dépendre d'aucun ordre supposé.
      const horodatages = (faitsRows ?? [])
        .map((r: { published_at: string | null }) => Date.parse(r.published_at ?? ""))
        .filter((t: number) => Number.isFinite(t))
        .sort((a: number, b: number) => b - a);
      const faits = horodatages.filter((t) => jourParis(t) === aujourdhui).length;

      // ── SÉQUENCE ET PAUSE DE RESPIRATION ─────────────────────────────────
      // « 50 d'affilée » ne s'appuie sur AUCUN état stocké : la séquence est
      // le train de republications réussies dont chaque intervalle est plus
      // court que la pause elle-même. La durée de pause EST la définition du
      // repos — un trou >= à cette durée clôt la séquence.
      // Conséquence voulue (garde-fou Nico) : un PC éteint 3 h casse la
      // séquence et remet le compteur à zéro. La pause ne s'ajoute JAMAIS à
      // une absence déjà subie — le repos a eu lieu, il compte.
      // Et quand la pause s'applique, plus rien ne se publie : `dernier` est
      // figé, la retenue se lève exactement à dernier + durée, et la
      // republication suivante rouvre une séquence neuve (son écart au
      // dernier est >= à la durée). Aucun état à écrire, aucune dérive.
      const pauseApres = positif("republish_pause_apres");
      const pauseDureeMs = (positif("republish_pause_duree_min") ?? 0) * 60_000;
      let sequence = 0;
      let finPause: number | null = null;
      if (pauseApres !== null && pauseDureeMs > 0 && horodatages.length > 0) {
        sequence = 1;
        for (let i = 1; i < horodatages.length; i++) {
          if (horodatages[i - 1] - horodatages[i] >= pauseDureeMs) break;
          sequence++;
        }
        if (sequence >= pauseApres && Date.now() - horodatages[0] < pauseDureeMs) {
          finPause = horodatages[0] + pauseDureeMs;
        }
      }
      // ── REPRISE (2026-09-04, AFFICHAGE SEUL) ────────────────────────────
      // L'instant EXACT où `aujourdhui` change et où `faits` repart de zéro :
      // le prochain minuit de Paris. Calculé ICI, avec la même horloge que le
      // décompte, parce que la SÉMANTIQUE DU RESET appartient à cette
      // fonction — l'app doit pouvoir écrire « reprend demain à 00h00 » sans
      // la redevenir une seconde fois (elle formate un instant, elle ne le
      // déduit pas). Ne change RIEN à la retenue : `retenue` est toujours
      // faits >= limite, et rien d'autre ne lit ce champ.
      // Jamais par un offset en dur (+1 h l'hiver, +2 h l'été) : on saute au
      // bout du jour de Paris, on corrige le jour de 25 h (bascule d'octobre),
      // puis on recale sur 00:00:00 (couvre le jour de 23 h de mars).
      let minuitSuivant = Date.now() + (86400 - secondesParis(Date.now())) * 1000;
      if (jourParis(minuitSuivant) === aujourdhui) minuitSuivant += 3600_000;
      minuitSuivant -= secondesParis(minuitSuivant) * 1000;

      // Le PLAFOND prime sur la PAUSE quand les deux mordent : sa reprise est
      // la plus tardive (demain minuit vs dans 2 h), et annoncer la pause
      // ferait repartir l'écran pour rien à la fin des 2 h.
      const retenuePlafond = faits >= limite;
      const retenuePause = finPause !== null;
      const motif = retenuePlafond ? "plafond" : retenuePause ? "pause" : null;
      return {
        limite, faits, palier, sequence,
        pause_apres: pauseApres, pause_duree_min: pauseDureeMs > 0 ? pauseDureeMs / 60_000 : null,
        retenue: retenuePlafond || retenuePause,
        motif,
        jour: aujourdhui,
        // Instant où la retenue se lève. Hors retenue, on garde le prochain
        // minuit : c'est ce que lit la ligne « bientôt le plafond » de l'app.
        reprise: new Date(motif === "pause" ? (finPause as number) : minuitSuivant).toISOString(),
      };
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

    // ── Commande de sync du dressing mise en file depuis le mobile ──────────
    // (2026-08-05) L'utilisateur installe l'extension UNE FOIS sur son
    // ordinateur puis commande depuis son téléphone : le clic pose une ligne
    // vinted_sync_runs en 'queued', que l'extension réclame ici à son poll.
    //
    // ⚠️ LUE ICI, AVANT LA FILE (2026-09-04) : depuis ce soir la présence
    // d'une demande de sync DÉCIDE de ce qu'on distribue (cf. « LA SYNC PASSE
    // DEVANT » plus bas). Le bloc n'a pas changé d'un mot, seulement de place.
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

    // ── LA SYNC PASSE DEVANT LA FILE (2026-09-04, cas ornellaracano) ────────
    // Constaté en réel : 189 republications en file, une demande de sync
    // derrière, et l'app annonçait « environ 16 h ». Quatre clics en deux
    // minutes (usage_logs sync_click 19:22→19:24), rien ne partait.
    //
    // La sync alimente TOUT — inventaire, identité de boutique, pin
    // multi-boutiques, détection des ventes. La faire attendre derrière des
    // republications, c'est faire attendre la LECTURE derrière l'ÉCRITURE :
    // une republication qui part 20 min plus tard ne coûte rien, une sync qui
    // part 16 h plus tard rend l'app fausse pendant 16 h.
    //
    // Alors, sur le poll d'EXÉCUTION qui emporte une commande de sync : on ne
    // distribue AUCUN job de ce cycle. L'extension exécute la sync (elle la
    // lance après avoir rendu le verrou de flux, cf. pollAndProcessJobs) et
    // les jobs repartent au poll suivant, dans 2 min.
    // ⛔ RIEN N'EST REFUSÉ : les jobs restent 'pending', aucune tentative
    // consommée, aucune unité touchée. On décale d'un cycle, on n'annule pas.
    // ⚠️ Un job DÉJÀ EN COURS n'est jamais interrompu : le poll d'exécution ne
    // voit que les 'pending' (les 'processing' sont hors périmètre par
    // construction) — on ne coupe personne au milieu d'un formulaire.
    // ⚠️ Coût borné à UN cycle : la commande n'est plus 'queued' dès que
    // l'extension la réclame, quelle que soit l'issue (running, cancelled par
    // la cadence, expired) — jamais une file gelée 6 h en attendant une
    // demande que personne n'exécute. Et une extension qui ne sait pas
    // synchroniser ne reçoit jamais de commande (garde de version ci-dessus),
    // donc ne retient jamais rien.
    // Périmètre : le poll d'exécution SEUL, mêmes flags opt-in que les autres
    // retenues — le popup continue de voir la file complète.
    let heldSync = 0;
    if (syncCommand && !includeProcessing && !includeNeedsUser && out.length) {
      heldSync = out.length;
      out = [];
      console.log(
        `[get-pending-jobs] userId=${user.id} : demande de sync ${syncCommand.id} servie ` +
        `→ ${heldSync} job(s) retenu(s) en pending pour ce cycle (la sync passe devant)`,
      );
    }

    // ── RETENUE D'EXÉCUTION des republications (2026-08-29, refonte 04/09) ──
    // Campagne anti-bot Vinted du 21/07 (restrictions /listing-restriction sur
    // la régularité et le volume — cas nadegemarcelin78 : 96 republications le
    // 28/08, compte restreint le 29/08). Le débit et la création des jobs ne
    // changent PAS (spend_coins_and_republish intouchée : 300 sélectionnés =
    // 300 débités, 300 pending) — c'est la DISTRIBUTION qui est bornée. Deux
    // motifs possibles, calculés dans etatPlafondRepublish : la PAUSE de
    // respiration (rafale trop longue → on souffle) et le PLAFOND journalier
    // du palier (filet, jusqu'à minuit Paris). Dans les deux cas les jobs
    // restent 'pending', unité déjà débitée, et repartent tout seuls.
    // ⛔ RIEN N'EST REFUSÉ, JAMAIS : on retient, on étale, on n'annule pas et
    // on ne met pas en 'failed' (principe posé par Nico le 04/09).
    // EXEMPTION, PAUSE COMPRISE : l'étape 'deleted' n'est JAMAIS retenue — une
    // annonce déjà retirée de Vinted doit toujours pouvoir être recréée.
    // Périmètre : le poll d'EXÉCUTION du background uniquement (ni
    // include_processing ni include_needs_user — mêmes flags opt-in que le
    // popup, qui doit continuer de VOIR la file complète pour l'affichage).
    // Best-effort : comptage ou clé illisibles → on distribue normalement (un
    // filet ne doit pas devenir un point de panne, même règle que
    // platform_health ci-dessus).
    let heldRepublish = 0;
    let plafondRepublish: Awaited<ReturnType<typeof etatPlafondRepublish>> | null = null;
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
            const p = plafondRepublish;
            console.log(
              `[get-pending-jobs] userId=${user.id} : retenue republish (motif=${p.motif}, palier=${p.palier ?? "illisible"}, ` +
              `jour ${p.faits}/${p.limite} Paris, séquence ${p.sequence}` +
              (p.pause_apres !== null ? `/${p.pause_apres}` : "") +
              `) → ${heldRepublish} republish retenu(s) en pending jusqu'à ${p.reprise} (étape 'deleted' exemptée)`,
            );
          }
        }
      } catch (_e) { /* filet best-effort : jamais un point de panne */ }
    }

    // ── CLOISONNEMENT PAR BOUTIQUE VINTED (2026-09-04, cas ornellaracano) ───
    // Chrome bascule de @ornella-vend vers @luciatrendyshop pour synchroniser
    // la deuxième boutique, et 187 republications appartenant à la PREMIÈRE
    // partent taper la seconde. Ce n'est pas une hypothèse : le 03/09 au soir,
    // 12 republications d'articles @luciatrendyshop lancées pendant que Chrome
    // était sur @ornella-vend ont TOUTES échoué en 404.
    //
    // POURQUOI ICI ET PAS DANS L'EXTENSION. La 0.6.17 porte déjà une attente
    // nommée par boutique (attente_boutique) — mais UNIQUEMENT à l'étape
    // 'a_capturer'. Relevé ce soir sur ce compte : 70 jobs à 'a_capturer'
    // (gardés) contre 103 déjà à 'captured' (passés depuis longtemps devant la
    // seule porte, et donc en route pour supprimer une annonce sur le mauvais
    // compte). La garde extension est indispensable mais insuffisante, et elle
    // est derrière le Chrome Web Store. Celle-ci vaut pour TOUTES les étapes,
    // pour tout le parc, dès ce déploiement — 0.6.14 comprise.
    //
    // ⛔ RIEN N'EST REFUSÉ : le job n'est pas servi, il RESTE 'pending',
    // intact. Aucune tentative consommée, aucun 'failed', aucun 'needs_user',
    // aucune écriture — cette fonction ne fait que ne pas distribuer. Il
    // repart TOUT SEUL au poll suivant la reconnexion du bon compte : aucun
    // bouton, aucun geste.
    //
    // DEUX FAIL-OPEN, tous deux voulus (arbitrage Nico) :
    //  · `inventaire.vinted_account_id` NULL — 29 962 articles du parc n'ont
    //    pas d'origine estampillée (estampillage à l'observation, 03/09). On
    //    ne bloque pas 30 000 articles sur une garde qu'on ne peut pas
    //    évaluer : comportement strictement inchangé.
    //  · sonde d'identité absente, sans user_id, ou PÉRIMÉE — on ne devine
    //    pas. La sonde tourne au plus toutes les 10 min (background.js) et
    //    n'écrit `vinted_identite` que sur un 200 franc ; au-delà de 30 min
    //    elle ne prouve plus qui est connecté MAINTENANT, donc elle ne décide
    //    plus rien. Idem si la lecture échoue : un filet ne devient jamais un
    //    point de panne.
    // Périmètre : republish Vinted du poll d'exécution. Une publication crée
    // une annonce neuve (pas d'origine à trahir) et un delete vise une URL
    // précise — ni l'un ni l'autre n'entre ici.
    const BOUTIQUE_SONDE_FRAICHEUR_MS = 30 * 60 * 1000;
    let heldBoutique = 0;
    let boutiquePause:
      | { connectee: { user_id: string; login: string | null }; retenus: number; par_boutique: Record<string, number> }
      | null = null;
    if (!includeProcessing && !includeNeedsUser) {
      const candidats = out.filter((j) =>
        j.action === "republish" && j.platform === "vinted" && j.inventaire_id != null);
      if (candidats.length) {
        try {
          const { data: prof } = await userClient
            .from("profiles").select("extension_sessions").eq("id", user.id).maybeSingle();
          const sessions = (prof?.extension_sessions ?? null) as Record<string, unknown> | null;
          const ident = (sessions?.["vinted_identite"] ?? null) as { user_id?: unknown; login?: unknown } | null;
          const identId = ident?.user_id != null ? String(ident.user_id).trim() : "";
          const releve = Date.parse(String(sessions?.["checked_at"] ?? ""));
          const fraiche = Number.isFinite(releve) && Date.now() - releve <= BOUTIQUE_SONDE_FRAICHEUR_MS;
          if (identId && fraiche) {
            const ids = [...new Set(candidats.map((j) => j.inventaire_id))];
            const { data: arts } = await userClient
              .from("inventaire").select("id, vinted_account_id").in("id", ids);
            // Origine par article. Absente de la table (article supprimé
            // entre-temps) = inconnue = fail-open, comme un NULL.
            const origine = new Map<string, string>();
            for (const a of (arts ?? []) as { id: unknown; vinted_account_id: unknown }[]) {
              const o = a.vinted_account_id != null ? String(a.vinted_account_id).trim() : "";
              if (o) origine.set(String(a.id), o);
            }
            const parBoutique: Record<string, number> = {};
            const avant = out.length;
            out = out.filter((j) => {
              if (j.action !== "republish" || j.platform !== "vinted" || j.inventaire_id == null) return true;
              const o = origine.get(String(j.inventaire_id));
              if (!o || o === identId) return true; // inconnue ou bonne boutique
              parBoutique[o] = (parBoutique[o] ?? 0) + 1;
              return false;
            });
            heldBoutique = avant - out.length;
            if (heldBoutique) {
              boutiquePause = {
                connectee: { user_id: identId, login: ident?.login != null ? String(ident.login) : null },
                retenus: heldBoutique,
                par_boutique: parBoutique,
              };
              console.log(
                `[get-pending-jobs] userId=${user.id} : Chrome connecté au dressing ` +
                `${identId}${ident?.login ? ` (@${ident.login})` : ""} — ${heldBoutique} republication(s) ` +
                `d'une AUTRE boutique (${Object.entries(parBoutique).map(([k, n]) => `${k}: ${n}`).join(", ")}) ` +
                `retenue(s) en pending, aucune tentative consommée`,
              );
            }
          }
        } catch (_e) { /* cloisonnement best-effort : jamais un point de panne */ }
      }
    }

    // ── ARTICLE PAR ARTICLE (03/09 soir, lot de 245 republications) ─────────
    // Constaté en réel : la machine à étapes du background traite UN pas par
    // job et par cycle de poll (capture → pending 'captured' → « le poll
    // suivant supprimera », background.js) — voulu pour l'espacement et la
    // fraîcheur de capture. Mais la boucle du poll traite TOUTE la file reçue
    // dans un même cycle : sur un lot de 245, les 245 captures s'enchaînent
    // AVANT le premier retrait (~3 captures/min ⇒ 80 min sans une seule
    // annonce republiée à l'écran). Défaut ÉMERGENT, pas un pré-vol assumé.
    // Correction SERVEUR (aucun paquet CWS, effet immédiat sur tout le parc) :
    // au poll d'exécution, la file republish non-'deleted' est servie au
    // compte-gouttes — AU PLUS 1 job 'captured' (le prochain retrait) et
    // AU PLUS 1 'a_capturer' (le prochain relevé). L'étape 'deleted' passe
    // TOUJOURS en entier (annonce hors ligne = recréation urgente, même
    // exemption que le plafond). Résultat : capture → retrait → recréation
    // s'enchaînent article par article au rythme des polls (2 min), la
    // première annonce remonte en quelques minutes.
    // Candidats : les plus anciens SANS attente programmée (next_action_after
    // futur : attente de boutique, espacement) — une attente en tête de file
    // ne doit jamais bloquer les autres. Jobs retenus : ils RESTENT pending,
    // rien n'est perdu ni annulé. Popup non concerné (mêmes flags opt-in que
    // le plafond : il continue de voir la file complète).
    let heldPipeline = 0;
    if (!includeProcessing && !includeNeedsUser) {
      const pfOf = (j: { platform_fields: unknown }) =>
        (j.platform_fields as Record<string, unknown> | null) ?? {};
      // Étape normalisée : miroir de repubStepDe (background.js) — absente ou
      // inconnue = a_capturer, le défaut qui ne touche à rien.
      const stepOf = (j: { platform_fields: unknown }) => {
        const s = String(pfOf(j)["republish_step"] ?? "");
        return s === "captured" || s === "deleted" ? s : "a_capturer";
      };
      const enAttenteProgrammee = (j: { platform_fields: unknown }) => {
        const t = Date.parse(String(pfOf(j)["next_action_after"] ?? ""));
        return Number.isFinite(t) && t > Date.now();
      };
      const filePipeline = out.filter((j) => j.action === "republish" && stepOf(j) !== "deleted");
      if (filePipeline.length > 1) {
        const garder = new Set<string>();
        for (const etape of ["captured", "a_capturer"]) {
          const cand = filePipeline.find((j) => stepOf(j) === etape && !enAttenteProgrammee(j));
          if (cand) garder.add(String(cand.id));
        }
        const avant = out.length;
        out = out.filter((j) =>
          j.action !== "republish" || stepOf(j) === "deleted" || garder.has(String(j.id)));
        heldPipeline = avant - out.length;
      }
    }

    console.log(
      `[get-pending-jobs] userId=${user.id} → ${out.length} job(s) distribué(s)` +
      (heldBack ? `, ${heldBack} retenu(s) (plateforme(s) en pause: ${[...paused].join(", ")})` : "") +
      (heldSync ? `, ${heldSync} retenu(s) (la sync passe devant)` : "") +
      (heldRepublish ? `, ${heldRepublish} republish retenu(s) (${plafondRepublish?.motif ?? "retenue"})` : "") +
      (heldBoutique ? `, ${heldBoutique} republish retenu(s) (boutique Vinted non connectée)` : "") +
      (heldPipeline ? `, ${heldPipeline} republish retenu(s) (article par article — capture/retrait au compte-gouttes)` : ""),
    );

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
    // sync_prioritaire (2026-09-04) : dit à l'extension que ce cycle est VIDE
    // PAR DÉCISION, pas parce qu'il n'y a rien à faire. C'est ce que lit son
    // arbitrage de maintien en éveil — une file retenue pour laisser passer la
    // sync est du TRAVAIL, pas une file vide (sans ça, la machine s'endort
    // pendant la sync qu'on vient de lui confier). Les versions qui ne
    // connaissent pas ce champ l'ignorent : rien ne change pour elles.
    // boutique_pause : de quoi écrire « X republications en pause — elles
    // concernent ta boutique @x » sans que personne ait à le recalculer.
    return json({
      jobs: out,
      sync_command: syncCommand,
      sync_prioritaire: heldSync > 0,
      jobs_retenus_sync: heldSync,
      boutique_pause: boutiquePause,
      contexte,
      plafond_republish: plafondRepublish,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[get-pending-jobs] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
