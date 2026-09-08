import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── republish-auto-sweep (2026-09-08, incident état Vinted du 07/09) ─────────
// LA VOIE AUTO, RENDUE AU SERVEUR. Le 07/09 à 12h15 (Paris), Vinted a retiré
// le champ racine `status` du payload d'édition. Le pré-vol de capture de
// l'extension juge alors la capture 'incomplet' et s'arrête AVANT d'appeler
// spend_coins_and_republish : aucun job, aucun appel, aucune trace en base.
// 225 captures de pré-vol 'incomplet' pour ce seul motif chez 11 comptes, et
// la voie auto à l'arrêt depuis le 07/09 03:38 sur tout le parc. Le correctif
// d'extension existe (9e411f8) mais attend la 0.6.21 — le Chrome Web Store
// n'accepte qu'un paquet en attente et la 0.6.20 est en review.
//
// CETTE FONCTION NE PUBLIE RIEN ET NE SUPPRIME RIEN. Elle appelle une seule
// RPC, republish_auto_sweep_serveur(), qui choisit UN article par compte et
// appelle spend_coins_and_republish TELLE QUELLE (via
// request.jwt.claims). Le job atterrit en 'pending' ; à partir de là c'est le
// chemin manuel ordinaire — l'extension capture au poll suivant, le pansement
// d'état de get-pending-jobs lui fournit ce qui manque, et l'étape 'captured'
// refuse de supprimer tant que tout n'est pas là.
//
// ⛔ Rien de la décision ne vit ici : ni sélection, ni garde, ni plafond.
// Tout est en SQL, dans une seule transaction — c'est ce qui permet de poser
// l'identité de l'utilisateur (SET LOCAL) autour de l'appel du RPC, et c'est
// ce qui garantit qu'un plantage réseau ne laisse jamais un job à moitié créé.
// Cette fonction est le DÉCLENCHEUR et le point d'observation : elle
// journalise ce que le sweep a fait, pour que le rapport d'exploitation se
// lise dans les logs sans requête.
//
// Appelée par pg_cron ('republish-auto-sweep-3min', */3) via pg_net avec le
// header x-cron-secret — même modèle qu'email-tunnel/ops-digest/republish-purge.
// ⚠️ Déployer avec --no-verify-jwt (cf. CLAUDE.md, liste des fonctions cron).
//
// L'INTERRUPTEUR N'EST PAS ICI NON PLUS : c'est la clé coin_config
// `republish_auto_serveur_actif` (0 = éteint, et une clé absente vaut éteint).
// La RPC la lit en première ligne et rend { actif: false } sans rien faire.
// Couper ne demande donc AUCUN déploiement, et ne dépend pas de cette
// fonction : même si le cron continue d'appeler, il tourne à vide.

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
    const { data, error } = await supabase.rpc("republish_auto_sweep_serveur");
    if (error) throw new Error(error.message);

    const r = (data ?? {}) as Record<string, unknown>;
    if (r.actif === false) {
      // Trace volontairement DISCRÈTE : à */3, un sweep éteint parlerait 480
      // fois par jour pour ne rien dire, et noierait le jour où il parle.
      console.log(`[republish-auto-sweep] éteint — ${r.motif ?? "interrupteur à 0"}`);
    } else {
      const detail = Array.isArray(r.detail) ? r.detail : [];
      console.log(
        `[republish-auto-sweep] ${r.crees ?? 0} job(s) créé(s) sur ${r.traites ?? 0} compte(s) traité(s)`,
      );
      // Un refus du RPC est une information, pas une anomalie : plafond du
      // jour atteint, cadence 24 h, republication déjà en cours. On le NOMME —
      // c'est ce qui manquait pendant l'incident, où le refus se décidait dans
      // l'extension et ne laissait aucune trace lisible.
      for (const l of detail as Array<Record<string, unknown>>) {
        if (l.allowed) {
          console.log(
            `[republish-auto-sweep] ${l.compte} → article ${l.vinted_item_id} mis en file (job ${l.job_id}, ${l.examines} candidat(s) examiné(s))`,
          );
        } else {
          console.log(
            `[republish-auto-sweep] ${l.compte} → refus du RPC sur l'article ${l.vinted_item_id} : ${l.reason ?? "sans motif"}`,
          );
        }
      }
    }

    return new Response(JSON.stringify(data ?? {}), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[republish-auto-sweep] échec :", msg);
    // 200 volontaire : pg_net ne relance pas, et un 500 ne ferait qu'ajouter
    // du bruit dans net._http_response, qui se purge tout seul. Le passage
    // suivant a lieu dans 3 minutes — rien ne se perd, rien ne s'accumule.
    return new Response(JSON.stringify({ error: msg }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
});
