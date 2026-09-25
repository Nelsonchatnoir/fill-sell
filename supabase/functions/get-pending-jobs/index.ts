import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { etatDepuisCapture } from "../_shared/vinted-etat.ts";
import { sessionIdDuJwt, postesVivants, posteCourt, posteAvecAccesOpla, POSTE_TTL_MS, type Poste } from "../_shared/poste-extension.ts";
import { preuveAccesOpla } from "../_shared/preuve-opla.ts";
// (25/09) Ce que Vinted exige quel que soit le catalogue — la MÊME règle que le
// stepper (moteur/listes.js la ré-exporte) — et sa palette de couleurs (module
// de données sans import, comme leboncoinFeuilles.js plus bas).
import { vintedExigeUneCouleur, vintedExigeUneMarque, valeurUneLettre } from "../_shared/vinted-exigences.js";
import { classementAgeEcrit, familleJeuVideo, ageBeebsDuClassement, ageBeebsJeuVideoLu } from "../../../src/utils/jeuxVideo.js";
import { estFourreToutCatalogue } from "../../../src/utils/fourreTout.js";
import { VINTED_COLORS } from "../../../src/utils/vintedColors.js";
// (25/09) Les correctifs d'extension qui réarment un job dès qu'un poste à jour polle.
import { CORRECTIFS_EXTENSION, correctifPourJob, buildMsDe } from "../_shared/correctifs-extension.js";
import { archiverErreur } from "../_shared/erreurs-archivees.js";
import { attenteSessionEncoreEspacee } from "../_shared/attente-session.js";
import { NOMBRE_NU_RE, ORDRE_EXACT_D_ABORD, TAILLE_PREFIXEE_RE, grilleDuDernierEchecTaille, normaliserTaille, tailleAServir, tailleAServirPublication } from "../_shared/vinted-taille-republication.ts";
// Nommer une annonce par son IDENTIFIANT quand son lien manque (21/09).
import { lienDepuisId } from "../_shared/annonce-lien.ts";

/** Taille d'article en NOMBRE NU (« 36 », « 42 ») : le seul périmètre de la
 *  conversion nombre → lettre à la publication. Une forme préfixée (« EU 36 »)
 *  est le domaine de la republication, une lettre n'a rien à convertir. */
const NOMBRE_NU_TAILLE_RE = /^\d{1,3}$/;
// ── L'ARBRE LEBONCOIN RELEVÉ, pour retrouver la RACINE d'une feuille ───────
// (2026-09-19) Le relevé Leboncoin ne capture que la FEUILLE (« Livres »,
// « Ameublement ») : le fil d'Ariane du site n'affiche pas la racine. Nos 79
// feuilles la portent, et leurs libellés sont UNIQUES (vérifié : zéro
// doublon), donc « Ameublement » détermine « Maison & Jardin > Ameublement »
// sans ambiguïté.
// ⛔ On importe le fichier GÉNÉRÉ (scripts/gen-arbres-feuilles.mjs), jamais
//    une liste recopiée ici : une liste parallèle divergerait au premier
//    relevé. C'est un module de DONNÉES, sans aucun import — même traitement
//    que _shared/beebs-interdits.js juste en dessous.
// ⚠️ COUPLAGE À NOMMER : cette fonction doit être redéployée quand l'arbre
//    Leboncoin est re-relevé. Elle est la troisième à lire src/ (avec
//    generate-listing et ebay-api-worker).
import { FEUILLES as FEUILLES_LBC } from "../../../src/utils/arbres/leboncoinFeuilles.js";
const _normFeuille = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const _LBC_PAR_FEUILLE = new Map<string, string[]>(
  (FEUILLES_LBC as Array<{ chemin: string[] }>).map((f) => [_normFeuille(f.chemin[f.chemin.length - 1]), f.chemin]),
);
/** [racine, feuille] pour un libellé de feuille Leboncoin relevé, ou null. */
function cheminLbcDepuisFeuille(libelle: unknown): string[] | null {
  // Le relevé peut rendre un fil d'Ariane complet sur d'autres plateformes :
  // on prend toujours le DERNIER segment, qui nomme la feuille.
  const segs = String(libelle ?? "").split(">").map((s) => s.trim()).filter(Boolean);
  const dernier = segs[segs.length - 1] ?? "";
  return _LBC_PAR_FEUILLE.get(_normFeuille(dernier)) ?? null;
}

