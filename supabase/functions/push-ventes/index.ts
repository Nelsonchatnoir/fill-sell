import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import {
  type Appareil, APNS_HOTES, type BilanNote, type ConfigApns, type ConfigFcm, envoyerApns, envoyerFcm, envoyerNote,
  lireConfigFcm, prixVenteConnu, resumerPourLaBase,
} from "../_shared/push-envoi.ts";
// (25/10, point 3 de Nico) « Vente annulée — <titre> : remettre en vente ? » : le texte, pur (selftest push-annulation).
import { langueNotif, messageAnnulation } from "../_shared/push-annulation.js";
import { envoyerEmail } from "../_shared/desinscription.ts";
import { langue, mailVentes } from "../_shared/emails-fillsell.ts";
// (24/10, lot « zéro blocage », A9) Les ventes d'un même passage partent dans UN mail.
import { groupesDeMail } from "../_shared/ventes-un-mail.js";
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
// (17/10, point 11) Un article de la note d'une commande Vinted (push_ventes.articles).
type ArticleNote = { titre?: string | null; prix?: number | string | null; inventaire_id?: number | null };

type NoteServie = {
  id: number; user_id: string; appareils: Appareil[]; push?: boolean; mail?: boolean;
  email?: string | null; lang?: string | null; plateforme?: string | null; titre?: string | null;
  prix?: number | string | null; inventaire_id?: number | null; a_decider?: boolean;
  articles?: ArticleNote[] | null;
} & Record<string, unknown>;

type VerdictMail = { statut: "envoye" | "deja_envoye" | "a_reessayer" | "echec" | "sans_adresse"; motif?: string };

// Une ligne du mail : la note elle-même (un article), ou un article de la commande —
// même règle de prix et de bénéfice pour chacun.
async function ligneDuMail(
  // deno-lint-ignore no-explicit-any
  admin: any, n: ArticleNote, plateforme: string,
) {
  // (16/10, C1) Prix de vente INCONNU (note sans prix) : le mail n'écrit aucun
  // montant et aucun bénéfice. Avant : Number(null) || 0 → « vendu 0 € », et un
  // bénéfice négatif (0 − prix d'achat) quand le prix d'achat était connu.
  const prixVente = prixVenteConnu(n.prix);
  let benefice: number | null = null;
  if (prixVente !== null && n.inventaire_id != null) {
    const { data: inv } = await admin.from("inventaire")
      .select("prix_achat, prix_achat_inconnu").eq("id", n.inventaire_id).maybeSingle();
    const pa = prixAchatNum(inv ?? null);
    benefice = pa === null ? null : margeUnitaire({ prixVente, prixAchat: pa }).margin;
  }
  return {
    titre: n.titre == null ? null : String(n.titre),
    plateforme,
    prixVente,
    benefice: benefice !== null && Number.isFinite(benefice) ? benefice : null,
  };
}

