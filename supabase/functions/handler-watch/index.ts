import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
// Mêmes gardes que generate-listing/republish-capture-photos : hôtes Vinted
// FERMÉS (jamais un proxy ouvert), taille plafonnée, timeout, séquentiel.
const PHOTO_BUCKET = "listing-photos";
const PHOTO_MAX_OCTETS = 10 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 15_000;

function estCdnVinted(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && /(^|\.)vinted\.(net|fr|com)$/i.test(url.hostname);
  } catch { return false; }
}

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
      .select("id, user_id, title, status, platform_fields")
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
        ${esc(p.username ?? p.email ?? j.user_id)} — « ${esc(j.title ?? "(sans titre)")} »
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
      (endormie, session perdue…). L'annonce Vinted est retirée, la capture est en
      base : rien n'est perdu, mais personne ne le voit. Une alerte par job.
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
  // La Pépite n'est PAS rendue : le job va aboutir. Aucun trigger de solde ne
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
    const candidats = ((bloques ?? []) as any[]).filter((j) => {
      const since = Date.parse(j.platform_fields?.processing_since ?? j.created_at ?? "");
      return Number.isFinite(since) && now - since >= SEUIL_ABANDON_MS;
    });
    if (candidats.length) {
      const userIds = [...new Set(candidats.map((j) => j.user_id as string))];
      const { data: profs } = await supabase
        .from("profiles").select("id, extension_last_seen_at").in("id", userIds);
      // deno-lint-ignore no-explicit-any
      const lastSeen = new Map(((profs ?? []) as any[]).map((p) => [p.id, Date.parse(p.extension_last_seen_at ?? "")]));
      for (const j of candidats) {
        const seen = lastSeen.get(j.user_id);
        if (Number.isFinite(seen as number) && now - (seen as number) < SEUIL_ABANDON_MS) continue;
        const pf = { ...(j.platform_fields ?? {}) };
        delete pf.processing_since;
        delete pf.stale_recoveries;

        if (j.action === "republish" && pf.republish_step === "captured") {
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

        const msg =
          "Reprise après interruption : l'ordinateur qui portait ce traitement ne s'est plus manifesté " +
          "depuis plus de 24 h. Le job est remis en file et repartira automatiquement dès qu'une " +
          "extension connectée se réveille — rien à faire de ton côté.";
        const { error: uErr } = await supabase
          .from("cross_post_jobs")
          .update({ status: "pending", error: msg, platform_fields: pf })
          .eq("id", j.id)
          .eq("status", "processing");
        if (!uErr) {
          processingRearmes++;
          console.log(`[handler-watch] job ${j.id} (${j.platform}/${j.action}) processing abandonné → pending (reprenable, Pépite conservée)`);
        }
      }
    }
  } catch (e) {
    console.error("[handler-watch] reprise des processing abandonnés:", (e as Error)?.message ?? e);
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
  // avant de recréer, cf. processRepublishJob). Aucune Pépite re-débitée :
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
      .select("id, user_id, created_at, platform_fields")
      .eq("status", "processing")
      .eq("action", "republish")
      .filter("platform_fields->>republish_step", "eq", "deleted")
      .filter("platform_fields->>new_vinted_item_id", "is", "null");
    // deno-lint-ignore no-explicit-any
    for (const j of ((coupes ?? []) as any[])) {
      const pf0 = j.platform_fields ?? {};
      const since = Date.parse(pf0.processing_since ?? pf0.deleted_at ?? j.created_at ?? "");
      if (!Number.isFinite(since) || now - since < REPRISE_DELETED_MIN * 60_000) continue;
      const capId = Number(pf0.capture_id);
      if (!Number.isFinite(capId)) continue; // capture absente : garde-fou, on ne touche pas
      const { data: cap } = await supabase
        .from("vinted_republish_captures")
        .select("verdict")
        .eq("id", capId)
        .maybeSingle();
      if (cap?.verdict !== "valide") continue; // incomplète ou introuvable : idem
      const pf = { ...pf0 };
      delete pf.processing_since;
      delete pf.stale_recoveries;
      const msg =
        "Reprise après interruption : l'ordinateur a été coupé juste après le retrait de l'annonce, " +
        "avant sa recréation. Le job est remis en file et la recréation repartira toute seule dès " +
        "qu'une extension connectée se réveille — rien à faire de ton côté, la Pépite reste engagée.";
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
  // swap sur 'processing'. Aucune Pépite re-débitée : le débit vit à la
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
      .select("id, user_id, created_at, platform_fields")
      .eq("status", "processing")
      .eq("action", "republish")
      .filter("platform_fields->>republish_step", "eq", "captured")
      .filter("platform_fields->>new_vinted_item_id", "is", "null");
    // deno-lint-ignore no-explicit-any
    for (const j of ((coupes ?? []) as any[])) {
      const pf0 = j.platform_fields ?? {};
      const since = Date.parse(pf0.processing_since ?? j.created_at ?? "");
      if (!Number.isFinite(since) || now - since < REPRISE_CAPTURED_MIN * 60_000) continue;
      const capId = Number(pf0.capture_id);
      if (!Number.isFinite(capId)) continue; // capture absente : garde-fou, on ne touche pas
      const { data: cap } = await supabase
        .from("vinted_republish_captures")
        .select("verdict")
        .eq("id", capId)
        .maybeSingle();
      if (cap?.verdict !== "valide") continue; // incomplète ou introuvable : idem
      const pf = { ...pf0 };
      delete pf.processing_since;
      delete pf.stale_recoveries;
      const msg =
        "Reprise après interruption : l'ordinateur a été coupé après la capture de l'annonce, " +
        "avant tout retrait. Ton annonce est toujours en ligne sur Vinted, rien n'a été supprimé. " +
        "Le job est remis en file et repartira tout seul dès qu'une extension connectée se " +
        "réveille — rien à faire de ton côté, la Pépite reste engagée.";
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

  // ── needs_user À ÉCHÉANCE : 72 h sans geste → failed (point 5, GO Nico
  // 16/08) ──────────────────────────────────────────────────────────────────
  // needs_user n'est pas terminal : aucun trigger ne rend jamais la Pépite —
  // l'utilisateur a payé un service jamais rendu (art. 5 des CGV ; relevé du
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
  //     dès que c'est réglé »), la Pépite est déjà rendue à la mise en pause
  //     (update-job-status), et le solde 72 h écraserait le message par un
  //     « relance quand tu veux » qui ferait payer une nouvelle Pépite pour un
  //     job qui re-bloquerait. Reconnus par le marqueur needs_user_source OU
  //     par le préfixe du message : les 6 jobs pausés À LA MAIN par Nico le
  //     22/08 (même formulation) sont ainsi couverts SANS être réécrits.
  //   - Écritures en compare-and-swap (.eq status needs_user) : un job relancé
  //     entre-temps n'est jamais écrasé. Best-effort intégral.
  const PREFIXE_GARDE_LIVRES =
    "Republication mise en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Motif : blocage connu sur la catégorie Livres";
  let needsUserVus = 0;
  let needsUserSoldes = 0;
  try {
    const ECHEANCE_NEEDS_USER_MS = 72 * 3600_000;
    const { data: attente } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, action, error, created_at, platform_fields")
      .eq("status", "needs_user");
    // deno-lint-ignore no-explicit-any
    for (const j of ((attente ?? []) as any[])) {
      if (j.action === "republish" && j.platform_fields?.republish_step === "deleted") continue;
      if (j.platform_fields?.needs_user_source === "livres_isbn_garde" ||
          String(j.error ?? "").startsWith(PREFIXE_GARDE_LIVRES)) continue;
      const pf = { ...(j.platform_fields ?? {}) };
      const erreurCourante = String(j.error ?? "").slice(0, 200);
      const vuLe = Date.parse(pf.needs_user_vu_le ?? "");
      const nouvelEpisode = !Number.isFinite(vuLe) || String(pf.needs_user_vu_erreur ?? "") !== erreurCourante;
      if (nouvelEpisode) {
        pf.needs_user_vu_le = new Date(now).toISOString();
        pf.needs_user_vu_erreur = erreurCourante;
        const { error: sErr } = await supabase
          .from("cross_post_jobs")
          .update({ platform_fields: pf })
          .eq("id", j.id)
          .eq("status", "needs_user");
        if (!sErr) needsUserVus++;
        continue;
      }
      if (now - vuLe < ECHEANCE_NEEDS_USER_MS) continue;
      // La formulation par acte suit celle des triggers : la Pépite n'est
      // annoncée que là où un solde existe réellement (réservation publish /
      // débit republish) — un retrait n'en porte pas.
      const msg = j.action === "republish"
        ? "Resté en attente de ton geste plus de 3 jours : le job est arrêté, ton annonce est intacte " +
          "sur Vinted et la Pépite est rendue. Relance la republication depuis la fiche de l'article quand tu veux."
        : j.action === "delete"
          ? "Resté en attente de ton geste plus de 3 jours : le job est arrêté. Si l'annonce est encore " +
            "en ligne, retire-la toi-même sur la plateforme."
          : "Resté en attente de ton geste plus de 3 jours : le job est arrêté et la Pépite engagée a été " +
            "rendue. Relance la publication depuis la fiche de l'article quand tu veux.";
      const { error: fErr } = await supabase
        .from("cross_post_jobs")
        .update({ status: "failed", error: msg, platform_fields: pf })
        .eq("id", j.id)
        .eq("status", "needs_user");
      if (!fErr) {
        needsUserSoldes++;
        console.log(`[handler-watch] job ${j.id} (${j.platform}/${j.action}) needs_user > 72 h → failed, solde par triggers`);
      }
    }
  } catch (e) {
    console.error("[handler-watch] règlement des needs_user à échéance:", (e as Error)?.message ?? e);
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
  // Pépite re-débitée : le job repart tel quel, pepite_remboursee en poche
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
      .select("id, user_id, platform_fields")
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
      .select("id, user_id, platform_fields")
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
  // Cas réel : job leboncoin 94cbe6d9 (« Plateau vintage », Sandrine) —
  // generate-listing avait rapatrié 7 photos sur 8 (HTTP 520 Storage
  // transitoire, une seule tentative, `continue` silencieux), la restante sur
  // images1.vinted.net a fait échouer la publication sur la page de dépôt
  // (CORS de la page hôte, urlToFile). Filet SERVEUR, deux mailles :
  //   - jobs publish 'pending' : rapatrier AVANT que l'extension ne les prenne
  //     (utile surtout quand elle est hors ligne au moment du clic) ;
  //   - jobs publish 'failed' < 7 j portant la signature « hors FillSell »
  //     (message urlToFile des content scripts) : rapatrier PUIS ré-armer en
  //     'pending' quand TOUTES les photos sont à nous — JAMAIS de regénération
  //     demandée à l'utilisateur (6 Pépites pour notre bug). Les triggers de
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
        .eq("action", "publish")
        .eq("status", "pending"),
      supabase
        .from("cross_post_jobs")
        .select("id, user_id, inventaire_id, status, photos, platform_fields")
        .eq("action", "publish")
        .eq("status", "failed")
        .gte("created_at", seuil7jIso)
        .ilike("error", "%hors FillSell%"),
    ]);
    // deno-lint-ignore no-explicit-any
    const candidats = ([...(enAttente ?? []), ...(rates ?? [])] as any[])
      .filter((j) => Array.isArray(j.photos) && (j.photos as unknown[]).some((p) => estCdnVinted(urlDePhoto(p))));
    for (const j of candidats) {
      const pf = { ...(j.platform_fields ?? {}) };
      const balayages = Number(pf.photo_rehost_sweeps ?? 0);
      if (!Number.isFinite(balayages) || balayages >= 2) continue;
      pf.photo_rehost_sweeps = balayages + 1;
      const externes = [...new Set((j.photos as unknown[]).map(urlDePhoto).filter(estCdnVinted))] as string[];
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
          "(article importé du dressing). Elle a été rapatriée et la publication repart toute seule — rien à faire.";
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
    return new Response(JSON.stringify({ ok: true, clean: true, scanned: jobs.length, orphelins_alertes: orphelinsAlertes, processing_rearmes: processingRearmes, deleted_rearmes: deletedRearmes, captured_rearmes: capturedRearmes, processing_needs_user: processingNeedsUser, needs_user_vus: needsUserVus, needs_user_soldes: needsUserSoldes, livres_debloques: livresDebloques, couleur_debloques: couleurDebloques, photos_jobs_rapatries: photosJobsRapatries, photos_jobs_rearmes: photosJobsRearmes }), {
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
    return new Response(JSON.stringify({ ok: true, alerts: alerts.length, sent: 0, note: "tous en cooldown", orphelins_alertes: orphelinsAlertes, processing_rearmes: processingRearmes, deleted_rearmes: deletedRearmes, captured_rearmes: capturedRearmes, processing_needs_user: processingNeedsUser, needs_user_vus: needsUserVus, needs_user_soldes: needsUserSoldes, livres_debloques: livresDebloques, couleur_debloques: couleurDebloques, photos_jobs_rapatries: photosJobsRapatries, photos_jobs_rearmes: photosJobsRearmes }), {
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

  return new Response(JSON.stringify({ ok: true, alerts: alerts.length, sent: sent ? toEmail.length : 0, orphelins_alertes: orphelinsAlertes, processing_rearmes: processingRearmes, deleted_rearmes: deletedRearmes, captured_rearmes: capturedRearmes, processing_needs_user: processingNeedsUser, needs_user_vus: needsUserVus, needs_user_soldes: needsUserSoldes, livres_debloques: livresDebloques, couleur_debloques: couleurDebloques, photos_jobs_rapatries: photosJobsRapatries, photos_jobs_rearmes: photosJobsRearmes }), {
    headers: { "Content-Type": "application/json" },
  });
});
