import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { etatDepuisCapture } from "../_shared/vinted-etat.ts";
// Archive des erreurs remplacées (2026-09-12) : même fichier que l'app et
// update-job-status — une remise en pending automatique n'efface plus le motif.
import { archiverErreur } from "../_shared/erreurs-archivees.js";
// Liste FERMÉE des CDN des plateformes dont on importe des annonces — UNE
// seule source, partagée avec generate-listing (elle a divergé une fois : le
// filet ne connaissait que Vinted et les photos Beebs d'un article importé
// n'étaient jamais rapatriées, 19/09).
import { estCdnPlateforme, estCdnPlateformeHorsVinted } from "../_shared/photos-rapatriement.ts";

// handler-watch — surveillance QUASI TEMPS RÉEL des handlers de l'extension.
// Appelée par pg_cron toutes les 3 min (header x-cron-secret, même mécanique
// qu'ops-digest). Déployer avec --no-verify-jwt.
//
// Objectif : alerter en ≤ 3 min quand un handler CASSE, sans crier au loup sur
// les échecs LÉGITIMES (champ obligatoire vide, prix < 1, catégorie non
// résolue…) qui sont le filet qui fonctionne, pas une panne.
//
// Rappels d'architecture qui simplifient la détection :
//   - un needsUser (reauth, champ à compléter) NE devient PAS 'failed' : il
//     ré-arme le job en 'pending'. Les lignes 'failed' sont donc déjà les
//     échecs DURS — on n'a qu'à en retirer les refus légitimes connus.
//   - pas de failed_at en base : created_at fait foi (les jobs se traitent dans
//     les minutes qui suivent leur création).
//
// Signaux (voir plan validé) :
//   S1 — même signature, ≥ MULTI_USER_MIN users distincts, ≥ CROSS_MIN échecs,
//        fenêtre WINDOW_MIN. Le plus fiable (un sélecteur cassé frappe tout le
//        monde d'un coup), robuste à tout volume.
//   S2 — signature typée « rupture » (introuvable/timeout/soumission), ≥ 2
//        échecs. Utile à bas volume (mono-user).
//   S3 — anti-bot / restriction (captcha, « temporairement restreint »).
//        Ne relève PAS d'un fix : à router vers la mise en pause (Phase B).
//
// Anti-spam : monitor_state garde last_alerted_at par (plateforme, signature) ;
// on ne ré-alerte pas avant COOLDOWN_MIN.

const RESEND_API = "https://api.resend.com/emails";
const FROM = "FillSell <support@fillsell.app>";
const TO = "support@fillsell.app";

const WINDOW_MIN = 30;      // fenêtre glissante d'analyse
const COOLDOWN_MIN = 60;    // pas de ré-alerte d'une même signature avant 60 min
const CROSS_MIN = 3;        // S1 : nb d'échecs minimum
const MULTI_USER_MIN = 2;   // S1 : nb de users distincts minimum
const BROKEN_MIN = 2;       // S2 : nb d'échecs minimum pour une signature « rupture »

// Refus LÉGITIMES (le filet qui marche) — jamais une alerte handler.
const LEGIT_MARKERS = [
  "aspect(s) obligatoire", "aspect obligatoire", "champ requis", "champ obligatoire",
  "prix doit être", "prix doit etre", "supérieur ou égal", "superieur ou egal",
  "catégorie vinted non résolue", "categorie vinted non resolue",
  "sélectionne une valeur pour continuer", "selectionne une valeur pour continuer",
  "sélectionne le modèle", "selectionne le modele",
  "genre", "reconnexion", "reconnecte", "connexion requise", "adresse",
  "insufficient", "402",
];

// Signatures « RUPTURE » (S2) — panne probable du handler.
const BROKEN_MARKERS = [
  "introuvable", "non trouvé", "non trouve", "selector", "sélecteur", "selecteur",
  "timeout", "délai", "delai dépassé", "delai depasse", "resté sur", "reste sur",
  "http 4", "http 5", "undefined", "null is not", "cannot read",
  "soumission", "jamais soumis", "verify", "vérification de soumission",
];

// Signatures ANTI-BOT (S3).
const ANTIBOT_MARKERS = [
  "temporairement restreint", "captcha", "datadome", "robot", "bot-shield",
  "trop de tentatives", "rate limit", "429", "accès refusé", "acces refuse",
];

type Job = {
  id: string;
  user_id: string;
  platform: string;
  action: string;
  status: string;
  error: string | null;
  handler_build: string | null;
  created_at: string;
};

const hasMarker = (s: string, markers: string[]) =>
  markers.some((m) => s.includes(m));

