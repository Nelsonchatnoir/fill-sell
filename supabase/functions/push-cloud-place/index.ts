import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import {
  type Appareil, type BilanNote, type ConfigApns, type ConfigFcm, envoyerNote, lireConfigFcm, resumerPourLaBase,
} from "../_shared/push-envoi.ts";
import { langueNotification, messagePlaceLibre, mailPlaceLibre, TYPE_MAIL_PLACE } from "./message.js";
import { envoyerEmail } from "../_shared/desinscription.ts";
import { mailCloud } from "../_shared/emails-fillsell.ts";

// ═══════════════════════════════════════════════════════════════════════════
// PUSH-CLOUD-PLACE — « UNE PLACE FILLSELL CLOUD EST LIBRE » (03/11/2026, point 5 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// La liste d'attente du Cloud (migration 20261103203000) : quand une place se libère (place serveur ET IP), les
// premiers inscrits — autant que de places — reçoivent UNE notification ; la place leur est gardée 24 h et l'app
// montre un bandeau (src/cloud/HoteCloud.jsx). (20/11/2026, ordre de Nico) UN MAIL « ta place est prête » part À CHAQUE
// FOIS — en plus du push, ou seul sans appareil / quand le push échoue — et les 24 h ne démarrent qu'à l'envoi RÉEL
// (notifie_le = l'heure du premier envoi réussi). Une place « prévenue » sans rien reçu (sans_appareil, avant le 20/11)
// reçoit son mail au passage suivant, et ses 24 h repartent de là.
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
  // (20/11/2026) Les places offertes SANS appareil (la base ne les rend pas : rien à pousser) et jamais mailées : le mail
  // seul, et leurs 24 h démarrent à son envoi.
  const { data: sansApp } = await admin.from("cloud_attente").select("user_id, notif_resultat")
    .eq("notif_statut", "sans_appareil").not("inscrit_le", "is", null).not("notifie_le", "is", null).limit(50);
  const aMailerSeuls = ((sansApp ?? []) as Array<{ user_id: string; notif_resultat: Record<string, unknown> | null }>)
    .filter((r) => !(r.notif_resultat && typeof r.notif_resultat === "object" && (r.notif_resultat as Record<string, unknown>).mail_le))
    // (20/11/2026 soir, 20261120210000) 3 essais de mail au plus (le cron les rejoue sans attendre un nouvel inscrit).
    .filter((r) => Number(((r.notif_resultat ?? {}) as Record<string, unknown>).mail_essais ?? 0) < 3)
    .map((r) => String(r.user_id));
  if (!notes.length && !aMailerSeuls.length) return json({ notes: 0 });
  // Le mail « ta place est prête » (catégorie « support », comme les autres mails du Cloud : CATEGORIE_MAILS_CLOUD) ; rend
  // l'heure de l'envoi réussi, ou null.
  const envoyerMailPlace = async (userId: string): Promise<{ le: string | null; motif: string | null }> => {
    try {
      const { data: u } = await admin.auth.admin.getUserById(userId);
      const email = u?.user?.email ?? null;
      if (!email) return { le: null, motif: "sans_adresse" };
      const { data: p } = await admin.from("profiles").select("lang").eq("id", userId).maybeSingle();
      const t = mailPlaceLibre((p as { lang?: string | null } | null)?.lang ?? "fr");
      const m = mailCloud({ lang: t.lang as "fr" | "en", sujet: t.sujet, titre: t.titre, preheader: t.preheader, paragraphes: t.paragraphes, bouton: t.bouton, raisonEnvoi: t.raisonEnvoi });
      const r = await envoyerEmail({ to: email, subject: m.sujet, html: m.html, userId, type: TYPE_MAIL_PLACE, categorie: "support", dedup: "journal" });
      return r.envoye ? { le: new Date().toISOString(), motif: null } : { le: null, motif: r.motif ?? "non_envoye" };
    } catch (e) { return { le: null, motif: `exception: ${String((e as Error)?.message ?? e).slice(0, 80)}` }; }
  };
  // L'heure RÉELLE de l'offre : notifie_le = le premier envoi réussi (push ou mail) ; la trace du mail dans notif_resultat.
  const noterEnvoi = async (userId: string, le: string, canal: string, mail: { le: string | null; motif: string | null }) => {
    const { data: ligne } = await admin.from("cloud_attente").select("notif_resultat").eq("user_id", userId).maybeSingle();
    const avant = ((ligne as { notif_resultat?: unknown } | null)?.notif_resultat ?? null);
    const resultat = { ...(avant && typeof avant === "object" && !Array.isArray(avant) ? avant as Record<string, unknown> : avant != null ? { push: avant } : {}),
      canal, mail_le: mail.le, mail_motif: mail.motif, envoi_reel_le: le };
    await admin.from("cloud_attente").update({ notifie_le: le, derniere_le: le, notif_statut: "envoyee", notif_resultat: resultat }).eq("user_id", userId);
  };
  // (20/11/2026 soir) Un mail raté pour une place sans appareil : l'essai est compté (mail_essais), le cron le rejoue.
  const noterEchecMail = async (userId: string, motif: string | null) => {
    const { data: ligne } = await admin.from("cloud_attente").select("notif_resultat").eq("user_id", userId).maybeSingle();
    const avant = ((ligne as { notif_resultat?: unknown } | null)?.notif_resultat ?? null);
    const r = avant && typeof avant === "object" && !Array.isArray(avant) ? { ...(avant as Record<string, unknown>) } : {};
    r.mail_essais = Number(r.mail_essais ?? 0) + 1; r.mail_motif = motif;
    await admin.from("cloud_attente").update({ notif_resultat: r }).eq("user_id", userId);
  };
  if (!notes.length) {
    const seuls = await Promise.all(aMailerSeuls.map(async (id) => ({ id, mail: await envoyerMailPlace(id) })));
    for (const s of seuls) { if (s.mail.le) await noterEnvoi(s.id, s.mail.le, "mail", s.mail); else await noterEchecMail(s.id, s.mail.motif); }
    const rapportMail = { notes: 0, mails_seuls: seuls.length, mails_envoyes: seuls.filter((s) => s.mail.le).length,
      mails_rates: seuls.filter((s) => !s.mail.le).map((s) => s.mail.motif) };
    console.log(`[push-cloud-place] ${JSON.stringify(rapportMail)}`);
    return json(rapportMail);
  }
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
  // (20/11/2026) Le mail À CHAQUE FOIS (avec le push, ou seul s'il a échoué) ; puis les places sans appareil jamais mailées.
  // notifie_le = l'heure du premier envoi réussi ; ni push ni mail : la base garde son verdict (renvoi, 3 essais au plus).
  const mails = await Promise.all(notes.map(async (n) => ({ id: n.id, mail: await envoyerMailPlace(n.user_id) })));
  for (const m of mails) {
    const push = bilans.find((b) => b.id === m.id)?.statut === "envoyee";
    const le = push ? new Date().toISOString() : m.mail.le;
    if (le) await noterEnvoi(m.id, le, push && m.mail.le ? "push+mail" : push ? "push" : "mail", m.mail);
  }
  const seuls = await Promise.all(aMailerSeuls.filter((id) => !notes.some((n) => n.id === id)).map(async (id) => ({ id, mail: await envoyerMailPlace(id) })));
  for (const s of seuls) { if (s.mail.le) await noterEnvoi(s.id, s.mail.le, "mail", s.mail); else await noterEchecMail(s.id, s.mail.motif); }
  const rapport = {
    notes: notes.length,
    envoyees: bilans.filter((b) => b.statut === "envoyee").length,
    a_reessayer: bilans.filter((b) => b.statut === "a_reessayer").length,
    echecs: bilans.filter((b) => b.statut === "echec").length,
    appareils_oublies: Number(fini?.appareils_oublies ?? 0),
    mails_envoyes: mails.filter((m) => m.mail.le).length + seuls.filter((s) => s.mail.le).length,
    mails_rates: [...mails, ...seuls].filter((m) => !m.mail.le).map((m) => m.mail.motif),
  };
  console.log(`[push-cloud-place] ${JSON.stringify(rapport)}`);
  return json(rapport);
});
