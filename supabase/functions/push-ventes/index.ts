import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import {
  type Appareil, APNS_HOTES, type BilanNote, type ConfigApns, envoyerApns, envoyerFcm, envoyerNote, lireConfigFcm,
  resumerPourLaBase,
} from "../_shared/push-envoi.ts";

// ═══════════════════════════════════════════════════════════════════════════
// push-ventes — UNE NOTIFICATION À CHAQUE VENTE (06/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// La base note chaque vente vue (table push_ventes, migration
// 20261006140000) ; cette fonction choisit ce qui part
// (push_ventes_a_envoyer : 15 s de calme, doublons écartés, rattrapage de
// masse ignoré), envoie à chaque appareil du compte (APNs / FCM,
// _shared/push-envoi.ts), puis rend le verdict (push_ventes_resultat : jetons
// refusés oubliés, envoi à réessayer remis en file, trois essais au plus).
//
// Appelants (x-cron-secret, verify_jwt = false) :
//   · push_noter, par pg_net, juste après la transaction qui a vu la vente ;
//   · le cron push-ventes-1min, seulement s'il reste une note en file.
// Plusieurs appels simultanés ne doublent rien : la base passe chaque note en
// 'en_envoi' sous verrou (FOR UPDATE SKIP LOCKED) avant de la rendre.
//
// Secrets : APNS_KEY_ID, APNS_TEAM_ID (défaut BQ379Y93X3), APNS_PRIVATE_KEY
// (le .p8), APNS_TOPIC (défaut app.fillsell.app) ; FCM_SERVICE_ACCOUNT (le
// JSON du compte de service Firebase). Un secret absent n'oublie JAMAIS un
// appareil : la note finit en « echec » avec le motif, lisible en base.
// Notifications de SERVICE uniquement (règles Apple/Google) : ce canal ne
// porte que des ventes, jamais de marketing.

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  // Diagnostic sans envoi : la configuration est-elle posée, et les deux
  // passerelles répondent-elles depuis CE runtime (APNs exige HTTP/2) ?
  if (corps?.diagnostic === "passerelles") {
    const sonde = async (url: string, init: RequestInit) => {
      try {
        const r = await fetch(url, init);
        const t = await r.text().catch(() => "");
        return { statut: r.status, corps: t.slice(0, 160) };
      } catch (e) {
        return { erreur: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    };
    return json({
      apns_configure: configApns() != null,
      fcm_configure: lireConfigFcm(Deno.env.get("FCM_SERVICE_ACCOUNT")) != null,
      // Sans jeton d'auteur, Apple répond 403 MissingProviderToken : la preuve
      // que la passerelle est joignable en HTTP/2.
      apns_production: await sonde(`${APNS_HOTES.production}/3/device/0000`, {
        method: "POST", headers: { "apns-topic": "app.fillsell.app" }, body: "{}",
      }),
      fcm: await sonde("https://fcm.googleapis.com/v1/projects/diagnostic/messages:send", { method: "POST", body: "{}" }),
    });
  }

  const cfgApns = configApns();
  const cfgFcm = lireConfigFcm(Deno.env.get("FCM_SERVICE_ACCOUNT"));

  // Les VRAIES clés, éprouvées sans rien envoyer à personne (scripts/
  // binaires-2.9.62.mjs) : un jeton factice fait répondre Apple « BadDeviceToken »
  // et Google « jeton invalide » SEULEMENT si la clé est acceptée ; une clé
  // refusée donne 403 (Apple) ou 401/403 (Google).
  if (corps?.diagnostic === "cles") {
    const factice: Appareil[] = [
      { id: "essai-ios", plateforme: "ios", jeton: "0".repeat(64) },
      { id: "essai-android", plateforme: "android", jeton: "jeton-factice-diagnostic-fillsell" },
    ];
    const m = { titre: "diagnostic", corps: "diagnostic", donnees: { type: "diagnostic" } };
    const apns = await envoyerApns(fetch, cfgApns, factice[0], m);
    const fcm = await envoyerFcm(fetch, cfgFcm, factice[1], m);
    return json({
      apns: { ...apns, cle_acceptee: apns.etat === "invalide" || apns.etat === "ok" },
      fcm: { ...fcm, cle_acceptee: fcm.etat === "invalide" || fcm.etat === "ok", projet: cfgFcm?.projectId ?? null },
    });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const fin = Date.now() + 55_000;
  const rapport = { tours: 0, notes: 0, envoyees: 0, a_reessayer: 0, echecs: 0, appareils_oublies: 0, erreurs: [] as string[] };

  while (rapport.tours < 6 && Date.now() < fin) {
    rapport.tours++;
    const { data, error } = await admin.rpc("push_ventes_a_envoyer", { p_limite: 50 });
    if (error) { rapport.erreurs.push(`a_envoyer: ${error.message}`); break; }
    const notes = (data?.notes ?? []) as Array<{ id: number; user_id: string; appareils: Appareil[] } & Record<string, unknown>>;
    if (!notes.length) {
      // Une note attend ses 15 s de calme : on patiente (borné), sinon fini.
      const attente = Number(data?.attente_s ?? -1);
      if (attente > 0 && attente <= 20 && Date.now() + attente * 1000 < fin) { await dormir(attente * 1000 + 300); continue; }
      break;
    }
    rapport.notes += notes.length;

    // La langue de chacun (fr par défaut).
    const langues = new Map<string, string>();
    const ids = [...new Set(notes.map((n) => n.user_id))];
    const { data: profils } = await admin.from("profiles").select("id, lang").in("id", ids);
    for (const p of profils ?? []) langues.set(p.id, p.lang === "en" ? "en" : "fr");

    const bilans: BilanNote[] = await Promise.all(notes.map((n) =>
      envoyerNote(fetch, cfgApns, cfgFcm, n as never, langues.get(n.user_id) ?? "fr").catch((e) => ({
        id: n.id, statut: "a_reessayer" as const, motif: `exception: ${String(e?.message ?? e).slice(0, 80)}`, resultat: [],
      }))
    ));
    const appareils = notes.flatMap((n) => n.appareils ?? []);
    const resume = resumerPourLaBase(bilans, appareils);
    const { data: fini, error: e2 } = await admin.rpc("push_ventes_resultat", { p: resume });
    if (e2) rapport.erreurs.push(`resultat: ${e2.message}`);
    rapport.appareils_oublies += Number(fini?.appareils_oublies ?? 0);
    for (const b of bilans) {
      if (b.statut === "envoyee") rapport.envoyees++;
      else if (b.statut === "a_reessayer") rapport.a_reessayer++;
      else rapport.echecs++;
    }
    console.log(`[push-ventes] ${JSON.stringify(bilans.map((b) => ({ id: b.id, statut: b.statut, motif: b.motif })))}`);
  }
  return json({ ok: rapport.erreurs.length === 0, ...rapport });
});
