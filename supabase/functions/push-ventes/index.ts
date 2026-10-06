import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import {
  type Appareil, APNS_HOTES, type BilanNote, type ConfigApns, envoyerApns, envoyerFcm, envoyerNote, lireConfigFcm,
  resumerPourLaBase,
} from "../_shared/push-envoi.ts";
import { envoyerEmail } from "../_shared/desinscription.ts";
import { langue, mailVentes } from "../_shared/emails-fillsell.ts";
import { margeUnitaire, prixAchatNum } from "../../../src/utils/comptabilite.js";

// ═══════════════════════════════════════════════════════════════════════════
// UN MAIL À CHAQUE VENTE (06/10/2026, décision de Nico) — même note, même
// décision que le push (push_ventes_a_envoyer : doublon, rattrapage de masse,
// vente déclarée, vente ancienne écartés AVANT), deuxième canal.
//   · type email_logs `vente:<id de la note>`, catégorie `support`,
//     réservation avant envoi (index unique `email_logs_vente_unique`) : un
//     mail par note, même si la fonction meurt entre l'envoi et le verdict ;
//   · AUCUN plafond de mails n'est lu ici (ni « 2 par 24 h », ni fenêtre de
//     nuit) : une vente toutes les 10 minutes = un mail toutes les 10 minutes ;
//   · le bénéfice n'est écrit que si le prix d'achat est CONNU
//     (src/utils/comptabilite.js : vide ≠ zéro).
// Le récapitulatif quotidien « ventes du jour » (email-tunnel) est supprimé.
type NoteServie = {
  id: number; user_id: string; appareils: Appareil[]; push?: boolean; mail?: boolean;
  email?: string | null; lang?: string | null; plateforme?: string | null; titre?: string | null;
  prix?: number | string | null; inventaire_id?: number | null;
} & Record<string, unknown>;

type VerdictMail = { statut: "envoye" | "deja_envoye" | "a_reessayer" | "echec" | "sans_adresse"; motif?: string };

async function envoyerMailVente(
  // deno-lint-ignore no-explicit-any
  admin: any, n: NoteServie,
): Promise<VerdictMail> {
  const adresse = String(n.email ?? "").trim();
  if (!adresse) return { statut: "sans_adresse" };
  let benefice: number | null = null;
  if (n.inventaire_id != null) {
    const { data: inv } = await admin.from("inventaire")
      .select("prix_achat, prix_achat_inconnu").eq("id", n.inventaire_id).maybeSingle();
    const pa = prixAchatNum(inv ?? null);
    benefice = pa === null ? null : margeUnitaire({ prixVente: Number(n.prix), prixAchat: pa }).margin;
  }
  const { sujet, html } = mailVentes({
    ventes: [{
      titre: n.titre == null ? null : String(n.titre),
      plateforme: String(n.plateforme ?? ""),
      prixVente: Number(n.prix) || 0,
      benefice: benefice !== null && Number.isFinite(benefice) ? benefice : null,
    }],
    retraitsACliquer: 0,
    retraitsBeebsAuto: 0,
  }, langue(n.lang));
  const r = await envoyerEmail({
    to: adresse, subject: sujet, html, type: `vente:${n.id}`,
    userId: n.user_id, categorie: "support", dedup: "reservation",
  });
  if (r.envoye) return { statut: "envoye" };
  if (r.motif === "deja_envoye") return { statut: "deja_envoye" };
  // Resend refusé, clé absente, réservation illisible : on réessaie (3 fois au plus, base).
  return { statut: "a_reessayer", motif: String(r.motif ?? "inconnu").slice(0, 120) };
}

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
  const rapport = {
    tours: 0, notes: 0, envoyees: 0, a_reessayer: 0, echecs: 0, appareils_oublies: 0,
    mails_envoyes: 0, mails_deja: 0, mails_a_reessayer: 0, mails_sans_adresse: 0, erreurs: [] as string[],
  };

  while (rapport.tours < 6 && Date.now() < fin) {
    rapport.tours++;
    const { data, error } = await admin.rpc("push_ventes_a_envoyer", { p_limite: 50 });
    if (error) { rapport.erreurs.push(`a_envoyer: ${error.message}`); break; }
    const notes = (data?.notes ?? []) as NoteServie[];
    if (!notes.length) {
      // Une note attend ses 15 s de calme : on patiente (borné), sinon fini.
      const attente = Number(data?.attente_s ?? -1);
      if (attente > 0 && attente <= 20 && Date.now() + attente * 1000 < fin) { await dormir(attente * 1000 + 300); continue; }
      break;
    }
    rapport.notes += notes.length;

    // Le push, pour les notes qui ont un téléphone (langue servie par la base,
    // fr par défaut). `push` absent = ancienne définition : un appareil suffit.
    const aPousser = notes.filter((n) => (n.push ?? (n.appareils ?? []).length > 0) === true);
    const bilans: BilanNote[] = await Promise.all(aPousser.map((n) =>
      envoyerNote(fetch, cfgApns, cfgFcm, n as never, n.lang === "en" ? "en" : "fr").catch((e) => ({
        id: n.id, statut: "a_reessayer" as const, motif: `exception: ${String(e?.message ?? e).slice(0, 80)}`, resultat: [],
      }))
    ));
    // Le mail, pour toute note qui le demande — chacune isolée : un mail en
    // échec ne retient ni le push ni les autres ventes.
    const mails = new Map<number, VerdictMail>();
    await Promise.all(notes.filter((n) => n.mail === true).map(async (n) => {
      const v = await envoyerMailVente(admin, n).catch((e) => ({
        statut: "a_reessayer" as const, motif: `exception: ${String(e?.message ?? e).slice(0, 80)}`,
      }));
      mails.set(n.id, v);
    }));
    const appareils = aPousser.flatMap((n) => n.appareils ?? []);
    const resume = resumerPourLaBase(bilans, appareils) as ReturnType<typeof resumerPourLaBase> & { notes: Array<Record<string, unknown>> };
    const parId = new Map<number, Record<string, unknown>>(resume.notes.map((x) => [Number(x.id), x]));
    for (const [id, v] of mails) {
      const entree = parId.get(id) ?? { id };
      entree.mail = v;
      if (!parId.has(id)) { parId.set(id, entree); resume.notes.push(entree); }
    }
    const { data: fini, error: e2 } = await admin.rpc("push_ventes_resultat", { p: resume });
    if (e2) rapport.erreurs.push(`resultat: ${e2.message}`);
    rapport.appareils_oublies += Number(fini?.appareils_oublies ?? 0);
    for (const b of bilans) {
      if (b.statut === "envoyee") rapport.envoyees++;
      else if (b.statut === "a_reessayer") rapport.a_reessayer++;
      else rapport.echecs++;
    }
    for (const v of mails.values()) {
      if (v.statut === "envoye") rapport.mails_envoyes++;
      else if (v.statut === "deja_envoye") rapport.mails_deja++;
      else if (v.statut === "sans_adresse") rapport.mails_sans_adresse++;
      else rapport.mails_a_reessayer++;
    }
    console.log(`[push-ventes] ${JSON.stringify(notes.map((n) => ({
      id: n.id, push: bilans.find((b) => b.id === n.id)?.statut ?? null, mail: mails.get(n.id)?.statut ?? null,
    })))}`);
  }
  return json({ ok: rapport.erreurs.length === 0, ...rapport });
});
