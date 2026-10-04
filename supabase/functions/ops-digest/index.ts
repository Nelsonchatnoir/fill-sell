import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
// Le contrat de la retenue serveur, le même que l'app et get-pending-jobs.
import { retenueServeurDuJob } from "../../../src/utils/retenueServeur.js";

// ops-digest — digest quotidien des anomalies cross_post_jobs, envoyé à
// support@fillsell.app UNIQUEMENT s'il y a au moins une ligne (silence = sain).
// Appelée par pg_cron à 8h50 UTC (avant l'email-tunnel de 9h), header
// x-cron-secret sur le modèle d'email-tunnel. Déployer avec --no-verify-jwt.
//
// Six sections (la 6e : abonnés dont le renouvellement n'est pas constaté —
// échéance dépassée de plus de 3 jours sans événement de paiement, via la RPC
// coins_awaiting_payment qui porte la même condition que la garde SQL) :
//   1. jobs 'failed' des dernières 24 h (approximé par created_at : pas de
//      failed_at en base ; les jobs sont traités dans les minutes qui suivent
//      leur création, un failed plus vieux a déjà été signalé la veille) ;
//   2. jobs bloqués en 'processing' > 15 min malgré le repêchage de
//      background.js (platform_fields.processing_since, repli created_at) ;
//   3. jobs 'delete' non terminés > 24 h — le cas le plus grave : l'annonce
//      d'un article VENDU ailleurs est toujours en ligne (risque de double
//      vente). Terminaux d'un delete : 'deleted' (LIVE), 'dry_run_completed',
//      'cancelled' — un delete 'failed' reste donc signalé ici, c'est voulu ;
//   4. veille Beebs (dossier « annonces qui disparaissent », dette D4) :
//      jobs Beebs 'published' des 7 derniers jours portant le drapeau
//      platform_fields.unavailable_since — suspects n°1 de disparition
//      silencieuse pendant les premiers jours de volume réel ;
//   5. croisement IAP Apple (incident raraajaws 28/07 : pack payé jamais
//      crédité) : notifications ONE_TIME_CHARGE des 48 h relues via
//      apple-notification-history, chaque transactionId doit avoir sa ligne
//      coin_ledger kind='purchase' ref='apple:<txid>'. Si la relecture est
//      indisponible, l'alerte le dit chaque jour jusqu'à réparation — la cause
//      trouvée le 28/07 était qu'aucune clé « Achat intégré » n'existait dans
//      App Store Connect (les clés d'équipe ne signent pas pour cette API).
//      Google n'a pas d'équivalent relisible : couvert par google-play-webhook
//      (crédit server-side) + filet client au lancement.
// S'y ajoutent la 7e (plafond global identify, commentée à sa section), la
// 8e (03/08) : échecs d'écriture email_logs via le journal email_log_echecs —
// 23505 (doublon d'envoi tenté, grave) distingué des écritures perdues — et la
// 10e (27/08, lot 0b inventaire multi-plateformes) : refus des garde-fous de
// la sync dressing (disparitions non marquées), balayés depuis les [note] de
// vinted_sync_runs.erreur et journalisés dans sync_gardes_declenchees.

const RESEND_API = "https://api.resend.com/emails";
const FROM = "FillSell <support@fillsell.app>";
const TO = "support@fillsell.app";

type Job = {
  id: string;
  platform: string;
  action: string;
  status: string;
  title: string | null;
  error: string | null;
  created_at: string;
  published_at: string | null;
  listing_url: string | null;
  platform_fields: Record<string, unknown> | null;
};

const JOB_COLUMNS =
  "id, platform, action, status, title, error, created_at, published_at, listing_url, platform_fields";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function jobRow(j: Job, extra?: string): string {
  const url = j.listing_url
    ? ` — <a href="${esc(j.listing_url)}">${esc(j.listing_url)}</a>`
    : "";
  return `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#374151;">
    <strong>[${esc(j.platform)}]</strong> ${esc(j.title ?? "(sans titre)")}
    — <code>${esc(j.action)}/${esc(j.status)}</code>, créé le ${esc(j.created_at)}${url}
    ${j.error ? `<br><span style="color:#B91C1C;">${esc(j.error)}</span>` : ""}
    ${extra ? `<br><span style="color:#92400E;">${extra}</span>` : ""}
  </li>`;
}

