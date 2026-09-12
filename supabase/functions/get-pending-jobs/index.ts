import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { etatDepuisCapture } from "../_shared/vinted-etat.ts";
import { ORDRE_EXACT_D_ABORD, TAILLE_PREFIXEE_RE, normaliserTaille, tailleAServir } from "../_shared/vinted-taille-republication.ts";
import { nettoyerDescriptionLeboncoin } from "../_shared/description-leboncoin.ts";
import { tempererMajuscules } from "../_shared/titre-majuscules.ts";
// Règles du catalogue Beebs (2026-09-11) : le MÊME fichier que l'app
// (src/utils/platformCompat.js) — module JS sans import, chargé tel quel.
import { verdictBeebsInterdit, messageBeebsInterdit } from "../_shared/beebs-interdits.js";
import {
  type AspectRow,
  BEEBS_CHAMPS_DEDIES,
  categorieDuJob,
  champsArbitrablesBeebs,
  rapprocherValeursBeebs,
} from "../_shared/beebs-valeurs.ts";

// L'arbitrage de valeur par l'IA vit dans l'extension à partir de CETTE
// version (commit 5b07edc, LISTE_FERMEE_CHOISIR) et il y travaille sur la liste
// que Beebs affiche EN DIRECT — strictement mieux que notre instantané. Le
// dépannage serveur ci-dessous s'éteint donc de lui-même, poll par poll, dès
// qu'une extension au moins aussi récente réclame la file : aucune bascule à
// faire, aucun déploiement à refaire le jour de la publication au Web Store.
const BEEBS_IA_VERSION_EXTINCTION = "0.6.21";

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

    // ── ANNONCES EN ATTENTE D'UNE ACTION — LA SOURCE UNIQUE (2026-09-04) ────
    // Deux compteurs se contredisaient sur le même écran, au même instant :
    // le popup de l'extension annonçait « 6 opérations », le bandeau de
    // l'onglet Stock IA « 4 annonces ». Cause établie sur pièces, ce n'était
    // ni la fraîcheur ni un filtre de boutique :
    //   · le POPUP comptait TOUS les jobs 'needs_user' du compte, quelle que
    //     soit l'action (publish, delete, republish) et la plateforme ;
    //   · l'APP ne comptait que les 'needs_user' d'action 'republish', et
    //     seulement le DERNIER job de chaque article, et seulement à
    //     l'intérieur du « lot » de republications en cours.
    // Sur ornellaracano au moment du relevé : 2 publications bloquées (une
    // Beebs, une Vinted) que le bandeau ne montrait pas — il disait
    // « annonces » en n'en comptant qu'une sorte.
    //
    // Le CRITÈRE MÉTIER NE CHANGE PAS : une annonce en attente d'action est un
    // job 'needs_user', ici comme avant, des deux côtés. Ce qui change, c'est
    // qu'il n'y a plus qu'UN endroit qui l'applique — celui-ci — et deux
    // lecteurs. Le popup et l'app affichent désormais le même nombre parce
    // qu'ils lisent le même, pas parce qu'on a aligné deux calculs.
    // `inventaire_ids` accompagne le total : c'est ce qui permet à l'app de
    // filtrer sa liste sur EXACTEMENT les articles comptés, sans re-dériver un
    // périmètre de son côté.
    const annoncesEnAttente = async () => {
      // action='delete' EXCLUE : un retrait n'est pas une annonce à débloquer,
      // et aucun des deux lecteurs ne le comptait (le popup les écarte dès
      // fetchPendingJobs). On unifie le périmètre, on ne l'invente pas.
      const { data } = await userClient
        .from("cross_post_jobs")
        .select("id, inventaire_id")
        .eq("status", "needs_user")
        .neq("action", "delete");
      const lignes = (data ?? []) as { id: unknown; inventaire_id: unknown }[];
      // Le TOTAL compte les jobs (deux plateformes bloquées sur un même
      // article = deux annonces à débloquer) ; les ids servent au filtre de
      // liste, dédoublonnés puisqu'une carte d'article y est unique.
      const ids = [...new Set(
        lignes.map((l) => (l.inventaire_id == null ? null : String(l.inventaire_id)))
          .filter((v): v is string => v !== null),
      )];
      return { total: lignes.length, inventaire_ids: ids };
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
      // annonces_en_attente voyage AVEC le plafond : c'est le même appel de
      // 2 min que l'app fait déjà, pas un aller-retour de plus. Lecture
      // séparée et tolérante — un échec du comptage ne doit pas priver l'app
      // du bandeau de plafond, et inversement.
      let attente: { total: number; inventaire_ids: string[] } | null = null;
      try { attente = await annoncesEnAttente(); } catch (_e) { /* null = l'app garde son affichage précédent */ }
      // creneau_republish (2026-09-12) : la fenêtre du module planifié, pour
      // que les cartes des jobs auto retenus hors créneau disent « Dès 08h00 »
      // avec le MÊME instant que celui qui retient. RPC absente → null.
      let creneau: Record<string, unknown> | null = null;
      try {
        const { data: fen } = await userClient.rpc("republish_planifiee_fenetre_courante");
        const f = (fen ?? null) as Record<string, unknown> | null;
        if (f && f.actif === true) {
          creneau = {
            actif: true,
            dans_creneau: f.dans_creneau === true,
            reprise: (f.prochaine_tentative as string | null) ?? null,
            fin: (f.courant_fin as string | null) ?? null,
          };
        }
      } catch (_e) { /* null = pas de module, ou migration pas encore jouée */ }
      try {
        return json({ plafond_republish: await etatPlafondRepublish(), annonces_en_attente: attente, creneau_republish: creneau });
      } catch (_e) {
        // L'app masque le bandeau sur null : jamais un bandeau sur une panne.
        return json({ plafond_republish: null, annonces_en_attente: attente, creneau_republish: creneau });
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
    // Capacités DÉCLARÉES par le build (2026-09-10) — jamais déduites d’un
    // numéro de version : « taille_par_id » = ce client pose la taille Vinted
    // par id et par onglet sans retirer « EU » (selectTailleVinted). Un build
    // qui ne le dit pas n’est pas capable, quel que soit son numéro.
    const capacites: string[] = Array.isArray(body?.capacites)
      ? body.capacites.map((c: unknown) => String(c)).slice(0, 20) : [];
    const tailleParId = capacites.includes("taille_par_id");
    try {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const patch: Record<string, unknown> = { extension_last_seen_at: new Date().toISOString() };
      const build = typeof body?.build === "string" ? body.build.slice(0, 120) : "";
      if (build) patch.extension_build = build;
      // ── Mise à jour d'extension EN ATTENTE (2026-09-10) ───────────────────
      // Chrome télécharge la nouvelle version puis attend, pour l'installer,
      // que l'extension soit au repos. Le background nous dit ici ce que Chrome
      // garde sous le coude (chrome.runtime.onUpdateAvailable) — c'est la seule
      // façon de SAVOIR qui est bloqué et depuis quand, au lieu de le déduire
      // d'un numéro de version qui traîne.
      // `maj_en_attente` absent du corps = build trop ancien pour le dire : on
      // ne touche à rien (surtout pas effacer une mesure qu'il ne sait pas
      // produire). Chaîne vide = ce build DIT qu'il n'a rien en attente.
      const majAttente = typeof body?.maj_en_attente === "string" ? body.maj_en_attente.slice(0, 20) : null;
      if (majAttente !== null) {
        if (majAttente) {
          patch.extension_maj_en_attente = majAttente;
          // vue_at ne se recale PAS à chaque poll : il mesure l'ANCIENNETÉ du
          // blocage. Posé seulement si la colonne est vide ou si la version en
          // attente a changé (relecture ciblée, best-effort).
          try {
            const { data: avant } = await admin.from("profiles")
              .select("extension_maj_en_attente, extension_maj_vue_at").eq("id", user.id).maybeSingle();
            if (!avant?.extension_maj_vue_at || avant?.extension_maj_en_attente !== majAttente) {
              patch.extension_maj_vue_at = new Date().toISOString();
            }
          } catch { patch.extension_maj_vue_at = new Date().toISOString(); }
        } else {
          patch.extension_maj_en_attente = null;
          patch.extension_maj_vue_at = null;
        }
      }
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
    // Voie d'exécution (lot 2a eBay API, 06/09) : l'extension ne reçoit que
    // les jobs voie='extension' (= tout le parc existant, valeur par défaut).
    // Les jobs voie='api' sont pour ebay-api-worker, jamais pour Chrome.
    const lireFile = () => userClient
      .from("cross_post_jobs")
      .select("id, platform, action, status, title, description, price, photos, photo_option, platform_fields, inventaire_id, listing_url, created_at")
      .in("status", statuses)
      .eq("voie", "extension")
      .order("created_at", { ascending: true });
    // ── « DÉJÀ EN LIGNE », source Vinted (2026-09-08, décision Nico) ────────
    // inventaire.vinted_item_id (+ disparu_le, vinted_status) EMBARQUÉ sur ce
    // SELECT par la FK cross_post_jobs_inventaire_id_fkey : un lookup pkey par
    // ligne, aucune requête séparée. POPUP SEUL (include_needs_user) : le poll
    // de fond, toutes les 2 min, lit la file sans l'embed et ne paie rien.
    const lireFileAvecArticle = () => userClient
      .from("cross_post_jobs")
      .select("id, platform, action, status, title, description, price, photos, photo_option, platform_fields, inventaire_id, listing_url, created_at, inventaire:inventaire_id(vinted_item_id, disparu_le, vinted_status)")
      .in("status", statuses)
      .eq("voie", "extension")
      .order("created_at", { ascending: true });
    let jobs: Awaited<ReturnType<typeof lireFile>>["data"] = null;
    let jobsErr: Awaited<ReturnType<typeof lireFile>>["error"] = null;
    if (includeNeedsUser) {
      const r = await lireFileAvecArticle();
      if (!r.error) {
        jobs = r.data as unknown as typeof jobs;
      } else {
        // L'embed ne prive JAMAIS le popup de sa file : on relit sans lui, et
        // « Déjà en ligne » retombe sur l'état actuel des cases.
        console.warn(`[get-pending-jobs] embed inventaire refusé (${r.error.message}) — relecture sans embed`);
        ({ data: jobs, error: jobsErr } = await lireFile());
      }
    } else {
      ({ data: jobs, error: jobsErr } = await lireFile());
    }

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

    // ── SESSION PLATEFORME CONNUE MORTE = ATTENTE, JAMAIS UNE TENTATIVE ─────
    // (2026-09-10 soir, cas Ornella.) 17 jobs Beebs sont morts sur
    // beebs.app/fr/auth en brûlant leurs 5 tentatives espacées, alors que
    // `extension_sessions.beebs = false` et `http.beebs =
    // 'login_redirect_observee'` étaient EN BASE avant le premier lancement :
    // on SAVAIT que la session était morte, et on a lancé quand même.
    //
    // RÈGLE. Une plateforme dont la session est connue morte (le handler a VU la
    // page de connexion après une navigation réelle, ou la sonde a vu la
    // redirection d'auth) ne se voit plus distribuer ses jobs tant que
    // l'observation est RÉCENTE (< SESSION_MORTE_TTL_MS). Ils RESTENT 'pending',
    // intacts, aucune tentative consommée, aucune écriture.
    //
    // COMMENT ILS REPARTENT. Vinted : la sonde de session (10 min, à chaque
    // poll) réécrit `vinted` à true/null dès que la session revit — le verrou
    // tombe seul. Leboncoin, eBay, Beebs : la sonde ne tourne qu'AVANT un job
    // de la plateforme (et celle de Beebs ne sait pas dire « vivante », SPA
    // oblige) — retenir sans échéance retiendrait pour toujours. Passé le TTL,
    // UN SEUL job (le plus ancien) est servi : c'est la sonde. S'il retombe sur
    // la page de connexion, le handler ré-observe la déconnexion (horodatage
    // neuf → nouveau TTL) et update-job-status le remet en attente sans
    // consommer de tentative ; s'il passe, la session est revenue et le reste
    // suit au poll suivant. Coût maximal d'une session morte : une navigation
    // par heure, au lieu de cinq tentatives brûlées en deux heures.
    //
    // Périmètre : le poll d'EXÉCUTION seul (le popup voit la file entière),
    // toutes les actions (publier, retirer, republier : aucune ne passe sans
    // session). Best-effort : lecture illisible → on distribue normalement.
    const SESSION_MORTE_TTL_MS = 60 * 60 * 1000;
    let heldSession = 0;
    type SessionPauseDetail = Record<string, { retenus: number; observee_le: string | null; sonde: string | null }>;
    let sessionsPause: SessionPauseDetail | null = null;
    if (!includeProcessing && !includeNeedsUser && out.length) {
      try {
        const { data: profS } = await userClient
          .from("profiles").select("extension_sessions").eq("id", user.id).maybeSingle();
        const s = (profS?.extension_sessions ?? null) as Record<string, unknown> | null;
        if (s && typeof s === "object") {
          const parPf = (s["checked_at_par_plateforme"] ?? {}) as Record<string, unknown>;
          const mortes = new Map<string, { observeeLe: number; fraiche: boolean }>();
          for (const pf of ["vinted", "leboncoin", "ebay", "beebs"]) {
            if (s[pf] !== false) continue; // null = inconnu, true = vivante : jamais retenu
            const observeeLe = Date.parse(String(parPf[pf] ?? s["checked_at"] ?? ""));
            // Observation sans horodatage lisible : on ne retient pas sur une
            // date qu'on n'a pas — on laisse passer, comme avant.
            if (!Number.isFinite(observeeLe)) continue;
            mortes.set(pf, { observeeLe, fraiche: Date.now() - observeeLe < SESSION_MORTE_TTL_MS });
          }
          if (mortes.size) {
            const aRetenir = new Set<string>();
            const detail: SessionPauseDetail = {};
            for (const [pf, m] of mortes) {
              const files = out.filter((j) => j.platform === pf);
              if (!files.length) continue;
              // `out` est trié par created_at croissant : files[0] est le plus
              // ancien — c'est lui la sonde quand l'observation a vieilli.
              const sonde = m.fraiche ? null : files[0];
              for (const j of files) if (j !== sonde) aRetenir.add(String(j.id));
              detail[pf] = {
                retenus: files.length - (sonde ? 1 : 0),
                observee_le: new Date(m.observeeLe).toISOString(),
                sonde: sonde ? String(sonde.id) : null,
              };
            }
            heldSession = aRetenir.size;
            if (heldSession) {
              out = out.filter((j) => !aRetenir.has(String(j.id)));
              sessionsPause = detail;
              console.log(
                `[get-pending-jobs] userId=${user.id} : session(s) connue(s) morte(s) — ` +
                Object.entries(detail).map(([pf, d]) =>
                  `${pf}: ${d.retenus} retenu(s), observée le ${d.observee_le}${d.sonde ? `, sonde = job ${d.sonde.slice(0, 8)}` : ""}`,
                ).join(" ; ") +
                ` — jobs laissés en pending, aucune tentative consommée`,
              );
            }
          }
        }
      } catch (_e) { /* filet best-effort : jamais un point de panne */ }
    }

    // ── UNE REPUBLICATION ORPHELINE N'EST JAMAIS SERVIE (2026-09-06) ────────
    // Supprimer un article n'annulait pas ses REPUBLICATIONS (App.jsx,
    // buildDeletePlan, corrigé le même jour). La FK
    // cross_post_jobs_inventaire_id_fkey étant en ON DELETE **SET NULL**, la
    // republication survivante perdait son `inventaire_id` : plus rattachable
    // à aucune ligne de Stock, donc INVISIBLE dans l'app — mais toujours
    // distribuée ici, et toujours en train de travailler sur l'annonce d'un
    // article qui n'existe plus. Sa machine à étapes commence par SUPPRIMER
    // l'annonce de Vinted avant de la recréer : sur les 12 orphelines relevées
    // en prod (7 comptes), 4 se sont arrêtées entre les deux, sur « annonce
    // retirée de Vinted et pas pu être recréée ». Une annonce perdue, sans
    // rien à l'écran pour le dire.
    //
    // La correction côté app tarit la source ; cette garde est le FILET, et
    // elle vaut pour le parc entier, tout de suite, sans dépendre d'un
    // déploiement web ni d'un paquet d'extension.
    //
    // PÉRIMÈTRE : action='republish' SEULE. Un `inventaire_id` null sur un
    // 'publish' ou un 'delete' est normal et doit continuer de passer — le
    // delete armé par la suppression PERD justement son lien au même
    // instant (SET NULL), et c'est lui qui doit partir retirer l'annonce ;
    // l'extension n'a besoin que de platform + listing_url. Le retenir ici
    // laisserait l'annonce en ligne pour toujours : exactement le trou qu'on
    // ferme.
    //
    // ⛔ RIEN N'EST REFUSÉ, RIEN N'EST ÉCRIT : le job n'est pas servi, il
    // reste tel quel, aucune tentative consommée, aucun 'failed', aucun
    // 'needs_user'. Cette garde ne fait que ne pas distribuer.
    //
    // ⚠️ TOUS LES MODES, y compris le popup (contrairement aux retenues
    // ci-dessous, qui laissent le popup voir la file complète). Les autres
    // sont TRANSITOIRES — la boutique se reconnecte, le plafond retombe à
    // minuit, la sync passe : le job repart. Celle-ci est DÉFINITIVE :
    // l'article n'existe plus, le lien ne reviendra jamais. L'afficher, ce
    // serait promettre un travail qui n'aura pas lieu.
    const orphelinesRepublish = out.filter((j) => j.action === "republish" && j.inventaire_id == null);
    if (orphelinesRepublish.length) {
      const ids = new Set(orphelinesRepublish.map((j) => j.id));
      out = out.filter((j) => !ids.has(j.id));
      console.log(
        `[get-pending-jobs] userId=${user.id} : ${orphelinesRepublish.length} republication(s) ORPHELINE(S) ` +
        `(inventaire_id null — article supprimé) non servie(s) : ` +
        `${orphelinesRepublish.map((j) => `${String(j.id).slice(0, 8)}/${j.platform}/${j.status}`).join(", ")}. ` +
        `Aucune écriture, aucune tentative consommée.`,
      );
    }

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

    // ── COUPE-CIRCUIT : LE RETRAIT VINTED EST RETENU POUR LES CLIENTS
    // « taille_par_id » (2026-09-10 soir, mesure sur pièces) ───────────────
    // Sur les recréations jouées par la 0.6.25 (capacité « taille_par_id »)
    // entre 17:58 et 18:58 Paris : 5 refus « Le champ Couleur doit être
    // renseigné » (HTTP 400 à la recréation, annonce DÉJÀ retirée) pour 3
    // abouties, chez 3 comptes — contre 0 refus pour 131 recréations abouties
    // le même jour sur 0.6.22 → 0.6.24. Cause NON établie (régression du
    // chantier taille, ou changement Vinted survenu à la même heure : aucune
    // recréation d'un build antérieur n'a tourné après 16:51). Ce qui est
    // établi : 5 annonces sont HORS LIGNE et leurs retentatives échouent.
    // Doctrine « pause AVANT toute suppression » : tant que la cause n'est pas
    // tranchée, un client qui déclare cette capacité ne se voit plus servir
    // l'étape 'captured' (celle qui SUPPRIME). 'a_capturer' (lecture seule) et
    // 'deleted' (annonce déjà hors ligne : la recréation doit toujours pouvoir
    // se tenter) passent. Interrupteur : coin_config
    // 'republish_pause_retrait_taille_par_id' = 1 → retenue ; 0, absente ou
    // illisible → rien de retenu (jamais une retenue sur une panne de lecture).
    // ⛔ RIEN N'EST REFUSÉ, RIEN N'EST ÉCRIT : les jobs restent 'pending'.
    let heldRetrait0625 = 0;
    if (!includeProcessing && !includeNeedsUser && tailleParId &&
        out.some((j) => j.action === "republish" && j.platform === "vinted" &&
          (j.platform_fields as Record<string, unknown> | null)?.["republish_step"] === "captured")) {
      try {
        const { data: cfgRetrait } = await userClient
          .from("coin_config").select("value").eq("key", "republish_pause_retrait_taille_par_id").maybeSingle();
        if (Number((cfgRetrait as Record<string, unknown> | null)?.value) === 1) {
          const avant = out.length;
          out = out.filter((j) =>
            !(j.action === "republish" && j.platform === "vinted" &&
              (j.platform_fields as Record<string, unknown> | null)?.["republish_step"] === "captured"));
          heldRetrait0625 = avant - out.length;
          if (heldRetrait0625) {
            console.log(
              `[get-pending-jobs] userId=${user.id} : coupe-circuit retrait Vinted (client taille_par_id) — ` +
              `${heldRetrait0625} republish à l'étape 'captured' retenu(s) en pending, aucune suppression servie`,
            );
          }
        }
      } catch (_e) { /* filet best-effort : jamais un point de panne */ }
    }

    // ── CRÉNEAU DE REPUBLICATION PLANIFIÉE (2026-09-12) ─────────────────────
    // Module « Republication automatique » à créneaux (réglage
    // platform_settings.vinted.republish_planifiee, fonctions SQL de la
    // migration 20260912130200). Règle absolue : AUCUNE republication
    // AUTOMATIQUE ne part HORS du créneau choisi. Le sweep serveur ne CRÉE
    // que dans le créneau ; ici, à l'EXÉCUTION, un job auto encore en attente
    // (créé en fin de créneau, ou par l'ancien moteur avant la bascule) est
    // RETENU en pending jusqu'au prochain créneau. Étape 'deleted' EXEMPTÉE,
    // comme pour le plafond et la pause : une annonce déjà retirée doit
    // toujours pouvoir être recréée.
    // Le MANUEL n'est pas concerné (décision Nico, point 7) : seuls les jobs
    // republish_source = 'auto'. Un créneau manqué n'est jamais rattrapé : le
    // job attend le suivant, avec le plafond du jour suivant.
    // La fenêtre vient du SERVEUR SQL (republish_planifiee_fenetre_courante,
    // auth.uid()) — une seule définition ; l'app formate `reprise` sans la
    // redéduire (même doctrine que `reprise` du plafond, 04/09).
    // Best-effort : RPC absente (migration pas encore jouée) ou illisible →
    // rien de retenu, jamais un point de panne. Périmètre : le poll
    // d'exécution seul (le popup continue de voir la file complète).
    let heldCreneau = 0;
    let creneauRepublish: Record<string, unknown> | null = null;
    const autoHorsDeleted = (j: { action: string; platform_fields: unknown }) => {
      const pf = (j.platform_fields as Record<string, unknown> | null) ?? {};
      return j.action === "republish" && pf["republish_source"] === "auto" && pf["republish_step"] !== "deleted";
    };
    if (!includeProcessing && !includeNeedsUser && out.some(autoHorsDeleted)) {
      try {
        const { data: fen } = await userClient.rpc("republish_planifiee_fenetre_courante");
        const f = (fen ?? null) as Record<string, unknown> | null;
        if (f && f.actif === true) {
          const dans = f.dans_creneau === true;
          creneauRepublish = {
            actif: true,
            dans_creneau: dans,
            reprise: (f.prochaine_tentative as string | null) ?? null,
            fin: (f.courant_fin as string | null) ?? null,
          };
          if (!dans) {
            const avant = out.length;
            out = out.filter((j) => !autoHorsDeleted(j));
            heldCreneau = avant - out.length;
            if (heldCreneau) {
              console.log(
                `[get-pending-jobs] userId=${user.id} : hors créneau de republication planifiée — ` +
                `${heldCreneau} republication(s) auto retenue(s) en pending jusqu'à ${String(f.prochaine_tentative ?? "?")} ` +
                `(étape 'deleted' exemptée, manuel non concerné)`,
              );
            }
          }
        }
      } catch (_e) { /* filet best-effort : jamais un point de panne */ }
    }

    // ── UN SEUL LEBONCOIN À LA FOIS, PAR COMPTE (2026-09-08) ────────────────
    // CE QUI SE PASSE. Chaque publication Leboncoin ouvre le formulaire de
    // dépôt, et Leboncoin crée AUTOMATIQUEMENT un brouillon côté serveur. Si
    // un second job démarre avant que le premier ait refermé le sien, il tombe
    // dessus : « Un brouillon Leboncoin non terminé bloque le dépôt ». Chaque
    // job fabrique donc l'obstacle du suivant, et le retrait automatique du
    // brouillon (0.6.20) court après un brouillon qu'on est en train de
    // recréer — c'est pour ça qu'il n'y arrive pas.
    //
    // MESURÉ (samira.460, Premium depuis 13:11) : 6 publications Leboncoin
    // demandées entre 13:13 et 13:33, ZÉRO aboutie, et les six portent un
    // `processing_since` compris dans la même fenêtre de 4 minutes — la preuve
    // du télescopage, pas une hypothèse. Sur la journée : 10 demandées,
    // 2 abouties, contre 121/110 la veille et 97/89 l'avant-veille.
    //
    // LA GARDE. Tant qu'un job leboncoin de ce compte est en 'processing', on
    // ne sert aucun autre leboncoin. C'est exactement la garde anti-rafale de
    // la republication Vinted, étendue à Leboncoin — et à Leboncoin SEUL :
    // eBay et Beebs n'ouvrent pas de brouillon serveur, ils ne sont pas
    // concernés et ne doivent pas être ralentis.
    //
    // ⛔ RIEN N'EST REFUSÉ : les jobs restent 'pending', intacts. Aucune
    // tentative consommée, aucun 'failed', aucun 'needs_user', aucune
    // écriture. Ils repartent seuls au poll suivant — attendre son tour n'est
    // pas un échec.
    //
    // ⏳ PÉREMPTION à 10 minutes. Un 'processing' zombie (Chrome fermé au
    // milieu d'un formulaire) gèlerait sinon Leboncoin pour ce compte
    // indéfiniment. 10 min est très au-dessus du pire cas mesuré : sur
    // 434 publications abouties, la durée médiane est de 98 s, le 90e centile
    // de 126 s, et le maximum observé de 317 s. Un job plus vieux que ça n'est
    // plus en train de travailler.
    //
    // ⚠️ PAS DE DÉLAI D'ATTENTE EN PLUS, ET C'EST UNE CONCLUSION DE MESURE, pas
    // une omission. Sur 351 paires de publications Leboncoin abouties du même
    // compte (30 jours), l'écart minimum entre deux est de 96 s — pour une
    // durée médiane de job de 98 s. Autrement dit, quand ça marche, le job
    // suivant démarre déjà à la fin du précédent : le temps mort réel est
    // proche de zéro. Sérialiser suffit ; ajouter un délai ne ferait que
    // ralentir des publications qui aboutissent aujourd'hui.
    //
    // Périmètre : le poll d'EXÉCUTION seul (ni include_processing ni
    // include_needs_user), comme les autres retenues — le popup continue de
    // voir la file entière.
    // Best-effort : lecture illisible → on distribue normalement. Un filet ne
    // devient jamais un point de panne.
    let heldLbc = 0;
    if (!includeProcessing && !includeNeedsUser && out.some((j) => j.platform === "leboncoin")) {
      try {
        // ⛔ PAS de `updated_at` dans ce select : la colonne N'EXISTE PAS sur
        // cross_post_jobs (vérifié en base), et PostgREST est TOUT OU RIEN —
        // une seule colonne inconnue et la requête entière échoue. Le
        // best-effort ci-dessous aurait alors avalé l'erreur, et la garde
        // n'aurait jamais rien gardé, en silence. C'est exactement le piège
        // qui a déjà coûté un chantier sur ce projet.
        const { data: lbcEnCours } = await userClient
          .from("cross_post_jobs")
          .select("id, platform_fields, created_at")
          .eq("user_id", user.id)
          .eq("platform", "leboncoin")
          .eq("status", "processing")
          .limit(20);
        const limite = Date.now() - 10 * 60_000;
        const occupe = (lbcEnCours ?? []).some((j) => {
          const pf = j.platform_fields as Record<string, unknown> | null;
          const depuis = Date.parse(String(pf?.["processing_since"] ?? "")) ||
                         Date.parse(String((j as Record<string, unknown>).created_at ?? ""));
          // Horodatage illisible : on considère le job VIVANT. Mieux vaut
          // attendre un tour que fabriquer le brouillon qui bloque tout.
          if (!Number.isFinite(depuis)) return true;
          return depuis > limite;
        });
        if (occupe) {
          const avant = out.length;
          out = out.filter((j) => j.platform !== "leboncoin");
          heldLbc = avant - out.length;
          if (heldLbc) {
            console.log(
              `[get-pending-jobs] userId=${user.id} : un job leboncoin est déjà en cours ` +
              `→ ${heldLbc} leboncoin retenu(s) en pending pour ce cycle ` +
              `(un seul dépôt à la fois : deux formulaires ouverts ensemble se bloquent par leur brouillon)`,
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
    // ── PÉRIMÈTRE ÉLARGI AUX SUPPRESSIONS (2026-09-06 soir, cas claeys59450) ─
    // La v1 disait : « une publication crée une annonce neuve (pas d'origine à
    // trahir) et un delete vise une URL précise — ni l'un ni l'autre n'entre
    // ici. » La deuxième moitié de cette phrase est FAUSSE, et elle a coûté sa
    // soirée à un abonné Pro. L'URL d'un delete n'est pas neutre : elle désigne
    // l'annonce d'UNE boutique, et la suppression est précisément l'opération
    // que Vinted refuse quand le navigateur est connecté ailleurs.
    //
    // Mesuré en prod le 06/09 à 19:09 (job 33247fd2, article 9798949066, compte
    // qui venait d'ouvrir sa 2e boutique) :
    //   POST /api/v2/items/9798949066/delete → HTTP 403
    //   {"code":106,"message":"Accès refusé","message_code":"access_denied"}
    // Session Vinted VIVANTE (l'extension l'avait re-sondée : « valide »), corps
    // JSON bien formé de l'API Vinted — donc ni DataDome (qui rend du HTML de
    // captcha), ni un refus CSRF : un refus de PROPRIÉTÉ, mot pour mot « tu
    // n'es pas le vendeur de cet article ». Le job a ensuite brûlé ses
    // tentatives dans rearmBounded (2/5 en 8 min, 5/5 en ~2 h) pour finir en
    // 'failed' sur « retire-la à la main » — un échec inventé de toutes pièces,
    // alors que le seul geste réel est de se reconnecter à la bonne boutique.
    // Un job qui vise une boutique où l'utilisateur n'est pas connecté doit
    // ATTENDRE, pas échouer : les deux actions passent donc la même porte.
    // (publish reste dehors, à raison : il crée une annonce neuve.)
    //
    // ── QUI EST CONNECTÉ *MAINTENANT* (même incident) ───────────────────────
    // La v1 ne lisait que la sonde d'identité (extension_sessions), qui tourne
    // au plus toutes les 10 min. Or une bascule de boutique prend QUELQUES
    // SECONDES : entre la bascule et la sonde suivante, la garde comparait
    // l'origine des articles à l'identité de l'ANCIEN compte — elle laissait
    // donc passer exactement les jobs qui allaient être refusés, tout en
    // retenant ceux qui auraient marché. Une identité périmée n'est pas neutre,
    // elle est À L'ENVERS.
    // Deuxième source, sans aucun paquet d'extension : le dernier run de sync du
    // dressing. `vinted_sync_runs.vinted_user_id` est le compte RÉELLEMENT lu
    // par le navigateur, horodaté par `started_at` — une preuve au moins aussi
    // forte que la sonde. On retient la plus RÉCENTE des deux, et elle doit
    // rester dans la fenêtre de fraîcheur. (Chez claeys59450 : sonde sur
    // l'ancienne boutique, sync 19:15 sur la nouvelle → les tentatives 3, 4 et 5
    // du delete n'auraient jamais été distribuées.)
    //
    // ⛔ RIEN N'EST REFUSÉ, ici non plus : le job n'est pas servi, il reste
    // 'pending', intact, aucune tentative consommée. Il repart tout seul.
    const BOUTIQUE_SONDE_FRAICHEUR_MS = 30 * 60 * 1000;
    const boutiqueConcernee = (j: { action: string; platform: string; inventaire_id: unknown }) =>
      (j.action === "republish" || j.action === "delete") &&
      j.platform === "vinted" && j.inventaire_id != null;
    let heldBoutique = 0;
    let boutiquePause:
      | {
        connectee: { user_id: string; login: string | null; source: string };
        retenus: number;
        par_boutique: Record<string, number>;
        par_boutique_login: Record<string, string | null>;
        par_action: Record<string, number>;
      }
      | null = null;
    // ── LE DIAGNOSTIC EST CALCULÉ POUR TOUT LE MONDE, LE FILTRE NON ─────────
    // (2026-09-08) Ce bloc vivait ENTIÈREMENT derrière la garde du poll
    // d'exécution : le popup, qui demande needs_user et processing, ne recevait
    // donc JAMAIS `boutique_pause`. Résultat mesuré chez ornellaracano : 70
    // republications retenues, la seule explication existante calculée à chaque
    // poll… et jamais montrée à la personne concernée.
    // Désormais : le COMPTAGE tourne pour tous les appels (le popup en a besoin
    // pour le dire), le FILTRAGE reste réservé au poll d'exécution — le popup
    // continue de voir la file entière, exactement comme avant.
    {
      const candidats = out.filter(boutiqueConcernee);
      if (candidats.length) {
        try {
          // Deux relevés d'identité, le plus RÉCENT tranche.
          const [{ data: prof }, { data: runs }] = await Promise.all([
            // vinted_sync_pin joint à un SELECT qui existait déjà (aucune
            // requête de plus) : c'est lui qui porte le PSEUDO des boutiques,
            // sans quoi le message ne peut nommer que celle qui est connectée
            // et laisse l'autre en identifiant numérique.
            userClient.from("profiles").select("extension_sessions, vinted_sync_pin").eq("id", user.id).maybeSingle(),
            userClient
              .from("vinted_sync_runs")
              .select("vinted_user_id, vinted_login, started_at")
              .eq("kind", "dressing")
              .not("vinted_user_id", "is", null)
              .not("started_at", "is", null)
              .order("started_at", { ascending: false })
              .limit(1),
          ]);
          const sessions = (prof?.extension_sessions ?? null) as Record<string, unknown> | null;
          const identSonde = (sessions?.["vinted_identite"] ?? null) as { user_id?: unknown; login?: unknown } | null;
          const run = (runs?.[0] ?? null) as
            { vinted_user_id?: unknown; vinted_login?: unknown; started_at?: unknown } | null;
          const sources = [
            {
              source: "sonde",
              id: identSonde?.user_id != null ? String(identSonde.user_id).trim() : "",
              login: identSonde?.login != null ? String(identSonde.login) : null,
              at: Date.parse(String(sessions?.["checked_at"] ?? "")),
            },
            {
              source: "sync_dressing",
              id: run?.vinted_user_id != null ? String(run.vinted_user_id).trim() : "",
              login: run?.vinted_login != null ? String(run.vinted_login) : null,
              at: Date.parse(String(run?.started_at ?? "")),
            },
          ].filter((s) => s.id && Number.isFinite(s.at));
          sources.sort((a, b) => b.at - a.at);
          const vu = sources[0] ?? null;
          const fraiche = vu != null && Date.now() - vu.at <= BOUTIQUE_SONDE_FRAICHEUR_MS;
          if (vu && fraiche) {
            const identId = vu.id;
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
            const parAction: Record<string, number> = {};
            // On DÉSIGNE d'abord, on retire ensuite : le comptage est le même
            // pour tous, le retrait de la file ne concerne que l'exécution.
            const aRetenir = new Set<string>();
            for (const j of out) {
              if (!boutiqueConcernee(j)) continue;
              const o = origine.get(String(j.inventaire_id));
              if (!o || o === identId) continue; // inconnue ou bonne boutique
              aRetenir.add(String(j.id));
              parBoutique[o] = (parBoutique[o] ?? 0) + 1;
              parAction[j.action] = (parAction[j.action] ?? 0) + 1;
            }
            heldBoutique = aRetenir.size;
            if (!includeProcessing && !includeNeedsUser) {
              out = out.filter((j) => !aRetenir.has(String(j.id)));
            }
            if (heldBoutique) {
              // Pseudo de chaque dressing d'origine, lu dans le PIN de sync.
              // Absent = null : on ne devine jamais un pseudo.
              const pin = (prof?.vinted_sync_pin ?? null) as
                { v?: unknown; boutiques?: unknown } | null;
              const logins: Record<string, string | null> = {};
              const liste = Array.isArray(pin?.boutiques) ? pin!.boutiques as unknown[] : [];
              for (const cle of Object.keys(parBoutique)) {
                const b = liste.find((x) =>
                  x && typeof x === "object" &&
                  String((x as Record<string, unknown>).user_id ?? "").trim() === cle
                ) as Record<string, unknown> | undefined;
                const l = b?.login != null ? String(b.login).trim() : "";
                logins[cle] = l || null;
              }
              boutiquePause = {
                connectee: { user_id: identId, login: vu.login, source: vu.source },
                retenus: heldBoutique,
                par_boutique: parBoutique,
                par_boutique_login: logins,
                par_action: parAction,
              };
              console.log(
                `[get-pending-jobs] userId=${user.id} : Chrome connecté au dressing ` +
                `${identId}${vu.login ? ` (@${vu.login})` : ""} [relevé ${vu.source} ` +
                `${new Date(vu.at).toISOString()}] — ${heldBoutique} job(s) ` +
                `(${Object.entries(parAction).map(([a, n]) => `${a}: ${n}`).join(", ")}) ` +
                `d'une AUTRE boutique (${Object.entries(parBoutique).map(([k, n]) => `${k}: ${n}`).join(", ")}) ` +
                (!includeProcessing && !includeNeedsUser
                  ? `retenu(s) en pending, aucune tentative consommée`
                  : `— comptés pour le popup, file servie ENTIÈRE`),
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
    // ── RETRAIT BEEBS SANS LIEN = ATTENTE, JAMAIS UN CIBLAGE PAR TITRE ──────
    // (2026-09-11, décision Nico.) Un job action='delete' Beebs sans listing_url
    // (armé à la vente pendant que l'annonce est encore en vérification Beebs)
    // était servi tel quel, et beebs.js retrouvait la carte par TITRE EXACT
    // dans « Mes annonces » : sur deux annonces au même titre (Joséphine :
    // « Jean ONLY taille M » ×2), c'est l'AUTRE annonce qui partait — l'article
    // vendu restait en ligne, celui encore à vendre disparaissait, et rien
    // n'échouait. Mesuré 30 j : 5 retraits sans lien (Ornella), 0 titre en
    // double, aucune mauvaise suppression — le défaut est dans le code, pas
    // encore dans les faits. Désormais, SANS LIEN ON NE RETIRE RIEN :
    //   · le lien est déjà sur le job de dépôt (recoverMissingListingUrls
    //     l'a retrouvé depuis) → on le RECOPIE sur le retrait et on le sert ;
    //   · sinon → RETENU en pending (marqueur retrait_attend_lien, aucune
    //     tentative consommée) : le dépôt reste 'published' à la vente
    //     (sale-orchestration) pour que la re-capture continue de chercher ;
    //   · dépôt requalifié « non confirmé » par le cron (jamais en ligne) →
    //     retrait ANNULÉ : rien à retirer ;
    //   · 7 jours d'attente (la fenêtre de la re-capture) → failed honnête.
    // Leboncoin n'est pas concerné (cible par l'id de l'URL, échec propre
    // sans lien) ; Vinted/eBay non plus.
    let heldRetraitBeebs = 0;
    if (!includeProcessing && !includeNeedsUser) {
      const retraitsSansLien = out.filter((j) =>
        j.platform === "beebs" && j.action === "delete" && !String(j.listing_url ?? "").trim());
      if (retraitsSansLien.length) {
        const aRetenir = new Set<string>();
        const ATTENTE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
        for (const d of retraitsSansLien) {
          const pf = ((d.platform_fields as Record<string, unknown> | null) ?? {});
          const attente = (pf["retrait_attend_lien"] as Record<string, unknown> | undefined) ?? {};
          const depuisMs = Date.parse(String(attente["depuis"] ?? "")) || Date.now();
          const nowIso = new Date().toISOString();
          try {
            let url: string | null = null;
            let depotJamaisEnLigne = false;
            if (d.inventaire_id != null) {
              const { data: depots } = await userClient
                .from("cross_post_jobs")
                .select("id, status, listing_url, platform_fields")
                .eq("platform", "beebs")
                .eq("inventaire_id", d.inventaire_id)
                .in("action", ["publish", "republish"])
                .order("created_at", { ascending: false })
                .limit(5);
              for (const p of (depots ?? []) as Array<{ status: string; listing_url: string | null; platform_fields: unknown }>) {
                if (String(p.listing_url ?? "").trim()) { url = String(p.listing_url); break; }
              }
              const liste = (depots ?? []) as Array<{ status: string; platform_fields: unknown }>;
              depotJamaisEnLigne = !url && liste.length > 0 && liste.every((p) =>
                p.status === "failed" && Boolean(((p.platform_fields as Record<string, unknown> | null) ?? {})["listing_url_abandon"]));
            }
            if (url) {
              const pfNeuf: Record<string, unknown> = {
                ...pf,
                retrait_attend_lien: { ...attente, resolu_le: nowIso, url },
              };
              delete pfNeuf["removal_url_missing"];
              await userClient.from("cross_post_jobs")
                .update({ listing_url: url, platform_fields: pfNeuf })
                .eq("id", d.id).eq("status", "pending");
              (d as { listing_url: string | null }).listing_url = url;
              (d as { platform_fields: unknown }).platform_fields = pfNeuf;
              console.log(`[get-pending-jobs] retrait beebs ${String(d.id).slice(0, 8)} : lien du dépôt recopié (${url}) — servi`);
              continue;
            }
            if (depotJamaisEnLigne) {
              await userClient.from("cross_post_jobs")
                .update({
                  status: "cancelled",
                  error: "Rien à retirer sur Beebs : l'annonce n'a jamais été mise en ligne (dépôt non confirmé).",
                  platform_fields: { ...pf, retrait_attend_lien: { ...attente, annule_le: nowIso, motif: "depot_jamais_en_ligne" } },
                })
                .eq("id", d.id).eq("status", "pending");
              aRetenir.add(String(d.id));
              continue;
            }
            if (Date.now() - depuisMs > ATTENTE_MAX_MS) {
              await userClient.from("cross_post_jobs")
                .update({
                  status: "failed",
                  error: "Retrait Beebs non fait : le lien de l'annonce n'a pas été obtenu en 7 jours (annonce jamais mise en ligne, ou lien introuvable). Vérifie ton dressing Beebs et retire-la à la main si elle y est.",
                  platform_fields: { ...pf, retrait_attend_lien: { ...attente, expire_le: nowIso } },
                })
                .eq("id", d.id).eq("status", "pending");
              aRetenir.add(String(d.id));
              continue;
            }
            await userClient.from("cross_post_jobs")
              .update({
                platform_fields: {
                  ...pf,
                  retrait_attend_lien: {
                    depuis: new Date(depuisMs).toISOString(),
                    derniere: nowIso,
                    observations: (Number(attente["observations"]) || 0) + 1,
                    motif: "sans_lien_jamais_par_titre",
                  },
                },
              })
              .eq("id", d.id).eq("status", "pending");
            aRetenir.add(String(d.id));
          } catch (e) {
            console.warn(`[get-pending-jobs] retrait beebs ${String(d.id).slice(0, 8)} : attente illisible (${String((e as Error)?.message ?? e)}) — retenu`);
            aRetenir.add(String(d.id));
          }
        }
        if (aRetenir.size) {
          const avant = out.length;
          out = out.filter((j) => !aRetenir.has(String(j.id)));
          heldRetraitBeebs = avant - out.length;
        }
      }
    }

    // ── ARTICLES QUE BEEBS N'ACCEPTE PAS (2026-09-11, GO Nico) ──────────────
    // Filet serveur de la case grisée dans l'app (platformCompat.js) : MÊME
    // fichier de règles (_shared/beebs-interdits.js), MÊME matière — la ligne
    // inventaire seule : marque et état relevés sur Vinted (attributs, avec
    // leur source), vinted_catalog_id. Jamais le titre, jamais l'IA, jamais
    // platform_fields du job (rédigé depuis le formulaire, pré-rempli par
    // l'IA) ; doute = servi. Un dépôt touché passe en needs_user avec le motif
    // écrit à la personne : rien n'est annulé, rien de plus n'est débité, et
    // l'annonce ne part pas se faire retirer à la modération Beebs. Poll
    // d'exécution seul, comme les autres filets ; best-effort, jamais un point
    // de panne. Mesuré le 11/09 : 0 job en file concerné, 1 article sur 265
    // déjà publiés sur Beebs (marque Shein).
    let heldBeebsInterdit = 0;
    if (!includeProcessing && !includeNeedsUser) {
      const depotsBeebs = out.filter((j) =>
        j.platform === "beebs" && (j.action === "publish" || j.action === "republish") && j.inventaire_id != null);
      if (depotsBeebs.length) {
        try {
          const ids = [...new Set(depotsBeebs.map((j) => j.inventaire_id))];
          const { data: arts } = await userClient
            .from("inventaire").select("id, vinted_catalog_id, attributs").in("id", ids);
          const parArticle = new Map<string, Record<string, unknown>>();
          for (const a of (arts ?? []) as Record<string, unknown>[]) parArticle.set(String(a.id), a);
          const aRetenir = new Set<string>();
          for (const j of depotsBeebs) {
            const art = parArticle.get(String(j.inventaire_id));
            if (!art) continue; // article absent = inconnu = servi
            const verdict = verdictBeebsInterdit(art);
            if (!verdict) continue;
            const pf = ((j.platform_fields as Record<string, unknown> | null) ?? {});
            const { data: maj } = await userClient.from("cross_post_jobs")
              .update({
                status: "needs_user",
                error: messageBeebsInterdit(verdict, "fr"),
                platform_fields: { ...pf, beebs_interdit: { ...verdict, depuis: new Date().toISOString(), source: "get-pending-jobs" } },
              })
              .eq("id", j.id).eq("status", "pending").select("id");
            aRetenir.add(String(j.id));
            const detail = verdict.motif === "marque"
              ? `marque ${verdict.marque}`
              : `catalogue ${verdict.vinted_catalog_id}${verdict.motif === "usage" ? ` en « ${verdict.etat} »` : ""}`;
            console.log(`[get-pending-jobs] dépôt beebs ${String(j.id).slice(0, 8)} : article refusé par le catalogue Beebs (${detail}) — needs_user${(maj ?? []).length ? "" : " (déjà sorti de pending)"}`);
          }
          if (aRetenir.size) {
            const avant = out.length;
            out = out.filter((j) => !aRetenir.has(String(j.id)));
            heldBeebsInterdit = avant - out.length;
          }
        } catch (_e) { /* best-effort : jamais un point de panne — le job est servi */ }
      }
    }

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
      (heldBoutique ? `, ${heldBoutique} job(s) retenu(s) (boutique Vinted non connectée)` : "") +
      (heldPipeline ? `, ${heldPipeline} republish retenu(s) (article par article — capture/retrait au compte-gouttes)` : "") +
      (heldLbc ? `, ${heldLbc} leboncoin retenu(s) (un seul dépôt à la fois)` : "") +
      (heldSession ? `, ${heldSession} job(s) retenu(s) (session plateforme connue morte)` : "") +
      (heldRetraitBeebs ? `, ${heldRetraitBeebs} retrait(s) beebs retenu(s) (sans lien : attente, jamais par titre)` : "") +
      (heldBeebsInterdit ? `, ${heldBeebsInterdit} dépôt(s) beebs → needs_user (article refusé par le catalogue Beebs)` : "") +
      (heldRetrait0625 ? `, ${heldRetrait0625} republish retenu(s) (coupe-circuit retrait taille_par_id)` : ""),
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
    // annonces_en_attente : le MÊME calcul que celui servi à l'app en mode
    // plafond_only. Le popup l'affiche au lieu de compter lui-même — c'est ce
    // qui garantit que les deux écrans disent le même nombre.
    // Servi au popup seul (include_needs_user) : le background poll toutes les
    // 2 min et n'a que faire de ce chiffre, il ne le paie donc pas.
    let annoncesAttente: { total: number; inventaire_ids: string[] } | null = null;
    if (includeNeedsUser) {
      try { annoncesAttente = await annoncesEnAttente(); } catch (_e) { /* le popup retombe sur son propre compte */ }
    }

    // ══ INCIDENT VINTED DU 07/09 : L'ÉTAT FOURNI PAR LE SERVEUR ═════════════
    // Vinted a retiré le champ racine `status` du payload du formulaire
    // d'édition le 07/09 vers 13h25 (mesuré : 1 637 captures à 100 % de
    // présence du 28/08 au 06/09, puis 83 captures sans lui, toutes après
    // 13h25, sur deux comptes ; 37 clés identiques par ailleurs, rien de
    // renommé). Plus aucune source d'état ⇒ verdict 'incomplet' ⇒ AUCUNE
    // republication ne peut aboutir, dans tout le parc : 448 jobs en attente
    // chez 28 comptes. Le correctif d'extension (lecture de
    // item_attributes[condition]) attend une revue du Chrome Web Store, soit
    // plusieurs jours. Voici le chemin SERVEUR, disponible tout de suite.
    //
    // COMMENT : `platform_fields.republish_user_fields` est déjà lu par
    // l'extension EN PRODUCTION (background.js, canal du needs_user depuis le
    // 21/08). Ses valeurs sont injectées dans les libellés de la capture AVANT
    // le calcul du verdict, et retirent le motif correspondant de
    // champs_manquants. Sa liste blanche contient « etat ». En le renseignant
    // ici, la capture redevient 'valide' sans qu'une seule ligne d'extension
    // change.
    //
    // ⛔ ÉTAT CERTAIN, JAMAIS DEVINÉ (garde-fou absolu posé par Nico) :
    //   · la SEULE source acceptée est une capture ANTÉRIEURE VALIDE DE CE
    //     MÊME ARTICLE (jointure par inventaire_id), dont le libellé d'état a
    //     été relevé sur Vinted. Ni Lens, ni une valeur d'un job de
    //     publication (source backfill_job), ni un article voisin ;
    //   · si aucune capture antérieure ne porte l'état, ON NE FOURNIT RIEN et
    //     le job reste en attente. 107 jobs sont dans ce cas : ils attendront
    //     la 0.6.21. Une file à l'arrêt vaut mieux qu'une annonce republiée
    //     avec un état faux ;
    //   · une valeur déjà présente dans republish_user_fields (saisie par
    //     l'utilisateur) n'est JAMAIS écrasée.
    //
    // ⏳ AUTO-EXTINCTION : l'injection n'a lieu que tant que l'incident dure —
    // c'est-à-dire tant qu'une capture des dernières 24 h a réellement manqué
    // l'état. Le jour où Vinted rétablit `status` (ou où la 0.6.21 est
    // installée), plus aucune capture ne le manque, la condition retombe et le
    // serveur cesse de fournir quoi que ce soit, sans nouveau déploiement.
    // C'est ce qui évite de figer un état ancien par-dessus un payload sain.
    try {
      const republishServis = out.filter((j) =>
        j.action === "republish" && j.platform === "vinted" && j.inventaire_id != null
      );
      if (republishServis.length) {
        const { count: capturesSansEtat } = await userClient
          .from("vinted_republish_captures")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("captured_at", new Date(Date.now() - 24 * 3600_000).toISOString())
          .contains("champs_manquants", ["etat (libellé d'état absent du payload)"]);
        if ((capturesSansEtat ?? 0) > 0) {
          const ids = [...new Set(republishServis.map((j) => j.inventaire_id))];
          // ⚠️ PAS de filtre sur le verdict (élargi le 07/09) : le verdict porte
          // sur l'ENSEMBLE des champs — une capture peut être 'incomplet' à
          // cause d'une photo non ré-hébergée tout en portant un libellé d'état
          // parfaitement relevé sur Vinted. Seul le libellé compte ici. Mesuré :
          // +11 jobs couverts, 321 → 332 sur 440.
          const { data: caps } = await userClient
            .from("vinted_republish_captures")
            .select("inventaire_id, libelles, captured_at")
            .eq("user_id", user.id)
            .in("inventaire_id", ids)
            .order("captured_at", { ascending: false });
          const etatParArticle = new Map<string, { etat: string; at: string; source: string }>();
          for (const c of (caps ?? []) as Array<Record<string, unknown>>) {
            const cle = String(c.inventaire_id);
            if (etatParArticle.has(cle)) continue; // la plus récente d'abord
            const etat = String((c.libelles as Record<string, unknown> | null)?.etat ?? "").trim();
            if (etat) etatParArticle.set(cle, { etat, at: String(c.captured_at), source: "libelles" });
          }
          // ── SECONDE SOURCE : L'ÉTAT À SA NOUVELLE PLACE ────────────────────
          // Un article dont AUCUNE capture ne porte de libellé d'état n'est pas
          // perdu : ses captures d'aujourd'hui portent le payload natif, donc
          // `item_attributes[code=condition]`. Mesuré le 07/09 : 88 captures
          // ratées sur 88 le portent, avec un id de la table relevée. C'est la
          // MÊME annonce, lue chez Vinted — jamais une valeur devinée.
          // Requête par article (payload volumineux) et bornée à 25 par poll :
          // le reste passe au poll suivant, la file s'écoule sans à-coup.
          const sansLibelle = ids.filter((id) => !etatParArticle.has(String(id)));
          for (const id of sansLibelle.slice(0, 25)) {
            const { data: une } = await userClient
              .from("vinted_republish_captures")
              .select("libelles, payload, captured_at")
              .eq("user_id", user.id)
              .eq("inventaire_id", id)
              .order("captured_at", { ascending: false })
              .limit(1);
            const ligne = (une ?? [])[0] as Record<string, unknown> | undefined;
            const resolu = etatDepuisCapture(ligne);
            if (resolu) {
              etatParArticle.set(String(id), {
                etat: resolu.etat, at: String(ligne?.captured_at ?? ""), source: resolu.source,
              });
            }
          }
          let fournis = 0;
          for (const j of republishServis) {
            const pf = (j.platform_fields as Record<string, unknown> | null) ?? {};
            const uf = (pf["republish_user_fields"] as Record<string, unknown> | null) ?? {};
            if (String(uf["etat"] ?? "").trim()) continue; // saisie de l'utilisateur : intouchable
            const connu = etatParArticle.get(String(j.inventaire_id));
            if (!connu) continue;
            j.platform_fields = {
              ...pf,
              republish_user_fields: { ...uf, etat: connu.etat },
              // Trace : d'où vient cet état, et de quand. Auditable en SQL.
              republish_etat_fourni: {
                source: `capture_anterieure (${connu.source})`, etat: connu.etat,
                capture_at: connu.at, motif: "status retiré du payload Vinted le 07/09",
              },
            };
            fournis++;
          }
          if (fournis) {
            console.log(
              `[get-pending-jobs] userId=${user.id} : état fourni depuis une capture antérieure sur ${fournis} republication(s) ` +
              `— incident Vinted « status » absent du payload (${capturesSansEtat} capture(s) sans état sur 24 h)`,
            );
          }
          // ── PLUS AUCUNE RETENUE : LA FILE NE S'ARRÊTE PAS ────────────────
          // Une version antérieure de ce dépannage retenait en file les
          // republications dont l'état n'était fournissable par aucune capture
          // antérieure. C'était une demi-panne visible du vendeur, et elle est
          // désormais inutile : quand une capture échoue faute d'état,
          // update-job-status relit `item_attributes[condition]` dans la
          // capture qui vient d'être écrite, pose l'état et laisse le job en
          // 'pending' — il repart au poll suivant, sans erreur affichée, sans
          // question posée. Un article jamais capturé doit donc PARTIR : c'est
          // sa première capture qui fournit son propre état.
          // Le garde-fou, lui, n'a pas bougé : sans état certain, rien n'est
          // supprimé — la capture reste 'incomplet' et le job attend.
        }
      }
    } catch (_e) { /* le dépannage ne doit jamais empêcher de servir la file */ }

    // ══ COULEUR : republish_user_fields.couleur SERVIE À LA RECRÉATION
    //    (2026-09-10 soir, GO Nico — 5 annonces hors ligne, refus 400 « Le
    //    champ Couleur doit être renseigné ») ═══════════════════════════════
    // POURQUOI ICI ET SOUS CETTE FORME. À l'étape 'deleted' (recréation après
    // retrait) comme à 'captured' (une-passe), l'extension RELIT la capture EN
    // BASE (vinted_republish_captures, par capture_id) et construit le job de
    // recréation depuis `libelles` (construireJobRecreation : colors =
    // libelles.couleurs). La liste blanche de la capture (taille, marque,
    // etat, isbn) ne connaît pas la couleur, et à 'deleted' aucune fusion de
    // republish_user_fields n'a lieu : une couleur saisie dans l'app n'atteint
    // donc JAMAIS le formulaire de recréation, quel que soit le build. Le
    // serveur la pose là où l'extension la lit : dans `libelles.couleurs` de
    // la capture du job, et dans republish_snapshot (ceinture, affichage app).
    // ⛔ JAMAIS D'ÉCRASEMENT : seulement si la capture ne porte AUCUNE couleur.
    //    Une couleur relevée sur Vinted prime toujours sur une saisie.
    // ⛔ Mesuré avant ce bloc : les 5 captures des annonces hors ligne portaient
    //    DÉJÀ leur couleur (natif.color1 en clair, libelles.couleurs remplis) —
    //    pour elles ce bloc ne change rien ; il sert aux annonces SANS couleur
    //    d'origine, où la saisie de l'app est la seule source.
    // Service role sur la capture (RLS : l'extension n'a besoin que d'INSERT),
    // filtrée par user_id ET capture_id du job — jamais la ligne d'un autre.
    try {
      const avecCouleur = out.filter((j) => {
        if (j.action !== "republish" || j.platform !== "vinted") return false;
        const pf = (j.platform_fields as Record<string, unknown> | null) ?? {};
        const uf = (pf["republish_user_fields"] as Record<string, unknown> | null) ?? {};
        return String(uf["couleur"] ?? "").trim() !== "" && Number.isFinite(Number(pf["capture_id"]));
      });
      if (avecCouleur.length) {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        let posees = 0;
        for (const j of avecCouleur) {
          const pf = (j.platform_fields as Record<string, unknown>) ?? {};
          const uf = (pf["republish_user_fields"] as Record<string, unknown>) ?? {};
          const couleurs = String(uf["couleur"]).split(/\s*(?:,|\/| et )\s*/i)
            .map((s) => s.trim()).filter(Boolean).slice(0, 2);
          if (!couleurs.length) continue;
          const capId = Number(pf["capture_id"]);
          const { data: cap } = await admin
            .from("vinted_republish_captures")
            .select("id, libelles")
            .eq("id", capId)
            .eq("user_id", user.id)
            .maybeSingle();
          if (!cap) continue;
          const lib = ((cap.libelles ?? {}) as Record<string, unknown>);
          const deja = Array.isArray(lib["couleurs"]) ? (lib["couleurs"] as unknown[]).filter(Boolean) : [];
          if (deja.length) continue; // couleur relevée sur Vinted : intouchable
          const { error: cErr } = await admin
            .from("vinted_republish_captures")
            .update({ libelles: { ...lib, couleurs: couleurs } })
            .eq("id", capId)
            .eq("user_id", user.id);
          if (cErr) {
            console.warn(`[get-pending-jobs] job ${j.id} : couleur non posée sur la capture ${capId} — ${cErr.message}`);
            continue;
          }
          const snap = (pf["republish_snapshot"] as Record<string, unknown> | null) ?? null;
          const trace = { couleurs, capture_id: capId, source: "republish_user_fields.couleur (app)", at: new Date().toISOString() };
          const pfNeuf: Record<string, unknown> = {
            ...pf,
            ...(snap ? { republish_snapshot: { ...snap, couleurs } } : {}),
            republish_couleur_fournie: trace,
          };
          // Persisté sur le job (ceinture + audit) ; échec d'écriture = la
          // capture est déjà à jour, le job servi porte la trace en mémoire.
          await admin.from("cross_post_jobs").update({ platform_fields: pfNeuf })
            .eq("id", j.id).eq("user_id", user.id);
          j.platform_fields = pfNeuf;
          posees++;
          console.log(`[get-pending-jobs] job ${j.id} : couleur « ${couleurs.join(", ")} » posée sur la capture ${capId} (aucune couleur relevée) — servie à la recréation`);
        }
        if (posees) console.log(`[get-pending-jobs] userId=${user.id} : couleur de l'app servie sur ${posees} republication(s) sans couleur relevée`);
      }
    } catch (_e) { /* le dépannage ne doit jamais empêcher de servir la file */ }

    // ══ DÉSARMER LA BOUCLE ONGLET-PAR-ONGLET DE LA 0.6.25 SANS PAQUET
    //    (2026-09-10 soir, GO Nico — 5 annonces hors ligne, refus 400 Couleur) ══
    // La 0.6.25 (selectTailleVinted) cherche d'abord la taille PAR ID : les ids
    // capturés sont ceux de la grille COMBINÉE d'origine (3 = « S / 36 / 8 »,
    // 5 = « L / 40 / 12 ») alors que le formulaire de 2026 n'offre que les ids
    // des grilles séparées (1735-1751 sur l'onglet S/M/L, relevé en direct le
    // 10/09 à 19:5x). trouverParId ne trouve donc JAMAIS → boucle sur les 6
    // onglets (S/M/L, EU, UK, FR, IT, US ; 1,5 s chacun, ré-ouvertures du
    // panneau modal) avant la cascade par libellé — parcours propre à la
    // 0.6.25 ; la 0.6.24 allait droit à la cascade (131 recréations, 0 refus
    // le même jour). Les ids ne voyagent PAS dans ce payload : l'extension les
    // reconstruit depuis la CAPTURE relue en base (construireJobRecreation :
    // natif.size_id + item_attributes[code=size].ids). On les retire donc de
    // la capture du job, pour ce client, quand il déclare « taille_par_id » :
    // sans ids, selectTailleVinted saute la boucle et pose par libellé.
    // ⛔ Seulement si libelles.taille est présent (sans libellé, les ids sont
    //    la seule source : on ne touche pas).
    // ⛔ RÉVERSIBLE : les valeurs retirées sont conservées dans
    //    payload.taille_ids_retires (size_id, entrée item_attributes, at).
    // ⛔ Interrupteur coin_config 'republish_taille_ids_retires_taille_par_id'
    //    = 1 ; absent, 0 ou illisible → rien. Poll d'exécution seul.
    // Périmètre : republish Vinted, étapes 'captured' (une-passe, capture relue
    // avant tout retrait) et 'deleted' (recréation) — 'a_capturer' n'a pas
    // encore de capture, elle sera traitée au poll suivant.
    let idsRetires = 0;
    if (!includeProcessing && !includeNeedsUser && tailleParId) {
      try {
        const cibles = out.filter((j) => {
          if (j.action !== "republish" || j.platform !== "vinted") return false;
          const pf = (j.platform_fields as Record<string, unknown> | null) ?? {};
          const step = String(pf["republish_step"] ?? "");
          return (step === "captured" || step === "deleted") && Number.isFinite(Number(pf["capture_id"]));
        });
        if (cibles.length) {
          const { data: cfgIds } = await userClient
            .from("coin_config").select("value").eq("key", "republish_taille_ids_retires_taille_par_id").maybeSingle();
          if (Number((cfgIds as Record<string, unknown> | null)?.value) === 1) {
            const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
            for (const j of cibles) {
              const pf = (j.platform_fields as Record<string, unknown>) ?? {};
              const capId = Number(pf["capture_id"]);
              const { data: cap } = await admin
                .from("vinted_republish_captures")
                .select("id, libelles, payload")
                .eq("id", capId)
                .eq("user_id", user.id)
                .maybeSingle();
              if (!cap) continue;
              const lib = (cap.libelles ?? {}) as Record<string, unknown>;
              if (!String(lib["taille"] ?? "").trim()) continue; // sans libellé : les ids sont la seule source
              const payload = (cap.payload ?? {}) as Record<string, unknown>;
              if (payload["taille_ids_retires"]) continue;      // déjà fait
              const natif = (payload["natif"] ?? null) as Record<string, unknown> | null;
              if (!natif || typeof natif !== "object") continue;
              const attrs = Array.isArray(natif["item_attributes"]) ? natif["item_attributes"] as Array<Record<string, unknown>> : [];
              const attrSize = attrs.find((a) => String(a?.["code"] ?? "").trim().toLowerCase() === "size") ?? null;
              const sizeId = natif["size_id"] ?? null;
              if (sizeId == null && !attrSize) continue;         // rien à retirer
              const natifNeuf = {
                ...natif,
                size_id: null,
                item_attributes: attrs.filter((a) => a !== attrSize),
              };
              const payloadNeuf = {
                ...payload,
                natif: natifNeuf,
                taille_ids_retires: {
                  size_id: sizeId, item_attributes_size: attrSize, at: new Date().toISOString(),
                  motif: "0.6.25 : ids de la grille combinée absents du formulaire → boucle 6 onglets ; pose par libellé (chemin 0.6.24)",
                  libelle_conserve: String(lib["taille"]),
                },
              };
              const { error: uErr } = await admin
                .from("vinted_republish_captures")
                .update({ payload: payloadNeuf })
                .eq("id", capId)
                .eq("user_id", user.id);
              if (uErr) {
                console.warn(`[get-pending-jobs] job ${j.id} : taille_ids NON retirés de la capture ${capId} — ${uErr.message}`);
                continue;
              }
              j.platform_fields = {
                ...pf,
                republish_taille_ids_retires: { capture_id: capId, size_id: sizeId, at: new Date().toISOString() },
              };
              idsRetires++;
              console.log(`[get-pending-jobs] job ${j.id} : taille_ids retirés de la capture ${capId} (size_id ${String(sizeId)}, libellé « ${String(lib["taille"])} » conservé) — la 0.6.25 posera la taille par libellé, sans boucle d'onglets`);
            }
          }
        }
      } catch (_e) { /* le dépannage ne doit jamais empêcher de servir la file */ }
    }
    if (idsRetires) console.log(`[get-pending-jobs] userId=${user.id} : taille_ids retirés sur ${idsRetires} capture(s) (client taille_par_id)`);

    // ══ TAILLE « EU 38 » / « FR 40 » : LE LIBELLÉ DE LA GRILLE SERVI À LA
    //    RECAPTURE (2026-09-10, v3 — capture préfixée : lettre → exact → jeton) ══
    // Pour les size_id 1943→1965, le référentiel size_groups lu par
    // l'extension à la capture rend « EU 38 » / « FR 40 » là où la garde-robe
    // Vinted (inventaire.attributs.taille, source vinted_liste) affiche le
    // même article « M / 38 / 10 » ; le formulaire de recréation refuse la
    // forme préfixée (vinted.js retire « EU », le « 38 » nu ne matche plus
    // rien). Vinted a une GRILLE PAR CATÉGORIE et le libellé de l'option n'est
    // presque jamais la valeur nue (« W42 | FR 52 », « M / 38 / 10 »…) : le
    // serveur, qui connaît la grille relevée ET la taille capturée, sert le
    // LIBELLÉ EXACT de l'option dans republish_user_fields.taille — le canal
    // que l'extension fusionne déjà dans la capture (même mécanisme que l'état
    // ci-dessus). Il n'atteint un job qu'à une (re)capture. Preuve : 3 jobs
    // republiés dans la nuit du 10/09 par la voie lettre (f1f37218 → « M »).
    // Ordre, exception « EU  », garde-fous et relevés :
    // _shared/vinted-taille-republication.ts. Périmètre STRICT = la dernière
    // capture de l'article rend une forme préfixée (0 des 590 abouties/7 j) ;
    // le déclencheur « forme absente de la grille » a été REFUSÉ (il toucherait
    // 8 abouties/7 j). Rien n'est réécrit en base ici.
    try {
      const republishTaille = out.filter((j) =>
        j.action === "republish" && j.platform === "vinted" && j.inventaire_id != null
      );
      if (republishTaille.length) {
        const ids = [...new Set(republishTaille.map((j) => j.inventaire_id))];
        const { data: caps } = await userClient
          .from("vinted_republish_captures")
          .select("inventaire_id, libelles, captured_at")
          .eq("user_id", user.id)
          .in("inventaire_id", ids)
          .order("captured_at", { ascending: false });
        const derniereCapture = new Map<string, Record<string, unknown>>();
        for (const c of (caps ?? []) as Array<Record<string, unknown>>) {
          const cle = String(c.inventaire_id);
          if (!derniereCapture.has(cle)) derniereCapture.set(cle, (c.libelles ?? {}) as Record<string, unknown>);
        }
        const aTraiter = republishTaille.filter((j) =>
          TAILLE_PREFIXEE_RE.test(normaliserTaille(derniereCapture.get(String(j.inventaire_id))?.["taille"]))
        );
        if (aTraiter.length) {
          const { data: invs } = await userClient
            .from("inventaire")
            .select("id, attributs")
            .in("id", [...new Set(aTraiter.map((j) => j.inventaire_id))]);
          const tailleInventaire = new Map<string, { v?: unknown; source?: unknown } | null>();
          for (const i of (invs ?? []) as Array<Record<string, unknown>>) {
            const t = ((i.attributs ?? {}) as Record<string, unknown>)["taille"];
            tailleInventaire.set(String(i.id), t && typeof t === "object" ? (t as { v?: unknown; source?: unknown }) : null);
          }
          const cheminDe = (j: (typeof aTraiter)[number]): string => {
            const p = derniereCapture.get(String(j.inventaire_id))?.["categoryPath"];
            return Array.isArray(p) ? p.map((s) => String(s)).join(" > ") : "";
          };
          const chemins = [...new Set(aTraiter.map(cheminDe).filter(Boolean))];
          // Libellés BRUTS de la grille relevée : c'est l'un d'eux qui sera servi.
          const grilles = new Map<string, string[]>();
          if (chemins.length) {
            const { data: rows } = await userClient
              .from("platform_category_aspects")
              .select("category_key, allowed_values")
              .eq("platform", "vinted")
              .eq("field_key", "size")
              .in("category_key", chemins);
            for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
              if (Array.isArray(r.allowed_values) && r.allowed_values.length) {
                grilles.set(String(r.category_key), r.allowed_values.map((v) => String(v)));
              }
            }
          }
          let fournis = 0;
          for (const j of aTraiter) {
            const pf = (j.platform_fields as Record<string, unknown> | null) ?? {};
            const uf = (pf["republish_user_fields"] as Record<string, unknown> | null) ?? {};
            if (String(uf["taille"] ?? "").trim()) continue; // saisie de l'utilisateur : intouchable
            const captureTaille = String(derniereCapture.get(String(j.inventaire_id))?.["taille"] ?? "");
            const chemin = cheminDe(j);
            const r = tailleAServir({
              captureTaille,
              inventaireTaille: tailleInventaire.get(String(j.inventaire_id)) ?? null,
              options: grilles.get(chemin) ?? null,
            }, tailleParId ? { ordrePrefixe: ORDRE_EXACT_D_ABORD, euCoupe: false } : {});
            // Trace OBLIGATOIRE, servie aussi quand rien n'est servi : capture,
            // catégorie, grille relevée oui/non, étape retenue (1/2/3 ou null),
            // valeur servie ou motif. C'est ce que Nico lit en SQL.
            const trace = {
              capture: captureTaille, categorie: chemin || null, grille_relevee: grilles.has(chemin),
              etape: r.etape, ordre: r.ordre, valeur: r.valeur,
              ...(r.valeur === null ? { motif: r.motif } : { detail: r.detail }),
              ...(r.etape === 3 ? { source: "inventaire.attributs.taille (vinted_liste)" } : {}),
              at: new Date().toISOString(),
            };
            if (r.valeur === null) {
              console.log(`[get-pending-jobs] job ${j.id} : taille « ${captureTaille} » NON servie — ${r.motif}`);
              j.platform_fields = { ...pf, republish_taille_fournie: trace };
              continue;
            }
            j.platform_fields = {
              ...pf,
              republish_user_fields: { ...uf, taille: r.valeur },
              republish_taille_fournie: trace,
            };
            fournis++;
            console.log(`[get-pending-jobs] job ${j.id} : taille « ${captureTaille} » → « ${r.valeur} » (étape ${r.etape}, ordre ${r.ordre}, ${r.detail})`);
          }
          if (fournis) {
            console.log(
              `[get-pending-jobs] userId=${user.id} : taille servie sur ${fournis} republication(s) ` +
              `à capture préfixée EU/FR/UK (${aTraiter.length} dans le périmètre)`,
            );
          }
        }
      }
    } catch (_e) { /* le dépannage ne doit jamais empêcher de servir la file */ }

    // ── ADRESSE DE REMISE : LES RÉGLAGES FONT FOI AU MOMENT DE PUBLIER ──────
    // (2026-09-07, job 6b4e9f45 d'Hugo) L'adresse est COPIÉE dans le job au
    // clic Publier. Quand l'autocomplete Leboncoin la refusait, le message
    // disait « vérifier l'orthographe dans les Réglages FillSell » — un
    // conseil qui ne menait nulle part : corriger les Réglages ne touchait pas
    // un job déjà créé, et la relance retapait la même adresse, indéfiniment.
    // Désormais la valeur des Réglages, quand elle existe, est servie à
    // l'extension à la place de la copie figée : corriger puis relancer
    // FONCTIONNE, et le message de l'extension redevient vrai.
    // ⛔ Uniquement si les Réglages portent une valeur NON VIDE : un compte
    // sans adresse enregistrée (cas d'Hugo, platform_settings vide) garde la
    // copie du job — y compris une correction posée à la main en base.
    // Rien n'est réécrit en base : on ne fait que servir la valeur fraîche.
    try {
      const besoinAdresse = out.filter((j) => j.platform === "leboncoin" || j.platform === "beebs");
      if (besoinAdresse.length) {
        const { data: prof } = await userClient
          .from("profiles").select("platform_settings").eq("id", user.id).maybeSingle();
        const reglages = String(
          ((prof?.platform_settings as Record<string, Record<string, unknown>> | null)
            ?.leboncoin?.adresse ?? "") as string,
        ).trim();
        if (reglages) {
          let rafraichies = 0;
          for (const j of besoinAdresse) {
            const pf = (j.platform_fields as Record<string, unknown> | null) ?? {};
            if (String(pf["adresse"] ?? "").trim() === reglages) continue;
            j.platform_fields = { ...pf, adresse: reglages, adresse_source: "reglages" };
            rafraichies++;
          }
          if (rafraichies) {
            console.log(`[get-pending-jobs] userId=${user.id} → adresse de remise rafraîchie depuis les Réglages sur ${rafraichies} job(s)`);
          }
        }
      }
    } catch (_e) { /* l'adresse fraîche est un confort : jamais un point de panne */ }

    // ══ BEEBS : LA VALEUR PART DANS L'ORTHOGRAPHE DE BEEBS, ET SUR LE CHAMP
    //    QUI LA RÉCLAME (2026-09-08) ═════════════════════════════════════════
    // CE QUI SE PASSAIT, relevé dans platform_fields.warnings des jobs bloqués :
    //   · job 500c04c6 (soutien-gorge Darjeeling) — la fiche porte « 85 G », la
    //     catégorie posée a DEUX champs « Taille » : le 1er en XXXS/30…, le 2nd
    //     en 75A…95L. La valeur EXISTE, dans le second, écrite « 85G ». La
    //     cascade de l'extension compare sans accent ni ponctuation mais AVEC
    //     les espaces : « 85 G » ne matche « 85G » sur AUCUN des deux. Les deux
    //     champs restent vides, le needsUser désigne le 1er, la réponse de la
    //     vendeuse atterrit sur le 1er, et le 2ᵉ redemande — la boucle.
    //   · cas fondateur du 06/09 (Joséphine, chemises homme) : même forme, deux
    //     « Taille » dont l'une est le col.
    // Ce bloc re-ÉPELLE la valeur du job dans l'orthographe du catalogue et la
    // ROUTE vers le champ homonyme quand c'est lui qui l'accepte. Il ne CHOISIT
    // jamais : sans correspondance sûre, il ne pose rien et le job continue de
    // demander à l'utilisateur (cf. _shared/beebs-valeurs.ts pour les garde-fous).
    //
    // CANAL : platform_fields.beebsAspects et les clés racines dédiées
    // (taille, marque, etat…) — ceux que l'extension 0.6.20 lit DÉJÀ en
    // production. Aucun octet d'extension ne change, et rien n'est réécrit en
    // base : on ne fait que servir la valeur bien écrite.
    // ⚠️ Ce n'est PAS republish_user_fields : ce canal-là n'est lu que par
    // l'étape de capture des REPUBLICATIONS Vinted (background.js), jamais par
    // le remplissage d'un formulaire Beebs. L'y écrire n'aurait rien changé.
    try {
      const beebsServis = out.filter((j) => j.platform === "beebs" && j.action === "publish");
      const cats = [...new Set(
        beebsServis
          .map((j) => categorieDuJob((j.platform_fields ?? {}) as Record<string, unknown>))
          .filter((c): c is string => Boolean(c)),
      )];
      if (cats.length) {
        const { data: rows } = await userClient
          .from("platform_category_aspects")
          .select("category_key, field_key, field_label, required, allowed_values")
          .eq("platform", "beebs")
          .in("category_key", cats);
        const parCategorie = new Map<string, AspectRow[]>();
        for (const r of (rows ?? []) as AspectRow[]) {
          const liste = parCategorie.get(r.category_key) ?? [];
          liste.push(r);
          parCategorie.set(r.category_key, liste);
        }
        let traduits = 0;
        // platform_fields TEL QU'IL EST EN BASE, avant nos poses de service :
        // c'est LUI que l'arbitrage IA persistera, jamais la version enrichie
        // (un canal dédié coupé vaut "" en mémoire — l'écrire en base
        // effacerait pour de bon la taille du job).
        const pfEnBase = new Map<string, Record<string, unknown>>();
        const resultats = new Map<string, ReturnType<typeof rapprocherValeursBeebs>>();
        for (const j of beebsServis) {
          const pf = (j.platform_fields ?? {}) as Record<string, unknown>;
          pfEnBase.set(j.id, pf);
          const cat = categorieDuJob(pf);
          if (!cat) continue;
          const r = rapprocherValeursBeebs(pf, parCategorie.get(cat) ?? []);
          resultats.set(j.id, r);
          if (!r.posees.length) continue;
          const aspectsCourants = (pf["beebsAspects"] ?? {}) as Record<string, unknown>;
          j.platform_fields = {
            ...pf,
            ...r.racines,
            ...(Object.keys(r.aspects).length
              ? { beebsAspects: { ...aspectsCourants, ...r.aspects } }
              : {}),
            // Trace : quelle valeur a été posée sur quel champ, et par quelle
            // méthode. C'est ce qui permettra de mesurer après coup, en SQL,
            // ce que le rapprochement a réellement débloqué.
            beebs_valeurs_posees: r.posees,
          };
          traduits++;
          console.log(
            `[get-pending-jobs] job ${j.id} (beebs) : ` +
            r.posees.map((p) => `${p.champ} ← "${p.valeur_posee}" (${p.methode}, depuis "${p.valeur_source}")`).join(" ; "),
          );
        }
        if (traduits) {
          console.log(`[get-pending-jobs] userId=${user.id} : valeurs Beebs rapprochées du catalogue sur ${traduits} job(s)`);
        }

        // ══ (d) L'IA TRANCHE DANS LA LISTE FERMÉE — DÉPANNAGE SERVEUR ═══════
        // Le déterministe ne sait que ré-épeler. Ce qui reste — une valeur que
        // la liste n'a pas sous cette forme, ou un champ obligatoire que la
        // fiche ne renseigne pas — est envoyé à resolve-categorie (mode
        // `listes`), qui fait choisir DANS la liste et n'accepte en retour
        // qu'une clé de la liste envoyée. « aucune » est une réponse légitime.
        //
        // BORNES, toutes tenues ici :
        //   · UN SEUL appel par poll, sur UN SEUL job — le premier qui en a
        //     besoin. Les autres passent au poll suivant ;
        //   · 4 champs au plus dans cet appel (l'IA les traite ensemble) ;
        //   · 6 s puis on abandonne : servir la file passe avant tout ;
        //   · la réponse est REVÉRIFIÉE ici contre allowed_values — le module
        //     serveur vérifie déjà, on ne s'en remet pas à lui pour autant ;
        //   · le verdict est PERSISTÉ, « aucune » compris : on ne repose jamais
        //     deux fois la même question, donc pas un appel par poll ;
        //   · jamais sur un appel d'AFFICHAGE (le popup demande needs_user /
        //     processing pour montrer, pas pour exécuter) ;
        //   · jamais si l'extension qui poll sait déjà le faire elle-même.
        // Le JWT de l'utilisateur est transmis : le garde-fou de volume et le
        // coût s'imputent à son compte, comme pour la catégorie.
        const arbitrageOuvert = !includeNeedsUser && !includeProcessing
          && !versionAuMoins(version, BEEBS_IA_VERSION_EXTINCTION);
        if (arbitrageOuvert) {
          for (const j of beebsServis) {
            const pfOrigine = pfEnBase.get(j.id) ?? {};
            const cat = categorieDuJob(pfOrigine);
            if (!cat) continue;
            const deja = resultats.get(j.id) ?? { racines: {}, aspects: {}, posees: [] };
            const tranchesAvant = (pfOrigine["beebs_ia_valeurs"] ?? {}) as Record<string, unknown>;
            const champs = champsArbitrablesBeebs(
              pfOrigine, parCategorie.get(cat) ?? [], deja, tranchesAvant,
            ).slice(0, 4);
            if (!champs.length) continue;

            const listes: Record<string, { plateforme: string; options: string[] }> = {};
            for (const c of champs) listes[c.field_key] = { plateforme: "beebs", options: c.options };
            const attributs: Record<string, unknown> = { categorie_beebs: cat };
            for (const [libelle, cle] of Object.entries(BEEBS_CHAMPS_DEDIES)) {
              const v = String(pfOrigine[cle] ?? "").trim();
              if (v) attributs[libelle.toLowerCase()] = v;
            }

            const ctrl = new AbortController();
            const minuteur = setTimeout(() => ctrl.abort(), 6000);
            let valeurs: Record<string, string> = {};
            try {
              const rep = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/resolve-categorie`, {
                method: "POST",
                signal: ctrl.signal,
                headers: {
                  "Content-Type": "application/json",
                  Authorization: authHeader,
                  apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
                },
                body: JSON.stringify({ titre: j.title ?? "", attributs, listes, user_id: user.id }),
              });
              if (rep.ok) {
                valeurs = ((await rep.json())?.valeurs ?? {}) as Record<string, string>;
              } else {
                console.warn(`[get-pending-jobs] arbitrage valeurs beebs : HTTP ${rep.status}`);
              }
            } catch (e) {
              console.warn(`[get-pending-jobs] arbitrage valeurs beebs indisponible : ${(e as Error)?.message ?? e}`);
            } finally {
              clearTimeout(minuteur);
            }

            const traceIa: Record<string, unknown> = { ...tranchesAvant };
            const racinesIa: Record<string, string> = {};
            const aspectsIa: Record<string, string> = {};
            const dits: string[] = [];
            for (const c of champs) {
              const brut = String(valeurs[c.field_key] ?? "").trim();
              // ⛔ REVÉRIFICATION : seule une valeur PRÉSENTE TELLE QUELLE dans
              // la liste envoyée est retenue. Tout le reste vaut « aucune ».
              const retenue = brut && c.options.includes(brut) ? brut : "";
              traceIa[c.field_key] = {
                valeur_source: c.valeur_source,
                valeur: retenue || null,
                n_options: c.options.length,
                at: new Date().toISOString(),
                ...(brut && !retenue ? { hors_liste: brut.slice(0, 80) } : {}),
              };
              if (!retenue) { dits.push(`${c.field_key} ← aucune`); continue; }
              if (c.cible.racine) racinesIa[c.cible.racine] = retenue;
              else if (c.cible.aspect) aspectsIa[c.cible.aspect] = retenue;
              dits.push(`${c.field_key} ← "${retenue}"`);
            }

            // Persistance : le verdict (y compris « aucune ») et les seules
            // poses de l'IA. Le rapprochement déterministe, lui, se recalcule
            // à chaque service et n'a rien à faire en base.
            const pfPersiste = {
              ...pfOrigine,
              ...racinesIa,
              ...(Object.keys(aspectsIa).length
                ? { beebsAspects: { ...((pfOrigine["beebsAspects"] ?? {}) as Record<string, unknown>), ...aspectsIa } }
                : {}),
              beebs_ia_valeurs: traceIa,
            };
            try {
              const admin = createClient(
                Deno.env.get("SUPABASE_URL")!,
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
              );
              // .eq('status','pending') : on ne réécrit JAMAIS par-dessus un job
              // qui vient de changer d'état (annulé, pris en charge).
              await admin.from("cross_post_jobs")
                .update({ platform_fields: pfPersiste })
                .eq("id", j.id).eq("status", "pending");
            } catch (e) {
              console.warn(`[get-pending-jobs] verdict IA non persisté (job ${j.id}) : ${(e as Error)?.message ?? e}`);
            }

            // Servi dans la foulée, par-dessus les poses déterministes.
            const servi = (j.platform_fields ?? {}) as Record<string, unknown>;
            j.platform_fields = {
              ...servi,
              ...racinesIa,
              ...(Object.keys(aspectsIa).length
                ? { beebsAspects: { ...((servi["beebsAspects"] ?? {}) as Record<string, unknown>), ...aspectsIa } }
                : {}),
              beebs_ia_valeurs: traceIa,
            };
            console.log(
              `[get-pending-jobs] job ${j.id} (beebs) : liste fermée arbitrée — ${dits.join(" ; ")}`,
            );
            break; // UN job par poll, quoi qu'il arrive
          }
        }
      }
    } catch (_e) { /* le rapprochement ne doit JAMAIS empêcher de servir la file */ }

    // ══ « DÉJÀ EN LIGNE » POUR L'ARTICLE AFFICHÉ (2026-09-08, décision Nico) ══
    // La grille « Diffuser sur » du popup disait « Pas dans cet envoi » sur des
    // plateformes où l'article était en réalité DÉJÀ publié (Blouse blanche :
    // trois fois sur quatre). Deux sources, jamais confondues :
    //   · Vinted → inventaire.vinted_item_id de l'article, lu par l'embed du
    //     SELECT principal. Non nul = en ligne — sauf annonce disparue
    //     (disparu_le) ou masquée/brouillon (vinted_status hidden/draft) :
    //     l'expression unique de l'app (publicationState.js), un acheteur ne
    //     les voit pas.
    //   · Leboncoin / eBay / Beebs → cross_post_jobs, status = 'published'
    //     STRICTEMENT (deleted, cancelled, sold = plus en ligne), inventaire_id
    //     = l'article, par l'index partiel cross_post_jobs_inventaire (mesuré
    //     le 08/09 : Index Scan, 3-4 buffers, < 0,2 ms).
    // POPUP SEUL (include_needs_user), à l'ouverture : jamais dans la boucle de
    // poll. Lecture en échec → clé ABSENTE → la case garde son état actuel ;
    // « Déjà en ligne » n'est JAMAIS une valeur par défaut.
    // ⛔ PUREMENT INFORMATIF : rien ici ne filtre, ne retient ni ne décale un
    // job. La file servie (`out`) est la même, ligne pour ligne.
    let dejaEnLigne: { inventaire_id: string; plateformes: Record<string, boolean> } | null = null;
    // « Déjà en file » (2026-09-10) : plateformes ou un job VIVANT existe deja
    // pour ce meme article. Sœur de dejaEnLigne, jamais melangee avec elle.
    let enFileParPlateforme: Record<string, boolean> | null = null;
    if (includeNeedsUser) {
      try {
        // Le MÊME choix d'article que le popup (firstAnnonce) : jobs de dépôt
        // (ni delete, ni republish, ni needs_user), groupés par article dans
        // l'ordre servi, premier groupe sans ligne en cours, sinon le premier.
        // Le popup ne se fie qu'à l'inventaire_id renvoyé : un désaccord de
        // choix ne peut produire qu'une case inchangée, jamais une fausse.
        const depots = out.filter((j) => j.action !== "delete" && j.action !== "republish" && j.status !== "needs_user");
        const groupes = new Map<string, typeof depots>();
        for (const j of depots) {
          const cle = j.inventaire_id != null ? `inv:${j.inventaire_id}` : `title:${j.title || j.id}`;
          if (!groupes.has(cle)) groupes.set(cle, []);
          groupes.get(cle)!.push(j);
        }
        const listes = [...groupes.values()];
        const groupe = listes.find((g) => !g.some((j) => j.status === "processing")) ?? listes[0];
        const tete = groupe?.[0] ?? null;
        if (tete && tete.inventaire_id != null) {
          const plateformes: Record<string, boolean> = {};
          const article = (tete as {
            inventaire?: { vinted_item_id?: unknown; disparu_le?: unknown; vinted_status?: unknown } | null;
          }).inventaire;
          // undefined = embed absent (relecture sans embed) → Vinted non mesuré,
          // on ne dit rien. null = ligne d'inventaire introuvable → pas en ligne.
          if (article !== undefined) {
            plateformes.vinted = article != null
              && article.vinted_item_id != null
              && article.disparu_le == null
              && !["hidden", "draft"].includes(String(article.vinted_status ?? ""));
          }
          const { data: pubs, error: pubsErr } = await userClient
            .from("cross_post_jobs")
            .select("platform")
            .eq("inventaire_id", tete.inventaire_id)
            .in("platform", ["leboncoin", "ebay", "beebs"])
            .eq("status", "published");
          if (!pubsErr) {
            const vues = new Set((pubs ?? []).map((p) => String(p.platform)));
            for (const pf of ["leboncoin", "ebay", "beebs"]) plateformes[pf] = vues.has(pf);
          } else {
            console.warn(`[get-pending-jobs] déjà en ligne : lecture cross_post_jobs refusée (${pubsErr.message}) — cases inchangées`);
          }

          // ── « DÉJÀ EN FILE » (2026-09-10, boardshort de geronimo) ──────────
          // CE QUI S'EST PASSÉ : son job Leboncoin du 05/09 est resté PENDING
          // QUATRE JOURS (extension éteinte). Le 06/09 il a regénéré l'annonce
          // — nouveau titre — et un SECOND job est né pour le même article. Le
          // 09/09 l'extension a vidé la file : les deux sont partis, à onze
          // minutes d'écart, et il a aujourd'hui le même boardshort en vente
          // deux fois sur Leboncoin (3266347704 et 3266354336, 25 € chacun).
          // La case « déjà en ligne » ci-dessus ne pouvait rien y faire : elle
          // n'interroge que `status = 'published'`, et le premier job n'était
          // pas publié — il ATTENDAIT. On mesure donc aussi les jobs VIVANTS.
          // DÉCLENCHEUR RÉEL : une file longue. Tant qu'il y a des comptes dont
          // l'extension ne tourne pas, le cas se reproduira — mesuré sur tout
          // le parc au 10/09 : 2 articles concernés (geronimo, Carla), pas plus.
          //
          // ⛔ INFORMATIF, comme la case ci-dessus : rien ici ne filtre, ne
          // retient ni ne décale un job. La file servie est la même, ligne pour
          // ligne. L'utilisateur VOIT « déjà en file » et ne recrée pas le job —
          // c'est l'information qui évite le doublon, jamais un mur silencieux.
          // ⛔ NI republish NI delete : une republication est un cycle NORMAL,
          //    pas un doublon. `action = 'publish'` strictement.
          // ⛔ Ni 'cancelled' ni 'failed' : un job mort ne retient rien. Une
          //    relance manuelle repasse en 'pending' et compte alors comme
          //    vivante, ce qui est vrai — et reste informatif, donc elle n'est
          //    jamais empêchée.
          // ⛔ Les jobs SERVIS dans ce même cycle sont exclus : ils sont déjà
          //    représentés par leur propre état dans le popup, se compter
          //    soi-même afficherait « déjà en file » sur l'envoi en cours.
          const enFile: Record<string, boolean> = {};
          const { data: vivants, error: vivErr } = await userClient
            .from("cross_post_jobs")
            .select("id, platform")
            .eq("inventaire_id", tete.inventaire_id)
            .in("platform", ["vinted", "leboncoin", "ebay", "beebs"])
            .eq("action", "publish")
            .in("status", ["pending", "processing", "needs_user"]);
          if (!vivErr) {
            const servis = new Set(out.filter((j) => j.inventaire_id === tete.inventaire_id).map((j) => String(j.id)));
            const enCours = new Set(
              (vivants ?? []).filter((v) => !servis.has(String(v.id))).map((v) => String(v.platform)),
            );
            for (const pf of ["vinted", "leboncoin", "ebay", "beebs"]) {
              if (enCours.has(pf)) enFile[pf] = true;
            }
          } else {
            console.warn(`[get-pending-jobs] déjà en file : lecture refusée (${vivErr.message}) — clé absente, aucune case par défaut`);
          }
          // Champ SŒUR de `plateformes`, jamais une clé DANS lui : le popup
          // actuel lit `plateformes[<clé plateforme>]` et ignore ce qu'il ne
          // connaît pas. Une 0.6.25 n'en verra donc rien changer — c'est la
          // 0.6.26 qui affichera « déjà en file ». Aucune régression possible.
          if (Object.keys(enFile).length) enFileParPlateforme = enFile;
          if (Object.keys(plateformes).length) {
            dejaEnLigne = { inventaire_id: String(tete.inventaire_id), plateformes };
          }
        }
      } catch (_e) { dejaEnLigne = null; /* informatif : jamais un point de panne */ }
    }

    // ── DESCRIPTION LEBONCOIN SANS MENTION D'UN AUTRE SITE (2026-09-09) ──────
    // Leboncoin refuse en 403 (POST adsubmit/v2/classifieds, champ body) toute
    // description qui mentionne un autre site — un simple « #VintedStyle »
    // suffit (mesuré sur le compte de Nico, job 8fea6e80) — et la description
    // Vinted de la vendeuse part telle quelle sur Leboncoin (verrou
    // anti-réécriture du 07/09, VOULU : elle porte les défauts). On nettoie
    // ICI le texte SERVI à l'extension, liste fermée et règle déterministe
    // (_shared/description-leboncoin.ts) ; le job en base n'est pas modifié,
    // l'IA n'y touche pas. Best-effort : une exception laisse la description
    // telle quelle. `description_nettoyage` dit à l'extension ce qui est parti
    // (informatif ; les versions qui ne le lisent pas l'ignorent).
    let nettoyagesLbc = 0;
    try {
      for (const j of out as unknown as Array<Record<string, unknown>>) {
        if (j.platform !== "leboncoin" || j.action !== "publish" || typeof j.description !== "string") continue;
        // Contexte (2026-09-10) : la marque de l'article et le titre — les deux
        // règles de la page de correction Leboncoin (5 hashtags max, aucune
        // marque tierce) en ont besoin ; cf. _shared/description-leboncoin.ts.
        const pfJ = (j.platform_fields ?? {}) as Record<string, unknown>;
        const r = nettoyerDescriptionLeboncoin(j.description, {
          titre: typeof j.title === "string" ? j.title : "",
          marque: typeof pfJ["marque"] === "string" ? (pfJ["marque"] as string) : "",
          // Faits DÉJÀ sur le job, pour atteindre le minimum de 10 caractères
          // que Leboncoin impose à une description non vide (2026-09-10).
          // On ne lit rien d'autre : ce qui n'est pas là n'est pas inventé.
          etat: typeof pfJ["etat"] === "string" ? (pfJ["etat"] as string) : "",
          taille: typeof pfJ["taille"] === "string" ? (pfJ["taille"] as string) : "",
        });
        if (r.vide) console.warn(`[get-pending-jobs] description Leboncoin ${String(j.id).slice(0, 8)} : le nettoyage aurait tout effacé — servie telle quelle`);
        if (!r.modifiee) continue;
        j.description = r.texte;
        j.description_nettoyage = {
          termes: r.termes, retires: r.retires, marques: r.marques, plafonnes: r.plafonnes,
          // Trace du minimum de 10 caractères, même forme que le nettoyage :
          // ce qui a été ajouté, ou le fait qu'on ait servi le champ vide.
          ...(r.complete?.length ? { complete: r.complete } : {}),
          ...(r.videe_trop_courte ? { videe_trop_courte: true } : {}),
        };
        if (r.complete?.length) {
          console.log(`[get-pending-jobs] description Leboncoin ${String(j.id).slice(0, 8)} : ${r.texte.length} car. après complément (${r.complete.join(" + ")}) — minimum Leboncoin de 10`);
        }
        if (r.videe_trop_courte) {
          console.warn(`[get-pending-jobs] description Leboncoin ${String(j.id).slice(0, 8)} : trop courte et rien de connu à ajouter — champ SERVI VIDE (accepté par Leboncoin) plutôt qu'un Continuer inerte`);
        }
        nettoyagesLbc++;
      }
      if (nettoyagesLbc) console.log(`[get-pending-jobs] user=${user.id} descriptions Leboncoin nettoyées : ${nettoyagesLbc}`);
    } catch (e) {
      console.warn(`[get-pending-jobs] nettoyage description Leboncoin : ${String((e as Error)?.message ?? e)} — descriptions servies telles quelles`);
    }

    // ── TITRE VINTED : TROP DE MAJUSCULES (2026-09-11, job f3a5dce8 Ornella) ──
    // Vinted refuse en 400 « Le titre contient trop de lettres majuscules » —
    // un seul mot en capitales suffit (« BOURSIC », 25 % de l'ensemble). La
    // génération tempère depuis le 08/09 22:21 (78a185a, redaction-plateformes)
    // mais un job créé AVANT garde son titre tel quel : le relancer refait le
    // 400, quel que soit le build. Même règle, même fonction
    // (_shared/titre-majuscules.ts), appliquée ICI au titre SERVI — le job en
    // base n'est pas modifié, comme la description Leboncoin ci-dessus.
    // Périmètre : publish Vinted seulement. Une REPUBLICATION porte le titre
    // CAPTURÉ sur l'annonce (accepté par Vinted à l'époque) : on n'y touche pas.
    // Idempotent (un titre déjà tempéré ressort identique), best-effort (une
    // exception laisse les titres tels quels). `title_servi_tempere` dit à
    // l'extension ce qui est parti — informatif, ignoré par qui ne le lit pas.
    let titresTemperes = 0;
    try {
      for (const j of out as unknown as Array<Record<string, unknown>>) {
        if (j.platform !== "vinted" || j.action !== "publish" || typeof j.title !== "string") continue;
        const pfJ = (j.platform_fields ?? {}) as Record<string, unknown>;
        const tempere = tempererMajuscules(j.title, typeof pfJ["marque"] === "string" ? (pfJ["marque"] as string) : null);
        if (tempere === j.title) continue;
        console.log(`[get-pending-jobs] titre Vinted ${String(j.id).slice(0, 8)} tempéré (majuscules) : « ${j.title} » → « ${tempere} »`);
        j.title_servi_tempere = { avant: j.title, apres: tempere, motif: "majuscules" };
        j.title = tempere;
        titresTemperes++;
      }
      if (titresTemperes) console.log(`[get-pending-jobs] user=${user.id} titres Vinted tempérés (majuscules) : ${titresTemperes}`);
    } catch (e) {
      console.warn(`[get-pending-jobs] tempérage des titres Vinted : ${String((e as Error)?.message ?? e)} — titres servis tels quels`);
    }

    // ── « UNIVERS » ET « PRODUIT » LEBONCOIN : À NOUS DE LES POSER (2026-09-11) ──
    // Relevé live du formulaire (/deposer-une-annonce, compte Nico, rien
    // déposé) : « Univers » est un combobox REQUIS de l'étape « Dites-nous en
    // plus », liste RENDUE DANS LE DOM (aucune réponse réseau ne la sert ; la
    // seule requête, ad-prediction/v2/public/adparams, PRÉDIT le type de
    // vêtement d'après le titre, pas l'univers) :
    //   Mode > Vêtements   clothing_type  → Femme · Maternité · Homme · Enfant
    //   Mode > Chaussures  shoe_type      → Femme · Homme · Enfant
    // Les autres « Univers » (Sport & Plein air = discipline, Décoration =
    // famille d'objet, Équipement bébé…) NE SONT PAS des genres : on n'y
    // touche pas. « Produit » (Décoration, decoration_type) DÉPEND de l'univers
    // choisi ; relevé du 07/09 (lbcMaisonJardin) : univers « Autre » → la liste
    // ne contient QUE « Autre ».
    // Le mal (4 jobs, 16 sur 30 j / 8 comptes) : l'app pose l'univers de l'IA
    // (« Mixte », « Fille », « Garçon ») ou rien, le handler ne trouve pas
    // l'option, needs_user « Compléter ces champs dans l'app » — pour une
    // valeur qu'on SAIT. Ici, SERVEUR, sans zip, sur le job SERVI (jamais
    // d'écriture en base : l'extension renvoie le pf au statut suivant, comme
    // pour la description) — même point de passage que le nettoyage LBC.
    // ⛔ SOURCES CERTAINES SEULEMENT (même doctrine que familleCategorie.js) :
    //   1. valeur déjà posée si elle est dans la liste (Fille/Garçon/Bébé/
    //      Junior → Enfant, Femmes → Femme, Hommes → Homme : des synonymes
    //      exacts, pas une devinette) ;
    //   2. la RACINE du chemin Vinted du même article (job Vinted publié en
    //      priorité, sinon capturé/en file) : Femmes → Femme, Hommes → Homme,
    //      Enfants → Enfant — c'est la catégorie que Vinted a acceptée ;
    //   3. une taille d'ÂGE (« 3 ans », « 6 mois », « 92 cm ») → Enfant.
    //   Jamais le titre, jamais l'icône IA, jamais le genre de l'IA. Rien de
    //   certain → on ne pose RIEN, le needs_user reste avec la liste relevée.
    // ⛔ « Produit » : posé UNIQUEMENT quand la liste dépendante ne contient
    //   qu'une valeur (Décoration + univers « Autre » → « Autre »). Toute liste
    //   à choix réel = incertain = rien.
    // ⛔ Le chemin de dépôt, le plafond de 5 mots-clés et le nettoyage de
    //   description ne bougent pas.
    let lbcDeduits = 0;
    try {
      const UNIVERS_PAR_FEUILLE: Record<string, string[]> = {
        "Mode > Vêtements": ["Femme", "Maternité", "Homme", "Enfant"],
        "Mode > Chaussures": ["Femme", "Homme", "Enfant"],
      };
      const SYNONYMES_UNIVERS: Record<string, string> = {
        femme: "Femme", femmes: "Femme", homme: "Homme", hommes: "Homme",
        enfant: "Enfant", enfants: "Enfant", fille: "Enfant", garçon: "Enfant", garcon: "Enfant",
        bébé: "Enfant", bebe: "Enfant", junior: "Enfant", maternité: "Maternité", maternite: "Maternité",
      };
      const RACINE_VINTED: Record<string, string> = { femmes: "Femme", hommes: "Homme", enfants: "Enfant" };
      const TAILLE_AGE_RE = /^\s*\d{1,2}\s*(ans?|mois)\b|^\s*\d{2,3}\s*cm\b/i;
      const normaliser = (v: unknown): string | null => {
        const s = String(v ?? "").trim().toLowerCase();
        return s ? (SYNONYMES_UNIVERS[s] ?? null) : null;
      };
      for (const j of out as unknown as Array<Record<string, unknown>>) {
        if (j.platform !== "leboncoin" || j.action !== "publish") continue;
        const pf = (j.platform_fields && typeof j.platform_fields === "object")
          ? (j.platform_fields as Record<string, unknown>) : null;
        if (!pf) continue;
        const chemin = Array.isArray(pf.lbcCategoryPath) ? (pf.lbcCategoryPath as unknown[]).map((s) => String(s)).join(" > ") : "";
        const trace: Record<string, unknown> = {};

        // ── Racine HORS de l'arbre Leboncoin = chemin invalide → incertain ──
        // (2026-09-12, job 35bd3f1c, ornellaracano : « **Univers**
        // (`accessories_univers`) > Enfant », une ligne de relevé prise pour une
        // catégorie par l'arbre généré ; le handler échouait en dur « racine
        // introuvable »). Sur le job SERVI : le chemin est flagué INCERTAIN,
        // et le handler (0.6.26+) prend la suggestion que Leboncoin déduit du
        // titre, arbitrée par l'IA — le chemin existant pour une catégorie
        // incertaine. Le chemin n'est pas réécrit (rien d'inventé) ; la trace
        // lbc_chemin_invalide est persistée par l'extension au statut suivant.
        // L'arbre est corrigé à la source (gen-arbres-feuilles.mjs) : ce filet
        // ne joue que sur un job déjà en file ou une régression future.
        const RACINES_LBC = new Set(["Immobilier", "Véhicules", "Matériel professionnel", "Électronique", "Maison & Jardin", "Famille", "Mode", "Loisirs", "Animaux", "Locations de vacances", "Emploi", "Services", "Divers"]);
        const racineLbc = Array.isArray(pf.lbcCategoryPath) && (pf.lbcCategoryPath as unknown[]).length
          ? String((pf.lbcCategoryPath as unknown[])[0]).trim() : "";
        if (racineLbc && !RACINES_LBC.has(racineLbc) && pf.lbcCategorieIncertaine !== true) {
          pf.lbcCategorieIncertaine = true;
          pf.categorie_incertaine = true;
          pf.lbc_chemin_invalide = {
            chemin: pf.lbcCategoryPath,
            motif: `racine « ${racineLbc} » absente de l'arbre Leboncoin (13 racines)`,
            effet: "catégorie flaguée incertaine : la suggestion Leboncoin arbitrée par l'IA prime",
            le: new Date().toISOString(),
            pose_par: "get-pending-jobs",
          };
          trace.chemin_invalide = { valeur: "incertaine", source: `racine « ${racineLbc} » hors des 13 racines Leboncoin` };
        }

        // ── Univers (Mode > Vêtements / Mode > Chaussures seulement) ──────
        const liste = UNIVERS_PAR_FEUILLE[chemin];
        if (liste) {
          const actuel = String(pf.univers ?? "").trim();
          if (!liste.includes(actuel)) {
            let valeur: string | null = null;
            let source: string | null = null;
            const synonyme = normaliser(pf.univers) ?? normaliser(pf.genre);
            if (synonyme && liste.includes(synonyme)) {
              valeur = synonyme; source = `synonyme exact de « ${actuel || String(pf.genre ?? "")} »`;
            }
            if (!valeur && j.inventaire_id != null) {
              const { data: freres } = await userClient
                .from("cross_post_jobs")
                .select("status, platform_fields")
                .eq("inventaire_id", j.inventaire_id as number)
                .eq("platform", "vinted")
                .eq("action", "publish")
                .order("created_at", { ascending: false })
                .limit(10);
              const ordre = ["published", "sold", "cancelled", "processing", "pending", "needs_user", "failed"];
              const tries = (freres ?? []).slice().sort((a, b) => ordre.indexOf(String(a.status)) - ordre.indexOf(String(b.status)));
              for (const f of tries) {
                const chemV = (f.platform_fields as Record<string, unknown> | null)?.categoryPath;
                const racine = Array.isArray(chemV) && chemV.length ? String(chemV[0]).trim().toLowerCase() : "";
                const v = RACINE_VINTED[racine];
                if (v && liste.includes(v)) { valeur = v; source = `racine du chemin Vinted du même article (${(chemV as unknown[]).join(" > ")}, job ${f.status})`; break; }
              }
            }
            if (!valeur && TAILLE_AGE_RE.test(String(pf.taille ?? "")) && liste.includes("Enfant")) {
              valeur = "Enfant"; source = `taille d'âge « ${String(pf.taille).trim()} »`;
            }
            if (valeur) {
              trace.univers = { valeur, avant: actuel || null, source };
              pf.univers = valeur;
            } else {
              console.log(`[get-pending-jobs] univers Leboncoin ${String(j.id).slice(0, 8)} (${chemin}) : « ${actuel || "vide"} » hors liste et aucune source certaine — rien posé`);
            }
          }
        }

        // ── Produit (Maison & Jardin > Décoration, univers « Autre » → « Autre ») ──
        if (chemin === "Maison & Jardin > Décoration" && String(pf.univers ?? "").trim() === "Autre") {
          const aspects = (pf.lbcAspects && typeof pf.lbcAspects === "object") ? (pf.lbcAspects as Record<string, unknown>) : {};
          if (!String(aspects.decoration_type ?? "").trim()) {
            pf.lbcAspects = { ...aspects, decoration_type: "Autre" };
            if (!String(pf.lbcProduit ?? "").trim()) pf.lbcProduit = "Autre";
            trace.produit = { valeur: "Autre", source: "liste dépendante à une seule valeur (Décoration, univers « Autre »)" };
          }
        }

        if (Object.keys(trace).length) {
          pf.lbc_deduit = { ...trace, le: new Date().toISOString(), pose_par: "get-pending-jobs (sources certaines)" };
          lbcDeduits++;
          console.log(`[get-pending-jobs] Leboncoin ${String(j.id).slice(0, 8)} (${chemin}) : ${Object.entries(trace).map(([k, v]) => `${k} ← « ${(v as Record<string, unknown>).valeur} » (${(v as Record<string, unknown>).source})`).join(" ; ")}`);
        }
      }
      if (lbcDeduits) console.log(`[get-pending-jobs] user=${user.id} Univers/Produit Leboncoin posés par déduction : ${lbcDeduits}`);
    } catch (e) {
      console.warn(`[get-pending-jobs] déduction Univers/Produit Leboncoin : ${String((e as Error)?.message ?? e)} — jobs servis tels quels`);
    }

    // ── TAILLE VINTED SANS CORRESPONDANCE : OPTION NEUTRE, EN REPRISE ───────
    // (2026-09-12, LOT A — remplace le filet du même matin qui RETIRAIT la
    // taille sous « Jeux et jouets ».)
    //
    // a1 — LE POSTULAT EST RETIRÉ. Le filet précédent supprimait `taille` de
    // tout job Vinted en reprise sous « Jeux et jouets », au motif « la taille
    // n'est pas requise sur cette branche » (b21e89d4, 14/08, 0.6.2). DÉMENTI
    // EN RÉEL le 12/09 sur le job 0259e920 (ornellaracano, « Disney Poupée
    // peluche Anna … 59 cm », Enfants > Jeux et jouets > Peluches) : servi
    // SANS taille à 10:46, Vinted l'a EXIGÉE quand même et le job est reparti
    // en needs_user. Le catalogue d'aspects relevé en live le confirme : sur
    // les 37 feuilles Vinted où un champ Taille a été observé, 36 sont
    // `required = true`, « Peluches » comprise (relevé du 12/09) ; le « non
    // requis » venait de « Jeux de construction », relevé le 20/07 — le
    // formulaire a changé depuis. Retirer la taille ne faisait que changer le
    // message d'échec, jamais publier. Plus rien n'est retiré ici : sans
    // correspondance, l'extension s'arrête et nomme la cause (point 8 du
    // 15/08, intact — c'est lui qui protège les robes servies en « Housses de
    // couette »).
    //
    // a2 — OPTION NEUTRE, LUE DANS LA LISTE SERVIE, EN REPRISE SEULEMENT.
    // Quand aucune option ne correspond même approximativement, la bonne
    // valeur n'est ni le champ vide (refusé par Vinted, mesuré le 12/09) ni le
    // cm le plus proche (« 59 cm » → « 1-3 mois / 56 cm » : une taille de bébé
    // affichée sur une peluche, publiée et visible par l'acheteur) : c'est
    // l'option NEUTRE que Vinted propose lui-même. Prouvé sur cette feuille —
    // 0259e920 publié à 11:09 avec « Taille unique », comme b58d53a5,
    // 70e3f02e et 6e8cea7a avant lui.
    //
    // ⚠️ LE PREMIER PASSAGE RESTE UN ALLER-RETOUR, ET C'EST ASSUMÉ : la liste
    // réellement servie n'existe qu'au remplissage, dans le DOM (panneau à SIX
    // onglets — S/M/L, EU, UK, FR, IT, US — dont seul l'actif est présent :
    // 17-18 options, jamais les 103 de la config). Le serveur ne la connaît
    // qu'en REPRISE, par `needsUserField.allowed_values` écrit au passage
    // précédent. Le premier dépôt d'un article neuf repassera donc par
    // needs_user (lot B, côté extension, gelé tant que la 0.6.32 est en review).
    //
    // LA PORTE — mesurée sur les 11 jobs de 30 jours tombés sur ce motif :
    // 4 doivent passer, 7 doivent CONTINUER de bloquer. Quatre verrous :
    //   1. reprise : needsUserField.field_key === 'size' ET allowed_values ;
    //   2. catégorie CERTAINE (même liste que vinted.js) — une catégorie
    //      déduite d'une icône ou choisie par l'IA parmi des candidats n'ouvre
    //      jamais cette porte : sur ces cas-là le problème est la CATÉGORIE,
    //      pas la valeur, et la masquer publierait une annonce fausse ;
    //   3. feuille HORS branche vestimentaire — jupe « 42 » (Femmes >
    //      Vêtements > Jupes), pull Lacoste « FR 6 » (Hommes > Vêtements) :
    //      l'article a une taille RÉELLE, une valeur neutre y mentirait et
    //      l'acheteur filtre dessus ;
    //   4. l'article n'a pas de taille de vêtement : `taille` vide, ou
    //      dimension BRUTE (nombre + unité de longueur — « 59 cm » oui,
    //      « 42 » non, « S / 36 / 8 » non).
    // Aucune écriture en base : seul le job SERVI est modifié, comme le filet
    // précédent. La valeur posée est TOUJOURS celle lue dans la liste, jamais
    // une chaîne écrite ici — si aucune option neutre n'y figure, on ne pose
    // rien et le job part inchangé (feuille « Maison > Textiles > Linge de lit
    // > Taies d'oreiller », 14 options toutes en cm, est le cas connu).
    //
    // Libellés neutres reconnus, comparés en ÉGALITÉ STRICTE après
    // normalisation (accents retirés, casse et espaces réduits). Ils servent à
    // RECONNAÎTRE une option dans la liste, jamais à en fabriquer une.
    const LIBELLES_NEUTRES = new Set(["taille unique", "one size", "unique", "taille u"]);
    const normaliseLibelle = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
    // Sources de catégorie CERTAINES — copie de la liste de vinted.js.
    const SOURCES_CATEGORIE_CERTAINES = new Set([
      "mot_objet_arbre", "mot_cle_arbre", "catalog_vinted", "correction_manuelle",
    ]);
    // Segments d'arbre où l'article porte une taille de vêtement réelle.
    const estSegmentVestimentaire = (seg: string) => {
      const s = normaliseLibelle(seg);
      return s.startsWith("vetements") || s === "chaussures"
        || s.startsWith("lingerie") || s.startsWith("maillots de bain");
    };
    // Dimension BRUTE : un nombre suivi d'une unité de longueur, rien d'autre.
    const DIMENSION_BRUTE = /^\d+([.,]\d+)?\s*(cm|mm|m)$/i;
    try {
      let neutresPosees = 0;
      for (const j of out as unknown as Array<Record<string, unknown>>) {
        if (j.platform !== "vinted" || j.action !== "publish") continue;
        const pf = (j.platform_fields && typeof j.platform_fields === "object")
          ? (j.platform_fields as Record<string, unknown>) : null;
        if (!pf) continue;

        // 1. REPRISE : Vinted a exigé la taille au passage précédent et nous a
        //    servi sa liste. Au premier passage, `needsUserField` est absent.
        const nuf = (pf.needsUserField && typeof pf.needsUserField === "object")
          ? (pf.needsUserField as Record<string, unknown>) : null;
        if (!nuf || String(nuf.field_key ?? "") !== "size") continue;
        const liste = Array.isArray(nuf.allowed_values)
          ? (nuf.allowed_values as unknown[]).map((v) => String(v)).filter((v) => v.trim()) : [];
        if (!liste.length) continue;

        // 2. CATÉGORIE CERTAINE (point 8 du 15/08 : on ne masque jamais un
        //    doute de catégorie par une valeur de repli).
        const source = String(pf.categorie_source ?? "");
        if (!SOURCES_CATEGORIE_CERTAINES.has(source)) continue;

        // 3. FEUILLE HORS BRANCHE VESTIMENTAIRE.
        const chemin = Array.isArray(pf.categoryPath)
          ? (pf.categoryPath as unknown[]).map((s) => String(s)) : [];
        if (!chemin.length) continue;
        if (chemin.some(estSegmentVestimentaire)) continue;

        // 4. PAS DE TAILLE DE VÊTEMENT : vide, ou dimension brute.
        const taille = String(pf.taille ?? "").trim();
        if (taille && !DIMENSION_BRUTE.test(taille)) continue;

        // L'option neutre doit EXISTER dans la liste servie ; c'est elle,
        // telle quelle, qui est posée.
        const neutre = liste.find((opt) => LIBELLES_NEUTRES.has(normaliseLibelle(opt)));
        if (!neutre) continue;
        if (taille && normaliseLibelle(taille) === normaliseLibelle(neutre)) continue;

        const nowIso = new Date().toISOString();
        const warnings = Array.isArray(pf.warnings) ? (pf.warnings as unknown[]) : [];
        pf.taille = neutre;
        pf.taille_neutre_serveur = {
          valeur: neutre,
          remplace: taille || null,
          etape: "1_option_neutre",
          categorie: chemin.join(" > "),
          source_categorie: source,
          origine_liste: "needsUserField.allowed_values (liste servie par Vinted au passage précédent)",
          options: liste.length,
          le: nowIso,
          pose_par: "get-pending-jobs",
        };
        pf.warnings = [...warnings, {
          at: nowIso,
          code: "taille_neutre_serveur",
          champ: "taille",
          valeur: neutre,
          etape: "1_option_neutre",
          categorie: chemin.join(" > "),
          source_categorie: source,
          origine_liste: "needsUserField.allowed_values",
          message: `taille « ${neutre} » posée par le serveur (étape 1, option neutre) : `
            + `${taille ? `« ${taille} » ne correspond à aucune option de la grille` : "l'article ne porte aucune taille"}`
            + `, « ${chemin.join(" > ")} » n'est pas une branche vestimentaire et la catégorie est certaine (${source})`
            + ` — valeur LUE dans la liste servie par Vinted (${liste.length} options), jamais écrite en dur`,
        }];
        neutresPosees++;
        console.log(`[get-pending-jobs] Vinted ${String(j.id).slice(0, 8)} (${chemin.join(" > ")}) : taille ${taille ? `« ${taille} » → ` : "absente → "}« ${neutre} » (option neutre lue dans les ${liste.length} options servies)`);
      }
      if (neutresPosees) console.log(`[get-pending-jobs] user=${user.id} tailles Vinted posées à l'option neutre : ${neutresPosees}`);
    } catch (e) {
      console.warn(`[get-pending-jobs] option neutre de taille Vinted : ${String((e as Error)?.message ?? e)} — jobs servis tels quels`);
    }

    return json({
      jobs: out,
      annonces_en_attente: annoncesAttente,
      sync_command: syncCommand,
      sync_prioritaire: heldSync > 0,
      jobs_retenus_sync: heldSync,
      boutique_pause: boutiquePause,
      // beebs_interdits (2026-09-11) : dépôts passés en needs_user à ce poll
      // parce que l'article tombe sous les règles du catalogue Beebs.
      beebs_interdits: heldBeebsInterdit,
      // sessions_pause (2026-09-10) : par plateforme connue morte, combien de
      // jobs attendent, depuis quelle observation, et quel job sert de sonde.
      sessions_pause: sessionsPause,
      deja_en_ligne: dejaEnLigne,
      deja_en_file: enFileParPlateforme,
      contexte,
      plafond_republish: plafondRepublish,
      // creneau_republish (2026-09-12) : module planifié actif ? dans le
      // créneau ? sinon `reprise` = prochaine tentative (instant serveur).
      creneau_republish: creneauRepublish,
      jobs_retenus_creneau: heldCreneau,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[get-pending-jobs] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