// ── LA CATÉGORIE EST DANS L'URL (2026-09-20) ────────────────────────────────
// CE QUE ÇA A COÛTÉ : l'annonce « Need for Speed Shift 2 » (XEWER, Pro) est
// restée HORS LIGNE 12 heures — retirée, jamais recréée — sur un message qui
// renvoyait la personne synchroniser elle-même. Son job venait d'un RELEVÉ :
// ses platform_fields ne portent que {source, rattachement}, donc aucune
// catégorie ; et son annonce ayant été retirée, plus aucun relevé ne pourra
// jamais la re-capturer. La capture en base était vide, et le restera.
//
// Or la catégorie n'a jamais quitté le job : elle est DANS L'ADRESSE de
// l'annonce d'origine — /ad/**jeux_video**/3240251185. Leboncoin met le slug
// de la feuille dans le chemin, et ce slug ne bouge pas.
//
// MESURE DU 20/09 : 40 slugs distincts sur les 1 797 adresses Leboncoin du
// parc ; les 40 se résolvent contre l'arbre relevé (79 feuilles), avec ZÉRO
// collision de jetons. Et 263 jobs Leboncoin issus d'un relevé n'ont AUCUNE
// catégorie aujourd'hui : les 263 portent une adresse exploitable.
//
// La résolution se fait par ENSEMBLE DE JETONS, pas par égalité de texte : le
// slug aplatit les séparateurs du libellé (« Photo, audio & vidéo » devient
// photo_audio_video, « Jeux & Jouets » devient jeux_jouets). Comparer les
// jetons triés fait tomber les 7 cas que l'égalité manquait.
// ⛔ AUCUNE table de correspondance écrite à la main : l'arbre relevé fait
//    foi, et une feuille qui disparaîtrait du relevé rendrait null — jamais
//    une catégorie inventée.
const _jetonsFeuille = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter(Boolean).sort().join("_");
const _LBC_PAR_JETONS = new Map<string, string[]>(
  (FEUILLES_LBC as Array<{ chemin: string[] }>)
    .map((f) => [_jetonsFeuille(f.chemin[f.chemin.length - 1]), f.chemin]),
);
/** [racine, feuille] déduit du slug d'une adresse Leboncoin, ou null. */
function cheminLbcDepuisUrl(url: unknown): string[] | null {
  const m = String(url ?? "").match(/leboncoin\.fr\/ad\/([a-z0-9_]+)\//i);
  if (!m) return null;
  return _LBC_PAR_JETONS.get(_jetonsFeuille(m[1])) ?? null;
}
import { nettoyerDescriptionLeboncoin, nettoyerTitreLeboncoin } from "../_shared/description-leboncoin.ts";
import { completerDescriptionBeebs } from "../_shared/description-beebs.ts";
import { tempererMajuscules } from "../_shared/titre-majuscules.ts";
// Règles du catalogue Beebs (2026-09-11) : le MÊME fichier que l'app
// (src/utils/platformCompat.js) — module JS sans import, chargé tel quel.
import { verdictBeebsInterdit, messageBeebsInterdit } from "../_shared/beebs-interdits.js";
// ISBN : même table de vérité que le content script (normalisation, filtre du
// remplissage « 13 zéros », lecture dans le texte libre). Module JS sans import.
import { normalizeIsbn, resoudreIsbn } from "../_shared/isbn.js";
import {
  type AspectRow,
  BEEBS_CHAMPS_DEDIES,
  categorieDuJob,
  champsArbitrablesBeebs,
  rapprocherValeursBeebs,
} from "../_shared/beebs-valeurs.ts";
// L'arbre Opla, côté serveur (fichier GÉNÉRÉ par scripts/gen-opla-catalogue.mjs,
// vérifié contre le référentiel live par scripts/opla-catalogue-selftest.mjs).
// Ici, pour une seule chose : lire la BRANCHE d'une catégorie résolue afin d'en
// déduire le genre. Aucune décision de dépôt n'est prise ici — le pré-vol de
// l'extension reste la seule garde.
import { oplaNoeud } from "../_shared/opla-catalogue.ts";
// La RÉSOLUTION de la catégorie Opla (2026-09-18) : l'arbre est déjà là, la
// fiche aussi — et l'extension 0.6.42 déployée consomme ce qu'on pose ici
// (opla.js:701 lit oplaCategoryCode, opla.js:479 sort dès que c'est une feuille).
import { cheminLisible, cleFourche } from "../_shared/opla-resolution.ts";
import { completerJobOpla, type OplaMem } from "../_shared/opla-completion.ts";

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

// ══════════════════════════════════════════════════════════════════════════════
// LA COPIE DE L'ANNONCE, SERVIE AVEC LE JOB (2026-09-23)
// ══════════════════════════════════════════════════════════════════════════════
// Miroir EXACT de `construireSnapshotRepublish` (chrome-extension/background.js)
// pour les champs que le pré-vol de la 0.6.58 contrôle : titre, photos, prix,
// catalog_id, package_size_id. La source est la MÊME (vinted_republish_captures) ;
// ce n'est pas une copie inventée, c'est la copie réelle, lue en base.
// ⛔ JAMAIS DE VALEUR DE COMPLAISANCE : un champ absent de la capture reste
//    absent ici. Une capture réellement incomplète doit continuer à bloquer le
//    retrait — c'est ce que la garde existe pour faire.
function copieRepublishDepuisCapture(
  pf: Record<string, unknown>,
  cap: Record<string, unknown>,
): Record<string, unknown> {
  const payload = (cap["payload"] ?? {}) as Record<string, unknown>;
  const natif = (payload["natif"] ?? {}) as Record<string, unknown>;
  const lib = (cap["libelles"] ?? {}) as Record<string, unknown>;
  const attrs = Array.isArray(natif["item_attributes"]) ? natif["item_attributes"] as Array<Record<string, unknown>> : [];
  const idsAttr = (code: string): unknown[] | null => {
    const e = attrs.find((a) => String(a?.["code"] ?? "").trim().toLowerCase() === code);
    const ids = e?.["ids"];
    return Array.isArray(ids) && ids.length ? ids : null;
  };
  return {
    version: 1,
    capture_id: pf["capture_id"] ?? null,
    captured_at: cap["captured_at"] ?? null,
    vinted_item_id: pf["vinted_item_id"] ?? null,
    titre: payload["titre"] ?? null,
    description: payload["description"] ?? null,
    prix: payload["prix"] ?? null,
    devise: natif["currency"] ?? "EUR",
    marque: lib["marque"] ?? null,
    brand_id: natif["brand_id"] ?? null,
    taille: lib["taille"] ?? null,
    size_id: natif["size_id"] ?? idsAttr("size")?.[0] ?? null,
    etat: lib["etat"] ?? null,
    status_id: natif["status_id"] ?? idsAttr("condition")?.[0] ?? null,
    couleurs: lib["couleurs"] ?? null,
    color1_id: natif["color1_id"] ?? null,
    color2_id: natif["color2_id"] ?? null,
    categoryPath: lib["categoryPath"] ?? null,
    catalog_id: natif["catalog_id"] ?? null,
    colis: lib["colis"] ?? null,
    package_size_id: natif["package_size_id"] ?? null,
    isbn: lib["isbn"] ?? (typeof natif["isbn"] === "string" && (natif["isbn"] as string).trim() ? (natif["isbn"] as string).trim() : null),
    matiere: lib["matiere"] ?? null,
    ...(idsAttr("material") ? { material_ids: idsAttr("material") } : {}),
    photos: cap["photos_urls"] ?? [],
    // D'où elle vient. Le snapshot écrit par l'extension n'a pas cette clé :
    // en SQL, `republish_snapshot ? 'servi_par_le_serveur'` sépare les deux.
    servi_par_le_serveur: true,
  };
}

// ── LES JOBS PARQUÉS « AUTORISER OPLA » REPARTENT QUAND UN POSTE AUTORISÉ POLLE
// (2026-09-24, cf. _shared/poste-extension.ts). Avant, seule l'extension les
// relançait, au réveil de son service worker — et un poste SANS accès les
// re-parquait dans la minute (Louis, deux profils Chrome, 131 parcages en une
// nuit). Ici la relance est SERVEUR et PRÉCISE : elle ne part que d'un poste
// dont l'accès est prouvé, et get-pending-jobs ne sert plus Opla aux autres.
// Un par un (platform_fields se réécrit en entier), compare-and-swap sur le
// statut, erreur archivée. Le marqueur `opla_acces_accorde_le` est celui que
// posait l'extension : même trace, lisible en SQL.
// deno-lint-ignore no-explicit-any
async function rearmerJobsOplaParques(admin: any, userId: string, sessionId: string): Promise<number> {
  const { data: rows } = await admin
    .from("cross_post_jobs")
    .select("id, error, platform_fields")
    .eq("user_id", userId).eq("platform", "opla").eq("status", "needs_user")
    .eq("platform_fields->>needs_user_source", "opla_acces")
    .limit(200);
  let n = 0;
  for (const j of (rows ?? []) as Array<{ id: string; error: string | null; platform_fields: Record<string, unknown> | null }>) {
    const pf: Record<string, unknown> = { ...(j.platform_fields ?? {}) };
    for (const k of ["needs_user_source", "next_action_after", "processing_since",
      "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"]) delete pf[k];
    pf.opla_acces_accorde_le = new Date().toISOString();
    pf.opla_acces_accorde_par = `get-pending-jobs · poste ${posteCourt(sessionId)}`;
    if (j.error) {
      pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, j.error, "needs_user",
        "get-pending-jobs → pending (poste avec accès Opla en ligne)");
    }
    const { error } = await admin.from("cross_post_jobs")
      .update({ status: "pending", error: null, platform_fields: pf })
      .eq("id", j.id).eq("status", "needs_user");
    if (!error) n++;
  }
  return n;
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

    // ── LES CRÉNEAUX, PAR PLATEFORME (2026-09-18) ──────────────────────────
    // Le module planifié est multiplateforme : Vinted, Leboncoin, Beebs, Opla
    // ont CHACUNE leur créneau, leurs jours et leur plafond. Un job Leboncoin
    // ne se juge donc plus sur la fenêtre Vinted — c'était le seul endroit du
    // serveur qui l'aurait fait.
    // UN aller-retour pour les quatre (republish_planifiee_fenetres_courantes).
    // Repli sur l'ancienne RPC mono-plateforme si la migration n'est pas encore
    // jouée : le comportement d'avant, à l'identique, jamais un point de panne.
    type Fenetre = { actif: boolean; dans_creneau: boolean; reprise: string | null; fin: string | null };
    const PF_CRENEAU = ["vinted", "leboncoin", "beebs", "opla"] as const;
    let creneauxCache: Record<string, Fenetre> | null | undefined;
    const lireCreneaux = async (): Promise<Record<string, Fenetre>> => {
      if (creneauxCache !== undefined && creneauxCache !== null) return creneauxCache;
      const out: Record<string, Fenetre> = {};
      const poser = (pf: string, f: Record<string, unknown> | null) => {
        if (!f || f.actif !== true) return;
        out[pf] = {
          actif: true,
          dans_creneau: f.dans_creneau === true,
          reprise: (f.prochaine_tentative as string | null) ?? null,
          fin: (f.courant_fin as string | null) ?? null,
        };
      };
      try {
        const { data, error } = await userClient.rpc("republish_planifiee_fenetres_courantes");
        if (error) throw error;
        const m = (data ?? {}) as Record<string, Record<string, unknown> | null>;
        for (const pf of PF_CRENEAU) poser(pf, m[pf] ?? null);
      } catch (_e) {
        try {
          const { data: fen } = await userClient.rpc("republish_planifiee_fenetre_courante");
          poser("vinted", (fen ?? null) as Record<string, unknown> | null);
        } catch (_e2) { /* aucun module lisible : rien n'est retenu */ }
      }
      creneauxCache = out;
      return out;
    };

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
      // 18/09 : les quatre fenêtres. `creneau_republish` garde la forme d'avant
      // (la fenêtre VINTED) — l'app d'aujourd'hui la lit telle quelle et ne
      // change pas de comportement ; `creneaux_republish` porte les quatre,
      // pour que la carte d'un job retenu annonce l'heure de SA plateforme.
      const creneaux = await lireCreneaux();
      const creneau = creneaux["vinted"] ?? null;
      try {
        return json({ plafond_republish: await etatPlafondRepublish(), annonces_en_attente: attente, creneau_republish: creneau, creneaux_republish: creneaux });
      } catch (_e) {
        // L'app masque le bandeau sur null : jamais un bandeau sur une panne.
        return json({ plafond_republish: null, annonces_en_attente: attente, creneau_republish: creneau, creneaux_republish: creneaux });
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
    // Le BUILD_ID de CE poll (préfixe horodaté) — celui du poste qui appelle,
    // jamais profiles.extension_build (dernier écrivain, tous postes confondus).
    const buildDuPoll = typeof body?.build === "string" ? body.build.slice(0, 120) : "";
    // Capacités DÉCLARÉES par le build (2026-09-10) — jamais déduites d’un
    // numéro de version : « taille_par_id » = ce client pose la taille Vinted
    // par id et par onglet sans retirer « EU » (selectTailleVinted). Un build
    // qui ne le dit pas n’est pas capable, quel que soit son numéro.
    const capacites: string[] = Array.isArray(body?.capacites)
      ? body.capacites.map((c: unknown) => String(c)).slice(0, 20) : [];
    const tailleParId = capacites.includes("taille_par_id");
    // ── LE POSTE (2026-09-24, cf. _shared/poste-extension.ts) ───────────────
    // « opla_acces » / « sans_opla » : déclaré par la 0.6.64 à chaque poll. Un
    // build plus ancien ne dit rien : on s'en remet à ce qu'update-job-status a
    // appris de lui (un parcage « Autoriser Opla » = ce poste n'a pas l'accès).
    // ⛔ Un poste SANS accès ne reçoit AUCUN job Opla (filtre plus bas).
    const sessionId = sessionIdDuJwt(authHeader);
    let posteSansOpla = capacites.includes("sans_opla");
    let posteAvecOpla = capacites.includes("opla_acces");
    // (25/09) Les postes vivants du compte, relus par la garde des relevés Opla.
    let postesDuCompte: Record<string, Poste> = {};
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
      if (sessionId) {
        try {
          const { data: pp } = await admin.from("profiles").select("extension_postes").eq("id", user.id).maybeSingle();
          const postes = postesVivants((pp as { extension_postes?: unknown } | null)?.extension_postes);
          postesDuCompte = postes;
          const avant: Poste = postes[sessionId] ?? {};
          const patchPoste: Poste = { le: new Date().toISOString() };
          if (build) patchPoste.build = build;
          const declare = posteAvecOpla || posteSansOpla;
          if (posteAvecOpla) patchPoste.opla_acces = true;
          else if (posteSansOpla) patchPoste.opla_acces = false;
          // (24/09) Un accès DÉCLARÉ est établi à l'instant du poll : on le date
          // comme un accès appris (update-job-status) ou prouvé (preuve-opla).
          // C'est cette date que lit la règle unique « Opla est-il autorisé ? »
          // (_shared/acces-opla.js) : sans elle, un poste 0.6.64+ qui redit son
          // accès à chaque minute gardait la date de son dernier job Opla, et un
          // refus venu d'un AUTRE profil Chrome passait pour plus récent.
          if (declare) patchPoste.opla_acces_le = patchPoste.le;
          else if (avant.opla_acces === false) posteSansOpla = true;
          else if (avant.opla_acces === true) posteAvecOpla = true;
          // ── UN POSTE QUI NE DÉCLARE RIEN (≤ 0.6.63) : LA PREUVE EN BASE
          //    (2026-09-24, solene.mantero / Thomas Dri) ──────────────────────
          // Appris « sans accès » par un parcage, il ne recevait plus aucun job
          // Opla — donc ne pouvait plus jamais réapprendre l'accès, même après
          // l'octroi. Une PREUVE réelle plus récente que ce parcage (relevé ou
          // publication Opla aboutis, relance posée par l'extension à l'octroi —
          // jamais une « connexion » Opla, jamais un 401) lui rend l'accès, et
          // la relance des jobs parqués ci-dessous part d'elle-même.
          // Au plus une recherche par 10 min et par poste.
          // ── (25/09, Louis) La preuve lue en base est une preuve du COMPTE : une
          //    publication Opla aboutie par le poste AUTORISÉ passait pour une
          //    preuve de CE poste-ci (19:35 : « poste 8632c049 : accès Opla
          //    PROUVÉ » par une publication de 070b2126) — et il a reçu deux
          //    relevés Opla qu'il ne pouvait pas faire. Quand un AUTRE poste
          //    vivant du compte a l'accès, la preuve du compte ne dit rien de
          //    celui-ci : on ne la lui applique pas.
          const autrePosteAutorise = posteAvecAccesOpla(postes, { saufSession: sessionId, depuisMs: POSTE_TTL_MS });
          if (!declare && !posteAvecOpla && !autrePosteAutorise) {
            const derniere = Date.parse(String(avant.preuve_opla_cherchee_le ?? ""));
            if (!Number.isFinite(derniere) || Date.now() - derniere > 10 * 60_000) {
              patchPoste.preuve_opla_cherchee_le = patchPoste.le;
              const preuve = await preuveAccesOpla(admin, user.id, avant.opla_acces === false ? (avant.opla_acces_le ?? null) : null)
                .catch(() => null);
              if (preuve) {
                posteSansOpla = false;
                posteAvecOpla = true;
                patchPoste.opla_acces = true;
                patchPoste.opla_acces_le = preuve.le;
                patchPoste.opla_acces_preuve = preuve.source;
                console.log(`[get-pending-jobs] userId=${user.id} poste ${posteCourt(sessionId)} : accès Opla PROUVÉ (${preuve.source}, ${preuve.le})${avant.opla_acces === false ? " — le parcage appris est levé" : ""}`);
              }
            }
          }
          // Un poste AVEC accès polle : les jobs parqués « Autoriser Opla » (par
          // un autre poste, ou par lui-même avant l'octroi) repartent pour lui —
          // au plus une relance par 10 min et par poste.
          if (posteAvecOpla) {
            const dernier = Date.parse(String(avant.rearme_le ?? ""));
            if (!Number.isFinite(dernier) || Date.now() - dernier > 10 * 60_000) {
              patchPoste.rearme_le = patchPoste.le;
              const n = await rearmerJobsOplaParques(admin, user.id, sessionId);
              if (n) console.log(`[get-pending-jobs] userId=${user.id} poste ${posteCourt(sessionId)} avec accès Opla : ${n} job(s) parqué(s) « Autoriser Opla » relancé(s)`);
            }
          }
          // Fusion ATOMIQUE (RPC noter_poste_extension, verrou de ligne) : deux
          // postes qui pollent en parallèle ne se perdent plus leurs mises à jour.
          const { error: rpcErr } = await admin.rpc("noter_poste_extension", { p_user: user.id, p_session: sessionId, p_patch: patchPoste });
          if (rpcErr) console.warn(`[get-pending-jobs] userId=${user.id} noter_poste_extension :`, rpcErr.message);
        } catch (e) { console.warn("[get-pending-jobs] postes :", (e as Error)?.message ?? e); }
      }
      await admin.from("profiles").update(patch).eq("id", user.id);
      // Version du manifest (2026-08-05) : rangée en MAX, pas en dernière vue —
      // un compte à deux machines (portable 0.4.x, fixe 0.5.0) ne doit pas
      // faire osciller le bouton de sync. La logique du max vit dans la RPC,
      // qui n'écrit que si la version proposée est strictement supérieure.
      if (version) await admin.rpc("noter_version_extension", { p_user_id: user.id, p_version: version });
    } catch (_e) { /* télémétrie best-effort, jamais bloquante */ }

    // ══ UN DÉFAUT D'EXTENSION CORRIGÉ : LE JOB REPART QUAND LE POSTE EST À JOUR ══
    // (2026-09-25, LES PETITES FIOLES — _shared/correctifs-extension.js)
    // 5 republications Leboncoin PRO arrêtées en « relance d'un clic » après
    // 40 essais de la 0.6.63 sur la fiche sans panneau de gestion ; la 0.6.66
    // ouvre le tiroir « Gérer ». Les relancer sur la 0.6.63 = cinq échecs de
    // plus ; attendre un geste = oublier. Ici : dès qu'un poste de CE compte
    // polle avec un build qui porte le correctif, le job repart, une fois, et
    // n'est servi qu'à un poste à jour (garde `build_min_requis` plus bas).
    // Poll d'exécution seul ; aucune requête pour un poste plus ancien que le
    // plus ancien correctif connu. Best-effort : jamais un point de panne.
    let relancesCorrectif = 0;
    const correctifsPortes = CORRECTIFS_EXTENSION.filter((c) => buildMsDe(buildDuPoll) >= buildMsDe(c.buildMin));
    if (!includeProcessing && !includeNeedsUser && correctifsPortes.length) {
      try {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: bloques } = await admin
          .from("cross_post_jobs")
          .select("id, user_id, platform, action, status, error, handler_build, platform_fields")
          .eq("user_id", user.id).eq("status", "needs_user")
          .in("platform", [...new Set(correctifsPortes.map((c) => c.platform))])
          .in("action", [...new Set(correctifsPortes.flatMap((c) => c.actions))])
          .limit(50);
        for (const j of (bloques ?? []) as Array<Record<string, unknown>>) {
          const c = correctifPourJob(j);
          if (!c || !(buildMsDe(buildDuPoll) >= buildMsDe(c.buildMin))) continue;
          const pf = { ...((j.platform_fields ?? {}) as Record<string, unknown>) };
          for (const k of ["needs_user_source", "needsUserAttempts", "needsUserBoucle", "needsUserResolved", "next_action_after",
            "needs_user_vu_le", "needs_user_vu_erreur", "needs_user_tick_le", "needs_user_actif_ms", "error_technique",
            "processing_since", "pas_de_rouge", "pas_de_rouge_reprises"]) delete pf[k];
          // Comme relancer_republish : une annonce pas encore retirée est
          // RE-VÉRIFIÉE (a_capturer) avant tout retrait ; 'deleted' reste là où il est.
          if (j.action === "republish" && pf.republish_step !== "deleted") {
            pf.republish_step = "a_capturer";
            delete pf.capture_id;
          }
          pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, j.error, "needs_user", `get-pending-jobs (correctif ${c.version} : ${c.cle})`);
          pf.correctif_leve = { cle: c.cle, version: c.version, le: new Date().toISOString(), build_echec: j.handler_build ?? null, build_poste: buildDuPoll, motif: c.motif };
          pf.build_min_requis = c.buildMin;
          const { data: maj } = await admin.from("cross_post_jobs")
            .update({ status: "pending", error: null, platform_fields: pf })
            .eq("id", j.id as string).eq("status", "needs_user").select("id");
          if ((maj ?? []).length) {
            relancesCorrectif++;
            console.log(`[get-pending-jobs] userId=${user.id} job ${String(j.id).slice(0, 8)} (${j.platform} ${j.action}) : arrêté sur ${c.cle} par ${String(j.handler_build ?? "?").slice(0, 40)} — poste à jour (${buildDuPoll.slice(0, 40)}) → pending, une fois`);
          }
        }
      } catch (e) {
        console.warn(`[get-pending-jobs] correctifs d'extension : ${String((e as Error)?.message ?? e)} — rien de relancé`);
      }
    }

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
    // ── LE COMPTE VINTED EST-IL EN PAUSE ANTI-ROBOT ? (2026-09-25) ──────────
    // Lu AVANT la commande de relevé du dressing. Pendant la pause (marqueur
    // `attente_antirobot_compte` sur un job Vinted en file, posé plus bas par
    // le bloc « ANTI-ROBOT SUR LE COMPTE VINTED »), AUCUN relevé Vinted n'est
    // servi : la demande reste en file (6 h) et part au premier poll après la
    // levée — le relevé ne frappe plus Vinted pendant la vérification. Les
    // relevés des autres plateformes ne sont pas concernés. (L'insertion
    // directe d'un relevé par l'extension — alarme, bouton — est refusée en
    // base par le trigger garde_pause_antirobot_sync_runs, migration
    // 20260925153000 : même règle pour toutes les versions d'extension.)
    // Illisible → comportement d'avant.
    let compteEnPauseAr = false;
    try {
      const { data: pauseAr } = await userClient.from("cross_post_jobs").select("id")
        .eq("user_id", user.id).eq("platform", "vinted").eq("status", "pending")
        .not("platform_fields->attente_antirobot_compte", "is", null)
        .limit(1);
      compteEnPauseAr = (pauseAr ?? []).length > 0;
    } catch (_e) { /* jamais un point de panne */ }

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
        if (cmds?.length && compteEnPauseAr) {
          console.log(`[get-pending-jobs] userId=${user.id} : relevé Vinted ${String(cmds[0].id).slice(0, 8)} RETENU — compte en pause anti-robot, il partira à la levée`);
        } else if (cmds?.length) syncCommand = { id: cmds[0].id as string };
      } catch (_e) { /* la file de sync ne doit JAMAIS bloquer la distribution des jobs */ }
    }
    // ══ UNE DEMANDE DE RELEVÉ JAMAIS RÉCLAMÉE REPART AU RETOUR DE CHROME ══════
    // (2026-09-25, check de nuit, point 6) Joe0410, Sandra, Chrys, MeMiniandMove,
    // Melanie, alexandrine, m0nc3f : relevés demandés le soir, Chrome fermé la
    // nuit → « demande jamais réclamée en 6 h » → expirés. Personne ne les
    // redemandait : ni l'app (demande de l'utilisateur), ni le serveur hors du
    // premier relevé (planifier_premiers_releves : 3 essais, 6 h d'écart). La
    // personne restait sans relevé jusqu'au prochain geste.
    // RÈGLE : au premier poll d'exécution d'un poste capable, chaque demande
    // EXPIRÉE SANS AVOIR ÉTÉ RÉCLAMÉE (claimed_at nul) depuis moins de 72 h
    // est reposée, UNE fois, telle quelle (même kind, même plateforme), avec
    // l'origine suivie de « :redemande ». Elle part dans CE poll (la lecture
    // des relevés est juste en dessous).
    // ⛔ BORNES — aucune boucle possible :
    //    · une seule redemande par demande expirée (marque « [redemandée] »
    //      posée sur l'expirée) ; une redemande qui expire à son tour n'est
    //      JAMAIS redemandée (déclencheur « …:redemande ») ;
    //    · rien si un run plus récent de même nature existe (fait, en cours,
    //      raté : il a déjà répondu), ni pour une plateforme écartée ;
    //    · jamais les demandes du VEILLEUR (il se redemande lui-même, sous la
    //      garde des relevés vides) ni les « connexion » (on ne rouvre pas un
    //      onglet des heures après le clic) ;
    //    · l'index un_seul_actif et les gardes d'insertion (cadence du
    //      dressing) restent juges : un refus d'insertion = rien de posé.
    // Best-effort : jamais un point de panne.
    let relevesRedemandes = 0;
    if (versionAuMoins(version, "0.6.42") && !includeProcessing && !includeNeedsUser) {
      try {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const depuis = new Date(Date.now() - 72 * 3600_000).toISOString();
        const { data: expirees } = await admin
          .from("vinted_sync_runs")
          .select("id, kind, platform, declencheur, erreur, queued_at, finished_at")
          .eq("user_id", user.id).eq("status", "expired")
          .is("claimed_at", null).not("queued_at", "is", null)
          .in("kind", ["annonces", "dressing"])
          .gte("finished_at", depuis)
          .order("queued_at", { ascending: false })
          .limit(20);
        const candidates = ((expirees ?? []) as Array<Record<string, unknown>>).filter((r) => {
          const d = String(r.declencheur ?? "");
          return !/^veilleur/i.test(d) && !/:redemande$/i.test(d) && !String(r.erreur ?? "").includes("[redemandée]");
        });
        if (candidates.length) {
          const { data: prof } = await admin.from("profiles").select("platform_settings").eq("id", user.id).maybeSingle();
          const ps = ((prof as { platform_settings?: unknown } | null)?.platform_settings ?? {}) as Record<string, unknown>;
          const ecartees = new Set(Array.isArray(ps.plateformes_ecartees) ? (ps.plateformes_ecartees as unknown[]).map(String) : []);
          const vues = new Set<string>();
          for (const r of candidates) {
            const kind = String(r.kind);
            const pf = r.platform == null ? null : String(r.platform);
            const cleNature = `${kind}|${pf ?? ""}`;
            if (vues.has(cleNature)) continue; // la plus récente seulement
            vues.add(cleNature);
            if (ecartees.has(kind === "dressing" ? "vinted" : String(pf ?? ""))) continue;
            if (kind === "dressing" && compteEnPauseAr) continue; // (25/09) pause anti-robot : pas de relevé Vinted
            // Un run PLUS RÉCENT de même nature a déjà répondu (ou est en cours).
            let plusRecent = admin.from("vinted_sync_runs").select("id").eq("user_id", user.id).eq("kind", kind)
              .neq("id", r.id as string).gt("started_at", String(r.queued_at)).limit(1);
            plusRecent = pf == null ? plusRecent.is("platform", null) : plusRecent.eq("platform", pf);
            const { data: recent } = await plusRecent;
            if ((recent ?? []).length) continue;
            const origine = String(r.declencheur ?? "app") || "app";
            const { data: cree, error: insErr } = await admin.from("vinted_sync_runs")
              .insert({ user_id: user.id, kind, platform: pf, status: "queued", declencheur: `${origine}:redemande`, queued_at: new Date().toISOString() })
              .select("id").maybeSingle();
            if (insErr || !cree) {
              console.log(`[get-pending-jobs] userId=${user.id} relevé ${kind}/${pf ?? "-"} expiré non redemandé : ${insErr?.message ?? "insertion refusée"}`);
              continue;
            }
            await admin.from("vinted_sync_runs")
              .update({ erreur: `${String(r.erreur ?? "demande expirée").slice(0, 400)} · [redemandée] repartie au retour de l'extension (${String((cree as { id: string }).id).slice(0, 8)})` })
              .eq("id", r.id as string).eq("status", "expired");
            relevesRedemandes++;
            console.log(`[get-pending-jobs] userId=${user.id} relevé ${kind}/${pf ?? "-"} (${origine}) expiré sans avoir été réclamé → redemandé au retour de l'extension (${String((cree as { id: string }).id).slice(0, 8)})`);
          }
        }
      } catch (e) {
        console.warn(`[get-pending-jobs] redemande des relevés expirés : ${String((e as Error)?.message ?? e)} — rien de posé`);
      }
    }

    // ── Relevés multiplateforme (2026-09-17, sync lot 1) : les demandes
    // kind='annonces' en file (une par plateforme), servies aux extensions
    // ≥ 0.6.42 seulement — une plus ancienne ne sait pas relever. Même TTL de
    // 6 h, même purge. Best-effort : jamais un point de panne.
    let syncCommandsAnnonces: Array<{ id: string; platform: string }> = [];
    if (versionAuMoins(version, "0.6.42") && !includeProcessing) {
      try {
        const ttl = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: cmds } = await userClient
          .from("vinted_sync_runs")
          .select("id, platform")
          .eq("kind", "annonces")
          .eq("status", "queued")
          .gte("queued_at", ttl)
          .order("queued_at", { ascending: true })
          .limit(4);
        syncCommandsAnnonces = ((cmds ?? []) as Array<{ id: unknown; platform: unknown }>)
          .map((c) => ({ id: String(c.id), platform: String(c.platform) }));
      } catch (_e) { /* idem */ }
    }
    // ── UN RELEVÉ OPLA N'EST CONFIÉ QU'À UN POSTE QUI A L'ACCÈS (2026-09-25) ──
    // Louis (Business, deux profils Chrome) : ses relevés Opla de 21:21 et
    // 22:21 (24/09) sont partis au poste SANS autorisation — premier à poller,
    // premier servi — et sont revenus « accès Opla non accordé », alors que
    // ses publications Opla passaient par l'autre poste. 12 relevés Opla ce
    // jour-là : 6 faits par le poste autorisé, 6 « absente » par l'autre.
    // Même règle que les jobs Opla (plus bas) : quand un AUTRE poste vivant du
    // compte a l'accès, la demande reste en file pour lui. Un compte à un seul
    // poste sans accès ne change pas : son relevé dit « absente », utile au
    // verdict « Opla est-il autorisé ? ».
    if (posteSansOpla && syncCommandsAnnonces.some((c) => c.platform === "opla")
        && posteAvecAccesOpla(postesDuCompte, { saufSession: sessionId, depuisMs: POSTE_TTL_MS })) {
      syncCommandsAnnonces = syncCommandsAnnonces.filter((c) => c.platform !== "opla");
      console.log(`[get-pending-jobs] userId=${user.id} poste ${posteCourt(sessionId)} sans accès Opla : relevé Opla laissé en file pour le poste autorisé`);
    }

    // ══ « ME CONNECTER » — LE TÉLÉPHONE DEMANDE, L'ORDINATEUR OUVRE ════════
    // (2026-09-22) C'est le mur nº1 des nouveaux inscrits. L'app ne peut pas
    // appeler l'extension (aucun `externally_connectable` au manifeste), donc
    // la demande passe par la file : même table, même forme, `kind='connexion'`.
    //
    // ⚠️ TTL COURT, ET LA GARDE EST ICI. purger_sync_queue_perimee ne touche
    //    que 'dressing' et 'annonces' : nos lignes ne seront jamais purgées par
    //    elle. Le `.gte` ci-dessous FAIT FOI — une demande de plus de 10 min
    //    n'est jamais servie. Ouvrir une page de connexion six heures après le
    //    clic ferait surgir un onglet que plus personne n'attend.
    //
    // `declencheur` porte le motif (« app:connexion », « app:reauth_ebay »,
    // « app:vendeur_ebay ») : c'est lui qui dit QUELLE page ouvrir. Servi tel
    // quel, l'extension tranche — elle seule connaît ses adresses.
    let connexionCommands: Array<{ id: string; platform: string; motif: string }> = [];
    if (versionAuMoins(version, "0.6.53") && !includeProcessing) {
      try {
        const ttl = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: cmds } = await userClient
          .from("vinted_sync_runs")
          .select("id, platform, declencheur")
          .eq("kind", "connexion")
          .eq("status", "queued")
          .gte("queued_at", ttl)
          .order("queued_at", { ascending: true })
          .limit(3);
        connexionCommands = ((cmds ?? []) as Array<{ id: unknown; platform: unknown; declencheur: unknown }>)
          .map((c) => ({
            id: String(c.id),
            platform: String(c.platform),
            motif: String(c.declencheur ?? "").split(":")[1] || "connexion",
          }));
        if (connexionCommands.length) {
          console.log(`[get-pending-jobs] userId=${user.id} : ${connexionCommands.length} demande(s) de connexion servie(s) — ${connexionCommands.map((c) => `${c.platform}/${c.motif}`).join(", ")}`);
        }
      } catch (_e) { /* la file de connexion ne doit JAMAIS bloquer les jobs */ }
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
      .select("id, platform, action, status, title, description, price, photos, photo_option, platform_fields, inventaire_id, listing_url, platform_listing_id, created_at, error")
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
      .select("id, platform, action, status, title, description, price, photos, photo_option, platform_fields, inventaire_id, listing_url, platform_listing_id, created_at, error, inventaire:inventaire_id(vinted_item_id, disparu_le, vinted_status)")
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

    // ── UN JOB RÉARMÉ PAR UN CORRECTIF N'EST SERVI QU'À UN POSTE QUI LE PORTE ──
    // (2026-09-25, cf. « UN DÉFAUT D'EXTENSION CORRIGÉ » plus haut) Un autre
    // profil Chrome du même compte, resté sur l'ancien build, le reprendrait
    // pour échouer de la même façon. Build illisible = ancien build : retenu.
    // TOUS LES MODES : le popup d'un ancien poste ne doit pas le lancer non plus.
    {
      const avantCorrectif = out.length;
      out = out.filter((j) => {
        const min = String(((j.platform_fields ?? {}) as Record<string, unknown>).build_min_requis ?? "");
        if (!min) return true;
        const b = buildMsDe(buildDuPoll);
        return Number.isFinite(b) && b >= buildMsDe(min);
      });
      if (out.length !== avantCorrectif) {
        console.log(`[get-pending-jobs] userId=${user.id} : ${avantCorrectif - out.length} job(s) réarmé(s) par un correctif retenu(s) — poste « ${buildDuPoll.slice(0, 40) || "build inconnu"} » plus ancien que le correctif`);
      }
    }

    // ── UNE REPUBLICATION REJOUÉE REPART DE L'ANNONCE QU'ELLE A CRÉÉE (25/09) ──
    // Ornella, cardigan (job afc981fe) : la republication du 17/09 a retiré
    // 9996392197 et CRÉÉ 10035307070 (new_vinted_item_id), mais vinted_item_id
    // est resté sur l'ancien. Rejouée à l'étape 'a_capturer' (relance), elle a
    // capturé l'annonce qu'ELLE avait retirée : 404 → « disparue » → revue des
    // disparus → « vendue » à 4 € — alors que 10035307070 était en ligne. Le
    // relevé suivant a réimporté l'annonce vivante en doublon.
    // Règle : une republication Vinted qui n'a PAS encore retiré (a_capturer,
    // captured) et qui porte l'identifiant de l'annonce qu'elle a déjà créée
    // travaille sur CELLE-LÀ — l'ancienne n'existe plus. Écrit sur le job
    // (trace vinted_item_id_avant), servi tel quel. Tous les modes.
    for (const j of out as unknown as Array<Record<string, unknown>>) {
      if (j.platform !== "vinted" || j.action !== "republish") continue;
      const pf = (j.platform_fields && typeof j.platform_fields === "object") ? (j.platform_fields as Record<string, unknown>) : null;
      if (!pf) continue;
      const etape = String(pf.republish_step ?? "a_capturer");
      const ancien = String(pf.vinted_item_id ?? "").trim();
      const cree = String(pf.new_vinted_item_id ?? "").trim();
      if ((etape !== "a_capturer" && etape !== "captured") || !cree || !ancien || cree === ancien) continue;
      pf.vinted_item_id_avant = ancien;
      pf.vinted_item_id = cree;
      if (etape === "captured") { pf.republish_step = "a_capturer"; delete pf.capture_id; }
      try {
        await userClient.from("cross_post_jobs").update({ platform_fields: pf }).eq("id", j.id as string).eq("status", "pending");
      } catch { /* servi corrigé quand même : l'extension renvoie le pf au statut suivant */ }
      console.log(`[get-pending-jobs] republication ${String(j.id).slice(0, 8)} : repart de l'annonce qu'elle a créée (${cree}), plus de l'ancienne (${ancien}) déjà retirée`);
    }

    // ══════════════════════════════════════════════════════════════════════
    // ON NE LAISSE PAS UN ANCIEN BUILD RETIRER UNE ANNONCE BEEBS (2026-09-22)
    // ══════════════════════════════════════════════════════════════════════
    // Beebs a refait sa page de dépôt le 22/09 entre 13h26 et 15h24. Depuis,
    // AUCUN build ≤ 0.6.54 ne sait y déposer. Une republication Beebs, elle,
    // retire PUIS redépose : un build ancien qui prend un job à l'étape
    // 'a_capturer' ou 'captured' va donc retirer une annonce qu'il ne saura
    // pas remettre. C'est exactement ce qui a coûté le « Pot Diddlina violet »
    // (van-breugel.sandra, 21h04).
    //
    // Le correctif ET le pré-vol sont dans la 0.6.55, mais elle passe par la
    // revue du Chrome Web Store : d'ici là tout le parc tourne sur l'ancien
    // code. Le serveur tient donc la porte à sa place — c'est le seul endroit
    // qui puisse protéger la flotte déjà installée.
    //
    // ⛔ TOUTES LES ÉTAPES, Y COMPRIS 'deleted' (corrigé le 22/09 au soir).
    //    D'abord servie au motif que « l'annonce est déjà dehors, autant la
    //    remettre au plus vite », l'étape 'deleted' a été reprise deux fois en
    //    dix minutes par des builds 0.6.53/0.6.54 (van-breugel.sandra,
    //    nicolas.menar) : un ancien build ne SAIT PAS déposer sur la page
    //    refaite — il ne remet rien, il brûle une tentative et repasse le job
    //    en « à toi de jouer » pour un défaut qui est chez nous. L'annonce
    //    reste dehors dans les deux cas ; autant garder les tentatives et le
    //    job en file, pour qu'il reparte SEUL dès la mise à jour installée.
    //    Les publications Beebs normales passent toujours — au pire elles
    //    échouent sans rien toucher, ce qu'elles font déjà.
    // ⛔ Version illisible ou absente = ancien build (versionAuMoins rend
    //    false) : on retient. Dans le doute, on ne retire pas.
    //
    // À RETIRER quand la 0.6.55 sera installée partout — ou à laisser : il
    // devient inerte dès que tout le monde est à jour.
    const BEEBS_RETRAIT_VERSION_MIN = "0.6.55";
    let beebsRetraitsRetenus = 0;
    if (!versionAuMoins(version, BEEBS_RETRAIT_VERSION_MIN)) {
      out = out.filter((j) => {
        const aRetenir = j.platform === "beebs" && j.action === "republish";
        if (aRetenir) beebsRetraitsRetenus++;
        return !aRetenir;
      });
      if (beebsRetraitsRetenus) {
        console.log(
          `[get-pending-jobs] ${beebsRetraitsRetenus} republication(s) Beebs retenue(s) : ` +
          `extension "${version || "inconnue"}" < ${BEEBS_RETRAIT_VERSION_MIN}, elle retirerait une annonce ` +
          "qu'elle ne sait pas redéposer (page de dépôt refaite le 22/09)",
        );
      }
    }

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
          // `opla` ajoutée au lot C (2026-09-16) : une session Opla morte VUE
          // PAR LA PAGE retient, au lieu de brûler les 5 tentatives de chaque job.
          const httpDe = (s["http"] ?? {}) as Record<string, unknown>;
          for (const pf of ["vinted", "leboncoin", "ebay", "beebs", "opla"]) {
            if (s[pf] !== false) continue; // null = inconnu, true = vivante : jamais retenu
            // ── OPLA : SEULE LA PAGE PROUVE (2026-09-24, règle de Nico) ────
            // Le 401 de la sonde du service worker faisait écrire `opla: false`
            // + `http.opla = 401` (extensions ≤ 0.6.64) et retenir ICI tous les
            // jobs Opla du compte pendant une heure — renouvelée à chaque
            // sonde, donc sans fin. Mesuré le 24/09 : quinze comptes, dont Nico
            // (3 jobs retenus, poste autorisé, relevé de la veille réussi),
            // nadegemarcelin78 et meminiandmove ; xxewwer avait relevé à 21:21
            // et sondait 401 à 21:39. Le worker ne porte pas la session de
            // l'onglet : son 401 ne prouve rien. Seule une page de connexion
            // VUE par l'onglet (noterSessionDeconnectee → http.opla =
            // "login_redirect_observee") retient ; un code numérique, jamais.
            if (pf === "opla" && String(httpDe["opla"] ?? "") !== "login_redirect_observee") continue;
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

    // ── L'ATTENTE DE SESSION S'ESPACE, POUR TOUS LES BUILDS (2026-09-24) ─────
    // Deborah : 101 passages horaires sur beebs.app depuis le 17/09. Les
    // extensions ≤ 0.6.65 re-posent l'échéance à +1 h à chaque observation ;
    // on tient ici le barème (1 h ×3, puis 3 h, puis 6 h — _shared/
    // attente-session.js) : le job reste pending, intact, simplement pas servi
    // avant son heure. Une preuve « connecté » postérieure (sonde, ou compte vu
    // sur la page en 0.6.66) le rend aussitôt ; handler-watch efface alors le
    // message d'attente, ce qui le sort d'ici de toute façon.
    if (!includeProcessing && !includeNeedsUser && out.some((j) => (j.platform_fields as Record<string, unknown> | null)?.["attente_session"])) {
      try {
        const { data: profA } = await userClient
          .from("profiles").select("extension_sessions").eq("id", user.id).maybeSingle();
        const sessionsA = (profA?.extension_sessions ?? null) as Record<string, unknown> | null;
        const avantA = out.length;
        out = out.filter((j) => !attenteSessionEncoreEspacee(j, sessionsA));
        if (out.length !== avantA) {
          console.log(`[get-pending-jobs] userId=${user.id} : ${avantA - out.length} job(s) en attente de session espacée (pending, intacts)`);
        }
      } catch (_e) { /* best-effort : lecture illisible → on distribue comme avant */ }
    }

    // ── UN POSTE SANS ACCÈS OPLA NE REÇOIT AUCUN JOB OPLA (2026-09-24) ───────
    // Il ne le prendrait que pour le parquer « Autorise Opla » — un geste que
    // le poste autorisé du même compte a déjà fait. Le job reste en file pour
    // lui ; s'il n'y a aucun poste autorisé, handler-watch pose la demande.
    if (posteSansOpla) {
      const avantN = out.length;
      out = out.filter((j) => j.platform !== "opla");
      if (out.length !== avantN) {
        console.log(`[get-pending-jobs] userId=${user.id} poste ${posteCourt(sessionId)} sans accès Opla : ${avantN - out.length} job(s) Opla laissé(s) en file pour un poste autorisé`);
      }
    }

    // ── PORTE « FORMULAIRE PRO LEBONCOIN » : RETENU JUSQU'À L'EXTENSION QUI
    // SAIT LE NOMMER (2026-09-17, GO Nico) ──────────────────────────────────
    // CE QUE ÇA A COÛTÉ : MeMiniandMove (compte Leboncoin PRO) — 8 jobs failed
    // à 5/5, 15 en file, 0 annonce publiée ; Victor (même formulaire), 5
    // failed le 11/09. Le formulaire d'un compte PRO tient sur UNE page et
    // porte deux critères requis que l'extension ≤ 0.6.40 ne remplit pas et
    // ne sait pas nommer : « Poids du colis » (estimated_parcel_weight, aucun
    // code ne l'a jamais rempli) et « Quantité » (quantity — une COMBOBOX sur
    // le formulaire pro, là où le code vise un input texte). Chaque tentative
    // meurt sur le même refus sans nom, cinq fois, puis failed. Mesuré le
    // 17/09 sur ses 7 essais 0.6.40 : la couleur (v69) n'y change rien,
    // Leboncoin la pré-remplissait déjà depuis le titre. La 0.6.41 (5940db9)
    // transforme ce refus en needs_user NOMMÉ, liste relevée sur place →
    // mini-éditeur du Stock. Avant elle, tenter = brûler.
    //
    // RÈGLE. Un job publish Leboncoin d'un compte PRO est RETENU (reste
    // 'pending', aucune tentative consommée) tant que l'extension appelante
    // est plus ancienne que `coin_config.lbc_pro_extension_min`, et RELÂCHÉ au
    // premier poll d'une extension à jour — sans geste, sans surveillance.
    //   · Compte PRO = preuve portée par le compte lui-même : `custom_ref`
    //     (Référence) ou `general_sales_condition` (CGV) relevés dans l'erreur
    //     d'un de ses jobs Leboncoin — marqueurs du 10/09 : 18/18 chez les
    //     comptes pro, 0/7 chez les particuliers. Un compte pro jamais tenté
    //     n'a pas de preuve : son premier job tourne une fois, la produit, et
    //     tout le reste est retenu dès le poll suivant.
    //   · Réglage : coin_config.lbc_pro_extension_min, ENTIER =
    //     major×10000 + minor×100 + patch (0.6.41 → 641). 0 ou clé absente =
    //     porte OUVERTE : rien n'est retenu, et tout ce qui l'était est
    //     relâché. C'est LE geste unique pour forcer avant la mise à jour :
    //     `update coin_config set value = 0 where key = 'lbc_pro_extension_min'`.
    //   · Retenue ÉCRITE une fois par job : marqueur `porte_pro_lbc`, message
    //     lisible (à la place de « corrige l'annonce… », qui demandait un
    //     geste impossible) et next_action_after à +7 j. Le rendez-vous
    //     futur tient la porte de reprise espacée de l'extension (ceinture si
    //     un job passait quand même) ET exclut le job du mail
    //     job_pending_relaunch (email-tunnel : « un job qui a un rendez-vous
    //     n'attend pas un humain »). Re-stampé seulement quand il expire.
    //   · Relâche = marqueur retiré, rendez-vous retiré, message effacé, job
    //     servi dans la MÊME réponse — l'extension à jour le traite au poll
    //     qui la révèle.
    //   · Périmètre : poll d'EXÉCUTION seul (le popup voit la file entière),
    //     action publish seule (retraits et republications intacts).
    //     Best-effort : réglage, preuve ou écriture illisibles → le poll
    //     distribue comme avant, jamais un point de panne.
    // Motif RÉÉCRIT le 17/09 soir : le relevé 0.6.41 de MeMiniandMove (15 jobs)
    // a montré que Quantité est pré-remplie par Leboncoin ; les DEUX listes
    // que le formulaire pro marque en erreur sont « État » et « Poids du
    // colis » — deux comboboxes rendues APRÈS les autres critères, que
    // l'extension ≤ 0.6.41 ne trouvait pas au moment du remplissage (elle
    // demandait alors un état qu'elle avait déjà). La 0.6.42 les pose
    // (seconde passe, ancrage par libellé, relecture après clic).
    const MSG_LBC_PRO_ATTENTE =
      "Ton compte Leboncoin est un compte pro : son formulaire porte deux listes (État, Poids du colis) " +
      "que la version actuelle de l'extension FillSell ne remplit pas encore. " +
      "La mise à jour de l'extension arrive toute seule par Chrome, et cette publication repart alors sans geste de ta part. " +
      "Rien n'a été publié, rien à corriger.";
    let heldLbcPro = 0;
    let relachesLbcPro = 0;
    if (!includeProcessing && !includeNeedsUser) {
      try {
        // republish AUSSI (2026-09-17, republication Leboncoin) : le redépôt
        // passe par le même formulaire pro — même porte, même relâchement.
        const estPublishLbc = (j: { platform: string; action: string | null }) =>
          j.platform === "leboncoin" && ((j.action ?? "publish") === "publish" || j.action === "republish");
        const pfDe = (j: { platform_fields: unknown }) =>
          ((j.platform_fields && typeof j.platform_fields === "object") ? j.platform_fields : {}) as Record<string, unknown>;
        const candidats = out.filter(estPublishLbc);
        if (candidats.length) {
          const { data: cfgMin } = await userClient
            .from("coin_config").select("value").eq("key", "lbc_pro_extension_min").maybeSingle();
          const minCode = Number(cfgMin?.value ?? 0);
          // Même encodage que la clé : 0.6.41 → 641. Version absente ou
          // illisible = 0 : un build trop vieux pour se nommer n'a pas le
          // correctif.
          const codeVersion = (v: string): number => {
            const m = String(v ?? "").trim().match(/^(\d+)\.(\d+)\.(\d+)/);
            return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : 0;
          };
          const extCode = codeVersion(version);
          const porteOuverte = !(Number.isFinite(minCode) && minCode > 0) || extCode >= minCode;
          const marques = candidats.filter((j) => pfDe(j)["porte_pro_lbc"] != null);
          if (porteOuverte) {
            for (const j of marques) {
              const pf = { ...pfDe(j) };
              delete pf["porte_pro_lbc"];
              delete pf["next_action_after"];
              const { error: uErr } = await userClient.from("cross_post_jobs")
                .update({ error: null, platform_fields: pf })
                .eq("id", j.id).eq("status", "pending");
              if (uErr) {
                console.warn(`[get-pending-jobs] porte pro Leboncoin : relâche du job ${String(j.id).slice(0, 8)} non écrite (${uErr.message}) — job servi tel quel`);
                continue;
              }
              (j as unknown as Record<string, unknown>).platform_fields = pf;
              relachesLbcPro++;
            }
            if (relachesLbcPro) {
              console.log(
                `[get-pending-jobs] userId=${user.id} : porte pro Leboncoin OUVERTE (extension ${version || "?"} = ${extCode}, ` +
                `min ${minCode}) → ${relachesLbcPro} job(s) relâché(s) et servi(s)`,
              );
            }
          } else {
            let pro = marques.length > 0;
            if (!pro) {
              const { data: preuve } = await userClient
                .from("cross_post_jobs").select("id")
                .eq("platform", "leboncoin")
                .or("error.ilike.*custom_ref*,error.ilike.*general_sales_condition*")
                .limit(1);
              pro = (preuve ?? []).length > 0;
            }
            if (pro) {
              const maintenant = Date.now();
              const rdv = new Date(maintenant + 7 * 24 * 3_600_000).toISOString();
              for (const j of candidats) {
                const pf = pfDe(j);
                const ancien = (pf["porte_pro_lbc"] && typeof pf["porte_pro_lbc"] === "object")
                  ? pf["porte_pro_lbc"] as Record<string, unknown> : null;
                const echeance = Date.parse(String(pf["next_action_after"] ?? ""));
                const rdvTient = Number.isFinite(echeance) && echeance > maintenant + 24 * 3_600_000;
                if (ancien && rdvTient) continue; // déjà retenu, rendez-vous valide : rien à écrire
                const marque = {
                  depuis: String(ancien?.depuis ?? new Date(maintenant).toISOString()),
                  motif: "formulaire Leboncoin pro : Poids du colis + Quantité non remplis par une extension trop ancienne",
                  extension_vue: version || null,
                  extension_min: minCode,
                  rendez_vous: rdv,
                  next_action_after_avant: ancien ? (ancien.next_action_after_avant ?? null) : (pf["next_action_after"] ?? null),
                  pose_par: "get-pending-jobs",
                };
                // L'erreur précédente n'est JAMAIS perdue (2026-09-17 soir, règle Nico :
                // « on a déjà perdu deux fois l'information en relançant avec
                // error = null ») : elle part dans erreurs_archivees, même forme
                // que l'app (archiverErreur), avant que le message de retenue
                // ne prenne sa place.
                const erreurAvant = String((j as unknown as { error?: unknown }).error ?? "").trim();
                const archives = Array.isArray(pf["erreurs_archivees"]) ? (pf["erreurs_archivees"] as unknown[]) : [];
                const archivesApres = erreurAvant && erreurAvant !== MSG_LBC_PRO_ATTENTE
                  ? [...archives, { at: new Date(maintenant).toISOString(), error: erreurAvant.slice(0, 2000), status: "pending", motif: "porte_pro_lbc (retenue)" }].slice(-12)
                  : archives;
                const { error: uErr } = await userClient.from("cross_post_jobs")
                  .update({ error: MSG_LBC_PRO_ATTENTE, platform_fields: { ...pf, porte_pro_lbc: marque, next_action_after: rdv, ...(archivesApres.length ? { erreurs_archivees: archivesApres } : {}) } })
                  .eq("id", j.id).eq("status", "pending");
                if (uErr) console.warn(`[get-pending-jobs] porte pro Leboncoin : retenue du job ${String(j.id).slice(0, 8)} non écrite (${uErr.message}) — retenu quand même pour ce poll`);
              }
              const ids = new Set(candidats.map((j) => String(j.id)));
              out = out.filter((j) => !ids.has(String(j.id)));
              heldLbcPro = ids.size;
              console.log(
                `[get-pending-jobs] userId=${user.id} : porte pro Leboncoin FERMÉE (extension ${version || "?"} = ${extCode} < min ${minCode}) ` +
                `→ ${heldLbcPro} job(s) publish Leboncoin retenu(s) en pending, aucune tentative consommée : ` +
                `${candidats.map((j) => String(j.id).slice(0, 8)).join(", ")}`,
              );
            }
          }
        }
      } catch (e) {
        console.warn(`[get-pending-jobs] porte pro Leboncoin : ${String((e as Error)?.message ?? e)} — distribution normale`);
      }
    }

    // ══ UNE REPUBLICATION D'ANNONCE EN LIGNE A FORCÉMENT UNE CATÉGORIE ══════
    // (2026-09-19) Les jobs de republication sont écrits par la RPC
    // spend_coins_and_republish, qui ne pose aucun platform_fields : un
    // redépôt Leboncoin partait donc SANS lbcCategoryPath, le content script
    // rendait « platform_fields.lbcCategoryPath absent », et update-job-status
    // le traduisait en « Cet article n'a pas encore de catégorie sur cette
    // plateforme. Régénère son annonce depuis l'app. »
    // C'est faux deux fois : l'annonce EST en ligne, donc elle a une
    // catégorie ; et cette catégorie est chez nous depuis le relevé, dans
    // annonces_plateforme.capture. On demandait à la personne de refaire un
    // travail déjà fait.
    // MESURÉ sur 7 jours : 30 republications Leboncoin servies sans chemin,
    // 23 en needs_user, et les 30 avaient leur catégorie en base.
    //
    // ⛔ LEBONCOIN NE CAPTURE QUE LA FEUILLE (« Livres », « Ameublement »),
    //    jamais la racine. On la RÉSOUT contre l'arbre relevé — les 79
    //    libellés de feuille y sont UNIQUES (vérifié : zéro doublon), donc la
    //    racine est déterminée, pas devinée. Aucune liste écrite à la main.
    // ⛔ On écrit seulement là où il n'y a RIEN. Un chemin déjà posé — par
    //    l'app, ou à la main — n'est jamais touché.
    // ⛔ Statut 'pending' au moment de l'écriture : jamais un job qu'un
    //    content script a déjà pris (règle du 12/09).
    // ⛔ Périmètre : Leboncoin, action 'republish'. Les autres plateformes et
    //    les publications neuves ne sont pas touchées — leur chemin vient de
    //    l'app, et le trou mesuré est ici.
    try {
      const pfDeJob = (j: { platform_fields: unknown }) =>
        ((j.platform_fields && typeof j.platform_fields === "object") ? j.platform_fields : {}) as Record<string, unknown>;
      // Toutes les republications Leboncoin en attente, pas seulement celles
      // sans catégorie : la capture porte dix champs, et chacun peut manquer
      // indépendamment des autres.
      // ⚠️ `needs_user` EN PLUS DE `pending` (2026-09-20) : le job de XEWER est
      //    resté 12 h hors ligne EN needs_user, et ce filtre ne le regardait
      //    même pas. Un job bloqué est justement celui à qui il manque
      //    quelque chose — c'est le premier à compléter, pas le dernier.
      //    On ne touche QUE ses platform_fields ; le statut est traité plus
      //    bas, et seulement quand la cause du blocage vient de disparaître.
      const aCombler = out.filter((j) =>
        j.action === "republish" && j.platform === "leboncoin" &&
        (j.status === "pending" || j.status === "needs_user") &&
        j.inventaire_id != null
      );
      // ── ET LES BLOQUÉS, QUE LA FILE NE MONTRE PAS (2026-09-20) ────────────
      // Un job `needs_user` n'est servi que quand le POPUP le demande
      // (include_needs_user) — le background, lui, ne voit que 'pending'. Or
      // c'est exactement dans cet angle mort qu'une annonce reste hors ligne :
      // retirée, bloquée, invisible du poll qui aurait pu la compléter.
      // Une requête, bornée, indexée (user_id + status), 20 lignes au plus.
      const dejaVus = new Set(aCombler.map((j) => String(j.id)));
      const { data: bloques } = await userClient
        .from("cross_post_jobs")
        .select("id, platform, action, status, title, description, price, photos, photo_option, platform_fields, inventaire_id, listing_url, platform_listing_id, created_at, error")
        .eq("platform", "leboncoin").eq("action", "republish")
        .in("status", ["needs_user", "failed"])
        .not("inventaire_id", "is", null)
        .limit(20);
      for (const b of (bloques ?? [])) {
        if (!dejaVus.has(String((b as { id: unknown }).id))) aCombler.push(b as typeof aCombler[number]);
      }
      if (aCombler.length) {
        const ids = [...new Set(aCombler.map((j) => j.inventaire_id))];
        const { data: annonces } = await userClient
          .from("annonces_plateforme")
          .select("inventaire_id, capture, vu_le")
          .eq("platform", "leboncoin")
          .in("inventaire_id", ids)
          .order("vu_le", { ascending: false });
        // La plus récemment vue gagne, par article.
        const categorieDe = new Map<number, string>();
        for (const a of (annonces ?? [])) {
          const inv = (a as { inventaire_id: number }).inventaire_id;
          if (categorieDe.has(inv)) continue;
          const c = ((a as { capture?: { categorie?: unknown } }).capture ?? {})?.categorie;
          const s = String(c ?? "").trim();
          if (s) categorieDe.set(inv, s);
        }
        // ── ET PAS SEULEMENT LA CATÉGORIE (2026-09-19 soir) ─────────────────
        // La capture porte DIX champs, pas un. Une annonce en ligne a son
        // texte, son état, sa marque, sa couleur, sa matière, sa taille — tout
        // cela est en base depuis le relevé, et la republication repartait
        // sans rien. Mesuré : une annonce de Louis est restée RETIRÉE 13
        // minutes sur « Leboncoin demande : État », alors que la capture
        // portait « État neuf », valeur exacte de la liste relevée pour sa
        // catégorie.
        // ⛔ ON NE COMBLE QUE LE VIDE. Une valeur déjà posée — par l'app, par
        //    la personne, par une réponse à un needs_user — n'est jamais
        //    écrasée : elle est plus récente que le relevé.
        // ⚠️ CE N'EST PAS LE DÉBLOCAGE. Mesuré sur les 26 republications en
        //    file de ce compte : 2 passent, 24 restent bloquées, et toujours
        //    sur Produit (12), Genre (7), Univers (5), Type (2), Quantité (1)
        //    — les champs que la capture ne prend PAS. Tant que le relevé ne
        //    garde pas `ad.attributes` entier, aucune hydratation serveur ne
        //    peut les inventer. Ce bloc rend ce qu'on a, rien de plus.
        const CHAMPS_CAPTURE: Array<[string, string]> = [
          ["etat", "etat"], ["marque", "marque"], ["couleur", "couleur"],
          ["matiere", "matiere"], ["taille", "taille"],
        ];
        // ── ET QUAND L'ANNONCE N'EXISTE PLUS, L'ARTICLE, LUI, EST TOUJOURS LÀ ─
        // Une annonce RETIRÉE n'a plus de capture — et n'en aura plus jamais.
        // Mais `inventaire.attributs` a gardé ce qu'on savait d'elle : c'est
        // la mémoire consolidée de l'article, avec sa priorité de source
        // (manuel > vinted_detail > capture > vinted_liste > lens).
        // MESURÉ le 20/09 sur le job 60c19562 : la catégorie une fois posée,
        // Leboncoin a réclamé « État » — et l'article portait
        // attributs.etat = « Très bon état » depuis la veille, pendant que le
        // job partait avec etat = null. On avait la réponse et on ne la
        // lisait pas.
        const attributsDe = new Map<number, Record<string, unknown>>();
        try {
          const { data: articles } = await userClient
            .from("inventaire").select("id, attributs").in("id", ids);
          for (const a of (articles ?? [])) {
            const at = (a as { attributs?: unknown }).attributs;
            if (at && typeof at === "object") attributsDe.set((a as { id: number }).id, at as Record<string, unknown>);
          }
        } catch (_e) { /* best-effort : sans les attributs, on sert ce qu'on a */ }
        const captureDe = new Map<number, Record<string, unknown>>();
        for (const a of (annonces ?? [])) {
          const inv = (a as { inventaire_id: number }).inventaire_id;
          if (captureDe.has(inv)) continue;
          const cap = (a as { capture?: unknown }).capture;
          if (cap && typeof cap === "object") captureDe.set(inv, cap as Record<string, unknown>);
        }
        let poses = 0;
        const sansCategorie: string[] = [];
        for (const j of aCombler) {
          const cap = captureDe.get(j.inventaire_id as number) ?? {};
          const pf = { ...pfDeJob(j) };
          const repris: Record<string, string> = {};
          const brut = categorieDe.get(j.inventaire_id as number);
          let categorieParUrl = false;
          if (brut) {
            const chemin = cheminLbcDepuisFeuille(brut);
            if (!chemin) sansCategorie.push(`${String(j.id).slice(0, 8)} (« ${brut} » hors arbre)`);
            else if (!pf["lbcCategoryPath"]) { pf["lbcCategoryPath"] = chemin; repris["categorie"] = brut; }
          }
          // ── LE RELEVÉ N'A RIEN : L'ADRESSE, ELLE, A TOUT ──────────────────
          // Une annonce déjà RETIRÉE ne sera plus jamais re-capturée : son
          // relevé est vide et le restera. Mais l'adresse d'origine porte le
          // slug de sa feuille, et le job la garde (old_listing_url, ou la
          // copie du dépôt). C'est la seule voie qui ne demande RIEN à
          // personne — ni relevé, ni extension, ni geste.
          if (!pf["lbcCategoryPath"]) {
            const url = (j as { listing_url?: unknown }).listing_url
              ?? pf["old_listing_url"]
              ?? ((pf["republish_snapshot"] as Record<string, unknown> | undefined)?.["listing_url"]);
            const parUrl = cheminLbcDepuisUrl(url);
            if (parUrl) {
              pf["lbcCategoryPath"] = parUrl;
              repris["categorie"] = `${parUrl.join(" > ")} (lue dans l'adresse de l'annonce)`;
              categorieParUrl = true;
            } else {
              sansCategorie.push(String(j.id).slice(0, 8));
            }
          }
          const attrs = attributsDe.get(j.inventaire_id as number) ?? {};
          for (const [cleCapture, clePf] of CHAMPS_CAPTURE) {
            if (String(pf[clePf] ?? "").trim()) continue; // déjà posé : on n'écrase pas
            // La capture de l'annonce d'abord (c'est ce que la plateforme
            // AFFICHE), l'article ensuite (c'est ce qu'on a gardé quand
            // l'annonce a disparu). `{v, source, at}` : seule `v` nous
            // intéresse ici, la priorité de source est déjà tranchée en base.
            const vCapture = String(cap[cleCapture] ?? "").trim();
            const noeud = attrs[clePf];
            const vArticle = (noeud && typeof noeud === "object")
              ? String((noeud as Record<string, unknown>)["v"] ?? "").trim() : "";
            const v = vCapture || vArticle;
            if (!v) continue;
            pf[clePf] = v;
            repris[clePf] = vCapture ? v : `${v} (repris de l'article)`;
          }
          // ── OÙ EST L'ANNONCE (2026-09-22) ─────────────────────────────────
          // Une republication rejoue l'annonce d'origine à l'identique : sa
          // LOCALISATION en fait partie, au même titre que son prix. Le job
          // af34f609 (nicolas.menar) l'a payé — annonce de Roost-Warendin
          // (59286) supprimée, recréation retombée sur l'« Adresse de remise »
          // des Réglages, Réglages vides, 11 minutes hors ligne.
          // On la pose à part (`localisation_origine`), JAMAIS dans `adresse` :
          // `adresse` est l'adresse des Réglages, et les deux ne doivent pas se
          // confondre — c'est le handler qui arbitre, et seulement sur une
          // republication (cf. leboncoin.js, fillAddress).
          const locCap = (cap["localisation"] && typeof cap["localisation"] === "object")
            ? cap["localisation"] as Record<string, unknown> : null;
          if (locCap && !pf["localisation_origine"]) {
            const ville = String(locCap["ville"] ?? "").trim();
            const cp = String(locCap["code_postal"] ?? "").trim();
            const voie = String(locCap["voie"] ?? "").trim();
            if (ville || cp) {
              pf["localisation_origine"] = {
                ville: ville || null, code_postal: cp || null, voie: voie || null,
                libelle: String(locCap["libelle"] ?? "").trim() || [ville, cp].filter(Boolean).join(" "),
                pose_par: "get-pending-jobs (capture de l'annonce)",
              };
              repris["localisation"] = (pf["localisation_origine"] as Record<string, unknown>)["libelle"] as string;
            }
          }
          // ── LES CRITÈRES DU FORMULAIRE, REPRIS DE L'ANNONCE (0.6.47) ──────
          // Le trou nommé le 19/09 — « tant que le relevé ne garde pas
          // `ad.attributes` entier, aucune hydratation serveur ne peut les
          // inventer » — est comblé : la 0.6.47 garde les attributs ENTIERS,
          // et 44 annonces du parc en portent déjà (relevées cette nuit).
          // CE QUI DISTINGUE UN CRITÈRE D'UN ROUAGE : `key_label`. Leboncoin
          // ne le renseigne que pour ce qui est un CHAMP DE FORMULAIRE
          // (« Marque », « Modèle », « Univers », « Type de vêtement »…) ; les
          // rouages techniques (rating_score, profile_picture_url,
          // is_bundleable, shipping_type…) l'ont à null. C'est le tri, et il
          // vient de Leboncoin, pas de nous.
          // ⛔ ON NE COMBLE QUE LE VIDE — même règle que les champs ci-dessus.
          // ⛔ HORS LISTE IMPOSSIBLE PAR CONSTRUCTION : la valeur qu'on repose
          //    est celle que Leboncoin AFFICHE sur cette annonce, dans cette
          //    catégorie. Elle a déjà été acceptée par son propre formulaire.
          //    On repose `value_label` (« Microsoft »), jamais le code interne
          //    (« microsoft ») : c'est le libellé que le wizard fait choisir.
          const bruts = Array.isArray(cap["attributs_bruts"]) ? cap["attributs_bruts"] as Array<Record<string, unknown>> : [];
          if (bruts.length) {
            const aspects = { ...((pf["lbcAspects"] && typeof pf["lbcAspects"] === "object") ? pf["lbcAspects"] as Record<string, unknown> : {}) };
            const posesAsp: string[] = [];
            for (const b of bruts) {
              const cle = String(b?.["key"] ?? "").trim();
              const libelle = String(b?.["key_label"] ?? "").trim();   // null ⇒ rouage technique
              const valeur = String(b?.["value_label"] ?? "").trim();
              if (!cle || !libelle || !valeur) continue;
              if (String(aspects[cle] ?? "").trim()) continue;          // déjà posé : on n'écrase pas
              aspects[cle] = valeur;
              posesAsp.push(`${libelle} ← « ${valeur} »`);
            }
            if (posesAsp.length) {
              pf["lbcAspects"] = aspects;
              repris["criteres"] = posesAsp.join(" ; ");
            }
          }
          // La description vit dans une COLONNE, pas dans platform_fields.
          const descCapture = String(cap["description"] ?? "").trim();
          const descManque = !String((j as { description?: unknown }).description ?? "").trim();
          const nouvelleDesc = descManque && descCapture ? descCapture : null;
          // ── UNE ANNONCE RETIRÉE QUI N'EST PAS REVENUE : ON LA REPREND ─────
          // C'est le pire état possible — l'annonce n'existe plus nulle part.
          // Quand un job en est là, une reprise ne coûte RIEN (il est déjà
          // payé : aucune pépite, aucun quota, aucun débit) et ne peut que
          // l'améliorer. Si le redépôt échoue encore, le job redevient
          // failed/needs_user et y reste.
          // ⛔ UNE SEULE FOIS, et c'est tracé (`lbc_reprise_auto`). Sans cette
          //    borne, un job qui rebloque repartirait en boucle.
          // ⛔ `failed` COMPTE AUTANT QUE `needs_user` : « Picture Organic
          //    Clothing » était failed, et son annonce est restée hors ligne
          //    59 HEURES.
          // ⛔ Ce n'est PAS la garde « sais-tu tout remplir ? » refusée le
          //    19/09 : celle-là retenait des jobs AVANT le retrait. Celle-ci
          //    ne peut que remettre en route ce qui est déjà tombé.
          // ⛔ LA BORNE N'EST PAS « UNE FOIS POUR TOUJOURS », ELLE EST « UNE
          //    FOIS PAR CAUSE LEVÉE » — et c'est la mesure qui l'a imposé :
          //    la première reprise du job 60c19562 a franchi la catégorie et
          //    buté sur l'État. Avec une borne absolue, il serait resté hors
          //    ligne malgré le correctif suivant. On redonne donc une chance
          //    CHAQUE FOIS QU'ON VIENT D'AJOUTER quelque chose qui manquait
          //    (`repris` non vide) — ce qui ne peut pas boucler, puisqu'un
          //    champ posé une fois n'est plus jamais « ajouté ». Plafond dur
          //    à 3 par sécurité.
          const statutJob = (j as { status?: unknown }).status;
          const repriseAuto = (pf["lbc_reprise_auto"] && typeof pf["lbc_reprise_auto"] === "object")
            ? pf["lbc_reprise_auto"] as Record<string, unknown> : null;
          const nReprises = Number(repriseAuto?.["n"] ?? (repriseAuto || pf["lbc_reprise_categorie_url"] ? 1 : 0));
          const estHorsLigne =
            (statutJob === "needs_user" || statutJob === "failed") &&
            pf["republish_step"] === "deleted" &&
            nReprises < 3 &&
            (nReprises === 0 || Object.keys(repris).length > 0);
          // ── LA LIVRAISON DE L'ANNONCE, REPRISE AU REDÉPÔT (2026-09-24) ─────
          // Audit du 23/09 : un réglage fait À LA MAIN sur Leboncoin
          // (transporteurs, format) était perdu à la republication — la
          // capture ne portait que état/marque/couleur/matière/taille. Elle
          // porte `ad.attributes` entier depuis la 0.6.47, et `values` depuis
          // la 0.6.65 : shipping_type = TOUS les transporteurs de l'annonce,
          // estimated_parcel_size = S/M/L, estimated_parcel_weight = grammes.
          // ⛔ ON NE COMBLE QUE LE VIDE : un choix fait dans l'app (carte
          //    Livraison) prime toujours. ⛔ Calculé APRÈS estHorsLigne : la
          //    livraison n'est pas une cause de blocage, elle ne doit pas
          //    déclencher de reprise à elle seule.
          {
            const attrLbc = (k: string) => bruts.find((b) => String(b?.["key"] ?? "") === k) ?? null;
            const NOMS: Record<string, string> = {
              courrier_suivi: "Courrier suivi", shop2shop: "Shop2Shop by Chronopost",
              mondial_relay: "Mondial Relay", colissimo: "Colissimo",
            };
            const liv: string[] = [];
            const ship = attrLbc("shipping_type");
            const vals = Array.isArray(ship?.["values"]) ? (ship!["values"] as unknown[]).map(String) : null;
            if (vals && !Array.isArray(pf["lbcTransporteurs"])) {
              const noms = vals.map((v) => NOMS[v]).filter(Boolean);
              if (noms.length) { pf["lbcTransporteurs"] = noms; liv.push(`transporteurs ← ${noms.join(", ")}`); }
            }
            const taille = String(attrLbc("estimated_parcel_size")?.["value"] ?? "").trim().toUpperCase();
            const FORMATS: Record<string, string> = { S: "Petit", M: "Moyen", L: "Volumineux" };
            if (FORMATS[taille] && !String(pf["format_colis"] ?? "").trim() && !String(pf["lbcFormatColis"] ?? "").trim()) {
              pf["format_colis"] = FORMATS[taille]; liv.push(`format ← ${FORMATS[taille]}`);
            }
            const grammes = Number(attrLbc("estimated_parcel_weight")?.["value"]);
            if (Number.isFinite(grammes) && grammes > 0 && !(Number(pf["lbcPoidsGrammes"]) > 0)) {
              pf["lbcPoidsGrammes"] = Math.round(grammes); liv.push(`poids ← ${Math.round(grammes)} g`);
            }
            if (liv.length) repris["livraison"] = liv.join(" ; ");
          }
          // ⚠️ ET ELLE PASSE MÊME SI ON N'A RIEN À COMPLÉTER. Sans cette
          //    porte, « Picture Organic Clothing » sortait ici : sa catégorie
          //    était déjà posée, son annonce déjà retirée (donc plus aucun
          //    relevé à reprendre) — `repris` était vide, on passait au
          //    suivant, et elle restait hors ligne. Ce n'est pas parce qu'il
          //    n'y a rien à COMPLÉTER qu'il n'y a rien à FAIRE.
          const rienACompleter = !Object.keys(repris).length && !nouvelleDesc;
          if (rienACompleter && !estHorsLigne) continue;
          if (nouvelleDesc) repris["description"] = `${descCapture.length} caractères`;
          if (!rienACompleter) {
            pf["champs_repris_de_l_annonce"] = {
              le: new Date().toISOString(),
              pose_par: "get-pending-jobs (annonce en ligne relevée — annonces_plateforme.capture)",
              repris,
            };
          }
          const patch: Record<string, unknown> = { platform_fields: pf };
          if (nouvelleDesc) patch["description"] = nouvelleDesc;
          // Rien d'autre ne bouge : ni tentatives consommées, ni débit, ni
          // ordonnancement, ni créneaux.
          if (estHorsLigne) {
            pf["lbc_reprise_auto"] = {
              le: new Date().toISOString(), n: nReprises + 1,
              categorie_par_url: categorieParUrl,
              ajoute: Object.keys(repris).join(", ") || "(rien à ajouter — annonce hors ligne)",
            };
            patch["platform_fields"] = pf;
            patch["status"] = "pending";
            patch["error"] = null;
          }
          const { error: uErr } = await userClient.from("cross_post_jobs")
            .update(patch).eq("id", j.id).eq("status", (j as { status: string }).status);
          if (uErr) {
            console.warn(`[get-pending-jobs] champs de l'annonce : job ${String(j.id).slice(0, 8)} non écrit (${uErr.message}) — servi tel quel`);
            continue;
          }
          (j as unknown as Record<string, unknown>).platform_fields = pf;
          if (nouvelleDesc) (j as unknown as Record<string, unknown>).description = nouvelleDesc;
          poses++;
          console.log(`[get-pending-jobs] republication ${String(j.id).slice(0, 8)} complétée depuis l'annonce en ligne : ${Object.entries(repris).map(([k, v]) => `${k} ← « ${v} »`).join(" ; ")}`);
        }
        if (poses) {
          console.log(`[get-pending-jobs] user=${user.id} : ${poses} republication(s) Leboncoin complétée(s) depuis l'annonce en ligne`);
        }
        if (sansCategorie.length) {
          console.warn(`[get-pending-jobs] user=${user.id} : ${sansCategorie.length} republication(s) Leboncoin sans catégorie retrouvable — ${sansCategorie.join(", ")}`);
        }
      }
    } catch (e) {
      console.warn(`[get-pending-jobs] catégorie d'origine : ${String((e as Error)?.message ?? e)} — distribution normale`);
    }

    // ══ BEEBS : SA CATÉGORIE EST DÉJÀ CHEZ NOUS (2026-09-20) ═══════════════
    // DÉFAUT MESURÉ, job 4e5f3abe (nicolas.svobodny, PRO, 19/09 23:39) — une
    // robe Camaïeu rattachée à la main le 17/09 à une annonce Beebs déjà en
    // ligne. La republication l'a RETIRÉE, puis n'a pas pu la redéposer :
    // « platform_fields.beebsCategoryPath absent — article non mappé ». Et on
    // a affiché « Relance une synchronisation de tes annonces » — une consigne
    // de manœuvre, pour réparer un trou qui est chez nous.
    //
    // Or le relevé du 17/09 22:13 portait, mot pour mot :
    //   capture.categorie = « Mode > Femme > Vêtements (femme) > Robes (femme)
    //                         > Autres robes (femme) »
    // c'est-à-dire EXACTEMENT la forme que `beebsCategoryPath` attend (cf.
    // src/utils/beebsCategories.js et selectCategory dans beebs.js). On avait
    // la réponse en base et on demandait à la personne d'aller la rechercher.
    //
    // ⛔ POURQUOI ICI ET PAS DANS L'APP : un article RATTACHÉ n'est jamais passé
    //    par le stepper, donc personne n'a jamais calculé sa catégorie Beebs.
    //    Le seul endroit qui voit à la fois le job et le relevé, c'est le
    //    service des jobs — et il atteint TOUS les builds d'extension, sans
    //    passer par le Chrome Web Store.
    // ⛔ ON NE COMBLE QUE LE VIDE : un chemin déjà posé n'est jamais écrasé.
    // ⛔ ET ON NE REMET RIEN EN ROUTE ICI. Poser la catégorie ne relance pas le
    //    job : c'est la reprise Leboncoin ci-dessus qui décide des statuts, et
    //    elle ne touche pas à Beebs. Un job Beebs bloqué repart quand la
    //    personne le relance, ou quand la passe de reprise le reprendra.
    try {
      const pfB = (j: Record<string, unknown>) =>
        ((j.platform_fields && typeof j.platform_fields === "object") ? j.platform_fields : {}) as Record<string, unknown>;
      // ⚠️ Pas seulement « sans catégorie » : le relevé porte aussi l'état, la
      //    marque, la taille ET LA DESCRIPTION, et chacun peut manquer
      //    indépendamment. Mesuré : avec un filtre qui ne regardait que la
      //    catégorie et les trois champs, le job 4e5f3abe — déjà complété — ne
      //    repassait plus par ce bloc, et sa description restait vide.
      const beebsACombler = (out as unknown as Array<Record<string, unknown>>)
        .filter((j) => j.platform === "beebs" && j.inventaire_id != null
          && (!Array.isArray(pfB(j)["beebsCategoryPath"])
            || ["etat", "marque", "taille"].some((c) => !String(pfB(j)[c] ?? "").trim())
            || String(j["description"] ?? "").trim().length < 5));
      if (beebsACombler.length) {
        const ids = [...new Set(beebsACombler.map((j) => Number(j.inventaire_id)))];
        const { data: annonces } = await userClient
          .from("annonces_plateforme").select("inventaire_id, capture, vu_le")
          .eq("platform", "beebs").in("inventaire_id", ids)
          .order("vu_le", { ascending: false });
        const cheminDe = new Map<number, string[]>();
        const captureDeB = new Map<number, Record<string, unknown>>();
        for (const a of (annonces ?? [])) {
          const inv = Number((a as { inventaire_id: number }).inventaire_id);
          if (cheminDe.has(inv) || captureDeB.has(inv)) continue;
          const cap = (a as { capture?: unknown }).capture;
          if (cap && typeof cap === "object") captureDeB.set(inv, cap as Record<string, unknown>);
          const brut = String((cap as { categorie?: unknown } | null ?? {})?.categorie ?? "").trim();
          // ⚠️ AU MOINS DEUX NIVEAUX. « Mode » seul n'est pas une feuille : le
          //    poser ferait échouer selectCategory plus loin, en silence.
          const chemin = brut ? brut.split(">").map((s) => s.trim()).filter(Boolean) : [];
          if (chemin.length >= 2) cheminDe.set(inv, chemin);
        }
        // ── ET PAS SEULEMENT LA CATÉGORIE (2026-09-20, suite du même job) ────
        // La catégorie posée, Beebs a réclamé Taille, Marque et État — et le
        // message disait « la copie Beebs de cette annonce ne le renseigne
        // pas ». C'ÉTAIT FAUX : le relevé du 17/09 portait « Très bon état »,
        // « Camaïeu » et « M / 38 ». Ces valeurs viennent de la page Beebs
        // elle-même, donc elles sont valides chez Beebs par construction —
        // c'est exactement ce que fait déjà la reprise Leboncoin au-dessus.
        // ⛔ ON NE COMBLE QUE LE VIDE : une valeur posée par l'app ou par la
        //    personne est plus récente que le relevé, elle n'est jamais écrasée.
        const CHAMPS_BEEBS: Array<[string, string]> = [
          ["etat", "etat"], ["marque", "marque"], ["taille", "taille"],
          ["couleur", "couleur"], ["matiere", "matiere"],
        ];
        // Beebs est genré jusqu'aux accessoires. Le genre n'est pas inventé :
        // il est LU dans le chemin qu'on vient de poser (« Mode > Femme > … »).
        const GENRES_BEEBS = new Set(["Femme", "Homme", "Fille", "Garçon", "Bébé"]);
        let posesBeebs = 0;
        for (const j of beebsACombler) {
          const pf = { ...pfB(j) };
          const chemin = Array.isArray(pf["beebsCategoryPath"]) && (pf["beebsCategoryPath"] as unknown[]).length >= 2
            ? (pf["beebsCategoryPath"] as unknown[]).map(String)
            : cheminDe.get(Number(j.inventaire_id));
          if (!chemin) continue;
          const repris: Record<string, string> = {};
          if (!Array.isArray(pf["beebsCategoryPath"])) {
            pf["beebsCategoryPath"] = chemin;
            repris["beebsCategoryPath"] = chemin.join(" > ");
          }
          const cap = captureDeB.get(Number(j.inventaire_id)) ?? {};
          for (const [cle, dans] of CHAMPS_BEEBS) {
            if (String(pf[cle] ?? "").trim()) continue;
            const v = String(cap[dans] ?? "").trim();
            if (!v) continue;
            pf[cle] = v;
            repris[cle] = v;
          }
          if (!String(pf["genre"] ?? "").trim() && GENRES_BEEBS.has(chemin[1] ?? "")) {
            pf["genre"] = chemin[1];
            repris["genre"] = chemin[1];
          }
          // ── ET LA DESCRIPTION, QUE BEEBS EXIGE ───────────────────────────
          // Troisième couche du même job, constatée en prod : catégorie posée,
          // champs posés, le formulaire s'est rempli — et Beebs a refusé le
          // dépôt avec « Ajouter au moins 5 caractères ». La description du job
          // était VIDE (0 caractère) et le relevé en portait 170, mot pour mot
          // celle de l'annonce en ligne. Un article rattaché n'a jamais eu de
          // description côté FillSell : elle n'existe que dans le relevé.
          // ⛔ Seulement si celle du job est vide ou trop courte pour Beebs :
          //    une description écrite par la personne n'est jamais remplacée.
          const descJob = String((j as { description?: unknown }).description ?? "").trim();
          const descCap = String(cap["description"] ?? "").trim();
          const nouvelleDesc = (descJob.length < 5 && descCap.length >= 5) ? descCap : null;
          if (nouvelleDesc) repris["description"] = `${descCap.length} caractères`;
          if (!Object.keys(repris).length) continue;   // rien à ajouter : on ne réécrit pas pour rien
          pf["champs_repris_de_l_annonce"] = {
            le: new Date().toISOString(),
            pose_par: "get-pending-jobs (annonce Beebs relevée)",
            repris,
          };
          const patchB: Record<string, unknown> = { platform_fields: pf };
          if (nouvelleDesc) patchB["description"] = nouvelleDesc;
          const { error: uErr } = await userClient.from("cross_post_jobs")
            .update(patchB).eq("id", j.id as string);
          if (uErr) { console.warn(`[get-pending-jobs] catégorie Beebs : job ${String(j.id).slice(0, 8)} non écrit (${uErr.message})`); continue; }
          (j as Record<string, unknown>).platform_fields = pf;
          if (nouvelleDesc) (j as Record<string, unknown>).description = nouvelleDesc;
          posesBeebs++;
          console.log(`[get-pending-jobs] Beebs ${String(j.id).slice(0, 8)} : catégorie ← « ${chemin.join(" > ")} » (annonce relevée)`);
        }
        if (posesBeebs) console.log(`[get-pending-jobs] user=${user.id} : ${posesBeebs} job(s) Beebs complété(s) depuis l'annonce relevée`);
      }
    } catch (e) {
      console.warn(`[get-pending-jobs] catégorie Beebs : ${String((e as Error)?.message ?? e)} — distribution normale`);
    }

    // ══ UN SEUL RETRAIT EN VOL, PAR COMPTE ET PAR PLATEFORME (2026-09-19) ═══
    // L'invariant existait déjà — dans l'extension, à l'étape 'captured' de
    // processRepublishJobPlateforme. Il a CÉDÉ ce soir : deux annonces de la
    // même personne se sont retrouvées hors ligne en même temps.
    // POURQUOI, et c'est une ligne : sa requête compte les jobs
    //     status=in.(pending,processing) AND republish_step=eq.deleted
    // — elle IGNORE 'needs_user'. Or un job à l'étape 'deleted' en needs_user
    // est précisément une annonce retirée ET bloquée : la seule qui ne
    // repartira pas toute seule. L'invariant fermait les yeux sur le seul cas
    // qui compte vraiment. Mesuré : « Clé USB Angry birds » retirée depuis
    // 13 min en needs_user (« Leboncoin demande : État »), pendant que
    // « Sac à dos milan » était retirée à son tour.
    //
    // On le refait ICI, côté serveur, où il ne dépend plus de la version
    // installée — et en comptant needs_user.
    // ⛔ Ce n'est PAS la garde « sais-tu tout remplir ? » : celle-là aurait
    //    retenu 24 des 26 republications en file de ce compte, alors que la
    //    plupart aboutissent (Leboncoin pré-remplit son formulaire au
    //    redépôt — 5 annonces recréées ce soir sont sorties complètes, avec
    //    Produit, Univers et Genre, sans que nous les ayons fournis). Celle-ci
    //    ne juge aucun champ : elle borne le dégât à UNE annonce à la fois.
    // ⛔ On RETIENT, on ne requalifie pas : statut inchangé, aucune tentative
    //    consommée, rien débité, annonce intacte.
    try {
      const pfR = (j: { platform_fields: unknown }) =>
        ((j.platform_fields && typeof j.platform_fields === "object") ? j.platform_fields : {}) as Record<string, unknown>;
      const vaRetirerMaintenant = out.filter((j) =>
        j.action === "republish" && String(pfR(j)["republish_step"] ?? "a_capturer") === "captured");
      if (vaRetirerMaintenant.length) {
        const { data: enVol } = await userClient
          .from("cross_post_jobs")
          .select("id, platform, title, status")
          .eq("user_id", user.id)
          .eq("action", "republish")
          .eq("platform_fields->>republish_step", "deleted")
          .in("status", ["pending", "processing", "needs_user"]);
        const horsLigneParPf = new Map<string, Array<{ titre: string; statut: string }>>();
        for (const r of (enVol ?? [])) {
          const row = r as { platform: string; title: string | null; status: string };
          if (!horsLigneParPf.has(row.platform)) horsLigneParPf.set(row.platform, []);
          horsLigneParPf.get(row.platform)!.push({ titre: String(row.title ?? "").slice(0, 40), statut: row.status });
        }
        const retenusRetrait = new Set<string>();
        for (const j of vaRetirerMaintenant) {
          const dejaHorsLigne = horsLigneParPf.get(j.platform) ?? [];
          if (!dejaHorsLigne.length) continue;
          retenusRetrait.add(String(j.id));
          console.warn(
            `[get-pending-jobs] user=${user.id} : retrait ${String(j.id).slice(0, 8)} (${j.platform}) RETENU — ` +
            `${dejaHorsLigne.length} annonce(s) déjà hors ligne sur cette plateforme : ` +
            dejaHorsLigne.map((d) => `« ${d.titre} » (${d.statut})`).join(", ") +
            " — rien n'est retiré, aucune tentative consommée",
          );
        }
        if (retenusRetrait.size) out = out.filter((j) => !retenusRetrait.has(String(j.id)));
      }
    } catch (e) {
      console.warn(`[get-pending-jobs] garde « un seul retrait en vol » : ${String((e as Error)?.message ?? e)} — distribution normale`);
    }

    // ══ DEUX ARTICLES, UNE SEULE ANNONCE : ON NE RETIRE RIEN (2026-09-19) ═══
    // Mesuré ce soir : 9 URL Leboncoin portées par 2 articles ou plus, sur 4
    // comptes. Cause établie — la passe de récupération de l'URL
    // (background.js, findListingLinkInPage) attribue l'annonce PAR TITRE
    // quand elle n'a pas d'identifiant, et deux titres jumeaux se croisent
    // (« Carhartt T-shirt coton noir XL » ×2, « Ordi tablette Genius XL » et
    // « Vtech ordi tablette genius XL »…). C'est la règle déjà écrite pour
    // Beebs — « sans lien, JAMAIS par titre » — jamais appliquée ici.
    //
    // La conséquence est le pire geste du produit : le retrait d'un article
    // supprime l'annonce d'un AUTRE. Tant que le croisement existe, aucun
    // geste destructeur ne part.
    // ⛔ PÉRIMÈTRE : les jobs qui vont RETIRER — action 'delete', et
    //    'republish' dont l'étape suivante est le retrait ('captured'). Une
    //    publication neuve ne détruit rien : elle passe.
    // ⛔ On RETIENT, on ne requalifie pas : statut inchangé, aucune tentative
    //    consommée, rien de débité. Le job repart tout seul dès que le
    //    croisement est défait — exactement comme la porte pro Leboncoin.
    // ⛔ Comparaison sur l'URL NORMALISÉE : c'est l'identifiant d'annonce qui
    //    compte, pas le slug de catégorie qui le précède.
    try {
      const idAnnonce = (url: unknown) => {
        const m = String(url ?? "").match(/\/(\d{6,})(?:[/?#]|$)/);
        return m ? m[1] : null;
      };
      const vaRetirer = (j: { action: string | null; platform_fields: unknown }) => {
        const a = j.action ?? "publish";
        if (a === "delete") return true;
        if (a !== "republish") return false;
        const pf = ((j.platform_fields && typeof j.platform_fields === "object") ? j.platform_fields : {}) as Record<string, unknown>;
        return String(pf["republish_step"] ?? "a_capturer") === "captured";
      };
      const destructeurs = out.filter((j) => vaRetirer(j) && idAnnonce(j.listing_url) && j.inventaire_id != null);
      if (destructeurs.length) {
        // Qui d'autre, chez CETTE personne, porte la même annonce ? On relit
        // la base : le lot servi ne contient qu'une partie de ses jobs.
        const ids = [...new Set(destructeurs.map((j) => idAnnonce(j.listing_url)))];
        const { data: tousJobs } = await userClient
          .from("cross_post_jobs")
          .select("id, inventaire_id, listing_url, title")
          .eq("user_id", user.id)
          .not("listing_url", "is", null)
          .not("inventaire_id", "is", null)
          .in("status", ["pending", "processing", "published", "needs_user"]);
        const articlesParAnnonce = new Map<string, Map<number, string>>();
        for (const r of (tousJobs ?? [])) {
          const row = r as { inventaire_id: number; listing_url: string; title: string | null };
          const key = idAnnonce(row.listing_url);
          if (!key || !ids.includes(key)) continue;
          if (!articlesParAnnonce.has(key)) articlesParAnnonce.set(key, new Map());
          articlesParAnnonce.get(key)!.set(row.inventaire_id, String(row.title ?? "").slice(0, 60));
        }
        const retenus: string[] = [];
        const bloques = new Set<string>();
        for (const j of destructeurs) {
          const key = idAnnonce(j.listing_url)!;
          const articles = articlesParAnnonce.get(key);
          if (!articles || articles.size < 2) continue;
          const autres = [...articles.entries()].filter(([inv]) => inv !== j.inventaire_id);
          bloques.add(String(j.id));
          retenus.push(`${String(j.id).slice(0, 8)} (annonce ${key} aussi portée par ${autres.map(([, t]) => `« ${t} »`).join(", ")})`);
          const pf = { ...(((j.platform_fields && typeof j.platform_fields === "object") ? j.platform_fields : {}) as Record<string, unknown>) };
          pf["retrait_bloque_url_partagee"] = {
            le: new Date().toISOString(),
            annonce: key,
            autres_articles: autres.map(([inv, t]) => ({ inventaire_id: inv, titre: t })),
            motif: "deux articles portent la meme annonce : retirer celui-ci supprimerait l annonce de l autre",
          };
          await userClient.from("cross_post_jobs")
            .update({ platform_fields: pf }).eq("id", j.id).eq("status", "pending")
            .then(() => {}, () => {});
        }
        if (retenus.length) {
          out = out.filter((j) => !bloques.has(String(j.id)));
          console.warn(
            `[get-pending-jobs] user=${user.id} : ${retenus.length} geste(s) de RETRAIT retenu(s) — deux articles portent la même annonce, ` +
            `rien n'est retiré, aucune tentative consommée : ${retenus.join(" ; ")}`,
          );
        }
      }
    } catch (e) {
      console.warn(`[get-pending-jobs] garde URL partagée : ${String((e as Error)?.message ?? e)} — distribution normale`);
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

    // ── ARTICLE DISPARU AVANT L'EXÉCUTION = REPUBLICATION ANNULÉE, JAMAIS
    // UN 404 (2026-09-12, dossier Anaïs, GO Nico) ───────────────────────────
    // Chronologie mesurée : republications mises en file à 13:27 ; la 2e
    // sync date les articles `disparu_le` à 13:43:31 ; l'extension exécute
    // les jobs à 13:45, 14:02, 14:04, 14:06 et frappe le 404 à la capture →
    // quatre lignes rouges sur le premier lot d'une nouvelle inscrite, alors
    // que la base SAVAIT avant chaque exécution. La revue « plus en ligne —
    // vendue ? » de l'app annule désormais ces republications au moment du
    // geste (App.jsx, annulerRepublicationsDisparues) ; ici c'est le FILET
    // pour la fenêtre que l'app ne couvre pas (le marquage de la sync arrive
    // sans geste utilisateur, et l'extension peut passer 2 minutes plus tard).
    // Une capture sur une annonce disparue ne peut que frapper un 404 : on
    // n'envoie pas l'extension le constater.
    // ⛔ PÉRIMÈTRE STRICT : republish Vinted, statut 'pending', étape absente
    //    ou 'a_capturer' (rien capturé, rien supprimé, personne dessus —
    //    même frontière que republishAnnulable côté app), article porteur
    //    d'un disparu_le. Une étape 'captured' ou 'deleted' passe : après une
    //    suppression, l'annonce DOIT être recréée quoi qu'en dise disparu_le.
    // ÉCRITURE DÉFINITIVE (comme beebs_interdits, contrairement aux retenues
    // transitoires) : 'cancelled' + message neutre + marqueur
    // annonce_disparue — l'app affiche « Annonce plus en ligne », jamais un
    // échec. Un faux disparu_le se répare par la sync (l'annonce revue au
    // dressing efface disparu_le et l'article redevient republiable) : rien
    // n'a été supprimé, l'utilisateur ne perd rien.
    // TOUS LES MODES (popup compris) : l'état est définitif, comme les
    // orphelines. Best-effort : lecture ratée → le job est servi comme avant.
    let annuleesDisparues = 0;
    {
      const stepOfJob = (j: { platform_fields: unknown }) =>
        String(((j.platform_fields as Record<string, unknown> | null) ?? {})["republish_step"] ?? "");
      const candidatsDisparus = out.filter((j) =>
        j.action === "republish" && j.platform === "vinted" && j.status === "pending" &&
        j.inventaire_id != null && (stepOfJob(j) === "" || stepOfJob(j) === "a_capturer"));
      if (candidatsDisparus.length) {
        try {
          const ids = [...new Set(candidatsDisparus.map((j) => j.inventaire_id))];
          const { data: arts } = await userClient
            .from("inventaire").select("id, disparu_le, statut, quantite").in("id", ids);
          const disparus = new Set(
            ((arts ?? []) as { id: unknown; disparu_le: unknown }[])
              .filter((a) => a.disparu_le != null).map((a) => String(a.id)),
          );
          // ── ARTICLE MARQUÉ VENDU DANS FILLSELL = REPUBLICATION AUTOMATIQUE
          // ANNULÉE (2026-09-13, vérification de bout en bout du module planifié)
          // Le sweep serveur ne sélectionne que des articles en stock ; mais
          // entre la création du job (dans le créneau) et son exécution — au
          // pire le créneau suivant, si l'extension n'a pas pris le job à
          // temps — la vendeuse peut marquer l'article vendu dans l'app (vente
          // hors Vinted : Leboncoin, Beebs…). Republier alors, c'est supprimer
          // et recréer l'annonce Vinted d'un article qui n'est plus à vendre.
          // ⛔ PÉRIMÈTRE : republish_source = 'auto' SEUL (planifié ou moteur
          //    historique) — le chemin MANUEL n'est pas touché : l'app ne
          //    propose pas « Republier » sur un article vendu, et un job
          //    manuel en file reste la décision de la vendeuse.
          // Même frontière d'étape que disparu_le (rien capturé, rien supprimé).
          const vendus = new Set(
            ((arts ?? []) as { id: unknown; statut: unknown; quantite: unknown }[])
              .filter((a) => a.statut === "vendu" || (typeof a.quantite === "number" && a.quantite <= 0))
              .map((a) => String(a.id)),
          );
          const estAuto = (j: { platform_fields: unknown }) =>
            String(((j.platform_fields as Record<string, unknown> | null) ?? {})["republish_source"] ?? "") === "auto";
          if (disparus.size || vendus.size) {
            const aRetirer = new Set<string>();
            for (const j of candidatsDisparus) {
              const idArt = String(j.inventaire_id);
              const disparu = disparus.has(idArt);
              const venduAuto = !disparu && vendus.has(idArt) && estAuto(j);
              if (!disparu && !venduAuto) continue;
              const pf = { ...((j.platform_fields as Record<string, unknown> | null) ?? {}) };
              delete pf["next_action_after"];
              if (disparu) {
                pf["annonce_disparue"] = {
                  at: new Date().toISOString(),
                  pose_par: "get-pending-jobs (article disparu_le avant exécution — capture inutile, rien à supprimer)",
                };
              } else {
                pf["article_vendu"] = {
                  at: new Date().toISOString(),
                  pose_par: "get-pending-jobs (article marqué vendu dans FillSell avant l'exécution d'une republication automatique — rien capturé, rien supprimé)",
                };
              }
              const { data: maj } = await userClient.from("cross_post_jobs")
                .update({
                  status: "cancelled",
                  error: disparu
                    ? "Cette annonce n'est plus en ligne sur Vinted — republication annulée avant tout geste, rien n'a été supprimé."
                    : "Cet article est marqué vendu dans FillSell — republication automatique annulée avant tout geste, rien n'a été supprimé.",
                  platform_fields: pf,
                })
                .eq("id", j.id).eq("status", "pending").select("id");
              if ((maj ?? []).length) aRetirer.add(String(j.id));
            }
            if (aRetirer.size) {
              out = out.filter((j) => !aRetirer.has(String(j.id)));
              annuleesDisparues = aRetirer.size;
              console.log(
                `[get-pending-jobs] userId=${user.id} : ${annuleesDisparues} republication(s) annulée(s) AVANT exécution — ` +
                `article(s) disparu_le (${[...aRetirer].map((id) => id.slice(0, 8)).join(", ")}) : rien capturé, rien supprimé, ` +
                `statut cancelled + annonce_disparue`,
              );
            }
          }
        } catch (_e) { /* filet best-effort : jamais un point de panne — le job est servi comme avant */ }
      }
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
          // ══════════════════════════════════════════════════════════════
          // UNE FILE RETENUE LE DIT DANS SES PROPRES JOBS (2026-09-22)
          // ══════════════════════════════════════════════════════════════
          // remialbertholl (118 en file) et nadegemarcelin78 (76) se sont
          // arrêtés à 03:27 et 03:41 sur le plafond du palier — 50 pile, le
          // bon chiffre pour Premium (quota_republication_premium 1500 ÷ 30).
          // La retenue a donc fonctionné. Mais les jobs n'en portaient AUCUNE
          // trace : ni erreur, ni échéance, ni marqueur. Vu de la base, 194
          // republications étaient simplement immobiles, et rien ne disait
          // pourquoi ni jusqu'à quand — ni pour eux, ni pour nous.
          // On écrit donc la retenue LÀ OÙ ON LA CHERCHE. Ce n'est pas une
          // erreur (rien n'a raté) : c'est un état, avec son heure de reprise.
          // ⛔ BORNÉ : on n'écrit que sur les jobs dont la trace a changé
          //    (même motif + même reprise = rien à réécrire), et au plus
          //    RETENUE_TRACE_MAX par poll. Sur 118 jobs et un poll de 2 min,
          //    la file est tracée en trois passages, sans rafale d'écritures.
          // ⛔ Best-effort : une trace ratée ne retient ni ne libère rien.
          const RETENUE_TRACE_MAX = 40;
          try {
            const p = plafondRepublish;
            const trace = {
              at: new Date().toISOString(),
              motif: p.motif, palier: p.palier ?? null,
              faits: p.faits, limite: p.limite, reprise: p.reprise ?? null,
            };
            const aTracer = (jobs ?? [])
              .filter((j) => j.action === "republish"
                && (j.platform_fields as Record<string, unknown> | null)?.["republish_step"] !== "deleted")
              .filter((j) => {
                const r = ((j.platform_fields ?? {}) as Record<string, unknown>)["retenue_republication"] as
                  Record<string, unknown> | undefined;
                return !r || r.motif !== trace.motif || r.reprise !== trace.reprise;
              })
              .slice(0, RETENUE_TRACE_MAX);
            for (const j of aTracer) {
              const pf = { ...((j.platform_fields ?? {}) as Record<string, unknown>), retenue_republication: trace };
              await userClient.from("cross_post_jobs").update({ platform_fields: pf }).eq("id", j.id);
            }
            if (aTracer.length) {
              console.log(`[get-pending-jobs] userId=${user.id} : retenue tracée sur ${aTracer.length} job(s) (motif=${p.motif}, reprise=${p.reprise})`);
            }
          } catch (e) {
            console.warn("[get-pending-jobs] trace de retenue non écrite (sans effet sur la retenue) :", (e as Error)?.message ?? e);
          }
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
    // ⚠️ 18/09 — PAR PLATEFORME. Chaque plateforme a SON créneau : un job
    // Leboncoin retenu sur la fenêtre Vinted serait une retenue à tort (et
    // inversement, un job Leboncoin servi pendant le créneau Vinted serait une
    // republication hors créneau). La fenêtre de CHAQUE job est celle de SA
    // plateforme, et une plateforme sans module actif ne retient rien.
    let heldCreneau = 0;
    let creneauRepublish: Record<string, unknown> | null = null;
    let creneauxRepublish: Record<string, unknown> | null = null;
    const autoHorsDeleted = (j: { action: string; platform_fields: unknown }) => {
      const pf = (j.platform_fields as Record<string, unknown> | null) ?? {};
      return j.action === "republish" && pf["republish_source"] === "auto" && pf["republish_step"] !== "deleted";
    };
    if (!includeProcessing && !includeNeedsUser && out.some(autoHorsDeleted)) {
      try {
        const fenetres = await lireCreneaux();
        if (Object.keys(fenetres).length) {
          creneauxRepublish = fenetres;
          creneauRepublish = fenetres["vinted"] ?? null;
          const retenus: Record<string, number> = {};
          const avant = out.length;
          out = out.filter((j) => {
            if (!autoHorsDeleted(j)) return true;
            const f = fenetres[String((j as { platform?: string }).platform ?? "")];
            if (!f || f.dans_creneau) return true;
            retenus[String((j as { platform?: string }).platform ?? "?")] =
              (retenus[String((j as { platform?: string }).platform ?? "?")] ?? 0) + 1;
            return false;
          });
          heldCreneau = avant - out.length;
          if (heldCreneau) {
            console.log(
              `[get-pending-jobs] userId=${user.id} : hors créneau de republication planifiée — ` +
              Object.entries(retenus).map(([pf, n]) =>
                `${n} ${pf} jusqu'à ${String(fenetres[pf]?.reprise ?? "?")}`).join(" · ") +
              ` (étape 'deleted' exemptée, manuel non concerné)`,
            );
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
    //
    // ── ÉTENDU AUX CINQ PLATEFORMES, ET LE LIEN SE RECONSTRUIT (2026-09-21) ──
    // Ce bloc ne regardait que Beebs, au motif que « Leboncoin cible par l'id
    // de l'URL, échec propre sans lien ». L'échec est propre, mais il ne retire
    // RIEN : le pantalon Sandro de meminiandmove (vendu sur Vinted le 20/09 à
    // 22:42, compte PRO) est resté EN LIGNE sur Leboncoin toute la nuit, son
    // retrait mort en « Page inattendue : https://www.leboncoin.fr/ » — le
    // repli « Mes annonces » de DELETE_TARGETS pointe sur /compte/part/, qui
    // pour un compte PRO atterrit sur la racine (relevé du 18/09).
    // Or l'annonce était NOMMÉE : Leboncoin avait rendu son id (3273615091)
    // dans la réponse à notre propre dépôt, rangé en platform_listing_id.
    // Relevé du 21/09 sur les 500 retraits du parc : 5 attendaient un lien qui
    // dormait sur leur dépôt, 10 n'ont aucun identifiant nulle part.
    // Donc, pour TOUTE plateforme, avant de retenir un retrait sans lien :
    //   1. le listing_url du dépôt (inchangé) ;
    //   2. son platform_listing_id → lien canonique, pour les plateformes dont
    //      la forme d'URL est RELEVÉE (beebs, vinted, ebay, opla) ;
    //   3. son platform_listing_id → l'URL lue dans le relevé du compte
    //      (annonces_plateforme) — c'est par là que Leboncoin passe, son URL
    //      portant un segment de catégorie qu'on ne fabrique jamais.
    // Et sans identifiant, la règle de Beebs devient la règle de tout le monde :
    // ON NE RETIRE RIEN, on retient et on le DIT. Jamais par le titre.
    let heldRetraitSansLien = 0;
    if (!includeProcessing && !includeNeedsUser) {
      const retraitsSansLien = out.filter((j) =>
        j.action === "delete" && !String(j.listing_url ?? "").trim());
      if (retraitsSansLien.length) {
        const aRetenir = new Set<string>();
        // 7 jours pour TOUTE plateforme (2026-09-21). C'est le délai que Beebs
        // s'accorde pour sa modération ; ailleurs il est simplement généreux —
        // et l'erreur qu'on veut éviter n'est pas d'attendre trop longtemps,
        // c'est de renoncer pendant que l'annonce, elle, est en vente.
        const ATTENTE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
        const LABEL: Record<string, string> = {
          beebs: "Beebs", leboncoin: "Leboncoin", vinted: "Vinted", ebay: "eBay", opla: "Opla",
        };
        const labelDe = (p: string) => LABEL[p] ?? p;
        for (const d of retraitsSansLien) {
          const pf = ((d.platform_fields as Record<string, unknown> | null) ?? {});
          const attente = (pf["retrait_attend_lien"] as Record<string, unknown> | undefined) ?? {};
          // ⛔ L'HORLOGE PART DE LA CRÉATION DU JOB, JAMAIS DE MAINTENANT.
          // Défaut mesuré le 20/09 sur 79370a1a (Ornella, « Pantalon Kiabi ») :
          // retrait armé le 11/09 à 10:42, TOUJOURS pending 9 jours plus tard,
          // et son marqueur disait « depuis: 2026-09-20T09:07 ». Le `|| Date.now()`
          // faisait repartir le plafond de 7 jours à la PREMIÈRE observation du
          // serveur — un job antérieur à ce code, ou dont le marqueur s'est
          // perdu, n'expirait donc jamais. Même forme que la garde des dépôts
          // muets, qui jugeait sur `created_at` et re-fermait les relances.
          const depuisMs = Date.parse(String(attente["depuis"] ?? ""))
            || Date.parse(String((d as { created_at?: string }).created_at ?? ""))
            || Date.now();
          const nowIso = new Date().toISOString();
          try {
            let url: string | null = null;
            let provenance = "";
            let depotJamaisEnLigne = false;
            let depotsAbandonnes = false;
            // Un dépôt encore SURVEILLÉ (published sans lien ni identifiant :
            // beebs-lien le cherche, le balayage des 7 jours le clora). Tant
            // qu'il l'est, le retrait n'expire pas — sinon il tombait AVANT
            // son dépôt, en faux « retire-la à la main » (Memini, 24/09).
            let depotEncoreSurveille = false;
            // L'identifiant que le retrait porte LUI-MÊME (armRemovals le
            // recopie depuis le dépôt depuis le 21/09). Indispensable quand
            // inventaire_id a été NULLifié par la suppression de l'article
            // (16/09) : le dépôt n'est alors plus retrouvable, mais l'identité
            // de l'annonce, elle, est restée sur le retrait.
            const idsCandidats: string[] = [];
            const idPropre = String((d as { platform_listing_id?: string | null }).platform_listing_id ?? "").trim();
            if (idPropre) idsCandidats.push(idPropre);
            if (d.inventaire_id != null) {
              const { data: depots } = await userClient
                .from("cross_post_jobs")
                .select("id, status, listing_url, platform_listing_id, platform_fields")
                .eq("platform", d.platform)
                .eq("inventaire_id", d.inventaire_id)
                .in("action", ["publish", "republish"])
                .order("created_at", { ascending: false })
                .limit(5);
              const liste = (depots ?? []) as Array<{
                status: string; listing_url: string | null; platform_listing_id: string | null; platform_fields: unknown;
              }>;
              // 1. le lien du dépôt.
              for (const p of liste) {
                if (String(p.listing_url ?? "").trim()) {
                  url = String(p.listing_url);
                  provenance = "lien_du_depot";
                  break;
                }
              }
              for (const p of liste) {
                const v = String(p.platform_listing_id ?? "").trim();
                if (v && !idsCandidats.includes(v)) idsCandidats.push(v);
              }
              // « cancelled » compte autant que « failed » (24/09, retrait 88b96a45
              // d'Ornella) : depuis pas-de-rouge (22/09), le balayage des dépôts
              // sans lien réécrit failed → cancelled (verdict info), et un dépôt
              // abandonné ne l'était donc plus JAMAIS pour cette garde — le
              // retrait restait retenu 7 jours puis tombait en faux échec.
              // ⛔ Jamais un dépôt qui porte un lien ou un identifiant.
              depotsAbandonnes = liste.length > 0 && liste.every((p) =>
                (p.status === "failed" || p.status === "cancelled")
                && !String(p.listing_url ?? "").trim() && !String(p.platform_listing_id ?? "").trim()
                && Boolean(((p.platform_fields as Record<string, unknown> | null) ?? {})["listing_url_abandon"]));
              depotEncoreSurveille = liste.some((p) =>
                p.status === "published" && !String(p.listing_url ?? "").trim() && !String(p.platform_listing_id ?? "").trim());
            }
            // 2. et 3. l'IDENTIFIANT — le lien n'en est qu'une écriture.
            if (!url && idsCandidats.length) {
              for (const id of idsCandidats) {
                const canonique = lienDepuisId(d.platform, id);
                if (canonique) { url = canonique; provenance = "id_de_l_annonce"; break; }
              }
              // Leboncoin (et toute plateforme sans forme d'URL relevée) : le
              // lien se LIT dans le relevé du compte, il ne se fabrique pas.
              if (!url) {
                const { data: releve } = await userClient
                  .from("annonces_plateforme")
                  .select("listing_id, url")
                  .eq("platform", d.platform)
                  .in("listing_id", idsCandidats.slice(0, 5))
                  .not("url", "is", null)
                  .limit(5);
                for (const a of (releve ?? []) as Array<{ listing_id: string; url: string | null }>) {
                  if (String(a.url ?? "").trim()) { url = String(a.url); provenance = "releve_du_compte"; break; }
                }
              }
            }
            depotJamaisEnLigne = !url && depotsAbandonnes;
            if (url) {
              const pfNeuf: Record<string, unknown> = {
                ...pf,
                retrait_attend_lien: { ...attente, resolu_le: nowIso, url, provenance },
              };
              delete pfNeuf["removal_url_missing"];
              await userClient.from("cross_post_jobs")
                // `error` effacé : le job part maintenant, le message d'attente
                // n'a plus de sens et resterait affiché en rouge à l'écran.
                .update({ listing_url: url, error: null, platform_fields: pfNeuf })
                .eq("id", d.id).eq("status", "pending");
              (d as { listing_url: string | null }).listing_url = url;
              (d as { error: string | null }).error = null;
              (d as { platform_fields: unknown }).platform_fields = pfNeuf;
              console.log(`[get-pending-jobs] retrait ${d.platform} ${String(d.id).slice(0, 8)} : lien retrouvé (${provenance}, ${url}) — servi`);
              continue;
            }
            if (depotJamaisEnLigne) {
              await userClient.from("cross_post_jobs")
                .update({
                  status: "cancelled",
                  error: `Rien à retirer sur ${labelDe(d.platform)} : l'annonce n'a jamais été mise en ligne (dépôt non confirmé).`,
                  platform_fields: { ...pf, retrait_attend_lien: { ...attente, annule_le: nowIso, motif: "depot_jamais_en_ligne" } },
                })
                .eq("id", d.id).eq("status", "pending");
              aRetenir.add(String(d.id));
              continue;
            }
            // (2026-09-25) Un retrait Vinted d'un compte en pause anti-robot
            // n'expire jamais pendant la pause, et le temps passé en pause ne
            // compte pas dans les 7 jours.
            const enPauseAr = d.platform === "vinted" && (Boolean(pf["attente_antirobot_compte"]) || compteEnPauseAr);
            const pauseMs = Math.max(0, Number(pf["antirobot_pause_cumul_ms"]) || 0);
            if (!depotEncoreSurveille && !enPauseAr && Date.now() - depuisMs - pauseMs > ATTENTE_MAX_MS) {
              await userClient.from("cross_post_jobs")
                .update({
                  status: "failed",
                  error: `Retrait ${labelDe(d.platform)} non fait : le lien de l'annonce n'a pas été obtenu en 7 jours `
                    + "(annonce jamais mise en ligne, ou lien introuvable). "
                    + `Vérifie tes annonces ${labelDe(d.platform)} et retire-la à la main si elle y est.`,
                  platform_fields: { ...pf, retrait_attend_lien: { ...attente, expire_le: nowIso } },
                })
                .eq("id", d.id).eq("status", "pending");
              aRetenir.add(String(d.id));
              continue;
            }
            // ── ET ON LE DIT. ────────────────────────────────────────────
            // 66030f14 (Ornella, T-shirt Screen Stars) portait 183
            // observations depuis la veille au soir, `error` VIDE : le job
            // figurait en rouge dans la liste sans une ligne d'explication,
            // et Ornella n'avait aucun moyen de savoir qu'on attendait — ni
            // quoi. Une attente qui ne se dit pas est indiscernable d'une
            // panne. Le message nomme ce qu'on attend, jusqu'à quand, et
            // l'issue si ça n'arrive pas.
            const joursRestants = Math.max(0, Math.ceil((ATTENTE_MAX_MS - (Date.now() - depuisMs)) / 86400000));
            await userClient.from("cross_post_jobs")
              .update({
                error: `Retrait ${labelDe(d.platform)} en attente : ${labelDe(d.platform)} ne nous a pas encore donné le lien de cette annonce, `
                  + "et on ne la retire JAMAIS en la cherchant par son titre — deux annonces au même titre, "
                  + "et c'est la mauvaise qui partirait. On réessaie tout seuls à chaque passage"
                  + (joursRestants > 0 ? ` (encore ${joursRestants} j)` : "")
                  + `. Si tu la vois dans tes annonces ${labelDe(d.platform)}, tu peux la retirer à la main — rien ne sera fait en double.`,
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
            console.warn(`[get-pending-jobs] retrait ${d.platform} ${String(d.id).slice(0, 8)} : attente illisible (${String((e as Error)?.message ?? e)}) — retenu`);
            aRetenir.add(String(d.id));
          }
        }
        if (aRetenir.size) {
          const avant = out.length;
          out = out.filter((j) => !aRetenir.has(String(j.id)));
          heldRetraitSansLien = avant - out.length;
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

    // ══ ON N'ÉCRIT JAMAIS SUR LA BOUTIQUE D'UN AUTRE (2026-09-22) ═══════════
    //
    // 🚨 L'INCIDENT DU 22/09. remialbertholl a supprimé 41 articles de SON stock
    //    entre 10:40 et 11:25. Ces articles venaient du dressing de
    //    @nadegemarcelin78 (16040413), relevé le 03/09 — son stock ne contient
    //    QUE des boutiques étrangères : 644 articles de @nadegemarcelin78, 218
    //    de @narema75, 213 de @jcassou, ZÉRO de @celineetmarie, la boutique à
    //    laquelle son Chrome était connecté. Chaque suppression a lancé un
    //    retrait Vinted sur les annonces de quelqu'un d'autre.
    //
    // ⚠️ CE QUI A SAUVÉ LA MISE, ET QUI N'EST PAS UNE GARDE : Vinted a refusé.
    //    Sans jeton CSRF (session d'une autre boutique), le handler n'a envoyé
    //    AUCUNE requête de suppression — c'est écrit dans les 25 traces, mot
    //    pour mot : « requête de suppression NON envoyée ». Les 25 annonces
    //    étaient déjà hors ligne AVANT (copie vieille de 19 jours), et le
    //    verdict `deleted` était donc juste — vérifié le 22/09 sur le dressing
    //    public de Nadège, 713 annonces lues, les 25 absentes et les 16
    //    retraits annulés bien présents.
    //    On ne laisse pas la protection d'un tiers à la bonne volonté de Vinted.
    //
    // ⛔ LA GARDE EXISTAIT DÉJÀ — POUR LA LECTURE SEULEMENT. `boutique_a_confirmer`
    //    refuse un RELEVÉ quand le navigateur est sur une autre boutique (elle a
    //    bloqué 15 relevés ce matin même). Le RETRAIT et la REPUBLICATION, eux,
    //    ne la consultaient pas : on gardait la lecture et on laissait l'écriture
    //    libre. C'est l'inverse qu'il faut.
    //
    // ⛔ ET ON NE CONCLUT QUE SUR DEUX CERTITUDES. Il faut que l'article porte un
    //    `vinted_account_id` ET que la sonde connaisse la boutique de la session
    //    (`extension_sessions.vinted_identite.user_id`). Si l'un des deux manque,
    //    on ne retient RIEN : un compte mono-boutique dont l'identité n'a jamais
    //    été relevée ne doit pas voir ses retraits s'arrêter.
    let heldBoutiqueEtrangere = 0;
    if (!includeProcessing && !includeNeedsUser) {
      // ── LES RETRAITS ORPHELINS AUSSI (24/09, remialbertholl) ──────────────
      // Un retrait né de la SUPPRESSION de l'article (trigger du 16/09) perd
      // son inventaire_id par la clé étrangère : la garde ne le voyait jamais,
      // alors que c'est exactement son cas. Deux retraits de Rémi visaient des
      // annonces de @nadegemarcelin78 (16040413) pendant que Chrome était sur
      // @jcassou : Vinted répondait 403 access_denied, lu comme « anti-robot »,
      // en boucle depuis la veille. La boutique vit désormais SUR le job
      // (platform_fields.vinted_account_id : trigger 20260924200000, et
      // l'extension ≥ 0.6.65 qui lit le propriétaire sur la page de l'annonce).
      const boutiqueDuJob = (j: Record<string, unknown>) =>
        String(((j.platform_fields as Record<string, unknown> | null) ?? {}).vinted_account_id ?? "").trim();
      const ecrituresVinted = out.filter((j) =>
        j.platform === "vinted" && (j.action === "delete" || j.action === "republish") &&
        (j.inventaire_id != null || boutiqueDuJob(j as Record<string, unknown>) !== ""));
      if (ecrituresVinted.length) {
        try {
          const { data: profilBoutique } = await userClient
            .from("profiles").select("extension_sessions").eq("id", user.id).maybeSingle();
          const identite = ((profilBoutique?.extension_sessions ?? {}) as Record<string, unknown>)
            .vinted_identite as { user_id?: string; login?: string } | null | undefined;
          const boutiqueSession = String(identite?.user_id ?? "").trim();
          if (boutiqueSession) {
            const ids = [...new Set(ecrituresVinted.map((j) => j.inventaire_id).filter((x) => x != null))];
            const { data: arts } = ids.length
              ? await userClient.from("inventaire").select("id, vinted_account_id").in("id", ids)
              : { data: [] as Record<string, unknown>[] };
            const boutiqueDe = new Map<string, string>();
            for (const a of (arts ?? []) as Record<string, unknown>[]) {
              const b = String(a.vinted_account_id ?? "").trim();
              if (b) boutiqueDe.set(String(a.id), b);
            }
            const aRetenir = new Set<string>();
            for (const j of ecrituresVinted) {
              const boutiqueArticle = (j.inventaire_id != null ? boutiqueDe.get(String(j.inventaire_id)) : undefined)
                || boutiqueDuJob(j as Record<string, unknown>) || undefined;
              if (!boutiqueArticle || boutiqueArticle === boutiqueSession) continue;
              const pf = ((j.platform_fields as Record<string, unknown> | null) ?? {});
              const quoi = j.action === "delete" ? "Le retrait" : "La republication";
              await userClient.from("cross_post_jobs")
                .update({
                  status: "needs_user",
                  error: `${quoi} de cette annonce n'a pas été lancé : elle appartient à un autre compte Vinted que celui ` +
                    `ouvert dans Chrome sur ton ordinateur. Rien n'a été touché sur Vinted. ` +
                    `Connecte-toi au bon compte Vinted, puis relance.`,
                  platform_fields: {
                    ...pf,
                    needs_user_source: "boutique_etrangere",
                    boutique_etrangere: {
                      article: boutiqueArticle,
                      session: boutiqueSession,
                      login_session: identite?.login ?? null,
                      le: new Date().toISOString(),
                      pose_par: "get-pending-jobs (garde boutique, 22/09)",
                    },
                  },
                })
                .eq("id", j.id).eq("status", "pending");
              aRetenir.add(String(j.id));
              console.log(`[get-pending-jobs] userId=${user.id} ${j.action} vinted ${String(j.id).slice(0, 8)} RETENU : article de la boutique ${boutiqueArticle}, session sur ${boutiqueSession} — rien n'est envoyé à Vinted`);
            }
            if (aRetenir.size) {
              const avant = out.length;
              out = out.filter((j) => !aRetenir.has(String(j.id)));
              heldBoutiqueEtrangere = avant - out.length;
            }
          }
        } catch (_e) { /* best-effort : jamais un point de panne — le job est servi */ }
      }
    }

    // ══ ASPECTS OBLIGATOIRES eBay : LE SERVEUR LES POSE (2026-09-21, GO Nico) ══
    //
    // CE QUI S'EST PASSÉ. Le job bb3bb71f (jocabroc8, « Service de toilette
    // ancien Moulin des Loups ») est resté bloqué alors que sa catégorie (89508,
    // Collections › Rasage, salle de bains) venait d'entrer au référentiel. Le
    // gate d'ebay.js refuse de publier tant que le job ne porte pas
    // `platform_fields.ebayRequiredAspects` — et ce champ n'est écrit QU'UNE
    // FOIS, à la création, par ListingPreviewScreen (~l.7698). Il n'est jamais
    // relu. Un job né pendant que sa catégorie était hors référentiel restait
    // donc bloqué À VIE : les 5 reprises automatiques rejouaient le même refus,
    // puis needs_user. Il a fallu poser la valeur à la main.
    //
    // DÉSORMAIS, ICI, au moment de servir : champ ABSENT + catégorie connue du
    // référentiel ⇒ on pose la liste, telle qu'elle y est écrite. L'app se
    // débrouille seule, sans paquet CWS et sans geste humain.
    //
    // ⛔ CE QUE CE BLOC NE FAIT PAS, ET NE DOIT JAMAIS FAIRE :
    //   · réécrire un `ebayRequiredAspects` DÉJÀ présent — posé à la création ou
    //     par un humain, il fait foi (le filtre teste la PRÉSENCE de la clé, pas
    //     sa forme : une valeur bizarre reste celle de quelqu'un d'autre) ;
    //   · toucher à la CATÉGORIE du job — un rayon `choix_humain` ne se
    //     recalcule pas, on ne fait que LIRE celui qui est déjà posé ;
    //   · appeler fetch-ebay-aspects. Catégorie hors référentiel ⇒ on ne change
    //     RIEN : le refus d'ebay.js (« publication NON tentée pour ne pas
    //     cliquer à l'aveugle ») reste la bonne réponse, et c'est l'app qui
    //     comble le trou à la création (refetch_category) ou personne.
    //
    // ⚠️ UNE LISTE VIDE EST UNE VRAIE RÉPONSE. 89508 n'a AUCUN aspect
    //    obligatoire : `[]` se pose tel quel et vaut « référentiel vérifié ».
    //    C'est exactement ce que fait l'app (`required.map(a => a.name)` sur
    //    zéro requis), et c'est ce que le gate attend (Array.isArray).
    //
    // ⚠️ `empty` est accepté comme `ok`, et c'est délibéré : c'est la définition
    //    d'« utilisable » de l'app elle-même (« la catégorie n'a AUCUN aspect —
    //    information valable, pas un trou »). Les deux donnent `[]`. `error` et
    //    `not_found` restent des trous : on ne pose rien.
    //
    // ⛔ ÉCRITURE GARDÉE SUR `pending`/`needs_user` (leçon du 12/09) : écrire
    //    platform_fields pendant qu'un job est en `processing` est écrasé sans
    //    trace par le rapport de fin de passe (update-job-status remplace la
    //    colonne entière par le snapshot que l'extension a lu au départ). On
    //    n'écrit donc que hors passe — et l'objet servi est mis à jour en
    //    mémoire pour que CE poll-ci porte déjà la liste.
    // Seuls les NOMS partent sur le job : la liste des valeurs autorisées d'un
    // aspect (Marque ≈ 19 000 entrées) n'a rien à faire dans un payload de job.
    let aspectsPoses = 0;
    {
      const pfDe = (j: { platform_fields: unknown }) =>
        (j.platform_fields as Record<string, unknown> | null) ?? {};
      const catDe = (j: { platform_fields: unknown }) =>
        String(pfDe(j)["ebayCategoryId"] ?? "").trim();
      const candidats = out.filter((j) =>
        j.platform === "ebay"
        && (j.status === "pending" || j.status === "needs_user")
        && !("ebayRequiredAspects" in pfDe(j))
        && /^\d{1,12}$/.test(catDe(j)));
      if (candidats.length) {
        try {
          const cats = [...new Set(candidats.map(catDe))];
          const { data: refs } = await userClient
            .from("ebay_item_aspects")
            .select("category_id, aspects, aspect_count, required_count, status, source, ebay_env, marketplace_id, category_tree_version")
            .in("category_id", cats)
            .in("status", ["ok", "empty"]);
          const parCat = new Map<string, Record<string, unknown>>();
          for (const r of (refs ?? []) as Array<Record<string, unknown>>) {
            parCat.set(String(r.category_id), r);
          }
          for (const j of candidats) {
            const r = parCat.get(catDe(j));
            if (!r) continue; // hors référentiel : on ne change RIEN
            const liste = (Array.isArray(r.aspects) ? r.aspects as Array<Record<string, unknown>> : [])
              .filter((a) => a?.required === true && a?.name)
              .map((a) => String(a.name));
            const pfNeuf = {
              ...pfDe(j),
              ebayRequiredAspects: liste,
              ebay_aspects_reference: {
                le: new Date().toISOString(),
                categorie: catDe(j),
                source: `ebay_item_aspects (${String(r.source ?? "?")}, ${String(r.ebay_env ?? "?")} ` +
                  `${String(r.marketplace_id ?? "?")}, arbre v${String(r.category_tree_version ?? "?")}, statut ${String(r.status ?? "?")})`,
                aspect_count: Number(r.aspect_count ?? 0),
                required_count: Number(r.required_count ?? 0),
                pose_par: "get-pending-jobs (le champ manquait sur le job, le référentiel l'avait)",
              },
            };
            const { data: maj } = await userClient
              .from("cross_post_jobs")
              .update({ platform_fields: pfNeuf })
              .eq("id", j.id)
              .in("status", ["pending", "needs_user"])
              .select("id");
            if (!(maj ?? []).length) continue; // sorti de pending entre-temps : on ne sert pas une valeur non écrite
            (j as { platform_fields: unknown }).platform_fields = pfNeuf;
            aspectsPoses++;
            console.log(
              `[get-pending-jobs] ebay ${String(j.id).slice(0, 8)} : aspects obligatoires posés depuis le ` +
              `référentiel (cat. ${catDe(j)}, ${liste.length} requis sur ${Number(r.aspect_count ?? 0)})`,
            );
          }
        } catch (_e) { /* best-effort : jamais un point de panne — le job est servi tel quel */ }
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

    // ══ RIEN NE SE SUPPRIME TANT QUE LA RECRÉATION N'EST PAS GARANTIE ═══════
    // (2026-09-18, GO Nico — job 839f1077, xxewwer, Pro abonné du jour)
    //
    // CE QUI S'EST PASSÉ. « Maquillage Fabienne Sévigné » — un LIVRE relié, en
    // « Livres et médias > Livres > Non-fiction », catégorie exacte. L'annonce
    // d'origine portait `isbn = "0000000000000"`, le remplissage de Vinted. Le
    // handler refuse à juste titre d'envoyer treize zéros (15/09,
    // estIsbnDeRemplissage) — donc l'étape ISBN ne tourne plus DU TOUT, et le
    // POST part sans ISBN. L'annonce a été SUPPRIMÉE à 17:42, le refus est
    // tombé à 17:49 : `{"field":"isbn"}`. Annonce perdue, compte qui vient de
    // payer. On a supprimé sans savoir rendre.
    //
    // POURQUOI LE PRÉ-VOL DE LA PAGE N'A RIEN VU, et c'est le cœur du défaut :
    // computeVintedRequiredState (vinted.js) ne juge les requis que sur la
    // config /attributes que Vinted sert à la page — et cette config déclare
    // `isbn` **required: false** (relevé DOM du 17/07, toujours en base). Le
    // serveur, lui, refuse le dépôt sans ISBN : c'est écrit noir sur blanc dans
    // platform_category_aspects depuis le 31/08 (source `server_400`), pour les
    // DEUX branches Livres. La connaissance était acquise depuis 18 jours,
    // personne ne la relisait avant de supprimer. Même forme que la Couleur
    // (« le 400 prouvé prime sur la config ») — corrigée pour `color`, jamais
    // généralisée.
    //
    // DEUX GESTES, DANS CET ORDRE. D'abord CHERCHER la valeur au lieu de la
    // demander (consigne Nico : « l'ISBN est dans sa description, on va pas le
    // lui faire remplir à la main, il a rien demandé » — il y était :
    // « ✅ ISBN 2-902634-36-6 »). Ensuite seulement, s'il manque encore un
    // requis PROUVÉ de la catégorie de destination : NE PAS SERVIR le job à
    // l'étape qui supprime. L'annonce reste EN LIGNE et la question est posée
    // sur une annonce vivante — l'inverse exact d'aujourd'hui.
    //
    // MESURÉ AVANT D'ÊTRE POSÉ (14 jours, 1 841 republications, dont 50 Livres
    // dans la portée) : la garde aurait arrêté 2 jobs — les deux livres de
    // carhoa à « 0000000000000 », sans ISBN nulle part, ni sur l'annonce ni
    // dans la description. ZÉRO arrêt à tort sur 645 État, 478 Taille, 392
    // Couleur, 55 Marque, 30 Plateforme de jeu : toutes ces valeurs sont bien
    // là, dans la réponse de la personne, les item_attributes capturés ou le
    // snapshot — encore fallait-il aller les y chercher, c'est ce que fait
    // valeurDisponible.
    // La déduction d'ISBN, elle, mesurée sur 400 annonces réelles (livres,
    // vêtements, jeux, coques, DVD) : 1 seule trouvée — celle de Xewer, la
    // bonne — et 0 faux positif. Aucune année, dimension, taille ni référence
    // prise pour un ISBN, grâce à l'ancrage obligatoire de _shared/isbn.js.
    //
    // ⛔ L'ÉTAPE 'deleted' NE BLOQUE JAMAIS (B.5) : l'annonce d'origine n'existe
    // déjà plus, refuser de servir laisserait la personne sans rien. On y fait
    // la déduction — qui peut sauver le job, et qui a sauvé celui de Xewer —
    // mais aucun blocage. Seule l'étape 'captured', celle qui tient encore
    // l'annonce en ligne, a le droit de dire non.
    let isbnDeduits = 0;
    let heldRequisDestination = 0;
    if (!includeProcessing && !includeNeedsUser) {
      const pfOf = (j: { platform_fields: unknown }) =>
        ((j.platform_fields as Record<string, unknown> | null) ?? {});
      const stepDe = (j: { platform_fields: unknown }) => {
        const s = String(pfOf(j)["republish_step"] ?? "");
        return s === "captured" || s === "deleted" ? s : "a_capturer";
      };
      const snapDe = (pf: Record<string, unknown>) =>
        (pf.republish_snapshot && typeof pf.republish_snapshot === "object")
          ? (pf.republish_snapshot as Record<string, unknown>) : null;
      // Clé de catégorie = le chemin capturé, tel qu'il est écrit dans
      // platform_category_aspects (« A > B > C »). Pas de chemin = pas de
      // catégorie de destination connue = on ne juge rien (doute = servi).
      const cleCategorie = (pf: Record<string, unknown>) => {
        const chemin = snapDe(pf)?.categoryPath;
        if (!Array.isArray(chemin) || !chemin.length) return null;
        return chemin.map((v) => String(v ?? "").trim()).filter(Boolean).join(" > ") || null;
      };

      const candidats = out.filter((j) =>
        j.platform === "vinted" && j.action === "republish" && stepDe(j) !== "a_capturer");

      if (candidats.length) {
        try {
          // ── Geste 1 : l'ISBN se CHERCHE avant de se demander ──────────────
          // Servi seulement (aucune écriture en base), exactement comme le
          // filet « langue du livre » : le job SERVI est enrichi, le prochain
          // poll re-déduira la même chose. vintedAspects.isbn est le canal
          // normal — le pont _bridge de vinted.js le recopie vers le champ
          // dédié, et une valeur déjà présente (réponse de la personne) prime
          // toujours : resoudreIsbn la rend en premier.
          for (const j of candidats) {
            const pf = pfOf(j);
            const snap = snapDe(pf);
            const va = (pf.vintedAspects && typeof pf.vintedAspects === "object")
              ? (pf.vintedAspects as Record<string, unknown>) : {};
            // Périmètre : les Livres, reconnus au chemin capturé — la seule
            // branche où Vinted réclame un ISBN.
            const cle = cleCategorie(pf);
            if (!cle || !/(^|>)\s*Livres\s*(>|$)/i.test(cle)) continue;
            if (String(va.isbn ?? "").trim()) continue; // déjà tranché
            const trouve = resoudreIsbn({
              reponse: va.isbn,
              capture: snap?.isbn,
              description: snap?.description ?? j.description,
              titre: snap?.titre ?? j.title,
            });
            if (!trouve) continue;
            j.platform_fields = {
              ...pf,
              vintedAspects: { ...va, isbn: trouve.isbn13 },
              isbn_deduit_serveur: {
                valeur: trouve.isbn13,
                trouve: trouve.trouve,
                source: trouve.source,
                le: new Date().toISOString(),
              },
            };
            isbnDeduits++;
            console.log(
              `[get-pending-jobs] republish ${String(j.id).slice(0, 8)} : ISBN ${trouve.isbn13} ` +
              `déduit (${trouve.source} : « ${trouve.trouve} ») — aucune question posée`,
            );
          }

          // ── Geste 2 : le pré-vol des requis de la catégorie de DESTINATION ─
          // Seuls les jobs à l'étape 'captured' sont jugés : ce sont les seuls
          // dont l'annonce est encore en ligne, donc les seuls qu'on puisse
          // encore épargner.
          const aJuger = candidats.filter((j) => stepDe(j) === "captured" && cleCategorie(pfOf(j)));
          if (aJuger.length) {
            const cles = [...new Set(aJuger.map((j) => cleCategorie(pfOf(j))!))];
            // ⛔ `source = 'server_400'` ET RIEN D'AUTRE, et c'est mesuré.
            // Un requis venu de la config de la PAGE (`source = 'dom'`) n'est
            // pas une preuve : le formulaire pré-remplit, la boucle générique
            // comble, et ça republie très bien. Simulé sur 14 jours, juger sur
            // le `dom` aurait arrêté une jupe de stessygaudin (046da722,
            // « Longueur de la jupe » absente des attributs capturés) qui est
            // partie sans encombre. Un `server_400`, lui, est Vinted qui a
            // REFUSÉ ce champ précis sur cette catégorie précise : c'est la
            // seule preuve qui autorise à retenir une suppression.
            // Portée réelle aujourd'hui : isbn (2 branches Livres), color (8),
            // brand (3), internal_memory_capacity (1). Sur 14 jours : 2 arrêts,
            // 0 à tort.
            const { data: requisRows } = await userClient
              .from("platform_category_aspects")
              .select("category_key, field_key, field_label")
              .eq("platform", "vinted").eq("required", true)
              .eq("source", "server_400").in("category_key", cles);
            const requisParCle = new Map<string, Array<{ key: string; label: string }>>();
            for (const r of ((requisRows ?? []) as Record<string, unknown>[])) {
              const k = String(r.category_key);
              const key = String(r.field_key ?? "").trim();
              if (!key) continue;
              const liste = requisParCle.get(k) ?? [];
              // Un même champ peut être déclaré par plusieurs sources (dom,
              // server_400) : une seule entrée, le 400 ne change pas le nom.
              if (!liste.some((x) => x.key === key)) {
                liste.push({ key, label: String(r.field_label ?? key).trim() || key });
              }
              requisParCle.set(k, liste);
            }

            // Les attributs CAPTURÉS sur l'annonce d'origine : c'est eux qui
            // portent « Plateforme », « Classement du contenu », « Longueur de
            // la jupe »… Le content script les résout sur le formulaire
            // (itemAttributesCaptures). Sans cette lecture, la garde bloquerait
            // 69 republications parfaitement valides sur 14 jours — mesuré.
            const capIds = [...new Set(aJuger
              .map((j) => Number(pfOf(j).capture_id))
              .filter((n) => Number.isFinite(n) && n > 0))];
            const codesParCapture = new Map<number, Set<string>>();
            if (capIds.length) {
              const { data: caps } = await userClient
                .from("vinted_republish_captures").select("id, payload").in("id", capIds);
              for (const c of ((caps ?? []) as Record<string, unknown>[])) {
                const natif = ((c.payload as Record<string, unknown> | null)?.natif ?? null) as Record<string, unknown> | null;
                const attrs = Array.isArray(natif?.item_attributes) ? (natif!.item_attributes as unknown[]) : [];
                const codes = new Set<string>();
                for (const a of attrs) {
                  const o = (a && typeof a === "object") ? (a as Record<string, unknown>) : null;
                  const code = String(o?.code ?? "").trim().toLowerCase();
                  if (code && Array.isArray(o?.ids) && (o!.ids as unknown[]).length) codes.add(code);
                }
                codesParCapture.set(Number(c.id), codes);
              }
            }

            // Une valeur est DISPONIBLE si l'un des trois canaux la porte. On
            // reproduit ce que le handler saura lire, ni plus (sinon on bloque
            // à tort) ni moins (sinon on supprime à tort).
            const valeurDisponible = (j: typeof aJuger[number], champ: string) => {
              const pf = pfOf(j);
              const snap = snapDe(pf);
              const va = (pf.vintedAspects && typeof pf.vintedAspects === "object")
                ? (pf.vintedAspects as Record<string, unknown>) : {};
              const texte = (v: unknown) => String(v ?? "").trim().length > 0;
              // ⛔ L'ISBN EST LE SEUL CHAMP OÙ « PRÉSENT » NE VEUT RIEN DIRE, et
              // c'est TOUTE la leçon du 18/09 : l'annonce de Xewer portait bien
              // un ISBN — treize zéros. Présent, de clé de contrôle valide, et
              // refusé par Vinted. Un champ dont on sait valider la forme se
              // juge sur sa VALEUR, jamais sur sa présence : ici on exige ce
              // que le formulaire exigera (normalizeIsbn, le même code).
              if (champ === "isbn") {
                return normalizeIsbn(va.isbn).ok || normalizeIsbn(snap?.isbn).ok;
              }
              if (texte(va[champ])) return true;                                     // 1. réponse / déduction
              if (codesParCapture.get(Number(pf.capture_id))?.has(champ.toLowerCase())) return true; // 2. attributs capturés
              switch (champ) {                                                        // 3. snapshot
                case "condition": return texte(snap?.etat);
                case "brand": return texte(snap?.marque);
                case "size": return texte(snap?.taille) || texte(snap?.size_id)
                  || (Array.isArray(snap?.taille_ids) && (snap!.taille_ids as unknown[]).length > 0);
                case "color": return (Array.isArray(snap?.couleurs) && (snap!.couleurs as unknown[]).length > 0)
                  || texte(snap?.color1_id);
                default: return false;
              }
            };

            const aRetenir = new Set<string>();
            for (const j of aJuger) {
              const pf = pfOf(j);
              const manquants = (requisParCle.get(cleCategorie(pf)!) ?? [])
                .filter((r) => !valeurDisponible(j, r.key));
              if (!manquants.length) continue;
              const premier = manquants[0];
              const libelles = manquants.map((m) => m.label).join(" », « ");
              // ── ON NE POSE PAS TROIS FOIS LA MÊME QUESTION ────────────────
              // Cette garde écrit `needs_user` DIRECTEMENT en base : elle ne
              // passe pas par updateJobStatus, donc l'anti-boucle de
              // l'extension (gardeAntiBoucleNeedsUser, BOUCLE_NEEDS_USER_MAX)
              // ne la voit jamais. Sans borne ici, quelqu'un qui n'a pas
              // l'ISBN de son livre — il existe des livres sans ISBN, et des
              // gens qui ne veulent pas le chercher — reprendrait la même
              // question à chaque relance, indéfiniment. Au 4e tour on arrête
              // de demander : `needsUserField` n'est plus posé, donc l'app ne
              // rouvre plus la modale, et le message dit la seule chose qui
              // compte — l'annonce est toujours en ligne, il n'y a rien à
              // rattraper.
              const tours = Number((pf.prevol_destination as Record<string, unknown> | undefined)?.tours ?? 0) + 1;
              const onRedemande = tours <= 3;
              // Message écrit à la personne : ce qu'on n'a PAS fait d'abord
              // (« ton annonce est toujours en ligne »), puis ce qu'on demande.
              // C'est l'inverse exact du message d'après-suppression.
              const message = onRedemande
                ? `Ton annonce est TOUJOURS EN LIGNE : on ne l'a pas retirée. ` +
                  `Pour la republier, Vinted réclame « ${libelles} » et on ne l'a trouvé ni sur ton annonce ` +
                  `ni dans sa description. Complète ce champ et la republication repartira toute seule — ` +
                  `tant que ce n'est pas fait, rien n'est touché.`
                : `Ton annonce est TOUJOURS EN LIGNE et elle y reste. On ne sait pas la republier sans ` +
                  `« ${libelles} », que Vinted exige pour cette catégorie — on ne te le redemande plus. ` +
                  `Rien n'a été retiré, rien n'est perdu.`;
              // ⚠️ Au tour d'arrêt, `needsUserField` doit être RETIRÉ, pas
              // seulement « non reposé » : il traîne dans platform_fields
              // depuis le tour précédent et l'app rouvrirait la modale.
              const pfEcrit: Record<string, unknown> = { ...(j.platform_fields as Record<string, unknown>) };
              delete pfEcrit.needsUserField;
              delete pfEcrit.needsUserFields;
              const { data: maj } = await userClient.from("cross_post_jobs")
                .update({
                  status: "needs_user",
                  error: message,
                  platform_fields: {
                    ...pfEcrit,
                    ...(onRedemande
                      ? {
                        needsUserField: {
                          field_key: premier.key,
                          field_label: premier.label,
                          platform: "vinted",
                          target: { root: "vintedAspects", key: premier.key },
                        },
                        ...(manquants.length > 1
                          ? {
                            needsUserFields: manquants.map((m) => ({
                              field_key: m.key,
                              field_label: m.label,
                              target: { root: "vintedAspects", key: m.key },
                            })),
                          }
                          : {}),
                      }
                      : {}),
                    prevol_destination: {
                      categorie: cleCategorie(pf),
                      manquants: manquants.map((m) => m.key),
                      tours,
                      redemande: onRedemande,
                      le: new Date().toISOString(),
                      source: "get-pending-jobs",
                    },
                  },
                })
                .eq("id", j.id).eq("status", "pending").select("id");
              aRetenir.add(String(j.id));
              console.log(
                `[get-pending-jobs] republish ${String(j.id).slice(0, 8)} NON SERVI à l'étape 'captured' : ` +
                `requis « ${manquants.map((m) => m.key).join(", ")} » introuvable(s) pour « ${cleCategorie(pf)} » — ` +
                `needs_user, ANNONCE INTACTE${(maj ?? []).length ? "" : " (déjà sortie de pending)"}`,
              );
            }
            if (aRetenir.size) {
              const avant = out.length;
              out = out.filter((j) => !aRetenir.has(String(j.id)));
              heldRequisDestination = avant - out.length;
            }
          }
        } catch (_e) {
          // Best-effort, jamais un point de panne : en cas de pépin la
          // republication repart comme avant ce bloc.
        }
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
      (heldRetraitSansLien ? `, ${heldRetraitSansLien} retrait(s) retenu(s) (sans lien : attente, jamais par titre)` : "") +
      (aspectsPoses ? `, ${aspectsPoses} job(s) ebay complété(s) (aspects obligatoires posés depuis le référentiel)` : "") +
      (heldBeebsInterdit ? `, ${heldBeebsInterdit} dépôt(s) beebs → needs_user (article refusé par le catalogue Beebs)` : "") +
      (heldRetrait0625 ? `, ${heldRetrait0625} republish retenu(s) (coupe-circuit retrait taille_par_id)` : "") +
      (isbnDeduits ? `, ${isbnDeduits} ISBN déduit(s) sans rien demander` : "") +
      (heldRequisDestination ? `, ${heldRequisDestination} republish → needs_user AVANT suppression (requis de la catégorie de destination introuvable)` : ""),
    );

    // ── Contexte du popup (2026-08-04) ──────────────────────────────────────
    // Le popup doit répondre à « où j'en suis ? », pas seulement « qu'est-ce
    // que je publie ? ». Ces deux lectures sont servies ICI plutôt que par
    // deux requêtes REST depuis le popup : la fonction a déjà authentifié
    // l'utilisateur et tient un client scopé RLS — c'est zéro aller-retour de
    // plus. Derrière un flag : le BACKGROUND, qui poll toutes les 2 minutes,
    // ne paie rien de tout ça.
    let contexte: { sync: unknown; sessions: unknown; verite: unknown } | null = null;
    if (body?.include_context === true) {
      contexte = { sync: null, sessions: null, verite: null };
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
      // ── LA VÉRITÉ DES PLATEFORMES (2026-09-23, cas Marine Rocher) ──────────
      // Le popup affichait « Connectée » sur eBay à quelqu'un qui n'a PAS de
      // compte eBay : la sonde de session teste une page publique (200 sans
      // compte), et son relevé disait pourtant « page de connexion ». Le
      // serveur tranche désormais UNE fois pour tous les écrans —
      // plateformes_verite : le fait le plus récent et le plus précis gagne
      // (relevé > dépôt > sonde), eBay n'est connectée que Hub vendeur ouvert,
      // relevé réussi, dépôt ou compte relié par l'API ; Opla 401 = à autoriser.
      // Le popup ≥ 0.6.61 lit `verite` ; les popups d'avant lisent encore
      // `sessions.ebay` — on leur retire le `true` sans preuve : la ligne
      // redevient « pas encore vérifié », plus jamais « Connectée » à tort.
      try {
        const { data: verite } = await userClient.rpc("plateformes_verite");
        const v = verite as { ok?: boolean; plateformes?: Record<string, { etat?: string }> } | null;
        if (v && v.ok === true) {
          contexte.verite = v;
          const s = contexte.sessions as Record<string, unknown> | null;
          if (s && typeof s === "object" && s.ebay === true && v.plateformes?.ebay?.etat !== "connectee") {
            contexte.sessions = { ...s, ebay: null };
          }
        }
      } catch (_e) { /* la vérité ne bloque jamais la distribution des jobs */ }
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
        // Le NOMBRE NU entre aussi (24/09) : la porte « N » → « EU N » de
        // tailleAServir (23/09) n'était jamais atteinte — ce filtre ne laissait
        // passer que les captures préfixées. Veste Brice « 48 » de Joséphine
        // (9a3da3d5), « 42 » (d6ec3d42) : trois essais sur le même mur.
        const aTraiter = republishTaille.filter((j) => {
          const t = normaliserTaille(derniereCapture.get(String(j.inventaire_id))?.["taille"]);
          return TAILLE_PREFIXEE_RE.test(t) || NOMBRE_NU_RE.test(t);
        });
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
            // Grille : celle du catalogue relevé ; à défaut, les options que
            // l'extension a VUES sur le vrai formulaire au dernier échec de CE
            // job pour CETTE taille (last_diagnostic, tous onglets). « Autres »
            // des costumes homme (1866) n'a pas de grille au catalogue.
            const grilleReleve = grilles.get(chemin) ?? grilleDuDernierEchecTaille(pf["last_diagnostic"], captureTaille);
            const r = tailleAServir({
              captureTaille,
              inventaireTaille: tailleInventaire.get(String(j.inventaire_id)) ?? null,
              options: grilleReleve,
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
              `à capture préfixée EU/FR/UK ou nombre nu (${aTraiter.length} dans le périmètre)`,
            );
          }
        }
      }
    } catch (_e) { /* le dépannage ne doit jamais empêcher de servir la file */ }

    // ══ LA COPIE SERVIE AVEC LE JOB — DÉBLOCAGE DU PRÉ-VOL 0.6.58 SANS STORE
    //    (2026-09-23, 94 republications Vinted à l'arrêt) ═══════════════════
    // CE QUI S'EST PASSÉ. Le pré-vol « on ne retire pas ce qu'on ne sait pas
    // remettre » de la 0.6.58 lit `platform_fields.republish_snapshot` pour
    // Vinted — et sur le chemin Vinted, cette clé est ÉCRITE PAR LE MÊME
    // PASSAGE, 250 lignes PLUS BAS (`pf.republish_snapshot =
    // construireSnapshotRepublish(...)`, juste avant le retrait). Au moment où
    // la garde la cherche, elle ne peut pas encore exister : le contrôle porte
    // sur une valeur que le code qui le suit produit. Résultat mesuré en base :
    // 99 passages, 99 « bloque », 0 « ok » — 100 % de faux positifs, et un
    // message absurde (« la copie de ton annonce manque dans la copie de ton
    // annonce »).
    // ⛔ LA GARDE N'EST PAS COUPÉE. Elle reçoit enfin ce qu'elle réclame : la
    //    copie RÉELLE, relue dans vinted_republish_captures par capture_id,
    //    dans la forme exacte qu'elle sait lire. Une capture à qui il manque
    //    vraiment un catalog_id ou un package_size_id (le cas XEWER, job
    //    6aabc550) bloquera toujours le retrait — c'est le seul contrôle que
    //    rien d'autre ne fait sur ce chemin.
    // ⛔ ON N'ÉCRASE JAMAIS une copie déjà présente sur le job : le snapshot
    //    écrit par l'extension prime, toujours.
    // ⛔ Périmètre : Vinted, action republish, étapes 'captured' (le retrait
    //    qui va partir) et 'deleted' (recréation après retrait). Rien d'autre.
    // Mémoire seule : aucune écriture en base. L'extension réécrira sa propre
    // copie au moment de figer le job, comme aujourd'hui.
    try {
      const idCap = (j: { platform_fields: unknown }): number =>
        Number(((j.platform_fields as Record<string, unknown> | null) ?? {})["capture_id"]);
      const sansCopie = out.filter((j) => {
        if (j.action !== "republish" || j.platform !== "vinted") return false;
        const pf = (j.platform_fields as Record<string, unknown> | null) ?? {};
        const step = String(pf["republish_step"] ?? "");
        if (step !== "captured" && step !== "deleted") return false;
        const snap = pf["republish_snapshot"];
        if (snap && typeof snap === "object") return false; // copie déjà sur le job : intouchée
        return Number.isFinite(idCap(j)) && idCap(j) > 0;
      });
      if (sansCopie.length) {
        const { data: caps } = await userClient
          .from("vinted_republish_captures")
          .select("id, verdict, captured_at, payload, libelles, photos_urls")
          .eq("user_id", user.id)
          .in("id", [...new Set(sansCopie.map(idCap))]);
        const parId = new Map<number, Record<string, unknown>>();
        for (const c of ((caps ?? []) as Array<Record<string, unknown>>)) parId.set(Number(c["id"]), c);
        let servies = 0;
        const sansCapture: string[] = [];
        for (const j of sansCopie) {
          const pf = (j.platform_fields as Record<string, unknown> | null) ?? {};
          const cap = parId.get(idCap(j));
          // Capture absente ou non valide : on ne sert RIEN. La garde bloquera,
          // et c'est le bon verdict — il n'y a effectivement pas de copie.
          if (!cap || cap["verdict"] !== "valide") { sansCapture.push(String(j.id)); continue; }
          j.platform_fields = {
            ...pf,
            republish_snapshot: copieRepublishDepuisCapture(pf, cap),
            republish_copie_servie: {
              capture_id: idCap(j), etape: String(pf["republish_step"] ?? ""),
              source: "vinted_republish_captures (get-pending-jobs)", at: new Date().toISOString(),
            },
          };
          servies++;
        }
        if (servies) {
          console.log(`[get-pending-jobs] userId=${user.id} : copie d'annonce servie sur ${servies} republication(s) Vinted (pré-vol 0.6.58)`);
        }
        if (sansCapture.length) {
          console.warn(`[get-pending-jobs] userId=${user.id} : ${sansCapture.length} republication(s) Vinted SANS capture valide — pré-vol laissé bloquant (${sansCapture.slice(0, 5).join(", ")})`);
        }
      }
    } catch (_e) { /* le dépannage ne doit jamais empêcher de servir la file */ }

    // ── TAILLE VINTED À LA **PUBLICATION** : NOMBRE → LETTRE (2026-09-15) ────
    // La republication ci-dessus servait déjà le libellé de la grille ; la
    // PUBLICATION, elle, n'a jamais rien converti. La conversion existait dans
    // l'extension (vinted.js, « 1ter », 0.6.24) derrière une condition
    // « grille purement lettrée » = aucune option ne contient de chiffre —
    // qu'AUCUNE grille Vinted ne satisfait, puisqu'elles finissent toutes par
    // 4XL…9XL. Elle n'a donc jamais tourné : la jupe « 42 » d'Ornella a échoué
    // les 11 et 13/09 sur une 0.6.36, et son blazer « 36 » le 15/09.
    // Mesuré sur 25 j (publish vinted avec une taille, hors compte de test) :
    // branche Femmes + nombre nu = 3 jobs, 3 NON publiés — 100 % de la classe.
    // Hommes + nombre nu = 0, Enfants + nombre nu = 1, publié (la cascade
    // « nombre ancré » de l'extension le résout déjà).
    // Ici, côté serveur, ça atteint TOUS les builds sans passer par le Store.
    // Table, branche Femmes seulement et garde-fous : _shared/vinted-taille-
    // republication.ts (tailleAServirPublication) — le même fichier que la
    // republication, la même normalisation de libellé. Rien n'est réécrit en
    // base : on ne fait que servir la valeur.
    try {
      const publishTaille = out.filter((j) =>
        j.platform === "vinted" && j.action !== "republish" &&
        NOMBRE_NU_TAILLE_RE.test(String((j.platform_fields as Record<string, unknown> | null)?.["taille"] ?? "").trim())
      );
      if (publishTaille.length) {
        const cheminDe = (j: (typeof publishTaille)[number]): string => {
          const p = (j.platform_fields as Record<string, unknown> | null)?.["categoryPath"];
          return Array.isArray(p) ? p.map((s) => String(s)).join(" > ") : "";
        };
        const chemins = [...new Set(publishTaille.map(cheminDe).filter(Boolean))];
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
        let convertis = 0;
        for (const j of publishTaille) {
          const pf = (j.platform_fields as Record<string, unknown> | null) ?? {};
          const chemin = cheminDe(j);
          const taille = String(pf["taille"] ?? "").trim();
          const r = tailleAServirPublication({
            taille,
            cheminCategorie: chemin,
            options: grilles.get(chemin) ?? null,
          });
          // Trace servie AUSSI quand rien n'est converti (même doctrine que la
          // republication) : c'est ce qui se lit en SQL pour savoir si la
          // conversion sert, ou si elle masque autre chose.
          const trace = {
            taille_article: taille, categorie: chemin || null, grille_relevee: grilles.has(chemin),
            valeur: r.valeur, ordre: r.ordre,
            ...(r.valeur === null ? { motif: r.motif } : { detail: r.detail }),
            at: new Date().toISOString(),
          };
          if (r.valeur === null) {
            j.platform_fields = { ...pf, publish_taille_convertie: trace };
            continue;
          }
          j.platform_fields = { ...pf, taille: r.valeur, publish_taille_convertie: trace };
          convertis++;
          console.log(`[get-pending-jobs] job ${j.id} : taille « ${taille} » → « ${r.valeur} » (${chemin})`);
        }
        if (convertis) {
          console.log(
            `[get-pending-jobs] userId=${user.id} : taille convertie sur ${convertis} publication(s) vinted ` +
            `(${publishTaille.length} à taille numérique)`,
          );
        }
      }
    } catch (_e) { /* la conversion est un confort : jamais un point de panne */ }

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
          // ── « FERMETURE » DEPUIS LES MOTS DU VENDEUR (2026-09-23 soir) ─────
          // Beebs exige « Fermeture » sur les chaussures ; la fiche ne porte
          // pas ce champ, mais le titre ou la description disent souvent
          // « à lacets », « scratch », « zip ». Table FERMÉE mot → valeur de
          // LA liste de Beebs pour ce rayon ; un seul mot reconnu, sinon rien
          // (jamais deviné) ; jamais par-dessus une valeur déjà posée ou déjà
          // tranchée par la personne.
          try {
            const rangee = (parCategorie.get(cat) ?? []).find((a) => /^fermeture$/i.test(String(a.field_key ?? a.field_label ?? "")));
            const aspectsPf = (pf["beebsAspects"] ?? {}) as Record<string, unknown>;
            const dejaTranchee = Boolean(((pf["needsUserResolved"] ?? {}) as Record<string, unknown>)["beebsAspects.Fermeture"]);
            if (rangee && !String(aspectsPf["Fermeture"] ?? "").trim() && !dejaTranchee && !("Fermeture" in r.aspects)) {
              const liste = (Array.isArray(rangee.allowed_values) ? rangee.allowed_values : []).map((v) => String(v ?? ""));
              const texte = `${String(j.title ?? "")} ${String(j.description ?? "")}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
              const MOTS: Array<[RegExp, RegExp]> = [
                [/\blacets?\b/, /lacets?/i],
                [/\b(scratch|velcro)\b/, /scratch/i],
                [/\b(zip|zippe|zippee|fermeture eclair)\b/, /eclair|zip/i],
                [/\bboucles?\b/, /boucle/i],
                [/\b(a enfiler|slip[- ]?on|sans lacets?)\b/, /enfiler/i],
              ];
              const trouves = MOTS.filter(([mot]) => mot.test(texte));
              if (trouves.length === 1) {
                const valeur = liste.find((v) => trouves[0][1].test(v.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
                if (valeur) {
                  r.aspects["Fermeture"] = valeur;
                  r.posees.push({ cle_source: "titre/description", champ: "Fermeture", valeur_source: String(texte.match(trouves[0][0])?.[0] ?? ""), valeur_posee: valeur, methode: "mots_du_vendeur" });
                }
              }
            }
          } catch (_e) { /* jamais un point de panne : sans déduction, le handler demandera */ }
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
            .in("platform", ["vinted", "leboncoin", "ebay", "beebs", "opla"])
            .eq("action", "publish")
            .in("status", ["pending", "processing", "needs_user"]);
          if (!vivErr) {
            const servis = new Set(out.filter((j) => j.inventaire_id === tete.inventaire_id).map((j) => String(j.id)));
            const enCours = new Set(
              (vivants ?? []).filter((v) => !servis.has(String(v.id))).map((v) => String(v.platform)),
            );
            for (const pf of ["vinted", "leboncoin", "ebay", "beebs", "opla"]) {
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
        // ── ET LES REPUBLICATIONS AUSSI (2026-09-20) ──────────────────────
        // Ce nettoyage ne tournait que sur `publish`. Or une REPUBLICATION
        // repasse par le même formulaire Leboncoin, avec les mêmes règles —
        // et c'est exactement ce qui a laissé « Picture Organic Clothing
        // T-shirt » (compte Pro) HORS LIGNE 59 HEURES : retirée le 17/09,
        // refusée au redépôt par « vous avez utilisé des mots qui ne
        // respectent pas nos règles de contenu », sur une description qui
        // porte DIX hashtags quand Leboncoin en accepte cinq. Le nettoyage
        // existait, il ne la regardait pas.
        // Le job en base n'est pas modifié : on ne nettoie que le texte SERVI.
        if (j.platform !== "leboncoin" || (j.action !== "publish" && j.action !== "republish")) continue;
        // ── LE TITRE AUSSI (2026-09-21) ───────────────────────────────────
        // Le 403 de Leboncoin vise « le titre ET/OU le texte ». Seul le texte
        // était nettoyé — et ça tenait tant que l'IA réécrivait le titre, ce
        // qu'elle ne fait plus depuis ce jour (« un texte qui EXISTE fait
        // foi »). 149 titres du parc portent une mention de site, presque tous
        // des « Pas de vinted go - … » : sans ça, ils partiraient sur un refus.
        // Le job en base n'est pas modifié : on ne nettoie que ce qui est SERVI.
        if (typeof j.title === "string") {
          const t = nettoyerTitreLeboncoin(j.title);
          if (t.modifie) {
            console.log(`[get-pending-jobs] titre Leboncoin ${String(j.id).slice(0, 8)} : mention de site retirée (${t.termes.join(", ")}) — « ${j.title} » → « ${t.titre} »`);
            j.title = t.titre;
            j.title_nettoyage = { termes: t.termes };
          } else if (t.termes.length) {
            console.warn(`[get-pending-jobs] titre Leboncoin ${String(j.id).slice(0, 8)} : mention de site (${t.termes.join(", ")}) NON retirable sans vider le titre — servi tel quel, Leboncoin refusera peut-être le dépôt`);
          }
        }
        if (typeof j.description !== "string") continue;
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

    // ── DÉPÔT BEEBS : DESCRIPTION D'AU MOINS 5 CARACTÈRES, COULEUR ET MATIÈRE
    // DEPUIS L'ARTICLE (2026-09-13, dossier Joséphine) ─────────────────────
    // Le formulaire Beebs REFUSE côté navigateur une description de moins de
    // 5 caractères (i18n `description_min_length` = « Ajouter au moins
    // 5 caractères », relevé dans son bundle) : le clic n'émet rien, rien
    // n'est créé, le job tombe en « Dépôt Beebs non confirmé ». 4 dépôts en
    // 0.6.32 le 13/09, tous avec `description` VIDE (articles importés de
    // Vinted, la sync ne rapporte pas la description) ; le 5e du même lot,
    // avec 135 car., est parti. On complète ICI le texte SERVI avec des faits
    // DÉJÀ sur le job (titre, état, marque, taille — _shared/description-
    // beebs.ts), jamais une invention ; le job en base n'est pas modifié,
    // comme pour Leboncoin ci-dessus.
    // Couleur / Matière : sélecteurs OPTIONNELS sur Beebs (required=false
    // dans platform_category_aspects) — leur placeholder « Sélectionner une
    // valeur » n'est PAS une erreur. Mais l'annonce vaut mieux avec : quand le
    // job n'en porte pas, on sert la valeur relevée sur l'ANNONCE VINTED de la
    // vendeuse (inventaire.attributs, sources `capture` / `vinted_*` seules —
    // jamais backfill_job ni IA). L'extension la pose si elle est dans la
    // liste Beebs, sinon avertit et continue (champ facultatif). L'extension
    // renvoie le pf au statut suivant, la valeur se retrouve en base par ce
    // seul chemin. Best-effort : jamais un point de panne.
    let beebsDescriptions = 0; let beebsValeurs = 0;
    try {
      const depotsBeebs = (out as unknown as Array<Record<string, unknown>>)
        .filter((j) => j.platform === "beebs" && j.action === "publish");
      if (depotsBeebs.length) {
        const ids = [...new Set(depotsBeebs.map((j) => j.inventaire_id).filter((x) => x != null))];
        const attrsParArticle = new Map<string, Record<string, unknown>>();
        if (ids.length) {
          const { data: arts } = await userClient.from("inventaire").select("id, attributs").in("id", ids);
          for (const a of (arts ?? []) as Record<string, unknown>[]) {
            const at = a.attributs;
            if (at && typeof at === "object") attrsParArticle.set(String(a.id), at as Record<string, unknown>);
          }
        }
        const valeurCertaine = (attrs: Record<string, unknown> | undefined, cle: string): { v: string; source: string } | null => {
          const e = attrs?.[cle] as Record<string, unknown> | undefined;
          if (!e || typeof e !== "object") return null;
          const v = typeof e.v === "string" ? e.v.trim() : "";
          const source = typeof e.source === "string" ? e.source : "";
          if (!v || !/^(capture|vinted)/.test(source)) return null;
          return { v, source };
        };
        for (const j of depotsBeebs) {
          const pfJ = ((j.platform_fields ?? {}) as Record<string, unknown>);
          const complements: Record<string, unknown> = {};
          // 1. Description : minimum de 5 caractères.
          const r = completerDescriptionBeebs(typeof j.description === "string" ? j.description : "", {
            titre: typeof j.title === "string" ? j.title : "",
            etat: typeof pfJ["etat"] === "string" ? (pfJ["etat"] as string) : "",
            marque: typeof pfJ["marque"] === "string" ? (pfJ["marque"] as string) : "",
            taille: typeof pfJ["taille"] === "string" ? (pfJ["taille"] as string) : "",
          });
          if (r.modifiee) {
            j.description = r.texte;
            complements.description = { motif: "minimum_beebs_5", ajouts: r.ajouts };
            beebsDescriptions++;
            console.log(`[get-pending-jobs] description Beebs ${String(j.id).slice(0, 8)} : vide ou < 5 car. → ${r.texte.length} car. depuis les faits du job (${r.ajouts.join(" + ")})`);
          }
          // 2. Couleur / Matière depuis l'annonce Vinted de la vendeuse.
          const attrs = attrsParArticle.get(String(j.inventaire_id));
          const colors = Array.isArray(pfJ["colors"]) ? (pfJ["colors"] as unknown[]).filter((c) => typeof c === "string" && c.trim()) : [];
          const pfSuite: Record<string, unknown> = { ...pfJ };
          let touche = false;
          for (const [cle, libelle] of [["couleur", "Couleur"], ["matiere", "Matière"]] as const) {
            const deja = typeof pfJ[cle] === "string" && (pfJ[cle] as string).trim();
            if (deja || (cle === "couleur" && colors.length)) continue;
            const val = valeurCertaine(attrs, cle);
            if (!val) continue;
            pfSuite[cle] = val.v;
            complements[cle] = { valeur: val.v, source: `inventaire.attributs.${cle} (${val.source})` };
            touche = true;
            console.log(`[get-pending-jobs] ${libelle} Beebs ${String(j.id).slice(0, 8)} : servie depuis l'annonce Vinted (« ${val.v} », ${val.source})`);
          }
          if (touche) { j.platform_fields = pfSuite; beebsValeurs++; }
          if (Object.keys(complements).length) j.beebs_complements_serveur = complements;
        }
      }
      if (beebsDescriptions || beebsValeurs) console.log(`[get-pending-jobs] user=${user.id} dépôts Beebs complétés : ${beebsDescriptions} description(s), ${beebsValeurs} couleur/matière`);
    } catch (e) {
      console.warn(`[get-pending-jobs] complément Beebs : ${String((e as Error)?.message ?? e)} — dépôts servis tels quels`);
    }

    // ── MARQUE ET COULEUR VINTED DEPUIS LA FICHE (2026-09-24, dossier jocabroc8) ──
    // 🚨 Trois publications refusées en 400 le 24/09 (« Le champ Marque doit
    //    être renseigné » · « Le champ Couleur doit être renseigné »), cinq
    //    chez ornellaracano depuis le 15/09 : le job partait avec `marque` et
    //    `couleur` VIDES. Chaîne mesurée sur le job 86a44e7e : la rédaction
    //    avait produit « S » et « M » (suspect_values : une lettre → rejetées,
    //    donc rien) ; le stepper n'avait AUCUNE ligne catalogue pour « Maison >
    //    Décoration > Encadrements » (elle est née de ce 400, 12:04) donc n'a
    //    rien demandé ; et rien, côté serveur, ne reprenait la fiche.
    // RÈGLE (Nico, 24/09) : aucune annonce Vinted ne part avec une Marque
    // vide. La fiche a une marque, même hors liste Vinted (« Vintage », une
    // marque d'artisan) → on l'envoie : vinted.js la crée par « Utiliser
    // "X" comme marque » (prouvé sur ce même job à 12:14). Même geste pour la
    // couleur, que vinted.js ne lit QUE dans fields.colors. Rien n'est
    // inventé : la valeur vient de la FICHE et d'une source qui est celle du
    // vendeur (saisie à la main, capture ou synchro de SES annonces Vinted,
    // relevé de ses annonces) — jamais d'une IA (lens) ni d'un backfill.
    // ⛔ Fiche sans marque → on ne pose PAS « Sans marque » d'office : c'est
    //    le bloc « À compléter » du stepper (Vinted exige une marque partout
    //    sauf Livres et médias, mesuré sur 183 publications abouties) ou le
    //    needs_user nommé de Vinted qui la pose au vendeur.
    // Périmètre : publish Vinted servi à l'extension. Une RECRÉATION porte la
    // marque de sa capture (règle du 12/08 : sentinel brand_id 1 → « Sans
    // marque »), on n'y touche pas. Servi, pas persisté ici : comme la couleur
    // Leboncoin, l'extension renvoie le pf au statut suivant. Best-effort.
    let vintedFiche = 0;
    try {
      const depotsVinted = (out as unknown as Array<Record<string, unknown>>)
        .filter((j) => j.platform === "vinted" && j.action === "publish" && j.inventaire_id != null);
      if (depotsVinted.length) {
        const ids = [...new Set(depotsVinted.map((j) => Number(j.inventaire_id)))];
        const { data: arts } = await userClient.from("inventaire").select("id, attributs").in("id", ids);
        const attrsParArticle = new Map<number, Record<string, unknown>>();
        for (const a of (arts ?? []) as Array<{ id: number; attributs: unknown }>) {
          if (a.attributs && typeof a.attributs === "object") attrsParArticle.set(Number(a.id), a.attributs as Record<string, unknown>);
        }
        // Une valeur DU VENDEUR : saisie à la main, capture de son annonce,
        // synchro Vinted, relevé de ses annonces. Jamais lens / IA / backfill.
        const SOURCE_DU_VENDEUR = /^(manuel|capture|vinted|releve_)/;
        const valeurDuVendeur = (attrs: Record<string, unknown> | undefined, cle: string): { v: string; source: string } | null => {
          const e = attrs?.[cle];
          if (!e) return null;
          // Deux formes en base : { v, at, source } et la chaîne nue des lignes anciennes.
          if (typeof e === "string") return e.trim() ? { v: e.trim(), source: "fiche (forme ancienne)" } : null;
          if (typeof e !== "object") return null;
          const o = e as Record<string, unknown>;
          const v = typeof o.v === "string" ? o.v.trim() : "";
          const source = typeof o.source === "string" ? o.source : "";
          if (!v || !SOURCE_DU_VENDEUR.test(source)) return null;
          return { v, source };
        };
        for (const j of depotsVinted) {
          const pf = (j.platform_fields && typeof j.platform_fields === "object") ? (j.platform_fields as Record<string, unknown>) : null;
          const attrs = attrsParArticle.get(Number(j.inventaire_id));
          if (!pf || !attrs) continue;
          const aspects = (pf.vintedAspects && typeof pf.vintedAspects === "object") ? (pf.vintedAspects as Record<string, unknown>) : {};
          const trace: Record<string, unknown> = {};
          if (!String(pf.marque ?? "").trim() && !String(aspects.brand ?? "").trim()) {
            const m = valeurDuVendeur(attrs, "marque");
            if (m) {
              pf.marque = m.v;
              trace.marque = { valeur: m.v, avant: null, source: `inventaire.attributs.marque (${m.source})` };
            }
          }
          const colors = Array.isArray(pf.colors) ? (pf.colors as unknown[]).filter((c) => typeof c === "string" && c.trim()) : [];
          if (!String(pf.couleur ?? "").trim() && !colors.length && !String(aspects.color ?? "").trim()) {
            const c = valeurDuVendeur(attrs, "couleur");
            if (c) {
              pf.couleur = c.v;
              pf.colors = [c.v];
              trace.couleur = { valeur: c.v, avant: null, source: `inventaire.attributs.couleur (${c.source})` };
            }
          }
          if (Object.keys(trace).length) {
            pf.vinted_deduit = { ...trace, le: new Date().toISOString(), pose_par: "get-pending-jobs (fiche de l'article, sources du vendeur)" };
            vintedFiche++;
            console.log(`[get-pending-jobs] Vinted ${String(j.id).slice(0, 8)} : ${Object.entries(trace).map(([k, v]) => `${k} ← « ${(v as Record<string, unknown>).valeur} » (${(v as Record<string, unknown>).source})`).join(" ; ")}`);
          }
        }
      }
      if (vintedFiche) console.log(`[get-pending-jobs] user=${user.id} marque/couleur Vinted posées depuis la fiche : ${vintedFiche}`);
    } catch (e) {
      console.warn(`[get-pending-jobs] marque/couleur Vinted depuis la fiche : ${String((e as Error)?.message ?? e)} — jobs servis tels quels`);
    }

    // ══ UN DÉPÔT VINTED SANS COULEUR OU SANS MARQUE NE PART PAS AU REFUS ════
    // (2026-09-25, check de nuit, point 1) Jocabroc : « Peinture Baptême du
    // Christ » (24/09 20:31, rayon changé après coup par le rattrapage du
    // rayon refusé, sans que personne ne recalcule les obligatoires) et
    // « Grand plateau barbotine » (25/09 06:46) partis SANS couleur → 400
    // « Le champ Couleur doit être renseigné ». Neuf dépôts partis sans
    // marque (une lettre tapée, retirée à l'insert) → 400 « Marque ».
    // Le stepper pose désormais la question AVANT la création du job
    // (_shared/vinted-exigences.js, même règle) ; ce filet-ci couvre ce qui
    // ne passe pas par lui : un écran d'avant la mise à jour, un rayon changé
    // après coup, un job déjà en file. Rien n'est inventé : la fiche a déjà
    // été lue juste au-dessus (sources du vendeur) — si la valeur manque
    // ENCORE, la question part chez la personne AVANT tout essai, avec la
    // palette Vinted (29 libellés) ou « Sans marque » proposé.
    // Mesuré sur 60 jours (25/09) : AUCUNE publication Vinted aboutie sans
    // couleur hors des rayons exemptés, aucune sans marque hors des livres —
    // ce filet ne retient donc aucun dépôt qui serait passé.
    // Périmètre : poll d'exécution, publish Vinted avec un rayon connu.
    // Best-effort : une lecture ou une écriture ratée → servi comme avant.
    let heldVintedExige = 0;
    if (!includeProcessing && !includeNeedsUser) {
      try {
        const aRetenir = new Set<string>();
        for (const j of out as unknown as Array<Record<string, unknown>>) {
          if (j.platform !== "vinted" || (j.action ?? "publish") !== "publish") continue;
          const pf = (j.platform_fields && typeof j.platform_fields === "object") ? (j.platform_fields as Record<string, unknown>) : null;
          if (!pf) continue;
          const chemin = Array.isArray(pf.categoryPath) ? (pf.categoryPath as unknown[]).map((c) => String(c ?? "")) : [];
          if (!chemin.length) continue; // pas de rayon : rien à juger, servi comme avant
          const aspects = (pf.vintedAspects && typeof pf.vintedAspects === "object") ? (pf.vintedAspects as Record<string, unknown>) : {};
          const vraie = (v: unknown) => { const t = String(v ?? "").trim(); return t && !valeurUneLettre(t) ? t : ""; };
          const colors = Array.isArray(pf.colors) ? (pf.colors as unknown[]).filter((c) => vraie(c)) : [];
          const couleurManque = vintedExigeUneCouleur(chemin) && !vraie(pf.couleur) && !colors.length && !vraie(aspects.color);
          const marqueManque = vintedExigeUneMarque(chemin) && !vraie(pf.marque) && !vraie(aspects.brand);
          if (!couleurManque && !marqueManque) continue;
          const champs: Array<Record<string, unknown>> = [];
          if (marqueManque) champs.push({ field_key: "brand", field_label: "Marque", target: { root: "vintedAspects", key: "brand" }, platform: "vinted" });
          if (couleurManque) champs.push({ field_key: "color", field_label: "Couleur", allowed_values: [...VINTED_COLORS], input_type: "select", target: { root: "vintedAspects", key: "color" }, platform: "vinted" });
          const libelles = champs.map((c) => String(c.field_label));
          const rayon = chemin[chemin.length - 1];
          const message =
            `Vinted exige ${libelles.length > 1 ? "une marque et une couleur" : (marqueManque ? "une marque" : "une couleur")} pour le rayon « ${rayon} », ` +
            `et ton annonce n'en porte pas encore. Choisis-${libelles.length > 1 ? "les" : "la"} ci-dessous (bouton « ✋ Compléter »)` +
            `${marqueManque ? " — « Sans marque » convient pour un objet sans marque" : ""} : la publication repart d'elle-même. ` +
            "Rien n'a été envoyé à Vinted.";
          const pfNu: Record<string, unknown> = {
            ...pf,
            needsUserField: champs[0],
            ...(champs.length > 1 ? { needsUserFields: champs.slice(1) } : {}),
            vinted_exige: { champs: libelles, rayon: chemin, depuis: new Date().toISOString(), pose_par: "get-pending-jobs (avant tout essai)" },
          };
          delete pfNu.processing_since;
          const { data: maj, error: uErr } = await userClient.from("cross_post_jobs")
            .update({ status: "needs_user", error: message, platform_fields: pfNu })
            .eq("id", j.id as string).eq("status", "pending").select("id");
          if (uErr) {
            console.warn(`[get-pending-jobs] Vinted ${String(j.id).slice(0, 8)} : question « ${libelles.join(", ")} » non écrite (${uErr.message}) — servi tel quel`);
            continue;
          }
          aRetenir.add(String(j.id));
          console.log(`[get-pending-jobs] Vinted ${String(j.id).slice(0, 8)} : ${libelles.join(" + ")} manquant(s) pour « ${chemin.join(" > ")} » → needs_user AVANT tout essai${(maj ?? []).length ? "" : " (déjà sorti de pending)"}`);
        }
        if (aRetenir.size) {
          const avant = out.length;
          out = out.filter((j) => !aRetenir.has(String(j.id)));
          heldVintedExige = avant - out.length;
        }
      } catch (e) {
        console.warn(`[get-pending-jobs] exigences Vinted (couleur/marque) : ${String((e as Error)?.message ?? e)} — jobs servis tels quels`);
      }
    }

    // ══ PEGI (VINTED « JEUX ») ET ÂGE (BEEBS) : LA QUESTION AVANT TOUT ESSAI ══
    // (2026-09-25, point 6) L'ANCIEN stepper range un jeu par l'icône 🎮, qui
    // pointe « Consoles » (Vinted) et « Consoles de jeux » (Beebs) — deux
    // rayons sans PEGI ni Âge : rien ne bloquait, et le job partait sans. Le
    // rayon juste (« Jeux », « Multimédia > Jeux vidéo ») était ensuite posé
    // par la résolution, et c'est le PRÉ-VOL de l'extension qui s'arrêtait
    // devant le formulaire ouvert (XEWER : 2 arrêts PEGI, 5 arrêts Âge depuis
    // le 18/09). Le NOUVEAU stepper bloque déjà l'absence (rayon résolu) : ses
    // jobs portent la valeur, la condition ci-dessous est fausse pour eux.
    // Ce filet-ci avance l'arrêt AVANT l'ouverture du formulaire, avec la
    // liste relevée. Rien n'est inventé :
    //   · PEGI : la fiche (réponse du vendeur), sinon ce qui est ÉCRIT dans le
    //     titre ou la description (« PEGI 12 », « USK 16 » — même lecture que
    //     l'app, src/utils/jeuxVideo.js) ; sinon la question.
    //   · Âge Beebs : aucune déduction. Une valeur saisie dans
    //     beebsAspects["Âge"] — canal que beebs.js ne lit PAS (seul pf.age
    //     compte) — est servie dans pf.age. (25/09, point 3) Pour un JEU VIDÉO,
    //     l'âge se LIT aussi : la tranche qu'ouvre le classement de la fiche
    //     (réponse du vendeur), sinon un PEGI/USK écrit dans l'annonce
    //     (src/utils/jeuxVideo.js, ageBeebsDuClassement) ; sinon la question.
    //     Et une REPUBLICATION Beebs sans âge s'arrête ici AVANT le retrait
    //     (elle recopie le dépôt d'origine : les âges devinés de XEWER ont été
    //     retirés de ces dépôts le 25/09) — sans ce filet, l'annonce était
    //     retirée PUIS le redépôt s'arrêtait au formulaire, hors ligne.
    // Périmètre : poll d'exécution, PUBLISH seulement (une republication
    // reprend sa copie capturée), feuilles MESURÉES au catalogue (relevé DOM,
    // requis) — une feuille inconnue reste au pré-vol, qui alimente le
    // catalogue. Seule l'ABSENCE est jugée. Mesuré sur 60 jours : aucun dépôt
    // Vinted « Jeux » publié sans PEGI, aucun dépôt Beebs publié sans Âge sur
    // ces feuilles — ce filet ne retient rien qui serait passé.
    // Best-effort : une lecture ou une écriture ratée → servi comme avant.
    let heldClassementAge = 0;
    if (!includeProcessing && !includeNeedsUser) {
      try {
        const presente = (v: unknown) => String(v ?? "").trim();
        const cheminDe = (v: unknown) => Array.isArray(v) ? (v as unknown[]).map((c) => String(c ?? "").trim()).filter(Boolean) : [];
        const candidats = (out as unknown as Array<Record<string, unknown>>).filter((j) => {
          const pf = (j.platform_fields && typeof j.platform_fields === "object") ? (j.platform_fields as Record<string, unknown>) : null;
          if (!pf) return false;
          const republicationBeebsAvantRetrait = j.action === "republish" && j.platform === "beebs"
            && !["deleted", "recreated"].includes(String(pf.republish_step ?? ""));
          if ((j.action ?? "publish") !== "publish" && !republicationBeebsAvantRetrait) return false;
          if (j.platform === "vinted") {
            const aspects = (pf.vintedAspects && typeof pf.vintedAspects === "object") ? (pf.vintedAspects as Record<string, unknown>) : {};
            return cheminDe(pf.categoryPath).length > 0 && !presente(aspects.video_game_ratings);
          }
          if (j.platform === "beebs") return cheminDe(pf.beebsCategoryPath).length > 0 && !presente(pf.age);
          return false;
        });
        if (candidats.length) {
          const { data: lignes, error: cErr } = await userClient.from("platform_category_aspects")
            .select("platform, category_key, field_key, allowed_values")
            .in("platform", ["vinted", "beebs"]).in("field_key", ["video_game_ratings", "Âge"])
            .eq("required", true).eq("source", "dom");
          if (cErr) throw new Error(`catalogue illisible (${cErr.message})`);
          const listes = new Map<string, string[]>();
          for (const l of (lignes ?? []) as Array<Record<string, unknown>>) {
            const ok = (l.platform === "vinted" && l.field_key === "video_game_ratings") || (l.platform === "beebs" && l.field_key === "Âge");
            const vals = Array.isArray(l.allowed_values) ? (l.allowed_values as unknown[]).map((v) => String(v ?? "").trim()).filter(Boolean) : [];
            if (ok && vals.length) listes.set(`${l.platform}|${String(l.category_key ?? "")}`, vals);
          }
          // La fiche : une réponse DU VENDEUR (jamais lens / IA / backfill).
          const idsVinted = [...new Set(candidats.filter((j) => j.inventaire_id != null && (j.platform === "vinted"
              ? listes.has(`vinted|${cheminDe((j.platform_fields as Record<string, unknown>).categoryPath).join(" > ")}`)
              : listes.has(`beebs|${cheminDe((j.platform_fields as Record<string, unknown>).beebsCategoryPath).join(" > ")}`)))
            .map((j) => Number(j.inventaire_id)))];
          const classementFiche = new Map<number, { v: string; source: string }>();
          if (idsVinted.length) {
            const { data: arts } = await userClient.from("inventaire").select("id, attributs").in("id", idsVinted);
            for (const a of (arts ?? []) as Array<{ id: number; attributs: unknown }>) {
              const e = (a.attributs && typeof a.attributs === "object") ? (a.attributs as Record<string, unknown>).classement_age : null;
              const o = (e && typeof e === "object") ? e as Record<string, unknown> : null;
              const v = typeof o?.v === "string" ? o.v.trim() : "";
              const source = typeof o?.source === "string" ? o.source : "";
              if (v && /^(manuel|capture|vinted|releve_)/.test(source)) classementFiche.set(Number(a.id), { v, source });
            }
          }
          const aRetenir = new Set<string>();
          for (const j of candidats) {
            const pf = j.platform_fields as Record<string, unknown>;
            const vinted = j.platform === "vinted";
            const chemin = cheminDe(vinted ? pf.categoryPath : pf.beebsCategoryPath);
            const liste = listes.get(`${j.platform}|${chemin.join(" > ")}`);
            if (!liste) continue; // feuille non mesurée : le pré-vol garde la main
            const feuille = chemin[chemin.length - 1];
            if (vinted) {
              const aspects = (pf.vintedAspects && typeof pf.vintedAspects === "object") ? (pf.vintedAspects as Record<string, unknown>) : {};
              const fiche = j.inventaire_id != null ? classementFiche.get(Number(j.inventaire_id)) : undefined;
              const ecrit = classementAgeEcrit(String(j.title ?? ""), String(j.description ?? ""));
              const lu = fiche && liste.includes(fiche.v)
                ? { valeur: fiche.v, source: `inventaire.attributs.classement_age (${fiche.source})` }
                : ecrit && liste.includes(ecrit) ? { valeur: ecrit, source: "écrit dans le titre ou la description" } : null;
              if (lu) {
                pf.vintedAspects = { ...aspects, video_game_ratings: lu.valeur };
                pf.classement_deduit = { ...lu, le: new Date().toISOString(), pose_par: "get-pending-jobs (lu, jamais deviné)" };
                console.log(`[get-pending-jobs] Vinted ${String(j.id).slice(0, 8)} : PEGI « ${lu.valeur} » servi (${lu.source})`);
                continue;
              }
            } else {
              const aspectsB = (pf.beebsAspects && typeof pf.beebsAspects === "object") ? (pf.beebsAspects as Record<string, unknown>) : {};
              const saisi = presente(aspectsB["Âge"]);
              if (saisi) {
                pf.age = saisi;
                console.log(`[get-pending-jobs] Beebs ${String(j.id).slice(0, 8)} : Âge « ${saisi} » servi depuis beebsAspects (canal que beebs.js ne lit pas)`);
                continue;
              }
              // (25/09, point 3) Un JEU VIDÉO : l'âge se LIT — la fiche d'abord
              // (classement répondu par le vendeur), puis un PEGI/USK écrit.
              const titreJ = String(j.title ?? ""), descJ = String(j.description ?? "");
              if (/jeux vid/i.test(feuille) || familleJeuVideo(titreJ, descJ)?.famille === "jeu") {
                const fiche = j.inventaire_id != null ? classementFiche.get(Number(j.inventaire_id)) : undefined;
                const parFiche = fiche ? ageBeebsDuClassement(fiche.v) : null;
                const ecrit = parFiche ? null : ageBeebsJeuVideoLu(titreJ, descJ);
                const lu = parFiche && fiche
                  ? { valeur: parFiche, source: `classement de la fiche « ${fiche.v} » (${fiche.source})` }
                  : ecrit ? { valeur: ecrit.valeur, source: `${ecrit.classement} écrit dans le titre ou la description` } : null;
                if (lu && liste.includes(lu.valeur)) {
                  pf.age = lu.valeur;
                  pf.age_lu = { ...lu, le: new Date().toISOString(), pose_par: "get-pending-jobs (lu, jamais deviné)" };
                  console.log(`[get-pending-jobs] Beebs ${String(j.id).slice(0, 8)} : Âge « ${lu.valeur} » servi (${lu.source})`);
                  continue;
                }
              }
            }
            const champ = vinted
              ? { field_key: "video_game_ratings", field_label: "Classement du contenu", input_type: "select", allowed_values: liste, options_completes: true, target: { root: "vintedAspects", key: "video_game_ratings" }, platform: "vinted" }
              : { field_key: "Âge", field_label: "Âge", input_type: "dropdown", allowed_values: liste, options_completes: true, target: { root: null, key: "age" }, platform: "beebs" };
            const message = vinted
              ? `Vinted exige le classement par âge (PEGI) pour le rayon « ${feuille} », et ton annonce n'en porte pas encore. ` +
                "Choisis celui imprimé sur la jaquette ci-dessous (bouton « ✋ Compléter ») — « Non précisé » s'il n'y en a pas : " +
                "la publication repart d'elle-même. Rien n'a été envoyé à Vinted."
              : j.action === "republish"
                ? `Beebs exige l'âge de l'enfant à qui s'adresse l'article pour le rayon « ${feuille} », et nous ne le connaissons pas : l'âge de ton annonce actuelle avait été deviné, pas lu. ` +
                  "Choisis la tranche ci-dessous (bouton « ✋ Compléter ») : la republication repart d'elle-même avec cet âge. Ton annonce est restée en ligne telle quelle."
                : `Beebs exige l'âge de l'enfant à qui s'adresse l'article pour le rayon « ${feuille} », et ton annonce ne le renseigne pas. ` +
                  "Choisis la tranche ci-dessous (bouton « ✋ Compléter ») : la publication repart d'elle-même. Rien n'a été envoyé à Beebs.";
            const pfNu: Record<string, unknown> = {
              ...pf,
              needsUserField: champ,
              classement_age_exige: { champ: champ.field_label, rayon: chemin, depuis: new Date().toISOString(), pose_par: "get-pending-jobs (avant tout essai)" },
            };
            delete pfNu.processing_since;
            const { data: maj, error: uErr } = await userClient.from("cross_post_jobs")
              .update({ status: "needs_user", error: message, platform_fields: pfNu })
              .eq("id", j.id as string).eq("status", "pending").select("id");
            if (uErr) {
              console.warn(`[get-pending-jobs] ${j.platform} ${String(j.id).slice(0, 8)} : question « ${champ.field_label} » non écrite (${uErr.message}) — servi tel quel`);
              continue;
            }
            aRetenir.add(String(j.id));
            console.log(`[get-pending-jobs] ${j.platform} ${String(j.id).slice(0, 8)} : « ${champ.field_label} » manquant pour « ${chemin.join(" > ")} » → needs_user AVANT tout essai${(maj ?? []).length ? "" : " (déjà sorti de pending)"}`);
          }
          if (aRetenir.size) {
            const avant = out.length;
            out = out.filter((j) => !aRetenir.has(String(j.id)));
            heldClassementAge = avant - out.length;
          }
        }
      } catch (e) {
        console.warn(`[get-pending-jobs] PEGI / Âge : ${String((e as Error)?.message ?? e)} — jobs servis tels quels`);
      }
    }

    // ══ LEBONCOIN : « DIVERS > AUTRES » N'EST JAMAIS UNE RÉPONSE SILENCIEUSE ══
    // (2026-09-25, point 2 — le pichet de Jocabroc, job c9a75a0a.) L'objet
    // était reconnu (« pichet »), mais l'ancienne descente de l'arbre a pris
    // la racine « Divers », puis son seul enfant « Autres » : Leboncoin a
    // accepté le dépôt, puis l'a retiré à la modération. Recensé le 25/09 :
    // 23 dépôts « Divers > Autres » depuis le 18/09, 10 refusés. Un refus de
    // modération, c'est NOTRE faute.
    // L'app ne pose plus ce rayon (utils/fourreTout.js : jamais une étape de
    // la descente, jamais une feuille retenue ; à défaut de rayon sûr, la
    // question « Rayon à choisir » part dans le stepper). Ce filet-ci couvre
    // ce que l'app ne voit plus : les jobs DÉJÀ en file et les anciennes
    // versions de l'app — le job s'arrête AVANT tout essai, rien n'est
    // envoyé, et « Relancer » re-cherche le rayon (StockTab, même mécanisme
    // que la publication). Le choix de la PERSONNE (categorie_source
    // « choix_humain ») part tel quel.
    // Périmètre : poll d'exécution, PUBLISH seulement — une republication
    // reprend le rayon de l'annonce en ligne (relevé, adresse), que
    // Leboncoin a déjà accepté. Best-effort : une écriture ratée → servi
    // comme avant.
    let heldFourreTout = 0;
    if (!includeProcessing && !includeNeedsUser) {
      try {
        const aRetenir = new Set<string>();
        for (const j of out as unknown as Array<Record<string, unknown>>) {
          if (j.platform !== "leboncoin" || (j.action ?? "publish") !== "publish") continue;
          const pf = (j.platform_fields && typeof j.platform_fields === "object") ? (j.platform_fields as Record<string, unknown>) : null;
          if (!pf || pf.categorie_source === "choix_humain" || !estFourreToutCatalogue(pf.lbcCategoryPath)) continue;
          const chemin = (pf.lbcCategoryPath as unknown[]).map((c) => String(c ?? "").trim()).join(" > ");
          const message = `Leboncoin refuse à la vérification les annonces rangées dans « ${chemin} » quand l'objet a son vrai rayon, ` +
            "et aucun rayon sûr n'a encore été trouvé pour celle-ci. Touche « Relancer » : le rayon sera recherché de nouveau — " +
            "s'il reste incertain, republie l'article depuis sa fiche, il te sera demandé. Rien n'a été envoyé à Leboncoin.";
          const pfNu: Record<string, unknown> = {
            ...pf,
            fourre_tout_retenu: { chemin: pf.lbcCategoryPath, source: pf.categorie_source ?? null, depuis: new Date().toISOString(), pose_par: "get-pending-jobs (avant tout essai)" },
          };
          delete pfNu.processing_since;
          const { data: maj, error: uErr } = await userClient.from("cross_post_jobs")
            .update({ status: "needs_user", error: message, platform_fields: pfNu })
            .eq("id", j.id as string).eq("status", "pending").select("id");
          if (uErr) {
            console.warn(`[get-pending-jobs] leboncoin ${String(j.id).slice(0, 8)} : fourre-tout « ${chemin} » non retenu (${uErr.message}) — servi tel quel`);
            continue;
          }
          aRetenir.add(String(j.id));
          console.log(`[get-pending-jobs] leboncoin ${String(j.id).slice(0, 8)} : rayon fourre-tout « ${chemin} » (source ${String(pf.categorie_source ?? "∅")}) → needs_user AVANT tout essai${(maj ?? []).length ? "" : " (déjà sorti de pending)"}`);
        }
        if (aRetenir.size) {
          const avant = out.length;
          out = out.filter((j) => !aRetenir.has(String(j.id)));
          heldFourreTout = avant - out.length;
        }
      } catch (e) {
        console.warn(`[get-pending-jobs] fourre-tout Leboncoin : ${String((e as Error)?.message ?? e)} — jobs servis tels quels`);
      }
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
      // ── Helpers ÉTAT (2026-09-17 soir) — voir le bloc « ÉTAT » plus bas ──
      const normEtatLbc = (v: unknown): string => String(v ?? "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
      const etatLeboncoinExact = (valeur: string, grille: string[]): string | null => {
        const v = normEtatLbc(valeur);
        if (!v || !grille.length) return null;
        const parNorm = new Map(grille.map((g) => [normEtatLbc(g), g] as [string, string]));
        const exact = parNorm.get(v);
        if (exact) return exact;
        const etatNeuf = parNorm.get("etat neuf") ?? null;
        const avec = parNorm.get("neuf avec etiquette") ?? null;
        const sans = parNorm.get("neuf sans etiquette") ?? null;
        if (v === "neuf avec etiquette" || v === "neuf sans etiquette") {
          return (!avec && !sans && etatNeuf) ? etatNeuf : null;
        }
        if (v === "neuf" || v === "etat neuf") return etatNeuf; // grille B → null : ne se devine pas
        if (v === "satisfaisant" || v === "correct" || v === "etat correct" || v === "etat satisfaisant") {
          return parNorm.get("etat satisfaisant") ?? null;
        }
        return null;
      };
      const grillesEtatCache = new Map<string, { grille: string[]; source: string } | null>();
      const grilleEtatLeboncoin = async (
        pf: Record<string, unknown>, chemin: string,
      ): Promise<{ grille: string[]; source: string } | null> => {
        const nuf = (pf.needsUserField && typeof pf.needsUserField === "object") ? (pf.needsUserField as Record<string, unknown>) : null;
        if (nuf && /(_condition$|^condition$)/.test(String(nuf.field_key ?? "")) && Array.isArray(nuf.allowed_values) && nuf.allowed_values.length) {
          return { grille: (nuf.allowed_values as unknown[]).map(String), source: "liste relevée sur le formulaire (needsUserField)" };
        }
        if (!chemin) return null;
        if (grillesEtatCache.has(chemin)) return grillesEtatCache.get(chemin) ?? null;
        let trouve: { grille: string[]; source: string } | null = null;
        const { data: rows } = await userClient
          .from("platform_category_aspects").select("field_key, allowed_values")
          .eq("platform", "leboncoin").eq("category_key", chemin.slice(0, 300))
          .in("field_key", ["condition", "clothing_condition"]);
        for (const key of ["condition", "clothing_condition"]) {
          const row = (rows ?? []).find((r: { field_key: string }) => r.field_key === key) as { allowed_values?: unknown } | undefined;
          if (Array.isArray(row?.allowed_values) && row.allowed_values.length) {
            trouve = { grille: (row.allowed_values as unknown[]).map(String), source: `catalogue platform_category_aspects (${key})` };
            break;
          }
        }
        grillesEtatCache.set(chemin, trouve);
        return trouve;
      };
      const TAILLE_AGE_RE = /^\s*\d{1,2}\s*(ans?|mois)\b|^\s*\d{2,3}\s*cm\b/i;
      const normaliser = (v: unknown): string | null => {
        const s = String(v ?? "").trim().toLowerCase();
        return s ? (SYNONYMES_UNIVERS[s] ?? null) : null;
      };
      // ── COULEUR : elle était DANS la fiche et n'arrivait pas au job ────────
      // (2026-09-16, dossier MeMiniandMove.) Sur son compte PRO, « Couleur »
      // (clothing_color) est un critère OBLIGATOIRE — relevé sur SA page :
      // 6 requis contre 1 seul sur le formulaire particulier, mesuré le même
      // soir sur le compte de Nico. Ses jobs partaient tous avec couleur nulle
      // et Leboncoin refusait le formulaire sans jamais nommer le champ.
      // Or la couleur EXISTE : `inventaire.attributs.couleur.v` = « Noir »,
      // posée par la synchro Vinted (source `vinted_detail`). Elle n'était
      // recopiée nulle part : generate-listing ne produit pas de couleur pour
      // Leboncoin (son contrat JSON s'arrête à etat/format_colis/univers/
      // marque/matiere, cf. _shared/redaction-plateformes.ts), et le bloc
      // dédié de l'extension (leboncoin.js, `label[for$="_color"]`) attendait
      // un `fields.couleur` que personne n'écrivait.
      // ⚠️ Ce n'est PAS une déduction : c'est la valeur enregistrée de
      // l'article, la même que celle servie à Vinted. Rien n'est inventé.
      // L'extension, elle, ne TAPE jamais dans ce combobox : elle ouvre le
      // menu et clique une option par composant exact (skipIfPrefilled +
      // composants) — une couleur hors liste laisse le champ vide et part en
      // needs_user avec la liste relevée. Poser une couleur ne peut donc pas
      // produire une valeur fausse.
      const couleurParArticle = new Map<number, string>();
      // ── ÉTAT PRÉCIS de la fiche (2026-09-17 soir, dossier MeMiniandMove) ──
      // `inventaire.attributs.etat.v` (source vinted_detail / vinted_liste)
      // porte l'état EXACT saisi par le vendeur sur Vinted : « Neuf avec
      // étiquette », « Neuf sans étiquette », « Très bon état »… Le job, lui,
      // portait « Neuf » : l'app APLATISSAIT l'état (ETAT_PAR_PLATEFORME
      // rendait « État neuf » pour Leboncoin, puis le select du stepper —
      // options « Neuf », « État correct » — le rabattait sur « Neuf »). On
      // demandait ensuite à l'utilisatrice une valeur qu'on avait au mot près.
      // La source est corrigée (redaction-plateformes + stepper) ; ici, pour
      // les jobs déjà en file et pour toujours : la fiche fait foi.
      const etatParArticle = new Map<number, string>();
      // La TRANCHE DE COLIS de la fiche (2026-09-18) — uniquement comme CLÉ de
      // la mémoire du poids, ci-dessous. ⛔ Jamais comme source d'un poids :
      // « Petit » ne dit pas « De 250 g à 500 g » (règle du 28/08).
      const colisParArticle = new Map<number, string>();
      try {
        const ids = [...new Set((out as unknown as Array<Record<string, unknown>>)
          .filter((j) => j.platform === "leboncoin" && j.action === "publish" && j.inventaire_id != null)
          .map((j) => Number(j.inventaire_id)))];
        if (ids.length) {
          const { data: fiches } = await userClient
            .from("inventaire").select("id, attributs, titre").in("id", ids);
          for (const f of (fiches ?? []) as Array<{ id: number; attributs: unknown }>) {
            const a = (f.attributs && typeof f.attributs === "object") ? (f.attributs as Record<string, unknown>) : null;
            const brut = a?.couleur;
            // Deux formes en base : { v, at, source } (écriture actuelle) et la
            // chaîne nue des lignes anciennes.
            const v = (brut && typeof brut === "object")
              ? String((brut as Record<string, unknown>).v ?? "").trim()
              : String(brut ?? "").trim();
            if (v) couleurParArticle.set(Number(f.id), v);
            const brutEtat = a?.etat;
            const e = (brutEtat && typeof brutEtat === "object")
              ? String((brutEtat as Record<string, unknown>).v ?? "").trim()
              : String(brutEtat ?? "").trim();
            if (e) etatParArticle.set(Number(f.id), e);
            const brutColis = a?.colis;
            const co = (brutColis && typeof brutColis === "object")
              ? String((brutColis as Record<string, unknown>).v ?? "").trim()
              : String(brutColis ?? "").trim();
            if (co) colisParArticle.set(Number(f.id), co);
          }
        }
      } catch (e) {
        console.warn(`[get-pending-jobs] couleur Leboncoin : lecture des fiches impossible (${String((e as Error)?.message ?? e)}) — jobs servis sans couleur, comme avant`);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // MÉMOIRE DE VENDEUR, PAR COMPTE (2026-09-18, dossier MeMiniandMove)
      // ═══════════════════════════════════════════════════════════════════════
      // 18 jobs Leboncoin en needs_user, le plus vieux du 15/09, zéro tentative
      // brûlée. Deux champs, et deux seulement, bloquent — relevés sur SES jobs
      // (12 demandent les deux, 6 le poids seul) :
      //   · « Poids du colis* »      (estimated_parcel_weight, dropdown, 11 valeurs)
      //   · « Type d'article neuf* » (new_item_type, dropdown, 8 valeurs)
      // Ce sont des champs OBLIGATOIRES du formulaire PRO ; le formulaire
      // particulier ne les a pas.
      //
      // ⛔ NI L'UN NI L'AUTRE NE SE DEVINE, ET C'EST TRANCHÉ.
      //   · Le POIDS ne se déduit PAS d'attributs.colis (Petit/Moyen/Grand) :
      //     deux vocabulaires différents (règle du 28/08, bandeau
      //     LBC_POIDS_PAR_FORMAT), et un poids déclaré faux, c'est
      //     l'utilisatrice qui paie la différence à la livraison.
      //   · « Type d'article neuf » n'est PAS l'état : c'est une qualification
      //     commerciale de vendeur pro. Rien dans « Neuf avec étiquette » ne
      //     dit « Déstockage » plutôt que « Retour client ».
      // Donc : on ne devine pas, ON SE SOUVIENT. Elle répond UNE fois, et la
      // réponse ressert à tous ses articles suivants.
      //
      // LA SOURCE DE LA MÉMOIRE, ET RIEN D'AUTRE : `needsUserResolved`, que
      // l'app écrit au moment où l'utilisateur tranche (StockTab, « ✋ Compléter »),
      // sous la clé « lbcAspects.<champ> ». C'est la SEULE trace qui distingue
      // « elle a répondu » de « on a servi » : la valeur qu'on sert ici
      // n'atterrit que dans lbcAspects, jamais dans needsUserResolved. La
      // mémoire ne peut donc pas se nourrir d'elle-même.
      //
      // ⛔ PAR COMPTE, JAMAIS PARTAGÉE. On relit les jobs de CE user
      //    (userClient est déjà borné par RLS, et le filtre user_id le dit en
      //    clair). On ne passe SURTOUT PAS par platform_category_aspects : ce
      //    catalogue est partagé et il a causé deux régressions le 16/09 en
      //    diffusant à tout le parc ce qui n'avait été observé que chez une
      //    seule personne.
      //
      // LE POIDS EST MÉMORISÉ PAR TRANCHE DE COLIS, pas globalement : une robe
      // et une paire de bottes n'ont pas le même poids. La tranche, c'est
      // `platform_fields.format_colis` du job — relevé en base sur ses 18 jobs :
      // « Lettre », « Petit colis », « Moyen colis » — et à défaut
      // `inventaire.attributs.colis.v`, puis « (absent) ». Elle répond une fois
      // par tranche rencontrée.
      //
      // SI LA VALEUR MÉMORISÉE EST REFUSÉE par le formulaire, on ne boucle pas :
      // l'appariement côté extension est STRICT (elle ouvre le menu et clique
      // une option par composant exact), une valeur hors liste laisse le champ
      // vide et repart en needs_user avec la liste relevée. La nouvelle réponse
      // devient la plus récente et remplace la mémoire.
      const MEMOIRE_CLES = ["new_item_type", "estimated_parcel_weight"] as const;
      // ── LA TRANCHE SE NORMALISE, SINON LA MÉMOIRE NE SE RETROUVE PAS ──────
      // DÉFAUT MESURÉ (21/09 21:21, meminiandmove, jobs a04649ec et 4b92f94f) :
      // la carte Leboncoin ne propose plus nos six formats mais les TROIS de
      // Leboncoin depuis le lot du 21/09 (« Petit », « Moyen », « Volumineux »
      // — cf. src/utils/leboncoinColis.js). Ses réponses d'avant sont rangées
      // sous « Petit colis » et « Moyen colis » ; ses jobs d'après portent
      // « Petit » et « Moyen ». La clé étant la chaîne EXACTE, la mémoire ne
      // se retrouvait plus : deux jobs repartis en needs_user pour une question
      // à laquelle elle avait déjà répondu deux fois.
      //
      // ⛔ ON NE NORMALISE QUE CE QUI EST LITTÉRALEMENT LE MÊME MOT : le
      //    suffixe « colis ». « Petit colis » ≡ « Petit », « Moyen colis » ≡
      //    « Moyen ». Rien d'autre ne fusionne.
      // ⛔ « LETTRE » RESTE SA PROPRE TRANCHE, et c'est le cœur de la garde.
      //    Leboncoin traduit « Lettre » en « Petit » (leboncoinColis.js), mais
      //    ses réponses à elle diffèrent : « Jusqu'à 100 g » pour une lettre,
      //    « De 500 g à 1 kg » pour un petit colis. Fusionner les deux ferait
      //    partir une barrette déclarée à 1 kg — un poids faux, et c'est elle
      //    qui paierait la différence. Une tranche jamais répondue pose la
      //    question ; elle ne l'emprunte jamais à la voisine.
      // ⛔ « Volumineux » ne rejoint NI « Grand colis » NI « Très grand
      //    colis » : trois vocabulaires, trois poids possibles. Au pire une
      //    question de plus, jamais une valeur fausse.
      const normaliserTranche = (v: string): string => {
        const t = v.trim().toLowerCase()
          .normalize("NFD").replace(/[̀-ͯ]/g, "")
          .replace(/\s+/g, " ")
          .replace(/\s+colis$/, "");
        return t || "(absent)";
      };
      const trancheColis = (pf: Record<string, unknown>, articleId: unknown): string => {
        const f = String(pf.format_colis ?? "").trim();
        if (f) return normaliserTranche(f);
        const c = articleId != null ? (colisParArticle.get(Number(articleId)) ?? "") : "";
        return c ? normaliserTranche(c) : "(absent)";
      };
      const memoire: { new_item_type: string | null; poids: Map<string, string> } = {
        new_item_type: null, poids: new Map(),
      };
      try {
        const besoin = (out as unknown as Array<Record<string, unknown>>).some((j) => {
          if (j.platform !== "leboncoin" || j.action !== "publish") return false;
          const pf = (j.platform_fields ?? {}) as Record<string, unknown>;
          const a = (pf.lbcAspects && typeof pf.lbcAspects === "object") ? (pf.lbcAspects as Record<string, unknown>) : {};
          return MEMOIRE_CLES.some((k) => !String(a[k] ?? "").trim());
        });
        if (besoin) {
          // Les 200 jobs Leboncoin les plus récents de ce compte. La réponse
          // cherchée est presque toujours dans les premiers ; au-delà, la
          // question revient une fois — jamais une valeur fausse.
          // ⚠️ `created_at` est le seul horodatage de cross_post_jobs (pas
          //    d'updated_at, vérifié au schéma) : c'est un PROXY de l'ordre des
          //    réponses, pas l'heure de la réponse elle-même.
          const { data: passes } = await userClient
            .from("cross_post_jobs")
            .select("id, created_at, inventaire_id, platform_fields")
            .eq("user_id", user.id).eq("platform", "leboncoin")
            .order("created_at", { ascending: false })
            .limit(200);
          for (const p of (passes ?? []) as Array<Record<string, unknown>>) {
            const pf = (p.platform_fields ?? {}) as Record<string, unknown>;
            const res = (pf.needsUserResolved && typeof pf.needsUserResolved === "object")
              ? (pf.needsUserResolved as Record<string, unknown>) : null;
            if (!res) continue;
            const type = String(res["lbcAspects.new_item_type"] ?? "").trim();
            if (type && !memoire.new_item_type) memoire.new_item_type = type;
            const poids = String(res["lbcAspects.estimated_parcel_weight"] ?? "").trim();
            if (poids) {
              const t = trancheColis(pf, p.inventaire_id);
              if (!memoire.poids.has(t)) memoire.poids.set(t, poids);
            }
          }
          if (memoire.new_item_type || memoire.poids.size) {
            console.log(`[get-pending-jobs] mémoire vendeur Leboncoin user=${user.id} : type d'article neuf « ${memoire.new_item_type ?? "(jamais répondu)"} » ; poids par tranche ${memoire.poids.size ? [...memoire.poids].map(([t, v]) => `${t} → ${v}`).join(" ; ") : "(jamais répondu)"}`);
          }
        }
      } catch (e) {
        console.warn(`[get-pending-jobs] mémoire vendeur Leboncoin : lecture impossible (${String((e as Error)?.message ?? e)}) — jobs servis sans mémoire, la question sera posée comme avant`);
      }

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

        // ── Couleur (valeur enregistrée de l'article, jamais déduite) ─────
        if (!String(pf.couleur ?? "").trim() && j.inventaire_id != null) {
          const c = couleurParArticle.get(Number(j.inventaire_id));
          if (c) {
            pf.couleur = c;
            trace.couleur = { valeur: c, avant: null, source: "inventaire.attributs.couleur (fiche de l'article)" };
          }
        }

        // ── ÉTAT : correspondance EXACTE contre la grille de la catégorie ────
        // (2026-09-17 soir, dossier MeMiniandMove — 15 jobs pro en needs_user
        // « État* » alors que l'état était connu.) Servi dans
        // lbcAspects.condition, que la 0.6.42 pose en priorité sur
        // platform_fields.etat. Deux grilles observées côté Leboncoin :
        //   A (Loisirs, Maison, Divers…) : État neuf · Très bon état · Bon état · État satisfaisant (· Pour pièces)
        //   B (Mode)                      : Neuf avec étiquette · Neuf sans étiquette · Très bon état · Bon état · État satisfaisant
        // RÈGLES (toutes EXACTES, jamais « au plus proche ») :
        //   · la valeur de la fiche (Vinted) reprise TELLE QUELLE quand la grille la porte ;
        //   · « Neuf avec/sans étiquette » sur une grille SANS étiquette → « État neuf » ;
        //   · « Neuf » nu sur la grille B → RIEN (avec/sans étiquette ne se devine PAS :
        //     une annonce « neuf avec étiquette » livrée sans étiquette est un litige) ;
        //   · « Satisfaisant »/« Correct » → « État satisfaisant » si la grille l'a ;
        //   · rien ne matche → rien de posé, l'extension nomme la liste (needs_user).
        // Ordre des sources : la réponse de l'utilisateur dans l'app
        // (needsUserResolved.etat) > l'état précis de la fiche > l'état du job.
        // Grille : la liste relevée sur SON formulaire (needsUserField), sinon
        // le catalogue platform_category_aspects (condition, puis
        // clothing_condition). Sans grille connue, on sert l'état précis à
        // part (lbc_etat_precis) : la 0.6.42 le mappe sur la liste LIVE.
        try {
          const aspectsE = (pf.lbcAspects && typeof pf.lbcAspects === "object") ? (pf.lbcAspects as Record<string, unknown>) : {};
          if (!String(aspectsE.condition ?? "").trim()) {
            const resolu = (pf.needsUserResolved && typeof pf.needsUserResolved === "object"
              && String((pf.needsUserResolved as Record<string, unknown>).etat ?? "").trim())
              ? String(pf.etat ?? "").trim() : "";
            const precis = j.inventaire_id != null ? (etatParArticle.get(Number(j.inventaire_id)) ?? "") : "";
            const brut = String(pf.etat ?? "").trim();
            const candidatsEtat = [...new Set([resolu, precis, brut].filter(Boolean))];
            if (candidatsEtat.length) {
              const g = await grilleEtatLeboncoin(pf, chemin);
              if (g) {
                let pose: string | null = null;
                let depuis = "";
                for (const c of candidatsEtat) {
                  const m = etatLeboncoinExact(c, g.grille);
                  if (m) {
                    pose = m;
                    depuis = c === resolu ? "réponse de l'utilisateur (needsUserResolved.etat)"
                      : c === precis ? "inventaire.attributs.etat (état saisi sur Vinted)" : "platform_fields.etat";
                    break;
                  }
                }
                if (pose) {
                  pf.lbcAspects = { ...aspectsE, condition: pose };
                  trace.etat = { valeur: pose, avant: brut || null, source: `${depuis} ↔ ${g.source}` };
                } else {
                  console.log(`[get-pending-jobs] état Leboncoin ${String(j.id).slice(0, 8)} (${chemin}) : « ${candidatsEtat.join(" / ")} » sans correspondance EXACTE dans la grille [${g.grille.join(", ")}] — rien posé, la liste reste à trancher`);
                }
              }
              if (precis && !pf.lbc_etat_precis && normEtatLbc(precis) !== normEtatLbc(brut)) {
                // Sans grille (ou sans correspondance), l'extension 0.6.42 mappe
                // elle-même contre la liste LIVE : elle doit connaître la valeur PRÉCISE.
                pf.lbc_etat_precis = precis;
                trace.etat_precis = { valeur: precis, avant: brut || null, source: "inventaire.attributs.etat (état saisi sur Vinted)" };
              }
            }
          }
        } catch (e) {
          console.warn(`[get-pending-jobs] état Leboncoin ${String(j.id).slice(0, 8)} : ${String((e as Error)?.message ?? e)} — job servi sans mapping d'état`);
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

        // ── MÉMOIRE DE VENDEUR (2026-09-18) : les deux champs pro qu'on ne
        //    devine pas et qu'on ne redemande plus. Cf. le bandeau plus haut.
        //    Servis seulement quand le job ne les porte pas déjà — un aspect
        //    déjà tranché n'est jamais écrasé. `condition` et `toy_type`, qui
        //    marchent, ne sont pas touchés : on ajoute des clés au même sac.
        {
          const aspectsM = (pf.lbcAspects && typeof pf.lbcAspects === "object") ? (pf.lbcAspects as Record<string, unknown>) : {};
          const ajouts: Record<string, string> = {};
          if (memoire.new_item_type && !String(aspectsM.new_item_type ?? "").trim()) {
            ajouts.new_item_type = memoire.new_item_type;
            trace.new_item_type = {
              valeur: memoire.new_item_type, avant: null,
              source: "mémoire du compte (réponse de l'utilisateur à « Type d'article neuf », needsUserResolved)",
            };
          }
          if (!String(aspectsM.estimated_parcel_weight ?? "").trim()) {
            const t = trancheColis(pf, j.inventaire_id);
            const p = memoire.poids.get(t);
            if (p) {
              ajouts.estimated_parcel_weight = p;
              trace.estimated_parcel_weight = {
                valeur: p, avant: null,
                source: `mémoire du compte pour la tranche « ${t} » (réponse de l'utilisateur à « Poids du colis », needsUserResolved)`,
              };
            } else if (memoire.poids.size) {
              // Une tranche jamais rencontrée : on NE prend PAS le poids d'une
              // autre tranche. Une robe et une paire de bottes, ce n'est pas le
              // même colis — et un poids faux se paie à la livraison.
              console.log(`[get-pending-jobs] poids Leboncoin ${String(j.id).slice(0, 8)} : tranche « ${t} » jamais répondue (connues : ${[...memoire.poids.keys()].join(", ")}) — la question est posée, aucun report d'une autre tranche`);
            }
          }
          if (Object.keys(ajouts).length) pf.lbcAspects = { ...aspectsM, ...ajouts };
        }

        if (Object.keys(trace).length) {
          pf.lbc_deduit = { ...trace, le: new Date().toISOString(), pose_par: "get-pending-jobs (sources certaines)" };
          lbcDeduits++;
          console.log(`[get-pending-jobs] Leboncoin ${String(j.id).slice(0, 8)} (${chemin}) : ${Object.entries(trace).map(([k, v]) => `${k} ← « ${(v as Record<string, unknown>).valeur} » (${(v as Record<string, unknown>).source})`).join(" ; ")}`);
        }
      }
      if (lbcDeduits) console.log(`[get-pending-jobs] user=${user.id} Univers/Couleur/État/Produit/mémoire vendeur Leboncoin posés depuis des sources certaines : ${lbcDeduits}`);
    } catch (e) {
      console.warn(`[get-pending-jobs] déduction Univers/Produit Leboncoin : ${String((e as Error)?.message ?? e)} — jobs servis tels quels`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DÉPÔT OPLA : LES CHAMPS ÉTAIENT DANS LA FICHE ET N'ARRIVAIENT PAS AU JOB
    // (2026-09-18) — même mécanique que la couleur Leboncoin (v69, 9c55333)
    // ═══════════════════════════════════════════════════════════════════════
    // Mesuré sur le job eba8a512 (« Ego Maillot Muangthong », 18/09 09:20) :
    // platform_fields porte genre "", taille "", couleur "", matiere "" — quatre
    // chaînes VIDES. Or la fiche de l'article 1785575885276 les a toutes :
    // taille « L » (capture), couleur « Blanc » (capture), matière
    // « Polyester » (releve_ebay), état « Très bon état » (capture).
    // Elles n'étaient recopiées nulle part : le stepper ne les résout pour Opla
    // que quand l'utilisateur ouvre l'écran, et un job créé depuis le Stock
    // part sans. Le pré-vol Opla exige la taille dès que la feuille a une
    // grille : quatre champs vides, c'est une question de plus par champ.
    //
    // ⚠️ CE N'EST PAS UNE DÉDUCTION : c'est la valeur ENREGISTRÉE de l'article,
    //    la même que celle servie à Vinted. Rien n'est inventé.
    // ⛔ SOURCES CERTAINES SEULEMENT : `capture` (relevé sur l'annonce),
    //    `vinted_*` (synchro du dressing), `releve_*` (relevé « Mes annonces »
    //    sur une plateforme). JAMAIS `backfill_job`, jamais une valeur d'IA —
    //    même règle que le bloc Beebs du 13/09.
    // ⛔ ET RIEN NE PEUT DEVENIR FAUX : le pré-vol Opla (opla-prevol.js) valide
    //    la taille contre la grille de LA FEUILLE et JETTE couleur et matière
    //    hors liste avec un avertissement. Une valeur qui ne convient pas
    //    laisse le champ vide, elle ne part jamais en 200.
    //
    // LE GENRE NE SE DEMANDE PAS : il se lit sur la BRANCHE de la catégorie une
    // fois celle-ci résolue — racine MENS = Homme, WOMEN_ROOT = Femme, et sous
    // CHILDREN_NEW le rayon (Vêtements pour filles / pour garçons). Les racines
    // non genrées (Maison, Sport, Culture et Loisirs, Jeux et jouets, Fait main)
    // ne posent rien : un genre inventé là serait un genre faux.
    let oplaCompletes = 0;
    try {
      const depotsOpla = (out as unknown as Array<Record<string, unknown>>)
        .filter((j) => j.platform === "opla" && j.action === "publish" && j.inventaire_id != null);
      if (depotsOpla.length) {
        const ids = [...new Set(depotsOpla.map((j) => Number(j.inventaire_id)))];
        const attrsParArticle = new Map<number, Record<string, unknown>>();
        // Le TITRE en plus des attributs (2026-09-18) : c'est le dernier
        // recours pour chercher la feuille Opla quand le job vient du Stock et
        // n'a donc aucun mot-objet (ceux-ci ne sont posés que par le stepper).
        const titreParArticle = new Map<number, string>();
        // L'ÉTAGÈRE VINTED en plus (2026-09-23) : `vinted_catalog_id` est la
        // colonne que la synchronisation du dressing écrit — 3 982 articles la
        // portent SANS l'attribut `categorie_vinted` que la complétion lisait
        // seul (job 796582df : escarpins, étagère 543 « Chaussures à talons »,
        // jamais lue, genre jamais posé, catégorie jamais résolue).
        const etagereParArticle = new Map<number, unknown>();
        const { data: fiches } = await userClient
          .from("inventaire").select("id, attributs, titre, vinted_catalog_id").in("id", ids);
        for (const f of (fiches ?? []) as Array<{ id: number; attributs: unknown; titre: unknown; vinted_catalog_id: unknown }>) {
          if (f.attributs && typeof f.attributs === "object") attrsParArticle.set(Number(f.id), f.attributs as Record<string, unknown>);
          if (String(f.titre ?? "").trim()) titreParArticle.set(Number(f.id), String(f.titre).trim());
          if (f.vinted_catalog_id != null) etagereParArticle.set(Number(f.id), f.vinted_catalog_id);
        }

        // ── LA MÊME QUESTION NE SE POSE QU'UNE FOIS (2026-09-19) ──────────
        // Compte Amiral, en direct : deux jobs Opla en needs_user à trois
        // minutes d'intervalle, MÊME question, MÊMES deux options —
        // « Culture et Loisirs › Rangement de collection › Autres rangements »
        // et « Jeux et jouets › Jeux de société ». Il a une SÉRIE entière de
        // ces inserts (vert, rose, noir, blanc, bleu…) : la question allait se
        // reposer à chaque couleur. Elle est légitime la PREMIÈRE fois ; elle
        // ne l'est plus la deuxième.
        //
        // LA CLÉ, ET POURQUOI C'EST CELLE-LÀ : l'ENSEMBLE DES FEUILLES
        // PROPOSÉES, codes triés (« BOARD_GAMES|HC_STORAGE_OTHER »).
        //   · C'est LA QUESTION elle-même. Deux articles qui produisent la
        //     même liste voient la même modale, au mot près : rejouer la
        //     réponse n'est pas une déduction, c'est la même réponse à la même
        //     question. Une feuille de plus ou de moins ⇒ autre clé ⇒ on
        //     redemande.
        //   · Le MOT d'objet ne marche PAS, et c'est mesuré sur CE compte : la
        //     même série a produit « insert de rangement » (17:26, une seule
        //     feuille, résolue), « bac de rangement » (18:01, résolue) puis
        //     « rangement pour jeu de société » (18:07 et 18:10, deux
        //     feuilles). L'IA reformule d'un article à l'autre ; la fourche,
        //     elle, ne bouge pas. Mémoriser le mot, c'est reposer la question
        //     à chaque synonyme.
        //   · La CATÉGORIE SOURCE ne marche pas davantage : l'ancre est nulle
        //     sur les quatre jobs (aucun pouvoir de distinction), et quand elle
        //     existe elle couvre des centaines de feuilles — elle répondrait
        //     pour des questions jamais posées.
        //
        // ⛔ PAR COMPTE, JAMAIS PARTAGÉE — profiles.platform_settings.opla, lu
        //    et écrit par userClient (RLS « auth.uid() = id »). On ne passe
        //    SURTOUT PAS par un catalogue commun : c'est la contamination du
        //    parc par un témoin isolé qu'on a passé la journée du 18/09 à
        //    fermer.
        // ⛔ ON NE DÉDUIT JAMAIS UNE CATÉGORIE QU'IL N'A PAS CHOISIE : la
        //    valeur rejouée doit être l'un des candidats DU JOUR. Si la
        //    fourche a bougé, la question repart.
        //
        // LA SOURCE : la LISTE QU'IL AVAIT SOUS LES YEUX (« oplaCategoryAsk »,
        // posée ici ou par l'extension) ET sa réponse (« oplaCategoryChoice »,
        // confirmée par « needsUserResolved » — la seule trace qui distingue
        // « il a répondu » de « on a servi » : la mémoire ne peut donc pas se
        // nourrir d'elle-même). Les deux ne coexistent sur le job que pendant
        // UNE fenêtre : ce passage-ci. L'extension les efface au suivant
        // (opla.js, « categorieRetenue »). D'où la récolte ICI et pas ailleurs
        // — et c'est ce qui lui fait rattraper AUSSI les questions que
        // l'extension a posées toute seule, sans un octet de plus sur le job.
        const OPLA_MEM_MAX = 50;
        const oplaMemoire = new Map<string, OplaMem>();
        const oplaARetenir = new Map<string, OplaMem>();
        // La clé vit dans _shared/opla-resolution.ts (`cleFourche`) : la pose
        // et la relecture DOIVENT la calculer pareil, sinon la mémoire ne se
        // retrouve jamais elle-même. Un selftest la verrouille.
        // ⚠️ Un job en needs_user ne porte pas de réponse fraîche et n'est pas
        //    exécuté : ni récolte ni rejeu dessus. Les jobs déjà en attente se
        //    débloquent par le chemin normal, jamais par cette mémoire.
        const oplaVivants = depotsOpla.filter((j) => String(j.status ?? "") !== "needs_user");
        try {
          const besoin = oplaVivants.some((j) => {
            const pf = ((j.platform_fields ?? {}) as Record<string, unknown>);
            const c = String(pf.oplaCategoryCode ?? "").trim();
            return !c || !oplaNoeud(c)?.feuille;
          });
          if (besoin) {
            const { data: prof } = await userClient
              .from("profiles").select("platform_settings").eq("id", user.id).maybeSingle();
            const rangees = ((prof?.platform_settings as Record<string, unknown> | null)?.opla as Record<string, unknown> | undefined)?.categories;
            if (rangees && typeof rangees === "object") {
              for (const [cle, v] of Object.entries(rangees as Record<string, unknown>)) {
                const e = (v && typeof v === "object") ? (v as Record<string, unknown>) : null;
                const code = String(e?.code ?? "").trim();
                // Une feuille disparue du référentiel n'est plus une réponse :
                // on l'ignore et la question repart. Le serveur Opla accepte
                // une catégorie inexistante en 200 et produit une annonce
                // silencieusement morte (établi au lot 1) — jamais par nous.
                if (!code || !oplaNoeud(code)?.feuille) continue;
                oplaMemoire.set(cle, {
                  code,
                  titre: String(e?.titre ?? cheminLisible(code)),
                  options: Array.isArray(e?.options) ? (e!.options as unknown[]).map((t) => String(t)) : [],
                  mot: e?.mot != null ? String(e.mot) : null,
                  le: String(e?.le ?? ""),
                });
              }
              if (oplaMemoire.size) {
                console.log(`[get-pending-jobs] mémoire catégories Opla user=${user.id} : ${oplaMemoire.size} question(s) déjà tranchée(s) — ${[...oplaMemoire].map(([c, e]) => `${c} → ${e.code}`).join(" ; ")}`);
              }
            }
          }
        } catch (e) {
          console.warn(`[get-pending-jobs] mémoire catégories Opla : lecture impossible (${String((e as Error)?.message ?? e)}) — la question sera posée comme avant`);
        }

        for (const j of depotsOpla) {
          const pf = ((j.platform_fields ?? {}) as Record<string, unknown>);
          // ⛔ LA LOGIQUE VIT DANS _shared/opla-completion.ts DEPUIS LE 20/09,
          //    et pas par goût du rangement : tant qu'elle était ici, aucun
          //    selftest ne pouvait l'exécuter — il aurait fallu démarrer la
          //    fonction entière. C'est ce trou qui a laissé passer le défaut du
          //    soir : « 38 → M » marchait, la cascade marchait, et leur
          //    CHAÎNAGE ne tournait nulle part. `npm run selftest:opla-completion`
          //    exécute maintenant la chaîne sur les jobs réels de ce soir.
          const { trace, aRetenir, journal } = completerJobOpla({
            id: j.id,
            statut: j.status,
            pf,
            attrs: attrsParArticle.get(Number(j.inventaire_id)),
            titre: titreParArticle.get(Number(j.inventaire_id)) ?? null,
            vintedCatalogId: etagereParArticle.get(Number(j.inventaire_id)) ?? null,
            memoire: oplaMemoire,   // lue ET écrite : sert aux jobs suivants du lot
          });
          for (const l of journal) console.log(l);
          if (aRetenir) oplaARetenir.set(aRetenir.cle, aRetenir.entree);
          if (Object.keys(trace).length) {
            j.platform_fields = pf;
            oplaCompletes++;
          }
        }
        if (oplaCompletes) console.log(`[get-pending-jobs] user=${user.id} jobs Opla complétés depuis la fiche : ${oplaCompletes}`);

        // ── ON RANGE CE QU'IL VIENT DE TRANCHER ───────────────────────────
        // ⛔ RELECTURE JUSTE AVANT L'ÉCRITURE : `platform_settings` porte
        //    l'adresse Leboncoin, les réglages eBay, les créneaux… Écrire
        //    depuis la copie lue en haut du bloc écraserait ce qu'un autre
        //    onglet y aurait posé entre-temps. La fenêtre reste non nulle (un
        //    second poll simultané peut perdre l'écriture) : le pire est que
        //    la question se repose UNE fois de plus. Jamais une valeur fausse.
        // ⛔ `.select()` OBLIGATOIRE : un UPDATE filtré par RLS rend 0 ligne
        //    SANS erreur — sans lui, on journaliserait un enregistrement qui
        //    n'a pas eu lieu (le faux « ✅ » de SousPagePreferences).
        if (oplaARetenir.size) {
          try {
            const { data: prof } = await userClient
              .from("profiles").select("platform_settings").eq("id", user.id).maybeSingle();
            const reglages = ((prof?.platform_settings && typeof prof.platform_settings === "object")
              ? prof.platform_settings : {}) as Record<string, unknown>;
            const opla = ((reglages.opla && typeof reglages.opla === "object") ? reglages.opla : {}) as Record<string, unknown>;
            const cats = ((opla.categories && typeof opla.categories === "object") ? { ...(opla.categories as Record<string, unknown>) } : {}) as Record<string, unknown>;
            for (const [cle, e] of oplaARetenir) cats[cle] = e;
            // Plafond : au-delà, on jette les plus ANCIENNES réponses. Une
            // question oubliée se repose ; une colonne JSON qui enfle, non.
            const triees = Object.entries(cats)
              .sort((a, b) => String((b[1] as Record<string, unknown>)?.le ?? "").localeCompare(String((a[1] as Record<string, unknown>)?.le ?? "")))
              .slice(0, OPLA_MEM_MAX);
            const { data: ecrit, error: errEcrit } = await userClient
              .from("profiles")
              .update({ platform_settings: { ...reglages, opla: { ...opla, categories: Object.fromEntries(triees) } } })
              .eq("id", user.id).select("id");
            if (errEcrit || !ecrit?.length) {
              console.warn(`[get-pending-jobs] mémoire catégories Opla : rien d'enregistré (${errEcrit?.message ?? "0 ligne"}) — la question se reposera`);
            } else {
              console.log(`[get-pending-jobs] mémoire catégories Opla user=${user.id} : ${oplaARetenir.size} réponse(s) enregistrée(s), ${triees.length} en mémoire`);
            }
          } catch (e) {
            console.warn(`[get-pending-jobs] mémoire catégories Opla : écriture impossible (${String((e as Error)?.message ?? e)}) — la question se reposera`);
          }
        }
      }
    } catch (e) {
      console.warn(`[get-pending-jobs] complément Opla depuis la fiche : ${String((e as Error)?.message ?? e)} — jobs servis tels quels, comme avant`);
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

    // ── LANGUE DES LIVRES VINTED — enrichissement du job SERVI (2026-09-15) ───
    // Vinted EXIGE `language_book` sur les Livres. Job 2286228e (carhoa,
    // « Bretagne », catalog 2320) : annonce SUPPRIMÉE (delete HTTP 200) puis
    //   POST /api/v2/item_upload/items → 400
    //   errors:[{field:"language_book", value:"Sélectionne une langue pour continuer"}]
    // — un orphelin. Et 101 captures de livres sur 310 (20 comptes) ne portent
    // AUCUNE langue : chacune deviendra le même orphelin à sa republication.
    //
    // POURQUOI ICI, ET PAS DANS L'EXTENSION. Le correctif extension existe mais
    // n'atteindra personne avant un passage au Chrome Web Store. Le chemin
    // « champ réclamé → valeur fournie → le handler la pose » fonctionne, LUI,
    // sur les extensions DÉJÀ INSTALLÉES : prouvé deux fois en prod —
    //   · 446cabe8 « Les 3 petits cochons » (v0.6.23) : needs_user le 09/09
    //     17:26, réponse « francais », RECRÉÉE à 17:34, item 9945441091 ;
    //   · 0a8b3a19 « Lot de 26 livres de recettes » (v0.6.19) : « Français »,
    //     item 9928944817.
    // Les deux portaient « lookup livre JAMAIS vu » au diagnostic : le champ
    // #language_book est donc atteignable SANS que le lookup ISBN retombe. On
    // se contente de fournir la valeur que l'utilisateur aurait tapée.
    //
    // ⚠️ C'est un LIBELLÉ TEXTE qui part, jamais un id. La boucle générique de
    // vinted.js compare la valeur au TEXTE des options du menu
    // (findOptionCascade → normalizeFuzzy, accents et casse écrasés) : « 6436 »
    // chercherait une option nommée « 6436 » et ferait sauter le champ.
    //
    // PÉRIMÈTRE, STRICT :
    //   · republish Vinted seulement ;
    //   · un segment de categoryPath vaut EXACTEMENT « Livres » — les deux
    //     familles connues, « Livres et médias > Livres > … » et
    //     « Divertissement > Livres > … ». Aucune autre branche, et aucun autre
    //     champ exigé (isbn, color, brand… hors sujet ici) ;
    //   · la capture de l'annonce d'origine est LUE et ne porte AUCUN
    //     language_book. Si elle en porte un, on ne touche à rien : poser
    //     « Français » sur un livre anglais serait pire que l'échec. Capture
    //     absente ou illisible = on ne sait pas = on ne pose rien ;
    //   · une valeur DÉJÀ dans vintedAspects prime toujours — c'est la réponse
    //     de l'utilisateur, elle ne se fait jamais écraser.
    //
    // Aucune écriture en base : seul le job SERVI est enrichi, exactement comme
    // le filet « option neutre de taille » juste au-dessus. Un échec de pose
    // retombe en needs_user comme aujourd'hui, jamais pire.
    //
    // ⚠️ LIMITE CONNUE, laissée telle quelle (décision Nico) : le libellé part
    // en français. Sur un compte Vinted en anglais l'option s'appelle
    // « French », « Français » n'y matchera pas et le job repartira en
    // needs_user — le comportement d'aujourd'hui, pas une régression.
    const LANGUE_LIVRE_LIBELLE_DEFAUT = "Français";
    try {
      const estJobLivreSansLangue = (j: Record<string, unknown>) => {
        if (j.platform !== "vinted" || j.action !== "republish") return false;
        const pf = (j.platform_fields && typeof j.platform_fields === "object")
          ? (j.platform_fields as Record<string, unknown>) : null;
        if (!pf) return false;
        const va = (pf.vintedAspects && typeof pf.vintedAspects === "object")
          ? (pf.vintedAspects as Record<string, unknown>) : null;
        if (String(va?.language_book ?? "").trim()) return false; // réponse déjà là
        const snap = (pf.republish_snapshot && typeof pf.republish_snapshot === "object")
          ? (pf.republish_snapshot as Record<string, unknown>) : null;
        const chemin = Array.isArray(snap?.categoryPath)
          ? (snap!.categoryPath as unknown[]).map((v) => normaliseLibelle(String(v))) : [];
        return chemin.includes("livres");
      };
      const idCapture = (j: Record<string, unknown>) =>
        Number((j.platform_fields as Record<string, unknown>).capture_id);
      const candidats = (out as unknown as Array<Record<string, unknown>>).filter(estJobLivreSansLangue);
      const capIds = [...new Set(candidats.map(idCapture).filter((n) => Number.isFinite(n) && n > 0))];
      if (capIds.length) {
        // Lecture SEULE, sous RLS (les captures appartiennent à l'utilisateur).
        const { data: caps, error: errCaps } = await userClient
          .from("vinted_republish_captures")
          .select("id, payload")
          .in("id", capIds);
        if (errCaps) throw errCaps;
        // capture LUE et sans language_book → le défaut est posable.
        const posableParCapture = new Map<number, boolean>();
        for (const c of (caps ?? []) as Array<Record<string, unknown>>) {
          const natif = ((c.payload as Record<string, unknown> | null)?.natif ?? null) as Record<string, unknown> | null;
          const attrs = Array.isArray(natif?.item_attributes) ? (natif!.item_attributes as unknown[]) : [];
          const aLangue = attrs.some((a) => {
            const o = (a && typeof a === "object") ? (a as Record<string, unknown>) : null;
            return String(o?.code ?? "").trim().toLowerCase() === "language_book"
              && Array.isArray(o?.ids) && (o!.ids as unknown[]).length > 0;
          });
          posableParCapture.set(Number(c.id), !aLangue);
        }
        let languesPosees = 0;
        let capturesAvecLangue = 0;
        let capturesIllisibles = 0;
        for (const j of candidats) {
          const pf = j.platform_fields as Record<string, unknown>;
          const posable = posableParCapture.get(idCapture(j));
          if (posable === undefined) { capturesIllisibles++; continue; }
          if (!posable) { capturesAvecLangue++; continue; }
          const nowIso = new Date().toISOString();
          const warnings = Array.isArray(pf.warnings) ? (pf.warnings as unknown[]) : [];
          const va = (pf.vintedAspects && typeof pf.vintedAspects === "object")
            ? (pf.vintedAspects as Record<string, unknown>) : {};
          pf.vintedAspects = { ...va, language_book: LANGUE_LIVRE_LIBELLE_DEFAUT };
          pf.langue_livre_serveur = {
            valeur: LANGUE_LIVRE_LIBELLE_DEFAUT,
            le: nowIso,
            pose_par: "get-pending-jobs",
            capture_id: idCapture(j),
            motif: "categorie Livres et annonce d'origine sans item_attributes[language_book]",
          };
          pf.warnings = [...warnings, {
            at: nowIso,
            code: "langue_livre_serveur",
            champ: "language_book",
            valeur: LANGUE_LIVRE_LIBELLE_DEFAUT,
            message: "langue « " + LANGUE_LIVRE_LIBELLE_DEFAUT + " » posée par le serveur : Vinted l'exige"
              + " sur les Livres et l'annonce d'origine n'en portait aucune (capture lue,"
              + " item_attributes sans language_book) — défaut relevé sur 201 des 211 annonces"
              + " de livres capturées, 17 comptes sur 20",
          }];
          languesPosees++;
        }
        if (languesPosees || capturesAvecLangue || capturesIllisibles) {
          console.log("[get-pending-jobs] user=" + user.id + " langue Livres : " + languesPosees
            + " posee(s), " + capturesAvecLangue + " laissee(s) (l'annonce d'origine porte deja une langue), "
            + capturesIllisibles + " sans capture lisible");
        }
      }
    } catch (e) {
      console.warn("[get-pending-jobs] langue des Livres Vinted : "
        + String((e as Error)?.message ?? e) + " — jobs servis tels quels");
    }


    // ══ ANTI-ROBOT SUR LE COMPTE VINTED : TOUT VINTED EN PAUSE (2026-09-25) ══
    // (Point 4 du GO de Nico.) Carla (ltouze) : 7 republications, 7 annonces
    // différentes, toutes refusées par la protection anti-robot de Vinted —
    // et chacune réessayée toutes les 45 min, pendant que la sonde du compte
    // répondait 403 et que le dernier succès Vinted datait du 13/09. Sept
    // lectures refusées toutes les 45 minutes : exactement ce qui entretient
    // le mur.
    // RÈGLE (Nico) : quand Vinted montre l'anti-robot sur un COMPTE, toutes
    // ses actions Vinted s'arrêtent jusqu'à la vérification passée, puis
    // repartent seules. Une pause n'est pas un échec : aucun job ne passe au
    // rouge, aucune tentative n'est consommée, les autres plateformes
    // continuent.
    // LE SIGNAL — deux preuves ensemble, jamais une seule :
    //   a) au moins DEUX annonces distinctes refusées par l'anti-robot DANS
    //      L'ONGLET (capture_echec « anti-robot », blocage_antirobot), après
    //      le dernier succès Vinted du compte ;
    //   b) la sonde du compte (users/current) répond 403 — à ce relevé ou au
    //      précédent, pour ne pas clignoter — et ne voit pas Vinted vivant.
    //   Un 403 de sonde seul ne prouve rien (36 comptes à 403 cette semaine,
    //   35 sans aucun refus ; 35 republications publiées pendant un 403). Des
    //   refus seuls non plus (remialbertholl, 24/09 : annonces d'une AUTRE
    //   boutique, compte sain).
    // LA SORTIE, sans rien attendre de personne : un succès Vinted postérieur
    //   aux refus (a tombe) ou la sonde qui revoit Vinted (b tombe). Le message
    //   de pause est alors retiré, le reste suit.
    // CE QUI RESTE SERVI : une republication dont l'annonce est DÉJÀ retirée
    //   (étape 'deleted' : elle doit revenir en ligne), et UNE sonde au plus,
    //   quand le dernier refus a 45 min — un job jamais refusé d'abord (les
    //   retraits en tête), sinon le refus le plus ancien.
    // LES CRÉNEAUX : un job retenu reste pending et dû ; le balayage le compte
    //   « en vol » (garde par plateforme) et ne crée plus rien sur Vinted pour
    //   ce compte — Leboncoin, Beebs et Opla continuent. ⛔ Aucune échéance
    //   (next_action_after) n'est posée sur un job retenu : elle le sortirait
    //   du compte « en vol ».
    // Périmètre : poll d'exécution. Best-effort : illisible → servi comme avant.
    const ANTIROBOT_COMPTE_MSG =
      "Vinted demande une vérification anti-robot sur ton compte : tes actions Vinted sont en pause, rien n'a été touché. " +
      "Ouvre vinted.fr dans Chrome et passe la vérification : tout repartira seul. Tes autres plateformes continuent normalement.";
    const idsAntirobot = new Set<string>();
    let antirobotPause: Record<string, unknown> | null = null;
    if (!includeProcessing && !includeNeedsUser) {
      try {
        const pfAr = (j: { platform_fields: unknown }) =>
          (j.platform_fields && typeof j.platform_fields === "object") ? j.platform_fields as Record<string, unknown> : {};
        const fileVinted = (jobs ?? []).filter((j) => j.platform === "vinted");
        type ObsAr = { id: string; article: string; at: number };
        const obsAr: ObsAr[] = [];
        for (const j of fileVinted) {
          const pf = pfAr(j);
          const ce = (pf.capture_echec && typeof pf.capture_echec === "object") ? pf.capture_echec as Record<string, unknown> : null;
          const ba = (pf.blocage_antirobot && typeof pf.blocage_antirobot === "object") ? pf.blocage_antirobot as Record<string, unknown> : null;
          const tCe = ce && /anti-?robot/i.test(String(ce.motif ?? "")) ? Date.parse(String(ce.at ?? "")) : NaN;
          const tBa = ba ? Date.parse(String(ba.derniere ?? ba.depuis ?? "")) : NaN;
          const at = Math.max(Number.isFinite(tCe) ? tCe : -Infinity, Number.isFinite(tBa) ? tBa : -Infinity);
          if (!Number.isFinite(at)) continue;
          obsAr.push({ id: String(j.id), article: String(j.inventaire_id ?? j.listing_url ?? j.id), at });
        }
        const nbArticles = (l: ObsAr[]) => new Set(l.map((o) => o.article)).size;
        let enPause = false;
        if (nbArticles(obsAr) >= 2) {
          const { data: profAr } = await userClient.from("profiles").select("extension_sessions").eq("id", user.id).maybeSingle();
          const s = (profAr?.extension_sessions ?? null) as Record<string, unknown> | null;
          const vu403 = (x: unknown) => Boolean(x && typeof x === "object")
            && Number(((x as Record<string, unknown>)["http"] as Record<string, unknown> | undefined)?.["vinted"]) === 403;
          if (s && s["vinted"] !== true && (vu403(s) || vu403(s["previous"]))) {
            // Le DERNIER SUCCÈS Vinted du compte : un dépôt ou une republication
            // aboutis par l'extension, un retrait fait, une annonce relue.
            const [pubAr, delAr, capAr] = await Promise.all([
              userClient.from("cross_post_jobs").select("published_at")
                .eq("user_id", user.id).eq("platform", "vinted").in("action", ["publish", "republish"])
                .in("status", ["published", "sold"]).not("handler_build", "is", null).not("published_at", "is", null)
                .order("published_at", { ascending: false }).limit(1),
              userClient.from("cross_post_jobs").select("platform_fields")
                .eq("user_id", user.id).eq("platform", "vinted").eq("action", "delete").eq("status", "deleted")
                .order("created_at", { ascending: false }).limit(10),
              userClient.from("vinted_republish_captures").select("captured_at")
                .eq("user_id", user.id).order("captured_at", { ascending: false }).limit(1),
            ]);
            if (pubAr.error || delAr.error || capAr.error) {
              throw new Error(`dernier succès illisible (${(pubAr.error ?? delAr.error ?? capAr.error)?.message})`);
            }
            const temps = [
              ...((pubAr.data ?? []) as Array<{ published_at: string | null }>).map((r) => Date.parse(String(r.published_at ?? ""))),
              ...((delAr.data ?? []) as Array<{ platform_fields: unknown }>).map((r) => Date.parse(String(pfAr(r).processing_since ?? ""))),
              ...((capAr.data ?? []) as Array<{ captured_at: string | null }>).map((r) => Date.parse(String(r.captured_at ?? ""))),
            ].filter((t) => Number.isFinite(t));
            const dernierSucces = temps.length ? Math.max(...temps) : -Infinity;
            const apres = obsAr.filter((o) => o.at > dernierSucces);
            if (nbArticles(apres) >= 2) {
              enPause = true;
              const vintedOut = out.filter((j) => j.platform === "vinted");
              const garder = new Set<string>(vintedOut
                .filter((j) => j.action === "republish" && String(pfAr(j).republish_step ?? "") === "deleted")
                .map((j) => String(j.id)));
              const dernierRefus = Math.max(...apres.map((o) => o.at));
              let sondeAr: string | null = null;
              if (!garder.size && Date.now() - dernierRefus >= 45 * 60_000) {
                const du = (j: { platform_fields: unknown }) => {
                  const t = Date.parse(String(pfAr(j).next_action_after ?? ""));
                  return !Number.isFinite(t) || t <= Date.now();
                };
                const refusDe = new Map(obsAr.map((o) => [o.id, o.at]));
                const dus = vintedOut.filter(du);
                const jamais = dus.filter((j) => !refusDe.has(String(j.id)))
                  .sort((a, b) => (a.action === "delete" ? 0 : 1) - (b.action === "delete" ? 0 : 1));
                const choisi = jamais[0] ?? dus.filter((j) => refusDe.has(String(j.id)))
                  .sort((a, b) => (refusDe.get(String(a.id)) ?? 0) - (refusDe.get(String(b.id)) ?? 0))[0];
                if (choisi) { sondeAr = String(choisi.id); garder.add(sondeAr); }
              }
              for (const j of vintedOut) if (!garder.has(String(j.id))) idsAntirobot.add(String(j.id));
              if (idsAntirobot.size) out = out.filter((j) => !idsAntirobot.has(String(j.id)));
              // Le message de pause, sur chaque job Vinted en file (sauf ce qui
              // reste servi) — posé une fois, ≤ 40 écritures par poll.
              const depuisAr = new Date(Math.min(...apres.map((o) => o.at))).toISOString();
              let ecritures = 0;
              for (const j of fileVinted) {
                if (garder.has(String(j.id)) || ecritures >= 40) continue;
                const pf = pfAr(j);
                if (pf.attente_antirobot_compte && j.error === ANTIROBOT_COMPTE_MSG) continue;
                ecritures++;
                const pfNeuf: Record<string, unknown> = {
                  ...pf,
                  // pose_le (2026-09-25) : le début de la pause POUR CE JOB — c'est
                  // de là que la levée compte le temps passé en pause.
                  attente_antirobot_compte: { depuis: depuisAr, derniere_obs: new Date(dernierRefus).toISOString(), articles: nbArticles(apres), http: 403, pose_le: new Date().toISOString() },
                };
                if (j.error && j.error !== ANTIROBOT_COMPTE_MSG) {
                  pfNeuf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, j.error, "pending", "get-pending-jobs (pause anti-robot du compte)");
                }
                const { error: wErr } = await userClient.from("cross_post_jobs")
                  .update({ error: ANTIROBOT_COMPTE_MSG, platform_fields: pfNeuf })
                  .eq("id", j.id as string).eq("status", "pending");
                if (wErr) console.warn(`[get-pending-jobs] pause anti-robot : message non posé sur ${String(j.id).slice(0, 8)} (${wErr.message})`);
              }
              antirobotPause = {
                retenus: idsAntirobot.size, sonde: sondeAr, articles: nbArticles(apres),
                depuis: depuisAr, dernier_refus: new Date(dernierRefus).toISOString(),
                dernier_succes: Number.isFinite(dernierSucces) ? new Date(dernierSucces).toISOString() : null,
              };
              console.log(`[get-pending-jobs] userId=${user.id} : anti-robot sur le compte Vinted (${nbArticles(apres)} annonces refusées depuis le dernier succès, sonde 403) — ${idsAntirobot.size} job(s) Vinted en pause${sondeAr ? `, sonde = job ${sondeAr.slice(0, 8)}` : ""}${garder.size && !sondeAr ? `, ${garder.size} recréation(s) servie(s)` : ""} ; aucune tentative consommée`);
            }
          }
        }
        // SORTIE : la pause est levée (ou n'a jamais tenu) — le message de
        // pause n'a plus lieu d'être, le job redevient « en file ».
        if (!enPause) {
          let ecritures = 0;
          for (const j of fileVinted) {
            const pf = pfAr(j);
            if (!pf.attente_antirobot_compte || ecritures >= 40) continue;
            ecritures++;
            const pfNeuf: Record<string, unknown> = { ...pf };
            // (2026-09-25) LE TEMPS PASSÉ EN PAUSE NE COMPTE PAS : les délais
            // (dépôts muets à 10 jours, filet à 30 jours) REPRENNENT à la
            // levée. On cumule la durée de la pause de CE job — depuis la pose
            // du marqueur (sinon le début de l'épisode), jamais avant sa création.
            const marq = (pf.attente_antirobot_compte && typeof pf.attente_antirobot_compte === "object")
              ? pf.attente_antirobot_compte as Record<string, unknown> : {};
            const poseMs = Date.parse(String(marq.pose_le ?? marq.depuis ?? ""));
            const neMs = Date.parse(String((j as { created_at?: unknown }).created_at ?? ""));
            const debutPause = Math.max(Number.isFinite(poseMs) ? poseMs : Date.now(), Number.isFinite(neMs) ? neMs : -Infinity);
            pfNeuf.antirobot_pause_cumul_ms = Math.max(0, Number(pf.antirobot_pause_cumul_ms) || 0) + Math.max(0, Date.now() - debutPause);
            pfNeuf.antirobot_pause_levee_le = new Date().toISOString();
            delete pfNeuf.attente_antirobot_compte;
            const { error: wErr } = await userClient.from("cross_post_jobs")
              .update({ ...(j.error === ANTIROBOT_COMPTE_MSG ? { error: null } : {}), platform_fields: pfNeuf })
              .eq("id", j.id as string).eq("status", "pending");
            if (wErr) console.warn(`[get-pending-jobs] pause anti-robot levée : marqueur non retiré sur ${String(j.id).slice(0, 8)} (${wErr.message})`);
          }
          if (ecritures) console.log(`[get-pending-jobs] userId=${user.id} : pause anti-robot Vinted levée — ${ecritures} job(s) rendus à la file`);
          // (2026-09-25) LES RELEVÉS VINTED REPRENNENT SEULS À LA LEVÉE : ceux
          // qu'on a retenus pendant la pause (alarme quotidienne refusée,
          // demande laissée en file) ne reviendraient qu'au prochain cycle de
          // 24 h. Un relevé est mis en file s'il n'y en a ni en cours ni de
          // moins de 20 h — la cadence du dressing reste juge
          // (garde_cadence_sync_runs, index un_seul_actif).
          if (ecritures) {
            try {
              const { data: derniers } = await userClient.from("vinted_sync_runs")
                .select("status, started_at, finished_at, queued_at")
                .eq("user_id", user.id).eq("kind", "dressing")
                .order("queued_at", { ascending: false, nullsFirst: false }).limit(1);
              const d = (derniers ?? [])[0] as Record<string, unknown> | undefined;
              const actif = d && (d.status === "queued" || d.status === "running");
              const recentMs = Date.parse(String(d?.finished_at ?? d?.started_at ?? ""));
              if (!actif && !(Number.isFinite(recentMs) && Date.now() - recentMs < 20 * 3600_000)) {
                const { error: qErr } = await userClient.from("vinted_sync_runs").insert({
                  user_id: user.id, kind: "dressing", status: "queued",
                  declencheur: "serveur:levee_antirobot", queued_at: new Date().toISOString(),
                });
                console.log(`[get-pending-jobs] userId=${user.id} : relevé Vinted remis en file à la levée de la pause${qErr ? ` — refusé (${qErr.message})` : ""}`);
              }
            } catch (_e) { /* la reprise du relevé ne bloque jamais la file */ }
          }
        }
      } catch (e) {
        console.warn(`[get-pending-jobs] pause anti-robot du compte : ${String((e as Error)?.message ?? e)} — jobs servis tels quels`);
      }
    }

    // ── MAINTIEN EN ÉVEIL : COMPTER LA FILE RETENUE, PAS SEULEMENT SERVIE ───
    // (2026-09-17) L'arbitrage keep-awake de l'extension additionne
    // `jobs.length` (les jobs DISTRIBUÉS ce cycle) + `jobs_retenus_sync`. Avec
    // le compte-gouttes des republications et les jobs retenus (session connue
    // morte, pause, next_action_after), la distribution tombe à 0-1 alors que
    // la file réelle compte des dizaines de jobs : l'extension relâchait alors
    // l'éveil et la MACHINE S'ENDORMAIT sur un gros lot (cas Nyxlaire 17/09 :
    // 68 jobs en file, plus une seule demande d'éveil depuis 10:08).
    // On replie donc le BACKLOG RETENU dans `jobs_retenus_sync` — le SEUL champ
    // que l'extension lit déjà pour cet arbitrage (sync_prioritaire), et qui
    // n'a AUCUN autre lecteur (app, popup, serveur). Purement additif à la
    // réponse : la distribution `out` n'est pas touchée. Réparé pour tout le
    // parc SANS nouveau paquet CWS.
    // Borné au travail IMMINENT (next_action_after nul ou ≤ +15 min) : on ne
    // tient pas une machine éveillée pour des republications planifiées loin ;
    // le plafond de 4 h côté extension reste le garde-fou absolu. `jobs` est la
    // file pending déjà en mémoire, `out` son sous-ensemble distribué : aucun
    // appel de plus.
    const _outIds = new Set(out.map((j) => String(j.id)));
    const _nowMs = Date.now();
    const heldBacklog = (jobs ?? []).filter((j) => {
      if (_outIds.has(String(j.id))) return false; // déjà distribué ce cycle
      // En pause anti-robot du compte (25/09) : rien d'imminent — tenir la
      // machine éveillée ne ferait que relire un mur.
      if (idsAntirobot.has(String(j.id))) return false;
      const naa = (j.platform_fields as Record<string, unknown> | null)?.["next_action_after"];
      if (!naa) return true; // prêt maintenant (retenu par le compte-gouttes / une garde de ce cycle)
      const t = Date.parse(String(naa));
      return !Number.isFinite(t) || t <= _nowMs + 15 * 60_000; // échéance imminente
    }).length;
    const travailRetenu = heldSync + heldBacklog;

    // ── keepalive_actif (2026-09-17) : INTERRUPTEUR SERVEUR du maintien en vie
    // du worker pendant un job (0.6.42, port de remplissage). Lu dans
    // coin_config 'keepalive_actif' : 0 = ÉTEINT ; absent, illisible ou ≠ 0 =
    // ALLUMÉ (décision Nico : allumé pour tout le parc, coupable en une ligne).
    //   update coin_config set value = 0 where key = 'keepalive_actif';
    // L'extension le relit à chaque poll (≤ 2 min) et retombe sur son chemin
    // d'aujourd'hui. Lecture tolérante : elle ne bloque jamais la distribution.
    let keepaliveActif = true;
    try {
      const { data: cfgKa } = await userClient
        .from("coin_config").select("value").eq("key", "keepalive_actif").maybeSingle();
      if (cfgKa && Number(cfgKa.value) === 0) keepaliveActif = false;
    } catch (_e) { /* allumé par défaut */ }
    // Trace quand il est COUPÉ : la preuve, dans les logs, que l'interrupteur
    // a bien joué pour ce poll (rien n'est loggé à l'état allumé, le normal).
    if (!keepaliveActif) console.log(`[get-pending-jobs] userId=${user.id} : keepalive_actif=0 → port de remplissage ÉTEINT pour ce poll (chemin classique)`);

    // ── prevol_copie_actif (2026-09-23) : INTERRUPTEUR SERVEUR du pré-vol
    // « on ne retire pas ce qu'on ne sait pas remettre ». Il n'en avait AUCUN :
    // le 23/09, sa première version a bloqué 99 republications sur 99 et il a
    // fallu un correctif serveur pour la contourner, faute de pouvoir
    // l'éteindre. Toute garde capable de bloquer doit pouvoir être coupée sans
    // paquet — c'est la règle posée ce jour-là.
    // coin_config 'prevol_copie_actif' : 0 = ÉTEINT ; absent, illisible ou ≠ 0
    // = ALLUMÉ (le défaut : une garde s'éteint sur décision, jamais par oubli).
    //   update coin_config set value = 0 where key = 'prevol_copie_actif';
    // Lu par l'extension ≥ 0.6.60 à chaque poll (≤ 2 min). Éteint, elle ne
    // vérifie plus la copie — les autres gardes (capture valide, prix/titre
    // résolus, boutique étrangère, réconciliation) restent en place.
    let prevolCopieActif = true;
    try {
      const { data: cfgPc } = await userClient
        .from("coin_config").select("value").eq("key", "prevol_copie_actif").maybeSingle();
      if (cfgPc && Number(cfgPc.value) === 0) prevolCopieActif = false;
    } catch (_e) { /* allumé par défaut */ }
    if (!prevolCopieActif) console.log(`[get-pending-jobs] userId=${user.id} : prevol_copie_actif=0 → pré-vol de la copie ÉTEINT pour ce poll`);

    return json({
      jobs: out,
      annonces_en_attente: annoncesAttente,
      sync_command: syncCommand,
      sync_commands_annonces: syncCommandsAnnonces,
      // Demandes « me connecter » posées depuis l'app (souvent depuis le
      // téléphone) : l'extension ouvre la page sur l'ordinateur. Cf. le bloc
      // « ME CONNECTER » plus haut.
      connexion_commands: connexionCommands,
      // sync_prioritaire/jobs_retenus_sync portent désormais AUSSI le backlog
      // retenu (cf. bandeau ci-dessus) : « il reste du travail, ne dors pas ».
      sync_prioritaire: travailRetenu > 0,
      jobs_retenus_sync: travailRetenu,
      keepalive_actif: keepaliveActif,
      // prevol_copie_actif (2026-09-23) : interrupteur du pré-vol de la copie.
      // false = la garde ne vérifie plus rien (extension ≥ 0.6.60).
      prevol_copie_actif: prevolCopieActif,
      boutique_pause: boutiquePause,
      // beebs_interdits (2026-09-11) : dépôts passés en needs_user à ce poll
      // parce que l'article tombe sous les règles du catalogue Beebs.
      beebs_interdits: heldBeebsInterdit,
      // Retraits/republications Vinted retenus : l'article appartient a une autre
      // boutique que celle ouverte dans Chrome (incident du 22/09).
      boutique_etrangere_retenus: heldBoutiqueEtrangere,
      // Pré-vol de la catégorie de DESTINATION (2026-09-18) : republications
      // arrêtées AVANT toute suppression faute d'un requis prouvé, et ISBN
      // retrouvés tout seuls (description/titre) plutôt que demandés.
      jobs_retenus_prevol_destination: heldRequisDestination,
      isbn_deduits: isbnDeduits,
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
      // creneaux_republish (2026-09-18) : les quatre fenêtres, par plateforme.
      // `creneau_republish` reste la fenêtre VINTED, pour l'app d'avant.
      creneaux_republish: creneauxRepublish,
      jobs_retenus_creneau: heldCreneau,
      // porte pro Leboncoin (2026-09-17) : jobs publish Leboncoin retenus à
      // ce poll parce que l'extension est trop ancienne pour le formulaire
      // pro, et jobs relâchés parce qu'elle vient de se mettre à jour.
      jobs_retenus_lbc_pro: heldLbcPro,
      jobs_relaches_lbc_pro: relachesLbcPro,
      // (25/09) Dépôts Vinted passés en question AVANT tout essai (couleur ou
      // marque exigée, absente), jobs réarmés par un correctif d'extension
      // porté par ce poste, relevés expirés redemandés au retour de Chrome.
      vinted_questions_avant_essai: heldVintedExige,
      jobs_rearmes_correctif: relancesCorrectif,
      releves_redemandes: relevesRedemandes,
      // (25/09) Dépôts PEGI (Vinted « Jeux ») ou Âge (Beebs) passés en question
      // AVANT tout essai — la valeur manquait et rien ne permettait de la lire.
      questions_classement_age_avant_essai: heldClassementAge,
      // (25/09) Dépôts Leboncoin en rayon fourre-tout (« Divers > Autres ») non
      // choisi par la personne, passés en question AVANT tout essai.
      fourre_tout_retenus_avant_essai: heldFourreTout,
      // (25/09) Pause Vinted du compte sur anti-robot : jobs retenus, sonde
      // éventuelle, dates du signal. null = pas de pause.
      antirobot_pause: antirobotPause,
      // (25/09) Le compte est-il en pause anti-robot Vinted ? L'extension (≥
      // 0.6.68) ne lance alors AUCUNE lecture de Vinted hors jobs : ni relevé
      // du dressing, ni relevé des ventes, ni veilleur. La sonde de session
      // continue : c'est elle qui lève la pause.
      vinted_pause_antirobot: Boolean(antirobotPause) || compteEnPauseAr,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[get-pending-jobs] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
