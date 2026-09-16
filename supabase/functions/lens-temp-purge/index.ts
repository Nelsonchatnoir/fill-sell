import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── lens-temp-purge (2026-09-16) ─────────────────────────────────────────────
// Ménage quotidien du bucket `lens-temp`. Depuis le correctif du 15/09 le
// client ne purge plus les photos du scan précédent — ce sont désormais les
// photos d'un article du stock — et le ménage serveur n'existait pas : le
// bucket grossissait sans borne.
//
// Appelée par pg_cron ('lens-temp-purge-daily', 03:50 UTC) via pg_net avec le
// header x-cron-secret — même modèle que republish-purge / ops-digest.
// ⛔ Déployer avec --no-verify-jwt (cf. CLAUDE.md).
//
// ⛔ CETTE FONCTION NE DÉCIDE DE RIEN. La sélection vit en SQL
//    (public.lens_temp_a_purger, migration 20260916082000) : borne d'âge de
//    7 jours en dur, et TROIS références qui protègent une photo quel que soit
//    son âge — fiches_annonce.fiche->photos, cross_post_jobs.photos ET
//    inventaire.photos. Ici : l'exécution seulement.
//
// ⛔ LA TRACE EST POSÉE AVANT LA SUPPRESSION, et datée après. Un fichier qui
//    n'a pas pu partir reste à `supprimee_le IS NULL` et repassera au run
//    suivant — on sait toujours ce qui est parti, pas seulement combien.

const BUCKET = "lens-temp";
// Plafond par run : le bucket est petit et quotidien ; un run borné évite
// qu'un incident ne parte en purge massive sans qu'on ait le temps de voir.
const PLAFOND = 500;

type Candidat = { name: string; compte: string | null; taille: number; televersee_le: string };

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

  const runId = crypto.randomUUID();

  try {
    const { data, error: selErr } = await supabase.rpc("lens_temp_a_purger", { p_limite: PLAFOND });
    if (selErr) throw new Error(`sélection : ${selErr.message}`);
    const candidats = (data ?? []) as Candidat[];

    if (!candidats.length) {
      console.log(`[lens-temp-purge] run=${runId} rien à purger`);
      return new Response(JSON.stringify({ run_id: runId, candidats: 0, supprimes: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. LA TRACE D'ABORD. upsert : un fichier déjà listé par un run précédent
    //    (suppression ratée) garde sa ligne et reçoit le nouveau run_id.
    const { error: traceErr } = await supabase.from("lens_temp_purge_trace").upsert(
      candidats.map((c) => ({
        name: c.name, compte: c.compte, taille: c.taille,
        televersee_le: c.televersee_le, run_id: runId,
      })),
      { onConflict: "name" },
    );
    // Une trace qui n'entre pas ARRÊTE le run : supprimer sans trace, c'est
    // exactement ce qu'on s'interdit.
    if (traceErr) throw new Error(`trace : ${traceErr.message}`);

    // 2. La suppression, par paquets, à partir de la liste tracée.
    let supprimes = 0;
    const echecs: string[] = [];
    for (let i = 0; i < candidats.length; i += 100) {
      const lot = candidats.slice(i, i + 100).map((c) => c.name);
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(lot);
      if (rmErr) { echecs.push(`lot ${i} : ${rmErr.message}`); continue; }
      const { error: majErr } = await supabase.from("lens_temp_purge_trace")
        .update({ supprimee_le: new Date().toISOString() })
        .in("name", lot);
      if (majErr) echecs.push(`datation lot ${i} : ${majErr.message}`);
      supprimes += lot.length;
    }

    const octets = candidats.slice(0, supprimes).reduce((s, c) => s + Number(c.taille || 0), 0);
    console.log(
      `[lens-temp-purge] run=${runId} candidats=${candidats.length} supprimes=${supprimes}`
      + ` octets≈${octets}${echecs.length ? ` echecs=${echecs.length}` : ""}`,
    );
    for (const e of echecs) console.error(`[lens-temp-purge] ${e}`);

    return new Response(JSON.stringify({
      run_id: runId, candidats: candidats.length, supprimes, octets, echecs,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[lens-temp-purge] échec :", (e as Error)?.message ?? e);
    return new Response(JSON.stringify({ run_id: runId, error: (e as Error)?.message ?? String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
