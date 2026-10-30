// ═══════════════════════════════════════════════════════════════════════════
// republier-photos-lbc — « Republier avec toutes tes photos » (30/10, lot E — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Appelée par l'app avec le JWT de la personne (verify_jwt = TRUE), sur UNE annonce Leboncoin partie amputée (repli
// silencieux sur 3 photos du 20 au 30/10). Crée UNE republication Leboncoin (même forme que spend_coins_and_republish,
// branche multiplateforme), sans pièce ni quota (pepites_debitees 0, marqueur hors_quota), qui passe par la file et sa
// cadence ordinaires. Refusée : extension trop ancienne (elle repartirait à 3 photos), Leboncoin restreint l'accès du
// compte (_shared/blocage-leboncoin.js), fiche plus en vente, republication déjà en file pour la fiche, ou une autre
// « toutes les photos » encore en cours sur le compte (une à la fois : jamais de rafale).
// Règles : _shared/photos-lbc-amputees.js. Rien d'automatique : seul le geste de la personne appelle cette fonction.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { etatBlocageLbc } from "../_shared/blocage-leboncoin.js";
import {
  refusRepublicationPhotos, messageRefusRepublicationPhotos, ligneRepublicationPhotos, marqueurSourcePhotos,
} from "../_shared/photos-lbc-amputees.js";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173", "http://localhost:5177"];

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const CORS = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Session invalide" }, 401);
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const jobId = String(body.job_id ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ ok: false, motif: "job_invalide", message: "Annonce introuvable." }, 400);

    // L'annonce d'origine : celle de la personne, jamais une autre.
    const { data: src, error: eSrc } = await admin.from("cross_post_jobs")
      .select("id, user_id, inventaire_id, platform, action, status, photo_option, title, description, price, photos, listing_url, platform_listing_id, platform_fields")
      .eq("id", jobId).eq("user_id", user.id).maybeSingle();
    if (eSrc || !src) return json({ ok: false, motif: "job_introuvable", message: "Annonce introuvable." }, 404);

    const [{ data: prof }, { data: fiche }, { data: actifs }] = await Promise.all([
      admin.from("profiles").select("extension_build, platform_settings").eq("id", user.id).maybeSingle(),
      src.inventaire_id != null
        ? admin.from("inventaire").select("statut, photos").eq("id", src.inventaire_id).eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("cross_post_jobs").select("id, inventaire_id, platform_fields")
        .eq("user_id", user.id).eq("platform", "leboncoin").eq("action", "republish")
        .in("status", ["pending", "processing", "needs_user"]).limit(200),
    ]);
    const liste = (actifs ?? []) as Array<{ id: string; inventaire_id: number | null; platform_fields: Record<string, unknown> | null }>;
    const motif = refusRepublicationPhotos({
      job: src,
      extensionBuild: (prof as { extension_build?: string } | null)?.extension_build ?? null,
      blocageEtat: etatBlocageLbc((prof as { platform_settings?: unknown } | null)?.platform_settings ?? {}).etat,
      ficheStatut: (fiche as { statut?: string } | null)?.statut ?? null,
      enCours: liste.filter((j) => Boolean(j.platform_fields?.["republication_photos_lbc"])).length,
      dejaRepublieeFiche: src.inventaire_id != null && liste.some((j) => String(j.inventaire_id) === String(src.inventaire_id)),
    });
    if (motif) {
      console.log(`[republier-photos-lbc] user=${user.id} job=${jobId.slice(0, 8)} refus : ${motif}`);
      return json({ ok: false, motif, message: messageRefusRepublicationPhotos(motif) });
    }

    const maintenant = new Date().toISOString();
    const ligne = ligneRepublicationPhotos(src, { photosFiche: (fiche as { photos?: unknown[] } | null)?.photos ?? null, maintenant });
    const { data: cree, error: eIns } = await admin.from("cross_post_jobs").insert(ligne).select("id").maybeSingle();
    if (eIns || !cree) {
      console.warn(`[republier-photos-lbc] user=${user.id} job=${jobId.slice(0, 8)} insertion refusée : ${eIns?.message ?? "?"}`);
      return json({ ok: false, motif: "insertion_refusee", message: /REPUBLISH_MAINTENANCE/.test(String(eIns?.message ?? ""))
        ? "Les republications sont en maintenance pour quelques minutes : rien n'est parti, réessaie un peu plus tard."
        : "Republication impossible pour l'instant : rien n'est parti." });
    }
    const pfSrc = { ...((src.platform_fields ?? {}) as Record<string, unknown>), republication_photos_lbc: marqueurSourcePhotos(String((cree as { id: string }).id), maintenant) };
    await admin.from("cross_post_jobs").update({ platform_fields: pfSrc }).eq("id", jobId).eq("user_id", user.id);
    console.log(`[republier-photos-lbc] user=${user.id} job=${jobId.slice(0, 8)} → republication ${String((cree as { id: string }).id).slice(0, 8)} (${ligne.photos.length} photos, sans pièce ni quota)`);
    return json({ ok: true, job_id: (cree as { id: string }).id });
  } catch (e) {
    console.error("[republier-photos-lbc] erreur :", (e as Error)?.message ?? e);
    return json({ ok: false, motif: "erreur", message: "Republication impossible pour l'instant : rien n'est parti." }, 500);
  }
});
