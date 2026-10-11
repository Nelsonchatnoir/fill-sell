// Alerte de paiement — appelée par les trois webhooks de store (2026-07-28).
//
// Pourquoi : jusqu'ici aucun encaissement ne prévenait qui que ce soit. Le cas
// du 28/07 (pack Apple encaissé, notification jetée par le webhook) n'a été
// découvert que parce que le client a écrit — sans son mail, personne ne
// l'aurait jamais su. Un paiement qui n'aboutit pas doit se voir dans la
// minute, pas au digest du lendemain.
//
// DEUX RÈGLES QUI GOUVERNENT CE FICHIER :
//
// 1. L'envoi ne doit JAMAIS changer le code HTTP rendu au store. Tout est
//    avalé ici : réseau coupé, email-tunnel en erreur, Resend indisponible —
//    on logge et on se tait. Le 500 qui fait réessayer Apple ou Google doit
//    rester piloté par le crédit, jamais par un mail. D'où le retour void et
//    le catch total : un appelant ne peut pas, même par erreur, faire dépendre
//    sa réponse de cette fonction.
//
// 2. Pas de spam sur les rejeux — mais uniquement pour les SUCCÈS. Apple et
//    Google rejouent jusqu'à obtenir un 200 : `notifierPaiement` n'est donc à
//    appeler que lorsque la RPC a réellement créé une ligne
//    (credited === true / granted === true), jamais sur un already_credited.
//    Pour les ALERTES au contraire, on laisse passer les doublons : trois
//    mails valent mieux qu'un silence.