async function envoyerMailVente(
  // deno-lint-ignore no-explicit-any
  admin: any, n: NoteServie, groupe: NoteServie[] = [n],
): Promise<VerdictMail> {
  const adresse = String(n.email ?? "").trim();
  if (!adresse) return { statut: "sans_adresse" };
  // (17/10, point 11) UNE COMMANDE VINTED = UN MAIL QUI LISTE TOUS SES ARTICLES : la
  // note d'une commande porte ses articles (push_ventes.articles, migration
  // 20261017120000). Une note sans articles — toute autre vente, ou une base
  // d'avant la migration (champ absent) — reste UN article, comme avant.
  const articles: ArticleNote[] = Array.isArray(n.articles) && n.articles.length ? n.articles : [n];
  const ventesTete = await Promise.all(articles.map((a) => ligneDuMail(admin, a, String(n.plateforme ?? ""))));
  // (24/10, A9) Les autres ventes du même passage s'ajoutent au MÊME mail, chacune avec sa plateforme
  // (leurs clés `vente:<id>` sont déjà réservées par envoyerMailVentesGroupe).
  const autres = groupe.filter((m) => m.id !== n.id);
  const ventesAutres = (await Promise.all(autres.map((m) => {
    const arts: ArticleNote[] = Array.isArray(m.articles) && m.articles.length ? m.articles : [m];
    return Promise.all(arts.map((a) => ligneDuMail(admin, a, String(m.plateforme ?? ""))));
  }))).flat();
  const ventes = [...ventesTete, ...ventesAutres];
  const { sujet, html } = mailVentes({
    ventes,
    retraitsACliquer: 0,
    retraitsBeebsAuto: 0,
    // (11/10) Vente détectée, non enregistrée : le mail dit de la confirmer
    // (liste « Ventes à confirmer »). Absent (base d'avant) : texte d'avant.
    aConfirmer: n.a_decider === true,
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
// (24/10, lot « zéro blocage », A9 — Nico) LES VENTES PROCHES TIENNENT DANS UN SEUL MAIL
// ═══════════════════════════════════════════════════════════════════════════
// Les notes d'un même compte décidées dans le même passage (_shared/ventes-un-mail.js) partent dans UN mail.
// Jamais deux mails pour une même vente : chaque note AUTRE que la tête réserve d'abord SA clé `vente:<id>`
// (même index unique qu'un mail seul ; 23505 = déjà servie → elle sort du groupe) ; la tête est réservée par
// envoyerEmail, comme un mail seul. Jamais une vente sans mail : rien de parti → toutes les réservations
// relâchées, chaque note est réessayée comme avant ; tête déjà servie (passage précédent mort après l'envoi)
// → les autres repartent entre elles, sous une nouvelle tête.
async function envoyerMailVentesGroupe(
  // deno-lint-ignore no-explicit-any
  admin: any, membres: NoteServie[],
): Promise<Map<number, VerdictMail>> {
  const out = new Map<number, VerdictMail>();
  let file = [...membres].sort((a, b) => Number(a.id) - Number(b.id));
  // deno-lint-ignore no-explicit-any
  const relacher = async (ns: NoteServie[]) => {
    for (const n of ns) await admin.from("email_logs").delete().eq("user_id", n.user_id).eq("email_type", `vente:${n.id}`);
  };
  while (file.length) {
    const [tete, ...autres] = file;
    if (!autres.length) { out.set(tete.id, await envoyerMailVente(admin, tete)); break; }
    const adresse = String(tete.email ?? "").trim();
    if (!adresse) { for (const n of file) out.set(n.id, { statut: "sans_adresse" }); break; }
    const reservees: NoteServie[] = [];
    for (const n of autres) {
      const { error } = await admin.from("email_logs").insert({ user_id: n.user_id, email_type: `vente:${n.id}`, email: adresse.toLowerCase() });
      if (!error) reservees.push(n);
      else if ((error as { code?: string }).code === "23505") out.set(n.id, { statut: "deja_envoye" });
      else out.set(n.id, { statut: "a_reessayer", motif: `reservation: ${String(error.message ?? "").slice(0, 80)}` });
    }
    const groupe = [tete, ...reservees];
    const v = await envoyerMailVente(admin, tete, groupe);
    if (v.statut === "envoye") {
      for (const n of groupe) out.set(n.id, { statut: "envoye", ...(n.id === tete.id ? {} : { motif: `dans le mail vente:${tete.id}` }) });
      break;
    }
    if (v.statut === "deja_envoye" && reservees.length) {
      out.set(tete.id, v);
      await relacher(reservees);
      file = reservees;
      continue;
    }
    await relacher(reservees);
    for (const n of groupe) out.set(n.id, v);
    break;
  }
  return out;
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

// ═══════════════════════════════════════════════════════════════════════════
// (25/10, point 3 de Nico) « VENTE ANNULÉE — <titre> : REMETTRE EN VENTE ? »
// ═══════════════════════════════════════════════════════════════════════════
// Source : les propositions de remise en vente nées d'une vente annulée (remises_en_vente « proposee », dépôt vendu
// marqué « vente_annulee_remise » — Vinted : vente_commande_annulee_vinted ; Leboncoin :
// vente_transaction_annulee_leboncoin). LA BASE DÉCIDE (push_annulations_a_envoyer, migration 20261025040000) :
//   · UNE note par annulation (table push_annulations, clé unique user_id + cle — la commande, sinon la vente) ;
//   · seulement une annulation NEUVE : après l'armement (coin_config.push_annulations_depuis ; 0 = coupé), de moins
//     de 24 h, et après 6 min de calme (un passage de remises_en_vente_tick ferme d'abord « déjà en vente » ce que le
//     vendeur a remis en ligne lui-même) ;
//   · jamais une proposition déjà acceptée, close, ni un article plus en stock (« ignoree », motif plus_proposee) ;
//   · sans téléphone enregistré : « sans_appareil », rien ne part (le réglage « Notifications de ventes » d'un
//     appareil = sa ligne appareils_push : couper l'oublie côté serveur).
// Ici : le texte (_shared/push-annulation.js, langue du profil), l'envoi APNs/FCM (le même envoyerNote que les
// ventes), le verdict (push_annulations_resultat : à réessayer 3 fois au plus, jetons morts oubliés comme pour une
// vente). ⛔ AUCUN MAIL sur ce chemin. Traitées APRÈS les ventes : une panne ici ne retient jamais une vente.
// Base d'avant la migration (fonction absente) : rien, aucune erreur.
type NoteAnnulation = {
  id: number; user_id: string; appareils: Appareil[]; lang?: string | null; plateforme?: string | null;
  titre?: string | null; inventaire_id?: number | null; vente_id?: number | null; nb_articles?: number | null;
};
type BilanAnnulations = { notes: number; envoyees: number; a_reessayer: number; echecs: number; appareils_oublies: number; erreur?: string };

const fonctionAbsente = (e: { code?: string } | null | undefined) => e?.code === "PGRST202" || e?.code === "42883";

async function pousserAnnulations(
  // deno-lint-ignore no-explicit-any
  admin: any, cfgApns: ConfigApns | null, cfgFcm: ConfigFcm | null,
): Promise<BilanAnnulations> {
  const bilan: BilanAnnulations = { notes: 0, envoyees: 0, a_reessayer: 0, echecs: 0, appareils_oublies: 0 };
  const { data, error } = await admin.rpc("push_annulations_a_envoyer", { p_limite: 20 });
  if (error) {
    if (!fonctionAbsente(error)) bilan.erreur = `annulations: ${String(error.message ?? "").slice(0, 120)}`;
    return bilan;
  }
  const notes = (data?.notes ?? []) as NoteAnnulation[];
  if (!notes.length) return bilan;
  bilan.notes = notes.length;
  const bilans: BilanNote[] = await Promise.all(notes.map((n) => {
    const lang = langueNotif(n.lang);
    return envoyerNote(fetch, cfgApns, cfgFcm, { id: n.id, appareils: n.appareils ?? [] }, lang, Date.now(), messageAnnulation(n, lang))
      .catch((e) => ({ id: n.id, statut: "a_reessayer" as const, motif: `exception: ${String(e?.message ?? e).slice(0, 80)}`, resultat: [] }));
  }));
  const resume = resumerPourLaBase(bilans, notes.flatMap((n) => n.appareils ?? []));
  const { data: fini, error: e2 } = await admin.rpc("push_annulations_resultat", { p: resume });
  if (e2) bilan.erreur = `annulations resultat: ${String(e2.message ?? "").slice(0, 120)}`;
  bilan.appareils_oublies = Number(fini?.appareils_oublies ?? 0);
  for (const b of bilans) {
    if (b.statut === "envoyee") bilan.envoyees++;
    else if (b.statut === "a_reessayer") bilan.a_reessayer++;
    else bilan.echecs++;
  }
  console.log(`[push-ventes] annulations ${JSON.stringify(bilans.map((b) => ({ id: b.id, push: b.statut })))}`);
  return bilan;
}

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

  // (25/10) SIMULATION « vente annulée » : ce qui partirait, à qui, avec quel texte — RIEN n'est envoyé, RIEN n'est
  // écrit (push_annulations_apercu ne fait que lire ; aucun jeton dans la réponse, seulement le nombre d'appareils).
  //   corps : { "simulation": "annulations", "user": "<uuid>" }   (user absent : tous les comptes)
  if (corps?.simulation === "annulations") {
    const user = typeof corps?.user === "string" && /^[0-9a-f-]{36}$/i.test(corps.user) ? corps.user : null;
    const { data, error } = await admin.rpc("push_annulations_apercu", { p_user: user });
    if (error) return json({ ok: false, erreur: String(error.message ?? "").slice(0, 200) }, fonctionAbsente(error) ? 404 : 500);
    const candidates = (data?.candidates ?? []) as Array<Record<string, unknown>>;
    return json({
      ok: true, simulation: true, arme: data?.arme === true, depuis: data?.depuis ?? null,
      apns_configure: cfgApns != null, fcm_configure: cfgFcm != null,
      notifications: candidates.map((c) => ({
        ...c, message: messageAnnulation({ ...c, id: "simulation" } as never, langueNotif(c.lang)),
      })),
    });
  }

  const fin = Date.now() + 55_000;
  const rapport = {
    tours: 0, notes: 0, envoyees: 0, a_reessayer: 0, echecs: 0, appareils_oublies: 0,
    mails_envoyes: 0, mails_deja: 0, mails_a_reessayer: 0, mails_sans_adresse: 0,
    annulations: null as BilanAnnulations | null, erreurs: [] as string[],
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
    // Le mail, pour toute note qui le demande. (24/10, A9) Les notes d'un même compte décidées dans ce
    // passage partent dans UN mail (envoyerMailVentesGroupe) ; un groupe en échec ne retient ni le push ni
    // les autres comptes. Une note seule part exactement comme avant.
    const mails = new Map<number, VerdictMail>();
    await Promise.all(groupesDeMail(notes.filter((n) => n.mail === true)).map(async (membres) => {
      if (membres.length === 1) {
        const n = membres[0];
        const v = await envoyerMailVente(admin, n).catch((e) => ({
          statut: "a_reessayer" as const, motif: `exception: ${String(e?.message ?? e).slice(0, 80)}`,
        }));
        mails.set(n.id, v);
        return;
      }
      const verdicts = await envoyerMailVentesGroupe(admin, membres).catch((e) => new Map<number, VerdictMail>(membres.map((n) => [n.id, {
        statut: "a_reessayer" as const, motif: `exception: ${String(e?.message ?? e).slice(0, 80)}`,
      }])));
      for (const [id, v] of verdicts) mails.set(id, v);
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

  // (25/10) Les annulations, APRÈS les ventes (jamais elles ne retardent une vente ni son mail), s'il reste du temps ;
  // sinon le passage suivant (cron push-annulations-1min) les prend.
  if (Date.now() < fin - 8_000) {
    try {
      rapport.annulations = await pousserAnnulations(admin, cfgApns, cfgFcm);
      if (rapport.annulations.erreur) rapport.erreurs.push(rapport.annulations.erreur);
    } catch (e) {
      rapport.erreurs.push(`annulations : ${String((e as Error)?.message ?? e).slice(0, 120)}`);
    }
  }
  return json({ ok: rapport.erreurs.length === 0, ...rapport });
});
