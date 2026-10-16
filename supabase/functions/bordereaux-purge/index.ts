import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";

// ═══════════════════════════════════════════════════════════════════════════
// bordereaux-purge — LES COPIES DE BORDEREAUX, 5 JOURS AU PLUS (bêta, 16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Un bordereau porte le nom et l'adresse de l'acheteur. Sa copie (bucket
// privé `bordereaux`, une ligne dans bordereaux_copies) ne vit que 5 jours AU
// PLUS — contrainte en base (expire_le <= cree_le + 5 jours) — puis cette
// fonction l'efface par l'API Storage (le SQL ne le peut pas :
// protect_objects_delete) et date `efface_le`.
//
// Appelée par pg_cron (« bordereaux-purge-horaire », minute 23) SEULEMENT
// quand une copie est expirée — le cron vérifie avant d'appeler. Garde
// x-cron-secret (vault, jamais écrit) ; déployer avec --no-verify-jwt.
// ⛔ Ne décide de rien : la sélection vit en SQL (public.bordereaux_a_purger).
// ⛔ Aucun chemin ni nom de fichier dans les journaux (le chemin porte un
//    numéro de commande) : des compteurs seulement.
// ═══════════════════════════════════════════════════════════════════════════

const BUCKET = "bordereaux";
const PLAFOND = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!attendu || req.headers.get("x-cron-secret") !== attendu) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.rpc("bordereaux_a_purger", { p_limite: PLAFOND });
  if (error) {
    console.error("[bordereaux-purge] sélection impossible :", error.message.slice(0, 160));
    return new Response(JSON.stringify({ error: "selection" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const candidats = (data ?? []) as Array<{ id: string; chemin: string }>;
  let effaces = 0;
  let echecs = 0;
  for (let i = 0; i < candidats.length; i += 50) {
    const lot = candidats.slice(i, i + 50);
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(lot.map((c) => c.chemin));
    if (rmErr) { echecs += lot.length; continue; }
    const { error: majErr } = await admin.from("bordereaux_copies")
      .update({ efface_le: new Date().toISOString() }).in("id", lot.map((c) => c.id));
    if (majErr) echecs += lot.length; else effaces += lot.length;
  }
  console.log(`[bordereaux-purge] candidats=${candidats.length} effaces=${effaces} echecs=${echecs}`);
  return new Response(JSON.stringify({ candidats: candidats.length, effaces, echecs }), { headers: { "Content-Type": "application/json" } });
});
