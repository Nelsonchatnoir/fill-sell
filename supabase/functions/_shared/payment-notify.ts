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
const CRON_SECRET = "fs-cron-2026-tunnel";

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
  contexte: "souscription" | "renouvellement";
  montant?: string | null;     // alerte ops SEULEMENT, jamais le mail client
  plan?: string | null;
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
