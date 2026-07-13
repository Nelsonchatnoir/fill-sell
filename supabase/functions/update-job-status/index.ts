import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Appelée par l'extension Chrome après chaque tentative de publication.
// Auth : JWT utilisateur (Bearer). L'update passe par un client scoped user
// → RLS garantit qu'un utilisateur ne peut modifier que ses propres jobs.
//
// Body : { job_id: uuid, status: string, error?: string, listing_url?: string }
//
// Transitions gérées ici (cycle de publication) :
//   pending → processing → published / failed / cancelled / dry_run_completed
// 'dry_run_completed' est un statut TERMINAL : un dry-run réussi n'est PLUS
// ré-armé en pending (sinon get-pending-jobs le rejouait à chaque cron de
// 30 min → réouverture d'onglets en boucle → suspension DataDome, incident
// vécu). Pour re-tester, régénérer le job depuis l'app (nouveau pending).
// Le cycle post-publication (vente + inventaire + annulation des frères) vit
// EXCLUSIVEMENT dans check-listing-status, et n'est déclenché QUE par le clic de
// confirmation de l'utilisateur dans l'app. Ne jamais le rebrancher ici.
//
// Déploiement : supabase functions deploy update-job-status
// verify_jwt reste à true (défaut) : la fonction reçoit toujours un JWT
// utilisateur, contrairement aux webhooks/cron listés dans CLAUDE.md.
// auth.getUser() ci-dessous n'est pas redondant : il fournit l'identité
// (user.id) et alimente le client scoped user pour la RLS.

// ⚠️ 'sold' RETIRÉ le 2026-07-12 (décision produit) — et le statut n'est plus
// acceptable ici du tout. Cette fonction pouvait orchestrer une vente (créer la
// ligne dans `ventes`, passer l'inventaire en vendu, annuler les frères) sur un
// simple appel status='sold'. Plus personne ne l'appelait ainsi, mais un chemin
// d'écriture automatique qui dort n'est pas une garantie : c'est un risque
// latent. Il est supprimé.
// DÉSORMAIS, DANS TOUT LE CODE, UNE VENTE NE PEUT ÊTRE ÉCRITE QUE PAR UN CLIC :
// le bandeau de l'app → check-listing-status { job_id, price } → orchestrateSale.
// Raison : aucune plateforme n'expose le prix NÉGOCIÉ ; écrire une vente sans
// confirmation humaine, c'est écrire une marge potentiellement fausse que
// personne ne reviendra corriger.
// Le job passe en 'sold' via l'orchestration elle-même, jamais par ce patch.
//
// 'deleted' (2026-07-11) : terminal d'un job action='delete' exécuté en LIVE.
const ALLOWED_STATUSES = ["pending", "processing", "published", "failed", "cancelled", "dry_run_completed", "deleted"];

// ⚠️ http://localhost:5173 (Vite dev) : sans lui, tout appel depuis le développement
// casse dès le PRÉFLIGHT CORS (« header has a value 'https://fillsell.app' that is not
// equal to the supplied origin »). Vécu le 2026-07-13 sur check-listing-status — le
// chemin « Oui, enregistrer la vente » était cassé depuis toujours en local. Passe
// généralisée aux 15 fonctions restantes. La PROD n'a jamais été affectée.
const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin.startsWith("chrome-extension://");
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsOrigin = isAllowedOrigin(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
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

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ok */ }

    const jobId = body.job_id as string | undefined;
    const status = body.status as string | undefined;

    if (!jobId || !status) return json({ error: "job_id et status requis" }, 400);
    if (!ALLOWED_STATUSES.includes(status)) {
      return json({ error: `status invalide, valeurs acceptées : ${ALLOWED_STATUSES.join(", ")}` }, 400);
    }

    // ── 'deleted' : réservé aux jobs action='delete' (suppression LIVE) ──────
    if (status === "deleted") {
      const { data: cur } = await userClient
        .from("cross_post_jobs")
        .select("id, action")
        .eq("id", jobId)
        .maybeSingle();
      if (!cur) return json({ error: "Job introuvable" }, 404);
      if (cur.action !== "delete") {
        return json({ error: "'deleted' est réservé aux jobs action='delete'" }, 400);
      }
    }

    const patch: Record<string, unknown> = { status };

    // platform_fields optionnel : l'extension envoie l'objet DÉJÀ fusionné
    // (ex: compteur needsUserAttempts pour borner les ré-armements). On écrase
    // tel quel — pas de merge côté serveur, l'appelant a la version complète.
    if (body.platform_fields && typeof body.platform_fields === "object") {
      patch.platform_fields = body.platform_fields;
    }

    if (status === "published") {
      patch.published_at = new Date().toISOString();
      patch.error = null;
      if (typeof body.listing_url === "string" && body.listing_url) {
        patch.listing_url = body.listing_url;
      }
    } else if (status === "failed") {
      patch.error = typeof body.error === "string" ? body.error.slice(0, 2000) : "Erreur inconnue";
    } else if (status === "pending") {
      // Ré-armement (ex: needsUser, l'utilisateur doit compléter une info) :
      // on garde l'error explicative si fournie, sinon on nettoie.
      patch.error = typeof body.error === "string" && body.error ? body.error.slice(0, 2000) : null;
    } else if (status === "dry_run_completed") {
      // Terminal : dry-run réussi, ne repart pas dans la queue. L'éventuel
      // détail (champs manquants, trace du dry-run delete) vit dans
      // platform_fields, pas dans error.
      patch.error = null;
    } else if (status === "deleted") {
      // Terminal : annonce réellement supprimée de la plateforme.
      patch.error = null;
    }

    const { data: updated, error: updateErr } = await userClient
      .from("cross_post_jobs")
      .update(patch)
      .eq("id", jobId)
      .select("id, status")
      .maybeSingle();

    if (updateErr) return json({ error: updateErr.message }, 500);
    if (!updated) return json({ error: "Job introuvable" }, 404);

    console.log(`[update-job-status] userId=${user.id} job=${jobId} → ${status}`);

    return json({ success: true, job: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[update-job-status] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