function section(title: string, jobs: Job[], extraFor?: (j: Job) => string): string {
  if (jobs.length === 0) return "";
  return `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      ${esc(title)} (${jobs.length})
    </h2>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${jobs.map((j) => jobRow(j, extraFor?.(j))).join("")}
    </ul>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok");
  }

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const iso24h = new Date(now - 24 * 3_600_000).toISOString();
  const iso7d = new Date(now - 7 * 86_400_000).toISOString();

  // 1. Échecs des dernières 24 h.
  const { data: failed, error: e1 } = await supabase
    .from("cross_post_jobs")
    .select(JOB_COLUMNS)
    .eq("status", "failed")
    .gte("created_at", iso24h)
    .order("created_at", { ascending: false });

  // 2. Bloqués en 'processing' > 15 min (filtre processing_since côté JS :
  // le champ vit dans le JSON platform_fields).
  const { data: processing, error: e2 } = await supabase
    .from("cross_post_jobs")
    .select(JOB_COLUMNS)
    .eq("status", "processing");
  const stuck = ((processing ?? []) as Job[]).filter((j) => {
    const since = Date.parse(
      (j.platform_fields?.processing_since as string) ?? j.created_at,
    );
    return Number.isFinite(since) && now - since > 15 * 60_000;
  });

  // 3. Deletes non terminés > 24 h (risque de double vente).
  const { data: deletesOverdue, error: e3 } = await supabase
    .from("cross_post_jobs")
    .select(JOB_COLUMNS)
    .eq("action", "delete")
    .in("status", ["pending", "processing", "failed"])
    .lt("created_at", iso24h)
    .order("created_at", { ascending: true });

  // 3 bis. (04/10, Nico) Boucles techniques ARRÊTÉES : un job qui a refait le
  // même échec (onglet muet, canal coupé) jusqu'au seuil sort de la boucle
  // (update-job-status, platform_fields.boucle_technique) — c'est ICI qu'on le
  // voit, en rouge : la personne a un message vrai, nous la cause à corriger.
  const { data: boucles, error: e3b } = await supabase
    .from("cross_post_jobs")
    .select(JOB_COLUMNS)
    .eq("status", "needs_user")
    .not("platform_fields->boucle_technique", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (e3b) console.error("[ops-digest] boucles techniques :", e3b.message);

  // 4. Veille Beebs : publiés < 7 jours puis drapés unavailable.
  const { data: beebsRecent, error: e4 } = await supabase
    .from("cross_post_jobs")
    .select(JOB_COLUMNS)
    .eq("platform", "beebs")
    .eq("action", "publish")
    .eq("status", "published")
    .gte("published_at", iso7d);
  const beebsWatch = ((beebsRecent ?? []) as Job[]).filter(
    (j) => j.platform_fields?.unavailable_since != null,
  );

  // 5. Croisement IAP Apple : tout ONE_TIME_CHARGE des 48 h sans ligne
  // purchase correspondante = un client qui a payé sans être crédité. Un
  // échec de relecture ne fait JAMAIS échouer le digest : il devient une
  // alerte (visible chaque jour tant que le secret Apple n'est pas re-posé).
  const iapAlerts: string[] = [];
  try {
    const histRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/apple-notification-history`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": expectedSecret },
        body: JSON.stringify({
          startDate: new Date(now - 48 * 3_600_000).toISOString(),
          notificationType: "ONE_TIME_CHARGE",
        }),
      },
    );
    const hist = await histRes.json();
    if (!histRes.ok || hist.error) throw new Error(hist.error ?? `HTTP ${histRes.status}`);
    const txs = (hist.notifications ?? []).filter(
      (n: Record<string, unknown>) => n.transactionId != null,
    ) as Array<Record<string, unknown>>;
    if (txs.length > 0) {
      const refs = txs.map((n) => `apple:${n.transactionId}`);
      const { data: credited, error: e5 } = await supabase
        .from("coin_ledger").select("ref").eq("kind", "purchase").in("ref", refs);
      if (e5) throw new Error(e5.message);
      const have = new Set((credited ?? []).map((r: { ref: string }) => r.ref));
      for (const n of txs) {
        if (!have.has(`apple:${n.transactionId}`)) {
          iapAlerts.push(
            `Apple ${n.productId} — tx ${n.transactionId} — user ${n.appAccountToken ?? "INCONNU"} — acheté ${n.purchasedAt ?? "?"} — AUCUNE ligne purchase dans coin_ledger`,
          );
        }
      }
    }
  } catch (e) {
    iapAlerts.push(
      `Relecture Apple indisponible (${String((e as Error)?.message ?? e)}) — croisement impossible. Pistes : la clé APPLE_API_PRIVATE_KEY doit être une clé « Achat intégré » d'App Store Connect (une clé d'équipe donne un 401), et le message d'erreur ci-dessus porte le diagnostic du chargeur.`,
    );
  }

  // 6. Abonnés dont le renouvellement mensuel n'est pas constaté (cycle par
  // utilisateur du 28/07). Soit un past_due légitime, soit un webhook de
  // renouvellement qui ne parvient plus — dans les deux cas un client payant
  // cesse de recevoir ce que son abonnement prévoit, ça ne doit pas se
  // découvrir par hasard. La RPC porte la même condition que la garde SQL.
  const awaitingRows: string[] = [];
  try {
    const { data: awaiting, error: e6 } = await supabase.rpc("coins_awaiting_payment");
    if (e6) throw new Error(e6.message);
    for (const a of (awaiting ?? []) as Array<Record<string, unknown>>) {
      awaitingRows.push(
        `${a.tier} ${a.canal} — ${a.email ?? a.user_id} — échéance ${String(a.next_grant_at).slice(0, 10)}, ${a.jours_retard} j de retard — aucun grant depuis`,
      );
    }
  } catch (e) {
    awaitingRows.push(
      `Contrôle des renouvellements indisponible (${String((e as Error)?.message ?? e)}) — vérifier la RPC coins_awaiting_payment.`,
    );
  }

  // 7. Plafond GLOBAL du mode identify (2026-07-28). Identify est gratuit :
  // il ouvre un chemin API sans contrepartie de revenu, et c'est la SEULE garde
  // du produit qui regarde un total plutôt qu'un utilisateur. Le seuil est
  // recopié ici depuis lens-analysis (PLAFOND_IDENTIFY_GLOBAL) — deux
  // constantes à garder alignées, une seule décision. On alerte dès 80 % : à
  // 100 %, l'identify est déjà court-circuité pour tout le monde.
  const PLAFOND_IDENTIFY_GLOBAL = 3000;
  const identifyRows: string[] = [];
  try {
    // Journée en heure de PARIS, jamais d'UTC brut (cf. CLAUDE.md).
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const nb = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const debutJour = new Date(now - ((nb("hour") * 3600 + nb("minute") * 60 + nb("second")) * 1000)).toISOString();
    const { count, error: e7 } = await supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("feature", "lens_identify")
      .gte("created_at", debutJour);
    if (e7) throw new Error(e7.message);
    const n = count ?? 0;
    if (n >= PLAFOND_IDENTIFY_GLOBAL) {
      identifyRows.push(
        `PLAFOND ATTEINT : ${n}/${PLAFOND_IDENTIFY_GLOBAL} identifies aujourd'hui — le mode identify est COURT-CIRCUITÉ pour tout le monde (les parcours continuent sans analyse, champs vides).`,
      );
    } else if (n >= Math.floor(PLAFOND_IDENTIFY_GLOBAL * 0.8)) {
      identifyRows.push(
        `${n}/${PLAFOND_IDENTIFY_GLOBAL} identifies aujourd'hui (${Math.round((n / PLAFOND_IDENTIFY_GLOBAL) * 100)} %) — au-delà du plafond, identify se coupe.`,
      );
    }
  } catch (e) {
    identifyRows.push(
      `Compteur identify indisponible (${String((e as Error)?.message ?? e)}) — plafond global non vérifiable aujourd'hui.`,
    );
  }

  // 8. Échecs d'écriture email_logs (journal email_log_echecs, posé le
  // 03/08). email-tunnel détecte ces échecs mais ses deux canaux n'ont pas
  // de lecteur (réponse HTTP jetée par pg_net, logs consultés a posteriori) :
  // ce journal est le seul chemin qui remonte jusqu'à un humain. Deux
  // gravités, deux réactions :
  //   - code 23505 = l'index email_logs_one_shot_unique vient de BLOQUER un
  //     doublon — le mail en double est DÉJÀ PARTI (l'insert suit l'envoi).
  //     Type one-shot oublié dans l'index ou dédup contournée : enquêter le
  //     jour même ;
  //   - autre code (réseau, RLS…) = la ligne de dédup est PERDUE :
  //     l'utilisateur reste renvoyable tant qu'elle manque — reposer la
  //     ligne à la main.
  const emailLogDoublons: string[] = [];
  const emailLogAutres: string[] = [];
  try {
    const { data: echecs, error: e8 } = await supabase
      .from("email_log_echecs")
      .select("user_id, email_type, code, erreur, created_at")
      .gte("created_at", iso24h)
      .order("created_at", { ascending: false });
    if (e8) throw new Error(e8.message);
    for (const x of (echecs ?? []) as Array<Record<string, unknown>>) {
      const ligne =
        `${x.email_type} — user ${x.user_id ?? "?"} — ${String(x.created_at).slice(0, 19)} — ${x.erreur}`;
      if (String(x.code ?? "") === "23505") emailLogDoublons.push(ligne);
      else emailLogAutres.push(ligne);
    }
  } catch (e) {
    emailLogAutres.push(
      `Journal email_log_echecs illisible (${String((e as Error)?.message ?? e)}) — échecs d'écriture email_logs non vérifiables aujourd'hui.`,
    );
  }

  // 9. Publications jamais exécutées à 30 j (2026-08-05) — jobs annulés
  // cette nuit par expire_publish_reservations (pg_cron 03:20 UTC, jobid 8),
  // lignes coin_reservations soldées par le même geste (mécanique de
  // l'ancienne ère, toujours active pour les vieilles lignes). Signal produit
  // (extension jamais installée ? compte abandonné ?) autant que comptable.
  const reservationRows: string[] = [];
  try {
    const { data: expired, error: e9 } = await supabase
      .from("coin_reservations")
      .select("user_id, amount, captured, released_included, released_purchased, job_count, created_at")
      .gte("expired_at", iso24h)
      .order("expired_at", { ascending: false });
    if (e9) throw new Error(e9.message);
    for (const r of (expired ?? []) as Array<Record<string, unknown>>) {
      const relache = Number(r.released_included ?? 0) + Number(r.released_purchased ?? 0);
      reservationRows.push(
        `user ${r.user_id} — ${r.job_count} job(s) jamais exécutés, ligne coin_reservations soldée` +
        ` (amount ${r.amount}, captured ${r.captured}, released ${relache}) — clic du ${String(r.created_at).slice(0, 10)}`,
      );
    }
  } catch (e) {
    reservationRows.push(
      `coin_reservations illisible (${String((e as Error)?.message ?? e)}) — expirations non vérifiables aujourd'hui.`,
    );
  }

  // 10. Garde-fous de la sync dressing (lot 0b, 27/08). Les refus de marquage
  // des disparitions ne laissaient qu'une « [note] » dans
  // vinted_sync_runs.erreur, qu'aucune alerte ne lisait : 862 disparitions
  // refusées chez fripe2base le 27/08 sans aucun signal nulle part. Balayage
  // des notes des 7 derniers jours (fenêtre large : un digest raté ne perd
  // rien), journal structuré best-effort dans sync_gardes_declenchees
  // (idempotent sur (run_id, garde)), remontée des cas des 24 h :
  //   'grave'    (effondrement, sans recoupement) — avec récidive 7 j : c'est
  //              elle qui dit l'urgence (effondrement QUOTIDIEN constaté sur
  //              un compte les 26 et 27/08), pas l'événement isolé ;
  //   'anomalie' (relevé incomplet, total_entries absent, republications
  //              illisibles) — rare, une ligne suffit ;
  //   'info'     (run repris) — routinier : journalisé, JAMAIS remonté, le
  //              silence du digest doit rester sain.
  // ── 11e (2026-09-19) : LE POIDS DES PHOTOS PAR COMPTE ────────────────────
  // Personne n'avait jamais regardé le stockage : 13 Go, 32 858 fichiers,
  // ~4,8 Go/mois, et 25 comptes qui portent 72 % du poids. `releve_stockage_
  // photos()` journalise (idempotent par jour) les comptes au-dessus du seuil
  // de LEUR palier ; on remonte ici ceux du jour.
  // ⛔ ALERTE SEULEMENT. Rien n'est bloqué, rien n'est supprimé, aucun
  //    téléversement n'est refusé. Les seuils vivent en base
  //    (stockage_photos_seuils) et se changent par un UPDATE.
  // ⛔ ON JOURNALISE TOUS LES JOURS, ON NE REMONTE QUE LES FRANCHISSEMENTS
  //    NOUVEAUX. Un compte durablement au-dessus de son seuil enverrait sinon
  //    un mail chaque matin pour toujours — et le silence du digest doit
  //    rester sain (même doctrine que les gardes 'info' de la sync dressing).
  //    L'état complet reste lisible dans stockage_photos_alertes et dans la
  //    vue v_stockage_photos_par_compte.
  const stockageAlertes: string[] = [];
  try {
    await supabase.rpc("releve_stockage_photos");
    const paris = (d: Date) => new Date(d.getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10);
    const auj = paris(new Date());
    const hier = paris(new Date(Date.now() - 24 * 3600 * 1000));
    const [{ data: sa }, { data: sh }] = await Promise.all([
      supabase.from("stockage_photos_alertes")
        .select("user_id, palier, octets, fichiers, seuil_octets")
        .eq("jour", auj).order("octets", { ascending: false }).range(0, 49),
      supabase.from("stockage_photos_alertes").select("user_id").eq("jour", hier).range(0, 999),
    ]);
    const deja = new Set((sh ?? []).map((r) => String(r.user_id)));
    const mo = (o: number) => `${Math.round(o / 1048576)} Mo`;
    for (const a of sa ?? []) {
      if (deja.has(String(a.user_id))) continue; // déjà au-dessus hier : pas un événement
      stockageAlertes.push(
        `${String(a.user_id).slice(0, 8)} (${a.palier}) — ${mo(Number(a.octets))} / ${mo(Number(a.seuil_octets))}` +
        ` · ${a.fichiers} fichiers · ${Math.round(100 * Number(a.octets) / Number(a.seuil_octets))} % du seuil`,
      );
    }
  } catch (e) {
    console.error("[ops-digest] relevé stockage ignoré (non bloquant) :", (e as Error)?.message ?? e);
  }

  const gardeGraves: string[] = [];
  const gardeAnomalies: string[] = [];
  try {
    const { data: runsNotes, error: e10 } = await supabase
      .from("vinted_sync_runs")
      .select("id, user_id, status, started_at, items_vus, items_crees, items_maj, total_entries, vinted_login, erreur")
      // 'incomplete' (2026-09-13) : une sync trop courte ne se clôt PLUS en
      // 'done' — sans ces deux lignes, les runs que ce balayage existe
      // justement pour voir sortiraient du digest le jour même où on a
      // commencé à les nommer. Le `.or` attrape aussi le run REPRIS qui reste
      // court : sa note de disparitions dit « run repris » (gravité 'info',
      // jamais remontée), et seule la note « relevé incomplet » le signale.
      .in("status", ["done", "incomplete"])
      .gte("started_at", iso7d)
      .or("erreur.like.%disparitions non marquées%,erreur.like.%relevé incomplet%")
      .order("started_at", { ascending: false })
      .range(0, 499);
    if (e10) throw new Error(e10.message);

    const rows = ((runsNotes ?? []) as Array<Record<string, unknown>>).map((r) => {
      // La note est « [note] disparitions non marquées — <motif> », jointe aux
      // autres notes par « | » et tronquée à 500 caractères (clore(), même
      // format sur main et sur la branche 0.6.9 — vérifié le 27/08). Un motif
      // coupé par la troncature retombe en 'autre'/'anomalie' : visible quand
      // même, jamais silencieux.
      const m = /disparitions non marquées — (.*?)(?: \| |$)/.exec(String(r.erreur ?? ""));
      const motif = (m?.[1] ?? "").trim();
      let motifFinal = motif;
      let garde = "autre", gravite = "anomalie";
      let disparus: number | null = null, connus: number | null = null, plafond: number | null = null;
      if (motif.startsWith("effondrement suspect")) {
        garde = "effondrement"; gravite = "grave";
        const n = /(\d+) disparition\(s\) à marquer sur (\d+) connu\(s\), plafond (\d+)/.exec(motif);
        if (n) { disparus = Number(n[1]); connus = Number(n[2]); plafond = Number(n[3]); }
      } else if (motif.startsWith("dressing sans recoupement")) {
        garde = "sans_recoupement"; gravite = "grave";
      } else if (motif.includes("relevé incomplet")) {
        garde = "releve_incomplet";
      } else if (motif.startsWith("total_entries absent")) {
        garde = "total_entries_absent";
      } else if (motif.startsWith("republications actives illisibles")) {
        garde = "republications_illisibles";
      } else if (motif.startsWith("run repris")) {
        garde = "run_repris"; gravite = "info";
      }
      // ── Le STATUT prime sur la note (2026-09-13) ──────────────────────────
      // Un run clos 'incomplete' EST un relevé incomplet, quoi que dise sa
      // note de disparitions. Cas qui l'exige : un run REPRIS qui reste court
      // — sa note dit « run repris », classée 'info' et jamais remontée, alors
      // que c'est précisément le cas qu'on veut voir (la reprise n'a pas
      // suffi). On re-classe, et on prend pour motif la note dédiée.
      if (String(r.status ?? "") === "incomplete") {
        const mi = /relevé incomplet — (.*?)(?: \| |$)/.exec(String(r.erreur ?? ""));
        garde = "releve_incomplet"; gravite = "anomalie";
        motifFinal = (mi?.[1] ?? "").trim()
          || `${r.items_vus ?? "?"} article(s) lu(s) sur ${r.total_entries ?? "?"} annoncé(s)`;
      }
      return {
        run_id: String(r.id), user_id: String(r.user_id), platform: "vinted",
        garde, gravite, motif: motifFinal, disparus, connus, plafond,
        run_started_at: String(r.started_at), source: "digest_scan",
      };
    });

    // Journal structuré, best-effort : un échec d'écriture ne prive pas le
    // digest de sa section (le balayage relira les mêmes runs demain).
    if (rows.length > 0) {
      const { error: eIns } = await supabase
        .from("sync_gardes_declenchees")
        .upsert(rows, { onConflict: "run_id,garde", ignoreDuplicates: true });
      if (eIns) {
        gardeAnomalies.push(
          `journal sync_gardes_declenchees inécrivable (${eIns.message}) — la section reste fondée sur le balayage du jour`,
        );
      }
    }

    const recidive = new Map<string, number>();
    for (const x of rows) {
      recidive.set(`${x.user_id}|${x.garde}`, (recidive.get(`${x.user_id}|${x.garde}`) ?? 0) + 1);
    }
    const runById = new Map(
      ((runsNotes ?? []) as Array<Record<string, unknown>>).map((r) => [String(r.id), r]),
    );
    for (const x of rows) {
      if (x.gravite === "info") continue;
      if (Date.parse(x.run_started_at) < Date.parse(iso24h)) continue;
      const run = runById.get(x.run_id);
      const qui = `${run?.vinted_login ? `@${run.vinted_login} ` : ""}(user ${x.user_id})`;
      const contexte = `run du ${x.run_started_at.slice(0, 16)} — vus ${run?.items_vus ?? "?"}, créés ${run?.items_crees ?? "?"}, maj ${run?.items_maj ?? "?"}`;
      const rec = recidive.get(`${x.user_id}|${x.garde}`) ?? 1;
      const ligne = `${qui} — ${x.motif} — ${contexte}${rec > 1 ? ` — RÉCIDIVE : ${rec}× en 7 j` : ""}`;
      if (x.gravite === "grave") gardeGraves.push(ligne);
      else gardeAnomalies.push(ligne);
    }
  } catch (e) {
    gardeAnomalies.push(
      `Balayage des gardes sync indisponible (${String((e as Error)?.message ?? e)}) — refus de marquage non vérifiables aujourd'hui.`,
    );
  }

  const queryErrors = [e1, e2, e3, e4].filter(Boolean).map((e) => e!.message);
  if (queryErrors.length > 0) {
    return new Response(JSON.stringify({ error: queryErrors }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 11. MÊME DRESSING VINTED VU PAR PLUSIEURS COMPTES FILLSELL (2026-09-03,
  // incident Nadège : ~716 articles importés chez deux autres comptes, vu
  // par hasard). La garde d'identité (extension ≥ 0.6.17) bloque désormais
  // l'import, mais le CROISEMENT lui-même doit se voir en 24 h : fenêtre de
  // 10 jours pour le contexte, remonté seulement si un run des 24 h y
  // participe. Lecture seule, best-effort.
  const dressingsCroises: string[] = [];
  try {
    const { data: runsIdent, error: e11 } = await supabase
      .from("vinted_sync_runs")
      .select("user_id, vinted_user_id, vinted_login, started_at")
      .not("vinted_user_id", "is", null)
      .gte("started_at", new Date(now - 10 * 86_400_000).toISOString())
      .order("started_at", { ascending: false })
      .range(0, 1999);
    if (e11) throw new Error(e11.message);
    const parDressing = new Map<string, { login: string | null; comptes: Map<string, string>; recent24h: boolean }>();
    for (const r of (runsIdent ?? []) as Array<Record<string, unknown>>) {
      const vid = String(r.vinted_user_id);
      const e = parDressing.get(vid) ?? { login: null, comptes: new Map(), recent24h: false };
      if (!e.login && r.vinted_login) e.login = String(r.vinted_login);
      const uid = String(r.user_id);
      if (!e.comptes.has(uid)) e.comptes.set(uid, String(r.started_at).slice(0, 10));
      if (Date.parse(String(r.started_at)) >= now - 86_400_000) e.recent24h = true;
      parDressing.set(vid, e);
    }
    for (const [vid, e] of parDressing) {
      if (e.comptes.size < 2 || !e.recent24h) continue;
      const detail = [...e.comptes.entries()].map(([u, d]) => `${u} (dernier run ${d})`).join(" · ");
      dressingsCroises.push(
        `dressing @${e.login ?? "?"} (${vid}) vu par ${e.comptes.size} comptes FillSell : ${detail}`,
      );
    }
  } catch (e) {
    dressingsCroises.push(
      `Croisement des dressings illisible (${String((e as Error)?.message ?? e)}) — à revérifier demain.`,
    );
  }

  // 12. JOBS PENDING DEPUIS PLUS DE 48 H (2026-09-03, chantier « plus aucun
  // échec visible ») : relevé du jour — 127 jobs pending chez 4 comptes
  // depuis le 22/08, invisibles de partout (extension éteinte, plafond,
  // needs_user_source hérité…). Groupé PAR COMPTE avec la dernière trace
  // d'extension : c'est elle qui dit si c'est un ordinateur éteint.
  const pendingBloques: string[] = [];
  try {
    const { data: vieux, error: e12 } = await supabase
      .from("cross_post_jobs")
      .select("user_id, platform, action, created_at")
      .eq("status", "pending")
      .lt("created_at", new Date(now - 48 * 3_600_000).toISOString())
      .range(0, 999);
    if (e12) throw new Error(e12.message);
    const parCompte = new Map<string, { n: number; plusVieux: string; detail: Map<string, number> }>();
    for (const j of (vieux ?? []) as Array<Record<string, unknown>>) {
      const uid = String(j.user_id);
      const e = parCompte.get(uid) ?? { n: 0, plusVieux: String(j.created_at), detail: new Map() };
      e.n += 1;
      if (String(j.created_at) < e.plusVieux) e.plusVieux = String(j.created_at);
      const k = `${j.platform}/${j.action}`;
      e.detail.set(k, (e.detail.get(k) ?? 0) + 1);
      parCompte.set(uid, e);
    }
    if (parCompte.size) {
      const uids = [...parCompte.keys()];
      const { data: profs } = await supabase
        .from("profiles").select("id, email, extension_last_seen_at").in("id", uids);
      const parId = new Map((profs ?? []).map((p: Record<string, unknown>) => [String(p.id), p]));
      for (const [uid, e] of parCompte) {
        const p = parId.get(uid);
        const vue = p?.extension_last_seen_at ? String(p.extension_last_seen_at).slice(0, 10) : "jamais";
        const detail = [...e.detail.entries()].map(([k, n]) => `${k}×${n}`).join(", ");
        pendingBloques.push(
          `${p?.email ?? uid} — ${e.n} job(s) pending depuis ${e.plusVieux.slice(0, 10)} (${detail}) — extension vue : ${vue}`,
        );
      }
      pendingBloques.sort();
    }
  } catch (e) {
    pendingBloques.push(`Relevé des pending anciens illisible (${String((e as Error)?.message ?? e)}).`);
  }

  // 13. JOBS QUI BRÛLENT LEURS TENTATIVES EN SILENCE (2026-09-07) ───────────
  // Un échec récupérable est ré-armé en 'pending' avec needsUserAttempts + 1
  // (rearmBounded, 5 essais espacés 5/15/30/60 min). Tant qu'il reste pending,
  // il n'apparaît NI dans les 'failed' du jour, NI dans les 'processing'
  // bloqués — et la section 12 ne le voit qu'au bout de 48 h. Résultat mesuré
  // le 07/09 : des blocages eBay (« REAUTH VENTE », onglet en back/forward
  // cache) tournaient depuis des jours à 1-3 essais sur 5, invisibles de tout
  // balayage published/failed, pour finir en failed sans que personne ne les
  // ait vus venir. On les nomme AVANT le dernier essai, avec leur cause.
  const tentativesEnCours: string[] = [];
  try {
    const { data: brulent, error: e13 } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, action, title, error, created_at, platform_fields")
      .eq("status", "pending")
      .not("error", "is", null)
      .range(0, 999);
    const candidats = ((brulent ?? []) as Array<Record<string, unknown>>).filter((j) => {
      const pf = (j.platform_fields ?? {}) as Record<string, unknown>;
      return Number(pf.needsUserAttempts ?? 0) >= 2;
    });
    if (e13) throw new Error(e13.message);
    if (candidats.length) {
      const uids = [...new Set(candidats.map((j) => String(j.user_id)))];
      const { data: profs } = await supabase.from("profiles").select("id, email").in("id", uids);
      const parId = new Map((profs ?? []).map((p: Record<string, unknown>) => [String(p.id), String(p.email ?? "")]));
      for (const j of candidats) {
        const pf = (j.platform_fields ?? {}) as Record<string, unknown>;
        const essais = Number(pf.needsUserAttempts ?? 0);
        const cause = String(j.error ?? "").replace(/\s+/g, " ").slice(0, 110);
        tentativesEnCours.push(
          `${parId.get(String(j.user_id)) ?? j.user_id} — [${j.platform}/${j.action}] « ${String(j.title ?? "").slice(0, 40)} » ` +
          `tentative ${essais}/5 depuis le ${String(j.created_at).slice(0, 10)} — ${cause}`,
        );
      }
      tentativesEnCours.sort();
    }
  } catch (e) {
    tentativesEnCours.push(`Relevé des tentatives en cours illisible (${String((e as Error)?.message ?? e)}).`);
  }

  // 14. needs_user POSÉS SANS MOTIF (2026-09-27, règle de Nico) ─────────────
  // « Tout needs_user a un needs_user_source, et chaque source a son écran. »
  // Le filet (update-job-status v89, trigger cross_post_jobs_needs_user_motif)
  // pose un motif par défaut à ce qui partirait sans, et le marque
  // needs_user_sans_motif. Chaque ligne ici est un CHEMIN à nommer — jamais
  // un état normal. Jobs encore en needs_user, marqués dans les 24 h.
  const sansMotif: string[] = [];
  try {
    const depuis24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: muets, error: e14 } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, action, title, error, platform_fields")
      .eq("status", "needs_user")
      .gte("platform_fields->needs_user_sans_motif->>le", depuis24h)
      .range(0, 499);
    if (e14) throw new Error(e14.message);
    const lignes = (muets ?? []) as Array<Record<string, unknown>>;
    if (lignes.length) {
      const uids = [...new Set(lignes.map((j) => String(j.user_id)))];
      const { data: profs } = await supabase.from("profiles").select("id, email").in("id", uids);
      const parId = new Map((profs ?? []).map((p: Record<string, unknown>) => [String(p.id), String(p.email ?? "")]));
      for (const j of lignes) {
        const m = ((j.platform_fields ?? {}) as Record<string, unknown>)["needs_user_sans_motif"] as Record<string, unknown> | undefined;
        sansMotif.push(
          `${parId.get(String(j.user_id)) ?? j.user_id} — [${j.platform}/${j.action}] « ${String(j.title ?? "").slice(0, 40)} » ` +
          `motif « ${String(m?.source_posee ?? "?")} » posé par ${String(m?.par ?? "?")} — ${String(j.error ?? "").replace(/\s+/g, " ").slice(0, 110)}`,
        );
      }
      sansMotif.sort();
    }
  } catch (e) {
    sansMotif.push(`Relevé des needs_user sans motif illisible (${String((e as Error)?.message ?? e)}).`);
  }

  // 15. REPUBLICATIONS RETENUES PAR LE SERVEUR (2026-10-01, carhoa) ─────────
  // Six livres de Carole sont restés du 27/09 au 01/10 hors de la file, sans
  // un mot ni chez elle ni ici : get-pending-jobs les retenait (ISBN capturé
  // non standard). Toute retenue d'une republication encore en ligne s'écrit
  // désormais `retenue_serveur` (src/utils/retenueServeur.js) — on la compte
  // chaque matin, par compte, avec son ancienneté et la dernière trace du poste.
  const retenuesServeur: string[] = [];
  let retenuesServeurJobs = 0;
  try {
    const { data: retenus, error: e15 } = await supabase
      .from("cross_post_jobs")
      .select("user_id, platform, action, status, platform_fields->republish_step, platform_fields->retenue_serveur, platform_fields->retenue_isbn_capture")
      .eq("status", "pending")
      .or("platform_fields->retenue_serveur.not.is.null,platform_fields->retenue_isbn_capture.not.is.null")
      .range(0, 999);
    if (e15) throw new Error(e15.message);
    const parCompte = new Map<string, { n: number; depuis: string; motifs: Map<string, number> }>();
    for (const j of (retenus ?? []) as Array<Record<string, unknown>>) {
      const r = retenueServeurDuJob({
        action: j.action, status: j.status,
        platform_fields: { republish_step: j.republish_step, retenue_serveur: j.retenue_serveur, retenue_isbn_capture: j.retenue_isbn_capture },
      });
      if (!r) continue;
      retenuesServeurJobs += 1;
      const uid = String(j.user_id);
      const e = parCompte.get(uid) ?? { n: 0, depuis: r.depuis ?? "", motifs: new Map() };
      e.n += 1;
      if (r.depuis && (!e.depuis || r.depuis < e.depuis)) e.depuis = r.depuis;
      e.motifs.set(r.motif, (e.motifs.get(r.motif) ?? 0) + 1);
      parCompte.set(uid, e);
    }
    if (parCompte.size) {
      const { data: profs } = await supabase
        .from("profiles").select("id, email, extension_last_seen_at").in("id", [...parCompte.keys()]);
      const parId = new Map((profs ?? []).map((p: Record<string, unknown>) => [String(p.id), p]));
      for (const [uid, e] of parCompte) {
        const p = parId.get(uid);
        const jours = e.depuis ? Math.floor((now - Date.parse(e.depuis)) / 86_400_000) : null;
        const motifs = [...e.motifs].map(([m, n]) => `${m} ×${n}`).join(", ");
        const vue = p?.extension_last_seen_at ? String(p.extension_last_seen_at).slice(0, 16) : "jamais";
        retenuesServeur.push(
          `${p?.email ?? uid} — ${e.n} republication${e.n > 1 ? "s" : ""} retenue${e.n > 1 ? "s" : ""} ` +
          `depuis le ${e.depuis ? e.depuis.slice(0, 10) : "?"}${jours !== null ? ` (${jours} j)` : ""} — ${motifs} — poste vu : ${vue}`,
        );
      }
      retenuesServeur.sort();
    }
  } catch (e) {
    retenuesServeur.push(`Relevé des retenues serveur illisible (${String((e as Error)?.message ?? e)}).`);
  }

  // 0. FOURNISSEURS D'IA — EN TÊTE DU RÉCAPITULATIF (01/10/2026) ─────────────
  // Le crédit OpenAI s'est épuisé le 28/09 (429 credit_balance_exhausted) : 0
  // retouche livrée sur 25 pendant trois jours, et rien ne l'a dit — l'erreur
  // ne vivait que dans les journaux des fonctions. Deux signaux sur 24 h :
  //   · les refus notés par les fonctions (usage_logs 'echec_fournisseur_ia',
  //     _shared/echecs-fournisseurs.ts) : « crédit épuisé » = alerte dès le
  //     premier ; autre refus = alerte à partir de 3 pour un même fournisseur ;
  //   · les retouches NON LIVRÉES (usage_logs 'photo_retouche', delivered =
  //     false) : le geste payant qui échoue à répétition, alerte à partir de 3,
  //     même si la cause n'a pas été notée.
  const NOM_FOURNISSEUR: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic (Claude)" };
  const iaAlertes: string[] = [];
  const iaSujet: string[] = [];
  try {
    const { data: refus, error: eIa } = await supabase
      .from("usage_logs")
      .select("metadata, created_at")
      .eq("feature", "echec_fournisseur_ia")
      .gte("created_at", iso24h)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (eIa) throw new Error(eIa.message);
    const parFournisseur = new Map<string, { total: number; credit: number; fonctions: Map<string, number>; codes: Set<string>; dernier: string }>();
    for (const r of (refus ?? []) as Array<{ metadata: Record<string, unknown> | null; created_at: string }>) {
      const m = r.metadata ?? {};
      const f = String(m.fournisseur ?? "?");
      const s = parFournisseur.get(f) ?? { total: 0, credit: 0, fonctions: new Map(), codes: new Set(), dernier: r.created_at };
      s.total += 1;
      if (m.credit_epuise === true) s.credit += 1;
      const fn = String(m.fonction ?? "?").split(":")[0];
      s.fonctions.set(fn, (s.fonctions.get(fn) ?? 0) + 1);
      if (m.code) s.codes.add(String(m.code));
      parFournisseur.set(f, s);
    }
    for (const [f, s] of parFournisseur) {
      const nom = NOM_FOURNISSEUR[f] ?? f;
      const fonctions = [...s.fonctions].map(([k, v]) => `${k} ×${v}`).join(", ");
      const codes = [...s.codes].join(", ") || "sans code";
      if (s.credit > 0) {
        iaAlertes.push(`${nom} : CRÉDIT ÉPUISÉ — ${s.credit} refus « crédit » sur ${s.total} échec${s.total > 1 ? "s" : ""} en 24 h (${fonctions} ; dernier ${String(s.dernier).slice(0, 16)}). Recharger le compte ${nom}.`);
        iaSujet.push(`${nom} crédit épuisé ×${s.credit}`);
      } else if (s.total >= 3) {
        iaAlertes.push(`${nom} : ${s.total} échecs en 24 h (${fonctions} ; codes ${codes} ; dernier ${String(s.dernier).slice(0, 16)}).`);
        iaSujet.push(`${nom} ${s.total} échecs`);
      }
    }
  } catch (e) {
    iaAlertes.push(`Journal des échecs des fournisseurs d'IA illisible (${String((e as Error)?.message ?? e)}) — crédit et pannes non vérifiables aujourd'hui.`);
  }
  try {
    const { data: retouches, error: eRet } = await supabase
      .from("usage_logs")
      .select("user_id, metadata")
      .eq("feature", "photo_retouche")
      .gte("created_at", iso24h)
      .limit(5000);
    if (eRet) throw new Error(eRet.message);
    const toutes = (retouches ?? []) as Array<{ user_id: string | null; metadata: Record<string, unknown> | null }>;
    const ratees = toutes.filter((x) => x.metadata?.delivered === false);
    if (ratees.length >= 3) {
      const comptes = new Set(ratees.map((x) => x.user_id)).size;
      iaAlertes.push(`Retouche photo (OpenAI) : ${ratees.length} retouche${ratees.length > 1 ? "s" : ""} non livrée${ratees.length > 1 ? "s" : ""} sur ${toutes.length} en 24 h, ${comptes} compte${comptes > 1 ? "s" : ""} touché${comptes > 1 ? "s" : ""} — geste payant en échec répété (non décomptées du quota depuis le 01/10).`);
      iaSujet.push(`retouches ratées ${ratees.length}/${toutes.length}`);
    }
  } catch (e) {
    iaAlertes.push(`Relevé des retouches illisible (${String((e as Error)?.message ?? e)}).`);
  }

  const counts = {
    ia_alertes: iaAlertes.length,
    needs_user_sans_motif_24h: sansMotif.length,
    tentatives_en_cours: tentativesEnCours.length,
    failed_24h: (failed ?? []).length,
    stuck_processing: stuck.length,
    delete_overdue: (deletesOverdue ?? []).length,
    boucles_techniques: (boucles ?? []).length,
    beebs_unavailable_7d: beebsWatch.length,
    iap_alerts: iapAlerts.length,
    awaiting_payment: awaitingRows.length,
    lens_identify: identifyRows.length,
    email_log_doublons: emailLogDoublons.length,
    email_log_echecs: emailLogAutres.length,
    reservations_expirees: reservationRows.length,
    sync_gardes_graves: gardeGraves.length,
    sync_gardes_anomalies: gardeAnomalies.length,
    stockage_au_dessus_du_seuil: stockageAlertes.length,
    dressings_croises: dressingsCroises.length,
    pending_bloques: pendingBloques.length,
    retenues_serveur: retenuesServeur.length,
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return new Response(JSON.stringify({ ok: true, clean: true, counts }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F2F2EE;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
    <h1 style="margin:0 0 4px;font-size:18px;font-family:sans-serif;color:#111827;">
      ⚠️ FillSell ops-digest — ${total} anomalie${total > 1 ? "s" : ""}
    </h1>
    <p style="margin:0 0 12px;font-size:12px;font-family:sans-serif;color:#9CA3AF;">
      cross_post_jobs, relevé du ${new Date().toISOString()}
    </p>
    ${
    iaAlertes.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#B91C1C;">
      🔴 Fournisseurs d'IA — crédit épuisé ou échecs répétés (${iaAlertes.length})
    </h2>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${iaAlertes.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#B91C1C;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    retenuesServeur.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      ✋ Republications retenues par le serveur — ${retenuesServeurJobs} job${retenuesServeurJobs > 1 ? "s" : ""}, ${retenuesServeur.length} compte${retenuesServeur.length > 1 ? "s" : ""}
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      get-pending-jobs ne les sert pas : l'annonce est intacte, la personne lit « en attente ».
      Une retenue qui vieillit est une garde qui attend une condition qui n'arrive pas — à lever à la racine.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${retenuesServeur.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#92400E;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${section("Jobs en échec (24 h)", (failed ?? []) as Job[])}
    ${section("Bloqués en processing > 15 min (repêchage inopérant)", stuck)}
    ${
    section(
      "🔴 Boucles techniques arrêtées — même échec répété, sorti de la boucle (à corriger chez nous)",
      (boucles ?? []) as Job[],
      (j) => {
        const b = (j.platform_fields?.boucle_technique ?? {}) as Record<string, unknown>;
        return `${esc(b.signature)} × ${esc(b.essais)} — build ${esc(b.build)} — depuis ${esc(b.depuis)}`;
      },
    )
  }
    ${
    section(
      "🔴 Retraits (delete) non terminés > 24 h — risque de double vente",
      (deletesOverdue ?? []) as Job[],
    )
  }
    ${
    section(
      "Veille Beebs — publiés puis unavailable < 7 jours (dossier disparitions, D4)",
      beebsWatch,
      (j) =>
        `unavailable_since : ${esc(j.platform_fields?.unavailable_since)}`,
    )
  }
    ${
    iapAlerts.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      🔴 IAP — achats store payés jamais enregistrés dans coin_ledger (${iapAlerts.length})
    </h2>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${iapAlerts.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#B91C1C;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    awaitingRows.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      🔴 Abonnés non recrédités — renouvellement non constaté (${awaitingRows.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Échéance dépassée de plus de 3 jours sans événement de paiement : soit l'abonnement
      ne se renouvelle plus (past_due, résiliation), soit le webhook du store ne parvient plus.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${awaitingRows.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#B91C1C;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    emailLogDoublons.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      🔴 email_logs — DOUBLONS D'ENVOI tentés, bloqués par l'index (${emailLogDoublons.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Violation 23505 sur email_logs_one_shot_unique : le mail en double est DÉJÀ PARTI
      (l'insert suit l'envoi). Type one-shot oublié dans l'index ou dédup contournée —
      enquêter le jour même.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${emailLogDoublons.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#B91C1C;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    emailLogAutres.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      ⚠️ email_logs — écritures de dédup perdues (${emailLogAutres.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      L'insert email_logs a échoué (réseau, RLS…) : le mail est parti mais sa ligne de
      dédup MANQUE — l'utilisateur reste renvoyable tant qu'elle n'est pas reposée à la main.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${emailLogAutres.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#92400E;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    reservationRows.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      ⏳ Publications jamais exécutées — jobs annulés à 30 j (${reservationRows.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Jobs annulés cette nuit par expire_publish_reservations (lignes coin_reservations soldées).
      Regarder si ces comptes n'ont simplement jamais installé l'extension.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${reservationRows.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#92400E;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    gardeGraves.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      🔴 Sync dressing — marquages de masse REFUSÉS par les garde-fous (${gardeGraves.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Le garde-fou a empêché de marquer ces disparitions (effondrement suspect ou dressing
      sans recoupement) : rien n'a été écrit, les articles restent « en ligne » côté FillSell.
      Mauvais compte Vinted, session bancale ou vrai retrait massif — à regarder le jour même,
      surtout en récidive.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${gardeGraves.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#B91C1C;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    gardeAnomalies.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      ⚠️ Sync dressing — relevés anormaux (${gardeAnomalies.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Relevé incomplet, pagination sans total ou republications illisibles : le run n'a rien
      marqué, le suivant rattrapera — mais un motif qui revient mérite un œil.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${gardeAnomalies.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#92400E;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    stockageAlertes.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      💾 Stockage photos — NOUVEAUX franchissements de seuil (${stockageAlertes.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Alerte seulement : rien n'est bloqué, aucun téléversement refusé, aucune photo supprimée.
      Seuls les comptes qui passent au-dessus AUJOURD'HUI sont listés — ceux qui l'étaient déjà
      hier sont journalisés sans être remontés, pour que le silence du digest reste sain.
      L'état complet : table stockage_photos_alertes et vue v_stockage_photos_par_compte.
      Les seuils sont en base (stockage_photos_seuils) et se changent par un UPDATE.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${stockageAlertes.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#92400E;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    tentativesEnCours.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      🔁 Jobs qui brûlent leurs tentatives (${tentativesEnCours.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Ré-armés en 'pending' après un échec récupérable : ils ne sont NI dans les failed du jour,
      NI dans les processing bloqués, et la section « pending 48 h » ne les verra que dans deux
      jours. Au 5ᵉ essai ils passeront en failed. C'est le moment de regarder la cause.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${tentativesEnCours.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#B45309;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    sansMotif.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      🔇 needs_user posés sans motif (${sansMotif.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Un needs_user est parti sans needs_user_source : le filet lui a posé un motif par défaut
      (champ_a_choisir s'il porte un champ, relancer sinon). L'utilisateur voit le message et un geste.
      Chaque ligne est un chemin à nommer dans le code — jamais un état normal.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${sansMotif.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#6D28D9;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    pendingBloques.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      ⏳ Jobs pending depuis plus de 48 h (${pendingBloques.length} compte${pendingBloques.length > 1 ? "s" : ""})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Personne ne les voit échouer — ils n'avancent simplement pas. « extension vue » dit si
      c'est un ordinateur éteint ; sinon, chercher pourquoi la file ne les distribue pas.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${pendingBloques.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#92400E;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    dressingsCroises.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      🔴 Même dressing Vinted vu par plusieurs comptes FillSell (${dressingsCroises.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Croisement des identités de runs sur 10 jours, remonté quand un run des dernières 24 h y participe.
      La garde d'identité (extension ≥ 0.6.17) bloque l'import — vérifier qui est derrière chaque compte.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${dressingsCroises.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#B91C1C;">${esc(a)}</li>`).join("")}
    </ul>`
  }
    ${
    identifyRows.length === 0 ? "" : `
    <h2 style="margin:20px 0 8px;font-size:15px;font-family:sans-serif;color:#111827;">
      🔴 Lens identify — plafond global journalier (${identifyRows.length})
    </h2>
    <p style="margin:0 0 8px;font-size:12px;font-family:sans-serif;color:#6B7280;">
      Le mode identify est gratuit pour l'utilisateur : c'est la seule garde du produit
      qui regarde un TOTAL et non un utilisateur. ~0,010 € l'appel.
    </p>
    <ul style="margin:0;padding:0 0 0 18px;">
      ${identifyRows.map((a) => `<li style="margin:0 0 8px;font-family:sans-serif;font-size:13px;line-height:1.6;color:#B91C1C;">${esc(a)}</li>`).join("")}
    </ul>`
  }
  </div>
</body></html>`;

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      // (01/10) Les fournisseurs d'IA en tête, jusque dans l'objet du mail.
      subject: `${iaSujet.length ? `🔴 IA : ${iaSujet.join(" · ")} — ` : ""}⚠️ FillSell ops-digest — ${total} anomalie${total > 1 ? "s" : ""} (failed ${counts.failed_24h} · stuck ${counts.stuck_processing} · delete ${counts.delete_overdue} · beebs ${counts.beebs_unavailable_7d} · iap ${counts.iap_alerts} · abo ${counts.awaiting_payment} · identify ${counts.lens_identify} · email_logs ${counts.email_log_doublons + counts.email_log_echecs} · resa ${counts.reservations_expirees} · gardes ${counts.sync_gardes_graves + counts.sync_gardes_anomalies} · dressings ${counts.dressings_croises} · pending48h ${counts.pending_bloques} · retenues ${retenuesServeurJobs} · tentatives ${counts.tentatives_en_cours} · stockage ${counts.stockage_au_dessus_du_seuil})`,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return new Response(
      JSON.stringify({ ok: false, counts, resend_error: detail }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ ok: true, sent: true, counts }), {
    headers: { "Content-Type": "application/json" },
  });
});
