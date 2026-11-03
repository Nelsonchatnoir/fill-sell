import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { orchestrateSale } from "../_shared/sale-orchestration.ts";
import { vendueAvantSuivi, raisonVenteAncienne, annonceImportee } from "../_shared/lbc-vendu-avant-suivi.js";

// v5 (2026-07-11) — ORCHESTRATEUR DB PUR, appelé par l'extension Chrome.
//
// Les v1-v4 faisaient du scraping HTTP serveur des listing_url (User-Agent
// Safari iPhone + détecteurs HTML par plateforme). Abandonné (décision
// 2026-07-11) : les IPs Supabase se font bloquer par DataDome/bot-shield, la
// fonction n'était appelée par aucun cron, et listing_url n'était jamais
// peuplé. La DÉTECTION vit désormais dans le background de l'extension
// (session réelle du vendeur, mêmes détecteurs HTML portés là-bas) ; ici ne
// reste que l'orchestration de la vente, partagée avec update-job-status :
//   POST { job_id } + Bearer JWT utilisateur
//   → garde published→sold, vente alignée confirmSell (frais 0), inventaire
//     → vendu + marges, annulation de TOUS les frères (pending inclus),
//     platform_fields.pending_removal sur les frères encore live (bandeau
//     semi-auto de l'app), email via email-tunnel.
// Voir _shared/sale-orchestration.ts pour le détail.
//
// Déploiement : supabase functions deploy check-listing-status
// (verify_jwt peut rester au défaut : l'appel porte toujours un JWT user.)

// ⚠️ localhost:5173 (Vite dev) AJOUTÉ le 2026-07-13 : sans lui, « Oui, enregistrer
// la vente » échouait en CORS dès le préflight en développement (« header has a
// value 'https://fillsell.app' that is not equal to the supplied origin »). Ce
// chemin — le SEUL qui écrive une vente en base — n'avait jamais été exercé
// bout en bout avant ce jour, d'où la découverte tardive.
// ⚠️ Ce n'est PAS un oubli propre à cette fonction : au 2026-07-13, seule
// lens-analysis autorisait l'origine de dev. Les autres fonctions appelées
// depuis le navigateur casseront pareil en local le jour où on les exercera —
// même correctif à appliquer alors (la prod, elle, n'a jamais été affectée :
// https://fillsell.app est autorisée depuis toujours).
const ALLOWED_ORIGINS = [
  "https://fillsell.app",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:5173", // Vite dev
];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin.startsWith("chrome-extension://");
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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authErr } = await admin.auth.getUser(authHeader.slice(7).trim());
    if (authErr || !user) return json({ error: "Token invalide ou expiré" }, 401);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ok */ }
    const jobId = body.job_id as string | undefined;
    if (!jobId) return json({ error: "job_id requis" }, 400);

    // price (2026-07-12, optionnel) : prix de vente RÉEL quand il est mieux connu
    // que le prix de publication — champ éditable du bandeau de confirmation
    // (négociation), ou montant lu sur la page vendeur de la plateforme.
    // Validé strictement : un nombre fini > 0, sinon ignoré (on retombe sur
    // job.price). Jamais de valeur devinée.
    const rawPrice = Number(body.price);
    const priceOverride = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : undefined;

    // remettre_en_vente (11/10, optionnel) : false = « Ne pas remettre en vente »
    // depuis la liste « Ventes à confirmer ». Absent ou autre valeur : comme avant.
    const remettreEnVente = body.remettre_en_vente === false ? false : undefined;

    // (03/11 soir, JEAN-LUC LASSARAT) Un « Vendu » Leboncoin déjà là à la PREMIÈRE lecture de l'annonce n'est pas une
    // vente du jour : jamais enregistré, jamais de retrait de copie (_shared/lbc-vendu-avant-suivi.js). Lecture bornée :
    // le job de la personne, puis les traces de CE numéro (index usage_logs_user_feature_created).
    const { data: jobLu } = await admin.from("cross_post_jobs")
      .select("id,platform,platform_listing_id,platform_fields").eq("id", jobId).eq("user_id", user.id).maybeSingle();
    const numeroLbc = String(jobLu?.platform_listing_id ?? "").trim();
    const pfLu = (jobLu?.platform_fields ?? {}) as Record<string, unknown>;
    if (jobLu?.platform === "leboncoin" && /^\d+$/.test(numeroLbc) && pfLu.sale_signal === "sold"
        && annonceImportee(pfLu)) {
      const { data: traces, error: tracesErr } = await admin.from("usage_logs")
        .select("created_at,metadata->>transaction,metadata->>avant")
        .eq("user_id", user.id).eq("feature", "vente_leboncoin_transaction").eq("metadata->>listing_id", numeroLbc)
        .order("created_at", { ascending: true }).limit(200);
      if (!tracesErr) {
        const lu = vendueAvantSuivi((traces ?? []).map((t: Record<string, unknown>) => ({
          created_at: t.created_at as string, transaction: t.transaction as string | null, avant: t.avant as string | null,
        })));
        if (lu.ancienne) {
          await admin.from("usage_logs").insert({ user_id: user.id, feature: "vente_leboncoin_ancienne_refusee",
            metadata: { job: jobId, listing_id: numeroLbc, premiere_lecture: lu.premiereLecture, par: "check-listing-status" } });
          return json({ error: raisonVenteAncienne(lu.premiereLecture) }, 409);
        }
      }
    }

    const result = await orchestrateSale(admin, user.id, jobId, { priceOverride, declaree: true, remettreEnVente });
    if (!result.ok) return json({ error: result.reason ?? "Orchestration impossible" }, 409);
    return json({ success: true, sale: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[check-listing-status] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
