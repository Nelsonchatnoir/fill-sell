import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
// (18/11/2026, lot T2 point 2 — ordre de Nico) « C'est l'heure de ton créneau » : une note par créneau, quand un lot attend.
import { type Appareil, type ConfigApns, envoyerNote, lireConfigFcm } from "../_shared/push-envoi.ts";
import { notesCreneau, messageCreneau, FENETRE_OUVERTURE_MS, FEATURE_PUSH_CRENEAU } from "../_shared/push-creneau.js";
import { lotsLancesMaintenant } from "../_shared/lot-manuel-creneau.js";

// ── (18/11, lot T2 point 2) LA NOTE DU CRÉNEAU ───────────────────────────────────────────────────────────────────────
// Après le balayage, à chaque passage (*/3) : les créneaux ouverts depuis moins de 15 min (republish_creneaux, posée à
// l'ouverture), les republications de lot qui les attendent, et une note par compte et par créneau
// (_shared/push-creneau.js décide ; ici, seulement les lectures bornées, la trace AVANT l'envoi, l'envoi APNs / FCM).
// Lectures bornées : 500 créneaux, 200 comptes, 1 000 tâches par tranche de 50 comptes (5 tranches au plus), les lots par
// 20. Jamais un point de panne du balayage : tout est dans un try/catch, qui ne fait que journaliser.
function configApns(): ConfigApns | null {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const cleP8 = Deno.env.get("APNS_PRIVATE_KEY");
  if (!keyId || !cleP8) return null;
  return { keyId, cleP8, teamId: Deno.env.get("APNS_TEAM_ID") || "BQ379Y93X3", topic: Deno.env.get("APNS_TOPIC") || "app.fillsell.app" };
}

// deno-lint-ignore no-explicit-any
async function pousserCreneaux(admin: any): Promise<Record<string, unknown>> {
  const maintenant = Date.now();
  const { data: crs, error: e1 } = await admin.from("republish_creneaux").select("user_id, platform, jour, de, debut")
    .gte("debut", new Date(maintenant - FENETRE_OUVERTURE_MS).toISOString()).lte("debut", new Date(maintenant).toISOString()).limit(500);
  if (e1) throw new Error(`creneaux: ${e1.message}`);
  if (!crs?.length) return { creneaux: 0, notes: 0 };
  const comptes = [...new Set((crs as Array<{ user_id: string }>).map((c) => String(c.user_id)))].slice(0, 200);
  const jobs: Array<Record<string, unknown>> = [];
  for (let i = 0; i < comptes.length && i < 250; i += 50) {
    const { data, error } = await admin.from("cross_post_jobs")
      .select("user_id, platform, bulk_batch_id, inventaire_id, source:platform_fields->>republish_source")
      .in("user_id", comptes.slice(i, i + 50)).eq("status", "pending").eq("action", "republish").not("bulk_batch_id", "is", null)
      .limit(1000);
    if (error) throw new Error(`jobs: ${error.message}`);
    jobs.push(...(data ?? []));
  }
  if (!jobs.length) return { creneaux: crs.length, notes: 0 };
  const lotsIds = [...new Set(jobs.map((j) => String(j.bulk_batch_id ?? "")).filter(Boolean))].slice(0, 100);
  const lignesLots: Array<Record<string, unknown>> = [];
  for (let i = 0; i < lotsIds.length; i += 20) {
    const { data, error } = await admin.from("cross_post_jobs").select("bulk_batch_id, inventaire_id, created_at")
      .eq("action", "republish").in("bulk_batch_id", lotsIds.slice(i, i + 20)).limit(1000);
    if (error) throw new Error(`lots: ${error.message}`);
    lignesLots.push(...(data ?? []));
  }
  const avecJobs = [...new Set(jobs.map((j) => String(j.user_id)))];
  const [{ data: profils }, { data: deja }] = await Promise.all([
    admin.from("profiles").select("id, lang, cloud_voie, lots_maintenant:platform_settings->lots_maintenant").in("id", avecJobs),
    admin.from("usage_logs").select("user_id, created_at, cle:metadata->>cle").eq("feature", FEATURE_PUSH_CRENEAU)
      .in("user_id", avecJobs).gte("created_at", new Date(maintenant - 24 * 3600_000).toISOString()).limit(1000),
  ]);
  const parProfil = new Map(((profils ?? []) as Array<Record<string, unknown>>).map((p) => [String(p.id), p]));
  const lotsMaintenant = new Map(avecJobs.map((u) => [u, lotsLancesMaintenant(parProfil.get(u)?.lots_maintenant ?? null, maintenant) as Set<string>]));
  const notes = notesCreneau({ creneaux: crs, jobs: jobs as never[], lignesLots: lignesLots as never[], lotsMaintenant, deja: deja ?? [], maintenant });
  if (!notes.length) return { creneaux: crs.length, notes: 0 };
  const { data: apps } = await admin.from("appareils_push").select("id, user_id, plateforme, jeton, apns_env").in("user_id", notes.map((n) => n.user_id));
  const cfgApns = configApns();
  const cfgFcm = lireConfigFcm(Deno.env.get("FCM_SERVICE_ACCOUNT"));
  let envoyees = 0, sansAppareil = 0, echecs = 0;
  for (const n of notes) {
    const appareils = ((apps ?? []) as Array<Appareil & { user_id: string }>).filter((a) => String(a.user_id) === n.user_id);
    const p = parProfil.get(n.user_id) ?? {};
    const lang = String(p.lang ?? "fr").toLowerCase().startsWith("en") ? "en" : "fr";
    // La trace d'abord : un passage qui recommence (ou un envoi figé) ne renvoie jamais la même note.
    const { error: eT } = await admin.from("usage_logs").insert({ user_id: n.user_id, feature: FEATURE_PUSH_CRENEAU,
      metadata: { cle: n.cle, plateformes: n.plateformes, n: n.n, appareils: appareils.length } });
    if (eT) { console.warn(`[republish-auto-sweep] note du créneau ${n.user_id} ${n.cle} : trace impossible (${eT.message}) — rien n'est envoyé`); continue; }
    if (!appareils.length) { sansAppareil++; continue; }
    const bilan = await envoyerNote(fetch, cfgApns, cfgFcm, { id: `creneau-${n.cle}`, appareils }, lang, Date.now(),
      messageCreneau(n, { lang, cloud: p.cloud_voie === true })).catch((e) => ({ statut: "echec", motif: String((e as Error)?.message ?? e).slice(0, 80) }));
    if (bilan.statut === "envoyee") envoyees++; else echecs++;
    console.log(`[republish-auto-sweep] note du créneau ${n.user_id} ${n.cle} (${n.plateformes.join("+")}, ${n.n} en attente) : ${bilan.statut}${"motif" in bilan && bilan.motif ? ` (${bilan.motif})` : ""}`);
  }
  return { creneaux: crs.length, notes: notes.length, envoyees, sans_appareil: sansAppareil, echecs };
}

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

    // (18/11, lot T2 point 2) La note du créneau : jamais un point de panne du balayage.
    let noteCreneau: Record<string, unknown> | null = null;
    try {
      noteCreneau = await pousserCreneaux(supabase);
      if (Number(noteCreneau.notes ?? 0) > 0) console.log(`[republish-auto-sweep] notes du créneau : ${JSON.stringify(noteCreneau)}`);
    } catch (e) {
      console.error("[republish-auto-sweep] note du créneau : échec :", e instanceof Error ? e.message : String(e));
    }

    return new Response(JSON.stringify({ ...((data ?? {}) as Record<string, unknown>), note_creneau: noteCreneau }), {
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
