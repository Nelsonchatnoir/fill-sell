import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import {
  type Appareil, type BilanNote, type ConfigApns, type ConfigFcm, envoyerNote, lireConfigFcm, resumerPourLaBase,
} from "../_shared/push-envoi.ts";
import { langueNotification, messagePlaceLibre } from "./message.js";

// ═══════════════════════════════════════════════════════════════════════════
// PUSH-CLOUD-PLACE — « UNE PLACE FILLSELL CLOUD EST LIBRE » (03/11/2026, point 5 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// La liste d'attente du Cloud (migration 20261103203000) : quand une place se libère (place serveur ET IP), les
// premiers inscrits — autant que de places — reçoivent UNE notification ; la place leur est gardée 24 h et l'app
// montre un bandeau (src/cloud/HoteCloud.jsx). ⛔ AUCUN MAIL sur ce chemin.
// LA BASE DÉCIDE (cloud_attente_a_prevenir : qui, combien, sous verrou ; la place est gardée AVANT l'envoi) ;
// ici : le texte (message.js, langue du profil), l'envoi APNs / FCM (le même envoyerNote que les ventes), le
// verdict (cloud_attente_resultat : 3 essais au plus, jetons morts oubliés comme pour une vente).
// Appelant : le cron push-cloud-place-5min (x-cron-secret, verify_jwt = false), seulement s'il y a quelqu'un à
// prévenir (cloud_attente_a_prevenir_existe). Déploiement : --no-verify-jwt.
// Secrets : ceux de push-ventes (APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_TOPIC, FCM_SERVICE_ACCOUNT,
// CRON_SECRET). Un secret absent n'oublie jamais un appareil : la note finit « echec » avec son motif, en base.
type Note = { id: string; user_id: string; appareils: Appareil[]; lang?: string | null };

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

function configApns(): ConfigApns | null {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const cleP8 = Deno.env.get("APNS_PRIVATE_KEY");
  if (!keyId || !cleP8) return null;
  return {
    keyId, cleP8,
    teamId: Deno.env.get("APNS_TEAM_ID") || "BQ379Y93X3",
    topic: Deno.env.get("APNS_TOPIC") || "app.fillsell.app",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!attendu || req.headers.get("x-cron-secret") !== attendu) return json({ error: "Non autorisé" }, 401);
  const corps = await req.json().catch(() => ({}));
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Aperçu sans envoi ni écriture : combien de places à offrir, qui attend (aucun jeton rendu).
  if (corps?.apercu === true) {
    const [{ data: places, error: e1 }, { data: existe, error: e2 }] = await Promise.all([
      admin.rpc("cloud_attente_places_a_offrir"), admin.rpc("cloud_attente_a_prevenir_existe"),
    ]);
    return json({ places_a_offrir: places ?? null, a_prevenir: existe ?? null, erreur: e1?.message ?? e2?.message ?? null });
  }

  const { data, error } = await admin.rpc("cloud_attente_a_prevenir", { p_limite: 20 });
  if (error) {
    console.error(`[push-cloud-place] cloud_attente_a_prevenir : ${error.message}`);
    return json({ error: "lecture_impossible" }, 500);
  }
  const notes = (Array.isArray(data) ? data : []) as Note[];
  if (!notes.length) return json({ notes: 0 });
  const cfgApns = configApns();
  const cfgFcm = lireConfigFcm(Deno.env.get("FCM_SERVICE_ACCOUNT"));
  const bilans: BilanNote[] = await Promise.all(notes.map((n) => {
    const lang = langueNotification(n.lang);
    return envoyerNote(fetch, cfgApns, cfgFcm, { id: n.id, appareils: n.appareils ?? [] }, lang, Date.now(), messagePlaceLibre(n, lang))
      .catch((e) => ({ id: n.id, statut: "a_reessayer" as const, motif: `exception: ${String(e?.message ?? e).slice(0, 80)}`, resultat: [] }));
  }));
  const resume = resumerPourLaBase(bilans, notes.flatMap((n) => n.appareils ?? []));
  const { data: fini, error: e3 } = await admin.rpc("cloud_attente_resultat", { p: resume });
  if (e3) console.error(`[push-cloud-place] cloud_attente_resultat : ${e3.message}`);
  const rapport = {
    notes: notes.length,
    envoyees: bilans.filter((b) => b.statut === "envoyee").length,
    a_reessayer: bilans.filter((b) => b.statut === "a_reessayer").length,
    echecs: bilans.filter((b) => b.statut === "echec").length,
    appareils_oublies: Number(fini?.appareils_oublies ?? 0),
  };
  console.log(`[push-cloud-place] ${JSON.stringify(rapport)}`);
  return json(rapport);
});
