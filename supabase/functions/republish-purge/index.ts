import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── republish-purge (É2, retouche 2 — 2026-08-05) ────────────────────────────
// Purge quotidienne des captures de republication ET de leurs photos
// re-hébergées — dans la MÊME opération : une ligne partie sans ses fichiers
// serait une fuite storage irrattrapable (plus aucun index ne pointe dessus).
//
// Appelée par pg_cron ('republish-purge-daily', 03:40 UTC) via pg_net avec le
// header x-cron-secret — même modèle qu'email-tunnel/ops-digest. Déployer
// avec --no-verify-jwt (cf. CLAUDE.md, liste des fonctions cron/webhook).
//
// La SÉLECTION vit en SQL (republish_captures_purgeables — règle validée :
// bloquant absolu sur republish non terminal, supplantée > 7 j, > 90 j,
// grâce 30 j post-recréation). ICI : l'exécution seulement, dans cet ordre
// IMPÉRATIF pour chaque capture (l'ordre est le contrat, pas une
// optimisation) :
//   1. suppression des FICHIERS listés dans photos_urls (par fichier, jamais
//      par dossier : {user}/republish/{item}/ est partagé entre captures
//      successives du même article — le dossier entier détruirait les photos
//      de la capture plus récente qu'on garde) ;
//   2. si TOUS les fichiers sont partis (ou déjà absents) → DELETE de la
//      ligne. Sinon la ligne RESTE et le run suivant retente. Jamais
//      l'inverse.

const BUCKET = "listing-photos";
// Préfixe des publicUrl du bucket → chemin storage relatif.
const PREFIXE_PUBLIC = `/storage/v1/object/public/${BUCKET}/`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: purgeables, error: selErr } = await supabase
      .rpc("republish_captures_purgeables", { p_limite: 200 });
    if (selErr) throw new Error(`sélection : ${selErr.message}`);

    let lignes = 0;
    let fichiers = 0;
    const echecs: Array<{ capture_id: number; raison: string }> = [];

    for (const c of (purgeables ?? []) as Array<{ id: number; photos_urls: string[] }>) {
      // publicUrl → chemin relatif bucket. Une URL hors bucket (ne devrait
      // pas exister) est ignorée : elle ne bloque pas la purge de la ligne.
      const chemins = (c.photos_urls ?? [])
        .map((u) => {
          const i = String(u ?? "").indexOf(PREFIXE_PUBLIC);
          return i >= 0 ? decodeURIComponent(String(u).slice(i + PREFIXE_PUBLIC.length)) : null;
        })
        .filter((p): p is string => Boolean(p));

      if (chemins.length) {
        // storage.remove est idempotent (un fichier déjà absent ne fait pas
        // d'erreur) — seul un échec RÉEL (réseau, droits) doit retenir la ligne.
        const { error: rmErr } = await supabase.storage.from(BUCKET).remove(chemins);
        if (rmErr) {
          echecs.push({ capture_id: c.id, raison: `storage : ${rmErr.message}` });
          continue; // la ligne reste, retentée au prochain run
        }
        fichiers += chemins.length;
      }

      const { error: delErr } = await supabase
        .from("vinted_republish_captures").delete().eq("id", c.id);
      if (delErr) {
        // Fichiers partis, ligne restée : photos_urls pointe dans le vide
        // jusqu'au prochain run (remove idempotent → la ligne repartira).
        echecs.push({ capture_id: c.id, raison: `delete ligne : ${delErr.message}` });
        continue;
      }
      lignes++;
    }

    console.log(`[republish-purge] lignes=${lignes} fichiers=${fichiers} echecs=${echecs.length}`);
    return new Response(JSON.stringify({ ok: true, lignes, fichiers, echecs }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[republish-purge]", e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