const TUNNEL_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-tunnel`;
// Le secret se lit dans l'environnement des fonctions (CRON_SECRET), jamais en
// clair dans le dépôt (30/09 : la valeur était sur GitHub depuis juin).
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

export type AlertePaiement = {
  ok: boolean;                 // true = crédité, false = à créditer à la main
  canal: "apple" | "google" | "stripe";
  type: "pack" | "abonnement";
  user_id?: string | null;
  email?: string | null;
  produit?: string | null;     // SKU du pack ou identifiant du plan
  montant?: string | null;     // devise du store si l'événement la porte
  pepites?: number | string | null;
  ref?: string | null;         // référence de transaction (apple:… / google:… / id Stripe)
  rpc?: unknown;               // retour BRUT de la RPC, pour créditer sans rien chercher
  erreur?: string | null;
};

async function envoyer(a: AlertePaiement): Promise<void> {
  try {
    const r = await fetch(TUNNEL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
      body: JSON.stringify({ payment_alert: a }),
    });
    if (!r.ok) {
      console.error(`[payment-notify] email-tunnel HTTP ${r.status} —`, JSON.stringify(a));
    }
  } catch (e) {
    // Le log EST le filet de dernier recours : si le mail ne part pas, la trace
    // reste dans les logs de la fonction avec tout le nécessaire pour créditer.
    console.error("[payment-notify] envoi impossible:", (e as Error)?.message, "—", JSON.stringify(a));
  }
}

/** Encaissement crédité. À n'appeler QUE si la RPC a créé une nouvelle ligne. */
export async function notifierPaiement(a: Omit<AlertePaiement, "ok">): Promise<void> {
  await envoyer({ ...a, ok: true });
}

/** Encaissement NON crédité : payload inexploitable, RPC en échec, ou
 *  notification d'achat non traitée. Les doublons sont acceptés à dessein. */
export async function alerterPaiementNonCredite(a: Omit<AlertePaiement, "ok">): Promise<void> {
  console.error("[payment-notify] PAIEMENT NON CRÉDITÉ —", JSON.stringify(a));
  await envoyer({ ...a, ok: false });
}

// ── (12/10, A8) UNE NOTIFICATION DE STORE INCONNUE : ENREGISTRÉE ET SIGNALÉE ──
// Ciddjy (07/10) : un passage Premium → Pro payé chez Apple, jeté en silence.
// Toute notification d'Apple ou de Google que la table de décision
// (_shared/notifications-stores.js) ne connaît pas part ici : une alerte à
// support@ (même canal que les paiements non crédités — rien n'a été appliqué,
// c'est à regarder) ; la ligne du journal est écrite par le webhook.
// ⛔ Ni le journal ni ce signalement ne retiennent un paiement (Nico, 11/10 :
// « l'écriture dans le journal ne doit JAMAIS bloquer le traitement d'un
// paiement ») : tout est avalé ET borné à DELAI_JOURNAL_MS — une insertion ou
// un envoi qui ne répond pas (verrou, réseau pendu) est laissé derrière, le
// paiement continue (banc : scripts/preuves/preuve-webhooks-journal.ts, mode
// « bloque »).
const DELAI_JOURNAL_MS = 2000;
function auPlus<T>(p: PromiseLike<T>, ms: number): Promise<T | "delai"> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.resolve(p),
    new Promise<"delai">((ok) => { minuteur = setTimeout(() => ok("delai"), ms); }),
  ]).finally(() => clearTimeout(minuteur));
}

export async function signalerNotificationStoreInconnue(n: {
  canal: "apple" | "google"; type: string; sous_type?: string | null;
  produit?: string | null; user_id?: string | null; ref?: string | null;
}): Promise<void> {
  const r = await auPlus(alerterPaiementNonCredite({
    canal: n.canal, type: "abonnement", user_id: n.user_id ?? null, produit: n.produit ?? null, ref: n.ref ?? null, rpc: null,
    erreur: `Notification ${n.canal === "apple" ? "Apple" : "Google Play"} INCONNUE : ${n.type}${n.sous_type ? ` / ${n.sous_type}` : ""}. `
      + "Rien n'a été appliqué au compte. Elle est enregistrée (stores_notifications_journal, connu = false) : "
      + "décider de son effet dans _shared/notifications-stores.js.",
  }), DELAI_JOURNAL_MS).catch(() => null);
  if (r === "delai") console.error("[payment-notify] signalement d'une notification inconnue : pas de réponse en 2 s, le paiement continue —", JSON.stringify(n));
}

/** (12/10, A8) Une ligne du journal des notifications — best-effort, borné, jamais bloquant. */
export async function journaliserNotificationStore(
  // deno-lint-ignore no-explicit-any
  admin: { from: (t: string) => any },
  ligne: Record<string, unknown>,
): Promise<void> {
  try {
    const r = await auPlus(admin.from("stores_notifications_journal").insert(ligne), DELAI_JOURNAL_MS);
    if (r === "delai") console.error("[payment-notify] journal des notifications : pas de réponse en 2 s, le paiement continue sans attendre —", JSON.stringify(ligne));
    else if (r?.error) console.error("[payment-notify] journal des notifications :", r.error.message, "—", JSON.stringify(ligne));
  } catch (e) {
    console.error("[payment-notify] journal des notifications impossible :", (e as Error)?.message, "—", JSON.stringify(ligne));
  }
}

// ── Paiement ÉCHOUÉ côté client (2026-08-07) ─────────────────────────────────
// Cas Matt (05/08) : 3D Secure jamais validé à la souscription, facture
// annulée par Stripe, personne n'a rien su — ni lui, ni Nico — avant une
// découverte fortuite deux jours plus tard dans le dashboard. Ce signal part
// vers email-tunnel (mode payment_failed) qui fait TROIS choses : mail au
// client (cause en clair, sans montant), alerte immédiate à Nico, et dédup
// PAR FACTURE (email_type 'payment_failed:<invoice_id>', réservation par
// INSERT avant envoi). Mêmes règles que le reste du fichier : jamais
// d'incidence sur le code HTTP rendu à Stripe, tout est avalé ici.
export type EchecPaiement = {
  user_id?: string | null;
  email?: string | null;
  lang?: string | null;
  invoice_id: string;
  cause: "3ds" | "carte_refusee" | "carte_expiree" | "autre";
  code?: string | null;        // decline_code / code brut — pour l'alerte ops
  contexte: "souscription" | "renouvellement" | "fin_essai";
  montant?: string | null;     // alerte ops SEULEMENT, jamais le mail client
  plan?: string | null;
  // (05/10) Faits relus chez Stripe (_shared/paiement-echoue.js, faitsEchec) :
  lien_facture?: string | null;      // hosted_invoice_url, facture ouverte — jamais pour une souscription
  relance_le?: string | null;        // next_payment_attempt (ISO)
  abonnement_actif?: boolean;        // renouvellement : abonnement active | past_due
  offre?: string | null;             // 'cloud' : option FillSell Cloud
};

export async function signalerPaiementEchoue(e: EchecPaiement): Promise<void> {
  try {
    const r = await fetch(TUNNEL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
      body: JSON.stringify({ payment_failed: e }),
    });
    if (!r.ok) {
      console.error(`[payment-notify] payment_failed email-tunnel HTTP ${r.status} —`, JSON.stringify(e));
    }
  } catch (err) {
    console.error("[payment-notify] payment_failed envoi impossible:", (err as Error)?.message, "—", JSON.stringify(e));
  }
}