// Normalise un message d'erreur en signature stable : minuscule, on coupe la
// « [sonde réseau : … ] » (volatile), on retire les chiffres et on tronque —
// deux échecs du même bug tombent sur la même signature.
function signatureOf(error: string): string {
  return error
    .toLowerCase()
    .split("[sonde")[0]
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function probableCause(sig: string, severity: string): string {
  if (severity === "S3" || hasMarker(sig, ANTIBOT_MARKERS))
    return "Anti-bot / rate-limit — NE PAS déployer de fix, envisager la mise en pause de la plateforme (Phase B).";
  if (sig.includes("introuvable") || sig.includes("resté sur") || sig.includes("reste sur") || sig.includes("selecteur") || sig.includes("sélecteur"))
    return "Sélecteur DOM probablement changé (nouvelle version du site) — vérifier le content-script de la plateforme.";
  if (sig.includes("timeout") || sig.includes("delai") || sig.includes("délai"))
    return "Page plus lente ou structure changée — timeout d'un attente DOM.";
  if (sig.includes("soumission") || sig.includes("verify"))
    return "Formulaire soumis mais refusé sur place — validation plateforme ou champ manquant non détecté.";
  return "Signature non catégorisée — inspecter les jobs échantillons ci-dessous.";
}

const fileFor = (platform: string) =>
  `chrome-extension/content-scripts/${platform}.js`;

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── Rapatriement des photos CDN (filet publication, 2026-08-27) ─────────────
// Mêmes gardes que generate-listing/republish-capture-photos : hôtes de
// plateformes FERMÉS (jamais un proxy ouvert), taille plafonnée, timeout,
// séquentiel. La liste des hôtes vit dans _shared/photos-rapatriement.ts.
const PHOTO_BUCKET = "listing-photos";
const PHOTO_MAX_OCTETS = 10 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 15_000;

// Les photos d'un job coexistent en deux formes : strings nues et objets
// {type, url} — même frontière que le réalignement de generate-listing.
// deno-lint-ignore no-explicit-any
const urlDePhoto = (p: any): string | null =>
  typeof p === "string" ? p : (p && typeof p === "object" && typeof p.url === "string" ? p.url : null);

// Télécharge une photo CDN et l'upload dans notre bucket. Deux tentatives sur
// échec TRANSITOIRE (réseau, timeout, 5xx/429/408, upload Storage — le HTTP
// 520 du 27/08) ; un refus permanent (404, pas une image…) sort au premier
// tour. Retourne l'URL publique, ou null.
// deno-lint-ignore no-explicit-any
async function rapatriePhoto(supabase: any, src: string, dest: string): Promise<string | null> {
  for (let tentative = 1; tentative <= 2; tentative++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), PHOTO_TIMEOUT_MS);
    let transitoire = false;
    try {
      const resp = await fetch(src, { signal: ctl.signal });
      if (!resp.ok) {
        transitoire = resp.status >= 500 || resp.status === 429 || resp.status === 408;
        console.error(`[handler-watch] rapatriement photo: HTTP ${resp.status} (${src.slice(0, 90)})`);
      } else {
        const bytes = new Uint8Array(await resp.arrayBuffer());
        const contentType = resp.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
        if (!bytes.byteLength || bytes.byteLength > PHOTO_MAX_OCTETS) {
          console.error(`[handler-watch] rapatriement photo: taille hors bornes (${bytes.byteLength} octets)`);
        } else if (!contentType.startsWith("image/")) {
          console.error(`[handler-watch] rapatriement photo: pas une image (${contentType})`);
        } else {
          const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
          const path = `${dest}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(path, bytes, { contentType, upsert: true });
          if (upErr) {
            transitoire = true;
            console.error(`[handler-watch] rapatriement photo: upload — ${upErr.message}`);
          } else {
            return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl as string;
          }
        }
      }
    } catch (e) {
      transitoire = true;
      console.error("[handler-watch] rapatriement photo:", (e as Error)?.name === "AbortError" ? `timeout ${PHOTO_TIMEOUT_MS / 1000}s` : e);
    } finally {
      clearTimeout(timer);
    }
    if (!transitoire) return null;
    if (tentative === 1) await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const resendKey = Deno.env.get("RESEND_API_KEY");
  // Auto-pause (Phase B) DERRIÈRE UN FLAG OFF PAR DÉFAUT : ne met une
  // plateforme en pause que si HANDLER_WATCH_AUTOPAUSE=1 est explicitement posé
  // côté fonction. Sans ça, handler-watch se contente d'alerter (jamais de
  // pause automatique non voulue). Ne concerne QUE S1 (cross-user) et S3
  // (anti-bot) — jamais S2, ni un refus légitime (déjà exclu en amont).
  const autoPauseOn = Deno.env.get("HANDLER_WATCH_AUTOPAUSE") === "1";

  const now = Date.now();
  const windowIso = new Date(now - WINDOW_MIN * 60_000).toISOString();

  const { data: rows, error: qErr } = await supabase
    .from("cross_post_jobs")
    .select("id, user_id, platform, action, status, error, handler_build, created_at")
    .eq("status", "failed")
    .gte("created_at", windowIso);

  if (qErr) {
    return new Response(JSON.stringify({ error: qErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const jobs = (rows ?? []) as Job[];
  // Republication multiplateforme (2026-09-17) : les messages nomment la
  // plateforme du job — « sur Vinted » n'est plus vrai pour tout le monde.
  const libellePlateforme = (p: unknown): string =>
    ({ vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", opla: "Opla" } as Record<string, string>)[String(p ?? "")] ?? "Vinted";

  // ── Annonces HORS LIGNE orphelines (2026-08-07, 3d-b validé Nico) ─────────
  // Un job republish resté à l'étape 'deleted' plus de 30 min = une annonce
  // RETIRÉE de Vinted que rien ne recrée (extension endormie, session
  // perdue — cas réel du soir : job 97757a78, ~1 h hors ligne, zéro signal).
  // Le mail doit permettre de DÉCIDER sans ouvrir Supabase : pseudo, titre,
  // durée hors ligne, fraîcheur du heartbeat. needs_user/failed inclus :
  // l'app les montre en rouge, mais rien ne garantit que l'utilisateur l'a
  // vue. Dédup PAR JOB : orphan_alerted_at posé dans platform_fields après
  // l'envoi — une alerte par job, jamais une toutes les 3 minutes.
  // Best-effort INTÉGRAL : ce bloc n'a pas le droit de casser la veille
  // handler, tout est avalé.
  let orphelinsAlertes = 0;
  try {
    const seuilIso = new Date(now - 30 * 60_000).toISOString();
    const { data: bruts } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, title, status, platform_fields")
      .eq("action", "republish")
      .in("status", ["pending", "processing", "needs_user", "failed"])
      .filter("platform_fields->>republish_step", "eq", "deleted")
      .filter("platform_fields->>orphan_alerted_at", "is", "null")
      .lt("platform_fields->>deleted_at", seuilIso);
    // deleted_at absent = pas de durée mesurable, on ne crie pas dessus.
    // deno-lint-ignore no-explicit-any
    const orphelins = ((bruts ?? []) as any[]).filter((j) => j.platform_fields?.deleted_at);
    if (orphelins.length && resendKey) {
      const userIds = [...new Set(orphelins.map((j) => j.user_id as string))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, email, extension_last_seen_at")
        .in("id", userIds);
      // deno-lint-ignore no-explicit-any
      const profParId = new Map(((profs ?? []) as any[]).map((p) => [p.id, p]));
      const minutes = (iso: string | null) => {
        const t = Date.parse(iso ?? "");
        return Number.isFinite(t) ? Math.round((now - t) / 60_000) : null;
      };
      const lignes = orphelins.map((j) => {
        const p = profParId.get(j.user_id) ?? {};
        const horsLigneMin = minutes(j.platform_fields.deleted_at);
        const hbMin = minutes(p.extension_last_seen_at ?? null);
        return `
    <div style="margin:0 0 12px;padding:12px 14px;border:1px solid #FED7AA;border-radius:12px;background:#FFF7ED;font-family:sans-serif;">
      <div style="font-size:14px;font-weight:700;color:#9A3412;">
        ${esc(p.username ?? p.email ?? j.user_id)} — « ${esc(j.title ?? "(sans titre)")} » · ${esc(libellePlateforme(j.platform))}
      </div>
      <div style="font-size:13px;color:#374151;margin-top:4px;">
        Hors ligne depuis <strong>${horsLigneMin != null ? `${horsLigneMin} min` : "durée inconnue"}</strong>
        · job <code>${esc(j.id)}</code> en <strong>${esc(j.status)}</strong>
      </div>
      <div style="font-size:12px;color:#6B7280;margin-top:4px;">
        ${esc(p.email ?? "email inconnu")} · extension vue il y a ${hbMin != null ? `${hbMin} min` : "jamais / inconnu"}
      </div>
    </div>`;
      });
      const orphHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F2F2EE;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;padding:26px;">
    <h1 style="margin:0 0 4px;font-size:18px;font-family:sans-serif;color:#9A3412;">
      ⚠️ ${orphelins.length} annonce(s) hors ligne sans recréation
    </h1>
    <p style="margin:0 0 14px;font-size:12px;font-family:sans-serif;color:#9CA3AF;">
      Étape 'deleted' depuis plus de 30 min — l'extension du compte ne recrée pas
      (endormie, session perdue…). L'annonce est retirée de sa plateforme, la copie
      (capture Vinted, ou snapshot du dépôt ailleurs) est en base : rien n'est perdu,
      mais personne ne le voit. Une alerte par job.
    </p>
    ${lignes.join("")}
  </div>
</body></html>`;
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: FROM, to: [TO],
          subject: `⚠️ ${orphelins.length} annonce(s) hors ligne sans recréation — republication orpheline`,
          html: orphHtml,
        }),
      });
      if (res.ok) {
        orphelinsAlertes = orphelins.length;
        // Marqueur de dédup posé APRÈS l'envoi réussi, par MERGE du
        // platform_fields relu à l'instant (jamais un écrasement aveugle —
        // l'extension peut se réveiller entre-temps et écrire ses étapes).
        for (const j of orphelins) {
          const { data: frais } = await supabase
            .from("cross_post_jobs").select("platform_fields").eq("id", j.id).maybeSingle();
          const pf = { ...(frais?.platform_fields ?? j.platform_fields), orphan_alerted_at: new Date(now).toISOString() };
          await supabase.from("cross_post_jobs").update({ platform_fields: pf }).eq("id", j.id);
        }
      } else {
        console.error("[handler-watch] alerte orphelines Resend:", await res.text().catch(() => ""));
      }
    }
  } catch (e) {
    console.error("[handler-watch] balayage orphelines:", (e as Error)?.message ?? e);
  }

  // ── Reprise des 'processing' ABANDONNÉS (2026-08-17 — remplace le passage en
  // failed du 15/08) ────────────────────────────────────────────────────────
  // PC fermé ≠ échec : 'failed' est réservé au REFUS d'une plateforme. Un job
  // dont l'ordinateur ne revient pas est simplement en attente d'une extension
  // vivante — on le RÉ-ARME en 'pending', quelle que soit l'étape ('deleted'
  // compris : la recréation n'a AUCUNE limite d'âge, on détient la capture).
  // L'unité n'est PAS rendue : le job va aboutir. Aucun trigger de solde ne
  // tire sur pending/needs_user (ils ne tirent que sur un statut terminal).
  // Conditions du balayage, inchangées :
  //   - processing depuis ≥ 24 h (processing_since, sinon created_at) ;
  //   - ET extension muette depuis ≥ 24 h (profiles.extension_last_seen_at).
  //     Une extension vue il y a < 24 h = « simplement hors ligne » (veille,
  //     nuit — cas Carla 284ebb84) : on ne touche à RIEN, l'extension garde la
  //     main (son recoverStaleProcessingJobs fait la même reprise en local).
  // Nettoyage de la réservation pour que n'importe quelle extension reprenne
  // le job à neuf : processing_since (l'horodatage de prise) ET
  // stale_recoveries (le compteur de reprises de l'extension — sans ce reset,
  // un job re-bloqué au retour partirait en failed au plafond MAX_STALE_
  // RECOVERIES pour des interruptions qui n'étaient pas des refus).
  // SEULE EXCEPTION : republish à l'étape 'captured' dont la capture a plus
  // de 24 h → needs_user. L'annonce d'origine est ENCORE EN LIGNE et la
  // photographie est périmée : on rend la main à l'utilisateur (sa relance
  // conserve platform_fields, l'extension re-capturera avant de supprimer).
  // Écritures en compare-and-swap (.eq status processing) : si le statut a
  // bougé entre-temps, on n'écrase rien. Best-effort intégral.
  // ── LE FILET DE 24 h NE RATTRAPAIT PERSONNE LE JOUR MÊME (2026-09-07) ──────
  // Job 6b4e9f45 (hugodacosta052) : l'app annonçait « Reprise automatique dans
  // ~5 min (tentative 1/5) », et trente minutes plus tard le job dormait
  // toujours en 'processing', tentative 1. Rien n'était cassé — c'était le
  // dessin : l'extension reprend ses 'processing' à 15 min (STALE_PROCESSING_MS,
  // au poll de 2 min), mais SI ELLE NE POLLE PLUS (Chrome fermé, service worker
  // tué sans réveil — cf. les coupures de canal du 06/09), plus personne ne
  // reprend le job avant VINGT-QUATRE HEURES. La promesse affichée était donc
  // fausse pour tout job dont l'ordinateur s'est tu.
  // Nouveau seuil, borné au strict nécessaire :
  //   · action 'publish' UNIQUEMENT, et seulement si l'extension est muette
  //     depuis ≥ 30 min — donc personne ne travaille dessus (elle-même aurait
  //     repris à 15 min) : reprise à 45 min au lieu de 24 h ;
  //   · 'republish' garde ses 24 h : son étape 'captured' SUPPRIME l'annonce,
  //     on ne raccourcit pas le délai d'un traitement destructif.
  // Filet anti-doublon : c'est l'extension qui sait demander à la plateforme
  // « une annonce à notre titre existe-t-elle déjà ? » (staleJobExistingListingUrl,
  // jamais exécuté côté serveur). On pose donc verifier_doublon_avant_publication
  // sur le job ré-armé : la 0.6.21 fait la vérification AVANT de re-publier ;
  // les versions antérieures ignorent le marqueur et se comportent comme
  // aujourd'hui à 24 h.
  const SEUIL_ABANDON_RAPIDE_MS = 45 * 60_000;
  const SEUIL_MUET_RAPIDE_MS = 30 * 60_000;
  let processingRearmes = 0;
  let processingNeedsUser = 0;
  try {
    const SEUIL_ABANDON_MS = 24 * 3600_000;
    const { data: bloques } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, action, created_at, platform_fields")
      .eq("status", "processing")
      .in("action", ["publish", "republish"]);
    // deno-lint-ignore no-explicit-any
    // processing_since ILLISIBLE (vide, malformé) → created_at, jamais NaN
    // (2026-09-10) : un NaN sortait le job des DEUX filets pour toujours —
    // celui-ci ET recoverStaleProcessingJobs côté extension font le même test
    // Number.isFinite et « continue » dessus. C'est le seul chemin trouvé par
    // lequel un 'processing' survit aux deux reprises avec une extension
    // vivante ; il est fermé des deux côtés.
    const ageProcessing = (j: { platform_fields?: Record<string, unknown> | null; created_at?: string }) => {
      const t = Date.parse(String(j.platform_fields?.processing_since ?? ""));
      const c = Date.parse(String(j.created_at ?? ""));
      return now - (Number.isFinite(t) ? t : c);
    };
    // Étape d'une republication — miroir de repubStepDe (background.js) :
    // absente ou inconnue = a_capturer, le défaut qui ne touche à rien.
    const etapeRepublish = (j: { platform_fields?: Record<string, unknown> | null }) => {
      const s = String(j.platform_fields?.republish_step ?? "");
      return s === "captured" || s === "deleted" ? s : "a_capturer";
    };
    // Reprise RAPIDE (45 min) : les publications, ET (2026-09-10) les
    // republications encore à l'étape 'a_capturer' — rien n'a été touché sur
    // Vinted (au pire une capture en lecture seule) ; les 24 h restent réservées
    // aux étapes qui SUPPRIMENT ('captured') ou ont supprimé ('deleted', qui a
    // par ailleurs sa reprise à 30 min plus bas).
    const repriseRapideApplicable = (j: { action?: string; platform_fields?: Record<string, unknown> | null }) =>
      j.action === "publish" || (j.action === "republish" && etapeRepublish(j) === "a_capturer");
    const seuilDe = (j: { action?: string; platform_fields?: Record<string, unknown> | null }) =>
      repriseRapideApplicable(j) ? SEUIL_ABANDON_RAPIDE_MS : SEUIL_ABANDON_MS;
    // deno-lint-ignore no-explicit-any
    const candidats = ((bloques ?? []) as any[]).filter((j) => {
      const age = ageProcessing(j);
      return Number.isFinite(age) && age >= seuilDe(j);
    });
    if (candidats.length) {
      const userIds = [...new Set(candidats.map((j) => j.user_id as string))];
      const { data: profs } = await supabase
        .from("profiles").select("id, extension_last_seen_at").in("id", userIds);
      // deno-lint-ignore no-explicit-any
      const lastSeen = new Map(((profs ?? []) as any[]).map((p) => [p.id, Date.parse(p.extension_last_seen_at ?? "")]));
      for (const j of candidats) {
        const seen = lastSeen.get(j.user_id);
        // Silence exigé de l'extension : 30 min sur la reprise rapide (une
        // extension vivante aurait repris le job à 15 min), 24 h sinon.
        const seuilMuet = repriseRapideApplicable(j) ? SEUIL_MUET_RAPIDE_MS : SEUIL_ABANDON_MS;
        if (Number.isFinite(seen as number) && now - (seen as number) < seuilMuet) continue;
        const repriseRapide = repriseRapideApplicable(j) && ageProcessing(j) < SEUIL_ABANDON_MS;
        const pf = { ...(j.platform_fields ?? {}) };
        delete pf.processing_since;
        delete pf.stale_recoveries;
        // Le serveur ne sait pas demander à la plateforme si l'annonce existe
        // déjà (le worker est mort peut-être APRÈS l'acceptation du dépôt) :
        // on le demande à l'extension, qui a ce filet depuis le 19/07.
        // Publication seule : une republication 'a_capturer' n'a rien déposé.
        if (repriseRapide && j.action === "publish") pf.verifier_doublon_avant_publication = true;

        // Vinted seul (2026-09-17) : hors Vinted la « capture » est la copie du
        // dépôt d'origine sur le job, elle ne périme pas — ré-armement simple.
        if (j.action === "republish" && pf.republish_step === "captured" && j.platform === "vinted") {
          // Capture à vérifier EN BASE (platform_fields ne porte que capture_id).
          // Extension muette ≥ 24 h = aucune recapture possible entre-temps :
          // une capture illisible ou sans horodatage est traitée comme périmée.
          let capturePerimee = true;
          const capId = Number(pf.capture_id);
          if (Number.isFinite(capId)) {
            const { data: cap } = await supabase
              .from("vinted_republish_captures")
              .select("captured_at")
              .eq("id", capId)
              .maybeSingle();
            const capAt = Date.parse(cap?.captured_at ?? "");
            if (Number.isFinite(capAt) && now - capAt < 24 * 3600_000) capturePerimee = false;
          }
          if (capturePerimee) {
            const msg =
              "Republication interrompue : l'ordinateur qui la portait ne s'est plus manifesté depuis " +
              "plus de 24 h et la photographie de ton annonce est périmée. Ton annonce est toujours en " +
              "ligne sur Vinted, rien n'a été supprimé. Relance la republication depuis la fiche de " +
              "l'article : une nouvelle capture sera prise avant tout retrait.";
            const { error: nErr } = await supabase
              .from("cross_post_jobs")
              .update({ status: "needs_user", error: msg, platform_fields: pf })
              .eq("id", j.id)
              .eq("status", "processing");
            if (!nErr) {
              processingNeedsUser++;
              console.log(`[handler-watch] job ${j.id} (${j.platform}/republish) processing abandonné, capture périmée → needs_user (annonce encore en ligne)`);
            }
            continue;
          }
        }

        // Le message dit la VRAIE durée : promettre « 24 h » sur une reprise
        // déclenchée à 45 min ferait mentir l'écran dans l'autre sens.
        const msg = repriseRapide && j.action === "republish"
          ? "Reprise après interruption : l'ordinateur qui portait cette republication ne s'est plus " +
            `manifesté depuis une demi-heure. Rien n'a été touché sur ${libellePlateforme(j.platform)} (ton annonce est en ligne) ; ` +
            "la republication est remise en file et repartira automatiquement dès qu'une extension " +
            "connectée se réveille — rien à faire de ton côté."
          : repriseRapide
          ? "Reprise après interruption : l'ordinateur qui portait cette publication ne s'est plus " +
            "manifesté depuis une demi-heure. La publication est remise en file et repartira " +
            "automatiquement dès qu'une extension connectée se réveille — rien à faire de ton côté."
          : "Reprise après interruption : l'ordinateur qui portait ce traitement ne s'est plus manifesté " +
            "depuis plus de 24 h. Le job est remis en file et repartira automatiquement dès qu'une " +
            "extension connectée se réveille — rien à faire de ton côté.";
        const { error: uErr } = await supabase
          .from("cross_post_jobs")
          .update({ status: "pending", error: msg, platform_fields: pf })
          .eq("id", j.id)
          .eq("status", "processing");
        if (!uErr) {
          processingRearmes++;
          console.log(`[handler-watch] job ${j.id} (${j.platform}/${j.action}) processing abandonné → pending (reprenable, unité conservée)`);
        }
      }
    }
  } catch (e) {
    console.error("[handler-watch] reprise des processing abandonnés:", (e as Error)?.message ?? e);
  }

  // ══ INCIDENT VINTED « status » : L'ÉTAT SE RÉPARE, IL NE SE DEMANDE PAS ══
  // (2026-09-07) Vinted a retiré `status` du payload d'édition à 13h25 : la
  // capture ne trouve plus l'état, verdict 'incomplet', et les republications
  // tombent en needs_user avec un message que le vendeur ne peut PAS résoudre —
  // son annonce est parfaitement remplie, c'est notre lecture qui a changé de
  // place. ⛔ Il ne doit rien voir, rien saisir, rien relancer (consigne Nico).
  //
  // Or l'état N'EST PAS PERDU : la capture écrite au moment de l'échec porte le
  // payload natif complet, donc `item_attributes[code=condition]`. Mesuré sur
  // les captures de l'incident : 88 sur 88 le portent, et 88 sur 88 n'étaient
  // bloquées QUE par l'état. On le relit donc et on RÉ-ARME le job.
  //
  // update-job-status répare désormais À LA VOLÉE (le job ne passe même plus
  // par needs_user). Cette passe-ci solde le PASSIF : les republications déjà
  // tombées avant ce correctif, qui attendraient sinon un geste impossible.
  //
  // ⛔ ÉTAT CERTAIN, JAMAIS DEVINÉ : la valeur vient du payload Vinted de CET
  // article (jointure vinted_item_id), résolue par la table RELEVÉE sur 3 116
  // de nos captures. Un id hors table ne rend rien : le job reste en
  // needs_user, une file à l'arrêt valant mieux qu'un état faux.
  // ⛔ Réparés SEULEMENT les needs_user dont l'état est le SEUL champ
  // actionnable manquant, et jamais deux fois (marqueur etat_repare_le).
  // ⚠️ needs_user → pending ne tire aucun trigger de solde (ils ne tirent que
  // sur un statut terminal) : rien n'est re-débité.
  let etatsRepares = 0;
  try {
    const { data: bloques } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, inventaire_id, platform_fields, error")
      .eq("action", "republish").eq("platform", "vinted").eq("status", "needs_user")
      .range(0, 499);
    // deno-lint-ignore no-explicit-any
    const candidats = ((bloques ?? []) as any[]).filter((j) => {
      const pf = (j.platform_fields ?? {}) as Record<string, unknown>;
      if (pf.etat_repare_le) return false;                       // déjà réparé une fois
      const uf = (pf.republish_user_fields ?? {}) as Record<string, unknown>;
      if (String(uf.etat ?? "").trim()) return false;            // état déjà en main
      const cles = Array.isArray(pf.champs_a_completer)
        ? (pf.champs_a_completer as unknown[]).map((c) => String(c).toLowerCase())
        : [];
      return cles.length === 1 && cles[0] === "etat";            // l'état, et rien d'autre
    });
    const itemIds = [...new Set(candidats
      .map((j) => String(((j.platform_fields ?? {}) as Record<string, unknown>).vinted_item_id ?? "").trim())
      .filter(Boolean))];
    if (itemIds.length) {
      // La capture la plus récente de chaque article, par paquets de 100 :
      // l'ordre décroissant + « premier vu gagne » suffit à la sélectionner.
      // ⛔ Clé (user_id, vinted_item_id), jamais l'id seul : ce cron tourne en
      // service role, sans RLS. Un id d'annonce appartient certes à un seul
      // vendeur Vinted, mais la règle « jamais l'article d'un autre » ne se
      // repose pas sur cette supposition — elle se code.
      const parItem = new Map<string, { libelles?: unknown; payload?: unknown }>();
      for (let i = 0; i < itemIds.length; i += 100) {
        const { data: caps } = await supabase
          .from("vinted_republish_captures")
          .select("user_id, vinted_item_id, libelles, payload, captured_at")
          .in("vinted_item_id", itemIds.slice(i, i + 100))
          .order("captured_at", { ascending: false });
        // deno-lint-ignore no-explicit-any
        for (const c of (caps ?? []) as any[]) {
          const cle = `${c.user_id}|${c.vinted_item_id}`;
          if (!parItem.has(cle)) parItem.set(cle, c);
        }
      }
      for (const j of candidats) {
        const pf = { ...((j.platform_fields ?? {}) as Record<string, unknown>) };
        const itemId = String(pf.vinted_item_id ?? "").trim();
        const resolu = etatDepuisCapture(parItem.get(`${j.user_id}|${itemId}`));
        if (!resolu) continue;
        const uf = (pf.republish_user_fields ?? {}) as Record<string, unknown>;
        delete pf.champs_a_completer;
        delete pf.needs_user_source;
        pf.republish_user_fields = { ...uf, etat: resolu.etat };
        pf.etat_repare_le = new Date(now).toISOString();
        pf.republish_etat_fourni = {
          source: `capture_du_job (${resolu.source})`,
          etat: resolu.etat,
          motif: "status retiré du payload Vinted le 07/09 — état lu dans item_attributes[condition]",
        };
        // Le motif de l'arrêt est archivé avant d'être effacé (2026-09-12).
        pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, j.error, "needs_user", "handler-watch (état réparé depuis la capture)");
        const { error: uErr } = await supabase
          .from("cross_post_jobs")
          .update({ status: "pending", error: null, platform_fields: pf })
          .eq("id", j.id)
          .eq("status", "needs_user");
        if (!uErr) etatsRepares++;
      }
      if (etatsRepares) {
        console.log(
          `[handler-watch] incident Vinted « status » : ${etatsRepares} republication(s) ré-armée(s) — ` +
          `état relu dans item_attributes[condition] de leur propre capture, aucune question posée au vendeur`,
        );
      }
    }
  } catch (e) {
    console.error("[handler-watch] réparation d'état (incident Vinted):", (e as Error)?.message ?? e);
  }

  // ── Reprise RAPIDE des 'processing' coupés APRÈS la suppression (2026-08-28,
  // cas Joe0410 : job 32761461, Chrome fermé à 01:46 juste après deleted_at,
  // annonce hors ligne 7 h — la reprise 24 h ci-dessus était la SEULE issue) ─
  // À l'étape 'deleted', chaque heure d'attente est une heure d'annonce HORS
  // LIGNE : le seuil général de 24 h (pensé pour des annonces encore en ligne,
  // cas Carla) est inadapté ici. Un job 'processing' à l'étape 'deleted', sans
  // new_vinted_item_id, dont la prise date de plus de REPRISE_DELETED_MIN,
  // repasse SEUL en 'pending' — la recréation repartira au premier poll d'une
  // extension vivante (la reprise de l'étape 'deleted' re-sonde l'état réel
  // avant de recréer, cf. processRepublishJob). Aucune unité re-débitée :
  // le débit vit à la création du job, et aucun trigger de solde ne tire sur
  // processing→pending (ils ne tirent que sur un statut terminal).
  // ⛔ GARDE-FOU (Nico, 28/08) : ne JAMAIS ré-armer un job de cette étape dont
  // la capture est incomplète ou absente — ce serait relancer une recréation
  // sans matière. Vérifiée EN BASE (vinted_republish_captures, verdict
  // 'valide') : capture_id absent, ligne introuvable ou verdict autre ⇒ on ne
  // touche à RIEN (le job reste visible de l'alerte orpheline et du balayage
  // 24 h). Pas de condition d'extension muette : ré-armer tôt est sans danger
  // (compare-and-swap sur 'processing' — une extension qui vient de reprendre
  // le job a déjà changé son statut ou le re-réclamera en pending), et c'est
  // la seule façon de raccourcir le trou quand Chrome revient vite.
  // stale_recoveries remis à zéro comme dans la reprise 24 h : les coupures ne
  // sont pas des refus, elles ne doivent pas consommer le plafond de reprises.
  const REPRISE_DELETED_MIN = 30;
  let deletedRearmes = 0;
  try {
    const { data: coupes } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, created_at, platform_fields")
      .eq("status", "processing")
      .eq("action", "republish")
      .filter("platform_fields->>republish_step", "eq", "deleted")
      .filter("platform_fields->>new_vinted_item_id", "is", "null");
    // deno-lint-ignore no-explicit-any
    for (const j of ((coupes ?? []) as any[])) {
      const pf0 = j.platform_fields ?? {};
      // Âge mesuré sur deleted_at (moment RÉEL du retrait, recalé sur l'horloge
      // serveur par update-job-status) et NON sur processing_since (2026-09-17).
      // processing_since est réécrit à CHAQUE re-prise du job : sur une machine
      // au service worker erratique (suspendu/relancé sans finir la recréation),
      // il repartait sans cesse à ~0, l'horloge de 30 min ne mûrissait jamais, et
      // l'annonce restait HORS LIGNE en rebondissant (cas Nyxlaire). deleted_at,
      // lui, ne bouge plus après le retrait → l'âge reflète le vrai temps hors
      // ligne. Repli processing_since puis created_at si deleted_at est
      // absent/illisible. Rien d'autre ne change : toujours un simple
      // RE-ARMEMENT (compare-and-swap sur 'processing', capture 'valide' exigée,
      // re-sonde de l'état réel avant recréation) — jamais une recréation serveur.
      const since = Date.parse(pf0.deleted_at ?? pf0.processing_since ?? j.created_at ?? "");
      if (!Number.isFinite(since) || now - since < REPRISE_DELETED_MIN * 60_000) continue;
      // Hors Vinted (2026-09-17) : la « capture » est le job lui-même
      // (republish_snapshot v2 = copie du dépôt d'origine, posée par la RPC) —
      // présente, elle vaut une capture 'valide' ; absente, même garde-fou.
      const snapshotHorsVinted = j.platform !== "vinted"
        && Number((pf0.republish_snapshot as Record<string, unknown> | null)?.version) >= 2;
      if (!snapshotHorsVinted) {
        const capId = Number(pf0.capture_id);
        if (!Number.isFinite(capId)) continue; // capture absente : garde-fou, on ne touche pas
        const { data: cap } = await supabase
          .from("vinted_republish_captures")
          .select("verdict")
          .eq("id", capId)
          .maybeSingle();
        if (cap?.verdict !== "valide") continue; // incomplète ou introuvable : idem
      }
      const pf = { ...pf0 };
      delete pf.processing_since;
      delete pf.stale_recoveries;
      // Couche 2 (2026-09-17) : compter le gel sans verdict — prioriteRepub côté
      // extension relègue en bout de file un 'deleted' repris DELETED_HANG_DEMOTE
      // fois, pour qu'il cesse de confisquer le compte (il reste pending/visible).
      pf.deleted_hang_count = (Number(pf0.deleted_hang_count) || 0) + 1;
      const msg =
        "Reprise après interruption : l'ordinateur a été coupé juste après le retrait de l'annonce, " +
        "avant sa recréation. Le job est remis en file et la recréation repartira toute seule dès " +
        "qu'une extension connectée se réveille — rien à faire de ton côté.";
      const { data: maj } = await supabase
        .from("cross_post_jobs")
        .update({ status: "pending", error: msg, platform_fields: pf })
        .eq("id", j.id)
        .eq("status", "processing")
        .select("id");
      if (maj?.length) {
        deletedRearmes++;
        console.log(`[handler-watch] job ${j.id} : processing coupé à l'étape 'deleted' (capture valide) → pending (annonce hors ligne, recréation relancée)`);
      }
    }
  } catch (e) {
    console.error("[handler-watch] reprise des 'deleted' coupés:", (e as Error)?.message ?? e);
  }

  // ── Reprise des 'processing' coupés à l'étape 'captured' (2026-08-29, cas
  // Joe0410 job 38c6ca6e : Chrome fermé à 00:12 juste après la capture 2128,
  // job figé 11 h — AUCUNE erreur, il n'y en a pas eu) ──────────────────────
  // Même trou que l'étape 'deleted' sous une autre forme : le job s'arrête
  // proprement et rien ne le relance. Même modèle de reprise, MÊMES garde-fous
  // (capture vérifiée EN BASE, verdict 'valide' exigé — capture_id absent,
  // ligne introuvable ou verdict autre ⇒ on ne touche à RIEN), compare-and-
  // swap sur 'processing'. Aucune unité re-débitée : le débit vit à la
  // création du job, aucun trigger de solde ne tire sur processing→pending.
  // ⚠️ Ne concerne QUE 'processing' : les pending à l'étape 'captured'
  // attendent normalement l'extension de leur propriétaire, on ne les lit pas.
  // Seuil 45 min, PLUS LONG que les 30 min de 'deleted', à dessein : ici
  // l'annonce est TOUJOURS EN LIGNE (zéro urgence), et une une-passe légitime
  // mais lente (photos, attentes anti-bot) peut durer bien plus qu'une simple
  // recréation — on ne réarme jamais sous les pieds d'une extension encore au
  // travail. Le compare-and-swap reste le filet si elle se réveille pile là.
  // Pas de borne d'âge de capture ICI (verdict seul, comme 'deleted') : c'est
  // l'EXTENSION qui re-vérifie la fraîcheur à l'étape 'captured' et recapture
  // (borné) avant toute suppression — jamais de retrait sur des données
  // périmées. Conséquence assumée, voir le rapport du 29/08 : ce réarmement à
  // 45 min passe AVANT le balayage 24 h « capture périmée → needs_user »
  // ci-dessus pour ces jobs — ils repartent en pending et se re-capturent au
  // retour de l'extension au lieu d'attendre une relance manuelle.
  // Compatible /listing-restriction (même lot) : cette reprise-là écrit des
  // jobs PENDING (avec next_action_after) — jamais scannés ici ; et un job
  // repris ici conserve son compteur listing_restriction_retries.
  const REPRISE_CAPTURED_MIN = 45;
  let capturedRearmes = 0;
  try {
    const { data: coupes } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, created_at, platform_fields")
      .eq("status", "processing")
      .eq("action", "republish")
      .filter("platform_fields->>republish_step", "eq", "captured")
      .filter("platform_fields->>new_vinted_item_id", "is", "null");
    // deno-lint-ignore no-explicit-any
    for (const j of ((coupes ?? []) as any[])) {
      const pf0 = j.platform_fields ?? {};
      const since = Date.parse(pf0.processing_since ?? j.created_at ?? "");
      if (!Number.isFinite(since) || now - since < REPRISE_CAPTURED_MIN * 60_000) continue;
      // Hors Vinted (2026-09-17) : la « capture » est le job lui-même
      // (republish_snapshot v2 = copie du dépôt d'origine, posée par la RPC) —
      // présente, elle vaut une capture 'valide' ; absente, même garde-fou.
      const snapshotHorsVinted = j.platform !== "vinted"
        && Number((pf0.republish_snapshot as Record<string, unknown> | null)?.version) >= 2;
      if (!snapshotHorsVinted) {
        const capId = Number(pf0.capture_id);
        if (!Number.isFinite(capId)) continue; // capture absente : garde-fou, on ne touche pas
        const { data: cap } = await supabase
          .from("vinted_republish_captures")
          .select("verdict")
          .eq("id", capId)
          .maybeSingle();
        if (cap?.verdict !== "valide") continue; // incomplète ou introuvable : idem
      }
      const pf = { ...pf0 };
      delete pf.processing_since;
      delete pf.stale_recoveries;
      const msg =
        "Reprise après interruption : l'ordinateur a été coupé après la capture de l'annonce, " +
        `avant tout retrait. Ton annonce est toujours en ligne sur ${libellePlateforme(j.platform)}, rien n'a été supprimé. ` +
        "Le job est remis en file et repartira tout seul dès qu'une extension connectée se " +
        "réveille — rien à faire de ton côté.";
      const { data: maj } = await supabase
        .from("cross_post_jobs")
        .update({ status: "pending", error: msg, platform_fields: pf })
        .eq("id", j.id)
        .eq("status", "processing")
        .select("id");
      if (maj?.length) {
        capturedRearmes++;
        console.log(`[handler-watch] job ${j.id} : processing coupé à l'étape 'captured' (capture valide) → pending (annonce encore en ligne, rien supprimé)`);
      }
    }
  } catch (e) {
    console.error("[handler-watch] reprise des 'captured' coupés:", (e as Error)?.message ?? e);
  }

  // ── CHIEN DE GARDE DES RUNS DE SYNC (2026-09-04) ───────────────────────────
  // Il existait handler-watch pour les jobs de publication et RIEN pour les
  // runs de dressing : un run laissé 'running' l'était POUR TOUJOURS. Relevé
  // ce soir avant correctif : six runs libérés à la main, dont trois ouverts
  // depuis plus de 500 heures (t.lambert08380 le 12/08, axelweiler4 le 13/08,
  // amelinelemay59 le 14/08), plus deux demandes 'queued' de 22 jours.
  //
  // COMMENT UN RUN RESTE OUVERT — mécanique relevée dans background.js :
  // traiterCommandeSyncDistante passe la ligne en 'running' AVANT de prendre
  // le verrou de flux, et syncDressingVinted ne s'exécute qu'APRÈS. Entre les
  // deux, le service worker MV3 peut mourir (tué à ~30 s d'inactivité), et
  // aucun appel de sortie n'a de minuteur : rien ne referme la ligne. Le run
  // d'ornellaracano de 20:35 en est la photo exacte — started_at, claimed_at
  // et updated_at à la même milliseconde, aucune écriture ensuite.
  //
  // CRITÈRE = ABSENCE DE PROGRESSION, JAMAIS DURÉE TOTALE. Un dressing de 700
  // articles est LENT mais VIVANT : la boucle écrit updated_at à chaque
  // tranche de 8 articles et attend au plus 9 s entre deux pages (mesuré sur
  // 834 runs 'done' de 30 jours : p95 = 0,98 min par page). Un run qui n'a
  // rien écrit depuis 30 min n'est donc pas lent — il est mort. Le seuil est
  // ~30× la page légitime la plus lente. Et un run REPRIS garde son started_at
  // d'origine : le mesurer sur la durée totale tuerait des runs bien vivants.
  //
  // ⛔ ON N'ANNULE RIEN, ON NE PERD RIEN : 'expired' est l'état déjà utilisé
  // pour les demandes non exécutées (l'app sait l'afficher), le curseur
  // page_suivante reste en place et la prochaine sync REPREND là où celle-ci
  // s'est arrêtée. Compare-and-swap sur (status, updated_at) : si l'extension
  // se réveille pile pendant qu'on écrit, sa page gagne et on ne touche à rien.
  const SYNC_RUN_SANS_PROGRES_MIN = 30;   // 'running' muet → expiré
  const SYNC_QUEUE_TTL_H = 6;             // 'queued' jamais réclamée → expirée
  let syncRunsExpires = 0;
  let syncQueuesExpirees = 0;
  try {
    const muetIso = new Date(now - SYNC_RUN_SANS_PROGRES_MIN * 60_000).toISOString();
    const { data: figes } = await supabase
      .from("vinted_sync_runs")
      .select("id, user_id, page_suivante, items_vus, updated_at, started_at")
      .eq("status", "running")
      .lt("updated_at", muetIso);
    // ── LA SONDE D'EXTENSION EST CONSULTÉE AVANT DE NOMMER LA CAUSE ─────────
    // (2026-09-14) Ce bloc énonçait « L'ordinateur s'est mis en veille ou
    // Chrome a été fermé » SANS RIEN VÉRIFIER. Démenti sur pièces le 14/09
    // (run 3bf812dd, seghird711) : pendant les 32 minutes de gel, l'extension
    // a vérifié une cinquantaine d'annonces (cross_post_jobs.last_checked_at,
    // 15:02→15:14) et son extension_last_seen_at battait encore à 15:39, six
    // minutes APRÈS le verdict. Chrome tournait ; c'est notre boucle de
    // lecture qui avait disparu avec son service worker.
    // Le message a égaré le diagnostic une journée entière et envoyait
    // l'utilisatrice chercher une panne qui n'existait pas chez elle.
    // profiles.extension_last_seen_at est DÉJÀ lu trois fois dans cette même
    // fonction (orphelins de republication, relances, builds) avec le même
    // client service_role : aucune permission nouvelle, une lecture bornée aux
    // seuls comptes qui ont un run figé — la plupart du temps, aucune.
    // ⛔ NI LE DÉCLENCHEMENT NI LE SEUIL DE 30 MIN NE CHANGENT : le run EST
    //    bien mort, l'expiration reste juste. Seul le TEXTE change.
    const figesListe = (figes ?? []) as Array<Record<string, unknown>>;
    // 10 min : le poll de l'extension tourne toutes les 2 min
    // (POLL_INTERVAL_MINUTES). Une sonde de moins de 10 min au moment du
    // verdict, c'est cinq cycles de marge — Chrome répondait, sans ambiguïté.
    const SONDE_VIVANTE_MIN = 10;
    const sondeParUser = new Map<string, number>();
    if (figesListe.length) {
      const idsFiges = [...new Set(figesListe.map((r) => String(r.user_id ?? "")).filter(Boolean))];
      try {
        const { data: profs } = await supabase
          .from("profiles").select("id, extension_last_seen_at").in("id", idsFiges);
        // deno-lint-ignore no-explicit-any
        for (const p of ((profs ?? []) as any[])) {
          const t = Date.parse(p.extension_last_seen_at ?? "");
          if (Number.isFinite(t)) sondeParUser.set(String(p.id), t);
        }
      } catch (e) {
        // Sonde illisible = on ne sait pas = on garde le texte d'avant, mot
        // pour mot. Jamais d'accusation neuve sur une lecture ratée.
        console.warn("[handler-watch] sonde d'extension illisible (message d'origine conservé):", (e as Error)?.message ?? e);
      }
    }
    for (const r of figesListe) {
      const muetDepuis = Math.round((now - Date.parse(String(r.updated_at ?? ""))) / 60_000);
      if (!Number.isFinite(muetDepuis)) continue;
      const page = Number(r.page_suivante) || 1;
      const vus = Number(r.items_vus) || 0;
      const sonde = sondeParUser.get(String(r.user_id ?? ""));
      const sondeMin = sonde != null ? Math.round((now - sonde) / 60_000) : null;
      // Deux pannes OPPOSÉES, deux textes. Par défaut (sonde inconnue), le
      // texte historique : on n'invente pas un défaut de notre côté sans
      // preuve, pas plus que l'inverse.
      const cause = sondeMin != null && sondeMin <= SONDE_VIVANTE_MIN
        ? "Chrome tournait bien de ton côté (ton extension nous a encore parlé il y a " +
          `${sondeMin} min) : c'est la lecture qui s'est arrêtée toute seule. Le défaut est chez nous, pas chez toi. `
        : "L'ordinateur s'est mis en veille ou Chrome a été fermé pendant la lecture. ";
      const { data: maj } = await supabase
        .from("vinted_sync_runs")
        .update({
          status: "expired",
          finished_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString(),
          erreur:
            `[watchdog] synchronisation arrêtée en cours de route : aucune progression depuis ${muetDepuis} min ` +
            `(page ${page}, ${vus} article${vus > 1 ? "s" : ""} lu${vus > 1 ? "s" : ""}). ` +
            cause +
            "Rien n'est perdu : relance la synchronisation, elle reprendra là où elle s'est arrêtée.",
        })
        .eq("id", r.id as string)
        .eq("status", "running")
        .eq("updated_at", r.updated_at as string)
        .select("id");
      if (maj?.length) {
        syncRunsExpires++;
        console.log(
          `[handler-watch] run de sync ${r.id} (user ${r.user_id}) figé depuis ${muetDepuis} min à la page ${page} → expiré` +
          ` — extension vue il y a ${sondeMin != null ? `${sondeMin} min` : "jamais / inconnu"}` +
          `${sondeMin != null && sondeMin <= SONDE_VIVANTE_MIN ? " (CHROME VIVANT : gel de notre côté)" : ""}`,
        );
      }
    }
  } catch (e) {
    console.error("[handler-watch] chien de garde des runs de sync:", (e as Error)?.message ?? e);
  }
  try {
    // 'queued' : le TTL de 6 h est déjà le contrat de livraison
    // (get-pending-jobs ne sert jamais au-delà). Mais le MARQUAGE vivait
    // uniquement dans purger_ma_sync_queue, appelée au poll d'une extension
    // capable — donc jamais pour qui n'a pas rouvert Chrome. D'où les deux
    // demandes de 22 jours. On le fait ici, pour tout le monde.
    const ttlIso = new Date(now - SYNC_QUEUE_TTL_H * 3600_000).toISOString();
    const { data: maj } = await supabase
      .from("vinted_sync_runs")
      .update({
        status: "expired",
        finished_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
        erreur:
          `demande jamais réclamée en ${SYNC_QUEUE_TTL_H} h — ton ordinateur n'a pas ouvert Chrome avec ` +
          "l'extension FillSell pendant ce temps. Relance la synchronisation quand il est allumé.",
      })
      .eq("status", "queued")
      .lt("queued_at", ttlIso)
      .select("id");
    syncQueuesExpirees = maj?.length ?? 0;
    if (syncQueuesExpirees) {
      console.log(`[handler-watch] ${syncQueuesExpirees} demande(s) de sync jamais réclamée(s) en ${SYNC_QUEUE_TTL_H} h → expirée(s)`);
    }
  } catch (e) {
    console.error("[handler-watch] expiration des demandes de sync en file:", (e as Error)?.message ?? e);
  }

  // ── needs_user À ÉCHÉANCE : 72 h sans geste → failed (point 5, GO Nico
  // 16/08) ──────────────────────────────────────────────────────────────────
  // needs_user n'est pas terminal : aucun trigger ne rend jamais l'unité —
  // l'utilisateur a payé un service jamais rendu (art. 5 des ANCIENNES CGV
  // unités, remplacées le 03/09 — les triggers restent en place pour l'ère
  // des débits ; relevé du
  // 16/08 : 46 républish 'captured' débités + 11 réservations publish non
  // soldées). Mécanisme validé : AUCUN chemin d'argent neuf. Le cron passe le
  // job en 'failed' et ce sont les triggers EXISTANTS qui remboursent,
  // idempotents par ligne (cross_post_jobs_settle_reservation, garde
  // reservation_settled_at ; republish_refund_on_terminal, gardes
  // pepite_remboursee + jamais sur un job abouti). Pas de double crédit
  // possible, pas de service gratuit : le remboursement n'existe QUE sur le
  // statut terminal — une relance AVANT l'échéance repart débitée, une
  // relance APRÈS est un nouveau job, débité normalement.
  //   - Borne : cross_post_jobs n'a NI updated_at NI horodatage de passage en
  //     needs_user → le cron pose platform_fields.needs_user_vu_le à sa
  //     PREMIÈRE observation et solde 72 h après. Les jobs existants gagnent
  //     donc le délai de grâce (validé).
  //   - Épisodes : une relance CONSERVE platform_fields (É5), le tampon
  //     survivrait à un aller-retour needs_user→pending→needs_user. On stampe
  //     donc AUSSI l'erreur observée (needs_user_vu_erreur) : si l'erreur a
  //     changé au retour, c'est un nouvel épisode → re-tampon, jamais un
  //     failed immédiat sur un tampon périmé.
  //   - EXCLUSION (décision Nico) : republish étape 'deleted' — l'annonce
  //     d'origine n'existe plus, on détient sa seule copie ; un failed
  //     rembourserait mais ABANDONNERAIT la recréation. Traités à part.
  //   - EXCLUSION garde Livres/ISBN (2026-08-22) : ces jobs n'attendent PAS un
  //     geste de l'utilisateur — ils attendent NOTRE fix (« On te préviendra
  //     dès que c'est réglé »), l'unité est déjà rendue à la mise en pause
  //     (update-job-status), et le solde 72 h écraserait le message par un
  //     « relance quand tu veux » qui ferait payer une nouvelle unité pour un
  //     job qui re-bloquerait. Reconnus par le marqueur needs_user_source OU
  //     par le préfixe du message : les 6 jobs pausés À LA MAIN par Nico le
  //     22/08 (même formulation) sont ainsi couverts SANS être réécrits.
  //   - Écritures en compare-and-swap (.eq status needs_user) : un job relancé
  //     entre-temps n'est jamais écrasé. Best-effort intégral.
  // ── OPLA PARQUÉE FAUTE D'ACCÈS : DONNER UNE ISSUE À LA FILE (2026-09-19) ──
  // Cas fondateur, ornellaracano le 19/09 à 09:15. Elle publie 5 annonces Opla
  // le 18/09 entre 15:35 et 19:34 avec l'extension 0.6.42 — la permission
  // d'hôte opla.co est donc bien accordée. Son extension passe en 0.6.44 dans
  // la soirée. Le lendemain matin, le PREMIER job Opla traité par la 0.6.44 est
  // un RETRAIT : `chrome.permissions.contains` rend false, le job est parqué en
  // needs_user. Le même article est retiré de Beebs, Leboncoin et Vinted à la
  // seconde près ; il reste EN VENTE sur Opla.
  //
  // ⚠️ CE QUE JE N'AI PAS PU PROUVER : pourquoi la permission a disparu. Le
  // manifeste déclare `optional_host_permissions: ["https://www.opla.co/*"]`
  // À L'IDENTIQUE en 0.6.42, 0.6.43 et 0.6.44 (relu dans les trois commits de
  // paquet), et l'empaquetage ne la retire pas — le commentaire contraire dans
  // background.js (sonderSessionOpla) est PÉRIMÉ, il date des 0.6.38/0.6.39.
  // Le fait mesurable est celui-ci : aucun job Opla n'est passé sous 0.6.44,
  // et le premier a buté sur l'accès.
  //
  // CE QUI EST CORRIGÉ ICI, ET SEULEMENT ÇA : la file n'avait AUCUNE issue.
  // `marquerAttenteAccesOpla` (background.js) EFFACE `next_action_after`, et le
  // seul ré-armement vit dans `chrome.permissions.onAdded` — c'est-à-dire un
  // clic dans le menu Chrome que personne ne sait devoir faire. Aucun des
  // 4 jobs Opla d'Ornella ne portait de date de reprise.
  //
  // La reprise est SERVEUR, donc sans paquet : on repasse le job en `pending`,
  // espacé et borné. L'extension relit `chrome.permissions.contains` à CHAQUE
  // job (jamais un cache) : si l'accès est revenu, le job passe tout seul ;
  // sinon il se re-parque, et notre compteur survit (marquerAttenteAccesOpla
  // recopie platform_fields). Coût d'une reprise à vide : un aller-retour de
  // statut, aucun onglet ouvert, rien à nourrir côté anti-bot.
  const OPLA_ACCES_REPRISES_MAX = 6;          // ~3 h de tentatives, puis on arrête
  const OPLA_ACCES_DELAI_MS = 30 * 60_000;    // une reprise par demi-heure au plus
  // Le message que la personne LIT dans l'app. L'extension écrit « ouvre le
  // menu FillSell et appuie sur Autoriser Opla » : envoyer quelqu'un cliquer
  // dans un menu Chrome qu'il ignore, pour un retrait qu'il n'a pas demandé
  // deux fois, c'est notre défaut, pas le sien (décision Nico, 19/09). On dit
  // ce que NOUS faisons, et ce qui reste vrai de l'annonce.
  // Le message que l'EXTENSION écrit (background.js, OPLA_MSG_ACCES). On le
  // reconnaît par son début pour ne réécrire QUE lui — jamais un message
  // qu'on aurait déjà posé, jamais celui d'une autre cause.
  const PREFIXE_OPLA_ACCES_EXTENSION = "Opla attend ton autorisation";
  const OPLA_ACCES_MSG_RETRAIT =
    "Le retrait sur Opla n'a pas pu se faire : l'accès à opla.co a été refusé à l'extension. " +
    "On réessaie tout seuls. ⚠️ En attendant, l'annonce est peut-être encore en ligne sur Opla " +
    "alors qu'elle a été retirée ailleurs — vérifie-la si l'article est vendu.";
  const OPLA_ACCES_MSG_DEPOT =
    "La publication sur Opla attend : l'accès à opla.co a été refusé à l'extension. " +
    "On réessaie tout seuls, il n'y a rien à faire de ton côté. Les autres plateformes ne sont pas concernées.";

  const PREFIXE_GARDE_LIVRES =
    "Republication mise en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Motif : blocage connu sur la catégorie Livres";
  let needsUserVus = 0;
  let needsUserSoldes = 0;
  let needsUserTicks = 0;
  try {
    // ── REFONTE 2026-09-10 : 72 h D'EXTENSION OUVERTE, pas 72 h d'horloge ─────
    // Cas Ornella : 18 jobs tués « Resté en attente de ton geste plus de 3
    // jours » pendant que son ordinateur était fermé une partie du temps — et
    // 4 d'entre eux re-tués DANS LA MINUTE après leur relance du 10/09 16:32,
    // parce que le tampon de première observation (needs_user_vu_le) survit à
    // la relance et que « même erreur au retour » ne rouvrait pas d'épisode.
    // Le décompte ne court désormais QUE sur du temps où l'extension a
    // effectivement pollé : à chaque passage (3 min), pour chaque job
    // needs_user, on regarde si profiles.extension_last_seen_at a bougé depuis
    // le dernier tick ; si oui on crédite la fenêtre (bornée à 45 min : deux
    // passages manqués ne font jamais gonfler le crédit), sinon rien. Un tick
    // toutes les 30 min par job — 21 needs_user dans le parc, une écriture par
    // demi-heure chacun. Le job est soldé quand le crédit atteint 72 h.
    //   · needs_user_tick_le / needs_user_actif_ms : le compteur. Absents (jobs
    //     d'avant, ou retour en needs_user — update-job-status et la relance de
    //     l'app les retirent) → posés à zéro : tout retour dans l'état repart
    //     d'un budget neuf, une relance EST un geste.
    //   · needs_user_vu_le / needs_user_vu_erreur : conservés pour l'épisode
    //     (erreur changée = nouvel épisode = compteur remis à zéro), et pour la
    //     traçabilité.
    //   · Mesuré sur les 18 jobs d'Ornella AVANT ce correctif : son extension
    //     a pollé chaque jour du 06 au 10/09 — ce décompte les aurait retardés
    //     (nuits non comptées), pas sauvés. Ce qui les sauve, c'est le budget
    //     neuf à chaque relance et la fin des passages fantômes.
    const TICK_NEEDS_USER_MS = 30 * 60_000;
    const CREDIT_MAX_PAR_TICK_MS = 45 * 60_000;
    const ECHEANCE_NEEDS_USER_ACTIF_MS = 72 * 3600_000;
    const { data: attente } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, action, error, created_at, platform_fields")
      .eq("status", "needs_user");
    // deno-lint-ignore no-explicit-any
    const lignes = ((attente ?? []) as any[]).filter((j) => {
      if (j.action === "republish" && j.platform_fields?.republish_step === "deleted") return false;
      if (j.platform_fields?.needs_user_source === "livres_isbn_garde" ||
          String(j.error ?? "").startsWith(PREFIXE_GARDE_LIVRES)) return false;
      // ── EXCLUSION OPLA/ACCÈS, tant que les reprises ne sont pas épuisées ──
      // Même doctrine que la garde Livres : ces jobs n'attendent pas un geste
      // que la personne SAIT devoir faire — ils attendent une permission
      // Chrome qui a disparu sans qu'elle y touche. Le balayage ci-dessous les
      // solderait en `failed` ; pour un RETRAIT (cas d'Ornella le 19/09), un
      // `failed` veut dire « l'annonce reste en ligne sur Opla pendant qu'elle
      // est retirée des trois autres plateformes » — c'est le scénario de
      // double vente. On les laisse donc à la reprise automatique (plus bas),
      // et le solde ne reprend la main qu'une fois celle-ci épuisée : la file
      // garde une issue, elle ne devient pas éternelle.
      if (j.platform === "opla" && j.platform_fields?.needs_user_source === "opla_acces" &&
          (Number(j.platform_fields?.opla_acces_reprises) || 0) < OPLA_ACCES_REPRISES_MAX) return false;
      return true;
    });
    const lastSeen = new Map<string, number>();
    const userIds = [...new Set(lignes.map((j) => String(j.user_id)))];
    for (let i = 0; i < userIds.length; i += 200) {
      const { data: profs } = await supabase
        .from("profiles").select("id, extension_last_seen_at").in("id", userIds.slice(i, i + 200));
      // deno-lint-ignore no-explicit-any
      for (const p of (profs ?? []) as any[]) lastSeen.set(String(p.id), Date.parse(p.extension_last_seen_at ?? ""));
    }
    const nowIso = new Date(now).toISOString();
    for (const j of lignes) {
      const pf = { ...(j.platform_fields ?? {}) };
      const erreurCourante = String(j.error ?? "").slice(0, 200);
      const vuLe = Date.parse(pf.needs_user_vu_le ?? "");
      const nouvelEpisode = !Number.isFinite(vuLe) || String(pf.needs_user_vu_erreur ?? "") !== erreurCourante;
      const tick = Date.parse(pf.needs_user_tick_le ?? "");
      if (nouvelEpisode || !Number.isFinite(tick)) {
        // Première observation, nouvel épisode ou retour en needs_user : on
        // POSE le compteur à zéro, on ne solde jamais à ce passage.
        pf.needs_user_vu_le = nowIso;
        pf.needs_user_vu_erreur = erreurCourante;
        pf.needs_user_tick_le = nowIso;
        pf.needs_user_actif_ms = 0;
        const { error: sErr } = await supabase
          .from("cross_post_jobs")
          .update({ platform_fields: pf })
          .eq("id", j.id)
          .eq("status", "needs_user");
        if (!sErr) needsUserVus++;
        continue;
      }
      if (now - tick < TICK_NEEDS_USER_MS) continue;
      const seen = lastSeen.get(String(j.user_id));
      // Vivante = l'extension a pollé au moins une fois depuis le dernier tick.
      const vivante = Number.isFinite(seen as number) && (seen as number) >= tick;
      const credit = vivante ? Math.min(now - tick, CREDIT_MAX_PAR_TICK_MS) : 0;
      const actif = (Number(pf.needs_user_actif_ms) || 0) + credit;
      pf.needs_user_actif_ms = actif;
      pf.needs_user_tick_le = nowIso;
      if (actif < ECHEANCE_NEEDS_USER_ACTIF_MS) {
        const { error: tErr } = await supabase
          .from("cross_post_jobs")
          .update({ platform_fields: pf })
          .eq("id", j.id)
          .eq("status", "needs_user");
        if (!tErr) needsUserTicks++;
        continue;
      }
      // Nettoyage unités, 2e passe (03/09) : même « rien décompté » est une
      // mention de décompte — la monnaie interne n'existe plus, les messages
      // n'en parlent plus du tout. Le préfixe reste cherchable en base.
      // Formulation (2026-09-11, audit des messages) : « 3 jours d'extension
      // ouverte » est notre mécanique, « ton geste » culpabilise, et « ton
      // annonce est intacte » était FAUX pour une republication arrêtée à
      // l'étape 'deleted' (annonce retirée, pas recréée). On dit ce que CE job
      // a fait ou non — jamais l'état de l'annonce, qu'un autre job a pu
      // changer (cas Ritthik du 10/09).
      const etapeRepub = String((pf as Record<string, unknown> | null)?.republish_step ?? "");
      const msg = j.action === "republish"
        ? (etapeRepub === "deleted"
          ? "Cette republication attendait une réponse depuis plusieurs jours : nous l'avons arrêtée. L'annonce avait déjà " +
            "été retirée de Vinted et pas encore recréée : relance-la depuis la fiche de l'article pour la recréer, tout est sauvegardé."
          : "Cette republication attendait une réponse depuis plusieurs jours : nous l'avons arrêtée. Elle n'a rien retiré " +
            "sur Vinted. Relance-la depuis la fiche de l'article quand tu veux.")
        : j.action === "delete"
          ? "Ce retrait attendait une réponse depuis plusieurs jours : nous l'avons arrêté. Si l'annonce est encore " +
            "en ligne, retire-la sur la plateforme."
          : "Cette publication attendait une réponse depuis plusieurs jours : nous l'avons arrêtée. " +
            "Relance-la depuis la fiche de l'article quand tu veux.";
      // ⛔ `cancelled`, PLUS JAMAIS `failed` (2026-09-22, « plus aucune ligne
      //    rouge »). Le trigger cross_post_job_settle_reservation traite
      //    'cancelled' EXACTEMENT comme 'failed' (release) : la personne ne
      //    perd rien. Ce qui change, c'est l'écran — « Arrêtée » en gris, avec
      //    le bouton Relancer, au lieu d'un « Pas partie » rouge. Une attente
      //    qu'on arrête n'est pas une panne : c'est une fin de non-recevoir.
      const { error: fErr } = await supabase
        .from("cross_post_jobs")
        .update({ status: "cancelled", error: msg, platform_fields: pf })
        .eq("id", j.id)
        .eq("status", "needs_user");
      if (!fErr) {
        needsUserSoldes++;
        console.log(`[handler-watch] job ${j.id} (${j.platform}/${j.action}) needs_user > 72 h d'extension ouverte (${Math.round(actif / 3600_000)} h créditées) → cancelled, solde par triggers`);
      }
    }
  } catch (e) {
    console.error("[handler-watch] règlement des needs_user à échéance:", (e as Error)?.message ?? e);
  }

  // ── REPRISE AUTOMATIQUE DES JOBS OPLA PARQUÉS FAUTE D'ACCÈS ───────────────
  // (constantes et raisons en tête de la section needs_user ci-dessus)
  // Écritures en compare-and-swap (.eq status needs_user) et erreurs isolées
  // par job : la base peut refuser UNE relance (trigger « article vendu » du
  // 16/09) sans arrêter les autres.
  let oplaReprises = 0;
  let oplaMessages = 0;
  try {
    const { data: parques } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, action, error, created_at, platform_fields")
      .eq("platform", "opla")
      .eq("status", "needs_user")
      .eq("platform_fields->>needs_user_source", "opla_acces");
    // deno-lint-ignore no-explicit-any
    const rows = (parques ?? []) as any[];
    if (rows.length) {
      const vus = new Map<string, number>();
      const ids = [...new Set(rows.map((j) => String(j.user_id)))];
      for (let i = 0; i < ids.length; i += 200) {
        const { data: profs } = await supabase
          .from("profiles").select("id, extension_last_seen_at").in("id", ids.slice(i, i + 200));
        // deno-lint-ignore no-explicit-any
        for (const p of (profs ?? []) as any[]) vus.set(String(p.id), Date.parse(p.extension_last_seen_at ?? ""));
      }
      const maintenant = Date.now();
      for (const j of rows) {
        const pf = { ...(j.platform_fields ?? {}) };
        const reprises = Number(pf.opla_acces_reprises) || 0;
        // Le message, réécrit CHAQUE FOIS que celui de l'extension revient —
        // et il revient : à chaque re-parking, marquerAttenteAccesOpla réécrit
        // `error` avec sa formulation « ouvre le menu FillSell ». VÉRIFIÉ EN
        // PROD le 19/09 à 10:06 : un drapeau posé une seule fois se faisait
        // écraser au premier re-parking et la personne relisait le message
        // Chrome. Le test porte donc sur le TEXTE, jamais sur un drapeau : il
        // est idempotent (on ne réécrit que ce qui vient de l'extension) et il
        // se tait de lui-même dès que les reprises cessent.
        // On stampe AUSSI needs_user_vu_erreur pour que la réécriture ne passe
        // pas pour un « nouvel épisode » au balayage des 72 h.
        if (String(j.error ?? "").startsWith(PREFIXE_OPLA_ACCES_EXTENSION)) {
          const msg = j.action === "delete" ? OPLA_ACCES_MSG_RETRAIT : OPLA_ACCES_MSG_DEPOT;
          pf.needs_user_vu_erreur = msg.slice(0, 200);
          const { error: mErr } = await supabase
            .from("cross_post_jobs")
            .update({ error: msg, platform_fields: pf })
            .eq("id", j.id)
            .eq("status", "needs_user");
          if (!mErr) oplaMessages++;
        }
        if (reprises >= OPLA_ACCES_REPRISES_MAX) continue;
        const depuis = Date.parse(
          pf.opla_acces_reprise_le ?? pf.opla_acces_attendu_le ?? j.created_at ?? "",
        );
        if (!Number.isFinite(depuis) || maintenant - depuis < OPLA_ACCES_DELAI_MS) continue;
        // Une reprise n'a de sens que si une extension tourne : sans elle, le
        // job repasserait en `pending` pour attendre au même endroit, en
        // consommant une des six tentatives pour rien.
        const vu = vus.get(String(j.user_id));
        if (!Number.isFinite(vu as number) || (vu as number) < depuis) continue;
        pf.opla_acces_reprises = reprises + 1;
        pf.opla_acces_reprise_le = new Date(maintenant).toISOString();
        delete pf.next_action_after;
        delete pf.processing_since;
        const { error: rErr } = await supabase
          .from("cross_post_jobs")
          .update({ status: "pending", platform_fields: pf })
          .eq("id", j.id)
          .eq("status", "needs_user");
        if (rErr) {
          console.warn(`[handler-watch] opla/accès : reprise refusée pour ${j.id} — ${rErr.message}`);
          continue;
        }
        oplaReprises++;
        console.log(`[handler-watch] job ${j.id} (opla/${j.action}) accès non accordé → reprise ${reprises + 1}/${OPLA_ACCES_REPRISES_MAX}`);
      }
    }
  } catch (e) {
    console.error("[handler-watch] reprise des jobs Opla parqués:", (e as Error)?.message ?? e);
  }

  // ══ LA RECONNEXION FAIT REPARTIR LES JOBS, SANS QU'ON CLIQUE (2026-09-22) ══
  // Chantier « Me connecter ». Le mur nº1 des nouveaux inscrits, c'est une
  // plateforme pas connectée ; le deuxième, c'est qu'après s'être reconnecté,
  // il fallait encore retrouver chaque article et cliquer « Relancer ».
  // Relevé du 22/09 : AUCUN mécanisme ne reprenait un job REAUTH eBay — ni le
  // balayage 72 h, ni la garde Livres, ni la reprise Opla. Quatre jobs de
  // pecqueux.sabine et philippaa dormaient comme ça, cinq tentatives épuisées.
  //
  // ⛔ ON NE REPREND QUE SUR UNE PREUVE, ET UNE PREUVE PLUS RÉCENTE QUE LE MUR.
  //    La sonde de l'extension doit dire `true`, être FRAÎCHE, et avoir été
  //    relevée APRÈS le blocage. Sans ce dernier point, un « true » d'avant-hier
  //    relancerait en boucle un job bloqué ce matin — exactement la boucle que
  //    la consigne interdit. Une sonde absente, périmée, ou `null` ne reprend
  //    RIEN : « je ne sais pas » n'est pas « c'est revenu ».
  // ⛔ ET SEULEMENT LES MURS DE CONNEXION. Un refus anti-robot, un challenge,
  //    un compte sans forfait ne se règlent pas en se reconnectant : les
  //    reprendre brûlerait des tentatives pour rien.
  //
  // ⚠️ MIROIR de utils/sessionsPlateformes (app) pour la fraîcheur : mêmes
  //    bornes par plateforme, même lecture de checked_at_par_plateforme.
  const FRAICHEUR_SONDE_MS: Record<string, number> = {
    vinted: 60 * 60_000, leboncoin: 3 * 60 * 60_000, ebay: 3 * 60 * 60_000, beebs: 3 * 60 * 60_000,
    opla: 3 * 60 * 60_000,
  };
  // Les murs de CONNEXION, reconnus sur le texte déjà écrit par nos handlers —
  // aucune signature neuve, aucune détection inventée.
  const MUR_CONNEXION: Record<string, RegExp> = {
    ebay: /^REAUTH VENTE eBay|^Connexion eBay requise/i,
    vinted: /^Connexion Vinted requise|page de connexion à la place du formulaire|session Vinted refusée/i,
    leboncoin: /^Connexion Leboncoin requise|^Adresse requise pour Leboncoin/i,
    beebs: /^Connexion Beebs requise/i,
  };
  // ── OPLA : LA MÊME REPRISE, SUR UN MARQUEUR ET NON SUR UN TEXTE (22/09) ──
  // Le mur d'Opla n'est pas une connexion mais la permission d'hôte de
  // l'extension, et le serveur la NOMME (needs_user_source='opla_acces') — la
  // même clé que l'app lit pour poser le bouton. Aucune heuristique de texte
  // ici : un marqueur, ou rien.
  // Sans ce bloc, la permission pouvait être accordée sans que RIEN ne
  // reparte : 6 jobs (geronimo0550, pecqueux.sabine, thomas.vinted590002)
  // attendaient un geste que la personne avait peut-être déjà fait. La
  // promesse « la publication repart toute seule ensuite » est désormais
  // tenue par quelqu'un.
  const murOplaLeve = (j: { platform?: unknown; platform_fields?: unknown }) =>
    j.platform === 'opla' &&
    String(((j.platform_fields ?? {}) as Record<string, unknown>)['needs_user_source'] ?? '') === 'opla_acces';
  let reprisesConnexion = 0;
  try {
    const { data: bloques } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, status, error, platform_fields")
      .in("status", ["needs_user", "failed"])
      .in("platform", ["vinted", "leboncoin", "ebay", "beebs", "opla"])
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString());
    // deno-lint-ignore no-explicit-any
    const candidats = ((bloques ?? []) as any[]).filter((j) =>
      murOplaLeve(j) || MUR_CONNEXION[j.platform]?.test(String(j.error ?? "")));
    if (candidats.length) {
      const ids = [...new Set(candidats.map((j) => String(j.user_id)))];
      const sessionsPar = new Map<string, Record<string, unknown>>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data: profs } = await supabase
          .from("profiles").select("id, extension_sessions").in("id", ids.slice(i, i + 200));
        // deno-lint-ignore no-explicit-any
        for (const p of (profs ?? []) as any[]) sessionsPar.set(String(p.id), p.extension_sessions ?? {});
      }
      const maintenant = Date.now();
      for (const j of candidats) {
        const s = sessionsPar.get(String(j.user_id)) ?? {};
        if (s[j.platform] !== true) continue;                       // pas connecté, ou inconnu
        const brut = (s.checked_at_par_plateforme as Record<string, string> | undefined)?.[j.platform]
          ?? (s.checked_at as string | undefined) ?? null;
        const vu = brut ? Date.parse(brut) : NaN;
        if (!Number.isFinite(vu)) continue;
        if (maintenant - vu > (FRAICHEUR_SONDE_MS[j.platform] ?? 60 * 60_000)) continue;   // trop vieille
        const pf = { ...(j.platform_fields ?? {}) } as Record<string, unknown>;
        // La sonde doit être postérieure au blocage. `needs_user_tick_le` est
        // réécrit par le balayage, donc inutilisable ; on prend la marque qu'on
        // pose nous-mêmes, et à défaut la dernière reprise déjà faite.
        const dejaRepris = Date.parse(String(pf.reprise_apres_connexion_le ?? ""));
        if (Number.isFinite(dejaRepris) && vu <= dejaRepris) continue; // rien de neuf depuis
        delete pf.needs_user_source; delete pf.needs_user_actif_ms; delete pf.needs_user_tick_le;
        delete pf.needs_user_vu_le; delete pf.needs_user_vu_erreur; delete pf.needsUserAttempts;
        delete pf.needsUserBoucle; delete pf.needsUserResolved; delete pf.next_action_after;
        delete pf.error_technique; delete pf.processing_since;
        // ⛔ `republish_step` et `erreurs_archivees` SURVIVENT : le premier dit
        //    où en est l'annonce d'origine (une republication reprise à
        //    'deleted' ne doit pas recapturer), le second est la mémoire.
        pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, j.error, j.status, "handler-watch (reprise après reconnexion)");
        pf.reprise_apres_connexion_le = new Date(vu).toISOString();
        const { data: maj } = await supabase
          .from("cross_post_jobs")
          .update({ status: "pending", error: null, platform_fields: pf })
          .eq("id", j.id)
          .in("status", ["needs_user", "failed"])
          .select("id");
        if (maj?.length) {
          reprisesConnexion++;
          console.log(`[handler-watch] job ${j.id} (${j.platform}) : session revenue (sonde ${new Date(vu).toISOString()}) → pending`);
        }
      }
    }
  } catch (e) {
    console.error("[handler-watch] reprise après reconnexion:", (e as Error)?.message ?? e);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LES JOBS EN ATTENTE DE SESSION AUSSI (2026-09-22 soir)
  // ══════════════════════════════════════════════════════════════════════════
  // Le bloc ci-dessus ne regarde que `needs_user` et `failed`. Or l'attente de
  // session la plus fréquente n'est NI l'un NI l'autre : marquerAttenteSession
  // (extension) et update-job-status laissent le job en `pending`, avec
  // `attente_session` posé et `next_action_after` à UNE HEURE. Le job est donc
  // invisible pour la reprise, et il dort jusqu'à l'échéance.
  //
  // MESURÉ le 22/09 — lesmillesetunepepite, inscrite à 19:56, sa toute
  // première publication : Vinted mise en attente à 20:32 (pas connectée, page
  // register/select_type), elle se connecte à 20:52 — le relevé Vinted part
  // aussitôt et importe 235 annonces, preuve que la session est revenue — et
  // la publication, elle, attend encore. Il a fallu la relancer à la main à
  // 21:27. C'est le moment exact où un nouvel inscrit décroche : il fait ce
  // qu'on lui demande, et il ne se passe rien.
  //
  // On lève donc l'échéance dès que la sonde prouve la session revenue. MÊME
  // preuve, MÊMES bornes que le bloc précédent :
  //   · la sonde dit `true` pour CETTE plateforme ;
  //   · elle est FRAÎCHE (mêmes bornes par plateforme) ;
  //   · elle est POSTÉRIEURE à la dernière observation d'attente.
  // ⛔ On ne touche qu'à `next_action_after` et au message : ni le statut (déjà
  //    `pending`), ni `republish_step`, ni `erreurs_archivees`, ni le compteur
  //    de tentatives — cette attente n'en a jamais consommé.
  // Le message que marquerAttenteSession (extension) et update-job-status
  // écrivent, et EUX SEULS. C'est lui qui prouve que l'échéance en cours vient
  // bien d'une attente de session — le marqueur `attente_session`, lui, SURVIT
  // au job (relevé du 22/09 : le job 2b00b562 le porte encore alors que son
  // blocage du moment est une taille refusée). Sans cette garde on effacerait
  // un message qui n'a rien à voir, et on relancerait un job dans son mur.
  const ATTENTE_SESSION_RE = /^En attente de ta connexion à /i;
  let attentesLevees = 0;
  try {
    const { data: enAttente } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, status, error, platform_fields")
      .eq("status", "pending")
      .in("platform", ["vinted", "leboncoin", "ebay", "beebs", "opla"])
      .not("platform_fields->>attente_session", "is", null)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString());
    // deno-lint-ignore no-explicit-any
    const candidats = ((enAttente ?? []) as any[]).filter((j) => {
      if (!ATTENTE_SESSION_RE.test(String(j.error ?? ""))) return false;
      const pf = (j.platform_fields ?? {}) as Record<string, unknown>;
      const echeance = Date.parse(String(pf.next_action_after ?? ""));
      // Sans échéance en cours, le job repart déjà tout seul : rien à lever.
      return Number.isFinite(echeance) && echeance > Date.now();
    });
    if (candidats.length) {
      const ids = [...new Set(candidats.map((j) => String(j.user_id)))];
      const sessionsPar = new Map<string, Record<string, unknown>>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data: profs } = await supabase
          .from("profiles").select("id, extension_sessions").in("id", ids.slice(i, i + 200));
        // deno-lint-ignore no-explicit-any
        for (const p of (profs ?? []) as any[]) sessionsPar.set(String(p.id), p.extension_sessions ?? {});
      }
      const maintenant = Date.now();
      for (const j of candidats) {
        const s = sessionsPar.get(String(j.user_id)) ?? {};
        if (s[j.platform] !== true) continue;                        // pas connecté, ou inconnu
        const brut = (s.checked_at_par_plateforme as Record<string, string> | undefined)?.[j.platform]
          ?? (s.checked_at as string | undefined) ?? null;
        const vu = brut ? Date.parse(brut) : NaN;
        if (!Number.isFinite(vu)) continue;
        if (maintenant - vu > (FRAICHEUR_SONDE_MS[j.platform] ?? 60 * 60_000)) continue;   // trop vieille
        const pf = { ...(j.platform_fields ?? {}) } as Record<string, unknown>;
        const attente = (pf.attente_session ?? {}) as Record<string, unknown>;
        // La sonde doit être POSTÉRIEURE à la dernière observation d'attente :
        // un « true » d'avant le blocage ne prouve rien, et relancerait en
        // boucle un job bloqué depuis.
        const depuis = Date.parse(String(attente.derniere ?? attente.depuis ?? ""));
        if (Number.isFinite(depuis) && vu <= depuis) continue;
        const dejaLeve = Date.parse(String(pf.attente_session_levee_le ?? ""));
        if (Number.isFinite(dejaLeve) && vu <= dejaLeve) continue;   // rien de neuf depuis
        delete pf.next_action_after;
        pf.attente_session_levee_le = new Date(vu).toISOString();
        const { data: maj } = await supabase
          .from("cross_post_jobs")
          .update({ status: "pending", error: null, platform_fields: pf })
          .eq("id", j.id)
          .eq("status", "pending")
          .select("id");
        if (maj?.length) {
          attentesLevees++;
          console.log(`[handler-watch] job ${j.id} (${j.platform}) : attente de session levée (sonde ${new Date(vu).toISOString()}) — repart au prochain passage de l'extension`);
        }
      }
    }
  } catch (e) {
    console.error("[handler-watch] levée des attentes de session:", (e as Error)?.message ?? e);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LE RELEVÉ AUSSI REPART TOUT SEUL (2026-09-22)
  // ══════════════════════════════════════════════════════════════════════════
  // Même promesse que pour les publications, tenue par le même mécanisme et la
  // MÊME sonde : une plateforme dont le relevé s'est arrêté sur une page de
  // connexion est remise en file dès que la session est prouvée fraîche ET
  // postérieure à l'arrêt. Sans ce bloc, le bouton « Me connecter » ouvrait la
  // page de connexion et puis plus rien — il fallait revenir dans l'app et
  // re-cliquer, ce que personne ne fait.
  //
  // MESURÉ le 22/09 sur 7 jours, runs `annonces` arrêtés sur « page de
  // connexion » : eBay 97 runs / 26 comptes, Beebs 83 / 29, Leboncoin 57 / 19.
  //
  // ⛔ LES MÊMES GARDES QUE LA RPC `demander_sync_plateforme`, recopiées parce
  //    qu'un cron ne doit jamais pouvoir poser ce qu'un humain ne pourrait pas
  //    poser : interrupteur serveur (sync_multi_ouverte_pour), extension déjà
  //    vue, aucun run de cette plateforme en file ou en cours, et la cadence de
  //    15 min sur le dernier relevé RÉUSSI.
  // ⛔ UNE REPRISE PAR MUR, JAMAIS DEUX. La marque, c'est le run qu'on vient de
  //    poser : tant qu'il existe (queued/running), ou tant que le dernier relevé
  //    réussi est plus récent que la sonde, on ne repose rien. C'est ce qui
  //    interdit la boucle — sans quoi ce bloc rejouerait toutes les 3 minutes.
  // ⛔ VINTED N'EST PAS ICI. Son relevé vit en `kind='dressing'`, avec sa propre
  //    cadence et son index unique d'unicité ; le remettre en file demande de
  //    passer par `demander_sync_dressing`, pas par un INSERT. Chantier à part.
  let relevesRepris = 0;
  try {
    const PF_RELEVE = ["leboncoin", "beebs", "ebay", "opla"];
    const depuis = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    const { data: arretes } = await supabase
      .from("vinted_sync_runs")
      .select("id, user_id, platform, status, erreur, finished_at")
      .eq("kind", "annonces")
      .in("status", ["absente", "failed", "expired"])
      .in("platform", PF_RELEVE)
      .gte("finished_at", depuis)
      .order("finished_at", { ascending: false })
      .limit(1000);
    // Le mur, reconnu sur le texte que NOS relevés écrivent — jamais une
    // heuristique. Miroir de `murConnexionReleve` (src/annonces/etatReleve.js).
    const estMur = (e: unknown) => {
      const t = String(e ?? "").toLowerCase();
      return t.includes("page de connexion") || t.includes("opla non accord");
    };
    // Le PLUS RÉCENT par (compte, plateforme) : la liste est déjà triée du plus
    // récent au plus ancien, le premier vu fait foi. Un run plus récent qui
    // n'est PAS un mur (il a réussi, ou il a échoué autrement) gagne donc, et
    // la plateforme sort des candidats — c'est voulu.
    const dernier = new Map<string, { id: string; user_id: string; platform: string; finished_at: string; mur: boolean; alignee?: boolean }>();
    // deno-lint-ignore no-explicit-any
    for (const r of ((arretes ?? []) as any[])) {
      const cle = `${r.user_id}|${r.platform}`;
      if (dernier.has(cle)) continue;
      dernier.set(cle, {
        id: String(r.id), user_id: String(r.user_id), platform: String(r.platform),
        finished_at: String(r.finished_at ?? ""), mur: estMur(r.erreur),
      });
    }
    const candidats = [...dernier.values()].filter((c) => c.mur && c.finished_at);

    if (candidats.length) {
      const ids = [...new Set(candidats.map((c) => c.user_id))];
      const profilsPar = new Map<string, { sessions: Record<string, unknown>; extVue: string | null }>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data: profs } = await supabase
          .from("profiles").select("id, extension_sessions, extension_last_seen_at").in("id", ids.slice(i, i + 200));
        // deno-lint-ignore no-explicit-any
        for (const p of ((profs ?? []) as any[])) {
          profilsPar.set(String(p.id), {
            sessions: (p.extension_sessions ?? {}) as Record<string, unknown>,
            extVue: p.extension_last_seen_at ?? null,
          });
        }
      }

      // ══ LA SONDE DOIT RÉPONDRE À LA QUESTION POSÉE (2026-09-22, le soir) ══
      // Première version : on lisait `extension_sessions.ebay`, qui teste la
      // porte de la PUBLICATION (/sl/prelist/suggest). Le relevé, lui, charge
      // le Hub vendeur (/sh/lst/active). Un compte frappé par le step-up de
      // sécurité passe la première et bute sur le second : 11 relevés remis en
      // file, 6 revenus dans la minute sur le même mur.
      // L'extension 0.6.54 sonde le Hub à part et écrit `ebay_hub`. On le lit
      // EN PRIORITÉ pour eBay ; sans lui (extension plus ancienne) on retombe
      // sur `ebay`, mais la reprise reste alors PLAFONNÉE — voir plus bas.
      const cleSonde = (s: Record<string, unknown>, pf: string) =>
        (pf === "ebay" && s.ebay_hub !== undefined ? "ebay_hub" : pf);
      const maintenant = Date.now();
      const murLeve = candidats.filter((c) => {
        const prof = profilsPar.get(c.user_id);
        if (!prof || !prof.extVue) return false;              // extension jamais vue
        const s = prof.sessions ?? {};
        const cle = cleSonde(s, c.platform);
        if (s[cle] !== true) return false;                    // pas connecté, ou inconnu
        const brut = (s.checked_at_par_plateforme as Record<string, string> | undefined)?.[cle]
          ?? (s.checked_at_par_plateforme as Record<string, string> | undefined)?.[c.platform]
          ?? (s.checked_at as string | undefined) ?? null;
        const vu = brut ? Date.parse(brut) : NaN;
        if (!Number.isFinite(vu)) return false;
        if (maintenant - vu > (FRAICHEUR_SONDE_MS[c.platform] ?? 60 * 60_000)) return false;  // trop vieille
        const arret = Date.parse(c.finished_at);
        if (!Number.isFinite(arret) || vu <= arret) return false;   // rien de neuf depuis le mur
        // La sonde répond-elle à la question du RELEVÉ ? Si oui, la reprise
        // peut aboutir et n'a pas à être plafonnée.
        c.alignee = cle !== c.platform || c.platform !== "ebay";
        return true;
      });

      if (murLeve.length) {
        // ── TOUT L'HISTORIQUE UTILE, EN UNE LECTURE ───────────────────────
        // Trois faits par (compte, plateforme) : un run en file ou en cours
        // (interdit d'en poser un second, c'est l'index métier de la RPC), la
        // date du dernier relevé RÉUSSI (cadence de 15 min), et le nombre de
        // reprises AUTOMATIQUES déjà faites depuis ce dernier succès.
        //
        // ⛔ UNE REPRISE PAR ÉPISODE, ET UNE SEULE (2026-09-22, le soir même).
        //    Mesuré à la première salve : 11 relevés eBay/Opla remis en file,
        //    6 revenus dans la minute sur EXACTEMENT le même mur (« session
        //    ebay : page de connexion »). La sonde `extension_sessions.ebay`
        //    dit « connecté » — et elle n'a pas tort : le compte eBay est
        //    ouvert. C'est « Mes annonces » qui redemande une connexion.
        //    Sans cette garde, chaque rafraîchissement de sonde (toutes les
        //    heures) reposerait la même demande, indéfiniment : la promesse
        //    « ça repart tout seul » deviendrait un martèlement, et c'est
        //    exactement ce que l'anti-robot des plateformes guette.
        //    Une tentative automatique par épisode. Le bouton « Me connecter »
        //    reste, lui, disponible autant de fois que la personne le veut —
        //    un geste humain n'est pas un cron.
        const idsLeves = [...new Set(murLeve.map((c) => c.user_id))];
        const actifs = new Set<string>();
        const reussiA = new Map<string, number>();
        const repriseDepuis = new Map<string, number[]>();
        for (let i = 0; i < idsLeves.length; i += 200) {
          const { data: histo } = await supabase
            .from("vinted_sync_runs")
            .select("user_id, platform, status, declencheur, queued_at, started_at, finished_at")
            .eq("kind", "annonces")
            .in("user_id", idsLeves.slice(i, i + 200))
            .gte("started_at", new Date(maintenant - 30 * 24 * 60 * 60_000).toISOString())
            .limit(2000);
          // Les lignes ENCORE EN FILE n'ont ni started_at ni finished_at utile
          // selon les chemins : on les relit à part plutôt que de risquer
          // qu'un filtre de date les écarte et qu'on en empile une seconde.
          const { data: enFile } = await supabase
            .from("vinted_sync_runs")
            .select("user_id, platform")
            .eq("kind", "annonces")
            .in("user_id", idsLeves.slice(i, i + 200))
            .in("status", ["queued", "running"])
            .limit(1000);
          // deno-lint-ignore no-explicit-any
          for (const r of ((enFile ?? []) as any[])) actifs.add(`${r.user_id}|${r.platform}`);
          // deno-lint-ignore no-explicit-any
          for (const r of ((histo ?? []) as any[])) {
            const cle = `${r.user_id}|${r.platform}`;
            if (r.status === "queued" || r.status === "running") { actifs.add(cle); continue; }
            if (r.status === "done") {
              const t = Date.parse(String(r.finished_at ?? ""));
              if (Number.isFinite(t) && t > (reussiA.get(cle) ?? 0)) reussiA.set(cle, t);
            }
            if (String(r.declencheur ?? "") === "reprise_connexion") {
              const t = Date.parse(String(r.queued_at ?? r.started_at ?? ""));
              if (Number.isFinite(t)) repriseDepuis.set(cle, [...(repriseDepuis.get(cle) ?? []), t]);
            }
          }
        }

        // L'interrupteur serveur, compte par compte — la RPC le vérifie, nous
        // aussi. Un seul appel par compte, pas par plateforme.
        const ouvertePar = new Map<string, boolean>();
        for (const uid of idsLeves) {
          try {
            const { data } = await supabase.rpc("sync_multi_ouverte_pour", { p_user: uid });
            ouvertePar.set(uid, data === true);
          } catch { ouvertePar.set(uid, false); }
        }

        for (const c of murLeve) {
          const cle = `${c.user_id}|${c.platform}`;
          if (!ouvertePar.get(c.user_id)) continue;
          if (actifs.has(cle)) continue;
          const reussi = reussiA.get(cle) ?? 0;
          if (reussi && maintenant - reussi < 15 * 60_000) continue;     // cadence
          // L'ÉPISODE court depuis le dernier relevé réussi — ou depuis
          // toujours si cette plateforme n'a jamais rien rendu.
          // ⛔ LE PLAFOND DÉPEND DE CE QUE LA SONDE A VRAIMENT VU (22/09) :
          //   · sonde ALIGNÉE sur la porte du relevé → la reprise PEUT
          //     aboutir. Plafond large (3 par épisode) : on tient la promesse
          //     « ça repart tout seul » sans jamais devenir illimité, parce
          //     qu'une sonde juste peut quand même se tromper.
          //   · sonde de repli (eBay sans `ebay_hub`, extension < 0.6.54) →
          //     UNE seule tentative par épisode. C'est la garde du 22/09, et
          //     elle reste tant qu'on ne sait pas si la porte s'ouvre.
          const plafond = c.alignee ? 3 : 1;
          if ((repriseDepuis.get(cle) ?? []).filter((t) => t > reussi).length >= plafond) continue;
          const { data: pose } = await supabase
            .from("vinted_sync_runs")
            .insert({
              user_id: c.user_id, kind: "annonces", platform: c.platform,
              status: "queued", declencheur: "reprise_connexion",
              queued_at: new Date().toISOString(),
            })
            .select("id");
          if (pose?.length) {
            relevesRepris++;
            console.log(`[handler-watch] relevé ${c.platform} de ${c.user_id} : session revenue → remis en file (mur du ${c.finished_at})`);
          }
        }
      }
    }
  } catch (e) {
    console.error("[handler-watch] reprise du relevé après reconnexion:", (e as Error)?.message ?? e);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LE RELEVÉ VINTED REPART AUSSI (2026-09-22)
  // ══════════════════════════════════════════════════════════════════════════
  // Il manquait à l'appel : les quatre autres plateformes repartaient seules
  // depuis v47, Vinted non — parce que son relevé vit en `kind='dressing'`,
  // avec sa propre cadence et un index d'unicité (un seul run actif par
  // compte). On ne contourne ni l'un ni l'autre : on REPOSE les mêmes gardes
  // que `demander_sync_dressing()`, qu'un cron ne peut pas appeler (elle lit
  // auth.uid()).
  //
  // ⛔ LA CADENCE ANTI-ROBOT N'EST PAS UNE FORMALITÉ. Vinted coupe la lecture
  //    des comptes qui martèlent — c'est le dossier des 403 d'août. D'où :
  //    cadence de 15 min sur le dernier relevé RÉUSSI, aucune demande si une
  //    autre est déjà en vol, et UNE seule reprise automatique par épisode,
  //    même si la sonde est alignée. Un geste humain peut insister ; un cron,
  //    non.
  let dressingsRepris = 0;
  try {
    const depuis = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    const { data: runsDressing } = await supabase
      .from("vinted_sync_runs")
      .select("id, user_id, status, declencheur, erreur, finished_at, started_at")
      .eq("kind", "dressing")
      .gte("started_at", depuis)
      .order("started_at", { ascending: false })
      .limit(2000);
    // Le mur Vinted, sur le texte que NOTRE sonde écrit — miroir de
    // `MUR_VINTED` (src/annonces/etatReleve.js), aucune signature neuve.
    const murVinted = (e: unknown) => {
      const t = String(e ?? "").toLowerCase();
      return t.includes("cause403") || t.includes("aucune session vinted")
        || (t.includes("session vinted") && t.includes("401"));
    };
    const maintenant = Date.now();
    // Le PLUS RÉCENT par compte fait foi, tous statuts confondus : un `done`
    // postérieur au mur veut dire que c'est déjà reparti, et un run en vol
    // interdit d'en poser un second.
    const etatPar = new Map<string, { dernier: string; mur: boolean; finished_at: string; actif: boolean; dernierDone: number; reprises: number[] }>();
    // deno-lint-ignore no-explicit-any
    for (const r of ((runsDressing ?? []) as any[])) {
      const uid = String(r.user_id);
      const e = etatPar.get(uid) ?? { dernier: "", mur: false, finished_at: "", actif: false, dernierDone: 0, reprises: [] };
      if (!e.dernier) {
        e.dernier = String(r.status ?? "");
        e.mur = murVinted(r.erreur);
        e.finished_at = String(r.finished_at ?? r.started_at ?? "");
      }
      if (r.status === "queued" || r.status === "running") e.actif = true;
      if (r.status === "done") {
        const t = Date.parse(String(r.finished_at ?? ""));
        if (Number.isFinite(t) && t > e.dernierDone) e.dernierDone = t;
      }
      if (String(r.declencheur ?? "") === "reprise_connexion") {
        const t = Date.parse(String(r.started_at ?? r.finished_at ?? ""));
        if (Number.isFinite(t)) e.reprises.push(t);
      }
      etatPar.set(uid, e);
    }
    const aReprendre = [...etatPar.entries()].filter(([, e]) =>
      e.mur && !e.actif && e.finished_at && Date.parse(e.finished_at) > (e.dernierDone || 0));
    if (aReprendre.length) {
      const ids = aReprendre.map(([uid]) => uid);
      const profsPar = new Map<string, { sessions: Record<string, unknown>; extVue: string | null; version: string | null }>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data: profs } = await supabase
          .from("profiles").select("id, extension_sessions, extension_last_seen_at, extension_version")
          .in("id", ids.slice(i, i + 200));
        // deno-lint-ignore no-explicit-any
        for (const p of ((profs ?? []) as any[])) {
          profsPar.set(String(p.id), {
            sessions: (p.extension_sessions ?? {}) as Record<string, unknown>,
            extVue: p.extension_last_seen_at ?? null,
            version: p.extension_version ?? null,
          });
        }
      }
      // Miroir de la garde SQL : une 0.4.x entretient le heartbeat sans savoir
      // lire un dressing — lui poser une demande la ferait dormir en file.
      const saitLire = (v: string | null) => {
        const p = String(v ?? "").trim().split(".").map((n) => Number.parseInt(n, 10) || 0);
        if (!String(v ?? "").trim()) return false;
        const min = [0, 5, 0];
        for (let i = 0; i < 3; i++) { if ((p[i] ?? 0) !== min[i]) return (p[i] ?? 0) > min[i]; }
        return true;
      };
      for (const [uid, e] of aReprendre) {
        const prof = profsPar.get(uid);
        if (!prof || !prof.extVue || !saitLire(prof.version)) continue;
        const s = prof.sessions ?? {};
        if (s.vinted !== true) continue;                       // pas connecté, ou inconnu
        const brut = (s.checked_at_par_plateforme as Record<string, string> | undefined)?.vinted
          ?? (s.checked_at as string | undefined) ?? null;
        const vu = brut ? Date.parse(brut) : NaN;
        if (!Number.isFinite(vu)) continue;
        if (maintenant - vu > (FRAICHEUR_SONDE_MS.vinted ?? 60 * 60_000)) continue;
        const arret = Date.parse(e.finished_at);
        if (!Number.isFinite(arret) || vu <= arret) continue;  // rien de neuf depuis le mur
        if (e.dernierDone && maintenant - e.dernierDone < 15 * 60_000) continue;   // cadence
        if (e.reprises.some((t) => t > e.dernierDone)) continue;                   // une par épisode
        try {
          const { data: pose } = await supabase
            .from("vinted_sync_runs")
            .insert({
              user_id: uid, kind: "dressing", status: "queued",
              declencheur: "reprise_connexion", queued_at: new Date().toISOString(),
            })
            .select("id");
          if (pose?.length) {
            dressingsRepris++;
            console.log(`[handler-watch] dressing de ${uid} : session Vinted revenue (sonde ${new Date(vu).toISOString()}) → remis en file`);
          }
        } catch (err) {
          // L'index unique (user_id, kind) where status in (queued,running) est
          // le juge en cas de course : son refus n'est pas une panne.
          console.log(`[handler-watch] dressing de ${uid} : déjà un run actif — ${(err as Error)?.message ?? err}`);
        }
      }
    }
  } catch (e) {
    console.error("[handler-watch] reprise du dressing après reconnexion:", (e as Error)?.message ?? e);
  }

  // ── LES LIGNES ORPHELINES D'UN RUN MORT (2026-09-19) ──────────────────────
  // Cas fondateur, ornellaracano le 19/09 : le run eBay de 09:11:34 écrit ses
  // lignes dans annonces_plateforme puis MEURT (« [watchdog] aucune
  // progression depuis 30 min », items_vus = 0, status 'expired'). Or c'est le
  // run qui appelle `rapprocher_releve` à sa CONCLUSION : un run mort ne le
  // fait jamais. La ligne 307186101770 est donc restée sans inventaire_id, ni
  // job_id, ni source — et l'app a proposé « Annonce à rattacher » pour une
  // annonce que NOUS avions publiée, dont nous connaissions l'identifiant.
  // Elle n'a été rattachée qu'au run suivant, à 10:14, une heure plus tard.
  //
  // AMPLEUR relevée le 19/09 sur tout le parc (annonces en ligne, non
  // ignorées, sans inventaire_id) : leboncoin 96 dont 1 rattachable par
  // identifiant, ebay 18 dont 0, beebs 5 dont 0, opla 1 dont 0. Un cas sur
  // 120 : c'est rare, et c'est précisément celui qu'on a vu.
  //
  // ⛔ ON NE REJOUE SURTOUT PAS `rapprocher_releve` SUR UN RUN MORT. Sa
  // dernière étape marque `disparu_le` sur tout ce que le run n'a pas vu, et
  // elle ne se retient que si l'erreur commence par « [incomplet] » — celle
  // d'un watchdog commence par « [watchdog] ». Sur un run à 0 article lu, ce
  // serait déclarer TOUT LE COMPTE disparu. C'est exactement la faute qu'on a
  // payée sur Leboncoin le 18/09, en pire.
  //
  // CE QU'ON FAIT DONC, ET RIEN D'AUTRE : le rapprochement PAR IDENTIFIANT,
  // le plus sûr qui soit — un job publié de ce compte, sur cette plateforme,
  // porte EXACTEMENT ce listing_id. Aucune disparition, aucun titre, aucun
  // prix, aucune heuristique. Et on ne touche PAS aux drapeaux du job
  // (`sale_signal`, `unavailable_since`) : la bande 'job' du moteur les
  // efface quand l'annonce est revue en ligne, ici on s'en abstient — effacer
  // une preuve de vente pour cause de rattachement serait le pire des
  // échanges.
  let orphelinesRattachees = 0;
  try {
    const { data: orphelines } = await supabase
      .from("annonces_plateforme")
      .select("id, user_id, platform, listing_id")
      .is("inventaire_id", null).is("ignoree_le", null).is("disparu_le", null)
      .not("listing_id", "is", null)
      .limit(300);
    // deno-lint-ignore no-explicit-any
    const lignesOrph = (orphelines ?? []) as any[];
    if (lignesOrph.length) {
      const ids = [...new Set(lignesOrph.map((a) => String(a.listing_id)))];
      // deno-lint-ignore no-explicit-any
      const jobs: any[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from("cross_post_jobs")
          .select("id, user_id, platform, platform_listing_id, inventaire_id")
          .eq("status", "published").not("inventaire_id", "is", null)
          .in("platform_listing_id", ids.slice(i, i + 100));
        // deno-lint-ignore no-explicit-any
        for (const j of (data ?? []) as any[]) jobs.push(j);
      }
      const parCle = new Map<string, { id: string; inventaire_id: number }>();
      for (const j of jobs) {
        const cle = `${j.user_id}|${j.platform}|${j.platform_listing_id}`;
        if (!parCle.has(cle)) parCle.set(cle, { id: String(j.id), inventaire_id: Number(j.inventaire_id) });
      }
      for (const a of lignesOrph) {
        const j = parCle.get(`${a.user_id}|${a.platform}|${a.listing_id}`);
        if (!j) continue;
        // Compare-and-swap : si le moteur l'a rattachée entre-temps, on passe.
        const { data: maj, error: aErr } = await supabase
          .from("annonces_plateforme")
          .update({ inventaire_id: j.inventaire_id, job_id: j.id, source_rapprochement: "job", updated_at: new Date().toISOString() })
          .eq("id", a.id).is("inventaire_id", null).select("id");
        if (aErr || !maj?.length) continue;
        await supabase.from("rapprochements").insert({
          user_id: a.user_id, annonce_id: a.id, inventaire_id: j.inventaire_id,
          decision: "attache", par: "job", score: 1,
          detail: { job_id: j.id, motif: "orpheline_run_mort", source: "handler-watch" },
        });
        orphelinesRattachees++;
        console.log(`[handler-watch] annonce ${a.platform}/${a.listing_id} rattachée par identifiant au job ${j.id} (run mort)`);
      }
    }
  } catch (e) {
    console.error("[handler-watch] rattachement des lignes orphelines:", (e as Error)?.message ?? e);
  }

  // ── UN DÉPÔT QUI N'AVANCE PLUS DOIT SE VOIR (2026-09-20) ─────────────────
  // 🚨 LE DÉFAUT : des jobs restent 'pending' pendant des SEMAINES sans que
  //    personne ne le sache. Relevé le 20/09 sur eBay : 9 jobs en attente
  //    depuis le 04, 05, 09, 11, 14, 15 et 18/09 — la plupart avec `error`
  //    VIDE et zéro tentative. Ils ne brûlent rien, ils ne disent rien, ils
  //    ne finissent jamais. Du point de vue du vendeur, l'annonce n'est ni
  //    partie ni en échec : elle a disparu.
  //    (Ce n'est pas propre à eBay — la garde balaie les cinq plateformes —
  //    mais c'est là qu'on l'a mesuré.)
  //
  // LA RÈGLE : un DÉPÔT resté 'pending' plus de PENDING_MUET_JOURS jours,
  // sans échéance à venir, passe en 'failed' avec un message qui dit que
  // ça vient de CHEZ NOUS. Le job redevient visible (pastille, modale,
  // « Relancer », et la sortie « Abandonner cette plateforme »), et le
  // trigger settle_reservation rend son quota — il était gelé pour rien.
  //
  // ⛔ JAMAIS UN RETRAIT : un delete qui n'a pas abouti doit continuer
  //    d'essayer — l'annonce est encore en ligne.
  // ⛔ JAMAIS UNE REPUBLICATION : elle a sa propre machine d'étapes, et
  //    l'arrêter au milieu perdrait l'annonce.
  // ⛔ JAMAIS UN JOB QUI A UNE ÉCHÉANCE À VENIR (next_action_after) : celui-là
  //    n'est pas muet, il attend son tour.
  // ⛔ JAMAIS 'processing' : un handler l'a peut-être en main.
  const PENDING_MUET_JOURS = 10;
  let pendingMuetsClos = 0;
  try {
    const limite = new Date(now - PENDING_MUET_JOURS * 24 * 3600 * 1000).toISOString();
    const { data: muets } = await supabase
      .from("cross_post_jobs")
      .select("id, platform, created_at, platform_fields")
      .eq("status", "pending")
      .eq("action", "publish")
      .lt("created_at", limite)
      .limit(200);
    for (const j of (muets ?? []) as Array<Record<string, unknown>>) {
      const pf = (j.platform_fields ?? {}) as Record<string, unknown>;
      const echeance = Date.parse(String(pf.next_action_after ?? ""));
      if (Number.isFinite(echeance) && echeance > now) continue;  // il attend son tour
      // ── LE COMPTEUR REPART À LA RELANCE (2026-09-20, passe 3) ────────────
      // 🚨 DÉFAUT DE CE BLOC MÊME, vu en s'en servant : il juge sur
      //    `created_at`. Un job de début septembre relancé aujourd'hui a
      //    toujours quinze jours d'âge — il était donc re-fermé au passage
      //    SUIVANT, trois minutes plus tard. Mesuré : sept dépôts muets
      //    relancés à la main sont tous revenus en `failed` immédiatement.
      //    Une relance ne pouvait PAS survivre à cette garde.
      // La fermeture précédente (`pending_muet_clos_le`) fait donc repartir
      // le compteur : un job relancé après une fermeture a de nouveau dix
      // jours complets pour aboutir.
      const ne = Date.parse(String(j.created_at));
      const clos = Date.parse(String(pf.pending_muet_clos_le ?? ""));
      const depuis = Number.isFinite(clos) ? Math.max(ne, clos) : ne;
      if (now - depuis < PENDING_MUET_JOURS * 24 * 3600 * 1000) continue;
      const jours = Math.floor((now - depuis) / 86400000);
      // ⛔ G11 : le message dit que ça vient de chez nous, n'accuse personne,
      //    ne donne pas de consigne et ne cite aucun chiffre.
      const msg =
        `Cette publication ${libellePlateforme(String(j.platform))} n'a pas pu être traitée de notre côté ` +
        "et elle est restée en attente trop longtemps. On l'arrête ici plutôt que de la laisser sans réponse. " +
        "Tu peux la relancer depuis la fiche de l'article.";
      const { error: fErr } = await supabase
        .from("cross_post_jobs")
        // ⛔ `cancelled`, plus jamais `failed` (2026-09-22) : même solde par
        //    trigger (release), mais l'écran dit « Arrêtée » en gris avec le
        //    bouton Relancer — et non « Pas partie » en rouge. Le message dit
        //    déjà que le défaut vient de chez nous.
        .update({
          status: "cancelled",
          error: msg,
          platform_fields: { ...pf, pending_muet_clos_le: new Date(now).toISOString(), pending_muet_jours: jours },
        })
        .eq("id", String(j.id))
        .eq("status", "pending");
      if (!fErr) {
        pendingMuetsClos++;
        console.log(`[handler-watch] job ${j.id} (${j.platform}/publish) : ${jours} j en pending sans échéance → cancelled (visible, quota rendu)`);
      }
    }
  } catch (e) {
    console.error("[handler-watch] dépôts muets:", (e as Error)?.message ?? e);
  }

  // ── LA PROMESSE « ELLE REPARTIRA TOUTE SEULE » EST TENUE (2026-09-20) ─────
  // 🚨 LE DÉFAUT, relevé le 20/09 : 21 republications Vinted attendent depuis
  //    le 06, 12, 16 et 18/09 — sur 4 comptes — avec ce message à l'écran :
  //    « Ta republication attend que Vinted soit rouvert […] la republication
  //    repartira toute seule dans les minutes qui suivent. »
  //    Vinted n'est pas en panne (platform_health.paused = false depuis le
  //    27/08), les annonces sont INTACTES (aucune n'a franchi l'étape de
  //    suppression, toutes ont encore leur listing_url) — et rien n'est
  //    reparti. Quatorze jours pour la plus ancienne.
  //
  // POURQUOI : la reprise automatique existe, mais elle vit ENTIÈREMENT dans
  // l'extension — elle se déclenche quand la sonde de sessions (10 min) revoit
  // Vinted vivant. Si l'extension est éteinte, si la sonde ne cible jamais
  // Vinted, ou si la session reste refusée, personne ne reprend la main. Et le
  // solde 72 h ne les atteint pas non plus : il ne compte que le temps
  // d'extension ACTIVE, à dessein (on ne punit pas une extension éteinte). Le
  // résultat est une ligne rouge sans fin, sous une phrase qui promet le
  // contraire.
  //
  // LA RÈGLE : passé SESSION_ATTENTE_JOURS, le SERVEUR re-pend le job UNE
  // SEULE FOIS. Trois issues, toutes meilleures que l'attente éternelle :
  // la republication part ; ou la capture échoue encore et le job retourne
  // en needs_user par la même porte (rien n'est touché, l'annonce est
  // intacte) ; ou l'extension est éteinte et le balayage des dépôts muets
  // ci-dessus le clôt proprement, visible, quota rendu.
  //
  // ⛔ UNE SEULE FOIS PAR JOB : le marqueur `reprise_session_serveur_le` vit
  //    dans platform_fields, que l'extension relit-modifie-réécrit (elle ne
  //    remplace jamais l'objet par un neuf) — il survit donc à une nouvelle
  //    pause. Sans lui, ce bloc re-pendrait toutes les trois minutes.
  // ⛔ JAMAIS UN JOB QUI A DÉJÀ SUPPRIMÉ (`republish_step === 'deleted'`) :
  //    celui-là est au milieu du gué, il a sa propre machine d'étapes.
  // ⛔ JAMAIS SI VINTED EST EN PAUSE : on ne relance pas vers une plateforme
  //    qu'on vient de déclarer fermée.
  // ⛔ AUCUN DÉBIT : needs_user → pending ne tire aucun trigger de solde
  //    (ils ne tirent que sur les statuts terminaux), et le job repart TEL
  //    QUEL, avec sa réservation d'origine.
  const SESSION_ATTENTE_JOURS = 3;
  let repriseSessionServeur = 0;
  try {
    const { data: sante } = await supabase
      .from("platform_health").select("paused").eq("platform", "vinted").maybeSingle();
    if (!(sante as { paused?: boolean } | null)?.paused) {
      const limite = new Date(now - SESSION_ATTENTE_JOURS * 24 * 3600 * 1000).toISOString();
      const { data: enPanne } = await supabase
        .from("cross_post_jobs")
        .select("id, created_at, listing_url, platform_fields")
        .eq("status", "needs_user")
        .eq("action", "republish")
        .eq("platform", "vinted")
        .lt("created_at", limite)
        .limit(200);
      for (const j of (enPanne ?? []) as Array<Record<string, unknown>>) {
        const pf = (j.platform_fields ?? {}) as Record<string, unknown>;
        if (pf.needs_user_source !== "session_vinted") continue;
        if (pf.republish_step === "deleted") continue;       // au milieu du gué
        if (pf.reprise_session_serveur_le) continue;         // déjà servi une fois
        if (!j.listing_url) continue;                        // rien à republier
        const jours = Math.floor((now - Date.parse(String(j.created_at))) / 86400000);
        const { error: rErr } = await supabase
          .from("cross_post_jobs")
          .update({
            status: "pending",
            error: null,
            platform_fields: { ...pf, reprise_session_serveur_le: new Date(now).toISOString(), reprise_session_serveur_jours: jours },
          })
          .eq("id", String(j.id))
          .eq("status", "needs_user");
        if (!rErr) {
          repriseSessionServeur++;
          console.log(`[handler-watch] job ${j.id} (vinted/republish) : ${jours} j en attente de session → re-pendu UNE fois par le serveur`);
        }
      }
    }
  } catch (e) {
    console.error("[handler-watch] reprise des republications en attente de session:", (e as Error)?.message ?? e);
  }

  // ── UNE CAPTURE FRAÎCHE ET VALIDE RÉVEILLE LE JOB (2026-09-20, passe 3) ──
  // 🚨 LE GASPILLAGE, mesuré le 20/09 : 12 republications Vinted sont figées
  //    en `needs_user` à l'étape `captured` sur 6 comptes — et 21 captures
  //    ont été refaites APRÈS leur gel, TOUTES avec le verdict `valide` et
  //    zéro champ manquant. Vingt et une captures pour rien. Sur la seule
  //    « Blouse Caroll » de laforge.vinted : cinq captures entre 15:14 et
  //    16:33, toutes valides, quatre photos, et le job n'a pas bougé d'un
  //    pouce depuis 08:08. C'est du travail pris sur le poste de la
  //    personne, sans le moindre effet.
  //
  // LE CHOIX : on ne coupe PAS la recapture, on la fait SERVIR. Couper la
  // laisserait le job figé pour toujours (rien d'autre ne le réveille) et
  // perdrait la fraîcheur qui le rend justement publiable. Or `capture_id`
  // est DÉJÀ mis à jour sur le job à chaque passage — la donnée neuve est
  // là, personne ne s'en servait.
  //
  // UNE CAPTURE `valide` AVEC ZÉRO CHAMP MANQUANT EST LA PREUVE QUE LA CAUSE
  // DU GEL A DISPARU : c'est exactement ce que le gel attendait.
  //
  // ⛔ JAMAIS UNE GARDE VOLONTAIRE : `livres_isbn_garde` et
  //    `republish_couleur_garde` ont leur propre porte de sortie, plus haut,
  //    et elles ont raison de retenir. On ne passe pas devant.
  // ⛔ JAMAIS AU-DELÀ DE `captured` : à `deleted`, l'annonce d'origine
  //    n'existe plus, la machine d'étapes a la main et on ne s'en mêle pas.
  // ⛔ JAMAIS UN ARTICLE VENDU OU DISPARU : republier ce qui n'est plus à
  //    vendre, c'est recréer une annonce fantôme.
  // ⛔ UNE FOIS PAR CAPTURE : le marqueur `reveille_par_capture` porte l'id
  //    de la capture qui a servi. Une capture ne réveille qu'une fois ; une
  //    capture NEUVE, elle, a le droit de réessayer — c'est une information
  //    nouvelle, pas une boucle.
  const CAPTURE_REVEIL_MAX = 100;
  let capturesReveil = 0;
  try {
    const { data: figes } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, inventaire_id, created_at, platform_fields")
      .eq("status", "needs_user")
      .eq("action", "republish")
      .eq("platform", "vinted")
      .limit(CAPTURE_REVEIL_MAX);
    for (const j of (figes ?? []) as Array<Record<string, unknown>>) {
      const pf = (j.platform_fields ?? {}) as Record<string, unknown>;
      if (pf.republish_step !== "captured") continue;
      const source = String(pf.needs_user_source ?? "");
      if (source === "livres_isbn_garde" || source === "republish_couleur_garde") continue;
      if (!j.inventaire_id) continue;
      // L'article est-il encore à vendre ? On ne republie que du stock vivant.
      const { data: art } = await supabase
        .from("inventaire").select("statut, disparu_le, fusionne_dans")
        .eq("id", j.inventaire_id).maybeSingle();
      const a = art as { statut?: string; disparu_le?: string | null; fusionne_dans?: number | null } | null;
      if (!a || a.statut !== "stock" || a.disparu_le || a.fusionne_dans) continue;
      // La capture la plus fraîche POSTÉRIEURE au gel, et seulement si elle
      // est valide et complète.
      const { data: caps } = await supabase
        .from("vinted_republish_captures")
        .select("id, verdict, champs_manquants, captured_at")
        .eq("inventaire_id", j.inventaire_id)
        .gt("captured_at", String(j.created_at))
        .order("captured_at", { ascending: false })
        .limit(1);
      const c = ((caps ?? []) as Array<Record<string, unknown>>)[0];
      if (!c || c.verdict !== "valide") continue;
      const manquants = (c.champs_manquants ?? []) as unknown[];
      if (Array.isArray(manquants) && manquants.length) continue;
      if (String(pf.reveille_par_capture ?? "") === String(c.id)) continue;  // déjà servi
      const { error: rErr } = await supabase
        .from("cross_post_jobs")
        .update({
          status: "pending",
          error: null,
          platform_fields: {
            ...pf,
            capture_id: String(c.id),
            reveille_par_capture: String(c.id),
            reveille_par_capture_le: new Date(now).toISOString(),
          },
        })
        .eq("id", String(j.id))
        .eq("status", "needs_user");
      if (!rErr) {
        capturesReveil++;
        console.log(`[handler-watch] job ${j.id} (vinted/republish) : capture ${c.id} valide et complète → re-pendu (le gel n'a plus d'objet)`);
      }
    }
  } catch (e) {
    console.error("[handler-watch] réveil par capture fraîche:", (e as Error)?.message ?? e);
  }

  // ── Déblocage AUTO de la garde Livres (2026-08-27 soir, décision Nico) ────
  // Les jobs pausés par la garde Livres/ISBN (needs_user_source=
  // 'livres_isbn_garde') repassent en 'pending' TOUT SEULS dès que leur
  // compte remplit les DEUX conditions de l'exemption 0.6.9 posée dans
  // update-job-status :
  //   · profiles.extension_build ≥ 0.6.9 — comparé sur le PRÉFIXE HORODATÉ
  //     du BUILD_ID (ISO triable), jamais sur la chaîne de version. Ici
  //     c'est bien le PROFIL qui est lu : le handler_build du job bloqué est
  //     celui du VIEUX build qui s'est fait pauser — la question est « ce
  //     compte est-il passé en 0.6.9 ? » ;
  //   · ET le snapshot CONSERVÉ sur le job porte un ISBN valide (même
  //     validation que l'exemption — un livre sans ISBN reste bloqué, quel
  //     que soit le build : les 2 jobs pausés à la main du 22/08, sans
  //     snapshot, ne sont jamais repris).
  // POURQUOI LE CRON (et pas un trigger ni la distribution) : ce balayage
  // 3 min vit déjà ici (orphelines, processing abandonnés, 72 h, photos) —
  // zéro migration, zéro CWS, observable dans la réponse. Un trigger sur
  // profiles tirerait à CHAQUE heartbeat d'extension (toutes les quelques
  // minutes par compte) et logerait la validation ISBN en PL/pgSQL — une
  // migration de plus sur un historique déjà divergent ; et get-pending-jobs
  // ne distribue que 'pending' : les needs_user ne passent jamais par lui.
  // Étape 'deleted' EXCLUE (garde-fou : ce chantier n'y touche pas). Aucune
  // unité re-débitée : le job repart tel quel, pepite_remboursee en poche
  // (aucun débit n'existe sur pending, le débit vit à la création du job).
  // Le passage en pending EFFACE l'erreur et retire needs_user_source ; au
  // tour suivant l'extension 0.6.9 recapture/ré-écrit le snapshot, et c'est
  // l'EXEMPTION côté update-job-status qui la laisse passer — si le compte
  // rétrograde ou si le nouveau snapshot perd l'ISBN, la garde re-pause :
  // rien n'est contourné, le kill switch reste hors sujet ici.
  // Écritures en compare-and-swap (.eq status needs_user). Best-effort.
  const LIVRES_EXEMPTION_MIN_BUILD_MS = Date.parse("2026-08-31T19:33:14Z"); // BUILD_ID 0.6.14 (79f1c08)
  const buildMsOf = (hb: unknown): number => {
    const m = String(hb ?? "").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
    return m ? Date.parse(m[1]) : NaN;
  };
  const isbnValide = (brut: unknown): boolean => {
    const s = String(brut ?? "").replace(/[\s-]/g, "").toUpperCase();
    if (/^\d{13}$/.test(s)) {
      let somme = 0;
      for (let i = 0; i < 12; i++) somme += (i % 2 ? 3 : 1) * Number(s[i]);
      return String((10 - (somme % 10)) % 10) === s[12];
    }
    if (/^\d{9}[\dX]$/.test(s)) {
      let somme = 0;
      for (let i = 0; i < 10; i++) somme += (10 - i) * (s[i] === "X" ? 10 : Number(s[i]));
      return somme % 11 === 0;
    }
    return false;
  };
  let livresDebloques = 0;
  try {
    // ── INTERRUPTEUR de l'exemption Livres (2026-08-28, GO Nico — même clé
    // que update-job-status) : coin_config 'republish_livres_exemption',
    // value=1 = exemption active ; clé ABSENTE, illisible ou autre valeur =
    // DÉSARMÉE → ce déblocage ne re-libère RIEN (fail-safe : re-pendre un
    // livre l'enverrait vers le mur « suppression puis 400 ISBN » — cas
    // Joe0410 a25d171b du 28/08, gate stricte passée et Vinted refuse quand
    // même à la soumission). Sans cette lecture ici, désarmer côté
    // update-job-status ferait boucler le cron : re-pend → claim → garde
    // re-pause, toutes les 3 minutes.
    const { data: cfgExo } = await supabase
      .from("coin_config").select("value").eq("key", "republish_livres_exemption").maybeSingle();
    const exemptionArmee = Number((cfgExo as Record<string, unknown> | null)?.value) === 1;
    const { data: bloques } = !exemptionArmee ? { data: [] } : await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform_fields, error")
      .eq("status", "needs_user")
      .eq("action", "republish")
      .eq("platform", "vinted")
      .filter("platform_fields->>needs_user_source", "eq", "livres_isbn_garde");
    // deno-lint-ignore no-explicit-any
    const candidats = ((bloques ?? []) as any[]).filter((j) =>
      j.platform_fields?.republish_step === "captured" &&
      !j.platform_fields?.deleted_at &&
      isbnValide(j.platform_fields?.republish_snapshot?.isbn));
    if (candidats.length) {
      const userIds = [...new Set(candidats.map((j) => j.user_id as string))];
      const { data: profs } = await supabase
        .from("profiles").select("id, extension_build").in("id", userIds);
      // deno-lint-ignore no-explicit-any
      const buildOk = new Map(((profs ?? []) as any[]).map((p) => {
        const ms = buildMsOf(p.extension_build);
        return [p.id, Number.isFinite(ms) && ms >= LIVRES_EXEMPTION_MIN_BUILD_MS];
      }));
      for (const j of candidats) {
        if (!buildOk.get(j.user_id)) continue;
        const pf = { ...(j.platform_fields ?? {}) };
        delete pf.needs_user_source; // le job n'attend plus personne
        // Le motif de l'arrêt est archivé avant d'être effacé (2026-09-12).
        pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, j.error, "needs_user", "handler-watch (levée de la garde Livres ISBN)");
        const { data: maj } = await supabase
          .from("cross_post_jobs")
          .update({ status: "pending", error: null, platform_fields: pf })
          .eq("id", j.id)
          .eq("status", "needs_user")
          .select("id");
        if (maj?.length) {
          livresDebloques++;
          console.log(`[handler-watch] job ${j.id} : garde Livres levée pour ce compte (build ≥ 0.6.9 + ISBN valide) → pending`);
        }
      }
    }
  } catch (e) {
    console.error("[handler-watch] déblocage garde Livres:", (e as Error)?.message ?? e);
  }

  // ── Déblocage AUTO de la garde Couleur (2026-08-29, décision Nico — même
  // traitement que la garde Livres, modèle 1e9a3d3) ─────────────────────────
  // Les jobs pausés par la garde Couleur (needs_user_source=
  // 'republish_couleur_garde') repassent en 'pending' TOUT SEULS dès que
  // profiles.extension_build ≥ 0.6.9 — le fix couleur (daae23d, 0.6.8 puis
  // 0.6.9) lit la palette réelle du picker, remplit depuis le titre, et a son
  // propre filet (champ absent → no-op ; non remplissable → needs_user AVANT
  // suppression via prevol_negatif). Même comparaison sur le PRÉFIXE HORODATÉ
  // du BUILD_ID, jamais la chaîne de version. Ici c'est bien le PROFIL qui
  // est lu : le handler_build du job bloqué est celui du vieux build qui
  // s'est fait pauser — la question est « ce compte est-il passé en 0.6.9 ? ».
  // PAS de condition supplémentaire (l'équivalent de l'ISBN n'existe pas :
  // c'est justement l'ABSENCE de couleur qui définit le cas) et PAS
  // d'interrupteur d'exemption dédié (modèle 1e9a3d3 d'origine — celui des
  // Livres est né le 28/08 d'un contre-cas réel, Fairy tail ; aucun
  // équivalent couleur connu). Étape 'deleted' EXCLUE. platform_fields
  // CONSERVÉS (pepite_remboursee en poche : aucun re-débit) ; le marqueur
  // retiré est needs_user_source, l'horodatage republish_couleur_bloque_le
  // reste comme trace. Au retour en pending, l'extension ré-écrit le
  // snapshot et c'est l'EXEMPTION côté update-job-status qui tranche — un
  // compte rétrogradé re-pause aussitôt (et le trio garde/kill switch reste
  // intact pour les builds < 0.6.9). Compare-and-swap, best-effort.
  const COULEUR_EXEMPTION_MIN_BUILD_MS = Date.parse("2026-08-26T19:48:07Z"); // BUILD_ID 0.6.9 (7a88eb6)
  let couleurDebloques = 0;
  try {
    const { data: bloquesCouleur } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform_fields, error")
      .eq("status", "needs_user")
      .eq("action", "republish")
      .eq("platform", "vinted")
      .filter("platform_fields->>needs_user_source", "eq", "republish_couleur_garde");
    // deno-lint-ignore no-explicit-any
    const candidatsCouleur = ((bloquesCouleur ?? []) as any[]).filter((j) =>
      j.platform_fields?.republish_step === "captured" &&
      !j.platform_fields?.deleted_at);
    if (candidatsCouleur.length) {
      const userIds = [...new Set(candidatsCouleur.map((j) => j.user_id as string))];
      const { data: profs } = await supabase
        .from("profiles").select("id, extension_build").in("id", userIds);
      // deno-lint-ignore no-explicit-any
      const buildOk = new Map(((profs ?? []) as any[]).map((p) => {
        const ms = buildMsOf(p.extension_build);
        return [p.id, Number.isFinite(ms) && ms >= COULEUR_EXEMPTION_MIN_BUILD_MS];
      }));
      for (const j of candidatsCouleur) {
        if (!buildOk.get(j.user_id)) continue;
        const pf = { ...(j.platform_fields ?? {}) };
        delete pf.needs_user_source; // le job n'attend plus personne
        // Le motif de l'arrêt est archivé avant d'être effacé (2026-09-12).
        pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, j.error, "needs_user", "handler-watch (levée de la garde Couleur)");
        const { data: maj } = await supabase
          .from("cross_post_jobs")
          .update({ status: "pending", error: null, platform_fields: pf })
          .eq("id", j.id)
          .eq("status", "needs_user")
          .select("id");
        if (maj?.length) {
          couleurDebloques++;
          console.log(`[handler-watch] job ${j.id} : garde Couleur levée pour ce compte (build ≥ 0.6.9) → pending`);
        }
      }
    }
  } catch (e) {
    console.error("[handler-watch] déblocage garde Couleur:", (e as Error)?.message ?? e);
  }

  // ── Photos encore HORS FillSell au moment de publier (2026-08-27) ─────────
  // ⚠️ 19/09 : ce filet ne connaissait que le CDN VINTED. Un article importé
  // d'un relevé Beebs/Leboncoin/Opla/eBay garde les URLs de SA plateforme —
  // il passait donc à travers les deux mailles. Cas réel : compte Amiral,
  // 7 photos sur cdn.beebs.app, job leboncoin 14052f3e 'failed' et job opla
  // 4de01b3d qui rejouait « photo 1 illisible (Failed to fetch) » toutes les
  // 5 min. Mesuré le même jour : cdn.beebs.app ne sert AUCUN en-tête CORS
  // (l'image se charge en <img> mais `fetch()` la refuse), alors que
  // img.leboncoin.fr, i.ebayimg.com et le CloudFront d'Opla l'acceptent
  // aujourd'hui — « aujourd'hui » étant justement ce qui vient de changer
  // chez Beebs. Le filet couvre donc les CINQ sources d'import
  // (estCdnPlateforme, _shared/photos-rapatriement.ts), pas la seule qui
  // refuse à cette heure.
  // Cas d'origine : job leboncoin 94cbe6d9 (« Plateau vintage », Sandrine) —
  // generate-listing avait rapatrié 7 photos sur 8 (HTTP 520 Storage
  // transitoire, une seule tentative, `continue` silencieux), la restante sur
  // images1.vinted.net a fait échouer la publication sur la page de dépôt
  // (CORS de la page hôte, urlToFile). Filet SERVEUR, deux mailles :
  //   - jobs publish 'pending' : rapatrier AVANT que l'extension ne les prenne
  //     (utile surtout quand elle est hors ligne au moment du clic) ;
  //   - jobs publish 'failed' < 7 j portant la signature « hors FillSell »
  //     (message urlToFile des content scripts) : rapatrier PUIS ré-armer en
  //     'pending' quand TOUTES les photos sont à nous — JAMAIS de regénération
  //     demandée à l'utilisateur (6 unités pour notre bug). Les triggers de
  //     solde sont idempotents par reservation_settled_at : un ré-armement ne
  //     re-débite ni ne re-rembourse rien.
  // BORNÉ à 2 balayages par job (platform_fields.photo_rehost_sweeps) : une
  // URL CDN morte (annonce Vinted supprimée) ne boucle pas. inventaire.photos
  // est réaligné URL par URL (strings nues ET objets {type,url}, structure
  // préservée) — on ne touche à AUCUNE autre annonce, jamais aux publiées.
  // Écritures en compare-and-swap sur le statut lu + .select() : si
  // l'extension a pris le job entre-temps, on n'écrase rien (le job refera
  // surface en 'failed' au tour suivant). Best-effort intégral.
  let photosJobsRapatries = 0;
  let photosJobsRearmes = 0;
  try {
    const seuil7jIso = new Date(now - 7 * 24 * 3600_000).toISOString();
    const [{ data: enAttente }, { data: rates }] = await Promise.all([
      supabase
        .from("cross_post_jobs")
        .select("id, user_id, inventaire_id, status, photos, platform_fields")
        // 19/09 : 'republish' était absent — un redépôt repart des photos du
        // job SOURCE, donc des mêmes URLs de plateforme, et n'avait aucun filet.
        .in("action", ["publish", "republish"])
        .eq("status", "pending"),
      supabase
        .from("cross_post_jobs")
        .select("id, user_id, inventaire_id, status, photos, platform_fields")
        .in("action", ["publish", "republish"])
        .eq("status", "failed")
        .gte("created_at", seuil7jIso)
        .ilike("error", "%hors FillSell%"),
    ]);
    // deno-lint-ignore no-explicit-any
    const candidats = ([...(enAttente ?? []), ...(rates ?? [])] as any[])
      .filter((j) => Array.isArray(j.photos) && (j.photos as unknown[]).some((p) => estCdnPlateforme(urlDePhoto(p))));
    for (const j of candidats) {
      const pf = { ...(j.platform_fields ?? {}) };
      const balayages = Number(pf.photo_rehost_sweeps ?? 0);
      if (!Number.isFinite(balayages) || balayages >= 2) continue;
      pf.photo_rehost_sweeps = balayages + 1;
      const externes = [...new Set((j.photos as unknown[]).map(urlDePhoto).filter(estCdnPlateforme))] as string[];
      const remplacements = new Map<string, string>();
      for (let i = 0; i < externes.length; i++) {
        const nv = await rapatriePhoto(
          supabase,
          externes[i],
          `${j.user_id}/rehosted/${j.inventaire_id ?? "job"}/${now}_watch_${i}`,
        );
        if (nv) remplacements.set(externes[i], nv);
      }
      // deno-lint-ignore no-explicit-any
      const maj = (p: any) => {
        const u = urlDePhoto(p);
        const nv = u ? remplacements.get(u) : undefined;
        if (!nv) return p;
        return typeof p === "string" ? nv : { ...p, url: nv };
      };
      const complet = externes.length > 0 && remplacements.size === externes.length;
      // deno-lint-ignore no-explicit-any
      const patch: any = { photos: (j.photos as unknown[]).map(maj), platform_fields: pf };
      if (j.status === "failed" && complet) {
        patch.status = "pending";
        patch.error =
          "Reprise automatique : une photo de l'annonce était restée hébergée hors FillSell " +
          "(article importé d'une autre plateforme). Elle a été rapatriée et la publication repart toute seule — rien à faire.";
      }
      const { data: majJob, error: upJobErr } = await supabase
        .from("cross_post_jobs")
        .update(patch)
        .eq("id", j.id)
        .eq("status", j.status)
        .select("id");
      if (upJobErr) {
        console.error(`[handler-watch] job ${j.id}: photos rapatriées mais update refusé — ${upJobErr.message}`);
      } else if (!majJob?.length) {
        console.log(`[handler-watch] job ${j.id}: statut changé entre-temps, rien écrit (tour suivant)`);
      } else {
        photosJobsRapatries++;
        if (patch.status === "pending") {
          photosJobsRearmes++;
          console.log(`[handler-watch] job ${j.id}: photo(s) CDN rapatriée(s), failed → pending (sans regénération)`);
        }
      }
      // Réalignement inventaire.photos, URL par URL (mêmes règles que
      // generate-listing) — même si le job n'a pas pu être écrit : la copie
      // est faite, autant que la fiche pointe chez nous.
      if (remplacements.size && j.inventaire_id) {
        const { data: ligne } = await supabase
          .from("inventaire")
          .select("photos")
          .eq("id", j.inventaire_id)
          .eq("user_id", j.user_id)
          .maybeSingle();
        if (Array.isArray(ligne?.photos)) {
          const nouvelles = (ligne.photos as unknown[]).map(maj);
          if (JSON.stringify(nouvelles) !== JSON.stringify(ligne.photos)) {
            const { error: invErr } = await supabase
              .from("inventaire")
              .update({ photos: nouvelles })
              .eq("id", j.inventaire_id)
              .eq("user_id", j.user_id);
            if (invErr) console.error(`[handler-watch] inventaire ${j.inventaire_id} non réaligné — ${invErr.message}`);
          }
        }
      }
    }
  } catch (e) {
    console.error("[handler-watch] rapatriement photos hors FillSell:", (e as Error)?.message ?? e);
  }

  // ── Photos des articles IMPORTÉS, ramenées chez nous (2026-09-19) ─────────
  // Le filet du dessus répare un job. Celui-ci répare la FICHE, et c'est ce
  // qui rend la photo réutilisable partout : publication, republication,
  // export, et tout ce qui viendra.
  //
  // Pourquoi il a fallu l'écrire. Un article importé d'un relevé garde les
  // URLs de sa plateforme. Mesuré le 19/09 depuis une origine tierce :
  // cdn.beebs.app ne sert AUCUN en-tête CORS — l'image se charge en <img>,
  // `fetch()` la refuse. Une photo Beebs n'est donc lisible par AUCUNE page de
  // dépôt : ni Leboncoin, ni Opla, ni eBay. Elle n'est pas « à nous » au sens
  // où on pourrait s'en servir ; elle est regardable, pas réutilisable.
  //
  // Périmètre, et pourquoi il s'arrête là : 135 articles dans tout le parc
  // (72 releve_leboncoin, 45 releve_beebs, 13 releve_ebay, 1 releve_opla),
  // soit 516 photos. Vinted est EXCLU — 313 493 photos, décision du 06/09,
  // affaire de volume et pas de principe (estCdnPlateformeHorsVinted).
  //
  // Bornes : on plafonne en PHOTOS et pas en articles (un article à 20 photos
  // ne doit pas manger le cycle de 3 min), une photo qui échoue garde son URL
  // d'origine et repassera au tour suivant, et on n'écrit que si quelque
  // chose a changé. Best-effort intégral : ce bloc ne fait jamais tomber le
  // reste de handler-watch.
  //
  // ── DEUX ÉTAGES DEPUIS LE 19/09 SOIR — une FILE, puis un filet ───────────
  // Le balayage par origine avait deux défauts qu'on a nommés avant de les
  // corriger : une FENÊTRE DE 3 MIN entre l'import et la réparation (publier
  // pendant ce temps-là partait avec des URL illisibles), et un PLAFOND de
  // 500 lignes sans tri, donc une famine silencieuse au-delà.
  //   1. LA FILE : l'import pose lui-même `inventaire.photos_a_rapatrier`
  //      (rapprocher_importer). On lit la file, on sert, on en sort. Plus de
  //      recherche, plus de plafond, et la fenêtre tombe au prochain cycle.
  //   2. LE FILET : l'ancien balayage, gardé pour l'ARRIÉRÉ (aucun backfill —
  //      une fiche existante n'est pas réécrite pour entrer dans la file) et
  //      pour les photos qui ont résisté à l'étage 1.
  // Les deux partagent UN budget : la file est servie d'abord.
  const PHOTOS_FICHES_MAX = 24;
  const FILE_FICHES_MAX = 60;
  let photosFichesRapatriees = 0;
  let fichesPhotosMaj = 0;
  let fichesFileSorties = 0;
  try {
    let budget = PHOTOS_FICHES_MAX;
    // Le traitement d'UNE fiche. Rend true si au moins une photo a changé de
    // maison. Commun à la file et au filet : deux copies dériveraient, on sait
    // maintenant à quoi ça ressemble.
    // deno-lint-ignore no-explicit-any
    const rapatrieUneFiche = async (f: any): Promise<boolean> => {
      if (!Array.isArray(f.photos)) return false;
      const externes = [...new Set((f.photos as unknown[]).map(urlDePhoto).filter(estCdnPlateformeHorsVinted))] as string[];
      if (!externes.length) return false;
      const remplacements = new Map<string, string>();
      for (const src of externes) {
        if (budget <= 0) break;
        budget--;
        const nv = await rapatriePhoto(supabase, src, `${f.user_id}/rapatrie-fiche/${f.id}/${now}_${remplacements.size}`);
        if (nv) remplacements.set(src, nv);
      }
      if (!remplacements.size) return false;
      // Même réalignement URL par URL qu'ailleurs : strings nues ET objets
      // {type,url} coexistent en base, la structure est PRÉSERVÉE.
      // deno-lint-ignore no-explicit-any
      const nouvelles = (f.photos as unknown[]).map((p: any) => {
        const u = urlDePhoto(p);
        const nv = u ? remplacements.get(u) : undefined;
        if (!nv) return p;
        return typeof p === "string" ? nv : { ...p, url: nv };
      });
      if (JSON.stringify(nouvelles) === JSON.stringify(f.photos)) return false;
      const { error: majErr } = await supabase
        .from("inventaire")
        .update({ photos: nouvelles })
        .eq("id", f.id)
        .eq("user_id", f.user_id);
      if (majErr) {
        console.error(`[handler-watch] fiche ${f.id}: photos rapatriées mais update refusé — ${majErr.message}`);
        return false;
      }
      photosFichesRapatriees += remplacements.size;
      fichesPhotosMaj++;
      console.log(`[handler-watch] fiche ${f.id}: ${remplacements.size} photo(s) ramenée(s) chez nous`);
      return true;
    };

    // ── 1. LA FILE — les fiches que l'import a marquées lui-même ────────────
    // `inventaire.photos_a_rapatrier` est posé par rapprocher_importer, le
    // SEUL point d'écriture d'un article importé (vérifié en prod : deux
    // fonctions contiennent un INSERT INTO inventaire, celle-ci et la fusion).
    // Le drapeau dit « pas encore EXAMINÉE », pas « photo étrangère » : la
    // liste des hôtes reste ici et ici seulement.
    //
    // ⛔ ON SORT DE LA FILE DANS TOUS LES CAS, même quand rien n'a pu être
    // rapatrié. Une URL morte laisserait sinon sa fiche en tête de file pour
    // toujours et mangerait le budget de tous les cycles suivants — la file
    // affamerait ce qu'elle est censée servir. Ce qui a échoué retombe sur le
    // filet du 2., qui repasse sans se lasser.
    const { data: file, error: fileErr } = await supabase
      .from("inventaire")
      .select("id, user_id, photos")
      .eq("photos_a_rapatrier", true)
      .order("id", { ascending: true })
      .limit(FILE_FICHES_MAX);
    if (fileErr) {
      // Colonne absente (migration pas encore appliquée) : on le dit une fois
      // par cycle et le filet fait le travail, comme avant.
      console.error(`[handler-watch] file photos: lecture impossible — ${fileErr.message}`);
    }
    for (const f of (file ?? [])) {
      if (budget > 0) await rapatrieUneFiche(f);
      const { error: sortieErr } = await supabase
        .from("inventaire")
        .update({ photos_a_rapatrier: false })
        .eq("id", f.id)
        .eq("user_id", f.user_id);
      if (sortieErr) {
        console.error(`[handler-watch] fiche ${f.id}: sortie de file refusée — ${sortieErr.message}`);
      } else {
        fichesFileSorties++;
      }
      if (budget <= 0) break;
    }

    // ── 2. LE FILET — l'arriéré d'avant la file, et les échecs du 1. ────────
    // Balayage par origine, hérité du 19/09 après-midi. Il ne sert plus qu'à
    // ça : les fiches importées AVANT que la file n'existe (aucun backfill,
    // décision de Nico : on ne réécrit pas une fiche existante pour la faire
    // entrer dans la file), et celles dont une photo a résisté au 1.
    // ⚠️ Son `.limit(500)` SANS tri est un plafond connu : au-delà de 500
    // articles `releve_*` dans le parc, les lignes 501+ ne seraient jamais
    // vues. C'est précisément ce que la file supprime pour les NOUVEAUX
    // imports ; ce reliquat est à retirer quand l'arriéré sera vide.
    if (budget > 0) {
      const { data: fiches } = await supabase
        .from("inventaire")
        .select("id, user_id, photos")
        .in("origine", ["releve_leboncoin", "releve_beebs", "releve_ebay", "releve_opla"])
        .limit(500);
      for (const f of (fiches ?? [])) {
        if (budget <= 0) break;
        await rapatrieUneFiche(f);
      }
    }
  } catch (e) {
    console.error("[handler-watch] rapatriement photos des fiches importées:", (e as Error)?.message ?? e);
  }

  // Regroupement par (plateforme, signature) en excluant les refus légitimes.
  type Cluster = {
    platform: string;
    signature: string;
    jobs: Job[];
    users: Set<string>;
    broken: boolean;
    antibot: boolean;
  };
  const clusters = new Map<string, Cluster>();
  for (const j of jobs) {
    const err = (j.error ?? "").toLowerCase();
    if (!err || hasMarker(err, LEGIT_MARKERS)) continue; // filet qui marche
    const sig = signatureOf(j.error ?? "");
    if (!sig) continue;
    const key = `${j.platform}::${sig}`;
    let c = clusters.get(key);
    if (!c) {
      c = { platform: j.platform, signature: sig, jobs: [], users: new Set(), broken: hasMarker(err, BROKEN_MARKERS), antibot: hasMarker(err, ANTIBOT_MARKERS) };
      clusters.set(key, c);
    }
    c.jobs.push(j);
    c.users.add(j.user_id);
    c.broken = c.broken || hasMarker(err, BROKEN_MARKERS);
    c.antibot = c.antibot || hasMarker(err, ANTIBOT_MARKERS);
  }

  // Application des seuils S1 / S2 / S3.
  const alerts: Array<Cluster & { severity: string }> = [];
  for (const c of clusters.values()) {
    let severity: string | null = null;
    if (c.antibot) severity = "S3";
    else if (c.jobs.length >= CROSS_MIN && c.users.size >= MULTI_USER_MIN) severity = "S1";
    else if (c.broken && c.jobs.length >= BROKEN_MIN) severity = "S2";
    if (severity) alerts.push({ ...c, severity });
  }

  if (alerts.length === 0) {
    return new Response(JSON.stringify({ ok: true, clean: true, scanned: jobs.length, orphelins_alertes: orphelinsAlertes, processing_rearmes: processingRearmes, deleted_rearmes: deletedRearmes, captured_rearmes: capturedRearmes, etats_repares: etatsRepares, processing_needs_user: processingNeedsUser, needs_user_vus: needsUserVus, needs_user_soldes: needsUserSoldes, needs_user_ticks: needsUserTicks, opla_acces_reprises: oplaReprises, opla_acces_messages: oplaMessages, reprises_connexion: reprisesConnexion, attentes_session_levees: attentesLevees, releves_repris: relevesRepris, dressings_repris: dressingsRepris, orphelines_rattachees: orphelinesRattachees, livres_debloques: livresDebloques, couleur_debloques: couleurDebloques, photos_jobs_rapatries: photosJobsRapatries, photos_jobs_rearmes: photosJobsRearmes, photos_fiches_rapatriees: photosFichesRapatriees, fiches_photos_maj: fichesPhotosMaj, fiches_file_sorties: fichesFileSorties, sync_runs_expires: syncRunsExpires, sync_queues_expirees: syncQueuesExpirees, pending_muets_clos: pendingMuetsClos, reprise_session_serveur: repriseSessionServeur, captures_reveil: capturesReveil }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Cooldown anti-spam via monitor_state.
  const cooldownIso = new Date(now - COOLDOWN_MIN * 60_000).toISOString();
  const toEmail: Array<Cluster & { severity: string }> = [];
  for (const a of alerts) {
    const { data: existing } = await supabase
      .from("monitor_state")
      .select("id, last_alerted_at")
      .eq("platform", a.platform)
      .eq("signature", a.signature)
      .maybeSingle();

    const sampleIds = a.jobs.slice(0, 3).map((j) => j.id);
    const build = a.jobs.find((j) => j.handler_build)?.handler_build ?? null;
    const sampleError = a.jobs[0]?.error ?? null;
    const stillCooling = existing?.last_alerted_at && existing.last_alerted_at > cooldownIso;

    const patch = {
      platform: a.platform,
      signature: a.signature,
      severity: a.severity,
      occurrences: a.jobs.length,
      distinct_users: a.users.size,
      sample_job_ids: sampleIds,
      sample_error: sampleError,
      handler_build: build,
      last_seen_at: new Date(now).toISOString(),
      resolved: false,
      ...(stillCooling ? {} : { last_alerted_at: new Date(now).toISOString() }),
    };
    // upsert sur (platform, signature)
    await supabase.from("monitor_state").upsert(patch, { onConflict: "platform,signature" });

    // Auto-pause (flag OFF par défaut) : S1/S3 seulement, réversible, jamais de
    // ré-activation auto (réactivation MANUELLE — on n'écrit paused=false nulle
    // part ici). On ne repause pas une plateforme déjà en pause.
    if (autoPauseOn && (a.severity === "S1" || a.severity === "S3")) {
      await supabase.from("platform_health").upsert({
        platform: a.platform,
        paused: true,
        reason: `auto ${a.severity}: ${a.signature}`.slice(0, 200),
        severity: a.severity,
        paused_since: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      }, { onConflict: "platform" });
    }

    if (!stillCooling) toEmail.push(a);
  }

  if (toEmail.length === 0) {
    return new Response(JSON.stringify({ ok: true, alerts: alerts.length, sent: 0, note: "tous en cooldown", orphelins_alertes: orphelinsAlertes, processing_rearmes: processingRearmes, deleted_rearmes: deletedRearmes, captured_rearmes: capturedRearmes, etats_repares: etatsRepares, processing_needs_user: processingNeedsUser, needs_user_vus: needsUserVus, needs_user_soldes: needsUserSoldes, needs_user_ticks: needsUserTicks, opla_acces_reprises: oplaReprises, opla_acces_messages: oplaMessages, reprises_connexion: reprisesConnexion, attentes_session_levees: attentesLevees, releves_repris: relevesRepris, dressings_repris: dressingsRepris, orphelines_rattachees: orphelinesRattachees, livres_debloques: livresDebloques, couleur_debloques: couleurDebloques, photos_jobs_rapatries: photosJobsRapatries, photos_jobs_rearmes: photosJobsRearmes, photos_fiches_rapatriees: photosFichesRapatriees, fiches_photos_maj: fichesPhotosMaj, fiches_file_sorties: fichesFileSorties, sync_runs_expires: syncRunsExpires, sync_queues_expirees: syncQueuesExpirees, pending_muets_clos: pendingMuetsClos, reprise_session_serveur: repriseSessionServeur, captures_reveil: capturesReveil }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rapport de DIAGNOSTIC (aide à la décision — aucun fix appliqué).
  const block = (a: Cluster & { severity: string }) => {
    const build = a.jobs.find((j) => j.handler_build)?.handler_build ?? "(inconnu)";
    return `
    <div style="margin:0 0 16px;padding:14px 16px;border:1px solid #FECACA;border-radius:12px;background:#FEF2F2;font-family:sans-serif;">
      <div style="font-size:14px;font-weight:700;color:#B91C1C;">
        [${esc(a.severity)}] ${esc(a.platform)} — ${esc(a.jobs.length)} échec(s), ${esc(a.users.size)} utilisateur(s), ${WINDOW_MIN} min
      </div>
      <div style="font-size:13px;color:#374151;margin-top:6px;"><strong>Cause probable :</strong> ${esc(probableCause(a.signature, a.severity))}</div>
      <div style="font-size:12px;color:#6B7280;margin-top:4px;">Fichier : <code>${esc(fileFor(a.platform))}</code> — build : <code>${esc(build)}</code></div>
      <div style="font-size:12px;color:#6B7280;margin-top:4px;">Signature : <code>${esc(a.signature)}</code></div>
      <div style="font-size:12px;color:#6B7280;margin-top:4px;">Jobs : ${a.jobs.slice(0, 3).map((j) => `<code>${esc(j.id)}</code>`).join(", ")}</div>
      <div style="font-size:12px;color:#B91C1C;margin-top:6px;">${esc(a.jobs[0]?.error ?? "")}</div>
    </div>`;
  };

  const worst = toEmail.some((a) => a.severity === "S1") ? "S1"
    : toEmail.some((a) => a.severity === "S3") ? "S3" : "S2";
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F2F2EE;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;padding:26px;">
    <h1 style="margin:0 0 4px;font-size:18px;font-family:sans-serif;color:#111827;">
      🚨 FillSell handler-watch — ${toEmail.length} incident(s) handler
    </h1>
    <p style="margin:0 0 14px;font-size:12px;font-family:sans-serif;color:#9CA3AF;">
      Fenêtre ${WINDOW_MIN} min — relevé du ${new Date(now).toISOString()}. Diagnostic = aide à la décision, aucun fix appliqué.
    </p>
    ${toEmail.map(block).join("")}
  </div>
</body></html>`;

  let sent = false;
  if (resendKey) {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject: `🚨 handler-watch [${worst}] — ${toEmail.length} incident(s) : ${toEmail.map((a) => a.platform).join(", ")}`,
        html,
      }),
    });
    sent = res.ok;
    if (!res.ok) console.error("[handler-watch] Resend:", await res.text().catch(() => ""));
  } else {
    console.error("[handler-watch] RESEND_API_KEY manquant — incident détecté mais non notifié");
  }

  return new Response(JSON.stringify({ ok: true, alerts: alerts.length, sent: sent ? toEmail.length : 0, orphelins_alertes: orphelinsAlertes, processing_rearmes: processingRearmes, deleted_rearmes: deletedRearmes, captured_rearmes: capturedRearmes, etats_repares: etatsRepares, processing_needs_user: processingNeedsUser, needs_user_vus: needsUserVus, needs_user_soldes: needsUserSoldes, needs_user_ticks: needsUserTicks, opla_acces_reprises: oplaReprises, opla_acces_messages: oplaMessages, reprises_connexion: reprisesConnexion, attentes_session_levees: attentesLevees, releves_repris: relevesRepris, dressings_repris: dressingsRepris, orphelines_rattachees: orphelinesRattachees, livres_debloques: livresDebloques, couleur_debloques: couleurDebloques, photos_jobs_rapatries: photosJobsRapatries, photos_jobs_rearmes: photosJobsRearmes, photos_fiches_rapatriees: photosFichesRapatriees, fiches_photos_maj: fichesPhotosMaj, fiches_file_sorties: fichesFileSorties, sync_runs_expires: syncRunsExpires, sync_queues_expirees: syncQueuesExpirees, pending_muets_clos: pendingMuetsClos, reprise_session_serveur: repriseSessionServeur, captures_reveil: capturesReveil }), {
    headers: { "Content-Type": "application/json" },
  });
});
