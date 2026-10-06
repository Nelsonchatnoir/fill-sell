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

  // Une preuve illisible arrête l'appel après ce tour : la reprise attend le
  // passage suivant (cron d'une minute), jamais trois essais en quelques secondes.
  let finirApres = false;
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

    // ── UNE ANNONCE VINTED DÉJÀ VUE VENDUE UN JOUR PRÉCÉDENT N'EST PAS UNE
    // VENTE DU MOMENT (06/10 soir, Louis/Amiral) ─────────────────────────────
    // Fiches à quantité (9997) : à chaque relevé, la fiche repasse « vendue »
    // sur une ANCIENNE annonce (10184114204 vendue depuis le 30/09,
    // 10152002902 depuis le 04/10…) et le déclencheur de l'inventaire la note
    // comme une vente neuve : 4 mails à tort le 06/10 à 17:03. Ici, avant tout
    // envoi : si une clé « annonce:vinted:<n°> » désigne une annonce déjà vue
    // « sold » par un relevé d'un jour PRÉCÉDENT (vinted_listing_snapshots, une
    // ligne par annonce et par jour), rien ne part (motif « vente_ancienne »).
    // Et la preuve qu'elle est RÉCENTE (Anastasia H, 16:58) : la veille a vu
    // « vendue » deux annonces Vinted dont le dernier relevé en ligne datait
    // du 06/09 — la vente peut avoir un mois. Une vente Vinted ne part que si
    // son annonce a été vue EN LIGNE par un relevé hier ou aujourd'hui, ou si
    // FillSell l'a publiée il y a moins de 48 h. Sinon : « vente_ancienne ».
    // ⛔ Une note qui porte SA DATE DE VENTE (commande lue sur la plateforme :
    // vendu_le, < 24 h garanti par push_trg_ventes) est sa propre preuve : elle
    // n'attend aucun relevé de la boutique (sinon une vraie vente du jour
    // partirait sans mail chez tout compte non relevé la veille), et une
    // annonce à quantité vendue une 2e fois est une 2e vente.
    // ⛔ (06/10 soir, migration 20261006210000) Une note qui porte la preuve de
    // son déclencheur (preuve_recente : la veille ou un relevé l'a vue EN LIGNE
    // hier ou aujourd'hui, ou FillSell l'a publiée < 48 h) n'attend plus un
    // relevé de la boutique ; « déjà vue vendue un jour précédent » reste exigé.
    // Une lecture ratée ne laisse RIEN partir : ces notes sont reprises au
    // passage suivant (trois essais au plus, base).
    const anciennes = new Set<number>();
    const aReprendre = new Set<number>();
    try {
      const { data: lignes } = await admin.from("push_ventes").select("id, user_id, cles, job_id, vendu_le, preuve_recente").in("id", notes.map((n) => n.id));
      if (!lignes) throw new Error("notes illisibles");
      const parNote = new Map<number, { user: string; items: string[]; job: string | null; prouvee: boolean }>();
      for (const l of lignes as Array<{ id: number; user_id: string; cles: string[] | null; job_id: string | null; vendu_le: string | null; preuve_recente: string | null }>) {
        const datee = Date.parse(String(l.vendu_le ?? ""));
        if (Number.isFinite(datee) && Date.now() - datee < 48 * 3_600_000) continue; // date de vente récente = preuve
        const items = (l.cles ?? []).map((k) => /^annonce:vinted:(\d+)$/.exec(String(k))?.[1]).filter(Boolean) as string[];
        if (items.length) parNote.set(Number(l.id), { user: l.user_id, items, job: l.job_id, prouvee: Boolean(l.preuve_recente) });
      }
      if (parNote.size) {
        const jourParis = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(t));
        const aujourdHui = jourParis(Date.now());
        const hier = jourParis(Date.now() - 86_400_000);
        const users = [...new Set([...parNote.values()].map((v) => v.user))];
        const items = [...new Set([...parNote.values()].flatMap((v) => v.items))];
        const { data: snaps, error: eS } = await admin.from("vinted_listing_snapshots")
          .select("user_id, vinted_item_id, status, captured_on")
          .in("user_id", users).in("vinted_item_id", items)
          .gte("captured_on", hier).limit(2000);
        const { data: vendues, error: eV } = await admin.from("vinted_listing_snapshots")
          .select("user_id, vinted_item_id")
          .in("user_id", users).in("vinted_item_id", items)
          .eq("status", "sold").lt("captured_on", aujourdHui).limit(1000);
        if (eS || eV) throw new Error(`relevés illisibles : ${(eS ?? eV)?.message}`);
        const jobs = [...new Set([...parNote.values()].map((v) => v.job).filter(Boolean))] as string[];
        const { data: pubs } = jobs.length
          ? await admin.from("cross_post_jobs").select("id, published_at").in("id", jobs)
          : { data: [] };
        const venduAvant = new Set(((vendues ?? []) as Array<{ user_id: string; vinted_item_id: string }>).map((v) => `${v.user_id}|${v.vinted_item_id}`));
        const enLigneRecent = new Set(((snaps ?? []) as Array<{ user_id: string; vinted_item_id: string; status: string }>)
          .filter((s) => s.status !== "sold").map((s) => `${s.user_id}|${s.vinted_item_id}`));
        const publieRecent = new Set(((pubs ?? []) as Array<{ id: string; published_at: string | null }>)
          .filter((p) => p.published_at && Date.now() - Date.parse(p.published_at) < 48 * 3_600_000).map((p) => p.id));
        for (const [id, v] of parNote) {
          if (v.items.some((it) => venduAvant.has(`${v.user}|${it}`))) { anciennes.add(id); continue; }
          const recente = v.prouvee || v.items.some((it) => enLigneRecent.has(`${v.user}|${it}`)) || (v.job != null && publieRecent.has(v.job));
          if (!recente) anciennes.add(id);
        }
      }
    } catch (e) {
      rapport.erreurs.push(`ventes anciennes : ${String((e as Error)?.message ?? e).slice(0, 120)}`);
      // Rien n'est prouvé : aucune note Vinted sans commande lue (vente_id) ne
      // part à ce passage.
      for (const n of notes) {
        if (String(n.plateforme ?? "") === "vinted" && n.vente_id == null) aReprendre.add(Number(n.id));
      }
    }
    if (aReprendre.size) {
      const { error: eR } = await admin.rpc("push_ventes_resultat", { p: { notes: notes.filter((n) => aReprendre.has(Number(n.id))).map((n) => ({
        id: n.id,
        ...((n.push ?? (n.appareils ?? []).length > 0) ? { statut: "a_reessayer", motif: "preuve_illisible" } : {}),
        ...(n.mail === true ? { mail: { statut: "a_reessayer", motif: "preuve_illisible" } } : {}),
      })) } });
      if (eR) rapport.erreurs.push(`resultat (reprises): ${eR.message}`);
      notes.splice(0, notes.length, ...notes.filter((n) => !aReprendre.has(Number(n.id))));
      finirApres = true;
      if (!notes.length) break;
    }
    if (anciennes.size) {
      const resumeAnciennes = {
        notes: notes.filter((n) => anciennes.has(Number(n.id))).map((n) => ({
          id: n.id,
          ...((n.push ?? (n.appareils ?? []).length > 0) ? { statut: "echec", motif: "vente_ancienne" } : {}),
          ...(n.mail === true ? { mail: { statut: "echec", motif: "vente_ancienne" } } : {}),
        })),
      };
      const { error: eA } = await admin.rpc("push_ventes_resultat", { p: resumeAnciennes });
      if (eA) rapport.erreurs.push(`resultat (anciennes): ${eA.message}`);
      console.log(`[push-ventes] ${anciennes.size} vente(s) ancienne(s) écartée(s) : ${[...anciennes].join(", ")}`);
      notes.splice(0, notes.length, ...notes.filter((n) => !anciennes.has(Number(n.id))));
      if (!notes.length) continue;
    }

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
    if (finirApres) break;
  }
  return json({ ok: rapport.erreurs.length === 0, ...rapport });
});
